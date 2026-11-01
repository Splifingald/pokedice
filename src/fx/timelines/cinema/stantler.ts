// The shiny Stantler's entrance (docs/64 §4.1, as docs/53's bosses), on the battle stage: Moonlit Glade at night, the
// tracks' own glade in its layers (the moon and its halo, the snowy peaks, the forest, the snowfield in perspective,
// snow-laden pines and bushes), drifting into place as it opens, snow falling. The bush before the moon shakes twice,
// snow puffing off it; antlers rise out of it, a solid silhouette rimmed with moonlight; the whole reindeer rises and
// the bush parts. It crouches and rears up under the moon, its rim flashing gold three times with sparkles off its
// antlers; it stamps down (the snow bursting from the ground and the bushes, the stage shaking), the moonlight gathers
// round it, and the reveal, the shiny sparkles on its coat.
import { fxSound, hiss, tone } from '@/audio/sfx'
import { canvas, ease, glow, lerp, Particles, rng, span, type Canvas, type Rng } from '../../pixel'
import { spriteSize } from '../../sprites'
import { H, screenShake, W, within } from '../../timeline'
import {
  TS,
  bushSprite,
  buildGlade,
  drawBank,
  drawGladeBack,
  drawPose,
  drawProps,
  propAt,
  sparkle,
  type Glade,
  type View,
} from '../tracks'
import { bossCinema } from './boss'
import { dissolve } from './kit'

const REVEAL = 4.6
/** The bush shakes (twice); its antlers show; it rises and the bush parts; it crouches, rears, stamps down. */
const SHAKES = [
  [0.9, 1.2],
  [1.4, 1.7],
] as const
const T_ANTLERS = 1.85
const T_RISE = 2.5
const T_PART = 2.6
const T_CROUCH = 3.05
const T_REAR = 3.25
const FLASHES = [3.45, 3.68, 3.86] as const
const T_STAMP = 4.0
const T_HIT = T_STAMP + 0.1
const T_GATHER = 4.15
/** The hiding bush's radius. */
const BUSH = 14
/** Room on each side of it to be pushed apart. */
const PAD = 16

type X = { gl: Glade; scene: Canvas; bush: Canvas; snow: Particles; shakes: [number, number, number][] }

/** The camera drifts into place as the scene opens, then holds still for the action. */
const view = (t: number): View => ({ t, pan: lerp(14, 0, ease.ioS(span(t, 0, 1.6))) })

function glade(foe: { x: number; y: number }): Glade {
  const horizon = 74
  return buildGlade(W, H, H, {
    horizon,
    moon: { x: foe.x - 4, y: 40, R: 24 },
    pines: [
      [0.03, 0.85, 0.88],
      [0.2, 0.14, 0.32],
      [0.4, 0.04, 0.18],
      [0.99, 0.55, 0.6],
      [0.56, 0.01, 0.11],
      [0.86, 0.06, 0.2],
    ],
    bushes: [
      [0.58, 0.3, 1.3],
      [0.88, 0.33, 1.4],
      [0.36, 0.55, 1.4],
      [0.12, 0.62, 1.6],
      [0.5, 0.82, 1.8],
    ],
    seed: 234,
  })
}

/** Where its feet are before the reveal: hidden in the bush, its antlers over it, risen. */
function feetY(foeY: number, fh: number, t: number) {
  const hidden = foeY - 4 + fh
  const antlers = foeY + 6 - (BUSH * 2 + 3) - Math.round(fh * 0.3) + fh
  if (t < T_RISE)
    return Math.round(lerp(hidden, antlers, ease.outBack(span(t, T_ANTLERS, T_ANTLERS + 0.35), 1.4)))
  return Math.round(lerp(antlers, foeY, ease.outC(span(t, T_RISE, T_RISE + 0.45))))
}

