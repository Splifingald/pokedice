// The Galarian birds' raid entrances (docs/53): Dyna Tree Hill in the Crown Tundra, the great tree alone on its hill,
// snowy peaks behind; each bird comes to it at its own hour and in its own temper, nothing like Kanto's.
// Articuno's (psychic, a cold gaze): night. The falling leaves slow and stop in mid-air; a lattice of violet light
// spreads across the sky and the held leaves begin to turn round the tree. Two huge eyes open in the sky, look left,
// right, then at you; their glare freezes the world violet and shatters the leaves, and the eyes become the bird.
// Zapdos's (running, fighting, a kick): a golden afternoon. Footfalls like drums; a dust trail races round the hill,
// round the tree, flattening the grass; it sprints, leaps into the sun, hangs there, and comes down in a flying kick:
// speed lines, an orange shock that cracks the hill open, rocks flying. It stands in the dust.
// Moltres's (dark flames, malice): dusk. A black disc slides over the sun; the tree withers and drops its leaves; dark
// flames creep in from the edges and eat the grass; the eclipse's corona spreads into two wings of black fire that
// sweep down and close over everything, then open on the bird.
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
  mix,
  pattern,
  polyline,
  rect,
  rgba,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { quad } from '../../timeline'
import { burstRing, dGradient, dissolve, drawShards, makeShard, stepShards, tri, type Shard } from './kit'
import { noise, raidCinema, speedLines, type Raid } from './gen8kit'

// --------------------------------------------------------------------------------------------------- the Dyna Tree

/** A light on the tree: where it comes from, and the ramps (dark to light) it paints the leaves and the bark in. */
interface Light {
  /** Towards the light: x right, y down, z out of the screen. */
  l: readonly [number, number, number]
  leaf: readonly string[]
  bark: readonly string[]
  /** The edges facing the light, caught by it (through the gaps too). */
  rim: string
  /** A light that only reaches the crown (the eclipse's corona): no rim below its underside. */
  high?: boolean
}

interface Pal {
  sky: string[]
  /** Each range's rock in shade and lit, its snow in shade and lit: the far one, then the near one. */
  far: readonly [string, string, string, string]
  near: readonly [string, string, string, string]
  /** Dark to light. */
  hill: readonly [string, string, string, string]
  /** The crest's lit grass. */
  grass: string
  stone: readonly [string, string, string]
  light: Light
}

// Night: starlight from the upper left, cold teal leaves, a lavender edge.
const NIGHT: Pal = {
  sky: ['#04030e', '#0c0a26', '#1a1640', '#2a2458'],
  far: ['#121034', '#1a1844', '#2e2e66', '#424286'],
  near: ['#1a183e', '#282654', '#504e88', '#8482c0'],
  hill: ['#060e0d', '#0c1a17', '#132722', '#1c362e'],
  grass: '#33604f',
  stone: ['#0a0c14', '#1a1e2c', '#30364a'],
  light: {
    l: [-0.6, -0.7, 0.45],
    leaf: ['#050a14', '#0a1620', '#10242c', '#183638', '#244c4a', '#3c6e66'],
    bark: ['#06050a', '#0e0c16', '#181624', '#242236', '#38344c'],
    rim: '#8a9ad8',
  },
}
// A golden afternoon: the sun low on the right, warm greens, a gold edge.
const AFTERNOON: Pal = {
  sky: ['#4a7ac8', '#7aa8e0', '#c8d8e8', '#ffe0a8', '#ffc078'],
  far: ['#98a2c6', '#b2bcda', '#d2daec', '#eef2fa'],
  near: ['#727a9e', '#9096ba', '#d4d8ea', '#ffffff'],
  hill: ['#2c561c', '#3c7024', '#538a2e', '#6ca63a'],
  grass: '#a6d65c',
  stone: ['#46463c', '#76766a', '#aeac96'],
  light: {
    l: [0.72, -0.55, 0.42],
    leaf: ['#0d2614', '#163c1c', '#225622', '#337228', '#518e2e', '#86b23c'],
    bark: ['#1a0e08', '#331e12', '#4e321c', '#6e4c2a', '#94703e'],
    rim: '#f4e08a',
  },
}
// Dusk: the sun just behind the crown, the tree dark against it, its every top edge burning orange.
const DUSK: Pal = {
  sky: ['#2a0a24', '#5a1430', '#a02a30', '#e05a30', '#ff9a4a'],
  far: ['#3c1430', '#501c3a', '#783a52', '#9e5868'],
  near: ['#2c1024', '#40182e', '#9a6470', '#e0a08e'],
  hill: ['#120d09', '#1c160e', '#2a2214', '#3a301a'],
  grass: '#c0703a',
  stone: ['#120a08', '#281a14', '#463024'],
  light: {
    l: [0, -0.8, -0.45],
    leaf: ['#0a0709', '#160f10', '#241a14', '#36281a', '#4c3a20'],
    bark: ['#070405', '#140b0b', '#22140f', '#321e14'],
    rim: '#ff8a3a',
  },
}
// Under the eclipse: everything nearly black, edged in the corona's violet; the withered leaves brown and dry.
const ECLIPSE: Light = {
  l: [0, -0.8, -0.45],
  high: true,
  leaf: ['#040206', '#09050b', '#100912', '#180d1a', '#221224'],
  bark: ['#030204', '#080409', '#0e0810', '#160c18'],
  rim: '#c82a9a',
}
const WITHERED: Light = {
  ...ECLIPSE,
  leaf: ['#0a0406', '#1a0c0c', '#2c1610', '#422214', '#5a3218'],
  rim: '#e05aa8',
}

/** A length of the tree's wood, tapering from w0 to w1 thick; `z` brings it forward (the roots over the trunk). */
interface Limb {
  x0: number
  y0: number
  x1: number
  y1: number
  w0: number
  w1: number
  z: number
  /** The finest twigs, drawn only on a withering tree. */
  fine: boolean
}

/** A clump of leaves: round lobes heaped on its centre (x, y, r, lift). A withering tree keeps the lowest `k` longest. */
interface Clump {
  x: number
  y: number
  r: number
  back: boolean
  k: number
  lobes: (readonly [number, number, number, number])[]
}

/** The Dyna Tree's shape, the same at every hour: each bird's light paints it. */
interface Dyna {
  limbs: Limb[]
  /** Top to bottom: the lower ones are nearer. */
  clumps: Clump[]
  top: number
  ground: (x: number) => number
  crown: [number, number]
  cw: number
  ch: number
  tw: number
  /** Where Dynamax light glints among its leaves. */
  glints: [number, number][]
  /** The box its leaves can fill. */
  box: [number, number, number, number]
  noise?: { leaf: Float32Array; fringe: Float32Array; hole?: Float32Array }
  /** Its pixels before any light, by how far it has withered, and the pieces they are laid from. */
  rasters: Map<string, Raster>
  patches: Map<string, Patch>
}

interface Raster {
  kind: Uint8Array
  ord: Int16Array
  base: Float32Array
  nx: Float32Array
  ny: Float32Array
  nz: Float32Array
  /** The box its pixels fill. */
  box: [number, number, number, number]
}

/**
 * The Dyna Tree laid out from the screen: a massive trunk in a slow S, buttress roots gripping the hill, five great
 * boughs (the long low one to the left gives it its lean), and a broad crown of foliage masses with a saddle in the
 * middle where the sky shows. Its own seed, so every bird finds the same tree.
 */
