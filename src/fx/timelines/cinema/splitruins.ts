// Regieleki's and Regidrago's raid entrances (docs/53): the Split-Decision Ruins in the Crown Tundra. A stone hall in
// the dark, dust in two shafts of light, its floor studded with round stones in rows and split down the middle: the
// left wall carved with zigzags, the right with scales, the Regis' seven dots in the wall between them. One half of
// the floor wakes, stone by stone, in a pattern, and the other half dies.
// Regieleki's: the left half lights yellow in two crossing zigzags; current races between the stones and up the wall
// and lights the dots; then a ball of lightning bursts out and tears round the hall, turning sharper and faster, its
// afterimages left at every turn, until it stops dead in the middle and every stone's lightning converges on it.
// Regidrago's: the right half lights violet in a serpent's curve; the stones lift off the floor as orbs and chain into
// a dragon of energy that winds up the hall, coils round it and roars; it dives into the floor, the split cracks open
// and Dragon Energy erupts from it as a pillar, the legend taking shape inside.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  polyline,
  rect,
  rng,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { burstRing, dGradient, tri } from './kit'
import { raidCinema, type Raid } from './gen8kit'

const T_WAKE = 0.9
const T_DOTS = 1.95
/** Regieleki's run: when it bursts out, when it stops dead. */
const T_RUN = 2.8
const T_STOP = 3.8
const E_REVEAL = 4.4
/** Regidrago's: the orbs lifting, its roar, its dive, the pillar. */
const T_LIFT = 1.95
const T_COIL = 2.85
const T_ROAR = 3.35
const T_DIVE = 3.75
const T_PILLAR = 3.95
const D_REVEAL = 4.6

const ELEKI = ['#ffffff', '#fff3a0', '#ffd23a', '#2a8ac8'] as const
const DRAGO = ['#ffffff', '#f0a0d0', '#b03a7a', '#3a0a3a'] as const
const GREEN = ['#e0ffe8', '#7aff9a', '#2ab05a'] as const

interface Dot {
  x: number
  y: number
  r: number
  /** Which half (−1 left, electric; 1 right, dragon), and its place in that half's pattern (−1: not in it). */
  side: number
  order: number
}

interface Hall {
  hall: Canvas
  dots: Dot[]
  floor: number
  /** Where the Regis' dots are in the wall. */
  glyph: [number, number][]
}

