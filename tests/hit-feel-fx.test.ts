// The game-feel pass on the attack scenes (docs/38): every move settles half a second after its last hit (the battle
// moves on there), the K.O.'s final blow holds the scene still for its boss stop, and how hard a hit lands scales its
// shake and hit-stop. Without the pass, every move is exactly as drawn.
import { describe, expect, it, vi } from 'vitest'

// The pixel engine draws on canvases: a stand-in whose every call does nothing is enough to build the timelines.
vi.hoisted(() => {
  const noop = () => {}
  const g: object = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get: (o, k) =>
        k in o
          ? (o as Record<string | symbol, unknown>)[k]
          : k === 'getImageData' || k === 'createImageData'
            ? (_x: number, _y: number, w = 1, h = 1) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
              })
            : k === 'canvas'
              ? { width: 240, height: 160 }
              : noop,
      set: () => true,
    },
  )
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})

const { attackTimeline, BOSS_STOP } = await import('@/fx/timelines/attacks')
const { zStrikeTimeline } = await import('@/fx/timelines/zmove')
const { shinyTimeline } = await import('@/fx/timelines/shiny')
const { SETTLE, STEP, STOP_MAX } = await import('@/fx/timeline')
const { Particles } = await import('@/fx/pixel')
import { hitPower } from '@/engine/hitPower'
import type { DieType } from '@/engine/types'
import type { Hud, Stage, Timeline } from '@/fx/timeline'

const TYPES: DieType[] = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
  'base',
]

const RESISTED = hitPower({ effectiveness: 0.5, damage: 2, maxHp: 100 })
const HUGE = hitPower({ effectiveness: 2, combo: 'full_house', damage: 70, maxHp: 100 })
const KO = hitPower({ effectiveness: 1, damage: 30, maxHp: 100, ko: true })

/** When each cue speaks to the HUD, by hook (sound cues say nothing). */
function heard(tl: Timeline<Stage>) {
  const s = tl.setup()
  const out: [string, number][] = []
  const cues = tl.cues(s)
  for (const [t, fire] of cues) {
    const hud: Hud = {
      contact: () => out.push(['contact', t]),
      settle: () => out.push(['settle', t]),
      ko: () => out.push(['ko', t]),
    }
    fire(hud, s)
  }
  const at = (k: string) => out.find(([n]) => n === k)?.[1]
  return { s, out, at, times: cues.map(([t]) => t) }
}
const move = (type: DieType, o: object = {}) =>
  attackTimeline({ own: 'a', foe: 'b', by: 'own', type, damage: 20, ...o }) as Timeline<Stage>

