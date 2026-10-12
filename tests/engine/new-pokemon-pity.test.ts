// Pity for new Pokémon: an area's wild Pokémon not caught yet get likelier with the rounds done there.
import { describe, expect, it } from 'vitest'
import {
  createRng,
  emptyProgress,
  linearAreas,
  rollWild,
  wildOdds,
  type Area,
  type EncounterContext,
  type GameData,
  type WildPoolEntry,
} from '@/engine'
import { data } from '../fixtures'

const pity = { startRounds: 5, fullRounds: 50, maxMultiplier: 10 }
const mon = (dex: number, weight: number): WildPoolEntry => ({
  id: `w${dex}`,
  dex,
  weight,
  minLevel: 3,
  maxLevel: 5,
})
// Pidgey and Rattata are caught; Pikachu, 1 in 100, is the one left.
const ROUTE = { ...linearAreas(data)[0]!, wildPool: [mon(16, 60), mon(19, 39), mon(25, 1)] }
const CAUGHT = [16, 19]

const ctx = (roundsDone: number, over: Partial<EncounterContext> = {}): EncounterContext => ({
  area: ROUTE,
  progress: { ...emptyProgress(), roundsDone },
  data,
  teamAvgLevel: 5,
  teamHurt: false,
  isFirstInArea: false,
  pokedex: CAUGHT,
  ...over,
})

/** Share of `n` wild Pokémon that are `dex`. */
function rate(dex: number, c: EncounterContext, n = 20_000): number {
  const rng = createRng(11)
  let hits = 0
  for (let i = 0; i < n; i++) {
    const e = rollWild(c, rng)
    if (e?.kind === 'wild' && e.dex === dex) hits++
  }
  return hits / n
}

const weights = (c: EncounterContext) => wildOdds(c).map((o) => o.weight)

describe('pity for new Pokémon', () => {
  it('is on by default: ×1 up to the 5th round done in the area, ×10 from the 50th', () => {
    expect(data.config.newPokemonPity).toEqual(pity)
  })

  it('up to the threshold the wild pool weighs as it always has', () => {
    expect(weights(ctx(0))).toEqual([60, 39, 1])
    expect(weights(ctx(5))).toEqual([60, 39, 1])
  })

  it('a 1-in-100 Pokémon not caught turns up about 10 times as often after 50 rounds', () => {
    expect(rate(25, ctx(0))).toBeCloseTo(0.01, 2)
    expect(rate(25, ctx(50))).toBeCloseTo(0.1, 1)
    expect(rate(25, ctx(500))).toBeCloseTo(0.1, 1)
    expect(rate(25, ctx(27))).toBeGreaterThan(rate(25, ctx(5)) + 0.02)
  })

  it('the odds rise linearly: 27.5 rounds is ×5.5', () => {
    const odds = wildOdds(ctx(27.5))
    const total = odds.reduce((sum, o) => sum + o.weight, 0)
    expect(odds[2]!.weight / total).toBeCloseTo(0.055)
    // The caught ones keep their odds among themselves.
    expect(odds[0]!.weight / odds[1]!.weight).toBeCloseTo(60 / 39)
  })

  it('capped at 100 %: past the cap, every wild Pokémon is a new one', () => {
    const area = { ...ROUTE, wildPool: [mon(16, 4), mon(25, 1)] } // 1 in 5: ×10 would be 200 %
    const rng = createRng(3)
    for (let i = 0; i < 50; i++)
      expect(rollWild(ctx(50, { area }), rng)).toMatchObject({ dex: 25, isNew: true })
  })

  it('the new ones share the boost by their weights', () => {
    const area: Area = { ...ROUTE, wildPool: [mon(16, 96), mon(25, 1), mon(133, 3)] }
    const odds = wildOdds(ctx(50, { area }))
    const total = odds.reduce((sum, o) => sum + o.weight, 0)
    expect((odds[1]!.weight + odds[2]!.weight) / total).toBeCloseTo(0.4)
    expect(odds[2]!.weight / odds[1]!.weight).toBeCloseTo(3)
  })

  it('counts a species by every row it has in the pool', () => {
    const area: Area = {
      ...ROUTE,
      wildPool: [mon(16, 98), mon(25, 1), { ...mon(25, 1), id: 'w25-high', minLevel: 30, maxLevel: 30 }],
    }
    const odds = wildOdds(ctx(50, { area }))
    const total = odds.reduce((sum, o) => sum + o.weight, 0)
    expect((odds[1]!.weight + odds[2]!.weight) / total).toBeCloseTo(0.2)
  })

  it('nothing to change when every one is caught, none is, or the pity is ×1', () => {
    expect(weights(ctx(50, { pokedex: [16, 19, 25] }))).toEqual([60, 39, 1])
    expect(weights(ctx(50, { pokedex: [] }))).toEqual([60, 39, 1])
    const off: GameData = {
      ...data,
      config: { ...data.config, newPokemonPity: { ...pity, maxMultiplier: 1 } },
    }
    expect(weights(ctx(50, { data: off }))).toEqual([60, 39, 1])
  })

  it('leaves the draw exactly as before when it does nothing', () => {
    const off: GameData = {
      ...data,
      config: { ...data.config, newPokemonPity: { ...pity, maxMultiplier: 1 } },
    }
    for (const seed of [1, 2, 3, 4]) {
      expect(rollWild(ctx(5), createRng(seed))).toEqual(rollWild(ctx(50, { data: off }), createRng(seed)))
    }
  })

  it('a species the game no longer has is never picked, pity or not', () => {
    const area: Area = { ...ROUTE, wildPool: [mon(16, 99), mon(99_999, 1)] }
    expect(weights(ctx(50, { area }))).toEqual([99, 0])
  })
})
