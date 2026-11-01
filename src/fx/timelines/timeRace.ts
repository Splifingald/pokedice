// The race of time and space (docs/61 §4.4, docs/15 §48) on the pixel engine. It stands in the very place of Dialga's
// and Palkia's raid cinematics (cinema/spearPillar.ts, whose ruins it reuses): Spear Pillar's worn tiles in perspective,
// the round dais, broken columns near and far, the sea of clouds under a night sky that is time's blue on one side and
// space's violet on the other. Over the ruins hang a clock face of light (rings, sixty ticks, gears turning behind) and
// a rift of space (a jagged tear, pearl at its lips, the void's stars streaming into it).
//
// The intro: the area gives way to the night, the clock draws itself and its hands whip backwards (smeared), slowing to
// a stop; space strains, cracks and tears open with a shockwave; it holds its end, the clock ticking. The win: dark
// pulses; the legend rises out of the dais in silhouette, rim-lit in its colour; light gathers, the reveal (a flash that
// is gone in a quarter second, rings, rays, the shiny sparkle); then the other legend's half settles and its own last:
// the hands sweep round to twelve and stop with a chime, or the rift seals to a line and closes with a glint; the name
// card. The loop: the place, the clock ticking, the rift open. Words come from the screen; sizes too: the full-screen
// scenes draw on a stage of the screen's shape, the words over its bottom `inset`.
import { fxSound, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  label,
  labelWidth,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, silhouette, spriteFrame, spriteSize } from '../sprites'
import { H, screenFlash, screenShake, skippingNow, W, within, type Cue, type Timeline } from '../timeline'
import { burstRing, dissolve, inOrder, tri } from './cinema/kit'
import { CLOCK, cloudSea, cog, column, D_PAL, dais, floor, type Column, type Pal } from './cinema/spearPillar'
import { drawRays, gleam } from './legend'
import { quiet, type PortalLoop, type SceneSize } from './portal'

/** The race's palette: the night over Spear Pillar, time's steel blues and gold, space's pearl pinks, the stone. */
export const TR = {
  night: '#05061a',
  deep: '#0b0f2e',
  dark: '#151c4a',
  mid: '#223070',
  dusk: '#3a3f8f',
  haze: '#6a62b8',
  stone: '#5b6378',
  stoneLit: '#8d97ae',
  stoneDark: '#323849',
  stoneDeep: '#1d2130',
  time: '#4a6bd8',
  timeLit: '#a8c8ff',
  timeDeep: '#22357a',
  steel: '#c9d6ea',
  gold: '#ffd65a',
  goldDeep: '#c2902a',
  space: '#e88ac0',
  spaceLit: '#ffd0ea',
  spaceDeep: '#8a3f8c',
  pearl: '#fff2fa',
  void: '#0a0418',
  ink: '#070818',
  white: '#ffffff',
} as const

/** Which legend a scene is about: Dialga is time's (the Steel gate), Palkia space's (the Water gate). */
export type RaceSide = 'time' | 'space'

const skipQuiet = (f: () => void) => () => void (!skippingNow() && f())

// ---------------------------------------------------------------- the place

/** The stone of the race's ruins: the raid's blue-grey stone, its clouds a touch more violet (space's half). */
const RACE_PAL: Pal = { ...D_PAL, cloud: ['#3a3a68', '#6a6aa0'], peaks: '#262a48' }

/** Where everything stands on a stage of w × h (the words over its bottom `inset`). */
export function raceSpots(w: number, h: number, inset = 0) {
  const hv = Math.max(40, h - inset)
  const m = Math.min(w, hv)
  const cx = Math.round(w / 2)
  const hz = Math.round(hv * 0.52)
  const feet = Math.round(hv * 0.72)
  const R = Math.max(10, Math.round(Math.min(w * 0.19, hv * 0.24)))
  const sy = Math.round(Math.min(hv * 0.38, hz - R * 0.15))
  const hw = Math.max(3, Math.round(m * 0.028))
  const fw = Math.max(5, Math.round(m * 0.055))
  const fb = Math.round(hz + (hv - hz) * 0.9)
  const drx = Math.round(Math.min(w * 0.3, 74))
  return {
    w,
    h,
    hv,
    m,
    cx,
    hz,
    R,
    clock: { x: Math.round(w * 0.27), y: sy },
    rift: { x: Math.round(w * 0.73), y: sy },
    /** The legend's feet, on the dais. */
    mid: { x: cx, y: feet },
    dais: { y: feet + 3, rx: drx, ry: Math.max(4, Math.round(drx * 0.2)) },
    cols: [
      { x: cx - w * 0.4, base: hz + 3, hgt: hv * 0.22, hw, broken: 0 },
      { x: cx - w * 0.17, base: hz + 2, hgt: hv * 0.14, hw, broken: 5 },
      { x: cx + w * 0.2, base: hz + 2, hgt: hv * 0.25, hw, broken: 0 },
      { x: cx + w * 0.39, base: hz + 3, hgt: hv * 0.12, hw, broken: 4 },
    ].map((c) => ({ ...c, x: Math.round(c.x), hgt: Math.round(c.hgt) })) as Column[],
    front: [
      { x: Math.round(cx - w * 0.47), base: fb, hgt: Math.round(hv * 0.5), hw: fw, broken: 7 },
      { x: Math.round(cx + w * 0.47), base: fb, hgt: Math.round(hv * 0.6), hw: fw, broken: 0 },
    ] as Column[],
  }
}
type Spots = ReturnType<typeof raceSpots>

/**
 * The sky: night at the top to a low glow at the horizon, time's blue on the left fading into space's violet on the
 * right through the dither; far galaxies on space's side, stars all over. Cached.
 */
const raceSky = (S: Spots): Canvas =>
  cached(`tr-sky|${S.w}|${S.h}|${S.hz}`, () => {
    const { w, hz } = S
    const time = ['#04071a', '#0a1230', '#162348', '#2a3a6e', '#4a5a9a']
    const space = ['#08041a', '#1a0a34', '#3a1650', '#6a2a6a', '#a04a7a']
    const n = time.length - 1
    const c = shade(w, hz + 2, (x, y) => {
      const k = Math.pow(clamp(y / Math.max(1, hz)), 1.4) * n
      const i = Math.min(n - 1, Math.floor(k))
      const lv = Math.floor((k - i) * 4 + bayer(x, y)) / 4
      const j = lv >= 1 || (lv > 0 && bayer(x + 2, y + 1) < lv) ? i + 1 : i
      const side = ease.ioS(span(x / w, 0.3, 0.75))
      return bayer(x + 1, y + 3) < side ? space[j]! : time[j]!
    })
    const g = c.g
    const r = rng(w * 31 + hz)
    for (let i = 0; i < Math.max(2, Math.round(w / 80)); i++) {
      const x = r.range(w * 0.58, w - 8)
      const y = r.range(4, hz * 0.55)
      const rx = Math.round(r.range(5, 10))
      softEllipse(
        g,
        x,
        y,
        rx,
        Math.max(2, Math.round(rx * 0.35)),
        r() < 0.6 ? '#ff8ad0' : '#8ab0ff',
        0.55,
        1.5,
      )
      rect(g, x - 1, y, 3, 1, TR.white)
    }
    for (let i = 0; i < Math.round((w * hz) / 120); i++) {
      const x = r.int(0, w - 1)
      const y = r.int(0, hz - 6)
      rect(g, x, y, 1, 1, r() < 0.2 ? TR.white : x > w / 2 ? '#a88ad0' : '#7a8ac8')
    }
    return c
  })

