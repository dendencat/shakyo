import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef, ViewUpdate } from '@uiw/react-codemirror'
import { LANGUAGE_OPTIONS, languageExtension } from '../lib/langs'
import type { LangId } from '../lib/langs'
import { KEY_DRAFT, KEY_EDITOR_LANG } from '../lib/settings'
import { diffHighlight, getDiffResult, setDiffTarget } from '../lib/diffHighlight'
import { accuracyPercent, progressPercent, wordsPerMinute } from '../lib/stats'
import { loadProgress, saveProgress } from '../lib/progress'
import { diffAgainstReference, normalizeReference } from '../lib/diff'
import { SaveLoadDialog } from './SaveLoadDialog'
import { extensionRevision } from '../extensions/editorAdapter'

function initialLang(): LangId {
  const saved = localStorage.getItem(KEY_EDITOR_LANG)
  if (saved && LANGUAGE_OPTIONS.some((o) => o.id === saved)) return saved as LangId
  return 'ts'
}

export function ShakyoEditor({
  editorRef,
  referenceText,
  referenceName,
  resolvedTheme,
  onExtensionChange,
  onLanguageChange,
  allowReferenceRestore = true,
}: {
  editorRef: React.RefObject<ReactCodeMirrorRef | null>
  referenceText: string | null
  referenceName: string | null
  resolvedTheme: 'light' | 'dark'
  onExtensionChange?: (revision: number) => void
  onLanguageChange?: (language: string) => void
  allowReferenceRestore?: boolean
}) {
  const [code, setCode] = useState(() => localStorage.getItem(KEY_DRAFT) ?? '')
  const [lang, setLang] = useState<LangId>(initialLang)
  const [checkEnabled, setCheckEnabled] = useState(false)
  const [saveLoadOpen, setSaveLoadOpen] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const sessionStartRef = useRef<number | null>(null)
  const tickTimer = useRef<number | undefined>(undefined)
  const prevReferenceNameRef = useRef<string | null>(null)

  useEffect(() => {
    localStorage.setItem(KEY_EDITOR_LANG, lang)
    onLanguageChange?.(lang)
  }, [lang, onLanguageChange])

  const extensions = useMemo(() => [...languageExtension(lang), diffHighlight, extensionRevision], [lang])

  const normalizedReferenceLength = useMemo(
    () => (referenceText != null ? normalizeReference(referenceText).length : null),
    [referenceText],
  )

  const effectiveReference = checkEnabled && referenceText != null ? referenceText : null
  useEffect(() => {
    const view = editorRef.current?.view
    if (!view) return
    view.dispatch({ effects: setDiffTarget.of(effectiveReference) })
    // ドキュメント変更を伴わない dispatch では onChange が発火しないため、
    // ここで正誤判定 ON/OFF 切り替え直後の正確率を更新しておく
    const result = getDiffResult(view.state)
    setAccuracy(result != null ? accuracyPercent(result, view.state.doc.length) : null)
  }, [effectiveReference, editorRef])

  const startTicking = () => {
    if (tickTimer.current != null) return
    tickTimer.current = window.setInterval(() => setTick((t) => t + 1), 2000)
  }

  const stopTicking = () => {
    window.clearInterval(tickTimer.current)
    tickTimer.current = undefined
  }

  const resetSession = () => {
    sessionStartRef.current = null
    stopTicking()
  }

  useEffect(() => {
    return () => stopTicking()
  }, [])

  // お手本(referenceName)が変わったときに保存済み進捗の復元を試みる
  useEffect(() => {
    const prevName = prevReferenceNameRef.current
    prevReferenceNameRef.current = referenceName

    if (!allowReferenceRestore || referenceName == null || referenceName === prevName) return

    const entry = loadProgress(referenceName)
    if (entry == null) return
    if (entry.draft === code) return

    const restore = () => {
      setCode(entry.draft)
      localStorage.setItem(KEY_DRAFT, entry.draft)
      const restoredAccuracy =
        checkEnabled && referenceText != null
          ? accuracyPercent(diffAgainstReference(entry.draft, referenceText), entry.draft.length)
          : null
      setAccuracy(restoredAccuracy)
      resetSession()
    }

    if (code.length === 0) {
      restore()
      return
    }

    if (
      window.confirm(
        'このお手本の前回の写経が見つかりました。復元しますか?\n(現在のエディタの内容は置き換えられます)',
      )
    ) {
      restore()
    }
  }, [referenceName, code, checkEnabled, referenceText, allowReferenceRestore])

  const onChange = (value: string, viewUpdate: ViewUpdate) => {
    setCode(value)
    onExtensionChange?.(viewUpdate.state.field(extensionRevision))

    const result = getDiffResult(viewUpdate.state)
    const acc = result != null ? accuracyPercent(result, value.length) : null
    setAccuracy(acc)

    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      localStorage.setItem(KEY_DRAFT, value)
      if (allowReferenceRestore && referenceName && value.length > 0) {
        const progressPct =
          normalizedReferenceLength != null
            ? progressPercent(value.length, normalizedReferenceLength)
            : null
        saveProgress(referenceName, {
          draft: value,
          updatedAt: Date.now(),
          progressPct,
          accuracy: acc,
        })
      }
    }, 400)

    if (value.length === 0) {
      resetSession()
    } else if (sessionStartRef.current == null) {
      sessionStartRef.current = Date.now()
      startTicking()
    }
  }

  const clear = () => {
    if (code && !window.confirm('写経した内容をすべて消去します。よろしいですか?')) return
    setCode('')
    localStorage.setItem(KEY_DRAFT, '')
    setAccuracy(null)
    resetSession()
  }

  const progress =
    normalizedReferenceLength != null ? progressPercent(code.length, normalizedReferenceLength) : null
  const wpm =
    sessionStartRef.current != null
      ? wordsPerMinute(code.length, Date.now() - sessionStartRef.current)
      : null

  return (
    <>
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
            <label
              className="check-label"
              title={referenceText == null ? 'お手本のテキストファイルを開くと使えます' : undefined}
            >
              <input
                type="checkbox"
                checked={checkEnabled}
                disabled={referenceText == null}
                onChange={(e) => setCheckEnabled(e.target.checked)}
              />
              正誤判定
            </label>
            <button onClick={() => setSaveLoadOpen(true)}>保存/読込…</button>
            <button onClick={clear}>クリア</button>
          </div>
        </div>
        <div className="pane-body editor-body">
          <CodeMirror
            ref={editorRef}
            value={code}
            onChange={onChange}
            theme={resolvedTheme}
            extensions={extensions}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            placeholder="ここにお手本のコードを書き写していきます…"
            className="shakyo-code"
          />
        </div>
        <div className="status-bar">
          <span>WPM: {wpm ?? '—'}</span>
          <span>正確率: {accuracy != null ? `${accuracy}%` : '—'}</span>
          <span>進捗: {progress != null ? `${progress}%` : '—'}</span>
        </div>
      </section>
      {saveLoadOpen && (
        <SaveLoadDialog
          code={code}
          lang={lang}
          onLoad={(snapshot) => {
            window.clearTimeout(saveTimer.current)
            setCode(snapshot.code)
            localStorage.setItem(KEY_DRAFT, snapshot.code)
            setLang(snapshot.lang)
            const loadedAccuracy =
              checkEnabled && referenceText != null
                ? accuracyPercent(diffAgainstReference(snapshot.code, referenceText), snapshot.code.length)
                : null
            setAccuracy(loadedAccuracy)
            resetSession()
          }}
          onClose={() => setSaveLoadOpen(false)}
        />
      )}
    </>
  )
}
