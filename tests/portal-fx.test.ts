// Distortion World's effects (docs/28, docs/15 §27): the wild Pokémon's distortion keeps its rhythm (one burst of about
// half a second per 3.4 s, so nothing flashes faster than 3 a second, the same take on a replay) and the full-screen
// scenes' stage keeps the screen's shape with room for the words under it.
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
})

const { burstAt, GLITCH_DUR, GLITCH_PERIOD, seeded } = await import('@/fx/glitch')
const { distortionLevel, fullStage } = await import('@/fx/timelines/portal')

describe('the distortion bursts', () => {
  const STEP = 1 / 60
  const runs = () => {
    const starts: number[] = []
    let on = false
    for (let t = 0; t < 60; t += STEP) {
      const b = burstAt(t)
      if (b && !on) starts.push(t)
      on = !!b
    }
    return starts
  }

  it('one burst per period, each about half a second, never closer than a third of a second', () => {
    const starts = runs()
    expect(starts.length).toBeGreaterThanOrEqual(Math.floor(60 / GLITCH_PERIOD))
    expect(starts.length).toBeLessThanOrEqual(Math.ceil(60 / GLITCH_PERIOD))
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThan(GLITCH_DUR + 1 / 3)
    let longest = 0
    let cur = 0
    for (let t = 0; t < 60; t += STEP) {
      cur = burstAt(t) ? cur + STEP : 0
      longest = Math.max(longest, cur)
    }
    expect(longest).toBeLessThanOrEqual(GLITCH_DUR + STEP)
  })

  it('the same take on a replay, and its progress runs 0 to 1', () => {
    expect(runs()).toEqual(runs())
    const start = runs()[0]!
    expect(burstAt(start + 0.001)!.p).toBeLessThan(0.05)
    expect(burstAt(start + GLITCH_DUR - 0.03)!.p).toBeGreaterThan(0.9)
  })

  it('small seeds still spread', () => {
    const firsts = [0, 1, 2, 3, 4, 5].map((n) => seeded(n)())
    expect(Math.max(...firsts) - Math.min(...firsts)).toBeGreaterThan(0.3)
  })
})

describe('the world’s lasting effects and the motion level', () => {
  it('a calm OS keeps them as in full; the short setting lightens them; only motion off stills them', () => {
    expect(distortionLevel('full', false)).toBe('full')
    expect(distortionLevel('short', true)).toBe('full')
    expect(distortionLevel('short', false)).toBe('short')
    expect(distortionLevel('off', true)).toBe('off')
  })
})

describe('a full-screen scene’s stage', () => {
  it('2 CSS pixels per art pixel on a phone, up to 4 on a big screen, the bottom kept for the words', () => {
    expect(fullStage(390, 844, 200)).toEqual({ w: 195, h: 422, inset: 100 })
    expect(fullStage(1280, 900, 240)).toEqual({ w: 320, h: 225, inset: 60 })
    expect(fullStage(2560, 1440)).toEqual({ w: 640, h: 360, inset: 0 })
  })
})
