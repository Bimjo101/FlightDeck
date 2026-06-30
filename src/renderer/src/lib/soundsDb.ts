// Persistent in-browser sound library — IndexedDB, survives page refresh
const DB_NAME = 'flightdeck_sounds'
const STORE = 'sounds'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface AppSound {
  name: string        // filename without .wav, max 8 chars
  wav: ArrayBuffer
  savedAt: number
}

export async function saveAppSound(name: string, wav: ArrayBuffer): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ name, wav, savedAt: Date.now() })
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function listAppSounds(): Promise<AppSound[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => { db.close(); resolve((req.result as AppSound[]).sort((a, b) => a.name.localeCompare(b.name))) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getAppSound(name: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(name)
    req.onsuccess = () => { db.close(); resolve(req.result?.wav ?? null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function deleteAppSound(name: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(name)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
