// The Gift card's present (docs/64 §4.0, §4.2) on the battle's stage, drawn with the game's pixel FX: no background of
// its own (the area's picture shows through the canvas, as Trick or Treat's), the present standing at the stage's
// centre. Every take holds its last frame (`hold`), the present breathing (a pixel of squash) unless `still`, so one
// canvas always shows it.
//
// The present is a box seen from a little above: a lit top face in perspective, the lid's front band, the body's front
// in dithered light (lit top left, turning dark at its right edge and its foot, the lid's shadow under it), a ribbon
// with its light and shadow edges, a bow of two loops, a knot and two tails, an ink outline so it reads on snow as on a
// night sky, and a dithered contact shadow. Every size change is drawn at its own size in whole pixels (squash,
// stretch, growth): the art is never scaled, so no pixel is ever resampled. A shine sweeps across it now and then.
//
// - Appear: it drops in stretched, lands with a squash, a little rebound, and a puff of snow either side.
// - Grow (MAKE IT BIGGER, it holds): a crouch, two wobbles (it leans, row by row), a deeper crouch, it springs up, two
//   white silhouette frames growing (half way, then past the new size), then it settles in steps on the new size, a
//   gold ring, twinkles and a shine; the `grown` beat says when.
// - Break (it didn't hold): it strains, bulging wide then tall, harder each beat and shaking, the paper rips three
//   times (shreds fly at each, light leaks through the tears), a 4-frame hit-stop on its fullest bulge, then it bursts:
//   a starburst, paper shreds that flutter down and lie on the snow, curling ribbons, the bow tossed aside, a puff; the
//   wild Pokémon leaps out on an arc and lands with a squash, two white frames and a puff (`broke`, then `out`).
// - Burst (a boss's present, the last tap): the same, longer and bigger, in silver and gold with confetti, and a
//   shiny's two rings of stars.
// - Open: it shivers, the bow springs off and lands beside it, the lid jumps with light leaking under it, then pops off,
//   turns over in the air and lands on the other side; light pours up out of the box, confetti and ribbons fly, and
//   what was inside rises out of it one by one (an item as its picture, Pokédollars as coins), then `opened`.
//
// Particles all live and die: shreds and confetti flutter down, lie a moment and fade out through the dither; the
// ribbons curl and shorten away. Short motion: each take shortened (no wobbles before a grow, a short strain before a
// break). Animations off: the stage jumps to the end with every cue fired (StageCanvas). Calm: no flash, no shake, no
// breathing, no shine.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  lerp,
  pattern,
  line,
  mix,
  Particles,
  rect,
  rng,
  shade,
  softEllipse,
  span,
  text,
  textWidth,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { drawSprite, spriteFrame } from '../sprites'
import { screenFlash, screenShake, STEP, within, type Cue, type Timeline } from '../timeline'
import { burstRing, tri } from './cinema/kit'

/** Where the present stands on the 240 × 160 stage: its middle, and the ground under it. */
export const PRESENT_AT = { x: 120, y: 124 }

export type PresentLook = 'red' | 'silver'

/** One thing that comes out of an opened present: an item picture's key (`item|<url>`), or Pokédollars. */
export interface PresentContent {
  key: string
  kind: 'item' | 'gold'
}

export interface PresentParams {
  mode: 'appear' | 'idle' | 'grow' | 'break' | 'burst' | 'open'
  /** The level it is at (before a grow). */
  level: number
  /** A grow's new level. */
  to?: number
  look?: PresentLook
  /** Break / burst: the Pokémon that comes out (its sprite key, loaded), and whether it is shiny. */
  mon?: string
  shiny?: boolean
  /** Open: what rises out. */
  contents?: PresentContent[]
  short?: boolean
  /** No breathing at rest, no flash, no shine (calm). */
  still?: boolean
}

const INK = '#24304f'
const GOLD = '#ffbe2e'
const GOLD_L = '#ffe7a8'
const GOLD_D = '#e08e00'
const GOLD_DD = '#9c5410'
/** The light from inside an opened present, or through its tears. */
const GLOW = '#fff6d8'
const GOLDS = [GOLD_L, GOLD, GOLD_D, GOLD_DD] as const

interface Look {
  /** The top face, lightest to darkest. */
  top: readonly string[]
  /** The front faces, lit to shadow. */
  front: readonly string[]
  /** The paper's dots, by the light they sit in. */
  dots: readonly string[]
  /** The paper's white back (a shred turning over, a tear's curled edge) and the dark inside the box. */
  back: string
  inner: string
  /** The shine's colours: its core and its edge. */
  shine: readonly [string, string]
  scraps: readonly string[]
}
const PAL: Record<PresentLook, Look> = {
  red: {
    top: ['#ffb3bc', '#ff8593', '#ec4a5e', '#c12a45'],
    front: ['#f45a6c', '#d92b44', '#a01d3c', '#651334'],
    dots: ['#ffffff', '#ffd6dc', '#f2808e', '#c8475d'],
    back: '#fff1e6',
    inner: '#3d0f24',
    shine: ['#ffffff', '#ffc9d0'],
    scraps: ['#d92b44', '#f45a6c', '#a01d3c', GOLD, '#d92b44'],
  },
  // Delibird's present (docs/64 §4.2): silver paper and a gold bow, a shine sweeping across it more often.
  silver: {
    top: ['#ffffff', '#eef3fa', '#cdd7e5', '#a6b2c6'],
    front: ['#e3eaf4', '#bcc8d9', '#8794ad', '#56627e'],
    dots: ['#ffffff', '#ffffff', '#dde5f0', '#a9b5c8'],
    back: '#ffffff',
    inner: '#262c40',
    shine: ['#ffffff', '#fff6d8'],
    scraps: ['#bcc8d9', '#8794ad', '#e3eaf4', GOLD, GOLD_D],
  },
}
const CONFETTI = ['#e2364a', '#ffbe2e', '#3f7be0', '#2fb36b', '#ff5f97', '#8a5cf0']
/** Snow kicked up: a puff's blue-white steps, readable on a night sky and on the snow alike. */
const PUFF = ['#f4f8fc', '#d5e4f2', '#b2c9e0', '#93afcc']

// ---------------------------------------------------------------- the present's art

/** The present's measures, in art pixels, at a (possibly in-between) level and squash. */
interface Dims {
  /** Body front, lid front (2 wider each side), the top face's depth, the bow's size, the ribbon's width. */
  bw: number
  bh: number
  lw: number
  lh: number
  th: number
  bs: number
  rw: number
  /** The whole level it is drawn for (the dots, the tears). */
  l: number
}

/** The measures at a level, squashed or stretched: every size is whole pixels, the widths even so it stays centred. */
function dimsAt(level: number, sx = 1, sy = 1): Dims {
  const lv = clamp(level, 1, 7)
  const l = Math.round(lv)
  const bw = 2 * Math.round(((26 + 8 * (lv - 1)) * sx) / 2)
  const bh = Math.round((18 + 5 * (lv - 1)) * sy)
  return {
    bw,
    bh,
    lw: bw + 4,
    lh: Math.max(4, Math.round((6 + (l >> 1)) * sy)),
    th: Math.max(3, Math.round((4 + l * 1.1) * sy)),
    bs: Math.round(5 + l * 1.8),
    rw: l >= 4 ? 6 : 4,
    l,
  }
}

/** The present's size at a level: a body and a lid a little wider, both growing in whole pixels. */
export function presentSize(level: number): { bw: number; bh: number; lw: number; lh: number; bow: number } {
  const d = dimsAt(Math.round(level))
  return { bw: d.bw, bh: d.bh, lw: d.lw, lh: d.lh, bow: d.bs }
}

/** A shade level 0..3 from a value, ordered-dithered only across a narrow band between two steps. */
function lvlOf(v: number, x: number, y: number, sharp = 2.4) {
  const i = Math.floor(v)
  const f = clamp((v - i - 0.5) * sharp + 0.5)
  return clamp(i + (f > bayer(x, y) ? 1 : 0), 0, 3)
}

