// A Gym Leader's entrance (docs/68): one scene for every leader, in the colours of its gym's type. Only the colours,
// the leader's picture and its name change; the film is the same for all.
//
// A dark stadium, its crest dim on the far wall, a figure standing at the far end of the court. Three pairs of
// floodlights bang on, near to far, pooling the court in the type's light; the court's lines race from our feet to the
// leader's; the crest ignites ring by ring behind them and starts to turn, the figure now a black shape against it. A
// slanted band slices across the screen on the leader's face, speed lines streaming past. The band snaps shut, every
// beam swings onto the leader, light streams in and the camera rushes down the court; at the reveal a shockwave runs
// over the floor and the crowd's cameras flash. The shared ending follows (cinema/champion.ts): the card with its name
// and its balls, the dissolve into the gym's own ground, the throw.
import { hiss, tone } from '@/audio/sfx'
import type { PokeType } from '@/engine/types'
import { DAYBREAK_TYPES } from '@/theme/colors'
import {
  bayer,
  canvas,
  clamp,
  ease,
  glow,
  lerp,
  mix,
  rect,
  rgba,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite, spriteFrame, spriteSize } from '../../sprites'
import { H, W } from '../../timeline'
import { championCinema, type ChampionCinema, type ChampionSample, type ChampionState } from './champion'
import { dissolve, pulse } from './kit'

const REVEAL = 4.15
/** The floodlights, near pair first. */
const T_LAMPS = [0.4, 0.68, 0.94] as const
/** The court's lines tracing from the camera to the leader. */
const T_TRACE = 1.12
const T_TRACED = 1.95
/** The crest: its outer ring, its star, its gem. */
const T_CREST = 2.0
/** The close-up band: open, shut. */
const T_BAND = 2.62
const T_SHUT = 3.42
const BAND_SNAP = 0.1
/** Every beam onto the leader, the rush down the court. */
const T_CHARGE = 3.52

// ---------------------------------------------------------------- the stadium, in world units (1 unit = 1 px at F)
/** Focal length, the eye's height, the horizon's row. */
const F = 100
const EYE = 36
const HZ = 60
/** The leader, the far wall, the camera's first and last depth (the leader then at its own size). */
const Z_L = 1000
const Z_BACK = 1150
const Z_CAM0 = 40
const Z_CAM1 = Z_L - F
/** The court: its half-width, its two ends, its middle and centre circle. */
const CX = 72
const Z_NEAR = 220
const Z_FAR = 1060
const Z_MID = 640
const R_MID = 58
/** The leader's box: a ring round its feet. */
const R_BOX = 34
/** The wall: the barrier's top, the stands' rows, its top; the crest's centre and radius. */
const BARRIER = 24
const ROW = 11
const WALL_TOP = 200
const CREST_Y = 104
const CREST_R = 92
/** The banners hanging either side of the crest. */
const BANNER_X = 150
const BANNER_W = 16
/** The floodlights' pools on the court, one pair per lamp time. */
const POOLS_Z = [380, 690, 960] as const
const POOL_X = 74

