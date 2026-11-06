// The Talent Lab (dev only, docs/51): every one of its fights shows its talent within its first moves, as Enter plays
// them, so the lab (and the captures made from it) never waits on a talent that doesn't come.
import { describe, expect, it } from 'vitest'
import { createRng, reduce, type LogEntry, type TalentKey } from '@/engine'
import { findSeed, LAB, playerMove, setUp, shows } from '@/screens/kitchen/talentLab'
import { makeData } from './fixtures'

const data = makeData({ hiddenTalents: { access: 'all', wildChance: 0.05, evolveChance: 0.3, families: {} } })

describe('the Talent Lab', () => {
  for (const [key, sc] of Object.entries(LAB) as [TalentKey, NonNullable<(typeof LAB)[TalentKey]>][])
    it(`${key} shows`, () => {
      const seed = findSeed(key, sc, data)
      let { state, log } = setUp(sc, data)
      const seen: LogEntry[] = [...log]
      const rng = createRng(seed)
      let first = false
      for (let step = 0; step < 24 && !seen.some(shows(key)); step++) {
        const e = playerMove(state, sc, first)
        if (!e) break
        if (e.t === 'SWITCH' && state.phase === 'player_roll') first = true
        ;({ state, log } = reduce(state, e, data, rng))
        seen.push(...log)
      }
      expect(seen.some(shows(key))).toBe(true)
    })
})