/** `src` with a one-pixel outline in `color` all round (a canvas one pixel bigger on every side). */
function inked(src: Canvas, key: string, color = INK): Canvas {
  return cached(`present|ink|${key}|${color}`, () => {
    const c = canvas(src.width + 2, src.height + 2)
    const sil = silhouette(src, `${key}|ink`, color)
    for (const [x, y] of [
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
    ] as const)
      c.g.drawImage(sil, x, y)
    c.g.drawImage(src, 1, 1)
    return c
  })
}

/** `src`'s shape filled with one colour (an outline's stamp, a hit's white frame). */
function silhouette(src: Canvas, key: string, color: string): Canvas {
  return cached(`present|sil|${key}|${color}`, () => {
    const c = canvas(src.width, src.height)
    c.g.drawImage(src, 0, 0)
    c.g.globalCompositeOperation = 'source-in'
    c.g.fillStyle = color
    c.g.fillRect(0, 0, src.width, src.height)
    return c
  })
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')
/**
 * `src` turned by `deg` (in 10° steps), nearest pixel: a pixel-art rotation, never a resampled one. The result is
 * square, `src`'s centre at its centre.
 */
function rotated(src: Canvas, key: string, deg: number): Canvas {
  const a = (((Math.round(deg / 10) * 10) % 360) + 360) % 360
  if (a === 0) return src
  return cached(`present|rot|${key}|${a}`, () => {
    const w = src.width
    const h = src.height
    const D = 2 * Math.ceil(Math.hypot(w, h) / 2) + 2
    const data = src.g.getImageData(0, 0, w, h).data
    const cos = Math.cos((a * Math.PI) / 180)
    const sin = Math.sin((a * Math.PI) / 180)
    return shade(D, D, (x, y) => {
      const dx = x + 0.5 - D / 2
      const dy = y + 0.5 - D / 2
      const sx = Math.floor(cos * dx + sin * dy + w / 2)
      const sy = Math.floor(-sin * dx + cos * dy + h / 2)
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null
      const i = (sy * w + sx) * 4
      return data[i + 3]! < 128 ? null : `#${hex2(data[i]!)}${hex2(data[i + 1]!)}${hex2(data[i + 2]!)}`
    })
  })
}

/** Where its tears open, as fractions of the body's front (clear of the ribbon's cross). */
const RIPS = [
  [0.14, 0.2],
  [0.6, 0.7],
  [0.18, 0.66],
] as const

/** The body's front: dithered light, the ribbon's cross, the paper's dots, its tears (lit from inside, or dark). */
function bodyArt(look: PresentLook, d: Dims, tears: number, lit: boolean, open: boolean): Canvas {
  const key = `${look}|${d.bw}|${d.bh}|${d.rw}|${d.l}|${tears}|${lit}|${open}`
  return cached(`present|body|${key}`, () => {
    const P = PAL[look]
    const { bw, bh, rw } = d
    const cx = bw / 2
    const ry = Math.round(bh * 0.46 - rw / 2)
    const c = shade(bw, bh, (x, y) => {
      let v = 0.45 + 1.45 * (y / Math.max(1, bh - 1)) + 0.55 * (x / Math.max(1, bw - 1))
      if (x <= 1) v -= 0.7
      else if (x >= bw - 3) v += 0.9
      if (y >= bh - 2) v += 0.7
      if (open) {
        // Open, its rim catches the light; shut, the lid's shadow falls across its top.
        if (y === 0) v = 0
      } else if (y <= 1) v = Math.max(v, y === 0 ? 3 : 2.3)
      const dx = x + 0.5 - cx
      const inV = Math.abs(dx) < rw / 2
      const inH = y >= ry && y < ry + rw
      if (inV || inH) {
        let w = v - 0.5
        if (inV) w += dx < -rw / 2 + 1 ? -0.9 : dx > rw / 2 - 1 ? 0.9 : 0
        else w += y === ry ? -0.9 : y === ry + rw - 1 ? 0.9 : 0
        return GOLDS[lvlOf(w, x, y)]
      }
      // The ribbon's own shadow on the paper, right of it and under it.
      if ((dx >= rw / 2 && dx < rw / 2 + 1) || y === ry + rw) v += 0.9
      const lv = lvlOf(v, x, y, 1.4)
      const dot = y % 6 === 3 && (x + (Math.floor(y / 6) % 2) * 3) % 6 === 2 && lv < 3
      return dot ? P.dots[lv]! : P.front[lv]!
    })
    // The tears: a jagged dark gap (or the light inside through it), the paper's white edge curling over it.
    const L = 3 + d.l
    for (let i = 0; i < Math.min(3, tears); i++) {
      const x0 = Math.round(bw * RIPS[i]![0])
      const y0 = Math.round(bh * RIPS[i]![1])
      for (let k = 0; k < L; k++) {
        const y = y0 + (k % 2) - ((k >> 2) % 2)
        rect(c.g, x0 + k, y, 1, 1, lit ? GLOW : P.inner)
        if (k > 0 && k < L - 1) rect(c.g, x0 + k, y + 1, 1, 1, lit ? GOLD_L : P.inner)
        if (k % 2 === 0 && k > 0) rect(c.g, x0 + k, y - 1, 1, 1, P.back)
      }
    }
    return c
  })
}

/** The lid: its top face in perspective (narrower at the back) with the ribbon's cross, then its front band. */
function lidArt(look: PresentLook, d: Dims): Canvas {
  return cached(`present|lid|${look}|${d.lw}|${d.lh}|${d.th}|${d.rw}`, () => {
    const P = PAL[look]
    const { lw, lh, th, rw } = d
    const cx = lw / 2
    const jm = Math.floor(th / 2)
    return shade(lw, th + lh, (x, y) => {
      const dx = x + 0.5 - cx
      if (y < th) {
        // Seen from a little above: each row back is a little narrower.
        const ins = Math.round((th - 1 - y) * 0.45)
        if (x < ins || x > lw - 1 - ins) return null
        let v = 0.15 + (1 - y / Math.max(1, th - 1)) * 0.9
        if (x === ins) v -= 0.3
        else if (x >= lw - 2 - ins) v += 0.7
        const rwj = Math.max(2, rw - 2 * Math.floor((th - 1 - y) / 5))
        if (Math.abs(dx) < rwj / 2 || y === jm || y === jm - 1)
          return GOLDS[lvlOf(v - 0.6 + (dx < -rwj / 2 + 1 && Math.abs(dx) < rwj / 2 ? -0.5 : 0), x, y)]
        return P.top[lvlOf(v, x, y)]
      }
      const i = y - th
      let v = 0.75 + (i / Math.max(1, lh - 1)) * 1.1
      if (i === 0) v = 0.1
      if (i === lh - 1) v += 0.6
      if (x <= 1) v -= 0.6
      else if (x >= lw - 3) v += 0.9
      if (Math.abs(dx) < rw / 2) {
        const w = v - 0.5 + (dx < -rw / 2 + 1 ? -0.9 : dx > rw / 2 - 1 ? 0.9 : 0)
        return GOLDS[lvlOf(w, x, y)]
      }
      if (dx >= rw / 2 && dx < rw / 2 + 1) v += 0.9
      return P.front[lvlOf(v, x, y)]
    })
  })
}

/** The bow: two loops with their light and their dark openings, the knot, two tails cut in a V. Inked. */
function bowArt(d: Dims): { c: Canvas; kx: number; ky: number } {
  const half = Math.round(d.bs * 1.3) + 2
  const ky = Math.round(d.bs * 0.75) + 1
  const tl = Math.round(d.bs * 0.8) + 3
  const c = cached(`present|bow|${d.bs}|${d.rw}`, () => {
    // The left half, then its mirror: the bow is symmetric to the pixel.
    const left = canvas(half, ky + tl + 2)
    const g = left.g
    const bs = d.bs
    // The tail, under the loop: a band hanging down and out, its outer edge dark, its end cut in a V.
    const tx = half - Math.round(bs * 0.6) - 1
    const ty = ky + tl
    line(g, half - 2, ky + 1, tx, ty, GOLD, 3)
    line(g, half - 3, ky + 2, tx - 1, ty, GOLD_D, 1)
    line(g, half - 1, ky + 1, tx + 1, ty - 1, GOLD_L, 1)
    g.clearRect(tx, ty, 1, 2)
    // The loop: dark under, gold, its light on top, the opening dark towards the knot.
    const lx = half - Math.round(bs * 0.62)
    const ly = ky - Math.round(bs * 0.32)
    const rx = Math.round(bs * 0.6)
    const ryy = Math.max(2, Math.round(bs * 0.45))
    ellipse(g, lx, ly, rx, ryy, GOLD_D)
    ellipse(g, lx, ly - 1, rx - 1, ryy - 1, GOLD)
    ellipseLine(g, lx, ly - 1, rx - 1, ryy - 1, GOLD_L, Math.PI * 1.05, Math.PI * 1.6)
    // The loop's opening: a dark hollow towards the knot, its far edge lit.
    const ox = lx + Math.round(rx * 0.22)
    const orx = Math.max(1, Math.round(rx * 0.45))
    const ory = Math.max(1, Math.round(ryy * 0.5))
    ellipse(g, ox, ly, orx, ory, GOLD_DD)
    ellipse(g, ox + 1, ly + 1, Math.max(0, orx - 1), Math.max(0, ory - 1), '#6b3a0c')
    const all = canvas(half * 2, left.height)
    all.g.drawImage(left, 0, 0)
    all.g.save()
    all.g.translate(half * 2, 0)
    all.g.scale(-1, 1)
    all.g.drawImage(left, 0, 0)
    all.g.restore()
    // The knot, over both.
    const kw = d.rw >= 6 ? 6 : 4
    rect(all.g, half - kw / 2, ky - 3, kw, 5, GOLD)
    rect(all.g, half - kw / 2, ky - 3, kw - 1, 1, GOLD_L)
    rect(all.g, half - kw / 2, ky - 3, 1, 4, GOLD_L)
    rect(all.g, half - kw / 2, ky + 1, kw, 1, GOLD_D)
    rect(all.g, half + kw / 2 - 1, ky - 2, 1, 3, GOLD_D)
    return inked(all, `bow|${d.bs}|${d.rw}`)
  })
  // The knot's place in the inked art.
  return { c, kx: half + 1, ky: ky + 1 }
}

interface Art {
  /** Inked, ready to draw: its bottom row's ink sits on the ground. */
  art: Canvas
  /** The same without the ink (one pixel in on each side): what the shine sweeps across. */
  color: Canvas
  key: string
}

/** The whole present (lid, body, bow): `tears` rips in its paper (0–3), `lit` the light behind them. */
function presentArt(look: PresentLook, d: Dims, tears = 0, lit = false, bow = true): Art {
  const key = `${look}|${d.bw}|${d.bh}|${d.lh}|${d.th}|${d.bs}|${d.rw}|${d.l}|${tears}|${lit}|${bow}`
  return cached(`present|art|${key}`, () => {
    const b = bow ? bowArt(d) : null
    const jm = Math.floor(d.th / 2)
    const above = b ? Math.max(0, b.ky - jm - 1) : 0
    const color = canvas(d.lw, above + d.th + d.lh + d.bh)
    color.g.drawImage(bodyArt(look, d, tears, lit, false), 2, above + d.th + d.lh)
    color.g.drawImage(lidArt(look, d), 0, above)
    if (b) color.g.drawImage(b.c, (d.lw >> 1) - b.kx, above + jm - b.ky + 1)
    return { art: inked(color, `art|${key}`), color, key }
  })
}

/** The open box: its body, and above it the opening (the rim, the dark inside, or the light pouring out). Inked. */
function openArt(look: PresentLook, d: Dims, lit: boolean): Canvas {
  const key = `${look}|${d.bw}|${d.bh}|${d.th}|${d.rw}|${d.l}|${lit}`
  return cached(`present|open|${key}`, () => {
    const P = PAL[look]
    const { bw, th } = d
    const c = canvas(bw, th + d.bh)
    const top = shade(bw, th, (x, y) => {
      const ins = Math.round((th - 1 - y) * 0.45)
      if (x < ins || x > bw - 1 - ins) return null
      // The rim: the back edge and the two sides, the paper's top colour.
      if (y === 0 || x === ins || x === bw - 1 - ins) return P.top[1]
      // The inside: dark walls, and when lit, the light welling up from its middle in dithered rings.
      const wall = y <= 2 ? mix(P.inner, P.front[3]!, 0.5) : P.inner
      if (!lit) return wall
      const e = Math.hypot((x + 0.5 - bw / 2) / (bw * 0.36), (y - th * 0.55) / (th * 0.55))
      const v = clamp(1.15 - e)
      return v > 0.75 ? GLOW : v > 0.45 ? GOLD_L : v > bayer(x, y) * 0.45 ? GOLD : wall
    })
    c.g.drawImage(top, 0, 0)
    c.g.drawImage(bodyArt(look, d, 0, false, true), 0, th)
    return inked(c, `open|${key}`)
  })
}

/** Pokédollars: three gold coins stacked a little askew, drawn once. */
function coinsArt(): Canvas {
  return cached('present|coins', () => {
    const c = canvas(22, 18)
    const g = c.g
    const coin = (x: number, y: number) => {
      ellipse(g, x, y + 1, 9, 4, INK)
      ellipse(g, x, y + 1, 8, 3, GOLD_D)
      ellipse(g, x, y - 1, 9, 4, INK)
      ellipse(g, x, y - 1, 8, 3, GOLD)
      ellipse(g, x - 2, y - 2, 3, 1, GOLD_L)
    }
    coin(11, 13)
    coin(10, 9)
    coin(12, 5)
    return c
  })
}

/** The present's picture at a level, for a page outside the stage (the rules' banner, the preview card, the gauge). */
export const presentPicture = (look: PresentLook, level: number): Canvas =>
  presentArt(look, dimsAt(Math.round(level))).art

// ---------------------------------------------------------------- drawing it on the stage

/** A picture leaning about its foot, row by row (a shear): a wobble with no resampled pixel. */
function drawLeaning(g: G, src: Canvas, x: number, y: number, lean: number) {
  const h = src.height
  for (let r = 0; r < h; r++) {
    const off = Math.round((lean * (h - 1 - r)) / Math.max(1, h - 1))
    g.drawImage(src, 0, r, src.width, 1, x + off, y + r, src.width, 1)
  }
}

let shineTmp: Canvas | null = null
/** A shine sweeping across the paper: a diagonal band, `q` 0→1 across, clipped to the present's own pixels. */
function drawShine(g: G, a: Art, x: number, y: number, q: number, look: PresentLook) {
  if (q <= 0 || q >= 1) return
  const src = a.color
  if (!shineTmp || shineTmp.width < src.width || shineTmp.height < src.height)
    shineTmp = canvas(Math.max(src.width, shineTmp?.width ?? 0), Math.max(src.height, shineTmp?.height ?? 0))
  const t = shineTmp.g
  t.globalCompositeOperation = 'source-over'
  t.clearRect(0, 0, shineTmp.width, shineTmp.height)
  // The band on a clear canvas, then cut to the art's own pixels.
  const [core, edge] = PAL[look].shine
  const wide = look === 'silver' ? 3 : 2
  const travel = src.width + src.height * 0.7 + 8
  for (let r = 0; r < src.height; r++) {
    const bx = Math.round(q * travel - 4 - r * 0.7)
    rect(t, bx, r, wide, 1, core)
    rect(t, bx + wide, r, 1, 1, edge)
    rect(t, bx - 1, r, 1, 1, edge)
    if (look === 'silver') rect(t, bx + wide + 3, r, 1, 1, edge)
  }
  t.globalCompositeOperation = 'destination-in'
  t.drawImage(src, 0, 0)
  t.globalCompositeOperation = 'source-over'
  g.drawImage(shineTmp, 0, 0, src.width, src.height, x + 1, y + 1, src.width, src.height)
}

interface DrawOpts {
  dx?: number
  dy?: number
  lean?: number
  tears?: number
  lit?: boolean
  white?: boolean
  bow?: boolean
  /** The shine's place across it, 0→1 (none outside). */
  shine?: number
}

/** The present standing with its foot on the ground at (PRESENT_AT.x + dx, PRESENT_AT.y + dy). */
function drawPresent(g: G, look: PresentLook, d: Dims, o: DrawOpts = {}) {
  const a = presentArt(look, d, o.tears ?? 0, !!o.lit, o.bow ?? true)
  const x = Math.round(PRESENT_AT.x + (o.dx ?? 0)) - (a.art.width >> 1)
  const y = Math.round(PRESENT_AT.y + (o.dy ?? 0)) + 1 - a.art.height
  // A white frame keeps its ink edge, or it would vanish on snow.
  const src = o.white ? inked(silhouette(a.color, `color|${a.key}`, '#ffffff'), `white|${a.key}`) : a.art
  if (o.lean) drawLeaning(g, src, x, y, o.lean)
  else g.drawImage(src, x, y)
  if (o.shine != null && !o.white && !o.lean) drawShine(g, a, x, y, o.shine, look)
}

/** Its contact shadow, a little to the right (the light is top left); `k` its size (smaller while it is up high). */
function drawShadow(g: G, d: Dims, k = 1, dx = 0) {
  const rx = Math.round(((d.lw >> 1) + 3) * k)
  if (rx < 2) return
  softEllipse(
    g,
    PRESENT_AT.x + 2 + dx,
    PRESENT_AT.y + 1,
    rx,
    Math.max(2, Math.round((3 + d.l / 3) * k)),
    '#4a5f8a',
    0.8,
  )
  softEllipse(g, PRESENT_AT.x + 1 + dx, PRESENT_AT.y, Math.round(rx * 0.85), 2, '#24304f', 0.95, 0.4)
}

/** A boss's present lights the snow under it: a warm dithered pool, pulsing in two steps. */
function drawGroundLight(g: G, d: Dims, t: number, k = 1) {
  const p = Math.floor(t * 3) % 2
  softEllipse(
    g,
    PRESENT_AT.x,
    PRESENT_AT.y + 1,
    Math.round(((d.lw >> 1) + 12 + p * 2) * k),
    Math.round((6 + p) * k),
    GOLD_L,
    0.5,
    1.6,
  )
}

/** A starburst: a jagged star of light with a gold edge (the instant something bursts). */
function drawStarburst(g: G, x: number, y: number, R: number, rot: number, fill: string, edge: string) {
  const n = 9
  for (const [r0, c] of [
    [R + 3, edge],
    [R, fill],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a0 = rot + (k / n) * Math.PI * 2
      const a1 = rot + ((k + 0.5) / n) * Math.PI * 2
      const a2 = rot + ((k + 1) / n) * Math.PI * 2
      const ro = r0 * (k % 2 ? 0.72 : 1)
      const ri = r0 * 0.4
      tri(
        g,
        x,
        y,
        x + Math.cos(a0) * ri,
        y + Math.sin(a0) * ri,
        x + Math.cos(a1) * ro,
        y + Math.sin(a1) * ro,
        c,
      )
      tri(
        g,
        x,
        y,
        x + Math.cos(a1) * ro,
        y + Math.sin(a1) * ro,
        x + Math.cos(a2) * ri,
        y + Math.sin(a2) * ri,
        c,
      )
    }
  }
}

/** Light pouring up out of an open box: shafts widening as they rise, thinning out in the dither. Cached by phase. */
function shafts(bw: number, k: number, phase: number): Canvas {
  const kk = Math.round(clamp(k) * 4) / 4
  return cached(`present|shafts|${bw}|${kk}|${phase}`, () => {
    const W = bw + 60
    const H = 96
    return shade(W, H, (x, y) => {
      const up = (H - 1 - y) / H
      const hw = bw / 2 - 2 + up * 26
      const dx = x + 0.5 - W / 2
      if (Math.abs(dx) > hw) return null
      const u = dx / hw
      // Five shafts drifting across, brighter in the middle and at the foot.
      const band = 0.5 + 0.5 * Math.sin(u * 7.5 + (phase * Math.PI) / 3)
      const v = kk * Math.pow(1 - up, 1.4) * (0.35 + 0.65 * band) * (1 - Math.abs(u) * 0.5)
      return v > bayer(x, y) ? (v > 0.7 ? GLOW : GOLD_L) : null
    })
  })
}

// ---------------------------------------------------------------- particles that flutter, lie and fade

/** A bit of paper or confetti: it turns over (its back shows), flutters down, lies on the snow, fades out. */
interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  delay: number
  w: number
  h: number
  c: string
  back: string
  /** Its turn (the face it shows), and how fast it turns. */
  a: number
  va: number
  floor: number
  down: boolean
  sway: number
  /** A big torn piece (a triangle with a dark edge), not a fleck. */
  big: boolean
  edge: string
}

