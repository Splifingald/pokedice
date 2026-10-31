// Cynthia's entrance (docs/54), on the battle stage: the Champion's hall of Sinnoh's League at night, dark marble and
// violet light, its stained-glass windows telling the region's myths. The camera tracks slowly along the colonnade to
// the dais as her theme's piano begins: three low notes light the lake guardians' windows one by one, then a fast run
// lights the gold ring inlaid in the floor round the dais, note by note, and the great rose window behind it glows, a
// woman's shape standing still against it. A roar; Garchomp streaks round her in a sonic blur, behind her, in front
// of her, three times, faster each time, and each pass that tears by in front of her lights one more of the myths:
// time's diamond, space's pearl, the orb of the world turned over. It leaps over her and slams down at her side; the
// three lights pour into the rose window and the Original One's wheel blazes gold behind her head like a halo, her
// hair and coat settling, still poised, as she is revealed.
import { fxSound, hiss, tone } from '@/audio/sfx'
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
  Particles,
  pattern,
  rect,
  shade,
  softEllipse,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteKey, spriteSize } from '../../../sprites'
import { H, quad, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dissolve, pulse, tri } from '../kit'

const REVEAL = 4.7
/** The camera's track along the colonnade to the dais. */
const T_PAN0 = 0.1
const T_PAN1 = 1.75
const PAN = 150
/** The lake guardians' windows, one low note each; then the run round the floor's ring. */
const T_LAKES = [0.35, 0.68, 1.0] as const
const T_RUN0 = 1.12
const T_RUN1 = 1.6
const RUN_NOTES = 12
/** Garchomp: its roar, its laps round her, its leap over her and its landing at her side. */
const T_ROAR = 1.72
const T_LAP0 = 1.9
const T_LAP1 = 3.4
const LAP_TURNS = 5.5 * Math.PI
const T_LAND = 3.86
/** The myths' light pouring into the rose window; the wheel blazing. */
const T_POUR0 = 3.98
const T_HALO = 4.32

/** The floor's line (the wall's foot), the dais's centre and Garchomp's track round it. */
const FLOOR = 80
const DAIS = { x: 173, y: 97 }
const TRACK = { rx: 94, ry: 21, y: 92 }
/** Where Garchomp lands, at her side. */
const SIDE = { x: 102, y: 98 }

const MARBLE = ['#07050c', '#0d0915', '#140e20', '#1c142c', '#261c3a', '#33274c', '#45375f'] as const
const GOLD = ['#fff6c8', '#ffd86a', '#d8a030', '#8a5a18', '#3a2410'] as const

interface Win {
  /** Its centre on the wall (world x), its colours light to dark, its emblem. */
  x: number
  c: readonly [string, string, string, string]
  sign: 'gem' | 'diamond' | 'pearl' | 'orb'
}
/** The lake guardians' windows (knowledge, emotion, willpower), then the three great myths. */
const LAKES: Win[] = [
  { x: -108, c: ['#fff6c8', '#ffd84a', '#c8901e', '#4a300a'], sign: 'gem' },
  { x: -62, c: ['#ffe0f0', '#ff8ac8', '#c84a8a', '#4a1430'], sign: 'gem' },
  { x: -16, c: ['#e0f0ff', '#6ab0ff', '#2a62c8', '#0a1a4a'], sign: 'gem' },
]
const MYTHS: Win[] = [
  { x: 30, c: ['#e8f4ff', '#8ab8ff', '#3a6ad8', '#101e5a'], sign: 'diamond' },
  { x: 76, c: ['#fff0f8', '#ffaad8', '#d0609a', '#4a1434'], sign: 'pearl' },
  { x: 122, c: ['#fff4c0', '#f0c040', '#b8501e', '#3a0a10'], sign: 'orb' },
]
const WIN = { top: 9, bottom: 66, hw: 9 }
const ROSE = { x: 177, y: 35, r: 21 }
const PILLARS = [-131, -85, -39, 7, 53, 99, 143, 210, 240] as const
const WALL_X0 = -PAN - 10
/** The columns close to the camera: one ends framing the left edge, the other slides past during the track. */
const NEAR_X = 20

// ---------------------------------------------------------------------------------------------------------------- noise
function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), sx)
  const b = lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), sx)
  return lerp(a, b, sy)
}
const fbm = (x: number, y: number, seed: number) =>
  (noise(x, y, seed) * 4 + noise(x * 2.1, y * 2.1, seed + 1) * 2 + noise(x * 4.3, y * 4.3, seed + 2)) / 7
const ramp = (v: number, x: number, y: number, R: readonly string[] = MARBLE) =>
  R[clamp(Math.floor(clamp(v) * (R.length - 1) + bayer(x, y)), 0, R.length - 1)]!

/** Marble's veins: thin pale lines wandering through it where a warped stripe pattern crosses zero. */
function vein(x: number, y: number, seed: number) {
  const w = fbm(x / 22, y / 22, seed) * 9
  const v = Math.abs(Math.sin(x * 0.06 + y * 0.11 + w))
  return v < 0.05 ? 2 : v < 0.12 ? 1 : 0
}

// ---------------------------------------------------------------------------------------------------------------- the hall
/** A window's shape: a lancet (half-width hw, its pointed top at `top`), true inside. */
const inArch = (dx: number, y: number, hw: number, top: number, bottom: number) => {
  if (y > bottom || y < top) return false
  const ah = hw * 1.6
  if (y >= top + ah) return Math.abs(dx) <= hw
  // A lancet: two arcs meeting in a point at the top.
  const e = (top + ah - y) / ah
  return Math.abs(dx) <= hw * Math.sqrt(1 - e * e) * (1 - 0.35 * e) + 0.3
}

/** The back wall, unlit: marble, its pillars, the windows' dark glass, the rose window's dark tracery. */
function wall(): Canvas {
  const w = W + PAN + 10
  const cv = shade(w, FLOOR + 1, (cx, y) => {
    const x = cx + WALL_X0
    // A dado at the foot of the wall, a cornice at its top.
    if (y >= FLOOR - 8) return y === FLOOR - 8 ? MARBLE[5] : y === FLOOR - 7 ? MARBLE[3] : ramp(0.18, x, y)
    if (y < 6) return y === 5 ? MARBLE[5] : ramp(0.12, x, y)
    const vv = vein(x, y, 5)
    const base = 0.24 + 0.1 * fbm(x / 40, y / 30, 9) + 0.06 * (y / FLOOR)
    return vv === 2 ? MARBLE[4] : vv === 1 ? ramp(base + 0.1, x, y) : ramp(base, x, y)
  })
  const g = cv.g
  const X = (x: number) => x - WALL_X0
  for (const win of [...LAKES, ...MYTHS]) frame(g, X(win.x))
  rose(g, X(ROSE.x), 'dark')
  for (const px of PILLARS) pillar(g, X(px))
  return cv
}

