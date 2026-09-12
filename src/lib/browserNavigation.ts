export type NavigationHistory = { entries: string[]; index: number }
export const emptyNavigation: NavigationHistory = { entries: [], index: -1 }
export function visit(history: NavigationHistory, url: string): NavigationHistory {
  if (history.entries[history.index] === url) return history
  const entries = [...history.entries.slice(0, history.index + 1), url]
  return { entries, index: entries.length - 1 }
}
export function step(history: NavigationHistory, delta: -1 | 1): NavigationHistory {
  return { ...history, index: Math.max(0, Math.min(history.entries.length - 1, history.index + delta)) }
}
export function normalizeBrowserUrl(input: string): string {
  const text = input.trim()
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('HTTP(S)のURLを入力してください。')
  return url.href
}
