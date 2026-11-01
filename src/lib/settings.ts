import { useEffect, useState } from 'react'
import { isTauri } from './openExternal'

export const DEFAULT_MODEL = 'gpt-5.6-luna'
export const STANDARD_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra'] as const
export const HIGH_PERFORMANCE_MODELS = ['gpt-5.6-sol', 'gpt-6-astra'] as const
const AVAILABLE_MODELS = [...STANDARD_MODELS, ...HIGH_PERFORMANCE_MODELS] as const

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'none'

const KEY_API_KEY = 'shakyo.openai.apiKey'
const KEY_MODEL = 'shakyo.openai.model'
const KEY_REASONING_EFFORT = 'shakyo.openai.reasoningEffort'
const KEY_HIGH_PERFORMANCE_MODELS = 'shakyo.openai.highPerformanceModels'
const CHANGE_EVENT = 'shakyo:settings'
let sessionApiKey = ''
let desktopHasKey = false
let desktopReady: Promise<void> | null = null
export function resetApiKeyStateForTest(): void {
  sessionApiKey = ''
  desktopHasKey = false
  desktopReady = null
}
export const KEY_DRAFT = 'shakyo.editor.draft'
export const KEY_EDITOR_LANG = 'shakyo.editor.lang'

export type Settings = {
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
  allowHighPerformanceModels: boolean
}

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

export function isHighPerformanceModel(model: string): boolean {
  return (HIGH_PERFORMANCE_MODELS as readonly string[]).includes(model)
}

export function normalizeReasoningEffort(value: unknown, model: string): ReasoningEffort {
  // v2.2以前の「minimal」は、同じ意図を表す現在の「none」へ移行する。
  const migrated = value === 'minimal' ? 'none' : value
  const effort = typeof migrated === 'string' && REASONING_EFFORTS.has(migrated as ReasoningEffort)
    ? migrated as ReasoningEffort
    : DEFAULT_REASONING_EFFORT
  // GPT-6 Astraはnoneをサポートしない。
  return model === 'gpt-6-astra' && effort === 'none' ? 'low' : effort
}

export function normalizeSettings(settings: Settings): Settings {
  const allowHighPerformanceModels = settings.allowHighPerformanceModels === true
  const requestedModel = settings.model.trim() || DEFAULT_MODEL
  const model = !(AVAILABLE_MODELS as readonly string[]).includes(requestedModel)
    || (!allowHighPerformanceModels && isHighPerformanceModel(requestedModel))
    ? DEFAULT_MODEL
    : requestedModel
  return {
    apiKey: settings.apiKey,
    model,
    reasoningEffort: normalizeReasoningEffort(settings.reasoningEffort, model),
    allowHighPerformanceModels,
  }
}

export function loadSettings(): Settings {
  const allowHighPerformanceModels = localStorage.getItem(KEY_HIGH_PERFORMANCE_MODELS) === 'true'
  const model = localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL
  return normalizeSettings({
    apiKey: isTauri() ? '' : sessionApiKey,
    model,
    reasoningEffort: normalizeReasoningEffort(localStorage.getItem(KEY_REASONING_EFFORT), model),
    allowHighPerformanceModels,
  })
}

export function hasConfiguredApiKey(): boolean {
  return isTauri() ? desktopHasKey : !!sessionApiKey
}

export function initializeApiKey(): Promise<void> {
  if (desktopReady) return desktopReady
  desktopReady = (async () => {
    const legacy = localStorage.getItem(KEY_API_KEY)
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      if (legacy) {
        await invoke('set_openai_key', { key: legacy })
        localStorage.removeItem(KEY_API_KEY)
      }
      desktopHasKey = await invoke<boolean>('has_openai_key')
    } else if (legacy) {
      sessionApiKey = legacy
      localStorage.removeItem(KEY_API_KEY)
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  })().catch(error => {
    desktopReady = null
    throw error
  })
  return desktopReady
}

export async function saveSettings(settings: Settings, keyChanged = true): Promise<void> {
  const normalized = normalizeSettings(settings)
  await initializeApiKey()
  if (keyChanged) {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      if (normalized.apiKey) await invoke('set_openai_key', { key: normalized.apiKey })
      else await invoke('delete_openai_key')
      desktopHasKey = !!normalized.apiKey
    } else {
      sessionApiKey = normalized.apiKey
    }
  }
  localStorage.removeItem(KEY_API_KEY)
  localStorage.setItem(KEY_MODEL, normalized.model)
  localStorage.setItem(KEY_REASONING_EFFORT, normalized.reasoningEffort)
  localStorage.setItem(KEY_HIGH_PERFORMANCE_MODELS, String(normalized.allowHighPerformanceModels))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState(loadSettings)
  useEffect(() => {
    void initializeApiKey().catch(() => {
      // Legacy key stays in localStorage when OS credential migration fails.
    })
    const update = () => setSettings(loadSettings())
    const handleStorage = (event: StorageEvent) => {
      if (isSettingsStorageKey(event.key)) update()
    }
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, update)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])
  return settings
}

export function isSettingsStorageKey(key: string | null): boolean {
  // key === null は localStorage.clear() が呼ばれた場合の storage イベントに対応する
  return key === null || key === KEY_API_KEY || key === KEY_MODEL || key === KEY_REASONING_EFFORT || key === KEY_HIGH_PERFORMANCE_MODELS
}
