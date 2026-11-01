// Darkrai's entrance (docs/53), on the battle stage: Newmoon Island under a new moon. No moon to light it: a sky thick
// with stars round a black disc where none shine, gnarled trees about a clearing, cold grass. The stars go out, nearest
// the dead moon first; the trees' shadows creep over the ground towards the clearing like fingers; twice the night
// turns red for a heartbeat and eyes open in the woods. Then Dark Void: a black sphere swells out of the clearing, its
// rim crackling, the smoke of the woods sucked into it, until it has swallowed everything. In the black a great eye
// opens, cyan, and looks; it narrows; Darkrai's outline burns red where it was, and the dark shatters like glass.
// (The nightmare's own scenes, nightmare.ts, are a full moon and blue-violet smoke rising: this is their opposite.)
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  rect,
  rng,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, screenFlash, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(v * 8) / 8

const REVEAL = 4.15
const GROUND = 90
const MOON = { x: 173, y: 30, R: 21 }
const T_EAT = 0.9
const T_CREEP = 1.3
/** The night turning red for an instant: never closer than 0.34 s (no flash faster than 3 a second). */
const NIGHTMARES = [1.7, 2.2] as const
const T_VOID = 2.5
const T_ALL = 3.35
const T_EYE = 3.45
const T_SHUT = 3.85
/** Where the void opens: the clearing, at Darkrai's middle. */
const VOID = { x: 173, y: 62 }
const CYAN = ['#e0ffff', '#8af0f0', '#3ad0d8', '#127a80'] as const
const RED = '#e0203a'
const VIOLET = '#8a4ad0'

type Star = { x: number; y: number; out: number; c: string }
type Piece = { pts: [number, number][]; cx: number; cy: number; d: number; a: number; spin: number }
type X = { grove: Canvas; buf: Canvas; stars: Star[]; pieces: Piece[]; eyes: [number, number][] }

/** A gnarled tree: a leaning trunk, crooked limbs, a dark crown of leaves rimmed with starlight. */
function tree(g: G, r: Rng, x: number, h: number, lean: number) {
  const top = GROUND - h
  const tx = x + lean
  tri(g, x - 5, GROUND + 2, x + 5, GROUND + 2, tx, top, '#040908')
  tri(g, x - 2, GROUND + 2, x + 6, GROUND + 2, tx + 1, top + 4, '#071210')
  rect(g, x - 7, GROUND, 4, 3, '#040908')
  rect(g, x + 4, GROUND - 1, 5, 3, '#040908')
  // Limbs, crooked: two joints each, thinning.
  for (let k = 0; k < 4; k++) {
    const y0 = top + 6 + k * (h / 6)
    const side = k % 2 ? 1 : -1
    let px = lerp(x, tx, (GROUND - y0) / h)
    let py = y0
    for (let j = 0; j < 3; j++) {
      const nx = px + side * r.range(6, 12)
      const ny = py - r.range(-2, 7)
      line(g, px, py, nx, ny, '#040908', j ? 1 : 2)
      px = nx
      py = ny
    }
    rect(g, px, py - 1, 1, 1, '#16302c')
  }
  for (let k = 0; k < 7; k++) {
    const cx = tx + r.range(-16, 16)
    const cy = top + r.range(-8, 14)
    const rx = Math.round(r.range(8, 14))
    ellipse(g, cx, cy, rx, Math.round(rx * 0.6), '#030706')
    for (let i = -rx + 2; i < rx - 2; i++)
      if (r() < 0.6)
        rect(g, cx + i, cy - Math.round(rx * 0.6 * Math.sqrt(1 - (i / rx) ** 2)), 1, 1, '#1e3e36')
  }
}

