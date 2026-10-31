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
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  pattern,
  polyline,
  rect,
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
import { peaks, raidCinema, speedLines, type Raid } from './gen8kit'

interface Pal {
  sky: string[]
  peak: [string, string]
  hill: string[]
  grass: string
  trunk: [string, string, string]
  leaf: [string, string, string]
}

const NIGHT: Pal = {
  sky: ['#04030e', '#0c0a26', '#1a1640', '#2a2458'],
  peak: ['#24204a', '#7a78b0'],
  hill: ['#1a3028', '#12241e', '#0a1612'],
  grass: '#2a4a3a',
  trunk: ['#1a1418', '#3a2c30', '#0a0608'],
  leaf: ['#12302a', '#1e4a3a', '#3a7a5a'],
}
const AFTERNOON: Pal = {
  sky: ['#4a7ac8', '#7aa8e0', '#c8d8e8', '#ffe0a8', '#ffc078'],
  peak: ['#8a90b0', '#f8f4f0'],
  hill: ['#6aa040', '#4a8a30', '#3a7024'],
  grass: '#8ac850',
  trunk: ['#5a3a24', '#8a5a34', '#2a1a10'],
  leaf: ['#2a6a2a', '#3a8a34', '#7ac04a'],
}
const DUSK: Pal = {
  sky: ['#2a0a24', '#5a1430', '#a02a30', '#e05a30', '#ff9a4a'],
  peak: ['#3a1428', '#c88a8a'],
  hill: ['#3a3020', '#2a2418', '#1a160e'],
  grass: '#5a5a2a',
  trunk: ['#2a1810', '#4a2c1a', '#140a06'],
  leaf: ['#2a4a1a', '#3a6a24', '#6a9a3a'],
}

interface Hill {
  sky: Canvas
  tree: Canvas
  /** The canopy alone again, withered (Moltres's). */
  dead?: Canvas
  top: number
  /** The canopy's middle. */
  crown: [number, number]
}

