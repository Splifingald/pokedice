import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  applyHp,
  applyVictory,
  applyWipe,
  buyComboUpgrade,
  buyDieUpgrade,
  buyItem,
  canSkip,
  centerHeal,
  challengeEncounter,
  compileGameData,
  consumeItem,
  createInstance,
  createRng,
  dueBoss,
  emptyProgress,
  enemyLevel,
  getArea,
  hasAbleTeam,
  healAmount,
  instanceMaxHp,
  isAreaUnlocked,
  isTeamHurt,
  linearAreas,
  maxComboLevel,
  maxDieLevel,
  mergeConfig,
  newSave,
  progressOf,
  rollEncounter,
  setTeam,
  speciesName,
  swapIntoTeam,
  teamAverageLevel,
  teamOf,
  applyItemToInstance,
  dieBonusAt,
  type Area,
  type Encounter,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { data, makeData, newId } from '../fixtures'

const byName = (name: string): Area => {
  const a = data.areas.find((x) => x.name === name)
  if (!a) throw new Error(`no area ${name}`)
  return a
}
const [A1, A2] = linearAreas(data) as [Area, Area]
const FOREST = byName('Viridian Forest')
const SEAFOAM = byName('Seafoam Islands')
const CAVE = byName('Cerulean Cave')
const FARAWAY = byName('Faraway Island')

const fresh = () => newSave(4, data, 1000, newId)

describe('new game', () => {
  it('starts with the starter at Lv.5, marked caught, in area 1', () => {
    const s = fresh()
    expect(teamOf(s)).toHaveLength(1)
    expect(teamOf(s)[0]).toMatchObject({ dex: 4, level: 5 })
    expect(s.pokedex).toEqual([4])
    expect(s.currentAreaId).toBe(A1.id)
    expect(s.comboLevels.pair).toBe(1)
    expect(s.dieLevels.fire).toBe(1)
    expect(Object.keys(s.dieLevels)).not.toContain('base')
    expect(isAreaUnlocked(s, A1.id, data)).toBe(true)
    expect(isAreaUnlocked(s, A2.id, data)).toBe(false)
    expect(isAreaUnlocked(s, 'nope', data)).toBe(false)
    expect(hasAbleTeam(s)).toBe(true)
  })
})

