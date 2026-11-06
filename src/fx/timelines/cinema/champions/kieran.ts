// Kieran's entrance (docs/56), on the battle stage: Blueberry Academy's Terarium, under the sea. The camera sinks from
// the bright surface, past the Academy's hull and the glass shaft running down from it, through light rays and a
// shoal of fish, to the great dome on the sea floor glowing with its biomes and its painted sky. Then the dome's
// lights die, band by band from the top, each with a clunk; the fish bolt; it goes black. Inside, in the dark, the
// shaft's foot stands over the court: its lift door opens on a boy's silhouette. One cold blue spotlight snaps on and
// he walks into it, slowly, his shadow on the shaft growing as he comes; the shadow warps into Hydrapple's, its eye
// ignites, and Hydrapple steps out of it behind him. The Tera Orb in his hands lights teal: cracks race out across the
// floor, crystals spike up round him, the court's lines and the shaft's lights come back on in his colour, and the
// reveal bursts the light. The rival who went cold: everything bright switched off, and only his light left.
import { hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  mix,
  Particles,
  pattern,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dGradient, dissolve, flickerOn, pulse, tri, wobble } from '../kit'

const REVEAL = 4.6
/** The dome's lights going out, top band first; the cut inside. */
const T_OFF = [1.3, 1.46, 1.62] as const
const T_CUT = 1.88
/** The lift door opening, closing behind him; the spotlight; his walk out into it. */
const T_DOOR = 2.05
const T_SHUT = 3.05
const T_SPOT = 2.32
const T_WALK = 2.42
const T_STOP = 3.2
/** His shadow warping into Hydrapple's; its eye; Hydrapple stepping out of it. */
const T_WARP = 3.2
const T_EYE = 3.62
const T_OUT = 3.7
/** The Tera Orb; the cracks racing out; the crystals. */
const T_ORB = 3.88
const T_CRACK = 3.98
const T_CRYS = 4.1

const HYDRAPPLE = spriteKey(1019, false)
const TEAL = ['#e8ffff', '#7af0e0', '#2aa8b8', '#0a3a5a'] as const

// ---------------------------------------------------------------- shot A: the descent
/** Shot A's picture: the sea from the surface to the floor; the camera sinks down it. */
const KH = 400
const camK = (t: number) => Math.round(lerp(0, KH - H, ease.ioS(span(t, 0.45, 1.28))))
/** The dome on the sea floor: its centre and radius; the bands its lights go out by. */
const DX = 120
const DY = 414
const DR = 124
const DTOP = DY - DR
const BANDS = [
  [DTOP, 322],
  [322, 356],
  [356, KH],
] as const
/** The glass shaft from the Academy's hull down into the dome. */
const SHAFT = { x: 150, w: 12 }
/** The Terarium's own horizon, seen through the glass (shot A's rows). */
const THZ = DY - Math.round(DR * 0.4)

// ---------------------------------------------------------------- shot B: inside
/** The Terarium's horizon; the foot of the central shaft, a wall behind the court. */
const KHZ = 66
const TB = 84
const TOWER_X = 112
/** The cylinder's axis and radius on screen: its face is lightest where it faces us. */
const TCX = 196
const TR = 92
/** The lift door in the shaft's foot. */
const DOOR = { x: 198, w: 26, h: 64 }
/** The spot's light on the shaft behind him. */
const LIT = { x: 162, y: 46, rx: 46, ry: 40 }

type Fish = { x: number; y: number; vx: number; ph: number }
type Crystal = { a: number; h: number; w: number; at: number; lean: number }
type X = {
  buf: Canvas
  fbuf: Canvas
  sea: Canvas
  domeLit: Canvas
  domeDark: Canvas
  inside: Canvas
  shadow: Canvas
  hydra: Canvas
  shoal: Fish[]
  big: Fish[]
  whale: { x: number; y: number }
  bubbles: Particles
  motes: Particles
  crystals: Crystal[]
  cracks: [number, number][][]
}

const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** A light dying: on, a stutter of a few frames as the power goes, then off for good. */
function stutterOff(t: number, at: number, seed: number) {
  if (t < at) return 1
  const f = Math.floor((t - at) * 30)
  if (f > 5) return 0
  return [0, 1, 0, 0, 1, 0, 1, 0][(f + seed) % 8]!
}

// ---------------------------------------------------------------- shot A's pictures
/** A shaft of light down through the water: a wide faint band round a brighter core, in ordered dither. */
function ray(g: G, x: number, w: number, len: number, lean: number) {
  for (const [k, lv] of [
    [1, 3],
    [0.45, 6],
  ] as const) {
    const hw = w * k
    const p = pattern(g, '#9ae4f8', lv)
    tri(g, x - hw, 0, x + hw, 0, x + lean * len + hw * 1.6, len, p)
    tri(g, x - hw, 0, x + lean * len + hw * 1.6, len, x + lean * len - hw * 1.6, len, p)
  }
}

