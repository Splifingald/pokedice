// Nemona's entrance (docs/54), on the battle stage: the Academy's grand stairs at golden hour. First from the foot:
// Mesagoza's houses climbing both sides under strings of bunting, the stairs running up between them to the Academy,
// and two figures at the bottom with their backs to us, Nemona and her Pawmot. The Academy's bell rings and they're
// off: Pawmot a crackle of lightning up the right-hand side, lighting each lamp it passes, Nemona sprinting after it,
// pigeons bursting up off the steps, the camera tilting up the stairs after them to the Academy glowing in the low sun.
// Then from the top, looking back down over the city's roofs to the crater's far rim and the sun: Pawmot shoots over
// the last step first and skids onto the court; Nemona bounds up the stairs toward us, leaps the last flight, twirls
// in the air and lands on the top step. Pawmot charges up and throws an arc of lightning to her raised fist; it crackles
// there, and the reveal bursts it. Joy and speed, the race she always wants.
import { hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  clamp,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  mix,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dGradient, dissolve, pulse, tri } from '../kit'

const REVEAL = 4.5
/** The bell; the crouch; the start. */
const T_BELL = 0.42
const T_SET = 0.6
const T_GO = 0.82
/** The cut to the top of the stairs. */
const T_CUT = 2.0
/** Pawmot over the last step and onto the court. */
const T_PAW = 2.3
const T_PAW_DOWN = 2.54
/** Her last bound: the leap, the landing. */
const T_CREST = 3.16
const T_LAND = 3.76
/** Pawmot charging, its arc to her fist (no flash closer than 0.34 s to the reveal's). */
const T_CHARGE = 3.96
const T_ARC = 4.12

const PAWMOT = spriteKey(923, false)
const SPARK = ['#ffffff', '#fff6a0', '#ffe03a', '#ffb020'] as const
const FLAGS = ['#e8403a', '#ffd23a', '#3a9ae0', '#fff6e8', '#5ab84a', '#ff8a2a'] as const
/** The glints of the low sun. */
const GOLD = '#ffd890'
const ROSE = '#ffb878'

// ---------------------------------------------------------------- shot A: up the stairs from the foot
/** Shot A's picture is taller than the screen: the camera tilts up it. */
const AH = 272
const A_CX = 120
/** The stairs' vanishing point (they climb, so it lies above the street's) and the ground at depth 1. */
const A_VY = 60
const A_FOOT = 262
/** Half-widths at depth 1: the stairs, the planters' outer edge, the house fronts. */
const A_RAIL = 92
const A_WALL = 104
/** v 0 at the foot, 1 at the Academy's gate. */
const aZ = (v: number) => 1 + 4 * v
const aY = (z: number) => A_VY + (A_FOOT - A_VY) / z
const aX = (X: number, z: number) => A_CX + X / z
/** Shot A's camera: its top row on the tall picture, at the foot, then up the stairs after them. */
const camA = (t: number) => Math.round(lerp(AH - H, 0, ease.ioS(span(t, 0.95, 1.86))))
/** How far up the stairs they are in shot A: she accelerates; Pawmot is away first and faster. */
const herA = (t: number) => {
  const q = span(t, T_GO, T_CUT)
  return 0.02 + 0.46 * (0.3 * q + 0.7 * q * q)
}
const pawA = (t: number) => 0.02 + 0.66 * ease.outQ(span(t, T_GO, T_CUT))
const HER_X = -14
const PAW_X = 44
/** The lamps along both sides of shot A's stairs. */
const LAMPS_A = Array.from({ length: 8 }, (_, k) => 0.06 + k * 0.12)
/** The strings of bunting across shot A's street. */
const BUNTING_A = [0.1, 0.28, 0.46, 0.64]

/** The houses along shot A's street, each side: where it starts and ends (v), its height (px at depth 1), colour. */
interface House {
  v0: number
  v1: number
  h: number
  c: number
  /** Shutters' colour, window rhythm. */
  sh: string
  cols: number
}
const WALL_LIT = ['#fae4b8', '#f6cc98', '#f2bca4', '#fff2d4', '#eecaa0', '#f8d8a8'] as const
const SHUTTERS = ['#3a8a6a', '#3a6aa8', '#a8483a', '#6a8a3a'] as const

// ---------------------------------------------------------------- shot B: down from the top
/** The horizon; the stairs' vanishing point below it (they fall away down the hill). */
const HZ = 48
const BVX = 139.7
const BVY = 52.7
const B_HW = 46
/** u 0 at the top step (her landing), 1 at the foot by the plaza. */
const bZ = (u: number) => 1 + 3 * u
const STEPS = 40
/** The lamps along both sides of shot B's stairs, every fifth step. */
const LAMPS_B = Array.from({ length: 8 }, (_, k) => (5 * (k + 1) - 0.5) / STEPS)
const BUNTING_B = [0.24, 0.5]
/** Shot B's run: her (from where shot A left her) and Pawmot (ahead, on the left). */
const herB = (t: number) => lerp(0.5, 0.1, span(t, T_CUT, T_CREST))
const pawB = (t: number) => lerp(0.3, 0, span(t, T_CUT, T_PAW))
const PAW_L = -0.78
/** Where Pawmot stands on the court, left of the stairs. */
const PAW_END = { x: 106, y: 99 }
/** The sun, low over the crater's rim. */
const SUN = { x: 44, y: 41 }

type Bird = { x: number; y: number; vx: number; vy: number; at: number; s: number; ph: number }
type X = {
  buf: Canvas
  up: Canvas
  down: Canvas
  /** When Pawmot passes each lamp, in each shot. */
  passA: number[]
  passB: number[]
  birds: Bird[]
  gulls: { x: number; y: number; v: number; ph: number }[]
  dust: Particles
  zap: Particles
  trail: [number, number][]
}

const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** When a runner passes each mark (its progress over time is monotonic): sampled once, at setup. */
function passTimes(
  marks: readonly number[],
  at: (t: number) => number,
  t0: number,
  t1: number,
  down = false,
) {
  return marks.map((m) => {
    for (let t = t0; t <= t1; t += 1 / 120) if (down ? at(t) <= m : at(t) >= m) return t
    return Infinity
  })
}

// ---------------------------------------------------------------- shot A's picture
/** The houses along one side of the street, from the foot up toward the Academy, lower as the hill rises. */
function street(r: Rng): House[] {
  const out: House[] = []
  let v = -0.12
  let i = r.int(0, 5)
  while (v < 0.8) {
    const len = r.range(0.07, 0.13)
    out.push({
      v0: v,
      v1: Math.min(0.82, v + len),
      h: lerp(150, 92, clamp(v / 0.8)) * r.range(0.82, 1.08),
      c: i++ % WALL_LIT.length,
      sh: r.pick(SHUTTERS),
      cols: r.int(2, 4),
    })
    v += len + r.range(0.008, 0.02)
  }
  return out
}

