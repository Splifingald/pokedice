// Tracks in the Snow (docs/64 §4.1, docs/15 §46) on the pixel engine, built as the legends' cinematics are: a winter
// night in Moonlit Glade, painted in layers that drift apart as the camera moves (the sky and its stars, the moon and
// its halo, far snowy peaks, the hills and their forest, a snowfield in perspective with its drifts, the pines' blue
// moon-shadows and the moon's path, snow-laden pines and bushes at every depth, a snowbank in front), snow falling at
// three depths. The way in (the camera comes down from the moon, a reindeer's silhouette leaps across it into the
// bushes), the snow falling on the glade when the taps run out (an overlay over the bushes), the outro (fresh snow over
// the prints, the shiny Stantler's bow) and the glade on a loop (the rules' banner). Words come from the screen; sizes
// too (full-screen scenes draw on a stage of the screen's shape, the FX lab on the usual 240 × 160).
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  glow,
  label,
  labelWidth,
  lerp,
  Particles,
  rect,
  ring,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, spriteSize } from '../sprites'
import { H, W, type Timeline } from '../timeline'
import { tri } from './cinema/kit'
import { moonSprite } from './nightmare'
import { quiet, type PortalLoop, type SceneSize } from './portal'

/** The glade's palette: the winter night's blues, the moon's creams, the snow's whites and the bushes' pine greens. */
export const TS = {
  night: '#050a1a',
  deep: '#0b1530',
  dark: '#14224a',
  mid: '#1f3366',
  blue: '#2e4a8a',
  dusk: '#3d5c9e',
  haze: '#5a74b2',
  snow: '#f4f8ff',
  snowLit: '#ffffff',
  snowShade: '#c4d2ee',
  snowDeep: '#8ea2d2',
  snowDark: '#5c6fa6',
  pine: '#1d4a3c',
  pineDark: '#0f2c26',
  pineLit: '#2f6c52',
  moon: '#f3efd6',
  ice: '#c8f4ff',
  gold: '#ffd23a',
  coat: '#7a4a28',
  /** A silhouette against the moon: near black, a little blue. */
  sil: '#050816',
} as const

const SNOW_RAMP = [TS.snowLit, TS.snow, TS.snowShade] as const

// ---------------------------------------------------------------- the bushes (also the glade's buttons)

/**
 * A snowy bush, `r` art pixels round, standing on (x, y): a mound of pine greens in three lumps with a cap of snow on
 * each, lit from the moon. `shake`: its rustle (−1..1, pixels sideways at the top). Cached per size and shake.
 */
export function bushSprite(r: number, shake = 0): Canvas {
  const s = Math.round(shake)
  return cached(`ts-bush|${r}|${s}`, () => {
    const w = r * 3 + 4
    const h = r * 2 + 3
    const c = canvas(w, h)
    const g = c.g
    const cx = Math.round(w / 2)
    const lumps: [number, number, number][] = [
      [cx - r, h - r, r],
      [cx + r, h - r, r],
      [cx, h - Math.round(r * 1.35), Math.round(r * 1.1)],
    ]
    for (const [x, y, rr] of lumps) ellipse(g, x + (y < h - r ? s : 0), y, rr, rr, TS.pineDark)
    for (const [x, y, rr] of lumps) ellipse(g, x + (y < h - r ? s : 0) - 1, y - 1, rr - 1, rr - 1, TS.pine)
    for (const [x, y, rr] of lumps) {
      const sx = x + (y < h - r ? s : 0)
      // Its snow cap: the top third of each lump, a lit rim and a shade under it.
      ellipse(
        g,
        sx,
        y - Math.round(rr * 0.55),
        Math.round(rr * 0.85),
        Math.max(1, Math.round(rr * 0.45)),
        TS.snowShade,
      )
      ellipse(
        g,
        sx - 1,
        y - Math.round(rr * 0.65),
        Math.round(rr * 0.7),
        Math.max(1, Math.round(rr * 0.35)),
        TS.snow,
      )
      rect(g, sx - Math.round(rr * 0.3), y - rr, Math.max(1, Math.round(rr * 0.4)), 1, TS.snowLit)
    }
    // A few needles poking through the snow.
    for (let i = 0; i < r; i++) rect(g, cx - r + ((i * 7) % (r * 2)), h - 2 - ((i * 5) % r), 1, 1, TS.pineLit)
    return c
  })
}

/**
 * A bush searched, `r` round, the same box as `bushSprite`: its two side lumps pushed apart, their snow shaken off,
 * and the trampled hollow between them (where the prints and what it held show). Cached per size.
 */
export function openBushSprite(r: number): Canvas {
  return cached(`ts-bush-open|${r}`, () => {
    const w = r * 3 + 4
    const h = r * 2 + 3
    const c = canvas(w, h)
    const g = c.g
    const cx = Math.round(w / 2)
    // The hollow: trampled snow, bluer, dithered.
    ellipse(g, cx, h - Math.round(r * 0.5), Math.round(r * 1.1), Math.round(r * 0.45), TS.snowDeep)
    ellipse(g, cx, h - Math.round(r * 0.55), Math.round(r * 0.9), Math.round(r * 0.3), TS.snowShade)
    for (const side of [-1, 1]) {
      const x = cx + side * Math.round(r * 1.25)
      const y = h - r + 1
      ellipse(g, x, y, r - 1, r - 1, TS.pineDark)
      ellipse(g, x - side, y - 1, r - 2, r - 2, TS.pine)
      // A little snow left on top.
      rect(g, x - Math.round(r * 0.3), y - r + 2, Math.max(1, Math.round(r * 0.5)), 1, TS.snowShade)
    }
    return c
  })
}

// ---------------------------------------------------------------- the pines

/**
 * A pine `hgt` art pixels tall, laden with snow: tiers of dark boughs from the widest at the bottom, each drawn over
 * the one under it, the snow lying thick on its upper slopes (lit on the moon's side, `lit` −1 left or 1 right, shaded
 * on the other) with a clump hanging at each tip, a ragged skirt of needles under it. Cached.
 */
export function pineSprite(hgt: number, seed: number, lit: -1 | 1 = -1): Canvas {
  return cached(`ts-pine|${hgt}|${seed}|${lit}`, () => {
    const r = rng(seed * 97 + hgt)
    const tiers = clamp(Math.round(hgt / 11), 3, 8)
    const trunk = Math.max(2, Math.round(hgt * 0.09))
    const crown = hgt - trunk
    const maxHalf = Math.max(3, Math.round(hgt * 0.26))
    const w = maxHalf * 2 + 5
    const c = canvas(w, hgt + 2)
    const g = c.g
    const cx = Math.floor(w / 2)
    const tw = Math.max(1, Math.round(hgt * 0.035))
    rect(g, cx - tw, hgt - trunk - 2, tw * 2 + 1, trunk + 3, '#170f1e')
    rect(g, cx - tw, hgt - trunk - 2, 1, trunk + 3, '#2a2034')
    for (let i = tiers - 1; i >= 0; i--) {
      const a = Math.round((crown * i) / (tiers + 0.7))
      const b = Math.min(crown, Math.round((crown * (i + 1.75)) / (tiers + 0.7)))
      const hw = Math.max(2, Math.round(maxHalf * (0.25 + (0.75 * (i + 1)) / tiers)) + r.int(-1, 1))
      // The bough: dark, a shade lighter on the moon's side, the shadow of its own skirt under it, its tips drooping.
      tri(g, cx, a, cx - hw, b, cx + hw, b, TS.pineDark)
      tri(g, cx, a + 2, cx + lit * (hw - 1), b - 1, cx, b - 1, '#1a4236')
      for (let x = -hw; x <= hw; x += 2) rect(g, cx + x, b, 1, 1 + ((x + i) & 1), '#0a1f1b')
      rect(g, cx - hw + 1, b - 1, hw * 2 - 1, 1, '#0a1f1b')
      rect(g, cx - hw - 1, b, 2, 1, TS.pineDark)
      rect(g, cx + hw, b, 2, 1, TS.pineDark)
      // The snow on its boughs: a crust along both slopes (lit on the moon's side, dim on the other), pillows
      // heaped on it here and there, and snow piled on each tip; the dark needles show under it.
      for (let x = -hw + 1; x <= hw - 1; x++) {
        const top = Math.round(a + (Math.abs(x) / hw) * (b - a)) - 1
        const onLit = Math.sign(x) === lit || x === 0
        const pillow = Math.sin(x * 0.9 + i * 2.3 + seed) > 0.4 && Math.abs(x) > hw * 0.25 ? 1 : 0
        rect(g, cx + x, top, 1, 1, onLit ? TS.snowLit : TS.snowShade)
        rect(g, cx + x, top + 1, 1, 1, onLit ? TS.snow : TS.snowDeep)
        if (pillow) rect(g, cx + x, top + 2, 1, 1, onLit ? TS.snowShade : TS.snowDark)
      }
      for (const side of [-1, 1] as const) {
        const tx = cx + side * hw
        const on = side === lit
        const cw = Math.max(2, Math.round(hw * 0.35))
        const x0 = side < 0 ? tx - 1 : tx - cw + 2
        rect(g, x0, b - 3, cw, 1, on ? TS.snowLit : TS.snowShade)
        rect(g, x0, b - 2, cw, 2, on ? TS.snow : TS.snowDeep)
        rect(g, x0 + (side < 0 ? 0 : 1), b, cw - 1, 1, on ? TS.snowShade : TS.snowDark)
      }
    }
    // Its tip: a cap of snow.
    rect(g, cx - 1, 0, 3, 2, TS.snow)
    rect(g, cx, 0, 1, 1, TS.snowLit)
    return c
  })
}

