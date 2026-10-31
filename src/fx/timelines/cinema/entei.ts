// Entei's entrance (docs/53), on the battle stage: inside the Burned Tower at night. Charred posts and beams, the night
// sky through the broken roof, embers in the air. Flames lick up through the floorboards and climb the posts; a burning
// beam gives way and crashes down. The fire on the floor runs to the middle and turns into a whirl, up into the light
// from the roof; on a high beam a shape stands in the flames and roars, then leaps down in an arc of fire. It lands
// where it will fight, and a ring of fire bursts out across the floor.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  ease,
  glow,
  lerp,
  line,
  Particles,
  rect,
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, quad, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const FLOOR = 118
const T_BEAM = 1.45
const T_WHIRL = 2.3
const T_ROAR = 2.95
const T_LEAP = 3.4
/** Where it stands before the leap: on the high beam, left. */
const PERCH = { x: 58, y: 84 }
const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const

type X = { back: Canvas; embers: Particles; shakes: [number, number, number][] }

/** The tower's burnt inside: the roof's hole onto the night, posts, beams, the floor. */
function tower(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, FLOOR, ['#0a0606', '#160a08', '#24100a', '#341810']), 0, 0)
  // The hole in the roof, the night beyond it, rafters across it.
  tri(g, 90, 0, 190, 0, 150, 26, '#0a1024')
  for (let i = 0; i < 10; i++) rect(g, 110 + i * 7, 2 + (i % 3) * 4, 1, 1, '#8aa8d8')
  for (const [x0, y0, x1, y1] of [
    [80, 6, 200, 18],
    [96, 0, 176, 30],
  ] as const)
    line(g, x0, y0, x1, y1, '#120806', 3)
  // Posts, charred, a crack of glow in each.
  for (const x of [14, 62, 196, 228]) {
    rect(g, x - 5, 0, 10, FLOOR, '#140a08')
    rect(g, x - 5, 0, 2, FLOOR, '#2a140c')
    for (let y = 8; y < FLOOR; y += 13) rect(g, x - 1 + ((y * 3) % 4), y, 1, 3, '#5a1a0a')
  }
  // The high beam it stands on, and a broken one hanging.
  rect(g, 0, PERCH.y + 1, 130, 6, '#1c0e0a')
  rect(g, 0, PERCH.y + 1, 130, 1, '#4a2210')
  line(g, 196, 30, 150, 74, '#1c0e0a', 4)
  // The floor: planks in perspective, scorched.
  g.drawImage(dGradient(W, H - FLOOR, ['#2a160e', '#1a0c08', '#0c0604']), 0, FLOOR)
  for (let k = -10; k <= 10; k++) line(g, W / 2 + k * 12, FLOOR, W / 2 + k * 30, H, '#120806')
  rect(g, 0, FLOOR, W, 1, '#5a2a14')
  return cv
}

