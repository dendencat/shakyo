import { useCallback, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { SplitPane } from './components/SplitPane'
import { ReferencePane } from './components/ReferencePane'
import { ShakyoEditor } from './components/ShakyoEditor'
import { ExplainPanel } from './components/ExplainPanel'
import { SettingsDialog } from './components/SettingsDialog'
import './App.css'

export default function App() {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>
          設定
        </button>
      </header>
      <main className="app-main">
        <SplitPane
          left={<ReferencePane />}
          right={
            <div className="right-stack">
              <ShakyoEditor editorRef={editorRef} />
              <ExplainPanel getCode={getCode} onOpenSettings={() => setSettingsOpen(true)} />
            </div>
          }
        />
      </main>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
