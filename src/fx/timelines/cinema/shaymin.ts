// Shaymin's entrance (docs/53), on the battle stage: the Flower Paradise at morning, a high meadow over the sea, but
// grey: a sour haze hangs on it, the sky yellowed, the field full of closed buds and one great Gracidea bud in the
// middle. Specks of green light rise from the buds and drift into the great one, the haze drawn in after them, until it
// glows. It pulses, and the bloom runs out from it in a widening ring: every bud it passes pops open pink, the grass
// greens, the haze is gone and the sky clears to blue behind it. Light gathers into the bud from all round; Seed Flare:
// it bursts open in a column of light, a ring racing over the field, a storm of petals, and Shaymin is in the flower.
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
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, pulse, tri } from './kit'

/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(v * 8) / 8

const REVEAL = 3.9
const HORIZON = 64
const T_GATHER = 0.9
const T_WAVE = 2.15
const WAVE_DUR = 0.95
/** How far the bloom reaches (on the field's plane, x-wide). */
const WAVE_R = 300
const T_DRAW = 3.15
const T_FLARE = 3.5
const PINK = { petal: '#ff7ab0', lit: '#ffc8e0', dark: '#c8487e', heart: '#fff4b0' }
const GREEN = ['#f0ffd8', '#c8ff90', '#7ac74c', '#2a6a2a'] as const

type Flower = { x: number; y: number; s: number; at: number; sway: number }
type X = {
  hazy: Canvas
  clear: Canvas
  dull: Canvas
  vivid: Canvas
  buf: Canvas
  flowers: Flower[]
}

/** The sky and the far sea, hazy (yellow-grey, sour) or clear (morning blue, clouds, the sun). */
function sky(clear: boolean): Canvas {
  const cv = canvas(W, HORIZON + 2)
  const g = cv.g
  g.drawImage(
    dGradient(
      W,
      HORIZON,
      clear
        ? ['#3a78d8', '#5a9ae8', '#8ac4f4', '#c8e8fa', '#f0faff']
        : ['#6a6a5e', '#7e7c68', '#9a9676', '#b4ae86', '#c4bc92'],
    ),
    0,
    0,
  )
  if (clear) {
    g.drawImage(glow(26, '#fffbe0', 1.5, 0.7), 40 - 26, 18 - 26)
    ellipse(g, 40, 18, 7, 7, '#ffffff')
    for (const [x, y, rw] of [
      [92, 16, 18],
      [128, 10, 12],
      [206, 22, 22],
      [20, 40, 14],
    ] as const) {
      ellipse(g, x, y, rw, 4, '#f4fbff')
      ellipse(g, x - rw * 0.4, y - 3, rw * 0.45, 4, '#ffffff')
      ellipse(g, x + rw * 0.3, y - 2, rw * 0.4, 3, '#ffffff')
      rect(g, x - rw + 3, y + 3, rw * 2 - 6, 1, '#c8e0f4')
    }
  }
  // The sea far below the meadow's edge, and the headland on the right.
  rect(g, 0, HORIZON - 6, W, 8, clear ? '#4a8ad0' : '#7a8078')
  for (let x = 0; x < W; x += 7)
    rect(g, x + ((x * 3) % 5), HORIZON - 4 + (x % 3), 3, 1, clear ? '#a8d8f8' : '#9a9a8a')
  for (let x = 190; x < W; x++) {
    const y = Math.round(HORIZON - 6 - Math.sin(((x - 190) / 50) * Math.PI * 0.5) * 9)
    rect(g, x, y, 1, HORIZON - y, clear ? '#4a7a5a' : '#6a6a5a')
  }
  return cv
}