function dynaShape(s: Raid): Dyna {
  const { w, h, cx } = s
  const r = rng(1701)
  const top = s.feet + 4
  const ground = (x: number) => top + ((x - cx) / (w * 0.75)) ** 2 * h * 0.22
  const ch = top * 0.29
  const cy = Math.round(top * 0.4)
  const cw = Math.min(w * 0.62, ch * 2.9)
  const tw = Math.max(14, s.m * 0.15)
  const fork = cy + ch * 0.85
  const limbs: Limb[] = []
  const wood = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w0: number,
    w1: number,
    z = 0,
    fine = false,
  ) => limbs.push({ x0, y0, x1, y1, w0, w1, z, fine })
  /** A bough through its joints, thinning as it goes, each joint knocked a little off true. */
  const bough = (pts: [number, number][], w0: number, w1: number) => {
    const at = pts.map(([x, y], i): [number, number] =>
      i === 0 ? [x, y] : [x + r.range(-1, 1) * tw * 0.12, y + r.range(-1, 1) * tw * 0.12],
    )
    for (let i = 0; i < at.length - 1; i++) {
      const [a, b] = [at[i]!, at[i + 1]!]
      wood(a[0], a[1], b[0], b[1], lerp(w0, w1, i / (at.length - 1)), lerp(w0, w1, (i + 1) / (at.length - 1)))
    }
    return at
  }
  // The trunk: a slow S, pinched above its foot, swelling again where it forks.
  const trunk: [number, number, number][] = [
    [cx + tw * 0.05, top + 6, 1.0],
    [cx - tw * 0.08, lerp(top, fork, 0.3), 0.9],
    [cx - tw * 0.14, lerp(top, fork, 0.62), 0.84],
    [cx - tw * 0.02, lerp(top, fork, 0.9), 0.95],
    [cx + tw * 0.04, fork, 1.05],
  ]
  for (let i = 0; i < trunk.length - 1; i++) {
    const [[x0, y0, w0], [x1, y1, w1]] = [trunk[i]!, trunk[i + 1]!]
    wood(x0, y0, x1, y1, tw * w0, tw * w1)
  }
  // Buttress roots: fins off the trunk's foot, steep against it and flattening out down the hill, the side ones long,
  // the near ones short; each stands in front of the trunk, so the crevice beside it falls in its shadow.
  for (const [side, reach, up, wk, z] of [
    [-1, 2.4, 0.44, 0.42, 1],
    [1, 2.2, 0.4, 0.42, 1],
    [-1, 1.3, 0.28, 0.36, 2],
    [1, 1.4, 0.26, 0.34, 2],
    [-1, 0.62, 0.18, 0.3, 3],
    [1, 0.7, 0.16, 0.28, 3],
  ] as const) {
    const y0 = top - (top - fork) * up
    let [px, py] = [cx + side * tw * 0.28, y0]
    for (let k = 1; k <= 6; k++) {
      const t = k / 6
      const x = cx + side * tw * (0.28 + (reach - 0.28) * t ** 2.2)
      const y = lerp(y0, ground(x) + 2, 1 - (1 - t) ** 1.7)
      wood(px, py, x, y, tw * lerp(wk, 0.12, (k - 1) / 6), tw * lerp(wk, 0.12, t), z * tw * 0.1)
      ;[px, py] = [x, y]
    }
  }
  // The great boughs from the fork.
  const f: [number, number] = [cx + tw * 0.04, fork]
  const left = bough(
    [f, [cx - cw * 0.3, cy + ch * 0.32], [cx - cw * 0.62, cy + ch * 0.24], [cx - cw * 0.93, cy + ch * 0.44]],
    tw * 0.62,
    tw * 0.14,
  )
  const up = bough(
    [
      [f[0], f[1] - tw * 0.3],
      [cx - cw * 0.06, cy + ch * 0.05],
      [cx + cw * 0.04, cy - ch * 0.3],
    ],
    tw * 0.55,
    tw * 0.16,
  )
  const right = bough(
    [f, [cx + cw * 0.28, cy + ch * 0.2], [cx + cw * 0.6, cy + ch * 0.04], [cx + cw * 0.9, cy + ch * 0.26]],
    tw * 0.58,
    tw * 0.13,
  )
  const ul = bough(
    [left[1]!, [cx - cw * 0.4, cy - ch * 0.1], [cx - cw * 0.36, cy - ch * 0.62]],
    tw * 0.4,
    tw * 0.1,
  )
  const ur = bough(
    [right[1]!, [cx + cw * 0.36, cy - ch * 0.16], [cx + cw * 0.42, cy - ch * 0.64]],
    tw * 0.38,
    tw * 0.1,
  )
  const bones = [left, up, right, ul, ur]
  // The masses the leaves gather in: two domes with a saddle between them, the boughs' ends; the fork shows under them.
  const masses: [number, number, number, number][] = [
    [cx - cw * 0.38, cy - ch * 0.38, cw * 0.36, ch * 0.5],
    [cx + cw * 0.4, cy - ch * 0.42, cw * 0.36, ch * 0.5],
    [cx + cw * 0.02, cy - ch * 0.06, cw * 0.3, ch * 0.4],
    [cx - cw * 0.66, cy + ch * 0.16, cw * 0.3, ch * 0.4],
    [cx - cw * 0.92, cy + ch * 0.4, cw * 0.14, ch * 0.26],
    [cx + cw * 0.66, cy + ch * 0.04, cw * 0.28, ch * 0.4],
    [cx + cw * 0.9, cy + ch * 0.24, cw * 0.13, ch * 0.24],
  ]
  const R0 = Math.max(6, ch * 0.3)
  const clumps: Clump[] = []
  for (const [mx, my, rx, ry] of masses) {
    const want = Math.max(2, Math.round((rx * ry * 2.6) / (R0 * R0)))
    for (let tries = 0, n = 0; tries < want * 40 && n < want; tries++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r())
      const x = mx + Math.cos(a) * rx * d * 0.8
      const y = my + Math.sin(a) * ry * d * 0.75
      const R = R0 * r.range(0.72, 1.08) * Math.min(1, 0.55 + rx / cw)
      if (clumps.some((c) => Math.hypot(c.x - x, (c.y - y) * 1.2) < (c.r + R) * 0.55)) continue
      // A big lobe in the middle, smaller ones round it, the lower ones tucked under: a cauliflower's head.
      const lobes: [number, number, number, number][] = [[0, R * 0.12, R * 0.7, R * 0.25]]
      const k = r.int(5, 7)
      const a0 = r() * Math.PI
      for (let j = 0; j < k; j++) {
        const b = a0 + (j / k) * Math.PI * 2 + r.range(-0.3, 0.3)
        const dd = R * r.range(0.38, 0.56)
        lobes.push([
          Math.cos(b) * dd,
          Math.sin(b) * dd * (Math.sin(b) > 0 ? 0.45 : 0.85) - R * 0.04,
          R * r.range(0.36, 0.5),
          0,
        ])
      }
      clumps.push({ x, y, r: R, back: r() < 0.38, k: r(), lobes })
      n++
    }
  }
  clumps.sort((a, b) => a.y - b.y)
  // Twigs from the nearest bough out to every clump, and a spray of finer ones out from it, away from the crown's
  // heart (only a withering tree shows those: on a living one they would poke through its leaves).
  for (const c of clumps) {
    let best: [number, number] = [c.x, c.y + c.r]
    let bd = Infinity
    for (const b of bones)
      for (let i = 0; i < b.length - 1; i++) {
        const [ax, ay] = b[i]!
        const [bx, by] = b[i + 1]!
        const q = Math.max(
          0,
          Math.min(
            1,
            ((c.x - ax) * (bx - ax) + (c.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1),
          ),
        )
        const px = lerp(ax, bx, q)
        const py = lerp(ay, by, q)
        const d = Math.hypot(px - c.x, py - c.y)
        if (d < bd) [bd, best] = [d, [px, py]]
      }
    wood(best[0], best[1], c.x, c.y, Math.max(1.4, tw * 0.13), 1.2, -1)
    const out = Math.atan2(c.y - (cy + ch), c.x - cx)
    for (const da of [-0.6, 0, 0.6]) {
      const a = out + da + r.range(-0.2, 0.2)
      const L1 = c.r * r.range(0.6, 0.95)
      const [ex, ey] = [c.x + Math.cos(a) * L1, c.y + Math.sin(a) * L1]
      wood(c.x, c.y, ex, ey, 1.3, 1, -1, true)
      for (const db of [-0.5, 0.5]) {
        const b = a + db + r.range(-0.15, 0.15)
        wood(ex, ey, ex + Math.cos(b) * L1 * 0.5, ey + Math.sin(b) * L1 * 0.5, 1, 1, -1, true)
      }
    }
  }
  const front = clumps.filter((c) => !c.back)
  const glints = Array.from({ length: 7 }, (): [number, number] => {
    const c = front[r.int(0, front.length - 1)]!
    return [Math.round(c.x + r.range(-0.4, 0.4) * c.r), Math.round(c.y + r.range(-0.1, 0.4) * c.r)]
  })
  const edge = (f: (c: Clump) => number, pick: (...v: number[]) => number) => pick(...clumps.map(f))
  const box: Dyna['box'] = [
    Math.max(0, Math.floor(edge((c) => c.x - c.r * 1.3, Math.min))),
    Math.max(0, Math.floor(edge((c) => c.y - c.r * 1.3, Math.min))),
    Math.min(w - 1, Math.ceil(edge((c) => c.x + c.r * 1.3, Math.max))),
    Math.min(h - 1, Math.ceil(edge((c) => c.y + c.r * 1.3, Math.max))),
  ]
  return {
    limbs,
    clumps,
    top,
    ground,
    crown: [cx, cy],
    cw,
    ch,
    tw,
    glints,
    box,
    rasters: new Map(),
    patches: new Map(),
  }
}

/** The fine noise a painting reads (the leaves' texture, their fringes, the holes in dead ones): the same in every
 * light, so worked out once per tree, over the crown's box. */
function noiseOf(D: Dyna, w: number, h: number, holes: boolean) {
  const fill = (n: (x: number, y: number) => number, sc: number) => {
    const into = new Float32Array(w * h)
    const [x0, y0, x1, y1] = D.box
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) into[y * w + x] = n(x / sc, y / sc)
    return into
  }
  const N = (D.noise ??= { leaf: fill(noise(91), 2.2), fringe: fill(noise(92), 1.7) })
  // The holes only a withering tree needs.
  if (holes) N.hole ??= fill(noise(94), 2.5)
  return N
}

/** Pixels before any light: where each is, and its light as `base` plus its normal (weighted) dotted with the light. */
interface Patch {
  at: number[]
  base: number[]
  nx: number[]
  ny: number[]
  nz: number[]
  /** In front of what (the wood only: its roots stand before the trunk). */
  ord: number[]
  /** How far out from its clump's middle (the leaves only: a withering tree's holes open wider there). */
  d: number[]
}
const patch = (): Patch => ({ at: [], base: [], nx: [], ny: [], nz: [], ord: [], d: [] })

/**
 * One clump's leaves before any light, worked out once and laid down by every picture that keeps it: a dome of lobes,
 * their rims made leafy by a fine noise, the crown's own dome over all of them (its lit side brighter, its underside in
 * shade), a leaf texture.
 */
