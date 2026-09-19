// Gyms, the linear chain, secret areas and area type profiles.
import { describe, expect, it } from 'vitest'
import { applyCatch } from '@/engine'
import {
  applyVictory,
  areaTypeProfile,
  badgeCase,
  canSkip,
  challengeEncounter,
  conditionStatus,
  createRng,
  dueGym,
  enemyUpgradeLevelFor,
  emptyProgress,
  isAreaUnlocked,
  linearAreas,
  newSave,
  progressOf,
  rollEncounter,
  trainerSpecialty,
  unlockedHiddenAreas,
  type Area,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

// Names repeat across regions ("Victory Road", "Indigo Plateau"), so this file looks in Kanto only.
const byName = (name: string): Area => data.areas.find((a) => a.name === name && (a.regionId ?? 'kanto') === 'kanto')!
const chain = linearAreas(data, 'kanto')
const FOREST = byName('Viridian Forest')
const ROUTE3 = byName('Route 3')
const INDIGO = byName('Indigo Plateau')
const POWER = byName('Power Plant')
const CAVE = byName('Cerulean Cave')
const FARAWAY = byName('Faraway Island')

const fresh = () => newSave(1, data, 0, newId)
const withProgress = (s: SaveData, area: Area, p: Partial<ReturnType<typeof emptyProgress>>): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [area.id]: { ...emptyProgress(), ...s.areaProgress[area.id], ...p } },
})
const withDex = (s: SaveData, n: number): SaveData => ({ ...s, pokedex: Array.from({ length: n }, (_, i) => i + 1) })

describe('linear chain', () => {
  it('each area opens when the previous one is cleared; hidden areas are skipped', () => {
    let s = fresh()
    expect(chain.filter((a) => isAreaUnlocked(s, a.id, data)).map((a) => a.name)).toEqual(['Route 1'])
    for (const a of chain.slice(0, 5)) s = withProgress(s, a, { cleared: true })
    expect(isAreaUnlocked(s, chain[5]!.id, data)).toBe(true)
    expect(isAreaUnlocked(s, chain[6]!.id, data)).toBe(false)
    expect(chain.some((a) => a.hidden)).toBe(false)
  })
})

describe('gyms', () => {
  it('once every round is done the gym leader is a challenge the player picks — never dealt, never skipped', () => {
    const s = fresh()
    const full = FOREST.roundsToClear!
    expect(dueGym(FOREST, { ...emptyProgress(), roundsDone: full - 1 }, data)).toBeNull()
    const p = { ...emptyProgress(), roundsDone: full }
    expect(dueGym(FOREST, p, data)?.name).toBe('Brock')
    const ctx = { area: FOREST, progress: p, data, teamAvgLevel: 10, teamHurt: false, isFirstInArea: false, pokedex: s.pokedex }
    expect(rollEncounter(ctx, createRng(1)).kind).not.toBe('gym')
    const enc = challengeEncounter(FOREST, p, data, 10)!
    expect(enc).toMatchObject({ kind: 'gym', name: 'Brock', role: 'leader', badge: 'Boulder Badge', index: 1, total: 1 })
    expect(canSkip(enc, 'free', 0)).toBe(false)
  })

  it('every round done is not enough: the area clears when the leader falls, awarding the badge and double gold', () => {
    const brock = dueGym(FOREST, { ...emptyProgress(), roundsDone: 99 }, data)!
    let s = withProgress(fresh(), FOREST, { roundsDone: 99 })
    const hit = (dex: number, level: number, last: boolean) =>
      applyVictory(
        s,
        { areaId: FOREST.id, kind: 'gym', enemyDex: dex, enemyLevel: level, fighterUid: s.team[0]!, gymTrainerId: brock.id, gymComplete: last },
        data,
        createRng(1),
        0,
        newId,
      )
    const r1 = hit(74, 12, false)
    expect(r1.events).toContainEqual({ kind: 'gold', amount: 24 })
    expect(progressOf(r1.save, FOREST.id).cleared).toBe(false)
    s = r1.save
    const r2 = hit(95, 14, true)
    expect(r2.events).toContainEqual({ kind: 'gym_defeated', trainerId: brock.id, name: 'Brock', badge: 'Boulder Badge', role: 'leader' })
    expect(r2.events).toContainEqual({ kind: 'area_cleared', areaId: FOREST.id, nextAreaId: ROUTE3.id })
    expect(isAreaUnlocked(r2.save, ROUTE3.id, data)).toBe(true)
    expect(badgeCase(r2.save, data).filter((b) => b.earned).map((b) => b.badge)).toEqual(['Boulder Badge'])
  })

  it('the Elite Four come one after another, then the Champion', () => {
    const full = { ...emptyProgress(), roundsDone: 99 }
    const order: string[] = []
    let p = full
    for (let i = 0; i < 5; i++) {
      const t = dueGym(INDIGO, p, data)!
      order.push(t.name)
      p = { ...p, gymsDefeated: [...p.gymsDefeated, t.id] }
    }
    expect(order).toEqual(['Elite Four Lorelei', 'Elite Four Bruno', 'Elite Four Agatha', 'Elite Four Lance', 'Champion Blue'])
    expect(dueGym(INDIGO, p, data)).toBeNull()
  })

  it('the badge case lists the 8 badges in chain order', () => {
    expect(badgeCase(fresh(), data)).toHaveLength(8)
    expect(badgeCase(fresh(), data).every((b) => !b.earned)).toBe(true)
  })
})