/** The Academy at the top of the stairs: wings, the great hall, its tower with the round window, dome and flag. */
function academy(g: G) {
  const cx = A_CX
  const base = 101
  // Lit from the right and in front: right faces gold, left faces rose-shaded; far and hazy, so close in tone.
  const wall = '#f4d8b0'
  const wallSh = '#d0a49c'
  const roof = '#e07a44'
  const roofSh = '#a8503e'
  const roofLit = '#ffa868'
  const win = '#7a5a8a'
  const winLit = '#ffd47a'
  // Far wings, low, running off both sides.
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? 0 : cx + 42
    const w = cx - 42
    rect(g, x0, base - 22, w, 22, sd < 0 ? wallSh : wall)
    rect(g, x0, base - 27, w, 5, sd < 0 ? roofSh : roof)
    rect(g, x0, base - 27, w, 1, roofLit)
    for (let x = x0 + 3; x < x0 + w - 2; x += 7) {
      rect(g, x, base - 17, 3, 5, x % 3 ? win : winLit)
      rect(g, x, base - 18, 3, 1, wall)
    }
  }
  // The great hall.
  rect(g, cx - 42, base - 40, 84, 40, wall)
  rect(g, cx - 42, base - 40, 4, 40, wallSh)
  rect(g, cx + 39, base - 40, 3, 40, '#fff0d8')
  for (let y = base - 46; y < base - 40; y++) {
    const k = y - (base - 46)
    rect(g, cx - 40 - k, y, 80 + k * 2, 1, k % 2 ? roof : roofSh)
  }
  rect(g, cx - 40, base - 47, 80, 1, roofLit)
  // Two rows of tall arched windows, lit warm inside.
  for (const wy of [base - 34, base - 19])
    for (let k = -5; k <= 5; k++) {
      if (Math.abs(k) <= 1 && wy > base - 30) continue
      const wx = cx + k * 7 - 1
      rect(g, wx, wy, 3, 9, (k * 7 + wy) % 3 ? winLit : win)
      rect(g, wx + 1, wy - 1, 1, 1, (k * 7 + wy) % 3 ? winLit : win)
      rect(g, wx - 1, wy + 9, 5, 1, '#fff0d8')
    }
  // The gate: a great arch at the top of the stairs, warm light inside.
  rect(g, cx - 8, base - 22, 16, 22, '#5a3a4a')
  ellipse(g, cx, base - 22, 8, 5, '#5a3a4a')
  rect(g, cx - 6, base - 20, 12, 20, '#c88a5a')
  ellipse(g, cx, base - 20, 6, 4, '#c88a5a')
  rect(g, cx - 4, base - 16, 8, 16, '#ffcf80')
  rect(g, cx - 10, base - 28, 20, 2, '#fff0d8')
  // The tower over the gate.
  const tx = cx - 16
  rect(g, tx, base - 76, 32, 36, wall)
  rect(g, tx, base - 76, 3, 36, wallSh)
  rect(g, tx + 30, base - 76, 2, 36, '#fff0d8')
  // Its great round window: a rosette of spokes, the low sun in its glass.
  const wy = base - 60
  ellipse(g, cx, wy, 11, 11, '#fff0d8')
  ellipse(g, cx, wy, 9, 9, '#5a4a8a')
  for (let a = 0; a < 12; a++) {
    const an = (a / 12) * Math.PI * 2
    line(g, cx, wy, cx + Math.cos(an) * 9, wy + Math.sin(an) * 9, '#e8c890')
  }
  ellipse(g, cx, wy, 3, 3, '#ffd47a')
  rect(g, cx + 3, wy - 6, 2, 2, '#fff6d0')
  rect(g, cx + 5, wy - 4, 1, 2, '#fff6d0')
  // Cornice, dome with its ribs, the lantern, the flagpole (its pennant is drawn moving).
  rect(g, tx - 2, base - 78, 36, 3, '#fff0d8')
  rect(g, tx - 2, base - 76, 36, 1, '#c89a8a')
  for (let k = 0; k <= 13; k++) {
    const hw = Math.round(14 * Math.sqrt(1 - (k / 14) ** 2))
    const y = base - 79 - k
    rect(g, cx - hw, y, hw * 2 + 1, 1, roof)
    rect(g, cx - hw, y, Math.max(1, Math.round(hw * 0.5)), 1, roofSh)
    rect(g, cx + Math.round(hw * 0.4), y, Math.max(1, Math.round(hw * 0.5)), 1, roofLit)
    if (hw > 3) for (const f of [-0.55, 0, 0.55]) rect(g, cx + Math.round(f * hw), y, 1, 1, '#c86030')
  }
  rect(g, cx - 3, base - 98, 7, 6, wall)
  rect(g, cx - 1, base - 97, 3, 4, '#ffd47a')
  rect(g, cx - 4, base - 99, 9, 1, roofSh)
  rect(g, cx, base - 110, 1, 11, '#6a4a4a')
  // Bell turrets on the hall's corners: an open arch each, the bell drawn swinging.
  for (const sd of [-1, 1]) {
    const bx = cx + sd * 34
    rect(g, bx - 5, base - 62, 11, 22, sd < 0 ? wallSh : wall)
    rect(g, bx - 3, base - 58, 7, 9, '#4a2a3a')
    ellipse(g, bx, base - 58, 3, 2, '#4a2a3a')
    for (let k = 0; k < 10; k++) {
      const hw = Math.round(6 - k * 0.6)
      rect(g, bx - hw, base - 63 - k, hw * 2 + 1, 1, k % 3 === 0 ? roofSh : roof)
      rect(g, bx + Math.max(0, hw - 2), base - 63 - k, Math.min(2, hw + 1), 1, roofLit)
    }
  }
}

/** Where the bells hang (shot A's picture). */
const BELLS = [
  [A_CX - 34, 101 - 56],
  [A_CX + 34, 101 - 56],
] as [number, number][]

/** Shot A's picture: the sky, the Academy, the street of houses and the stairs between them, lamps and rails. */
function stairsUp(L: House[], R: House[]): Canvas {
  const cv = canvas(W, AH)
  const g = cv.g
  g.drawImage(dGradient(W, 104, ['#3a3a7a', '#5a4488', '#9a5a86', '#d87a72', '#f8a868', '#ffcf86']), 0, 0)
  rect(g, 0, 104, W, AH - 104, '#ffcf86')
  // Long clouds, lit from below and from the right by the low sun.
  const r = rng(923)
  for (let i = 0; i < 9; i++) {
    const x = r.range(-20, W + 10)
    const y = r.range(8, 60)
    const rx = r.range(16, 34)
    const ry = r.int(2, 3)
    ellipse(g, x + 1, y + 1, rx, ry, y > 40 ? '#ffd08a' : '#f0a07a')
    ellipse(g, x, y, rx, ry, y > 40 ? '#e89a86' : '#8a5a8a')
    rect(g, x - rx * 0.4, y - ry, rx * 0.9, 1, y > 40 ? '#f0b090' : '#9a6a92')
  }
  academy(g)
  const houseAt = (side: House[], v: number) => side.find((h) => v >= h.v0 && v < h.v1)
  const wallH = (side: House[], v: number) => houseAt(side, v)?.h ?? 0
  const street = shade(W, AH, (x, y) => {
    const dx = x - A_CX
    const zg = y > A_VY + 0.5 ? (A_FOOT - A_VY) / (y - A_VY) : Infinity
    const X = dx * zg
    // The floor: the stairs, and the planters either side.
    if (zg < 5.02 && Math.abs(X) <= A_WALL) {
      const v = (zg - 1) / 4
      if (Math.abs(X) > A_RAIL) {
        // Planters: low hedges, their tops lit on the left side, in shade on the right.
        const lit = X < 0
        const k = bayer(x, y)
        return lit ? (k < 0.3 ? '#9ac85a' : '#6a9a3a') : k < 0.3 ? '#4a6a4a' : '#344a3e'
      }
      return stairPixel(x, y, X, v, zg, wallH(R, v))
    }
    // The house fronts along the street.
    if (dx === 0) return null
    const zw = A_WALL / Math.abs(dx)
    if (zw > 5.2 || zw < 0.6) return null
    const v = (zw - 1) / 4
    const side = dx < 0 ? L : R
    const hs = houseAt(side, v)
    const gy = aY(zw)
    if (y > gy) return null
    const lit = dx < 0
    if (!hs) {
      // An alley between two houses: a slot of deep shade, a line of sun far down it.
      if (v > 0.81 || y < gy - 118 / zw) return null
      return (gy - y) * zw < 3 ? (lit ? '#c8906a' : '#4a3048') : lit ? '#6a4050' : '#2e1e34'
    }
    const top = gy - hs.h / zw
    const hgt = (gy - y) * zw
    if (y < top) {
      // The roof over the front: its eave, then the tiles sloping away up to the ridge, in rows.
      const up = (top - y) * zw
      if (up > 34) return null
      if (up > 32) return lit ? '#ffc890' : '#a86058'
      const tile = Math.floor(up) % 4 === 0
      if (up < 3) return lit ? '#7a3a34' : '#3a2030'
      return lit ? (tile ? '#c8603a' : up > 24 ? '#ff9a5a' : '#ee8a4a') : tile ? '#5a2a36' : '#8a4040'
    }
    return houseFront(x, y, hs, v, hgt, zw, lit)
  })
  g.drawImage(street, 0, 0)
  // The rails: a low wall each side of the stairs, its inner face lit on the left, in shade on the right.
  for (let v = 1.0; v >= -0.05; v -= 0.0015) {
    const z = aZ(v)
    const hgt = Math.max(1, Math.round(10 / z))
    for (const sd of [-1, 1]) {
      const x = Math.round(aX(sd * A_RAIL, z))
      const gy = Math.round(aY(z))
      rect(
        g,
        x - (sd < 0 ? 1 : 0),
        gy - hgt,
        Math.max(1, Math.round(3 / z)),
        hgt,
        sd < 0 ? '#f0cc98' : '#7a5468',
      )
      rect(
        g,
        x - (sd < 0 ? 1 : 0),
        gy - hgt,
        Math.max(1, Math.round(3 / z)),
        1,
        sd < 0 ? '#fff4d8' : '#b88a8a',
      )
    }
  }
  // The lamp posts, far to near.
  for (const v of [...LAMPS_A].reverse())
    for (const sd of [-1, 1]) {
      const z = aZ(v)
      const x = Math.round(aX(sd * (A_RAIL + 6), z))
      const gy = Math.round(aY(z))
      const ph = Math.round(52 / z)
      const pw = Math.max(1, Math.round(2.4 / z))
      rect(g, x, gy - ph, pw, ph, '#3a2a3a')
      if (sd > 0) rect(g, x, gy - ph, 1, ph, '#c89a7a')
      else rect(g, x + pw - 1, gy - ph, 1, ph, '#8a6a6a')
      const lw = Math.max(2, Math.round(6 / z))
      const lh = Math.max(2, Math.round(7 / z))
      rect(g, x + pw / 2 - lw / 2, gy - ph - lh, lw, lh, '#3a2a3a')
      rect(g, x + pw / 2 - lw / 2 + 1, gy - ph - lh + 1, Math.max(1, lw - 2), Math.max(1, lh - 2), '#8a7a6a')
      rect(g, x + pw / 2 - lw / 2 - 1, gy - ph - lh - 1, lw + 2, 1, '#3a2a3a')
    }
  return cv
}

