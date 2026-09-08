import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core'
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync'
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url'
import { Sandbox } from './sandbox'

let sandbox: Sandbox | undefined
let started = false
self.onmessage = async event => {
  const msg = event.data
  try {
    if (msg.type === 'init' && !started) {
      started = true
      const module = await newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmLocation: wasmUrl }))
      sandbox = new Sandbox(module, msg.manifest, msg.files, value => self.postMessage(value))
      self.postMessage({ type: 'ready' })
    } else if (msg.type === 'run') sandbox?.dispatch(msg.id, msg.operation, msg.value)
    else if (msg.type === 'reply') sandbox?.deliver(msg.id, msg.ok, msg.value)
    else if (msg.type === 'event') sandbox?.event(msg.name, msg.value)
  } catch {
    // Do not leak source, arguments, or guest exception text into host logs/UI.
    self.postMessage({ type: 'fatal' })
    sandbox?.dispose()
    sandbox = undefined
  }
}
