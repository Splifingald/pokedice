import { describe, expect, it } from 'vitest'
import { applyRegen, instanceMaxHp, newSave } from '@/engine'
import { parseSave, migrate } from '@/save/schema'
import { pickNewest } from '@/save/cloud'
import { bundleToRows, isPlayableBundle, rowsToBundle } from '@/config/mapping'
import { BUNDLE } from '@/config/bundle'
import { data, newId } from './fixtures'

describe('save schema', () => {
  it('round-trips a fresh save through JSON', () => {
    const s = newSave(7, data, 123, newId)
    const res = parseSave(JSON.parse(JSON.stringify(s)))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.save).toEqual(s)
  })

  it('rejects garbage and wrong versions', () => {
    expect(parseSave(null).ok).toBe(false)
    expect(parseSave({ version: 2 }).ok).toBe(false)
    expect(parseSave({ ...newSave(7, data, 1, newId), gold: -5 }).ok).toBe(false)
    expect(parseSave({ ...newSave(7, data, 1, newId), box: [] }).ok).toBe(false)
    expect(migrate('x')).toBe('x')
  })

  it('repairs dangling team ids and fills missing upgrade levels', () => {
    const s = newSave(7, data, 1, newId)
    const raw = JSON.parse(JSON.stringify({ ...s, team: ['nope', s.team[0], s.team[0]], comboLevels: {}, pokedex: [7, 7] }))
    const res = parseSave(raw)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.save.team).toEqual([s.team[0]])
    expect(res.save.comboLevels.five_kind).toBe(1)
    expect(res.save.pokedex).toEqual([7])
  })

  it('accepts older area progress without bossesDefeated', () => {
    const s = newSave(7, data, 1, newId)
    const raw = { ...s, areaProgress: { a: { xp: 3, cleared: false, bossDefeated: false } } }
    const res = parseSave(raw)
    expect(res.ok && res.save.areaProgress.a!.bossesDefeated).toEqual([])
  })
})

describe('regen on load', () => {
  it('heals when lastRegenTick is faked two hours back', () => {
    const s = newSave(4, data, 0, newId)
    const hurt = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }
    const now = 2 * 3.6e6
    const r = applyRegen(hurt.box, 0, now, data)
    const max = instanceMaxHp(hurt.box[0]!, data)
    expect(r.instances[0]!.currentHp).toBe(Math.min(max, 1 + Math.floor(2 * 0.05 * max)))
    expect(r.lastTick).toBe(now)
  })
})

describe('cloud sync', () => {
  it('newest updatedAt wins', () => {
    const a = { ...newSave(1, data, 0, newId), updatedAt: 10 }
    const b = { ...newSave(4, data, 0, newId), updatedAt: 20 }
    expect(pickNewest(a, b)).toEqual({ winner: 'cloud', save: b })
    expect(pickNewest(b, a)).toEqual({ winner: 'local', save: b })
    expect(pickNewest(null, a).winner).toBe('cloud')
    expect(pickNewest(a, null).winner).toBe('local')
    expect(pickNewest(null, null).winner).toBe('none')
  })
})

describe('content mapping', () => {
  it('bundle → rows → bundle is lossless', () => {
    const back = rowsToBundle(bundleToRows(BUNDLE))
    expect(back.pokemon).toEqual(BUNDLE.pokemon)
    expect(back.areas).toEqual(BUNDLE.areas)
    expect(back.trainers).toEqual(BUNDLE.trainers)
    expect(back.upgrades).toEqual(BUNDLE.upgrades)
    expect(back.config).toEqual(BUNDLE.config)
    expect(back.typeChart).toEqual(BUNDLE.typeChart)
    expect(back.diceTypes).toEqual(BUNDLE.diceTypes)
    expect(back.items).toEqual(BUNDLE.items)
    expect(isPlayableBundle(back)).toBe(true)
    expect(isPlayableBundle({ ...back, pokemon: [] })).toBe(false)
  })

  it('coerces Postgres numerics that arrive as strings', () => {
    const rows = bundleToRows(BUNDLE)
    rows.type_chart = rows.type_chart.map((r) => ({ ...r, multiplier: String(r.multiplier) }))
    rows.areas = rows.areas.map((r) => ({ ...r, backtrack_multiplier: '0.5' }))
    const b = rowsToBundle(rows)
    expect(typeof b.typeChart[0]!.multiplier).toBe('number')
    expect(b.areas[0]!.backtrackMultiplier).toBe(0.5)
  })
})
