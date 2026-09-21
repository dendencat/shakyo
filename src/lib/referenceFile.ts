import { unzip } from 'fflate'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'

export const MAX_TEXT_REFERENCE_BYTES = 500_000
export const MAX_BINARY_REFERENCE_BYTES = 100 * 1024 * 1024
export const MAX_EPUB_REFERENCE_BYTES = 50 * 1024 * 1024
export const MAX_EPUB_EXPANDED_BYTES = 128 * 1024 * 1024
export const MAX_EPUB_ENTRIES = 2_000

const CODE_EXTENSIONS = [
  'ts', 'mts', 'cts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'py', 'rs', 'go', 'java', 'kt', 'kts',
  'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'cs', 'rb', 'php', 'sql', 'html', 'htm', 'css',
  'json', 'yml', 'yaml', 'md', 'markdown', 'sh', 'bash', 'zsh',
] as const
const DOCUMENT_EXTENSIONS = ['txt', 'pdf', 'epub', 'xml', 'csv', 'toml', 'ini'] as const
const ALLOWED_EXTENSIONS = new Set<string>([...CODE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])
const ALLOWED_EXTENSIONLESS_NAMES = new Set([
  'makefile', 'dockerfile', 'jenkinsfile', 'gemfile', 'rakefile', 'procfile', 'cmakelists.txt',
])

export const REFERENCE_FILE_ACCEPT = [...ALLOWED_EXTENSIONS].map(extension => `.${extension}`).join(',')

const TEXT_REFERENCE_TOO_LARGE_MESSAGE =
  'テキストファイルが大きすぎます。500 KB以下のファイルを選択してください。'
const PDF_REFERENCE_TOO_LARGE_MESSAGE = 'PDFファイルが大きすぎます。100 MiB以下のファイルを選択してください。'
const EPUB_REFERENCE_TOO_LARGE_MESSAGE = 'EPUBファイルが大きすぎます。50 MiB以下のファイルを選択してください。'

type TextReferenceFile = Pick<File, 'size' | 'text'>
type ReferenceFile = Pick<File, 'name' | 'size' | 'text' | 'arrayBuffer'>

export type LoadedReferenceFile =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; data: ArrayBuffer }
  | { kind: 'epub'; data: ArrayBuffer }

export function isAllowedReferenceFileName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  if (ALLOWED_EXTENSIONLESS_NAMES.has(normalized)) return true
  const dot = normalized.lastIndexOf('.')
  return dot > 0 && ALLOWED_EXTENSIONS.has(normalized.slice(dot + 1))
}

export async function readTextReferenceFile(file: TextReferenceFile): Promise<string> {
  if (file.size > MAX_TEXT_REFERENCE_BYTES) {
    throw new Error(TEXT_REFERENCE_TOO_LARGE_MESSAGE)
  }
  return file.text()
}

export async function readReferenceFile(file: ReferenceFile): Promise<LoadedReferenceFile> {
  if (!isAllowedReferenceFileName(file.name)) {
    throw new Error('この形式のファイルは開けません。対応しているコード、テキスト、PDF、EPUBを選択してください。')
  }

  const extension = file.name.toLowerCase().split('.').pop()
  if (extension !== 'pdf' && extension !== 'epub') {
    return { kind: 'text', text: await readTextReferenceFile(file) }
  }
  const maxBytes = extension === 'epub' ? MAX_EPUB_REFERENCE_BYTES : MAX_BINARY_REFERENCE_BYTES
  const tooLargeMessage = extension === 'epub' ? EPUB_REFERENCE_TOO_LARGE_MESSAGE : PDF_REFERENCE_TOO_LARGE_MESSAGE
  if (file.size > maxBytes) throw new Error(tooLargeMessage)

  let data = await file.arrayBuffer()
  if (data.byteLength > maxBytes) throw new Error(tooLargeMessage)
  if (extension === 'pdf') {
    assertPdfFile(data)
    return { kind: 'pdf', data }
  }
  data = await validateEpubOffMainThread(data)
  return { kind: 'epub', data }
}

async function validateEpubOffMainThread(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof Worker === 'undefined') {
    await assertSafeEpubFile(data)
    return data
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./epubValidation.worker.ts', import.meta.url), { type: 'module' })
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('EPUBの安全性確認がタイムアウトしました。'))
    }, 30_000)
    const finish = () => {
      clearTimeout(timeout)
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<{ ok: true; data: ArrayBuffer } | { ok: false; error: string }>) => {
      finish()
      if (event.data.ok) resolve(event.data.data)
      else reject(new Error(event.data.error))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('EPUBの安全性を確認できませんでした。'))
    }
    // 所有権をworkerへ移し、検証後に戻すことで最大50 MiBの不要なコピーを避ける。
    worker.postMessage(data, [data])
  })
}

