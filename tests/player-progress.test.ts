// Admin players list: each player's top Pokémon level and furthest area, all time.
import { describe, expect, it } from 'vitest'
import { playerProgress } from '@/analytics/progress'
import { data } from './fixtures'

describe('playerProgress', () => {
  it('takes the highest level and the furthest non-hidden area from events and snapshots', () => {
    const main = data.areas.filter((a) => !a.hidden)
    const hidden = data.areas.find((a) => a.hidden)
    const events = [
      { player: 'a', kind: 'level_up', params: { to: 12 } },
      { player: 'a', kind: 'area_unlocked', params: { areaId: main[2]!.id } },
      { player: 'a', kind: 'snapshot', params: { areaId: main[1]!.id, team: [{ dex: 4, level: 30 }], dayCare: [{ dex: 1, level: 8 }] } },
      { player: 'b', kind: 'snapshot', params: { areaId: main[0]!.id, team: [{ dex: 4, level: 5 }], dayCare: [{ dex: 1, level: 40 }] } },
      ...(hidden ? [{ player: 'b', kind: 'area_unlocked', params: { areaId: hidden.id } }] : []),
    ]
    const p = playerProgress(events, data)
    expect(p.get('a')).toEqual({ topLevel: 30, areaRank: 2, areaName: main[2]!.name })
    expect(p.get('b')).toEqual({ topLevel: 40, areaRank: 0, areaName: main[0]!.name })
  })
})
