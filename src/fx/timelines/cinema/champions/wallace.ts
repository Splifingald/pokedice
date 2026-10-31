// Wallace's entrance (docs/56), on the battle stage: Sootopolis at dawn, inside its crater. White houses climb the
// terraced walls, the old Gym stands on its island, the lake lies still as a mirror under a pink and gold sky, and a
// white marble stage stands out over the water. A single drop falls and rings the lake; then the show begins: jets of
// water leap up one after another across the lake, each on a note, and dance. A long shape circles under the clear
// water; Milotic breaks the surface and leaps across the crater in a great arc, painting a rainbow behind it, and dives
// in before the stage. Its splash rises into a shimmering curtain of falling water, a figure steps in behind it, and
// the curtain parts down the middle like a theatre's on the artist himself, in a shower of glitter. With the reveal the
// jets soar for the finale, rings run out over the lake from the stage, and Milotic rises out of the water beside him.
import { hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  mix,
  Particles,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, spriteKey, spriteSize } from '../../../sprites'
import { H, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { dGradient, dissolve, wobble } from '../kit'

const REVEAL = 4.5
/** Wallace's own Milotic, whatever team this Wallace has. */
const MILOTIC = spriteKey(350, false)
/**
 * Always drawn on the canvas: a fight may keep its lead's sprite live on the page (sprites.ts `drawWithLive`), and with
 * some team that lead is this Milotic; a look the page can't take keeps it here.
 */
const ON_CANVAS = { wave: { amp: 0 } } as const

const T_DROP = 0.32
const T_PLINK = 0.62
const T_SWIM = 1.85
const T_LEAP = 2.8
const T_TOP = T_LEAP + 0.44
const T_SPLASH = T_LEAP + 0.6
const T_UP = T_SPLASH + 0.22
const T_STEP = 3.62
const T_PART = 4.08

/** The lake's far shore under the crater's walls. */
const HZ = 74
/** The jets across the lake, near to far: their foot, height, width, when each leaps up and its note. */
const JETS = [
  { x: 18, y: 134, h: 70, w: 5, at: 0.95, note: 523 },
  { x: 48, y: 110, h: 54, w: 4, at: 1.1, note: 659 },
  { x: 76, y: 96, h: 40, w: 3, at: 1.25, note: 784 },
  { x: 101, y: 88, h: 30, w: 3, at: 1.4, note: 1047 },
  { x: 122, y: 83, h: 22, w: 2, at: 1.55, note: 1319 },
] as const
/** Milotic's leap: an arc about this centre, from the left to high over the stage, then its dive. */
const ARC = { x: 116, y: 122, r: 74, end: 0.6 }
/** The water curtain before the stage: its left edge, width, crest and foot. */
const CUR = { x: 128, w: 90, top: 14, base: 113 }
const CH = CUR.base - CUR.top
const RAINBOW = ['#e86a7a', '#f4a060', '#f8e070', '#8ad87a', '#6ab0f0', '#a07ad8'] as const
const GLITTER = ['#ffffff', '#c8f8ff', '#ffc8e8', '#fff0a0'] as const

/** The crater's rim against the sky: low far off in the middle, high at the sides where the wall is near. */
const rimY = (x: number) =>
  Math.round(38 - 24 * ((x - 120) / 120) ** 2 + Math.sin(x * 0.21) * 1.2 + Math.sin(x * 0.07 + 1) * 1.6)
/** How much of the dawn falls on the wall at x: the sun is low on the left, so the right wall faces it. */
const litAt = (x: number) => clamp((x - 50) / 160)

const ROCK = ['#45437a', '#5e5890', '#7a70a4', '#9a88b0', '#bc9eb4', '#dcb4b4', '#f2ccbc'] as const
const step = (cols: readonly string[], v: number, x: number, y: number) =>
  cols[clamp(Math.round(clamp(v) * (cols.length - 1) + bayer(x, y) - 0.5), 0, cols.length - 1)]!

/** The dawn sky over the crater: violet to coral to gold, the sun just over the rim, thin clouds lit from below. */
function sky(): Canvas {
  const cv = canvas(W, HZ)
  const g = cv.g
  g.drawImage(dGradient(W, 46, ['#2e2c6a', '#4e3c80', '#86508a', '#c46a86', '#ec907a', '#ffc08a']), 0, 0)
  rect(g, 0, 46, W, HZ - 46, '#ffc08a')
  const r = rng(3501)
  for (let i = 0; i < 18; i++) rect(g, r.int(0, W), r.int(0, 12), 1, 1, '#a8a0d8')
  // The sun rising over the rim on the left, a halo round it, a few faint rays.
  const sx = 54
  const sy = rimY(sx) - 3
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * (0.18 + k * 0.11)
    for (let d = 14; d < 70; d++) {
      const x = Math.round(sx + Math.cos(a) * d)
      const y = Math.round(sy + Math.sin(a) * d)
      if ((1 - d / 70) * 0.55 > bayer(x, y)) rect(g, x, y, 1, 1, '#ffd8a8')
    }
  }
  g.drawImage(glow(40, '#ffc89a', 1.2, 0.85), sx - 40, sy - 40)
  g.drawImage(glow(22, '#ffe8b8', 1.4, 0.9), sx - 22, sy - 22)
  ellipse(g, sx, sy, 10, 10, '#fff4d0')
  ellipse(g, sx, sy, 8, 8, '#ffffff')
  // Long thin clouds, their bellies gold.
  for (const [x, y, w] of [
    [150, 10, 46],
    [196, 16, 30],
    [104, 19, 22],
    [10, 8, 30],
  ] as const) {
    ellipse(g, x, y, w, 2, '#7a5a8e')
    ellipse(g, x + 3, y + 1, w - 4, 1, '#ffb88a')
    rect(g, x - w + 8, y + 2, w - 6, 1, '#ffd8a0')
  }
  return cv
}

