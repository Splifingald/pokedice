// Ogerpon's raid entrance (docs/53): Kitakami's Festival of Masks at night. A street of stalls hung with masks, strings
// of paper lanterns across it, the old gate at its end and Mt. Oni behind; taiko drums, a flute. A wind comes down the
// mountain: the lanterns sway and go out, far to near, leaves blowing through. In the dark, four masks light up one by
// one with a drumbeat (Teal, Wellspring, Hearthflame, Cornerstone) and begin to turn in a ring, faster and faster,
// trailing their colours, while the leaves whirl in. The masks come together into one; an Ivy Cudgel's green arc
// sweeps round; and on the reveal every lantern lights again at once.
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
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, within } from '../../timeline'
import { raidScene, ridge, stars, type Ctx } from './gen9kit'
import { burstRing, dGradient, tri } from './kit'

const DRUMS = [0.35, 0.75, 1.05, 1.25] as const
const T_WIND = 1.45
const T_DARK = 2.3
/** The masks lighting up, one a drumbeat. */
const MASK_AT = [2.45, 2.68, 2.9, 3.1] as const
const T_TURN = 3.25
const T_JOIN = 3.85
/** Its flash 0.38 s before the reveal's: never two flashes closer than a third of a second. */
const T_CUDGEL = 4.12
const REVEAL = 4.5

const AURA = ['#ffffff', '#c8ffd8', '#3ab88a', '#145a48'] as const

/** The four masks: face, shade, lit, eyes, horns. */
const MASKS = [
  { face: '#3ab89a', shade: '#1e6a5a', lit: '#a8f0d8', eye: '#ffe060', horn: '#e8e0c8' },
  { face: '#3a7ae0', shade: '#1e3a8a', lit: '#a8d0ff', eye: '#ffffff', horn: '#c8e0ff' },
  { face: '#e0402a', shade: '#7a1a10', lit: '#ffb080', eye: '#ffe060', horn: '#3a2a2a' },
  { face: '#8a8a90', shade: '#4a4a52', lit: '#c8c8d0', eye: '#ffd060', horn: '#5a5a62' },
] as const

type Lantern = { x: number; y: number; s: number; out: number; ph: number }

type X = { back: Canvas; lanterns: Lantern[]; strings: [number, number][][] }

function layout(c: Ctx) {
  const vy = Math.round(c.h * 0.44)
  return { vy, rx: Math.round(Math.min(c.w * 0.38, 110)), ry: Math.round(Math.min(c.w * 0.38, 110) * 0.32) }
}

/** An oni mask, `s` its half-height: horns, a rounded face lit from the left, brows, glowing eyes, fangs. */
function drawMask(g: G, x: number, y: number, s: number, m: (typeof MASKS)[number], glowing: boolean) {
  x = Math.round(x)
  y = Math.round(y)
  const k = s / 8
  tri(g, x - 5 * k, y - 4 * k, x - 2 * k, y - 6 * k, x - 8 * k, y - 12 * k, m.horn)
  tri(g, x + 5 * k, y - 4 * k, x + 2 * k, y - 6 * k, x + 8 * k, y - 12 * k, m.horn)
  ellipse(g, x, y, Math.round(7 * k), Math.round(8 * k), m.shade)
  ellipse(g, x - 1, y - 1, Math.round(6 * k), Math.round(7 * k), m.face)
  rect(
    g,
    x - Math.round(4 * k),
    y - Math.round(6 * k),
    Math.round(3 * k),
    Math.max(1, Math.round(2 * k)),
    m.lit,
  )
  // Brows, eyes, the mouth and its fangs.
  line(g, x - 5 * k, y - 4 * k, x - 1 * k, y - 2 * k, m.shade, Math.max(1, Math.round(k)))
  line(g, x + 5 * k, y - 4 * k, x + 1 * k, y - 2 * k, m.shade, Math.max(1, Math.round(k)))
  const ew = Math.max(2, Math.round(3 * k))
  rect(g, x - Math.round(5 * k), y - Math.round(1 * k), ew, Math.max(1, Math.round(2 * k)), '#0a0a0a')
  rect(g, x + Math.round(2 * k), y - Math.round(1 * k), ew, Math.max(1, Math.round(2 * k)), '#0a0a0a')
  if (glowing) {
    rect(g, x - Math.round(4 * k), y - Math.round(1 * k), Math.max(1, Math.round(k)), 1, m.eye)
    rect(g, x + Math.round(3 * k), y - Math.round(1 * k), Math.max(1, Math.round(k)), 1, m.eye)
  }
  rect(
    g,
    x - Math.round(4 * k),
    y + Math.round(3 * k),
    Math.round(8 * k),
    Math.max(1, Math.round(2 * k)),
    '#2a0a0a',
  )
  rect(g, x - Math.round(4 * k), y + Math.round(3 * k), 1, Math.max(1, Math.round(2 * k)), '#ffffff')
  rect(g, x + Math.round(3 * k), y + Math.round(3 * k), 1, Math.max(1, Math.round(2 * k)), '#ffffff')
}

