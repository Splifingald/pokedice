// Victini's entrance (docs/53), on the battle stage: Liberty Garden at night, the lighthouse on its island, its beam
// turning over a calm sea, the garden dark below. The lamp stutters and burns orange, then red; embers rise round the
// tower's foot (where it was hidden), the beam whirls faster, fire-coloured. Victory: fireworks go up from the
// lantern, one, two, three, bursting gold over the sea. The lantern blows and a fireball climbs out of the sky's top;
// it comes back as two comets that dive from the corners of the sky and carve a giant V of fire into the night, meeting
// where it will stand. The V blazes; Victini springs up out of its point.
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
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, screenFlash, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(v * 8) / 8

const REVEAL = 3.85
const SEA = 72
const LAND = 90
/** The lantern at the lighthouse's top. */
const LAMP = { x: 58, y: 25 }
const T_RED = 0.9
const ROCKETS: readonly [number, number, number][] = [
  [1.75, 112, 30],
  [2.1, 214, 20],
  [2.45, 150, 14],
]
const T_BLOW = 2.75
const T_DIVE = 3.0
const T_MEET = 3.4
/** The V's two arms: from high in each corner of the sky down to its point, where Victini stands. */
const V_ARMS = (C: { x: number; y: number }) =>
  [
    [C.x - 66, -4],
    [C.x + 66, -4],
  ] as const
const FIRE = ['#fff6c8', '#ffd23a', '#ff8a1e', '#e0401a', '#8a1a0a'] as const
/** Each rocket's colours, bright to spent: gold, fire, white and rose. */
const BURSTS = [
  ['#ffffff', '#fff3a0', '#ffd23a', '#e0901a', '#8a4a10'],
  ['#ffffff', '#ffd0a0', '#ff8a1e', '#e0401a', '#7a1a0a'],
  ['#ffffff', '#ffe0f0', '#ff9ac8', '#e05a8a', '#7a2a4a'],
] as const

type X = { night: Canvas; land: Canvas; buf: Canvas }

/** The night over the sea: stars, the island's far shore, the sea's dark with a glitter. */
function night(): Canvas {
  const cv = canvas(W, LAND)
  const g = cv.g
  g.drawImage(dGradient(W, SEA, ['#05061a', '#0c0e2c', '#1a1a46', '#36285a', '#5a3060']), 0, 0)
  for (let i = 0; i < 60; i++)
    rect(g, (i * 73 + (i % 7) * 11) % W, (i * 31) % (SEA - 14), 1, 1, i % 6 ? '#8a8ac8' : '#ffffff')
  g.drawImage(dGradient(W, LAND - SEA, ['#1a1a40', '#10122e', '#0a0b20']), 0, SEA)
  for (let y = SEA + 2; y < LAND; y += 3)
    for (let x = (y * 11) % 17; x < W; x += 17 + (y % 5)) rect(g, x, y, 3 + ((y - SEA) >> 3), 1, '#2a2a5a')
  // The mainland's lights far off on the right.
  for (let x = 150; x < W; x++) {
    const y = Math.round(SEA - 3 - Math.sin((x - 150) / 30) * 2)
    rect(g, x, y, 1, SEA - y, '#0a0a20')
    if (x % 9 === 0) rect(g, x, y + 1, 1, 1, '#ffd890')
  }
  return cv
}

