// A full device (src/save/room.ts): the save and the sign-in find room by giving up the archived corrupt copies, then
// the backups; backups of a big save stay within their budget; and supabase-js is handed a localStorage that takes
// its writes, not the memory fallback that left a player unable to sign in.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileGameData, newSave, type SaveData } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { AUTH_ROOM, authStorage, BACKUP_KEYS, CORRUPT_KEYS, makeAuthRoom, setWithRoom } from '@/save/room'
import {
  BACKUPS_BUDGET,
  backupSave,
  flushWrite,
  readBackups,
  readSave,
  SAVE_KEY,
  writeSave,
  writeSlot,
} from '@/save/storage'

/** localStorage with a quota in characters, keys and values counted as browsers do. */
function quotaStorage(quota: number): Storage {
  const m = new Map<string, string>()
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0)
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => {
      const value = String(v)
      if (used() - (m.has(k) ? k.length + m.get(k)!.length : 0) + k.length + value.length > quota)
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      m.set(k, value)
    },
  }
}

const QUOTA = 2_000_000
let ls: Storage
const data = compileGameData(BUNDLE)
let n = 0
const main = (): SaveData => newSave(4, data, 0, () => `m-${++n}`)
/** A save that weighs about `chars` characters stored. */
const big = (chars: number): SaveData => {
  const s = main()
  // A Pokémon's id is free text the save keeps as is: the padding survives readBackups' validation.
  return { ...s, box: [...s.box, { ...s.box[0]!, id: 'p'.repeat(chars) }] }
}

beforeEach(() => {
  ls = quotaStorage(QUOTA)
  ;(globalThis as { localStorage?: Storage }).localStorage = ls
  writeSlot('main')
})
afterEach(() => {
  flushWrite()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('setWithRoom', () => {
  it('writes as is when there is room, and touches nothing else', () => {
    ls.setItem(CORRUPT_KEYS.main, 'old')
    expect(setWithRoom('k', 'v')).toBe(true)
    expect(ls.getItem('k')).toBe('v')
    expect(ls.getItem(CORRUPT_KEYS.main)).toBe('old')
  })

  it('gives up the corrupt copies before the backups, and only what the write needs', () => {
    ls.setItem(CORRUPT_KEYS.main, 'c'.repeat(600_000))
    ls.setItem(BACKUP_KEYS.main, 'b'.repeat(600_000))
    ls.setItem('other', 'o'.repeat(600_000))
    expect(setWithRoom('k', 'v'.repeat(300_000))).toBe(true)
    expect(ls.getItem(CORRUPT_KEYS.main)).toBeNull()
    expect(ls.getItem(BACKUP_KEYS.main)).not.toBeNull()
    expect(ls.getItem('other')).not.toBeNull()
  })

  it('is false when nothing it may remove makes room, and leaves the other keys be', () => {
    ls.setItem('other', 'o'.repeat(QUOTA - 10))
    expect(setWithRoom('k', 'v'.repeat(100))).toBe(false)
    expect(ls.getItem('other')).not.toBeNull()
  })
})

describe('the sign-in on a full device', () => {
  /** The device of 2026-10-19: a big save, its backups, and no room left for anything. */
  function fill() {
    ls.setItem(SAVE_KEY, 's'.repeat(700_000))
    ls.setItem(BACKUP_KEYS.main, 'b'.repeat(QUOTA - 700_000 - SAVE_KEY.length - BACKUP_KEYS.main.length - 10))
  }

  it('a localStorage write as supabase-js tests it fails on the full device', () => {
    fill()
    expect(() => ls.setItem('lswt-test', 'lswt-test')).toThrow()
  })

  it('makeAuthRoom frees the backups so supabase-js finds localStorage writable, and keeps the save', () => {
    fill()
    expect(makeAuthRoom()).toBe(true)
    expect(ls.getItem(BACKUP_KEYS.main)).toBeNull()
    expect(ls.getItem(SAVE_KEY)).not.toBeNull()
    expect(ls.getItem('pokedice.room')).toBeNull()
    expect(() => ls.setItem('lswt-test', 'x'.repeat(AUTH_ROOM))).not.toThrow()
  })

  it("makeAuthRoom is false without localStorage, leaving supabase-js's own memory fallback", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage
    expect(makeAuthRoom()).toBe(false)
  })

  it("Auth's storage keeps the code verifier across the provider's page when the device fills up", () => {
    fill()
    authStorage.setItem('sb-ref-auth-token-code-verifier', 'verifier')
    expect(authStorage.getItem('sb-ref-auth-token-code-verifier')).toBe('verifier')
    authStorage.removeItem('sb-ref-auth-token-code-verifier')
    expect(authStorage.getItem('sb-ref-auth-token-code-verifier')).toBeNull()
  })
})

describe('the save and its backups', () => {
  it('a save write that does not fit gives up the backups, not the save', () => {
    ls.setItem(BACKUP_KEYS.main, 'b'.repeat(QUOTA - 200_000))
    writeSave(big(400_000))
    expect(readSave('main').save).not.toBeNull()
    expect(ls.getItem(BACKUP_KEYS.main)).toBeNull()
  })

  it('a small save keeps its 5 backups', () => {
    for (let i = 0; i < 7; i++) backupSave(main(), `r${i}`)
    expect(readBackups().map((b) => b.reason)).toEqual(['r6', 'r5', 'r4', 'r3', 'r2'])
  })

  it('a big save keeps only the backups within the budget, and always the newest', () => {
    const chars = Math.round(BACKUPS_BUDGET * 0.4)
    for (let i = 0; i < 4; i++) backupSave(big(chars), `r${i}`)
    expect(readBackups().map((b) => b.reason)).toEqual(['r3', 'r2'])
    backupSave(big(BACKUPS_BUDGET + 1), 'huge')
    expect(readBackups().map((b) => b.reason)).toEqual(['huge'])
  })
})