/** The leader's sample for each type (the admin's Watch, the FX lab, the review film): a leader of that type. */
const SAMPLES: Record<PokeType, ChampionSample> = {
  normal: { trainer: '/trainers/classes/johto/whitney.png', name: 'Whitney', lead: 35, ace: 241, team: 2 },
  fire: { trainer: '/trainers/classes/champion-blaine.png', name: 'Blaine', lead: 59, ace: 58, team: 3 },
  water: { trainer: '/trainers/classes/champion-misty.png', name: 'Misty', lead: 120, ace: 121, team: 2 },
  electric: {
    trainer: '/trainers/classes/champion-lt-surge.png',
    name: 'Lt. Surge',
    lead: 26,
    ace: 25,
    team: 3,
  },
  grass: { trainer: '/trainers/classes/champion-erika.png', name: 'Erika', lead: 71, ace: 114, team: 3 },
  ice: { trainer: '/trainers/classes/galar/melony.png', name: 'Melony', lead: 873, ace: 131, team: 3 },
  fighting: { trainer: '/trainers/classes/galar/bea.png', name: 'Bea', lead: 675, ace: 68, team: 3 },
  poison: { trainer: '/trainers/classes/champion-koga.png', name: 'Koga', lead: 110, ace: 109, team: 3 },
  ground: {
    trainer: '/trainers/classes/champion-giovanni.png',
    name: 'Giovanni',
    lead: 112,
    ace: 111,
    team: 3,
  },
  flying: { trainer: '/trainers/classes/johto/falkner.png', name: 'Falkner', lead: 16, ace: 17, team: 2 },
  psychic: { trainer: '/trainers/classes/champion-sabrina.png', name: 'Sabrina', lead: 65, ace: 49, team: 3 },
  bug: { trainer: '/trainers/classes/kalos/viola.png', name: 'Viola', lead: 283, ace: 666, team: 2 },
  rock: { trainer: '/trainers/classes/champion-brock.png', name: 'Brock', lead: 74, ace: 95, team: 2 },
  ghost: { trainer: '/trainers/classes/johto/morty.png', name: 'Morty', lead: 92, ace: 94, team: 3 },
  dragon: { trainer: '/trainers/classes/galar/raihan.png', name: 'Raihan', lead: 844, ace: 884, team: 3 },
  dark: { trainer: '/trainers/classes/galar/piers.png', name: 'Piers', lead: 687, ace: 862, team: 3 },
  steel: { trainer: '/trainers/classes/johto/jasmine.png', name: 'Jasmine', lead: 81, ace: 208, team: 3 },
  fairy: { trainer: '/trainers/classes/kalos/valerie.png', name: 'Valerie', lead: 303, ace: 700, team: 3 },
}

export const GYM_CINEMA_TYPES = Object.keys(SAMPLES) as PokeType[]

/** The type's colours: its light, its own, and the ramps every surface is lit along. */
interface Theme {
  aura: readonly [string, string, string, string]
  /** Lit floor, dark to the type's light (8 steps). */
  floor: readonly number[]
  /** The wall and stands: darker, cooler (8 steps). */
  wall: readonly number[]
  /** The crest's metal: dark to white (6 steps). */
  crest: readonly number[]
  /** The crowd's clothes, four muted tones. */
  crowd: readonly number[]
  white: number
  light: number
  base: number
  deep: number
}

/** A colour as the ImageData's 32-bit pixel (little-endian RGBA). */
const u32 = (hex: string) => {
  const [r, g, b] = rgba(hex)
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
}

const BLACK = '#05040a'
const themes = new Map<PokeType, Theme>()
export function gymTheme(type: PokeType): Theme {
  let th = themes.get(type)
  if (th) return th
  const c = DAYBREAK_TYPES[type] ?? DAYBREAK_TYPES.normal
  const light = mix(c, '#ffffff', 0.55)
  const deep = mix(c, BLACK, 0.55)
  const steps = (dark: string, n: number, top: number) =>
    Array.from({ length: n }, (_, i) => {
      const k = i / (n - 1)
      // Dark to the type's own at `top`, then on toward its light: a lit surface takes the light's colour.
      return u32(k < top ? mix(dark, c, (k / top) * 0.9) : mix(c, light, (k - top) / (1 - top)))
    })
  th = {
    aura: ['#ffffff', light, c, deep],
    floor: steps('#07070f', 8, 0.72),
    wall: steps('#06060d', 8, 0.85),
    crest: [BLACK, mix(c, BLACK, 0.75), deep, c, light, '#ffffff'].map(u32),
    crowd: ['#1a1b2c', '#24223a', '#1d2532', '#2a2030'].map((h) => u32(mix(h, c, 0.12))),
    white: u32('#ffffff'),
    light: u32(light),
    base: u32(c),
    deep: u32(deep),
  }
  themes.set(type, th)
  return th
}

