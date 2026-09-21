import { useCallback, useEffect, useId, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fitScale, pageCssSize } from '../lib/pdfLayout'
import {
  ReaderPageButtons,
  ReaderTocButton,
  ReaderTocDrawer,
  ReaderToolbar,
  type ReaderTocItem,
} from './ReaderControls'
import { readerZoomFromWheel } from '../lib/readerZoom'
import { pageTurnFromWheel } from '../lib/readerNavigation'
import { resolvePdfToc } from '../lib/pdfToc'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

type PageEntry = {
  page: PDFPageProxy
  baseWidth: number
  baseHeight: number
}

export function PdfViewer({ data, readingMode = false }: { data: ArrayBuffer; readingMode?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const pageIndexRef = useRef(0)
  const wheelRef = useRef({ zoomAt: -Infinity, pageLocked: false, unlockTimer: undefined as ReturnType<typeof setTimeout> | undefined })
  const tocId = `pdf-toc-${useId().replaceAll(':', '')}`
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<PageEntry[]>([])
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [pageIndex, setPageIndex] = useState(0)
  const [toc, setToc] = useState<ReaderTocItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  // undefined: 未解決(この間はPdfPage側でIntersectionObserverを作らない)
  // null: 解決済みだがスクロールコンテナが見つからない(root: nullへフォールバック)
  const [scrollRoot, setScrollRoot] = useState<Element | null | undefined>(undefined)

  // effect#1: PDFドキュメントを読み込み、各ページのメタ情報(基準サイズ)のみ取得する。
  // getPage()はページオブジェクトの取得のみでラスタライズ(実際の描画)は行わないため軽量。
  useEffect(() => {
    let cancelled = false
    setPages([])
    setToc([])
    setTocOpen(false)
    setError(null)
    // getDocument()が返すloadingTaskを保持し、クリーンアップ時にdestroy()してリソースを解放する
    const loadingTask = pdfjs.getDocument({
      data: data.slice(0),
      enableXfa: false,
    }) // pdf.jsはバッファを転送して所有するためコピーを渡す

    const load = async () => {
      const doc = await loadingTask.promise
      const entries: PageEntry[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        entries.push({ page, baseWidth: base.width, baseHeight: base.height })
      }
      if (!cancelled) {
        setPages(entries)
        void resolvePdfToc(doc).then(items => {
          if (!cancelled) setToc(items)
        })
      }
    }
    load().catch((e: unknown) => {
      if (!cancelled) setError(`PDFの表示に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    })
    return () => {
      cancelled = true
      void loadingTask.destroy()
    }
  }, [data])

  useEffect(() => {
    setZoom(100)
    setPageIndex(0)
    pageIndexRef.current = 0
  }, [data])

  useEffect(() => { pageIndexRef.current = pageIndex }, [pageIndex])
  useEffect(() => {
    if (!readingMode) setTocOpen(false)
  }, [readingMode])

  const goToPage = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(pages.length - 1, next))
    pageIndexRef.current = bounded
    setPageIndex(bounded)
    const root = pagesRef.current
    if (root) {
      root.scrollTop = 0
      root.scrollLeft = 0
    }
  }, [pages.length])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const wheelState = wheelRef.current
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      if (event.ctrlKey) {
        event.preventDefault()
        const now = performance.now()
        if (now - wheelState.zoomAt < 100) return
        wheelState.zoomAt = now
        setZoom(current => readerZoomFromWheel(current, event.deltaY))
        return
      }
      if (!readingMode || pages.length === 0) return
      const root = pagesRef.current
      if (!root) return
      const direction = pageTurnFromWheel(event.deltaY, root, pageIndexRef.current > 0, pageIndexRef.current < pages.length - 1)
      if (direction === 0) return
      event.preventDefault()
      if (wheelState.unlockTimer) clearTimeout(wheelState.unlockTimer)
      wheelState.unlockTimer = setTimeout(() => { wheelState.pageLocked = false }, 200)
      if (wheelState.pageLocked) return
      wheelState.pageLocked = true
      goToPage(pageIndexRef.current + direction)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
      if (wheelState.unlockTimer) clearTimeout(wheelState.unlockTimer)
      wheelState.pageLocked = false
      wheelState.unlockTimer = undefined
    }
  }, [goToPage, pages.length, readingMode])

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
    <div className={`pdf-viewer ${readingMode ? 'reader-paginated' : 'reader-continuous'}`} ref={containerRef}>
      <ReaderToolbar zoom={zoom} onZoomChange={setZoom}>
        {readingMode && toc.length > 0 && <ReaderTocButton open={tocOpen} controls={tocId}
          onToggle={() => setTocOpen(open => !open)} />}
        {readingMode && pages.length > 0 && <output aria-label="現在のページ">{pageIndex + 1} / {pages.length}</output>}
      </ReaderToolbar>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="pdf-pages" ref={pagesRef}>
        {(readingMode ? pages.slice(pageIndex, pageIndex + 1) : pages).map((p, index) => {
          const actualIndex = readingMode ? pageIndex : index
          return <PdfPage
            key={actualIndex + 1}
            page={p.page}
            baseWidth={p.baseWidth}
            baseHeight={p.baseHeight}
            scale={fitScale(width, p.baseWidth) * zoom / 100}
            scrollRoot={scrollRoot}
            forceVisible={readingMode}
            onError={handlePageError}
          />
        })}
      </div>
      <ReaderTocDrawer id={tocId} open={readingMode && tocOpen} items={toc}
        onClose={() => setTocOpen(false)} onSelect={target => {
          goToPage(Number(target))
          setTocOpen(false)
        }} />
      {readingMode && pages.length > 0 && (
        <ReaderPageButtons
          onPrevious={() => goToPage(pageIndexRef.current - 1)}
          onNext={() => goToPage(pageIndexRef.current + 1)}
          previousDisabled={pageIndex === 0}
          nextDisabled={pageIndex === pages.length - 1}
        />
      )}
    </div>
  )
}

function PdfPage({
  page,
  baseWidth,
  baseHeight,
  scale,
  scrollRoot,
  forceVisible,
  onError,
}: {
  page: PDFPageProxy
  baseWidth: number
  baseHeight: number
  scale: number
  scrollRoot: Element | null | undefined
  forceVisible: boolean
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
    if (forceVisible) return
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
  }, [scrollRoot, forceVisible])

  // effect#B: visibleのときのみcanvasを生成してラスタライズし、不可視に戻ったら破棄する。
  // これにより同時に保持するcanvasの数(=メモリ)を可視近傍分に有界化できる
  // (trade-off: スクロールで頻繁に往復すると再表示のたびに再描画コストがかかる)。
  useEffect(() => {
    if (!visible && !forceVisible) return
    const slot = slotRef.current
    if (!slot) return

    const canvas = document.createElement('canvas')
    const viewport = page.getViewport({ scale })
    const outputScale = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.className = 'pdf-page'
    slot.replaceChildren(canvas)

    const context = canvas.getContext('2d')
    if (!context) return
    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    })
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
  }, [visible, forceVisible, scale, page, onError])

  return (
    <div className="pdf-page-slot" ref={slotRef} style={{ width: size.width, height: size.height }} />
  )
}