/** A step of shot A's stairs: tread, riser and the dark under its nosing; the right houses' shadow across them. */
function stairPixel(x: number, y: number, X: number, v: number, z: number, hR: number): string {
  // Steps closer than two pixels apart are drawn in pairs (then fours): no moiré far up the stairs.
  const px = 13.5 / (z * z)
  const n = 60 / (px < 1 ? 4 : px < 2 ? 2 : 1)
  const p = v * n
  const i = Math.floor(p)
  const f = p - i
  const landing = Math.floor(v * 4 + 0.001) !== Math.floor((v + 1 / n) * 4 + 0.001)
  // The low sun is right and in front: the right-hand houses throw their shadow over the right of the stairs, the
  // lamp posts long thin ones across the lit part.
  const edge = A_WALL - hR * 0.42 + Math.sin(v * 40) * 2
  let dark = X > edge
  for (const lv of LAMPS_A) {
    const sv = lv + (A_RAIL - X) * 0.0004
    if (X < A_RAIL && Math.abs(v - sv) < 0.0035 + 0.0006 * z) dark = true
  }
  const tread = dark ? '#a87c86' : '#f8e0b0'
  const riser = dark ? '#8a6478' : '#e8c494'
  const under = dark ? '#5a3e5a' : '#b08070'
  if (landing && f > 0.2) return (x + y) % 7 === 0 ? (dark ? '#9a7080' : '#f0d4a4') : tread
  if (f < 0.42) return tread
  if (f < 0.86) return bayer(x, y) < 0.12 ? tread : riser
  return under
}

/** A house front along shot A's street: plaster, a band at each floor, windows with shutters and flower boxes. */
function houseFront(x: number, y: number, h: House, v: number, hgt: number, z: number, lit: boolean): string {
  const base = WALL_LIT[h.c]!
  const col = (c: string) => (lit ? c : mix(c, '#4a2e5a', 0.5))
  // Each house's corners, its plinth.
  const along = (v - h.v0) / (h.v1 - h.v0)
  if (along < 0.04 || along > 0.96) return col('#8a6a6a')
  if (hgt < 6) return col('#a88070')
  // Far fronts: just plaster and a darker band (their windows would only alias).
  if (z > 3.4) return Math.floor(hgt / 26) % 2 && bayer(x, y) < 0.3 ? col('#c8a080') : col(base)
  const fl = hgt % 30
  if (fl < 2) return col('#d8b088')
  const c = (along * h.cols) % 1
  if (hgt > 10 && hgt < h.h - 12 && fl > 8 && fl < 24) {
    if (c > 0.32 && c < 0.68) {
      if (fl < 10) return col('#c86a5a')
      // Glass: dark, a few lit by the evening.
      const litWin = (Math.floor(along * h.cols) + Math.floor(hgt / 30) + h.c) % 3 === 0
      return lit ? (litWin ? '#ffd47a' : '#5a4a6a') : litWin ? '#d8a060' : '#3a2a44'
    }
    if ((c > 0.2 && c < 0.32) || (c > 0.68 && c < 0.8)) return col(h.sh)
  }
  return col(base)
}

// ---------------------------------------------------------------- shot B's picture
const bY = (z: number, FY: number) => BVY + (FY - BVY) / z
const bX = (l: number, z: number, FX: number) => BVX + (FX - BVX) / z + (l * B_HW) / z

/** Mesagoza from the top of the stairs: sky, sun, the crater's rim, fields, roofs to the horizon, the stairs, court. */
function stairsDown(FX: number, FY: number): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(
    dGradient(W, HZ + 4, ['#2e2a62', '#4a3a78', '#8a4a7a', '#d0645e', '#f48a4e', '#ffb45a', '#ffd88a']),
    0,
    0,
  )
  // The sun's glow, then streaks of cloud lit gold underneath, rose on top.
  g.drawImage(glow(46, '#ffc070', 1.4, 0.55), SUN.x - 46, SUN.y - 46)
  g.drawImage(glow(26, '#ffe0a0', 1.4, 0.8), SUN.x - 26, SUN.y - 26)
  const r = rng(9823)
  for (let i = 0; i < 12; i++) {
    const x = r.range(-10, W + 10)
    const y = r.range(6, 36)
    const rx = r.range(14, 40)
    const ry = r.int(1, 3)
    const near = Math.abs(x - SUN.x) < 70
    ellipse(g, x, y + 1, rx, ry, near ? '#ffe0a0' : '#f89a78')
    ellipse(g, x, y, rx, ry, y < 18 ? '#5a3a78' : '#a85a7a')
    rect(g, x - rx * 0.5, y - ry, rx, 1, y < 18 ? '#6a4a88' : '#c8707a')
  }
  ellipse(g, SUN.x, SUN.y, 8, 8, '#fff6d8')
  ellipse(g, SUN.x - 1, SUN.y - 1, 5, 5, '#ffffff')
  // The Great Crater's far rim along the horizon: a long wall of cliffs in the haze, lit along its top.
  for (let x = 0; x < W; x++) {
    const top = Math.round(
      HZ - 7 - 2.5 * Math.sin(x / 23 + 1) - 1.5 * Math.sin(x / 7.3) - (x > 150 && x < 200 ? 2 : 0),
    )
    rect(g, x, top, 1, HZ + 3 - top, '#b06a7a')
    rect(g, x, top, 1, 1, Math.abs(x - SUN.x) < 30 ? '#ffe0a0' : '#e09a88')
    if (x % 9 < 2) rect(g, x, top + 2, 1, HZ - top, '#9a5a72')
  }
  city(g, rng(982), FX, FY)
  // The stairs, pixel by pixel.
  const stairs = shade(W, H, (x, y) => {
    if (y < BVY + 1 || y > FY) return null
    const z = (FY - BVY) / (y - BVY)
    const u = (z - 1) / 3
    if (u > 1.002) return null
    const cx = BVX + (FX - BVX) / z
    const l = ((x - cx) * z) / B_HW
    if (Math.abs(l) > 1) return null
    return stepPixel(x, y, l, u, z)
  })
  g.drawImage(stairs, 0, 0)
  // The rails: a low wall each side; the left's inner face away from the sun, the right's toward it.
  for (let u = 1; u >= 0; u -= 0.0012) {
    const z = bZ(u)
    const gy = Math.round(bY(z, FY))
    const hgt = Math.max(1, Math.round(9 / z))
    const w = Math.max(1, Math.round(3 / z))
    for (const sd of [-1, 1]) {
      const x = Math.round(bX(sd * 1.02, z, FX)) - (sd < 0 ? w - 1 : 0)
      rect(g, x, gy - hgt, w, hgt, sd < 0 ? '#6a4258' : '#e0aa82')
      rect(g, x, gy - hgt, w, 1, sd < 0 ? '#ffd8a0' : '#fff0c8')
    }
  }
  for (const u of [...LAMPS_B].reverse()) for (const sd of [-1, 1]) lampB(g, u, sd, FX, FY)
  court(g, FX, FY)
  return cv
}

/** One of shot B's lamp posts, backlit: dark, its left edge catching the sun. */
function lampB(g: G, u: number, sd: number, FX: number, FY: number) {
  const z = bZ(u)
  const x = Math.round(bX(sd * 1.1, z, FX))
  const gy = Math.round(bY(z, FY))
  const ph = Math.round(30 / z)
  const pw = Math.max(1, Math.round(2 / z))
  rect(g, x, gy - ph, pw, ph, '#3a2236')
  rect(g, x, gy - ph, 1, ph, '#c8885a')
  const lw = Math.max(2, Math.round(5 / z))
  const lh = Math.max(2, Math.round(6 / z))
  rect(g, x + pw / 2 - lw / 2, gy - ph - lh, lw, lh, '#3a2236')
  rect(g, x + pw / 2 - lw / 2, gy - ph - lh, 1, lh, '#ffc070')
}

/** Shot B's lamp head: where its light glows. */
const lampHead = (u: number, sd: number, FX: number, FY: number) => {
  const z = bZ(u)
  return { x: bX(sd * 1.1, z, FX) + 1 / z, y: bY(z, FY) - 33 / z, z }
}

/** A tread of shot B's stairs, seen from the top: lit stone, a gold glint on each nosing, the drop under it. */
function stepPixel(x: number, y: number, l: number, u: number, z: number): string {
  const px = (3.4 * 40) / STEPS / (z * z)
  const n = STEPS / (px < 0.5 ? 8 : px < 1 ? 4 : px < 2 ? 2 : 1)
  const p = u * n
  const f = p - Math.floor(p)
  const landing = Math.floor(u * 4 + 0.001) !== Math.floor((u + 1 / n) * 4 + 0.001)
  // The low sun is ahead and left: the left rail's shadow along that edge, the left lamps' long ones toward us.
  let dark = l < -0.86 + 0.04 * Math.sin(u * 50)
  for (const lu of LAMPS_B) {
    const su = lu - (l + 1) * 0.045
    if (Math.abs(u - su) < 0.0045 * z && l > -1) dark = true
  }
  // Brighter on the sun's side, and toward the far end, where it glares off the stone.
  const warm = clamp(0.6 - l * 0.25 + u * 0.3)
  const tread = dark ? '#a26a6e' : warm > 0.62 ? '#fce2b0' : '#f0c898'
  const glint = dark ? '#c8888a' : '#fff6d8'
  if (landing && f > 0.15) return dark ? '#9a6268' : bayer(x, y) < 0.08 ? '#fff0c8' : tread
  if (f < 0.78) return f < 0.2 && bayer(x, y) < 0.4 ? (dark ? '#8a5662' : '#e2b088') : tread
  if (f < 0.9) return glint
  return dark ? '#6a3e52' : '#b87868'
}

