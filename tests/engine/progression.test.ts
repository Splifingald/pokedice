import { describe, expect, it } from 'vitest'
import {
  applyRegen,
  averageLevel,
  createInstance,
  createRng,
  effectiveStats,
  evolve,
  gainXp,
  hpCurve,
  instanceMaxHp,
  xpToNext,
  getSpecies,
  type PokemonInstance,
  type Species,
} from '@/engine'
import { data, makeData } from '../fixtures'

describe('HP curve', () => {
  it('hits baseHp at L1 and maxHp at L100', () => {
    for (const s of data.speciesList) {
      expect(hpCurve(s, 1)).toBe(s.baseHp)
      expect(hpCurve(s, 100)).toBe(s.maxHp)
    }
    expect(hpCurve(getSpecies(data, 4), 5)).toBe(20) // the spec table's Charmander L5
  })
})

describe('xp curve', () => {
  // At the v1.7 scale (A 0.5) neighbouring low levels can cost the same, so the curve only has to never go down.
  it('is ceil(A·L^B)+C, never decreasing, and grows every 10 levels', () => {
    expect(xpToNext(1, data.config)).toBe(2) // ceil(0.5 × 1) + 1
    for (let l = 1; l < 100; l++) expect(xpToNext(l + 1, data.config)).toBeGreaterThanOrEqual(xpToNext(l, data.config))
    for (let l = 1; l <= 90; l++) expect(xpToNext(l + 10, data.config)).toBeGreaterThan(xpToNext(l, data.config))
  })
})

describe('milestones', () => {
  it('applies Charizard fifth die at Lv.50 (v1.8 schedule)', () => {
    const zard = getSpecies(data, 6)
    const at49 = effectiveStats(zard, 49, data)
    expect(at49.dice).toHaveLength(4)
    expect(at49.rerolls).toBe(4)
    const at50 = effectiveStats(zard, 50, data)
    expect(at50.dice).toHaveLength(5)
    expect(at50.dice.filter((d) => d === 'fire')).toHaveLength(2)
    expect(at50.rerolls).toBe(5)
    expect(at50.applied).toHaveLength(2)
  })

  it('skips UPGRADE_DIE with no base left and ADD_DIE at max dice; supports ADD_HP', () => {
    const fake: Species = {
      ...getSpecies(data, 150),
      dice: [{ type: 'psychic', count: 6 }],
      milestones: [
        { level: 2, effect: 'UPGRADE_DIE' },
        { level: 3, effect: 'ADD_DIE' },
        { level: 4, effect: 'ADD_HP', amount: 7 },
        { level: 5, effect: 'EVOLVE' },
      ],
    }
    const s = effectiveStats(fake, 10, data)
    expect(s.dice).toHaveLength(6)
    expect(s.applied.map((m) => m.effect)).toEqual(['ADD_HP'])
    expect(s.maxHp).toBe(hpCurve(fake, 10) + 7)
  })
})

describe('levelling & evolution', () => {
  const base = (dex: number, level: number, hp?: number): PokemonInstance => {
    const i = createInstance(dex, level, data, 'u1', 0)
    return hp == null ? i : { ...i, currentHp: hp }
  }

  it('levels up, raises current HP by the max-HP gain, and emits milestone cards', () => {
    const c = base(4, 4)
    const r = gainXp(c, xpToNext(4, data.config), data, createRng(1))
    expect(r.inst.level).toBe(5)
    expect(r.inst.xp).toBe(0)
    expect(r.inst.currentHp).toBe(instanceMaxHp(r.inst, data))
    expect(r.events.map((e) => e.kind)).toContain('milestone') // Charmander L5: second die
  })

  it('evolution swaps species and keeps the HP percentage', () => {
    const c = base(4, 15)
    const half = { ...c, currentHp: Math.round(instanceMaxHp(c, data) / 2) }
    const r = gainXp(half, xpToNext(15, data.config), data, createRng(1))
    expect(r.inst.dex).toBe(5)
    expect(r.inst.level).toBe(16)
    expect(r.events.some((e) => e.kind === 'evolve' && e.fromDex === 4 && e.toDex === 5)).toBe(true)
    const pct = r.inst.currentHp / instanceMaxHp(r.inst, data)
    expect(pct).toBeGreaterThan(0.4)
    expect(pct).toBeLessThan(0.65)
  })

  it('evolve() keeps a live Pokémon above 0 and a fainted one at 0', () => {
    expect(evolve(base(4, 16, 1), 5, data).currentHp).toBeGreaterThanOrEqual(1)
    expect(evolve(base(4, 16, 0), 5, data).currentHp).toBe(0)
  })

  it('branching evolution picks uniformly under a fixed seed', () => {
    const eevee = base(133, 27)
    const need = xpToNext(27, data.config)
    const once = (seed: number) => gainXp(eevee, need, data, createRng(seed)).inst.dex
    expect(once(11)).toBe(once(11))
    const counts: Record<number, number> = {}
    for (let seed = 0; seed < 900; seed++) counts[once(seed)] = (counts[once(seed)] ?? 0) + 1
    expect(Object.keys(counts).map(Number).sort()).toEqual([134, 135, 136])
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(240)
  })

  it('caps at max level and discards overflow', () => {
    const d = makeData({ maxLevel: 10 })
    const r = gainXp(createInstance(16, 9, d, 'p', 0), 10_000, d, createRng(1))
    expect(r.inst.level).toBe(10)
    expect(r.inst.xp).toBe(0)
    expect(gainXp(r.inst, 50, d, createRng(1)).inst.xp).toBe(0)
  })

  it('a fainted Pokémon that levels (team share) does not revive', () => {
    const r = gainXp(base(16, 5, 0), 500, data, createRng(1))
    expect(r.inst.currentHp).toBe(0)
  })
})

describe('passive regen', () => {
  it('heals 5 %/h of max HP, revives fainted Pokémon, and carries fractions', () => {
    const snorlax = createInstance(143, 50, data, 's', 0)
    const max = instanceMaxHp(snorlax, data)
    const hurt = { ...snorlax, currentHp: 0 }
    const two = applyRegen([hurt], 0, 2 * 3.6e6, data)
    expect(two.instances[0]!.currentHp).toBe(Math.floor(2 * 0.05 * max))
    expect(two.lastTick).toBe(2 * 3.6e6)

    // many tiny ticks add up to the same as one long one
    const tiny = createInstance(10, 3, data, 't', 0)
    let list = [{ ...tiny, currentHp: 1 }]
    let tick = 0
    for (let i = 1; i <= 60; i++) {
      const r = applyRegen(list, tick, i * 60_000 * 10, data)
      list = r.instances
      tick = r.lastTick
    }
    const oneShot = applyRegen([{ ...tiny, currentHp: 1 }], 0, 600 * 60_000, data).instances[0]!
    expect(list[0]!.currentHp).toBe(oneShot.currentHp)
  })

  it('caps at max HP and ignores a clock that went backwards', () => {
    const p = createInstance(16, 5, data, 'p', 0)
    expect(applyRegen([{ ...p, currentHp: 1 }], 0, 100 * 3.6e6, data).instances[0]!.currentHp).toBe(
      instanceMaxHp(p, data),
    )
    expect(applyRegen([p], 10, 5, data).lastTick).toBe(10)
  })

  it('averages levels', () => {
    expect(averageLevel([])).toBe(1)
    expect(averageLevel([10, 20])).toBe(15)
  })
})
