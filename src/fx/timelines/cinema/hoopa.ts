// Hoopa's entrance (docs/53), on the battle stage: Dahara City at dusk, a desert town of domes and towers under a
// gold and violet sky, palms, a string of pennants. A giggle. Golden rings start popping open in the air, here, there,
// faster and faster, and things fall out of them: a donut, a clay pot that smashes, a Poké Ball, a Magikarp flopping
// out sideways, a boulder that shakes the street. An apple drops into a ring on the ground and falls out of one in the
// sky, round and round. Then one big ring opens where it will stand, spins, and sucks everything back in; it snaps
// small, and Hoopa pops out of it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  icon,
  lerp,
  line,
  rect,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenShake, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const GROUND = 116
const T_LOOP = 1.7
const T_BIG = 2.95
const T_SUCK = 3.2
const T_SNAP = 3.75
const GOLD = ['#fff6c8', '#ffd23a', '#c8901e', '#7a4a10'] as const

/** The things that fall out: tiny pixel pictures (made on first use, then cached by `icon`). */
const ITEMS = {
  donut: [['.ddd.', 'dpdpd', 'dd.dd', 'dpdpd', '.ddd.'], { d: '#c87a3a', p: '#ff9ad0' }],
  pot: [['.bbb.', '..b..', '.bbb.', 'bbbbb', 'bcbcb', '.bbb.'], { b: '#c8683a', c: '#ffd88a' }],
  ball: [['.rrr.', 'rrwrr', 'kkwkk', 'wwwww', '.www.'], { r: '#e0303a', w: '#ffffff', k: '#1a1a1a' }],
  fish: [
    ['o...oo.', 'oo.oooo', '.ooookw', 'oo.oooo', 'o...oo.'],
    { o: '#ff7a2a', k: '#1a1a1a', w: '#ffffff' },
  ],
  rock: [
    ['..ggg..', '.ggggg.', 'gglgggg', 'ggggggs', '.gggss.'],
    { g: '#8a8078', l: '#c8bfb4', s: '#4a4440' },
  ],
  apple: [['..s..', '.rrr.', 'rrwrr', 'rrrrr', '.rrr.'], { r: '#e0303a', w: '#ffb0a0', s: '#3a7a2a' }],
  cup: [['wwwww.', 'wbbbww', 'wwwww.', '.www..'], { w: '#f0f0ff', b: '#8a4a2a' }],
} as const satisfies Record<string, readonly [readonly string[], Record<string, string>]>
const item = (key: keyof typeof ITEMS) => icon(ITEMS[key][0], ITEMS[key][1], 2)

/** A ring: when it opens and closes, where, how big, whether it lies flat (facing up or down) or stands. */
interface Ring {
  at: number
  end: number
  x: number
  y: number
  r: number
  flat: boolean
  /** What falls out of it, and how it is thrown. */
  out: (keyof typeof ITEMS)[]
  vx: number
}

const RINGS: Ring[] = [
  { at: 0.7, end: 1.4, x: 48, y: 30, r: 15, flat: true, out: ['donut'], vx: 10 },
  { at: 1.05, end: 1.8, x: 206, y: 26, r: 16, flat: true, out: ['pot'], vx: -15 },
  { at: 1.4, end: 2.1, x: 120, y: 44, r: 14, flat: true, out: ['ball'], vx: 20 },
  { at: 1.85, end: 2.6, x: 24, y: 76, r: 15, flat: false, out: ['fish'], vx: 90 },
  { at: 2.1, end: 2.8, x: 150, y: 16, r: 18, flat: true, out: ['rock'], vx: 0 },
  { at: 2.3, end: 2.85, x: 222, y: 70, r: 13, flat: false, out: ['donut', 'cup'], vx: -70 },
  { at: 2.45, end: 2.9, x: 96, y: 22, r: 12, flat: true, out: ['cup'], vx: 25 },
  { at: 2.58, end: 2.92, x: 196, y: 50, r: 11, flat: true, out: ['donut'], vx: -10 },
  { at: 2.68, end: 2.94, x: 70, y: 52, r: 11, flat: true, out: ['ball'], vx: 30 },
]
/** The loop: an apple falling into the ground's ring and out of the sky's, over and over. */
const LOOP = { x: 92, top: 24, bottom: 128, end: T_BIG }

interface Thing {
  key: keyof typeof ITEMS
  x: number
  y: number
  vx: number
  vy: number
  floor: number
  down: boolean
  broke: boolean
}

