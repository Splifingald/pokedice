// One picture per area, drawn in code (no request): the scenery the team roams on Home, seen from the front, and the
// strip lists cut from its middle. Areas that share a banner share a scene; '#flip' areas see it mirrored. From the
// Visual Lab's home.js (paintOutdoor, paintForest, paintCave), with a desert added for the dunes areas.
import {
  bayer,
  canvas,
  clamp,
  ellipse,
  ellipseLine,
  glow,
  px,
  rect,
  rng,
  shade,
  softEllipse,
  type Canvas,
  type G,
} from '@/fx/pixel'

/** The scene's size in art pixels. */
export const W = 288
export const H = 276

export interface World {
  cv: Canvas
  /** Where the sky meets the land: lists crop around it. */
  horizon: number
  /** Where the team may stand. */
  walk: { x0: number; x1: number; y0: number; y1: number }
  /** Water the swimmers keep to. */
  pond?: { x: number; y: number; rx: number; ry: number; rim: string } | null
  /** Drawn over the team (tall grass along the bottom). */
  fg: Canvas
  /** What moves: motes, glints, ripples, sparks. */
  dyn: (g: G, t: number, self?: World) => void
}

interface Pal {
  sky: string[]
  sun: string
  far: string[]
  hill: string[]
  tree: string[]
  field: string[]
  tuft: string
  flowers: string[]
  cloud: string[]
  mote: string
  pond: string[]
}

const MEADOW: Pal = {
  sky: ['#76bff3', '#8ccbf6', '#a5d8f8', '#bfe4f9', '#d8eef8', '#f1efe6', '#fde4c8'],
  sun: '#fff6d6',
  far: ['#c8d6f0', '#a9bde6', '#93a8d9'],
  hill: ['#bde6a6', '#92d08a', '#6fb978'],
  tree: ['#7cc574', '#55a466', '#3c8457'],
  field: ['#a7de82', '#97d576', '#87cb6b', '#79bf62'],
  tuft: '#5fae55',
  flowers: ['#ffffff', '#ffe36b', '#ff9cc2'],
  cloud: ['#ffffff', '#eaf3fb', '#d3e3f3'],
  mote: '#fff3b0',
  pond: ['#6fb978', '#5aa9e0', '#4a96d4', '#bfe6ff', '#7cc8f0'],
}

const PALS: Record<string, Pal> = {
  meadow: MEADOW,
  dusk: {
    ...MEADOW,
    sky: ['#4e4a8c', '#7a5a9e', '#b2689a', '#e0808a', '#f4a07c', '#ffc890', '#ffe0a8'],
    sun: '#ffe9b0',
    far: ['#b58ab8', '#8d6aa4', '#6c5290'],
    hill: ['#b9b878', '#93a064', '#6f8452'],
    tree: ['#8ba25e', '#66804c', '#4a603e'],
    field: ['#c2bc78', '#b0ae6a', '#9ea060', '#8c9258'],
    tuft: '#77804a',
    flowers: ['#ffe0a8', '#ff9cc2', '#ffffff'],
    cloud: ['#ffe9d0', '#f6c8b8', '#d8a0a8'],
    mote: '#ffd8a0',
  },
  snow: {
    ...MEADOW,
    sky: ['#9cc8ec', '#aed3f0', '#c0ddf3', '#d2e7f6', '#e2eff8', '#eef5fa', '#f6f9fc'],
    sun: '#ffffff',
    far: ['#f4f8fc', '#d6e4f2', '#b9cde6'],
    hill: ['#ffffff', '#e2ecf6', '#c6d6ea'],
    tree: ['#7fa89c', '#5f8f86', '#3f6e6a'],
    field: ['#fbfdff', '#eef4fa', '#e2ebf5', '#d6e2f0'],
    tuft: '#c6d6ea',
    flowers: ['#ffffff', '#d6e4f2', '#9cc8ec'],
    mote: '#ffffff',
    pond: ['#c6d6ea', '#7cc0ea', '#62acdf', '#e6f6ff', '#a8dcf6'],
  },
  haunted: {
    ...MEADOW,
    sky: ['#1e1838', '#2a2048', '#3a2a5a', '#4c346a', '#5e3e78', '#704a84', '#82568e'],
    sun: '#f4f0d8',
    far: ['#4a3c6a', '#3a2f58', '#2e2548'],
    hill: ['#6a7a6a', '#55665a', '#43524a'],
    tree: ['#4a5a50', '#3a4840', '#2c3832'],
    field: ['#7a8478', '#6e786c', '#626c62', '#566058'],
    tuft: '#4f5a50',
    flowers: ['#c8b8e8', '#9a88c8', '#ffffff'],
    cloud: ['#6a5a8a', '#584a78', '#4a3e68'],
    mote: '#c8b8ff',
  },
  volcano: {
    ...MEADOW,
    sky: ['#5a2a3a', '#7a3440', '#a04440', '#c85a3a', '#e07a3a', '#f0a050', '#f8c878'],
    sun: '#ffe0a0',
    far: ['#6a3a3a', '#552c30', '#422228'],
    hill: ['#a0704a', '#86583c', '#6c4430'],
    tree: ['#6a5a3a', '#54462e', '#403622'],
    field: ['#b8885a', '#a87a50', '#986c48', '#885e40'],
    tuft: '#7a5236',
    flowers: ['#ffd070', '#ff8a3d', '#ffffff'],
    cloud: ['#9a7a76', '#806466', '#685056'],
    mote: '#ffb070',
  },
  city: {
    ...MEADOW,
    far: ['#b8c4dc', '#9aa8c4', '#7e8cab'],
    hill: ['#e6e9f0', '#c4cad8', '#a8b0c2'],
    field: ['#d6d9e2', '#cdd1db', '#c4c8d3', '#bbc0cc'],
    tuft: '#b0b6c6',
  },
  // Not in the lab: the dunes areas (Hoenn's desert and the like). Warm sky, sand in bands, sparse dry tufts.
  desert: {
    ...MEADOW,
    sky: ['#7ab8ec', '#92c6ef', '#acd3f0', '#c6dfef', '#dde8ea', '#f1ead8', '#fbdcb0'],
    sun: '#fff4d0',
    far: ['#f2d9a8', '#e6c78e', '#d6b27a'],
    hill: ['#f6dfae', '#ecc98c', '#ddb276'],
    tree: ['#7fb06a', '#5f9656', '#467a46'],
    field: ['#f3d9a2', '#ecce92', '#e4c284', '#dab577'],
    tuft: '#c8a46a',
    flowers: ['#ff9cc2', '#ffe36b', '#ffffff'],
    cloud: ['#ffffff', '#f6f0e4', '#e8dcc8'],
    mote: '#fff3c8',
  },
}

