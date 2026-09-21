import { useEffect, useRef, useState } from 'react'
import type Contents from 'epubjs/types/contents'
import type { Location } from 'epubjs/types/rendition'
import type { NavItem } from 'epubjs/types/navigation'
import type Rendition from 'epubjs/types/rendition'
import { ReaderPageButtons, ReaderToolbar } from './ReaderControls'
import { secureEpubContents, secureEpubDocument } from '../lib/epubSecurity'

type TocItem = { href: string; label: string; depth: number }

function flattenToc(items: NavItem[], depth = 0): TocItem[] {
  return items.flatMap(item => [
    { href: item.href, label: item.label.trim(), depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ])
}

export function EpubViewer({ data, readingMode }: { data: ArrayBuffer; readingMode: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const currentCfiRef = useRef<string | undefined>(undefined)
  const zoomRef = useRef(100)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [toc, setToc] = useState<TocItem[]>([])
  const [location, setLocation] = useState<Location | null>(null)

  useEffect(() => {
    zoomRef.current = 100
    setZoom(100)
    currentCfiRef.current = undefined
  }, [data])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let book: import('epubjs/types/book').default | undefined
    setError(null)
    setLocation(null)
    setToc([])
    host.replaceChildren()

    const open = async () => {
      const { default: createEpub } = await import('epubjs')
      if (cancelled) return
      book = createEpub(data.slice(0))
      await book.ready
      if (cancelled) return
      // Section content hooks run before serialization/srcdoc insertion, so the restrictive
      // CSP and sanitization are present before an iframe can request any resource.
      book.spine.hooks.content.register((document: Document) => secureEpubDocument(document))
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
      rendition.hooks.content.register((contents: Contents) => secureEpubContents(contents))
      rendition.themes.fontSize(`${zoomRef.current}%`)
      rendition.on('relocated', (next: Location) => {
        currentCfiRef.current = next.start?.cfi
        setLocation(next)
      })
      await rendition.display(currentCfiRef.current)
    }
    void open().catch((reason: unknown) => {
      if (!cancelled) setError(`EPUBの表示に失敗しました: ${reason instanceof Error ? reason.message : String(reason)}`)
    })
    return () => {
      cancelled = true
      renditionRef.current = null
      book?.destroy()
      host.replaceChildren()
    }
  }, [data, readingMode])

  useEffect(() => {
    zoomRef.current = zoom
    renditionRef.current?.themes.fontSize(`${zoom}%`)
  }, [zoom])

  const previous = () => { void renditionRef.current?.prev() }
  const next = () => { void renditionRef.current?.next() }
  const displayed = location?.start?.displayed

  return (
    <div className={`epub-viewer ${readingMode ? 'reader-paginated' : 'reader-continuous'}`}>
      <ReaderToolbar zoom={zoom} onZoomChange={setZoom}>
        {toc.length > 0 && (
          <select aria-label="章節を移動" defaultValue="" onChange={event => {
            const target = event.currentTarget.value
            if (target) void renditionRef.current?.display(target)
          }}>
            <option value="" disabled>目次</option>
            {toc.map((item, index) => (
              <option key={`${item.href}-${index}`} value={item.href}>{`${'　'.repeat(item.depth)}${item.label}`}</option>
            ))}
          </select>
        )}
        {readingMode && displayed && <output aria-label="現在のページ">{displayed.page} / {displayed.total}</output>}
      </ReaderToolbar>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div ref={hostRef} className="epub-rendition" aria-label="EPUB本文" />
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
