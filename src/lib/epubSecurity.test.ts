import { describe, expect, it, vi } from 'vitest'
import { normalizeExternalBookLink, secureEpubContents, secureEpubDocument } from './epubSecurity'

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
