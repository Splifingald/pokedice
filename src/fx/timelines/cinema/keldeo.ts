// Keldeo's entrance (docs/53), on the battle stage: a mountain lake at sunrise, the sun just over the far shore and its
// gold road on the water, reeds in the shallows. A small shape comes running across the water from the far side, its
// hooves skimming the surface, a white wake opening behind it and spray at every stride. It leaps; at the top its horn
// draws a sword of water, and one stroke cuts the lake: the water stands up along the cut in a wall of spray, left to
// right, and a rainbow hangs in it. Keldeo comes down through the falling spray onto the water, ripples ringing out.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  pattern,
  rect,
  span,
  type Canvas,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, quad, W } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve } from './kit'

const REVEAL = 4.0
const SHORE = 64
const T_RUN = 0.9
const T_LEAP = 2.45
const T_TOP = 2.85
const T_SLASH = 3.0
const T_LAND = 3.8
const BOW = ['#e0403a', '#ff8a1e', '#ffd23a', '#7ac74c', '#3a9af0', '#8a5ad0'] as const

type X = {
  sky: Canvas
  lake: Canvas
  trail: { x: number; y: number; t: number; s: number }[]
}

function skyAt(): Canvas {
  const cv = canvas(W, SHORE)
  const g = cv.g
  g.drawImage(dGradient(W, SHORE, ['#2a3060', '#6a4a7a', '#d8786a', '#ffc070']), 0, 0)
  // The sun, half over the far shore, its halo.
  g.drawImage(glow(26, '#ffe0a0', 1.3, 0.6), 64 - 26, SHORE - 8 - 26)
  ellipse(g, 64, SHORE - 8, 10, 10, '#fff4d0')
  ellipse(g, 64, SHORE - 8, 7, 7, '#ffffff')
  // Thin clouds lit pink underneath.
  for (const [x, y, w] of [
    [20, 16, 50],
    [130, 10, 70],
    [180, 26, 44],
  ] as const) {
    rect(g, x, y, w, 2, '#8a5a7a')
    rect(g, x + 4, y + 2, w - 8, 1, '#ffa88a')
  }
  // The far shore: mountains, then a dark wooded line.
  for (let x = 0; x < W; x++) {
    const y = Math.round(SHORE - 14 - Math.abs(Math.sin(x / 31 + 2)) * 14 - Math.sin(x / 9) * 2)
    rect(g, x, y, 1, SHORE - y, '#5a3a5a')
    rect(g, x, y, 1, 1, '#c87a6a')
    const y2 = Math.round(SHORE - 5 - Math.abs(Math.sin(x / 5)) * 3)
    rect(g, x, y2, 1, SHORE - y2, '#2a1a30')
  }
  return cv
}

function lakeAt(): Canvas {
  const cv = canvas(W, H - SHORE)
  const g = cv.g
  g.drawImage(dGradient(W, H - SHORE, ['#e08a7a', '#7a6aa0', '#3a5a8a', '#1a3460']), 0, 0)
  // Ripple lines, longer towards us.
  for (let y = 2; y < H - SHORE; y += 3) {
    const L = 3 + Math.round(y * 0.12)
    for (let x = (y * 11) % 17; x < W; x += 17 + L) rect(g, x, y, L, 1, y < 20 ? '#ffb090' : '#5a7ab0')
  }
  // The sun's road: gold dashes down the water under it.
  for (let y = 1; y < H - SHORE; y += 2) {
    const hw = 3 + Math.round(y * 0.18)
    for (let x = -hw; x < hw; x += 3 + ((y * 3) % 2))
      rect(g, 64 + x + ((y * 7) % 3), y, 2, 1, y % 4 ? '#ffd890' : '#fff4d0')
  }
  rect(g, 0, 0, W, 1, '#ffd8a0')
  return cv
}

/** Where it runs: in from the far left, across and nearer, curving in towards the middle of the lake. */
function runAt(t: number) {
  const q = ease.ioQ(span(t, T_RUN, T_LEAP))
  const p = quad({ x: -8, y: SHORE + 4 }, { x: W * 0.9, y: SHORE + 6 }, { x: W * 0.42, y: H - 34 }, q)
  const n = quad(
    { x: -8, y: SHORE + 4 },
    { x: W * 0.9, y: SHORE + 6 },
    { x: W * 0.42, y: H - 34 },
    Math.min(1, q + 0.01),
  )
  return { x: p.x, y: p.y, s: lerp(0.35, 0.85, q), vx: n.x - p.x }
}

