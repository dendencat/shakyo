import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { measureNativeBounds, nativeReference, nativeBrowserAction } from '../lib/nativeReference'

export function NativeWebReference({ url, obscured, onLocation }: { url: string; obscured: boolean; onLocation?: (url: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const hidden = useRef(obscured)
  hidden.current = obscured
  const desiredUrl = useRef(url)
  desiredUrl.current = url
  const synchronize = useRef<(() => void) | null>(null)
  const reportLocation = useRef(onLocation)
  reportLocation.current = onLocation

  const trackLocation = !!onLocation
  useEffect(() => {
    if (!trackLocation) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const location = await nativeBrowserAction('location')
        if (!stopped && location.requestedUrl === desiredUrl.current && location.url) reportLocation.current?.(location.url)
      } catch { /* Creation/closing errors are reported by the owning controller. */ }
      if (!stopped) timer = setTimeout(poll, 400)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [trackLocation])


  useLayoutEffect(() => {
    let stopped = false
    let failed = false
    let frame = 0
    let previous = ''
    let previousUrl = desiredUrl.current
    setError(null)
    const session = nativeReference.acquire((message) => {
      if (stopped || failed) return
      failed = true
      setError(message)
      session.update({ url: desiredUrl.current, bounds: null })
    })
    const sync = () => {
      if (previousUrl !== desiredUrl.current) {
        previousUrl = desiredUrl.current
        failed = false
        setError(null)
      }
      const blocked = hidden.current || document.hidden || !!document.querySelector('[role="dialog"], .modal-backdrop, .workspace-resize-overlay')
      const bounds = !failed && !blocked && host.current ? measureNativeBounds(host.current) : null
      const key = JSON.stringify([desiredUrl.current, bounds])
      if (key !== previous) {
        previous = key
        session.update({ url: desiredUrl.current, bounds })
      }

    }
    const animate = () => { sync(); frame = requestAnimationFrame(animate) }
    synchronize.current = sync
    animate()
    return () => {
      synchronize.current = null
      stopped = true
      cancelAnimationFrame(frame)
      session.release()
    }
  }, [attempt])

  useLayoutEffect(() => { synchronize.current?.() }, [url])

  return (
    <div className="web-frame native-web-reference" ref={host} aria-label="お手本ページ（内蔵Web表示）">
      {error && <div role="alert" className="native-web-error">
        <p className="error-text">{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>再試行</button>
      </div>}
    </div>
  )
}