interface SceneSpec {
  pal?: keyof typeof PALS
  pond?: boolean | 'marsh'
  flowers?: number
  fence?: boolean
  peaks?: boolean
  plateau?: boolean
  coast?: boolean
  palms?: boolean
  bridge?: boolean
  moon?: boolean
  graves?: boolean
  volcano?: boolean
  city?: boolean
  dunes?: boolean
  forest?: boolean
  cave?: 'cave' | 'dark' | 'crystal' | 'plant'
}

/** What each banner's scene holds. */
const SCENES: Record<string, SceneSpec> = {
  plains: { pal: 'meadow', pond: true },
  default: { pal: 'meadow', pond: true },
  flowers: { pal: 'meadow', pond: true, flowers: 0.4, fence: true },
  mountains: { pal: 'meadow', pond: true, peaks: true },
  sky: { pal: 'meadow', pond: true, plateau: true },
  snow_mountains: { pal: 'snow', pond: true, peaks: true },
  swamp: { pal: 'meadow', pond: 'marsh' },
  ocean: { pal: 'meadow', coast: true },
  beach: { pal: 'meadow', coast: true, palms: true },
  bridge: { pal: 'meadow', coast: true, bridge: true },
  sunset: { pal: 'dusk', pond: true },
  haunted: { pal: 'haunted', moon: true, graves: true },
  volcano: { pal: 'volcano', volcano: true },
  city: { pal: 'city', city: true },
  dunes: { pal: 'desert', dunes: true },
  forest: { forest: true },
  cave: { cave: 'cave' },
  cave_dark: { cave: 'dark' },
  crystal_cave: { cave: 'crystal' },
  factory: { cave: 'plant' },
}

function ridge(n: number, base: number, amp: number, seed: number, freqs = [0.021, 0.047, 0.11]) {
  const r = rng(seed)
  const ph = freqs.map(() => r() * 6.28)
  return Array.from({ length: n }, (_, x) => {
    let v = 0
    freqs.forEach((f, i) => (v += Math.sin(x * f + ph[i]!) / (i + 1)))
    return Math.round(base - Math.abs(v) * amp)
  })
}

/** A vertical gradient through a palette, dithered between its steps. */
const vgrad = (cols: readonly string[], y: number, x: number, y0: number, y1: number) => {
  const t = clamp((y - y0) / Math.max(1, y1 - y0)) * (cols.length - 1)
  const i = Math.floor(t)
  return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
}

