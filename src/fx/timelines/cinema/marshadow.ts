// Marshadow's entrance (docs/53), on the battle stage: an old shrine's courtyard at night, stone lanterns burning, a
// low moon throwing the pillars' shadows long across the flagstones. One shadow moves that nothing casts. It slips
// from the shade of a lantern to a pillar's to the next, faster each time, two eyes glinting in it, and every lantern
// it passes gutters out. In the dark it stands up off the ground, tall and thin, ghost-green fire licking its edges;
// then the fists: green spectral punches out of the dark from every side, blow after blow. Spectral Thief: the last
// light (the embers, the moon's glow) is torn out of the scene into one burning fist. And Marshadow steps out of it.
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
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const GROUND = 92
const MOON = { x: 34, y: 34 }
const T_DARK = 2.3
const T_STAND = 2.45
const T_FISTS = 2.95
const T_THIEF = 3.55
const GHOST = ['#ffffff', '#c8ffd8', '#5af0a0', '#1ab86a', '#0a5a3a', '#04241a'] as const

/** The stone lanterns: where they stand, and when its passing blows each out. */
const LANTERNS: readonly { x: number; y: number; out: number }[] = [
  { x: 28, y: 132, out: 0.65 },
  { x: 108, y: 112, out: 1.4 },
  { x: 214, y: 140, out: 1.92 },
  { x: 140, y: 100, out: 2.22 },
]
const PILLARS: readonly { x: number; y: number }[] = [
  { x: 72, y: 104 },
  { x: 196, y: 98 },
]
/** Its path through the shadows: when it gets to each, and where; the last is where it will stand. */
const HOPS: readonly [number, number, number][] = [
  [0.6, 44, 136],
  [1.05, 86, 112],
  [1.5, 124, 118],
  [1.9, 228, 146],
  [2.3, 0, 0],
]
/** The fists: when, from which side, at what height (from its middle). */
const FISTS: readonly [number, number, number][] = [
  [2.98, -1, -10],
  [3.08, 1, 6],
  [3.17, -1, 14],
  [3.25, 1, -16],
  [3.32, -1, 0],
  [3.39, 1, -4],
  [3.45, -1, 8],
]

type X = { back: Canvas; embers: Particles; shakes: [number, number, number][] }

/** The courtyard: night sky, the low moon, a wall and a gate's roof, the flagstones, pillars, lantern stones. */
function courtyard(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#04060e', '#0a0e1e', '#121a30', '#1a2238']), 0, 0)
  for (let i = 0; i < 36; i++) rect(g, (i * 67) % W, (i * 23) % 60, 1, 1, i % 4 ? '#6a7aa8' : '#ffffff')
  g.drawImage(glow(26, '#8aa8d8', 1.4, 0.5), MOON.x - 26, MOON.y - 26)
  ellipse(g, MOON.x, MOON.y, 11, 11, '#e8f0ff')
  ellipse(g, MOON.x + 3, MOON.y - 2, 3, 3, '#c8d8f0')
  // The shrine's wall and its gate roof, black against the sky.
  rect(g, 0, GROUND - 22, W, 22, '#0c0e18')
  rect(g, 0, GROUND - 22, W, 2, '#1c2032')
  for (let x = 6; x < W; x += 16) rect(g, x, GROUND - 20, 1, 20, '#080a12')
  const gx = 168
  tri(g, gx - 44, GROUND - 40, gx + 44, GROUND - 40, gx, GROUND - 56, '#0a0c16')
  rect(g, gx - 48, GROUND - 41, 96, 3, '#0a0c16')
  rect(g, gx - 30, GROUND - 38, 4, 38, '#0a0c16')
  rect(g, gx + 26, GROUND - 38, 4, 38, '#0a0c16')
  // The flagstones in perspective, moonlit.
  g.drawImage(dGradient(W, H - GROUND, ['#2a3042', '#20242e', '#14161e']), 0, GROUND)
  rect(g, 0, GROUND, W, 1, '#3a4258')
  for (let k = 1; k < 8; k++) rect(g, 0, Math.round(GROUND + (H - GROUND) * (k / 8) ** 1.6), W, 1, '#161a24')
  for (let k = -10; k <= 10; k++) line(g, W / 2 + k * 16, GROUND, W / 2 + k * 40, H, '#161a24')
  // The pillars' and lanterns' long shadows, away from the moon.
  for (const p of [...PILLARS, ...LANTERNS]) {
    const len = 60
    tri(g, p.x - 4, p.y, p.x + 4, p.y + 2, p.x + len, p.y + 10, pattern(g, '#06080e', 11))
    tri(g, p.x - 4, p.y, p.x + len, p.y + 10, p.x + len - 8, p.y + 14, pattern(g, '#06080e', 11))
  }
  // Pillars: weathered stone, lit on the moon's side.
  for (const p of PILLARS) {
    rect(g, p.x - 5, p.y - 46, 10, 46, '#3a3e4a')
    rect(g, p.x - 5, p.y - 46, 3, 46, '#5a6070')
    rect(g, p.x + 3, p.y - 46, 2, 46, '#22242e')
    rect(g, p.x - 7, p.y - 50, 14, 4, '#4a4e5a')
  }
  // The lanterns' stone: a foot, a post, the firebox (lit live), a roof.
  for (const l of LANTERNS) {
    rect(g, l.x - 6, l.y - 3, 12, 3, '#3a3e4a')
    rect(g, l.x - 2, l.y - 14, 4, 11, '#4a4e5a')
    rect(g, l.x - 6, l.y - 16, 12, 2, '#4a4e5a')
    rect(g, l.x - 5, l.y - 24, 10, 8, '#2a2e38')
    tri(g, l.x - 9, l.y - 24, l.x + 9, l.y - 24, l.x, l.y - 31, '#3a3e4a')
  }
  return cv
}

