// The Stairway of Plates (docs/61 §4.5, docs/15 §49): the Hall of Origin's portal run, Distortion World's scenes
// (portal.ts) redrawn in light instead of distortion. The Hall: an amber sky paling to white over a sea of cloud, a
// monumental stairway rising away up the screen in true perspective (lit step edges, a runner of light up its middle,
// balustrades and columns receding with it, a beacon on each landing's columns once its altar is lit), Arceus's golden
// wheel above its top with the seventeen Plates orbiting it, god-rays. The breach becomes the area breaking into tiles
// that rise into light to show the Hall; a portal closing becomes an altar lit (a Plate set into it); the victory is
// shiny Arceus coming down the stairs, then the Judgment. The same timings, sizes, cues and motion levels as
// portal.ts, so the screens swap one for the other.
import { fxSound } from '@/audio/sfx'
import { POKE_TYPES, type DieType, type PokeType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  canvas,
  cached,
  shade,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  mix,
  Particles,
  pattern,
  rect,
  rng,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type ParticleShape,
  type Rng,
} from '../pixel'
import { background, type Point } from '../scenes'
import { drawSprite, spriteFrame, spriteSize } from '../sprites'
import { H, Stage, W, screenFlash, screenShake, within, type Cue, type Timeline } from '../timeline'
import { burstRing, dGradient, dissolve } from './cinema/kit'
import type { FormParams } from './forms'
import { drawRays } from './legend'
import {
  crackPath,
  fillTri,
  nameCard,
  quiet,
  type BreachParams,
  type CardColors,
  type CloseParams,
  type PortalLoop,
  type VictoryParams,
} from './portal'

/** The Hall of Origin's palette: an amber sky paling to white, cloud, pale stone, Arceus's gold, a dark-gold ink. */
export const PL = {
  ink: '#4a3410',
  deep: '#8a6420',
  gold: '#e3a92f',
  goldLit: '#ffc94a',
  pale: '#ffe9a3',
  cream: '#fff6dc',
  white: '#ffffff',
  /** The sky, from the top down to the horizon, where the light is. */
  sky: ['#dc9a4e', '#eab466', '#f5cf8a', '#fbe4b2', '#fff4da'] as readonly string[],
  /** The cloud sea under it, from its far haze down to the shade under the stairs. */
  sea: ['#fff0cc', '#f7dca8', '#edc588', '#dcaa68'] as readonly string[],
  cloudLit: '#fffaf0',
  cloud: '#f8e5be',
  cloudShade: '#e9c68a',
  cloudDeep: '#d4a262',
  tread: '#fbf0d4',
  nose: '#fff6e0',
  riserLit: '#efd9a8',
  riserMid: '#e0c287',
  riser: '#caa968',
  wall: '#f1deb4',
  wallDark: '#d6b97e',
  col: '#f3e4c2',
  colLit: '#fffaf0',
  colShade: '#d9bd88',
  colFlute: '#e6d1a4',
  colEdge: '#a8823e',
  stone: '#f6ecd2',
  stoneLit: '#fffaf0',
  stoneDark: '#dcc595',
  /** The jewels on Arceus's wheel. */
  jewel: '#3ad0a0',
  blue: '#cfe8ff',
} as const

/** The name card in light: a band of Arceus's gold, white and pale rims, the title in white over dark gold. */
const LIGHT_CARD: CardColors = {
  band: [PL.gold, PL.deep],
  rim: PL.white,
  top: PL.pale,
  text: '#ffffff',
  shadow: PL.ink,
  glint: PL.pale,
  sub: PL.pale,
}

/** The seventeen Plates' colours (every type but Normal), in the types' order: the tablets round the wheel. */
const PLATE_COLORS = POKE_TYPES.filter((t) => t !== 'normal').map((t) => typeColor(t))

/** Each landing's Plate, from the foot: its beacons burn in that colour once its altar is lit (a rainbow climbing). */
const LANDING_COLORS = (
  [
    'fire',
    'electric',
    'grass',
    'ice',
    'water',
    'dragon',
    'ghost',
    'poison',
    'psychic',
    'fighting',
  ] as PokeType[]
).map((t) => typeColor(t))

/** A Plate's colour; Normal's (the Legend Plate) and none are Arceus's own gold. */
const plateColor = (type?: DieType | null) =>
  !type || type === 'normal' || type === 'base' ? PL.goldLit : typeColor(type)

/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

// ---------------------------------------------------------------- the Hall: its camera

/**
 * The Hall seen from below the stairway's foot: a step is one unit deep and half a unit high, the stairway `half`
 * units either side of its middle, the eye `e` units above the foot looking out at the horizon row `hz`. Steps above
 * the eye show only their risers; the near ones, below it, their treads too.
 */
export interface Hall {
  w: number
  hv: number
  cx: number
  hz: number
  f: number
  e: number
  /** The foot's depth, the number of steps (three to a landing), a step's rise. */
  z0: number
  steps: number
  dy: number
  half: number
  /** Arceus's wheel, over the top landing. */
  wheel: { c: Point; R: number }
}

const FOOT = 6
const RISE = 0.5
/** The balustrade's height, a column's height, width and how far beyond the stairs' edge it stands. */
const WALL = 0.9
const COL_H = 8
const COL_W = 0.8
const COL_X = 1.1

/** The Hall on a stage of w × hv (its words kept clear below `hv`): its foot at the bottom, its top a third down. */
export function hallOf(w: number, hv: number, landings = 10): Hall {
  const steps = landings * 3
  const base = hv + 2
  const top = Math.round(hv * 0.42)
  const hz = Math.round(hv * 0.6)
  // The focal length and the eye's height that put the foot at `base` and the top step at `top`.
  const A = base - hz
  const B = hz - top
  const f = (B * (FOOT + steps) + A * FOOT) / (steps * RISE)
  const e = (A * FOOT) / f
  const R = Math.max(8, Math.round(Math.min(w, hv * 1.2) * 0.12))
  return {
    w,
    hv,
    cx: Math.round(w / 2),
    hz,
    f,
    e,
    z0: FOOT,
    steps,
    dy: RISE,
    half: (w * 0.33 * FOOT) / f,
    wheel: { c: { x: Math.round(w / 2), y: Math.max(R + 16, Math.round(top - R * 1.15)) }, R },
  }
}

/** A point of the Hall (X across, Y up, z deep) on the screen. */
const at = (H: Hall, X: number, Y: number, z: number): Point => ({
  x: H.cx + (X * H.f) / z,
  y: H.hz - ((Y - H.e) * H.f) / z,
})

/** Where one stands on step `i` (fractional: between two), and its depth. */
const onStep = (H: Hall, i: number) => {
  const z = H.z0 + i + 0.5
  return { ...at(H, 0, (i + 1) * H.dy, z), z }
}

// ---------------------------------------------------------------- the Hall: its sky and clouds

/**
 * A cumulus: a flat-bottomed heap of round lobes, each with a deep shade under it, its body and a lit cap towards the
 * light above; small ones (far off) a single lobe.
 */
function puff(g: G, x: number, y: number, rx: number, ry: number, seed = 0) {
  const lobes: [number, number, number][] =
    rx < 6
      ? [[0, 0, 1]]
      : [
          [-0.55, 0.15, 0.55],
          [0.5, 0.2, 0.5],
          [-0.1, -0.15, 0.72],
          [0.25 + (seed % 3) * 0.08, -0.05, 0.6],
        ]
  const L = lobes.map(([dx, dy, k]) => ({
    x: Math.round(x + dx * rx),
    y: Math.round(y + dy * ry * 1.6),
    r: Math.max(1, Math.round(rx * k)),
    q: Math.max(1, Math.round(ry * k * 1.5)),
  }))
  for (const l of L) ellipse(g, l.x, l.y + Math.max(1, Math.round(l.q * 0.35)), l.r, l.q, PL.cloudDeep)
  for (const l of L) ellipse(g, l.x, l.y + Math.max(1, Math.round(l.q * 0.18)), l.r, l.q, PL.cloudShade)
  for (const l of L) ellipse(g, l.x, l.y, l.r, l.q, PL.cloud)
  for (const l of L)
    ellipse(
      g,
      l.x - Math.round(l.r * 0.15),
      l.y - Math.round(l.q * 0.35),
      Math.max(1, Math.round(l.r * 0.65)),
      Math.max(1, Math.round(l.q * 0.5)),
      PL.cloudLit,
    )
  // Its flat bottom: the shade cut level.
  rect(g, x - rx, Math.round(y + ry * 0.9), rx * 2 + 1, Math.max(1, Math.round(ry * 0.6)), PL.cloudDeep)
}

/**
 * The Hall's backdrop, cached per size: the sky (amber at the top paling to white at the horizon, ordered-dithered),
 * the wheel's light a wide white glow in it, long thin clouds, and the sea of cloud below the horizon in perspective
 * (small flat puffs far off, big round ones near, lit on top).
 */
export const hallBackdrop = (w: number, h: number, hv = h): Canvas =>
  cached(`pl-hall|${w}|${h}|${hv}`, () => {
    const H = hallOf(w, hv)
    const cv = canvas(w, h)
    const g = cv.g
    const r = rng(w * 7 + hv * 13)
    g.drawImage(dGradient(w, H.hz + 2, PL.sky), 0, 0)
    const { c, R } = H.wheel
    const far = Math.round(R * 3.2)
    g.drawImage(glow(far, PL.cream, 1.2, 0.8), c.x - far, c.y - far)
    const near = Math.round(R * 1.7)
    g.drawImage(glow(near, PL.white, 1.4, 0.9), c.x - near, c.y - near)
    // Long thin clouds high up, paler the nearer the horizon.
    for (let i = 0; i < Math.max(3, Math.round(w / 60)); i++) {
      const y = r.int(Math.round(H.hz * 0.15), H.hz - 6)
      const x = r.int(0, w)
      const cw = r.int(16, 40) * (0.6 + (0.4 * y) / H.hz)
      rect(g, x - cw, y, cw * 2, 1, PL.cloudLit)
      rect(g, x - cw * 0.7, y + 1, cw * 1.4, 1, PL.cloud)
      rect(g, x - cw * 0.4, y - 1, cw * 0.9, 1, PL.white)
    }
    // The sea of cloud: banks one behind another, small and flat far off, big near, each with a scalloped top lit
    // from above and a shade where it rises in front of the bank behind it.
    g.drawImage(dGradient(w, h - H.hz, PL.sea), 0, H.hz)
    const banks = 9
    const sw = Math.max(0.8, w / 240)
    for (let k = 0; k < banks; k++) {
      const v = k / (banks - 1)
      const y0 = Math.round(H.hz + 2 + Math.pow(v, 1.8) * (h - H.hz) * 0.92)
      const rr = Math.max(2, Math.round((2 + v * 16) * sw))
      const body = mix(PL.sea[0]!, PL.cloud, v)
      // The shade of this bank on the one behind it.
      if (k)
        rect(g, 0, y0 - Math.round(rr * 0.9), w, Math.round(rr * 0.9), pattern(g, PL.cloudShade, 7 + v * 5))
      for (let x = -r.range(0, rr); x < w + rr; x += rr * r.range(1.1, 1.7)) {
        const rx = Math.round(rr * r.range(0.8, 1.25))
        const ry = Math.max(1, Math.round(rx * 0.55))
        const y = y0 - Math.round(r.range(0, rr * 0.4))
        ellipse(g, x, y + 1, rx, ry, PL.cloudShade)
        ellipse(g, x, y, rx, ry, body)
        ellipse(
          g,
          x - Math.round(rx * 0.2),
          y - Math.round(ry * 0.35),
          Math.round(rx * 0.6),
          Math.max(1, Math.round(ry * 0.45)),
          PL.cloudLit,
        )
        if (rx > 4) ellipseLine(g, x, y, rx, ry, PL.white, Math.PI * 1.15, Math.PI * 1.6)
      }
      rect(g, 0, y0, w, h - y0, body)
    }
    rect(g, 0, H.hz, w, 1, PL.white)
    return cv
  })