/** The ruins behind the light: the floor in perspective, the far columns, the dais, the night over the ground. Cached. */
const ruins = (S: Spots): Canvas =>
  cached(`tr-ruins|${S.w}|${S.h}|${S.hz}|${S.dais.y}`, () => {
    const { w, h, hz } = S
    const c = canvas(w, h)
    const g = c.g
    const r = rng(483)
    g.drawImage(floor({ w, h, hz, cx: S.cx }, RACE_PAL), 0, hz)
    rect(g, 0, hz, w, 1, RACE_PAL.stone[0])
    for (const col of S.cols) column(g, col, RACE_PAL, r)
    dais(g, { cx: S.cx, dais: S.dais }, RACE_PAL)
    // Night over the ground (baked: the light pools are drawn on top of it).
    g.globalAlpha = 0.35
    g.fillStyle = TR.night
    g.fillRect(0, hz + 1, w, h - hz - 1)
    g.globalAlpha = 1
    return c
  })

/** The two great columns in front, at the edges. Cached. */
const frontCols = (S: Spots): Canvas =>
  cached(`tr-front|${S.w}|${S.h}|${S.hz}`, () => {
    const c = canvas(S.w, S.h)
    const r = rng(484)
    for (const col of S.front) column(c.g, col, RACE_PAL, r)
    return c
  })

/** The sea of clouds at the horizon. Cached. */
const sea = (S: Spots): Canvas => cached(`tr-sea|${S.w}|${S.m}`, () => cloudSea(S, RACE_PAL, rng(4831)))

/**
 * The place behind the clock and the rift: the sky (its stars twinkling), the drifting clouds, the ruins, and the light
 * the clock (`lt`) and the rift (`ls`) cast on the floor under them, 0..1.
 */
function drawPlace(g: G, S: Spots, t: number, lt: number, ls: number, still = false) {
  g.drawImage(raceSky(S), 0, 0)
  const r = rng(77)
  for (let i = 0; i < Math.round(S.w / 10); i++) {
    const x = r.int(0, S.w - 1)
    const y = r.int(0, S.hz - 8)
    const on = still || (Math.floor(t * 3) + i) % 7 !== 0
    if (on && i % 3 === 0) rect(g, x, y, 1, 1, TR.white)
    if (on && i % 3 !== 0 && (Math.floor(t * 2) + i) % 4 === 0) {
      rect(g, x - 1, y, 3, 1, i % 2 ? TR.timeLit : TR.spaceLit)
      rect(g, x, y - 1, 1, 3, i % 2 ? TR.timeLit : TR.spaceLit)
    }
  }
  const sc = sea(S)
  const off = still ? 0 : Math.round((t * 4) % S.w)
  g.drawImage(sc, -off, S.hz - sc.height + 2)
  g.drawImage(ruins(S), 0, 0)
  // The light each casts on the tiles under it.
  const pool = (x: number, k: number, c: string) => {
    if (k <= 0.05) return
    const rx = Math.round(S.R * 1.1)
    softEllipse(
      g,
      x,
      S.hz + Math.round((S.dais.y - S.hz) * 0.45),
      rx,
      Math.max(3, Math.round(rx * 0.22)),
      c,
      0.5 * k,
      1.4,
    )
  }
  pool(S.clock.x, lt, CLOCK[3])
  pool(S.rift.x, ls, TR.spaceDeep)
}