function clumpPatch(D: Dyna, ci: number, w: number, h: number): Patch {
  const key = `c${ci}`
  const had = D.patches.get(key)
  if (had) return had
  const c = D.clumps[ci]!
  const N = noiseOf(D, w, h, false)
  const [ccx, ccy] = D.crown
  const P = patch()
  const R = c.r * 1.3
  for (let y = Math.max(0, Math.floor(c.y - R)); y <= Math.min(h - 1, c.y + R); y++)
    for (let x = Math.max(0, Math.floor(c.x - R)); x <= Math.min(w - 1, c.x + R); x++) {
      const px = x + 0.5 - c.x
      const py = y + 0.5 - c.y
      if (px * px + py * py > R * R) continue
      const i = y * w + x
      const f = 1 + (N.fringe[i]! - 0.5) * 0.5
      let top = 0
      let lx = 0
      let ly = 0
      for (const [ox, oy, lr, lift] of c.lobes) {
        const dx = px - ox
        const dy = py - oy
        const rr = lr * f
        const d2 = dx * dx + dy * dy
        if (d2 >= rr * rr) continue
        const ht = Math.sqrt(rr * rr - d2) + lift
        if (ht > top) {
          top = ht
          lx = dx / rr
          ly = dy / rr
        }
      }
      if (top <= 0) continue
      // The lobe's bump on the clump's dome: the normal both make.
      let mx = lx * 0.55 + (px / c.r) * 0.6
      let my = ly * 0.55 + (py / c.r) * 0.6
      const m = Math.hypot(mx, my)
      if (m > 0.98) {
        mx *= 0.98 / m
        my *= 0.98 / m
      }
      const kx = (x - ccx) / D.cw
      const ky = (y - ccy) / D.ch
      P.at.push(i)
      P.base.push(0.44 - Math.max(0, ky) * 0.16 - (c.back ? 0.14 : 0) + (N.leaf[i]! - 0.5) * 0.36)
      P.nx.push(mx * 0.36 + kx * 0.14)
      P.ny.push(my * 0.36 + ky * 0.14)
      P.nz.push(Math.sqrt(1 - mx * mx - my * my) * 0.36)
      P.d.push(Math.hypot(px, py) / c.r)
    }
  D.patches.set(key, P)
  return P
}

/**
 * The tree's wood before any light, worked out once (with its finest twigs, or without): every limb round and
 * furrowed with bark, sunk into the hill at its foot; where two meet the fatter one bulges in front, so they grow out
 * of each other.
 */
function woodPatch(D: Dyna, w: number, h: number, fine: boolean): Patch {
  const key = `w${fine}`
  const had = D.patches.get(key)
  if (had) return had
  const zb = new Float32Array(w * h).fill(-Infinity)
  const P = patch()
  const slot = new Int32Array(w * h).fill(-1)
  const barkN = noise(93)
  const ground = Float32Array.from({ length: w }, (_, x) => D.ground(x + 0.5))
  for (const b of D.limbs) {
    if (b.fine && !fine) continue
    const vx = b.x1 - b.x0
    const vy = b.y1 - b.y0
    const l2 = vx * vx + vy * vy || 1
    const len = Math.sqrt(l2)
    // Across the limb.
    const ax = -vy / len
    const ay = vx / len
    const pad = Math.max(b.w0, b.w1) / 2 + 1
    const [xa, xb] = [
      Math.max(0, Math.floor(Math.min(b.x0, b.x1) - pad)),
      Math.min(w - 1, Math.max(b.x0, b.x1) + pad),
    ]
    const [ya, yb] = [
      Math.max(0, Math.floor(Math.min(b.y0, b.y1) - pad)),
      Math.min(h - 1, Math.max(b.y0, b.y1) + pad),
    ]
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const qx = x + 0.5 - b.x0
        const qy = y + 0.5 - b.y0
        const t = Math.max(0, Math.min(1, (qx * vx + qy * vy) / l2))
        const dx = qx - t * vx
        const dy = qy - t * vy
        const rr = Math.max(0.62, b.w0 + (b.w1 - b.w0) * t) / 2
        const d2 = dx * dx + dy * dy
        if (d2 > rr * rr || y + 0.5 > ground[x]! + 1) continue
        const i = y * w + x
        const ht = Math.sqrt(rr * rr - d2) + b.z
        if (ht <= zb[i]!) continue
        zb[i] = ht
        const u = (dx * ax + dy * ay) / rr
        // Bark: ridges running along the wood, deep furrows between them (along it in screen space, so the furrows
        // run on unbroken from one length of a limb to the next).
        const ridge = barkN(u * rr * 0.55, ((x * vx + y * vy) / len) * 0.07)
        let k = slot[i]!
        if (k < 0) {
          k = slot[i] = P.at.length
          P.at.push(i)
        }
        P.base[k] = 0.42 + (ridge < 0.3 ? -0.3 : ridge > 0.66 ? 0.1 : 0)
        P.nx[k] = u * ax * 0.42
        P.ny[k] = u * ay * 0.42
        P.nz[k] = Math.sqrt(Math.max(0, 1 - u * u)) * 0.42
        P.ord[k] = b.z > 0 ? 600 : 500
      }
  }
  D.patches.set(key, P)
  return P
}

/**
 * The tree's pixels before any light, as one picture: the leaves behind the boughs, the wood, then the leaves in front
 * of it, each lower clump nearer. `keep` thins it to its last clumps (a withering tree, which shows its finest twigs),
 * `holes` tatters what is left.
 */
function rasterOf(D: Dyna, w: number, h: number, keep: number, holes: number): Raster {
  const key = `${keep}|${holes}`
  const had = D.rasters.get(key)
  if (had) return had
  const n = w * h
  const R: Raster = {
    kind: new Uint8Array(n),
    ord: new Int16Array(n),
    base: new Float32Array(n),
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    nz: new Float32Array(n),
    box: [w, h, -1, -1],
  }
  // A withering tree's leaves tattered, the holes opening wider towards each clump's edge.
  const hole = holes > 0 ? noiseOf(D, w, h, true).hole! : null
  const lay = (P: Patch, kind: number, ord: number) => {
    for (let k = 0; k < P.at.length; k++) {
      const i = P.at[k]!
      if (hole && kind === 2 && hole[i]! < holes * (0.3 + 0.7 * P.d[k]!)) continue
      R.kind[i] = kind
      R.ord[i] = kind === 1 ? P.ord[k]! : ord
      R.base[i] = P.base[k]!
      R.nx[i] = P.nx[k]!
      R.ny[i] = P.ny[k]!
      R.nz[i] = P.nz[k]!
      const [x, y] = [i % w, Math.floor(i / w)]
      if (x < R.box[0]) R.box[0] = x
      if (y < R.box[1]) R.box[1] = y
      if (x > R.box[2]) R.box[2] = x
      if (y > R.box[3]) R.box[3] = y
    }
  }
  const kept = D.clumps.map((c, i) => [c, i] as const).filter(([c]) => c.k < keep)
  kept.filter(([c]) => c.back).forEach(([, ci], o) => lay(clumpPatch(D, ci, w, h), 2, o))
  lay(woodPatch(D, w, h, keep < 1), 1, 500)
  kept.filter(([c]) => !c.back).forEach(([, ci], o) => lay(clumpPatch(D, ci, w, h), 2, 1000 + o))
  D.rasters.set(key, R)
  return R
}

/**
 * The Dyna Tree in one light: each pixel's light quantised into its ramp through the ordered dither, darkened by
 * whatever stands nearer the light (a clump in front, a bough, the leaves over the wood), a dark edge on the shadow
 * side and the light's own edge on the other.
 */
function paintDyna(s: Raid, D: Dyna, L: Light, o: { keep?: number; holes?: number } = {}): Canvas {
  const { w, h } = s
  const { kind, ord, base, nx, ny, nz, box } = rasterOf(D, w, h, o.keep ?? 1, o.holes ?? 0)
  const cv = canvas(w, h)
  const [x0, y0, x1, y1] = box
  if (x1 < x0) return cv
  const ll = Math.hypot(L.l[0], L.l[1], L.l[2])
  const [lx, ly, lz] = [L.l[0] / ll, L.l[1] / ll, L.l[2] / ll]
  const [bark, leaf, rim] = [L.bark.map(rgba), L.leaf.map(rgba), rgba(L.rim)]
  const rimTo = L.high ? D.crown[1] + D.ch : h
  // Across the screen towards the light, and a pixel's step that way.
  const sl = Math.hypot(lx, ly) || 1
  const [sx, sy] = [lx / sl, ly / sl]
  const ox = Math.abs(sx) > 0.3 ? Math.sign(sx) : 0
  const oy = Math.abs(sy) > 0.3 ? Math.sign(sy) : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x)
  const empty = (x: number, y: number) => {
    const j = at(x, y)
    return j >= 0 && !kind[j]
  }
  const img = cv.g.createImageData(x1 - x0 + 1, y1 - y0 + 1)
  const px = img.data
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x
      const k = kind[i]!
      if (!k) continue
      const ramp = k === 1 ? bark : leaf
      let c: readonly number[]
      const litEdge = (ox !== 0 && empty(x + ox, y)) || (oy !== 0 && empty(x, y + oy))
      const darkEdge =
        (ox !== 0 && empty(x - ox, y)) || (oy !== 0 && empty(x, y - oy)) || (k === 2 && empty(x, y + 1))
      // The light's edge only on what is thick enough to catch it (not on a twig).
      if (litEdge && !darkEdge && !empty(x - ox * 2, y - oy * 2) && y < rimTo) c = rim
      else if (darkEdge && !litEdge) c = ramp[0]!
      else {
        let v = base[i]! + nx[i]! * lx + ny[i]! * ly + nz[i]! * lz
        // Cast shadows: a clump or a bough nearer the light darkens what lies just behind it.
        for (let d = 1; d <= 3; d++) {
          const j = at(Math.round(x + sx * d * 1.4), Math.round(y + sy * d * 1.4))
          if (j >= 0 && kind[j] && ord[j]! > ord[i]!) {
            v -= 0.2
            break
          }
        }
        // The wood under the leaves is in their shade.
        if (k === 1)
          for (let d = 2; d <= 8; d++) {
            const j = at(Math.round(x + sx * d), Math.round(y + sy * d))
            if (j >= 0 && kind[j] === 2) {
              v -= 0.22
              break
            }
          }
        const tt = Math.floor(v * ramp.length + (bayer(x, y) - 0.5) * 0.9)
        c = ramp[Math.max(0, Math.min(ramp.length - 1, tt))]!
      }
      const p = ((y - y0) * (x1 - x0 + 1) + (x - x0)) * 4
      px[p] = c[0]!
      px[p + 1] = c[1]!
      px[p + 2] = c[2]!
      px[p + 3] = 255
    }
  cv.g.putImageData(img, x0, y0)
  return cv
}

