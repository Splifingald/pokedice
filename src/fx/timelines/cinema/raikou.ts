// Raikou's entrance (docs/53), on the battle stage: a plain at night under a thunderstorm, the Burned Tower's black
// ruin on the skyline, rain. Lightning strikes, faster and faster, each time somewhere else, and each time Raikou's
// outline crackles where it struck and is gone, a streak of light along the ground to the next. Then the dark, sparks
// running over the ground towards one spot, and one great bolt: it is there.
import { fxSound, hiss, tone } from '@/audio/sfx'
import { bolt, canvas, ellipse, Particles, polyline, rect, wash, type Canvas, type G } from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, W, H, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve } from './kit'

const REVEAL = 3.95
const GROUND = 112
/** Its strikes: when, and where along the ground; the last is its own place. */
const STRIKES: readonly [number, number][] = [
  [0.9, 46],
  [1.5, 206],
  [1.95, 96],
  [2.3, 150],
  [2.58, 30],
  [2.82, 196],
  [3.02, 120],
]
const BIG = 3.6
const YELLOW = '#ffd23a'

type X = { rain: Particles; back: Canvas; bolts: [number, number][][]; big: [number, number][] }

function plain(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#04050c', '#0b0e20', '#161a36', '#20264a']), 0, 0)
  // Clouds, heavy, in two layers.
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % (W + 40)
    const y = 4 + ((i * 13) % 30)
    ellipse(g, x, y, 20 + ((i * 7) % 14), 6 + (i % 4), i % 2 ? '#141830' : '#0c0f22')
  }
  // The Burned Tower, a black ruin on the skyline: tiers, a broken roof, charred posts.
  const tx = 34
  for (const [y, w2] of [
    [GROUND - 34, 22],
    [GROUND - 50, 16],
    [GROUND - 62, 11],
  ] as const) {
    rect(g, tx - w2, y, w2 * 2, GROUND - y, '#05060c')
    rect(g, tx - w2 - 4, y, w2 * 2 + 8, 2, '#05060c')
  }
  for (const dx of [-8, -2, 5]) rect(g, tx + dx, GROUND - 74 + Math.abs(dx), 2, 14, '#05060c')
  // Hills, then the plain's tall grass.
  for (let x = 0; x < W; x++) {
    const y = Math.round(GROUND - 6 - Math.sin(x / 29) * 4 - Math.sin(x / 11 + 2) * 1.5)
    rect(g, x, y, 1, GROUND - y, '#0a0c18')
  }
  g.drawImage(dGradient(W, H - GROUND, ['#141a20', '#0c1014', '#06080a']), 0, GROUND)
  for (let x = 0; x < W; x += 2) rect(g, x, GROUND - 2 - ((x * 7) % 4), 1, 4 + ((x * 7) % 4), '#0e1418')
  return cv
}

