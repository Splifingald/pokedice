// Extreme mode's two saves on the device (docs/22): each written under its own key whatever the slot says, a write
// asked for before a switch can't land on the other save, backups kept apart, and deleting one save leaves the other.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileGameData, newSave, type SaveData } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import {
  backupSave,
  flushWrite,
  readBackups,
  readSave,
  scheduleWrite,
  SETTINGS_KEY,
  SLOT_KEY,
  wipePlayerData,
  wipeSlot,
  writeSave,
  writeSlot,
} from '@/save/storage'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

const data = compileGameData(BUNDLE)
let n = 0
const main = (): SaveData => newSave(4, data, 0, () => `m-${++n}`)
const extreme = (): SaveData => ({ ...newSave(7, data, 0, () => `x-${++n}`), mode: 'extreme' })

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
  writeSlot('main')
})
afterEach(() => {
  flushWrite()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('two saves on the device', () => {
  it('each save is written under its own key, whichever slot is played', () => {
    writeSave(extreme())
    writeSave(main())
    expect(readSave('extreme').save?.box[0]?.dex).toBe(7)
    expect(readSave('main').save?.box[0]?.dex).toBe(4)
  })

  it('a write asked for before a switch still goes to its own save', () => {
    scheduleWrite(extreme())
    writeSlot('main')
    flushWrite()
    expect(readSave('main').save).toBeNull()
    expect(readSave('extreme').save?.mode).toBe('extreme')

    writeSlot('extreme')
    expect(localStorage.getItem(SLOT_KEY)).toBe('extreme')
    scheduleWrite(main())
    writeSlot('main')
    expect(readSave('main').save?.box[0]?.dex).toBe(4)
    expect(readSave('extreme').save?.box[0]?.dex).toBe(7)
    expect(localStorage.getItem(SLOT_KEY)).toBeNull()
  })

  it('keeps each save its own backups', () => {
    backupSave(extreme(), 'x')
    backupSave(main(), 'm')
    expect(readBackups('extreme').map((b) => b.reason)).toEqual(['x'])
    expect(readBackups('main').map((b) => b.reason)).toEqual(['m'])
  })

  it('Delete my Extreme save takes that one; Delete all my data takes both and keeps the settings', () => {
    writeSave(main())
    writeSave(extreme())
    backupSave(extreme(), 'x')
    localStorage.setItem(SETTINGS_KEY, '{}')
    wipeSlot('extreme')
    expect(readSave('extreme').save).toBeNull()
    expect(readBackups('extreme')).toEqual([])
    expect(readSave('main').save).not.toBeNull()

    writeSave(extreme())
    writeSlot('extreme')
    wipePlayerData()
    expect(readSave('main').save).toBeNull()
    expect(readSave('extreme').save).toBeNull()
    expect(localStorage.getItem(SLOT_KEY)).toBeNull()
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{}')
  })
})