/** The street, drawn once: the sky and Mt. Oni, the gate, the stalls with their masks, the road. */
function street(c: Ctx): Canvas {
  const L = layout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  const r = rng(1017)
  g.drawImage(dGradient(c.w, L.vy + 4, ['#06040e', '#100a22', '#1e1232', '#3a1e3a']), 0, 0)
  stars(g, r, c.w, L.vy * 0.6, Math.round(c.w * 0.25), '#fff0e0', '#5a4a6a')
  // Mt. Oni, its two horns.
  const top = Math.round(L.vy - c.h * 0.22)
  const hw = Math.round(c.h * 0.32)
  for (let y = top; y < L.vy + 4; y++) {
    const k = (y - top) / (L.vy - top)
    const ww = Math.round(hw * Math.pow(k, 0.85) + Math.sin(y / 3) * 1)
    rect(g, c.cx + 6 - ww, y, ww * 2, 1, '#120c1e')
  }
  for (const d of [-4, 4]) rect(g, c.cx + 6 + d - 1, top - 5, 3, 6, '#120c1e')
  ridge(g, c.w, L.vy + 2, c.h * 0.03, '#0c0814', 1017, L.vy + 6, 0.3)
  // The road: packed earth down the middle of the street, lit by the stalls.
  g.drawImage(dGradient(c.w, c.h - L.vy, ['#2a1a14', '#3a2418', '#4a2e1e']), 0, L.vy)
  for (let i = 0; i < c.w * 0.6; i++) {
    const y = r.range(L.vy + 2, c.h)
    rect(g, r.range(0, c.w), y, 1 + Math.round(((y - L.vy) / c.h) * 3), 1, '#2a1810')
  }
  // The gate at the street's end: two posts, two beams, the top one swept up.
  const gw = Math.round(Math.min(c.w * 0.22, 46))
  const gt = L.vy - Math.round(gw * 0.9)
  rect(g, c.cx - gw / 2, gt, 3, L.vy - gt + 2, '#5a1a14')
  rect(g, c.cx + gw / 2 - 3, gt, 3, L.vy - gt + 2, '#5a1a14')
  rect(g, c.cx - gw / 2 - 5, gt - 3, gw + 10, 3, '#7a2418')
  line(g, c.cx - gw / 2 - 5, gt - 3, c.cx - gw / 2 - 8, gt - 6, '#7a2418', 2)
  line(g, c.cx + gw / 2 + 5, gt - 3, c.cx + gw / 2 + 8, gt - 6, '#7a2418', 2)
  rect(g, c.cx - gw / 2, gt + 5, gw, 2, '#5a1a14')
  // The stalls down each side, nearer ones bigger: an awning in stripes, masks hung along the front.
  for (const side of [-1, 1])
    for (let i = 3; i >= 0; i--) {
      const k = 1 / (1 + i * 0.75)
      const sw = Math.round(c.w * 0.3 * k + 10)
      const x0 =
        side < 0 ? Math.round(c.cx - c.w * 0.62 * k - sw * 0.5) : Math.round(c.cx + c.w * 0.62 * k - sw * 0.5)
      const base = Math.round(L.vy + c.h * 0.42 * k)
      const sh = Math.round(c.h * 0.22 * k + 6)
      const top2 = base - sh
      rect(g, x0, top2, sw, sh, '#2a1610')
      rect(g, x0, top2, 1, sh, '#4a2a1a')
      // The counter, lit from below by its own lamp.
      rect(g, x0, base - Math.round(sh * 0.35), sw, 2, '#6a3a20')
      rect(g, x0 + 1, base - Math.round(sh * 0.35) + 2, sw - 2, Math.round(sh * 0.35) - 2, '#1a0e0a')
      // The awning.
      const ah = Math.max(3, Math.round(8 * k))
      for (let x = 0; x < sw + 4; x++)
        rect(
          g,
          x0 - 2 + x,
          top2 - ah,
          1,
          ah,
          Math.floor(x / Math.max(2, Math.round(5 * k))) % 2 ? '#e8e0d0' : '#c8302a',
        )
      rect(g, x0 - 2, top2, sw + 4, 1, '#1a0a08')
      // Masks along its front.
      const ms = Math.max(2, Math.round(5 * k))
      for (let mx = x0 + ms + 2, j = 0; mx < x0 + sw - ms; mx += ms * 3, j++)
        drawMask(g, mx, top2 + ms + 3, ms, MASKS[(i + j + (side > 0 ? 2 : 0)) % 4]!, false)
    }
  return cv
}