/** The island: rocks, the garden's trees and hedges, a path, the lighthouse on its point. */
function land(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  // The lighthouse's own rock, then the garden in front.
  for (let x = 14; x < 104; x++) {
    const y = Math.round(LAND - 6 - Math.sin(((x - 14) / 90) * Math.PI) * 8)
    rect(g, x, y, 1, LAND - y + 2, '#14142a')
    rect(g, x, y, 1, 1, '#2a2a4a')
  }
  // The tower: tapering, white, two red bands, a gallery, the lantern room and its cap.
  const bx = LAMP.x
  const yb = LAND - 10
  const yt = LAMP.y + 8
  tri(g, bx - 9, yb, bx + 9, yb, bx - 5, yt, '#d8d8e8')
  tri(g, bx + 9, yb, bx + 5, yt, bx - 5, yt, '#d8d8e8')
  tri(g, bx + 2, yb, bx + 9, yb, bx + 5, yt, '#9a9ab8')
  tri(g, bx + 2, yb, bx + 5, yt, bx + 1, yt, '#9a9ab8')
  for (const f of [0.3, 0.62]) {
    const y = Math.round(lerp(yb, yt, f))
    const hw = Math.round(lerp(9, 5, f))
    rect(g, bx - hw, y, hw * 2, 5, '#b8302a')
    rect(g, bx + 2, y, hw - 2, 5, '#7a1a1a')
  }
  rect(g, bx - 2, yb - 7, 4, 7, '#2a1a1a')
  rect(g, bx - 8, yt - 2, 16, 2, '#2a2a3a')
  rect(g, bx - 8, yt - 4, 1, 2, '#2a2a3a')
  rect(g, bx + 7, yt - 4, 1, 2, '#2a2a3a')
  rect(g, bx - 4, LAMP.y - 3, 1, 8, '#2a2a3a')
  rect(g, bx + 3, LAMP.y - 3, 1, 8, '#2a2a3a')
  tri(g, bx - 6, LAMP.y - 3, bx + 6, LAMP.y - 3, bx, LAMP.y - 10, '#8a1a1a')
  rect(g, bx, LAMP.y - 12, 1, 3, '#2a2a3a')
  // The garden: grass falling to the sea, round trees and hedges in silhouette, a stone path to the point.
  g.drawImage(dGradient(W, H - LAND, ['#14301e', '#0e2416', '#08180e']), 0, LAND)
  for (let x = 0; x < W; x++) rect(g, x, LAND - 1 - ((x * 7) % 3 === 0 ? 1 : 0), 1, 2, '#1e4028')
  for (const [x, y, r] of [
    [6, 84, 12],
    [110, 86, 9],
    [126, 84, 11],
    [228, 82, 14],
    [210, 88, 8],
  ] as const) {
    rect(g, x - 1, y, 3, LAND - y + 2, '#0a1408')
    ellipse(g, x, y - r * 0.6, r, Math.round(r * 0.8), '#0c1c10')
    ellipse(g, x - 2, y - r * 0.8, r - 4, Math.round(r * 0.5), '#163020')
  }
  for (let y = LAND + 2; y < H; y += 2) {
    const u = (y - LAND) / (H - LAND)
    const x = Math.round(lerp(150, 110, u))
    rect(g, x, y, Math.round(lerp(12, 40, u)), 2, y % 4 ? '#3a3a4a' : '#2a2a3a')
  }
  for (let i = 0; i < 160; i++) rect(g, (i * 97) % W, LAND + 3 + ((i * 41) % (H - LAND - 3)), 1, 2, '#2a5030')
  return cv
}

