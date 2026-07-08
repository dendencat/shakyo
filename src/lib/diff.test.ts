import { describe, expect, it } from 'vitest'
import { diffAgainstReference, MAX_DIFF_LENGTH, normalizeReference } from './diff'

describe('diffAgainstReference', () => {
  it('完全一致の場合は ranges が空で excessFrom も null になる', () => {
    const reference = 'const a = 1\nconst b = 2'
    const input = 'const a = 1\nconst b = 2'
    expect(diffAgainstReference(input, reference)).toEqual({ ranges: [], excessFrom: null })
  })

  it('前方一致(行の途中・ファイルの途中まで)はエラーにならない', () => {
    const reference = 'const a = 1\nconst b = 2'

    // 行の途中まで入力
    expect(diffAgainstReference('const a = 1\nconst b', reference)).toEqual({
      ranges: [],
      excessFrom: null,
    })

    // 1行目だけ(ファイルの途中まで)
    expect(diffAgainstReference('const a = 1', reference)).toEqual({
      ranges: [],
      excessFrom: null,
    })
  })

  it('入力が空文字列の場合は ranges が空で excessFrom も null になる', () => {
    const reference = 'hello\nworld'
    expect(diffAgainstReference('', reference)).toEqual({ ranges: [], excessFrom: null })
  })

  it('1文字違いの場合はその1文字のみが mismatch レンジになる', () => {
    const reference = 'hello'
    const input = 'hallo'
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 1, to: 2, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('連続する誤り文字は単一の mismatch レンジにマージされる', () => {
    const reference = 'hello'
    const input = 'hxyzo'
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 1, to: 4, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('2行目の誤りのオフセットが改行を含めて正しく計算される', () => {
    const reference = 'abc\ndef'
    const input = 'abc\ndxf'
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 5, to: 6, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('行内でお手本より長く入力した場合、超過分が extra レンジになる', () => {
    const reference = 'ab'
    const input = 'abcd'
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 2, to: 4, type: 'extra' }],
      excessFrom: null,
    })
  })

  it('お手本の行数を超える入力は excessFrom がその行頭オフセットになる', () => {
    const reference = 'line1\nline2'
    const input = 'line1\nline2\nline3'
    // "line1\n" = 6文字, "line2\n" = 6文字 → 3行目の行頭は12
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [],
      excessFrom: 12,
    })
  })

  it('1行目に typo があっても2行目が正しければ2行目はエラーにならない(カスケード抑止)', () => {
    const reference = 'abc\ndef'
    const input = 'ayc\ndef'
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 1, to: 2, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('お手本が CRLF でも LF 入力と一致扱いになる', () => {
    const reference = 'abc\r\ndef'
    const input = 'abc\ndef'
    expect(diffAgainstReference(input, reference)).toEqual({ ranges: [], excessFrom: null })
  })

  it('行末空白の差は無視され、行中のタブ vs スペースは mismatch になる', () => {
    // 行末の空白差は無視される
    const referenceTrailing = 'hello   '
    const inputNoTrailing = 'hello'
    expect(diffAgainstReference(inputNoTrailing, referenceTrailing)).toEqual({
      ranges: [],
      excessFrom: null,
    })

    // 行中のタブ vs スペースは厳密比較で mismatch
    const referenceTab = '\tfoo();'
    const inputSpace = ' foo();'
    expect(diffAgainstReference(inputSpace, referenceTab)).toEqual({
      ranges: [{ from: 0, to: 1, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('日本語・絵文字(サロゲートペア)を含む場合もオフセットが UTF-16 単位で正しい', () => {
    const reference = 'abc😀def'
    const input = 'abc😀dXf'
    // "abc" (3) + 😀 (サロゲートペアで2コードユニット) + "d" (1) = offset 6 から誤り
    expect(diffAgainstReference(input, reference)).toEqual({
      ranges: [{ from: 6, to: 7, type: 'mismatch' }],
      excessFrom: null,
    })
  })

  it('入力末尾のただ1つの空行(Enter押下直後)は超過とみなされない', () => {
    const reference = 'abc\ndef'
    const input = 'abc\ndef\n'
    expect(diffAgainstReference(input, reference)).toEqual({ ranges: [], excessFrom: null })
  })

  it('入力末尾に空行が2つ以上ある場合は最初の超過行から excess になる', () => {
    const reference = 'abc\ndef'
    const input = 'abc\ndef\n\n'
    // "abc\n" = 4文字, "def\n" = 4文字 → 3行目(超過1行目)の行頭は8
    expect(diffAgainstReference(input, reference)).toEqual({ ranges: [], excessFrom: 8 })
  })

  it('超過行が空行でない場合は従来通り excess になる', () => {
    const reference = 'abc\ndef'
    const input = 'abc\ndef\nx'
    expect(diffAgainstReference(input, reference)).toEqual({ ranges: [], excessFrom: 8 })
  })

  it('MAX_DIFF_LENGTH を超える入力またはお手本の場合は空の結果を返す', () => {
    const hugeInput = 'a'.repeat(MAX_DIFF_LENGTH + 1)
    const reference = 'a'.repeat(10)
    expect(diffAgainstReference(hugeInput, reference)).toEqual({ ranges: [], excessFrom: null })

    const hugeReference = 'a'.repeat(MAX_DIFF_LENGTH + 1)
    const input = 'a'.repeat(10)
    expect(diffAgainstReference(input, hugeReference)).toEqual({ ranges: [], excessFrom: null })
  })
})

describe('normalizeReference', () => {
  it('CRLF を LF に正規化する', () => {
    expect(normalizeReference('a\r\nb')).toBe('a\nb')
  })

  it('CR のみも LF に正規化する', () => {
    expect(normalizeReference('a\rb')).toBe('a\nb')
  })

  it('すでに LF の場合はそのまま返す', () => {
    expect(normalizeReference('a\nb')).toBe('a\nb')
  })
})
