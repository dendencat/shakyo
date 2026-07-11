import { isLangId, type LangId } from './langs'

const KEY_SNAPSHOTS = 'shakyo.snapshots'
const QUOTA_MESSAGE = '保存容量が上限に達しました。不要なスナップショットを削除してください。'

export type Snapshot = {
  id: string
  name: string
  lang: LangId
  code: string
  savedAt: number
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    isLangId(candidate.lang) &&
    typeof candidate.code === 'string' &&
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt)
  )
}

function writeSnapshots(snapshots: Snapshot[]) {
  try {
    localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(snapshots))
  } catch {
    throw new Error(QUOTA_MESSAGE)
  }
}

export function listSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(KEY_SNAPSHOTS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : []
  } catch {
    return []
  }
}

export function saveSnapshot(name: string, lang: LangId, code: string): Snapshot {
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    name,
    lang,
    code,
    savedAt: Date.now(),
  }
  const snapshots = listSnapshots().filter((s) => s.name !== name)
  writeSnapshots([...snapshots, snapshot])
  return snapshot
}

export function deleteSnapshot(id: string): void {
  writeSnapshots(listSnapshots().filter((s) => s.id !== id))
}
