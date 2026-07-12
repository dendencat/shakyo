export const KEY_WEB_HISTORY = 'shakyo.reference.web.history'
export const KEY_WEB_BOOKMARKS = 'shakyo.reference.web.bookmarks'

export const WEB_HISTORY_LIMIT = 20

const SAVE_ERROR_MESSAGE = '保存に失敗しました。ブラウザの保存領域が不足しています。'

export interface WebHistoryEntry {
  url: string
  visitedAt: number
}

export interface WebBookmark {
  id: string
  name: string
  url: string
}

function isWebHistoryEntry(value: unknown): value is WebHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.url === 'string' && typeof candidate.visitedAt === 'number'
}

function isWebBookmark(value: unknown): value is WebBookmark {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string'
  )
}

export function loadWebHistory(): WebHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY_WEB_HISTORY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isWebHistoryEntry) : []
  } catch {
    return []
  }
}

export function loadWebBookmarks(): WebBookmark[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY_WEB_BOOKMARKS) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isWebBookmark) : []
  } catch {
    return []
  }
}

function saveWebHistory(history: WebHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY_WEB_HISTORY, JSON.stringify(history))
  } catch {
    // 履歴の保存失敗はWebページの表示を妨げない。
  }
}

function saveWebBookmarks(bookmarks: WebBookmark[]): void {
  try {
    localStorage.setItem(KEY_WEB_BOOKMARKS, JSON.stringify(bookmarks))
  } catch {
    throw new Error(SAVE_ERROR_MESSAGE)
  }
}

export function addWebHistory(url: string): WebHistoryEntry[] {
  const history = [
    { url, visitedAt: Date.now() },
    ...loadWebHistory().filter((entry) => entry.url !== url),
  ].slice(0, WEB_HISTORY_LIMIT)
  saveWebHistory(history)
  return history
}

export function removeWebHistory(url: string): WebHistoryEntry[] {
  const history = loadWebHistory().filter((entry) => entry.url !== url)
  saveWebHistory(history)
  return history
}

export function clearWebHistory(): void {
  localStorage.removeItem(KEY_WEB_HISTORY)
}

export function addWebBookmark({ name, url }: { name: string; url: string }): WebBookmark[] {
  const bookmarks = [
    ...loadWebBookmarks(),
    { id: crypto.randomUUID(), name: name.trim() || url, url },
  ]
  saveWebBookmarks(bookmarks)
  return bookmarks
}

export function updateWebBookmark(
  id: string,
  { name, url }: { name: string; url: string },
): WebBookmark[] {
  const bookmarks = loadWebBookmarks()
  if (!bookmarks.some((bookmark) => bookmark.id === id)) return bookmarks
  const updated = bookmarks.map((bookmark) =>
    bookmark.id === id ? { ...bookmark, name: name.trim() || url, url } : bookmark,
  )
  saveWebBookmarks(updated)
  return updated
}

export function deleteWebBookmark(id: string): WebBookmark[] {
  const bookmarks = loadWebBookmarks().filter((bookmark) => bookmark.id !== id)
  saveWebBookmarks(bookmarks)
  return bookmarks
}
