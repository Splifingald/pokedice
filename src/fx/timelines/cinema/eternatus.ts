// Eternatus's raid entrance (docs/53): the Darkest Day over Hammerlocke. Night, stars, the old city's walls and
// windows, the Energy Plant's tower rising over them with its lamps blinking and steam from its stacks. The sky turns
// red from the top down and the city's lights fail; red clouds roll in. Then the Dynamax energy erupts: pillars of red
// light burst out of the ground across Galar one after another, each with a thud, and the clouds begin to wheel over
// the tower. Every pillar bends its light into the tower's top, where a crimson core gathers, red lightning playing
// between it and the vortex; the core fires a beam into the sky and Eternatus uncoils down it. The reveal: it hovers
// over the tower, the pillars still burning across the red sky.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  pattern,
  polyline,
  rect,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { dGradient, dissolve, tri } from './kit'
import { fogBand, raidCinema, scroll, type Raid } from './gen8kit'

const REVEAL = 4.8
const T_RED = 1.15
/** The pillars: when each bursts out of the ground, and where (a share of the width), nearest last. */
const PILLARS: readonly [number, number, number][] = [
  [2.0, 0.14, 2],
  [2.25, 0.84, 2],
  [2.48, 0.33, 3],
  [2.68, 0.68, 3],
  [2.86, 0.04, 5],
  [3.02, 0.96, 5],
]
const T_SPIN = 2.5
const T_DRAW = 3.35
const T_BEAM = 4.2
const T_DOWN = 4.32

const AURA = ['#ffffff', '#ffb0d0', '#e0306a', '#5a0a3a'] as const
const DYNA = ['#ffffff', '#ffc0d8', '#ff5a8a', '#d01848', '#7a0a2a'] as const

type X = {
  night: Canvas
  red: Canvas
  city: Canvas
  dark: Canvas
  tower: Canvas
  clouds: Canvas
  bolts: [number, number][][]
  /** The horizon (the city's walls stand on it, the pillars rise from it), the tower's platform, the vortex. */
  horizon: number
  deck: number
  vortex: number
  core: number
}

/** The sky with stars, and the Darkest Day's. */
function skies(w: number, h: number, r: Rng): [Canvas, Canvas] {
  const night = dGradient(w, h, ['#02030a', '#060a1a', '#0c1428', '#16203a', '#1e2a44'])
  for (let i = 0; i < Math.round((w * h) / 500); i++)
    rect(night.g, r.range(0, w), r.range(0, h * 0.6), 1, 1, r() < 0.2 ? '#ffffff' : '#7a88b8')
  const red = dGradient(w, h, ['#0e0206', '#2a050e', '#560a1a', '#8a1420', '#b82a24', '#d8502a'])
  return [night, red]
}

/** Hammerlocke: its walls and round towers, the roofs inside them; windows lit, or dark once the power fails. */
function city(w: number, h: number, horizon: number, r: Rng): [Canvas, Canvas] {
  const lit = canvas(w, h)
  const g = lit.g
  const wins: [number, number][] = []
  // Roofs behind the wall, stepped.
  for (let x = -4; x < w; x += r.int(8, 15)) {
    const bh = r.int(8, 22)
    const bw = r.int(8, 14)
    rect(g, x, horizon - bh, bw, bh + 4, '#0c0a14')
    tri(g, x - 1, horizon - bh, x + bw + 1, horizon - bh, x + bw / 2, horizon - bh - r.int(3, 7), '#0c0a14')
    for (let k = 0; k < 3; k++) if (r() < 0.6) wins.push([x + 2 + r.int(0, bw - 4), horizon - bh + 3 + k * 5])
  }
  // The great wall, crenellated, and its round towers.
  const wallTop = horizon + Math.round((h - horizon) * 0.2)
  rect(g, 0, wallTop, w, h - wallTop, '#07060c')
  for (let x = 0; x < w; x += 6) rect(g, x, wallTop - 3, 3, 3, '#07060c')
  rect(g, 0, wallTop + 2, w, 1, '#141020')
  for (let x = (w % 46) / 2; x < w; x += 46) {
    const tw = 14
    rect(g, x - tw / 2, wallTop - 14, tw, h, '#09080f')
    for (let k = -tw / 2; k < tw / 2; k += 4) rect(g, x + k, wallTop - 17, 2, 3, '#09080f')
    rect(g, x - tw / 2, wallTop - 14, 1, h, '#1a1428')
    wins.push([x - 1, wallTop - 8])
  }
  // Stones in the wall, faint.
  for (let y = wallTop + 6; y < h; y += 6)
    for (let x = (y % 12) / 2; x < w; x += 12) rect(g, x, y, 5, 1, '#0d0b16')
  const dark = canvas(w, h)
  dark.g.drawImage(lit, 0, 0)
  for (const [x, y] of wins) {
    rect(g, x, y, 2, 2, '#ffcf6a')
    rect(g, x, y + 1, 2, 1, '#c88a3a')
    rect(dark.g, x, y, 2, 2, '#1a1420')
  }
  return [lit, dark]
}

