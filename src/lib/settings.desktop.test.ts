import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { hasConfiguredApiKey, initializeApiKey, resetApiKeyStateForTest, saveSettings } from './settings'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

beforeEach(() => {
  localStorage.clear()
  resetApiKeyStateForTest()
  invoke.mockReset()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
})
afterEach(() => { delete (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ })

it('moves a legacy key to the OS store before deleting localStorage', async () => {
  localStorage.setItem('shakyo.openai.apiKey', 'sk-legacy')
  invoke.mockImplementation(async (command: string) => command === 'has_openai_key' ? true : undefined)
  await initializeApiKey()
  expect(invoke).toHaveBeenNthCalledWith(1, 'set_openai_key', { key: 'sk-legacy' })
  expect(invoke).toHaveBeenNthCalledWith(2, 'has_openai_key')
  expect(localStorage.getItem('shakyo.openai.apiKey')).toBeNull()
  expect(hasConfiguredApiKey()).toBe(true)
})

it('keeps the legacy key and stops saving when the OS store fails', async () => {
  localStorage.setItem('shakyo.openai.apiKey', 'sk-legacy')
  invoke.mockRejectedValue(new Error('unavailable'))
  await expect(saveSettings({ apiKey: '', model: 'gpt-5.6-luna', reasoningEffort: 'none', allowHighPerformanceModels: false })).rejects.toThrow()
  expect(localStorage.getItem('shakyo.openai.apiKey')).toBe('sk-legacy')
  expect(hasConfiguredApiKey()).toBe(false)
  expect(localStorage.getItem('shakyo.openai.model')).toBeNull()
})

it('saves and deletes a desktop key without reading it back into JavaScript', async () => {
  invoke.mockImplementation(async (command: string) => command === 'has_openai_key' ? false : undefined)
  await saveSettings({ apiKey: 'sk-new', model: 'gpt-5.6-luna', reasoningEffort: 'none', allowHighPerformanceModels: false })
  expect(invoke).toHaveBeenCalledWith('set_openai_key', { key: 'sk-new' })
  expect(hasConfiguredApiKey()).toBe(true)
  expect(localStorage.getItem('shakyo.openai.apiKey')).toBeNull()
  expect(invoke).not.toHaveBeenCalledWith('get_openai_key')
  await saveSettings({ apiKey: '', model: 'gpt-5.6-luna', reasoningEffort: 'none', allowHighPerformanceModels: false })
  expect(invoke).toHaveBeenCalledWith('delete_openai_key')
  expect(hasConfiguredApiKey()).toBe(false)
})
