// Distortion World's portal run (docs/28, docs/15 §27) on the pixel engine, built like the legend's entrance
// (legend.ts): the breach (reality cracks over the area and falls in shards into a tear of the Distortion World, its
// rocks drifting upside-down, a quake, the name card), the portal looping behind the way-in pop-up, a portal closing
// (it collapses in shards, a flash, a seal ring), the wild Pokémon's distortion, and the victory (shadow tendrils, shiny
// Giratina's silhouette rising out of the last portal in its aura, the reveal with a roar and a quake, the shiny
// sparkle, the portal sealed behind it, the name card). Words come from the screen; sizes too: the full-screen scenes
// draw on a stage of the screen's shape, the FX lab on the usual 240 × 160.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  clamp,
  ease,
  glow,
  label,
  labelWidth,
  lerp,
  line,
  Particles,
  rect,
  ring,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { background, type Point } from '../scenes'
import { drawSprite, spriteFrame } from '../sprites'
import { DW, burstAt, drawAura, drawDistorted, emitMote, GLITCH_DUR, GLITCH_PERIOD } from '../glitch'
import {
  H,
  screenFlash,
  screenShake,
  skippingNow,
  Stage,
  W,
  within,
  type Cue,
  type Fighters,
  type MotionLevel,
  type Timeline,
} from '../timeline'
import { drawRays, gleam } from './legend'

export { DW }

/** A scene's stage in art pixels: the screen's shape for a full-screen scene, else the usual 240 × 160. */
export interface SceneSize {
  w?: number
  h?: number
  /** Art rows at the bottom kept clear for the screen's own words (its line, its button): the scene sits above. */
  inset?: number
}

/**
 * A full-screen scene's stage: the screen's shape in art pixels, 2× on a phone up to 4× on a big screen, with `words`
 * CSS pixels at the bottom kept clear for the screen's line and buttons.
 */
export function fullStage(vw: number, vh: number, words = 0): Required<SceneSize> {
  const s = Math.min(4, Math.max(2, Math.floor(Math.min(vw, vh) / 170)))
  return { w: Math.ceil(vw / s), h: Math.ceil(vh / s), inset: Math.ceil(words / s) }
}

/**
 * How Distortion World's lasting effects play (the portal turning, the wild Pokémon's distortion, the screen's and the
 * UI's glitches): they are the world's identity (the user, 2026-10-15), so a calm OS (reduce motion) keeps them as in
 * full; the player's own short setting gives their lighter version; only motion off stills them.
 */
export function distortionLevel(level: MotionLevel, calm: boolean): MotionLevel {
  if (level === 'off') return 'off'
  return level === 'short' && !calm ? 'short' : 'full'
}

/** Where the portal stands on a stage of w × h, and how big it is. */
export const portalSpot = (w: number, h: number) => ({
  c: { x: Math.round(w / 2), y: Math.round(h * 0.38) },
  R: Math.max(10, Math.round(Math.min(w, h * 1.2) * 0.2)),
})

// ---------------------------------------------------------------- the Distortion World

/** Rows of a vertical gradient through the void's colours, ordered-dithered. */
const voidRow = (x: number, y: number, h: number) => {
  const cols = [DW.night, DW.deep, DW.dark, DW.mid, DW.dark, DW.deep, DW.night]
  const t = clamp(y / Math.max(1, h - 1)) * (cols.length - 1)
  const i = Math.floor(t)
  return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
}

/** A far island: a flat side and a rocky cone away from it; `up` hangs it upside-down, its trees pointing down. */
function island(g: G, r: Rng, x: number, yb: number, ww: number, hh: number, up: boolean) {
  const col = '#2a1048'
  const edge = DW.violet
  for (let j = 0; j < hh; j++) {
    const k = 1 - j / hh
    const hw = Math.round((ww / 2) * Math.pow(k, 0.7)) + (j % 3 === 1 && r() < 0.4 ? 1 : 0)
    rect(g, x - hw, up ? yb - j : yb + j, hw * 2 + 1, 1, j === 0 ? edge : col)
  }
  const n = Math.max(1, Math.floor(ww / 6))
  for (let i = 0; i < n; i++) {
    const tx = Math.round(x - ww / 2 + 2 + r() * (ww - 4))
    const th = r.int(2, 4)
    const dir = up ? 1 : -1
    rect(g, tx, up ? yb + 1 : yb - th, 1, th, col)
    rect(g, tx - 1, up ? yb + th : yb - th - 2, 3, 2, col)
    // A fall flowing the wrong way: lilac drops rising off the flat side.
    if (r() < 0.35)
      for (let k = 0; k < r.int(6, 16); k += 2)
        rect(g, tx + 2, yb - dir * (k + 2), 1, 1, k % 4 ? DW.violet : DW.lilac)
  }
}

/** The void: a dithered night of purples, far islands floating every which way, specks of light. Cached per size. */
export const voidBackdrop = (w: number, h: number): Canvas =>
  cached(`dw-void|${w}|${h}`, () => {
    const c = shade(w, h, (x, y) => voidRow(x, y, h))
    const r = rng(w * 7 + h * 3)
    const n = Math.max(3, Math.round((w * h) / 3800))
    for (let i = 0; i < n; i++)
      island(
        c.g,
        r,
        r.int(8, w - 8),
        r.int(Math.round(h * 0.12), Math.round(h * 0.92)),
        r.int(10, 26),
        r.int(4, 8),
        r() < 0.5,
      )
    for (let i = 0; i < (w * h) / 300; i++)
      rect(c.g, r.int(0, w), r.int(0, h), 1, 1, r() < 0.8 ? DW.violet : DW.pale)
    return c
  })

