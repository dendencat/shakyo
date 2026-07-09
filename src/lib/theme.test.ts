import { beforeEach, describe, expect, it } from 'vitest'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('resolveTheme', () => {
    it('light指定はsystemPrefersDarkに関わらずlightを返す(dark環境)', () => {
      expect(resolveTheme('light', true)).toBe('light')
    })

    it('light指定はsystemPrefersDarkに関わらずlightを返す(light環境)', () => {
      expect(resolveTheme('light', false)).toBe('light')
    })

    it('dark指定はsystemPrefersDarkに関わらずdarkを返す(dark環境)', () => {
      expect(resolveTheme('dark', true)).toBe('dark')
    })

    it('dark指定はsystemPrefersDarkに関わらずdarkを返す(light環境)', () => {
      expect(resolveTheme('dark', false)).toBe('dark')
    })

    it('system指定でOSがダーク設定の場合はdarkを返す', () => {
      expect(resolveTheme('system', true)).toBe('dark')
    })

    it('system指定でOSがライト設定の場合はlightを返す', () => {
      expect(resolveTheme('system', false)).toBe('light')
    })
  })

  describe('loadThemePref', () => {
    it('未設定の場合はsystemを返す', () => {
      expect(loadThemePref()).toBe('system')
    })

    it('不正な値が保存されている場合はsystemにフォールバックする', () => {
      localStorage.setItem('shakyo.theme', 'blue')
      expect(loadThemePref()).toBe('system')
    })

    it('lightが保存されている場合はlightを返す', () => {
      localStorage.setItem('shakyo.theme', 'light')
      expect(loadThemePref()).toBe('light')
    })

    it('darkが保存されている場合はdarkを返す', () => {
      localStorage.setItem('shakyo.theme', 'dark')
      expect(loadThemePref()).toBe('dark')
    })

    it('systemが保存されている場合はsystemを返す', () => {
      localStorage.setItem('shakyo.theme', 'system')
      expect(loadThemePref()).toBe('system')
    })
  })

  describe('nextThemePref', () => {
    it('lightの次はdark', () => {
      expect(nextThemePref('light')).toBe('dark')
    })

    it('darkの次はsystem', () => {
      expect(nextThemePref('dark')).toBe('system')
    })

    it('systemの次はlightに循環する', () => {
      expect(nextThemePref('system')).toBe('light')
    })
  })

  describe('saveThemePref / loadThemePref', () => {
    it('保存した値がそのまま読み込める(往復)', () => {
      saveThemePref('dark')
      expect(loadThemePref()).toBe('dark')
    })

    it('light保存→読込の往復', () => {
      saveThemePref('light')
      expect(loadThemePref()).toBe('light')
    })

    it('system保存→読込の往復', () => {
      saveThemePref('system')
      expect(loadThemePref()).toBe('system')
    })
  })
})