type X = { back: Canvas; things: Thing[]; shakes: [number, number, number][] }

/** Dahara at dusk: the sky, a tall tower, domes and flat roofs with lit windows, palms, pennants, the sandy street. */
function city(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#24164a', '#5a2a6a', '#b04a5a', '#f08a4a', '#ffc86a']), 0, 0)
  for (let i = 0; i < 30; i++) rect(g, r.range(0, W), r.range(0, 40), 1, 1, r() < 0.3 ? '#ffffff' : '#c8a8e8')
  // The tower, far behind, its lamp at the top.
  const tx = 132
  rect(g, tx - 7, 18, 14, GROUND - 18, '#6a3a4a')
  rect(g, tx - 7, 18, 3, GROUND - 18, '#8a4a5a')
  ellipse(g, tx, 18, 9, 7, '#7a4250')
  rect(g, tx - 1, 4, 2, 8, '#7a4250')
  ellipse(g, tx, 4, 2, 2, '#ffd23a')
  for (let y = 30; y < GROUND - 10; y += 12) rect(g, tx - 2, y, 4, 5, '#ffd88a')
  // The town: blocks with flat roofs and onion domes, lit on the sunset's side.
  const blocks: [number, number, number, boolean][] = [
    [0, 26, 52, true],
    [24, 22, 40, false],
    [44, 30, 62, true],
    [72, 24, 44, false],
    [94, 20, 36, false],
    [150, 26, 46, true],
    [174, 22, 58, false],
    [194, 28, 40, true],
    [220, 24, 54, false],
  ]
  for (const [x, wd, ht, dome] of blocks) {
    const top = GROUND - ht
    rect(g, x, top, wd, ht, '#a86a4a')
    rect(g, x + wd - 6, top, 6, ht, '#7a4a3a')
    rect(g, x, top, wd, 2, '#e0a070')
    if (dome) {
      const dx = x + (wd >> 1)
      ellipse(g, dx, top - 6, Math.round(wd * 0.36), 8, '#c8705a')
      ellipse(g, dx - 2, top - 8, Math.round(wd * 0.2), 4, '#f0a080')
      rect(g, dx, top - 18, 1, 5, '#e0a070')
      rect(g, x, top - 1, wd, 2, '#7a4a3a')
    }
    // Windows: arches, some lit.
    for (let wy = top + 8; wy < GROUND - 10; wy += 12)
      for (let wx = x + 4; wx < x + wd - 6; wx += 8) {
        const lit = (wx * 7 + wy * 3) % 5 < 2
        rect(g, wx, wy, 3, 5, lit ? '#ffd88a' : '#3a1e24')
        rect(g, wx + 1, wy - 1, 1, 1, lit ? '#ffd88a' : '#3a1e24')
      }
  }
  // Palms.
  for (const px of [36, 214]) {
    for (let y = GROUND; y > GROUND - 46; y--)
      rect(g, px + Math.round(Math.sin((GROUND - y) / 14) * 3), y, 3, 1, '#4a2a1a')
    const top = { x: px + 3, y: GROUND - 46 }
    for (const [dx, dy] of [
      [-16, 4],
      [-12, -6],
      [0, -10],
      [12, -6],
      [16, 5],
    ] as const) {
      tri(g, top.x, top.y, top.x + dx, top.y + dy, top.x + dx * 0.6, top.y + dy - 3, '#2a5a2a')
      tri(g, top.x, top.y, top.x + dx, top.y + dy, top.x + dx * 0.5, top.y + dy + 2, '#1a3a1a')
    }
  }
  // Pennants on a line across the street.
  for (let x = 0; x < W; x += 2)
    rect(g, x, Math.round(36 + Math.sin((x / W) * Math.PI) * 10), 1, 1, '#3a2030')
  for (let x = 6; x < W; x += 12) {
    const y = Math.round(36 + Math.sin((x / W) * Math.PI) * 10)
    tri(g, x - 3, y, x + 3, y, x, y + 6, ['#e0303a', '#ffd23a', '#3a9af0', '#7ac74c'][((x / 12) % 4) | 0]!)
  }
  // The street: sand, lit warm, footprints of shadow.
  g.drawImage(dGradient(W, H - GROUND, ['#e0b07a', '#c8905a', '#a8703a']), 0, GROUND)
  rect(g, 0, GROUND, W, 1, '#f0c890')
  for (let i = 0; i < 40; i++) rect(g, r.range(0, W), r.range(GROUND + 3, H), 2, 1, '#b07a4a')
  return cv
}

