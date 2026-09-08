import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { PdfViewer } from './PdfViewer'
import { LANGUAGE_OPTIONS, languageExtension, langIdFromFilename } from '../lib/langs'
import type { LangId } from '../lib/langs'
import { CODE_SAMPLES } from '../lib/samples'
import { loadPasteReference, savePasteReference } from '../lib/pasteReference'
import type { PasteReference } from '../lib/pasteReference'
import { readTextReferenceFile } from '../lib/referenceFile'
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

type ReferenceContent =
  | { kind: 'text'; name: string; text: string; lang: LangId | null }
  | { kind: 'pdf'; name: string; data: ArrayBuffer }

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
}: {
  onReferenceChange?: (ref: { name: string; text: string } | null) => void
  resolvedTheme: 'light' | 'dark'
  obscured?: boolean
}) {
  const [tab, setTab] = useState<Tab>('file')
  const [content, setContent] = useState<ReferenceContent | null>(null)
  const [webUrl, setWebUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [webHistory, setWebHistory] = useState(() => loadWebHistory())
  const [webBookmarks, setWebBookmarks] = useState(() => loadWebBookmarks())
  const [bookmarksOpen, setBookmarksOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [webError, setWebError] = useState<string | null>(null)
  const [bookmarkModal, setBookmarkModal] = useState<BookmarkModalState | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sampleSelectValue, setSampleSelectValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialPasteRef = useRef<PasteReference | null | undefined>(undefined)
  if (initialPasteRef.current === undefined) {
    initialPasteRef.current = loadPasteReference()
  }
  const [pasteRef, setPasteRef] = useState<PasteReference | null>(() => initialPasteRef.current ?? null)
  const [pasteDraft, setPasteDraft] = useState(() => initialPasteRef.current?.text ?? '')
  const [pasteLang, setPasteLang] = useState<LangId>(() => initialPasteRef.current?.lang ?? 'ts')
  const [pasteEditing, setPasteEditing] = useState(() => initialPasteRef.current == null)
  const [pasteError, setPasteError] = useState<string | null>(null)

  useEffect(() => {
    onReferenceChange?.(
      tab === 'file' && content?.kind === 'text'
        ? { name: content.name, text: content.text }
        : tab === 'paste' && !pasteEditing && pasteRef != null
          ? { name: '貼り付けテキスト', text: pasteRef.text }
        : null,
    )
  }, [tab, content, pasteEditing, pasteRef, onReferenceChange])

  const openFile = async (file: File) => {
    setFileError(null)
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setContent({ kind: 'pdf', name: file.name, data: await file.arrayBuffer() })
      } else {
        setContent({
          kind: 'text',
          name: file.name,
          text: await readTextReferenceFile(file),
          lang: langIdFromFilename(file.name),
        })
      }
    } catch (e) {
      setFileError(`ファイルの読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const loadWeb = (inputUrl = webUrl) => {
    const trimmedUrl = inputUrl.trim()
    if (!trimmedUrl) return
    const url = /^https?:\/\//.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`
    setLoadedUrl(url)
    setWebUrl(url)
    setWebHistory(addWebHistory(url))
    setBookmarksOpen(false)
    setHistoryOpen(false)
  }

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

  return (
    <section className="pane reference-pane">
      <div className="pane-header">
        <h2>お手本</h2>
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
      </div>

      {tab === 'file' && (
        <div className="pane-body">
          <div className="toolbar">
            <button className="primary" onClick={() => fileInputRef.current?.click()}>
              ファイルを開く…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void openFile(f)
                e.target.value = ''
              }}
            />
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
          {fileError && <p className="error-text">{fileError}</p>}
          <div className="reference-content">
            {!content && !fileError && (
              <p className="placeholder">
                お手本にするコードファイル・テキスト・PDFを開いてください。
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
            {content?.kind === 'pdf' && <PdfViewer data={content.data} />}
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
          <div className="toolbar">
            <input
              type="url"
              className="url-input"
              placeholder="https://example.com/article"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadWeb()
              }}
            />
            <button className="primary" onClick={() => loadWeb()}>
              表示
            </button>
            <button
              disabled={!loadedUrl}
              aria-label="ブックマークに追加"
              onClick={() => openBookmarkModal({ mode: 'add', name: loadedUrl, url: loadedUrl })}
            >
              ☆
            </button>
          </div>
          <section className="web-section">
            <button className="web-section-toggle" aria-expanded={bookmarksOpen} onClick={() => setBookmarksOpen((open) => !open)}>
              ブックマーク {bookmarksOpen ? '▼' : '▶'}
            </button>
            {bookmarksOpen && (
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
            )}
          </section>
          <section className="web-section">
            <div className="web-section-header">
              <button className="web-section-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
                履歴 {historyOpen ? '▼' : '▶'}
              </button>
              {webHistory.length > 0 && <button onClick={clearHistory}>全削除</button>}
            </div>
            {historyOpen && (
              <div className="web-list">
                {webHistory.length === 0 && <p className="placeholder">履歴はありません。</p>}
                {webHistory.map((entry) => (
                  <div className="web-row" key={entry.url}>
                    <button className="web-item-link" title={entry.url} onClick={() => loadWeb(entry.url)}>{entry.url}</button>
                    <button aria-label="この履歴を削除" onClick={() => setWebHistory(removeWebHistory(entry.url))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </section>
          {!bookmarkModal && webError && <p className="error-text">{webError}</p>}
          {loadedUrl && isTauri() ? (
            <>
              <p className="hint">
                表示できないページや別画面で開くリンクは、
                <button className="link" onClick={() => { void openExternal(loadedUrl).catch(() => setWebError('外部ブラウザを開けませんでした。')) }}>外部ブラウザで開く</button>
                をご利用ください。
              </p>
              <NativeWebReference url={loadedUrl} obscured={obscured || !!bookmarkModal} />
            </>
          ) : loadedUrl ? (
            <>
              {/*
                X-Frame-Options/CSPによる埋め込みブロックはJSから確実に検知できないため、
                読み込み成否によらずヒントを常時表示する。
              */}
              <p className="hint">
                ページが表示されない場合、そのサイトは埋め込み(iframe)を拒否しています。
                <button className="link" onClick={() => { void openExternal(loadedUrl) }}>
                  別ウィンドウで開く
                </button>
                で開き、画面を左右に並べてご利用ください。
              </p>
              {/* sandbox="allow-scripts allow-same-origin" は同時指定するとsandboxが実質無効化されるため付与しない */}
              <iframe className="web-frame" src={loadedUrl} title="お手本ページ" />
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