/** A fist seen from the side, knuckles to the right: `a` its dark rim, `b` its glow, `c` the creases, `d` its light. */
const FIST = [
  '...aaaa...',
  '..addddaa.',
  '.abddbbbaa',
  'abbbbbbcba',
  'abbbbbbbba',
  'abbbbbbcba',
  'abbbbbbbba',
  '.abbbbbcba',
  '..aaaaaaa.',
]
const FIST_L = FIST.map((row) => [...row].reverse().join(''))

/** A ghost fist flying in from one side: green, its knuckles to the front, a flame streaming off its wrist. */
function fist(g: G, x: number, y: number, side: number, k: number) {
  x = Math.round(x)
  y = Math.round(y)
  // Ghost fire streaming behind it.
  for (let i = 1; i < 7; i++) {
    const fx = x - side * (8 + i * 5)
    const r = Math.max(1, 7 - i)
    ellipse(
      g,
      fx,
      y + Math.round(Math.sin(i * 2 + k * 20) * 2),
      r + 1,
      r,
      i < 3 ? GHOST[3] : i < 5 ? GHOST[4] : GHOST[5],
    )
  }
  const im = icon(side > 0 ? FIST : FIST_L, { a: GHOST[4], b: GHOST[2], c: GHOST[4], d: GHOST[1] }, 2)
  g.drawImage(im, x - (im.width >> 1), y - (im.height >> 1))
}

