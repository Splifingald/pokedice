// Blue's entrance (docs/54), on the battle stage: the Indigo Plateau at sunset, and the rival who got there first.
// The League stands on its mesa at the top of Victory Road's stairs, the peaks black against a red sky; Pidgeot crosses
// the sun. The great doors bang open on a dark hall, and the camera goes in after them: down at the far end, against
// a tall window full of sunset, a small figure stands with his back to us. Then the lamps snap on down the hall, pair
// after pair, quicker and quicker, as if the place were showing him off: pillars, blue banners, the red carpet running
// to him, his long shadow lying on it. The camera rushes down the carpet, pillars whipping past, and pulls up short
// behind him. Pidgeot drops out of the sky past the window and hovers at his shoulder, beating its wings once, twice: a
// gust down the hall, feathers and dust. Then he spins round on his heel, pointing, a glint of a smile: the reveal,
// two spotlights snapping onto him and the League's emblem lighting under his feet.
// Rival rematches show Red's or Green's picture here: nothing in the scene depends on whose picture it is.
import { hiss, tone } from '@/audio/sfx'
import {
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  pattern,
  rect,
  rng,
  span,
  type Canvas,
  type G,
} from '../../../pixel'
import { drawSprite, spriteKey, spriteSize } from '../../../sprites'
import { H, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dGradient, dissolve, pulse } from '../kit'

const REVEAL = 4.55
/** Outside: Pidgeot over the sun; the doors; the camera rushing through them; inside. */
const T_BIRD = 0.1
const T_DOORS = 0.74
const T_RUSH = 0.86
const T_IN = 1.24
/** Each pair of lamps snapping on, nearest first, the clacks coming quicker and quicker. */
const LAMPS_T = [1.4, 1.6, 1.77, 1.9, 2.01, 2.1, 2.18] as const
/** Down the carpet. */
const T_DOLLY = 2.26
const T_ARRIVE = 3.4
/** Pidgeot: down out of the sky behind him, then its two wingbeats. */
const T_SWOOP = 3.02
const T_HOVER = 3.38
const T_GUST = 3.48
const T_GUST2 = 3.72
/** He spins round (one and a half turns), then the glint. */
const T_SPIN = 3.96
const SPIN_DUR = 0.36
const T_GLINT = 4.33

const PIDGEOT = spriteKey(18, false)

// ---------------------------------------------------------------- the hall, in world units (1 unit = 1 px at F)
/** Focal length: a thing F away is drawn at its own size. The eye's height over the floor. */
const F = 100
const EYE = 38
/** The walls, the pillars' line, the ceiling, the carpet's half-width. */
const HW = 150
const PX = 116
const PW = 22
const CEIL = 230
const CW = 22
/** Where he stands, the back wall behind him, the camera's last stop (he is then his own size). */
const Z_CH = 1000
const Z_BACK = 1070
const Z_END = Z_CH - F
/** The pillars, a lamp on each: one pair every 150 units from the doors. */
const PILLARS = [75, 225, 375, 525, 675, 825, 975] as const
/** The window behind him: its half-width, its sill and its top (an arch). */
const WW = 46
const W_SILL = 14
const W_TOP = 190

/** Dark-to-light ramps: each surface from unlit to right under its lamp (the top steps warm, the lamps' gold). */
const FLOOR_A = ['#0a0a12', '#161528', '#23223c', '#363250', '#544a62'] as const
const FLOOR_B = ['#08080e', '#111020', '#1c1b32', '#2c2944', '#463c56'] as const
const CARPET = ['#140608', '#300c12', '#58141a', '#8a1e22', '#bc302a'] as const
const GOLD = ['#120e06', '#2e230d', '#5e4618', '#9a7628', '#e0b84c'] as const
const WALL = ['#08081a', '#11112e', '#1c1a44', '#2a265a', '#3e3670'] as const
const WAINSCOT = ['#06060f', '#0d0d20', '#161532', '#211e46', '#30295a'] as const
const BANNER = ['#080c20', '#0f1a42', '#162c70', '#203e9c', '#3052c0'] as const
const MARBLE = ['#0a0a12', '#191826', '#2e2c42', '#575168', '#91889c', '#d4cad4'] as const
const CEILING = ['#05050a', '#09091a', '#0f0e22', '#16142c'] as const
/** The same floor in the window's light: further from it, nearer it. */
const SUN_A = ['#4a2a3e', '#683848'] as const
const SUN_B = ['#3e2436', '#58303e'] as const
const SUN_CARPET = ['#a02c2c', '#d04434'] as const
const SUN_GOLD = ['#b8842e', '#f0c060'] as const
/** The mesa's rock in the evening shade, three columns' worth. */
const ROCK = ['#4a2834', '#54303a', '#40222f'] as const
/** The sunset, from the horizon up. */
const SUNSET = ['#ffe08a', '#ffb048', '#f47838', '#d84a4a', '#9a3060', '#5a2468', '#2c1a52'] as const

/** Ordered-dither fills by context, colour and level: `pattern` makes a new CanvasPattern each call. */
const pats = new WeakMap<G, Map<string, CanvasPattern | string>>()
function pat(g: G, c: string, level: number) {
  let m = pats.get(g)
  if (!m) pats.set(g, (m = new Map()))
  const lv = Math.round(clamp(level, 0, 16))
  const key = c + lv
  let p = m.get(key)
  if (!p) m.set(key, (p = pattern(g, c, lv)))
  return p
}

/** A ramp's colour at light k (0..1), `off` steps darker (a pillar's shadow side). */
const tone8 = (r: readonly string[], k: number, off = 0) =>
  r[clamp(Math.round(k * (r.length - 1)) - off, 0, r.length - 1)]!

/**
 * A span of a row at light k: the ramp's nearest step, or a checker of its two nearest where k falls between them (an
 * ordered pattern, never a blend; flat steps elsewhere, so a big surface isn't all screen door).
 */
function lit(g: G, x0: number, x1: number, y: number, h: number, r: readonly string[], k: number) {
  const a = Math.max(0, Math.round(x0))
  const b = Math.min(W, Math.round(x1))
  if (b <= a || y >= H || y + h <= 0) return
  const n = r.length - 1
  const v = clamp(k) * n
  const i = Math.min(n - 1, Math.floor(v))
  const f = v - i
  rect(g, a, y, b - a, h, r[f > 0.6 ? i + 1 : i]!)
  if (f > 0.4 && f <= 0.6) rect(g, a, y, b - a, h, pat(g, r[i + 1]!, 8))
}

/**
 * How brightly the lamps light depth z at t: a pool round each pair once it has snapped on, dimmer between them, a
 * little light carried down the hall by the lamps around.
 */
function lampLight(z: number, t: number) {
  let pool = 0
  let amb = 0
  for (let i = 0; i < PILLARS.length; i++) {
    if (t < LAMPS_T[i]!) continue
    const d = Math.abs(z - PILLARS[i]!)
    pool = Math.max(pool, clamp(1 - d / 90))
    amb = Math.max(amb, clamp(1 - d / 260))
  }
  return clamp(0.82 * pool + 0.3 * amb)
}

