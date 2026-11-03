// The Tapus' raid entrances (docs/53): each island guardian at its Ruins. A stone gate in its island's light (Melemele's
// storm, Akala's dusk under the volcano, Ula'ula's desert at noon, Poni's misty night), two totems either side, a dais
// before the dark doorway. The totems' eyes open; a light falls from the sky onto the dais and is the guardian, arms
// spread, the two halves of its shell either side; the shell claps shut. From the closed shell its terrain spreads over
// the plaza, tile by tile: Electric, Psychic, Grassy, Misty. Then its own beat: Koko dashes round the ruins as
// lightning and is struck by a bolt from the storm; Lele lifts the ruins' stones into a slow orbit and its scales make
// a butterfly's wings; Bulu makes the desert's trees burst out of the sand and slams the ground; Fini draws the water
// up out of the mist into a sphere round itself. Light leaks from the shell's seam; it opens, and the guardian is there.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type ParticleShape,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { bush, hash2, palm, raysCanvas, revealLight, stars } from './alolaKit'
import {
  AFTER_REVEAL,
  dGradient,
  dissolve,
  inOrder,
  pulse,
  tri,
  wobble,
  type Cinema,
  type CinemaParams,
} from './kit'

const T_EYES = 0.5
const T_COME = 0.95
const T_LAND = 1.35
const T_CLOSE = 1.75
const T_SURGE = 2.0
const T_SIG = 2.88

type Terrain = 'electric' | 'psychic' | 'grassy' | 'misty'
type Aura = readonly [string, string, string, string]

interface Stone {
  lit: string
  mid: string
  dark: string
  ink: string
}

interface ShellLook {
  base: string
  dark: string
  light: string
  trim: string
  ink: string
  eye: string
  crest: 'comb' | 'puffs' | 'horns' | 'fins'
  crestC: readonly [string, string]
}

/** Where everything stands, from the screen's size and the guardian's sprite. */
export interface Lay {
  w: number
  h: number
  cx: number
  m: number
  /** The guardian's feet (hovering over the dais) and its body's centre (the shell's). */
  feet: number
  mid: number
  /** The plaza's back edge (the wall's foot), and the dais's front foot (where the terrain spreads from). */
  floor: number
  front: number
  gate: { x0: number; x1: number; top: number; pw: number }
  /** The dais's steps' half-widths, the top one first. */
  dais: number[]
  totems: number[]
  totemH: number
  sh: { w: number; h: number }
  sz: { w: number; h: number }
}

function layout(w: number, h: number, mon: string): Lay {
  const sz = spriteSize(mon)
  const cx = Math.round(w / 2)
  const feet = Math.round(h * 0.6)
  const floor = feet - 4
  const gw = Math.round(Math.min(w * 0.66, Math.max(sz.w + 10, 64)))
  const pw = Math.max(8, Math.round(gw * 0.13))
  const top = Math.round(Math.max(h * 0.25, floor - sz.h - 40))
  const shw = Math.round(Math.max(28, Math.min(48, sz.w * 0.58)))
  const shh = Math.round(Math.max(shw * 1.28, Math.min(66, sz.h * 0.8)))
  const d0 = Math.round(shw * 0.62 + 6)
  const off = Math.min(Math.round(gw / 2 + 16), Math.round(w / 2 - 7))
  return {
    w,
    h,
    cx,
    m: Math.min(w, h),
    feet,
    mid: feet - Math.round(sz.h * 0.52),
    floor,
    front: feet + 15,
    gate: { x0: cx - (gw >> 1), x1: cx - (gw >> 1) + gw, top, pw },
    dais: [d0, d0 + 7, d0 + 14],
    totems: [cx - off, cx + off],
    totemH: Math.round(Math.min(64, (floor - top) * 0.72)),
    sh: { w: shw, h: shh },
    sz,
  }
}

// ---------------------------------------------------------------- the ruin

/** The plaza in perspective: rows closer together far away, columns fanning out; `face` paints each tile. */
function plaza(L: Lay, face: (x: number, y: number, i: number, j: number) => string | null, grout: string) {
  const H = L.h - L.floor
  const n = 7
  const row = (y: number) => Math.floor(Math.pow(Math.max(0, y) / H, 1 / 1.7) * n)
  const col = (x: number, y: number) => {
    const s = lerp(9, 30, y / H)
    return Math.floor((x - L.cx + s / 2) / s)
  }
  return shade(L.w, H, (x, y) => {
    const i = row(y)
    const j = col(x, y)
    if (y === 0 || row(y - 1) !== i || col(x - 1, y) !== j) return grout
    return face(x, y, i, j)
  })
}

/** The bare stone plaza, darker towards the viewer (the gate's light is behind it). */
function stoneFloor(L: Lay, st: Stone, sand?: string) {
  const H = L.h - L.floor
  return plaza(
    L,
    (x, y, i, j) => {
      const v = hash2(i, j)
      const q = y / H
      // Ula'ula's plaza is half under the desert's sand.
      if (sand) {
        // Drifts across the tiles: long soft bands, rippled.
        const d = 0.5 + 0.25 * Math.sin(x / 23 + y / 7) + 0.25 * Math.sin(x / 11 - y / 13 + 1.3)
        if (d * 0.7 + q * 0.3 + bayer(x, y) * 0.25 > 0.78)
          return (x + Math.round(y * 2.5)) % 9 === 0 ? '#c8a868' : sand
      }
      const k = q * 1.6 + v * 0.7 + bayer(x, y) * 0.5
      if (v > 0.93 && (x + y) % 3 === 0) return st.ink
      return k < 0.7 ? st.lit : k < 1.5 ? st.mid : st.dark
    },
    st.ink,
  )
}

/** The plaza under the guardian's terrain. */
function terrainFloor(L: Lay, kind: Terrain, st: Stone, r: Rng) {
  const H = L.h - L.floor
  if (kind === 'electric')
    return plaza(
      L,
      (x, y, i, j) => {
        const k = (y / H) * 1.4 + hash2(i, j) * 0.6 + bayer(x, y) * 0.5
        return k < 0.6 ? '#5a5a28' : k < 1.3 ? '#3e3e1c' : '#262612'
      },
      '#ffe25a',
    )
  if (kind === 'psychic')
    return plaza(
      L,
      (x, y, i, j) => {
        const k = (y / H) * 1.4 + hash2(i, j) * 0.6 + bayer(x, y) * 0.5
        return k < 0.6 ? '#b04a9a' : k < 1.3 ? '#843a80' : '#5a2a5e'
      },
      '#ff9ad8',
    )
  if (kind === 'misty') {
    // The night's stone under a glittering pink veil, thicker far off and in drifting bands.
    const cv = plaza(
      L,
      (x, y, i, j) => {
        const q = y / H
        const band = 0.5 + 0.5 * Math.sin(x / 13 + y / 5 + Math.sin(x / 31) * 2)
        // Calm: a thin veil far off and on the bands' crests only, so it reads as mist and not as static.
        if (bayer(x, y) < Math.max(0, 0.45 - q) * 0.7 + Math.max(0, band - 0.72) * 1.4)
          return band > 0.8 ? '#f8d8f0' : '#e0c4ec'
        const k = q * 1.3 + hash2(i, j) * 0.5 + bayer(x, y) * 0.5
        return k < 0.6 ? '#a08ac0' : k < 1.3 ? '#7e6ca4' : '#5a4e84'
      },
      '#e0c0ec',
    )
    for (let i = 0; i < L.w * 0.3; i++) rect(cv.g, r.range(0, L.w), r.range(0, H), 1, 1, '#ffffff')
    return cv
  }
  // Grassy: the tiles gone under turf, its blades and flowers.
  const cv = plaza(
    L,
    (x, y, i, j) => {
      const k = (y / H) * 1.2 + hash2(x >> 1, y) * 0.8 + bayer(x, y) * 0.4
      if (hash2(i * 3, j * 7) > 0.8 && hash2(x, y) > 0.55) return st.mid
      return k < 0.55 ? '#7ad85a' : k < 1.0 ? '#4aa84a' : k < 1.5 ? '#2e7a3a' : '#1e5a2e'
    },
    '#1e5a2e',
  )
  const g = cv.g
  for (let i = 0; i < L.w * 1.4; i++) {
    const x = r.range(0, L.w)
    const y = r.range(2, H)
    const q = y / H
    const tall = Math.round(1 + q * 3)
    rect(g, x, y - tall, 1, tall, q < 0.4 ? '#a8f07a' : '#5ac85a')
  }
  for (let i = 0; i < L.w * 0.35; i++) {
    const x = r.range(0, L.w)
    const y = r.range(3, H)
    const c = r.pick(['#ff8ac8', '#fff3a0', '#ffffff', '#ffb04a'])
    rect(g, x - 1, y, 3, 1, c)
    rect(g, x, y - 1, 1, 3, c)
    rect(g, x, y, 1, 1, '#ffd23a')
  }
  return cv
}

/**
 * The gate, its crown, the broken walls each side, the totems, the doorway's dark: one canvas, drawn once. Moss on its
 * ledges and vines down its face where the island has grown over it.
 */