/** The hall, drawn once: stone blocks, the two halves' carvings, the glyph's sockets, pillars, the studded floor. */
function hall(s: Raid, r: Rng): Hall {
  const { w, h, cx } = s
  const floor = Math.round(h * 0.46)
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, floor, ['#0c0a08', '#1a1510', '#2a2118', '#352a1e']), 0, 0)
  // Blocks, each course offset.
  for (let y = floor - 12, row = 0; y > -12; y -= 12, row++) {
    rect(g, 0, y, w, 1, '#0e0b08')
    for (let x = (row % 2) * 11 - 22; x < w; x += 22) {
      rect(g, x, y, 1, 12, '#0e0b08')
      if (r() < 0.3) rect(g, x + 2, y + 2, 18, 9, '#30261b')
      rect(g, x + 1, y + 1, 20, 1, '#3e3224')
    }
  }
  // The carvings: zigzags left, scales right, a groove up the middle where the hall splits.
  for (let y = 14; y < floor - 8; y += 18)
    for (let x = 4; x < cx - 10; x += 12) {
      line(g, x, y, x + 3, y + 4, '#0e0b08')
      line(g, x + 3, y + 4, x + 6, y, '#0e0b08')
      line(g, x + 6, y, x + 9, y + 4, '#0e0b08')
    }
  for (let y = 14; y < floor - 8; y += 14)
    for (let x = cx + 12 + ((y / 14) % 2) * 5; x < w - 4; x += 10) {
      for (let a = 0; a <= 8; a++)
        rect(
          g,
          x + Math.round(Math.cos((a / 8) * Math.PI) * 4),
          y + Math.round(Math.sin((a / 8) * Math.PI) * 3),
          1,
          1,
          '#0e0b08',
        )
    }
  rect(g, cx - 1, 0, 3, floor, '#080604')
  rect(g, cx + 1, 0, 1, floor, '#3e3224')
  // The glyph: seven round sockets in a ring round a middle one.
  const gy = Math.round(floor * 0.42)
  const gr = Math.round(Math.max(9, s.m * 0.08))
  const glyph: [number, number][] = [[cx, gy]]
  for (let k = 0; k < 6; k++)
    glyph.push([
      Math.round(cx + Math.cos((k / 6) * Math.PI * 2) * gr),
      Math.round(gy + Math.sin((k / 6) * Math.PI * 2) * gr),
    ])
  rect(g, cx - gr - 6, gy - gr - 6, gr * 2 + 12, gr * 2 + 12, '#241c14')
  rect(g, cx - gr - 6, gy - gr - 6, gr * 2 + 12, 1, '#4a3c2a')
  for (const [x, y] of glyph) {
    ellipse(g, x, y, 2, 2, '#080604')
    rect(g, x - 1, y + 2, 3, 1, '#4a3c2a')
  }
  // Pillars at the sides.
  for (const side of [-1, 1]) {
    const pw = Math.round(Math.max(10, w * 0.05))
    const x = side < 0 ? Math.round(w * 0.04) : Math.round(w * 0.96) - pw
    rect(g, x, 0, pw, floor + 6, '#2a2118')
    rect(g, x, 0, 2, floor + 6, '#4a3c2a')
    rect(g, x + pw - 1, 0, 1, floor + 6, '#0e0b08')
    rect(g, x - 3, floor - 4, pw + 6, 6, '#3a2e22')
    rect(g, x - 3, floor - 4, pw + 6, 1, '#5a4a34')
  }
  // The floor in perspective, its groove down the middle, its studs.
  g.drawImage(dGradient(w, h - floor, ['#2a2118', '#1e1812', '#120e0a']), 0, floor)
  rect(g, 0, floor, w, 1, '#4a3c2a')
  for (let k = 1; k < 9; k++) rect(g, 0, Math.round(floor + (h - floor) * (k / 9) ** 1.4), w, 1, '#1a140e')
  for (let k = -12; k <= 12; k++) line(g, cx + k * 12, floor, cx + k * 40, h, '#1a140e')
  line(g, cx, floor, cx, h, '#080604', 3)
  const dots: Dot[] = []
  const rows = 7
  for (let k = 0; k < rows; k++) {
    const v = (k + 0.5) / rows
    const y = Math.round(floor + (h - floor) * v ** 1.25)
    const hw = lerp(w * 0.28, w * 0.62, v)
    for (let j = 0; j < 4; j++)
      for (const side of [-1, 1]) {
        const u = (j + 0.5) / 4
        const x = Math.round(cx + side * u * hw)
        // Electric: two zigzags crossing; dragon: a serpent's curve, its head nearest.
        const zig = [0, 1, 2, 3, 2, 1, 0][k]!
        const order =
          side < 0
            ? j === zig || j === 3 - zig
              ? k * 2 + (j === zig ? 0 : 1)
              : -1
            : j === Math.round(1.5 + 1.5 * Math.sin(k * 1.15)) || (k === rows - 1 && j < 2)
              ? k
              : -1
        dots.push({ x, y, r: Math.max(1, Math.round(1 + v * 2.5)), side, order })
      }
  }
  for (const d of dots) {
    ellipse(g, d.x, d.y + 1, d.r + 1, Math.max(1, d.r >> 1) + 1, '#0e0b08')
    ellipse(g, d.x, d.y, d.r, Math.max(1, d.r >> 1), '#4a4038')
    rect(g, d.x - (d.r >> 1), d.y - (d.r >> 1), 1, 1, '#6a5a4a')
  }
  return { hall: cv, dots, floor, glyph }
}

