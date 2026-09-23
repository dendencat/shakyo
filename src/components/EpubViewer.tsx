import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type Contents from 'epubjs/types/contents'
import type { Location } from 'epubjs/types/rendition'
import type { NavItem } from 'epubjs/types/navigation'
import type Rendition from 'epubjs/types/rendition'
import {
  ReaderPageButtons,
  ReaderTocButton,
  ReaderTocDrawer,
  ReaderToolbar,
  type ReaderTocItem,
} from './ReaderControls'
import { findInternalBookDocument, resolveInternalBookLink, secureEpubContents, secureEpubDocument, secureEpubSerializedHtml } from '../lib/epubSecurity'
import { openExternal } from '../lib/openExternal'
import { readerZoomFromWheel } from '../lib/readerZoom'
import { pageTurnFromWheel } from '../lib/readerNavigation'

function flattenToc(items: NavItem[], depth = 0, path = 'toc'): ReaderTocItem[] {
  return items.flatMap((item, index) => [
    { key: `${path}-${index}`, target: item.href, label: item.label.trim() || '無題', depth },
    ...flattenToc(item.subitems ?? [], depth + 1, `${path}-${index}`),
  ])
}

export function EpubViewer({ data, readingMode }: { data: ArrayBuffer; readingMode: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const currentCfiRef = useRef<string | undefined>(undefined)
  const zoomRef = useRef(100)
  const locationRef = useRef<Location | null>(null)
  const wheelRef = useRef({ zoomAt: -Infinity, pageLocked: false, unlockTimer: undefined as ReturnType<typeof setTimeout> | undefined })
  const supplementRequestRef = useRef(0)
  const navigateInternalRef = useRef<((href: string, fromHref: string) => void) | null>(null)
  const tocId = `epub-toc-${useId().replaceAll(':', '')}`
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [toc, setToc] = useState<ReaderTocItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [location, setLocation] = useState<Location | null>(null)
  const [supplement, setSupplement] = useState<{ html: string; href: string; fragment: string } | null>(null)

  const handleExternalLink = useCallback((url: string) => {
    const target = new URL(url)
    if (!window.confirm(`外部サイトを既定のブラウザで開きますか？\n\n接続先: ${target.host}\n${target.href}`)) return
    void openExternal(target.href).catch(() => setError('外部サイトを開けませんでした。'))
  }, [])

  const handleWheel = useCallback((event: WheelEvent, root: Element | null) => {
    if (event.deltaY === 0) return
    if (event.ctrlKey) {
      event.preventDefault()
      const now = performance.now()
      if (now - wheelRef.current.zoomAt < 100) return
      wheelRef.current.zoomAt = now
      setZoom(current => readerZoomFromWheel(current, event.deltaY))
      return
    }
    if (!readingMode) return
    const scrollTop = root?.scrollTop ?? 0
    const clientHeight = root?.clientHeight ?? 0
    const scrollHeight = root?.scrollHeight ?? 0
    const current = locationRef.current
    const direction = pageTurnFromWheel(event.deltaY, { scrollTop, clientHeight, scrollHeight }, !!current && !current.atStart, !!current && !current.atEnd)
    if (direction === 0) return
    event.preventDefault()
    if (wheelRef.current.unlockTimer) clearTimeout(wheelRef.current.unlockTimer)
    wheelRef.current.unlockTimer = setTimeout(() => { wheelRef.current.pageLocked = false }, 200)
    if (wheelRef.current.pageLocked) return
    wheelRef.current.pageLocked = true
    if (root) root.scrollTop = 0
    void (direction > 0 ? renditionRef.current?.next() : renditionRef.current?.prev())
  }, [readingMode])

  useEffect(() => {
    zoomRef.current = 100
    setZoom(100)
    currentCfiRef.current = undefined
    locationRef.current = null
    setTocOpen(false)
    supplementRequestRef.current++
    setSupplement(null)
  }, [data])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const wheelState = wheelRef.current
    let cancelled = false
    let book: import('epubjs/types/book').default | undefined
    setError(null)
    setLocation(null)
    setToc([])
    host.replaceChildren()

    const open = async () => {
      const { default: createEpub } = await import('epubjs')
      if (cancelled) return
      book = createEpub(data.slice(0), {
        requestMethod: (url: string) => Promise.reject(new Error(`EPUBからの外部通信を遮断しました: ${url}`)),
      })
      // opened は epub.js の資産URL置換フック登録・置換完了まで待つ。
      await book.opened
      if (cancelled) return
      // Section content hooks run before serialization/srcdoc insertion, so the restrictive
      // CSP and sanitization are present before an iframe can request any resource.
      book.spine.hooks.content.register((document: Document) => secureEpubDocument(document))
      book.spine.hooks.serialize.register((_output: string, section: { output: string }) => {
        section.output = secureEpubSerializedHtml(section.output)
      })
      const navigation = await book.loaded.navigation
      if (!cancelled) setToc(flattenToc(navigation.toc))
      const rendition = book.renderTo(host, {
        width: '100%',
        height: '100%',
        manager: readingMode ? 'default' : 'continuous',
        flow: readingMode ? 'paginated' : 'scrolled-doc',
        spread: 'none',
        allowScriptedContent: false,
      })
      renditionRef.current = rendition
      const navigateInternal = (href: string, fromHref: string) => {
        const target = resolveInternalBookLink(fromHref, href)
        if (!target || !book) return
        const destination = target.path + target.fragment
        if (book.spine.get(target.path)) {
          supplementRequestRef.current++
          setSupplement(null)
          void rendition.display(destination)
          return
        }
        const manifestHref = findInternalBookDocument(book.packaging.manifest, target.path, path => book!.resolve(path))
        if (!manifestHref) {
          setError('文書内リンクの参照先を表示できませんでした。')
          return
        }
        const request = ++supplementRequestRef.current
        void book.load(manifestHref).then(loaded => {
          if (cancelled || request !== supplementRequestRef.current) return
          const document = loaded as Document
          if (!document.documentElement) throw new Error('文書が正しくありません。')
          secureEpubDocument(document)
          const html = secureEpubSerializedHtml(book!.resources.substitute(new XMLSerializer().serializeToString(document), book!.resolve(manifestHref)))
          if (html.length > 1_000_000) throw new Error('文書が大きすぎます。')
          setSupplement({ html, href: target.path, fragment: target.fragment })
        }).catch(() => {
          if (!cancelled && request === supplementRequestRef.current) setError('文書内リンクの参照先を表示できませんでした。')
        })
      }
      navigateInternalRef.current = navigateInternal
      rendition.hooks.content.register((contents: Contents) => {
        secureEpubContents(contents, handleExternalLink, href => {
          const section = book?.spine.get(contents.sectionIndex)
          if (section) navigateInternal(href, section.href)
        })
        const document = contents.document
        const wheel = (event: WheelEvent) => handleWheel(event, document.scrollingElement ?? document.documentElement)
        document.addEventListener('wheel', wheel, { passive: false })
      })
      rendition.themes.fontSize(`${zoomRef.current}%`)
      rendition.on('relocated', (next: Location) => {
        currentCfiRef.current = next.start?.cfi
        locationRef.current = next
        setLocation(next)
      })
      await rendition.display(currentCfiRef.current)
    }
    void open().catch((reason: unknown) => {
      if (!cancelled) setError(`EPUBの表示に失敗しました: ${reason instanceof Error ? reason.message : String(reason)}`)
    })
    return () => {
      cancelled = true
      navigateInternalRef.current = null
      renditionRef.current = null
      locationRef.current = null
      if (wheelState.unlockTimer) clearTimeout(wheelState.unlockTimer)
      wheelState.pageLocked = false
      wheelState.unlockTimer = undefined
      book?.destroy()
      host.replaceChildren()
    }
  }, [data, handleExternalLink, handleWheel, readingMode])

  useEffect(() => {
    zoomRef.current = zoom
    renditionRef.current?.themes.fontSize(`${zoom}%`)
  }, [zoom])

  useEffect(() => {
    if (!readingMode) setTocOpen(false)
  }, [readingMode])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const wheel = (event: WheelEvent) => handleWheel(event, hostRef.current)
    viewer.addEventListener('wheel', wheel, { passive: false })
    return () => viewer.removeEventListener('wheel', wheel)
  }, [handleWheel])

  const previous = () => { void renditionRef.current?.prev() }
  const next = () => { void renditionRef.current?.next() }
  const displayed = location?.start?.displayed

  return (
    <div ref={viewerRef} className={`epub-viewer ${readingMode ? 'reader-paginated' : 'reader-continuous'}`}>
      <ReaderToolbar zoom={zoom} onZoomChange={setZoom}>
        {readingMode && toc.length > 0 && <ReaderTocButton open={tocOpen} controls={tocId}
          onToggle={() => setTocOpen(open => !open)} />}
        {!readingMode && toc.length > 0 && (
          <select aria-label="章節を移動" defaultValue="" onChange={event => {
            const target = event.currentTarget.value
            if (target) void renditionRef.current?.display(target)
          }}>
            <option value="" disabled>目次</option>
            {toc.map((item, index) => (
              <option key={`${item.key}-${index}`} value={item.target}>{`${'　'.repeat(item.depth)}${item.label}`}</option>
            ))}
          </select>
        )}
        {readingMode && displayed && <output aria-label="現在のページ">{displayed.page} / {displayed.total}</output>}
      </ReaderToolbar>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div ref={hostRef} className="epub-rendition" aria-label="EPUB本文" />
      {supplement && <div className="epub-supplement" role="dialog" aria-label="文書内の参照先">
        <div className="epub-supplement-heading"><strong>文書内の参照先</strong>
          <button type="button" onClick={() => { supplementRequestRef.current++; setSupplement(null) }}>本文に戻る</button></div>
        <iframe title="文書内の参照先" sandbox="allow-same-origin" srcDoc={supplement.html} onLoad={event => {
          const document = event.currentTarget.contentDocument
          if (!document) return
          secureEpubContents({ document }, handleExternalLink, href => navigateInternalRef.current?.(href, supplement.href))
          if (supplement.fragment) {
            try { document.getElementById(decodeURIComponent(supplement.fragment.slice(1)))?.scrollIntoView() } catch { /* 壊れた参照位置は無視する */ }
          }
        }} />
      </div>}
      <ReaderTocDrawer id={tocId} open={readingMode && tocOpen} items={toc}
        onClose={() => setTocOpen(false)} onSelect={target => {
          void renditionRef.current?.display(target)
          setTocOpen(false)
        }} />
      {readingMode && (
        <ReaderPageButtons
          onPrevious={previous}
          onNext={next}
          previousDisabled={!location || location.atStart}
          nextDisabled={!location || location.atEnd}
        />
      )}
    </div>
  )
}
