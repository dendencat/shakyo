import { assertSafeEpubFile } from './referenceFile'

type ValidationRequest = MessageEvent<ArrayBuffer>
type ValidationResponse = { ok: true; data: ArrayBuffer } | { ok: false; error: string }

const scope = globalThis as unknown as {
  onmessage: ((event: ValidationRequest) => void) | null
  postMessage: (message: ValidationResponse, transfer?: Transferable[]) => void
}

scope.onmessage = event => {
  const data = event.data
  void assertSafeEpubFile(data).then(() => {
    scope.postMessage({ ok: true, data }, [data])
  }).catch((error: unknown) => {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'EPUBの安全性を確認できませんでした。',
    })
  })
}