/** Mesagoza's roofs from above, rows from the horizon to the foot of the hill, hazier with distance. */
function city(g: G, r: Rng, FX: number, FY: number) {
  const haze = '#e8a080'
  // The ground under it all: no gap between roofs shows anything but the city's own shade.
  g.drawImage(dGradient(W, FY - HZ - 2, ['#d8987a', '#c4846e', '#a86a64', '#8a5460']), 0, HZ + 2)
  // Fields and the city's old wall far off, under the haze.
  rect(g, 0, HZ + 4, W, 1, '#e8b08a')
  for (let x = 0; x < W; x += 19) rect(g, x, HZ + 2, 2, 2, '#e8b08a')
  const rows = 15
  for (let k = 0; k < rows; k++) {
    // Depth from far (k 0) to near; the city's ground is far below the camera.
    const zc = lerp(16, 1.65, (k / (rows - 1)) ** 0.8)
    const y = Math.round(HZ + 76 / zc)
    const s = 2.2 / zc
    const f = clamp((zc - 1.65) / 11) ** 0.6
    const hz = (c: string) => mix(c, haze, 0.08 + 0.82 * f)
    let x = -r.range(0, 12 * s)
    while (x < W) {
      // A street between blocks now and then.
      if (r() < 0.14) {
        x += Math.max(1, Math.round(r.range(3, 6) * s))
        continue
      }
      const w = Math.max(3, Math.round(r.range(9, 17) * s))
      const wh = Math.max(1, Math.round(r.range(3, 5) * s))
      const rh = Math.max(2, Math.round(r.range(3, 5) * s))
      const top = y - wh - rh
      // The front wall faces us, away from the sun: warm plaster in shade, a window or two catching the light.
      rect(g, x, y - wh, w, wh, hz(r.pick(['#c89488', '#d4a08c', '#bc8a8c'])))
      if (s > 0.9)
        for (let wx = x + 2; wx < x + w - 2; wx += Math.round(4 * s))
          rect(g, wx, y - wh + 1, 1, Math.max(1, wh - 2), hz(r() < 0.25 ? '#ffd47a' : '#7a4a62'))
      // A hipped terracotta roof seen from above: its slope toward the sun lit, the ridge glinting, the eave dark.
      const ins = Math.min(Math.floor(w * 0.3), rh - 1)
      for (let j = 0; j < rh; j++) {
        const i = Math.round(ins * (1 - j / (rh - 1)))
        rect(g, x + i, top + j, w - 2 * i, 1, hz(j % 2 ? '#c85c38' : '#d46a3e'))
        rect(g, x + i, top + j, Math.max(1, i + 1), 1, hz('#f8a060'))
        rect(g, x + w - i - 1, top + j, 1, 1, hz('#9a4232'))
      }
      rect(g, x + ins, top, Math.max(1, w - 2 * ins), 1, hz('#ffc888'))
      rect(g, x - 1, y - wh - 1, w + 2, 1, hz('#8a3a30'))
      x += w + (r() < 0.5 ? 0 : 1)
    }
  }
  // A few landmarks rise over the roofs: a domed church to the left, a slender bell tower to the right.
  const dome = (x: number, base: number, rr: number, f: number) => {
    const hz = (c: string) => mix(c, haze, f)
    rect(g, x - rr - 1, base - rr, rr * 2 + 3, rr, hz('#d4a08c'))
    rect(g, x - rr - 1, base - rr, 1, rr, hz('#ffd8a8'))
    for (let k = 0; k <= rr; k++) {
      const hw = Math.round(rr * Math.sqrt(1 - (k / (rr + 0.5)) ** 2))
      rect(g, x - hw, base - rr - 1 - k, hw * 2 + 1, 1, hz('#c86a3e'))
      rect(g, x - hw, base - rr - 1 - k, Math.max(1, Math.round(hw * 0.7)), 1, hz('#f89a58'))
    }
    rect(g, x, base - rr * 2 - 4, 1, 3, hz('#ffd8a8'))
  }
  dome(64, 70, 6, 0.35)
  dome(196, 60, 4, 0.55)
  const tower = (x: number, base: number, h: number, f: number) => {
    const hz = (c: string) => mix(c, haze, f)
    rect(g, x, base - h, 4, h, hz('#d4a08c'))
    rect(g, x, base - h, 1, h, hz('#ffe0b0'))
    rect(g, x + 1, base - h + 3, 2, 3, hz('#5a3a4a'))
    for (let k = 0; k < 6; k++)
      rect(
        g,
        x + Math.floor(k / 2.5),
        base - h - 1 - k,
        Math.max(1, 4 - Math.floor(k / 1.5)),
        1,
        hz('#c86a3e'),
      )
  }
  tower(222, 76, 22, 0.25)
  tower(30, 62, 12, 0.5)
  // The plaza at the foot of the stairs, with its fountain.
  const px = Math.round(bX(0, bZ(1), FX))
  const py = Math.round(bY(bZ(1), FY))
  ellipse(g, px, py, 24, 4, '#e8bc98')
  ellipse(g, px, py, 24, 4, pattern(g, '#f4d0a8', 6))
  ellipse(g, px - 8, py, 4, 1, '#a8c8e0')
  rect(g, px - 8, py - 3, 1, 3, '#ffffff')
  // Cypresses along the hillside by the stairs.
  for (const [x, b, h] of [
    [104, 84, 22],
    [112, 80, 16],
    [96, 78, 13],
    [231, 84, 20],
    [86, 74, 10],
  ] as const)
    cypress(g, x, b, h, 0)
}

/** A cypress: a dark green flame, its left edge lit by the sun. */
function cypress(g: G, x: number, base: number, h: number, f: number) {
  const hz = (c: string) => mix(c, '#c89070', 0.2 + 0.6 * f)
  const w = Math.max(1, Math.round(h * 0.16))
  for (let j = 0; j < h; j++) {
    const k = j / h
    const hw = Math.max(0, Math.round(w * Math.min(1, (1 - k) * 2.2) * (k < 0.1 ? 0.7 : 1)))
    const y = base - j
    rect(g, x - hw, y, hw * 2 + 1, 1, hz('#2a3e34'))
    rect(g, x - hw, y, 1, 1, hz(j % 3 ? '#a8a84a' : '#6a7a3a'))
    if (hw > 1 && j % 4 === 1) rect(g, x - hw + 1, y, 1, 1, hz('#4a6a3a'))
  }
}

/** The court at the top: stone flags in perspective, its battle lines, the balustrades either side, the newels. */
function court(g: G, FX: number, FY: number) {
  // The court's plane: the true horizon, a focal length of 160 px, the camera 50 units up. A flag is 20 units.
  const hc = FY - HZ
  const f = 160
  const floor = shade(W, H - FY, (x, yy) => {
    const y = yy + FY
    const d = (f * hc) / (y - HZ + 0.5)
    const X = ((x - BVX) * d) / f
    const tone = clamp((y - FY) / (H - FY))
    const lv = Math.floor(tone * 4 + bayer(x, y) * 0.999)
    const base = ['#eec496', '#e2b488', '#d2a47e', '#c09274', '#ae846c'][lv]!
    const gx = ((X % 20) + 20) % 20
    const gd = ((d % 20) + 20) % 20
    if (gx < 0.5 + d / 140 || gd < 0.35 + d / 200) return mix(base, '#7a4a42', 0.28)
    if (gx < 1 + d / 100 && bayer(x, y) < 0.5) return mix(base, '#fff0c8', 0.3)
    return base
  })
  g.drawImage(floor, 0, FY)
  // Its battle lines, worn: the side lines running to the stairs, the halfway line, the centre circle.
  const P = (X: number, d: number) => [BVX + (f * X) / d, HZ + (f * hc) / d] as const
  const paint = (x: number, y: number, i: number) => {
    if (y < FY + 1 || y >= H || i % 9 === 4) return
    rect(g, Math.round(x), Math.round(y), 1, 1, i % 5 ? '#fff6e4' : '#f0d8b8')
  }
  const C = { X: -12, d: 98 }
  for (let i = 0; i < 260; i++) {
    const a = (i / 260) * Math.PI * 2
    for (const R of [26, 25]) {
      const [x, y] = P(C.X + Math.cos(a) * R, C.d + Math.sin(a) * R)
      paint(x, y, i)
    }
    const [bx, by] = P(C.X + Math.cos(a) * 5, C.d + Math.sin(a) * 5)
    paint(bx, by, i + 1)
  }
  for (let i = 0; i < 240; i++) {
    const d = lerp(f, 60, i / 240)
    for (const X of [-86, 86]) {
      const [x, y] = P(X, d)
      paint(x, y, i)
    }
    const [mx, my] = P(lerp(-86, 86, i / 240), C.d)
    paint(mx, my, i + 2)
  }
  // The top step's edge: a gold line where the court meets the stairs.
  rect(g, Math.round(bX(-1, 1, FX)), FY - 1, Math.round(B_HW * 2), 1, '#fff6d8')
  // The balustrades along the court's edge, backlit: dark balusters, the glow of the city between them.
  const left = Math.round(bX(-1, 1, FX)) - 4
  const right = Math.round(bX(1, 1, FX)) + 4
  for (const [x0, x1] of [
    [0, left],
    [right, W],
  ] as const) {
    rect(g, x0, FY - 12, x1 - x0, 12, '#f0b88a')
    for (let x = x0; x < x1; x += 4) {
      rect(g, x, FY - 10, 3, 9, '#5a3448')
      rect(g, x, FY - 8, 3, 3, '#6a3e52')
      rect(g, x, FY - 10, 1, 9, '#c87a62')
    }
    rect(g, x0, FY - 13, x1 - x0, 3, '#4a2a40')
    rect(g, x0, FY - 13, x1 - x0, 1, '#ffd8a0')
    rect(g, x0, FY - 1, x1 - x0, 2, '#4a2a40')
  }
  // The great newel posts at the top of the stairs, each with its lamp.
  for (const x of [left, right]) {
    rect(g, x - 4, FY - 24, 9, 25, '#4a2a40')
    rect(g, x - 4, FY - 24, 2, 25, '#d88a62')
    rect(g, x - 5, FY - 26, 11, 3, '#5a3448')
    rect(g, x - 5, FY - 26, 11, 1, '#ffd8a0')
    rect(g, x - 1, FY - 33, 3, 7, '#3a2236')
    rect(g, x - 2, FY - 35, 5, 3, '#4a2a40')
    rect(g, x - 1, FY - 32, 1, 5, '#8a6a5a')
  }
}

