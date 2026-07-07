import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftRatio, setLeftRatio] = useState(0.5)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()

    const onMove = (ev: PointerEvent) => {
      const ratio = (ev.clientX - rect.left) / rect.width
      setLeftRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane-left" style={{ flexBasis: `${leftRatio * 100}%` }}>
        {left}
      </div>
      <div className="split-pane-divider" onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" />
      <div className="split-pane-right">{right}</div>
    </div>
  )
}
