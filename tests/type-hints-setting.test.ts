// Type hints (docs/38 U1b): on until the first badge for a player who never chose; a choice always wins.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSettings, SETTINGS_KEY, typeHintsOn } from '@/save/storage'

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

describe('the type hints setting', () => {
  it('is on until the first badge while the player has not chosen', () => {
    expect(typeHintsOn({}, 0)).toBe(true)
    expect(typeHintsOn({}, 1)).toBe(false)
    expect(typeHintsOn({}, 12)).toBe(false)
  })

  it("follows the player's choice, badges or not", () => {
    expect(typeHintsOn({ typeHints: false }, 0)).toBe(false)
    expect(typeHintsOn({ typeHints: true }, 3)).toBe(true)
  })

  it('stays unset when read back from a browser that never chose, and kept when it did', () => {
    expect(readSettings().typeHints).toBeUndefined()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true }))
    expect(readSettings().typeHints).toBeUndefined()
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true, typeHints: false }),
    )
    expect(readSettings().typeHints).toBe(false)
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true, typeHints: true }),
    )
    expect(readSettings().typeHints).toBe(true)
  })
})
