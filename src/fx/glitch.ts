// The distortion on a Pokémon of Distortion World (docs/28, docs/15 §27), drawn in the pixel engine. Still most of the
// time, wrapped in a dark aura; then for half a second it tears sideways in bands of rows, its colours shift and it
// splits into hard offset copies (violet, teal, Giratina's red): the look of the first CSS shader, which the player
// liked, now drawn pixel for pixel on the sprite. No React here: the battle stage, the preview and the FX lab use it.
import { canvas, glow, rng, type Canvas, type G, type Particles, type Rng } from './pixel'
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

/** A burst every 3.4 s (the first shader's rhythm), lasting about half a second: never faster than 3 a second. */
export const GLITCH_PERIOD = 3.4
export const GLITCH_DUR = 0.48

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

/** The copies behind the sprite in each of a burst's four frames: [dx, colour]. */
const GHOSTS: readonly (readonly (readonly [number, string])[])[] = [
  [[2, DW.violet]],
  [
    [3, DW.lilac],
    [-3, DW.teal],
  ],
  [[-2, DW.red]],
  [[-1, DW.teal]],
]

const PAD = 6
let comp: Canvas | null = null

/**
 * The Pokémon mid-burst, feet at (x, y): the four frames (each ~0.12 s) tear bands of rows sideways by 2–6 pixels,
 * tint it the void's violet on the even ones, and put its hard colour copies behind. `short`: the copies and the tint
 * only, no tear.
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
  const f = Math.min(3, Math.floor(b.p * 4))
  const ghosts = short
    ? ([
        [2, DW.violet],
        [-2, DW.teal],
      ] as const)
    : GHOSTS[f]!
  for (const [dx, col] of ghosts) c.drawImage(silhouette(key, col)!, PAD + dx, 0)
  c.drawImage(frame, PAD, 0)
  if (f % 2 === 0) {
    c.globalAlpha = 0.38
    c.drawImage(silhouette(key, DW.violet)!, PAD, 0)
    c.globalAlpha = 1
  }
  // Bands of rows torn sideways (the old SVG displacement, as whole-pixel offsets).
  const off = new Int8Array(fh)
  if (!short) {
    const r = seeded(b.n * 131 + f * 17 + 3)
    const bands = r.int(3, 5)
    for (let i = 0; i < bands; i++) {
      const y0 = r.int(0, Math.max(0, fh - 2))
      const h = r.int(2, 6)
      const dx = (r() < 0.5 ? -1 : 1) * (f === 3 ? 1 : r.int(2, 6))
      for (let yy = y0; yy < Math.min(fh, y0 + h); yy++) off[yy] = dx
    }
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
 * The dark aura behind a distorted Pokémon (drawn under it), feet at (x, y): a dithered glow of the void that breathes
 * in two steps, and its shape in violet and teal a pixel each side, peeking out as a rim. `still`: one frame, held.
 */
export function drawAura(g: G, key: string, x: number, y: number, t: number, still = false) {
  const frame = spriteFrame(key)
  if (!frame) return
  const fw = frame.width
  const fh = frame.height
  const cx = Math.round(x)
  const cy = Math.round(y - fh / 2)
  const big = still ? 0 : Math.floor(t * 1.5) % 2
  const R = Math.round(Math.max(fw, fh) * 0.5) + big * 2
  g.drawImage(glow(R, DW.mid, 1.6, 0.6), cx - R, cy - R)
  const r2 = Math.round(R * 0.62)
  g.drawImage(glow(r2, DW.dark, 1.1, 0.85), cx - r2, cy - r2)
  const left = Math.round(x - fw / 2)
  const top = Math.round(y - fh)
  const swap = !still && Math.floor(t * 4) % 6 === 0
  g.drawImage(silhouette(key, swap ? DW.teal : DW.violet)!, left + 1, top)
  g.drawImage(silhouette(key, swap ? DW.violet : DW.teal)!, left - 1, top)
}

/** A mote of the void rising off a distorted Pokémon (w: its width; feet at x, y). */
export function emitMote(P: Particles, r: Rng, x: number, y: number, w: number) {
  P.add({
    x: x + r.range(-w / 2, w / 2),
    y: y - r.range(0, 8),
    vx: r.range(-3, 3),
    vy: -r.range(8, 16),
    life: r.range(0.8, 1.5),
    size: r() < 0.7 ? 1 : 2,
    shape: 'sq',
    colors: [DW.lilac, DW.violet, DW.mid, DW.dark],
  })
}
