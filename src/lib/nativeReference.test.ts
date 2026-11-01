import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNativeReferenceController, measureNativeBounds } from './nativeReference'
import type { NativeReferenceState } from './nativeReference'

const bounds = { x: 10, y: 20, width: 300, height: 200 }
const visible = (url = 'https://example.com'): NativeReferenceState => ({ url, bounds })
const settle = async () => { await Promise.resolve(); await Promise.resolve() }

describe('native reference ownership and ordering', () => {
  it('serializes in-flight creation and coalesces to the latest URL and bounds', async () => {
    let finish!: () => void
    const send = vi.fn<(state: NativeReferenceState) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const controller = createNativeReferenceController(send)
    const session = controller.acquire(vi.fn())
    session.update(visible())
    session.update(visible('https://old.example.com'))
    session.update({ ...visible('https://new.example.com'), bounds: { ...bounds, x: 500 } })
    expect(send).toHaveBeenCalledTimes(1)
    finish()
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ ...visible('https://new.example.com'), bounds: { ...bounds, x: 500 } })
  })

  it('closes after unmount even when creation is pending', async () => {
    let finish!: () => void
    const send = vi.fn<(state: NativeReferenceState) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const session = createNativeReferenceController(send).acquire(vi.fn())
    session.update(visible())
    session.release()
    finish()
    await settle()
    expect(send).toHaveBeenLastCalledWith({ url: null, bounds: null })
  })

  it('StrictMode old cleanup cannot destroy a newer mount; hiding wins over pending creation', async () => {
    let finish!: () => void
    const send = vi.fn<(state: NativeReferenceState) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const controller = createNativeReferenceController(send)
    const old = controller.acquire(vi.fn())
    old.update(visible())
    old.release()
    const current = controller.acquire(vi.fn())
    current.update({ url: 'https://new.example.com', bounds: null })
    old.release()
    old.update(visible('https://stale.example.com'))
    finish()
    await settle()
    expect(send).toHaveBeenLastCalledWith({ url: 'https://new.example.com', bounds: null })
  })

  it('reports current failure and permits retry without poisoning the queue', async () => {
    const error = vi.fn()
    const send = vi.fn().mockRejectedValueOnce('表示失敗').mockResolvedValue(undefined)
    const session = createNativeReferenceController(send).acquire(error)
    session.update(visible())
    await settle()
    expect(error).toHaveBeenCalledWith('表示失敗')
    session.update(visible())
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('requests a hide after a rejected localhost URL even if pending creation coalesced the old cleanup', async () => {
    const rejectedUrl = 'http://localhost:1420/'
    const message = 'ローカルアプリのURLは表示できません。'
    let finishCreation!: () => void
    // Mock the native transport contract only: visible localhost requests fail,
    // whereas hide requests remain valid regardless of the requested URL.
    const send = vi.fn<(state: NativeReferenceState) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finishCreation = resolve }))
      .mockImplementation(async (state) => {
        if (state.url === rejectedUrl && state.bounds !== null) throw message
      })
    const controller = createNativeReferenceController(send)
    const oldError = vi.fn()
    const old = controller.acquire(oldError)
    old.update(visible())
    old.release()
    const error = vi.fn(() => current.update({ url: rejectedUrl, bounds: null }))
    const current = controller.acquire(error)
    current.update(visible(rejectedUrl))
    expect(send).toHaveBeenCalledTimes(1)

    finishCreation()
    await settle()
    await settle()

    expect(send.mock.calls.map(([state]) => state)).toEqual([
      visible(),
      visible(rejectedUrl),
      { url: rejectedUrl, bounds: null },
    ])
    expect(error).toHaveBeenCalledExactlyOnceWith(message)
    expect(oldError).not.toHaveBeenCalled()
    old.update(visible())
    await settle()
    expect(send).toHaveBeenCalledTimes(3)
  })
})

describe('native bounds', () => {
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  function host() {
    const element = document.createElement('div')
    document.body.append(element)
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 200))
    return element
  }

  it('converts page zoom / display scale to physical pixels', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    expect(measureNativeBounds(host())).toEqual({ x: 20, y: 40, width: 600, height: 400 })
  })

  it('clips to scrolling ancestors so it cannot cover neighboring panes', () => {
    const element = host()
    const parent = document.createElement('div')
    parent.style.overflowX = 'auto'
    parent.style.overflowY = 'hidden'
    document.body.append(parent)
    parent.append(element)
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 40, 100, 100))
    Object.defineProperties(parent, { clientWidth: { value: 100 }, clientHeight: { value: 100 } })
    expect(measureNativeBounds(element)).toEqual({ x: 50, y: 40, width: 100, height: 100 })
  })

  it('hides collapsed, offscreen and hidden content', () => {
    const element = host()
    element.style.display = 'none'
    expect(measureNativeBounds(element)).toBeNull()
    element.style.display = ''
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 0, 0))
    expect(measureNativeBounds(element)).toBeNull()
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(-400, 20, 100, 100))
    expect(measureNativeBounds(element)).toBeNull()
  })

  it('accounts for visual viewport offsets and pinch scale', () => {
    vi.stubGlobal('visualViewport', { offsetLeft: 5, offsetTop: 10, width: 100, height: 100, scale: 2 })
    expect(measureNativeBounds(host())).toEqual({ x: 10, y: 20, width: 190, height: 180 })
  })
})
