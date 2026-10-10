// Battle scenery, drawn in code (no image requests): the Daybreak battle background, the Poké Balls and the Pokémon
// Center interior. Static layers are painted once per size and cached; `dyn` adds what moves (pollen in the light).
import {
  bayer,
  cached,
  ellipse,
  ellipseLine,
  mix,
  px,
  rect,
  rng,
  shade,
  softEllipse,
  clamp,
  type Canvas,
  type G,
} from './pixel'

/** Vertical dithered gradient through a list of colours. */
const vgrad = (cols: readonly string[], y: number, x: number, y0: number, y1: number) => {
  const t = clamp((y - y0) / Math.max(1, y1 - y0)) * (cols.length - 1)
  const i = Math.floor(t)
  return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)]! : cols[i]!
}

/** A ridge line: a sum of seeded sines, one height per column. */
function ridge(W: number, base: number, amp: number, seed: number, freqs = [0.021, 0.047, 0.11]) {
  const r = rng(seed)
  const ph = freqs.map(() => r() * 6.28)
  const out: number[] = []
  for (let x = 0; x < W; x++) {
    let v = 0
    freqs.forEach((f, i) => (v += Math.sin(x * f + ph[i]!) / (i + 1)))
    out.push(Math.round(base - Math.abs(v) * amp))
  }
  return out
}

export const DAYBREAK = {
  sky: ['#76bff3', '#8ccbf6', '#a5d8f8', '#bfe4f9', '#d8eef8', '#f1efe6', '#fde4c8'],
  sun: '#fff6d6',
  cloud: ['#ffffff', '#eaf3fb', '#d3e3f3'],
  far: ['#c8d6f0', '#a9bde6', '#93a8d9'],
  hill: ['#bde6a6', '#92d08a', '#6fb978'],
  tree: ['#7cc574', '#55a466', '#3c8457'],
  field: ['#a7de82', '#97d576', '#87cb6b', '#79bf62'],
  tuft: '#5fae55',
  flowers: ['#ffffff', '#ffe36b', '#ff9cc2'],
  pad: { lip: '#5ea653', top: '#b2e68e', rim: '#e6fcc8', shade: '#8fcf72', tuft: '#79c063' },
  contact: '#3f7d47',
  motes: '#fff3b0',
} as const

export interface Point {
  x: number
  y: number
}
/** Where each Pokémon's feet go on a battle stage. */
export interface Layout {
  foe: Point
  own: Point
}

export function layoutFor(W: number, H: number): Layout {
  return {
    foe: { x: Math.round(W * 0.72), y: Math.round(H * 0.6) },
    own: { x: Math.round(W * 0.27), y: H + 4 },
  }
}

function pad(g: G, x: number, y: number, rx: number, ry: number, p: typeof DAYBREAK.pad) {
  ellipse(g, x, y + 3, rx, ry, p.lip)
  ellipse(g, x, y, rx, ry, p.top)
  softEllipse(g, x + 4, y + 2, rx - 6, ry - 3, p.shade, 0.55, 0.6)
  ellipseLine(g, x, y, rx, ry, p.rim, Math.PI * 1.05, Math.PI * 1.95)
  const r = rng(x * 31 + y)
  for (let i = 0; i < rx / 2; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 0.85
    const tx = Math.round(x + Math.cos(a) * rx * d)
    const ty = Math.round(y + Math.sin(a) * ry * d)
    px(g, tx, ty, p.tuft)
    px(g, tx + 1, ty - 1, p.tuft)
  }
}

