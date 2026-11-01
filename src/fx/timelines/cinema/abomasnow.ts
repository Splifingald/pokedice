// Abomasnow's entrance (docs/61 §4.3, docs/53's boss cinematics), on the battle stage after the whiteout's last bonfire:
// Crown Shrine in the blizzard (the shrine of whiteout.ts, its crown tree standing where the foe will be). Two red eyes
// open in the tree. The ground rumbles once, twice, the tree shudders and the first snow slides off its top; then it
// shakes hard, each tier whipping after the one above, and its snow avalanches off in clumps and powder. The tree
// heaves, a burst of snow: Abomasnow breaks out of it and steps forward into its place, a dark shape rimmed in frost,
// the ground shaking under its stomp and the snow spraying round its feet; the reveal (its burst of snow, no rings).
// The shrine dissolves into the fight's ground, the snow still driving in front.
import { hiss, tone } from '@/audio/sfx'
import { canvas, ease, lerp, softEllipse, span, wash, type Canvas } from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenShake, W } from '../../timeline'
import {
  drawEyes,
  drawShrine,
  drawShrineFront,
  drawSnow,
  makeShrine,
  makeSnow,
  stepSnow,
  treeEyes,
  treeTiers,
  WO,
  type Shrine,
  type Snow,
} from '../whiteout'
import { bossCinema } from './boss'
import { dissolve } from './kit'

const REVEAL = 4.3
const T_EYES = 0.7
/** Two rumbles, then the shaking, then it breaks out and lands. */
const T_R1 = 1.5
const T_R2 = 2.1
const T_SHAKE = 2.6
const T_BURST = 3.35
const T_LAND = 3.62
const SIZE = 92

/** A cloud of powder snow: it swells, drifts and thins out (dithered), lit on top. */
interface Powder {
  x: number
  y: number
  vx: number
  vy: number
  r0: number
  r1: number
  age: number
  life: number
  back: boolean
}

type X = { buf: Canvas; snow: Snow; shrine: Shrine; shakes: [number, number, number][]; powder: Powder[] }

/** The tree's place: right behind the foe's spot, so Abomasnow breaks out of it toward us. */
const treeAt = (foe: { x: number; y: number }) => ({ x: foe.x, base: foe.y + 2 })

/** How hard the tree shakes (pixels at its top) at t: two shudders, then harder and harder, a heave as it breaks. */
function treeShake(t: number) {
  let amp = 0
  if (t >= T_R1 && t < T_R1 + 0.45) amp = 1.6 * (1 - span(t, T_R1, T_R1 + 0.45))
  if (t >= T_R2 && t < T_R2 + 0.5) amp = 2.6 * (1 - span(t, T_R2, T_R2 + 0.5))
  if (t >= T_SHAKE && t < T_BURST) amp = lerp(2, 7, ease.inQ(span(t, T_SHAKE, T_BURST)))
  if (t >= T_BURST) amp = 8 * (1 - ease.outC(span(t, T_BURST, T_BURST + 0.9)))
  return Math.round(Math.sin(t * 27) * amp)
}

/** Snow left on the tree: a little shaken off by each rumble, then all but a dusting. */
const snowAt = (t: number) =>
  t < T_R1 ? 1 : t < T_R2 ? 0.92 : t < T_SHAKE ? 0.84 : lerp(0.84, 0.1, span(t, T_SHAKE, T_BURST + 0.15))

