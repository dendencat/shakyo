import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { version } from '../package.json'

const paneCommands = vi.hoisted(() => ({
  clear: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
  openFilePicker: vi.fn(),
  focusExplain: vi.fn(),
}))
vi.mock('./components/ReferencePane', () => ({ ReferencePane: ({ commandsRef }: { commandsRef?: { current: unknown } }) => {
  if (commandsRef) commandsRef.current = { openFilePicker: paneCommands.openFilePicker }
  return <textarea aria-label="reference-state" defaultValue="reference" />
} }))
vi.mock('./components/ShakyoEditor', () => ({ ShakyoEditor: ({ commandsRef }: { commandsRef?: { current: unknown } }) => {
  if (commandsRef) commandsRef.current = { clear: paneCommands.clear, save: paneCommands.save, saveAs: paneCommands.saveAs }
  return <textarea aria-label="editor-state" defaultValue="draft" />
} }))
vi.mock('./components/ExplainPanel', () => ({ ExplainPanel: ({ commandsRef }: { commandsRef?: { current: unknown } }) => {
  if (commandsRef) commandsRef.current = { focusExplain: paneCommands.focusExplain }
  return <div>explain</div>
} }))
vi.mock('./extensions/manager', () => ({ ExtensionManager: class {
  setHost() {} load() { return Promise.resolve() } dispose() {}
  subscribe = () => () => {}; snapshot = () => this.rows
  rows = []
} }))
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.clearAllMocks()
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const click = async (label: string) => act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
it('opens shortcuts with Ctrl+/ and announces successful settings saves', async () => {
  await act(async () => root.render(<App />))
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true })))
  expect(container.querySelector('#shortcut-dialog')).not.toBeNull()
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('#shortcut-dialog button')].find(button => button.textContent === 'キャンセル')!.click())
  expect(container.querySelector('#shortcut-dialog')).toBeNull()
  await click('設定')
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('#sidebar-settings button')].find(button => button.textContent === '保存')!.click())
  const snackbar = container.querySelector('[role=status]')!
  expect(snackbar.textContent).toBe('設定を保存しました')
  expect(snackbar.classList).toContain('snackbar-success')
})
it('restores hidden panes with application shortcuts and prevents browser defaults', async () => {
  localStorage.setItem('shakyo.preferences', JSON.stringify({ visiblePanes: { reference: false, editor: true, explain: false } }))
  await act(async () => root.render(<App />))
  const explainEvent = new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
  await act(async () => window.dispatchEvent(explainEvent))
  expect(explainEvent.defaultPrevented).toBe(true)
  expect(JSON.parse(localStorage.getItem('shakyo.preferences')!).visiblePanes.explain).toBe(true)
  expect(paneCommands.focusExplain).toHaveBeenCalledOnce()

  const openEvent = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true })
  await act(async () => window.dispatchEvent(openEvent))
  expect(openEvent.defaultPrevented).toBe(true)
  expect(JSON.parse(localStorage.getItem('shakyo.preferences')!).visiblePanes.reference).toBe(true)
  expect(paneCommands.openFilePicker).toHaveBeenCalledOnce()

  const saveEvent = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
  await act(async () => window.dispatchEvent(saveEvent))
  expect(saveEvent.defaultPrevented).toBe(true)
  expect(paneCommands.save).toHaveBeenCalledOnce()

  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })))
  expect(paneCommands.saveAs).toHaveBeenCalledOnce()
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', altKey: true, shiftKey: true, bubbles: true, cancelable: true })))
  expect(paneCommands.clear).toHaveBeenCalledOnce()
})
it('opens, switches and closes icon menus without replacing the working panes', async () => {
  await act(async () => root.render(<App />))
  const editor = container.querySelector<HTMLTextAreaElement>('[aria-label="editor-state"]')!
  editor.value = 'unsaved work'
  expect(container.querySelector('.app-header')).toBeNull()
  const rail = container.querySelector('.activity-bar')!
  expect(rail.textContent).toBe('')
  expect(rail.querySelectorAll('button[title]')).toHaveLength(7)
  await click('ファイル')
  expect(container.querySelector('aside')!.hidden).toBe(false)
  await click('設定')
  expect(container.querySelector('[role="dialog"]')).toBeNull()
  expect(container.querySelector('#sidebar-settings')!.hasAttribute('hidden')).toBe(false)
  expect(container.querySelector('#sidebar-files')!.hasAttribute('hidden')).toBe(true)
  await click('設定')
  expect(container.querySelector('aside')!.hidden).toBe(true)
  expect(container.querySelector('[aria-label="editor-state"]')).toBe(editor)
  expect(editor.value).toBe('unsaved work')
})
it('persists icon theme choices and provides bundled help with the actual version', async () => {
  await act(async () => root.render(<App />))
  await click('テーマ: システム')
  await click('テーマ: ダーク')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('shakyo.theme')).toBe('dark')
  await click('ヘルプ')
  expect(container.querySelector('#sidebar-help')!.textContent).toContain(version)
  expect(container.querySelector('#sidebar-help')!.textContent).toContain('パッケージを作る')
  await act(async () => container.querySelector('aside')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(container.querySelector('aside')!.hidden).toBe(true)
})
