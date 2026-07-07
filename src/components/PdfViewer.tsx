import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export function PdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    // getDocument()が返すloadingTaskを保持し、クリーンアップ時にdestroy()してリソースを解放する
    const loadingTask = pdfjs.getDocument({ data: data.slice(0) }) // pdf.jsはバッファを転送して所有するためコピーを渡す
    container.replaceChildren()
    setError(null)

    const render = async () => {
      const doc = await loadingTask.promise
      const width = container.clientWidth || 600
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.max(0.5, (width - 24) / base.width)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'pdf-page'
        container.appendChild(canvas)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      }
    }
    render().catch((e: unknown) => {
      if (!cancelled) setError(`PDFの表示に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    })
    return () => {
      cancelled = true
      void loadingTask.destroy()
    }
  }, [data])

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
