import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tauri: false,
  setAlwaysOnTop: vi.fn<() => Promise<void>>(),
}))

vi.mock('./openExternal', () => ({ isTauri: () => mocks.tauri }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop: mocks.setAlwaysOnTop }),
}))

import { applyAlwaysOnTop } from './alwaysOnTop'

beforeEach(() => {
  mocks.tauri = false
  mocks.setAlwaysOnTop.mockReset().mockResolvedValue(undefined)
})

it('does nothing in the browser', async () => {
  await applyAlwaysOnTop(true)
  expect(mocks.setAlwaysOnTop).not.toHaveBeenCalled()
})

it('applies both enabled and disabled states to the current Tauri window', async () => {
  mocks.tauri = true
  await applyAlwaysOnTop(true)
  await applyAlwaysOnTop(false)
  expect(mocks.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true)
  expect(mocks.setAlwaysOnTop).toHaveBeenNthCalledWith(2, false)
})
