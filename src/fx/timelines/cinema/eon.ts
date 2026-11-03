// The eon pair's raid entrances (docs/53): Southern Island on the open sea, its great tree on the horizon. Each has its
// own hour and its own trick.
//
// Latias, at sunset: gulls, the sun sinking red into a glittering sea. Something unseen skims the water: a V of foam
// races across the sea with nothing at its head, only the sky bending in a shape above it (its glass-like down
// refracting the light). It swings up into the sky and crosses the sun, the sun's disc warping round an invisible
// body, a trail of glitter and white down behind it; then it swoops down at you through a pink mist, and the shimmer
// peels away into its colours. A ball of mist gathers at its heart and bursts on the reveal.
//
// Latios, at night: a calm sea under the moon. A blue streak tears across the stars, faster than a jet, and the sound
// catches up with a boom; a second pass low over the water throws up a line of spray. It climbs to the moon and
// crosses its disc in silhouette, tips over and falls like a shooting star into the sea far away, then comes skimming
// straight at you, walls of spray thrown up either side. It pulls up, turns invisible for a breath, and the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

interface Look {
  sky: readonly string[]
  sea: readonly string[]
  /** The sun or the moon: where (fractions of the screen), how big (of its short side), its colours. */
  light: { kx: number; ky: number; r: number; disc: string; core: string; halo: string }
  isle: string
  rim: string
  clouds: readonly [string, string]
  /** The light's road on the water, and the wavelets. */
  road: readonly [string, string]
  waves: string
  stars: number
}

const DUSK: Look = {
  sky: ['#2a1440', '#6a2a5a', '#c04a5a', '#f08a5a', '#ffc070'],
  sea: ['#8a3a4a', '#5a2440', '#3a1834', '#200c22'],
  light: { kx: 0.66, ky: 0, r: 0.13, disc: '#ffd08a', core: '#fff4c8', halo: '#ff9a5a' },
  isle: '#2a1028',
  rim: '#ff8a5a',
  clouds: ['#7a2a50', '#ffb07a'],
  road: ['#ffe0a0', '#ff9a5a'],
  waves: '#b0506a',
  stars: 6,
}

const NIGHT: Look = {
  sky: ['#02040e', '#06102a', '#0c1c44', '#16305a'],
  sea: ['#0e2244', '#0a1832', '#061024', '#030814'],
  light: { kx: 0.7, ky: 0.2, r: 0.075, disc: '#f0f6ff', core: '#ffffff', halo: '#8ab0e0' },
  isle: '#040814',
  rim: '#5a7ab0',
  clouds: ['#0a1430', '#3a5a8a'],
  road: ['#c8e0ff', '#5a7aa8'],
  waves: '#2a4a78',
  stars: 70,
}

interface World {
  w: number
  h: number
  cx: number
  horizon: number
  feet: number
  sun: { x: number; y: number; r: number }
}

function world(w: number, h: number, L: Look): World {
  const horizon = Math.round(h * 0.5)
  const m = Math.min(w, h)
  return {
    w,
    h,
    cx: Math.round(w / 2),
    horizon,
    feet: Math.round(h * 0.6),
    sun: {
      x: Math.round(w * L.light.kx),
      y: L.light.ky ? Math.round(h * L.light.ky) : horizon - Math.round(m * L.light.r * 0.35),
      r: Math.max(6, Math.round(m * L.light.r)),
    },
  }
}

