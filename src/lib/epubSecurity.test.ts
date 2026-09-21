import { describe, expect, it, vi } from 'vitest'
import { secureEpubContents, secureEpubDocument } from './epubSecurity'

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
  })

  it('inserts the CSP element in the XHTML namespace', () => {
    const document = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><p>本文</p></body></html>',
      'application/xhtml+xml',
    )
    secureEpubDocument(document)
    expect(document.querySelector('meta')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
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
