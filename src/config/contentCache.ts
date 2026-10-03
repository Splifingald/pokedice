// The content downloaded from Supabase, kept in IndexedDB under its configVersion. While the live content is ahead of
// the build (an admin edit not yet pulled into src/data), each player downloads it once per version instead of on every
// visit. Any failure (private mode, quota, no IndexedDB) just means downloading again.
import type { BundleRaw } from '@/engine/types'

const DB_NAME = 'pokedice'
const STORE = 'content'
const KEY = 'remote'

interface Cached {
  version: number
  bundle: BundleRaw
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** The cached content, only when it is this version's. */
export async function readCachedContent(version: number): Promise<BundleRaw | null> {
  const db = await openDb()
  if (!db) return null
  const hit = await new Promise<Cached | undefined>((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result as Cached | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
  db.close()
  return hit && hit.version === version ? hit.bundle : null
}

/** Keeps one version: the new one replaces the last. */
export async function writeCachedContent(version: number, bundle: BundleRaw): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ version, bundle } satisfies Cached, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}