/** A window's surround and its dark glass, unlit. */
function frame(g: G, cx: number) {
  const { top, bottom, hw } = WIN
  for (let y = top - 3; y <= bottom + 2; y++)
    for (let dx = -hw - 3; dx <= hw + 3; dx++) {
      const inner = inArch(dx, y, hw, top, bottom)
      const outer = inArch(dx, y, hw + 3, top - 3, bottom + 2)
      if (inner) rect(g, cx + dx, y, 1, 1, glassAt(dx, y, null))
      else if (outer) rect(g, cx + dx, y, 1, 1, dx < 0 ? MARBLE[5] : MARBLE[3])
    }
  // The sill.
  rect(g, cx - hw - 4, bottom + 2, hw * 2 + 9, 2, MARBLE[6])
  rect(g, cx - hw - 4, bottom + 4, hw * 2 + 9, 1, MARBLE[1])
}

/** A pane's colour at (dx, y) in a window: leaded in diamonds, the glass dark or lit in its colours. */
function glassAt(dx: number, y: number, c: Win['c'] | null) {
  const u = dx + y
  const v = dx - y + 60
  const lead = u % 6 === 0 || v % 6 === 0
  if (lead) return c ? '#1a0e1e' : '#05030a'
  const pane = hash(Math.floor(u / 6), Math.floor(v / 6), 77)
  if (!c) return pane > 0.8 ? '#231a3a' : pane > 0.4 ? '#191230' : '#130e26'
  // Lit: brighter at the top and down its middle, each pane its own shade.
  const k =
    0.95 -
    0.45 * ((y - WIN.top) / (WIN.bottom - WIN.top)) -
    0.25 * (Math.abs(dx) / WIN.hw) +
    (pane - 0.5) * 0.35
  return k > 0.72 ? c[0] : k > 0.45 ? c[1] : k > 0.22 ? c[2] : c[3]
}

/** A window lit: its glass glowing, its emblem in the middle. */
function litWindow(win: Win): Canvas {
  return cached(`cyn-win|${win.x}`, () => {
    const { top, bottom, hw } = WIN
    const cv = canvas(hw * 2 + 1, bottom + 1)
    const g = cv.g
    for (let y = top; y <= bottom; y++)
      for (let dx = -hw; dx <= hw; dx++)
        if (inArch(dx, y, hw, top, bottom)) rect(g, hw + dx, y, 1, 1, glassAt(dx, y, win.c))
    emblem(g, hw, 38, win)
    return cv
  })
}

/** The window's emblem: the lake guardians' gems; time's diamond, space's pearl, the turned world's orb. */
function emblem(g: G, x: number, y: number, win: Win) {
  const [l, m, d] = win.c
  // A dark roundel behind it, so it reads on the glass.
  ellipse(g, x, y, 6, 6, '#140a18')
  if (win.sign === 'gem') {
    // A red gem, as each guardian wears on its brow.
    tri(g, x - 4, y, x + 4, y, x, y - 5, '#ff5a6a')
    tri(g, x - 4, y, x + 4, y, x, y + 4, '#a01e3a')
    rect(g, x - 1, y - 2, 2, 1, '#ffd8e0')
    ellipseLine(g, x, y, 6, 6, m)
  } else if (win.sign === 'diamond') {
    tri(g, x - 4, y, x + 4, y, x, y - 6, l)
    tri(g, x - 4, y, x + 4, y, x, y + 6, m)
    rect(g, x - 1, y - 3, 1, 2, '#ffffff')
    line(g, x - 4, y, x + 4, y, d)
  } else if (win.sign === 'pearl') {
    ellipse(g, x, y, 4, 4, m)
    ellipse(g, x - 1, y - 1, 2, 2, l)
    rect(g, x - 2, y - 2, 1, 1, '#ffffff')
    ellipseLine(g, x, y, 6, 6, l)
  } else {
    ellipse(g, x, y, 4, 4, m)
    rect(g, x - 4, y - 1, 9, 1, '#5a0a14')
    rect(g, x - 4, y + 1, 9, 1, '#5a0a14')
    rect(g, x - 1, y - 3, 2, 1, l)
    ellipseLine(g, x, y, 6, 6, '#e0b040')
  }
}

/**
 * The rose window behind the dais: a round of glass and tracery round the Original One's wheel (a ring, four spokes,
 * a jewel at its heart). Dark, glowing violet behind her shape, or blazing gold.
 */
function rose(g: G, cx: number, state: 'dark' | 'violet' | 'gold') {
  const lit = state === 'gold'
  const { y: cy, r } = ROSE
  for (let dy = -r - 3; dy <= r + 3; dy++)
    for (let dx = -r - 3; dx <= r + 3; dx++) {
      const d = Math.hypot(dx, dy)
      if (d > r + 3) continue
      let c: string
      if (d > r) c = dx + dy < 0 ? MARBLE[6] : MARBLE[3]
      else {
        // Twelve petals of glass round a ring; the wheel's ring and spokes in gold (or dark brass).
        const a = Math.atan2(dy, dx)
        const petal = Math.abs(Math.sin(a * 6)) < 0.12 && d > r * 0.55
        const ring = Math.abs(d - r * 0.55) < 1.2
        const spoke = d < r * 0.95 && (Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2)
        const hub = d < 3.2
        if (hub) c = lit ? (d < 1.5 ? '#ffffff' : '#7ac8ff') : '#2a3450'
        else if (ring || spoke) c = lit ? (d < r * 0.55 ? GOLD[0] : GOLD[1]) : '#16101e'
        else if (petal) c = lit ? GOLD[3] : '#06040a'
        else if (lit) c = ramp(0.95 - (d / r) * 0.6, cx + dx, cy + dy, [GOLD[3], GOLD[2], GOLD[1], GOLD[0]])
        else if (state === 'violet')
          c = ramp(0.85 - (d / r) * 0.55, cx + dx, cy + dy, ['#2a1a4a', '#4a2e7a', '#7a54b8', '#a888e0'])
        else c = d < r * 0.55 ? '#1a1430' : (dx + dy) % 5 === 0 ? '#211a34' : '#140f24'
      }
      rect(g, cx + dx, cy + dy, 1, 1, c)
    }
}
const roseLit = (state: 'violet' | 'gold') =>
  cached(`cyn-rose|${state}`, () => {
    const cv = canvas(ROSE.r * 2 + 7, ROSE.y + ROSE.r + 4)
    rose(cv.g, ROSE.r + 3, state)
    return cv
  })

