// Room on the device. localStorage holds about 5 MB per site, and a big save fills most of it: the save, its backups,
// an archived corrupt copy. Once a write no longer fits, supabase-js silently keeps the session in memory only: the
// player looks signed out on the next load, and no sign-in can finish, its PKCE code verifier lost on the way to the
// provider's page and back (2026-10-19: a 720 KB save with its 5 backups, 21 sign-ins in a row that never came back
// signed in). So what the game can do without goes first, and the save and the sign-in always find room.
// No imports: src/lib/supabase.ts uses this, and Node scripts reach that module.

/** Archived unreadable saves, one per save (docs/22). */
export const CORRUPT_KEYS = {
  main: 'pokedice.save.corrupt',
  extreme: 'pokedice.save.extreme.corrupt',
} as const
/** Saves replaced by a sync or a restore, one list per save. */
export const BACKUP_KEYS = {
  main: 'pokedice.save.backups',
  extreme: 'pokedice.save.extreme.backups',
} as const

/** What goes when the device is full, in this order: the unreadable copies before the backups a player could restore. */
const SPARE_KEYS = [CORRUPT_KEYS.extreme, CORRUPT_KEYS.main, BACKUP_KEYS.extreme, BACKUP_KEYS.main]

/** Room kept for Auth: its session is a few KB, a sign-in's code verifier a few bytes. Generous, as it is cheap. */
export const AUTH_ROOM = 32 * 1024

const PROBE_KEY = 'pokedice.room'

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function has(ls: Storage, key: string): boolean {
  try {
    return ls.getItem(key) !== null
  } catch {
    return false
  }
}

/**
 * Writes `value` under `key`, and when it doesn't fit, removes what the game can do without, one key at a time, until
 * it does. False when it never fits, or there is no storage at all.
 */
export function setWithRoom(key: string, value: string, ls: Storage | null = local()): boolean {
  if (!ls) return false
  const spare = SPARE_KEYS.filter((k) => k !== key)
  for (;;) {
    try {
      ls.setItem(key, value)
      return true
    } catch (err) {
      // Full, most likely (Chrome's QuotaExceededError, Firefox's NS_ERROR_DOM_QUOTA_REACHED): free the next one.
      const next = spare.find((k) => has(ls, k))
      if (!next) {
        console.warn('[save] device storage full', key, err)
        return false
      }
      spare.splice(spare.indexOf(next), 1)
      try {
        ls.removeItem(next)
        console.warn('[save] device storage full: removed', next)
      } catch {
        /* the next one, then */
      }
    }
  }
}

/**
 * Makes sure Auth's writes fit, before the Supabase client is made: supabase-js tests once whether localStorage takes a
 * write, and keeps the session in memory for the rest of the page when it doesn't. False when localStorage can't be
 * written at all (private modes, storage disabled), and then supabase-js's own memory fallback is left to it.
 */
export function makeAuthRoom(ls: Storage | null = local()): boolean {
  if (!ls || !setWithRoom(PROBE_KEY, 'x'.repeat(AUTH_ROOM), ls)) return false
  try {
    ls.removeItem(PROBE_KEY)
  } catch {
    /* a probe left behind is 32 KB; the next start overwrites it */
  }
  return true
}

/** Auth's storage: localStorage, making room for the session and a sign-in's verifier when the device is full. */
export const authStorage = {
  getItem(key: string): string | null {
    try {
      return local()?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    setWithRoom(key, value)
  },
  removeItem(key: string) {
    try {
      local()?.removeItem(key)
    } catch {
      /* gone with the storage */
    }
  },
}
