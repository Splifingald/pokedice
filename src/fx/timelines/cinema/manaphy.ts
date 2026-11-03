// Manaphy's entrance (docs/53), on the battle stage: the Sea Temple Samiya on the floor of the deep. Blue dark, light
// falling in shafts from far above, marine snow, a school of fish turning; the temple stands in silhouette, its dome
// and columns and the spire that holds the Sea Crown. A heartbeat: the temple wakes, its runes lighting from the steps
// up the columns and over the dome to the crown. Then the Heart Swap: two hearts, one pink and one blue, rise out of the
// doorway and wind round each other, trading places as they climb, small hearts trailing; they meet and fuse into one
// great heart that beats twice, the sea flushed pink, and the prince of the sea is inside it when it bursts.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
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
  shade,
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, pulse, tri } from './kit'

/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(v * 8) / 8

const REVEAL = 4.0
const FLOOR = 102
/** The temple's middle: the foe stands in its doorway. */
const TX = 173
const T_WAKE = 0.95
const T_CROWN = 2.0
const T_HEARTS = 2.15
const T_FUSE = 3.15
const BEATS = [3.27, 3.63] as const
const PINK = ['#ffe0f0', '#ff9ad0', '#e0509a', '#8a2a5a'] as const
const BLUE = ['#e0f6ff', '#8ad8ff', '#3a9ae0', '#1a4a8a'] as const
const RUNE = '#5ae8e0'

/** The runes: where each lights and when. */
type Rune = { x: number; y: number; w: number; h: number; at: number }
type X = {
  sea: Canvas
  temple: Canvas
  shafts: Canvas
  buf: Canvas
  runes: Rune[]
  snow: Particles
  fish: number[]
}

/** A heart, filled and edged, `s` pixels from its middle to its side; cached by size. */
const heart = (s: number, fill: string | null, edge: string, lit?: string) =>
  cached(`mana-heart|${s}|${fill}|${edge}|${lit}`, () => {
    const inside = (px: number, py: number) => {
      const x = ((px - s) / s) * 1.22
      const y = (-(py - s) / s) * 1.22 + 0.2
      const a = x * x + y * y - 1
      return a * a * a - x * x * y * y * y <= 0
    }
    return shade(2 * s + 1, 2 * s + 1, (x, y) => {
      if (!inside(x, y)) return null
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
      if (rim) return edge
      if (lit && x < s * 0.75 && y < s * 0.75 && (x - s * 0.45) ** 2 + (y - s * 0.55) ** 2 < s * s * 0.06)
        return lit
      return fill
    })
  })