export const stantlerCinema = bossCinema<X>({
  id: 'cinema-stantler',
  reveal: REVEAL,
  seed: 234,
  aura: ['#ffffff', '#fff3a0', TS.gold, '#7a5a10'],
  flash: '#fffbe0',
  setup(st) {
    const snow = new Particles()
    const r = rng(77)
    // Snow that has been falling a while: the first frame isn't empty.
    for (let i = 0; i < 40; i++) {
      addFlake(snow, r)
      snow.update(1 / 15)
    }
    return {
      gl: glade(st.L.foe),
      scene: canvas(W, H),
      bush: canvas(BUSH * 3 + 4 + PAD * 2, BUSH * 2 + 3),
      snow,
      shakes: [[T_HIT, 0.4, 2]],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const { x, y } = s.L.foe
    const fz = spriteSize(s.foe)
    s.snow.update(dt)
    if (r() < 0.7) addFlake(s.snow, r)
    const top = y + 6 - (BUSH * 2 + 3)
    const at = (a: number) => t >= a && t - dt < a
    // Each shake puffs the snow off the bush's top; the antlers and the rising throw more; the bush parts.
    for (const [a] of SHAKES) if (at(a)) kick(s.fx, r, x, top + 2, 10, 12, 0.7)
    if (at(T_ANTLERS)) kick(s.fx, r, x, top + 2, 14, 10, 1)
    if (at(T_PART)) kick(s.fx, r, x, top + 8, 24, 18, 1)
    // Sparkles off its antlers with each flash.
    for (const f of FLASHES)
      if (at(f))
        for (let i = 0; i < 6; i++)
          s.fx.add({
            x: x + r.range(-fz.w * 0.45, fz.w * 0.2),
            y: y - fz.h * r.range(0.85, 1.15),
            vx: r.range(-20, 20),
            vy: r.range(-25, 5),
            life: 0.5,
            size: 3,
            size1: 0,
            shape: 'star',
            colors: ['#ffffff', '#fff3a0', TS.gold],
          })
    // The stamp: the snow bursts out along the ground both ways, and off every bush round it.
    if (at(T_HIT)) {
      for (let i = 0; i < 46; i++) {
        const side = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: x + side * r.range(4, 22),
          y: y - r.range(0, 3),
          vx: side * r.range(40, 130),
          vy: -r.range(20, 90),
          ay: 200,
          drag: 0.8,
          life: r.range(0.5, 1),
          size: r() < 0.4 ? 2 : 1,
          shape: r() < 0.5 ? 'flake' : 'sq',
          colors: [TS.snowLit, TS.snow, TS.snowShade],
        })
      }
      s.gl.props.forEach((p, i) => {
        if (p.kind !== 'bush' || p.d > 0.45) return
        const q = propAt(s.gl, view(t), i)
        kick(s.fx, r, q.x, q.y - p.size * 2, 8, p.size, 0.8)
      })
    }
    // Moonlight gathering into it before the reveal.
    if (t > T_GATHER && t < REVEAL && r() < 0.8) {
      const a = r() * Math.PI * 2
      const d = r.range(30, 50)
      const cy = y - fz.h / 2
      s.fx.add({
        x: x + Math.cos(a) * d,
        y: cy + Math.sin(a) * d * 0.7,
        home: { x, y: cy, k: 260 },
        life: 0.6,
        size: 1,
        shape: 'px',
        colors: ['#ffffff', TS.ice],
      })
    }
    if (at(REVEAL + 0.15)) sparkle(s.fx, r, x, y, fz.w, fz.h, 8)
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, s.shakes)
    const v = view(t)
    const sg = s.scene.g
    drawGladeBack(sg, s.gl, v)
    drawProps(sg, s.gl, v)
    // The moon brightening with each flash.
    for (const f of FLASHES)
      if (within(t, f, f + 0.15)) {
        const R = s.gl.moon.R * 2
        sg.drawImage(glow(R, '#fff3a0', 1.8, 0.45), s.gl.moon.x - R, s.gl.moon.y - R)
      }
    s.snow.draw(sg)
    dissolve(g, s.scene, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_ANTLERS) return
    const { x, y } = s.L.foe
    const fz = spriteSize(s.foe)
    const sh = screenShake(t, s.shakes)
    g.save()
    g.translate(sh.x, sh.y)
    // Its pose: hidden and rising, crouching, rearing up (leaning back about its hind feet, held trembling), stamping.
    const crouch = Math.sin(Math.PI * span(t, T_CROUCH, T_REAR + 0.05))
    const up = ease.outBack(span(t, T_REAR, T_REAR + 0.3), 1.6)
    const down = ease.inQ(span(t, T_STAMP, T_HIT))
    const rear = up * (1 - down)
    const tremble = rear > 0.9 ? (Math.floor(t * 24) % 2 ? 0.02 : -0.02) : 0
    const squash = t >= T_HIT ? 1 - span(t, T_HIT, T_HIT + 0.25) : 0
    const twitch = t > T_ANTLERS + 0.4 && t < T_RISE && Math.floor(t * 6) % 3 === 0 ? 1 : 0
    const flash = FLASHES.some((f) => within(t, f, f + 0.12))
    const gather = span(t, T_GATHER, REVEAL)
    if (gather > 0) {
      const R = Math.round(lerp(20, 44, gather))
      g.drawImage(glow(R, TS.ice, 1.6, 0.25 + gather * 0.45), x - R, Math.round(y - fz.h / 2 - R))
    }
    const rim = flash ? TS.gold : gather > 0.5 ? '#ffffff' : TS.ice
    drawPose(g, s.foe, x, (t < T_RISE + 0.45 ? feetY(y, fz.h, t) : y) - twitch, {
      body: flash ? '#2a1c06' : TS.sil,
      rim,
      rimDir:
        flash || gather > 0.5
          ? [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
              [-2, 0],
              [2, 0],
              [0, -2],
            ]
          : [
              [-1, 0],
              [1, 0],
              [0, -1],
            ],
      angle: 0.34 * rear + tremble * rear,
      pivot: Math.round(fz.w * 0.28),
      sy: 1 - 0.1 * crouch + 0.06 * rear - 0.12 * squash,
      sx: 1 + 0.05 * crouch + 0.08 * squash,
      clipBelow: t < T_RISE + 0.45 ? y + 5 : undefined,
    })
    g.restore()
  },
  front(g, s, t, k) {
    if (k <= 0) return
    const { x, y } = s.L.foe
    const sh = screenShake(t, s.shakes)
    // The bush it hides in, in front of it: shaking in its two bursts, pushed apart as it rises out of it, thrown
    // wide by the stamp.
    const burst = SHAKES.find(([a, b]) => within(t, a, b))
    const shake = burst ? Math.sin(t * 48) * 2 * (1 - span(t, burst[0], burst[1]) * 0.5) : 0
    const spread = Math.round(
      7 * ease.outBack(span(t, T_PART, T_PART + 0.3)) + 6 * ease.outC(span(t, T_HIT, T_HIT + 0.3)),
    )
    const src = bushSprite(BUSH, shake)
    const half = Math.floor(src.width / 2)
    const b = s.bush
    b.g.clearRect(0, 0, b.width, b.height)
    b.g.drawImage(src, 0, 0, half, src.height, PAD - spread, 0, half, src.height)
    b.g.drawImage(
      src,
      half,
      0,
      src.width - half,
      src.height,
      PAD + half + spread,
      0,
      src.width - half,
      src.height,
    )
    dissolve(g, b, k, Math.round(x - b.width / 2) + sh.x, y + 6 - b.height + sh.y)
    if (k > 0.3) drawBank(g, s.gl, view(t))
  },
  sounds: [
    [0.05, () => hiss(4, { freq: 2400, type: 'highpass', vol: 0.02 })],
    ...SHAKES.map(([a]) => [a, () => hiss(0.3, { freq: 3000, vol: 0.05 })] as const),
    [T_ANTLERS, () => tone(392, 0.2, { type: 'triangle', vol: 0.03 })],
    [T_PART, () => hiss(0.4, { freq: 2600, vol: 0.05 })],
    [T_REAR, () => tone(330, 0.5, { type: 'triangle', vol: 0.04, slide: 330 })],
    ...FLASHES.map(
      (f, i) => [f, () => tone(1319 + i * 220, 0.08, { type: 'triangle', vol: 0.035 })] as const,
    ),
    [
      T_HIT,
      () => (
        hiss(0.5, { freq: 220, type: 'lowpass', vol: 0.12 }),
        tone(110, 0.2, { type: 'square', vol: 0.04 })
      ),
    ],
    [T_GATHER, () => hiss(0.45, { freq: 1800, slide: 4200, vol: 0.04 })],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})

function addFlake(P: Particles, r: Rng) {
  const d = r()
  const vy = lerp(9, 28, d)
  P.add({
    x: r.range(-10, W + 10),
    y: -3,
    vx: -lerp(2, 7, d) + r.range(-2, 2),
    vy,
    life: (H + 6) / vy,
    size: d > 0.82 ? 2 : 1,
    shape: 'flake',
    colors: d < 0.35 ? ['#8ea2d2'] : d < 0.75 ? ['#d8e4f8'] : ['#ffffff'],
  })
}

/** Snow puffed off a bush or the ground at (x, y). */
function kick(P: Particles, r: Rng, x: number, y: number, n: number, spread: number, up: number) {
  for (let i = 0; i < n; i++)
    P.add({
      x: x + r.range(-spread, spread),
      y: y - r.range(0, 3),
      vx: r.range(-40, 40),
      vy: -r.range(25, 75) * up,
      ay: 170,
      drag: 0.6,
      life: r.range(0.45, 0.9),
      size: r() < 0.35 ? 2 : 1,
      shape: r() < 0.5 ? 'flake' : 'sq',
      colors: [TS.snowLit, TS.snow, TS.snowShade],
    })
}
