// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShakyoEditor } from './ShakyoEditor'
import { KEY_DRAFT } from '../lib/settings'
import { loadProgress, saveProgress } from '../lib/progress'

const editor = vi.hoisted(() => ({ change: (_text: string, _update: unknown) => {} }))
vi.mock('@uiw/react-codemirror', () => ({ default: (props: { value: string; onChange: typeof editor.change }) => {
  editor.change = props.onChange
  return <div data-editor>{props.value}</div>
} }))
vi.mock('../lib/progress', () => ({ loadProgress: vi.fn(() => ({ draft: 'private previous draft' })), saveProgress: vi.fn() }))
vi.mock('../lib/diffHighlight', () => ({ diffHighlight: [], getDiffResult: () => null, setDiffTarget: { of: () => null } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })

it('does not restore or overwrite an existing reference draft through reference-only permission', () => {
  act(() => root.render(<ShakyoEditor editorRef={createRef<ReactCodeMirrorRef>()} referenceText="sample" referenceName="existing.ts" resolvedTheme="light" allowReferenceRestore={false} />))
  expect(loadProgress).not.toHaveBeenCalled()
  expect(container.querySelector('[data-editor]')!.textContent).toBe('')
  act(() => editor.change('user typed', { state: { field: () => 1 } }))
  act(() => vi.advanceTimersByTime(400))
  expect(saveProgress).not.toHaveBeenCalled()
  expect(localStorage.getItem(KEY_DRAFT)).toBe('user typed')
})

it('keeps normal reference draft restoration', () => {
  act(() => root.render(<ShakyoEditor editorRef={createRef<ReactCodeMirrorRef>()} referenceText="sample" referenceName="existing.ts" resolvedTheme="light" />))
  expect(loadProgress).toHaveBeenCalledWith('existing.ts')
  expect(container.querySelector('[data-editor]')!.textContent).toBe('private previous draft')
})
