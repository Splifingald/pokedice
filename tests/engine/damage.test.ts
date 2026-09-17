import { describe, expect, it } from 'vitest'
import { attackType, computeDamage, dieUpgradeBonus, typeMultiplier, uniformLevels, makeBattler } from '@/engine'
import { data, die, sdie } from '../fixtures'

const L1 = uniformLevels(1)

describe('type multiplier', () => {
  it('multiplies over both defender types', () => {
    expect(typeMultiplier(data.typeChart, 'fire', ['grass'])).toBe(2)
    expect(typeMultiplier(data.typeChart, 'fire', ['bug', 'grass'])).toBe(4)
    expect(typeMultiplier(data.typeChart, 'fire', ['water', 'rock'])).toBe(0.25)
    expect(typeMultiplier(data.typeChart, 'normal', ['ghost'])).toBe(0)
    expect(typeMultiplier(data.typeChart, 'base', ['ghost'])).toBe(1)
  })
})

describe('damage formula', () => {
  it('the whole attack takes the type that hits hardest (v1.8)', () => {
    // fire 6 vs grass = 12, base 3 also ×2 = 6, no combo
    const r = computeDamage([die('fire', 6), die('base', 3)], ['fire'], ['grass'], L1, data)
    expect(r.attackType).toBe('fire')
    expect(r.perDie.map((p) => p.damage)).toEqual([12, 6])
    expect(r.combo).toBeNull()
    expect(r.final).toBe(18)
  })

  it('Kabuto (2 water, 1 rock) attacks Pidgeotto as rock, whatever the dice count', () => {
    const roll = [die('water', 2), die('water', 5), die('rock', 6), die('base', 1)] // no combo
    const r = computeDamage(roll, ['rock', 'water'], ['normal', 'flying'], L1, data)
    expect(r.attackType).toBe('rock')
    expect(r.perDie.every((p) => p.multiplier === 2)).toBe(true)
    expect(r.final).toBe((2 + 5 + 6 + 1) * 2)
    expect(r.effectiveness).toBe(2)
  })

  it('stacks 4× on dual weaknesses', () => {
    const r = computeDamage([die('fire', 5)], ['fire'], ['bug', 'grass'], L1, data)
    expect(r.perDie[0]!.multiplier).toBe(4)
    expect(r.final).toBe(20)
  })

  it('is immune only when every dice type is — another type takes over otherwise', () => {
    const r = computeDamage([die('normal', 6), die('normal', 6), die('base', 2)], ['normal'], ['ghost'], L1, data)
    expect(r.immune).toBe(true)
    expect(r.final).toBe(0)
    expect(r.effectiveness).toBe(0)
    // Gastly-like: ghost is useless vs normal, so the poison die carries the whole attack at ×1
    const r2 = computeDamage([die('ghost', 5), die('poison', 2), die('base', 3)], ['ghost', 'poison'], ['normal'], L1, data)
    expect(r2.attackType).toBe('poison')
    expect(r2.immune).toBe(false)
    expect(r2.final).toBe(10)
  })

  it('floors at 1 when not immune', () => {
    const r = computeDamage([die('fire', 2)], ['fire'], ['water', 'rock'], L1, data)
    expect(r.raw).toBe(0.5)
    expect(r.final).toBe(1)
  })

  it('deals exactly what the dice show: no global multiplier', () => {
    const r = computeDamage([die('fire', 6), die('base', 3)], ['fire'], ['grass'], L1, data)
    expect(r.raw).toBe(18) // (6 + 3) × 2
    expect(r.final).toBe(18)
    expect(computeDamage([die('fire', 5)], ['fire'], ['water'], L1, data).final).toBe(3) // round(2.5)
  })

  it('has no level term anywhere', () => {
    const low = makeBattler({ uid: 'a', dex: 6, level: 36, hp: 1 }, data)
    const high = makeBattler({ uid: 'b', dex: 6, level: 90, hp: 1 }, data)
    const roll = [die('fire', 4), die('flying', 7), die('base', 2)]
    const a = computeDamage(roll, low.types, ['normal'], L1, data)
    const b = computeDamage(roll, high.types, ['normal'], L1, data)
    expect(a).toEqual(b)
    expect(computeDamage.length).toBe(5)
  })

  it('adds the die upgrade bonus per die before the multiplier', () => {
    const lv = uniformLevels(3) // die bonus +2
    const r = computeDamage([die('fire', 4)], ['fire'], ['grass'], lv, data)
    expect(r.perDie[0]).toMatchObject({ value: 4, bonus: 2, multiplier: 2, damage: 12 })
  })

  it('reports effectiveness relative to a neutral hit', () => {
    const r = computeDamage([die('water', 4)], ['water'], ['fire'], L1, data)
    expect(r.effectiveness).toBe(2)
    const r2 = computeDamage([die('water', 4)], ['water'], ['grass'], L1, data)
    expect(r2.effectiveness).toBe(0.5)
  })
})

