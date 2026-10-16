// Small worlds (docs/21): a time-limited, themed region of its own, built in the admin, where a shiny mythical is won.
// Its region is part of nothing a real region is; its rules (area dates, its own upgrades, XP ×, boosters, its Mart) hold
// inside it only; its mythical leaves for its home region's Box; when it ends, its Pokémon go home locked by level
// (tests/engine/world-homecoming.test.ts) and the rest of it is gone.
import { describe, expect, it } from 'vitest'
import {
  activeEvents,
  applyVictory,
  areaOpenAt,
  areaOpensAt,
  badgesHeld,
  buyComboUpgrade,
  buyItem,
  buyWorldItem,
  captureLuck,
  catchWorldMythical,
  centerHeal,
  challengeEncounter,
  closeWorld,
  collectOffline,
  computeDamage,
  createInstance,
  createRng,
  currentWorld,
  depositPokemon,
  emptyProgress,
  enabledRegions,
  enterWorld,
  eventUnlocked,
  eventsTeaser,
  evolutionGate,
  fledLegendary,
  getRegion,
  heldWorld,
  inWorld,
  instanceMaxHp,
  isAreaUnlocked,
  isWorldRegion,
  leaveWorld,
  liveFor,
  markWorldBye,
  markWorldSeen,
  markOfflineFrom,
  megaUnlocked,
  gmaxUnlocked,
  enemyPlanFor,
  newLiveEvent,
  newRegionBlock,
  newSave,
  newSmallWorld,
  offeredRegion,
  pokemonXp,
  applyProgressRaidCatch,
  progressRaidKey,
  progressRaidOf,
  progressRaidReachable,
  progressRaidTeam,
  regionCases,
  regionOf,
  regionOfSpecies,
  releaseWorldPending,
  rescueFromDisabledRegion,
  sellItem,
  sellPrice,
  raidTeam,
  sendTargets,
  speciesCaughtEverywhere,
  startRegion,
  uniformLevels,
  unlockedRegions,
  versusClosest,
  worldAt,
  withWorldBoost,
  worldByeDue,
  worldFor,
  worldOver,
  worldPopupDue,
  worldProblems,
  worldShopRows,
  type Area,
  type GameData,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { progressTotals } from '@/save/cloud'
import { parseSave } from '@/save/schema'
import { BUNDLE } from '@/config/bundle'
import { die, makeDataWith, newId } from '../fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const H = 3_600_000
const DAY = 24 * H
const iso = (ms: number) => new Date(ms).toISOString()

const REGION: Region = {
  id: 'world-mirage',
  name: 'Mirage Island',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [63],
  starterLevel: 5,
  leagueAreaId: 'w-lair',
  nextRegion: null,
  enabled: false,
}
const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const area = (id: string, name: string, order: number, over: Partial<Area> = {}): Area => ({
  ...route1,
  id,
  name,
  regionId: REGION.id,
  orderIndex: 9000 + order,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
  ...over,
})
const MARSH = area('w-a1', 'Mirage Marsh', 1)
const PATH = area('w-a2', 'Twilight Path', 2)
const LAIR = area('w-lair', 'Mirage Island', 3, {
  wildPool: [],
  trainerPool: [],
  lootPool: [],
  encounterWeights: { wild: 0, trainer: 0, center: 1, item: 0, casino: 0 },
  roundsToClear: 1,
})

const WORLD: SmallWorld = {
  ...newSmallWorld('mirage-2026', REGION.id, iso(T0), iso(T0 + 10 * DAY)),
  minBadges: 0,
  starters: [63, 92, 79],
  xpMultiplier: 5,
  boosters: [{ type: 'fire', multiplier: 1.5 }],
  shop: [
    { key: 'ultra-ball', price: 150, limit: 2 },
    { key: 'great-ball', price: 1, limit: null },
  ],
  mythical: { dex: 151, level: 60, areaId: LAIR.id },
  opens: { [PATH.id]: iso(T0 + 3 * DAY) },
}

function worldData(world: Partial<SmallWorld> = {}, access: 'off' | 'admin' | 'all' = 'all', admin = false): GameData {
  const d = makeDataWith(
    { regions: [REGION], areas: [MARSH, PATH, LAIR] },
    { smallWorlds: { access, list: [{ ...WORLD, ...world }] }, liveEvents: { access: 'all', list: [{ ...newLiveEvent('l1', iso(T0), iso(T0 + 30 * DAY)), minBadges: 0, type: 'cash' }] } },
  )
  return admin ? { ...d, viewer: { admin: true } } : d
}
const data = worldData()
const NOW = T0 + DAY
const kanto = (): SaveData => newSave(4, data, 0, newId)
const inside = (save = kanto()): SaveData => enterWorld(save, data, WORLD, 63, NOW, newId)!

describe('a small world is no real region', () => {
  it('is a world because a world names it, and stays out of the journey', () => {
    expect(isWorldRegion(data, REGION.id)).toBe(true)
    expect(isWorldRegion(data, 'kanto')).toBe(false)
    expect(enabledRegions(data).map((r) => r.id)).not.toContain(REGION.id)
    const s = inside()
    expect(regionOf(s)).toBe(REGION.id)
    expect(unlockedRegions(s, data).map((r) => r.id)).toEqual(['kanto'])
    expect(regionCases(s, data).map((r) => r.id)).toEqual(['kanto'])
    expect(offeredRegion(s, data)).toBeNull()
  })

  it('names no generation, and lets every one evolve inside it', () => {
    expect(regionOfSpecies(data, 151)).toBe('kanto')
    expect(regionOfSpecies(data, 99999)).toBeNull()
    // A Golbat never becomes a Crobat in Kanto; in a world it may.
    const s = inside()
    expect(evolutionGate(s, data)(169)).toBe(true)
    expect(evolutionGate(kanto(), data)(169)).toBe(false)
  })

  it('opens no Mega Evolution, wherever its row sits in the order', () => {
    expect(megaUnlocked(inside(), data)).toBe(false)
  })

  it('has no Mega Evolution or Gigantamax, even once Galar is reached, nor do its trainers', () => {
    const galar: SaveData = { ...kanto(), region: 'galar' }
    expect(megaUnlocked(galar, data) && gmaxUnlocked(galar, data)).toBe(true)
    const s = inside(galar)
    expect(megaUnlocked(s, data)).toBe(false)
    expect(gmaxUnlocked(s, data)).toBe(false)
    const ace = { regionId: REGION.id, role: 'champion' as const, ace: true }
    expect(enemyPlanFor(s, data, { dex: 6, level: 65 }, ace)).toBeNull()
    // Back out of it, both come back.
    const out = leaveWorld(s, data)!
    expect(megaUnlocked(out, data) && gmaxUnlocked(out, data)).toBe(true)
  })

  it('sends nothing out and takes nothing in', () => {
    const s = inside()
    expect(sendTargets(s, data)).toEqual([])
    expect(sendTargets(leaveWorld(s, data)!, data).map((r) => r.id)).not.toContain(REGION.id)
  })

  it("isn't counted as progress: Day Care, sync, Versus and raid teams leave it out", () => {
    const s0 = inside()
    const s = { ...s0, pokedex: [...s0.pokedex, 92, 79, 81] }
    expect(speciesCaughtEverywhere(s)).toBe(1) // Kanto's Charmander only
    const totals = progressTotals(s)
    expect(totals.regions).toBe(1)
    expect(totals.species).toBe(1)
    const ids = new Set(s.box.map((p) => p.id))
    expect(versusClosest(s, data).every((c) => !ids.has(c.inst.id))).toBe(true)
    expect(raidTeam(s, data).every((m) => !ids.has(m.id))).toBe(true)
  })

  it('is never "rescued" from: the world decides when it closes', () => {
    expect(getRegion(data, REGION.id)?.enabled).toBe(false)
    expect(rescueFromDisabledRegion(inside(), data)).toBeNull()
  })
})

describe('when a world is open', () => {
  it('runs between its start (included) and end (excluded), on the server clock', () => {
    expect(worldAt(data, null)).toBeNull()
    expect(worldAt(data, T0 - 1)).toBeNull()
    expect(worldAt(data, T0)?.id).toBe(WORLD.id)
    expect(worldAt(data, T0 + 10 * DAY - 1)?.id).toBe(WORLD.id)
    expect(worldAt(data, T0 + 10 * DAY)).toBeNull()
  })

  it('follows the switch: off, the admin alone, everyone', () => {
    expect(worldAt(worldData({}, 'off'), NOW)).toBeNull()
    expect(worldAt(worldData({}, 'admin'), NOW)).toBeNull()
    expect(worldAt(worldData({}, 'admin', true), NOW)?.id).toBe(WORLD.id)
  })

  it('opens from its badge count, in the main save only', () => {
    const d = worldData({ minBadges: 1 })
    expect(badgesHeld(kanto(), d)).toBe(0)
    expect(worldFor(kanto(), d, NOW)).toBeNull()
    expect(worldFor(kanto(), data, NOW)?.id).toBe(WORLD.id)
    expect(worldFor({ ...kanto(), mode: 'extreme' }, data, NOW)).toBeNull()
  })

  it('shows its pop-up once', () => {
    const s = kanto()
    expect(worldPopupDue(s, WORLD)).toBe(true)
    expect(worldPopupDue(markWorldSeen(s, WORLD), WORLD)).toBe(false)
  })
})

describe('in and out', () => {
  it('starts fresh on one of its partners, at the region’s level, from ₽0', () => {
    const before = { ...kanto(), gold: 500 }
    const s = enterWorld(before, data, WORLD, 92, NOW, newId)!
    expect(regionOf(s)).toBe(REGION.id)
    expect(s.box).toHaveLength(1)
    expect(s.box[0]).toMatchObject({ dex: 92, level: 5 })
    expect(s.gold).toBe(0)
    expect(s.currentAreaId).toBe(MARSH.id)
    expect(s.parked?.kanto?.gold).toBe(500)
    expect(heldWorld(s)).toMatchObject({ id: WORLD.id, regionId: REGION.id, from: 'kanto', partner: 92 })
    expect(s.events?.worldSeen).toContain(WORLD.id)
    expect(currentWorld(s, data)?.id).toBe(WORLD.id)
  })

  it('refuses a partner the world doesn’t offer, and the Extreme save', () => {
    expect(enterWorld(kanto(), data, WORLD, 1, NOW, newId)).toBeNull()
    expect(enterWorld(kanto(), data, WORLD, null, NOW, newId)).toBeNull()
    expect(enterWorld({ ...kanto(), mode: 'extreme' }, data, WORLD, 63, NOW, newId)).toBeNull()
  })

  it('goes back where the player came from, and back in where they left it', () => {
    const s = { ...inside(), gold: 77 }
    const out = leaveWorld(s, data)!
    expect(regionOf(out)).toBe('kanto')
    expect(out.parked?.[REGION.id]?.gold).toBe(77)
    expect(inWorld(out, data)).toBe(false)
    const back = enterWorld(out, data, WORLD, null, NOW, newId)!
    expect(regionOf(back)).toBe(REGION.id)
    expect(back.gold).toBe(77)
    expect(back.box[0]?.dex).toBe(63)
  })
})

describe('its rules', () => {
  it('opens an area at its date as well as after the one before (isAreaUnlocked stays clock-free)', () => {
    expect(areaOpensAt(data, PATH.id)).toBe(T0 + 3 * DAY)
    expect(areaOpensAt(data, MARSH.id)).toBeNull()
    expect(areaOpenAt(data, PATH.id, T0 + 3 * DAY - 1)).toBe(false)
    expect(areaOpenAt(data, PATH.id, T0 + 3 * DAY)).toBe(true)
    expect(areaOpenAt(data, PATH.id, null)).toBe(false)
    expect(areaOpenAt(data, MARSH.id, null)).toBe(true)
    const s = inside()
    expect(isAreaUnlocked(s, PATH.id, data)).toBe(false)
    const cleared = { ...s, areaProgress: { [MARSH.id]: { ...emptyProgress(), cleared: true } } }
    expect(isAreaUnlocked(cleared, PATH.id, data)).toBe(true)
  })

  it('has upgrade tracks of its own, from the start, bought with its ₽ (docs/26)', () => {
    const s = inside()
    expect(s.comboLevels.pair).toBe(1)
    expect(s.dieLevels.fire).toBe(1)
    const bought = buyComboUpgrade({ ...s, gold: 1e6 }, 'pair', data)!
    expect(bought.comboLevels.pair).toBe(2)
    // Kanto's tracks, parked, are untouched.
    expect(bought.parked?.kanto?.comboLevels.pair).toBe(s.parked?.kanto?.comboLevels.pair)
  })

  it('keeps each side’s tracks in a fight and adds its boosters to both', () => {
    const own = { comboLevels: { pair: 3 }, dieLevels: { fire: 4 } }
    expect(withWorldBoost(own, data, MARSH)).toEqual({ ...own, typeBoost: { fire: 1.5 } })
    expect(withWorldBoost(uniformLevels(5), data, MARSH)).toMatchObject({ ...uniformLevels(5), typeBoost: { fire: 1.5 } })
    expect(withWorldBoost(own, data, route1)).toBe(own)
    expect(withWorldBoost(own, worldData({ boosters: [] }), MARSH)).toBe(own)
  })

  it('multiplies a booster type’s hits, shown on its own and kept out of the effectiveness', () => {
    const lv = withWorldBoost(uniformLevels(1), data, MARSH)
    const dice = [die('fire', 3), die('fire', 4), die('fire', 5)]
    const plain = computeDamage(dice, ['fire'], ['normal'], uniformLevels(1), data)
    const boosted = computeDamage(dice, ['fire'], ['normal'], lv, data)
    expect(boosted.boost).toEqual({ type: 'fire', multiplier: 1.5 })
    expect(boosted.final).toBe(Math.round(plain.raw * 1.5))
    expect(boosted.effectiveness).toBe(plain.effectiveness)
    expect(plain.boost).toBeUndefined()
    // Another type, or base dice only: no booster.
    expect(computeDamage([die('water', 3)], ['water'], ['normal'], lv, data).boost).toBeUndefined()
    expect(computeDamage([die('base', 3)], ['fire'], ['normal'], lv, data).boost).toBeUndefined()
  })

  it('multiplies XP in its areas only', () => {
    const d = worldData({ xpMultiplier: 5 })
    expect(pokemonXp(10, d.areas.find((a) => a.id === MARSH.id)!, false, d)).toBe(5 * pokemonXp(10, route1, false, d))
    const s = inside()
    const uid = s.team[0]!
    const res = applyVictory(s, { areaId: MARSH.id, kind: 'wild', enemyDex: 16, enemyLevel: 4, fighterUid: uid }, d, createRng(1), NOW, newId)
    const xp = res.events.find((e) => e.kind === 'xp' && e.uid === uid)
    expect(xp?.kind === 'xp' && xp.amount).toBe(pokemonXp(4, route1, false, d) * 5)
  })

  it('sells its own list only, within each row’s limit, with the world’s ₽', () => {
    const s = { ...inside(), gold: 1000 }
    const rows = worldShopRows(s, data)
    expect(rows.map((r) => r.item.key)).toEqual(['ultra-ball', 'great-ball'])
    // Never below what the Mart pays back (no buy-and-sell profit).
    expect(rows[1]!.price).toBeGreaterThan(1)
    const one = buyWorldItem(s, data, 'ultra-ball', 2, NOW)!
    expect(one.gold).toBe(1000 - 300)
    expect(one.inventory['ultra-ball']).toBe((s.inventory['ultra-ball'] ?? 0) + 2)
    expect(buyWorldItem(one, data, 'ultra-ball', 1, NOW)).toBeNull()
    expect(buyWorldItem(s, data, 'master-ball', 1, NOW)).toBeNull()
    expect(buyWorldItem({ ...s, gold: 10 }, data, 'ultra-ball', 1, NOW)).toBeNull()
    expect(worldShopRows(kanto(), data)).toEqual([])
    // The usual Mart is shut inside.
    expect(buyItem(s, 'poke-ball', 1, data)).toBeNull()
  })

  it('buys back the world’s bag for the world’s ₽, never above its price', () => {
    const s = buyWorldItem({ ...inside(), gold: 1000 }, data, 'ultra-ball', 2, NOW)!
    const unit = sellPrice(data.items['ultra-ball'])
    expect(unit).toBeGreaterThan(0)
    expect(unit).toBeLessThan(150)
    const sold = sellItem(s, 'ultra-ball', 2, data)!
    expect(sold.gold).toBe(s.gold + unit * 2)
    expect(sold.inventory['ultra-ball']).toBe(s.inventory['ultra-ball']! - 2)
    // The world's ₽ stay the world's: the region outside is untouched.
    expect(sold.parked).toEqual(s.parked)
  })
})

describe('its shiny mythical', () => {
  const lair = () => data.areas.find((a) => a.id === LAIR.id)!

  it('is its last area’s boss, always shiny; a legendary elsewhere stays shiny-locked', () => {
    expect(lair().legendaryBoss).toEqual([{ dex: 151, level: 60, shiny: true }])
    const done = { ...emptyProgress(), roundsDone: 1 }
    expect(challengeEncounter(lair(), done, data, 30, null, createRng(1))).toMatchObject({ kind: 'boss', dex: 151, level: 60, shiny: true })
    const elsewhere = { ...data.areas.find((a) => a.id === route1.id)!, legendaryBoss: [{ dex: 150, level: 70, shiny: true }] }
    const met = challengeEncounter(elsewhere, { ...done, roundsDone: 99 }, data, 30, null, createRng(1))
    expect(met).toMatchObject({ kind: 'boss', dex: 150 })
    expect(met).not.toHaveProperty('shiny')
  })

  it('leaves the world at once for its home region’s Box, and stops coming back', () => {
    const s = inside()
    const res = catchWorldMythical(s, data, LAIR.id, { dex: 151, level: 60 }, NOW, newId)!
    expect(res.events).toEqual([{ kind: 'world_mythical', dex: 151, level: 60, region: 'kanto', waiting: false }])
    expect(res.save.box.some((p) => p.dex === 151)).toBe(false)
    const mew = res.save.parked?.kanto?.box.find((p) => p.dex === 151)
    expect(mew).toMatchObject({ level: 60, shiny: true })
    expect(res.save.parked?.kanto?.pokedex).toContain(151)
    expect(res.save.pokedex).toContain(151)
    expect(heldWorld(res.save)?.caught).toBe(true)
    const beaten = { ...emptyProgress(), bossesDefeated: [151] }
    expect(fledLegendary(lair(), beaten, s.pokedex, data)).not.toBeNull()
    // The catch is noted in its lair (a world's bosses go by that, docs/26 §2.5).
    const after = { ...beaten, ...res.save.areaProgress[LAIR.id], bossesDefeated: [151] }
    expect(after.bossesCaught).toEqual([151])
    expect(fledLegendary(lair(), after, res.save.pokedex, data)).toBeNull()
  })

  it('is any other catch’s business when it isn’t the mythical in its area', () => {
    const s = inside()
    expect(catchWorldMythical(s, data, MARSH.id, { dex: 151, level: 60 }, NOW, newId)).toBeNull()
    expect(catchWorldMythical(s, data, LAIR.id, { dex: 92, level: 9 }, NOW, newId)).toBeNull()
    expect(catchWorldMythical(kanto(), data, LAIR.id, { dex: 151, level: 60 }, NOW, newId)).toBeNull()
  })

  it('waits for its home region to be started, then joins its Box', () => {
    const d = worldData({ mythical: { dex: 251, level: 60, areaId: LAIR.id } })
    const s = enterWorld(kanto(), d, { ...WORLD, mythical: { dex: 251, level: 60, areaId: LAIR.id } }, 63, NOW, newId)!
    const res = catchWorldMythical(s, d, LAIR.id, { dex: 251, level: 60 }, NOW, newId)!
    expect(res.events[0]).toMatchObject({ kind: 'world_mythical', region: 'johto', waiting: true })
    expect(res.save.events?.worldPending).toEqual([{ dex: 251, level: 60, shiny: true, worldId: WORLD.id }])
    expect(releaseWorldPending(res.save, d, NOW, newId).released).toEqual([])
    const johto = getRegion(d, 'johto')!
    const started = startRegion(leaveWorld(res.save, d)!, johto, newRegionBlock(johto, 152, d, NOW, newId, createInstance))
    const out = releaseWorldPending(started, d, NOW, newId)
    expect(out.released).toEqual([{ dex: 251, level: 60, shiny: true, worldId: WORLD.id, region: 'johto' }])
    expect(out.save.box.find((p) => p.dex === 251)).toMatchObject({ shiny: true, level: 60 })
    expect(out.save.events?.worldPending).toBeUndefined()
  })
})

describe('when it closes', () => {
  it('is over at its end (on the server clock), or gone from the latest content', () => {
    const s = inside()
    expect(worldOver(s, data, T0 + 10 * DAY - 1, true)).toBe(false)
    expect(worldOver(s, data, null, true)).toBe(false)
    expect(worldOver(s, data, T0 + 10 * DAY, false)).toBe(true)
    const gone = makeDataWith({ regions: [REGION], areas: [MARSH, PATH, LAIR] }, { smallWorlds: { access: 'all', list: [] } })
    expect(worldOver(s, gone, NOW, false)).toBe(false)
    expect(worldOver(s, gone, NOW, true)).toBe(true)
  })

  it('sends the player back and deletes its block; the mythical, already home, and its Pokémon going home are left', () => {
    const caught = catchWorldMythical({ ...inside(), gold: 999 }, data, LAIR.id, { dex: 151, level: 60 }, NOW, newId)!.save
    const closed = closeWorld(caught, data)
    expect(regionOf(closed)).toBe('kanto')
    expect(closed.parked?.[REGION.id]).toBeUndefined()
    expect(closed.box.find((p) => p.dex === 151)).toMatchObject({ shiny: true })
    // The partner (Abra, Lv.5) went home to Kanto, where Charmander is Lv.5 already: it arrived at once.
    expect(closed.box.find((p) => p.dex === 63)).toMatchObject({ level: 5 })
    expect(closed.gold).not.toBe(999)
    expect(heldWorld(closed)).toBeNull()
    expect(closed.events?.world).toMatchObject({ id: WORLD.id, closed: true, caught: true, partner: 63 })
    // Closed from outside: the parked block goes all the same.
    const outside = closeWorld(leaveWorld(inside(), data)!, data)
    expect(Object.keys(outside.parked ?? {})).not.toContain(REGION.id)
  })

  it('says so once, to whoever played it or saw it open', () => {
    const closed = closeWorld(inside(), data)
    const after = T0 + 11 * DAY
    expect(worldByeDue(closed, data, after)).toMatchObject({ id: WORLD.id, entered: true, caught: false, partner: 63 })
    const seen = markWorldBye(closed, WORLD.id)
    expect(seen.events?.world).toBeUndefined()
    expect(worldByeDue(seen, data, after)).toBeNull()
    // Saw it open, never went in.
    const looked = markWorldSeen(kanto(), WORLD)
    expect(worldByeDue(looked, data, NOW)).toBeNull()
    expect(worldByeDue(looked, data, after)).toMatchObject({ id: WORLD.id, entered: false })
    expect(worldByeDue(kanto(), data, after)).toBeNull()
  })
})

describe('no event reaches inside', () => {
  it('opens no event, live event, teaser or Day Care while the player is in a world', () => {
    const out = {
      ...kanto(),
      areaProgress: Object.fromEntries(data.areas.filter((a) => (a.regionId ?? 'kanto') === 'kanto').map((a) => [a.id, { ...emptyProgress(), cleared: true }])),
    }
    expect(activeEvents(out, data).length).toBeGreaterThan(0)
    expect(liveFor(out, data, NOW)?.id).toBe('l1')
    const s = enterWorld(out, data, WORLD, 63, NOW, newId)!
    for (const id of ['wheel', 'raid', 'rebattle'] as const) expect(eventUnlocked(id, s, data)).toBe(false)
    expect(eventsTeaser(s, data)).toBeNull()
    expect(liveFor(s, data, NOW)).toBeNull()
    expect(depositPokemon(s, s.box[0]!.id, data, NOW)).toBeNull()
  })

  it("a Center there heals the world's Box, not the main game's Day Care", () => {
    const out = kanto()
    const hurt = { inst: { ...out.box[0]!, id: 'care-1', currentHp: 1 }, since: 0, region: 'kanto' }
    const s = enterWorld({ ...out, dayCare: { residents: [hurt], guests: [], eggClaimed: true } }, data, WORLD, 63, NOW, newId)!
    const healed = centerHeal({ ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }, data)
    expect(healed.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
    expect(healed.dayCare!.residents[0]!.inst.currentHp).toBe(1)
  })
})

describe('the General upgrades stay outside (docs/25)', () => {
  const on = worldData()
  const general = { ...on.config.general, access: 'all' as const }
  const gd: GameData = { ...on, config: { ...on.config, general } }
  const maxed = (s: SaveData): SaveData => ({ ...s, general: { luck: 10, offline: 10 } })
  const inWorld = (): SaveData => maxed(enterWorld(kanto(), gd, WORLD, 63, NOW, newId)!)

  it('Capture Luck keeps no wild Pokémon in a world', () => {
    expect(captureLuck(maxed(kanto()), gd, 'wild', false)).toBe(1)
    expect(captureLuck(inWorld(), gd, 'wild', false)).toBe(0)
  })

  it('offline earnings: no absence starts in a world, and one found open there closes unpaid', () => {
    const s = inWorld()
    expect(markOfflineFrom(s, gd, NOW)).toBe(s)
    const open: SaveData = { ...s, general: { ...s.general, awayFrom: NOW, carryMs: 1000 } }
    const res = collectOffline(open, gd, NOW + 10 * H)!
    expect(res.gold).toBe(0)
    expect(res.save.gold).toBe(open.gold)
    expect(res.save.general?.awayFrom).toBeUndefined()
    expect(res.save.general?.carryMs).toBe(1000)
    // Back in Kanto, the world's hours pay nothing.
    expect(collectOffline(leaveWorld(res.save, gd)!, gd, NOW + 20 * H)).toBeNull()
  })
})

describe('the admin', () => {
  const list = [WORLD]
  it('accepts a sound world', () => {
    expect(worldProblems(list, WORLD, data)).toEqual([])
  })
  it('refuses an overlap, a missing partner, the mythical outside the world, a shared region, Kanto', () => {
    const other = { ...WORLD, id: 'other', start: iso(T0 + DAY), end: iso(T0 + 12 * DAY), regionId: 'world-other' }
    expect(worldProblems(list, other, data).join(' ')).toMatch(/overlaps/)
    expect(worldProblems(list, { ...WORLD, starters: [63, 92] }, data).join(' ')).toMatch(/three/)
    expect(worldProblems(list, { ...WORLD, mythical: { ...WORLD.mythical, areaId: route1.id } }, data).join(' ')).toMatch(/isn’t one of the world’s/)
    const twin = { ...WORLD, id: 'twin', start: iso(T0 + 20 * DAY), end: iso(T0 + 22 * DAY) }
    expect(worldProblems(list, twin, data).join(' ')).toMatch(/uses this region/)
    expect(worldProblems([], { ...WORLD, regionId: 'kanto' }, data).join(' ')).toMatch(/Kanto/)
    expect(worldProblems([], { ...WORLD, end: WORLD.start }, data).join(' ')).toMatch(/ends before/)
  })
})

describe('the save', () => {
  it('keeps the world, its pop-ups and the mythicals waiting through a round trip', () => {
    const s = inside()
    const withAll: SaveData = {
      ...s,
      events: {
        ...s.events,
        world: { ...heldWorld(s)!, caught: true, bought: { 'ultra-ball': 1 } },
        worldBye: ['old'],
        worldPending: [{ dex: 251, level: 60, shiny: true, worldId: 'old' }],
      },
    }
    const back = parseSave(JSON.parse(JSON.stringify(withAll)))
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.save.events?.world).toEqual(withAll.events?.world)
      expect(back.save.events?.worldSeen).toEqual([WORLD.id])
      expect(back.save.events?.worldBye).toEqual(['old'])
      expect(back.save.events?.worldPending).toEqual(withAll.events?.worldPending)
      expect(back.save.parked?.kanto).toBeTruthy()
    }
  })
})