/** A small hash: crowd cells, their flashes. */
const hash = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** The camera: its depth and where the vanishing point sits (the leader's column at the end). */
function cam(t: number, foeX: number) {
  // A slow creep while the lights come on, on behind the band, then the rush that brakes on the leader.
  const z =
    t < T_CHARGE
      ? lerp(Z_CAM0, 560, ease.ioS(span(t, 0, T_CHARGE)))
      : lerp(560, Z_CAM1, ease.ioQ(span(t, T_CHARGE, REVEAL)))
  const vx = lerp(W / 2, foeX, ease.ioS(span(t, T_BAND - 0.1, T_CHARGE + 0.2)))
  return { z, vx }
}

/** How much a lamp pair is on: a bang over the top, settling. */
const lampOn = (t: number, i: number) => {
  const t0 = T_LAMPS[i]!
  if (t < t0) return 0
  return 1 + 0.5 * (1 - span(t, t0, t0 + 0.22))
}

/** Where the pool of lamp pair i lies: its own spot, swung onto the leader in the charge. */
function pool(t: number, i: number, side: number) {
  const q = ease.ioQ(span(t, T_CHARGE - 0.05 + i * 0.05, REVEAL - 0.1))
  return {
    x: lerp(side * POOL_X, side * 6, q),
    z: lerp(POOLS_Z[i]!, Z_L, q),
    rx: lerp(70, 34, q),
    rz: lerp(110, 50, q),
  }
}

/** Where the court's lines are lit to (their bright head at it). */
const traceZ = (t: number) => lerp(Z_NEAR - 40, Z_FAR + 30, ease.inQ(span(t, T_TRACE, T_TRACED)))

/** The crest's turn (radians) and how far it is lit: ring, star, gem, each 0..1. */
function crestState(t: number) {
  const spin = 0.35 * t + 2.2 * ease.inQ(span(t, T_CHARGE, REVEAL)) + 0.25 * span(t, REVEAL, REVEAL + 2)
  return {
    spin,
    ring: span(t, T_CREST, T_CREST + 0.12),
    star: span(t, T_CREST + 0.18, T_CREST + 0.3),
    gem: span(t, T_CREST + 0.36, T_CREST + 0.46),
    // Brighter as it charges, a burst at the reveal.
    heat:
      0.55 +
      0.45 * span(t, T_CHARGE, REVEAL) +
      0.4 * (1 - span(t, REVEAL, REVEAL + 0.6)) * (t >= REVEAL ? 1 : 0),
  }
}

interface Beam {
  sx: number
  sy: number
  ex: number
  ey: number
  w: number
  k: number
}

/** The beams on screen this frame: from each lamp (high, behind the pool) down to its pool. */
function beams(t: number, c: { z: number; vx: number }): Beam[] {
  const out: Beam[] = []
  for (let i = 0; i < 3; i++) {
    const on = lampOn(t, i)
    if (!on) continue
    for (const side of [-1, 1]) {
      const p = pool(t, i, side)
      const zs = POOLS_Z[i]! - 160
      const ds = zs - c.z
      const de = p.z - c.z
      if (de < 20) continue
      // A lamp the camera is passing under fades out of view rather than throwing its cone over the whole screen.
      const near = clamp((ds - 40) / 160)
      if (near <= 0) continue
      const sx = c.vx + (side * 190 * F) / ds
      const sy = HZ - ((240 - EYE) * F) / ds
      out.push({
        sx,
        sy,
        ex: c.vx + (p.x * F) / de,
        ey: HZ + (EYE * F) / de,
        w: Math.max(4, (p.rx * F) / de),
        k: 0.3 * Math.min(1, on) * near,
      })
    }
  }
  return out
}

/** A beam's light at a screen point: brightest down its axis, widening from the lamp to the floor. */
function beamAt(b: Beam, x: number, y: number) {
  const dx = b.ex - b.sx
  const dy = b.ey - b.sy
  const l2 = dx * dx + dy * dy
  const u = ((x - b.sx) * dx + (y - b.sy) * dy) / l2
  if (u < 0 || u > 1.02) return 0
  const px = b.sx + dx * u
  const py = b.sy + dy * u
  const d = Math.hypot(x - px, y - py)
  const w = lerp(1.5, b.w, u)
  return d < w ? b.k * (1 - d / w) * (0.5 + 0.5 * u) : 0
}

let img: ImageData | null = null
let buf: Uint32Array | null = null
let base: Canvas | null = null

/** The stadium, pixel by pixel: the floor, the court, the wall with its stands, banners and crest, the beams. */
function paintStadium(th: Theme, t: number, foeX: number): Canvas {
  if (!base) {
    base = canvas(W, H)
    img = base.g.createImageData(W, H)
    buf = new Uint32Array(img.data.buffer)
  }
  const b = buf!
  const c = cam(t, foeX)
  const bs = beams(t, c)
  const cr = crestState(t)
  const amb = 0.05 + 0.1 * span(t, T_LAMPS[0], T_LAMPS[2] + 0.3)
  const tz = traceZ(t)
  // The shockwave over the floor at the reveal, out from the leader's feet.
  const shock = t >= REVEAL ? 520 * ease.outC(span(t, REVEAL, REVEAL + 0.75)) : -1
  const shockK = 1 - span(t, REVEAL + 0.3, REVEAL + 0.75)
  const dW = Z_BACK - c.z
  const wallFoot = HZ + (EYE * F) / dW
  // The wall's LED ribbon running once the lines reach it.
  const ribbon = span(t, T_TRACED - 0.1, T_TRACED + 0.2)
  const flashRate =
    t < T_LAMPS[0] ? 0 : t < REVEAL ? 0.004 : 0.022 * (1 - span(t, REVEAL + 0.4, REVEAL + 2)) + 0.006
  const flashF = Math.floor(t * 15)
  const crestR2 = CREST_R * CREST_R
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5
    const floor = yc >= wallFoot
    // The floor's depth on this row, or the wall's height.
    const d = floor ? (EYE * F) / (yc - HZ) : dW
    const Y = floor ? 0 : EYE + ((HZ - yc) * dW) / F
    const Z = c.z + d
    const lw = Math.max(1.5, (0.75 * d) / F)
    for (let x = 0; x < W; x++) {
      const X = ((x + 0.5 - c.vx) * d) / F
      const dith = bayer(x, y)
      let beam = 0
      for (const bm of bs) beam += beamAt(bm, x + 0.5, yc)
      let col: number
      if (floor) {
        // Light: the room's, each pool's, the leader's own glow once the crest burns.
        let l = amb
        for (let i = 0; i < 3; i++) {
          const on = lampOn(t, i)
          if (!on) continue
          for (const side of [-1, 1]) {
            const p = pool(t, i, side)
            const e = ((X - p.x) / p.rx) ** 2 + ((Z - p.z) / p.rz) ** 2
            if (e < 1) l += 0.62 * on * (1 - e)
          }
        }
        const dl = Math.hypot(X, (Z - Z_L) * 0.8)
        l += 0.35 * cr.ring * cr.heat * clamp(1 - dl / 160)
        // Tiles: every other a shade darker, their seams darker still.
        const tx = Math.floor(X / 40)
        const tzc = Math.floor(Z / 40)
        if ((tx + tzc) & 1) l *= 0.85
        if (X - tx * 40 < lw * 0.6 || Z - tzc * 40 < lw * 0.6) l *= 0.7
        l += beam * 0.5
        col = th.floor[clamp(Math.floor(l * 7 + dith), 0, 7)]!
        // The court's lines: dim until the trace passes, lit after, a white head at the trace.
        const ax = Math.abs(X)
        const onLine =
          (Z > Z_NEAR - lw && Z < Z_FAR + lw && Math.abs(ax - CX) < lw) ||
          (ax < CX + lw &&
            (Math.abs(Z - Z_NEAR) < lw || Math.abs(Z - Z_FAR) < lw || Math.abs(Z - Z_MID) < lw)) ||
          Math.abs(Math.hypot(X, Z - Z_MID) - R_MID) < lw ||
          Math.abs(Math.hypot(X, Z - Z_L) - R_BOX) < lw
        if (onLine) {
          if (Z < tz - 60) col = l > 0.5 ? th.white : th.light
          else if (Z < tz) col = th.white
          else if (dith < 0.5) col = th.floor[clamp(Math.floor(l * 7) + 1, 0, 7)]!
        }
        if (shock > 0) {
          const r = Math.hypot(X, Z - Z_L)
          const e = Math.abs(r - shock)
          if (e < 10 + shock * 0.04 && dith < shockK * (1 - e / (10 + shock * 0.04)) * 1.2)
            col = e < 4 ? th.white : th.light
        }
      } else if (Y < WALL_TOP) {
        // The wall: the barrier, the ribbon along it, the stands above; the banners and the crest over them.
        let l = amb * 0.9 + beam * 0.25
        const ax = Math.abs(X)
        const cy = Y - CREST_Y
        const cr2 = X * X + cy * cy
        if (cr2 < crestR2 * 1.7) l += 0.18 * cr.ring * cr.heat * clamp(1 - Math.sqrt(cr2) / (CREST_R * 1.3))
        if (Y < BARRIER) {
          col = th.wall[clamp(Math.floor(l * 6 + dith + 0.6), 0, 7)]!
          if (Y > 12 && Y < 17) {
            // The ribbon: segments chasing out from the middle.
            const seg = Math.floor((ax - t * 160) / 14) & 1
            col = ribbon > 0 && ax < 900 * ribbon ? (seg ? th.light : th.base) : th.wall[1]!
          } else if (Y > BARRIER - 2) col = th.wall[clamp(Math.floor(l * 6) + 2, 0, 7)]!
        } else {
          const ry = Y - BARRIER
          const row = Math.floor(ry / ROW)
          const iy = ry - row * ROW
          const cell = Math.floor(X / 7)
          const h = hash(row, cell)
          if (iy < 1.6) col = th.wall[clamp(Math.floor(l * 6 + dith) + 1, 0, 7)]!
          else if (h < 0.75 && iy > ROW - 7) {
            // A spectator: head over shoulders, lit like the stands; a camera flash now and then.
            const fx = X - cell * 7
            const head = iy < ROW - 4.5 ? Math.abs(fx - 3.5) < 1.6 : Math.abs(fx - 3.5) < 2.8
            if (head && hash(row, cell, flashF) < flashRate) col = th.white
            else if (head) col = l > 0.3 && dith < l ? th.crowd[(h * 40) & 3]! : th.crowd[(h * 40 + 1) & 3]!
            else col = th.wall[clamp(Math.floor(l * 6 + dith), 0, 7)]!
          } else col = th.wall[clamp(Math.floor(l * 5 + dith), 0, 7)]!
        }
        // The banners: hanging either side, lit with the near lamps.
        const bx = ax - BANNER_X
        if (Math.abs(bx) < BANNER_W && Y > 40 && Y < 190) {
          const lit = span(t, T_LAMPS[1], T_LAMPS[1] + 0.1)
          const tip = Y < 40 + (BANNER_W - Math.abs(bx)) * 0.9
          if (tip) col = th.wall[1]!
          else if (Math.abs(bx) > BANNER_W - 2.2) col = lit ? th.light : th.wall[2]!
          else col = lit ? (dith < 0.5 + 0.4 * beam ? th.base : th.deep) : th.wall[1]!
        }
        if (cr2 < crestR2) col = crestPixel(th, X, cy, Math.sqrt(cr2), cr, dith, t)
      } else {
        // Above the wall: the roof's dark, the beams through it.
        col = th.wall[dith < 0.3 ? 1 : 0]!
      }
      // The beams' haze over everything, in the type's light.
      if (beam > 0 && dith < beam * 0.4) col = beam > 0.5 ? th.white : th.light
      b[y * W + x] = col
    }
  }
  base.g.putImageData(img!, 0, 0)
  return base
}