export const raikouCinema = bossCinema<X>({
  id: 'cinema-raikou',
  reveal: REVEAL,
  seed: 243,
  aura: ['#ffffff', '#fff3a0', '#ffd23a', '#7a5a10'],
  flash: '#fff6c8',
  setup(st, r) {
    return {
      rain: new Particles(),
      back: plain(),
      bolts: STRIKES.map(([, x]) => bolt(r, x + r.range(-30, 30), 0, x, GROUND + 4, 0.35, 5)),
      big: bolt(r, st.L.foe.x - 10, 0, st.L.foe.x, st.L.foe.y, 0.18, 5),
    }
  },
  step(s, t) {
    const r = s.r
    s.rain.update(1 / 60)
    for (let i = 0; i < 2; i++)
      s.rain.add({
        x: r.range(0, W + 50),
        y: -4,
        vx: -40,
        vy: r.range(200, 260),
        life: 1,
        size: 1,
        shape: 'streak',
        trail: 0.025,
        colors: ['#5a6a9a', '#8a9ac8'],
      })
    // Sparks where it struck; then running over the ground to its place.
    for (const [at, x] of STRIKES)
      if (within(t, at, at + 1 / 60))
        for (let i = 0; i < 14; i++)
          s.fx.add({
            x,
            y: GROUND,
            vx: r.range(-60, 60),
            vy: -r.range(20, 90),
            ay: 260,
            life: r.range(0.3, 0.6),
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#fff3a0', YELLOW],
          })
    if (t > 3.15 && t < BIG && r() < 0.8) {
      const x = r() < 0.5 ? r.range(0, 40) : r.range(W - 40, W)
      s.fx.add({
        x,
        y: s.L.foe.y + r.range(-4, 10),
        home: { x: s.L.foe.x, y: s.L.foe.y, k: 600 },
        life: 0.5,
        size: 1,
        shape: 'plus',
        colors: ['#ffffff', YELLOW],
      })
    }
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    if (k <= 0) return
    // The dark comes down before the great bolt, lifts with it.
    if (t > 3.1 && t < REVEAL + 0.4) wash(g, '#010208', t < BIG ? 0.5 : 0.5 * (1 - (t - BIG) / 0.75), 8)
    // Each strike: the bolt, then the light between it and the next as Raikou runs.
    STRIKES.forEach(([at], i) => {
      if (within(t, at, at + 0.12)) drawBolt(g, s.bolts[i]!, 2)
    })
    for (let i = 0; i + 1 < STRIKES.length; i++) {
      const [a, xa] = STRIKES[i]!
      const [b, xb] = STRIKES[i + 1]!
      const q = (t - a - 0.14) / (b - a - 0.14)
      if (q > 0 && q < 1) {
        const x = xa + (xb - xa) * q
        rect(
          g,
          Math.min(x, xa + (xb - xa) * Math.max(0, q - 0.25)),
          GROUND - 3,
          Math.abs(xb - xa) * 0.25,
          1,
          YELLOW,
        )
        rect(g, x - 1, GROUND - 4, 3, 3, '#ffffff')
      }
    }
    if (within(t, BIG, REVEAL + 0.1)) drawBolt(g, s.big, 4)
    // The scorch where it landed, crackling.
    if (t > BIG) {
      ellipse(g, s.L.foe.x, s.L.foe.y + 2, 26, 4, '#2a2410')
      if (Math.floor(t * 12) % 3 === 0)
        polyline(
          g,
          bolt(s.r, s.L.foe.x - 24, s.L.foe.y + 2, s.L.foe.x + 24, s.L.foe.y + 2, 0.4, 3),
          '#fff3a0',
        )
    }
  },
  before(g, s, t) {
    // Its outline where it struck, crouched, for an instant.
    for (const [at, x] of STRIKES)
      if (within(t, at + 0.02, at + 0.16)) {
        drawSprite(g, s.foe, x, GROUND + 2, {
          sil: '#05060c',
          outline: YELLOW,
          sx: 0.8,
          sy: 0.8,
          flip: x < W / 2,
        })
      }
    if (t >= BIG) drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, { sil: '#ffffff', outline: YELLOW })
  },
  front(g, s, t, k) {
    if (k > 0.5) s.rain.draw(g)
    // The strikes' flashes, full screen, never faster than 3 a second.
    for (const at of [0.9, 1.5, 1.95, 2.3, BIG]) if (within(t, at, at + 0.1)) screenFlash(g, '#c8c8ff', 0.3)
  },
  sounds: [
    [0.05, () => hiss(3.8, { freq: 1800, type: 'highpass', vol: 0.02 })],
    ...STRIKES.map(
      ([at], i) =>
        [
          at,
          () => (fxSound('thunder.strike'), tone(900 + i * 80, 0.05, { type: 'square', vol: 0.02 })),
        ] as const,
    ),
    [1.2, () => hiss(1.2, { freq: 150, type: 'lowpass', vol: 0.08 })],
    [3.15, () => fxSound('thunder.charge')],
    [BIG, () => (fxSound('thunder.strike'), hiss(0.8, { freq: 160, type: 'lowpass', vol: 0.14 }))],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})

/** A bolt: a violet halo, the pale body, the white core. */
function drawBolt(g: G, pts: [number, number][], wd: number) {
  polyline(
    g,
    pts.map(([x, y]) => [x + 1, y] as [number, number]),
    '#8a7ad8',
    wd + 1,
  )
  polyline(g, pts, '#fff6c8', wd)
  polyline(g, pts, '#ffffff', Math.max(1, wd - 2))
}