/** The sea from the surface down: blue to black, the surface's bright underside, rays, the hull and its shaft. */
function seaColumn(r: Rng): Canvas {
  const cv = canvas(W, KH)
  const g = cv.g
  g.drawImage(
    dGradient(W, KH, ['#5ac0e6', '#2a86c0', '#1a5c98', '#0e3c70', '#08264e', '#061834', '#040e22']),
    0,
    0,
  )
  // Light rays from the surface, leaning, fading out long before the floor.
  const rays = canvas(W, 280)
  for (const [x, w, len] of [
    [14, 9, 230],
    [62, 5, 180],
    [104, 12, 260],
    [196, 6, 170],
    [226, 10, 220],
  ] as const)
    ray(rays.g, x, w, len, 0.24)
  // Fade the rays with depth: the deeper rows keep fewer of their pixels.
  const fade = shade(W, 280, (x, y) => ((y / 280) ** 1.4 > bayer(x, y) ? '#000000' : null))
  rays.g.globalCompositeOperation = 'destination-out'
  rays.g.drawImage(fade, 0, 0)
  rays.g.globalCompositeOperation = 'source-over'
  g.drawImage(rays, 0, 0)
  // The surface seen from below: a bright rippling skin, the sun a blaze in it.
  for (let x = 0; x < W; x++) {
    const h = 3 + Math.round(1.5 * Math.sin(x / 6) + Math.sin(x / 2.3))
    rect(g, x, 0, 1, h, '#e0faff')
    rect(g, x, h, 1, 1, x % 5 ? '#9ae0f4' : '#ffffff')
  }
  g.drawImage(glow(14, '#ffffff', 1.3, 1), 50 - 14, -8)
  // Blueberry Academy's hull floating overhead: a great dark disc rimmed with lights, the glass shaft hanging down.
  const hx = 182
  for (let k = 0; k < 18; k++) {
    const hw = Math.round(90 - k * k * 0.17)
    rect(g, hx - hw, 3 + k, hw * 2, 1, k < 2 ? '#3a6a8a' : mix('#0e2c4a', '#071a30', k / 18))
    if (k > 2) rect(g, hx - hw, 3 + k, 2, 1, '#2a5a7a')
  }
  for (let x = hx - 84; x < hx + 86; x += 7) rect(g, x, 10, 2, 1, '#ffe8a0')
  for (let x = hx - 60; x < hx + 60; x += 12) rect(g, x, 15, 3, 1, '#bff4ff')
  rect(g, SHAFT.x - 5, 20, SHAFT.w + 10, 7, '#0a2038')
  rect(g, SHAFT.x - 5, 20, SHAFT.w + 10, 1, '#3a6a8a')
  for (let y = 27; y < DTOP + 8; y++) {
    // A glass tube: dark water seen through it, its left edge catching the light from above.
    rect(g, SHAFT.x, y, SHAFT.w, 1, mix('#1a4a72', '#0a1e36', y / DTOP))
    rect(g, SHAFT.x, y, 1, 1, mix('#9ae0f4', '#2a5a7a', y / DTOP))
    rect(g, SHAFT.x + 2, y, 1, 1, mix('#4a9ac8', '#14304e', y / DTOP))
    rect(g, SHAFT.x + SHAFT.w - 1, y, 1, 1, '#0a1a2c')
    if (y % 24 === 0) rect(g, SHAFT.x - 1, y, SHAFT.w + 2, 2, mix('#3a7aa0', '#14304e', y / DTOP))
  }
  // Rocks and weed on the sea floor either side of the dome, rimmed by its glow.
  for (const [x0, x1, top] of [
    [-10, 34, 350],
    [204, 250, 344],
  ] as const)
    for (let x = x0; x < x1; x++) {
      const u = (x - x0) / (x1 - x0)
      const y = Math.round(top + 34 * (1 - Math.sin(u * Math.PI)) + 3 * Math.sin(x * 0.7))
      rect(g, x, y, 1, KH - y, '#06121e')
      rect(g, x, y, 1, 1, '#1e5a6a')
      if (x % 3 === 0) rect(g, x, y + 2, 1, 1, '#0e2a36')
    }
  for (let i = 0; i < 16; i++) {
    const x = i < 8 ? r.range(0, 34) : r.range(206, 240)
    const base = KH - r.range(0, 24)
    const h = r.range(16, 40)
    for (let j = 0; j < h; j++)
      rect(g, x + Math.round(Math.sin(j / 5 + i) * 2), base - j, 1, 1, j % 4 ? '#0e3a3a' : '#2a6a5a')
  }
  return cv
}

/**
 * The Terarium seen through its dome: a painted sky, the polar peaks, the canyon's mesas, the savanna's hills and
 * trees, the coast; the shaft coming down through the crown. `dark`: the same with the power off.
 */
function terarium(dark: boolean): Canvas {
  const h = KH - DTOP
  const hz = THZ - DTOP
  const cv = canvas(W, h)
  const g = cv.g
  // Seen through the glass: a little of the sea's blue in every colour (dark, almost nothing left of them).
  const c = (col: string) => (dark ? mix(col, '#050b16', 0.88) : mix(col, '#2a8ac0', 0.16))
  g.drawImage(
    dGradient(W, hz + 2, dark ? ['#0a1626', '#0c1a2c'] : ['#6acaf0', '#8ad8f4', '#a8e2f6', '#bfe8f6'].map(c)),
    0,
    0,
  )
  if (!dark) {
    // The sky's sun lamp, and its painted clouds.
    g.drawImage(glow(12, '#ffffff', 1.2, 1), 58 - 12, 30 - 12)
    for (const [x, y, rx] of [
      [92, 26, 12],
      [180, 34, 16],
      [36, 44, 10],
    ] as const) {
      ellipse(g, x, y, rx, 2, c('#ffffff'))
      rect(g, x - rx + 3, y + 2, rx * 2 - 6, 1, c('#cfeefa'))
    }
  }
  // The polar peaks, right: snow on their lit faces, blue in the shade.
  for (const [x, top, w] of [
    [196, 46, 26],
    [222, 54, 20],
    [174, 58, 16],
  ] as const) {
    tri(g, x - w, hz, x, top, x, hz, c('#ffffff'))
    tri(g, x, top, x + w, hz, x, hz, c('#7aa0c8'))
    tri(g, x - w, hz, x - w * 0.4, hz - 4, x, hz, c('#c8dcec'))
    tri(g, x - 3, top + 6, x, top, x + 2, top + 8, c('#ffffff'))
  }
  // The canyon's mesas, left: flat tops lit, strata down their faces.
  for (const [x0, x1, top] of [
    [10, 44, 54],
    [40, 62, 60],
    [64, 78, 64],
  ] as const) {
    for (let y = top; y <= hz; y++) {
      const flare = Math.round((y - top) * 0.25)
      rect(g, x0 - flare, y, x1 - x0 + flare * 2, 1, c((y - top) % 5 < 2 ? '#c8603e' : '#e07a4a'))
      rect(g, x1 + flare - 4, y, 4, 1, c('#9a4232'))
    }
    rect(g, x0, top, x1 - x0, 1, c('#ffb07a'))
  }
  // The ground of the biomes running to the court round the shaft: savanna in the middle, the coast at the right.
  g.drawImage(
    dGradient(W, h - hz, dark ? ['#060c18', '#050a14'] : ['#b8d860', '#8ac04a', '#6aa83e'].map(c)),
    0,
    hz,
  )
  if (!dark) {
    for (let x = 0; x < W; x += 3) rect(g, x, hz + ((x * 7) % 5), 1, 1, c('#d8ec7a'))
    rect(g, 168, hz, W - 168, 6, c('#5ad0e0'))
    for (let x = 168; x < W; x += 5) rect(g, x, hz + 2, 3, 1, c('#bff4ff'))
    rect(g, 168, hz + 6, W - 168, 2, c('#f0e0a0'))
  }
  for (const [x, s] of [
    [90, 1],
    [118, 0.8],
    [146, 1.1],
    [30, 0.9],
  ] as const) {
    // Acacias: a thin trunk, a flat wide crown lit on top.
    rect(g, x, hz - 7 * s, 1, 7 * s + 2, c('#5a3a2a'))
    ellipse(g, x, hz - 8 * s, Math.round(8 * s), 2, c('#4a7a2e'))
    rect(g, x - 6 * s, hz - 10 * s, 12 * s, 1, c('#8ac04a'))
  }
  // The court round the shaft's foot, and the shaft itself down through the crown.
  ellipse(g, DX + 30, hz + 18, 30, 6, c('#e8f0f8'))
  ellipseLine(g, DX + 30, hz + 18, 22, 4, c('#3a8ad0'))
  rect(g, SHAFT.x, 0, SHAFT.w, hz + 16, c('#d8eef8'))
  rect(g, SHAFT.x, 0, 2, hz + 16, c('#ffffff'))
  rect(g, SHAFT.x + SHAFT.w - 2, 0, 2, hz + 16, c('#8ab8d8'))
  return cv
}