/** One pixel of the crest: a ringed medallion with an eight-pointed star and a gem, unlit until it ignites. */
function crestPixel(
  th: Theme,
  X: number,
  Y: number,
  r: number,
  cr: ReturnType<typeof crestState>,
  dith: number,
  t: number,
): number {
  const C = th.crest
  const R = CREST_R
  const a = Math.atan2(Y, X) + cr.spin
  // Unlit, it's a dark disc with a faint ring; lit, each part takes its metal ramp.
  if (r > R - 7) {
    // The outer ring, notched sixteen times, a highlight running round it.
    const notch = Math.abs(((a / (Math.PI * 2)) * 16) % 1) < 0.18 && r < R - 3
    if (cr.ring <= 0) return C[r > R - 2 ? 2 : 1]!
    const sheen = Math.cos(a - t * 2.4)
    return notch ? C[2]! : C[clamp(Math.floor(2.4 + sheen * 1.4 + cr.heat + dith * 0.8), 2, 5)]!
  }
  if (r > R * 0.66 && r < R * 0.66 + 3) return cr.ring > 0 ? C[dith < 0.5 ? 4 : 3]! : C[1]!
  // The star: eight points, each lit on one face and shaded on the other.
  const seg = ((a / (Math.PI * 2)) * 8 + 8) % 1
  const tri = Math.abs(seg - 0.5) * 2
  const rs = lerp(R * 0.82, R * 0.3, tri)
  if (r < rs) {
    if (cr.star <= 0) return C[1]!
    if (r < R * 0.2) {
      // The gem: white heart, pulsing.
      if (cr.gem <= 0) return C[2]!
      return r < R * 0.1 + 2 * Math.sin(t * 9) ? C[5]! : C[4]!
    }
    const lit = seg < 0.5
    const edge = rs - r < 2.2
    return edge ? C[5]! : C[clamp(Math.floor((lit ? 3.4 : 2.2) + cr.heat * 0.8 + dith * 0.6), 2, 5)]!
  }
  // The field between the star's points: deep, with rays wheeling round.
  const ray = Math.abs(((a / (Math.PI * 2)) * 24) % 1) < 0.1 && r > R * 0.3
  if (cr.ring > 0 && ray && dith < 0.5 * cr.heat) return C[2]!
  return C[1]!
}

