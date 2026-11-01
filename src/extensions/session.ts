import type { ExtensionManifest } from './api'
import { LIMITS, record } from './model'

export class ExtensionSession {
  readonly signal: AbortSignal
  private abort = new AbortController()
  private worker: Worker
  private next = 0
  private stopped = false
  private isReady = false
  private calls = new Map<number, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  readonly ready: Promise<void>
  private inFlight = 0
  private count = 0
  private windowStart = Date.now()
  private seen = new Set<number>()
  constructor(manifest: ExtensionManifest, files: Record<string, string>, rpc: (method: string, args: unknown, signal: AbortSignal) => Promise<unknown>, onFault: () => void) {
    this.signal = this.abort.signal
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
    this.worker = new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' })
    const startupTimer = setTimeout(() => fault(), 15_000)
    const fault = () => { clearTimeout(startupTimer); this.stop(); onFault() }
    this.worker.onerror = fault
    this.worker.onmessage = event => {
      if (this.stopped) return
      if (Date.now() - this.windowStart > 1000) { this.count = 0; this.windowStart = Date.now() }
      if (++this.count > 100) { fault(); return }
      const msg = event.data
      if (!record(msg)) { fault(); return }
      if (msg.type === 'ready') { clearTimeout(startupTimer); this.isReady = true; this.readyResolve(); return }
      if (msg.type === 'fatal') { fault(); return }
      if (msg.type === 'done') {
        const item = this.calls.get(Number(msg.id))
        if (item) {
          clearTimeout(item.timer); this.calls.delete(Number(msg.id))
          if (msg.ok === true) item.resolve(); else item.reject(new Error('拡張の処理に失敗しました。'))
        }
        return
      }
      if (msg.type !== 'rpc' || !Number.isSafeInteger(msg.id) || typeof msg.method !== 'string'
        || this.seen.has(Number(msg.id)) || this.seen.size >= 100_000) { fault(); return }
      if (++this.inFlight > 16) { fault(); return }
      this.seen.add(Number(msg.id))
      void rpc(msg.method, msg.args, this.signal).then(value => {
        if (!this.stopped) this.worker.postMessage({ type: 'reply', id: msg.id, ok: true, value: value ?? null })
      }, () => {
        if (!this.stopped) this.worker.postMessage({ type: 'reply', id: msg.id, ok: false, value: '操作が許可されていないか、処理に失敗しました。' })
      }).finally(() => { this.inFlight-- })
    }
    this.signal.addEventListener('abort', () => clearTimeout(startupTimer), { once: true })
    this.worker.postMessage({ type: 'init', manifest, files })
  }
  async run(operation: 'activate' | 'command' | 'deactivate', value?: string): Promise<void> {
    await this.ready
    if (this.stopped) throw new Error('拡張は停止しています。')
    return new Promise((resolve, reject) => {
      const id = ++this.next
      const timer = setTimeout(() => { this.stop(); reject(new Error('拡張の実行が時間内に完了しませんでした。')) }, operation === 'deactivate' ? 500 : LIMITS.commandMs)
      this.calls.set(id, { resolve, reject, timer })
      this.worker.postMessage({ type: 'run', id, operation, value })
    })
  }
  event(name: string, value: unknown) { if (!this.stopped) this.worker.postMessage({ type: 'event', name, value }) }
  retire() {
    // Revoke host authority immediately; guest cleanup is bounded and optional.
    this.abort.abort()
    if (this.isReady) void this.run('deactivate').catch(() => {}).finally(() => this.stop())
    else this.stop()
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.abort.abort()
    this.readyReject(new Error('拡張を起動できませんでした。'))
    this.worker.terminate()
    for (const item of this.calls.values()) { clearTimeout(item.timer); item.reject(new Error('拡張は停止しています。')) }
    this.calls.clear()
  }
}