/** The dome, lit or dark: the Terarium through its glass, a geodesic frame, reflections on the glass. */
function dome(lit: boolean): Canvas {
  const h = KH - DTOP
  const cv = canvas(W, h)
  const g = cv.g
  const view = terarium(!lit)
  // Inside the dome's circle only, and seen through the glass: a little of the sea's blue in everything.
  const cut = shade(W, h, (x, yy) => {
    const d = Math.hypot(x - DX, yy + DTOP - DY)
    if (d > DR) return null
    if (d > DR - 2) return lit ? '#cff4ff' : '#1a3048'
    return '#000000'
  })
  g.drawImage(cut, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.drawImage(view, 0, 0)
  g.globalCompositeOperation = 'source-over'
  const tint = shade(W, h, (x, yy) => {
    const d = Math.hypot(x - DX, yy + DTOP - DY)
    if (d > DR - 2) return null
    // The glass's own blue toward the rim, where we look through more of it.
    return ((d / DR - 0.8) / 0.2) * 0.6 > bayer(x, yy) ? (lit ? '#4aa0d0' : '#0e2238') : null
  })
  g.drawImage(tint, 0, 0)
  // The frame: meridians and rings, steel catching the light or lost in the dark.
  const steel = lit ? '#9ad8ee' : '#18304a'
  const steel2 = lit ? '#e8faff' : '#20405e'
  for (let i = -5; i <= 5; i++) {
    const a = (i / 6) * (Math.PI / 2)
    ellipseLine(
      g,
      DX,
      DY - DTOP,
      Math.abs(Math.sin(a)) * DR,
      DR,
      i < 0 ? steel2 : steel,
      Math.PI,
      Math.PI * 2,
    )
  }
  for (const k of [0.3, 0.55, 0.76, 0.92]) {
    const y = DY - DTOP - k * DR
    const hw = DR * Math.sqrt(1 - k * k)
    ellipseLine(g, DX, y, hw, Math.max(1, hw * 0.07), steel, 0, Math.PI)
  }
  // Long reflections curving over its upper left.
  if (lit)
    for (let k = 0; k < 3; k++)
      ellipseLine(
        g,
        DX,
        DY - DTOP,
        DR - 5 - k * 3,
        DR - 5 - k * 3,
        '#ffffff',
        Math.PI * 1.12,
        Math.PI * (1.3 - k * 0.05),
      )
  return cv
}

// ---------------------------------------------------------------- shot B's picture
/** Inside, dark: the dome's glass and the deep sea over the Terarium's black land, the shaft's foot, the floor. */
function insideDark(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  // Beyond the glass, the deep sea: almost black, a few faint rays from far above.
  g.drawImage(dGradient(W, KHZ + 2, ['#0e284a', '#0a1e3a', '#08172e', '#061226']), 0, 0)
  const rays = canvas(W, KHZ)
  for (const [x, w] of [
    [20, 6],
    [74, 9],
    [128, 5],
  ] as const) {
    const p = pattern(rays.g, '#1a3e66', 3)
    tri(rays.g, x - w, 0, x + w, 0, x - 18 + w * 2, KHZ, p)
    tri(rays.g, x - w, 0, x - 18 + w * 2, KHZ, x - 18 - w * 2, KHZ, p)
  }
  g.drawImage(rays, 0, 0)
  // The dome's frame from inside: rings arcing overhead, meridians climbing to its crown.
  for (const [rx, ry] of [
    [180, 150],
    [230, 116],
  ] as const) {
    ellipseLine(g, 60, KHZ + 40, rx, ry, '#1c3858', Math.PI * 1.02, Math.PI * 1.98)
    ellipseLine(g, 60, KHZ + 41, rx, ry, '#0a1830', Math.PI * 1.02, Math.PI * 1.98)
  }
  for (let i = -3; i <= 4; i++) line(g, 56 + i * 34, KHZ, 56 + i * 10, -30, '#16304e')
  // A floodlight rig over the court, dead: the lights that went out.
  rect(g, 28, 12, 2, KHZ - 12, '#050c18')
  rect(g, 20, 8, 18, 7, '#050c18')
  for (let k = 0; k < 4; k++) rect(g, 22 + k * 4, 10, 2, 3, '#14243a')
  rect(g, 20, 8, 18, 1, '#22405e')
  // The Terarium's far land in the dark: polar peaks, the canyon's mesas, savanna trees, rimmed by the sea's light.
  const land = (x: number) => {
    if (x < 44) return Math.min(KHZ - 26 + Math.abs(x - 14) * 1.3, KHZ - 18 + Math.abs(x - 36) * 1.1)
    // Two mesas: flat tops, steep flanks.
    const mesa = (c: number, top: number, h: number) =>
      Math.max(0, h - Math.max(0, Math.abs(x - c) - top) * 2.2)
    if (x < 90) return KHZ - Math.max(2, mesa(58, 7, 15), mesa(81, 4, 10))
    return KHZ - 2
  }
  for (let x = 0; x < TOWER_X + 4; x++) {
    const y = Math.round(land(x))
    rect(g, x, y, 1, KHZ + 8 - y, '#050c18')
    rect(g, x, y, 1, 1, x < 44 ? '#2e5070' : '#1e3a58')
  }
  for (const [x, s] of [
    [96, 1],
    [106, 0.7],
  ] as const) {
    rect(g, x, KHZ - 10 * s, 1, 10 * s, '#050c18')
    ellipse(g, x, KHZ - 10 * s, Math.round(7 * s), 2, '#050c18')
    rect(g, x - 7 * s, KHZ - 10 * s - 2, 14 * s, 1, '#1e3a58')
  }
  // The floor: dark polished panels in perspective, the shaft's foot mirrored dimly in it.
  g.drawImage(dGradient(W, H - KHZ - 2, ['#0a1424', '#0c182c', '#0e1c32', '#0c1628']), 0, KHZ + 2)
  for (let z = 1; z < 14; z *= 1.3) {
    const y = Math.round(KHZ + 66 / z)
    if (y < H) rect(g, 0, y, W, 1, '#13223a')
  }
  for (let k = -12; k <= 12; k++) line(g, 120 + k * 8, KHZ + 1, 120 + k * 64, H + 60, '#111e34')
  const mirror = shade(W - TOWER_X, 22, (x, y) => (0.35 * (1 - y / 22) > bayer(x, y) ? '#141e36' : null))
  g.drawImage(mirror, TOWER_X, TB)
  // The central shaft's foot: a cylinder of panels, lightest where it faces us; its rings, seams and dead lights.
  const tower = shade(W - TOWER_X, TB, (xx, y) => {
    const x = xx + TOWER_X
    const s = clamp((x - TCX) / TR, -1, 1)
    const face = Math.sqrt(1 - s * s)
    const th = Math.asin(s)
    const seam = Math.abs(((((th * 10) % 1) + 1) % 1) - 0.5) > 0.45
    const ring = y % 22
    if (ring < 2) return ring === 0 ? '#060c18' : '#22385a'
    if (seam) return '#0a1222'
    // Stepped shading round the cylinder, dithered where the steps meet.
    const lv = face * 4 + bayer(x, y) * 0.9
    return ['#0a1222', '#0e182c', '#121e36', '#16243e', '#1a2a46'][Math.min(4, Math.floor(lv))]!
  })
  g.drawImage(tower, TOWER_X, 0)
  rect(g, TOWER_X, 0, 1, TB, '#1e3a5a')
  rect(g, TOWER_X, TB - 5, W - TOWER_X, 5, '#0a1424')
  rect(g, TOWER_X, TB - 5, W - TOWER_X, 1, '#2a4468')
  for (const [x, y] of towerLights()) rect(g, x, y, 2, 1, '#0e2236')
  // The lift door, shut, in its frame.
  const dt = TB - 5 - DOOR.h
  rect(g, DOOR.x - DOOR.w / 2 - 3, dt - 3, DOOR.w + 6, DOOR.h + 3, '#22385a')
  rect(g, DOOR.x - DOOR.w / 2 - 2, dt - 2, DOOR.w + 4, DOOR.h + 2, '#0e182c')
  rect(g, DOOR.x - DOOR.w / 2, dt, DOOR.w, DOOR.h, '#0a1222')
  rect(g, DOOR.x, dt, 1, DOOR.h, '#1a2a44')
  for (const sd of [-1, 1]) rect(g, DOOR.x + sd * 7, dt + 4, 1, DOOR.h - 8, '#101c30')
  rect(g, DOOR.x - 3, dt - 8, 7, 3, '#0e2236')
  return cv
}

/** The status lights round the shaft's foot, a row on each ring band (dead, then teal at the end). */
const towerLights = () => {
  const out: [number, number][] = []
  for (let y = 11; y < TB - 8; y += 22)
    for (let k = -4; k <= 4; k++) {
      const x = Math.round(TCX + Math.sin(k * 0.32) * TR)
      if (x > TOWER_X + 2 && x < W - 1 && !(Math.abs(x - DOOR.x) < DOOR.w / 2 + 6 && y > TB - DOOR.h - 16))
        out.push([x, y])
    }
  return out
}

/** The court's lines on the floor in perspective: its end line at his feet, the halfway line, the centre rings. */
function courtLines(g: G, c: string, k: number) {
  if (k <= 0) return
  const f = 150
  const hc = 33
  const P = (X: number, d: number) => [120 + (f * X) / d, KHZ + (f * hc) / d] as const
  const n = 300
  const shown = Math.round(n * k)
  for (let i = 0; i < shown; i++) {
    const a = (i / n) * Math.PI * 2
    for (const R of [26, 10]) {
      const [x, y] = P(Math.cos(a) * R, 80 + Math.sin(a) * R)
      if (y > TB && y < H) rect(g, Math.round(x), Math.round(y), 1, 1, c)
    }
    const X = lerp(-96, 96, i / n)
    for (const d of [80, f]) {
      const [x, y] = P(X, d)
      rect(g, Math.round(x), Math.round(y), 1, 1, c)
    }
    for (const sx of [-96, 96]) {
      const [x, y] = P(sx, lerp(f, 50, i / n))
      if (y < H) rect(g, Math.round(x), Math.round(y), 1, 1, c)
    }
  }
}

// ---------------------------------------------------------------- moving parts
/** A small fish: a body and a tail, its back dark, its belly catching the light (or all black). */
function fish(g: G, x: number, y: number, dir: number, dark: boolean, lit: string) {
  rect(g, x - 1, y, 3, 1, dark ? '#030810' : '#2a5a7a')
  rect(g, x - 1, y + 1, 3, 1, dark ? '#030810' : lit)
  rect(g, x - 2 * dir, y, 1, 2, dark ? '#030810' : '#1e4a6a')
}

/** A big fish passing close to the camera: a dark body, a lit belly line, a forked tail. */
function bigFish(g: G, x: number, y: number, dir: number, dark: boolean) {
  const body = dark ? '#030810' : '#0e2a44'
  for (let i = 0; i < 16; i++) {
    const hw = Math.round(3.6 * Math.sin((Math.PI * (i + 1)) / 17))
    const px = x + dir * (i - 8)
    rect(g, px, y - hw, 1, hw * 2 + 1, body)
    if (!dark) rect(g, px, y + hw, 1, 1, '#5ab0d8')
  }
  const tx = x - dir * 9
  tri(g, tx, y, tx - dir * 5, y - 4, tx - dir * 4, y, body)
  tri(g, tx, y, tx - dir * 5, y + 4, tx - dir * 4, y, body)
  if (!dark) rect(g, x + dir * 5, y - 1, 1, 1, '#bff4ff')
}

/** A whale gliding over the dome, black against the deep: its size tells how big the place is. */
function whale(g: G, x: number, y: number) {
  const c = '#030810'
  for (let i = 0; i < 74; i++) {
    const u = i / 74
    const hw = Math.round(10 * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.04)) + 1)
    rect(g, x + i, y - hw + Math.round(u * 2), 1, hw * 2, c)
  }
  tri(g, x + 70, y + 1, x + 86, y - 9, x + 82, y + 3, c)
  tri(g, x + 70, y + 1, x + 86, y + 10, x + 82, y - 1, c)
  tri(g, x + 22, y + 7, x + 34, y + 7, x + 38, y + 16, c)
  rect(g, x + 2, y - 8, 30, 1, '#0e2440')
}