/** A floating rock: a flat mossy side and a jagged cone, upside-down (the moss underneath, roots hanging off it). */
export const rockSprite = (seed: number, big = false): Canvas =>
  cached(`dw-rock|${seed}|${big}`, () => {
    const r = rng(seed * 13 + 5)
    const rw = big ? r.int(16, 26) : r.int(7, 13)
    const rh = big ? r.int(10, 15) : r.int(5, 8)
    const jag = Array.from({ length: rw }, () => r.int(0, 2))
    const roots = Array.from({ length: rw }, () => (r() < 0.3 ? r.int(1, 3) : 0))
    return shade(rw, rh + 3, (x, y) => {
      const u = ((x + 0.5) / rw) * 2 - 1
      const top = Math.round((rh - 3) * Math.pow(Math.abs(u), 0.9)) + jag[x]!
      if (y < rh) {
        if (y < top) return null
        if (y >= rh - 2) return y === rh - 1 ? DW.moss : DW.mossLit
        if (y === top) return DW.rockEdge
        return u < -0.25 ? DW.rockLit : u > 0.35 ? DW.rockDark : DW.rock
      }
      return y - rh < roots[x]! ? DW.moss : null
    })
  })

export interface Rock {
  seed: number
  x: number
  y: number
  vx: number
  ph: number
  big: boolean
}

export function makeRocks(r: Rng, w: number, h: number, n: number): Rock[] {
  return Array.from({ length: n }, (_, i) => ({
    seed: 11 + i * 7,
    x: r.range(0, w),
    y: r.range(h * 0.06, h * 0.9),
    vx: (r() < 0.5 ? -1 : 1) * r.range(2, 6),
    ph: r.int(0, 3),
    big: i % 3 === 0,
  }))
}

/** The rocks drifting sideways and bobbing a pixel in two steps; they wrap round the stage. */
export function drawRocks(g: G, rocks: readonly Rock[], t: number, w: number, still = false) {
  for (const k of rocks) {
    const sp = rockSprite(k.seed, k.big)
    const span = w + sp.width * 2
    const x = ((((k.x + (still ? 0 : k.vx * t)) % span) + span) % span) - sp.width
    const y = k.y + (still ? 0 : Math.floor(t * 1.2 + k.ph) % 2)
    g.drawImage(sp, Math.round(x), Math.round(y))
  }
}

// ---------------------------------------------------------------- the portal

const bufs = new Map<number, { cv: Canvas; img: ImageData }>()

/**
 * The tear, centre (cx, cy), radius R: a void with Giratina's red-and-gold arms turning into it, a dashed rim of light,
 * a dithered glow and a dashed gold ring turning the other way. `open` widens it from a slit (0) to round (1); `spin`
 * is how fast the arms turn; `glowK` the glow's strength.
 */
export function drawPortal(
  g: G,
  cx: number,
  cy: number,
  R: number,
  t: number,
  { open = 1, spin = 1.6, glowK = 0.85 }: { open?: number; spin?: number; glowK?: number } = {},
) {
  if (open <= 0.02 || R < 2) return
  const rx = Math.max(1, R * open)
  const ry = R * 1.12
  const G0 = Math.ceil(R * 1.75)
  const S = G0 * 2 + 1
  let b = bufs.get(S)
  if (!b) {
    const cv = canvas(S, S)
    b = { cv, img: cv.g.createImageData(S, S) }
    bufs.set(S, b)
  }
  const d8 = b.img.data
  d8.fill(0)
  const px0 = Math.round(cx) - G0
  const py0 = Math.round(cy) - G0
  const put = (i: number, hex: string) => {
    d8[i] = parseInt(hex.slice(1, 3), 16)
    d8[i + 1] = parseInt(hex.slice(3, 5), 16)
    d8[i + 2] = parseInt(hex.slice(5, 7), 16)
    d8[i + 3] = 255
  }
  const ramp = [DW.night, DW.deep, DW.dark, DW.mid, DW.violet] as const
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - G0
      const dy = y - G0
      const nx = dx / rx
      const ny = dy / ry
      const d = Math.hypot(nx, ny)
      const i = (y * S + x) * 4
      const bx = bayer(px0 + x, py0 + y)
      const a = Math.atan2(ny, nx)
      if (d < 1) {
        if (d > 0.88) {
          const dash = ((Math.floor((a / (Math.PI * 2)) * 24 + t * 3) % 2) + 2) % 2 === 0
          put(i, d > 0.95 ? (dash ? DW.pale : DW.lilac) : DW.violet)
          continue
        }
        if (d < 0.2) {
          put(i, DW.night)
          continue
        }
        const sw = a + 3.0 * Math.log(d + 0.08) - t * spin
        const arm = Math.sin(sw * 4)
        if (arm > 0.7 && d > 0.3) {
          put(i, arm > 0.94 && d > 0.5 ? DW.gold : d > 0.6 ? DW.red : DW.blood)
          continue
        }
        const v = clamp(d * 1.05 + 0.12 * arm) * (ramp.length - 1)
        const k = Math.floor(v)
        put(i, v - k > bx ? ramp[Math.min(ramp.length - 1, k + 1)]! : ramp[k]!)
        continue
      }
      if (d < 1.7) {
        // A dashed gold ring turning the other way, then the glow thinning out.
        if (d > 1.22 && d < 1.3 && open > 0.6) {
          const dash = ((Math.floor((a / (Math.PI * 2)) * 16 - t * 1.2) % 3) + 3) % 3 === 0
          if (dash) {
            put(i, DW.gold)
            continue
          }
        }
        const q = Math.pow((1.7 - d) / 0.7, 1.6) * glowK
        if (q > bx) put(i, d < 1.12 ? DW.violet : d < 1.4 ? DW.mid : DW.dark)
      }
    }
  b.cv.g.putImageData(b.img, 0, 0)
  g.drawImage(b.cv, px0, py0)
}