// ---------------------------------------------------------------- the glade, in layers

/** A pine or a bush standing in the glade: x in stage pixels, `d` its depth (0 the horizon, 1 the stage's foot). */
export interface Prop {
  kind: 'pine' | 'bush'
  x: number
  d: number
  /** A pine's height, a bush's radius. */
  size: number
  seed: number
}

export interface Glade {
  w: number
  h: number
  /** The stage's height above the screen's words. */
  hv: number
  horizon: number
  moon: { x: number; y: number; R: number }
  /** Pixels of margin on each side of the layers, for the camera's drift. */
  M: number
  far: Canvas
  hills: Canvas
  forest: Canvas
  field: Canvas
  bank: Canvas
  props: Prop[]
  stars: { x: number; y: number; ph: number; big: boolean }[]
  glints: { x: number; d: number; ph: number }[]
}

/** How the camera sees the glade this frame: its drift (pan, px at the nearest depth) and its tilt (px, down). */
export interface View {
  t: number
  pan?: number
  tilt?: number
  still?: boolean
  /** A prop's rustle this frame (pixels at its top), by index. */
  shake?: (i: number) => number
  /** Props drawn parted (a bush searched): by index. */
  open?: ReadonlySet<number>
}

const M = 24
/** How far a depth drifts with the camera: the horizon a third as much as the field's foot. */
const drift = (d: number) => lerp(0.32, 1.1, clamp(d))
/** The ground's y at depth d. */
export const groundY = (gl: Glade, d: number) => Math.round(gl.horizon + d * (gl.hv - gl.horizon))
/** A depth's drift this frame, in whole pixels. */
export const panAt = (v: View, d: number) => Math.round((v.pan ?? 0) * drift(d))

/** A triangle wave, peaks at the halves: ridges with points, not hills. */
const tw = (u: number) => 1 - Math.abs((u - Math.floor(u)) * 2 - 1)

function farPeaks(w: number, horizon: number, amp: number, moonX: number, seed: number): Canvas {
  const top = (x: number) =>
    horizon -
    2 -
    amp *
      ((0.6 * tw(x * 0.011 + seed) + 0.3 * tw(x * 0.027 + seed * 1.7) + 0.1 * tw(x * 0.071 + seed * 2.9)) *
        0.85 +
        0.15 * Math.sin(x * 0.005 + seed))
  return shade(w, horizon + 1, (x, y) => {
    const t0 = top(x)
    if (y < t0) return null
    const dy = y - t0
    const slope = top(x + 1) - top(x - 1)
    // Faces turned to the moon catch its light (snow, pale); the rest are in the blue shade.
    const lit = x < moonX ? slope > 0.05 : slope < -0.05
    if (dy < 1) return lit ? '#dce6fa' : '#8ea2d2'
    // Snow gullies down the faces, rock ribs between them.
    const gully = Math.sin(x * 0.8 + dy * 0.45 + Math.sin(x * 0.13) * 2) > 0.7
    const c = lit
      ? gully
        ? '#7d92c8'
        : dy < 4
          ? '#b4c4ea'
          : '#9fb2de'
      : gully
        ? '#4a66a8'
        : dy < 3
          ? '#3d5c9e'
          : '#2e4a8a'
    // The haze rising from the valley at their foot.
    const base = clamp((y - (horizon - amp * 0.3)) / (amp * 0.3))
    return base > bayer(x, y) ? '#4a66a8' : c
  })
}

function nearHills(w: number, horizon: number, amp: number, seed: number): Canvas {
  const top = (x: number) =>
    horizon - amp * (0.55 + 0.3 * Math.sin(x * 0.024 + seed) + 0.15 * Math.sin(x * 0.061 + seed * 2))
  return shade(w, horizon + 1, (x, y) => {
    const t0 = Math.round(top(x))
    if (y < t0) return null
    const dy = y - t0
    if (dy < 1) return '#8ea2d2'
    if (dy < 3) return bayer(x, y) < 0.6 ? '#5c6fa6' : '#3a5294'
    return dy < 6 && bayer(x, y) < 0.3 ? '#3a5294' : '#263e78'
  })
}

/**
 * The forest along the horizon, in two rows: a far one, hazy, and a near one, a dark crowd of pines (each a spike with
 * snow on its moon side and on its tiers), mist rising at their feet.
 */
function forestRow(w: number, horizon: number, tall: number, seed: number): Canvas {
  const r = rng(seed)
  const row = (n: number, hMin: number, hMax: number) =>
    Array.from({ length: n }, () => {
      const ht = r.range(hMin, hMax) * tall
      return { x: r.range(-6, w + 6), ht, hw: Math.max(1.5, ht * r.range(0.26, 0.34)) }
    })
  const far = row(Math.round(w / 4), 0.4, 0.8)
  const near = row(Math.round(w / 6), 0.45, 1)
  // The tallest tree over each column, and how far into it the column is (for its lit side).
  const prof = (trees: typeof far, x: number) => {
    let best = 0
    let side = 0
    let tier = 0
    for (const t of trees) {
      const dx = x - t.x
      const v = t.ht * (1 - Math.abs(dx) / t.hw)
      if (v > best) {
        best = v
        side = Math.sign(dx)
        tier = t.ht
      }
    }
    return { top: horizon + 1 - best, side, tier }
  }
  const mist = Math.max(2, Math.round(tall * 0.35))
  return shade(w, horizon + 2, (x, y) => {
    const n = prof(near, x)
    if (y >= n.top) {
      // A dark spike, its edge on the moon's side lit, the mist at its foot.
      if (y - n.top < 1 && n.side < 0) return '#6e84bc'
      if (bayer(x, y) < 0.6 * span(y, horizon - mist, horizon + 1)) return '#3d5c9e'
      return '#0b1636'
    }
    const f = prof(far, x)
    if (y >= f.top) return y - f.top < 1 ? '#4a66a8' : '#22386e'
    return null
  })
}

/**
 * The snowfield from the horizon down, wider than the stage by the margins: lit snow far off, bluer toward the front,
 * the moon's path shining on it, drifts in perspective (a lit crest, a blue shade under it, deeper the nearer) and the
 * long blue shadows the moon throws from the pines and bushes toward us.
 */