/** The hill and the great tree on it, in a palette: the sky and hill in one picture, the tree in another. */
function dynaHill(s: Raid, r: Rng, P: Pal, withered = false): Hill {
  const { w, h, cx } = s
  const top = s.feet + 4
  const sky = canvas(w, h)
  const g = sky.g
  // The sky down to the hill, the peaks standing just behind it.
  g.drawImage(dGradient(w, h, P.sky), 0, 0)
  peaks(g, w, top + 8, Math.max(24, h * 0.13), r, P.peak[0], P.peak[1])
  // The hill: a broad dome under the tree, grass tufts on it.
  for (let x = 0; x < w; x++) {
    const d = (x - cx) / (w * 0.75)
    const y = Math.round(top + d * d * h * 0.22)
    rect(g, x, y, 1, h - y, P.hill[0]!)
    rect(g, x, y, 1, 1, P.grass)
    if (x % 3 === 0) rect(g, x, y - 1 - (x % 2), 1, 2, P.grass)
  }
  for (let y = top + 6; y < h; y += 5)
    for (let x = (y * 7) % 11; x < w; x += 11) {
      const d = (x - cx) / (w * 0.75)
      if (y > top + d * d * h * 0.22 + 3) rect(g, x, y, 3, 1, P.hill[1]!)
    }
  // Grass tufts and stones down the hill, bigger nearer.
  for (let i = 0; i < Math.round(w / 6); i++) {
    const x = r.range(0, w)
    const d = (x - cx) / (w * 0.75)
    const y0 = top + d * d * h * 0.22
    const y = r.range(y0 + 6, h)
    const k = 1 + ((y - top) / (h - top)) * 2
    if (r() < 0.15) {
      ellipse(g, x, y, Math.round(3 * k), Math.round(1.5 * k), P.hill[2]!)
      ellipse(g, x - 1, y - 1, Math.round(2 * k), Math.max(1, Math.round(k)), P.hill[1]!)
    } else for (let b = -1; b <= 1; b++) line(g, x, y, x + b * k, y - 2 * k, P.grass)
  }
  // The tree: a thick trunk flaring into roots, three boughs, a wide canopy of clumps.
  const tree = canvas(w, h)
  // A withering tree keeps its trunk solid in the background; only its canopy thins.
  const t = withered ? g : tree.g
  const tw = Math.round(Math.max(10, s.m * 0.1))
  const crown: [number, number] = [cx, Math.round(h * 0.26)]
  const cw = Math.min(w * 0.48, 120)
  const ch = Math.min(h * 0.16, 56)
  rect(t, cx - tw / 2, crown[1], tw, top - crown[1], P.trunk[0])
  rect(t, cx - tw / 2, crown[1], 2, top - crown[1], P.trunk[1])
  rect(t, cx + tw / 2 - 1, crown[1], 1, top - crown[1], P.trunk[2])
  for (let y = crown[1] + 10; y < top - 4; y += 7)
    rect(t, cx - tw / 2 + 3 + ((y * 5) % (tw - 5)), y, 1, 4, P.trunk[2])
  for (const side of [-1, 1]) {
    tri(t, cx + side * tw * 0.4, top - tw, cx + side * tw * 1.6, top + 2, cx, top + 2, P.trunk[0])
    line(t, cx + side * 2, crown[1] + ch * 0.5, cx + side * cw * 0.6, crown[1] + ch * 0.1, P.trunk[0], 3)
  }
  const leaf = withered ? (['#3a2a20', '#5a4030', '#7a6048'] as const) : P.leaf
  const canopy = (cg: G, pal: readonly string[], rr: Rng) => {
    for (let i = 0; i < 34; i++) {
      const a = rr() * Math.PI * 2
      const d = Math.sqrt(rr())
      const x = cx + Math.cos(a) * cw * d
      const y = crown[1] + Math.sin(a) * ch * d * 0.8
      const cr = rr.range(9, 15) * Math.min(1.4, s.m / 160)
      ellipse(cg, x, y + 2, cr, cr * 0.7, pal[0]!)
      ellipse(cg, x - 1, y, cr - 1, cr * 0.62, pal[1]!)
      ellipse(cg, x - 3, y - 3, cr * 0.5, cr * 0.32, pal[2]!)
    }
  }
  canopy(t, leaf, rng(1700))
  let dead: Canvas | undefined
  if (withered) {
    // Its healthy canopy, drawn over the dead one and dissolved away as it withers.
    dead = canvas(w, h)
    canopy(dead.g, P.leaf, rng(1700))
  }
  return { sky, tree, dead, top, crown }
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

/** Leaf i: falling under the canopy, held where it was, then turning round the tree. */
function leafAt(s: Raid & AX, i: number, t: number): [number, number] {
  const [x0, y0, v] = s.leaves[i]!
  const fall = (tt: number) => y0 + ((tt * v) % (s.top - y0))
  if (t < T_HOLD) return [x0 + Math.sin(t * 2 + i) * 4, fall(t)]
  // Slowing to a stop, then held.
  const held = fall(T_HOLD) + v * 0.25 * ease.outC(span(t, T_HOLD, T_HOLD + 0.5))
  const turn = ease.inQ(span(t, T_LATTICE + 0.3, T_GLARE)) * 1.6
  const dx = x0 - s.crown[0]
  const dy = held - s.crown[1]
  return [
    s.crown[0] + dx * Math.cos(turn) - dy * Math.sin(turn) * 0.5,
    s.crown[1] + dy * Math.cos(turn) + dx * Math.sin(turn) * 0.4,
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
    const leaves: [number, number, number][] = Array.from({ length: Math.round(28 * s.many) + 6 }, () => [
      r.range(s.w * 0.08, s.w * 0.92),
      r.range(H.crown[1], H.crown[1] + s.h * 0.1),
      r.range(14, 30),
    ])
    return {
      ...H,
      lattice: lattice(s.w, s.h, Math.max(16, Math.round(s.m * 0.12))),
      leaves,
      shards: [],
      eyes: [Math.round(Math.max(20, s.m * 0.17)), Math.round(s.h * 0.15)],
    }
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
    // The cold: everything gone violet under the gaze.
    const cold = span(t, T_EYES, T_GLARE) * (1 - span(t, A_REVEAL, A_REVEAL + 0.6) * 0.6)
    if (cold > 0) wash(g, '#3a1a6a', 0.4 * cold, 8)
    // The leaves: falling, held, turning; outlined in violet once the lattice holds them.
    if (t < T_GLARE)
      for (let i = 0; i < s.leaves.length; i++) {
        const [x, y] = leafAt(s, i, t)
        // Held: a violet light round it, its colour gone cold.
        const held = span(t, T_LATTICE, T_LATTICE + 0.4)
        if (held > 0) g.drawImage(glow(5, PSY[2], 1.2, 0.8 * held), Math.round(x) - 5, Math.round(y) - 5)
        const c = held > 0.5 ? ['#e8c8ff', '#b07ae0', '#6a3aa0'] : ['#7ac08a', '#3a8a5a', '#1e5a3a']
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
    return {
      ...H,
      shards: [],
      cracks,
      sun: [Math.round(s.cx + s.w * 0.16), Math.round(Math.max(s.h * 0.12, s.sz.h * 0.7))],
    }
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

type MX = Hill & { sun: [number, number]; sr: number }

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
    const H = dynaHill(s, s.r, DUSK, true)
    return { ...H, sun: [s.cx, Math.round(s.h * 0.15)], sr: Math.round(Math.max(18, s.m * 0.14)) }
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
    // The tree: whole, then withering, its living canopy dissolving off the dead one and the dead one thinning as its
    // leaves fall, the eclipse showing through the bare boughs.
    const wither = span(t, T_WITHER, T_WITHER + 0.8)
    const bare = span(t, T_WITHER + 0.5, T_CREEP + 0.8)
    dissolve(g, s.tree, 1 - bare * 0.6)
    if (wither < 1 && s.dead) dissolve(g, s.dead, 1 - wither)
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
