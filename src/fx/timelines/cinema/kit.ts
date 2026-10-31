// The legendary cinematics' shared kit (docs/53): what each bespoke entrance needs beyond the pixel engine's own
// primitives. Dissolves go through the ordered dither (no blended pixel), shards are filled pixel by pixel (a canvas
// path would antialias its edges), and every scene says when it reveals itself so the raid intro's words follow it.
import {
  bayer,
  canvas,
  cached,
  lerp,
  pattern,
  rect,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import type { Timeline } from '../../timeline'

export interface CinemaParams {
  /** The legend's front sprite key. */
  mon: string
  /** Art pixels: the raid intro's full-screen stage (raidEntranceStage), else 240 × 160. */
  w?: number
  h?: number
  /** Fewer particles and no shake (the "short" motion level). */
  short?: boolean
}

/** A legend's own entrance: its timeline, and when it shows itself in full (the raid intro's words follow it). */
export interface Cinema {
  reveal: number
  dur: number
  make(p: CinemaParams): Timeline<unknown>
  /** Other Pokémon it shows (front sprites: dex, shiny), loaded with the legend's before it plays. */
  sprites?: readonly (readonly [number, boolean])[]
}

/** After the reveal: the name (+0.5), the bars (+0.85), the trainers (+1.8), GO (+2.75), the fight (+3.4). */
export const AFTER_REVEAL = 3.45

/**
 * When the raid intro's words land (ms), from the reveal (s): the white-out's boom, the name, the bars, the trainers
 * cutting in, GO, the fight. The shared entrance's reveal (2.75 s) gives its old times exactly.
 */
export function wordsAt(reveal = 2.75) {
  const r = Math.round(reveal * 1000)
  return { boom: r, name: r + 500, bars: r + 850, cuts: r + 1800, go: r + 2750, end: r + 3400 }
}

let tmp: Canvas | null = null
/**
 * `src` drawn through an ordered-dither mask: k 0 nothing, 1 all of it. A dissolve between two pictures, or a scene
 * coming out of the dark, with no blended pixel.
 */
export function dissolve(
  g: G,
  src: CanvasImageSource & { width: number; height: number },
  k: number,
  x = 0,
  y = 0,
) {
  if (k <= 0) return
  if (k >= 1) return void g.drawImage(src, x, y)
  if (!tmp || tmp.width < src.width || tmp.height < src.height)
    tmp = canvas(Math.max(src.width, tmp?.width ?? 0), Math.max(src.height, tmp?.height ?? 0))
  const t = tmp.g
  t.globalCompositeOperation = 'source-over'
  t.clearRect(0, 0, tmp.width, tmp.height)
  t.drawImage(src, 0, 0)
  t.globalCompositeOperation = 'destination-in'
  t.fillStyle = pattern(t, '#000000', k * 16)
  t.fillRect(0, 0, src.width, src.height)
  t.globalCompositeOperation = 'source-over'
  g.drawImage(tmp, 0, 0, src.width, src.height, x, y, src.width, src.height)
}

/** A vertical gradient through colour stops, in ordered-dither steps (a pixel sky, never a smooth one). */
export function dGradient(w: number, h: number, stops: readonly string[], steps = 4): Canvas {
  const n = stops.length - 1
  return shade(w, h, (x, y) => {
    const k = (y / Math.max(1, h - 1)) * n
    const i = Math.min(n - 1, Math.floor(k))
    const f = k - i
    // Inside a stop pair, `steps` dithered bands: the lower colour wins where the threshold says so.
    const lv = Math.floor(f * steps + bayer(x, y)) / steps
    return lv >= 1
      ? stops[i + 1]!
      : lv <= 0
        ? stops[i]!
        : bayer(x + 2, y + 1) < lv
          ? stops[i + 1]!
          : stops[i]!
  })
}

/** A filled triangle, pixel by pixel (shards, ice, rocks). */
export function tri(
  g: G,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  c: string | CanvasPattern,
) {
  const x0 = Math.floor(Math.min(ax, bx, cx))
  const x1 = Math.ceil(Math.max(ax, bx, cx))
  const y0 = Math.floor(Math.min(ay, by, cy))
  const y1 = Math.ceil(Math.max(ay, by, cy))
  const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (Math.abs(d) < 0.01) return
  g.fillStyle = c
  for (let y = y0; y <= y1; y++) {
    // The row's run inside the triangle, found once per row.
    let l = Infinity
    let r = -Infinity
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / d
      const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) / d
      const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) / d
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        if (x < l) l = x
        r = x
      }
    }
    if (r >= l) g.fillRect(l, y, r - l + 1, 1)
  }
}

/** A flying piece of something broken: glass, ice, rock. */
export interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  a: number
  va: number
  r: number
  age: number
  life: number
  /** Its fill, its lit edge. */
  c: string
  e: string
  /** Lying on the floor now. */
  down?: boolean
}

export function makeShard(
  r: Rng,
  x: number,
  y: number,
  speed: number,
  c: string,
  e: string,
  up = 0.6,
): Shard {
  const a = r() * Math.PI * 2
  const v = speed * r.range(0.35, 1)
  return {
    x,
    y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v * 0.8 - speed * up * r(),
    a: r() * 6,
    va: r.range(-14, 14),
    r: r.range(1.5, 4.5),
    age: 0,
    life: r.range(2.5, 4),
    c,
    e,
  }
}