/** The grove under a starless patch of sky: woods both sides, the clearing, grass. Stars and moon are live. */
function grove(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#010203', '#03080a', '#071414', '#0e2624', '#16382f']), 0, 0)
  // Far woods on the island's hump, black.
  for (let x = 0; x < W; x++) {
    const y = Math.round(GROUND - 12 - Math.sin(x / 31) * 4 - ((x * 7) % 5))
    rect(g, x, y, 1, GROUND - y, '#030807')
    if (y < GROUND - 14 && x % 3 === 0) rect(g, x, y, 1, 1, '#14302a')
  }
  g.drawImage(dGradient(W, H - GROUND, ['#0a1c18', '#06120f', '#030807']), 0, GROUND)
  for (let i = 0; i < 260; i++) {
    const x = r.range(0, W)
    const y = GROUND + 2 + r.range(0, H - GROUND) ** 1.1
    rect(g, x, y - 2, 1, 2, r() < 0.3 ? '#16302a' : '#0e221e')
  }
  for (const [x, h, lean] of [
    [10, 84, 6],
    [44, 70, -4],
    [78, 58, 3],
    [108, 46, -2],
    [232, 80, -6],
  ] as const)
    tree(g, r, x, h, lean)
  return cv
}

/** The new moon: a black disc where the stars stop, the faintest ash light round its rim. */
function moon(g: G, R: number) {
  ellipse(g, MOON.x, MOON.y, R + 1, R + 1, '#0a1414')
  ellipse(g, MOON.x, MOON.y, R, R, '#000000')
  ellipseLine(g, MOON.x, MOON.y, R + 1, R + 1, '#1e3030', Math.PI * 0.9, Math.PI * 1.6)
  ellipseLine(g, MOON.x - 1, MOON.y, R, R, '#2a4040', Math.PI * 1.05, Math.PI * 1.4)
}

/** The black pieces the screen breaks into: a jittered grid of triangles, each flying out from the clearing. */
function pieces(r: Rng): Piece[] {
  const nx = 10
  const ny = 7
  const P: [number, number][][] = []
  for (let i = 0; i <= nx; i++) {
    P[i] = []
    for (let j = 0; j <= ny; j++) {
      const ex = i === 0 || i === nx
      const ey = j === 0 || j === ny
      P[i]![j] = [(i / nx) * W + (ex ? 0 : r.range(-8, 8)), (j / ny) * H + (ey ? 0 : r.range(-7, 7))]
    }
  }
  const out: Piece[] = []
  const add = (pts: [number, number][]) => {
    const cx = (pts[0]![0] + pts[1]![0] + pts[2]![0]) / 3
    const cy = (pts[0]![1] + pts[1]![1] + pts[2]![1]) / 3
    out.push({
      pts: pts.map(([x, y]) => [x - cx, y - cy] as [number, number]),
      cx,
      cy,
      d: Math.hypot(cx - VOID.x, cy - VOID.y),
      a: Math.atan2(cy - VOID.y, cx - VOID.x),
      spin: r.range(-6, 6),
    })
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const a = P[i]![j]!
      const b = P[i + 1]![j]!
      const c = P[i + 1]![j + 1]!
      const d = P[i]![j + 1]!
      add([a, b, c])
      add([a, c, d])
    }
  return out
}

