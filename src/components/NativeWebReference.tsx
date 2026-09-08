import { useLayoutEffect, useRef, useState } from 'react'
import { measureNativeBounds, nativeReference } from '../lib/nativeReference'

export function NativeWebReference({ url, obscured }: { url: string; obscured: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const hidden = useRef(obscured)
  hidden.current = obscured

  useLayoutEffect(() => {
    let stopped = false
    let failed = false
    let frame = 0
    let previous = ''
    setError(null)
    const session = nativeReference.acquire((message) => {
      if (stopped || failed) return
      failed = true
      setError(message)
      session.update({ url, bounds: null })
    })
    const sync = () => {
      const blocked = hidden.current || document.hidden || !!document.querySelector('[role="dialog"], .modal-backdrop, .workspace-resize-overlay')
      const bounds = !failed && !blocked && host.current ? measureNativeBounds(host.current) : null
      const key = JSON.stringify(bounds)
      if (key !== previous) {
        previous = key
        session.update({ url, bounds })
      }
      frame = requestAnimationFrame(sync)
    }
    sync()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      session.release()
    }
  }, [url, attempt])

  return (
    <div className="web-frame native-web-reference" ref={host} aria-label="お手本ページ（内蔵Web表示）">
      {error && <div role="alert" className="native-web-error">
        <p className="error-text">{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>再試行</button>
      </div>}
    </div>
  )
}
