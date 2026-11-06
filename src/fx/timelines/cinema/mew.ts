// Mew's boss entrance (docs/53), on the battle stage: a deep forest at golden dusk, light slanting through the canopy,
// motes drifting. A pink light darts between the far trees like a fairy, then Mew itself, hopping from trunk to trunk
// and nearer each time, a ribbon of pink and violet trailing behind it. It peeks out from behind the nearest tree,
// zigzags across the clearing, loops round the stage and curls up in a bubble where it will stand; the bubble pops on
// the reveal. The name card comes, the forest fades into the battle's own ground, and your Pokémon is sent out (the
// same card, HUD cues and send-out as legend.ts's entrance).
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { ball, type Point } from '../../scenes'
import { drawSprite, spriteSize } from '../../sprites'
import {
  H,
  quad,
  screenFlash,
  skippingNow,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Timeline,
} from '../../timeline'
import { banner, type LegendParams } from '../legend'
import { burstRing, dGradient, dissolve, inOrder, tri, type Cinema } from './kit'

const REVEAL = 4.3
const T_BANNER = REVEAL + 0.35
const T_FADE = REVEAL + 1.25
const T_OUT = REVEAL + 1.55
const T_HUD = T_OUT + 0.5
const T_SEND = T_HUD + 0.65
const T_POP = T_SEND + 0.35
const DUR = T_POP + 1.6

const PINK = ['#ffffff', '#ffd0f0', '#ff9ae0', '#e070d0', '#a050c8', '#6a3aa0'] as const

/** One leg of Mew's flight: from a point to a point over a bend, at a depth (its size: far 0, near 1). */
interface Hop {
  t0: number
  t1: number
  a: Point & { d: number }
  c: Point
  b: Point & { d: number }
}

type S = Stage & {
  amb: Particles
  trail: { x: number; y: number; t: number; d: number }[]
  back: Canvas
  front: Canvas
  hops: Hop[]
}

/** The forest, behind: canopy, far trunks in the haze, light slanting down, middle trunks, the ground. */
function forestBack(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, H, ['#16301f', '#2a5034', '#5a8a58', '#8ab070', '#3a6030', '#1c3a1c']), 0, 0)
  // Far trunks, pale in the haze.
  for (let x = 4; x < W; x += r.int(11, 19)) {
    const wd = r.int(2, 4)
    rect(g, x, 0, wd, 118, '#4a7454')
    rect(g, x, 0, 1, 118, '#6a9a6a')
  }
  // Mist across the middle.
  for (let y = 86; y < 112; y++)
    for (let x = 0; x < W; x++)
      if (bayer(x, y) < 0.35 * Math.sin(((y - 86) / 26) * Math.PI)) rect(g, x, y, 1, 1, '#c8e0b0')
  // Light slanting through the canopy.
  for (const x0 of [40, 110, 175]) tri(g, x0, 0, x0 + 22, 0, x0 - 34, 130, pattern(g, '#fff6c8', 3))
  // Middle trunks: darker, a lit edge, roots spreading.
  for (const x of [26, 74, 132, 186, 222]) {
    const wd = 7 + (x % 4)
    rect(g, x, 0, wd, 124, '#1f3824')
    rect(g, x + wd - 2, 0, 2, 124, '#3a5e3a')
    rect(g, x + 1, 0, 1, 124, '#142818')
    for (let k = 0; k < 4; k++) rect(g, x - k * 2, 120 + k, wd + k * 4, 1, '#1f3824')
    for (let y = 18; y < 120; y += 23) rect(g, x + 2, y, 2, 3, '#4a7a3a')
  }
  // The canopy: clusters of leaves, lit from above.
  for (let i = 0; i < 46; i++) {
    const x = r.range(-10, W + 10)
    const y = r.range(-6, 26)
    const rx = Math.round(r.range(8, 18))
    ellipse(g, x, y + 2, rx, Math.round(rx * 0.5), '#10241a')
    ellipse(g, x, y, rx - 2, Math.round(rx * 0.45), r() < 0.5 ? '#24482c' : '#2e5a30')
    ellipse(g, x - 2, y - 2, Math.round(rx * 0.4), 2, '#5a8a3a')
  }
  // The ground: moss and grass, flowers.
  rect(g, 0, 122, W, H - 122, '#2a4a22')
  for (let x = 0; x < W; x += 2) rect(g, x, 121 - ((x * 7) % 3), 1, 3, '#4a7a32')
  for (let i = 0; i < 30; i++) {
    const x = Math.round(r.range(0, W))
    const y = Math.round(r.range(126, H - 2))
    rect(g, x, y, 1, 1, r() < 0.5 ? '#ffd0f0' : '#fff6c8')
  }
  return cv
}

