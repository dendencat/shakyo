import { expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { MAX_PDF_TOC_DEPTH, MAX_PDF_TOC_ITEMS, resolvePdfToc } from './pdfToc'

it('flattens PDF outlines and resolves named and explicit destinations', async () => {
  const ref = { num: 7, gen: 0 }
  const doc = {
    getOutline: vi.fn().mockResolvedValue([
      { title: '第1章', dest: 'chapter-1', items: [{ title: '節', dest: [ref], items: [] }] },
      { title: '外部URLのみ', dest: null, url: 'https://example.com', items: [] },
    ]),
    getDestination: vi.fn().mockResolvedValue([2]),
    getPageIndex: vi.fn().mockResolvedValue(4),
  } as unknown as PDFDocumentProxy
  await expect(resolvePdfToc(doc)).resolves.toEqual([
    { key: 'pdf-toc-0', label: '第1章', depth: 0, target: '2' },
    { key: 'pdf-toc-1', label: '節', depth: 1, target: '4' },
    { key: 'pdf-toc-2', label: '外部URLのみ', depth: 0, target: undefined },
  ])
})

it('treats an unreadable outline as unavailable without failing the document', async () => {
  const doc = { getOutline: vi.fn().mockRejectedValue(new Error('broken')) } as unknown as PDFDocumentProxy
  await expect(resolvePdfToc(doc)).resolves.toEqual([])
})

it('bounds deeply nested and oversized outlines without recursive stack exhaustion', async () => {
  const root = { title: '0', dest: null, items: [] as unknown[] }
  let current = root
  for (let depth = 1; depth < 20_000; depth++) {
    const child = { title: String(depth), dest: null, items: [] as unknown[] }
    current.items = [child]
    current = child
  }
  const wide = Array.from({ length: MAX_PDF_TOC_ITEMS + 100 }, (_, index) => ({
    title: `項目${index}`,
    dest: null,
    items: [],
  }))
  const deepDoc = { getOutline: vi.fn().mockResolvedValue([root]) } as unknown as PDFDocumentProxy
  const wideDoc = { getOutline: vi.fn().mockResolvedValue(wide) } as unknown as PDFDocumentProxy

  await expect(resolvePdfToc(deepDoc)).resolves.toHaveLength(MAX_PDF_TOC_DEPTH)
  await expect(resolvePdfToc(wideDoc)).resolves.toHaveLength(MAX_PDF_TOC_ITEMS)
})