/** The deep: dark blue down to black, a ridge of rock and coral behind, sand on the floor. */
function sea(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, H, ['#0e4a6a', '#08304e', '#05203a', '#03122a', '#020a1a']), 0, 0)
  // Far ridges, dim.
  for (let x = 0; x < W; x++) {
    const y = Math.round(FLOOR - 26 - Math.abs(Math.sin(x / 37 + 0.6)) * 14 - Math.sin(x / 11) * 2)
    rect(g, x, y, 1, FLOOR - y, '#06223a')
    rect(g, x, y, 1, 1, '#0e3450')
  }
  // The sea floor: sand ripples in rows.
  g.drawImage(dGradient(W, H - FLOOR, ['#1a3a4a', '#10283a', '#081a2a']), 0, FLOOR)
  for (let y = FLOOR + 3; y < H; y += 4)
    for (let x = (y * 5) % 11; x < W; x += 11 + (y % 3)) rect(g, x, y, 4 + (y >> 5), 1, '#24505e')
  // Coral and rocks on the left, a broken column lying in the sand.
  for (const [x, rx, ry] of [
    [18, 16, 9],
    [52, 10, 6],
    [90, 13, 7],
  ] as const) {
    ellipse(g, x, FLOOR + 2, rx, ry, '#0c2432')
    ellipse(g, x - 2, FLOOR, rx - 3, ry - 3, '#16384a')
  }
  // Coral on the rocks: branching fans, pink and orange, and round tube sponges.
  for (const [x, h, c, tp] of [
    [14, 8, '#b8406a', '#ffb0c8'],
    [26, 6, '#d0703a', '#ffd0a0'],
    [58, 6, '#b8406a', '#ffb0c8'],
    [86, 7, '#c8902a', '#fff0a0'],
    [98, 5, '#d0703a', '#ffd0a0'],
  ] as const)
    coral(g, x, FLOOR - 2, h, 0, 2, c, tp)
  for (const [x, n] of [
    [36, 3],
    [78, 2],
  ] as const)
    for (let k = 0; k < n; k++) {
      const hh = 5 + k * 3
      rect(g, x + k * 4, FLOOR - hh, 3, hh, '#5a3a7a')
      rect(g, x + k * 4, FLOOR - hh, 3, 1, '#a07ad0')
      rect(g, x + k * 4 + 1, FLOOR - hh, 1, 1, '#1a0a2a')
    }
  // A fallen part of the temple: a column still standing, broken off, and an arch's stub.
  const cx0 = 66
  rect(g, cx0 - 3, FLOOR - 40, 7, 38, '#0e2c3e')
  rect(g, cx0 - 3, FLOOR - 40, 1, 38, '#1e4e66')
  rect(g, cx0, FLOOR - 40, 1, 38, '#081c2a')
  tri(g, cx0 - 3, FLOOR - 40, cx0 + 4, FLOOR - 40, cx0 + 4, FLOOR - 46, '#0e2c3e')
  rect(g, cx0 - 5, FLOOR - 4, 11, 3, '#081c2a')
  for (let k = 0; k < 6; k++) rect(g, cx0 + 4 + k * 3, FLOOR - 42 - k * 2 + (k * k) / 2, 3, 3, '#0e2c3e')
  return cv
}

/** Samiya: stepped base, six columns, the entablature, the ribbed dome and its spire. */
function temple(): { cv: Canvas; runes: Rune[] } {
  const cv = canvas(W, H)
  const g = cv.g
  const runes: Rune[] = []
  const DARK = '#0a2232'
  const MID = '#143a50'
  const LIT = '#2a6a86'
  const TOP = 46
  // The dome: a half ellipse, its ribs, sitting on the entablature.
  ellipse(g, TX, TOP, 40, 28, DARK)
  ellipse(g, TX - 3, TOP - 2, 34, 24, MID)
  for (let k = -3; k <= 3; k++)
    ellipseLine(
      g,
      TX,
      TOP,
      Math.abs(k) * 12,
      28,
      LIT,
      k < 0 ? Math.PI : Math.PI * 1.5,
      k < 0 ? Math.PI * 1.5 : Math.PI * 2,
    )
  // Only its top half: the entablature covers where the rest would be.
  g.clearRect(TX - 41, TOP, 82, 30)
  // The spire, and the crown's seat at its top.
  tri(g, TX - 5, TOP - 26, TX + 5, TOP - 26, TX, TOP - 44, MID)
  rect(g, TX - 1, TOP - 44, 1, 18, LIT)
  rect(g, TX - 6, TOP - 27, 12, 2, DARK)
  // Entablature and pediment band.
  rect(g, TX - 58, TOP, 116, 7, DARK)
  rect(g, TX - 58, TOP, 116, 1, LIT)
  rect(g, TX - 54, TOP + 7, 108, 2, MID)
  // Columns, fluted, a capital and a base each.
  const cols = [-46, -30, -14, 14, 30, 46]
  for (const dx of cols) {
    const x = TX + dx - 3
    rect(g, x, TOP + 9, 7, FLOOR - TOP - 15, MID)
    rect(g, x, TOP + 9, 1, FLOOR - TOP - 15, LIT)
    rect(g, x + 3, TOP + 9, 1, FLOOR - TOP - 15, DARK)
    rect(g, x + 6, TOP + 9, 1, FLOOR - TOP - 15, DARK)
    rect(g, x - 2, TOP + 9, 11, 3, DARK)
    rect(g, x - 2, FLOOR - 9, 11, 3, DARK)
    for (let k = 0; k < 4; k++) runes.push({ x: x + 2, y: FLOOR - 14 - k * 9, w: 3, h: 2, at: 0 })
  }
  // The doorway: a dark arch between the middle columns.
  rect(g, TX - 9, TOP + 22, 18, FLOOR - TOP - 28, '#020a12')
  ellipse(g, TX, TOP + 22, 9, 7, '#020a12')
  // The steps.
  for (let k = 0; k < 3; k++) {
    rect(g, TX - 60 - k * 6, FLOOR - 6 + k * 3, 120 + k * 12, 3, k % 2 ? MID : DARK)
    rect(g, TX - 60 - k * 6, FLOOR - 6 + k * 3, 120 + k * 12, 1, LIT)
    runes.push({ x: TX - 60 - k * 6, y: FLOOR - 6 + k * 3, w: 120 + k * 12, h: 1, at: 0 })
  }
  // Dome ribs and the entablature's band light last.
  runes.push({ x: TX - 58, y: TOP, w: 116, h: 1, at: 0 })
  // Lit in order: steps (from the bottom), then each column from its foot, then the band.
  const order = runes.map((r, i) => ({
    r,
    i,
    k: r.w > 20 ? (r.y > FLOOR - 8 ? 0 : 3) : 1 + (FLOOR - r.y) / 60,
  }))
  order.sort((a, b) => a.k - b.k || Math.abs(a.r.x - TX) - Math.abs(b.r.x - TX))
  order.forEach((o, n) => (o.r.at = T_WAKE + (n / order.length) * (T_CROWN - T_WAKE - 0.2)))
  return { cv, runes }
}