/** The area's picture, cover-fitted, for the scene's first beats. */
function pictureCanvas(w: number, h: number, picture: string | null | undefined): Canvas | null {
  const f = picture ? spriteFrame(picture) : undefined
  if (!f) return null
  const c = canvas(w, h)
  const k = Math.max(w / f.width, h / f.height)
  const dw = Math.round(f.width * k)
  const dh = Math.round(f.height * k)
  c.g.drawImage(f, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
  return c
}

/** Letterbox bars, `bh` art pixels each, for the moment a scene's line is read. */
function bars(g: G, w: number, h: number, bh: number) {
  if (bh <= 0) return
  rect(g, 0, 0, w, bh, TR.night)
  rect(g, 0, h - bh, w, bh, TR.night)
}

// ---------------------------------------------------------------- the clock of time

/**
 * The clock of time, radius R, as the raid's clock of light: a dithered glow, gears turning behind, two rims and an
 * inner ring, sixty ticks (the hours longer, the quarters white), a faint face you see the ruins through. Its hands at
 * `minute` and `hour` turns (0 = twelve, clockwise). `q` draws it in (the rims run round, the ticks follow, then the
 * hands); `smear` (turns, signed: where the minute hand came from this last instant) sweeps a dithered fan behind it
 * and its afterimages; `flare` 0..1 lights it up (a pulse, the chime).
 */
export function drawClock(
  g: G,
  x: number,
  y: number,
  R: number,
  minute: number,
  hour: number,
  q = 1,
  smear = 0,
  flare = 0,
) {
  if (q <= 0) return
  const gr = (R + 10) & ~3
  g.drawImage(glow(gr, CLOCK[3], 2, Math.round((0.3 + 0.35 * flare) * 8) / 8), x - gr, y - gr)
  if (q > 0.2) ellipse(g, x, y, R - 2, R - 2, pattern(g, CLOCK[4], 1 + flare * 3))
  // Gears behind the face, turning with the minute hand.
  if (q > 0.3)
    for (const [a, k, dir] of [
      [-2.4, 0.3, 1],
      [-0.7, 0.24, -1],
      [2.2, 0.2, 1],
    ] as const)
      cog(
        g,
        Math.round(x + Math.cos(a) * R * 0.92),
        Math.round(y + Math.sin(a) * R * 0.92),
        Math.max(3, Math.round(R * k)),
        ((minute * Math.PI * 2 * dir) / k) * 0.15,
        CLOCK[3],
      )
  const top = -Math.PI / 2
  const a1 = span(q, 0, 0.45) * Math.PI * 2
  const rim = flare > 0.5 ? CLOCK[0] : CLOCK[1]
  ellipseLine(g, x, y, R, R, rim, top, top + a1)
  ellipseLine(g, x, y, R - 2, R - 2, CLOCK[3], top, top + a1)
  ellipseLine(g, x, y, Math.round(R * 0.82), Math.round(R * 0.82), CLOCK[2], top - a1, top)
  if (R > 20) ellipseLine(g, x, y, Math.round(R * 0.3), Math.round(R * 0.3), CLOCK[3], top - a1, top)
  const hq = span(q, 0.3, 0.8)
  for (let k = 0; k < 60; k++) {
    if (k / 60 > hq) break
    const a = top + (k / 60) * Math.PI * 2
    const big = k % 5 === 0
    const r0 = R * (big ? 0.84 : 0.9)
    const r1 = R * 0.95
    if (big)
      line(
        g,
        x + Math.cos(a) * r0,
        y + Math.sin(a) * r0,
        x + Math.cos(a) * r1,
        y + Math.sin(a) * r1,
        k % 15 ? CLOCK[1] : CLOCK[0],
        k % 15 ? 1 : 2,
      )
    else if (R > 16)
      rect(g, Math.round(x + Math.cos(a) * r1), Math.round(y + Math.sin(a) * r1), 1, 1, CLOCK[2])
  }
  if (q < 0.6) return
  const ha = top + hour * Math.PI * 2
  const ma = top + minute * Math.PI * 2
  const ml = R * 0.76
  // The smear: a dithered fan over the sweep it just made, thicker near the hand, and two afterimages.
  const sm = clamp(smear, -0.45, 0.45)
  if (Math.abs(sm) > 0.01) {
    const n = Math.max(2, Math.ceil(Math.abs(sm) * 40))
    for (let i = 0; i < n; i++) {
      const b0 = ma - (sm * Math.PI * 2 * i) / n
      const b1 = ma - (sm * Math.PI * 2 * (i + 1)) / n
      const lv = Math.round(10 * (1 - i / n)) + 1
      tri(
        g,
        x,
        y,
        x + Math.cos(b0) * ml,
        y + Math.sin(b0) * ml,
        x + Math.cos(b1) * ml,
        y + Math.sin(b1) * ml,
        pattern(g, i < n / 3 ? CLOCK[1] : CLOCK[2], lv),
      )
    }
    for (const [f, c] of [
      [0.35, CLOCK[2]],
      [0.7, CLOCK[3]],
    ] as const) {
      const b = ma - sm * Math.PI * 2 * f
      line(g, x, y, x + Math.cos(b) * ml, y + Math.sin(b) * ml, c)
    }
  }
  line(g, x, y, x + Math.cos(ha) * R * 0.5, y + Math.sin(ha) * R * 0.5, CLOCK[1], 3)
  line(g, x, y, x + Math.cos(ma) * ml, y + Math.sin(ma) * ml, CLOCK[0], 2)
  rect(g, Math.round(x + Math.cos(ma) * ml) - 1, Math.round(y + Math.sin(ma) * ml) - 1, 2, 2, TR.gold)
  rect(g, x - 2, y - 2, 5, 5, TR.gold)
  rect(g, x - 1, y - 1, 3, 3, CLOCK[0])
}

// ---------------------------------------------------------------- the rift of space

interface RiftShape {
  /** Half its length, in rows. */
  L: number
  /** Its widest half-opening. */
  half: number
  /** Per row (index + L): the tear's line off centre, how far each lip pulls back there (0..1), the torn fibres. */
  jag: number[]
  lipL: number[]
  lipR: number[]
  fl: number[]
  fr: number[]
  stars: { a: number; ph: number; sp: number; big: boolean }[]
}

/** n + 1 values through random knots at uneven steps, joined by straight runs: a torn edge, never a regular zigzag. */
function knotted(r: Rng, n: number, step0: number, step1: number, next: (prev: number) => number) {
  const out: number[] = []
  let v = next(0)
  while (out.length <= n) {
    const len = r.int(step0, step1)
    const nv = next(v)
    for (let i = 0; i < len && out.length <= n; i++) out.push(lerp(v, nv, i / len))
    v = nv
  }
  return out
}

/**
 * The tear's shape for a size, cached: its line wandering down in uneven straight runs with sudden kinks, each lip torn
 * on its own (so the opening is ragged, never a zip), fibres torn out of the lips here and there.
 */
const riftShape = (R: number): RiftShape =>
  cached(`tr-rift|${R}`, () => {
    const r = rng(R * 31 + 7)
    const L = Math.round(R * 1.18)
    const half = Math.max(3, Math.round(R * 0.36))
    const n = 2 * L
    const lim = R * 0.2
    const kink = () => (r() < 0.25 ? (r() < 0.5 ? -1 : 1) * R * 0.08 : 0)
    const jag = knotted(r, n, Math.max(4, Math.round(R / 7)), Math.max(6, Math.round(R / 3)), (p) =>
      clamp(-p * 0.4 + r.range(-1, 1) * R * 0.14 + kink(), -lim, lim),
    ).map((v, i) => Math.round(v * Math.min(1, Math.min(i, n - i) / 4)))
    const torn = () => (r() < 0.12 ? r.range(0.4, 0.6) : r.range(0.86, 1))
    const lipL = knotted(r, n, 3, 8, torn)
    const lipR = knotted(r, n, 3, 8, torn)
    const fl: number[] = []
    const fr: number[] = []
    for (let i = 0; i <= n; i++) {
      fl.push(r() < 0.2 ? r.int(1, 3) : 0)
      fr.push(r() < 0.2 ? r.int(1, 3) : 0)
    }
    const stars = Array.from({ length: Math.max(12, Math.round(R * 0.8)) }, () => ({
      a: r() * Math.PI * 2,
      ph: r(),
      sp: r.range(0.3, 0.8),
      big: r() < 0.2,
    }))
    return { L, half, jag, lipL, lipR, fl, fr, stars }
  })

/** The void seen through the tear: near black, a pink heart deep in it, its stars streaming in and swirling down. */
function riftVoid(R: number, S: RiftShape, t: number): Canvas {
  const vw = S.half * 2 + 8
  const vh = S.L * 2 + 2
  const c = cached(`tr-void|${R}`, () => canvas(vw, vh))
  const bg = cached(`tr-voidbg|${R}`, () => {
    const b = canvas(vw, vh)
    b.g.fillStyle = TR.void
    b.g.fillRect(0, 0, vw, vh)
    // Solid bands, deeper and deeper in (a dither here would read as stripes once cut into rows).
    const vx = Math.round(vw / 2)
    const vy = Math.round(vh / 2)
    ellipse(b.g, vx, vy, Math.round(vw * 0.5), Math.round(vh * 0.4), '#160630')
    ellipse(b.g, vx, vy, Math.round(vw * 0.36), Math.round(vh * 0.26), '#2c0c4c')
    ellipse(b.g, vx, vy, Math.round(vw * 0.24), Math.round(vh * 0.14), '#5a1458')
    ellipse(b.g, vx, vy, Math.max(1, Math.round(vw * 0.12)), Math.round(vh * 0.06), '#a03a90')
    rect(b.g, Math.round(vw / 2) - 1, Math.round(vh / 2), 3, 1, TR.spaceLit)
    rect(b.g, Math.round(vw / 2), Math.round(vh / 2) - 1, 1, 3, TR.spaceLit)
    return b
  })
  const g = c.g
  g.drawImage(bg, 0, 0)
  const ox = vw / 2
  const oy = vh / 2
  const px = (q: number, d: number) => ox + Math.cos(q) * d * vw * 0.6
  const py = (q: number, d: number) => oy + Math.sin(q) * d * vh * 0.5
  for (const s of S.stars) {
    const u = (((s.ph + t * s.sp) % 1) + 1) % 1
    // Falling in: far and slow at first, faster and faster to the heart, swirling as it goes; its trail behind it.
    const d = Math.pow(1 - u, 1.6)
    const a = s.a + u * 2.6
    const x = px(a, d)
    const y = py(a, d)
    // Its trail only once it is falling fast, short: a few streaks, not a scribble.
    if (u > 0.45) {
      const d1 = d + 0.05 + u * 0.08
      line(g, x, y, px(a - 0.15, d1), py(a - 0.15, d1), u > 0.7 ? '#ff8ad0' : '#7a4ab0')
    }
    rect(g, Math.round(x), Math.round(y), 1, 1, u > 0.4 ? TR.white : '#b89ae0')
    if (s.big && u > 0.3) rect(g, Math.round(x) - 1, Math.round(y), 3, 1, TR.pearl)
  }
  return c
}

/**
 * The rift of space, size R: a jagged vertical tear. `len` 0..1 runs it out from its middle (a seam of light), `open`
 * 0..1 pulls its lips apart on the void (its stars streaming in), lips of pearl and pink, torn fibres flickering, its
 * glow round it. `t` makes it shimmer.
 */
export function drawRift(g: G, x: number, y: number, R: number, open: number, t: number, len = 1) {
  if (len <= 0) return
  const S = riftShape(R)
  const vis = Math.max(open, len * 0.5)
  const gr = Math.round(R * (0.8 + 0.5 * open)) & ~1
  g.drawImage(glow(gr, TR.spaceDeep, 1.3, Math.round(0.45 * vis * 8) / 8), x - gr, y - gr)
  const gi = Math.round(R * (0.3 + 0.25 * open)) & ~1
  g.drawImage(glow(gi, TR.space, 2, Math.round(0.45 * vis * 8) / 8), x - gi, y - gi)
  const Lv = Math.max(1, Math.round(S.L * len))
  const vd = open > 0.02 ? riftVoid(R, S, t) : null
  const f = Math.floor(t * 18)
  for (let i = -Lv; i <= Lv; i++) {
    const j = i + S.L
    const yy = y + i
    // A lens: widest in the middle, sharp at both ends.
    const lens = Math.pow(Math.sin((Math.PI * (i + Lv)) / (2 * Lv)), 0.9)
    const hl = Math.round(S.half * open * lens * S.lipL[j]!)
    const hr = Math.round(S.half * open * lens * S.lipR[j]!)
    const c = x + S.jag[j]!
    if (hl + hr <= 0) {
      // The seam: a line of light, its sides pink.
      rect(g, c, yy, 1, 1, (i + f) % 5 ? TR.pearl : TR.white)
      if (lens > 0.3) {
        rect(g, c - 1, yy, 1, 1, TR.space)
        rect(g, c + 1, yy, 1, 1, TR.space)
      }
      continue
    }
    if (vd) g.drawImage(vd, Math.round(vd.width / 2) - hl, j + 1, hl + hr, 1, c - hl, yy, hl + hr, 1)
    const lip = (i + f) % 6 === 0 ? TR.white : TR.pearl
    rect(g, c - hl - 1, yy, 1, 1, lip)
    rect(g, c + hr, yy, 1, 1, lip)
    rect(g, c - hl - 2, yy, 1, 1, TR.spaceLit)
    rect(g, c + hr + 1, yy, 1, 1, TR.spaceLit)
    // Torn fibres reaching out from the lips, flickering.
    const nl = S.fl[j]! * (((j + f) & 3) === 0 ? 0 : 1)
    const nr = S.fr[j]! * (((j + f + 2) & 3) === 0 ? 0 : 1)
    if (nl) rect(g, c - hl - 2 - nl, yy, nl, 1, TR.space)
    if (nr) rect(g, c + hr + 2, yy, nr, 1, TR.space)
  }
}

/** Space straining before it tears: a pinprick of light, crackles of pink flickering out of it. */
function drawStrain(g: G, x: number, y: number, R: number, k: number, t: number) {
  if (k <= 0) return
  const gr = Math.max(2, Math.round(R * 0.5 * k)) & ~1
  g.drawImage(glow(gr, TR.space, 1.6, 0.8), x - gr, y - gr)
  const r = rng(Math.floor(t * 12) + 9)
  const n = 1 + Math.round(k * 3)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = R * (0.3 + 0.6 * k) * r.range(0.6, 1)
    const pts = bolt(r, x, y, x + Math.cos(a) * d * 0.6, y + Math.sin(a) * d, 0.3, 3)
    polyline(g, pts, i % 2 ? TR.spaceLit : TR.space)
  }
  rect(g, x - 1, y - 1, 3, 3, TR.pearl)
  rect(g, x, y, 1, 1, TR.white)
}