/** Shards falling: gravity, drag (a psychic hold is a big drag), and a floor they come to rest on. */
export function stepShards(list: Shard[], dt: number, o: { g?: number; drag?: number; floor?: number } = {}) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!
    s.age += dt
    if (s.age > s.life) {
      list.splice(i, 1)
      continue
    }
    if (s.down) continue
    s.vy += (o.g ?? 260) * dt
    if (o.drag) {
      const k = Math.max(0, 1 - o.drag * dt)
      s.vx *= k
      s.vy *= k
      s.va *= k
    }
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.a += s.va * dt
    if (o.floor != null && s.y > o.floor + s.r * 0.5) {
      // A little bounce, then it lies there, glinting.
      if (Math.abs(s.vy) > 40) {
        s.y = o.floor
        s.vy *= -0.25
        s.vx *= 0.5
        s.va *= 0.5
      } else {
        s.y = o.floor + Math.round(s.r * 0.3)
        s.down = true
      }
    }
  }
}

/** A shard's three corners. */
type Pt = [number, number]
const corners = (s: Shard): [Pt, Pt, Pt] => [
  [s.x + Math.cos(s.a) * s.r, s.y + Math.sin(s.a) * s.r],
  [s.x + Math.cos(s.a + 2.3) * s.r * 0.75, s.y + Math.sin(s.a + 2.3) * s.r * 0.75],
  [s.x + Math.cos(s.a + 4.0) * s.r * 0.9, s.y + Math.sin(s.a + 4.0) * s.r * 0.9],
]

export function drawShards(g: G, list: readonly Shard[], outline?: string) {
  for (const s of list) {
    const [a, b, c] = corners(s)
    if (s.down) {
      // On the floor: a flat sliver, its glint turning on and off.
      rect(g, s.x - s.r, s.y, Math.max(1, Math.round(s.r * 1.6)), 1, s.c)
      if (Math.floor(s.age * 3 + s.x) % 5 === 0) rect(g, s.x, s.y - 1, 1, 1, s.e)
      continue
    }
    if (outline) {
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        tri(g, a[0] + ox, a[1] + oy, b[0] + ox, b[1] + oy, c[0] + ox, c[1] + oy, outline)
    }
    tri(g, a[0], a[1], b[0], b[1], c[0], c[1], s.c)
    // The edge facing the light.
    rect(g, a[0], a[1], 1, 1, s.e)
    if (Math.floor(s.a * 2) % 3 === 0) rect(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1, 1, s.e)
  }
}

/**
 * A picture drawn row by row with a sideways wobble: heat haze, water, a psychic warp. `amp` in pixels, rows from y0
 * to y1 of the picture.
 */
export function wobble(
  g: G,
  src: CanvasImageSource,
  w: number,
  y0: number,
  y1: number,
  t: number,
  amp: number,
  len = 9,
  speed = 6,
  dy = 0,
) {
  for (let y = y0; y < y1; y++) {
    const off = Math.round(Math.sin(y / len + t * speed) * amp * (0.6 + 0.4 * Math.sin(y / 23 + t)))
    g.drawImage(src, 0, y, w, 1, off, y + dy, w, 1)
  }
}

/** An expanding dithered ring of light, its radius and fade from `q` 0→1. */
export function burstRing(g: G, x: number, y: number, q: number, maxR: number, width: number, color: string) {
  if (q <= 0 || q >= 1) return
  const R = Math.max(3, Math.round(lerp(4, maxR, 1 - (1 - q) ** 3)))
  // Rings are cached by radius: keep their sizes to steps of 2 so a scene makes a few dozen, not hundreds.
  const r = R - (R % 2)
  g.drawImage(ringC(r, width, color, 1 - q), Math.round(x - r - 1), Math.round(y - r - 1))
}
const ringC = (r: number, w: number, color: string, density: number) =>
  cached(`cine-ring|${r}|${w}|${color}|${Math.round(density * 8)}`, () =>
    shade(2 * r + 3, 2 * r + 3, (x, y) => {
      const d = Math.hypot(x - r - 1, y - r - 1)
      const k = 1 - Math.abs(d - (r - w / 2)) / (w / 2 + 0.5)
      return k > 0 && k * (Math.round(density * 8) / 8) > bayer(x, y) * 0.9 ? color : null
    }),
  )

/** Cues sorted by time: the player fires them in list order, so one listed late would fire late. */
export const inOrder = <C extends readonly [number, unknown]>(cues: C[]): C[] =>
  cues.sort((a, b) => a[0] - b[0])

/** 0 → 1 → 0 over [a, b]: a light coming and going. */
export const pulse = (t: number, a: number, b: number) => Math.sin(Math.PI * span(t, a, b))

/** A flicker that settles on: the fluorescent tube's stutter, k 0..1 over its window. */
export function flickerOn(t: number, t0: number, seed: number): number {
  const e = t - t0
  if (e < 0) return 0
  if (e > 0.5) return 1
  // Three stutters, each a few frames, from the seed.
  const f = Math.floor(e * 30)
  return [1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1][(f + seed) % 15]!
}
