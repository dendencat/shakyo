export type NativeBounds = { x: number; y: number; width: number; height: number }
export type NativeReferenceState = { url: string | null; bounds: NativeBounds | null }
type Transport = (state: NativeReferenceState) => Promise<void>

// One queue shared across mounts: StrictMode cleanup or an old URL must never
// close a newer view. Coalesce intermediate resize/URL requests while IPC runs.
export function createNativeReferenceController(send: Transport) {
  let owner = 0
  let revision = 0
  let running = false
  let desired: NativeReferenceState = { url: null, bounds: null }
  let onError: ((message: string) => void) | undefined

  const flush = async () => {
    if (running) return
    running = true
    let sent: number
    do {
      sent = revision
      try {
        await send(desired)
      } catch (error) {
        if (sent === revision) onError?.(typeof error === 'string' ? error : '内蔵Web表示を更新できませんでした。再試行してください。')
      }
    } while (sent !== revision)
    running = false
  }

  return {
    acquire(error: (message: string) => void) {
      const id = ++owner
      onError = error
      return {
        update(state: NativeReferenceState) {
          if (id !== owner) return
          desired = state
          revision++
          void flush()
        },
        release() {
          if (id !== owner) return
          onError = undefined
          desired = { url: null, bounds: null }
          revision++
          void flush()
        },
      }
    },
  }
}

export const nativeReference = createNativeReferenceController(async (state) => {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('sync_reference_webview', state)
})

// Native child bounds use physical pixels, whereas DOMRect uses CSS pixels.
// devicePixelRatio includes desktop page zoom; visualViewport.scale covers pinch zoom.
export function measureNativeBounds(element: HTMLElement): NativeBounds | null {
  const viewport = window.visualViewport
  const offsetX = viewport?.offsetLeft ?? 0
  const offsetY = viewport?.offsetTop ?? 0
  const rect = element.getBoundingClientRect()
  let left = Math.max(rect.left, offsetX)
  let top = Math.max(rect.top, offsetY)
  let right = Math.min(rect.right, offsetX + (viewport?.width ?? window.innerWidth))
  let bottom = Math.min(rect.bottom, offsetY + (viewport?.height ?? window.innerHeight))
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return null
    if (node === element) continue
    const clip = node.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, clip.left + node.clientLeft)
      right = Math.min(right, clip.left + node.clientLeft + node.clientWidth)
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, clip.top + node.clientTop)
      bottom = Math.min(bottom, clip.top + node.clientTop + node.clientHeight)
    }
  }
  const scale = window.devicePixelRatio * (viewport?.scale ?? 1)
  if (!Number.isFinite(scale) || scale <= 0 || right - left < 1 || bottom - top < 1) return null
  return { x: Math.round((left - offsetX) * scale), y: Math.round((top - offsetY) * scale), width: Math.round((right - left) * scale), height: Math.round((bottom - top) * scale) }
}