/** The field in perspective: grass ticks thicker as it nears; dull or green. */
function field(r: Rng, vivid: boolean): Canvas {
  const cv = canvas(W, H - HORIZON)
  const g = cv.g
  const fh = H - HORIZON
  g.drawImage(
    dGradient(
      W,
      fh,
      vivid ? ['#a8d878', '#6ab048', '#3e8a30', '#286a22'] : ['#8a8c6a', '#626a48', '#465032', '#323a24'],
    ),
    0,
    0,
  )
  for (let i = 0; i < 700; i++) {
    const v = r() ** 0.8
    const y = Math.round(v ** 1.5 * fh)
    const x = r.range(0, W)
    const hgt = 1 + Math.round(v * 3)
    rect(
      g,
      x,
      y - hgt,
      1,
      hgt,
      vivid ? (r() < 0.5 ? '#8ad060' : '#2a7a2a') : r() < 0.5 ? '#7a7a5a' : '#3a4228',
    )
  }
  return cv
}

export const shayminCinema = bossCinema<X>({
  id: 'cinema-shaymin',
  reveal: REVEAL,
  seed: 492,
  aura: ['#ffffff', GREEN[1], GREEN[2], GREEN[3]],
  flash: '#f4ffe4',
  setup(st, r) {
    const C = st.L.foe
    const flowers: Flower[] = []
    for (let i = 0; i < 300; i++) {
      const v = r() ** 0.75
      const y = HORIZON + 3 + Math.round(v ** 1.5 * (H - HORIZON - 3))
      const x = r.range(-4, W + 4)
      // Not on the great bud's spot.
      if (Math.abs(x - C.x) < 24 && Math.abs(y - C.y) < 10) continue
      const d = Math.hypot(x - C.x, (y - C.y) / 0.35)
      flowers.push({
        x,
        y,
        s: 1 + Math.round(v * 3),
        // When the ring passes it (the ring's ease, undone).
        at: T_WAVE + WAVE_DUR * (1 - Math.sqrt(1 - Math.min(1, d / WAVE_R))),
        sway: r.range(0, 6),
      })
    }
    flowers.sort((a, b) => a.y - b.y)
    return {
      hazy: sky(false),
      clear: sky(true),
      dull: field(r, false),
      vivid: field(r, true),
      buf: canvas(W, H),
      flowers,
    }
  },
  step(s, t, dt) {
    const r = s.r
    const C = s.L.foe
    const bud = { x: C.x, y: C.y - 18 }
    // Specks of green light off the buds, and the haze, drawn into the great bud.
    if (t > T_GATHER && t < T_WAVE - 0.1) {
      if (r() < 0.8) {
        const f = s.flowers[Math.floor(r() * s.flowers.length)]!
        s.fx.add({
          x: f.x,
          y: f.y - f.s - 2,
          vy: -r.range(10, 30),
          home: { x: bud.x, y: bud.y, k: 160 },
          life: 1.6,
          size: 1,
          shape: r() < 0.3 ? 'plus' : 'px',
          colors: [GREEN[1], GREEN[0]],
        })
      }
      if (r() < 0.35)
        s.fx.add({
          x: r() < 0.5 ? -4 : W + 4,
          y: r.range(10, HORIZON + 20),
          home: { x: bud.x, y: bud.y, k: 120 },
          life: 1.8,
          size: r.int(3, 4),
          size1: 1,
          shape: 'smoke',
          colors: ['#a8a080', '#8a8468'],
          light: '#c8c0a0',
        })
    }
    // Each bud popping open throws a few petals.
    for (const f of s.flowers)
      if (f.s >= 2 && within(f.at, t - dt, t) && r() < 0.35)
        for (let i = 0; i < 2; i++)
          s.fx.add({
            x: f.x,
            y: f.y - f.s - 1,
            vx: r.range(-14, 14),
            vy: -r.range(14, 34),
            ay: 30,
            drag: 1,
            life: 1.1,
            size: 2,
            shape: 'leaf',
            spin: r.range(-6, 6),
            colors: [PINK.petal],
            light: PINK.lit,
            dark: PINK.dark,
          })
    // Seed Flare: the petal storm, spiralling up out of the bloom.
    if (within(t, T_FLARE, T_FLARE + dt))
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(40, 150)
        s.fx.add({
          x: bud.x + r.range(-6, 6),
          y: bud.y + 8,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.6 - r.range(30, 90),
          ay: 40,
          drag: 1.4,
          life: r.range(1.2, 2),
          size: 2,
          shape: 'leaf',
          spin: r.range(-8, 8),
          ...(i % 4
            ? { colors: [PINK.petal], light: PINK.lit, dark: PINK.dark }
            : { colors: [GREEN[2]], light: GREEN[1], dark: GREEN[3] }),
        })
      }
    // Petals carried on the breeze once the field is in bloom.
    if (t > T_WAVE + 0.4 && r() < 0.35)
      s.fx.add({
        x: -4,
        y: r.range(20, H - 10),
        vx: r.range(40, 70),
        vy: r.range(-10, 6),
        life: 5,
        size: 2,
        shape: 'leaf',
        spin: r.range(-5, 5),
        colors: [PINK.petal],
        light: PINK.lit,
        dark: PINK.dark,
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const C = s.L.foe
    // The sky clearing as the bloom passes; the field greening inside its ring, row by row.
    const wq = ease.outQ(span(t, T_WAVE, T_WAVE + WAVE_DUR))
    b.drawImage(s.hazy, 0, 0)
    dissolve(b, s.clear, ease.ioS(span(t, T_WAVE + 0.1, T_WAVE + WAVE_DUR + 0.2)))
    b.drawImage(s.dull, 0, HORIZON)
    const R = wq * WAVE_R
    if (R > 0)
      for (let y = HORIZON; y < H; y++) {
        const dy = (y - C.y) / 0.35
        if (Math.abs(dy) >= R) continue
        const hw = Math.round(Math.sqrt(R * R - dy * dy))
        b.drawImage(s.vivid, C.x - hw, y - HORIZON, hw * 2, 1, C.x - hw, y, hw * 2, 1)
      }
    // The flowers, far to near: buds nodding, then popping open as the ring reaches them.
    for (const f of s.flowers) drawFlower(b, f, t)
    // The ring itself: a line of light running out over the field, pink just inside it.
    if (wq > 0 && wq < 1) {
      ellipseLine(b, C.x, C.y, Math.round(R), Math.round(R * 0.35), '#fffbd0')
      if (R > 6) ellipseLine(b, C.x, C.y, Math.round(R - 4), Math.round((R - 4) * 0.35), PINK.lit)
    }
    // The haze over the field until the bloom clears it.
    const haze = 1 - span(t, T_WAVE, T_WAVE + WAVE_DUR)
    // Stepped, not dithered: a dither over the whole field would read as a screen door.
    if (haze > 0) wash(b, '#b8b090', haze * 0.4, 8)
    // Seed Flare's shock running over the field.
    const sq = span(t, T_FLARE, T_FLARE + 0.8)
    if (sq > 0 && sq < 1) {
      const rr = Math.round(ease.outC(sq) * 220)
      ellipseLine(b, C.x, C.y, rr, Math.round(rr * 0.3), '#ffffff')
      ellipseLine(b, C.x, C.y, rr - 2, Math.round((rr - 2) * 0.3), GREEN[1])
    }
    drawBud(b, C, t)
    drawFlare(b, C, t)
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // In the open flower, inside the light.
    if (t < T_FLARE + 0.12) return
    const q = ease.outBack(span(t, T_FLARE + 0.12, REVEAL - 0.04), 2)
    drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, { sx: q, sy: q, sil: '#ffffff', outline: GREEN[2] })
  },
  sounds: [
    [0.1, () => hiss(2, { freq: 500, type: 'lowpass', vol: 0.03 })],
    ...[0.3, 0.55, 1.2].map(
      (at, i) => [at, () => tone(2600 + i * 200, 0.08, { type: 'sine', vol: 0.02, slide: 600 })] as const,
    ),
    [T_GATHER, () => tone(392, 1.2, { type: 'sine', vol: 0.03, slide: 392 })],
    [T_WAVE - 0.05, () => (fxSound('legend.heart'), tone(523, 0.3, { type: 'triangle', vol: 0.04 }))],
    // The bloom: a run of plucks racing up as the buds pop.
    ...Array.from(
      { length: 12 },
      (_, i) =>
        [
          T_WAVE + i * 0.07,
          () =>
            tone(523 * 2 ** ([0, 2, 4, 7, 9, 12][i % 6]! / 12 + Math.floor(i / 6)), 0.12, {
              type: 'triangle',
              vol: 0.025,
            }),
        ] as const,
    ),
    [T_DRAW, () => fxSound('psychic.focus')],
    [
      T_FLARE,
      () => (
        hiss(0.9, { freq: 2200, vol: 0.08 }),
        [784, 988, 1175, 1568].forEach((f) => tone(f, 0.7, { type: 'triangle', vol: 0.025 }))
      ),
    ],
    [
      REVEAL,
      () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.02, at: i * 0.06 })),
    ],
  ],
})

