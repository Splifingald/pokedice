import { describe, expect, it } from 'vitest'
import {
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
  preferUnowned,
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
  it('applies each Charizard milestone at its level, whatever order they are stored in', () => {
    const zard = getSpecies(data, 6)
    const levels = [...new Set(zard.milestones.filter((m) => m.effect !== 'EVOLVE').map((m) => m.level))]
    expect(levels.length).toBeGreaterThan(0)
    for (const lv of levels) {
      const before = effectiveStats(zard, lv - 1, data).applied.length
      const at = effectiveStats(zard, lv, data).applied.length
      expect(at - before, `Lv.${lv}`).toBe(zard.milestones.filter((m) => m.effect !== 'EVOLVE' && m.level === lv).length)
    }
    expect(effectiveStats(zard, 100, data).dice.length).toBeLessThanOrEqual(5)
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

  it('REPLACE_DIE swaps one die of the source type and keeps base dice last', () => {
    const fake: Species = {
      ...getSpecies(data, 150),
      type1: 'psychic',
      dice: [
        { type: 'psychic', count: 2 },
        { type: 'base', count: 2 },
      ],
      milestones: [
        { level: 2, effect: 'REPLACE_DIE', fromDieType: 'base', dieType: 'fire' },
        { level: 3, effect: 'REPLACE_DIE', fromDieType: 'psychic', dieType: 'base' },
      ],
    }
    const at2 = effectiveStats(fake, 2, data)
    expect(at2.dice).toEqual(['psychic', 'psychic', 'fire', 'base'])
    const at3 = effectiveStats(fake, 3, data)
    expect(at3.dice).toEqual(['psychic', 'fire', 'base', 'base'])
    expect(at3.applied).toHaveLength(2)
  })

  it('REPLACE_DIE is skipped when the source type is absent or equals the target', () => {
    const fake: Species = {
      ...getSpecies(data, 150),
      type1: 'psychic',
      dice: [{ type: 'psychic', count: 3 }],
      milestones: [
        { level: 2, effect: 'REPLACE_DIE', fromDieType: 'water', dieType: 'fire' },
        { level: 3, effect: 'REPLACE_DIE', fromDieType: 'psychic', dieType: 'psychic' },
        { level: 4, effect: 'REPLACE_DIE', dieType: 'fire' }, // source defaults to 'base' — none left
      ],
    }
    const s = effectiveStats(fake, 10, data)
    expect(s.dice).toEqual(['psychic', 'psychic', 'psychic'])
    expect(s.applied).toHaveLength(0)
  })
})

describe('levelling & evolution', () => {
  const base = (dex: number, level: number, hp?: number): PokemonInstance => {
    const i = createInstance(dex, level, data, 'u1', 0)
    return hp == null ? i : { ...i, currentHp: hp }
  }

  it('levels up, raises current HP by the max-HP gain, and emits milestone cards', () => {
    // Any species with a dice/reroll milestone before it evolves (milestones are tuned in admin).
    const sp = data.speciesList.find((s) =>
      s.milestones.some((m) => m.effect !== 'EVOLVE' && m.level > 1 && s.evolutions.every((e) => (e.level ?? 999) > m.level)),
    )!
    const lv = sp.milestones.find((m) => m.effect !== 'EVOLVE' && m.level > 1)!.level
    const c = base(sp.dex, lv - 1)
    const r = gainXp(c, xpToNext(lv - 1, data.config), data, createRng(1))
    expect(r.inst.level).toBe(lv)
    expect(r.inst.xp).toBe(0)
    expect(r.inst.currentHp).toBe(instanceMaxHp(r.inst, data))
    expect(r.events.map((e) => e.kind)).toContain('milestone')
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

  it('a Pokémon caught past its evolution level evolves on its next XP, without waiting for a level', () => {
    // Johto's Pupitar comes N.55-70 and evolves into Tyranitar at 55.
    const r = gainXp(createInstance(247, 60, data, 'x', 0), 1, data, createRng(1))
    expect(r.inst.level).toBe(60)
    expect(r.inst.dex).toBe(248)
    expect(r.events).toContainEqual({ kind: 'evolve', uid: 'x', fromDex: 247, toDex: 248, level: 60 })
    // No XP, no evolution (the XP-curve sync calls it with 0).
    expect(gainXp(createInstance(247, 60, data, 'x', 0), 0, data, createRng(1)).inst.dex).toBe(247)
  })

  it('evolve() keeps a live Pokémon above 0 and a fainted one at 0', () => {
    expect(evolve(base(4, 16, 1), 5, data).currentHp).toBeGreaterThanOrEqual(1)
    expect(evolve(base(4, 16, 0), 5, data).currentHp).toBe(0)
  })

  it('branching evolution picks uniformly under a fixed seed', () => {
    // A branching level evolution (Eevee's own come from stones since v1.10).
    const eeveeByLevel = { ...data.species[133]!, evolutions: [134, 135, 136].map((toDex) => ({ toDex, level: 28 })) }
    const d = { ...data, species: { ...data.species, 133: eeveeByLevel } }
    const eevee = base(133, 27)
    const need = xpToNext(27, data.config)
    const once = (seed: number) => gainXp(eevee, need, d, createRng(seed)).inst.dex
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

describe('averageLevel', () => {
  it('averages levels', () => {
    expect(averageLevel([])).toBe(1)
    expect(averageLevel([10, 20])).toBe(15)
  })
})

describe('branching evolutions prefer an unowned species', () => {
  // Eevee: five branches in the bundle, three by stone and two more with Johto. Tyrogue is the level-based branch.
  const branches = (dex: number) => data.species[dex]!.evolutions.filter((e) => e.level != null)

  it('picks only among the branches the player has not caught', () => {
    const ready = branches(236) // Tyrogue → Hitmonlee / Hitmonchan / Hitmontop
    expect(ready.length).toBeGreaterThan(1)
    const owned = ready.slice(1).map((e) => e.toDex)
    expect(preferUnowned(ready, owned).map((e) => e.toDex)).toEqual([ready[0]!.toDex])
  })

  it('falls back to every branch once they are all owned, so a full dex still varies', () => {
    const ready = branches(236)
    expect(preferUnowned(ready, ready.map((e) => e.toDex))).toEqual(ready)
  })

  it('leaves every branch on the table when there is no Pokédex to consult', () => {
    const ready = branches(236)
    expect(preferUnowned(ready, undefined)).toEqual(ready)
  })

  it('evolves into the missing one, over and over', () => {
    const ready = branches(236)
    const want = ready[ready.length - 1]!.toDex
    const owned = ready.filter((e) => e.toDex !== want).map((e) => e.toDex)
    for (let seed = 1; seed <= 25; seed++) {
      const tyrogue = createInstance(236, 19, data, `t${seed}`, 0)
      const res = gainXp(tyrogue, 99_999, data, createRng(seed), { owned })
      const evolved = res.events.find((e) => e.kind === 'evolve')
      expect(evolved && evolved.kind === 'evolve' ? evolved.toDex : null, `seed ${seed}`).toBe(want)
    }
  })
})