/** A glint: a four-point star of light, its long arm upright, a glow behind. `k` 0..1 its size. */
function glint(g: G, x: number, y: number, size: number, k: number, col: string) {
  if (k <= 0) return
  const L = Math.max(2, Math.round(size * k))
  const gr = Math.max(2, Math.round(L * 0.7)) & ~1
  g.drawImage(glow(gr, col, 1.8, 0.7), x - gr, y - gr)
  rect(g, x - L, y, L * 2 + 1, 1, col)
  rect(g, x, y - Math.round(L * 1.4), 1, Math.round(L * 2.8) + 1, col)
  const s = Math.round(L * 0.45)
  rect(g, x - s, y, s * 2 + 1, 1, TR.white)
  rect(g, x, y - s, 1, s * 2 + 1, TR.white)
  const d = Math.round(L * 0.3)
  line(g, x - d, y - d, x + d, y + d, col)
  line(g, x - d, y + d, x + d, y - d, col)
  rect(g, x - 1, y - 1, 3, 3, TR.white)
}

/** The motes drawn into the rift: pearl and pink streaks pulled to its line. */
function feedRift(P: Particles, r: Rng, c: { x: number; y: number }, R: number, rate: number) {
  if (r() > rate) return
  const ang = r.range(0, Math.PI * 2)
  const d = R * r.range(1.1, 2.1)
  P.add({
    x: c.x + Math.cos(ang) * d,
    y: c.y + Math.sin(ang) * d * 0.9,
    life: r.range(0.7, 1.2),
    size: 1,
    shape: r() < 0.6 ? 'streak' : 'px',
    trail: 0.06,
    colors: [TR.space, TR.spaceLit, TR.pearl, TR.white],
    home: { x: c.x, y: c.y + r.range(-R * 0.6, R * 0.6), k: 55 },
    drag: 1.2,
  })
}

/** A blast of light from a point: `n` sparks flung out, in a ramp of colours. */
function burst(P: Particles, r: Rng, x: number, y: number, n: number, colors: readonly string[], v = 160) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const s = r.range(v * 0.35, v)
    P.add({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.75,
      drag: 2.6,
      life: r.range(0.5, 1),
      size: r.int(1, 2),
      shape: r() < 0.4 ? 'star' : 'px',
      colors,
    })
  }
}

// ---------------------------------------------------------------- the intro

export interface RaceIntroParams extends SceneSize {
  /** The area's picture (a loaded picture key), seen before the night falls. */
  picture?: string | null
  short?: boolean
}

interface IntroState {
  r: Rng
  pic: Canvas | null
  fx: Particles
  shakes: [number, number, number][]
}

