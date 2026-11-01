// Pecharunt's entrance (docs/53), on the battle stage: a Kitakami road at night under the moon, Mt. Oni far off, mist,
// a peach tree heavy with fruit, and a little roadside stand with a plate of pink mochi glowing on it. The mochi pulse,
// sweet and wrong, pink sparkles rising. Toxic chains burst out of the ground round the stand and rear up, the mist
// and the moon turning violet. The ripest peach drops from the tree and bounces down the road, bigger at each bounce,
// onto the stand; the chains coil round it. Its seam splits, poison hissing out, and on the reveal the shell opens.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { H, screenFlash, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { chain, moon, q4, ridge, stars } from './gen9kit'
import { burstRing, dGradient, dissolve, pulse } from './kit'

const REVEAL = 4.0
const MOCHI = [0.6, 0.95, 1.25] as const
const T_CHAINS = 1.5
const T_DROP = 2.35
/** The peach's bounces down the road: when it lands each time; the last is on the stand. */
const BOUNCES = [2.62, 2.88, 3.1] as const
const T_COIL = 3.1
const T_SPLIT = 3.5
const GROUND = 92
const TREE = { x: 64, y: 30 }

const PEACH = { lit: '#ffd8e4', body: '#ff94b4', shade: '#d0608a', dark: '#7a2a5a', leaf: '#4aa04a' }
const TOXIC = { dark: '#3a1448', lit: '#e070e8', glow: '#b040d0' }

type X = { back: Canvas; chains: [number, number][][] }

/** The road at night, drawn once: sky, moon, Mt. Oni, mist, the peach tree, the stand and its plate. */
function road(foe: { x: number; y: number }): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  const r = rng(1025)
  g.drawImage(dGradient(W, GROUND + 4, ['#05040e', '#0e0a22', '#1e1434', '#3a2440']), 0, 0)
  stars(g, r, W, 50, 50, '#f0e8ff', '#5a4a7a')
  moon(g, 32, 22, 9, '#f0ecd8', '#c8c0a0', '#5a4a7a')
  // Mt. Oni, far, two horns at its top.
  for (let y = 34; y < GROUND; y++) {
    const ww = Math.round((y - 34) * 1.3 + Math.sin(y / 3))
    rect(g, 132 - ww, y, ww * 2, 1, '#140e24')
  }
  rect(g, 129, 31, 2, 4, '#140e24')
  rect(g, 134, 31, 2, 4, '#140e24')
  ridge(g, W, GROUND, 8, '#0c0a18', 1025, GROUND + 4, 0.4)
  for (let x = 0; x < W; x += 2) rect(g, x, GROUND - 4 + ((x >> 3) % 2), 2, 1, '#4a3a5a')
  // The ground: grass, and the road winding up to the stand.
  g.drawImage(dGradient(W, H - GROUND, ['#141a14', '#1a2418', '#202c1c']), 0, GROUND)
  for (let y = GROUND; y < H; y++) {
    const k = (y - GROUND) / (H - GROUND)
    const cx = lerp(foe.x - 10, 90, k)
    const hw = Math.round(lerp(10, 46, k))
    rect(g, cx - hw, y, hw * 2, 1, y % 3 ? '#3a3024' : '#33291e')
  }
  for (let i = 0; i < 160; i++) {
    const x = r.range(0, W)
    const y = r.range(GROUND + 2, H)
    rect(g, x, y - 2, 1, 2, '#2a3a24')
  }
  // The peach tree: a crooked trunk, a round crown, peaches in it.
  rect(g, TREE.x - 3, TREE.y + 20, 6, GROUND - TREE.y - 18, '#2a1a14')
  line(g, TREE.x, TREE.y + 34, TREE.x - 14, TREE.y + 18, '#2a1a14', 3)
  line(g, TREE.x + 1, TREE.y + 30, TREE.x + 16, TREE.y + 16, '#2a1a14', 3)
  for (const [dx, dy, rr] of [
    [-16, 12, 14],
    [14, 10, 15],
    [0, 2, 17],
    [-4, 18, 13],
    [10, 20, 12],
  ] as const) {
    ellipse(g, TREE.x + dx, TREE.y + dy + 2, rr, Math.round(rr * 0.75), '#0e1a10')
    ellipse(g, TREE.x + dx - 1, TREE.y + dy, rr - 2, Math.round(rr * 0.7) - 1, '#1a2e1a')
    rect(g, TREE.x + dx - rr / 2, TREE.y + dy - rr / 2, 3, 1, '#2e4a28')
  }
  for (const [dx, dy] of [
    [-18, 16],
    [-6, 22],
    [16, 18],
    [-12, 4],
    [20, 8],
  ] as const) {
    ellipse(g, TREE.x + dx, TREE.y + dy, 2, 2, PEACH.shade)
    rect(g, TREE.x + dx - 1, TREE.y + dy - 1, 1, 1, PEACH.lit)
  }
  // The roadside stand: two posts, a little roof, a shelf with a plate.
  const sx = foe.x
  const sy = foe.y + 4
  rect(g, sx - 15, sy - 22, 2, 22, '#3a2416')
  rect(g, sx + 13, sy - 22, 2, 22, '#3a2416')
  rect(g, sx - 19, sy - 26, 38, 3, '#4a2a18')
  rect(g, sx - 19, sy - 26, 38, 1, '#7a4a28')
  rect(g, sx - 15, sy - 6, 30, 2, '#5a3a20')
  rect(g, sx - 15, sy - 6, 30, 1, '#8a5a30')
  return cv
}