/** Light falling from the surface in slanted shafts: brightest at their middle and at the top, fading as they sink. */
function shafts(): Canvas {
  const list = [
    [40, 9, 0.5],
    [96, 5, 0.35],
    [150, 12, 0.55],
    [214, 7, 0.4],
    [262, 10, 0.45],
  ] as const
  return shade(W + 40, H, (x, y) => {
    let v = 0
    for (const [x0, wd, k] of list) {
      const d = Math.abs(x - (x0 - y * 0.35)) / wd
      if (d < 1) v = Math.max(v, (1 - d) * k * (1 - y / H) ** 0.8)
    }
    return v > bayer(x, y) ? (v > 0.42 ? '#5aa8c8' : '#2a7898') : null
  })
}

/** A branching coral: a trunk splitting twice, its tips lit. */
function coral(g: G, x: number, y: number, h: number, a: number, depth: number, c: string, tip: string) {
  const x1 = x + Math.sin(a) * h
  const y1 = y - Math.cos(a) * h
  line(g, x, y, x1, y1, c, depth > 1 ? 2 : 1)
  if (depth <= 0) return void rect(g, Math.round(x1), Math.round(y1), 1, 1, tip)
  coral(g, x1, y1, h * 0.7, a - 0.5, depth - 1, c, tip)
  coral(g, x1, y1, h * 0.7, a + 0.45, depth - 1, c, tip)
}