/**
 * The way in (docs/61 §4.4): the area gives way to Spear Pillar's night; the clock of light draws itself, its hands
 * whip backwards (a smear of light behind them), slow and stop; space strains across from it, cracks, and tears open
 * with a flash and a shockwave; then it holds its end (the clock ticking, the rift drinking in motes) until the player
 * taps. 3.8 s (short: half).
 */
export function raceIntroTimeline(p: RaceIntroParams = {}): Timeline<IntroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const S = raceSpots(w, h, p.inset ?? 0)
  const { R, clock, rift } = S
  const T_DARK = 0.7 * k
  const T_CLOCK = 0.5 * k
  const T_SPIN = 1.0 * k
  const T_STOP = 2.4 * k
  const T_RIFT = 1.5 * k
  const T_TEAR = 2.45 * k
  const T_WIDE = 2.6 * k
  const T_LINE = 2.95 * k
  const dur = 3.8 * k
  /** Turns the minute hand runs back. */
  const TURNS = 7
  // How far through its run back it is: a quick start (it whips round at once), then the long slowing down.
  const run = (t: number) => {
    const e = span(t, T_SPIN, T_STOP)
    return ease.outC(e) * ease.outQ(span(e, 0, 0.15))
  }
  // A tick forward first (the anticipation), then the run back; after the stop, a tick a second.
  const minute = (t: number) =>
    0.02 * ease.outQ(span(t, T_SPIN - 0.15 * k, T_SPIN)) -
    TURNS * run(t) +
    (t > T_STOP + 1 ? Math.floor(t - T_STOP) / 60 : 0)
  const hour = (t: number) => 0.33 - 0.6 * run(t)
  // A click each time the hand passes a quarter on its way back: a rattle, slowing.
  const clicks: number[] = []
  for (let q = 1; q <= TURNS * 4; q++) {
    const want = q / (TURNS * 4)
    let lo = T_SPIN
    let hi = T_STOP
    for (let i = 0; i < 24; i++) {
      const md = (lo + hi) / 2
      if (run(md) < want) lo = md
      else hi = md
    }
    if (clicks.length === 0 || hi - clicks[clicks.length - 1]! > 0.045) clicks.push(hi)
  }
  return {
    id: 'race-intro',
    hold: true,
    dur,
    setup: () => ({
      r: rng(484),
      pic: pictureCanvas(w, h, p.picture),
      fx: new Particles(),
      shakes: [
        [T_TEAR, 0.5, 3],
        [T_STOP, 0.12, 1],
      ],
    }),
    step(s, t, dt) {
      const r = s.r
      s.fx.update(dt)
      if (t > T_RIFT) feedRift(s.fx, r, rift, R, t > T_TEAR ? 0.8 : 0.35 * span(t, T_RIFT, T_TEAR))
      // The tear's blast: sparks flung out along the seam.
      if (within(t, T_TEAR, T_TEAR + dt)) {
        const L = riftShape(R).L
        for (let i = 0; i < 46; i++) {
          const yy = rift.y + r.range(-L, L)
          const a = (r() < 0.5 ? Math.PI : 0) + r.range(-0.7, 0.7)
          const v = r.range(50, 170)
          s.fx.add({
            x: rift.x,
            y: yy,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 3,
            life: r.range(0.35, 0.8),
            size: 1,
            shape: r() < 0.5 ? 'streak' : 'px',
            trail: 0.04,
            colors: [TR.white, TR.pearl, TR.spaceLit, TR.space, TR.spaceDeep],
          })
        }
      }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.save()
      g.translate(sh.x, sh.y)
      const ck = ease.outC(span(t, T_CLOCK, T_CLOCK + 0.6 * k))
      const open = t < T_WIDE ? 0 : ease.outBack(span(t, T_WIDE, T_WIDE + 0.35 * k), 1.4)
      drawPlace(g, S, t, ck, Math.max(open, span(t, T_RIFT, T_TEAR) * 0.4))
      // The clock: drawing itself, its hands whipping back, smeared; slowing; stopped, then ticking.
      const sm = minute(t) - minute(t - 0.05 * k)
      drawClock(
        g,
        clock.x,
        clock.y,
        R,
        minute(t),
        hour(t),
        ck,
        sm,
        t > T_STOP && t < T_STOP + 0.3 * k ? 0.6 : 0,
      )
      // Space straining, then the tear running out from its middle, then pulled open.
      if (t < T_TEAR) drawStrain(g, rift.x, rift.y, R, span(t, T_RIFT, T_TEAR), t)
      else drawRift(g, rift.x, rift.y, R, open, t, ease.outC(span(t, T_TEAR, T_TEAR + 0.12 * k)))
      // The shockwave: a bright ring and the dark one behind it, then pink.
      const big = Math.max(w, h) * 0.8
      burstRing(g, rift.x, rift.y, span(t, T_TEAR, T_TEAR + 0.55 * k), big, 3, TR.pearl)
      burstRing(g, rift.x, rift.y, span(t, T_TEAR + 0.04 * k, T_TEAR + 0.6 * k), big * 0.96, 3, TR.spaceDeep)
      burstRing(g, rift.x, rift.y, span(t, T_TEAR + 0.1 * k, T_TEAR + 0.7 * k), big * 0.7, 2, TR.space)
      s.fx.draw(g)
      g.drawImage(frontCols(S), 0, 0)
      // The area first, darkening, then dissolving into the night.
      if (s.pic) {
        const gone = span(t, T_DARK * 0.4, T_DARK)
        if (gone < 1) {
          const tmp = cached(`tr-pic|${w}|${h}`, () => canvas(w, h))
          tmp.g.drawImage(s.pic, 0, 0)
          wash(tmp.g, TR.night, span(t, 0, T_DARK * 0.5) * 0.55, 4)
          dissolve(g, tmp, 1 - ease.ioS(gone))
        }
      }
      g.restore()
      if (!s.pic && t < 0.45 * k) wash(g, '#000000', 1 - span(t, 0, 0.45 * k), 8)
      if (within(t, T_TEAR, T_TEAR + 0.18))
        screenFlash(g, TR.pearl, 0.6 * (1 - span(t, T_TEAR, T_TEAR + 0.18)))
      bars(g, w, h, Math.round(Math.min(14, h * 0.07) * ease.outC(span(t, T_LINE - 0.1, T_LINE + 0.1))))
    },
    cues: () =>
      inOrder([
        [T_CLOCK, () => quiet('race.tick')],
        ...clicks.map(
          (at, i) =>
            [at, skipQuiet(() => tone(i % 2 ? 1500 : 1900, 0.025, { type: 'square', vol: 0.018 }))] as const,
        ),
        [T_RIFT, () => quiet('race.rift')],
        [T_STOP, skipQuiet(() => tone(196, 0.5, { type: 'triangle', vol: 0.04 }))],
        [T_TEAR, () => quiet('legend.shatter')],
        [T_LINE, (hud) => hud.beat?.('line')],
      ] satisfies Cue<IntroState>[]),
  }
}

// ---------------------------------------------------------------- the win

