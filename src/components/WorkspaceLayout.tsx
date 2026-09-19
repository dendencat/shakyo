import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { getSlotLabels, PANE_LABELS, resizeLayout } from '../lib/layout'
import type { LayoutConfig, LayoutPattern, PaneId } from '../lib/layout'

const PANE_IDS: PaneId[] = ['reference', 'editor', 'explain']
const DIVIDER_SIZE = 5

function compactLayout(layout: LayoutConfig, visible: Record<PaneId, boolean>) {
  const slots = [0, 1, 2].filter(slot => visible[layout.panes[slot]])
  if (slots.length !== 2) return null
  const straight = layout.pattern === 'columns' || layout.pattern === 'rows'
  const divider: 0 | 1 = straight ? slots[0] as 0 | 1 : slots.includes(0) ? 0 : 1
  const axis = dividerAxis(layout.pattern, divider)
  const [a, b] = layout.ratios[layout.pattern]
  const weights = [a, b - a, 1 - b]
  const reversed = !straight && isReversed(layout.pattern, divider)
  const minimum = straight ? 0.15 / (weights[slots[0]] + weights[slots[1]]) : 0.15
  const ordered = reversed ? [...slots].reverse() : slots
  const fraction = straight ? weights[slots[0]] / (weights[slots[0]] + weights[slots[1]]) : reversed ? 1 - layout.ratios[layout.pattern][divider] : layout.ratios[layout.pattern][divider]
  const style: CSSProperties = {
    gridTemplateAreas: axis === 'x' ? `"slot${ordered[0]} divider${divider} slot${ordered[1]}"` : `"slot${ordered[0]}" "divider${divider}" "slot${ordered[1]}"`,
    gridTemplateColumns: axis === 'x' ? tracks([fraction, 1 - fraction]) : 'minmax(0, 1fr)',
    gridTemplateRows: axis === 'y' ? tracks([fraction, 1 - fraction]) : 'minmax(0, 1fr)',
  }
  const resize = (ratio: number) => {
    ratio = Math.max(minimum, Math.min(1 - minimum, ratio))
    const pair: [number, number] = [...layout.ratios[layout.pattern]]
    if (straight) {
      const total = weights[slots[0]] + weights[slots[1]]
      const nextWeights = [...weights]
      nextWeights[slots[0]] = total * ratio
      nextWeights[slots[1]] = total * (1 - ratio)
      // Keep floating-point rounding at the boundary within persisted layout limits.
      pair[0] = Math.max(0.15, Math.min(0.85, nextWeights[0]))
      pair[1] = Math.max(0.15, Math.min(0.85, nextWeights[0] + nextWeights[1]))
    } else pair[divider] = reversed ? 1 - ratio : ratio
    return { ...layout, ratios: { ...layout.ratios, [layout.pattern]: pair } }
  }
  return { style, divider, fraction, minimum, resize }
}

const AREAS: Record<LayoutPattern, string> = {
  columns: '"slot0 divider0 slot1 divider1 slot2"',
  rows: '"slot0" "divider0" "slot1" "divider1" "slot2"',
  left: '"slot0 divider0 slot1" "slot0 divider0 divider1" "slot0 divider0 slot2"',
  right: '"slot1 divider0 slot0" "divider1 divider0 slot0" "slot2 divider0 slot0"',
  top: '"slot0 slot0 slot0" "divider0 divider0 divider0" "slot1 divider1 slot2"',
  bottom: '"slot1 divider1 slot2" "divider0 divider0 divider0" "slot0 slot0 slot0"',
}

function tracks(fractions: number[]) {
  return fractions.map((fraction) => `minmax(0, ${fraction}fr)`).join(` ${DIVIDER_SIZE}px `)
}

function gridStyle(layout: LayoutConfig): CSSProperties {
  const { pattern } = layout
  const [first, second] = layout.ratios[pattern]
  const straight = tracks([first, second - first, 1 - second])
  const main = tracks(pattern === 'right' || pattern === 'bottom' ? [1 - first, first] : [first, 1 - first])
  const pair = tracks([second, 1 - second])
  return {
    gridTemplateAreas: AREAS[pattern],
    gridTemplateColumns: pattern === 'columns' ? straight : pattern === 'rows' ? 'minmax(0, 1fr)' : pattern === 'left' || pattern === 'right' ? main : pair,
    gridTemplateRows: pattern === 'rows' ? straight : pattern === 'columns' ? 'minmax(0, 1fr)' : pattern === 'left' || pattern === 'right' ? pair : main,
  }
}

function dividerAxis(pattern: LayoutPattern, divider: 0 | 1): 'x' | 'y' {
  if (pattern === 'columns') return 'x'
  if (pattern === 'rows') return 'y'
  return (pattern === 'left' || pattern === 'right') === (divider === 0) ? 'x' : 'y'
}

function isReversed(pattern: LayoutPattern, divider: 0 | 1) {
  return divider === 0 && (pattern === 'right' || pattern === 'bottom')
}

type Drag = {
  pointerId: number
  divider: 0 | 1
  initial: LayoutConfig
  current: LayoutConfig
  origin: number
  available: number
  offset: number
}