export const victiniCinema = bossCinema<X>({
  id: 'cinema-victini',
  reveal: REVEAL,
  seed: 494,
  aura: ['#ffffff', '#fff3a0', '#ff8a1e', '#c83a10'],
  flash: '#fff2c0',
  setup() {
    return { night: night(), land: land(), buf: canvas(W, H) }
  },
  step(s, t, dt) {
    const r = s.r
    const C = s.L.foe
    // Embers rising round the tower's foot, where it slept.
    if (t > T_RED - 0.2 && t < T_BLOW && r() < 0.6)
      s.fx.add({
        x: LAMP.x + r.range(-12, 12),
        y: LAND - 8,
        vx: r.range(-6, 6),
        vy: -r.range(14, 34),
        life: r.range(0.8, 1.4),
        size: 1,
        shape: 'px',
        colors: [...FIRE.slice(1)],
      })
    // The rockets' bursts: a full sphere of sparks (fast ones out on the rim, slow ones in the middle), each rocket its
    // own colours, then glittering as they fall.
    ROCKETS.forEach(([at, x, y], n) => {
      if (!within(t, at + 0.3, at + 0.3 + dt)) return
      const pal = BURSTS[n]!
      for (let i = 0; i < 80; i++) {
        const a = r() * Math.PI * 2
        const v = i < 40 ? r.range(58, 72) : r.range(12, 58)
        s.fx.add({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 45,
          drag: 1.7,
          life: r.range(0.8, 1.2),
          size: i % 4 ? 1 : 2,
          shape: i % 4 ? 'streak' : 'star',
          trail: 0.05,
          colors: pal,
        })
      }
    })
    for (const [at, x, y] of ROCKETS)
      if (t > at + 0.8 && t < at + 1.4 && r() < 0.6)
        s.fx.add({
          x: x + r.range(-40, 40),
          y: y + r.range(-20, 50),
          vy: 10,
          life: 0.15,
          size: 1,
          shape: 'plus',
          colors: ['#ffffff'],
        })
    // The comets' trails, and the V burning once it is carved.
    const cm = comets(t, C)
    for (const c of cm)
      for (let i = 0; i < 3; i++)
        s.fx.add({
          x: c.x + r.range(-3, 3),
          y: c.y + r.range(-3, 3),
          vx: r.range(-10, 10),
          vy: -r.range(5, 25),
          life: r.range(0.3, 0.55),
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
    if (t > T_MEET && t < REVEAL + 1.2 && r() < 0.95)
      for (const [ax, ay] of V_ARMS(C)) {
        const u = r()
        s.fx.add({
          x: lerp(ax, C.x, u) + r.range(-3, 3),
          y: lerp(ay, C.y - 4, u),
          vx: r.range(-6, 6),
          vy: -r.range(20, 50),
          life: r.range(0.3, 0.6),
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
      }
    if (within(t, T_MEET, T_MEET + dt))
      for (let i = 0; i < 50; i++) {
        const a = -Math.PI / 2 + r.range(-1.4, 1.4)
        const v = r.range(60, 160)
        s.fx.add({
          x: C.x,
          y: C.y - 4,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 120,
          drag: 1.5,
          life: r.range(0.5, 0.9),
          size: r.int(1, 3),
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const C = s.L.foe
    b.drawImage(s.night, 0, 0)
    // The lighthouse's beam, turning: a long wedge of light across the sky, brighter swung towards us.
    const fire = span(t, T_RED, T_RED + 0.6)
    const spin = t < T_RED ? t * 1.6 : 1.6 * T_RED + (t - T_RED) * 1.6 + (t - T_RED) ** 2 * 3
    if (t < T_BLOW) {
      const a = spin % (Math.PI * 2)
      const dx = Math.cos(a)
      const len = 30 + 220 * Math.abs(dx)
      const side = dx > 0 ? 1 : -1
      const lv = Math.round(3 + 3 * Math.max(0, Math.sin(a)))
      const c = fire < 0.5 ? '#fff0b0' : fire < 1 ? '#ffc060' : '#ff7a2a'
      const sp = 6 + 8 * Math.max(0, Math.sin(a))
      tri(
        b,
        LAMP.x,
        LAMP.y,
        LAMP.x + side * len,
        LAMP.y - sp,
        LAMP.x + side * len,
        LAMP.y + sp * 0.8,
        pattern(b, c, lv),
      )
    }
    b.drawImage(s.land, 0, 0)
    // The lantern: steady, then stuttering, orange, red; gone when it blows.
    if (t < T_BLOW) {
      const stut = t > T_RED - 0.3 && t < T_RED + 0.5 && Math.floor(t * 24) % 3 === 0
      const c = stut ? '#3a2a1a' : fire < 0.3 ? '#fff6c8' : fire < 0.8 ? '#ffa040' : '#ff4a1a'
      rect(b, LAMP.x - 3, LAMP.y - 2, 6, 6, c)
      if (!stut) b.drawImage(glow(10, c, 1.3, 0.7), LAMP.x - 10, LAMP.y + 1 - 10)
    } else {
      rect(b, LAMP.x - 3, LAMP.y - 2, 6, 6, '#1a0a0a')
      const q = 1 - span(t, T_BLOW, T_BLOW + 0.6)
      if (q > 0)
        b.drawImage(
          glow(Math.round(8 + 10 * q), '#ff8a1e', 1.2, q8(q)),
          LAMP.x - Math.round(8 + 10 * q),
          LAMP.y - Math.round(8 + 10 * q),
        )
    }
    // Fireworks: a rocket's trail up from the lantern, then its ring.
    for (const [at, x, y] of ROCKETS) {
      const q = span(t, at, at + 0.3)
      if (q > 0 && q < 1) {
        const px = lerp(LAMP.x, x, ease.outQ(q))
        const py = lerp(LAMP.y, y, ease.outQ(q))
        line(
          b,
          px,
          py,
          lerp(LAMP.x, x, ease.outQ(Math.max(0, q - 0.2))),
          lerp(LAMP.y, y, ease.outQ(Math.max(0, q - 0.2))),
          '#ffd23a',
        )
        rect(b, px - 1, py - 1, 2, 2, '#ffffff')
      }
      burstRing(b, x, y, span(t, at + 0.3, at + 0.7), 40, 1, '#fff3a0')
      const fl = 1 - span(t, at + 0.3, at + 0.55)
      if (fl < 1 && fl > 0)
        b.drawImage(
          glow(Math.round(12 * fl + 4), '#fff3a0', 1.3, q8(fl)),
          x - Math.round(12 * fl + 4),
          y - Math.round(12 * fl + 4),
        )
    }
    // The fireball out of the lantern, up out of the sky.
    if (t > T_BLOW && t < T_DIVE) {
      const q = ease.inQ(span(t, T_BLOW, T_DIVE - 0.05))
      fireball(b, lerp(LAMP.x, C.x, q), lerp(LAMP.y, -20, q) - Math.sin(q * Math.PI) * 10, 5, t)
    }
    // The V: carved behind the comets, then burning.
    const arms = V_ARMS(C)
    const vq = span(t, T_DIVE, T_MEET)
    if (vq > 0) {
      const glowK = t < T_MEET ? 0 : 1 - span(t, REVEAL + 0.4, REVEAL + 1.5) * 0.5
      if (glowK > 0) b.drawImage(glow(60, '#ff6a1a', 1.5, q8(0.5 * glowK)), C.x - 60, C.y - 40 - 60)
      for (const [ax, ay] of arms) vArm(b, ax, ay, C.x, C.y - 4, ease.inQ(vq), t)
    }
    for (const c of comets(t, C)) fireball(b, c.x, c.y, 6, t)
    // The night warmed by the fire once the V burns.
    if (t > T_MEET && t < REVEAL + 1) wash(b, '#ff6a1a', 0.12 * (1 - span(t, REVEAL, REVEAL + 1)), 8)
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Springing up out of the V's point, all fire.
    if (t < T_MEET + 0.08) return
    const q = ease.outBack(span(t, T_MEET + 0.08, REVEAL - 0.05), 2.2)
    drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, {
      sx: q,
      sy: q,
      sil: Math.floor(t * 16) % 2 ? '#fff3a0' : '#ffd23a',
      outline: '#ff8a1e',
    })
  },
  front(g, _s, t) {
    for (const [at] of ROCKETS) if (within(t, at + 0.3, at + 0.38)) screenFlash(g, '#fff3a0', 0.18)
    if (within(t, T_MEET, T_MEET + 0.2)) screenFlash(g, '#ffb060', 0.45 * (1 - span(t, T_MEET, T_MEET + 0.2)))
  },
  sounds: [
    [0.05, () => hiss(2.6, { freq: 420, type: 'lowpass', vol: 0.05 })],
    [0.1, () => tone(196, 0.9, { type: 'sine', vol: 0.03 })],
    [T_RED - 0.3, () => hiss(0.5, { freq: 3000, q: 3, vol: 0.03 })],
    [T_RED, () => (fxSound('fire.inhale'), tone(110, 0.8, { type: 'sawtooth', vol: 0.025, slide: 60 }))],
    // Each rocket: a whistle up, a bang, and a note of the victory fanfare.
    ...ROCKETS.flatMap(
      ([at], i) =>
        [
          [at, () => tone(700, 0.3, { type: 'sine', vol: 0.025, slide: 900 })],
          [
            at + 0.3,
            () => (
              hiss(0.35, { freq: 700, vol: 0.09 }),
              tone([523, 659, 784][i]!, 0.3, { type: 'square', vol: 0.03 })
            ),
          ],
        ] as const,
    ),
    [T_BLOW, () => (fxSound('legend.shatter'), fxSound('fire.stream'))],
    [T_DIVE, () => hiss(0.5, { freq: 800, slide: 2200, vol: 0.07 })],
    [T_MEET, () => (fxSound('fire.hit'), hiss(0.8, { freq: 160, type: 'lowpass', vol: 0.14 }))],
    [
      REVEAL,
      () =>
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, i === 3 ? 0.5 : 0.13, { type: 'square', vol: 0.035, at: i * 0.09 }),
        ),
    ],
  ],
})

/** The two comets diving from the sky's corners to the V's point, or none outside that time. */
function comets(t: number, C: { x: number; y: number }) {
  if (t < T_DIVE || t >= T_MEET) return []
  const q = ease.inQ(span(t, T_DIVE, T_MEET))
  return V_ARMS(C).map(([ax, ay]) => ({ x: lerp(ax, C.x, q), y: lerp(ay, C.y - 4, q) }))
}

/** A fireball: a halo, a body in fire's colours, a white heart. */
function fireball(g: G, x: number, y: number, r: number, t: number) {
  const xx = Math.round(x)
  const yy = Math.round(y)
  g.drawImage(glow(r * 3, '#ff8a1e', 1.3, 0.7), xx - r * 3, yy - r * 3)
  const wob = Math.floor(t * 30) % 2
  ellipse(g, xx, yy, r + wob, r, FIRE[3])
  ellipse(g, xx, yy, r - 1, r - 1 - wob, FIRE[2])
  ellipse(g, xx, yy, Math.max(1, r - 3), Math.max(1, r - 3), FIRE[1])
  rect(g, xx - 1, yy - 1, 2, 2, FIRE[0])
}

/** One arm of the V, carved from its corner of the sky `q` of the way to the point: a band of fire, licking upward. */
function vArm(g: G, x0: number, y0: number, x1: number, y1: number, q: number, t: number) {
  const yEnd = Math.round(lerp(y0, y1, q))
  // Row by row: a clean diagonal band, its layers from the dark rim to the white core.
  const slope = (x1 - x0) / (y1 - y0)
  const across = Math.hypot(1, slope)
  for (let y = Math.max(0, Math.round(y0)); y <= yEnd; y++) {
    const u = (y - y0) / (y1 - y0)
    const x = x0 + (y - y0) * slope
    // Wider towards the point, as V-create's is; the edges flickering.
    const w = (3.5 + u * 3.5 + ((Math.floor(t * 24) + y) % 4 === 0 ? 0.8 : 0)) * across
    for (const [k, c] of [
      [1, FIRE[4]],
      [0.78, FIRE[3]],
      [0.52, FIRE[2]],
      [0.28, FIRE[1]],
    ] as const) {
      const hw = Math.max(0.5, w * k + (k === 1 ? 1 : 0))
      rect(g, Math.round(x - hw), y, Math.round(hw * 2), 1, c)
    }
    if ((y + Math.floor(t * 30)) % 3) rect(g, Math.round(x), y, 1, 1, FIRE[0])
    // Tongues of flame off its top side.
    if (y % 5 === 0 && (Math.floor(t * 12) + y) % 3) {
      const hh = 3 + ((y * 7 + Math.floor(t * 12)) % 7)
      const side = slope > 0 ? 1 : -1
      const ex = x + side * w
      tri(g, ex - 2, y + 1, ex + 2, y + 1, ex + side * 2 + Math.sin(t * 9 + y) * 2, y - hh, FIRE[2])
    }
  }
}