/** The newels' lamps (shot B), where their light glows. */
const newelLamps = (FX: number, FY: number) => [
  { x: Math.round(bX(-1, 1, FX)) - 4, y: FY - 30 },
  { x: Math.round(bX(1, 1, FX)) + 4, y: FY - 30 },
]

// ---------------------------------------------------------------- moving parts
/** A string of bunting between two points, sagging; its flags fluttering, smaller with distance. */
function bunting(g: G, x0: number, y0: number, x1: number, y1: number, z: number, t: number, seed: number) {
  const sag = 12 / z
  const n = Math.max(6, Math.round((x1 - x0) / Math.max(2, 7 / z)))
  let px = x0
  let py = y0
  for (let i = 1; i <= n; i++) {
    const q = i / n
    const x = lerp(x0, x1, q)
    const y = lerp(y0, y1, q) + sag * 4 * q * (1 - q)
    line(g, px, py, x, y, '#5a3a4a')
    if (i < n) {
      const c = FLAGS[(i + seed) % FLAGS.length]!
      const fl = Math.max(1, Math.round(5 / z))
      const fw = Math.max(1, Math.round(2.4 / z))
      const sway = Math.round(Math.sin(t * 9 + i * 1.7 + seed) * (1.2 / z))
      if (fl <= 1) rect(g, x, y + 1, 1, 1, c)
      else tri(g, x - fw, y, x + fw, y, x + sway, y + fl, c)
    }
    px = x
    py = y
  }
}

/** A pigeon flying: two frames of wings, scaled. */
function bird(g: G, x: number, y: number, s: number, up: boolean, c: string) {
  const w = Math.max(1, Math.round(3 * s))
  rect(g, x - 1, y, 2, 1, c)
  if (up) {
    line(g, x - 1, y, x - 1 - w, y - w, c)
    line(g, x, y, x + w, y - w, c)
  } else {
    line(g, x - 1, y, x - 1 - w, y + Math.round(w * 0.5), c)
    line(g, x, y, x + w, y + Math.round(w * 0.5), c)
  }
}

/** A jagged streak of lightning through recent points (Pawmot's wake), re-jittered every other frame. */
function wake(g: G, pts: readonly [number, number][], t: number, w = 2) {
  if (pts.length < 2) return
  const r = rng(1 + Math.floor(t * 30))
  const j = pts.map(
    ([x, y], i) => [x + (i ? r.range(-2, 2) : 0), y + (i ? r.range(-2, 2) : 0)] as [number, number],
  )
  polyline(g, j, '#ffb020', w + 1)
  polyline(g, j, '#ffe85a', w)
  polyline(g, j, '#ffffff', 1)
}

/**
 * A runner seen from behind against the light (shot A): a dark shape, mirrored (the picture is its front), a rim of
 * gold on its right where the sun catches it.
 */
function fromBehind(g: G, key: string, x: number, y: number, s: number, sy = 1, outline?: string) {
  drawSprite(g, key, x + 1, y, { sx: s, sy: s * sy, flip: true, sil: GOLD })
  drawSprite(g, key, x, y - 1, { sx: s, sy: s * sy, flip: true, sil: ROSE })
  drawSprite(g, key, x, y, { sx: s, sy: s * sy, flip: true, sil: '#3a2238', outline })
}

/** Pawmot's charged outline: flickering yellow and white. */
const zapEdge = (t: number) => (Math.floor(t * 24) % 3 === 0 ? '#ffffff' : '#ffe03a')

/** Little arcs jumping off a charged body's edge, new ones every other frame. */
function crackle(g: G, key: string, x: number, y: number, s: number, t: number, n: number) {
  const sz = spriteSize(key)
  const r = rng(11 + Math.floor(t * 30))
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const cx = x + Math.cos(a) * sz.w * 0.42 * s
    const cy = y - sz.h * 0.5 * s + Math.sin(a) * sz.h * 0.45 * s
    const len = r.range(5, 10) * Math.max(0.5, s)
    const pts = bolt(r, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 0.6, 2)
    polyline(g, pts, '#ffe03a')
    rect(g, pts[pts.length - 1]![0], pts[pts.length - 1]![1], 1, 1, '#ffffff')
  }
}

/** Facing us with the sun behind her (shot B): her colours darkened, a gold rim on the side of the sun. */
function backlit(
  g: G,
  key: string,
  x: number,
  y: number,
  o: { sx: number; sy: number; flip?: boolean; dark: number; outline?: string },
) {
  drawSprite(g, key, x - 1, y, { sx: o.sx, sy: o.sy, flip: o.flip, sil: GOLD })
  drawSprite(g, key, x, y - 1, { sx: o.sx, sy: o.sy, flip: o.flip, sil: '#ffe8b0' })
  drawSprite(g, key, x, y, {
    sx: o.sx,
    sy: o.sy,
    flip: o.flip,
    outline: o.outline,
    tint: o.dark > 0 ? { color: '#2a1632', a: q8(o.dark) } : null,
  })
}

/** A long shadow on the ground, thrown toward us and right by the low sun behind. */
function longShadow(g: G, x: number, y: number, w: number, len: number) {
  if (len < 1) return
  const p = '#b07a60'
  tri(g, x - w, y, x + w, y, x + len * 0.55 + w * 0.3, y + len, p)
  tri(g, x - w, y, x + len * 0.55 + w * 0.3, y + len, x + len * 0.55 - w * 0.4, y + len, p)
}

// ---------------------------------------------------------------- where they are
/** Her feet and size in shot B, running up toward us, then the leap. */
function herInB(t: number, FX: number, FY: number) {
  if (t < T_CREST) {
    const u = herB(t)
    const z = bZ(u)
    const ph = (t - T_CUT) / 0.15
    const bob = Math.abs(Math.sin(ph * Math.PI)) * (3.5 / z)
    return {
      x: bX(-0.06 * (1 - span(t, T_CUT, T_CREST)), z, FX),
      y: bY(z, FY) - bob,
      s: 1 / z,
      sx: 1,
      flip: false,
      air: 0,
    }
  }
  const q = span(t, T_CREST, T_LAND)
  const z0 = bZ(herB(T_CREST))
  const x0 = bX(0, z0, FX)
  const y0 = bY(z0, FY)
  // One great bound: up past the horizon, a twirl at the top, down onto the top step.
  const spin = Math.cos(Math.PI * 2 * ease.ioS(span(q, 0.18, 0.82)))
  return {
    x: lerp(x0, FX, q),
    y: lerp(y0, FY, q) - 140 * q * (1 - q),
    s: lerp(1 / z0, 1, ease.inQ(q)),
    sx: Math.abs(spin),
    flip: spin < 0,
    air: 4 * q * (1 - q),
  }
}

/** Pawmot's feet and size in shot B. */
function pawInB(t: number, FX: number, FY: number) {
  if (t < T_PAW) {
    const z = bZ(pawB(t))
    const bob = Math.abs(Math.sin(((t - T_CUT) / 0.09) * Math.PI)) * (3 / z)
    return { x: bX(PAW_L, z, FX), y: bY(z, FY) - bob, s: 1 / z }
  }
  // A hop off the stairs over the newel, landing on the court and skidding to a stop.
  const q = span(t, T_PAW, T_PAW_DOWN)
  const sx = bX(PAW_L, 1, FX)
  if (q < 1) return { x: lerp(sx, PAW_END.x + 10, q), y: lerp(FY, PAW_END.y, q) - 100 * q * (1 - q), s: 1 }
  // Then, as she lands, a hop for joy.
  return {
    x: PAW_END.x + 10 * (1 - ease.outC(span(t, T_PAW_DOWN, T_PAW_DOWN + 0.3))),
    y: PAW_END.y - Math.round(7 * pulse(t, T_LAND + 0.02, T_LAND + 0.24)),
    s: 1,
  }
}

/** Her raised fist, on the picture as it stands at the end (the arc's target). */
const fistAt = (key: string, FX: number, FY: number) => {
  const sz = spriteSize(key)
  return { x: Math.round(FX - sz.w / 2 + sz.w * 0.12), y: Math.round(FY - sz.h + sz.h * 0.3) }
}

