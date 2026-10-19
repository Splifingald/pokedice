// Rayquaza's raid in the sky (docs/15 §14), on the pixel engine like Giratina's (portalRaid.ts) and Darkrai's
// (nightmareRaid.ts): the raid's stage (a bright sky over a sea of clouds, the Sky Pillar's towers rising out of it,
// each Pokémon on a pillar's top) and its opening (Rayquaza coming down out of the sky through a gap in the clouds).
// Light tones where the other two are dark: the day's blues, the clouds' whites, the stone's creams, Rayquaza's emerald
// and gold. Words come from the screen (the raid intro's name, bars, trainers and GO!).
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  clamp,
  ease,
  ellipseLine,
  glow,
  lerp,
  Particles,
  polyline,
  rect,
  ring,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { layoutFor, type Point } from '../scenes'
import { drawSprite, spriteFrame } from '../sprites'
import { H, screenFlash, screenShake, skippingNow, W, within, type Cue, type Timeline } from '../timeline'
import { drawRays, gleam } from './legend'
import { burstRings, quiet, type PortalLoop, type SceneSize } from './portal'
import { RAID_ENTRANCE_DUR, RAID_ENTRANCE_REVEAL } from './portalRaid'

/** Rayquaza: its raids play in the sky. */
export const RAYQUAZA = 384

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

export interface SkyStageOptions {
  /** The pillar tops the Pokémon stand on (x, y: where the feet go). */
  pads: readonly { x: number; y: number; rx: number; ry: number; front?: boolean }[]
  /** Where the sea of clouds begins. */
  sea: number
  still?: boolean
}

/**
 * The sky's stage on a loop (behind a raid's sprites): the day, far towers in the haze, the sea of clouds drifting,
 * the pillar tops to stand on (a `front` one over the clouds), the wind and the motes. `still`: one frame, held.
 */
export function skyStageLoop(w: number, h: number, o: SkyStageOptions): PortalLoop {
  const r = rng(w * 19 + h * 3 + 384)
  const pillars = makePillars(r, w, h).filter((p) => p.depth > 0.5)
  const sea = makeSea(r, w, o.sea, h + 10)
  const wind = new Particles()
  const motes = new Particles()
  const still = !!o.still
  const step = (dt: number) => {
    feedWind(wind, r, h, dt * 2.2)
    feedMotes(motes, r, w, h, dt * 5)
    wind.update(dt)
    motes.update(dt)
  }
  if (!still) for (let i = 0; i < 150; i++) step(1 / 30)
  return {
    step(_t, dt) {
      if (!still) step(dt)
    },
    draw(g, t) {
      g.drawImage(skyBackdrop(w, h), 0, 0)
      const sun = Math.round(h * 0.55)
      g.drawImage(glow(sun, SKY.sun, 1.6, 0.85), Math.round(w * 0.72) - sun, Math.round(h * 0.05) - sun)
      drawPillars(g, pillars, o.sea + 6, 0, h)
      for (const p of o.pads.filter((q) => !q.front))
        g.drawImage(pillarTop(p.rx, p.ry, h, 7), Math.round(p.x - p.rx - 1), Math.round(p.y - p.ry - 1))
      drawSea(g, sea, still ? 0 : t, w, h, 0, still)
      for (const p of o.pads.filter((q) => q.front))
        g.drawImage(pillarTop(p.rx, p.ry, h, 9), Math.round(p.x - p.rx - 1), Math.round(p.y - p.ry - 1))
      motes.draw(g)
      wind.draw(g)
    },
  }
}

/** The battle stage's: the raid Pokémon's pillar on the right, yours bottom left over the clouds (layoutFor's feet). */
export function skyBattleStage(still = false): PortalLoop {
  const L = layoutFor(W, H)
  return skyStageLoop(W, H, {
    pads: [
      { x: L.foe.x, y: L.foe.y + 1, rx: 40, ry: 9 },
      { x: L.own.x, y: L.own.y - 5, rx: 66, ry: 14, front: true },
    ],
    sea: Math.round(H * 0.7),
    still,
  })
}

