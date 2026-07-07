const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT =
  'あなたはプログラミング学習者に寄り添う丁寧な講師です。' +
  '写経(コードの書き写し学習)中の学習者から渡されたコードについて、' +
  '何をしているコードか、使われている構文・APIの意味、読み解くうえでのポイントを、' +
  '初学者にも分かる日本語で簡潔に解説してください。' +
  '見出し(##)・箇条書き・コードブロック(言語名付きフェンス)を使ったMarkdownで簡潔に構成してください。'

export async function* streamExplanation(options: {
  apiKey: string
  model: string
  code: string
  signal?: AbortSignal
}): AsyncGenerator<string> {
  const { apiKey, model, code, signal } = options

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
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
    const { done, value } = await reader.read()
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