/** Where the peach is: dropped from the tree, bouncing down the road, growing, landing on the stand. */
function peachAt(foe: { x: number; y: number }, t: number) {
  const pts = [
    { x: TREE.x - 6, y: TREE.y + 22, s: 0.35 },
    { x: 100, y: GROUND + 30, s: 0.6 },
    { x: 140, y: GROUND + 18, s: 0.85 },
    { x: foe.x, y: foe.y - 2, s: 1 },
  ]
  if (t < T_DROP) return pts[0]!
  const times = [T_DROP, ...BOUNCES]
  for (let i = 0; i < 3; i++) {
    const a = times[i]!
    const b = times[i + 1]!
    if (t < b) {
      const q = span(t, a, b)
      const p0 = pts[i]!
      const p1 = pts[i + 1]!
      // The first is a fall; then arcs, lower each time.
      const hop = i === 0 ? 0 : [0, 26, 16][i]!
      return {
        x: lerp(p0.x, p1.x, q),
        y: i === 0 ? lerp(p0.y, p1.y, ease.inQ(q)) : lerp(p0.y, p1.y, q) - Math.sin(q * Math.PI) * hop,
        s: lerp(p0.s, p1.s, q),
      }
    }
  }
  return pts[3]!
}

/** The peach: two lobes, a crease down the middle, a leaf; `split` opens the crease, poison light in it. */
function drawPeach(g: G, x: number, y: number, s: number, squash: number, split: number, t: number) {
  const R = Math.max(2, Math.round(16 * s))
  const ry = Math.round(R * squash)
  const cy = Math.round(y - ry)
  ellipse(g, x, cy + 1, R + 1, ry + 1, PEACH.dark)
  ellipse(g, x - Math.round(R * 0.3), cy, Math.round(R * 0.75), ry, PEACH.body)
  ellipse(g, x + Math.round(R * 0.3), cy, Math.round(R * 0.75), ry, PEACH.shade)
  ellipse(
    g,
    x - Math.round(R * 0.45),
    cy - Math.round(ry * 0.35),
    Math.max(1, Math.round(R * 0.3)),
    Math.max(1, Math.round(ry * 0.25)),
    PEACH.lit,
  )
  // The crease, and once it splits, the violet light in it.
  const gap = Math.round(split * 3)
  rect(
    g,
    x - gap,
    cy - ry + 1,
    gap * 2 + 1,
    ry * 2 - 1,
    split > 0 ? (Math.floor(t * 20) % 2 ? '#ffffff' : TOXIC.lit) : PEACH.dark,
  )
  if (split > 0) rect(g, x - gap - 1, cy - ry + 1, 1, ry * 2 - 1, PEACH.dark)
  // Its stalk and leaf.
  rect(g, x, cy - ry - 2, 1, 3, '#4a2a14')
  ellipse(
    g,
    x + Math.max(2, Math.round(R * 0.3)),
    cy - ry - 1,
    Math.max(1, Math.round(R * 0.3)),
    Math.max(1, Math.round(R * 0.14)),
    PEACH.leaf,
  )
}