function snowfield(gl: Omit<Glade, 'field' | 'bank'>, wide: number): Canvas {
  const { horizon, hv, h, moon } = gl
  const fh = h - horizon
  const span0 = hv - horizon
  const stops: [number, string][] = [
    [0, '#8ea2d2'],
    [0.05, '#b4c4ea'],
    [0.22, '#e6eefc'],
    [0.45, '#d8e4f8'],
    [0.75, '#b8c8ec'],
    [1, '#98aad8'],
    [1.6, '#7d92c8'],
  ]
  const colAt = (d: number, x: number, y: number) => {
    let i = 0
    while (i < stops.length - 2 && d > stops[i + 1]![0]) i++
    const [d0, c0] = stops[i]!
    const [d1, c1] = stops[i + 1]!
    return clamp((d - d0) / (d1 - d0)) > bayer(x, y) ? c1 : c0
  }
  const mx = moon.x + M
  const cv = shade(wide, fh, (x, y) => {
    const d = y / span0
    // The moon's path: a lit column under it, widening toward us, fading as it comes.
    const pw = moon.R * (0.35 + d * 1.1)
    const lit = (1 - Math.abs(x - mx) / pw) * (1 - d * 0.9)
    if (lit > bayer(x, y) * 0.9) return lit > 0.55 && bayer(x + 1, y) < lit - 0.3 ? TS.snowLit : '#eef4ff'
    return colAt(d, x, y)
  })
  const g = cv.g
  const r = rng(fh * 7 + wide)
  // The drifts: rows of crests, closer together far off.
  const N = Math.max(6, Math.round(span0 / 9))
  for (let j = 0; j < N; j++) {
    const d = Math.pow((j + 0.6) / N, 1.7)
    const y0 = d * span0
    const amp = 0.5 + d * 3
    const th = 1 + Math.round(d * 3)
    const ph = r.range(0, 6)
    const f = 0.05 / (0.35 + d)
    for (let x = 0; x < wide; x++) {
      if (Math.sin(x * f * 0.7 + j * 1.9) < -0.15) continue
      const y = Math.round(y0 + amp * Math.sin(x * f + ph) + amp * 0.4 * Math.sin(x * f * 2.6 + ph * 2))
      rect(g, x, y - 1, 1, 1, '#ffffff')
      for (let k = 0; k < th; k++) if (bayer(x, y + k) < 0.75 - k * 0.18) rect(g, x, y + k, 1, 1, '#9fb2de')
    }
  }
  // The moon-shadows: from each prop's foot toward us and away from the moon, longer the taller it stands.
  for (const p of gl.props) {
    const by = (groundY(gl as Glade, p.d) - horizon) | 0
    const x = p.x + M
    const tall = p.kind === 'pine' ? p.size : p.size * 2
    const wd = p.kind === 'pine' ? p.size * 0.18 : p.size * 1.2
    const len = tall * (0.45 + p.d * 0.5)
    const lean = ((p.x - moon.x) / Math.max(1, gl.w)) * len * 1.2
    tri(g, x - wd, by, x + wd, by, x + lean + wd * 1.6, by + len, '#b0c0e8')
    tri(g, x - wd, by, x + lean + wd * 1.6, by + len, x + lean - wd * 0.8, by + len, '#b0c0e8')
    ellipse(g, x, by + 1, Math.round(wd * 1.1 + 2), Math.max(1, Math.round(1 + p.d * 2)), '#9fb2de')
  }
  rect(g, 0, 0, wide, 1, '#b4c4ea')
  return cv
}

/** The snowbank in front: a lumpy crest lit by the moon, in shade under it, down to the stage's foot. */
function snowbank(w: number, h: number, hv: number, seed: number): Canvas {
  const tall = Math.max(4, Math.round(hv * 0.06))
  const y0 = hv - tall
  const top = (x: number) =>
    Math.round(y0 + 1.6 * Math.sin(x * 0.045 + seed) + 1.2 * Math.sin(x * 0.13 + seed * 3) + 1)
  return shade(w, h - y0 + 4, (x, yy) => {
    const y = yy + y0 - 3
    const t0 = top(x)
    if (y < t0) return null
    const dy = y - t0
    if (dy < 1) return '#d8e4f8'
    if (dy < 2) return '#9fb2de'
    if (dy < 5) return bayer(x, y) < 0.5 ? '#6a7fb6' : '#56689e'
    // Under the stage (the screen's words over it): darkening into the night.
    const k = clamp((y - hv) / Math.max(8, (h - hv) * 0.8))
    const cols = ['#56689e', '#3a4f8a', '#24386e', '#14224a'] as const
    const f = k * (cols.length - 1)
    const i = Math.floor(f)
    return f - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
  })
}

/** The glade's stars: none in the moon's light. */
function gladeStars(r: Rng, w: number, horizon: number, moon: Glade['moon']) {
  const out: Glade['stars'] = []
  const n = Math.max(10, Math.round((w * horizon) / 150))
  for (let i = 0; i < n; i++) {
    const x = r.int(0, w - 1)
    const y = r.int(0, Math.round(horizon * 0.85))
    if (Math.hypot(x - moon.x, y - moon.y) < moon.R * 1.6) continue
    out.push({ x, y, ph: r.int(0, 6), big: r() < 0.1 })
  }
  return out
}

/**
 * The glade on a stage w × h (`hv` above the screen's words): its horizon, its moon, its props as [x share of the
 * width, depth, size share] (a pine's height in parts of the stage, a bush's radius in parts of 10 px). Cached.
 */
export function buildGlade(
  w: number,
  h: number,
  hv: number,
  o: {
    horizon: number
    moon: Glade['moon']
    pines: readonly (readonly [number, number, number])[]
    bushes: readonly (readonly [number, number, number])[]
    seed: number
  },
): Glade {
  const key = `ts-glade|${w}|${h}|${hv}|${o.horizon}|${o.moon.x},${o.moon.y},${o.moon.R}|${o.seed}|${JSON.stringify(o.pines)}|${JSON.stringify(o.bushes)}`
  return cached(key, () => {
    const r = rng(o.seed)
    const wide = w + M * 2
    const unit = Math.min(hv, w * 0.9)
    const props: Prop[] = [
      ...o.pines.map(([xf, d, s], i) => ({
        kind: 'pine' as const,
        x: Math.round(w * xf),
        d,
        size: Math.max(8, Math.round(unit * s)),
        seed: o.seed + i,
      })),
      ...o.bushes.map(([xf, d, s], i) => ({
        kind: 'bush' as const,
        x: Math.round(w * xf),
        d,
        size: Math.max(3, Math.round(s * lerp(3.5, 9, d) * (unit / 160))),
        seed: o.seed + 50 + i,
      })),
    ].sort((a, b) => a.d - b.d)
    const base = { w, h, hv, horizon: o.horizon, moon: o.moon, M, props }
    const peaks = Math.max(8, Math.round(hv * 0.26))
    const gl: Omit<Glade, 'field' | 'bank'> = {
      ...base,
      far: farPeaks(wide, o.horizon - 1, peaks, o.moon.x + M, (o.seed % 7) + 0.3),
      hills: nearHills(wide, o.horizon, Math.max(3, Math.round(hv * 0.045)), (o.seed % 5) + 1),
      forest: forestRow(wide, o.horizon, Math.max(5, Math.round(hv * 0.1)), o.seed + 3),
      stars: gladeStars(r, w, o.horizon, o.moon),
      glints: Array.from({ length: Math.max(8, Math.round(w / 9)) }, () => ({
        x: r.int(0, w - 1),
        d: Math.pow(r(), 1.4),
        ph: r.range(0, 4),
      })),
    }
    return { ...gl, field: snowfield(gl, wide), bank: snowbank(wide, h, hv, o.seed % 9) }
  })
}

/** The sky down to the horizon: black-blue at the top to a pale haze at the horizon, ordered-dithered. Cached. */
const gladeSky = (w: number, h: number, horizon: number): Canvas =>
  cached(`ts-sky|${w}|${h}|${horizon}`, () => {
    const cols = [TS.night, TS.deep, TS.dark, TS.mid, TS.blue, TS.dusk, TS.haze]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, horizon)), 1.5) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/** The moon with its light: a wide faint glow in the air, a closer one, the halo's ring of ice, the disc. */