/** A curling ribbon: a head flying, its last positions its body, shortening away as it dies. */
interface Streamer {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  delay: number
  c: string
  l: string
  d: string
  curl: number
  n: number
  pts: number[]
}

/** A tossed thing (the bow, the lid): flies on an arc, turning, lands, bounces once and lies there. */
interface Toss {
  src: Canvas
  key: string
  x: number
  y: number
  vx: number
  vy: number
  a: number
  va: number
  /** The ground it lands on (its centre's height there), and the turn it settles at. */
  floor: number
  rest: number
  down: boolean
  bounced: boolean
}

function stepBits(list: Bit[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!
    if (b.delay > 0) {
      b.delay -= dt
      continue
    }
    b.age += dt
    if (b.age >= b.life) {
      list.splice(i, 1)
      continue
    }
    if (b.down) continue
    // Paper: gravity against a lot of air (small bits more), swaying as it falls.
    const drag = b.big ? 2.2 : 3.6
    b.vy += 300 * dt
    b.vx *= Math.max(0, 1 - drag * dt)
    b.vy *= Math.max(0, 1 - drag * dt)
    b.x += (b.vx + (b.vy > 0 ? Math.sin(b.age * 9 + b.sway) * 22 : 0)) * dt
    b.y += b.vy * dt
    b.a += b.va * dt
    if (b.vy > 0 && b.y >= b.floor) {
      b.y = b.floor
      b.down = true
    }
  }
}

