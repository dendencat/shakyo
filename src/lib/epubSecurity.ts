import type Contents from 'epubjs/types/contents'

function isExternalUrl(value: string): boolean {
  return /^(?:(?:https?|javascript|data|blob|file):|\/\/)/i.test(value.trim())
}

/** iframeへ書き込む前の章DOMから能動コンテンツと外部遷移を除去し、CSPを先頭に置く。 */
export function secureEpubDocument(document: Document): void {
  const head = document.head ?? document.querySelector('head')
  if (head && !head.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
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
      if (unsafe) element.removeAttribute(name)
    }
  })
}

/** 表示後もリンク遷移とフォーム送信を同一・別realmの両方で防ぐ。 */
export function secureEpubContents(contents: Pick<Contents, 'document'>): void {
  const document = contents.document
  secureEpubDocument(document)
  document.addEventListener('click', event => {
    const eventTarget = event.target as { closest?: (selector: string) => Element | null } | null
    const target = typeof eventTarget?.closest === 'function' ? eventTarget.closest('a[href]') : null
    const href = target?.getAttribute('href')
    if (!href || !isExternalUrl(href)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
  document.addEventListener('submit', event => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}
