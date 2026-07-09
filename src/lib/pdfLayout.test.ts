import { describe, expect, it } from 'vitest'
import { fitScale, pageCssSize } from './pdfLayout'

describe('fitScale', () => {
  it('コンテナ幅からパディング24pxを控除してscaleを算出する', () => {
    expect(fitScale(624, 600)).toBeCloseTo(1)
    expect(fitScale(324, 600)).toBeCloseTo(0.5)
  })

  it('計算結果が0.5未満になる場合は0.5にクランプする', () => {
    expect(fitScale(100, 600)).toBe(0.5)
  })

  it('containerWidthが0以下の場合は最小スケール0.5を返す', () => {
    expect(fitScale(0, 600)).toBe(0.5)
    expect(fitScale(-10, 600)).toBe(0.5)
  })

  it('baseWidthが0以下の場合は最小スケール0.5を返す', () => {
    expect(fitScale(800, 0)).toBe(0.5)
    expect(fitScale(800, -1)).toBe(0.5)
  })
})

describe('pageCssSize', () => {
  it('基準寸法とscaleからCSS表示寸法を算出する', () => {
    expect(pageCssSize({ width: 600, height: 800 }, 1)).toEqual({ width: 600, height: 800 })
    expect(pageCssSize({ width: 600, height: 800 }, 0.5)).toEqual({ width: 300, height: 400 })
  })

  it('scaleが0の場合は幅・高さとも0になる', () => {
    expect(pageCssSize({ width: 600, height: 800 }, 0)).toEqual({ width: 0, height: 0 })
  })
})
