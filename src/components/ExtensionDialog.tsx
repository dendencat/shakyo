import { useRef, useState, useSyncExternalStore } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'
import type { ExtensionManager } from '../extensions/manager'
import { inspectInWorker } from '../extensions/inspect'
import type { CheckedPackage } from '../extensions/model'
import { LIMITS } from '../extensions/model'

const STATUS = { disabled: '無効', inactive: '有効（待機中）', active: '実行中', error: '停止（エラー）', blocked: '再検査・承認が必要' }
export function ExtensionDialog({ manager, onClose, onRun }: { manager: ExtensionManager; onClose(): void; onRun(id: string, command: string): void }) {
  const rows = useSyncExternalStore(manager.subscribe, manager.snapshot)
  const [candidate, setCandidate] = useState<{ archive: Uint8Array; checked: CheckedPackage } | null>(null)
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const close = () => { generation.current++; onClose() }
  const ref = useFocusTrap<HTMLDivElement>(close)
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : '処理に失敗しました。') }
    finally { setBusy(false) }
  }
  const inspect = async (file: File) => {
    const id = ++generation.current
    setCandidate(null); setApproved(false)
    await action(async () => {
      if (file.size > LIMITS.archive) throw new Error('パッケージは5MiB以下にしてください。')
      const archive = new Uint8Array(await file.arrayBuffer())
      const checked = await inspectInWorker(archive)
      if (generation.current === id) setCandidate({ archive, checked })
    })
  }
  const manifest = candidate?.checked.manifest
  const previous = rows.find(row => row.item.manifest.id === manifest?.id)
  return <div className="modal-backdrop" onClick={close}>
    <div className="modal extensions-modal" role="dialog" aria-modal="true" aria-label="拡張機能" ref={ref} onClick={e => e.stopPropagation()}>
      <h2>拡張機能</h2>
      <p className="hint">拡張は端末ごとに保存されます。検査結果は安全性を保証するものではありません。</p>
      <label className="field">パッケージを検査（.shakyo-ext / ZIP）
        <input type="file" accept=".shakyo-ext,.zip" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void inspect(file); e.target.value = '' }} />
      </label>
      {busy && <p role="status">処理中…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {candidate && <section className="extension-card" aria-label="検査結果">
        <h3>{manifest?.name ?? 'パッケージ'} {manifest?.version}</h3>
        <p>{candidate.checked.report.outcome === 'blocked' ? '導入できません' : candidate.checked.report.outcome === 'review-required' ? '警告があります。内容を確認してください' : '今回の検査では問題は検出されませんでした'}</p>
        <ul>{candidate.checked.report.findings.map((finding, i) => <li key={i}>
          {finding.severity === 'block' ? '拒否' : '警告'}: {finding.message}
          {finding.file && <small>（{finding.file}{finding.line ? `:${finding.line}:${finding.column}` : ''}）</small>}
        </li>)}</ul>
        {manifest && <>
          <p className="hint">作者の身元は未検証です。ID: {manifest.id}</p>
          <p>エディタ: {manifest.permissions.editor.map(v => v === 'read' ? '読取' : '変更').join('・') || 'アクセスなし'} ／ お手本: {manifest.permissions.reference.map(v => v === 'read' ? '読取' : '変更').join('・') || 'アクセスなし'}</p>
          <p>通信先: {manifest.permissions.network.join('、') || '直接通信なし'}</p>
          <p className="hint">専用データ保存と本体描画の入力UIを使用できます。URL表示にはその都度確認があります。</p>
          <details><summary>検査情報</summary><small>SHA-256: {candidate.checked.report.packageHash}<br />検査器 {candidate.checked.report.scannerVersion} / ポリシー {candidate.checked.report.policyVersion}</small></details>
          {candidate.checked.report.outcome !== 'blocked' && <>
            <label className="extension-consent"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />
              {previous ? '警告と権限を確認し、既存の拡張を置き換えて専用保存データを引き継ぎます' : '警告と権限を確認し、この拡張の導入・有効化を承認します'}
            </label>
            <button className="primary" disabled={!approved || busy} onClick={() => void action(async () => {
              await manager.install(candidate.archive, candidate.checked.report.packageHash, previous?.item.instanceId)
              setCandidate(null); setApproved(false)
            })}>{previous ? '置き換えて有効化' : '導入して有効化'}</button>
          </>}
        </>}
      </section>}
      <h3>導入済み</h3>
      {!rows.length && <p>拡張はまだありません。</p>}
      {rows.map(({ item, status }) => <section className="extension-card" key={item.instanceId}>
        <h3>{item.manifest.name} <small>{item.manifest.version}</small></h3>
        <p>{STATUS[status]}</p>
        <div className="extension-actions">
          <button disabled={busy || status === 'blocked'} onClick={() => void action(() => manager.enable(item.instanceId, !item.enabled || status === 'error'))}>
            {status === 'error' ? '再起動' : item.enabled ? '無効にする' : '有効にする'}
          </button>
          <button disabled={busy} onClick={() => { if (window.confirm('この拡張と専用の保存データを削除しますか？')) void action(() => manager.remove(item.instanceId)) }}>削除</button>
        </div>
        {Object.entries(item.manifest.contributes.settings).length > 0 && <details><summary>拡張の設定</summary>
          {Object.entries(item.manifest.contributes.settings).map(([key, def]) => <label className="field" key={key}>{def.title}
            {def.enum ? <select disabled={!item.enabled || busy} value={String(item.settings[key] ?? def.default)} onChange={e => void action(() => manager.setSetting(item.instanceId, key, e.target.value))}>
              {def.enum.map(value => <option key={value}>{value}</option>)}
            </select> : def.type === 'boolean' ? <input type="checkbox" disabled={!item.enabled || busy} checked={Boolean(item.settings[key] ?? def.default)} onChange={e => void action(() => manager.setSetting(item.instanceId, key, e.target.checked))} />
              : <input key={`${item.instanceId}:${key}:${String(item.settings[key])}`} type={def.type === 'number' ? 'number' : 'text'} disabled={!item.enabled || busy} defaultValue={String(item.settings[key] ?? def.default)} maxLength={2000} onBlur={e => {
                const value = def.type === 'number' ? Number(e.target.value) : e.target.value
                if (value !== item.settings[key]) void action(() => manager.setSetting(item.instanceId, key, value))
              }} />}
          </label>)}
        </details>}
        <div className="extension-actions">{item.manifest.contributes.commands.map(command => <button key={command.id} disabled={busy || !item.enabled || status === 'blocked' || status === 'error'} onClick={() => onRun(item.instanceId, command.id)}>{command.title}</button>)}</div>
      </section>)}
      <div className="modal-actions"><button onClick={close}>閉じる</button></div>
    </div>
  </div>
}