function paintDaybreak(W: number, H: number, L: Layout): Canvas {
  const P = DAYBREAK
  const hy = Math.round(H * 0.5)
  const far = ridge(W, hy + 2, H * 0.16, 7)
  const hill = ridge(W, hy + 10, H * 0.08, 19, [0.018, 0.05, 0.09])
  const c = shade(W, H, (x, y) => {
    if (y < far[x]!) {
      // Morning sun, top right: a solid core and one 50 % dithered band; no noisy falloff.
      const d = Math.hypot(x - W * 0.86, y - H * 0.06) / (H * 0.2)
      if (d < 0.55 || (d < 0.8 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0)) return P.sun
      return vgrad(P.sky, y, x, 0, hy + 4)
    }
    if (y < hill[x]!) {
      // Distant range: lit edge on its top pixel, atmospheric shade at its foot.
      if (y - far[x]! < 1) return P.far[0]
      return y > hy + 4 && bayer(x, y) < 0.5 ? P.far[2] : P.far[1]
    }
    const top = hill[x]!
    if (y - top < 1) return P.hill[0]
    if (y - top < 5) return bayer(x, y) < (y - top) / 5 ? P.hill[2] : P.hill[1]
    return vgrad(P.field, y, x, top + 4, H)
  })
  const g = c.g
  const r = rng(42)
  // Clouds: overlapping discs, white tops, a cool underside.
  for (const [cx, cy, s] of [
    [W * 0.18, H * 0.16, 1],
    [W * 0.5, H * 0.09, 0.7],
    [W * 0.66, H * 0.24, 0.85],
  ] as const) {
    const blobs = (
      [
        [-12, 2, 6],
        [-5, -2, 8],
        [4, -3, 7],
        [12, 1, 6],
        [0, 3, 7],
      ] as const
    ).map(([dx, dy, rr]) => [cx + dx * s, cy + dy * s, Math.max(2, Math.round(rr * s))] as const)
    for (const [bx, by, br] of blobs) ellipse(g, bx, by + 1, br, Math.round(br * 0.8), P.cloud[2])
    for (const [bx, by, br] of blobs) ellipse(g, bx, by, br, Math.round(br * 0.8), P.cloud[1])
    for (const [bx, by, br] of blobs) ellipse(g, bx - 1, by - 1, br - 1, Math.round(br * 0.8) - 1, P.cloud[0])
  }
  // Tree line along the hills.
  for (let x = 4; x < W; x += r.int(9, 15)) {
    const y = hill[Math.min(W - 1, x)]! + 1
    const rr = r.int(4, 7)
    ellipse(g, x, y - rr + 2, rr, rr, P.tree[2])
    ellipse(g, x - 1, y - rr + 1, rr - 1, rr - 1, P.tree[1])
    ellipse(g, x - 2, y - rr, Math.max(1, rr - 3), Math.max(1, rr - 3), P.tree[0])
  }
  // Grass tufts and flowers, sparser near the horizon.
  for (let i = 0; i < W * 0.6; i++) {
    const x = r.int(0, W - 1)
    const y = r.int(hy + 12, H - 1)
    if (r() < (y - hy) / (H - hy)) {
      px(g, x, y, P.tuft)
      px(g, x - 1, y - 1, P.tuft)
      px(g, x + 1, y - 1, P.tuft)
      if (r() < 0.12) px(g, x, y - 2, r.pick(P.flowers))
    }
  }
  pad(g, L.foe.x, L.foe.y + 2, 46, 11, P.pad)
  pad(g, L.own.x, L.own.y - 4, 72, 16, P.pad)
  return c
}

export interface Background {
  cv: Canvas
  layout: Layout
  /** What moves on top of the static layer at time t (seconds). */
  dyn: (g: G, t: number) => void
}

/**
 * The two battle zones for an area picture: translucent ovals on the picture's own ground where the painted
 * background has its platforms (the Visual Lab's Backgrounds tab, bgs.js `zone`): a soft navy shadow, a pale fill, a
 * darker rim and a lit top edge.
 */
export function zones(W: number, H: number): Canvas {
  return cached(`zones|${W}|${H}`, () => {
    const L = layoutFor(W, H)
    const c = shade(W, H, () => null)
    const g = c.g
    for (const [x, y, rx, ry] of [
      [L.foe.x, L.foe.y + 2, 46, 11],
      [L.own.x, L.own.y - 4, 72, 16],
    ] as const) {
      g.globalAlpha = 0.18
      ellipse(g, x, y + 2, rx, ry, '#24304f')
      g.globalAlpha = 0.34
      ellipse(g, x, y, rx, ry, '#fbfdff')
      g.globalAlpha = 0.55
      ellipseLine(g, x, y, rx, ry, '#24304f')
      g.globalAlpha = 0.6
      ellipseLine(g, x, y - 1, rx - 3, ry - 2, '#ffffff', Math.PI, Math.PI * 2)
    }
    g.globalAlpha = 1
    return c
  })
}

let artUnder = false
/**
 * An area picture lies under the battle stage (BattleStage sets it while it shows one): the timelines draw no
 * background of their own, so the picture and its zones show through them and nothing changes when a move plays.
 */
export const setArtUnderStage = (on: boolean) => void (artUnder = on)

/** The background a battle timeline draws: the Daybreak one, or nothing over an area picture. */
export function stageBackground(W: number, H: number): Background {
  if (!artUnder) return background(W, H)
  return cached(`bg|clear|${W}|${H}`, () => ({
    cv: shade(W, H, () => null),
    layout: layoutFor(W, H),
    dyn: () => {},
  }))
}

