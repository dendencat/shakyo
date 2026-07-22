// テーマ初期化: Reactマウント前にdata-themeを設定してFOUCを防ぐ(TauriのCSPでscript-src 'self'を維持するため外部ファイル化)
(function () {
  try {
    var pref = localStorage.getItem('shakyo.theme')
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var dark = pref === 'dark' || (pref !== 'light' && prefersDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch {
    document.documentElement.dataset.theme = 'light'
  }
})()