export const nemonaChampion = championCinema<X>({
  id: 'nemona',
  reveal: REVEAL,
  seed: 982,
  aura: ['#fffbe0', '#ffd84a', '#ff8a2a', '#8a2a14'],
  flash: '#fff4c0',
  sample: {
    trainer: '/trainers/classes/paldea/nemona.png',
    name: 'Champion Nemona',
    lead: 982,
    ace: 923,
    team: 3,
  },
  extras: [923],
  setup(st, r) {
    const F = st.L.foe
    const FY = F.y + 2
    const housesL = street(rng(91))
    const housesR = street(rng(92))
    st.screenShakes.push(
      [T_GO, 0.2, 1],
      [T_CUT, 0.15, 1],
      [T_PAW_DOWN, 0.2, 1],
      [T_LAND, 0.4, 3],
      [T_ARC, 0.3, 2],
    )
    // Pigeons pecking on the steps ahead of her, up they go as she comes.
    const birds: Bird[] = Array.from({ length: 11 }, () => {
      const v = r.range(0.12, 0.3)
      const z = aZ(v)
      const X = r.range(-70, 40)
      return {
        x: aX(X, z),
        y: aY(z),
        vx: (X < -14 ? -1 : 1) * r.range(30, 90),
        vy: -r.range(50, 110),
        at: 0,
        s: 1 / z,
        ph: r() * 6,
      }
    })
    for (const b of birds) {
      const v = (A_FOOT - A_VY) / (b.y - A_VY)
      b.at = passTimes([(v - 1) / 4 - 0.07], herA, T_GO, T_CUT)[0]!
    }
    return {
      buf: canvas(W, H),
      up: stairsUp(housesL, housesR),
      down: stairsDown(F.x, FY),
      passA: passTimes(LAMPS_A, pawA, T_GO, T_CUT),
      passB: passTimes(LAMPS_B, pawB, T_CUT, T_PAW, true),
      birds,
      gulls: Array.from({ length: 5 }, () => ({
        x: r.range(0, W),
        y: r.range(14, 40),
        v: r.range(4, 9),
        ph: r() * 6,
      })),
      dust: new Particles(),
      zap: new Particles(),
      trail: [],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    const FY = F.y + 2
    s.dust.update(dt)
    s.zap.update(dt)
    const cam = camA(t)
    // Pawmot's wake: where it has just been, on the screen.
    const p = t < T_CUT ? pawScreenA(t, cam) : pawInB(t, F.x, FY)
    if (t >= T_GO && t < T_PAW_DOWN + 0.1) {
      const sz = spriteSize(PAWMOT)
      s.trail.unshift([p.x, p.y - sz.h * p.s * 0.45])
      if (s.trail.length > 9) s.trail.pop()
    } else s.trail.length = 0
    if (within(t, T_CUT, T_CUT + dt)) s.trail.length = 0
    // Sparks off Pawmot as it runs, and its zaps at each lamp it lights.
    if (t >= T_GO && t < T_PAW_DOWN && r() < 0.8) {
      const sz = spriteSize(PAWMOT)
      s.zap.add({
        x: p.x + r.range(-sz.w, sz.w) * 0.4 * p.s,
        y: p.y - r.range(0.2, 0.9) * sz.h * p.s,
        vx: r.range(-30, 30),
        vy: r.range(-40, 10),
        life: r.range(0.15, 0.35),
        size: 1,
        shape: r() < 0.3 ? 'plus' : 'px',
        colors: [...SPARK],
      })
    }
    const lampZap = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++)
        s.zap.add({
          x,
          y,
          vx: r.range(-50, 50),
          vy: r.range(-50, 30),
          ay: 120,
          life: r.range(0.2, 0.45),
          size: 1,
          shape: 'px',
          colors: [...SPARK],
        })
    }
    s.passA.forEach((at, k) => {
      if (!within(t, at, at + dt) || t >= T_CUT) return
      const z = aZ(LAMPS_A[k]!)
      lampZap(aX(A_RAIL + 6, z), aY(z) - 56 / z - cam, 8)
    })
    s.passB.forEach((at, k) => {
      if (!within(t, at, at + dt)) return
      const h = lampHead(LAMPS_B[k]!, -1, F.x, FY)
      lampZap(h.x, h.y, 8)
    })
    // Her start: a puff of dust from the bottom step.
    if (within(t, T_GO, T_GO + dt)) {
      const z = aZ(herA(t))
      for (let i = 0; i < 18; i++)
        s.dust.add({
          x: aX(HER_X, z) + r.range(-14, 14),
          y: aY(z) - cam,
          vx: r.range(-60, 60),
          vy: -r.range(5, 30),
          drag: 3,
          life: r.range(0.4, 0.7),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#f8dcb0', '#e8c098'],
          light: '#fff0d0',
        })
    }
    // A puff at each footfall in shot B, and her shadow's dust as she leaves the last step.
    if (t > T_CUT && t < T_CREST) {
      const f0 = Math.floor((t - T_CUT) / 0.15)
      const f1 = Math.floor((t - dt - T_CUT) / 0.15)
      if (f0 !== f1) {
        const h = herInB(t, F.x, FY)
        for (let i = 0; i < 3; i++)
          s.dust.add({
            x: h.x + r.range(-4, 4) * h.s,
            y: h.y + 3.5 * h.s,
            vx: r.range(-20, 20) * h.s,
            vy: -r.range(4, 14),
            drag: 3,
            life: 0.4,
            size: Math.max(1, Math.round(3 * h.s)),
            size1: Math.max(1, Math.round(5 * h.s)),
            shape: 'smoke',
            colors: ['#f8dcb0', '#e8c098'],
            light: '#fff0d0',
          })
      }
    }
    if (within(t, T_CREST, T_CREST + dt)) {
      const h = herInB(T_CREST - 0.001, F.x, FY)
      for (let i = 0; i < 14; i++)
        s.dust.add({
          x: h.x + r.range(-8, 8),
          y: h.y,
          vx: r.range(-50, 50),
          vy: -r.range(10, 40),
          drag: 3,
          life: r.range(0.4, 0.6),
          size: 2,
          size1: 5,
          shape: 'smoke',
          colors: ['#f8dcb0', '#e8c098'],
          light: '#fff0d0',
        })
    }
    // Pawmot's skid onto the court: dust and sparks thrown off.
    if (t > T_PAW_DOWN && t < T_PAW_DOWN + 0.25 && r() < 0.8) {
      const pw = pawInB(t, F.x, FY)
      s.dust.add({
        x: pw.x + r.range(-10, 14),
        y: pw.y,
        vx: r.range(10, 60),
        vy: -r.range(5, 25),
        drag: 3,
        life: 0.45,
        size: 2,
        size1: 5,
        shape: 'smoke',
        colors: ['#f0d0a8', '#d8b090'],
        light: '#fff0d0',
      })
    }
    // In the air: gold sparkles shed from her as she twirls.
    if (t > T_CREST && t < T_LAND) {
      const h = herInB(t, F.x, FY)
      const sz = spriteSize(s.p.trainer)
      for (let i = 0; i < 2; i++)
        s.fx.add({
          x: h.x + r.range(-0.4, 0.4) * sz.w * h.s,
          y: h.y - r.range(0.1, 0.9) * sz.h * h.s,
          vx: r.range(-30, 30),
          vy: r.range(10, 50),
          drag: 2,
          life: r.range(0.3, 0.6),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'star' : 'px',
          colors: ['#ffffff', '#fff0a0', '#ffc860', '#ff9a4a'],
        })
    }
    // The landing: a ring of dust, grit and sparks thrown out across the court.
    if (within(t, T_LAND, T_LAND + dt)) {
      for (let i = 0; i < 26; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: F.x + sd * r.range(4, 16),
          y: FY + r.range(-1, 2),
          vx: sd * r.range(60, 150),
          vy: -r.range(0, 20),
          drag: 2.5,
          life: r.range(0.4, 0.7),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#f8dcb0', '#e0b890'],
          light: '#fff4d8',
        })
      }
      for (let i = 0; i < 16; i++)
        s.fx.add({
          x: F.x + r.range(-10, 10),
          y: FY - 2,
          vx: r.range(-90, 90),
          vy: -r.range(40, 110),
          ay: 300,
          life: r.range(0.4, 0.7),
          size: 1,
          shape: 'px',
          colors: ['#fff6d8', '#e8c098', '#a87a62'],
        })
    }
    // Pawmot charging: its fur crackling; the arc's strike at her fist.
    if (t > T_CHARGE && t < T_ARC && r() < 0.9) {
      const sz = spriteSize(PAWMOT)
      const a = r() * Math.PI * 2
      s.zap.add({
        x: PAW_END.x + Math.cos(a) * sz.w * 0.55,
        y: PAW_END.y - sz.h * 0.5 + Math.sin(a) * sz.h * 0.5,
        home: { x: PAW_END.x, y: PAW_END.y - sz.h * 0.55, k: 400 },
        life: 0.4,
        size: 1,
        shape: 'plus',
        colors: [...SPARK],
      })
    }
    if (within(t, T_ARC, T_ARC + dt)) {
      const fa = fistAt(s.p.trainer, F.x, FY)
      for (let i = 0; i < 30; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(40, 150)
        s.fx.add({
          x: fa.x,
          y: fa.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 3,
          life: r.range(0.3, 0.6),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'star' : 'plus',
          colors: [...SPARK],
        })
      }
    }
    if (t > T_ARC && t < REVEAL && r() < 0.6) {
      const fa = fistAt(s.p.trainer, F.x, FY)
      s.fx.add({
        x: fa.x + r.range(-4, 4),
        y: fa.y + r.range(-4, 4),
        vx: r.range(-40, 40),
        vy: r.range(-50, 10),
        life: 0.25,
        size: 1,
        shape: 'px',
        colors: [...SPARK],
      })
    }
    // The pigeons take off, and the far gulls drift.
    for (const b of s.birds)
      if (t > b.at) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.vy -= 30 * dt
        b.s = Math.min(1.2, b.s + dt * 0.8)
      }
    for (const gl of s.gulls) gl.x += gl.v * dt
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    if (t < T_CUT) drawA(b, s, t)
    else drawB(b, s, t)
    // The shake moves the whole place; nothing of the battle's ground shows at the edges.
    const sh = screenShake(t, s.screenShakes)
    if ((sh.x || sh.y) && k >= 1) rect(g, 0, 0, W, H, '#2a1a2a')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    const F = s.L.foe
    const FY = F.y + 2
    const sh = screenShake(t, s.screenShakes)
    g.save()
    g.translate(sh.x, sh.y)
    if (t < T_CUT) {
      // From behind at the foot: crouched on the set, then running away up the stairs, smaller and smaller.
      const cam = camA(t)
      const v = herA(t)
      const z = aZ(v)
      const sc = 0.95 / z
      const run = t >= T_GO
      const bob = run ? Math.abs(Math.sin(((t - T_GO) / 0.13) * Math.PI)) * (5 / z) : 0
      const crouch = run ? 1 : 1 - 0.08 * ease.outQ(span(t, T_SET, T_SET + 0.15))
      fromBehind(g, s.p.trainer, Math.round(aX(HER_X, z)), Math.round(aY(z) - cam - bob), sc, crouch)
    } else {
      const h = herInB(t, F.x, FY)
      // Landing in a crouch and springing up straight.
      const land = t >= T_LAND ? span(t, T_LAND, T_LAND + 0.22) : 1
      const sq = t >= T_LAND ? 1 - 0.14 * (1 - ease.outBack(land, 2.5)) : 1
      const st = t >= T_LAND ? 1 + 0.08 * (1 - land) : 1
      const lit = span(t, T_LAND, REVEAL) * 0.5 + (t > T_ARC ? 0.2 * pulse(t, T_ARC, T_ARC + 0.3) : 0)
      // In the air: afterimages along her bound, gold then rose, the speed of it.
      if (t > T_CREST + 0.04 && t < T_LAND - 0.1)
        for (const [lag, c] of [
          [0.1, ROSE],
          [0.05, GOLD],
        ] as const) {
          const p = herInB(Math.min(t - lag, T_LAND - 0.001), F.x, FY)
          drawSprite(g, s.p.trainer, Math.round(p.x), Math.round(p.y), {
            sx: p.s * p.sx,
            sy: p.s,
            flip: p.flip,
            sil: c,
          })
        }
      backlit(g, s.p.trainer, Math.round(h.x), Math.round(h.y), {
        sx: h.s * h.sx * st,
        sy: h.s * sq,
        flip: h.flip,
        dark: 0.5 * (1 - lit) - (t > T_ARC ? 0.15 : 0),
      })
      // The arc reaching her raised fist, and the fist crackling after it.
      if (t >= T_ARC - 0.02 && t < REVEAL) {
        const fa = fistAt(s.p.trainer, F.x, FY)
        const pz = spriteSize(PAWMOT)
        const from = { x: PAW_END.x + 4, y: PAW_END.y - pz.h + 6 }
        if (t < T_ARC + 0.26) {
          const pts = bolt(rng(7 + Math.floor(t * 30)), from.x, from.y, fa.x, fa.y, 0.35, 4)
          polyline(g, pts, '#ffb020', 3)
          polyline(g, pts, '#ffe85a', 2)
          polyline(g, pts, '#ffffff', 1)
        }
        const gl = 0.6 + 0.4 * Math.sin(t * 40)
        g.drawImage(glow(9, '#ffe85a', 1.3, q8(gl)), fa.x - 9, fa.y - 9)
        g.drawImage(glow(4, '#ffffff', 1, 1), fa.x - 4, fa.y - 4)
        const rr = rng(3 + Math.floor(t * 20))
        for (let i = 0; i < 3; i++) {
          const a = rr() * Math.PI * 2
          const len = rr.range(5, 11)
          polyline(
            g,
            bolt(rr, fa.x, fa.y, fa.x + Math.cos(a) * len, fa.y + Math.sin(a) * len, 0.5, 2),
            '#fff6a0',
          )
        }
      }
    }
    g.restore()
  },
  front(g, s, t) {
    const sh = screenShake(t, s.screenShakes)
    g.save()
    g.translate(sh.x, sh.y)
    // The strings of bunting she has run under hang in front of her.
    if (t < T_CUT) {
      const cam = camA(t)
      const v = herA(t)
      for (const bv of BUNTING_A) if (bv < v - 0.01) buntingA(g, bv, cam, t)
    } else if (t < T_CREST) {
      const u = herB(t)
      for (const bu of BUNTING_B) if (bu < u) buntingB(g, bu, s.L.foe.x, s.L.foe.y + 2, t)
    }
    g.restore()
    // The cut, the arc: short flashes, far enough apart.
    if (within(t, T_CUT, T_CUT + 0.06)) screenFlash(g, '#fff0c8', 0.35)
    if (within(t, T_ARC, T_ARC + 0.1)) screenFlash(g, '#fff6a0', 0.4)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.6, { freq: 500, type: 'lowpass', vol: 0.03 }),
        tone(1320, 0.12, { type: 'sine', vol: 0.015, at: 0.3 })
      ),
    ],
    [
      T_BELL,
      () => (
        tone(523, 1.4, { type: 'sine', vol: 0.06 }),
        tone(784, 1.1, { type: 'sine', vol: 0.03 }),
        tone(1046, 0.8, { type: 'sine', vol: 0.02 })
      ),
    ],
    [T_SET, () => tone(1760, 0.08, { type: 'square', vol: 0.02, slide: 400 })],
    [
      T_GO,
      () => (
        hiss(0.3, { freq: 1600, slide: -1200, vol: 0.07 }),
        tone(660, 0.25, { type: 'square', vol: 0.03, slide: 900 })
      ),
    ],
    ...Array.from(
      { length: 9 },
      (_, i) =>
        [T_GO + 0.1 + i * 0.13, () => tone(150 + i * 8, 0.04, { type: 'triangle', vol: 0.04 })] as const,
    ),
    [1.15, () => hiss(0.35, { freq: 2600, type: 'bandpass', vol: 0.03 })],
    [T_CUT, () => hiss(0.25, { freq: 900, slide: 2000, vol: 0.06 })],
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_CUT + 0.07 + i * 0.15,
          () => tone(170 + i * 10, 0.05, { type: 'triangle', vol: 0.05 + i * 0.004 }),
        ] as const,
    ),
    [T_PAW, () => tone(880, 0.2, { type: 'square', vol: 0.025, slide: 700 })],
    [T_PAW_DOWN, () => hiss(0.3, { freq: 1200, type: 'bandpass', vol: 0.05 })],
    [
      T_CREST,
      () => (
        hiss(0.45, { freq: 700, slide: 1600, vol: 0.06 }),
        tone(330, 0.4, { type: 'sine', vol: 0.03, slide: 330 })
      ),
    ],
    [T_LAND, () => (tone(70, 0.35, { type: 'sine', vol: 0.12 }), hiss(0.3, { freq: 300, vol: 0.1 }))],
    [T_CHARGE, () => tone(220, 0.22, { type: 'sawtooth', vol: 0.025, slide: 660 })],
    [
      T_ARC,
      () => (
        hiss(0.3, { freq: 3000, slide: -2400, vol: 0.08 }),
        tone(1320, 0.2, { type: 'square', vol: 0.03, slide: -600 })
      ),
    ],
    [
      REVEAL,
      () => (
        tone(523, 0.5, { type: 'square', vol: 0.03 }),
        tone(659, 0.5, { type: 'square', vol: 0.025, at: 0.06 }),
        tone(784, 0.7, { type: 'square', vol: 0.025, at: 0.12 })
      ),
    ],
  ],
})