/** The lantern strings across the street, nearer ones higher and wider, and the lanterns along them. */
function strings(c: Ctx) {
  const L = layout(c)
  const out: [number, number][][] = []
  const lanterns: Lantern[] = []
  for (let i = 3; i >= 0; i--) {
    const k = 1 / (1 + i * 0.8)
    const half = c.w * 0.75 * k + 8
    const y0 = Math.round(L.vy - (L.vy - c.h * 0.08) * k)
    const sag = 12 * k + 3
    const pts: [number, number][] = []
    for (let j = 0; j <= 20; j++) {
      const q = j / 20
      pts.push([c.cx - half + q * half * 2, y0 + Math.sin(q * Math.PI) * sag])
    }
    out.push(pts)
    const n = Math.max(3, Math.round(half / (12 * k + 4)))
    for (let j = 1; j < n * 2; j++) {
      const q = j / (n * 2)
      lanterns.push({
        x: c.cx - half + q * half * 2,
        y: y0 + Math.sin(q * Math.PI) * sag + 2,
        s: k,
        // Out from the far strings to the near ones.
        out: T_WIND + 0.15 + (3 - i) * 0.18 + (j % 3) * 0.05,
        ph: j * 1.7 + i,
      })
    }
  }
  return { out, lanterns }
}

/** Where a mask is in its ring: lit up in place, turning faster, then drawn in to the middle. */
function maskAt(c: Ctx, i: number, t: number) {
  const L = layout(c)
  const spin = Math.max(0, t - T_TURN) ** 2 * 3.2 + i * (Math.PI / 2) + Math.PI / 2
  const join = ease.inQ(span(t, T_JOIN, T_CUDGEL))
  const r = 1 - join
  const y0 = c.mid - 4
  const sn = Math.sin(spin)
  return {
    x: c.cx + Math.cos(spin) * L.rx * r,
    y: y0 + sn * L.ry * r,
    s: Math.round(lerp(6, 10, (sn + 1) / 2) * (c.m > 200 ? 1.3 : 1)),
    near: sn >= 0,
  }
}

