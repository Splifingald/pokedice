// The lake guardians' raid entrances (docs/53): Sinnoh's three lakes, each with its cavern on an islet in the middle,
// and each guardian coming up out of its own water in its own colour. What they share is the lake (a far shore, the
// islet, the water mirroring it all); each has its own signature.
//
// Uxie, Lake Acuity (knowledge): a snowstorm at night, the lake frozen but for a black hole of water in the middle.
// Gold light runs out through the cracks in the ice like thoughts along nerves; runes rise from them and a great
// golden sigil draws itself in the air. It folds into the shape rising from the hole, and then the world is forgotten:
// a band sweeps down the screen and leaves a blank page, only its silhouette on it. The reveal remembers the lake,
// redrawn in a ring from it outward.
//
// Mesprit, Lake Verity (emotion): mist on the lake at dusk. A heartbeat, and a wave of pink runs out through the mist
// and leaves it blue again: sorrow, then joy. With each beat it is glimpsed somewhere else in the mist, nearer each
// time. The beats quicken, the mist is gathered into a whirl of pink and blue ribbons (its two tails), the sky turns
// rose, and it rises out of the water in a burst of hearts.
//
// Azelf, Lake Valor (willpower): the lake drained at dusk, its bed cracked mud, a Magikarp flopping in a puddle. The
// ground trembles, blue light comes up through the cracks, and the stones of the bed lift into the air, held there.
// Then the water comes back: two walls of it rush in from both shores and crash together in the middle. The lake is
// full again, the stones hang over it; Azelf comes up out of it and the reveal flings the stones away.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
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
  shade,
  softEllipse,
  span,
  wash,
  bayer,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  inOrder,
  tri,
  type Cinema,
  type CinemaParams,
} from './kit'

// ---------------------------------------------------------------- the lake they share

interface Lay {
  w: number
  h: number
  cx: number
  m: number
  /** The far shore. */
  hz: number
  /** Its feet, hovering, and the water under it, where it comes up. */
  feet: number
  wy: number
  many: number
  sz: { w: number; h: number }
  mon: string
}

function layout(p: CinemaParams): Lay {
  const w = p.w ?? 240
  const h = p.h ?? 160
  const feet = Math.round(h * 0.6)
  return {
    w,
    h,
    cx: Math.round(w / 2),
    m: Math.min(w, h),
    hz: Math.round(h * 0.5),
    feet,
    wy: feet + Math.max(6, Math.round(h * 0.035)),
    many: p.short ? 0.4 : 1,
    sz: spriteSize(p.mon),
    mon: p.mon,
  }
}

const quiet = (f: () => void) => () => void (!skippingNow() && f())

/** Far mountains along the shore: a ridge of a few sines, the high parts capped. */
function ridge(g: G, w: number, base: number, height: number, col: string, cap: string | null, r: Rng) {
  const p1 = r() * 6
  const p2 = r() * 6
  const p3 = r() * 6
  const l1 = r.range(36, 60)
  for (let x = 0; x < w; x++) {
    // Peaks of different sizes, not one bump repeated: a slow swell lifts some and sinks others.
    const swell = 0.55 + 0.45 * Math.sin(x / (l1 * 2.7) + p3)
    const v =
      (Math.abs(Math.sin(x / l1 + p1)) * 0.7 + Math.abs(Math.sin(x / 13 + p2)) * 0.22) * swell +
      Math.abs(Math.sin(x / 5.3 + p1)) * 0.04
    const top = Math.round(base - height * v)
    rect(g, x, top, 1, base - top + 1, col)
    const hi = base - top - height * 0.5
    if (cap && hi > 0) rect(g, x, top, 1, Math.round(hi * 0.8) + 1, cap)
  }
}

/** A pine: three tiers, the snow (if any) along each tier's hem. */
function pine(g: G, x: number, base: number, hgt: number, col: string, snow: string | null) {
  const half = Math.max(3, Math.round(hgt * 0.3))
  rect(g, x - 1, base - Math.round(hgt * 0.14), 2, Math.round(hgt * 0.14) + 1, col)
  for (let k = 0; k < 3; k++) {
    const ty = base - hgt + Math.round(k * hgt * 0.26)
    const by = ty + Math.round(hgt * 0.42)
    const hw = Math.round(half * (0.5 + k * 0.27))
    tri(g, x - hw, by, x + hw + 1, by, x + 0.5, ty, col)
    if (snow) {
      rect(g, x - hw + 1, by - 1, hw * 2 - 1, 1, snow)
      rect(g, x, ty, 1, 1, snow)
    }
  }
}

/** A round lakeside tree: a trunk, a canopy lit on its top. */
function roundTree(g: G, x: number, base: number, hgt: number, col: string, lit: string) {
  const rr = Math.max(3, Math.round(hgt * 0.32))
  rect(g, x, base - hgt + rr, 1, hgt - rr + 1, col)
  ellipse(g, x, base - hgt + rr, rr, Math.round(rr * 0.85), col)
  ellipse(g, x - 1, base - hgt + rr - 1, rr - 2, Math.round((rr - 2) * 0.7), lit)
  ellipse(g, x, base - hgt + rr + 1, rr - 1, Math.round((rr - 1) * 0.7), col)
}

/** Trees along both shores, taller nearer the edges, a gap in the middle for the islet. */
function shores(L: Lay, r: Rng, tree: (x: number, base: number, hgt: number) => void) {
  const { w, cx, hz, m } = L
  const gap = Math.max(26, w * 0.2)
  for (const side of [-1, 1])
    for (let d = gap; d < w / 2 + 8; d += r.range(4, 8)) {
      const k = (d - gap) / Math.max(1, w / 2 - gap)
      tree(Math.round(cx + side * d), hz + 1, Math.round(lerp(m * 0.07, m * 0.2, k) * r.range(0.8, 1.15)))
    }
}

/** The islet in the middle of the lake, the cavern's mouth at the water. */
function islet(L: Lay, g: G, dark: string, lit: string, cap: string | null) {
  const { cx, hz, w, m } = L
  const iw = Math.round(Math.min(w * 0.17, 40))
  const ih = Math.round(m * 0.09)
  ellipse(g, cx, hz, iw, ih, dark)
  ellipseLine(g, cx, hz, iw, ih, lit, Math.PI * 1.1, Math.PI * 1.75)
  if (cap) ellipse(g, cx - 2, hz - ih + 2, Math.round(iw * 0.6), 2, cap)
  ellipse(g, cx, hz, Math.round(iw * 0.3), Math.round(ih * 0.62), '#04050a')
}

/** The cavern's light: a glow in its mouth, then out over the water. */
function caveLight(g: G, L: Lay, k: number, col: string) {
  if (k <= 0) return
  const r = Math.max(4, Math.round(L.m * 0.1 * k) & ~1)
  g.drawImage(glow(r, col, 1.4, 0.8), L.cx - r, L.hz - r)
  ellipse(
    g,
    L.cx,
    L.hz,
    Math.max(1, Math.round(L.m * 0.025 * k)),
    Math.max(1, Math.round(L.m * 0.035 * k)),
    col,
  )
}

/**
 * The water: the scene above the shore mirrored row by row, each row swaying (`amp`), tinted through a dither so it
 * reads as water, light dashes moving on it.
 */
function water(
  g: G,
  src: Canvas,
  L: Lay,
  t: number,
  amp: number,
  base: string,
  tint: string,
  dash: string,
  /** Only these parts of each row (the lake filling up), else all of it. */
  part?: (y: number) => readonly (readonly [number, number])[],
) {
  const { w, h, hz } = L
  const pat = pattern(g, tint, 9)
  const whole = [[0, w]] as const
  for (let y = hz; y < h; y++) {
    const sy = 2 * hz - y - 1
    const d = y - hz
    const off = Math.round(Math.sin(d / 3.2 + t * 4) * amp * Math.min(1, 0.25 + d / 50))
    for (const [a0, b0] of part ? part(y) : whole) {
      const a = Math.max(0, Math.round(a0))
      const b = Math.min(w, Math.round(b0))
      if (b <= a) continue
      rect(g, a, y, b - a, 1, base)
      const s0 = Math.max(0, a - off)
      const s1 = Math.min(w, b - off)
      if (sy >= 0 && s1 > s0) g.drawImage(src, s0, sy, s1 - s0, 1, s0 + off, y, s1 - s0, 1)
      g.fillStyle = pat
      g.fillRect(a, y, b - a, 1)
    }
  }
  for (let i = 0; i < 26; i++) {
    const d = ((i * 37) % 97) / 97
    const y = hz + 2 + Math.round(d * d * (h - hz - 3))
    const len = 2 + Math.round(d * 10)
    const x = Math.round((i * 53 + t * (6 + d * 10)) % (w + 20)) - 10
    if (!part || part(y).some(([a, b]) => x >= a && x + len <= b)) rect(g, x, y, len, 1, dash)
  }
}