/** A golden ring: its back half, the portal inside (a violet dark, a swirl turning), and its front half. */
function hoop(g: G, x: number, y: number, rx: number, ry: number, t: number) {
  if (rx < 1) return
  const ix = Math.max(1, rx - 3)
  const iy = Math.max(1, ry - 3)
  ellipse(g, x, y, ix, iy, '#1a0830')
  if (ix > 4) {
    ellipse(g, x, y, Math.round(ix * 0.6), Math.max(1, Math.round(iy * 0.6)), '#2a0e4a')
    ellipseLine(g, x, y, Math.round(ix * 0.7), Math.max(1, Math.round(iy * 0.7)), '#8a4ad8', t * 6, t * 6 + 2)
    ellipseLine(
      g,
      x,
      y,
      Math.round(ix * 0.4),
      Math.max(1, Math.round(iy * 0.4)),
      '#c8a0ff',
      -t * 8,
      -t * 8 + 1.6,
    )
    rect(
      g,
      x + Math.round(Math.cos(t * 5) * ix * 0.5),
      y + Math.round(Math.sin(t * 5) * iy * 0.5),
      1,
      1,
      '#ffffff',
    )
  }
  // The hoop itself: a thick gold rim, darker on its lower half, a glint running round it.
  ellipseLine(g, x, y, rx + 1, ry + 1, GOLD[3], 0, Math.PI * 2)
  ellipseLine(g, x, y, rx, ry, GOLD[2], 0, Math.PI)
  ellipseLine(g, x, y, rx - 1, Math.max(1, ry - 1), GOLD[2], 0, Math.PI)
  ellipseLine(g, x, y, rx, ry, GOLD[1], Math.PI, Math.PI * 2)
  ellipseLine(g, x, y, rx - 1, Math.max(1, ry - 1), GOLD[0], Math.PI, Math.PI * 2)
  ellipseLine(g, x, y, rx - 2, Math.max(1, ry - 2), GOLD[3], 0, Math.PI * 2)
  const ga = t * 4
  rect(g, x + Math.round(Math.cos(ga) * rx) - 1, y + Math.round(Math.sin(ga) * ry), 3, 1, '#ffffff')
}

/** Hoopa Unbound's hand reaching out of the big ring: an arm, a palm, four fingers wiggling, a thumb. */
function bigHand(g: G, x: number, y: number, reach: number, t: number) {
  const hx = Math.round(x - 26 * reach)
  const hy = Math.round(y - 30 * reach)
  for (const [c, wd] of [
    ['#2a0e4a', 9],
    ['#8a4ad8', 7],
  ] as const) {
    line(g, x, y, hx, hy, c, wd)
    ellipse(g, hx, hy, wd, wd - 2, c)
    for (let f = 0; f < 4; f++) {
      const a = -2.3 + f * 0.42 + Math.sin(t * 18 + f) * 0.18
      const len = 9 + (f === 1 || f === 2 ? 3 : 0)
      line(g, hx, hy, hx + Math.cos(a) * len, hy + Math.sin(a) * len, c, wd - 4)
    }
    line(g, hx, hy, hx + 9, hy + 3, c, wd - 4)
  }
  // Its light side, and claws.
  ellipse(g, hx - 2, hy - 2, 3, 2, '#c8a0ff')
}

/** How open a ring is at t: popping open with a bounce, shrinking shut. */
const openness = (t: number, at: number, end: number) =>
  t < at || t > end ? 0 : ease.outBack(span(t, at, at + 0.22), 2.4) * (1 - ease.inQ(span(t, end - 0.2, end)))

