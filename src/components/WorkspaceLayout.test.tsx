// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultLayout, LAYOUT_PATTERNS, type LayoutConfig, type LayoutPattern } from '../lib/layout'
import { streamExplanation } from '../lib/openai'
import { ExplainPanel } from './ExplainPanel'
import { WorkspaceLayout } from './WorkspaceLayout'

vi.mock('../lib/settings', () => ({ loadSettings: () => ({ apiKey: 'test', model: 'test' }) }))
vi.mock('../lib/openai', () => ({ streamExplanation: vi.fn(), streamChat: vi.fn(), buildExplanationMessages: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function StatefulPane({ name }: { name: string }) {
  const [value, setValue] = useState('')
  return <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} />
}
const plainPanes = { reference: <StatefulPane name="reference" />, editor: <StatefulPane name="editor" />, explain: <div>解説</div> }
function render(layout: LayoutConfig, onChange = vi.fn(), panes = plainPanes) {
  act(() => root.render(<WorkspaceLayout layout={layout} onChange={onChange} panes={panes} />))
  return onChange
}
function input(element: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function separator(index = 0) {
  return container.querySelectorAll<HTMLElement>('[role="separator"]')[index]
}
function pointer(target: HTMLElement, type: string, x: number, y = 0) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    target.dispatchEvent(event)
  })
}
function setupDrag(pattern: LayoutPattern, divider: 0 | 1 = 0) {
  const layout = { ...createDefaultLayout(), pattern }
  const onChange = vi.fn()
  render(layout, onChange)
  const workspace = container.querySelector<HTMLElement>('.workspace-layout')!
  vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 1010, height: 1010 } as DOMRect)
  const handle = separator(divider)
  vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue({ left: 510, top: 520 } as DOMRect)
  Object.assign(handle, { setPointerCapture: vi.fn() })
  pointer(handle, 'pointerdown', 512, 522)
  return { layout, onChange, handle }
}

