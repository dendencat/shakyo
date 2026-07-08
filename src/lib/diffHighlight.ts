import { StateField, StateEffect } from '@codemirror/state'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { diffAgainstReference } from './diff'
import type { DiffResult } from './diff'

// お手本テキストの設定/クリア(null = 判定OFF)
export const setDiffTarget = StateEffect.define<string | null>()

interface DiffHighlightValue {
  reference: string | null
  decorations: DecorationSet
  result: DiffResult | null
}

function buildDecorations(state: EditorState, result: DiffResult): DecorationSet {
  const { ranges, excessFrom } = result
  const decorations: Range<Decoration>[] = []

  for (const range of ranges) {
    if (range.from === range.to) continue
    const className = range.type === 'mismatch' ? 'cm-shakyo-mismatch' : 'cm-shakyo-extra'
    decorations.push(Decoration.mark({ class: className }).range(range.from, range.to))
  }

  if (excessFrom != null) {
    const docLength = state.doc.length
    const startLine = state.doc.lineAt(excessFrom)
    for (let lineNumber = startLine.number; lineNumber <= state.doc.lines; lineNumber++) {
      const line = state.doc.line(lineNumber)
      decorations.push(Decoration.line({ class: 'cm-shakyo-extra-line' }).range(line.from))
    }

    if (excessFrom < docLength) {
      decorations.push(Decoration.mark({ class: 'cm-shakyo-extra' }).range(excessFrom, docLength))
    }
  }

  return Decoration.set(decorations, true)
}

export const diffHighlight = StateField.define<DiffHighlightValue>({
  create(): DiffHighlightValue {
    return { reference: null, decorations: Decoration.none, result: null }
  },
  update(value, tr) {
    let reference = value.reference
    let referenceChanged = false

    for (const effect of tr.effects) {
      if (effect.is(setDiffTarget)) {
        reference = effect.value
        referenceChanged = true
      }
    }

    if (!referenceChanged && !tr.docChanged) {
      return value
    }

    if (reference == null) {
      return { reference, decorations: Decoration.none, result: null }
    }

    const result = diffAgainstReference(tr.state.doc.toString(), reference)
    return { reference, decorations: buildDecorations(tr.state, result), result }
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
})

// diffHighlight フィールドが未登録の state では null を返す
export function getDiffResult(state: EditorState): DiffResult | null {
  return state.field(diffHighlight, false)?.result ?? null
}
