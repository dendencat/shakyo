import { afterEach, describe, expect, it } from 'vitest'
import { EditorState, StateEffect } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, indentMore, undo } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { editorPreferenceExtensions, type EditorPreferences } from './editorPreferences'

const defaults: EditorPreferences = { editorMode: 'normal', indentStyle: 'spaces', indentWidth: 2, autoIndent: true, fontSize: 14 }
const views: EditorView[] = []
afterEach(() => { views.splice(0).forEach(view => view.destroy()) })

function extensions(preferences: EditorPreferences) {
  return [history(), keymap.of(defaultKeymap), javascript(), ...editorPreferenceExtensions(preferences)]
}
function editor(preferences: Partial<EditorPreferences> = {}, doc = 'const x = 1', anchor = 0) {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor }, extensions: extensions({ ...defaults, ...preferences }) }),
    parent: document.body,
  })
  views.push(view)
  return view
}
function key(view: EditorView, value: string, modifiers: KeyboardEventInit = {}) {
  const code = /^[a-z]$/.test(value) ? `Key${value.toUpperCase()}` : value === '/' ? 'Slash' : value
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: value, code, bubbles: true, cancelable: true, ...modifiers }))
}

describe('editor preferences', () => {
  it.each([2, 4, 8] as const)('uses %i spaces for indentation', (indentWidth) => {
    const view = editor({ indentWidth })
    indentMore(view)
    expect(view.state.doc.toString()).toBe(' '.repeat(indentWidth) + 'const x = 1')
  })
  it('uses a tab with the selected display width', () => {
    const view = editor({ indentStyle: 'tabs', indentWidth: 8 })
    expect(view.state.facet(indentUnit)).toBe('\t')
    expect(view.state.tabSize).toBe(8)
    indentMore(view)
    expect(view.state.doc.toString()).toBe('\tconst x = 1')
  })
  it.each(['normal', 'vim', 'emacs', 'vscode'] as const)('%s inserts an unindented newline when disabled', editorMode => {
    const view = editor({ editorMode, autoIndent: false }, '  value', 7)
    if (editorMode === 'vim') key(view, 'i')
    key(view, 'Enter')
    expect(view.state.doc.toString()).toBe('  value\n')
  })
  it('keeps automatic newline indentation when enabled', () => {
    const view = editor({}, 'if (true) {', 11)
    key(view, 'Enter')
    expect(view.state.doc.toString()).toBe('if (true) {\n  ')
  })
  it.each([true, false])('respects autoIndent=%s for input reindentation', autoIndent => {
    const doc = 'if (true) {\n    '
    const view = editor({ autoIndent }, doc, doc.length)
    view.dispatch({ changes: { from: doc.length, insert: '}' }, selection: { anchor: doc.length + 1 }, userEvent: 'input.type' })
    expect(view.state.doc.toString()).toBe(autoIndent ? 'if (true) {\n}' : 'if (true) {\n    }')
  })
  it('supports Vim movement, insert mode and undo', () => {
    const view = editor({ editorMode: 'vim' }, 'abc', 0)
    key(view, 'l')
    expect(view.state.selection.main.head).toBe(1)
    key(view, 'x')
    expect(view.state.doc.toString()).toBe('ac')
    key(view, 'u')
    expect(view.state.doc.toString()).toBe('abc')
  })
  it('supports Emacs movement and deletion', () => {
    const view = editor({ editorMode: 'emacs' }, 'abc', 0)
    key(view, 'f', { ctrlKey: true })
    expect(view.state.selection.main.head).toBe(1)
    key(view, 'k', { ctrlKey: true })
    expect(view.state.doc.toString()).toBe('a')
    key(view, '/', { ctrlKey: true })
    expect(view.state.doc.toString()).toBe('abc')
  })
  it('supports VSCode line movement', () => {
    const view = editor({ editorMode: 'vscode' }, 'abc\ndef', 0)
    key(view, 'ArrowDown', { altKey: true })
    expect(view.state.doc.toString()).toBe('def\nabc')
    undo(view)
    expect(view.state.doc.toString()).toBe('abc\ndef')
  })
  it('retains document, selection and undo across every mode and settings change', () => {
    const view = editor({}, 'abc', 0)
    view.dispatch({ changes: { from: 3, insert: 'd' }, selection: { anchor: 1, head: 2 } })
    for (const editorMode of ['vim', 'emacs', 'vscode', 'normal'] as const) {
      view.dispatch({ effects: StateEffect.reconfigure.of(extensions({ ...defaults, editorMode, indentWidth: 8, fontSize: 24 })) })
      expect(view.state.doc.toString()).toBe('abcd')
      expect(view.state.selection.main.from).toBe(1)
      expect(view.state.selection.main.to).toBe(2)
    }
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('abc')
  })
})