/** A column of polished marble: a base and capital, its shaft lit on the left, fluted, shaded on the right. */
function pillar(g: G, cx: number) {
  const hw = 6
  for (let y = 6; y < FLOOR - 7; y++)
    for (let dx = -hw; dx <= hw; dx++) {
      const u = (dx + hw) / (hw * 2)
      const flute = Math.abs(dx) % 3 === 0 && Math.abs(dx) < hw
      const v = u < 0.15 ? 0.85 : u < 0.4 ? 0.6 : u < 0.7 ? 0.42 : 0.22
      rect(g, cx + dx, y, 1, 1, flute ? ramp(v - 0.18, cx + dx, y) : ramp(v, cx + dx, y))
    }
  // Capital and base: wider bands, lit on top.
  for (const [y, h] of [
    [6, 4],
    [FLOOR - 13, 6],
  ] as const) {
    rect(g, cx - hw - 2, y, hw * 2 + 5, h, MARBLE[4])
    rect(g, cx - hw - 2, y, hw * 2 + 5, 1, MARBLE[6])
    rect(g, cx - hw - 2, y + h - 1, hw * 2 + 5, 1, MARBLE[1])
    rect(g, cx + hw, y + 1, 3, h - 2, MARBLE[2])
  }
  // A gold band round the capital.
  rect(g, cx - hw - 1, 9, hw * 2 + 3, 1, GOLD[3])
}

/** The floor: black marble, its veins, the dais (a low round step) and the gold ring round it, unlit. */
function floor(): Canvas {
  const w = W + PAN + 10
  const cv = shade(w, H - FLOOR, (cx, fy) => {
    const x = cx + WALL_X0
    const y = fy + FLOOR
    const vv = vein(x * 0.6, y * 2.2, 15)
    const near = (y - FLOOR) / (H - FLOOR)
    const v = 0.06 + 0.1 * near + 0.08 * fbm(x / 50, y / 12, 19)
    return vv === 2 ? MARBLE[3] : ramp(v, x, y)
  })
  const g = cv.g
  const X = (x: number) => x - WALL_X0
  const Y = (y: number) => y - FLOOR
  // The dais: a low disc of paler marble, its front edge a lit lip.
  ellipse(g, X(DAIS.x), Y(DAIS.y) + 2, 40, 9, MARBLE[1])
  ellipse(g, X(DAIS.x), Y(DAIS.y), 40, 9, MARBLE[3])
  ellipse(g, X(DAIS.x), Y(DAIS.y), 36, 7, MARBLE[2])
  ellipseLine(g, X(DAIS.x), Y(DAIS.y), 40, 9, MARBLE[5], 0.1, Math.PI - 0.1)
  // The ring's inlay, dark brass until the run lights it.
  ringPts().forEach(([x, y]) => rect(g, X(x), Y(y), 2, 1, '#2a1e14'))
  return cv
}

/** The gold ring round the dais, as points around it (the run lights them in order, from behind her round to the front). */
const ringPts = () =>
  cached('cyn-ring', () => {
    const pts: [number, number][] = []
    const n = 120
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 - (i / n) * Math.PI * 2
      pts.push([Math.round(DAIS.x + Math.cos(a) * 66), Math.round(DAIS.y + Math.sin(a) * 14)])
    }
    return pts
  })

/** Columns close to the camera, black against the hall, a violet rim on their lit side. */
function nearPillars(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  for (const x of [NEAR_X, NEAR_X + 134]) {
    const hw = 13
    // A dark cylinder: a violet rim on its left catching the hall's light, a sheen, then shade.
    for (let dx = -hw; dx <= hw; dx++) {
      const u = (dx + hw) / (hw * 2)
      const c =
        u < 0.06
          ? '#4a3870'
          : u < 0.14
            ? '#1c1430'
            : u < 0.3
              ? '#120c20'
              : u < 0.36
                ? '#1a1228'
                : u < 0.7
                  ? '#0a0612'
                  : '#050309'
      rect(g, x + dx, 0, 1, H, c)
    }
    // Fluting.
    for (let dx = -hw + 5; dx < hw - 2; dx += 4) rect(g, x + dx, 12, 1, H - 32, '#06040a')
    for (const [y, h] of [
      [0, 10],
      [H - 20, 20],
    ] as const) {
      rect(g, x - hw - 4, y, hw * 2 + 9, h, '#07050c')
      rect(g, x - hw - 4, y === 0 ? h - 1 : y, hw * 2 + 9, 1, '#3a2a58')
      rect(g, x - hw - 4, y === 0 ? h - 2 : y + 1, hw * 2 + 9, 1, '#120c1e')
      rect(g, x - hw - 4, y, 1, h, '#2a1e40')
    }
  }
  return cv
}

// ---------------------------------------------------------------------------------------------------------------- motion
type X = {
  buf: Canvas
  wb: Canvas
  refl: Canvas
  fbuf: Canvas
  tmp: Canvas
  ghost: Canvas
  wall: Canvas
  floor: Canvas
  near: Canvas
  dust: Particles
  cracks: [number, number][][]
}
type S = ChampionState<X>

/** The camera's offset: the hall slides left under it as it tracks right to the dais. */
const panAt = (t: number) => PAN * (1 - ease.ioS(span(t, T_PAN0, T_PAN1)))