/** Feed the portal: motes spiralling into it, now and then a spark on its rim. */
export function feedPortal(P: Particles, r: Rng, c: Point, R: number, rate = 0.5) {
  if (r() < rate) {
    const a = r() * Math.PI * 2
    const d = R * r.range(1.6, 2.4)
    const v = r.range(10, 22)
    P.add({
      x: c.x + Math.cos(a) * d,
      y: c.y + Math.sin(a) * d * 1.1,
      vx: -Math.sin(a) * v,
      vy: Math.cos(a) * v,
      home: { x: c.x, y: c.y, k: 70 },
      drag: 0.6,
      life: 2.2,
      size: 1,
      shape: r() < 0.8 ? 'px' : 'sq',
      colors: [DW.paleGold, DW.pale, DW.lilac, DW.violet],
    })
  }
  if (r() < rate * 0.12) {
    const a = r() * Math.PI * 2
    P.add({
      x: c.x + Math.cos(a) * R * 1.05,
      y: c.y + Math.sin(a) * R * 1.17,
      life: r.range(0.15, 0.3),
      size: r.int(1, 2),
      shape: 'star',
      colors: [DW.paleGold, DW.gold, DW.red],
    })
  }
}

// ---------------------------------------------------------------- shared pieces

/** A triangle filled row by row (crisp pixels, no anti-aliasing). */
export function fillTri(g: G, p: readonly (readonly [number, number])[], c: string) {
  const y0 = Math.round(Math.min(p[0]![1], p[1]![1], p[2]![1]))
  const y1 = Math.round(Math.max(p[0]![1], p[1]![1], p[2]![1]))
  g.fillStyle = c
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5
    let xa = Infinity
    let xb = -Infinity
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = p[i]!
      const [bx, by] = p[(i + 1) % 3]!
      if (ay === by || yc < Math.min(ay, by) || yc > Math.max(ay, by)) continue
      const x = ax + ((yc - ay) * (bx - ax)) / (by - ay)
      xa = Math.min(xa, x)
      xb = Math.max(xb, x)
    }
    if (xa <= xb) g.fillRect(Math.round(xa), y, Math.max(1, Math.round(xb) - Math.round(xa)), 1)
  }
}

/**
 * The name card, legend.ts's: a slanted band sweeping in (the void's purples, Giratina's red and gold rims), the title
 * at 2× when it fits (else 1×), a glint across it, small lines on the right.
 */
export function nameCard(
  g: G,
  w: number,
  y0: number,
  pin: number,
  title: string,
  subs: readonly string[],
  glint: number,
) {
  const subW = Math.max(0, ...subs.map((s) => labelWidth(g, s)))
  const s = labelWidth(g, title, 2) + 40 + subW <= w ? 2 : 1
  const showSubs = labelWidth(g, title, s) + 40 + subW <= w
  const h = s === 2 ? 30 : 22
  const x = Math.round(-w * (1 - ease.outExpo(pin)))
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 || y === h - 1 ? DW.gold : y < 3 ? DW.red : bayer(y, y * 3) < y / h ? DW.dark : DW.deep
    rect(g, x + slant - 10, y0 + y, w + 20, 1, col)
  }
  const tx = x + 14
  const ty = y0 + (s === 2 ? 8 : 8)
  const nameW = label(g, title, tx, ty, '#ffffff', DW.night, s)
  if (glint > 0 && glint < 1) {
    g.save()
    g.beginPath()
    const gx = tx + lerp(-20, nameW + 20, glint)
    g.moveTo(gx, ty - 2)
    g.lineTo(gx + 6, ty - 2)
    g.lineTo(gx - 2, ty + 16)
    g.lineTo(gx - 8, ty + 16)
    g.clip()
    label(g, title, tx, ty, DW.paleGold, null, s)
    g.restore()
  }
  if (showSubs)
    subs.slice(0, s === 2 ? 2 : 1).forEach((sub, i) => {
      label(g, sub, x + w - 12 - labelWidth(g, sub), y0 + 7 + i * 10, i ? '#ffffff' : DW.gold, DW.night)
    })
}

/** Rings bursting out of a point: [delay, colour] each, over `dur`. */
export function burstRings(
  g: G,
  c: Point,
  t: number,
  t0: number,
  max: number,
  rings: readonly (readonly [number, string])[],
  dur = 0.6,
) {
  for (const [d, col] of rings) {
    const q = span(t, t0 + d, t0 + d + dur)
    if (q > 0 && q < 1) {
      const R = Math.min(max, Math.round(6 + max * ease.outC(q)))
      g.drawImage(ring(R, 3, col, 1 - q), Math.round(c.x - R - 1), Math.round(c.y - R - 1))
    }
  }
}

/** Letterbox bars, legend.ts's. */
function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, DW.night)
  rect(g, 0, h - n, w, n, DW.night)
}