export const marshadowCinema = bossCinema<X>({
  id: 'cinema-marshadow',
  reveal: REVEAL,
  seed: 802,
  aura: ['#ffffff', '#c8ffd8', '#3ae08a', '#0a3a2a'],
  flash: '#e8fff0',
  setup() {
    return {
      back: courtyard(),
      embers: new Particles(),
      shakes: FISTS.map(([at]) => [at + 0.07, 0.12, 2] as [number, number, number]),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.embers.update(dt)
    const fz = spriteSize(s.foe)
    const mid = { x: s.L.foe.x, y: s.L.foe.y - fz.h / 2 }
    // Each lantern dies in a puff of smoke, a few embers left glowing.
    for (const l of LANTERNS)
      if (within(t, l.out, l.out + dt))
        for (let i = 0; i < 8; i++)
          s.embers.add({
            x: l.x + r.range(-2, 2),
            y: l.y - 20,
            vx: r.range(-8, 8),
            vy: -r.range(10, 25),
            life: r.range(0.8, 1.4),
            size: 2,
            size1: 4,
            shape: 'smoke',
            colors: ['#5a5a6a', '#3a3a48'],
            density: 0.6,
          })
    // Spectral Thief: what light is left pulled out of the scene into its fist.
    if (t > T_THIEF && t < REVEAL)
      for (let i = 0; i < 5; i++) {
        const l = LANTERNS[Math.floor(r() * LANTERNS.length)]!
        const from = r() < 0.4 ? MOON : { x: l.x, y: l.y - 20 }
        s.fx.add({
          x: from.x + r.range(-4, 4),
          y: from.y + r.range(-3, 3),
          home: { x: mid.x + 10, y: mid.y, k: 700 },
          life: 0.7,
          size: 1,
          shape: 'streak',
          trail: 0.03,
          colors: [GHOST[1], GHOST[2], GHOST[3]],
        })
      }
    // A fist's blow: sparks of green fire where it lands.
    for (const [at, side, dy] of FISTS)
      if (within(t, at + 0.07, at + 0.07 + dt))
        for (let i = 0; i < 10; i++)
          s.fx.add({
            x: mid.x - side * 8,
            y: mid.y + dy,
            vx: side * r.range(-20, 90),
            vy: r.range(-60, 60),
            drag: 4,
            life: 0.3,
            size: 1,
            shape: r() < 0.5 ? 'star' : 'px',
            colors: [GHOST[0], GHOST[1], GHOST[2]],
          })
    // Its fire, once it is out.
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.7)
      s.fx.add({
        x: mid.x + r.range(-fz.w * 0.4, fz.w * 0.4),
        y: mid.y + r.range(-fz.h * 0.4, fz.h * 0.3),
        vy: -r.range(15, 35),
        life: 0.5,
        size: 2,
        size1: 0,
        shape: 'sq',
        colors: [GHOST[1], GHOST[2], GHOST[3], GHOST[4]],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#04060e')
    g.save()
    g.translate(sh.x, sh.y)
    dissolve(g, s.back, k)
    if (k > 0.5) {
      // The lanterns' flames and their pools of light, until it passes.
      for (const l of LANTERNS) {
        const live = t < l.out ? 1 : 1 - span(t, l.out, l.out + 0.15)
        if (live <= 0) {
          // A dying wick.
          if (t < T_THIEF)
            rect(g, l.x - 1, l.y - 20, 2, 1, Math.floor(t * 6 + l.x) % 3 ? '#8a2a10' : '#3a1008')
          continue
        }
        const flick = 1 + (Math.floor(t * 12 + l.x) % 3 === 0 ? 1 : 0)
        g.drawImage(glow(30, '#c87a2a', 1.6, 0.375 * live), l.x - 30, l.y - 20 - 30)
        rect(g, l.x - 2, l.y - 22 - flick, 4, 3 + flick, '#ffbe2e')
        rect(g, l.x - 1, l.y - 21 - flick, 2, 2, '#fff6c8')
      }
      // The moving shadow: a pool of black with its shape squashed into it, two eyes glinting; sliding from shade to
      // shade.
      if (t > HOPS[0]![0] - 0.2 && t < T_STAND) {
        const at = shadowAt(t, s.L.foe)
        ellipse(g, at.x, at.y, 14, 4, pattern(g, '#000000', 13))
        drawSprite(g, s.foe, at.x, at.y + 2, { sil: '#020304', sy: 0.28, sx: at.moving ? 1.3 : 1 })
        if (!at.moving && Math.floor(t * 5) % 4 !== 0) {
          rect(g, at.x - 3, at.y - 4, 1, 1, '#ffbe6a')
          rect(g, at.x + 2, at.y - 4, 1, 1, '#ffbe6a')
        }
      }
      s.embers.draw(g)
    }
    // The moon's light torn out of it by the thief: a dark veil closing over it.
    if (k > 0.5 && t > T_THIEF)
      ellipse(g, MOON.x, MOON.y, 16, 16, pattern(g, '#04060e', Math.round(13 * span(t, T_THIEF, REVEAL))))
    // The dark growing as the lanterns die, and again as the thief takes the last light.
    const out = LANTERNS.filter((l) => t > l.out).length
    wash(g, '#010208', Math.min(0.6, 0.12 * out + 0.25 * span(t, T_THIEF, REVEAL)) * k, 8)
    g.restore()
  },
  before(g, s, t) {
    if (t < T_STAND) return
    const fz = spriteSize(s.foe)
    const x = s.L.foe.x
    const y = s.L.foe.y
    // The shadow standing up off the flagstones: stretched tall and thin, then settling into its own shape.
    const up = ease.outBack(span(t, T_STAND, T_STAND + 0.35), 1.6)
    const settle = ease.ioS(span(t, T_FISTS - 0.1, T_THIEF))
    const sy = lerp(0.28, lerp(1.6, 1, settle), up)
    const sx = lerp(1.3, lerp(0.6, 1, settle), up)
    // Ghost fire round its edges.
    g.drawImage(
      glow(Math.round(fz.h * 0.7), GHOST[4], 1.4, 0.6),
      x - Math.round(fz.h * 0.7),
      y - Math.round(fz.h * 0.5) - Math.round(fz.h * 0.7),
    )
    drawSprite(g, s.foe, x, y, {
      sil: '#020304',
      sx,
      sy,
      outline: Math.floor(t * 14) % 3 ? GHOST[3] : GHOST[2],
      wave: { amp: 1, len: 7, phase: t * 30 },
    })
    // Spectral Thief: its fist, swelling with the stolen light.
    if (t > T_THIEF) {
      const q = span(t, T_THIEF, REVEAL)
      const fr = Math.round(6 + q * 10)
      g.drawImage(glow(fr * 2, GHOST[2], 1.3, 0.8), x + 10 - fr * 2, y - fz.h / 2 - fr * 2)
      fist(g, x + 16, y - fz.h / 2, 1, t)
    }
  },
  front(g, s, t) {
    const fz = spriteSize(s.foe)
    const mid = { x: s.L.foe.x, y: s.L.foe.y - fz.h / 2 }
    // The fists: each flies in from its side and stops dead at its body, a ring of force where it lands.
    for (const [at, side, dy] of FISTS) {
      const q = span(t, at - 0.08, at + 0.07)
      if (q > 0 && t < at + 0.2) {
        const x = lerp(side < 0 ? -30 : W + 30, mid.x - side * 12, ease.inQ(q))
        fist(g, x, mid.y + dy, -side, t)
      }
      burstRing(g, mid.x - side * 2, mid.y + dy, span(t, at + 0.07, at + 0.3), 30, 2, GHOST[1])
    }
    burstRing(g, mid.x, mid.y, span(t, T_STAND, T_STAND + 0.5), 80, 2, GHOST[3])
  },
  sounds: [
    [0.1, () => hiss(3.5, { freq: 500, type: 'lowpass', vol: 0.025 })],
    ...HOPS.map(
      ([at], i) => [at - 0.15, () => hiss(0.15, { freq: 1200 + i * 200, slide: -600, vol: 0.04 })] as const,
    ),
    ...LANTERNS.map((l) => [l.out, () => hiss(0.25, { freq: 2400, slide: -1800, vol: 0.05 })] as const),
    [T_DARK, () => fxSound('nightmare.breath')],
    [T_STAND, () => tone(110, 0.6, { type: 'sawtooth', vol: 0.04, slide: 110 })],
    ...FISTS.map(
      ([at], i) =>
        [
          at + 0.07,
          () => (fxSound('impact.hit'), tone(220 + i * 30, 0.05, { type: 'square', vol: 0.02 })),
        ] as const,
    ),
    [T_THIEF, () => (fxSound('nightmare.charge'), hiss(0.45, { freq: 300, slide: 2000, vol: 0.05 }))],
    [REVEAL, () => (fxSound('fire.hit'), fxSound('legend.roar'))],
  ],
})

/** Where the shadow is at t: resting in one shade, or darting to the next. */
function shadowAt(t: number, foe: { x: number; y: number }): { x: number; y: number; moving: boolean } {
  const last = HOPS.length - 1
  for (let i = last; i >= 0; i--) {
    const [at, hx, hy] = HOPS[i]!
    const [x, y] = i === last ? [foe.x, foe.y] : [hx, hy]
    if (t < at - 0.15) continue
    if (i > 0 && t < at) {
      const [, px, py] = HOPS[i - 1]!
      const q = ease.ioS(span(t, at - 0.15, at))
      return { x: lerp(px, x, q), y: lerp(py, y, q), moving: true }
    }
    return { x, y, moving: false }
  }
  const [, x, y] = HOPS[0]!
  return { x, y, moving: false }
}
