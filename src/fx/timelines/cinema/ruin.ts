// The Treasures of Ruin's raid entrances (docs/53): one shrine, four lands. Each sleeps in its sealed shrine (a stone
// hall, a tiled roof, two doors bound by purple chains crossing over a seal) in its own country: Wo-Chien's grass,
// Chien-Pao's snow, Ting-Lu's badlands, Chi-Yu's black lava rock. Eight stakes stand round it in its colour; one by one
// they are pulled, each going up as a beam of its light while the chains flare. The seal fights back: the chains
// strain and glow, its ruinous aura seeps from under the doors, the sky darkens. The chains snap, links flying, the
// seal shatters and the doors burst open. Then each its own ruin:
// - Wo-Chien: the Tablets of Ruin pour out of the dark and whirl round the shrine while the grass withers, a wave of
//   rot spreading over the whole land.
// - Chien-Pao: a freezing blast, then the Sword of Ruin falls point first into the ground, ice spiking out from it;
//   one slash cuts the screen in two, and the sword shatters.
// - Ting-Lu: the earth heaves, cracking out from the door, slabs tilting up, dust jetting; the Vessel of Ruin rises
//   out of the ground and bursts.
// - Chi-Yu: the Beads of Ruin fly out and circle the shrine, drawing a ring of fire on the ground, faster and faster,
//   then spiral in and erupt.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  mix,
  pattern,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, within } from '../../timeline'
import { chain, groundRing, moon, q4, raidScene, ridge, stars, type Base, type Ctx } from './gen9kit'
import {
  burstRing,
  dGradient,
  drawShards,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Cinema,
  type Shard,
} from './kit'

/** The stakes pulled, quickening; alternate sides, far ones first. */
const STAKES = [0.6, 0.86, 1.1, 1.32, 1.52, 1.7, 1.86, 2.0] as const
const T_STRAIN = 2.15
const T_BREAK = 3.1
const REVEAL = 4.6

const CHAIN = { dark: '#3a1a5a', lit: '#a86ae0', glow: '#c87aff' }

type Kind = 'grass' | 'snow' | 'badlands' | 'lava'

interface Look {
  kind: Kind
  stake: string
  /** Its ruinous aura: smoke from light to dark. */
  fog: readonly [string, string, string]
  sky: readonly string[]
  far: string
  near: string
  ground: readonly [string, string, string]
  stone: { lit: string; mid: string; dark: string; roof: string }
  /** The dark inside the shrine, lit by it. */
  inside: string
  /** Grass blades: far, near, tip. */
  blades?: readonly [string, string, string]
}

/** One thing flying round (a tablet, a bead): its own phase, height and size. */
interface Item {
  a: number
  y: number
  r: number
  s: number
  spin: number
}

type X = {
  sky: Canvas
  land: Canvas
  shrine: Canvas
  wither: Canvas | null
  vessel: Canvas | null
  links: Shard[]
  shards: Shard[]
  items: Item[]
  cracks: [number, number][][]
  slash: [number, number][]
  stakes: { x: number; y: number; s: number }[]
}

interface Sig {
  setup?(c: Ctx, r: Rng, s: X): void
  step?(c: Ctx, s: Base & X, t: number, dt: number): void
  /** Over the open shrine, behind it. */
  back?(g: G, c: Ctx, s: Base & X, t: number): void
  /** Before it, over the particles. */
  front?(g: G, c: Ctx, s: Base & X, t: number): void
  shakes?: (c: Ctx) => [number, number, number][]
  sounds: readonly (readonly [number, () => void])[]
}

/** The shrine's measures on this screen: its door behind where it will stand. */
function layout(c: Ctx) {
  const horizon = Math.round(c.h * 0.46)
  const doorW = Math.round(Math.max(40, Math.min(c.w * 0.56, c.sz.w + 18)))
  const doorH = Math.round(Math.max(44, Math.min(c.sz.h + 10, c.feet - c.h * 0.26)))
  const pw = Math.max(6, Math.round(doorW * 0.12))
  const base = c.feet + 2
  return {
    horizon,
    doorW,
    doorH,
    pw,
    base,
    top: base - doorH,
    x0: c.cx - (doorW >> 1),
    x1: c.cx - (doorW >> 1) + doorW,
  }
}

/** The land behind and round the shrine, drawn once. */
function landscape(c: Ctx, look: Look): Canvas {
  const { w, h } = c
  const L = layout(c)
  const cv = canvas(w, h)
  const g = cv.g
  const r = rng(c.w * 7 + look.kind.length)
  const tops = ridge(
    g,
    w,
    L.horizon - 6,
    c.h * 0.09,
    look.far,
    3 + look.kind.length,
    h,
    look.kind === 'snow' ? 0.8 : 0.4,
  )
  // Snow on the far peaks: their tops white.
  if (look.kind === 'snow') tops.forEach((y, x) => rect(g, x, y, 1, 3 + ((x * 5) % 3), '#d8e4f0'))
  if (look.kind === 'lava') {
    // A volcano behind, its crater glowing.
    const vx = Math.round(w * 0.78)
    const vt = Math.round(L.horizon - c.h * 0.2)
    tri(g, vx - c.h * 0.3, L.horizon, vx + c.h * 0.3, L.horizon, vx, vt, '#1a0a0a')
    rect(g, vx - 5, vt, 10, 2, '#ff6a1e')
    rect(g, vx - 3, vt + 2, 6, 1, '#a8281a')
  }
  if (look.kind === 'badlands')
    // Mesas, flat-topped, banded.
    for (const [f, wd, ht] of [
      [0.15, 0.22, 0.12],
      [0.82, 0.3, 0.09],
    ] as const) {
      const x = Math.round(w * f)
      const hw = Math.round(w * wd * 0.5)
      const top = Math.round(L.horizon - c.h * ht)
      for (let y = top; y < L.horizon; y++) {
        const k = (y - top) / (L.horizon - top)
        const ww = Math.round(hw * (0.7 + 0.3 * k))
        rect(g, x - ww, y, ww * 2, 1, (y - top) % 6 < 2 ? '#4a2a18' : '#3a1e10')
      }
      rect(g, x - Math.round(hw * 0.7), top, Math.round(hw * 1.4), 1, '#8a5a2a')
    }
  ridge(g, w, L.horizon + 2, c.h * 0.04, look.near, 9 + look.kind.length, h, 0.3)
  // The ground: its gradient, then its texture.
  g.drawImage(dGradient(w, h - L.horizon, look.ground), 0, L.horizon)
  for (let i = 0; i < w * 0.9; i++) {
    const x = r.range(0, w)
    const y = r.range(L.horizon + 2, h)
    const k = (y - L.horizon) / (h - L.horizon)
    if (look.kind === 'grass') {
      // Blades of grass, taller nearer.
      const bh = 1 + Math.round(k * 4)
      const b = look.blades ?? ['#2a4a1a', '#3a6a24', '#6a9a3a']
      rect(g, x, y - bh, 1, bh, k > 0.5 ? b[1] : b[0])
      if (k > 0.4) rect(g, x, y - bh, 1, 1, b[2])
    } else if (look.kind === 'snow') {
      if (i % 3 === 0) rect(g, x, y, 2 + Math.round(k * 3), 1, '#a8bcd0')
    } else if (look.kind === 'badlands') {
      if (i % 2 === 0) line(g, x, y, x + r.range(-4, 4), y + r.range(1, 3), '#3a2414')
    } else if (i % 3 === 0) {
      rect(g, x, y, 2, 1, '#120808')
      if (i % 9 === 0) rect(g, x, y + 1, 3, 1, '#ff5a1e')
    }
  }
  if (look.kind === 'grass')
    // Dead trees, bare, on the skyline.
    for (const f of [0.08, 0.9, 0.3, 0.7]) {
      if (c.w < 200 && (f === 0.3 || f === 0.7)) continue
      const x = Math.round(w * f)
      const top = Math.round(L.horizon - c.h * 0.12)
      rect(g, x, top, 2, L.horizon - top + 2, '#14100c')
      line(g, x, top + 6, x - 7, top - 2, '#14100c')
      line(g, x + 1, top + 10, x + 8, top + 3, '#14100c')
      line(g, x - 4, top + 2, x - 6, top - 5, '#14100c')
    }
  return cv
}

