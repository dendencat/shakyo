import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fitScale, pageCssSize } from '../lib/pdfLayout'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

type PageEntry = {
  page: PDFPageProxy
  baseWidth: number
  baseHeight: number
}

export function PdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<PageEntry[]>([])
  const [width, setWidth] = useState(0)
  // undefined: 未解決(この間はPdfPage側でIntersectionObserverを作らない)
  // null: 解決済みだがスクロールコンテナが見つからない(root: nullへフォールバック)
  const [scrollRoot, setScrollRoot] = useState<Element | null | undefined>(undefined)

  // effect#1: PDFドキュメントを読み込み、各ページのメタ情報(基準サイズ)のみ取得する。
  // getPage()はページオブジェクトの取得のみでラスタライズ(実際の描画)は行わないため軽量。
  useEffect(() => {
    let cancelled = false
    setPages([])
    setError(null)
    // getDocument()が返すloadingTaskを保持し、クリーンアップ時にdestroy()してリソースを解放する
    const loadingTask = pdfjs.getDocument({ data: data.slice(0) }) // pdf.jsはバッファを転送して所有するためコピーを渡す

    const load = async () => {
      const doc = await loadingTask.promise
      const entries: PageEntry[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        entries.push({ page, baseWidth: base.width, baseHeight: base.height })
      }
      if (!cancelled) setPages(entries)
    }
    load().catch((e: unknown) => {
      if (!cancelled) setError(`PDFの表示に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    })
    return () => {
      cancelled = true
      void loadingTask.destroy()
    }
  }, [data])

  // effect#2: コンテナ幅の変化をResizeObserverで監視し、150msデバウンスしてwidthに反映する。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const w = entry.contentRect.width
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setWidth(w), 150)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [])

  // effect#3: マウント後に実際のスクロールコンテナ(.reference-content)を解決する。
  // IntersectionObserverのrootにこれを渡すことで、rootMarginによる先読みが
  // (ウィンドウ全体ではなく)このスクロールコンテナのスクロールに対して機能するようになる。
  // 見つからない場合はnull(root: nullへのフォールバック)を設定する。
  useEffect(() => {
    const container = containerRef.current
    setScrollRoot(container?.closest('.reference-content') ?? null)
  }, [])

  const handlePageError = useCallback((message: string) => {
    setError(message)
  }, [])

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {error && <p className="error-text">{error}</p>}
      {pages.map((p, i) => (
        <PdfPage
          key={i + 1}
          page={p.page}
          baseWidth={p.baseWidth}
          baseHeight={p.baseHeight}
          scale={fitScale(width, p.baseWidth)}
          scrollRoot={scrollRoot}
          onError={handlePageError}
        />
      ))}
    </div>
  )
}

function PdfPage({
  page,
  baseWidth,
  baseHeight,
  scale,
  scrollRoot,
  onError,
}: {
  page: PDFPageProxy
  baseWidth: number
  baseHeight: number
  scale: number
  scrollRoot: Element | null | undefined
  onError: (message: string) => void
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const size = pageCssSize({ width: baseWidth, height: baseHeight }, scale)

  // effect#A: 可視近傍(上下150%の範囲)に入ったかどうかをIntersectionObserverで監視する。
  // rootMarginは指定したroot自身の境界にのみ適用され、targetとrootの間にある祖先の
  // overflow clipには適用されない。そのためroot: nullのまま(=ビューポート基準)にすると、
  // ウィンドウより小さい.reference-content内では先読みが実質機能しない。
  // よってPdfViewerが解決した実スクロールコンテナ(scrollRoot)をrootとして渡す。
  // scrollRootがundefined(未解決)の間はobserverを作らない — 初回レンダーでroot: nullの
  // observerを作って固定化してしまうと、後でscrollRootが解決されても反映されないため。
  useEffect(() => {
    if (scrollRoot === undefined) return
    const slot = slotRef.current
    if (!slot) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false)
      },
      { root: scrollRoot, rootMargin: '150% 0px' },
    )
    observer.observe(slot)
    return () => observer.disconnect()
  }, [scrollRoot])

  // effect#B: visibleのときのみcanvasを生成してラスタライズし、不可視に戻ったら破棄する。
  // これにより同時に保持するcanvasの数(=メモリ)を可視近傍分に有界化できる
  // (trade-off: スクロールで頻繁に往復すると再表示のたびに再描画コストがかかる)。
  useEffect(() => {
    if (!visible) return
    const slot = slotRef.current
    if (!slot) return

    const canvas = document.createElement('canvas')
    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.className = 'pdf-page'
    slot.replaceChildren(canvas)

    const context = canvas.getContext('2d')
    if (!context) return
    const renderTask = page.render({ canvas, canvasContext: context, viewport })
    renderTask.promise.catch((e: unknown) => {
      // RenderingCancelledExceptionはcleanupによる意図的なキャンセルなので無視する。
      // instanceofはバンドル境界(異なるpdf.jsインスタンス)で壊れうるためnameで判定する。
      if ((e as Error)?.name === 'RenderingCancelledException') return
      onError(`PDFの表示に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    })

    return () => {
      renderTask.cancel()
      slot.replaceChildren()
    }
    // page.cleanup()は呼ばない。doc.destroy()(親のloadingTask.destroy())が一括で
    // リソースを解放するため、ここで個別にcleanup()すると二重解放になりうる。
  }, [visible, scale, page, onError])

  return (
    <div className="pdf-page-slot" ref={slotRef} style={{ width: size.width, height: size.height }} />
  )
}