function clouds(g: G, P: Pal, list: [number, number, number][]) {
  for (const [cx, cy, s] of list) {
    const blobs = [
      [-12, 2, 6],
      [-5, -2, 8],
      [4, -3, 7],
      [12, 1, 6],
      [0, 3, 7],
    ].map(([dx, dy, rr]) => [cx + dx! * s, cy + dy! * s, Math.max(2, Math.round(rr! * s))] as const)
    for (const [bx, by, br] of blobs) ellipse(g, bx, by + 1, br, Math.round(br * 0.8), P.cloud[2]!)
    for (const [bx, by, br] of blobs) ellipse(g, bx, by, br, Math.round(br * 0.8), P.cloud[1]!)
    for (const [bx, by, br] of blobs)
      ellipse(g, bx - 1, by - 1, br - 1, Math.round(br * 0.8) - 1, P.cloud[0]!)
  }
}

/** A ring widening on still water. */
function ripple(g: G, p: { x: number; y: number }, t: number, c1: string, c2: string) {
  const k = (t * 0.6) % 1
  ellipseLine(g, p.x + 12, p.y + 2, Math.round(4 + 10 * k), Math.round(1 + 3 * k), k < 0.6 ? c1 : c2)
}

/** A city skyline: blocks of 14–30 px, as a height per column. */
function skyline(hy: number, seed: number) {
  const r = rng(seed)
  const out: number[] = []
  while (out.length < W) {
    const w = r.int(14, 30)
    const h = r.int(14, 54)
    for (let i = 0; i < w; i++) out.push(hy + 8 - h)
  }
  return out.slice(0, W)
}

/** Tall grass along the bottom edge, drawn over the team so they walk through it. */
function foreground(P: Pal | null): Canvas {
  const c = canvas(W, H)
  if (!P) return c
  const g = c.g
  const r = rng(77)
  for (let x = -4; x < W + 4; x += r.int(5, 9)) {
    const h = r.int(5, 11)
    for (let k = 0; k < 4; k++) rect(g, x + k * 2, H - h + (k % 2) * 3, 1, h, k % 2 ? P.hill[2]! : P.tuft)
    rect(g, x + 2, H - h - 1, 1, 1, P.hill[0]!)
  }
  return c
}

