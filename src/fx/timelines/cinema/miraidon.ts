// Miraidon's raid entrance (docs/53): Area Zero in the far future. Black, then a neon grid boots up across the crater's
// floor, line by line out of the vanishing point, the crater's rim traced in light, monoliths hanging over it, a
// beacon tower. The grid hums and pulses; two headlights far off at the horizon. It comes up the grid out of the
// distance, a shape outlined in neon trailing a ribbon of light, and swings into an Electro Drift: a full skidding
// circle round the middle, sparks spraying off it, its trail painting a ring of light on the floor. The ring closes and
// the ground inside it turns into Electric Terrain, crackling; it skids to a stop in the middle.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipseLine,
  glow,
  lerp,
  line,
  polyline,
  rect,
  rng,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash } from '../../timeline'
import { groundRing, raidScene, ridge, stars, type Ctx } from './gen9kit'
import { dGradient, pulse } from './kit'

const T_BOOT = 0.35
/** The grid's pulses as it hums, quickening. */
const PULSES = [1.5, 1.95, 2.3, 2.55] as const
const T_LIGHTS = 2.05
const T_RUN = 2.6
const T_DRIFT = 3.2
const T_RING = 3.9
const REVEAL = 4.4

const AURA = ['#ffffff', '#d0f0ff', '#8a6aff', '#2a1a6a'] as const
const CYAN = '#4af0ff'
const PINK = '#ff4ad8'
const VOLT = '#f0ff4a'

type X = {
  sky: Canvas
  floor: Canvas
  trail: { x: number; y: number; t: number }[]
  sparks: number
}

function layout(c: Ctx) {
  const horizon = Math.round(c.h * 0.4)
  // The drift's circle: round its feet, flattened by the floor's perspective.
  const rx = Math.round(Math.min(c.w * 0.4, c.h * 0.45))
  const ry = Math.max(8, Math.round(rx * 0.28))
  return { horizon, rx, ry }
}

/** The sky and the far crater, drawn once: stars, the rim, monoliths, the beacon tower. */
function sky(c: Ctx): Canvas {
  const { w } = c
  const L = layout(c)
  const cv = canvas(w, L.horizon + 2)
  const g = cv.g
  g.drawImage(dGradient(w, L.horizon + 2, ['#03010a', '#0a0420', '#1a0a3e', '#3a0e5a', '#6a1a6a']), 0, 0)
  stars(g, rng(1008), w, L.horizon * 0.7, Math.round(w * 0.3), '#d0f0ff', '#4a3a8a')
  // The crater's far wall, dark, its edge traced live.
  ridge(g, w, L.horizon, c.h * 0.05, '#0c0620', 81, L.horizon + 2, 0.6)
  return cv
}

/** The rim's line: the same ridge as the sky's, its top edge, for the scan to trace. */
function rimY(c: Ctx, x: number) {
  const L = layout(c)
  const r = rng(81)
  const f1 = r.range(18, 34)
  const f2 = r.range(6, 12)
  const p1 = r() * 9
  const p2 = r() * 9
  const amp = c.h * 0.05
  return Math.round(
    L.horizon -
      amp * (0.6 + 0.4 * Math.sin(x / f1 + p1)) -
      amp * 0.6 * Math.abs(Math.sin(x / f2 + p2)) -
      amp * 0.08 * ((x * 7) % 3),
  )
}

/** Its path: up the grid out of the distance, then the drifting circle, then the skid to the middle. */
function path(c: Ctx, t: number) {
  const L = layout(c)
  const front = { x: c.cx - L.rx, y: c.feet }
  if (t < T_DRIFT) {
    const q = span(t, T_RUN, T_DRIFT)
    const k = ease.inQ(q)
    return {
      x: lerp(c.cx, front.x, k) + Math.sin(q * 9) * 4 * q,
      y: lerp(L.horizon + 1, front.y, k),
      s: lerp(0.12, 0.8, k),
    }
  }
  if (t < T_RING) {
    // Round the back first (up the screen), then the far side, the front, and back to where it came in.
    const q = span(t, T_DRIFT, T_RING)
    const a = Math.PI + q * Math.PI * 2
    const y = c.feet + Math.sin(a) * L.ry
    // Smaller on a narrow phone, so it stays on the screen round the far side of the circle.
    const fit = Math.min(1, (c.w * 0.55) / Math.max(1, c.sz.w))
    return { x: c.cx + Math.cos(a) * L.rx, y, s: fit * lerp(0.7, 0.95, (y - (c.feet - L.ry)) / (2 * L.ry)) }
  }
  const q = ease.outC(span(t, T_RING, REVEAL - 0.05))
  return { x: lerp(front.x, c.cx, q), y: c.feet, s: lerp(0.8, 1, q) }
}

