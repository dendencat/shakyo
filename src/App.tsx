import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { SplitPane } from './components/SplitPane'
import { ReferencePane } from './components/ReferencePane'
import { ShakyoEditor } from './components/ShakyoEditor'
import { ExplainPanel } from './components/ExplainPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref } from './lib/theme'
import type { ThemePref } from './lib/theme'
import './App.css'

const THEME_LABELS: Record<ThemePref, string> = {
  light: 'テーマ: ライト',
  dark: 'テーマ: ダーク',
  system: 'テーマ: システム',
}

export default function App() {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>shakyo</h1>
        <span className="subtitle">コード写経支援ツール</span>
        <button className="theme-toggle-button" onClick={toggleTheme}>
          {THEME_LABELS[themePref]}
        </button>
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>
          設定
        </button>
      </header>
      <main className="app-main">
        <SplitPane
          storageKey="shakyo.split.main"
          left={<ReferencePane onReferenceChange={setReference} resolvedTheme={resolved} />}
          right={
            <SplitPane
              direction="vertical"
              storageKey="shakyo.split.right"
              left={
                <ShakyoEditor
                  editorRef={editorRef}
                  referenceText={reference?.text ?? null}
                  referenceName={reference?.name ?? null}
                  resolvedTheme={resolved}
                />
              }
              right={<ExplainPanel getCode={getCode} onOpenSettings={() => setSettingsOpen(true)} />}
            />
          }
        />
      </main>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
