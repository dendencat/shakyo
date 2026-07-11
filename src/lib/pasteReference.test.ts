import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPasteReference,
  KEY_PASTE_REFERENCE,
  loadPasteReference,
  savePasteReference,
} from './pasteReference'

describe('pasteReference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('save した貼り付けお手本を load できる', () => {
    const ref = { text: 'console.log(1)', lang: 'ts' as const }
    savePasteReference(ref)
    expect(loadPasteReference()).toEqual(ref)
  })

  it('壊れたJSONの場合は null を返す', () => {
    localStorage.setItem(KEY_PASTE_REFERENCE, '{ invalid json')
    expect(loadPasteReference()).toBeNull()
  })

  it('形状不正の場合は null を返す', () => {
    localStorage.setItem(KEY_PASTE_REFERENCE, JSON.stringify({ text: 123, lang: 'ts' }))
    expect(loadPasteReference()).toBeNull()
  })

  it('不正な lang の場合は null を返す', () => {
    localStorage.setItem(KEY_PASTE_REFERENCE, JSON.stringify({ text: 'puts 1', lang: 'unknown' }))
    expect(loadPasteReference()).toBeNull()
  })

  it('clear 後は null を返す', () => {
    savePasteReference({ text: 'console.log(1)', lang: 'ts' })
    clearPasteReference()
    expect(loadPasteReference()).toBeNull()
  })

  it('保存時に localStorage.setItem が失敗した場合は日本語メッセージの Error を投げる', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => savePasteReference({ text: 'console.log(1)', lang: 'ts' })).toThrow(
      '保存に失敗しました。ブラウザの保存領域が不足しています。',
    )
  })

  it('読み込み時に localStorage.getItem が失敗した場合は null を返す', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(loadPasteReference()).toBeNull()
  })
})
