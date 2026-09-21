import { Icon, IconButton } from './Icon'
import { emptyNavigation, visit, step, normalizeBrowserUrl } from '../lib/browserNavigation'
import { nativeBrowserAction } from '../lib/nativeReference'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { PdfViewer } from './PdfViewer'
import { EpubViewer } from './EpubViewer'
import { PaneTitle } from './PaneTitle'
import { LANGUAGE_OPTIONS, languageExtension, langIdFromFilename } from '../lib/langs'
import type { LangId } from '../lib/langs'
import { CODE_SAMPLES } from '../lib/samples'
import { loadPasteReference, savePasteReference } from '../lib/pasteReference'
import type { PasteReference } from '../lib/pasteReference'
import { readReferenceFile, REFERENCE_FILE_ACCEPT } from '../lib/referenceFile'
import {
  addWebBookmark,
  addWebHistory,
  clearWebHistory,
  deleteWebBookmark,
  loadWebBookmarks,
  loadWebHistory,
  removeWebHistory,
  updateWebBookmark,
} from '../lib/webReference'
import type { WebBookmark } from '../lib/webReference'
import { useFocusTrap } from '../lib/useFocusTrap'
import { isTauri, openExternal } from '../lib/openExternal'
import { NativeWebReference } from './NativeWebReference'
import type { ReferencePort } from '../extensions/referenceAdapter'
import { usePreferences } from '../lib/preferences'
import './WebReference.css'
import './ReferenceReader.css'

type ReferenceContent =
  | { kind: 'text'; name: string; text: string; lang: LangId | null; fromExtension?: boolean }
  | { kind: 'pdf'; name: string; data: ArrayBuffer }
  | { kind: 'epub'; name: string; data: ArrayBuffer }

export type ReferencePaneCommands = {
  openFilePicker: () => void
}

type Tab = 'file' | 'paste' | 'web'

type BookmarkModalState = {
  mode: 'add' | 'edit'
  id?: string
  name: string
  url: string
}

