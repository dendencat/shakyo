import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { LayoutDialog } from './components/LayoutDialog'
import { ReferencePane } from './components/ReferencePane'
import { ShakyoEditor } from './components/ShakyoEditor'
import { ExplainPanel } from './components/ExplainPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { loadThemePref, resolveTheme, saveThemePref } from './lib/theme'
import type { ThemePref } from './lib/theme'
import { loadLayout, saveLayout } from './lib/layout'
import type { LayoutConfig } from './lib/layout'
import { ExtensionManager } from './extensions/manager'
import type { Json } from './extensions/api'
import type { ReferencePort } from './extensions/referenceAdapter'
import { applyEditorEdits, editorSnapshot } from './extensions/editorAdapter'
import { ExtensionDialog } from './components/ExtensionDialog'
import { ExtensionPrompt, type ExtensionPromptRequest } from './components/ExtensionPrompt'
import { IconButton } from './components/Icon'
import { HelpPanel } from './components/HelpPanel'
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
  const [sidebar, setSidebar] = useState<'files' | 'extensions' | 'settings' | 'layout' | 'theme' | 'help' | null>(null)
  const [fileTarget, setFileTarget] = useState<HTMLDivElement | null>(null)
  const [saveTarget, setSaveTarget] = useState<HTMLDivElement | null>(null)
  const closeSidebar = () => {
    document.querySelector<HTMLButtonElement>('.activity-bar [aria-expanded="true"]')?.focus()
    setSidebar(null)
  }
  const [extensionError, setExtensionError] = useState('')
  const [extensionPrompt, setExtensionPrompt] = useState<ExtensionPromptRequest | null>(null)
  const promptRef = useRef<ExtensionPromptRequest | null>(null)
  const promptSequence = useRef(0)
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

  const chooseTheme = (next: ThemePref) => {
    setThemePref(next)
    saveThemePref(next)
  }
  const toggleSidebar = (next: NonNullable<typeof sidebar>) => setSidebar(current => current === next ? null : next)

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
      <div className="workbench">
      <nav className="activity-bar" aria-label="機能">
        {(['files', 'extensions', 'layout', 'theme', 'settings', 'help'] as const).map(id => {
          const label = { files: 'ファイル', extensions: '拡張機能', layout: 'レイアウト', theme: THEME_LABELS[themePref], settings: '設定', help: 'ヘルプ' }[id]
          return <IconButton key={id} icon={id === 'theme' ? resolved === 'light' ? 'sun' : 'moon' : id} label={label}
            aria-expanded={sidebar === id} aria-controls={`sidebar-${id}`} onClick={() => toggleSidebar(id)} />
        })}
      </nav>
      <aside className="app-sidebar" hidden={!sidebar} aria-label="機能サイドバー" onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); closeSidebar() }
      }}>
        <div className="sidebar-heading"><span>{sidebar ? { files: 'ファイル', extensions: '拡張機能', layout: 'レイアウト', theme: 'テーマ', settings: '設定', help: 'ヘルプ' }[sidebar] : ''}</span><IconButton icon="close" label="サイドバーを閉じる" onClick={closeSidebar} /></div>
        <div id="sidebar-files" hidden={sidebar !== 'files'}><div ref={setFileTarget} /><div ref={setSaveTarget} /></div>
        <div id="sidebar-extensions" hidden={sidebar !== 'extensions'}>{sidebar === 'extensions' && <ExtensionDialog embedded manager={extensionManager} onClose={closeSidebar} onRun={(id, command) => {
          setExtensionError('')
          void extensionManager.run(id, command).catch(e => setExtensionError(e instanceof Error ? e.message : '拡張の実行に失敗しました。'))
        }} />}</div>
        <div id="sidebar-settings" hidden={sidebar !== 'settings'}>{sidebar === 'settings' && <SettingsDialog embedded onClose={closeSidebar} />}</div>
        <div id="sidebar-layout" hidden={sidebar !== 'layout'}>{sidebar === 'layout' && <LayoutDialog embedded layout={layout} onApply={next => changeLayout(next, true)} onClose={closeSidebar} />}</div>
        <div id="sidebar-theme" hidden={sidebar !== 'theme'} className="sidebar-panel">
          {(['light', 'dark', 'system'] as const).map(pref => <IconButton key={pref} icon={pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'system'} label={THEME_LABELS[pref]} aria-pressed={themePref === pref} onClick={() => chooseTheme(pref)} />)}
        </div>
        <div id="sidebar-help" hidden={sidebar !== 'help'}>{sidebar === 'help' && <HelpPanel />}</div>
      </aside>
      <div className="workspace-content">
      {layoutError && <p className="error-text" role="status">{layoutError}</p>}
      {extensionError && <p className="error-text" role="status">{extensionError}<button onClick={() => setExtensionError('')}>閉じる</button></p>}
      <main className="app-main">
        <WorkspaceLayout
          layout={layout}
          onChange={changeLayout}
          panes={{
            reference: <ReferencePane onReferenceChange={setReference} resolvedTheme={resolved} obscured={!!extensionPrompt} sidebarTarget={fileTarget} extensionPort={referencePort} onExtensionChange={onExtensionReferenceChange} />,
            editor: (
              <ShakyoEditor
                sidebarTarget={saveTarget}
                onOpenFiles={() => setSidebar("files")}
                editorRef={editorRef}
                referenceText={reference?.text ?? null}
                referenceName={reference?.name ?? null}
                resolvedTheme={resolved}
                onExtensionChange={onExtensionEditorChange}
                onLanguageChange={onEditorLanguageChange}
                allowReferenceRestore={!reference?.fromExtension}
              />
            ),
            explain: <ExplainPanel getCode={getCode} onOpenSettings={() => setSidebar("settings")} />,
          }}
        />
      </main>
      </div>
      </div>
      {extensionPrompt && <ExtensionPrompt key={extensionPrompt.id} request={extensionPrompt} />}
    </div>
  )
}
