import { useEffect, useMemo, useRef, useState } from 'react'
import type { LangId } from '../lib/langs'
import { deleteSnapshot, listSnapshots, saveSnapshot } from '../lib/snapshots'
import type { Snapshot } from '../lib/snapshots'
import { useFocusTrap } from '../lib/useFocusTrap'
import { Icon } from './Icon'

export function SaveLoadDialog({
  code,
  lang,
  onLoad,
  onSaved,
  onClose,
  embedded = false,
  focusNameSignal = 0,
}: {
  code: string
  lang: LangId
  onLoad: (s: Snapshot) => void
  onSaved?: (s: Snapshot) => void
  embedded?: boolean
  onClose: () => void
  focusNameSignal?: number
}) {
  const [name, setName] = useState('')
  const [snapshots, setSnapshots] = useState(() => listSnapshots())
  const [error, setError] = useState<string | null>(null)
  const [downloadSaved, setDownloadSaved] = useState(false)
  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const trapRef = useFocusTrap<HTMLDivElement>(onClose, !embedded)
  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0
  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.savedAt - a.savedAt),
    [snapshots],
  )

  const refresh = () => setSnapshots(listSnapshots())

  useEffect(() => {
    if (focusNameSignal <= 0) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [focusNameSignal])

  useEffect(() => () => {
    if (downloadTimer.current) clearTimeout(downloadTimer.current)
  }, [])

  const saveInApp = () => {
    if (!canSave) return
    if (
      snapshots.some((snapshot) => snapshot.name === trimmedName) &&
      !window.confirm('同じ名前のスナップショットを上書きします。よろしいですか?')
    ) {
      return
    }
    try {
      const snapshot = saveSnapshot(trimmedName, lang, code)
      setError(null)
      refresh()
      onSaved?.(snapshot)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const saveAsFile = () => {
    if (!canSave) return
    const safeName = trimmedName.replace(/[\\/:*?"<>|]/g, '_')
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.${lang}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setDownloadSaved(true)
    if (downloadTimer.current) clearTimeout(downloadTimer.current)
    downloadTimer.current = setTimeout(() => setDownloadSaved(false), 2_400)
  }

  const load = (snapshot: Snapshot) => {
    if (code && code !== snapshot.code && !window.confirm('現在の写経内容を置き換えます。よろしいですか?')) {
      return
    }
    onLoad(snapshot)
    onClose()
  }

  const remove = (id: string) => {
    if (!window.confirm('このスナップショットを削除します。よろしいですか?')) return
    try {
      deleteSnapshot(id)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={embedded ? undefined : "modal-backdrop"} onClick={embedded ? undefined : onClose}>
      <div
        className={embedded ? "sidebar-panel" : "modal"}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="保存と読み込み"
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>保存と読み込み</h2>
        <label className="field">
          名前
          <input ref={nameRef} type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!embedded} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button onClick={saveAsFile} disabled={!canSave}>
            ファイルとして保存
          </button>
          <span className={`download-status${downloadSaved ? ' download-status-saved' : ''}`} aria-live="polite" aria-label={downloadSaved ? 'Saved!' : 'ダウンロード'}>
            <Icon name={downloadSaved ? 'check' : 'download'} />
            {downloadSaved && <span className="download-status-tooltip" role="status">Saved!</span>}
          </span>
          <button className="primary" onClick={saveInApp} disabled={!canSave}>
            アプリ内に保存
          </button>
        </div>
        <h3>保存済み一覧</h3>
        <div className="snapshot-list">
          {sortedSnapshots.length === 0 && <p className="placeholder">保存済みスナップショットはありません。</p>}
          {sortedSnapshots.map((snapshot) => (
            <div className="snapshot-row" key={snapshot.id}>
              <div>
                <div className="snapshot-name">{snapshot.name}</div>
                <div className="snapshot-date">{new Date(snapshot.savedAt).toLocaleString('ja-JP')}</div>
              </div>
              <div className="snapshot-actions">
                <button onClick={() => load(snapshot)}>読み込み</button>
                <button onClick={() => remove(snapshot.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
        {!embedded && <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>}
      </div>
    </div>
  )
}