export function winterMoon(g: G, x: number, y: number, R: number, k = 1) {
  const q = Math.round(clamp(k) * 4) / 4
  if (q > 0) {
    const a = Math.round(R * 2.8)
    g.drawImage(glow(a, '#22407e', 1.1, 0.55 * q), x - a, y - a)
    const b = Math.round(R * 1.8)
    g.drawImage(glow(b, '#3d5ea6', 1.5, 0.7 * q), x - b, y - b)
    const c = Math.round(R * 1.28)
    g.drawImage(glow(c, '#a8bce8', 2.2, 0.55 * q), x - c, y - c)
    const hr = Math.round(R * 2.3)
    g.drawImage(ring(hr, 3, '#5a78bc', 0.5 * q), x - hr - 1, y - hr - 1)
  }
  g.drawImage(moonSprite(R), x - R, y - R)
}

/**
 * The glade's back: the sky, its stars twinkling, the moon, the far peaks, the hills and their forest, the snowfield
 * (each row of it drifting at its own depth's pace) with its glints. The props come after (`drawProps`), so a scene
 * slips its actors in between them at their depth.
 */
export function drawGladeBack(g: G, gl: Glade, v: View) {
  const { w, h, horizon, moon } = gl
  const tilt = Math.round(v.tilt ?? 0)
  const sky = Math.round(tilt * 0.35)
  g.drawImage(gladeSky(w, h, horizon), 0, 0)
  for (const s of gl.stars) {
    const f = v.still ? 0 : (Math.floor(v.t * 2.5) + s.ph) % 7
    if (f === 6) continue
    const x = s.x + Math.round((v.pan ?? 0) * 0.05)
    const y = s.y + sky
    const c = f === 0 && s.big ? '#ffffff' : f === 3 ? '#6a82c4' : '#b4c4f0'
    rect(g, x, y, 1, 1, c)
    if (s.big && f < 2) {
      rect(g, x - 1, y, 3, 1, '#8aa0d8')
      rect(g, x, y - 1, 1, 3, '#8aa0d8')
    }
  }
  winterMoon(g, moon.x + Math.round((v.pan ?? 0) * 0.1), moon.y + sky, moon.R)
  const lay = (cv: Canvas, k: number, dy = 0) => g.drawImage(cv, Math.round(-M + (v.pan ?? 0) * k), tilt + dy)
  lay(gl.far, 0.16)
  lay(gl.hills, 0.24)
  lay(gl.forest, 0.3)
  const fh = gl.field.height
  const top = horizon + tilt
  for (let y = 0; y < fh && top + y < h; y++) {
    const d = y / (gl.hv - horizon)
    g.drawImage(
      gl.field,
      0,
      y,
      gl.field.width,
      1,
      Math.round(-M + (v.pan ?? 0) * drift(d)),
      top + y,
      gl.field.width,
      1,
    )
  }
  // Glints in the snow: a pixel catching the moon now and then, a cross near us.
  if (!v.still)
    for (const s of gl.glints) {
      const f = (v.t * 1.3 + s.ph) % 4
      if (f > 0.25) continue
      const x = s.x + panAt(v, s.d)
      const y = groundY(gl, s.d) + tilt
      rect(g, x, y, 1, 1, '#ffffff')
      if (s.d > 0.5 && f < 0.12) {
        rect(g, x - 1, y, 3, 1, '#ffffff')
        rect(g, x, y - 1, 1, 3, '#ffffff')
      }
    }
}

/** The props standing between depths `from` and `to` (to excluded), back to front. */
export function drawProps(g: G, gl: Glade, v: View, from = -1, to = 9) {
  const tilt = Math.round(v.tilt ?? 0)
  gl.props.forEach((p, i) => {
    if (p.d < from || p.d >= to) return
    const x = p.x + panAt(v, p.d)
    const y = groundY(gl, p.d) + tilt
    const im =
      p.kind === 'pine'
        ? pineSprite(p.size, p.seed, p.x < gl.moon.x ? 1 : -1)
        : v.open?.has(i)
          ? openBushSprite(p.size)
          : bushSprite(p.size, clamp(v.shake?.(i) ?? 0, -2, 2))
    g.drawImage(im, Math.round(x - im.width / 2), y - im.height + (p.kind === 'pine' ? 2 : 1))
  })
}

/** The snowbank in front of everything, drifting most. */
export function drawBank(g: G, gl: Glade, v: View) {
  const y0 = gl.hv - Math.max(4, Math.round(gl.hv * 0.06)) - 3
  g.drawImage(gl.bank, Math.round(-M + (v.pan ?? 0) * 1.35), y0 + Math.round(v.tilt ?? 0))
}

/** A prop's foot on the stage this frame. */
export const propAt = (gl: Glade, v: View, i: number) => {
  const p = gl.props[i]!
  return { x: p.x + panAt(v, p.d), y: groundY(gl, p.d) + Math.round(v.tilt ?? 0), p }
}

// ---------------------------------------------------------------- snow, at three depths

/**
 * Snowflakes on a stage `w` wide: `rate` new ones a step, each at a depth: far ones small, dim and slow, near ones big,
 * bright and quick, all drifting with the wind (`wind`, px a second at the front). Heavy snow comes in all over the
 * sky at once (some flakes start part way down), so a sudden fall fills the stage rather than a band at its top.
 */
function feedSnow(P: Particles, r: Rng, w: number, h: number, rate: number, heavy = false, wind = -5) {
  const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const d = r()
    // A tall full-screen stage falls as fast in its own height as the lab's: the snow reaches the ground in time.
    const vy = lerp(9, 30, d) * (heavy ? 1.5 : 1) * r.range(0.85, 1.15) * Math.max(1, h / 200)
    P.add({
      x: r.range(-20, w + 20),
      y: heavy && r() < 0.5 ? r.range(-3, h * 0.7) : -3,
      vx: wind * lerp(0.4, 1.3, d) + r.range(-3, 3),
      vy,
      life: (h + 6) / vy,
      size: d > (heavy ? 0.6 : 0.82) ? 2 : 1,
      shape: 'flake',
      colors: d < 0.35 ? ['#8ea2d2'] : d < 0.75 ? ['#d8e4f8'] : ['#ffffff'],
    })
  }
}

/** Snow that has fallen for a while already: the first frame isn't empty. */
function warmSnow(P: Particles, r: Rng, w: number, h: number, rate: number) {
  for (let i = 0; i < Math.round(h / 4); i++) {
    feedSnow(P, r, w, h, rate)
    P.update(1 / 15)
  }
}

/** Snow thrown up from the ground at (x, y): `n` flakes and clods arcing out and falling back. */
function kickSnow(P: Particles, r: Rng, x: number, y: number, n: number, spread: number, up = 1) {
  for (let i = 0; i < n; i++)
    P.add({
      x: x + r.range(-spread, spread),
      y: y - r.range(0, 4),
      vx: r.range(-45, 45) * (spread / 10 + 0.5),
      vy: -r.range(25, 85) * up,
      ay: 170,
      drag: 0.6,
      life: r.range(0.45, 0.95),
      size: r() < 0.35 ? 2 : 1,
      shape: r() < 0.5 ? 'flake' : 'sq',
      colors: SNOW_RAMP,
    })
}

/** A cloud of powder snow at (x, y), billowing out and thinning away. */
function puff(P: Particles, r: Rng, x: number, y: number, n: number, spread: number) {
  for (let i = 0; i < n; i++)
    P.add({
      x: x + r.range(-spread, spread),
      y: y - r.range(0, spread * 0.4),
      vx: r.range(-30, 30),
      vy: -r.range(5, 25),
      drag: 2.5,
      life: r.range(0.6, 1.1),
      size: r.int(2, 3),
      size1: r.int(5, 8),
      shape: 'smoke',
      colors: [TS.snowLit, TS.snow, TS.snowShade],
    })
}

// ---------------------------------------------------------------- the actors