function ruin(g: G, L: Lay, st: Stone, r: Rng, sand: string | null, moss: readonly [string, string] | null) {
  const { gate, floor, cx } = L
  const wallH = Math.round((floor - gate.top) * 0.55)
  // The walls either side: broken into blocks of uneven height, gaps between them, fallen stones at their feet.
  for (const side of [-1, 1]) {
    let x = side < 0 ? gate.x0 : gate.x1
    let k = 0
    while (side < 0 ? x > -10 : x < L.w + 10) {
      const bw = r.int(12, 26)
      const bh = Math.round(wallH * (k === 0 ? 0.95 : r.range(0.35, 0.85)) * (1 - k * 0.08))
      const x0 = side < 0 ? x - bw : x
      if (r() < 0.82 || k === 0) {
        rect(g, x0, floor - bh, bw, bh, st.dark)
        rect(g, x0, floor - bh, bw, 1, st.lit)
        rect(g, side < 0 ? x0 : x0 + bw - 1, floor - bh, 1, bh, st.ink)
        for (let y = floor - bh + 5; y < floor; y += 5) {
          rect(g, x0, y, bw, 1, st.ink)
          for (let xx = x0 + ((y / 5) % 2) * 4 + 2; xx < x0 + bw; xx += 8) rect(g, xx, y - 4, 1, 4, st.ink)
        }
        // A missing corner: the top broken off in steps.
        const nb = r.int(1, 3)
        for (let i = 0; i < nb; i++)
          g.clearRect(side < 0 ? x0 : x0 + bw - 4 - i * 3, floor - bh, 4 + i * 3, 3 + i * 2)
        if (moss) {
          for (let xx = x0; xx < x0 + bw; xx++)
            if (hash2(xx, bh) > 0.35)
              rect(g, xx, floor - bh - (hash2(xx, 1) > 0.7 ? 1 : 0), 1, 2, moss[hash2(xx, 2) > 0.5 ? 0 : 1])
        }
      }
      ellipse(g, x0 + bw * r(), floor - 1, r.int(2, 4), 2, st.mid)
      x += side * (bw + (r() < 0.3 ? r.int(3, 10) : 0))
      k++
    }
  }
  // The gate's body, then the doorway cut into it with a corbelled top (each course stepping in).
  rect(g, gate.x0, gate.top, gate.x1 - gate.x0, floor - gate.top, st.mid)
  const ix0 = gate.x0 + gate.pw
  const ix1 = gate.x1 - gate.pw
  const steps = 4
  const doorTop = gate.top + steps * 4
  g.drawImage(dGradient(ix1 - ix0, floor - doorTop, ['#030207', '#06050c', '#0e0c16']), ix0, doorTop)
  for (let k = 0; k < steps; k++) {
    const inset = (steps - k) * 3
    rect(g, ix0 + inset, gate.top + k * 4, ix1 - ix0 - inset * 2, 4, '#030207')
    rect(g, ix0 + inset - 1, gate.top + k * 4, 1, 4, st.ink)
    rect(g, ix1 - inset, gate.top + k * 4, 1, 4, st.ink)
    rect(g, ix0 + inset - 3, gate.top + k * 4 + 3, 3, 1, st.lit)
    rect(g, ix1 - inset, gate.top + k * 4 + 3, 3, 1, st.dark)
  }
  // The pillars' courses: big blocks, lit on their left, a carved zigzag down each.
  for (const x of [gate.x0, ix1]) {
    rect(g, x, gate.top, 1, floor - gate.top, st.lit)
    rect(g, x + gate.pw - 1, gate.top, 1, floor - gate.top, st.ink)
    for (let y = gate.top + 9; y < floor; y += 9) {
      rect(g, x, y, gate.pw, 1, st.ink)
      rect(g, x + 1, y + 1, gate.pw - 2, 1, st.lit)
    }
    for (let y = gate.top + 4; y < floor - 3; y += 2)
      rect(g, x + (gate.pw >> 1) - 1 + ((y >> 2) % 2 ? 1 : -1), y, 1, 2, st.dark)
  }
  // The lintel and the stepped crown over it, a carved band; the guardian's mark in the gable (lit live).
  const lt = gate.top - 9
  rect(g, gate.x0 - 5, lt, gate.x1 - gate.x0 + 10, 9, st.mid)
  rect(g, gate.x0 - 5, lt, gate.x1 - gate.x0 + 10, 1, st.lit)
  rect(g, gate.x0 - 5, lt + 8, gate.x1 - gate.x0 + 10, 1, st.ink)
  for (let x = gate.x0 - 3; x < gate.x1 + 3; x += 4) tri(g, x, lt + 6, x + 2, lt + 3, x + 4, lt + 6, st.dark)
  for (let k = 0; k < 3; k++) {
    const half = Math.round((gate.x1 - gate.x0) / 2 - 4 - k * 8)
    const y = lt - 5 * (k + 1)
    if (half < 6) break
    rect(g, cx - half, y, half * 2, 5, k % 2 ? st.dark : st.mid)
    rect(g, cx - half, y, half * 2, 1, st.lit)
    rect(g, cx - half, y + 4, half * 2, 1, st.ink)
  }
  const gy = lt - 15
  tri(g, cx - 14, gy + 1, cx + 14, gy + 1, cx, gy - 12, st.mid)
  tri(g, cx - 14, gy + 1, cx, gy - 12, cx, gy + 1, st.lit)
  ellipse(g, cx, gy - 3, 4, 4, st.ink)
  if (moss) {
    // Moss along the ledges, vines hanging down the gate's face.
    for (const [x0, x1, y] of [
      [gate.x0 - 5, gate.x1 + 5, lt],
      [cx - 30, cx + 30, lt - 5],
    ] as const)
      for (let x = x0; x < x1; x++)
        if (hash2(x, y) > 0.3)
          rect(g, x, y - (hash2(x, 9) > 0.75 ? 1 : 0), 1, 2, (x >> 1) % 2 ? moss[0] : moss[1])
    for (let i = 0; i < 5; i++) {
      const x = Math.round(r.range(gate.x0 - 3, gate.x1 + 3))
      if (x > ix0 + 6 && x < ix1 - 6) continue
      const len = r.int(10, Math.max(12, Math.round((floor - lt) * 0.6)))
      for (let y = 0; y < len; y++) {
        const xx = x + Math.round(Math.sin(y / 5 + i) * 1.5)
        rect(g, xx, lt + 2 + y, 1, 1, moss[0])
        if (y % 4 === 1) rect(g, xx + (y % 8 === 1 ? 1 : -2), lt + 2 + y, 2, 1, moss[1])
      }
    }
  }
  // The totems: stacked faces, a pointed head; their eyes are lit live.
  for (const x of L.totems) {
    const th = L.totemH
    const tw = 12
    const x0 = x - tw / 2
    rect(g, x0, floor - th, tw, th, st.mid)
    rect(g, x0, floor - th, 1, th, st.lit)
    rect(g, x0 + tw - 1, floor - th, 1, th, st.ink)
    tri(g, x0 - 2, floor - th, x0 + tw + 2, floor - th, x, floor - th - 9, st.dark)
    tri(g, x0 - 2, floor - th, x, floor - th - 9, x, floor - th, st.lit)
    for (let f = 0; f * 20 < th - 6; f++) {
      const y = floor - th + 4 + f * 20
      rect(g, x0 - 1, y, tw + 2, 2, st.dark)
      rect(g, x0 + 2, y + 4, 3, 3, st.ink)
      rect(g, x0 + tw - 5, y + 4, 3, 3, st.ink)
      rect(g, x0 + 3, y + 10, tw - 6, 2, st.ink)
      rect(g, x0 + 4, y + 12, 1, 3, st.ink)
      rect(g, x0 + tw - 5, y + 12, 1, 3, st.ink)
    }
    if (sand) tri(g, x0 - 7, floor + 1, x0 + tw + 7, floor + 1, x + 3, floor - 6, sand)
    else if (moss)
      for (let xx = x0 - 2; xx < x0 + tw + 2; xx++)
        rect(g, xx, floor - 1 - (hash2(xx, 5) > 0.5 ? 1 : 0), 1, 2, moss[0])
  }
  if (sand)
    for (const x of [gate.x0, ix1])
      tri(g, x - 8, floor + 1, x + gate.pw + 8, floor + 1, x + 5, floor - 9, sand)
}

/** The dais: three stone steps before the doorway, the guardian's place. */
function dais(L: Lay, st: Stone): Canvas {
  const cv = canvas(L.w, L.h)
  const g = cv.g
  const top = L.feet + 1
  L.dais.forEach((hw, k) => {
    const y = top + k * 4
    const lo = k === L.dais.length - 1 ? L.front - y : 4
    rect(g, L.cx - hw, y, hw * 2, lo, st.mid)
    rect(g, L.cx - hw, y, hw * 2, 1, st.lit)
    rect(g, L.cx - hw, y + 1, 1, lo - 1, st.lit)
    rect(g, L.cx + hw - 1, y + 1, 1, lo - 1, st.ink)
    rect(g, L.cx - hw, y + lo - 1, hw * 2, 1, st.dark)
  })
  rect(g, L.cx - L.dais[2]! - 1, L.front, L.dais[2]! * 2 + 2, 1, st.ink)
  return cv
}

/**
 * The closed shell, drawn once: a shield-shaped mask, its seam down the middle, two slanted eye sockets, the tribal
 * bands in the guardian's trim, its crest (Koko's comb, Lele's puffs, Bulu's horns, Fini's fins). Cut in two halves
 * that open like arms.
 */
function shellArt(k: ShellLook, W: number, H: number) {
  const PAD = 14
  const TOP = 17
  const CW = W + PAD * 2
  const CH = H + TOP + 3
  const full = canvas(CW, CH)
  const g = full.g
  const c = PAD + W / 2
  const [ca, cb] = k.crestC
  if (k.crest === 'comb')
    for (const [dx, hh] of [
      [-8, 10],
      [0, 16],
      [8, 10],
    ] as const) {
      tri(g, c + dx - 5, TOP + 5, c + dx + 5, TOP + 5, c + dx + dx * 0.3, TOP + 5 - hh, ca)
      line(g, c + dx - 3, TOP + 3, c + dx + dx * 0.3, TOP + 6 - hh, cb)
    }
  else if (k.crest === 'puffs')
    for (const side of [-1, 1]) {
      ellipse(g, c + side * W * 0.27, TOP + 2, 8, 7, ca)
      ellipse(g, c + side * W * 0.27 - 2, TOP, 4, 3, cb)
      ellipse(g, c + side * W * 0.1, TOP - 2, 3, 3, ca)
    }
  else if (k.crest === 'horns')
    for (const side of [-1, 1]) {
      let px = c + side * W * 0.28
      let py = TOP + H * 0.14
      for (let i = 1; i <= 8; i++) {
        const q = i / 8
        const nx = c + side * (W * 0.28 + q * (PAD + 4))
        const ny = TOP + H * 0.14 - Math.sin(q * 2.2) * 16 + q * q * 2
        line(g, px, py, nx, ny, i > 6 ? cb : ca, i < 4 ? 5 : i < 7 ? 3 : 2)
        px = nx
        py = ny
      }
    }
  else
    for (let i = -2; i <= 2; i++) {
      tri(g, c + i * 5 - 3, TOP + 5, c + i * 5 + 3, TOP + 5, c + i * 8, TOP - 9 + Math.abs(i) * 3, ca)
      line(g, c + i * 5, TOP + 3, c + i * 8, TOP - 8 + Math.abs(i) * 3, cb)
      if (Math.abs(i) === 2)
        tri(g, c + i * 9, TOP + H * 0.62, c + i * 6, TOP + H * 0.8, c + i * 12, TOP + H, ca)
    }
  const body = shade(CW, CH, (x, y) => {
    const u = (x - c + 0.5) / (W / 2)
    const v = (y - TOP - H / 2 + 0.5) / (H / 2)
    const e = Math.abs(u) ** 2.2 + (v < 0 ? Math.abs(v) ** 2.4 : Math.abs(v) ** 1.7)
    if (e > 1) return null
    if (e > 0.86) return k.ink
    const sx = x - Math.round(c)
    if (sx === -1 || sx === 0) return k.ink
    const au = Math.abs(u)
    const eu = au - 0.42
    const ev = v + 0.12 + eu * 0.55
    if ((eu / 0.21) ** 2 + (ev / 0.1) ** 2 < 1) return k.ink
    if (Math.abs(v - (0.3 + 0.5 * au)) < 0.075) return k.trim
    if (Math.abs(v - (-0.5 + 0.35 * au * au)) < 0.065) return k.trim
    if (au < 0.12 && v > 0.55 && v < 0.75) return k.trim
    if (e > 0.66) return k.dark
    if (u < -0.25 && v < 0.2 && bayer(x, y) < (e < 0.45 ? 0.7 : 0.35)) return k.light
    if (u > 0.55 && v > 0.1 && bayer(x, y) < 0.4) return k.dark
    return k.base
  })
  g.drawImage(body, 0, 0)
  const half = Math.round(c)
  const l = canvas(half, CH)
  l.g.drawImage(full, 0, 0)
  const r = canvas(CW - half, CH)
  r.g.drawImage(full, -half, 0)
  return {
    full,
    l,
    r,
    /** The body's centre in the canvas. */
    ox: half,
    oy: TOP + Math.round(H / 2),
    eyes: [-1, 1].map((s) => [Math.round(s * 0.42 * (W / 2)), Math.round(-0.12 * (H / 2) - 1)] as const),
  }
}
type ShellArt = ReturnType<typeof shellArt>