export const ogerponCinema = raidScene<X>({
  id: 'cinema-ogerpon',
  reveal: REVEAL,
  seed: 1017,
  aura: AURA,
  flash: '#e8fff0',
  feet: 0.62,
  rays: '#3ab88a',
  setup(c) {
    const st = strings(c)
    return { back: street(c), lanterns: st.lanterns, strings: st.out }
  },
  step(c, s, t) {
    const r = s.r
    const L = layout(c)
    // Sparks of the festival drifting up, until the wind.
    if (t < T_WIND && r() < 0.3 * c.many)
      s.fx.add({
        x: r.range(0, c.w),
        y: c.h + 2,
        vx: r.range(-5, 5),
        vy: -r.range(15, 30),
        life: 3,
        size: 1,
        shape: 'px',
        colors: ['#fff0a0', '#ffbe4a', '#c8602a'],
      })
    // The wind: leaves blowing across the street.
    if (t > T_WIND && t < T_TURN && r() < 0.6 * c.many)
      s.fx.add({
        x: -4,
        y: r.range(c.h * 0.1, c.h * 0.8),
        vx: r.range(90, 160),
        vy: r.range(-20, 20),
        life: 2,
        size: 2,
        shape: 'leaf',
        spin: r.range(-6, 6),
        colors: ['#4ab84a'],
        light: '#a8f08a',
        dark: '#1e5a2a',
      })
    // Leaves whirling in to the ring as it turns.
    if (t > T_TURN && t < T_CUDGEL && r() < 0.9 * c.many) {
      const a = r() * Math.PI * 2
      const d = Math.max(c.w, c.h) * 0.55
      s.fx.add({
        x: c.cx + Math.cos(a) * d,
        y: c.mid + Math.sin(a) * d * 0.6,
        vx: -Math.sin(a) * 120,
        vy: Math.cos(a) * 60,
        home: { x: c.cx, y: c.mid, k: 300 },
        life: 1.4,
        size: 2,
        shape: 'leaf',
        spin: 8,
        colors: ['#3ab84a'],
        light: '#c8ff9a',
        dark: '#145a2a',
      })
    }
    // Each mask's trail of colour as it turns.
    if (t > T_TURN && t < T_CUDGEL)
      MASKS.forEach((m, i) => {
        const p = maskAt(c, i, t)
        s.fx.add({
          x: p.x,
          y: p.y,
          life: 0.3,
          size: 3,
          size1: 0,
          shape: 'sq',
          colors: [m.lit, m.face, m.shade],
        })
      })
    // On the reveal: every lantern alight, petals and confetti thrown up.
    if (t >= REVEAL && t - 1 / 60 < REVEAL)
      for (let k = 0; k < 40 * c.many; k++)
        s.fx.add({
          x: r.range(0, c.w),
          y: L.vy + r.range(0, c.h * 0.4),
          vx: r.range(-30, 30),
          vy: -r.range(40, 110),
          ay: 60,
          drag: 0.5,
          life: r.range(1.5, 2.5),
          size: 2,
          shape: k % 2 ? 'leaf' : 'sq',
          spin: r.range(-6, 6),
          colors: k % 2 ? ['#ffb0c8'] : ['#ffd23a', '#e0402a', '#3ab89a', '#3a7ae0'],
          light: '#ffe0ea',
          dark: '#c8608a',
        })
  },
  back(g, c, s, t) {
    g.drawImage(s.back, 0, 0)
    // The dark after the lanterns go, lifting on the reveal.
    const dark = span(t, T_WIND + 0.3, T_DARK) * (1 - span(t, REVEAL, REVEAL + 0.3))
    if (dark > 0) wash(g, '#04020a', 0.6 * dark, 8)
    // The strings and their lanterns, swaying more in the wind; each one out at its time, all lit on the reveal.
    const sway = t < T_WIND ? 1 : t < T_DARK ? 4 : 1.5
    for (const p of s.strings)
      for (let i = 1; i < p.length; i++) line(g, p[i - 1]![0], p[i - 1]![1], p[i]![0], p[i]![1], '#1a0e0a')
    for (const l of s.lanterns) {
      const on = t < l.out || t >= REVEAL + (l.s < 0.5 ? 0.08 : 0) * (1 - l.s)
      const dx = Math.round(Math.sin(t * 3 + l.ph) * sway * l.s)
      const rx = Math.max(2, Math.round(4 * l.s))
      const ry = Math.max(2, Math.round(5 * l.s))
      const x = Math.round(l.x + dx)
      const y = Math.round(l.y + ry)
      line(g, l.x, l.y, x, y - ry, '#1a0e0a')
      if (on) g.drawImage(glow(rx * 3, '#ff9a3a', 1.4, 0.4), x - rx * 3, y - rx * 3)
      ellipse(g, x, y, rx, ry, on ? '#e03a2a' : '#3a1410')
      if (on) ellipse(g, x - 1, y, Math.max(1, rx - 2), Math.max(1, ry - 2), '#ffb04a')
      rect(g, x - rx + 1, y - ry, rx * 2 - 1, 1, '#1a0a08')
      rect(g, x - rx + 1, y + ry, rx * 2 - 1, 1, '#1a0a08')
      // Blown out: a wisp of smoke as it goes.
      if (within(t, l.out, l.out + 0.3))
        rect(g, x, y - ry - 2 - Math.round((t - l.out) * 20), 1, 2, '#6a5a5a')
    }
    // The masks behind the ring's middle.
    MASKS.forEach((m, i) => {
      if (t < MASK_AT[i]! || t >= T_CUDGEL) return
      const p = maskAt(c, i, t)
      if (!p.near) drawLitMask(g, p.x, p.y, p.s, m, t, MASK_AT[i]!)
    })
  },
  before(g, c, _s, t) {
    // Its shape in the whirl once the masks are one, the Teal Mask on it.
    if (t < T_JOIN + 0.1) return
    const q = ease.outBack(span(t, T_JOIN + 0.1, T_CUDGEL))
    drawSprite(g, c.mon, c.cx, c.feet, {
      sx: lerp(0.5, 1, q),
      sy: lerp(0.5, 1, q),
      sil: '#08140e',
      outline: Math.floor(t * 14) % 2 ? '#3ab88a' : '#a8f0d8',
    })
  },
  front(g, c, _s, t) {
    const L = layout(c)
    MASKS.forEach((m, i) => {
      if (t < MASK_AT[i]! || t >= T_CUDGEL) return
      const p = maskAt(c, i, t)
      if (p.near) drawLitMask(g, p.x, p.y, p.s, m, t, MASK_AT[i]!)
    })
    // Ivy Cudgel: a green crescent sweeping round it.
    const q = span(t, T_CUDGEL, T_CUDGEL + 0.2)
    if (q > 0 && q < 1) {
      const R = Math.round(Math.min(c.w * 0.42, 100))
      const a0 = -Math.PI * 0.9 + q * Math.PI * 1.4
      for (let k = 0; k < 6; k++)
        ellipseLine(
          g,
          c.cx,
          c.mid,
          R - k,
          Math.round((R - k) * 0.7),
          k < 2 ? '#ffffff' : k < 4 ? '#a8f08a' : '#3ab84a',
          a0 - 1.4 + k * 0.08,
          a0,
        )
    }
    burstRing(g, c.cx, c.mid, span(t, T_JOIN + 0.25, T_JOIN + 0.75), c.m * 0.6, 2, '#3ab89a')
    // On the reveal the lanterns' light runs out from the middle along the street.
    const wave = span(t, REVEAL, REVEAL + 0.5)
    if (wave > 0 && wave < 1)
      ellipseLine(g, c.cx, L.vy, Math.round(wave * c.w), Math.round(wave * c.h * 0.4), '#ffbe4a')
    if (within(t, T_CUDGEL, T_CUDGEL + 0.12)) screenFlash(g, '#c8ffd8', 0.35)
  },
  shakes: () => [
    ...DRUMS.map((at) => [at, 0.1, 1] as [number, number, number]),
    ...MASK_AT.map((at) => [at, 0.12, 1] as [number, number, number]),
    [T_CUDGEL, 0.35, 4],
  ],
  sounds: () => [
    // Taiko and a flute: the festival.
    ...DRUMS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(80 - i * 3, 0.3, { type: 'sine', vol: 0.12 }),
            hiss(0.08, { freq: 250, type: 'lowpass', vol: 0.08 })
          ),
        ] as const,
    ),
    ...[784, 880, 1047, 880, 784, 659].map(
      (f, i) => [0.4 + i * 0.16, () => tone(f, 0.2, { type: 'triangle', vol: 0.025 })] as const,
    ),
    [T_WIND, () => hiss(1.4, { freq: 800, slide: 600, vol: 0.06 })],
    ...[0, 1, 2, 3, 4].map(
      (i) =>
        [T_WIND + 0.2 + i * 0.16, () => tone(300 - i * 30, 0.05, { type: 'square', vol: 0.015 })] as const,
    ),
    ...MASK_AT.map(
      (at, i) =>
        [
          at,
          () => (
            tone(70, 0.35, { type: 'sine', vol: 0.14 }),
            tone([523, 587, 659, 784][i]!, 0.3, { type: 'triangle', vol: 0.03 })
          ),
        ] as const,
    ),
    [T_TURN, () => tone(220, 0.8, { type: 'sawtooth', vol: 0.025, slide: 440 })],
    [T_JOIN, () => fxSound('legend.heart')],
    [T_CUDGEL, () => (fxSound('leaf.slash'), tone(60, 0.4, { type: 'sine', vol: 0.12 }))],
  ],
})

/** A mask in the dark: flashing in with its drumbeat, its own light round it. */
function drawLitMask(
  g: G,
  x: number,
  y: number,
  s: number,
  m: (typeof MASKS)[number],
  t: number,
  at: number,
) {
  const pop = ease.outBack(span(t, at, at + 0.25))
  const gr = Math.round(s * 2.2)
  g.drawImage(glow(gr, m.face, 1.3, 0.6), Math.round(x) - gr, Math.round(y) - gr)
  drawMask(g, x, y, Math.max(2, Math.round(s * pop)), m, true)
}