/** The tree in a light, with the hill's grass growing up over its roots. */
function dynaTree(s: Raid, D: Dyna, P: Pal, L: Light, o?: { keep?: number; holes?: number }): Canvas {
  const cv = paintDyna(s, D, L, o)
  const g = cv.g
  const span0 = D.tw * 2.2
  for (let x = Math.round(s.cx - span0); x < s.cx + span0; x++) {
    const y = Math.round(D.ground(x + 0.5))
    const k = (x * 7 + 3) % 5
    rect(g, x, y - (k < 2 ? 2 : 1), 1, k < 2 ? 3 : 2, k === 0 ? P.grass : P.hill[k % 2 ? 2 : 3])
  }
  return cv
}

interface Hill {
  sky: Canvas
  tree: Canvas
  top: number
  /** The canopy's middle. */
  crown: [number, number]
  glints: [number, number][]
  D: Dyna
}

/** Dyna Tree Hill in a palette: the sky, the two ranges and the hill in one picture, the tree in another. */
function dynaHill(s: Raid, r: Rng, P: Pal): Hill {
  const { w, h, cx } = s
  const D = dynaShape(s)
  const top = D.top
  const sky = canvas(w, h)
  const g = sky.g
  g.drawImage(dGradient(w, h, P.sky), 0, 0)
  // The far range pale and high, the near one lower and sharper.
  const lx = P.light.l[0]
  range(g, w, top + 2, Math.max(30, h * 0.17), r, P.far, lx)
  range(g, w, top + 8, Math.max(22, h * 0.12), r, P.near, lx)
  // The hill: lit on the light's side and along its crest, darker down its flanks, in the tree's shade under the crown.
  const grain = noise(95)
  const shx = cx - lx * D.cw * 0.3
  const srx = D.cw * 0.9
  const sry = Math.max(6, (h - top) * 0.13)
  const gys = Float32Array.from({ length: w }, (_, x) => D.ground(x + 0.5))
  g.drawImage(
    paletted(w, h, [...P.hill, P.grass], (x, y) => {
      const gy = gys[x]!
      if (y + 0.5 < gy) return -1
      if (y + 0.5 < gy + 1.2) return 4
      const e = ((x - shx) / srx) ** 2 + ((y - top - 2) / sry) ** 2
      const v =
        0.85 -
        ((y - gy) / (h - top)) * 1.3 +
        ((x - cx) / w) * lx * 0.5 +
        (grain(x / 7, y / 3) - 0.5) * 0.35 -
        (e < 1 ? 0.5 * (1 - e) : 0)
      return Math.max(0, Math.min(3, Math.floor(v * 4 + (bayer(x, y) - 0.5) * 0.9)))
    }),
    0,
    0,
  )
  // Grass along the crest against the sky; tufts down the hill, bigger nearer; a few stones.
  for (let x = 0; x < w; x += 2) {
    const y = Math.round(D.ground(x + 0.5))
    if ((x * 5) % 7 < 3) rect(g, x, y - 2, 1, 2, P.grass)
    else rect(g, x, y - 1, 1, 1, P.grass)
  }
  for (let i = 0; i < Math.round((w * (h - top)) / 70); i++) {
    const x = r.range(0, w)
    const y = r.range(D.ground(x) + 4, h)
    const k = 1 + ((y - top) / (h - top)) * 1.6
    const lit = (x - cx) * lx > 0 && y < top + (h - top) * 0.5
    for (const b of [-1, 0, 1]) line(g, x, y, x + b * k, y - (b ? 1.5 : 2.5) * k, lit ? P.hill[3] : P.hill[2])
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.round(r.range(w * 0.05, w * 0.95))
    const y = Math.round(r.range(D.ground(x) + (h - top) * 0.25, h - 4))
    const k = 1 + ((y - top) / (h - top)) * 2
    const rx = Math.round(3.5 * k)
    const ry = Math.round(2.4 * k)
    ellipse(g, x + 1, y + 1, rx + 1, Math.max(1, Math.round(k * 0.8)), P.hill[0])
    // A boulder: round on top, flat where it sits, lit on the light's side.
    for (let dy = -ry; dy <= 0; dy++)
      for (let dx = -rx; dx <= rx; dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue
        const v = (dx * Math.sign(lx || -1) * 0.6 - dy * 0.8) / ry + (bayer(x + dx, y + dy) - 0.5) * 0.6
        rect(g, x + dx, y + dy, 1, 1, v > 0.7 ? P.stone[2] : v > 0 ? P.stone[1] : P.stone[0])
      }
  }
  return { sky, tree: dynaTree(s, D, P, P.light), top, crown: D.crown, glints: D.glints, D }
}

/** `shade` for a picture in a few colours: `fn` gives each pixel's index in `pal` (−1 for none), no colour parsed per
 * pixel. */
function paletted(
  w: number,
  h: number,
  pal: readonly string[],
  fn: (x: number, y: number) => number,
): Canvas {
  const cv = canvas(w, h)
  const img = cv.g.createImageData(cv.width, cv.height)
  const d = img.data
  const cs = pal.map(rgba)
  for (let y = 0, p = 0; y < cv.height; y++)
    for (let x = 0; x < cv.width; x++, p += 4) {
      const k = fn(x, y)
      if (k < 0) continue
      const c = cs[k]!
      d[p] = c[0]
      d[p + 1] = c[1]
      d[p + 2] = c[2]
      d[p + 3] = c[3]
    }
  cv.g.putImageData(img, 0, 0)
  return cv
}

/**
 * A mountain range along `base`, drawn once: jagged ridgelines, each peak's face towards the light lit and the other
 * in shade (with no side light, the faces towards the middle), gullies down the rock, snow off the summits in a ragged
 * line. `c`: rock in shade and lit, snow in shade and lit.
 */
function range(g: G, w: number, base: number, ht: number, r: Rng, c: readonly string[], lx: number) {
  const pk: [number, number, number][] = []
  for (let x = -ht * 0.6; x < w + ht; x += ht * r.range(0.6, 1.1))
    pk.push([x, ht * r.range(0.5, 1), r.range(0.8, 1.4)])
  const jag = noise(r.int(1, 999))
  const bh = Math.ceil(ht) + 2
  // Each column's tallest peak, which of its faces this is, its ridge and its snow line.
  const cols = Array.from({ length: w }, (_, x) => {
    let [best, face, ph] = [-Infinity, 0, 0]
    for (const [px, hh, sl] of pk) {
      const v = hh - Math.abs(x + 0.5 - px) * sl
      if (v > best) [best, face, ph] = [v, Math.sign(x + 0.5 - px), hh]
    }
    const lit = lx !== 0 ? face * lx > 0 : face * (w / 2 - x) > 0
    return [
      best + (jag(x / 2.5, 0) - 0.5) * 3,
      face,
      lit ? 1 : 0,
      ph * (0.6 + (jag(x / 2, 3) - 0.5) * 0.3),
    ] as const
  })
  g.drawImage(
    paletted(w, bh, c, (x, y) => {
      const [ridge, face, lit, snow] = cols[x]!
      const up = bh - y
      if (up > ridge) return -1
      const shine = lit && jag((x + up * face * 0.9) / 2.2, 7 + up / 5) >= 0.28 ? 1 : 0
      return (up > snow ? 2 : 0) + shine
    }),
    0,
    Math.round(base - bh),
  )
}

/** Lets go of what painting the tree took (it would otherwise stay with the scene for its whole run). */
function settle<T extends { D: Dyna }>(H: T): T {
  H.D.rasters.clear()
  H.D.patches.clear()
  H.D.noise = undefined
  return H
}

/** The Dynamax light glinting in the Dyna Tree's leaves, each glint on its own beat; `k` 0 puts them out. */
function glints(g: G, H: Hill, t: number, k: number, c: readonly [string, string] = ['#ff4a7a', '#ffb0c8']) {
  if (k <= 0) return
  H.glints.forEach(([x, y], i) => {
    const on = Math.sin(((t * 0.8 + i * 0.37) % 1) * Math.PI) * k
    if (on < 0.35) return
    if (on > 0.75) {
      rect(g, x - 1, y, 3, 1, c[0])
      rect(g, x, y - 1, 1, 3, c[0])
      rect(g, x, y, 1, 1, '#ffffff')
    } else rect(g, x, y, 1, 1, c[1])
  })
}

// ----------------------------------------------------------------------------------------------- Articuno (Galar)

const ART = ['#ffffff', '#f0c8ff', '#b06ae8', '#3a1a6a'] as const
const PSY = ['#ffe8ff', '#ff9ae8', '#c84ad8', '#5a1a8a'] as const
const A_REVEAL = 4.6
const T_HOLD = 1.05
const T_LATTICE = 1.75
const T_EYES = 2.55
const T_GLARE = 3.55
const T_DESCEND = 4.0

type AX = Hill & {
  lattice: Canvas
  leaves: [number, number, number][]
  shards: Shard[]
  eyes: [number, number]
}