/** Garchomp's angle on its track, speeding up lap by lap (0: far right; π/2: in front of her; 3π/2: behind her). */
const lapU = (u: number) => LAP_TURNS * (0.55 * u + 0.45 * u * u)
const thetaAt = (t: number) => lapU(span(t, T_LAP0, T_LAP1))
/** When it tears by in front of her: π/2, 5π/2, 9π/2 along its track. */
const PASSES = [0.5, 2.5, 4.5].map((k) => {
  // Solve 0.55u + 0.45u² = θ / LAP_TURNS for u.
  const q = (k * Math.PI) / LAP_TURNS
  const u = (-0.55 + Math.sqrt(0.55 * 0.55 + 4 * 0.45 * q)) / (2 * 0.45)
  return T_LAP0 + u * (T_LAP1 - T_LAP0)
})

/** Garchomp at t: where its feet are, how big (smaller behind her), which way it faces, whether it is behind her. */
function chomp(t: number) {
  if (t < T_LAP0) return null
  if (t < T_LAP1) {
    const a = thetaAt(t)
    const sn = Math.sin(a)
    // Depth: 0.72 at the back of the track, 1 at its front.
    const k = 0.86 + 0.14 * sn
    return {
      x: DAIS.x + Math.cos(a) * TRACK.rx,
      y: TRACK.y + sn * TRACK.ry,
      k,
      flip: sn < 0,
      behind: sn < 0,
      v: (thetaAt(t + 0.01) - a) / 0.01,
      a,
    }
  }
  if (t < T_LAND) {
    // The leap: from behind her, over her head, down at her side.
    const q = span(t, T_LAP1, T_LAND)
    const p = leapAt(q)
    // It springs from behind her: behind her until it is over her head.
    return { x: p.x, y: p.y, k: lerp(0.72, 1, q), flip: false, behind: q < 0.22, v: 0, a: 0 }
  }
  return { x: SIDE.x, y: SIDE.y, k: 1, flip: false, behind: false, v: 0, a: 0 }
}

/** Where its leap has it, `q` 0..1: rising fast, hanging over her head, then dropping like a stone at her side. */
function leapAt(q: number) {
  const e = q < 0.5 ? ease.outQ(q * 2) * 0.5 : 0.5 + ease.inC((q - 0.5) * 2) * 0.5
  return quad({ x: DAIS.x, y: TRACK.y - TRACK.ry }, { x: 142, y: -12 }, SIDE, e)
}

/** How hard the wind of its passing blows her coat and hair: a gust at each pass, the landing, settling by the reveal. */
function windAt(t: number) {
  let w = t > T_LAP0 && t < T_LAP1 ? 0.6 : 0
  for (const p of PASSES) w = Math.max(w, 3.4 * Math.exp(-Math.abs(t - p) * 4.5) * (t > p - 0.05 ? 1 : 0.3))
  w = Math.max(w, 2 * Math.exp(-Math.abs(t - T_LAND) * 5) * (t > T_LAND ? 1 : 0))
  return w * (1 - span(t, T_HALO, REVEAL - 0.08))
}

/** How much light falls on her: a little more with each myth lit beside her, then the halo's. */
const litAt = (t: number) =>
  0.1 * PASSES.reduce((a, p) => a + span(t, p, p + 0.3), 0) + 0.7 * span(t, T_POUR0, REVEAL - 0.05)

/** When each window lights: the lakes by their notes, the myths by Garchomp's passes. */
const lightAt = (i: number) => (i < 3 ? T_LAKES[i]! : PASSES[i - 3]!)

