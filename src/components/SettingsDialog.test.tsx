import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsDialog } from './SettingsDialog'
import { defaultPreferences, KEY_PREFERENCES, loadPreferences, savePreferences, usePreferences } from '../lib/preferences'
import { loadSettings, saveSettings } from '../lib/settings'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const close = vi.fn()
function Subscriber() {
  const preferences = usePreferences()
  return <output data-subscriber>{JSON.stringify(preferences)}</output>
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  close.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const render = () => act(async () => root.render(<><SettingsDialog embedded onClose={close} /><Subscriber /></>))
const clickText = (text: string) => act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!.click())
const clickLabel = (label: string) => act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
const field = (label: string) => {
  const owner = [...container.querySelectorAll('label')].find(element => element.textContent?.trim().startsWith(label))!
  return owner.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
    ?? container.querySelector<HTMLInputElement | HTMLSelectElement>(`#${owner.htmlFor}`)!
}
const change = (label: string, value: string) => act(async () => {
  const element = field(label)
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
const toggle = (label: string) => act(async () => field(label).click())
const subscription = () => JSON.parse(container.querySelector('[data-subscriber]')!.textContent!)
const storage = (key: string | null) => act(async () => window.dispatchEvent(new StorageEvent('storage', { key })))

it('cancels edited preferences and OpenAI fields without saving them', async () => {
  saveSettings({ apiKey: '', model: 'existing-model', reasoningEffort: 'low', allowHighPerformanceModels: false })
  const existing = loadSettings()
  await render()
  await change('エディタモード', 'vim')
  await change('モデル', 'gpt-5.6-terra')
  await clickLabel('文字を拡大')
  await clickText('キャンセル')
  expect(close).toHaveBeenCalledOnce()
  expect(localStorage.getItem(KEY_PREFERENCES)).toBeNull()
  expect(loadSettings()).toEqual(existing)
  expect(subscription()).toEqual(defaultPreferences())
})

it('saves all preference groups and updates a same-window subscriber', async () => {
  await render()
  await change('エディタモード', 'emacs')
  await change('インデント', 'tabs')
  await change('インデント幅', '4')
  await toggle('自動インデント')
  await toggle('URL欄で履歴候補を表示')
  await clickLabel('文字を拡大')
  await clickText('保存')
  const expected = { ...defaultPreferences(), editorMode: 'emacs', indentStyle: 'tabs', indentWidth: 4, autoIndent: false, showHistorySuggestions: false, fontSize: 15 }
  expect(loadPreferences()).toEqual(expected)
  expect(subscription()).toEqual(expected)
  expect(close).toHaveBeenCalledOnce()
})

it('allows closing both auxiliary panes while keeping the editor visible', async () => {
  await render()
  const boxes = () => [...container.querySelectorAll<HTMLInputElement>('fieldset:first-of-type input[type="checkbox"]')].slice(0, 2)
  await act(async () => boxes()[0].click())
  await act(async () => boxes()[1].click())
  expect(boxes().map(box => box.checked)).toEqual([false, false])
  await clickText('保存')
  expect(loadPreferences().visiblePanes).toEqual({ reference: false, editor: true, explain: false })
})

it('enforces font limits and resets to 14px', async () => {
  savePreferences({ ...defaultPreferences(), fontSize: 10 })
  await render()
  expect(container.querySelector<HTMLButtonElement>('[aria-label="文字を縮小"]')!.disabled).toBe(true)
  await clickText('リセット')
  expect(container.querySelector('.font-controls output')!.textContent).toBe('14px')
  await act(async () => root.render(null))
  savePreferences({ ...defaultPreferences(), fontSize: 32 })
  await render()
  expect(container.querySelector<HTMLButtonElement>('[aria-label="文字を拡大"]')!.disabled).toBe(true)
})

it('refreshes clean settings and subscribers from another tab, including storage clear', async () => {
  await render()
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({ ...defaultPreferences(), editorMode: 'vscode', fontSize: 22 }))
  await storage(KEY_PREFERENCES)
  expect(field('エディタモード').value).toBe('vscode')
  expect(subscription().fontSize).toBe(22)
  localStorage.setItem('shakyo.openai.model', 'gpt-5.6-terra')
  await storage('shakyo.openai.model')
  expect(field('モデル').value).toBe('gpt-5.6-terra')
  localStorage.clear()
  await storage(null)
  expect(field('エディタモード').value).toBe('normal')
  expect(subscription()).toEqual(defaultPreferences())
})

it('preserves dirty settings while other-tab updates still refresh live subscribers', async () => {
  await render()
  await change('エディタモード', 'vim')
  await change('モデル', 'gpt-5.6-terra')
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({ ...defaultPreferences(), editorMode: 'emacs' }))
  localStorage.setItem('shakyo.openai.model', 'other-model')
  await storage(KEY_PREFERENCES)
  await storage('shakyo.openai.model')
  expect(field('エディタモード').value).toBe('vim')
  expect(field('モデル').value).toBe('gpt-5.6-terra')
  expect(subscription().editorMode).toBe('emacs')
  await clickText('キャンセル')
  expect(loadPreferences().editorMode).toBe('emacs')
  expect(loadSettings().model).toBe('gpt-5.6-luna')
})

it('shows only standard models until high-performance models are enabled', async () => {
  await render()
  const modelOptions = () => [...field('モデル').querySelectorAll('option')].map(option => option.value)
  expect(modelOptions()).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra'])
  await toggle('高性能なモデルを使用する')
  expect(modelOptions()).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra'])
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('請求額の上限')
})

it('resets a selected premium model to Luna when high-performance access is disabled', async () => {
  await render()
  await toggle('高性能なモデルを使用する')
  await change('モデル', 'gpt-5.6-sol')
  await toggle('高性能なモデルを使用する')
  expect(field('モデル').value).toBe('gpt-5.6-luna')
})

it('migrates an old saved model to Luna without injecting it into the dropdown', async () => {
  localStorage.setItem('shakyo.openai.model', 'gpt-5.4')
  await render()
  expect(field('モデル').value).toBe('gpt-5.6-luna')
  expect([...field('モデル').querySelectorAll('option')].map(option => option.value)).not.toContain('gpt-5.4')
})

it('shows reading mode and disables always-on-top in the web build', async () => {
  await render()
  await toggle('リーディングモード')
  expect((field('リーディングモード') as HTMLInputElement).checked).toBe(true)
  expect((field('常に最前面に表示') as HTMLInputElement).disabled).toBe(true)
  expect(container.textContent).toContain('デスクトップ版のみ')
})

it('provides an accessible information tooltip for every setting item', async () => {
  await render()
  const expected = [
    'お手本を表示', '解説を表示', 'コードの文字サイズ', 'リーディングモード', '常に最前面に表示',
    'エディタモード', 'インデント', 'インデント幅', '自動インデント', 'URL欄で履歴候補を表示',
    'OpenAI APIキー', 'モデル', '高性能なモデルを使用する', '解説の深さ',
  ]
  for (const label of expected) {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}の説明"]`)
    expect(button, label).not.toBeNull()
    const tooltip = document.getElementById(button!.getAttribute('aria-describedby')!)
    expect(tooltip?.getAttribute('role')).toBe('tooltip')
    expect(tooltip?.textContent?.length).toBeGreaterThan(0)
  }
  await clickLabel('リーディングモードの説明')
  expect(container.querySelector('[aria-label="リーディングモードの説明"]')?.closest('.info-tooltip')?.hasAttribute('data-open')).toBe(true)
})