/** A triangular lattice of thin violet lines, drawn once (it is uncovered in a growing circle). */
function lattice(w: number, h: number, cell: number): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const dy = cell * 0.866
  const faint = pattern(g, PSY[3], 8)
  for (let y = 0; y < h + dy; y += dy) rect(g, 0, Math.round(y), w, 1, faint)
  for (let k = -h; k < w + h; k += cell) {
    line(g, k, 0, k + h * 0.577, h, PSY[3])
    line(g, k, 0, k - h * 0.577, h, PSY[3])
  }
  // Nodes lit where lines meet.
  for (let y = 0, row = 0; y < h; y += dy, row++)
    for (let x = (row % 2) * (cell / 2); x < w; x += cell) rect(g, Math.round(x), Math.round(y), 1, 1, PSY[1])
  return cv
}

/** Leaf i: falling under the canopy, held where it was, then turning round the tree; and how near (−1 behind it). */
function leafAt(s: Raid & AX, i: number, t: number): [number, number, number] {
  const [x0, y0, v] = s.leaves[i]!
  const fall = (tt: number) => y0 + ((tt * v) % (s.top - y0))
  if (t < T_HOLD) return [x0 + Math.sin(t * 2 + i) * 4, fall(t), 1]
  // Slowing to a stop, then held.
  const hx = x0 + Math.sin(T_HOLD * 2 + i) * 4
  const hy = fall(T_HOLD) + v * 0.25 * ease.outC(span(t, T_HOLD, T_HOLD + 0.5))
  // Then swung round the trunk as on a turntable seen from a little above, each at its own radius, rising as it goes.
  // Every other one starts on the ring's far side, so the ring is full all round once it turns.
  const turn = ease.inQ(span(t, T_LATTICE + 0.3, T_GLARE)) * 2.6
  const dx = hx - s.crown[0]
  const R = Math.max(Math.abs(dx) + 4, s.D.cw * 0.45)
  const a0 = i % 2 ? Math.PI - Math.asin(dx / R) : Math.asin(dx / R)
  const a = a0 + turn
  return [
    s.crown[0] + Math.sin(a) * R,
    hy + (Math.cos(a) - Math.cos(a0)) * R * 0.2 - turn * 4,
    lerp(1, Math.cos(a), Math.min(1, turn * 2)),
  ]
}

export const articunoGalarCinema = raidCinema<AX>({
  id: 'cinema-articuno-galar',
  reveal: A_REVEAL,
  seed: 10169,
  aura: ART,
  flash: '#f8e8ff',
  feet: 0.6,
  rays: 0.65,
  bob: 2,
  shakes: [
    [T_GLARE, 0.5, 3],
    [A_REVEAL, 0.4, 2],
  ],
  flashes: [[T_GLARE, 0.2, '#f0d0ff', 0.55]],
  setup(s) {
    const r = s.r
    const H = dynaHill(s, r, NIGHT)
    for (let i = 0; i < 40; i++)
      rect(H.sky.g, r.range(0, s.w), r.range(0, s.h * 0.4), 1, 1, r() < 0.3 ? '#ffffff' : '#8a88c8')
    // Falling from under the crown, never out of the empty sky past its ends.
    const reach = Math.min(s.w * 0.44, H.D.cw * 0.85)
    const leaves: [number, number, number][] = Array.from({ length: Math.round(28 * s.many) + 6 }, () => [
      r.range(s.cx - reach, s.cx + reach),
      r.range(H.crown[1], H.crown[1] + H.D.ch * 0.55),
      r.range(14, 30),
    ])
    return settle({
      ...H,
      lattice: lattice(s.w, s.h, Math.max(16, Math.round(s.m * 0.12))),
      leaves,
      shards: [],
      eyes: [Math.round(Math.max(20, s.m * 0.17)), Math.round(s.h * 0.15)],
    })
  },
  step(s, t, dt) {
    const r = s.r
    // The glare shatters every held leaf into violet ice.
    if (t >= T_GLARE && t - dt < T_GLARE)
      for (let i = 0; i < s.leaves.length; i++) {
        const [x, y] = leafAt(s, i, t)
        for (let k = 0; k < 3; k++)
          s.shards.push(makeShard(r, x, y, r.range(40, 110), k ? PSY[2] : PSY[1], '#ffffff', 0.3))
      }
    stepShards(s.shards, dt, { g: 60, drag: 1.5 })
    // Psychic motes rising off the lattice while it holds.
    if (t > T_LATTICE && t < A_REVEAL && r() < 0.5 * s.many)
      s.fx.add({
        x: r.range(0, s.w),
        y: r.range(0, s.h * 0.6),
        vy: -r.range(5, 15),
        life: 0.8,
        size: 1,
        shape: 'plus',
        colors: [PSY[1], PSY[2], PSY[3]],
      })
    if (t > A_REVEAL && r() < 0.3 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.6, s.sz.w * 0.6),
        y: s.feet - r.range(0, s.sz.h),
        vy: -r.range(8, 16),
        life: 1,
        size: 1,
        shape: 'star',
        colors: [ART[1], ART[2], ART[3]],
      })
  },
  back(g, s, t) {
    g.drawImage(s.sky, 0, 0)
    // The lattice spreading across the sky from above the tree, its light pulsing.
    const R = ease.outC(span(t, T_LATTICE, T_LATTICE + 0.7)) * Math.hypot(s.w, s.h)
    const fade = 1 - span(t, A_REVEAL, A_REVEAL + 0.8) * 0.7
    if (R > 1) {
      const lat = s.lattice
      const k = (0.6 + 0.4 * Math.sin(t * 8)) * fade
      for (let y = 0; y < s.top; y++) {
        const dy = y - s.crown[1]
        const hw2 = R * R - dy * dy
        if (hw2 <= 0) continue
        const hw = Math.round(Math.sqrt(hw2))
        const x0 = Math.max(0, s.crown[0] - hw)
        const x1 = Math.min(s.w, s.crown[0] + hw)
        if (x1 > x0 && (k > 0.6 || y % 2)) g.drawImage(lat, x0, y, x1 - x0, 1, x0, y, x1 - x0, 1)
      }
    }
    g.drawImage(s.tree, 0, 0)
    glints(g, s, t, 1 - span(t, T_EYES, T_GLARE) * 0.6)
    // The cold: everything gone violet under the gaze.
    const cold = span(t, T_EYES, T_GLARE) * (1 - span(t, A_REVEAL, A_REVEAL + 0.6) * 0.6)
    if (cold > 0) wash(g, '#3a1a6a', 0.4 * cold, 8)
    // The leaves: falling, held, turning; outlined in violet once the lattice holds them.
    if (t < T_GLARE)
      for (let i = 0; i < s.leaves.length; i++) {
        const [x, y, near] = leafAt(s, i, t)
        // Held: a violet light round it, its colour gone cold.
        const held = span(t, T_LATTICE, T_LATTICE + 0.4)
        const c = held > 0.5 ? ['#e8c8ff', '#b07ae0', '#6a3aa0'] : ['#8ab8a0', '#3a6656', '#163032']
        // Swung round behind the tree: smaller and dim.
        if (near < -0.2) {
          rect(g, x - 1, y, 2, 1, c[2]!)
          continue
        }
        if (held > 0) g.drawImage(glow(5, PSY[2], 1.2, 0.8 * held), Math.round(x) - 5, Math.round(y) - 5)
        rect(g, x - 2, y, 4, 2, c[1]!)
        rect(g, x - 1, y - 1, 2, 1, c[0]!)
        rect(g, x, y + 2, 2, 1, c[2]!)
      }
    drawShards(g, s.shards)
    drawEyes(g, s, t)
    // The glare: two beams from the eyes down to where the bird will be.
    const gq = span(t, T_GLARE - 0.05, T_GLARE + 0.35)
    if (gq > 0 && gq < 1)
      for (const side of [-1, 1]) {
        const ex = s.cx + side * s.eyes[0]
        const wd = Math.round(lerp(5, 1, gq))
        line(g, ex, s.eyes[1], s.cx, s.feet - s.sz.h / 2, PSY[2], wd + 2)
        line(g, ex, s.eyes[1], s.cx, s.feet - s.sz.h / 2, '#ffffff', wd)
      }
  },
  before(g, s, t) {
    if (t < T_DESCEND) return
    const q = ease.outC(span(t, T_DESCEND, A_REVEAL - 0.05))
    drawSprite(g, s.mon, s.cx, Math.round(lerp(s.eyes[1] + s.sz.h * 0.5, s.feet, q)), {
      sil: '#1a0a30',
      outline: Math.floor(t * 14) % 2 ? ART[1] : ART[2],
      wave: { amp: Math.round(2 * (1 - q)), len: 8, phase: t * 30 },
    })
  },
  sounds: [
    [0.05, () => hiss(2, { freq: 1500, type: 'highpass', vol: 0.02 })],
    [T_HOLD, () => tone(880, 0.8, { type: 'sine', vol: 0.03, slide: -440 })],
    [T_HOLD + 0.1, () => tone(220, 2, { type: 'sine', vol: 0.03 })],
    [T_LATTICE, () => fxSound('psychic.focus')],
    ...[0, 1, 2, 3].map(
      (i) =>
        [
          T_LATTICE + 0.15 + i * 0.12,
          () => tone(1319 + i * 220, 0.06, { type: 'triangle', vol: 0.02 }),
        ] as const,
    ),
    [T_EYES, () => (tone(110, 1, { type: 'sawtooth', vol: 0.03, slide: 55 }), fxSound('nightmare.breath'))],
    [T_EYES + 0.45, () => tone(1760, 0.08, { type: 'square', vol: 0.02 })],
    [T_EYES + 0.7, () => tone(1760, 0.08, { type: 'square', vol: 0.02 })],
    [T_EYES + 0.95, () => tone(2093, 0.2, { type: 'square', vol: 0.025 })],
    [T_GLARE, () => (fxSound('psychic.slam'), hiss(0.5, { freq: 5000, slide: -3000, vol: 0.06 }))],
    [T_DESCEND, () => tone(660, 0.6, { type: 'triangle', vol: 0.03, slide: -220 })],
  ],
})