/** Near clouds drifting slowly past the stairway's foot, in front of it. */
function frontClouds(g: G, w: number, hv: number, t: number) {
  const s = Math.max(1, w / 240)
  for (let i = 0; i < 4; i++) {
    const span0 = w + 120 * s
    const x = Math.round((((i * 0.29 * span0 + t * (4 + i)) % span0) + span0) % span0) - 60 * s
    const y = hv - 2 - (i % 2) * 6 * s
    puff(g, x, y, Math.round(30 * s), Math.round(9 * s), i)
  }
}

// ---------------------------------------------------------------- the Hall: its stairway

export interface StairLook {
  /** How much of it stands: its steps come down out of the light from the top (0 none, 1 all). */
  build?: number
  /** How far its columns have risen (0..1, the far ones first). */
  cols?: number
  /** Landings whose altar is lit, from the foot: their top step's edge glows, their columns' beacons burn. */
  lit?: number
  /** Each landing's colour (LANDING_COLORS). */
  colors?: readonly string[]
  /** A step flaring white (trodden on, just lit), 0..1. */
  hot?: (i: number) => number
  /** A landing's beacons flaring as they catch, 0..1. */
  flare?: (j: number) => number
}

function drawStep(g: G, H: Hall, i: number, heat: number, glowCol: string | null) {
  const zf = H.z0 + i
  const yT = Math.round(at(H, 0, (i + 1) * H.dy, zf).y)
  const yB = Math.round(at(H, 0, i * H.dy, zf).y)
  const yK = Math.round(at(H, 0, (i + 1) * H.dy, zf + 1).y)
  const hwF = (H.half * H.f) / zf
  const hwB = (H.half * H.f) / (zf + 1)
  const cx = H.cx
  // Its tread, while it's below the eye: pale stone, the light's runner up its middle.
  for (let y = yK; y < yT; y++) {
    const hw = Math.round(lerp(hwB, hwF, (y - yK) / Math.max(1, yT - yK)))
    rect(g, cx - hw, y, hw * 2 + 1, 1, heat > 0.5 ? PL.white : PL.tread)
    const rw = Math.round(hw * 0.28)
    rect(g, cx - rw, y, rw * 2 + 1, 1, pattern(g, PL.white, 8))
  }
  // Its riser, lit from behind: a bright nose along its top, then shading down to the next tread's shadow.
  const hw = Math.round(hwF)
  const rows = Math.max(1, yB - yT)
  for (let r = 0; r < rows; r++) {
    const q = rows > 1 ? r / (rows - 1) : 0
    const c =
      r === 0
        ? heat > 0.3 || glowCol
          ? PL.white
          : PL.nose
        : r === 1 && glowCol
          ? glowCol
          : heat > 0.5
            ? PL.pale
            : q < 0.34
              ? PL.riserLit
              : q < 0.8 || rows < 4
                ? PL.riserMid
                : PL.riser
    rect(g, cx - hw, yT + r, hw * 2 + 1, 1, c)
  }
  if (rows > 2) {
    const rw = Math.round(hw * 0.28)
    rect(g, cx - rw, yT + 1, rw * 2 + 1, rows - 1, pattern(g, PL.cream, heat > 0 ? 12 : 6))
  }
}

/** The balustrade along step i on side s (−1 left, 1 right): its inner face, a baluster, the gold rail on top. */
function drawWall(g: G, H: Hall, i: number, s: number, glint: boolean) {
  const zf = H.z0 + i
  const X = s * H.half
  const bf = at(H, X, i * H.dy, zf)
  const bb = at(H, X, (i + 1) * H.dy, zf + 1)
  const tf = at(H, X, i * H.dy + WALL, zf)
  const tb = at(H, X, (i + 1) * H.dy + WALL, zf + 1)
  fillTri(
    g,
    [
      [bf.x, bf.y],
      [bb.x, bb.y],
      [tb.x, tb.y],
    ],
    PL.wall,
  )
  fillTri(
    g,
    [
      [bf.x, bf.y],
      [tb.x, tb.y],
      [tf.x, tf.y],
    ],
    PL.wall,
  )
  line(g, bf.x, bf.y, tf.x, tf.y, PL.wallDark)
  line(g, tf.x, tf.y, tb.x, tb.y, glint ? PL.white : PL.gold, 2)
  line(g, tf.x, tf.y - 1, tb.x, tb.y - 1, glint ? PL.white : PL.pale)
}

/**
 * A column standing at step i's front on side s, risen `rise` (0..1): a lit side towards the stairway, a shaded side
 * and a dark-gold edge away from it, flutes when it's near enough, a gold foot and capital; `beacon` a flame of that
 * colour burning on top (`flare` brighter as it catches). `tall` for the gate's pair at the top.
 */
function drawColumn(
  g: G,
  H: Hall,
  i: number,
  s: number,
  t: number,
  {
    rise = 1,
    beacon = null,
    flare = 0,
    tall = 1,
  }: { rise?: number; beacon?: string | null; flare?: number; tall?: number },
) {
  if (rise <= 0) return
  const z = H.z0 + i
  const X = s * (H.half + COL_X)
  const b = at(H, X, i * H.dy, z)
  const tp = at(H, X, i * H.dy + COL_H * tall, z)
  const pw = Math.max(2, Math.round((COL_W * H.f) / z))
  const hgt = Math.round((b.y - tp.y) * ease.outC(rise))
  const x0 = Math.round(b.x - pw / 2)
  const yb = Math.round(b.y)
  const y0 = yb - hgt
  const q = Math.max(1, Math.round(pw / 4))
  rect(g, x0, y0, pw, hgt, PL.col)
  const inner = s < 0 ? x0 + pw - q : x0
  const outer = s < 0 ? x0 : x0 + pw - q
  rect(g, inner, y0, q, hgt, PL.colLit)
  rect(g, outer, y0, q, hgt, PL.colShade)
  rect(g, s < 0 ? x0 : x0 + pw - 1, y0, 1, hgt, PL.colEdge)
  if (pw >= 6)
    for (let fx = x0 + q + 1; fx < x0 + pw - q - 1; fx += 3) rect(g, fx, y0 + 2, 1, hgt - 3, PL.colFlute)
  const fh = Math.max(1, Math.round(pw / 3))
  rect(g, x0 - 1, yb - fh, pw + 2, fh, PL.gold)
  rect(g, x0 - 1, yb - fh, pw + 2, 1, PL.pale)
  if (rise < 0.98) return
  const ch = Math.max(2, Math.round(pw / 2.5))
  rect(g, x0 - 2, y0 - ch, pw + 4, ch, PL.gold)
  rect(g, x0 - 2, y0 - ch, pw + 4, 1, PL.pale)
  rect(g, x0 - 2, y0 - 1, pw + 4, 1, PL.deep)
  if (!beacon) return
  // Its beacon: a glow of its colour, a flame flickering in three heights, a white heart.
  const cx = Math.round(b.x)
  const fy = y0 - ch
  const fw = Math.max(1, Math.round(pw * 0.3))
  const fl = Math.floor(t * 12 + i * 0.7) % 3
  const fhh = Math.max(2, Math.round(pw * 0.8 * (1 + flare * 0.8))) + (fl === 1 ? 1 : 0)
  const gr = Math.max(4, Math.round(pw * (1.6 + flare)))
  g.drawImage(glow(gr, beacon, 1.4, q8(0.6 + 0.4 * flare)), cx - gr, fy - Math.round(fhh / 2) - gr)
  rect(g, cx - fw, fy - fhh, fw * 2 + 1, fhh, beacon)
  rect(g, cx - (fl === 2 ? 1 : 0), fy - fhh - 1, 1, 1, beacon)
  rect(
    g,
    cx - Math.max(0, fw - 1),
    fy - Math.round(fhh * 0.55),
    Math.max(1, fw * 2 - 1),
    Math.round(fhh * 0.55),
    PL.white,
  )
}

/**
 * A newel post on the balustrade at step i's front (side s) with a gold bowl on it: `fire` a flame of that colour
 * burning in it (`flare` brighter as it catches), else an ember.
 */
function drawBrazier(g: G, H: Hall, i: number, s: number, t: number, fire: string | null, flare = 0) {
  const z = H.z0 + i
  const X = s * H.half
  const b = at(H, X, i * H.dy + WALL, z)
  const pw = Math.max(2, Math.round((0.42 * H.f) / z))
  const ph = Math.max(2, Math.round((0.55 * H.f) / z))
  const x = Math.round(b.x)
  const y = Math.round(b.y)
  rect(g, x - (pw >> 1) - 1, y - ph, pw + 2, ph + 1, PL.colEdge)
  rect(g, x - (pw >> 1), y - ph, pw, ph, PL.col)
  rect(g, s < 0 ? x + (pw >> 1) - 1 : x - (pw >> 1), y - ph, 1, ph, PL.colLit)
  // The bowl.
  const bw = Math.max(2, Math.round(pw * 0.8))
  const by = y - ph - Math.max(1, Math.round(ph * 0.35))
  rect(g, x - bw, by, bw * 2 + 1, Math.max(1, Math.round(ph * 0.35)), PL.gold)
  rect(g, x - bw, by, bw * 2 + 1, 1, PL.pale)
  rect(g, x - bw + 1, by + Math.max(1, Math.round(ph * 0.35)), bw * 2 - 1, 1, PL.deep)
  if (!fire) {
    rect(g, x, by - 1, 1, 1, PL.riser)
    return
  }
  const fl = Math.floor(t * 12 + i * 0.7) % 3
  const fw = Math.max(1, Math.round(bw * 0.6))
  const fhh = Math.max(2, Math.round(pw * 1.3 * (1 + flare * 0.8))) + (fl === 1 ? 1 : 0)
  const gr = Math.max(4, Math.round(pw * (2.2 + 1.5 * flare)))
  g.drawImage(glow(gr, fire, 1.4, q8(0.55 + 0.45 * flare)), x - gr, by - Math.round(fhh / 2) - gr)
  rect(g, x - fw, by - fhh, fw * 2 + 1, fhh, fire)
  rect(g, x - (fl === 2 ? 1 : 0), by - fhh - 1, 1, 1, fire)
  rect(
    g,
    x - Math.max(0, fw - 1),
    by - Math.round(fhh * 0.55),
    Math.max(1, fw * 2 - 1),
    Math.round(fhh * 0.55),
    PL.white,
  )
}

/**
 * The stairway, far to near: each step's tread and riser, its balustrades (a glint running up the rails), the columns
 * at each landing's foot and the gate's pair at the top.
 */
