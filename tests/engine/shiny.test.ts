import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  battleBackgroundFor,
  BATTLE_BACKGROUNDS,
  catchTarget,
  createBattle,
  createRng,
  linearAreas,
  newSave,
  progressOf,
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

  it('stay shiny in battle and once caught; a plain stronger copy replaces a shiny one', () => {
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
    const target = catchTarget(caught.save, 16, 9, 'wild', data)!
    const replaced = applyCatch(caught.save, { dex: 16, level: 9 }, target, data, 2, newId)
    expect(replaced.save.box.find((p) => p.id === pidgey.id)).not.toHaveProperty('shiny')
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
