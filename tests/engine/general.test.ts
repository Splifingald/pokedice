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
  challengeEncounter,
  charmChanceAt,
  charmOn,
  charmRulesOnly,
  collectOffline,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  generalLevel,
  generalRulesDue,
  generalShown,
  getInstance,
  isRich,
  keepGeneralBought,
  itemOn,
  linearAreas,
  lootPoolFor,
  markGeneralRulesSeen,
  markOfflineFrom,
  newSave,
  nextGeneralCost,
  offlineRate,
  progressOf,
  rollBait,
  rollWild,
  shopStock,
  type CatchRoll,
  type EncounterContext,
  type GeneralConfig,
  type SaveData,
  wildShinyChance,
} from '@/engine'
import { parseSave } from '@/save/schema'
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
    expect(nextGeneralCost(fresh(), on, 'offline')).toBe(100)
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

  it('offline earnings: ₽1 an hour at level 0; ₽2 an hour at level 1, +₽2 a level, ₽20 at the top', () => {
    let s = fresh(1_000_000)
    expect(offlineRate(s, on)).toBe(1)
    expect(markOfflineFrom(s, on, 0).general?.awayFrom).toBe(0)
    for (let i = 1; i <= 10; i++) {
      s = buyGeneral(s, on, 'offline')!
      expect(offlineRate(s, on)).toBe(2 * i)
    }
    expect(offlineRate(s, off)).toBe(0)
  })

  it('an absence pays its hours, up to 24, on the server’s clock, in whole ₽; the time towards the next ₽ waits', () => {
    const s = buyGeneral(fresh(100), on, 'offline')!
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
    // 20 minutes at ₽2/h is short of a ₽: nothing now, the 20 minutes count in the next absence.
    const MIN = 60_000
    const short = collectOffline(away, on, t0 + 20 * MIN)!
    expect(short.gold).toBe(0)
    expect(short.save.general?.carryMs).toBe(20 * MIN)
    // 20 more: 40 minutes is ₽1 (one every 30), and 10 minutes wait again.
    const next = collectOffline(markOfflineFrom(short.save, on, t0 + HOUR), on, t0 + HOUR + 20 * MIN)!
    expect(next.gold).toBe(1)
    expect(next.save.general?.carryMs).toBe(10 * MIN)
    // At the top, ₽20 an hour: a full day is ₽480, to the ₽.
    let top = fresh(1_000_000)
    for (let i = 0; i < 10; i++) top = buyGeneral(top, on, 'offline')!
    expect(collectOffline(markOfflineFrom(top, on, t0), on, t0 + 30 * HOUR)!.gold).toBe(480)
    // A clock that went backwards pays nothing.
    expect(collectOffline(away, on, t0 - HOUR)!.gold).toBe(0)
    // Nothing open, nothing paid.
    expect(collectOffline(s, on, t0)).toBeNull()
  })

  it('level 0 pays offlineBase (₽24 for a day away at ₽1); 0 turns it off and no absence starts', () => {
    const s = fresh(0)
    const t0 = 1_000_000
    expect(collectOffline(markOfflineFrom(s, on, t0), on, t0 + 30 * HOUR)!.gold).toBe(24)
    const none = makeData({ general: { ...GENERAL_ON, offlineBase: 0 } })
    expect(offlineRate(s, none)).toBe(0)
    expect(markOfflineFrom(s, none, t0)).toBe(s)
    // The switch off: nothing, level 0 included.
    expect(offlineRate(s, off)).toBe(0)
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
    expect(generalRulesDue(markGeneralRulesSeen(badged, on), on)).toBe(false)
  })
})

describe('keepGeneralBought: two copies of one save', () => {
  const save = newSave(4, on, 1000, newId)
  it('keeps the higher level of each, and "I am just rich" if either bought it', () => {
    const a = { ...save, gold: 50, general: { luck: 3, offline: 1, awayFrom: 9 } }
    const b = { ...save, gold: 900, general: { luck: 1, offline: 6, rich: true, rulesSeen: true } }
    const kept = keepGeneralBought(a, b)
    expect(kept.general).toEqual({ luck: 3, offline: 6, rich: true, rulesSeen: true, awayFrom: 9 })
    // Its own ₽ and offline clock: nothing is paid twice.
    expect(kept.gold).toBe(50)
  })

  it('hands the same save back when the other copy adds nothing', () => {
    const a = { ...save, general: { luck: 3, offline: 2 } }
    expect(keepGeneralBought(a, { ...save, general: { luck: 1 } })).toBe(a)
    expect(keepGeneralBought(a, save)).toBe(a)
    expect(keepGeneralBought(a, null)).toBe(a)
    expect(keepGeneralBought(save, { ...save, general: { offline: 2 } }).general).toEqual({ offline: 2 })
  })
})