/** The still picture: the sky, its stars, the sun or moon, the clouds, Southern Island, the sea. */
function scenery(W: World, L: Look, seed: number): Canvas {
  const { w, h, horizon, sun } = W
  const r = rng(seed)
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, horizon, L.sky, 4), 0, 0)
  for (let i = 0; i < L.stars; i++)
    rect(g, r.range(0, w), r.range(0, horizon * 0.75), 1, 1, r() < 0.2 ? '#ffffff' : '#6a88b8')
  // The light, its halo, its disc (the sun half sunk in the sea).
  const hr = Math.round(sun.r * 2.4)
  g.drawImage(glow(hr, L.light.halo, 1.6, 0.6), sun.x - hr, sun.y - hr)
  ellipse(g, sun.x, sun.y, sun.r, sun.r, L.light.disc)
  ellipse(g, sun.x - 1, sun.y - 1, Math.round(sun.r * 0.7), Math.round(sun.r * 0.7), L.light.core)
  if (!L.light.ky) {
    // Bands of haze across the setting sun.
    for (const dy of [-0.35, 0.05, 0.4])
      rect(g, sun.x - sun.r - 2, sun.y + Math.round(sun.r * dy), sun.r * 2 + 4, 1, L.sky[3]!)
  } else {
    ellipse(g, sun.x + 2, sun.y - 1, 2, 2, '#d0e0f4')
    ellipse(g, sun.x - 2, sun.y + 2, 1, 1, '#d0e0f4')
  }
  // Long clouds lying over the horizon, lit on the side facing the light.
  for (let i = 0; i < 9; i++) {
    const cx = r.range(-20, w + 20)
    const cy = r.range(horizon * 0.25, horizon - 10)
    const rx = r.range(18, 42)
    ellipse(g, cx, cy, rx, 3, L.clouds[0])
    rect(g, cx - rx * 0.6, cy - 3, rx * 1.1, 1, cx < sun.x ? L.clouds[1] : L.clouds[0])
    if (Math.abs(cx - sun.x) < rx + sun.r) rect(g, cx - rx * 0.4, cy + 2, rx * 0.8, 1, L.clouds[1])
  }
  // Southern Island: a low hump with its great tree, palms either side, black against the light, rim-lit.
  const ix = Math.round(w * 0.24)
  const iw = Math.round(Math.min(w * 0.5, 110))
  const ih = Math.max(6, Math.round(h * 0.035))
  ellipse(g, ix, horizon, iw >> 1, ih, L.isle)
  const tx = ix + 4
  const th = Math.round(Math.max(18, h * 0.09))
  rect(g, tx - 2, horizon - ih - th + 6, 4, th, L.isle)
  for (const [dx, dy, rx, ry] of [
    [0, -th - ih + 2, 15, 7],
    [-10, -th - ih + 7, 10, 5],
    [10, -th - ih + 6, 11, 5],
    [-3, -th - ih - 3, 9, 5],
  ] as const) {
    ellipse(g, tx + dx, horizon + dy, rx, ry, L.isle)
    rect(g, tx + dx - rx * 0.5, horizon + dy - ry, rx, 1, L.rim)
  }
  for (const [px, lean] of [
    [ix - (iw >> 2), -1],
    [ix + (iw >> 2) + 6, 1],
  ] as const) {
    line(g, px, horizon - ih + 2, px + lean * 3, horizon - ih - 12, L.isle, 2)
    for (const a of [-2.6, -2, -1.1, -0.5]) {
      const ex = px + lean * 3 + Math.cos(a) * 8
      const ey = horizon - ih - 12 - Math.sin(-a) * 3 + 3
      line(g, px + lean * 3, horizon - ih - 12, ex, ey, L.isle)
    }
  }
  rect(g, ix - (iw >> 1) + 4, horizon - 1, iw - 8, 1, L.rim)
  // The sea.
  g.drawImage(dGradient(w, h - horizon, L.sea, 4), 0, horizon)
  rect(g, 0, horizon, w, 1, L.road[1])
  return cv
}

/** The sea alive: wavelets drifting, the light's road glittering under it. */
function drawSea(g: G, W: World, L: Look, t: number, calm = 1) {
  const { w, h, horizon, sun } = W
  for (let row = 0; row < 14; row++) {
    const y = horizon + 2 + Math.round((row / 14) ** 1.5 * (h - horizon - 2))
    const len = 3 + row
    for (let x = (row * 17 + Math.round(t * (6 + row))) % (len * 3); x < w; x += len * 3)
      rect(g, x, y + Math.round(Math.sin(x / 9 + t * 2 + row) * calm), len, 1, L.waves)
  }
  // The road: glints scattered at random in a band widening towards you, each on for a moment.
  const tick = Math.floor(t * 5)
  for (let y = horizon + 1; y < h; y += 2) {
    const d = (y - horizon) / (h - horizon)
    const half = Math.round(sun.r * (0.5 + d * 1.2))
    for (let x = sun.x - half; x < sun.x + half; x += 2) {
      const n = hash(x, y, tick)
      // Thick in the middle of the road, thinning to its edges.
      if (n > 0.55 - Math.abs(x - sun.x) / half / 2.2) continue
      rect(g, x, y, n < 0.12 ? 4 : 2, 1, n < 0.2 ? L.road[0] : L.road[1])
    }
  }
}

let shimTmp: Canvas | null = null
let edgeTmp: Canvas | null = null
/**
 * The invisible eon: the scenery behind it bent through its glass-like down, in its shape, at scale `sc`, its edge
 * catching the light here and there.
 */