/** How a Pokémon stands: squash and stretch, a lean about a point on its feet line, its head moved (a bow). */
export interface Pose {
  sx?: number
  sy?: number
  /** Radians, clockwise; about (x + pivot, y). */
  angle?: number
  pivot?: number
  flip?: boolean
  /** A silhouette in this colour (none: the sprite itself). */
  body?: string
  /** Its rim of light: the silhouette in this colour, a pixel out toward each of `rimDir`. */
  rim?: string
  rimDir?: readonly (readonly [number, number])[]
  /** Its rows above `cut` (a share of its height) moved by (dx, dy): its head lowered, raised. */
  head?: { cut: number; dx: number; dy: number }
  /** Only what lies above this y shows (sinking into a bush). */
  clipBelow?: number
}

function part(
  g: G,
  key: string,
  x: number,
  y: number,
  o: Parameters<typeof drawSprite>[4],
  head?: Pose['head'],
) {
  if (!head || (!head.dx && !head.dy)) return drawSprite(g, key, x, y, o)
  const fh = spriteSize(key).h * (o?.sy ?? 1)
  const cut = Math.round(y - fh + head.cut * fh)
  g.save()
  g.beginPath()
  g.rect(-9999, cut + Math.min(0, head.dy), 19999, 19999)
  g.clip()
  drawSprite(g, key, x, y, o)
  g.restore()
  g.save()
  g.beginPath()
  g.rect(-9999, -9999, 19999, cut + head.dy + 9999)
  g.clip()
  drawSprite(g, key, x + head.dx, y + head.dy, o)
  g.restore()
}

/** A Pokémon posed: its rim of light first, then it (or its silhouette) over it. */
export function drawPose(g: G, key: string, x: number, y: number, o: Pose = {}) {
  g.save()
  if (o.clipBelow != null) {
    g.beginPath()
    g.rect(-9999, -9999, 19999, o.clipBelow + 9999)
    g.clip()
  }
  if (o.angle) {
    const px = x + (o.pivot ?? 0)
    g.translate(px, y)
    g.rotate(o.angle)
    g.translate(-px, -y)
  }
  const look = { sx: o.sx, sy: o.sy, flip: o.flip }
  if (o.rim)
    for (const [dx, dy] of o.rimDir ?? [[0, -1]])
      part(g, key, x + dx, y + dy, { ...look, sil: o.rim }, o.head)
  part(g, key, x, y, { ...look, sil: o.body }, o.head)
  g.restore()
}

/** Which way the moon's light rims something at (x, y): a pixel toward it, up and to its side. */
export const rimToward = (moon: { x: number; y: number }, x: number, y: number): [number, number][] => {
  const sx = Math.abs(moon.x - x) < 6 ? 0 : Math.sign(moon.x - x)
  return sx
    ? [
        [sx, 0],
        [0, y > moon.y ? -1 : 1],
      ]
    : [
        [-1, 0],
        [1, 0],
        [0, -1],
      ]
}

/** Shiny sparkles: four-point stars popping on and round a Pokémon, one after another. */
export function sparkle(P: Particles, r: Rng, x: number, y: number, w: number, hgt: number, n = 6) {
  for (let i = 0; i < n; i++)
    P.add({
      x: x + r.range(-w * 0.5, w * 0.5),
      y: y - r.range(hgt * 0.2, hgt * 1.05),
      delay: i * 0.07,
      life: 0.45,
      size: 3,
      size1: 0,
      shape: 'star',
      colors: ['#ffffff', '#fff3a0', TS.gold],
    })
}

// ---------------------------------------------------------------- the card

/**
 * The glade's card, in the cinematics' manner: a slanted band of the night's blues sweeping in from the left (the
 * moon's cream on top with snow lying along it, ice under it with icicles hanging), then the title wiped in beside a
 * small moon once the band has settled (never cut by the screen's edge), a glint across it, two hoofprints at its end.
 * `q`: seconds since it began.
 */
function gladeCard(g: G, w: number, y0: number, q: number, title: string) {
  const s = labelWidth(g, title, 2) + 70 <= w ? 2 : 1
  const h = s === 2 ? 28 : 20
  const pin = ease.outExpo(span(q, 0, 0.35))
  const x = Math.round(-w * 1.1 * (1 - pin))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 ? TS.moon : y === h - 1 ? TS.ice : y < 3 ? TS.blue : bayer(y, y * 3) < y / h ? TS.dark : TS.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  // Snow along its top, icicles under it.
  for (let i = 0; i < w + 20; i += 1) {
    const bx = x + i - 10 + Math.round(h * 0.6)
    const lump = Math.round(1 + Math.sin(i * 0.31) + Math.sin(i * 0.11 + 1))
    if (lump > 0) rect(g, bx, y0 - lump, 1, lump, i % 9 === 0 ? TS.snowShade : TS.snow)
    if (i % 11 === 3) rect(g, x + i - 10, y0 + h, 1, 2 + (i % 3), TS.ice)
    if (i % 11 === 3) rect(g, x + i - 10, y0 + h + 2 + (i % 3), 1, 1, '#7ad0f0')
  }
  const R = s === 2 ? 6 : 4
  const mx = x + 16
  const my = y0 + Math.round(h / 2)
  g.drawImage(glow(R + 3, '#a8bce8', 1.6, 0.6), mx - R - 3, my - R - 3)
  g.drawImage(moonSprite(R), mx - R, my - R)
  const tx = mx + R + 7
  const ty = y0 + Math.round((h - 7 * s) / 2)
  const tw0 = labelWidth(g, title, s)
  const wipe = ease.outC(span(q, 0.25, 0.55))
  if (wipe > 0) {
    g.save()
    g.beginPath()
    g.rect(tx - 2, y0, Math.ceil((tw0 + 6) * wipe), h)
    g.clip()
    label(g, title, tx, ty, '#ffffff', TS.night, s)
    g.restore()
  }
  const gp = span(q, 0.75, 1.1)
  if (gp > 0 && gp < 1) {
    g.save()
    g.beginPath()
    const gx = tx + lerp(-20, tw0 + 20, gp)
    g.moveTo(gx, ty - 2)
    g.lineTo(gx + 6, ty - 2)
    g.lineTo(gx - 2, ty + 7 * s + 2)
    g.lineTo(gx - 8, ty + 7 * s + 2)
    g.clip()
    label(g, title, tx, ty, TS.ice, null, s)
    g.restore()
  }
  // Two hoofprints at its end, where there's room.
  const px0 = tx + tw0 + 10
  if (wipe >= 1 && px0 + 12 < w - 6)
    for (const [dx, dy] of [
      [0, 2],
      [6, -2],
    ] as const) {
      rect(g, px0 + dx, my + dy - 2, 2, 4, TS.snowDeep)
      rect(g, px0 + dx + 3, my + dy - 2, 2, 4, TS.snowDeep)
      rect(g, px0 + dx, my + dy - 2, 2, 1, TS.ice)
      rect(g, px0 + dx + 3, my + dy - 2, 2, 1, TS.ice)
    }
}

/** The letterbox bars, `n` rows each. */
function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, TS.night)
  rect(g, 0, h - n, w, n, TS.night)
}

/** Where the card sits: above the screen's words and the bottom bar. */
const cardY = (hv: number, barN: number) => hv - barN - (hv > 200 ? 46 : 36)

// ---------------------------------------------------------------- the way in

export interface TracksIntroParams extends SceneSize {
  /** On the card (the feature's name, in the player's language). */
  title: string
  /** Stantler's front sprite key: only its silhouette shows, leaping. */
  mon: string
  short?: boolean
}

type IntroState = { r: Rng; gl: Glade; snow: Particles; front: Particles; fx: Particles }

/** The glade's moon and horizon on a stage `w` × `hv`. */
function gladeFrame(w: number, hv: number) {
  const R = Math.round(clamp(Math.min(w * 0.17, hv * 0.19), 12, 64))
  return {
    horizon: Math.round(hv * 0.6),
    moon: { x: Math.round(w * 0.47), y: Math.max(R + 6, Math.round(hv * 0.29)), R },
  }
}

