import { parse, type Node } from 'acorn'
import { full } from 'acorn-walk'
import { Unzip, UnzipInflate } from 'fflate'
import { parseManifest } from './manifest'
import { LIMITS, POLICY_VERSION, SCANNER_VERSION, safePath } from './model'
import type { CheckedPackage, Finding } from './model'

export function resolveModule(base: string, requested: string): string {
  if (!requested.startsWith('./') && !requested.startsWith('../')) throw new Error('外部モジュールは使用できません。')
  const parts = base.split('/').slice(0, -1)
  for (const part of requested.split('/')) {
    if (part === '.') continue
    if (part === '..') { if (!parts.length) throw new Error('パッケージ外の参照です。'); parts.pop() }
    else parts.push(part)
  }
  const path = parts.join('/')
  if (!safePath(path) || !path.endsWith('.js')) throw new Error('JavaScriptモジュールのパスが不正です。')
  return path
}

/** Check the central directory too: streaming ZIP readers alone can accept truncation/duplicates. */
function directory(data: Uint8Array): Map<string, number> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.length - 22
  while (end >= Math.max(0, data.length - 65557)) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === data.length) break
    end--
  }
  if (end < 0 || end < data.length - 65557) throw new Error('ZIP終端が見つかりません。')
  const count = view.getUint16(end + 10, true)
  let pos = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true)
    || count > LIMITS.files || pos + view.getUint32(end + 12, true) !== end) throw new Error('未対応のZIP構造です。')
  const files = new Map<string, number>()
  let total = 0
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIPディレクトリが不正です。')
    const length = view.getUint16(pos + 28, true)
    const next = pos + 46 + length + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true)
    if (next > end) throw new Error('ZIPディレクトリが不正です。')
    const name = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(pos + 46, pos + 46 + length))
    const size = view.getUint32(pos + 24, true)
    const mode = (view.getUint32(pos + 38, true) >>> 16) & 0xf000
    const method = view.getUint16(pos + 10, true)
    const flags = view.getUint16(pos + 8, true)
    const local = view.getUint32(pos + 42, true)
    if (!safePath(name) || !/\.(js|json|txt|md)$/.test(name) || files.has(name) || size > LIMITS.file
      || (mode !== 0 && mode !== 0x8000) || (flags & 1) || ![0, 8].includes(method)
      || local + 30 > pos || view.getUint32(local, true) !== 0x04034b50) throw new Error('禁止形式・重複・不正パスを含むZIPです。')
    const localNameLength = view.getUint16(local + 26, true)
    const localName = new TextDecoder().decode(data.subarray(local + 30, local + 30 + localNameLength))
    if (localName !== name || view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags) throw new Error('ZIPヘッダーが一致しません。')
    files.set(name, size)
    total += size
    if (total > LIMITS.expanded) throw new Error('ZIPの展開量が上限を超えています。')
    pos = next
  }
  if (pos !== end || !files.has('extension.json')) throw new Error('extension.jsonが必要です。')
  return files
}

