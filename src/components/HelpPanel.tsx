import { useState } from 'react'
import { version } from '../../package.json'
import { openExternal } from '../lib/openExternal'
import { SafeMarkdown } from './SafeMarkdown'
import guide from '../../docs/extensions.md?raw'

// Repository-relative links are documentation references, not app navigation.
const bundledGuide = guide.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

export const EXTENSION_WIKI = 'https://github.com/dendencat/shakyo/wiki/Extensions'
export function HelpPanel() {
  const [error, setError] = useState('')
  return <section className="sidebar-panel help-panel" aria-label="ヘルプ">
    <h2>ヘルプ</h2>
    <p>バージョン <strong>{version}</strong></p>
    <p>このヘルプと拡張機能の導入手順はアプリに同梱され、オフラインでも読めます。</p>
    <h3>使い方</h3>
    <ol><li>ファイルのアイコンから、お手本のファイル・PDF・サンプルを選びます。貼り付けやWebページも利用できます。</li>
      <li>写経エディタに入力します。ファイルのサイドバーから保存・読み込みができます。</li>
      <li>コードの解説には、設定の歯車からOpenAI APIキーを登録してください。</li></ol>
    <h3>画面の操作</h3>
    <p>左のアイコンでサイドバーを開閉します。同じアイコンで閉じ、別のアイコンで切り替えます。Escapeでも閉じられます。テーマは太陽がライト、月がダークです。システム設定にも追従できます。</p>
    <p>レイアウトで配置を選び、適用すると保存されます。ペインの境界はドラッグまたは矢印キーで調整できます。</p>
    <h3>サーバーは必要ですか？</h3>
    <p>デスクトップ配布版は単体で起動します。Node.jsや別途起動するバックエンドは不要です。ローカルのTauri処理が内蔵ブラウザを操作します。開発時だけViteの開発サーバーを使います。</p>
    <p>オフラインではローカルのお手本・写経・保存・同梱ヘルプが利用できます。Webページ・オンラインWiki・AI解説・通信する拡張はネット接続が必要です。</p>
    <p>Web版はiframeを利用するため、他サイト内の遷移先URLは取得できません。URL欄と戻る・進むはアプリから開いたURLを対象にします。デスクトップ版ではページ内の遷移先も表示します。</p>
    <button className="link" onClick={() => void openExternal(EXTENSION_WIKI).catch(() => setError('Wikiを開けませんでした。同梱の導入手順をご利用ください。'))}>オンラインの導入Wikiを開く</button>
    {error && <p role="alert">{error}</p>}
    <details><summary>拡張機能の導入・作成手順（同梱）</summary><SafeMarkdown>{bundledGuide}</SafeMarkdown></details>
  </section>
}
