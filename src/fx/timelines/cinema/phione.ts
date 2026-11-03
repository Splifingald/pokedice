// Phione's entrance (docs/53), on the battle stage: a warm sea at sunset, the sun half down on the horizon and its
// glitter road on the swell. Little lights come on across the water one by one: Phione's floats, a drifting shoal of
// them bobbing on the waves. A warm current takes them and they drift into a slow whirl round one spot, closer and
// faster, the water glowing aqua under them; they rise off the sea in a spiral of lanterns and gather into one light,
// which drops into the middle of the whirl. Rings run out over the water and Phione bobs up in the middle of them.
import { hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  rect,
  softEllipse,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, pulse } from './kit'

const REVEAL = 3.85
const SEA = 58
const T_CURRENT = 1.35
const T_RISE = 2.55
const T_ONE = 3.0
const T_DROP = 3.15
const T_SPLASH = T_DROP + 0.1
const T_UP = 3.3
/** How high the lights rise before they are one. */
const LIFT = 52
/** The sun, half set on the far left: its road runs down the water away from where Phione comes. */
const SUN = { x: 56, R: 15 }
const AQUA = ['#e0fcff', '#a8f0ff', '#5ac8e8', '#2a7a9a'] as const

/** A float on the sea: where it starts (x, and its depth 0 far .. 1 near), when its light comes on, its bob. */
type Float = { x: number; d: number; on: number; ph: number; vx: number; ring: number; k: number }
type X = { sky: Canvas; sea: Canvas; buf: Canvas; floats: Float[] }

/** The sunset: violet to rose to gold, long clouds lit from under, the sun sitting on the line. */
function sky(): Canvas {
  const cv = canvas(W, SEA)
  const g = cv.g
  g.drawImage(dGradient(W, SEA, ['#241c48', '#4a2e6e', '#9a4a7a', '#e8786a', '#ffbc78']), 0, 0)
  for (let i = 0; i < 24; i++) rect(g, (i * 61) % W, (i * 17) % 18, 1, 1, i % 4 ? '#8a6aa8' : '#ffffff')
  // Long thin clouds, their bellies lit by the sun below them.
  for (const [x, y, w] of [
    [10, 14, 70],
    [120, 9, 96],
    [150, 22, 70],
    [30, 30, 54],
    [96, 36, 90],
    [190, 40, 60],
  ] as const) {
    rect(g, x, y, w, 2, '#6a3a6a')
    rect(g, x + 4, y + 2, w - 8, 1, y > 25 ? '#ffb070' : '#e07a7a')
    rect(g, x + 10, y - 1, Math.round(w * 0.5), 1, '#5a3266')
  }
  g.drawImage(glow(40, '#ffd08a', 1.6, 0.55), SUN.x - 40, SEA - 40)
  g.drawImage(glow(24, '#fff0b0', 1.3, 0.6), SUN.x - 24, SEA - 24)
  ellipse(g, SUN.x, SEA, SUN.R, SUN.R, '#ffe8a0')
  ellipse(g, SUN.x, SEA, SUN.R - 3, SUN.R - 3, '#fff8d8')
  // A far island, low on the line.
  for (let x = 196; x < 236; x++) {
    const y = Math.round(SEA - 4 - Math.sin(((x - 196) / 40) * Math.PI) * 5)
    rect(g, x, y, 1, SEA - y, '#3a2448')
  }
  return cv
}

/** The sea: the sky's rose near the line, then warm teal, deeper in front. */
function sea(): Canvas {
  const cv = canvas(W, H - SEA)
  cv.g.drawImage(dGradient(W, H - SEA, ['#c4747e', '#5a7a9a', '#226a82', '#145068', '#0c344a']), 0, 0)
  rect(cv.g, 0, 0, W, 1, '#ffd0a0')
  return cv
}