/** The floor's grid: lines out of the vanishing point, rows coming towards us, a pulse running down it. */
function drawGrid(g: G, c: Ctx, floor: Canvas, t: number) {
  const L = layout(c)
  const bottom = c.h
  const boot = span(t, T_BOOT, T_BOOT + 0.9)
  if (boot <= 0) return
  // The floor itself, a deep violet, lit near the horizon.
  g.drawImage(floor, 0, L.horizon)
  // Rows: depth 1/(n + f), scrolling towards us as if we moved.
  const f = (t * 1.6) % 1
  const rows = span(t, T_BOOT + 0.4, T_BOOT + 1.1)
  const pulses = PULSES.map((p) => span(t, p, p + 0.7))
  for (let n = 0; n < 14; n++) {
    const y = Math.round(L.horizon + (bottom - L.horizon) / (n + 1 - f + 0.25) / 1.6)
    if (y >= bottom || y <= L.horizon) continue
    if ((n + 1) / 14 > rows * 1.2) continue
    const dy = (y - L.horizon) / (bottom - L.horizon)
    const lit = pulses.some((q) => q > 0 && q < 1 && Math.abs(dy - ease.inQ(q)) < 0.06)
    rect(g, 0, y, c.w, 1, lit ? CYAN : dy > 0.3 ? '#2a3a9a' : '#2a2070')
  }
  // Columns, drawn out of the vanishing point one after another as it boots.
  const n = Math.ceil(c.w / 2 / Math.max(8, c.w * 0.07)) + 6
  const step = Math.max(8, c.w * 0.07) * 2.2
  for (let k = -n; k <= n; k++) {
    const q = span(boot, (Math.abs(k) / (n + 2)) * 0.6, (Math.abs(k) / (n + 2)) * 0.6 + 0.4)
    if (q <= 0) continue
    const xb = c.cx + k * step
    const yb = bottom
    line(g, c.cx, L.horizon, lerp(c.cx, xb, q), lerp(L.horizon, yb, q), k === 0 ? '#5a4ad0' : '#2a3a9a')
  }
  // The horizon line, burning.
  rect(g, 0, L.horizon, c.w, 1, PINK)
}

const floorC = (c: Ctx) => {
  const L = layout(c)
  return dGradient(c.w, c.h - L.horizon, ['#3a0e5a', '#140630', '#0a0420', '#06021a'], 3)
}

