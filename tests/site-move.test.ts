// The new address (docs/72): the old address packs the device's game data, the new one lays it into its own storage
// before the game starts. What comes along, what stays behind (the push subscription, the move's own marks), the trip
// through the server's text (gzip, or plain JSON on an old Safari), and a save already on the new address meeting the
// one that came: the further one wins, the other goes to the backups, nothing lost. And the pop-up's place: first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newSave, nextOneTimePopup, siteMoveOn, type SaveData } from '@/engine'
import * as game from '@/save/move'
import { carried, encodeMove, packDevice, settleMovedSaves } from '@/save/move'
import * as page from '@/moveIn'
import { decodeMove, layIn } from '@/moveIn'
import { readBackups, saveKeyOf, SETTINGS_KEY } from '@/save/storage'
import { data, makeData, newId } from './fixtures'

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

const T0 = Date.UTC(2026, 10, 11, 12)
/** A save that caught `extra` more species than the starter: more progress, as the sync counts it. */
function saveWith(extra: number[], at = T0): SaveData {
  const s = newSave(4, data, at, newId)
  return { ...s, pokedex: [...s.pokedex, ...extra], playedAt: at }
}

let ls: Storage
beforeEach(() => {
  ls = memoryStorage()
  vi.stubGlobal('localStorage', ls)
})
afterEach(() => vi.unstubAllGlobals())

/** What the new address does: move.html lays it in, then the game starts and settles a save that waited. */
function unpackDevice(moved: Record<string, string>) {
  layIn(localStorage, moved)
  settleMovedSaves()
}

/** The old address's storage, packed and through the server's text, as the new address gets it. */
async function trip(old: Record<string, string>): Promise<Record<string, string>> {
  const here = ls
  const there = memoryStorage()
  for (const [k, v] of Object.entries(old)) there.setItem(k, v)
  vi.stubGlobal('localStorage', there)
  const text = await encodeMove(packDevice())
  vi.stubGlobal('localStorage', here)
  return decodeMove(text)
}

describe('move.html and the game agree', () => {
  // move.html shares no code with the game (its own small file), so the names are written in both.
  it('on the names', () => {
    expect(page.OLD_HOST).toBe(game.OLD_HOST)
    expect(page.STAY_HASH).toBe(game.STAY_HASH)
    expect(page.ARRIVED_KEY).toBe(game.ARRIVED_KEY)
    expect(page.PENDING).toBe(game.PENDING)
  })

  it('on what comes along', () => {
    for (const key of [
      'pokedice.save',
      'pokedice.save.cloud',
      'pokedice.settings',
      'pokedice.push',
      'pokedice.move.sent',
      'pokedice.devConfig',
      'pokedice.spritesDown',
      'sb-abc-auth-token',
      'other',
    ])
      expect(page.carriedIn(key), key).toBe(carried(key))
  })

  it("plants nothing but the game's keys, whatever a hand-made code carries", () => {
    layIn(ls, { 'sb-abc-auth-token': 'someone-else', 'pokedice.devConfig': '{}', 'pokedice.tip.auto': '1' })
    expect(ls.getItem('sb-abc-auth-token')).toBeNull()
    expect(ls.getItem('pokedice.devConfig')).toBeNull()
    expect(ls.getItem('pokedice.tip.auto')).toBe('1')
  })
})