/** A Tera crystal spiking out of the floor: a lit facet, a dark one, a white edge up its ridge. */
function crystal(g: G, x: number, y: number, h: number, w: number, lean: number) {
  if (h < 1) return
  const tx = x + Math.round(lean * h)
  const ty = y - h
  tri(g, x - w, y, x, y + 1, tx, ty, '#8af4e8')
  tri(g, x, y + 1, x + w, y, tx, ty, '#2aa0b4')
  tri(g, x - w, y, x - w + 1, y - Math.round(h * 0.3), tx, ty, '#c8fff6')
  line(g, x, y, tx, ty, '#e8ffff')
  rect(g, x - w, y + 1, w * 2 + 1, 1, '#0a3a5a')
}

/** Where he is as he walks out of the lift into the light: three slow steps, his feet and size. */
function kieranAt(t: number, F: { x: number; y: number }) {
  const q = span(t, T_WALK, T_STOP)
  const st = q * 3
  const e = (Math.floor(st) + ease.ioS(st - Math.floor(st))) / 3
  const bob = q < 1 ? Math.abs(Math.sin(st * Math.PI)) * 1.2 : 0
  return { x: lerp(DOOR.x, F.x, e), y: lerp(TB - 4, F.y + 2, e) - bob, s: lerp(0.84, 1, e) }
}

