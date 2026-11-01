// The Stairway of Plates (docs/61 §4.5, docs/15 §49): the Hall of Origin's portal run, Distortion World's scenes
// (portal.ts) redrawn in light instead of distortion. A white-gold sky, a stairway of light rising to Arceus's wheel,
// an altar ending each landing (the wheel on a pedestal, the seventeen Plates' colours turning round it). The breach
// becomes the area dissolving upwards into light to show the stairway; a portal closing becomes an altar lit; the
// victory is shiny Arceus coming down the stairs, then the Judgment (seventeen beams of the Plates' colours). The same
// timings, sizes, cues and motion levels as portal.ts, so the screens swap one for the other.
import { fxSound } from '@/audio/sfx'
import { POKE_TYPES } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  glow,
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
import { drawSprite, spriteFrame, spriteSize } from '../sprites'
import { H, Stage, W, screenFlash, screenShake, within, type Cue, type Timeline } from '../timeline'
import type { FormParams } from './forms'
import { drawRays, gleam } from './legend'
import {
  burstRings,
  crackPath,
  fillTri,
  nameCard,
  quiet,
  seal,
  type BreachParams,
  type CardColors,
  type CloseParams,
  type PortalLoop,
  type VictoryParams,
} from './portal'

/** The Hall of Origin's palette: a white-gold sky, pale stone, Arceus's gold, an ink of dark gold for edges. */
export const PL = {
  ink: '#4a3410',
  deep: '#8a6420',
  gold: '#e3a92f',
  goldLit: '#ffc94a',
  pale: '#ffe9a3',
  cream: '#fff6dc',
  white: '#ffffff',
  sky: ['#fffdf6', '#fff6dc', '#ffefc4', '#ffe2a0', '#f6cf7e'] as readonly string[],
  stone: '#f6ecd2',
  stoneLit: '#fffaf0',
  stoneDark: '#dcc595',
  riser: '#caa968',
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

/** The seventeen Plates' colours (every type but Normal), in the types' order: the gems round the wheel. */
const PLATE_COLORS = POKE_TYPES.filter((t) => t !== 'normal').map((t) => typeColor(t))

/** Where the wheel at the top of the stairway stands on a stage of w × h, and how big it is. */
export const wheelSpot = (w: number, h: number) => ({
  c: { x: Math.round(w / 2), y: Math.round(h * 0.24) },
  R: Math.max(8, Math.round(Math.min(w, h * 1.2) * 0.13)),
})

// ---------------------------------------------------------------- the sky and the stairway

const skyRow = (x: number, y: number, h: number) => {
  const cols = PL.sky
  const t = clamp(y / Math.max(1, h - 1)) * (cols.length - 1)
  const i = Math.floor(t)
  return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
}

/** The sky: white at the top to gold at the bottom, ordered-dithered, long pale clouds, a few specks of light. */
export const skyBackdrop = (w: number, h: number): Canvas =>
  cached(`pl-sky|${w}|${h}`, () => {
    const c = shade(w, h, (x, y) => skyRow(x, y, h))
    const r = rng(w * 5 + h * 11)
    const n = Math.max(3, Math.round((w * h) / 4000))
    for (let i = 0; i < n; i++) {
      const cx = r.int(0, w)
      const cy = r.int(Math.round(h * 0.1), Math.round(h * 0.8))
      const cw = r.int(18, 46)
      for (let j = 0; j < 3; j++) {
        const hw = Math.round((cw / 2) * (1 - j * 0.3))
        rect(c.g, cx - hw, cy + j, hw * 2, 1, j ? PL.cream : PL.white)
      }
    }
    for (let i = 0; i < (w * h) / 400; i++)
      rect(c.g, r.int(0, w), r.int(0, h), 1, 1, r() < 0.7 ? PL.white : PL.pale)
    return c
  })

export interface Stairway {
  /** Its foot (bottom middle) and its top (where the wheel stands). */
  base: number
  top: number
  /** Half its width at the foot and at the top. */
  wide: number
  narrow: number
  /** Landings, each three steps, each ended by an altar. */
  landings: number
}

/** The stairway of a stage of w × h (its words kept clear at the bottom: `hv` the visible height). */
export const stairwayOf = (w: number, hv: number, landings = 10): Stairway => ({
  base: hv + 2,
  top: Math.round(hv * 0.3),
  wide: Math.round(w * 0.36),
  narrow: Math.max(4, Math.round(w * 0.05)),
  landings,
})

/** Where step u (0: the foot, 1: the top) is: its row and half-width, in perspective. */
const stepAt = (s: Stairway, u: number) => ({
  y: s.top + (s.base - s.top) * Math.pow(1 - u, 1.35),
  hw: lerp(s.wide, s.narrow, Math.pow(u, 0.75)),
})

/**
 * The stairway of light, far steps first: pale treads with a lit front edge, darker risers, gold rails along its sides
 * with a glint running up them, and an altar on every landing (`lit` of them glowing white). `k` (0..1) draws it rising
 * from its foot (the breach).
 */
export function drawStairway(g: G, cx: number, s: Stairway, t: number, lit = 0, k = 1) {
  if (k <= 0) return
  const steps = s.landings * 3
  const shown = Math.ceil(steps * k)
  for (let i = shown - 1; i >= 0; i--) {
    const a = stepAt(s, i / steps)
    const b = stepAt(s, (i + 1) / steps)
    const y0 = Math.round(b.y)
    const y1 = Math.round(a.y)
    const rows = Math.max(1, y1 - y0)
    for (let y = y0; y < y1; y++) {
      const q = (y - y0) / rows
      const hw = Math.round(lerp(b.hw, a.hw, q))
      const tread = q < 0.45
      rect(
        g,
        cx - hw,
        y,
        hw * 2 + 1,
        1,
        y === y0 ? PL.stoneLit : tread ? PL.stone : q > 0.85 ? PL.riser : PL.stoneDark,
      )
      // The rails: gold, a glint running up them.
      const glint = Math.floor(t * 6 - i * 0.5) % 12 === 0
      rect(g, cx - hw - 1, y, 2, 1, glint ? PL.white : PL.gold)
      rect(g, cx + hw, y, 2, 1, glint ? PL.white : PL.gold)
    }
    // A landing every three steps, its altar in the middle of the tread.
    if ((i + 1) % 3 === 0) {
      const n = (i + 1) / 3
      const ar = Math.max(1, Math.round(b.hw * 0.12))
      const ay = Math.round(lerp(b.y, a.y, 0.25))
      const on = n <= lit
      rect(g, cx - ar, ay - ar, ar * 2 + 1, ar + 1, on ? PL.goldLit : PL.riser)
      if (on) {
        const gr = ar * 3 + 1
        g.drawImage(glow(gr, PL.white, 1.6, 0.9), cx - gr, ay - ar - gr)
      } else rect(g, cx, ay - ar - 1, 1, 1, PL.gold)
    }
  }
}

// ---------------------------------------------------------------- the wheel (an altar's light)

const bufs = new Map<number, { cv: Canvas; img: ImageData }>()
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/**
 * Arceus's wheel of light, centre (cx, cy), radius R (portal.ts's drawPortal, in light): a white heart through pale to
 * gold, rays turning slowly in it, a dashed gold rim, four gold spikes turning round it, the seventeen Plates' gems
 * turning the other way, a dithered pale glow. `open` grows it from a point (0) to whole (1); `spin` how fast it turns.
 */
export function drawWheel(
  g: G,
  cx: number,
  cy: number,
  R: number,
  t: number,
  { open = 1, spin = 0.5, glowK = 0.85 }: { open?: number; spin?: number; glowK?: number } = {},
) {
  if (open <= 0.02 || R < 2) return
  const r = Math.max(1, R * open)
  const G0 = Math.ceil(r * 1.8)
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
  const put = (i: number, c: string) => {
    const [rr, gg, bb] = hex(c)
    d8[i] = rr!
    d8[i + 1] = gg!
    d8[i + 2] = bb!
    d8[i + 3] = 255
  }
  const ramp = [PL.white, PL.cream, PL.pale, PL.goldLit] as const
  const gems = PLATE_COLORS.length
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - G0
      const dy = y - G0
      const d = Math.hypot(dx, dy) / r
      const a = Math.atan2(dy, dx)
      const i = (y * S + x) * 4
      const bx = bayer(px0 + x, py0 + y)
      if (d < 1) {
        if (d > 0.86) {
          const dash = ((Math.floor((a / (Math.PI * 2)) * 20 + t * 2) % 2) + 2) % 2 === 0
          put(i, d > 0.94 ? (dash ? PL.gold : PL.deep) : PL.goldLit)
          continue
        }
        const ray = Math.sin((a - t * spin) * 8)
        const v = clamp(d * 1.1 - 0.15 * ray) * (ramp.length - 1)
        const k = Math.floor(v)
        put(i, v - k > bx ? ramp[Math.min(ramp.length - 1, k + 1)]! : ramp[k]!)
        continue
      }
      // Four gold spikes turning round it (Arceus's cross-wheel), pointed at their ends.
      const sa = (((a - t * spin * 0.5) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
      const off = Math.min(sa, Math.PI / 2 - sa)
      if (d < 1.45 && off < 0.16 * (1.45 - d) * 2.4 && open > 0.5) {
        put(i, off < 0.05 ? PL.white : PL.gold)
        continue
      }
      // The Plates' gems, the other way round.
      if (d > 1.1 && d < 1.24 && open > 0.6) {
        const ga = (((a + t * spin * 0.7) / (Math.PI * 2)) * gems + gems) % gems
        const gi = Math.floor(ga)
        if (ga - gi < 0.45) {
          put(i, PLATE_COLORS[gi]!)
          continue
        }
      }
      if (d < 1.8) {
        const q = Math.pow((1.8 - d) / 0.8, 1.6) * glowK
        if (q > bx) put(i, d < 1.2 ? PL.cream : d < 1.5 ? PL.pale : PL.goldLit)
      }
    }
  b.cv.g.putImageData(b.img, 0, 0)
  g.drawImage(b.cv, px0, py0)
}

/** An altar: a two-tier pedestal of pale stone with gold rims, the wheel of light above it. */
export function drawAltar(
  g: G,
  cx: number,
  cy: number,
  R: number,
  t: number,
  o: Parameters<typeof drawWheel>[5] = {},
) {
  const pw = Math.max(3, Math.round(R * 0.7))
  const top = Math.round(cy + R * 1.05)
  rect(g, cx - pw, top, pw * 2 + 1, 2, PL.gold)
  rect(g, cx - pw + 1, top + 2, pw * 2 - 1, Math.max(2, Math.round(R * 0.35)), PL.stone)
  const low = top + 2 + Math.max(2, Math.round(R * 0.35))
  rect(g, cx - pw - 2, low, pw * 2 + 5, 2, PL.gold)
  rect(g, cx - pw - 1, low + 2, pw * 2 + 3, Math.max(1, Math.round(R * 0.2)), PL.stoneDark)
  drawWheel(g, cx, cy, R, t, o)
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

/** Letterbox bars in dark gold. */
function bars(g: G, w: number, h: number, n: number) {
  if (n <= 0) return
  rect(g, 0, 0, w, n, PL.ink)
  rect(g, 0, h - n, w, n, PL.ink)
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
  fx: Particles
  amb: Particles
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

const lerpHex = (a: string, b: string, t: number) => {
  const A = hex(a)
  const B = hex(b)
  return `#${A.map((v, i) =>
    Math.round(lerp(v, B[i]!, t))
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`
}

/**
 * The way in (breachTimeline's, in light): the area brightens in two white pulses, a point of gold light opens at the
 * top, rays of light race out from it, the area comes apart in pieces that rise and whiten into light, and behind
 * them the sky and the stairway rising to the wheel; a flash, rings, the name card. It holds its end (the wheel
 * turning, light rising) until the page takes it away. `short`: half the time.
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
  const { c, R } = wheelSpot(w, hv)
  const stairs = stairwayOf(w, hv)
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
        fx: new Particles(),
        amb: new Particles(),
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
      if (t > T_OPEN) feedLight(s.amb, s.r, c, R, t > T_BOOM ? 0.7 : 0.35)
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
            colors: [PL.white, PL.pale, PL.goldLit, PL.gold],
          })
        }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = PL.sky[0]!
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(skyBackdrop(w, h), 0, 0)
      drawStairway(g, c.x, stairs, t, 0, ease.outC(span(t, T_LIFT, T_BOOM + 0.3 * k)))
      drawWheel(g, c.x, c.y, R, t, {
        open: ease.outBack(span(t, T_OPEN, T_BOOM), 1.4),
        spin: t < T_BOOM ? 2 : 0.5,
      })
      s.amb.draw(g)
      g.drawImage(s.world, 0, 0)
      // Two white pulses over the area before it gives way.
      const white = Math.max(
        0.5 * Math.sin(Math.PI * span(t, 0.02, 0.22 * k + 0.02)),
        0.5 * Math.sin(Math.PI * span(t, 0.2 * k, 0.4 * k)),
      )
      if (white > 0) wash(g, PL.white, white, 8)
      if (t < T_LIFT + 0.2 && Math.floor(t * 20) % 3) {
        rect(g, c.x - 1, c.y - 1, 3, 3, PL.goldLit)
        rect(g, c.x, c.y, 1, 1, PL.white)
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
      // The pieces rising and whitening into light.
      for (const b of s.bits) {
        if (!b.done) continue
        const q = span(t, b.rel, b.rel + 0.6 * k)
        if (q >= 1) continue
        const sc = 1 - ease.inQ(q) * 0.8
        const oy = -ease.inQ(q) * 26
        const tri = b.tri.map(
          ([x, y]) => [b.cx + (x - b.cx) * sc, b.cy + (y - b.cy) * sc + oy] as [number, number],
        )
        fillTri(g, tri, lerpHex(b.col, PL.white, Math.min(1, q * 1.6)))
      }
      burstRings(g, c, t, T_BOOM, Math.round(Math.max(w, h) * 0.6), [
        [0, PL.white],
        [0.14, PL.goldLit],
        [0.28, PL.gold],
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

// ---------------------------------------------------------------- the altar, looping

/**
 * The altar on a loop (the rules' banner, the way-in pop-up on its own, by an altar's blessings): the sky and the
 * stairway (`scene`), the altar's wheel turning, light rising. `still`: one frame, held.
 */
export function altarLoop(
  w: number,
  h: number,
  { scene = true, still = false }: { scene?: boolean; still?: boolean } = {},
): PortalLoop {
  const r = rng(w * 37 + h)
  const R = Math.max(5, Math.round(Math.min(w * 0.5, h) * (scene ? 0.22 : 0.3)))
  const c = { x: Math.round(w / 2), y: Math.round(scene ? h * 0.42 : h / 2 - R * 0.25) }
  const stairs = stairwayOf(w, h)
  const amb = new Particles()
  if (!still)
    for (let i = 0; i < 120; i++) {
      feedLight(amb, r, c, R, 0.5)
      amb.update(1 / 30)
    }
  return {
    step(_t, dt) {
      if (still) return
      feedLight(amb, r, c, R, 0.45)
      amb.update(dt)
    },
    draw(g, t) {
      if (scene) {
        g.drawImage(skyBackdrop(w, h), 0, 0)
        drawStairway(g, c.x, stairs, still ? 0 : t)
      } else g.clearRect(0, 0, w, h)
      drawAltar(g, c.x, c.y, R + (!still && Math.floor(t * 1.25) % 2 ? 1 : 0), still ? 0.4 : t, {
        glowK: scene ? 0.85 : 0.6,
      })
      amb.draw(g)
    },
  }
}

// ---------------------------------------------------------------- an altar lit

type LitState = { r: Rng; fx: Particles; amb: Particles }

/**
 * A blessing picked (closeTimeline's, in light): the altar's wheel swells once, light is drawn into it and it turns
 * faster, it shrinks to a point, a white flash, then the gold seal ring turns where it was and fades.
 */
export function altarLitTimeline(p: CloseParams = {}): Timeline<LitState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const k = p.short ? 0.55 : 1
  const c = { x: Math.round(w / 2), y: Math.round(h / 2) }
  const R = Math.round(Math.min(w, h) * 0.22)
  const T_IN = 0.25 * k
  const T_SHUT = 0.7 * k
  return {
    id: 'plates-altar',
    dur: p.short ? 0.9 : 1.6,
    setup: () => ({ r: rng(19), fx: new Particles(), amb: new Particles() }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      if (t < T_SHUT) feedLight(s.amb, s.r, c, R, 0.6)
      if (t >= T_IN && t - dt < T_IN)
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2
          s.fx.add({
            x: c.x + Math.cos(a) * R * 1.6,
            y: c.y + Math.sin(a) * R * 1.6,
            home: { x: c.x, y: c.y, k: 260 },
            life: 0.8,
            size: 2,
            shape: 'sq',
            colors: [PL.white, PL.pale, PLATE_COLORS[i % PLATE_COLORS.length]!, PL.gold],
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
            colors: ['#ffffff', PL.pale, PL.goldLit],
          })
        }
    },
    draw(g, s, t) {
      if (!p.clear) {
        g.drawImage(skyBackdrop(w, h), 0, 0)
        drawStairway(g, c.x, stairwayOf(w, h), t)
      }
      const grow =
        t < T_IN ? 1 + 0.12 * Math.sin(Math.PI * span(t, 0, T_IN)) : 1 - ease.inC(span(t, T_IN, T_SHUT))
      if (t < T_SHUT) drawWheel(g, c.x, c.y, Math.max(2, Math.round(R * grow)), t, { spin: t < T_IN ? 1 : 5 })
      s.amb.draw(g)
      s.fx.draw(g)
      if (within(t, T_SHUT, T_SHUT + 0.12)) {
        const gr = Math.round(R * 0.9)
        g.drawImage(glow(gr, '#ffffff', 1.2, 1), c.x - gr, c.y - gr)
      } else if (within(t, T_SHUT + 0.12, T_SHUT + 0.3)) {
        const gr = Math.round(R * 0.7)
        g.drawImage(glow(gr, PL.pale, 1.4, 0.8), c.x - gr, c.y - gr)
      }
      if (!p.clear && within(t, T_SHUT, T_SHUT + 0.2))
        screenFlash(g, '#ffffff', 0.5 * (1 - span(t, T_SHUT, T_SHUT + 0.2)))
      seal(g, c, R, t, span(t, T_SHUT, (p.short ? 0.9 : 1.6) - 0.02))
    },
    cues: () =>
      [
        [T_IN, () => fxSound('portal.close')],
        [T_SHUT, (hud) => hud.beat?.('sealed')],
      ] satisfies Cue<LitState>[],
  }
}

// ---------------------------------------------------------------- the victory: Arceus comes down

type DescentState = {
  r: Rng
  fx: Particles
  amb: Particles
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * The last altar lit (victoryTimeline's, in light): the stairway glows whole, the wheel at its top throbs in two white
 * pulses, rays turn behind it, shiny Arceus's silhouette appears in the wheel and comes down the stairs growing, in a
 * flickering white-and-gold outline, a gleam; the reveal at the foot (a flash, rings, the roar: `beat('roar')`, a
 * quake); the Judgment: seventeen beams of the Plates' colours falling round it; the shiny sparkle; the name card
 * (`beat('card')`). `short`: no pulses, half the time.
 */
export function descentTimeline(p: VictoryParams): Timeline<DescentState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const short = !!p.short
  const hv = h - (p.inset ?? 0)
  const { c, R } = wheelSpot(w, hv)
  const stairs = stairwayOf(w, hv)
  const T_SIL = short ? 0.2 : 1.2
  const T_RAYS = short ? 0.4 : 1.6
  const T_REVEAL = short ? 1.0 : 3.1
  const T_JUDGE = T_REVEAL + 0.15
  const T_SHINY = T_REVEAL + 0.3
  const T_CARD = T_REVEAL + (short ? 0.7 : 1.1)
  const DUR = T_CARD + (short ? 1.4 : 2.0)
  const feet = { x: c.x, y: Math.round(hv * 0.82) }
  const AURA = [PL.white, PL.pale, PL.goldLit, PL.gold] as const
  // The Judgment's beams: one per Plate, where and when each falls.
  const beams = PLATE_COLORS.map((col, i) => {
    const r = rng(i * 17 + 3)
    return { col, x: Math.round(r.range(w * 0.06, w * 0.94)), d: r.range(0, 0.45) }
  })
  return {
    id: 'plates-victory',
    dur: DUR,
    setup() {
      return {
        r: rng(4930),
        fx: new Particles(),
        amb: new Particles(),
        rays: canvas(w, h),
        shakes: [[T_REVEAL, 0.9, 3]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      feedLight(s.amb, r, c, R, 0.5)
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
            colors: k % 3 ? AURA : [PLATE_COLORS[k % PLATE_COLORS.length]!, PL.white],
          })
        }
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
      g.fillStyle = PL.sky[0]!
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(skyBackdrop(w, h), 0, 0)
      drawStairway(g, c.x, stairs, t, stairs.landings)
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          t < T_REVEAL ? c : { x: feet.x, y: feet.y - 30 },
          t,
          PL.goldLit,
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_REVEAL + 0.4 ? 0.5 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      const pulse = short
        ? 0
        : Math.round(
            R * 0.15 * (Math.sin(Math.PI * span(t, 0.1, 0.35)) + Math.sin(Math.PI * span(t, 0.45, 0.7))),
          )
      drawWheel(g, c.x, c.y, R + pulse, t, { spin: t < T_REVEAL ? 1.2 : 0.5 })
      if (!short) {
        const white = Math.max(
          0.5 * Math.sin(Math.PI * span(t, 0.1, 0.35)),
          0.5 * Math.sin(Math.PI * span(t, 0.45, 0.7)),
        )
        if (white > 0) wash(g, PL.white, white, 8)
      }
      s.amb.draw(g)
      if (t >= T_SIL) {
        if (t < T_REVEAL) {
          // Down the stairs from the wheel to their foot, growing as it comes nearer.
          const q = ease.ioQ(span(t, T_SIL, T_REVEAL - 0.1))
          const y = lerp(c.y + R * 0.6, feet.y, q)
          const sc = lerp(0.3, 1, q)
          drawSprite(g, p.mon, feet.x, Math.round(y), {
            sx: sc,
            sy: sc,
            sil: '#fffaf0',
            outline: Math.floor(t * 12) % 3 === 0 ? PL.white : PL.gold,
          })
          const gp = span(t, T_REVEAL - 0.6, T_REVEAL - 0.2)
          if (gp > 0 && gp < 1) gleam(g, p.mon, feet, 0, gp)
        } else
          drawSprite(g, p.mon, feet.x, feet.y, {
            flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4),
            outline: Math.floor(t * 8) % 2 ? PL.goldLit : PL.white,
          })
      }
      // The Judgment: a beam of each Plate's colour falling from the sky round it.
      for (const b of beams) {
        const q = span(t, T_JUDGE + b.d, T_JUDGE + b.d + 0.35)
        if (q <= 0 || q >= 1) continue
        const end = Math.round(lerp(0, hv, ease.outC(Math.min(1, q * 2))))
        const wd = q < 0.5 ? 3 : Math.max(1, Math.round(3 * (1 - q) * 2))
        rect(g, b.x - (wd >> 1), 0, wd, end, b.col)
        rect(g, b.x, 0, 1, end, PL.white)
        if (q > 0.45) g.drawImage(ring(4, 2, b.col, 1 - q), b.x - 5, end - 5)
      }
      burstRings(g, { x: feet.x, y: feet.y - 30 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, PL.white],
        [0.14, PL.goldLit],
      ])
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

/** When the Plate touches it: the screen's words (its line, the banner) land here. */
export const PLATE_CONTACT = 0.75

/**
 * A raid's Arceus taking its bar's Plate (docs/61 §4.5), its own short effect: a Plate (a tablet of the new type's
 * colour, gold-rimmed) falls out of the sky turning, it touches Arceus: a flash of that colour, rings in it and gold,
 * the new form, motes of its colour rising off it. Short motion: a flash and the new sprite.
 */
export function plateTimeline(p: FormParams): Timeline<Stage> {
  const T = p.short ? 0.25 : PLATE_CONTACT
  const DUR = T + (p.short ? 0.9 : 1.1)
  const col = typeColor(p.die)
  const at = (s: Stage) => (p.side === 'own' ? s.L.own : s.L.foe)
  // The changing side, with its own key and look.
  const draw = (g: G, s: Stage, key: string, o: Parameters<typeof drawSprite>[4] = {}) => {
    const L = at(s)
    drawSprite(g, key, L.x, L.y, o)
  }
  // The side that doesn't change, as it is.
  const other = (g: G, s: Stage) =>
    p.side === 'own' ? drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y) : drawSprite(g, p.own, s.L.own.x, s.L.own.y)
  return {
    id: p.short ? 'plate-short' : 'plate',
    dur: DUR,
    setup: () => {
      const s = new Stage({ own: p.own, foe: p.foe }, 493)
      if (!p.short) s.screenShakes.push([T, 0.4, 2])
      return s
    },
    step(s, t, dt) {
      if (!s.step(t, dt) || t < T || t > DUR - 0.3 || s.r() > dt * 24) return
      const L = at(s)
      const size = spriteSize(p.to)
      s.fx.add({
        x: L.x + s.r.range(-size.w * 0.4, size.w * 0.4),
        y: L.y - s.r.range(0, size.h * 0.8),
        vy: -s.r.range(10, 22),
        life: s.r.range(0.5, 0.9),
        colors: ['#ffffff', col, PL.goldLit],
      })
    },
    draw(g, s, t) {
      s.begin(g, t)
      const L = at(s)
      // The far side first, so the near one stays in front.
      if (p.side === 'own') other(g, s)
      const size = spriteSize(t < T ? p.from : p.to)
      const c = { x: L.x, y: Math.round(L.y - size.h / 2) }
      if (p.short) {
        const flash = t < T ? span(t, 0, T) : 1 - span(t, T, T + 0.35)
        draw(g, s, t < T ? p.from : p.to, { flash })
      } else if (t < T) {
        draw(g, s, p.from, { outline: Math.floor(t * 10) % 2 ? col : undefined })
        // The Plate falling, turning (its width stepping as it spins), a trail of its colour.
        const q = ease.inQ(span(t, 0.05, T))
        const py = Math.round(lerp(-12, c.y, q))
        const pw = [6, 4, 1, 4][Math.floor(t * 12) % 4]!
        rect(g, c.x - pw, py - 5, pw * 2 + 1, 10, PL.gold)
        if (pw > 1) rect(g, c.x - pw + 1, py - 4, pw * 2 - 1, 8, col)
        rect(g, c.x, py - 4, 1, 2, PL.white)
        for (let k = 1; k < 5; k++) rect(g, c.x, py - 6 - k * 4, 1, 2, k % 2 ? col : PL.pale)
      } else {
        burstRings(g, c, t, T, 60, [
          [0, '#ffffff'],
          [0.1, col],
          [0.2, PL.goldLit],
        ])
        draw(g, s, p.to, {
          flash: 1 - span(t, T, T + 0.3),
          outline: Math.floor(t * 8) % 2 && t < DUR - 0.4 ? col : undefined,
        })
        if (within(t, T, T + 0.1)) screenFlash(g, col, 0.5)
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