/**
 * The crater's walls: pale rock, lavender in the shade on the left and rose-gold where the dawn finds it on the right,
 * three ledges running round it; the town's white houses with blue roofs crowd the lowest terraces by the water and
 * thin out higher up, stairs between them, a few windows already lit; shrubs on the ledges and the rim, a pink haze
 * over the water at their foot.
 */
function crater(r: Rng): Canvas {
  const LEDGES = [0.3, 0.58, 0.8] as const
  const ledgeAt = (x: number, d: number) => {
    const top = rimY(x)
    return Math.round(top + (HZ - top) * d + Math.sin(x * 0.3 + d * 9) * 0.8)
  }
  const cv = shade(W, HZ + 1, (x, y) => {
    const top = rimY(x)
    if (y < top) return null
    const lit = litAt(x)
    const depth = (y - top) / (HZ - top)
    for (const d of LEDGES) {
      const ly = ledgeAt(x, d)
      // Each ledge's lip catches the light, the face under it in its shadow.
      if (y === ly) return step(ROCK, 0.3 + lit * 0.7, x, y)
      if (y > ly && y <= ly + 2) return step(ROCK, lit * 0.35, x, y)
    }
    // The rock: patches and strata, brighter toward the rim, the dawn on the right.
    const n =
      Math.sin(x * 0.13 + y * 0.05) * Math.sin(y * 0.29 - x * 0.07) + Math.sin(x * 0.41 + y * 0.6) * 0.3
    return step(ROCK, lit * 0.68 + (1 - depth) * 0.16 + n * 0.1, x, y)
  })
  const g = cv.g
  // Shrubs on the ledges and the rim.
  for (let i = 0; i < 70; i++) {
    const x = r.int(0, W)
    const d = r() < 0.4 ? 0 : r.pick(LEDGES)
    const y = d ? ledgeAt(x, d) : rimY(x) + 1
    const sz = r.int(1, 2) + (Math.abs(x - 120) > 70 ? 1 : 0)
    ellipse(g, x, y - sz + 1, sz + 1, sz, '#2e5856')
    ellipse(g, x - 1, y - sz, sz, Math.max(1, sz - 1), litAt(x) > 0.5 ? '#6a9a6a' : '#3e6a62')
  }
  // The town: crowded by the water, thinning out up the walls; bigger at the sides where the wall is near.
  const rows = [
    [LEDGES[0], 0.16],
    [LEDGES[1], 0.45],
    [LEDGES[2], 0.85],
  ] as const
  for (const [d, dens] of rows)
    for (let x = 2; x < W - 4;) {
      const near = 0.6 + (0.6 * Math.abs(x - 120)) / 120
      const w = Math.max(3, Math.round(r.range(4, 7) * near))
      const h = Math.max(3, Math.round(r.range(3, 5) * near))
      if (r() < dens) house(g, x, ledgeAt(x + (w >> 1), d), w, h, litAt(x), r)
      x += w + Math.round(r.range(1, 4) * near) + (r() < 0.2 ? 8 : 0)
    }
  // Stairs climbing from ledge to ledge.
  for (let i = 0; i < 7; i++) {
    const x = r.int(10, W - 20)
    const k = r.int(0, 1)
    const y0 = ledgeAt(x, LEDGES[k]!)
    const y1 = ledgeAt(x, LEDGES[k + 1]!)
    const dir = r() < 0.5 ? -1 : 1
    for (let y = y0 + 3; y < y1; y++) {
      const xx = x + dir * (y - y0)
      rect(g, xx, y, 2, 1, step(ROCK, 0.4 + litAt(xx) * 0.6, xx, y))
    }
  }
  // A pink haze over the far water, thickening down to it.
  for (let y = HZ - 9; y <= HZ; y++)
    for (let x = 0; x < W; x++) if ((y - HZ + 9) / 11 > bayer(x, y) + 0.1) rect(g, x, y, 1, 1, '#e4b4c4')
  return cv
}

/** One of Sootopolis's white houses on a ledge (its foot at y): a flat blue roof, a door, a window lit or not. */
function house(g: G, x: number, y: number, w: number, h: number, lit: number, r: Rng) {
  const face = lit > 0.5 ? '#fff6f0' : lit > 0.2 ? '#e0d6e6' : '#b4acd0'
  const side = lit > 0.5 ? '#d8c4cc' : '#8a84b4'
  rect(g, x, y - h, w, h, face)
  rect(g, x + w - 1, y - h, 1, h, side)
  rect(g, x - 1, y - h - 1, w + 2, 1, lit > 0.4 ? '#5aa0d8' : '#4a7ab8')
  rect(g, x + 1, y - Math.max(1, h - 2), 1, Math.max(1, h - 2), '#3a6a9a')
  if (w > 4) rect(g, x + w - 3, y - h + 1, 1, 1, r() < 0.4 ? '#ffd27a' : '#4a7ab0')
}

