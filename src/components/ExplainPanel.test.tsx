import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { saveSettings } from '../lib/settings'
import { ExplainPanel, type ExplainPanelCommands } from './ExplainPanel'

vi.mock('../lib/openai', () => ({
  buildExplanationMessages: vi.fn(() => []),
  streamChat: vi.fn(),
  streamExplanation: vi.fn(),
}))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('shows the current effective model and effort beside an accessible AI pane icon', async () => {
  saveSettings({
    apiKey: '',
    model: 'gpt-6-astra',
    reasoningEffort: 'none',
    allowHighPerformanceModels: true,
  })
  await act(async () => root.render(
    <ExplainPanel getCode={() => null} onOpenSettings={() => {}} />,
  ))

  const heading = container.querySelector('h2')
  expect(heading?.textContent).toBe('コードの意味解説')
  expect(heading?.title).toBe('コードの意味解説')
  expect(container.textContent).toContain('モデル: gpt-6-astra')
  expect(container.textContent).toContain('エフォート: low')
})

it('updates model badges after a same-window settings save', async () => {
  await act(async () => root.render(
    <ExplainPanel getCode={() => null} onOpenSettings={() => {}} />,
  ))
  expect(container.textContent).toContain('モデル: gpt-5.6-luna')

  await act(async () => saveSettings({
    apiKey: '',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'xhigh',
    allowHighPerformanceModels: false,
  }))
  expect(container.textContent).toContain('モデル: gpt-5.6-terra')
  expect(container.textContent).toContain('エフォート: xhigh')
})

it('focuses the explain button through its command interface', async () => {
  const commandsRef = createRef<ExplainPanelCommands>()
  await act(async () => root.render(
    <ExplainPanel commandsRef={commandsRef} getCode={() => null} onOpenSettings={() => {}} />,
  ))
  act(() => commandsRef.current?.focusExplain())
  expect(document.activeElement?.textContent).toBe('解説する')
})