/** How much of the spot's blue is on him: none in the doorway (a silhouette), then less toward the reveal. */
const shadowOn = (t: number) => 0.8 - 0.42 * span(t, T_WALK + 0.2, T_STOP) - 0.2 * span(t, T_ORB, REVEAL)

export const kieranChampion = championCinema<X>({
  id: 'kieran',
  reveal: REVEAL,
  seed: 1019,
  aura: TEAL,
  flash: '#c8fff8',
  sample: {
    trainer: '/trainers/classes/paldea/kieran.png',
    name: 'Champion Kieran',
    lead: 727,
    ace: 1019,
    team: 3,
  },
  extras: [1019],
  setup(st, r) {
    const F = st.L.foe
    st.screenShakes.push(
      [T_OFF[0], 0.2, 1],
      [T_OFF[2], 0.3, 2],
      [T_SPOT, 0.2, 1],
      [T_EYE, 0.3, 2],
      [T_CRYS, 0.4, 2],
    )
    const shoal: Fish[] = []
    for (const [cx, cy, n, dir] of [
      [70, 110, 16, 1],
      [170, 190, 12, -1],
      [60, 250, 14, 1],
    ] as const)
      for (let i = 0; i < n; i++)
        shoal.push({
          x: cx + r.range(-24, 24),
          y: cy + r.range(-10, 10),
          vx: r.range(14, 22) * dir,
          ph: r() * 6,
        })
    // The crystals round his feet: an ellipse of them, each breaking the floor in its turn, leaning outward.
    const crystals: Crystal[] = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + 0.15
      const near = Math.sin(a)
      return {
        a,
        h: near > 0.2 ? r.range(9, 17) : r.range(18, 34),
        w: r.int(2, 4),
        at: T_CRYS + r.range(0, 0.28),
        lean: Math.cos(a) * 0.35,
      }
    })
    // The cracks racing out across the floor from his feet to where each crystal breaks through.
    const cracks = crystals.map((c) => {
      const end = crystalAt(c, F)
      const pts: [number, number][] = []
      for (let k = 0; k <= 6; k++) {
        const q = k / 6
        pts.push([
          lerp(F.x, end.x, q) + (k && k < 6 ? r.range(-3, 3) : 0),
          lerp(F.y + 2, end.y, q) + (k && k < 6 ? r.range(-1, 1) : 0),
        ])
      }
      return pts
    })
    return {
      buf: canvas(W, H),
      fbuf: canvas(W, H),
      sea: seaColumn(rng(10191)),
      domeLit: dome(true),
      domeDark: dome(false),
      inside: insideDark(),
      shadow: canvas(W, H),
      hydra: canvas(96, 100),
      shoal,
      big: [
        { x: -30, y: 60, vx: 120, ph: 0 },
        { x: 270, y: 150, vx: -100, ph: 1 },
      ],
      whale: { x: -96, y: 20 },
      bubbles: new Particles(),
      motes: new Particles(),
      crystals,
      cracks,
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    s.bubbles.update(dt)
    s.motes.update(dt)
    // The shoal swims on; when the first lights die, it bolts.
    for (const f of s.shoal) {
      const spook = t > T_OFF[0] ? 4 : 1
      f.x += f.vx * spook * dt
      f.y += Math.sin(t * 3 + f.ph) * 6 * dt - (t > T_OFF[0] ? 16 * dt : 0)
    }
    for (const f of s.big) f.x += f.vx * dt
    // Bubbles rising past the camera in shot A; dust drifting in the spotlight in shot B.
    if (t < T_CUT && r() < 0.5)
      s.bubbles.add({
        x: r.range(0, W),
        y: H + 4,
        vy: -r.range(30, 90),
        vx: r.range(-4, 4),
        life: 2.5,
        size: r() < 0.3 ? 2 : 1,
        shape: 'bubble',
        colors: ['#bff0ff', '#8ad8f0'],
        core: '#ffffff',
      })
    if (t > T_SPOT && r() < 0.35) {
      const y = r.range(8, 96)
      s.motes.add({
        x: lerp(222, F.x, y / 98) + r.range(-16, 16),
        y,
        vx: r.range(-3, 3),
        vy: r.range(-4, 4),
        life: r.range(1, 2),
        size: 1,
        shape: 'px',
        colors: ['#3a6a98', '#8ab8e0', '#3a6a98'],
      })
    }
    if (t > T_CUT) s.whale.x += 50 * dt
    // The eye igniting: a spit of red sparks off the shadow's head.
    if (within(t, T_EYE, T_EYE + dt)) {
      const e = eyeAt(F)
      for (let i = 0; i < 14; i++)
        s.fx.add({
          x: e.x,
          y: e.y,
          vx: r.range(-50, 50),
          vy: r.range(-50, 20),
          drag: 3,
          life: r.range(0.2, 0.4),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', '#ff6a5a', '#c82a3a'],
        })
    }
    // The crystals: a spray of teal shards as each one breaks the floor.
    for (const c of s.crystals)
      if (within(t, c.at, c.at + dt)) {
        const p = crystalAt(c, F)
        for (let i = 0; i < 6; i++)
          s.fx.add({
            x: p.x,
            y: p.y,
            vx: r.range(-50, 50),
            vy: -r.range(30, 90),
            ay: 240,
            life: r.range(0.3, 0.55),
            size: 1,
            shape: r() < 0.3 ? 'plus' : 'px',
            colors: [...TEAL],
          })
      }
    // The Tera Orb's light gathering: teal motes drawn into his hands.
    if (t > T_ORB && t < REVEAL) {
      const o = orbAt(s.p.trainer, F)
      for (let i = 0; i < 2; i++) {
        const a = r() * Math.PI * 2
        const d = r.range(30, 60)
        s.fx.add({
          x: o.x + Math.cos(a) * d,
          y: o.y + Math.sin(a) * d * 0.7,
          home: { x: o.x, y: o.y, k: 500 },
          life: 0.5,
          size: 1,
          shape: r() < 0.3 ? 'plus' : 'px',
          colors: [...TEAL],
        })
      }
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    if (t < T_CUT) drawDescent(b, s, t)
    else drawInside(b, s, t)
    const sh = screenShake(t, s.screenShakes)
    if ((sh.x || sh.y) && k >= 1) rect(g, 0, 0, W, H, '#03060c')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_DOOR + 0.15) return
    const F = s.L.foe
    const sh = screenShake(t, s.screenShakes)
    const p = kieranAt(t, F)
    const x = Math.round(p.x) + sh.x
    const y = Math.round(p.y) + sh.y
    if (t < T_WALK + 0.15) {
      // In the doorway: only his shape against the lift's light.
      drawSprite(g, s.p.trainer, x, y, { sx: p.s, sy: p.s, sil: '#02040a' })
    } else {
      // Out in the spot, in front of him and above: its cold edge along his top, the rest of him in its blue. The
      // lift's light behind him still rims his sides until its door shuts.
      const rim = 1 - span(t, T_SHUT - 0.2, T_SHUT)
      if (rim > 0) {
        drawSprite(g, s.p.trainer, x - 1, y, { sx: p.s, sy: p.s, sil: '#6a9ac8' })
        drawSprite(g, s.p.trainer, x + 1, y, { sx: p.s, sy: p.s, sil: '#6a9ac8' })
      }
      drawSprite(g, s.p.trainer, x, y - 1, { sx: p.s, sy: p.s, sil: '#a8d0f0' })
      drawSprite(g, s.p.trainer, x, y, { sx: p.s, sy: p.s, tint: { color: '#081428', a: q8(shadowOn(t)) } })
    }
    // The Tera Orb in his hands: a teal light that swells to the reveal.
    if (t > T_ORB) {
      const o = orbAt(s.p.trainer, F)
      const q = span(t, T_ORB, REVEAL)
      const rr = Math.round(6 + 12 * q)
      g.drawImage(glow(rr, '#7af0e0', 1.5, q8(0.45 + 0.4 * q)), o.x - rr + sh.x, o.y - rr + sh.y)
      ellipse(g, o.x + sh.x, o.y + sh.y, 2, 2, '#e8ffff')
      rect(g, o.x - 1 + sh.x, o.y - 1 + sh.y, 1, 1, '#ffffff')
    }
  },
  front(g, s, t, k) {
    // The near crystals stand in front of him, and go with the rest of the place as it dissolves.
    const F = s.L.foe
    const sh = screenShake(t, s.screenShakes)
    if (t > T_CRYS && k > 0) {
      const fb = s.fbuf.g
      fb.clearRect(0, 0, W, H)
      for (const c of s.crystals) {
        if (Math.sin(c.a) <= 0.2) continue
        const gr = ease.outBack(span(t, c.at, c.at + 0.18), 2)
        if (gr <= 0) continue
        const p = crystalAt(c, F)
        crystal(fb, p.x, p.y, Math.round(c.h * gr), c.w, c.lean)
      }
      dissolve(g, s.fbuf, k, sh.x, sh.y)
    }
    // The last band of the dome dying, the spot's clunk, the crystals breaking out: short cold flashes.
    if (within(t, T_OFF[2], T_OFF[2] + 0.06)) screenFlash(g, '#bff4ff', 0.25)
    if (within(t, T_SPOT, T_SPOT + 0.08)) screenFlash(g, '#8ab8e8', 0.25)
    if (within(t, T_CRYS, T_CRYS + 0.08)) screenFlash(g, '#7af0e0', 0.3)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.8, { freq: 300, type: 'lowpass', vol: 0.06 }),
        tone(55, 1.7, { type: 'sine', vol: 0.06 })
      ),
    ],
    ...[0.3, 0.55, 0.9].map(
      (at, i) => [at, () => tone(700 + i * 260, 0.06, { type: 'sine', vol: 0.02, slide: 500 })] as const,
    ),
    ...T_OFF.map(
      (at, i) =>
        [
          at,
          () => (
            tone(110 - i * 15, 0.2, { type: 'square', vol: 0.05, slide: -40 }),
            hiss(0.15, { freq: 260, vol: 0.06 })
          ),
        ] as const,
    ),
    [T_CUT, () => tone(41, 1.2, { type: 'sine', vol: 0.08 })],
    [
      T_DOOR,
      () => (
        tone(1318, 0.5, { type: 'sine', vol: 0.025 }),
        tone(988, 0.7, { type: 'sine', vol: 0.025, at: 0.18 })
      ),
    ],
    [T_DOOR + 0.12, () => hiss(0.4, { freq: 1600, type: 'bandpass', vol: 0.02 })],
    [
      T_SPOT,
      () => (tone(66, 0.4, { type: 'square', vol: 0.06, slide: -20 }), hiss(0.25, { freq: 500, vol: 0.07 })),
    ],
    ...[0, 1, 2].map(
      (i) =>
        [
          T_WALK + 0.2 + i * 0.27,
          () => (
            tone(120, 0.08, { type: 'triangle', vol: 0.05 }),
            tone(120, 0.08, { type: 'triangle', vol: 0.015, at: 0.14 })
          ),
        ] as const,
    ),
    [T_SHUT, () => hiss(0.3, { freq: 1400, type: 'bandpass', vol: 0.015 })],
    [T_WARP, () => tone(62, 0.6, { type: 'sawtooth', vol: 0.03, slide: -18 })],
    [
      T_EYE,
      () => (
        tone(1500, 0.18, { type: 'square', vol: 0.02, slide: -900 }),
        hiss(0.6, { freq: 160, vol: 0.06 })
      ),
    ],
    [
      T_ORB,
      () => (
        tone(880, 0.7, { type: 'sine', vol: 0.03 }),
        tone(1320, 0.6, { type: 'sine', vol: 0.02, at: 0.1 })
      ),
    ],
    [T_CRACK, () => hiss(0.25, { freq: 2600, type: 'highpass', vol: 0.03 })],
    ...[0, 1, 2, 3].map(
      (i) => [T_CRYS + i * 0.08, () => tone(1568 + i * 196, 0.12, { type: 'sine', vol: 0.025 })] as const,
    ),
    [
      REVEAL,
      () => (
        hiss(0.5, { freq: 3200, slide: -2600, vol: 0.07 }),
        tone(659, 0.6, { type: 'triangle', vol: 0.04 }),
        tone(988, 0.6, { type: 'triangle', vol: 0.03, at: 0.05 })
      ),
    ],
  ],
})

