import { useEffect, useState } from 'react'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { undo, redo, selectAll, toggleComment, indentMore, indentLess, moveLineUp, moveLineDown, copyLineUp, copyLineDown } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { EditorMode } from './preferences'

export const KEY_SHORTCUTS = 'shakyo.shortcuts'
const CHANGE_EVENT = 'shakyo:shortcuts'
export const shortcutActions = [
  { id: 'undo', label: '元に戻す', key: 'Mod-z', run: undo },
  { id: 'redo', label: 'やり直す', key: 'Mod-Shift-z', run: redo },
  { id: 'find', label: '検索', key: 'Mod-f', run: openSearchPanel },
  { id: 'replace', label: '置換', key: 'Mod-h', run: openSearchPanel },
  { id: 'selectAll', label: 'すべて選択', key: 'Mod-a', run: selectAll },
  { id: 'comment', label: 'コメント切り替え', key: 'Mod-Shift-/', run: toggleComment },
  { id: 'indent', label: 'インデントを増やす', key: 'Tab', run: indentMore },
  { id: 'outdent', label: 'インデントを減らす', key: 'Shift-Tab', run: indentLess },
  { id: 'lineUp', label: '行を上へ移動', key: 'Alt-ArrowUp', run: moveLineUp },
  { id: 'lineDown', label: '行を下へ移動', key: 'Alt-ArrowDown', run: moveLineDown },
  { id: 'copyUp', label: '行を上へ複製', key: 'Alt-Shift-ArrowUp', run: copyLineUp },
  { id: 'copyDown', label: '行を下へ複製', key: 'Alt-Shift-ArrowDown', run: copyLineDown },
] as const
export type ShortcutId = typeof shortcutActions[number]['id']
export type Shortcuts = Record<ShortcutId, string>
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)
export function defaultShortcuts(): Shortcuts {
  return Object.fromEntries(shortcutActions.map(action => [action.id, action.id === 'replace' && isMac() ? 'Mod-Alt-f' : action.key])) as Shortcuts
}
export function matchesShortcutMenu(event: KeyboardEvent): boolean {
  return !event.isComposing && event.keyCode !== 229 && !event.altKey && !event.shiftKey &&
    (event.ctrlKey || (isMac() && event.metaKey)) && (event.key === '/' || event.code === 'Slash')
}
export function captureShortcut(event: KeyboardEvent): string | null {
  if (event.isComposing || event.keyCode === 229 || ['Control', 'Shift', 'Meta', 'Alt', 'Escape', 'Dead', 'Unidentified'].includes(event.key)) return null
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Tab' && !/^F([1-9]|1[0-2])$/.test(event.key)) return null
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push(isMac() ? 'Ctrl' : 'Mod')
  if (event.metaKey) modifiers.push(isMac() ? 'Mod' : 'Meta')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  const key = event.code === 'Slash' ? '/' : event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key
  return [...modifiers, key].join('-')
}
function validChord(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 60) return false
  return /^(?:(?:Mod|Ctrl|Meta)-)?(?:Alt-)?(?:Shift-)?(?:[a-z0-9/.,;=[\]\\'`-]|Space|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|F(?:[1-9]|1[0-2]))$/.test(value) &&
    (value.includes('Mod-') || value.includes('Ctrl-') || value.includes('Meta-') || value.includes('Alt-') || /^(?:Shift-)?(?:Tab|F(?:[1-9]|1[0-2]))$/.test(value))
}
export function validateShortcuts(value: Shortcuts): string | null {
  const seen = new Set<string>()
  for (const action of shortcutActions) {
    const key = value[action.id]
    if (!validChord(key)) return `${action.label}のキー入力が無効です。`
    const canonical = key.replace(isMac() ? 'Meta-' : 'Ctrl-', 'Mod-')
    if (canonical === 'Mod-/' || key === 'Ctrl-/') return 'Ctrl / Cmd + / はショートカットメニュー専用です。'
    if (seen.has(canonical)) return '同じキーを複数の機能に割り当てることはできません。'
    seen.add(canonical)
  }
  return null
}
export function loadShortcuts(): Shortcuts {
  const defaults = defaultShortcuts()
  try {
    const value = JSON.parse(localStorage.getItem(KEY_SHORTCUTS) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const merged = Object.fromEntries(shortcutActions.map(action => [action.id, value[action.id] ?? defaults[action.id]])) as Shortcuts
    return validateShortcuts(merged) ? defaults : merged
  } catch { return defaults }
}
export function saveShortcuts(value: Shortcuts) {
  const error = validateShortcuts(value)
  if (error) throw new Error(error)
  localStorage.setItem(KEY_SHORTCUTS, JSON.stringify(value))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
export function useShortcuts() {
  const [value, setValue] = useState(loadShortcuts)
  useEffect(() => {
    const update = () => setValue(loadShortcuts())
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === KEY_SHORTCUTS) update() }
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(CHANGE_EVENT, update); window.removeEventListener('storage', storage) }
  }, [])
  return value
}
export function editorShortcutExtensions(value: Shortcuts, mode: EditorMode) {
  const defaults = defaultShortcuts()
  return Prec.highest(keymap.of(shortcutActions.filter(action => mode === 'normal' || mode === 'vscode' || value[action.id] !== defaults[action.id]).map(action => ({
    key: value[action.id], preventDefault: true, run: action.run,
  }))))
}
