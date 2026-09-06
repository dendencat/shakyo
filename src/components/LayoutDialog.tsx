import { useState } from 'react'
import {
  createDefaultLayout,
  getSlotLabels,
  LAYOUT_PATTERNS,
  PANE_LABELS,
  PATTERN_LABELS,
  swapPane,
  type LayoutConfig,
  type LayoutPattern,
  type PaneId,
} from '../lib/layout'
import { useFocusTrap } from '../lib/useFocusTrap'
import './LayoutDialog.css'

const previewAreas: Record<LayoutPattern, string> = {
  left: '"slot0 slot1" "slot0 slot2"',
  right: '"slot1 slot0" "slot2 slot0"',
  top: '"slot0 slot0" "slot1 slot2"',
  bottom: '"slot1 slot2" "slot0 slot0"',
  columns: '"slot0 slot1 slot2"',
  rows: '"slot0" "slot1" "slot2"',
}

export function LayoutDialog({ layout, onApply, onClose }: {
  layout: LayoutConfig
  onApply: (layout: LayoutConfig) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(layout)
  const trapRef = useFocusTrap<HTMLDivElement>(onClose)
  const slotLabels = getSlotLabels(draft.pattern)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal layout-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="レイアウト"
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>レイアウト</h2>
        <label className="field">
          分割パターン
          <select value={draft.pattern} onChange={(e) => {
            const pattern = e.target.value as LayoutPattern
            setDraft((current) => ({ ...current, pattern }))
          }}>
            {LAYOUT_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>{PATTERN_LABELS[pattern]}</option>
            ))}
          </select>
        </label>
        <div
          className={`layout-preview layout-preview-${draft.pattern}`}
          role="img"
          aria-label={`配置図：${slotLabels.map((label, slot) => `${label}は${PANE_LABELS[draft.panes[slot]]}`).join('、')}`}
          style={{ gridTemplateAreas: previewAreas[draft.pattern] }}
        >
          {draft.panes.map((pane, slot) => (
            <div key={slot} style={{ gridArea: `slot${slot}` }} aria-hidden="true">
              <span>{slotLabels[slot]}</span>
              <strong>{PANE_LABELS[pane]}</strong>
            </div>
          ))}
        </div>
        {slotLabels.map((label, slot) => (
          <label className="field" key={slot}>
            {label}
            <select value={draft.panes[slot]} onChange={(e) => {
              const pane = e.target.value as PaneId
              setDraft((current) => swapPane(current, slot, pane))
            }}>
              {(Object.keys(PANE_LABELS) as PaneId[]).map((pane) => (
                <option key={pane} value={pane}>{PANE_LABELS[pane]}</option>
              ))}
            </select>
          </label>
        ))}
        <p className="hint">使用中の要素を選ぶと、その枠と入れ替わります。「適用」で配置を保存します。</p>
        <div className="modal-actions layout-dialog-actions">
          <button onClick={() => setDraft(createDefaultLayout())}>初期配置に戻す</button>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={() => {
            onApply(draft)
            onClose()
          }}>適用</button>
        </div>
      </div>
    </div>
  )
}
