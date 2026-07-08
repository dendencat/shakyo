import { describe, expect, it } from 'vitest'
import { diffAgainstReference, normalizeReference } from './diff'
import { accuracyPercent, countErrorChars, progressPercent, wordsPerMinute } from './stats'

describe('countErrorChars', () => {
  it('ranges の (to-from) 合計を返す', () => {
    const result = diffAgainstReference('hallo', 'hello')
    expect(countErrorChars(result, 5)).toBe(1)
  })

  it('excessFrom がある場合は入力末尾の超過分を加算する', () => {
    const result = diffAgainstReference('abc\nextra', 'abc')
    // excessFrom は 'extra' 行の開始位置(4)。errorChars = ranges合計(0) + (9 - 4) = 5
    const inputLength = 'abc\nextra'.length
    expect(countErrorChars(result, inputLength)).toBe(5)
  })

  it('誤りがない場合は0を返す', () => {
    const result = diffAgainstReference('hello', 'hello')
    expect(countErrorChars(result, 5)).toBe(0)
  })
})

describe('accuracyPercent', () => {
  it('inputLength が0のときは null を返す', () => {
    const result = diffAgainstReference('', 'hello')
    expect(accuracyPercent(result, 0)).toBeNull()
  })

  it('誤りがない場合は100を返す', () => {
    const result = diffAgainstReference('hello', 'hello')
    expect(accuracyPercent(result, 5)).toBe(100)
  })

  it('誤り文字がある場合は正確率が下がる', () => {
    const result = diffAgainstReference('hallo', 'hello')
    // errorChars=1, inputLength=5 → (5-1)/5*100 = 80
    expect(accuracyPercent(result, 5)).toBe(80)
  })

  it('excessFrom がある場合も正確率に反映される', () => {
    const result = diffAgainstReference('abc\nextra', 'abc')
    const inputLength = 'abc\nextra'.length
    // errorChars=5, inputLength=9 → (9-5)/9*100 = 44.44... → 44
    expect(accuracyPercent(result, inputLength)).toBe(44)
  })
})

describe('progressPercent', () => {
  it('referenceLength が0のときは null を返す', () => {
    expect(progressPercent(5, 0)).toBeNull()
  })

  it('入力途中の進捗率を返す', () => {
    expect(progressPercent(5, 10)).toBe(50)
  })

  it('inputLength が referenceLength を超えても100%にクランプされる', () => {
    expect(progressPercent(20, 10)).toBe(100)
  })

  it('完全一致(同じ長さ)の場合は100を返す', () => {
    expect(progressPercent(10, 10)).toBe(100)
  })

  it('CRLF のお手本は正規化後の長さを分母にすることで100%に到達する', () => {
    // reference は 'a\r\nb'(生の長さ4)だが、正規化後は 'a\nb'(長さ3)
    const reference = 'a\r\nb'
    const input = 'a\nb'
    // 生の reference.length(4)を分母にすると 3/4*100=75 で100%に届かない(修正前のバグ)
    expect(progressPercent(input.length, reference.length)).not.toBe(100)
    // normalizeReference した長さ(3)を分母にすれば100%に到達する
    expect(progressPercent(input.length, normalizeReference(reference).length)).toBe(100)
  })
})

describe('wordsPerMinute', () => {
  it('経過時間が5秒未満のときは null を返す(序盤の異常値回避)', () => {
    expect(wordsPerMinute(100, 4999)).toBeNull()
  })

  it('経過時間がちょうど5秒のときは値を返す', () => {
    // 100文字 / 5 = 20語, 5000ms = 1/12分 → 20 / (1/12) = 240
    expect(wordsPerMinute(100, 5000)).toBe(240)
  })

  it('1分間で50語相当のタイプで50を返す', () => {
    // 250文字 / 5 = 50語, 60000ms = 1分
    expect(wordsPerMinute(250, 60000)).toBe(50)
  })

  it('打鍵数が0のときは0を返す', () => {
    expect(wordsPerMinute(0, 60000)).toBe(0)
  })
})
