// The distortion on a Pokémon of Distortion World (docs/28, docs/15 §27). Still most of the time, a faint violet and
// teal rim on its own shape; then for about a third of a second it tears sideways in bands of rows, its colours shift
// and it splits into hard offset copies (violet, teal, Giratina's red): the look of the first CSS shader, which the
// player liked. The page draws it on its own animated sprite (CSS filters from burstCss, restCss and tearPrimitives),
// so every copy moves with the frame it shows; the FX lab draws the same frames on its canvas (drawDistorted). No React
// here: the battle stage, the preview and the FX lab use it.
import { canvas, rng, type Canvas, type G, type Particles, type Rng } from './pixel'
import { silhouette, spriteFrame } from './sprites'

/** Distortion World's palette: the void's purples, Giratina's red and gold, the rift's teal, its floating rocks. */
export const DW = {
  night: '#07020d',
  deep: '#12051f',
  dark: '#24093d',
  mid: '#3b1466',
  violet: '#6b2fc4',
  lilac: '#b05cff',
  pale: '#e4c8ff',
  red: '#e8384a',
  blood: '#8a1426',
  gold: '#ffc94a',
  paleGold: '#fff0a8',
  teal: '#2fd3c4',
  rock: '#3a2457',
  rockLit: '#5b3d85',
  rockDark: '#1f1233',
  rockEdge: '#8a6cc0',
  moss: '#1f5a52',
  mossLit: '#2f8a76',
} as const

/**
 * A burst every 5 s, lasting about a third of a second (the user's ask of 2026-10-15: a third softer than the first
 * shader's 3.4 s and 0.48 s): never faster than 3 a second.
 */
export const GLITCH_PERIOD = 5
export const GLITCH_DUR = 0.35

export interface Burst {
  /** Which burst (its seed). */
  n: number
  /** How far through it, 0..1. */
  p: number
}

/**
 * A seeded random source for small seeds (a burst's number, a frame's): xorshift starts near 0 for those, so the seed is
 * spread over 32 bits first and a few values dropped.
 */
export function seeded(seed: number): Rng {
  const r = rng(Math.imul(seed + 1, 2654435761) >>> 0)
  r()
  r()
  return r
}

/** The burst under way at t, if any: one per period, at a seeded moment in its second half. */
export function burstAt(t: number, period = GLITCH_PERIOD, dur = GLITCH_DUR, seed = 7): Burst | null {
  const n = Math.floor(t / period)
  const r = seeded(n * 977 + seed * 131)
  const start = n * period + period * 0.4 + r() * Math.max(0, period * 0.55 - dur)
  return t >= start && t < start + dur ? { n, p: (t - start) / dur } : null
}

/** A hard colour copy behind the sprite: its sideways offset in art pixels, its colour, how opaque. */
export type Ghost = readonly [dx: number, color: string, alpha: number]

/** The copies in each of a burst's four frames: close to the sprite and see-through (softened 2026-10-15). */
const GHOSTS: readonly (readonly Ghost[])[] = [
  [[1, DW.violet, 0.6]],
  [
    [2, DW.lilac, 0.5],
    [-2, DW.teal, 0.5],
  ],
  [[-1, DW.red, 0.5]],
  [[-1, DW.teal, 0.4]],
]
/** Short animations: these two copies the whole burst, no tear. */
const SHORT_GHOSTS: readonly Ghost[] = [
  [1, DW.violet, 0.5],
  [-1, DW.teal, 0.45],
]

/** A band of rows torn sideways: where it starts (0..1 down the sprite), its height and offset in art pixels. */
export interface Band {
  at: number
  h: number
  dx: number
}

/** One frame of a burst, as both the page's sprite (CSS filters) and the FX lab's canvas draw it. */
export interface BurstFrame {
  /** 0..3. */
  f: number
  ghosts: readonly Ghost[]
  /** Torn bands (none with short animations). */
  bands: Band[]
  /** The void's violet over it, this frame. */
  tint: boolean
}

/**
 * Frame f (each ~0.09 s) of a burst: 2–3 bands of rows torn 2–4 art pixels sideways (1 on the last frame), the colour
 * copies behind, the violet tint on the even frames. `short`: the copies only.
 */
export function burstFrame(b: Burst, short = false): BurstFrame {
  const f = Math.min(3, Math.floor(b.p * 4))
  if (short) return { f, ghosts: SHORT_GHOSTS, bands: [], tint: false }
  const r = seeded(b.n * 131 + f * 17 + 3)
  const bands = Array.from({ length: r.int(2, 3) }, () => ({
    at: r(),
    h: r.int(2, 4),
    dx: (r() < 0.5 ? -1 : 1) * (f === 3 ? 1 : r.int(2, 4)),
  }))
  return { f, ghosts: GHOSTS[f]!, bands, tint: f % 2 === 0 }
}

/** A colour with its alpha, for a CSS filter. */
const rgba = (hex: string, a: number) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')} / ${a})`

/**
 * The frame as a CSS filter on the page's own (animated) sprite, so every copy and tear is drawn from the frame and the
 * place it shows right now, and moves with it. `px`: CSS pixels per art pixel; `tear`: the url() of the SVG filter that
 * shifts the bands (tearPrimitives), or null.
 */
