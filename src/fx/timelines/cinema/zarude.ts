// Zarude's entrance (docs/53), on the battle stage: the deep jungle. Great trunks, vines hanging in loops, shafts of
// green-gold light through the canopy, mist on the forest floor. The undergrowth rustles here and there; then eyes
// open in the dark leaves, a pair at a time, all round: a troop. They swing across on their vines, whooping, leaves
// bursting where they pass; the eyes all turn to one spot and the jungle drums. The leader swings down out of the
// canopy on a long vine, lets go, and lands where it will fight; the eyes go out.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  polyline,
  rect,
  rng,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
/** The eyes opening in the leaves: when, where. */
const EYES: readonly [number, number, number][] = [
  [0.95, 34, 58],
  [1.15, 210, 40],
  [1.3, 92, 30],
  [1.45, 18, 98],
  [1.58, 226, 88],
  [1.7, 132, 22],
  [1.8, 60, 84],
  [1.9, 196, 64],
  [2.0, 110, 66],
  [2.08, 236, 20],
]
/** The troop swinging across: when, its vine's pivot, how far it swings, and its way. */
const SWINGS: readonly [number, number, number, number][] = [
  [1.95, 70, 0.9, 1],
  [2.25, 180, 0.8, -1],
  [2.5, 120, 1.0, 1],
  [2.72, 40, 0.85, -1],
]
const T_TURN = 2.95
const DRUMS = [3.0, 3.15, 3.3, 3.38, 3.46] as const
const T_LEAD = 3.5
const T_LET = 3.82
const T_LAND = 3.98
/** The leader's vine: its pivot high in the canopy. */
const PIVOT = { x: 112, y: -24 }

const AURA = ['#ffffff', '#d8ffb0', '#6ac04a', '#1e4a1a'] as const
const LEAF = ['#0a1a0e', '#12301a', '#1e4a24', '#3a7a34', '#6ab04a'] as const

type X = { back: Canvas; fore: Canvas; rustle: [number, number][] }

/** The jungle, drawn once: depth in three layers of trunks, hanging vines, light shafts, the floor. */
function jungle(): Canvas {
  const r = rng(893)
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, H, ['#06120a', '#0c2212', '#123018', '#18381a', '#1e3a1a']), 0, 0)
  // Far trunks, pale in the haze.
  for (let x = 4; x < W; x += r.int(16, 26)) {
    const wd = r.int(4, 7)
    rect(g, x, 0, wd, 112, '#1e3a24')
    rect(g, x, 0, 1, 112, '#2a4a2e')
  }
  // Light falling through the canopy.
  for (const x of [70, 150, 200]) {
    tri(g, x - 4, 0, x + 4, 0, x + 26, 112, pattern(g, '#c8e890', 2))
    tri(g, x - 4, 0, x + 26, 112, x + 10, 112, pattern(g, '#c8e890', 2))
  }
  // Near trunks, dark, with buttress roots.
  for (const [x, wd] of [
    [10, 16],
    [96, 12],
    [222, 18],
  ] as const) {
    rect(g, x - wd / 2, 0, wd, 120, '#0a160c')
    rect(g, x - wd / 2, 0, 2, 120, '#1a2e1c')
    for (const side of [-1, 1]) tri(g, x + side * wd * 0.3, 96, x + side * wd * 1.3, 122, x, 122, '#0a160c')
    for (let y = 8; y < 110; y += 9) rect(g, x - wd / 2 + 3 + ((y * 3) % (wd - 5)), y, 1, 4, '#060e08')
  }
  // The canopy: leaf masses across the top.
  for (let x = -8; x < W + 8; x += 10) {
    const y = 6 + ((x * 7) % 9)
    ellipse(g, x, y, 14, 9, LEAF[0])
    ellipse(g, x - 2, y - 2, 10, 6, LEAF[1])
    for (let k = 0; k < 3; k++) rect(g, x - 6 + ((x + k * 5) % 12), y + 4 + k, 2, 1, LEAF[2])
  }
  // Vines hanging in loops, leaves along them.
  for (const [x0, x1, sag] of [
    [20, 80, 40],
    [130, 200, 30],
    [60, 150, 56],
    [180, 238, 46],
  ] as const) {
    const pts: [number, number][] = []
    for (let i = 0; i <= 20; i++) {
      const q = i / 20
      pts.push([lerp(x0, x1, q), 8 + Math.sin(q * Math.PI) * sag])
    }
    polyline(g, pts, '#1a3418', 2)
    polyline(
      g,
      pts.map(([x, y]) => [x, y - 1] as [number, number]),
      '#3a5a28',
    )
    for (let i = 1; i < 20; i += 3) {
      const [x, y] = pts[i]!
      rect(g, x - 1, y + 1, 3, 2, LEAF[3])
      rect(g, x, y + 1, 1, 1, LEAF[4])
    }
  }
  // Straight vines dropping from the canopy.
  for (const x of [44, 162, 206]) {
    line(g, x, 10, x + 2, 90, '#1a3418', 1)
    for (let y = 18; y < 88; y += 10) rect(g, x + (y % 20 ? 1 : -2), y, 3, 2, LEAF[3])
  }
  // The floor: ferns and roots, a mist.
  g.drawImage(dGradient(W, H - 112, ['#1e3418', '#142810', '#0a1808']), 0, 112)
  for (let x = 0; x < W; x += 3) rect(g, x, 110 - ((x * 7) % 4), 1, 4, LEAF[2])
  for (let y = 112; y < 124; y += 3) rect(g, 0, y, W, 1, pattern(g, '#5a7a5a', 3))
  return cv
}

