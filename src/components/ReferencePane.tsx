import { useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { PdfViewer } from './PdfViewer'
import { languageExtension, langIdFromFilename } from '../lib/langs'
import type { LangId } from '../lib/langs'

type ReferenceContent =
  | { kind: 'text'; name: string; text: string; lang: LangId | null }
  | { kind: 'pdf'; name: string; data: ArrayBuffer }

type Tab = 'file' | 'web'

export function ReferencePane() {
  const [tab, setTab] = useState<Tab>('file')
  const [content, setContent] = useState<ReferenceContent | null>(null)
  const [webUrl, setWebUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openFile = async (file: File) => {
    setFileError(null)
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setContent({ kind: 'pdf', name: file.name, data: await file.arrayBuffer() })
      } else {
        setContent({
          kind: 'text',
          name: file.name,
          text: await file.text(),
          lang: langIdFromFilename(file.name),
        })
      }
    } catch (e) {
      setFileError(`ファイルの読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const loadWeb = () => {
    const url = webUrl.trim()
    if (!url) return
    setLoadedUrl(/^https?:\/\//.test(url) ? url : `https://${url}`)
  }

  return (
    <section className="pane reference-pane">
      <div className="pane-header">
        <h2>お手本</h2>
        <div className="tab-bar" role="tablist">
          <button role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>
            ファイル
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
                extensions={content.lang ? languageExtension(content.lang) : []}
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
                className="reference-code"
              />
            )}
            {content?.kind === 'pdf' && <PdfViewer data={content.data} />}
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
            <button className="primary" onClick={loadWeb}>
              表示
            </button>
          </div>
          {loadedUrl ? (
            <>
              {/*
                X-Frame-Options/CSPによる埋め込みブロックはJSから確実に検知できないため、
                読み込み成否によらずヒントを常時表示する。
              */}
              <p className="hint">
                ページが表示されない場合、そのサイトは埋め込み(iframe)を拒否しています。
                <button className="link" onClick={() => window.open(loadedUrl, '_blank', 'noopener')}>
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
    </section>
  )
}