// ---------------------------------------------------------------- the signatures

/** A guardian's own beat, between its terrain spreading and its shell opening; it keeps its own state. */
interface Sig {
  setup(r: Rng): void
  step(t: number, dt: number, fx: Particles, r: Rng): void
  /** The shell's shift from its rest. */
  shell?(t: number): { dx: number; dy: number }
  /** Afterimages of the shell: shift and strength. */
  echoes?(t: number): [number, number, number][]
  /** The background warping (px). */
  warp?(t: number): number
  back?(g: G, t: number, sh: { x: number; y: number }): void
  front?(g: G, t: number, sh: { x: number; y: number }): void
  flashes?(g: G, t: number): void
  /** Over its own flash (a bolt must not vanish under the white it makes). */
  over?(g: G, t: number, sh: { x: number; y: number }): void
  shakes?: [number, number, number][]
}

interface Spec {
  id: string
  seed: number
  reveal: number
  aura: Aura
  sky: readonly string[]
  stone: Stone
  shell: ShellLook
  terrain: Terrain
  /** The terrain's light (its front, its glow on the dais). */
  tc: readonly [string, string]
  sand?: string
  /** Moss and vines on the stone. */
  moss?: readonly [string, string]
  /** The wind before it comes: leaves, sand or mist blown across. */
  gust: { shape: ParticleShape; colors: string[]; light?: string; dark?: string }
  place(g: G, L: Lay, r: Rng): void
  sides(g: G, L: Lay, r: Rng): void
  skyLive?(g: G, t: number, L: Lay): void
  sig(L: Lay, many: number, reveal: number): Sig
  cry(): void
  sounds: readonly (readonly [number, () => void])[]
}

type S = {
  r: Rng
  fx: Particles
  sky: Canvas
  ruin: Canvas
  dais: Canvas
  stone: Canvas
  terr: Canvas
  shell: ShellArt
  rays: Canvas
  shakes: [number, number, number][]
}

