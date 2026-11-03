// Magearna's entrance (docs/53), on the battle stage: a workshop shut for five hundred years. Stone walls, shelves of
// tools and bottles under cobwebs, a round window letting in a shaft of moonlight full of dust, a great clock stopped,
// and on a pedestal a heart of red glass in a brass frame, dark. A tick. One small gear turns; it turns the next, and
// the next, a chain of them waking across the wall, faster and faster, the clock's hands moving, the pendulum
// swinging, steam puffing from a pipe. Light runs down the copper pipes into the heart, and it beats: the Soul-Heart
// lights up pink. It rises, its gears turning round it, a body closes round it in light, and Magearna is there.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  icon,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, pulse, tri } from './kit'

const REVEAL = 4.0
const FLOOR = 112
const T_TICK = 0.55
const T_PIPES = 2.15
const T_HEART = 2.75
const T_RISE = 3.2
const BRASS = { lit: '#ffe08a', mid: '#c8a050', dark: '#8a6a2a', ink: '#4a3414' } as const
const PINK = ['#ffffff', '#ffd0e0', '#ff7aa8', '#e0305a', '#8a1a3a', '#3a0a1a'] as const
/** The heart, a little pixel picture: `a` its glass, `b` its shine. */
const HEART = [
  '.aa...aa.',
  'abba.aaaa',
  'abaaaaaaa',
  'aaaaaaaaa',
  '.aaaaaaa.',
  '..aaaaa..',
  '...aaa...',
  '....a....',
]

/** The gears across the wall: where, how big, how many teeth, and when each one is woken by the one before. */
interface Gear {
  x: number
  y: number
  r: number
  teeth: number
  /** Turning which way, how fast, from when. */
  dir: number
  w: number
  at: number
}

type X = { back: Canvas; gears: readonly Gear[]; motes: Particles }

/**
 * A chain of gears that mesh: each placed touching the last (at an angle in degrees, its teeth in the other's gaps),
 * turning the other way at the speed its size says. The sixth is the clock's.
 */
const GEARS: readonly Gear[] = (() => {
  const steps: [number, number][] = [
    [10, -70],
    [8, -40],
    [11, -75],
    [7, -20],
    [16, -10],
    [9, 40],
    [7, -45],
    [9, -50],
    [12, 5],
    [8, -10],
    [10, 15],
    [8, 35],
    [11, 70],
  ]
  const out: Gear[] = [{ x: 12, y: 102, r: 7, teeth: 7, dir: 1, w: 5, at: T_TICK }]
  steps.forEach(([r, deg], i) => {
    const prev = out[i]!
    const a = (deg * Math.PI) / 180
    const d = prev.r + r + 1
    out.push({
      x: Math.round(prev.x + Math.cos(a) * d),
      y: Math.round(prev.y + Math.sin(a) * d),
      r,
      teeth: Math.max(6, Math.round(r * 0.9)),
      dir: -prev.dir,
      w: (prev.w * prev.r) / r,
      at: T_TICK + (i + 1) * 0.12,
    })
  })
  return out
})()
const CLOCK = GEARS[5]!

/** How far a gear has turned at t: still, spinning up, then steady. */
const turned = (gr: Gear, t: number) => {
  const e = t - gr.at
  if (e <= 0) return 0
  return gr.dir * gr.w * (e < 0.3 ? (e * e) / 0.6 : e - 0.15)
}

