# shakyo Extension API v1

一般機能を追加する拡張の受け口です。VS Code拡張とのバイナリ/API互換性はありません。ブラウザ版・Tauri版とも、手動で取り込んだJavaScriptを拡張ごとのWorker内のQuickJS WASMで実行します。サーバーやNode.jsは不要です。

## 導入する

1. 配布された `.shakyo-ext` またはZIPパッケージを端末に保存します。VS CodeのVSIXは利用できません。
2. 左端の「拡張機能」アイコンからパッケージを選択します。
3. 検査結果、要求権限、通信先を確認します。拒否項目がある場合は導入できません。
4. 内容に同意したらチェックを付け、「導入して有効化」を押します。
5. 「導入済み」に表示されたコマンドを押して実行します。

ネット接続なしでもローカルパッケージの導入と通信しない拡張の実行ができます。「?」のヘルプにはこの手順を同梱しています。


左端の四角形を組み合わせた「拡張機能」アイコンを押してサイドバーを開き、`.shakyo-ext` を選択し、検査結果・要求権限・通信先を確認して同意すると導入できます。検査中には拡張コードを実行しません。拒否項目があるパッケージは導入できません。同じIDの更新にも再検査・再同意と置換の確認が必要です。署名・発行者本人の確認は行っていないため、表示名やIDだけで作者を信用しないでください。

導入済み画面ではコマンドの実行、設定、有効化・無効化、削除ができます。通常はコマンド実行時に起動し、`activation: "startup"` の拡張はアプリ起動時にも起動します。同時実行は最大4拡張です。無効化はデータを保持し、削除はその拡張のパッケージ・設定・保存データを削除します。置換は保存データを引き継ぎ、設定は新しい宣言の初期値に戻します。

保存先はアプリのIndexedDBで、端末・ブラウザプロファイルごとに独立しています。スキャナーまたはポリシーのバージョンが変わった場合は自動起動せず、再取り込みが必要です。

## パッケージを作る

ZIPのルートに `extension.json` を置きます。対応ファイルはUTF-8の `.js` / `.json` / `.txt` / `.md` のみです。パスは英数字・`_`・`-`・`.` と区切り `/` を使い、絶対パス、空セグメント、`.` / `..`、シンボリックリンク、重複、ディレクトリエントリを含めないでください。生成スクリプトはディレクトリエントリを作りません。

```bash
npm run extensions:pack -- examples/extensions/text-tools /tmp/text-tools.shakyo-ext
```

出力ファイルが存在する場合は上書きしません。`examples/extensions/reference-data` は同梱お手本、`examples/extensions/network-data` はHTTPSからJSONを取得する例です。外部通信例は接続先の稼働・CORS設定に依存します。

```json
{
  "manifestVersion": 1,
  "apiVersion": 1,
  "id": "example.hello",
  "name": "こんにちは",
  "version": "1.0.0",
  "entry": "main.js",
  "activation": "command",
  "permissions": { "editor": [], "reference": [], "network": [] },
  "contributes": {
    "commands": [{ "id": "example.hello.run", "title": "挨拶する" }],
    "settings": {}
  }
}
```

```js
export function activate(context) {
  context.subscriptions.push(context.commands.register('example.hello.run', async () => {
    await context.ui.notify('こんにちは');
  }));
}
export function deactivate() {
  // 任意の短い後処理。停止時はホスト操作権限がすでに失効しています。
}
```

IDは小文字英数字とハイフンによる `publisher.name`、バージョンは `1.0.0` 形式です。コマンドIDには拡張IDと `.` の接頭辞が必要です。未対応の宣言項目は拒否します。パッケージ内の相対静的import/exportだけに対応し、外部import・動的importは拒否します。TypeScriptはあらかじめJavaScriptへ変換してください。Node.js・npm実行環境、DOM、タイマーはありません。

## APIと権限

型定義の正典は [`src/extensions/api.ts`](../src/extensions/api.ts) です。SDK操作はPromiseを返し、境界を越えるのはサイズ制限付きのJSONコピーだけです。

| API | 必要な権限・範囲 |
| --- | --- |
| `commands.register(id, handler)` | 自身の宣言済みコマンドのみ。Disposableを返す |
| `editor.getSnapshot()` / `onDidChange()` | `editor: ["read"]`。本文・言語・選択範囲・revision。イベントはrevisionのみ |
| `editor.applyEdits({ expectedRevision, edits })` | `editor: ["write"]`。UTF-16オフセットの `{ from, to, insert }` 配列。古いrevision・重複範囲は拒否、1回のUndoで戻せる |
| `reference.getCurrent()` / `onDidChange()` | `reference: ["read"]`。テキスト本文、またはPDF名/Web URLのみ。PDF本文・Web DOMは取得不可 |
| `reference.openText({ name, text, language? })` | `reference: ["write"]`。既存の写経を自動復元・置換せず、同名お手本の進捗にも保存しない。通常の下書き保存は継続 |
| `reference.openUrl(url)` | `reference: ["write"]`。HTTPSのみ、表示前にホストがユーザーへ確認。ページ表示であり通信APIの許可とは別 |
| `ui.notify/confirm/input/select` | ホスト描画の日本語UI。HTMLは実行しない。拡張名を表示、同時ダイアログは1個 |
| `settings.get(key)` / `onDidChange()` | 自身が宣言した設定のみ。変更はホストの管理画面から |
| `storage.get/set/delete` | 自身のインスタンス領域のみ。未設定はnull |
| `assets.readText/readJson(path)` | 自身の同梱ファイルのみ |
| `network.fetch({ url, method?, headers?, body? })` | `network` に列挙したHTTPS originとの完全一致。GET/POSTのみ、戻り値は `{ status, body }` |

