// The play style (docs/36) is a setting of the one save, not a save of its own: kept on the device and in the save,
// read from settings made before it as the old auto-mode ("Auto on explored areas", its switch as it was), and a style
// this build doesn't know never costs a save.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newSave, playStyleOf, withDetour } from '@/engine'
import { parseSave } from '@/save/schema'
import { readSettings, SETTINGS_KEY } from '@/save/storage'
import { data, newId } from './fixtures'

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

describe('the play style setting', () => {
  it('reads old device settings as auto-mode was: explored areas, on or off as left', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sfx: false, reducedMotion: false, multiExp: true, autoMode: true }),
    )
    const s = readSettings()
    expect(s.playStyle).toBeUndefined()
    expect(playStyleOf(s)).toBe('explored')
    expect(s.autoMode).toBe(true)
  })

  it('keeps a style on the device, and drops one it does not know', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ playStyle: 'idle', autoMode: true }))
    expect(readSettings()).toMatchObject({ playStyle: 'idle', autoMode: true })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ playStyle: 'turbo', autoMode: true }))
    expect(readSettings().playStyle).toBeUndefined()
  })

  it('travels in the save, with a detour under way and the rules flag an older build wrote', () => {
    const base = newSave(7, data, 123, newId)
    // The rules pop-up is gone (docs/36), but saves from before it carry its flag: it still loads, kept as it was.
    const s = withDetour(
      { ...base, settings: { ...base.settings, playStyle: 'idle' }, idle: { rulesSeen: true } },
      {
        from: 'b',
        to: 'a',
        rounds: 2,
      },
    )
    const res = parseSave(JSON.parse(JSON.stringify(s)))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.save.settings.playStyle).toBe('idle')
    expect(res.save.idle).toEqual({ rulesSeen: true, detour: { from: 'b', to: 'a', rounds: 2 } })
  })

  it('never fails a save over a style a newer build wrote, or the dropped Classic: it reads as unset', () => {
    const base = newSave(7, data, 123, newId)
    for (const playStyle of ['turbo', 'classic']) {
      const res = parseSave(
        JSON.parse(JSON.stringify({ ...base, settings: { ...base.settings, playStyle } })),
      )
      expect(res.ok).toBe(true)
      if (res.ok) expect(playStyleOf(res.save.settings)).toBe('explored')
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ playStyle: 'classic', autoMode: false }))
    expect(readSettings().playStyle).toBeUndefined()
  })
})
