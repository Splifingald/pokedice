// The Sky Pillar for Rayquaza's raid in the trailer: the day over a sea of clouds and the pillar's towers, from the
// sky raid made for the promo video (src/fx/timelines/skyRaid.ts on the promo/hero-clip branch, commit badd9861),
// copied here because the game on this branch doesn't have it yet. Only the backdrop: the trailer's raid opening keeps
// its own beats (lib/raidIntro.ts) and draws this behind them.
import {
  bayer,
  cached,
  clamp,
  glow,
  lerp,
  Particles,
  rect,
  rng,
  shade,
  type Canvas,
  type G,
  type Rng,
} from '@/fx/pixel'

/** The sky's palette: the day's blues down to a warm horizon, the clouds, the pillars' stone, Rayquaza's light. */
export const SKY = {
  top: '#4f9fe0',
  high: '#6cb8ef',
  mid: '#8fcdf5',
  low: '#b6e0fa',
  pale: '#dcf1fd',
  dawn: '#fff4dc',
  sun: '#fffbe8',
  gold: '#ffd36b',
  paleGold: '#fff1b8',
  amber: '#f4a940',
  cloud: '#ffffff',
  cloudShade: '#dceefc',
  cloudDeep: '#b3d3ef',
  cloudBlue: '#88b2dc',
  stoneLit: '#f6ecd4',
  stone: '#ddcfae',
  stoneDark: '#b19f7c',
  stoneDeep: '#7c6d55',
  joint: '#a08f70',
  farLit: '#e9f2fa',
  far: '#c6d9ec',
  farDark: '#a6c0da',
  farJoint: '#b3c9df',
  moss: '#7fc77a',
  mossDark: '#4f9a5a',
  emerald: '#2bd67b',
  jade: '#8af2b9',
  deep: '#0f8a4f',
  ozone: '#e4fff4',
  shadow: '#0b2a22',
} as const

// ---------------------------------------------------------------- the sky

/** The day: azure at the top down to pale blue, then the horizon's warm cream, ordered-dithered. Cached. */
export const skyBackdrop = (w: number, h: number): Canvas =>
  cached(`sky-bg|${w}|${h}`, () => {
    const cols = [SKY.top, SKY.high, SKY.mid, SKY.low, SKY.pale, SKY.dawn]
    return shade(w, h, (x, y) => {
      const t = Math.pow(clamp(y / Math.max(1, h - 1)), 1.15) * (cols.length - 1)
      const i = Math.floor(t)
      return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
    })
  })

/**
 * A cumulus: puffs along its top, a flat underside; lit white on top, shaded blue under, dithered between. `far`: paler
 * and flatter (the clouds' far bank). Cached.
 */
export const cloudSprite = (w: number, h: number, seed: number, far = false): Canvas =>
  cached(`sky-cloud|${w}|${h}|${seed}|${far}`, () => {
    const r = rng(seed * 23 + w)
    const n = Math.max(2, Math.round(w / 12))
    const puffs = Array.from({ length: n }, (_, i) => {
      const rr = r.range(h * 0.45, h * 0.8)
      return {
        x: lerp(rr * 0.8, w - rr * 0.8, n === 1 ? 0.5 : i / (n - 1)) + r.range(-2, 2),
        y: h - rr * 0.55,
        r: rr,
      }
    })
    const base = h - 2
    return shade(w, h, (x, y) => {
      if (y > base) return null
      let best = -1
      let ny = 0
      for (const p of puffs) {
        const d = Math.hypot(x - p.x, y - p.y)
        const k = p.r - d
        if (k > best) {
          best = k
          ny = (y - p.y) / p.r
        }
      }
      if (best < 0) return null
      const under = (y - (base - h * 0.28)) / (h * 0.28)
      const lit = -ny + (far ? 0.4 : 0) - Math.max(0, under) * 1.2
      if (lit > 0.35) return SKY.cloud
      if (lit > 0.05) return bayer(x, y) < (lit - 0.05) / 0.3 ? SKY.cloud : SKY.cloudShade
      if (lit > -0.45) return bayer(x, y) < (lit + 0.45) / 0.5 ? SKY.cloudShade : SKY.cloudDeep
      return far ? SKY.cloudDeep : bayer(x, y) < 0.5 ? SKY.cloudDeep : SKY.cloudBlue
    })
  })