// ---------------------------------------------------------------- the close-up band
let band: Canvas | null = null
/** How open the band is (its height in px) and its slant. */
function bandOpen(t: number) {
  if (t < T_BAND || t >= T_SHUT + BAND_SNAP) return 0
  const open = ease.outExpo(span(t, T_BAND, T_BAND + 0.16))
  const shut = 1 - ease.inC(span(t, T_SHUT, T_SHUT + BAND_SNAP))
  return 48 * open * shut
}

/**
 * The band across the screen: the leader's face, twice its size, drifting left over speed lines streaming the other
 * way; bright edges. Drawn column by column so its slanted edges stay on the pixel grid.
 */
function drawBand(g: G, s: ChampionState<{ th: Theme }>, t: number) {
  const h = bandOpen(t)
  if (h <= 0.5) {
    // The snap: a white line where it was, for a frame or two.
    if (t >= T_SHUT + BAND_SNAP && t < T_SHUT + BAND_SNAP + 0.05)
      for (let x = 0; x < W; x++) rect(g, x, Math.round(bandY(x)), 1, 1, '#ffffff')
    return
  }
  const th = s.th
  const A = th.aura
  if (!band) band = canvas(W, H)
  const bg = band.g
  bg.clearRect(0, 0, W, H)
  rect(bg, 0, 0, W, H, mix(A[3], BLACK, 0.5))
  // Speed lines, streaming right to left.
  for (let i = 0; i < 46; i++) {
    const y = 14 + ((i * 37) % 132)
    const len = 18 + ((i * 53) % 60)
    const v = 260 + ((i * 71) % 220)
    const x = W - ((i * 97 + (t - T_BAND) * v) % (W + len + 40)) + 20
    rect(bg, x, y, len, 1, i % 3 ? A[2] : A[1])
  }
  // The face: the picture at ×2, its top fifth on the band's middle, drifting slowly left.
  const key = s.p.trainer
  const sz = spriteSize(key)
  const frame = spriteFrame(key)
  if (frame) {
    const sc = 2
    const fx = Math.round(lerp(168, 150, span(t, T_BAND, T_SHUT)))
    const top = Math.round(bandY(fx) - sz.h * sc * 0.24)
    // A rim of the type's light, then the picture, tinted a little towards it.
    drawSprite(bg, key, fx, top + sz.h * sc, {
      sx: sc,
      sy: sc,
      outline: A[1],
      tint: { color: A[2], a: 0.18 },
    })
    // Its afterimages, trailing right.
    drawSprite(bg, key, fx + 10, top + sz.h * sc, { sx: sc, sy: sc, sil: A[2], alpha: 0.35 })
  }
  for (let x = 0; x < W; x++) {
    const cy = bandY(x)
    const y0 = Math.round(cy - h / 2)
    const y1 = Math.round(cy + h / 2)
    if (y1 <= y0) continue
    g.drawImage(band, x, y0, 1, y1 - y0, x, y0, 1, y1 - y0)
    rect(g, x, y0 - 2, 1, 2, A[0])
    rect(g, x, y1, 1, 2, A[0])
    rect(g, x, y0 - 3, 1, 1, A[2])
    rect(g, x, y1 + 2, 1, 1, A[2])
  }
}
const bandY = (x: number) => 62 - (x - W / 2) * 0.22