/** Seed Flare's column of light out of the open flower: flared at its foot, rings climbing it, burning down. */
function drawFlare(g: G, C: { x: number; y: number }, t: number) {
  const q = span(t, T_FLARE, T_FLARE + 0.12) * (1 - span(t, REVEAL, REVEAL + 0.35))
  if (q <= 0) return
  const base = C.y - 6
  const w0 = (5 + 9 * q) * (1 + 0.12 * Math.sin(t * 40))
  for (let y = 0; y < base; y++) {
    // Narrow up high, swelling at the foot where it bursts out of the flower.
    const u = y / base
    const hw = Math.round(w0 * (0.6 + 0.4 * u * u) + (u > 0.85 ? (u - 0.85) * 40 * q : 0))
    rect(g, C.x - hw - 3, y, hw * 2 + 6, 1, pattern(g, GREEN[1], 6))
    rect(g, C.x - hw, y, hw * 2, 1, GREEN[0])
    rect(g, C.x - (hw >> 1), y, hw, 1, '#ffffff')
  }
  for (let i = 0; i < 4; i++) {
    const y = Math.round(base - (((t - T_FLARE) * 260 + i * (base / 4)) % base))
    ellipseLine(g, C.x, y, Math.round(w0 + 6), 2, i % 2 ? '#ffffff' : GREEN[1])
  }
  g.drawImage(
    glow(Math.round(18 + 10 * q), GREEN[0], 1.2, q8(0.8 * q)),
    C.x - Math.round(18 + 10 * q),
    base - Math.round(18 + 10 * q),
  )
}

