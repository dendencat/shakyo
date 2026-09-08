import { StateField, Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import type { EditorSnapshot, TextEdit } from './api'
import { LIMITS } from './model'

export const extensionRevision = StateField.define<number>({ create: () => 0, update: (value, transaction) => value + (transaction.docChanged ? 1 : 0) })
export function editorSnapshot(view: EditorView, language: string): EditorSnapshot {
  const { from, to } = view.state.selection.main
  return { text: view.state.doc.toString(), language, revision: view.state.field(extensionRevision), selection: { from, to } }
}
export function applyEditorEdits(view: EditorView, input: { expectedRevision: number; edits: TextEdit[] }) {
  if (view.state.field(extensionRevision) !== input.expectedRevision) throw new Error('エディタが変更されています。内容を取得し直してください。')
  let previous = 0
  let size = view.state.doc.length
  for (const edit of input.edits) {
    if (!Number.isSafeInteger(edit.from) || !Number.isSafeInteger(edit.to) || edit.from < previous || edit.to < edit.from || edit.to > view.state.doc.length) {
      throw new Error('編集範囲が不正または重複しています。')
    }
    previous = edit.to
    size += edit.insert.length - (edit.to - edit.from)
  }
  if (size > LIMITS.message) throw new Error('編集後のテキストが上限を超えます。')
  view.dispatch({ changes: input.edits, annotations: [Transaction.userEvent.of('input.extension'), isolateHistory.of('full')] })
}
