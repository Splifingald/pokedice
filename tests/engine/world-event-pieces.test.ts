// What Haunted Hollow needs from the engine (docs/26 §2.5): a small world's boss is its own catch; its raids marked
// shiny stay shiny and fight at their boss's level; its mythical is optional (its prizes are its shiny bosses and
// raids); a secret area can wait for another area to be cleared; its Mart and loot ignore the item switches.
import { describe, expect, it } from 'vitest'
import {
  RAID_SPECIALS,
  applyFieldItem,
  bossCaught,
  catchTarget,
  conditionStatus,
  createInstance,
  createRng,
  emptyProgress,
  enterWorld,
  fledLegendary,
  isAreaUnlocked,
  itemOnFor,
  lootPoolFor,
  newSave,
  newSmallWorld,
  noteBossCaught,
  progressRaidOf,
  progressRaidKey,
  progressRaidShiny,
  progressRaids,
  raidRules,
  raidTeamCap,
  worldPrize,
  worldPrizeCaught,
  worldPrizes,
  worldProblems,
  worldSecrets,
  type Area,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { makeDataWith, newId } from '../fixtures'

const T0 = Date.parse('2026-10-18T12:00:00.000Z')
const DAY = 24 * 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const NOW = T0 + DAY

const REGION: Region = {
  id: 'world-hollow',
  name: 'Haunted Hollow',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [425, 622, 710],
  starterLevel: 5,
  leagueAreaId: 'hh-elite',
  nextRegion: null,
  enabled: false,
}
const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const area = (id: string, order: number, over: Partial<Area> = {}): Area => ({
  ...route1,
  id,
  name: id,
  regionId: REGION.id,
  orderIndex: 9000 + order,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
  lootPool: [{ id: `${id}-loot`, itemKey: 'link-cable', weight: 1, unique: true, minQty: 1, maxQty: 1 }],
  ...over,
})
const ROAD = area('hh-road', 1)
const ELITE = area('hh-elite', 2)
const CEMETERY = area('hh-cemetery', 3, {
  hidden: true,
  legendaryBoss: [{ dex: 93, level: 30, shiny: true }],
})
const NEWMOON = area('hh-newmoon', 4, {
  hidden: true,
  unlockConditions: [{ kind: 'cleared', areaId: ELITE.id }],
  legendaryBoss: [{ dex: 491, level: 60, shiny: true, raid: true }],
})
const DISTORTION = area('hh-distortion', 5, {
  hidden: true,
  legendaryBoss: [{ dex: 487, level: 70, shiny: true, raid: true }],
})

const WORLD: SmallWorld = {
  ...newSmallWorld('hollow-2026', REGION.id, iso(T0), iso(T0 + 14 * DAY)),
  minBadges: 0,
  starters: [425, 622, 710],
  // No mythical: its prizes are its shiny bosses and raids.
  mythical: { dex: 0, level: 60, areaId: '' },
}
const data = makeDataWith(
  { regions: [REGION], areas: [ROAD, ELITE, CEMETERY, NEWMOON, DISTORTION] },
  { smallWorlds: { access: 'all', list: [WORLD] }, itemSwitches: { 'link-cable': 'off', bait: 'off' } },
)

const kanto = (): SaveData => newSave(4, data, 0, newId)
const inside = (): SaveData => enterWorld(kanto(), data, WORLD, 425, NOW, newId)!
/** In the Cemetery with a Haunter in the world's Pokédex already (Gastly evolved). */
const atCemetery = (): SaveData => {
  const s = inside()
  return { ...s, currentAreaId: CEMETERY.id, pokedex: [...s.pokedex, 92, 93] }
}

describe('a small world’s boss is its own catch', () => {
  it('can be caught with its species in the Pokédex, until it is caught there', () => {
    const s = atCemetery()
    expect(catchTarget(s, 93, 30, 'boss', data, true)).toEqual({ mode: 'new' })
    const caught = noteBossCaught(s, CEMETERY.id, 93)
    expect(caught.areaProgress[CEMETERY.id]?.bossesCaught).toEqual([93])
    expect(catchTarget(caught, 93, 30, 'boss', data, true)).toBeNull()
    // Noting it twice changes nothing.
    expect(noteBossCaught(caught, CEMETERY.id, 93)).toBe(caught)
  })

  it('comes back after a missed throw until caught, whatever the Pokédex says', () => {
    const s = atCemetery()
    const beaten = { ...emptyProgress(), bossesDefeated: [93] }
    expect(fledLegendary(CEMETERY, beaten, s.pokedex, data)?.dex).toBe(93)
    expect(fledLegendary(CEMETERY, { ...beaten, bossesCaught: [93] }, s.pokedex, data)).toBeNull()
    expect(bossCaught(CEMETERY, beaten, s.pokedex, 93, data)).toBe(false)
  })

  it('stays one of a kind outside a world', () => {
    const route = data.areas.find((a) => (a.regionId ?? 'kanto') === 'kanto' && a.legendaryBoss?.length)!
    const dex = route.legendaryBoss![0]!.dex
    expect(bossCaught(route, emptyProgress(), [dex], dex, data)).toBe(true)
    const s = { ...kanto(), currentAreaId: route.id, pokedex: [4, dex] }
    expect(catchTarget(s, dex, 50, 'boss', data)).toBeNull()
  })
})

describe('a small world’s raids', () => {
  const darkrai = progressRaidOf(data, progressRaidKey(NEWMOON.id, 491))!
  const giratina = progressRaidOf(data, progressRaidKey(DISTORTION.id, 487))!

  it('stay shiny when marked so, legendaries included', () => {
    expect(progressRaidShiny(data, darkrai)).toBe(true)
    expect(progressRaidShiny(data, giratina)).toBe(true)
    // Sinnoh's own Giratina raid stays shiny-locked.
    const sinnoh = progressRaids(data, 'sinnoh').find((r) => r.dex === 487)
    if (sinnoh)
      expect(progressRaidShiny(data, { ...sinnoh, boss: { ...sinnoh.boss, shiny: true } })).toBe(false)
  })

  it('fight at their boss’s level, teams capped there; a real region’s raid keeps its own numbers', () => {
    expect(raidRules(data, 491, 'progress', NEWMOON.id).level).toBe(60)
    expect(raidTeamCap(data, 491, 'progress', NEWMOON.id)).toBe(60)
    expect(raidRules(data, 487, 'progress', DISTORTION.id).level).toBe(70)
    expect(raidTeamCap(data, 487, 'progress', DISTORTION.id)).toBe(70)
    expect(raidRules(data, 487, 'progress').level).toBe(RAID_SPECIALS[487]!.level)
    const sinnoh = progressRaids(data, 'sinnoh').find((r) => r.dex === 487)
    if (sinnoh)
      expect(raidRules(data, 487, 'progress', sinnoh.areaId).level).toBe(RAID_SPECIALS[487]!.level)
  })
})

describe('a world without a mythical: its prizes', () => {
  it('lists its shiny bosses and raids in area order, and is known by its last raid', () => {
    expect(worldPrizes(data, WORLD).map((p) => [p.dex, p.kind])).toEqual([
      [93, 'boss'],
      [491, 'raid'],
      [487, 'raid'],
    ])
    expect(worldPrize(data, WORLD)).toMatchObject({ dex: 487, kind: 'raid' })
  })

  it('is a valid world for the admin, and a world with no prize at all is not', () => {
    expect(worldProblems([WORLD], WORLD, data)).toEqual([])
    const bare = makeDataWith(
      { regions: [REGION], areas: [ROAD] },
      { smallWorlds: { access: 'all', list: [WORLD] } },
    )
    expect(worldProblems([WORLD], WORLD, bare)).toContain(
      'Give the world a prize: a shiny mythical, or a boss or raid marked shiny in its areas.',
    )
  })

  it('says when a prize is caught: a raid closed, a boss noted', () => {
    const s = inside()
    const [haunter, , gira] = worldPrizes(data, WORLD)
    expect(worldPrizeCaught(s, WORLD, gira!)).toBe(false)
    const raided = { ...s, events: { ...s.events, raidsDone: [progressRaidKey(DISTORTION.id, 487)] } }
    expect(worldPrizeCaught(raided, WORLD, gira!)).toBe(true)
    expect(worldPrizeCaught(noteBossCaught(s, CEMETERY.id, 93), WORLD, haunter!)).toBe(true)
    // Never for a save that doesn't hold this world.
    expect(worldPrizeCaught(kanto(), WORLD, gira!)).toBe(false)
  })
})

describe('a secret area can wait for another area to be cleared', () => {
  it('opens once that area is cleared, not just reached', () => {
    const s = inside()
    expect(isAreaUnlocked(s, NEWMOON.id, data)).toBe(false)
    const reached = {
      ...s,
      areaProgress: { ...s.areaProgress, [ROAD.id]: { ...emptyProgress(), cleared: true } },
    }
    expect(isAreaUnlocked(reached, ELITE.id, data)).toBe(true)
    expect(isAreaUnlocked(reached, NEWMOON.id, data)).toBe(false)
    const done = {
      ...reached,
      areaProgress: { ...reached.areaProgress, [ELITE.id]: { ...emptyProgress(), cleared: true } },
    }
    expect(isAreaUnlocked(done, NEWMOON.id, data)).toBe(true)
    expect(conditionStatus({ kind: 'cleared', areaId: ELITE.id }, done, data)).toMatchObject({
      met: true,
      current: 1,
      target: 1,
    })
  })
})

describe('inside a small world, its items are its own', () => {
  it('a switched-off item is on there, its loot found and its Link Cable usable', () => {
    const s = inside()
    expect(itemOnFor(kanto(), data, 'link-cable')).toBe(false)
    expect(itemOnFor(s, data, 'link-cable')).toBe(true)
    expect(lootPoolFor(ROAD, emptyProgress(), data).map((e) => e.itemKey)).toEqual(['link-cable'])
    const kantoArea = data.areas.find((a) => (a.regionId ?? 'kanto') === 'kanto')!
    expect(lootPoolFor({ ...kantoArea, lootPool: ROAD.lootPool }, emptyProgress(), data)).toEqual([])
    // A Haunter evolves with the Link Cable in the world's bag.
    const haunter = createInstance(93, 30, data, newId(), NOW)
    const bag: SaveData = { ...s, box: [...s.box, haunter], inventory: { ...s.inventory, 'link-cable': 1 } }
    const used = applyFieldItem(bag, 'link-cable', haunter.id, data, createRng(1))
    expect(used?.save.box.find((p) => p.id === haunter.id)?.dex).toBe(94)
    const outside: SaveData = { ...kanto(), box: [...kanto().box, haunter], inventory: { 'link-cable': 1 } }
    expect(applyFieldItem(outside, 'link-cable', haunter.id, data, createRng(1))).toBeNull()
  })
})

describe('Home inside a world: its secret areas', () => {
  it('lists its secret areas in order with their prize, and says when it is caught', () => {
    const s = inside()
    const rows = worldSecrets(s, data, WORLD)
    expect(rows.map((r) => [r.area.id, r.boss?.dex, r.raid, r.caught])).toEqual([
      [CEMETERY.id, 93, false, false],
      [NEWMOON.id, 491, true, false],
      [DISTORTION.id, 487, true, false],
    ])
    const caught = worldSecrets(noteBossCaught(s, CEMETERY.id, 93), data, WORLD)[0]!
    expect(caught.caught).toBe(true)
    const raided = { ...s, events: { ...s.events, raidsDone: [progressRaidKey(NEWMOON.id, 491)] } }
    expect(worldSecrets(raided, data, WORLD)[1]!.caught).toBe(true)
  })
})
