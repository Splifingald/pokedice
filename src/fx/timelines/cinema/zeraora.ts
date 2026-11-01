// Zeraora's entrance (docs/53), on the battle stage: a city at night. Towers of lit windows, neon signs, streetlights
// down an empty avenue, power lines humming overhead. The lights flicker. Then something crosses the street too fast to
// see: a streak of blue-white plasma zigzagging from the road up a wall, over a roof, down again, faster and faster,
// leaving its own shape behind at every turn (afterimages fading in the dark), and every streetlight it passes bursts.
// It stops dead in the middle, crouched. Arcs leap to it from every sign and window left lit, the city going dark,
// plasma balling in its fists; Plasma Fists: it slams them into the road, a shockwave of light, the asphalt cracked
// with blue fire. The city's lights surge back on, and Zeraora stands up in them.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  glow,
  lerp,
  line,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve } from './kit'

const REVEAL = 4.0
const HZ = 84
const VP = { x: 118, y: HZ }
const T_STOP = 2.22
const T_DRAIN = 2.45
const T_SLAM = 3.3
const PLASMA = ['#ffffff', '#c8f8ff', '#5ad8ff', '#2a8aff', '#1a3aa8'] as const

/** Its path: when it gets to each turn, and where its feet are; the last is where it stops. */
const PATH: readonly [number, number, number][] = [
  [0.85, -12, 128],
  [0.98, 58, 134],
  [1.16, 18, 70],
  [1.33, 112, 36],
  [1.48, 204, 62],
  [1.61, 150, 142],
  [1.72, 232, 112],
  [1.82, 84, 104],
  [1.91, 36, 146],
  [1.99, 128, 122],
  [2.06, 212, 138],
  [2.13, 98, 116],
  [T_STOP, 0, 0],
]

/** Streetlights down both sides of the avenue: where each stands, and how tall. */
const LIGHTS: readonly [number, number, number][] = [
  [8, 150, 44],
  [44, 120, 30],
  [70, 104, 20],
  [88, 95, 13],
  [232, 150, 44],
  [196, 120, 30],
  [168, 104, 20],
  [150, 95, 13],
]
/** The neon signs on the towers (x, y, w, h, colour). */
const SIGNS: readonly [number, number, number, number, string][] = [
  [26, 40, 14, 6, '#ff5ab0'],
  [70, 26, 8, 16, '#5af0ff'],
  [186, 34, 16, 6, '#ffd23a'],
  [222, 22, 8, 14, '#ff5ab0'],
]

type X = {
  back: Canvas
  bolts: [number, number][][]
  cracks: [number, number][][]
  outs: number[]
  shakes: [number, number, number][]
}

/** The city: a dark sky with its own glow, towers of windows, the avenue in perspective, power lines. */
function city(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, HZ, ['#04040e', '#0a0a20', '#141436', '#22204a']), 0, 0)
  for (let i = 0; i < 30; i++) rect(g, r.range(0, W), r.range(0, 30), 1, 1, '#5a5a8a')
  // Far towers, then near ones each side, their windows lit at random.
  const tower = (x: number, wd: number, top: number, c: string, lit: number) => {
    rect(g, x, top, wd, HZ - top + 2, c)
    rect(g, x, top, 1, HZ - top, '#2a2a4a')
    for (let y = top + 3; y < HZ - 2; y += 4)
      for (let wx = x + 2; wx < x + wd - 2; wx += 3)
        if (r() < lit) rect(g, wx, y, 2, 2, r() < 0.8 ? '#ffe08a' : '#8ad8ff')
  }
  for (let x = 60; x < 180; x += 10) tower(x, 9, Math.round(HZ - 20 - r.range(0, 22)), '#0e0e22', 0.25)
  for (const [x, wd, top] of [
    [0, 30, 14],
    [28, 26, 30],
    [52, 16, 48],
    [210, 30, 8],
    [186, 26, 26],
    [170, 16, 46],
  ] as const)
    tower(x, wd, top, '#141428', 0.35)
  // The avenue: asphalt, kerbs and pavements converging, dashes down the middle.
  g.drawImage(dGradient(W, H - HZ, ['#1a1a26', '#14141e', '#0c0c14']), 0, HZ)
  for (let y = HZ; y < H; y++) {
    const q = (y - HZ) / (H - HZ)
    const half = Math.round(10 + q * 130)
    rect(g, VP.x - half - Math.round(6 + q * 40), y, Math.round(6 + q * 40), 1, '#24243a')
    rect(g, VP.x + half, y, Math.round(6 + q * 40), 1, '#24243a')
    rect(g, VP.x - half, y, 1, 1, '#4a4a6a')
    rect(g, VP.x + half - 1, y, 1, 1, '#4a4a6a')
  }
  for (let k = 0; k < 9; k++) {
    const q0 = (k / 9) ** 1.6
    const q1 = ((k + 0.5) / 9) ** 1.6
    const y0 = Math.round(HZ + (H - HZ) * q0)
    const y1 = Math.round(HZ + (H - HZ) * q1)
    for (let y = y0; y < y1; y++)
      rect(g, VP.x - 1, y, Math.max(1, Math.round(1 + ((y - HZ) / (H - HZ)) * 3)), 1, '#c8c8a0')
  }
  // Power lines sagging between poles across the top.
  for (const y0 of [22, 28]) {
    const pts: [number, number][] = []
    for (let x = 0; x <= W; x += 8) pts.push([x, y0 + Math.sin((x / W) * Math.PI) * 10])
    polyline(g, pts, '#05050c')
  }
  // The streetlights' poles and arms.
  for (const [x, y, ht] of LIGHTS) {
    const side = x < VP.x ? 1 : -1
    rect(g, x, y - ht, Math.max(1, Math.round(ht / 14)), ht, '#2a2a3a')
    line(g, x, y - ht, x + side * Math.round(ht * 0.3), y - ht, '#2a2a3a', Math.max(1, Math.round(ht / 16)))
  }
  return cv
}

