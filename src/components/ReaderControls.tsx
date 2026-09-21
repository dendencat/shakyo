import type { ReactNode } from 'react'

const MIN_READER_ZOOM = 50
const MAX_READER_ZOOM = 300
const READER_ZOOM_STEP = 25

function clampReaderZoom(value: number): number {
  return Math.min(MAX_READER_ZOOM, Math.max(MIN_READER_ZOOM, value))
}

export function ReaderToolbar({ zoom, onZoomChange, children }: {
  zoom: number
  onZoomChange: (zoom: number) => void
  children?: ReactNode
}) {
  return (
    <div className="reader-toolbar" role="toolbar" aria-label="文書の表示操作">
      {children}
      <button type="button" aria-label="縮小" disabled={zoom <= MIN_READER_ZOOM}
        onClick={() => onZoomChange(clampReaderZoom(zoom - READER_ZOOM_STEP))}>−</button>
      <button type="button" className="reader-zoom-reset" aria-label="倍率を100%に戻す"
        onClick={() => onZoomChange(100)}>{zoom}%</button>
      <button type="button" aria-label="拡大" disabled={zoom >= MAX_READER_ZOOM}
        onClick={() => onZoomChange(clampReaderZoom(zoom + READER_ZOOM_STEP))}>＋</button>
    </div>
  )
}

export function ReaderPageButtons({ onPrevious, onNext, previousDisabled, nextDisabled }: {
  onPrevious: () => void
  onNext: () => void
  previousDisabled: boolean
  nextDisabled: boolean
}) {
  return (
    <>
      <button type="button" className="reader-edge reader-edge-previous" aria-label="前のページ"
        disabled={previousDisabled} onClick={onPrevious}>&lt;</button>
      <button type="button" className="reader-edge reader-edge-next" aria-label="次のページ"
        disabled={nextDisabled} onClick={onNext}>&gt;</button>
    </>
  )
}