export interface RaceWinParams extends SceneSize {
  /** The legend's sprite key (shiny, front). */
  mon: string
  side: RaceSide
  /** Its name for the card, and the card's small lines (SHINY, its raid level). */
  name: string
  subs?: readonly string[]
  short?: boolean
}

interface WinState {
  r: Rng
  fx: Particles
  shakes: [number, number, number][]
  rays: Canvas
  layer: Canvas
}

/**
 * The last fight won in time (docs/61 §4.4): the clock and the rift over the ruins; dark pulses; the legend rising out
 * of the dais in silhouette, rim-lit in its colour, a shaft of light under it; light gathering; the reveal (a flash gone
 * in a quarter second, rings, rays, its roar and a quake) and the shiny sparkle. Then the other half settles and its own
 * last: Dialga's hands sweep round to twelve and stop with a chime (the rift sealed before), or Palkia's rift seals to a
 * line and closes with a glint (the clock stopped before); the name card. 6.4 s (short: half). `beat`: 'roar' at the
 * reveal, 'card' with the card.
 */
export function raceWinTimeline(p: RaceWinParams): Timeline<WinState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const S = raceSpots(w, h, p.inset ?? 0)
  const { R, clock, rift, mid } = S
  const time = p.side === 'time'
  const own = time ? TR.time : TR.space
  const ownLit = time ? TR.timeLit : TR.spaceLit
  const aura = time
    ? ([TR.white, TR.timeLit, TR.time, TR.timeDeep] as const)
    : ([TR.white, TR.spaceLit, TR.space, TR.spaceDeep] as const)
  const T_RISE = 0.9 * k
  const T_UP = 2.3 * k
  const T_GATHER = 2.35 * k
  const T_REVEAL = 2.8 * k
  const T_SPARK = T_REVEAL + 0.45 * k
  // The other's half settles first, its own last.
  const T_OTHER = T_REVEAL + 0.95 * k
  const T_OWN = T_REVEAL + 1.6 * k
  const T_CARD = T_REVEAL + 2.75 * k
  const dur = T_CARD + 0.85 * k
  const T_CLOCK = time ? T_OWN : T_OTHER
  const T_SEAL = time ? T_OTHER : T_OWN
  // The clock: ticking, then its hands swept round to twelve (one more turn when it is the legend's own), a recoil.
  const SWEEP = (time ? 0.9 : 0.5) * k
  const m0 = 0.32
  const minute = (t: number) => {
    const live = m0 + Math.floor(Math.min(t, T_CLOCK)) / 60
    if (t < T_CLOCK) return live
    return lerp(live, time ? 2 : 1, ease.outBack(span(t, T_CLOCK, T_CLOCK + SWEEP), 1.3))
  }
  const hour = (t: number) => lerp(0.42, 1, ease.outBack(span(t, T_CLOCK, T_CLOCK + SWEEP), 1.3))
  const T_CHIME = T_CLOCK + SWEEP * 0.72
  const T_CLOCK_GONE = T_CHIME + (time ? 0.7 : 0.4) * k
  // The rift: pulled shut (trembling when it is the legend's own), a line shrinking to a point, the glint.
  const SHUT = (time ? 0.4 : 0.6) * k
  const T_LINE = T_SEAL + SHUT
  const T_GLINT = T_LINE + 0.22 * k
  const riftOpen = (t: number) =>
    t < T_SEAL
      ? 1
      : (1 - ease.inQ(span(t, T_SEAL, T_LINE))) *
        (1 + (time ? 0 : 0.08 * Math.sin(t * 60)) * (t < T_LINE ? 1 : 0))
  const riftLen = (t: number) => 1 - ease.inC(span(t, T_LINE, T_GLINT))
  const sz = () => spriteSize(p.mon)
  return {
    id: 'race-win',
    dur,
    setup: () => {
      // The sprite has loaded by now: on a short stage the legend stands lower so all of it shows (the card at s 1).
      const want = sz().h + 30
      if (mid.y < want) {
        mid.y = Math.min(S.hv - 3, want)
        S.dais.y = mid.y + 3
      }
      return {
        r: rng(483),
        fx: new Particles(),
        shakes: [
          [T_REVEAL, 0.6, 3],
          [time ? T_CHIME : T_GLINT, 0.2, 1],
        ],
        rays: canvas(w, h),
        layer: canvas(w, h),
      }
    },
    step(s, t, dt) {
      const r = s.r
      s.fx.update(dt)
      if (t < T_SEAL) feedRift(s.fx, r, rift, R, 0.5)
      const { h: sh } = sz()
      const my = mid.y - sh * 0.5
      // Motes rising in the shaft while it comes up.
      if (t > T_RISE && t < T_GATHER && r() < 0.6)
        s.fx.add({
          x: mid.x + r.range(-S.dais.rx * 0.5, S.dais.rx * 0.5),
          y: S.dais.y - r.range(0, 3),
          vy: -r.range(20, 45),
          life: r.range(0.6, 1.1),
          size: 1,
          shape: 'px',
          colors: [TR.white, ownLit, own],
        })
      // Light gathering into it before the reveal.
      if (t > T_GATHER && t < T_REVEAL - 0.05 * k && r() < 0.9)
        for (let i = 0; i < 2; i++) {
          const a = r() * Math.PI * 2
          const d = r.range(0.45, 0.8) * Math.max(w, h) * 0.5
          s.fx.add({
            x: mid.x + Math.cos(a) * d,
            y: my + Math.sin(a) * d * 0.7,
            life: 0.5,
            size: 1,
            shape: 'streak',
            trail: 0.05,
            home: { x: mid.x, y: my, k: 90 },
            drag: 0.5,
            colors: [own, ownLit, TR.white],
          })
        }
      if (within(t, T_REVEAL, T_REVEAL + dt)) {
        s.fx.list.length = 0
        burst(s.fx, r, mid.x, my, p.short ? 30 : 60, aura, 200)
      }
      // The shiny sparkle's stars, then a few twinkles round it until the card.
      if (t > T_SPARK && t < T_CARD && r() < 0.18)
        s.fx.add({
          x: mid.x + r.range(-sz().w * 0.5, sz().w * 0.5),
          y: mid.y - r.range(4, sh),
          vy: -r.range(3, 8),
          life: r.range(0.4, 0.7),
          size: r.int(1, 2),
          size1: 0,
          shape: 'star',
          colors: [TR.white, ownLit, own],
        })
      // The clock's light breaking up into motes as it goes.
      if (t > T_CHIME + 0.2 * k && t < T_CLOCK_GONE + 0.3 * k && r() < 0.7)
        s.fx.add({
          x: clock.x + r.range(-R, R),
          y: clock.y + r.range(-R, R),
          vy: -r.range(8, 20),
          life: r.range(0.5, 0.9),
          size: 1,
          shape: 'px',
          colors: [CLOCK[0], CLOCK[1], CLOCK[2], CLOCK[3]],
        })
      if (within(t, T_GLINT, T_GLINT + dt))
        burst(s.fx, r, rift.x, rift.y, time ? 10 : 26, [TR.white, TR.pearl, TR.spaceLit, TR.space], 90)
      if (within(t, T_CHIME, T_CHIME + dt))
        burst(s.fx, r, clock.x, clock.y, time ? 26 : 10, [TR.white, CLOCK[1], CLOCK[2], CLOCK[3]], 90)
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      const { w: sw, h: shh } = sz()
      const my = Math.round(mid.y - shh * 0.5)
      g.save()
      g.translate(sh.x, sh.y)
      // The heartbeats: the clock and the rift flare with each, the night deepening between.
      const beat = Math.max(
        0,
        Math.sin(Math.PI * span(t, 0.1 * k, 0.45 * k)),
        Math.sin(Math.PI * span(t, 0.55 * k, 0.9 * k)),
      )
      const clockK = 1 - span(t, T_CHIME + 0.25 * k, T_CLOCK_GONE)
      const open = riftOpen(t)
      const len = riftLen(t)
      drawPlace(g, S, t, clockK, t < T_GLINT ? open : 0)
      // The clock, on its own layer so it can dissolve away once it has stopped.
      const L = s.layer.g
      L.clearRect(0, 0, w, h)
      const sm = minute(t) - minute(t - 0.05 * k)
      const chime = within(t, T_CHIME, T_CHIME + 0.5 * k) ? 1 - span(t, T_CHIME, T_CHIME + 0.5 * k) : 0
      drawClock(L, clock.x, clock.y, R, minute(t), hour(t), 1, sm, Math.max(beat * 0.6, chime))
      if (clockK > 0) dissolve(g, s.layer, clockK)
      if (len > 0) drawRift(g, rift.x, rift.y, R, Math.max(0, open), t, len)
      if (beat > 0 && t < T_RISE) wash(g, TR.night, beat * 0.3, 4)
      // The dais lit in its colour as it comes, a shaft of light up from it.
      const rise = ease.outQ(span(t, T_RISE, T_UP))
      const lit = t < T_REVEAL ? rise : 1 - span(t, T_REVEAL, T_REVEAL + 1.2 * k)
      if (lit > 0) {
        softEllipse(g, mid.x, S.dais.y, S.dais.rx, S.dais.ry, own, 0.5 * lit, 1.2)
        ellipseLine(
          g,
          mid.x,
          S.dais.y,
          Math.round(S.dais.rx * 0.7),
          Math.round(S.dais.ry * 0.7),
          lit > 0.5 ? ownLit : own,
        )
      }
      if (t > T_RISE && t < T_REVEAL) {
        // Its light behind it, stronger as the light gathers.
        const gk = t > T_GATHER ? 1 : 0.6
        const gr = Math.round(Math.max(sw, shh) * 0.6 * (0.5 + 0.5 * rise)) & ~1
        g.drawImage(glow(gr, own, 1.6, Math.round(0.6 * gk * 8) / 8), mid.x - gr, my - gr)
      }
      if (t >= T_REVEAL) {
        // Rays that are gone in a second, not a wash that lingers.
        const kr = 0.35 * (1 - span(t, T_REVEAL, T_REVEAL + 0.8 * k))
        drawRays(s.rays, { x: mid.x, y: my }, t, own, kr)
        if (kr > 0) g.drawImage(s.rays, 0, 0)
        const bob = Math.round(Math.sin((t - T_REVEAL) * 2.4))
        drawSprite(g, p.mon, mid.x, mid.y + bob, {
          flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.35),
          outline: t < T_REVEAL + 1.2 * k ? (Math.floor(t * 8) % 2 ? aura[1] : aura[2]) : undefined,
        })
        const gl = span(t, T_SPARK + 0.05 * k, T_SPARK + 0.5 * k)
        if (gl > 0 && gl < 1) gleam(g, p.mon, { x: mid.x, y: mid.y + bob }, 0, gl)
        // The shiny sparkle: four stars popping round it in turn.
        for (let i = 0; i < 4; i++) {
          const q = span(t, T_SPARK + i * 0.09 * k, T_SPARK + i * 0.09 * k + 0.3 * k)
          if (q <= 0 || q >= 1) continue
          const a = -2.2 + i * 1.5
          glint(
            g,
            Math.round(mid.x + Math.cos(a) * sw * 0.42),
            Math.round(my + Math.sin(a) * shh * 0.42),
            5,
            Math.sin(Math.PI * q),
            ownLit,
          )
        }
      } else if (rise > 0)
        risen(g, p.mon, mid.x, mid.y, S.dais.y, rise, [t > T_GATHER ? TR.white : ownLit, own, aura[3]], w)
      for (const [d, c] of [
        [0, aura[0]],
        [0.08, aura[1]],
        [0.18, aura[2]],
      ] as const)
        burstRing(
          g,
          mid.x,
          my,
          span(t, T_REVEAL + d * k, T_REVEAL + (d + 0.6) * k),
          Math.max(w, h) * 0.7,
          3,
          c,
        )
      // The chime: a ring out of the stopped clock.
      burstRing(g, clock.x, clock.y, span(t, T_CHIME, T_CHIME + 0.6 * k), R * (time ? 3 : 2), 2, CLOCK[1])
      if (time)
        burstRing(g, clock.x, clock.y, span(t, T_CHIME + 0.08 * k, T_CHIME + 0.7 * k), R * 2.2, 2, TR.gold)
      // The rift's last glint, and its ring.
      const gq = span(t, T_GLINT, T_GLINT + (time ? 0.3 : 0.45) * k)
      if (gq > 0 && gq < 1)
        glint(g, rift.x, rift.y, R * (time ? 0.5 : 0.9), Math.sin(Math.PI * Math.sqrt(gq)), TR.spaceLit)
      burstRing(
        g,
        rift.x,
        rift.y,
        span(t, T_GLINT, T_GLINT + 0.6 * k),
        R * (time ? 1.6 : 2.6),
        2,
        TR.spaceLit,
      )
      s.fx.draw(g)
      g.drawImage(frontCols(S), 0, 0)
      g.restore()
      if (t < 0.3 * k) wash(g, TR.night, 1 - span(t, 0, 0.3 * k), 4)
      // The reveal's flash: gone in a quarter second.
      if (within(t, T_REVEAL, T_REVEAL + 0.25))
        screenFlash(g, TR.white, 0.85 * (1 - span(t, T_REVEAL, T_REVEAL + 0.25)))
      if (t >= T_CARD)
        raceCard(
          g,
          w,
          Math.max(3, Math.min(Math.round(S.hv * 0.05), mid.y - shh - 34)),
          ease.outExpo(span(t, T_CARD, T_CARD + 0.4 * k)),
          p.name,
          p.subs ?? [],
          own,
          mid.y - shh < 34,
        )
    },
    cues: () =>
      inOrder([
        [0.1 * k, () => quiet('legend.pulse')],
        [0.55 * k, () => quiet('legend.pulse')],
        [T_RISE, () => quiet('legend.heart')],
        [T_RISE + 0.5 * k, () => quiet('legend.heart')],
        [T_GATHER, skipQuiet(() => tone(220, 0.45, { type: 'sine', vol: 0.05, slide: 440 }))],
        [
          T_REVEAL,
          (hud) => {
            quiet('legend.roar')
            hud.beat?.('roar')
          },
        ],
        [T_SPARK, () => quiet('hatch.shiny')],
        [T_SPARK + 0.12 * k, skipQuiet(() => fxSound('hatch.shiny', 1))],
        [time ? T_GLINT : T_CHIME, skipQuiet(() => tone(1760, 0.25, { type: 'triangle', vol: 0.025 }))],
        [time ? T_CHIME : T_GLINT, () => quiet('race.settle')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<WinState>[]),
  }
}