function tapuCinema(spec: Spec): Cinema {
  const REVEAL = spec.reveal
  const DUR = REVEAL + AFTER_REVEAL
  const T_CRACK = REVEAL - 0.45
  const A = spec.aura
  return {
    reveal: REVEAL,
    dur: DUR,
    make(p: CinemaParams): Timeline<S> {
      const w = p.w ?? 240
      const h = p.h ?? 160
      const L = layout(w, h, p.mon)
      const { cx } = L
      const many = p.short ? 0.4 : 1
      const quiet = (f: () => void) => () => void (!skippingNow() && f())
      const sig = spec.sig(L, many, REVEAL)
      const squash = 0.32
      const rMax = Math.hypot(w / 2 + 4, Math.max(h - L.front, L.front - L.floor) / squash) + 6
      const spreadR = (t: number) => rMax * ease.outC(span(t, T_SURGE, T_SURGE + 1.15))
      const shellAt = (t: number) => {
        const d = sig.shell?.(t) ?? { dx: 0, dy: 0 }
        return { x: cx + Math.round(d.dx), y: L.mid + Math.round(d.dy + Math.sin(t * 2.4) * 1.5) }
      }
      return {
        id: `cinema-${spec.id}`,
        dur: DUR,
        setup() {
          const r = rng(spec.seed)
          sig.setup(r)
          const sky = dGradient(w, L.floor + 2, spec.sky)
          spec.place(sky.g, L, r)
          const ruinC = canvas(w, h)
          spec.sides(ruinC.g, L, r)
          ruin(ruinC.g, L, spec.stone, r, spec.sand ?? null, spec.moss ?? null)
          return {
            r,
            fx: new Particles(),
            sky,
            ruin: ruinC,
            dais: dais(L, spec.stone),
            stone: stoneFloor(L, spec.stone, spec.sand),
            terr: terrainFloor(L, spec.terrain, spec.stone, r),
            shell: shellArt(spec.shell, L.sh.w, L.sh.h),
            rays: raysCanvas(w, h),
            shakes: p.short ? [] : [[T_CLOSE + 0.12, 0.25, 2], ...(sig.shakes ?? []), [REVEAL, 0.6, 3]],
          }
        },
        step(s, t, dt) {
          const r = s.r
          s.fx.update(dt)
          // The wind before it comes.
          if (t > T_EYES && t < T_LAND + 0.3 && r() < 0.5 * many)
            s.fx.add({
              x: -4,
              y: r.range(h * 0.15, h * 0.9),
              vx: r.range(90, 160),
              vy: r.range(-15, 15),
              life: 2,
              size: r.int(1, 2),
              shape: spec.gust.shape,
              spin: r.range(-6, 6),
              colors: spec.gust.colors,
              light: spec.gust.light,
              dark: spec.gust.dark,
            })
          // The light falling: its trail.
          if (t > T_COME && t < T_LAND) {
            const q = ease.inQ(span(t, T_COME, T_LAND))
            for (let i = 0; i < 2; i++)
              s.fx.add({
                x: cx + r.range(-3, 3),
                y: lerp(-16, L.mid, q),
                vx: r.range(-12, 12),
                vy: r.range(-30, -5),
                life: r.range(0.3, 0.6),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'star' : 'px',
                colors: [A[0], A[1], A[2]],
              })
          }
          if (within(t, T_LAND, T_LAND + dt) || within(t, T_CLOSE + 0.12, T_CLOSE + 0.12 + dt))
            for (let i = 0; i < 26 * many; i++) {
              const a = r() * Math.PI * 2
              const v = r.range(40, 110)
              s.fx.add({
                x: cx,
                y: L.mid,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v * 0.7,
                drag: 3,
                life: r.range(0.4, 0.8),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'star' : 'sq',
                colors: [A[0], A[1], A[2]],
              })
            }
          // The terrain alive under it.
          const R = spreadR(t)
          if (R > 4 && r() < 0.8 * many) {
            const a = r() * Math.PI * 2
            const d = Math.sqrt(r()) * R
            const x = cx + Math.cos(a) * d
            const y = L.front + Math.sin(a) * d * squash
            if (x > -2 && x < w + 2 && y > L.floor && y < h) terrainMote(s.fx, spec.terrain, x, y, r)
          }
          // Light leaking from the seam before it opens.
          if (t > T_CRACK && t < REVEAL && r() < 0.7 * many) {
            const sh = shellAt(t)
            s.fx.add({
              x: sh.x + r.range(-1, 1),
              y: sh.y + r.range(-L.sh.h * 0.4, L.sh.h * 0.4),
              vx: r() < 0.5 ? -r.range(20, 60) : r.range(20, 60),
              vy: r.range(-10, 10),
              drag: 2,
              life: 0.4,
              size: 1,
              shape: 'px',
              colors: [A[0], A[1]],
            })
          }
          if (within(t, REVEAL, REVEAL + dt))
            for (let k = 0; k < 50 * many; k++) {
              const a = r() * Math.PI * 2
              const v = r.range(60, 180)
              s.fx.add({
                x: cx,
                y: L.mid,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v * 0.7,
                drag: 2.5,
                life: r.range(0.5, 1.1),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'star' : 'sq',
                colors: [...A],
              })
            }
          sig.step(t, dt, s.fx, r)
        },
        draw(g, s, t) {
          const sh = screenShake(t, s.shakes)
          g.fillStyle = '#000000'
          g.fillRect(0, 0, w, h)
          g.save()
          g.translate(sh.x, sh.y)
          const warp = sig.warp?.(t) ?? 0
          // A warp shifts rows sideways: the still picture under it fills the gaps they leave.
          g.drawImage(s.sky, 0, 0)
          if (warp > 0) wobble(g, s.sky, w, 0, s.sky.height, t, warp, 11, 4)
          spec.skyLive?.(g, t, L)
          if (warp > 0) wobble(g, s.ruin, w, 0, L.floor + 1, t, warp, 11, 4)
          else g.drawImage(s.ruin, 0, 0, w, L.floor + 1, 0, 0, w, L.floor + 1)
          g.drawImage(s.stone, 0, L.floor)
          // The guardian's coming dims its island a little: its own light takes over.
          const dim = 0.3 * span(t, T_EYES, T_LAND) * (1 - 0.6 * span(t, T_SURGE, T_SURGE + 1))
          wash(g, '#04030a', dim, 8)
          drawTotemEyes(g, t, L, A)
          drawMark(g, t, L, A)
          // The terrain spreading, its front a line of light.
          const R = spreadR(t)
          if (R > 0) spread(g, L, s.terr, R, squash, spec.tc[0], t < T_SURGE + 1.15)
          if (R > 0) terrainLive(g, spec.terrain, t, L, R, squash, spec.tc)
          // The dais, and the terrain's light on it.
          g.drawImage(s.dais, 0, 0)
          if (R > 0) {
            const k = span(t, T_SURGE, T_SURGE + 0.4)
            for (const hw of L.dais) {
              const y = L.feet + 1 + L.dais.indexOf(hw) * 4
              if (k > 0.5) rect(g, cx - hw, y, hw * 2, 1, spec.tc[1])
            }
          }
          const sp = shellAt(t)
          // The guardian's own glow behind it.
          if (t > T_LAND) {
            const gr = Math.round(L.m * 0.36)
            const pk = t < REVEAL ? 0.35 + 0.15 * pulse(t, T_CRACK, REVEAL) : 0.42
            g.drawImage(glow(gr, A[3], 1.3, pk), sp.x - gr, sp.y - gr)
          }
          sig.back?.(g, t, sp)
          drawGuardian(g, s, t, sp)
          s.fx.draw(g)
          sig.front?.(g, t, sp)
          revealLight(g, s.rays, t, REVEAL, { x: cx, y: L.mid }, A, Math.max(w, h) * 0.75)
          g.restore()
          sig.flashes?.(g, t)
          if (sig.over) {
            g.save()
            g.translate(sh.x, sh.y)
            sig.over(g, t, sp)
            g.restore()
          }
          if (within(t, T_CLOSE + 0.12, T_CLOSE + 0.24))
            screenFlash(g, A[1], 0.35 * (1 - span(t, T_CLOSE + 0.12, T_CLOSE + 0.24)))
          if (within(t, REVEAL, REVEAL + 0.35))
            screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
          if (t < 0.45) wash(g, '#000000', 1 - span(t, 0, 0.45), 8)
        },
        cues: () =>
          inOrder([
            [0.05, quiet(() => hiss(1.4, { freq: 600, type: 'lowpass', vol: 0.04 }))],
            [T_EYES, quiet(() => tone(110, 1.2, { type: 'sine', vol: 0.06, slide: 30 }))],
            [T_EYES + 0.2, quiet(() => tone(165, 1, { type: 'sine', vol: 0.04 }))],
            [T_COME, quiet(spec.cry)],
            [T_COME + 0.1, quiet(() => hiss(0.4, { freq: 800, slide: 2400, vol: 0.05 }))],
            [T_LAND, quiet(() => fxSound('legend.pulse'))],
            [
              T_CLOSE + 0.12,
              quiet(() => {
                hiss(0.12, { freq: 900, vol: 0.12 })
                tone(220, 0.2, { type: 'square', vol: 0.05, slide: -80 })
              }),
            ],
            [T_SURGE, quiet(() => hiss(1.1, { freq: 300, slide: 1800, vol: 0.06 }))],
            [T_SURGE + 0.05, quiet(() => tone(330, 0.9, { type: 'triangle', vol: 0.03, slide: 330 }))],
            ...spec.sounds.map(([at, f]) => [at, quiet(f)] as const),
            [T_CRACK, quiet(() => fxSound('legend.heart'))],
            [T_CRACK + 0.2, quiet(() => fxSound('legend.heart'))],
            [T_CRACK + 0.05, quiet(() => tone(880, 0.4, { type: 'sine', vol: 0.03, slide: 880 }))],
            [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          ] satisfies Cue<S>[]),
      }

      /** The falling light, the guardian between its shell's halves, the shell shut, cracking, opening. */
      function drawGuardian(g: G, s: S, t: number, sp: { x: number; y: number }) {
        const art = s.shell
        if (t > T_COME && t < T_LAND) {
          const y = Math.round(lerp(-16, L.mid, ease.inQ(span(t, T_COME, T_LAND))))
          g.drawImage(glow(14, A[1], 1.4, 0.8), cx - 14, y - 14)
          ellipse(g, cx, y, 3, 3, A[0])
          return
        }
        if (t < T_LAND) return
        for (const [dx, dy, k] of sig.echoes?.(t) ?? [])
          dissolve(g, art.full, k, sp.x - art.ox + Math.round(dx), sp.y - art.oy + Math.round(dy))
        const feetY = sp.y + (L.feet - L.mid)
        if (t < T_CLOSE + 0.12) {
          // Arms spread: its silhouette. Then its arms fold in as the two halves of its shell and clap shut.
          const q = span(t, T_CLOSE - 0.1, T_CLOSE + 0.12)
          if (q < 0.55)
            drawSprite(g, p.mon, sp.x, feetY, {
              sil: '#0a0812',
              outline: Math.floor(t * 12) % 3 ? A[1] : A[2],
              wave: { amp: 1, len: 9, phase: t * 20 },
            })
          if (q > 0)
            halves(
              g,
              art,
              sp.x,
              sp.y,
              Math.round((1 - ease.inQ(q)) * Math.max(4, L.sz.w / 2 - L.sh.w / 4)),
              Math.min(1, q * 2.5),
            )
          return
        }
        if (t < REVEAL) {
          const shake = t > T_CRACK ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
          halves(g, art, sp.x + shake, sp.y, 0, 1)
          drawEyes(g, art, sp.x + shake, sp.y, t)
          if (t > T_CRACK) {
            // The seam opening: a line of light down the middle, wider and brighter.
            const q = span(t, T_CRACK, REVEAL)
            const hh = Math.round(L.sh.h * (0.3 + 0.2 * q))
            rect(g, sp.x + shake - 1, sp.y - hh, 2, hh * 2, Math.floor(t * 20) % 2 ? A[0] : A[1])
            const wd = Math.round(q * 18)
            if (wd > 1)
              for (const side of [-1, 1])
                tri(
                  g,
                  sp.x + shake,
                  sp.y - hh * 0.6,
                  sp.x + shake + side * wd * 2,
                  sp.y - hh - wd,
                  sp.x + shake + side * wd * 2,
                  sp.y + hh * 0.2,
                  pattern(g, A[1], 4 + q * 6),
                )
          }
          return
        }
        // Open: the halves fly apart and fade; the guardian is there.
        const q = span(t, REVEAL, REVEAL + 0.3)
        if (q < 1) halves(g, art, cx, L.mid, Math.round(ease.outC(q) * L.sh.w * 1.1), 1 - q)
        const bob = Math.round(Math.sin((t - REVEAL) * 2.2) * 1.5)
        drawSprite(g, p.mon, cx, L.feet - 1 + bob, {
          flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
          outline: Math.floor(t * 8) % 2 ? A[1] : A[2],
        })
      }
    },
  }
}

function halves(g: G, art: ShellArt, x: number, y: number, off: number, k: number) {
  dissolve(g, art.l, k, x - art.ox - off, y - art.oy)
  dissolve(g, art.r, k, x + off, y - art.oy)
}

function drawEyes(g: G, art: ShellArt, x: number, y: number, t: number) {
  const on = t < T_CLOSE + 0.3 ? span(t, T_CLOSE + 0.12, T_CLOSE + 0.3) : 1
  if (on <= 0) return
  for (const [ex, ey] of art.eyes) {
    const c = Math.floor(t * 6) % 5 ? '#ffffff' : '#fff3a0'
    rect(g, x + ex - 2, y + ey, 4, 2, c)
    rect(g, x + ex - (ex < 0 ? 3 : -2), y + ey - 1, 2, 1, c)
  }
}

/** The totems' eyes opening, one then the other, in the guardian's light. */
function drawTotemEyes(g: G, t: number, L: Lay, A: Aura) {
  L.totems.forEach((x, i) => {
    const k = span(t, T_EYES + i * 0.2, T_EYES + i * 0.2 + 0.15)
    if (k <= 0) return
    const x0 = x - 6
    for (let f = 0; f * 20 < L.totemH - 6; f++) {
      const y = L.floor - L.totemH + 4 + f * 20
      const c = Math.floor(t * 5 + f) % 4 ? A[1] : A[0]
      rect(g, x0 + 2, y + 5, 3, 1, c)
      rect(g, x0 + 12 - 5, y + 5, 3, 1, c)
      if (f === 0) g.drawImage(glow(10, A[2], 1.5, 0.45 * k), x - 10, y + 5 - 10)
    }
  })
}

/** The guardian's mark in the gable, lit when it lands. */
function drawMark(g: G, t: number, L: Lay, A: Aura) {
  const k = span(t, T_LAND, T_LAND + 0.3)
  if (k <= 0) return
  const y = L.gate.top - 9 - 15 - 3
  g.drawImage(glow(9, A[2], 1.4, 0.6 * k), L.cx - 9, y - 9)
  rect(g, L.cx - 2, y - 2, 4, 4, A[1])
  rect(g, L.cx - 1, y - 1, 2, 2, A[0])
}

/** The terrain over the stone: row by row inside a growing ellipse round the dais, its front lit. */
function spread(g: G, L: Lay, src: Canvas, R: number, squash: number, edge: string, front: boolean) {
  const ry = R * squash
  const cy = L.front - L.floor
  for (let y = 0; y < src.height; y++) {
    const dy = (y - cy) / ry
    if (Math.abs(dy) >= 1) continue
    const hw = Math.round(R * Math.sqrt(1 - dy * dy))
    const x0 = Math.max(0, L.cx - hw)
    const x1 = Math.min(L.w, L.cx + hw)
    if (x1 > x0) g.drawImage(src, x0, y, x1 - x0, 1, x0, L.floor + y, x1 - x0, 1)
    if (front) {
      rect(g, L.cx - hw - 1, L.floor + y, 2, 1, edge)
      rect(g, L.cx + hw - 1, L.floor + y, 2, 1, edge)
    }
  }
  if (front && ry > 1)
    ellipseLine(g, L.cx, L.front, Math.round(R), Math.round(ry), edge, Math.PI, Math.PI * 2)
}

/** The terrain's own life on the floor: electric pulses, psychic ripples, mist drifting. */
function terrainLive(
  g: G,
  kind: Terrain,
  t: number,
  L: Lay,
  R: number,
  squash: number,
  tc: readonly string[],
) {
  if (kind === 'electric' || kind === 'psychic') {
    const every = kind === 'electric' ? 0.5 : 0.6
    for (let k = 0; k < 3; k++) {
      const q = (((t - T_SURGE) / every + k / 3) % 1) * (kind === 'electric' ? 1 : 1)
      const rr = Math.round(q * Math.min(R, L.w * 0.9))
      if (rr < 4) continue
      const c = kind === 'electric' ? (k % 2 ? tc[0]! : '#ffffff') : k % 2 ? tc[0]! : tc[1]!
      // A ring every other pixel: a pulse of light on the tiles, not a line drawn over them.
      const ry = Math.max(1, Math.round(rr * squash))
      for (let a = 0; a < Math.PI * 2; a += 2 / Math.max(rr, 1)) {
        const x = Math.round(L.cx + Math.cos(a) * rr)
        const y = Math.round(L.front + Math.sin(a) * ry)
        if (y > L.floor && (x + y) % 2 === 0) rect(g, x, y, 1, 1, c)
      }
    }
  }
  if (kind === 'electric') {
    // Little arcs jumping between the tiles, somewhere new every few frames.
    const r = rng(Math.floor(t * 20) + 1)
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * Math.min(R, L.w)
      const x = L.cx + Math.cos(a) * d
      const y = L.front + Math.sin(a) * d * squash
      if (y < L.floor + 2) continue
      polyline(g, bolt(r, x, y, x + r.range(-14, 14), y + r.range(-4, 4), 0.5, 2), k ? tc[0]! : '#ffffff')
    }
  }
  if (kind === 'misty') {
    // Mist drifting over the plaza in soft dithered banks.
    for (let k = 0; k < 6; k++) {
      const y = L.floor + 4 + ((k * 37) % Math.max(1, L.h - L.floor - 6))
      const x = ((k * 71 + t * (8 + k * 3)) % (L.w + 80)) - 40
      const rx = 22 + (k % 3) * 8
      if (Math.abs(x - L.cx) / R > 1.1) continue
      ellipse(g, x, y, rx, 4 + (k % 2) * 2, pattern(g, k % 2 ? '#ffe8f8' : '#f0d8ff', 4))
    }
  }
}

/** One mote of the terrain rising off the floor. */
function terrainMote(fx: Particles, kind: Terrain, x: number, y: number, r: Rng) {
  if (kind === 'electric')
    return fx.add({
      x,
      y,
      vx: r.range(-40, 40),
      vy: -r.range(10, 60),
      ay: 120,
      life: r.range(0.15, 0.35),
      size: 1,
      shape: r() < 0.5 ? 'streak' : 'px',
      trail: 0.05,
      colors: ['#ffffff', '#fff3a0', '#ffd23a'],
    })
  if (kind === 'psychic')
    return fx.add({
      x,
      y,
      vx: r.range(-6, 6),
      vy: -r.range(8, 24),
      life: r.range(0.8, 1.4),
      size: r.int(1, 2),
      shape: r() < 0.3 ? 'ring' : 'px',
      colors: ['#ffd0f0', '#ff8ad0', '#c050a0'],
    })
  if (kind === 'grassy')
    return fx.add({
      x,
      y,
      vx: r.range(-12, 12),
      vy: -r.range(6, 20),
      life: r.range(0.8, 1.4),
      size: 1,
      shape: r() < 0.4 ? 'leaf' : 'px',
      spin: r.range(-4, 4),
      colors: r() < 0.7 ? ['#c8f58a', '#7ad85a', '#3a9a4a'] : ['#ffd0f0', '#ff8ac8'],
    })
  return fx.add({
    x,
    y,
    vx: r.range(-5, 5),
    vy: -r.range(4, 14),
    life: r.range(0.8, 1.6),
    size: r.int(1, 2),
    shape: r() < 0.4 ? 'star' : 'px',
    colors: ['#ffffff', '#ffe0f4', '#e0c8f0'],
  })
}

