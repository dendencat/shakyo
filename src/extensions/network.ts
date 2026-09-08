import { LIMITS, httpsUrl, record } from './model'

export async function extensionFetch(value: unknown, origins: string[], signal: AbortSignal) {
  if (!record(value) || typeof value.url !== 'string') throw new Error('通信要求が正しくありません。')
  const url = httpsUrl(value.url)
  if (!origins.includes(url.origin)) throw new Error('この通信先は許可されていません。')
  if (value.method !== undefined && value.method !== 'GET' && value.method !== 'POST') throw new Error('未対応のHTTPメソッドです。')
  if (value.body !== undefined && (typeof value.body !== 'string' || new TextEncoder().encode(value.body).length > LIMITS.storage)) throw new Error('送信データが上限を超えています。')
  const headers = new Headers()
  if (value.headers !== undefined) {
    if (!record(value.headers) || Object.keys(value.headers).length > 20) throw new Error('ヘッダーが正しくありません。')
    for (const [name, item] of Object.entries(value.headers)) {
      if (typeof item !== 'string' || item.length > 8192 || !['accept', 'content-type', 'authorization'].includes(name.toLowerCase())) throw new Error('未対応のヘッダーです。')
      headers.set(name, item)
    }
  }
  const abort = new AbortController()
  const cancel = () => abort.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) abort.abort()
  const timer = setTimeout(cancel, LIMITS.networkMs)
  try {
    const response = await fetch(url, {
      method: value.method as 'GET' | 'POST' | undefined, headers, body: value.body as string | undefined,
      signal: abort.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
    })
    const reader = response.body?.getReader()
    if (!reader) return { status: response.status, body: '' }
    const decoder = new TextDecoder()
    let bytes = 0
    let body = ''
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.length
        if (bytes > LIMITS.storage) throw new Error('応答が1MiBを超えています。')
        body += decoder.decode(part.value, { stream: true })
      }
      body += decoder.decode()
    } finally { await reader.cancel().catch(() => {}) }
    return { status: response.status, body }
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
}
