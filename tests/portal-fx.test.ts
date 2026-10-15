// Distortion World's effects (docs/28, docs/15 §27): the wild Pokémon's distortion keeps its rhythm (one burst of about
// a third of a second per 5 s, so nothing flashes faster than 3 a second, the same take on a replay), its frames as
// soft as the user asked (2026-10-15) and drawn as filters on the page's own sprite; the breach holds its end; and the
// full-screen scenes' stage keeps the screen's shape with room for the words under it.
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})

const { burstAt, burstCss, burstFrame, GLITCH_DUR, GLITCH_PERIOD, restCss, seeded, tearPrimitives } =
  await import('@/fx/glitch')
const { Player } = await import('@/fx/timeline')
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

  it('a third softer than the first shader (2026-10-15): every 5 s, 0.35 s', () => {
    expect(GLITCH_PERIOD).toBe(5)
    expect(GLITCH_DUR).toBe(0.35)
  })
})

describe('a burst’s frames', () => {
  const frames = Array.from({ length: 40 }, (_, n) => [0.1, 0.3, 0.6, 0.9].map((p) => burstFrame({ n, p })))

  it('four frames; 2–3 bands torn 2–4 art pixels (1 on the last), the copies close and see-through', () => {
    for (const take of frames) {
      expect(take.map((f) => f.f)).toEqual([0, 1, 2, 3])
      for (const f of take) {
        expect(f.bands.length).toBeGreaterThanOrEqual(2)
        expect(f.bands.length).toBeLessThanOrEqual(3)
        for (const b of f.bands) {
          expect(Math.abs(b.dx)).toBeLessThanOrEqual(f.f === 3 ? 1 : 4)
          expect(Math.abs(b.dx)).toBeGreaterThanOrEqual(f.f === 3 ? 1 : 2)
          expect(b.h).toBeLessThanOrEqual(4)
        }
        for (const [dx, , a] of f.ghosts) {
          expect(Math.abs(dx)).toBeLessThanOrEqual(2)
          expect(a).toBeLessThanOrEqual(0.6)
        }
      }
    }
  })

  it('short animations: the copies only, no tear, no tint', () => {
    const f = burstFrame({ n: 3, p: 0.5 }, true)
    expect(f.bands).toEqual([])
    expect(f.tint).toBe(false)
    expect(f.ghosts.length).toBeGreaterThan(0)
  })

  it('the page draws them as filters on its own sprite: the tear, then the copies, scaled to its pixels', () => {
    const f = burstFrame({ n: 2, p: 0.1 })
    const css = burstCss(f, 3, 'url(#t)')
    expect(css.startsWith('url(#t) drop-shadow(3px 0 0 rgb(107 47 196 / 0.6))')).toBe(true)
    expect(burstCss(burstFrame({ n: 2, p: 0.1 }, true), 2, null)).not.toContain('url(')
    expect(restCss(2)).toBe(
      'drop-shadow(2px 0 0 rgb(107 47 196 / 0.35)) drop-shadow(-2px 0 0 rgb(47 211 196 / 0.3))',
    )
  })

  it('the tear moves each band by whole art pixels, the rest of the sprite not at all', () => {
    const px = 3
    const svg = tearPrimitives([{ at: 0.5, h: 2, dx: -2 }], 90, 120, px)
    const scale = Number(/scale="([\d.]+)"/.exec(svg)![1])
    const red = Number(/rgb\((\d+),128,0\)" result="b0"/.exec(svg)![1])
    // feDisplacementMap: shift = scale × (red / 255 − 0.5), in CSS pixels.
    expect(Math.round(scale * (red / 255 - 0.5))).toBe(-2 * px)
    expect(svg).toContain('y="60" width="270" height="6"')
    expect(svg).toContain('<feFlood flood-color="rgb(128,128,0)" result="base"/>')
  })
})

describe('a held timeline (the breach’s end)', () => {
  const g = { clearRect() {}, imageSmoothingEnabled: false, canvas: { width: 1, height: 1 } }
  const cv = { getContext: () => g } as unknown as HTMLCanvasElement
  const draws: number[] = []
  const tl = {
    id: 'held',
    dur: 1,
    hold: true,
    setup: () => ({}),
    step() {},
    draw: (_g: unknown, _s: unknown, t: number) => void draws.push(t),
    cues: () => [],
  }

  it('a skip lands on its end once, firing onEnd once; it then draws past its end, never back to the start', () => {
    const p = new Player(cv)
    let ends = 0
    p.onEnd = () => ends++
    p.load(tl)
    p.skip()
    expect(ends).toBe(1)
    expect(p.t).toBeGreaterThanOrEqual(1)
    p.skip()
    expect(ends).toBe(1)
    p.stepFrame()
    expect(p.t).toBeGreaterThan(1)
    expect(draws.at(-1)).toBeGreaterThan(1)
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