function drawBits(g: G, list: readonly Bit[]) {
  for (const b of list) {
    if (b.delay > 0) continue
    // Its last 0.4 s it thins out through the dither, pixel by pixel.
    const k = clamp((b.life - b.age) / 0.4)
    const f = Math.cos(b.a)
    // Lying on the snow, half show their white back (so the snow isn't spattered with red).
    const front = b.down ? Math.sin(b.sway * 7) > -0.2 : f >= 0
    const c = front ? b.c : b.back
    if (b.big) {
      // A torn piece: a triangle turning in the air, flattened as it turns edge-on, its lower edge dark.
      const ang = b.a * 0.4 + b.sway
      const sq = b.down ? 0.35 : Math.max(0.3, Math.abs(f))
      const R = b.w / 2 + 1
      const pts = [0, 2.3, 4.2].map(
        (o) => [b.x + Math.cos(ang + o) * R, b.y + Math.sin(ang + o) * R * sq] as const,
      )
      const [p0, p1, p2] = pts as [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
      ]
      const fill = k >= 1 ? c : pattern(g, c, k * 16)
      const edge = k >= 1 ? b.edge : pattern(g, b.edge, k * 16)
      tri(g, p0[0], p0[1] + 1, p1[0], p1[1] + 1, p2[0], p2[1] + 1, edge)
      tri(g, p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], fill)
      continue
    }
    const w = b.down ? b.w : Math.max(1, Math.round(Math.abs(f) * b.w))
    const h = b.down ? 1 : b.h
    const x0 = Math.round(b.x - w / 2)
    const y0 = Math.round(b.y - h / 2)
    if (k >= 1) rect(g, x0, y0, w, h, c)
    else
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if (bayer(x0 + x, y0 + y) < k) rect(g, x0 + x, y0 + y, 1, 1, c)
  }
}