/** An outdoor area: sky, a far range, hills with a tree line, the field the team walks on, and its own landmarks. */
function paintOutdoor(S: SceneSpec): World {
  const P = PALS[S.pal ?? 'meadow']!
  const hy = Math.round(H * 0.34)
  const far = S.city
    ? skyline(hy, 31)
    : S.peaks
      ? ridge(W, hy + 4, H * 0.24, 11, [0.016, 0.037, 0.09])
      : S.plateau
        ? ridge(W, hy + 6, H * 0.06, 7)
        : S.dunes
          ? ridge(W, hy + 8, H * 0.09, 23, [0.012, 0.03, 0.06])
          : ridge(W, hy + 2, H * 0.12, 7)
  const hill = S.city
    ? new Array<number>(W).fill(hy + 12)
    : S.dunes
      ? ridge(W, hy + 16, H * 0.04, 29, [0.011, 0.024, 0.05])
      : ridge(W, hy + 12, H * 0.05, 19, [0.018, 0.05, 0.09])
  const coast = !!S.coast
  const seaTop = hy + 4
  const seaBot = hy + 34
  const sunAt = [W * (S.moon ? 0.2 : 0.84), H * 0.07]
  const sunR = H * (S.moon ? 0.09 : 0.17)
  const c = shade(W, H, (x, y) => {
    if (y < far[x]! && !(coast && y >= seaTop)) {
      let col = vgrad(P.sky, y, x, 0, hy + 4)
      if (S.volcano) return col
      const d = Math.hypot(x - sunAt[0]!, y - sunAt[1]!) / sunR
      if (d < 0.55 || (d < 0.8 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0)) col = P.sun
      if (S.moon && d >= 1 && (x * 7 + y * 13) % 97 === 0) col = '#ffffff'
      return col
    }
    if (coast) {
      if (y < seaBot) {
        // The sea: banded blues with lighter wave rows.
        const k = (y - seaTop) / (seaBot - seaTop)
        if ((y + Math.floor(x / 9)) % 6 === 0 && k > 0.2) return '#d8f1ff'
        return k < 0.3 ? '#7cc8f0' : k < 0.65 ? '#5ab4e8' : '#4aa2dc'
      }
      if (y < seaBot + 3) return (x + y) % 3 ? '#fff8e8' : '#bfe8ff'
      return vgrad(['#f6e2b4', '#efd6a2', '#e8ca92', '#ddbd84'], y, x, seaBot, H)
    }
    if (y < hill[x]!) {
      if (S.city) {
        // Buildings: lit and unlit windows in a grid.
        const wx = x % 6
        const wy = (y - far[x]!) % 7
        if (y - far[x]! > 2 && wx > 1 && wx < 4 && wy > 2 && wy < 5)
          return (x * 3 + y) % 5 ? '#e8eefa' : '#ffe7a8'
        return x % 30 < 2 ? P.far[2]! : P.far[1]!
      }
      if (y - far[x]! < 1) return P.far[0]!
      // Snow caps on the high peaks.
      if (S.peaks && far[x]! < hy - 16 && y - far[x]! < 7 + ((x * 5) % 3))
        return y - far[x]! > 6 && (x + y) % 2 ? P.far[0]! : '#ffffff'
      return y > hy + 6 && bayer(x, y) < 0.5 ? P.far[2]! : P.far[1]!
    }
    const top = hill[x]!
    if (y - top < 1) return P.hill[0]!
    if (y - top < 5) return bayer(x, y) < (y - top) / 5 ? P.hill[2]! : P.hill[1]!
    if (S.city && (y % 18 === 0 || (x + Math.floor(y / 18) * 9) % 26 === 0)) return P.field[3]!
    // Dunes: wind ripples across the sand.
    if (S.dunes && (y + Math.round(Math.sin(x * 0.07) * 3)) % 9 === 0) return P.field[3]!
    return vgrad(P.field, y, x, top + 4, H)
  })
  const g = c.g
  const r = rng((S.pal ?? 'meadow').length * 17 + 3 + (S.peaks ? 5 : 0))
  if (S.volcano) {
    // A volcano on the far range, glowing at the crater, smoke drifting off.
    const vx = Math.round(W * 0.68)
    const base = hy + 10
    const top = hy - 58
    for (let y = top; y < base; y++) {
      const half = Math.round(6 + ((y - top) / (base - top)) * 62)
      rect(g, vx - half, y, half * 2, 1, (y + vx) % 7 === 0 ? P.far[1]! : P.far[2]!)
    }
    rect(g, vx - 6, top, 12, 2, '#ff8a3d')
    rect(g, vx - 3, top - 1, 6, 1, '#ffd070')
    for (let k = 0; k < 18; k++) px(g, vx - 2 + Math.round(Math.sin(k) * 3), top + 2 + k * 2, '#ff6a3a')
    clouds(g, P, [
      [vx + 4, top - 12, 0.6],
      [vx + 18, top - 26, 0.8],
      [vx + 38, top - 38, 1],
    ])
  } else
    clouds(
      g,
      P,
      S.plateau
        ? [
            [W * 0.14, H * 0.12, 1.2],
            [W * 0.46, H * 0.06, 0.9],
            [W * 0.64, H * 0.19, 1.1],
            [W * 0.9, H * 0.13, 0.7],
          ]
        : [
            [W * 0.18, H * 0.1, 1],
            [W * 0.52, H * 0.05, 0.7],
            [W * 0.66, H * 0.17, 0.85],
          ],
    )
  if (!coast && !S.city && !S.dunes)
    for (let x = 4; x < W; x += r.int(9, 15)) {
      const y = hill[Math.min(W - 1, x)]! + 1
      const rr = r.int(4, 7)
      ellipse(g, x, y - rr + 2, rr, rr, P.tree[2]!)
      ellipse(g, x - 1, y - rr + 1, rr - 1, rr - 1, P.tree[1]!)
      ellipse(g, x - 2, y - rr, Math.max(1, rr - 3), Math.max(1, rr - 3), P.tree[0]!)
    }
  if (S.dunes)
    // A few cacti on the far dunes.
    for (const fx of [0.12, 0.38, 0.81]) {
      const x = Math.round(W * fx)
      const y = hill[x]! + 2
      rect(g, x - 1, y - 12, 3, 12, P.tree[2]!)
      rect(g, x, y - 12, 1, 11, P.tree[0]!)
      rect(g, x - 4, y - 8, 3, 1, P.tree[2]!)
      rect(g, x - 4, y - 11, 1, 3, P.tree[2]!)
      rect(g, x + 2, y - 6, 3, 1, P.tree[2]!)
      rect(g, x + 4, y - 9, 1, 3, P.tree[2]!)
    }
  if (S.plateau) {
    // Indigo Plateau: the League building on the hill, red roof and a gold door.
    const bx = Math.round(W * 0.5)
    const by = hill[bx]! - 1
    rect(g, bx - 24, by - 16, 48, 16, '#24304f')
    rect(g, bx - 23, by - 15, 46, 15, '#f4ead8')
    for (let i = 0; i < 6; i++)
      rect(g, bx - 26 + i, by - 22 + i, 52 - i * 2, 1, i < 1 ? '#24304f' : '#e2553f')
    rect(g, bx - 4, by - 9, 8, 9, '#ffbe2e')
    rect(g, bx - 18, by - 11, 6, 4, '#5b8def')
    rect(g, bx + 12, by - 11, 6, 4, '#5b8def')
  }
  if (S.fence) {
    // A white picket fence along the meadow.
    const fy = hy + 24
    for (let x = 2; x < W; x += 7) {
      rect(g, x, fy - 6, 2, 8, '#ffffff')
      px(g, x, fy + 2, '#8fb07a')
    }
    rect(g, 0, fy - 4, W, 1, '#ffffff')
    rect(g, 0, fy - 1, W, 1, '#ffffff')
    rect(g, 0, fy, W, 1, '#c8dcc0')
  }
  if (S.bridge) {
    // A wooden bridge across the sea, posts in the water.
    const dy = seaTop + 13
    for (let x = 3; x < W; x += 12) rect(g, x, dy, 2, 12, '#6b4a34')
    rect(g, 0, dy - 1, W, 4, '#a0704a')
    rect(g, 0, dy - 1, W, 1, '#c8945a')
    for (let x = 3; x < W; x += 12) rect(g, x, dy - 7, 2, 6, '#6b4a34')
    rect(g, 0, dy - 7, W, 1, '#c8945a')
  }
  const groundTop = coast ? seaBot + 4 : hy + 16
  for (let i = 0; i < W * 0.7; i++) {
    const x = r.int(0, W - 1)
    const y = r.int(groundTop, H - 1)
    if (S.city) continue
    if (r() < (y - groundTop) / (H - groundTop) + 0.15) {
      const col = coast ? '#d0ae74' : P.tuft
      if (S.dunes && r() < 0.7) continue
      px(g, x, y, col)
      if (!coast) {
        px(g, x - 1, y - 1, col)
        px(g, x + 1, y - 1, col)
      }
      if (!coast && r() < (S.flowers ?? 0.1)) px(g, x, y - 2, r.pick(P.flowers))
      if (coast && r() < 0.05) {
        px(g, x, y, '#ffffff')
        px(g, x + 1, y, '#ff9cc2')
      }
    }
  }
  if (S.graves)
    // Resting stones, in rows on the far field.
    for (let i = 0; i < 7; i++) {
      const x = 30 + i * 38 + r.int(-6, 6)
      const y = groundTop + 6 + (i % 2) * 7
      rect(g, x - 4, y - 9, 8, 10, '#24304f')
      rect(g, x - 3, y - 8, 6, 9, '#a8aeb8')
      rect(g, x - 3, y - 8, 6, 1, '#c8ccd4')
      if (i % 3 === 0) {
        rect(g, x - 1, y - 6, 2, 5, '#7a808c')
        rect(g, x - 2, y - 5, 4, 1, '#7a808c')
      }
    }
  if (S.palms)
    for (const [px0, lean] of [
      [16, 1],
      [W - 18, -1],
    ] as const) {
      // A palm at each edge, leaning in.
      const base = groundTop + 26
      for (let k = 0; k < 44; k++) {
        const x = Math.round(px0 + lean * (k * k) * 0.006)
        rect(g, x - 2, base - k, 4, 1, k % 4 ? '#a0704a' : '#7a5236')
      }
      const tx = Math.round(px0 + lean * 44 * 44 * 0.006)
      const ty = base - 44
      for (const [dx, dy, rx] of [
        [-10, 2, 10],
        [10, 2, 10],
        [-4, -4, 9],
        [6, -3, 9],
      ] as const) {
        ellipse(g, tx + dx, ty + dy, rx, 3, '#3c8457')
        ellipse(g, tx + dx, ty + dy - 1, rx - 2, 2, '#55a466')
      }
      ellipse(g, tx, ty + 3, 3, 3, '#6b4a34')
    }
  const world: World = {
    cv: c,
    horizon: coast ? seaTop + 6 : hy + 4,
    walk: { x0: 22, x1: W - 22, y0: Math.round(groundTop + (H - groundTop) * 0.3), y1: H - 8 },
    fg: foreground(coast || S.city || S.dunes ? null : P),
    dyn: () => {},
  }
  if (S.pond) {
    // A pond on the left where the swimmers swim: reeds round it in a marsh, lily pads and stones elsewhere.
    const marsh = S.pond === 'marsh'
    const C = P.pond
    const pond = {
      x: Math.round(W * 0.26),
      y: Math.round(H * 0.8),
      rx: marsh ? 50 : 44,
      ry: marsh ? 15 : 13,
      rim: C[3]!,
    }
    ellipse(g, pond.x, pond.y + 2, pond.rx + 2, pond.ry + 2, C[0]!)
    ellipse(g, pond.x, pond.y, pond.rx, pond.ry, C[1]!)
    ellipse(g, pond.x + 3, pond.y + 3, pond.rx - 8, pond.ry - 5, C[2]!)
    ellipseLine(g, pond.x, pond.y, pond.rx, pond.ry, C[3]!, Math.PI * 1.05, Math.PI * 1.9)
    if (marsh)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.9 + r() * 1.2)
        const x = Math.round(pond.x + Math.cos(a) * (pond.rx + 1))
        const y = Math.round(pond.y + Math.sin(a) * (pond.ry + 1))
        for (let k = 0; k < 3; k++)
          rect(g, x + k * 2 - 2, y - 6 - (k % 2) * 2, 1, 7 + (k % 2) * 2, k === 1 ? '#3c8457' : '#55a466')
        rect(g, x, y - 9, 1, 2, '#8a5a3a')
      }
    else {
      if (S.pal !== 'snow') {
        for (const [dx, dy] of [
          [-26, 2],
          [22, -4],
          [30, 5],
        ] as const) {
          ellipse(g, pond.x + dx, pond.y + dy, 4, 2, '#5fae55')
          px(g, pond.x + dx + 1, pond.y + dy, C[2]!)
        }
        px(g, pond.x + 22, pond.y - 5, '#ff9cc2')
      }
      for (const [dx, dy, rr] of [
        [-pond.rx - 1, 3, 4],
        [-pond.rx + 6, 9, 3],
        [pond.rx - 2, 6, 5],
      ] as const) {
        ellipse(g, pond.x + dx, pond.y + dy + 1, rr, rr - 1, '#8592ad')
        ellipse(g, pond.x + dx - 1, pond.y + dy, rr - 1, rr - 2, '#c8d0e0')
      }
    }
    world.pond = pond
  }
  world.dyn = (gg, t, self = world) => {
    for (let i = 0; i < 14; i++) {
      const x = ((i * 53.7 + t * (3 + (i % 5))) % (W + 10)) - 5
      const y = H * 0.18 + ((i * 37) % (H * 0.5)) + Math.sin(t * 0.8 + i) * 4
      if ((Math.floor(t * 2 + i) & 3) !== 0) px(gg, x, y, P.mote)
    }
    if (coast)
      for (let i = 0; i < 6; i++) {
        // Glints riding the waves.
        const x = Math.round(((i * 61 + t * 9) % (W + 20)) - 10)
        const y = seaTop + 6 + ((i * 7) % 22)
        if (Math.sin(t * 3 + i) > 0.3) rect(gg, x, y, 3, 1, '#ffffff')
      }
    if (self.pond) ripple(gg, self.pond, t, P.pond[3]!, P.pond[4]!)
  }
  return world
}

