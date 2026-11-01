# shakyoアイコン

`shakyo-icon.png` はv2.0.0のマスター画像です。筆でコードの `{}` を書いているモチーフを、組み込みimage_genで生成しました。

最終編集プロンプト:

> Preserve the two black ink curly braces {} and Japanese brush writing the right brace. Make the background fully opaque warm ivory, NOT transparent. Reduce and reposition the entire artwork so the complete brush handle including its top end and both braces fit within the square canvas with at least 10 percent safe margin on all sides. Simplify fine texture for small-size clarity. Square app icon, no text other than {}, no shadow outside the canvas.

各サイズは `npm run tauri icon -- assets/shakyo-icon.png -o <出力ディレクトリ>` で生成できます。デスクトップ対象のPNG/ICO/ICNSを `src-tauri/icons/` に置き、32px PNGとICOを `public/favicon.png` / `public/favicon.ico` にコピーしています。faviconは `index.html` で参照します。モバイル生成物は配布対象外です。
