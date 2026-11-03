// What a save wins for good stays won when another copy replaces it (the cloud sync, another tab): raids, rebattle
// tiers, small worlds finished and Mega Gems held. None of it is progress the compare counts, so the copy that wins it
// may lack it — a page left open from before 2026-10-22 dropped all of it (2026-10-29).
import { describe, expect, it } from 'vitest'
import {
  keepGemsHeld,
  keepRaidsDone,
  keepRebattleTiers,
  keepWorldsDone,
  newSave,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const base = newSave(4, data, 1000, newId)
const withEvents = (events: SaveData['events'], extra: Partial<SaveData> = {}): SaveData => ({
  ...base,
  events,
  ...extra,
})

describe('keeping what was won for good', () => {
  it('a raid won in either copy, or in the server’s record, stays won', () => {
    const mine = withEvents({ raidsDone: ['a:150'], raidsWon: 1 })
    const kept = keepRaidsDone(mine, ['a:150', 'b:144', 'c:146'])
    expect(kept.events?.raidsDone).toEqual(['a:150', 'b:144', 'c:146'])
    expect(kept.events?.raidsWon).toBe(1)
    // A save that lost its events entirely gets them back.
    expect(keepRaidsDone(withEvents(undefined), ['b:144']).events?.raidsDone).toEqual(['b:144'])
    // Nothing to add: the same save.
    expect(keepRaidsDone(mine, ['a:150'])).toBe(mine)
    expect(keepRaidsDone(mine, null)).toBe(mine)
  })

  it('each region keeps the rebattle that cleared more tiers', () => {
    const mine = withEvents({
      rebattle: { kanto: { done: 1, step: 2, paid: ['x'] }, johto: { done: 3, step: 0, paid: [] } },
    })
    const other = withEvents({
      rebattle: { kanto: { done: 4, step: 0, paid: ['y'] }, johto: { done: 2, step: 1, paid: [] } },
    })
    expect(keepRebattleTiers(mine, other).events?.rebattle).toEqual({
      kanto: { done: 4, step: 0, paid: ['y'] },
      johto: { done: 3, step: 0, paid: [] },
    })
    expect(keepRebattleTiers(withEvents({}), other).events?.rebattle?.kanto?.done).toBe(4)
    // Nothing cleared further in the other copy: the same save.
    expect(
      keepRebattleTiers(other, withEvents({ rebattle: { kanto: { done: 4, step: 3, paid: [] } } })),
    ).toBe(other)
  })

  it('a small world finished in either copy stays finished', () => {
    const mine = withEvents({ worldDone: ['a'] })
    expect(
      keepWorldsDone(mine, withEvents({ worldDone: ['haunted-hollow-2026'] })).events?.worldDone,
    ).toEqual(['a', 'haunted-hollow-2026'])
    expect(keepWorldsDone(mine, withEvents({ worldDone: ['a'] }))).toBe(mine)
  })

  it('a Mega Gem held in either copy stays held', () => {
    const mine: SaveData = { ...base, powers: { gems: ['venusaurite'] } }
    const other: SaveData = { ...base, powers: { gems: ['venusaurite', 'charizardite-x'] } }
    expect(keepGemsHeld(mine, other).powers?.gems).toEqual(['venusaurite', 'charizardite-x'])
    expect(keepGemsHeld(base, other).powers?.gems).toEqual(['venusaurite', 'charizardite-x'])
    expect(keepGemsHeld(other, mine)).toBe(other)
  })
})