/** The two eyes in the sky: opening, looking left, right, then at you, narrowing as they glare, closing into the bird. */
function drawEyes(g: G, s: Raid & AX, t: number) {
  const open =
    ease.outBack(span(t, T_EYES, T_EYES + 0.3), 1.5) * (1 - span(t, T_DESCEND - 0.05, T_DESCEND + 0.2))
  if (open <= 0.02) return
  const narrow = lerp(1, 0.45, span(t, T_GLARE - 0.25, T_GLARE))
  const look = t < T_EYES + 0.45 ? 0 : t < T_EYES + 0.7 ? -1 : t < T_EYES + 0.95 ? 1 : 0
  const [ex, ey] = s.eyes
  const ew = Math.round(Math.max(12, s.m * 0.11))
  const eh = Math.max(1, Math.round(ew * 0.45 * open * narrow))
  const gr = Math.round(ew * 2.2)
  for (const side of [-1, 1]) {
    const x = s.cx + side * ex
    g.drawImage(glow(gr, PSY[2], 1.3, 0.6 * open), x - gr, ey - gr)
    // An almond: wide, pointed at both ends, the inner corner lower (a hard, cold look).
    for (let dx = -ew; dx <= ew; dx++) {
      const k = 1 - (dx / ew) ** 2
      const hh = Math.round(eh * k)
      const tilt = Math.round(side * dx * 0.12 * (1 - narrow + 0.3))
      if (hh > 0) rect(g, x + dx, ey - hh + tilt, 1, hh * 2, '#fff0ff')
      rect(g, x + dx, ey - hh - 1 + tilt, 1, 1, PSY[3])
    }
    const ir = Math.max(1, Math.min(eh, Math.round(ew * 0.4)))
    const ix = x + look * Math.round(ew * 0.4)
    ellipse(g, ix, ey, ir, Math.min(ir, eh), '#e0305a')
    ellipse(g, ix, ey, Math.max(1, ir >> 1), Math.max(1, Math.min(ir, eh) >> 1), '#3a0010')
    rect(g, ix - 1, ey - 1, 1, 1, '#ffffff')
  }
}

// ------------------------------------------------------------------------------------------------- Zapdos (Galar)

const ZAP = ['#ffffff', '#ffe0a0', '#ff8a2a', '#7a2a0a'] as const
const Z_REVEAL = 4.4
const T_RUN = 0.95
const T_JUMP = 2.55
const T_HANG = 3.05
const T_DIVE = 3.3
const T_KICK = 3.7

type ZX = Hill & { shards: Shard[]; cracks: [number, number][][]; sun: [number, number] }

/** Where it is on its run round the hill (and how near: 1 in front, −1 behind the tree), before the jump. */
function runAt(s: Raid & ZX, t: number): [number, number, number] {
  const q = span(t, T_RUN, T_JUMP)
  const a = Math.PI * 0.95 + ease.ioS(q) * Math.PI * 2.55
  const rx = s.w * 0.42
  const ry = s.h * 0.05
  return [s.cx + Math.cos(a) * rx, s.top - 2 + Math.sin(a) * ry, Math.sin(a)]
}

export const zapdosGalarCinema = raidCinema<ZX>({
  id: 'cinema-zapdos-galar',
  reveal: Z_REVEAL,
  seed: 10170,
  aura: ZAP,
  flash: '#fff4e0',
  feet: 0.6,
  rays: 0.55,
  bob: 0,
  shakes: [
    ...Array.from({ length: 8 }, (_, i) => [T_RUN + i * 0.2, 0.08, 1] as const),
    [T_KICK, 0.7, 6],
    [Z_REVEAL, 0.4, 2],
  ],
  flashes: [[T_KICK, 0.25, '#ffe8c0', 0.7]],
  setup(s) {
    const r = s.r
    const H = dynaHill(s, r, AFTERNOON)
    const cracks = Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * (0.05 + (i / 8) * 0.9) + r.range(-0.1, 0.1)
      const len = r.range(s.w * 0.2, s.w * 0.45)
      return bolt(
        r,
        s.cx,
        s.feet + 2,
        s.cx + Math.cos(a) * len,
        s.feet + 2 + Math.sin(a) * len * 0.35,
        0.3,
        3,
      )
    })
    return settle({
      ...H,
      shards: [],
      cracks,
      sun: [Math.round(s.cx + s.w * 0.16), Math.round(Math.max(s.h * 0.12, s.sz.h * 0.7))],
    })
  },
  step(s, t, dt) {
    const r = s.r
    // Dust kicked up behind it as it runs.
    if (t > T_RUN && t < T_JUMP && r() < 0.9 * s.many) {
      const [x, y, d] = runAt(s, t)
      const k = 0.7 + d * 0.3
      s.fx.add({
        x,
        y,
        vx: r.range(-10, 10),
        vy: -r.range(4, 14),
        drag: 2,
        life: 0.8,
        size: Math.round(2 * k + 1),
        size1: Math.round(5 * k),
        shape: 'smoke',
        colors: ['#e8d0a0', '#c8a878'],
      })
    }
    if (t >= T_KICK && t - dt < T_KICK) {
      for (let i = 0; i < 40 * s.many; i++) {
        const sh = makeShard(
          r,
          s.cx + r.range(-10, 10),
          s.feet,
          r.range(80, 200),
          r() < 0.5 ? '#8a6a4a' : '#6a4a2a',
          '#c8a878',
          0.9,
        )
        s.shards.push(sh)
      }
      for (let i = 0; i < 40 * s.many; i++) {
        const side = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: s.cx + side * r.range(0, 20),
          y: s.feet,
          vx: side * r.range(40, 160),
          vy: -r.range(10, 50),
          drag: 2,
          life: r.range(0.8, 1.4),
          size: r.int(3, 5),
          size1: 8,
          shape: 'smoke',
          colors: ['#f0e0c0', '#d0b890'],
        })
      }
    }
    stepShards(s.shards, dt, { floor: s.feet + 8 })
    // Orange energy crackling round its leg as it dives.
    if (t > T_DIVE && t < T_KICK && r() < s.many) {
      const [x, y] = diveAt(s, t)
      s.fx.add({
        x: x + r.range(-6, 6),
        y: y - r.range(0, 10),
        vx: r.range(-40, 40),
        vy: -r.range(20, 60),
        drag: 3,
        life: 0.3,
        size: 1,
        shape: 'star',
        colors: [ZAP[0], ZAP[1], ZAP[2]],
      })
    }
  },
  back(g, s, t) {
    g.drawImage(s.sky, 0, 0)
    // The sun it leaps into.
    const [sx, sy] = s.sun
    const sr = Math.round(Math.max(14, s.m * 0.11))
    g.drawImage(glow(sr * 3, '#ffd08a', 1.3, 0.7), sx - sr * 3, sy - sr * 3)
    ellipse(g, sx, sy, sr, sr, '#fff0c8')
    ellipse(g, sx - 2, sy - 2, sr - 3, sr - 3, '#ffffff')
    // The grass flattened in a ring where it ran.
    const ring = span(t, T_RUN, T_JUMP)
    if (ring > 0)
      for (let k = 0; k < 64 * ring; k++) {
        const a = (k / 64) * Math.PI * 2
        rect(g, s.cx + Math.cos(a) * s.w * 0.42, s.top - 2 + Math.sin(a) * s.h * 0.05, 3, 1, '#c8e890')
      }
    // Running behind the tree: drawn before it.
    if (t > T_RUN && t < T_JUMP) {
      const [x, y, d] = runAt(s, t)
      if (d < 0) runner(g, s, t, x, y, d)
    }
    g.drawImage(s.tree, 0, 0)
    glints(g, s, t, 0.8)
    // The kick's cracks, splitting out across the hill.
    const cq = span(t, T_KICK, T_KICK + 0.2)
    if (cq > 0)
      for (const c of s.cracks) {
        const n = Math.max(2, Math.round(c.length * cq))
        const hot = 1 - span(t, T_KICK + 0.4, Z_REVEAL + 0.4)
        polyline(g, c.slice(0, n), '#1a0e06', 3)
        if (hot > 0) polyline(g, c.slice(0, n), hot > 0.5 ? ZAP[1] : ZAP[2])
      }
    drawShards(g, s.shards)
  },
  before(g, s, t) {
    if (t > T_RUN && t < T_JUMP) {
      const [x, y, d] = runAt(s, t)
      if (d >= 0) runner(g, s, t, x, y, d)
    }
    // The leap into the sun, the hang there, the dive.
    if (t >= T_JUMP && t < T_HANG) {
      const q = ease.outC(span(t, T_JUMP, T_HANG))
      const [x0, y0] = runAt(s, T_JUMP)
      const p = quad(
        { x: x0, y: y0 },
        { x: lerp(x0, s.sun[0], 0.5), y: s.h * 0.1 },
        { x: s.sun[0], y: s.sun[1] + s.sz.h * 0.35 },
        q,
      )
      drawSprite(g, s.mon, p.x, p.y, {
        sx: lerp(0.6, 0.9, q),
        sy: lerp(0.6, 0.9, q),
        sil: '#2a1206',
        outline: ZAP[2],
      })
    }
    // High over the canopy, black against the sun's full blaze.
    const blaze = span(t, T_JUMP + 0.3, T_HANG) * (1 - span(t, T_DIVE, T_DIVE + 0.2))
    if (blaze > 0) {
      const [sx, sy] = s.sun
      const sr = Math.round(Math.max(18, s.m * 0.16) * lerp(0.7, 1, blaze))
      g.drawImage(glow(sr * 2, '#ffe0a0', 1.2, 0.85 * blaze), sx - sr * 2, sy - sr * 2)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.6
        const L = sr * (1.4 + (i % 2) * 0.5)
        line(
          g,
          sx + Math.cos(a) * sr,
          sy + Math.sin(a) * sr,
          sx + Math.cos(a) * L,
          sy + Math.sin(a) * L,
          '#fff0c8',
          i % 2 ? 1 : 2,
        )
      }
      ellipse(g, sx, sy, sr, sr, '#fff6dc')
      ellipse(g, sx - 1, sy - 1, sr - 3, sr - 3, '#ffffff')
    }
    if (t >= T_HANG && t < T_DIVE)
      drawSprite(g, s.mon, s.sun[0], s.sun[1] + s.sz.h * 0.35 - Math.round(span(t, T_HANG, T_DIVE) * 3), {
        sx: 0.9,
        sy: 0.9,
        sil: '#2a1206',
        outline: ZAP[2],
      })
    if (t >= T_DIVE && t < T_KICK) {
      const [x, y] = diveAt(s, t)
      // The streak behind the kick.
      const [x0, y0] = diveAt(s, Math.max(T_DIVE, t - 0.12))
      line(g, x0, y0 - s.sz.h * 0.3, x, y - s.sz.h * 0.3, ZAP[2], 7)
      line(g, x0, y0 - s.sz.h * 0.3, x, y - s.sz.h * 0.3, ZAP[1], 3)
      drawSprite(g, s.mon, x, y, { sil: '#2a1206', outline: Math.floor(t * 20) % 2 ? ZAP[0] : ZAP[2] })
    }
    if (t >= T_KICK)
      drawSprite(g, s.mon, s.cx, s.feet, {
        sil: '#2a1206',
        outline: Math.floor(t * 10) % 2 ? ZAP[1] : ZAP[2],
      })
  },
  front(g, s, t) {
    // Speed lines closing on the impact as it dives, then the shock.
    const k = span(t, T_DIVE, T_KICK) * (1 - span(t, T_KICK, T_KICK + 0.25))
    if (k > 0) speedLines(g, s.w, s.h, s.cx, s.feet - 10, k, pattern(g, '#fff4e0', 9), 10170)
    for (const [d, c] of [
      [0, ZAP[0]],
      [0.08, ZAP[1]],
      [0.18, ZAP[2]],
    ] as const)
      burstRing(g, s.cx, s.feet, span(t, T_KICK + d, T_KICK + d + 0.5), s.w * 0.8, 3, c)
  },
  sounds: [
    [0.05, () => hiss(1.5, { freq: 1800, type: 'highpass', vol: 0.02 })],
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_RUN + i * 0.2,
          () => (tone(80, 0.1, { type: 'sine', vol: 0.09 }), hiss(0.06, { freq: 300, vol: 0.05 })),
        ] as const,
    ),
    [T_JUMP, () => hiss(0.4, { freq: 600, slide: 2000, vol: 0.06 })],
    [T_HANG, () => tone(1047, 0.25, { type: 'triangle', vol: 0.03 })],
    [
      T_DIVE,
      () => (
        hiss(0.4, { freq: 3000, slide: -2400, vol: 0.07 }),
        tone(880, 0.4, { type: 'sawtooth', vol: 0.03, slide: -600 })
      ),
    ],
    [
      T_KICK,
      () => (
        fxSound('impact.hit'),
        fxSound('ug.collapse'),
        tone(55, 0.6, { type: 'sine', vol: 0.18, slide: -20 })
      ),
    ],
  ],
})