/** The Daybreak battle background at W×H, with its platforms and the drifting pollen. */
export function background(W: number, H: number): Background {
  return cached(`bg|daybreak|${W}|${H}`, () => {
    const layout = layoutFor(W, H)
    return {
      cv: paintDaybreak(W, H, layout),
      layout,
      dyn: (g: G, t: number) => {
        // Pollen drifting in the light.
        for (let i = 0; i < 14; i++) {
          const sp = 3 + (i % 5)
          const x = ((i * 53.7 + t * sp) % (W + 10)) - 5
          const y = H * 0.25 + ((i * 37) % (H * 0.6)) + Math.sin(t * 0.8 + i) * 4
          if ((Math.floor(t * 2 + i) & 3) !== 0) px(g, x, y, DAYBREAK.motes)
        }
      },
    }
  })
}

// ------------------------------------------------------------------ Poké Balls
export type BallKind = 'poke' | 'great' | 'ultra' | 'master'
export const BALLS: Record<BallKind, { top: readonly string[]; mark?: readonly string[] }> = {
  poke: { top: ['#ff8a78', '#ec3b33', '#a8231f'] },
  great: { top: ['#7fb3ff', '#3474e0', '#1f4aa0'], mark: ['#ff6b5e', '#d8312a'] },
  ultra: { top: ['#5b5b6e', '#2d2d3a', '#18181f'], mark: ['#ffe066', '#e8b425'] },
  master: { top: ['#b88af0', '#7d3fc4', '#4f2388'], mark: ['#ff8fc8', '#e0438f'] },
}
/** The game's ball item keys → how the ball is drawn. */
export const ballOfItem = (key: string | null | undefined): BallKind =>
  key === 'great-ball' ? 'great' : key === 'ultra-ball' ? 'ultra' : key === 'master-ball' ? 'master' : 'poke'
const BOTTOM = ['#ffffff', '#e9e9f2', '#b9b9cc']
const OUT = '#1b1626'

/**
 * A ball as a pixel shader: any rotation, any opening, button colour, and `dim` for the darkened caught look.
 * R is the radius in pixels (6 in battle).
 */
export function ball(
  kind: BallKind,
  angle = 0,
  o: { R?: number; open?: number; button?: string; dim?: number } = {},
): Canvas {
  const R = o.R || 6
  const open = o.open || 0
  const btn = o.button || '#ffffff'
  const dim = o.dim || 0
  const deg = Math.round((angle * 180) / Math.PI / 5) * 5
  const key = `ball|${kind}|${deg}|${Math.round(open * 8)}|${btn}|${Math.round(dim * 4)}|${R}`
  return cached(key, () => {
    const B = BALLS[kind]
    const S = 2 * R + 5 + Math.round(open * R * 1.4)
    const c0 = (S - 1) / 2
    const a = (deg * Math.PI) / 180
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const oa = -open * 1.25 // the lid swings back around the hinge
    const hinge = [-R, 0] as const
    const col = (u: number, v: number, top: boolean | null): string | null => {
      const d = Math.hypot(u, v)
      if (d > R + 0.45) return null
      if (d > R - 0.55) return OUT
      if (Math.abs(v) < 1.05) return OUT
      if (d < 2.6) return d < 1.5 ? btn : OUT
      if (top === false && v < 0) return null
      if (top === true && v > 0) return null
      const rmp = v < 0 ? B.top : BOTTOM
      // Light from the top left: highlight, body, shade.
      const l = (-u * 0.7 - v * 0.9) / R
      let c = l > 0.55 ? rmp[0]! : u * 0.6 + v * 0.8 > R * 0.55 ? rmp[2]! : rmp[1]!
      if (v < 0 && B.mark) {
        if (kind === 'great' && Math.abs(u) > R * 0.42 && v < -1.5 && v > -R * 0.75)
          c = l > 0.3 ? B.mark[0]! : B.mark[1]!
        if (kind === 'ultra' && Math.abs(u) > R * 0.3 && Math.abs(u) < R * 0.62 && v < -1.5)
          c = l > 0.2 ? B.mark[0]! : B.mark[1]!
        if (
          kind === 'master' &&
          (Math.hypot(u + R * 0.48, v + R * 0.42) < 1.7 || Math.hypot(u - R * 0.48, v + R * 0.42) < 1.7)
        )
          c = B.mark[0]!
        if (kind === 'master' && Math.abs(u) < 0.6 && v < -R * 0.4 && v > -R * 0.8) c = '#ffffff'
      }
      if (Math.hypot(u + R * 0.42, v + R * 0.5) < 1.2) c = '#ffffff'
      return dim ? mix(c, '#3a3450', dim * 0.45) : c
    }
    return shade(S, S, (x, y) => {
      // Undo the ball's own rotation.
      const dx = x - c0
      const dy = y - c0 + Math.round(open * R * 0.5)
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      if (open <= 0) return col(u, v, null)
      const bottom = v >= 0 ? col(u, v, false) : null
      if (bottom) return bottom
      // The lid: rotate the point back around the hinge before sampling the top half.
      const hu = u - hinge[0]
      const hv = v - hinge[1]
      const tu = hu * Math.cos(-oa) - hv * Math.sin(-oa) + hinge[0]
      const tv = hu * Math.sin(-oa) + hv * Math.cos(-oa) + hinge[1]
      return tv <= 0.4 ? col(tu, tv, true) : null
    })
  })
}