/**
 * A tower of the Sky Pillar: a stone column of blocks lit from the left, a moulded band every few blocks, moss and
 * vines hanging off the bands; `far`, the same in the haze's blue. Its top may stand out of the frame. Cached.
 */
export const pillarSprite = (w: number, h: number, seed: number, far = false): Canvas =>
  cached(`sky-pillar|${w}|${h}|${seed}|${far}`, () => {
    const r = rng(seed * 41 + w * 3 + h)
    const block = far ? 7 : 9
    const band = block * r.int(4, 6)
    const vines = Array.from({ length: w }, () => (r() < 0.22 ? r.int(3, Math.round(band * 0.8)) : 0))
    const cracks = Array.from({ length: Math.round(h / 30) }, () => ({
      x: r.int(2, w - 3),
      y: r.int(0, h),
      l: r.int(3, 7),
    }))
    const P = far
      ? { lit: SKY.farLit, mid: SKY.far, dark: SKY.farDark, deep: SKY.farDark, joint: SKY.farJoint }
      : { lit: SKY.stoneLit, mid: SKY.stone, dark: SKY.stoneDark, deep: SKY.stoneDeep, joint: SKY.joint }
    return shade(w, h, (x, y) => {
      const u = x / Math.max(1, w - 1)
      const inBand = y % band
      // A moulding: a lit row over a dark one, a pixel proud on each side (drawn inside the sprite's width).
      if (inBand === 0) return P.lit
      if (inBand === 1) return P.dark
      if (!far && inBand > 1 && inBand - 1 < vines[x]!)
        return inBand - 1 === vines[x]! - 1 ? SKY.mossDark : SKY.moss
      if ((u < 0.06 || u > 0.94) && inBand < 3) return null
      if (y % block === 0 && inBand > 2) return P.joint
      for (const c of cracks) if (x === c.x && y >= c.y && y < c.y + c.l) return P.joint
      if (u < 0.12) return P.lit
      if (u < 0.3) return bayer(x, y) < (u - 0.12) / 0.18 ? P.mid : P.lit
      if (u < 0.62) return P.mid
      if (u < 0.82) return bayer(x, y) < (u - 0.62) / 0.2 ? P.dark : P.mid
      return u > 0.93 ? P.deep : P.dark
    })
  })

/**
 * A pillar's top to stand on: a flat stone disc (its far edge lit cream, a dark lip), a moulding under it, the column
 * going down `depth` pixels. Cached.
 */
export const pillarTop = (rx: number, ry: number, depth: number, seed: number): Canvas =>
  cached(`sky-top|${rx}|${ry}|${depth}|${seed}`, () => {
    const w = rx * 2 + 3
    const cy = ry + 1
    const h = cy + ry + depth + 3
    const col = Math.round(rx * 0.72)
    const r = rng(seed * 13 + rx)
    const vines = Array.from({ length: w }, () => (r() < 0.25 ? r.int(3, 12) : 0))
    return shade(w, h, (x, y) => {
      const dx = x - rx - 1
      const u = dx / (rx + 0.5)
      const top = (ry + 0.5) * Math.sqrt(Math.max(0, 1 - u * u))
      if (Math.abs(y - cy) <= top) {
        const d = (y - cy) / Math.max(1, top)
        if (d < -0.7) return SKY.stoneLit
        if (d > 0.65) return y - cy >= top - 1 ? SKY.stoneDeep : SKY.stoneDark
        return bayer(x, y) < 0.3 + 0.35 * (d + 1) ? SKY.stone : SKY.stoneLit
      }
      if (y < cy) return null
      const under = y - cy - top
      // The lip: the disc's thickness, then a moulding a little narrower.
      if (under < 3 && Math.abs(u) < 1)
        return under < 1 ? SKY.stoneDark : u < -0.3 ? SKY.stone : SKY.stoneDeep
      if (Math.abs(dx) > col)
        return under < 3 + vines[x]! && under < 15
          ? under === 2 + vines[x]!
            ? SKY.mossDark
            : SKY.moss
          : null
      if (under - 3 < vines[x]!) return SKY.moss
      const v = (dx + col) / (2 * col)
      if ((y - cy) % 9 === 0) return SKY.joint
      if (v < 0.15) return SKY.stoneLit
      if (v < 0.6) return bayer(x, y) < 0.15 ? SKY.stoneLit : SKY.stone
      return v > 0.88 ? SKY.stoneDeep : SKY.stoneDark
    })
  })