export const manaphyCinema = bossCinema<X>({
  id: 'cinema-manaphy',
  reveal: REVEAL,
  seed: 490,
  aura: ['#ffffff', '#c8ecff', '#4ab0e8', '#1a4a8a'],
  flash: '#ffe8f4',
  setup(_st, r) {
    const t = temple()
    return {
      sea: sea(),
      temple: t.cv,
      shafts: shafts(),
      buf: canvas(W, H),
      runes: t.runes,
      snow: new Particles(),
      fish: Array.from({ length: 24 }, () => r.range(0, 1)),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.snow.update(dt)
    // Marine snow, sinking slow; bubbles rising off the floor.
    if (r() < 0.4)
      s.snow.add({
        x: r.range(0, W),
        y: -2,
        vx: r.range(-3, 3),
        vy: r.range(4, 9),
        life: 12,
        size: 1,
        shape: 'px',
        colors: [r() < 0.3 ? '#8ac8e0' : '#3a7a9a'],
      })
    if (r() < 0.12)
      s.snow.add({
        x: r.range(0, W),
        y: FLOOR + r.range(0, 30),
        vy: -r.range(12, 22),
        ax: 0,
        life: 4,
        size: r.int(1, 2),
        shape: 'bubble',
        colors: ['#8ad8ff'],
        core: '#e0f6ff',
      })
    // The hearts' trail of little hearts; the burst of them on the reveal.
    if (t > T_HEARTS && t < T_FUSE)
      for (const [h, c] of [
        [heartAt(t, 0), PINK],
        [heartAt(t, 1), BLUE],
      ] as const)
        if (r() < 0.5)
          s.fx.add({
            x: h.x + r.range(-3, 3),
            y: h.y + r.range(-3, 3),
            vx: r.range(-8, 8),
            vy: r.range(-4, 10),
            life: 0.7,
            size: 1,
            shape: r() < 0.35 ? 'heart' : 'star',
            colors: [c[1], c[2]],
          })
    if (within(t, REVEAL, REVEAL + dt))
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(30, 110)
        s.fx.add({
          x: TX,
          y: FLOOR - 30,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 2,
          life: r.range(0.7, 1.2),
          size: 1,
          shape: 'heart',
          colors: i % 2 ? [PINK[1], PINK[2]] : [BLUE[1], BLUE[2]],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    b.drawImage(s.sea, 0, 0)
    // The shafts sway as the surface far above moves.
    b.drawImage(s.shafts, Math.round(Math.sin(t * 0.7) * 6) - 10, 0)
    drawFish(b, s.fish, t)
    // The temple's glow behind it once the crown is lit.
    const awake = span(t, T_CROWN - 0.2, T_CROWN + 0.6)
    if (awake > 0) b.drawImage(glow(70, '#1a6a8a', 1.6, q8(0.6 * awake)), TX - 70, FLOOR - 50 - 70)
    b.drawImage(s.temple, 0, 0)
    // The runes lighting one by one, a flare as each comes on, then a slow shimmer.
    for (const rn of s.runes)
      if (t >= rn.at) {
        const fresh = t - rn.at < 0.12
        const shim = Math.floor(t * 4 + rn.x * 0.3 + rn.y) % 7 === 0
        rect(b, rn.x, rn.y, rn.w, rn.h, fresh ? '#ffffff' : shim ? '#c8fff8' : RUNE)
        if (fresh) b.drawImage(glow(5, RUNE, 1.3, 0.8), rn.x + (rn.w >> 1) - 5, rn.y - 5)
      }
    // The dome's ribs and the crown, lit from below once the runes reach them.
    if (t > T_CROWN - 0.25) {
      const q = span(t, T_CROWN - 0.25, T_CROWN)
      for (let kk = -3; kk <= 3; kk++) {
        const a0 = kk < 0 ? Math.PI : Math.PI * 1.5
        ellipseLine(
          b,
          TX,
          46,
          Math.abs(kk) * 12,
          28,
          q < 1 ? '#c8fff8' : RUNE,
          kk < 0 ? a0 + (1 - q) * Math.PI * 0.5 : a0,
          kk < 0 ? Math.PI * 1.5 : a0 + q * Math.PI * 0.5,
        )
      }
    }
    if (t > T_CROWN) {
      // The Sea Crown: a gem on the spire, its glow beating with the hearts.
      const beat = Math.max(...BEATS.map((at) => pulse(t, at, at + 0.25)))
      const gr = Math.round(10 + 6 * pulse(t, T_CROWN, T_CROWN + 0.5) + 6 * beat)
      b.drawImage(glow(gr, '#ffd870', 1.3, 0.8), TX - gr, 2 - gr + 4)
      tri(b, TX - 4, 6, TX + 4, 6, TX, 0, '#ffd870')
      tri(b, TX - 4, 6, TX + 4, 6, TX, 11, '#e0a030')
      rect(b, TX - 1, 3, 2, 2, '#ffffff')
    }
    // The door's light, and the pink flush of the swap.
    const door = span(t, T_HEARTS - 0.4, T_HEARTS) * (1 - span(t, REVEAL + 0.3, REVEAL + 1))
    if (door > 0) {
      b.drawImage(glow(14, '#ff9ad0', 1.2, q8(0.7 * door)), TX - 14, 70 - 14)
      rect(b, TX - 8, 70, 16, FLOOR - 6 - 70, pattern(b, '#ffd0e8', Math.round(door * 8)))
    }
    const flush =
      span(t, T_HEARTS, T_FUSE) * 0.15 + Math.max(...BEATS.map((at) => pulse(t, at, at + 0.3))) * 0.2
    if (t < REVEAL + 0.3) wash(b, '#e0509a', flush * (1 - span(t, REVEAL, REVEAL + 0.3)), 8)
    s.snow.draw(b)
    // The two hearts winding round each other, then the one heart, beating.
    if (t > T_HEARTS && t < T_FUSE + 0.05) {
      const h0 = heartAt(t, 0)
      const h1 = heartAt(t, 1)
      // The one behind is drawn first: they pass in front of each other as they trade places.
      const [a, c] = h0.z < h1.z ? [h0, h1] : [h1, h0]
      for (const h of [a, c]) {
        const C = h === h0 ? PINK : BLUE
        const sz = Math.round(4 + h.size * (h.z > 0 ? 1.15 : 0.9))
        b.drawImage(glow(sz + 6, C[1], 1.3, 0.55), Math.round(h.x) - sz - 6, Math.round(h.y) - sz - 6)
        b.drawImage(heart(sz, C[1], C[3], C[0]), Math.round(h.x) - sz, Math.round(h.y) - sz)
      }
    }
    if (t >= T_FUSE && t < REVEAL + 0.05) {
      const cy = FLOOR - 32
      const grow = ease.outBack(span(t, T_FUSE, T_FUSE + 0.18), 2.4)
      const beat = Math.max(...BEATS.map((at) => pulse(t, at, at + 0.22)))
      const sz = Math.round(lerp(6, 22, grow) + beat * 6)
      b.drawImage(glow(sz + 14, '#ff9ad0', 1.2, 0.7), TX - sz - 14, cy - sz - 14)
      // Half pink, half blue, split down the middle: the two still in it.
      const hp = heart(sz, '#ffc0e0', '#ffffff', '#ffffff')
      const hb = heart(sz, '#a8e0ff', '#ffffff', '#ffffff')
      b.drawImage(hp, 0, 0, sz + 1, 2 * sz + 1, TX - sz, cy - sz, sz + 1, 2 * sz + 1)
      b.drawImage(hb, sz + 1, 0, sz, 2 * sz + 1, TX + 1, cy - sz, sz, 2 * sz + 1)
      for (const at of BEATS) burstRing(b, TX, cy, span(t, at, at + 0.6), 90, 2, '#ff9ad0')
    }
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Inside the heart, curled up, as it beats the second time.
    if (t < BEATS[1] - 0.05) return
    const q = ease.outBack(span(t, BEATS[1] - 0.05, REVEAL - 0.05), 1.8)
    drawSprite(g, s.foe, TX, s.L.foe.y, {
      sx: q,
      sy: q,
      sil: '#ffffff',
      outline: Math.floor(t * 14) % 2 ? BLUE[2] : PINK[2],
    })
  },
  front(g, _s, t, k) {
    // Kelp in front at the edges, swaying.
    if (k < 0.5) return
    for (const [x0, h0, ph] of [
      [4, 70, 0],
      [12, 46, 1.4],
      [232, 60, 2.2],
    ] as const)
      for (let y = H; y > H - h0; y -= 2) {
        const u = (H - y) / h0
        const x = Math.round(x0 + Math.sin(t * 1.3 + ph + u * 3) * u * 6)
        rect(g, x, y - 2, 3, 2, u > 0.9 ? '#2a6a4a' : '#123e2e')
        if ((y >> 1) % 4 === 0) rect(g, x + (u * 10 > 5 ? 3 : -2), y - 2, 2, 1, '#1e5a3a')
      }
  },
  sounds: [
    [0.05, () => hiss(4, { freq: 260, type: 'lowpass', vol: 0.06 })],
    [0.3, () => tone(110, 1.6, { type: 'sine', vol: 0.05, slide: 40 })],
    [T_WAKE - 0.1, () => fxSound('legend.heart')],
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [T_WAKE + i * 0.12, () => tone(523 * 2 ** (i / 7), 0.18, { type: 'triangle', vol: 0.025 })] as const,
    ),
    [
      T_CROWN,
      () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.03, at: i * 0.07 })),
    ],
    [T_HEARTS, () => hiss(1, { freq: 900, slide: 700, vol: 0.03 })],
    ...[0, 1, 2, 3, 4].map(
      (i) =>
        [
          T_HEARTS + 0.15 + i * 0.2,
          () => (
            tone(i % 2 ? 784 : 988, 0.14, { type: 'sine', vol: 0.03 }),
            tone(i % 2 ? 988 : 784, 0.14, { type: 'sine', vol: 0.03, at: 0.08 })
          ),
        ] as const,
    ),
    [T_FUSE, () => [523, 659, 784, 1047].forEach((f) => tone(f, 0.6, { type: 'triangle', vol: 0.025 }))],
    ...BEATS.map(
      (at) => [at, () => (fxSound('legend.heart'), tone(98, 0.25, { type: 'sine', vol: 0.08 }))] as const,
    ),
    [
      REVEAL,
      () => (
        hiss(0.3, { freq: 2600, vol: 0.05 }),
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.22, { type: 'triangle', vol: 0.03, at: i * 0.05 }),
        )
      ),
    ],
  ],
})