export function WorkspaceLayout({
  layout,
  onChange,
  panes,
  visiblePanes = { reference: true, editor: true, explain: true },
}: {
  layout: LayoutConfig
  onChange: (layout: LayoutConfig, persist: boolean) => void
  panes: Record<PaneId, ReactNode>
  visiblePanes?: Record<PaneId, boolean>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [activeDivider, setActiveDivider] = useState<0 | 1 | null>(null)
  const visibleSlots = [0, 1, 2].filter(slot => visiblePanes[layout.panes[slot]])
  const compact = compactLayout(layout, visiblePanes)

  const finishDrag = useCallback((cancel: boolean) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setActiveDivider(null)
    onChange(cancel ? drag.initial : drag.current, !cancel)
  }, [onChange])

  useEffect(() => {
    if (activeDivider === null) return
    const cancel = () => finishDrag(true)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('blur', cancel)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeDivider, finishDrag])

  const startDrag = (event: PointerEvent<HTMLDivElement>, divider: 0 | 1) => {
    if (event.button !== 0 || dragRef.current) return
    const container = containerRef.current
    if (!container) return
    event.preventDefault()
    event.currentTarget.focus()
    const rect = container.getBoundingClientRect()
    const handle = event.currentTarget.getBoundingClientRect()
    const axis = dividerAxis(layout.pattern, divider)
    const straight = !compact && (layout.pattern === 'columns' || layout.pattern === 'rows')
    const available = (axis === 'x' ? rect.width : rect.height) - DIVIDER_SIZE * (straight ? 2 : 1)
    if (available <= 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      divider,
      initial: layout,
      current: layout,
      origin: axis === 'x' ? rect.left : rect.top,
      available,
      offset: axis === 'x' ? event.clientX - handle.left : event.clientY - handle.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveDivider(divider)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const { pattern } = drag.initial
    const axis = dividerAxis(pattern, drag.divider)
    const straight = pattern === 'columns' || pattern === 'rows'
    const position = (axis === 'x' ? event.clientX : event.clientY) - drag.origin - drag.offset
    const reduced = compactLayout(drag.initial, visiblePanes)
    if (reduced) {
      drag.current = reduced.resize(position / drag.available)
      onChange(drag.current, false)
      return
    }
    let ratio = (position - (straight && drag.divider === 1 ? DIVIDER_SIZE : 0)) / drag.available
    if (isReversed(pattern, drag.divider)) ratio = 1 - ratio
    drag.current = resizeLayout(drag.initial, drag.divider, ratio)
    onChange(drag.current, false)
  }

  const resizeWithKey = (event: KeyboardEvent<HTMLDivElement>, divider: 0 | 1) => {
    if (dragRef.current) return
    const axis = dividerAxis(layout.pattern, divider)
    const negative = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const positive = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== negative && event.key !== positive) return
    event.preventDefault()
    if (compact) {
      onChange(compact.resize(compact.fraction + (event.key === positive ? 0.02 : -0.02)), true)
      return
    }
    const delta = (event.key === positive ? 0.02 : -0.02) * (isReversed(layout.pattern, divider) ? -1 : 1)
    onChange(resizeLayout(layout, divider, layout.ratios[layout.pattern][divider] + delta), true)
  }

  const slotLabels = getSlotLabels(layout.pattern)
  const straight = layout.pattern === 'columns' || layout.pattern === 'rows'
  const ratios = layout.ratios[layout.pattern]

  return (
    <div className="workspace-layout" ref={containerRef} style={visibleSlots.length === 1 ? { gridTemplateAreas: `"slot${visibleSlots[0]}"`, gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr)' } : compact?.style ?? gridStyle(layout)} data-pattern={layout.pattern}>
      {/* Keep both DOM order and parents fixed: moving an iframe in the DOM reloads it. */}
      {PANE_IDS.map((id) => (
        <div key={id} className="workspace-pane" data-pane={id} hidden={!visiblePanes[id]} style={{ gridArea: `slot${layout.panes.indexOf(id)}`, display: visiblePanes[id] ? undefined : 'none' }}>
          {panes[id]}
        </div>
      ))}
      {([0, 1] as const).map((divider) => {
        if (visibleSlots.length < 2 || (compact && compact.divider !== divider)) return null
        const slot = straight ? divider : divider === 0 ? 0 : 1
        const axis = dividerAxis(layout.pattern, divider)
        return (
          <div
            key={divider}
            className={`workspace-divider workspace-divider-${axis}`}
            style={{ gridArea: `divider${divider}` }}
            role="separator"
            tabIndex={0}
            aria-label={`${slotLabels[slot]}の${PANE_LABELS[layout.panes[slot]]}のサイズ調整`}
            aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
            aria-valuemin={compact ? Math.round(compact.minimum * 100) : 15}
            aria-valuemax={compact ? Math.round((1 - compact.minimum) * 100) : Math.round((straight ? divider === 0 ? ratios[1] - 0.15 : 0.85 - ratios[0] : 0.85) * 100)}
            aria-valuenow={Math.round((compact?.fraction ?? (ratios[divider] - (straight && divider === 1 ? ratios[0] : 0))) * 100)}
            onPointerDown={(event) => startDrag(event, divider)}
            onPointerMove={moveDrag}
            onPointerUp={(event) => {
              if (event.pointerId === dragRef.current?.pointerId) finishDrag(false)
            }}
            onPointerCancel={(event) => {
              if (event.pointerId === dragRef.current?.pointerId) finishDrag(true)
            }}
            onLostPointerCapture={() => finishDrag(true)}
            onKeyDown={(event) => resizeWithKey(event, divider)}
          />
        )
      })}
      {activeDivider !== null && (
        <div
          className={`workspace-resize-overlay workspace-divider-${dividerAxis(layout.pattern, activeDivider)}`}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
