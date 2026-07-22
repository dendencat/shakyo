// 外部URLを開く抽象化。Tauri(デスクトップ)ではOS既定ブラウザ、WebではWindow.openを使う。
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    // 動的import: Webビルドでは読み込まれない遅延チャンクになる
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}