/** A brass gear: teeth round its rim, a disc, spokes and a hub, all turning with `a`. */
function gear(g: G, x: number, y: number, r: number, teeth: number, a: number, dim: boolean) {
  const C = dim ? { lit: '#8a7a5a', mid: '#6a5a3a', dark: '#4a3e28', ink: '#2a2218' } : BRASS
  for (let k = 0; k < teeth; k++) {
    const ta = a + (k / teeth) * Math.PI * 2
    rect(g, Math.round(x + Math.cos(ta) * r) - 1, Math.round(y + Math.sin(ta) * r) - 1, 3, 3, C.dark)
  }
  ellipse(g, x, y, r - 1, r - 1, C.dark)
  ellipse(g, x, y, r - 2, r - 2, C.mid)
  ellipse(g, x - 1, y - 1, Math.max(1, r - 4), Math.max(1, r - 4), C.lit)
  ellipse(g, x, y, Math.max(1, r - 4), Math.max(1, r - 4), C.mid)
  // Spokes and the gaps between them.
  if (r > 7)
    for (let k = 0; k < 4; k++) {
      const sa = a + (k * Math.PI) / 2 + Math.PI / 4
      ellipse(
        g,
        x + Math.cos(sa) * r * 0.5,
        y + Math.sin(sa) * r * 0.5,
        Math.round(r * 0.18),
        Math.round(r * 0.18),
        C.ink,
      )
    }
  ellipse(g, x, y, 2, 2, C.ink)
  rect(g, x, y, 1, 1, C.lit)
}

/** The workshop: stone walls, a round window, shelves, cobwebs, the clock's face, pipes, the floor, the pedestal. */
function workshop(r: Rng, foe: { x: number; y: number }): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, FLOOR, ['#120e14', '#1a141a', '#221a20', '#2a2026']), 0, 0)
  // Stone blocks.
  for (let y = 0; y < FLOOR; y += 9)
    for (let x = (y / 9) % 2 ? -10 : 0; x < W; x += 20) {
      rect(g, x, y, 20, 1, '#0e0a0e')
      rect(g, x, y, 1, 9, '#0e0a0e')
      rect(g, x + 1, y + 1, 18, 1, '#30262c')
    }
  // The round window, the night in it.
  ellipse(g, 30, 26, 15, 15, '#3a2a20')
  ellipse(g, 30, 26, 12, 12, '#0e1a34')
  for (let i = 0; i < 6; i++) rect(g, 22 + ((i * 5) % 16), 18 + ((i * 7) % 14), 1, 1, '#c8d8ff')
  rect(g, 18, 25, 24, 2, '#3a2a20')
  rect(g, 29, 14, 2, 24, '#3a2a20')
  // Shelves with bottles and books, under dust.
  for (const [x0, y0, wd] of [
    [4, 52, 34],
    [196, 70, 40],
  ] as const) {
    rect(g, x0, y0, wd, 3, '#4a3020')
    rect(g, x0, y0, wd, 1, '#6a4a30')
    for (let x = x0 + 2; x < x0 + wd - 3; x += 4 + ((x * 3) % 3)) {
      const ht = 5 + ((x * 7) % 6)
      const c = r.pick(['#3a6a5a', '#6a3a4a', '#4a4a7a', '#7a6a3a', '#5a3a2a'] as const)
      rect(g, x, y0 - ht, 3, ht, c)
      rect(g, x, y0 - ht, 1, ht, '#8a8a8a')
    }
  }
  // Cobwebs in the corners.
  for (const [cx, sx] of [
    [0, 1],
    [W, -1],
  ] as const) {
    for (let k = 0; k < 5; k++) line(g, cx, 0, cx + sx * (6 + k * 6), 30 - k * 6, '#4a4450')
    for (let k = 1; k < 4; k++) line(g, cx + sx * k * 7, 0, cx, k * 8, '#4a4450')
  }
  // The clock's face behind its gear: a ring of numerals' ticks.
  ellipse(g, CLOCK.x, CLOCK.y, CLOCK.r + 4, CLOCK.r + 4, '#4a3020')
  ellipse(g, CLOCK.x, CLOCK.y, CLOCK.r + 2, CLOCK.r + 2, '#d8ccb0')
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    rect(g, CLOCK.x + Math.cos(a) * (CLOCK.r - 1), CLOCK.y + Math.sin(a) * (CLOCK.r - 1), 2, 2, '#3a2a20')
  }
  // Copper pipes from the gears down to the pedestal.
  for (const pts of pipes(foe)) {
    for (let i = 1; i < pts.length; i++) {
      line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], '#5a2e1a', 3)
      line(g, pts[i - 1]![0], pts[i - 1]![1] - 1, pts[i]![0], pts[i]![1] - 1, '#a8603a')
    }
  }
  // The floor: old boards.
  g.drawImage(dGradient(W, H - FLOOR, ['#3a2618', '#2a1a10', '#1a100a']), 0, FLOOR)
  rect(g, 0, FLOOR, W, 1, '#5a3a24')
  for (let k = -12; k <= 12; k++) line(g, W / 2 + k * 14, FLOOR, W / 2 + k * 34, H, '#1e140c')
  // The pedestal, under where it will stand.
  rect(g, foe.x - 12, foe.y - 4, 24, 8, '#3a3038')
  rect(g, foe.x - 14, foe.y + 3, 28, 4, '#2a2228')
  rect(g, foe.x - 12, foe.y - 4, 24, 1, '#5a4a54')
  return cv
}

