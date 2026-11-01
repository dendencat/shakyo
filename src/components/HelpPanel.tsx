import { useState } from 'react'
import { version } from '../../package.json'
import { openExternal } from '../lib/openExternal'
import { RELEASE_NOTES } from '../lib/changelog'
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
    <details open><summary>使い方</summary>
    <ol><li>ファイルのアイコンから、お手本のファイル・PDF・サンプルを選びます。貼り付けやWebページも利用できます。</li>
      <li>写経エディタに入力します。ファイルのサイドバーから保存・読み込みができます。</li>
      <li>コードの解説には、設定の歯車からOpenAI APIキーを登録してください。</li></ol>
    <p>SQLは基本SELECTからCTEまで6題の写経用サンプルを選べます。SQLの実行機能はありません。</p>
    </details>
    <details><summary>画面の操作</summary>
    <p>左のアイコンでサイドバーを開閉します。同じアイコンで閉じ、別のアイコンで切り替えます。Escapeでも閉じられます。テーマは太陽がライト、月がダークです。システム設定にも追従できます。</p>
    <p>レイアウトで配置を選び、適用すると保存されます。ペインの境界はドラッグまたは矢印キーで調整できます。</p>
    <p>テーマアイコンのメニューからライト・ダーク・システムを選べます。</p>
    <p>設定の「表示」でお手本・写経エディタ・解説の表示とコード文字サイズを変更できます。少なくとも1つのペインを表示します。文字サイズは10〜32px、初期値は14pxです。</p>
    <p>設定の「エディタ」でスペース／タブ、インデント幅、自動インデント、ノーマル・Vim・Emacs・VSCodeモードを選べます。インデント変更は以後の入力に適用されます。主要なキー操作は左の「ショートカット」で確認できます。エディタ操作中のEscapeはモードの操作を優先します。</p>
    <p>WebページのURL欄の横にあるフォルダはブックマーク、反時計回りの矢印は履歴です。URL欄を選ぶと履歴候補が開き、入力で絞り込めます。矢印キー・Enter・Escapeでも操作できます。候補の表示は設定の「Web参照」で無効にできます。無効にしても履歴の記録は続きます。</p>
    <p>設定は「保存」で反映されます。「キャンセル」で編集中の変更を破棄できます。</p>
    </details>
    <details><summary>サーバーは必要ですか？</summary>
    <p>デスクトップ配布版は単体で起動します。Node.jsや別途起動するバックエンドは不要です。ローカルのTauri処理が内蔵ブラウザを操作します。開発時だけViteの開発サーバーを使います。</p>
    <p>オフラインではローカルのお手本・写経・保存・同梱ヘルプが利用できます。Webページ・オンラインWiki・AI解説・通信する拡張はネット接続が必要です。</p>
    <p>Web版はiframeを利用するため、他サイト内の遷移先URLは取得できません。URL欄と戻る・進むはアプリから開いたURLを対象にします。デスクトップ版ではページ内の遷移先も表示します。</p>
    </details>
    <details><summary>拡張機能の導入・作成手順（同梱）</summary>
    <button className="link" onClick={() => void openExternal(EXTENSION_WIKI).catch(() => setError('Wikiを開けませんでした。同梱の導入手順をご利用ください。'))}>オンラインの導入Wikiを開く</button>
    {error && <p role="alert">{error}</p>}
    <SafeMarkdown>{bundledGuide}</SafeMarkdown></details>
    <details><summary>更新履歴</summary>
      {RELEASE_NOTES.map((release) => <details key={release.version} open={release.version === version}>
        <summary>v{release.version}</summary>
        <ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </details>)}
    </details>
  </section>
}