describe('encounters', () => {
  const ctx = (save: SaveData, over: Partial<Parameters<typeof rollEncounter>[0]> = {}) => ({
    area: A1,
    progress: progressOf(save, A1.id),
    data,
    teamAvgLevel: teamAverageLevel(save),
    teamHurt: isTeamHurt(save, data),
    isFirstInArea: false,
    pokedex: save.pokedex,
    ...over,
  })

  it('forces a Center first when anyone is hurt', () => {
    const base = fresh()
    const hurt = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 1 })) }
    expect(rollEncounter(ctx(hurt, { isFirstInArea: true }), createRng(1))).toEqual({ kind: 'center', forced: true })
    expect(rollEncounter(ctx(fresh(), { isFirstInArea: true }), createRng(1)).kind).not.toBe('boss')
  })

  it('rolls wild encounters from the pool, flagged NEW when uncaught', () => {
    const seen = new Set<string>()
    const rng = createRng(3)
    for (let i = 0; i < 200; i++) {
      const e = rollEncounter(ctx(fresh()), rng)
      seen.add(e.kind)
      if (e.kind === 'wild') {
        expect(A1.wildPool.some((w) => w.dex === e.dex)).toBe(true)
        expect(e.level).toBeGreaterThanOrEqual(2)
        expect(e.level).toBeLessThanOrEqual(5)
        expect(e.isNew).toBe(true)
      }
    }
    expect(seen.has('trainer')).toBe(false) // Route 1 has no trainers
    expect(seen.has('center')).toBe(true)
  })

  it('offers trainers in Viridian Forest', () => {
    const rng = createRng(8)
    const kinds = Array.from({ length: 100 }, () => rollEncounter(ctx(fresh(), { area: FOREST, progress: emptyProgress() }), rng))
    const t = kinds.find((k): k is Extract<Encounter, { kind: 'trainer' }> => k.kind === 'trainer')
    expect(t).toBeDefined()
    expect(t!.team.length).toBeGreaterThanOrEqual(1)
  })

  it('offers the gauge legendary as a challenge when the gauge is full, once', () => {
    const p = { ...emptyProgress(), xp: 640 }
    expect(dueBoss(SEAFOAM, p, 10)).toMatchObject({ dex: 144, level: 50 })
    expect(dueBoss(SEAFOAM, { ...p, xp: 639 }, 10)).toBeNull()
    expect(dueBoss(SEAFOAM, { ...p, bossesDefeated: [144] }, 10)).toBeNull()
    expect(dueBoss(A1, p, 10)).toBeNull()
    expect(rollEncounter(ctx(fresh(), { area: SEAFOAM, progress: p }), createRng(1)).kind).not.toBe('boss') // offered, not dealt
    expect(challengeEncounter(SEAFOAM, p, data, 10)).toEqual({ kind: 'boss', dex: 144, level: 50 })
  })

  it('team-average bosses (Cerulean Cave) and arrival bosses (Faraway Island)', () => {
    const p = emptyProgress()
    expect(dueBoss(CAVE, p, 59)).toBeNull()
    expect(dueBoss(CAVE, p, 60)?.dex).toBe(150)
    expect(dueBoss(CAVE, { ...p, bossesDefeated: [150] }, 90)).toBeNull()
    expect(dueBoss(FARAWAY, p, 1)?.dex).toBe(151)
  })

  it('scaling areas draw enemy levels from the team average ± 3', () => {
    const rng = createRng(5)
    for (let i = 0; i < 50; i++) {
      const lv = enemyLevel(5, { area: CAVE, data, teamAvgLevel: 30 }, rng)
      expect(lv).toBeGreaterThanOrEqual(27)
      expect(lv).toBeLessThanOrEqual(33)
    }
    expect(enemyLevel(7, { area: A1, data, teamAvgLevel: 30 }, rng)).toBe(7)
  })

  it('dev tools can force the encounter type', () => {
    const rng = createRng(2)
    expect(rollEncounter(ctx(fresh(), { area: FOREST, forceKind: 'trainer' }), rng).kind).toBe('trainer')
    expect(rollEncounter(ctx(fresh(), { forceKind: 'center' }), rng).kind).toBe('center')
    expect(rollEncounter(ctx(fresh(), { forceKind: 'wild' }), rng).kind).toBe('wild')
    expect(rollEncounter(ctx(fresh(), { area: SEAFOAM, forceKind: 'boss' }), rng)).toMatchObject({ kind: 'boss', dex: 144 })
    expect(rollEncounter(ctx(fresh(), { area: FOREST, forceKind: 'gym' }), rng)).toMatchObject({ kind: 'gym', name: 'Brock' })
    expect(rollEncounter(ctx(fresh(), { forceKind: 'item' }), rng).kind).toBe('item') // Route 1 has loot
  })

  it('skip policy', () => {
    const wild: Encounter = { kind: 'wild', dex: 16, level: 3, isNew: true }
    expect(canSkip(wild, 'free', 5)).toBe(true)
    expect(canSkip(wild, 'once', 0)).toBe(true)
    expect(canSkip(wild, 'once', 1)).toBe(false)
    expect(canSkip(wild, 'none', 0)).toBe(false)
    expect(canSkip({ kind: 'center', forced: true }, 'free', 0)).toBe(false)
    expect(canSkip({ kind: 'boss', dex: 145, level: 25 }, 'free', 0)).toBe(false)
  })
})

