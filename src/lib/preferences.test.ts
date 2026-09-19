import { beforeEach, expect, it } from 'vitest'
import { defaultPreferences, KEY_PREFERENCES, loadPreferences, savePreferences } from './preferences'

beforeEach(() => localStorage.clear())

it('adds defaults to legacy storage without touching existing settings or drafts', () => {
  localStorage.setItem('shakyo.openai.model', 'existing-model')
  localStorage.setItem('shakyo.editor.draft', 'unsaved code')
  expect(loadPreferences()).toEqual(defaultPreferences())
  expect(localStorage.getItem('shakyo.openai.model')).toBe('existing-model')
  expect(localStorage.getItem('shakyo.editor.draft')).toBe('unsaved code')
  expect(localStorage.getItem(KEY_PREFERENCES)).toBeNull()
})

it.each(['{broken', 'null', '42', '"invalid"', '[]'])('uses defaults for malformed preferences: %s', value => {
  localStorage.setItem(KEY_PREFERENCES, value)
  expect(loadPreferences()).toEqual(defaultPreferences())
})

it('validates each field and prevents all panes being hidden', () => {
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({
    visiblePanes: { reference: false, editor: false, explain: false },
    editorMode: 'unknown', indentStyle: 'unknown', indentWidth: 3,
    fontSize: 33, autoIndent: 'false', showHistorySuggestions: 0,
  }))
  expect(loadPreferences()).toEqual({ ...defaultPreferences(), visiblePanes: { reference: false, editor: true, explain: false } })
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({ visiblePanes: { reference: false }, editorMode: 'vim' }))
  expect(loadPreferences()).toEqual({ ...defaultPreferences(), visiblePanes: { reference: false, editor: true, explain: true }, editorMode: 'vim' })
})

it.each([9, 14.5, '24', null])('rejects invalid font size %s', fontSize => {
  localStorage.setItem(KEY_PREFERENCES, JSON.stringify({ fontSize }))
  expect(loadPreferences().fontSize).toBe(14)
})

it.each(['normal', 'vim', 'emacs', 'vscode'] as const)('round trips supported mode %s and valid preferences', editorMode => {
  const saved = { ...defaultPreferences(), editorMode, indentStyle: 'tabs' as const, indentWidth: 8 as const, autoIndent: false, showHistorySuggestions: false, fontSize: 32 }
  savePreferences(saved)
  expect(loadPreferences()).toEqual(saved)
})
