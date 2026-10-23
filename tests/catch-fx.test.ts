// The catch timeline's wobbles (docs/38 B5): as many as the engine's `catchShakes` says, a buzz with each, and the
// short and held paths as before.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The pixel engine makes canvases: a stand-in that takes every call is enough here (nothing is looked at).
vi.hoisted(() => {
  const image = (w = 1, h = 1) => ({
    data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
    width: w,
    height: h,
  })
  const g: object = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get: (t, k) =>
        k in t
          ? t[k as keyof typeof t]
          : k === 'createImageData' || k === 'getImageData'
            ? (...a: number[]) => image(a[a.length - 2], a[a.length - 1])
            : () => {},
    },
  )
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})
const sounds = vi.hoisted(() => [] as string[])
const buzzes = vi.hoisted(() => [] as string[])
vi.mock('@/audio/sfx', () => ({ fxSound: (name: string) => sounds.push(name) }))
vi.mock('@/lib/haptics', () => ({ haptic: (cue: string) => buzzes.push(cue) }))

const { catchTimeline } = await import('@/fx/timelines/catch')
type Params = Parameters<typeof catchTimeline>[0]

/** Every cue of the timeline, in order: the sounds and buzzes they make, and what they tell the screen. */
function play(p: Partial<Params>) {
  sounds.length = 0
  buzzes.length = 0
  const told: string[] = []
  const tl = catchTimeline({ own: '', foe: '', ball: 'poke', caught: false, ...p })
  const s = tl.setup()
  const hud = {
    beat: (b: string) => told.push(`beat:${b}`),
    catchResult: (c: boolean) => told.push(`result:${c}`),
    show: () => {},
  }
  for (const [, fn] of tl.cues(s)) fn(hud as never, s)
  return { wobbles: sounds.filter((n) => n === 'catch.wobble').length, buzzes: [...buzzes], told }
}

beforeEach(() => {
  sounds.length = 0
  buzzes.length = 0
})

describe('the catch timeline', () => {
  it('a catch wobbles three times, a buzz each, then the catch buzz', () => {
    const r = play({ caught: true, roll: { total: 7, need: 7, caught: true } })
    expect(r.wobbles).toBe(3)
    expect(r.buzzes).toEqual(['wobble', 'wobble', 'wobble', 'catch'])
    expect(r.told).toContain('result:true')
  })

  it('a miss wobbles by how close it came: 3, 2, 1, none', () => {
    expect(
      [1, 2, 3, 4].map((by) => play({ roll: { total: 7 - by, need: 7, caught: false } }).wobbles),
    ).toEqual([3, 2, 1, 0])
    expect(play({ roll: { total: 3, need: 7, caught: false } }).told).toContain('result:false')
  })

  it('short motion has no wobbles; without the roll, a miss still wobbles twice (as before)', () => {
    expect(play({ short: true, roll: { total: 6, need: 7, caught: false } }).wobbles).toBe(0)
    expect(play({}).wobbles).toBe(2)
  })

  it('held for the Bait, it stops after the throw’s wobbles; the Bait’s own follow from the ground', () => {
    const held = play({ hold: true, roll: { total: 5, need: 7, caught: false } })
    expect(held.wobbles).toBe(2)
    expect(held.told).toContain('beat:hold')
    expect(held.told.some((x) => x.startsWith('result'))).toBe(false)
    const bait = play({ from: 'ground', bait: true, roll: { total: 6, need: 7, caught: false, bait: 1 } })
    expect(bait.wobbles).toBe(2)
    expect(bait.told).toContain('result:false')
    const caught = play({
      from: 'ground',
      bait: true,
      caught: true,
      roll: { total: 7, need: 7, caught: true, bait: 2 },
    })
    expect(caught.wobbles).toBe(2)
    expect(caught.told).toContain('result:true')
  })

  it('a sure throw stays quiet until its Gotcha', () => {
    const r = play({ instant: true, caught: true, roll: { total: 9, need: 7, caught: true } })
    expect(r.wobbles).toBe(0)
    expect(r.buzzes).toEqual(['catch'])
  })
})
