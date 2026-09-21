export type PaneId = 'reference' | 'editor' | 'explain'

export const THREE_PANE_PATTERNS = ['left', 'right', 'top', 'bottom', 'columns', 'rows'] as const
export const TWO_PANE_PATTERNS = ['columns2', 'rows2'] as const
export const LAYOUT_PATTERNS = [...THREE_PANE_PATTERNS, ...TWO_PANE_PATTERNS, 'editorOnly'] as const

export type ThreePaneLayoutPattern = typeof THREE_PANE_PATTERNS[number]
export type TwoPaneLayoutPattern = typeof TWO_PANE_PATTERNS[number]
export type MultiPaneLayoutPattern = ThreePaneLayoutPattern | TwoPaneLayoutPattern
export type LayoutPattern = typeof LAYOUT_PATTERNS[number]
export type PaneOrder = [PaneId, PaneId, PaneId]

export interface LayoutRatios {
  left: [number, number]
  right: [number, number]
  top: [number, number]
  bottom: [number, number]
  columns: [number, number]
  rows: [number, number]
  columns2: [number]
  rows2: [number]
}

export interface PaneLayoutSnapshot {
  pattern: MultiPaneLayoutPattern
  panes: PaneOrder
}

export interface PaneLayoutHistory {
  reference: PaneLayoutSnapshot | null
  explain: PaneLayoutSnapshot | null
}

export interface LayoutConfig {
  version: 2
  pattern: LayoutPattern
  /**
   * Slot order for the active pattern. Inactive entries are retained so that
   * switching patterns never has to discard another pane's placement.
   */
  panes: PaneOrder
  ratios: LayoutRatios
  /** Last multi-pane layout in which each optional pane was visible. */
  lastPaneLayouts: PaneLayoutHistory
}

interface LayoutConfigV1 {
  version: 1
  pattern: ThreePaneLayoutPattern
  panes: PaneOrder
  ratios: Record<ThreePaneLayoutPattern, [number, number]>
}

export const PANE_LABELS: Record<PaneId, string> = {
  reference: 'お手本',
  editor: '写経エディタ',
  explain: '解説',
}
export const PATTERN_LABELS: Record<LayoutPattern, string> = {
  left: '左1枚＋右上下',
  right: '右1枚＋左上下',
  top: '上1枚＋下左右',
  bottom: '下1枚＋上左右',
  columns: '横3列',
  rows: '縦3段',
  columns2: '横2列',
  rows2: '縦2段',
  editorOnly: '1画面（写経エディタ）',
}

const KEY_LAYOUT = 'shakyo.layout'
const MIN_RATIO = 0.15
const MAX_RATIO = 0.85
const OPTIONAL_PANES = ['reference', 'explain'] as const

function defaultRatios(): LayoutRatios {
  return {
    left: [0.5, 0.5], right: [0.5, 0.5], top: [0.5, 0.5], bottom: [0.5, 0.5],
    columns: [1 / 3, 2 / 3], rows: [1 / 3, 2 / 3],
    columns2: [0.5], rows2: [0.5],
  }
}

function snapshot(pattern: MultiPaneLayoutPattern, panes: PaneOrder): PaneLayoutSnapshot {
  return { pattern, panes: [...panes] }
}

export function createDefaultLayout(): LayoutConfig {
  const panes: PaneOrder = ['reference', 'editor', 'explain']
  return {
    version: 2,
    pattern: 'left',
    panes,
    ratios: defaultRatios(),
    lastPaneLayouts: {
      reference: snapshot('left', panes),
      explain: snapshot('left', panes),
    },
  }
}

export function isThreePanePattern(pattern: LayoutPattern): pattern is ThreePaneLayoutPattern {
  return (THREE_PANE_PATTERNS as readonly LayoutPattern[]).includes(pattern)
}

export function isTwoPanePattern(pattern: LayoutPattern): pattern is TwoPaneLayoutPattern {
  return (TWO_PANE_PATTERNS as readonly LayoutPattern[]).includes(pattern)
}

export function getLayoutSlotCount(pattern: LayoutPattern): 1 | 2 | 3 {
  return pattern === 'editorOnly' ? 1 : isTwoPanePattern(pattern) ? 2 : 3
}

export function getActivePanes(config: LayoutConfig): PaneId[] {
  if (config.pattern === 'editorOnly') return ['editor']
  return config.panes.slice(0, getLayoutSlotCount(config.pattern))
}

export function containsPane(config: LayoutConfig, pane: PaneId): boolean {
  return getActivePanes(config).includes(pane)
}