// ---------------------------------------------------------------- Koko: lightning

function kokoSig(L: Lay, many: number, reveal: number): Sig {
  const T0 = T_SIG
  const STEP = 0.17
  const MOVE = 0.045
  const T_BOLT = 3.92
  const stops: [number, number][] = [
    [L.w * 0.8, L.mid - L.h * 0.12],
    [L.w * 0.18, L.mid - L.h * 0.03],
    [L.w * 0.78, L.mid + L.h * 0.06],
    [L.w * 0.22, L.mid - L.h * 0.17],
    [L.cx, L.mid],
  ]
  const at = (i: number): [number, number] => (i < 0 ? [L.cx, L.mid] : stops[i]!)
  const pos = (t: number): [number, number] => {
    if (t < T0) return [0, 0]
    const k = (t - T0) / STEP
    const i = Math.floor(k)
    if (i >= stops.length) return [0, 0]
    const f = ease.inQ(span((k - i) * STEP, 0, MOVE))
    const a = at(i - 1)
    const b = at(i)
    return [lerp(a[0], b[0], f) - L.cx, lerp(a[1], b[1], f) - L.mid]
  }
  let trails: [number, number][][] = []
  let big: [number, number][] = []
  let forks: [number, number][][] = []
  let arcs: [number, number][][] = []
  return {
    setup(r) {
      trails = stops.map((b, i) => bolt(r, ...at(i - 1), ...b, 0.22, 4))
      big = bolt(r, L.cx + L.w * 0.1, -8, L.cx, L.mid - L.sh.h * 0.4, 0.28, 5)
      forks = [0.3, 0.5, 0.65].map((q) => {
        const p = big[Math.round(q * (big.length - 1))]!
        return bolt(r, p[0], p[1], p[0] + r.range(-40, 40), p[1] + r.range(15, 40), 0.35, 3)
      })
      arcs = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        const rr = L.sh.w * 0.6
        return bolt(r, 0, 0, Math.cos(a) * rr, Math.sin(a) * rr * 1.2, 0.5, 3)
      })
    },
    step(t, dt, fx, r) {
      for (let i = 0; i < stops.length; i++) {
        const arrive = T0 + i * STEP + MOVE
        if (within(t, arrive, arrive + dt)) {
          const [x, y] = stops[i]!
          for (let k = 0; k < 18 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 120)
            fx.add({
              x,
              y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 4,
              life: r.range(0.2, 0.45),
              size: 1,
              shape: 'streak',
              trail: 0.04,
              colors: ['#ffffff', '#fff3a0', '#ffd23a'],
            })
          }
        }
      }
      if (within(t, T_BOLT, T_BOLT + dt))
        for (let k = 0; k < 60 * many; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(60, 200)
          fx.add({
            x: L.cx,
            y: L.mid,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 3,
            life: r.range(0.3, 0.7),
            size: 1,
            shape: 'streak',
            trail: 0.05,
            colors: ['#ffffff', '#fff3a0', '#ffd23a', '#ff8a1e'],
          })
        }
      // Once it's out, sparks keep jumping off it.
      if (t > reveal && r() < 0.35 * many)
        fx.add({
          x: L.cx + r.range(-L.sz.w * 0.5, L.sz.w * 0.5),
          y: L.feet - r.range(0, L.sz.h),
          vx: r.range(-50, 50),
          vy: r.range(-50, 20),
          life: 0.18,
          size: 1,
          shape: 'streak',
          trail: 0.04,
          colors: ['#ffffff', '#fff3a0'],
        })
    },
    shell: (t) => {
      const [dx, dy] = pos(t)
      return { dx, dy }
    },
    echoes(t) {
      // Where it just was: a fading image at each of the last two stops.
      const out: [number, number, number][] = []
      for (let i = 0; i < stops.length - 1; i++) {
        const left = T0 + (i + 1) * STEP
        const q = span(t, left, left + 0.22)
        if (t < left || q >= 1) continue
        out.push([stops[i]![0] - L.cx, stops[i]![1] - L.mid, 0.5 * (1 - q)])
      }
      return out
    },
    back(g, t) {
      // Each dash leaves its own bolt between the stops, flickering out.
      trails.forEach((pts, i) => {
        const from = T0 + i * STEP
        const q = span(t, from, from + 0.32)
        if (t < from || q >= 1 || (q > 0.5 && Math.floor(t * 30) % 2)) return
        polyline(g, pts, '#ff8a1e', 3)
        polyline(g, pts, q < 0.4 ? '#ffffff' : '#fff3a0', 1)
      })
    },
    over(g, t) {
      if (within(t, T_BOLT - 0.05, T_BOLT + 0.2)) {
        const on = t < T_BOLT || Math.floor(t * 30) % 3 !== 1
        if (on) {
          polyline(g, big, '#ffd23a', 5)
          polyline(g, big, '#fff3a0', 3)
          polyline(g, big, '#ffffff', 1)
          for (const f of forks) polyline(g, f, '#fff3a0', 1)
        }
      }
    },
    front(g, t, sp) {
      // Crackling round the closed shell, charged by the bolt, until it opens.
      if (t > T_BOLT && t < reveal) {
        const f = Math.floor(t * 20)
        for (let i = 0; i < 2; i++) {
          const pts = arcs[(f + i * 3) % arcs.length]!
          polyline(
            g,
            pts.map(([x, y]) => [sp.x + x, sp.y + y] as [number, number]),
            i ? '#fff3a0' : '#ffffff',
          )
        }
      }
    },
    shakes: [[T_BOLT, 0.45, 4]],
    flashes(g, t) {
      if (within(t, T_BOLT, T_BOLT + 0.18))
        screenFlash(g, '#fff8c0', 0.6 * (1 - span(t, T_BOLT, T_BOLT + 0.18)))
    },
  }
}

// ---------------------------------------------------------------- Lele: the stones float, the scales' wings

function leleSig(L: Lay, many: number, reveal: number): Sig {
  const T0 = T_SIG
  const T_WINGS = 3.45
  type Rock = {
    x0: number
    y0: number
    cv: Canvas
    halo: Canvas
    lift: number
    a0: number
    rx: number
    ry: number
    dy: number
  }
  let rocks: Rock[] = []
  let wings: Canvas | null = null
  const wa = Math.round(Math.min(L.w * 0.47, L.m * 0.48))
  const rockAt = (k: Rock, t: number) => {
    const q = ease.outC(span(t, k.lift, k.lift + 0.7))
    const a = k.a0 + Math.max(0, t - k.lift) * 1.2
    const tx = L.cx + Math.cos(a) * k.rx
    const ty = L.mid + k.dy + Math.sin(a) * k.ry + Math.sin(t * 2 + k.a0) * 2
    return { x: lerp(k.x0, tx, q), y: lerp(k.y0, ty, q), front: Math.sin(a) > 0 || q < 0.5, held: q > 0 }
  }
  const drawRock = (g: G, k: Rock, x: number, y: number, held: boolean, t: number) => {
    // Held: its psychic outline, flickering.
    if (held && Math.floor(t * 12 + k.a0 * 3) % 4) g.drawImage(k.halo, Math.round(x) - 1, Math.round(y) - 1)
    g.drawImage(k.cv, Math.round(x), Math.round(y))
  }
  return {
    setup(r) {
      rocks = Array.from({ length: Math.round(12 * (many < 1 ? 0.7 : 1)) }, (_, i) => {
        const side = i % 2 ? 1 : -1
        // An irregular chunk of the ruin's stone: lit on top, dark beneath, cut edges.
        const rw = r.int(6, 13)
        const rh = r.int(5, 9)
        const seed = r.int(1, 999)
        const inside = (x: number, y: number) => {
          const u = (x + 0.5) / rw - 0.5
          const v = (y + 0.5) / rh - 0.5
          // Blocky with its corners knocked off: a piece of cut stone, not a gem.
          return (
            Math.max(Math.abs(u), Math.abs(v)) * 0.75 +
              (Math.abs(u) + Math.abs(v)) * 0.3 +
              hash2(x + seed, y) * 0.12 <
            0.6
          )
        }
        const cv = shade(rw, rh, (x, y) => {
          if (!inside(x, y)) return null
          if (!inside(x, y - 1)) return '#b49ab0'
          if (!inside(x, y + 1) || !inside(x + 1, y)) return '#2e2236'
          return hash2(x + seed, y * 3) > 0.8 ? '#46364e' : '#6e5672'
        })
        const halo = shade(rw + 2, rh + 2, (x, y) =>
          !inside(x - 1, y - 1) &&
          (inside(x - 2, y - 1) || inside(x, y - 1) || inside(x - 1, y - 2) || inside(x - 1, y))
            ? '#ff8ad0'
            : null,
        )
        return {
          x0: Math.round(L.cx + side * r.range(L.sh.w * 0.8, L.w * 0.48)),
          y0: Math.round(r.range(L.floor + 6, L.h * 0.86)),
          cv,
          halo,
          lift: T0 + i * 0.05 + r() * 0.15,
          a0: (i / 12) * Math.PI * 2,
          rx: r.range(L.sh.w * 0.8, Math.min(L.w * 0.47, L.sh.w * 2.4)),
          ry: r.range(6, 16),
          dy: r.range(-L.sh.h * 0.6, L.sh.h * 0.35),
        }
      })
      // Its wings, made of its glittering scales: two big ones swept up, two small ones down, each a teardrop
      // from its body, veined, an eye spot near the tip, densest at the rim. Drawn once.
      const W2 = wa * 2 + 4
      const H2 = Math.round(wa * 1.7)
      const oy = Math.round(H2 * 0.48)
      const parts = [
        { a: -0.62, len: 1.0, wd: 0.42 },
        { a: 0.78, len: 0.66, wd: 0.4 },
      ]
      wings = shade(W2, H2, (x, y) => {
        const dx = Math.abs(x - W2 / 2 + 0.5) / wa
        const dy = (y - oy + 0.5) / wa
        for (const pt of parts) {
          const d = dx * Math.cos(pt.a) + dy * Math.sin(pt.a)
          const pp = -dx * Math.sin(pt.a) + dy * Math.cos(pt.a)
          const q = d / pt.len
          if (q <= 0.04 || q >= 1) continue
          const half = pt.wd * pt.len * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.75)), 0.85)
          const e = Math.abs(pp) / half
          if (e >= 1) continue
          const b = bayer(x, y)
          if (e > 0.88) return '#ffd0f0'
          if (e > 0.74) return b < 0.7 ? '#ff8ad0' : '#c050a0'
          // The eye spot.
          const sd = Math.hypot(q - 0.72, pp / pt.len / 0.9) * pt.len
          if (sd < 0.075 * pt.len) return '#ffffff'
          if (sd < 0.11 * pt.len) return '#c050a0'
          // Veins: the axis and two branches.
          if (Math.abs(pp) < 0.012 || Math.abs(Math.abs(pp) - q * half * 0.55) < 0.01)
            return b < 0.6 ? '#ffd0f0' : null
          return b < 0.12 + 0.3 * e * e ? '#ff8ad0' : b < 0.2 + 0.2 * e ? '#a03a80' : null
        }
        return null
      })
    },
    step(t, dt, fx, r) {
      for (const k of rocks)
        if (within(t, k.lift, k.lift + dt))
          for (let i = 0; i < 6; i++)
            fx.add({
              x: k.x0 + k.cv.width / 2,
              y: k.y0 + k.cv.height,
              vx: r.range(-20, 20),
              vy: -r.range(2, 12),
              drag: 2,
              life: 0.6,
              size: 2,
              shape: 'smoke',
              colors: ['#a08aa0', '#6a5670'],
            })
      // Its scales: a glittering dust sifting down off it.
      if (t > T0 && r() < 0.9 * many)
        fx.add({
          x: L.cx + r.range(-wa * 0.8, wa * 0.8),
          y: L.mid + r.range(-wa * 0.5, wa * 0.2),
          vx: r.range(-8, 8),
          vy: r.range(6, 22),
          life: r.range(0.9, 1.6),
          size: 1,
          shape: r() < 0.2 ? 'star' : 'px',
          colors: ['#ffffff', '#ffd0f0', '#ff8ad0', '#c050a0'],
        })
      // The reveal's wingbeat throws its scales out.
      if (within(t, reveal, reveal + dt))
        for (let i = 0; i < 60 * many; i++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 140)
          fx.add({
            x: L.cx + Math.cos(a) * wa * 0.5,
            y: L.mid + Math.sin(a) * wa * 0.4,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v * 0.6,
            drag: 2,
            life: r.range(0.8, 1.4),
            size: 1,
            shape: r() < 0.3 ? 'star' : 'px',
            colors: ['#ffffff', '#ffd0f0', '#ff8ad0'],
          })
        }
    },
    warp: (t) =>
      t > T0 && t < reveal + 0.3
        ? Math.round(2 * span(t, T0, T0 + 0.5) * (1 - span(t, reveal, reveal + 0.3)))
        : 0,
    back(g, t, sp) {
      if (wings && t > T_WINGS) {
        const grow = span(t, T_WINGS, T_WINGS + 0.45)
        const fade = 1 - span(t, reveal + 0.25, reveal + 0.9)
        // A wingbeat on the reveal: the wings close to a sliver and open again.
        const beat =
          t > reveal - 0.2 && t < reveal + 0.2
            ? Math.max(0.12, Math.abs(Math.cos(((t - reveal + 0.2) / 0.4) * Math.PI)))
            : 1
        const k = grow * fade
        const x = sp.x - (wings.width >> 1)
        const y = sp.y - Math.round(wings.height * 0.48)
        if (beat < 1) {
          const ww = Math.max(2, Math.round(wings.width * beat))
          g.drawImage(wings, sp.x - (ww >> 1), y, ww, wings.height)
        } else if (k > 0) dissolve(g, wings, k, x, y)
      }
      for (const k of rocks) {
        const q = rockAt(k, t)
        if (!q.front) drawRock(g, k, q.x, q.y, q.held, t)
      }
    },
    front(g, t) {
      for (const k of rocks) {
        const q = rockAt(k, t)
        if (q.front) drawRock(g, k, q.x, q.y, q.held, t)
      }
    },
  }
}

