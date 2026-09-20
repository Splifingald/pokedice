import { describe, expect, it } from 'vitest'
import { isAreaUnlocked, linearAreas, newSave, offeredRegion, regionOf, unlockedRegions } from '@/engine'
import { parseSave, migrate } from '@/save/schema'
import { pickNewest } from '@/save/cloud'
import { bundleToRows, isPlayableBundle, rowsToBundle } from '@/config/mapping'
import { BUNDLE } from '@/config/bundle'
import { data, newId } from './fixtures'

describe('save schema', () => {
  it('round-trips a fresh save through JSON', () => {
    const s = newSave(7, data, 123, newId)
    const res = parseSave(JSON.parse(JSON.stringify(s)))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.save).toEqual(s)
  })

  it('rejects garbage and wrong versions', () => {
    expect(parseSave(null).ok).toBe(false)
    expect(parseSave({ version: 2 }).ok).toBe(false)
    expect(parseSave({ ...newSave(7, data, 1, newId), gold: -5 }).ok).toBe(false)
    expect(parseSave({ ...newSave(7, data, 1, newId), box: [] }).ok).toBe(false)
    expect(migrate('x')).toBe('x')
  })

  it('repairs dangling team ids and fills missing upgrade levels', () => {
    const s = newSave(7, data, 1, newId)
    const raw = JSON.parse(JSON.stringify({ ...s, team: ['nope', s.team[0], s.team[0]], comboLevels: {}, pokedex: [7, 7] }))
    const res = parseSave(raw)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.save.team).toEqual([s.team[0]])
    expect(res.save.comboLevels.five_kind).toBe(1)
    expect(res.save.pokedex).toEqual([7])
  })

  it('accepts older area progress without bossesDefeated', () => {
    const s = newSave(7, data, 1, newId)
    const raw = { ...s, areaProgress: { a: { xp: 3, cleared: false, bossDefeated: false } } }
    const res = parseSave(raw)
    expect(res.ok && res.save.areaProgress.a!.bossesDefeated).toEqual([])
  })
})

describe('no passive regen', () => {
  it('a save from before its removal still loads, its HP untouched and the old fields dropped', () => {
    const s = newSave(4, data, 0, newId)
    const old = { ...s, lastRegenTick: 0, box: s.box.map((p) => ({ ...p, currentHp: 1, regenCarry: 0.5 })) }
    const res = parseSave(JSON.parse(JSON.stringify(old)))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.save.box[0]!.currentHp).toBe(1)
    expect('lastRegenTick' in res.save).toBe(false)
    expect('regenCarry' in res.save.box[0]!).toBe(false)
  })
})

describe('cloud sync', () => {
  it('newest updatedAt wins', () => {
    const a = { ...newSave(1, data, 0, newId), updatedAt: 10 }
    const b = { ...newSave(4, data, 0, newId), updatedAt: 20 }
    expect(pickNewest(a, b)).toEqual({ winner: 'cloud', save: b })
    expect(pickNewest(b, a)).toEqual({ winner: 'local', save: b })
    expect(pickNewest(null, a).winner).toBe('cloud')
    expect(pickNewest(a, null).winner).toBe('local')
    expect(pickNewest(null, null).winner).toBe('none')
  })
})

describe('content mapping', () => {
  it('bundle → rows → bundle is lossless', () => {
    const back = rowsToBundle(bundleToRows(BUNDLE))
    expect(back.pokemon).toEqual(BUNDLE.pokemon)
    expect(back.areas).toEqual(BUNDLE.areas)
    expect(back.trainers).toEqual(BUNDLE.trainers)
    expect(back.upgrades).toEqual(BUNDLE.upgrades)
    expect(back.config).toEqual(BUNDLE.config)
    expect(back.typeChart).toEqual(BUNDLE.typeChart)
    expect(back.diceTypes).toEqual(BUNDLE.diceTypes)
    expect(back.items).toEqual(BUNDLE.items)
    expect(isPlayableBundle(back)).toBe(true)
    expect(isPlayableBundle({ ...back, pokemon: [] })).toBe(false)
  })

  it('coerces Postgres numerics that arrive as strings', () => {
    const rows = bundleToRows(BUNDLE)
    rows.type_chart = rows.type_chart.map((r) => ({ ...r, multiplier: String(r.multiplier) }))
    rows.areas = rows.areas.map((r) => ({ ...r, backtrack_multiplier: '0.5' }))
    const b = rowsToBundle(rows)
    expect(typeof b.typeChart[0]!.multiplier).toBe('number')
    expect(b.areas[0]!.backtrackMultiplier).toBe(0.5)
  })
})

describe('a save from before regions', () => {
  const chain = linearAreas(data, 'kanto')
  /** Exactly the shape saves had before regions existed: no `region`, no `parked`, mid-Kanto. */
  const legacy = () => ({
    version: 1,
    updatedAt: 1_700_000_000_000,
    gold: 3120,
    pokedex: [1, 2, 3, 16, 19, 25, 74],
    box: [
      { id: 'a', dex: 3, level: 41, xp: 5, currentHp: 90, caughtAt: 1 },
      { id: 'b', dex: 25, level: 30, xp: 0, currentHp: 60, caughtAt: 2 },
    ],
    team: ['a', 'b'],
    inventory: { potion: 6, 'great-ball': 3 },
    comboLevels: { pair: 5, two_pair: 3, three_kind: 2, small_straight: 1, full_house: 1, four_kind: 1, full_straight: 1, five_kind: 1 },
    dieLevels: { grass: 6, electric: 4, normal: 3 },
    currentAreaId: chain[9]!.id,
    areaProgress: Object.fromEntries(
      chain.slice(0, 9).map((a) => [a.id, { roundsDone: 2, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }]),
    ),
    settings: { sfx: true, reducedMotion: false, multiExp: true },
    player: { name: 'Greg', character: 'red' },
  })

  it('still loads, in Kanto, with everything where the player left it', () => {
    const res = parseSave(JSON.parse(JSON.stringify(legacy())))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const s = res.save
    expect(regionOf(s)).toBe('kanto')
    expect(s.gold).toBe(3120)
    expect(s.box.map((p) => p.id)).toEqual(['a', 'b'])
    expect(s.inventory).toEqual({ potion: 6, 'great-ball': 3 })
    expect(s.dieLevels.grass).toBe(6)
    expect(s.comboLevels.pair).toBe(5)
    // The area ids in areaProgress still name real areas: progress is not silently lost.
    expect(Object.values(s.areaProgress).filter((p) => p.cleared)).toHaveLength(9)
    expect(s.currentAreaId).toBe(chain[9]!.id)
    expect(isAreaUnlocked(s, chain[9]!.id, data)).toBe(true)
  })

  it('sees no region but Kanto until its league is beaten', () => {
    const res = parseSave(JSON.parse(JSON.stringify(legacy())))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(unlockedRegions(res.save, data).map((r) => r.id)).toEqual(['kanto'])
    expect(offeredRegion(res.save, data)).toBeNull()
  })

  it('keeps every Kanto area id the bundle shipped with, so saved progress still matches', () => {
    // Progress is keyed by area id. If the seeder ever re-derived these, every player's campaign would reset.
    for (const a of chain) expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(chain.map((a) => a.name)).toContain('Route 1')
    expect(chain).toHaveLength(24)
  })
})