export const phioneCinema = bossCinema<X>({
  id: 'cinema-phione',
  reveal: REVEAL,
  seed: 489,
  aura: ['#ffffff', '#c8f4ff', '#5ac8e8', '#1f5a8a'],
  flash: '#e0faff',
  setup(_st, r) {
    // Spread over the whole sea, nearer ones fewer; each gets a slot on the whirl's last ring.
    const floats = Array.from({ length: 30 }, (_, i) => ({
      x: r.range(6, W - 6),
      d: r.range(0.05, 1) ** 1.3,
      on: 0.3 + i * 0.035 + r.range(0, 0.15),
      ph: r.range(0, 6.3),
      vx: r.range(-4, 4),
      ring: 20 + (i % 3) * 7,
      k: ((i * 7) % 30) / 30,
    }))
    return { sky: sky(), sea: sea(), buf: canvas(W, H), floats }
  },
  step(s, t, dt) {
    const r = s.r
    const C = s.L.foe
    // Spray off the floats as the current tugs them; the splash where the light drops in.
    if (t > T_CURRENT + 0.3 && t < T_RISE && r() < 0.5) {
      const f = s.floats[Math.floor(r() * s.floats.length)]!
      const at = floatAt(f, t, C)
      s.fx.add({
        x: at.x,
        y: at.y + 1,
        vx: r.range(-6, 6),
        vy: -r.range(6, 16),
        ay: 60,
        life: 0.4,
        size: 1,
        shape: 'px',
        colors: ['#e0fcff', '#a8f0ff'],
      })
    }
    if (within(t, T_SPLASH, T_SPLASH + dt))
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI / 2 + r.range(-0.9, 0.9)
        const v = r.range(40, 120)
        s.fx.add({
          x: C.x + r.range(-6, 6),
          y: C.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 280,
          life: r.range(0.5, 0.9),
          size: r.int(1, 2),
          shape: r() < 0.6 ? 'drop' : 'sq',
          colors: [...AQUA],
        })
      }
    // The water running off it as it bobs up.
    if (t > T_UP && t < REVEAL + 0.8 && r() < 0.7) {
      const sz = spriteSize(s.foe)
      s.fx.add({
        x: C.x + r.range(-sz.w * 0.4, sz.w * 0.4),
        y: C.y - r.range(4, sz.h * 0.7),
        vy: r.range(0, 20),
        ay: 240,
        life: 0.5,
        size: 1,
        shape: 'drop',
        colors: ['#e0fcff', '#5ac8e8'],
      })
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const C = s.L.foe
    b.drawImage(s.sky, 0, 0)
    b.drawImage(s.sea, 0, SEA)
    drawSea(b, t)
    // The water glowing aqua from below as the whirl turns, brightest when the light drops in.
    const wq = span(t, T_CURRENT, T_RISE) * (1 - span(t, REVEAL + 0.3, REVEAL + 1.2))
    if (wq > 0) {
      const drop = pulse(t, T_SPLASH - 0.05, T_SPLASH + 0.6)
      softEllipse(
        b,
        C.x,
        C.y,
        Math.round(26 + 34 * wq),
        Math.round(7 + 9 * wq),
        '#3ac8d8',
        0.35 * wq + 0.4 * drop,
      )
      softEllipse(
        b,
        C.x,
        C.y,
        Math.round(10 + 14 * wq),
        Math.round(3 + 4 * wq),
        '#a8f0ff',
        0.4 * wq + 0.5 * drop,
      )
    }
    // The current's foam, arcs turning round the spot, closing in.
    const fq = span(t, T_CURRENT + 0.2, T_CURRENT + 0.7) * (1 - span(t, T_RISE + 0.2, T_SPLASH))
    if (fq > 0)
      for (let i = 0; i < 5; i++) {
        const rr = Math.round((16 + i * 13) * lerp(1, 0.7, span(t, T_CURRENT, T_RISE)))
        const a0 = -t * (2.4 - i * 0.25) + i * 1.3
        if (fq * 5 > i)
          ellipseLine(
            b,
            C.x,
            C.y,
            rr,
            Math.max(2, Math.round(rr * 0.3)),
            i % 2 ? '#7ad8e8' : '#e0fcff',
            a0,
            a0 + 2,
          )
      }
    // The rings running out from where the light went in.
    for (const [d, c] of [
      [0, '#ffffff'],
      [0.22, '#a8f0ff'],
      [0.45, '#5ac8e8'],
      [0.8, '#a8f0ff'],
    ] as const) {
      const q = span(t, T_SPLASH + d, T_SPLASH + d + 1.1)
      if (q > 0 && q < 1) {
        const rx = Math.round(6 + ease.outC(q) * 110)
        ellipseLine(b, C.x, C.y, rx, Math.max(1, Math.round(rx * 0.3)), q < 0.6 ? c : '#5ac8e8')
      }
    }
    // The floats: on the sea, in the whirl, then lifting off it.
    for (const f of s.floats) if (t >= f.on && t < T_ONE) drawFloat(b, floatAt(f, t, C), t, f)
    // One light, all of them together, hanging over the water; then it drops in.
    if (t > T_ONE - 0.12 && t < T_SPLASH) {
      const y = t < T_DROP ? C.y - LIFT : lerp(C.y - LIFT, C.y, ease.inQ(span(t, T_DROP, T_SPLASH)))
      const q = span(t, T_ONE - 0.12, T_ONE + 0.08)
      const yy = Math.round(y)
      const gr = Math.round(8 + 12 * q + Math.sin(t * 30) * 1.5)
      b.drawImage(glow(gr, '#5ac8e8', 1.2, 0.7), C.x - gr, yy - gr)
      b.drawImage(
        glow(Math.round(gr * 0.6), '#e0fcff', 1.3, 0.9),
        C.x - Math.round(gr * 0.6),
        yy - Math.round(gr * 0.6),
      )
      // A star's four long points, turning their length over.
      const arm = Math.round((8 + 8 * q) * (0.8 + 0.2 * Math.sin(t * 24)))
      rect(b, C.x - arm, yy, arm * 2 + 1, 1, '#ffffff')
      rect(b, C.x, yy - arm, 1, arm * 2 + 1, '#ffffff')
      rect(b, C.x - 1, yy - 1, 3, 3, '#ffffff')
      if (t > T_DROP) rect(b, C.x - 1, yy - 16, 3, 14, '#a8f0ff')
    }
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Bobbing up out of the rings: what is under the water doesn't show.
    if (t < T_UP) return
    const C = s.L.foe
    const sz = spriteSize(s.foe)
    const q = ease.outBack(span(t, T_UP, REVEAL - 0.05), 1.6)
    g.save()
    g.beginPath()
    g.rect(0, 0, W, C.y + 1)
    g.clip()
    drawSprite(g, s.foe, C.x, Math.round(C.y + (1 - q) * sz.h), {
      tint: { color: '#5ac8e8', a: 0.55 },
      outline: Math.floor(t * 12) % 2 ? '#e0fcff' : '#a8f0ff',
    })
    g.restore()
    rect(g, C.x - Math.round(sz.w * 0.45), C.y, Math.round(sz.w * 0.9), 1, '#e0fcff')
  },
  front(g, _s, t, k) {
    // A swell rolling by in front, its crest foaming.
    if (k < 0.5) return
    for (let x = 0; x < W; x++) {
      const y = Math.round(149 + Math.sin(x / 23 + t * 1.3) * 4 + Math.sin(x / 9 - t * 2) * 1)
      rect(g, x, y, 1, H - y, '#0a2e42')
      rect(g, x, y + 1, 1, 2, '#145068')
      // Foam where the crest is highest, a lit line elsewhere.
      rect(g, x, y, 1, 1, Math.sin(x / 23 + t * 1.3) < -0.4 ? '#e0fcff' : '#3a8aa8')
      if (Math.sin(x / 23 + t * 1.3) < -0.75 && (x + Math.floor(t * 10)) % 3)
        rect(g, x, y - 1, 1, 1, '#a8f0ff')
    }
  },
  sounds: [
    [0.05, () => hiss(3.4, { freq: 380, type: 'lowpass', vol: 0.05 })],
    // Each float's light: a soft bell, rising through a warm scale.
    ...[0, 1, 2, 3, 4, 5, 6].map(
      (i) =>
        [
          0.4 + i * 0.16,
          () => tone([784, 880, 988, 1175, 1319, 1175, 1568][i]!, 0.5, { type: 'sine', vol: 0.025 }),
        ] as const,
    ),
    [T_CURRENT, () => hiss(1.3, { freq: 500, slide: 500, vol: 0.05 })],
    [
      T_RISE,
      () =>
        [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.025, at: i * 0.1 })),
    ],
    [T_ONE, () => tone(1568, 0.35, { type: 'sine', vol: 0.04 })],
    [
      T_SPLASH,
      () => (tone(420, 0.18, { type: 'sine', vol: 0.07, slide: -260 }), hiss(0.5, { freq: 1600, vol: 0.06 })),
    ],
    [T_UP, () => tone(330, 0.5, { type: 'triangle', vol: 0.04, slide: 330 })],
    [
      REVEAL,
      () => (
        hiss(0.3, { freq: 2400, vol: 0.05 }),
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone(f, 0.2, { type: 'triangle', vol: 0.03, at: i * 0.05 }),
        )
      ),
    ],
  ],
})

