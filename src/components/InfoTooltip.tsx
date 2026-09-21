import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

export function InfoTooltip({ label, children }: { label: string; children: string }) {
  const id = `info-${useId().replaceAll(':', '')}`
  const rootRef = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (!pinned) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [pinned])

  return (
    <span ref={rootRef} className="info-tooltip" data-open={pinned || undefined}>
      <button type="button" className="info-tooltip-button" aria-label={`${label}の説明`}
        aria-describedby={id} aria-expanded={pinned} onClick={() => setPinned(open => !open)}
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          setPinned(false)
          event.currentTarget.blur()
        }}>
        <Icon name="info" />
      </button>
      <span id={id} role="tooltip" className="info-tooltip-content">{children}</span>
    </span>
  )
}