export const enteiCinema = bossCinema<X>({
  id: 'cinema-entei',
  reveal: REVEAL,
  seed: 244,
  aura: ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'],
  flash: '#fff0c8',
  setup() {
    return {
      back: tower(),
      embers: new Particles(),
      shakes: [
        [T_BEAM + 0.35, 0.4, 3],
        [T_ROAR, 0.5, 2],
        [REVEAL, 0.6, 4],
      ],
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.embers.update(dt)
    if (r() < 0.6)
      s.embers.add({
        x: r.range(0, W),
        y: H + 2,
        vx: r.range(-8, 8),
        vy: -r.range(20, 50),
        life: r.range(2, 3.5),
        size: 1,
        shape: 'sq',
        colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#a8281a'],
      })
    const fire = (x: number, y: number, vx: number, vy: number, life = 0.6, size = 2) =>
      s.fx.add({ x, y, vx, vy, life, size, size1: 0, shape: 'sq', colors: [...FIRE] })
    // Flames up through the floorboards, more and more; up the posts once they take.
    const heat = span(t, 0.3, 2)
    for (let i = 0; i < 3; i++)
      if (r() < heat && t < REVEAL + 1.5)
        fire(r.range(0, W), FLOOR + r.range(0, 30), r.range(-6, 6), -r.range(20, 60), r.range(0.3, 0.7))
    if (t > 1.1 && t < REVEAL + 1.5)
      for (const x of [14, 62, 196, 228])
        if (r() < 0.5)
          fire(
            x + r.range(-5, 5),
            r.range(lerp(FLOOR, 10, span(t, 1.1, 2.4)), FLOOR),
            r.range(-5, 5),
            -r.range(20, 50),
            0.4,
            1,
          )
    // The beam lands: a burst of sparks and flame.
    if (within(t, T_BEAM + 0.35, T_BEAM + 0.35 + dt))
      for (let i = 0; i < 40; i++)
        fire(r.range(140, 200), FLOOR, r.range(-80, 80), -r.range(30, 120), r.range(0.4, 0.9), r.int(1, 3))
    // The floor's fire running to the middle and whirling up into the roof's light.
    if (t > T_WHIRL && t < T_LEAP)
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2
        const R = r.range(20, 60)
        s.fx.add({
          x: 140 + Math.cos(a) * R,
          y: FLOOR - 4 + Math.sin(a) * R * 0.2,
          vx: -Math.sin(a) * 80,
          vy: -r.range(40, 90),
          home: { x: 140, y: 20, k: 90 },
          life: 0.9,
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
      }
    // The leap's trail of fire.
    const at = leap(s, t)
    if (at && t > T_LEAP)
      for (let i = 0; i < 3; i++)
        fire(
          at.x + r.range(-10, 10),
          at.y - r.range(0, 30),
          r.range(-20, 20),
          r.range(-30, 10),
          0.4,
          r.int(2, 3),
        )
    // On landing, the ring of fire across the floor.
    if (within(t, REVEAL, REVEAL + dt))
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(80, 160)
        fire(s.L.foe.x, s.L.foe.y, Math.cos(a) * v, Math.sin(a) * v * 0.3, r.range(0.5, 0.9), r.int(2, 3))
      }
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.8) {
      const sz = spriteSize(s.foe)
      fire(
        s.L.foe.x + r.range(-sz.w * 0.4, sz.w * 0.4),
        s.L.foe.y - r.range(sz.h * 0.5, sz.h),
        r.range(-6, 6),
        -r.range(20, 40),
        0.35,
        1,
      )
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    // Nothing of the battle's ground at the edges while it shakes.
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#0a0606')
    g.save()
    g.translate(sh.x, sh.y)
    dissolve(g, s.back, k)
    // The beam: hanging, swinging free, crashing down.
    if (k > 0.5) {
      const q = ease.inQ(span(t, T_BEAM, T_BEAM + 0.35))
      const a = lerp(0.85, 0, q)
      const len = 60
      const x0 = 200
      const y0 = lerp(30, FLOOR - 4, q)
      const x1 = t < T_BEAM + 0.35 ? x0 - Math.cos(a) * len : 150
      const y1 = t < T_BEAM + 0.35 ? y0 + Math.sin(a) * len : FLOOR - 2
      const yy0 = t < T_BEAM + 0.35 ? y0 : FLOOR - 2
      line(g, x0, yy0, x1, y1, '#2a140c', 4)
      // It burns: flame pixels along it.
      for (let i = 0; i <= 12; i++) {
        const fx = lerp(x0, x1, i / 12)
        const fy = lerp(yy0, y1, i / 12) - 2 - ((i * 7 + Math.floor(t * 20)) % 4)
        rect(g, fx, fy, 2, 2, FIRE[(i + Math.floor(t * 15)) % 4]!)
      }
      // The fire's light on the room, low and warm.
      const lit = span(t, 0.5, 2.6)
      if (lit > 0) g.drawImage(glow(60, '#ff6a1e', 1.6, 0.22 * lit), 140 - 60, FLOOR - 60)
      drawFloorFire(g, t)
      if (t > T_WHIRL && t < REVEAL + 0.3)
        for (let y = 0; y < FLOOR; y++)
          for (let x = -8; x <= 8; x++)
            if (bayer(140 + x, y) < 0.35 * (1 - Math.abs(x) / 9) * span(t, T_WHIRL, T_WHIRL + 0.4))
              rect(g, 140 + x, y, 1, 1, '#ffbe2e')
    }
    if (t < T_BEAM) wash(g, '#000000', 0.35 * (1 - span(t, 0.3, T_BEAM)), 8)
    s.embers.draw(g)
    g.restore()
  },
  before(g, s, t) {
    if (t < T_ROAR - 0.4) return
    const at = leap(s, t)
    if (!at) return
    const sz = spriteSize(s.foe)
    // Its shape in the flames on the beam, outlined gold, then flying down, then white as it lands.
    if (t < T_LEAP)
      g.drawImage(glow(sz.w >> 1, '#ff8a1e', 1.4, 0.3), Math.round(at.x - sz.w / 2), Math.round(at.y - sz.h))
    drawSprite(g, s.foe, Math.round(at.x), Math.round(at.y), {
      sil: t > REVEAL - 0.1 ? '#ffffff' : '#1a0604',
      outline: Math.floor(t * 12) % 3 ? '#ffbe2e' : '#fff6c8',
    })
  },
  sounds: [
    [0.1, () => hiss(3.5, { freq: 300, type: 'lowpass', vol: 0.06 })],
    [0.6, () => fxSound('fire.stream')],
    [T_BEAM, () => tone(220, 0.35, { type: 'sawtooth', vol: 0.03, slide: -150 })],
    [
      T_BEAM + 0.35,
      () => (
        hiss(0.5, { freq: 180, type: 'lowpass', vol: 0.14 }),
        tone(60, 0.4, { type: 'sawtooth', vol: 0.05, slide: -20 })
      ),
    ],
    [T_WHIRL, () => hiss(1, { freq: 400, slide: 1400, vol: 0.07 })],
    [T_ROAR, () => fxSound('legend.roar')],
    [T_LEAP, () => hiss(0.5, { freq: 700, slide: 1600, vol: 0.08 })],
    [REVEAL, () => (fxSound('fire.hit'), hiss(0.8, { freq: 200, type: 'lowpass', vol: 0.14 }))],
  ],
})

/** Flames along the floor: low at first, then a wall of them licking up, ragged and never still. */
function drawFloorFire(g: G, t: number) {
  const k = span(t, 0.4, 2.2) * (1 - span(t, REVEAL + 0.8, REVEAL + 1.3))
  if (k <= 0) return
  for (let x = 0; x < W; x++) {
    const n =
      Math.sin(x / 5 + t * 9) * 3 +
      Math.sin(x / 2.3 - t * 13) * 2 +
      (((x * 13 + Math.floor(t * 20) * 7) % 5) - 2)
    const ht = Math.max(0, Math.round((10 + n) * k))
    for (let y = 0; y < ht; y++) {
      const e = y / Math.max(1, ht)
      const i = Math.min(FIRE.length - 1, Math.floor(e * 4.5 + bayer(x, y + Math.floor(t * 30)) * 1.2))
      rect(g, x, FLOOR + 4 - y, 1, 1, FIRE[i]!)
    }
  }
}

/** Where it is: on the beam, then in the air, then landed. */
function leap(s: { L: { foe: { x: number; y: number } } }, t: number) {
  if (t < T_LEAP) return { x: PERCH.x, y: PERCH.y }
  if (t < REVEAL) {
    const q = ease.inQ(span(t, T_LEAP, REVEAL))
    return quad(PERCH, { x: (PERCH.x + s.L.foe.x) / 2, y: PERCH.y - 40 }, s.L.foe, q)
  }
  return null
}