// ---------------------------------------------------------------- Bulu: the desert's trees, the slam

function buluSig(L: Lay, many: number, reveal: number): Sig {
  const T0 = T_SIG
  const T_RISE = 3.45
  const T_SLAM = 3.85
  type Tree = { x: number; base: number; cv: Canvas; t0: number }
  let trees: Tree[] = []
  // The wind-up: it rises high over the dais, hangs, and comes down like a hammer.
  const up = Math.round(Math.min(L.m * 0.22, L.mid - L.sh.h * 0.5 - L.h * 0.08))
  const shellDy = (t: number) => {
    if (t < T_RISE) return 0
    if (t < T_SLAM - 0.08) return -up * ease.outC(span(t, T_RISE, T_SLAM - 0.08))
    if (t < T_SLAM) return lerp(-up, 6, ease.inQ(span(t, T_SLAM - 0.08, T_SLAM)))
    return lerp(6, 0, ease.ioS(span(t, T_SLAM + 0.1, T_SLAM + 0.45)))
  }
  return {
    setup(r) {
      const n = L.w > 200 ? 8 : 6
      trees = Array.from({ length: n }, (_, i) => {
        const side = i % 2 ? 1 : -1
        const far = Math.floor(i / 2) % 2 === 0
        const reach = L.w / 2 - 4
        const x = L.cx + side * Math.min(reach, L.gate.x1 - L.cx + 6 + (i >> 1) * (L.w > 200 ? 34 : 14))
        const base = far ? L.floor + 2 : Math.round(L.floor + (L.h - L.floor) * 0.18)
        return { x: Math.round(x), base, cv: tree(r, L, far ? 0.8 : 1), t0: T0 + i * 0.1 }
      })
    },
    step(t, dt, fx, r) {
      for (const tr of trees)
        if (within(t, tr.t0, tr.t0 + dt))
          for (let i = 0; i < 16 * many; i++)
            fx.add({
              x: tr.x + r.range(-6, 6),
              y: tr.base,
              vx: r.range(-50, 50),
              vy: -r.range(30, 110),
              ay: 260,
              life: r.range(0.5, 0.9),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'leaf' : 'sq',
              spin: r.range(-8, 8),
              colors: r() < 0.5 ? ['#c8f58a', '#5ac85a', '#2e7a3a'] : ['#d8b888', '#a88458'],
            })
      if (within(t, T_SLAM, T_SLAM + dt))
        for (let i = 0; i < 20 * many; i++)
          fx.add({
            x: L.cx + r.range(-L.dais[2]!, L.dais[2]!),
            y: L.front - 2,
            vx: r.range(-60, 60),
            vy: -r.range(5, 30),
            drag: 2,
            life: r.range(0.5, 0.9),
            size: r.int(3, 5),
            shape: 'smoke',
            colors: ['#e0c890', '#a88458'],
          })
      if (within(t, T_SLAM, T_SLAM + dt))
        for (let i = 0; i < 90 * many; i++) {
          const x = r.range(0, L.w)
          const y = r.range(L.floor + 4, L.h)
          fx.add({
            x,
            y,
            vx: (x - L.cx) * r.range(0.4, 1.2),
            vy: -r.range(60, 160),
            ay: 220,
            drag: 0.6,
            life: r.range(0.8, 1.5),
            size: 1,
            shape: r() < 0.6 ? 'leaf' : 'px',
            spin: r.range(-8, 8),
            colors: r() < 0.6 ? ['#c8f58a', '#7ad85a', '#3a9a4a'] : ['#ffd0f0', '#ff8ac8', '#fff3a0'],
          })
        }
      // Petals and leaves on the wind once it's out.
      if (t > reveal && r() < 0.3 * many)
        fx.add({
          x: -4,
          y: r.range(L.h * 0.25, L.h * 0.8),
          vx: r.range(30, 60),
          vy: r.range(-6, 10),
          life: 4,
          size: 1,
          shape: 'leaf',
          spin: r.range(-4, 4),
          colors: r() < 0.5 ? ['#7ad85a'] : ['#ff8ac8'],
          light: '#ffffff',
          dark: '#2e7a3a',
        })
    },
    shell: (t) => ({ dx: 0, dy: shellDy(t) }),
    back(g, t) {
      for (const tr of trees) {
        if (t < tr.t0) continue
        // Bursting up out of the sand: the top comes first.
        const q = ease.outBack(span(t, tr.t0, tr.t0 + 0.28), 2.2)
        const hh = Math.max(1, Math.min(tr.cv.height + 6, Math.round(tr.cv.height * q)))
        const sw =
          t > T_SLAM && t < T_SLAM + 0.6
            ? Math.round(Math.sin((t - T_SLAM) * 30) * 2 * (1 - span(t, T_SLAM, T_SLAM + 0.6)))
            : 0
        g.drawImage(
          tr.cv,
          0,
          0,
          tr.cv.width,
          Math.min(hh, tr.cv.height),
          tr.x - (tr.cv.width >> 1) + sw,
          tr.base - hh,
          tr.cv.width,
          Math.min(hh, tr.cv.height),
        )
      }
    },
    front(g, t) {
      // The slam's shock across the grass.
      for (const d of [0, 0.1]) {
        const q = span(t, T_SLAM + d, T_SLAM + d + 0.55)
        if (q <= 0 || q >= 1) continue
        const rx = Math.round(lerp(10, L.w * 0.9, ease.outC(q)))
        ellipseLine(g, L.cx, L.front, rx, Math.max(1, Math.round(rx * 0.3)), d ? '#c8f58a' : '#ffffff')
        ellipseLine(g, L.cx, L.front + 1, rx, Math.max(1, Math.round(rx * 0.3)), '#3a9a4a')
      }
    },
    shakes: [[T_SLAM, 0.6, 5]],
    flashes(g, t) {
      if (within(t, T_SLAM, T_SLAM + 0.14))
        screenFlash(g, '#f0ffd8', 0.5 * (1 - span(t, T_SLAM, T_SLAM + 0.14)))
    },
  }
}

/** A tropical tree, drawn once: a leaning trunk and a crown of leaves, flowers in it. */
function tree(r: Rng, L: Lay, scale: number): Canvas {
  const th = Math.round(Math.min(L.h * 0.4, L.floor - L.gate.top + 20) * scale * r.range(0.8, 1.05))
  const tw = Math.round(th * 0.7)
  const cv = canvas(tw, th)
  const g = cv.g
  const cx = tw >> 1
  const lean = r.range(-4, 4)
  const crown = Math.round(th * 0.38)
  for (let y = th - 1; y > crown - 4; y--) {
    const q = (th - y) / th
    const x = Math.round(cx + lean * q * q)
    const wd = Math.max(3, Math.round(6 - q * 3))
    rect(g, x - (wd >> 1), y, wd, 1, '#5a3a1a')
    rect(g, x - (wd >> 1), y, 1, 1, '#8a5a2a')
    if (y % 5 === 0) rect(g, x - (wd >> 1) + 1, y, wd - 2, 1, '#3a2410')
  }
  const tx = cx + lean
  for (let i = 0; i < 9; i++) {
    const ex = tx + r.range(-tw * 0.36, tw * 0.36)
    const ey = r.range(crown * 0.35, crown * 1.05)
    const rx = Math.round(r.range(tw * 0.14, tw * 0.24))
    ellipse(g, ex, ey, rx, Math.max(3, Math.round(rx * 0.7)), '#1e5a2e')
  }
  for (let i = 0; i < 8; i++) {
    const ex = tx + r.range(-tw * 0.3, tw * 0.3)
    const ey = r.range(crown * 0.3, crown * 0.85)
    const rx = Math.round(r.range(tw * 0.1, tw * 0.18))
    ellipse(g, ex, ey, rx, Math.max(2, Math.round(rx * 0.6)), '#3a9a4a')
    ellipse(g, ex - 1, ey - 1, Math.max(1, rx - 2), Math.max(1, Math.round(rx * 0.35)), '#7ad85a')
  }
  for (let i = 0; i < 7; i++) {
    const x = tx + r.range(-tw * 0.32, tw * 0.32)
    const y = r.range(crown * 0.3, crown * 0.95)
    rect(g, x, y, 2, 2, r() < 0.5 ? '#ff8ac8' : '#fff3a0')
  }
  return cv
}