/** The light falling into the hall from cracks in the roof, and the dust turning in it. */
function shafts(g: G, s: Raid & Hall, t: number) {
  const fill = pattern(g, '#c8b890', 2)
  for (const side of [-1, 1]) {
    const x = s.cx + side * s.w * 0.22
    const bw = Math.max(5, Math.round(s.w * 0.04))
    tri(g, x - 3, 0, x + 3, 0, x + side * s.w * 0.08 + bw, s.floor + (s.h - s.floor) * 0.4, fill)
    tri(
      g,
      x - 3,
      0,
      x + side * s.w * 0.08 + bw,
      s.floor + (s.h - s.floor) * 0.4,
      x + side * s.w * 0.08 - bw,
      s.floor + (s.h - s.floor) * 0.4,
      fill,
    )
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1
    const y = (i * 37 + t * 8) % (s.floor + 20)
    const x = s.cx + side * s.w * 0.22 + side * (y / s.floor) * s.w * 0.06 + Math.sin(t + i) * 4
    rect(g, x, y, 1, 1, '#e8d8b0')
  }
}

/** The floor's pattern waking stone by stone from `t0`, a stone every `step` seconds; the other half dying. */
function drawDots(
  g: G,
  s: Raid & Hall,
  t: number,
  side: number,
  t0: number,
  step: number,
  col: readonly string[],
) {
  const dead = span(t, t0 + 0.4, t0 + 1.2)
  for (const d of s.dots) {
    if (d.side !== side) {
      // The other half: a faint glimmer at first, gone once the choice is made.
      if (t > t0 && dead < 1 && Math.floor(t * 7 + d.x) % 4 === 0) rect(g, d.x, d.y - 1, 1, 1, '#6a5a4a')
      continue
    }
    if (d.order < 0) continue
    const on = t - (t0 + d.order * step)
    if (on < 0) continue
    const flash = on < 0.12
    const gr = d.r * 3 + 3
    g.drawImage(glow(gr, col[2]!, 1.3, flash ? 0.9 : 0.55), d.x - gr, d.y - gr)
    ellipse(g, d.x, d.y, d.r, Math.max(1, d.r >> 1), flash ? '#ffffff' : col[1]!)
    rect(g, d.x, d.y - (d.r >> 1), 1, 1, '#ffffff')
  }
}

const lit = (s: Hall, side: number) => s.dots.filter((d) => d.side === side && d.order >= 0)

/** The glyph's seven dots lighting one by one from `t0`. */
function drawGlyph(g: G, s: Hall, t: number, t0: number, col: readonly string[]) {
  s.glyph.forEach(([x, y], i) => {
    if (t < t0 + i * 0.09) return
    g.drawImage(glow(6, col[2]!, 1.2, 0.8), x - 6, y - 6)
    ellipse(g, x, y, 2, 2, col[1]!)
    rect(g, x, y, 1, 1, '#ffffff')
  })
}

// ------------------------------------------------------------------------------------------------------- Regieleki

type EX = Hall & {
  run: [number, number][]
  at: number[]
  legs: [number, number][][]
  arcs: [number, number][][]
}