/**
 * The shrine, drawn once: its side walls going back, stone steps, two pillars of fitted blocks, a lintel with its
 * plaque, a great curved roof of tiles with its corners swept up, stone lanterns either side.
 */
function shrine(c: Ctx, look: Look): Canvas {
  const L = layout(c)
  const cv = canvas(c.w, c.h)
  const g = cv.g
  const S = look.stone
  const fx0 = L.x0 - L.pw
  const fw = L.doorW + L.pw * 2
  const deep = Math.max(8, Math.round(fw * 0.14))
  // The hall's sides going back: darker, their top edge sloping to the horizon.
  for (const side of [-1, 1]) {
    for (let i = 0; i < deep; i++) {
      const x = side < 0 ? fx0 - 1 - i : fx0 + fw + i
      const top = L.top - 6 + Math.round(i * 0.5)
      const bot = L.base - Math.round(i * 0.35)
      rect(g, x, top, 1, bot - top, S.dark)
      for (let y = top + 3; y < bot; y += 5) rect(g, x, y, 1, 1, '#0a0808')
    }
  }
  // Steps.
  rect(g, fx0 - 4, L.base, fw + 8, 3, S.mid)
  rect(g, fx0 - 4, L.base, fw + 8, 1, S.lit)
  rect(g, fx0 - 10, L.base + 3, fw + 20, 3, S.dark)
  rect(g, fx0 - 10, L.base + 3, fw + 20, 1, S.mid)
  // Pillars of fitted blocks, a plinth and a capital each.
  for (const x of [fx0, L.x1]) {
    rect(g, x, L.top, L.pw, L.doorH, S.mid)
    for (let y = L.top + 2, k = 0; y < L.base - 4; y += 6, k++) {
      rect(g, x, y, L.pw, 1, S.dark)
      rect(g, x + (k % 2 ? 2 : L.pw - 3), y + 1, 1, 5, S.dark)
    }
    rect(g, x, L.top, 1, L.doorH, S.lit)
    rect(g, x + L.pw - 1, L.top, 1, L.doorH, S.dark)
    rect(g, x - 1, L.base - 4, L.pw + 2, 4, S.mid)
    rect(g, x - 1, L.base - 4, L.pw + 2, 1, S.lit)
    rect(g, x - 1, L.top, L.pw + 2, 3, S.lit)
  }
  // Lintel and its plaque, old marks carved in it.
  const lt = L.top - 9
  rect(g, fx0 - 4, lt, fw + 8, 9, S.mid)
  rect(g, fx0 - 4, lt, fw + 8, 1, S.lit)
  rect(g, fx0 - 4, lt + 8, fw + 8, 1, '#0a0808')
  const pw = Math.round(fw * 0.3)
  rect(g, c.cx - (pw >> 1), lt + 2, pw, 5, '#1a1010')
  for (let x = c.cx - (pw >> 1) + 2; x < c.cx + (pw >> 1) - 1; x += 4) {
    rect(g, x, lt + 3, 2, 1, '#a88a4a')
    rect(g, x + 1, lt + 4, 1, 2, '#a88a4a')
  }
  // The roof: rows widening down a concave curve, tile ribs, the eaves' line, the corners swept up.
  const rw = fw + Math.round(deep * 2.4) + 10
  const rh = Math.round(Math.max(12, Math.min(22, c.h * 0.075)))
  const ry = lt - 1
  for (let y = 0; y < rh; y++) {
    const k = y / (rh - 1)
    const hw = Math.round(lerp(rw * 0.3, rw * 0.5, k * k))
    rect(g, c.cx - hw, ry - rh + y, hw * 2, 1, look.stone.roof)
    for (let x = c.cx - hw + 1; x < c.cx + hw; x += 3) rect(g, x, ry - rh + y, 1, 1, '#0a0808')
  }
  rect(g, c.cx - Math.round(rw * 0.5), ry - 1, rw, 2, S.dark)
  rect(g, c.cx - Math.round(rw * 0.5), ry - 2, rw, 1, S.lit)
  for (const side of [-1, 1]) {
    const ex = c.cx + side * Math.round(rw * 0.5)
    line(g, ex, ry - 2, ex + side * 5, ry - 7, look.stone.roof, 2)
    rect(g, ex + side * 5 - 1, ry - 9, 2, 2, S.lit)
    // The ridge's end ornament, curled.
    const rx = c.cx + side * Math.round(rw * 0.3)
    rect(g, rx - 1, ry - rh - 6, 3, 5, S.dark)
    rect(g, rx + side * 2, ry - rh - 8, 2, 3, S.dark)
  }
  rect(g, c.cx - Math.round(rw * 0.3), ry - rh - 3, Math.round(rw * 0.6), 3, S.dark)
  rect(g, c.cx - Math.round(rw * 0.3), ry - rh - 3, Math.round(rw * 0.6), 1, S.lit)
  // Stone lanterns either side of the steps.
  for (const side of [-1, 1]) {
    const x = c.cx + side * Math.round(fw * 0.5 + deep + 8)
    const y = L.base + 6
    rect(g, x - 1, y - 12, 3, 12, S.mid)
    rect(g, x - 3, y - 17, 7, 5, S.mid)
    rect(g, x - 1, y - 16, 3, 3, '#0a0808')
    rect(g, x - 4, y - 19, 9, 2, S.lit)
    rect(g, x - 3, y - 1, 7, 2, S.dark)
  }
  return cv
}

/** The stakes' places: round the shrine's front, in an arc, far ones higher and smaller. */
function stakePlaces(c: Ctx) {
  const L = layout(c)
  const rx = Math.min(c.w * 0.44, 170)
  const ry = (c.h - L.base) * 0.42
  const yc = L.base + 4
  // Alternate sides, the far ones first, nearer each time.
  const order = [0.06, 0.94, 0.16, 0.84, 0.27, 0.73, 0.38, 0.62]
  return order.map((f) => {
    const a = Math.PI * (1 - f) + 0.12
    const y = yc + Math.sin(a) * ry
    const k = (y - L.horizon) / (c.h - L.horizon)
    return { x: Math.round(c.cx + Math.cos(a) * rx), y: Math.round(y), s: lerp(0.7, 1.3, k) }
  })
}