/** Where a float is at t, and how near (0 far .. 1 near): bobbing, then in the whirl, then rising off the sea. */
function floatAt(f: Float, t: number, C: { x: number; y: number }) {
  const y0 = SEA + 3 + f.d * (H - SEA - 14)
  const bob = Math.sin(t * 2.4 + f.ph) * (0.6 + f.d * 1.4)
  if (t < T_CURRENT) return { x: f.x + f.vx * t, y: y0 + bob, near: f.d, lift: 0 }
  // On the sea's plane round the spot: a circle seen flat (y squashed), its radius closing, its turn quickening.
  const du = f.x + f.vx * T_CURRENT - C.x
  const dv = (y0 - C.y) / 0.3
  const q = span(t, T_CURRENT, T_RISE)
  const r0 = Math.hypot(du, dv)
  let rr = lerp(r0, f.ring, ease.ioS(q))
  let a = Math.atan2(dv, du) - (q * q * 7 + q)
  // Rising one after another, so they climb as a helix of lights, not a clump.
  const q2 = span(span(t, T_RISE, T_ONE), f.k * 0.45, f.k * 0.45 + 0.55)
  rr *= 1 - ease.inC(q2)
  a -= q2 * q2 * 10
  const lift = ease.ioS(q2) * LIFT
  const y = C.y + Math.sin(a) * rr * 0.3
  return { x: C.x + Math.cos(a) * rr, y: y + bob * (1 - q2) - lift, near: (y - SEA) / (H - SEA), lift }
}

