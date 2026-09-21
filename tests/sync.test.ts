// Cloud sync safety: a stale device must never silently overwrite a save with more progress.
import { describe, expect, it } from 'vitest'
import { liveBlock, newSave, syncXpCurve, xpToNext, type SaveData } from '@/engine'
import { compareProgress, decideSync, progressTotals, sameSave } from '@/save/cloud'
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
      areaProgress: { ...base.areaProgress, [areaId]: { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] } },
    }
    expect(compareProgress(cleared, further)).toBeGreaterThan(0)
    expect(compareProgress(further, base)).toBeGreaterThan(0)
    expect(compareProgress(base, base)).toBe(0)
  })

  it('counts every region the save holds, not just the one being played', () => {
    const areaId = Object.keys(base.areaProgress)[0] ?? data.areas[0]!.id
    const done = { roundsDone: 9, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: ['g1'] }
    // A finished Kanto, sitting on one device.
    const kanto: SaveData = { ...base, areaProgress: { [areaId]: done }, pokedex: [...base.pokedex, 16, 19, 25] }
    // The same player, having just walked into a fresh second region: one starter, nothing cleared yet.
    const intoJohto: SaveData = {
      ...newSave(4, data, 1000, newId),
      region: 'johto',
      parked: { kanto: { ...liveBlock(kanto) } },
    }

    // Read region by region, Johto looks like a brand new game and Kanto wins. It must not.
    expect(compareProgress(intoJohto, kanto)).toBeGreaterThan(0)
    expect(decideSync(at(kanto, 9), at(intoJohto, 2))).toBe('ask')

    const totals = progressTotals(intoJohto)
    expect(totals.regions).toBe(2)
    expect(totals.cleared).toBe(1)
    expect(totals.gyms).toBe(1)
    // The two Pokédexes are unioned, not added: the starter is in both.
    expect(totals.species).toBe(new Set([...kanto.pokedex, ...base.pokedex]).size)
  })

  it('ignores bookkeeping when comparing saves', () => {
    // Saves from before passive regen was removed still carry lastRegenTick: not progress either.
    expect(sameSave(at(base, 1), { ...at(base, 9), lastRegenTick: 42 } as typeof base)).toBe(true)
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