/** The seal: a gold ring with eight marks turning round it in steps, fading out through the dither. */
function seal(g: G, c: Point, R: number, t: number, q: number) {
  if (q <= 0 || q >= 1) return
  const k = 1 - span(q, 0.55, 1)
  const r0 = Math.round(R * (0.35 + 0.75 * ease.outBack(span(q, 0, 0.4), 1.6)))
  g.drawImage(ring(r0, 2, DW.gold, k), c.x - r0 - 1, c.y - r0 - 1)
  if (k < 0.3) return
  const turn = Math.floor(t * 8) / 8
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + turn
    const x = Math.round(c.x + Math.cos(a) * (r0 + 4))
    const y = Math.round(c.y + Math.sin(a) * (r0 + 4))
    rect(g, x - 1, y, 3, 1, DW.paleGold)
    rect(g, x, y - 1, 1, 3, DW.paleGold)
    rect(g, x, y, 1, 1, '#ffffff')
  }
}

// ---------------------------------------------------------------- the breach

export interface BreachParams extends SceneSize {
  /** On the name card (the run's name, in the player's language). */
  title: string
  /** The area's picture as a canvas sprite key (loadItemSprite), cracked open; null: the drawn Daybreak field. */
  picture?: string | null
  short?: boolean
}

interface Shard {
  tri: [number, number][]
  cx: number
  cy: number
  col: string
  lit: string
  edge: string
  rel: number
  done: boolean
}

type BreachState = {
  r: Rng
  world: Canvas
  shards: Shard[]
  cracks: [number, number][][]
  rocks: Rock[]
  fx: Particles
  amb: Particles
  shakes: [number, number, number][]
}

/** The area as the breach finds it: its picture covering the stage, or the Daybreak field. */
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
 * The way in: the area darkens in two pulses, a red point tears, cracks race out from it, the area breaks into pixel
 * shards that tumble into the tear, the Distortion World opens behind with a flash and a quake, its rocks drifting,
 * then the name card. `beat('line')` is when the screen shows its line; `short`, the same in half the time. It then
 * holds its end (`hold`): the portal turning, the rocks drifting, until the page takes it away.
 */
