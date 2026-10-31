// Deoxys's entrance (docs/53), on the battle stage: Birth Island at night, its black triangle of rock on the shore,
// an aurora rippling over the sky. A meteor comes down out of the aurora and hits the ground: a flash, a ring of dust,
// a smoking rock in a glowing crater. The rock cracks and a violet crystal shines inside it, pulsing; green motes (the
// space virus) swarm out of it. A double helix of light (DNA) climbs out of the crystal, turning, and mutates as it
// goes, its rungs flickering between colours, the aurora pulsing with it; then the strands wrap into a body that
// glitches between copies of itself, and the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  polyline,
  rect,
  shade,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.15
const T_FALL = 0.75
const T_IMPACT = 1.3
const T_CRACK = 1.85
const T_HELIX = 2.45
const T_MUTATE = 3.0
const T_WRAP = 3.5

const ORANGE = ['#fff0d0', '#ffb05a', '#ff6a2a', '#8a2a10'] as const
const TEAL = ['#e0ffff', '#6af0e0', '#2aa8a8', '#0a4a4a'] as const
const VIOLET = ['#ffffff', '#e0b8ff', '#a05ae0', '#4a1a7a'] as const

type X = { sky: Canvas; land: Canvas; virus: Particles }

/** Birth Island at night: the sky, stars, the sea far off, the shore, the island's black triangle of rock. */
function island(): [Canvas, Canvas] {
  const sky = canvas(W, H)
  const g = sky.g
  g.drawImage(dGradient(W, 90, ['#02030c', '#070a1e', '#0e1430', '#16203e'], 4), 0, 0)
  for (let i = 0; i < 70; i++) rect(g, (i * 97) % W, (i * 41) % 80, 1, 1, i % 6 ? '#6a7ab0' : '#ffffff')
  // The sea at the horizon.
  rect(g, 0, 88, W, 6, '#0a1430')
  for (let x = 0; x < W; x += 7) rect(g, x, 90 + (x % 3), 4, 1, '#1e2e58')
  const land = canvas(W, H)
  const l = land.g
  // The shore: dark rock and grass, a little lit by the aurora.
  for (let x = 0; x < W; x++) {
    const y = Math.round(94 + Math.sin(x / 31) * 3 + Math.sin(x / 9) * 1)
    rect(l, x, y, 1, H - y, '#0c1220')
    rect(l, x, y, 1, 1, '#2a4a5a')
  }
  for (let i = 0; i < 40; i++) rect(l, (i * 53) % W, 100 + ((i * 29) % 55), 2, 1, '#18243a')
  // Rocks on the shore, their tops green in the aurora's light.
  for (let i = 0; i < 14; i++) {
    const x = (i * 71 + 30) % W
    const y = 104 + ((i * 37) % 50)
    const rx = 3 + ((i * 5) % 6) + Math.round((y - 100) / 12)
    ellipse(l, x, y, rx, Math.max(2, rx >> 1), '#141c2c')
    rect(l, x - (rx >> 1), y - Math.max(2, rx >> 1), rx, 1, '#2a6a5a')
  }
  // The triangle of rock, black, its edges catching the aurora.
  tri(l, 14, 97, 74, 97, 40, 34, '#05070e')
  tri(l, 40, 34, 74, 97, 52, 97, '#0a0e1a')
  line(l, 40, 34, 14, 97, '#2a5a5a')
  line(l, 40, 34, 74, 97, '#1a3a4a')
  return [sky, land]
}

