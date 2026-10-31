// Suicune's entrance (docs/53), on the battle stage: a lake at night under a full moon, its water murky and dark, fog
// drifting over it. The north wind rises and ribbons of aurora light the sky; Suicune runs across the water from the far
// shore, and every footfall rings out a ripple that turns the water clear and blue behind it. It bounds onto a rock in
// the shallows; the reveal purifies the whole lake at once.
import { fxSound, hiss, tone } from '@/audio/sfx'
import { canvas, ease, ellipse, ellipseLine, glow, lerp, pattern, rect, span, type Canvas } from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, quad, W } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

const REVEAL = 3.95
const SHORE = 82
const T_RUN = 1.5
const T_LEAP = 3.35

type X = {
  back: Canvas
  murky: Canvas
  clear: Canvas
  steps: { x: number; y: number; t: number }[]
}

function sky(): Canvas {
  const cv = canvas(W, SHORE)
  const g = cv.g
  g.drawImage(dGradient(W, SHORE, ['#03060f', '#081428', '#10264a', '#1a3a60']), 0, 0)
  for (let i = 0; i < 40; i++)
    rect(g, (i * 53) % W, (i * 29) % (SHORE - 30), 1, 1, i % 5 ? '#8aa8d8' : '#ffffff')
  // The moon, a dithered halo round it.
  g.drawImage(glow(22, '#c8e0ff', 1.4, 0.5), 52 - 22, 22 - 22)
  ellipse(g, 52, 22, 9, 9, '#f0f6ff')
  ellipse(g, 55, 20, 3, 3, '#d0e0f4')
  // Mountains behind the lake, misty.
  for (let x = 0; x < W; x++) {
    const y = Math.round(SHORE - 18 - Math.abs(Math.sin(x / 41 + 1)) * 16 - Math.sin(x / 13) * 3)
    rect(g, x, y, 1, SHORE - y, '#0e2036')
    rect(g, x, y, 1, 1, '#2a4a6a')
  }
  return cv
}

/** The water, murky (oily purples) or clear (blue, the moon's path on it). */
function water(clear: boolean): Canvas {
  const cv = canvas(W, H - SHORE)
  const g = cv.g
  g.drawImage(
    dGradient(
      W,
      H - SHORE,
      clear ? ['#3a7ab0', '#1f5a8a', '#123e66', '#0a2a4a'] : ['#2a2030', '#1e1824', '#141018', '#0c0a10'],
    ),
    0,
    0,
  )
  for (let y = 3; y < H - SHORE; y += 4)
    for (let x = (y * 7) % 13; x < W; x += 13) rect(g, x, y, 5, 1, clear ? '#5aa0d0' : '#3a2a3a')
  if (clear)
    for (let y = 2; y < H - SHORE; y += 3) rect(g, 46 + ((y * 5) % 7) - 3, y, 10 - (y >> 4), 1, '#c8e8ff')
  rect(g, 0, 0, W, 1, clear ? '#8ad0f0' : '#4a3a4a')
  return cv
}

