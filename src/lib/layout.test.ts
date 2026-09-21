import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changeLayoutPattern,
  containsPane,
  createDefaultLayout,
  getActivePanes,
  getLayoutSlotCount,
  getSlotLabels,
  LAYOUT_PATTERNS,
  loadLayout,
  rememberPaneLayouts,
  resizeLayout,
  restorePaneLayout,
  saveLayout,
  swapPane,
  THREE_PANE_PATTERNS,
  TWO_PANE_PATTERNS,
} from './layout'
import type { LayoutConfig, PaneId, ThreePaneLayoutPattern } from './layout'

const permutations: LayoutConfig['panes'][] = [
  ['reference', 'editor', 'explain'], ['reference', 'explain', 'editor'],
  ['editor', 'reference', 'explain'], ['editor', 'explain', 'reference'],
  ['explain', 'reference', 'editor'], ['explain', 'editor', 'reference'],
]

function v1Layout(pattern: ThreePaneLayoutPattern = 'left') {
  return {
    version: 1,
    pattern,
    panes: ['explain', 'reference', 'editor'],
    ratios: {
      left: [0.62, 0.41], right: [0.5, 0.5], top: [0.5, 0.5], bottom: [0.5, 0.5],
      columns: [0.25, 0.7], rows: [0.2, 0.8],
    },
  }
}

