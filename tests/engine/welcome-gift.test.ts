// A small world's starting gift (docs/64 §4.7): a blue present right after the partner pick, in place of the
// new-game bag, while its switch is on and the server says yes.
import { describe, expect, it } from 'vitest'
import {
  enterWorld,
  heldWorld,
  MONEY,
  newSave,
  openWelcomeGift,
  welcomeGiftContents,
  welcomeGiftDue,
  welcomeGiftOf,
  welcomeGiftOn,
  leaveWorld,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { snowglobe, WELCOME_GIFT } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const h = snowglobe()
const NOW = Date.parse('2026-12-19T12:30:00.000Z')
const world: SmallWorld = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (access: 'off' | 'admin' | 'all', w = world) =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [w] }, welcomeGift: { access } },
  )
const on = dataWith('all')
const off = dataWith('off')
const enter = (d = on, welcome = true): SaveData =>
  enterWorld(newSave(4, d, 0, newId), d, world, 10103, NOW, newId, { welcome })!

describe('the starting gift', () => {
  it('is Snowglobe Valley’s: 2 Potions, 5 Poké Balls, ₽10 and 2 Ice Heals (the user’s call)', () => {
    expect(WELCOME_GIFT).toEqual({ gold: 10, items: { potion: 2, 'poke-ball': 5, 'ice-heal': 2 } })
    expect(welcomeGiftContents(welcomeGiftOf(on, world)!)).toEqual([
      { key: MONEY, qty: 10 },
      { key: 'potion', qty: 2 },
      { key: 'poke-ball', qty: 5 },
      { key: 'ice-heal', qty: 2 },
    ])
  })

  it('switched on and allowed: the bag and purse start empty and a present waits, right after the pick', () => {
    expect(welcomeGiftOn(on)).toBe(true)
    const s = enter()
    expect(heldWorld(s)?.welcome).toBe('due')
    expect(s.inventory).toEqual({})
    expect(s.gold).toBe(0)
    expect(welcomeGiftDue(s, on)?.world.id).toBe(world.id)
  })

  it('opened: its items in the bag, its ₽ in the purse, once', () => {
    const opened = openWelcomeGift(enter(), on)!
    expect(opened.inventory).toEqual({ potion: 2, 'poke-ball': 5, 'ice-heal': 2 })
    expect(opened.gold).toBe(10)
    expect(heldWorld(opened)?.welcome).toBe('opened')
    expect(welcomeGiftDue(opened, on)).toBeNull()
    expect(openWelcomeGift(opened, on)).toBeNull()
  })

  it('switched off, or the server says no: the new-game bag as before, no present', () => {
    for (const s of [enter(off), enter(on, false)]) {
      expect(heldWorld(s)?.welcome).toBeUndefined()
      expect(s.inventory).toEqual(on.config.startInventory)
      expect(welcomeGiftDue(s, on)).toBeNull()
    }
    // On for the admin only: a player who isn't gets none.
    expect(welcomeGiftOn(dataWith('admin'))).toBe(false)
  })

  it('a world without a gift (or one holding nothing the game has) gives none', () => {
    for (const w of [
      { ...world, welcomeGift: undefined },
      { ...world, welcomeGift: { gold: 0, items: { nope: 3 } } },
    ] as SmallWorld[]) {
      const d = dataWith('all', w)
      const s = enterWorld(newSave(4, d, 0, newId), d, w, 10103, NOW, newId, { welcome: true })!
      expect(heldWorld(s)?.welcome).toBeUndefined()
      expect(s.inventory).toEqual(d.config.startInventory)
    }
  })

  it('waits only inside its world: outside, it isn’t opened, and it is still there on the way back', () => {
    const s = enter()
    const out = leaveWorld(s, on)!
    expect(welcomeGiftDue(out, on)).toBeNull()
    expect(openWelcomeGift(out, on)).toBeNull()
    const back = enterWorld(out, on, world, null, NOW, newId)!
    expect(welcomeGiftDue(back, on)).not.toBeNull()
  })

  it('opens even if the switch went off since it was given: the bag started empty for it', () => {
    expect(openWelcomeGift(enter(), off)?.gold).toBe(10)
  })
})