describe('the attack scenes with the game-feel pass', () => {
  for (const type of TYPES)
    it(`${type}: settles half a second after its last hit, well before the end`, () => {
      const tl = move(type, { trim: true })
      const { s, at, times } = heard(tl)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      const settle = at('settle')!
      expect(settle).toBeCloseTo(Math.max(...s.hits.map((h) => h.t0 + h.stop)) + SETTLE)
      expect(settle).toBeGreaterThan(at('contact')!)
      expect(settle).toBeLessThan(tl.dur)
      // From there the log moves on: the scene settles 0.5–2 s sooner than it ends.
      expect(tl.dur - settle).toBeGreaterThan(0.5)
      expect(s.tail).toBe(true)
    })

  it('every move is over for the log within 3 s (they end at 3.2–4.4 s), most well before', () => {
    const settles = TYPES.map((type) => heard(move(type, { trim: true })).at('settle')!)
    for (const t of settles) expect(t).toBeLessThanOrEqual(3 + 1e-9)
    expect(settles.reduce((a, b) => a + b, 0) / settles.length).toBeLessThan(2.4)
  })

  it('short motion settles too', () => {
    const tl = move('fire', { short: true, trim: true })
    expect(heard(tl).at('settle')).toBeLessThan(tl.dur)
  })

  it("the K.O.'s final blow holds the scene still for its boss stop, then plays on", () => {
    for (const type of TYPES) {
      const plain = heard(move(type, { trim: true }))
      const tl = move(type, { trim: true, power: KO })
      const ko = heard(tl)
      expect(tl.dur).toBeCloseTo(move(type).dur + BOSS_STOP)
      // On the final blow, after the contact; everything after it waits the stop out.
      expect(ko.at('ko')).toBeCloseTo(ko.s.lastHit + 1.5 * STEP)
      expect(ko.at('contact')).toBeCloseTo(plain.at('contact')!)
      // (Its own settle: a K.O. lands hard, so its last stop may run a frame longer.)
      expect(ko.at('settle')!).toBeCloseTo(ko.s.settleAt + BOSS_STOP)
      expect(ko.at('settle')! - plain.at('settle')!).toBeGreaterThanOrEqual(BOSS_STOP - 1e-9)
    }
  })

  it('nothing steps through the boss stop', () => {
    const tl = move('normal', { power: KO })
    const s = tl.setup()
    let t = 0
    const step = () => {
      t += STEP
      tl.step(s, t, STEP)
    }
    while (t < s.freezeAt + STEP) step()
    const before = s.fx.list.map((p) => [p.x, p.y, p.age])
    expect(before.length).toBeGreaterThan(0)
    while (t < s.freezeAt + BOSS_STOP - STEP) step()
    expect(s.fx.list.map((p) => [p.x, p.y, p.age])).toEqual(before)
  })

  it('a hit lands as hard as the log says: resisted light and short, huge harder, never past five frames', () => {
    for (const type of TYPES) {
      const plain = move(type).setup()
      const light = move(type, { power: RESISTED }).setup()
      const hard = move(type, { power: HUGE }).setup()
      const shake = (st: Stage) => Math.max(...st.targetShakes.map(([, , a]) => a))
      const stop = (st: Stage) => Math.max(...st.hits.map((h) => h.stop))
      expect(shake(light)).toBeLessThanOrEqual(shake(plain))
      expect(shake(hard)).toBeGreaterThan(shake(plain))
      expect(stop(light)).toBeLessThan(stop(plain))
      expect(stop(hard)).toBeGreaterThanOrEqual(stop(plain))
      // The house rule's five frames (a move drawn longer keeps its own).
      expect(stop(hard)).toBeLessThanOrEqual(Math.max(STOP_MAX, stop(plain)) + 1e-9)
    }
  })

  it('without the pass, a move is exactly as drawn: no settle, no stop of its own, the same hits', () => {
    for (const type of TYPES) {
      const tl = move(type)
      const { out, s } = heard(tl)
      expect(out.map(([k]) => k)).toEqual(['contact'])
      expect(s.power).toBeNull()
      expect(s.freezeAt).toBe(Infinity)
    }
  })

  it('a Z-Move strike settles and stops the same way, on its own clock', () => {
    const plain = heard(
      zStrikeTimeline({ own: 'a', foe: 'b', side: 'own', type: 'ground', from: 'dig' }) as never,
    )
    const z = zStrikeTimeline({
      own: 'a',
      foe: 'b',
      side: 'own',
      type: 'ground',
      from: 'dig',
      trim: true,
      power: KO,
    })
    const felt = heard(z as never)
    expect(plain.out.map(([k]) => k)).toEqual(['contact'])
    expect(felt.at('ko')).toBeGreaterThan(felt.at('contact')!)
    expect(felt.at('settle')).toBeGreaterThan(felt.at('ko')!)
    expect(felt.at('settle')).toBeLessThan(z.dur)
  })
})

describe('particles by a hit’s power', () => {
  it('density 1 adds each particle as asked; more adds copies, less drops some', () => {
    const one = new Particles()
    for (let i = 0; i < 100; i++) one.add({ x: 0, y: 0, vx: 10 })
    expect(one.list).toHaveLength(100)
    expect(one.list.every((p) => p.vx === 10)).toBe(true)
    const more = new Particles()
    more.density = 1.6
    for (let i = 0; i < 100; i++) more.add({ x: 0, y: 0, vx: 10 })
    expect(more.list.length).toBeGreaterThan(130)
    const less = new Particles()
    less.density = 0.6
    for (let i = 0; i < 100; i++) less.add({ x: 0, y: 0, vx: 10 })
    expect(less.list.length).toBeLessThan(80)
  })
})

describe('the shiny entrance', () => {
  it('chimes as it lands, two rings of stars, and is gone soon after', () => {
    const tl = shinyTimeline({ key: 'x', at: { x: 170, y: 70 }, delay: 0.45 })
    const s = tl.setup()
    expect(tl.cues(s).map(([t]) => t)).toEqual([0.45])
    let t = 0
    let most = 0
    while (t < tl.dur) {
      t += STEP
      tl.step(s, t, STEP)
      most = Math.max(most, s.fx.list.length)
    }
    expect(most).toBeGreaterThanOrEqual(12)
    expect(tl.dur).toBeLessThan(2)
  })
})
