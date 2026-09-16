import { describe, expect, it } from 'vitest'
import { computeDamage, dieUpgradeBonus, majorityType, typeMultiplier, uniformLevels, makeBattler } from '@/engine'
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
  it('types every die separately', () => {
    // fire 6 vs grass = 12, base 3 = 3, no combo
    const r = computeDamage([die('fire', 6), die('base', 3)], ['fire'], ['grass'], L1, data)
    expect(r.perDie.map((p) => p.damage)).toEqual([12, 3])
    expect(r.combo).toBeNull()
    expect(r.final).toBe(15)
  })

  it('stacks 4× on dual weaknesses', () => {
    const r = computeDamage([die('fire', 5)], ['fire'], ['bug', 'grass'], L1, data)
    expect(r.perDie[0]!.multiplier).toBe(4)
    expect(r.final).toBe(20)
  })

  it('immune dice contribute 0 and an all-immune roll deals 0', () => {
    const r = computeDamage([die('normal', 6), die('normal', 6)], ['normal'], ['ghost'], L1, data)
    expect(r.immune).toBe(true)
    expect(r.final).toBe(0)
    expect(r.effectiveness).toBe(0)
    // one untyped base die breaks total immunity
    const r2 = computeDamage([die('normal', 6), die('base', 2)], ['normal'], ['ghost'], L1, data)
    expect(r2.immune).toBe(false)
    expect(r2.perDie[0]!.damage).toBe(0)
    expect(r2.final).toBe(2)
  })

  it('floors at 1 when not immune', () => {
    const r = computeDamage([die('fire', 2)], ['fire'], ['water', 'rock'], L1, data)
    expect(r.raw).toBe(0.5)
    expect(r.final).toBe(1)
  })

  it('deals exactly what the dice show: no global multiplier', () => {
    const r = computeDamage([die('fire', 6), die('base', 3)], ['fire'], ['grass'], L1, data)
    expect(r.raw).toBe(15) // 6 × 2 + 3
    expect(r.final).toBe(15)
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

  it('never become the majority type', () => {
    const roll = [die('base', 1), die('base', 2), die('base', 3), die('fire', 2)]
    expect(majorityType(roll, ['fire'], data)).toBe('fire')
  })

  it('an all-base roll pays an untyped (×1) combo, even vs a ghost', () => {
    const r = computeDamage([die('base', 5), die('base', 5)], ['normal'], ['ghost'], L1, data)
    expect(r.majority).toBeNull()
    expect(r.combo).toMatchObject({ key: 'pair', multiplier: 1, damage: 2 })
    expect(r.final).toBe(12)
  })
})

describe('majority type', () => {
  it('ties break to Type 1, then Type 2, then the highest die', () => {
    const tie = [die('fire', 2), die('flying', 7)]
    expect(majorityType(tie, ['fire', 'flying'], data)).toBe('fire')
    expect(majorityType(tie, ['flying', 'fire'], data)).toBe('flying')
    expect(majorityType(tie, ['water', 'fire'], data)).toBe('fire')
    expect(majorityType(tie, ['water'], data)).toBe('flying') // highest-value die
    expect(majorityType([die('base', 3)], ['water'], data)).toBeNull()
  })

  it('multiplies the combo by the majority type vs the defender', () => {
    // fire, fire, flying → majority fire; pair of 4s vs grass → 2 × 2 = 4
    const r = computeDamage([die('fire', 4), die('fire', 4), die('flying', 1)], ['fire', 'flying'], ['grass'], L1, data)
    expect(r.majority).toBe('fire')
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
