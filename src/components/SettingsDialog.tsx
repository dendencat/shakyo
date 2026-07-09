import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MODEL, isSettingsStorageKey, loadSettings, saveSettings } from '../lib/settings'
import { useFocusTrap } from '../lib/useFocusTrap'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(loadSettings)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const trapRef = useFocusTrap<HTMLDivElement>(onClose)

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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
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