/** The camera in the hall: its depth, and where the vanishing point sits on screen. */
function hallCam(t: number, foeX: number, foeY: number) {
  // From outside (looking through the doors), in through them, a slow creep while the lamps come on, then the rush.
  const outside = -220 * (1 - ease.inQ(span(t, T_RUSH, T_IN)))
  const creep = 60 * span(t, T_IN, T_DOLLY)
  const u = span(t, T_DOLLY, T_ARRIVE)
  // Hard out of the blocks, and a long braking at the end so he settles into his own size.
  const rush = u < 0.45 ? 0.62 * ease.inQ(u / 0.45) : 0.62 + 0.38 * ease.outC((u - 0.45) / 0.55)
  const z = outside + creep + (Z_END - 60) * rush
  const vx = lerp(120, foeX, ease.ioS(span(t, T_DOLLY + 0.1, T_ARRIVE)))
  // Outside, the vanishing point is the doorway's middle; inside, the camera tilts up a little to the hall's horizon.
  const hz = lerp(ANCHOR_Y + 5, foeY + 2 - EYE, ease.ioS(span(t, T_IN - 0.05, T_IN + 0.3)))
  return { z, vx, hz }
}

type Cam = ReturnType<typeof hallCam>

/** The view out of the window: the sun going down over Kanto's peaks, a few bars of cloud. Drawn row by row. */
function windowView(g: G, c: Cam, sb: number, rid: readonly number[]) {
  const yAt = (Y: number) => c.hz + (EYE - Y) * sb
  const y0 = Math.max(0, Math.floor(yAt(W_TOP)))
  const y1 = Math.min(H, Math.ceil(yAt(W_SILL)))
  for (let y = y0; y < y1; y++) {
    const Y = EYE - (y + 0.5 - c.hz) / sb
    const hw = archHW(Y)
    if (hw <= 0) continue
    const k = clamp((Y - W_SILL) / (W_TOP - W_SILL - 20))
    lit(g, c.vx - hw * sb, c.vx + hw * sb, y, 1, SUNSET, 1 - k)
    // Bars of cloud, lit pink from below.
    for (const [cy, cx, cw] of [
      [118, -20, 30],
      [134, 16, 24],
      [96, 22, 20],
      [160, -10, 26],
    ] as const)
      if (Math.abs(Y - cy) < 2.2)
        rect(
          g,
          c.vx + Math.max(-hw, cx - cw) * sb,
          y,
          Math.min(hw * 2, cw * 2) * sb,
          1,
          Y < cy ? '#e0607a' : '#7a2a5a',
        )
  }
  // The sun, low, right behind where he stands; its glow over the window.
  const sx = Math.round(c.vx)
  const sy = Math.round(yAt(60))
  for (const [R, col] of [
    [26, '#ffb860'],
    [19, '#ffd890'],
    [13, '#fff4c8'],
  ] as const) {
    const sr = Math.max(1, Math.round(R * sb))
    ellipse(g, sx, sy, sr, sr, col)
  }
  // The peaks out there, black against it, their tops rimmed in red.
  const x0 = Math.max(0, Math.floor(c.vx - WW * sb))
  const x1 = Math.min(W, Math.ceil(c.vx + WW * sb))
  for (let x = x0; x < x1; x++) {
    const Xw = (x + 0.5 - c.vx) / sb
    const i = clamp(Math.round(Xw + WW), 0, rid.length - 1)
    const top = Math.round(yAt(W_SILL + rid[i]!))
    const bot = Math.ceil(yAt(W_SILL))
    if (bot > top) {
      rect(g, x, top, 1, bot - top, '#1e0e22')
      rect(g, x, top, 1, 1, '#a83a3a')
    }
  }
}

/** The window's half-width at height Y: straight sides, a round top. */
function archHW(Y: number) {
  if (Y < W_SILL || Y > W_TOP) return 0
  const spring = W_TOP - WW
  if (Y <= spring) return WW
  const dy = Y - spring
  return Math.sqrt(Math.max(0, WW * WW - dy * dy))
}

/** Radii of cached glows in steps of 2, so a camera move makes a few dozen, not hundreds. */
const q2 = (r: number) => Math.max(0, Math.round(r / 2) * 2)

