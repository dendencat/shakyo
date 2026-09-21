import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_MODEL,
  HIGH_PERFORMANCE_MODELS,
  isSettingsStorageKey,
  loadSettings,
  normalizeReasoningEffort,
  saveSettings,
  STANDARD_MODELS,
  type ReasoningEffort,
} from '../lib/settings'
import { useFocusTrap } from '../lib/useFocusTrap'
import { isTauri } from '../lib/openExternal'
import { KEY_PREFERENCES, loadPreferences, savePreferences, type Preferences, type EditorMode } from '../lib/preferences'
import { PANE_LABELS } from '../lib/layout'
import { InfoTooltip } from './InfoTooltip'

function CheckSetting({ label, info, children }: { label: string; info: string; children: ReactNode }) {
  return <div className="setting-check-row">{children}<InfoTooltip label={label}>{info}</InfoTooltip></div>
}

function FieldSetting({ id, label, info, children }: {
  id: string
  label: string
  info: string
  children: ReactNode
}) {
  return <div className="field">
    <div className="setting-label-row"><label htmlFor={id}>{label}</label><InfoTooltip label={label}>{info}</InfoTooltip></div>
    {children}
  </div>
}

export function SettingsDialog({ onClose, onSaved, onError, embedded = false }: { onClose: () => void; onSaved?: () => void; onError?: (message: string) => void; embedded?: boolean }) {
  const [settings, setSettings] = useState(loadSettings)
  const [preferences, setPreferences] = useState(loadPreferences)
  const [error, setError] = useState('')
  const changePreferences = (change: Partial<Preferences>) => {
    setDirty(true)
    setPreferences(current => ({ ...current, ...change }))
  }
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
      if ((e.key === null || e.key === KEY_PREFERENCES) && !dirtyRef.current) setPreferences(loadPreferences())
    }
    window.addEventListener('storage', handleStorage)
    const refreshPreferences = () => { if (!dirtyRef.current) setPreferences(loadPreferences()) }
    window.addEventListener('shakyo:preferences', refreshPreferences)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('shakyo:preferences', refreshPreferences)
    }
  }, [])

  const save = () => {
    try {
      saveSettings({ ...settings, apiKey: settings.apiKey.trim(), model: settings.model.trim() || DEFAULT_MODEL })
      savePreferences(preferences)
    } catch {
      const message = '設定を保存できませんでした。保存領域を確認して再度お試しください。'
      setError(message)
      onError?.(message)
      return
    }
    onSaved?.()
    onClose()
  }

  const modelOptions = settings.allowHighPerformanceModels
    ? [...STANDARD_MODELS, ...HIGH_PERFORMANCE_MODELS]
    : [...STANDARD_MODELS]

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
        <fieldset className="preferences-group"><legend>表示</legend>
          {(['reference', 'explain'] as const).map(id => <CheckSetting key={id} label={`${PANE_LABELS[id]}を表示`}
            info={`${PANE_LABELS[id]}ペインの表示・非表示を切り替えます。閉じても保存内容は失われません。`}>
            <label className="preference-check">
              <input type="checkbox" checked={preferences.visiblePanes[id]}
                onChange={event => changePreferences({ visiblePanes: { ...preferences.visiblePanes, [id]: event.target.checked } })} />
              {PANE_LABELS[id]}を表示
            </label>
          </CheckSetting>)}
          <p className="hint">写経エディタは常に表示します。お手本・解説は各ペインの閉じるボタンでも非表示にできます。</p>
          <div className="field">
            <div className="setting-label-row"><span>コードの文字サイズ</span><InfoTooltip label="コードの文字サイズ">写経エディタとコード表示の文字を10〜32pxで調整します。</InfoTooltip></div>
            <div className="font-controls">
              <button type="button" aria-label="文字を縮小" disabled={preferences.fontSize <= 10} onClick={() => changePreferences({ fontSize: preferences.fontSize - 1 })}>−</button>
              <output aria-live="polite">{preferences.fontSize}px</output>
              <button type="button" aria-label="文字を拡大" disabled={preferences.fontSize >= 32} onClick={() => changePreferences({ fontSize: preferences.fontSize + 1 })}>＋</button>
              <button type="button" onClick={() => changePreferences({ fontSize: 14 })}>リセット</button>
            </div>
          </div>
          <CheckSetting label="リーディングモード" info="PDF・EPUBを1ページずつ表示し、操作メニューをホバーまたはクリック時だけ表示します。">
            <label className="preference-check">
              <input type="checkbox" checked={preferences.readingMode}
                onChange={event => changePreferences({ readingMode: event.target.checked })} />
              リーディングモード
            </label>
          </CheckSetting>
          <CheckSetting label="常に最前面に表示" info="デスクトップ版のshakyoウィンドウを他のウィンドウより手前に保ちます。Web版では利用できません。">
            <label className="preference-check">
              <input type="checkbox" checked={preferences.alwaysOnTop} disabled={!isTauri()}
                onChange={event => changePreferences({ alwaysOnTop: event.target.checked })} />
              常に最前面に表示{!isTauri() && '（デスクトップ版のみ）'}
            </label>
          </CheckSetting>
        </fieldset>
        <fieldset className="preferences-group"><legend>エディタ</legend>
          <FieldSetting id="setting-editor-mode" label="エディタモード" info="通常操作またはVim・Emacs・VSCode互換のキー操作を選びます。"><select id="setting-editor-mode" value={preferences.editorMode} onChange={e => changePreferences({ editorMode: e.target.value as EditorMode })}>
            <option value="normal">ノーマル</option><option value="vim">Vim</option><option value="emacs">Emacs</option><option value="vscode">VSCode</option>
          </select></FieldSetting>
          <FieldSetting id="setting-indent-style" label="インデント" info="Tab入力時にスペースまたはタブ文字のどちらを挿入するか選びます。"><select id="setting-indent-style" value={preferences.indentStyle} onChange={e => changePreferences({ indentStyle: e.target.value as Preferences['indentStyle'] })}>
            <option value="spaces">スペース</option><option value="tabs">タブ</option>
          </select></FieldSetting>
          <FieldSetting id="setting-indent-width" label="インデント幅" info="インデント1段として使用・表示する文字数を選びます。"><select id="setting-indent-width" value={preferences.indentWidth} onChange={e => changePreferences({ indentWidth: Number(e.target.value) as Preferences['indentWidth'] })}>
            {[2, 4, 8].map(width => <option key={width} value={width}>{width}</option>)}
          </select></FieldSetting>
          <CheckSetting label="自動インデント" info="改行時に言語と直前の行に合わせてインデントを自動挿入します。">
            <label className="preference-check"><input type="checkbox" checked={preferences.autoIndent} onChange={e => changePreferences({ autoIndent: e.target.checked })} />自動インデント</label>
          </CheckSetting>
        </fieldset>
        <fieldset className="preferences-group"><legend>Web参照</legend>
          <CheckSetting label="URL欄で履歴候補を表示" info="Web参照のURL入力中に、過去に開いたURLを候補として表示します。履歴の記録自体は停止しません。">
            <label className="preference-check"><input type="checkbox" checked={preferences.showHistorySuggestions} onChange={e => changePreferences({ showHistorySuggestions: e.target.checked })} />URL欄で履歴候補を表示</label>
          </CheckSetting>
          <p className="hint">無効にしても履歴は記録され、履歴アイコンから確認できます。</p>
        </fieldset>
        <fieldset className="preferences-group"><legend>OpenAI</legend>
        <FieldSetting id="setting-api-key" label="OpenAI APIキー" info="AI解説の認証に使用します。現在はこのブラウザのlocalStorageに保存されるため、共有端末では保存しないでください。">
          <input
            id="setting-api-key"
            type="password"
            value={settings.apiKey}
            placeholder="sk-..."
            onChange={(e) => {
              setDirty(true)
              setSettings((s) => ({ ...s, apiKey: e.target.value }))
            }}
            autoComplete="off"
          />
        </FieldSetting>
        <FieldSetting id="setting-model" label="モデル" info="AI解説に使用するモデルを選びます。高性能モデルは詳細設定で有効化でき、料金が高くなる場合があります。">
          <select
            id="setting-model"
            value={settings.model}
            onChange={(e) => {
              setDirty(true)
              const model = e.target.value
              setSettings((s) => ({
                ...s,
                model,
                reasoningEffort: normalizeReasoningEffort(s.reasoningEffort, model),
              }))
            }}
          >
            {modelOptions.map(model => <option key={model} value={model}>{model}{model === DEFAULT_MODEL ? '（既定）' : ''}</option>)}
          </select>
        </FieldSetting>
        <details className="field-advanced">
          <summary>詳細設定</summary>
          <CheckSetting label="高性能なモデルを使用する" info="GPT-5.6 SolやGPT-6 Astraを選択可能にします。性能と引き換えに高額なAPI料金が発生する可能性があります。">
            <label className="preference-check">
              <input
                type="checkbox"
                checked={settings.allowHighPerformanceModels}
                onChange={(event) => {
                  setDirty(true)
                  setSettings((current) => {
                    const allowHighPerformanceModels = event.target.checked
                    const model = !allowHighPerformanceModels && HIGH_PERFORMANCE_MODELS.some(value => value === current.model)
                      ? DEFAULT_MODEL
                      : current.model
                    return {
                      ...current,
                      allowHighPerformanceModels,
                      model,
                      reasoningEffort: normalizeReasoningEffort(current.reasoningEffort, model),
                    }
                  })
                }}
              />
              高性能なモデルを使用する
            </label>
          </CheckSetting>
          {settings.allowHighPerformanceModels && (
            <p className="error-text" role="alert">
              高性能モデルは利用料金が大幅に高くなる場合があります。このアプリには請求額の上限を強制する機能がありません。
            </p>
          )}
          <FieldSetting id="setting-reasoning-effort" label="解説の深さ" info="推論量を増やすほど複雑なコードを詳しく検討できますが、開始までの時間と料金が増える場合があります。">
            <select
              id="setting-reasoning-effort"
              value={settings.reasoningEffort}
              onChange={(e) => {
                setDirty(true)
                setSettings((s) => ({ ...s, reasoningEffort: e.target.value as ReasoningEffort }))
              }}
            >
              <option value="none">最速（推奨）</option>
              <option value="low">速い・少し考える</option>
              <option value="medium">じっくり</option>
              <option value="high">深く考える</option>
              <option value="xhigh">より深く考える（遅い）</option>
              <option value="max">最も深く考える（最も遅い）</option>
            </select>
          </FieldSetting>
          <p className="hint">
            深くするほど解説が始まるまでの待ち時間が長くなります。
          </p>
        </details>
        <p className="hint">
          APIキーはこのブラウザのlocalStorageにのみ保存され、OpenAI API以外には送信されません。
        </p>
        <details className="field-advanced">
          <summary>送信する情報と料金について</summary>
          <p className="hint">解説の実行時に、選択したコード（未選択なら全文）と解説用の指示をOpenAIに直接送信します。追加質問では、元のコード・過去の質問と回答・今回の質問も送信します。APIキーは認証ヘッダーで送信し、shakyo開発者のサーバーを経由しません。</p>
          <p className="hint">OpenAI APIのデータは、利用者が明示的に共有へ同意した場合を除き、既定ではモデルの学習に使用されません。不正利用監視ログは通常最大30日保持され、法的義務などの例外があります。保存されないことを保証するものではありません。参照するWebサイトや、通信を許可した拡張の通信は、それぞれ別の扱いです。</p>
          <p className="hint">APIはChatGPTのサブスクリプションとは別料金です。モデルの切り替え、入力・出力・推論トークン数、追加質問で送る会話の長さにより請求額が変わります。このアプリには請求額の上限を強制する機能はありません。利用前に料金と利用状況を確認してください。</p>
          <p className="hint"><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAIのデータ利用方針</a> / <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">API料金</a> / <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer">利用状況</a></p>
        </details>
        </fieldset>
        {error && <p className="error-text" role="alert">{error}</p>}
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