/**
 * A heart on its climb (0 pink, 1 blue): out of the door, round the other on a widening then closing spiral, half a
 * turn at a time (each half turn they trade places). `z` > 0 is in front.
 */
function heartAt(t: number, i: number) {
  const q = span(t, T_HEARTS, T_FUSE)
  const cx = TX
  const cy = lerp(FLOOR - 26, FLOOR - 32, q)
  const R = Math.sin(Math.PI * Math.min(1, q * 1.15)) * 34 + 1
  const a = q * Math.PI * 5 + i * Math.PI
  return {
    x: cx + Math.cos(a) * R,
    y: cy - Math.sin(Math.PI * q) * 22 + Math.sin(a) * R * 0.35,
    z: Math.sin(a),
    size: ease.outC(span(q, 0, 0.3)) * 5,
  }
}

/** A school of small fish turning together over the ruins, gone before the temple wakes. */
function drawFish(g: G, fish: readonly number[], t: number) {
  const q = span(t, 0, 2.4)
  if (q >= 1) return
  for (let i = 0; i < fish.length; i++) {
    const f = fish[i]!
    const u = q * 1.3 - f * 0.3
    if (u < 0 || u > 1) continue
    const x = lerp(-10, W * 0.62, u) + Math.cos(f * 31) * 10
    const y = 34 + Math.sin(u * 5) * 12 + Math.sin(f * 40) * 8
    const xx = Math.round(x)
    const yy = Math.round(y)
    rect(g, xx, yy, 4, 2, '#3a7aa0')
    rect(g, xx, yy, 4, 1, '#6aaac8')
    rect(g, xx - 2, yy - 1, 2, 1, '#2a6a90')
    rect(g, xx - 2, yy + 2, 2, 1, '#2a6a90')
    if ((Math.floor(t * 8) + i) % 6 === 0) rect(g, xx + 1, yy, 2, 1, '#e0f6ff')
  }
}
