import type { PersistedState } from '../types'

const DB_NAME = 'euromillions-smart-filter'
const DB_VERSION = 1
const STORE_NAME = 'state'
const STATE_KEY = 'latest'

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const withStore = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
  const db = await openDb()
  try {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const result = await operation(store)

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })

    return result
  } finally {
    db.close()
  }
}

export const saveState = async (state: PersistedState): Promise<void> => {
  await withStore('readwrite', (store) =>
    new Promise<void>((resolve, reject) => {
      const req = store.put(state, STATE_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    }),
  )
}

export const loadState = async (): Promise<PersistedState | null> =>
  withStore('readonly', (store) =>
    new Promise<PersistedState | null>((resolve, reject) => {
      const req = store.get(STATE_KEY)
      req.onsuccess = () => {
        const value = req.result as PersistedState | undefined
        resolve(value ?? null)
      }
      req.onerror = () => reject(req.error)
    }),
  )

export const clearState = async (): Promise<void> => {
  await withStore('readwrite', (store) =>
    new Promise<void>((resolve, reject) => {
      const req = store.delete(STATE_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    }),
  )
}