export function assertPdfFile(data: ArrayBuffer): void {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 5))
  if (bytes.length < 5 || String.fromCharCode(...bytes) !== '%PDF-') {
    throw new Error('PDFの内容を確認できませんでした。正しいPDFファイルを選択してください。')
  }
}

type ZipEntry = { name: string; compressedSize: number; expandedSize: number }

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557)
  for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return -1
}

function isUnsafeArchivePath(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)) return true
  const parts = name.replace(/\/$/, '').split('/')
  return parts.some(part => part === '' || part === '.' || part === '..')
}

/** ZIPの中央ディレクトリだけを読み、展開前にサイズ・件数・暗号化・パスを検査する。 */
export function inspectEpubArchive(data: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(data)
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('EPUBの内容を確認できませんでした。正しいEPUBファイルを選択してください。')
  }
  const view = new DataView(data)
  const endOffset = findEndOfCentralDirectory(view)
  if (endOffset < 0) throw new Error('EPUBのZIP構造が壊れています。')

  const disk = view.getUint16(endOffset + 4, true)
  const centralDisk = view.getUint16(endOffset + 6, true)
  const entriesOnDisk = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('複数ディスクまたはZIP64形式のEPUBには対応していません。')
  }
  if (entryCount > MAX_EPUB_ENTRIES) throw new Error(`EPUB内のファイル数が上限（${MAX_EPUB_ENTRIES}件）を超えています。`)
  if (centralOffset + centralSize > endOffset) throw new Error('EPUBのZIP構造が壊れています。')

  const decoder = new TextDecoder('utf-8', { fatal: true })
  const names = new Set<string>()
  const entries: ZipEntry[] = []
  let expandedTotal = 0
  let offset = centralOffset
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('EPUBのZIP構造が壊れています。')
    }
    const flags = view.getUint16(offset + 8, true)
    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const expandedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const externalAttributes = view.getUint32(offset + 38, true)
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength
    if (nextOffset > endOffset || compressedSize === 0xffffffff || expandedSize === 0xffffffff) {
      throw new Error('EPUBのZIP構造が壊れています。')
    }
    let name: string
    try {
      name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).normalize('NFC')
    } catch {
      throw new Error('EPUB内のファイル名をUTF-8として読み取れません。')
    }
    if ((flags & 0x1) !== 0) throw new Error('暗号化されたEPUBには対応していません。')
    if (compression !== 0 && compression !== 8) throw new Error('EPUBに未対応の圧縮方式が含まれています。')
    if (isUnsafeArchivePath(name)) throw new Error('EPUB内に安全でないファイルパスが含まれています。')
    if (names.has(name)) throw new Error('EPUB内に重複したファイル名が含まれています。')
    if (((externalAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('EPUB内のシンボリックリンクには対応していません。')
    names.add(name)
    expandedTotal += expandedSize
    if (!Number.isSafeInteger(expandedTotal) || expandedTotal > MAX_EPUB_EXPANDED_BYTES) {
      throw new Error('EPUBの展開後サイズが上限（128 MiB）を超えています。')
    }
    entries.push({ name, compressedSize, expandedSize })
    offset = nextOffset
  }
  if (offset !== centralOffset + centralSize) throw new Error('EPUBのZIP構造が壊れています。')
  return entries
}

function decodeArchiveText(files: Record<string, Uint8Array>, path: string, label: string): string {
  const value = files[path]
  if (!value) throw new Error(`EPUBに${label}がありません。`)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch {
    throw new Error(`EPUBの${label}をUTF-8として読み取れません。`)
  }
}

function resolveArchivePath(basePath: string, relativePath: string): string {
  const result = basePath.split('/').slice(0, -1)
  for (const part of relativePath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') result.pop()
    else result.push(part)
  }
  return result.join('/')
}

function assertNoExternalResources(files: Record<string, Uint8Array>): void {
  const markupExtensions = /\.(?:xhtml|html?|svg|xml)$/i
  const cssExtension = /\.css$/i
  const decoder = new TextDecoder('utf-8')
  const externalUrl = /^(?:(?:https?):|\/\/)/i
  for (const [name, bytes] of Object.entries(files)) {
    if (!markupExtensions.test(name) && !cssExtension.test(name)) continue
    const text = decoder.decode(bytes)
    const externalCss = /(?:@import\s+(?:url\()?\s*['"]?\s*https?:|url\(\s*['"]?\s*(?:https?:)?\/\/)/i
    const externalResourceAttribute = /\b(?:src|srcset|poster|data|action|formaction)\s*=\s*['"]\s*(?:https?:)?\/\//i
    const externalLinkedResource = /<(?:link|item|image|use)\b[^>]*\bhref\s*=\s*['"]\s*(?:https?:)?\/\//i
    if (externalCss.test(text) || externalResourceAttribute.test(text) || externalLinkedResource.test(text)) {
      throw new Error('外部通信を必要とするリソースを含むEPUBは安全のため開けません。')
    }
    // DOMParserは数値・名前付き文字参照を復号するため、正規表現だけでは見落とす
    // `&#x68;ttps://...` のようなURLもiframeへ渡す前に拒否できる。
    if (!cssExtension.test(name)) {
      const document = new XmlDomParser({ errorHandler: () => {} }).parseFromString(text, 'application/xml')
      const elements = document.getElementsByTagName('*')
      for (let index = 0; index < elements.length; index++) {
        const element = elements.item(index)
        if (!element) continue
        for (const attribute of ['href', 'src', 'poster', 'data', 'action', 'formaction', 'xlink:href']) {
          const value = element.getAttribute(attribute)?.trim()
          if (value && externalUrl.test(value)) {
            throw new Error('外部通信を必要とするリソースを含むEPUBは安全のため開けません。')
          }
        }
        const srcset = element.getAttribute('srcset')
        if (srcset?.split(',').some(candidate => externalUrl.test(candidate.trim().split(/\s+/)[0] ?? ''))) {
          throw new Error('外部通信を必要とするリソースを含むEPUBは安全のため開けません。')
        }
        const style = element.getAttribute('style')
        if (style && externalCss.test(style)) {
          throw new Error('外部通信を必要とするリソースを含むEPUBは安全のため開けません。')
        }
      }
    }
  }
}

function unzipArchive(data: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(data), (error, files) => {
      if (error) reject(error)
      else resolve(files)
    })
  })
}

export function hasFixedLayoutMetadata(text: string): boolean {
  const document = new XmlDomParser({ errorHandler: () => {} }).parseFromString(text, 'application/xml')
  const elements = document.getElementsByTagName('*')
  for (let index = 0; index < elements.length; index++) {
    const element = elements.item(index)
    if (!element) continue
    const localName = (element.localName || element.nodeName).toLowerCase()
    if (localName === 'meta') {
      const meta = element
      const property = meta.getAttribute('property')?.trim().toLowerCase() ?? ''
      const name = meta.getAttribute('name')?.trim().toLowerCase() ?? ''
      const value = (meta.getAttribute('content') || meta.textContent || '').trim().toLowerCase()
      if (property.split(/\s+/).includes('rendition:layout') && value === 'pre-paginated') return true
      if (name === 'fixed-layout' && value === 'true') return true
      if (name === 'book-type' && (value === 'comic' || value === 'manga')) return true
    }
    if (localName === 'option'
      && element.getAttribute('name')?.trim().toLowerCase() === 'fixed-layout'
      && element.textContent?.trim().toLowerCase() === 'true') {
      return true
    }
  }
  return false
}

export async function assertSafeEpubFile(data: ArrayBuffer): Promise<void> {
  inspectEpubArchive(data)
  let files: Record<string, Uint8Array>
  try {
    // fflateの非同期APIは大きなdeflate entryをWorkerで展開し、UIスレッドの停止を避ける。
    files = await unzipArchive(data)
  } catch {
    throw new Error('EPUBを展開できませんでした。ファイルが破損している可能性があります。')
  }

  const mimetype = decodeArchiveText(files, 'mimetype', 'mimetype').trim()
  if (mimetype !== 'application/epub+zip') throw new Error('EPUBのmimetypeが正しくありません。')
  if (files['META-INF/encryption.xml']) throw new Error('DRMまたは暗号化されたEPUBには対応していません。')

  const container = decodeArchiveText(files, 'META-INF/container.xml', 'container.xml')
  const rootfile = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(container)?.[1]
  if (!rootfile) throw new Error('EPUBの本文定義が見つかりません。')
  if (isUnsafeArchivePath(rootfile)) throw new Error('EPUBの本文定義パスが安全ではありません。')
  // container.xmlのfull-pathはcontainer.xml相対ではなく、EPUBアーカイブのルート相対。
  const packagePath = resolveArchivePath('', rootfile)
  if (isUnsafeArchivePath(packagePath)) throw new Error('EPUBの本文定義パスが安全ではありません。')
  const packageDocument = decodeArchiveText(files, packagePath, 'パッケージ文書')
  const displayOptions = Object.entries(files)
    .filter(([name]) => /(?:^|\/)com\.apple\.ibooks\.display-options\.xml$/i.test(name))
    .map(([name]) => decodeArchiveText(files, name, '表示設定'))
  if (hasFixedLayoutMetadata(packageDocument) || displayOptions.some(hasFixedLayoutMetadata)) {
    throw new Error('固定レイアウトまたは漫画形式のEPUBには対応していません。')
  }
  assertNoExternalResources(files)
}