/** A Gracidea in the field: a bud on its stem, nodding; once the ring has passed, open, pink round a yellow heart. */
function drawFlower(g: G, f: Flower, t: number) {
  const s = f.s
  const x = Math.round(f.x + Math.sin(t * 2 + f.sway) * (s > 2 ? 1 : 0))
  const y = Math.round(f.y)
  rect(g, x, y - s, 1, s, s > 2 ? '#2a6a22' : '#3a5a2a')
  const cy = y - s - 1
  if (t < f.at) {
    ellipse(g, x, cy, Math.max(1, Math.round(s / 2)), Math.max(1, Math.round(s * 0.7)), '#5a8a3a')
    rect(g, x, cy - Math.round(s * 0.7), 1, 1, '#b07a98')
    return
  }
  const k = ease.outBack(span(t, f.at, f.at + 0.16), 3)
  if (s <= 1) {
    rect(g, x - 1, cy, 3, 1, PINK.petal)
    rect(g, x, cy - 1, 1, 3, PINK.petal)
    rect(g, x, cy, 1, 1, PINK.heart)
    return
  }
  const r = Math.max(1, s * k)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    ellipse(
      g,
      x + Math.cos(a) * r * 0.75,
      cy + Math.sin(a) * r * 0.6,
      Math.max(1, Math.round(r * 0.5)),
      Math.max(1, Math.round(r * 0.4)),
      i % 2 ? PINK.petal : PINK.lit,
    )
  }
  rect(g, x - (s > 3 ? 1 : 0), cy - (s > 3 ? 1 : 0), s > 3 ? 2 : 1, s > 3 ? 2 : 1, PINK.heart)
}