export const regielekiCinema = raidCinema<EX>({
  id: 'cinema-regieleki',
  reveal: E_REVEAL,
  seed: 894,
  aura: ELEKI,
  flash: '#fffbe0',
  feet: 0.62,
  rays: 0.6,
  bob: 1,
  shakes: [
    [T_RUN, 0.3, 2],
    [T_STOP, 0.35, 3],
    [E_REVEAL, 0.5, 3],
  ],
  flashes: [[T_RUN, 0.15, '#fffbe0', 0.45]],
  setup(s) {
    const r = rng(8940)
    const H = hall(s, s.r)
    // The run: out of the glyph, round the hall in sharp turns, each leg quicker, to a dead stop in the middle.
    const n = 13
    const run: [number, number][] = [H.glyph[0]!]
    for (let i = 1; i < n; i++) {
      const left = i % 2 ? r.range(0.06, 0.4) : r.range(0.6, 0.94)
      run.push([Math.round(s.w * left), Math.round(r.range(s.h * 0.12, s.h * 0.86))])
    }
    run.push([s.cx, s.feet - Math.round(s.sz.h / 2)])
    const at: number[] = [T_RUN]
    for (let i = 1; i <= n; i++) at.push(at[i - 1]! + lerp(0.13, 0.045, i / n))
    const scale = (T_STOP - T_RUN) / (at[n]! - T_RUN)
    for (let i = 0; i <= n; i++) at[i] = T_RUN + (at[i]! - T_RUN) * scale
    // Each leg of the run a jagged bolt, not a ruler's line.
    const legs = run.slice(1).map((p, i) => bolt(r, run[i]![0], run[i]![1], p[0], p[1], 0.18, 3))
    // The current between the lit stones, and up the wall to the glyph.
    const stones = lit(H, -1).sort((a, b) => a.order - b.order)
    const arcs: [number, number][][] = []
    for (let i = 1; i < stones.length; i++)
      arcs.push(bolt(r, stones[i - 1]!.x, stones[i - 1]!.y, stones[i]!.x, stones[i]!.y, 0.3, 3))
    arcs.push(bolt(r, stones[0]!.x, stones[0]!.y, H.glyph[4]![0], H.glyph[4]![1], 0.25, 4))
    return { ...H, run, at, legs, arcs }
  },
  step(s, t, dt) {
    const r = s.r
    // Each stone's blip as it wakes.
    for (const d of lit(s, -1)) {
      const at = T_WAKE + d.order * 0.07
      if (t >= at && t - dt < at)
        for (let k = 0; k < 5 * s.many; k++)
          s.fx.add({
            x: d.x,
            y: d.y,
            vx: r.range(-30, 30),
            vy: -r.range(10, 50),
            drag: 3,
            life: 0.3,
            size: 1,
            shape: 'px',
            colors: [ELEKI[0], ELEKI[1], ELEKI[2]],
          })
    }
    // Sparks thrown at every turn of the run.
    for (let i = 1; i < s.at.length; i++)
      if (t >= s.at[i]! && t - dt < s.at[i]!) {
        const [x, y] = s.run[i]!
        for (let k = 0; k < 14 * s.many; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 130)
          s.fx.add({
            x,
            y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 4,
            life: r.range(0.2, 0.45),
            size: 1,
            shape: r() < 0.4 ? 'star' : 'px',
            colors: [ELEKI[0], ELEKI[1], ELEKI[2], ELEKI[3]],
          })
        }
      }
    if (t > E_REVEAL && r() < 0.5 * s.many) {
      const a = r() * Math.PI * 2
      const R = s.sz.w * 0.6
      s.fx.add({
        x: s.cx + Math.cos(a) * R,
        y: s.feet - s.sz.h / 2 + Math.sin(a) * R * 0.8,
        vx: -Math.sin(a) * 60,
        vy: Math.cos(a) * 60,
        life: 0.25,
        size: 1,
        shape: 'streak',
        trail: 0.05,
        colors: [ELEKI[0], ELEKI[1]],
      })
    }
  },
  back(g, s, t) {
    g.drawImage(s.hall, 0, 0)
    shafts(g, s, t)
    drawDots(g, s, t, -1, T_WAKE, 0.07, ELEKI)
    // The current racing from stone to stone, and up the wall into the glyph.
    if (t > T_DOTS - 0.1 && t < T_STOP + 0.4) {
      const k = Math.floor((t - T_DOTS) * 40)
      s.arcs.forEach((a, i) => {
        if (t < T_DOTS + i * 0.04) return
        if ((k + i) % 3 === 0) return
        polyline(g, a, (k + i) % 2 ? ELEKI[1] : ELEKI[0])
      })
    }
    drawGlyph(g, s, t, T_DOTS + 0.35, ELEKI)
    // The convergence: every lit stone's lightning into the middle, once it stops.
    if (t > T_STOP && t < E_REVEAL) {
      const c = s.run[s.run.length - 1]!
      const f = Math.floor(t * 30)
      for (const d of lit(s, -1)) {
        if ((f + d.order) % 3 === 0) continue
        const b = bolt(rng(f * 31 + d.order), d.x, d.y, c[0], c[1], 0.25, 3)
        polyline(g, b, (f + d.order) % 2 ? ELEKI[0] : ELEKI[2])
      }
    }
  },
  before(g, s, t) {
    if (t < T_RUN) return
    // The ball of lightning: its head along the run, a white-hot trail behind it, afterimages left at the turns.
    const i = Math.max(0, s.at.findIndex((a) => a > t) - 1)
    const run = s.run
    if (t < T_STOP) {
      const q = span(t, s.at[i]!, s.at[i + 1]!)
      // The legs behind it, older ones dimmer and thinner; the current one drawn up to the head.
      for (let k = Math.max(0, i - 2); k <= i; k++) {
        const leg = s.legs[k]!
        const pts = k === i ? leg.slice(0, Math.max(2, Math.ceil(leg.length * q))) : leg
        const age = i - k
        if (age === 0) polyline(g, pts, ELEKI[2], 3)
        polyline(g, pts, age === 0 ? '#ffffff' : age === 1 ? ELEKI[1] : ELEKI[3], age === 2 ? 1 : 2)
      }
      const head: [number, number] = [
        lerp(run[i]![0], run[i + 1]![0], q),
        lerp(run[i]![1], run[i + 1]![1], q),
      ]
      const gr = 12
      g.drawImage(glow(gr, ELEKI[2], 1.2, 0.9), Math.round(head[0]) - gr, Math.round(head[1]) - gr)
      ellipse(g, head[0], head[1], 4, 4, ELEKI[1])
      ellipse(g, head[0], head[1], 2, 2, '#ffffff')
    }
    // Afterimages at the turns just passed: small, dark, edged in light, gone in a blink.
    for (let k = 1; k < s.at.length - 1; k++) {
      const e = t - s.at[k]!
      if (e < 0 || e > 0.16) continue
      const [x, y] = run[k]!
      drawSprite(g, s.mon, x, y + s.sz.h * 0.2, {
        sx: 0.42,
        sy: 0.42,
        sil: '#14100a',
        outline: e < 0.07 ? '#ffffff' : ELEKI[2],
      })
    }
    // Stopped dead: it crackles there in silhouette.
    if (t >= T_STOP)
      drawSprite(g, s.mon, s.cx, s.feet, {
        sil: '#14100a',
        outline: Math.floor(t * 20) % 2 ? ELEKI[0] : ELEKI[2],
        wave: { amp: Math.floor(t * 30) % 3 === 0 ? 1 : 0, len: 5, phase: t * 50 },
      })
  },
  sounds: [
    [0.05, () => hiss(2, { freq: 260, type: 'lowpass', vol: 0.05 })],
    ...Array.from(
      { length: 8 },
      (_, i) => [T_WAKE + i * 0.13, () => tone(880 + i * 110, 0.05, { type: 'square', vol: 0.02 })] as const,
    ),
    [T_DOTS, () => fxSound('thunder.charge')],
    ...Array.from(
      { length: 7 },
      (_, i) =>
        [T_DOTS + 0.35 + i * 0.09, () => tone(1568 + i * 98, 0.04, { type: 'square', vol: 0.02 })] as const,
    ),
    [T_RUN, () => (fxSound('thunder.strike'), hiss(0.2, { freq: 3000, vol: 0.05 }))],
    ...Array.from(
      { length: 6 },
      (_, i) =>
        [
          T_RUN + 0.15 + i * 0.13,
          () => tone(1200 + i * 200, 0.06, { type: 'sawtooth', vol: 0.02, slide: 600 }),
        ] as const,
    ),
    [
      T_STOP,
      () => (
        tone(110, 0.5, { type: 'sawtooth', vol: 0.05, slide: 200 }),
        hiss(0.5, { freq: 2400, vol: 0.06 })
      ),
    ],
  ],
})

