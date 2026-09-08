// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { inspectPackage, scanJavaScript } from './preflight'
import { parseManifest } from './manifest'

export const manifest = {
  manifestVersion: 1, apiVersion: 1, id: 'test.tools', name: '検証用', version: '1.0.0', entry: 'main.js',
  permissions: { editor: ['read', 'write'], reference: ['read', 'write'], network: [] },
  contributes: { commands: [{ id: 'test.tools.run', title: '実行' }], settings: {} },
}
const archive = (files: Record<string, string>, extra = {}) => zipSync(Object.fromEntries(Object.entries({ 'extension.json': JSON.stringify({ ...manifest, ...extra }), ...files }).map(([k, v]) => [k, strToU8(v)])))
describe('preflight', () => {
  it('never executes guest code, hashes exactly the inspected bytes, and detects changed content', async () => {
    const a = await inspectPackage(archive({ 'main.js': 'export function activate() { throw new Error("not run") }' }))
    const b = await inspectPackage(archive({ 'main.js': 'export function activate() {}' }))
    expect(a.report.outcome).toBe('no-findings')
    expect(a.report.packageHash).toMatch(/^[a-f0-9]{64}$/)
    expect(b.report.packageHash).not.toBe(a.report.packageHash)
  })
  it('accepts contained static imports and does not treat comments or strings as calls', async () => {
    const result = await inspectPackage(archive({ 'main.js': 'import { f } from "./lib/util.js"; // eval("x")\nexport const activate = f;', 'lib/util.js': 'export function f() { return "fetch(1)" }' }))
    expect(result.report.outcome).toBe('no-findings')
  })
  it.each(['../escape.js', '/root.js', 'a/../../bad.js', 'payload.wasm'])('rejects forbidden entry %s', async path => {
    const result = await inspectPackage(archive({ 'main.js': 'export function activate() {}', [path]: 'no' }))
    expect(result.report.outcome).toBe('blocked')
  })
  it.each(['import "https://example.com/x.js";', 'import("./main.js");', 'import "./missing.js";', 'export { x } from "../escape.js";'])('blocks unsupported module %s', async code => {
    expect((await inspectPackage(archive({ 'main.js': code }))).report.outcome).toBe('blocked')
  })
  it('rejects truncation and false size metadata before execution', async () => {
    const data = archive({ 'main.js': 'export function activate() {}' })
    expect((await inspectPackage(data.subarray(0, data.length - 3))).report.outcome).toBe('blocked')
    const fake = data.slice()
    const view = new DataView(fake.buffer)
    for (let i = 0; i < fake.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 0, true)
    expect((await inspectPackage(fake)).report.outcome).toBe('blocked')
  })
  it('warns on dynamic code with file/line but without including source or secret values', () => {
    const warnings = scanJavaScript('export function activate() {\n eval("secret value")\n}', 'main.js', new Set(['main.js']))
    expect(warnings[0]).toMatchObject({ rule: 'dynamic-code', severity: 'warning', file: 'main.js', line: 2 })
    expect(JSON.stringify(warnings)).not.toContain('secret value')
  })
  it('blocks syntax errors and incompatible permissions/API', async () => {
    expect((await inspectPackage(archive({ 'main.js': 'export {' }))).report.outcome).toBe('blocked')
    expect(() => parseManifest({ ...manifest, apiVersion: 2 })).toThrow()
    expect(() => parseManifest({ ...manifest, permissions: { ...manifest.permissions, native: true } })).toThrow()
    expect(() => parseManifest({ ...manifest, permissions: { ...manifest.permissions, network: ['https://example.com/path'] } })).toThrow()
  })
  it('does not hide a blocking finding after many warnings', () => {
    const findings = scanJavaScript('eval("0");'.repeat(150) + 'import("./main.js")', 'main.js', new Set(['main.js']))
    expect(findings.some(f => f.rule === 'dynamic-import' && f.severity === 'block')).toBe(true)
    expect(findings.length).toBeLessThanOrEqual(101)
  })
})
