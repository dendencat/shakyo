// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { inspectInWorker } from './inspect'
import { LIMITS } from './model'

class WorkerMock {
  static instance: WorkerMock
  onmessage?: (event: { data: unknown }) => void
  onerror?: () => void
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { WorkerMock.instance = this }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('terminates an unresponsive parser and fails closed', async () => {
  vi.stubGlobal('Worker', WorkerMock); vi.useFakeTimers()
  const result = inspectInWorker(new Uint8Array())
  const assertion = expect(result).rejects.toThrow('時間内')
  await vi.advanceTimersByTimeAsync(LIMITS.scanMs)
  await assertion
  expect(WorkerMock.instance.terminate).toHaveBeenCalledOnce()
})
it('rejects a failed worker without returning an approval', async () => {
  vi.stubGlobal('Worker', WorkerMock)
  const result = inspectInWorker(new Uint8Array())
  WorkerMock.instance.onerror?.()
  await expect(result).rejects.toThrow('実行できません')
  expect(WorkerMock.instance.terminate).toHaveBeenCalledOnce()
})
