import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { diffHighlight, setDiffTarget } from './diffHighlight'

function decorationCount(state: EditorState): number {
  let count = 0
  state.field(diffHighlight).decorations.between(0, state.doc.length, () => {
    count++
  })
  return count
}

describe('diffHighlight', () => {
  it('setDiffTarget で reference を設定すると decorations が期待数生成される', () => {
    const state = EditorState.create({
      doc: 'hallo',
      extensions: [diffHighlight],
    })

    const tr = state.update({ effects: setDiffTarget.of('hello') })
    const nextState = tr.state

    // 'hallo' vs 'hello' → 1文字目('a' vs 'e')が mismatch レンジ1件
    expect(decorationCount(nextState)).toBe(1)
    expect(nextState.field(diffHighlight).reference).toBe('hello')
  })

  it('reference 設定後にドキュメントを変更すると decorations が再計算される', () => {
    let state = EditorState.create({
      doc: 'hallo',
      extensions: [diffHighlight],
    })

    state = state.update({ effects: setDiffTarget.of('hello') }).state
    expect(decorationCount(state)).toBe(1)

    // 誤りを修正するドキュメント変更
    state = state.update({ changes: { from: 0, to: 5, insert: 'hello' } }).state
    expect(decorationCount(state)).toBe(0)
  })

  it('setDiffTarget.of(null) で decorations が空になる', () => {
    let state = EditorState.create({
      doc: 'hallo',
      extensions: [diffHighlight],
    })

    state = state.update({ effects: setDiffTarget.of('hello') }).state
    expect(decorationCount(state)).toBe(1)

    state = state.update({ effects: setDiffTarget.of(null) }).state
    expect(decorationCount(state)).toBe(0)
    expect(state.field(diffHighlight).reference).toBeNull()
  })

  it('excessFrom がある入力では超過行数分の line デコレーションが生成される', () => {
    const state = EditorState.create({
      doc: 'line1\nline2\nline3\nline4',
      extensions: [diffHighlight],
    })

    // reference は2行のみ → 3,4行目が超過
    const nextState = state.update({ effects: setDiffTarget.of('line1\nline2') }).state

    let lineDecorationCount = 0
    let markDecorationCount = 0
    nextState
      .field(diffHighlight)
      .decorations.between(0, nextState.doc.length, (_from, _to, deco) => {
        if (deco.spec.class === 'cm-shakyo-extra-line') {
          lineDecorationCount++
        } else if (deco.spec.class === 'cm-shakyo-extra') {
          markDecorationCount++
        }
      })

    // 超過は line3, line4 の2行
    expect(lineDecorationCount).toBe(2)
    // 超過テキスト範囲は1つの mark レンジにまとまる
    expect(markDecorationCount).toBe(1)
  })

  it('入力末尾のただ1つの空行は超過とみなされず decorations が生成されない(修正1)', () => {
    const state = EditorState.create({
      doc: 'abc\n',
      extensions: [diffHighlight],
    })

    const nextState = state.update({ effects: setDiffTarget.of('abc') }).state

    expect(decorationCount(nextState)).toBe(0)
  })

  it('超過テキストが存在する場合(excessFrom < docLength)は line デコレーションに加えて mark デコレーションも生成される', () => {
    const state = EditorState.create({
      doc: 'abc\n\n',
      extensions: [diffHighlight],
    })

    // reference は1行のみ → 2,3行目(空行2つ)が超過。最初の超過行(2行目)の行頭が
    // excessFrom(4) になり、doc 長(5) より小さいため mark デコレーションも生成される
    const nextState = state.update({ effects: setDiffTarget.of('abc') }).state

    let lineDecorationCount = 0
    let markDecorationCount = 0
    nextState
      .field(diffHighlight)
      .decorations.between(0, nextState.doc.length, (_from, _to, deco) => {
        if (deco.spec.class === 'cm-shakyo-extra-line') {
          lineDecorationCount++
        } else if (deco.spec.class === 'cm-shakyo-extra') {
          markDecorationCount++
        }
      })

    expect(lineDecorationCount).toBe(2)
    expect(markDecorationCount).toBe(1)
  })
})