/** The Energy Plant's tower: a banded column, struts flaring to a wide round deck, stacks either side. */
function tower(w: number, h: number, L: { horizon: number; deck: number; m: number }): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const cx = Math.round(w / 2)
  const bw = Math.max(10, Math.round(L.m * 0.13))
  const dw = Math.round(Math.max(40, L.m * 0.42))
  // The stacks: shorter columns either side.
  for (const side of [-1, 1]) {
    const x = cx + side * Math.round(dw * 0.75)
    const top = L.deck + Math.round((L.horizon - L.deck) * 0.35)
    rect(g, x - 4, top, 8, h - top, '#0a0812')
    rect(g, x - 4, top, 1, h - top, '#2a1e3a')
    rect(g, x - 5, top, 10, 2, '#1a1428')
  }
  // The column, its bands and slit windows.
  rect(g, cx - bw / 2, L.deck, bw, h - L.deck, '#0c0a16')
  rect(g, cx - bw / 2, L.deck, 2, h - L.deck, '#2a2440')
  rect(g, cx + bw / 2 - 1, L.deck, 1, h - L.deck, '#05040a')
  for (let y = L.deck + 8; y < h; y += 9) rect(g, cx - bw / 2, y, bw, 1, '#1c1830')
  // Struts from the column up to the deck's rim.
  for (const side of [-1, 1]) {
    tri(g, cx, L.deck + 22, cx + side * (dw / 2), L.deck + 3, cx + side * (bw / 2), L.deck + 3, '#0e0c18')
    tri(
      g,
      cx + side * (bw / 2),
      L.deck + 26,
      cx + side * (dw / 2) * 0.9,
      L.deck + 4,
      cx,
      L.deck + 24,
      '#08070e',
    )
  }
  // The deck: a flat disc seen a little from below, its rim lit.
  ellipse(g, cx, L.deck + 2, dw / 2, 4, '#141022')
  ellipse(g, cx, L.deck, dw / 2, 3, '#2a2240')
  rect(g, cx - dw / 2, L.deck, dw, 1, '#4a3a68')
  return cv
}