describe('the Shiny Charm', () => {
  const CHARM_ON: GeneralConfig = { ...GENERAL_ON, charmAccess: 'all' }
  // The user's base odds for it: 1 in 1,000.
  const charmed = makeData({ shinyChance: 0.001, general: CHARM_ON })
  const at = (charm: number): SaveData => ({ ...fresh(), general: { charm } })

  it('is off by default, on its own switch inside the tab’s', () => {
    expect(DEFAULT_CONFIG.general.charmAccess).toBe('off')
    expect(charmOn(on)).toBe(false)
    expect(generalShown(on)).toEqual(['luck', 'offline', 'rich'])
    expect(buyGeneral(fresh(1e6), on, 'charm')).toBeNull()
    // The tab off hides it whatever its own switch says.
    expect(charmOn(makeData({ general: { ...CHARM_ON, access: 'off' } }))).toBe(false)
    expect(generalShown(charmed)).toEqual(['luck', 'offline', 'rich', 'charm'])
    // Switched off, a level bought changes nothing.
    expect(wildShinyChance(at(10), makeData({ shinyChance: 0.001, general: GENERAL_ON }))).toBe(0.001)
  })

  it('has the ten levels of the user’s table, ₽69,000 in all', () => {
    const odds = [1000, 950, 900, 850, 800, 750, 700, 625, 550, 450, 333]
    const costs = [1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000]
    odds.forEach((n, lv) => expect(wildShinyChance(at(lv), charmed)).toBeCloseTo(1 / n, 10))
    let s: SaveData = { ...fresh(69_000), general: {} }
    for (const cost of costs) {
      expect(nextGeneralCost(s, charmed, 'charm')).toBe(cost)
      s = buyGeneral(s, charmed, 'charm')!
    }
    expect(generalLevel(s, 'charm', charmed)).toBe(10)
    expect(s.gold).toBe(0)
    expect(nextGeneralCost(s, charmed, 'charm')).toBeNull()
  })

  it('never makes the odds worse than game_config’s', () => {
    const generous = makeData({ shinyChance: 0.01, general: CHARM_ON })
    expect(charmChanceAt(generous, 1)).toBe(0.01)
    expect(charmChanceAt(generous, 10)).toBe(0.01)
    expect(charmChanceAt(makeData({ shinyChance: 0.002, general: CHARM_ON }), 10)).toBeCloseTo(1 / 333)
  })

  it('is what the wild Pokémon and the bosses roll', () => {
    const d = makeData({ shinyChance: 0, general: CHARM_ON })
    const area = linearAreas(d)[0]!
    const s = fresh()
    const ctx = (shinyChance?: number): EncounterContext => ({
      area,
      progress: progressOf(s, area.id),
      data: d,
      teamAvgLevel: 5,
      teamHurt: false,
      isFirstInArea: false,
      pokedex: s.pokedex,
      shinyChance,
    })
    expect(rollWild(ctx(), createRng(3))).not.toHaveProperty('shiny')
    expect(rollWild(ctx(1), createRng(3))).toMatchObject({ shiny: true })
    const boss = { ...area, legendaryBoss: [{ dex: 16, level: 10 }] }
    const ready = { ...progressOf(s, area.id), roundsDone: 99 }
    expect(challengeEncounter(boss, ready, d, 10, null, createRng(1), 1)).toMatchObject({
      kind: 'boss',
      shiny: true,
    })
    expect(challengeEncounter(boss, ready, d, 10, null, createRng(1))).not.toHaveProperty('shiny')
  })

  it('its rules: in the tab’s pop-up, or once on their own for a player who read those already', () => {
    const first = badgeCase(fresh(), charmed)[0]!
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
    // Never seen: the tab's pop-up, the charm in it; once read, both are seen.
    expect(charmRulesOnly(badged, charmed)).toBe(false)
    expect(markGeneralRulesSeen(badged, charmed).general).toEqual({ rulesSeen: true, charmSeen: true })
    // Read before the charm came: its own pop-up, once.
    const read = markGeneralRulesSeen(badged, on)
    expect(read.general).toEqual({ rulesSeen: true })
    expect(generalRulesDue(read, on)).toBe(false)
    expect(generalRulesDue(read, charmed)).toBe(true)
    expect(charmRulesOnly(read, charmed)).toBe(true)
    const both = markGeneralRulesSeen(read, charmed)
    expect(generalRulesDue(both, charmed)).toBe(false)
    expect(markGeneralRulesSeen(both, charmed)).toBe(both)
  })

  it('two copies of one save keep the higher level and the rules seen', () => {
    const save = newSave(4, on, 1000, newId)
    const kept = keepGeneralBought(
      { ...save, general: { charm: 2 } },
      { ...save, general: { charm: 7, charmSeen: true } },
    )
    expect(kept.general).toEqual({ charm: 7, charmSeen: true })
  })

  it('the save keeps it', () => {
    const s: SaveData = { ...fresh(), general: { charm: 4, charmSeen: true, rulesSeen: true } }
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    expect(back.ok && back.save.general).toEqual({ charm: 4, charmSeen: true, rulesSeen: true })
  })
})
