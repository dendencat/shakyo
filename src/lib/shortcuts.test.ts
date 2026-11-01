import { beforeEach, expect, it } from 'vitest'
import { captureShortcut, defaultShortcuts, KEY_SHORTCUTS, loadShortcuts, matchesShortcut, matchesShortcutMenu, saveShortcuts, validateShortcuts } from './shortcuts'

beforeEach(() => localStorage.clear())
it('rejects duplicate, reserved, and plain typing keys', () => {
  expect(validateShortcuts(defaultShortcuts())).toBeNull()
  expect(validateShortcuts({ ...defaultShortcuts(), undo: 'Mod-/' })).toContain('専用')
  expect(validateShortcuts({ ...defaultShortcuts(), undo: 'Mod-f' })).toContain('複数')
  expect(validateShortcuts({ ...defaultShortcuts(), undo: 'a' })).toContain('無効')
})
it('persists valid bindings and ignores corrupt storage', () => {
  const keys = { ...defaultShortcuts(), undo: 'Alt-z' }
  saveShortcuts(keys)
  expect(loadShortcuts()).toEqual(keys)
  localStorage.setItem(KEY_SHORTCUTS, '{')
  expect(loadShortcuts()).toEqual(defaultShortcuts())
})
it('captures shifted slash but ignores IME and modifier-only events', () => {
  expect(captureShortcut(new KeyboardEvent('keydown', { key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }))).toBe('Mod-Shift-/')
  expect(captureShortcut(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))).toBeNull()
  expect(captureShortcut(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, isComposing: true }))).toBeNull()
  expect(matchesShortcutMenu(new KeyboardEvent('keydown', { key: '/', ctrlKey: true }))).toBe(true)
  expect(matchesShortcutMenu(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, shiftKey: true }))).toBe(false)
  expect(matchesShortcut(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }), 'Mod-s')).toBe(true)
})

it('fills newly introduced application shortcuts into legacy storage', () => {
  localStorage.setItem(KEY_SHORTCUTS, JSON.stringify({ undo: 'Alt-z' }))
  const loaded = loadShortcuts()
  expect(loaded.undo).toBe('Alt-z')
  expect(loaded.clear).toBe('Alt-Shift-d')
  expect(loaded.newPage).toBe('Mod-n')
  expect(loaded.save).toBe('Mod-s')
  expect(loaded.saveAs).toBe('Mod-Shift-s')
  expect(loaded.openReference).toBe('Mod-o')
  expect(loaded.openExplain).toBe('Mod-Alt-i')
})