設定宣言はキーごとに `{ title, type, default }`、typeは `string` / `number` / `boolean`。文字列には `enum` を指定できます。イベント購読もDisposableで解除できます。`subscriptions` は停止時にまとめて破棄されます。ホスト側にファイルシステム、シェル、Tauri呼び出し、本体設定やOpenAI APIキーの取得APIはありません。

## セキュリティ境界と限界

- ZIPの構造・パス・展開サイズ・形式、マニフェスト、全JSのASTを検査します。`eval` / `Function` やホストAPI利用の疑いは警告します。難読化や悪意を完全に検出する仕組みではなく、検査合格は安全性の保証ではありません。
- レポートはパッケージ全体のSHA-256と検査・ポリシーバージョンに紐付きます。導入時と読み込み時も再検査します。ハッシュは改変検出用で、発行者署名ではありません。
- 未信頼コードはブラウザの `eval` / `import` では実行せず、QuickJSの隔離されたJS環境だけで評価します。`fetch` / DOM / localStorage / IndexedDB / Tauri / Node.jsを直接利用できません。権限判定はゲスト申告IDでなく、ホストの実行セッションに結び付けます。
- 無効化・削除・更新は実行セッションを失効させ、通信と保留中UIを中止します。遅延した応答からのホスト操作も拒否します。後処理は最大500msで打ち切ります。
- 通信はCookieを送らず、リダイレクトを拒否し、CORSを迂回しません。指定可能ヘッダーはAccept / Content-Type / Authorizationのみで、本体の認証情報は補いません。localhost・代表的なプライベートIPリテラルは拒否しますが、DNS解決先を検証するSSRF対策ではありません。
- TauriとVite previewのCSPはWASM実行の `wasm-unsafe-eval` とHTTPS接続を許可します。任意JSの `unsafe-eval` は追加しません。個々の拡張の通信先制限はホストブローカーが担当します。静的ホスティングでCSPを設定する場合もWorker・WASMの読込を許可してください。
- エディタ読み取りと外部通信を同時に許可すると、拡張は写経内容をその通信先に送れます。権限は必要最小限にしてください。QuickJS/WASMやブラウザ自体の脆弱性まで防ぐ保証はありません。

主な上限: ZIP 5MiB、展開合計10MiB、1ファイル2MiB、100ファイル、検査15秒、VMメモリ64MiB、連続実行1秒、コマンド30秒、メッセージ100件/秒、同時RPC16件、専用保存領域1MiB、通信要求本文・応答各1MiB、通信10秒。対話待ちもコマンド制限に含まれます。メッセージのサイズ制限はJSONをUTF-8で表したときに2MiBです。上限超過・実行エラーでは停止または操作失敗となります。

署名検証、マーケットプレイス、自動更新、外部スキャナー、任意の拡張パネル、ネイティブ実行、AIプロバイダーの差し替えは今回の対象外です。

## 検証状況

2026-09-08: 309件のテスト、lint、Webビルド、`cargo check --locked --offline`、`npm run tauri build -- --debug --no-bundle` が成功。Chromiumで検査・同意・導入、文字変換とUndo、再読み込み後の保持、無効化、お手本追加、許可HTTPS先からのJSON取得と通知を確認しました。テストには不正パッケージ、検査タイムアウト、実際のQuickJS実行と無限ループ、権限外API拒否、停止後の保留操作破棄、保存の原子性、編集revision、お手本追加による下書きの意図しない復元防止を含みます。

Linux/WSLgのTauriアプリは起動と管理画面表示まで確認しましたが、ファイル選択のGUI自動操作を完了できず、ネイティブでの拡張実行は未確認です。Windows/macOSも未確認です。検証環境には日本語フォントがなく、表示の目視確認には制約がありました。配布前に各OSのWebviewでWASM実行・導入・停止・更新を確認してください。

2026-09-12（v2.1.0）: Linux/WebKitの配布Workerが循環importで起動状態を失う問題を修正。ネイティブ実アプリでもローカルパッケージの検査・同意・導入、text-toolsの起動・確認UI・大文字変換まで確認しました。WorkerのJS分割を行わないことを本番ビルド後に自動検証します。Windows/macOSの実機操作は引き続き未確認です。