/** The doors: shut and chained, then thrown open. `open` 0..1. */
function drawDoors(g: G, c: Ctx, look: Look, open: number) {
  const L = layout(c)
  const half = L.doorW >> 1
  // The dark inside, lit by what sleeps in it.
  rect(g, L.x0, L.top, L.doorW, L.doorH, '#050308')
  if (open > 0) {
    // Lit from within, so whatever stands in the doorway is a black shape against it.
    rect(g, L.x0, L.top, L.doorW, L.doorH, mix('#050308', look.inside, 0.35 * open))
    const gr = Math.round(L.doorW * 0.55)
    g.drawImage(glow(gr, look.inside, 1.3, q4(0.75 * open)), c.cx - gr, L.base - L.doorH * 0.4 - gr)
  }
  // Each door swings inward: narrower as it turns, its studs and bands.
  const dw = Math.max(1, Math.round(half * (1 - open * 0.85)))
  for (const side of [-1, 1]) {
    const x = side < 0 ? L.x0 : L.x1 - dw
    rect(g, x, L.top, dw, L.doorH, look.stone.dark)
    rect(g, x + (side < 0 ? 0 : dw - 1), L.top, 1, L.doorH, look.stone.mid)
    if (dw > 4)
      for (let y = L.top + 4; y < L.base - 2; y += 8)
        for (let xx = x + 2; xx < x + dw - 1; xx += 4) rect(g, xx, y, 1, 1, look.stone.lit)
    rect(g, x, L.top + Math.round(L.doorH * 0.3), dw, 1, '#0a0608')
    rect(g, x, L.top + Math.round(L.doorH * 0.7), dw, 1, '#0a0608')
  }
}

/** The chains crossing the doors, and the seal at their heart, flaring at each stake and straining at the end. */
function drawSeal(g: G, c: Ctx, t: number) {
  const L = layout(c)
  const flare = Math.max(0, ...STAKES.map((s) => 1 - span(t, s, s + 0.25)))
  const strain = span(t, T_STRAIN, T_BREAK)
  const jit = strain > 0 ? Math.round(Math.sin(t * 70) * strain * 1.5) : 0
  const lit = flare > 0.4 || (strain > 0 && Math.floor(t * 14) % 2) ? '#ffffff' : CHAIN.lit
  const sy = L.top + Math.round(L.doorH * 0.5)
  const paths: [number, number][][] = [
    [
      [L.x0 - 2, L.top + 2],
      [c.cx + jit, sy],
      [L.x1 + 1, L.base - 3],
    ],
    [
      [L.x1 + 1, L.top + 2],
      [c.cx, sy + jit],
      [L.x0 - 2, L.base - 3],
    ],
    [
      [L.x0 - 3, sy],
      [L.x1 + 2, sy],
    ],
  ]
  if (strain > 0 || flare > 0) {
    const gr = Math.round(L.doorW * 0.4)
    g.drawImage(glow(gr, CHAIN.glow, 1.6, q4(0.25 + 0.4 * Math.max(flare, strain))), c.cx - gr, sy - gr)
  }
  for (const p of paths) chain(g, p, CHAIN.dark, lit, strain * t * 20, true)
  // The seal: a disc, a ring, its sign.
  const R = Math.max(6, Math.round(L.doorW * 0.12))
  ellipse(g, c.cx + jit, sy, R, R, '#2a0e3a')
  ellipseLine(g, c.cx + jit, sy, R, R, lit)
  ellipseLine(g, c.cx + jit, sy, R - 3, R - 3, CHAIN.lit)
  rect(g, c.cx + jit - 1, sy - R + 3, 3, (R - 3) * 2, lit)
  rect(g, c.cx + jit - R + 3, sy - 1, (R - 3) * 2, 3, CHAIN.lit)
  // Cracks running over it as it fails.
  if (strain > 0.3) {
    const n = Math.round(strain * 4)
    for (let i = 0; i < n; i++) {
      const a = i * 1.7
      line(g, c.cx + jit, sy, c.cx + jit + Math.cos(a) * R, sy + Math.sin(a) * R, '#ffffff')
    }
  }
}

/** A stake: a post with its colour's band and a paper charm; pulled, it flies up and its light goes up after it. */
function drawStakes(g: G, s: X, look: Look, t: number, h: number) {
  s.stakes.forEach((p, i) => {
    const at = STAKES[i]!
    const hh = Math.round(13 * p.s)
    const q = span(t, at, at + 0.35)
    if (t < at) {
      // Standing, humming in its colour.
      const pulseOn = Math.floor(t * 3 + i) % 3 === 0
      g.drawImage(glow(6, look.stake, 1.4, pulseOn ? 0.6 : 0.35), p.x - 6, p.y - hh - 4)
      rect(g, p.x - 1, p.y - hh, 3, hh, '#3a2a1a')
      rect(g, p.x - 1, p.y - hh, 1, hh, '#6a4a2a')
      rect(g, p.x - 1, p.y - hh, 3, 3, look.stake)
      rect(g, p.x + 2, p.y - hh + 3, 2, 4, '#e8e0c8')
      rect(g, p.x + 2, p.y - hh + 4, 2, 1, look.stake)
      rect(g, p.x - 2, p.y, 5, 1, '#0a0806')
      return
    }
    if (q < 1) {
      // Out of the ground, up and gone; its beam into the sky, thinning.
      const y = p.y - hh - ease.inQ(q) * h
      rect(g, p.x - 1, y, 3, hh, look.stake)
      const bw = Math.max(1, Math.round(5 * (1 - q)))
      rect(g, p.x - (bw >> 1), 0, bw, p.y, pattern(g, look.stake, 16 * (1 - q)))
      rect(g, p.x, 0, 1, p.y, q < 0.5 ? '#ffffff' : look.stake)
    }
    // Its hole left in the ground.
    rect(g, p.x - 1, p.y - 1, 3, 2, '#050404')
  })
}