function shimmer(g: G, bg: Canvas, mon: string, x: number, y: number, sc: number, t: number, edge: string) {
  const f = spriteFrame(mon)
  const sil = silhouette(mon, '#ffffff')
  if (!f || !sil) return
  const sw = Math.max(2, Math.round(f.width * sc))
  const sh = Math.max(2, Math.round(f.height * sc))
  const x0 = Math.round(x - sw / 2)
  const y0 = Math.round(y - sh)
  shimTmp ??= canvas(170, 170)
  edgeTmp ??= canvas(170, 170)
  const c = shimTmp.g
  c.globalCompositeOperation = 'source-over'
  c.clearRect(0, 0, sw + 2, sh + 2)
  for (let row = 0; row < sh; row++) {
    const off = Math.round(Math.sin(row / 3 + t * 14) * 3) + 5
    c.drawImage(bg, x0 + off, y0 + row - 6, sw, 1, 0, row, sw, 1)
  }
  c.globalCompositeOperation = 'destination-in'
  c.drawImage(sil, 0, 0, sw, sh)
  // A faint glassiness over the whole shape.
  c.globalCompositeOperation = 'source-atop'
  c.fillStyle = pattern(c, edge, 2)
  c.fillRect(0, 0, sw, sh)
  c.globalCompositeOperation = 'source-over'
  g.drawImage(shimTmp, 0, 0, sw, sh, x0, y0, sw, sh)
  // The edge: the shape's outline, a few of its pixels lit each frame.
  const e = edgeTmp.g
  e.globalCompositeOperation = 'source-over'
  e.clearRect(0, 0, sw + 2, sh + 2)
  const ol = silhouette(mon, edge)!
  for (const [ox, oy] of [
    [0, 1],
    [2, 1],
    [1, 0],
    [1, 2],
  ] as const)
    e.drawImage(ol, ox, oy, sw, sh)
  e.globalCompositeOperation = 'destination-out'
  e.drawImage(sil, 1, 1, sw, sh)
  e.globalCompositeOperation = 'source-over'
  dissolve(g, edgeTmp, 0.55 + 0.25 * Math.sin(t * 20), x0 - 1, y0 - 1)
}

let spTmp: Canvas | null = null
/** The eon in its colours at a scale, dissolving in through ordered dither (k 0..1). */
function appear(g: G, mon: string, x: number, y: number, sc: number, k: number, outline?: string) {
  spTmp ??= canvas(170, 170)
  spTmp.g.clearRect(0, 0, 170, 170)
  const s = spriteSize(mon)
  drawSprite(spTmp.g, mon, 85, Math.min(168, Math.round(s.h * sc) + 2), { sx: sc, sy: sc, outline })
  dissolve(g, spTmp, k, Math.round(x - 85), Math.round(y - Math.min(168, Math.round(s.h * sc) + 2)))
}

/** A reflection on the water under the hovering legend: its rows, upside down, every other one, wobbling. */
function reflect(g: G, mon: string, x: number, y: number, t: number, gap: number) {
  const f = spriteFrame(mon)
  if (!f) return
  const x0 = Math.round(x - f.width / 2)
  // Squashed, broken into lines by the swell, thinning out the further down it goes.
  for (let row = 0, i = 0; row < f.height * 0.7; row += i < 6 ? 2 : 3, i++) {
    const off = Math.round(Math.sin(row / 4 + t * 5) * 2)
    const sy = f.height - 1 - row
    g.drawImage(f, 0, sy, f.width, 1, x0 + off, y + gap + Math.round(row * 0.5), f.width, 1)
  }
}