// ------------------------------------------------------------------------------------------------------- Regidrago

type DX = Hall & { crack: [number, number][] }

/** The energy dragon's head at time τ: up out of the floor, winding up the hall, coiling round it, diving. */
function dragonAt(s: Raid & Hall, tau: number): [number, number] {
  const cy = s.feet - Math.round(s.sz.h * 0.55)
  const R = Math.min(s.w * 0.36, s.h * 0.24)
  if (tau < T_COIL) {
    const q = span(tau, T_LIFT, T_COIL)
    const start = lit(s, 1).sort((a, b) => b.order - a.order)[0]!
    const x = lerp(start.x, s.cx + R, q) + Math.sin(q * Math.PI * 3) * s.w * 0.18 * (1 - q)
    const y = lerp(start.y, cy - R * 0.2, q) - Math.sin(q * Math.PI) * s.h * 0.25
    return [x, y]
  }
  if (tau < T_DIVE) {
    const a = ((tau - T_COIL) / (T_DIVE - T_COIL)) * Math.PI * 2.6 - Math.PI * 0.1
    return [s.cx + Math.cos(a) * R, cy - R * 0.2 + Math.sin(a) * R * 0.7]
  }
  const a = Math.PI * 2.6 - Math.PI * 0.1
  const from: [number, number] = [s.cx + Math.cos(a) * R, cy - R * 0.2 + Math.sin(a) * R * 0.7]
  const q = ease.inQ(span(tau, T_DIVE, T_PILLAR))
  return [lerp(from[0], s.cx, q), lerp(from[1], s.feet, q)]
}