/** The forest in front: two great trunks framing the clearing (Mew hides behind the left one), ferns. */
function forestFront(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  for (const [x, wd] of [
    [0, 26],
    [W - 22, 22],
  ] as const) {
    rect(g, x, 0, wd, H, '#0e1a12')
    rect(g, x + (x ? 1 : wd - 3), 0, 2, H, '#24402a')
    for (let y = 6; y < H; y += 11) rect(g, x + 4 + ((y * 3) % (wd - 8)), y, 3, 2, '#2a4a22')
  }
  // Ferns along the bottom.
  for (let x = -6; x < W + 6; x += r.int(10, 16)) {
    const hgt = r.int(10, 18)
    for (let k = 0; k < hgt; k++) {
      const y = H - k
      const spread = Math.round((hgt - k) * 0.6)
      rect(g, x - spread, y, 1, 1, '#1a3a18')
      rect(g, x + spread, y, 1, 1, '#1a3a18')
      if (k % 3 === 0) rect(g, x - spread, y - 1, spread * 2, 1, '#2a5a22')
    }
  }
  return cv
}

export const mewCinema: Cinema & { makeBattle(p: LegendParams): Timeline<S> } = {
  reveal: REVEAL,
  dur: DUR,
  // Mew is a boss, not a raid: its entrance is the battle's (makeBattle). On a full-screen stage it plays its forest.
  make: (p) =>
    mewCinema.makeBattle({
      own: '',
      foe: p.mon,
      look: { aura: [PINK[0], PINK[1], PINK[3], PINK[5]], fx: 'psy', night: '#1a0a20' },
      name: '',
      level: '',
      types: '',
    }) as Timeline<unknown>,
  makeBattle(p: LegendParams): Timeline<S> {
    return {
      id: 'cinema-mew',
      dur: DUR,
      setup() {
        const st = new Stage({ ...p, by: 'own' }, 151)
        const r = rng(151)
        const fz = spriteSize(p.foe)
        const end = { x: st.L.foe.x, y: st.L.foe.y - fz.h / 2, d: 1 }
        // Where it goes: far trees, then nearer, a peek from the left trunk, a zigzag, a loop into its place.
        const P = (x: number, y: number, d: number) => ({ x, y, d })
        const hops: Hop[] = [
          { t0: 0.75, t1: 1.2, a: P(52, 72, 0), c: { x: 110, y: 28 }, b: P(168, 62, 0) },
          { t0: 1.4, t1: 1.62, a: P(178, 64, 0.2), c: { x: 196, y: 70 }, b: P(192, 92, 0.45) },
          { t0: 1.62, t1: 2.02, a: P(192, 92, 0.45), c: { x: 120, y: 34 }, b: P(80, 82, 0.55) },
          { t0: 2.08, t1: 2.24, a: P(80, 82, 0.55), c: { x: 52, y: 60 }, b: P(34, 92, 1) },
          { t0: 2.62, t1: 2.8, a: P(34, 92, 1), c: { x: 90, y: 40 }, b: P(150, 58, 0.75) },
          { t0: 2.8, t1: 2.96, a: P(150, 58, 0.75), c: { x: 130, y: 90 }, b: P(96, 50, 0.7) },
          { t0: 2.96, t1: 3.12, a: P(96, 50, 0.7), c: { x: 160, y: 30 }, b: P(204, 74, 0.85) },
          { t0: 3.12, t1: 3.3, a: P(204, 74, 0.85), c: { x: 150, y: 110 }, b: P(60, 70, 0.9) },
        ]
        return Object.assign(st, {
          amb: new Particles(),
          trail: [],
          back: forestBack(r),
          front: forestFront(r),
          hops: [...hops, { t0: 3.3, t1: 3.95, a: P(60, 70, 0.9), c: { x: 0, y: 0 }, b: end }],
        })
      },
      step(s, t, dt) {
        s.step(t, dt)
        s.amb.update(dt)
        const r = s.r
        // Motes drifting in the light.
        if (r() < 0.25)
          s.amb.add({
            x: r.range(0, W),
            y: r.range(20, 120),
            vx: r.range(-4, 4),
            vy: -r.range(2, 6),
            life: r.range(1.5, 3),
            size: 1,
            shape: 'px',
            colors: ['#fff6c8', '#c8f0a0', '#5a8a3a'],
          })
        const at = flight(s, t)
        if (at && at.flying) {
          s.trail.push({ x: at.x, y: at.y, t, d: at.d })
          if (r() < 0.7)
            s.fx.add({
              x: at.x + r.range(-3, 3),
              y: at.y + r.range(-3, 3),
              vy: r.range(4, 14),
              life: r.range(0.4, 0.9),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...PINK],
            })
        }
        while (s.trail.length && t - s.trail[0]!.t > 0.45) s.trail.shift()
        if (t >= REVEAL && t < REVEAL + STEP * 1.5)
          for (let k = 0; k < 40; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 130)
            s.fx.add({
              x: s.L.foe.x,
              y: s.L.foe.y - 25,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 0.9),
              size: r.int(1, 2),
              shape: r() < 0.6 ? 'star' : 'heart',
              colors: [...PINK],
            })
          }
        if (t > REVEAL && t < T_OUT && r() < 0.3)
          s.fx.add({
            x: s.L.foe.x + r.range(-24, 24),
            y: s.L.foe.y - r.range(0, 50),
            vy: -r.range(6, 14),
            life: 0.8,
            size: 1,
            shape: 'star',
            colors: [...PINK],
          })
        if (t >= T_POP && t < T_POP + STEP * 1.5)
          for (let k = 0; k < 12; k++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: s.L.own.x,
              y: s.L.own.y - 50,
              vx: Math.cos(a) * 70,
              vy: Math.sin(a) * 50,
              drag: 4,
              life: 0.4,
              size: 1,
              shape: 'plus',
              colors: ['#ffffff', '#ffd0d8'],
            })
          }
      },
      draw(g, s, t) {
        // The battle's own ground under it all, the forest fading into it at the end.
        g.drawImage(s.bg.cv, 0, 0)
        s.bg.dyn(g, t)
        const forest = 1 - span(t, T_FADE, T_OUT)
        dissolve(g, s.back, forest)
        // Light shafts breathing.
        if (forest > 0.5 && Math.floor(t * 3) % 2)
          for (const x0 of [40, 110, 175]) rect(g, x0 - 10, 40 + ((x0 * 3) % 30), 1, 1, '#fff6c8')
        s.amb.draw(g)
        drawTrail(g, s.trail, t)
        const at = flight(s, t)
        const fz = spriteSize(p.foe)
        if (at && t < REVEAL) {
          if (at.d < 0.15) {
            // Far off: a fairy light, not yet a shape.
            g.drawImage(glow(5, '#ff9ae0', 1.2, 0.9), Math.round(at.x) - 5, Math.round(at.y) - 5)
            rect(g, Math.round(at.x), Math.round(at.y), 1, 1, '#ffffff')
          } else {
            const k = lerp(0.35, 1, at.d)
            drawSprite(g, p.foe, Math.round(at.x), Math.round(at.y + (fz.h * k) / 2), {
              sx: k,
              sy: k,
              outline: PINK[2],
              ghost: at.flying
                ? [{ dx: -at.vx * 0.02, dy: -at.vy * 0.02, color: PINK[3], a: 0.5 }]
                : undefined,
            })
          }
        }
        // In its bubble, then out of it.
        const fx = s.L.foe.x
        const fy = s.L.foe.y
        if (t >= 3.95 && t < REVEAL) {
          const q = ease.outBack(span(t, 3.95, 4.1))
          const R = Math.round((Math.max(fz.w, fz.h) / 2 + 6) * q)
          drawSprite(g, p.foe, fx, fy + Math.round(Math.sin(t * 8)), { outline: PINK[2], sx: 0.9, sy: 0.9 })
          ellipseLine(g, fx, fy - fz.h / 2, R, R, PINK[1])
          ellipseLine(
            g,
            fx,
            fy - fz.h / 2,
            R - 1,
            R - 1,
            Math.floor(t * 10) % 2 ? '#c8f0ff' : '#fff6c8',
            Math.PI * 1.1,
            Math.PI * 1.6,
          )
          rect(g, fx - Math.round(R * 0.5), fy - fz.h / 2 - Math.round(R * 0.6), 2, 2, '#ffffff')
        }
        if (t >= REVEAL) {
          const bob = Math.round(Math.sin((t - REVEAL) * 3) * 2)
          drawSprite(g, p.foe, fx, fy + bob - 2, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.4)),
            outline: t < T_OUT ? (Math.floor(t * 8) % 2 ? PINK[1] : PINK[2]) : undefined,
          })
        }
        burstRing(g, fx, fy - fz.h / 2, span(t, REVEAL, REVEAL + 0.5), 90, 2, PINK[1])
        burstRing(g, fx, fy - fz.h / 2, span(t, REVEAL + 0.1, REVEAL + 0.6), 110, 2, PINK[3])
        // The send-out (legend.ts's).
        if (t >= T_SEND && t < T_POP) {
          const q = span(t, T_SEND, T_POP)
          const b = quad(
            { x: -8, y: H + 8 },
            { x: s.L.own.x - 10, y: H * 0.35 },
            { x: s.L.own.x, y: s.L.own.y - 50 },
            ease.outQ(q),
          )
          const im = ball('poke', -q * 12)
          g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
        }
        if (t >= T_POP) {
          const k = ease.outBack(span(t, T_POP, T_POP + 0.22), 2.2)
          s.drawAttacker(g, { sx: k, sy: k, flash: 1 - span(t, T_POP + 0.1, T_POP + 0.45) })
        }
        s.fx.draw(g)
        // The trunk it peeks from is in front of it.
        dissolve(g, s.front, forest)
        if (within(t, REVEAL, REVEAL + 0.3))
          screenFlash(g, '#ffe8f8', 0.7 * (1 - span(t, REVEAL, REVEAL + 0.3)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
        const bars = Math.round(
          16 * (ease.outC(span(t, T_BANNER - 0.15, T_BANNER + 0.1)) - ease.inC(span(t, T_OUT, T_OUT + 0.4))),
        )
        if (bars > 0) {
          rect(g, 0, 0, W, bars, '#05030a')
          rect(g, 0, H - bars, W, bars, '#05030a')
        }
        if (p.name && within(t, T_BANNER, T_OUT + 0.3))
          banner(
            g,
            t,
            p,
            span(t, T_BANNER, T_BANNER + 0.28),
            span(t, T_OUT - 0.05, T_OUT + 0.25),
            T_BANNER + 0.4,
          )
      },
      cues: () =>
        inOrder([
          [0.1, () => quiet(() => tone(1047, 1.2, { type: 'sine', vol: 0.02 }))],
          [0.7, () => quiet(giggle)],
          ...[0.75, 1.4, 1.62, 2.08, 2.62, 2.8, 2.96, 3.12, 3.3].map(
            (at, i) => [at, () => quiet(() => whoosh(i))] as const,
          ),
          [2.3, () => quiet(giggle)],
          [3.95, () => quiet(() => tone(523, 0.35, { type: 'sine', vol: 0.05, slide: 520 }))],
          [
            REVEAL,
            () =>
              quiet(() => {
                hiss(0.12, { freq: 3000, vol: 0.06 })
                ;[1319, 1568, 2093, 2637].forEach((f, i) =>
                  tone(f, 0.18, { type: 'triangle', vol: 0.035, at: 0.04 + i * 0.07 }),
                )
              }),
          ],
          [T_HUD, (hud) => (hud.show?.('foe', true), hud.beat?.('appeared'))],
          [T_SEND, (hud) => hud.beat?.('sendOut')],
          [T_POP, (hud) => (hud.show?.('own', true), fxSound('ball.pop'))],
        ] satisfies Cue<S>[]),
    }
  },
}

