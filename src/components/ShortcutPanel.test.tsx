import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShortcutDialog } from './ShortcutPanel'
import { loadShortcuts } from '../lib/shortcuts'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const close = vi.fn(), saved = vi.fn()
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear(); close.mockClear(); saved.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<ShortcutDialog onClose={close} onSaved={saved} />))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const press = async (key: string, extra: KeyboardEventInit = {}) => act(async () => {
  container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }))
})
const save = async () => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '保存')!.click())
it('captures a key chord and saves it', async () => {
  await press('z', { altKey: true }); await save()
  expect(loadShortcuts().undo).toBe('Alt-z'); expect(saved).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
})
it('keeps the dialog open for duplicate and reserved keys', async () => {
  await press('f', { ctrlKey: true }); await save()
  expect(container.querySelector('[role=alert]')!.textContent).toContain('複数')
  await press('/', { ctrlKey: true }); await save()
  expect(container.querySelector('[role=alert]')!.textContent).toContain('専用'); expect(close).not.toHaveBeenCalled()
})
it('ignores composing Escape and reports storage failures', async () => {
  await press('Escape', { isComposing: true }); expect(close).not.toHaveBeenCalled()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  await save(); expect(container.querySelector('[role=alert]')!.textContent).toContain('保存できません'); expect(saved).not.toHaveBeenCalled()
})