export const regidragoCinema = raidCinema<DX>({
  id: 'cinema-regidrago',
  reveal: D_REVEAL,
  seed: 895,
  aura: DRAGO,
  flash: '#ffe8f4',
  feet: 0.62,
  rays: 0.6,
  bob: 1,
  shakes: [
    [T_ROAR, 0.45, 3],
    [T_PILLAR, 0.6, 4],
    [D_REVEAL, 0.5, 3],
  ],
  flashes: [[T_PILLAR, 0.2, '#ffe0f0', 0.55]],
  setup(s) {
    const H = hall(s, s.r)
    const crack = bolt(rng(8950), s.cx, H.floor, s.cx, s.h, 0.12, 5)
    return { ...H, crack }
  },
  step(s, t, dt) {
    const r = s.r
    for (const d of lit(s, 1)) {
      const at = T_WAKE + d.order * 0.13
      if (t >= at && t - dt < at)
        for (let k = 0; k < 5 * s.many; k++)
          s.fx.add({
            x: d.x,
            y: d.y,
            vx: r.range(-20, 20),
            vy: -r.range(10, 40),
            drag: 3,
            life: 0.4,
            size: 1,
            shape: 'px',
            colors: [DRAGO[1], DRAGO[2], GREEN[1]],
          })
    }
    // Scales of light shed by the dragon as it winds.
    if (t > T_LIFT && t < T_PILLAR && r() < 0.8 * s.many) {
      const [x, y] = dragonAt(s, t - r.range(0, 0.4))
      s.fx.add({
        x,
        y,
        vx: r.range(-20, 20),
        vy: r.range(-20, 20),
        drag: 2,
        life: 0.5,
        size: 1,
        shape: r() < 0.5 ? 'star' : 'px',
        colors: [GREEN[0], GREEN[1], DRAGO[2]],
      })
    }
    // The pillar's spray of energy.
    if (t > T_PILLAR && t < D_REVEAL + 0.3 && r() < 1.2 * s.many)
      for (let k = 0; k < 2; k++)
        s.fx.add({
          x: s.cx + r.range(-s.sz.w * 0.35, s.sz.w * 0.35),
          y: s.feet,
          vx: r.range(-10, 10),
          vy: -r.range(120, 220),
          life: 0.7,
          size: 1,
          shape: 'streak',
          trail: 0.04,
          colors: [GREEN[0], GREEN[1], DRAGO[1], DRAGO[2]],
        })
    if (t > D_REVEAL && r() < 0.3 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.6, s.sz.w * 0.6),
        y: s.feet,
        vy: -r.range(15, 35),
        life: 1.2,
        size: 1,
        shape: 'px',
        colors: [GREEN[1], DRAGO[1], DRAGO[2]],
      })
  },
  back(g, s, t) {
    g.drawImage(s.hall, 0, 0)
    shafts(g, s, t)
    // The stones wake, then lift off the floor to become the dragon.
    if (t < T_LIFT + 0.3) drawDots(g, s, t, 1, T_WAKE, 0.13, DRAGO)
    drawGlyph(g, s, t, T_LIFT, DRAGO)
    // The split cracking open, green light in it.
    const cq = span(t, T_DIVE, T_PILLAR)
    if (cq > 0) {
      const n = Math.max(2, Math.round(s.crack.length * cq))
      const pts = s.crack.slice(0, n)
      // Blazing while the pillar burns, a faint green seam after.
      if (t < D_REVEAL + 0.5) polyline(g, pts, GREEN[2], 3)
      polyline(g, pts, t < D_REVEAL + 0.5 ? GREEN[0] : GREEN[2])
    }
    drawPillar(g, s, t)
  },
  before(g, s, t) {
    if (t > T_LIFT && t < T_PILLAR + 0.05) drawDragon(g, s, t)
    // Taking shape inside the pillar.
    if (t > T_PILLAR + 0.15) {
      const k = ease.outBack(span(t, T_PILLAR + 0.15, D_REVEAL - 0.05), 1.4)
      drawSprite(g, s.mon, s.cx, s.feet, {
        sx: k,
        sy: k,
        sil: '#1a0614',
        outline: Math.floor(t * 14) % 2 ? GREEN[1] : DRAGO[1],
      })
    }
  },
  sounds: [
    [0.05, () => hiss(2, { freq: 260, type: 'lowpass', vol: 0.05 })],
    ...Array.from(
      { length: 7 },
      (_, i) =>
        [T_WAKE + i * 0.13, () => tone(330 - i * 20, 0.12, { type: 'triangle', vol: 0.035 })] as const,
    ),
    [T_LIFT, () => tone(110, 1.4, { type: 'sawtooth', vol: 0.035, slide: 110 })],
    [T_LIFT + 0.1, () => hiss(1.6, { freq: 500, slide: 700, vol: 0.05 })],
    [T_COIL, () => fxSound('psychic.focus')],
    [
      T_ROAR,
      () => (
        tone(98, 0.7, { type: 'sawtooth', vol: 0.07, slide: -40 }),
        tone(147, 0.6, { type: 'square', vol: 0.035, slide: -60 }),
        hiss(0.6, { freq: 300, type: 'lowpass', vol: 0.12 })
      ),
    ],
    [T_DIVE, () => hiss(0.25, { freq: 900, slide: -600, vol: 0.06 })],
    [T_PILLAR, () => (fxSound('gmax.reveal'), hiss(0.8, { freq: 1200, slide: 1800, vol: 0.07 }))],
  ],
})