function ruin(
  id: string,
  seed: number,
  aura: readonly [string, string, string, string],
  look: Look,
  sig: Sig,
): Cinema {
  return raidScene<X>({
    id,
    reveal: REVEAL,
    seed,
    aura,
    feet: 0.62,
    rays: aura[2],
    flash: aura[1],
    setup(c, r) {
      const L = layout(c)
      const sky = dGradient(c.w, L.horizon + 4, look.sky)
      stars(sky.g, r, c.w, L.horizon * 0.6, Math.round(c.w * 0.2), '#d8d0e8', '#4a4a6a')
      moon(
        sky.g,
        Math.round(c.w * 0.22),
        Math.round(c.h * 0.12),
        Math.max(5, Math.round(c.m * 0.05)),
        '#e8e0c8',
        '#c8bca0',
        '#6a5a7a',
      )
      const s: X = {
        sky,
        land: landscape(c, look),
        shrine: shrine(c, look),
        wither: null,
        vessel: null,
        links: [],
        shards: [],
        items: [],
        cracks: [],
        slash: [],
        stakes: stakePlaces(c),
      }
      sig.setup?.(c, r, s)
      return s
    },
    step(c, s, t, dt) {
      const r = s.r
      const L = layout(c)
      stepShards(s.links, dt, { floor: L.base + 8 })
      stepShards(s.shards, dt, { floor: L.base + 6 })
      // Each stake's spark as it comes out.
      STAKES.forEach((at, i) => {
        if (t >= at && t - dt < at) {
          const p = s.stakes[i]!
          for (let k = 0; k < 12 * c.many; k++)
            s.fx.add({
              x: p.x,
              y: p.y - 4,
              vx: r.range(-30, 30),
              vy: -r.range(30, 90),
              ay: 120,
              life: r.range(0.4, 0.8),
              size: 1,
              shape: k % 3 ? 'px' : 'star',
              colors: ['#ffffff', look.stake],
            })
        }
      })
      // The ruinous aura seeping from under the doors, then pouring out of them.
      const seep = t > T_STRAIN && t < T_BREAK ? 0.5 : t >= T_BREAK && t < REVEAL + 1.5 ? 0.8 : 0
      if (r() < seep * c.many)
        s.fx.add({
          x: r.range(L.x0, L.x1),
          y: L.base - 1,
          vx: r.range(-40, 40),
          vy: -r.range(2, 10),
          drag: 0.6,
          life: r.range(1, 1.8),
          size: r.int(2, 4),
          shape: 'smoke',
          density: 0.5,
          light: look.fog[0],
          colors: [look.fog[1], look.fog[1], look.fog[2]],
        })
      // The chains snap: links everywhere, the seal in pieces.
      if (t >= T_BREAK && t - dt < T_BREAK) {
        const sy = L.top + L.doorH * 0.5
        for (let k = 0; k < 40 * c.many + 14; k++) {
          const x = r.range(L.x0, L.x1)
          const y = lerp(L.top, L.base, r())
          const sh = makeShard(r, x, y, r.range(100, 200), r() < 0.5 ? CHAIN.dark : '#5a2a8a', CHAIN.lit, 0.7)
          sh.r = r.range(1.2, 2.5)
          sh.vx += (x - c.cx) * 2
          s.links.push(sh)
        }
        for (let k = 0; k < 10; k++)
          s.links.push(makeShard(r, c.cx, sy, r.range(120, 220), '#2a0e3a', '#ffffff', 0.8))
      }
      sig.step?.(c, s, t, dt)
    },
    back(g, c, s, t) {
      g.drawImage(s.sky, 0, 0)
      g.drawImage(s.land, 0, 0)
      // The sky darkening as the seal fails.
      const dark = span(t, T_STRAIN, T_BREAK) * (1 - span(t, REVEAL, REVEAL + 1))
      if (dark > 0) wash(g, '#0a0410', 0.35 * dark, 8)
      g.drawImage(s.shrine, 0, 0)
      const open = ease.outBack(span(t, T_BREAK, T_BREAK + 0.3))
      drawDoors(g, c, look, Math.min(1, open))
      if (t < T_BREAK) drawSeal(g, c, t)
      drawStakes(g, s, look, t, c.h)
      // The aura blasting out of the open doors.
      burstRing(
        g,
        c.cx,
        layout(c).base - 20,
        span(t, T_BREAK, T_BREAK + 0.6),
        Math.max(c.w, c.h) * 0.6,
        3,
        look.fog[0],
      )
      sig.back?.(g, c, s, t)
    },
    before(g, c, _s, t) {
      // In the doorway: its shape, coming forward out of the dark.
      if (t < T_BREAK + 0.35) return
      const q = ease.outQ(span(t, T_BREAK + 0.35, REVEAL))
      // Backlit by its own aura, so the shape reads against the dark inside.
      drawSprite(g, c.mon, c.cx, Math.round(c.feet - 6 * (1 - q)), {
        sx: lerp(0.85, 1, q),
        sy: lerp(0.85, 1, q),
        sil: '#08040c',
        outline: Math.floor(t * 12) % 3 ? aura[2] : aura[1],
      })
    },
    front(g, c, s, t) {
      drawShards(g, s.links, '#120818')
      sig.front?.(g, c, s, t)
      if (within(t, T_BREAK, T_BREAK + 0.2))
        screenFlash(g, CHAIN.glow, 0.5 * (1 - span(t, T_BREAK, T_BREAK + 0.2)))
    },
    shakes: (c) => [
      ...STAKES.map((at) => [at, 0.12, 1] as [number, number, number]),
      [T_STRAIN + 0.4, 0.5, 1],
      [T_BREAK, 0.45, 4],
      ...(sig.shakes?.(c) ?? []),
    ],
    sounds: () => [
      [0.1, () => tone(73, 3, { type: 'sine', vol: 0.05 })],
      // Each stake: a pluck and a note up, the notes climbing a dark scale.
      ...STAKES.map(
        (at, i) =>
          [
            at,
            () => (
              hiss(0.08, { freq: 2000, vol: 0.05 }),
              tone([196, 233, 262, 294, 311, 349, 392, 466][i]!, 0.5, { type: 'triangle', vol: 0.04 })
            ),
          ] as const,
      ),
      [T_STRAIN, () => tone(98, 1, { type: 'sawtooth', vol: 0.03, slide: 60 })],
      [T_STRAIN + 0.5, () => fxSound('legend.heart')],
      [
        T_BREAK,
        () => (
          fxSound('legend.shatter'),
          hiss(0.6, { freq: 400, type: 'lowpass', vol: 0.12 }),
          [0, 1, 2, 3].forEach((i) => tone(1400 + i * 300, 0.06, { type: 'square', vol: 0.02, at: i * 0.05 }))
        ),
      ],
      ...sig.sounds,
    ],
  })
}

// ---------------------------------------------------------------------------------------------- Wo-Chien

/** The rotting tablets' orbit: round its middle, wide and flat, out of the door then flung away. */
function tabletAt(c: Ctx, it: Item, t: number) {
  const L = layout(c)
  const out = ease.outQ(span(t, T_BREAK + 0.1 + it.r * 0.3, T_BREAK + 0.6 + it.r * 0.3))
  const fling = ease.inQ(span(t, REVEAL, REVEAL + 0.7))
  const rx = Math.min(c.w * 0.46, 150) * (0.7 + it.r * 0.4) * (out + fling * 1.5)
  const spin = (t - T_BREAK) * lerp(1.4, 3.4, span(t, T_BREAK, REVEAL)) + it.a
  const cy = lerp(L.top + L.doorH * 0.45, c.mid + it.y, out)
  return {
    x: c.cx + Math.cos(spin) * rx,
    y: cy + Math.sin(spin) * rx * 0.28,
    near: Math.sin(spin) > 0,
    on: out > 0,
  }
}

function drawTablet(g: G, x: number, y: number, it: Item, t: number) {
  // Turning over as it flies: narrower when edge on, its back plain, its face carved.
  const k = Math.cos(t * it.spin + it.a)
  const tw = Math.max(1, Math.round(Math.abs(k) * 8 * it.s))
  const th = Math.round(13 * it.s)
  const x0 = Math.round(x - tw / 2)
  const y0 = Math.round(y - th / 2)
  rect(g, x0 - 1, y0 - 1, tw + 2, th + 2, '#1a120a')
  rect(g, x0, y0, tw, th, k > 0 ? '#7a5a32' : '#4a3420')
  if (k > 0 && tw > 2) {
    for (let yy = y0 + 2; yy < y0 + th - 1; yy += 2) rect(g, x0 + 1, yy, Math.max(1, tw - 2), 1, '#3a2614')
    rect(g, x0, y0, tw, 1, '#a8804a')
    rect(g, x0 + tw - 1, y0 + th - 3, 1, 2, '#6a7a2a')
  }
}

