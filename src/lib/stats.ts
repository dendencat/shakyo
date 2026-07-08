import type { DiffResult } from './diff'

/**
 * 誤り文字数を算出する。
 * ranges の (to-from) 合計に加え、excessFrom がある場合は入力末尾の超過分
 * (inputLength - excessFrom) を加算する。
 */
export function countErrorChars(result: DiffResult, inputLength: number): number {
  let errorChars = 0
  for (const range of result.ranges) {
    errorChars += range.to - range.from
  }

  if (result.excessFrom != null) {
    errorChars += inputLength - result.excessFrom
  }

  return errorChars
}

/**
 * 正確率(0-100の整数%)を算出する。
 * inputLength が0のときは null を返す。
 */
export function accuracyPercent(result: DiffResult, inputLength: number): number | null {
  if (inputLength === 0) return null

  const errorChars = countErrorChars(result, inputLength)
  return Math.round(((inputLength - errorChars) / inputLength) * 100)
}

/**
 * 進捗率(0-100の整数%)を算出する。
 * referenceLength が0のときは null を返す。100%を超える場合はクランプする。
 */
export function progressPercent(inputLength: number, referenceLength: number): number | null {
  if (referenceLength === 0) return null

  return Math.min(100, Math.round((inputLength / referenceLength) * 100))
}

/**
 * WPM(1分あたりの単語数)を算出する。
 * elapsedMs が5秒未満の場合は序盤の異常値を避けるため null を返す。
 */
export function wordsPerMinute(typedChars: number, elapsedMs: number): number | null {
  if (elapsedMs < 5000) return null

  const minutes = elapsedMs / 60000
  return Math.round(typedChars / 5 / minutes)
}
