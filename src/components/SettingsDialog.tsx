import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_MODEL,
  isSettingsStorageKey,
  loadSettings,
  saveSettings,
  type ReasoningEffort,
} from '../lib/settings'
import { useFocusTrap } from '../lib/useFocusTrap'

export function SettingsDialog({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const [settings, setSettings] = useState(loadSettings)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const trapRef = useFocusTrap<HTMLDivElement>(onClose, !embedded)

  useEffect(() => {
    // storage イベントは他タブでの localStorage 変更時にのみ発火し、
    // 変更を行った同一タブでは発火しない(ブラウザ仕様)。
    const handleStorage = (e: StorageEvent) => {
      if (isSettingsStorageKey(e.key) && !dirtyRef.current) {
        setSettings(loadSettings())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const save = () => {
    saveSettings({ ...settings, apiKey: settings.apiKey.trim(), model: settings.model.trim() || DEFAULT_MODEL })
    onClose()
  }

  return (
    <div className={embedded ? undefined : "modal-backdrop"} onClick={embedded ? undefined : onClose}>
      <div
        className={embedded ? "sidebar-panel" : "modal"}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="設定"
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>設定</h2>
        <label className="field">
          OpenAI APIキー
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-..."
            onChange={(e) => {
              setDirty(true)
              setSettings((s) => ({ ...s, apiKey: e.target.value }))
            }}
            autoComplete="off"
          />
        </label>
        <label className="field">
          モデル
          <input
            type="text"
            value={settings.model}
            placeholder={DEFAULT_MODEL}
            onChange={(e) => {
              setDirty(true)
              setSettings((s) => ({ ...s, model: e.target.value }))
            }}
          />
        </label>
        <details className="field-advanced">
          <summary>詳細設定</summary>
          <label className="field">
            解説の深さ
            <select
              value={settings.reasoningEffort}
              onChange={(e) => {
                setDirty(true)
                setSettings((s) => ({ ...s, reasoningEffort: e.target.value as ReasoningEffort }))
              }}
            >
              <option value="minimal">最速(推奨)</option>
              <option value="low">速い・少し考える</option>
              <option value="medium">じっくり</option>
              <option value="high">最も深く考える(遅い)</option>
            </select>
          </label>
          <p className="hint">
            深くするほど解説が始まるまでの待ち時間が長くなります。
          </p>
        </details>
        <p className="hint">
          APIキーはこのブラウザのlocalStorageにのみ保存され、OpenAI API以外には送信されません。
        </p>
        <div className="modal-actions">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