describe('layout', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('初期配置と比率を毎回独立したv2値として返す', () => {
    const layout = createDefaultLayout()
    expect(loadLayout()).toEqual(layout)
    expect(layout).toMatchObject({ version: 2, pattern: 'left', panes: ['reference', 'editor', 'explain'] })
    expect(LAYOUT_PATTERNS).toHaveLength(9)
    layout.ratios.left[0] = 0.7
    layout.panes.reverse()
    layout.lastPaneLayouts.reference!.panes.reverse()
    expect(createDefaultLayout().ratios.left).toEqual([0.5, 0.5])
    expect(createDefaultLayout().panes).toEqual(['reference', 'editor', 'explain'])
    expect(createDefaultLayout().lastPaneLayouts.reference!.panes).toEqual(['reference', 'editor', 'explain'])
  })

  it.each(LAYOUT_PATTERNS)('%sの有効スロット数と配置図ラベルが一致する', (pattern) => {
    const layout = changeLayoutPattern(createDefaultLayout(), pattern)
    expect(getActivePanes(layout)).toHaveLength(getLayoutSlotCount(pattern))
    expect(getSlotLabels(pattern)).toHaveLength(getLayoutSlotCount(pattern))
    expect(new Set(getSlotLabels(pattern)).size).toBe(getLayoutSlotCount(pattern))
    if (pattern === 'editorOnly') expect(getActivePanes(layout)).toEqual(['editor'])
    if (TWO_PANE_PATTERNS.includes(pattern as never)) expect(getActivePanes(layout)).toContain('editor')
  })

  for (const pattern of THREE_PANE_PATTERNS) {
    it(`${pattern}は全6配置を保存・復元し、交換しても3要素を保つ`, () => {
      for (const panes of permutations) {
        const layout: LayoutConfig = { ...createDefaultLayout(), pattern, panes: [...panes] }
        for (let slot = 0; slot < 3; slot++) {
          for (const pane of ['reference', 'editor', 'explain'] as PaneId[]) {
            const changed = swapPane(layout, slot, pane)
            expect(changed.panes[slot]).toBe(pane)
            expect(new Set(changed.panes).size).toBe(3)
          }
        }
        saveLayout(layout)
        expect(loadLayout()).toEqual(rememberPaneLayouts(layout))
      }
    })
  }

  it.each(TWO_PANE_PATTERNS)('%sはeditorと任意ペイン1つを両配置で保持する', (pattern) => {
    let layout = changeLayoutPattern(createDefaultLayout(), pattern)
    expect(getActivePanes(layout)).toEqual(['reference', 'editor'])
    layout = swapPane(layout, 0, 'editor')
    expect(getActivePanes(layout)).toEqual(['editor', 'reference'])
    layout = swapPane(layout, 1, 'explain')
    expect(getActivePanes(layout)).toEqual(['editor', 'explain'])
    layout = swapPane(layout, 0, 'reference')
    expect(getActivePanes(layout)).toEqual(['reference', 'editor'])
    expect(new Set(layout.panes).size).toBe(3)
    saveLayout(layout)
    expect(loadLayout()).toEqual(rememberPaneLayouts(layout))
  })

  it.each(THREE_PANE_PATTERNS)('%sのリサイズは対象パターンだけを変更し、各領域15%%以上を確保する', (pattern) => {
    const original: LayoutConfig = { ...createDefaultLayout(), pattern }
    let layout: LayoutConfig = original
    for (const divider of [0, 1] as const) {
      for (const ratio of [-10, 10, 0.5]) layout = resizeLayout(layout, divider, ratio)
      const [first, second] = layout.ratios[pattern]
      const sizes = pattern === 'rows' || pattern === 'columns'
        ? [first, second - first, 1 - second]
        : [first, 1 - first, second, 1 - second]
      expect(sizes.every((size) => size >= 0.15 - Number.EPSILON)).toBe(true)
    }
    for (const other of THREE_PANE_PATTERNS.filter((item) => item !== pattern)) {
      expect(layout.ratios[other]).toEqual(original.ratios[other])
    }
  })

  it.each(TWO_PANE_PATTERNS)('%sは1本の境界を15〜85%%で保存する', (pattern) => {
    let layout = changeLayoutPattern(createDefaultLayout(), pattern)
    layout = resizeLayout(layout, 0, -1)
    expect(layout.ratios[pattern]).toEqual([0.15])
    layout = resizeLayout(layout, 0, 2)
    expect(layout.ratios[pattern]).toEqual([0.85])
    expect(resizeLayout(layout, 1, 0.5)).toBe(layout)
  })

  it('ペイン別の直前配置を記憶・復元し、履歴がなければ既定3画面を使う', () => {
    let layout = changeLayoutPattern(createDefaultLayout(), 'columns2')
    layout = swapPane(layout, 1, 'explain')
    layout = rememberPaneLayouts(layout)
    expect(layout.lastPaneLayouts.explain).toMatchObject({ pattern: 'columns2', panes: ['editor', 'explain', 'reference'] })

    layout = changeLayoutPattern(layout, 'editorOnly')
    expect(containsPane(layout, 'explain')).toBe(false)
    const restored = restorePaneLayout(layout, 'explain')
    expect(restored.pattern).toBe('columns2')
    expect(getActivePanes(restored)).toEqual(['editor', 'explain'])

    const noHistory = { ...layout, lastPaneLayouts: { ...layout.lastPaneLayouts, reference: null } }
    expect(restorePaneLayout(noHistory, 'reference')).toMatchObject({
      pattern: 'left', panes: ['reference', 'editor', 'explain'],
    })
  })

  it('v1をv2へ移行し、配置・6パターンの比率・復元履歴を保つ', () => {
    const legacy = v1Layout('rows')
    localStorage.setItem('shakyo.layout', JSON.stringify(legacy))
    const migrated = loadLayout()
    expect(migrated).toMatchObject({ version: 2, pattern: 'rows', panes: legacy.panes })
    expect(migrated.ratios.rows).toEqual([0.2, 0.8])
    expect(migrated.ratios.columns2).toEqual([0.5])
    expect(migrated.lastPaneLayouts.reference).toMatchObject({ pattern: 'rows', panes: legacy.panes })
    expect(migrated.lastPaneLayouts.explain).toMatchObject({ pattern: 'rows', panes: legacy.panes })
  })

  it('旧分割比率は制限して読み、保存はv2キーだけに行う', () => {
    localStorage.setItem('shakyo.split.main', '0.65')
    localStorage.setItem('shakyo.split.right', '0.4')
    const layout = loadLayout()
    expect(layout.ratios.left).toEqual([0.65, 0.4])
    saveLayout(layout)
    expect(JSON.parse(localStorage.getItem('shakyo.layout')!).version).toBe(2)
    expect(localStorage.getItem('shakyo.split.main')).toBe('0.65')
    localStorage.clear()
    localStorage.setItem('shakyo.split.main', '-1')
    localStorage.setItem('shakyo.split.right', 'Infinity')
    expect(loadLayout().ratios.left).toEqual([0.15, 0.5])
  })

  it.each([
    'not json', 'null', '[]', '{}',
    JSON.stringify({ ...createDefaultLayout(), pattern: 'unknown' }),
    JSON.stringify({ ...createDefaultLayout(), panes: ['reference', 'editor', 'editor'] }),
    JSON.stringify({ ...createDefaultLayout(), ratios: { ...createDefaultLayout().ratios, columns2: [0.5, 0.6] } }),
    JSON.stringify({ ...changeLayoutPattern(createDefaultLayout(), 'columns2'), panes: ['reference', 'explain', 'editor'] }),
    JSON.stringify({ ...changeLayoutPattern(createDefaultLayout(), 'editorOnly'), panes: ['reference', 'editor', 'explain'] }),
  ])('不正な保存データは標準設定に戻る (%s)', (raw) => {
    localStorage.setItem('shakyo.layout', raw)
    expect(loadLayout()).toEqual(createDefaultLayout())
    expect(localStorage.getItem('shakyo.layout')).toBe(raw)
  })

  it('ストレージ読込み失敗は標準配置、保存失敗は呼出元に通知する', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(loadLayout()).toEqual(createDefaultLayout())
    vi.restoreAllMocks()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveLayout(createDefaultLayout())).toThrow('quota')
  })

  it('非数値リサイズ、範囲外枠、editor-onlyの交換は設定を壊さない', () => {
    const layout = createDefaultLayout()
    for (const ratio of [NaN, Infinity, -Infinity]) expect(resizeLayout(layout, 0, ratio)).toBe(layout)
    for (const slot of [-1, 3, 0.5]) expect(swapPane(layout, slot, 'reference')).toBe(layout)
    const editorOnly = changeLayoutPattern(layout, 'editorOnly')
    expect(swapPane(editorOnly, 0, 'reference')).toBe(editorOnly)
    expect(resizeLayout(editorOnly, 0, 0.7)).toBe(editorOnly)
  })
})