export const darkraiCinema = bossCinema<X>({
  id: 'cinema-darkrai',
  reveal: REVEAL,
  seed: 491,
  aura: ['#ffffff', CYAN[1], RED, '#1a0a1a'],
  flash: '#c8fff8',
  setup(_st, r) {
    const stars: Star[] = []
    const far = Math.hypot(W, GROUND)
    for (let i = 0; i < 110; i++) {
      const x = r.range(0, W)
      const y = r.range(0, GROUND - 8) ** 1.05
      const d = Math.hypot(x - MOON.x, y - MOON.y)
      if (d < MOON.R + 3) continue
      // Eaten from the dead moon outward, a little out of order.
      stars.push({
        x,
        y,
        out: T_EAT + (d / far) * 1.5 + r.range(-0.12, 0.12),
        c: r() < 0.15 ? '#ffffff' : r() < 0.5 ? '#a8c8c8' : '#5a7a7a',
      })
    }
    const eyes: [number, number][] = [
      [20, 60],
      [52, 48],
      [84, 70],
      [116, 64],
      [226, 56],
      [36, 80],
    ]
    return { grove: grove(rng(4911)), buf: canvas(W, H), stars, pieces: pieces(rng(4912)), eyes }
  },
  step(s, t) {
    const r = s.r
    // Swallowed: what was sucked in is gone with the rest.
    if (within(t, T_ALL, T_ALL + 1 / 60)) s.fx.clear()
    // The woods' smoke drawn into the void, spiralling.
    if (t > T_VOID && t < T_ALL - 0.15)
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2
        const d = r.range(90, 150)
        s.fx.add({
          x: VOID.x + Math.cos(a) * d,
          y: VOID.y + Math.sin(a) * d * 0.7,
          vx: Math.cos(a + 1.9) * 70,
          vy: Math.sin(a + 1.9) * 50,
          home: { x: VOID.x, y: VOID.y, k: 260 },
          life: 1.1,
          size: r.int(4, 6),
          size1: 1,
          shape: 'smoke',
          colors: ['#000000', '#030206'],
          light: '#120a1a',
        })
      }
    // Red sparks off its collar as the eye shuts.
    if (t > T_SHUT && t < REVEAL && r() < 0.8)
      s.fx.add({
        x: VOID.x + r.range(-20, 20),
        y: VOID.y + r.range(-24, 30),
        vx: r.range(-10, 10),
        vy: -r.range(10, 40),
        life: 0.5,
        size: 1,
        shape: r() < 0.5 ? 'plus' : 'px',
        colors: ['#ff8a9a', RED, '#5a0a14'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const swallowed = t >= T_ALL && t < REVEAL
    if (!swallowed) {
      b.drawImage(s.grove, 0, 0)
      // The stars: twinkling, then flickering out one by one.
      for (const st of s.stars) {
        if (t > st.out + 0.15 && t < REVEAL) continue
        const dying = t > st.out && t < REVEAL
        if (dying && Math.floor(t * 30 + st.x) % 2) continue
        const tw = Math.floor(t * 3 + st.x * 0.7) % 9 === 0
        rect(b, st.x, st.y, 1, 1, tw ? '#ffffff' : st.c)
        if (st.c === '#ffffff' && !dying) {
          rect(b, st.x - 1, st.y, 3, 1, '#5a7a7a')
          rect(b, st.x, st.y - 1, 1, 3, '#5a7a7a')
          rect(b, st.x, st.y, 1, 1, '#ffffff')
        }
      }
      moon(b, Math.round(MOON.R + 5 * ease.ioS(span(t, T_EAT, T_VOID)) * (t < REVEAL ? 1 : 0)))
      // The trees' shadows creeping over the ground to the clearing: black tendrils, thick at the root, writhing.
      const cq = ease.inQ(span(t, T_CREEP, T_VOID + 0.4)) * (t < REVEAL ? 1 : 0)
      if (cq > 0)
        for (const [x0, y0, ph] of [
          [10, 92, 0],
          [44, 92, 1],
          [108, 92, 3],
          [232, 92, 4],
          [-6, 128, 5],
          [60, 166, 2],
          [246, 150, 6],
        ] as const)
          tendril(b, x0, y0, VOID.x + (x0 < VOID.x ? -8 : 8), 98, cq, t, ph)
      // Eyes opening in the woods for each red heartbeat.
      for (const at of NIGHTMARES) {
        const q = span(t, at, at + 0.45)
        if (q <= 0 || q >= 1) continue
        for (const [ex, ey] of s.eyes) {
          const open = q < 0.15 || q > 0.85 ? 0 : 1
          rect(b, ex, ey, 2, open, RED)
          rect(b, ex + 5, ey, 2, open, RED)
          if (open) rect(b, ex, ey - 1, 2, 1, '#5a0a14')
        }
      }
      // Dark Void: a black sphere swelling, its rim crackling violet and red.
      if (t > T_VOID && t < REVEAL) {
        const q = ease.inQ(span(t, T_VOID, T_ALL))
        const R = Math.round(3 + q * 190)
        ellipse(b, VOID.x, VOID.y, R, R, '#000000')
        rim(b, R, t)
      }
    } else b.fillStyle = '#000000'
    if (swallowed) {
      b.fillRect(0, 0, W, H)
      drawEye(b, t)
    }
    // The black shattering on the reveal, its pieces flying out from where it stands.
    if (t >= REVEAL && t < REVEAL + 0.9) shatter(b, s.pieces, t - REVEAL)
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Its outline burning in the black where the eye was, the eye shutting into it.
    if (t < T_SHUT - 0.05) return
    const q = span(t, T_SHUT - 0.05, REVEAL - 0.05)
    drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, {
      sil: '#000000',
      outline: q < 0.3 ? (Math.floor(t * 20) % 2 ? RED : '#000000') : Math.floor(t * 12) % 3 ? RED : CYAN[2],
    })
  },
  front(g, _s, t) {
    // The night turning red: stepped, and none in a calm OS (screenFlash).
    for (const at of NIGHTMARES) if (within(t, at, at + 0.1)) screenFlash(g, '#6a0010', 0.45)
  },
  sounds: [
    [0.05, () => tone(55, 3.2, { type: 'sine', vol: 0.06, slide: -10 })],
    [0.1, () => hiss(3.2, { freq: 600, type: 'lowpass', vol: 0.03 })],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_EAT + 0.1 + i * 0.22, () => tone(1760 - i * 140, 0.12, { type: 'sine', vol: 0.02 })] as const,
    ),
    [T_CREEP, () => fxSound('nightmare.fall')],
    ...NIGHTMARES.map(
      (at) =>
        [
          at,
          () => (fxSound('legend.heart'), tone(233, 0.3, { type: 'sawtooth', vol: 0.03, slide: -120 })),
        ] as const,
    ),
    [T_VOID, () => (fxSound('nightmare.charge'), hiss(0.9, { freq: 200, slide: 600, vol: 0.06 }))],
    [T_ALL, () => hiss(0.4, { freq: 120, type: 'lowpass', vol: 0.12 })],
    [T_EYE, () => fxSound('nightmare.breath')],
    [T_SHUT, () => (fxSound('legend.heart'), tone(98, 0.4, { type: 'sawtooth', vol: 0.035, slide: -40 }))],
    [REVEAL, () => (fxSound('legend.shatter'), hiss(0.6, { freq: 3000, slide: -2400, vol: 0.08 }))],
  ],
})

