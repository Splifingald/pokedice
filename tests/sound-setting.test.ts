// One sound switch for the 8-bit effects and the cries, on by default — for saves from before it too.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileGameData, newSave } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { parseSave } from '@/save/schema'
import { readSettings, SETTINGS_KEY, soundOn } from '@/save/storage'

/** localStorage for the node test environment. */
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

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
})
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('the sound setting', () => {
  it('is on in a fresh browser and in a new game', () => {
    expect(soundOn(readSettings())).toBe(true)
    const save = newSave(1, compileGameData(BUNDLE), 0, () => 'x')
    expect(soundOn(save.settings)).toBe(true)
  })

  it('is on for a player who only had the old effects switch, which was off by default', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: false, reducedMotion: false, multiExp: true }))
    expect(soundOn(readSettings())).toBe(true)
  })

  it('stays off once the player turns it off, in the browser and in the save', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sfx: false, sound: false, reducedMotion: false, multiExp: true }),
    )
    expect(soundOn(readSettings())).toBe(false)
    const save = newSave(1, compileGameData(BUNDLE), 0, () => 'x')
    const res = parseSave(
      JSON.parse(JSON.stringify({ ...save, settings: { ...save.settings, sound: false, sfx: false } })),
    )
    expect(res.ok && soundOn(res.save.settings)).toBe(false)
  })
})