export const miraidonCinema = raidScene<X>({
  id: 'cinema-miraidon',
  reveal: REVEAL,
  seed: 1008,
  aura: AURA,
  flash: '#e8f0ff',
  feet: 0.62,
  rays: '#8a6aff',
  setup(c) {
    return { sky: sky(c), floor: floorC(c), trail: [], sparks: 0 }
  },
  step(c, s, t) {
    const r = s.r
    const L = layout(c)
    // The ribbon of light it leaves on the floor.
    if (t >= T_RUN && t < REVEAL) {
      const p = path(c, t)
      s.trail.push({ x: p.x, y: p.y, t })
    }
    // Data falling in the sky, faint: the future's air.
    if (t > T_BOOT && r() < 0.3 * c.many)
      s.fx.add({
        x: Math.round(r.range(0, c.w) / 4) * 4,
        y: -2,
        vy: r.range(30, 60),
        life: L.horizon / 45,
        size: 1,
        shape: 'px',
        colors: ['#8a6aff', '#4a3a8a', '#2a1a6a'],
      })
    // Drift sparks off its outside, thrown wide.
    if (t > T_DRIFT && t < T_RING + 0.3) {
      const p = path(c, t)
      const a = Math.atan2((p.y - c.feet) / L.ry, (p.x - c.cx) / L.rx)
      for (let i = 0; i < 3 * c.many + 1; i++)
        s.fx.add({
          x: p.x,
          y: p.y - 2,
          vx: Math.cos(a) * r.range(60, 140) + r.range(-20, 20),
          vy: Math.sin(a) * r.range(20, 50) - r.range(20, 60),
          ay: 220,
          life: r.range(0.25, 0.5),
          size: 1,
          shape: 'streak',
          trail: 0.03,
          colors: ['#ffffff', VOLT, CYAN, '#8a6aff'],
        })
    }
    // The terrain switching on: arcs leaping up off the ring.
    if (t > T_RING && t < REVEAL + 2 && r() < 0.5 * c.many) {
      const a = r() * Math.PI * 2
      s.fx.add({
        x: c.cx + Math.cos(a) * L.rx,
        y: c.feet + Math.sin(a) * L.ry,
        vy: -r.range(20, 50),
        life: 0.35,
        size: 1,
        shape: 'plus',
        colors: ['#ffffff', VOLT, '#8a8a20'],
      })
    }
  },
  back(g, c, s, t) {
    const L = layout(c)
    g.drawImage(s.sky, 0, 0)
    // The rim traced in light, left to right, then held.
    const scan = span(t, T_BOOT + 0.2, T_BOOT + 1.2)
    if (scan > 0) {
      const x1 = Math.round(c.w * scan)
      for (let x = 0; x < x1; x++) rect(g, x, rimY(c, x), 1, 1, x > x1 - 6 ? '#ffffff' : '#c84ad8')
    }
    // Monoliths hanging over the crater, outlined, slowly turning their light on.
    drawMonoliths(g, c, t)
    drawGrid(g, c, s.floor, t)
    // The headlights far off on the horizon, growing as it comes.
    if (t > T_LIGHTS && t < T_RUN + 0.1) {
      const q = span(t, T_LIGHTS, T_RUN)
      const gr = Math.round(4 + q * 8)
      g.drawImage(glow(gr, CYAN, 1.3, 0.8), c.cx - gr, L.horizon - gr)
      rect(g, c.cx - 2, L.horizon - 1, 1, 1, '#ffffff')
      rect(g, c.cx + 1, L.horizon - 1, 1, 1, '#ffffff')
    }
    // Electric Terrain: the floor inside the closed ring turning yellow, flickering.
    if (t > T_RING) {
      const k = span(t, T_RING, T_RING + 0.3)
      const on = Math.floor(t * 18) % 4 !== 0 || t > REVEAL
      if (on)
        for (let dy = -L.ry; dy <= L.ry; dy += 2) {
          const hw = Math.round(L.rx * k * Math.sqrt(1 - (dy * dy) / (L.ry * L.ry)))
          rect(
            g,
            c.cx - hw,
            c.feet + dy,
            hw * 2,
            1,
            (dy + Math.floor(t * 12)) % 4 === 0 ? '#e0f040' : '#6a6a14',
          )
        }
      if (on)
        for (let k2 = -3; k2 <= 3; k2++) {
          const x = c.cx + k2 * Math.round(L.rx / 3.5) * k
          const hh = Math.round(L.ry * Math.sqrt(Math.max(0, 1 - ((x - c.cx) / L.rx) ** 2)))
          rect(g, x, c.feet - hh, 1, hh * 2, '#a8b020')
        }
    }
    drawTrail(g, s, t)
  },
  before(g, c, _s, t) {
    if (t < T_RUN) return
    const p = path(c, t)
    // Facing where it goes: front sprites look left.
    const ahead = path(c, t + 0.03)
    const flip = ahead.x > p.x + 0.2
    const gr = Math.round(10 + 14 * p.s)
    g.drawImage(
      glow(gr, '#8a6aff', 1.3, 0.7),
      Math.round(p.x) - gr,
      Math.round(p.y - c.sz.h * p.s * 0.45) - gr,
    )
    // Afterimages, cyan and pink, splitting off it at speed.
    drawSprite(g, c.mon, Math.round(p.x), Math.round(p.y), {
      sx: p.s,
      sy: p.s,
      flip,
      sil: '#100626',
      outline: Math.floor(t * 20) % 2 ? CYAN : PINK,
      ghost: [
        { dx: flip ? -4 : 4, color: CYAN, a: 0.75 },
        { dx: flip ? -8 : 8, color: PINK, a: 0.5 },
      ],
    })
  },
  front(g, c, s, t) {
    const L = layout(c)
    // The ring's closing: a white flash running round it, a shock along the floor.
    const q = span(t, T_RING, T_RING + 0.4)
    if (q > 0 && q < 1) {
      ellipseLine(
        g,
        c.cx,
        c.feet,
        L.rx + 1,
        L.ry + 1,
        '#ffffff',
        -Math.PI / 2,
        -Math.PI / 2 + q * Math.PI * 2,
      )
      for (let i = 0; i < 3; i++)
        polyline(
          g,
          bolt(
            s.r,
            c.cx + (i - 1) * L.rx * 0.5,
            c.feet - L.ry,
            c.cx + (i - 1) * L.rx * 0.3,
            c.feet + L.ry,
            0.4,
            3,
          ),
          VOLT,
        )
    }
    groundRing(g, c.cx, c.feet, span(t, T_RING, T_RING + 0.6), Math.max(c.w, c.h) * 0.7, VOLT)
    groundRing(g, c.cx, c.feet, span(t, T_RING + 0.12, T_RING + 0.72), Math.max(c.w, c.h) * 0.7, CYAN)
    const hum = pulse(t, T_RING - 0.05, T_RING + 0.25)
    if (hum > 0) screenFlash(g, '#f0ff4a', 0.18 * hum)
  },
  shakes: () => [
    [T_DRIFT, 0.2, 1],
    [T_RING, 0.4, 2],
  ],
  sounds: () => [
    // The grid booting: a rising arpeggio, a hum under it.
    ...[0, 1, 2, 3, 4, 5].map(
      (i) =>
        [
          T_BOOT + i * 0.14,
          () => tone([220, 277, 330, 440, 554, 660][i]!, 0.18, { type: 'square', vol: 0.02 }),
        ] as const,
    ),
    [T_BOOT + 0.4, () => tone(55, 3.6, { type: 'sawtooth', vol: 0.02, slide: 40 })],
    ...PULSES.map(
      (p, i) => [p, () => tone(110 * (i + 2), 0.3, { type: 'sine', vol: 0.04, slide: 220 })] as const,
    ),
    [T_LIGHTS, () => tone(200, 1.5, { type: 'sawtooth', vol: 0.025, slide: 900 })],
    [T_RUN, () => fxSound('thunder.charge')],
    [
      T_DRIFT,
      () => (
        hiss(0.7, { freq: 3000, slide: -1800, vol: 0.06 }),
        tone(600, 0.7, { type: 'square', vol: 0.02, slide: 500 })
      ),
    ],
    [T_RING, () => (fxSound('thunder.strike'), tone(880, 0.4, { type: 'square', vol: 0.03, slide: -440 }))],
    [T_RING + 0.15, () => fxSound('legend.heart')],
  ],
})