/** A shadow creeping from (x0, y0) to (x1, y1), `q` of the way: a writhing black line of discs, tapering. */
function tendril(g: G, x0: number, y0: number, x1: number, y1: number, q: number, t: number, ph: number) {
  const n = 44
  const len = Math.hypot(x1 - x0, y1 - y0)
  const nx = -(y1 - y0) / len
  const ny = (x1 - x0) / len
  for (let i = 0; i <= n * q; i++) {
    const u = i / n
    const k = u / Math.max(0.01, q)
    const wv = Math.sin(u * 9 - t * 6 + ph) * 5 * Math.sin(Math.PI * Math.min(1, k))
    const x = lerp(x0, x1, u) + nx * wv
    const y = lerp(y0, y1, u) + ny * wv * 0.4
    const r = Math.max(1, Math.round(7 * (1 - k * 0.85)))
    ellipse(g, x, y, r, Math.max(1, Math.round(r * 0.6)), '#000000')
  }
}

/** The void's rim: a jagged ring of violet and red, crackling (re-dealt every few frames). */
function rim(g: G, R: number, t: number) {
  const n = Math.max(24, Math.round(R * 3))
  const f = Math.floor(t * 20)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const j = ((i * 7919 + f * 104729) % 97) / 97
    const rr = R + Math.round(j * 3)
    const x = Math.round(VOID.x + Math.cos(a) * rr)
    const y = Math.round(VOID.y + Math.sin(a) * rr)
    rect(g, x, y, 2, 2, j > 0.85 ? RED : j > 0.45 ? VIOLET : '#3a1a5a')
    if (j > 0.92) line(g, x, y, x + Math.cos(a) * 5, y + Math.sin(a) * 5, '#c8a0ff')
  }
}