/** The way in's glade: framing pines left and right, more back toward the forest, the bushes it lands in on the right. */
const INTRO_PINES = [
  [0.03, 0.95, 0.95],
  [0.98, 0.78, 0.7],
  [0.25, 0.16, 0.3],
  [0.36, 0.06, 0.18],
  [0.64, 0.04, 0.16],
  [0.9, 0.2, 0.34],
  [0.56, 0.01, 0.1],
  [0.13, 0.04, 0.15],
] as const
const INTRO_BUSHES = [
  [0.72, 0.3, 1.2],
  [0.86, 0.33, 1.3],
  [0.79, 0.4, 2.1],
  [0.3, 0.58, 1.3],
  [0.47, 0.2, 0.9],
  [0.6, 0.72, 1.5],
  [0.16, 0.8, 1.7],
  [0.95, 0.55, 1.3],
] as const
/** The bush it lands behind (index into the props, which are sorted by depth). */
const LAND_BUSHES = [0.72, 0.86, 0.79]

/**
 * The way in: the night comes out of the dark, the camera coming down from the stars and the moon to the glade (each
 * layer at its own pace), snow falling; a reindeer's silhouette (Stantler's, solid, rimmed with moonlight) trots out
 * from behind a pine, crouches, leaps in a high arc across the moon and drops into the bushes on the right, which throw
 * up their snow and shake (`beat('line')`: the screen's words); the card. It then holds its end (the snow falling, the
 * stars, the glints) until the page takes it away. `short`: half.
 */
export function tracksIntroTimeline(p: TracksIntroParams): Timeline<IntroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const fr = gladeFrame(w, hv)
  const T_IN = 0.9 * k
  const T_CROUCH = 1.45 * k
  const T_LEAP = 1.75 * k
  const T_LAND = 2.7 * k
  const T_CARD = 3.35 * k
  const DUR = 4.3 * k
  const TILT = Math.round(hv * 0.22)
  const view = (t: number): View => ({
    t,
    pan: lerp(10, -6, ease.ioS(span(t, 0, DUR))),
    tilt: TILT * (1 - ease.ioS(span(t, 0, 1.6 * k))),
  })
  return {
    id: 'tracks-intro',
    hold: true,
    dur: DUR,
    setup() {
      const r = rng(234)
      const gl = buildGlade(w, h, hv, { ...fr, pines: INTRO_PINES, bushes: INTRO_BUSHES, seed: 234 })
      const snow = new Particles()
      warmSnow(snow, r, w, h, 0.35)
      return { r, gl, snow, front: new Particles(), fx: new Particles() }
    },
    step(s, t, dt) {
      s.snow.update(dt)
      s.front.update(dt)
      s.fx.update(dt)
      feedSnow(s.snow, s.r, w, h, p.short ? 0.25 : 0.4)
      const L = leapAt(s.gl, view(t), t)
      // Snow kicked back as it takes off; moondust off its back in the air; the bushes' snow thrown up as it lands.
      if (t >= T_LEAP && t - dt < T_LEAP) {
        kickSnow(s.fx, s.r, L.x - 6, L.y, p.short ? 8 : 16, 6)
        puff(s.fx, s.r, L.x - 4, L.y, p.short ? 3 : 6, 6)
      }
      if (L.q > 0 && L.q < 1 && s.r() < 0.7)
        s.fx.add({
          x: L.x + s.r.range(-8, 4),
          y: L.y - s.r.range(L.hgt * 0.3, L.hgt * 0.8),
          vx: -s.r.range(10, 30),
          vy: s.r.range(-6, 10),
          life: s.r.range(0.4, 0.8),
          size: 1,
          shape: 'px',
          colors: [TS.ice, TS.snowShade, TS.snowDeep],
        })
      if (t >= T_LAND && t - dt < T_LAND) {
        const b = landBush(s.gl, view(t))
        puff(s.fx, s.r, b.x, b.y - b.hgt * 0.7, p.short ? 9 : 18, b.wd * 0.55)
        kickSnow(s.fx, s.r, b.x, b.y - b.hgt, p.short ? 26 : 56, b.wd * 0.55, 1.4)
        for (const i of landIdx(s.gl)) {
          const q = propAt(s.gl, view(t), i)
          kickSnow(s.fx, s.r, q.x, q.y - q.p.size * 2, p.short ? 4 : 8, q.p.size, 0.6)
        }
      }
    },
    draw(g, s, t) {
      const v = view(t)
      const gl = s.gl
      const land = landIdx(gl)
      const shaking = t >= T_LAND && t < T_LAND + 0.9 * k
      v.shake = (i) =>
        shaking && land.includes(i)
          ? Math.sin((t - T_LAND) * 46 + i) * 2.4 * (1 - span(t, T_LAND, T_LAND + 0.9 * k))
          : 0
      drawGladeBack(g, gl, v)
      s.snow.draw(g)
      const L = leapAt(gl, v, t)
      const front = landBush(gl, v)
      // It stands behind the landing bushes' front one: everything nearer is drawn over it.
      drawProps(g, gl, v, -1, front.d)
      if (L.on) {
        drawPose(g, p.mon, Math.round(L.x), Math.round(L.y), {
          flip: true,
          body: TS.sil,
          rim: TS.ice,
          rimDir: rimToward(gl.moon, L.x, L.y - L.hgt / 2),
          sx: L.sx * L.k,
          sy: L.sy * L.k,
          angle: L.angle,
          clipBelow: t >= T_LAND ? front.y - 3 : undefined,
        })
      }
      drawProps(g, gl, v, front.d)
      drawBank(g, gl, v)
      s.fx.draw(g)
      if (t < 0.6 * k + 0.2) wash(g, '#000000', 1 - span(t, 0, 0.6 * k + 0.2), 8)
      const barN = Math.round(Math.min(14, h * 0.07) * ease.outC(span(t, T_CARD - 0.2, T_CARD + 0.15)))
      bars(g, w, h, barN)
      if (t >= T_CARD) gladeCard(g, w, cardY(hv, Math.round(Math.min(14, h * 0.07))), t - T_CARD, p.title)
    },
    cues: () => [
      [0.02, () => quiet('tracks.wind')],
      [T_LEAP, () => quiet('tracks.leap')],
      [T_LAND, (hud) => (quiet('tracks.rustle'), hud.beat?.('line'))],
      [T_CARD, (hud) => hud.beat?.('card')],
    ],
  }

  /** The landing bushes' props (by index, in depth order). */
  function landIdx(gl: Glade) {
    return gl.props.flatMap((q, i) =>
      q.kind === 'bush' && LAND_BUSHES.some((xf) => Math.abs(q.x - Math.round(w * xf)) < 1) ? [i] : [],
    )
  }
  /** The front landing bush, where it vanishes. */
  function landBush(gl: Glade, v: View) {
    const idx = landIdx(gl)
    const i = idx[idx.length - 1]!
    const q = propAt(gl, v, i)
    return { x: q.x, y: q.y, d: q.p.d, hgt: q.p.size * 2 + 3, wd: q.p.size * 3 + 4 }
  }
  /**
   * Where the reindeer is at t: trotting in from behind the left pine, crouching, in the air (q 0..1, its arc's apex
   * over the moon), sinking into the bushes.
   */
  function leapAt(gl: Glade, v: View, t: number) {
    const fz = spriteSize(p.mon)
    const sc = clamp((gl.moon.R * 2) / Math.max(24, fz.h), 0.5, 1.4)
    const hgt = fz.h * sc
    const dS = 0.3
    const fb = landBush(gl, v)
    const xs = Math.round(w * 0.15) + panAt(v, dS)
    const ys = groundY(gl, dS) + Math.round(v.tilt ?? 0)
    const xl = fb.x - 4
    const yl = fb.y - Math.round(fb.hgt * 0.35)
    const apex = gl.moon.y + Math.round(hgt * 0.55) + Math.round((v.tilt ?? 0) * 0.35)
    const out = { on: t >= T_IN, x: xs, y: ys, q: 0, sx: 1, sy: 1, angle: 0, k: sc, hgt }
    if (t < T_CROUCH) {
      const q = ease.outQ(span(t, T_IN, T_CROUCH))
      out.x = Math.round(lerp(-w * 0.06, xs, q))
      out.y = ys - (q < 1 && Math.floor(t * 14) % 2 ? 1 : 0)
    } else if (t < T_LEAP) {
      const q = ease.outQ(span(t, T_CROUCH, T_LEAP))
      out.sy = 1 - 0.16 * q
      out.sx = 1 + 0.07 * q
      out.angle = 0.08 * q
    } else if (t < T_LAND) {
      const q = span(t, T_LEAP, T_LAND)
      out.q = q
      out.x = lerp(xs, xl, q * 0.8 + 0.2 * ease.ioS(q))
      const base = lerp(ys, yl, q)
      const lift = lerp(ys, yl, 0.5) - apex
      out.y = base - lift * 4 * q * (1 - q)
      out.angle = lerp(-0.42, 0.45, ease.ioS(q))
      const st = 1 - span(q, 0, 0.3) + span(q, 0.8, 1)
      out.sy = 1 + 0.12 * st
      out.sx = 1 - 0.07 * st
    } else {
      // Down into the bushes: it drops behind the front one and is gone.
      const q = ease.inQ(span(t, T_LAND, T_LAND + 0.25 * k))
      out.q = 1
      out.x = xl + 3 * q
      out.y = yl + hgt * 1.1 * q
      out.angle = 0.45 + 0.1 * q
      out.on = q < 1
    }
    return out
  }
}