export function drawStairs(g: G, H: Hall, t: number, o: StairLook = {}) {
  const { build = 1, cols = 1, lit = 0, colors = LANDING_COLORS, hot, flare } = o
  if (build <= 0) return
  const n = H.steps / 3
  const cut = Math.round(H.steps * (1 - clamp(build)))
  const riseOf = (j: number) => clamp((cols - ((n + 1 - j) / (n + 1)) * 0.55) / 0.45)
  if (cut < H.steps)
    for (const s of [-1, 1])
      drawColumn(g, H, H.steps, s, t, {
        rise: riseOf(n + 1),
        tall: 0.9,
        beacon: lit >= n ? PL.goldLit : null,
      })
  const glint = Math.floor(t * 9) % (H.steps + 12)
  for (let i = H.steps - 1; i >= cut; i--) {
    const j = Math.floor(i / 3) + 1
    const top = i % 3 === 2
    drawStep(g, H, i, hot?.(i) ?? 0, top && j <= lit ? colors[j - 1]! : null)
    for (const s of [-1, 1]) drawWall(g, H, i, s, i === glint)
    if (i % 3 === 0)
      for (const s of [-1, 1]) {
        if (j % 2) drawColumn(g, H, i, s, t, { rise: riseOf(j) })
        if (riseOf(j) > 0.5) drawBrazier(g, H, i, s, t, j <= lit ? colors[j - 1]! : null, flare?.(j) ?? 0)
      }
  }
}

// ---------------------------------------------------------------- the wheel and the Plates

/** A Plate: a tablet of its colour, a dark rim of it, lit along its top, turning (`turn` −1..1, edge-on at 0). */
function drawPlate(
  g: G,
  x: number,
  y: number,
  size: number,
  c: string,
  turn: number,
  t: number,
  i: number,
  gk = 0.5,
) {
  const pw = Math.max(2, Math.round(size))
  const ph = Math.round(pw * 1.4)
  const ww = Math.max(1, Math.round(pw * Math.abs(turn)))
  const xx = Math.round(x - ww / 2)
  const yy = Math.round(y - ph / 2)
  if (gk > 0) {
    const gr = Math.round(pw * 1.4)
    g.drawImage(glow(gr, c, 1.3, q8(gk)), Math.round(x) - gr, Math.round(y) - gr)
  }
  rect(g, xx - 1, yy - 1, ww + 2, ph + 2, mix(c, PL.ink, 0.55))
  rect(g, xx, yy, ww, ph, turn > 0 ? c : mix(c, '#000000', 0.3))
  rect(g, xx, yy, ww, 1, mix(c, '#ffffff', 0.6))
  rect(g, xx, yy, 1, ph, mix(c, '#ffffff', 0.4))
  rect(g, xx, yy + ph - 1, ww, 1, mix(c, '#000000', 0.45))
  if (ww > 4) rect(g, xx + (ww >> 1), yy + 2, 1, ph - 4, mix(c, '#000000', 0.3))
  if (ww > 2 && (Math.floor(t * 10) + i) % 7 === 0) rect(g, xx + 1, yy + 1, 1, 1, '#ffffff')
}

/** Where Plate j is on its orbit round the wheel (a tilted ring), turned `rot`; z > 0 in front of the wheel. */
const orbit = (c: Point, R: number, j: number, rot: number) => {
  const a = (j / PLATE_COLORS.length) * Math.PI * 2 + rot
  const z = Math.sin(a)
  return { x: c.x + Math.cos(a) * R * 1.5, y: c.y + z * R * 0.34, z, a }
}

/**
 * The seventeen Plates orbiting the wheel, the half behind it (`front` false) or before it: `n` of them out (each
 * pops in), `rot` how far the ring has turned.
 */
export function drawOrbit(g: G, c: Point, R: number, t: number, rot: number, front: boolean, n = 17) {
  const size = Math.max(3, Math.round(R * 0.22))
  for (let j = 0; j < Math.min(17, Math.ceil(n)); j++) {
    const o = orbit(c, R, j, rot)
    if (o.z >= 0 !== front) continue
    const pop = ease.outBack(clamp(n - j), 2.5)
    if (pop <= 0.05) continue
    drawPlate(g, o.x, o.y, size * (1 + 0.22 * o.z) * pop, PLATE_COLORS[j]!, Math.cos(o.a * 2 + j), t, j)
  }
}

/**
 * Arceus's wheel, centre c, radius R: a crisp gold ring (a dark-gold edge either side, lit on its upper left) with a
 * soft dithered light inside it, four jade jewels on it with gold points outward, turning slowly. `open` draws it
 * round from its top (0..1); `hot` lights its heart white (the Judgment, a beam landing).
 */
export function drawWheel(
  g: G,
  c: Point,
  R: number,
  t: number,
  { open = 1, hot = 0, glowK = 0.45 }: { open?: number; hot?: number; glowK?: number } = {},
) {
  if (open <= 0.01) return
  const k = clamp(open)
  if (glowK > 0) {
    const gr = Math.round(R * 1.1)
    g.drawImage(glow(gr, PL.white, 1.6, q8(glowK * k)), c.x - gr, c.y - gr)
  }
  if (hot > 0) {
    const gr = Math.round(R * (0.5 + 0.7 * hot))
    g.drawImage(glow(gr, PL.white, 1.0, q8(hot)), c.x - gr, c.y - gr)
  }
  const end = -Math.PI / 2 + Math.PI * 2 * k
  const th = Math.max(1, Math.round(R / 12))
  for (const [dr, col] of [
    [th + 2, PL.deep],
    [th + 1, PL.gold],
    [th, PL.goldLit],
    [0, PL.goldLit],
    [-1, PL.gold],
    [-2, PL.gold],
    [-3, PL.deep],
  ] as const)
    if (th > 1 || dr <= th) ellipseLine(g, c.x, c.y, R + dr, R + dr, col, -Math.PI / 2, end)
  // The light catching its upper left.
  if (k > 0.85) ellipseLine(g, c.x, c.y, R + th, R + th, PL.white, Math.PI * 1.1, Math.PI * 1.45)
  const rot = t * 0.25 + Math.PI / 4
  const jr = Math.max(2, Math.round(R * 0.11))
  for (let i = 0; i < 4; i++) {
    if (k < (i + 1) / 4) continue
    const a = rot + (i * Math.PI) / 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const x = c.x + dx * R
    const y = c.y + dy * R
    // A gold point outward from the jewel (the wheel's four spikes), lit along one side.
    const L = R * 0.42
    fillTri(
      g,
      [
        [x + dx * (L + jr), y + dy * (L + jr)],
        [x - dy * jr * 1.1, y + dx * jr * 1.1],
        [x + dy * jr * 1.1, y - dx * jr * 1.1],
      ],
      PL.gold,
    )
    line(g, x, y, x + dx * (L + jr), y + dy * (L + jr), PL.pale)
    ellipse(g, x, y, jr + 1, jr + 1, PL.deep)
    ellipse(g, x, y, jr, jr, hot > 0.4 ? PL.white : PL.jewel)
    rect(g, Math.round(x) - 1, Math.round(y) - 1, 1, 1, '#e0fff0')
  }
}

/** Light rising round the wheel: motes drifting up, now and then a star on its rim. */
export function feedLight(P: Particles, r: Rng, c: Point, R: number, rate = 0.5) {
  if (r() < rate) {
    const a = r() * Math.PI * 2
    const d = R * r.range(0.6, 2)
    P.add({
      x: c.x + Math.cos(a) * d,
      y: c.y + Math.sin(a) * d,
      vx: r.range(-3, 3),
      vy: -r.range(8, 18),
      life: r.range(1, 2),
      size: 1,
      shape: r() < 0.8 ? 'px' : 'sq',
      colors: [PL.white, PL.pale, PL.goldLit, PL.gold],
    })
  }
  if (r() < rate * 0.12) {
    const a = r() * Math.PI * 2
    P.add({
      x: c.x + Math.cos(a) * R,
      y: c.y + Math.sin(a) * R,
      life: r.range(0.15, 0.3),
      size: r.int(1, 2),
      shape: 'star',
      colors: [PL.white, PL.pale, PL.goldLit],
    })
  }
}

/** Motes of light rising from the cloud sea all over the Hall. */
function feedHall(P: Particles, r: Rng, w: number, h: number, rate = 0.4) {
  if (r() < rate)
    P.add({
      x: r.range(0, w),
      y: h + 2,
      vx: r.range(-3, 3),
      vy: -r.range(12, 26),
      life: r.range(3, 5),
      size: 1,
      shape: r() < 0.2 ? 'plus' : 'px',
      colors: [PL.white, PL.pale, PL.goldLit],
    })
}

/** Letterbox bars in dark gold. */
function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, PL.ink)
  rect(g, 0, h - n, w, n, PL.ink)
}

/**
 * The Hall standing whole, back to front up to its stairway: the backdrop, god-rays from the wheel, the Plates behind
 * the wheel, the wheel, the Plates before it, the stairway. `rays` is a canvas of the stage's size (drawRays's).
 */
function drawHall(
  g: G,
  H: Hall,
  h: number,
  t: number,
  rays: Canvas,
  o: StairLook & {
    rayK?: number
    rot?: number
    plates?: number
    open?: number
    wheelHot?: number
    pulse?: number
  } = {},
) {
  const { rayK = 0.45, rot = t * 0.6, plates = 17, open = 1, wheelHot = 0, pulse = 0 } = o
  const { c, R } = H.wheel
  g.drawImage(hallBackdrop(H.w, h, H.hv), 0, 0)
  if (rayK > 0) {
    drawRays(rays, c, t * 0.6, PL.white, rayK)
    g.drawImage(rays, 0, 0)
  }
  drawOrbit(g, c, R + pulse, t, rot, false, plates)
  drawWheel(g, c, R + pulse, t, { open, hot: wheelHot })
  drawOrbit(g, c, R + pulse, t, rot, true, plates)
  drawStairs(g, H, t, o)
}

// ---------------------------------------------------------------- the way in: the stairway of light

interface Mote {
  tri: [number, number][]
  cx: number
  cy: number
  col: string
  rel: number
  done: boolean
}

type ClimbState = {
  r: Rng
  world: Canvas
  bits: Mote[]
  rays: [number, number][][]
  light: Canvas
  fx: Particles
  amb: Particles
  shown: number
  shakes: [number, number, number][]
}

