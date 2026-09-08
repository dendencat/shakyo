import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { history, undo } from '@codemirror/commands'
import { applyEditorEdits, editorSnapshot, extensionRevision } from './editorAdapter'

describe('extension editor adapter', () => {
  it('applies a transaction with one undo step and refuses stale results', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'abc', extensions: [history(), extensionRevision] }) })
    try {
      const old = editorSnapshot(view, 'ts')
      applyEditorEdits(view, { expectedRevision: old.revision, edits: [{ from: 0, to: 1, insert: 'A' }, { from: 2, to: 3, insert: 'C' }] })
      expect(view.state.doc.toString()).toBe('AbC')
      expect(() => applyEditorEdits(view, { expectedRevision: old.revision, edits: [] })).toThrow('変更')
      expect(undo(view)).toBe(true)
      expect(view.state.doc.toString()).toBe('abc')
      expect(editorSnapshot(view, 'ts').revision).toBeGreaterThan(old.revision)
    } finally { view.destroy() }
  })
  it('rejects overlapping or out-of-bounds edits without changing the document', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'abc', extensions: [extensionRevision] }) })
    try {
      expect(() => applyEditorEdits(view, { expectedRevision: 0, edits: [{ from: 0, to: 2, insert: '' }, { from: 1, to: 3, insert: '' }] })).toThrow()
      expect(view.state.doc.toString()).toBe('abc')
    } finally { view.destroy() }
  })
})
