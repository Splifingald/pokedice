// The Link Cable, the Bait and the General upgrades (docs/25): their rules, and their switches.
import { describe, expect, it } from 'vitest'
import {
  applyFieldItem,
  badgeCase,
  BAIT_FACES,
  baitChance,
  baitFaces,
  baitFor,
  buyGeneral,
  buyItem,
  captureLuck,
  collectOffline,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  generalLevel,
  generalRulesDue,
  getInstance,
  isRich,
  itemOn,
  lootPoolFor,
  markGeneralRulesSeen,
  markOfflineFrom,
  newSave,
  nextGeneralCost,
  offlineRate,
  rollBait,
  shopStock,
  type CatchRoll,
  type GeneralConfig,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const HOUR = 3_600_000
const GENERAL_ON: GeneralConfig = { ...DEFAULT_CONFIG.general, access: 'all' }
const on = makeData({ itemSwitches: { 'link-cable': 'all', bait: 'all' }, general: GENERAL_ON })
const off = makeData()
const fresh = (gold = 0): SaveData => ({ ...newSave(4, on, 0, newId), gold })

describe('the switches (docs/15 §20)', () => {
  it('everything is off by default', () => {
    expect(off.config.itemSwitches).toEqual({ 'link-cable': 'off', bait: 'off' })
    expect(off.config.general.access).toBe('off')
    expect(itemOn(off, 'bait')).toBe(false)
    expect(itemOn(off, 'link-cable')).toBe(false)
    // An item without a switch is always on.
    expect(itemOn(off, 'poke-ball')).toBe(true)
  })

  it('admin: only the admin sees it', () => {
    const admin = makeData({ itemSwitches: { bait: 'admin' } })
    expect(itemOn(admin, 'bait')).toBe(false)
    expect(itemOn({ ...admin, viewer: { admin: true } }, 'bait')).toBe(true)
  })

  it('a switched-off Bait is not sold, and a switched-off item is not found', () => {
    const sold = (d: typeof on) => shopStock(d, 8).some((r) => r.item.key === 'bait')
    expect(sold(off)).toBe(false)
    expect(sold(on)).toBe(true)
    const area = {
      ...on.areas[0]!,
      lootPool: [{ id: 'l', itemKey: 'bait', weight: 1, unique: false, minQty: 1, maxQty: 1 }],
    }
    expect(
      lootPoolFor(
        area,
        { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] },
        off,
      ),
    ).toEqual([])
    expect(
      lootPoolFor(
        area,
        { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] },
        on,
      ),
    ).toHaveLength(1)
  })

  it('the Bait: ₽150, in every region from the 7th badge; the Link Cable is never on the shelf by default', () => {
    const bait = shopStock(on, 6).find((r) => r.item.key === 'bait')!
    expect(bait.item.price).toBe(150)
    expect(bait.item.region ?? null).toBeNull()
    expect(bait.unlocked).toBe(false)
    expect(shopStock(on, 7).find((r) => r.item.key === 'bait')!.unlocked).toBe(true)
    expect(on.items['link-cable']!.price).toBe(1000)
    expect(shopStock(on, 99).some((r) => r.item.key === 'link-cable')).toBe(false)
    expect(buyItem({ ...fresh(5000), region: 'johto' }, 'bait', 1, on)).not.toBeNull()
    expect(buyItem(fresh(5000), 'bait', 1, off)).toBeNull()
  })
})

describe('the Link Cable', () => {
  const withMon = (dex: number, d = on) => ({
    ...newSave(4, d, 0, newId),
    box: [...newSave(4, d, 0, newId).box, createInstance(dex, 30, d, 'mon', 0)],
    inventory: { 'link-cable': 1 },
  })

  it('evolves a trade evolution (Kadabra → Alakazam) and is used up', () => {
    const r = applyFieldItem(withMon(64), 'link-cable', 'mon', on, createRng(1))!
    expect(getInstance(r.save, 'mon')!.dex).toBe(65)
    expect(r.save.inventory['link-cable']).toBe(0)
    expect(r.save.pokedex).toContain(65)
    expect(r.events).toContainEqual(expect.objectContaining({ kind: 'evolve', fromDex: 64, toDex: 65 }))
  })

  it('does nothing to a Pokémon without a trade evolution, nor while switched off', () => {
    expect(applyFieldItem(withMon(25), 'link-cable', 'mon', on, createRng(1))).toBeNull()
    expect(applyFieldItem(withMon(64, off), 'link-cable', 'mon', off, createRng(1))).toBeNull()
  })
})

describe('the Bait', () => {
  const miss = (total: number, need: number): CatchRoll => ({
    die: total - 1,
    bonus: 1,
    total,
    need,
    caught: false,
  })

  it('its die: three 1s, two 2s, a 3', () => {
    expect([...BAIT_FACES]).toEqual([1, 1, 1, 2, 2, 3])
    expect([...baitFaces(on.items.bait)]).toEqual([1, 1, 1, 2, 2, 3])
  })

  it('its chance: short by 1 → always; by 2 → 1/2; by 3 → 1/6; by 4 → never', () => {
    expect(baitChance(miss(6, 7), BAIT_FACES)).toBe(1)
    expect(baitChance(miss(5, 7), BAIT_FACES)).toBe(0.5)
    expect(baitChance(miss(4, 7), BAIT_FACES)).toBeCloseTo(1 / 6)
    expect(baitChance(miss(3, 7), BAIT_FACES)).toBe(0)
  })

  it('is offered only after a miss it could still save, from a bag that holds one, switched on', () => {
    const bag = { inventory: { bait: 2 } }
    expect(baitFor(miss(5, 7), bag, on)).toBe('bait')
    expect(baitFor(miss(3, 7), bag, on)).toBeNull()
    expect(baitFor({ ...miss(7, 7), caught: true }, bag, on)).toBeNull()
    expect(baitFor({ ...miss(5, 7), bait: 1 }, bag, on)).toBeNull()
    expect(baitFor(miss(5, 7), { inventory: {} }, on)).toBeNull()
    expect(baitFor(miss(5, 7), bag, off)).toBeNull()
  })

  it('its die adds to the total and decides the catch', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = rollBait(miss(5, 7), BAIT_FACES, createRng(seed))
      expect(BAIT_FACES).toContain(r.bait)
      expect(r.total).toBe(5 + r.bait!)
      expect(r.caught).toBe(r.total >= 7)
    }
  })
})