function worldOf(w: number, h: number, picture: string | null | undefined): Canvas {
  const c = canvas(w, h)
  const f = picture ? spriteFrame(picture) : undefined
  if (f) {
    const k = Math.max(w / f.width, h / f.height)
    const dw = Math.round(f.width * k)
    const dh = Math.round(f.height * k)
    c.g.drawImage(f, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
  } else c.g.drawImage(background(w, h).cv, 0, 0)
  return c
}

/**
 * The way in (breachTimeline's, in light): the area brightens in two white pulses, a point of gold light opens where
 * the wheel will be, rays of light race out from it over the area, the area comes apart in tiles that rise and whiten
 * into light (the nearest the light first), and behind them the Hall: the stairway's steps coming down out of the
 * light from the top, its columns rising, the wheel drawing itself round and the Plates popping out one by one round
 * it; a flash, rings, the name card. It holds its end (the wheel turning, the Plates orbiting, light rising) until the
 * page takes it away. `short`: half the time.
 */
export function stairwayTimeline(p: BreachParams): Timeline<ClimbState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const T_RAY = 0.35 * k
  const T_LIFT = 1.1 * k
  const T_OPEN = 1.15 * k
  const T_BOOM = 1.9 * k
  const T_CARD = 2.3 * k
  const hv = h - (p.inset ?? 0)
  const hall = hallOf(w, hv)
  const { c, R } = hall.wheel
  const barN = Math.round(Math.min(16, h * 0.08))
  const cardY = Math.round(Math.min(hv - 36, h - barN - 34))
  const build = (t: number) => ease.outQ(span(t, T_LIFT, T_BOOM + 0.1 * k))
  const cols = (t: number) => span(t, T_LIFT + 0.3 * k, T_BOOM + 0.3 * k)
  const open = (t: number) => ease.ioS(span(t, T_OPEN, T_BOOM - 0.1 * k))
  const plates = (t: number) => 17 * span(t, T_OPEN + 0.3 * k, T_BOOM)
  // The ring spins fast as it gathers, slowing to its turn once it stands.
  const rot = (t: number) => t * 0.6 + Math.min(t, T_BOOM) * 2.4
  return {
    id: 'plates-way-in',
    hold: true,
    dur: p.short ? 2.2 : 3.9,
    setup() {
      const r = rng(493)
      const world = worldOf(w, h, p.picture)
      let data: Uint8ClampedArray | null = null
      try {
        data = world.g.getImageData(0, 0, w, h).data
      } catch {
        data = null
      }
      const cs = Math.max(10, Math.round(Math.min(w, h) / 11))
      const bits: Mote[] = []
      const nx = Math.ceil(w / cs)
      const ny = Math.ceil(h / cs)
      for (let gy = 0; gy < ny; gy++)
        for (let gx = 0; gx < nx; gx++) {
          const A: [number, number] = [gx * cs, gy * cs]
          const B: [number, number] = [gx * cs + cs, gy * cs]
          const C: [number, number] = [gx * cs + cs, gy * cs + cs]
          const D: [number, number] = [gx * cs, gy * cs + cs]
          for (const tri of [
            [A, B, C],
            [A, C, D],
          ] as [number, number][][]) {
            const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3
            const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3
            const sx = clamp(Math.round(cx), 0, w - 1)
            const sy = clamp(Math.round(cy), 0, h - 1)
            const i = (sy * w + sx) * 4
            const col = data
              ? `#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`
              : PL.stone
            // Nearest the light first: the top of the screen goes before the bottom.
            const dist = Math.hypot(cx - c.x, cy - c.y) / Math.hypot(w, h)
            bits.push({ tri, cx, cy, col, rel: T_LIFT + dist * 0.8 * k + r() * 0.12 * k, done: false })
          }
        }
      const rays: [number, number][][] = []
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
        const L = Math.hypot(w, h) * 0.62
        rays.push(crackPath(r, c.x, c.y, c.x + Math.cos(a) * L, c.y + Math.sin(a) * L))
      }
      return {
        r,
        world,
        bits,
        rays,
        light: canvas(w, h),
        fx: new Particles(),
        amb: new Particles(),
        shown: 0,
        shakes: [[T_BOOM, 0.6, 2]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const g = s.world.g
      g.globalCompositeOperation = 'destination-out'
      for (const b of s.bits)
        if (!b.done && t >= b.rel) {
          b.done = true
          fillTri(
            g,
            b.tri.map(
              ([x, y]) => [x + Math.sign(x - b.cx) * 1.5, y + Math.sign(y - b.cy) * 1.5] as [number, number],
            ),
            '#000',
          )
        }
      g.globalCompositeOperation = 'source-over'
      // Sparks off each step as it comes down out of the light.
      const shown = Math.round(hall.steps * build(t))
      for (let n = s.shown; n < shown; n++) {
        const i = hall.steps - 1 - n
        const y = at(hall, 0, (i + 1) * hall.dy, hall.z0 + i).y
        const hw = (hall.half * hall.f) / (hall.z0 + i)
        for (let q = 0; q < (p.short ? 2 : 4); q++)
          s.fx.add({
            x: hall.cx + s.r.range(-hw, hw),
            y,
            vx: s.r.range(-8, 8),
            vy: -s.r.range(6, 24),
            drag: 2,
            life: s.r.range(0.3, 0.6),
            size: 1,
            shape: 'px',
            colors: [PL.white, PL.pale, PL.goldLit],
          })
      }
      s.shown = shown
      if (t > T_OPEN) feedLight(s.amb, s.r, c, R, t > T_BOOM ? 0.6 : 0.35)
      if (t > T_LIFT) feedHall(s.amb, s.r, w, hv, 0.35)
      if (t >= T_BOOM && t - dt < T_BOOM)
        for (let i = 0; i < 48; i++) {
          const a = s.r() * Math.PI * 2
          const v = s.r.range(40, 140)
          s.fx.add({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: s.r.range(0.5, 0.9),
            size: s.r.int(1, 2),
            shape: s.r() < 0.5 ? 'star' : 'sq',
            colors: i % 3 ? [PL.white, PL.pale, PL.goldLit, PL.gold] : [PLATE_COLORS[i % 17]!, PL.white],
          })
        }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = PL.sky[0]!
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      drawHall(g, hall, h, t, s.light, {
        rayK: 0.2 * span(t, T_OPEN, T_BOOM) + 0.25 * span(t, T_BOOM, T_BOOM + 0.4),
        rot: rot(t),
        plates: plates(t),
        open: open(t),
        wheelHot: t >= T_BOOM ? 1 - span(t, T_BOOM, T_BOOM + 0.6) : 0.5 * span(t, T_OPEN, T_BOOM),
        build: build(t),
        cols: cols(t),
      })
      frontClouds(g, w, hv, t)
      s.amb.draw(g)
      g.drawImage(s.world, 0, 0)
      // Two white pulses over the area before it gives way.
      const white = Math.max(
        0.5 * Math.sin(Math.PI * span(t, 0.02, 0.22 * k + 0.02)),
        0.5 * Math.sin(Math.PI * span(t, 0.2 * k, 0.4 * k)),
      )
      if (white > 0) wash(g, PL.white, white, 8)
      if (t < T_LIFT + 0.2 && t > T_RAY * 0.6) {
        const gr = Math.round(4 + 6 * span(t, T_RAY * 0.6, T_LIFT))
        g.drawImage(glow(gr, PL.goldLit, 1.3, 0.9), c.x - gr, c.y - gr)
        rect(g, c.x - gr, c.y, gr * 2 + 1, 1, PL.white)
        rect(g, c.x, c.y - gr, 1, gr * 2 + 1, PL.white)
      }
      // Rays of light racing out of it over the area: gold, a white core.
      const rk = ease.outC(span(t, T_RAY, T_LIFT + 0.1 * k))
      if (rk > 0 && t < T_LIFT + 0.5 * k)
        for (const pts of s.rays) {
          const n = Math.max(1, Math.floor(pts.length * rk))
          for (let i = 1; i < n; i++)
            line(g, pts[i - 1]![0] + 1, pts[i - 1]![1], pts[i]![0] + 1, pts[i]![1], PL.gold)
          for (let i = 1; i < n; i++)
            line(
              g,
              pts[i - 1]![0],
              pts[i - 1]![1],
              pts[i]![0],
              pts[i]![1],
              PL.white,
              i < pts.length * 0.4 ? 2 : 1,
            )
        }
      // The tiles rising and whitening into light.
      for (const b of s.bits) {
        if (!b.done) continue
        const q = span(t, b.rel, b.rel + 0.6 * k)
        if (q >= 1) continue
        const sc = 1 - ease.inQ(q) * 0.8
        const oy = -ease.inQ(q) * 26
        const tri = b.tri.map(
          ([x, y]) => [b.cx + (x - b.cx) * sc, b.cy + (y - b.cy) * sc + oy] as [number, number],
        )
        fillTri(g, tri, mix(b.col, PL.white, Math.min(1, q * 1.6)))
      }
      const big = Math.max(w, h) * 0.7
      burstRing(g, c.x, c.y, span(t, T_BOOM, T_BOOM + 0.6), big, 3, PL.white)
      burstRing(g, c.x, c.y, span(t, T_BOOM + 0.08, T_BOOM + 0.7), big, 2, PL.goldLit)
      burstRing(g, c.x, c.y, span(t, T_BOOM + 0.16, T_BOOM + 0.8), big, 2, PL.gold)
      s.fx.draw(g)
      g.restore()
      if (within(t, T_BOOM, T_BOOM + 0.3))
        screenFlash(g, '#ffffff', 0.75 * (1 - span(t, T_BOOM, T_BOOM + 0.3)))
      bars(g, w, h, Math.round(barN * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nameCard(
          g,
          w,
          cardY,
          span(t, T_CARD, T_CARD + 0.3),
          p.title,
          [],
          span(t, T_CARD + 0.45, T_CARD + 0.8),
          LIGHT_CARD,
        )
    },
    cues: () =>
      [
        [0.02, () => quiet('evolve.white')],
        [T_RAY, () => quiet('legend.pulse')],
        [T_LIFT, (hud) => (quiet('evolve.burst'), hud.beat?.('line'))],
        [T_BOOM, () => quiet('hatch.shiny')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<ClimbState>[],
  }
}

// ---------------------------------------------------------------- the altar

/**
 * An altar, its foot (bottom middle) at (x, y), `u` art pixels to a unit: a plinth, a shaft of pale stone lit on its
 * left with a carved groove and diamond, a gold-banded top whose face holds a slot for a Plate, all edged in dark gold
 * so it reads on any page. `lit` (0..1) burns the carvings and the slot in `col`; `white` paints it white (a hit's
 * frame). Returns the slot's middle.
 */
export function drawAltar(
  g: G,
  x: number,
  y: number,
  u: number,
  { lit = 0, col = PL.goldLit, white = false }: { lit?: number; col?: string; white?: boolean } = {},
): Point {
  x = Math.round(x)
  y = Math.round(y)
  const U = (n: number) => Math.round(n * u)
  const edge = '#7a5a28'
  const box = (bx: number, by: number, bw: number, bh: number, c: string) =>
    rect(g, bx, by, bw, bh, white ? PL.white : c)
  // The plinth: its front and its top seen from above.
  const pw = U(13)
  const py = y - U(3)
  rect(g, x - pw - 1, py - U(2) - 1, pw * 2 + 3, U(5) + 1, edge)
  box(x - pw, py - U(2), pw * 2 + 1, U(2), PL.tread)
  box(x - pw, py, pw * 2 + 1, U(3) - 1, PL.riserMid)
  box(x - pw, py, pw * 2 + 1, 1, PL.nose)
  // The shaft.
  const sw = U(8)
  const sh = U(11)
  const sy = py - U(2) - sh
  rect(g, x - sw - 1, sy, sw * 2 + 3, sh, edge)
  box(x - sw, sy, sw * 2 + 1, sh, PL.stone)
  box(x - sw, sy, U(3), sh, PL.stoneLit)
  box(x + sw - U(3) + 1, sy, U(3), sh, PL.stoneDark)
  box(x - sw, sy + sh - U(1), sw * 2 + 1, U(1), PL.gold)
  // The carvings: a groove down its middle, a diamond in it, burning in the Plate's colour once lit.
  const cc = lit > 0 ? (lit > 0.6 ? PL.white : col) : PL.riser
  const gw = Math.max(1, U(1))
  box(x - (gw >> 1), sy + U(2), gw, sh - U(4), lit > 0 ? col : PL.riser)
  const dr = U(2.5)
  for (let k = 0; k <= dr; k++) box(x - k, sy + Math.round(sh / 2) - dr + k, k * 2 + 1, (dr - k) * 2 + 1, cc)
  if (lit > 0) box(x, sy + Math.round(sh / 2) - 1, 1, 3, PL.white)
  // The top: a gold band, then its face with the slot.
  const tw = U(11)
  const ty = sy - U(3)
  rect(g, x - tw - 1, ty - U(3) - 1, tw * 2 + 3, U(6) + 1, edge)
  box(x - tw, ty, tw * 2 + 1, U(3), PL.gold)
  box(x - tw, ty, tw * 2 + 1, 1, PL.pale)
  box(x - tw, ty + U(3) - 1, tw * 2 + 1, 1, PL.deep)
  box(x - tw, ty - U(3), tw * 2 + 1, U(3), PL.tread)
  box(x - tw, ty - U(3), tw * 2 + 1, 1, PL.stoneLit)
  const slot = { x, y: ty - U(1.5) }
  const ss = U(5)
  box(x - ss, slot.y - Math.max(1, U(0.5)), ss * 2 + 1, Math.max(2, U(1)), lit > 0 ? col : PL.ink)
  if (lit > 0.3) box(x - ss + 1, slot.y, ss * 2 - 1, 1, PL.white)
  return slot
}

// ---------------------------------------------------------------- the altar, looping

/**
 * The altar on a loop (the rules' banner, the way-in pop-up on its own, by an altar's blessings). `scene`: the Hall
 * (its sky, the stairway, the wheel and its Plates turning, light rising); else an altar with the wheel turning over
 * it, its Plates orbiting, on a clear canvas. `still`: one frame, held.
 */
export function altarLoop(
  w: number,
  h: number,
  { scene = true, still = false }: { scene?: boolean; still?: boolean } = {},
): PortalLoop {
  const r = rng(w * 37 + h)
  const hall = hallOf(w, h)
  const rays = canvas(w, h)
  const u = Math.max(1, Math.round(Math.min(w, h) / 60))
  const R = scene ? hall.wheel.R : Math.max(5, Math.round(Math.min(w, h) * 0.2))
  const c = scene ? hall.wheel.c : { x: Math.round(w / 2), y: Math.round(h * 0.32) }
  const amb = new Particles()
  const feed = () => {
    feedLight(amb, r, c, R, 0.45)
    if (scene) feedHall(amb, r, w, h, 0.3)
  }
  if (!still)
    for (let i = 0; i < 150; i++) {
      feed()
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feed()
      amb.update(dt)
    },
    draw(g, t0) {
      const t = still ? 0.4 : t0
      if (scene) {
        drawHall(g, hall, h, t, rays, { rayK: still ? 0 : 0.35 })
        frontClouds(g, w, h, t)
      } else {
        g.clearRect(0, 0, w, h)
        const gr = Math.round(R * 1.9)
        g.drawImage(glow(gr, PL.pale, 1.3, 0.6), c.x - gr, c.y - gr)
        drawOrbit(g, c, R, t, t * 0.6, false)
        drawWheel(g, c, R, t, { glowK: 0.6 })
        drawOrbit(g, c, R, t, t * 0.6, true)
        drawAltar(g, w / 2, h - 1, u, { lit: 1, col: PL.goldLit })
      }
      amb.draw(g)
    },
  }
}

// ---------------------------------------------------------------- an altar lit

type LitState = { r: Rng; fx: Particles; amb: Particles; rays: Canvas; buf: Canvas }

/** An altar lit: which Plate the blessing was (its colour); none, Arceus's own gold. */
export interface AltarLitParams extends CloseParams {
  plate?: DieType | null
}

/**
 * A blessing picked (closeTimeline's, in light): an altar stands on a step; a Plate of the blessing's colour appears
 * high above in a twinkle and comes down turning, hovers over the altar's slot drawing light in, then drops into it:
 * a white frame, the altar's carvings ignite in its colour, a ring runs out over the floor, sparks fly; a beam of its
 * light shoots up the stairway to the wheel and the next landing's beacons catch, its step edge glowing. Over the page
 * (`clear`): the altar alone, the beam up off the top, then it all fades out through the dither.
 */
export function altarLitTimeline(p: AltarLitParams = {}): Timeline<LitState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.55 : 1
  const DUR = p.short ? 0.9 : 1.6
  const T_SHOW = 0.03 * k
  const T_IN = 0.25 * k
  const T_HOVER = 0.48 * k
  const T_DROP = 0.62 * k
  const T_SHUT = 0.7 * k
  const T_BEAM = T_SHUT + 0.03 * k
  const T_NEXT = T_SHUT + 0.3 * k
  const T_FADE = DUR - 0.32 * k
  const col = plateColor(p.plate)
  const lite = mix(col, '#ffffff', 0.55)
  const hall = hallOf(w, h)
  const { c, R } = hall.wheel
  const u = Math.max(1, Math.round(Math.min(w, h * 1.5) / 120))
  const foot = { x: Math.round(w / 2), y: Math.round(h * (p.clear ? 0.8 : 0.9)) }
  /** Landings already lit before this one (the lab's picture: three). */
  const LIT = 3
  const colors = LANDING_COLORS.map((x, j) => (j === LIT ? col : x))
  const slotY = foot.y - 22 * u
  const hoverY = slotY - 14 * u
  const startY = p.clear ? Math.round(h * 0.06) : c.y
  const plateAt = (t: number) => {
    if (t < T_HOVER) return lerp(startY, hoverY, ease.outQ(span(t, T_SHOW, T_HOVER)))
    if (t < T_DROP) return hoverY - Math.round(2 * u * Math.sin(Math.PI * span(t, T_HOVER, T_DROP)))
    return lerp(hoverY, slotY + 3 * u, ease.inQ(span(t, T_DROP, T_SHUT)))
  }
  return {
    id: 'plates-altar',
    dur: DUR,
    setup: () => ({
      r: rng(19),
      fx: new Particles(),
      amb: new Particles(),
      rays: canvas(w, h),
      buf: canvas(w, h),
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (!p.clear) feedHall(s.amb, r, w, h, 0.3)
      // A trail of its light as it comes down.
      if (t > T_SHOW && t < T_SHUT && r() < 0.7)
        s.fx.add({
          x: foot.x + r.range(-4, 4) * u,
          y: plateAt(t) - r.range(0, 8) * u,
          vy: -r.range(4, 12),
          life: r.range(0.25, 0.45),
          size: 1,
          shape: 'px',
          colors: [PL.white, lite, col],
        })
      // Light drawn into the slot while it hovers.
      if (t >= T_HOVER && t - dt < T_HOVER)
        for (let i = 0; i < (p.short ? 10 : 18); i++) {
          const a = (i / 18) * Math.PI * 2
          s.fx.add({
            x: foot.x + Math.cos(a) * 30 * u,
            y: slotY + Math.sin(a) * 12 * u,
            home: { x: foot.x, y: slotY, k: 320 },
            life: 0.4,
            size: 1,
            shape: 'sq',
            colors: [PL.white, lite, col],
          })
        }
      if (t >= T_SHUT && t - dt < T_SHUT) {
        for (let i = 0; i < 26; i++) {
          const a = r() * Math.PI * 2
          const v = r.range(30, 110)
          s.fx.add({
            x: foot.x,
            y: slotY,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v * 0.6 - 20,
            ay: 60,
            drag: 2.5,
            life: r.range(0.4, 0.7),
            size: r.int(1, 2),
            shape: i % 2 ? 'star' : 'sq',
            colors: [PL.white, lite, col],
          })
        }
      }
      // The next landing's braziers catching.
      if (!p.clear && t >= T_NEXT && t - dt < T_NEXT)
        for (const sd of [-1, 1]) {
          const i = LIT * 3
          const to = at(hall, sd * hall.half, i * hall.dy + WALL + 1, hall.z0 + i)
          for (let q = 0; q < 10; q++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: to.x,
              y: to.y,
              vx: Math.cos(a) * r.range(15, 45),
              vy: Math.sin(a) * r.range(15, 45) - 15,
              drag: 3,
              life: r.range(0.3, 0.5),
              size: 1,
              shape: q % 3 ? 'px' : 'star',
              colors: [PL.white, lite, col],
            })
          }
        }
      // Embers rising off it once it burns.
      if (t > T_SHUT && t < T_FADE && r() < 0.5)
        s.fx.add({
          x: foot.x + r.range(-9, 9) * u,
          y: slotY + r.range(0, 16) * u,
          vy: -r.range(12, 26),
          life: r.range(0.4, 0.8),
          size: 1,
          shape: 'px',
          colors: [PL.white, lite, col],
        })
    },
    draw(g0, s, t) {
      const d = p.clear ? s.buf.g : g0
      if (p.clear) d.clearRect(0, 0, w, h)
      else {
        // The Hall, three landings lit; the fourth catches when the beam reaches the wheel.
        const next = t >= T_NEXT
        drawHall(d, hall, h, t, s.rays, {
          rayK: 0.3,
          lit: next ? LIT + 1 : LIT,
          colors,
          hot: (i) => (Math.floor(i / 3) === LIT && next ? 1 - span(t, T_NEXT, T_NEXT + 0.5 * k) : 0),
          flare: (j) => (j === LIT + 1 ? 1 - span(t, T_NEXT, T_NEXT + 0.5 * k) : 0),
        })
        frontClouds(d, w, h, t)
        s.amb.draw(d)
      }
      // Its glow once lit, behind it.
      const litK = t >= T_SHUT ? 1 : 0
      if (litK) {
        const gr = Math.round(22 * u * (1 + 0.3 * (1 - span(t, T_SHUT, T_SHUT + 0.4 * k))))
        d.drawImage(glow(gr, col, 1.3, q8(0.75 - 0.35 * span(t, T_SHUT, T_FADE))), foot.x - gr, slotY - gr)
      }
      // A faint column of its light over the slot while the Plate comes.
      const pre = span(t, T_SHOW, T_HOVER) * (1 - span(t, T_SHUT, T_SHUT + 0.05))
      if (pre > 0) rect(d, foot.x - 3 * u, 0, 6 * u + 1, slotY, pattern(d, lite, Math.round(4 * pre)))
      // The ring running out over the floor from its foot.
      const rq = span(t, T_SHUT, T_SHUT + 0.45 * k)
      if (rq > 0 && rq < 1) {
        const rx = Math.round(lerp(14, 70, ease.outC(rq)) * u)
        ellipseLine(d, foot.x, foot.y, rx, Math.round(rx * 0.28), rq < 0.5 ? PL.white : col)
        ellipseLine(d, foot.x, foot.y, rx - u, Math.round((rx - u) * 0.28), rq < 0.6 ? col : lite)
      }
      const white = within(t, T_SHUT, T_SHUT + 2 / 60)
      drawAltar(d, foot.x, foot.y, u, {
        lit: litK * (1 - span(t, T_SHUT + 0.05, T_SHUT + 0.3)) + litK * 0.5,
        col,
        white,
      })
      // The Plate: a twinkle, then the tablet turning as it comes down, facing us as it hovers, into the slot.
      if (t >= T_SHOW && t < T_SHUT + 2 / 60) {
        const y = plateAt(t)
        const turn = t < T_HOVER ? Math.cos((t - T_SHOW) * 14 * (1 - span(t, T_SHOW, T_HOVER) * 0.7)) : 1
        const pq = ease.outBack(span(t, T_SHOW, T_SHOW + 0.12 * k), 2)
        d.save()
        d.beginPath()
        d.rect(0, 0, w, slotY)
        d.clip()
        drawPlate(d, foot.x, y, 7 * u * pq, col, Math.abs(turn) < 0.15 ? 0.15 : turn, t, 3, 0.7)
        d.restore()
        if (t < T_SHOW + 0.2 * k) {
          const sr = Math.round((3 + 4 * Math.sin(Math.PI * span(t, T_SHOW, T_SHOW + 0.2 * k))) * u)
          rect(d, foot.x - sr, Math.round(y), sr * 2 + 1, 1, PL.white)
          rect(d, foot.x, Math.round(y) - sr, 1, sr * 2 + 1, PL.white)
        }
      }
      // The beam: up from the slot, wide and white, thinning as it fades; over the Hall it reaches the wheel.
      const top = p.clear ? -2 : c.y
      const bq = span(t, T_BEAM, T_BEAM + 0.12 * k)
      if (bq > 0 && t < T_FADE + 0.1) {
        const fade = 1 - span(t, T_NEXT, T_FADE + 0.1)
        const bw = Math.max(1, Math.round(5 * u * fade))
        const y0 = Math.round(lerp(slotY, top, ease.outC(bq)))
        const hh = slotY - y0
        rect(d, foot.x - bw - 2 * u, y0, bw * 2 + 4 * u + 1, hh, pattern(d, col, Math.round(10 * fade)))
        rect(d, foot.x - bw, y0, bw * 2 + 1, hh, col)
        rect(d, foot.x - Math.max(0, bw - 2), y0, Math.max(1, bw * 2 - 3), hh, PL.white)
        if (!p.clear && bq >= 1) {
          const gr = Math.round(R * 0.8 * fade) + 2
          d.drawImage(glow(gr, PL.white, 1.1, q8(fade)), c.x - gr, c.y - gr)
        }
      }
      if (!p.clear) {
        burstRing(d, c.x, c.y, span(t, T_BEAM + 0.12 * k, T_BEAM + 0.5 * k), R * 2.6, 2, col)
        // The light running down to the next landing's braziers.
        const lq = span(t, T_BEAM + 0.12 * k, T_NEXT)
        if (lq > 0 && lq < 1) {
          const i = LIT * 3
          for (const sd of [-1, 1]) {
            const to = at(hall, sd * hall.half, i * hall.dy + WALL + 1, hall.z0 + i)
            const x = lerp(c.x, to.x, ease.inQ(lq))
            const y = lerp(c.y, to.y, ease.inQ(lq))
            rect(d, Math.round(x) - 1, Math.round(y) - 1, 3, 3, col)
            rect(d, Math.round(x), Math.round(y), 1, 1, PL.white)
          }
        }
      }
      s.fx.draw(d)
      if (p.clear) dissolve(g0, s.buf, Math.min(span(t, 0, 0.08 * k), 1 - span(t, T_FADE, DUR - 0.02)))
      else if (within(t, T_SHUT, T_SHUT + 0.2))
        screenFlash(g0, '#ffffff', 0.45 * (1 - span(t, T_SHUT, T_SHUT + 0.2)))
    },
    cues: () =>
      [
        [T_IN, () => fxSound('portal.close')],
        [T_SHUT, (hud) => hud.beat?.('sealed')],
      ] satisfies Cue<LitState>[],
  }
}

// ---------------------------------------------------------------- the victory: Arceus comes down

const SIL = '#4a2e0c'

/**
 * A sprite's shape backlit, cached: dark, the light catching the edges it shows to the sky above and beside it (two
 * pixels, pale then gold), never the edges of the holes inside its shape (they stay dark, so it reads as one body).
 */
function backlit(key: string): Canvas | null {
  const f = spriteFrame(key)
  if (!f) return null
  return cached(`pl-backlit|${key}|${f.width}x${f.height}`, () => {
    const w = f.width
    const h = f.height
    let src: Uint8ClampedArray
    try {
      src = f.g.getImageData(0, 0, w, h).data
    } catch {
      return null
    }
    const solid = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! > 32
    // Outside: the clear pixels the border reaches.
    const out = new Uint8Array(w * h)
    const stack: number[] = []
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h || out[y * w + x] || solid(x, y)) return
      out[y * w + x] = 1
      stack.push(x, y)
    }
    for (let x = 0; x < w; x++) {
      push(x, 0)
      push(x, h - 1)
    }
    for (let y = 0; y < h; y++) {
      push(0, y)
      push(w - 1, y)
    }
    while (stack.length) {
      const y = stack.pop()!
      const x = stack.pop()!
      push(x + 1, y)
      push(x - 1, y)
      push(x, y + 1)
      push(x, y - 1)
    }
    const outside = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || out[y * w + x] === 1
    // Lit from above and from either side: how near an edge facing that light it is.
    const lit = (x: number, y: number, d: number) =>
      outside(x, y - d) ||
      outside(x - d, y) ||
      outside(x + d, y) ||
      outside(x - d, y - d) ||
      outside(x + d, y - d)
    return shade(w, h, (x, y) =>
      !solid(x, y)
        ? null
        : lit(x, y, 1)
          ? PL.pale
          : lit(x, y, 2)
            ? PL.goldLit
            : y % 2 && lit(x, y, 3)
              ? PL.deep
              : SIL,
    )
  })
}