function paintForest(): World {
  const hy = Math.round(H * 0.4)
  const c = shade(W, H, (x, y) => {
    if (y < hy) return vgrad(['#9ed8f6', '#c4ecf6', '#e4f6e8'], y, x, 0, H * 0.2)
    return vgrad(['#5fae60', '#56a35a', '#4b9852', '#3f8a4a'], y, x, hy, H)
  })
  const g = c.g
  const r = rng(5)
  // A wall of canopy: three layers of round trees, darker as they recede.
  for (const [base, cols, step] of [
    [H * 0.3, ['#3c8457', '#2f6e49', '#255c3d'], 15],
    [H * 0.36, ['#55a466', '#3c8457', '#2f6e49'], 18],
    [H * 0.42, ['#7cc574', '#55a466', '#3c8457'], 22],
  ] as const)
    for (let x = -10; x < W + 10; x += step + r.int(-3, 3)) {
      const rr = r.int(13, 20)
      const y = Math.round(base - r.int(0, 10))
      rect(g, x - 2, y, 4, Math.round(H * 0.06), '#6b4a34')
      ellipse(g, x, y, rr, rr, cols[2])
      ellipse(g, x - 2, y - 2, rr - 3, rr - 3, cols[1])
      ellipse(g, x - 5, y - 6, Math.max(2, rr - 10), Math.max(2, rr - 11), cols[0])
    }
  // Dappled light on the floor.
  for (let i = 0; i < 26; i++)
    softEllipse(
      g,
      r.int(0, W),
      r.int(Math.round(H * 0.52), H),
      r.int(6, 14),
      r.int(2, 4),
      '#8fd27a',
      0.6,
      0.6,
    )
  for (let i = 0; i < 10; i++) {
    const x = r.int(10, W - 10)
    const y = r.int(Math.round(H * 0.55), H - 6)
    rect(g, x, y, 1, 3, '#f4ead8')
    rect(g, x - 1, y - 1, 3, 1, i % 2 ? '#ff6a5a' : '#ffbe2e')
  }
  return {
    cv: c,
    horizon: Math.round(H * 0.36),
    walk: { x0: 22, x1: W - 22, y0: Math.round(H * 0.6), y1: H - 8 },
    fg: foreground(MEADOW),
    dyn: (gg, t) => {
      // Light motes drifting down through the canopy.
      for (let i = 0; i < 12; i++) {
        const y = ((i * 41 + t * 6) % (H * 0.6)) + H * 0.3
        const x = ((i * 67) % W) + Math.sin(t + i) * 4
        if ((Math.floor(t * 3 + i) & 3) !== 0) px(gg, x, y, '#fff3b0')
      }
    },
  }
}

