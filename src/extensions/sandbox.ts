import type { QuickJSContext, QuickJSWASMModule } from 'quickjs-emscripten-core'
import type { ExtensionManifest } from './api'
import { BOOTSTRAP } from './bootstrap'
import { LIMITS } from './model'
import { resolveModule } from './preflight'

/** This class owns only guest VM handles; no browser objects enter the VM. */
export class Sandbox {
  private vm: QuickJSContext
  private deadline = 0
  private disposed = false
  private messageCount = 0
  private messageWindow = Date.now()
  constructor(module: QuickJSWASMModule, manifest: ExtensionManifest, files: Record<string, string>, send: (message: unknown) => void) {
    const runtime = module.newRuntime()
    runtime.setMemoryLimit(64 * 1024 * 1024)
    runtime.setMaxStackSize(512 * 1024)
    runtime.setInterruptHandler(() => Date.now() > this.deadline)
    runtime.setModuleLoader(name => {
      if (!Object.hasOwn(files, name) || !name.endsWith('.js')) throw new Error('未対応のモジュールです。')
      return files[name]
    }, (base, name) => base === '__entry.js' ? (name === manifest.entry ? name : (() => { throw new Error() })()) : resolveModule(base, name))
    this.vm = runtime.newContext()
    const output = this.vm.newFunction('__send', value => {
      if (Date.now() - this.messageWindow > 1000) { this.messageCount = 0; this.messageWindow = Date.now() }
      if (++this.messageCount > 100) throw new Error('メッセージ数が上限を超えています。')
      const text = this.vm.getString(value)
      if (new TextEncoder().encode(text).length > LIMITS.message) throw new Error('メッセージが大きすぎます。')
      send(JSON.parse(text))
    })
    this.vm.setProp(this.vm.global, '__send', output)
    output.dispose()
    try {
      this.evaluate(`globalThis.__info = ${JSON.stringify({ id: manifest.id, name: manifest.name, version: manifest.version })}; globalThis.__commandIds = ${JSON.stringify(manifest.contributes.commands.map(c => c.id))};`)
      this.evaluate(BOOTSTRAP)
      this.evaluate(`import * as extension from ${JSON.stringify(manifest.entry)}; globalThis.__extensionModule = extension;`, '__entry.js')
    } catch (error) { this.dispose(); throw error }
  }
  private evaluate(code: string, file = '__sdk.js') {
    if (this.disposed) return
    this.deadline = Date.now() + LIMITS.cpuMs
    const result = this.vm.evalCode(code, file, { type: file === '__entry.js' ? 'module' : 'global' })
    if (result.error) { result.error.dispose(); throw new Error('拡張の実行に失敗しました（構文・実行時間・メモリ制限）。') }
    result.value.dispose()
    const jobs = this.vm.runtime.executePendingJobs(1000)
    if (jobs.error) { jobs.error.dispose(); throw new Error('拡張の非同期処理に失敗しました。') }
    if (this.vm.runtime.hasPendingJob()) throw new Error('拡張の非同期処理が上限を超えています。')
  }
  dispatch(id: number, operation: string, value?: unknown) {
    this.evaluate(`void globalThis.__dispatch(${JSON.stringify(id)}, ${JSON.stringify(operation)}, ${JSON.stringify(value ?? null)});`)
  }
  deliver(id: number, ok: boolean, value: unknown) {
    this.evaluate(`globalThis.__deliver(${JSON.stringify(id)}, ${ok}, ${JSON.stringify(value ?? null)});`)
  }
  event(name: string, value: unknown) {
    this.evaluate(`globalThis.__event(${JSON.stringify(name)}, ${JSON.stringify(value ?? null)});`)
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    const runtime = this.vm.runtime
    this.vm.dispose()
    runtime.dispose()
  }
}