describe('a small world’s progression raid (docs/24)', () => {
  // The admin ticks Raid on a boss of the world's second area: it's that world's raid, fought from inside it.
  const RAIDED = { ...PATH, legendaryBoss: [{ dex: 144, level: 50, raid: true }] }
  const d = makeDataWith(
    { regions: [REGION], areas: [MARSH, RAIDED, LAIR] },
    { smallWorlds: { access: 'all', list: [WORLD] } },
  )
  const worldRaid = progressRaidOf(d, progressRaidKey(RAIDED.id, 144))!
  const seafoam = d.areas.find((a) => a.name === 'Seafoam Islands')!
  const kantoRaid = progressRaidOf(d, progressRaidKey(seafoam.id, 144))!

  it('is the world’s: reachable from inside it only, and a region’s raid isn’t from there', () => {
    expect(worldRaid).toMatchObject({ region: REGION.id, areaId: RAIDED.id })
    const home = newSave(4, d, 0, newId)
    const there = enterWorld(home, d, WORLD, 63, NOW, newId)!
    expect(progressRaidReachable(there, d, worldRaid)).toBe(true)
    expect(progressRaidReachable(there, d, kantoRaid)).toBe(false)
    expect(progressRaidReachable(home, d, worldRaid)).toBe(false)
    expect(progressRaidReachable(home, d, kantoRaid)).toBe(true)
  })

  it('takes its team from the world’s Box, and its catch stays in the world', () => {
    const there = enterWorld(newSave(4, d, 0, newId), d, WORLD, 63, NOW, newId)!
    expect(progressRaidTeam(there, d, worldRaid).map((m) => m.dex)).toEqual([63])
    const res = applyProgressRaidCatch(there, d, worldRaid, NOW, newId)
    expect(res).toMatchObject({ region: REGION.id, live: true })
    expect(res.save.box.some((p) => p.dex === 144)).toBe(true)
    expect(res.save.parked?.kanto?.box.some((p) => p.dex === 144)).toBe(false)
  })
})
