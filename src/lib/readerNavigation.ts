export type ReaderScrollMetrics = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export function pageTurnFromWheel(
  deltaY: number,
  metrics: ReaderScrollMetrics,
  canPrevious: boolean,
  canNext: boolean,
): -1 | 0 | 1 {
  const atTop = metrics.scrollTop <= 1
  const atBottom = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 1
  if (deltaY < 0 && atTop && canPrevious) return -1
  if (deltaY > 0 && atBottom && canNext) return 1
  return 0
}
