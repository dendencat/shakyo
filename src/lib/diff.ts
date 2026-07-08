export type DiffRangeType = 'mismatch' | 'extra'

export interface DiffRange {
  from: number
  to: number
  type: DiffRangeType
}

export interface DiffResult {
  ranges: DiffRange[]
  excessFrom: number | null
}

export const MAX_DIFF_LENGTH = 500_000

const TRAILING_WHITESPACE = /[ \t]+$/

function stripTrailingWhitespace(line: string): string {
  return line.replace(TRAILING_WHITESPACE, '')
}

function pushRange(ranges: DiffRange[], from: number, to: number, type: DiffRangeType): void {
  if (from === to) return

  const last = ranges[ranges.length - 1]
  if (last !== undefined && last.type === type && last.to === from) {
    last.to = to
    return
  }

  ranges.push({ from, to, type })
}

/**
 * お手本テキスト(reference)の改行コードを LF に正規化する。
 * diffAgainstReference と同じ正規化ロジックを外部から再利用するために公開する。
 */
export function normalizeReference(text: string): string {
  return text.replace(/\r\n|\r/g, '\n')
}

/**
 * お手本テキスト(reference)とエディタ入力(input)を行番号で位置整列し、
 * 行内は文字単位のポジショナル比較で差分を検出する。
 *
 * 前方一致(行の途中・ファイルの途中までの入力)はエラーとして扱わない。
 * オフセットはすべてUTF-16コードユニット単位。
 */
export function diffAgainstReference(input: string, reference: string): DiffResult {
  if (input.length > MAX_DIFF_LENGTH || reference.length > MAX_DIFF_LENGTH) {
    return { ranges: [], excessFrom: null }
  }

  const normalizedReference = normalizeReference(reference)

  const inputLines = input.split('\n')
  const refLines = normalizedReference.split('\n')

  const ranges: DiffRange[] = []
  let excessFrom: number | null = null

  let lineStart = 0
  for (let i = 0; i < inputLines.length; i++) {
    const inputLine = inputLines[i]

    if (i >= refLines.length) {
      // 入力末尾のただ1つの空行(= 最終行を書き終えて Enter を押しただけ)は超過とみなさない
      const isSoleTrailingEmptyLine = i === inputLines.length - 1 && inputLine === ''
      if (!isSoleTrailingEmptyLine) {
        excessFrom = lineStart
      }
      break
    }

    const refLine = refLines[i]
    const inputCore = stripTrailingWhitespace(inputLine)
    const refCore = stripTrailingWhitespace(refLine)
    const minLen = Math.min(inputCore.length, refCore.length)

    for (let j = 0; j < minLen; j++) {
      if (inputCore[j] !== refCore[j]) {
        pushRange(ranges, lineStart + j, lineStart + j + 1, 'mismatch')
      }
    }

    if (inputCore.length > refCore.length) {
      pushRange(ranges, lineStart + refCore.length, lineStart + inputCore.length, 'extra')
    }

    lineStart += inputLine.length + 1
  }

  return { ranges, excessFrom }
}