// ---------------------------------------------------------------- the snow falling on the glade

export interface SnowfallParams extends SceneSize {
  short?: boolean
}

type SnowState = { r: Rng; snow: Particles; near: Particles }

/** When the snowfall has covered the glade (the screen swaps in the fresh one under it). */
export const snowfallCoverAt = (short = false) => (short ? 0.45 : 0.9)

/**
 * The snow falling on the glade, an overlay over the bushes (transparent elsewhere): a flurry at three depths, the
 * wind turning it; a curtain of snow comes down from the top (each row's veil in stepped alpha, whiter at its front
 * edge) and covers the glade whole at its height (`beat('covered')`: the prints are gone, the bushes refilled under it);
 * then it thins away from the top as the last big flakes settle. `short`: half.
 */
export function tracksSnowfallTimeline(p: SnowfallParams = {}): Timeline<SnowState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const cover = snowfallCoverAt(p.short)
  const dur = cover * 2
  return {
    id: 'tracks-snowfall',
    dur,
    setup() {
      // A light snow already falling as it begins, so it thickens rather than arriving from the top.
      const r = rng(77)
      const snow = new Particles()
      warmSnow(snow, r, w, h, 0.8)
      return { r, snow, near: new Particles() }
    },
    step(s, t, dt) {
      s.snow.update(dt)
      s.near.update(dt)
      // The wind swings the flakes one way then the other.
      const gust = Math.sin((t / cover) * Math.PI * 1.5) * 26
      for (const f of s.snow.list) f.vx += (gust * 0.6 - f.vx * 0.3) * dt * 3
      for (const f of s.near.list) f.vx += (gust - f.vx * 0.3) * dt * 3
      if (t < cover * 1.5) {
        const q = span(t, 0, cover)
        feedSnow(s.snow, s.r, w, h, lerp(1, p.short ? 4 : 7, q), true, gust * 0.5)
        if (s.r() < lerp(0.2, 0.9, q))
          s.near.add({
            x: s.r.range(-20, w + 20),
            y: -4,
            vx: gust,
            vy: s.r.range(40, 70) / (p.short ? 0.7 : 1),
            life: 3,
            size: 3,
            shape: 'flake',
            colors: ['#ffffff'],
          })
        // Gusts: streaks of snow driven across, thickest as it covers.
        if (s.r() < 0.6 * Math.sin(Math.PI * q))
          s.near.add({
            x: gust > 0 ? -10 : w + 10,
            y: s.r.range(0, h),
            vx: (gust > 0 ? 1 : -1) * s.r.range(120, 200),
            vy: s.r.range(20, 50),
            life: 1.5,
            size: 1,
            shape: 'streak',
            trail: 0.05,
            colors: ['#ffffff', TS.snow],
          })
      }
    },
    draw(g, s, t) {
      // The veil over the whole glade: thickening to cover it at its height, thinning away after.
      const veil = span(t, cover * 0.15, cover) ** 1.6 * (1 - span(t, cover * 1.1, dur) ** 0.8)
      if (veil > 0) wash(g, TS.snow, 0.9 * veil, 8)
      s.snow.draw(g)
      s.near.draw(g)
    },
    cues: () => [
      [0.02, () => quiet('tracks.snow')],
      [cover, (hud) => hud.beat?.('covered')],
    ],
  }
}

// ---------------------------------------------------------------- the outro

export interface OutroParams extends SceneSize {
  /** The shiny Stantler's front sprite key, standing in the glade. */
  mon: string
  title: string
  short?: boolean
}

type OutroState = { r: Rng; gl: Glade; snow: Particles; fx: Particles }

const OUTRO_PINES = [
  [0.02, 0.92, 0.9],
  [0.97, 0.85, 0.82],
  [0.3, 0.12, 0.3],
  [0.82, 0.08, 0.26],
  [0.68, 0.02, 0.12],
  [0.14, 0.05, 0.17],
] as const
const OUTRO_BUSHES = [
  [0.38, 0.32, 1.1],
  [0.8, 0.38, 1.4],
  [0.9, 0.62, 1.7],
  [0.24, 0.5, 1.3],
  [0.62, 0.2, 0.9],
  [0.74, 0.86, 1.8],
] as const

/** The trail of prints it left, from the foot of the stage up to where it stands: depth and x share, each. */
function trail(n: number, endX: number, endD: number) {
  return Array.from({ length: n }, (_, i) => {
    const q = i / (n - 1)
    const d = lerp(0.97, endD + 0.03, Math.pow(q, 0.75))
    return { d, xf: lerp(0.24, endX - 0.04, q) + Math.sin(q * Math.PI) * 0.08, side: i % 2 ? 1 : -1 }
  })
}

/**
 * The glade won: out of the white the shiny Stantler stands in the moonlit glade, rimmed with the moon's light, its
 * breath steaming; its trail of hoofprints comes up the snow to it. The near bushes give a last rustle and settle.
 * Fresh snow falls thicker and the prints fill in one after another, the far ones first; a calm moment; Stantler bows
 * its head, raises it, its coat sparkles, and the card (`beat('card')`). It holds its end (the snow falling, its
 * breath) until the page takes it away. `short`: half.
 */
