import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReaderPageButtons, ReaderToolbar } from './ReaderControls'

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
})
