import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTauri, openExternal } from './openExternal'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}))

describe('openExternal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('__TAURI_INTERNALS__ が無い場合 isTauri は false', () => {
    expect(isTauri()).toBe(false)
  })

  it('__TAURI_INTERNALS__ を設定すると isTauri は true', () => {
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    expect(isTauri()).toBe(true)
  })

  it('Web環境では window.open で開く', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    await openExternal('https://example.com/')
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener')
  })

  it('Tauri環境では openUrl で開き window.open は呼ばれない', async () => {
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { openUrl } = await import('@tauri-apps/plugin-opener')

    await openExternal('https://example.com/')

    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
    expect(openSpy).not.toHaveBeenCalled()
  })
})
