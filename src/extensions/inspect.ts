import { LIMITS } from './model'
import type { CheckedPackage } from './model'

/** Untrusted parsing is kept off the UI thread and can be terminated. */
export function inspectInWorker(archive: Uint8Array): Promise<CheckedPackage> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./preflight.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => { finish(); reject(new Error('検査が時間内に完了しませんでした。')) }, LIMITS.scanMs)
    worker.onmessage = event => {
      finish()
      if (event.data?.report) resolve(event.data)
      else reject(new Error('検査に失敗しました。有効化できません。'))
    }
    worker.onerror = () => { finish(); reject(new Error('検査を実行できませんでした。')) }
    worker.postMessage(archive)
  })
}