function unpack(data: Uint8Array): Record<string, string> {
  const expected = directory(data)
  const files: Record<string, string> = Object.create(null)
  const seen = new Set<string>()
  let total = 0
  const unzip = new Unzip(file => {
    if (!expected.has(file.name) || seen.has(file.name)) throw new Error('ZIP内容がディレクトリと一致しません。')
    seen.add(file.name)
    const chunks: Uint8Array[] = []
    let size = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      size += chunk.length
      total += chunk.length
      if (size > LIMITS.file || total > LIMITS.expanded || size > expected.get(file.name)!) throw new Error('ZIPの展開量が上限を超えています。')
      chunks.push(chunk)
      if (final) {
        if (size !== expected.get(file.name)) throw new Error('ZIPサイズが一致しません。')
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) { bytes.set(part, offset); offset += part.length }
        files[file.name] = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Bound each decompression allocation, even when ZIP size metadata is dishonest.
  for (let i = 0; i < data.length; i += 1024) unzip.push(data.subarray(i, i + 1024), i + 1024 >= data.length)
  if (Object.keys(files).length !== expected.size) throw new Error('ZIPが途中で切れています。')
  return files
}

export function scanJavaScript(source: string, file: string, paths: Set<string>): Finding[] {
  const findings: Finding[] = []
  const add = (node: Node, rule: string, severity: Finding['severity'], message: string) => {
    if (findings.length < 100 || (severity === 'block' && !findings.some(f => f.severity === 'block'))) findings.push({ rule, severity, message, file, line: node.loc?.start.line, column: node.loc ? node.loc.start.column + 1 : undefined })
  }
  try {
    const ast = parse(source, { ecmaVersion: 2023, sourceType: 'module', locations: true })
    full(ast, node => {
      const n = node as Node & { source?: { value?: unknown }; callee?: { type: string; name?: string; property?: { name?: string; value?: unknown } } }
      if (node.type === 'MemberExpression') {
        const member = node as Node & { object: { type: string; name?: string }; property: { name?: string; value?: unknown } }
        if (['localStorage', 'sessionStorage', 'indexedDB', 'document', 'window', '__TAURI_INTERNALS__'].includes(String(member.object.name))
          || (member.object.name === 'globalThis' && ['localStorage', 'indexedDB', 'document', '__TAURI_INTERNALS__'].includes(String(member.property.name ?? member.property.value)))) {
          add(node, 'host-storage', 'warning', '本体のDOM・保存領域・ネイティブ機能にアクセスする処理があります。SDKの専用APIを使用してください。')
        }
      }
      if (node.type === 'ImportExpression') add(node, 'dynamic-import', 'block', '動的importは使用できません。同梱の静的importを使用してください。')
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && n.source) {
        try {
          if (typeof n.source.value !== 'string' || !paths.has(resolveModule(file, n.source.value))) throw new Error()
        } catch { add(node, 'module-path', 'block', '外部または存在しないモジュールへの参照です。') }
      }
      if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        const name = n.callee?.type === 'Identifier' ? n.callee.name : n.callee?.property?.name ?? n.callee?.property?.value
        if (['eval', 'Function'].includes(String(name))) add(node, 'dynamic-code', 'warning', '動的にコードを生成する処理があります。内容を確認してください。')
        if (['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'importScripts', 'sendBeacon', 'invoke'].includes(String(name))) {
          // SDK network.fetch is explicitly permitted and checked by the broker at runtime.
          const start = source.slice(node.start, n.callee ? node.start + 40 : node.start)
          if (!/^[\w$.]+\.network\.fetch\s*\(/.test(start)) add(node, 'host-access', 'warning', 'SDKを介さない通信・ホスト機能の呼び出しの可能性があります。')
        }
      }
    })
  } catch {
    findings.push({ rule: 'syntax', severity: 'block', message: 'JavaScriptを解析できません。対応構文はES2023です。', file })
  }
  return findings
}

export async function inspectPackage(archive: Uint8Array): Promise<CheckedPackage> {
  const findings: Finding[] = []
  let files: Record<string, string> = Object.create(null)
  let manifest: CheckedPackage['manifest'] = null
  let packageHash = ''
  try {
    if (archive.byteLength > LIMITS.archive) throw new Error('パッケージは5MiB以下にしてください。')
    const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(archive).buffer)
    packageHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
    files = unpack(archive)
    manifest = parseManifest(JSON.parse(files['extension.json']))
    if (!(manifest.entry in files)) throw new Error('エントリファイルがありません。')
    const paths = new Set(Object.keys(files))
    for (const [path, source] of Object.entries(files)) if (path.endsWith('.js')) findings.push(...scanJavaScript(source, path, paths))
  } catch (error) {
    findings.push({ rule: 'package', severity: 'block', message: error instanceof Error && error.message.startsWith('ZIP') ? error.message : 'パッケージの形式・容量・宣言を確認してください。' })
  }
  const outcome = findings.some(f => f.severity === 'block') ? 'blocked' : findings.length ? 'review-required' : 'no-findings'
  return { manifest, files, report: { packageHash, scannerVersion: SCANNER_VERSION, policyVersion: POLICY_VERSION, findings, outcome } }
}
