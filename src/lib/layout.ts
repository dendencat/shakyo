export type PaneId = 'reference' | 'editor' | 'explain'
export type LayoutPattern = 'columns' | 'rows' | 'left' | 'right' | 'top' | 'bottom'

export interface LayoutConfig {
  version: 1
  pattern: LayoutPattern
  panes: [PaneId, PaneId, PaneId]
  ratios: Record<LayoutPattern, [number, number]>
}

export const LAYOUT_PATTERNS: LayoutPattern[] = ['left', 'right', 'top', 'bottom', 'columns', 'rows']
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
}

const KEY_LAYOUT = 'shakyo.layout'
const MIN_RATIO = 0.15
const MAX_RATIO = 0.85

export function createDefaultLayout(): LayoutConfig {
  return {
    version: 1,
    pattern: 'left',
    panes: ['reference', 'editor', 'explain'],
    ratios: {
      left: [0.5, 0.5],
      right: [0.5, 0.5],
      top: [0.5, 0.5],
      bottom: [0.5, 0.5],
      columns: [1 / 3, 2 / 3],
      rows: [1 / 3, 2 / 3],
    },
  }
}

export function getSlotLabels(pattern: LayoutPattern): [string, string, string] {
  switch (pattern) {
    case 'left': return ['左', '右上', '右下']
    case 'right': return ['右', '左上', '左下']
    case 'top': return ['上', '左下', '右下']
    case 'bottom': return ['下', '左上', '右上']
    case 'columns': return ['左', '中央', '右']
    case 'rows': return ['上', '中央', '下']
  }
}

export function swapPane(config: LayoutConfig, slot: number, pane: PaneId): LayoutConfig {
  const previousSlot = config.panes.indexOf(pane)
  if (!Number.isInteger(slot) || slot < 0 || slot > 2 || previousSlot < 0) return config
  const panes: LayoutConfig['panes'] = [...config.panes]
  const previousPane = panes[slot]
  panes[slot] = pane
  panes[previousSlot] = previousPane
  return { ...config, panes }
}

function clamp(value: number, min = MIN_RATIO, max = MAX_RATIO) {
  return Math.min(max, Math.max(min, value))
}

export function resizeLayout(config: LayoutConfig, divider: 0 | 1, ratio: number): LayoutConfig {
  if (!Number.isFinite(ratio)) return config
  const pair: [number, number] = [...config.ratios[config.pattern]]
  if (config.pattern === 'columns' || config.pattern === 'rows') {
    pair[divider] = divider === 0
      ? clamp(ratio, MIN_RATIO, pair[1] - MIN_RATIO)
      : clamp(ratio, pair[0] + MIN_RATIO, MAX_RATIO)
  } else {
    pair[divider] = clamp(ratio)
  }
  return { ...config, ratios: { ...config.ratios, [config.pattern]: pair } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLayout(value: unknown): value is LayoutConfig {
  if (!isRecord(value) || value.version !== 1 || !LAYOUT_PATTERNS.includes(value.pattern as LayoutPattern)) return false
  if (!Array.isArray(value.panes) || value.panes.length !== 3 || new Set(value.panes).size !== 3) return false
  if (!value.panes.every((pane) => pane === 'reference' || pane === 'editor' || pane === 'explain')) return false
  const ratios = value.ratios
  if (!isRecord(ratios)) return false
  return LAYOUT_PATTERNS.every((pattern) => {
    const pair = ratios[pattern]
    if (!Array.isArray(pair) || pair.length !== 2) return false
    if (!pair.every((ratio) => typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= MIN_RATIO && ratio <= MAX_RATIO)) return false
    // Allow only floating-point rounding at the minimum middle-pane width.
    return (pattern !== 'columns' && pattern !== 'rows') || pair[1] - pair[0] >= MIN_RATIO - Number.EPSILON
  })
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
      return isLayout(parsed) ? parsed : createDefaultLayout()
    }
    const config = createDefaultLayout()
    config.ratios.left = [loadLegacyRatio('shakyo.split.main'), loadLegacyRatio('shakyo.split.right')]
    return config
  } catch {
    return createDefaultLayout()
  }
}

export function saveLayout(config: LayoutConfig): void {
  localStorage.setItem(KEY_LAYOUT, JSON.stringify(config))
}