const woChienSig: Sig = {
  setup(c, r, s) {
    // The withered land: the same ground, every blade dead.
    s.wither = landscape(c, {
      ...WO,
      ground: ['#4a3a1e', '#3a2a14', '#2a1e0e'],
      blades: ['#3a2a14', '#6a5a2a', '#8a7a3a'],
    })
    const g = s.wither.g
    const L = layout(c)
    for (let i = 0; i < c.w * 0.8; i++) {
      const x = r.range(0, c.w)
      const y = r.range(L.horizon + 2, c.h)
      const k = (y - L.horizon) / (c.h - L.horizon)
      const bh = 1 + Math.round(k * 3)
      rect(g, x, y - bh, 1, bh, k > 0.5 ? '#6a5a2a' : '#4a3a1a')
      if (i % 4 === 0) rect(g, x - 1, y, 3, 1, '#2a1e0e')
    }
    s.items = Array.from({ length: 26 }, () => ({
      a: r() * Math.PI * 2,
      y: r.range(-30, 18),
      r: r(),
      s: r.range(0.8, 1.3),
      spin: r.range(3, 9),
    }))
  },
  step(c, s, t) {
    const r = s.r
    // Leaves coming down, browning as they fall.
    if (t > T_BREAK && r() < 0.5 * c.many)
      s.fx.add({
        x: r.range(0, c.w),
        y: -3,
        vx: r.range(-10, 20),
        vy: r.range(16, 30),
        life: 4,
        size: 2,
        shape: 'leaf',
        spin: r.range(-4, 4),
        colors: ['#5a8a2a', '#8a7a2a', '#6a4a1a', '#3a2a14'],
        light: '#a8a04a',
        dark: '#2a1e0e',
      })
  },
  back(g, c, s, t) {
    // The rot spreading from the door, over the grass, row by row: no blended edge.
    const q = ease.outQ(span(t, T_BREAK + 0.1, REVEAL + 0.3))
    if (q > 0 && s.wither) {
      const L = layout(c)
      const rx = q * c.w * 1.3
      const ry = rx * 0.45
      for (let y = L.horizon; y < c.h; y++) {
        const d = (y - L.base) / ry
        if (Math.abs(d) >= 1) continue
        const hw = Math.round(rx * Math.sqrt(1 - d * d))
        g.drawImage(s.wither, c.cx - hw, y, hw * 2, 1, c.cx - hw, y, hw * 2, 1)
        // Its front: black rot.
        rect(g, c.cx - hw - 1, y, 2, 1, '#1a120a')
        rect(g, c.cx + hw - 1, y, 2, 1, '#1a120a')
      }
      // The shrine stands over it.
      g.drawImage(s.shrine, 0, 0)
      drawDoors(g, c, WO, 1)
    }
    for (const it of s.items) {
      const p = tabletAt(c, it, t)
      if (p.on && !p.near) drawTablet(g, p.x, p.y, it, t)
    }
  },
  front(g, c, s, t) {
    for (const it of s.items) {
      const p = tabletAt(c, it, t)
      if (p.on && p.near) drawTablet(g, p.x, p.y, it, t)
    }
  },
  sounds: [
    [T_BREAK + 0.15, () => hiss(1.4, { freq: 700, vol: 0.05, slide: -400 })],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_BREAK + 0.2 + i * 0.2, () => tone(140 - i * 8, 0.08, { type: 'square', vol: 0.03 })] as const,
    ),
    [3.9, () => tone(110, 0.8, { type: 'sawtooth', vol: 0.04, slide: -50 })],
  ],
}

const WO: Look = {
  kind: 'grass',
  stake: '#b060f0',
  fog: ['#6a7a32', '#3a4220', '#1e2410'],
  sky: ['#06060c', '#12121c', '#22222a', '#3a3a30'],
  far: '#1a1a1e',
  near: '#121410',
  ground: ['#2a4a1e', '#22401a', '#1a3014'],
  stone: { lit: '#8a8a7a', mid: '#5a5a4e', dark: '#2a2a24', roof: '#3a4a2e' },
  inside: '#6a7a2a',
}

export const wochienCinema = ruin(
  'cinema-wochien',
  1001,
  ['#ffffff', '#d8e8a0', '#8a9a3a', '#3a3a14'],
  WO,
  woChienSig,
)

// ---------------------------------------------------------------------------------------------- Chien-Pao

const T_SWORD = 3.45
const T_STRIKE = 3.68
const T_SLASH = 4.05

/** The Sword of Ruin: an ice blade, point down, a dark guard and grip, a red tassel. Its tip at (x, y). */
function drawSword(g: G, x: number, y: number, len: number, bw: number) {
  const top = y - len
  const half = bw >> 1
  // The blade, a ridge down its middle, one edge bright.
  rect(g, x - half, top, bw, len - bw, '#a8dcf4')
  rect(g, x - half, top, 1, len - bw, '#ffffff')
  rect(g, x + half - 1, top, 1, len - bw, '#5a9ac8')
  rect(g, x, top, 1, len - bw, '#e8f8ff')
  tri(g, x - half, y - bw, x + half, y - bw, x, y, '#a8dcf4')
  line(g, x - half, y - bw, x, y, '#ffffff')
  // Guard, grip, pommel, tassel.
  rect(g, x - bw - 3, top - 3, bw * 2 + 6, 4, '#3a1a4a')
  rect(g, x - bw - 3, top - 3, bw * 2 + 6, 1, '#8a5aa8')
  rect(g, x - 2, top - 15, 4, 12, '#2a1a2a')
  for (let yy = top - 14; yy < top - 3; yy += 3) rect(g, x - 2, yy, 4, 1, '#5a3a5a')
  rect(g, x - 3, top - 18, 6, 3, '#8a5aa8')
  rect(g, x + 3, top - 16, 1, 8, '#c8281a')
  rect(g, x + 4, top - 10, 2, 5, '#c8281a')
}

