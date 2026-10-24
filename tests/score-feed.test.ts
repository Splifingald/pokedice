// The damage count-up's beats (docs/38 F2a) go through a feed that only the tray and the readout read: held in the
// battle screen's state, each of a throw's dozen beats re-rendered the whole screen as the dice landed, where players
// felt a freeze (Discord, 2026-10-24). The feed tells its readers of each new beat, and of nothing else.
import { describe, expect, it } from 'vitest'
import { scoreFeed, type ScoreView } from '@/screens/battle/BattlePanel'

const view = (value: number): ScoreView => ({ id: 1, pops: [], key: null, tier: 0, combo: false, value })

describe('the count-up feed', () => {
  it('tells its readers of each beat, by value or from the one before', () => {
    const feed = scoreFeed()
    let heard = 0
    feed.subscribe(() => heard++)
    feed.set(view(3))
    feed.set((s) => (s ? { ...s, value: 7 } : s))
    expect(heard).toBe(2)
    expect(feed.get()?.value).toBe(7)
  })

  it('stays quiet when a beat changes nothing, and once a reader has gone', () => {
    const feed = scoreFeed()
    let heard = 0
    const off = feed.subscribe(() => heard++)
    feed.set(null)
    feed.set((s) => s)
    expect(heard).toBe(0)
    off()
    feed.set(view(5))
    expect(heard).toBe(0)
    expect(feed.get()?.value).toBe(5)
  })
})
