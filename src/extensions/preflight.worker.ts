import { inspectPackage } from './preflight'

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try { self.postMessage(await inspectPackage(event.data)) }
  catch { self.postMessage(null) }
}