function BookmarkModal({
  bookmark,
  error,
  onChange,
  onClose,
  onSave,
}: {
  bookmark: BookmarkModalState
  error: string | null
  onChange: (bookmark: BookmarkModalState) => void
  onClose: () => void
  onSave: () => void
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={bookmark.mode === 'add' ? 'ブックマークに追加' : 'ブックマークを編集'}
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{bookmark.mode === 'add' ? 'ブックマークに追加' : 'ブックマークを編集'}</h2>
        <label className="field">
          名前
          <input autoFocus value={bookmark.name} onChange={(e) => onChange({ ...bookmark, name: e.target.value })} />
        </label>
        <label className="field">
          URL
          <input type="url" value={bookmark.url} onChange={(e) => onChange({ ...bookmark, url: e.target.value })} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" disabled={!bookmark.url.trim()} onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  )
}

export function ReferencePane({
  onReferenceChange,
  resolvedTheme,
  obscured = false,
  sidebarTarget,
  extensionPort,
  onExtensionChange,
  onClose,
  commandsRef,
  onEnsureVisible,
}: {
  onReferenceChange?: (ref: { name: string; text: string; fromExtension?: boolean } | null) => void
  resolvedTheme: 'light' | 'dark'
  sidebarTarget?: HTMLElement | null
  obscured?: boolean
  extensionPort?: React.RefObject<ReferencePort | null>
  onExtensionChange?: () => void
  onClose?: () => void
  commandsRef?: Ref<ReferencePaneCommands>
  onEnsureVisible?: () => void
}) {
  const preferences = usePreferences()
  const [tab, setTab] = useState<Tab>('file')
  const [content, setContent] = useState<ReferenceContent | null>(null)
  const [webUrl, setWebUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [navigation, setNavigation] = useState(emptyNavigation)
  const [reloadKey, setReloadKey] = useState(0)
  const [navigationBusy, setNavigationBusy] = useState(false)
  const native = isTauri()
  const recordLocation = (url: string) => {
    if (currentUrl === url) return
    setCurrentUrl(url)
    setWebUrl(url)
    setWebHistory(addWebHistory(url))
  }
  const navigate = async (action: 'back' | 'forward' | 'reload') => {
    setWebError(null)
    setNavigationBusy(true)
    try {
      if (native) await nativeBrowserAction(action)
      else if (action === 'reload') setReloadKey(key => key + 1)
      else {
        const next = step(navigation, action === 'back' ? -1 : 1)
        setNavigation(next)
        const url = next.entries[next.index]
        if (url) { setLoadedUrl(url); setCurrentUrl(url); setWebUrl(url) }
      }
    } catch { setWebError('ページを操作できませんでした。再試行してください。') }
    finally { setNavigationBusy(false) }
  }
  const [webHistory, setWebHistory] = useState(() => loadWebHistory())
  const [webBookmarks, setWebBookmarks] = useState(() => loadWebBookmarks())
  const [webPanel, setWebPanel] = useState<'bookmarks' | 'history' | 'suggestions' | null>(null)
  const [historyQuery, setHistoryQuery] = useState('')
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const suggestionsOpen = webPanel === 'suggestions' && preferences.showHistorySuggestions
  const suggestions = webHistory.filter(entry => entry.url.toLowerCase().includes(historyQuery.toLowerCase()))
  const bookmarksOpen = webPanel === 'bookmarks'
  const historyOpen = webPanel === 'history'
  const showSuggestions = () => {
    if (!preferences.showHistorySuggestions) return
    setHistoryQuery('')
    setActiveSuggestion(-1)
    setWebPanel('suggestions')
  }
  const [webError, setWebError] = useState<string | null>(null)
  const [bookmarkModal, setBookmarkModal] = useState<BookmarkModalState | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sampleSelectValue, setSampleSelectValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [readingControlsVisible, setReadingControlsVisible] = useState(true)
  const readingControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialPasteRef = useRef<PasteReference | null | undefined>(undefined)
  if (initialPasteRef.current === undefined) {
    initialPasteRef.current = loadPasteReference()
  }
  const [pasteRef, setPasteRef] = useState<PasteReference | null>(() => initialPasteRef.current ?? null)
  const [pasteDraft, setPasteDraft] = useState(() => initialPasteRef.current?.text ?? '')
  const [pasteLang, setPasteLang] = useState<LangId>(() => initialPasteRef.current?.lang ?? 'ts')
  const [pasteEditing, setPasteEditing] = useState(() => initialPasteRef.current == null)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const readingActive = preferences.readingMode && tab === 'file' && (content?.kind === 'pdf' || content?.kind === 'epub')

  const openFilePicker = useCallback(() => {
    onEnsureVisible?.()
    fileInputRef.current?.click()
  }, [onEnsureVisible])
  useImperativeHandle(commandsRef, () => ({ openFilePicker }), [openFilePicker])

  const showReadingControls = useCallback(() => {
    if (!readingActive) return
    setReadingControlsVisible(true)
    if (readingControlsTimerRef.current) clearTimeout(readingControlsTimerRef.current)
    readingControlsTimerRef.current = setTimeout(() => setReadingControlsVisible(false), 2_000)
  }, [readingActive])

  useEffect(() => {
    if (readingActive) showReadingControls()
    else setReadingControlsVisible(true)
    return () => {
      if (readingControlsTimerRef.current) clearTimeout(readingControlsTimerRef.current)
      readingControlsTimerRef.current = null
    }
  }, [readingActive, showReadingControls])

  useEffect(() => {
    onReferenceChange?.(
      tab === 'file' && content?.kind === 'text'
        ? { name: content.name, text: content.text, ...(content.fromExtension ? { fromExtension: true } : {}) }
        : tab === 'paste' && !pasteEditing && pasteRef != null
          ? { name: '貼り付けテキスト', text: pasteRef.text }
        : null,
    )
  }, [tab, content, pasteEditing, pasteRef, onReferenceChange])

  const openFile = async (file: File) => {
    setFileError(null)
    try {
      const loaded = await readReferenceFile(file)
      if (loaded.kind === 'text') {
        setContent({
          kind: 'text',
          name: file.name,
          text: loaded.text,
          lang: langIdFromFilename(file.name),
        })
      } else setContent({ ...loaded, name: file.name })
    } catch (e) {
      setFileError(`ファイルの読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const loadWeb = (inputUrl = webUrl) => {
    if (!inputUrl.trim()) return
    try {
      const url = normalizeBrowserUrl(inputUrl)
      setWebError(null)
      setWebPanel(null)
      if (url === loadedUrl && url === currentUrl) { void navigate('reload'); return }
      if (native && url === loadedUrl && url !== currentUrl) {
        void nativeBrowserAction('navigate', url).catch(() => setWebError('ページを開けませんでした。'))
      }
      setLoadedUrl(url)
      setCurrentUrl(url)
      setWebUrl(url)
      setNavigation(history => visit(history, url))
      setWebHistory(addWebHistory(url))
    } catch { setWebError('HTTP(S)の正しいURLを入力してください。') }
  }

  useLayoutEffect(() => {
    if (!extensionPort) return
    extensionPort.current = {
      getCurrent: () => {
        if (tab === 'web') return currentUrl ? { kind: 'web', url: currentUrl } : null
        if (tab === 'paste') return pasteRef && !pasteEditing ? { kind: 'text', name: '貼り付けテキスト', text: pasteRef.text, language: pasteRef.lang } : null
        if (content?.kind === 'pdf') return { kind: 'pdf', name: content.name }
        if (content?.kind === 'epub') return null
        return content ? { kind: 'text', name: content.name, text: content.text, language: content.lang } : null
      },
      openText: input => {
        const lang = LANGUAGE_OPTIONS.some(o => o.id === input.language) ? input.language as LangId : null
        setContent({ kind: 'text', name: input.name, text: input.text, lang, fromExtension: true })
        setFileError(null)
        setTab('file')
      },
      openUrl: url => { loadWeb(url); setTab('web') },
    }
    return () => { extensionPort.current = null }
  })
  useEffect(() => { onExtensionChange?.() }, [tab, content, currentUrl, pasteRef, pasteEditing, onExtensionChange])

  const closeBookmarkModal = () => {
    setBookmarkModal(null)
    setWebError(null)
  }

  const openBookmarkModal = (bookmark: BookmarkModalState) => {
    setWebError(null)
    setBookmarkModal(bookmark)
  }

  const saveBookmark = () => {
    if (!bookmarkModal || !bookmarkModal.url.trim()) return
    try {
      const input = { name: bookmarkModal.name, url: bookmarkModal.url.trim() }
      setWebBookmarks(
        bookmarkModal.mode === 'add'
          ? addWebBookmark(input)
          : updateWebBookmark(bookmarkModal.id ?? '', input),
      )
      closeBookmarkModal()
    } catch (e) {
      setWebError(e instanceof Error ? e.message : String(e))
    }
  }

  const removeBookmark = (bookmark: WebBookmark) => {
    if (!window.confirm(`ブックマーク「${bookmark.name}」を削除しますか?`)) return
    try {
      setWebBookmarks(deleteWebBookmark(bookmark.id))
      setWebError(null)
    } catch (e) {
      setWebError(e instanceof Error ? e.message : String(e))
    }
  }

  const clearHistory = () => {
    if (!window.confirm('検索履歴をすべて削除しますか?')) return
    clearWebHistory()
    setWebHistory([])
  }

  const selectSample = (id: string) => {
    const sample = CODE_SAMPLES.find((s) => s.id === id)
    if (!sample) return
    setFileError(null)
    setContent({ kind: 'text', name: sample.title, text: sample.code, lang: sample.lang })
    setSampleSelectValue('')
    setTab('file')
  }

  const savePaste = (nextRef: PasteReference) => {
    setPasteError(null)
    try {
      savePasteReference(nextRef)
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : String(e))
    }
  }

  const setPasteReference = () => {
    const nextRef = { text: pasteDraft, lang: pasteLang }
    setPasteRef(nextRef)
    setPasteEditing(false)
    savePaste(nextRef)
  }

  const changePasteLang = (lang: LangId) => {
    setPasteLang(lang)
    if (pasteEditing) return
    if (pasteRef == null) return
    const nextRef = { ...pasteRef, lang }
    setPasteRef(nextRef)
    savePaste(nextRef)
  }

  const fileControls = (
    <div className="file-controls">
          <div className="toolbar">
            <button className="primary" onClick={openFilePicker}>
              {sidebarTarget ? 'ファイルを開く…' : '参照…'}
            </button>
            <select value={sampleSelectValue} onChange={(e) => selectSample(e.target.value)}>
              <option value="">サンプルから選ぶ…</option>
              {CODE_SAMPLES.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.title}
                </option>
              ))}
            </select>
            {content && <span className="file-name" title={content.name}>{content.name}</span>}
          </div>
    </div>
  )

  return (
    <section
      className={`pane reference-pane${readingActive ? ' reference-reading-mode' : ''}${readingControlsVisible ? ' reader-controls-visible' : ''}`}
      style={{ '--reference-font-size': `${preferences.fontSize}px` } as React.CSSProperties}
      onPointerMove={showReadingControls}
      onClick={showReadingControls}
      onFocusCapture={showReadingControls}
    >
      <input ref={fileInputRef} type="file" hidden aria-label="お手本ファイル" accept={REFERENCE_FILE_ACCEPT}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) { setTab('file'); void openFile(file) }
          e.target.value = ''
        }} />
      {sidebarTarget && createPortal(fileControls, sidebarTarget)}
      <div className="pane-header">
        <PaneTitle icon="reference" label="お手本" />
        <div className="tab-bar" role="tablist">
          <button role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>
            ファイル
          </button>
          <button role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'active' : ''} onClick={() => setTab('paste')}>
            貼り付け
          </button>
          <button role="tab" aria-selected={tab === 'web'} className={tab === 'web' ? 'active' : ''} onClick={() => setTab('web')}>
            Webページ
          </button>
        </div>
        {onClose && <IconButton icon="close" label="お手本を閉じる" onClick={onClose} />}
      </div>

      {tab === 'file' && (
        <div className="pane-body reference-file-drop"
          onDragOver={e => {
            if (!Array.from(e.dataTransfer.types).includes('Files')) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={e => {
            const file = e.dataTransfer.files?.[0]
            if (!file) return
            e.preventDefault()
            void openFile(file)
          }}>
          {!sidebarTarget && fileControls}
          {sidebarTarget && <div className="toolbar">
            <button className="primary" onClick={openFilePicker}>参照…</button>
            {content && <span className="file-name" title={content.name}>{content.name}</span>}
          </div>}
          {fileError && <p className="error-text" role="alert">{fileError}</p>}
          <div className="reference-content">
            {!content && !fileError && (
              <p className="placeholder">
                コードファイル・テキスト・PDF・EPUBをここにドラッグ＆ドロップするか、「参照…」で開いてください。
              </p>
            )}
            {content?.kind === 'text' && (
              <CodeMirror
                value={content.text}
                readOnly
                editable={false}
                theme={resolvedTheme}
                extensions={content.lang ? languageExtension(content.lang) : []}
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
                className="reference-code"
              />
            )}
            {content?.kind === 'pdf' && <PdfViewer data={content.data} readingMode={preferences.readingMode} />}
            {content?.kind === 'epub' && <EpubViewer data={content.data} readingMode={preferences.readingMode} />}
          </div>
        </div>
      )}

      {tab === 'paste' && (
        <div className="pane-body">
          <div className="toolbar">
            <label>
              言語:{' '}
              <select value={pasteLang} onChange={(e) => changePasteLang(e.target.value as LangId)}>
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {pasteEditing ? (
              <button className="primary" disabled={pasteDraft.trim() === ''} onClick={setPasteReference}>
                お手本にセット
              </button>
            ) : (
              <button
                onClick={() => {
                  setPasteDraft(pasteRef?.text ?? '')
                  setPasteEditing(true)
                  setPasteError(null)
                }}
              >
                編集
              </button>
            )}
          </div>
          {pasteError && <p className="error-text">{pasteError}</p>}
          <div className="reference-content">
            {pasteEditing ? (
              <textarea
                className="paste-input"
                aria-label="お手本のコード貼り付け"
                placeholder="お手本のコードをここに貼り付け…"
                value={pasteDraft}
                onChange={(e) => setPasteDraft(e.target.value)}
              />
            ) : (
              pasteRef != null && (
                <CodeMirror
                  value={pasteRef.text}
                  readOnly
                  editable={false}
                  theme={resolvedTheme}
                  extensions={languageExtension(pasteLang)}
                  basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
                  className="reference-code"
                />
              )
            )}
          </div>
        </div>
      )}

      {tab === 'web' && (
        <div className="pane-body">
          <div className="toolbar browser-toolbar">
            <IconButton icon="back" label="戻る" disabled={!loadedUrl || navigationBusy || (!native && navigation.index <= 0)} onClick={() => void navigate('back')} />
            <IconButton icon="forward" label="進む" disabled={!loadedUrl || navigationBusy || (!native && navigation.index >= navigation.entries.length - 1)} onClick={() => void navigate('forward')} />
            <IconButton icon="reload" label="ページを更新" disabled={!loadedUrl || navigationBusy} onClick={() => void navigate('reload')} />
            <div className="web-url-field">
            <input
              aria-label={native ? "現在のURL" : "URL（アプリから開いたページ）"}
              type="url"
              className="url-input"
              placeholder="https://example.com/article"
              value={webUrl}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
              aria-controls={suggestionsOpen ? 'web-history-suggestions' : undefined}
              aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `web-history-option-${activeSuggestion}` : undefined}
              autoComplete="off"
              onFocus={showSuggestions}
              onClick={() => { if (!suggestionsOpen) showSuggestions() }}
              onBlur={() => { if (webPanel === 'suggestions') setWebPanel(null) }}
              onChange={(e) => {
                setWebUrl(e.target.value)
                setHistoryQuery(e.target.value)
                setActiveSuggestion(-1)
                setWebPanel(preferences.showHistorySuggestions ? 'suggestions' : null)
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Escape' && suggestionsOpen) {
                  e.preventDefault()
                  e.stopPropagation()
                  setWebPanel(null)
                } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && preferences.showHistorySuggestions) {
                  e.preventDefault()
                  setWebPanel('suggestions')
                  setActiveSuggestion(index => suggestions.length === 0 ? -1 :
                    e.key === 'ArrowDown' ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  loadWeb(suggestionsOpen && activeSuggestion >= 0 ? suggestions[activeSuggestion]?.url ?? webUrl : webUrl)
                }
              }}
            />
          {suggestionsOpen && (
            <div id="web-history-suggestions" className="web-list web-suggestions" role="listbox" aria-label="URLの履歴候補">
              {suggestions.length === 0 && <p className="placeholder">該当する履歴はありません。</p>}
              {suggestions.map((entry, index) => (
                <button key={entry.url} id={`web-history-option-${index}`} role="option" aria-selected={index === activeSuggestion}
                  className="web-item-link" tabIndex={-1} title={entry.url}
                  ref={element => { if (index === activeSuggestion) element?.scrollIntoView?.({ block: 'nearest' }) }}
                  onMouseDown={e => e.preventDefault()} onClick={() => loadWeb(entry.url)}><Icon name="history" /><span>{entry.url}</span></button>
              ))}
            </div>
          )}
            </div>
            <IconButton icon="go" label="URLを開く" onClick={() => loadWeb()} />
            <IconButton icon="folder" label="ブックマーク" aria-expanded={bookmarksOpen} aria-controls="web-bookmarks" onClick={() => setWebPanel(bookmarksOpen ? null : 'bookmarks')} />
            <IconButton icon="history" label="履歴" aria-expanded={historyOpen} aria-controls="web-history" onClick={() => setWebPanel(historyOpen ? null : 'history')} />
            <IconButton icon="bookmark" label="ブックマークに追加"
              disabled={!loadedUrl}
              onClick={() => openBookmarkModal({ mode: 'add', name: currentUrl, url: currentUrl })}
            />
          </div>
          {bookmarksOpen && (
          <section id="web-bookmarks" className="web-section" aria-label="ブックマーク一覧">
              <div className="web-list">
                {webBookmarks.length === 0 && <p className="placeholder">ブックマークはありません。</p>}
                {webBookmarks.map((bookmark) => (
                  <div className="web-row" key={bookmark.id}>
                    <button className="web-item-link" title={bookmark.url} onClick={() => loadWeb(bookmark.url)}>{bookmark.name}</button>
                    <div className="web-row-actions">
                      <button onClick={() => openBookmarkModal({ mode: 'edit', ...bookmark })}>編集</button>
                      <button onClick={() => removeBookmark(bookmark)}>削除</button>
                    </div>
                  </div>
                ))}
              </div>
          </section>
          )}
          {historyOpen && (
          <section id="web-history" className="web-section" aria-label="履歴一覧">
            <div className="web-section-header">
              <span>履歴</span>
              {webHistory.length > 0 && <button onClick={clearHistory}>全削除</button>}
            </div>
              <div className="web-list">
                {webHistory.length === 0 && <p className="placeholder">履歴はありません。</p>}
                {webHistory.map((entry) => (
                  <div className="web-row" key={entry.url}>
                    <button className="web-item-link web-history-link" title={entry.url} onClick={() => loadWeb(entry.url)}><Icon name="history" /><span>{entry.url}</span></button>
                    <button aria-label="この履歴を削除" onClick={() => setWebHistory(removeWebHistory(entry.url))}>×</button>
                  </div>
                ))}
              </div>
          </section>
          )}
          {!bookmarkModal && webError && <p className="error-text">{webError}</p>}
          {loadedUrl && isTauri() ? (
            <>
              <p className="hint">
                表示できないページや別画面で開くリンクは、
                <button className="link" onClick={() => { void openExternal(currentUrl).catch(() => setWebError('外部ブラウザを開けませんでした。')) }}>外部ブラウザで開く</button>
                をご利用ください。
              </p>
              <NativeWebReference url={loadedUrl} obscured={obscured || !!bookmarkModal || bookmarksOpen || historyOpen || suggestionsOpen} onLocation={recordLocation} />
            </>
          ) : loadedUrl ? (
            <>
              {/*
                X-Frame-Options/CSPによる埋め込みブロックはJSから確実に検知できないため、
                読み込み成否によらずヒントを常時表示する。
              */}
              <p className="hint">
                Web版のURL・戻る・進むはアプリから開いたページが対象です。表示されないサイトは
                <button className="link" onClick={() => { void openExternal(currentUrl) }}>
                  別ウィンドウで開く
                </button>
                で開き、画面を左右に並べてご利用ください。
              </p>
              {/* sandbox="allow-scripts allow-same-origin" は同時指定するとsandboxが実質無効化されるため付与しない */}
              <iframe key={reloadKey} className="web-frame" src={loadedUrl} title="お手本ページ" />
            </>
          ) : (
            <p className="placeholder">お手本にするWebページのURLを入力してください。</p>
          )}
        </div>
      )}
      {bookmarkModal && (
        <BookmarkModal
          bookmark={bookmarkModal}
          error={webError}
          onChange={setBookmarkModal}
          onClose={closeBookmarkModal}
          onSave={saveBookmark}
        />
      )}
    </section>
  )
}
