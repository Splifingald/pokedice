// Cloud sync safety: a stale device must never silently overwrite a save with more progress.
import { describe, expect, it } from 'vitest'
import { newSave, syncXpCurve, xpToNext, type SaveData } from '@/engine'
import { compareProgress, decideSync, sameSave } from '@/save/cloud'
import { data, newId } from './fixtures'

const base = newSave(4, data, 1000, newId)
const at = (s: SaveData, updatedAt: number): SaveData => ({ ...s, updatedAt })
const further: SaveData = { ...base, pokedex: [...base.pokedex, 16, 19, 25] }

describe('decideSync', () => {
  it('keeps the only save there is', () => {
    expect(decideSync(null, null)).toBe('none')
    expect(decideSync(base, null)).toBe('local')
    expect(decideSync(null, base)).toBe('cloud')
  })

  it('lets the newest win when it has at least as much progress', () => {
    expect(decideSync(at(base, 1), at(further, 2))).toBe('cloud')
    expect(decideSync(at(further, 3), at(base, 2))).toBe('local')
    expect(decideSync(at(base, 3), at(base, 2))).toBe('local')
  })

  it('asks when the newer save has less progress (a stale device was opened)', () => {
    expect(decideSync(at(base, 5), at(further, 2))).toBe('ask')
    expect(decideSync(at(further, 2), at(base, 5))).toBe('ask')
  })

  it('ranks progress by areas cleared first, then gyms, species and levels', () => {
    const areaId = Object.keys(base.areaProgress)[0] ?? data.areas[0]!.id
    const cleared: SaveData = {
      ...base,
      areaProgress: { ...base.areaProgress, [areaId]: { xp: 0, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] } },
    }
    expect(compareProgress(cleared, further)).toBeGreaterThan(0)
    expect(compareProgress(further, base)).toBeGreaterThan(0)
    expect(compareProgress(base, base)).toBe(0)
  })

  it('ignores bookkeeping when comparing saves', () => {
    expect(sameSave(at(base, 1), { ...at(base, 9), lastRegenTick: 42 })).toBe(true)
    expect(sameSave(base, further)).toBe(false)
  })
})

describe('XP from an older curve', () => {
  it('is settled at once: levels owed are granted, nothing else changes', () => {
    const p = base.box[0]!
    const owed = xpToNext(p.level, data.config) + xpToNext(p.level + 1, data.config)
    const stale: SaveData = { ...base, box: [{ ...p, xp: owed }] }
    const synced = syncXpCurve(stale, data)
    expect(synced.box[0]).toMatchObject({ level: p.level + 2, xp: 0 })
    expect(syncXpCurve(base, data)).toBe(base)
  })
})