/** Black monoliths hanging over the crater, edges lit in neon, bobbing slowly. */
function drawMonoliths(g: G, c: Ctx, t: number) {
  const L = layout(c)
  const on = span(t, 1.0, 1.6)
  if (on <= 0) return
  const spots = [0.12, 0.34, 0.7, 0.9].filter((f) => c.w > 200 || f === 0.12 || f === 0.9)
  spots.forEach((f, i) => {
    const x = Math.round(c.w * f)
    const y = Math.round(L.horizon * (0.45 + (i % 2) * 0.12) + Math.sin(t * 1.2 + i) * 2)
    const hw = Math.round(c.m * 0.035) + 2
    const hh = hw * 2
    // An octahedron: two triangles, dark inside, one edge lit.
    for (let dy = -hh; dy <= hh; dy++) {
      const ww = Math.round(hw * (1 - Math.abs(dy) / hh))
      rect(g, x - ww, y + dy, ww * 2 + 1, 1, '#0c0420')
    }
    const col = on >= 1 && Math.floor(t * 2 + i) % 5 ? (i % 2 ? CYAN : PINK) : '#4a3a8a'
    line(g, x, y - hh, x - hw, y, col)
    line(g, x - hw, y, x, y + hh, col)
    line(g, x, y - hh, x + hw, y, '#2a1a6a')
    line(g, x + hw, y, x, y + hh, '#2a1a6a')
    rect(g, x, y - hh, 1, hh * 2, '#2a1a6a')
  })
  // The beacon tower on the rim, its lamp blinking.
  const tx = Math.round(c.w * 0.62)
  const top = Math.round(L.horizon - c.h * 0.16)
  rect(g, tx, top, 2, L.horizon - top, '#0c0420')
  rect(g, tx - 2, top + 6, 6, 1, '#2a1a6a')
  if (Math.floor(t * 1.5) % 2) {
    rect(g, tx, top - 1, 2, 2, PINK)
    g.drawImage(glow(6, PINK, 1.3, 0.6), tx - 5, top - 6)
  }
}

/** The ribbon it leaves: white at its head, cyan, then violet, fading; the closed ring stays lit. */
function drawTrail(g: G, s: X, t: number) {
  const tr = s.trail
  if (tr.length < 2) return
  const ring = t > T_RING
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1]!
    const b = tr[i]!
    const age = t - b.t
    // On the drift's circle the light stays; the run in fades away behind it.
    const inRing = b.t >= T_DRIFT && b.t < T_RING
    if (!inRing && age > 0.7) continue
    if (b.t >= T_RING && t > REVEAL) continue
    const col =
      age < 0.06
        ? '#ffffff'
        : age < 0.3 || (ring && inRing && Math.floor(t * 10 + i * 0.02) % 3)
          ? CYAN
          : age < 0.55 || inRing
            ? '#b08aff'
            : '#4a3a9a'
    // A ribbon: a wide pink band, a bright core along it.
    line(g, a.x, a.y, b.x, b.y, age < 0.5 || inRing ? PINK : '#5a1a6a', 3)
    line(g, a.x, a.y, b.x, b.y, col)
  }
}
