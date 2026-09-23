import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReaderPageButtons, ReaderTocDrawer, ReaderToolbar } from './ReaderControls'
import { readerZoomFromWheel } from '../lib/readerZoom'

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

it('changes zoom in 25% steps and resets it to 100%', async () => {
  const onChange = vi.fn()
  await act(async () => root.render(<ReaderToolbar zoom={75} onZoomChange={onChange} />))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="縮小"]')!.click())
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="拡大"]')!.click())
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="倍率を100%に戻す"]')!.click())
  expect(onChange.mock.calls.map(call => call[0])).toEqual([50, 100, 100])
})

it('accepts an integer zoom, clamps its limits, and restores an invalid value', async () => {
  let zoom = 100
  const onChange = vi.fn((next: number) => { zoom = next })
  await act(async () => root.render(<ReaderToolbar zoom={zoom} onZoomChange={onChange} />))
  const input = container.querySelector<HTMLInputElement>('[aria-label="表示倍率"]')!
  const setValue = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
  }
  await setValue('82.6')
  expect(onChange).toHaveBeenLastCalledWith(83)
  await act(async () => root.render(<ReaderToolbar zoom={83} onZoomChange={onChange} />))
  await setValue('999')
  expect(onChange).toHaveBeenLastCalledWith(300)
  await act(async () => root.render(<ReaderToolbar zoom={300} onZoomChange={onChange} />))
  await setValue('')
  expect(input.value).toBe('300')
})

it('uses the same 25% steps and limits for wheel zoom', () => {
  expect(readerZoomFromWheel(100, -1)).toBe(125)
  expect(readerZoomFromWheel(100, 1)).toBe(75)
  expect(readerZoomFromWheel(300, -1)).toBe(300)
  expect(readerZoomFromWheel(50, 1)).toBe(50)
})

it('exposes accessible previous/next controls and their boundary states', async () => {
  const previous = vi.fn()
  const next = vi.fn()
  await act(async () => root.render(
    <ReaderPageButtons onPrevious={previous} onNext={next} previousDisabled nextDisabled={false} />,
  ))
  expect(container.querySelector<HTMLButtonElement>('[aria-label="前のページ"]')!.disabled).toBe(true)
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="次のページ"]')!.click())
  expect(previous).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledOnce()
  expect(container.querySelector('.reader-edge-next .reader-edge-icon')).not.toBeNull()
})

it('renders hierarchical table-of-contents entries and selects a target', async () => {
  const select = vi.fn()
  await act(async () => root.render(<ReaderTocDrawer id="toc" open items={[
    { key: 'parent', label: '第1章', depth: 0 },
    { key: 'child', label: '1.1', depth: 1, target: 'page-2' },
  ]} onSelect={select} onClose={vi.fn()} />))
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '1.1')!.click())
  expect(select).toHaveBeenCalledWith('page-2')
  expect(container.querySelector('.reader-toc-group')?.textContent).toBe('第1章')
  const parentWheel = vi.fn()
  container.addEventListener('wheel', parentWheel)
  await act(async () => container.querySelector('nav')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 })))
  expect(parentWheel).not.toHaveBeenCalled()
})