describe('victory rewards', () => {
  const win = (s: SaveData, over: Partial<Parameters<typeof applyVictory>[1]>) =>
    applyVictory(s, { areaId: A1.id, kind: 'wild', enemyDex: 16, enemyLevel: 4, fighterUid: s.team[0]!, ...over }, data, createRng(1), 5, newId)

  it('wild win: XP to the fighter and the gauge, no Pokédollars, no automatic catch', () => {
    const s = fresh()
    const fighter = s.team[0]!
    const r = win(s, {})
    expect(r.save.gold).toBe(0)
    expect(progressOf(r.save, A1.id).xp).toBe(4)
    expect(r.save.box.find((p) => p.id === fighter)!.xp).toBe(4)
    // Catching is its own throw now (catching.ts): a K.O. alone adds nobody.
    expect(r.save.team).toHaveLength(1)
    expect(r.save.pokedex).not.toContain(16)
    expect(r.events.some((e) => e.kind === 'caught')).toBe(false)
  })

  it('a catch with a full team gets the "Add to team?" choice', () => {
    let s = fresh()
    for (const dex of [16, 19]) s = applyCatch(s, { dex, level: 3 }, { mode: 'new' }, data, 5, newId).save
    expect(s.team).toHaveLength(3)
    const r = applyCatch(s, { dex: 10, level: 3 }, { mode: 'new' }, data, 5, newId)
    expect(r.needsTeamChoice).toBe(true)
    expect(r.save.team).toHaveLength(3)
    expect(r.save.box).toHaveLength(4)
    const swapped = swapIntoTeam(r.save, r.caughtId, r.save.team[2]!, data)
    expect(swapped.team).toContain(r.caughtId)
    expect(swapped.team).toHaveLength(3)
  })

  it('trainer win pays Pokédollars = level', () => {
    const r = win(fresh(), { areaId: FOREST.id, kind: 'trainer', enemyDex: 10, enemyLevel: 7 })
    expect(r.save.gold).toBe(7)
  })

  it('backtracking into a cleared area halves gold and XP', () => {
    const s = { ...fresh(), areaProgress: { [FOREST.id]: { ...emptyProgress(), cleared: true, xp: 150 } } }
    const r = win(s, { areaId: FOREST.id, kind: 'trainer', enemyDex: 10, enemyLevel: 8 })
    expect(r.save.gold).toBe(4)
    expect(r.events).toContainEqual({ kind: 'xp', uid: s.team[0], amount: 4 })
  })

  it('filling a gauge with no gym or legendary clears the area and unlocks the next', () => {
    const s = { ...fresh(), areaProgress: { [A1.id]: { ...emptyProgress(), xp: 48 } } }
    const r = win(s, { enemyLevel: 3 })
    expect(progressOf(r.save, A1.id).cleared).toBe(true)
    expect(r.events).toContainEqual({ kind: 'area_cleared', areaId: A1.id, nextAreaId: A2.id })
    expect(isAreaUnlocked(r.save, A2.id, data)).toBe(true)
  })

  it('an area with a legendary unlocks only after it (catching it is a separate throw)', () => {
    const s = { ...fresh(), areaProgress: { [SEAFOAM.id]: { ...emptyProgress(), xp: 650 } } }
    const r = win(s, { areaId: SEAFOAM.id, enemyDex: 86, enemyLevel: 30 })
    expect(progressOf(r.save, SEAFOAM.id).cleared).toBe(false)
    const b = win(r.save, { areaId: SEAFOAM.id, kind: 'boss', enemyDex: 144, enemyLevel: 50 })
    const p = progressOf(b.save, SEAFOAM.id)
    expect(p.bossesDefeated).toEqual([144])
    expect(p.bossDefeated).toBe(true)
    expect(p.cleared).toBe(true)
    expect(b.save.pokedex).not.toContain(144)
    expect(b.save.gold).toBe(0)
  })

  it('team XP share mode gives every member the XP', () => {
    const d = makeData({ xpShareMode: 'team' })
    let s = newSave(4, d, 0, newId)
    s = applyCatch(s, { dex: 16, level: 3 }, { mode: 'new' }, d, 5, newId).save
    const r = applyVictory(s, { areaId: A1.id, kind: 'wild', enemyDex: 19, enemyLevel: 3, fighterUid: s.team[0]! }, d, createRng(1), 5, newId)
    expect(r.events.filter((e) => e.kind === 'xp')).toHaveLength(2)
  })

  it('evolution registers the new species in the Pokédex', () => {
    const s = fresh()
    const lvl15 = { ...s, box: s.box.map((p) => ({ ...p, level: 15 })) }
    const r = win(lvl15, { kind: 'trainer', enemyLevel: 100 })
    expect(r.save.pokedex).toContain(5)
  })
})