const CAVE = {
  cave: {
    wall: ['#3a3352', '#4a4166', '#5a507a'],
    floor: ['#7a6e86', '#6e637c', '#625870'],
    drip: '#2c2640',
    gems: ['#8ff0ff', '#ff9ad8'],
    n: 7,
  },
  dark: {
    wall: ['#1e1a2e', '#28223c', '#322a4a'],
    floor: ['#4e465c', '#463e54', '#3e364a'],
    drip: '#16121f',
    gems: ['#6a8cff', '#9a6aff'],
    n: 4,
  },
  crystal: {
    wall: ['#2a3a5e', '#34487a', '#3e5690'],
    floor: ['#6a7aa0', '#5e6e94', '#536288'],
    drip: '#1e2a48',
    gems: ['#8ff0ff', '#c8a0ff', '#ff9ad8'],
    n: 16,
  },
  plant: {
    wall: ['#3a4466', '#46527a', '#56638c'],
    floor: ['#6a7090', '#5e6484', '#535878'],
    drip: '#2a3150',
    gems: ['#ffd23a'],
    n: 7,
  },
}

function paintCave(kind: keyof typeof CAVE): World {
  const plant = kind === 'plant'
  const C = CAVE[kind]
  const hy = Math.round(H * 0.46)
  const c = shade(W, H, (x, y) => (y < hy ? vgrad(C.wall, y, x, 0, hy) : vgrad(C.floor, y, x, hy, H)))
  const g = c.g
  const r = rng(13 + kind.length)
  rect(g, 0, hy, W, 2, C.drip)
  // Stalactites, or pipes in a power plant.
  for (let x = 0; x < W; x += r.int(10, 22)) {
    if (plant) {
      rect(g, x, 0, 5, r.int(20, 60), '#7a86aa')
      rect(g, x + 1, 0, 1, 60, '#a8b4d4')
      continue
    }
    const h = r.int(10, 34)
    for (let k = 0; k < h; k++)
      rect(
        g,
        x - Math.round((1 - k / h) * 4),
        k,
        Math.max(1, Math.round((1 - k / h) * 8)),
        1,
        k % 5 ? C.drip : C.wall[2]!,
      )
  }
  // Crystals (caves) or warning lamps (plant), glowing.
  for (let i = 0; i < C.n; i++) {
    const x = r.int(8, W - 8)
    const y = r.int(Math.round(hy * 0.45), hy - 6)
    const col = C.gems[i % C.gems.length]!
    g.drawImage(glow(10, col, 1.6, kind === 'dark' ? 0.3 : 0.5), x - 10, y - 10)
    for (let k = 0; k < 5; k++)
      rect(g, x - (k > 2 ? 4 - k : k), y - 4 + k, 1 + Math.min(k, 4 - k) * 2, 1, col)
  }
  if (kind === 'crystal')
    for (let i = 0; i < 6; i++) {
      // Crystal clusters on the floor's edge.
      const x = r.int(10, W - 10)
      const y = hy + r.int(4, 12)
      const col = C.gems[i % 3]!
      for (let k = 0; k < 3; k++) rect(g, x + k * 3 - 3, y - 6 + (k % 2) * 3, 2, 7 - (k % 2) * 3, col)
    }
  for (let i = 0; i < 14; i++) {
    const x = r.int(0, W)
    const y = r.int(hy + 8, H)
    ellipse(g, x, y, r.int(3, 7), r.int(2, 3), C.floor[2]!)
    rect(g, x - 2, y - 2, 3, 1, C.floor[0]!)
  }
  let pond: World['pond'] = null
  if (!plant) {
    // An underground pool for the swimmers, with the crystals' colours caught on the water.
    pond = { x: Math.round(W * 0.25), y: Math.round(H * 0.83), rx: 46, ry: 12, rim: '#8fb8f0' }
    ellipse(g, pond.x, pond.y + 2, pond.rx + 2, pond.ry + 2, C.drip)
    ellipse(g, pond.x, pond.y, pond.rx, pond.ry, '#33508f')
    ellipse(g, pond.x + 3, pond.y + 3, pond.rx - 8, pond.ry - 4, '#2a4278')
    ellipseLine(g, pond.x, pond.y, pond.rx, pond.ry, '#8fb8f0', Math.PI * 1.05, Math.PI * 1.9)
    for (let i = 0; i < 5; i++)
      rect(g, pond.x - 30 + i * 14, pond.y - 2 + (i % 2) * 4, 3, 1, C.gems[i % C.gems.length]!)
  }
  return {
    cv: c,
    horizon: hy - 8,
    walk: { x0: 22, x1: W - 22, y0: hy + 24, y1: H - 8 },
    pond,
    fg: canvas(W, H),
    dyn: (gg, t, self) => {
      const p = self ? self.pond : pond
      if (p) ripple(gg, p, t, '#8fb8f0', '#5a7cc0')
      if (plant)
        for (let i = 0; i < 3; i++) {
          // Sparks on the pipes.
          const ph = (t * 1.3 + i * 0.37) % 1
          if (ph < 0.12) {
            const x = (i * 97 + 20) % W
            const y = 30 + i * 9
            rect(gg, x - 2, y, 5, 1, '#fff6a8')
            rect(gg, x, y - 2, 1, 5, '#fff6a8')
          }
        }
      else
        for (let i = 0; i < 8; i++) {
          const y = (i * 37 + t * 4) % H
          const x = (i * 53) % W
          if ((Math.floor(t * 2 + i) & 3) === 0) px(gg, x, y, '#cfc4ff')
        }
    },
  }
}