/** Big leaves in the foreground, dark: the bottom corners and a frond hanging from the top. */
function foliage(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  const leaf = (x: number, y: number, len: number, a: number, c: string, lit: string) => {
    const tx = x + Math.cos(a) * len
    const ty = y + Math.sin(a) * len
    const nx = -Math.sin(a) * len * 0.22
    const ny = Math.cos(a) * len * 0.22
    const mx = (x + tx) / 2
    const my = (y + ty) / 2
    tri(g, x, y, mx + nx, my + ny, tx, ty, c)
    tri(g, x, y, mx - nx, my - ny, tx, ty, c)
    line(g, x, y, tx, ty, lit)
  }
  for (const [x, y, len, a] of [
    [-6, H + 4, 46, -1.1],
    [4, H + 6, 40, -0.7],
    [-4, H - 10, 34, -0.3],
    [W + 6, H + 4, 44, -2.0],
    [W - 6, H + 8, 38, -2.4],
    [W + 4, H - 14, 30, -2.8],
  ] as const)
    leaf(x, y, len, a, '#06120a', '#14301a')
  for (const [x, len, a] of [
    [150, 30, 1.9],
    [160, 26, 1.4],
    [20, 28, 1.2],
  ] as const)
    leaf(x, -4, len, a, '#06120a', '#14301a')
  return cv
}

/** A Zarude hanging from a vine at angle `a` (0 straight down) from a pivot: the vine, and its dark shape. */
function swinger(
  g: G,
  mon: string,
  px: number,
  py: number,
  len: number,
  a: number,
  k: number,
  dir: number,
  out: string,
) {
  const x = px + Math.sin(a) * len
  const y = py + Math.cos(a) * len
  line(g, px, py, x, y, '#2a4a20', 2)
  line(g, px + 1, py, x + 1, y, '#6a8a40')
  // Hanging by an arm: its feet well below its hand.
  drawSprite(g, mon, x, y + 40 * k, { sx: k, sy: k, sil: '#08140a', outline: out, flip: dir > 0 })
}