type S = ChampionState<X>

/** The Tera Orb, held at his chest on the picture as it stands at the end. */
const orbAt = (key: string, F: { x: number; y: number }) => {
  const sz = spriteSize(key)
  return { x: Math.round(F.x - sz.w * 0.16), y: Math.round(F.y + 2 - sz.h * 0.6) }
}

/** His shadow on the shaft: left of him (the spot is front right), bigger as he comes toward the light. */
function shadowAt(t: number, F: { x: number; y: number }) {
  const p = kieranAt(t, F)
  const q = span(p.s, 0.84, 1)
  return { x: Math.round(p.x - 14 - q * 10), s: Math.round(lerp(0.96, 1.18, q) * 50) / 50 }
}

/** Where Hydrapple stands once it has stepped out of the shadow, against the shaft behind him. */
const hydraAt = (F: { x: number; y: number }) => ({ x: F.x - 32, y: TB + 1 })
/** Its eye, on its head at the top of its long neck. */
const eyeAt = (F: { x: number; y: number }) => {
  const sz = spriteSize(HYDRAPPLE)
  const a = hydraAt(F)
  return { x: Math.round(a.x - sz.w / 2 + sz.w * 0.44), y: Math.round(a.y - sz.h + sz.h * 0.13) }
}
const crystalAt = (c: Crystal, F: { x: number; y: number }) => ({
  x: Math.round(F.x + Math.cos(c.a) * 40),
  y: Math.round(F.y + 3 + Math.sin(c.a) * 10),
})

