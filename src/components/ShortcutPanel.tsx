import { useState } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'
import { captureShortcut, defaultShortcuts, loadShortcuts, saveShortcuts, shortcutActions, validateShortcuts } from '../lib/shortcuts'

export function ShortcutDialog({ onClose, onSaved, onError }: { onClose: () => void; onSaved?: () => void; onError?: (message: string) => void }) {
  const [keys, setKeys] = useState(loadShortcuts)
  const [error, setError] = useState('')
  const [activeCapture, setActiveCapture] = useState<string | null>(null)
  const ref = useFocusTrap<HTMLDivElement>(onClose)
  const save = () => {
    const invalid = validateShortcuts(keys)
    if (invalid) { setError(invalid); return }
    try { saveShortcuts(keys) } catch {
      const message = 'ショートカットを保存できませんでした。'
      setError(message)
      onError?.(message)
      return
    }
    onSaved?.()
    onClose()
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" id="shortcut-dialog" role="dialog" aria-modal="true" aria-label="ショートカット" ref={ref} onClick={e => e.stopPropagation()}>
      <h2>ショートカット</h2>
      <p>機能の入力欄で割り当てたいキーを押してください。Ctrl / Cmd + / はこのメニュー専用です。</p>
      <p className="hint">初期値はVSCodeを参考にしています。コメント切り替えはCtrl / Cmd + Shift + /。Vim・Emacsでは初期値から変更した割り当てだけを優先します。OSやブラウザが予約したキーは使えない場合があります。</p>
      {shortcutActions.map(action => <label className={`field shortcut-capture${activeCapture === action.id ? ' active' : ''}`} key={action.id}>{action.label}: <input readOnly value={keys[action.id].replace('Mod', 'Ctrl / Cmd').replaceAll('-', ' + ')}
        aria-label={`${action.label}のショートカット`}
        onFocus={() => setActiveCapture(action.id)}
        onBlur={() => setActiveCapture(current => current === action.id ? null : current)}
        onClick={event => event.currentTarget.select()}
        onKeyDownCapture={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) { event.stopPropagation(); return }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setActiveCapture(null); ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); return }
          // Tab remains available for accessible navigation; use the initial-value reset to restore Tab bindings.
          if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) return
          event.preventDefault(); event.stopPropagation()
          const key = captureShortcut(event.nativeEvent)
          if (key) { setKeys(current => ({ ...current, [action.id]: key })); setError(''); setActiveCapture(action.id) }
        }} /></label>)}
      <p className="hint">Tabで次の項目へ移動します。Escapeで入力欄から離れ、もう一度Escapeで閉じます。</p>
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="modal-actions">
        <button onClick={() => { setKeys(defaultShortcuts()); setError('') }}>初期値に戻す</button>
        <button onClick={onClose}>キャンセル</button><button className="primary" onClick={save}>保存</button>
      </div>
    </div>
  </div>
}