// ---------------------------------------------------------------- the entrance

export interface SkyEntranceParams extends SceneSize {
  /** Rayquaza's front sprite key. */
  mon: string
  shiny?: boolean
  short?: boolean
}

type EntranceState = {
  r: Rng
  fx: Particles
  trail: Particles
  wind: Particles
  motes: Particles
  rays: Canvas
  pillars: Pillar[]
  sea: Puff[]
  ceiling: { x: number; y: number; w: number; h: number; seed: number }[]
  bolts: { at: number; dur: number; pts: [number, number][] }[]
  shakes: [number, number, number][]
}

/** A glow whose size and strength change every frame, stepped (4 art pixels, eighths) so the cache stays small. */
const steppedGlow = (r: number, color: string, power: number, k: number) =>
  glow(Math.max(4, Math.round(r / 4) * 4), color, power, Math.round(clamp(k) * 8) / 8)

/** The shaft of light it comes down: `sw` either side of the middle, `len` tall, at a strength of `lv` eighths. Cached. */
const shaftSprite = (sw: number, len: number, lv: number) =>
  cached(`sky-shaft|${sw}|${len}|${lv}`, () =>
    shade(sw * 2 + 1, len, (x, y) => {
      const k = (1 - Math.abs(x - sw) / (sw + 1)) * (lv / 8)
      return k * (0.6 + 0.4 * (1 - y / len)) > bayer(x, y) + 0.15 ? SKY.sun : null
    }),
  )

/** Emerald lightning: a dark-green body, the emerald on it, a white core. */
function drawBolt(g: G, pts: readonly [number, number][]) {
  const at = (dx: number, dy: number) =>
    pts.map(([x, y]) => [Math.round(x) + dx, Math.round(y) + dy] as [number, number])
  polyline(g, at(1, 1), SKY.deep, 2)
  polyline(g, at(0, 0), SKY.emerald, 2)
  polyline(g, at(0, 0), '#ffffff', 1)
}

/**
 * Rayquaza's raid opening, the raid intro's scene for its raids (legend.ts's entrance in the sky): two white pulses;
 * the camera tilts up out of the sea of clouds along the Sky Pillar's towers; a gap tears open in the clouds above,
 * light pouring down through it, emerald lightning in it; two heartbeats; Rayquaza's silhouette dives out of the gap,
 * weaving down the column of light, its outline flickering emerald and gold, a trail of green light behind; gold rays
 * and a gleam; the reveal at the raid intro's white-out (a flash, rings, the roar, a quake, the clouds blown back, a
 * shaft of light), the shiny sparkle if it is; then it hovers in the light, the wind streaming past, lightning crackling
 * round it now and then. The raid intro lays its words over it at their usual times, and keeps its Skip.
 */
