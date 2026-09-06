import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultLayout, getSlotLabels, LAYOUT_PATTERNS, loadLayout, resizeLayout, saveLayout, swapPane } from './layout'
import type { LayoutConfig, PaneId } from './layout'

const permutations: LayoutConfig['panes'][] = [
  ['reference', 'editor', 'explain'], ['reference', 'explain', 'editor'],
  ['editor', 'reference', 'explain'], ['editor', 'explain', 'reference'],
  ['explain', 'reference', 'editor'], ['explain', 'editor', 'reference'],
]

describe('layout', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('初期配置と比率を毎回独立した値として返す', () => {
    const layout = createDefaultLayout()
    expect(loadLayout()).toEqual(layout)
    expect(layout.pattern).toBe('left')
    expect(layout.panes).toEqual(['reference', 'editor', 'explain'])
    layout.ratios.left[0] = 0.7
    layout.panes.reverse()
    expect(createDefaultLayout().ratios.left).toEqual([0.5, 0.5])
    expect(createDefaultLayout().panes).toEqual(['reference', 'editor', 'explain'])
  })

  for (const pattern of LAYOUT_PATTERNS) {
    describe(pattern, () => {
      it.each(permutations.map((panes) => ({ panes })))('配置 $panes を保存・復元し、交換しても3要素を保つ', ({ panes }) => {
        const layout: LayoutConfig = { ...createDefaultLayout(), pattern, panes: [...panes] }
        saveLayout(layout)
        expect(loadLayout()).toEqual(layout)
        for (let slot = 0; slot < 3; slot++) {
          for (const pane of ['reference', 'editor', 'explain'] as PaneId[]) {
            const changed = swapPane(layout, slot, pane)
            expect(changed.panes[slot]).toBe(pane)
            expect(changed.panes[panes.indexOf(pane)]).toBe(panes[slot])
            expect(new Set(changed.panes).size).toBe(3)
            expect(changed.ratios).toEqual(layout.ratios)
          }
        }
        expect(layout.panes).toEqual(panes)
      })

      it('リサイズは対象パターンだけを変更し、各領域15%以上を確保する', () => {
        const original = { ...createDefaultLayout(), pattern }
        let layout = original
        for (const divider of [0, 1] as const) {
          for (const ratio of [-10, 10, 0.5]) {
            layout = resizeLayout(layout, divider, ratio)
            const [first, second] = layout.ratios[pattern]
            const sizes = pattern === 'rows' || pattern === 'columns'
              ? [first, second - first, 1 - second]
              : [first, 1 - first, second, 1 - second]
            expect(sizes.every((size) => size >= 0.15 - Number.EPSILON)).toBe(true)
            saveLayout(layout)
            expect(loadLayout()).toEqual(layout)
          }
        }
        for (const other of LAYOUT_PATTERNS.filter((item) => item !== pattern)) {
          expect(layout.ratios[other]).toEqual(original.ratios[other])
        }
        expect(original.ratios).toEqual(createDefaultLayout().ratios)
      })

      it('配置図に必要な枠名を返す', () => {
        expect(getSlotLabels(pattern)).toHaveLength(3)
        expect(new Set(getSlotLabels(pattern)).size).toBe(3)
      })
    })
  }

  it('パターンを戻すと以前の比率を使用できる', () => {
    let layout = resizeLayout(createDefaultLayout(), 0, 0.6)
    layout = resizeLayout({ ...layout, pattern: 'rows' }, 1, 0.75)
    saveLayout(layout)
    const restored = loadLayout()
    expect(restored.ratios.left).toEqual([0.6, 0.5])
    expect(restored.ratios.rows).toEqual([1 / 3, 0.75])
  })

  it('旧設定を読み込み、保存は新キーだけに行う', () => {
    localStorage.setItem('shakyo.split.main', '0.65')
    localStorage.setItem('shakyo.split.right', '0.4')
    const layout = loadLayout()
    expect(layout.ratios.left).toEqual([0.65, 0.4])
    expect(localStorage.getItem('shakyo.layout')).toBeNull()
    saveLayout(layout)
    expect(localStorage.getItem('shakyo.split.main')).toBe('0.65')
    localStorage.setItem('shakyo.split.main', '0.2')
    expect(loadLayout()).toEqual(layout)
  })

  it('旧設定の比率を制限し、不正値には標準比率を使用する', () => {
    localStorage.setItem('shakyo.split.main', '-1')
    localStorage.setItem('shakyo.split.right', '2')
    expect(loadLayout().ratios.left).toEqual([0.15, 0.85])
    localStorage.setItem('shakyo.split.main', 'NaN')
    localStorage.setItem('shakyo.split.right', 'Infinity')
    expect(loadLayout().ratios.left).toEqual([0.5, 0.5])
  })

  it.each([
    'not json', 'null', '[]', '{}',
    JSON.stringify({ ...createDefaultLayout(), version: 2 }),
    JSON.stringify({ ...createDefaultLayout(), pattern: 'unknown' }),
    JSON.stringify({ ...createDefaultLayout(), panes: ['reference', 'editor', 'editor'] }),
    JSON.stringify({ ...createDefaultLayout(), panes: ['reference', 'editor', 'unknown'] }),
    JSON.stringify({ ...createDefaultLayout(), panes: ['reference', 'editor'] }),
    JSON.stringify({ ...createDefaultLayout(), ratios: { left: [0.5, 0.5] } }),
    ...[[0.1, 0.5], [0.5, 0.9], [0.5, null], ['0.5', 0.5], [0.5, 0.5, 0.5]].map((left) =>
      JSON.stringify({ ...createDefaultLayout(), ratios: { ...createDefaultLayout().ratios, left } })),
    JSON.stringify({ ...createDefaultLayout(), ratios: { ...createDefaultLayout().ratios, columns: [0.4, 0.5] } }),
  ])('不正な保存データは旧設定に戻らず標準設定になる (%s)', (raw) => {
    localStorage.setItem('shakyo.split.main', '0.7')
    localStorage.setItem('shakyo.layout', raw)
    expect(loadLayout()).toEqual(createDefaultLayout())
    expect(localStorage.getItem('shakyo.layout')).toBe(raw)
  })

  it('ストレージの読み込み失敗時は標準配置になる', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(loadLayout()).toEqual(createDefaultLayout())
  })

  it('保存失敗を呼び出し元へ通知する', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveLayout(createDefaultLayout())).toThrow('quota')
  })

  it('非数値のリサイズや存在しない枠への交換では設定を壊さない', () => {
    const layout = createDefaultLayout()
    for (const ratio of [NaN, Infinity, -Infinity]) expect(resizeLayout(layout, 0, ratio)).toEqual(layout)
    for (const slot of [-1, 3, 0.5]) expect(swapPane(layout, slot, 'reference')).toEqual(layout)
  })
})
