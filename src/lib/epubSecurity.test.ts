import { describe, expect, it, vi } from 'vitest'
import { findInternalBookDocument, normalizeExternalBookLink, resolveInternalBookLink, secureEpubContents, secureEpubDocument, secureEpubSerializedHtml } from './epubSecurity'

describe('secureEpubContents', () => {
  it('adds a restrictive CSP and removes active content and event handlers', () => {
    const document = new DOMParser().parseFromString(
      '<html><head><meta http-equiv="refresh" content="0;url=https://bad.test"></head><body>'
      + '<script>alert(1)</script><iframe src="about:blank"></iframe><form><button onclick="bad()">送信</button></form>'
      + '</body></html>',
      'text/html',
    )
    secureEpubContents({ document })
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("connect-src 'none'")
    expect(document.querySelector('script, iframe, form, meta[http-equiv="refresh"]')).toBeNull()
    expect(document.querySelector('button')?.hasAttribute('onclick')).toBe(false)
  })

  it('sanitizes active content and encoded external resources before iframe serialization', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><script>bad()</script><img src="&#x68;ttps://outside.test/pixel"><a href="javascript:bad()">外部</a></body></html>',
      'text/html',
    )
    secureEpubDocument(document)
    const serialized = new XMLSerializer().serializeToString(document)
    expect(serialized).toContain('Content-Security-Policy')
    expect(serialized).not.toContain('<script')
    expect(serialized).not.toContain('outside.test')
    expect(serialized).not.toContain('javascript:')
    expect(document.querySelector('img')?.getAttribute('alt')).toContain('外部画像')
  })

  it('keeps only safe HTTPS outbound links and reports clicks to the host', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><a id="safe" href="https://gihyo.jp/book">技術書</a>'
      + '<a id="http" href="http://outside.test">HTTP</a><a id="credentials" href="https://user:pass@outside.test">credentials</a>'
      + '<a id="obfuscated" href="java&#10;script:alert(1)">script</a></body></html>',
      'text/html',
    )
    const onExternalLink = vi.fn()
    secureEpubContents({ document }, onExternalLink)
    expect(document.querySelector('#safe')?.getAttribute('href')).toBe('https://gihyo.jp/book')
    expect(document.querySelector('#http')?.hasAttribute('href')).toBe(false)
    expect(document.querySelector('#credentials')?.hasAttribute('href')).toBe(false)
    expect(document.querySelector('#obfuscated')?.hasAttribute('href')).toBe(false)
    document.querySelector('#safe')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onExternalLink).toHaveBeenCalledWith('https://gihyo.jp/book')
    expect(normalizeExternalBookLink('javascript:alert(1)')).toBeNull()
  })

  it('removes styles that would load remote resources', () => {
    const document = new DOMParser().parseFromString(
      '<html><head><style>@import "https://outside.test/style.css";</style></head>'
      + '<body><p style="background:url(https://outside.test/pixel)">本文</p></body></html>',
      'text/html',
    )
    secureEpubDocument(document)
    expect(document.querySelector('style')).toBeNull()
    expect(document.querySelector('p')?.hasAttribute('style')).toBe(false)
  })

  it('keeps embedded images, code formatting, and generated book styles', () => {
    const document = new DOMParser().parseFromString(
      '<html><head><link rel="stylesheet" href="blob:https://book.test/style"></head>'
      + '<body><h1>章</h1><pre><code>const answer = 42</code></pre>'
      + '<img src="blob:https://book.test/image" alt="図"></body></html>', 'text/html',
    )
    secureEpubContents({ document })
    expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('blob:https://book.test/style')
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:https://book.test/image')
    expect(document.querySelector('h1')?.textContent).toBe('章')
    expect(document.querySelector('pre code')?.textContent).toContain('answer')
  })

  it('hands relative and fragment links to the reader before browser navigation', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><a href="chapter2.xhtml#example">次章</a><a href="#code">コード</a></body></html>', 'text/html',
    )
    const onInternalLink = vi.fn()
    secureEpubContents({ document }, undefined, onInternalLink)
    for (const anchor of document.querySelectorAll('a')) {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      anchor.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
    }
    expect(onInternalLink.mock.calls.map(call => call[0])).toEqual(['chapter2.xhtml#example', '#code'])
  })

  it('resolves a non-spine footnote only through an internal XHTML manifest entry', () => {
    const target = resolveInternalBookLink('OEBPS/Text/chapter.xhtml', 'notes.xhtml#note-1')
    expect(target).toEqual({ path: 'OEBPS/Text/notes.xhtml', fragment: '#note-1' })
    const manifest = {
      notes: { href: 'Text/notes.xhtml', type: 'application/xhtml+xml' },
      image: { href: 'Text/notes.xhtml', type: 'image/png' },
    }
    expect(findInternalBookDocument(manifest, target!.path, href => `/OEBPS/${href}`)).toBe('Text/notes.xhtml')
    expect(resolveInternalBookLink('OEBPS/Text/chapter.xhtml', 'https://outside.test/notes.xhtml')).toBeNull()
    expect(findInternalBookDocument(manifest, 'OEBPS/Text/missing.xhtml', href => `/OEBPS/${href}`)).toBeNull()
  })

  it('inserts the CSP element in the XHTML namespace', () => {
    const document = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><p>本文</p></body></html>',
      'application/xhtml+xml',
    )
    secureEpubDocument(document)
    expect(document.querySelector('meta')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
  })

  it('replaces document-supplied CSP with the restrictive application policy', () => {
    const document = new DOMParser().parseFromString(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body></body></html>',
      'text/html',
    )
    secureEpubDocument(document)
    const policies = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
    expect(policies).toHaveLength(1)
    expect(policies[0].getAttribute('content')).toContain("default-src 'none'")
  })

  it('restores CSP after epub.js asset substitutions rewrite directive names', () => {
    const source = new DOMParser().parseFromString(
      '<html><head></head><body><img src="default-src"><link rel="stylesheet" href="style-src"></body></html>',
      'text/html',
    )
    secureEpubDocument(source)
    const serialized = new XMLSerializer().serializeToString(source)
    const substituted = serialized.replaceAll('default-src', 'data:').replaceAll('style-src', 'blob:')
    const finalHtml = secureEpubSerializedHtml(substituted)
    const finalDocument = new DOMParser().parseFromString(finalHtml, 'text/html')
    const policy = finalDocument.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("style-src 'unsafe-inline' blob: data:")
    expect(finalDocument.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1)
    expect(finalHtml.indexOf('Content-Security-Policy')).toBeLessThan(finalHtml.indexOf('<body'))
  })

  it('removes backslash-prefixed links before browser URL canonicalization', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><map><area id="external" href="\\\\outside.test/path"></map></body></html>',
      'text/html',
    )
    secureEpubContents({ document })
    expect(document.querySelector('#external')?.hasAttribute('href')).toBe(false)
  })

  it('blocks external navigation and form submission without blocking internal links', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><a id="external" href="https://outside.test">外部</a><a id="internal" href="#chapter">内部</a></body></html>',
      'text/html',
    )
    secureEpubContents({ document })
    // 表示後に別処理が外部hrefを足しても、capture listenerで遷移を止める。
    document.querySelector('#external')?.setAttribute('href', 'https://outside.test')
    const external = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('#external')?.dispatchEvent(external)
    expect(external.defaultPrevented).toBe(true)
    const internal = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('#internal')?.dispatchEvent(internal)
    expect(internal.defaultPrevented).toBe(false)

    const form = document.createElement('form')
    document.body.append(form)
    const submit = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
  })

  it('stops external click listeners before they can navigate', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><a id="external" href="//outside.test">外部</a></body></html>',
      'text/html',
    )
    const listener = vi.fn()
    document.querySelector('#external')?.addEventListener('click', listener)
    secureEpubContents({ document })
    document.querySelector('#external')?.setAttribute('href', '//outside.test')
    document.querySelector('#external')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(listener).not.toHaveBeenCalled()
  })
})
