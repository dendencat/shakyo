export const DEFAULT_MODEL = 'gpt-5.4-mini'

const KEY_API_KEY = 'shakyo.openai.apiKey'
const KEY_MODEL = 'shakyo.openai.model'
export const KEY_DRAFT = 'shakyo.editor.draft'
export const KEY_EDITOR_LANG = 'shakyo.editor.lang'

export type Settings = {
  apiKey: string
  model: string
}

export function loadSettings(): Settings {
  return {
    apiKey: localStorage.getItem(KEY_API_KEY) ?? '',
    model: localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL,
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY_API_KEY, settings.apiKey)
  localStorage.setItem(KEY_MODEL, settings.model || DEFAULT_MODEL)
}