/** The hall from camera c at t: dark but for the window until its lamps come on, pair by pair. */
function drawHall(g: G, x: Scene, t: number, c: Cam) {
  const { z: cz, vx, hz } = c
  const sb = F / (Z_BACK - cz)
  const yBF = hz + EYE * sb
  const yBC = hz - (CEIL - EYE) * sb
  // The ceiling: dark coffers between beams.
  for (let y = 0; y < Math.min(H, Math.floor(yBC) + 1); y++) {
    const d = ((CEIL - EYE) * F) / (hz - y - 0.5)
    if (d <= 0) continue
    const z = cz + d
    const s = F / d
    const beam = ((z % 150) + 150) % 150 < 14
    const k = 0.45 * lampLight(z, t) + (beam ? 0.25 : 0)
    lit(g, vx - HW * s, vx + HW * s, y, 1, CEILING, k)
  }
  // The back wall, the window in it, the warm light round the window.
  const bwK = Math.max(lampLight(Z_BACK, t) * 0.8, 0.25)
  for (let y = Math.max(0, Math.floor(yBC)); y < Math.min(H, Math.ceil(yBF)); y++) {
    const Y = EYE - (y + 0.5 - hz) / sb
    lit(g, vx - HW * sb, vx + HW * sb, y, 1, Y < 30 ? WAINSCOT : WALL, bwK)
  }
  // The sunset lighting the stone round the window: a band of warmer wall all round its opening.
  const spring = W_TOP - WW
  for (let y = Math.max(0, Math.floor(hz + (EYE - W_TOP - 8) * sb)); y < Math.min(H, Math.ceil(yBF)); y++) {
    const Y = EYE - (y + 0.5 - hz) / sb
    if (Y < W_SILL - 6 || Y > W_TOP + 8) continue
    const hw = Y <= spring ? WW + 8 : Math.sqrt(Math.max(0, (WW + 8) ** 2 - (Y - spring) ** 2))
    if (hw > 0) rect(g, vx - hw * sb, y, hw * 2 * sb, 1, Y < W_SILL ? '#2a1830' : '#2e1e46')
  }
  windowView(g, c, sb, x.ridge)
  windowFrame(g, c, sb)
  // The floor: slate tiles and their joints, the carpet up the middle, the window's light lying along it with his
  // long shadow in it.
  for (let y = Math.max(0, Math.ceil(yBF)); y < H; y++) {
    const d = (EYE * F) / (y + 0.5 - hz)
    if (d <= 0) continue
    const z = cz + d
    const s = F / d
    const k = lampLight(z, t)
    const jt = Math.floor(z / 50)
    // A joint between two rows of tiles: the next row down lies in the next tile. Only where rows are thin enough.
    const joint = s > 0.16 && Math.floor((cz + (EYE * F) / (y + 1.5 - hz)) / 50) !== jt
    for (let i = -3; i < 3; i++) {
      const X0 = i * 50
      // The lamps stand at the sides: the floor under them is brighter than the middle.
      const kx = k * (0.62 + (0.38 * Math.abs(X0 + 25)) / 125)
      lit(g, vx + X0 * s, vx + (X0 + 50) * s, y, 1, (i + jt) & 1 ? FLOOR_A : FLOOR_B, joint ? kx - 0.3 : kx)
      if (s > 0.14) rect(g, vx + X0 * s, y, 1, 1, tone8(FLOOR_B, kx - 0.3))
    }
    // The carpet: red, gold borders, a gold bar every 100 units (they stream past in the rush).
    const kc = k * 0.88
    const bar = ((z % 100) + 100) % 100 < 5
    lit(g, vx - CW * s, vx + CW * s, y, 1, bar ? GOLD : CARPET, bar ? kc * 0.85 : kc)
    lit(g, vx - CW * s, vx - (CW - 3) * s, y, 1, GOLD, kc)
    lit(g, vx + (CW - 3) * s, vx + CW * s, y, 1, GOLD, kc)
    // The sunset through the window, laid on the floor towards us as a hard-edged patch (two strengths, the shadows
    // of the window's crossbars across it), his long shadow lying in it.
    const back = Z_BACK - z
    const crossbar = Math.abs(back - 64) < 7 || Math.abs(back - 190) < 9
    if (back > 0 && back < 330 && !crossbar) {
      const hw = WW * 0.8 * (1 + back / 600)
      const st = back < 150 ? 1 : 0
      for (let i = -3; i < 3; i++) {
        const X0 = Math.max(i * 50, -hw)
        const X1 = Math.min(i * 50 + 50, hw)
        if (X1 > X0) rect(g, vx + X0 * s, y, (X1 - X0) * s, 1, ((i + jt) & 1 ? SUN_A : SUN_B)[st]!)
      }
      rect(g, vx - CW * s, y, CW * 2 * s, 1, (bar ? SUN_GOLD : SUN_CARPET)[st]!)
      rect(g, vx - CW * s, y, 3 * s, 1, SUN_GOLD[st]!)
      rect(g, vx + (CW - 3) * s, y, 3 * s, 1, SUN_GOLD[st]!)
      // His shadow, stretched towards us: two legs, his body, the pointing arm, his head nearest us.
      const u = (Z_CH - z) / 190
      if (u > 0 && u < 1) {
        const sc = st ? '#1a0c16' : '#140a14'
        const sp = (X0: number, X1: number) => rect(g, vx + X0 * s, y, (X1 - X0) * s, 1, sc)
        if (u < 0.5) {
          const o = 1 + u * 7
          sp(-o - 4, -o + 1)
          sp(o - 1, o + 4)
        } else if (u < 0.84) sp(-7 - (u - 0.5) * 4, 7 + (u - 0.5) * 4)
        else if (u < 0.87) sp(-3, 3)
        else {
          const e = Math.sqrt(Math.max(0, 1 - ((u - 0.935) / 0.065) ** 2))
          sp(-5 * e, 5 * e)
        }
      }
    }
  }
  // The League's emblem inlaid round his feet: a ring, its band; lit when he is.
  emblem(g, c, t)
  // The side walls, column by column: stone, the panelling below, blue banners with the emblem in gold.
  for (let px = 0; px < W; px++) {
    const off = px + 0.5 - vx
    const s = Math.abs(off) / HW
    if (s <= sb) continue
    const d = F / s
    if (d < 4) continue
    const z = cz + d
    const k = lampLight(z, t) * 0.9
    const yF = hz + EYE * s
    const yC = hz - (CEIL - EYE) * s
    const top = Math.max(0, Math.floor(yC))
    const bot = Math.min(H, Math.ceil(yF))
    if (bot <= top) continue
    lit(g, px, px + 1, top, bot - top, WALL, k)
    const yW = Math.round(hz + (EYE - 28) * s)
    lit(g, px, px + 1, yW, bot - yW, WAINSCOT, k)
    rect(g, px, yW, 1, 1, tone8(GOLD, k, 1))
    rect(g, px, Math.round(hz - (200 - EYE) * s), 1, Math.max(1, Math.round(3 * s)), tone8(GOLD, k, 1))
    // A banner hangs between each pair of pillars.
    const bz = (((z - 150) % 150) + 150) % 150
    if (bz > 112 || bz < 38) {
      const u = ((bz + 38) % 150) / 76
      const gust = x.gustK(t) * Math.sin(u * 7 + t * 30) * 6
      const tail = 54 + 14 * Math.abs(u - 0.5) * 2 + gust
      const bt = Math.round(hz - (186 - EYE) * s)
      const bb = Math.round(hz - (tail - EYE) * s)
      lit(g, px, px + 1, bt, bb - bt, BANNER, k)
      // Its gold rod, and the emblem: a ring with a band across it.
      rect(g, px, bt, 1, Math.max(1, Math.round(2 * s)), tone8(GOLD, k))
      const ue = (u - 0.5) / 0.32
      if (Math.abs(ue) < 1) {
        const ey = hz - (132 - EYE) * s
        const hh = 15 * Math.sqrt(1 - ue * ue)
        rect(g, px, Math.round(ey - hh * s), 1, Math.max(1, Math.round(2 * hh * s)), tone8(GOLD, k))
        if (Math.abs(ue) < 0.8) {
          const ih = 12 * Math.sqrt(1 - (ue / 0.8) ** 2)
          rect(g, px, Math.round(ey - ih * s), 1, Math.max(1, Math.round(2 * ih * s)), tone8(BANNER, k))
          rect(g, px, Math.round(ey - ih * s), 1, Math.max(1, Math.round(ih * s)), tone8(BANNER, k + 0.25))
        }
        rect(g, px, Math.round(ey - s), 1, Math.max(1, Math.round(2 * s)), tone8(GOLD, k))
      }
    }
  }
  // The pillars, far to near, each with its lamp on the side facing the carpet.
  for (let i = PILLARS.length - 1; i >= 0; i--) for (const side of [-1, 1] as const) pillar(g, c, t, i, side)
}

/** One pillar of white marble, lit from its lamp side; a gold ring, a plinth and a capital; its lamp. */
function pillar(g: G, c: Cam, t: number, i: number, side: -1 | 1) {
  const d = PILLARS[i]! - c.z
  if (d < 8) return
  const s = F / d
  const xc = c.vx + side * PX * s
  const w = PW * s
  if (xc + w < 0 || xc - w > W) return
  const k = lampLight(PILLARS[i]!, t)
  const yF = c.hz + EYE * s
  const yC = c.hz - (CEIL - EYE) * s
  const top = Math.max(-1, Math.floor(yC))
  const h = Math.ceil(yF) - top
  // Three bands across it: the lamp's side, its middle, the side away from it.
  const inner = side < 0 ? 1 : -1
  const x0 = xc - w / 2
  const b = [0.36, 0.38, 0.26]
  const order = inner > 0 ? [2, 1, 0] : [0, 1, 2]
  let xa = x0
  for (const j of order) {
    const xb = xa + w * b[j]!
    rect(g, xa, top, Math.max(1, Math.round(xb) - Math.round(xa)), h, tone8(MARBLE, k * 0.95 + 0.05, j + 1))
    xa = xb
  }
  // A thin dark groove each side of the middle (fluting), once it is big enough to show it.
  if (w > 9) {
    rect(g, x0 + w * 0.36, top, 1, h, tone8(MARBLE, k, 3))
    rect(g, x0 + w * 0.74, top, 1, h, tone8(MARBLE, k, 3))
  }
  // The plinth, the gold ring, the capital (wider bands).
  const band = (Y0: number, Y1: number, grow: number, r: readonly string[], off: number) => {
    const ya = Math.round(c.hz + (EYE - Y1) * s)
    const yb = Math.round(c.hz + (EYE - Y0) * s)
    const ww = w * grow
    rect(g, xc - ww / 2, ya, Math.max(1, ww), Math.max(1, yb - ya), tone8(r, k * 0.95 + 0.05, off))
    rect(g, xc - ww / 2, ya, Math.max(1, ww), 1, tone8(r, k * 0.95 + 0.05, off - 1))
  }
  band(0, 12, 1.32, MARBLE, 1)
  band(12, 15, 1.16, GOLD, 0)
  band(58, 61, 1.04, GOLD, 0)
  band(CEIL - 22, CEIL, 1.36, MARBLE, 1)
  // The lamp: an arm out from the pillar towards the carpet, a globe on it; its gleam in the polished floor.
  const ax = xc + inner * (w / 2)
  const lx = Math.round(xc + inner * (w / 2 + 7 * s))
  const ly = Math.round(c.hz + (EYE - 112) * s)
  line(g, ax, ly + 2 * s, lx, ly + 2 * s, tone8(GOLD, k * 0.8, 1), Math.max(1, Math.round(s)))
  const on = t >= LAMPS_T[i]!
  const pop = on ? 1 - span(t, LAMPS_T[i]!, LAMPS_T[i]! + 0.12) : 0
  const r = Math.max(1, Math.round(4 * s))
  if (on) {
    const gr = q2(16 * s * (1 + pop))
    if (gr >= 4) g.drawImage(glow(gr, '#ffd890', 1.8, 0.55), lx - gr, ly - gr)
    ellipse(g, lx, ly, r + 1, r + 1, pop > 0.3 ? '#ffffff' : '#b8843e')
  }
  ellipse(g, lx, ly, r, r, on ? (pop > 0.3 ? '#ffffff' : '#fff0c0') : '#1c1c28')
  if (on && r >= 2) rect(g, lx - 1, ly - 1, 1, 1, '#ffffff')
  // The snap: a spark of four rays off the globe as it comes on.
  if (pop > 0) {
    const n = Math.round((4 + 10 * s) * pop)
    rect(g, lx - r - n, ly, n, 1, '#ffffff')
    rect(g, lx + r + 1, ly, n, 1, '#ffffff')
    rect(g, lx, ly - r - n, 1, n, '#ffffff')
    rect(g, lx, ly + r + 1, 1, n, '#ffffff')
  }
}