export const suicuneCinema = bossCinema<X>({
  id: 'cinema-suicune',
  reveal: REVEAL,
  seed: 245,
  aura: ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'],
  flash: '#e8faff',
  setup() {
    return { back: sky(), murky: water(false), clear: water(true), steps: [] }
  },
  step(s, t, dt) {
    const r = s.r
    // Footfalls while it runs: each one rings out where it lands.
    const at = run(s, t)
    if (at && t < T_LEAP && Math.floor(t * 7) !== Math.floor((t - dt) * 7)) {
      s.steps.push({ x: at.x, y: at.y, t })
      for (let i = 0; i < 6; i++)
        s.fx.add({
          x: at.x,
          y: at.y,
          vx: r.range(-30, 30),
          vy: -r.range(20, 60),
          ay: 200,
          life: 0.5,
          size: 1,
          shape: 'px',
          colors: ['#ffffff', '#c8f4ff', '#5fc0e0'],
        })
    }
    // Diamond motes off it after the reveal; the aurora's sparkle.
    if (t > REVEAL && r() < 0.3)
      s.fx.add({
        x: s.L.foe.x + r.range(-24, 24),
        y: s.L.foe.y - r.range(0, 50),
        vy: -r.range(4, 12),
        life: 0.9,
        size: 1,
        shape: 'star',
        colors: ['#ffffff', '#c8f4ff', '#5fc0e0'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const scene = sceneCanvas(s, t)
    dissolve(g, scene, k)
  },
  before(g, s, t) {
    const at = run(s, t)
    if (!at) return
    const sc = at.d
    // In silhouette, outlined in the north wind's light.
    drawSprite(g, s.foe, Math.round(at.x), Math.round(at.y), {
      sil: '#0a1a2c',
      outline: Math.floor(t * 12) % 3 ? '#9fe0f4' : '#ffffff',
      sx: sc,
      sy: sc,
      flip: at.vx < 0,
    })
  },
  sounds: [
    [0.05, () => hiss(3.6, { freq: 500, q: 5, vol: 0.025, slide: 300 })],
    [0.9, () => tone(1319, 1.2, { type: 'sine', vol: 0.02 })],
    ...Array.from(
      { length: 13 },
      (_, i) =>
        [T_RUN + i / 7, () => tone(1568 + (i % 3) * 196, 0.12, { type: 'triangle', vol: 0.025 })] as const,
    ),
    [T_LEAP, () => hiss(0.5, { freq: 900, slide: 1800, vol: 0.06 })],
    [
      REVEAL,
      () => (
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.25, { type: 'triangle', vol: 0.035, at: i * 0.06 }),
        ),
        fxSound('legend.roar')
      ),
    ],
  ],
})

/** Where it runs at t: in from the far shore, across, then round towards its rock; its size grows as it nears. */
function run(s: { L: { foe: { x: number; y: number } } }, t: number) {
  if (t < T_RUN) return null
  if (t < T_LEAP) {
    const q = ease.ioQ(span(t, T_RUN, T_LEAP))
    const p = quad({ x: -10, y: SHORE + 6 }, { x: W * 0.75, y: SHORE + 2 }, { x: W * 0.4, y: H - 26 }, q)
    const n = quad(
      { x: -10, y: SHORE + 6 },
      { x: W * 0.75, y: SHORE + 2 },
      { x: W * 0.4, y: H - 26 },
      Math.min(1, q + 0.01),
    )
    return { x: p.x, y: p.y, d: lerp(0.4, 0.95, q), vx: n.x - p.x }
  }
  if (t < REVEAL) {
    const q = span(t, T_LEAP, REVEAL)
    const p = quad(
      { x: W * 0.4, y: H - 26 },
      { x: (W * 0.4 + s.L.foe.x) / 2, y: s.L.foe.y - 60 },
      s.L.foe,
      ease.outQ(q),
    )
    return { x: p.x, y: p.y, d: 0.95 + q * 0.05, vx: 1 }
  }
  return null
}

let scratch: Canvas | null = null
/** The whole scene at t into one canvas (so it can dissolve as one): sky, aurora, water murky or cleared, rock, fog. */
function sceneCanvas(s: X & { L: { foe: { x: number; y: number } } }, t: number): Canvas {
  scratch ??= canvas(W, H)
  const g = scratch.g
  g.clearRect(0, 0, W, H)
  g.drawImage(s.back, 0, 0)
  // Aurora ribbons, rising with the north wind: thin curtains, bright at their hem.
  const au = span(t, 0.6, 2.4)
  if (au > 0)
    for (let band = 0; band < 2; band++)
      for (let x = band; x < W; x += 3) {
        const y = Math.round(8 + band * 12 + Math.sin(x / 27 + t * 1.2 + band * 2) * 7)
        const len = Math.round((5 + Math.sin(x / 11 + band + t) * 3) * au)
        rect(g, x, y, 1, len, pattern(g, band ? '#2a9a80' : '#3ac8a0', 9))
        rect(g, x, y + len, 1, 1, au > 0.6 ? '#8affd8' : '#3ac8a0')
      }
  // The murky lake, cleared in rings round its footfalls (and all at once on the reveal).
  g.drawImage(s.murky, 0, SHORE)
  for (const st of s.steps) {
    const R = Math.round(Math.min(60, (t - st.t) * 40))
    if (R <= 0) continue
    for (let dy = -Math.round(R * 0.35); dy <= Math.round(R * 0.35); dy++) {
      const y = st.y + dy
      if (y < SHORE || y >= H) continue
      const hw = Math.round(R * Math.sqrt(Math.max(0, 1 - (dy / (R * 0.35)) ** 2)))
      g.drawImage(s.clear, st.x - hw, y - SHORE, hw * 2, 1, st.x - hw, y, hw * 2, 1)
    }
    // The ring itself, going out.
    if (t - st.t < 1.2) ellipseLine(g, st.x, st.y, R, Math.max(1, Math.round(R * 0.35)), '#c8f4ff')
  }
  if (t > REVEAL) dissolve(g, s.clear, span(t, REVEAL, REVEAL + 0.4), 0, SHORE)
  // The rock it lands on.
  const fx = s.L.foe.x
  const fy = s.L.foe.y
  tri(g, fx - 30, fy + 6, fx + 28, fy + 6, fx - 4, fy - 4, '#2a3a4a')
  tri(g, fx - 30, fy + 6, fx - 4, fy - 4, fx - 18, fy + 6, '#4a6a80')
  rect(g, fx - 30, fy + 6, 58, 1, '#8ad0f0')
  // Mist lying on the water, drifting.
  for (let k = 0; k < 4; k++) {
    const y = SHORE + 4 + k * 14
    const x = Math.round(((t * (8 + k * 3) + k * 70) % (W + 120)) - 120)
    const P = pattern(g, '#5a7a90', (5 - k) * (1 - span(t, REVEAL, REVEAL + 1)))
    rect(g, x, y, 110, 4, P)
    rect(g, x + 20, y - 2, 60, 2, P)
  }
  return scratch
}
