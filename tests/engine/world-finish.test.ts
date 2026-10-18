// Finishing a small world early (docs/21 §11): once every one of its areas is done (secret ones included) and its
// Pokédex is complete, the player may close it for themselves, exactly as at its end, and it stays shut for them.
import { describe, expect, it } from 'vitest'
import {
  closeWorld,
  emptyProgress,
  enterWorld,
  finishWorld,
  heldWorld,
  leaveWorld,
  markWorldBye,
  markWorldFinishSeen,
  newSave,
  newSmallWorld,
  regionOf,
  regionSpecies,
  worldByeDue,
  worldCompletion,
  worldFinishable,
  worldFinished,
  worldFinishOn,
  worldFinishPopupDue,
  worldFor,
  type Area,
  type EventAccess,
  type GameData,
  type PortalState,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { BUNDLE } from '@/config/bundle'
import { makeDataWith, newId } from '../fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const DAY = 24 * 3_600_000
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
const LAIR = area('w-lair', 'Mirage Island', 2)
// A secret area counts too; this one is a portal run's, done once its run is won (it is never "cleared").
const RIFT = area('w-rift', 'Rift', 3, { hidden: true, unlockConditions: [{ kind: 'pokedex', count: 3 }] })

const WORLD: SmallWorld = {
  ...newSmallWorld('mirage-2026', REGION.id, iso(T0), iso(T0 + 10 * DAY)),
  minBadges: 0,
  starters: [63, 92, 79],
  mythical: { dex: 151, level: 60, areaId: LAIR.id },
}

/** The world switched on for everyone; finishing it as said (`null`: a row saved before it had a switch). */
function worldData(finishAccess: EventAccess | null = 'all', admin = false): GameData {
  const smallWorlds = { access: 'all' as const, list: [WORLD], ...(finishAccess ? { finishAccess } : {}) }
  const d = makeDataWith({ regions: [REGION], areas: [MARSH, LAIR, RIFT] }, { smallWorlds })
  return admin ? { ...d, viewer: { admin: true } } : d
}
const data = worldData()
const NOW = T0 + DAY
const kanto = (): SaveData => newSave(4, data, 0, newId)
const inside = (): SaveData => enterWorld(kanto(), data, WORLD, 63, NOW, newId)!
const won = { active: false, closed: 10, deck: [], won: true } as unknown as PortalState

/** Inside the world with every area done and every species of its Pokédex caught. */
function complete(save = inside()): SaveData {
  return {
    ...save,
    pokedex: [...regionSpecies(data, REGION.id)].filter((d) => !!data.species[d]),
    areaProgress: {
      [MARSH.id]: { ...emptyProgress(), cleared: true },
      [LAIR.id]: { ...emptyProgress(), cleared: true },
      [RIFT.id]: { ...emptyProgress(), portal: won },
    },
  }
}

describe('what finishing asks for', () => {
  it('counts every area of the world, secret ones included, and its Pokédex page', () => {
    const fresh = worldCompletion(inside(), data, WORLD)
    expect(fresh.areas).toEqual({ done: 0, total: 3 })
    expect(fresh.dex.total).toBe([...regionSpecies(data, REGION.id)].filter((d) => !!data.species[d]).length)
    expect(fresh.dex.total).toBeGreaterThan(3)
    expect(fresh.complete).toBe(false)
    expect(worldCompletion(complete(), data, WORLD)).toMatchObject({ areas: { done: 3, total: 3 }, complete: true })
  })

  it('needs both: every area done and every Pokémon caught', () => {
    const s = complete()
    const oneMissing = { ...s, pokedex: s.pokedex.slice(1) }
    expect(worldCompletion(oneMissing, data, WORLD).complete).toBe(false)
    expect(worldFinishable(oneMissing, data, NOW)).toBeNull()
    const notCleared = { ...s, areaProgress: { ...s.areaProgress, [MARSH.id]: emptyProgress() } }
    expect(worldCompletion(notCleared, data, WORLD).complete).toBe(false)
    expect(worldFinishable(notCleared, data, NOW)).toBeNull()
    expect(worldFinishable(s, data, NOW)?.id).toBe(WORLD.id)
  })

  it('counts a special run won (the portal run, the nightmare) as its area done', () => {
    const s = complete()
    const nightmare = { ...s, areaProgress: { ...s.areaProgress, [RIFT.id]: { ...emptyProgress(), nightmare: { won: true } } } }
    expect(worldCompletion(nightmare as SaveData, data, WORLD).areas.done).toBe(3)
    const stillOn = { ...s, areaProgress: { ...s.areaProgress, [RIFT.id]: { ...emptyProgress(), portal: { ...won, won: false } } } }
    expect(worldCompletion(stillOn, data, WORLD).areas.done).toBe(2)
  })

  it('is offered from inside the world only, while it runs', () => {
    const s = complete()
    expect(worldFinishable(leaveWorld(s, data)!, data, NOW)).toBeNull()
    expect(worldFinishable(s, data, T0 + 10 * DAY)).toBeNull()
    expect(worldFinishable(s, data, null)).toBeNull()
  })

  it('follows its own switch, Off by default, on top of the worlds’ own', () => {
    const s = complete()
    expect(worldFinishOn(worldData(null))).toBe(false)
    expect(worldFinishable(s, worldData(null), NOW)).toBeNull()
    expect(worldFinishable(s, worldData('off'), NOW)).toBeNull()
    expect(worldFinishable(s, worldData('admin'), NOW)).toBeNull()
    expect(worldFinishable(s, worldData('admin', true), NOW)?.id).toBe(WORLD.id)
    const worldsOff = makeDataWith(
      { regions: [REGION], areas: [MARSH, LAIR, RIFT] },
      { smallWorlds: { access: 'off', finishAccess: 'all', list: [WORLD] } },
    )
    expect(worldFinishOn(worldsOff)).toBe(false)
  })

  it('offers itself in a pop-up once; Home’s row still offers it after', () => {
    const s = complete()
    expect(worldFinishPopupDue(inside(), data, NOW)).toBe(false)
    expect(worldFinishPopupDue(s, data, NOW)).toBe(true)
    const seen = markWorldFinishSeen(s)
    expect(worldFinishPopupDue(seen, data, NOW)).toBe(false)
    expect(worldFinishable(seen, data, NOW)?.id).toBe(WORLD.id)
    expect(markWorldFinishSeen(seen)).toBe(seen)
  })
})

describe('finishing', () => {
  it('closes the world as its end does: back in Kanto, its Pokémon gone home, its block gone', () => {
    const s = { ...complete(), gold: 999 }
    const done = finishWorld(s, data, NOW)!
    const ended = closeWorld(s, data)
    expect(regionOf(done)).toBe('kanto')
    expect(done.parked?.[REGION.id]).toBeUndefined()
    expect(done.box).toEqual(ended.box)
    expect(done.events?.worldHome).toEqual(ended.events?.worldHome)
    expect(done.gold).not.toBe(999)
    expect(heldWorld(done)).toBeNull()
    expect(done.events?.world).toMatchObject({ id: WORLD.id, closed: true, finished: true, partner: 63 })
    expect(done.events?.worldDone).toEqual([WORLD.id])
  })

  it('refuses when it can’t be finished now', () => {
    expect(finishWorld(inside(), data, NOW)).toBeNull()
    expect(finishWorld(complete(), worldData('off'), NOW)).toBeNull()
    expect(finishWorld(complete(), data, T0 + 10 * DAY)).toBeNull()
  })

  it('keeps the world shut for that player while it still runs for others', () => {
    const done = finishWorld(complete(), data, NOW)!
    expect(worldFinished(done, WORLD.id)).toBe(true)
    expect(worldFor(done, data, NOW)).toBeNull()
    expect(worldFor(kanto(), data, NOW)?.id).toBe(WORLD.id)
    expect(enterWorld(done, data, WORLD, 63, NOW, newId)).toBeNull()
    // Its closing pop-up says it was finished, once; the world stays shut after it.
    expect(worldByeDue(done, data, NOW)).toMatchObject({ id: WORLD.id, entered: true, finished: true })
    const seen = markWorldBye(done, WORLD.id)
    expect(worldByeDue(seen, data, NOW)).toBeNull()
    expect(worldFor(seen, data, NOW)).toBeNull()
    expect(enterWorld(seen, data, WORLD, 63, NOW, newId)).toBeNull()
    // And no second closing pop-up when it ends for everyone.
    expect(worldByeDue(seen, data, T0 + 11 * DAY)).toBeNull()
  })

  it('a world closed at its end says it ended, not that it was finished', () => {
    expect(worldByeDue(closeWorld(inside(), data), data, T0 + 11 * DAY)).toMatchObject({ finished: false })
  })

  it('keeps what it records through a save round trip', () => {
    const done = finishWorld(markWorldFinishSeen(complete()), data, NOW)!
    const back = parseSave(JSON.parse(JSON.stringify(done)))
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.save.events?.world).toMatchObject({ finished: true, finishSeen: true, closed: true })
      expect(back.save.events?.worldDone).toEqual([WORLD.id])
    }
  })
})