/** A steady pseudo-random number for a pixel and a moment (glints that don't crawl in diagonal stripes). */
const hash = (x: number, y: number, k: number) => {
  let n = (x * 374761393 + y * 668265263 + k * 1442695041) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const quad = (a: [number, number], c: [number, number], b: [number, number], q: number): [number, number] => [
  lerp(lerp(a[0], c[0], q), lerp(c[0], b[0], q), q),
  lerp(lerp(a[1], c[1], q), lerp(c[1], b[1], q), q),
]

// ---------------------------------------------------------------- Latias

const LA = {
  WAKE: 0.95,
  WAKE_END: 2.35,
  SKY: 2.35,
  DIVE: 3.25,
  HOVER: 4.0,
  REVEAL: 4.6,
} as const
const LA_AURA = ['#ffffff', '#ffd0d8', '#e05a6a', '#7a1f2a'] as const

type LS = {
  r: Rng
  fx: Particles
  mist: Particles
  bg: Canvas
  rays: Canvas
  wake: { x: number; y: number; t: number }[]
  shakes: [number, number, number][]
}

export const latiasCinema: Cinema = {
  reveal: LA.REVEAL,
  dur: LA.REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<LS> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const W = world(w, h, DUSK)
    const { cx, horizon, feet, sun } = W
    const sz = spriteSize(p.mon)
    const mid = feet - Math.round(sz.h / 2)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const R = LA.REVEAL
    const DUR = R + AFTER_REVEAL
    // Its way: over the water left to right; up across the sun; down at you.
    const wakeAt = (t: number): [number, number] => {
      const q = ease.ioS(span(t, LA.WAKE, LA.WAKE_END))
      return [lerp(-w * 0.15, w * 1.15, q), feet + Math.round((h - feet) * 0.2) + Math.sin(q * 6) * 2]
    }
    const A: [number, number] = [w * 1.1, horizon - 4]
    const B: [number, number] = [w * 0.16, h * 0.12]
    const C: [number, number] = [2 * sun.x - (A[0] + B[0]) / 2, 2 * (sun.y - 4) - (A[1] + B[1]) / 2]
    const skyAt = (t: number) => quad(A, C, B, ease.ioQ(span(t, LA.SKY, LA.DIVE)))
    // When it passes in front of the sun's middle.
    const T_SUN = (LA.SKY + LA.DIVE) / 2
    const diveAt = (t: number) =>
      quad(B, [w * 0.02, feet - 6], [cx, feet], ease.outQ(span(t, LA.DIVE, LA.HOVER)))
    return {
      id: 'cinema-latias',
      dur: DUR,
      setup() {
        return {
          r: rng(380),
          fx: new Particles(),
          mist: new Particles(),
          bg: scenery(W, DUSK, 380),
          rays: canvas(w, h),
          wake: [],
          shakes: p.short ? [] : [[R, 0.5, 3]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.mist.update(dt)
        // The wake: foam where its head passes, spray thrown up behind it.
        if (within(t, LA.WAKE, LA.WAKE_END)) {
          const [x, y] = wakeAt(t)
          s.wake.push({ x, y, t })
          if (r() < 0.9 * many)
            for (let i = 0; i < 3; i++)
              s.fx.add({
                x: x - r.range(0, 6),
                y,
                vx: -r.range(10, 60),
                vy: -r.range(20, 70),
                ay: 220,
                life: r.range(0.4, 0.8),
                size: 1,
                shape: r() < 0.5 ? 'drop' : 'px',
                colors: ['#ffffff', '#ffe0d0', '#f0a0a0'],
              })
        }
        // Glitter and white down behind it in the sky and on its dive.
        if (t > LA.SKY && t < LA.HOVER && r() < 0.9 * many) {
          const [x, y] = t < LA.DIVE ? skyAt(t) : diveAt(t)
          const sc = t < LA.DIVE ? 0.6 : lerp(0.6, 1, span(t, LA.DIVE, LA.HOVER))
          s.fx.add({
            x: x + r.range(-6, 6) * sc,
            y: y - sz.h * sc * 0.5 + r.range(-6, 6) * sc,
            vx: r.range(-8, 8),
            vy: r.range(-4, 10),
            life: r.range(0.6, 1.2),
            size: r.int(1, 2),
            shape: r() < 0.6 ? 'star' : 'px',
            colors: ['#ffffff', '#ffd0d8', '#e05a6a'],
          })
          if (r() < 0.25)
            s.fx.add({
              x: x + r.range(-10, 10),
              y: y - sz.h * sc * 0.4,
              vx: r.range(-10, 10),
              vy: r.range(6, 14),
              life: 3,
              size: 2,
              shape: 'leaf',
              spin: r.range(-4, 4),
              colors: ['#ffffff'],
              light: '#ffffff',
              dark: '#ffd0d8',
            })
        }
        // The mist it brings, rolling round where it will hover.
        if (t > LA.DIVE + 0.3 && t < R + 1.2 && r() < 0.7 * many) {
          const a = r() * Math.PI * 2
          const d = r.range(sz.w * 0.4, sz.w * 0.9)
          s.mist.add({
            x: cx + Math.cos(a) * d,
            y: mid + Math.sin(a) * d * 0.5,
            vx: -Math.sin(a) * 30,
            vy: Math.cos(a) * 12,
            drag: 0.5,
            life: r.range(0.8, 1.4),
            size: r.int(2, 4),
            shape: 'smoke',
            colors: ['#ffe8ee', '#ffd0d8', '#f0a0b0'],
            density: 0.5,
          })
        }
        if (within(t, R, R + dt)) {
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(50, 170)
            s.mist.add({
              x: cx,
              y: mid,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.2,
              life: r.range(0.8, 1.4),
              size: r.int(2, 5),
              shape: 'smoke',
              colors: ['#ffffff', '#ffd0d8', '#f0a0b0'],
              density: 0.6,
            })
          }
          for (let k = 0; k < 24 * many; k++)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
              y: mid + r.range(-sz.h * 0.4, sz.h * 0.4),
              vx: r.range(-40, 40),
              vy: r.range(-60, 0),
              ay: 30,
              drag: 1,
              life: 2.5,
              size: 2,
              shape: 'leaf',
              spin: r.range(-5, 5),
              colors: ['#ffffff'],
              light: '#ffffff',
              dark: '#ffd0d8',
            })
        }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = DUSK.sky[0]!
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        drawSea(g, W, DUSK, t)
        // Gulls far off, gliding.
        for (let i = 0; i < 3; i++) {
          const gx = ((t * (8 + i * 3) + i * 70) % (w + 40)) - 20
          const gy = Math.round(h * (0.16 + i * 0.07) + Math.sin(t * 2 + i) * 2)
          const flap = Math.floor(t * 4 + i) % 2
          line(g, gx - 3, gy - flap, gx, gy, '#3a1430')
          line(g, gx, gy, gx + 3, gy - flap, '#3a1430')
        }
        // The wake: two lines of foam opening behind a head nobody can see.
        for (const pt of s.wake) {
          const a = t - pt.t
          if (a > 1.6) continue
          const spread = Math.round(a * 40 + 1)
          const c = a < 0.35 ? '#ffffff' : a < 0.8 ? '#ffd0c0' : DUSK.waves
          const th = a < 0.5 ? 2 : 1
          rect(g, pt.x, pt.y - Math.round(spread * 0.3), 3, th, c)
          rect(g, pt.x, pt.y + Math.round(spread * 0.6), 3, th, c)
          if (a < 0.2) rect(g, pt.x, pt.y - 1, 3, 3, '#ffffff')
        }
        if (within(t, LA.WAKE, LA.WAKE_END)) {
          const [x, y] = wakeAt(t)
          shimmer(g, s.bg, p.mon, x, y - 3, 0.75, t, '#ffffff')
        }
        // Across the sun: the disc bending round it, a star of light flaring off it.
        if (within(t, LA.SKY, LA.DIVE)) {
          const [x, y] = skyAt(t)
          shimmer(g, s.bg, p.mon, x, y + sz.h * 0.3, 0.6, t, '#fff4c8')
          const fl = 1 - Math.abs(t - T_SUN) / 0.3
          if (fl > 0) {
            const L2 = Math.round(sun.r * 2.5 * fl)
            rect(g, sun.x - L2, sun.y, L2 * 2 + 1, 1, '#ffffff')
            rect(g, sun.x, sun.y - L2, 1, L2 * 2 + 1, '#ffffff')
            line(g, sun.x - L2 * 0.5, sun.y - L2 * 0.5, sun.x + L2 * 0.5, sun.y + L2 * 0.5, '#fff4c8')
            line(g, sun.x - L2 * 0.5, sun.y + L2 * 0.5, sun.x + L2 * 0.5, sun.y - L2 * 0.5, '#fff4c8')
          }
        }
        // Down at you: the shimmer giving way to its colours.
        if (within(t, LA.DIVE, R)) {
          const [x, y] = diveAt(t)
          const sc = lerp(0.6, 1, ease.outQ(span(t, LA.DIVE, LA.HOVER)))
          const bob = t > LA.HOVER ? Math.round(Math.sin((t - LA.HOVER) * 4) * 1.5) : 0
          const k = span(t, LA.DIVE + 0.25, LA.HOVER + 0.1)
          if (k < 1) shimmer(g, s.bg, p.mon, x, y + bob, sc, t, '#ffffff')
          if (k > 0)
            appear(
              g,
              p.mon,
              x,
              y + bob,
              sc,
              k * 0.9,
              t > LA.HOVER && Math.floor(t * 12) % 2 ? LA_AURA[1] : undefined,
            )
        }
        s.mist.draw(g)
        // The mist ball gathering at its heart, a light growing.
        if (within(t, LA.HOVER, R)) {
          const q = span(t, LA.HOVER, R)
          const gr = Math.round(6 + q * 16)
          g.drawImage(glow(gr, '#ffd0d8', 1.2, 0.8), cx - gr, mid - gr)
          const br = Math.round(3 + q * 6)
          ellipse(g, cx, mid, br, br, '#ffffff')
          for (let i = 0; i < 3; i++) {
            const a = t * 9 + (i * Math.PI * 2) / 3
            rect(g, cx + Math.cos(a) * (br + 5), mid + Math.sin(a) * (br + 5) * 0.6, 2, 2, '#ffd0d8')
          }
        }
        if (t >= R) {
          const k = span(t, R, R + 0.4) * lerp(0.55, 0.25, span(t, R + 0.4, R + 1.4))
          drawRays(s.rays, { x: cx, y: mid }, t, LA_AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - R) * 2) * 2)
          reflect(g, p.mon, cx, feet + bob, t, Math.max(4, horizon + (feet - horizon) - feet + 10))
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
            outline: Math.floor(t * 8) % 2 ? LA_AURA[1] : LA_AURA[2],
          })
        }
        for (const [d, c] of [
          [0, LA_AURA[0]],
          [0.1, LA_AURA[1]],
          [0.22, LA_AURA[2]],
        ] as const)
          burstRing(g, cx, mid, span(t, R + d, R + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        // The sun's glare as it crosses it, for an instant.
        if (within(t, T_SUN, T_SUN + 0.15))
          screenFlash(g, '#fff4c8', 0.35 * (1 - span(t, T_SUN, T_SUN + 0.15)))
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.9 * (1 - span(t, R, R + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.4, { freq: 500, type: 'lowpass', vol: 0.05 }))],
          [0.3, quiet(() => tone(1568, 0.12, { type: 'triangle', vol: 0.015, slide: -300 }))],
          [0.55, quiet(() => tone(1397, 0.12, { type: 'triangle', vol: 0.015, slide: -300 }))],
          [LA.WAKE, quiet(() => hiss(1.4, { freq: 900, slide: 1200, vol: 0.06 }))],
          [LA.WAKE + 0.4, quiet(() => tone(1319, 0.5, { type: 'sine', vol: 0.02, slide: 400 }))],
          [LA.SKY, quiet(() => hiss(0.9, { freq: 2400, slide: -1200, vol: 0.04 }))],
          ...[0, 0.15, 0.3, 0.45].map(
            (d, i) =>
              [
                LA.SKY + 0.3 + d,
                quiet(() => tone(2093 + i * 262, 0.2, { type: 'triangle', vol: 0.016 })),
              ] as const,
          ),
          [LA.DIVE, quiet(() => tone(880, 0.7, { type: 'sine', vol: 0.03, slide: 660 }))],
          [LA.DIVE + 0.05, quiet(() => hiss(0.8, { freq: 1500, slide: -900, vol: 0.06 }))],
          [LA.HOVER, quiet(() => fxSound('psychic.focus'))],
          [LA.HOVER + 0.3, quiet(() => fxSound('legend.heart'))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<LS>[]),
    }
  },
}

