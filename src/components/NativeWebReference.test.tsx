import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NativeWebReference } from './NativeWebReference'

const mocks = vi.hoisted(() => ({
  update: vi.fn(), release: vi.fn(), location: vi.fn(),
  measure: vi.fn(() => ({ x: 10, y: 20, width: 300, height: 200 })),
  error: undefined as ((message: string) => void) | undefined,
}))
vi.mock('../lib/nativeReference', () => ({
  nativeBrowserAction: mocks.location,
  measureNativeBounds: mocks.measure,
  nativeReference: { acquire: (error: (message: string) => void) => {
    mocks.error = error
    return { update: mocks.update, release: mocks.release }
  } },
}))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let frame: FrameRequestCallback | undefined
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  mocks.update.mockClear()
  mocks.release.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const render = async (obscured = false, url = 'https://github.com') => {
  await act(async () => root.render(<StrictMode><NativeWebReference url={url} obscured={obscured} /></StrictMode>))
}
const tick = async () => { await act(async () => frame?.(0)) }

it('keeps the session during layout-only updates and hides for settings and other modal/drag overlays', async () => {
  await render()
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: mocks.measure() })
  const releases = mocks.release.mock.calls.length
  await render(true)
  await tick()
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: null })
  await render(false)
  await tick()
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: mocks.measure() })
  expect(mocks.release).toHaveBeenCalledTimes(releases)
  for (const selector of ['dialog', 'resize']) {
    const overlay = document.createElement('div')
    if (selector === 'dialog') overlay.setAttribute('role', 'dialog')
    else overlay.className = 'workspace-resize-overlay'
    document.body.append(overlay)
    await tick()
    expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: null })
    overlay.remove()
    await tick()
    expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: mocks.measure() })
  }
})

it('does not send unchanged geometry every frame and releases on tab unmount', async () => {
  await render()
  const calls = mocks.update.mock.calls.length
  await tick()
  await tick()
  expect(mocks.update).toHaveBeenCalledTimes(calls)
  await act(async () => root.render(null))
  expect(mocks.release).toHaveBeenCalledTimes(2) // StrictMode cleanup + actual unmount
})

it('shows Japanese failure/retry UI, hides the failed view, and retries on demand', async () => {
  await render()
  await act(async () => mocks.error?.('内蔵Web表示を作成できませんでした。'))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('内蔵Web表示を作成できませんでした。')
  await tick()
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: null })
  await act(async () => container.querySelector('button')?.click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://github.com', bounds: mocks.measure() })
})

it('keeps a rejected localhost request hidden when an obscuring dialog closes', async () => {
  const url = 'http://localhost:1420/'
  await render()
  await render(false, url)
  expect(mocks.update).toHaveBeenLastCalledWith({ url, bounds: mocks.measure() })
  // Simulate the Rust URL validator rejecting the new request. This verifies
  // React's reaction to IPC failure, not actual native rendering or validation.
  await act(async () => mocks.error?.('ローカルアプリのURLは表示できません。'))
  const failureCallCount = mocks.update.mock.calls.length
  expect(mocks.update).toHaveBeenLastCalledWith({ url, bounds: null })
  await render(true, url)
  await tick()
  await render(false, url)
  await tick()
  await tick()

  expect(container.querySelector('[role="alert"]')?.textContent).toContain('ローカルアプリのURLは表示できません。')
  expect(mocks.update.mock.calls.slice(failureCallCount).every(([state]) => state.url === url && state.bounds === null)).toBe(true)
  expect(mocks.update).toHaveBeenLastCalledWith({ url, bounds: null })
})

it('keeps the native child and its history when navigating to a different URL', async () => {
  await render()
  const releases = mocks.release.mock.calls.length
  await render(false, 'https://example.com/next')
  expect(mocks.release).toHaveBeenCalledTimes(releases)
  expect(mocks.update).toHaveBeenLastCalledWith({ url: 'https://example.com/next', bounds: mocks.measure() })
})

it('tracks redirects but ignores locations from an obsolete navigation or an unmounted view', async () => {
  let finish!: (location: { requestedUrl: string; url: string }) => void
  mocks.location.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const report = vi.fn()
  await act(async () => root.render(<NativeWebReference url="https://a.test/" obscured={false} onLocation={report} />))
  await act(async () => root.render(<NativeWebReference url="https://b.test/" obscured={false} onLocation={report} />))
  await act(async () => finish({ requestedUrl: 'https://a.test/', url: 'https://a.test/redirect' }))
  expect(report).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  root = createRoot(container)
  mocks.location.mockResolvedValue({ requestedUrl: 'https://b.test/', url: 'https://b.test/redirect' })
  await act(async () => root.render(<NativeWebReference url="https://b.test/" obscured={false} onLocation={report} />))
  expect(report).toHaveBeenLastCalledWith('https://b.test/redirect')
})
