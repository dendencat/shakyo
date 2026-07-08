const KEY_PROGRESS = 'shakyo.progress'
const MAX_ENTRIES = 20

export interface ProgressEntry {
  draft: string
  updatedAt: number
  progressPct: number | null
  accuracy: number | null
}

type ProgressMap = Record<string, ProgressEntry>

function isProgressEntry(value: unknown): value is ProgressEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.draft === 'string' &&
    typeof v.updatedAt === 'number' &&
    (typeof v.progressPct === 'number' || v.progressPct === null) &&
    (typeof v.accuracy === 'number' || v.accuracy === null)
  )
}

function loadAll(): ProgressMap {
  const raw = localStorage.getItem(KEY_PROGRESS)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: ProgressMap = {}
    for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (isProgressEntry(entry)) result[name] = entry
    }
    return result
  } catch {
    return {}
  }
}

function saveAll(map: ProgressMap) {
  localStorage.setItem(KEY_PROGRESS, JSON.stringify(map))
}

/**
 * 指定したお手本名の進捗を読み込む。存在しない・壊れている場合は null を返す。
 */
export function loadProgress(name: string): ProgressEntry | null {
  const map = loadAll()
  return map[name] ?? null
}

/**
 * 指定したお手本名の進捗を保存する。
 * 件数が上限(20件)を超える場合は updatedAt が最も古いものから削除する(LRU)。
 */
export function saveProgress(name: string, entry: ProgressEntry): void {
  const map = loadAll()
  map[name] = entry

  const names = Object.keys(map)
  if (names.length > MAX_ENTRIES) {
    const sorted = names.sort((a, b) => map[a].updatedAt - map[b].updatedAt)
    const toRemove = sorted.slice(0, names.length - MAX_ENTRIES)
    for (const n of toRemove) delete map[n]
  }

  saveAll(map)
}
