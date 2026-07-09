// PDFビューアのレイアウト計算(純関数)。DOM/pdf.jsに依存しないためテスト容易性を優先して分離している。

/**
 * コンテナ幅とページの基準幅(scale=1でのビューポート幅)から、表示に使うscaleを算出する。
 * 左右12pxずつ(計24px)のパディングを控除し、最小でも0.5倍は確保する。
 */
export function fitScale(containerWidth: number, baseWidth: number): number {
  if (containerWidth <= 0 || baseWidth <= 0) return 0.5
  return Math.max(0.5, (containerWidth - 24) / baseWidth)
}

/**
 * ページの基準寸法(scale=1)とscaleから、プレースホルダに使うCSS上の表示寸法を算出する。
 */
export function pageCssSize(
  base: { width: number; height: number },
  scale: number,
): { width: number; height: number } {
  return { width: base.width * scale, height: base.height * scale }
}