/** The pipes' paths: from the gears down the wall to the pedestal, one from each side. */
const pipes = (foe: { x: number; y: number }): [number, number][][] => [
  [
    [GEARS[6]!.x, GEARS[6]!.y + 8],
    [GEARS[6]!.x, 80],
    [foe.x - 22, 80],
    [foe.x - 22, foe.y - 2],
    [foe.x - 12, foe.y - 2],
  ],
  [
    [GEARS[13]!.x, GEARS[13]!.y + 10],
    [GEARS[13]!.x, 86],
    [foe.x + 22, 86],
    [foe.x + 22, foe.y - 2],
    [foe.x + 12, foe.y - 2],
  ],
]

/** A point `q` of the way along a path. */
function along(pts: readonly [number, number][], q: number): [number, number] {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]))
  let d = lens.reduce((a, b) => a + b, 0) * q
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]!) {
      const k = d / lens[i]!
      return [lerp(pts[i]![0], pts[i + 1]![0], k), lerp(pts[i]![1], pts[i + 1]![1], k)]
    }
    d -= lens[i]!
  }
  return pts[pts.length - 1]!
}

export const magearnaCinema = bossCinema<X>({
  id: 'cinema-magearna',
  reveal: REVEAL,
  seed: 801,
  aura: ['#ffffff', '#ffd0e0', '#ff7aa8', '#8a1a3a'],
  flash: '#fff0f4',
  setup(st, r) {
    return { back: workshop(r, st.L.foe), gears: GEARS, motes: new Particles() }
  },
  step(s, t, dt) {
    const r = s.r
    s.motes.update(dt)
    // Dust in the moonbeam, shaken loose in clouds once the gears wake.
    if (r() < 0.4)
      s.motes.add({
        x: r.range(20, 110),
        y: r.range(20, FLOOR),
        vx: r.range(-3, 3),
        vy: r.range(-2, 4),
        life: 2,
        size: 1,
        shape: 'px',
        colors: ['#8a7a9a', '#c8b8d8', '#8a7a9a'],
      })
    for (const gr of s.gears)
      if (within(t, gr.at, gr.at + dt))
        for (let i = 0; i < 6; i++)
          s.fx.add({
            x: gr.x + r.range(-gr.r, gr.r),
            y: gr.y + r.range(-gr.r, gr.r),
            vx: r.range(-10, 10),
            vy: r.range(10, 30),
            ay: 40,
            life: 0.9,
            size: 1,
            shape: 'px',
            colors: ['#8a7a6a', '#5a4a3a'],
          })
    // Steam from the pipe's valve once the works are running.
    if (t > 1.4 && t < REVEAL + 1 && r() < 0.25)
      s.fx.add({
        x: GEARS[13]!.x + 8,
        y: GEARS[13]!.y + 12,
        vx: -r.range(10, 25),
        vy: -r.range(10, 25),
        life: 0.9,
        size: 2,
        size1: 5,
        shape: 'smoke',
        colors: ['#d8d0d8', '#a8a0a8'],
        density: 0.6,
      })
    const fz = spriteSize(s.foe)
    const heart = { x: s.L.foe.x, y: s.L.foe.y - fz.h * 0.5 }
    if (t > T_HEART && t < REVEAL && r() < 0.6)
      s.fx.add({
        x: heart.x + r.range(-30, 30),
        y: heart.y + r.range(-30, 30),
        home: { x: heart.x, y: heart.y, k: 200 },
        life: 0.8,
        size: 1,
        shape: 'plus',
        colors: [PINK[1], PINK[2]],
      })
    if (within(t, REVEAL, REVEAL + dt))
      for (let k = 0; k < 36; k++) {
        const a = r() * Math.PI * 2
        const v = r.range(50, 140)
        s.fx.add({
          x: heart.x,
          y: heart.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 2.5,
          life: r.range(0.6, 1),
          size: 2,
          shape: k % 2 ? 'heart' : 'star',
          colors: [PINK[1], PINK[2], PINK[3]],
        })
      }
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    // Leaving: its dark thins out with the rest of the scene (the gears and the beam go at half way).
    if (k <= 0.5) return void wash(g, '#04020a', 0.32 * k, 8)
    // The moonbeam: a dithered band from the window down to the floor, dust turning in it.
    tri(g, 18, 34, 46, 22, 96, FLOOR, pattern(g, '#5a6a9a', 3))
    tri(g, 18, 34, 96, FLOOR, 64, FLOOR, pattern(g, '#5a6a9a', 3))
    s.motes.draw(g)
    // The pendulum under the clock, swinging once it is woken.
    const pa = Math.sin(t * 5) * 0.4 * span(t, s.gears[5]!.at, s.gears[5]!.at + 0.6)
    const px = CLOCK.x + Math.sin(pa) * 26
    const py = CLOCK.y + CLOCK.r + 4 + Math.cos(pa) * 26
    line(g, CLOCK.x, CLOCK.y + CLOCK.r + 4, px, py, BRASS.dark, 2)
    ellipse(g, px, py, 5, 5, BRASS.dark)
    ellipse(g, px - 1, py - 1, 3, 3, BRASS.lit)
    // The gears: each still and dim until the one before wakes it, then bright and turning.
    for (const gr of s.gears) gear(g, gr.x, gr.y, gr.r, gr.teeth, turned(gr, t), t < gr.at)
    // The clock's hands, turning with its gear.
    const ca = turned(s.gears[5]!, t)
    line(
      g,
      CLOCK.x,
      CLOCK.y,
      CLOCK.x + Math.cos(ca * 2 - 1.2) * 12,
      CLOCK.y + Math.sin(ca * 2 - 1.2) * 12,
      '#2a1a10',
      2,
    )
    line(
      g,
      CLOCK.x,
      CLOCK.y,
      CLOCK.x + Math.cos(ca / 3 + 0.4) * 8,
      CLOCK.y + Math.sin(ca / 3 + 0.4) * 8,
      '#2a1a10',
      2,
    )
    // Light running down the pipes into the pedestal.
    for (const pts of pipes(s.L.foe))
      for (let i = 0; i < 4; i++) {
        const q = (t - T_PIPES - i * 0.15) / 0.55
        if (q <= 0 || q >= 1 || t > T_HEART + 0.5) continue
        const [x, y] = along(pts, q)
        g.drawImage(glow(5, PINK[2], 1.2, 0.8), Math.round(x) - 5, Math.round(y) - 5)
        rect(g, x - 1, y - 1, 3, 2, PINK[0])
      }
    // The shop's dark, lifting as the heart lights.
    wash(g, '#04020a', 0.4 * (1 - span(t, T_HEART, T_HEART + 0.6) * 0.6), 8)
  },
  before(g, s, t) {
    const fz = spriteSize(s.foe)
    const x = s.L.foe.x
    const rest = s.L.foe.y - 10
    // The heart: rising from the pedestal to where Magearna's chest will be.
    const y = Math.round(lerp(rest, s.L.foe.y - fz.h * 0.5, ease.ioS(span(t, T_RISE, REVEAL - 0.15))))
    const lit = span(t, T_HEART, T_HEART + 0.35)
    const beat = Math.max(
      ...[2.45, 2.75, 3.0, 3.2, 3.38, 3.52, 3.64].map((b) => (t >= b ? 1 - span(t, b, b + 0.2) : 0)),
    )
    if (lit > 0) {
      const gr = Math.round(14 + 10 * beat + 12 * span(t, T_RISE, REVEAL))
      g.drawImage(glow(gr, PINK[3], 1.3, 0.75), x - gr, y - gr)
    }
    // Its brass frame: a ring of teeth turning round it.
    gear(g, x, y, 12, 14, turned(GEARS[GEARS.length - 1]!, t) * -0.6, t < T_PIPES)
    ellipse(g, x, y, 9, 9, '#2a1a20')
    const pal =
      lit > 0.5
        ? { a: beat > 0.4 ? PINK[1] : PINK[2], b: PINK[0] }
        : { a: t > T_PIPES ? PINK[4] : '#3a1a24', b: '#6a3a4a' }
    const im = icon(HEART, pal, 2)
    g.drawImage(im, x - (im.width >> 1), y - (im.height >> 1) + 1)
    // Once it has risen: small gears orbiting it, then its body closing round it in light.
    if (t > T_RISE)
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * Math.PI * 2) / 3
        const R = lerp(34, 22, span(t, T_RISE, REVEAL))
        gear(g, x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6, 5, 7, -t * 9, false)
      }
    if (t > REVEAL - 0.35) {
      const q = span(t, REVEAL - 0.35, REVEAL)
      drawSprite(g, s.foe, x, s.L.foe.y, {
        sil: '#ffffff',
        outline: PINK[2],
        alpha: q,
        sx: lerp(0.6, 1, q),
        sy: lerp(0.6, 1, q),
      })
      g.drawImage(im, x - (im.width >> 1), y - (im.height >> 1) + 1)
    }
  },
  front(g, s, t) {
    const fz = spriteSize(s.foe)
    // The heart's beat going out in pink rings once it is lit.
    for (const b of [2.75, 3.2, 3.52])
      burstRing(g, s.L.foe.x, s.L.foe.y - fz.h * 0.5, span(t, b, b + 0.5), 70, 2, PINK[2])
    if (t > T_HEART && t < REVEAL) {
      // The Soul-Heart's light crossing the room in pink spokes.
      const k = pulse(t, T_HEART, REVEAL + 0.3)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.6
        const cx = s.L.foe.x
        const cy = s.L.foe.y - fz.h * 0.5
        line(
          g,
          cx + Math.cos(a) * 16,
          cy + Math.sin(a) * 16,
          cx + Math.cos(a) * (24 + 22 * k),
          cy + Math.sin(a) * (24 + 22 * k),
          i % 2 ? PINK[1] : PINK[2],
        )
      }
    }
  },
  sounds: [
    [0.1, () => hiss(3.6, { freq: 400, type: 'lowpass', vol: 0.02 })],
    // The clock's ticks: one, then the gears' clicks, faster as each wakes the next.
    [0.25, () => tone(2400, 0.03, { type: 'square', vol: 0.025 })],
    ...GEARS.map(
      (gr, i) => [gr.at, () => tone(1800 + (i % 3) * 300, 0.03, { type: 'square', vol: 0.025 })] as const,
    ),
    [
      1.25,
      () => [523, 659, 784].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.03, at: i * 0.18 })),
    ],
    [1.4, () => hiss(0.4, { freq: 3000, vol: 0.04 })],
    [T_PIPES, () => tone(330, 0.6, { type: 'sine', vol: 0.04, slide: 330 })],
    ...[2.45, 2.75, 3.0, 3.2, 3.38, 3.52, 3.64].map((b) => [b, () => fxSound('legend.heart')] as const),
    [
      T_HEART,
      () =>
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.3, { type: 'triangle', vol: 0.03, at: i * 0.07 }),
        ),
    ],
    [T_RISE, () => fxSound('psychic.focus')],
    [
      REVEAL,
      () => (
        fxSound('legend.roar'),
        [1568, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.2, { type: 'triangle', vol: 0.03, at: 0.1 + i * 0.09 }),
        )
      ),
    ],
  ],
})