/** The same world seen from the other side: a '#flip' area. */
function mirrored(w: World): World {
  const flip = (src: Canvas) => {
    const c = canvas(W, H)
    c.g.translate(W, 0)
    c.g.scale(-1, 1)
    c.g.drawImage(src, 0, 0)
    return c
  }
  const pond = w.pond && { ...w.pond, x: W - w.pond.x }
  const out: World = { ...w, cv: flip(w.cv), fg: flip(w.fg), pond }
  // Moving bits (motes, sparks) are drawn unflipped; the pond's ripple follows the mirrored pond.
  out.dyn = (gg, t) => w.dyn(gg, t, out)
  return out
}

/** An area's scene key and whether it is mirrored, from its banner ('/banners/plains.png#flip'). */
export function sceneKeyOf(bannerUrl: string | null | undefined): { key: string; flip: boolean } {
  const file = (bannerUrl ?? 'default.png').split('/').pop() ?? 'default.png'
  return { key: file.split('#')[0]!.replace('.png', ''), flip: file.includes('#flip') }
}

const worlds = new Map<string, World>()

/** The scene of an area, drawn once and kept. */
export function sceneOf(bannerUrl: string | null | undefined): World {
  const { key, flip } = sceneKeyOf(bannerUrl)
  const id = key + (flip ? '#flip' : '')
  const hit = worlds.get(id)
  if (hit) return hit
  const S = SCENES[key] ?? SCENES.default!
  const base = S.forest ? paintForest() : S.cave ? paintCave(S.cave) : paintOutdoor(S)
  const world = flip ? mirrored(base) : base
  worlds.set(id, world)
  return world
}

const strips = new Map<string, string>()

/** A strip cut from the middle of an area's scene, around its horizon, as an image URL: what lists show. */
export function stripOf(bannerUrl: string | null | undefined, h = 56): string {
  const id = `${bannerUrl ?? ''}|${h}`
  const hit = strips.get(id)
  if (hit) return hit
  const w = sceneOf(bannerUrl)
  const c = canvas(W, h)
  const y0 = clamp(Math.round(w.horizon - h * 0.55), 0, H - h)
  c.g.drawImage(w.cv, 0, y0, W, h, 0, 0, W, h)
  const url = c.toDataURL()
  strips.set(id, url)
  return url
}
