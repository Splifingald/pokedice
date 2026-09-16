import { describe, expect, it } from 'vitest'
import { computeDamage, effectiveStats, getSpecies, instanceMaxHp, newSave, syncHpScale, teamOf, uniformLevels } from '@/engine'
import { data, die, makeData, newId } from '../fixtures'

describe('hpMultiplier', () => {
  it("scales every Pokémon's max HP and leaves damage alone", () => {
    const big = makeData({ hpMultiplier: 1.4 })
    const charizard = getSpecies(data, 6)
    expect(effectiveStats(charizard, 50, big).maxHp).toBe(Math.round(effectiveStats(charizard, 50, data).maxHp * 1.4))
    const roll = [die('fire', 6), die('base', 3)]
    const L1 = uniformLevels(1)
    expect(computeDamage(roll, ['fire'], ['grass'], L1, big).final).toBe(computeDamage(roll, ['fire'], ['grass'], L1, data).final)
  })

  it('new saves remember the scale they were made at', () => {
    expect(newSave(4, makeData({ hpMultiplier: 1.4 }), 0, newId).hpScale).toBe(1.4)
  })

  it('keeps every HP % when the multiplier changes, and a K.O. stays a K.O.', () => {
    const s = newSave(4, data, 0, newId)
    const half = { ...s, box: s.box.map((p) => ({ ...p, currentHp: Math.floor(instanceMaxHp(p, data) / 2) })) }
    const big = makeData({ hpMultiplier: 2 })
    const r = syncHpScale(half, big)
    expect(r.hpScale).toBe(2)
    const p = teamOf(r)[0]!
    expect(p.currentHp).toBe(Math.floor(instanceMaxHp(p, data) / 2) * 2)
    expect(syncHpScale(r, big)).toBe(r) // nothing to do the second time

    // A save from before the multiplier existed counts as ×1.
    const { hpScale: _legacy, ...old } = s
    const ko = { ...old, box: s.box.map((q) => ({ ...q, currentHp: 0 })) }
    expect(teamOf(syncHpScale(ko, big))[0]!.currentHp).toBe(0)
    const full = syncHpScale(old, big)
    expect(teamOf(full)[0]!.currentHp).toBe(instanceMaxHp(teamOf(full)[0]!, big))
  })
})
