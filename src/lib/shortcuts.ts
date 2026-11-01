import { useEffect, useState } from 'react'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { undo, redo, selectAll, toggleComment, indentMore, indentLess, moveLineUp, moveLineDown, copyLineUp, copyLineDown } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { Command } from '@codemirror/view'
import type { EditorMode } from './preferences'

export const KEY_SHORTCUTS = 'shakyo.shortcuts'
const CHANGE_EVENT = 'shakyo:shortcuts'
const openReplacePanel: Command = view => {
  const opened = openSearchPanel(view)
  queueMicrotask(() => {
    const replace = view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]')
    replace?.focus()
    replace?.select()
  })
  return opened
}

export const shortcutActions = [
  { id: 'undo', label: '元に戻す', key: 'Mod-z', scope: 'editor' },
  { id: 'redo', label: 'やり直す', key: 'Mod-Shift-z', scope: 'editor' },
  { id: 'find', label: '検索', key: 'Mod-f', scope: 'editor' },
  { id: 'replace', label: '置換', key: 'Mod-h', scope: 'editor' },
  { id: 'selectAll', label: 'すべて選択', key: 'Mod-a', scope: 'editor' },
  { id: 'comment', label: 'コメント切り替え', key: 'Mod-Shift-/', scope: 'editor' },
  { id: 'indent', label: 'インデントを増やす', key: 'Tab', scope: 'editor' },
  { id: 'outdent', label: 'インデントを減らす', key: 'Shift-Tab', scope: 'editor' },
  { id: 'lineUp', label: '行を上へ移動', key: 'Alt-ArrowUp', scope: 'editor' },
  { id: 'lineDown', label: '行を下へ移動', key: 'Alt-ArrowDown', scope: 'editor' },
  { id: 'copyUp', label: '行を上へ複製', key: 'Alt-Shift-ArrowUp', scope: 'editor' },
  { id: 'copyDown', label: '行を下へ複製', key: 'Alt-Shift-ArrowDown', scope: 'editor' },
  { id: 'clear', label: 'テキストをすべて削除', key: 'Alt-Shift-d', scope: 'app' },
  { id: 'newPage', label: '新規ページ', key: 'Mod-n', scope: 'app' },
  { id: 'save', label: '上書き保存', key: 'Mod-s', scope: 'app' },
  { id: 'saveAs', label: '名前を付けて保存', key: 'Mod-Shift-s', scope: 'app' },
  { id: 'openReference', label: 'ファイルを開く', key: 'Mod-o', scope: 'app' },
  { id: 'openExplain', label: 'AI解説を開く', key: 'Mod-Alt-i', scope: 'app' },
] as const
export type ShortcutId = typeof shortcutActions[number]['id']
export type Shortcuts = Record<ShortcutId, string>
export type AppShortcutId = Extract<typeof shortcutActions[number], { scope: 'app' }>['id']

const editorCommands: Partial<Record<ShortcutId, Command>> = {
  undo, redo, find: openSearchPanel, replace: openReplacePanel, selectAll,
  comment: toggleComment, indent: indentMore, outdent: indentLess,
  lineUp: moveLineUp, lineDown: moveLineDown, copyUp: copyLineUp, copyDown: copyLineDown,
}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)
export function defaultShortcuts(): Shortcuts {
  return Object.fromEntries(shortcutActions.map(action => [action.id, action.id === 'replace' && isMac() ? 'Mod-Alt-f' : action.key])) as Shortcuts
}
export function matchesShortcutMenu(event: KeyboardEvent): boolean {
  return !event.isComposing && event.keyCode !== 229 && !event.altKey && !event.shiftKey &&
    (event.ctrlKey || (isMac() && event.metaKey)) && (event.key === '/' || event.code === 'Slash')
}
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const captured = captureShortcut(event)
  if (!captured) return false
  const canonical = shortcut.replace(isMac() ? 'Meta-' : 'Ctrl-', 'Mod-')
  return captured === canonical
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
  return Prec.highest(keymap.of(shortcutActions
    .filter(action => action.scope === 'editor')
    .filter(action => action.id === 'replace' || mode === 'normal' || mode === 'vscode' || value[action.id] !== defaults[action.id])
    .map(action => ({
      key: value[action.id],
      scope: action.id === 'replace' ? 'editor search-panel' : 'editor',
      preventDefault: true,
      run: editorCommands[action.id]!,
    }))))
}
