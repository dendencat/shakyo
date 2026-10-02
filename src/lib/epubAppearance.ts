const EPUB_DEFAULTS = 'html { color-scheme: light; color: #1a1a1a; background-color: #fff; }'

/** Give each EPUB iframe a readable canvas before the book's own styles are applied. */
export function applyEpubAppearance(document: Document): void {
  let head: Element | null = document.head ?? document.querySelector('head')
  if (!head && document.documentElement) {
    head = document.documentElement.namespaceURI
      ? document.createElementNS(document.documentElement.namespaceURI, 'head')
      : document.createElement('head')
    document.documentElement.prepend(head)
  }
  if (!head || head.querySelector('style[data-shakyo-epub-defaults]')) return

  const style = head.namespaceURI
    ? document.createElementNS(head.namespaceURI, 'style')
    : document.createElement('style')
  style.setAttribute('data-shakyo-epub-defaults', '')
  style.textContent = EPUB_DEFAULTS
  head.prepend(style)
}