/** A silhouette at a scale, cached (the shadow grows in steps of a fiftieth). */
const scaledSil = (key: string, sc: number) => {
  const sil = silhouette(key, '#040812')
  if (!sil) return null
  return cached(`kieran-sh|${key}|${sc}|${sil.width}`, () => {
    const c = canvas(Math.round(sil.width * sc), Math.round(sil.height * sc))
    c.g.drawImage(sil, 0, 0, c.width, c.height)
    return c
  })
}

/** Shot A: down through the sea to the dome; its lights dying band by band. */
function drawDescent(b: G, s: S, t: number) {
  const cam = camK(t)
  b.drawImage(s.sea, 0, -cam)
  // Which bands are still lit: each stutters out on its clunk.
  const on = BANDS.map((_, i) => stutterOff(t, T_OFF[i]!, i))
  // The dome's light in the water round it, in stepped rings, one fewer as each band goes out.
  const lit = on.filter((v) => v > 0).length
  for (let i = 0; i < lit; i++)
    ellipse(
      b,
      DX,
      DY - cam,
      DR + 4 + (lit - i) * 5,
      DR + 4 + (lit - i) * 5,
      ['#0e3a62', '#13486e', '#185678'][i]!,
    )
  // A lift capsule's light running down the shaft, until the power dies.
  if (t < T_OFF[0]) {
    const y = Math.round(lerp(30, DTOP, (t * 0.7) % 1) - cam)
    rect(b, SHAFT.x + 2, y, SHAFT.w - 4, 6, '#fff6c8')
    rect(b, SHAFT.x + 3, y + 1, SHAFT.w - 6, 4, '#ffe08a')
  }
  b.drawImage(s.domeDark, 0, DTOP - cam)
  BANDS.forEach(([y0, y1], i) => {
    if (on[i]! > 0) b.drawImage(s.domeLit, 0, y0 - DTOP, W, y1 - y0, 0, y0 - cam, W, y1 - y0)
  })
  // In the dead dome, one cold point of light is left, down on the court: the spot to come.
  if (t > T_OFF[2] + 0.14) {
    const x = DX + 30
    const y = THZ + 16 - cam
    b.drawImage(glow(5, '#3a6aa8', 1.2, 0.75), x - 5, y - 5)
    rect(b, x, y, 1, 1, '#bfe0ff')
  }
  // The shoal, lit by the dome while it shines, black once it's dark; big fish sweeping past the camera.
  const dark = t > T_OFF[1]
  for (const f of s.shoal) {
    const x = Math.round((((f.x + 10) % (W + 20)) + W + 20) % (W + 20)) - 10
    fish(b, x, Math.round(f.y - cam), Math.sign(f.vx), dark, f.y > 220 ? '#bff4ff' : '#8ad8f0')
  }
  for (const f of s.big) bigFish(b, Math.round(f.x), Math.round(f.y), Math.sign(f.vx), dark)
  s.bubbles.draw(b)
}

