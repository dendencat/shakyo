// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { ExtensionManager, type HostAdapters } from './manager'
import { inspectPackage } from './preflight'
import type { ExtensionRepository } from './repository'
import type { InstalledExtension } from './model'

class WorkerMock {
  static all: WorkerMock[] = []
  onmessage?: (event: { data: unknown }) => void
  onerror?: () => void
  messages: Record<string, unknown>[] = []
  terminated = false
  constructor() { WorkerMock.all.push(this) }
  postMessage(data: Record<string, unknown>) {
    this.messages.push(data)
    if (data.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }))
    if (data.type === 'run') queueMicrotask(() => this.onmessage?.({ data: { type: 'done', id: data.id, ok: true } }))
  }
  request(id: number, method: string, args: unknown = null) { this.onmessage?.({ data: { type: 'rpc', id, method, args } }) }
  terminate() { this.terminated = true }
}
function memoryRepository(): ExtensionRepository {
  const rows = new Map<string, InstalledExtension>()
  return {
    list: async () => structuredClone([...rows.values()]), get: async id => structuredClone(rows.get(id)),
    replace: async row => { rows.set(row.instanceId, structuredClone(row)) }, remove: async id => { rows.delete(id) },
    modify: async (id, hash, fn, requireEnabled = true) => {
      const row = structuredClone(rows.get(id))
      if (!row || (requireEnabled && !row.enabled) || row.report.packageHash !== hash) throw new Error('revoked')
      fn(row); rows.set(id, row)
    },
  }
}
const manifest = { manifestVersion: 1, apiVersion: 1, id: 'test.manager', name: '検証', version: '1.0.0', entry: 'main.js', permissions: { editor: [], reference: ['write'], network: [] }, contributes: { commands: [{ id: 'test.manager.run', title: '実行' }], settings: {} } }
async function setup() {
  WorkerMock.all = []; vi.stubGlobal('Worker', WorkerMock); vi.stubGlobal('BroadcastChannel', undefined)
  const archive = zipSync({ 'extension.json': strToU8(JSON.stringify(manifest)), 'main.js': strToU8('export function activate() {}') })
  const checked = await inspectPackage(archive)
  const repo = memoryRepository()
  const manager = new ExtensionManager(repo, inspectPackage)
  const host: HostAdapters = { getEditor: vi.fn(), applyEdits: vi.fn(), getReference: vi.fn(), openText: vi.fn(), openUrl: vi.fn(), ui: vi.fn(async () => true) }
  manager.setHost(host)
  await manager.load()
  await manager.install(archive, checked.report.packageHash)
  const id = manager.snapshot()[0].item.instanceId
  await manager.run(id, 'test.manager.run')
  return { manager, repo, host, id, worker: WorkerMock.all[0], archive, checked }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10))
afterEach(() => vi.unstubAllGlobals())
describe('extension host authority and lifecycle', () => {
  it('denies ungranted APIs, unknown host commands, and main settings', async () => {
    const { manager, worker, host } = await setup()
    try {
      worker.request(1, 'editor.getSnapshot')
      worker.request(2, 'settings.get', 'apiKey')
      worker.request(3, 'tauri.invoke', { extensionId: 'main' })
      await tick()
      expect(worker.messages.filter(m => m.type === 'reply').map(m => m.ok)).toEqual([false, false, false])
      expect(host.getEditor).not.toHaveBeenCalled()
    } finally { manager.dispose() }
  })
  it('discards a pending URL confirmation after disable and aborts its signal', async () => {
    const { manager, worker, host, id } = await setup()
    let complete!: (value: boolean) => void
    let signal: AbortSignal | undefined
    host.ui = vi.fn((_owner, _kind, _message, _options, passedSignal) => {
      signal = passedSignal
      return new Promise<boolean>(resolve => { complete = resolve })
    })
    worker.request(1, 'reference.openUrl', 'https://example.com/')
    await tick()
    await manager.enable(id, false)
    expect(signal?.aborted).toBe(true)
    complete(true); await tick()
    expect(host.openUrl).not.toHaveBeenCalled()
    manager.dispose()
  })
  it('requires explicit replacement and a matching inspection hash', async () => {
    const { manager, archive, checked } = await setup()
    try {
      await expect(manager.install(archive, checked.report.packageHash)).rejects.toThrow('置き換え')
      await expect(manager.install(archive, 'wrong')).rejects.toThrow('一致')
      expect(manager.snapshot()).toHaveLength(1)
    } finally { manager.dispose() }
  })
  it('quarantines policy changes and altered archives instead of silently enabling', async () => {
    const { manager, repo, id } = await setup()
    const row = (await repo.get(id))!
    row.report.policyVersion = 'older'
    await repo.replace(row); await manager.load()
    expect(manager.snapshot()[0].status).toBe('blocked')
    await expect(manager.enable(id, true)).rejects.toThrow('再インポート')
    manager.dispose()
  })
  it('only writes to its own storage and rejects prototype keys', async () => {
    const { manager, worker, repo, id } = await setup()
    try {
      worker.request(1, 'storage.set', { key: 'own', value: 'value', extensionId: 'other' })
      worker.request(2, 'storage.set', { key: '__proto__', value: {} })
      await tick()
      expect((await repo.get(id))!.data).toEqual({ own: 'value' })
      expect(worker.messages.find(m => m.type === 'reply' && m.id === 2)?.ok).toBe(false)
    } finally { manager.dispose() }
  })
})