export function getSlotLabels(pattern: LayoutPattern): string[] {
  switch (pattern) {
    case 'left': return ['左', '右上', '右下']
    case 'right': return ['右', '左上', '左下']
    case 'top': return ['上', '左下', '右下']
    case 'bottom': return ['下', '左上', '右上']
    case 'columns': return ['左', '中央', '右']
    case 'rows': return ['上', '中央', '下']
    case 'columns2': return ['左', '右']
    case 'rows2': return ['上', '下']
    case 'editorOnly': return ['全体']
  }
}

function normalizeTwoPaneOrder(panes: PaneOrder): PaneOrder {
  if (panes[0] === 'editor' || panes[1] === 'editor') return [...panes]
  const editorSlot = panes.indexOf('editor')
  const result: PaneOrder = [...panes]
  ;[result[1], result[editorSlot]] = [result[editorSlot], result[1]]
  return result
}

function normalizePatternPanes(pattern: LayoutPattern, panes: PaneOrder): PaneOrder {
  if (pattern === 'editorOnly') {
    const editorSlot = panes.indexOf('editor')
    const result: PaneOrder = [...panes]
    ;[result[0], result[editorSlot]] = [result[editorSlot], result[0]]
    return result
  }
  return isTwoPanePattern(pattern) ? normalizeTwoPaneOrder(panes) : [...panes]
}

/** Changes the active pattern while recording the current restorable layout. */
export function changeLayoutPattern(config: LayoutConfig, pattern: LayoutPattern): LayoutConfig {
  const remembered = rememberPaneLayouts(config)
  return { ...remembered, pattern, panes: normalizePatternPanes(pattern, remembered.panes) }
}

export function swapPane(config: LayoutConfig, slot: number, pane: PaneId): LayoutConfig {
  const slotCount = getLayoutSlotCount(config.pattern)
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount || config.pattern === 'editorOnly') return config

  const panes: PaneOrder = [...config.panes]
  const previousSlot = panes.indexOf(pane)
  if (previousSlot < 0 || previousSlot === slot) return config

  if (isThreePanePattern(config.pattern)) {
    ;[panes[slot], panes[previousSlot]] = [panes[previousSlot], panes[slot]]
    return { ...config, panes }
  }

  const editorSlot = panes.indexOf('editor')
  if (pane === 'editor') {
    ;[panes[slot], panes[editorSlot]] = [panes[editorSlot], panes[slot]]
    return { ...config, panes }
  }
  if (slot !== editorSlot) {
    ;[panes[slot], panes[previousSlot]] = [panes[previousSlot], panes[slot]]
    return { ...config, panes }
  }

  // Keep the editor visible when an optional pane is selected in its slot.
  const otherSlot = slot === 0 ? 1 : 0
  const oldCompanion = panes[otherSlot]
  panes[slot] = pane
  panes[otherSlot] = 'editor'
  panes[previousSlot] = oldCompanion
  return { ...config, panes }
}

function clamp(value: number, min = MIN_RATIO, max = MAX_RATIO) {
  return Math.min(max, Math.max(min, value))
}

export function resizeLayout(config: LayoutConfig, divider: 0 | 1, ratio: number): LayoutConfig {
  if (!Number.isFinite(ratio) || config.pattern === 'editorOnly') return config
  if (isTwoPanePattern(config.pattern)) {
    if (divider !== 0) return config
    return { ...config, ratios: { ...config.ratios, [config.pattern]: [clamp(ratio)] } }
  }

  const pair: [number, number] = [...config.ratios[config.pattern]]
  if (config.pattern === 'columns' || config.pattern === 'rows') {
    pair[divider] = divider === 0
      ? clamp(ratio, MIN_RATIO, pair[1] - MIN_RATIO)
      : clamp(ratio, pair[0] + MIN_RATIO, MAX_RATIO)
  } else pair[divider] = clamp(ratio)
  return { ...config, ratios: { ...config.ratios, [config.pattern]: pair } }
}

/** Records the current 2/3-pane layout for every optional pane it contains. */
export function rememberPaneLayouts(config: LayoutConfig): LayoutConfig {
  if (config.pattern === 'editorOnly') return config
  const active = getActivePanes(config)
  let changed = false
  const lastPaneLayouts: PaneLayoutHistory = { ...config.lastPaneLayouts }
  for (const pane of OPTIONAL_PANES) {
    if (!active.includes(pane)) continue
    lastPaneLayouts[pane] = snapshot(config.pattern, config.panes)
    changed = true
  }
  return changed ? { ...config, lastPaneLayouts } : config
}