export function skyRaidEntranceTimeline(p: SkyEntranceParams): Timeline<EntranceState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const c = { x: Math.round(w / 2), y: Math.round(h * 0.45) }
  const R = Math.max(16, Math.round(Math.min(w * 0.38, h * 0.2)))
  const T_GAP = 0.55
  const T_SIL = 1.7
  const T_RAYS = 2.2
  const T_REVEAL = RAID_ENTRANCE_REVEAL
  const T_SHINY = T_REVEAL + 0.3
  const TILT = 1.8
  const feet = { x: c.x, y: Math.round(c.y + R * 0.95) }
  const gapC = { x: c.x, y: Math.round(-h * 0.04) }
  const seaTop = Math.round(h * 0.74)
  // The camera starts this far down, in the clouds, and tilts up to the sky.
  const LIFT = Math.round(h * 0.55)
  const lift = (t: number) => Math.round(LIFT * (1 - ease.ioS(span(t, 0.1, TILT))))
  const AURA = ['#ffffff', SKY.jade, SKY.emerald, SKY.gold] as const
  return {
    id: 'sky-raid-entrance',
    dur: RAID_ENTRANCE_DUR,
    setup() {
      const r = rng(3840)
      // The clouds overhead, two staggered rows across the top: they part from the middle.
      const ceiling: EntranceState['ceiling'] = []
      for (const [row, y0] of [
        [0, Math.round(h * 0.03)],
        [1, Math.round(h * 0.09)],
      ] as const)
        for (let x = -36 + row * 18; x < w + 40; x += 36)
          ceiling.push({
            x: x + r.int(-4, 4),
            y: y0 + r.int(-3, 3),
            w: r.int(52, 74),
            h: r.int(22, 30),
            seed: 100 + ceiling.length,
          })
      const bolts = [1.05, 1.32, 2.35].map((at) => {
        const x0 = gapC.x + r.range(-w * 0.3, w * 0.3)
        return {
          at,
          dur: 0.14,
          pts: bolt(r, x0, 0, x0 + r.range(-30, 30), r.range(h * 0.18, h * 0.32), 0.3, 5),
        }
      })
      // Crackling round it once it's out.
      for (let k = 0; k < 5; k++) {
        const at = T_REVEAL + 0.75 + k * 0.62
        const a = r.range(0, Math.PI * 2)
        const x0 = feet.x + Math.cos(a) * R * 0.9
        const y0 = feet.y - 34 + Math.sin(a) * R * 0.7
        bolts.push({
          at,
          dur: 0.1,
          pts: bolt(r, x0, y0, x0 + r.range(-22, 22), y0 + r.range(-26, 26), 0.35, 4),
        })
      }
      return {
        r,
        fx: new Particles(),
        trail: new Particles(),
        wind: new Particles(),
        motes: new Particles(),
        rays: canvas(w, h),
        pillars: makePillars(r, w, h),
        // Deep enough that the opening starts inside the clouds.
        sea: makeSea(r, w, seaTop, seaTop + LIFT + Math.round(h * 0.35), 7),
        ceiling,
        bolts,
        shakes: [
          [T_SIL + 0.05, 0.3, 1],
          [T_REVEAL, 0.9, 3],
        ],
      }
    },
    step(s, t, dt) {
      const r = s.r
      s.fx.update(dt)
      s.trail.update(dt)
      s.wind.update(dt)
      s.motes.update(dt)
      feedWind(s.wind, r, h, t < T_REVEAL ? 0.35 : 0.22)
      if (t > T_GAP) feedMotes(s.motes, r, w, h, t > T_REVEAL ? 0.35 : 0.18)
      // Its dive: green light shed along the way, and speed lines streaming up past it.
      if (t >= T_SIL && t < T_REVEAL) {
        const at = divePos(t)
        for (let k = 0; k < 3; k++)
          s.trail.add({
            x: at.x + r.range(-10, 10),
            y: at.y - r.range(10, 50),
            vx: r.range(-8, 8),
            vy: -r.range(10, 40),
            drag: 1.5,
            life: r.range(0.4, 0.8),
            size: r.int(1, 2),
            shape: r() < 0.3 ? 'star' : 'sq',
            colors: [SKY.ozone, SKY.jade, SKY.emerald, SKY.deep],
          })
        if (r() < 0.6)
          s.fx.add({
            x: at.x + r.range(-R, R),
            y: at.y + r.range(0, 20),
            vy: -r.range(220, 320),
            life: 0.25,
            size: 1,
            shape: 'streak',
            trail: 0.05,
            colors: ['#ffffff', SKY.pale],
          })
      }
      if (t >= T_REVEAL && t - dt < T_REVEAL) {
        for (let k = 0; k < 56; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 160)
          s.fx.add({
            x: feet.x,
            y: feet.y - 32,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: AURA,
          })
        }
        // The clouds blown back by the blast.
        for (let k = 0; k < 26; k++) {
          const side = k % 2 ? 1 : -1
          s.fx.add({
            x: feet.x + side * r.range(4, 20),
            y: seaTop + r.range(-6, 10),
            vx: side * r.range(60, 170),
            vy: r.range(-18, 6),
            drag: 2.2,
            life: r.range(0.8, 1.3),
            size: r.int(3, 6),
            shape: 'smoke',
            colors: [SKY.cloud, SKY.cloudShade, SKY.cloudDeep],
            light: '#ffffff',
          })
        }
      }
      for (const [t0, rr] of [
        [T_SHINY, 22],
        [T_SHINY + 0.25, 34],
      ] as const)
        if (p.shiny && t >= t0 && t - dt < t0)
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
      const L = lift(t)
      g.fillStyle = SKY.dawn
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      // The sky moves least of all.
      g.drawImage(skyBackdrop(w, h + LIFT), 0, -Math.round(L * 0.25) - Math.round(LIFT * 0.75))
      // The light through the gap: a glow, then the rays turning down from it.
      const open = ease.outC(span(t, T_GAP, T_GAP + 1.1))
      if (open > 0) {
        const gr = Math.round(w * 0.5 * (0.5 + 0.5 * open))
        const glowAt = steppedGlow(gr, SKY.sun, 1.4, 0.95 * open)
        g.drawImage(glowAt, gapC.x - (glowAt.width >> 1), gapC.y - (glowAt.height >> 1) - L)
      }
      const rk = span(t, T_GAP + 0.2, T_GAP + 0.9) * (t > T_REVEAL + 0.4 ? 0.55 : 1)
      if (rk > 0) {
        // Turning round the gap, then round Rayquaza as it comes down into them.
        const m = ease.ioS(span(t, T_RAYS - 0.3, T_RAYS + 0.3))
        const rc = { x: lerp(gapC.x, feet.x, m), y: Math.round(lerp(gapC.y - L, feet.y - 32, m)) }
        drawRays(s.rays, rc, t, SKY.paleGold, rk)
        g.drawImage(s.rays, 0, 0)
      }
      drawPillars(g, s.pillars, seaTop + 4, L, h)
      // The clouds overhead, parting from the middle (a solid bank behind them, either side of the gap).
      const gapW = w * 0.34 * open
      const ceilY = -Math.round(L * 0.9)
      const bank = Math.round(h * 0.05) + ceilY
      if (bank > 0) {
        rect(g, 0, 0, Math.max(0, c.x - gapW * 0.7), bank, SKY.cloudShade)
        rect(g, c.x + gapW * 0.7, 0, w, bank, SKY.cloudShade)
      }
      for (const q of s.ceiling) {
        const side = q.x < c.x ? -1 : 1
        const x = q.x + side * gapW * Math.max(0, 1 - Math.abs(q.x - c.x) / (w * 0.8))
        g.drawImage(cloudSprite(q.w, q.h, q.seed), Math.round(x - q.w / 2), q.y + ceilY - q.h + 8)
      }
      for (const b of s.bolts) {
        if (!within(t, b.at, b.at + b.dur)) continue
        if (b.at < T_REVEAL) screenFlash(g, SKY.ozone, 0.25)
        drawBolt(g, b.pts)
      }
      // The column of light it comes down: a shaft from the gap, widening as it lands.
      const shaft = span(t, T_SIL - 0.2, T_SIL + 0.3) * (1 - span(t, T_REVEAL + 0.2, T_REVEAL + 0.9))
      const lv = Math.round(shaft * 8)
      if (lv > 0) {
        const sw = Math.round(lerp(3, R * 0.8, span(t, T_SIL, T_REVEAL)) / 2) * 2
        g.drawImage(shaftSprite(sw, feet.y, lv), feet.x - sw, 0)
      }
      if (t >= T_SIL) {
        if (t < T_REVEAL) {
          // Diving out of the gap, weaving down the light: a dark silhouette on the bright sky, its rim flickering.
          s.trail.draw(g)
          const at = divePos(t)
          drawSprite(g, p.mon, at.x, at.y, {
            sil: SKY.shadow,
            outline: Math.floor(t * 12) % 3 === 0 ? SKY.gold : SKY.emerald,
          })
          const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.55)
          if (gp > 0 && gp < 1) gleam(g, p.mon, feet, at.y - feet.y, gp)
        } else {
          const ar = Math.round(R * 1.15)
          g.drawImage(glow(ar, SKY.paleGold, 1.3, 0.7), feet.x - ar, feet.y - 34 - ar)
          const bob = Math.floor((t - T_REVEAL) * 1.6) % 2
          // Rings of emerald light spiralling up round it (Dragon Ascent): their far half behind it, the near over it.
          const rings = ascentRings(t)
          for (const q of rings) ellipseLine(g, feet.x, q.y, q.rx, q.ry, q.c, Math.PI, Math.PI * 2)
          drawSprite(g, p.mon, feet.x, feet.y - bob, {
            flash: Math.max(0, 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4)),
            outline: Math.floor(t * 8) % 2 ? SKY.jade : SKY.gold,
          })
          for (const q of rings) ellipseLine(g, feet.x, q.y, q.rx, q.ry, q.c, 0, Math.PI)
        }
      }
      drawSea(g, s.sea, t, w, h, L)
      s.motes.draw(g)
      burstRings(g, { x: feet.x, y: feet.y - 32 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, '#ffffff'],
        [0.14, SKY.emerald],
        [0.28, SKY.gold],
      ])
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1) {
          const rr = Math.round(10 + 40 * q)
          g.drawImage(ring(rr, 2, '#ffffff', 1 - q), feet.x - rr - 1, feet.y - 34 - rr - 1)
        }
      }
      s.fx.draw(g)
      s.wind.draw(g)
      g.restore()
      // Two white pulses to open; the reveal's white-out.
      const white = Math.max(
        0.85 * Math.sin(Math.PI * span(t, 0, 0.3)),
        0.6 * Math.sin(Math.PI * span(t, 0.35, 0.65)),
      )
      if (white > 0) screenFlash(g, '#ffffff', white)
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.85 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
    },
    cues: () =>
      [
        [0.02, () => quiet('sky.gust')],
        [0.36, () => quiet('sky.shimmer')],
        [T_GAP, () => quiet('sky.gust')],
        [1.05, () => quiet('sky.thunder')],
        [1.32, () => quiet('sky.thunder')],
        [1.5, () => quiet('legend.heart')],
        [T_SIL, () => quiet('sky.dive')],
        [1.8, () => quiet('legend.heart')],
        [2.35, () => quiet('sky.thunder')],
        [T_REVEAL, (hud) => (quiet('legend.roar'), hud.beat?.('roar'))],
        [T_SHINY, () => !!p.shiny && !skippingNow() && fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => !!p.shiny && !skippingNow() && fxSound('hatch.shiny', 1)],
      ] satisfies Cue<EntranceState>[],
  }

  /** The rings rising round it once it's out, one every 0.8 s: where each is and its colour. */
  function ascentRings(t: number): { y: number; rx: number; ry: number; c: string }[] {
    const out: { y: number; rx: number; ry: number; c: string }[] = []
    for (let t0 = T_REVEAL + 0.6; t0 < RAID_ENTRANCE_DUR; t0 += 0.8) {
      const q = span(t, t0, t0 + 1.1)
      if (q <= 0 || q >= 1) continue
      const rx = Math.round(R * (0.85 + 0.35 * q))
      out.push({
        y: Math.round(feet.y - 6 - q * R * 2.6),
        rx,
        ry: Math.max(2, Math.round(rx * 0.26)),
        c: q < 0.45 ? SKY.emerald : q < 0.8 ? SKY.jade : SKY.ozone,
      })
    }
    return out
  }

  /** Where its feet are on the dive: from above the top, weaving less and less, down to where it hovers. */
  function divePos(t: number): Point {
    const fh = spriteFrame(p.mon)?.height ?? 64
    const q = ease.outC(span(t, T_SIL, T_REVEAL - 0.1))
    const sway = Math.sin((t - T_SIL) * 7) * R * 0.9 * (1 - q)
    return { x: Math.round(feet.x + sway), y: Math.round(lerp(-fh * 0.2, feet.y, q)) }
  }
}
