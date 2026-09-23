import { useEffect, useState } from 'react'
import type { PaneId } from './layout'

export type EditorMode = 'normal' | 'vim' | 'emacs' | 'vscode'
export interface Preferences {
  visiblePanes: Record<PaneId, boolean>
  editorMode: EditorMode
  indentStyle: 'spaces' | 'tabs'
  indentWidth: 2 | 4 | 8
  autoIndent: boolean
  fontSize: number
  showHistorySuggestions: boolean
  readingMode: boolean
}
export const KEY_PREFERENCES = 'shakyo.preferences'
const CHANGE_EVENT = 'shakyo:preferences'
export const defaultPreferences = (): Preferences => ({
  visiblePanes: { reference: true, editor: true, explain: true },
  editorMode: 'normal', indentStyle: 'spaces', indentWidth: 2,
  autoIndent: true, fontSize: 14, showHistorySuggestions: true,
  readingMode: false,
})
export function loadPreferences(): Preferences {
  const defaults = defaultPreferences()
  try {
    const value = JSON.parse(localStorage.getItem(KEY_PREFERENCES) ?? 'null')
    if (!value || typeof value !== 'object') return defaults
    const visiblePanes = { ...defaults.visiblePanes }
    for (const id of Object.keys(visiblePanes) as PaneId[]) {
      if (typeof value.visiblePanes?.[id] === 'boolean') visiblePanes[id] = value.visiblePanes[id]
    }
    return {
      visiblePanes: { ...visiblePanes, editor: true },
      editorMode: ['normal', 'vim', 'emacs', 'vscode'].includes(value.editorMode) ? value.editorMode : defaults.editorMode,
      indentStyle: value.indentStyle === 'tabs' ? 'tabs' : 'spaces',
      indentWidth: [2, 4, 8].includes(value.indentWidth) ? value.indentWidth : 2,
      autoIndent: typeof value.autoIndent === 'boolean' ? value.autoIndent : true,
      fontSize: Number.isInteger(value.fontSize) && value.fontSize >= 10 && value.fontSize <= 32 ? value.fontSize : 14,
      showHistorySuggestions: typeof value.showHistorySuggestions === 'boolean' ? value.showHistorySuggestions : true,
      readingMode: typeof value.readingMode === 'boolean' ? value.readingMode : false,
    }
  } catch { return defaults }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({ ...value, visiblePanes: { ...value.visiblePanes, editor: true } }))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
export function usePreferences(): Preferences {
  const [value, setValue] = useState(loadPreferences)
  useEffect(() => {
    const update = () => setValue(loadPreferences())
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === KEY_PREFERENCES) update()
    }
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, update)
      window.removeEventListener('storage', storage)
    }
  }, [])
  return value
}