/** Restores a pane's last suitable layout, or the default three-pane layout. */
export function restorePaneLayout(config: LayoutConfig, pane: 'reference' | 'explain'): LayoutConfig {
  if (containsPane(config, pane)) return config
  const remembered = rememberPaneLayouts(config)
  const stored = remembered.lastPaneLayouts[pane]
  if (stored && stored.panes.slice(0, getLayoutSlotCount(stored.pattern)).includes(pane)) {
    return { ...remembered, pattern: stored.pattern, panes: [...stored.panes] }
  }
  const fallback = createDefaultLayout()
  return { ...remembered, pattern: fallback.pattern, panes: fallback.panes }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPaneOrder(value: unknown): value is PaneOrder {
  return Array.isArray(value) && value.length === 3 && new Set(value).size === 3
    && value.every((pane) => pane === 'reference' || pane === 'editor' || pane === 'explain')
}

function isThreePaneRatios(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2
    && value.every((ratio) => typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= MIN_RATIO && ratio <= MAX_RATIO)
}

function isTwoPaneRatio(value: unknown): value is [number] {
  return Array.isArray(value) && value.length === 1 && typeof value[0] === 'number'
    && Number.isFinite(value[0]) && value[0] >= MIN_RATIO && value[0] <= MAX_RATIO
}

function isRatios(value: unknown): value is LayoutRatios {
  if (!isRecord(value)) return false
  for (const pattern of THREE_PANE_PATTERNS) {
    const pair = value[pattern]
    if (!isThreePaneRatios(pair)) return false
    if ((pattern === 'columns' || pattern === 'rows') && pair[1] - pair[0] < MIN_RATIO - Number.EPSILON) return false
  }
  return TWO_PANE_PATTERNS.every((pattern) => isTwoPaneRatio(value[pattern]))
}

function isSnapshot(value: unknown, pane: 'reference' | 'explain'): value is PaneLayoutSnapshot {
  if (!isRecord(value) || !isPaneOrder(value.panes)) return false
  if (!(THREE_PANE_PATTERNS as readonly unknown[]).includes(value.pattern)
    && !(TWO_PANE_PATTERNS as readonly unknown[]).includes(value.pattern)) return false
  const pattern = value.pattern as MultiPaneLayoutPattern
  const slotCount = isTwoPanePattern(pattern) ? 2 : 3
  return value.panes.slice(0, slotCount).includes(pane)
    && (!isTwoPanePattern(pattern) || value.panes.slice(0, 2).includes('editor'))
}

function isHistory(value: unknown): value is PaneLayoutHistory {
  if (!isRecord(value)) return false
  return OPTIONAL_PANES.every((pane) => value[pane] === null || isSnapshot(value[pane], pane))
}

function isLayoutV2(value: unknown): value is LayoutConfig {
  if (!isRecord(value) || value.version !== 2 || !(LAYOUT_PATTERNS as readonly unknown[]).includes(value.pattern)) return false
  if (!isPaneOrder(value.panes) || !isRatios(value.ratios) || !isHistory(value.lastPaneLayouts)) return false
  const pattern = value.pattern as LayoutPattern
  return pattern === 'editorOnly'
    ? value.panes[0] === 'editor'
    : !isTwoPanePattern(pattern) || value.panes.slice(0, 2).includes('editor')
}

function isLayoutV1(value: unknown): value is LayoutConfigV1 {
  if (!isRecord(value) || value.version !== 1 || !(THREE_PANE_PATTERNS as readonly unknown[]).includes(value.pattern)) return false
  if (!isPaneOrder(value.panes) || !isRecord(value.ratios)) return false
  const ratios = value.ratios
  return THREE_PANE_PATTERNS.every((pattern) => {
    const pair = ratios[pattern]
    if (!isThreePaneRatios(pair)) return false
    return (pattern !== 'columns' && pattern !== 'rows') || pair[1] - pair[0] >= MIN_RATIO - Number.EPSILON
  })
}

function migrateV1(value: LayoutConfigV1): LayoutConfig {
  const config: LayoutConfig = {
    version: 2,
    pattern: value.pattern,
    panes: [...value.panes],
    ratios: { ...defaultRatios(), ...value.ratios },
    lastPaneLayouts: { reference: null, explain: null },
  }
  return rememberPaneLayouts(config)
}

function loadLegacyRatio(key: string): number {
  const raw = localStorage.getItem(key)
  const ratio = raw === null ? 0.5 : Number(raw)
  return Number.isFinite(ratio) ? clamp(ratio) : 0.5
}

export function loadLayout(): LayoutConfig {
  try {
    const raw = localStorage.getItem(KEY_LAYOUT)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (isLayoutV2(parsed)) return parsed
      if (isLayoutV1(parsed)) return migrateV1(parsed)
      return createDefaultLayout()
    }
    const config = createDefaultLayout()
    config.ratios.left = [loadLegacyRatio('shakyo.split.main'), loadLegacyRatio('shakyo.split.right')]
    return rememberPaneLayouts(config)
  } catch {
    return createDefaultLayout()
  }
}

export function saveLayout(config: LayoutConfig): void {
  localStorage.setItem(KEY_LAYOUT, JSON.stringify(rememberPaneLayouts(config)))
}
