import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReferencePane } from './ReferencePane'
import { addWebHistory, addWebBookmark, loadWebHistory, loadWebBookmarks } from '../lib/webReference'

const mocks = vi.hoisted(() => ({ preferences: { showHistorySuggestions: true, fontSize: 14 }, native: false }))
vi.mock('../lib/preferences', () => ({ usePreferences: () => mocks.preferences }))
vi.mock('../lib/openExternal', () => ({ isTauri: () => mocks.native, openExternal: vi.fn() }))
vi.mock('./PdfViewer', () => ({ PdfViewer: ({ data }: { data: ArrayBuffer }) => <div data-pdf-bytes={data.byteLength} /> }))
vi.mock('@uiw/react-codemirror', () => ({ default: () => null }))
vi.mock('./NativeWebReference', () => ({ NativeWebReference: ({ obscured }: { obscured: boolean }) => <div data-native-hidden={String(obscured)} /> }))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mocks.preferences = { showHistorySuggestions: true, fontSize: 14 }
  mocks.native = false
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const click = async (selector: string) => act(async () => container.querySelector<HTMLElement>(selector)!.click())
const input = () => container.querySelector<HTMLInputElement>('[role="combobox"]')!
const type = async (value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value)
  input().dispatchEvent(new Event('input', { bubbles: true }))
})
const key = async (value: string, isComposing = false) => act(async () => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key: value, isComposing, bubbles: true }))
})
const render = async () => {
  await act(async () => root.render(<ReferencePane resolvedTheme="light" />))
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(button => button.textContent?.trim() === 'Webページ')!.click())
}

it('shows recent history on focus, filters while typing, and navigates by keyboard and mouse', async () => {
  addWebHistory('https://old.test/')
  addWebHistory('https://new.test/')
  await render()
  await act(async () => input().focus())
  expect([...container.querySelectorAll('[role="option"]')].map(option => option.textContent)).toEqual(['https://new.test/', 'https://old.test/'])
  expect(container.querySelector('.web-url-field > [role="listbox"]')).not.toBeNull()
  expect(container.querySelector('[role="option"]')?.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  await key('ArrowDown')
  await key('Enter')
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://new.test/')
  expect(container.querySelector('[role="listbox"]')).toBeNull()
  await click('[role="combobox"]')
  const frame = container.querySelector('iframe')
  await type('OLD')
  expect(container.querySelector('iframe')).toBe(frame)
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1)
  await click('[role="option"]')
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://old.test/')
  await click('[role="combobox"]')
  await key('Escape')
  expect(container.querySelector('[role="listbox"]')).toBeNull()
})

it('keeps a visible reference file chooser when file controls are portalled to the sidebar', async () => {
  const sidebar = document.createElement('div')
  container.append(sidebar)
  const onReferenceChange = vi.fn()
  await act(async () => root.render(<ReferencePane resolvedTheme="light" sidebarTarget={sidebar} onReferenceChange={onReferenceChange} />))
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const openPicker = vi.spyOn(fileInput, 'click')
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.reference-pane button')].find(button => button.textContent === '参照…')!.click())
  expect(openPicker).toHaveBeenCalledOnce()
  const file = new File(['const value = 1'], 'example.ts')
  Object.defineProperty(file, 'text', { value: async () => 'const value = 1' })
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] })
  await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })))
  expect(onReferenceChange).toHaveBeenLastCalledWith({ name: 'example.ts', text: 'const value = 1' })
  expect(container.querySelector('.reference-pane .file-name')?.textContent).toBe('example.ts')
  expect(fileInput.value).toBe('')
})

const dropFile = async (file: File) => {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'] } })
  await act(async () => container.querySelector('.reference-file-drop')!.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
}

it('opens dropped text and PDF files and preserves the reference on a read error', async () => {
  const onReferenceChange = vi.fn()
  await act(async () => root.render(<ReferencePane resolvedTheme="light" onReferenceChange={onReferenceChange} />))
  const file = new File(['SELECT 1;'], 'query.sql')
  Object.defineProperty(file, 'text', { value: async () => 'SELECT 1;' })
  await dropFile(file)
  expect(onReferenceChange).toHaveBeenLastCalledWith({ name: 'query.sql', text: 'SELECT 1;' })
  const bad = new File([], 'unreadable.txt')
  Object.defineProperty(bad, 'text', { value: async () => { throw new Error('読み込みエラー') } })
  await dropFile(bad)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('読み込みエラー')
  expect(container.querySelector('.file-name')?.textContent).toBe('query.sql')
  const pdf = new File([], 'reference.PDF')
  Object.defineProperty(pdf, 'arrayBuffer', { value: async () => new ArrayBuffer(8) })
  await dropFile(pdf)
  expect(container.querySelector('[data-pdf-bytes]')?.getAttribute('data-pdf-bytes')).toBe('8')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('offers a close action only when supplied by the layout', async () => {
  const onClose = vi.fn()
  await act(async () => root.render(<ReferencePane resolvedTheme="light" onClose={onClose} />))
  await click('[aria-label="お手本を閉じる"]')
  expect(onClose).toHaveBeenCalledOnce()
})

it('keeps only one list open and preserves bookmark editing and history deletion', async () => {
  addWebHistory('https://example.test/')
  addWebBookmark({ name: 'Example', url: 'https://example.test/' })
  await render()
  await click('[aria-label="ブックマーク"]')
  expect(container.querySelector('.browser-toolbar [aria-label="ブックマーク"]')).not.toBeNull()
  await click('#web-bookmarks .web-row-actions button')
  expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '保存')!.click())
  expect(loadWebBookmarks()[0].name).toBe('Example')
  await click('[aria-label="履歴"]')
  expect(container.querySelector('#web-bookmarks')).toBeNull()
  expect(container.querySelector('#web-history')).not.toBeNull()
  await click('[aria-label="この履歴を削除"]')
  expect(loadWebHistory()).toEqual([])
  await act(async () => input().focus())
  expect(container.querySelector('#web-history')).toBeNull()
})

it('disabling suggestions preserves history recording and the history menu', async () => {
  mocks.preferences.showHistorySuggestions = false
  await render()
  await act(async () => input().focus())
  await type('https://record.test/')
  await key('Enter', true)
  expect(loadWebHistory()).toHaveLength(0)
  await key('Enter')
  expect(loadWebHistory()[0].url).toBe('https://record.test/')
  expect(container.querySelector('[role="listbox"]')).toBeNull()
  await click('[aria-label="履歴"]')
  expect(container.querySelector('#web-history')?.textContent).toContain('https://record.test/')
})

it('obscures the mounted native view for lists and suggestions and applies code font size', async () => {
  mocks.native = true
  mocks.preferences.fontSize = 24
  await render()
  await type('https://native.test/')
  await key('Enter')
  const native = container.querySelector('[data-native-hidden]')!
  expect(native.getAttribute('data-native-hidden')).toBe('false')
  await click('[aria-label="ブックマーク"]')
  expect(native.getAttribute('data-native-hidden')).toBe('true')
  await click('[aria-label="ブックマーク"]')
  expect(native.getAttribute('data-native-hidden')).toBe('false')
  await act(async () => input().focus())
  expect(native.getAttribute('data-native-hidden')).toBe('true')
  await key('Escape')
  expect(native.getAttribute('data-native-hidden')).toBe('false')
  expect(container.querySelector('[data-native-hidden]')).toBe(native)
  expect(container.querySelector<HTMLElement>('.reference-pane')!.style.getPropertyValue('--reference-font-size')).toBe('24px')
})