const quiet = (f: () => void) => void (!skippingNow() && f())
const giggle = () =>
  [1568, 1976, 1760, 2093].forEach((f, i) => tone(f, 0.07, { type: 'triangle', vol: 0.03, at: i * 0.08 }))
const whoosh = (i: number) => {
  hiss(0.22, { freq: 1800 + i * 150, slide: 1800, vol: 0.04 })
  tone(1319 + i * 60, 0.08, { type: 'triangle', vol: 0.02, at: 0.1 })
}

/** Where Mew is at t, how near (its depth), and whether it is flying (a trail) or waiting behind a tree. */
function flight(
  s: S,
  t: number,
): { x: number; y: number; d: number; vx: number; vy: number; flying: boolean } | null {
  for (let i = 0; i < s.hops.length; i++) {
    const h = s.hops[i]!
    if (t < h.t0) {
      // Between two hops: waiting where the last one ended (behind a tree, or peeking from the near one).
      const prev = s.hops[i - 1]
      if (!prev) return null
      // Behind a far tree: out of sight until the next hop.
      if (prev.b.d < 0.3) return null
      return {
        x: prev.b.x,
        y: prev.b.y + Math.round(Math.sin(t * 9)),
        d: prev.b.d,
        vx: 0,
        vy: 0,
        flying: false,
      }
    }
    if (t < h.t1) {
      const q = ease.ioQ(span(t, h.t0, h.t1))
      const last = i === s.hops.length - 1
      // The last leg is a loop round the stage, closing in on its place.
      const pt = last ? loop(h, q) : quad(h.a, h.c, h.b, q)
      const q2 = Math.min(1, q + 0.02)
      const nx = last ? loop(h, q2) : quad(h.a, h.c, h.b, q2)
      return {
        x: pt.x,
        y: pt.y,
        d: lerp(h.a.d, h.b.d, q),
        vx: (nx.x - pt.x) * 50,
        vy: (nx.y - pt.y) * 50,
        flying: true,
      }
    }
  }
  const last = s.hops[s.hops.length - 1]!
  return t < 3.95 ? { x: last.b.x, y: last.b.y, d: 1, vx: 0, vy: 0, flying: false } : null
}

