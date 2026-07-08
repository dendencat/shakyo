import { describe, expect, it } from 'vitest'
import { CODE_SAMPLES } from './samples'
import { LANGUAGE_OPTIONS } from './langs'

describe('CODE_SAMPLES', () => {
  it('id がすべてユニークである', () => {
    const ids = CODE_SAMPLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lang がすべて LANGUAGE_OPTIONS に存在する', () => {
    const validLangIds = new Set(LANGUAGE_OPTIONS.map((o) => o.id))
    for (const sample of CODE_SAMPLES) {
      expect(validLangIds.has(sample.lang)).toBe(true)
    }
  })

  it('code が空でない', () => {
    for (const sample of CODE_SAMPLES) {
      expect(sample.code.trim().length).toBeGreaterThan(0)
    }
  })

  it('title が空でない', () => {
    for (const sample of CODE_SAMPLES) {
      expect(sample.title.trim().length).toBeGreaterThan(0)
    }
  })

  it('6件のサンプルが登録されている', () => {
    expect(CODE_SAMPLES.length).toBe(6)
  })
})