export const deoxysCinema = bossCinema<X>({
  id: 'cinema-deoxys',
  reveal: REVEAL,
  seed: 386,
  aura: ['#ffffff', '#c8f0ff', '#a05ae0', '#3a1a5a'],
  flash: '#f0e0ff',
  setup() {
    const [sky, land] = island()
    return { sky, land, virus: new Particles() }
  },
  step(s, t, dt) {
    const r = s.r
    s.virus.update(dt)
    const fx = s.L.foe.x
    const fy = s.L.foe.y
    // The impact: dust and rock thrown out, embers.
    if (within(t, T_IMPACT, T_IMPACT + dt)) {
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + r.range(-1.4, 1.4)
        const v = r.range(40, 160)
        s.fx.add({
          x: fx,
          y: fy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 260,
          life: r.range(0.6, 1.1),
          size: r.int(1, 2),
          shape: 'sq',
          colors: [ORANGE[0], ORANGE[1], ORANGE[2], '#3a2a2a'],
        })
      }
      for (let i = 0; i < 18; i++)
        s.fx.add({
          x: fx + r.range(-6, 6),
          y: fy,
          vx: r.range(-60, 60),
          vy: -r.range(0, 20),
          drag: 2,
          life: r.range(0.8, 1.4),
          size: r.int(3, 5),
          size1: 7,
          shape: 'smoke',
          colors: ['#5a4a4a', '#3a3040', '#22202c'],
          density: 0.5,
        })
    }
    // The rock smoking.
    if (t > T_IMPACT && t < T_HELIX && r() < 0.4)
      s.fx.add({
        x: fx + r.range(-5, 5),
        y: fy - 6,
        vx: r.range(-4, 4),
        vy: -r.range(8, 16),
        life: 1.4,
        size: 2,
        size1: 5,
        shape: 'smoke',
        colors: ['#4a4050', '#2a2634'],
        density: 0.4,
      })
    // The virus: green motes swarming out of the crystal and round it.
    if (t > T_CRACK + 0.1 && t < REVEAL + 0.6 && r() < 0.8) {
      const a = r() * Math.PI * 2
      s.virus.add({
        x: fx + Math.cos(a) * 4,
        y: fy - 8 + Math.sin(a) * 3,
        vx: Math.cos(a) * r.range(20, 50),
        vy: Math.sin(a) * r.range(10, 30) - 10,
        drag: 1.5,
        life: r.range(0.6, 1.2),
        size: 1,
        shape: r() < 0.5 ? 'plus' : 'px',
        colors: ['#c8ffa0', '#6ae05a', '#2a8a3a'],
      })
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    dissolve(g, s.sky, k)
    if (k > 0.5) aurora(g, t)
    dissolve(g, s.land, k)
    if (k < 0.5) return
    const fx = s.L.foe.x
    const fy = s.L.foe.y
    // The meteor: down out of the aurora, burning, its tail behind it.
    if (within(t, T_FALL, T_IMPACT)) {
      const q = ease.inQ(span(t, T_FALL, T_IMPACT))
      const x = lerp(W * 0.2, fx, q)
      const y = lerp(-6, fy - 4, q)
      const [tx, ty] = [lerp(W * 0.2, fx, Math.max(0, q - 0.35)), lerp(-6, fy - 4, Math.max(0, q - 0.35))]
      line(g, tx, ty, x, y, ORANGE[3], 3)
      line(g, lerp(tx, x, 0.4), lerp(ty, y, 0.4), x, y, ORANGE[2], 2)
      line(g, lerp(tx, x, 0.8), lerp(ty, y, 0.8), x, y, ORANGE[0])
      g.drawImage(glow(8, ORANGE[1], 1.3, 0.8), Math.round(x) - 8, Math.round(y) - 8)
      ellipse(g, x, y, 2, 2, '#ffffff')
    }
    // The crater, glowing; the rock in it, cracking; the crystal shining inside.
    if (t > T_IMPACT) {
      const cool = span(t, T_IMPACT, T_IMPACT + 1.2)
      ellipse(g, fx, fy + 1, 26, 5, '#120c14')
      ellipse(g, fx, fy + 1, 22, 4, cool < 0.5 ? ORANGE[2] : ORANGE[3])
      ellipse(g, fx, fy, 18, 3, '#1a1420')
      if (t < T_HELIX + 0.3) {
        // The meteorite, half buried.
        ellipse(g, fx, fy - 4, 9, 7, '#2a2430')
        ellipse(g, fx - 2, fy - 6, 6, 4, '#4a4050')
        rect(g, fx - 5, fy - 9, 4, 1, '#6a6070')
      }
      const cr = span(t, T_CRACK, T_CRACK + 0.25)
      if (cr > 0) {
        const pts: [number, number][] = [
          [fx - 1, fy - 11],
          [fx + 1, fy - 7],
          [fx - 2, fy - 4],
          [fx + 1, fy],
        ]
        polyline(g, pts.slice(0, Math.max(2, Math.round(pts.length * cr))), VIOLET[1])
        // The crystal: a violet diamond, pulsing, its light out through the cracks.
        const pul = 0.5 + 0.5 * Math.sin(t * 9)
        const gr = Math.round(10 + pul * 6 + span(t, T_HELIX, REVEAL) * 10)
        shine(g, fx, fy - 6, gr, VIOLET[2], 1.2, 0.6 * cr)
        const cs = t > T_HELIX ? 4 : 3
        tri(g, fx - cs, fy - 6, fx + cs, fy - 6, fx, fy - 6 - cs * 1.6, VIOLET[2])
        tri(g, fx - cs, fy - 6, fx + cs, fy - 6, fx, fy - 6 + cs * 1.4, VIOLET[3])
        rect(g, fx - 1, fy - 9, 1, 2, VIOLET[0])
      }
    }
    for (const [d, c] of [
      [0, '#ffffff'],
      [0.1, ORANGE[1]],
    ] as const)
      burstRing(g, fx, fy, span(t, T_IMPACT + d, T_IMPACT + d + 0.7), 150, 2, c)
    s.virus.draw(g)
    // The double helix climbing out of the crystal, turning, mutating; then wrapping into a body.
    if (within(t, T_HELIX, REVEAL)) helix(g, t, fx, fy - 8)
  },
  before(g, s, t) {
    // The body, glitching into being: copies of it in orange, teal and violet jumping round a silhouette.
    if (t < T_WRAP) return
    const q = span(t, T_WRAP, REVEAL)
    const jit = (n: number) => (Math.floor(t * 30 + n) % 3) - 1
    const glitch = Math.round((1 - q) * 6)
    drawSprite(g, s.foe, s.L.foe.x + jit(0) * glitch, s.L.foe.y, {
      sil: '#120a1e',
      outline: Math.floor(t * 20) % 2 ? TEAL[1] : ORANGE[1],
      ghost: [
        { dx: -glitch - 2, color: ORANGE[2], a: 0.6 },
        { dx: glitch + 2, color: TEAL[2], a: 0.6 },
        { dy: jit(1) * glitch, color: VIOLET[2], a: 0.5 },
      ],
    })
    // Scan lines across it, the mutation settling.
    for (let i = 0; i < 4; i++) {
      const y = s.L.foe.y - ((Math.floor(t * 40) * 7 + i * 13) % 60)
      if (Math.floor(t * 25 + i) % 2) rect(g, s.L.foe.x - 30, y, 60, 1, i % 2 ? TEAL[1] : ORANGE[1])
    }
  },
  front(g, s, t, k) {
    if (k < 0.5) return
    // The impact's flash on the land: a white dome of light, gone fast.
    const q = span(t, T_IMPACT, T_IMPACT + 0.3)
    if (q > 0 && q < 1) {
      const R = Math.round(lerp(6, 40, q))
      shine(g, s.L.foe.x, s.L.foe.y, R, '#fff6e0', 1, 0.9 * (1 - q))
    }
  },
  sounds: [
    [0.05, () => tone(73, 2.4, { type: 'sine', vol: 0.05 })],
    [0.1, () => hiss(1.6, { freq: 4000, type: 'highpass', vol: 0.02 })],
    [
      T_FALL,
      () => (
        tone(1760, 0.55, { type: 'sine', vol: 0.03, slide: -1500 }),
        hiss(0.55, { freq: 3000, slide: -2600, vol: 0.06 })
      ),
    ],
    [
      T_IMPACT,
      () => (
        hiss(1, { freq: 120, type: 'lowpass', vol: 0.18 }),
        tone(45, 0.8, { type: 'sawtooth', vol: 0.06, slide: -15 })
      ),
    ],
    [T_CRACK, () => (hiss(0.1, { freq: 5000, vol: 0.05 }), tone(1976, 0.3, { type: 'triangle', vol: 0.02 }))],
    [T_CRACK + 0.2, () => fxSound('legend.heart')],
    // The helix's climb: a rising run of notes, the mutation detuning them.
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_HELIX + i * 0.12,
          () => tone(330 * 2 ** (i / 6) + (i > 4 ? 37 : 0), 0.1, { type: 'square', vol: 0.018 }),
        ] as const,
    ),
    [
      T_MUTATE,
      () => (
        tone(220, 0.5, { type: 'sawtooth', vol: 0.03, slide: 330 }),
        tone(233, 0.5, { type: 'sawtooth', vol: 0.03, slide: 300 })
      ),
    ],
    [T_WRAP, () => fxSound('psychic.focus')],
    [REVEAL, () => (fxSound('legend.roar'), hiss(0.2, { freq: 6000, vol: 0.04 }))],
  ],
})

