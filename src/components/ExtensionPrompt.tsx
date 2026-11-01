import { useState } from 'react'
import type { Json } from '../extensions/api'
import type { UiKind } from '../extensions/manager'
import { useFocusTrap } from '../lib/useFocusTrap'

export interface ExtensionPromptRequest {
  id: number
  owner: string
  kind: UiKind
  message: string
  options: string[]
  finish(value: Json): void
}
export function ExtensionPrompt({ request }: { request: ExtensionPromptRequest }) {
  const [value, setValue] = useState(request.options[0] ?? '')
  const ref = useFocusTrap<HTMLFormElement>(() => request.finish(null))
  return <div className="modal-backdrop">
    <form className="modal" role="dialog" aria-modal="true" aria-label="拡張からの確認" ref={ref} onSubmit={e => {
      e.preventDefault()
      request.finish(request.kind === 'confirm' ? true : request.kind === 'notify' ? null : value)
    }}>
      <h2>拡張: {request.owner}</h2>
      <p className="extension-message">{request.message}</p>
      {(request.kind === 'input' || request.kind === 'select') && <label className="field">入力
        {request.kind === 'input' ? <input autoFocus value={value} maxLength={4000} onChange={e => setValue(e.target.value)} />
          : <select value={value} onChange={e => setValue(e.target.value)}>{request.options.map((option, i) => <option key={i}>{option}</option>)}</select>}
      </label>}
      <div className="modal-actions"><button type="button" onClick={() => request.finish(null)}>キャンセル</button><button className="primary" type="submit">{request.kind === 'confirm' ? '許可する' : 'OK'}</button></div>
    </form>
  </div>
}