export function breachTimeline(p: BreachParams): Timeline<BreachState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.5 : 1
  const T_CRACK = 0.35 * k
  const T_SHARD = 1.1 * k
  const T_OPEN = 1.15 * k
  const T_BOOM = 1.9 * k
  const T_CARD = 2.3 * k
  const hv = h - (p.inset ?? 0)
  const { c, R } = portalSpot(w, hv)
  return {
    id: 'portal-breach',
    // Its end (the open portal turning, the name card) stays on as the backdrop of the way in's pop-up.
    hold: true,
    dur: p.short ? 2.2 : 3.9,
    setup() {
      const r = rng(487)
      const world = worldOf(w, h, p.picture)
      let data: Uint8ClampedArray | null = null
      try {
        data = world.g.getImageData(0, 0, w, h).data
      } catch {
        data = null
      }
      const cs = Math.max(10, Math.round(Math.min(w, h) / 11))
      const shards: Shard[] = []
      const far = Math.hypot(w, h) / 2
      // A grid of corners, the inner ones nudged, so the shards are uneven and still tile the area exactly.
      const nx = Math.ceil(w / cs)
      const ny = Math.ceil(h / cs)
      const corner = Array.from({ length: (nx + 1) * (ny + 1) }, (_, i) => {
        const gx = i % (nx + 1)
        const gy = Math.floor(i / (nx + 1))
        const inner = gx > 0 && gy > 0 && gx < nx && gy < ny
        const j = () => (inner ? r.range(-cs * 0.3, cs * 0.3) : 0)
        return [gx * cs + j(), gy * cs + j()] as [number, number]
      })
      const at = (gx: number, gy: number) => corner[gy * (nx + 1) + gx]!
      for (let gy = 0; gy < ny; gy++)
        for (let gx = 0; gx < nx; gx++) {
          const flip = (gx + gy) % 2 === 0
          const A = at(gx, gy)
          const B = at(gx + 1, gy)
          const C = at(gx + 1, gy + 1)
          const D = at(gx, gy + 1)
          for (const tri of flip
            ? [
                [A, B, C],
                [A, C, D],
              ]
            : [
                [A, B, D],
                [B, C, D],
              ]) {
            const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3
            const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3
            const sx = clamp(Math.round(cx), 0, w - 1)
            const sy = clamp(Math.round(cy), 0, h - 1)
            const i = (sy * w + sx) * 4
            const col = data
              ? `#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`
              : DW.rock
            const dist = Math.hypot(cx - c.x, cy - c.y) / far
            shards.push({
              tri: tri as [number, number][],
              cx,
              cy,
              col,
              lit: lerpHex(col, DW.pale, 0.3),
              edge: lerpHex(col, DW.pale, 0.55),
              rel: T_SHARD + dist * 0.6 * k + r() * 0.12 * k,
              done: false,
            })
          }
        }
      const cracks: [number, number][][] = []
      const n = 9
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2)
        const L = Math.hypot(w, h) * 0.62
        const end: [number, number] = [c.x + Math.cos(a) * L, c.y + Math.sin(a) * L]
        const pts = crackPath(r, c.x, c.y, end[0], end[1])
        cracks.push(pts)
        const j = Math.floor(pts.length * r.range(0.25, 0.6))
        const [bx, by] = pts[j]!
        const b = a + (r() < 0.5 ? -1 : 1) * r.range(0.5, 0.9)
        cracks.push(crackPath(r, bx, by, bx + Math.cos(b) * L * 0.25, by + Math.sin(b) * L * 0.25))
      }
      return {
        r,
        world,
        shards,
        cracks,
        rocks: makeRocks(r, w, h, Math.max(5, Math.round((w * h) / 5000))),
        fx: new Particles(),
        amb: new Particles(),
        shakes: [
          [T_CRACK, 0.8 * k, 1],
          [T_SHARD, 0.7 * k, 2],
          [T_BOOM, 0.9, 3],
        ],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const g = s.world.g
      g.globalCompositeOperation = 'destination-out'
      for (const sh of s.shards)
        if (!sh.done && t >= sh.rel) {
          sh.done = true
          // A pixel bigger than the shard, so no sliver of the area is left along its edges.
          fillTri(
            g,
            sh.tri.map(
              ([x, y]) =>
                [x + Math.sign(x - sh.cx) * 1.5, y + Math.sign(y - sh.cy) * 1.5] as [number, number],
            ),
            '#000',
          )
        }
      g.globalCompositeOperation = 'source-over'
      if (t > T_OPEN) feedPortal(s.amb, s.r, c, R, t > T_BOOM ? 0.7 : 0.3)
      if (t >= T_BOOM && t - dt < T_BOOM)
        for (let i = 0; i < 36; i++) {
          const a = s.r() * Math.PI * 2
          const v = s.r.range(40, 130)
          s.fx.add({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: s.r.range(0.5, 0.9),
            size: s.r.int(1, 2),
            shape: s.r() < 0.5 ? 'star' : 'sq',
            colors: [DW.paleGold, DW.gold, DW.red, DW.blood],
          })
        }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = DW.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(voidBackdrop(w, h), 0, 0)
      drawRocks(g, s.rocks, t, w)
      const open = ease.outBack(span(t, T_OPEN, T_BOOM), 1.4)
      const throb = t > T_BOOM && Math.floor(t * 2) % 2 ? 1 : 0
      drawPortal(g, c.x, c.y, R + throb, t, { open, spin: t < T_BOOM ? 4 : 1.6 })
      s.amb.draw(g)
      g.drawImage(s.world, 0, 0)
      // Two dark pulses over the area before it gives way.
      const dark = Math.max(
        0.6 * Math.sin(Math.PI * span(t, 0.02, 0.22 * k + 0.02)),
        0.6 * Math.sin(Math.PI * span(t, 0.2 * k, 0.4 * k)),
      )
      if (dark > 0) wash(g, DW.deep, dark, 8)
      // The red point where it tears, flickering.
      if (t < T_SHARD + 0.2 && Math.floor(t * 20) % 3) {
        rect(g, c.x - 1, c.y - 1, 3, 3, DW.red)
        rect(g, c.x, c.y, 1, 1, DW.paleGold)
      }
      const ck = ease.outC(span(t, T_CRACK, T_SHARD + 0.1 * k))
      if (ck > 0 && t < T_SHARD + 0.5 * k)
        for (const pts of s.cracks) {
          // A black split with its lit lip under it: red near where it tore, the void's lilac further out.
          const n = Math.max(1, Math.floor(pts.length * ck))
          for (let i = 1; i < n; i++) {
            const [x0, y0] = pts[i - 1]!
            const [x1, y1] = pts[i]!
            line(g, x0 + 1, y0 + 1, x1 + 1, y1 + 1, i < pts.length * 0.3 ? DW.red : DW.lilac)
          }
          for (let i = 1; i < n; i++)
            line(
              g,
              pts[i - 1]![0],
              pts[i - 1]![1],
              pts[i]![0],
              pts[i]![1],
              DW.night,
              i < pts.length * 0.5 ? 2 : 1,
            )
        }
      // The shards tumbling into the tear: pulled to its middle, shrinking, lit and dark by turns.
      for (const sd of s.shards) {
        if (!sd.done) continue
        const q = span(t, sd.rel, sd.rel + 0.55 * k)
        if (q >= 1) continue
        const m = ease.inQ(q)
        const sc = 1 - m * 0.95
        const ox = lerp(sd.cx, c.x, m) - sd.cx
        const oy = lerp(sd.cy, c.y, m) - sd.cy - Math.sin(q * Math.PI) * 6
        const tri = sd.tri.map(
          ([x, y]) => [sd.cx + (x - sd.cx) * sc + ox, sd.cy + (y - sd.cy) * sc + oy] as [number, number],
        )
        // Tumbling: its face catches the void's light every other beat, a lit edge along its top.
        const flip = Math.floor((t - sd.rel) * 12) % 2
        fillTri(g, tri, flip ? sd.lit : sd.col)
        if (flip) line(g, tri[0]![0], tri[0]![1], tri[1]![0], tri[1]![1], sd.edge)
      }
      burstRings(g, c, t, T_BOOM, Math.round(Math.max(w, h) * 0.6), [
        [0, DW.pale],
        [0.14, DW.gold],
        [0.28, DW.red],
      ])
      s.fx.draw(g)
      g.restore()
      if (within(t, T_BOOM, T_BOOM + 0.3))
        screenFlash(g, '#ffffff', 0.75 * (1 - span(t, T_BOOM, T_BOOM + 0.3)))
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nameCard(
          g,
          w,
          Math.round(hv * 0.66),
          span(t, T_CARD, T_CARD + 0.3),
          p.title,
          [],
          span(t, T_CARD + 0.45, T_CARD + 0.8),
        )
    },
    // Skipped (SKIP, motion off, back from the Team screen), it lands on its end without its sounds piling up.
    cues: () =>
      [
        [0.02, () => quiet('legend.pulse')],
        [T_CRACK, () => quiet('portal.breach')],
        [T_SHARD, (hud) => (quiet('legend.shatter'), hud.beat?.('line'))],
        [T_BOOM, () => quiet('legend.pulse')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<BreachState>[],
  }
}

