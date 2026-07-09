const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000
const DEFAULT_IDLE_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT =
  'あなたはプログラミング学習者に寄り添う丁寧な講師です。' +
  '写経(コードの書き写し学習)中の学習者から渡されたコードについて、' +
  '何をしているコードか、使われている構文・APIの意味、読み解くうえでのポイントを、' +
  '初学者にも分かる日本語で簡潔に解説してください。' +
  '見出し(##)・箇条書き・コードブロック(言語名付きフェンス)を使ったMarkdownで簡潔に構成してください。'

type TimeoutKind = 'connect' | 'idle' | null

export async function* streamExplanation(options: {
  apiKey: string
  model: string
  code: string
  signal?: AbortSignal
  connectTimeoutMs?: number
  idleTimeoutMs?: number
}): AsyncGenerator<string> {
  const {
    apiKey,
    model,
    code,
    signal,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  } = options

  const timeoutCtrl = new AbortController()
  let timeoutKind: TimeoutKind = null
  const { signal: fetchSignal, cleanup: cleanupSignal } = combineSignals(signal, timeoutCtrl)

  // 接続タイマー: fetchがヘッダを受け取る(=Responseが解決する)までの上限
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  // アイドルタイマー: read()呼び出しごとに張り直すチャンク間無応答の上限
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  try {
    connectTimer = setTimeout(() => {
      timeoutKind = 'connect'
      timeoutCtrl.abort()
    }, connectTimeoutMs)

    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: fetchSignal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `次のコードを解説してください。\n\n\`\`\`\n${code}\n\`\`\`` },
          ],
        }),
      })
    } catch (err) {
      throw translateStreamError(err, { signal, timeoutKind, connectTimeoutMs, idleTimeoutMs })
    } finally {
      clearTimeout(connectTimer)
    }

    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
    if (!res.body) {
      throw new Error('APIから応答ストリームを受け取れませんでした。')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      idleTimer = setTimeout(() => {
        timeoutKind = 'idle'
        timeoutCtrl.abort()
      }, idleTimeoutMs)

      let done: boolean
      let value: Uint8Array | undefined
      try {
        ;({ done, value } = await reader.read())
      } catch (err) {
        throw translateStreamError(err, { signal, timeoutKind, connectTimeoutMs, idleTimeoutMs })
      } finally {
        clearTimeout(idleTimer)
      }

      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const data = line.trim()
        if (!data.startsWith('data:')) continue
        const payload = data.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload)
          const delta: string | undefined = json.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch {
          // 不完全なJSON断片は無視する(次のチャンクで完結する)
        }
      }
    }
  } finally {
    // 早期break/例外いずれの経路でもタイマーとリスナーを必ず解放する
    clearTimeout(connectTimer)
    clearTimeout(idleTimer)
    cleanupSignal()
  }
}

/**
 * 呼び出し元signalと内部タイムアウト用AbortControllerを合成し、fetchに渡す単一のsignalを作る。
 * AbortSignal.any未対応環境では、呼び出し元signalのabortをtimeoutCtrlへ手動で伝播する。
 */
function combineSignals(
  external: AbortSignal | undefined,
  timeoutCtrl: AbortController,
): { signal: AbortSignal; cleanup: () => void } {
  if (!external) {
    return { signal: timeoutCtrl.signal, cleanup: () => {} }
  }
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any([external, timeoutCtrl.signal]), cleanup: () => {} }
  }
  const onAbort = () => timeoutCtrl.abort()
  external.addEventListener('abort', onAbort)
  return {
    signal: timeoutCtrl.signal,
    cleanup: () => external.removeEventListener('abort', onAbort),
  }
}

/**
 * fetch/reader.read()の失敗を日本語メッセージへ変換する。
 * 呼び出し元signalによる中断はそのまま呼び出し元へ伝える(既存のaborted判定による握り潰しを壊さないため)。
 */
function translateStreamError(
  err: unknown,
  ctx: {
    signal: AbortSignal | undefined
    timeoutKind: TimeoutKind
    connectTimeoutMs: number
    idleTimeoutMs: number
  },
): unknown {
  if (ctx.signal?.aborted) {
    return err
  }
  if (ctx.timeoutKind === 'connect') {
    return new Error(
      `接続がタイムアウトしました(${ctx.connectTimeoutMs / 1000}秒)。ネットワーク状況を確認して再試行してください。`,
    )
  }
  if (ctx.timeoutKind === 'idle') {
    return new Error(
      `応答が途絶えたため中断しました(${ctx.idleTimeoutMs / 1000}秒間データを受信できませんでした)。再試行してください。`,
    )
  }
  if (err instanceof TypeError) {
    return new Error('ネットワークエラーが発生しました。インターネット接続を確認して再試行してください。')
  }
  return err
}

async function errorMessage(res: Response): Promise<string> {
  let apiMessage = ''
  try {
    const body = await res.json()
    apiMessage = body?.error?.message ?? ''
  } catch {
    // JSONでないエラーレスポンスはステータスコードのみで案内する
  }
  const suffix = apiMessage ? `(${apiMessage})` : ''
  switch (res.status) {
    case 401:
      return `APIキーが無効です。設定画面でOpenAI APIキーを確認してください。${suffix}`
    case 404:
      return `指定したモデルが見つかりません。設定画面でモデル名を確認してください。${suffix}`
    case 429:
      return `利用制限に達しました。しばらく待ってから再試行してください。${suffix}`
    default:
      return `OpenAI APIエラー(HTTP ${res.status})${suffix}`
  }
}
