export const DEFAULT_MODEL = 'gpt-5.4-mini'

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'minimal'

const KEY_API_KEY = 'shakyo.openai.apiKey'
const KEY_MODEL = 'shakyo.openai.model'
const KEY_REASONING_EFFORT = 'shakyo.openai.reasoningEffort'
export const KEY_DRAFT = 'shakyo.editor.draft'
export const KEY_EDITOR_LANG = 'shakyo.editor.lang'

export type Settings = {
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
}

function toReasoningEffort(value: string | null): ReasoningEffort {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
    return value
  }
  return DEFAULT_REASONING_EFFORT
}

export function loadSettings(): Settings {
  return {
    apiKey: localStorage.getItem(KEY_API_KEY) ?? '',
    model: localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL,
    reasoningEffort: toReasoningEffort(localStorage.getItem(KEY_REASONING_EFFORT)),
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY_API_KEY, settings.apiKey)
  localStorage.setItem(KEY_MODEL, settings.model || DEFAULT_MODEL)
  localStorage.setItem(KEY_REASONING_EFFORT, toReasoningEffort(settings.reasoningEffort))
}

export function isSettingsStorageKey(key: string | null): boolean {
  // key === null は localStorage.clear() が呼ばれた場合の storage イベントに対応する
  return key === null || key === KEY_API_KEY || key === KEY_MODEL || key === KEY_REASONING_EFFORT
}