/** The leap: up from where it ran, over the top for the stroke, down onto its place. */
function leapAt(t: number, foe: { x: number; y: number }) {
  if (t < T_TOP) {
    const q = ease.outQ(span(t, T_LEAP, T_TOP))
    return { x: lerp(W * 0.42, W * 0.5, q), y: lerp(H - 34, 60, q), s: 0.85 }
  }
  if (t < T_LAND - 0.35)
    return {
      x: W * 0.5 + (t - T_TOP) * 10,
      y: 60 - Math.sin(span(t, T_TOP, T_LAND - 0.35) * Math.PI) * 4,
      s: 0.9,
    }
  const q = ease.inQ(span(t, T_LAND - 0.35, T_LAND))
  return { x: lerp(W * 0.5 + 6, foe.x, q), y: lerp(60, foe.y, q), s: lerp(0.9, 1, q) }
}

let scratch: Canvas | null = null

export const keldeoCinema = bossCinema<X>({
  id: 'cinema-keldeo',
  reveal: REVEAL,
  seed: 647,
  aura: ['#ffffff', '#c8f0ff', '#4ab8f0', '#1a4a8a'],
  flash: '#e8faff',
  setup() {
    return {
      sky: skyAt(),
      lake: lakeAt(),
      trail: [],
    }
  },
  step(s, t, dt) {
    const r = s.r
    // Its strides on the water: the wake's points, a splash at each.
    if (t > T_RUN && t < T_LEAP) {
      const a = runAt(t)
      s.trail.push({ x: a.x, y: a.y, t, s: a.s })
      if (Math.floor(t * 9) !== Math.floor((t - dt) * 9))
        for (let i = 0; i < 6 * a.s + 2; i++)
          s.fx.add({
            x: a.x + r.range(-3, 3),
            y: a.y,
            vx: r.range(-30, 30) * a.s - a.vx * 20,
            vy: -r.range(30, 70) * a.s,
            ay: 260,
            life: 0.45,
            size: 1,
            shape: 'drop',
            colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
          })
    }
    // The leap off the water: a burst of spray.
    if (t >= T_LEAP && t - dt < T_LEAP)
      for (let i = 0; i < 24; i++)
        s.fx.add({
          x: W * 0.42 + r.range(-6, 6),
          y: H - 34,
          vx: r.range(-50, 50),
          vy: -r.range(40, 120),
          ay: 260,
          life: 0.7,
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#c8f0ff'],
        })
    // The wall of water falling back: drops shed off its top.
    if (t > T_SLASH + 0.15 && t < T_LAND + 0.2 && r() < 0.9)
      for (let i = 0; i < 3; i++)
        s.fx.add({
          x: r.range(0, W),
          y: cutY(r.range(0, W)) - r.range(10, 34) * (1 - span(t, T_SLASH + 0.4, T_LAND)),
          vx: r.range(-10, 10),
          vy: r.range(0, 20),
          ay: 240,
          life: 0.6,
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
        })
    // Landing: ripples and a crown of spray.
    if (t >= T_LAND && t - dt < T_LAND)
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI * r.range(0.05, 0.95)
        s.fx.add({
          x: s.L.foe.x + Math.cos(a) * 10,
          y: s.L.foe.y,
          vx: Math.cos(a) * r.range(30, 70),
          vy: Math.sin(a) * r.range(40, 100),
          ay: 280,
          life: 0.6,
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#c8f0ff'],
        })
      }
    if (t > REVEAL && r() < 0.25)
      s.fx.add({
        x: s.L.foe.x + r.range(-20, 20),
        y: s.L.foe.y - r.range(0, 40),
        vy: -r.range(4, 12),
        life: 0.8,
        size: 1,
        shape: 'star',
        colors: ['#ffffff', '#c8f0ff', '#4ab8f0'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    scratch ??= canvas(W, H)
    const c = scratch.g
    c.clearRect(0, 0, W, H)
    c.drawImage(s.sky, 0, 0)
    c.drawImage(s.lake, 0, SHORE)
    // The wake: two white lines opening behind it, fading as they spread.
    for (const p of s.trail) {
      const age = t - p.t
      if (age > 1.4) continue
      const sp = Math.round(age * 22 * p.s)
      const col = age < 0.5 ? '#ffffff' : age < 1 ? '#c8e8ff' : '#7aa8d0'
      rect(c, p.x - sp, p.y + Math.round(sp * 0.25), 2, 1, col)
      rect(c, p.x + sp, p.y + Math.round(sp * 0.25), 2, 1, col)
      if (age < 0.25) rect(c, p.x - 1, p.y, 3, 1, '#ffffff')
    }
    // The cut and its wall of water, standing up left to right, then falling back.
    const cq = span(t, T_SLASH, T_SLASH + 0.35)
    if (cq > 0) {
      const fall = ease.inQ(span(t, T_SLASH + 0.5, T_LAND + 0.3))
      // A pixel column at a time: a body of spray, thinning into a ragged, dithered crest with drops over it.
      for (let x = 0; x < W; x++) {
        const at = x / W
        const up = ease.outBack(span(cq, at * 0.8, at * 0.8 + 0.25))
        const ht = Math.round(wallH(x) * up * (1 - fall))
        const y = cutY(x)
        // The cut's white line on the water.
        rect(c, x, y, 1, 1, '#ffffff')
        if (ht <= 0) continue
        const crest = Math.min(ht, 6)
        rect(c, x, y - ht + crest, 1, ht - crest, pattern(c, '#d8f4ff', 12))
        rect(c, x, y - ht + crest, 1, Math.max(1, Math.round((ht - crest) * 0.4)), pattern(c, '#ffffff', 10))
        rect(c, x, y - ht, 1, crest, pattern(c, '#ffffff', 5))
        if ((x * 7 + Math.floor(t * 20)) % 11 === 0) rect(c, x, y - ht - 2 - (x % 4), 1, 1, '#ffffff')
      }
      // A rainbow hanging in the spray, the low sun behind us.
      const bow = span(t, T_SLASH + 0.35, T_SLASH + 0.8) * (1 - span(t, REVEAL + 0.6, REVEAL + 1.2))
      if (bow > 0)
        BOW.forEach((cc, i) =>
          ellipseLine(
            c,
            W * 0.55,
            110,
            120 - i * 2,
            70 - i * 2,
            pattern(c, cc, Math.round(bow * 9)) as string,
            Math.PI * 1.08,
            Math.PI * 1.92,
          ),
        )
    }
    // Ripples ringing out where it stands.
    if (t > T_LAND)
      for (let i = 0; i < 3; i++) {
        const age = (t - T_LAND - i * 0.35) % 1.2
        if (age < 0 || t - T_LAND < i * 0.35) continue
        const R = Math.round(8 + age * 30)
        ellipseLine(
          c,
          s.L.foe.x,
          s.L.foe.y + 1,
          R,
          Math.max(1, Math.round(R * 0.25)),
          age < 0.6 ? '#ffffff' : '#8ad0f0',
        )
      }
    // Reeds in the near shallows, black against the bright water.
    for (const [x0, n] of [
      [6, 7],
      [W - 30, 5],
    ] as const)
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 4 + ((i * 7) % 3)
        const ht = 22 + ((i * 13) % 14)
        const sway = Math.round(Math.sin(t * 1.5 + i) * 1.5)
        line(c, x, H, x + sway, H - ht, '#1a1a24')
        rect(c, x + sway - 1, H - ht, 2, 5, '#3a2a20')
      }
    dissolve(g, scratch, k)
  },
  before(g, s, t) {
    let a: { x: number; y: number; s: number; vx?: number } | null = null
    if (t > T_RUN && t < T_LEAP) a = runAt(t)
    else if (t >= T_LEAP && t < REVEAL) a = leapAt(t, s.L.foe)
    if (!a) return
    // Backlit by the sunrise: a dark shape, a gold rim.
    drawSprite(g, s.foe, Math.round(a.x), Math.round(a.y), {
      sil: '#1a2240',
      outline: Math.floor(t * 12) % 3 ? '#ffd890' : '#ffffff',
      sx: a.s,
      sy: a.s,
      flip: (a.vx ?? 1) > 0,
    })
    // At the top of the leap: the sword of water drawn from its horn, then the stroke.
    if (t >= T_TOP - 0.15 && t < T_SLASH + 0.25) {
      const hx = a.x + 6
      const hy = a.y - 34 * a.s
      const draw = ease.outC(span(t, T_TOP - 0.15, T_TOP + 0.05))
      const sweep = ease.inQ(span(t, T_SLASH - 0.08, T_SLASH + 0.05))
      const ang = lerp(-1.2, 1.1, sweep)
      const L = 56 * draw
      const ex = hx + Math.cos(ang) * L
      const ey = hy + Math.sin(ang) * L
      g.drawImage(glow(8, '#8ad0f0', 1.3, 0.7), Math.round(ex - 8), Math.round(ey - 8))
      line(g, hx, hy, ex, ey, '#4ab8f0', 4)
      line(g, hx, hy, ex, ey, '#c8f0ff', 2)
      line(g, hx, hy, ex, ey, '#ffffff')
      // Drops running off the blade.
      for (let i = 1; i < 5; i++)
        rect(
          g,
          hx + Math.cos(ang) * L * (i / 5) + 2,
          hy + Math.sin(ang) * L * (i / 5) + 3 + ((t * 40 + i * 5) % 6),
          1,
          2,
          '#c8f0ff',
        )
      if (draw < 1 || within2(t, T_TOP - 0.15, T_TOP)) {
        rect(g, ex - 4, ey, 9, 1, '#ffffff')
        rect(g, ex, ey - 4, 1, 9, '#ffffff')
      }
    }
    // The stroke's arc, a crescent of water flung across.
    if (t >= T_SLASH && t < T_SLASH + 0.3) {
      const q = span(t, T_SLASH, T_SLASH + 0.3)
      for (let i = 0; i < 3; i++)
        ellipseLine(
          g,
          a.x + 6,
          a.y - 20,
          60 + i * 3,
          26 + i,
          i ? '#8ad0f0' : '#ffffff',
          -0.2 + q * 0.6,
          1.4 + q * 0.6,
        )
    }
  },
  front(g, _s, t, k) {
    // Mist over the water, thinning as the sun climbs.
    if (k <= 0.3) return
    for (let i = 0; i < 3; i++) {
      const y = SHORE + 6 + i * 10
      const x = Math.round(((t * (6 + i * 4) + i * 80) % (W + 120)) - 120)
      const P = pattern(g, '#ffd8c0', Math.round((3 - i) * k))
      rect(g, x, y, 100, 3, P)
      rect(g, x + 20, y - 2, 50, 2, P)
    }
  },
  sounds: [
    [0.05, () => hiss(3.8, { freq: 700, q: 3, vol: 0.015 })],
    [0.3, () => [784, 988, 1175].forEach((f, i) => tone(f, 0.8, { type: 'sine', vol: 0.015, at: i * 0.2 }))],
    ...Array.from(
      { length: 14 },
      (_, i) => [T_RUN + i / 9, () => hiss(0.06, { freq: 2400 + (i % 2) * 400, vol: 0.03 })] as const,
    ),
    [T_LEAP, () => hiss(0.4, { freq: 1500, slide: 1500, vol: 0.06 })],
    [T_TOP - 0.15, () => (fxSound('water.charge'), tone(1568, 0.4, { type: 'triangle', vol: 0.025 }))],
    [T_SLASH, () => (fxSound('water.jet'), hiss(0.8, { freq: 900, slide: -500, vol: 0.1 }))],
    [
      3.4,
      () =>
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.3, { type: 'triangle', vol: 0.02, at: i * 0.08 }),
        ),
    ],
    [T_LAND, () => hiss(0.4, { freq: 600, vol: 0.08 })],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})

/** The wall of water's height along the cut: rolling, never a row of blocks. */
const wallH = (x: number) => 24 + 9 * Math.sin(x * 0.07) + 6 * Math.sin(x * 0.23 + 1) + 3 * Math.sin(x * 0.61)

/** The cut's line across the lake, slanting a little towards us on the right. */
const cutY = (x: number) => Math.round(84 + (x / W) * 10)
const within2 = (t: number, a: number, b: number) => t >= a && t < b
