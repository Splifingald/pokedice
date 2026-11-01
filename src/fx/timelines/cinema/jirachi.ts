// Jirachi's entrance (docs/53), on the battle stage: a hilltop under a sky thick with stars, a cocoon of pale gold
// light floating over the grass, asleep (its thousand years). The Millennium Comet comes over, its tail across the
// whole sky, and wishes fall from it as shooting stars into the cocoon, each one a pulse of its light; five stars round
// it join into a great star of light. On the cocoon a third eye opens, slow, gold and blue; the cocoon unfurls like a
// flower, stars burst out of it, and Jirachi is awake.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  rect,
  rng,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, pulse, tri } from './kit'

const REVEAL = 4.1
const T_COMET = 0.7
/** The wishes falling into the cocoon. */
const WISHES = [1.45, 1.75, 2.0, 2.2, 2.38, 2.52] as const
const T_STAR = 2.1
const T_EYE = 2.85
const T_OPEN = 3.55

type X = { back: Canvas; twinkle: Particles; stars: { x: number; y: number; at: number }[] }

/** The hill at night: indigo sky, a band of the galaxy, hundreds of stars, the hill and its tall grass. */
function night(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, H, ['#050414', '#0c0a2a', '#1a1444', '#2a1e58'], 4), 0, 0)
  const r = rng(385)
  // The galaxy: a dithered band of faint stars from corner to corner.
  for (let i = 0; i < 260; i++) {
    const k = r()
    const x = k * W + r.range(-18, 18)
    const y = lerp(10, 110, k) + r.range(-14, 14)
    rect(g, x, y, 1, 1, r() < 0.3 ? '#5a5a9a' : '#2e2a64')
  }
  for (let i = 0; i < 90; i++)
    rect(g, r.range(0, W), r.range(0, 120), 1, 1, r() < 0.15 ? '#ffffff' : r() < 0.5 ? '#c8c8ff' : '#7a7ab8')
  // The hill, its crest lit by the starlight, and the grass.
  for (let x = 0; x < W; x++) {
    const y = Math.round(112 - Math.sin((x - 60) / 70) * 14 - Math.sin(x / 17) * 2)
    rect(g, x, y, 1, H - y, '#0e1430')
    rect(g, x, y, 1, 1, '#3a4a7a')
  }
  for (let x = 0; x < W; x += 3) {
    const y = Math.round(112 - Math.sin((x - 60) / 70) * 14 - Math.sin(x / 17) * 2)
    const hh = 3 + ((x * 7) % 5)
    line(g, x, y, x + ((x >> 2) % 3) - 1, y - hh, '#1a2448')
  }
  // Foreground grass, darker, at the bottom.
  for (let x = 0; x < W; x += 2) {
    const hh = 6 + ((x * 13) % 9)
    line(g, x, H, x + ((x >> 1) % 5) - 2, H - hh, '#070a1a')
  }
  return cv
}