// ---------------------------------------------------------------- the scene
function makeGymCinema(type: PokeType): ChampionCinema {
  const th = gymTheme(type)
  const A = th.aura
  return championCinema<{ th: Theme }>({
    id: `gym-${type}`,
    reveal: REVEAL,
    seed: 68,
    aura: A,
    flash: A[1],
    shake: true,
    sample: SAMPLES[type],
    setup(st) {
      // The lamps' bangs, the rumble of the rush, the reveal's quake.
      st.screenShakes.push(
        [T_LAMPS[0], 0.16, 1],
        [T_LAMPS[1], 0.16, 1],
        [T_LAMPS[2], 0.18, 2],
        [T_CHARGE + 0.2, 0.4, 1],
        [REVEAL, 0.45, 3],
      )
      return { th }
    },
    step(s, t) {
      const r = s.r
      const fz = s.L.foe
      // Motes rising off the lit court.
      if (t > T_LAMPS[0] && t < REVEAL + 1.4 && r() < 0.7)
        s.fx.add({
          x: r.range(0, W),
          y: r.range(HZ + 8, H),
          vx: r.range(-4, 4),
          vy: -r.range(10, 26),
          life: r.range(1.2, 2.2),
          size: 1,
          shape: 'sq',
          colors: [A[1], A[2], A[3]],
        })
      // The crest's ignition: sparks thrown off its rim.
      const c = cam(t, fz.x)
      const sc = F / (Z_BACK - c.z)
      const crestX = c.vx
      const crestY = HZ - (CREST_Y - EYE) * sc
      if (t >= T_CREST && t < T_CREST + 1.5 / 60)
        for (let k = 0; k < 28; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(30, 90)
          s.fx.add({
            x: crestX + Math.cos(a) * CREST_R * sc,
            y: crestY + Math.sin(a) * CREST_R * sc,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.4, 0.8),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'plus',
            colors: [A[0], A[1], A[2]],
          })
        }
      // The charge: light streaming in from the edges onto the leader.
      if (t > T_CHARGE && t < REVEAL)
        for (let k = 0; k < 3; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: fz.x + Math.cos(a) * 150,
            y: fz.y - 40 + Math.sin(a) * 110,
            home: { x: fz.x, y: fz.y - 40, k: 900 },
            drag: 3,
            life: 0.5,
            size: r.int(1, 2),
            shape: 'sq',
            colors: [A[0], A[1], A[2]],
          })
        }
    },
    back(g, s, t, k) {
      dissolve(g, paintStadium(th, t, s.L.foe.x), k)
      if (k <= 0) return
      // The lamps' heads up in the roof, with their glare, while on screen.
      const c = cam(t, s.L.foe.x)
      for (let i = 0; i < 3; i++) {
        const on = lampOn(t, i)
        if (!on) continue
        const ds = POOLS_Z[i]! - 160 - c.z
        if (ds < 30) continue
        for (const side of [-1, 1]) {
          const x = Math.round(c.vx + (side * 190 * F) / ds)
          const y = Math.round(HZ - ((240 - EYE) * F) / ds)
          const gl = glow(Math.round(clamp((14 * F) / ds, 5, 16) * Math.min(1, on)), A[1])
          g.drawImage(gl, x - (gl.width >> 1), y - (gl.height >> 1))
          rect(g, x - 2, y - 1, 4, 3, '#ffffff')
        }
      }
    },
    before(g, s, t) {
      // The leader at the far end: a black shape, rimmed in the crest's light once it burns.
      const c = cam(t, s.L.foe.x)
      const d = Z_L - c.z
      const sc = F / d
      const y = Math.round(HZ + (EYE * F) / d) + 2
      const rim = span(t, T_CREST, T_CREST + 0.2)
      drawSprite(g, s.p.trainer, Math.round(c.vx), y, {
        sx: sc,
        sy: sc,
        sil: mix(A[3], BLACK, 0.7),
        outline:
          rim > 0 ? (pulse(t, T_CHARGE, REVEAL) > 0.6 && Math.floor(t * 16) % 2 ? A[0] : A[1]) : undefined,
      })
    },
    front(g, s, t, k) {
      drawBand(g, s, t)
      if (k <= 0) return
      const x = s.L.foe.x
      // At the reveal: a column of light down onto the leader, and a streak across the screen through it.
      const q = span(t, REVEAL - 0.04, REVEAL + 0.5)
      if (q > 0 && q < 1) {
        const w = Math.round(lerp(18, 0, ease.outC(q)))
        if (w > 0) {
          rect(g, x - w, 0, w * 2, s.L.foe.y, A[1])
          rect(g, x - Math.max(1, w >> 1), 0, Math.max(2, w), s.L.foe.y, '#ffffff')
        }
        const sw = Math.round(lerp(W, 0, ease.inQ(q)))
        rect(g, x - sw, s.L.foe.y - 44, sw * 2, 1, '#ffffff')
        rect(g, x - (sw >> 1), s.L.foe.y - 45, sw, 3, A[0])
      }
    },
    sounds: [
      ...T_LAMPS.map(
        (at, i) =>
          [
            at,
            () => (
              hiss(0.22, { freq: 260 + i * 60, type: 'lowpass', vol: 0.12 }),
              tone(70 - i * 6, 0.32, { type: 'sine', vol: 0.14, slide: -20 })
            ),
          ] as const,
      ),
      [T_TRACE, () => hiss(0.85, { freq: 500, slide: 2600, vol: 0.04 })],
      [T_CREST, () => tone(220, 0.22, { vol: 0.035 })],
      [T_CREST + 0.18, () => tone(330, 0.22, { vol: 0.035 })],
      [T_CREST + 0.36, () => tone(440, 0.4, { vol: 0.04, slide: 40 })],
      [T_BAND, () => hiss(0.3, { freq: 3200, slide: -2400, vol: 0.08 })],
      [T_SHUT, () => hiss(0.12, { freq: 1800, vol: 0.06 })],
      [
        T_CHARGE,
        () => (
          tone(80, 0.62, { type: 'sawtooth', vol: 0.035, slide: 260 }),
          hiss(0.62, { freq: 300, slide: 2800, vol: 0.05 })
        ),
      ],
      [
        REVEAL,
        () => (
          tone(48, 0.7, { type: 'sine', vol: 0.18, slide: -14 }),
          hiss(0.6, { freq: 240, type: 'lowpass', vol: 0.12 }),
          hiss(1.5, { freq: 1500, q: 0.5, vol: 0.05, at: 0.08 })
        ),
      ],
    ],
  })
}

const made = new Map<PokeType, ChampionCinema>()
/** A gym leader's entrance in its gym type's colours (one scene for all). */
export function gymCinemaFor(type: PokeType): ChampionCinema {
  let c = made.get(type)
  if (!c) made.set(type, (c = makeGymCinema(type)))
  return c
}
