import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ReaderTocItem } from '../components/ReaderControls'

type PdfOutlineNode = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number]

export const MAX_PDF_TOC_ITEMS = 2_000
export const MAX_PDF_TOC_DEPTH = 64

export async function resolvePdfToc(doc: PDFDocumentProxy): Promise<ReaderTocItem[]> {
  const outline = await doc.getOutline().catch(() => [])
  const resolved: ReaderTocItem[] = []
  let sequence = 0
  const stack: Array<{ items: PdfOutlineNode[]; index: number; depth: number }> = [
    { items: outline ?? [], index: 0, depth: 0 },
  ]
  while (stack.length > 0 && resolved.length < MAX_PDF_TOC_ITEMS) {
    const frame = stack.at(-1)!
    if (frame.index >= frame.items.length) {
      stack.pop()
      continue
    }
    const item = frame.items[frame.index++]
    let pageIndex: number | undefined
    try {
      const destination = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      const page = destination?.[0]
      if (Number.isInteger(page)) pageIndex = Number(page)
      else if (page && typeof page === 'object') pageIndex = await doc.getPageIndex(page)
    } catch {
      // 壊れた項目だけを見出し扱いにし、本文と残りの目次は利用できるようにする。
    }
    resolved.push({
      key: `pdf-toc-${sequence++}`,
      label: item.title.trim() || '無題',
      depth: frame.depth,
      target: pageIndex == null ? undefined : String(pageIndex),
    })
    if (item.items?.length && frame.depth + 1 < MAX_PDF_TOC_DEPTH) {
      stack.push({ items: item.items, index: 0, depth: frame.depth + 1 })
    }
  }
  return resolved
}
