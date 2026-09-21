import { createPortal } from 'react-dom'
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
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
import { saveSnapshot, type Snapshot } from '../lib/snapshots'
import { extensionRevision } from '../extensions/editorAdapter'
import { loadPreferences, savePreferences, usePreferences, type Preferences } from '../lib/preferences'
import { editorShortcutExtensions, useShortcuts } from '../lib/shortcuts'
import { editorPreferenceExtensions } from '../lib/editorPreferences'
import { PaneTitle } from './PaneTitle'

function initialLang(): LangId {
  const saved = localStorage.getItem(KEY_EDITOR_LANG)
  if (saved && LANGUAGE_OPTIONS.some((o) => o.id === saved)) return saved as LangId
  return 'ts'
}

export type ShakyoEditorCommands = {
  clear: () => void
  save: () => void
  saveAs: () => void
}

export function ShakyoEditor({
  editorRef,
  sidebarTarget,
  onOpenFiles,
  referenceText,
  referenceName,
  resolvedTheme,
  onExtensionChange,
  onLanguageChange,
  allowReferenceRestore = true,
  commandsRef,
  onNotify,
}: {
  sidebarTarget?: HTMLElement | null
  onOpenFiles?: () => void
  editorRef: React.RefObject<ReactCodeMirrorRef | null>
  referenceText: string | null
  referenceName: string | null
  resolvedTheme: 'light' | 'dark'
  onExtensionChange?: (revision: number) => void
  onLanguageChange?: (language: string) => void
  allowReferenceRestore?: boolean
  commandsRef?: React.Ref<ShakyoEditorCommands>
  onNotify?: (text: string, kind: 'success' | 'error') => void
}) {
  const { editorMode, indentStyle, indentWidth, autoIndent, fontSize } = usePreferences()
  const shortcuts = useShortcuts()
  const [preferenceError, setPreferenceError] = useState('')
  const [code, setCode] = useState(() => localStorage.getItem(KEY_DRAFT) ?? '')
  const [lang, setLang] = useState<LangId>(initialLang)
  const [checkEnabled, setCheckEnabled] = useState(false)
  const [saveLoadOpen, setSaveLoadOpen] = useState(false)
  const [saveAsSignal, setSaveAsSignal] = useState(0)
  const [currentSnapshot, setCurrentSnapshot] = useState<Pick<Snapshot, 'id' | 'name'> | null>(null)
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

  const extensions = useMemo(() => [
    ...languageExtension(lang), diffHighlight, extensionRevision,
    ...editorPreferenceExtensions({ editorMode, indentStyle, indentWidth, autoIndent, fontSize }),
    editorShortcutExtensions(shortcuts, editorMode),
  ], [lang, editorMode, indentStyle, indentWidth, autoIndent, fontSize, shortcuts])

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

  const saveAs = () => {
    if (onOpenFiles) onOpenFiles()
    else setSaveLoadOpen(true)
    setSaveAsSignal(value => value + 1)
  }

  const overwrite = () => {
    if (!currentSnapshot) {
      saveAs()
      return
    }
    try {
      const snapshot = saveSnapshot(currentSnapshot.name, lang, code, currentSnapshot.id)
      setCurrentSnapshot({ id: snapshot.id, name: snapshot.name })
      onNotify?.(`「${snapshot.name}」を上書き保存しました`, 'success')
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : '上書き保存に失敗しました', 'error')
    }
  }

  useImperativeHandle(commandsRef, () => ({ clear, save: overwrite, saveAs }))

  const progress =
    normalizedReferenceLength != null ? progressPercent(code.length, normalizedReferenceLength) : null
  const wpm =
    sessionStartRef.current != null
      ? wordsPerMinute(code.length, Date.now() - sessionStartRef.current)
      : null

  const saveMenu = <SaveLoadDialog
          embedded={!!sidebarTarget}
          code={code}
          lang={lang}
          focusNameSignal={saveAsSignal}
          onSaved={snapshot => {
            setCurrentSnapshot({ id: snapshot.id, name: snapshot.name })
            onNotify?.(`「${snapshot.name}」を保存しました`, 'success')
          }}
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
            setCurrentSnapshot({ id: snapshot.id, name: snapshot.name })
            resetSession()
          }}
          onClose={() => setSaveLoadOpen(false)}
        />

  return (
    <>
      <section className="pane editor-pane">
        <div className="pane-header">
          <PaneTitle icon="editor" label="写経エディタ" />
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
            <label>インデント幅: <select value={indentWidth} onChange={event => {
              try { savePreferences({ ...loadPreferences(), indentWidth: Number(event.target.value) as Preferences['indentWidth'] }); setPreferenceError('') }
              catch { setPreferenceError('インデント幅を保存できませんでした。') }
            }}>{[2, 4, 8].map(width => <option key={width} value={width}>{width}</option>)}</select></label>
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
            <button onClick={() => onOpenFiles ? onOpenFiles() : setSaveLoadOpen(true)}>保存/読込…</button>
            <button onClick={clear}>クリア</button>
          </div>
        </div>
        <div className="pane-body editor-body" onKeyDownCapture={(event) => {
          // Let the IME consume its own keys before any modal keymap sees them.
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.stopPropagation()
        }}>
          <CodeMirror
            ref={editorRef}
            value={code}
            onChange={onChange}
            theme={resolvedTheme}
            extensions={extensions}
            basicSetup={{ lineNumbers: true, foldGutter: false, indentOnInput: false }}
            placeholder="ここにお手本のコードを書き写していきます…"
            className="shakyo-code"
          />
        </div>
        {preferenceError && <p role="alert">{preferenceError}</p>}
        <div className="status-bar">
          <span>WPM: {wpm ?? '—'}</span>
          <span>正確率: {accuracy != null ? `${accuracy}%` : '—'}</span>
          <span>進捗: {progress != null ? `${progress}%` : '—'}</span>
        </div>
      </section>
      {sidebarTarget ? createPortal(saveMenu, sidebarTarget) : saveLoadOpen && saveMenu}
    </>
  )
}