/** Shot B: the dark inside, the lift's light, the spot, his shadow and Hydrapple, the crystals and the court's lines. */
function drawInside(b: G, s: S, t: number) {
  const F = s.L.foe
  b.drawImage(s.inside, 0, 0)
  // Over the glass: the whale's shadow gliding by, fish.
  whale(b, Math.round(s.whale.x), s.whale.y)
  for (const f of s.shoal.slice(0, 12)) {
    const x = Math.round((((f.x * 0.4) % (TOWER_X + 20)) + TOWER_X + 20) % (TOWER_X + 20)) - 10
    if (x < TOWER_X - 2) fish(b, x, Math.round(4 + (f.y % 34)), Math.sign(f.vx), true, '#000000')
  }
  // The spotlight: a beam from high on the right, its light on the shaft behind him, its pool on the floor.
  const on = flickerOn(t, T_SPOT, 3)
  if (on > 0) {
    b.drawImage(spotBeam(), 0, 0)
    b.drawImage(litWall(), LIT.x - LIT.rx, LIT.y - LIT.ry)
    b.drawImage(pool(), F.x - 34, F.y + 2 - 10)
  }
  // His shadow on the shaft, growing as he comes; warping into Hydrapple's.
  if (on > 0 && t > T_WALK) {
    const sc = s.shadow.g
    sc.clearRect(0, 0, W, H)
    const sa = shadowAt(Math.min(t, T_STOP), F)
    const m = ease.ioS(span(t, T_WARP, T_EYE))
    const him = scaledSil(s.p.trainer, sa.s)
    if (him && m < 1) dissolve(sc, him, 1 - m, sa.x - Math.round(him.width / 2), TB - 4 - him.height)
    const a = hydraAt(F)
    const hs = Math.round(lerp(0.84, 1.06, m) * 50) / 50
    const hyd = scaledSil(HYDRAPPLE, hs)
    if (hyd && m > 0)
      dissolve(sc, hyd, m, Math.round(lerp(sa.x, a.x - 6, m) - hyd.width / 2), TB - 4 - hyd.height)
    const amp = 2.5 * pulse(t, T_WARP, T_EYE + 0.1)
    if (amp > 0.3) wobble(b, s.shadow, W, 0, TB, t, amp, 5, 14)
    else b.drawImage(s.shadow, 0, 0)
  }
  // The lift door sliding open on its light, which spills out across the floor; then shutting behind him. Drawn over
  // the shadow: a shadow can't darken a light.
  const open =
    ease.outC(span(t, T_DOOR + 0.1, T_DOOR + 0.45)) * (1 - ease.inQ(span(t, T_SHUT, T_SHUT + 0.25)))
  if (open > 0) {
    const hw = Math.round((DOOR.w / 2) * open)
    const top = TB - 5 - DOOR.h
    rect(b, DOOR.x - hw, top, hw * 2, DOOR.h, '#5a88b8')
    rect(b, DOOR.x - hw + 2, top + 2, Math.max(0, hw * 2 - 4), DOOR.h - 2, '#8ab4dc')
    rect(b, DOOR.x - hw + 4, top + 4, Math.max(0, hw * 2 - 8), DOOR.h - 4, '#a8cae8')
    rect(b, DOOR.x - hw, top, hw * 2, 1, '#e8f4ff')
    const p = pattern(b, '#3a5a84', 8)
    tri(b, DOOR.x - hw, TB, DOOR.x + hw, TB, DOOR.x + hw * 1.8, TB + 18, p)
    tri(b, DOOR.x - hw, TB, DOOR.x + hw * 1.8, TB + 18, DOOR.x - hw * 1.3, TB + 18, p)
  }
  // The eye opening in the shadow, red.
  if (t > T_EYE && t < T_OUT + 0.4) {
    const e = eyeAt({ x: F.x - 6, y: F.y })
    const q = span(t, T_EYE, T_EYE + 0.12)
    b.drawImage(glow(6, '#a01a2a', 1.2, q8(0.8 * q)), e.x - 6, e.y - 6)
    rect(b, e.x - 1, e.y, 3, 1, '#ff5a4a')
    rect(b, e.x, e.y, 1, 1, '#ffffff')
  }
  // The shaft's lights coming back on, in his teal only.
  const back = flickerOn(t, T_ORB + 0.1, 4)
  if (back > 0) for (const [x, y] of towerLights()) rect(b, x, y, 2, 1, (x + y) % 3 ? '#2aa8b8' : '#7af0e0')
  // The court's lines lighting in his colour, running round from his end.
  const lines = flickerOn(t, T_ORB + 0.05, 7)
  if (lines > 0) {
    courtLines(b, '#1a6a7a', span(t, T_ORB + 0.05, T_ORB + 0.35))
    courtLines(b, '#5ae0d8', span(t, T_ORB + 0.15, T_ORB + 0.55) * 0.999)
  } else courtLines(b, '#13263a', 1)
  // Hydrapple stepping out of the shadow: dark, the spot's cold rim on it; teal creeping into it from the Orb.
  if (t > T_OUT) {
    const a = hydraAt(F)
    const q = span(t, T_OUT, T_OUT + 0.3)
    const teal = span(t, T_ORB, REVEAL)
    const hc = s.hydra
    hc.g.clearRect(0, 0, hc.width, hc.height)
    const bx = hc.width / 2
    const by = hc.height - 1
    drawSprite(hc.g, HYDRAPPLE, bx + 1, by, { sil: teal > 0.2 ? '#4ac8c8' : '#3a5a88' })
    drawSprite(hc.g, HYDRAPPLE, bx, by - 1, { sil: '#7a9ac8' })
    drawSprite(hc.g, HYDRAPPLE, bx, by, { tint: { color: '#050c1a', a: q8(0.85 - 0.3 * teal) } })
    dissolve(b, hc, q, Math.round(a.x - bx), Math.round(a.y - by))
    const e = eyeAt(F)
    rect(b, e.x - 1, e.y, 3, 1, '#ff5a4a')
  }
  // Cracks racing out across the floor from his feet, glowing teal; then the crystals bursting up at their ends.
  if (t > T_CRACK) {
    const q = span(t, T_CRACK, T_CRYS + 0.1)
    for (const c of s.cracks) {
      const n = Math.max(2, Math.round(c.length * q))
      for (let i = 1; i < n; i++) {
        line(b, c[i - 1]![0], c[i - 1]![1], c[i]![0], c[i]![1], '#2aa8b8')
        if (i === n - 1 && q < 1) rect(b, c[i]![0], c[i]![1], 1, 1, '#e8ffff')
      }
    }
  }
  for (const c of s.crystals) {
    if (Math.sin(c.a) > 0.2) continue
    const gr = ease.outBack(span(t, c.at, c.at + 0.18), 2)
    if (gr <= 0) continue
    const p = crystalAt(c, F)
    crystal(b, p.x, p.y, Math.round(c.h * gr), c.w, c.lean)
  }
  // The Orb's light on the floor round him, pulsing out.
  if (t > T_ORB) {
    const q = span(t, T_ORB, REVEAL)
    b.drawImage(glow(34, '#14485a', 1.2, q8(0.7 * q)), F.x - 34, F.y + 2 - 34)
    burstRing(b, F.x, F.y - 30, ((t - T_ORB) % 0.45) / 0.45, 44, 1, '#2aa8b8')
  }
  s.motes.draw(b)
}

/** The spotlight's beam: a wedge from high on the right down to his mark, two steps of dither (cached). */
let beamC: Canvas | null = null
function spotBeam(): Canvas {
  if (beamC) return beamC
  const c = canvas(W, H)
  const g = c.g
  for (const [k, lv] of [
    [1, 3],
    [0.55, 6],
  ] as const) {
    const p = pattern(g, '#4a7ab0', lv)
    const cx0 = 226
    const cx1 = 174
    const w0 = 7 * k
    const w1 = 28 * k
    tri(g, cx0 - w0, -4, cx0 + w0, -4, cx1 + w1, 100, p)
    tri(g, cx0 - w0, -4, cx1 + w1, 100, cx1 - w1, 100, p)
  }
  return (beamC = c)
}

/** The spot's light where it lands on the shaft behind him: a soft-edged oval, brighter at its heart (cached). */
let wallC: Canvas | null = null
function litWall(): Canvas {
  return (wallC ??= shade(LIT.rx * 2 + 1, LIT.ry * 2 + 1, (x, y) => {
    const d = Math.hypot((x - LIT.rx) / LIT.rx, (y - LIT.ry) / LIT.ry)
    const wy = y + LIT.y - LIT.ry
    if (d >= 1 || wy >= TB - 5 || x + LIT.x - LIT.rx < TOWER_X + 1) return null
    // Its rings and seams still show through the light.
    if (wy % 22 === 0) return '#0e1a30'
    const v = 1 - d * d
    if (v > 0.6) return bayer(x, y) < 0.25 ? '#3a5c8c' : '#30507e'
    if (v > 0.3) return bayer(x, y) < (v - 0.3) * 3.3 ? '#30507e' : '#243e66'
    return v * 3.3 > bayer(x, y) ? '#243e66' : null
  }))
}

/** The pool of light on the floor at his mark (cached). */
let poolC: Canvas | null = null
function pool(): Canvas {
  return (poolC ??= shade(69, 21, (x, y) => {
    const d = Math.hypot((x - 34) / 34, (y - 10) / 10)
    if (d >= 1) return null
    const v = 1 - d
    if (v > 0.55) return '#6a9ac8'
    if (v > 0.3) return bayer(x, y) < (v - 0.3) * 4 ? '#6a9ac8' : '#4a7aa8'
    return v * 3.3 > bayer(x, y) ? '#2e5280' : null
  }))
}
