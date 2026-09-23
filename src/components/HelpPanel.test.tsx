import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { HelpPanel } from './HelpPanel'

describe('HelpPanel', () => {
  it('使い方だけ初期表示で開き、すべての項目を折りたためる', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<HelpPanel />)
    const sections = Array.from(container.querySelectorAll('.help-panel > details'))
    expect(sections.map((section) => section.querySelector('summary')?.textContent)).toEqual([
      '使い方', '画面の操作', 'サーバーは必要ですか？', '拡張機能の導入・作成手順（同梱）', '更新履歴',
    ])
    expect(sections.map((section) => section.hasAttribute('open'))).toEqual([true, false, false, false, false])
  })

  it('全バージョンを新しい順に重複なく表示し、現在のバージョンを開く', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<HelpPanel />)
    const releases = Array.from(container.querySelectorAll('.help-panel > details:last-child > details'))
    expect(releases.map((release) => release.querySelector('summary')?.textContent)).toEqual([
      'v2.3.3', 'v2.3.2', 'v2.3.1', 'v2.3.0', 'v2.2.0', 'v2.1.0', 'v2.0.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0', 'v1.0.0',
    ])
    expect(releases.filter((release) => release.hasAttribute('open')).map((release) => release.querySelector('summary')?.textContent)).toEqual([`v${version}`])
    expect(container.textContent).toContain('オフライン')
    expect(container.textContent).toContain('SQLの実行機能はありません')
  })
})