/** Rings on the water where it comes up. */
function ripples(g: G, L: Lay, t: number, from: number, col: string, n = 3) {
  for (let k = 0; k < n; k++) {
    const q = (t - from - k * 0.35) / 1.4
    if (q <= 0 || q >= 1) continue
    const rx = Math.round(lerp(4, L.m * 0.42, ease.outQ(q)))
    if (Math.floor(q * 10) % 3 !== 2) ellipseLine(g, L.cx, L.wy, rx, Math.max(1, Math.round(rx * 0.22)), col)
  }
}

/** It comes up out of its lake: under the water a dark shape wavering, above it a silhouette with its aura's edge. */
function rise(g: G, L: Lay, q: number, t: number, under: string, sil: string, outline: string) {
  const { w, h, cx, feet, wy, sz, mon } = L
  const y = Math.round(lerp(wy + sz.h + 6, feet, ease.outC(q)))
  g.save()
  g.beginPath()
  g.rect(0, wy, w, h - wy)
  g.clip()
  drawSprite(g, mon, cx, y, { sil: under, wave: { amp: 2, len: 7, phase: t * 18 } })
  g.restore()
  if (y - sz.h >= wy) return
  g.save()
  g.beginPath()
  g.rect(0, 0, w, wy)
  g.clip()
  drawSprite(g, mon, cx, y, { sil, outline })
  g.restore()
}

/** The legend shown: its flash fading, its aura's edge flickering, a gentle hover. */
function shown(g: G, L: Lay, t: number, reveal: number, a: readonly string[]) {
  const bob = Math.round(Math.sin((t - reveal) * 2.2) * 2)
  drawSprite(g, L.mon, L.cx, L.feet + bob, {
    flash: Math.max(0, 1 - span(t, reveal + 0.05, reveal + 0.45)),
    outline: Math.floor(t * 8) % 2 ? a[1] : a[2],
  })
}

/** A picture shown only inside a circle (or an ellipse `ky` as tall), row by row: memory, light, coming back. */
function circleSpans(g: G, src: Canvas, x: number, y: number, R: number, ky = 1) {
  const y0 = Math.max(0, Math.floor(y - R * ky))
  const y1 = Math.min(src.height, Math.ceil(y + R * ky))
  for (let yy = y0; yy < y1; yy++) {
    const dy = (yy + 0.5 - y) / ky
    const half = Math.sqrt(Math.max(0, R * R - dy * dy))
    const x0 = Math.max(0, Math.round(x - half))
    const x1 = Math.min(src.width, Math.round(x + half))
    if (x1 > x0) g.drawImage(src, x0, yy, x1 - x0, 1, x0, yy, x1 - x0, 1)
  }
}

/** The burst ring's radius at q (kit.burstRing's own easing), so a mask can follow it exactly. */
const ringR = (q: number, maxR: number) => lerp(4, maxR, 1 - (1 - q) ** 3)

/** The reveal's star burst in the aura's colours. */
function burst(
  fx: Particles,
  r: Rng,
  x: number,
  y: number,
  n: number,
  colors: readonly string[],
  shape: 'star' | 'heart' = 'star',
) {
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const v = r.range(60, 180)
    fx.add({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.7,
      drag: 2.5,
      life: r.range(0.6, 1.1),
      size: r.int(1, 2),
      shape,
      colors: [...colors],
    })
  }
}

// ---------------------------------------------------------------- Uxie: Lake Acuity

const U_GLOW = 1.1
const U_GLYPH = 1.55
const U_SIGIL = 2.05
const U_RISE = 2.9
const U_WIPE = 3.65
const U_REVEAL = 4.7
const U_AURA = ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'] as const
const GOLD = ['#fffbe0', '#ffe88a', '#ffd23a', '#c89a28', '#8a6a10'] as const
const PAPER = '#ece4c8'
const INK = '#2a2214'
/** Runes of what it knows: 3×5, made up (no letters drawn on a canvas). */
const RUNES = [
  ['.1.', '1.1', '.1.', '111', '.1.'],
  ['1..', '11.', '1.1', '.11', '..1'],
  ['111', '.1.', '1.1', '.1.', '111'],
  ['1.1', '.1.', '111', '1.1', '1..'],
  ['1.1', '111', '1.1', '.1.', '.1.'],
  ['.1.', '111', '.1.', '1.1', '1.1'],
  ['11.', '..1', '.1.', '1..', '.11'],
] as const

function rune(g: G, i: number, x: number, y: number, c: string) {
  const m = RUNES[i % RUNES.length]!
  for (let r = 0; r < 5; r++)
    for (let q = 0; q < 3; q++) if (m[r]![q] === '1') rect(g, x - 1 + q, y - 2 + r, 1, 1, c)
}

interface Mote {
  x: number
  y: number
  vy: number
  age: number
  life: number
  k: number
}

type US = {
  r: Rng
  snow: Particles
  fx: Particles
  motes: Mote[]
  back: Canvas
  ice: Canvas
  buf: Canvas
  rays: Canvas
  /** The ice's cracks, each pixel with its distance along them from the hole. */
  cracks: { x: number; y: number; d: number }[]
  maxD: number
  shakes: [number, number, number][]
}

