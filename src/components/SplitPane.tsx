import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const MIN_RATIO = 0.15
const MAX_RATIO = 0.85

function clampRatio(value: number) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

function initialRatio(storageKey?: string) {
  if (!storageKey) return 0.5
  const raw = localStorage.getItem(storageKey)
  if (raw === null) return 0.5
  const saved = Number(raw)
  return Number.isFinite(saved) ? clampRatio(saved) : 0.5
}

export function SplitPane({
  left,
  right,
  direction = 'horizontal',
  storageKey,
}: {
  left: ReactNode
  right: ReactNode
  direction?: 'horizontal' | 'vertical'
  storageKey?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ratioRef = useRef(0.5)
  const [leftRatio, setLeftRatio] = useState(() => {
    const value = initialRatio(storageKey)
    ratioRef.current = value
    return value
  })

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()

    const onMove = (ev: PointerEvent) => {
      const rawRatio =
        direction === 'vertical' ? (ev.clientY - rect.top) / rect.height : (ev.clientX - rect.left) / rect.width
      const ratio = clampRatio(rawRatio)
      ratioRef.current = ratio
      setLeftRatio(ratio)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      if (storageKey) localStorage.setItem(storageKey, String(ratioRef.current))
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [direction, storageKey])

  return (
    <div className={`split-pane ${direction === 'vertical' ? 'vertical' : ''}`.trim()} ref={containerRef}>
      <div className="split-pane-left" style={{ flexBasis: `${leftRatio * 100}%` }}>
        {left}
      </div>
      <div
        className="split-pane-divider"
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation={direction === 'vertical' ? 'horizontal' : 'vertical'}
      />
      <div className="split-pane-right">{right}</div>
    </div>
  )
}