export const jirachiCinema = bossCinema<X>({
  id: 'cinema-jirachi',
  reveal: REVEAL,
  seed: 385,
  aura: ['#ffffff', '#fff6c8', '#ffd23a', '#3a7ac8'],
  flash: '#fffae0',
  setup(st, r) {
    // The five stars of the great star, round where it sleeps.
    const cx = st.L.foe.x
    const cy = st.L.foe.y - 26
    const stars = [0, 1, 2, 3, 4].map((i) => {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
      return {
        x: Math.round(cx + Math.cos(a) * 46),
        y: Math.round(cy + Math.sin(a) * 40),
        at: T_STAR + i * 0.08,
      }
    })
    void r
    return { back: night(), twinkle: new Particles(), stars }
  },
  step(s, t, dt) {
    const r = s.r
    s.twinkle.update(dt)
    // Stars twinkling all over the sky.
    if (r() < 0.6)
      s.twinkle.add({
        x: r.range(0, W),
        y: r.range(0, 105),
        life: r.range(0.3, 0.7),
        size: r.int(1, 2),
        shape: 'star',
        colors: ['#ffffff', '#c8c8ff', '#5a5a9a'],
      })
    // The comet's dust drifting off its tail.
    if (within(t, T_COMET, REVEAL + 1) && r() < 0.7) {
      const [x, y] = comet(t)
      s.twinkle.add({
        x: x + r.range(0, 30),
        y: y - r.range(0, 10),
        vx: r.range(10, 30),
        vy: -r.range(0, 8),
        life: 1,
        size: 1,
        shape: 'px',
        colors: ['#ffffff', '#c8f0ff', '#5a8ac8'],
      })
    }
    // Each wish landing: a ring of sparkles off the cocoon.
    const cx = s.L.foe.x
    const cy = s.L.foe.y - 26
    for (const at of WISHES)
      if (within(t, at + 0.3, at + 0.3 + dt))
        for (let i = 0; i < 10; i++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: cx,
            y: cy,
            vx: Math.cos(a) * 50,
            vy: Math.sin(a) * 50,
            drag: 3,
            life: 0.5,
            size: 1,
            shape: 'star',
            colors: ['#ffffff', '#fff6c8', '#ffd23a'],
          })
        }
    // It wakes: stars burst out of the opened cocoon.
    if (within(t, T_OPEN + 0.2, T_OPEN + 0.2 + dt))
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(30, 110)
        s.fx.add({
          x: cx,
          y: cy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 2,
          life: r.range(0.6, 1.2),
          size: r.int(1, 3),
          shape: 'star',
          colors: ['#ffffff', '#fff6c8', '#ffd23a', '#5ac8f0'],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    dissolve(g, s.back, k)
    s.twinkle.draw(g)
    if (k < 0.5) return
    const cx = s.L.foe.x
    const cy = s.L.foe.y - 26
    // The Millennium Comet: its head, its long tail across the sky, its glow.
    if (t > T_COMET) {
      const [x, y] = comet(t)
      const b = span(t, T_COMET, T_COMET + 0.6)
      for (let i = 0; i < 70; i++) {
        const q = i / 70
        const tx = x + q * 150
        const ty = y - q * 34 + Math.sin(q * 6 + t) * 2
        const wd = Math.round((1 - q) * 4 * b)
        if (wd <= 0) continue
        rect(
          g,
          tx,
          ty - (wd >> 1),
          3,
          wd,
          q < 0.2 ? '#ffffff' : q < 0.5 ? '#c8f0ff' : q < 0.8 ? '#5a8ac8' : '#2e2a64',
        )
      }
      shine(g, x, y, 10, '#c8f0ff', 1.3, 0.8 * b)
      ellipse(g, x, y, 2, 2, '#ffffff')
    }
    // The wishes: shooting stars from the comet down into the cocoon.
    for (const at of WISHES) {
      const q = span(t, at, at + 0.3)
      if (q <= 0 || q >= 1) continue
      const [x0, y0] = comet(at)
      const x = lerp(x0, cx, ease.inQ(q))
      const y = lerp(y0, cy, ease.inQ(q))
      const [px, py] = [
        lerp(x0, cx, ease.inQ(Math.max(0, q - 0.25))),
        lerp(y0, cy, ease.inQ(Math.max(0, q - 0.25))),
      ]
      line(g, px, py, x, y, '#fff6c8')
      rect(g, x - 1, y - 1, 3, 3, '#ffffff')
    }
    // The great star drawing itself between five stars round it.
    for (const st of s.stars)
      if (t > st.at - 0.2) {
        const tw = 1 + Math.round(pulse(t, st.at - 0.2, st.at + 0.3) * 2)
        rect(g, st.x - tw, st.y, tw * 2 + 1, 1, '#ffffff')
        rect(g, st.x, st.y - tw, 1, tw * 2 + 1, '#ffffff')
      }
    const order = [0, 2, 4, 1, 3, 0]
    const fade = 1 - span(t, T_OPEN, T_OPEN + 0.4)
    for (let i = 0; i < 5; i++) {
      const a = s.stars[order[i]!]!
      const b = s.stars[order[i + 1]!]!
      const q = span(t, T_STAR + 0.3 + i * 0.1, T_STAR + 0.42 + i * 0.1)
      if (q <= 0 || fade <= 0) continue
      const c = Math.floor(t * 10 + i) % 3 ? '#fff6c8' : '#ffd23a'
      line(g, a.x, a.y, lerp(a.x, b.x, q), lerp(a.y, b.y, q), fade < 0.5 ? '#7a7ab8' : c)
    }
    // The cocoon, asleep, glowing; its light pulsing with each wish.
    if (t < REVEAL) cocoon(g, t, cx, cy)
  },
  before(g, s, t) {
    // Out of the opened cocoon: its shape in light, then itself.
    if (t < T_OPEN + 0.25) return
    const q = ease.outBack(span(t, T_OPEN + 0.25, REVEAL), 2)
    drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y - Math.round((1 - q) * 8), {
      sx: q,
      sy: q,
      sil: '#fffae0',
      outline: '#ffd23a',
    })
  },
  sounds: [
    [0.05, () => tone(988, 1.5, { type: 'sine', vol: 0.015 })],
    ...[0.3, 0.5, 0.7].map(
      (at, i) => [at, () => tone(2637 - i * 300, 0.08, { type: 'triangle', vol: 0.015 })] as const,
    ),
    [T_COMET, () => hiss(2.5, { freq: 3000, slide: -1500, vol: 0.03 })],
    [T_COMET + 0.1, () => tone(523, 1.4, { type: 'sine', vol: 0.025, slide: 262 })],
    ...WISHES.map(
      (at, i) =>
        [
          at + 0.3,
          () => tone([1568, 1760, 1976, 2093, 2349, 2637][i]!, 0.25, { type: 'triangle', vol: 0.025 }),
        ] as const,
    ),
    [T_STAR + 0.3, () => hiss(0.6, { freq: 4000, vol: 0.03 })],
    [T_EYE, () => tone(392, 0.8, { type: 'sine', vol: 0.04, slide: 392 })],
    [T_EYE + 0.4, () => fxSound('legend.heart')],
    [T_OPEN, () => fxSound('psychic.focus')],
    [
      REVEAL,
      () => (
        hiss(0.2, { freq: 5000, vol: 0.05 }),
        [2093, 2637, 3136, 4186].forEach((f, i) =>
          tone(f, 0.2, { type: 'triangle', vol: 0.03, at: i * 0.07 }),
        )
      ),
    ],
  ],
})

