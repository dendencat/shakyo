import { useEffect, useRef, useState } from 'react'
import { collectFocusable, nextFocusTarget } from './focusTrap'

export function useFocusTrap<T extends HTMLElement>(onClose: () => void, enabled = true): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // レンダーフェーズ(コミット前)で捕捉する。autoFocus付き要素はReactの
  // コミット中にフォーカスされるため、useEffect内で取得すると手遅れになる。
  const [previouslyFocused] = useState(() => document.activeElement)

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    if (!container.contains(document.activeElement)) {
      collectFocusable(container)[0]?.focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        const elements = collectFocusable(container)
        const target = nextFocusTarget(elements, document.activeElement, e.shiftKey)
        if (target) {
          e.preventDefault()
          target.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [previouslyFocused, enabled])

  return containerRef
}
