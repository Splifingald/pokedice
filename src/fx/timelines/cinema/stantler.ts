// The shiny Stantler's entrance (docs/61 §4.1, as docs/53's bosses), on the battle stage: Moonlit Glade at night, the
// pale full moon over the snowy bushes, snow drifting down. The last bush shakes; antlers rise out of it, then the
// whole reindeer, in silhouette against the moon. It rears up under the moon, its shiny coat flashing gold in the
// moonlight three times, faster each time; it stamps down, the snow bursting from the bushes, and the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import { canvas, ease, Particles, rect, span, type Canvas } from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { TS, bushSprite } from '../tracks'
import { drawMoon } from '../nightmare'
import { bossCinema } from './boss'
import { dGradient, dissolve } from './kit'

const REVEAL = 4.1
const GROUND = 108
/** The bush it hides in shakes from here; its antlers show; it rises; it rears; it stamps down. */
const T_SHAKE = 0.8
const T_ANTLERS = 1.6
const T_RISE = 2.2
const T_REAR = 2.9
const FLASHES = [3.05, 3.45, 3.75] as const
const T_STAMP = 3.9

type X = { back: Canvas; snow: Particles }

function glade(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, [TS.night, TS.deep, TS.dark, TS.mid]), 0, 0)
  for (let i = 0; i < 46; i++)
    rect(g, (i * 53) % W, (i * 31) % (GROUND - 40), 1, 1, i % 6 ? '#8aa8d8' : '#ffffff')
  drawMoon(g, 150, 40, 24, 0.6)
  // The far bushes along the glade's edge, then its snow.
  for (let x = -6; x < W + 12; x += 18) {
    const b = bushSprite(5)
    g.drawImage(b, x, GROUND - b.height + 2)
  }
  g.drawImage(dGradient(W, H - GROUND, [TS.snow, TS.snowShade, TS.snowDeep, TS.snowDark]), 0, GROUND)
  return cv
}

export const stantlerCinema = bossCinema<X>({
  id: 'cinema-stantler',
  reveal: REVEAL,
  seed: 234,
  aura: ['#ffffff', '#fff3a0', TS.gold, '#7a5a10'],
  flash: '#fffbe0',
  setup() {
    return { back: glade(), snow: new Particles() }
  },
  step(s, t) {
    const r = s.r
    s.snow.update(1 / 60)
    if (r() < 0.6)
      s.snow.add({
        x: r.range(-10, W + 10),
        y: -3,
        vx: r.range(-6, 4),
        vy: r.range(12, 24),
        life: 6,
        size: r() < 0.15 ? 2 : 1,
        shape: 'flake',
        colors: [TS.snowLit, TS.snow, TS.snowShade],
      })
    // The stamp throws the snow off every bush round it.
    if (within(t, T_STAMP, T_STAMP + 1 / 60))
      for (let i = 0; i < 40; i++)
        s.fx.add({
          x: s.L.foe.x + r.range(-50, 50),
          y: s.L.foe.y - 4,
          vx: r.range(-70, 70),
          vy: -r.range(30, 110),
          ay: 160,
          life: r.range(0.6, 1.1),
          size: r.int(1, 2),
          shape: 'flake',
          colors: [TS.snowLit, TS.snow, TS.snowShade],
        })
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    if (k <= 0) return
    // The bush it hides in, in front of its place, shaking harder until it rises out of it.
    const shake = t >= T_SHAKE && t < T_RISE ? Math.sin(t * (30 + 30 * span(t, T_SHAKE, T_RISE))) * 2 : 0
    if (t < REVEAL) {
      const b = bushSprite(12, shake)
      g.drawImage(b, Math.round(s.L.foe.x - b.width / 2), s.L.foe.y - b.height + 6)
    }
  },
  before(g, s, t) {
    if (t < T_ANTLERS) return
    // Its antlers over the bush, then the whole of it rising, a silhouette edged with moonlight; rearing up (taller,
    // leaning back) with its coat flashing gold.
    const rise = ease.outC(span(t, T_ANTLERS, T_REAR))
    const rear = Math.sin(Math.PI * span(t, T_REAR, T_STAMP))
    const flash = FLASHES.some((f) => within(t, f, f + 0.12))
    drawSprite(g, s.foe, s.L.foe.x, Math.round(s.L.foe.y + 40 * (1 - rise)), {
      sil: flash ? TS.gold : TS.night,
      outline: flash ? '#ffffff' : TS.moon,
      sy: 1 + 0.12 * rear,
      sx: 1 - 0.05 * rear,
    })
  },
  front(g, s, t, k) {
    if (k > 0.3) s.snow.draw(g)
    // Its hiding bush's snow in front, until the stamp shakes it off.
    if (t < T_STAMP) {
      const b = bushSprite(9, t >= T_SHAKE && t < T_RISE ? Math.sin(t * 50) * 2 : 0)
      g.drawImage(b, Math.round(s.L.foe.x - 30 - b.width / 2), s.L.foe.y - b.height + 10)
      g.drawImage(b, Math.round(s.L.foe.x + 30 - b.width / 2), s.L.foe.y - b.height + 12)
    }
  },
  sounds: [
    [0.05, () => hiss(3.6, { freq: 2400, type: 'highpass', vol: 0.02 })],
    [T_SHAKE, () => hiss(0.5, { freq: 3000, vol: 0.05 })],
    [T_ANTLERS, () => tone(392, 0.2, { type: 'triangle', vol: 0.03 })],
    [T_REAR, () => tone(330, 0.5, { type: 'triangle', vol: 0.04, slide: 330 })],
    ...FLASHES.map(
      (f, i) => [f, () => tone(1319 + i * 220, 0.08, { type: 'triangle', vol: 0.035 })] as const,
    ),
    [
      T_STAMP,
      () => (
        hiss(0.5, { freq: 220, type: 'lowpass', vol: 0.12 }),
        tone(110, 0.2, { type: 'square', vol: 0.04 })
      ),
    ],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})