describe('secret areas', () => {
  // Thresholds are tuned in admin: read them from the data.
  const cond = <K extends 'pokedex' | 'maxLevel'>(a: Area, kind: K) =>
    a.unlockConditions!.find((c): c is Extract<typeof c, { kind: K }> => c.kind === kind)!
  const POWER_DEX = cond(POWER, 'pokedex').count
  const CAVE_LEVEL = cond(CAVE, 'maxLevel').level

  it('open on their conditions: Pokédex count or highest level', () => {
    const s = fresh()
    expect(isAreaUnlocked(s, POWER.id, data)).toBe(false)
    expect(isAreaUnlocked(withDex(s, POWER_DEX - 1), POWER.id, data)).toBe(false)
    expect(isAreaUnlocked(withDex(s, POWER_DEX), POWER.id, data)).toBe(true)
    expect(isAreaUnlocked(withDex(s, 149), FARAWAY.id, data)).toBe(false)
    expect(isAreaUnlocked(withDex(s, 150), FARAWAY.id, data)).toBe(true)
    const strong = { ...s, box: s.box.map((p) => ({ ...p, level: CAVE_LEVEL })) }
    expect(isAreaUnlocked(strong, CAVE.id, data)).toBe(true)
    expect(unlockedHiddenAreas(strong, data)).toEqual([CAVE.id])
    expect(conditionStatus({ kind: 'maxLevel', level: CAVE_LEVEL }, s, data)).toMatchObject({ met: false, current: 5, target: CAVE_LEVEL })
  })

  it('announce themselves the moment a catch meets the condition', () => {
    const s = withDex(fresh(), POWER_DEX - 1)
    const r = applyCatch(s, { dex: POWER_DEX, level: 3 }, { mode: 'new' }, data, 0, newId)
    expect(r.events).toContainEqual({ kind: 'secret_unlocked', areaId: POWER.id })
  })

  it('Mew can be challenged on Faraway Island from the first visit', () => {
    expect(challengeEncounter(FARAWAY, emptyProgress(), data, 70)).toEqual({ kind: 'boss', dex: 151, level: 65 })
  })
})

describe('area type profiles', () => {
  it('Viridian Forest is mostly Bug', () => {
    const p = areaTypeProfile(FOREST, data)
    expect(p.main[0]).toBe('bug')
    expect(p.main.length).toBeGreaterThanOrEqual(2)
    expect(p.main.length).toBeLessThanOrEqual(3)
  })

  it('trainer-only areas use their trainers; an empty area has no profile', () => {
    expect(areaTypeProfile(byName('Silph Co.'), data).main.length).toBeGreaterThan(0)
    expect(areaTypeProfile(FARAWAY, data)).toEqual({ main: [], shares: {} })
  })

  it("names a trainer's specialty", () => {
    const brock = dueGym(FOREST, { ...emptyProgress(), roundsDone: 99 }, data)!
    expect(trainerSpecialty(brock, data)).toBe('rock')
  })

  it('shows no specialty for a mixed team (under 40 %), and breaks ties by how many Pokémon carry the type', () => {
    const byTrainer = (name: string) => Object.values(data.trainers).find((t) => t.name === name)!
    expect(trainerSpecialty(byTrainer('Champion Blue'), data)).toBeNull() // Charizard, Gyarados, Pidgeot
    expect(trainerSpecialty(byTrainer('Elite Four Lorelei'), data)).toBe('ice') // water 2 = ice 2, but 3 carry ice
    expect(trainerSpecialty(byTrainer('Elite Four Bruno'), data)).toBe('fighting')
  })
})

describe('enemy upgrade levels', () => {
  it('start at 1 and rise by one after each Gym Leader area; secret areas follow the main route', () => {
    const lv = (name: string) => byName(name).enemyUpgradeLevel
    expect([lv('Route 1'), lv('Viridian Forest'), lv('Route 3'), lv('Routes 5 & 6'), lv('Victory Road')]).toEqual([1, 1, 2, 3, 9])
    expect([lv('Power Plant'), lv('Cerulean Cave')]).toEqual([5, 9])
  })

  it('a trainer or legendary override beats the area, the area beats the global setting', () => {
    const brock = dueGym(FOREST, { ...emptyProgress(), roundsDone: 99 }, data)!
    const gym = challengeEncounter(FOREST, { ...emptyProgress(), roundsDone: 99 }, data, 10)!
    expect(enemyUpgradeLevelFor(gym, FOREST, data)).toBe(1)
    const withTrainer = { ...data, trainers: { ...data.trainers, [brock.id]: { ...brock, upgradeLevel: 4 } } }
    expect(enemyUpgradeLevelFor(gym, FOREST, withTrainer)).toBe(4)
    const seafoam = byName('Seafoam Islands')
    const boss = { kind: 'boss', dex: 144, level: 50 } as const
    expect(enemyUpgradeLevelFor(boss, seafoam, data)).toBe(7)
    const override = { ...seafoam, legendaryBoss: seafoam.legendaryBoss!.map((b) => ({ ...b, upgradeLevel: 10 })) }
    expect(enemyUpgradeLevelFor(boss, override, data)).toBe(10)
    expect(enemyUpgradeLevelFor({ kind: 'wild', dex: 16, level: 3, isNew: true }, { ...FOREST, enemyUpgradeLevel: null }, data)).toBe(data.config.enemyUpgradeLevel)
  })
})