export const zarudeCinema = bossCinema<X>({
  id: 'cinema-zarude',
  reveal: REVEAL,
  seed: 893,
  aura: AURA,
  flash: '#f0ffe0',
  setup() {
    return {
      back: jungle(),
      fore: foliage(),
      rustle: [
        [30, 100],
        [200, 92],
        [120, 104],
        [70, 96],
      ],
    }
  },
  step(s, t, dt) {
    const r = s.r
    // Rustles in the undergrowth: leaves thrown up.
    for (const [i, [x, y]] of s.rustle.entries()) {
      const at = 0.6 + i * 0.25
      if (t >= at && t - dt < at)
        for (let k = 0; k < 6; k++)
          s.fx.add({
            x: x + r.range(-6, 6),
            y,
            vx: r.range(-20, 20),
            vy: -r.range(20, 50),
            ay: 80,
            life: 1,
            size: 2,
            shape: 'leaf',
            spin: r.range(-5, 5),
            colors: [LEAF[3]],
            light: LEAF[4],
            dark: LEAF[2],
          })
    }
    // Leaves bursting off where each swinger passes the bottom of its arc.
    for (const [at, px, , dir] of SWINGS) {
      const mid = at + 0.3
      if (t >= mid && t - dt < mid)
        for (let k = 0; k < 10; k++)
          s.fx.add({
            x: px + r.range(-10, 10),
            y: r.range(60, 90),
            vx: dir * r.range(20, 60),
            vy: r.range(-30, 10),
            ay: 60,
            life: 1.2,
            size: 2,
            shape: 'leaf',
            spin: r.range(-6, 6),
            colors: [LEAF[3]],
            light: LEAF[4],
            dark: LEAF[2],
          })
    }
    // The landing: a ring of dust and leaves.
    if (t >= T_LAND && t - dt < T_LAND)
      for (let k = 0; k < 24; k++) {
        const side = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: s.L.foe.x + side * r.range(2, 18),
          y: s.L.foe.y,
          vx: side * r.range(20, 70),
          vy: -r.range(5, 30),
          drag: 3,
          life: r.range(0.5, 0.9),
          size: r.int(2, 3),
          shape: k % 3 ? 'smoke' : 'leaf',
          spin: 4,
          colors: k % 3 ? ['#5a6a4a', '#3a4a30'] : [LEAF[3]],
          light: LEAF[4],
          dark: LEAF[2],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    // The jungle shudders with the drums.
    const drum = DRUMS.some((d) => t >= d && t < d + 0.06) ? 1 : 0
    dissolve(g, s.back, k, 0, drum)
    if (k < 0.5) return
    // Light motes in the shafts.
    for (let i = 0; i < 16; i++) {
      const x = [70, 150, 200][i % 3]! + ((i * 13 + t * 6) % 30)
      const y = (i * 29 + t * 10) % 110
      rect(g, x, y, 1, 1, '#e8ffc0')
    }
    drawEyes(g, s, t)
    // The troop swinging across, behind the foreground leaves.
    for (const [at, px, amp, dir] of SWINGS) {
      const q = span(t, at, at + 0.6)
      if (q <= 0 || q >= 1) continue
      const a = -dir * amp * Math.cos(q * Math.PI)
      swinger(g, s.foe, px, -10, 66, a, 0.55, dir, Math.floor(t * 10) % 2 ? LEAF[4] : LEAF[3])
    }
  },
  before(g, s, t) {
    // The leader's swing down out of the canopy, its letting go, its leap to its place.
    if (t >= T_LEAD && t < T_LET) {
      const q = ease.ioS(span(t, T_LEAD, T_LET))
      const a = lerp(-1.25, 0.55, q)
      swinger(g, s.foe, PIVOT.x, PIVOT.y, 92, a, 0.9, 1, Math.floor(t * 14) % 2 ? AURA[1] : AURA[2])
    }
    if (t >= T_LET) {
      // The vine whipping back up, empty.
      const back = span(t, T_LET, T_LET + 0.4)
      const a = lerp(0.55, -0.4, ease.outQ(back))
      line(
        g,
        PIVOT.x,
        PIVOT.y,
        PIVOT.x + Math.sin(a) * 92,
        PIVOT.y + Math.cos(a) * 92 * lerp(1, 0.6, back),
        '#2a4a20',
        2,
      )
      const q = span(t, T_LET, T_LAND)
      const x0 = PIVOT.x + Math.sin(0.55) * 92
      const y0 = PIVOT.y + Math.cos(0.55) * 92 + 36
      const x = lerp(x0, s.L.foe.x, q)
      const y = lerp(y0, s.L.foe.y, q) - Math.sin(q * Math.PI) * 18
      const squash = t > T_LAND && t < T_LAND + 0.1 ? 0.85 : 1
      drawSprite(g, s.foe, x, y, {
        sy: squash,
        sx: 2 - squash,
        sil: '#08140a',
        outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[2],
      })
    }
  },
  front(g, s, t, k) {
    if (k <= 0) return
    // The foreground leaves, a rustle running through them now and then.
    const shake = Math.round(Math.sin(t * 30) * span(t, 0.6, 1.5) * (1 - span(t, 1.5, 1.8)) * 2)
    dissolve(g, s.fore, k, shake, 0)
  },
  sounds: [
    [0.05, () => hiss(3.5, { freq: 2600, type: 'highpass', vol: 0.02 })],
    // Birds far off in the canopy.
    [0.3, () => tone(1760, 0.1, { type: 'sine', vol: 0.02, slide: 400 })],
    [0.45, () => tone(1976, 0.1, { type: 'sine', vol: 0.02, slide: 400 })],
    ...[0.6, 0.85, 1.1, 1.35].map((at) => [at, () => hiss(0.2, { freq: 3000, vol: 0.04 })] as const),
    ...EYES.filter((_, i) => i % 3 === 0).map(
      ([at]) => [at, () => tone(988, 0.05, { type: 'triangle', vol: 0.015 })] as const,
    ),
    // Whoops as they swing: up, then down.
    ...SWINGS.map(
      ([at], i) =>
        [
          at + 0.15,
          () => (
            tone(440 + i * 40, 0.18, { type: 'triangle', vol: 0.035, slide: 300 }),
            tone(700 + i * 40, 0.16, { type: 'triangle', vol: 0.03, at: 0.18, slide: -300 })
          ),
        ] as const,
    ),
    ...DRUMS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(70 + (i % 2) * 15, 0.15, { type: 'sine', vol: 0.14 }),
            hiss(0.06, { freq: 200, vol: 0.06 })
          ),
        ] as const,
    ),
    [
      T_LEAD,
      () => (
        hiss(0.4, { freq: 600, slide: 1200, vol: 0.05 }),
        tone(523, 0.3, { type: 'square', vol: 0.03, slide: 400 })
      ),
    ],
    [T_LAND, () => (fxSound('impact.hit'), tone(60, 0.3, { type: 'sine', vol: 0.15 }))],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})

/** The troop's eyes in the leaves: opening, blinking, all turning to the leader's spot, gone when it lands. */
function drawEyes(g: G, s: { L: { foe: { x: number; y: number } } }, t: number) {
  if (t > T_LAND) return
  const turn = span(t, T_TURN, T_TURN + 0.2)
  for (const [i, [at, x, y]] of EYES.entries()) {
    const open = span(t, at, at + 0.12)
    if (open <= 0) continue
    if (Math.floor(t * 3 + i * 1.7) % 9 === 0 && turn < 1) continue
    g.drawImage(glow(7, '#c8a020', 1.3, 0.45), x - 7, y - 7)
    // Two almond eyes, a dark pupil in each that turns to the leader's spot.
    const look = turn > 0 ? Math.sign(s.L.foe.x - x) : 0
    const eh = Math.max(1, Math.round(2 * open))
    for (const dx of [-5, 2]) {
      rect(g, x + dx, y, 3, eh, '#ffd23a')
      rect(g, x + dx + 1, y - 1, 1, 1, open > 0.5 ? '#fff3a0' : '#ffd23a')
      if (open > 0.5) rect(g, x + dx + 1 + look, y, 1, eh, '#1a0e00')
    }
  }
}