/** Where its feet are at turn i (the last turn is where it stops: its own place). */
const turnAt = (i: number, foe: { x: number; y: number }): [number, number] =>
  i === PATH.length - 1 ? [foe.x, foe.y] : [PATH[i]![1], PATH[i]![2]]

export const zeraoraCinema = bossCinema<X>({
  id: 'cinema-zeraora',
  reveal: REVEAL,
  seed: 807,
  aura: ['#ffffff', '#fff3a0', '#5ad8ff', '#1a3a8a'],
  flash: '#e8f8ff',
  setup(st, r) {
    const foe = st.L.foe
    const pts = PATH.map((_, i) => turnAt(i, foe))
    // Each light goes out as it passes the nearest turn to it.
    const outs = LIGHTS.map(([x, y, ht]) => {
      let best = Infinity
      let at = T_STOP
      PATH.forEach(([t], i) => {
        const [px, py] = pts[i]!
        const d = Math.hypot(px - x, py - (y - ht))
        if (d < best && i > 0) {
          best = d
          at = t
        }
      })
      return at
    })
    return {
      back: city(r),
      bolts: pts.slice(1).map(([x, y], i) => bolt(r, pts[i]![0], pts[i]![1] - 14, x, y - 14, 0.18, 4)),
      cracks: Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
        const len = r.range(30, 70)
        return bolt(r, foe.x, foe.y, foe.x + Math.cos(a) * len, foe.y + Math.sin(a) * len * 0.35, 0.3, 4)
      }),
      outs,
      shakes: [
        [T_STOP, 0.25, 2],
        [T_SLAM, 0.6, 5],
      ],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const fz = spriteSize(s.foe)
    // A streetlight bursting as it passes: glass and sparks.
    LIGHTS.forEach(([x, y, ht], i) => {
      if (within(t, s.outs[i]!, s.outs[i]! + dt))
        for (let k = 0; k < 12; k++)
          s.fx.add({
            x: x + (x < VP.x ? 1 : -1) * ht * 0.3,
            y: y - ht,
            vx: r.range(-50, 50),
            vy: -r.range(10, 60),
            ay: 260,
            life: r.range(0.3, 0.6),
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#fff3a0', PLASMA[2]],
          })
    })
    // Sparks off it at every turn.
    PATH.forEach(([at], i) => {
      if (i && within(t, at, at + dt)) {
        const [x, y] = turnAt(i, s.L.foe)
        for (let k = 0; k < 10; k++)
          s.fx.add({
            x,
            y: y - 10,
            vx: r.range(-80, 80),
            vy: r.range(-80, 40),
            drag: 3,
            life: 0.35,
            size: 1,
            shape: r() < 0.5 ? 'plus' : 'px',
            colors: [...PLASMA.slice(0, 3)],
          })
      }
    })
    // The slam: plasma thrown out low along the road.
    if (within(t, T_SLAM, T_SLAM + dt))
      for (let k = 0; k < 60; k++) {
        const a = r() * Math.PI * 2
        const v = r.range(80, 200)
        s.fx.add({
          x: s.L.foe.x,
          y: s.L.foe.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.35 - 20,
          drag: 2.5,
          life: r.range(0.4, 0.8),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'star' : 'sq',
          colors: [...PLASMA],
        })
      }
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.5)
      s.fx.add({
        x: s.L.foe.x + r.range(-fz.w * 0.5, fz.w * 0.5),
        y: s.L.foe.y - r.range(0, fz.h),
        vx: r.range(-30, 30),
        vy: r.range(-30, 30),
        life: 0.15,
        size: 2,
        shape: 'plus',
        colors: ['#ffffff', PLASMA[2]],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#04040e')
    g.save()
    g.translate(sh.x, sh.y)
    dissolve(g, s.back, k)
    if (k > 0.5) {
      // The city's power: on, flickering, drained into it, then surging back on the reveal.
      const power = t < T_DRAIN ? 1 : t < REVEAL ? 1 - span(t, T_DRAIN, T_SLAM) : 1
      const flick = within(t, 0.55, 0.8) && Math.floor(t * 30) % 3 === 0
      SIGNS.forEach(([x, y, wd, ht, c], i) => {
        const on = power > i / SIGNS.length && !flick
        if (on)
          g.drawImage(
            glow(Math.max(wd, ht), c, 1.6, 0.375),
            x + (wd >> 1) - Math.max(wd, ht),
            y + (ht >> 1) - Math.max(wd, ht),
          )
        rect(g, x, y, wd, ht, on ? c : '#1a1a2a')
        if (on) rect(g, x + 1, y + 1, wd - 2, 1, '#ffffff')
      })
      LIGHTS.forEach(([x, y, ht], i) => {
        const lx = x + (x < VP.x ? 1 : -1) * Math.round(ht * 0.3)
        const ly = y - ht
        const on = (t < s.outs[i]! || t > REVEAL) && !flick
        const r = Math.max(5, Math.round(ht * 0.45))
        if (on) {
          g.drawImage(glow(r, '#e0d8a0', 1.8, 0.375), lx - r, ly - r + 2)
          // Its pool of light on the street.
          rect(g, lx - Math.round(r * 0.6), y - 1, Math.round(r * 1.2), 1, '#3a3a40')
        }
        rect(g, lx - 1, ly, 3, 2, on ? '#ffffe0' : '#3a3a4a')
      })
      wash(g, '#010108', 0.45 * (1 - power), 8)
      // The cracks of blue fire in the road after the slam, bright in the dark.
      if (t > T_SLAM) {
        const q = span(t, T_SLAM, T_SLAM + 0.15)
        const fade = 1 - span(t, REVEAL + 0.5, REVEAL + 1.3)
        if (fade > 0)
          for (const c of s.cracks) {
            const n = Math.max(2, Math.round(c.length * q))
            polyline(g, c.slice(0, n), fade > 0.5 ? PLASMA[2] : PLASMA[3], 2)
            if (Math.floor(t * 20) % 3) polyline(g, c.slice(0, n), PLASMA[0])
          }
      }
    }
    g.restore()
  },
  before(g, s, t) {
    const fz = spriteSize(s.foe)
    // The dash: its shape at each turn, fading, flipped the way it runs; the trail of plasma between turns.
    PATH.forEach(([at], i) => {
      if (!i || t < at) return
      const age = t - at
      // The last turn is where it stops: drawn below, crouched.
      if (i === PATH.length - 1 || age > 0.35) return
      const [x, y] = turnAt(i, s.L.foe)
      const [px] = turnAt(i - 1, s.L.foe)
      // Smaller up on the roofs and far down the street.
      const far = lerp(0.6, 1, span(y, HZ - 50, H))
      drawSprite(g, s.foe, x, y, {
        sil: '#0a1a3a',
        outline: age < 0.1 ? '#ffffff' : PLASMA[2],
        alpha: 1 - age / 0.35,
        sx: far,
        sy: far,
        flip: x < px,
      })
    })
    // Stopped dead: crouched, crackling; then rising slowly, its fists balled with plasma.
    if (t >= T_STOP) {
      const crouch = t < T_SLAM + 0.2 ? 0.86 : lerp(0.86, 1, span(t, T_SLAM + 0.2, REVEAL))
      drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, {
        sil: '#0a1a3a',
        sy: crouch,
        outline: Math.floor(t * 20) % 2 ? PLASMA[1] : PLASMA[2],
      })
      // Arcs from the city's lights to it while it drains them.
      if (t > T_DRAIN && t < T_SLAM && Math.floor(t * 30) % 2 === 0) {
        const r = rng(Math.floor(t * 30))
        for (const [x, y, wd, ht] of SIGNS.slice(
          0,
          Math.ceil(SIGNS.length * (1 - span(t, T_DRAIN, T_SLAM))),
        )) {
          const pts = bolt(
            r,
            x + wd / 2,
            y + ht / 2,
            s.L.foe.x + r.range(-8, 8),
            s.L.foe.y - fz.h * 0.5,
            0.25,
            4,
          )
          polyline(g, pts, PLASMA[3], 2)
          polyline(g, pts, PLASMA[1])
        }
      }
      if (t > T_DRAIN && t < T_SLAM + 0.1) {
        const q = span(t, T_DRAIN, T_SLAM)
        const rr = Math.round(4 + q * 7)
        for (const side of [-1, 1]) {
          const fx = s.L.foe.x + side * Math.round(fz.w * 0.36)
          const fy = Math.round(s.L.foe.y - fz.h * 0.4 + q * fz.h * 0.3)
          g.drawImage(glow(rr * 2, PLASMA[2], 1.2, 0.8), fx - rr * 2, fy - rr * 2)
          rect(g, fx - 2, fy - 2, 5, 5, '#ffffff')
        }
      }
    }
  },
  front(g, s, t) {
    // The plasma trail: each leg a jagged streak, white-hot as it is cut, gone in a moment.
    s.bolts.forEach((pts, i) => {
      const at = PATH[i + 1]![0]
      const from = PATH[i]![0]
      if (t < from || t > at + 0.3) return
      const drawn = span(t, from, at)
      const n = Math.max(2, Math.round(pts.length * drawn))
      const age = t - at
      const part = pts.slice(0, n)
      polyline(g, part, age > 0.15 ? PLASMA[4] : PLASMA[3], age > 0.15 ? 1 : 3)
      if (age < 0.15) polyline(g, part, PLASMA[0])
    })
    // Plasma Fists: the shockwave along the road, a light-white burst.
    const fz = spriteSize(s.foe)
    burstRing(g, s.L.foe.x, s.L.foe.y, span(t, T_SLAM, T_SLAM + 0.5), 150, 3, PLASMA[1])
    burstRing(g, s.L.foe.x, s.L.foe.y - fz.h / 2, span(t, T_SLAM + 0.06, T_SLAM + 0.5), 110, 2, PLASMA[2])
    if (within(t, T_SLAM, T_SLAM + 0.25))
      screenFlash(g, '#c8f8ff', 0.6 * (1 - span(t, T_SLAM, T_SLAM + 0.25)))
    if (within(t, 0.55, 0.62)) screenFlash(g, '#202040', 0.3)
  },
  sounds: [
    [0.1, () => tone(60, 3.2, { type: 'sawtooth', vol: 0.012 })],
    [
      0.55,
      () => (hiss(0.25, { freq: 4000, q: 3, vol: 0.04 }), tone(120, 0.25, { type: 'square', vol: 0.02 })),
    ],
    ...PATH.slice(1).map(
      ([at], i) =>
        [
          at,
          () => (
            hiss(0.08, { freq: 3000 + i * 150, vol: 0.05 }),
            tone(1400 + i * 60, 0.04, { type: 'square', vol: 0.02 })
          ),
        ] as const,
    ),
    [0.85, () => hiss(1.3, { freq: 1500, slide: 3000, vol: 0.04 })],
    [T_STOP, () => fxSound('thunder.charge')],
    [T_DRAIN, () => (fxSound('thunder.charge'), tone(80, 0.85, { type: 'sawtooth', vol: 0.04, slide: 160 }))],
    [
      T_SLAM,
      () => (
        fxSound('thunder.strike'),
        fxSound('impact.hit'),
        hiss(0.8, { freq: 200, type: 'lowpass', vol: 0.14 })
      ),
    ],
    [3.65, () => fxSound('legend.heart')],
    [REVEAL, () => (fxSound('legend.roar'), tone(1760, 0.1, { type: 'square', vol: 0.02 }))],
  ],
})