export const abomasnowCinema = bossCinema<X>({
  id: 'cinema-abomasnow',
  reveal: REVEAL,
  seed: 460,
  aura: ['#ffffff', '#e6f1fa', '#a6c2db', '#2a5d45'],
  flash: '#e6f1fa',
  rings: false,
  setup(st, r) {
    const T = treeAt(st.L.foe)
    return {
      buf: canvas(W, H),
      snow: makeSnow(r, W, H, 0.8),
      shrine: makeShrine(W, H, {
        treeX: T.x,
        base: T.base,
        size: SIZE,
        hz: T.base - 26,
        fewLamps: true,
        seed: 5,
      }),
      powder: [],
      shakes: [
        [T_R1, 0.3, 1],
        [T_R2, 0.4, 1],
        [T_SHAKE, T_BURST - T_SHAKE, 1],
        [T_BURST, 0.5, 3],
        [T_LAND, 0.45, 4],
      ],
    }
  },
  step(s, t, dt) {
    stepSnow(s.snow, dt, t < REVEAL ? 115 : 75, 1.2)
    for (let i = s.powder.length - 1; i >= 0; i--) {
      const p = s.powder[i]!
      p.age += dt
      if (p.age >= p.life) s.powder.splice(i, 1)
      else {
        const k = Math.max(0, 1 - 2.2 * dt)
        p.vx = p.vx * k + 30 * dt
        p.vy *= k
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
    }
    const r = s.r
    const T = treeAt(s.L.foe)
    const tiers = treeTiers(SIZE)
    const top = T.base - SIZE
    const sh = treeShake(t)
    const crossed = (at: number) => t >= at && t - dt < at
    // Snow off a tier's edge: a heavy clump falling, and its powder.
    const shed = (i: number, heavy: boolean) => {
      const tr = tiers[i]!
      const side = r() < 0.5 ? -1 : 1
      const sway = Math.round(sh * (1 - i / (tiers.length + 0.5)))
      const x = T.x + sway + side * tr.hw * r.range(0.5, 1)
      const y = top + tr.y0 + tr.th * r.range(0.6, 1)
      s.fx.add({
        x,
        y,
        vx: side * r.range(8, 30),
        vy: r.range(-10, 10),
        ay: 260,
        life: r.range(0.35, 0.6),
        size: heavy ? r.int(2, 3) : 1,
        shape: 'sq',
        colors: [WO.white, WO.snow, WO.frost],
      })
      if (heavy || r() < 0.4)
        s.fx.add({
          x,
          y: y + 3,
          vx: side * r.range(4, 14) + 20,
          vy: r.range(5, 25),
          ay: 20,
          drag: 1.5,
          life: r.range(0.6, 1),
          size: 2,
          size1: r.int(4, 6),
          shape: 'smoke',
          colors: ['#e6f1fa', '#a6c2db', '#587194'],
        })
    }
    // Each rumble shakes a little snow off the top; the shaking pours it off every tier.
    if (crossed(T_R1)) for (let i = 0; i < 4; i++) shed(r.int(0, 1), false)
    if (crossed(T_R2)) for (let i = 0; i < 7; i++) shed(r.int(0, 2), i % 2 === 0)
    if (t > T_SHAKE && t < T_BURST + 0.1) {
      const q = span(t, T_SHAKE, T_BURST)
      const n = r() < 0.4 + 0.6 * q ? 1 + (q > 0.5 ? 1 : 0) : 0
      for (let i = 0; i < n; i++) shed(r.int(0, tiers.length - 1), true)
    }
    // It breaks out: a burst of snow from the tree's heart, clumps flying.
    if (crossed(T_BURST)) {
      // Clouds of powder rolling out of it, the far ones in shadow.
      for (let i = 0; i < 12; i++) {
        const a = r.range(Math.PI * 0.9, Math.PI * 2.1)
        const v = r.range(15, 55)
        s.powder.push({
          x: T.x + r.range(-14, 14),
          y: T.base - r.range(8, 50),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.4,
          r0: r.range(5, 9),
          r1: r.range(16, 26),
          age: 0,
          life: r.range(0.9, 1.5),
          back: i < 4,
        })
      }
      for (let i = 0; i < 26; i++) {
        const a = r.range(0, Math.PI * 2)
        const v = r.range(50, 130)
        s.fx.add({
          x: T.x + r.range(-10, 10),
          y: T.base - r.range(15, 50),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 30,
          ay: 240,
          life: r.range(0.5, 0.9),
          size: r.int(1, 3),
          shape: 'sq',
          colors: [WO.white, WO.snow, WO.frost],
        })
      }
    }
    // Its stomp: snow spraying low along the ground both ways, powder rolling out.
    if (crossed(T_LAND)) {
      const C = s.L.foe
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1
        s.fx.add({
          x: C.x + side * r.range(8, 22),
          y: C.y - 1,
          vx: side * r.range(50, 130),
          vy: -r.range(15, 55),
          ay: 220,
          life: r.range(0.4, 0.75),
          size: r.int(1, 2),
          shape: 'sq',
          colors: [WO.white, WO.snow, WO.frost],
        })
      }
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1
        s.powder.push({
          x: C.x + side * r.range(10, 24),
          y: C.y - 2,
          vx: side * r.range(30, 60),
          vy: -r.range(2, 8),
          r0: 3,
          r1: r.range(9, 13),
          age: 0,
          life: r.range(0.7, 1.1),
          back: false,
        })
      }
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const sh = screenShake(t, s.shakes)
    const T = treeAt(s.L.foe)
    b.drawImage(s.shrine.sky, 0, 0)
    b.save()
    b.translate(sh.x, sh.y)
    drawShrine(b, s.shrine, { noSky: true, noFront: true, look: { shake: treeShake(t), snow: snowAt(t) } })
    // The storm's dark over the shrine, deepest while the eyes watch.
    wash(b, WO.night, 0.25 + 0.15 * span(t, T_EYES - 0.3, T_EYES) - 0.15 * span(t, T_BURST, REVEAL))
    drawSnow(b, s.snow, { depths: [0] })
    // The eyes in the tree: open (a blink), held through the shaking; gone when it breaks out.
    if (t >= T_EYES && t < T_BURST) {
      const e = treeEyes(T.x + Math.round(treeShake(t) * 0.55), T.base, SIZE)
      const d = t - T_EYES
      const open = d < 0.1 ? 1 : d < 0.18 ? 0 : d < 0.4 ? 0.4 : 1
      const glow = d < 0.1 ? 0.7 : 0.6 + 0.3 * ease.outC(span(d, 0.18, 0.6)) + 0.1 * Math.sin(t * 5)
      drawEyes(b, e.x, e.y, e.gap, glow, open, e.px)
    }
    b.restore()
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Breaking out of the tree and stepping into its place: a dark shape rimmed in frost, bigger as it comes on.
    if (t < T_BURST) return
    const sh = screenShake(t, s.shakes)
    const C = s.L.foe
    const q = span(t, T_BURST, T_LAND)
    const land = span(t, T_LAND, T_LAND + 0.2)
    const sc = t < T_LAND ? lerp(0.82, 1.04, ease.outQ(q)) : lerp(1.04, 1, land)
    const sy = t < T_LAND ? sc : sc * (1 - 0.06 * Math.sin(Math.PI * land))
    const y = Math.round(lerp(C.y - 8, C.y, ease.inQ(q)))
    const sz = spriteSize(s.foe)
    drawSprite(g, s.foe, C.x + sh.x, y + sh.y + (t > T_LAND + 0.3 ? Math.floor(t * 3) % 2 : 0), {
      sx: sc,
      sy,
      sil: WO.deep,
      outline: Math.floor(t * 10) % 2 ? WO.white : WO.frost,
    })
    // Its eyes burning in the dark shape.
    const ey = y + sh.y - Math.round(sz.h * sy * 0.74)
    drawEyes(g, C.x + sh.x, ey, Math.max(4, Math.round(sz.w * 0.09)), 0.85 + 0.15 * Math.sin(t * 6), 1)
  },
  front(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    s.buf.g.clearRect(0, 0, W, H)
    s.buf.g.save()
    s.buf.g.translate(sh.x, sh.y)
    drawShrineFront(s.buf.g, s.shrine, { lamps: 0 })
    s.buf.g.restore()
    dissolve(g, s.buf, k)
    // The powder over it all: a body in shade, a lit top, thinning into dither as it goes.
    for (const p of s.powder) {
      const q = p.age / p.life
      const rr = Math.round(lerp(p.r0, p.r1, ease.outC(q)))
      const a = 1.6 * (1 - q)
      softEllipse(
        g,
        p.x + sh.x,
        p.y + sh.y,
        rr,
        Math.round(rr * 0.75),
        p.back ? '#587194' : '#a6c2db',
        a,
        0.6,
      )
      softEllipse(
        g,
        p.x + sh.x - 2,
        p.y + sh.y - Math.round(rr * 0.25),
        Math.round(rr * 0.75),
        Math.round(rr * 0.5),
        p.back ? '#a6c2db' : WO.snow,
        a,
        0.7,
      )
    }
    if (k > 0.3) drawSnow(g, s.snow, { depths: [1, 2], k })
  },
  sounds: [
    [0.05, () => hiss(3.6, { freq: 600, slide: 600, q: 1.4, vol: 0.05 })],
    [
      T_EYES,
      () => (tone(1568, 0.1, { type: 'square', vol: 0.025 }), tone(98, 0.6, { type: 'sawtooth', vol: 0.04 })),
    ],
    [T_R1, () => tone(55, 0.35, { type: 'sawtooth', vol: 0.05, slide: -10 })],
    [T_R2, () => tone(52, 0.45, { type: 'sawtooth', vol: 0.06, slide: -12 })],
    [T_SHAKE, () => hiss(0.8, { freq: 320, type: 'lowpass', vol: 0.1 })],
    [T_SHAKE + 0.2, () => hiss(1, { freq: 2200, slide: -1600, vol: 0.06 })],
    [
      T_BURST,
      () => (
        hiss(0.5, { freq: 1800, slide: -1200, vol: 0.09 }),
        tone(90, 0.3, { type: 'square', vol: 0.05 })
      ),
    ],
    [
      T_LAND,
      () => (
        tone(60, 0.5, { type: 'sawtooth', vol: 0.08, slide: -25 }),
        hiss(0.4, { freq: 500, type: 'lowpass', vol: 0.08 })
      ),
    ],
    [
      REVEAL,
      () => (
        hiss(0.4, { freq: 3000, vol: 0.05 }),
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.03, at: i * 0.05 }))
      ),
    ],
  ],
})