/** The dragon of energy: a chain of orbs after its head, spikes down its back, a snout whose jaws part when it roars. */
function drawDragon(g: G, s: Raid & Hall, t: number) {
  const z = Math.max(1, s.m / 130)
  const n = 22
  for (let i = n; i >= 1; i--) {
    const tau = t - i * 0.035
    if (tau < T_LIFT) continue
    const [x, y] = dragonAt(s, tau)
    const [bx, by] = dragonAt(s, tau - 0.02)
    const r = Math.max(2, Math.round(lerp(6, 2, i / n) * z))
    // A spike on every other segment, standing off its back.
    if (i % 2 === 0) {
      const a = Math.atan2(y - by, x - bx) - Math.PI / 2
      tri(
        g,
        x - Math.cos(a + 1.6) * r,
        y - Math.sin(a + 1.6) * r,
        x + Math.cos(a) * r * 2.1,
        y + Math.sin(a) * r * 2.1,
        x + Math.cos(a - 1.6) * r * 0.3,
        y + Math.sin(a - 1.6) * r * 0.3,
        GREEN[2],
      )
    }
    ellipse(g, x, y + 1, r + 1, r, DRAGO[3])
    ellipse(g, x, y, r, r, i % 4 === 0 ? GREEN[1] : DRAGO[2])
    if (r > 2) ellipse(g, x - 1, y - 1, r >> 1, r >> 1, i % 4 === 0 ? GREEN[0] : DRAGO[1])
  }
  const [hx, hy] = dragonAt(s, t)
  const [px, py] = dragonAt(s, t - 0.03)
  const a = Math.atan2(hy - py, hx - px)
  const roar = span(t, T_ROAR - 0.1, T_ROAR) * (1 - span(t, T_ROAR + 0.3, T_ROAR + 0.45))
  const k = z * (1.3 + roar * 1.1)
  const gr = Math.round(14 * k)
  g.drawImage(glow(gr, DRAGO[2], 1.3, 0.7), Math.round(hx) - gr, Math.round(hy) - gr)
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  // Along the snout (f) and across it (u): the skull sits back, the jaws reach forward.
  const at = (f: number, u: number): [number, number] => [
    hx + ca * f * k - sa * u * k,
    hy + sa * f * k + ca * u * k,
  ]
  const open = roar * 5
  // Horns swept back off the skull.
  for (const u of [-4, 4]) {
    const [x0, y0] = at(-3, u * 0.6)
    const [x1, y1] = at(-13, u * 1.6)
    line(g, x0, y0, x1, y1, GREEN[2], Math.max(2, Math.round(k)))
  }
  const sk = at(-2, 0)
  ellipse(g, sk[0], sk[1], Math.round(5 * k), Math.round(5 * k), DRAGO[3])
  ellipse(g, sk[0], sk[1], Math.round(4 * k), Math.round(4 * k), DRAGO[2])
  // Upper jaw (lit) and lower jaw, parted by the roar, a green maw between them.
  const top0 = at(-2, -4)
  const tip0 = at(12, -1 - open)
  const mid0 = at(2, 0)
  const bot0 = at(-1, 3)
  const tip1 = at(10, 2 + open)
  if (open > 0.5) tri(g, mid0[0], mid0[1], tip0[0], tip0[1], tip1[0], tip1[1], GREEN[1])
  tri(g, top0[0], top0[1], tip0[0], tip0[1], mid0[0], mid0[1], DRAGO[1])
  tri(g, bot0[0], bot0[1], tip1[0], tip1[1], mid0[0], mid0[1], DRAGO[2])
  // Its eye: green fire.
  const eye = at(0, -2)
  rect(
    g,
    eye[0] - 1,
    eye[1] - 1,
    Math.max(2, Math.round(k * 1.5)),
    Math.max(2, Math.round(k * 1.5)),
    GREEN[0],
  )
  if (roar > 0) burstRing(g, hx, hy, span(t, T_ROAR, T_ROAR + 0.5), s.m * 0.6, 2, DRAGO[1])
}