/** The window's frame: bronze mullions, the arch's rim, the sill. */
function windowFrame(g: G, c: Cam, sb: number) {
  const yAt = (Y: number) => Math.round(c.hz + (EYE - Y) * sb)
  const fw = Math.max(1, Math.round(3 * sb))
  const col = '#2a1c22'
  rect(g, c.vx - fw / 2, yAt(W_TOP), fw, yAt(W_SILL) - yAt(W_TOP), col)
  for (const Y of [92, W_TOP - WW]) {
    const hw = archHW(Y)
    rect(g, c.vx - hw * sb, yAt(Y), hw * 2 * sb, fw, col)
  }
  // The rim, two pixels round the opening at this size, one when far.
  const spring = W_TOP - WW
  const ya = yAt(spring)
  const yb = yAt(W_SILL)
  rect(g, c.vx - WW * sb - fw, ya, fw, yb - ya, col)
  rect(g, c.vx + WW * sb, ya, fw, yb - ya, col)
  ellipseLine(g, c.vx, ya, Math.round(WW * sb), Math.round(WW * sb), col, Math.PI, Math.PI * 2)
  if (fw > 1)
    ellipseLine(g, c.vx, ya, Math.round(WW * sb) + 1, Math.round(WW * sb) + 1, col, Math.PI, Math.PI * 2)
  rect(g, c.vx - (WW + 6) * sb, yb, (WW + 6) * 2 * sb, Math.max(1, Math.round(5 * sb)), '#3a2a2e')
}

/** The emblem round his feet: a gold ring with the ball's band across it, lit by the lamps, blazing at the reveal. */
function emblem(g: G, c: Cam, t: number) {
  const d = Z_CH - c.z
  if (d < 10) return
  const s = F / d
  const k = Math.max(
    0.55 * lampLight(Z_CH, t),
    span(t, REVEAL, REVEAL + 0.1) * (1 - 0.4 * span(t, REVEAL + 0.5, REVEAL + 1.2)),
  )
  const cx = Math.round(c.vx)
  const cy = Math.round(c.hz + EYE * s)
  for (const [R, off] of [
    [52, 0],
    [49, 1],
    [16, 0],
  ] as const) {
    const rx = Math.round(R * s)
    const ry = Math.max(1, Math.round((R * EYE * F) / (d * d)))
    if (rx < 2) continue
    ellipseLine(g, cx, cy, rx, ry, tone8(GOLD, k, off))
  }
  const rx = Math.round(49 * s)
  rect(g, cx - rx, cy, rx - Math.round(16 * s), 1, tone8(GOLD, k, 1))
  rect(g, cx + Math.round(16 * s), cy, rx - Math.round(16 * s), 1, tone8(GOLD, k, 1))
}

// ---------------------------------------------------------------- outside: the League on its mesa
/** The doorway's middle on screen, fixed while the camera pushes in on it. */
const ANCHOR_X = 120
const ANCHOR_Y = 100
/** The door: half-width, top of its arch (above the threshold, which is 0). */
const DW = 7
const DH = 26

/** How close the camera is to the doors: a slow push, then the rush through them. */
const zoomAt = (t: number) =>
  t < T_RUSH ? lerp(1, 1.4, ease.ioS(span(t, 0, T_RUSH))) : lerp(1.4, 22, ease.inC(span(t, T_RUSH, T_IN)))

/** How far open the doors are (0..1): flung open, a bounce off their stops. */
const doorsAt = (t: number) => (t < T_DOORS ? 0 : ease.outBack(span(t, T_DOORS, T_DOORS + 0.16), 2.6))

/** The sky, the sun, the clouds and Victory Road's peaks: they don't move as the camera pushes in. */
function sunsetBack(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(
    dGradient(W, 126, ['#1c1440', '#2e1a52', '#5a2464', '#9a3460', '#d8504a', '#f4843a', '#ffc060']),
    0,
    0,
  )
  rect(g, 0, 126, W, H - 126, '#ffc060')
  // Bars of cloud, dark above and lit pink beneath, thicker and warmer towards the horizon.
  const r = rng(1801)
  for (let i = 0; i < 13; i++) {
    const y = 8 + i * 7 + r.int(-2, 2)
    const x = r.range(-30, W)
    const w = r.range(30, 100)
    const low = i > 6
    rect(g, x, y, w, low ? 3 : 2, low ? '#a83c5a' : '#3e2058')
    rect(g, x + 5, y + (low ? 3 : 2), w - 10, 1, low ? '#ff9a6a' : '#7a3a6a')
    if (low) rect(g, x + 2, y - 1, w - 12, 1, '#7a2a52')
  }
  // The sun, low on the right, half behind the peaks: rings of light, no blur.
  for (const [R, c] of [
    [22, '#ffb860'],
    [17, '#ffd890'],
    [13, '#fff2c0'],
    [10, '#fffae8'],
  ] as const)
    ellipse(g, 204, 108, R, R, c)
  // Two ranges: the far one hazy violet, the near one dark with its sunward edges lit.
  for (const [base, amp, seed, c, lit, hz] of [
    [112, 30, 5, '#5a2a5e', '#a04a5a', 0.6],
    [126, 36, 9, '#2c1630', '#d0603a', 1],
  ] as const) {
    const rr = rng(seed)
    const rid = ridge(rr, W + 1, amp, 0.55)
    for (let x = 0; x <= W; x++) {
      const top = Math.round(base - rid[x]!)
      rect(g, x, top, 1, H - top, c)
      // The sun is on the right: a face falling to the right catches it.
      if (rid[x + 1] != null && rid[x + 1]! < rid[x]! - 0.2) rect(g, x, top, 1, Math.round(2 + 3 * hz), lit)
      else rect(g, x, top, 1, 1, lit)
    }
  }
  return cv
}

