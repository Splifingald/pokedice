// More details (docs/42): off unless the player switches it on; kept on in the browser and in the save's settings.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSettings, SETTINGS_KEY } from '@/save/storage'
import { parseSave } from '@/save/schema'
import { setSettings, useGame } from '@/store/game'
import { seedRun, startNewGame } from '@/store/run'

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

describe('the More details setting', () => {
  it('is off for a new browser and for one that never chose', () => {
    expect(readSettings().details).toBeUndefined()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true }))
    expect(readSettings().details).toBeUndefined()
  })

  it('is read back on once switched on, and anything but true reads as off', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true, details: true }))
    expect(readSettings().details).toBe(true)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: true, reducedMotion: false, multiExp: true, details: 'yes' }))
    expect(readSettings().details).toBeUndefined()
  })

  it("travels in the save's settings, which still parse", () => {
    seedRun(3)
    startNewGame(1)
    setSettings({ details: true })
    const save = useGame.getState().save!
    expect(save.settings).toMatchObject({ details: true })
    const back = parseSave(JSON.parse(JSON.stringify(save)))
    expect(back.ok && back.save.settings).toMatchObject({ details: true })
    setSettings({ details: undefined })
    expect(useGame.getState().settings.details).toBeUndefined()
  })
})
