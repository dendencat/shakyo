// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { newQuickJSWASMModule } from 'quickjs-emscripten'
import { Sandbox } from './sandbox'
import { parseManifest } from './manifest'

const manifest = parseManifest({ manifestVersion: 1, apiVersion: 1, id: 'test.vm', name: 'VM', version: '1.0.0', entry: 'main.js', permissions: { editor: [], reference: [], network: [] }, contributes: { commands: [{ id: 'test.vm.run', title: '実行' }], settings: {} } })
describe('real QuickJS sandbox', () => {
  it('executes package modules and asynchronous SDK responses without exposing host globals', async () => {
    const messages: Record<string, unknown>[] = []
    const module = await newQuickJSWASMModule()
    let sandbox: Sandbox
    sandbox = new Sandbox(module, manifest, {
      'main.js': `import { suffix } from './lib.js'; export function activate(ctx) { ctx.commands.register('test.vm.run', async () => { const value = await ctx.storage.get('key'); await ctx.storage.set('result', [value + suffix, typeof window, typeof fetch, typeof indexedDB, typeof localStorage, typeof __TAURI_INTERNALS__, Function('return typeof process')()]); }); }`,
      'lib.js': 'export const suffix = "!";',
    }, value => {
      const msg = value as Record<string, unknown>
      messages.push(msg)
      if (msg.type === 'rpc') queueMicrotask(() => sandbox.deliver(msg.id as number, true, msg.method === 'storage.get' ? 'hello' : null))
    })
    try {
      sandbox.dispatch(1, 'activate')
      sandbox.dispatch(2, 'command', 'test.vm.run')
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(messages.find(m => m.method === 'storage.set')?.args).toEqual({ key: 'result', value: ['hello!', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined'] })
      expect(messages).toContainEqual({ type: 'done', id: 2, ok: true })
    } finally { sandbox.dispose() }
  })
  it('interrupts an infinite loop', async () => {
    const module = await newQuickJSWASMModule()
    expect(() => new Sandbox(module, manifest, { 'main.js': 'while (true) {}' }, () => {})).toThrow('実行')
  })
  it('bounds messages before they enter the host worker queue', async () => {
    const messages: unknown[] = []
    const vm = new Sandbox(await newQuickJSWASMModule(), manifest, {
      'main.js': `for (let i = 0; i < 1000; i++) { try { __send('{"type":"done","id":0,"ok":true}'); } catch {} } export function activate() {}`,
    }, value => messages.push(value))
    try { expect(messages).toHaveLength(100) } finally { vm.dispose() }
  })
  it('cannot import ambient modules or mutate a different sandbox', async () => {
    const module = await newQuickJSWASMModule()
    expect(() => new Sandbox(module, manifest, { 'main.js': 'import "node:fs";' }, () => {})).toThrow()
    const out: unknown[] = []
    const vm = new Sandbox(await newQuickJSWASMModule(), manifest, { 'main.js': 'export function activate(ctx) { ctx.commands.register("test.vm.run", () => ctx.ui.notify(typeof process)); }' }, value => out.push(value))
    vm.dispatch(1, 'activate'); vm.dispatch(2, 'command', 'test.vm.run')
    expect(out).toContainEqual(expect.objectContaining({ type: 'rpc', method: 'ui.notify', args: 'undefined' }))
    vm.dispose()
  })
})