/**
 * The legend's shape lit from behind, cached: ink, a rim along every edge that faces up (two pixels of `lit`, one of
 * `own` under them) and down its left, a pixel of `own` down its right, its lower part catching the dais's light through a dither. Built
 * with composite drawing only (a sprite from another site can't be read back).
 */
function rimLit(key: string, own: string, lit: string, deep: string): Canvas | null {
  const ink = silhouette(key, TR.ink)
  if (!ink) return null
  return cached(`tr-rim|${key}|${own}|${lit}|${ink.width}x${ink.height}`, () => {
    const w = ink.width
    const h = ink.height
    const c = canvas(w, h)
    c.g.drawImage(ink, 0, 0)
    const tmp = canvas(w, h)
    const t = tmp.g
    // An edge band: the shape in a colour, less itself moved by (dx, dy): what's left faces the other way.
    const band = (col: string, dx: number, dy: number) => {
      t.globalCompositeOperation = 'source-over'
      t.clearRect(0, 0, w, h)
      t.drawImage(silhouette(key, col)!, 0, 0)
      t.globalCompositeOperation = 'destination-out'
      t.drawImage(ink, dx, dy)
      c.g.drawImage(tmp, 0, 0)
    }
    // The dais's light on its lower part.
    t.globalCompositeOperation = 'source-over'
    t.clearRect(0, 0, w, h)
    for (let y = Math.round(h * 0.55); y < h; y++) {
      t.fillStyle = pattern(t, deep, 1 + 9 * span(y, h * 0.55, h))
      t.fillRect(0, y, w, 1)
    }
    t.globalCompositeOperation = 'destination-in'
    t.drawImage(ink, 0, 0)
    c.g.drawImage(tmp, 0, 0)
    band(own, 0, 3)
    band(own, -1, 0)
    band(lit, 1, 0)
    band(lit, 0, 2)
    return c
  })
}

