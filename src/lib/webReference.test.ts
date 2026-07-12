import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWebBookmark,
  addWebHistory,
  clearWebHistory,
  deleteWebBookmark,
  KEY_WEB_BOOKMARKS,
  KEY_WEB_HISTORY,
  loadWebBookmarks,
  loadWebHistory,
  removeWebHistory,
  updateWebBookmark,
  WEB_HISTORY_LIMIT,
} from './webReference'

describe('webReference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('履歴', () => {
    it('追加した履歴を読み込める', () => {
      vi.spyOn(Date, 'now').mockReturnValue(123)
      expect(addWebHistory('https://example.com')).toEqual([{ url: 'https://example.com', visitedAt: 123 }])
      expect(loadWebHistory()).toEqual([{ url: 'https://example.com', visitedAt: 123 }])
    })

    it('同じURLを重複させず先頭に移動する', () => {
      addWebHistory('https://first.example')
      addWebHistory('https://second.example')
      expect(addWebHistory('https://first.example').map((entry) => entry.url)).toEqual([
        'https://first.example',
        'https://second.example',
      ])
    })

    it('21件追加すると最古の履歴を除いた20件になる', () => {
      for (let index = 0; index <= WEB_HISTORY_LIMIT; index += 1) {
        addWebHistory(`https://example.com/${index}`)
      }
      const history = loadWebHistory()
      expect(history).toHaveLength(WEB_HISTORY_LIMIT)
      expect(history[0].url).toBe('https://example.com/20')
      expect(history.at(-1)?.url).toBe('https://example.com/1')
    })

    it('指定したURLの履歴を削除する', () => {
      addWebHistory('https://first.example')
      addWebHistory('https://second.example')
      expect(removeWebHistory('https://first.example').map((entry) => entry.url)).toEqual(['https://second.example'])
    })

    it('履歴をすべて削除する', () => {
      addWebHistory('https://example.com')
      clearWebHistory()
      expect(loadWebHistory()).toEqual([])
    })

    it('壊れたJSONは空配列として扱う', () => {
      localStorage.setItem(KEY_WEB_HISTORY, '{ invalid')
      expect(loadWebHistory()).toEqual([])
    })

    it('読み込み失敗は空配列として扱う', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      expect(loadWebHistory()).toEqual([])
    })

    it('配列でないJSONは空配列として扱う', () => {
      localStorage.setItem(KEY_WEB_HISTORY, JSON.stringify({ url: 'https://example.com' }))
      expect(loadWebHistory()).toEqual([])
    })

    it('不正な要素を除外する', () => {
      localStorage.setItem(KEY_WEB_HISTORY, JSON.stringify([
        { url: 'https://valid.example', visitedAt: 1 },
        { url: 1, visitedAt: 'bad' },
        null,
      ]))
      expect(loadWebHistory()).toEqual([{ url: 'https://valid.example', visitedAt: 1 }])
    })

    it('保存失敗を無視して計算済みの履歴を返す', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      expect(addWebHistory('https://example.com')).toHaveLength(1)
    })

    it('削除時の保存失敗を無視して計算済みの履歴を返す', () => {
      addWebHistory('https://first.example')
      addWebHistory('https://second.example')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      expect(removeWebHistory('https://first.example').map((entry) => entry.url)).toEqual([
        'https://second.example',
      ])
    })
  })

  describe('ブックマーク', () => {
    it('ID付きで追加したブックマークを読み込める', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
      const bookmarks = addWebBookmark({ name: 'Example', url: 'https://example.com' })
      expect(bookmarks).toEqual([{ id: '00000000-0000-4000-8000-000000000000', name: 'Example', url: 'https://example.com' }])
      expect(loadWebBookmarks()).toEqual(bookmarks)
    })

    it('空白だけの名前にはURLを使用する', () => {
      expect(addWebBookmark({ name: '  ', url: 'https://example.com' })[0].name).toBe('https://example.com')
    })

    it('既存項目を更新し、存在しないIDでは変更しない', () => {
      const [bookmark] = addWebBookmark({ name: '旧名', url: 'https://old.example' })
      expect(updateWebBookmark(bookmark.id, { name: '', url: 'https://new.example' })[0]).toMatchObject({
        name: 'https://new.example', url: 'https://new.example',
      })
      const current = loadWebBookmarks()
      expect(updateWebBookmark('missing', { name: '変更', url: 'https://changed.example' })).toEqual(current)
      expect(loadWebBookmarks()).toEqual(current)
    })

    it('ブックマークを削除する', () => {
      const [bookmark] = addWebBookmark({ name: 'Example', url: 'https://example.com' })
      expect(deleteWebBookmark(bookmark.id)).toEqual([])
    })

    it('壊れたJSONは空配列として扱う', () => {
      localStorage.setItem(KEY_WEB_BOOKMARKS, '{ invalid')
      expect(loadWebBookmarks()).toEqual([])
    })

    it('読み込み失敗は空配列として扱う', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      expect(loadWebBookmarks()).toEqual([])
    })

    it('不正な要素を除外する', () => {
      localStorage.setItem(KEY_WEB_BOOKMARKS, JSON.stringify([
        { id: 'valid', name: 'Example', url: 'https://example.com' },
        { id: 1, name: null, url: false },
      ]))
      expect(loadWebBookmarks()).toEqual([
        { id: 'valid', name: 'Example', url: 'https://example.com' },
      ])
    })

    it('配列でないJSONは空配列として扱う', () => {
      localStorage.setItem(KEY_WEB_BOOKMARKS, JSON.stringify({ id: 'bookmark' }))
      expect(loadWebBookmarks()).toEqual([])
    })

    it('保存失敗時は日本語メッセージのErrorを投げる', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      expect(() => addWebBookmark({ name: 'Example', url: 'https://example.com' })).toThrow(
        '保存に失敗しました。ブラウザの保存領域が不足しています。',
      )
    })

    it('更新の保存失敗時は日本語メッセージのErrorを投げる', () => {
      const [bookmark] = addWebBookmark({ name: 'Example', url: 'https://example.com' })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      expect(() => updateWebBookmark(bookmark.id, { name: '更新', url: bookmark.url })).toThrow(
        '保存に失敗しました。ブラウザの保存領域が不足しています。',
      )
    })

    it('削除の保存失敗時は日本語メッセージのErrorを投げる', () => {
      const [bookmark] = addWebBookmark({ name: 'Example', url: 'https://example.com' })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      expect(() => deleteWebBookmark(bookmark.id)).toThrow(
        '保存に失敗しました。ブラウザの保存領域が不足しています。',
      )
    })
  })
})
