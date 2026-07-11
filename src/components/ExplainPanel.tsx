import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildExplanationMessages, streamChat, streamExplanation } from '../lib/openai'
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
  const [copied, setCopied] = useState(false)
  const [followups, setFollowups] = useState<{ question: string; answer: string }[]>([])
  const [question, setQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const codeRef = useRef<string | null>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      window.clearTimeout(copyTimerRef.current)
    },
    [],
  )

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
    setFollowups([])
    codeRef.current = target.code
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

  const askFollowup = async () => {
    const nextQuestion = question.trim()
    if (running || !nextQuestion || text === '' || codeRef.current == null) return

    const settings = loadSettings()
    if (!settings.apiKey) {
      setError('OpenAI APIキーが未設定です。右上の「設定」から登録してください。')
      return
    }

    const confirmedFollowups = followups
    const messages = [
      ...buildExplanationMessages(codeRef.current),
      { role: 'assistant' as const, content: text },
      ...confirmedFollowups.flatMap(({ question: previousQuestion, answer }) => [
        { role: 'user' as const, content: previousQuestion },
        { role: 'assistant' as const, content: answer },
      ]),
      { role: 'user' as const, content: nextQuestion },
    ]

    setQuestion('')
    setError(null)
    setRunning(true)
    setFollowups((prev) => [...prev, { question: nextQuestion, answer: '' }])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const chunk of streamChat({
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        signal: controller.signal,
      })) {
        setFollowups((prev) =>
          prev.map((followup, index) =>
            index === prev.length - 1
              ? { ...followup, answer: followup.answer + chunk }
              : followup,
          ),
        )
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : '解説の取得に失敗しました。')
      }
    } finally {
      setFollowups((prev) => {
        const lastFollowup = prev.at(-1)
        if (!lastFollowup || lastFollowup.answer !== '') return prev

        setQuestion((currentQuestion) =>
          currentQuestion === '' ? lastFollowup.question : currentQuestion,
        )
        return prev.slice(0, -1)
      })
      setRunning(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(
        text +
          followups
            .map(({ question, answer }) => `\n\n---\n\n**追加質問:** ${question}\n\n${answer}`)
            .join(''),
      )
      setError(null)
      setCopied(true)
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      window.clearTimeout(copyTimerRef.current)
      setError('クリップボードへのコピーに失敗しました。')
    }
  }

  return (
    <section className="explain-panel">
      <div className="pane-header">
        <h2>コードの意味解説</h2>
        <div className="toolbar">
          {sourceLabel && <span className="badge">{sourceLabel}</span>}
          {copied && <span className="badge">コピーしました</span>}
          <button
            className="icon-button"
            onClick={() => void copyText()}
            disabled={!text}
            aria-label="解説をコピー"
            title="解説をコピー"
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 5h6M9 4h6v3H9zM7 6H5v15h14V6h-2"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
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
            {running && followups.length === 0 && <span className="cursor">▌</span>}
            {followups.map((followup, index) => (
              <div key={index}>
                <div className="followup-question">{followup.question}</div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{followup.answer}</ReactMarkdown>
                {running && index === followups.length - 1 && <span className="cursor">▌</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <form
        className="followup-form"
        onSubmit={(event) => {
          event.preventDefault()
          void askFollowup()
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="追加で質問する…"
          aria-label="追加で質問する…"
        />
        <button
          className="primary"
          type="submit"
          disabled={running || question.trim() === '' || text === ''}
        >
          送信
        </button>
      </form>
    </section>
  )
}