function stepStreamers(list: Streamer[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!
    if (s.delay > 0) {
      s.delay -= dt
      continue
    }
    s.age += dt
    if (s.age >= s.life) {
      list.splice(i, 1)
      continue
    }
    s.vy += 220 * dt
    s.vx *= Math.max(0, 1 - 1.6 * dt)
    s.vy *= Math.max(0, 1 - 1.6 * dt)
    // The curl: its head turning round and round as it flies.
    const ang = s.age * s.curl
    s.vx += Math.cos(ang) * 110 * dt
    s.vy += Math.sin(ang) * 110 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.pts.unshift(s.x, s.y)
    // Its body shortens away over its last 40 %.
    const keep = Math.max(0, Math.round(s.n * clamp((s.life - s.age) / (s.life * 0.4))))
    if (s.pts.length > keep * 2) s.pts.length = keep * 2
  }
}

function drawStreamers(g: G, list: readonly Streamer[]) {
  for (const s of list) {
    if (s.delay > 0 || s.pts.length < 4) continue
    const p = s.pts
    // A ribbon: its dark underside, its colour, its light edge on top.
    for (let i = 0; i + 3 < p.length; i += 2) line(g, p[i]!, p[i + 1]! + 1, p[i + 2]!, p[i + 3]! + 1, s.d, 1)
    for (let i = 0; i + 3 < p.length; i += 2) line(g, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!, s.c, 2)
    for (let i = 0; i + 3 < p.length; i += 4) line(g, p[i]!, p[i + 1]! - 1, p[i + 2]!, p[i + 3]! - 1, s.l, 1)
  }
}

function stepTosses(list: Toss[], dt: number) {
  for (const o of list) {
    if (o.down) continue
    o.vy += 420 * dt
    o.x += o.vx * dt
    o.y += o.vy * dt
    o.a += o.va * dt
    if (o.vy > 0 && o.y >= o.floor) {
      o.y = o.floor
      if (!o.bounced && o.vy > 60) {
        // One small bounce, then it lies down at its resting turn.
        o.bounced = true
        o.vy = -o.vy * 0.25
        o.vx *= 0.15
        o.va = 0
        o.a = o.rest
      } else {
        o.down = true
        o.a = o.rest
      }
    }
  }
}

/** A thing tossed from (x0, y0) to land at x1 on its floor, turning `turns` times on the way to its resting turn. */
function toss(
  src: Canvas,
  key: string,
  x0: number,
  y0: number,
  x1: number,
  floor: number,
  vy: number,
  turns: number,
  rest: number,
): Toss {
  // y0 + vy·T + ½·g·T² = floor
  const T = (-vy + Math.sqrt(vy * vy + 2 * 420 * Math.max(0, floor - y0))) / 420
  return {
    src,
    key,
    x: x0,
    y: y0,
    vx: (x1 - x0) / T,
    vy,
    a: 0,
    va: (360 * turns + rest) / T,
    floor,
    rest,
    down: false,
    bounced: false,
  }
}

function drawTosses(g: G, list: readonly Toss[]) {
  for (const o of list) {
    const c = rotated(o.src, o.key, o.a)
    g.drawImage(c, Math.round(o.x - c.width / 2), Math.round(o.y - c.height / 2))
  }
}

// ---------------------------------------------------------------- the takes

interface PresentState {
  r: Rng
  fx: Particles
  /** Smoke behind the Pokémon coming out (a puff over a sprite would dither across it). */
  back: Particles
  bits: Bit[]
  streamers: Streamer[]
  tosses: Toss[]
}

/** Its breathing at rest: a pixel of squash every other beat. */
const breathe = (t: number, still?: boolean) => (still ? 0 : Math.floor(t * 1.6) % 2)
/** A shine sweeping across now and then while it waits (none when calm): 0→1, or -1 between. */
function shineAt(t: number, t0: number, every: number, still?: boolean) {
  if (still || t < t0) return -1
  const u = ((t - t0) % every) / 0.5
  return u < 1 ? u : -1
}