export function burstCss(frame: BurstFrame, px: number, tear: string | null): string {
  return [
    tear,
    ...frame.ghosts.map(([dx, col, a]) => `drop-shadow(${dx * px}px 0 0 ${rgba(col, a)})`),
    frame.tint ? 'hue-rotate(-25deg) saturate(1.2)' : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Between bursts: the sprite's own shape a pixel each side, violet and teal, faint; it is a filter on the sprite. */
export const restCss = (px: number) =>
  `drop-shadow(${px}px 0 0 ${rgba(DW.violet, 0.35)}) drop-shadow(${-px}px 0 0 ${rgba(DW.teal, 0.3)})`

/**
 * The SVG filter primitives that tear a sprite `w`×`h` CSS pixels (`px` per art pixel): a flat map, a flood per band
 * whose red says how far its rows move, and the displacement. Hard edges, whole art pixels.
 */
export function tearPrimitives(bands: readonly Band[], w: number, h: number, px: number): string {
  const scale = 10 * px
  const rows = Math.max(1, Math.round(h / px))
  const floods = bands.map((b, i) => {
    const y = Math.min(rows - 1, Math.floor(b.at * rows)) * px
    const red = Math.round(255 * (0.5 + (b.dx * px) / scale))
    return `<feFlood x="${-w}" y="${y}" width="${w * 3}" height="${b.h * px}" flood-color="rgb(${red},128,0)" result="b${i}"/>`
  })
  return [
    '<feFlood flood-color="rgb(128,128,0)" result="base"/>',
    ...floods,
    `<feMerge result="map"><feMergeNode in="base"/>${bands.map((_, i) => `<feMergeNode in="b${i}"/>`).join('')}</feMerge>`,
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`,
  ].join('')
}

const PAD = 6
let comp: Canvas | null = null

/**
 * The Pokémon mid-burst on a canvas (the FX lab's stage), feet at (x, y): burstFrame's copies behind, its bands torn,
 * the tint. The page draws the same frames on its own sprite (burstCss).
 */
export function drawDistorted(g: G, key: string, x: number, y: number, b: Burst, short = false) {
  const frame = spriteFrame(key)
  if (!frame) return
  const fw = frame.width
  const fh = frame.height
  const cw = fw + PAD * 2
  if (!comp || comp.width < cw || comp.height < fh) {
    comp = canvas(Math.max(cw, comp?.width ?? 0), Math.max(fh, comp?.height ?? 0))
  }
  const c = comp.g
  c.clearRect(0, 0, comp.width, comp.height)
  const bf = burstFrame(b, short)
  for (const [dx, col, a] of bf.ghosts) {
    c.globalAlpha = a
    c.drawImage(silhouette(key, col)!, PAD + dx, 0)
  }
  c.globalAlpha = 1
  c.drawImage(frame, PAD, 0)
  if (bf.tint) {
    c.globalAlpha = 0.22
    c.drawImage(silhouette(key, DW.violet)!, PAD, 0)
    c.globalAlpha = 1
  }
  // Bands of rows torn sideways, as whole-pixel offsets.
  const off = new Int8Array(fh)
  for (const band of bf.bands) {
    const y0 = Math.min(fh - 1, Math.floor(band.at * fh))
    for (let yy = y0; yy < Math.min(fh, y0 + band.h); yy++) off[yy] = band.dx
  }
  const left = Math.round(x - fw / 2) - PAD
  const top = Math.round(y - fh)
  let y0 = 0
  for (let yy = 1; yy <= fh; yy++)
    if (yy === fh || off[yy] !== off[y0]) {
      g.drawImage(comp, 0, y0, cw, yy - y0, left + off[y0]!, top + y0, cw, yy - y0)
      y0 = yy
    }
}

/**
 * Between bursts on a canvas (the FX lab), under the sprite at its feet (x, y): restCss's faint rim. Nothing else
 * stays behind it (the user, 2026-10-15: a layer that didn't move with the animated sprite was too much).
 */
export function drawAura(g: G, key: string, x: number, y: number) {
  const frame = spriteFrame(key)
  if (!frame) return
  const left = Math.round(x - frame.width / 2)
  const top = Math.round(y - frame.height)
  g.globalAlpha = 0.35
  g.drawImage(silhouette(key, DW.violet)!, left + 1, top)
  g.globalAlpha = 0.3
  g.drawImage(silhouette(key, DW.teal)!, left - 1, top)
  g.globalAlpha = 1
}

/** A mote of the void rising off a distorted Pokémon (w: its width; feet at x, y). */
export function emitMote(P: Particles, r: Rng, x: number, y: number, w: number) {
  P.add({
    x: x + r.range(-w / 2, w / 2),
    y: y - r.range(0, 8),
    vx: r.range(-3, 3),
    vy: -r.range(8, 14),
    life: r.range(0.6, 1.1),
    size: r() < 0.85 ? 1 : 2,
    shape: 'sq',
    colors: [DW.violet, DW.mid, DW.dark],
  })
}