describe('WorkspaceLayout', () => {
  it('全パターン・全割り当てでDOM順と入力・選択範囲を保持する', () => {
    const layout = createDefaultLayout()
    render(layout)
    const originalPanes = Array.from(container.querySelectorAll('.workspace-pane'))
    const reference = container.querySelector<HTMLInputElement>('[aria-label="reference"]')!
    const editor = container.querySelector<HTMLInputElement>('[aria-label="editor"]')!
    input(reference, 'お手本の内容')
    input(editor, 'const value = 1')
    editor.setSelectionRange(2, 8)
    const assignments: LayoutConfig['panes'][] = [
      ['reference', 'editor', 'explain'], ['reference', 'explain', 'editor'],
      ['editor', 'reference', 'explain'], ['editor', 'explain', 'reference'],
      ['explain', 'reference', 'editor'], ['explain', 'editor', 'reference'],
    ]
    for (const pattern of LAYOUT_PATTERNS) {
      for (const panes of assignments) {
        render({ ...layout, pattern, panes })
        const current = Array.from(container.querySelectorAll<HTMLElement>('.workspace-pane'))
        current.forEach((element, index) => {
          expect(element).toBe(originalPanes[index])
          expect(element.style.gridArea).toBe(`slot${panes.indexOf(element.dataset.pane as LayoutConfig['panes'][number])}`)
        })
        expect(container.querySelector('[aria-label="reference"]')).toBe(reference)
        expect(container.querySelector('[aria-label="editor"]')).toBe(editor)
        expect(reference.value).toBe('お手本の内容')
        expect(editor.value).toBe('const value = 1')
        expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 8])
      }
    }
  })

  it('解説ストリームと質問の下書きが配置変更をまたいで継続する', async () => {
    let release!: () => void
    const nextChunk = new Promise<void>((resolve) => { release = resolve })
    let signal!: AbortSignal
    vi.mocked(streamExplanation).mockImplementation(async function* (options) {
      signal = options.signal!
      yield '最初の解説'
      await nextChunk
      yield '、続きの解説'
    })
    const panes = {
      ...plainPanes,
      explain: <ExplainPanel getCode={() => ({ code: 'const a = 1', isSelection: false })} onOpenSettings={() => {}} />,
    }
    render(createDefaultLayout(), vi.fn(), panes)
    const explain = container.querySelector('[data-pane="explain"]')!
    const question = container.querySelector<HTMLInputElement>('[aria-label="追加で質問する…"]')!
    input(question, '途中の質問')
    await act(async () => {
      Array.from(explain.querySelectorAll('button')).find((button) => button.textContent === '解説する')!.click()
    })
    expect(explain.textContent).toContain('最初の解説')
    for (const pattern of LAYOUT_PATTERNS) {
      render({ ...createDefaultLayout(), pattern, panes: ['explain', 'reference', 'editor'] }, vi.fn(), panes)
      expect(container.querySelector('[data-pane="explain"]')).toBe(explain)
      expect(signal.aborted).toBe(false)
      expect(question.value).toBe('途中の質問')
      expect(explain.textContent).toContain('停止')
    }
    await act(async () => { release() })
    expect(explain.textContent).toContain('最初の解説、続きの解説')
    expect(explain.textContent).toContain('解説する')
    expect(signal.aborted).toBe(false)
    expect(streamExplanation).toHaveBeenCalledOnce()
  })

  it.each([
    ['left', 'ArrowRight', 0.52, 'vertical'],
    ['right', 'ArrowRight', 0.48, 'vertical'],
    ['top', 'ArrowDown', 0.52, 'horizontal'],
    ['bottom', 'ArrowDown', 0.48, 'horizontal'],
  ] as const)('%sのキーボード操作が向きに応じてサイズを保存する', (pattern, key, expected, orientation) => {
    const layout = { ...createDefaultLayout(), pattern }
    const onChange = render(layout)
    expect(separator().getAttribute('aria-orientation')).toBe(orientation)
    act(() => separator().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0].ratios[pattern][0]).toBeCloseTo(expected)
    expect(onChange.mock.calls[0][1]).toBe(true)
  })

  it.each([0, 1] as const)('横3列の境界%iを累積比率でドラッグし、終了時だけ保存する', (divider) => {
    const { onChange, handle } = setupDrag('columns', divider)
    expect(handle.getAttribute('aria-valuenow')).toBe('33')
    expect(handle.getAttribute('aria-valuemin')).toBe('15')
    expect(handle.getAttribute('aria-valuemax')).toBe('52')
    expect(container.querySelector('.workspace-resize-overlay')).not.toBeNull()
    // 先頭位置10px＋つかみ位置2px＋手前の境界幅＋有効幅1000pxの40%/75%。
    pointer(handle, 'pointermove', divider === 0 ? 412 : 767)
    expect(onChange.mock.calls.at(-1)![0].ratios.columns[divider]).toBeCloseTo(divider === 0 ? 0.4 : 0.75)
    expect(onChange.mock.calls.at(-1)![1]).toBe(false)
    pointer(handle, 'pointerup', divider === 0 ? 412 : 767)
    expect(onChange.mock.calls.at(-1)![1]).toBe(true)
    expect(container.querySelector('.workspace-resize-overlay')).toBeNull()
    render(onChange.mock.calls.at(-1)![0], onChange)
    expect(handle.getAttribute('aria-valuenow')).toBe(divider === 0 ? '40' : '42')
  })

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'Escape'] as const)('%sでドラッグを取り消し、初期値へ戻して保存しない', (reason) => {
    const { layout, onChange, handle } = setupDrag('left')
    pointer(handle, 'pointermove', 712)
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')))
    else if (reason === 'Escape') act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    else pointer(handle, reason, 712)
    expect(onChange.mock.calls.at(-1)).toEqual([layout, false])
    expect(onChange.mock.calls.every(([, persist]) => persist === false)).toBe(true)
    expect(container.querySelector('.workspace-resize-overlay')).toBeNull()
  })
})