/** A ridge line by midpoint displacement: n heights in 0..amp. */
function ridge(r: ReturnType<typeof rng>, n: number, amp: number, rough: number): number[] {
  let size = 1
  while (size < n) size *= 2
  const h = new Array<number>(size + 1).fill(0)
  h[0] = r() * amp
  h[size] = r() * amp
  for (let step = size, a = amp; step > 1; step /= 2, a *= rough)
    for (let i = step / 2; i < size; i += step)
      h[i] = (h[i - step / 2]! + h[i + step / 2]!) / 2 + (r() - 0.5) * a
  const lo = Math.min(...h)
  const hi = Math.max(...h)
  return h.slice(0, n).map((v) => ((v - lo) / (hi - lo || 1)) * amp)
}

/** Rows of a shape given by its half-width at each height, centred on X = cx, in the facade's units; clipped. */
function rows(g: G, z: number, cx: number, Y0: number, Y1: number, hw: (Y: number) => number, c: string) {
  const ya = Math.max(0, Math.floor(ANCHOR_Y + (Y0 + 13) * z))
  const yb = Math.min(H, Math.ceil(ANCHOR_Y + (Y1 + 13) * z))
  for (let y = ya; y < yb; y++) {
    const Y = (y + 0.5 - ANCHOR_Y) / z - 13
    const w = hw(Y)
    if (w <= 0) continue
    const xa = Math.max(-1, Math.round(ANCHOR_X + (cx - w) * z))
    const xb = Math.min(W + 1, Math.round(ANCHOR_X + (cx + w) * z))
    if (xb > xa) rect(g, xa, y, xb - xa, 1, c)
  }
}

/**
 * Victory Road's boulders in the near corners, black against the light with the sunset on their tops: nearest of
 * all, they rush out of the frame as the camera pushes in.
 */
function boulders(g: G, x: Scene, z: number) {
  const zf = 1 + (z - 1) * 1.6
  for (let px = 0; px < W; px++) {
    const sx = ANCHOR_X + (px + 0.5 - ANCHOR_X) / zf
    const i = Math.round(sx)
    if (i < 0 || i >= W) continue
    const top = x.rocks[i]!
    if (top >= H) continue
    const y = Math.round(ANCHOR_Y + (top - ANCHOR_Y) * zf)
    if (y >= H) continue
    rect(g, px, y, 1, H - y, '#1c0e1a')
    // Its crown: lit where the rock falls away to the right (towards the sun), dull red where it climbs; a second
    // lit band below the rim on the sunward side, so it reads round.
    const d = (x.rocks[Math.min(W - 1, i + 1)] ?? top) - top
    rect(g, px, y, 1, Math.max(1, Math.round(zf * (d > 0 ? 2 : 1))), d > 0 ? '#d07a4e' : '#5a2c34')
    if (d > 0) rect(g, px, y + Math.round(2 * zf), 1, Math.round(3 * zf), '#4a2430')
    if (x.crackAt[i]) rect(g, px, y + Math.round(5 * zf), 1, Math.round(x.crackAt[i]! * zf), '#0e060e')
  }
}

/** The League's front, the mesa and its stairs, at zoom z about the doorway; the doorway left open (cut out). */
function facade(g: G, x: Scene, t: number, z: number) {
  const sx = (X: number) => Math.round(ANCHOR_X + X * z)
  const sy = (Y: number) => Math.round(ANCHOR_Y + (Y + 13) * z)
  const R = (X0: number, Y0: number, X1: number, Y1: number, c: string | CanvasPattern) => {
    const a = sx(X0)
    const b = sx(X1)
    const ya = sy(Y0)
    const yb = sy(Y1)
    if (b > a && yb > ya && b > 0 && a < W && yb > 0 && ya < H) rect(g, a, ya, b - a, yb - ya, c)
  }
  // The mesa: columns of rock falling away under the terrace, split by cracks, in the evening shade; the sun only
  // catching the right-hand edges of those on its side, and a ledge here and there.
  const yTop = 12
  const nJ = x.jag.length
  const cr = x.cracks
  for (let y = Math.max(0, sy(yTop)); y < H; y++) {
    const Y = (y + 0.5 - ANCHOR_Y) / z - 13
    const dy = Y - yTop
    const yi = clamp(Math.round(dy), 0, nJ - 1)
    const lw = 76 + dy * 0.9 + x.jag[yi]!
    const rw = 76 + dy * 0.9 + x.jag[(yi + 37) % nJ]!
    rect(g, sx(-lw), y, sx(rw) - sx(-lw), 1, '#3e2232')
    for (let j = 0; j < cr.length - 1; j++) {
      const a0 = Math.max(-lw, cr[j]![0] + cr[j]![1] * dy)
      const a1 = Math.min(rw, cr[j + 1]![0] + cr[j + 1]![1] * dy)
      if (a1 <= a0) continue
      const sun = (a0 + a1) / 2 > -14
      const w = a1 - a0
      rect(g, sx(a0), y, sx(a1) - sx(a0), 1, ROCK[cr[j]![3]]!)
      // The edge that faces the sun.
      const e = a1 - w * (sun ? 0.3 : 0.16)
      rect(g, sx(e), y, sx(a1) - sx(e), 1, sun ? '#a85a42' : '#5e3440')
      if (sun) rect(g, sx(a1 - w * 0.1), y, sx(a1) - sx(a1 - w * 0.1), 1, '#d88450')
      rect(g, sx(a0), y, 1, 1, '#24121e')
    }
    rect(g, sx(-lw), y, 2, 1, '#24121e')
    rect(g, sx(rw) - 1, y, 1, 1, '#e0905a')
  }
  // Victory Road's stairs climbing it to the doors.
  for (let Y = yTop; Y < 140; Y += 3) {
    R(-11, Y, 11, Y + 1, '#e8d0a8')
    R(-11, Y + 1, 11, Y + 3, '#9a7a62')
    R(7, Y, 11, Y + 3, '#b08868')
    R(-11, Y + 1, -7, Y + 3, '#6a4e4c')
  }
  R(-13, yTop, -11, 140, '#3a2030')
  R(11, yTop, 13, 140, '#d0905e')
  // The terrace.
  R(-80, 6, 80, yTop, '#a8908a')
  R(-80, 6, 80, 7, '#e0c8b0')
  R(-80, yTop - 1, 80, yTop, '#5a4048')
  // The towers at the ends, with pyramid roofs and the League's pennants.
  for (const sd of [-1, 1]) {
    const cx = sd * 55
    R(cx - 7, -50, cx + 7, 6, '#d8c4a4')
    R(sd > 0 ? cx + 3 : cx - 7, -50, sd > 0 ? cx + 7 : cx - 4, 6, sd > 0 ? '#f4e2c0' : '#a89078')
    R(cx - 2, -40, cx + 2, -30, '#26244c')
    R(cx - 2, -42, cx + 2, -40, '#26244c')
    R(cx, -39, cx + 2, -35, '#ff9a60')
    rows(g, z, cx, -62, -50, (Y) => 9 * ((Y + 62) / 12), '#a82a22')
    rows(g, z, cx + (sd > 0 ? 2 : -2), -60, -50, (Y) => 5 * ((Y + 60) / 10), sd > 0 ? '#e0583a' : '#7a1c1a')
    R(cx, -74, cx + 1, -62, '#3a2a2a')
    const wv = Math.sin(t * 9 + sd) > 0 ? 1 : 0
    R(cx + 1, -74, cx + 9, -71 + wv, '#2a44a8')
    R(cx + 1, -71 + wv, cx + 5, -69 + wv, '#2a44a8')
    R(cx + 1, -74, cx + 9, -73, '#5a7ae8')
  }
  // The long hall: cream stone, pilasters, tall arched windows full of the sunset.
  R(-48, -28, 48, 6, '#d8c4a4')
  for (const X of [-46, -37, -28, 27, 36, 45]) R(X, -28, X + 2, 6, '#ecdcbc')
  for (const X of [-33, -42, 32, 41]) {
    R(X - 2, -22, X + 3, -5, '#24224a')
    R(X - 1, -23, X + 2, -22, '#24224a')
    R(X + 1, -21, X + 3, -16, '#ff9a60')
    R(X - 2, -5, X + 3, -4, '#f4e2c0')
  }
  R(-48, -28, 48, -26, '#a89078')
  // Its roof: red tiles, a darker course every other row, the ridge catching the sun.
  const roofHW = (Y: number) => 44 + ((Y + 38) / 10) * 10
  rows(g, z, 0, -38, -28, roofHW, '#a82a22')
  for (let Y = -36; Y < -28; Y += 2) rows(g, z, 0, Y, Y + 1, roofHW, '#7a1c1a')
  R(-45, -39, 45, -38, '#e0583a')
  // The portico: four columns, an entablature, a pediment with the League's emblem in it.
  R(-23, -42, 23, 6, '#ecdcbc')
  R(-23, -42, 23, -38, '#c8b088')
  R(-23, -39, 23, -38, '#d8a840')
  for (const X of [-19, -11, 11, 19]) {
    R(X - 2, -38, X + 2, 3, '#f8f0e0')
    R(X + 1, -38, X + 2, 3, '#c0b098')
    R(X - 3, -38, X + 3, -36, '#fffaf0')
    R(X - 3, 2, X + 3, 6, '#c8b8a0')
  }
  rows(g, z, 0, -58, -42, (Y) => 27 * ((Y + 58) / 16), '#a82a22')
  rows(g, z, 0, -55, -44, (Y) => 20 * ((Y + 55) / 11), '#ecdcbc')
  R(-27, -43, 27, -42, '#e0583a')
  // The emblem: a ball, red over white, its band and button.
  const ex = sx(0)
  const ey = sy(-48.5)
  const er = Math.max(2, Math.round(4 * z))
  ellipse(g, ex, ey, er + 1, er + 1, '#2a1a1a')
  for (let dy = -er; dy <= er; dy++) {
    const hw = Math.round(er * Math.sqrt(Math.max(0, 1 - (dy * dy) / (er * er + 0.25))))
    rect(g, ex - hw, ey + dy, hw * 2 + 1, 1, dy < 0 ? '#d8302a' : '#f4f0e8')
  }
  rect(g, ex - er, ey, er * 2 + 1, Math.max(1, Math.round(z * 0.8)), '#2a1a1a')
  ellipse(g, ex, ey, Math.max(1, Math.round(1.4 * z)), Math.max(1, Math.round(1.4 * z)), '#f4f0e8')
  // The lanterns between the columns by the door.
  for (const sd of [-1, 1]) {
    R(sd * 15 - 1, -16, sd * 15 + 1, -11, '#ffe090')
    R(sd * 15 - 1, -17, sd * 15 + 1, -16, '#3a2a2a')
  }
  // The doorway: a gold frame round an arch, cut out so the hall shows through it.
  rows(g, z, 0, -DH - 1.5, 1, (Y) => doorHW(Y) + 1.5, '#d8a840')
  g.save()
  g.globalCompositeOperation = 'destination-out'
  rows(g, z, 0, -DH, 1, doorHW, '#000000')
  g.restore()
}