export const cynthiaChampion = championCinema<X>({
  id: 'cynthia',
  reveal: REVEAL,
  seed: 445,
  aura: ['#ffffff', '#ffe8a8', '#a070e0', '#2a1040'],
  flash: '#fff4dc',
  sample: {
    trainer: '/trainers/classes/sinnoh/champion-cynthia.png',
    name: 'Champion Cynthia',
    lead: 442,
    ace: 445,
    team: 3,
  },
  extras: [445],
  setup(st, r) {
    st.screenShakes.push(
      ...PASSES.map((p, i) => [p, 0.25, 1 + i] as [number, number, number]),
      [T_LAND, 0.5, 4],
      [T_HALO, 0.3, 1],
    )
    return {
      buf: canvas(W, H),
      wb: canvas(W, FLOOR + 1),
      refl: canvas(W, H - FLOOR),
      fbuf: canvas(W, H),
      tmp: canvas(120, 120),
      ghost: canvas(W, H),
      wall: wall(),
      floor: floor(),
      near: nearPillars(),
      dust: new Particles(),
      cracks: crackLines(r),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.dust.update(dt)
    const c = chomp(t)
    const off = panAt(t)
    // Its feet tearing up the dust as it runs; speed lines streaming off it; sparks where its claws bite at the turns.
    if (c && t < T_LAP1) {
      const sp = c.v / 6
      if (r() < 0.6)
        s.dust.add({
          x: c.x + off + r.range(-8, 8),
          y: c.y - r.range(0, 3),
          vx: r.range(-20, 20) - Math.sin(c.a) * 30 * sp,
          vy: -r.range(4, 14),
          drag: 1.5,
          life: r.range(0.3, 0.6),
          size: r.int(1, 2),
          size1: 4,
          shape: 'smoke',
          colors: ['#4a3a5a', '#2e2440', '#1c142c'],
          light: '#5a4a6a',
        })
      // (Behind her, they stay behind her: drawn with the hall.)
      if (r() < 0.7)
        (c.behind ? s.dust : s.fx).add({
          x: c.x + off + r.range(-20, 20),
          y: c.y - r.range(10, 50) * c.k,
          vx: Math.sin(c.a) * 260 * sp,
          vy: 0,
          life: 0.18,
          size: 1,
          shape: 'streak',
          trail: 0.06,
          colors: ['#ffffff', '#c8b0ff', '#6a4aa8'],
        })
      if (Math.abs(Math.cos(c.a)) > 0.95 && r() < 0.6)
        for (let i = 0; i < 3; i++)
          s.fx.add({
            x: c.x + off,
            y: c.y,
            vx: r.range(-60, 60),
            vy: -r.range(20, 80),
            ay: 260,
            life: r.range(0.2, 0.4),
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#ffd86a', '#c8901e'],
          })
    }
    // The sonic boom of each pass: a burst of grit out from where it tore by.
    for (const p of PASSES)
      if (within(t, p, p + dt)) {
        const q = chomp(p)!
        for (let i = 0; i < 24; i++) {
          const a = r.range(Math.PI, Math.PI * 2)
          const v = r.range(60, 160)
          s.fx.add({
            x: q.x + off,
            y: q.y - 4,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v * 0.4,
            drag: 2.4,
            life: r.range(0.3, 0.6),
            size: r.int(1, 2),
            shape: 'sq',
            colors: ['#ffffff', '#c8b0ff', '#5a4a6a'],
          })
        }
      }
    // The landing: chips of marble flying, grit skidding out low across the floor (the ring of dust is drawn).
    if (within(t, T_LAND, T_LAND + dt)) {
      for (let i = 0; i < 30; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: SIDE.x + sd * r.range(4, 26),
          y: SIDE.y + r.range(-1, 3),
          vx: sd * r.range(80, 220),
          vy: -r.range(0, 16),
          drag: 3,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: 'sq',
          colors: ['#8a7aa8', '#5a4a78', '#2e2440'],
        })
      }
      for (let i = 0; i < 20; i++)
        s.fx.add({
          x: SIDE.x + r.range(-16, 16),
          y: SIDE.y,
          vx: r.range(-90, 90),
          vy: -r.range(60, 160),
          ay: 380,
          life: r.range(0.4, 0.8),
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#45375f', '#261c3a', '#140e20'],
        })
    }
    // The halo's motes: gold drifting up round her.
    if (t > T_HALO - 0.1 && r() < 0.6)
      s.fx.add({
        x: ROSE.x + r.range(-30, 30),
        y: ROSE.y + r.range(-10, 40),
        vx: r.range(-6, 6),
        vy: -r.range(8, 22),
        life: r.range(0.8, 1.4),
        size: 1,
        shape: r() < 0.3 ? 'star' : 'px',
        colors: [GOLD[0], GOLD[1], GOLD[2]],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const off = Math.round(panAt(t))
    // The wall, then everything lit on it, composed once a frame: the floor reflects it.
    const w = s.wb.g
    w.drawImage(s.wall, WALL_X0 + off, 0)
    lights(w, t, off)
    b.drawImage(s.wb, 0, 0)
    b.drawImage(s.floor, WALL_X0 + off, FLOOR)
    // The polished floor gives back the wall upside down, fainter the farther from it.
    reflect(s, b)
    pools(b, t, off)
    inlay(b, t, off)
    drawCracks(b, s, t, off)
    // The landing's ring of dust racing out over the marble, thinning as it goes.
    const dq = span(t, T_LAND, T_LAND + 0.5)
    if (dq > 0 && dq < 1) {
      const e = ease.outC(dq)
      for (let i = 0; i < 3; i++)
        dring(
          b,
          SIDE.x + off,
          SIDE.y + 1,
          Math.round(lerp(12, 80, e) - i * 4),
          Math.round(lerp(3, 14, e) - i),
          i ? '#3a2e52' : '#6a5a8a',
          (1 - dq) * (1 - i * 0.25),
        )
    }
    // Her reflection in the marble, and Garchomp's.
    mirrorFigures(b, s, t, off)
    s.dust.draw(b)
    const c = chomp(t)
    if (c && c.behind) drawChomp(b, s, t, c, off)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, MARBLE[0])
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    const off = Math.round(panAt(t))
    const sh = screenShake(t, s.screenShakes)
    // A shape against the rose window, unmoving; the wind of Garchomp's passes in her coat and hair; lit by the halo.
    const lit = litAt(t)
    const x = s.L.foe.x + off + sh.x
    const y = s.L.foe.y + 2 + sh.y
    if (x > W + 40) return
    figure(g, s, x, y, t, windAt(t), lit)
  },
  front(g, s, t, k) {
    if (k <= 0) return
    const f = s.fbuf.g
    f.clearRect(0, 0, W, H)
    const off = Math.round(panAt(t))
    const c = chomp(t)
    if (c && !c.behind) drawChomp(f, s, t, c, off)
    // Columns in close, sliding past faster than the hall.
    f.drawImage(s.near, Math.round(panAt(t) * 1.6) - 140 - NEAR_X, 0)
    const sh = screenShake(t, s.screenShakes)
    dissolve(g, s.fbuf, k, sh.x, sh.y)
    // Each pass's sonic boom, the landing, the halo (never closer than 0.34 s, nor to the reveal's own).
    PASSES.forEach((p, i) => {
      if (within(t, p, p + 0.07)) screenFlash(g, MYTHS[i]!.c[1], 0.18 + 0.06 * i)
    })
    if (within(t, T_LAND, T_LAND + 0.08)) screenFlash(g, '#e8dcff', 0.3)
    if (within(t, T_HALO, T_HALO + 0.1)) screenFlash(g, GOLD[0], 0.4)
  },
  sounds: [
    [
      0.05,
      () => (
        tone(55, 1.4, { type: 'sine', vol: 0.06 }),
        hiss(1.5, { freq: 300, type: 'lowpass', vol: 0.03 })
      ),
    ],
    // Three low notes, a window each.
    ...T_LAKES.map((at, i) => [at, () => piano([220, 207.65, 196][i]!, 0.9, 0.05)] as const),
    // The run tumbling down, every note lighting more of the ring.
    ...Array.from({ length: RUN_NOTES }, (_, i) => {
      const f = [1175, 1109, 1047, 880, 831, 784, 659, 622, 587, 523, 494, 440][i]!
      return [lerp(T_RUN0, T_RUN1, i / (RUN_NOTES - 1)), () => piano(f, 0.35, 0.03)] as const
    }),
    [T_RUN1 + 0.08, () => (piano(110, 1.4, 0.06), piano(164.8, 1.4, 0.04), piano(207.6, 1.4, 0.035))],
    [T_ROAR, () => fxSound('legend.roar')],
    ...PASSES.map(
      (p, i) =>
        [
          p - 0.06,
          () => (
            hiss(0.3, { freq: 600, slide: 3200, vol: 0.06 + 0.02 * i }),
            tone(65 - i * 5, 0.4, { type: 'sine', vol: 0.12 + 0.03 * i, slide: -20 }),
            piano([440, 523, 659][i]!, 0.6, 0.035)
          ),
        ] as const,
    ),
    [T_LAP0 + 0.1, () => hiss(1.4, { freq: 900, slide: 1800, vol: 0.03 })],
    [T_LAP1, () => hiss(0.3, { freq: 400, slide: 2400, vol: 0.06 })],
    [
      T_LAND,
      () => (
        fxSound('impact.hit'),
        tone(45, 0.6, { type: 'sine', vol: 0.16, slide: -15 }),
        hiss(0.6, { freq: 200, type: 'lowpass', vol: 0.12 })
      ),
    ],
    [
      T_POUR0,
      () =>
        [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.02, at: i * 0.06 })),
    ],
    [
      T_HALO,
      () => (
        piano(220, 1.6, 0.05),
        piano(277.2, 1.6, 0.04),
        piano(329.6, 1.6, 0.04),
        piano(440, 1.6, 0.04),
        hiss(0.6, { freq: 3800, vol: 0.03 })
      ),
    ],
    [T_HALO + 0.1, () => fxSound('legend.roar')],
    [
      REVEAL,
      () => (
        tone(55, 0.8, { type: 'sine', vol: 0.14 }),
        piano(110, 1.2, 0.05),
        hiss(0.5, { freq: 1600, vol: 0.05 })
      ),
    ],
  ],
})