/** Pawmot in shot A, on the screen (the camera's offset taken out). */
function pawScreenA(t: number, cam: number) {
  const v = pawA(t)
  const z = aZ(v)
  const bob = t >= T_GO ? Math.abs(Math.sin(((t - T_GO) / 0.09) * Math.PI)) * (4 / z) : 0
  return { x: aX(PAW_X, z), y: aY(z) - cam - bob, s: 0.95 / z }
}

function buntingA(g: G, v: number, cam: number, t: number) {
  const z = aZ(v)
  const y = aY(z) - 118 / z - cam
  bunting(g, aX(-A_WALL, z), y, aX(A_WALL, z), y, z, t, Math.round(v * 40))
}

function buntingB(g: G, u: number, FX: number, FY: number, t: number) {
  const z = bZ(u)
  const y = bY(z, FY) - 34 / z
  bunting(g, bX(-1.25, z, FX), y, bX(1.25, z, FX), y, z * 1.4, t, Math.round(u * 40))
}

type S = ChampionState<X>

/** Shot A: the street and stairs, tilted up; the bells, the lamps Pawmot has lit, the far bunting, Pawmot, pigeons. */
function drawA(b: G, s: S, t: number) {
  const cam = camA(t)
  b.drawImage(s.up, 0, -cam)
  // The pennant on the dome and the bells swinging after their toll.
  const fx = A_CX
  const fy = 101 - 110 - cam
  for (let i = 0; i < 6; i++)
    rect(
      b,
      fx + 1 + i,
      fy + 1 + Math.round(Math.sin(t * 10 - i * 0.9) * 1) + (i > 3 ? 1 : 0),
      1,
      i > 3 ? 1 : 2,
      i % 2 ? '#ffd23a' : '#e8403a',
    )
  for (const [bx, by] of BELLS) {
    const sw = t > T_BELL ? Math.sin((t - T_BELL) * 14) * Math.exp(-(t - T_BELL) * 1.2) : 0
    const ox = Math.round(sw * 2)
    rect(b, bx - 2 + ox, by - cam, 5, 4, '#e0a840')
    rect(b, bx - 2 + ox, by - cam, 1, 4, '#ffe08a')
    rect(b, bx - 3 + ox, by + 3 - cam, 7, 1, '#a87028')
    rect(b, bx + ox, by + 4 - cam, 1, 1, '#a87028')
    if (t > T_BELL && t < T_BELL + 1.6) {
      const q = ((t - T_BELL) * 1.4) % 1
      burstRing(b, bx, by - cam + 2, q, 30, 1, '#fff0c8')
    }
  }
  // The lamps Pawmot has lit, both sides (the left ones catch a beat later, across the stairs).
  LAMPS_A.forEach((v, k) => {
    const z = aZ(v)
    for (const sd of [1, -1]) {
      const at = s.passA[k]! + (sd < 0 ? 0.12 : 0)
      if (t < at) continue
      const x = Math.round(aX(sd * (A_RAIL + 6), z) + 1.2 / z)
      const y = Math.round(aY(z) - 56 / z - cam)
      const rr = Math.max(3, Math.round(14 / z))
      const fl = 1 - 0.5 * span(t, at, at + 0.3)
      b.drawImage(glow(rr, '#ffd070', 1.4, q8(0.55 * fl + 0.25)), x - rr, y - rr)
      rect(
        b,
        x - Math.max(1, Math.round(2 / z)),
        y - Math.max(1, Math.round(2 / z)),
        Math.max(1, Math.round(4 / z)),
        Math.max(1, Math.round(4 / z)),
        '#fff6c8',
      )
    }
  })
  // The far bunting (the near ones hang in front of her).
  const v = herA(t)
  for (const bv of [...BUNTING_A].reverse()) if (bv >= v - 0.01) buntingA(b, bv, cam, t)
  // Pigeons on the steps, then up and away toward us.
  for (const br of s.birds) {
    if (t < br.at) {
      rect(b, br.x, br.y - cam - 1, Math.max(1, Math.round(2 * br.s)), 1, '#6a5a6a')
      continue
    }
    bird(
      b,
      Math.round(br.x),
      Math.round(br.y - cam),
      br.s * 1.2,
      Math.floor(t * 12 + br.ph) % 2 === 0,
      '#4a3a4a',
    )
  }
  // Pawmot: from behind, a dark shape with a crackling outline, its lightning wake behind it.
  const p = pawScreenA(t, cam)
  wake(b, s.trail, t)
  const charged = t > T_SET
  fromBehind(b, PAWMOT, Math.round(p.x), Math.round(p.y), p.s, 1, charged ? zapEdge(t) : undefined)
  if (charged) crackle(b, PAWMOT, p.x, p.y, p.s, t, t < T_GO ? 2 : 3)
  s.zap.draw(b)
  s.dust.draw(b)
}

