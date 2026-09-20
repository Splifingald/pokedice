import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  battleBackgroundFor,
  BATTLE_BACKGROUNDS,
  catchTarget,
  createBattle,
  createInstance,
  createRng,
  linearAreas,
  newSave,
  progressOf,
  releaseDuplicates,
  rollWild,
  teamOf,
  uniformLevels,
  type EncounterContext,
  type GameData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const ROUTE1 = linearAreas(data)[0]!
const ctx = (d: GameData): EncounterContext => {
  const save = newSave(4, d, 0, newId)
  return { area: ROUTE1, progress: progressOf(save, ROUTE1.id), data: d, teamAvgLevel: 5, teamHurt: false, isFirstInArea: false, pokedex: save.pokedex }
}
const shinyRate = (d: GameData, n = 4000) => {
  const rng = createRng(7)
  let shiny = 0
  for (let i = 0; i < n; i++) {
    const e = rollWild(ctx(d), rng)
    if (e?.kind === 'wild' && e.shiny) shiny++
  }
  return shiny / n
}

describe('shiny Pokémon', () => {
  it('appear at the configured rate', () => {
    expect(data.config.shinyChance).toBe(0.01)
    expect(shinyRate(makeData({ shinyChance: 0 }))).toBe(0)
    expect(shinyRate(makeData({ shinyChance: 1 }))).toBe(1)
    const r = shinyRate(makeData({ shinyChance: 0.1 }))
    expect(r).toBeGreaterThan(0.07)
    expect(r).toBeLessThan(0.13)
  })

  it('stay shiny in battle and once caught; a plain stronger copy never replaces a shiny one', () => {
    const s = newSave(4, data, 0, newId)
    const { state } = createBattle(
      {
        kind: 'wild',
        team: teamOf(s).map((p) => ({ uid: p.id, dex: p.dex, level: p.level, hp: p.currentHp, shiny: p.shiny })),
        enemy: { dex: 16, level: 3, shiny: true },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    )
    expect(state.enemy.shiny).toBe(true)
    expect(state.player[0]!.shiny).toBe(false)
    const caught = applyCatch(s, { dex: 16, level: 3, shiny: true }, { mode: 'new' }, data, 1, newId)
    const pidgey = caught.save.box.find((p) => p.id === caught.caughtId)!
    expect(pidgey.shiny).toBe(true)
    // The shiny is all the player has of #16, so a plain one is a Pokémon they don't own: it joins, shiny untouched.
    const target = catchTarget(caught.save, 16, 9, 'wild', data)!
    expect(target).toEqual({ mode: 'new' })
    const kept = applyCatch(caught.save, { dex: 16, level: 9 }, target, data, 2, newId)
    expect(kept.save.box.find((p) => p.id === pidgey.id)!.shiny).toBe(true)
    expect(kept.save.box.filter((p) => p.dex === 16).map((p) => [p.level, !!p.shiny])).toEqual([[3, true], [9, false]])

    // From there on, plain catches fight it out among themselves and leave the shiny alone, whatever their level.
    const stronger = catchTarget(kept.save, 16, 20, 'wild', data)!
    expect(stronger).toEqual({ mode: 'replace', uid: kept.caughtId, level: 9 })
    const after = applyCatch(kept.save, { dex: 16, level: 20 }, stronger, data, 3, newId)
    expect(after.save.box.filter((p) => p.dex === 16).map((p) => [p.level, !!p.shiny])).toEqual([[3, true], [20, false]])
    // A shiny weaker than every plain copy still stays: it is never the weakest copy of anything.
    expect(catchTarget(after.save, 16, 40, 'wild', data)).toEqual({ mode: 'replace', uid: kept.caughtId, level: 20 })
  })

  it('are left alone by the Box duplicate sweep, in both directions', () => {
    const s = newSave(4, data, 0, newId)
    const shiny = { ...createInstance(16, 3, data, 'shiny', 0), shiny: true }
    const plain = createInstance(16, 40, data, 'plain', 0)
    const weaker = createInstance(16, 10, data, 'weaker', 0)
    const { save, released } = releaseDuplicates({ ...s, box: [...s.box, shiny, plain, weaker], team: s.team })
    // Two plain copies is one too many; the shiny is a Pokémon of its own and neither goes nor sends anyone away.
    expect(released.map((p) => p.id)).toEqual(['weaker'])
    expect(save.box.map((p) => p.id)).toEqual([s.box[0]!.id, 'shiny', 'plain'])
  })

  it('a wild shiny always joins as an extra copy, whether weaker or stronger than yours', () => {
    const s = applyCatch(newSave(4, data, 0, newId), { dex: 16, level: 9 }, { mode: 'new' }, data, 1, newId).save
    expect(catchTarget(s, 16, 5, 'wild', data)).toBeNull()
    const target = catchTarget(s, 16, 5, 'wild', data, true)
    expect(target).toEqual({ mode: 'new' })
    const res = applyCatch(s, { dex: 16, level: 5, shiny: true }, target!, data, 2, newId)
    expect(res.save.box.filter((p) => p.dex === 16).map((p) => [p.level, !!p.shiny])).toEqual([[9, false], [5, true]])
    expect(res.save.pokedex.filter((d) => d === 16)).toHaveLength(1)
    // Stronger than your copy: still a separate Pokémon, yours is left untouched. Legendaries stay one of a kind.
    expect(catchTarget(s, 16, 12, 'wild', data, true)).toEqual({ mode: 'new' })
    const stronger = applyCatch(s, { dex: 16, level: 12, shiny: true }, { mode: 'new' }, data, 3, newId)
    expect(stronger.save.box.filter((p) => p.dex === 16).map((p) => [p.level, !!p.shiny])).toEqual([[9, false], [12, true]])
    expect(catchTarget(s, 16, 5, 'boss', data, true)).toBeNull()
  })
})

describe('battle backgrounds', () => {
  it('every area has one; trainers and legendaries may override it', () => {
    for (const a of data.areas) expect(BATTLE_BACKGROUNDS).toContain(a.battleBackground)
    expect(ROUTE1.battleBackground).toBe('grass')
    expect(battleBackgroundFor({ kind: 'wild', dex: 16, level: 3, isNew: true }, ROUTE1, data)).toBe('grass')
    const gym = Object.values(data.trainers).find((t) => t.role === 'leader')!
    expect(battleBackgroundFor({ kind: 'trainer', trainerId: gym.id, name: gym.name, spriteUrl: null, team: [] }, ROUTE1, data)).toBe('default')
    const area = { ...ROUTE1, legendaryBoss: [{ dex: 144, level: 50, battleBackground: 'water' as const }] }
    expect(battleBackgroundFor({ kind: 'boss', dex: 144, level: 50 }, area, data)).toBe('water')
    expect(battleBackgroundFor(null, undefined, data)).toBe('default')
  })
})
