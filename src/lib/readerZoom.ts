export const MIN_READER_ZOOM = 50
export const MAX_READER_ZOOM = 300
export const READER_ZOOM_STEP = 25

export function clampReaderZoom(value: number): number {
  return Math.min(MAX_READER_ZOOM, Math.max(MIN_READER_ZOOM, Math.round(value)))
}

export function readerZoomFromWheel(zoom: number, deltaY: number): number {
  if (deltaY === 0) return zoom
  return clampReaderZoom(zoom + (deltaY < 0 ? READER_ZOOM_STEP : -READER_ZOOM_STEP))
}
