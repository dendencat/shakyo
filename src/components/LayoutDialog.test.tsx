// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultLayout, LAYOUT_PATTERNS, PANE_LABELS, type LayoutConfig } from '../lib/layout'
import { LayoutDialog } from './LayoutDialog'

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
})

function render(layout = createDefaultLayout()) {
  const onApply = vi.fn<(layout: LayoutConfig) => void>()
  const onClose = vi.fn()
  act(() => root.render(<LayoutDialog layout={layout} onApply={onApply} onClose={onClose} />))
  return { onApply, onClose }
}

function changeSelect(index: number, value: string) {
  const select = container.querySelectorAll('select')[index]
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === text)!
  act(() => button.click())
}

describe('LayoutDialog', () => {
  it('使用中の要素を交換し、適用時だけ変更を渡して閉じる', () => {
    const layout = createDefaultLayout()
    const original = structuredClone(layout)
    const { onApply, onClose } = render(layout)
    changeSelect(1, layout.panes[1])
    expect(Array.from(container.querySelectorAll('select')).slice(1).map((select) => select.value))
      .toEqual([layout.panes[1], layout.panes[0], layout.panes[2]])
    expect(onApply).not.toHaveBeenCalled()
    expect(layout).toEqual(original)
    clickButton('適用')
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      ...layout, panes: [layout.panes[1], layout.panes[0], layout.panes[2]],
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('6パターンを選択でき、配置図と割り当てを維持する', () => {
    const layout = createDefaultLayout()
    const { onApply } = render(layout)
    expect(container.querySelector('select')!.options).toHaveLength(6)
    for (const pattern of LAYOUT_PATTERNS) {
      changeSelect(0, pattern)
      const preview = container.querySelector('[role="img"]')!
      expect(preview.classList.contains(`layout-preview-${pattern}`)).toBe(true)
      for (const pane of layout.panes) expect(preview.textContent).toContain(PANE_LABELS[pane])
    }
    clickButton('適用')
    expect(onApply.mock.calls[0][0].ratios).toEqual(layout.ratios)
    expect(onApply.mock.calls[0][0].panes).toEqual(layout.panes)
  })

  it.each(['キャンセル', 'Escape', 'backdrop'])('%sで変更を破棄する', (method) => {
    const { onApply, onClose } = render()
    changeSelect(0, 'rows')
    if (method === 'キャンセル') clickButton(method)
    else if (method === 'Escape') {
      act(() => container.querySelector('select')!.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true,
      })))
    } else {
      act(() => (container.querySelector('.modal-backdrop') as HTMLElement).click())
    }
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('初期配置へのリセットも適用までは確定しない', () => {
    const layout = createDefaultLayout()
    layout.pattern = 'columns'
    layout.panes = ['explain', 'reference', 'editor']
    layout.ratios.left = [0.7, 0.3]
    const { onApply, onClose } = render(layout)
    clickButton('初期配置に戻す')
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(container.querySelector('select')!.value).toBe(createDefaultLayout().pattern)
    clickButton('適用')
    expect(onApply).toHaveBeenCalledExactlyOnceWith(createDefaultLayout())
  })

  it('ダイアログ内のクリックでは閉じず、閉じた後に起点へフォーカスを戻す', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { onClose } = render()
    act(() => (container.querySelector('[role="dialog"]') as HTMLElement).click())
    expect(onClose).not.toHaveBeenCalled()
    act(() => root.render(null))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