/** The doorway's half-width at height Y (an arch on top). */
const doorHW = (Y: number) => {
  if (Y > 1 || Y < -DH) return 0
  const spring = -DH + DW
  if (Y >= spring) return DW
  const dy = spring - Y
  return Math.sqrt(Math.max(0, DW * DW - dy * dy))
}

/** The door's two leaves swinging into the hall: each narrows towards its hinge and darkens as it turns. */
function leaves(g: G, z: number, open: number) {
  const k = clamp(open, 0, 1.08)
  const vis = DW * Math.max(0.12, Math.cos(k * 1.35))
  for (const sd of [-1, 1]) {
    const hinge = sd * DW
    const edge = hinge - sd * vis
    rows(
      g,
      z,
      (hinge + edge) / 2,
      -DH,
      1,
      (Y) => Math.min(Math.abs(hinge - edge) / 2, doorHW(Y)),
      k > 0.4 ? '#2a160e' : '#5a2e1e',
    )
    // Its panels and studs, while it still faces us.
    if (k < 0.5) {
      rows(g, z, (hinge + edge) / 2, -DH + 9, -4, () => Math.abs(hinge - edge) / 2 - 1.5, '#7a4428')
      rows(g, z, edge + sd * 1, -14, -12, () => 0.6, '#f0c850')
    }
  }
}

/** Pidgeot far off, a little bird of shadow against the sunset: wings up, level, down; its plume streaming back. */
function bird(g: G, x: number, y: number, t: number) {
  const c = '#24101e'
  const f = Math.floor(t * 14) % 4
  ellipse(g, x, y, 4, 1, c)
  rect(g, x + 4, y - 2, 3, 2, c)
  rect(g, x + 7, y - 1, 1, 1, c)
  line(g, x + 4, y - 2, x + 1, y - 5, '#c83a2a')
  line(g, x + 3, y - 2, x, y - 4, '#f0b030')
  line(g, x - 4, y, x - 8, y - 1, c)
  line(g, x - 4, y, x - 8, y + 1, c)
  if (f === 0) {
    line(g, x, y - 1, x - 4, y - 7, c)
    line(g, x + 1, y - 1, x - 1, y - 8, c)
  } else if (f === 2) {
    line(g, x, y + 1, x - 3, y + 6, c)
    line(g, x + 1, y + 1, x, y + 6, c)
  } else {
    line(g, x - 1, y, x - 6, y - 2, c)
    line(g, x + 1, y, x - 2, y - 3, c)
  }
}

type X = {
  buf: Canvas
  ext: Canvas
  sunset: Canvas
  ridge: number[]
  jag: number[]
  /** The mesa's cracks: x at its top, slant outwards per unit down, where its ledges fall, its column's shade. */
  cracks: [number, number, number, number][]
  /** The near boulders' tops by screen column (H: none there), and the cracks down their faces. */
  rocks: number[]
  crackAt: number[]
  gustK: (t: number) => number
}
type Scene = X

/**
 * Pidgeot: down out of the sky past the window and round to hover at his left shoulder, a little behind him, wings
 * beating; off up into the rafters after the reveal.
 */
function pidgeotAt(t: number, fx: number, fy: number) {
  const q = span(t, T_SWOOP, T_HOVER)
  const e = ease.outC(q)
  const away = ease.inQ(span(t, REVEAL + 0.3, REVEAL + 1.1))
  // A curve: in from the top right, sweeping low across the window, then up into its place.
  const x = lerp(fx + 110, fx - 56, e) - 70 * away
  const y = lerp(-46, fy - 24, e) + 22 * Math.sin(Math.PI * e) + Math.sin(t * 9) * 1.5 - 130 * away
  // A wingbeat: the wings thrown up (a stretch), then driven down (a squash) — two big ones for the gust.
  const beat = (t0: number) => {
    const u = span(t, t0 - 0.12, t0 + 0.14)
    return u > 0 && u < 1 ? Math.sin(Math.PI * 2 * u) : 0
  }
  const big = beat(T_GUST) + beat(T_GUST2)
  const flap = Math.sin(t * 15) * 0.05 + big * 0.14
  return { x, y, sy: 1 + flap, sx: 1 - flap * 0.4 + Math.abs(big) * 0.08 }
}

