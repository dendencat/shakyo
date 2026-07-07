import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamExplanation } from './openai'

function sseStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index += 1
      } else {
        controller.close()
      }
    },
  })
}

function okResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200 })
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let result = ''
  for await (const delta of gen) {
    result += delta
  }
  return result
}

describe('streamExplanation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('複数チャンクのdeltaを結合して返す', async () => {
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"こん"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"にちは"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi.fn().mockResolvedValue(okResponse(stream))
    vi.stubGlobal('fetch', fetchMock)

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'const a = 1' }),
    )

    expect(result).toBe('こんにちは')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    )
  })

  it('チャンク境界でJSONが分断されても正しく結合してパースする', async () => {
    const full = 'data: {"choices":[{"delta":{"content":"分断テスト"}}]}\n\n'
    const splitAt = 20
    const stream = sseStreamFromChunks([
      full.slice(0, splitAt),
      full.slice(splitAt),
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)))

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    expect(result).toBe('分断テスト')
  })

  it('[DONE]以降のチャンクは無視して終了する', async () => {
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"前半"}}]}\n\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"後半(無視される)"}}]}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)))

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    expect(result).toBe('前半')
  })

  it('deltaを含まないchoiceは無視する', async () => {
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"内容"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)))

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    expect(result).toBe('内容')
  })

  it.each([
    [401, 'APIキーが無効です'],
    [404, '指定したモデルが見つかりません'],
    [429, '利用制限に達しました'],
  ])('HTTP %i の場合は対応するエラーメッセージを投げる', async (status, expectedSubstring) => {
    const response = new Response(JSON.stringify({ error: { message: 'boom' } }), { status })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(
      collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' })),
    ).rejects.toThrow(expectedSubstring)
  })

  it('未知のステータスコードの場合はステータスコードを含むメッセージを投げる', async () => {
    const response = new Response(null, { status: 500 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(
      collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' })),
    ).rejects.toThrow('HTTP 500')
  })

  it('JSON以外のエラーレスポンスでもステータスコードのみで案内する', async () => {
    const response = new Response('plain text error', { status: 500 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(
      collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' })),
    ).rejects.toThrow('HTTP 500')
  })

  it('AbortSignalによる中断でfetchにsignalが渡される', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBe(controller.signal)
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      collect(
        streamExplanation({
          apiKey: 'sk-test',
          model: 'gpt-5.4-mini',
          code: 'x',
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow('Aborted')
  })
})
