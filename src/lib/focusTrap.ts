// 注: :not() を用いたグループ化セレクタは一部のDOM実装(jsdom等)で
// 文書順を保証しないことがあるため、広めのセレクタで取得してからJS側で絞り込む。
const CANDIDATE_SELECTOR = ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]'].join(', ')

function isDisabled(el: HTMLElement): boolean {
  return 'disabled' in el && (el as HTMLButtonElement | HTMLInputElement).disabled
}

function isExcludedTabIndex(el: HTMLElement): boolean {
  return el.hasAttribute('tabindex') && el.getAttribute('tabindex') === '-1'
}

export function collectFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR)).filter(
    (el) => !isDisabled(el) && !isExcludedTabIndex(el),
  )
}

export function nextFocusTarget(
  elements: HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  if (elements.length === 0) return null

  const activeIndex = active ? elements.indexOf(active as HTMLElement) : -1

  if (shiftKey) {
    if (activeIndex <= 0) return elements[elements.length - 1]
    return elements[activeIndex - 1]
  }

  if (activeIndex === -1 || activeIndex === elements.length - 1) return elements[0]
  return elements[activeIndex + 1]
}
