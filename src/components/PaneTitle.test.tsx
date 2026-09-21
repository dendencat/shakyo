import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PaneTitle } from './PaneTitle'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it.each([
  ['editor', '写経エディタ'],
  ['reference', 'お手本'],
  ['aiExplain', 'コードの意味解説'],
] as const)('renders the %s icon with its former title as tooltip and accessible name', async (icon, label) => {
  await act(async () => root.render(<PaneTitle icon={icon} label={label} />))
  const heading = container.querySelector('h2')
  const svg = heading?.querySelector('svg')
  expect(heading?.title).toBe(label)
  expect(heading?.textContent).toBe(label)
  expect(svg?.getAttribute('stroke')).toBe('currentColor')
  expect(svg?.getAttribute('aria-hidden')).toBe('true')
})