export interface Pillar {
  /** Its middle, its width, how far into the scene (0 near, 1 far). */
  x: number
  w: number
  depth: number
  seed: number
}

/** The towers standing out of the clouds: a few far ones in the haze, two near ones framing the middle. */
export function makePillars(r: Rng, w: number, h: number): Pillar[] {
  const n = Math.max(3, Math.round(w / 55))
  const far = Array.from({ length: n }, (_, i) => ({
    x: Math.round(lerp(w * 0.08, w * 0.92, (i + r.range(0.2, 0.8)) / n)),
    w: r.int(8, 13),
    depth: r.range(0.6, 1),
    seed: i + 11,
  }))
  const near = [
    { x: Math.round(w * 0.07), w: Math.max(18, Math.round(w * 0.11)), depth: 0, seed: 3 },
    { x: Math.round(w * 0.93), w: Math.max(16, Math.round(w * 0.1)), depth: 0.1, seed: 5 },
  ]
  return [...far.sort((a, b) => b.depth - a.depth), ...near].map((p) => ({
    ...p,
    w: Math.min(p.w, Math.round(h * 0.3)),
  }))
}

/**
 * The towers, from `base` (where the clouds swallow them) up past the top, raised by `lift` (the camera looking down:
 * the far ones, paler, move less).
 */
export function drawPillars(g: G, pillars: readonly Pillar[], base: number, lift: number, h: number) {
  const tall = h * 2
  for (const p of pillars) {
    const bottom = base - Math.round(lift * (1 - p.depth * 0.6))
    g.drawImage(pillarSprite(p.w, tall, p.seed, p.depth > 0.5), Math.round(p.x - p.w / 2), bottom - tall)
  }
}

export interface Puff {
  x: number
  y: number
  w: number
  h: number
  seed: number
  /** Drift, art pixels a second. */
  v: number
  far: boolean
}

/** The sea of clouds: rows of cumulus, the far ones small and slow, the near ones big, overlapping past both edges. */
export function makeSea(r: Rng, w: number, top: number, bottom: number, rows = 4): Puff[] {
  const out: Puff[] = []
  for (let i = 0; i < rows; i++) {
    const k = i / (rows - 1)
    const ph = Math.round(lerp(10, 30, k))
    const y = Math.round(lerp(top, bottom, k))
    const pw = Math.round(ph * r.range(2.4, 3.4))
    for (let x = -pw; x < w + pw; x += Math.round(pw * 0.62))
      out.push({
        x: x + r.int(-4, 4),
        y: y + r.int(-2, 2),
        w: pw + r.int(-4, 4),
        h: ph,
        seed: out.length + 1,
        v: lerp(1.5, 5, k) * (i % 2 ? 1 : -1),
        far: k < 0.34,
      })
  }
  return out
}

