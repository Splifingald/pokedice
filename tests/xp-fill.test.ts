// The result card's XP bar in steps (docs/38 F5c): from the engine's `from` to where the Pokémon stands now.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, xpToNext } from '@/engine'
import { XP_FULL_STEPS, XP_MAX_ROLLS, xpFillFrames } from '@/lib/xpFill'

const cfg = DEFAULT_CONFIG
const need = (level: number) => xpToNext(level, cfg)

describe('xpFillFrames', () => {
  it('fills the gained part of the bar in its share of the steps, ending on the new XP', () => {
    const half = Math.floor(need(10) / 2)
    const frames = xpFillFrames({ level: 10, xp: 0 }, { level: 10, xp: half }, cfg)
    expect(frames.length).toBeLessThanOrEqual(XP_FULL_STEPS / 2 + 1)
    expect(frames.at(-1)).toEqual({ level: 10, xp: half })
    // Never backwards, never a level-up.
    expect(frames.every((f, i) => i === 0 || f.xp >= frames[i - 1]!.xp)).toBe(true)
    expect(frames.some((f) => f.roll || f.white)).toBe(false)
  })

  it('a level-up: the bar full, two white frames, then the next level from empty', () => {
    const frames = xpFillFrames({ level: 10, xp: need(10) - 2 }, { level: 11, xp: 3 }, cfg)
    const roll = frames.findIndex((f) => f.roll)
    expect(frames.slice(roll - 2, roll)).toEqual([
      { level: 10, xp: need(10), white: true },
      { level: 10, xp: need(10), white: true },
    ])
    expect(frames[roll]).toEqual({ level: 11, xp: 0, roll: true })
    expect(frames.at(-1)).toEqual({ level: 11, xp: 3 })
  })

  it('under calm, no white frames', () => {
    const frames = xpFillFrames({ level: 10, xp: 0 }, { level: 11, xp: 0 }, cfg, false)
    expect(frames.some((f) => f.white)).toBe(false)
    expect(frames.filter((f) => f.roll)).toHaveLength(1)
  })

  it('a white flash never comes faster than 3 a second (50 ms a frame)', () => {
    const frames = xpFillFrames({ level: 5, xp: 0 }, { level: 8, xp: 0 }, cfg)
    const flashes = frames.flatMap((f, i) => (f.white && !frames[i - 1]?.white ? [i] : []))
    for (let k = 1; k < flashes.length; k++)
      expect((flashes[k]! - flashes[k - 1]!) * 50).toBeGreaterThanOrEqual(334)
  })

  it('more level-ups than it plays one by one land together', () => {
    const frames = xpFillFrames({ level: 2, xp: 0 }, { level: 9, xp: 1 }, cfg)
    const rolls = frames.filter((f) => f.roll)
    expect(rolls).toHaveLength(XP_MAX_ROLLS + 1)
    expect(rolls.at(-1)).toEqual({ level: 9, xp: 0, roll: true })
    expect(frames.at(-1)).toEqual({ level: 9, xp: 1 })
  })

  it('stops at the top level, and has nothing to play when nothing changed', () => {
    const top = cfg.maxLevel
    const frames = xpFillFrames({ level: top - 1, xp: 0 }, { level: top, xp: 0 }, cfg)
    expect(frames.at(-1)).toEqual({ level: top, xp: 0, roll: true })
    expect(xpFillFrames({ level: top, xp: 0 }, { level: top, xp: 0 }, cfg)).toEqual([])
    expect(xpFillFrames({ level: 7, xp: 4 }, { level: 7, xp: 4 }, cfg)).toEqual([])
  })
})
