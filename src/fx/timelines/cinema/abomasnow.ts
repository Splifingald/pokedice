// Abomasnow's entrance (docs/61 §4.3, docs/53's boss cinematics), on the battle stage after the whiteout's last bonfire:
// the shrine in the blizzard, the crown tree standing where the foe will be. Two red eyes open in its branches; the tree
// shakes, harder, and the snow pours off its tiers in heavy clumps; then Abomasnow steps out from behind it, its
// silhouette first, white-rimmed, into its place, and shows itself (the reveal). The tree stays behind it until the
// scene dissolves into the fight's ground, the snow still driving in front.
import { hiss, tone } from '@/audio/sfx'
import { canvas, rect, span, type Canvas } from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, W, within } from '../../timeline'
import { drawCrownTree, drawFlakes, makeFlakes, stepFlakes, stormSky, WO, type Flake } from '../whiteout'
import { bossCinema } from './boss'
import { dissolve } from './kit'

const REVEAL = 3.3
const T_EYES = 0.6
const T_SHAKE = 1.2
const T_POUR = 1.6
const T_STEP = 2.5

type X = { buf: Canvas; flakes: Flake[] }

/** The tree's place: behind the foe's spot, a little to its left, so Abomasnow steps out to its right. */
const treeAt = (foe: { x: number; y: number }) => ({ x: foe.x - 22, base: foe.y + 4 })

export const abomasnowCinema = bossCinema<X>({
  id: 'cinema-abomasnow',
  reveal: REVEAL,
  seed: 460,
  aura: ['#ffffff', '#e6f1fa', '#a6c2db', '#2a5d45'],
  flash: '#e6f1fa',
  setup(_st, r) {
    return { buf: canvas(W, H), flakes: makeFlakes(r, W, H, 150) }
  },
  step(s, t, dt) {
    stepFlakes(s.flakes, W, H, dt, t < REVEAL ? 110 : 70, 1.3)
    const r = s.r
    const T = treeAt(s.L.foe)
    // The snow pouring off the tree as it shakes: heavy clumps from every tier, a white spray where they land.
    if (t > T_POUR && t < T_STEP + 0.3 && r() < 0.9)
      for (let i = 0; i < 2; i++)
        s.fx.add({
          x: T.x + r.range(-26, 26),
          y: T.base - r.range(18, 64),
          vx: r.range(-12, 12),
          vy: r.range(0, 20),
          ay: 220,
          life: r.range(0.4, 0.7),
          size: r.int(1, 3),
          shape: r() < 0.5 ? 'sq' : 'flake',
          colors: [WO.white, WO.snow, WO.frost],
        })
    if (within(t, T_STEP, T_STEP + dt))
      for (let i = 0; i < 24; i++)
        s.fx.add({
          x: T.x + r.range(-30, 30),
          y: T.base,
          vx: r.range(-40, 40),
          vy: -r.range(10, 50),
          ay: 160,
          life: r.range(0.4, 0.8),
          size: r.int(1, 2),
          shape: 'sq',
          colors: [WO.white, WO.snow],
        })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const T = treeAt(s.L.foe)
    b.drawImage(stormSky(W, H), 0, 0)
    rect(b, 0, T.base - 2, W, H - T.base + 2, WO.frost)
    for (let x = 0; x < W; x += 2) rect(b, x, T.base - 2 + ((x >> 2) % 2), 2, 1, WO.snow)
    const shaking = span(t, T_SHAKE, T_STEP)
    const amp = t < T_SHAKE || t > T_STEP + 0.4 ? 0 : 1 + 3 * shaking
    const shake = amp ? Math.round(Math.sin(t * 40) * amp) : 0
    const eyes =
      t < T_EYES
        ? 0
        : t < T_EYES + 0.1
          ? 1
          : t < T_EYES + 0.2
            ? 0
            : t < T_STEP
              ? 1
              : 1 - span(t, T_STEP, T_STEP + 0.3)
    drawCrownTree(b, T.x, T.base, 70, { shake, snow: 1 - span(t, T_POUR, T_STEP + 0.2), eyes })
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Stepping out from behind the tree: a dark silhouette rimmed white, walking to its place.
    if (t < T_STEP) return
    const C = s.L.foe
    const T = treeAt(C)
    const q = span(t, T_STEP, REVEAL - 0.1)
    const x = Math.round(T.x + (C.x - T.x) * q)
    const sz = spriteSize(s.foe)
    drawSprite(g, s.foe, x, C.y + (Math.floor(t * 6) % 2), {
      sil: WO.deep,
      outline: Math.floor(t * 12) % 2 ? WO.white : WO.frost,
    })
    // The snow it shook off still on its shoulders.
    rect(g, x - Math.round(sz.w * 0.2), C.y - sz.h + 4, Math.round(sz.w * 0.4), 1, WO.snow)
  },
  front(g, s, _t, k) {
    if (k < 0.3) return
    drawFlakes(g, s.flakes, k)
  },
  sounds: [
    [0.05, () => hiss(3.2, { freq: 600, slide: 600, q: 1.4, vol: 0.05 })],
    [
      T_EYES,
      () => (tone(1568, 0.1, { type: 'square', vol: 0.025 }), tone(98, 0.6, { type: 'sawtooth', vol: 0.04 })),
    ],
    [T_SHAKE, () => hiss(1.3, { freq: 320, type: 'lowpass', vol: 0.1 })],
    [T_POUR, () => hiss(0.9, { freq: 2200, slide: -1600, vol: 0.06 })],
    [T_STEP, () => tone(70, 0.5, { type: 'sawtooth', vol: 0.06, slide: -20 })],
    [
      REVEAL,
      () => (
        hiss(0.4, { freq: 3000, vol: 0.05 }),
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.03, at: i * 0.05 }))
      ),
    ],
  ],
})