/** An aurora curtain's light, once: bright at its foot, thinning upward in dithered steps. */
const curtain = (c: string, c2: string, c3: string) =>
  cached(`deoxys-curtain|${c}`, () =>
    shade(4, 40, (x, y) => {
      const k = 1 - y / 40
      if (y > 36) return c2
      // Fading as it goes up: its colour, then a deeper one, then nothing.
      return k ** 2.4 * 0.75 > bayer(x, y) ? (y < 20 ? c3 : c) : null
    }),
  )

/** The aurora: curtains of light rippling over the sky, green and violet, brighter as the helix mutates. */
function aurora(g: G, t: number) {
  const boost = span(t, T_MUTATE, T_WRAP) * (1 - span(t, REVEAL + 0.3, REVEAL + 1))
  for (const [i, base, c, c2, c3] of [
    [0, 32, '#2aa88a', '#6af0c0', '#145a4a'],
    [1, 50, '#6a3aa8', '#b07ae0', '#341a5a'],
  ] as const) {
    const cv = curtain(c, c2, c3)
    for (let x = 0; x < W; x++) {
      const y = Math.round(base + Math.sin(x / 26 + t * 0.9 + i * 2) * 8 + Math.sin(x / 9 - t * 1.7) * 2)
      // Each column's height ripples: folds of the curtain catching more light.
      const ray = Math.abs(Math.sin(x / 2.3 + t * 0.8 + i) * Math.sin(x / 7.1 - t * 0.5))
      const hh = Math.round(8 + 22 * ray + boost * 12)
      g.drawImage(cv, x & 3, 0, 1, 40, x, y - hh, 1, hh + 2)
    }
  }
}

