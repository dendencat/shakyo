import type Contents from 'epubjs/types/contents'

function isExternalUrl(value: string): boolean {
  const compact = Array.from(value.trim()).filter(character => character.charCodeAt(0) > 0x20).join('')
  return compact.includes('\\') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(compact)
}

export function normalizeExternalBookLink(value: string): string | null {
  if (value.length > 4_096) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

/** iframeへ書き込む前の章DOMから能動コンテンツと外部遷移を除去し、CSPを先頭に置く。 */
export function secureEpubDocument(document: Document): void {
  let head: Element | null = document.head ?? document.querySelector('head')
  document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach(node => node.remove())
  if (!head && document.documentElement) {
    head = document.documentElement.namespaceURI
      ? document.createElementNS(document.documentElement.namespaceURI, 'head')
      : document.createElement('head')
    document.documentElement.prepend(head)
  }
  if (head) {
    const csp = head.namespaceURI
      ? document.createElementNS(head.namespaceURI, 'meta')
      : document.createElement('meta')
    csp.setAttribute('http-equiv', 'Content-Security-Policy')
    csp.setAttribute('content', "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'")
    head.prepend(csp)
  }
  document.querySelectorAll('script, iframe, object, embed, meta[http-equiv="refresh"]').forEach(node => node.remove())
  document.querySelectorAll('form').forEach(form => form.replaceWith(...Array.from(form.childNodes)))
  document.querySelectorAll<HTMLElement>('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || attribute.name === 'formaction') element.removeAttribute(attribute.name)
    }
  })
  document.querySelectorAll<HTMLElement>('[href], [src], [srcset], [poster], [data], [action], [xlink\\:href]').forEach(element => {
    for (const name of ['href', 'src', 'srcset', 'poster', 'data', 'action', 'xlink:href']) {
      const value = element.getAttribute(name)
      const unsafe = name === 'srcset'
        ? value?.split(',').some(candidate => isExternalUrl(candidate.trim().split(/\s+/)[0] ?? ''))
        : value != null && isExternalUrl(value)
      if (!unsafe) continue
      const tag = element.localName.toLowerCase()
      const safeOutboundLink = name === 'href' && (tag === 'a' || tag === 'area')
        && value != null && normalizeExternalBookLink(value) != null
      if (!safeOutboundLink) {
        element.removeAttribute(name)
        if (tag === 'img' && !element.getAttribute('alt')) {
          element.setAttribute('alt', '外部画像を安全のため表示していません')
        }
      }
    }
  })
  const externalCss = /(?:@import\s+(?:url\()?\s*['"]?\s*https?:|url\(\s*['"]?\s*(?:https?:)?\/\/)/i
  document.querySelectorAll<HTMLElement>('[style]').forEach(element => {
    if (externalCss.test(element.getAttribute('style') ?? '')) element.removeAttribute('style')
  })
  document.querySelectorAll('style').forEach(element => {
    if (externalCss.test(element.textContent ?? '')) element.remove()
  })
}

/** 表示後もリンク遷移とフォーム送信を同一・別realmの両方で防ぐ。 */
export function secureEpubContents(
  contents: Pick<Contents, 'document'>,
  onExternalLink?: (url: string) => void,
): void {
  const document = contents.document
  secureEpubDocument(document)
  document.addEventListener('click', event => {
    const eventTarget = event.target as { closest?: (selector: string) => Element | null } | null
    const target = typeof eventTarget?.closest === 'function' ? eventTarget.closest('a[href], area[href]') : null
    const href = target?.getAttribute('href')
    if (!href || !isExternalUrl(href)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const safeUrl = normalizeExternalBookLink(href)
    if (safeUrl) onExternalLink?.(safeUrl)
  }, true)
  document.addEventListener('submit', event => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}