export const blueChampion = championCinema<X>({
  id: 'blue',
  reveal: REVEAL,
  seed: 1803,
  aura: ['#ffffff', '#9ad0ff', '#3a6ae0', '#1a2a6a'],
  flash: '#e8f2ff',
  sample: { trainer: '/trainers/classes/blue-3.png', name: 'Champion Blue', lead: 6, ace: 18, team: 3 },
  extras: [18],
  setup(st) {
    const r = rng(1803)
    st.screenShakes.push([T_DOORS, 0.4, 2], [T_GUST, 0.4, 2], [T_GUST2, 0.35, 2], [REVEAL, 0.35, 2])
    const rid = ridge(r, WW * 2 + 1, 26, 0.6)
    const jag = Array.from({ length: 200 }, (_, i) =>
      Math.round(Math.sin(i * 0.9) * 2 + Math.sin(i * 0.31) * 4 + r.range(-1, 1)),
    )
    const cracks: [number, number, number, number][] = [-130, -58, -31, -13, 13, 33, 61, 130].map((x0) => [
      x0 + r.range(-2, 2),
      (x0 / 76) * 0.22 + r.range(-0.08, 0.08),
      r.int(0, 22),
      r.int(0, 2),
    ])
    // The near boulders: rounded humps, the nearer and bigger at the edges of the frame.
    const humps = [
      [8, 132, 34],
      [48, 146, 22],
      [80, 158, 16],
      [236, 128, 38],
      [196, 144, 22],
      [166, 156, 14],
    ] as const
    const bump = ridge(r, W, 3, 0.8)
    const rocks = Array.from({ length: W }, (_, x) => {
      let top = H
      for (const [cx, cy, rr] of humps)
        if (Math.abs(x - cx) < rr) top = Math.min(top, cy - Math.sqrt(rr * rr - (x - cx) ** 2) * 0.8)
      return top < H ? Math.round(top + bump[x]!) : H
    })
    const crackAt = Array.from({ length: W }, () => (r() < 0.06 ? r.int(5, 18) : 0))
    return {
      rocks,
      crackAt,
      cracks,
      buf: canvas(W, H),
      ext: canvas(W, H),
      sunset: sunsetBack(),
      ridge: rid,
      jag,
      gustK: (t: number) =>
        Math.max(pulse(t, T_GUST - 0.05, T_GUST + 0.5), 0.8 * pulse(t, T_GUST2 - 0.05, T_GUST2 + 0.45)),
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F0 = s.L.foe
    // The doors: dust blown off the threshold as they slam back.
    if (within(t, T_DOORS, T_DOORS + dt)) {
      const z = zoomAt(t)
      for (let i = 0; i < 26; i++)
        s.fx.add({
          x: ANCHOR_X + r.range(-DW, DW) * z,
          y: ANCHOR_Y + 13 * z,
          vx: r.range(-90, 90),
          vy: -r.range(5, 30),
          drag: 3,
          // Short-lived: the camera rushes in through it a moment later.
          life: r.range(0.2, 0.3),
          size: r.int(2, 3),
          size1: 4,
          shape: 'smoke',
          colors: ['#c8a890', '#8a6a6a'],
          light: '#e8c8a8',
        })
    }
    // The gust: wind lines blasting off its wings, down the hall at us and the challenger; feathers; floor dust.
    const gk = s.gustK(t)
    const p = pidgeotAt(t, F0.x, F0.y)
    if (gk > 0.2 && r() < gk * 0.9)
      for (let i = 0; i < 2; i++) {
        // Off its leading edge and wingtips, never across its body.
        const a = Math.PI * r.range(0.82, 1.12)
        const v = r.range(260, 420)
        s.fx.add({
          x: p.x - r.range(30, 40),
          y: p.y - r.range(6, 64),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.7 + 60,
          life: r.range(0.3, 0.5),
          size: 1,
          shape: 'streak',
          trail: 0.06,
          colors: ['#ffffff', '#c8d4f0', '#6a78a0'],
        })
      }
    if (within(t, T_GUST, T_GUST + dt) || within(t, T_GUST2, T_GUST2 + dt))
      for (let i = 0; i < 12; i++) {
        s.fx.add({
          x: p.x + r.range(-22, 22),
          y: p.y - r.range(10, 44),
          vx: -r.range(40, 170),
          vy: r.range(-30, 60),
          ay: 50,
          drag: 0.9,
          life: r.range(1, 1.5),
          size: 2,
          shape: 'leaf',
          spin: r.range(-8, 8),
          colors: ['#b8844a'],
          light: '#f0dcb0',
          dark: '#6a4428',
        })
      }
    if (gk > 0.3 && r() < gk * 1.5)
      s.fx.add({
        x: F0.x + r.range(-90, 30),
        y: F0.y + r.range(0, 30),
        vx: -r.range(120, 220),
        vy: r.range(5, 30),
        drag: 1.2,
        life: r.range(0.4, 0.7),
        size: 1,
        shape: 'streak',
        trail: 0.03,
        colors: ['#8a84a8', '#4a4868'],
      })
    // The spin throws off a ring of air; the glint.
    if (within(t, T_SPIN + SPIN_DUR * 0.85, T_SPIN + SPIN_DUR * 0.85 + dt)) {
      const tz = spriteSize(s.p.trainer)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        s.fx.add({
          x: F0.x,
          y: F0.y + 2 - tz.h * 0.45,
          vx: Math.cos(a) * 110,
          vy: Math.sin(a) * 40,
          drag: 4,
          life: 0.35,
          size: 1,
          shape: 'streak',
          trail: 0.04,
          colors: ['#ffffff', '#9ad0ff'],
        })
      }
    }
    // Spotlight motes after the reveal, drifting in the beams.
    if (t > REVEAL && t < REVEAL + 1.4 && r() < 0.5)
      s.fx.add({
        x: F0.x + r.range(-40, 40),
        y: r.range(0, 90),
        vx: r.range(-4, 4),
        vy: r.range(4, 12),
        life: 1,
        size: 1,
        shape: 'px',
        colors: ['#fff6d0', '#c8b890'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F0 = s.L.foe
    const c = hallCam(t, F0.x, F0.y)
    drawHall(b, s, t, c)
    // Through the doorway, before the camera is in: the far figure, small, with his back to us.
    if (t < T_IN) {
      const sc = F / (Z_CH - c.z)
      drawSprite(b, s.p.trainer, Math.round(c.vx), Math.round(c.hz + EYE * sc), {
        sx: sc,
        sy: sc,
        sil: '#0a0612',
        flip: true,
      })
    }
    drawPidgeot(b, s, t)
    if (t > REVEAL) spotlights(b, F0.x, F0.y, t)
    if (t < T_IN) {
      const e = s.ext.g
      const z = zoomAt(t)
      e.clearRect(0, 0, W, H)
      e.drawImage(s.sunset, 0, 0)
      const u = span(t, T_BIRD, T_BIRD + 0.95)
      if (u > 0 && u < 1)
        bird(e, Math.round(lerp(-12, 252, u)), Math.round(lerp(30, 76, u) - Math.sin(u * Math.PI) * 8), t)
      facade(e, s, t, z)
      boulders(e, s, z)
      // The leaves, in the opening (in the hall's own space: they swing in over its floor).
      b.drawImage(s.ext, 0, 0)
      leaves(b, z, doorsAt(t))
    }
    const sh = screenShake(t, s.screenShakes)
    if ((sh.x || sh.y) && k >= 1) rect(g, 0, 0, W, H, '#05050a')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_IN) return
    const F0 = s.L.foe
    const c = hallCam(t, F0.x, F0.y)
    const sh = screenShake(t, s.screenShakes)
    const sc = F / (Z_CH - c.z)
    const x = Math.round(c.vx) + sh.x
    const y = Math.round(c.hz + EYE * sc) + sh.y
    // His back to us, black against the window, rimmed in its light; then one and a half turns on his heel.
    const q = ease.outC(span(t, T_SPIN, T_SPIN + SPIN_DUR))
    const th = q * Math.PI * 3
    const cs = Math.cos(th)
    const facing = cs < 0
    const w = Math.max(0.06, Math.abs(cs))
    drawSprite(g, s.p.trainer, x, y, {
      sx: sc * w,
      sy: sc,
      flip: !facing,
      sil: facing ? undefined : '#0a0612',
      outline: facing ? '#ffb070' : sc > 0.35 ? '#ff9a5a' : undefined,
    })
    // The glint: a star on his face as he finishes the turn.
    const gq = span(t, T_GLINT, T_GLINT + 0.2)
    if (gq > 0 && gq < 1) {
      const tz = spriteSize(s.p.trainer)
      const n = Math.round(7 * Math.sin(Math.PI * gq))
      const gx = x + Math.round(tz.w * 0.1)
      const gy = y - Math.round(tz.h * 0.8)
      rect(g, gx - n, gy, n * 2 + 1, 1, '#ffffff')
      rect(g, gx, gy - n, 1, n * 2 + 1, '#ffffff')
      const m = Math.round(n * 0.45)
      for (let i = 1; i <= m; i++) {
        rect(g, gx - i, gy - i, 1, 1, '#ffffff')
        rect(g, gx + i, gy - i, 1, 1, '#ffffff')
        rect(g, gx - i, gy + i, 1, 1, '#ffffff')
        rect(g, gx + i, gy + i, 1, 1, '#ffffff')
      }
      if (n >= 3) rect(g, gx - 1, gy - 1, 3, 3, '#ffffff')
    }
  },
  front(g, s, t) {
    // The gust's rings of air, off its wings.
    const F0 = s.L.foe
    const p = pidgeotAt(t, F0.x, F0.y)
    burstRing(g, p.x, p.y - 30, span(t, T_GUST, T_GUST + 0.4), 90, 2, '#c8d4f0')
    burstRing(g, p.x, p.y - 30, span(t, T_GUST2, T_GUST2 + 0.4), 110, 2, '#ffffff')
  },
  sounds: [
    [0.05, () => hiss(1.2, { freq: 380, type: 'lowpass', vol: 0.04 })],
    // Pidgeot's cry over the plateau.
    [
      0.32,
      () => (
        tone(1500, 0.22, { type: 'triangle', vol: 0.03, slide: -500 }),
        tone(1900, 0.18, { type: 'triangle', vol: 0.02, slide: -700, at: 0.12 })
      ),
    ],
    // The doors: a boom, wood on stone.
    [
      T_DOORS,
      () => (
        tone(52, 0.6, { type: 'sine', vol: 0.16, slide: -18 }),
        tone(110, 0.15, { type: 'square', vol: 0.04, slide: -50 }),
        hiss(0.45, { freq: 260, type: 'lowpass', vol: 0.12 })
      ),
    ],
    [T_RUSH, () => hiss(0.4, { freq: 500, slide: 1400, vol: 0.05 })],
    // The lamps, one clack a pair, a step up the scale each.
    ...LAMPS_T.map(
      (at, i) =>
        [
          at,
          () => (
            hiss(0.05, { freq: 2600, vol: 0.09 }),
            tone([392, 440, 494, 523, 587, 659, 784][i]!, 0.09, { type: 'square', vol: 0.03 })
          ),
        ] as const,
    ),
    [T_DOLLY, () => hiss(1.1, { freq: 300, slide: 2200, vol: 0.06 })],
    [T_DOLLY + 0.5, () => tone(196, 0.6, { type: 'sawtooth', vol: 0.02, slide: 196 })],
    [
      T_SWOOP,
      () => (
        tone(1700, 0.25, { type: 'triangle', vol: 0.035, slide: -800 }),
        hiss(0.35, { freq: 1200, slide: -800, vol: 0.05 })
      ),
    ],
    [
      T_GUST,
      () => (
        hiss(0.45, { freq: 420, type: 'lowpass', vol: 0.14 }),
        tone(70, 0.25, { type: 'sine', vol: 0.1 })
      ),
    ],
    [
      T_GUST2,
      () => (
        hiss(0.5, { freq: 380, type: 'lowpass', vol: 0.16 }),
        tone(62, 0.3, { type: 'sine', vol: 0.12 })
      ),
    ],
    [T_SPIN, () => hiss(0.3, { freq: 2400, slide: -1800, vol: 0.06 })],
    [
      T_GLINT,
      () => (
        tone(2349, 0.12, { type: 'triangle', vol: 0.03 }),
        tone(3136, 0.18, { type: 'triangle', vol: 0.025, at: 0.06 })
      ),
    ],
    [
      REVEAL,
      () => (
        hiss(0.06, { freq: 3000, vol: 0.1 }),
        [392, 494, 587, 784].forEach((f, i) => tone(f, 0.5, { type: 'square', vol: 0.022, at: i * 0.03 })),
        tone(55, 0.5, { type: 'sine', vol: 0.12, slide: -10 })
      ),
    ],
  ],
})

/** Pidgeot at his shoulder, lit by the lamps and rimmed by the sunset; a white flash as the spotlights hit it. */
function drawPidgeot(g: G, s: ChampionState<X>, t: number) {
  if (t < T_SWOOP || t > REVEAL + 1.2) return
  const F0 = s.L.foe
  const p = pidgeotAt(t, F0.x, F0.y)
  drawSprite(g, PIDGEOT, Math.round(p.x), Math.round(p.y), {
    sx: p.sx,
    sy: p.sy,
    outline: t < REVEAL ? '#ff9a5a' : undefined,
    flash: t >= REVEAL ? 1 - span(t, REVEAL, REVEAL + 0.25) : 0,
  })
}

/**
 * The reveal's spotlights: two beams from high on either side, crossing on him, and their pool at his feet. A flat
 * light over what they cross (one step of alpha, a brighter one at their edges), not a dither net.
 */
function spotlights(g: G, fx: number, fy: number, t: number) {
  if (t < REVEAL) return
  // Stepped alpha (eighths), like a wash: no smooth fade.
  const a = Math.round((0.16 + 0.16 * (1 - span(t, REVEAL + 0.05, REVEAL + 0.4))) * 8) / 8
  const prev = g.globalAlpha
  g.fillStyle = '#fff0c8'
  for (const sd of [-1, 1]) {
    const x0 = fx + sd * 64
    for (let y = 0; y < fy + 3; y++) {
      const q = y / (fy + 3)
      const cx = Math.round(lerp(x0, fx, q))
      const hw = Math.round(3 + q * 20)
      g.globalAlpha = a
      g.fillRect(cx - hw, y, hw * 2, 1)
      g.globalAlpha = Math.min(1, Math.round(a * 2.2 * 8) / 8)
      g.fillRect(cx - hw, y, 1, 1)
      g.fillRect(cx + hw - 1, y, 1, 1)
    }
  }
  g.globalAlpha = Math.round(a * 1.5 * 8) / 8
  ellipse(g, fx, fy + 3, 28, 5, '#fff0c8')
  g.globalAlpha = prev
}