/**
 * The legend rising out of the dais in silhouette, lit from behind in its colour (rimLit), a glow of it round its
 * shape, clipped at the dais so it comes up through it, a line of light where it cuts through. `q` how far up.
 */
function risen(
  g: G,
  key: string,
  x: number,
  feet: number,
  clipY: number,
  q: number,
  [lit, own, deep]: readonly [string, string, string],
  w: number,
) {
  const body = rimLit(key, own, lit, deep)
  const edge = silhouette(key, deep)
  if (!body || !edge) return
  const sx = Math.round(x - body.width / 2)
  const sy = Math.round(feet - body.height + (1 - q) * (body.height + 4))
  g.save()
  g.beginPath()
  g.rect(0, 0, w, clipY)
  g.clip()
  // Its colour's halo, a pixel round it.
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const)
    g.drawImage(edge, sx + dx, sy + dy)
  g.drawImage(body, sx, sy)
  g.restore()
  if (q < 1) {
    rect(g, sx - 3, clipY - 1, body.width + 6, 1, lit)
    rect(g, sx + 2, clipY - 1, body.width - 4, 1, TR.white)
  }
}

/**
 * The name card: a plate sliding in from the left and stopping fully on screen, a gold rim and the legend's colour, the
 * name at 2× when it fits (and the stage isn't `tight`: the legend's head close under it), the small lines (SHINY, its
 * level) on its right.
 */
function raceCard(
  g: G,
  w: number,
  y0: number,
  pin: number,
  title: string,
  subs: readonly string[],
  own: string,
  tight = false,
) {
  const mx = 6
  const subW = Math.max(0, ...subs.map((s) => labelWidth(g, s)))
  const full = w - mx * 2
  const s = !tight && labelWidth(g, title, 2) + 36 + subW <= full ? 2 : 1
  const showSubs = labelWidth(g, title, s) + 36 + subW <= full
  // Tight: only as wide as its words, on the left, so the legend's head under it stays clear.
  const pw = tight ? Math.min(full, labelWidth(g, title, s) + (showSubs ? subW + 40 : 28)) : full
  const n = showSubs ? Math.min(2, subs.length) : 0
  const bh = s === 2 ? 30 : n > 1 ? 25 : 21
  const x0 = Math.round(mx - (w + 10) * (1 - pin))
  const sl = 6
  for (let y = 0; y < bh; y++) {
    // A slanted plate: its ends lean like a blade.
    const l = x0 + Math.round(((bh - 1 - y) / (bh - 1)) * sl)
    const r = x0 + pw - Math.round((y / (bh - 1)) * sl)
    const col =
      y === 0 || y === bh - 1
        ? TR.gold
        : y < 3 || y === bh - 2
          ? own
          : bayer(y, y * 3) < y / bh
            ? TR.dark
            : TR.deep
    rect(g, l - 1, y0 + y, 1, 1, TR.night)
    rect(g, l, y0 + y, r - l, 1, col)
    rect(g, r, y0 + y, 1, 1, TR.night)
  }
  rect(g, x0 + sl - 1, y0 - 1, pw - sl + 2, 1, TR.night)
  rect(g, x0 - 1, y0 + bh, pw - sl + 2, 1, TR.night)
  label(g, title, x0 + 12, y0 + Math.round((bh - 7 * s) / 2), TR.white, TR.night, s)
  if (showSubs)
    subs.slice(0, 2).forEach((sub, i) => {
      label(
        g,
        sub,
        x0 + pw - 12 - labelWidth(g, sub),
        y0 + Math.round((bh - n * 10 + 3) / 2) + i * 10,
        i ? TR.white : TR.gold,
        TR.night,
      )
    })
}

// ---------------------------------------------------------------- on a loop

/**
 * The scene on a loop (the rules' banner, the way-in pop-up on its own): the ruins, the clock ticking once a second,
 * the rift open with motes drawn in. `still`: one frame, held (motion off).
 */
export function raceLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(w * 13 + h)
  const S = raceSpots(w, h)
  const { R, clock, rift } = S
  const amb = new Particles()
  if (!still)
    for (let i = 0; i < 90; i++) {
      feedRift(amb, r, rift, R, 0.5)
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedRift(amb, r, rift, R, 0.45)
      amb.update(dt)
    },
    draw(g, t) {
      drawPlace(g, S, still ? 0 : t, 1, 1, still)
      const tick = still ? 0.1 : Math.floor(t) / 60
      drawClock(g, clock.x, clock.y, R, 0.1 + tick, 0.35)
      drawRift(g, rift.x, rift.y, R, 1, still ? 0 : t)
      amb.draw(g)
      g.drawImage(frontCols(S), 0, 0)
    },
  }
}

/** The tick the clock makes on screen each second (docs/15 §48): louder in its last 30 seconds. */
export const playRaceTick = (last: boolean) => fxSound('race.tick', last ? 1 : 0)