// ---------------------------------------------------------------- Fini: the water drawn up into a sphere

function finiSig(L: Lay, many: number, reveal: number): Sig {
  const T0 = T_SIG
  const T_GLOBE = 3.05
  const Rg = Math.round(Math.max(L.sh.w, L.sh.h) * 0.62 + 8)
  const radius = (t: number) => Math.round(Rg * ease.outC(span(t, T_GLOBE, T_GLOBE + 0.8)))
  return {
    setup() {},
    step(t, dt, fx, r) {
      // The water rising off the plaza, every drop drawn to it.
      if (t > T0 && t < reveal - 0.2)
        for (let i = 0; i < 2; i++)
          if (r() < many)
            fx.add({
              x: r.range(0, L.w),
              y: r.range(L.floor + 4, L.h),
              vy: -r.range(20, 50),
              home: { x: L.cx, y: L.mid, k: 420 },
              drag: 1.2,
              life: 1.6,
              size: r.int(1, 2),
              shape: 'drop',
              colors: ['#e8f8ff', '#8ad8ff', '#5aa8e0'],
            })
      if (within(t, reveal, reveal + dt))
        for (let i = 0; i < 80 * many; i++) {
          const a = r() * Math.PI * 2
          const v = r.range(70, 190)
          fx.add({
            x: L.cx + Math.cos(a) * Rg,
            y: L.mid + Math.sin(a) * Rg,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 30,
            ay: 200,
            life: r.range(0.6, 1.2),
            size: r.int(1, 2),
            shape: 'drop',
            colors: ['#ffffff', '#c8f0ff', '#8ad8ff'],
          })
        }
      if (t > reveal && r() < 0.4 * many)
        fx.add({
          x: L.cx + r.range(-L.w * 0.5, L.w * 0.5),
          y: L.h * r.range(0.4, 0.9),
          vy: -r.range(4, 10),
          life: 1.4,
          size: 1,
          shape: 'star',
          colors: ['#ffffff', '#ffe0f4', '#c8b8f0'],
        })
    },
    front(g, t, sp) {
      // Mist rising round the dais as the water gathers, blown back on the reveal.
      const mk = span(t, T0, T0 + 0.8) * (1 - span(t, reveal, reveal + 0.8))
      if (mk > 0) {
        const blow = ease.outC(span(t, reveal, reveal + 0.8))
        for (let k = 0; k < 7; k++) {
          const side = k % 2 ? 1 : -1
          const x = L.cx + side * (12 + k * L.w * 0.07 + blow * L.w * 0.5) + Math.sin(t * 0.8 + k) * 6
          const y = L.front - 2 - (k % 3) * 7 - mk * 6
          ellipse(
            g,
            x,
            y,
            18 + (k % 3) * 6,
            5 + (k % 2) * 2,
            pattern(g, k % 2 ? '#f4e8ff' : '#ffe0f4', 7 * mk),
          )
        }
      }
      const R = radius(t)
      if (R < 3 || t >= reveal) return
      const cy = sp.y
      // The sphere: a dithered body of water, its rim rippling, a shine, light moving in it.
      ellipse(g, L.cx, cy, R, R, pattern(g, '#5ab0e8', 4))
      ellipse(g, L.cx, cy, R - 2, R - 2, pattern(g, '#c8f0ff', 2))
      const amp = 1 + span(t, reveal - 0.5, reveal) * 2
      let prev: [number, number] | null = null
      const n = Math.max(24, Math.round(R * 4))
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2
        const rr = R + Math.sin(a * 6 + t * 9) * amp
        const pt: [number, number] = [L.cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
        if (prev) line(g, prev[0], prev[1], pt[0], pt[1], a > 3.4 && a < 4.8 ? '#ffffff' : '#8ad8ff')
        prev = pt
      }
      ellipseLine(g, L.cx, cy, Math.max(2, R - 4), Math.max(2, R - 4), '#ffffff', 3.6, 4.4)
      for (let k = 0; k < 3; k++) {
        const yy = cy - R * 0.5 + k * R * 0.45 + Math.sin(t * 3 + k) * 3
        const half = Math.round(Math.sqrt(Math.max(0, R * R - (yy - cy) ** 2)) * 0.7)
        for (let x = -half; x < half; x += 2)
          rect(g, L.cx + x, Math.round(yy + Math.sin(x / 4 + t * 6 + k) * 1.5), 1, 1, '#e8f8ff')
      }
    },
  }
}

// ---------------------------------------------------------------- the four places

const kokoSky = ['#14161f', '#22252f', '#38384a', '#6a5a5a', '#c08a4a', '#f0c060'] as const
const leleSky = ['#1e1438', '#3e2058', '#7a3a78', '#c45a88', '#f08a8a', '#ffc090'] as const
const buluSky = ['#2a6aa8', '#4a8ac0', '#7ab0d0', '#b8d8d8', '#f0e0b0'] as const
const finiSky = ['#04060f', '#081022', '#0e1c38', '#1a2c4e', '#2c4064'] as const

/** Palms and leaves either side of the ruin, in the scene's dark. */
function jungle(g: G, L: Lay, r: Rng, dark: string, mid: string, edge: string) {
  const base = L.floor - 2
  for (const side of [-1, 1]) {
    // Palms at uneven spacing and height, leaning away from the gate; leaves clumped at their feet.
    let x = side < 0 ? L.gate.x0 - r.range(4, 14) : L.gate.x1 + r.range(4, 14)
    while (side < 0 ? x > -30 : x < L.w + 30) {
      palm(g, x, base, Math.round(L.h * r.range(0.26, 0.46)), side * r.range(4, 18), dark, edge)
      x += side * r.range(18, 46)
    }
    for (let k = 0; k < 12; k++) {
      const bx = side < 0 ? L.gate.x0 - k * r.range(14, 26) : L.gate.x1 + k * r.range(14, 26)
      if (bx < -20 || bx > L.w + 20) break
      bush(g, bx, base, Math.round(L.m * r.range(0.08, 0.13)), dark, mid, r)
    }
  }
}

/** Melemele's storm clouds: drawn on the sky once, lit from inside live (the same seed both times). */
function kokoClouds(L: Lay) {
  const r = rng(7851)
  const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.45)
  return Array.from({ length: Math.round(10 + L.w / 30) }, () => {
    const rx = Math.round(r.range(22, 48))
    return { x: Math.round(r.range(-20, L.w + 20)), y: Math.round(r.range(-4, hz * 0.55)), rx }
  })
}

const koko: Spec = {
  id: 'tapu-koko',
  seed: 785,
  reveal: 4.5,
  aura: ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'],
  sky: kokoSky,
  stone: { lit: '#8a8478', mid: '#5c5850', dark: '#3c3934', ink: '#1a1816' },
  shell: {
    base: '#2a2a30',
    dark: '#16161a',
    light: '#4a4a52',
    trim: '#ff8a1e',
    ink: '#0a0a0c',
    eye: '#fff3a0',
    crest: 'comb',
    crestC: ['#ff6a1e', '#ffd23a'],
  },
  terrain: 'electric',
  moss: ['#2e4a22', '#4a6a30'],
  tc: ['#ffe25a', '#fff3a0'],
  gust: { shape: 'leaf', colors: ['#5a7a3a'], light: '#8aa85a', dark: '#2a3a1a' },
  place(g, L) {
    // Melemele's sea under a storm: the cloud's belly lit gold where the sun gets under it.
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.45)
    rect(g, 0, hz, L.w, L.floor + 2 - hz, '#1e2a3a')
    for (let y = hz + 2; y < L.floor; y += 3)
      for (let x = (y * 7) % 11; x < L.w; x += 14) rect(g, x, y, 5, 1, y < hz + 8 ? '#e0a050' : '#34465a')
    rect(g, 0, hz, L.w, 1, '#f0c060')
    kokoClouds(L).forEach(({ x, y, rx }, i) => {
      ellipse(g, x, y, rx, Math.round(rx * 0.32), i % 3 ? '#1a1c26' : '#2a2c38')
      ellipse(g, x + 3, y + Math.round(rx * 0.22), Math.round(rx * 0.8), 2, '#4a4450')
    })
  },
  sides: (g, L, r) => jungle(g, L, r, '#0c120c', '#16201a', '#2a3a2a'),
  skyLive(g, t, L) {
    // Lightning inside the clouds: one cloud lit from within and a short fork under it, never the whole screen.
    const clouds = kokoClouds(L)
    ;[0.7, 1.45, 2.25, 3.05, 5.6, 6.9].forEach((at, i) => {
      if (!within(t, at, at + 0.14) || Math.floor(t * 30) % 3 === 2) return
      const c = clouds[(i * 5 + 3) % clouds.length]!
      for (const [dx, dy, k] of [
        [-0.4, 0.05, 0.45],
        [0.1, -0.05, 0.55],
        [0.45, 0.08, 0.38],
      ] as const)
        ellipse(
          g,
          c.x + dx * c.rx,
          c.y + dy * c.rx,
          Math.round(c.rx * k),
          Math.round(c.rx * k * 0.45),
          '#3e3e5a',
        )
      ellipse(g, c.x, c.y + Math.round(c.rx * 0.18), Math.round(c.rx * 0.6), 2, '#8a88b8')
      const b = bolt(
        rng(i + 11),
        c.x,
        c.y + c.rx * 0.3,
        c.x + (i % 2 ? 14 : -14),
        c.y + c.rx * 0.3 + 22,
        0.4,
        3,
      )
      polyline(g, b, '#e0e0ff')
    })
  },
  sig: kokoSig,
  cry() {
    tone(880, 0.12, { type: 'square', vol: 0.04, slide: 400 })
    tone(1320, 0.3, { type: 'square', vol: 0.04, slide: -260, at: 0.14 })
  },
  sounds: [
    ...[0, 1, 2, 3, 4].map(
      (i) =>
        [
          T_SIG + i * 0.17,
          () => {
            hiss(0.1, { freq: 5000 - i * 400, vol: 0.06 })
            tone(1800 + i * 120, 0.05, { type: 'square', vol: 0.025 })
          },
        ] as const,
    ),
    [3.92, () => fxSound('thunder.strike')],
    [3.95, () => hiss(0.8, { freq: 200, type: 'lowpass', vol: 0.14 })],
  ],
}

