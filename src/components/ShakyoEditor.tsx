import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { LANGUAGE_OPTIONS, languageExtension } from '../lib/langs'
import type { LangId } from '../lib/langs'
import { KEY_DRAFT, KEY_EDITOR_LANG } from '../lib/settings'

function initialLang(): LangId {
  const saved = localStorage.getItem(KEY_EDITOR_LANG)
  if (saved && LANGUAGE_OPTIONS.some((o) => o.id === saved)) return saved as LangId
  return 'ts'
}

export function ShakyoEditor({
  editorRef,
}: {
  editorRef: React.RefObject<ReactCodeMirrorRef | null>
}) {
  const [code, setCode] = useState(() => localStorage.getItem(KEY_DRAFT) ?? '')
  const [lang, setLang] = useState<LangId>(initialLang)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    localStorage.setItem(KEY_EDITOR_LANG, lang)
  }, [lang])

  const onChange = (value: string) => {
    setCode(value)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => localStorage.setItem(KEY_DRAFT, value), 400)
  }

  const clear = () => {
    if (code && !window.confirm('写経した内容をすべて消去します。よろしいですか?')) return
    setCode('')
    localStorage.setItem(KEY_DRAFT, '')
  }

  return (
    <section className="pane editor-pane">
      <div className="pane-header">
        <h2>写経エディタ</h2>
        <div className="toolbar">
          <label>
            言語:{' '}
            <select value={lang} onChange={(e) => setLang(e.target.value as LangId)}>
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={clear}>クリア</button>
        </div>
      </div>
      <div className="pane-body editor-body">
        <CodeMirror
          ref={editorRef}
          value={code}
          onChange={onChange}
          extensions={languageExtension(lang)}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
          placeholder="ここにお手本のコードを書き写していきます…"
          className="shakyo-code"
        />
      </div>
    </section>
  )
}