describe('what comes along', () => {
  it('carries every key of the game but what belongs to the address', () => {
    expect(carried('pokedice.save')).toBe(true)
    expect(carried('pokedice.save.extreme.backups')).toBe(true)
    expect(carried('pokedice.settings')).toBe(true)
    expect(carried('pokedice.analytics.device')).toBe(true)
    expect(carried('pokedice.dexSeen.kanto')).toBe(true)
    // The push subscription was made for the old address: the new one asks again.
    expect(carried('pokedice.push')).toBe(false)
    expect(carried('pokedice.move.sent')).toBe(false)
    expect(carried('pokedice.devConfig')).toBe(false)
    // Not the game's: the sign-in session stays (the player signs in again; the cloud save comes back then).
    expect(carried('sb-abc-auth-token')).toBe(false)
  })

  it('arrives whole on an empty address, through gzip', async () => {
    const save = saveWith([1, 7])
    const moved = await trip({
      'pokedice.save': JSON.stringify(save),
      'pokedice.settings': JSON.stringify({ lang: 'fr', sound: false }),
      'pokedice.analytics.device': 'dev-123',
      'pokedice.push': '{"on":true}',
      'sb-abc-auth-token': 'secret',
    })
    expect(Object.keys(moved).sort()).toEqual([
      'pokedice.analytics.device',
      'pokedice.save',
      'pokedice.settings',
    ])
    unpackDevice(moved)
    expect(JSON.parse(ls.getItem(saveKeyOf('main'))!).pokedex).toEqual(save.pokedex)
    expect(ls.getItem('pokedice.analytics.device')).toBe('dev-123')
    expect(JSON.parse(ls.getItem(SETTINGS_KEY)!).lang).toBe('fr')
    expect(ls.getItem('pokedice.push')).toBeNull()
  })

  it('goes as plain JSON where the browser has no CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    ls.setItem('pokedice.slot', 'extreme')
    const text = await encodeMove(packDevice())
    expect(text.startsWith('j:')).toBe(true)
    expect(await decodeMove(text)).toEqual({ 'pokedice.slot': 'extreme' })
  })

  it('refuses text that is neither', async () => {
    await expect(decodeMove('x:{}')).rejects.toThrow('move_format')
    await expect(decodeMove('j:[1]')).rejects.toThrow('move_format')
  })

  it('shrinks a big save a good deal', async () => {
    const big = saveWith(Array.from({ length: 150 }, (_, i) => i + 1))
    const json = JSON.stringify({
      'pokedice.save': JSON.stringify({ ...big, box: Array(3000).fill(big.team[0]) }),
    })
    const text = await encodeMove(JSON.parse(json) as Record<string, string>)
    expect(text.length).toBeLessThan(json.length / 4)
  })
})

describe('a save already on the new address', () => {
  it('gives way to the further one that came, and goes to the backups', async () => {
    const here = saveWith([], T0 + 60_000)
    ls.setItem(saveKeyOf('main'), JSON.stringify(here))
    unpackDevice(await trip({ 'pokedice.save': JSON.stringify(saveWith([1, 7, 25])) }))
    expect(JSON.parse(ls.getItem(saveKeyOf('main'))!).pokedex).toContain(25)
    expect(readBackups('main').map((b) => b.save.pokedex)).toEqual([here.pokedex])
  })

  it('stays when it is the further one, the one that came kept in the backups', async () => {
    const here = saveWith([1, 7, 25])
    ls.setItem(saveKeyOf('main'), JSON.stringify(here))
    const old = saveWith([], T0 + 60_000)
    unpackDevice(await trip({ 'pokedice.save': JSON.stringify(old) }))
    expect(JSON.parse(ls.getItem(saveKeyOf('main'))!).pokedex).toEqual(here.pokedex)
    expect(readBackups('main').map((b) => b.save.pokedex)).toEqual([old.pokedex])
  })

  it("keeps the new address's own settings", async () => {
    ls.setItem(SETTINGS_KEY, JSON.stringify({ lang: 'de' }))
    unpackDevice(await trip({ [SETTINGS_KEY]: JSON.stringify({ lang: 'fr' }) }))
    expect(JSON.parse(ls.getItem(SETTINGS_KEY)!).lang).toBe('de')
  })

  it('takes an unreadable save all the same, for the game to archive', async () => {
    unpackDevice(await trip({ 'pokedice.save': '{"broken": true}' }))
    expect(ls.getItem(saveKeyOf('main'))).toBe('{"broken": true}')
  })
})

describe('the switch and the pop-up', () => {
  it('is off as the game ships, on for everyone once switched', () => {
    expect(siteMoveOn(data)).toBe(false)
    expect(siteMoveOn(makeData({ siteMove: { access: 'all' } }))).toBe(true)
    expect(siteMoveOn(makeData({ siteMove: { access: 'admin' } }))).toBe(false)
  })

  it('comes first of what the player came back to, between fights only', () => {
    const save = saveWith([])
    const ctx = { calm: true, path: '/home', signedIn: false, now: T0, moved: true, offlineReport: true }
    expect(nextOneTimePopup(save, data, ctx)).toBe('moved')
    expect(nextOneTimePopup(save, data, { ...ctx, calm: false })).toBeNull()
    expect(nextOneTimePopup(save, data, { ...ctx, moved: false })).toBe('offline')
  })
})
