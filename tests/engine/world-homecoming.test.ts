// A small world's Pokémon going home (docs/26 §1): when it closes, every Pokémon of its team and Box goes to its
// species' region and waits there, locked, until that region has a Pokémon at its level; then it arrives by the usual
// rule (joins, replaces a weaker copy, merges into a stronger one; a shiny is its own) and enters the Pokédex.
import { describe, expect, it } from 'vitest'
import {
  closeWorld,
  createInstance,
  enterWorld,
  everyRegionBox,
  getRegion,
  homersIn,
  instanceMaxHp,
  leaveWorld,
  newRegionBlock,
  newSave,
  newSmallWorld,
  regionBestLevel,
  regionOf,
  releaseHomer,
  releaseWorldHome,
  renamePokemon,
  sendWorldHome,
  speciesHome,
  startRegion,
  switchRegion,
  worldByeDue,
  worldHomers,
  type Area,
  type PokemonInstance,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { BUNDLE } from '@/config/bundle'
import { makeDataWith, newId } from '../fixtures'

const T0 = Date.parse('2026-10-18T12:00:00.000Z')
const DAY = 24 * 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

const REGION: Region = {
  id: 'world-hollow',
  name: 'Haunted Hollow',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [425, 622, 710],
  starterLevel: 5,
  leagueAreaId: 'hh-road',
  nextRegion: null,
  enabled: false,
}
const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const ROAD: Area = {
  ...route1,
  id: 'hh-road',
  name: 'Dusk Road',
  regionId: REGION.id,
  orderIndex: 9001,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
const WORLD: SmallWorld = {
  ...newSmallWorld('hollow-2026', REGION.id, iso(T0), iso(T0 + 14 * DAY)),
  minBadges: 0,
  starters: [425, 622, 710],
  mythical: { dex: 151, level: 60, areaId: ROAD.id },
}
const data = makeDataWith(
  { regions: [REGION], areas: [ROAD] },
  { smallWorlds: { access: 'all', list: [WORLD] } },
)
const NOW = T0 + DAY

const mon = (dex: number, level: number, over: Partial<PokemonInstance> = {}): PokemonInstance => ({
  ...createInstance(dex, level, data, newId(), NOW),
  ...over,
})

/** Kanto started on Charmander (Lv.5), then into the world on Drifloon. */
const kanto = (): SaveData => newSave(4, data, 0, newId)
const inside = (save = kanto()): SaveData => enterWorld(save, data, WORLD, 425, NOW, newId)!
/** Inside the world with these in its Box (the partner is in the team already). */
function withWorldBox(extra: PokemonInstance[], save = inside()): SaveData {
  return { ...save, box: [...save.box, ...extra] }
}
const levelUp = (save: SaveData, dex: number, level: number): SaveData => ({
  ...save,
  box: save.box.map((p) => (p.dex === dex ? { ...p, level } : p)),
})

describe('the world closes: its Pokémon go home', () => {
  it('sends the team and Box to each species’ region, the partner too, healed', () => {
    const hurt = mon(92, 30, { currentHp: 1 }) // Gastly → Kanto
    const s = withWorldBox([hurt, mon(200, 20), mon(477, 45)]) // Misdreavus → Johto, Dusknoir → Sinnoh
    const closed = closeWorld(s, data)
    expect(regionOf(closed)).toBe('kanto')
    expect(closed.parked?.[REGION.id]).toBeUndefined()
    expect(closed.events?.world).toMatchObject({ closed: true, home: { kanto: 1, johto: 1, sinnoh: 2 } })
    // Drifloon is Sinnoh's (Gen 4), and waits there with Dusknoir.
    expect(homersIn(closed, 'sinnoh').map((h) => h.inst.dex)).toEqual([477, 425])
    expect(homersIn(closed, 'johto').map((h) => h.inst.dex)).toEqual([200])
    const gastly = homersIn(closed, 'kanto')[0]!
    expect(gastly.inst).toMatchObject({
      id: hurt.id,
      dex: 92,
      level: 30,
      currentHp: instanceMaxHp(hurt, data),
    })
    expect(gastly.worldId).toBe(WORLD.id)
  })

  it('goes by the species it is now: an evolved one goes to its own generation', () => {
    expect(speciesHome(data, 355)).toBe('hoenn') // Duskull
    expect(speciesHome(data, 477)).toBe('sinnoh') // Dusknoir
    expect(speciesHome(data, 200)).toBe('johto') // Misdreavus
    expect(speciesHome(data, 429)).toBe('sinnoh') // Mismagius
  })

  it('waits locked: in no Box, no Pokédex, no Day Care or raid list', () => {
    const closed = closeWorld(withWorldBox([mon(92, 30)]), data)
    expect(closed.box.some((p) => p.dex === 92)).toBe(false)
    expect(closed.pokedex).not.toContain(92)
    expect(everyRegionBox(closed, data).some((m) => m.inst.dex === 92)).toBe(false)
    expect(regionBestLevel(closed, data, 'kanto')).toBe(5)
  })

  it('arrives at once when its region already has a Pokémon at its level', () => {
    const strong = levelUp(kanto(), 4, 40)
    const closed = closeWorld(withWorldBox([mon(92, 30)], inside(strong)), data)
    expect(homersIn(closed, 'kanto')).toEqual([])
    expect(closed.box.find((p) => p.dex === 92)).toMatchObject({ level: 30 })
    expect(closed.pokedex).toContain(92)
    // The count still says it went home.
    expect(closed.events?.world?.home).toMatchObject({ kanto: 1 })
  })

  it('merges the world’s own duplicates into the strongest, shinies kept apart', () => {
    const s = inside()
    const twin = mon(92, 12)
    const withTwins: SaveData = {
      ...s,
      box: [...s.box, mon(92, 30), twin, mon(92, 8, { shiny: true })],
      team: [...s.team, twin.id],
    }
    const closed = closeWorld(withTwins, data)
    const gastlies = homersIn(closed, 'kanto').filter((h) => h.inst.dex === 92)
    expect(gastlies.map((h) => [h.inst.level, !!h.inst.shiny])).toEqual([
      [30, false],
      [8, true],
    ])
    expect(closed.events?.world?.home?.kanto).toBe(2)
  })

  it('merges with a copy already waiting from an earlier world', () => {
    const first = closeWorld(withWorldBox([mon(92, 20)]), data)
    const sent = sendWorldHome(first, data, [mon(92, 35), mon(93, 25)], 'next-world')
    expect(homersIn(sent.save, 'kanto').map((h) => [h.inst.dex, h.inst.level])).toEqual([
      [92, 35],
      [93, 25],
    ])
    expect(sent.counts).toEqual({ kanto: 2 })
  })

  it('tells the closing pop-up how many went where', () => {
    const closed = closeWorld(withWorldBox([mon(92, 30), mon(200, 20)]), data)
    expect(worldByeDue(closed, data, T0 + 15 * DAY)).toMatchObject({
      entered: true,
      home: { kanto: 1, johto: 1, sinnoh: 1 },
    })
  })

  it('closes from outside the same way (the world parked)', () => {
    const out = leaveWorld(withWorldBox([mon(92, 30)]), data)!
    const closed = closeWorld(out, data)
    expect(homersIn(closed, 'kanto').map((h) => h.inst.dex)).toEqual([92])
  })
})

describe('the lock lifts when the region catches up', () => {
  const closed = () => closeWorld(withWorldBox([mon(92, 30), mon(92, 10, { shiny: true })]), data)

  it('stays while the best there is below its level, and lifts for good once it reaches it', () => {
    const s = closed()
    expect(releaseWorldHome(levelUp(s, 4, 9), data).arrived).toEqual([])
    // Lv.29: the shiny Lv.10 comes, the Lv.30 one still waits.
    const some = releaseWorldHome(levelUp(s, 4, 29), data)
    expect(some.arrived.map((a) => [a.inst.level, a.outcome])).toEqual([[10, 'shiny']])
    const res = releaseWorldHome(levelUp(some.save, 4, 30), data)
    expect(res.arrived.map((a) => [a.inst.dex, a.outcome])).toEqual([[92, 'new']])
    // Only Drifloon is left, waiting for Sinnoh.
    expect(worldHomers(res.save).map((h) => h.inst.dex)).toEqual([425])
    expect(res.save.pokedex).toContain(92)
    expect(res.save.box.filter((p) => p.dex === 92)).toHaveLength(2)
  })

  it('counts the region’s Day Care residents as its own', () => {
    const s = closed()
    const sitter = mon(1, 33)
    const care = (region: string): SaveData['dayCare'] => ({
      residents: [{ inst: sitter, since: NOW, region }],
      guests: [],
      eggClaimed: false,
    })
    const withSitter: SaveData = { ...s, dayCare: care('kanto') }
    expect(regionBestLevel(withSitter, data, 'kanto')).toBe(33)
    expect(releaseWorldHome(withSitter, data).arrived.map((a) => a.inst.dex)).toContain(92)
    // Another region's resident is nobody's in Kanto.
    const johtoSitter: SaveData = { ...s, dayCare: care('johto') }
    expect(regionBestLevel(johtoSitter, data, 'kanto')).toBe(5)
  })

  it('follows the usual rule: a stronger copy replaces yours in place, a weaker one merges into it', () => {
    const s = closed()
    const weakerMine = mon(92, 20)
    const replaced = releaseWorldHome(
      { ...levelUp(s, 4, 35), box: [...levelUp(s, 4, 35).box, weakerMine] },
      data,
    )
    const mine = replaced.save.box.filter((p) => p.dex === 92 && !p.shiny)
    expect(mine).toEqual([expect.objectContaining({ id: weakerMine.id, level: 30 })])
    expect(replaced.arrived.find((a) => !a.inst.shiny)?.outcome).toBe('replaced')

    const strongerMine = mon(92, 40)
    const merged = releaseWorldHome({ ...s, box: [...s.box, strongerMine] }, data)
    expect(merged.arrived.find((a) => !a.inst.shiny)?.outcome).toBe('merged')
    expect(merged.save.box.filter((p) => p.dex === 92 && !p.shiny)).toEqual([strongerMine])
  })

  it('waits for a region not started yet, then for its best there', () => {
    const s = closeWorld(withWorldBox([mon(200, 20)]), data)
    expect(releaseWorldHome(s, data).arrived).toEqual([])
    const johto = getRegion(data, 'johto')!
    const started = startRegion(s, johto, newRegionBlock(johto, 152, data, NOW, newId, createInstance))
    expect(releaseWorldHome(started, data).arrived).toEqual([])
    const res = releaseWorldHome(levelUp(started, 152, 20), data)
    expect(res.arrived.map((a) => [a.inst.dex, a.region])).toEqual([[200, 'johto']])
    expect(res.save.pokedex).toContain(200)
  })

  it('lands in a parked region’s Box when the player is elsewhere', () => {
    const s = closeWorld(withWorldBox([mon(200, 20)]), data)
    const johto = getRegion(data, 'johto')!
    const inJohto = levelUp(
      startRegion(s, johto, newRegionBlock(johto, 152, data, NOW, newId, createInstance)),
      152,
      25,
    )
    // Johto's best is Lv.25 but the player is back in Kanto before the check runs.
    const back = switchRegion(inJohto, 'kanto')
    const res = releaseWorldHome(back, data)
    expect(regionOf(res.save)).toBe('kanto')
    expect(res.save.parked?.johto?.box.some((p) => p.dex === 200)).toBe(true)
    expect(res.save.parked?.johto?.pokedex).toContain(200)
    expect(res.save.pokedex).not.toContain(200)
  })
})

describe('a waiting Pokémon can only be named or let go', () => {
  it('takes a nickname while it waits, and keeps it when it arrives', () => {
    const s = closeWorld(withWorldBox([mon(92, 30)]), data)
    const id = homersIn(s, 'kanto')[0]!.inst.id
    const named = renamePokemon(s, data, id, 'Boo')!
    expect(homersIn(named, 'kanto')[0]!.inst.nickname).toBe('Boo')
    const arrived = releaseWorldHome(levelUp(named, 4, 30), data).save
    expect(arrived.box.find((p) => p.id === id)?.nickname).toBe('Boo')
  })

  it('can be let go', () => {
    const s = closeWorld(withWorldBox([mon(92, 30)]), data)
    const id = homersIn(s, 'kanto')[0]!.inst.id
    const gone = releaseHomer(s, id)!
    expect(homersIn(gone, 'kanto')).toEqual([])
    expect(releaseHomer(gone, id)).toBeNull()
  })

  it('survives a save round trip', () => {
    const s = closeWorld(withWorldBox([mon(92, 30, { shiny: true, nickname: 'Boo' })]), data)
    const back = parseSave(JSON.parse(JSON.stringify(s)))
    if (!back.ok) throw new Error(back.error)
    expect(back.save.events?.worldHome).toEqual(s.events?.worldHome)
    expect(back.save.events?.world?.home).toEqual(s.events?.world?.home)
  })
})
