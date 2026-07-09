import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL,
  isSettingsStorageKey,
  KEY_DRAFT,
  KEY_EDITOR_LANG,
  loadSettings,
  saveSettings,
} from './settings'

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadSettings', () => {
    it('未保存の場合はデフォルト値を返す', () => {
      expect(loadSettings()).toEqual({ apiKey: '', model: DEFAULT_MODEL })
    })

    it('保存済みの値を読み込む', () => {
      localStorage.setItem('shakyo.openai.apiKey', 'sk-test123')
      localStorage.setItem('shakyo.openai.model', 'gpt-5.4')
      expect(loadSettings()).toEqual({ apiKey: 'sk-test123', model: 'gpt-5.4' })
    })
  })

  describe('saveSettings', () => {
    it('設定値を保存し、再読込で同じ値が返る', () => {
      saveSettings({ apiKey: 'sk-abc', model: 'gpt-5.4-nano' })
      expect(loadSettings()).toEqual({ apiKey: 'sk-abc', model: 'gpt-5.4-nano' })
    })

    it('modelが空文字の場合はデフォルトモデルを保存する', () => {
      saveSettings({ apiKey: 'sk-abc', model: '' })
      expect(loadSettings()).toEqual({ apiKey: 'sk-abc', model: DEFAULT_MODEL })
    })

    it('apiKeyが空文字でも保存できる', () => {
      saveSettings({ apiKey: '', model: 'gpt-5.4-nano' })
      expect(loadSettings()).toEqual({ apiKey: '', model: 'gpt-5.4-nano' })
    })
  })

  it('KEY_DRAFT / KEY_EDITOR_LANG は個別のlocalStorageキーとして利用できる', () => {
    localStorage.setItem(KEY_DRAFT, 'console.log(1)')
    localStorage.setItem(KEY_EDITOR_LANG, 'ts')
    expect(localStorage.getItem(KEY_DRAFT)).toBe('console.log(1)')
    expect(localStorage.getItem(KEY_EDITOR_LANG)).toBe('ts')
  })

  describe('isSettingsStorageKey', () => {
    it('APIキーのキーの場合はtrueを返す', () => {
      expect(isSettingsStorageKey('shakyo.openai.apiKey')).toBe(true)
    })

    it('モデル名のキーの場合はtrueを返す', () => {
      expect(isSettingsStorageKey('shakyo.openai.model')).toBe(true)
    })

    it('keyがnullの場合はtrueを返す(localStorage.clear()相当)', () => {
      expect(isSettingsStorageKey(null)).toBe(true)
    })

    it('shakyo.editor.draftの場合はfalseを返す', () => {
      expect(isSettingsStorageKey(KEY_DRAFT)).toBe(false)
    })

    it('無関係な任意の文字列の場合はfalseを返す', () => {
      expect(isSettingsStorageKey('some.unrelated.key')).toBe(false)
    })
  })
})
