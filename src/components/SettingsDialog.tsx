import { useState } from 'react'
import { DEFAULT_MODEL, loadSettings, saveSettings } from '../lib/settings'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(loadSettings)

  const save = () => {
    saveSettings({ ...settings, apiKey: settings.apiKey.trim(), model: settings.model.trim() || DEFAULT_MODEL })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="設定" onClick={(e) => e.stopPropagation()}>
        <h2>設定</h2>
        <label className="field">
          OpenAI APIキー
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-..."
            onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
            autoComplete="off"
          />
        </label>
        <label className="field">
          モデル
          <input
            type="text"
            value={settings.model}
            placeholder={DEFAULT_MODEL}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
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