export const eternatusCinema = raidCinema<X>({
  id: 'cinema-eternatus',
  reveal: REVEAL,
  seed: 890,
  aura: AURA,
  flash: '#ffe0ea',
  feet: 0.6,
  rays: 0.65,
  bob: 2,
  shakes: [
    ...PILLARS.map(([at], i) => [at, 0.25, 1 + (i >> 1)] as const),
    [T_BEAM, 0.6, 4],
    [REVEAL, 0.6, 3],
  ],
  flashes: [
    [T_RED, 0.25, '#ff4a4a', 0.35],
    [T_BEAM, 0.25, '#ffd0e0', 0.7],
  ],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.8)
    const deck = s.feet + 4
    const vortex = Math.round(s.h * 0.2)
    const [night, red] = skies(s.w, s.h, r)
    const [lit, dark] = city(s.w, s.h, horizon, r)
    const core = deck - Math.round(Math.max(28, s.sz.h * 0.55))
    return {
      night,
      red,
      city: lit,
      dark,
      tower: tower(s.w, s.h, { horizon, deck, m: s.m }),
      clouds: fogBand(s.w, Math.round(s.h * 0.34), 890, '#7a1428', '#4a0a1a', 0.7, 70),
      bolts: Array.from({ length: 4 }, (_, i) =>
        bolt(r, s.cx + (i - 1.5) * 10, vortex + 6, s.cx + r.range(-4, 4), core, 0.3, 4),
      ),
      horizon,
      deck,
      vortex,
      core,
    }
  },
  step(s, t, dt) {
    const r = s.r
    // Steam from the stacks while the plant still runs.
    if (t < T_RED && r() < 0.3 * s.many)
      for (const side of [-1, 1])
        s.fx.add({
          x: s.cx + side * Math.round(Math.max(40, s.m * 0.42) * 0.75),
          y: s.deck + Math.round((s.horizon - s.deck) * 0.35),
          vx: r.range(4, 10),
          vy: -r.range(8, 16),
          life: 1.1,
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#3a3448', '#2a2436'],
        })
    // Each pillar's burst at its foot, then its energy streaming up.
    for (const [at, fx, wd] of PILLARS) {
      const x = Math.round(fx * s.w)
      if (t >= at && t - dt < at)
        for (let i = 0; i < 24 * s.many; i++) {
          const a = -Math.PI / 2 + r.range(-1.3, 1.3)
          const v = r.range(30, 110)
          s.fx.add({
            x,
            y: s.horizon,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2,
            life: r.range(0.4, 0.8),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: [...DYNA],
          })
        }
      if (t > at && t < T_DRAW && r() < 0.25 * s.many)
        s.fx.add({
          x: x + r.range(-wd, wd),
          y: r.range(s.vortex, s.horizon),
          vy: -r.range(60, 120),
          life: 0.5,
          size: 1,
          shape: 'streak',
          trail: 0.05,
          colors: [DYNA[1], DYNA[2], DYNA[3]],
        })
      // Its light drawn off into the tower's core.
      if (t > T_DRAW + (x / s.w) * 0.2 && t < T_BEAM && r() < 0.7 * s.many)
        s.fx.add({
          x: x + r.range(-wd, wd),
          y: r.range(s.vortex + 10, s.horizon - 10),
          vx: (s.cx - x) * 0.4,
          vy: r.range(-20, 20),
          home: { x: s.cx, y: s.core, k: 420 },
          life: 1.2,
          size: 1,
          shape: 'streak',
          trail: 0.04,
          colors: [DYNA[0], DYNA[1], DYNA[2]],
        })
    }
    // Eternatus uncoiling down the beam sheds red sparks.
    if (t > T_DOWN && t < REVEAL && r() < 0.8 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.4, s.sz.w * 0.4),
        y: lerp(s.vortex, s.feet - s.sz.h * 0.5, span(t, T_DOWN, REVEAL)) + r.range(-10, 10),
        vx: r.range(-40, 40),
        vy: r.range(-20, 20),
        drag: 2,
        life: 0.6,
        size: 1,
        shape: 'star',
        colors: [...DYNA],
      })
    // Afterwards: embers of Dynamax energy drifting up the red sky.
    if (t > REVEAL && r() < 0.5 * s.many)
      s.fx.add({
        x: r.range(0, s.w),
        y: s.horizon,
        vy: -r.range(20, 40),
        vx: r.range(-4, 4),
        life: 2.5,
        size: 1,
        shape: 'px',
        colors: [DYNA[1], DYNA[2], DYNA[3], DYNA[4]],
      })
  },
  back(g, s, t) {
    // The sky turning red from the top down.
    g.drawImage(s.night, 0, 0)
    const red = span(t, T_RED, T_RED + 0.8)
    if (red > 0) {
      const edge = Math.round(lerp(-s.h * 0.1, s.h * 1.1, red))
      g.save()
      g.beginPath()
      g.rect(0, 0, s.w, Math.max(0, edge))
      g.clip()
      g.drawImage(s.red, 0, 0)
      g.restore()
      // Its ragged front: a dithered band.
      if (red < 1) {
        rect(g, 0, edge, s.w, 3, pattern(g, '#8a1420', 8))
        rect(g, 0, edge + 3, s.w, 3, pattern(g, '#8a1420', 3))
      }
    }
    // The clouds rolling in, then wheeling round the vortex over the tower.
    if (red > 0) scroll(g, s.clouds, t * 10, -Math.round(s.h * 0.04), Math.min(1, red * 1.4))
    drawVortex(g, s, t)
    // The pillars, behind the city.
    for (const [at, fx, wd] of PILLARS) drawPillar(g, s, t, at, Math.round(fx * s.w), wd)
    // The tower and the city before it; the lights fail as the sky turns.
    g.drawImage(s.tower, 0, 0)
    drawLamps(g, s, t)
    g.drawImage(s.dark, 0, 0)
    const power = 1 - span(t, T_RED + 0.2, T_RED + 0.9)
    if (power > 0) dissolve(g, s.city, Math.floor(t * 20) % 3 === 0 && t > T_RED ? power * 0.5 : power)
    // The core gathering over the deck, lightning to the vortex, then its beam.
    drawCore(g, s, t)
  },
  before(g, s, t) {
    if (t < T_DOWN) return
    const q = ease.outC(span(t, T_DOWN, REVEAL - 0.05))
    const y = Math.round(lerp(s.vortex + s.sz.h * 0.4, s.feet, q))
    const k = lerp(0.55, 1, q)
    drawSprite(g, s.mon, s.cx, y, {
      sx: k,
      sy: k,
      sil: '#1a0410',
      outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[2],
      wave: { amp: Math.round(3 * (1 - q)), len: 9, phase: t * 30 },
    })
  },
  sounds: [
    [0.05, () => tone(55, 1.4, { type: 'sawtooth', vol: 0.025 })],
    [0.1, () => hiss(1.2, { freq: 300, type: 'lowpass', vol: 0.04 })],
    [T_RED, () => (tone(110, 1.2, { type: 'sawtooth', vol: 0.04, slide: -55 }), fxSound('nightmare.fall'))],
    [T_RED + 0.3, () => tone(880, 0.4, { type: 'square', vol: 0.015, slide: -600 })],
    ...PILLARS.map(
      ([at], i) =>
        [
          at,
          () => (
            tone(70 - i * 4, 0.5, { type: 'sine', vol: 0.12, slide: -20 }),
            hiss(0.5, { freq: 600 + i * 120, slide: 1400, vol: 0.05 })
          ),
        ] as const,
    ),
    [T_SPIN, () => hiss(2, { freq: 200, slide: 500, vol: 0.06 })],
    [T_DRAW, () => fxSound('gmax.grow')],
    [T_BEAM, () => (fxSound('gmax.reveal'), hiss(0.6, { freq: 2000, slide: -1500, vol: 0.08 }))],
    [T_DOWN + 0.1, () => tone(196, 0.6, { type: 'square', vol: 0.03, slide: -90 })],
  ],
})

