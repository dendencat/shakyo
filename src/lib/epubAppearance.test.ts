import { afterEach, describe, expect, it } from 'vitest'
import { applyEpubAppearance } from './epubAppearance'
import { secureEpubDocument, secureEpubSerializedHtml } from './epubSecurity'

const frames: HTMLIFrameElement[] = []

function bookDocument(html: string): Document {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  frames.push(frame)
  const book = frame.contentDocument!
  book.open()
  book.write(html)
  book.close()
  return book
}

afterEach(() => frames.splice(0).forEach(frame => frame.remove()))

describe('applyEpubAppearance', () => {
  it('provides a light canvas and dark text inside an unstyled EPUB iframe', () => {
    const book = bookDocument('<html><head></head><body><p>本文</p></body></html>')
    const appColorScheme = document.documentElement.style.colorScheme
    document.documentElement.style.colorScheme = 'dark'
    applyEpubAppearance(book)
    secureEpubDocument(book)

    try {
      for (const theme of ['dark', 'light']) {
        document.documentElement.style.colorScheme = theme
        const rootStyle = book.defaultView!.getComputedStyle(book.documentElement)
        expect(rootStyle.colorScheme).toBe('light')
        expect(rootStyle.color).toBe('rgb(26, 26, 26)')
        expect(rootStyle.backgroundColor).toBe('rgb(255, 255, 255)')
      }
      expect(book.head.firstElementChild?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    } finally {
      document.documentElement.style.colorScheme = appColorScheme
    }
  })

  it('keeps the book CSS after defaults and preserves it through srcdoc serialization', () => {
    const book = bookDocument('<html><head><style>html { color: #f0f0f0; background-color: #202020; } body { color: #e0e0e0; }</style></head><body>本文</body></html>')
    applyEpubAppearance(book)
    applyEpubAppearance(book)
    secureEpubDocument(book)

    expect(book.head.querySelectorAll('style[data-shakyo-epub-defaults]')).toHaveLength(1)
    expect(book.head.querySelectorAll('style')[0]?.hasAttribute('data-shakyo-epub-defaults')).toBe(true)
    expect(book.defaultView!.getComputedStyle(book.body).color).toBe('rgb(224, 224, 224)')

    const serialized = secureEpubSerializedHtml(new XMLSerializer().serializeToString(book))
    const restored = new DOMParser().parseFromString(serialized, 'text/html')
    expect(restored.head.querySelector('style[data-shakyo-epub-defaults]')).not.toBeNull()
    expect(restored.head.querySelectorAll('style')).toHaveLength(2)
  })

  it('inserts namespaced styles into XHTML chapters', () => {
    const book = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><style>body { color: navy; }</style></head><body>本文</body></html>',
      'application/xhtml+xml',
    )
    applyEpubAppearance(book)
    secureEpubDocument(book)
    const style = book.querySelector('style[data-shakyo-epub-defaults]')
    expect(style?.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    expect(book.head.firstElementChild?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    expect(book.head.querySelectorAll('style')[0]).toBe(style)
  })
})