/** A piano-like note: a bright attack dying away quickly, its octave under it. */
function piano(f: number, dur: number, vol: number) {
  tone(f, dur, { type: 'triangle', vol, attack: 0.003 })
  tone(f * 2, dur * 0.4, { type: 'sine', vol: vol * 0.35, attack: 0.002 })
  tone(f / 2, dur, { type: 'sine', vol: vol * 0.5, attack: 0.004 })
}

// ---------------------------------------------------------------------------------------------------------------- drawing
/** Each window lit in its turn, the rose window's glow behind her, and the myths' light pouring into it. */
function lights(g: G, t: number, off: number) {
  const all = [...LAKES, ...MYTHS]
  all.forEach((win, i) => {
    const at = lightAt(i)
    const q = span(t, at, at + 0.18)
    if (q <= 0) return
    const im = litWindow(win)
    const x = win.x + off - WIN.hw
    // The light behind the glass spills onto the marble round it.
    g.drawImage(glow(20, win.c[3], 1.2, Math.round(6 * q) / 8), win.x + off - 20, 38 - 20)
    dissolve(g, im, q, x, 0)
    // It flares as it lights.
    const fl = 1 - span(t, at, at + 0.35)
    if (fl > 0) g.drawImage(glow(14, win.c[0], 1.6, Math.round(fl * 8) / 8), win.x + off - 14, 38 - 14)
  })
  // The rose window: a faint violet behind it from the run on (her shape against it), blazing gold at the halo.
  const rx = ROSE.x + off
  const dim = span(t, T_RUN0 + 0.1, T_RUN1 + 0.2)
  if (dim > 0) {
    g.drawImage(glow(34, '#2e1a52', 1, Math.round(dim * 8) / 8), rx - 34, ROSE.y - 34)
    dissolve(g, roseLit('violet'), dim, rx - ROSE.r - 3, 0)
  }
  // The myths' light pours into it: a ribbon of each window's colour arcing up over the hall into the wheel's heart.
  const pour = span(t, T_POUR0, T_HALO)
  if (pour > 0 && t < T_HALO + 0.2)
    MYTHS.forEach((win, i) => {
      const q = ease.inQ(clamp(pour * 1.25 - i * 0.12))
      if (q <= 0) return
      const a = { x: win.x + off, y: 30 }
      const c = { x: lerp(win.x + off, rx, 0.5), y: 4 - i * 3 }
      const b = { x: rx, y: ROSE.y }
      const n = 24
      for (let j = 0; j < n; j++) {
        const u0 = (j / n) * q
        const u1 = ((j + 1) / n) * q
        const p0 = quad(a, c, b, u0)
        const p1 = quad(a, c, b, u1)
        // Its tail thinning, its head white.
        const tail = j / n
        if (tail > 0.2) line(g, p0.x, p0.y + 1, p1.x, p1.y + 1, win.c[2], 3)
        line(
          g,
          p0.x,
          p0.y,
          p1.x,
          p1.y,
          tail > 0.85 ? '#ffffff' : tail > 0.4 ? win.c[0] : win.c[1],
          tail > 0.3 ? 2 : 1,
        )
      }
    })
  const halo = span(t, T_HALO - 0.08, T_HALO + 0.06)
  if (halo > 0) {
    rays(g, rx, ROSE.y, t, halo)
    g.drawImage(glow(34, GOLD[2], 1.1, Math.round(0.75 * halo * 8) / 8), rx - 34, ROSE.y - 34)
    dissolve(g, roseLit('gold'), halo, rx - ROSE.r - 3, 0)
  }
}

/** The wheel's rays: wedges of gold turning slowly round it, dithered thin (drawn once per step of their turn). */
function rays(g: G, x: number, y: number, t: number, k: number) {
  const steps = 16
  // Twelve wedges, alternating long and short: the picture repeats every sixth of a turn.
  const step = Math.floor(((t * 0.4) / ((Math.PI * 2) / 6)) * steps) % steps
  const lv = Math.max(1, Math.round(k * 4))
  const im = cached(`cyn-rays|${step}|${lv}`, () => {
    const R = 96
    const cv = canvas(R * 2 + 1, R * 2 + 1)
    const rot = (step / steps) * ((Math.PI * 2) / 6)
    for (let i = 0; i < 12; i++) {
      const a = rot + (i / 12) * Math.PI * 2
      const len = i % 2 ? 70 : R
      const w = 0.055
      const c = i % 2 ? pattern(cv.g, GOLD[3], (5 * lv) / 4) : pattern(cv.g, GOLD[2], lv)
      tri(
        cv.g,
        R,
        R,
        R + Math.cos(a - w) * len,
        R + Math.sin(a - w) * len,
        R + Math.cos(a + w) * len,
        R + Math.sin(a + w) * len,
        c,
      )
    }
    return cv
  })
  g.drawImage(im, x - 96, y - 96)
}

/** The lit windows' colour on the floor in front of them: pools of dithered light. */
function pools(g: G, t: number, off: number) {
  ;[...LAKES, ...MYTHS].forEach((win, i) => {
    const q = span(t, lightAt(i), lightAt(i) + 0.3)
    if (q <= 0) return
    softEllipse(g, win.x + off, FLOOR + 5, 20, 5, win.c[3], 0.9 * q, 1.2)
    softEllipse(g, win.x + off, FLOOR + 4, 12, 3, win.c[2], 0.6 * q, 1.4)
  })
  const halo = span(t, T_HALO - 0.05, T_HALO + 0.2)
  if (halo > 0) softEllipse(g, ROSE.x + off, FLOOR + 6, 46, 7, GOLD[3], 0.8 * halo, 1.1)
}

