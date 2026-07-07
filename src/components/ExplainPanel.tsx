import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamExplanation } from '../lib/openai'
import { loadSettings } from '../lib/settings'

export function ExplainPanel({
  getCode,
  onOpenSettings,
}: {
  getCode: () => { code: string; isSelection: boolean } | null
  onOpenSettings: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [sourceLabel, setSourceLabel] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const explain = async () => {
    const settings = loadSettings()
    if (!settings.apiKey) {
      setError('OpenAI APIキーが未設定です。右上の「設定」から登録してください。')
      return
    }
    const target = getCode()
    if (!target || !target.code.trim()) {
      setError('解説するコードがありません。写経エディタにコードを入力してください。')
      return
    }

    setError(null)
    setText('')
    setSourceLabel(target.isSelection ? '選択範囲' : '全文')
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const chunk of streamExplanation({
        apiKey: settings.apiKey,
        model: settings.model,
        code: target.code,
        signal: controller.signal,
      })) {
        setText((prev) => prev + chunk)
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  return (
    <section className="explain-panel">
      <div className="pane-header">
        <h2>コードの意味解説</h2>
        <div className="toolbar">
          {sourceLabel && <span className="badge">{sourceLabel}</span>}
          {running ? (
            <button onClick={stop}>停止</button>
          ) : (
            <button className="primary" onClick={() => void explain()}>
              解説する
            </button>
          )}
        </div>
      </div>
      <div className="explain-body">
        {error && (
          <p className="error-text">
            {error}{' '}
            <button className="link" onClick={onOpenSettings}>
              設定を開く
            </button>
          </p>
        )}
        {!error && !text && !running && (
          <p className="placeholder">
            エディタでコードを選択(未選択なら全文)して「解説する」を押すと、AIがコードの意味を解説します。
          </p>
        )}
        {(text || running) && (
          <div className="explain-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            {running && <span className="cursor">▌</span>}
          </div>
        )}
      </div>
    </section>
  )
}