/** The Gym on its island in the lake: a white hall under a teal dome, trees round it. */
function gym(g: G) {
  const x = 96
  const y = HZ + 2
  ellipse(g, x, y + 1, 18, 3, '#3a6a5e')
  ellipse(g, x, y, 17, 2, '#5a8a6a')
  for (const tx of [x - 14, x + 13]) {
    ellipse(g, tx, y - 4, 3, 4, '#2e5a50')
    ellipse(g, tx - 1, y - 5, 2, 3, '#5a8a6a')
  }
  rect(g, x - 10, y - 7, 20, 7, '#f0e8f0')
  rect(g, x + 7, y - 7, 3, 7, '#c0b4cc')
  rect(g, x - 10, y - 7, 20, 1, '#ffffff')
  for (let k = 0; k < 4; k++) rect(g, x - 7 + k * 4, y - 5, 2, 3, '#3a7aa8')
  ellipse(g, x, y - 9, 7, 3, '#3aa0a8')
  ellipse(g, x - 2, y - 10, 3, 1, '#8ae0d8')
  rect(g, x, y - 14, 1, 3, '#f0e8f0')
}

/** A Wingull far off: a white body, its wings beating up and down, their tips blue. */
function gull(g: G, x: number, y: number, t: number) {
  const up = Math.floor(t * 6) % 2 === 0
  rect(g, x - 1, y, 3, 1, '#ffffff')
  rect(g, x - 2, y + (up ? -1 : 1), 1, 1, '#ffffff')
  rect(g, x + 2, y + (up ? -1 : 1), 1, 1, '#ffffff')
  rect(g, x - 3, y + (up ? -2 : 1), 1, 1, '#5a7ab8')
  rect(g, x + 3, y + (up ? -2 : 1), 1, 1, '#5a7ab8')
  rect(g, x - 2, y, 1, 1, '#ffe08a')
}