describe('wipe, center, team, shop, upgrades', () => {
  it('a wipe loses the round: the gauge goes back to the round start, the deck is dropped, a full gauge stays', () => {
    const s0 = fresh()
    const ko = (s: SaveData): SaveData => ({ ...s, gold: 99, box: s.box.map((p) => ({ ...p, currentHp: 0 })) })
    const at = (s: SaveData, xp: number, extra: Partial<SaveData['areaProgress'][string]> = {}): SaveData => ({
      ...s,
      areaProgress: { ...s.areaProgress, [A1.id]: { ...progressOf(s, A1.id), xp, ...extra } },
    })
    // No round yet → back to 0.
    const w = applyWipe(ko(at(s0, 41)), A1.id, data)
    expect(progressOf(w, A1.id).xp).toBe(0)
    expect(w.gold).toBe(99)
    expect(teamOf(w)[0]!.currentHp).toBe(instanceMaxHp(teamOf(w)[0]!, data))
    expect(teamOf(w)[0]!.level).toBe(5)
    // A round that began at 30, half played, gauge now 41 → back to 30, and the next encounter deals a new round.
    const mid = at(s0, 41, { roundStartXp: 30, round: 2, deck: ['wild', 'wild', 'item'], drawn: ['wild', 'center'] })
    const lost = progressOf(applyWipe(ko(mid), A1.id, data), A1.id)
    expect(lost).toMatchObject({ xp: 30, deck: [], drawn: [], round: 2 })
    // A full gauge stays full.
    const full = A1.xpToUnlockNext!
    expect(progressOf(applyWipe(ko(at(s0, full, { roundStartXp: 30, deck: ['wild'] })), A1.id, data), A1.id).xp).toBe(full)
  })

  it('a full gauge offers the gym as a challenge instead of forcing it', () => {
    const forest = data.areas.find((a) => a.name === 'Viridian Forest')!
    const progress = { ...emptyProgress(), xp: forest.xpToUnlockNext! }
    const ctx = { area: forest, progress, data, teamAvgLevel: 5, teamHurt: false, isFirstInArea: false, pokedex: [] as number[] }
    const rng = createRng(9)
    for (let i = 0; i < 30; i++) expect(rollEncounter(ctx, rng).kind).not.toBe('gym')
    expect(challengeEncounter(forest, progress, data, 5)).toMatchObject({ kind: 'gym', name: 'Brock' })
    expect(challengeEncounter(forest, { ...progress, xp: 0 }, data, 5)).toBeNull()
  })

  it('the Center heals team and box, fainted included', () => {
    const s0 = fresh()
    const s = { ...s0, box: s0.box.map((p) => ({ ...p, currentHp: 0 })) }
    expect(isTeamHurt(s, data)).toBe(true)
    expect(hasAbleTeam(s)).toBe(false)
    expect(isTeamHurt(centerHeal(s, data), data)).toBe(false)
  })

  it('team edits are validated', () => {
    const s = fresh()
    expect(setTeam(s, [], data)).toBe(s)
    expect(setTeam(s, ['ghost-id'], data)).toBe(s)
    expect(swapIntoTeam(s, 'ghost-id', null, data)).toBe(s)
    expect(swapIntoTeam(s, s.team[0]!, null, data)).toBe(s)
    const extra = createInstance(16, 3, data, 'x1', 0)
    const withBox = { ...s, box: [...s.box, extra] }
    expect(swapIntoTeam(withBox, 'x1', null, data).team).toEqual([s.team[0], 'x1'])
  })

  it('shop: buy, consume and use potions out of battle', () => {
    let s: SaveData = { ...fresh(), gold: 40, inventory: {} } // without the starter kit
    expect(buyItem(s, 'hyper-potion', 1, data)).toBeNull()
    expect(buyItem(s, 'nope', 1, data)).toBeNull()
    expect(buyItem(s, 'potion', 0, data)).toBeNull()
    s = buyItem(s, 'potion', 2, data)!
    expect(s.gold).toBe(10)
    expect(s.inventory.potion).toBe(2)
    const id = s.team[0]!
    expect(applyItemToInstance(s, 'potion', id, data)).toBeNull() // full HP
    const hurt = applyHp(s, { [id]: 3 })
    const healed = applyItemToInstance(hurt, 'potion', id, data)!
    expect(healed.inventory.potion).toBe(1)
    expect(teamOf(healed)[0]!.currentHp).toBe(instanceMaxHp(teamOf(healed)[0]!, data))
    expect(consumeItem({ ...s, inventory: {} }, 'potion')).toBeNull()
    expect(applyItemToInstance(hurt, 'nope', id, data)).toBeNull()
    expect(applyItemToInstance({ ...hurt, inventory: {} }, 'potion', id, data)).toBeNull()
    expect(healAmount(data.items.potion!, 0, 50)).toBe(0)
  })

  it('upgrades cost the table price and stop at level 10', () => {
    let s: SaveData = { ...fresh(), gold: 10_000 }
    s = buyComboUpgrade(s, 'pair', data)!
    expect(s.comboLevels.pair).toBe(2)
    expect(s.gold).toBe(10_000 - 5)
    s = buyDieUpgrade(s, 'fire', data)!
    expect(s.dieLevels.fire).toBe(2)
    expect(s.gold).toBe(10_000 - 5 - 10)
    for (let i = 0; i < 20; i++) s = buyDieUpgrade(s, 'fire', data) ?? s
    expect(s.dieLevels.fire).toBe(maxDieLevel('fire', data))
    expect(buyDieUpgrade(s, 'fire', data)).toBeNull()
    expect(buyComboUpgrade({ ...s, gold: 0 }, 'five_kind', data)).toBeNull()
    expect(maxComboLevel('pair', data)).toBe(10)
    expect(dieBonusAt('fire', 10, data)).toBe(15)
  })
})