/**
 * The great Gracidea bud on the foe's spot: furled, glowing as the light comes into it, trembling as it draws in the
 * last; then flung open, five big petals lying back round where Shaymin sits.
 */
function drawBud(g: G, C: { x: number; y: number }, t: number) {
  const open = ease.outBack(span(t, T_FLARE, T_FLARE + 0.3), 1.4)
  const gk = span(t, T_GATHER, T_WAVE) * (1 - span(t, T_WAVE, T_WAVE + 0.4)) + pulse(t, T_DRAW, T_FLARE + 0.2)
  const shake = t > T_DRAW && t < T_FLARE ? Math.round(Math.sin(t * 70) * span(t, T_DRAW, T_FLARE) * 1.5) : 0
  const x = C.x + shake
  const cy = C.y - 18
  if (gk > 0) {
    const gr = Math.round(14 + 10 * gk + Math.sin(t * 20) * 2)
    g.drawImage(glow(gr, GREEN[1], 1.3, q8(0.75 * Math.min(1, gk))), x - gr, cy - gr)
  }
  // Light drawn in from all round before it opens.
  const dq = span(t, T_DRAW, T_FLARE)
  if (dq > 0 && dq < 1)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + i
      const r0 = lerp(110, 8, ease.inQ((dq + (i % 3) * 0.12) % 1))
      line(
        g,
        x + Math.cos(a) * r0,
        cy + Math.sin(a) * r0 * 0.6,
        x + Math.cos(a) * (r0 + 12),
        cy + Math.sin(a) * (r0 + 12) * 0.6,
        GREEN[0],
      )
    }
  // Leaves at its foot.
  tri(g, x - 2, C.y, x - 16, C.y - 6, x - 6, C.y - 3, '#2a6a22')
  tri(g, x + 2, C.y, x + 16, C.y - 7, x + 6, C.y - 3, '#3a8a2a')
  if (open <= 0) {
    rect(g, x - 1, C.y - 9, 3, 9, '#2a6a22')
    ellipse(g, x, cy, 8, 12, '#3a7a2e')
    ellipse(g, x - 2, cy - 1, 5, 10, '#5a9a3a')
    // The pink of its petals showing at the furled tip.
    for (const dx of [-3, 0, 3]) rect(g, x + dx, cy - 11 + Math.abs(dx), 1, 6 - Math.abs(dx), PINK.petal)
    rect(g, x, cy - 12, 1, 1, PINK.lit)
    if (gk > 0.5) rect(g, x - 1, cy - 2, 3, 3, GREEN[0])
    return
  }
  // Open: five petals, the back ones first, lying back as they open.
  const L = lerp(10, 30, Math.min(1.2, open))
  const fy = C.y - 4
  const order = [0, 1, 4, 2, 3]
  for (const i of order) {
    const a = lerp(-Math.PI / 2 + (i - 2) * 0.18, (i / 5) * Math.PI * 2 - Math.PI / 2, Math.min(1, open))
    const flat = lerp(1, 0.4, Math.min(1, open))
    for (let u = 0; u <= 1; u += 0.08) {
      const rr = Math.max(1, Math.round(Math.sin(Math.PI * Math.min(0.95, u * 0.85 + 0.1)) * 8))
      ellipse(
        g,
        x + Math.cos(a) * L * u,
        fy + Math.sin(a) * L * u * flat,
        rr,
        Math.max(1, Math.round(rr * 0.7)),
        u > 0.7 ? PINK.lit : i % 2 ? PINK.petal : PINK.dark,
      )
    }
  }
  ellipse(g, x, fy, 4, 2, PINK.heart)
}