describe('the General upgrades', () => {
  it('cost what the config says, with the live region’s ₽, and apply to the whole save', () => {
    expect(nextGeneralCost(fresh(), on, 'luck')).toBe(1000)
    expect(nextGeneralCost(fresh(), on, 'offline')).toBe(800)
    expect(nextGeneralCost(fresh(), on, 'rich')).toBe(99999)
    expect(buyGeneral(fresh(999), on, 'luck')).toBeNull()
    const s = buyGeneral(fresh(1500), on, 'luck')!
    expect(s.gold).toBe(500)
    expect(generalLevel(s, 'luck', on)).toBe(1)
    expect(nextGeneralCost(s, on, 'luck')).toBe(1800)
    // Off: nothing to buy, and what was bought stops working (but stays).
    expect(buyGeneral(fresh(5000), off, 'luck')).toBeNull()
    expect(captureLuck(s, off, 'wild', false)).toBe(0)
    expect(s.general?.luck).toBe(1)
  })

  it('max out at their last level', () => {
    let s = fresh(1_000_000)
    for (let i = 0; i < 10; i++) s = buyGeneral(s, on, 'luck')!
    expect(generalLevel(s, 'luck', on)).toBe(10)
    expect(nextGeneralCost(s, on, 'luck')).toBeNull()
    expect(buyGeneral(s, on, 'luck')).toBeNull()
    const rich = buyGeneral(s, on, 'rich')!
    expect(isRich(rich, on)).toBe(true)
    expect(isRich(rich, off)).toBe(false)
    expect(buyGeneral(rich, on, 'rich')).toBeNull()
  })

  it('Capture Luck: 10 % a level up to 100 %, wild Pokémon only, once per encounter', () => {
    let s = fresh(1_000_000)
    expect(captureLuck(s, on, 'wild', false)).toBe(0)
    for (let i = 1; i <= 10; i++) {
      s = buyGeneral(s, on, 'luck')!
      expect(captureLuck(s, on, 'wild', false)).toBeCloseTo(i / 10)
    }
    expect(captureLuck(s, on, 'boss', false)).toBe(0)
    expect(captureLuck(s, on, 'wild', true)).toBe(0)
  })

  it('offline earnings: none at level 0; ₽2 an hour at level 1, +₽1 a level', () => {
    let s = fresh(1_000_000)
    expect(offlineRate(s, on)).toBe(0)
    expect(markOfflineFrom(s, on, 0)).toBe(s)
    for (let i = 1; i <= 10; i++) {
      s = buyGeneral(s, on, 'offline')!
      expect(offlineRate(s, on)).toBe(i + 1)
    }
    expect(offlineRate(s, off)).toBe(0)
  })

  it('an absence pays its hours, up to 24, on the server’s clock; the part of a ₽ waits for the next one', () => {
    const s = buyGeneral(fresh(800), on, 'offline')!
    const t0 = 1_000_000
    const away = markOfflineFrom(s, on, t0)
    expect(away.general?.awayFrom).toBe(t0)
    // A second hide keeps the absence's start.
    expect(markOfflineFrom(away, on, t0 + HOUR)).toBe(away)
    const back = collectOffline(away, on, t0 + 3 * HOUR)!
    expect(back.gold).toBe(6)
    expect(back.save.gold).toBe(6)
    expect(back.save.general?.awayFrom).toBeUndefined()
    // 2 days away: 24 h count.
    expect(collectOffline(away, on, t0 + 48 * HOUR)!.gold).toBe(48)
    // 20 minutes at ₽2/h is ₽0.67: nothing now, carried to the next absence.
    const short = collectOffline(away, on, t0 + 20 * 60_000)!
    expect(short.gold).toBe(0)
    expect(short.save.general?.carry).toBeCloseTo(2 / 3, 3)
    const next = collectOffline(markOfflineFrom(short.save, on, t0 + HOUR), on, t0 + HOUR + 20 * 60_000)!
    expect(next.gold).toBe(1)
    // A clock that went backwards pays nothing.
    expect(collectOffline(away, on, t0 - HOUR)!.gold).toBe(0)
    // Nothing open, nothing paid.
    expect(collectOffline(s, on, t0)).toBeNull()
  })

  it('the rules pop-up: once the tab is on, from the first badge', () => {
    const first = badgeCase(fresh(), on)[0]!
    const s = fresh()
    const badged: SaveData = {
      ...s,
      areaProgress: {
        ...s.areaProgress,
        [first.areaId]: {
          roundsDone: 0,
          cleared: false,
          bossDefeated: false,
          bossesDefeated: [],
          gymsDefeated: [first.trainerId],
        },
      },
    }
    expect(generalRulesDue(s, on)).toBe(false)
    expect(generalRulesDue(badged, on)).toBe(true)
    expect(generalRulesDue(badged, off)).toBe(false)
    expect(generalRulesDue(markGeneralRulesSeen(badged), on)).toBe(false)
  })
})