/** Running round the hill: its silhouette, smaller behind the tree than in front, kicking up its heels. */
function runner(g: G, s: Raid, t: number, x: number, y: number, d: number) {
  const k = lerp(0.35, 0.6, (d + 1) / 2)
  const [px] = runAt(s as Raid & ZX, t - 0.02)
  const bob = Math.floor(t * 16) % 2 ? -1 : 0
  drawSprite(g, s.mon, x, y + bob, { sx: k, sy: k, sil: '#3a1a0a', outline: ZAP[2], flip: x > px })
  // Speed streaks behind it.
  const dir = x > px ? -1 : 1
  for (let i = 0; i < 3; i++)
    line(
      g,
      x + dir * (s.sz.w * k * 0.4),
      y - 4 - i * 4,
      x + dir * (s.sz.w * k * 0.4 + 10 + i * 4),
      y - 4 - i * 4,
      ZAP[1],
    )
}

/** The dive from the sun down to the hill, the kick first. */
const diveAt = (s: Raid & ZX, t: number): [number, number] => {
  const q = ease.inQ(span(t, T_DIVE, T_KICK))
  return [lerp(s.sun[0], s.cx, q), lerp(s.sun[1] + s.sz.h * 0.35, s.feet, q)]
}

// ------------------------------------------------------------------------------------------------ Moltres (Galar)

const MOL = ['#ffd0f0', '#e070d0', '#8a2aa8', '#2a0a3a'] as const
const DARK = ['#ff6ad0', '#c82a9a', '#6a1a7a', '#2a0a30', '#0a020c'] as const
const M_REVEAL = 4.6
const T_ECLIPSE = 0.95
const T_WITHER = 1.6
const T_CREEP = 2.0
const T_WINGS = 2.95
const T_CLOSE = 3.6
const T_OPEN = 4.2

type MX = Hill & {
  sun: [number, number]
  sr: number
  /** The tree under the eclipse, whole; then withered, from most of its leaves down to its last few. */
  dim: Canvas
  dead: Canvas[]
}

/** The hill's grass at the tree's roots, darkened as the eclipse darkens the hill. */
const UNDER: Pal = {
  ...DUSK,
  grass: mix(DUSK.grass, '#14041a', 0.55),
  hill: DUSK.hill.map((c) => mix(c, '#14041a', 0.55)) as unknown as Pal['hill'],
}

export const moltresGalarCinema = raidCinema<MX>({
  id: 'cinema-moltres-galar',
  reveal: M_REVEAL,
  seed: 10171,
  aura: MOL,
  flash: '#ffe0f4',
  feet: 0.6,
  rays: 0.6,
  bob: 2,
  shakes: [
    [T_CLOSE + 0.3, 0.4, 3],
    [M_REVEAL, 0.5, 3],
  ],
  setup(s) {
    const H = dynaHill(s, s.r, DUSK)
    return settle({
      ...H,
      dim: dynaTree(s, H.D, UNDER, ECLIPSE),
      dead: [0.75, 0.5, 0.3, 0.12].map((keep) => dynaTree(s, H.D, UNDER, WITHERED, { keep, holes: 0.3 })),
      sun: [s.cx, Math.round(s.h * 0.15)],
      sr: Math.round(Math.max(18, s.m * 0.14)),
    })
  },
  step(s, t) {
    const r = s.r
    // Dead leaves falling as the tree withers.
    if (t > T_WITHER && t < T_CLOSE && r() < 0.8 * s.many)
      s.fx.add({
        x: s.crown[0] + r.range(-s.w * 0.4, s.w * 0.4),
        y: s.crown[1] + r.range(-10, 20),
        vx: r.range(-8, 8),
        vy: r.range(14, 30),
        life: 2,
        size: 2,
        shape: 'leaf',
        spin: r.range(-4, 4),
        colors: ['#6a5038'],
        light: '#8a7050',
        dark: '#3a2a1a',
      })
    // Violet embers off the creeping flames.
    if (t > T_CREEP && r() < 1.2 * s.many) {
      const edge = r() < 0.6
      s.fx.add({
        x: edge ? r.range(0, s.w) : r() < 0.5 ? r.range(0, 10) : r.range(s.w - 10, s.w),
        y: edge ? s.h - r.range(0, creep(t) * s.h * 0.35) : r.range(s.h * 0.3, s.h),
        vx: r.range(-10, 10),
        vy: -r.range(20, 50),
        life: 0.9,
        size: 1,
        shape: r() < 0.5 ? 'px' : 'sq',
        colors: [DARK[0], DARK[1], DARK[2]],
      })
    }
  },
  back(g, s, t) {
    g.drawImage(s.sky, 0, 0)
    // The darkening: the sky sinking to purple-black as the eclipse comes.
    const dark = span(t, T_ECLIPSE, T_ECLIPSE + 0.8)
    if (dark > 0) wash(g, '#14041a', 0.55 * dark, 8)
    drawEclipse(g, s, t)
    // The tree: lit by the dusk, gone dark under the eclipse, then withering, its dead leaves dropping off the boughs
    // clump by clump till the black sun shows through them. Every picture holds the boughs and each holds less than
    // the one over it, so only the topmost whole one and those over it need drawing.
    const wither = span(t, T_WITHER, T_WITHER + 0.8)
    const bare = span(t, T_WITHER + 0.5, T_CREEP + 0.8) * (s.dead.length - 1)
    const stack: [Canvas, number][] = [
      ...s.dead.map((c, i): [Canvas, number] => [c, 1 - span(bare, i, i + 1)]).reverse(),
      [s.dim, 1 - wither],
      [s.tree, 1 - dark],
    ]
    let from = 0
    for (let i = 0; i < stack.length; i++) if (stack[i]![1] >= 1) from = i
    for (const [c, k] of stack.slice(from)) dissolve(g, c, k)
    glints(g, s, t, 1 - wither)
    drawWings(g, s, t)
    drawCreep(g, s, t)
  },
  before(g, s, t) {
    if (t < T_OPEN) return
    drawSprite(g, s.mon, s.cx, s.feet, { sil: '#14041a', outline: Math.floor(t * 14) % 2 ? MOL[0] : MOL[1] })
  },
  front(g, s, t) {
    // The wings closing over everything like a cloak, then opening on the bird.
    const close =
      ease.inQ(span(t, T_CLOSE, T_CLOSE + 0.35)) * (1 - ease.outC(span(t, T_OPEN, M_REVEAL + 0.2)))
    if (close > 0) cloak(g, s, t, close)
  },
  sounds: [
    [0.05, () => hiss(2, { freq: 300, type: 'lowpass', vol: 0.04 })],
    [T_ECLIPSE, () => (fxSound('nightmare.fall'), tone(55, 1.5, { type: 'sawtooth', vol: 0.03 }))],
    [T_WITHER, () => hiss(1, { freq: 2000, slide: -1600, vol: 0.03 })],
    [T_CREEP, () => fxSound('fire.stream')],
    [T_CREEP + 0.5, () => tone(147, 1.2, { type: 'sawtooth', vol: 0.03, slide: -40 })],
    // A cruel laugh: three falling notes, detuned.
    ...[0, 1, 2].map(
      (i) =>
        [
          T_WINGS + i * 0.14,
          () => (
            tone(523 - i * 60, 0.12, { type: 'square', vol: 0.025, slide: -80 }),
            tone(530 - i * 60, 0.12, { type: 'sawtooth', vol: 0.015 })
          ),
        ] as const,
    ),
    [T_WINGS + 0.5, () => fxSound('nightmare.charge')],
    [T_CLOSE, () => hiss(0.5, { freq: 400, slide: -200, vol: 0.1 })],
    [T_CLOSE + 0.3, () => tone(40, 0.8, { type: 'sine', vol: 0.15 })],
    [T_OPEN, () => (fxSound('nightmare.beam'), hiss(0.4, { freq: 1500, slide: 1500, vol: 0.06 }))],
  ],
})