/** The present's take for the mode asked (see the head of this file). */
export function presentTimeline(p: PresentParams): Timeline<PresentState> {
  const look: PresentLook = p.look ?? 'red'
  const P = PAL[look]
  const short = !!p.short
  const level = Math.max(1, p.level)
  const to = Math.max(level, p.to ?? level)
  const boss = look === 'silver'
  const still = !!p.still
  const base = dimsAt(level)
  // Times, by mode.
  const T_LAND = 0.42
  const G_CROUCH = short ? 0 : 0.5
  const G_SWELL = G_CROUCH + (short ? 0.02 : 0.1)
  const G_DONE = G_SWELL + 0.42
  const WOBBLES = short ? [] : [0.12, 0.28]
  // Break / burst: a longer strain for the boss (it bulges, shakes, then goes).
  const B_STRAIN = short ? 0.15 : boss ? 1.2 : 0.8
  const B_RIPS = [B_STRAIN * 0.35, B_STRAIN * 0.62, B_STRAIN * 0.86]
  const B_POP = B_STRAIN + 4 * STEP
  const B_OUT = B_POP + 0.45
  const B_DONE = B_OUT + 0.55
  // Open.
  const O_UNTIE = short ? 0.05 : 0.32
  const O_POP = O_UNTIE + (short ? 0.12 : 0.36)
  const contents = (p.contents ?? []).slice(0, 4)
  const O_OUT = contents.map((_, i) => O_POP + 0.3 + i * 0.3)
  const O_DONE = (O_OUT[O_OUT.length - 1] ?? O_POP) + 0.5
  const dur =
    p.mode === 'appear'
      ? T_LAND + 0.4
      : p.mode === 'idle'
        ? 0.05
        : p.mode === 'grow'
          ? G_DONE + 0.1
          : p.mode === 'open'
            ? O_DONE
            : B_DONE

  // The present's foot on the ground, its body's top and its lid's top (the level it is at).
  const ground = PRESENT_AT.y - 1
  const bodyTop = ground - base.bh + 1
  const lidTop = bodyTop - base.lh - base.th
  // Where the things out of an opened present come to float: a row over it, clear of its opening.
  const slotY = Math.min(74, bodyTop - base.th - 8)
  const slots = contents.map((_, i) => {
    const n = contents.length
    const spread = n <= 1 ? 0 : Math.min(150, 44 * (n - 1))
    return { x: Math.round(PRESENT_AT.x - spread / 2 + (n <= 1 ? 0 : (spread * i) / (n - 1))), y: slotY }
  })

  /** Paper shreds (and confetti) flying out of (x, y): up and out, then down to the snow around it. */
  const shreds = (
    s: PresentState,
    n: number,
    x: number,
    y: number,
    speed: number,
    colors: readonly string[],
    o: { big?: number; spread?: number; up?: number; confetti?: boolean } = {},
  ) => {
    const r = s.r
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * r.range(0.04, 0.96) * (o.up ?? 1) - (o.up != null ? Math.PI * (1 - o.up) * 0.5 : 0)
      const sp = r.range(speed * 0.35, speed)
      const big = k < (o.big ?? 0)
      const c = colors[k % colors.length]!
      s.bits.push({
        x: x + r.range(-(o.spread ?? 8), o.spread ?? 8),
        y: y + r.range(-4, 4),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        age: 0,
        life: r.range(1.6, 2.6),
        delay: 0,
        w: big ? r.int(4, 6) : o.confetti ? 2 : r.int(2, 3),
        h: big ? r.int(3, 4) : o.confetti ? 1 : r.int(1, 2),
        c,
        back: o.confetti ? mix(c, '#000000', 0.3) : P.back,
        a: r.range(0, 6),
        va: r.range(6, 16) * (r() < 0.5 ? -1 : 1),
        floor: ground + r.range(-3, 9),
        down: false,
        sway: r.range(0, 6),
        big,
        edge: o.confetti ? mix(c, '#000000', 0.45) : P.front[3]!,
      })
    }
  }
  const ribbons = (
    s: PresentState,
    n: number,
    x: number,
    y: number,
    speed: number,
    colors?: readonly string[],
  ) => {
    const r = s.r
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * (0.15 + (0.7 * (k + r.range(0.1, 0.9))) / n)
      const sp = r.range(speed * 0.6, speed)
      const c = colors ? colors[k % colors.length]! : GOLD
      s.streamers.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        age: 0,
        life: r.range(0.9, 1.4),
        delay: r.range(0, 0.05),
        c,
        l: colors ? mix(c, '#ffffff', 0.45) : GOLD_L,
        d: colors ? mix(c, '#000000', 0.4) : GOLD_DD,
        curl: r.range(5, 8) * (k % 2 ? 1 : -1),
        n: r.int(18, 26),
        pts: [],
      })
    }
  }
  /** Snow kicked up either side of its foot. */
  const puff = (s: PresentState, w: number, n: number, up = 1, into = s.fx) => {
    const r = s.r
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1
      into.add({
        x: PRESENT_AT.x + side * r.range(w * 0.25, w * 0.55),
        y: ground - r.range(0, 3),
        vx: side * r.range(25, 70),
        vy: -r.range(6, 26) * up,
        ay: 30,
        drag: 2.6,
        life: r.range(0.4, 0.65),
        size: r.int(2, 3),
        size1: r.int(4, 6),
        shape: 'smoke',
        colors: PUFF,
        light: '#ffffff',
        density: 0.9,
      })
    }
  }
  const twinkles = (
    s: PresentState,
    x: number,
    y: number,
    n: number,
    R: number,
    colors: string[],
    life = 0.5,
  ) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      s.fx.add({
        x,
        y,
        vx: Math.cos(a) * R,
        vy: Math.sin(a) * R * 0.8,
        drag: 3,
        life,
        shape: 'star',
        size: 2,
        size1: 0,
        colors,
        core: '#ffffff',
      })
    }
  }

  // Grow: its measures frame by frame (crouch, wobbles, crouch, spring), and its lean.
  const growLook = (t: number): { d: Dims; lean: number; hop: number; white: boolean } => {
    if (t >= G_SWELL) {
      // The new size, settling in steps: past it, short of it, a hair past, there.
      const e = t - G_SWELL
      const k = e < 0.07 ? [1.12, 1.1] : e < 0.14 ? [0.95, 1.05] : e < 0.21 ? [1.03, 0.97] : [1, 1]
      return { d: dimsAt(to, k[0], k[1]), lean: 0, hop: 0, white: false }
    }
    if (t >= G_SWELL - 2 * STEP) {
      // Two white frames growing: half way, then past the new size.
      const first = t < G_SWELL - STEP
      return {
        d: first ? dimsAt((level + to) / 2, 0.96, 1.1) : dimsAt(to, 1.1, 1.14),
        lean: 0,
        hop: first ? -3 : -2,
        white: true,
      }
    }
    if (short) return { d: base, lean: 0, hop: 0, white: false }
    if (t < 0.12) {
      const q = Math.floor(span(t, 0, 0.12) * 3) / 3
      return { d: dimsAt(level, 1 + 0.1 * q, 1 - 0.12 * q), lean: 0, hop: 0, white: false }
    }
    if (t < 0.44) {
      const first = t < 0.28
      const u = span(t, first ? 0.12 : 0.28, first ? 0.28 : 0.44)
      const amp = first ? 3 : 5
      const lean = Math.round(Math.sin(u * Math.PI * 2) * amp)
      return { d: base, lean, hop: -Math.round(Math.sin(u * Math.PI) * (first ? 1 : 2)), white: false }
    }
    if (t < 0.5) return { d: dimsAt(level, 1.12, 0.84), lean: 0, hop: 0, white: false }
    return { d: dimsAt(level, 0.9, 1.14), lean: 0, hop: -3, white: false }
  }

  // Break / burst: the strain's bulges, wide then tall, harder each beat.
  const strainLook = (t: number): { d: Dims; dx: number; hop: number } => {
    if (t >= B_STRAIN) return { d: dimsAt(level, 1.14, 1.12), dx: 0, hop: 0 }
    const q = span(t, 0, B_STRAIN)
    const beat = Math.floor(t / 0.11)
    const k = 0.03 + 0.08 * Math.floor(q * 4) * 0.34
    const wide = beat % 2 === 0
    const d = dimsAt(level, 1 + (wide ? k * 1.2 : -k * 0.4), 1 + (wide ? -k * 0.8 : k))
    const amp = 1 + Math.floor(q * 3) + (boss ? 1 : 0)
    const dx = Math.floor(t * 30) % 2 ? amp : -amp
    const hop = q > 0.55 && beat % 3 === 0 ? -2 : 0
    return { d, dx, hop }
  }

  return {
    id: `present-${p.mode}`,
    dur,
    hold: true,
    setup: () => ({
      r: rng(61 + level * 7),
      fx: new Particles(),
      back: new Particles(),
      bits: [],
      streamers: [],
      tosses: [],
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.back.update(dt)
      stepBits(s.bits, dt)
      stepStreamers(s.streamers, dt)
      stepTosses(s.tosses, dt)
      const r = s.r
      const at = (t0: number) => t >= t0 && t - dt < t0
      const d = p.mode === 'grow' && t >= G_SWELL ? dimsAt(to) : base
      const top = ground - d.bh - d.lh - d.th
      // A boss's present glints on its own corners and bow while it waits.
      if (boss && !still && p.mode !== 'burst' && r() < 0.06) {
        const corner = r.int(0, 3)
        s.fx.add({
          x: PRESENT_AT.x + (corner === 0 ? -d.lw / 2 : corner === 1 ? d.lw / 2 : r.range(-d.bs, d.bs)),
          y: corner < 2 ? top + d.th : top - r.range(0, d.bs * 0.6),
          life: 0.45,
          shape: 'star',
          size: 3,
          size1: 0,
          colors: ['#ffffff', GOLD_L, GOLD],
          core: '#ffffff',
        })
      }
      if (p.mode === 'appear' && at(T_LAND)) puff(s, d.lw, 10)
      if (p.mode === 'grow' && at(G_SWELL)) {
        twinkles(s, PRESENT_AT.x, ground - d.bh / 2, 10, 70, ['#ffffff', GOLD_L, GOLD])
        for (let k = 0; k < 6; k++)
          s.fx.add({
            x: PRESENT_AT.x + r.range(-d.lw / 2, d.lw / 2),
            y: ground - r.range(0, d.bh + d.lh),
            vy: -r.range(20, 40),
            life: r.range(0.5, 0.8),
            delay: r.range(0, 0.15),
            shape: 'plus',
            size: 1,
            colors: ['#ffffff', GOLD_L, GOLD],
          })
        puff(s, d.lw, 6, 0.5)
      }
      if (p.mode === 'break' || p.mode === 'burst') {
        // Shreds fly at each rip, from the tear itself.
        B_RIPS.forEach((tr, i) => {
          if (!at(tr)) return
          const x = PRESENT_AT.x - base.bw / 2 + base.bw * RIPS[i]![0] + 3
          const y = bodyTop + base.bh * RIPS[i]![1]
          shreds(s, 6, x, y, 90, P.scraps, { spread: 3 })
          s.fx.add({
            x,
            y,
            life: 0.2,
            shape: 'star',
            size: 4,
            size1: 1,
            colors: ['#ffffff', GLOW],
            core: '#ffffff',
          })
        })
        if (at(B_POP)) {
          const cy = ground - base.bh / 2 - 2
          shreds(s, boss ? 54 : 38, PRESENT_AT.x, cy, boss ? 230 : 190, P.scraps, {
            big: boss ? 12 : 9,
            spread: base.bw / 3,
          })
          if (boss) shreds(s, 36, PRESENT_AT.x, cy, 210, CONFETTI, { confetti: true, spread: 10 })
          ribbons(s, boss ? 8 : 5, PRESENT_AT.x, lidTop + base.th, boss ? 200 : 170)
          // The bow, tossed aside: it turns in the air and lands on the snow.
          const b = bowArt(base)
          s.tosses.push(
            toss(
              b.c,
              `bow|${base.bs}|${base.rw}`,
              PRESENT_AT.x,
              lidTop,
              PRESENT_AT.x + (boss ? 66 : 50),
              ground + 4 - b.c.height * 0.45,
              -140,
              2,
              0,
            ),
          )
          // The puff: dithered snow and paper dust.
          for (let k = 0; k < 16; k++) {
            const a = r.range(0, Math.PI * 2)
            const sp = r.range(20, 70)
            s.back.add({
              x: PRESENT_AT.x + Math.cos(a) * 6,
              y: cy + Math.sin(a) * 6,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp * 0.6 - 10,
              drag: 2.4,
              life: r.range(0.35, 0.5),
              size: 3,
              size1: r.int(6, 9),
              shape: 'smoke',
              colors: PUFF,
              light: '#ffffff',
              density: 0.85,
            })
          }
        }
        if (at(B_OUT)) {
          puff(s, 56, 8, 1, s.back)
          // A shiny's two rings of stars as it lands.
          if (p.shiny)
            for (const R of [14, 24])
              for (let k = 0; k < 10; k++) {
                const a = (k / 10) * Math.PI * 2
                s.fx.add({
                  x: PRESENT_AT.x,
                  y: PRESENT_AT.y - 24,
                  vx: Math.cos(a) * R * 2.2,
                  vy: Math.sin(a) * R * 2.2,
                  drag: 3,
                  life: 0.55,
                  delay: R === 24 ? 0.22 : 0,
                  size: 2,
                  shape: 'star',
                  colors: ['#ffffff', '#fff6a8', '#ffe14d'],
                })
              }
        }
      }
      if (p.mode === 'open') {
        if (at(O_UNTIE)) {
          // The bow springs off: it flips up and lands on the snow to the right.
          const b = bowArt(base)
          s.tosses.push(
            toss(
              b.c,
              `bow|${base.bs}|${base.rw}`,
              PRESENT_AT.x,
              lidTop + 1,
              PRESENT_AT.x + base.lw / 2 + 4 + (b.c.width >> 1),
              ground + 4 - b.c.height * 0.45,
              -150,
              1,
              0,
            ),
          )
          for (let k = 0; k < 6; k++)
            s.fx.add({
              x: PRESENT_AT.x + r.range(-3, 3),
              y: lidTop + 2,
              vx: r.range(-50, 50),
              vy: -r.range(30, 70),
              ay: 200,
              life: 0.4,
              shape: 'plus',
              size: 1,
              colors: ['#ffffff', GOLD_L, GOLD],
            })
        }
        if (at(O_POP)) {
          // The lid: up, turning over, down on the snow to the left.
          const lid = inked(lidArt(look, base), `lid|${look}|${base.lw}|${base.lh}|${base.th}|${base.rw}`)
          const half = (base.th + base.lh) / 2
          s.tosses.push(
            toss(
              lid,
              `lid|${look}|${base.lw}|${base.lh}|${base.th}`,
              PRESENT_AT.x,
              lidTop + half,
              PRESENT_AT.x - base.lw - 8,
              ground + 2 - half,
              -200,
              -1,
              0,
            ),
          )
          shreds(s, 30, PRESENT_AT.x, bodyTop - 2, 170, CONFETTI, {
            confetti: true,
            spread: base.bw / 3,
            up: 0.6,
          })
          ribbons(s, 4, PRESENT_AT.x, bodyTop - 2, 150, CONFETTI)
        }
        slots.forEach((pl, i) => {
          if (at(O_OUT[i]! + 0.4)) twinkles(s, pl.x, pl.y - 12, 8, 46, ['#ffffff', GOLD_L, GOLD], 0.45)
        })
      }
    },
    draw(g, s, t) {
      const after = t > dur
      const rest = after ? breathe(t - dur, still) : 0
      // At rest: a pixel of squash every other beat.
      const restDims = (d: Dims, lv: number) => (rest ? dimsAt(lv, 1.04, 0.96) : d)
      const every = boss ? 1.9 : 3.4
      if (p.mode === 'appear' || p.mode === 'idle') {
        const fall = p.mode === 'appear' ? span(t, 0, T_LAND) : 1
        const drop = fall < 1 ? Math.round(-150 * (1 - ease.inC(fall))) : 0
        let d = fall < 1 ? dimsAt(level, 0.9, 1.12) : restDims(base, level)
        let dy = drop
        if (p.mode === 'appear' && t >= T_LAND && t < T_LAND + 0.3) {
          // The landing: a hard squash, softer, a little rebound up stretched, down.
          const e = t - T_LAND
          d =
            e < 2 * STEP
              ? dimsAt(level, 1.24, 0.72)
              : e < 4 * STEP
                ? dimsAt(level, 1.12, 0.86)
                : e < 0.2
                  ? dimsAt(level, 0.95, 1.06)
                  : base
          if (e >= 4 * STEP && e < 0.2) dy = -Math.round(Math.sin(Math.PI * span(e, 4 * STEP, 0.2)) * 4)
        }
        if (boss && fall >= 1) drawGroundLight(g, base, t, span(t, T_LAND, T_LAND + 0.3) || 1)
        drawShadow(g, base, 0.35 + 0.65 * ease.inQ(fall))
        const sh = p.mode === 'idle' ? shineAt(t, 0.6, every, still) : shineAt(t, T_LAND + 0.45, every, still)
        drawPresent(g, look, d, { dy, shine: sh })
        s.fx.draw(g)
        return
      }
      if (p.mode === 'grow') {
        const lk = t > G_DONE ? { d: restDims(dimsAt(to), to), lean: 0, hop: 0, white: false } : growLook(t)
        const lv = t >= G_SWELL - 2 * STEP ? to : level
        if (boss) drawGroundLight(g, dimsAt(lv), t)
        drawShadow(g, lk.d)
        // A shine runs across it once it has settled on its new size, then now and then.
        const sh = t < dur ? shineAt(t, G_SWELL + 0.2, 99, still) : shineAt(t, dur + 1, every, still)
        drawPresent(g, look, lk.d, { lean: lk.lean, dy: lk.hop, white: lk.white, shine: sh })
        // A gold ring bursting out as it swells, a white one inside it.
        const fq = span(t, G_SWELL, G_SWELL + 0.45)
        const cy = ground - dimsAt(to).bh / 2
        burstRing(g, PRESENT_AT.x, cy, fq, 54, 3, GOLD)
        burstRing(g, PRESENT_AT.x, cy, span(t, G_SWELL + 0.04, G_SWELL + 0.45), 46, 2, '#ffffff')
        s.fx.draw(g)
        if (within(t, G_SWELL, G_SWELL + 0.12))
          screenFlash(g, '#fff2b8', 0.25 * (1 - span(t, G_SWELL, G_SWELL + 0.12)))
        return
      }
      if (p.mode === 'open') {
        const lit = t >= O_POP
        // The light under and in it: warm on the snow from the moment the lid lifts.
        if (t >= O_UNTIE + 0.1)
          softEllipse(
            g,
            PRESENT_AT.x,
            PRESENT_AT.y + 1,
            (base.lw >> 1) + 14,
            6,
            GOLD_L,
            lit ? 0.75 : 0.4,
            1.2,
          )
        drawShadow(g, base)
        // What has been tossed lies on the snow either side, drawn behind the box.
        if (t < O_POP) {
          // It shivers, the bow springs off, the lid jumps on the light pushing under it.
          let dx = 0
          if (!short && t < O_UNTIE) dx = Math.floor(t * 24) % 2 && t > 0.08 ? 1 : 0
          const untied = t >= O_UNTIE
          const jump =
            untied && !short ? [0, 2, 0, 1, 0, 3][Math.min(5, Math.floor(span(t, O_UNTIE, O_POP) * 6))]! : 0
          if (jump) {
            // The lid lifted: the body, the light between, the lid above.
            const body = openArt(look, base, true)
            const x = PRESENT_AT.x - (body.width >> 1)
            g.drawImage(body, x, PRESENT_AT.y + 1 - body.height)
            const lid = inked(lidArt(look, base), `lid|${look}|${base.lw}|${base.lh}|${base.th}|${base.rw}`)
            g.drawImage(lid, PRESENT_AT.x - (lid.width >> 1), lidTop - 1 - jump)
            rect(g, PRESENT_AT.x - base.bw / 2 + 2, bodyTop - jump, base.bw - 4, 1, GLOW)
            for (let k = 0; k < 5; k++) {
              const x0 = PRESENT_AT.x - base.bw / 2 + 4 + (k * (base.bw - 8)) / 4
              line(g, x0, bodyTop - jump - 1, x0 + (k - 2) * 3, bodyTop - jump - 6, GLOW)
            }
          } else drawPresent(g, look, base, { dx, bow: !untied })
          drawTosses(g, s.tosses)
        } else {
          drawTosses(g, s.tosses)
          // Light pouring up out of it, strong at first, settling to a glow.
          const k = 1 - 0.6 * span(t, O_POP + 0.2, O_POP + 1.1)
          const sc = shafts(base.bw, k, still ? 0 : Math.floor(t * 8) % 6)
          g.drawImage(sc, PRESENT_AT.x - (sc.width >> 1), bodyTop - base.th + 2 - sc.height)
          // What was inside, rising out of the box (drawn before it, so the box's front hides it until it clears).
          slots.forEach((pl, i) => {
            const t0 = O_OUT[i]!
            if (t < t0) return
            const u = span(t, t0, t0 + 0.45)
            const e = ease.outBack(u, 1.4)
            const x = Math.round(lerp(PRESENT_AT.x, pl.x, ease.outQ(u)))
            const y = Math.round(lerp(bodyTop + 12, pl.y, e))
            const bob = t > O_DONE ? breathe(t - O_DONE + i * 0.3, still) : 0
            const c = contents[i]!
            if (c.kind === 'gold') {
              const coins = coinsArt()
              g.drawImage(
                coins,
                x - coins.width,
                y + bob - coins.height * 2,
                coins.width * 2,
                coins.height * 2,
              )
            } else if (spriteFrame(c.key))
              drawSprite(g, c.key, x, y + bob, { sx: 2, sy: 2, flash: 1 - span(t, t0 + 0.1, t0 + 0.45) })
            else softEllipse(g, x, y - 10 + bob, 8, 8, GOLD_L, 0.9)
          })
          const body = openArt(look, base, true)
          g.drawImage(body, PRESENT_AT.x - (body.width >> 1), PRESENT_AT.y + 1 - body.height)
          burstRing(g, PRESENT_AT.x, bodyTop - 6, span(t, O_POP, O_POP + 0.5), 64, 3, GOLD)
          burstRing(g, PRESENT_AT.x, bodyTop - 6, span(t, O_POP + 0.05, O_POP + 0.5), 56, 2, '#ffffff')
          // More than four things: the last slot says how many in all.
          const more = (p.contents?.length ?? 0) - contents.length
          if (more > 0 && t >= O_DONE - 0.3) {
            const label = `+${more}`
            text(g, label, PRESENT_AT.x + 64 - Math.round(textWidth(label, 2) / 2), 40, '#ffffff', INK, 2)
          }
        }
        drawStreamers(g, s.streamers)
        drawBits(g, s.bits)
        s.fx.draw(g)
        if (within(t, O_POP, O_POP + 0.2)) screenFlash(g, '#fff6d8', 0.35 * (1 - span(t, O_POP, O_POP + 0.2)))
        return
      }
      // Break / burst.
      const sh = screenShake(t, [[B_POP, 0.3, boss ? 4 : 3]])
      g.save()
      g.translate(sh.x, sh.y)
      if (t < B_POP) {
        // The strain: bulging wide then tall, shaking, ripping; the hit-stop holds on its fullest bulge, lit inside.
        const lk = strainLook(t)
        const tears = B_RIPS.filter((x) => t >= x).length
        const lit = t >= B_RIPS[1]! && Math.floor(t * 20) % 3 !== 0
        if (boss) drawGroundLight(g, lk.d, t, 1 + span(t, 0, B_STRAIN) * 0.3)
        drawShadow(g, lk.d)
        drawPresent(g, look, lk.d, { dx: lk.dx, dy: lk.hop, tears, lit: lit || t >= B_STRAIN })
        if (t >= B_STRAIN) {
          // Beams of light through the tears, frozen.
          RIPS.forEach(([fx, fy], i) => {
            const x = PRESENT_AT.x - lk.d.bw / 2 + lk.d.bw * fx + 3
            const y = ground - lk.d.bh + 1 + lk.d.bh * fy
            const a = -Math.PI / 2 + (i - 1) * 0.9
            line(g, x, y, x + Math.cos(a) * 14, y + Math.sin(a) * 14, GLOW, 2)
          })
        }
        drawTosses(g, s.tosses)
      } else {
        const cy = ground - base.bh / 2 - 2
        // The starburst, three frames.
        if (!still && t < B_POP + 3 * STEP) {
          const f = Math.floor((t - B_POP) / STEP)
          drawStarburst(
            g,
            PRESENT_AT.x,
            cy,
            [22, 34, 40][f]! * (boss ? 1.25 : 1),
            f * 0.2,
            '#ffffff',
            boss ? GOLD : GOLD_D,
          )
        }
        burstRing(
          g,
          PRESENT_AT.x,
          cy,
          span(t, B_POP + 2 * STEP, B_POP + 0.5),
          boss ? 90 : 64,
          3,
          boss ? GOLD : GOLD_L,
        )
        burstRing(g, PRESENT_AT.x, cy, span(t, B_POP + 4 * STEP, B_POP + 0.5), boss ? 80 : 56, 2, '#ffffff')
        drawTosses(g, s.tosses)
        s.back.draw(g)
        drawStreamers(g, s.streamers)
        // The Pokémon leaps out on an arc and lands: a squash, two white frames.
        if (p.mon && spriteFrame(p.mon) && t >= B_POP + 2 * STEP) {
          const t0 = B_POP + 2 * STEP
          const u = span(t, t0, B_OUT)
          const k = 0.45 + 0.55 * ease.outC(Math.min(1, u * 1.8))
          const y = u < 1 ? lerp(cy + 10, PRESENT_AT.y, u) - 4 * 32 * u * (1 - u) : PRESENT_AT.y
          let sx = k
          let sy = k
          if (u < 1 && u > 0.1) {
            // Stretched along its flight.
            sx *= 0.92
            sy *= 1.08
          }
          const e = t - B_OUT
          if (e >= 0 && e < 0.2) {
            const sq = e < 3 * STEP ? [1.2, 0.8] : e < 6 * STEP ? [0.94, 1.06] : [1, 1]
            sx = sq[0]!
            sy = sq[1]!
          }
          const flash = e >= 0 && e < 2 * STEP ? 1 : 0
          softEllipse(
            g,
            PRESENT_AT.x + 1,
            PRESENT_AT.y + 1,
            Math.round(6 + 12 * u),
            3,
            '#1b2a4a',
            0.4 + 0.4 * u,
          )
          // Its white frames keep an ink edge: a white shape alone vanishes on snow.
          drawSprite(g, p.mon, PRESENT_AT.x, Math.round(y) + (after ? rest : 0), {
            sx,
            sy,
            flash,
            outline: flash ? INK : undefined,
          })
        }
      }
      if (t < B_POP) drawStreamers(g, s.streamers)
      drawBits(g, s.bits)
      s.fx.draw(g)
      g.restore()
      if (within(t, B_POP, B_POP + 0.2))
        screenFlash(g, boss ? '#fff2b8' : '#ffffff', 0.3 * (1 - span(t, B_POP, B_POP + 0.2)))
    },
    cues: () => {
      const c: Cue<PresentState>[] = []
      if (p.mode === 'appear') c.push([T_LAND, () => fxSound('present.land')])
      if (p.mode === 'grow') {
        for (const w of WOBBLES) c.push([w, () => fxSound('present.wobble')])
        c.push([G_SWELL, (hud) => (fxSound('present.grow', to), hud.beat?.('grown'))])
      }
      if (p.mode === 'break' || p.mode === 'burst') {
        c.push([0, () => fxSound('present.strain')])
        for (const tr of B_RIPS) c.push([tr, () => fxSound('present.rip')])
        c.push([B_POP, (hud) => (fxSound(boss ? 'present.burst' : 'present.break'), hud.beat?.('broke'))])
        c.push([B_OUT, (hud) => hud.beat?.('out')])
      }
      if (p.mode === 'open') {
        c.push([O_UNTIE, () => fxSound('present.untie')])
        c.push([O_POP, () => fxSound('present.open')])
        O_OUT.forEach((t0, i) => c.push([t0, () => fxSound('present.item', i)]))
        c.push([O_DONE - 0.1, (hud) => hud.beat?.('opened')])
      }
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