/** The lake: the sky's colours near the far shore, deep blue near, the walls and the Gym mirrored in it. */
function lake(walls: Canvas): { water: Canvas; mirror: Canvas } {
  const water = dGradient(W, H - HZ, ['#f0b8a8', '#b0a0c0', '#6a9cc4', '#3474a4', '#1c5486', '#123c6a'])
  // The mirror image, cooled by the water, thinning out toward us.
  const src = walls.g.getImageData(0, 0, W, HZ + 1).data
  const mirror = shade(W, H - HZ, (x, y) => {
    const sy = HZ - y
    if (sy < 0 || (y / 34) ** 1.2 > bayer(x, y) + 0.1) return null
    const i = (sy * W + x) * 4
    if (src[i + 3]! < 128) return null
    const c = '#' + [src[i]!, src[i + 1]!, src[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')
    return mix(c, '#5a86b0', 0.55)
  })
  return { water, mirror }
}

/** Wallace's stage: a round white marble dais out over the water, two tiers of steps down into it, a ring of blue tiles. */
function stage(g: G, F: { x: number; y: number }) {
  const tiers = [
    [48, 10, 12, '#5a7aa0', '#8aa4c4'],
    [45, 10, 8, '#a8a4c8', '#d8d0e4'],
    [42, 9, 4, '#c8c0d8', '#f0e8f0'],
  ] as const
  for (const [rx, ry, dy, front, top] of tiers) {
    ellipse(g, F.x, F.y + dy + 2, rx, ry, front)
    ellipse(g, F.x, F.y + dy, rx, ry, top)
  }
  // Its top: lit rose from the left, a ring of blue tiles, a wave in the middle.
  ellipse(g, F.x, F.y + 1, 40, 8, '#f8f0f2')
  for (let y = -8; y <= 8; y++)
    for (let x = -40; x <= -8; x++)
      if ((x * x) / 1600 + (y * y) / 64 <= 1 && (-x - 8) / 32 > bayer(x, y) + 0.3)
        rect(g, F.x + x, F.y + 1 + y, 1, 1, '#ffe4dc')
  ellipseLine(g, F.x, F.y + 1, 33, 6, '#5ab0e0')
  ellipseLine(g, F.x, F.y + 1, 31, 6, '#3a88c0')
  ellipseLine(g, F.x, F.y + 1, 20, 4, '#8ad0f0')
  ellipseLine(g, F.x, F.y + 1, 40, 8, '#ffffff', Math.PI, Math.PI * 2)
  // Its white mirrored in the water under it, breaking up.
  for (let y = F.y + 23; y < F.y + 34; y++)
    for (let x = -44; x <= 44; x++)
      if (
        (x * x) / 1936 + ((y - F.y - 23) * (y - F.y - 23)) / 121 <= 1 &&
        ((F.y + 34 - y) / 14) * 0.6 > bayer(x, y)
      )
        rect(g, F.x + x, y, 1, 1, '#8eb2d4')
}

/** Lily pads floating near us, a pink flower on two: what's near gives the lake its depth. */
function lilies(g: G) {
  for (const [x, y, r, flower] of [
    [24, 136, 8, true],
    [44, 141, 6, false],
    [12, 146, 5, false],
    [228, 138, 7, true],
  ] as const) {
    ellipse(g, x, y + 1, r, Math.round(r * 0.35), '#123a4a')
    ellipse(g, x, y, r, Math.round(r * 0.35), '#3a8a5a')
    ellipse(g, x - 1, y - 1, r - 2, Math.max(1, Math.round(r * 0.2)), '#5aaa6a')
    rect(g, x + 1, y - 1, Math.round(r * 0.6), 1, '#123a4a')
    if (flower) {
      rect(g, x - 2, y - 3, 5, 2, '#f08ab8')
      rect(g, x - 1, y - 5, 3, 2, '#ffc8e0')
      rect(g, x, y - 6, 1, 1, '#ffffff')
      rect(g, x, y - 3, 1, 1, '#ffe08a')
    }
  }
}

type X = {
  buf: Canvas
  sky: Canvas
  walls: Canvas
  water: Canvas
  mirror: Canvas
  stage: Canvas
  bow: Canvas
  bowBuf: Canvas
  curtain: Canvas
  sil: Canvas
  glints: [number, number, number][]
  spray: Particles
}
type S = ChampionState<X>

/** The rainbow Milotic paints: six bands round ARC's centre, soft at their edges. */
function rainbow(): Canvas {
  return shade(W, ARC.y, (x, y) => {
    const d = Math.hypot(x - ARC.x, y - ARC.y)
    const b = (ARC.r + 6 - d) / 2
    if (b < 0 || b >= 6) return null
    // Thinner at its outer and inner edges, the dither keeping the sky through it.
    const edge = Math.min(b, 6 - b)
    return edge * 0.5 + 0.35 > bayer(x, y) ? RAINBOW[Math.floor(b)]! : null
  })
}

/**
 * The curtain's water, two tiles tall so it can fall forever: strands of falling water a pixel or two wide, light
 * running down each, gaps between them where what stands behind shows through; thinner toward its sides.
 */
function curtainTex(r: Rng): Canvas {
  const strand: { on: boolean; ph: number; sp: number }[] = []
  for (let x = 0; x < CUR.w;) {
    const w = r.int(1, 2)
    const u = Math.abs(x - CUR.w / 2) / (CUR.w / 2)
    const on = r() < 0.72 - 0.35 * u ** 3
    const ph = r.range(0, 60)
    const sp = r.range(22, 46)
    for (let k = 0; k < w && x < CUR.w; k++, x++) strand.push({ on, ph, sp })
  }
  return shade(CUR.w, CH * 2, (x, y) => {
    const st = strand[x]!
    // Between the strands only a fine spray.
    // Between the strands a thin sheet, and a fine spray.
    if (!st.on) return bayer(x, y) < 0.25 ? (bayer(x + 1, y + 2) < 0.3 ? '#e8faff' : '#8ad0f0') : null
    const f = (((y % CH) + st.ph) / st.sp) % 1
    return f < 0.06 ? '#ffffff' : f < 0.3 ? '#c8f0ff' : f < 0.85 ? '#96d8f4' : '#5ab0e0'
  })
}

/** Where Milotic is in its leap (its feet), and whether it is still over the arc. */
function leapAt(t: number) {
  const q = span(t, T_LEAP, T_TOP)
  if (t < T_TOP) {
    const a = lerp(Math.PI, ARC.end, ease.ioS(q))
    return { x: ARC.x + Math.cos(a) * ARC.r, y: ARC.y - Math.sin(a) * ARC.r * 0.98, arc: true }
  }
  // The dive: straight down into the water before the stage.
  const d = ease.inQ(span(t, T_TOP, T_SPLASH))
  const x0 = ARC.x + Math.cos(ARC.end) * ARC.r
  const y0 = ARC.y - Math.sin(ARC.end) * ARC.r * 0.98
  return { x: lerp(x0, 176, d), y: lerp(y0, CUR.base + 6, d), arc: false }
}

/** Milotic circling under the clear water before it leaps: round the lake's middle, nearer us at the front. */
function swimAt(t: number) {
  const a = lerp(Math.PI * 1.5, Math.PI * 3, span(t, T_SWIM, T_LEAP))
  return {
    x: 92 + Math.cos(a) * 46,
    y: 122 + Math.sin(a) * 9,
    right: Math.sin(a) < 0,
    k: 0.52 + 0.1 * Math.sin(a),
  }
}

/** A jet's height now: leaping up on its note, dancing, sinking as Milotic leaps, soaring in the finale. */
function jetH(j: (typeof JETS)[number], i: number, t: number) {
  const up = ease.outBack(span(t, j.at, j.at + 0.32), 1.6)
  const dance = 0.82 + 0.18 * Math.sin((t - j.at) * 6 - i * 0.9)
  const down = 1 - ease.inQ(span(t, T_LEAP - 0.15, T_LEAP + 0.25))
  const finale = 1.25 * ease.outBack(span(t, REVEAL - 0.05, REVEAL + 0.35), 1.4)
  return Math.round(j.h * Math.max(up * dance * down, finale * dance))
}

/** A jet of water: a column with a bright core, the dawn on its left, a crown of spray, foam at its foot. */
function jet(g: G, x: number, y: number, h: number, w: number, t: number) {
  if (h < 1) return
  const half = w >> 1
  rect(g, x - half, y - h, w, h, '#4aa0d4')
  if (w > 2) rect(g, x - half + 1, y - h, w - 2, h, '#a8e4f8')
  for (let k = 0; k < h; k++) {
    if ((k + Math.floor(t * 70)) % 7 < 2) rect(g, x, y - k, 1, 1, '#ffffff')
    if (k > h * 0.4) rect(g, x - half, y - k, 1, 1, '#ffe4d4')
  }
  // A mist round it, and the water falling back from its crown in an umbrella of strands.
  for (let k = 0; k < h; k++)
    for (const sd of [-1, 1])
      if (bayer(x + sd * (half + 1), y - k) < 0.4) rect(g, x + sd * (half + 1), y - k, 1, 1, '#8ad0f0')
  for (const sd of [-1, 1])
    for (const sp of [0.5, 0.9, 1.3]) {
      for (let i = 1; i < 14; i++) {
        const px = x + sd * sp * i * (0.5 + w * 0.18)
        const py = y - h + (i * i * 0.5 * 4) / (2 + w) - i * 0.3
        if (py > y - h * 0.35) break
        if (bayer(Math.round(px), Math.round(py)) < 0.75 - i * 0.04)
          rect(g, Math.round(px), Math.round(py), 1, 1, i < 4 ? '#ffffff' : '#c8f0ff')
      }
    }
  ellipse(g, x, y - h, half + 1, 1, '#ffffff')
  ellipseLine(g, x, y, w + 3, 1, '#e8faff')
}

export const wallaceChampion = championCinema<X>({
  id: 'wallace',
  shake: true,
  reveal: REVEAL,
  seed: 350,
  aura: ['#ffffff', '#b8f4ff', '#3aa8d8', '#123a66'],
  flash: '#e8fbff',
  sample: {
    trainer: '/trainers/classes/hoenn/champion-wallace.png',
    name: 'Champion Wallace',
    lead: 340,
    ace: 350,
    team: 3,
  },
  extras: [350],
  setup(st, r) {
    const F = st.L.foe
    const walls = crater(rng(3502))
    gym(walls.g)
    const { water, mirror } = lake(walls)
    const stg = canvas(W, H)
    stage(stg.g, F)
    lilies(stg.g)
    // The sun's road on the water and glints scattered over the lake.
    const glints: [number, number, number][] = []
    for (let i = 0; i < 70; i++) {
      const y = r.range(HZ + 2, H - 4)
      const spread = 4 + (y - HZ) * 0.5
      glints.push([54 + r.range(-spread, spread), y, r()])
    }
    for (let i = 0; i < 40; i++) glints.push([r.range(0, W), r.range(HZ + 4, H - 2), r()])
    st.screenShakes.push([T_SPLASH, 0.3, 1])
    return {
      buf: canvas(W, H),
      sky: sky(),
      walls,
      water,
      mirror,
      stage: stg,
      bow: rainbow(),
      bowBuf: canvas(W, ARC.y),
      curtain: curtainTex(rng(3503)),
      sil: canvas(W, H),
      glints,
      spray: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.spray.update(dt)
    // Each jet's crown sheds spray that falls back sparkling.
    JETS.forEach((j, i) => {
      const h = jetH(j, i, t)
      if (h > 4 && r() < 0.5 * (j.w / 5) + 0.15)
        s.spray.add({
          x: j.x + r.range(-1, 1),
          y: j.y - h,
          vx: r.range(-22, 22) * (j.w / 4),
          vy: -r.range(10, 40) * (j.w / 4),
          ay: 160 * (j.w / 4),
          life: r.range(0.4, 0.8),
          size: 1,
          shape: r() < 0.15 ? 'star' : 'drop',
          colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
        })
      // Its leap up: a burst at the foot.
      if (within(t, j.at, j.at + dt * 1.5))
        for (let k = 0; k < 10; k++)
          s.spray.add({
            x: j.x,
            y: j.y,
            vx: r.range(-30, 30) * (j.w / 4),
            vy: -r.range(20, 70) * (j.w / 4),
            ay: 220,
            life: 0.5,
            size: 1,
            shape: 'drop',
            colors: ['#ffffff', '#a8e4f8'],
          })
    })
    // The finale's glitter showering over the lake.
    if (t > REVEAL && t < REVEAL + 1.6 && r() < 0.6)
      s.fx.add({
        x: r.range(0, W),
        y: -2,
        vx: r.range(-6, 6),
        vy: r.range(20, 40),
        life: 2.4,
        size: r.int(1, 2),
        shape: 'star',
        colors: [r.pick(GLITTER), '#ffffff'],
      })
    // Milotic under the water: the surface rings where its head passes.
    if (t > T_SWIM && t < T_LEAP && r() < 0.35) {
      const m = swimAt(t)
      s.spray.add({
        x: m.x + (m.right ? 12 : -12) * m.k,
        y: m.y - 2,
        life: 0.7,
        size: 2,
        size1: 9,
        shape: 'oval',
        squash: 0.25,
        colors: ['#c8f0ff', '#8ad0f0', '#5aa8d8'],
      })
    }
    // Its leap: water streaming off it, glitter in its wake.
    if (t > T_LEAP && t < T_SPLASH) {
      const p = leapAt(t)
      const z = spriteSize(MILOTIC)
      for (let k = 0; k < 2; k++)
        s.spray.add({
          x: p.x + r.range(-z.w * 0.25, z.w * 0.25),
          y: p.y - r.range(0, z.h * 0.6),
          vx: r.range(-20, 20),
          vy: r.range(-10, 20),
          ay: 200,
          life: r.range(0.5, 0.9),
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#a8e4f8', '#5ab0e0'],
        })
      if (r() < 0.7)
        s.fx.add({
          x: p.x + r.range(-10, 10),
          y: p.y - r.range(4, 30),
          vx: r.range(-10, 10),
          vy: r.range(-4, 10),
          life: r.range(0.6, 1),
          size: r.int(1, 2),
          shape: 'star',
          colors: [r.pick(GLITTER), '#ffffff'],
        })
    }
    // It breaks the surface: a burst of water where it leaves the lake.
    if (within(t, T_LEAP, T_LEAP + dt * 1.5))
      for (let k = 0; k < 30; k++)
        s.spray.add({
          x: ARC.x - ARC.r + r.range(-6, 6),
          y: ARC.y,
          vx: r.range(-40, 50),
          vy: -r.range(40, 140),
          ay: 260,
          life: r.range(0.5, 0.9),
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#a8e4f8', '#5ab0e0'],
        })
    // The dive before the stage: a crown of water flung high and wide.
    if (within(t, T_SPLASH, T_SPLASH + dt * 1.5))
      for (let k = 0; k < 60; k++)
        s.fx.add({
          x: 176 + r.range(-20, 20),
          y: CUR.base,
          vx: r.range(-110, 110),
          vy: -r.range(60, 220),
          ay: 300,
          life: r.range(0.6, 1.1),
          size: r.int(1, 2),
          shape: 'drop',
          colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
        })
    // The curtain's crest throwing off spray, and its foot foaming.
    const up = span(t, T_SPLASH, T_UP)
    if (up > 0 && t < T_PART + 0.2) {
      const top = lerp(CUR.base, CUR.top, ease.outC(up))
      for (let k = 0; k < 3; k++)
        s.fx.add({
          x: CUR.x + r.range(4, CUR.w - 4),
          y: top + r.range(-1, 2),
          vx: r.range(-16, 16),
          vy: -r.range(10, 40),
          ay: 140,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: r() < 0.2 ? 'star' : 'px',
          colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
        })
    }
    // The curtain parts: water and glitter flung out from the seam.
    if (within(t, T_PART, T_PART + dt * 1.5)) {
      for (let k = 0; k < 50; k++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: CUR.x + CUR.w / 2 + sd * r.range(0, 8),
          y: r.range(CUR.top, CUR.base),
          vx: sd * r.range(60, 180),
          vy: -r.range(0, 80),
          ay: 220,
          drag: 0.6,
          life: r.range(0.6, 1),
          size: 1,
          shape: 'drop',
          colors: ['#ffffff', '#c8f0ff', '#8ad0f0'],
        })
      }
      for (let k = 0; k < 40; k++)
        s.fx.add({
          x: CUR.x + CUR.w / 2 + r.range(-6, 6),
          y: r.range(CUR.top + 10, CUR.base - 10),
          vx: r.range(-90, 90),
          vy: r.range(-60, 30),
          drag: 2,
          life: r.range(0.8, 1.3),
          size: r.int(1, 2),
          shape: 'star',
          colors: [r.pick(GLITTER), '#ffffff'],
        })
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    b.drawImage(s.sky, 0, 0)
    // Two Wingull gliding over the crater in the calm before the show.
    for (let i = 0; i < 2; i++) {
      const q = span(t, 0.1 + i * 0.25, 2.6 + i * 0.2)
      if (q <= 0 || q >= 1) continue
      gull(
        b,
        Math.round(lerp(W + 8, -10, q) + i * 14),
        Math.round(20 - 6 * q + i * 6 + Math.sin(t * 3 + i) * 1.5),
        t + i * 0.3,
      )
    }
    b.drawImage(s.walls, 0, 0)
    // The lake, the walls mirrored in it, rippling a little.
    b.drawImage(s.water, 0, HZ)
    wobble(b, s.mirror, W, 0, H - HZ, t, 1, 5, 3, HZ)
    // Milotic's water: the lake clears and brightens where it swims.
    const clear = span(t, T_SWIM - 0.3, T_SWIM + 0.2) * (1 - span(t, T_LEAP, T_LEAP + 0.4))
    if (clear > 0) {
      const m = swimAt(t)
      b.drawImage(
        glow(40, '#4ab0d0', 1.1, Math.round(clear * 6) / 8),
        Math.round(m.x) - 40,
        Math.round(m.y) - 40,
      )
    }
    // The sun's road and the glints: each winks on and off on its own beat.
    for (const [x, y, ph] of s.glints) {
      const on = Math.sin(t * 5 + ph * 30) > 0.55
      if (!on) continue
      const w = y < HZ + 20 ? 2 : 3
      rect(b, Math.round(x), Math.round(y), w, 1, x > 30 && x < 80 ? '#fff0c0' : '#e8f8ff')
    }
    // The drop that starts it all: falling, then the rings spreading from where it struck.
    if (t > T_DROP && t < T_PLINK) {
      const y = lerp(-4, 116, ease.inQ(span(t, T_DROP, T_PLINK)))
      rect(b, 100, Math.round(y) - 2, 1, 3, '#e8faff')
      rect(b, 100, Math.round(y), 1, 1, '#ffffff')
    }
    for (let i = 0; i < 3; i++) {
      const q = span(t, T_PLINK + i * 0.18, T_PLINK + i * 0.18 + 1.1)
      if (q <= 0 || q >= 1) continue
      ellipseLine(
        b,
        100,
        116,
        Math.round(4 + 50 * ease.outQ(q)),
        Math.round(1 + 8 * ease.outQ(q)),
        q < 0.6 ? '#e8faff' : '#8ad0f0',
      )
    }
    // Milotic's shape circling under the surface.
    if (t > T_SWIM && t < T_LEAP + 0.05) {
      const m = swimAt(t)
      const z = spriteSize(MILOTIC)
      drawSprite(b, MILOTIC, Math.round(m.x), Math.round(m.y + (z.h * m.k * 0.5) / 2), {
        sx: m.k,
        sy: m.k * 0.5,
        tint: { color: '#1e6a8c', a: 0.625 },
        flip: m.right,
        wave: { amp: 1, len: 4, phase: t * 30 },
      })
    }
    // The rainbow behind Milotic as it leaps, lingering in the mist over the lake.
    const bowK = span(t, T_LEAP, T_LEAP + 0.05) * (1 - 0.45 * span(t, T_SPLASH, T_UP + 0.4))
    if (bowK > 0) {
      const p = leapAt(Math.min(t, T_TOP))
      const reach = Math.round(t < T_TOP ? p.x : W)
      if (reach > 0) {
        // As far as Milotic has got; its foot on the right stays behind the stage.
        const c = s.bowBuf.g
        const h = Math.min(s.bow.height, CUR.base - 2)
        c.clearRect(0, 0, W, s.bow.height)
        c.drawImage(s.bow, 0, 0, reach, h, 0, 0, reach, h)
        dissolve(b, s.bowBuf, bowK)
      }
    }
    // The jets, far to near, and the spray they throw.
    for (let i = JETS.length - 1; i >= 0; i--) {
      const j = JETS[i]!
      jet(b, j.x, j.y, jetH(j, i, t), j.w, t)
    }
    s.spray.draw(b)
    b.drawImage(s.stage, 0, 0)
    // Milotic in the air, flipped to fly right; its colours under the dawn.
    if (t >= T_LEAP && t < T_SPLASH) {
      const p = leapAt(t)
      const stretch = p.arc ? 1 : 1.12
      drawSprite(b, MILOTIC, Math.round(p.x), Math.round(p.y), {
        ...ON_CANVAS,
        sx: 0.8 / stretch,
        sy: 0.8 * stretch,
        flip: p.arc,
        outline: Math.floor(t * 12) % 2 ? '#ffffff' : '#c8f8ff',
      })
    }
    // The reveal rings out over the lake from the stage.
    for (let i = 0; i < 2; i++) {
      const q = span(t, REVEAL + i * 0.16, REVEAL + i * 0.16 + 0.9)
      if (q > 0 && q < 1)
        ellipseLine(
          b,
          s.L.foe.x,
          CUR.base,
          Math.round(46 + 90 * ease.outQ(q)),
          Math.round(9 + 20 * ease.outQ(q)),
          q < 0.5 ? '#ffffff' : '#a8e4f8',
        )
    }
    // After the reveal it rises beside its master, the water streaming off it.
    const rise = ease.outBack(span(t, REVEAL, REVEAL + 0.45), 1.4)
    if (rise > 0) {
      const z = spriteSize(MILOTIC)
      const c = s.sil.g
      c.clearRect(0, 0, W, H)
      const wl = 116
      drawSprite(c, MILOTIC, 104, Math.round(wl + z.h * 0.72 * (1 - rise) + 4), {
        ...ON_CANVAS,
        sx: 0.72,
        sy: 0.72,
      })
      b.drawImage(s.sil, 0, 0, W, wl, 0, 0, W, wl)
      ellipseLine(b, 104, wl, 22, 3, '#e8faff')
    }
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    if (t < T_STEP) return
    const F = s.L.foe
    // He steps in behind the curtain from the right, a shape through the falling water; once it parts, the man.
    const q = ease.outQ(span(t, T_STEP, T_STEP + 0.4))
    const x = Math.round(lerp(F.x + 24, F.x, q))
    if (t < T_PART) {
      const c = s.sil.g
      c.clearRect(0, 0, W, H)
      drawSprite(c, s.p.trainer, x, F.y + 2, { sil: '#2a5a86', wave: { amp: 1, len: 6, phase: t * 24 } })
      dissolve(g, s.sil, q)
      return
    }
    const lit = span(t, T_PART, REVEAL - 0.02)
    drawSprite(g, s.p.trainer, x, F.y + 2, {
      tint: { color: '#1e4a74', a: Math.round(8 * (0.6 - 0.45 * lit)) / 8 },
      outline: Math.floor(t * 14) % 2 ? '#ffffff' : '#b8f4ff',
    })
  },
  front(g, s, t) {
    drawCurtain(g, s, t)
    // His shape seen through the falling water (the curtain hides most of the one behind it): a thin dither of it.
    if (t >= T_STEP && t < T_PART) dissolve(g, s.sil, 0.4 * ease.outQ(span(t, T_STEP, T_STEP + 0.4)))
  },
  sounds: [
    [0.05, () => hiss(1.2, { freq: 900, type: 'lowpass', vol: 0.025 })],
    [
      T_PLINK,
      () => (
        tone(1568, 0.35, { type: 'triangle', vol: 0.05 }),
        tone(2093, 0.5, { type: 'sine', vol: 0.02, at: 0.04 })
      ),
    ],
    ...JETS.map(
      (j) =>
        [
          j.at,
          () => (
            tone(j.note, 0.4, { type: 'triangle', vol: 0.05 }),
            hiss(0.35, { freq: 1600, slide: 1200, vol: 0.03 })
          ),
        ] as const,
    ),
    [T_SWIM, () => tone(392, 0.9, { type: 'sine', vol: 0.03, slide: 120 })],
    [
      T_LEAP,
      () => (
        hiss(0.5, { freq: 1400, slide: -800, vol: 0.06 }),
        [784, 988, 1175, 1319, 1568, 1976, 2349].forEach((f, i) =>
          tone(f, 0.25, { type: 'triangle', vol: 0.03, at: i * 0.06 }),
        )
      ),
    ],
    [
      T_SPLASH,
      () => (
        hiss(0.7, { freq: 700, type: 'lowpass', vol: 0.12 }),
        tone(98, 0.4, { type: 'sine', vol: 0.08, slide: -30 })
      ),
    ],
    [T_SPLASH + 0.1, () => hiss(1.1, { freq: 3200, q: 0.5, vol: 0.035 })],
    [
      T_PART,
      () =>
        [2349, 1976, 1568, 1319, 1175, 988].forEach((f, i) =>
          tone(f, 0.3, { type: 'triangle', vol: 0.03, at: i * 0.04 }),
        ),
    ],
    [
      REVEAL,
      () => (
        [523, 659, 784, 1047].forEach((f) => tone(f, 0.9, { type: 'triangle', vol: 0.04 })),
        hiss(0.8, { freq: 2600, vol: 0.04 })
      ),
    ],
  ],
})

/**
 * The water curtain before the stage: it rises from the splash to its crest, falls and falls, its light running down
 * it; then it parts down the middle, each half drawn aside and collapsing into spray.
 */
function drawCurtain(g: G, s: S, t: number) {
  const up = ease.outC(span(t, T_SPLASH, T_UP))
  if (up <= 0) return
  const part = ease.inQ(span(t, T_PART, T_PART + 0.34))
  if (part >= 1) return
  const top = lerp(CUR.base, CUR.top, up) + (CUR.base - CUR.top) * part ** 1.6
  const off = Math.floor(t * 120) % CH
  const half = CUR.w / 2
  // Each half squeezes toward its side as it is drawn aside.
  const w = Math.max(1, Math.round(half * (1 - 0.65 * part)))
  const slide = Math.round(36 * part)
  for (const [x0, src] of [
    [CUR.x - slide, 0],
    [CUR.x + CUR.w - w + slide, half],
  ] as const)
    for (let i = 0; i < w; i++) {
      const sx = src + Math.floor((i * half) / w)
      // Its crest arches: highest in the middle, falling away to its sides; it ripples as it pours.
      const u = (sx - half) / half
      const ct = Math.round(top + 9 * u * u * up + Math.sin(sx * 0.9 + t * 20) * 1.2)
      const h = CUR.base - ct
      if (h < 1) continue
      // The water falls through the frame: the rows it shows move down with the clock, whatever its crest does.
      const sy = ct - CUR.top + CH - off
      g.drawImage(s.curtain, sx, Math.max(0, sy), 1, Math.min(h, CH * 2 - sy), x0 + i, ct, 1, h)
      rect(g, x0 + i, ct, 1, 1, '#ffffff')
      if ((sx + Math.floor(t * 20)) % 3 === 0) rect(g, x0 + i, ct - 1, 1, 1, '#e8faff')
    }
  // Its foot foaming on the lake.
  ellipse(g, CUR.x - slide + w / 2, CUR.base, Math.round(w / 2) + 2, 2, '#e8faff')
  ellipse(g, CUR.x + CUR.w - w / 2 + slide, CUR.base, Math.round(w / 2) + 2, 2, '#e8faff')
}