/** How far the dark flames have crept in, 0..1. */
const creep = (t: number) =>
  ease.ioS(span(t, T_CREEP, T_CLOSE)) * (1 - span(t, M_REVEAL, M_REVEAL + 1.2) * 0.4)

/** The sun, a black disc sliding over it, and the corona of dark fire round the eclipse. */
function drawEclipse(g: G, s: Raid & MX, t: number) {
  const [x, y] = s.sun
  const r = s.sr
  const q = ease.ioS(span(t, T_ECLIPSE, T_ECLIPSE + 0.8))
  if (q < 1) {
    g.drawImage(glow(r * 3, '#ff8a4a', 1.3, 0.7 * (1 - q)), x - r * 3, y - r * 3)
    ellipse(g, x, y, r, r, '#ffd0a0')
  }
  // The corona: tongues of violet fire licking out round the black disc.
  if (q > 0.5) {
    const k = span(q, 0.5, 1)
    const gr = Math.round(r * 2.4)
    g.drawImage(glow(gr, DARK[2], 1.3, 0.8 * k), x - gr, y - gr)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const len = r * (0.3 + 0.35 * k * (0.5 + 0.5 * Math.sin(t * 9 + i * 2.3)))
      line(
        g,
        x + Math.cos(a) * r,
        y + Math.sin(a) * r,
        x + Math.cos(a) * (r + len),
        y + Math.sin(a) * (r + len),
        i % 3 ? DARK[1] : DARK[0],
        2,
      )
    }
  }
  ellipse(g, lerp(x + r * 2.4, x, q), y, r, r, '#0a020c')
  if (q > 0.9) ellipseLine(g, x, y, r, r, DARK[0])
  // Malice: two slanted eyes glinting in the black sun, blinking once.
  const eyes = span(t, T_WITHER + 0.4, T_WITHER + 0.7) * (1 - span(t, T_CLOSE, T_CLOSE + 0.2))
  if (eyes > 0 && !(t > T_CREEP + 0.4 && t < T_CREEP + 0.48))
    for (const side of [-1, 1]) {
      const ex = x + side * Math.round(r * 0.38)
      const ey = y - Math.round(r * 0.1)
      const len = Math.max(3, Math.round(r * 0.3 * eyes))
      // Outer ends high, inner ends low: a glare, not a smile.
      line(g, ex + side * len, ey - Math.round(len * 0.5), ex - side * 1, ey + 1, DARK[0], 2)
      rect(g, ex, ey, 1, 1, '#ffffff')
    }
}

/** Dark flames creeping in from the bottom and the sides, flickering, eating the grass. */
function drawCreep(g: G, s: Raid & MX, t: number) {
  const k = creep(t)
  if (k <= 0) return
  const reach = s.h * 0.34 * k
  for (let x = 0; x < s.w; x += 2) {
    // Each column's tongue, rising and falling.
    const f = 0.65 + 0.35 * Math.sin(x * 0.37 + t * 11) * Math.sin(x * 0.13 - t * 7)
    const side = Math.max(0, 1 - Math.min(x, s.w - x) / (s.w * 0.3))
    const ht = Math.round(reach * f * (1 + side * 0.8))
    if (ht <= 0) continue
    const y = s.h - ht
    rect(g, x, y + Math.round(ht * 0.35), 2, ht, DARK[4])
    rect(g, x, y + Math.round(ht * 0.15), 2, Math.round(ht * 0.2), DARK[3])
    rect(g, x, y + 2, 2, Math.max(1, Math.round(ht * 0.13)), DARK[2])
    rect(g, x, y, 2, 2, (x + Math.floor(t * 20)) % 6 < 3 ? DARK[0] : DARK[1])
  }
  // Up the sides too.
  for (const side of [-1, 1])
    for (let y = Math.round(s.h * (1 - 0.9 * k)); y < s.h; y += 2) {
      const f = 0.6 + 0.4 * Math.sin(y * 0.3 + t * 10 + side)
      const wd = Math.round(s.w * 0.12 * k * f)
      const x = side < 0 ? 0 : s.w - wd
      rect(g, x, y, wd, 2, DARK[3])
      rect(g, side < 0 ? wd - 2 : x, y, 2, 2, (y + Math.floor(t * 20)) % 6 < 3 ? DARK[1] : DARK[2])
    }
}

/** A wing of black fire: broad feathers fanned out from its root, edged in violet, flames licking off their tips. */
function wing(g: G, x: number, y: number, side: number, span0: number, len: number, t: number) {
  for (let i = 7; i >= 0; i--) {
    // From up and out to down and out: a bird's wing spread, opening as it grows.
    const a = lerp(-0.2, -0.55 + i * 0.15, span0) + Math.sin(t * 6 + i) * 0.04
    const L = len * (1 - Math.abs(i - 2) * 0.07)
    const tx = x + side * Math.cos(a) * L
    const ty = y + Math.sin(a) * L
    // Across the feather, its width at the root.
    const nx = -Math.sin(a) * L * 0.16 * side
    const ny = Math.cos(a) * L * 0.16
    tri(g, x - nx, y - ny, x + nx, y + ny, tx, ty, DARK[4])
    tri(g, x, y, x + nx * 0.5, y + ny * 0.5, tx, ty, DARK[3])
    line(g, x + nx, y + ny, tx, ty, i % 2 ? DARK[1] : DARK[2])
    // Its tip burning.
    const fl = 3 + Math.round(2 * Math.sin(t * 14 + i * 2))
    line(g, tx, ty, tx + side * fl, ty - fl, DARK[1], 2)
    rect(g, tx + side * fl, ty - fl - 1, 2, 2, DARK[0])
  }
}

/** The eclipse's corona spreading into two great wings of black fire. */
function drawWings(g: G, s: Raid & MX, t: number) {
  if (t <= T_WINGS || t > T_CLOSE + 0.4) return
  const q = ease.outBack(span(t, T_WINGS, T_WINGS + 0.5), 1.3)
  const [x, y] = s.sun
  for (const side of [-1, 1])
    wing(g, x + side * s.sr * 0.5, y + s.sr * 0.3, side, q, Math.min(s.w * 0.52, s.h * 0.36) * q, t)
}

/** The cloak: the wings swept down over the whole screen, all black fire, edged in violet where they meet. */
function cloak(g: G, s: Raid & MX, t: number, k: number) {
  // Two dark curtains from the sides, their edges ragged with flame, meeting in the middle.
  const reach = (s.w / 2 + 6) * k
  for (let y = 0; y < s.h; y += 2) {
    const flick = Math.round(Math.sin(y * 0.4 + t * 14) * 3 + Math.sin(y * 0.11 - t * 6) * 4)
    const wd = Math.max(0, Math.round(reach + flick * k))
    rect(g, 0, y, wd, 2, DARK[4])
    rect(g, s.w - wd, y, wd, 2, DARK[4])
    if (wd > 2 && wd < s.w / 2) {
      rect(g, wd - 2, y, 2, 2, (y >> 1) % 3 ? DARK[2] : DARK[0])
      rect(g, s.w - wd, y, 2, 2, (y >> 1) % 3 ? DARK[2] : DARK[0])
    }
  }
  // Closed: only its eyes' glow, a violet light in the dark.
  if (k > 0.95) {
    const gr = Math.round(s.m * 0.2)
    g.drawImage(glow(gr, DARK[2], 1.3, 0.6), s.cx - gr, s.feet - s.sz.h * 0.6 - gr)
  }
}
