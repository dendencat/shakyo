import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { LayoutDialog } from './components/LayoutDialog'
import { ReferencePane } from './components/ReferencePane'
import { ShakyoEditor } from './components/ShakyoEditor'
import { ExplainPanel } from './components/ExplainPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref } from './lib/theme'
import type { ThemePref } from './lib/theme'
import { loadLayout, saveLayout } from './lib/layout'
import type { LayoutConfig } from './lib/layout'
import { ExtensionManager } from './extensions/manager'
import type { Json } from './extensions/api'
import type { ReferencePort } from './extensions/referenceAdapter'
import { applyEditorEdits, editorSnapshot } from './extensions/editorAdapter'
import { ExtensionDialog } from './components/ExtensionDialog'
import { ExtensionPrompt, type ExtensionPromptRequest } from './components/ExtensionPrompt'
import './App.css'

const THEME_LABELS: Record<ThemePref, string> = {
  light: 'テーマ: ライト',
  dark: 'テーマ: ダーク',
  system: 'テーマ: システム',
}

export default function App() {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [extensionManager] = useState(() => new ExtensionManager())
  const referencePort = useRef<ReferencePort>(null)
  const editorLanguage = useRef('ts')
  const [extensionsOpen, setExtensionsOpen] = useState(false)
  const [extensionError, setExtensionError] = useState('')
  const [extensionPrompt, setExtensionPrompt] = useState<ExtensionPromptRequest | null>(null)
  const promptRef = useRef<ExtensionPromptRequest | null>(null)
  const promptSequence = useRef(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layout, setLayout] = useState(loadLayout)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [reference, setReference] = useState<{ name: string; text: string; fromExtension?: boolean } | null>(null)
  const [themePref, setThemePref] = useState<ThemePref>(loadThemePref)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    extensionManager.setHost({
      getEditor: () => {
        if (!editorRef.current?.view) throw new Error('エディタが利用できません。')
        return editorSnapshot(editorRef.current.view, editorLanguage.current)
      },
      applyEdits: input => {
        if (!editorRef.current?.view) throw new Error('エディタが利用できません。')
        applyEditorEdits(editorRef.current.view, input)
      },
      getReference: () => referencePort.current?.getCurrent() ?? null,
      openText: input => { if (!referencePort.current) throw new Error('お手本が利用できません。'); referencePort.current.openText(input) },
      openUrl: url => { if (!referencePort.current) throw new Error('お手本が利用できません。'); referencePort.current.openUrl(url) },
      ui: (owner, kind, message, options, signal) => new Promise<Json>((resolve, reject) => {
        if (promptRef.current || signal.aborted) { reject(new Error('別の確認画面が開いているか、拡張が停止しています。')); return }
        const id = ++promptSequence.current
        const finish = (value: Json) => {
          signal.removeEventListener('abort', abort)
          if (promptRef.current?.id !== id) return
          promptRef.current = null; setExtensionPrompt(null); resolve(value)
        }
        const abort = () => finish(null)
        const request = { id, owner, kind, message, options, finish }
        promptRef.current = request
        signal.addEventListener('abort', abort, { once: true })
        setExtensionPrompt(request)
      }),
    })
    void extensionManager.load().catch(() => setExtensionError('拡張の保存領域を開けませんでした。'))
    return () => { extensionManager.dispose(); promptRef.current?.finish(null) }
  }, [extensionManager])
  const onExtensionEditorChange = useCallback((revision: number) => extensionManager.emit('editor', { revision }), [extensionManager])
  const onExtensionReferenceChange = useCallback(() => extensionManager.emit('reference'), [extensionManager])
  const onEditorLanguageChange = useCallback((language: string) => { editorLanguage.current = language }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(themePref, systemPrefersDark)

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const toggleTheme = () => {
    const next = nextThemePref(themePref)
    setThemePref(next)
    saveThemePref(next)
  }

  const getCode = useCallback(() => {
    const view = editorRef.current?.view
    if (!view) return null
    const { from, to } = view.state.selection.main
    if (from !== to) {
      return { code: view.state.sliceDoc(from, to), isSelection: true }
    }
    return { code: view.state.doc.toString(), isSelection: false }
  }, [])

  const changeLayout = useCallback((next: LayoutConfig, persist: boolean) => {
    setLayout(next)
    if (!persist) return
    try {
      saveLayout(next)
      setLayoutError(null)
    } catch {
      setLayoutError('レイアウトを保存できませんでした。現在の配置は使えますが、次回起動時に復元できない場合があります。')
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>shakyo</h1>
        <span className="subtitle">コード写経支援ツール</span>
        <button className="theme-toggle-button" onClick={toggleTheme}>
          {THEME_LABELS[themePref]}
        </button>
        <button onClick={() => setLayoutOpen(true)}>レイアウト</button>
        <button onClick={() => setExtensionsOpen(true)}>拡張機能</button>
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>
          設定
        </button>
      </header>
      {layoutError && <p className="error-text" role="status">{layoutError}</p>}
      {extensionError && <p className="error-text" role="status">{extensionError}<button onClick={() => setExtensionError('')}>閉じる</button></p>}
      <main className="app-main">
        <WorkspaceLayout
          layout={layout}
          onChange={changeLayout}
          panes={{
            reference: <ReferencePane onReferenceChange={setReference} resolvedTheme={resolved} obscured={settingsOpen || layoutOpen || extensionsOpen || !!extensionPrompt} extensionPort={referencePort} onExtensionChange={onExtensionReferenceChange} />,
            editor: (
              <ShakyoEditor
                editorRef={editorRef}
                referenceText={reference?.text ?? null}
                referenceName={reference?.name ?? null}
                resolvedTheme={resolved}
                onExtensionChange={onExtensionEditorChange}
                onLanguageChange={onEditorLanguageChange}
                allowReferenceRestore={!reference?.fromExtension}
              />
            ),
            explain: <ExplainPanel getCode={getCode} onOpenSettings={() => setSettingsOpen(true)} />,
          }}
        />
      </main>
      {layoutOpen && (
        <LayoutDialog layout={layout} onApply={(next) => changeLayout(next, true)} onClose={() => setLayoutOpen(false)} />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {extensionsOpen && <ExtensionDialog manager={extensionManager} onClose={() => setExtensionsOpen(false)} onRun={(id, command) => {
        setExtensionsOpen(false); setExtensionError('')
        void extensionManager.run(id, command).catch(e => setExtensionError(e instanceof Error ? e.message : '拡張の実行に失敗しました。'))
      }} />}
      {extensionPrompt && <ExtensionPrompt key={extensionPrompt.id} request={extensionPrompt} />}
    </div>
  )
}