export const hoopaCinema = bossCinema<X>({
  id: 'cinema-hoopa',
  reveal: REVEAL,
  seed: 720,
  aura: ['#ffffff', '#ffd0f0', '#e060b0', '#5a2a7a'],
  flash: '#fff0f8',
  setup(_st, r) {
    return { back: city(r), things: [], shakes: [[2.35, 0.35, 2]] }
  },
  step(s, t, dt) {
    const r = s.r
    const fz = spriteSize(s.foe)
    const big = { x: s.L.foe.x, y: s.L.foe.y - fz.h / 2 }
    // Each ring throws out its things a moment after it opens.
    for (const g of RINGS)
      if (within(t, g.at + 0.15, g.at + 0.15 + dt))
        g.out.forEach((key, i) => {
          s.things.push({
            key,
            x: g.x + i * 4,
            y: g.y + (g.flat ? 2 : 0),
            vx: g.vx + r.range(-8, 8),
            vy: g.flat ? 20 : -40,
            floor: GROUND + 6 + Math.round(r.range(0, 30)),
            down: false,
            broke: false,
          })
          for (let k = 0; k < 8; k++)
            s.fx.add({
              x: g.x,
              y: g.y,
              vx: r.range(-40, 40),
              vy: r.range(-40, 20),
              drag: 3,
              life: 0.4,
              size: 1,
              shape: 'star',
              colors: [GOLD[0], GOLD[1], '#c8a0ff'],
            })
        })
    for (const th of s.things) {
      // Sucked into the big ring at the end.
      if (t > T_SUCK) {
        const dx = big.x - th.x
        const dy = big.y - th.y
        const d = Math.hypot(dx, dy) || 1
        const k = 1600 * span(t, T_SUCK, T_SUCK + 0.2)
        th.vx += (dx / d) * k * dt - th.vx * 2 * dt
        th.vy += (dy / d) * k * dt - th.vy * 2 * dt
        th.down = false
        th.x += th.vx * dt
        th.y += th.vy * dt
        continue
      }
      if (th.down) continue
      th.vy += 300 * dt
      th.x += th.vx * dt
      th.y += th.vy * dt
      if (th.y >= th.floor) {
        th.y = th.floor
        if (th.key === 'pot' && !th.broke) {
          // The pot smashes.
          th.broke = true
          for (let k = 0; k < 16; k++)
            s.fx.add({
              x: th.x,
              y: th.y - 2,
              vx: r.range(-60, 60),
              vy: -r.range(20, 80),
              ay: 300,
              life: 0.7,
              size: r.int(1, 2),
              shape: 'sq',
              colors: ['#c8683a', '#8a4020'],
            })
        }
        if (th.key === 'rock' && Math.abs(th.vy) > 40)
          for (let k = 0; k < 14; k++)
            s.fx.add({
              x: th.x,
              y: th.y,
              vx: r.range(-50, 50),
              vy: -r.range(10, 40),
              ay: 200,
              life: 0.6,
              size: 1,
              shape: 'sq',
              colors: ['#e0b07a', '#c8905a'],
            })
        if (Math.abs(th.vy) > 50 && th.key !== 'rock') {
          th.vy *= -0.4
          th.vx *= 0.6
        } else {
          th.down = true
          th.vx = 0
          th.vy = 0
        }
      }
    }
    // Things gone into the ring are gone.
    if (t > T_SUCK) s.things = s.things.filter((th) => Math.hypot(big.x - th.x, big.y - th.y) > 10)
    if (t > T_BIG && t < T_SNAP && r() < 0.7)
      s.fx.add({
        x: big.x + r.range(-60, 60),
        y: big.y + r.range(-40, 40),
        home: { x: big.x, y: big.y, k: 300 },
        life: 0.8,
        size: 1,
        shape: 'px',
        colors: [GOLD[0], '#c8a0ff', '#8a4ad8'],
      })
    if (within(t, REVEAL, REVEAL + dt))
      for (let k = 0; k < 30; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: big.x,
          y: big.y,
          vx: Math.cos(a) * r.range(50, 130),
          vy: Math.sin(a) * r.range(50, 130),
          drag: 2.5,
          life: r.range(0.5, 0.9),
          size: 2,
          shape: k % 3 ? 'star' : 'heart',
          colors: [GOLD[0], GOLD[1], '#ff9ad0'],
        })
      }
  },
  back(g, s, t, k) {
    const sh = screenShake(t, s.shakes)
    g.save()
    g.translate(sh.x, sh.y)
    dissolve(g, s.back, k)
    if (k > 0.5) {
      // The rings in the air, and what came out of them.
      for (const rg of RINGS) {
        const o = openness(t, rg.at, rg.end)
        if (o > 0) hoop(g, rg.x, rg.y, Math.round(rg.r * o), Math.round(rg.r * o * (rg.flat ? 0.35 : 1)), t)
      }
      // The loop: a ring on the street, one in the sky, an apple falling between them, faster each time round.
      const lo = openness(t, T_LOOP, LOOP.end)
      if (lo > 0) {
        hoop(g, LOOP.x, LOOP.top, Math.round(14 * lo), Math.round(5 * lo), t)
        hoop(g, LOOP.x, LOOP.bottom, Math.round(16 * lo), Math.round(5 * lo), t)
        if (lo >= 0.9) {
          const e = t - T_LOOP - 0.2
          const fall = LOOP.bottom - LOOP.top
          // Falling under gravity, each lap from the top again: y = ½·g·τ², a lap every √(2·fall/g).
          const lap = Math.sqrt((2 * fall) / 420)
          const tau = e > 0 ? e % lap : -1
          if (tau >= 0) {
            const y = LOOP.top + 0.5 * 420 * tau * tau
            g.drawImage(item('apple'), LOOP.x - 5, Math.round(y) - 5)
          }
        }
      }
      for (const th of s.things) {
        if (th.broke) {
          rect(g, th.x - 4, th.y - 1, 3, 1, '#8a4020')
          rect(g, th.x + 1, th.y, 2, 1, '#c8683a')
          continue
        }
        const im = item(th.key)
        // A Magikarp on the ground flops.
        const flop = th.key === 'fish' && th.down && Math.floor(t * 8) % 2 ? -2 : 0
        g.drawImage(im, Math.round(th.x - im.width / 2), Math.round(th.y - im.height) + flop)
      }
    }
    g.restore()
  },
  before(g, s, t) {
    const fz = spriteSize(s.foe)
    const x = s.L.foe.x
    const y = Math.round(s.L.foe.y - fz.h / 2)
    // The big ring: popping open, spinning (its width swinging as it turns), snapping small; Hoopa out of it.
    const o = openness(t, T_BIG, REVEAL + 0.1)
    if (o > 0) {
      const snap = ease.inQ(span(t, T_SNAP, REVEAL))
      const R = Math.round(lerp(28, 6, snap) * o)
      const spin = t > T_SUCK ? Math.cos((t - T_SUCK) * 14) : 1
      g.drawImage(glow(R + 12, '#8a4ad8', 1.4, 0.5), x - R - 12, y - R - 12)
      hoop(g, x, y, Math.max(2, Math.round(R * Math.max(0.2, Math.abs(spin)))), R, t)
      // Out of it, for a moment, a huge violet hand (Hoopa Unbound's): it reaches out, waggles its fingers, and
      // snatches everything back with it.
      const reach = Math.sin(Math.PI * span(t, T_BIG + 0.1, T_SUCK + 0.15))
      if (reach > 0) bigHand(g, x, y, reach, t)
    }
    if (t > REVEAL - 0.12) {
      const q = ease.outBack(span(t, REVEAL - 0.12, REVEAL), 3)
      drawSprite(g, s.foe, x, s.L.foe.y, { sx: q, sy: q, sil: '#ffffff', outline: GOLD[1] })
    }
  },
  sounds: [
    [0.1, () => hiss(3.6, { freq: 700, type: 'lowpass', vol: 0.02 })],
    // A giggle: little notes skipping up and down.
    [
      0.35,
      () =>
        [784, 988, 880, 1175, 1047].forEach((f, i) =>
          tone(f, 0.07, { type: 'square', vol: 0.025, at: i * 0.07 }),
        ),
    ],
    ...RINGS.map(
      (rg, i) =>
        [rg.at, () => tone(330 + i * 40, 0.18, { type: 'triangle', vol: 0.04, slide: 500 })] as const,
    ),
    [
      1.25,
      () => (hiss(0.2, { freq: 900, vol: 0.1 }), tone(220, 0.1, { type: 'square', vol: 0.04, slide: -100 })),
    ],
    [T_LOOP, () => tone(523, 0.15, { type: 'triangle', vol: 0.04, slide: 300 })],
    [2.35, () => fxSound('impact.hit')],
    [
      2.0,
      () => [1047, 1319, 1568].forEach((f, i) => tone(f, 0.06, { type: 'square', vol: 0.02, at: i * 0.06 })),
    ],
    [T_BIG, () => tone(196, 0.5, { type: 'triangle', vol: 0.05, slide: 400 })],
    [T_SUCK, () => hiss(0.6, { freq: 300, slide: 2400, vol: 0.07 })],
    [
      T_SNAP,
      () => (
        tone(1568, 0.08, { type: 'square', vol: 0.03 }),
        tone(784, 0.2, { type: 'triangle', vol: 0.04, at: 0.06 })
      ),
    ],
    [REVEAL, () => (fxSound('ball.pop'), fxSound('legend.roar'))],
    [
      REVEAL + 0.3,
      () =>
        [1175, 1319, 1175, 1568].forEach((f, i) =>
          tone(f, 0.06, { type: 'square', vol: 0.025, at: i * 0.06 }),
        ),
    ],
  ],
})
