import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildExplanationMessages,
  resetUnsupportedModelsForTest,
  streamChat,
  streamExplanation,
} from './openai'

// unsupportedReasoningEffortModelsのメモ化はモジュールレベルの状態のため、テスト間で必ずリセットする
afterEach(() => {
  resetUnsupportedModelsForTest()
})

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
    vi.useRealTimers()
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

  it('AbortSignalによる中断でfetchに渡されたsignalが連動してabortされる', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      receivedSignal = init.signal ?? undefined
      // タイムアウト合成によりfetchに渡るsignalは呼び出し元signalそのものとは限らない(AbortSignal.anyで
      // 新規生成されるため)。ここでは「AbortSignalであること」「呼び出し元abortに連動すること」を検証する。
      expect(init.signal).toBeInstanceOf(AbortSignal)
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = collect(
      streamExplanation({
        apiKey: 'sk-test',
        model: 'gpt-5.4-mini',
        code: 'x',
        signal: controller.signal,
      }),
    )
    const assertion = expect(resultPromise).rejects.toThrow('Aborted')

    controller.abort()

    await assertion
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('fetchがTypeErrorでrejectされた場合はネットワークエラーメッセージを投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(
      collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' })),
    ).rejects.toThrow('ネットワークエラーが発生しました')
  })

  it('fetchが永遠にpendingの場合はconnectTimeoutMs経過で接続タイムアウトになる', async () => {
    vi.useFakeTimers()
    // 実際のfetchはsignalのabortでpending中のPromiseをAbortErrorでrejectする。挙動を模したモック。
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )
    // 先にrejects.toThrowでハンドラを登録してからタイマーを進める(unhandled rejection回避)
    const assertion = expect(resultPromise).rejects.toThrow('接続がタイムアウトしました')

    await vi.advanceTimersByTimeAsync(15_000)

    await assertion
  })

  it('1チャンク受信後read()が解決しないストリームはidleTimeoutMs経過で応答途絶になる', async () => {
    vi.useFakeTimers()
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    // 実際のfetchはsignalのabortでボディストリームをエラーにする。挙動を模したモック。
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () => {
        streamController.error(new DOMException('The operation was aborted.', 'AbortError'))
      })
      return Promise.resolve(okResponse(stream))
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    streamController!.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"内容"}}]}\n\n'))
    // 先にrejects.toThrowでハンドラを登録してからタイマーを進める(unhandled rejection回避)
    const assertion = expect(resultPromise).rejects.toThrow('応答が途絶えたため中断しました')

    await vi.advanceTimersByTimeAsync(60_000)

    await assertion
  })

  it('idleTimeoutMs未満の間隔でチャンクが届き続ければタイマーがリセットされ完走する', async () => {
    vi.useFakeTimers()
    const encoder = new TextEncoder()
    const gaps = [40_000, 40_000, 40_000]
    let index = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index < gaps.length) {
          await new Promise((resolve) => setTimeout(resolve, gaps[index]))
          controller.enqueue(
            encoder.encode(`data: {"choices":[{"delta":{"content":"c${index}"}}]}\n\n`),
          )
          index += 1
        } else {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)))

    const resultPromise = collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    for (const gap of gaps) {
      await vi.advanceTimersByTimeAsync(gap)
    }

    const result = await resultPromise
    expect(result).toBe('c0c1c2')
  })

  it('呼び出し元のAbortController.abort()はAbortErrorのまま伝播しタイムアウトメッセージにならない', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = collect(
      streamExplanation({
        apiKey: 'sk-test',
        model: 'gpt-5.4-mini',
        code: 'x',
        signal: controller.signal,
      }),
    )

    controller.abort()

    await expect(resultPromise).rejects.toThrow('Aborted')
    await expect(resultPromise).rejects.not.toThrow('タイムアウト')
  })

  it('正常完了後にタイマーが残らない', async () => {
    vi.useFakeTimers()
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"完走"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)))

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    expect(result).toBe('完走')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('chat messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('buildExplanationMessagesはsystemとコードを含むuserメッセージを返す', () => {
    const messages = buildExplanationMessages('const answer = 42')

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1]).toEqual(
      expect.objectContaining({ role: 'user', content: expect.stringContaining('const answer = 42') }),
    )
  })

  it('streamChatは指定したmessagesをrequest bodyに入れてチャンクを返す', async () => {
    const messages = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: 'question' },
    ]
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi.fn().mockResolvedValue(okResponse(stream))
    vi.stubGlobal('fetch', fetchMock)

    const result = await collect(
      streamChat({ apiKey: 'sk-test', model: 'gpt-5.4-mini', messages }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit

    expect(JSON.parse(init.body as string).messages).toEqual(messages)
    expect(result).toBe('回答')
  })
})

describe('reasoning_effort', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('デフォルトではreasoning_effort: minimalをrequest bodyに含める', async () => {
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi.fn().mockResolvedValue(okResponse(stream))
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }))
    const init = fetchMock.mock.calls[0][1] as RequestInit

    expect(JSON.parse(init.body as string).reasoning_effort).toBe('minimal')
  })

  it('reasoningEffortを指定するとrequest bodyに反映される', async () => {
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi.fn().mockResolvedValue(okResponse(stream))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      streamExplanation({
        apiKey: 'sk-test',
        model: 'gpt-5.4-mini',
        code: 'x',
        reasoningEffort: 'medium',
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit

    expect(JSON.parse(init.body as string).reasoning_effort).toBe('medium')
  })

  it('reasoning_effort非対応(400)の場合はパラメータなしで1回だけ自動リトライして成功する', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: { code: 'unsupported_parameter', param: 'reasoning_effort' } }),
      { status: 400 },
    )
    const stream = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(okResponse(stream))
    vi.stubGlobal('fetch', fetchMock)

    const result = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(JSON.parse(secondInit.body as string)).not.toHaveProperty('reasoning_effort')
    expect(result).toBe('回答')
  })

  it('非対応と判明したモデルは次回以降パラメータなしで最初から送信する(メモ化)', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: { code: 'unsupported_parameter', param: 'reasoning_effort' } }),
      { status: 400 },
    )
    const stream1 = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答1"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const stream2 = sseStreamFromChunks([
      'data: {"choices":[{"delta":{"content":"回答2"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(okResponse(stream1))
      .mockResolvedValueOnce(okResponse(stream2))
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const result2 = await collect(
      streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'y' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const thirdInit = fetchMock.mock.calls[2][1] as RequestInit
    expect(JSON.parse(thirdInit.body as string)).not.toHaveProperty('reasoning_effort')
    expect(result2).toBe('回答2')
  })

  it('reasoning_effort以外の理由による400はリトライせずエラーを投げる', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: { code: 'context_length_exceeded', message: '長すぎます' } }),
      { status: 400 },
    )
    const fetchMock = vi.fn().mockResolvedValue(errorResponse)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      collect(streamExplanation({ apiKey: 'sk-test', model: 'gpt-5.4-mini', code: 'x' })),
    ).rejects.toThrow('長すぎます')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