type DescentState = {
  r: Rng
  fx: Particles
  amb: Particles
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * The last altar lit (victoryTimeline's, in light): the Hall with every landing's beacons burning, the wheel throbbing
 * in two white pulses; a flare in the wheel, and shiny Arceus's silhouette stands at the top of the stairs (dark, rimmed
 * in white light) and comes down them a landing at a stride, growing as it nears, each landing flaring under it; at
 * the foot the light gathers into it; the reveal (a flash, rings, the roar: `beat('roar')`, a quake); the Judgment:
 * the Plates leave the wheel and come down as seventeen beams of their colours in a burst round it, each striking the
 * stairs in a ring and sparks; the shiny sparkle; the Plates back round the wheel, a calm hold, and the name card
 * under its feet (`beat('card')`). `short`: no pulses, half the time.
 */
export function descentTimeline(p: VictoryParams): Timeline<DescentState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const short = !!p.short
  const hv = h - (p.inset ?? 0)
  const hall = hallOf(w, hv)
  const { c, R } = hall.wheel
  const T_SIL = short ? 0.2 : 1.2
  const T_WALK = T_SIL + (short ? 0.1 : 0.3)
  const T_REVEAL = short ? 1.0 : 3.1
  const T_ARRIVE = T_REVEAL - (short ? 0.2 : 0.45)
  const T_JUDGE = T_REVEAL + 0.15
  const T_RAIN = T_JUDGE + (short ? 0.08 : 0.15)
  const GAP = short ? 0.02 : 0.035
  const FALL = short ? 0.08 : 0.12
  const T_SHINY = T_REVEAL + 0.3
  const T_CARD = T_REVEAL + (short ? 0.7 : 1.1)
  const DUR = T_CARD + (short ? 1.4 : 2.0)
  const barN = Math.round(Math.min(16, h * 0.08))
  const cardY = Math.round(Math.min(hv - 34, h - barN - 32))
  // Where it stops: the lowest step whose tread is still above the card.
  let iEnd = hall.steps - 1
  for (let i = 0; i < hall.steps; i++)
    if (onStep(hall, i).y <= cardY - 2) {
      iEnd = i
      break
    }
  const zEnd = onStep(hall, iEnd).z
  const S = Math.max(1, Math.round(Math.min(w, hv) / 170))
  const feet = { x: hall.cx, y: Math.round(onStep(hall, iEnd).y) }
  // Its strides: a landing at a time, from the top step down to where it stops.
  const stops: number[] = []
  for (let i = hall.steps - 1; i > iEnd; i -= 3) stops.push(i)
  stops.push(iEnd)
  const stride = (T_ARRIVE - T_WALK) / Math.max(1, stops.length - 1)
  const walk = (t: number) => {
    if (t <= T_WALK) return { i: stops[0]!, hop: 0 }
    if (t >= T_ARRIVE) return { i: iEnd, hop: 0 }
    const v = span(t, T_WALK, T_ARRIVE) * (stops.length - 1)
    const n = Math.min(stops.length - 2, Math.floor(v))
    const q = v - n
    return { i: lerp(stops[n]!, stops[n + 1]!, ease.ioQ(q)), hop: Math.sin(Math.PI * q) }
  }
  const landed = (i: number) => {
    const n = stops.indexOf(i)
    return n > 0 ? T_WALK + n * stride : -1
  }
  const sizeOf = () => spriteSize(p.mon)
  // The Judgment: each Plate's beam, where it strikes (a burst round its feet, near and far) and when.
  const beams = PLATE_COLORS.map((col, j) => {
    const a = (j / 17) * Math.PI * 2 + 0.4
    const rr = j % 2 ? 1 : 0.6
    const X = Math.cos(a) * hall.half * 1.3 * rr
    const z = Math.max(hall.z0 + 0.6, zEnd + Math.sin(a) * (Math.sin(a) > 0 ? 9 : 2.5) * rr)
    const fi = z - hall.z0 - 0.5
    const hit = at(hall, X, (fi + 1) * hall.dy, z)
    // From high above its middle, so the seventeen fan out as they fall (a radial burst).
    const from = { x: feet.x + (hit.x - feet.x) * 0.6, y: -12 }
    // Every seventh in turn, so they fall all round at once rather than sweeping round.
    return { col, hit, from, z, t0: T_RAIN + ((j * 7) % 17) * GAP, k: hall.z0 / z }
  })
  const plateRot = (t: number) => t * 0.6 + Math.max(0, Math.min(t, T_JUDGE) - T_ARRIVE) * 6
  return {
    id: 'plates-victory',
    dur: DUR,
    setup() {
      return {
        r: rng(4930),
        fx: new Particles(),
        amb: new Particles(),
        rays: canvas(w, h),
        shakes: short
          ? [[T_REVEAL, 0.6, 2]]
          : [
              [T_REVEAL, 0.9, 3],
              [T_RAIN + 0.2, 0.7, 1],
            ],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      feedLight(s.amb, r, c, R, 0.4)
      feedHall(s.amb, r, w, hv, 0.35)
      const passed = (t0: number) => t >= t0 && t - dt < t0
      const sz = sizeOf()
      // A puff of light under it at each landing.
      for (const i of stops)
        if (passed(landed(i))) {
          const at0 = onStep(hall, i)
          const sc = (S * zEnd) / at0.z
          for (let q = 0; q < 6; q++)
            s.fx.add({
              x: at0.x + r.range(-0.4, 0.4) * sz.w * sc,
              y: at0.y,
              vx: r.range(-20, 20) * sc,
              vy: -r.range(4, 16) * sc,
              drag: 3,
              life: 0.35,
              size: 1,
              shape: 'px',
              colors: [PL.white, PL.pale, PL.goldLit],
            })
        }
      // The light gathering into it at the foot.
      if (t > T_ARRIVE && t < T_REVEAL - 0.05 && r() < 0.8)
        for (let q = 0; q < 2; q++) {
          const a = r() * Math.PI * 2
          const d = r.range(40, 70) * S
          s.fx.add({
            x: feet.x + Math.cos(a) * d,
            y: feet.y - (sz.h * S) / 2 + Math.sin(a) * d * 0.7,
            home: { x: feet.x, y: feet.y - (sz.h * S) / 2, k: 500 },
            life: 0.5,
            size: 1,
            shape: 'sq',
            colors: [PL.white, PL.pale, PL.goldLit],
          })
        }
      if (passed(T_REVEAL))
        for (let q = 0; q < 50; q++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 160)
          s.fx.add({
            x: feet.x,
            y: feet.y - (sz.h * S) / 2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: q % 3 ? [PL.white, PL.pale, PL.goldLit, PL.gold] : [PLATE_COLORS[q % 17]!, PL.white],
          })
        }
      // Each beam striking: sparks of its colour, a splash of light.
      for (const b of beams)
        if (passed(b.t0 + FALL)) {
          for (let q = 0; q < (short ? 5 : 9); q++) {
            const a = -Math.PI * r.range(0.05, 0.95)
            const v = r.range(30, 90) * Math.max(0.5, b.k)
            s.fx.add({
              x: b.hit.x,
              y: b.hit.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 140,
              drag: 1.5,
              life: r.range(0.35, 0.6),
              size: 1,
              shape: q % 3 ? 'px' : 'star',
              colors: [PL.white, b.col, b.col],
            })
          }
        }
      for (const [t0, rr] of [
        [T_SHINY, 22],
        [T_SHINY + 0.25, 34],
      ] as const)
        if (passed(t0))
          for (let q = 0; q < 12; q++) {
            const a = (q / 12) * Math.PI * 2
            s.fx.add({
              x: feet.x + Math.cos(a) * rr * 0.4,
              y: feet.y - (sz.h * S) / 2 + Math.sin(a) * rr * 0.4,
              vx: Math.cos(a) * rr * 2.2,
              vy: Math.sin(a) * rr * 2.2,
              drag: 3,
              life: 0.55,
              size: 2,
              shape: 'star',
              colors: ['#ffffff', '#fff6a8', '#ffe14d'],
            })
          }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = PL.sky[0]!
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      const pulse = short
        ? 0
        : Math.round(
            R * 0.12 * (Math.sin(Math.PI * span(t, 0.1, 0.35)) + Math.sin(Math.PI * span(t, 0.45, 0.7))),
          )
      const pos = walk(t)
      // The Plates leave the wheel as beams at the Judgment and come back round it for the card.
      const platesOut = t < T_JUDGE ? 17 : 17 * span(t, T_CARD - 0.3, T_CARD + 0.4)
      drawHall(g, hall, h, t, s.rays, {
        rayK:
          t < T_REVEAL
            ? 0.35 + 0.25 * span(t, T_ARRIVE, T_REVEAL)
            : lerp(0.6, 0.35, span(t, T_REVEAL, T_CARD)),
        rot: plateRot(t),
        plates: platesOut,
        pulse,
        wheelHot: Math.max(
          t >= T_SIL ? 1 - span(t, T_SIL, T_SIL + 0.4) : 0,
          t >= T_JUDGE ? 1 - span(t, T_JUDGE, T_JUDGE + 0.5) : 0,
          short ? 0 : 0.6 * Math.sin(Math.PI * span(t, 0.1, 0.35)),
          short ? 0 : 0.6 * Math.sin(Math.PI * span(t, 0.45, 0.7)),
        ),
        lit: hall.steps / 3,
        // Each landing flares under it as it lands there.
        hot: (i) => {
          const at0 = landed(i)
          return at0 < 0 ? 0 : t >= at0 ? 1 - span(t, at0, at0 + 0.25) : 0
        },
        flare: (j) => (t < T_JUDGE ? 0 : 0.6 * (1 - span(t, T_JUDGE + j * 0.03, T_JUDGE + 0.5 + j * 0.03))),
      })
      frontClouds(g, w, hv, t)
      if (!short) {
        const white = Math.max(
          0.35 * Math.sin(Math.PI * span(t, 0.1, 0.35)),
          0.35 * Math.sin(Math.PI * span(t, 0.45, 0.7)),
        )
        if (white > 0) wash(g, PL.white, white, 8)
      }
      s.amb.draw(g)
      // The light dims a little before the reveal, so it lands.
      const dim = 0.18 * span(t, T_ARRIVE, T_REVEAL - 0.05) * (t < T_REVEAL ? 1 : 0)
      if (dim > 0) wash(g, PL.ink, dim, 8)
      // The Judgment's beams behind it first.
      const beam = (b: (typeof beams)[number]) => {
        const q = span(t, b.t0, b.t0 + FALL)
        if (q <= 0) return
        const fade = span(t, b.t0 + FALL, b.t0 + FALL + 0.3)
        if (fade >= 1) return
        const hx = lerp(b.from.x, b.hit.x, ease.inQ(q))
        const hy = lerp(b.from.y, b.hit.y, ease.inQ(q))
        const tail = q < 1 ? Math.max(0, ease.inQ(q) - 0.45) : 0
        const tx = lerp(b.from.x, b.hit.x, tail)
        const ty = lerp(b.from.y, b.hit.y, tail)
        const bk = Math.max(0.6, b.k) * S
        const wd = Math.max(1, Math.round((q < 1 ? 5 : 5 * (1 - fade * 1.6)) * bk))
        if (q < 1 || fade < 0.6) {
          line(g, tx, ty, hx, hy, mix(b.col, PL.ink, 0.35), wd + 2)
          line(g, tx, ty, hx, hy, b.col, wd)
          line(g, tx, ty, hx, hy, PL.white, Math.max(1, wd - 2))
        }
        if (q >= 1) {
          // Its strike: a flare of its light, a ring of its colour running out over the stairs.
          const rx = Math.round(lerp(4, 24, ease.outC(fade)) * bk)
          ellipseLine(
            g,
            b.hit.x,
            b.hit.y,
            rx,
            Math.max(1, Math.round(rx * 0.3)),
            fade < 0.5 ? PL.white : b.col,
          )
          ellipseLine(g, b.hit.x, b.hit.y, rx + 1, Math.max(1, Math.round((rx + 1) * 0.3)), b.col)
          if (fade < 0.5) {
            const gr = Math.round(9 * bk * (1 - fade))
            g.drawImage(
              glow(gr, b.col, 1.1, q8(1 - fade * 2)),
              Math.round(b.hit.x) - gr,
              Math.round(b.hit.y) - gr,
            )
            const fr = Math.round(5 * bk)
            rect(g, b.hit.x - fr, b.hit.y, fr * 2 + 1, 1, PL.white)
            rect(g, b.hit.x, b.hit.y - fr * 2, 1, fr * 2, PL.white)
          }
        }
      }
      for (const b of beams) if (b.z >= zEnd) beam(b)
      // Arceus: its silhouette rimmed in light down the stairs, revealed at the foot.
      if (t >= T_SIL) {
        const st = onStep(hall, pos.i)
        const sc = (S * zEnd) / st.z
        const pop = t < T_WALK ? ease.outBack(span(t, T_SIL, T_SIL + 0.2), 2) : 1
        const y = Math.round(st.y - pos.hop * 5 * sc)
        if (t < T_REVEAL) {
          const sz = sizeOf()
          const gather = span(t, T_ARRIVE, T_REVEAL)
          const gr = Math.round(((sz.h * sc) / 2) * (1.1 + 0.4 * gather))
          g.drawImage(
            glow(gr, PL.white, 1.3, q8(0.45 + 0.5 * gather)),
            feet.x - gr,
            Math.round(y - (sz.h * sc) / 2) - gr,
          )
          // A dark shape against the light, rimmed a screen pixel round in white (gold beyond it as the light
          // gathers): drawn here, not as the sprite's outline, which would shrink away with it up the stairs.
          const look = { sx: sc * pop, sy: sc * pop }
          const rim2 = gather > 0 && Math.floor(t * 12) % 2 ? PL.white : PL.goldLit
          for (const [ox, oy] of [
            [-2, 0],
            [2, 0],
            [0, -2],
            [-1, -1],
            [1, -1],
          ] as const)
            drawSprite(g, p.mon, feet.x + ox, y + oy, { ...look, sil: rim2 })
          for (const [ox, oy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ] as const)
            drawSprite(g, p.mon, feet.x + ox, y + oy, { ...look, sil: PL.white })
          const body = backlit(p.mon)
          if (body) {
            const bw = Math.max(1, Math.round(body.width * sc * pop))
            const bh = Math.max(1, Math.round(body.height * sc * pop))
            g.drawImage(body, Math.round(feet.x - bw / 2), y - bh, bw, bh)
          } else drawSprite(g, p.mon, feet.x, y, { ...look, sil: SIL })
        } else {
          const e = t - T_REVEAL
          const flash = e < 0.12 ? 1 : e < 0.2 ? 0.66 : e < 0.28 ? 0.33 : 0
          const bob = t > T_REVEAL + 0.6 ? Math.round(Math.sin((t - T_REVEAL) * 1.8)) : 0
          drawSprite(g, p.mon, feet.x, feet.y + bob, {
            sx: S,
            sy: S,
            flash,
            outline: e < 0.6 ? (Math.floor(t * 8) % 2 ? PL.goldLit : PL.white) : PL.white,
          })
        }
      }
      for (const b of beams) if (b.z < zEnd) beam(b)
      // The Plates shooting up out of the wheel to fall as beams.
      if (t >= T_JUDGE && t < T_RAIN + 0.1)
        PLATE_COLORS.forEach((col, j) => {
          const o = orbit(c, R, j, plateRot(T_JUDGE))
          const q = ease.inQ(span(t, T_JUDGE, T_RAIN))
          const y = lerp(o.y, -20, q)
          line(g, o.x, y, o.x, Math.min(o.y, y + 14), col, 2)
          rect(g, Math.round(o.x), Math.round(y), 1, 3, PL.white)
        })
      burstRing(
        g,
        feet.x,
        feet.y - 30 * S,
        span(t, T_REVEAL, T_REVEAL + 0.6),
        Math.max(w, h) * 0.6,
        3,
        PL.white,
      )
      burstRing(
        g,
        feet.x,
        feet.y - 30 * S,
        span(t, T_REVEAL + 0.1, T_REVEAL + 0.7),
        Math.max(w, h) * 0.6,
        2,
        PL.gold,
      )
      s.fx.draw(g)
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.8 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
      bars(g, w, h, Math.round(barN * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nameCard(
          g,
          w,
          cardY,
          span(t, T_CARD, T_CARD + 0.28),
          p.name,
          p.subs ?? [],
          span(t, T_CARD + 0.4, T_CARD + 0.75),
          LIGHT_CARD,
        )
    },
    cues: () =>
      [
        ...(short
          ? []
          : ([
              [0.1, () => fxSound('evolve.white')],
              [0.45, () => fxSound('evolve.white')],
              [T_SIL, () => fxSound('legend.pulse')],
            ] satisfies Cue<DescentState>[])),
        [T_REVEAL, (hud) => (fxSound('legend.roar'), hud.beat?.('roar'))],
        [T_JUDGE, () => fxSound('evolve.burst')],
        [T_SHINY, () => fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => fxSound('hatch.shiny', 1)],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<DescentState>[],
  }
}

// ---------------------------------------------------------------- the raid: Arceus takes a Plate

/** When the Plate strikes it: the screen's words (its line, the banner) land here. */
export const PLATE_CONTACT = 0.8

/** The type's own bits for the ring its Plate throws off (stars for the rest). */
const BITS: Partial<Record<DieType, ParticleShape>> = {
  ice: 'flake',
  water: 'bubble',
  grass: 'leaf',
  bug: 'leaf',
  electric: 'plus',
  fire: 'sq',
  fairy: 'heart',
  rock: 'sq',
  ground: 'sq',
  steel: 'plus',
}

/**
 * A raid's Arceus taking its bar's Plate (docs/61 §4.5), its own short effect: the stage dims a little and a glint
 * shows high above it; the Plate (a tablet of the new type's colour, a dark rim, a white glint) falls out of the sky
 * turning, trailing its light, and strikes it: a hit-stop, a white frame in which the form changes cleanly, a
 * shockwave of that colour round it and over the ground, a ring of the type's own bits; then the new form in an aura
 * of that colour that fades. Short motion: a flash and the new sprite, one ring.
 */
export function plateTimeline(p: FormParams): Timeline<Stage> {
  const T = p.short ? 0.25 : PLATE_CONTACT
  const DUR = T + (p.short ? 0.9 : 1.3)
  const col = typeColor(p.die)
  const lite = mix(col, '#ffffff', 0.55)
  const dark = mix(col, '#000000', 0.35)
  const STOP = 4 / 60
  const T_GLINT = 0.08
  const T_FALL = 0.32
  const shape = BITS[p.die] ?? 'star'
  const at = (s: Stage) => (p.side === 'own' ? s.L.own : s.L.foe)
  const draw = (g: G, s: Stage, key: string, o: Parameters<typeof drawSprite>[4] = {}) => {
    const L = at(s)
    drawSprite(g, key, L.x, L.y, o)
  }
  const other = (g: G, s: Stage) =>
    p.side === 'own' ? drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y) : drawSprite(g, p.own, s.L.own.x, s.L.own.y)
  /** Where it strikes: its upper middle. */
  const strike = (s: Stage) => {
    const L = at(s)
    const sz = spriteSize(p.from)
    return { x: L.x, y: Math.round(L.y - sz.h * 0.62) }
  }
  return {
    id: p.short ? 'plate-short' : 'plate',
    dur: DUR,
    setup: () => {
      const s = new Stage({ own: p.own, foe: p.foe }, 493)
      if (!p.short) {
        s.screenShakes.push([T, 0.45, 3])
        s.stops.push([T, T + STOP])
      }
      return s
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      const L = at(s)
      const c = strike(s)
      // A burst on the strike fires on the first frame after its hit-stop.
      const passed = s.passed(t)
      // Its light trailing as it falls.
      if (!p.short && t > T_FALL && t < T)
        s.fx.add({
          x: c.x + r.range(-3, 3),
          y: lerp(-14, c.y, ease.inQ(span(t, T_FALL, T))) - r.range(4, 10),
          vy: -r.range(5, 15),
          life: 0.3,
          size: 1,
          shape: 'px',
          colors: [PL.white, lite, col],
        })
      if (passed(T)) {
        const n = p.short ? 10 : 22
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const v = p.short ? 60 : r.range(70, 110)
          s.fx.add({
            x: c.x + Math.cos(a) * 6,
            y: c.y + Math.sin(a) * 6,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v * 0.75,
            drag: 2.8,
            life: r.range(0.5, 0.8),
            size: shape === 'flake' ? 3 : 2,
            shape,
            colors: [PL.white, lite, col, dark],
            light: lite,
            dark,
            spin: r.range(-6, 6),
          })
        }
        if (!p.short)
          for (let i = 0; i < 10; i++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: c.x,
              y: c.y,
              vx: Math.cos(a) * r.range(40, 120),
              vy: Math.sin(a) * r.range(40, 120) - 30,
              drag: 2,
              life: r.range(0.3, 0.5),
              size: 1,
              shape: 'star',
              colors: [PL.white, PL.pale],
            })
          }
      }
      // Motes of its colour rising off the new form while its aura lasts.
      if (t > T + 0.2 && t < DUR - 0.35 && r() < dt * 40) {
        const size = spriteSize(p.to)
        const bit = r() < 0.45
        // Rising from a ring round its feet, drawn in a little as they go up: the aura's flames.
        const a = r() * Math.PI * 2
        s.fx.add({
          x: L.x + Math.cos(a) * size.w * 0.48,
          y: L.y - 2 + Math.sin(a) * 5,
          vx: -Math.cos(a) * r.range(4, 10),
          vy: -r.range(22, 40),
          life: r.range(0.5, 0.8),
          size: bit ? 3 : 1,
          shape: bit ? shape : 'px',
          colors: [PL.white, col, col, dark],
          light: lite,
          dark,
        })
      }
    },
    draw(g, s, t) {
      s.begin(g, t)
      const L = at(s)
      const c = strike(s)
      // The hit-stop holds the whole picture on the strike.
      const tt = within(t, T, T + STOP) ? T : t
      if (!p.short) {
        // A little dusk over the field as the Plate comes, lifting once the change is done.
        const dim = 0.3 * span(tt, 0, 0.25) * (1 - span(tt, T + 0.25, T + 0.7))
        if (dim > 0) wash(g, '#1a1030', dim, 8)
      }
      if (p.side === 'own') other(g, s)
      const size = spriteSize(tt < T ? p.from : p.to)
      if (p.short) {
        burstRing(g, c.x, c.y, span(t, T, T + 0.45), 60, 2, col)
        const flash = t < T ? span(t, 0, T) : 1 - span(t, T, T + 0.35)
        draw(g, s, t < T ? p.from : p.to, { flash })
      } else {
        // Its aura: a glow of its colour behind the new form, fading out.
        const aura = tt >= T ? 1 - span(tt, T + 0.3, DUR - 0.1) : 0
        if (aura > 0) {
          const gr = Math.round(Math.max(size.w, size.h) * 0.62)
          g.drawImage(glow(gr, col, 0.9, q8(0.9 * aura)), L.x - gr, Math.round(L.y - size.h / 2) - gr)
          // Its light pooled on the ground round its feet.
          softEllipse(g, L.x, L.y - 2, Math.round(size.w * 0.6), 7, col, 0.9 * aura, 0.8)
          softEllipse(g, L.x, L.y - 2, Math.round(size.w * 0.35), 4, PL.white, 0.7 * aura, 1)
          // A ring of its colour turning round its feet, in dashes, while the aura lasts.
          if (aura > 0.25) {
            const rx = Math.round(size.w * 0.55)
            const turn = Math.floor(t * 10) / 10
            for (let k = 0; k < 12; k++) {
              const a0 = (k / 12) * Math.PI * 2 + turn
              ellipseLine(g, L.x, L.y - 2, rx, 7, k % 2 ? col : dark, a0, a0 + 0.35)
            }
          }
        }
        // The ground shockwave first, under it.
        const gq = span(tt, T, T + 0.5)
        if (gq > 0 && gq < 1) {
          const rx = Math.round(lerp(10, 70, ease.outC(gq)))
          ellipseLine(g, L.x, L.y - 2, rx, Math.round(rx * 0.25), gq < 0.4 ? PL.white : col)
          ellipseLine(g, L.x, L.y - 2, rx + 2, Math.round((rx + 2) * 0.25), gq < 0.6 ? col : dark)
        }
        if (tt < T) {
          // Before: the old form; the light column it will come down.
          const pre = span(tt, T_GLINT, T)
          if (pre > 0) rect(g, c.x - 4, 0, 9, c.y, pattern(g, lite, Math.round(5 * pre)))
          draw(g, s, p.from, { outline: tt > T - 0.15 ? lite : undefined })
        } else {
          // The strike: a white frame (the old form two frames, the new four), then the new form coming out of it
          // in three steps, rimmed in its colour.
          const e = t - T
          const key = e < STOP + 2 / 60 ? p.from : p.to
          const flash = e < STOP + 6 / 60 ? 1 : e < STOP + 0.16 ? 0.66 : e < STOP + 0.24 ? 0.33 : 0
          const rim = t < DUR - 0.35 ? (Math.floor(t * 6) % 2 ? col : dark) : undefined
          draw(g, s, key, { flash, outline: rim })
        }
        // The glint high above, then the Plate falling, turning, its light trailing.
        if (tt >= T_GLINT && tt < T_FALL + 0.05) {
          const q = span(tt, T_GLINT, T_FALL + 0.05)
          const sr = Math.round(2 + 4 * Math.sin(Math.PI * q))
          rect(g, c.x - sr, 12, sr * 2 + 1, 1, PL.white)
          rect(g, c.x, 12 - sr, 1, sr * 2 + 1, PL.white)
          rect(g, c.x - 1, 11, 3, 3, lite)
        }
        if (tt >= T_FALL && tt <= T) {
          const q = ease.inQ(span(tt, T_FALL, T))
          const py = lerp(12, c.y, q)
          const turn = tt >= T - 0.06 ? 1 : Math.cos((tt - T_FALL) * 16)
          // A streak of its light behind it, longer as it speeds up.
          const L0 = Math.round(6 + 26 * q)
          rect(g, c.x - 4, Math.round(py - L0), 9, L0, pattern(g, col, 10))
          rect(g, c.x - 1, Math.round(py - L0), 3, L0, PL.white)
          drawPlate(g, c.x, py, 12, col, Math.abs(turn) < 0.15 ? 0.15 : turn, tt, 0, 0.7)
        }
        // The shockwave round it: white, its colour, its light.
        burstRing(g, c.x, c.y, span(tt, T, T + 0.4), 64, 3, PL.white)
        burstRing(g, c.x, c.y, span(tt, T + 0.06, T + 0.5), 72, 2, col)
        burstRing(g, c.x, c.y, span(tt, T + 0.12, T + 0.6), 80, 2, lite)
        if (within(t, T, T + 0.1)) screenFlash(g, '#ffffff', 0.55)
      }
      s.fx.draw(g)
      if (p.side === 'foe') other(g, s)
      s.end(g)
    },
    cues: () =>
      p.short
        ? [
            [T, () => fxSound('form.flash')],
            [T, (hud) => hud.contact?.()],
          ]
        : [
            [0.05, () => fxSound('gift.drop')],
            [T, () => fxSound('evolve.touch')],
            [T, (hud) => hud.contact?.()],
          ],
  }
}