const chienPaoSig: Sig = {
  setup(c, r, s) {
    // The slash: corner to corner through the middle, a little jagged.
    s.slash = bolt(r, c.w + 4, c.h * 0.16, -4, c.h * 0.86, 0.04, 3)
  },
  step(c, s, t, dt) {
    const r = s.r
    const L = layout(c)
    // A freezing blast out of the doors, and snow from then on.
    if (t > T_BREAK && r() < (t < T_BREAK + 0.6 ? 1 : 0.5) * c.many)
      for (let i = 0; i < (t < T_BREAK + 0.6 ? 3 : 1); i++)
        s.fx.add({
          x: t < T_BREAK + 0.6 ? c.cx + r.range(-10, 10) : r.range(0, c.w),
          y: t < T_BREAK + 0.6 ? L.base - r.range(4, L.doorH) : -2,
          vx: t < T_BREAK + 0.6 ? r.range(-220, 220) : r.range(-20, -5),
          vy: t < T_BREAK + 0.6 ? r.range(-30, 40) : r.range(20, 40),
          life: 2.5,
          size: r.int(1, 2),
          shape: t < T_BREAK + 0.6 ? 'streak' : 'flake',
          trail: 0.03,
          colors: ['#ffffff', '#c8e8ff'],
        })
    if (t >= T_STRIKE && t - dt < T_STRIKE)
      for (let i = 0; i < 30 * c.many + 8; i++)
        s.shards.push(makeShard(r, c.cx + r.range(-8, 8), L.base, r.range(80, 170), '#c8ecff', '#ffffff', 1))
    // The slash throws ice off along its line.
    if (t >= T_SLASH && t - dt < T_SLASH)
      for (let i = 0; i < 30 * c.many; i++) {
        const p = s.slash[r.int(0, s.slash.length - 1)]!
        s.fx.add({
          x: p[0],
          y: p[1],
          vx: r.range(-60, 60),
          vy: r.range(-60, 40),
          ay: 120,
          life: r.range(0.4, 0.9),
          size: 1,
          shape: r() < 0.5 ? 'star' : 'px',
          colors: ['#ffffff', '#c8ecff', '#7ac8f0'],
        })
      }
    // On the reveal the sword shatters.
    if (t >= REVEAL && t - dt < REVEAL)
      for (let i = 0; i < 40 * c.many + 10; i++)
        s.shards.push(
          makeShard(
            r,
            c.cx + r.range(-5, 5),
            r.range(L.top - 10, L.base),
            r.range(120, 240),
            '#a8dcf4',
            '#ffffff',
            0.6,
          ),
        )
  },
  back(g, c, _s, t) {
    const L = layout(c)
    // Frost spreading over the ground from the strike, spikes of ice out along it.
    const q = ease.outC(span(t, T_STRIKE, T_STRIKE + 0.3))
    if (q > 0) {
      const rx = Math.round(c.w * 0.45 * q)
      ellipse(g, c.cx, L.base + 3, rx, Math.max(2, Math.round(rx * 0.22)), pattern(g, '#e8f8ff', 10))
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.05 + i * 0.18)
        const len = c.w * 0.32 * q * (0.6 + (i % 3) * 0.2)
        const x = c.cx + Math.cos(a) * len * (i % 2 ? 1 : -1)
        const y = L.base + 3 + Math.sin(a) * len * 0.22
        const hh = 10 + (i % 3) * 5
        tri(g, x - 3, y, x + 3, y, x + (i % 2 ? 2 : -2), y - hh * q, '#c8ecff')
        line(g, x - 3, y, x + (i % 2 ? 2 : -2), y - hh * q, '#ffffff')
      }
    }
  },
  front(g, c, s, t) {
    const L = layout(c)
    drawShards(g, s.shards, '#2a4a6a')
    // The sword falling, then standing in the ground before the doors until the reveal.
    if (t >= T_SWORD && t < REVEAL) {
      const len = Math.round(Math.min(c.h * 0.42, 120))
      const bw = Math.max(8, Math.round(c.m * 0.07))
      const q = ease.inQ(span(t, T_SWORD, T_STRIKE))
      const y = Math.round(lerp(-20, L.base + 2, q))
      if (q < 1)
        for (let i = 1; i < 4; i++) rect(g, c.cx - (bw >> 1) + i * 2, y - len - i * 14, 1, 12, '#c8ecff')
      const gr = Math.round(bw * 2.5)
      g.drawImage(glow(gr, '#7ac8f0', 1.3, 0.6), c.cx - gr, y - Math.round(len * 0.5) - gr)
      drawSword(g, c.cx, y, len, bw)
    }
    groundRing(g, c.cx, L.base + 2, span(t, T_STRIKE, T_STRIKE + 0.6), c.w * 0.8, '#ffffff')
    // The slash: drawn across the screen in an instant, burning white, leaving frost along its line.
    const sq = span(t, T_SLASH, T_SLASH + 0.08)
    if (sq > 0 && t < REVEAL + 0.6) {
      const n = Math.max(2, Math.round(s.slash.length * sq))
      const pts = s.slash.slice(0, n)
      const fade = span(t, T_SLASH + 0.25, REVEAL + 0.6)
      if (fade < 0.6) {
        polyline(g, pts, pattern(g, '#7ac8f0', 16 * (1 - fade)) as string, 7)
        polyline(g, pts, '#ffffff', fade < 0.3 ? 3 : 1)
      } else if (Math.floor(t * 20) % 2) polyline(g, pts, '#c8ecff')
    }
    if (within(t, T_STRIKE, T_STRIKE + 0.15)) screenFlash(g, '#e8f8ff', 0.45)
    if (within(t, T_SLASH, T_SLASH + 0.12)) screenFlash(g, '#ffffff', 0.5)
  },
  shakes: () => [
    [T_STRIKE, 0.45, 4],
    [T_SLASH, 0.25, 3],
  ],
  sounds: [
    [T_BREAK + 0.1, () => hiss(0.9, { freq: 5000, slide: -3000, vol: 0.06 })],
    [T_SWORD, () => tone(1600, 0.25, { type: 'sine', vol: 0.04, slide: -900 })],
    [
      T_STRIKE,
      () => (
        fxSound('impact.hit'),
        hiss(0.5, { freq: 4500, vol: 0.08 }),
        tone(60, 0.5, { type: 'sine', vol: 0.1 })
      ),
    ],
    [
      T_SLASH,
      () => (
        hiss(0.25, { freq: 7000, slide: -5000, vol: 0.1 }),
        tone(2400, 0.2, { type: 'square', vol: 0.02, slide: -1600 })
      ),
    ],
    [REVEAL - 0.02, () => fxSound('legend.shatter')],
  ],
}

const PAO: Look = {
  kind: 'snow',
  stake: '#ffd23a',
  fog: ['#c8e8ff', '#7aa0c8', '#3a5070'],
  sky: ['#02040e', '#081028', '#142444', '#2a4060'],
  far: '#3a4a64',
  near: '#5a6a84',
  ground: ['#a8bcd0', '#c8d8e8', '#e0ecf8'],
  stone: { lit: '#c8d4e0', mid: '#7a8a9a', dark: '#3a4452', roof: '#2a3a5a' },
  inside: '#7ac8f0',
}

export const chienpaoCinema = ruin(
  'cinema-chienpao',
  1002,
  ['#ffffff', '#d8f4ff', '#7ac8f0', '#2a4a7a'],
  PAO,
  chienPaoSig,
)

// ---------------------------------------------------------------------------------------------- Ting-Lu

const T_QUAKE = 3.2
const T_RISE = 3.5
const T_BURST = 4.2

/**
 * The Vessel of Ruin: a bronze cauldron on three legs, a wide lip with two upright loop handles, a band of meanders and
 * a staring mask cast on its belly, green with age.
 */
function vesselArt(c: Ctx): Canvas {
  const vw = Math.round(Math.max(50, Math.min(c.w * 0.72, c.sz.w + 14)))
  const vh = Math.round(vw * 0.9)
  const cv = canvas(vw + 2, vh + 2)
  const g = cv.g
  const cx = (vw >> 1) + 1
  const lip = Math.round(vh * 0.2)
  const bot = Math.round(vh * 0.84)
  // Legs, stubby, under the belly.
  for (const f of [-0.3, 0, 0.3]) {
    const x = cx + Math.round(vw * f)
    for (let y = bot - 4; y <= vh; y++) {
      const hw = Math.round(lerp(5, 3, (y - bot + 4) / (vh - bot + 4)))
      rect(g, x - hw, y, hw * 2, 1, f ? '#5a3c18' : '#3a2410')
    }
  }
  // The belly: wide at the shoulder, round to the bottom, lit on its left.
  for (let y = lip + 3; y <= bot; y++) {
    const k = (y - lip - 3) / (bot - lip - 3)
    const hw = Math.round((vw / 2 - 1) * (0.94 - 0.28 * k * k))
    rect(g, cx - hw, y, hw * 2, 1, k < 0.2 ? '#8a6a2a' : k < 0.6 ? '#6a4a1e' : '#4a3014')
    rect(g, cx - hw, y, 1, 1, '#1a0e04')
    rect(g, cx + hw - 1, y, 1, 1, '#1a0e04')
    if (k < 0.7) rect(g, cx - hw + 3, y, 2, 1, '#c8a050')
  }
  // The band of meanders under the lip.
  const by = lip + 6
  rect(g, cx - Math.round(vw * 0.44), by, Math.round(vw * 0.88), 6, '#3a2410')
  for (let x = cx - Math.round(vw * 0.42); x < cx + vw * 0.42 - 4; x += 6) {
    rect(g, x, by + 1, 4, 1, '#c8a050')
    rect(g, x + 3, by + 1, 1, 4, '#c8a050')
    rect(g, x + 1, by + 4, 3, 1, '#c8a050')
  }
  // The mask on its belly: brows, two staring eyes, a snout.
  const my = Math.round(lerp(by + 8, bot, 0.4))
  const ex = Math.round(vw * 0.16)
  for (const side of [-1, 1]) {
    line(g, cx + side * 3, my - 6, cx + side * (ex + 6), my - 9, '#2a1a08', 2)
    ellipse(g, cx + side * ex, my, 4, 3, '#1a0e04')
    rect(g, cx + side * ex - 1, my - 1, 2, 2, '#e8c070')
  }
  rect(g, cx - 2, my + 2, 4, 6, '#2a1a08')
  rect(g, cx - 5, my + 8, 10, 2, '#2a1a08')
  // Patina.
  const r = rng(1003)
  for (let i = 0; i < vw * 0.8; i++)
    rect(g, cx + r.range(-vw * 0.38, vw * 0.38), r.range(by + 7, bot - 3), r.int(1, 3), 1, '#4a7a5a')
  // The lip and its dark mouth, the two loop handles standing on it.
  for (const side of [-1, 1]) {
    const hx = cx + side * Math.round(vw * 0.3)
    const hw = Math.max(5, Math.round(vw * 0.08))
    rect(g, hx - hw, 0, hw * 2, lip, '#6a4a1e')
    rect(g, hx - hw, 0, hw * 2, 1, '#e8c070')
    rect(g, hx - hw, 0, 1, lip, '#c8a050')
    g.clearRect(hx - hw + 3, 3, hw * 2 - 6, lip - 3)
  }
  rect(g, cx - Math.round(vw * 0.5), lip, vw, 4, '#a8803a')
  rect(g, cx - Math.round(vw * 0.5), lip, vw, 1, '#e8c070')
  rect(g, cx - Math.round(vw * 0.5), lip + 3, vw, 1, '#3a2410')
  return cv
}