/** The eye in the black: it opens, its cyan iris looks one way and the other, then narrows and shuts. */
function drawEye(g: G, t: number) {
  const open = ease.outC(span(t, T_EYE, T_EYE + 0.18)) * (1 - ease.inQ(span(t, T_SHUT - 0.12, T_SHUT + 0.08)))
  if (open <= 0) return
  const cx = VOID.x
  const cy = VOID.y - 6
  const hw = 40
  const hh = Math.max(1, Math.round(14 * open))
  // A cold glow round it, then the almond, its lids lit, the iris, the slit, a glint.
  g.drawImage(glow(54, '#0a3a40', 1.6, q8(0.5 * open)), cx - 54, cy - 54)
  for (let dx = -hw; dx <= hw; dx++) {
    const u = dx / hw
    const half = Math.round(hh * (1 - u * u) ** 0.9)
    if (half <= 0) continue
    rect(g, cx + dx, cy - half, 1, half * 2 + 1, '#061416')
    rect(g, cx + dx, cy - half, 1, 1, '#8aa8a8')
    rect(g, cx + dx, cy + half, 1, 1, '#3a5050')
  }
  const look = Math.sin(span(t, T_EYE + 0.15, T_SHUT - 0.1) * Math.PI * 2) * 12
  const ix = Math.round(cx + look)
  const ir = 11
  // The iris clipped to the lids: rows of it, as wide as the almond lets them.
  for (let dy = -ir; dy <= ir; dy++) {
    const hwI = Math.round(Math.sqrt(ir * ir - dy * dy))
    const u = (ix - cx) / hw
    const lid = Math.round(hh * (1 - u * u) ** 0.9)
    if (Math.abs(dy) >= lid) continue
    rect(g, ix - hwI, cy + dy, hwI * 2 + 1, 1, CYAN[3])
    if (hwI > 2) rect(g, ix - hwI + 2, cy + dy, hwI * 2 - 3, 1, dy < -2 ? CYAN[1] : CYAN[2])
  }
  const pupil = Math.max(1, Math.round(hh * 0.8))
  rect(g, ix - 1, cy - pupil, 3, pupil * 2 + 1, '#000000')
  if (hh > 4) {
    rect(g, ix + 3, cy - 4, 2, 2, '#ffffff')
    rect(g, ix - 5, cy + 2, 1, 1, CYAN[0])
  }
}

/** The swallowed screen breaking into black pieces that tumble outward, nearest the clearing first. */
function shatter(g: G, list: readonly Piece[], e: number) {
  for (const p of list) {
    const go = Math.max(0, e - p.d * 0.0016)
    const dist = go * go * 1400 + go * 220
    const x = p.cx + Math.cos(p.a) * dist
    const y = p.cy + Math.sin(p.a) * dist + go * go * 120
    const sc = Math.max(0, 1 - go * 1.4)
    if (sc <= 0) continue
    const rot = go * p.spin
    const c = Math.cos(rot)
    const sn = Math.sin(rot)
    const v = p.pts.map(
      ([px, py]) => [x + (px * c - py * sn) * sc, y + (px * sn + py * c) * sc] as [number, number],
    )
    tri(g, v[0]![0], v[0]![1], v[1]![0], v[1]![1], v[2]![0], v[2]![1], '#000000')
    // Its broken edge catching the light.
    if (go > 0) line(g, v[0]![0], v[0]![1], v[1]![0], v[1]![1], '#2a1440')
    if (go > 0.05) rect(g, v[0]![0], v[0]![1], 1, 1, go < 0.2 ? CYAN[1] : VIOLET)
  }
}