describe('base dice', () => {
  it('never get an upgrade bonus', () => {
    expect(dieUpgradeBonus('base', uniformLevels(10), data)).toBe(0)
    expect(dieUpgradeBonus('normal', uniformLevels(10), data)).toBe(15)
  })

  it('never set the attack type', () => {
    const roll = [die('base', 1), die('base', 2), die('base', 3), die('fire', 2)]
    expect(attackType(roll, ['fire'], ['water'], data)).toBe('fire')
  })

  it('an all-base roll pays an untyped (×1) combo, even vs a ghost', () => {
    const r = computeDamage([die('base', 5), die('base', 5)], ['normal'], ['ghost'], L1, data)
    expect(r.attackType).toBeNull()
    expect(r.combo).toMatchObject({ key: 'pair', multiplier: 1, damage: 2 })
    expect(r.final).toBe(12)
  })
})

describe('attack type', () => {
  it('picks the best multiplier, then the most dice, Type 1, Type 2, the highest die', () => {
    expect(attackType([die('fire', 2), die('flying', 7)], ['fire', 'flying'], ['grass'], data)).toBe('fire') // 2× vs 2×: Type 1
    expect(attackType([die('fire', 2), die('flying', 7)], ['fire', 'flying'], ['fighting'], data)).toBe('flying') // 2× vs 1×
    expect(attackType([die('fire', 2), die('flying', 7), die('flying', 1)], ['fire', 'flying'], ['normal'], data)).toBe('flying') // most dice
    const tie = [die('fire', 2), die('flying', 7)]
    expect(attackType(tie, ['flying', 'fire'], ['normal'], data)).toBe('flying')
    expect(attackType(tie, ['water', 'fire'], ['normal'], data)).toBe('fire')
    expect(attackType(tie, ['water'], ['normal'], data)).toBe('flying') // highest-value die
    expect(attackType([die('base', 3)], ['water'], ['normal'], data)).toBeNull()
  })

  it('multiplies the combo by the attack type vs the defender', () => {
    // fire, fire, flying vs grass → fire (2×); pair of 4s → 2 × 2 = 4
    const r = computeDamage([die('fire', 4), die('fire', 4), die('flying', 1)], ['fire', 'flying'], ['grass'], L1, data)
    expect(r.attackType).toBe('fire')
    expect(r.combo).toMatchObject({ key: 'pair', multiplier: 2, damage: 4 })
  })
})

describe('status fallback values', () => {
  it('burn=1, frozen=1, paralyze=4, confuse=2, poison=1', () => {
    const v = (d: ReturnType<typeof sdie>) => computeDamage([d], ['normal'], ['normal'], L1, data).perDie[0]!.value
    expect(v(sdie('fire', 'burn'))).toBe(1)
    expect(v(sdie('ice', 'frozen'))).toBe(1)
    expect(v(sdie('electric', 'paralyze'))).toBe(4)
    expect(v(sdie('psychic', 'confuse'))).toBe(2)
    expect(v(sdie('poison', 'poison'))).toBe(1)
  })

  it('participates in combo detection', () => {
    const r = computeDamage([sdie('electric', 'paralyze'), die('base', 4)], ['electric'], ['normal'], L1, data)
    expect(r.combo?.key).toBe('pair')
  })
})
