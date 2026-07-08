import { beforeEach, describe, expect, it } from 'vitest'
import { loadProgress, saveProgress } from './progress'
import type { ProgressEntry } from './progress'

function makeEntry(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    draft: 'console.log(1)',
    updatedAt: Date.now(),
    progressPct: 50,
    accuracy: 90,
    ...overrides,
  }
}

describe('progress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadProgress / saveProgress', () => {
    it('未保存の場合は null を返す', () => {
      expect(loadProgress('sample.ts')).toBeNull()
    })

    it('保存した進捗を読み込める', () => {
      const entry = makeEntry()
      saveProgress('sample.ts', entry)
      expect(loadProgress('sample.ts')).toEqual(entry)
    })

    it('複数のお手本名を独立に保存・読込できる', () => {
      const entryA = makeEntry({ draft: 'a' })
      const entryB = makeEntry({ draft: 'b' })
      saveProgress('a.ts', entryA)
      saveProgress('b.ts', entryB)
      expect(loadProgress('a.ts')).toEqual(entryA)
      expect(loadProgress('b.ts')).toEqual(entryB)
    })

    it('既存エントリを更新すると updatedAt が新しくなる', () => {
      saveProgress('sample.ts', makeEntry({ updatedAt: 1000, draft: 'old' }))
      saveProgress('sample.ts', makeEntry({ updatedAt: 2000, draft: 'new' }))
      const loaded = loadProgress('sample.ts')
      expect(loaded?.draft).toBe('new')
      expect(loaded?.updatedAt).toBe(2000)
    })
  })

  describe('上限20件のLRU削除', () => {
    it('21件保存すると最も古い(updatedAtが最小の)ものが削除される', () => {
      for (let i = 0; i < 20; i++) {
        saveProgress(`sample-${i}.ts`, makeEntry({ updatedAt: i }))
      }
      // この時点で sample-0.ts (updatedAt=0) が最も古い
      expect(loadProgress('sample-0.ts')).not.toBeNull()

      saveProgress('sample-20.ts', makeEntry({ updatedAt: 20 }))

      expect(loadProgress('sample-0.ts')).toBeNull()
      expect(loadProgress('sample-20.ts')).not.toBeNull()
      // 残り19件 + 新規1件 = 20件のまま
      for (let i = 1; i <= 20; i++) {
        expect(loadProgress(`sample-${i}.ts`)).not.toBeNull()
      }
    })
  })

  describe('壊れたデータへの耐性', () => {
    it('壊れたJSONの場合は空扱いとしてnullを返す', () => {
      localStorage.setItem('shakyo.progress', '{ invalid json')
      expect(loadProgress('sample.ts')).toBeNull()
    })

    it('JSONだが型が不正な場合は空扱いとしてnullを返す', () => {
      localStorage.setItem('shakyo.progress', '"just a string"')
      expect(loadProgress('sample.ts')).toBeNull()
    })

    it('エントリ自体の型が不正な場合はそのエントリのみ無視する', () => {
      const okEntry = makeEntry({ updatedAt: 1000 })
      localStorage.setItem(
        'shakyo.progress',
        JSON.stringify({
          'broken.ts': { draft: 123, updatedAt: 'not-a-number' },
          'ok.ts': okEntry,
        }),
      )
      expect(loadProgress('broken.ts')).toBeNull()
      expect(loadProgress('ok.ts')).toEqual(okEntry)
    })

    it('壊れたJSONの状態で保存しても正しく上書きできる', () => {
      localStorage.setItem('shakyo.progress', '{ invalid json')
      const entry = makeEntry()
      saveProgress('sample.ts', entry)
      expect(loadProgress('sample.ts')).toEqual(entry)
    })
  })
})