/** The sea, drifting each row its own way, wrapping round; lifted by `lift` (the camera); its body solid under it. */
export function drawSea(
  g: G,
  sea: readonly Puff[],
  t: number,
  w: number,
  h: number,
  lift: number,
  still = false,
) {
  const span0 = w + 120
  // The sea's body, from just under its first row down: what goes into the clouds is swallowed whole.
  const first = sea[0]
  if (first) rect(g, 0, first.y - lift - Math.round(first.h * 0.35), w, h, SKY.cloudShade)
  for (const p of sea) {
    const x = still ? p.x : ((((p.x + t * p.v + 60) % span0) + span0) % span0) - 60
    const y = p.y - lift
    g.drawImage(cloudSprite(p.w, p.h, p.seed, p.far), Math.round(x - p.w / 2), Math.round(y - p.h))
  }
}

/** Wind: fast white streaks across the sky. */
function feedWind(P: Particles, r: Rng, h: number, rate: number) {
  if (r() < rate)
    P.add({
      x: -10,
      y: r.range(h * 0.08, h * 0.75),
      vx: r.range(160, 260),
      vy: r.range(-4, 4),
      life: r.range(0.6, 1.2),
      size: 1,
      shape: 'streak',
      trail: 0.06,
      colors: ['#ffffff', SKY.cloudShade, SKY.pale],
    })
}

/** Light motes rising off the clouds. */
function feedMotes(P: Particles, r: Rng, w: number, h: number, rate: number) {
  if (r() < rate)
    P.add({
      x: r.range(0, w),
      y: h + 2,
      vx: r.range(-3, 3),
      vy: -r.range(10, 22),
      life: r.range(2.5, 4),
      size: 1,
      shape: 'sq',
      colors: ['#ffffff', SKY.paleGold, SKY.gold, SKY.jade],
    })
}

/**
 * The stage behind the raid's opening (w×h art pixels): the day and its sun, far towers in the haze, the sea of clouds
 * drifting, the pillar top the Pokémon stands on (over the clouds), the wind and the motes. Stepped on the trailer's
 * clock in 1/60 s steps, so any frame comes out the same.
 */
export class SkyStage {
  private readonly pillars: Pillar[]
  private readonly sea: Puff[]
  private readonly r: Rng
  private wind = new Particles()
  private motes = new Particles()
  private last = -1

  constructor(
    private readonly w: number,
    private readonly h: number,
    private readonly pad: { x: number; y: number; rx: number; ry: number },
    private readonly seaTop: number,
  ) {
    this.r = rng(w * 19 + h * 3 + 384)
    this.pillars = makePillars(this.r, w, h).filter((p) => p.depth > 0.5)
    this.sea = makeSea(this.r, w, seaTop, h + 10)
  }

  private step(dt: number) {
    feedWind(this.wind, this.r, this.h, dt * 2.2)
    feedMotes(this.motes, this.r, this.w, this.h, dt * 5)
    this.wind.update(dt)
    this.motes.update(dt)
  }

  draw(g: G, t: number) {
    if (t < this.last || this.last < 0) {
      this.wind = new Particles()
      this.motes = new Particles()
      // As if it had been running: the wind and the motes already out.
      for (let i = 0; i < 150; i++) this.step(1 / 30)
      this.last = t
    }
    for (; this.last + 1 / 60 <= t; this.last += 1 / 60) this.step(1 / 60)
    const { w, h, pad } = this
    g.drawImage(skyBackdrop(w, h), 0, 0)
    const sun = Math.round(h * 0.55)
    g.drawImage(glow(sun, SKY.sun, 1.6, 0.85), Math.round(w * 0.72) - sun, Math.round(h * 0.05) - sun)
    drawPillars(g, this.pillars, this.seaTop + 6, 0, h)
    drawSea(g, this.sea, t, w, h, 0)
    g.drawImage(
      pillarTop(pad.rx, pad.ry, h, 9),
      Math.round(pad.x - pad.rx - 1),
      Math.round(pad.y - pad.ry - 1),
    )
    this.motes.draw(g)
    this.wind.draw(g)
  }
}
