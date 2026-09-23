import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  isSettingsStorageKey,
  KEY_DRAFT,
  KEY_EDITOR_LANG,
  loadSettings,
  initializeApiKey,
  resetApiKeyStateForTest,
  normalizeReasoningEffort,
  normalizeSettings,
  saveSettings,
} from './settings'

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
    resetApiKeyStateForTest()
  })

  describe('loadSettings', () => {
    it('未保存の場合はデフォルト値を返す', () => {
      expect(loadSettings()).toEqual({
        apiKey: '',
        model: DEFAULT_MODEL,
        reasoningEffort: DEFAULT_REASONING_EFFORT,
        allowHighPerformanceModels: false,
      })
    })

    it('旧APIキーをメモリへ移し、localStorageから削除する', async () => {
      localStorage.setItem('shakyo.openai.apiKey', 'sk-test123')
      localStorage.setItem('shakyo.openai.model', 'gpt-5.4')
      localStorage.setItem('shakyo.openai.reasoningEffort', 'high')
      await initializeApiKey()
      expect(localStorage.getItem('shakyo.openai.apiKey')).toBeNull()
      expect(loadSettings()).toEqual({
        apiKey: 'sk-test123',
        model: DEFAULT_MODEL,
        reasoningEffort: 'high',
        allowHighPerformanceModels: false,
      })
    })

    it('reasoningEffortが不正な値の場合はnoneにフォールバックする', () => {
      localStorage.setItem('shakyo.openai.reasoningEffort', 'invalid-value')
      expect(loadSettings().reasoningEffort).toBe('none')
    })

    it('旧minimalをnoneへ移行する', () => {
      localStorage.setItem('shakyo.openai.reasoningEffort', 'minimal')
      expect(loadSettings().reasoningEffort).toBe('none')
    })

    it('高性能モデルが無効なとき既知の高性能モデルをLunaへ戻す', () => {
      localStorage.setItem('shakyo.openai.model', 'gpt-5.6-sol')
      expect(loadSettings().model).toBe(DEFAULT_MODEL)
    })
  })

  describe('saveSettings', () => {
    it('Web版の再読み込み後はキーを復元しない', async () => {
      await saveSettings({ apiKey: 'sk-session', model: DEFAULT_MODEL, reasoningEffort: 'none', allowHighPerformanceModels: false })
      expect(loadSettings().apiKey).toBe('sk-session')
      resetApiKeyStateForTest() // 新しいページのメモリ状態
      expect(loadSettings().apiKey).toBe('')
      expect(localStorage.getItem('shakyo.openai.apiKey')).toBeNull()
    })
    it('設定値を保存し、再読込で同じ値が返る', async () => {
      await saveSettings({ apiKey: 'sk-abc', model: 'gpt-5.6-terra', reasoningEffort: 'low', allowHighPerformanceModels: false })
      expect(localStorage.getItem('shakyo.openai.apiKey')).toBeNull()
      expect(loadSettings()).toEqual({ apiKey: 'sk-abc', model: 'gpt-5.6-terra', reasoningEffort: 'low', allowHighPerformanceModels: false })
    })

    it('modelが空文字の場合はデフォルトモデルを保存する', async () => {
      await saveSettings({ apiKey: 'sk-abc', model: '', reasoningEffort: DEFAULT_REASONING_EFFORT, allowHighPerformanceModels: false })
      expect(loadSettings()).toEqual({
        apiKey: 'sk-abc',
        model: DEFAULT_MODEL,
        reasoningEffort: DEFAULT_REASONING_EFFORT,
        allowHighPerformanceModels: false,
      })
    })

    it('apiKeyが空文字でも保存できる', async () => {
      await saveSettings({ apiKey: '', model: 'gpt-5.6-terra', reasoningEffort: DEFAULT_REASONING_EFFORT, allowHighPerformanceModels: false })
      expect(loadSettings()).toEqual({
        apiKey: '',
        model: 'gpt-5.6-terra',
        reasoningEffort: DEFAULT_REASONING_EFFORT,
        allowHighPerformanceModels: false,
      })
    })

    it('高性能モデルの許可とAstra向けの実効エフォートを保存する', async () => {
      await saveSettings({ apiKey: '', model: 'gpt-6-astra', reasoningEffort: 'none', allowHighPerformanceModels: true })
      expect(loadSettings()).toEqual({
        apiKey: '',
        model: 'gpt-6-astra',
        reasoningEffort: 'low',
        allowHighPerformanceModels: true,
      })
    })
  })

  describe('normalization', () => {
    it('Astraのnoneだけをlowへ正規化する', () => {
      expect(normalizeReasoningEffort('none', 'gpt-6-astra')).toBe('low')
      expect(normalizeReasoningEffort('none', 'gpt-5.6-sol')).toBe('none')
    })

    it('高性能設定を無効化するとSolからLunaへ戻す', () => {
      expect(normalizeSettings({
        apiKey: '',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'max',
        allowHighPerformanceModels: false,
      }).model).toBe(DEFAULT_MODEL)
    })

    it('許可リスト外の旧・未知モデルをLunaへ移行する', () => {
      expect(normalizeSettings({
        apiKey: '',
        model: 'gpt-5.4-mini',
        reasoningEffort: 'high',
        allowHighPerformanceModels: true,
      }).model).toBe(DEFAULT_MODEL)
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

    it('解説の深さのキーの場合はtrueを返す', () => {
      expect(isSettingsStorageKey('shakyo.openai.reasoningEffort')).toBe(true)
    })

    it('高性能モデル設定のキーの場合はtrueを返す', () => {
      expect(isSettingsStorageKey('shakyo.openai.highPerformanceModels')).toBe(true)
    })
  })
})