/** The ring's gold, lit point by point as the run plays, then shining, a glint running round it. */
function inlay(g: G, t: number, off: number) {
  const pts = ringPts()
  const q = span(t, T_RUN0 - 0.02, T_RUN1 + 0.04)
  if (q <= 0) return
  const n = Math.round(pts.length * q)
  const glint = (t * 70) % pts.length
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i]!
    // The head of the run white, then gold; a glint running round it once it is whole.
    const head = n - i < 6 && q < 1
    const near = Math.abs(i - glint) < 3 && q >= 1
    rect(g, x + off, y, 2, 1, head || near ? '#ffffff' : y > DAIS.y ? GOLD[1] : GOLD[2])
  }
}

/** An ellipse's outline through the dither, only the pixels its strength lets through (dust, a ripple). */
function dring(g: G, cx: number, cy: number, rx: number, ry: number, c: string, k: number) {
  const n = Math.max(24, Math.ceil((rx + ry) * 4))
  g.fillStyle = c
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.round(cx + Math.cos(a) * rx)
    const y = Math.round(cy + Math.sin(a) * ry)
    // The near side of it a little thicker.
    if (bayer(x, y) < k) g.fillRect(x, y, Math.sin(a) > 0 ? 2 : 1, 1)
  }
}

/** The marble cracking under Garchomp's landing: lines splitting out from its feet, lit violet from below. */
function crackLines(r: Rng): [number, number][][] {
  return Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI * (0.05 + (i / 6) * 0.9) * (i % 2 ? 1 : -1) + (i % 2 ? 0 : Math.PI)
    const pts: [number, number][] = [[SIDE.x, SIDE.y]]
    let x = SIDE.x
    let y = SIDE.y
    const len = r.range(16, 34)
    for (let d = 0; d < len; d += 4) {
      x += Math.cos(a) * 4 + r.range(-1.5, 1.5)
      y += Math.sin(a) * 1.2 + r.range(-0.6, 0.6)
      pts.push([Math.round(x), Math.round(y)])
    }
    return pts
  })
}
function drawCracks(g: G, s: S, t: number, off: number) {
  const q = span(t, T_LAND, T_LAND + 0.12)
  if (q <= 0) return
  for (const c of s.cracks) {
    const n = Math.max(2, Math.round(c.length * q))
    for (let i = 1; i < n; i++) {
      line(g, c[i - 1]![0] + off, c[i - 1]![1], c[i]![0] + off, c[i]![1], '#05030a', 1)
      if (t < T_LAND + 0.6) rect(g, c[i]![0] + off, c[i]![1] - 1, 1, 1, '#8a6ad8')
    }
  }
}

/** The wall given back upside down by the floor: dithered, fainter row band by row band. */
function reflect(s: S, g: G) {
  const r = s.refl.g
  r.globalCompositeOperation = 'source-over'
  r.clearRect(0, 0, W, H - FLOOR)
  // Flip by rows: cheap and exact (no transform rounding).
  for (let y = 0; y < H - FLOOR && y < FLOOR; y++) r.drawImage(s.wb, 0, FLOOR - 1 - y, W, 1, 0, y, W, 1)
  r.globalCompositeOperation = 'destination-in'
  for (const [y0, y1, lv] of [
    [0, 12, 7],
    [12, 28, 5],
    [28, 50, 3],
    [50, 80, 1.5],
  ] as const) {
    r.fillStyle = pattern(r, '#000000', lv)
    r.fillRect(0, y0, W, y1 - y0)
  }
  r.globalCompositeOperation = 'source-over'
  g.drawImage(s.refl, 0, FLOOR)
}

/** Her picture (or its shape), drawn row by row, the lower rows (coat, the ends of her hair) blown sideways. */
function figure(g: G, s: S, x: number, y: number, t: number, wind: number, lit: number, flipV = false) {
  const key = s.p.trainer
  const fr = spriteFrame(key)
  if (!fr) return
  const tw = fr.width + 2
  const th = fr.height + 2
  if (s.tmp.width < tw || s.tmp.height < th) {
    s.tmp.width = Math.max(s.tmp.width, tw)
    s.tmp.height = Math.max(s.tmp.height, th)
    s.tmp.g.imageSmoothingEnabled = false
  }
  const b = s.tmp.g
  b.clearRect(0, 0, tw, th)
  // Backlit by the rose window: a violet rim, then gold as the halo blazes; her colours coming up out of the dark.
  const rim = t > T_HALO ? (Math.floor(t * 14) % 2 ? GOLD[1] : GOLD[0]) : t > T_POUR0 ? GOLD[2] : '#9a7ae0'
  const rimSil = silhouette(key, rim)
  if (rimSil && !flipV)
    for (const [ox, oy] of [
      [0, 1],
      [2, 1],
      [1, 0],
    ] as const)
      b.drawImage(rimSil, ox, oy)
  if (lit <= 0) b.drawImage(silhouette(key, '#07050c')!, 1, 1)
  else {
    b.drawImage(fr, 1, 1)
    const dark = Math.round(0.95 * (1 - lit) * 8) / 8
    if (dark > 0) {
      b.globalAlpha = dark
      b.drawImage(silhouette(key, '#0a0612')!, 1, 1)
      b.globalAlpha = 1
    }
  }
  const x0 = Math.round(x - fr.width / 2) - 1
  const y0 = Math.round(y - fr.height) - 1
  for (let row = 0; row < th; row++) {
    // Her head and shoulders still; the coat and hair below them swing more the lower they hang.
    const u = clamp((row / th - 0.3) / 0.7) ** 1.4
    const off = Math.round(wind * u * Math.sin(row / 4.5 - t * 16) + wind * u * 0.8)
    if (flipV) g.drawImage(s.tmp, 0, row, tw, 1, x0 + off, y + (th - 1 - row) - 1, tw, 1)
    else g.drawImage(s.tmp, 0, row, tw, 1, x0 + off, y0 + row, tw, 1)
  }
}

