// Volcanion's entrance (docs/53), on the battle stage: a volcanic valley at night where no one goes. Black crags, a
// volcano smoking against the stars, hot springs in the foreground, steam drifting low. The ground rumbles and geysers
// burst out of it in turn: water, then fire, water, fire, each one shaking the valley. Then the volcano itself erupts
// with both, a fountain of lava and a jet of water side by side, and the steam they make rolls in until the whole
// valley is white. In the steam a dark shape, a red glow, the hiss of pressure building; then its arm cannon fires a
// blast of steam into the sky that blows the cloud away, and Volcanion stands in the clear.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
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
import { H, screenFlash, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const GROUND = 112
/** The volcano's crater. */
const CRATER = { x: 72, y: 34 }
const T_ERUPT = 2.25
const T_FOG = 2.6
const T_CANNON = 3.65
const WATER = ['#ffffff', '#c8f0ff', '#5ab0f0', '#2a6ab0'] as const
const LAVA = ['#fff6c8', '#ffd23a', '#ff8a1e', '#e0402a', '#8a1a10'] as const

/** The geysers: when, where, water or fire, how high. */
const GEYSERS: readonly { at: number; x: number; y: number; fire: boolean; ht: number }[] = [
  { at: 0.75, x: 30, y: 128, fire: false, ht: 70 },
  { at: 1.2, x: 214, y: 124, fire: true, ht: 62 },
  { at: 1.6, x: 118, y: 120, fire: false, ht: 80 },
  { at: 1.95, x: 60, y: 140, fire: true, ht: 70 },
]

interface Puff {
  /** A wisp off the springs (thin, low) or a puff of the cloud. */
  wisp: boolean
  x: number
  y: number
  r: number
  vx: number
  vy: number
  front: boolean
}

type X = {
  back: Canvas
  puffs: Puff[]
  rain: Particles
  shakes: [number, number, number][]
  blown: boolean
}

/** The valley: stars, the volcano with its glowing crater, black crags, rocky ground, two hot springs. */
function valley(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#04040c', '#0a0a1c', '#1a1024', '#2a1418']), 0, 0)
  for (let i = 0; i < 50; i++)
    rect(g, r.range(0, W), r.range(0, 60), 1, 1, r() < 0.25 ? '#ffffff' : '#7a7aa8')
  // The volcano: a broad cone, its slopes streaked with old lava, its crater lit from inside.
  g.drawImage(glow(40, '#a8281a', 1.6, 0.45), CRATER.x - 40, CRATER.y - 30)
  for (let y = CRATER.y; y < GROUND; y++) {
    const half = Math.round(10 + (y - CRATER.y) * 1.25 + Math.sin(y / 3) * 1.5)
    rect(g, CRATER.x - half, y, half * 2, 1, '#1a1014')
    rect(g, CRATER.x - half, y, Math.round(half * 0.6), 1, '#241418')
  }
  for (const dx of [-6, 3, 8]) line(g, CRATER.x + dx, CRATER.y + 2, CRATER.x + dx * 3, GROUND - 6, '#5a1a10')
  rect(g, CRATER.x - 9, CRATER.y, 18, 2, '#ff8a1e')
  rect(g, CRATER.x - 7, CRATER.y - 1, 14, 1, '#ffd23a')
  // Crags, nearer and blacker.
  for (const [x, top, half] of [
    [150, 58, 26],
    [196, 70, 22],
    [236, 52, 18],
    [10, 72, 20],
  ] as const) {
    tri(g, x - half, GROUND + 2, x + half, GROUND + 2, x + 3, top, '#0c080c')
    tri(g, x - half, GROUND + 2, x + 3, top, x - 2, GROUND + 2, '#160e12')
  }
  // The ground: dark rock, warm cracks, two hot springs with their blue water.
  g.drawImage(dGradient(W, H - GROUND, ['#2a1a1a', '#1e1414', '#120c0c']), 0, GROUND)
  rect(g, 0, GROUND, W, 1, '#3a2424')
  for (let i = 0; i < 18; i++) {
    const x = r.range(0, W)
    const y = r.range(GROUND + 4, H)
    line(g, x, y, x + r.range(-10, 10), y + r.range(1, 4), '#5a1a10')
  }
  for (const [x, y, rx] of [
    [44, 146, 30],
    [214, 150, 24],
  ] as const) {
    ellipse(g, x, y, rx + 3, 6, '#3a2a2a')
    ellipse(g, x, y, rx, 4, '#2a6ab0')
    ellipse(g, x - 3, y - 1, rx - 8, 2, '#5ab0f0')
    rect(g, x - 6, y - 2, 8, 1, '#c8f0ff')
  }
  return cv
}

/** A geyser's column: a ragged pillar from the ground up, white-blue water or yellow-red fire, roaring then dying. */
function column(g: G, x: number, y: number, ht: number, q: number, fire: boolean, t: number) {
  if (q <= 0 || q >= 1) return
  const up = ease.outC(Math.min(1, q * 3))
  const fall = q > 0.6 ? (q - 0.6) / 0.4 : 0
  const top = Math.round(y - ht * up * (1 - fall * 0.7))
  const C = fire ? LAVA : WATER
  for (let yy = top; yy < y; yy++) {
    const k = (y - yy) / Math.max(1, y - top)
    const half = Math.round((3 + k * 4 + Math.sin(yy / 3 + t * 30) * 1.5) * (1 - fall * 0.6))
    if (half <= 0) continue
    rect(g, x - half, yy, half * 2, 1, C[(yy + Math.floor(t * 40)) % 5 === 0 ? 0 : 1]!)
    rect(g, x - half, yy, 1, 1, C[2]!)
    rect(g, x + half - 1, yy, 1, 1, C[3]!)
  }
  // Its crown: a spray over the top.
  ellipse(g, x, top, Math.round(6 * (1 - fall * 0.5)), 3, C[1]!)
  rect(g, x - 2, top - 1, 4, 1, C[0]!)
}

export const volcanionCinema = bossCinema<X>({
  id: 'cinema-volcanion',
  reveal: REVEAL,
  seed: 721,
  aura: ['#ffffff', '#c8e8ff', '#e0402a', '#5a1a14'],
  flash: '#f0f8ff',
  setup(_st, r) {
    return {
      back: valley(r),
      rain: new Particles(),
      blown: false,
      // The steam: low wisps at first; the cloud's puffs wait under the ground until it rolls in.
      puffs: Array.from({ length: 52 }, (_, i) => ({
        wisp: i < 10,
        x: r.range(-20, W + 20),
        y: i < 10 ? r.range(GROUND, H) : H + r.range(20, 80),
        r: i < 10 ? r.range(10, 18) : r.range(16, 30),
        vx: r.range(-6, 6),
        vy: 0,
        front: i % 3 === 0,
      })),
      shakes: [
        ...GEYSERS.map((gy) => [gy.at, 0.3, 2] as [number, number, number]),
        [T_ERUPT, 0.6, 3],
        [T_CANNON, 0.5, 4],
      ],
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.rain.update(dt)
    const fz = spriteSize(s.foe)
    const foe = { x: s.L.foe.x, y: s.L.foe.y - fz.h / 2 }
    // Each geyser throws its spray: drops of water, or burning gobbets.
    for (const gy of GEYSERS)
      if (t > gy.at && t < gy.at + 0.8 && r() < 0.9)
        for (let i = 0; i < 3; i++)
          s.fx.add({
            x: gy.x + r.range(-4, 4),
            y: gy.y - gy.ht * ease.outC(Math.min(1, (t - gy.at) * 3)),
            vx: r.range(-50, 50),
            vy: -r.range(10, 60),
            ay: 260,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: gy.fire ? 'sq' : 'drop',
            colors: gy.fire ? [...LAVA] : [...WATER],
          })
    // The volcano erupting both: lava bombs and a rain of hot water.
    if (t > T_ERUPT && t < T_CANNON)
      for (let i = 0; i < 2; i++) {
        const fire = r() < 0.5
        s.rain.add({
          x: CRATER.x + (fire ? -3 : 3),
          y: CRATER.y - 4,
          vx: (fire ? -1 : 1) * r.range(20, 90),
          vy: -r.range(90, 170),
          ay: 220,
          life: r.range(1, 1.6),
          size: fire ? 2 : 1,
          shape: fire ? 'sq' : 'drop',
          colors: fire ? [...LAVA] : [...WATER],
        })
      }
    // The steam: drifting low, then rolling in to fill the valley, then blown away by the cannon.
    for (const p of s.puffs) {
      if (t > T_CANNON) {
        if (!s.blown) {
          const a = Math.atan2(p.y - foe.y, p.x - foe.x)
          p.vx = Math.cos(a) * r.range(140, 260)
          p.vy = Math.sin(a) * r.range(100, 200) - 40
        }
      } else if (t > T_FOG) {
        // Rising into place round the valley, thickest round where it will stand.
        const ty = lerp(H * 0.02, H * 0.95, ((p.x * 7 + p.r * 13) % 100) / 100)
        p.vy += (ty - p.y) * 14 * dt - p.vy * 6 * dt
        p.vx = Math.sin(t + p.r) * 6
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    if (t > T_CANNON) s.blown = true
    // The cannon's blast: a column of steam shooting up from its back.
    if (t > T_CANNON && t < T_CANNON + 0.5)
      for (let i = 0; i < 4; i++)
        s.fx.add({
          x: foe.x - fz.w * 0.1 + r.range(-4, 4),
          y: foe.y - fz.h * 0.45,
          vx: -r.range(30, 70),
          vy: -r.range(200, 320),
          drag: 1.5,
          life: r.range(0.5, 0.8),
          size: r.int(4, 7),
          size1: 10,
          shape: 'smoke',
          colors: ['#ffffff', '#e8f0f8', '#c8d8e8'],
          light: '#ffffff',
        })
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.4)
      s.fx.add({
        x: foe.x + r.range(-fz.w * 0.5, fz.w * 0.5),
        y: foe.y + r.range(-fz.h * 0.4, 0),
        vy: -r.range(10, 25),
        life: 1,
        size: 3,
        size1: 6,
        shape: 'smoke',
        colors: ['#e8f0f8', '#c8d8e8'],
        density: 0.5,
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#04040c')
    g.save()
    g.translate(sh.x, sh.y)
    dissolve(g, s.back, k)
    if (k > 0.5) {
      // The crater flaring with each tremor; then the eruption, fire on one side, water on the other.
      const er = span(t, T_ERUPT, T_ERUPT + 0.3) * (1 - span(t, T_CANNON, T_CANNON + 0.6))
      if (er > 0) {
        g.drawImage(glow(34, '#ff6a1e', 1.4, 0.6), CRATER.x - 34, CRATER.y - 34)
        column(g, CRATER.x - 4, CRATER.y, 30, 0.2 + 0.15 * Math.sin(t * 9), true, t)
        column(g, CRATER.x + 5, CRATER.y, 36, 0.2 + 0.15 * Math.cos(t * 8), false, t)
      }
      s.rain.draw(g)
      for (const gy of GEYSERS) {
        // A crack and a hiss before it goes.
        if (t > gy.at - 0.3 && t < gy.at) rect(g, gy.x - 4, gy.y, 8, 1, gy.fire ? LAVA[2] : WATER[2])
        column(g, gy.x, gy.y, gy.ht, span(t, gy.at, gy.at + 1.1), gy.fire, t)
      }
      drawPuffs(g, s.puffs, false)
    }
    // The night is darker before the fire lights it.
    wash(g, '#02020a', 0.35 * (1 - span(t, 0.6, T_ERUPT)), 8)
    g.restore()
  },
  before(g, s, t) {
    const fz = spriteSize(s.foe)
    // In the steam: its dark shape, the glow of its arm cannon pulsing as the pressure builds.
    if (t < T_FOG + 0.4) return
    const q = span(t, T_FOG + 0.4, T_CANNON)
    const x = s.L.foe.x
    drawSprite(g, s.foe, x, s.L.foe.y, {
      sil: '#1a0c10',
      outline:
        t > T_CANNON
          ? Math.floor(t * 14) % 2
            ? '#ffffff'
            : WATER[2]
          : Math.floor(t * (4 + q * 10)) % 2
            ? '#e0402a'
            : '#5a1a14',
      alpha: t > T_CANNON ? 1 : 0.5 + q * 0.5,
    })
    const gr = Math.round(6 + 8 * q)
    g.drawImage(
      glow(gr, q > 0.7 ? '#ffffff' : '#ff6a3a', 1.2, 0.8),
      Math.round(x - fz.w * 0.1) - gr,
      Math.round(s.L.foe.y - fz.h * 0.95) - gr,
    )
  },
  front(g, s, t, k) {
    if (k <= 0) return
    drawPuffs(g, s.puffs, true)
    const fz = spriteSize(s.foe)
    // The blast: a thick white jet straight up out of its back.
    if (within(t, T_CANNON, T_CANNON + 0.45)) {
      const x = Math.round(s.L.foe.x - fz.w * 0.1)
      const y0 = Math.round(s.L.foe.y - fz.h * 0.9)
      const q = span(t, T_CANNON, T_CANNON + 0.45)
      const wd = Math.round(lerp(14, 4, q))
      g.drawImage(glow(18, '#ffffff', 1.2, 0.9), x - 18, y0 - 18)
      for (let y = Math.round(lerp(y0, -10, Math.min(1, q * 4))); y < y0; y++) {
        const off = Math.round(Math.sin(y / 4 + t * 50) * 1.5)
        rect(g, x - wd + off, y, wd * 2, 1, (y + Math.floor(t * 60)) % 4 === 0 ? WATER[1] : '#ffffff')
        rect(g, x - wd - 1 + off, y, 1, 1, WATER[2])
        rect(g, x + wd + off, y, 1, 1, WATER[2])
      }
      burstRing(g, x, y0, q * 1.3, 110, 3, '#ffffff')
      if (q < 0.4) screenFlash(g, '#f0f8ff', 0.45 * (1 - q / 0.4))
    }
  },
  sounds: [
    [0.1, () => hiss(3.5, { freq: 2400, type: 'highpass', vol: 0.015 })],
    [0.3, () => hiss(1.2, { freq: 120, type: 'lowpass', vol: 0.08 })],
    ...GEYSERS.map(
      (gy) =>
        [
          gy.at,
          () => (
            fxSound(gy.fire ? 'fire.stream' : 'water.jet'),
            tone(60, 0.3, { type: 'sawtooth', vol: 0.04, slide: -20 })
          ),
        ] as const,
    ),
    [T_ERUPT, () => (fxSound('ug.collapse'), fxSound('fire.stream'))],
    [T_FOG, () => hiss(1.1, { freq: 800, slide: 2600, vol: 0.05 })],
    ...[3.0, 3.25, 3.45].map((at) => [at, () => fxSound('legend.heart')] as const),
    [
      T_CANNON,
      () => (
        hiss(1.1, { freq: 3500, slide: -2500, vol: 0.14 }),
        tone(80, 0.6, { type: 'sawtooth', vol: 0.06, slide: -40 })
      ),
    ],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})

/** The steam's puffs: solid cores lit on top, a dithered edge; behind it (the back ones) or in front of it. */
function drawPuffs(g: G, puffs: readonly Puff[], front: boolean) {
  for (const p of puffs) {
    if (p.front !== front || p.y > H + p.r || p.x < -p.r - 4 || p.x > W + p.r + 4 || p.y < -p.r - 4) continue
    const r = Math.round(p.r)
    if (p.wisp) {
      // A thin veil hanging over the springs.
      ellipse(g, p.x, p.y, r, Math.max(2, Math.round(r * 0.3)), pattern(g, '#c8d4e0', 4))
      continue
    }
    ellipse(g, p.x, p.y, r + 3, Math.round((r + 3) * 0.7), pattern(g, front ? '#e8f0f8' : '#a8b8c8', 7))
    ellipse(g, p.x, p.y, r, Math.round(r * 0.7), front ? '#dce8f0' : '#9aaabb')
    ellipse(
      g,
      p.x - 2,
      p.y - 2,
      Math.max(1, r - 4),
      Math.max(1, Math.round((r - 4) * 0.55)),
      front ? '#ffffff' : '#c8d4e0',
    )
  }
}
