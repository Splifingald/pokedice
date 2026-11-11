// The Community Boss (docs/71 §4), the engine's side: the affinity (the game's chart, ×½ to ×2, an immunity ×¼), the
// hit and a slot's damage over time, the gauges from a total, the admin's estimate and checks, and the placed Pokémon:
// out of their Box, swapped, taken back, home once it ends (at the end they were placed with, or sooner).
import { describe, expect, it } from 'vitest'
import {
  bossAffinity,
  bossCandidates,
  bossDealt,
  bossEstimate,
  bossHit,
  bossHomecoming,
  bossPlacedOf,
  bossStanding,
  createInstance,
  liveProblems,
  newLiveEvent,
  newSave,
  normaliseLiveEvent,
  placeOnBoss,
  takeBackFromBoss,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const H = 3_600_000
const T0 = Date.parse('2027-02-01T12:00:00Z')
const BOSS: LiveEvent = {
  ...newLiveEvent('snorlax', new Date(T0 - H).toISOString(), new Date(T0 + 48 * H).toISOString()),
  type: 'boss',
  minBadges: 0,
}
const STEELIX: LiveEvent = { ...BOSS, boss: { ...BOSS.boss, dex: 208 } }

/** A save with a team of three and three more in the Box. */
function save(): SaveData {
  const s = newSave(4, data, 0, newId)
  const extra = [7, 25, 74, 1, 16].map((dex, i) => createInstance(dex, 30 + i, data, `x${i}`, 0))
  return { ...s, box: [...s.box, ...extra], team: [s.box[0]!.id, 'x0', 'x1'] }
}

describe('the hit', () => {
  it('the best type on the game’s chart, ×½ to ×2; an immunity counts ×¼', () => {
    expect(bossAffinity(data, 4, 208)).toBe(2) // Fire on Steel / Ground
    expect(bossAffinity(data, 25, 208)).toBe(0.25) // Electric on Ground: immune
    expect(bossAffinity(data, 66, 143)).toBe(2) // Fighting on Normal
    expect(bossAffinity(data, 92, 143)).toBe(1) // Gastly: its Ghost can't touch Normal, its Poison is ×1
    expect(bossAffinity(data, 4, 7)).toBe(0.5) // Fire on Water
  })

  it('level × affinity, at least 1; one hit every 9 s', () => {
    expect(bossHit(50, 2)).toBe(100)
    expect(bossHit(3, 0.25)).toBe(1)
    expect(bossDealt(100, 90_000)).toBe(1000)
    expect(bossDealt(100, 8_999)).toBe(0)
  })
})

describe('the gauges', () => {
  it('broken, the one being hit and its HP left, from a total', () => {
    expect(bossStanding(BOSS, 0)).toEqual({ broken: 0, current: 0, left: 10_000_000, of: 10_000_000 })
    expect(bossStanding(BOSS, 12_000_000)).toEqual({
      broken: 1,
      current: 1,
      left: 18_000_000,
      of: 20_000_000,
    })
    expect(bossStanding(BOSS, 999_999_999)).toMatchObject({ broken: 5, current: null })
  })

  it('the admin’s estimate: hours until each gauge breaks', () => {
    // 100 trainers × 3 slots × 400 hits an hour × 60 = 7.2M an hour: the first gauge (10M) in about 1.4 h.
    const h = bossEstimate(BOSS, 100, 60)
    expect(h[0]).toBeCloseTo(10_000_000 / 7_200_000)
    expect(h.at(-1)).toBeCloseTo(220_000_000 / 7_200_000)
  })

  it('the admin’s checks: one at a time, no repeat, gauges with HP', () => {
    expect(liveProblems([BOSS], BOSS, data, T0)).toEqual([])
    const again = { ...BOSS, id: 'other' }
    expect(liveProblems([BOSS, again], again, data, T0).join(' ')).toMatch(/overlaps another Community Boss/)
    const none = normaliseLiveEvent({ ...BOSS, boss: { ...BOSS.boss, gauges: [] } })
    expect(liveProblems([none], none, data, T0)).toContain('The boss has no gauge.')
  })
})

describe('the placed Pokémon', () => {
  it('candidates by hit, the best first; never the last of the team', () => {
    const c = bossCandidates(save(), data, 208)
    expect(c[0]!.affinity).toBe(2)
    expect(c.map((m) => m.hit)).toEqual([...c.map((m) => m.hit)].sort((a, b) => b - a))
    const alone = newSave(4, data, 0, newId)
    expect(bossCandidates(alone, data, 208)).toEqual([])
  })

  it('placed: out of the Box and team; swapped: the first comes back; taken back: home', () => {
    let s = save()
    s = placeOnBoss(s, data, STEELIX, 0, 'x0', T0)!
    expect(s.box.some((p) => p.id === 'x0')).toBe(false)
    expect(s.team).not.toContain('x0')
    expect(bossPlacedOf(s, STEELIX.id).map((p) => [p.slot, p.inst.id, p.end])).toEqual([
      [0, 'x0', STEELIX.end],
    ])
    s = placeOnBoss(s, data, STEELIX, 0, 'x2', T0)!
    expect(s.box.some((p) => p.id === 'x0')).toBe(true)
    expect(bossPlacedOf(s, STEELIX.id).map((p) => p.inst.id)).toEqual(['x2'])
    s = takeBackFromBoss(s, STEELIX.id, 0)
    expect(bossPlacedOf(s, STEELIX.id)).toEqual([])
    expect(s.box.some((p) => p.id === 'x2')).toBe(true)
  })

  it('home once it ends: at the end it was placed with even before the event loads, or sooner when ended early', () => {
    const s = placeOnBoss(save(), data, STEELIX, 1, 'x3', T0)!
    const bundled = makeData()
    expect(bossHomecoming(s, bundled, T0 + H)).toBe(s)
    const back = bossHomecoming(s, bundled, Date.parse(STEELIX.end))
    expect(bossPlacedOf(back, STEELIX.id)).toEqual([])
    expect(back.box.some((p) => p.id === 'x3')).toBe(true)
    const early = makeData({
      liveEvents: { access: 'all', list: [{ ...STEELIX, end: new Date(T0 + H).toISOString() }] },
    })
    expect(bossPlacedOf(bossHomecoming(s, early, T0 + 2 * H), STEELIX.id)).toEqual([])
    expect(bossHomecoming(s, data, null)).toBe(s)
  })
})