/** A spiral round the stage's middle, from where it was to its place. */
function loop(h: Hop, q: number): Point {
  const c = { x: W / 2, y: 66 }
  const a0 = Math.atan2(h.a.y - c.y, h.a.x - c.x)
  const a = a0 + q * Math.PI * 2.4
  const R = lerp(Math.hypot(h.a.x - c.x, h.a.y - c.y), 0, ease.inQ(q))
  const p = { x: c.x + Math.cos(a) * R * 1.4, y: c.y + Math.sin(a) * R * 0.6 }
  // The last stretch eases into its place.
  const k = ease.ioQ(span(q, 0.65, 1))
  return { x: lerp(p.x, h.b.x, k), y: lerp(p.y, h.b.y, k) }
}

/** The ribbon behind it: white at its head, pink, violet, broken up as it fades. */
function drawTrail(g: G, trail: S['trail'], t: number) {
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!
    const b = trail[i]!
    if (Math.hypot(b.x - a.x, b.y - a.y) > 40) continue
    const age = t - b.t
    const k = age / 0.45
    // Old enough, every other step drops out: the ribbon frays instead of fading.
    if (k > 0.55 && i % 2) continue
    const c = k < 0.12 ? PINK[0] : k < 0.3 ? PINK[2] : k < 0.6 ? PINK[3] : PINK[4]
    const wd = Math.max(1, Math.round((k < 0.3 ? 3 : 2) * lerp(0.5, 1, b.d)))
    line(g, a.x, a.y, b.x, b.y, c, wd)
  }
}