// ---------------------------------------------------------------- Latios

const LO = {
  STREAK: 0.7,
  BOOM: 0.9,
  LOW: 1.45,
  CLIMB: 1.95,
  MOON: 2.45,
  DIVE: 2.95,
  SPLASH: 3.3,
  NEAR: 4.05,
  REVEAL: 4.5,
} as const
const LO_AURA = ['#ffffff', '#c8d8ff', '#5a7ae0', '#1f2a6a'] as const

type OS = {
  r: Rng
  fx: Particles
  spray: Particles
  bg: Canvas
  rays: Canvas
  trail: { x: number; y: number; t: number }[]
  shakes: [number, number, number][]
}

export const latiosCinema: Cinema = {
  reveal: LO.REVEAL,
  dur: LO.REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<OS> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const W = world(w, h, NIGHT)
    const { cx, horizon, feet, sun: moon } = W
    const sz = spriteSize(p.mon)
    const mid = feet - Math.round(sz.h / 2)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const R = LO.REVEAL
    const DUR = R + AFTER_REVEAL
    const far: [number, number] = [cx, horizon + 3]
    /** Its head, wherever it is: the passes, the climb, across the moon, the fall, the skim at you. */
    const headAt = (t: number): [number, number] | null => {
      if (within(t, LO.STREAK, LO.STREAK + 0.4))
        return [lerp(w * 1.15, -w * 0.15, span(t, LO.STREAK, LO.STREAK + 0.4)), Math.round(h * 0.17)]
      if (within(t, LO.LOW, LO.LOW + 0.35))
        return [
          lerp(-w * 0.15, w * 1.15, span(t, LO.LOW, LO.LOW + 0.35)),
          horizon + Math.round((feet - horizon) * 0.4),
        ]
      if (within(t, LO.CLIMB, LO.MOON))
        return quad(
          [w * 0.9, horizon],
          [w * 1.0, moon.y + 30],
          [moon.x - moon.r - 10, moon.y],
          ease.ioQ(span(t, LO.CLIMB, LO.MOON)),
        )
      if (within(t, LO.MOON, LO.DIVE))
        return [
          lerp(moon.x - moon.r - 10, moon.x + moon.r + 10, span(t, LO.MOON, LO.DIVE)),
          moon.y + Math.round(sz.h * 0.18),
        ]
      if (within(t, LO.DIVE, LO.SPLASH)) {
        const q = ease.inQ(span(t, LO.DIVE, LO.SPLASH))
        return [lerp(moon.x + moon.r + 10, far[0], q), lerp(moon.y, far[1], q)]
      }
      return null
    }
    const skimAt = (t: number) => {
      const q = ease.outQ(span(t, LO.SPLASH, LO.NEAR))
      return { x: cx, y: Math.round(lerp(far[1], feet, q)), sc: lerp(0.2, 1, q) }
    }
    return {
      id: 'cinema-latios',
      dur: DUR,
      setup() {
        return {
          r: rng(381),
          fx: new Particles(),
          spray: new Particles(),
          bg: scenery(W, NIGHT, 381),
          rays: canvas(w, h),
          trail: [],
          shakes: p.short
            ? []
            : [
                [LO.BOOM, 0.4, 2],
                [LO.SPLASH, 0.3, 1],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.spray.update(dt)
        const head = headAt(t)
        if (head) s.trail.push({ x: head[0], y: head[1], t })
        // The low pass: a line of spray thrown up under it.
        if (head && within(t, LO.LOW, LO.LOW + 0.35))
          for (let i = 0; i < 4 * many + 1; i++)
            s.spray.add({
              x: head[0] - r.range(0, 10),
              y: head[1] + 3,
              vx: -r.range(10, 50),
              vy: -r.range(30, 90),
              ay: 240,
              life: r.range(0.5, 0.9),
              size: 1,
              shape: r() < 0.5 ? 'drop' : 'px',
              colors: ['#ffffff', '#c8e0ff', '#5a7aa8'],
            })
        if (within(t, LO.SPLASH, LO.SPLASH + dt))
          for (let i = 0; i < 30 * many; i++)
            s.spray.add({
              x: far[0] + r.range(-4, 4),
              y: far[1],
              vx: r.range(-30, 30),
              vy: -r.range(20, 70),
              ay: 200,
              life: r.range(0.4, 0.8),
              size: 1,
              shape: 'px',
              colors: ['#ffffff', '#c8e0ff'],
            })
        // The skim: walls of spray thrown up either side of it, as big as it is near.
        if (within(t, LO.SPLASH, LO.NEAR + 0.15)) {
          const k = skimAt(t)
          for (let i = 0; i < 6 * many + 1; i++) {
            const side = r() < 0.5 ? -1 : 1
            s.spray.add({
              x: k.x + side * (sz.w * 0.3 * k.sc + r.range(0, 4)),
              y: k.y + 2,
              vx: side * r.range(20, 70) * k.sc,
              vy: -r.range(40, 130) * k.sc,
              ay: 260,
              life: r.range(0.5, 1),
              size: k.sc > 0.6 ? r.int(1, 2) : 1,
              shape: r() < 0.6 ? 'drop' : 'sq',
              colors: ['#ffffff', '#e0f0ff', '#8ab0e0', '#3a6aa8'],
            })
          }
        }
        // Its own light, stars round it as it hovers unseen, then the reveal.
        if (t > LO.NEAR && t < R && r() < 0.6 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.6, sz.w * 0.6),
            y: mid + r.range(-sz.h * 0.5, sz.h * 0.5),
            vy: -r.range(4, 12),
            life: 0.6,
            size: r.int(1, 2),
            shape: 'star',
            colors: ['#ffffff', '#c8d8ff', '#5a7ae0'],
          })
        if (within(t, R, R + dt))
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: mid,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...LO_AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = NIGHT.sky[0]!
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // Stars twinkling; the boom ripples them.
        for (let i = 0; i < 12; i++) {
          if ((Math.floor(t * 3) + i) % 4) continue
          const sx = (i * 67) % w
          const sy = (i * 29) % Math.round(horizon * 0.7)
          rect(g, sx - 1, sy, 3, 1, '#ffffff')
          rect(g, sx, sy - 1, 1, 3, '#ffffff')
        }
        drawSea(g, W, NIGHT, t, t > LO.LOW && t < LO.LOW + 1 ? 2 : 1)
        // The trail: its light left behind it, white near the head and blue further back, fading.
        s.trail.forEach((pt, i) => {
          const a = t - pt.t
          const prev = s.trail[i - 1]
          if (a > 0.9 || !prev || pt.t - prev.t > 0.05) return
          const c = a < 0.08 ? '#ffffff' : a < 0.3 ? '#c8d8ff' : a < 0.6 ? '#5a7ae0' : '#1f2a6a'
          line(g, prev.x, prev.y, pt.x, pt.y, c, a < 0.15 ? 2 : 1)
        })
        const head = headAt(t)
        if (head && !within(t, LO.MOON, LO.DIVE)) {
          g.drawImage(glow(7, '#c8d8ff', 1.3, 0.9), Math.round(head[0]) - 7, Math.round(head[1]) - 7)
          rect(g, head[0] - 2, head[1], 5, 1, '#ffffff')
          rect(g, head[0], head[1] - 1, 1, 3, '#ffffff')
        }
        // Across the moon, in silhouette.
        if (head && within(t, LO.MOON, LO.DIVE))
          drawSprite(g, p.mon, head[0], head[1] + Math.round(sz.h * 0.2), {
            sil: '#060a18',
            sx: 0.42,
            sy: 0.42,
            flip: true,
          })
        // The sonic boom: a ring of shock where it broke through, the cone behind it.
        const bx = lerp(w * 1.15, -w * 0.15, span(LO.BOOM, LO.STREAK, LO.STREAK + 0.4))
        burstRing(g, bx, h * 0.17, span(t, LO.BOOM, LO.BOOM + 0.7), Math.max(w, h) * 0.55, 2, '#c8d8ff')
        burstRing(g, bx, h * 0.17, span(t, LO.BOOM + 0.06, LO.BOOM + 0.7), Math.max(w, h) * 0.4, 1, '#ffffff')
        // The skim: its dark shape racing in over the water, growing.
        if (within(t, LO.SPLASH, R)) {
          const k = skimAt(t)
          const vanish = span(t, LO.NEAR + 0.05, R - 0.05)
          if (vanish < 1)
            drawSprite(g, p.mon, k.x, k.y, {
              sil: '#0c1430',
              outline: Math.floor(t * 14) % 2 ? LO_AURA[1] : LO_AURA[2],
              sx: k.sc,
              sy: k.sc,
              ghost: [
                { dy: Math.round(4 * k.sc), color: '#5a7ae0', a: 0.5 },
                { dy: Math.round(9 * k.sc), color: '#1f2a6a', a: 0.4 },
              ],
            })
          if (vanish > 0) shimmer(g, s.bg, p.mon, k.x, k.y, k.sc, t, '#c8d8ff')
        }
        s.spray.draw(g)
        if (t >= R) {
          const k = span(t, R, R + 0.4) * lerp(0.55, 0.25, span(t, R + 0.4, R + 1.4))
          drawRays(s.rays, { x: cx, y: mid }, t, LO_AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - R) * 2.2) * 2)
          reflect(g, p.mon, cx, feet + bob, t, 10)
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
            outline: Math.floor(t * 8) % 2 ? LO_AURA[1] : LO_AURA[2],
          })
        }
        for (const [d, c] of [
          [0, LO_AURA[0]],
          [0.1, LO_AURA[1]],
          [0.22, LO_AURA[2]],
        ] as const)
          burstRing(g, cx, mid, span(t, R + d, R + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        // A white streak across the screen as it shoots past: the speed of it.
        if (within(t, LO.NEAR - 0.1, LO.NEAR + 0.1))
          for (let i = 0; i < 6; i++) {
            const y = mid + ((i * 13) % sz.h) - sz.h / 2
            rect(g, 0, y, w, 1, i % 2 ? '#c8d8ff' : '#ffffff')
          }
        g.restore()
        if (within(t, LO.BOOM, LO.BOOM + 0.15))
          screenFlash(g, '#c8d8ff', 0.35 * (1 - span(t, LO.BOOM, LO.BOOM + 0.15)))
        if (within(t, LO.SPLASH, LO.SPLASH + 0.12)) screenFlash(g, '#e0ecff', 0.2)
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.9 * (1 - span(t, R, R + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.2, { freq: 300, type: 'lowpass', vol: 0.05 }))],
          [0.1, quiet(() => tone(392, 1.6, { type: 'sine', vol: 0.025 }))],
          [LO.STREAK, quiet(() => hiss(0.5, { freq: 3000, slide: -2400, vol: 0.06 }))],
          [
            LO.BOOM,
            quiet(
              () => (
                hiss(0.6, { freq: 140, type: 'lowpass', vol: 0.16 }),
                tone(55, 0.5, { type: 'sine', vol: 0.08, slide: -20 })
              ),
            ),
          ],
          [LO.LOW, quiet(() => (hiss(0.45, { freq: 2000, slide: 1500, vol: 0.06 }), fxSound('water.jet')))],
          [LO.CLIMB, quiet(() => tone(523, 0.5, { type: 'sine', vol: 0.03, slide: 520 }))],
          [LO.MOON, quiet(() => tone(1568, 0.5, { type: 'triangle', vol: 0.02 }))],
          [LO.DIVE, quiet(() => tone(1760, 0.38, { type: 'sine', vol: 0.03, slide: -1300 }))],
          [
            LO.SPLASH,
            quiet(() => (fxSound('water.jet'), hiss(0.8, { freq: 600, type: 'lowpass', vol: 0.1 }))),
          ],
          [LO.SPLASH + 0.1, quiet(() => hiss(0.75, { freq: 1200, slide: 2400, vol: 0.06 }))],
          [LO.NEAR, quiet(() => fxSound('psychic.focus'))],
          [LO.NEAR + 0.2, quiet(() => fxSound('legend.heart'))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<OS>[]),
    }
  },
}