/** The helix: two strands climbing and turning, rungs between them; mutating (rungs flickering, strands breaking). */
function helix(g: G, t: number, x: number, y0: number) {
  const grow = ease.outC(span(t, T_HELIX, T_HELIX + 0.6))
  const wrap = ease.inQ(span(t, T_WRAP, REVEAL))
  const mut = span(t, T_MUTATE, T_WRAP)
  const top = Math.round(lerp(y0, y0 - 74, grow) + wrap * 20)
  const R = Math.round(lerp(10, 2, wrap))
  for (let y = y0; y > top; y -= 2) {
    const ph = (y0 - y) / 7 + t * 6
    const a = Math.cos(ph) * R
    const b = -a
    const front = Math.sin(ph) > 0
    // The mutation: some rows jump sideways and swap colours.
    const glitch = mut > 0 && Math.floor(t * 15 + y) % 9 === 0 ? (Math.floor(t * 40 + y) % 5) - 2 : 0
    const ca = glitch ? TEAL[1] : ORANGE[1]
    const cb = glitch ? ORANGE[1] : TEAL[1]
    if ((y0 - y) % 6 === 0) line(g, x + a + glitch, y, x + b + glitch, y, glitch ? VIOLET[1] : '#3a3a5a')
    rect(g, x + a + glitch - (front ? 1 : 0), y, front ? 2 : 1, 2, front ? ca : ORANGE[3])
    rect(g, x + b + glitch - (front ? 0 : 1), y, front ? 1 : 2, 2, front ? TEAL[3] : cb)
  }
  // Its tip: a spark climbing.
  g.drawImage(glow(6, VIOLET[1], 1.2, 0.9), x - 6, top - 6)
  rect(g, x - 1, top - 1, 3, 3, '#ffffff')
}

/**
 * A dithered glow centred on (x, y), its radius and strength in steps: `glow` caches a canvas per radius and
 * strength, so a light that grows or fades reuses a handful of them instead of making one a frame.
 */
function shine(g: G, x: number, y: number, r: number, c: string, power: number, max: number) {
  const k = Math.round(Math.min(1, max) * 8) / 8
  if (k <= 0 || r < 1) return
  const rr = r > 12 ? Math.round(r / 4) * 4 : Math.round(r)
  g.drawImage(glow(rr, c, power, k), Math.round(x) - rr, Math.round(y) - rr)
}