/** The vortex of red cloud over the tower: spiral arms turning faster and faster. */
function drawVortex(g: G, s: Raid & X, t: number) {
  const k = span(t, T_SPIN - 0.3, T_SPIN + 0.6)
  if (k <= 0) return
  const R = Math.min(s.w * 0.55, s.h * 0.24)
  const spin = (t - T_SPIN) * (1.2 + 2.2 * span(t, T_SPIN, T_BEAM))
  g.drawImage(
    glow(Math.round(R * 0.5), '#ff5a5a', 1.4, 0.5 * k),
    s.cx - Math.round(R * 0.5),
    s.vortex - Math.round(R * 0.5),
  )
  for (let arm = 0; arm < 4; arm++)
    for (let i = 0; i < 16; i++) {
      const q = i / 16
      const a = arm * (Math.PI / 2) + q * 3.2 + spin
      const rr = R * (0.12 + q * 0.9) * k
      const x = s.cx + Math.cos(a) * rr
      const y = s.vortex + Math.sin(a) * rr * 0.42
      const sz = Math.round(3 + q * 7)
      ellipse(g, x, y + 1, sz, Math.max(1, Math.round(sz * 0.45)), '#3a0612')
      ellipse(
        g,
        x,
        y,
        sz - 1,
        Math.max(1, Math.round(sz * 0.4)),
        q < 0.3 ? '#ff7a5a' : i % 2 ? '#a81a2a' : '#7a1020',
      )
    }
  ellipse(g, s.cx, s.vortex, 4, 2, '#ffd0b0')
}