/** A cue's sound, unless the timeline is being skipped to its end. */
export const quiet = (name: Parameters<typeof fxSound>[0]) => !skippingNow() && fxSound(name)

export function crackPath(r: Rng, ax: number, ay: number, bx: number, by: number): [number, number][] {
  return bolt(r, ax, ay, bx, by, 0.22, 5).map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number])
}

const lerpHex = (a: string, b: string, t: number) => {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${A.map((v, i) =>
    Math.round(lerp(v, B[i]!, t))
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`
}

// ---------------------------------------------------------------- the portal, looping

export interface PortalLoop {
  step(t: number, dt: number): void
  draw(g: G, t: number): void
}

/**
 * The portal on a loop (behind the way-in pop-up, on the rules' banner, by a distortion's boons): the void and its
 * drifting rocks (`scene`), the portal turning, motes pulled in, sparks on its rim. `still`: one frame, held.
 */
export function portalLoop(
  w: number,
  h: number,
  { scene = true, still = false }: { scene?: boolean; still?: boolean } = {},
): PortalLoop {
  const r = rng(w * 31 + h)
  const c = { x: Math.round(w / 2), y: Math.round(h / 2) }
  const R = Math.max(6, Math.round(Math.min(w * 0.5, h) * (scene ? 0.3 : 0.36)))
  const rocks = scene ? makeRocks(r, w, h, Math.max(3, Math.round((w * h) / 1500))) : []
  const amb = new Particles()
  // Warmed up, so the motes are already spiralling in on the first frame.
  if (!still)
    for (let i = 0; i < 120; i++) {
      feedPortal(amb, r, c, R, 0.5)
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedPortal(amb, r, c, R, 0.45)
      amb.update(dt)
    },
    draw(g, t) {
      if (scene) g.drawImage(voidBackdrop(w, h), 0, 0)
      else g.clearRect(0, 0, w, h)
      drawRocks(g, rocks, t, w, still)
      drawPortal(g, c.x, c.y, R + (!still && Math.floor(t * 1.25) % 2 ? 1 : 0), still ? 0.4 : t, {
        glowK: scene ? 0.85 : 0.6,
      })
      amb.draw(g)
    },
  }
}

// ---------------------------------------------------------------- a portal closing

export interface CloseParams extends SceneSize {
  short?: boolean
  /** Drawn over the page (no background, no full-screen flash); else on the void. */
  clear?: boolean
}

type CloseState = { r: Rng; fx: Particles; amb: Particles; rocks: Rock[] }

/**
 * A boon picked: the portal throbs once, spins faster, collapses into its middle while its rim breaks into shards that
 * are pulled in after it, a flash, then a gold seal ring turns where it was and fades.
 */
export function closeTimeline(p: CloseParams = {}): Timeline<CloseState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.55 : 1
  const c = { x: Math.round(w / 2), y: Math.round(h / 2) }
  const R = Math.round(Math.min(w, h) * 0.24)
  const T_IN = 0.25 * k
  const T_SHUT = 0.7 * k
  return {
    id: 'portal-close',
    dur: p.short ? 0.9 : 1.6,
    setup: () => {
      const r = rng(17)
      return { r, fx: new Particles(), amb: new Particles(), rocks: p.clear ? [] : makeRocks(r, w, h, 6) }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      if (t < T_IN) feedPortal(s.amb, s.r, c, R, 0.6)
      if (t >= T_IN && t - dt < T_IN)
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2
          s.fx.add({
            x: c.x + Math.cos(a) * R * 1.1,
            y: c.y + Math.sin(a) * R * 1.2,
            vx: -Math.sin(a) * 30,
            vy: Math.cos(a) * 30,
            home: { x: c.x, y: c.y, k: 260 },
            life: 0.8,
            size: 2,
            shape: 'sq',
            colors: [DW.pale, DW.lilac, DW.violet, DW.red],
          })
        }
      if (t >= T_SHUT && t - dt < T_SHUT)
        for (let i = 0; i < 20; i++) {
          const a = s.r() * Math.PI * 2
          const v = s.r.range(30, 90)
          s.fx.add({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 3,
            life: s.r.range(0.4, 0.7),
            size: s.r.int(1, 2),
            shape: 'star',
            colors: ['#ffffff', DW.paleGold, DW.gold],
          })
        }
    },
    draw(g, s, t) {
      if (!p.clear) {
        g.drawImage(voidBackdrop(w, h), 0, 0)
        drawRocks(g, s.rocks, t, w)
      }
      const grow =
        t < T_IN ? 1 + 0.12 * Math.sin(Math.PI * span(t, 0, T_IN)) : 1 - ease.inC(span(t, T_IN, T_SHUT))
      if (t < T_SHUT)
        drawPortal(g, c.x, c.y, Math.max(2, Math.round(R * grow)), t, { spin: t < T_IN ? 3 : 9 })
      s.amb.draw(g)
      s.fx.draw(g)
      if (within(t, T_SHUT, T_SHUT + 0.12)) {
        const gr = Math.round(R * 0.9)
        g.drawImage(glow(gr, '#ffffff', 1.2, 1), c.x - gr, c.y - gr)
      } else if (within(t, T_SHUT + 0.12, T_SHUT + 0.3)) {
        const gr = Math.round(R * 0.7)
        g.drawImage(glow(gr, DW.paleGold, 1.4, 0.8), c.x - gr, c.y - gr)
      }
      if (!p.clear && within(t, T_SHUT, T_SHUT + 0.2))
        screenFlash(g, '#ffffff', 0.5 * (1 - span(t, T_SHUT, T_SHUT + 0.2)))
      seal(g, c, R, t, span(t, T_SHUT, (p.short ? 0.9 : 1.6) - 0.02))
    },
    cues: () =>
      [
        [T_IN, () => fxSound('portal.close')],
        [T_SHUT, (hud) => hud.beat?.('sealed')],
      ] satisfies Cue<CloseState>[],
  }
}

// ---------------------------------------------------------------- the wild Pokémon's distortion (FX lab)

export interface WildGlitchParams extends Fighters {
  short?: boolean
}

type GlitchState = Stage & { amb: Particles }

/**
 * The battle stage with the foe distorted as in a portal run, at the game's rhythm (two bursts in 10 s): its faint
 * rim, its motes, the bursts.
 */
export function wildGlitchTimeline(p: WildGlitchParams): Timeline<GlitchState> {
  return {
    id: 'portal-glitch',
    dur: 10,
    setup: () => Object.assign(new Stage({ ...p, by: 'own' }, 5), { amb: new Particles() }),
    step(s, t, dt) {
      s.step(t, dt)
      s.amb.update(dt)
      if (s.r() < 0.07) emitMote(s.amb, s.r, s.L.foe.x, s.L.foe.y, s.fs.w)
    },
    draw(g, s, t) {
      s.begin(g, t)
      drawAura(g, s.foe, s.L.foe.x, s.L.foe.y)
      const b = burstAt(t, GLITCH_PERIOD, GLITCH_DUR, 3)
      if (b) drawDistorted(g, s.foe, s.L.foe.x, s.L.foe.y, b, p.short)
      else drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y)
      s.amb.draw(g)
      s.drawAttacker(g)
      s.end(g)
    },
    cues: () => [],
  }
}

// ---------------------------------------------------------------- the victory

export interface VictoryParams extends SceneSize {
  /** Shiny Giratina's front sprite key. */
  mon: string
  /** On the name card: its name, and small lines (SHINY, its level). */
  name: string
  subs?: readonly string[]
  short?: boolean
}

type VictoryState = {
  r: Rng
  fx: Particles
  amb: Particles
  rocks: Rock[]
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * Every portal closed: the last one throbs in two dark pulses, shadow tendrils whip out of it, two heartbeats, shiny
 * Giratina's silhouette rises out of it in its aura (red and gold), rays turn behind, a gleam; the reveal with a flash,
 * rings, a roar (`beat('roar')`: the screen plays its cry) and a quake; the shiny sparkle; the portal seals behind it;
 * the name card (`beat('card')`: the screen shows its lines). `short`: no pulses or tendrils, half the time.
 */
export function victoryTimeline(p: VictoryParams): Timeline<VictoryState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const short = !!p.short
  const hv = h - (p.inset ?? 0)
  const { c, R } = portalSpot(w, hv)
  const T_TEND = short ? 0 : 0.85
  const T_SIL = short ? 0.2 : 1.8
  const T_RAYS = short ? 0.5 : 2.3
  const T_REVEAL = short ? 1.0 : 3.1
  const T_SHINY = T_REVEAL + 0.3
  const T_SEAL = T_REVEAL + (short ? 0.5 : 0.9)
  const T_CARD = T_REVEAL + (short ? 0.7 : 1.1)
  const DUR = T_CARD + (short ? 1.4 : 2.0)
  const feet = { x: c.x, y: Math.round(c.y + R * 1.25) }
  const AURA = [DW.paleGold, DW.gold, DW.red, DW.blood] as const
  return {
    id: 'portal-victory',
    dur: DUR,
    setup() {
      const r = rng(4870)
      return {
        r,
        fx: new Particles(),
        amb: new Particles(),
        rocks: makeRocks(r, w, h, Math.max(5, Math.round((w * h) / 5000))),
        rays: canvas(w, h),
        shakes: [[T_REVEAL, 0.9, 3]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (t < T_SEAL) feedPortal(s.amb, r, c, R, 0.5)
      if (t > T_REVEAL && r() < 0.25)
        s.amb.add({
          x: r.range(0, w),
          y: h + 2,
          vy: -r.range(14, 30),
          life: r.range(2, 3.5),
          size: 1,
          shape: 'sq',
          colors: [DW.gold, DW.red, DW.blood, DW.mid],
        })
      if (t >= T_REVEAL && t - dt < T_REVEAL)
        for (let k = 0; k < 44; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 150)
          s.fx.add({
            x: feet.x,
            y: feet.y - 30,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: AURA,
          })
        }
      // The shiny sparkle: two rings of stars a beat apart (moments.ts's hatch).
      for (const [t0, rr] of [
        [T_SHINY, 22],
        [T_SHINY + 0.25, 34],
      ] as const)
        if (t >= t0 && t - dt < t0)
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            s.fx.add({
              x: feet.x + Math.cos(a) * rr * 0.4,
              y: feet.y - 34 + Math.sin(a) * rr * 0.4,
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
      g.fillStyle = DW.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(voidBackdrop(w, h), 0, 0)
      drawRocks(g, s.rocks, t, w)
      let dark = short
        ? 0
        : Math.max(0.7 * Math.sin(Math.PI * span(t, 0.1, 0.35)), 0.7 * Math.sin(Math.PI * span(t, 0.45, 0.7)))
      if (t >= T_SIL && t < T_REVEAL) dark = 0.45
      if (t >= T_REVEAL) dark = lerp(0.45, 0.1, span(t, T_REVEAL, T_REVEAL + 0.6))
      if (dark > 0) wash(g, DW.night, dark, 8)
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          { x: feet.x, y: feet.y - 30 },
          t,
          t > T_REVEAL ? DW.blood : DW.red,
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_REVEAL + 0.4 ? 0.55 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      // The last portal: throbbing, then sealed behind it.
      const pulse = short
        ? 0
        : Math.round(
            R * 0.15 * (Math.sin(Math.PI * span(t, 0.1, 0.35)) + Math.sin(Math.PI * span(t, 0.45, 0.7))),
          )
      const shut = 1 - ease.inC(span(t, T_SEAL - 0.35, T_SEAL))
      if (t < T_SEAL)
        drawPortal(g, c.x, c.y, Math.max(2, Math.round((R + pulse) * shut)), t, {
          spin: t < T_REVEAL ? 2.4 : 6,
        })
      s.amb.draw(g)
      // Shadow tendrils whipping out of the portal (Shadow Force).
      if (!short && t > T_TEND && t < T_REVEAL + 0.2)
        tendrils(g, c, R, t, span(t, T_TEND, T_TEND + 0.7) * (1 - span(t, T_REVEAL - 0.1, T_REVEAL + 0.2)))
      if (!short)
        for (const hb of [1.2, 1.5]) {
          const q = span(t, hb, hb + 0.3)
          if (q > 0 && q < 1) {
            const gr = Math.round(R * 1.1)
            g.drawImage(glow(gr, DW.blood, 1.3, 0.7 * Math.sin(Math.PI * q)), c.x - gr, c.y - gr)
          }
        }
      if (t >= T_SIL) {
        const fh = spriteFrame(p.mon)?.height ?? 64
        if (t < T_REVEAL) {
          // Rising out of the portal: what is still below its middle line shows only inside it.
          const q = ease.outC(span(t, T_SIL, T_REVEAL - 0.15))
          const rise = Math.round((1 - q) * (fh * 0.75))
          g.save()
          g.beginPath()
          g.rect(-10, -10, w + 20, c.y + 10)
          g.ellipse(c.x, c.y, R, R * 1.12, 0, 0, Math.PI * 2)
          g.clip()
          drawSprite(g, p.mon, feet.x, feet.y + rise, {
            sil: '#06020c',
            outline: Math.floor(t * 12) % 3 === 0 ? AURA[0] : AURA[2],
          })
          g.restore()
          const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.6)
          if (gp > 0 && gp < 1) gleam(g, p.mon, feet, rise, gp)
        } else
          drawSprite(g, p.mon, feet.x, feet.y, {
            flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
      }
      burstRings(g, { x: feet.x, y: feet.y - 30 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, DW.paleGold],
        [0.14, DW.red],
      ])
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1) {
          const rr = Math.round(10 + 40 * q)
          g.drawImage(ring(rr, 2, '#ffffff', 1 - q), feet.x - 18 - rr - 1, feet.y - 50 - rr - 1)
        }
      }
      seal(g, c, R, t, span(t, T_SEAL, T_SEAL + 1.0))
      s.fx.draw(g)
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.8 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
      bars(g, w, h, Math.round(Math.min(16, h * 0.08) * ease.outC(span(t, T_CARD - 0.15, T_CARD + 0.1))))
      if (t >= T_CARD)
        nameCard(
          g,
          w,
          Math.min(hv - 46, feet.y + 4),
          span(t, T_CARD, T_CARD + 0.28),
          p.name,
          p.subs ?? [],
          span(t, T_CARD + 0.4, T_CARD + 0.75),
        )
    },
    cues: () =>
      [
        ...(short
          ? []
          : ([
              [0.1, () => fxSound('legend.pulse')],
              [0.45, () => fxSound('legend.pulse')],
              [1.2, () => fxSound('legend.heart')],
              [1.5, () => fxSound('legend.heart')],
            ] satisfies Cue<VictoryState>[])),
        [T_REVEAL, (hud) => (fxSound('legend.roar'), hud.beat?.('roar'))],
        [T_SHINY, () => fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => fxSound('hatch.shiny', 1)],
        [T_SEAL, () => fxSound('portal.close')],
        [T_CARD, (hud) => hud.beat?.('card')],
      ] satisfies Cue<VictoryState>[],
  }
}

/** Six shadow tendrils out of the portal: black, wavering, red at the tips, reaching out to `k` of their length. */
export function tendrils(g: G, c: Point, R: number, t: number, k: number) {
  if (k <= 0) return
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.3
    const len = R * (1.4 + (i % 3) * 0.3) * k
    const pts: [number, number][] = []
    const n = 12
    for (let j = 0; j <= n; j++) {
      const q = j / n
      const a = a0 + Math.sin(t * 5 + i * 1.7 + q * 4) * 0.35 * q
      const d = R * 0.6 + len * q
      pts.push([c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 1.1])
    }
    for (let j = 1; j <= n; j++) {
      const wdt = Math.max(1, Math.round(4 * (1 - j / n)) + 1)
      line(g, pts[j - 1]![0], pts[j - 1]![1], pts[j]![0], pts[j]![1], j > n - 3 ? DW.red : '#06020c', wdt)
    }
  }
}