/** Shot B: the city from the top, the lamps and bunting, the gulls, Pawmot up the stairs and onto the court. */
function drawB(b: G, s: S, t: number) {
  const F = s.L.foe
  const FY = F.y + 2
  b.drawImage(s.down, 0, 0)
  for (const gl of s.gulls)
    bird(
      b,
      Math.round(((gl.x + 20) % (W + 40)) - 20),
      Math.round(gl.y),
      0.6,
      Math.floor(t * 5 + gl.ph) % 2 === 0,
      '#6a4a6a',
    )
  // The lamps Pawmot has lit: the left side as it passes, the right a beat after.
  LAMPS_B.forEach((u, k) => {
    for (const sd of [-1, 1]) {
      const at = s.passB[k]! + (sd > 0 ? 0.12 : 0)
      if (t < at) continue
      const h = lampHead(u, sd, F.x, FY)
      // Her landing jolts every lamp on the stairs brighter for a moment.
      const jolt = pulse(t, T_LAND, T_LAND + 0.4)
      const rr = Math.max(3, Math.round((9 + 6 * jolt) / h.z))
      b.drawImage(
        glow(rr, '#ffd070', 1.4, q8(0.6 - 0.3 * span(t, at, at + 0.3) + 0.3 * jolt)),
        Math.round(h.x - rr),
        Math.round(h.y - rr),
      )
      rect(
        b,
        Math.round(h.x),
        Math.round(h.y),
        Math.max(1, Math.round(3 / h.z)),
        Math.max(1, Math.round(3 / h.z)),
        '#fff6c8',
      )
    }
  })
  // The newels' lamps catch as Pawmot lands, and then hers.
  newelLamps(F.x, FY).forEach((n, i) => {
    const at = i === 0 ? T_PAW_DOWN : T_LAND
    if (t < at) return
    b.drawImage(glow(10, '#ffd070', 1.4, q8(0.7 - 0.3 * span(t, at, at + 0.3))), n.x - 10, n.y - 10)
    rect(b, n.x - 1, n.y - 1, 3, 4, '#fff6c8')
  })
  const u = herB(t)
  for (const bu of [...BUNTING_B].reverse()) if (t >= T_CREST || bu >= u) buntingB(b, bu, F.x, FY, t)
  // Shadows on the ground, long toward us: hers (left behind on the steps as she leaps), Pawmot's.
  const h = herInB(t, F.x, FY)
  const gy = t < T_CREST ? h.y + 3.5 * h.s : lerp(bY(bZ(herB(T_CREST)), FY), FY, span(t, T_CREST, T_LAND))
  const air = h.air
  longShadow(
    b,
    Math.round(h.x),
    Math.round(gy),
    Math.max(1, 6 * h.s * (1 - air * 0.5)),
    26 * h.s * (1 - air * 0.6),
  )
  const pw = pawInB(t, F.x, FY)
  const pg = t < T_PAW ? pw.y : t < T_PAW_DOWN ? lerp(FY, PAW_END.y, span(t, T_PAW, T_PAW_DOWN)) : PAW_END.y
  longShadow(b, Math.round(pw.x), Math.round(pg), Math.max(1, 8 * pw.s), 20 * pw.s)
  s.dust.draw(b)
  // Pawmot: lightning running up the stairs, over the newel, onto the court; then charging up for her.
  wake(b, s.trail, t)
  const sz = spriteSize(PAWMOT)
  const charging = t > T_CHARGE && t < T_ARC + 0.2
  const crouch = charging
    ? 1 - 0.07 * span(t, T_CHARGE, T_CHARGE + 0.1) * (1 - span(t, T_ARC, T_ARC + 0.1))
    : 1
  const live = t < T_PAW_DOWN + 0.2 || charging
  if (charging) {
    // Its fur stands on end with the charge: a glow behind it, close in tone to the sky so it reads as light.
    const rr = Math.round(sz.h * 0.7)
    b.drawImage(
      glow(rr, '#ffd860', 1.6, q8(0.3 + 0.25 * span(t, T_CHARGE, T_ARC))),
      Math.round(pw.x - rr),
      Math.round(pw.y - sz.h * 0.5 - rr),
    )
  }
  backlit(b, PAWMOT, Math.round(pw.x), Math.round(pw.y), {
    sx: pw.s * (2 - crouch),
    sy: pw.s * crouch,
    dark: 0.42 - 0.2 * span(t, T_LAND, REVEAL),
    outline: live ? zapEdge(t) : undefined,
  })
  if (live) crackle(b, PAWMOT, pw.x, pw.y, pw.s, t, charging ? 5 : 3)
  s.zap.draw(b)
  // The landing's ring on the top step.
  if (t > T_LAND) {
    const q = span(t, T_LAND, T_LAND + 0.45)
    if (q < 1) {
      const rx = Math.round(lerp(6, 60, ease.outC(q)))
      const ry = Math.max(1, Math.round(rx * 0.2))
      const c = q < 0.5 ? '#fff6d8' : '#f0c898'
      for (let a = 0; a < 64; a++) {
        const an = (a / 64) * Math.PI * 2
        if ((a + Math.floor(q * 8)) % 3 === 0) continue
        rect(b, Math.round(F.x + Math.cos(an) * rx), Math.round(FY + Math.sin(an) * ry), 1, 1, c)
      }
    }
  }
}