export const uxieCinema: Cinema = {
  reveal: U_REVEAL,
  dur: U_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<US> {
    const L = layout(p)
    const { w, h, cx, hz, feet, wy, m, many, sz } = L
    const sy = Math.round(feet - sz.h * 0.5)
    const R = Math.round(Math.min(w * 0.42, h * 0.2, 60))
    const hole = {
      rx: Math.round(Math.min(w * 0.2, 30)),
      ry: Math.max(4, Math.round(Math.min(w * 0.2, 30) * 0.24)),
    }
    const glyphs = Array.from({ length: 12 }, (_, i) => ({
      slot: (i / 12) * Math.PI * 2,
      x0: cx + Math.round(Math.sin(i * 2.4) * w * 0.4),
      y0: Math.round(lerp(wy + 6, h - 10, ((i * 5) % 12) / 12)),
      t0: U_GLYPH + i * 0.07,
      rune: i,
    }))
    return {
      id: 'cinema-uxie',
      dur: U_REVEAL + AFTER_REVEAL,
      setup() {
        const r = rng(480)
        const back = canvas(w, hz)
        const bg = back.g
        bg.drawImage(dGradient(w, hz, ['#0c1222', '#162036', '#24324c', '#3a4c66']), 0, 0)
        ridge(bg, w, hz, h * 0.2, '#2e3e58', '#c8d6e4', r)
        ridge(bg, w, hz, h * 0.11, '#1c2a40', '#9eb2c6', r)
        islet(L, bg, '#18242e', '#c8d8e6', '#e8f0f6')
        shores(L, r, (x, base, hgt) => pine(bg, x, base, hgt, '#0e1a24', '#d0dce8'))
        rect(bg, 0, hz - 1, w, 1, '#e0eaf2')
        // The frozen lake: dull ice under snow, drifts, and the cracks the light will run along.
        const ice = dGradient(w, h - hz, ['#a8c0d4', '#8aa6be', '#7090aa', '#5a7a96'])
        const ig = ice.g
        for (let i = 0; i < Math.round(w / 9); i++) {
          const y = r.range(2, h - hz - 2)
          softEllipse(
            ig,
            r.range(0, w),
            y,
            Math.round(8 + y * 0.25),
            Math.round(2 + y * 0.05),
            '#dfe8f0',
            0.8,
          )
        }
        // Polished in places: long sheens across it, longer nearer.
        for (let i = 0; i < Math.round(w / 14); i++) {
          const y = Math.round(r.range(3, h - hz - 2))
          rect(ig, r.range(-10, w), y, Math.round(6 + y * 0.6), 1, '#c8dae8')
        }
        rect(ig, 0, 0, w, 2, '#e8f0f6')
        const cracks: US['cracks'] = []
        const seen = new Set<number>()
        const grow = (x: number, y: number, a: number, d: number, life: number) => {
          for (let i = 0; i < life; i++) {
            a += r.range(-0.35, 0.35)
            x += Math.cos(a)
            y += Math.sin(a) * 0.4
            d += 1
            const ix = Math.round(x)
            const iy = Math.round(y)
            if (ix < 0 || ix >= w || iy <= hz + 1 || iy >= h) return
            const key = iy * w + ix
            if (!seen.has(key)) {
              seen.add(key)
              cracks.push({ x: ix, y: iy, d })
            }
            if (r() < 0.025 && life > 24) grow(x, y, a + r.range(-1, 1), d, Math.round((life - i) * 0.6))
          }
        }
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + r.range(-0.2, 0.2)
          grow(
            cx + Math.cos(a) * hole.rx,
            wy + Math.sin(a) * hole.ry,
            a,
            0,
            Math.round(Math.min(w * 0.5, m * 0.75)),
          )
        }
        for (const c of cracks) rect(ig, c.x, c.y - hz, 1, 1, '#4e6a84')
        return {
          r,
          snow: new Particles(),
          fx: new Particles(),
          motes: [],
          back,
          ice,
          buf: canvas(w, h),
          rays: canvas(w, h),
          cracks,
          maxD: cracks.reduce((a, c) => Math.max(a, c.d), 1),
          shakes: p.short ? [] : [[U_REVEAL, 0.5, 2]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.snow.update(dt)
        s.fx.update(dt)
        // Snow, already falling when the scene opens (a first step fills the screen with it).
        const fall = (y: number) =>
          s.snow.add({
            x: r.range(-10, w + 50),
            y,
            vx: -r.range(14, 30),
            vy: r.range(34, 60),
            life: 12,
            size: r() < 0.2 ? 2 : 1,
            shape: 'sq',
            colors: [r() < 0.6 ? '#ffffff' : '#b8cce0'],
          })
        if (s.snow.list.length === 0 && t < 0.1)
          for (let i = 0; i < ((w * h) / 220) * many; i++) fall(r.range(-4, h))
        for (let i = 0; i < 4; i++) if (r() < many * (t < U_WIPE || t > U_REVEAL ? 0.9 : 0.25)) fall(-4)
        for (let i = s.snow.list.length - 1; i >= 0; i--)
          if (s.snow.list[i]!.y > h + 4) s.snow.list.splice(i, 1)
        // Thoughts leaving the cracks; memories leaving the world as it's wiped.
        for (let i = s.motes.length - 1; i >= 0; i--) {
          const o = s.motes[i]!
          o.age += dt
          o.y += o.vy * dt
          if (o.age > o.life) s.motes.splice(i, 1)
        }
        if (t > U_GLYPH && t < U_WIPE && r() < 0.35 * many) {
          const c = s.cracks[Math.floor(r() * s.cracks.length)]!
          if (c.d < s.maxD * span(t, U_GLOW, U_GLOW + 1.3))
            s.motes.push({
              x: c.x,
              y: c.y,
              vy: -r.range(10, 24),
              age: 0,
              life: r.range(0.8, 1.4),
              k: r.int(0, 6),
            })
        }
        const wq = span(t, U_WIPE, U_WIPE + 0.6)
        if (wq > 0 && wq < 1)
          for (let i = 0; i < 3 * many; i++)
            s.motes.push({
              x: r.range(0, w),
              y: lerp(-6, h + 8, ease.ioS(wq)),
              vy: -r.range(20, 50),
              age: 0,
              life: r.range(0.4, 0.9),
              k: r.int(0, 6),
            })
        if (within(t, U_REVEAL, U_REVEAL + dt)) burst(s.fx, r, cx, sy, 60 * many, [...U_AURA, ...GOLD])
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const b = s.buf.g
        // The scene, whole, into the buffer: it is wiped and remembered as one picture.
        b.drawImage(s.back, 0, 0)
        caveLight(b, L, span(t, U_GLOW - 0.4, U_GLOW + 0.4) * (1 - span(t, U_RISE, U_RISE + 0.6)), GOLD[2])
        b.drawImage(s.ice, 0, hz)
        // The hole, black water, lit gold from under it as the omen comes.
        ellipse(b, cx, wy, hole.rx + 1, hole.ry + 1, '#f0f6fa')
        ellipse(b, cx, wy, hole.rx, hole.ry, '#081420')
        const lit = span(t, U_GLOW - 0.3, U_GLOW + 0.5)
        if (lit > 0) {
          softEllipse(b, cx, wy, hole.rx - 1, hole.ry - 1, GOLD[3], 0.9 * lit)
          softEllipse(b, cx, wy, Math.round(hole.rx * 0.6), Math.round(hole.ry * 0.6), GOLD[1], 0.8 * lit)
        }
        for (let k = 0; k < 3; k++)
          rect(
            b,
            cx - hole.rx + 4 + ((k * 13 + Math.floor(t * 9)) % (hole.rx * 2 - 8)),
            wy - 1 + k,
            3,
            1,
            '#2a4a66',
          )
        // Gold running out along the cracks like thoughts along nerves, pulses travelling on them.
        const reach = s.maxD * ease.outQ(span(t, U_GLOW, U_GLOW + 1.3))
        if (reach > 0)
          for (const c of s.cracks) {
            if (c.d > reach) continue
            const front = reach - c.d < 5 && reach < s.maxD
            const pulse = (c.d - (t - U_GLOW) * 60) % 26
            b.fillStyle = front
              ? GOLD[0]
              : pulse > -4 && pulse < 0
                ? GOLD[1]
                : (c.x + c.y) % 3
                  ? GOLD[2]
                  : GOLD[3]
            b.fillRect(c.x, c.y, 1, 1)
          }
        // Runes drifting up from the cracks.
        for (const o of s.motes)
          if (t < U_WIPE)
            rune(b, o.k, Math.round(o.x), Math.round(o.y), o.age / o.life > 0.7 ? GOLD[3] : GOLD[1])
        // The sigil drawing itself in the air, its runes gathering on its rim; then folding into the shape rising.
        const fold = ease.inC(span(t, U_RISE + 0.25, U_WIPE - 0.05))
        const rr = Math.round(R * (1 - fold))
        const sq = span(t, U_SIGIL, U_SIGIL + 0.75)
        if (sq > 0 && rr > 1) sigil(b, cx, sy, rr, sq, t, fold)
        for (const gl of glyphs) {
          const q = span(t, gl.t0, gl.t0 + 1)
          if (q <= 0 || fold >= 1) continue
          const a = gl.slot + t * 0.5
          const tx = cx + Math.cos(a) * (rr + 7)
          const ty = sy + Math.sin(a) * (rr + 7)
          const e = ease.ioS(q)
          const x = lerp(gl.x0, tx, e) + Math.sin(q * 7 + gl.rune) * 6 * (1 - q)
          const y = lerp(gl.y0, ty, e)
          rune(
            b,
            gl.rune,
            Math.round(x),
            Math.round(y),
            q < 1 ? GOLD[1] : Math.floor(t * 6 + gl.rune) % 4 ? GOLD[2] : GOLD[0],
          )
        }
        if (t > U_RISE && t < U_REVEAL)
          rise(
            b,
            L,
            span(t, U_RISE, U_WIPE - 0.1),
            t,
            '#04080e',
            '#1a1608',
            Math.floor(t * 12) % 3 ? GOLD[2] : GOLD[0],
          )
        ripples(b, L, t, U_RISE, '#e0eaf2')
        if (t >= U_REVEAL) {
          const k =
            span(t, U_REVEAL, U_REVEAL + 0.4) * lerp(0.55, 0.22, span(t, U_REVEAL + 0.4, U_REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: sy }, t, GOLD[2], k)
          b.drawImage(s.rays, 0, 0)
          shown(b, L, t, U_REVEAL, U_AURA)
        }
        s.snow.draw(b)
        s.fx.draw(b)
        // Onto the screen: whole, wiped from the top, blank, or remembered in a ring from it.
        g.fillStyle = PAPER
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        const wq = span(t, U_WIPE, U_WIPE + 0.6)
        if (t < U_REVEAL) {
          const yb = Math.round(lerp(-6, h + 8, ease.ioS(wq)))
          if (yb < h)
            g.drawImage(
              s.buf,
              0,
              Math.max(0, yb),
              w,
              h - Math.max(0, yb),
              0,
              Math.max(0, yb),
              w,
              h - Math.max(0, yb),
            )
          if (wq > 0) {
            // The band's edge: the page eating the picture, gold at its lip.
            for (let i = 0; i < 6; i++) {
              g.fillStyle = pattern(g, PAPER, 16 - i * 3)
              g.fillRect(0, yb + i, w, 1)
            }
            rect(g, 0, yb, w, 1, GOLD[2])
            for (const o of s.motes)
              if (o.y < yb + 8)
                rune(g, o.k, Math.round(o.x), Math.round(o.y), o.age / o.life > 0.6 ? GOLD[3] : GOLD[4])
            // On the blank page, only it: ink, its edge gold.
            drawSprite(g, L.mon, cx, feet + Math.round(Math.sin(t * 3) * 1), {
              sil: INK,
              outline: Math.floor(t * 6) % 2 ? GOLD[2] : GOLD[3],
            })
            for (const at of [U_WIPE + 0.75, U_WIPE + 0.92])
              burstRing(g, cx, sy, span(t, at, at + 0.5), m * 0.45, 2, GOLD[3])
          }
        } else {
          const q = span(t, U_REVEAL, U_REVEAL + 0.75)
          const maxR = Math.hypot(w, h) * 0.85
          if (q >= 1) g.drawImage(s.buf, 0, 0)
          else circleSpans(g, s.buf, cx, sy, ringR(q, maxR))
          burstRing(g, cx, sy, q, maxR, 3, GOLD[2])
          burstRing(g, cx, sy, span(t, U_REVEAL + 0.12, U_REVEAL + 0.8), maxR, 2, U_AURA[1])
        }
        g.restore()
        if (within(t, U_REVEAL, U_REVEAL + 0.35))
          screenFlash(g, '#fffbe0', 0.8 * (1 - span(t, U_REVEAL, U_REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.6, { freq: 500, type: 'lowpass', vol: 0.06 }))],
          [1.2, quiet(() => hiss(1.2, { freq: 300, type: 'lowpass', vol: 0.04 }))],
          [
            U_GLOW,
            quiet(
              () => (
                tone(392, 1.4, { type: 'sine', vol: 0.04, slide: 200 }),
                hiss(0.3, { freq: 5000, vol: 0.03 })
              ),
            ),
          ],
          ...[0, 1, 2, 3, 4].map(
            (i) =>
              [
                U_GLYPH + 0.1 + i * 0.14,
                quiet(() => tone([1319, 1568, 1760, 2093, 2349][i]!, 0.3, { type: 'triangle', vol: 0.02 })),
              ] as const,
          ),
          [
            U_SIGIL,
            quiet(() =>
              [523, 659, 784, 1047].forEach((f, i) =>
                tone(f, 1.3 - i * 0.15, { type: 'sine', vol: 0.03, at: i * 0.1 }),
              ),
            ),
          ],
          [U_RISE, quiet(() => fxSound('legend.heart'))],
          [U_RISE + 0.4, quiet(() => fxSound('legend.heart'))],
          [
            U_WIPE,
            quiet(
              () => (
                hiss(0.65, { freq: 4000, slide: -3600, vol: 0.06 }),
                tone(1047, 0.6, { type: 'triangle', vol: 0.03, slide: -900 })
              ),
            ),
          ],
          [U_WIPE + 0.75, quiet(() => tone(1568, 0.5, { type: 'sine', vol: 0.03 }))],
          [U_WIPE + 0.92, quiet(() => tone(1568, 0.3, { type: 'sine', vol: 0.02 }))],
          [U_REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<US>[]),
    }
  },
}

/** The sigil of what it knows: two rings, a six-point star turning, spokes; drawn in order as `q` goes 0 → 1. */
function sigil(g: G, x: number, y: number, R: number, q: number, t: number, fold: number) {
  const gr = (R + 8) & ~3
  g.drawImage(glow(gr, GOLD[3], 2, 0.3 + fold * 0.5), x - gr, y - gr)
  const c0 = fold > 0.6 ? GOLD[0] : GOLD[2]
  const c1 = fold > 0.6 ? GOLD[0] : GOLD[1]
  const top = -Math.PI / 2
  const a1 = span(q, 0, 0.35) * Math.PI * 2
  if (a1 > 0) {
    ellipseLine(g, x, y, R, R, c0, top, top + a1)
    if (R > 6) ellipseLine(g, x, y, R - 2, R - 2, GOLD[3], top, top + a1)
  }
  const a2 = span(q, 0.2, 0.5) * Math.PI * 2
  const ri = Math.round(R * 0.58)
  if (a2 > 0 && ri > 2) ellipseLine(g, x, y, ri, ri, c1, top - a2, top)
  // The star: two triangles turning against each other, each edge drawn from its corner.
  const e = span(q, 0.35, 0.85)
  if (e > 0)
    for (const [dir, off] of [
      [1, 0],
      [-1, Math.PI / 3],
    ] as const) {
      const rot = t * 0.4 * dir + off - Math.PI / 2
      const pts = [0, 1, 2].map(
        (k) =>
          [
            x + Math.cos(rot + (k * Math.PI * 2) / 3) * R * 0.94,
            y + Math.sin(rot + (k * Math.PI * 2) / 3) * R * 0.94,
          ] as const,
      )
      for (let k = 0; k < 3; k++) {
        const a = pts[k]!
        const b = pts[(k + 1) % 3]!
        line(g, a[0], a[1], lerp(a[0], b[0], e), lerp(a[1], b[1], e), dir > 0 ? c0 : c1)
      }
    }
  const sp = span(q, 0.6, 1)
  if (sp > 0)
    for (let k = 0; k < 12; k++) {
      if (k / 12 > sp) break
      const a = -t * 0.6 + (k / 12) * Math.PI * 2
      line(
        g,
        x + Math.cos(a) * ri,
        y + Math.sin(a) * ri,
        x + Math.cos(a) * (ri + 4),
        y + Math.sin(a) * (ri + 4),
        GOLD[2],
      )
    }
  if (q > 0.85) {
    const k = Math.floor(t * 8) % 2
    rect(g, x - 1, y - 1, 3, 3, k ? GOLD[0] : GOLD[1])
  }
}

// ---------------------------------------------------------------- Mesprit: Lake Verity

/** The heartbeats: slow, then racing toward the reveal. */
const M_BEATS = [0.85, 1.5, 2.05, 2.5, 2.9, 3.25, 3.55, 3.8, 4.02, 4.2, 4.36] as const
const M_GATHER = 3.25
const M_RISE = 3.65
const M_REVEAL = 4.6
const M_AURA = ['#ffffff', '#ffd0f0', '#ff6ab0', '#8a1f5a'] as const
/** Mist in sorrow and in joy: its body, its lit top. */
const SORROW = ['#7a86b8', '#a8b4dc'] as const
const JOY = ['#ff8ac0', '#ffc8e0'] as const

/** Where it is glimpsed, on the beats: far, then nearer each time (x, y as parts of the lake; its size). */
const GLIMPSES = [
  [1, -0.3, -0.02, 0.4],
  [2, 0.3, 0.16, 0.55],
  [3, -0.22, 0.32, 0.7],
  [4, 0.14, 0.48, 0.85],
] as const

type MS = {
  r: Rng
  fx: Particles
  skyA: Canvas
  skyB: Canvas
  land: Canvas
  buf: Canvas
  rays: Canvas
  /** The mist's three banks, in sorrow and in joy, twice the screen wide so they drift round. */
  mist: { a: Canvas; b: Canvas; y: number; v: number }[]
  shakes: [number, number, number][]
}

/** A bank of mist: soft dithered blobs in a strip, wrapping round its period (the screen's width). */
function mistBank(w: number, hh: number, col: readonly [string, string], seed: number): Canvas {
  const r = rng(seed)
  const cv = canvas(w * 2, hh)
  for (let i = 0; i < Math.round(w / 7); i++) {
    const x = r.range(0, w)
    const y = r.range(hh * 0.42, hh * 0.58)
    const rx = Math.round(r.range(10, 30))
    const ry = Math.round(r.range(2, hh * 0.26))
    for (const o of [-w, 0, w, 2 * w]) {
      softEllipse(cv.g, x + o, y, rx, ry, col[0], 0.75, 1.2)
      softEllipse(cv.g, x + o - 2, y - 1, Math.round(rx * 0.6), Math.max(1, ry - 2), col[1], 0.55, 1.4)
    }
  }
  return cv
}

/** The rows of `src` (drawn at sx, sy) that fall inside the ring r0..r1 round (x, y): a wave of feeling passing. */
function ringSpans(g: G, src: Canvas, sx: number, sy: number, x: number, y: number, r0: number, r1: number) {
  for (let yy = 0; yy < src.height; yy++) {
    const dy = sy + yy + 0.5 - y
    if (Math.abs(dy) >= r1) continue
    const xo = Math.sqrt(r1 * r1 - dy * dy)
    const xi = Math.abs(dy) < r0 ? Math.sqrt(r0 * r0 - dy * dy) : 0
    for (const [a, b] of [
      [x - xo, x - xi],
      [x + xi, x + xo],
    ] as const) {
      const x0 = Math.max(0, Math.round(a))
      const x1 = Math.min(g.canvas.width, Math.round(b))
      if (x1 > x0) g.drawImage(src, x0 - sx, yy, x1 - x0, 1, x0, sy + yy, x1 - x0, 1)
    }
  }
}

export const mespritCinema: Cinema = {
  reveal: M_REVEAL,
  dur: M_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<MS> {
    const L = layout(p)
    const { w, h, cx, hz, feet, wy, m, many, sz } = L
    const sy = Math.round(feet - sz.h * 0.5)
    const joyAt = (t: number) => ease.ioS(span(t, M_GATHER - 0.4, M_REVEAL - 0.2))
    return {
      id: 'cinema-mesprit',
      dur: M_REVEAL + AFTER_REVEAL,
      setup() {
        const r = rng(481)
        const skyA = dGradient(w, hz, ['#14142a', '#24264a', '#3e4270', '#626a94'])
        const skyB = dGradient(w, hz, ['#24142e', '#4e2452', '#9a4a7a', '#f0a0b0'])
        for (const sk of [skyA, skyB])
          for (let i = 0; i < 24; i++) rect(sk.g, r.range(0, w), r.range(0, hz * 0.45), 1, 1, '#c8c8f0')
        const land = canvas(w, hz)
        const lg = land.g
        ridge(lg, w, hz, h * 0.1, '#2a2a4c', null, r)
        ridge(lg, w, hz, h * 0.05, '#1e1e3a', null, r)
        islet(L, lg, '#16142a', '#5a4a7a', null)
        shores(L, r, (x, base, hgt) => roundTree(lg, x, base, hgt, '#120f24', '#2c2648'))
        rect(lg, 0, hz - 1, w, 1, '#3a3660')
        const mh = Math.max(14, Math.round(m * 0.16))
        const banks = [
          [hz - Math.round(mh * 0.75), 5],
          [hz + Math.round((h - hz) * 0.18) - (mh >> 1), -8],
          [hz + Math.round((h - hz) * 0.55) - (mh >> 1), 13],
        ] as const
        return {
          r,
          fx: new Particles(),
          skyA,
          skyB,
          land,
          buf: canvas(w, hz),
          rays: canvas(w, h),
          mist: banks.map(([y, v], i) => ({
            a: mistBank(w, mh + i * 4, SORROW, 4810 + i),
            b: mistBank(w, mh + i * 4, JOY, 4810 + i),
            y,
            v,
          })),
          shakes: p.short
            ? []
            : M_BEATS.filter((b) => b > 3).map((b) => [b, 0.12, 1] as [number, number, number]),
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Each glimpse leaves a little burst of hearts where it was.
        for (const [i, gx, gy, k] of GLIMPSES)
          if (within(t, M_BEATS[i], M_BEATS[i] + dt))
            for (let n = 0; n < 7 * many; n++) {
              const a = r() * Math.PI * 2
              s.fx.add({
                x: cx + gx * w,
                y: hz + gy * (h - hz) - sz.h * k * 0.5,
                vx: Math.cos(a) * r.range(20, 45),
                vy: Math.sin(a) * r.range(20, 45) - 10,
                drag: 3,
                life: r.range(0.5, 0.8),
                shape: r() < 0.6 ? 'heart' : 'star',
                size: 1,
                colors: [...M_AURA.slice(0, 3)],
              })
            }
        // The mist gathered in a whirl to the middle.
        if (t > M_GATHER && t < M_REVEAL && r() < 0.8 * many)
          for (let n = 0; n < 2; n++) {
            const side = r() < 0.5 ? -1 : 1
            const y = hz + r.range(-10, (h - hz) * 0.7)
            s.fx.add({
              x: cx + side * r.range(w * 0.3, w * 0.55),
              y,
              vx: -side * r.range(10, 30),
              vy: side * r.range(40, 70),
              home: { x: cx, y: sy, k: 300 },
              drag: 0.6,
              life: 1.1,
              size: 1,
              shape: 'streak',
              trail: 0.06,
              colors: r() < 0.5 ? [JOY[1], JOY[0]] : [SORROW[1], SORROW[0]],
            })
          }
        if (within(t, M_REVEAL, M_REVEAL + dt)) {
          burst(s.fx, r, cx, sy, 40 * many, M_AURA, 'heart')
          burst(s.fx, r, cx, sy, 30 * many, ['#ffffff', ...JOY])
        }
        // Hearts drifting down after it, already all over the sky when it shows itself.
        const drift = (y: number) =>
          s.fx.add({
            x: r.range(0, w),
            y,
            vx: r.range(-6, 6),
            vy: r.range(12, 22),
            spin: r.range(-2, 2),
            life: 8,
            size: 1,
            shape: 'heart',
            colors: [r() < 0.5 ? '#ffb0d4' : '#ff8ac0'],
          })
        if (within(t, M_REVEAL, M_REVEAL + dt)) for (let n = 0; n < 14 * many; n++) drift(r.range(0, h * 0.8))
        if (t > M_REVEAL && r() < 0.12 * many) drift(-4)
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        const joy = joyAt(t)
        g.fillStyle = '#14142a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // Above the shore, into its buffer (the lake mirrors it): the sky turning rose as joy wins.
        const b = s.buf.g
        b.drawImage(s.skyA, 0, 0)
        dissolve(b, s.skyB, joy)
        b.drawImage(s.land, 0, 0)
        caveLight(
          b,
          L,
          span(t, 0.6, 1.2) * (1 - span(t, M_RISE, M_RISE + 0.5)) * (0.6 + 0.4 * beatK(t)),
          M_AURA[2],
        )
        g.drawImage(s.buf, 0, 0)
        water(
          g,
          s.buf,
          L,
          t,
          1.2,
          joy > 0.5 ? '#2a1a34' : '#1a1a30',
          joy > 0.5 ? '#3a1a3a' : '#22224a',
          joy > 0.5 ? '#ff9ac8' : '#7a86c0',
        )
        // The light under the water where it will come up.
        const under = span(t, M_GATHER, M_RISE)
        if (under > 0) {
          softEllipse(
            g,
            cx,
            wy + 3,
            Math.round(m * 0.2 * under),
            Math.round(m * 0.05 * under) + 1,
            M_AURA[2],
            0.8,
          )
          softEllipse(
            g,
            cx,
            wy + 3,
            Math.round(m * 0.1 * under),
            Math.round(m * 0.025 * under) + 1,
            M_AURA[1],
            0.8,
          )
        }
        ripples(g, L, t, M_RISE - 0.2, '#ffc8e0')
        // The mist: blue, a wave of pink running out through it on each beat; rose for good once joy wins.
        const thin = 1 - 0.7 * span(t, M_GATHER, M_REVEAL)
        for (const bank of s.mist) {
          const off = Math.round((((t * bank.v + 1000 * w) % w) + w) % w)
          if (joy < 1) dissolve(g, bank.a, thin * (1 - joy), -off, bank.y)
          if (joy > 0) dissolve(g, bank.b, thin * joy, -off, bank.y)
          if (thin > 0.5)
            for (const beat of M_BEATS) {
              const rr = (t - beat) * Math.max(w, h) * 0.95
              if (rr <= 0 || rr > Math.max(w, h) * 1.3) continue
              ringSpans(g, bank.b, -off, bank.y, cx, sy, Math.max(0, rr - m * 0.45), rr)
            }
        }
        // Glimpsed in the mist on the beats: there for a moment, flickering, then gone.
        for (const [i, gx, gy, k] of GLIMPSES) {
          const e = t - M_BEATS[i]
          if (e < 0 || e > 0.42) continue
          if (
            [1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][
              Math.floor(e * 60)
            ] !== 1
          )
            continue
          const gyy = Math.round(hz + gy * (h - hz))
          drawSprite(g, L.mon, Math.round(cx + gx * w), gyy, {
            sx: k,
            sy: k,
            tint: { color: '#ffb0d8', a: 0.65 },
            outline: Math.floor(e * 20) % 2 ? '#ffffff' : M_AURA[2],
          })
          if (gy > 0) {
            // Its reflection, upside down under it.
            g.save()
            g.beginPath()
            g.rect(0, gyy + 2, w, h - gyy - 2)
            g.clip()
            g.translate(0, 2 * gyy + 4)
            g.scale(1, -1)
            drawSprite(g, L.mon, Math.round(cx + gx * w), gyy, { sx: k, sy: k, sil: '#7a3a6a' })
            g.restore()
          }
        }
        // Its two tails' ribbons whirling up out of the lake, gathering the mist.
        const hq =
          ease.outC(span(t, M_GATHER, M_RISE + 0.4)) * (1 - ease.inQ(span(t, M_REVEAL - 0.3, M_REVEAL)))
        if (hq > 0) helix(g, cx, wy, Math.round(h * 0.46 * hq), m * 0.26 * (0.4 + 0.6 * hq), t)
        if (t > M_RISE && t < M_REVEAL)
          rise(
            g,
            L,
            span(t, M_RISE, M_REVEAL - 0.1),
            t,
            '#1a1030',
            '#3a1030',
            Math.floor(t * 12) % 3 ? M_AURA[2] : M_AURA[1],
          )
        if (t >= M_REVEAL) {
          const k =
            span(t, M_REVEAL, M_REVEAL + 0.4) * lerp(0.55, 0.22, span(t, M_REVEAL + 0.4, M_REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: sy }, t, M_AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          shown(g, L, t, M_REVEAL, M_AURA)
        }
        for (const [d, c] of [
          [0, M_AURA[0]],
          [0.1, M_AURA[1]],
          [0.22, M_AURA[2]],
        ] as const)
          burstRing(g, cx, sy, span(t, M_REVEAL + d, M_REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, M_REVEAL, M_REVEAL + 0.35))
          screenFlash(g, '#ffe0f0', 0.85 * (1 - span(t, M_REVEAL, M_REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.4, { freq: 700, type: 'lowpass', vol: 0.035 }))],
          ...M_BEATS.map(
            (b, i) =>
              [
                b,
                quiet(() => {
                  fxSound('legend.heart')
                  // Sorrow's note, then joy's: the feeling swinging, then settling on joy.
                  if (i < 8) tone(b > M_GATHER || i % 2 ? 659 : 622, 0.5, { type: 'sine', vol: 0.02 })
                }),
              ] as const,
          ),
          ...GLIMPSES.map(
            ([i]) =>
              [
                M_BEATS[i] + 0.02,
                quiet(() => tone(1760, 0.18, { type: 'triangle', vol: 0.025, slide: 400 })),
              ] as const,
          ),
          [M_GATHER, quiet(() => hiss(1.3, { freq: 400, slide: 1600, vol: 0.05 }))],
          [M_RISE, quiet(() => fxSound('water.charge'))],
          [M_REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          [
            M_REVEAL + 0.05,
            quiet(() =>
              [1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.025, at: i * 0.08 })),
            ),
          ],
        ] satisfies Cue<MS>[]),
    }
  },
}

/** How strongly the last heartbeat is still felt (1 on the beat, gone in a quarter second). */
function beatK(t: number) {
  let k = 0
  for (const b of M_BEATS) if (t >= b) k = Math.max(k, 1 - span(t, b, b + 0.25))
  return k
}

/** Two ribbons winding up round each other out of the water, a red gem at each one's tip (its tails). */
function helix(g: G, x: number, y0: number, hh: number, rad: number, t: number) {
  if (hh < 2) return
  for (const ph of [0, Math.PI]) {
    let tip: [number, number] | null = null
    for (let i = 0; i <= hh; i++) {
      const y = y0 - i
      const k = i / hh
      const a = i * 0.13 - t * 7 + ph
      const rr = rad * (0.35 + 0.65 * Math.sin(k * Math.PI * 0.9 + 0.2))
      const px = Math.round(x + Math.cos(a) * rr)
      const front = Math.sin(a) > 0
      if (front) {
        rect(g, px - 1, y, 3, 1, ph ? '#ffc8e0' : '#ff6ab0')
        rect(g, px, y, 1, 1, '#ffffff')
      } else if (i % 2) rect(g, px, y, 2, 1, ph ? '#8a6a9a' : '#a0407a')
      tip = [px, y]
    }
    if (tip) {
      rect(g, tip[0] - 1, tip[1] - 1, 3, 3, '#c4182a')
      rect(g, tip[0], tip[1] - 1, 1, 1, '#ff8a8a')
    }
  }
}

// ---------------------------------------------------------------- Azelf: Lake Valor

const A_TREMORS = [1.05, 1.45, 1.9] as const
const A_LIFT = 1.5
const A_FLOOD = 2.7
const A_MEET = 3.4
const A_RISE = 3.75
const A_REVEAL = 4.8
const A_AURA = ['#ffffff', '#c8d8ff', '#3a6af0', '#1a2a6a'] as const
/** Its will: blue fire, hottest first. */
const WILL = ['#ffffff', '#c8e0ff', '#7aa8ff', '#3a6af0', '#1a2a8a'] as const

interface Stone {
  x: number
  y: number
  /** Its corners round its middle. */
  pts: [number, number][]
  lift: number
  up: number
  dark: string
  lit: string
}

type AS = {
  r: Rng
  fx: Particles
  back: Canvas
  bed: Canvas
  glowCracks: Canvas
  lit: Canvas
  /** Some of the cracks' pixels, where its will burns up through them. */
  vents: [number, number][]
  buf: Canvas
  rays: Canvas
  stones: Stone[]
  shakes: [number, number, number][]
}

/** A jagged crag on the shore (Valor's lake sits among cliffs): a dark spike, its edge lit by the dusk. */
function crag(g: G, x: number, base: number, hgt: number, r: Rng) {
  const hw = Math.max(3, Math.round(hgt * r.range(0.35, 0.6)))
  const tip = x + r.range(-hw * 0.4, hw * 0.4)
  tri(g, x - hw, base + 1, x + hw, base + 1, tip, base - hgt, '#1c0c16')
  tri(g, x - hw, base + 1, tip, base - hgt, x - hw * 0.3, base + 1, '#4a1e24')
  rect(g, Math.round(tip), base - hgt, 1, 2, '#c8503a')
}

/**
 * The drained lake's bed: cracked mud seen in perspective (cells small and flat far off, big near), each plate its
 * own shade, its upper edge catching the dusk. Returns the mud and its cracks alone (they glow with its will).
 */
function lakebed(w: number, hh: number, cx: number, r: Rng): [Canvas, Canvas, [number, number][]] {
  const S = 22
  const persp = (y: number) => lerp(0.22, 1, y / Math.max(1, hh - 1))
  const Y: number[] = []
  let acc = 0
  for (let y = 0; y < hh; y++) Y.push((acc += 0.5 / persp(y)))
  const seeds = new Map<string, [number, number, number]>()
  const seed = (i: number, j: number) => {
    const k = `${i},${j}`
    let v = seeds.get(k)
    if (!v) seeds.set(k, (v = [(i + 0.15 + r() * 0.7) * S, (j + 0.15 + r() * 0.7) * S, r()]))
    return v
  }
  const near = (X: number, YY: number) => {
    const i0 = Math.floor(X / S)
    const j0 = Math.floor(YY / S)
    let d1 = Infinity
    let d2 = Infinity
    let tone = 0
    for (let i = i0 - 1; i <= i0 + 1; i++)
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const [sx, sy, k] = seed(i, j)
        const d = Math.hypot(sx - X, sy - YY)
        if (d < d1) {
          d2 = d1
          d1 = d
          tone = k
        } else if (d < d2) d2 = d
      }
    return [d2 - d1, tone] as const
  }
  const MUD = ['#6a4634', '#5a3a2c', '#4a2e24', '#3a221a'] as const
  const vents: [number, number][] = []
  const bed = shade(w, hh, (x, y) => {
    const p = persp(y)
    const [e, tone] = near((x - cx) / p, Y[y]!)
    const ew = 1.1 / p
    if (e < ew) {
      if ((x * 7 + y * 13) % 5 === 0) vents.push([x, y])
      return '#1a0e0a'
    }
    if (e < ew * 2.2 && near((x - cx) / p, Y[Math.max(0, y - 1)]!)[0] < ew) return '#8a5a40'
    const base = Math.min(3, Math.floor((y / hh) * 3 + tone * 1.2))
    return bayer(x, y) < 0.2 + tone * 0.2 ? MUD[Math.min(3, base + 1)]! : MUD[base]!
  })
  const cracks = shade(w, hh, (x, y) => {
    const p = persp(y)
    return near((x - cx) / p, Y[y]!)[0] < 1.1 / p ? ((x + y) % 3 ? WILL[3] : WILL[2]) : null
  })
  return [bed, cracks, vents]
}

export const azelfCinema: Cinema = {
  reveal: A_REVEAL,
  dur: A_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<AS> {
    const L = layout(p)
    const { w, h, cx, hz, feet, wy, m, many, sz } = L
    const sy = Math.round(feet - sz.h * 0.5)
    const fill = (t: number) => ease.inQ(span(t, A_FLOOD, A_MEET))
    /** The two walls of water's fronts on a row: they lean, nearer rows ahead, and churn. */
    const fronts = (y: number, t: number) => {
      const q = fill(t)
      const lean = (y - hz) * 0.22 + Math.sin(y * 0.7 + t * 25) * 2
      return [lerp(-20, cx + 4, q) + lean * (1 - q), lerp(w + 20, cx - 4, q) - lean * (1 - q)] as const
    }
    const sunX = Math.round(cx - w * 0.22)
    return {
      id: 'cinema-azelf',
      dur: A_REVEAL + AFTER_REVEAL,
      setup() {
        const r = rng(482)
        const back = canvas(w, hz)
        const bg = back.g
        bg.drawImage(dGradient(w, hz, ['#140a20', '#341430', '#6e2236', '#c64e38']), 0, 0)
        // The sun going down behind the far mountains, red.
        const R = Math.round(m * 0.09)
        bg.drawImage(glow(R * 3, '#ff8a4a', 1.6, 0.5), sunX - R * 3, hz - Math.round(h * 0.07) - R * 3)
        ellipse(bg, sunX, hz - Math.round(h * 0.07), R, R, '#ffb070')
        ellipse(bg, sunX, hz - Math.round(h * 0.07), R - 2, R - 2, '#ffd8a0')
        ridge(bg, w, hz, h * 0.13, '#2e1428', null, r)
        ridge(bg, w, hz, h * 0.06, '#1c0c1a', null, r)
        islet(L, bg, '#1c0e16', '#8a3a34', null)
        shores(L, r, (x, base, hgt) => crag(bg, x, base, Math.round(hgt * 0.8), r))
        rect(bg, 0, hz - 1, w, 1, '#5a2a2a')
        const [bed, glowCracks, vents] = lakebed(w, h - hz, cx, r)
        // The old waterline along the far shore, pale, and puddles left behind.
        rect(bed.g, 0, 0, w, 2, '#9a6a50')
        for (let i = 0; i < Math.max(3, Math.round(w / 50)); i++) {
          const y = r.range(6, h - hz - 8)
          const rx = Math.round(4 + y * 0.18)
          const x = r.range(rx, w - rx)
          if (Math.abs(x - cx) < m * 0.2) continue
          ellipse(bed.g, x, y, rx, Math.max(1, Math.round(rx * 0.25)), '#3a1e30')
          rect(bed.g, x - rx + 2, y - Math.round(rx * 0.25) + 1, rx * 2 - 4, 1, '#c64e38')
        }
        // The stones its will lifts off the bed: nearer ones bigger.
        const stones: Stone[] = []
        const n = Math.round(Math.max(8, w / 26))
        for (let i = 0; i < n; i++) {
          const side = i % 2 ? 1 : -1
          const d = (h - hz) * r.range(0.15, 0.85)
          const k = lerp(0.5, 1.4, d / (h - hz))
          const x = cx + side * r.range(m * 0.14, w * 0.47)
          const rr = Math.round(r.range(4, 7.5) * k * Math.max(1, m / 130))
          const pts = Array.from({ length: 6 }, (_, j) => {
            const a = (j / 6) * Math.PI * 2 + r.range(-0.3, 0.3)
            return [Math.cos(a) * rr * r.range(0.7, 1.1), Math.sin(a) * rr * r.range(0.55, 0.85)] as [
              number,
              number,
            ]
          })
          stones.push({
            x,
            y: hz + d,
            pts,
            lift: A_LIFT + r.range(0, 0.8),
            up: r.range(h * 0.12, h * 0.26),
            dark: r() < 0.5 ? '#5a4640' : '#4e3c36',
            lit: '#b08a74',
          })
        }
        return {
          r,
          fx: new Particles(),
          back,
          bed,
          glowCracks,
          lit: canvas(w, h - hz),
          vents,
          buf: canvas(w, hz),
          rays: canvas(w, h),
          stones,
          shakes: p.short
            ? []
            : [
                ...A_TREMORS.map((at, i) => [at, 0.35, 1 + i] as [number, number, number]),
                [A_MEET, 0.7, 5],
                [A_REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Blue fire of will coming up through the cracks, more as it grows.
        const will = span(t, A_TREMORS[0], A_FLOOD) * (t < A_MEET ? 1 : 0)
        if (will > 0 && s.vents.length)
          for (let i = 0; i < 3; i++)
            if (r() < will * many) {
              const [x, y] = s.vents[Math.floor(r() * s.vents.length)]!
              if (Math.abs(x - cx) > w * (0.15 + will * 0.4)) continue
              s.fx.add({
                x,
                y: y + hz,
                vx: r.range(-4, 4),
                vy: -r.range(14, 34),
                life: r.range(0.35, 0.7),
                size: 2,
                size1: 0,
                shape: 'sq',
                colors: [...WILL],
              })
            }
        // Dust shaken off each stone as it comes up.
        for (const st of s.stones)
          if (within(t, st.lift, st.lift + dt))
            for (let i = 0; i < 6 * many; i++)
              s.fx.add({
                x: st.x + r.range(-4, 4),
                y: st.y,
                vx: r.range(-20, 20),
                vy: -r.range(5, 20),
                ay: 60,
                life: 0.6,
                size: 1,
                shape: 'px',
                colors: ['#8a6a50', '#5a3a2c'],
              })
        // Spray thrown up off the two walls of water as they come in.
        if (t > A_FLOOD && t < A_MEET)
          for (let i = 0; i < 7 * many; i++) {
            const y = hz + r.range(0, h - hz)
            const [a, b] = fronts(y, t)
            const side = r() < 0.5 ? -1 : 1
            s.fx.add({
              x: side < 0 ? a : b,
              y,
              vx: -side * r.range(30, 90),
              vy: -r.range(50, 140),
              ay: 280,
              life: r.range(0.4, 0.8),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#c8e0ff', '#7aa8d8'],
            })
          }
        // They crash together in the middle.
        if (within(t, A_MEET, A_MEET + dt))
          for (let i = 0; i < 160 * many; i++) {
            const a = -Math.PI / 2 + r.range(-1.1, 1.1)
            const v = r.range(80, 280)
            s.fx.add({
              x: cx + r.range(-6, 6),
              y: lerp(hz + 4, h - 4, r() ** 1.5),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 300,
              life: r.range(0.8, 1.5),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#c8e0ff', '#7aa8d8', '#3a5a9a'],
            })
          }
        if (within(t, A_REVEAL, A_REVEAL + dt)) burst(s.fx, r, cx, sy, 60 * many, [...A_AURA, ...WILL])
        if (t > A_REVEAL && t < A_REVEAL + 2 && r() < 0.8 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.4, sz.w * 0.4),
            y: feet - r.range(sz.h * 0.2, sz.h * 0.9),
            vy: -r.range(20, 40),
            life: 0.5,
            size: 2,
            size1: 0,
            shape: 'sq',
            colors: [...WILL],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#140a20'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        const b = s.buf.g
        b.drawImage(s.back, 0, 0)
        caveLight(
          b,
          L,
          span(t, A_TREMORS[0], A_TREMORS[0] + 0.6) * (1 - span(t, A_MEET, A_MEET + 0.4)),
          WILL[2],
        )
        g.drawImage(s.buf, 0, 0)
        // The bed while it lies dry, its cracks lit blue by its will; then the lake coming back over it.
        const full = t >= A_MEET
        if (!full) {
          g.drawImage(s.bed, 0, hz)
          // Lit from the middle outward, a tremor at a time; flickering like a flame.
          const will = span(t, A_TREMORS[0], A_TREMORS[2] + 0.5)
          if (will > 0) {
            const tmp = s.lit.g
            tmp.clearRect(0, 0, w, h - hz)
            const R = w * 0.75
            circleSpans(
              tmp,
              s.glowCracks,
              cx,
              wy - hz,
              ease.outQ(will) * R,
              Math.max(0.45, ((h - wy) * 1.15) / R),
            )
            dissolve(g, s.lit, 0.65 + 0.35 * Math.sin(t * 11), 0, hz)
          }
          magikarp(g, cx + Math.round(w * 0.2), hz + Math.round((h - hz) * 0.55), t)
        }
        const calm = span(t, A_MEET, A_REVEAL + 1)
        water(
          g,
          s.buf,
          L,
          t,
          full ? lerp(3, 1, calm) : 2,
          '#2a1830',
          '#24163a',
          '#e0805a',
          full
            ? undefined
            : (y) => {
                const [a, bb] = fronts(y, t)
                return t < A_FLOOD
                  ? []
                  : [
                      [0, a],
                      [bb, w],
                    ]
              },
        )
        // The walls' fronts: a thick churning lip of foam, white at the edge, breaking up behind it.
        if (t > A_FLOOD && !full) {
          const thick = Math.max(5, Math.round(m * 0.06))
          for (let y = hz; y < h; y++) {
            const [a, bb] = fronts(y, t)
            const fy = Math.floor(t * 30 + y * 0.5)
            const tk = Math.round(thick * (0.6 + 0.6 * ((y - hz) / (h - hz))))
            for (const [x, dir] of [
              [a, -1],
              [bb, 1],
            ] as const) {
              const x0 = Math.round(x)
              rect(g, dir < 0 ? x0 - tk : x0, y, tk, 1, '#a8c8f0')
              g.fillStyle = pattern(g, '#ffffff', 12 - ((fy + y) % 3) * 3)
              g.fillRect(dir < 0 ? x0 - tk : x0, y, tk, 1)
              rect(g, dir < 0 ? x0 - 2 : x0, y, 2, 1, (fy + y) % 4 ? '#ffffff' : '#c8e0ff')
              if ((y + fy) % 3 === 0) rect(g, x0 - dir * (2 + ((fy * 7 + y) % 5)), y, 2, 1, '#ffffff')
            }
          }
        }
        if (full) ripples(g, L, t, A_MEET, '#c8d8ff', 4)
        // The light under the water, and it coming up.
        const under = span(t, A_MEET + 0.1, A_RISE + 0.3)
        if (under > 0 && t < A_REVEAL + 0.3) {
          softEllipse(
            g,
            cx,
            wy + 3,
            Math.round(m * 0.2 * under),
            Math.round(m * 0.05 * under) + 1,
            WILL[3],
            0.85,
          )
          softEllipse(
            g,
            cx,
            wy + 3,
            Math.round(m * 0.1 * under),
            Math.round(m * 0.025 * under) + 1,
            WILL[1],
            0.85,
          )
        }
        // The stones, lifted and held; flung away by the reveal.
        for (const st of s.stones) {
          const q = ease.outC(span(t, st.lift, st.lift + 1.1))
          if (q <= 0) {
            stone(g, st, st.x, st.y, null)
            continue
          }
          let x = st.x
          let y = st.y - st.up * q + Math.sin(t * 2.4 + st.x) * 2 * q
          const e = t - A_REVEAL
          if (e > 0) {
            const dir = Math.sign(st.x - cx) || 1
            x += dir * 220 * e
            y += -90 * e + 260 * e * e
          }
          if (y < h + 10 && x > -20 && x < w + 20)
            stone(g, st, Math.round(x), Math.round(y), WILL[Math.floor(t * 10 + st.x) % 2 ? 2 : 1]!)
        }
        if (t > A_RISE && t < A_REVEAL)
          rise(
            g,
            L,
            span(t, A_RISE, A_REVEAL - 0.1),
            t,
            '#0a1030',
            '#0e1430',
            Math.floor(t * 12) % 3 ? WILL[2] : WILL[1],
          )
        if (t >= A_REVEAL) {
          const k =
            span(t, A_REVEAL, A_REVEAL + 0.4) * lerp(0.55, 0.22, span(t, A_REVEAL + 0.4, A_REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: sy }, t, A_AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          shown(g, L, t, A_REVEAL, A_AURA)
        }
        for (const [d, c] of [
          [0, A_AURA[0]],
          [0.1, A_AURA[1]],
          [0.22, A_AURA[2]],
        ] as const)
          burstRing(g, cx, sy, span(t, A_REVEAL + d, A_REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, A_MEET, A_MEET + 0.2))
          screenFlash(g, '#e0ecff', 0.5 * (1 - span(t, A_MEET, A_MEET + 0.2)))
        if (within(t, A_REVEAL, A_REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, A_REVEAL, A_REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.8, { freq: 900, type: 'lowpass', vol: 0.03 }))],
          ...A_TREMORS.map(
            (at, i) =>
              [
                at,
                quiet(
                  () => (
                    hiss(0.5, { freq: 120, type: 'lowpass', vol: 0.08 + i * 0.03 }),
                    fxSound('legend.pulse')
                  ),
                ),
              ] as const,
          ),
          [A_LIFT, quiet(() => tone(196, 1.2, { type: 'sine', vol: 0.04, slide: 200 }))],
          [A_LIFT + 0.4, quiet(() => tone(294, 1, { type: 'sine', vol: 0.03, slide: 150 }))],
          [
            A_FLOOD,
            quiet(
              () => (fxSound('water.jet'), hiss(0.8, { freq: 300, slide: 900, type: 'lowpass', vol: 0.1 })),
            ),
          ],
          [
            A_MEET,
            quiet(() => (hiss(1, { freq: 250, type: 'lowpass', vol: 0.16 }), fxSound('legend.pulse'))),
          ],
          [A_RISE, quiet(() => fxSound('legend.heart'))],
          [A_RISE + 0.35, quiet(() => fxSound('legend.heart'))],
          [A_REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<AS>[]),
    }
  },
}

/** A stone off the lake's bed, its edge blue while its will holds it. */
function stone(g: G, st: Stone, x: number, y: number, edge: string | null) {
  const n = st.pts.length
  const fan = (dx: number, dy: number, c: string) => {
    for (let j = 0; j < n; j++) {
      const a = st.pts[j]!
      const b = st.pts[(j + 1) % n]!
      tri(g, x + dx, y + dy, x + a[0] + dx, y + a[1] + dy, x + b[0] + dx, y + b[1] + dy, c)
    }
  }
  if (edge)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      fan(dx, dy, edge)
  // Lit along its top, the dusk on it.
  fan(0, -1, st.lit)
  fan(0, 0, st.dark)
}

/** A Magikarp left flopping on the dry bed: a jump every so often. */
function magikarp(g: G, x: number, y: number, t: number) {
  const f = (t * 1.6) % 1
  const up = f < 0.3 ? Math.round(Math.sin((f / 0.3) * Math.PI) * 4) : 0
  const flip = Math.floor(t * 1.6) % 2 ? 1 : -1
  rect(g, x - 3, y + 1, 7, 1, '#3a1e14')
  rect(g, x - 2, y - 2 - up, 5, 2, '#f07a3a')
  rect(g, x - 1, y - 3 - up, 3, 1, '#ffb070')
  rect(g, x + flip * 3, y - 3 - up, 1, 3, '#e0503a')
  rect(g, x - flip * 2, y - 2 - up, 1, 1, '#ffffff')
}