export function tracksOutroTimeline(p: OutroParams): Timeline<OutroState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const hv = h - (p.inset ?? 0)
  const fr = gladeFrame(w, hv)
  const T_SETTLE = 0.5 * k
  const T_FALL = 1.0 * k
  const T_COVER = 1.5 * k
  const T_BOW = 2.45 * k
  const T_SHINE = 3.05 * k
  const T_CARD = 3.3 * k
  const DUR = 4.3 * k
  const STAND = { xf: 0.58, d: 0.27 }
  const prints = trail(10, STAND.xf, STAND.d)
  const view = (t: number): View => ({ t, pan: lerp(5, -4, ease.ioS(span(t, 0, DUR))) })
  return {
    id: 'tracks-outro',
    hold: true,
    dur: DUR,
    setup() {
      const r = rng(4234)
      const gl = buildGlade(w, h, hv, { ...fr, pines: OUTRO_PINES, bushes: OUTRO_BUSHES, seed: 4234 })
      const snow = new Particles()
      warmSnow(snow, r, w, h, 0.3)
      return { r, gl, snow, fx: new Particles() }
    },
    step(s, t, dt) {
      s.snow.update(dt)
      s.fx.update(dt)
      const heavy = t > T_FALL && t < T_COVER + 0.9 * k
      feedSnow(s.snow, s.r, w, h, heavy ? (p.short ? 1.6 : 2.6) : 0.35, heavy, -4)
      const v = view(t)
      const at = standAt(s.gl, v)
      // Its breath steaming in the cold, every second and a bit.
      if (Math.floor(t / 1.3) !== Math.floor((t - dt) / 1.3) || (t >= 0.3 && t - dt < 0.3))
        for (let i = 0; i < 3; i++)
          s.fx.add({
            x: at.mx,
            y: at.my,
            delay: i * 0.08,
            vx: -s.r.range(8, 16),
            vy: -s.r.range(3, 8),
            drag: 1.5,
            life: 0.9,
            size: 2,
            size1: 4,
            shape: 'smoke',
            colors: ['#f4f8ff', '#c4d2ee', '#8ea2d2'],
          })
      // The near bushes' last rustle shakes their snow off.
      if (t >= T_SETTLE && t - dt < T_SETTLE)
        for (const i of nearBushes(s.gl)) {
          const q = propAt(s.gl, v, i)
          kickSnow(s.fx, s.r, q.x, q.y - q.p.size * 2, p.short ? 4 : 9, q.p.size, 0.5)
        }
      if (t >= T_SHINE && t - dt < T_SHINE) sparkle(s.fx, s.r, at.x, at.y, at.wd, at.hgt, p.short ? 4 : 7)
    },
    draw(g, s, t) {
      const v = view(t)
      const gl = s.gl
      const near = nearBushes(gl)
      v.shake = (i) =>
        near.includes(i) && t >= T_SETTLE && t < T_SETTLE + 0.6 * k
          ? Math.sin((t - T_SETTLE) * 40 + i) * 2 * (1 - span(t, T_SETTLE, T_SETTLE + 0.6 * k))
          : 0
      drawGladeBack(g, gl, v)
      // The prints, filling with fresh snow from the far end down.
      for (let i = prints.length - 1; i >= 0; i--) {
        const pr = prints[i]!
        const fill = span(
          t,
          T_FALL + (prints.length - 1 - i) * 0.07 * k,
          T_COVER + (prints.length - i) * 0.07 * k,
        )
        if (fill >= 1) continue
        hoofprint(g, gl, v, pr, fill)
      }
      s.snow.draw(g)
      const at = standAt(gl, v)
      drawProps(g, gl, v, -1, STAND.d)
      // Its light on the snow and its shadow toward us.
      softEllipse(g, at.x, at.y + 1, Math.round(at.wd * 0.55), 3, '#7d92c8', 0.8)
      const bow = Math.sin(Math.PI * span(t, T_BOW, T_BOW + 0.65 * k))
      const breathe = t > T_BOW + 0.65 * k || t < T_BOW ? Math.round(Math.sin(t * 2.2) * 0.6 + 0.4) : 0
      drawPose(g, p.mon, at.x, at.y, {
        rim: TS.ice,
        rimDir: rimToward(gl.moon, at.x, at.y - at.hgt / 2),
        head: {
          cut: 0.55,
          dx: -Math.round(bow * 2),
          dy: Math.round(bow * Math.max(3, at.hgt * 0.09)) - breathe,
        },
      })
      drawProps(g, gl, v, STAND.d)
      drawBank(g, gl, v)
      s.fx.draw(g)
      if (t < 0.45 * k) wash(g, '#ffffff', 1 - span(t, 0, 0.45 * k), 8)
      const full = Math.round(Math.min(14, h * 0.07))
      bars(g, w, h, Math.round(full * ease.outC(span(t, T_CARD - 0.2, T_CARD + 0.15))))
      if (t >= T_CARD) gladeCard(g, w, cardY(hv, full), t - T_CARD, p.title)
    },
    cues: () => [
      [T_SETTLE, () => quiet('tracks.rustle')],
      [T_FALL, () => quiet('tracks.snow')],
      [T_CARD, (hud) => (quiet('tracks.found'), hud.beat?.('card'))],
    ],
  }

  function nearBushes(gl: Glade) {
    return gl.props.flatMap((q, i) => (q.kind === 'bush' && q.d > 0.55 ? [i] : []))
  }
  /** Where it stands, how big it is and where its muzzle is (its breath). */
  function standAt(gl: Glade, v: View) {
    const fz = spriteSize(p.mon)
    const x = Math.round(w * STAND.xf) + panAt(v, STAND.d)
    const y = groundY(gl, STAND.d)
    return { x, y, wd: fz.w, hgt: fz.h, mx: x - Math.round(fz.w * 0.38), my: y - Math.round(fz.h * 0.58) }
  }
}

/** A pair of cloven hoofprints in the snow at a print of the trail, `fill` 0 crisp to 1 snowed over. */
function hoofprint(g: G, gl: Glade, v: View, pr: { d: number; xf: number; side: number }, fill: number) {
  const s = 1.2 + pr.d * 3.4
  const x = Math.round(gl.w * pr.xf + pr.side * s * 1.6) + panAt(v, pr.d)
  const y = groundY(gl, pr.d)
  const rx = Math.max(1, Math.round(s * 0.5))
  const ry = Math.max(1, Math.round(s * 0.75))
  // Two halves of a cloven hoof, a pixel apart: the far half of each in shade, its near lip lit.
  for (const cx of [x - rx, x + rx + 1]) {
    for (let yy = -ry; yy <= ry; yy++)
      for (let xx = -rx; xx <= rx; xx++) {
        if ((xx * xx) / (rx * rx + 0.3) + (yy * yy) / (ry * ry + 0.3) > 1) continue
        const px = cx + xx
        const py = y + yy
        if (bayer(px, py) < fill) continue
        rect(g, px, py, 1, 1, yy < 0 ? '#5c6fa6' : '#8ea2d2')
      }
    if (fill < 0.5) rect(g, cx - rx + 1, y + ry + 1, Math.max(1, rx * 2 - 1), 1, '#ffffff')
  }
}

// ---------------------------------------------------------------- the glade on a loop

/**
 * The glade under the moon on a loop (the rules' banner, the way in's pop-up): the moon and its halo, the stars
 * twinkling, the peaks and the forest, the snowfield's glints, pines and bushes, snow falling. `still`: one frame
 * (motion off or a calm OS).
 */
export function gladeLoop(w: number, h: number, { still = false }: { still?: boolean } = {}): PortalLoop {
  const r = rng(91)
  const R = Math.round(clamp(Math.min(w * 0.1, h * 0.2), 6, 40))
  const gl = buildGlade(w, h, h, {
    horizon: Math.round(h * 0.58),
    moon: { x: Math.round(w * 0.62), y: Math.max(R + 3, Math.round(h * 0.27)), R },
    pines: [
      [0.04, 0.9, 0.85],
      [0.96, 0.8, 0.75],
      [0.22, 0.15, 0.32],
      [0.8, 0.1, 0.3],
      [0.45, 0.03, 0.18],
    ],
    bushes: [
      [0.3, 0.6, 1.4],
      [0.55, 0.35, 1],
      [0.72, 0.7, 1.6],
      [0.14, 0.4, 1.1],
    ],
    seed: 91,
  })
  const snow = new Particles()
  if (!still) warmSnow(snow, r, w, h, 0.3)
  return {
    step(_t, dt) {
      if (still) return
      feedSnow(snow, r, w, h, 0.3)
      snow.update(dt)
    },
    draw(g: G, t: number) {
      const v: View = { t, still }
      drawGladeBack(g, gl, v)
      snow.draw(g)
      drawProps(g, gl, v)
      drawBank(g, gl, v)
    },
  }
}

/** For the FX lab's stand-in: the glade's bushes in a grid on moonlit snow, as the page shows them. */
export function gladeGridBackdrop(w: number, h: number): Canvas {
  return cached(`ts-grid|${w}|${h}`, () => {
    const cv = canvas(w, h)
    const g = cv.g
    rect(g, 0, 0, w, h, '#0b1530')
    const n = 4
    const cell = Math.floor(Math.min(w, h) / n) - 2
    const x0 = Math.round((w - n * (cell + 2)) / 2)
    const y0 = Math.round((h - n * (cell + 2)) / 2)
    for (let i = 0; i < n * n; i++) {
      const x = x0 + (i % n) * (cell + 2)
      const y = y0 + Math.floor(i / n) * (cell + 2)
      rect(g, x, y, cell, cell, '#c4d2ee')
      rect(g, x, y, cell, 2, '#f4f8ff')
      const b = bushSprite(Math.max(3, Math.round(cell / 4.5)))
      g.drawImage(b, x + Math.round((cell - b.width) / 2), y + cell - b.height - 2)
    }
    return cv
  })
}
