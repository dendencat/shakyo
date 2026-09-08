import type { EditorSnapshot, Json, ReferenceSnapshot, TextEdit } from './api'
import { inspectInWorker } from './inspect'
import { ExtensionSession } from './session'
import { repository, type ExtensionRepository } from './repository'
import { extensionFetch } from './network'
import { LIMITS, POLICY_VERSION, SCANNER_VERSION, httpsUrl, jsonCopy, record, safeKey, safePath } from './model'
import type { CheckedPackage, InstalledExtension } from './model'

export type UiKind = 'notify' | 'confirm' | 'input' | 'select'
export interface HostAdapters {
  getEditor(): EditorSnapshot
  applyEdits(input: { expectedRevision: number; edits: TextEdit[] }): void
  getReference(): ReferenceSnapshot
  openText(input: { name: string; text: string; language?: string }): void
  openUrl(url: string): void
  ui(owner: string, kind: UiKind, message: string, options: string[], signal: AbortSignal): Promise<Json>
}
export interface ExtensionView {
  item: InstalledExtension
  status: 'disabled' | 'inactive' | 'active' | 'error' | 'blocked'
}
type Running = { session: ExtensionSession; activation: Promise<void>; events: Set<string>; busy: boolean }

export class ExtensionManager {
  private views: ExtensionView[] = []
  private packages = new Map<string, CheckedPackage>()
  private running = new Map<string, Running>()
  private listeners = new Set<() => void>()
  private generation = 0
  private channel?: BroadcastChannel
  private host?: HostAdapters
  private mutation = false
  private repo: ExtensionRepository
  private inspect: typeof inspectInWorker
  constructor(repo: ExtensionRepository = repository, inspect = inspectInWorker) { this.repo = repo; this.inspect = inspect }
  setHost(host: HostAdapters) { this.host = host }
  snapshot = () => this.views
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed() { this.views = [...this.views]; this.listeners.forEach(fn => fn()) }
  private status(id: string, status: ExtensionView['status']) {
    this.views = this.views.map(row => row.item.instanceId === id ? { ...row, status } : row)
    this.changed()
  }
  private stop(id: string) {
    const session = this.running.get(id)?.session
    this.running.delete(id)
    session?.retire()
  }
  dispose() {
    this.generation++
    for (const id of this.running.keys()) this.stop(id)
    this.channel?.close(); this.channel = undefined
  }
  async load() {
    this.dispose()
    const generation = this.generation
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('shakyo-extension-lifecycle')
      this.channel.onmessage = () => { void this.load().catch(() => {}) }
    }
    const rows = await this.repo.list()
    const checkedRows: ExtensionView[] = []
    const packages = new Map<string, CheckedPackage>()
    // Sequential scanning avoids one worker per installed extension on startup.
    for (const row of rows) {
      if (generation !== this.generation) return
      let checked: CheckedPackage | undefined
      try { checked = await this.inspect(row.archive) } catch { /* Fail closed; keep package for explicit removal/reimport. */ }
      const valid = checked?.manifest && checked.report.outcome !== 'blocked'
        && checked.report.packageHash === row.report.packageHash
        && row.report.scannerVersion === SCANNER_VERSION && row.report.policyVersion === POLICY_VERSION
        && JSON.stringify(checked.manifest) === JSON.stringify(row.manifest)
      checkedRows.push({ item: row, status: valid ? (row.enabled ? 'inactive' : 'disabled') : 'blocked' })
      if (valid && checked) packages.set(row.instanceId, checked)
    }
    if (generation !== this.generation) return
    this.views = checkedRows; this.packages = packages; this.changed()
    for (const row of checkedRows) {
      if (row.item.enabled && row.status === 'inactive' && row.item.manifest.activation === 'startup') {
        void this.activate(row.item.instanceId).catch(() => {})
      }
    }
  }
  async install(archive: Uint8Array, expectedHash: string, replaceId?: string) {
    if (this.mutation) throw new Error('別の更新処理が進行中です。')
    this.mutation = true
    try {
      const bytes = Uint8Array.from(archive)
      const checked = await this.inspect(bytes)
      if (!checked.manifest || checked.report.outcome === 'blocked' || checked.report.packageHash !== expectedHash) throw new Error('検査した内容と一致しません。再検査してください。')
      const rows = await this.repo.list()
      const previous = rows.find(row => row.manifest.id === checked.manifest!.id)
      if ((previous?.instanceId ?? undefined) !== replaceId) throw new Error('同じIDの拡張があります。置き換えを確認してください。')
      if (previous) this.stop(previous.instanceId)
      // Preservation is only after the UI explicitly approves replacement of this instance.
      const settings: Record<string, Json> = Object.create(null)
      for (const [key, def] of Object.entries(checked.manifest.contributes.settings)) settings[key] = def.default
      const row: InstalledExtension = {
        instanceId: previous?.instanceId ?? crypto.randomUUID(), archive: bytes, manifest: checked.manifest,
        report: checked.report, enabled: true, settings, data: previous?.data ?? {},
      }
      if (previous) {
        await this.repo.modify(previous.instanceId, previous.report.packageHash, current => {
          // Keep the latest committed data, including writes racing with inspection.
          Object.assign(current, row, { data: current.data })
        }, false)
      } else await this.repo.replace(row)
      this.channel?.postMessage('changed')
      await this.load()
    } finally { this.mutation = false }
  }
  async enable(id: string, enabled: boolean) {
    const view = this.views.find(row => row.item.instanceId === id)
    if (!view || (enabled && view.status === 'blocked')) throw new Error('再インポートして検査・権限を確認してください。')
    this.stop(id)
    const current = await this.repo.get(id)
    if (!current || current.report.packageHash !== view.item.report.packageHash) throw new Error('拡張が更新されています。')
    await this.repo.modify(id, current.report.packageHash, row => { row.enabled = enabled }, false)
    this.channel?.postMessage('changed')
    await this.load()
  }
  async remove(id: string) {
    this.stop(id)
    await this.repo.remove(id)
    this.channel?.postMessage('changed')
    await this.load()
  }
  private async activate(id: string): Promise<Running> {
    const current = this.running.get(id)
    if (current) { await current.activation; return current }
    const row = this.views.find(row => row.item.instanceId === id)
    const pkg = this.packages.get(id)
    if (!row?.item.enabled || !pkg || row.status === 'blocked' || row.status === 'error') throw new Error('拡張が停止中です。再度有効化してください。')
    if (this.running.size >= 4) throw new Error('同時に実行できる拡張は4個までです。不要な拡張を無効にしてください。')
    let running: Running
    const session: ExtensionSession = new ExtensionSession(row.item.manifest, pkg.files, (method, args, signal): Promise<unknown> => this.rpc(id, session, method, args, signal), () => {
      if (this.running.get(id)?.session === session) { this.stop(id); this.status(id, 'error') }
    })
    running = { session, activation: Promise.resolve(), events: new Set(), busy: false }
    this.running.set(id, running)
    running.activation = session.run('activate').then(() => {
      if (this.running.get(id) !== running) throw new Error('拡張は停止しています。')
      this.status(id, 'active')
    }).catch(error => {
      if (this.running.get(id) === running) { this.stop(id); this.status(id, 'error') }
      throw error
    })
    await running.activation
    return running
  }
  async run(id: string, command: string) {
    const row = this.views.find(row => row.item.instanceId === id)
    if (!row?.item.manifest.contributes.commands.some(c => c.id === command)) throw new Error('未登録のコマンドです。')
    const running = await this.activate(id)
    if (running.busy) throw new Error('この拡張は処理中です。')
    running.busy = true
    try { await running.session.run('command', command) }
    catch (error) {
      if (this.running.get(id) === running) { this.stop(id); this.status(id, 'error') }
      throw error
    } finally { running.busy = false }
  }
  emit(name: 'editor' | 'reference' | 'settings', value: unknown = null, id?: string) {
    for (const [key, running] of this.running) if ((!id || key === id) && running.events.has(name)) running.session.event(name, value)
  }
  async setSetting(id: string, key: string, value: Json) {
    const row = this.views.find(row => row.item.instanceId === id)
    const def = row?.item.manifest.contributes.settings[key]
    if (!row || !def || typeof value !== def.type || (typeof value === 'number' && !Number.isFinite(value)) || (def.enum && !def.enum.includes(String(value)))) throw new Error('設定値が正しくありません。')
    jsonCopy(value, 8192)
    await this.repo.modify(id, row.item.report.packageHash, current => { current.settings[key] = value })
    row.item = { ...row.item, settings: { ...row.item.settings, [key]: value } }
    this.changed(); this.emit('settings', null, id)
  }
  /** Owner identity comes from the closed-over session, never from guest arguments. */
  private async rpc(id: string, session: ExtensionSession, method: string, args: unknown, signal: AbortSignal): Promise<unknown> {
    const ensureLive = () => {
      if (signal.aborted || this.running.get(id)?.session !== session) throw new Error('拡張は停止しています。')
    }
    ensureLive()
    jsonCopy(args)
    const row = await this.repo.get(id)
    ensureLive()
    if (!row?.enabled || row.report.packageHash !== this.packages.get(id)?.report.packageHash) throw new Error('権限が失効しています。')
    const manifest = this.packages.get(id)!.manifest!
    const host = this.host
    if (!host) throw new Error('画面が利用できません。')
    const permission = (kind: 'editor' | 'reference', action: 'read' | 'write') => {
      if (!manifest.permissions[kind].includes(action)) throw new Error('許可されていない操作です。')
    }
    const key = () => {
      if (typeof args !== 'string' || !safeKey(args)) throw new Error('キーが正しくありません。')
      return args
    }
    const ui = async (kind: UiKind, message: string, options: string[] = []) => {
      const result = await host.ui(manifest.name, kind, message, options, signal)
      ensureLive()
      return jsonCopy(result)
    }
    let result: unknown = null
    switch (method) {
      case 'events.subscribe': {
        if (!['editor', 'reference', 'settings'].includes(String(args))) throw new Error('未対応のイベントです。')
        if (args === 'editor' || args === 'reference') permission(args, 'read')
        this.running.get(id)!.events.add(String(args)); break
      }
      case 'editor.getSnapshot': permission('editor', 'read'); result = host.getEditor(); break
      case 'editor.applyEdits':
        permission('editor', 'write')
        if (!record(args) || !Number.isSafeInteger(args.expectedRevision) || !Array.isArray(args.edits) || args.edits.length > 1000
          || args.edits.some(edit => !record(edit) || !Number.isSafeInteger(edit.from) || !Number.isSafeInteger(edit.to) || typeof edit.insert !== 'string')) throw new Error('編集要求が不正です。')
        host.applyEdits(args as unknown as { expectedRevision: number; edits: TextEdit[] }); break
      case 'reference.getCurrent': permission('reference', 'read'); result = host.getReference(); break
      case 'reference.openText':
        permission('reference', 'write')
        if (!record(args) || typeof args.name !== 'string' || !args.name || args.name.length > 200 || typeof args.text !== 'string'
          || (args.language !== undefined && typeof args.language !== 'string')) throw new Error('お手本の指定が不正です。')
        host.openText(args as { name: string; text: string; language?: string }); break
      case 'reference.openUrl': {
        permission('reference', 'write')
        if (typeof args !== 'string' || args.length > 2000) throw new Error('URLが不正です。')
        const url = httpsUrl(args)
        result = await ui('confirm', `このURLをお手本に表示しますか？\n${url.href}`)
        if (result === true) host.openUrl(url.href)
        break
      }
      case 'settings.get': {
        const name = key()
        const def = manifest.contributes.settings[name]
        if (!Object.hasOwn(manifest.contributes.settings, name)) throw new Error('未登録の設定です。')
        result = Object.hasOwn(row.settings, name) ? row.settings[name] : def.default; break
      }
      case 'storage.get': result = Object.hasOwn(row.data, key()) ? row.data[key()] : null; break
      case 'storage.set': {
        if (!record(args) || typeof args.key !== 'string' || !safeKey(args.key)) throw new Error('キーが不正です。')
        const k = args.key; const value = jsonCopy(args.value, LIMITS.storage)
        await this.repo.modify(id, row.report.packageHash, current => {
          ensureLive(); const data = { ...current.data, [k]: value }; jsonCopy(data, LIMITS.storage); current.data = data
        }); break
      }
      case 'storage.delete': {
        const k = key()
        await this.repo.modify(id, row.report.packageHash, current => { ensureLive(); delete current.data[k] }); break
      }
      case 'assets.readText': case 'assets.readJson': {
        if (typeof args !== 'string' || !safePath(args)) throw new Error('パスが不正です。')
        const files = this.packages.get(id)!.files
        if (!Object.hasOwn(files, args)) throw new Error('データがありません。')
        result = method === 'assets.readJson' ? JSON.parse(files[args]) : files[args]; break
      }
      case 'network.fetch': result = await extensionFetch(args, manifest.permissions.network, signal); break
      case 'ui.notify': case 'ui.confirm': case 'ui.input':
        if (typeof args !== 'string' || args.length > 4000) throw new Error('メッセージが不正です。')
        result = await ui(method.slice(3) as UiKind, args); break
      case 'ui.select':
        if (!record(args) || typeof args.message !== 'string' || args.message.length > 4000 || !Array.isArray(args.options) || args.options.length > 30
          || args.options.some(option => typeof option !== 'string' || option.length > 200)) throw new Error('選択肢が不正です。')
        result = await ui('select', args.message, args.options as string[]); break
      default: throw new Error('未対応のAPIです。')
    }
    ensureLive()
    return jsonCopy(result ?? null)
  }
}
