import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton } from './Icon'
import { MAX_READER_ZOOM, MIN_READER_ZOOM, READER_ZOOM_STEP, clampReaderZoom } from '../lib/readerZoom'

export function ReaderToolbar({ zoom, onZoomChange, children }: {
  zoom: number
  onZoomChange: (zoom: number) => void
  children?: ReactNode
}) {
  const [draft, setDraft] = useState(String(zoom))
  useEffect(() => setDraft(String(zoom)), [zoom])

  const commitZoom = (value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || value.trim() === '') {
      setDraft(String(zoom))
      return
    }
    const next = clampReaderZoom(parsed)
    setDraft(String(next))
    if (next !== zoom) onZoomChange(next)
  }

  const handleZoomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.currentTarget.value = String(zoom)
      setDraft(String(zoom))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="reader-toolbar" role="toolbar" aria-label="文書の表示操作">
      {children}
      <button type="button" aria-label="縮小" disabled={zoom <= MIN_READER_ZOOM}
        onClick={() => onZoomChange(clampReaderZoom(zoom - READER_ZOOM_STEP))}>−</button>
      <label className="reader-zoom-input">
        <span className="visually-hidden">表示倍率</span>
        <input type="number" min={MIN_READER_ZOOM} max={MAX_READER_ZOOM} step="1" inputMode="numeric"
          aria-label="表示倍率" value={draft} onChange={event => setDraft(event.target.value)}
          onBlur={event => commitZoom(event.currentTarget.value)} onKeyDown={handleZoomKeyDown}
          onFocus={event => event.currentTarget.select()} />
        <span aria-hidden="true">%</span>
      </label>
      <IconButton icon="reload" className="reader-zoom-reset" label="倍率を100%に戻す"
        onClick={() => onZoomChange(100)} />
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
        disabled={previousDisabled} onClick={onPrevious}><span className="reader-edge-icon" aria-hidden="true">&lt;</span></button>
      <button type="button" className="reader-edge reader-edge-next" aria-label="次のページ"
        disabled={nextDisabled} onClick={onNext}><span className="reader-edge-icon" aria-hidden="true">&gt;</span></button>
    </>
  )
}

export type ReaderTocItem = {
  key: string
  label: string
  depth: number
  target?: string
}

export function ReaderTocButton({ open, controls, onToggle }: {
  open: boolean
  controls: string
  onToggle: () => void
}) {
  return <IconButton icon="toc" className="reader-toc-toggle" label="目次"
    aria-expanded={open} aria-controls={controls} onClick={onToggle} />
}

export function ReaderTocDrawer({ id, open, items, onSelect, onClose }: {
  id: string
  open: boolean
  items: ReaderTocItem[]
  onSelect: (target: string) => void
  onClose: () => void
}) {
  const drawerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const drawer = drawerRef.current
    if (!open || !drawer) return
    const stopWheel = (event: WheelEvent) => event.stopPropagation()
    drawer.addEventListener('wheel', stopWheel)
    return () => drawer.removeEventListener('wheel', stopWheel)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  if (!open) return null
  return (
    <aside id={id} ref={drawerRef} className="reader-toc-drawer" aria-label="目次">
      <div className="reader-toc-heading">
        <strong>目次</strong>
        <IconButton icon="close" label="目次を閉じる" onClick={onClose} />
      </div>
      <nav aria-label="文書の目次">
        {items.map(item => item.target
          ? <button type="button" className="reader-toc-item" key={item.key}
              style={{ paddingInlineStart: `${12 + item.depth * 16}px` }}
              onClick={() => onSelect(item.target!)}>{item.label}</button>
          : <div className="reader-toc-item reader-toc-group" key={item.key}
              style={{ paddingInlineStart: `${12 + item.depth * 16}px` }}>{item.label}</div>)}
      </nav>
    </aside>
  )
}