/** A Phione far off: a little blue body, its float's antenna, the light at its tip; its reflection under it. */
function drawFloat(g: G, at: { x: number; y: number; near: number; lift: number }, t: number, f: Float) {
  const x = Math.round(at.x)
  const y = Math.round(at.y)
  const s = at.near > 0.55 ? 2 : at.near > 0.2 ? 1 : 0
  // Coming on: a flicker of its light first.
  const on = span(t, f.on, f.on + 0.25)
  if (at.lift < 3) rect(g, x - s, y + 2, 1 + s * 2, 1, '#8ad0f0')
  if (on > 0.5) {
    if (s === 0) rect(g, x, y, 2, 1, '#2a5a9a')
    else {
      ellipse(g, x, y, s + 1, s, '#2a5a9a')
      rect(g, x - s, y - s, s * 2, 1, '#8ad0f0')
      rect(g, x, y - s - 2 * s, 1, 2 * s, '#4a8ac0')
    }
  }
  const tip = y - s - 2 * s - 1
  const gr = s + 3
  // Rising: a tail of light under it, the spiral's thread.
  if (at.lift > 2) {
    const len = Math.min(10, Math.round(at.lift * 0.35))
    rect(g, x, tip + 1, 1, len, '#5ac8e8')
    rect(g, x, tip + 1, 1, Math.ceil(len / 2), '#a8f0ff')
  }
  if (on > 0 && Math.floor(t * 20 + f.ph) % (on < 1 ? 2 : 9) !== 0)
    g.drawImage(glow(gr, '#a8f0ff', 1.4, 0.7), x - gr, tip - gr)
  rect(g, x, tip, s ? 2 : 1, s ? 2 : 1, '#ffffff')
}

/** A steady pseudo-random 0..1 from three numbers: the glitter's dashes, the same on every replay. */
const hash = (a: number, b: number, c: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453
  return v - Math.floor(v)
}

/** The swell: wave lines in perspective, the sun's broken road of light running down from it. */
function drawSea(g: G, t: number) {
  // The road: short horizontal glints, re-dealt a few times a second, wider and sparser as it nears.
  const frame = Math.floor(t * 6)
  for (let y = SEA + 1; y < H; y += 2) {
    const d = y - SEA
    const hw = 3 + d * 0.3
    const n = 2 + Math.round(hw / 6)
    for (let j = 0; j < n; j++) {
      const h1 = hash(y, j, frame)
      const x = Math.round(SUN.x + (h1 - 0.5) * 2 * hw)
      const len = 1 + Math.round(hash(j, y, frame + 1) * (2 + d * 0.08))
      rect(g, x, y, len, 1, d < 12 || h1 % 0.3 < 0.1 ? '#fff6c8' : d < 40 ? '#ffd890' : '#f0a060')
    }
  }
  for (let i = 0; i < 15; i++) {
    const v = i / 14
    const y0 = SEA + 2 + Math.round(v ** 1.6 * (H - SEA - 4))
    const len = 3 + Math.round(v * 12)
    const gap = len * 3
    for (let x = ((i * 17 + Math.round(t * (4 + v * 10))) % gap) - gap; x < W; x += gap) {
      const y = y0 + Math.round(Math.sin(x / 14 + t * 1.6 + i) * v * 1.5)
      rect(g, x, y, len, 1, v < 0.2 ? '#e8a0a0' : v < 0.55 ? '#4a9ab0' : '#2a7a96')
    }
  }
}