const tingLuSig: Sig = {
  setup(c, r, s) {
    const L = layout(c)
    s.vessel = vesselArt(c)
    // The cracks: out from before the door, across the whole ground.
    s.cracks = Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * (-0.05 + i * 0.137)
      const len = Math.max(c.w, c.h) * 0.6
      return bolt(
        r,
        c.cx,
        L.base + 3,
        c.cx + Math.cos(a) * len,
        L.base + 3 + Math.sin(a) * len * 0.45,
        0.25,
        4,
      )
    })
  },
  step(c, s, t, dt) {
    const r = s.r
    const L = layout(c)
    // Dust jetting out of the cracks as they open.
    if (t > T_QUAKE && t < REVEAL + 0.5 && r() < 0.9 * c.many) {
      const cr = s.cracks[r.int(0, s.cracks.length - 1)]!
      const p = cr[Math.floor(r() * cr.length * span(t, T_QUAKE, T_QUAKE + 0.5))] ?? cr[0]!
      s.fx.add({
        x: p[0],
        y: p[1],
        vx: r.range(-8, 8),
        vy: -r.range(30, 70),
        drag: 1.2,
        life: r.range(0.6, 1.2),
        size: r.int(2, 4),
        shape: 'smoke',
        colors: ['#c8a070', '#8a6a40', '#4a3420'],
      })
    }
    // The vessel bursts: bronze everywhere, a column of dust.
    if (t >= T_BURST && t - dt < T_BURST)
      for (let i = 0; i < 46 * c.many + 10; i++)
        s.shards.push(
          makeShard(
            r,
            c.cx + r.range(-20, 20),
            L.base - r.range(0, 40),
            r.range(120, 230),
            r() < 0.5 ? '#6a4a1e' : '#a8803a',
            '#e8c070',
            0.9,
          ),
        )
    if (t > T_BURST && t < REVEAL + 0.3 && r() < c.many)
      for (let i = 0; i < 3; i++)
        s.fx.add({
          x: c.cx + r.range(-14, 14),
          y: L.base - 4,
          vx: r.range(-12, 12),
          vy: -r.range(90, 160),
          drag: 1.5,
          life: r.range(0.7, 1.1),
          size: r.int(3, 6),
          shape: 'smoke',
          colors: ['#e8c890', '#b08a50', '#6a4a28'],
        })
  },
  back(g, c, s, t) {
    const L = layout(c)
    // The ground splitting: dark cracks running out, glowing inside; slabs tilting up beside them.
    const q = ease.outC(span(t, T_QUAKE, T_QUAKE + 0.5))
    if (q > 0) {
      s.cracks.forEach((cr, i) => {
        const n = Math.max(2, Math.round(cr.length * q))
        const pts = cr.slice(0, n)
        polyline(g, pts, '#140a04', 3)
        polyline(g, pts, Math.floor(t * 8 + i) % 3 ? '#e0902a' : '#ffd06a')
      })
      const lift = ease.outBack(span(t, T_QUAKE + 0.2, T_QUAKE + 0.6))
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.08 + i * 0.17)
        const d = c.w * (0.18 + (i % 3) * 0.08)
        const x = c.cx + Math.cos(a) * d * (i % 2 ? 1 : -1)
        const y = L.base + 4 + Math.sin(a) * d * 0.4
        const sw = 8 + (i % 3) * 4
        const up = Math.round((4 + (i % 3) * 3) * lift)
        tri(g, x - sw, y, x + sw, y, x + (i % 2 ? sw * 0.6 : -sw * 0.6), y - up - 2, '#4a3018')
        line(g, x - sw, y, x + (i % 2 ? sw * 0.6 : -sw * 0.6), y - up - 2, '#a87a40')
        rect(g, x - sw, y, sw * 2, 1, '#140a04')
      }
    }
  },
  front(g, c, s, t) {
    const L = layout(c)
    // The vessel rising out of the ground before the doors, over its shape, shaking, until it bursts.
    if (t > T_RISE && t < T_BURST && s.vessel) {
      const v = s.vessel
      const rise = ease.outC(span(t, T_RISE, T_RISE + 0.5))
      const shown = Math.round(v.height * rise)
      const jx = t > T_BURST - 0.3 ? Math.round(Math.sin(t * 80) * 2) : 0
      const x = c.cx - (v.width >> 1) + jx
      const gr = Math.round(v.width * 0.7)
      g.drawImage(glow(gr, '#e0902a', 1.3, 0.5), c.cx - gr, L.base - (shown >> 1) - gr)
      if (shown > 0) g.drawImage(v, 0, 0, v.width, shown, x, L.base + 2 - shown, v.width, shown)
      // Earth sliding off it as it comes up.
      rect(g, x - 4, L.base + 1, v.width + 8, 2, '#3a2414')
      if (t > T_BURST - 0.3) {
        // Light splitting out of it.
        for (const a of [0.3, 1.2, 2.2]) {
          const mx = c.cx + jx
          const my = L.base - (shown >> 1)
          line(g, mx, my, mx + Math.cos(a + t) * v.width * 0.4, my + Math.sin(a + t) * shown * 0.4, '#ffe08a')
        }
      }
    }
    drawShards(g, s.shards, '#1a0e04')
    groundRing(g, c.cx, L.base + 3, span(t, T_QUAKE, T_QUAKE + 0.7), c.w * 0.9, '#e0902a')
    groundRing(g, c.cx, L.base + 3, span(t, T_BURST, T_BURST + 0.6), c.w * 0.9, '#ffe08a')
    if (within(t, T_BURST, T_BURST + 0.15)) screenFlash(g, '#ffe8c0', 0.45)
  },
  shakes: () => [
    [T_QUAKE, 1.2, 3],
    [T_RISE + 0.1, 0.6, 2],
    [T_BURST, 0.5, 5],
  ],
  sounds: [
    [
      T_QUAKE,
      () => (
        hiss(1.8, { freq: 120, type: 'lowpass', vol: 0.16 }),
        tone(40, 1.6, { type: 'sine', vol: 0.12 })
      ),
    ],
    [T_RISE, () => tone(70, 0.8, { type: 'sawtooth', vol: 0.05, slide: 60 })],
    [T_BURST - 0.25, () => tone(400, 0.3, { type: 'square', vol: 0.03, slide: 400 })],
    [
      T_BURST,
      () => (
        fxSound('legend.shatter'),
        tone(110, 0.9, { type: 'triangle', vol: 0.07, slide: -40 }),
        hiss(0.8, { freq: 300, vol: 0.1 })
      ),
    ],
  ],
}

