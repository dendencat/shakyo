import type { InstalledExtension } from './model'

const DB_NAME = 'shakyo-extensions-v1'
const STORE = 'extensions'
let database: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE)
        ? request.transaction!.objectStore(STORE) : request.result.createObjectStore(STORE, { keyPath: 'instanceId' })
      if (!store.indexNames.contains('manifestId')) store.createIndex('manifestId', 'manifest.id', { unique: true })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = undefined }
      resolve(db)
    }
    request.onerror = () => { database = undefined; reject(new Error('拡張の保存領域を開けませんでした。')) }
  })
  return database
}
export interface ExtensionRepository {
  list(): Promise<InstalledExtension[]>
  get(id: string): Promise<InstalledExtension | undefined>
  replace(row: InstalledExtension): Promise<void>
  remove(id: string): Promise<void>
  modify(id: string, hash: string, change: (row: InstalledExtension) => void, requireEnabled?: boolean): Promise<void>
}
export const repository: ExtensionRepository = {
  async list() {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error('拡張一覧を取得できませんでした。'))
    })
  },
  async get(id) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error('拡張を取得できませんでした。'))
    })
  },
  async replace(row) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(row)
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(new Error('拡張を保存できませんでした。'))
    })
  },
  async remove(id) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(new Error('拡張を削除できませんでした。'))
    })
  },
  async modify(id, hash, change, requireEnabled = true) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let error: unknown
      const req = store.get(id)
      req.onsuccess = () => {
        try {
          const row = req.result as InstalledExtension | undefined
          if (!row || row.report.packageHash !== hash || (requireEnabled && !row.enabled)) throw new Error('拡張が停止または更新されています。')
          change(row)
          store.put(row)
        } catch (e) { error = e; tx.abort() }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(error ?? new Error('拡張のデータを保存できませんでした。'))
    })
  },
}