/** The comet's head: slowly across the top of the sky, right to left. */
function comet(t: number): [number, number] {
  const q = span(t, T_COMET, REVEAL + 2)
  return [lerp(W * 0.95, W * 0.25, q), lerp(16, 30, q)]
}

/**
 * The cocoon: an egg of pale gold light, three petals closed round it, asleep and breathing; each wish a pulse; then
 * its third eye opening on it, and its petals opening out.
 */
function cocoon(g: G, t: number, cx: number, cy: number) {
  const bob = Math.round(Math.sin(t * 1.6) * 2)
  const y = cy + bob
  const wish = Math.max(0, ...WISHES.map((at) => (t >= at + 0.3 ? 1 - span(t, at + 0.3, at + 0.6) : 0)))
  const gr = Math.round(18 + wish * 6 + span(t, T_EYE, T_OPEN) * 8)
  shine(g, cx, y, gr, '#ffd23a', 1.3, 0.5 + 0.3 * wish)
  const open = ease.outC(span(t, T_OPEN, T_OPEN + 0.4))
  // The egg of light inside, then three leaf-shaped petals wrapped round it (each a diamond: a point at its foot, wide
  // in its middle, a point at its tip), opening outward and falling away.
  if (open < 1) {
    ellipse(g, cx, y, 9, 13, '#d8c070')
    ellipse(g, cx - 1, y - 1, 7, 11, '#fffae0')
  }
  for (const [side, c, d] of [
    [-1, '#e8d890', '#a89040'],
    [1, '#e8d890', '#a89040'],
    [0, '#fff6c8', '#c8a850'],
  ] as const) {
    if (open >= 1) continue
    const a = side * (0.32 + open * 1.1)
    const len = side ? 26 : 28
    const fx = cx + side * 2
    const fy = y + 13
    // Along the petal and across it.
    const ux = Math.sin(a)
    const uy = -Math.cos(a)
    const half = side ? 7 : 6
    const mx = fx + ux * len * 0.5
    const my = fy + uy * len * 0.5
    const tx = fx + ux * len
    const ty = fy + uy * len
    tri(g, fx, fy, mx - uy * half, my + ux * half, tx, ty, d)
    tri(g, fx, fy, mx + uy * half, my - ux * half, tx, ty, c)
    line(g, fx, fy, tx, ty, '#ffffff')
  }
  // The third eye: a slit of light, then the lids parting on a gold iris and a blue pupil.
  const e = span(t, T_EYE, T_EYE + 0.5)
  if (e > 0 && open < 1) {
    const ew = 7
    const hh = Math.round(lerp(0, 4, ease.ioS(span(t, T_EYE + 0.2, T_EYE + 0.6))))
    rect(g, cx - ew, y - 1, ew * 2 + 1, 1, '#ffffff')
    if (hh > 0) {
      for (let x = -ew; x <= ew; x++) {
        const v = Math.round(hh * Math.sqrt(1 - (x / (ew + 0.5)) ** 2))
        rect(g, cx + x, y - v, 1, v * 2 + 1, '#fffae0')
      }
      ellipse(g, cx, y, Math.min(3, hh), Math.min(3, hh), '#ffd23a')
      ellipse(g, cx, y, Math.max(1, hh - 2), Math.max(1, hh - 2), '#3a7ac8')
      rect(g, cx - 1, y - 1, 1, 1, '#ffffff')
      // The lids' lines.
      for (let x = -ew; x <= ew; x++) {
        const v = Math.round(hh * Math.sqrt(1 - (x / (ew + 0.5)) ** 2))
        rect(g, cx + x, y - v - 1, 1, 1, '#a89040')
        rect(g, cx + x, y + v + 1, 1, 1, '#a89040')
      }
    }
    // The eye's gaze: a ring of light going out from it.
    burstRing(g, cx, y, span(t, T_EYE + 0.4, T_EYE + 1.1), 90, 2, '#ffd23a')
  }
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
