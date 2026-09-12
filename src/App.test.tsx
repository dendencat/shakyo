import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { version } from '../package.json'

vi.mock('./components/ReferencePane', () => ({ ReferencePane: () => <textarea aria-label="reference-state" defaultValue="reference" /> }))
vi.mock('./components/ShakyoEditor', () => ({ ShakyoEditor: () => <textarea aria-label="editor-state" defaultValue="draft" /> }))
vi.mock('./components/ExplainPanel', () => ({ ExplainPanel: () => <div>explain</div> }))
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
it('opens, switches and closes icon menus without replacing the working panes', async () => {
  await act(async () => root.render(<App />))
  const editor = container.querySelector<HTMLTextAreaElement>('[aria-label="editor-state"]')!
  editor.value = 'unsaved work'
  expect(container.querySelector('.app-header')).toBeNull()
  const rail = container.querySelector('.activity-bar')!
  expect(rail.textContent).toBe('')
  expect(rail.querySelectorAll('button[title]')).toHaveLength(6)
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
