import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { undo } from '@codemirror/commands'
import { ShakyoEditor } from './ShakyoEditor'
import { defaultPreferences, savePreferences } from '../lib/preferences'
import { KEY_DRAFT } from '../lib/settings'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no text layout; these tests inspect editor state and events only.
Object.assign(Range.prototype, {
  getClientRects: () => [],
  getBoundingClientRect: () => new DOMRect(),
})

describe('ShakyoEditor preferences', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(KEY_DRAFT, 'abc')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('reconfigures a mounted editor without losing selection or undo', async () => {
    const editorRef = createRef<ReactCodeMirrorRef>()
    await act(async () => root.render(<ShakyoEditor editorRef={editorRef} referenceText={null} referenceName={null} resolvedTheme="light" />))
    const view = editorRef.current!.view!
    await act(async () => view.dispatch({ changes: { from: 3, insert: 'd' }, selection: { anchor: 1, head: 2 } }))
    for (const editorMode of ['vim', 'emacs', 'vscode', 'normal'] as const) {
      await act(async () => savePreferences({ ...defaultPreferences(), editorMode, fontSize: 24, indentWidth: 4 }))
      expect(editorRef.current!.view).toBe(view)
      expect(view.state.doc.toString()).toBe('abcd')
      expect(view.state.selection.main.from).toBe(1)
      expect(view.state.selection.main.to).toBe(2)
    }
    await act(async () => { undo(view) })
    expect(view.state.doc.toString()).toBe('abc')
  })

  it.each(['vim', 'emacs', 'vscode'] as const)('does not execute %s shortcuts during IME composition', async editorMode => {
    savePreferences({ ...defaultPreferences(), editorMode })
    const editorRef = createRef<ReactCodeMirrorRef>()
    await act(async () => root.render(<ShakyoEditor editorRef={editorRef} referenceText={null} referenceName={null} resolvedTheme="light" />))
    const view = editorRef.current!.view!
    const event = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', isComposing: true, ctrlKey: editorMode === 'emacs', bubbles: true, cancelable: true })
    await act(async () => view.contentDOM.dispatchEvent(event))
    expect(view.state.doc.toString()).toBe('abc')
    expect(view.state.selection.main.head).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('lets Vim Escape leave insert mode before the default keymap handles it', async () => {
    localStorage.setItem(KEY_DRAFT, '')
    savePreferences({ ...defaultPreferences(), editorMode: 'vim' })
    const editorRef = createRef<ReactCodeMirrorRef>()
    await act(async () => root.render(<ShakyoEditor editorRef={editorRef} referenceText={null} referenceName={null} resolvedTheme="light" />))
    const view = editorRef.current!.view!
    const press = async (key: string) => {
      const event = new KeyboardEvent('keydown', { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true })
      await act(async () => view.contentDOM.dispatchEvent(event))
      // jsdom does not implement browser text insertion after an unhandled key.
      if (!event.defaultPrevented && key.length === 1) {
        await act(async () => view.dispatch({ ...view.state.replaceSelection(key), userEvent: 'input.type' }))
      }
    }
    await press('i')
    await press('a')
    expect(view.state.doc.toString()).toBe('a')
    await press('Escape')
    await press('u')
    expect(view.state.doc.toString()).toBe('')
  })

  it('keeps the replace panel open after Ctrl+H is released and repeated in the panel', async () => {
    const editorRef = createRef<ReactCodeMirrorRef>()
    await act(async () => root.render(<ShakyoEditor editorRef={editorRef} referenceText={null} referenceName={null} resolvedTheme="light" />))
    const view = editorRef.current!.view!
    const down = new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => view.contentDOM.dispatchEvent(down))
    await act(async () => Promise.resolve())
    const replace = view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]')!
    expect(down.defaultPrevented).toBe(true)
    expect(replace).not.toBeNull()
    expect(document.activeElement).toBe(replace)

    const repeat = new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, repeat: true, bubbles: true, cancelable: true })
    const up = new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => replace.dispatchEvent(repeat))
    await act(async () => replace.dispatchEvent(up))
    expect(repeat.defaultPrevented).toBe(true)
    expect(view.dom.querySelector('.cm-search')).not.toBeNull()
  })
})
