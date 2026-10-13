// Small worlds (docs/21): a time-limited, themed region of its own, built in the admin, where a shiny mythical is won.
// Its region is part of nothing a real region is; its rules (area dates, dice by level, XP ×, boosters, its Mart) hold
// inside it only; its mythical leaves for its home region's Box; when it ends, its Pokémon go home locked by level
// (tests/engine/world-homecoming.test.ts) and the rest of it is gone.
import { describe, expect, it } from 'vitest'
import {
  activeEvents,
  applyVictory,
  areaOpenAt,
  areaOpensAt,
  attackerLevels,
  badgesHeld,
  buyComboUpgrade,
  buyItem,
  buyWorldItem,
  catchWorldMythical,
  centerHeal,
  challengeEncounter,
  closeWorld,
  computeDamage,
  createBattle,
  createInstance,
  createRng,
  currentWorld,
  depositPokemon,
  diceLevelOf,
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
  megaUnlocked,
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
  reduce,
  regionCases,
  regionOf,
  regionOfSpecies,
  releaseWorldPending,
  rescueFromDisabledRegion,
  raidTeam,
  sendTargets,
  speciesCaughtEverywhere,
  startRegion,
  uniformLevels,
  unlockedRegions,
  versusClosest,
  worldAt,
  worldBattleLevels,
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

  it('gives dice and combos at the level ÷ 10, rounded down', () => {
    expect([1, 9, 10, 19, 55, 99, 100].map(diceLevelOf)).toEqual([0, 0, 1, 1, 5, 9, 10])
    const lv = worldBattleLevels(data, MARSH)!
    expect(lv.byLevel).toBe(true)
    expect(attackerLevels(lv, 55)).toMatchObject(uniformLevels(5))
    expect(attackerLevels(uniformLevels(3), 55)).toEqual(uniformLevels(3))
    expect(worldBattleLevels(data, route1)).toBeNull()
  })

  it('hits with each attacker’s own level in a fight, on both sides', () => {
    const d = worldData({ boosters: [] })
    const lv = worldBattleLevels(d, MARSH)!
    const { state } = createBattle(
      { kind: 'wild', team: [{ uid: 'me', dex: 4, level: 55, hp: 999 }], enemy: { dex: 16, level: 12 }, playerLevels: lv, enemyLevels: lv },
      d,
    )
    const rng = createRng(7)
    let s = state
    for (let i = 0; i < 6 && s.phase !== 'player_reroll'; i++) s = reduce(s, s.phase === 'enemy_turn' ? { t: 'AI_TURN' } : { t: 'ROLL' }, d, rng).state
    const dice = s.dice
    const r = reduce(s, { t: 'ATTACK' }, d, rng)
    const hit = r.log.find((l) => l.kind === 'damage' && l.side === 'player')
    expect(hit?.kind === 'damage' && hit.result.final).toBe(computeDamage(dice, ['fire'], s.enemy.types, uniformLevels(5), d).final)
  })

  it('multiplies a booster type’s hits, shown on its own and kept out of the effectiveness', () => {
    const lv = worldBattleLevels(data, MARSH)!
    const dice = [die('fire', 3), die('fire', 4), die('fire', 5)]
    const plain = computeDamage(dice, ['fire'], ['normal'], uniformLevels(1), data)
    const boosted = computeDamage(dice, ['fire'], ['normal'], attackerLevels(lv, 5), data)
    expect(boosted.boost).toEqual({ type: 'fire', multiplier: 1.5 })
    expect(boosted.final).toBe(Math.round(plain.raw * 1.5))
    expect(boosted.effectiveness).toBe(plain.effectiveness)
    expect(plain.boost).toBeUndefined()
    // Another type, or base dice only: no booster.
    expect(computeDamage([die('water', 3)], ['water'], ['normal'], attackerLevels(lv, 5), data).boost).toBeUndefined()
    expect(computeDamage([die('base', 3)], ['fire'], ['normal'], attackerLevels(lv, 5), data).boost).toBeUndefined()
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
    // The usual Mart and upgrades are shut inside.
    expect(buyItem(s, 'poke-ball', 1, data)).toBeNull()
    expect(buyComboUpgrade({ ...s, gold: 1e6 }, 'pair', data)).toBeNull()
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