// ------------------------------------------------------------------ Pokémon Center interior
export const CENTER = {
  wall: ['#fff8f6', '#ffeae6', '#f6d6d2'],
  band: ['#ff8fa3', '#f0627e'],
  counter: ['#ffffff', '#ffd8df', '#e9a8b6'],
  front: ['#ffc2cd', '#f3a2b3'],
  floor: ['#f4f1fb', '#e6e2f3'],
  machine: ['#8aa0c8', '#5d74a3', '#24304f'],
  glass: '#a9f0e4',
  ink: '#24304f',
  light: '#5fe0c8',
} as const
/** One cradle per team member: a team is three Pokémon at most. */
export const SLOTS: readonly (readonly [number, number])[] = [
  [102, 93],
  [120, 93],
  [138, 93],
]

export function center(W: number, H: number): Canvas {
  return cached(`center|daybreak|${W}|${H}`, () => {
    const P = CENTER
    const c = shade(W, H, (x, y) => {
      if (y < 104) {
        if (y >= 60 && y < 70)
          return y === 60 ? P.band[0] : y >= 68 ? P.band[1] : P.band[(x + y) % 7 === 0 ? 1 : 0]
        if (x % 30 === 0) return P.wall[2]
        return vgrad(P.wall, y, x, 0, 104)
      }
      // Floor: tiles, darker in the counter's shadow.
      const tile = (Math.floor(x / 12) + Math.floor((y - 104) / 6)) % 2 ? P.floor[0] : P.floor[1]
      return y < 132 && bayer(x, y) < (132 - y) / 40 ? P.floor[1] : tile
    })
    const g = c.g
    // The Poké Ball emblem on the back wall.
    const ex = Math.round(W / 2)
    const ey = 30
    const soft = mix(P.band[0], P.wall[0], 0.45)
    g.drawImage(
      shade(45, 45, (x, y) => {
        const dx = x - 22
        const dy = y - 22
        const d = Math.hypot(dx, dy)
        if (d > 21.4) return null
        if (d > 19.4 || Math.abs(dy) < 2 || (d < 6.5 && d > 4.2)) return P.wall[2]
        if (d <= 4.2) return P.wall[0]
        return dy < 0 ? soft : P.wall[0]
      }),
      ex - 22,
      ey - 22,
    )
    // Wall monitor that will carry the heart line.
    rect(g, 32, 20, 40, 26, P.ink)
    rect(g, 34, 22, 36, 22, P.machine[2])
    rect(g, 50, 46, 4, 10, P.ink)
    // Counter: top lit edge, body, front panel with seams.
    rect(g, 0, 100, W, 3, P.counter[0])
    rect(g, 0, 103, W, 3, P.counter[1])
    rect(g, 0, 106, W, 1, P.counter[2])
    rect(g, 0, 107, W, 24, P.front[0])
    for (let x = 6; x < W; x += 16) rect(g, x, 108, 1, 22, P.front[1])
    rect(g, 0, 130, W, 2, P.ink)
    // Healing machine.
    rect(g, 84, 80, 72, 24, P.ink)
    rect(g, 86, 81, 68, 21, P.machine[1])
    rect(g, 86, 81, 68, 2, P.machine[0])
    rect(g, 86, 100, 68, 2, P.machine[2])
    for (const [sx, sy] of SLOTS) {
      ellipse(g, sx, sy + 1, 7, 4, P.machine[2])
      ellipseLine(g, sx, sy + 1, 7, 4, P.machine[0], Math.PI * 0.1, Math.PI * 0.9)
    }
    rect(g, 104, 76, 32, 5, P.ink)
    rect(g, 106, 77, 28, 3, P.machine[0])
    return c
  })
}