export const pecharuntCinema = bossCinema<X>({
  id: 'cinema-pecharunt',
  reveal: REVEAL,
  seed: 1025,
  aura: ['#ffffff', '#ffc8e8', '#c050d0', '#4a1a5a'],
  flash: '#ffe0f0',
  setup(st, r) {
    const f = st.L.foe
    // The chains: out of the ground in a ring round the stand, rearing up and swaying.
    const chains = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + r.range(-0.2, 0.2)
      const bx = f.x + Math.cos(a) * 36
      const by = f.y + 6 + Math.sin(a) * 8
      return Array.from(
        { length: 12 },
        (_, k) => [bx + Math.cos(a) * k * 1.5, by - k * 4] as [number, number],
      )
    })
    return { back: road(f), chains }
  },
  step(s, t, dt) {
    const r = s.r
    const f = s.L.foe
    // Fireflies, and pink sparkles off the mochi.
    if (r() < 0.2)
      s.fx.add({
        x: r.range(0, W),
        y: r.range(50, 130),
        vx: r.range(-6, 6),
        vy: r.range(-6, 4),
        life: 1.4,
        size: 1,
        shape: 'px',
        colors: t < T_CHAINS ? ['#3a4a1a', '#d0ff7a', '#3a4a1a'] : ['#3a1448', '#e070e8', '#3a1448'],
      })
    if (t > MOCHI[0] && t < T_DROP && r() < 0.5)
      s.fx.add({
        x: f.x + r.range(-8, 8),
        y: f.y - 4,
        vy: -r.range(10, 25),
        life: 0.9,
        size: 1,
        shape: r() < 0.3 ? 'heart' : 'star',
        colors: ['#ffffff', '#ffc8e0', '#ff94b4'],
      })
    // Each bounce: a puff of dust; the last, a splash of sweet light.
    for (const b of BOUNCES)
      if (t >= b && t - dt < b) {
        const p = peachAt(f, b)
        for (let k = 0; k < 10; k++)
          s.fx.add({
            x: p.x + r.range(-6, 6),
            y: p.y,
            vx: r.range(-30, 30),
            vy: -r.range(10, 40),
            ay: 120,
            life: 0.5,
            size: 1,
            shape: 'sq',
            colors: ['#ffd8e4', '#ff94b4', '#7a3a5a'],
          })
      }
    // Poison hissing out of the split.
    if (t > T_SPLIT && t < REVEAL)
      for (let k = 0; k < 2; k++)
        s.fx.add({
          x: f.x + r.range(-2, 2),
          y: f.y - r.range(4, 28),
          vx: r.range(-50, 50),
          vy: -r.range(10, 40),
          drag: 2,
          life: r.range(0.4, 0.8),
          size: r.int(2, 3),
          shape: 'smoke',
          colors: ['#e070e8', '#b040d0', '#5a1a6a'],
        })
    if (t >= REVEAL && t - dt < REVEAL)
      for (let k = 0; k < 30; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: f.x,
          y: f.y - 16,
          vx: Math.cos(a) * r.range(40, 100),
          vy: Math.sin(a) * r.range(40, 100),
          drag: 2,
          life: r.range(0.8, 1.4),
          size: 2,
          shape: 'leaf',
          spin: r.range(-6, 6),
          colors: ['#ff94b4'],
          light: '#ffd8e4',
          dark: '#d0608a',
        })
      }
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    if (k <= 0) return
    const f = s.L.foe
    // The night turning violet with the chains, banks of poison mist drifting over the ground.
    const toxic = span(t, T_CHAINS, T_DROP) * (1 - span(t, REVEAL, REVEAL + 0.8))
    if (toxic > 0 && k > 0.5) {
      wash(g, '#3a0a48', 0.3 * toxic, 8)
      for (let i = 0; i < 7; i++) {
        const x = ((i * 53 + t * (8 + i * 3)) % (W + 80)) - 40
        const y = GROUND + 6 + ((i * 17) % 50)
        ellipse(g, x, y, 26 + (i % 3) * 8, 3 + (i % 2), pattern(g, i % 2 ? '#7a3a8a' : '#5a2a6a', 7 * toxic))
      }
    }
    // The mochi on their plate: glowing, wobbling with each pulse, until the peach lands on them.
    if (t < BOUNCES[2] && k > 0.5) {
      const beat = Math.max(0, ...MOCHI.map((m) => 1 - span(t, m, m + 0.3)))
      const gr = 14
      g.drawImage(glow(gr, '#ff94b4', 1.3, q4(0.4 + 0.4 * beat)), f.x - gr, f.y - 4 - gr)
      rect(g, f.x - 10, f.y - 3, 20, 2, '#e8e0d8')
      rect(g, f.x - 8, f.y - 1, 16, 1, '#a8a098')
      for (const [dx, dy] of [
        [-5, 0],
        [4, 0],
        [0, -4],
      ] as const) {
        const sq = 1 + Math.round(beat * 1.5)
        ellipse(g, f.x + dx, f.y - 6 + dy + sq, 4 + sq, 3 - Math.min(1, sq - 1), '#ffb8cc')
        rect(g, f.x + dx - 2, f.y - 8 + dy + sq, 2, 1, '#ffffff')
      }
    }
    // The chains: bursting up out of the ground, then swaying; coiling round the peach once it is down.
    const up = ease.outBack(span(t, T_CHAINS, T_CHAINS + 0.4))
    if (up > 0 && t < REVEAL + 0.1) {
      const coil = span(t, T_COIL, T_COIL + 0.4)
      for (const [i, p] of s.chains.entries()) {
        const pts = p.map(([x, y], j) => {
          const q = j / (p.length - 1)
          const sway = Math.sin(t * 4 + i + q * 3) * 6 * q
          const tx = f.x + Math.cos(i + j * 0.9 + t * 2) * (16 - q * 4)
          const ty = f.y - 6 - q * 26 + Math.sin(i + j * 0.9 + t * 2) * 4
          const bx = p[0]![0] + (x - p[0]![0]) * up + sway
          const by = p[0]![1] + (y - p[0]![1]) * up
          return [lerp(bx, tx, coil * q), lerp(by, ty, coil * q)] as [number, number]
        })
        chain(g, pts, TOXIC.dark, TOXIC.lit, t * 20, true)
      }
    }
  },
  before(g, s, t) {
    const f = s.L.foe
    if (t < T_DROP - 0.4) {
      // Hanging in the tree, ripest of them all, glowing.
      if (t > T_CHAINS) g.drawImage(glow(8, '#ff94b4', 1.3, 0.5), TREE.x - 14, TREE.y + 6)
      drawPeach(g, TREE.x - 6, TREE.y + 22, 0.35, 1, 0, t)
      return
    }
    const p = peachAt(f, t)
    // Squashed on each landing.
    const land = Math.max(0, ...BOUNCES.map((b) => 1 - span(t, b, b + 0.12)))
    const split = span(t, T_SPLIT, REVEAL)
    const jx = t > T_SPLIT ? Math.round(Math.sin(t * 70) * split * 1.5) : 0
    if (t > T_COIL) g.drawImage(glow(24, TOXIC.glow, 1.3, q4(0.3 + 0.4 * split)), f.x - 24, f.y - 16 - 24)
    drawPeach(g, Math.round(p.x) + jx, Math.round(p.y), p.s * 1.15, 1 - land * 0.3, split, t)
  },
  front(g, s, t, k) {
    const f = s.L.foe
    if (k > 0.5)
      for (const b of BOUNCES)
        burstRing(g, peachAt(f, b).x, peachAt(f, b).y, span(t, b, b + 0.3), 24, 1, '#ffc8e0')
    burstRing(g, f.x, f.y - 16, span(t, T_SPLIT, T_SPLIT + 0.4), 60, 2, TOXIC.lit)
    const p = pulse(t, T_CHAINS - 0.02, T_CHAINS + 0.3)
    if (p > 0) screenFlash(g, '#c050d0', 0.25 * p)
    if (within(t, BOUNCES[2], BOUNCES[2] + 0.1)) screenFlash(g, '#ffd8e4', 0.3)
  },
  sounds: [
    [0.1, () => tone(196, 2.4, { type: 'triangle', vol: 0.02 })],
    // The mochi: sweet chimes, a little off.
    ...MOCHI.map(
      (m, i) => [m, () => tone([1319, 1397, 1245][i]!, 0.3, { type: 'sine', vol: 0.035 })] as const,
    ),
    [T_CHAINS, () => (hiss(0.4, { freq: 300, type: 'lowpass', vol: 0.1 }), fxSound('legend.pulse'))],
    ...[0, 1, 2, 3].map(
      (i) =>
        [T_CHAINS + 0.05 + i * 0.1, () => tone(200 + i * 40, 0.06, { type: 'square', vol: 0.02 })] as const,
    ),
    [T_DROP, () => tone(900, 0.25, { type: 'sine', vol: 0.03, slide: -500 })],
    ...BOUNCES.map(
      (b, i) =>
        [
          b,
          () => (
            tone(110 + i * 30, 0.2, { type: 'sine', vol: 0.1, slide: 200 }),
            tone(520 + i * 80, 0.1, { type: 'triangle', vol: 0.03 })
          ),
        ] as const,
    ),
    [T_COIL + 0.1, () => tone(98, 0.8, { type: 'sawtooth', vol: 0.03, slide: 40 })],
    [T_SPLIT, () => (hiss(0.6, { freq: 1500, vol: 0.06, slide: 1500 }), fxSound('legend.heart'))],
    [REVEAL, () => (fxSound('legend.roar'), hiss(0.4, { freq: 800, vol: 0.06 }))],
  ],
})