/** Her shape and Garchomp's given back by the floor: drawn upside down under their feet, then dithered thin. */
function mirrorFigures(g: G, s: S, t: number, off: number) {
  const f = s.fbuf.g
  f.clearRect(0, 0, W, H)
  // (After the reveal, as the reveal draws her: still, in her own colours.)
  if (t < REVEAL) figure(f, s, s.L.foe.x + off, s.L.foe.y + 2, t, windAt(t), litAt(t), true)
  else figure(f, s, s.L.foe.x, s.L.foe.y + 2, t, 0, 1, true)
  const c = chomp(t)
  if (c && c.y > FLOOR + 4) {
    const key = spriteKey(445, false)
    const sil = silhouette(key, '#140e24')
    if (sil) {
      const w = Math.round(sil.width * c.k)
      const h = Math.round(sil.height * c.k)
      for (let row = 0; row < h; row++)
        f.drawImage(
          sil,
          0,
          Math.floor(((h - 1 - row) / h) * sil.height),
          sil.width,
          1,
          Math.round(c.x + off - w / 2),
          Math.round(c.y + row),
          w,
          1,
        )
    }
  }
  // Thinned through the dither, and only on the floor.
  f.globalCompositeOperation = 'destination-in'
  f.fillStyle = pattern(f, '#000000', 6)
  f.fillRect(0, 0, W, H)
  f.globalCompositeOperation = 'source-over'
  f.clearRect(0, 0, W, FLOOR)
  g.drawImage(s.fbuf, 0, 0)
  f.clearRect(0, 0, W, H)
}

/**
 * Garchomp: on its track a blur (its sprite stretched along its run, three afterimages trailing it in darkening blue,
 * nothing of it still); in the air a dark shape against the hall; landed, itself, crouched from the impact, then
 * rearing to roar as the halo blazes.
 */
function drawChomp(g: G, s: S, t: number, c: NonNullable<ReturnType<typeof chomp>>, off: number) {
  const key = spriteKey(445, false)
  const z = spriteSize(key)
  if (t < T_LAP1) {
    const x = c.x + off
    // How fast it crosses the screen: at the ends of its track it turns and is seen; between them it is a blur.
    const hs = Math.abs(Math.sin(c.a)) * TRACK.rx * c.v
    const dir = Math.sin(c.a) > 0 ? -1 : 1
    if (hs < 420) {
      const trail = ['#2e2a78', '#1e1a50']
      for (let i = 2; i >= 1; i--) {
        const a = c.a - i * 0.12
        const sn = Math.sin(a)
        if (sn < 0 !== c.behind) continue
        const k = 0.86 + 0.14 * sn
        drawSprite(g, key, DAIS.x + Math.cos(a) * TRACK.rx + off, TRACK.y + sn * TRACK.ry, {
          sx: k,
          sy: k,
          flip: c.flip,
          sil: trail[i - 1],
        })
      }
      drawSprite(g, key, x, c.y, { sx: c.k, sy: c.k, flip: c.flip, tint: { color: '#140c30', a: 0.25 } })
      return
    }
    // Tearing by: afterimages smeared out behind it (dithered thin), itself stretched along its run with its
    // leading edge lit, and streaks trailing off it (its red chest and gold among them).
    const st = Math.min(1, (hs - 420) / 900)
    const w = z.w * c.k
    const h = z.h * c.k
    const gb = s.ghost.g
    gb.clearRect(0, 0, W, H)
    ;['#3a32a0', '#2a2470', '#1e1a50'].forEach((col, i) =>
      drawSprite(gb, key, x - dir * (10 + 12 * i) * (0.5 + st), c.y, {
        sx: c.k * (1 + 0.3 * st),
        sy: c.k,
        flip: c.flip,
        sil: col,
      }),
    )
    dissolve(g, s.ghost, 0.5)
    drawSprite(g, key, x, c.y, {
      sx: c.k * (1 + 0.22 * st),
      sy: c.k * (1 - 0.06 * st),
      flip: c.flip,
      tint: { color: '#140c30', a: 0.375 },
      outline: Math.floor(t * 30) % 2 ? '#b8a8ff' : '#7a6ad8',
    })
    const x0 = x - dir * w * 0.2
    for (let i = 0; i < 9; i++) {
      const fy = c.y - h * (0.12 + 0.72 * (i / 8))
      const len = (40 + 90 * st) * (0.45 + 0.55 * hash(i, Math.floor(t * 30), 5))
      const col =
        i === 5 ? '#e04848' : i === 6 ? '#ffd23a' : i % 3 === 0 ? '#e8e0ff' : i % 2 ? '#7a6ad8' : '#3a2e88'
      line(g, x0, fy, x0 - dir * len, fy, col)
      line(g, x0 - dir * len, fy, x0 - dir * (len + 12), fy, '#2a2060')
    }
    return
  }
  if (t < T_LAND) {
    // Over her head: dark against the hall, a violet rim, afterimages of its leap behind it.
    const q = span(t, T_LAP1, T_LAND)
    ;['#2a2470', '#1e1a50'].forEach((col, i) => {
      const p = leapAt(Math.max(0, q - 0.08 * (i + 1)))
      drawSprite(g, key, p.x + off, p.y, { sx: c.k, sy: c.k, sil: col })
    })
    drawSprite(g, key, c.x + off, c.y, {
      sx: c.k,
      sy: c.k,
      tint: { color: '#0c0818', a: 0.625 },
      outline: Math.floor(t * 20) % 2 ? '#9a7ae0' : '#6a4aa8',
    })
    return
  }
  const land = span(t, T_LAND, T_LAND + 0.3)
  const rear = pulse(t, T_HALO, T_HALO + 0.5)
  const sq = ease.outBack(land, 2.5)
  drawSprite(g, key, c.x + off, c.y, {
    sx: lerp(1.15, 1, sq) - 0.02 * rear,
    sy: lerp(0.8, 1, sq) + 0.06 * rear,
    tint: { color: '#140a24', a: Math.round((0.5 - 0.3 * span(t, T_POUR0, T_HALO)) * 8) / 8 },
    outline: t > T_HALO ? GOLD[2] : '#4a3a7a',
  })
  // Its roar as the halo blazes.
  const hx = c.x + off - Math.round(z.w * 0.28)
  const hy = c.y - Math.round(z.h * 0.78)
  ;['#ffffff', GOLD[1]].forEach((col, i) =>
    burstRing(g, hx, hy, span(t, T_HALO + 0.1 + i * 0.12, T_HALO + 0.6 + i * 0.12), 90, 2, col),
  )
}