const LU: Look = {
  kind: 'badlands',
  stake: '#5ad04a',
  fog: ['#a8805a', '#6a4a2a', '#3a2414'],
  sky: ['#0a0604', '#1e120a', '#36200e', '#5a3818'],
  far: '#2a160c',
  near: '#3a2010',
  ground: ['#5a3a1e', '#6a4624', '#7a5430'],
  stone: { lit: '#b08a5a', mid: '#7a5a38', dark: '#3a2814', roof: '#4a2a14' },
  inside: '#e0902a',
}

export const tingluCinema = ruin(
  'cinema-tinglu',
  1003,
  ['#ffffff', '#f0d8a0', '#b08040', '#4a2a14'],
  LU,
  tingLuSig,
)

// ---------------------------------------------------------------------------------------------- Chi-Yu

const T_BEADS = 3.25
const T_SPIRAL = 3.97
/** Its flash 0.38 s before the reveal's. */
const T_ERUPT = 4.22

/** Where a bead is: round the ring on the ground, then spiralling in and up to its middle. */
function beadAt(c: Ctx, i: number, t: number) {
  const L = layout(c)
  const rx = Math.min(c.w * 0.46, 140)
  const ry = Math.max(9, rx * 0.3)
  const out = ease.outQ(span(t, T_BEADS, T_BEADS + 0.4))
  const inn = ease.inQ(span(t, T_SPIRAL, T_ERUPT))
  const spin = (t - T_BEADS) * lerp(3, 10, span(t, T_BEADS, T_ERUPT)) + (i * Math.PI) / 2
  const r = out * (1 - inn)
  const from = { x: c.cx, y: L.top + L.doorH * 0.5 }
  const ring = { x: c.cx + Math.cos(spin) * rx * r, y: L.base + 2 + Math.sin(spin) * ry * r - 10 }
  return {
    x: lerp(from.x, ring.x, out),
    y: lerp(lerp(from.y, ring.y, out), c.mid, inn),
    near: Math.sin(spin) > 0,
  }
}

function drawBead(g: G, x: number, y: number) {
  g.drawImage(glow(9, '#ff5a1e', 1.3, 0.7), Math.round(x) - 9, Math.round(y) - 9)
  ellipse(g, x, y, 4, 4, '#5a0a0a')
  ellipse(g, x, y, 3, 3, '#e0301a')
  rect(g, x - 1, y - 2, 2, 2, '#ffe08a')
  rect(g, x - 1, y - 1, 1, 1, '#ffffff')
}

/** The ring of fire the beads draw on the ground: flame tongues, its back half or its front. */
function drawFireRing(g: G, c: Ctx, t: number, front: boolean) {
  const L = layout(c)
  const k = span(t, T_BEADS + 0.3, T_BEADS + 1)
  if (k <= 0) return
  const rx = Math.min(c.w * 0.46, 140)
  const ry = Math.max(9, rx * 0.3)
  const n = Math.round(rx * 0.8)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    if (Math.sin(a) > 0 !== front) continue
    if (i / n > k) continue
    const x = Math.round(c.cx + Math.cos(a) * rx)
    const y = Math.round(L.base + 2 + Math.sin(a) * ry)
    const fh = Math.round(
      (5 + 4 * Math.sin(a * 7 + t * 17) + 3 * Math.sin(a * 3 - t * 11)) * (front ? 1.3 : 0.9),
    )
    if (fh <= 0) continue
    rect(g, x, y - fh, 2, fh, '#c8281a')
    rect(g, x, y - Math.round(fh * 0.7), 2, Math.round(fh * 0.7), '#ff6a1e')
    rect(g, x, y - Math.round(fh * 0.35), 2, Math.round(fh * 0.35), '#ffd06a')
  }
}

const chiYuSig: Sig = {
  step(c, s, t) {
    const r = s.r
    // Fire trailing off each bead.
    if (t > T_BEADS && t < T_ERUPT)
      for (let i = 0; i < 4; i++) {
        const b = beadAt(c, i, t)
        if (r() < 0.8 * c.many)
          s.fx.add({
            x: b.x + r.range(-2, 2),
            y: b.y + r.range(-2, 2),
            vy: -r.range(10, 30),
            life: r.range(0.25, 0.45),
            size: 3,
            size1: 0,
            shape: 'sq',
            colors: ['#fff3a0', '#ffbe2e', '#ff6a1e', '#c8281a'],
          })
      }
    // Embers in the hot wind.
    if (t > T_BREAK && r() < 0.6 * c.many)
      s.fx.add({
        x: r.range(0, c.w),
        y: c.h + 2,
        vx: r.range(-10, 10),
        vy: -r.range(30, 60),
        life: 3,
        size: 1,
        shape: 'px',
        colors: ['#ffe08a', '#ff8a1e', '#c8281a', '#5a0a0a'],
      })
    // The eruption: a pillar of fire where they met.
    if (t > T_ERUPT && t < REVEAL + 0.4)
      for (let i = 0; i < 4 * c.many + 1; i++)
        s.fx.add({
          x: c.cx + r.range(-12, 12),
          y: c.feet,
          vx: r.range(-20, 20),
          vy: -r.range(120, 220),
          drag: 1.5,
          life: r.range(0.4, 0.8),
          size: 4,
          size1: 1,
          shape: 'sq',
          colors: ['#ffffff', '#fff3a0', '#ffbe2e', '#ff6a1e', '#c8281a'],
        })
  },
  back(g, c, _s, t) {
    drawFireRing(g, c, t, false)
    if (t > T_BEADS && t < T_ERUPT)
      for (let i = 0; i < 4; i++) {
        const b = beadAt(c, i, t)
        if (!b.near) drawBead(g, b.x, b.y)
      }
  },
  front(g, c, _s, t) {
    drawFireRing(g, c, t, true)
    if (t > T_BEADS && t < T_ERUPT)
      for (let i = 0; i < 4; i++) {
        const b = beadAt(c, i, t)
        if (b.near) drawBead(g, b.x, b.y)
      }
    const gr = Math.round(c.m * 0.25)
    const e = pulse(t, T_ERUPT, REVEAL + 0.3)
    if (e > 0) g.drawImage(glow(gr, '#ff8a1e', 1.2, q4(0.8 * e)), c.cx - gr, c.mid - gr)
    if (within(t, T_ERUPT, T_ERUPT + 0.12)) screenFlash(g, '#ffd8a0', 0.45)
  },
  shakes: () => [[T_ERUPT, 0.5, 3]],
  sounds: [
    [T_BREAK + 0.1, () => fxSound('fire.inhale')],
    ...[0, 1, 2, 3].map(
      (i) => [T_BEADS + i * 0.08, () => tone(660 + i * 110, 0.15, { type: 'triangle', vol: 0.03 })] as const,
    ),
    [T_BEADS + 0.3, () => fxSound('fire.stream')],
    [T_SPIRAL, () => tone(300, 0.3, { type: 'sawtooth', vol: 0.04, slide: 600 })],
    [T_ERUPT, () => (fxSound('fire.hit'), hiss(0.8, { freq: 600, vol: 0.1 }))],
  ],
}

const YU: Look = {
  kind: 'lava',
  stake: '#ff8a1e',
  fog: ['#5a2a2a', '#2a1414', '#120808'],
  sky: ['#060202', '#180606', '#300a08', '#4a140c'],
  far: '#140606',
  near: '#1e0a0a',
  ground: ['#2a1414', '#221010', '#1a0a0a'],
  stone: { lit: '#6a4a4a', mid: '#3a2626', dark: '#1a0e0e', roof: '#4a1410' },
  inside: '#ff5a1e',
}

export const chiyuCinema = ruin(
  'cinema-chiyu',
  1004,
  ['#ffffff', '#ffe08a', '#ff5a1e', '#7a1a0a'],
  YU,
  chiYuSig,
)
