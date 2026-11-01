// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extensionFetch } from './network'

afterEach(() => vi.unstubAllGlobals())
describe('network capability', () => {
  it.each(['https://evil.test/', 'http://api.test/', 'https://user:password@api.test/', 'https://api.test.evil/'])('rejects %s before sending', async url => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(extensionFetch({ url }, ['https://api.test'], new AbortController().signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('omits ambient credentials, rejects redirects, and returns bounded text', async () => {
    const fetch = vi.fn(async () => new Response('{"ok":true}'))
    vi.stubGlobal('fetch', fetch)
    const result = await extensionFetch({ url: 'https://api.test/data' }, ['https://api.test'], new AbortController().signal)
    expect(result.body).toBe('{"ok":true}')
    expect(fetch.mock.calls[0]).toEqual([new URL('https://api.test/data'), expect.objectContaining({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })])
  })
  it('does not permit arbitrary caller-specified credential headers', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(extensionFetch({ url: 'https://api.test/', headers: { Cookie: 'secret' } }, ['https://api.test'], new AbortController().signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('counts UTF-8 bytes in request bodies', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(extensionFetch({ url: 'https://api.test/', method: 'POST', body: 'あ'.repeat(400_000) }, ['https://api.test'], new AbortController().signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