/** One Dynamax pillar: bursting up out of the ground, then burning, its edges flickering. */
function drawPillar(g: G, s: Raid & X, t: number, at: number, x: number, w0: number) {
  const q = ease.outC(span(t, at, at + 0.22))
  if (q <= 0) return
  // Far ones thin, near ones broad; narrower still on a phone, so the sky stays a sky.
  const wd = Math.max(1, Math.round(w0 * Math.min(1.3, s.w / 240)))
  const top = Math.round(lerp(s.horizon, -4, q))
  const pulse = Math.round(Math.sin(t * 24 + x) * 1)
  const hw = Math.max(1, Math.round(wd * (t < at + 0.3 ? 1.6 : 1)) + pulse)
  const base = s.horizon + 2
  const far = w0 <= 2
  // A glow at its foot, its light.
  const gr = wd * 5 + 4
  g.drawImage(glow(gr, DYNA[3], 1.3, far ? 0.4 : 0.6), x - gr, base - gr)
  rect(g, x - hw - 1, top, hw * 2 + 2, base - top, pattern(g, DYNA[3], far ? 4 : 7))
  rect(g, x - hw, top, hw * 2, base - top, far ? DYNA[3] : DYNA[2])
  if (hw > 1) rect(g, x - (hw >> 1), top, Math.max(1, hw), base - top, far ? DYNA[2] : DYNA[1])
  rect(g, x, top, 1, base - top, far ? DYNA[1] : '#ffffff')
  // Rings climbing it.
  for (let k = 0; k < 3; k++) {
    const y = base - (((t - at) * 120 + k * 50) % Math.max(1, base - top))
    ellipseLine(g, x, Math.round(y), hw + 3, 2, DYNA[1])
  }
}

/** The tower's lamps: blinking white, then red, then dark. */
function drawLamps(g: G, s: Raid & X, t: number) {
  const dw = Math.round(Math.max(40, s.m * 0.42))
  const red = t > T_RED
  for (let i = 0; i < 9; i++) {
    const x = Math.round(s.cx - dw / 2 + 3 + (i * (dw - 6)) / 8)
    const on = Math.floor(t * 4 + i * 0.5) % 3 !== 0
    if (on || t > T_DRAW) rect(g, x, s.deck + 2, 2, 1, t > T_DRAW ? DYNA[1] : red ? '#ff3a3a' : '#e8f0ff')
  }
}

/** The crimson core: gathering over the deck, lightning to the vortex, then its beam into the sky. */
function drawCore(g: G, s: Raid & X, t: number) {
  const k = span(t, T_DRAW, T_BEAM)
  if (k <= 0) return
  const after = span(t, T_BEAM, REVEAL)
  const R = Math.round(lerp(2, Math.max(8, s.m * 0.07), ease.outC(k)) * (1 - after * 0.8))
  const gr = R * 4
  if (after < 1) g.drawImage(glow(gr, DYNA[3], 1.3, 0.7), s.cx - gr, s.core - gr)
  if (R > 1) {
    ellipse(g, s.cx, s.core, R, R, DYNA[3])
    ellipse(g, s.cx - 1, s.core - 1, Math.max(1, R - 2), Math.max(1, R - 2), DYNA[2])
    ellipse(g, s.cx - 1, s.core - 1, Math.max(1, R >> 1), Math.max(1, R >> 1), DYNA[1])
    rect(g, s.cx - 2, s.core - 2, 2, 2, '#ffffff')
    // Two rings turning round it, like the plates round its chest.
    const a = t * 6
    ellipseLine(g, s.cx, s.core, R + 4, Math.round((R + 4) * Math.abs(Math.sin(a))), DYNA[1])
    ellipseLine(g, s.cx, s.core, Math.round((R + 6) * Math.abs(Math.cos(a * 0.7))), R + 6, AURA[2])
  }
  // Red lightning between the core and the vortex, in flickers.
  if (k > 0.4 && t < T_BEAM) {
    const b = s.bolts[Math.floor(t * 15) % s.bolts.length]!
    if (Math.floor(t * 30) % 3) {
      polyline(g, b, DYNA[2], 2)
      polyline(g, b, '#ffffff')
    }
  }
  // The beam: the core firing straight up into the vortex, widening, then thinning away as it comes down it.
  const bq = span(t, T_BEAM, T_BEAM + 0.1) * (1 - span(t, T_DOWN + 0.2, REVEAL + 0.2))
  if (bq > 0) {
    const hw = Math.round(Math.max(6, s.m * 0.07) * bq)
    rect(g, s.cx - hw - 3, s.vortex, hw * 2 + 6, s.core - s.vortex, pattern(g, DYNA[2], 8))
    rect(g, s.cx - hw, s.vortex, hw * 2, s.core - s.vortex, DYNA[1])
    rect(g, s.cx - Math.max(1, hw >> 1), s.vortex, Math.max(2, hw), s.core - s.vortex, '#ffffff')
  }
}
