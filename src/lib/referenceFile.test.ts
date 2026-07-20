import { describe, expect, it, vi } from 'vitest'
import { MAX_TEXT_REFERENCE_BYTES, readTextReferenceFile } from './referenceFile'

describe('readTextReferenceFile', () => {
  it('500,000 bytes以下のファイルはtextを読み込む', async () => {
    const text = vi.fn().mockResolvedValue('console.log(1)')

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES, text })).resolves.toBe('console.log(1)')
    expect(text).toHaveBeenCalledOnce()
  })

  it('500,001 bytesのファイルはtextを呼ばず日本語エラーにする', async () => {
    const text = vi.fn().mockResolvedValue('too large')

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES + 1, text })).rejects.toThrow(
      'テキストファイルが大きすぎます。500 KB以下のファイルを選択してください。',
    )
    expect(text).not.toHaveBeenCalled()
  })

  it('textの失敗を伝播する', async () => {
    const error = new Error('decode failed')
    const text = vi.fn().mockRejectedValue(error)

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES, text })).rejects.toBe(error)
  })
})
