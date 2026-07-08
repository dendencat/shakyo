import { useMemo, useState } from 'react'
import type { LangId } from '../lib/langs'
import { deleteSnapshot, listSnapshots, saveSnapshot } from '../lib/snapshots'

export function SaveLoadDialog({
  code,
  lang,
  onLoad,
  onClose,
}: {
  code: string
  lang: LangId
  onLoad: (s: { code: string; lang: LangId }) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [snapshots, setSnapshots] = useState(() => listSnapshots())
  const [error, setError] = useState<string | null>(null)
  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0
  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.savedAt - a.savedAt),
    [snapshots],
  )

  const refresh = () => setSnapshots(listSnapshots())

  const saveInApp = () => {
    if (!canSave) return
    if (
      snapshots.some((snapshot) => snapshot.name === trimmedName) &&
      !window.confirm('同じ名前のスナップショットを上書きします。よろしいですか?')
    ) {
      return
    }
    try {
      saveSnapshot(trimmedName, lang, code)
      setError(null)
      refresh()
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
    URL.revokeObjectURL(url)
  }

  const load = (snapshot: { code: string; lang: LangId }) => {
    if (code && code !== snapshot.code && !window.confirm('現在の写経内容を置き換えます。よろしいですか?')) {
      return
    }
    onLoad({ code: snapshot.code, lang: snapshot.lang })
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="保存と読み込み" onClick={(e) => e.stopPropagation()}>
        <h2>保存と読み込み</h2>
        <label className="field">
          名前
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button onClick={saveAsFile} disabled={!canSave}>
            ファイルとして保存
          </button>
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
        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