/** Dragon Energy: a pillar bursting up out of the split, wavering, violet edged in green, thinning upward. */
function drawPillar(g: G, s: Raid & Hall, t: number) {
  const q = ease.outC(span(t, T_PILLAR, T_PILLAR + 0.15))
  const out = span(t, D_REVEAL - 0.2, D_REVEAL + 0.4)
  if (q <= 0 || out >= 1) return
  const top = Math.round(lerp(s.feet, -4, q))
  const w0 = Math.max(8, s.sz.w * 0.3) * (1 - out)
  const gr = Math.round(w0 * 2)
  g.drawImage(glow(gr, DRAGO[2], 1.2, 0.7), s.cx - gr, s.feet - gr)
  const edge = pattern(g, GREEN[1], 6)
  for (let y = top; y < s.feet; y++) {
    // Narrower and sparser towards the top, the rows rippling.
    const up = (s.feet - y) / Math.max(1, s.feet - top)
    const hw = Math.round(w0 * (1 - up * 0.35) * (1 + 0.12 * Math.sin(y * 0.25 - t * 40)))
    if (hw < 1) continue
    rect(g, s.cx - hw - 2, y, hw * 2 + 4, 1, edge)
    if (up > 0.75 && (y + Math.floor(t * 30)) % 2) continue
    rect(g, s.cx - hw, y, hw * 2, 1, DRAGO[2])
    rect(g, s.cx - Math.round(hw * 0.6), y, Math.round(hw * 1.2), 1, DRAGO[1])
    rect(g, s.cx - Math.round(hw * 0.2), y, Math.max(1, Math.round(hw * 0.4)), 1, '#ffffff')
  }
  ellipse(g, s.cx, s.feet, Math.round(w0) + 5, 3, GREEN[1])
}