const lele: Spec = {
  id: 'tapu-lele',
  seed: 786,
  reveal: 4.65,
  aura: ['#ffffff', '#ffd0f0', '#ff6ab0', '#8a1f5a'],
  sky: leleSky,
  stone: { lit: '#a88aa0', mid: '#6e5672', dark: '#46364e', ink: '#1e1424' },
  shell: {
    base: '#f08ac0',
    dark: '#b0508a',
    light: '#ffc8e8',
    trim: '#ffffff',
    ink: '#3a1430',
    eye: '#ffffff',
    crest: 'puffs',
    crestC: ['#e070b0', '#ffd0f0'],
  },
  terrain: 'psychic',
  moss: ['#2a3a26', '#4a5a3a'],
  tc: ['#ff9ad8', '#ffd0f0'],
  gust: { shape: 'leaf', colors: ['#ff9ac8'], light: '#ffd0f0', dark: '#a04a80' },
  place(g, L, r) {
    // Akala at dusk: Wela Volcano far off, the first stars, the flowers' island.
    stars(g, r, L.w, Math.round(L.gate.top * 0.8), Math.round(L.w * 0.25), '#8a6aa8', '#ffffff')
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.5)
    const vx = Math.round(L.w * 0.72)
    const vh = Math.round((hz - L.gate.top) * 0.55 + 12)
    // Wela's cone: a flat top, its slopes in two tones, ridges down its lit side.
    tri(g, vx - vh * 1.5, hz + 1, vx + vh * 1.5, hz + 1, vx, hz - vh - 3, '#4a2448')
    rect(g, vx - 5, hz - vh, 11, 3, '#4a2448')
    tri(g, vx - vh * 1.5, hz + 1, vx - 5, hz - vh, vx - 2, hz + 1, '#5e2e58')
    for (let k = 1; k < 4; k++) line(g, vx - 5 + k, hz - vh + 2, vx - vh * 0.4 * k, hz, '#4a2448')
    rect(g, vx - 3, hz - vh, 7, 1, '#ff8a5a')
    rect(g, 0, hz, L.w, L.floor + 2 - hz, '#3a1e40')
    for (let x = 0; x < L.w; x += 3) rect(g, x, hz + 2 + ((x * 7) % 5), 2, 1, '#6a3060')
  },
  sides: (g, L, r) => jungle(g, L, r, '#1a0e1e', '#2a1630', '#5a3060'),
  skyLive(g, t, L) {
    // The volcano's smoke, slow.
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.5)
    const vx = Math.round(L.w * 0.72)
    const vh = Math.round((hz - L.gate.top) * 0.55 + 12)
    for (let k = 0; k < 4; k++) {
      const q = (t * 0.12 + k / 4) % 1
      ellipse(g, vx + q * 14, hz - vh - 3 - q * 26, 3 + q * 7, 2 + q * 3, pattern(g, '#6a4a6a', 10 * (1 - q)))
    }
  },
  sig: leleSig,
  cry() {
    tone(1568, 0.1, { type: 'triangle', vol: 0.04 })
    tone(1760, 0.1, { type: 'triangle', vol: 0.04, at: 0.11 })
    tone(2093, 0.35, { type: 'triangle', vol: 0.04, at: 0.22, slide: 200 })
  },
  sounds: [
    [T_SIG, () => fxSound('psychic.focus')],
    [T_SIG + 0.05, () => hiss(0.9, { freq: 160, type: 'lowpass', vol: 0.1 })],
    [3.5, () => tone(1319, 0.8, { type: 'sine', vol: 0.025, slide: 660 })],
    [3.6, () => tone(1976, 0.6, { type: 'sine', vol: 0.02 })],
    [3.95, () => fxSound('psychic.focus')],
  ],
}

const bulu: Spec = {
  id: 'tapu-bulu',
  seed: 787,
  reveal: 4.55,
  aura: ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'],
  sky: buluSky,
  stone: { lit: '#d8b888', mid: '#a88458', dark: '#6a5034', ink: '#2e2014' },
  sand: '#e0c890',
  shell: {
    base: '#5a2a1e',
    dark: '#341810',
    light: '#8a4a2e',
    trim: '#ffd23a',
    ink: '#160a06',
    eye: '#ffe060',
    crest: 'horns',
    crestC: ['#f0e0b8', '#3a2a1a'],
  },
  terrain: 'grassy',
  tc: ['#a8f07a', '#c8ffd8'],
  gust: { shape: 'px', colors: ['#f0d8a0', '#d8b888'] },
  place(g, L) {
    // Haina Desert at noon: the sun high, Mount Lanakila's snow far off, dunes.
    const sx = Math.round(L.w * 0.78)
    const sy = Math.round(L.gate.top * 0.45)
    g.drawImage(glow(20, '#fff8e0', 2.2, 0.8), sx - 20, sy - 20)
    ellipse(g, sx, sy, 7, 7, '#fffbe8')
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.5)
    const mx = Math.round(L.w * 0.22)
    const mh = Math.round(hz - L.gate.top + 26)
    tri(g, mx - mh * 1.4, hz + 1, mx + mh * 1.4, hz + 1, mx, hz - mh, '#7a8aa8')
    tri(g, mx - mh * 0.35, hz - mh * 0.75, mx + mh * 0.35, hz - mh * 0.75, mx, hz - mh, '#ffffff')
    tri(g, mx - mh * 1.4, hz + 1, mx, hz - mh, mx - 3, hz + 1, '#8a9ab8')
    for (let k = 0; k < 3; k++) {
      const c = ['#e8c888', '#d8b070', '#c89858'][k]!
      for (let x = 0; x < L.w; x++) {
        const y = Math.round(hz + k * 5 + Math.sin(x / (22 - k * 5) + k * 2) * (3 + k) + 2)
        rect(g, x, y, 1, L.floor + 2 - y, c)
      }
    }
  },
  sides(g, L, r) {
    // Dunes running up to the walls, a few rocks.
    for (const side of [-1, 1]) {
      for (let x = side < 0 ? 0 : L.gate.x1; side < 0 ? x < L.gate.x0 : x < L.w; x++) {
        const k = Math.abs(x - L.cx) / (L.w / 2)
        const y = Math.round(L.floor - 10 - k * 18 + Math.sin(x / 9) * 3)
        rect(g, x, y, 1, L.floor - y, '#d8b070')
        rect(g, x, y, 1, 1, '#f0d8a0')
      }
      for (let i = 0; i < 2; i++) {
        const x = side < 0 ? r.range(0, L.gate.x0 - 6) : r.range(L.gate.x1 + 6, L.w)
        ellipse(g, x, L.floor - 6, 6, 4, '#8a6a44')
        ellipse(g, x - 1, L.floor - 8, 4, 2, '#b08a5a')
      }
    }
  },
  skyLive(g, t, L) {
    // Heat shimmer over the dunes: a few rows sliding back and forth.
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.5)
    for (let y = hz - 2; y < hz + 6; y += 2) {
      const off = Math.round(Math.sin(y + t * 6) * 1.5)
      if (off) g.drawImage(g.canvas, 0, y, L.w, 1, off, y, L.w, 1)
    }
  },
  sig: buluSig,
  cry() {
    tone(196, 0.25, { type: 'sawtooth', vol: 0.05, slide: -40 })
    tone(147, 0.45, { type: 'sawtooth', vol: 0.05, at: 0.24, slide: -30 })
  },
  sounds: [
    [T_EYES + 0.35, () => tone(98, 1.4, { type: 'sine', vol: 0.06 })],
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_SIG + i * 0.1, () => hiss(0.18, { freq: 260 + i * 30, type: 'lowpass', vol: 0.1 })] as const,
    ),
    [3.0, () => fxSound('leaf.slash')],
    [3.45, () => hiss(0.4, { freq: 400, slide: 900, vol: 0.05 })],
    [3.85, () => fxSound('impact.hit')],
    [3.86, () => tone(60, 0.6, { type: 'sine', vol: 0.14, slide: -20 })],
  ],
}

const fini: Spec = {
  id: 'tapu-fini',
  seed: 788,
  reveal: 4.7,
  aura: ['#ffffff', '#e8d8ff', '#a08af0', '#3a2a7a'],
  sky: finiSky,
  stone: { lit: '#7a8aa8', mid: '#4a5878', dark: '#2e3a54', ink: '#10182a' },
  shell: {
    base: '#c8c8ec',
    dark: '#7a7ab8',
    light: '#f0f0ff',
    trim: '#5ad8ff',
    ink: '#1a1a3a',
    eye: '#5ad8ff',
    crest: 'fins',
    crestC: ['#3a8ad0', '#8ad8ff'],
  },
  terrain: 'misty',
  moss: ['#1a3a3a', '#2a5050'],
  tc: ['#ffe0f4', '#ffffff'],
  gust: { shape: 'smoke', colors: ['#8a9ac0', '#5a6a90'] },
  place(g, L, r) {
    // Poni at night: a pale moon in the haze, the sea, sea stacks far off, mist lying on the water.
    stars(g, r, L.w, Math.round(L.gate.top), Math.round(L.w * 0.2), '#3a4a7a', '#c8d8ff')
    const mx = Math.round(L.w * 0.26)
    const my = Math.round(L.gate.top * 0.62)
    g.drawImage(glow(22, '#8a9ad0', 2, 0.6), mx - 22, my - 22)
    ellipse(g, mx, my, 7, 7, '#e8eeff')
    for (const [dx, dy] of [
      [2, -2],
      [-3, 1],
      [1, 3],
    ] as const)
      rect(g, mx + dx, my + dy, 2, 1, '#c0c8e8')
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.42)
    rect(g, 0, hz, L.w, L.floor + 2 - hz, '#0e1a30')
    for (let y = hz + 2; y < L.floor; y += 3)
      for (let x = (y * 5) % 9; x < L.w; x += 12) rect(g, x, y, 4, 1, '#1e3050')
    for (let y = hz + 1; y < L.floor; y += 2) rect(g, mx - 3 + ((y * 3) % 5), y, 6, 1, '#8a9ad0')
    for (const [fx, hh] of [
      [0.62, 14],
      [0.7, 9],
      [0.9, 18],
    ] as const) {
      const x = Math.round(L.w * fx)
      rect(g, x - 3, hz - hh, 7, hh, '#081020')
      tri(g, x - 6, hz + 1, x + 6, hz + 1, x, hz - hh - 3, '#081020')
    }
  },
  sides: (g, L, r) => jungle(g, L, r, '#050a14', '#0a1424', '#1e3050'),
  skyLive(g, t, L) {
    // Mist drifting across the sea.
    const hz = Math.round(L.gate.top + (L.floor - L.gate.top) * 0.42)
    for (let k = 0; k < 3; k++) {
      const x = ((k * 83 + t * 10) % (L.w + 60)) - 30
      ellipse(g, x, hz + 3 + k * 4, 26, 2, pattern(g, '#5a6a90', 3))
    }
  },
  sig: finiSig,
  cry() {
    tone(1047, 0.2, { type: 'sine', vol: 0.05, slide: 200 })
    tone(784, 0.45, { type: 'sine', vol: 0.05, at: 0.2, slide: 100 })
  },
  sounds: [
    [T_SIG, () => fxSound('water.charge')],
    [T_SIG + 0.3, () => hiss(1.2, { freq: 2400, slide: -1600, vol: 0.03 })],
    [3.05, () => tone(523, 1.4, { type: 'sine', vol: 0.03, slide: 260 })],
    [3.4, () => tone(659, 1.0, { type: 'sine', vol: 0.025 })],
    [4.7, () => fxSound('water.jet')],
  ],
}

export const tapuKokoCinema = tapuCinema(koko)
export const tapuLeleCinema = tapuCinema(lele)
export const tapuBuluCinema = tapuCinema(bulu)
export const tapuFiniCinema = tapuCinema(fini)