describe('config & data plumbing', () => {
  it('merges partial config over the defaults', () => {
    const c = mergeConfig({ goldMultiplier: 2, xpCurve: { A: 3 }, status: { burn: { duration: 5 } } })
    expect(c.goldMultiplier).toBe(2)
    expect(c.encounterMode).toBe('deck')
    expect(c.xpCurve).toEqual({ A: 3, B: 1.15, C: 3 })
    expect(c.status.burn).toEqual({ threshold: 1, damagePerStack: 1, duration: 5 })
    expect(mergeConfig(undefined).maxTeamSize).toBe(3)
  })

  it('normalises legacy rows (single-object legendary_boss, missing v1.3 fields) and sorts areas', () => {
    const areas = BUNDLE.areas.map((a) => {
      if (a.orderIndex !== 3) return a
      const { gyms: _g, hidden: _h, unlockConditions: _u, ...legacy } = a
      return { ...legacy, legendaryBoss: { dex: 145, level: 25 } } as never
    })
    const trainers = BUNDLE.trainers.map(({ role: _r, badge: _b, ...t }) => t as never)
    const d = compileGameData({ ...BUNDLE, areas: [...areas].reverse(), trainers })
    expect(d.areas[0]!.orderIndex).toBe(1)
    expect(d.areas[2]!.legendaryBoss).toEqual([{ dex: 145, level: 25 }])
    expect(d.areas[2]!.gyms).toEqual([])
    expect(d.areas[2]!.hidden).toBe(false)
    expect(Object.values(d.trainers)[0]!.role).toBe('trainer')
    expect(() => getArea(d, 'nope')).toThrow()
    expect(speciesName(d, 25)).toBe('Pikachu')
    expect(speciesName(d, 999)).toBe('#999')
  })
})
