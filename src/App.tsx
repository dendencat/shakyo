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
import './App.css'

const THEME_LABELS: Record<ThemePref, string> = {
  light: 'テーマ: ライト',
  dark: 'テーマ: ダーク',
  system: 'テーマ: システム',
}

export default function App() {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layout, setLayout] = useState(loadLayout)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [reference, setReference] = useState<{ name: string; text: string } | null>(null)
  const [themePref, setThemePref] = useState<ThemePref>(loadThemePref)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

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
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>
          設定
        </button>
      </header>
      {layoutError && <p className="error-text" role="status">{layoutError}</p>}
      <main className="app-main">
        <WorkspaceLayout
          layout={layout}
          onChange={changeLayout}
          panes={{
            reference: <ReferencePane onReferenceChange={setReference} resolvedTheme={resolved} />,
            editor: (
              <ShakyoEditor
                editorRef={editorRef}
                referenceText={reference?.text ?? null}
                referenceName={reference?.name ?? null}
                resolvedTheme={resolved}
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
    </div>
  )
}
