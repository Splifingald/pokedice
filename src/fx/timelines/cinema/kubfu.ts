// Kubfu's raid entrance (docs/53): the Isle of Armor at dawn, the Master Dojo's training yard over the sea, the Tower
// of Two Fists on the cliffs beyond (the Tower of Darkness, the Tower of Waters with its falls). A small shadow darts
// between the training posts, striking each, faster and faster: thwack, thwack, dust and stars. Then stillness: one
// leaf falls towards a stack of roof tiles, the shadow stands before them, its fighting spirit rising, and both towers
// light at their tops, one violet, one blue, as if watching. The leaf touches the tiles: it leaps, and one punch
// breaks the whole stack from top to bottom, the halves falling apart, the leaf cut in two. The sun clears the sea as
// the dust settles, and there it stands.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  rect,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { quad } from '../../timeline'
import { burstRing, dGradient, tri } from './kit'
import { raidCinema, speedLines, type Raid } from './gen8kit'

const REVEAL = 4.4
/** The strikes on the posts: when, and which post (its index in the yard). */
const STRIKES: readonly [number, number][] = [
  [0.95, 0],
  [1.35, 3],
  [1.65, 1],
  [1.88, 2],
  [2.06, 0],
  [2.2, 3],
]
const T_STILL = 2.35
const T_LEAP = 2.9
const T_PUNCH = 3.08
const T_SUN = 3.7

const AURA = ['#ffffff', '#fff0c8', '#e0a040', '#6a3a1a'] as const
const TILE = ['#c86a4a', '#9a4a32', '#5a2a1e'] as const

type X = {
  back: Canvas
  yard: Canvas
  fore: Canvas
  posts: [number, number, number][]
  /** The stack's foot and top, its half-width, its tiles. */
  stack: { x: number; base: number; top: number; hw: number; n: number }
  horizon: number
  ground: number
}

/** Dawn over the sea, the cliffs, the two towers; drawn once. */
function scenery(s: Raid, horizon: number): Canvas {
  const { w, h } = s
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, horizon, ['#141a3a', '#2a2a5a', '#6a4a72', '#c87a6a', '#ffb07a']), 0, 0)
  // The sea, its sun road (lit live).
  g.drawImage(dGradient(w, h - horizon, ['#4a5a8a', '#2a3a6a', '#1a2448']), 0, horizon)
  for (let y = horizon + 2; y < h; y += 3)
    for (let x = (y * 7) % 11; x < w; x += 11) rect(g, x, y, 4, 1, '#5a6a9a')
  // Cliffs either side, sloping down to the sea, grass on their tops; a tower on each: pagodas of stacked roofs.
  for (const side of [-1, 1]) {
    const tx = towerX(s, side)
    const peak = horizon - Math.round(s.h * 0.1)
    for (let x = 0; x < w; x++) {
      const d = side < 0 ? x / (w * 0.42) : (w - x) / (w * 0.42)
      if (d >= 1) continue
      const top = Math.round(
        lerp(peak, horizon + 1, d ** 1.6) + Math.sin(x * 0.9) * 1.5 + ((x * 7) % 5 === 0 ? -2 : 0),
      )
      rect(g, x, top, 1, horizon - top + 2, (x >> 2) % 2 ? '#1c1a30' : '#201c36')
      rect(g, x, top, 1, 2, '#2e4a3a')
      if ((x * 13) % 7 === 0) rect(g, x, top + 4, 1, horizon - top - 4, '#16142a')
    }
    const top = peak + 1
    const dark = side < 0
    const body = dark ? '#2a1e34' : '#4a5a7a'
    const roof = dark ? '#3a1a3a' : '#2a6a9a'
    const lit = dark ? '#6a3a6a' : '#6ab0d8'
    const tiers = 5
    const th = tierH(s)
    for (let i = 0; i < tiers; i++) {
      const y = top - (i + 1) * th
      const bw = Math.round(Math.max(5, s.m * 0.05) * (1 - i * 0.14))
      rect(g, tx - bw, y + 2, bw * 2, th - 2, body)
      rect(g, tx - bw + 1, y + 3, 1, 2, dark ? '#c8a050' : '#e0f0ff')
      tri(g, tx - bw - 4, y + 3, tx + bw + 4, y + 3, tx, y - 2, roof)
      rect(g, tx - bw - 4, y + 2, bw * 2 + 8, 1, lit)
    }
    rect(g, tx, top - tiers * th - 7, 1, 5, roof)
    if (!dark)
      // The Tower of Waters' falls, pouring down the cliff.
      for (let k = 0; k < 3; k++)
        rect(g, tx - 10 + k * 2, top + 2, 1, horizon - top, k === 1 ? '#c8e8ff' : '#7ab0e0')
  }
  return cv
}

/** The yard: stone flags in perspective, a rail at its edge over the sea, the posts' feet. */
function yard(s: Raid, horizon: number, ground: number): Canvas {
  const { w, h, cx } = s
  const cv = canvas(w, h)
  const g = cv.g
  const edge = horizon + Math.round((ground - horizon) * 0.35)
  // The rail at the yard's edge.
  rect(g, 0, edge - 8, w, 2, '#3a2418')
  rect(g, 0, edge - 8, w, 1, '#7a4a2a')
  for (let x = (cx % 16) - 16; x < w; x += 16) rect(g, x, edge - 8, 2, 9, '#3a2418')
  g.drawImage(dGradient(w, h - edge, ['#8a7a6a', '#6a5a4a', '#4a3a32', '#2a2020']), 0, edge)
  rect(g, 0, edge, w, 1, '#b8a890')
  for (let k = 1; k < 8; k++) {
    const y = Math.round(edge + (h - edge) * (k / 8) ** 1.5)
    rect(g, 0, y, w, 1, '#3a2e28')
  }
  for (let k = -10; k <= 10; k++) line(g, cx + k * 10, edge, cx + k * 34, h, '#3a2e28')
  return cv
}

/** Stone lanterns at the bottom corners, dark against the yard, a warm light in each; leaves on the flags. */
function fore(s: Raid): Canvas {
  const { w, h } = s
  const cv = canvas(w, h)
  const g = cv.g
  const lh = Math.round(Math.max(40, h * 0.2))
  for (const side of [-1, 1]) {
    const x = side < 0 ? Math.round(w * 0.06) : Math.round(w * 0.94)
    const base = h + 4
    const lw = Math.round(lh * 0.22)
    rect(g, x - lw, base - Math.round(lh * 0.12), lw * 2, Math.round(lh * 0.12), '#2a2622')
    rect(g, x - (lw >> 1), base - Math.round(lh * 0.55), lw, Math.round(lh * 0.45), '#24201c')
    rect(g, x - lw + 2, base - Math.round(lh * 0.75), lw * 2 - 4, Math.round(lh * 0.2), '#2a2622')
    rect(g, x - (lw >> 1) + 1, base - Math.round(lh * 0.71), lw - 2, Math.round(lh * 0.12), '#ffb05a')
    rect(g, x - (lw >> 1) + 1, base - Math.round(lh * 0.71), lw - 2, 1, '#fff0c8')
    tri(
      g,
      x - lw - 4,
      base - Math.round(lh * 0.75),
      x + lw + 4,
      base - Math.round(lh * 0.75),
      x,
      base - lh,
      '#1c1a18',
    )
    rect(g, x - 1, base - lh - 3, 3, 4, '#1c1a18')
    g.drawImage(glow(lw * 2, '#e08a3a', 1.4, 0.35), x - lw * 2, base - Math.round(lh * 0.65) - lw * 2)
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.round((((i * 53) % 97) / 97) * w)
    const y = Math.round(h * 0.72 + (((i * 31) % 23) / 23) * h * 0.24)
    rect(g, x, y, 3, 1, i % 2 ? '#c86a2a' : '#7a9a3a')
    rect(g, x + 1, y - 1, 1, 1, i % 2 ? '#e8a050' : '#a8c85a')
  }
  return cv
}

export const kubfuCinema = raidCinema<X>({
  id: 'cinema-kubfu',
  reveal: REVEAL,
  seed: 891,
  aura: AURA,
  flash: '#fff6e0',
  feet: 0.64,
  rays: 0.5,
  bob: 0,
  shakes: [...STRIKES.map(([at]) => [at, 0.12, 1] as const), [T_PUNCH, 0.55, 4], [REVEAL, 0.4, 2]],
  flashes: [[T_PUNCH, 0.18, '#fff6e0', 0.55]],
  setup(s) {
    const horizon = Math.round(s.h * 0.42)
    const ground = s.feet
    // Two posts each side, the far one higher and smaller, out of the stack's way.
    const near = Math.max(s.w * 0.42, s.sz.w * 0.5 + 40)
    const far = Math.max(s.w * 0.3, s.sz.w * 0.5 + 22)
    const posts: [number, number, number][] = [
      [Math.round(s.cx - near), ground + Math.round(s.h * 0.03), 1],
      [Math.round(s.cx - far), ground - Math.round(s.h * 0.06), 0.75],
      [Math.round(s.cx + far), ground - Math.round(s.h * 0.06), 0.75],
      [Math.round(s.cx + near), ground + Math.round(s.h * 0.03), 1],
    ]
    // As tall as it is: tiles 4 thick with a gap, on two blocks.
    const n = Math.max(6, Math.min(9, Math.round((s.sz.h - 10) / 6)))
    const blocks = 10
    const top = ground - blocks - n * 6
    return {
      back: scenery(s, horizon),
      yard: yard(s, horizon, ground),
      fore: fore(s),
      posts,
      stack: { x: s.cx, base: ground, top, hw: Math.round(Math.max(16, s.sz.w * 0.42)), n },
      horizon,
      ground,
    }
  },
  step(s, t, dt) {
    const r = s.r
    for (const [at, i] of STRIKES)
      if (t >= at && t - dt < at) {
        const [x, y, k] = s.posts[i]!
        const hy = y - Math.round(postH(s) * k * 0.6)
        for (let n = 0; n < 12 * s.many; n++) {
          const a = r() * Math.PI * 2
          const v = r.range(30, 90)
          s.fx.add({
            x: x + (i < 2 ? 4 : -4),
            y: hy,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 4,
            life: r.range(0.25, 0.45),
            size: r.int(1, 2),
            shape: n < 4 ? 'star' : 'px',
            colors: ['#ffffff', '#fff3a0', '#e0a040'],
          })
        }
        for (let n = 0; n < 4 * s.many; n++)
          s.fx.add({
            x: x + r.range(-4, 4),
            y: y,
            vx: r.range(-20, 20),
            vy: -r.range(4, 12),
            drag: 3,
            life: 0.6,
            size: 2,
            shape: 'smoke',
            colors: ['#b8a890', '#8a7a6a'],
          })
      }
    // The punch: tile chips everywhere, a ring of dust along the ground.
    if (t >= T_PUNCH && t - dt < T_PUNCH) {
      const st = s.stack
      for (let n = 0; n < 60 * s.many; n++) {
        const side = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: st.x + side * r.range(0, st.hw * 0.4),
          y: r.range(st.top, st.base - 8),
          vx: side * r.range(30, 140),
          vy: -r.range(30, 140),
          ay: 320,
          life: r.range(0.6, 1.1),
          size: r.int(1, 3),
          shape: 'sq',
          colors: [TILE[0], TILE[1], TILE[2]],
        })
      }
      for (let n = 0; n < 30 * s.many; n++) {
        const side = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: st.x + side * r.range(0, st.hw),
          y: st.base,
          vx: side * r.range(30, 110),
          vy: -r.range(5, 30),
          drag: 2.5,
          life: r.range(0.8, 1.3),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#c8b8a0', '#9a8a7a'],
        })
      }
    }
    // Its fighting spirit: motes rising round it while it stands still.
    if (t > T_STILL + 0.15 && t < T_LEAP && r() < 0.6 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.5, s.sz.w * 0.5),
        y: s.ground - r.range(0, s.sz.h * 0.4),
        vy: -r.range(20, 40),
        life: 0.6,
        size: 1,
        shape: r() < 0.3 ? 'star' : 'px',
        colors: ['#ffffff', '#fff0c8', '#e0a040'],
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // The sun clearing the sea, its road on the water.
    const up = ease.outC(span(t, 0, T_SUN + 0.6))
    const sr = Math.round(Math.max(9, s.m * 0.08))
    const sy = Math.round(lerp(s.horizon + sr * 0.6, s.horizon - sr * 1.4, up))
    const gr = Math.round(sr * (3 + span(t, T_SUN, REVEAL)))
    g.drawImage(glow(gr, '#ffd08a', 1.3, 0.55 + 0.3 * span(t, T_SUN, REVEAL)), s.cx - gr, sy - gr)
    g.save()
    g.beginPath()
    g.rect(0, 0, s.w, s.horizon)
    g.clip()
    ellipse(g, s.cx, sy, sr, sr, '#fff0c8')
    ellipse(g, s.cx - 1, sy - 1, sr - 3, sr - 3, '#ffffff')
    g.restore()
    for (let y = s.horizon + 2; y < s.horizon + Math.round(s.h * 0.12); y += 2) {
      const wd = Math.round(sr * (0.6 + (y - s.horizon) * 0.03) + Math.sin(y + t * 4) * 2)
      rect(g, s.cx - wd, y, wd * 2, 1, (y >> 1) % 2 ? '#ffd08a' : '#e89a6a')
    }
    // The towers watching: a violet light and a blue one at their tops.
    const watch = span(t, T_STILL + 0.2, T_STILL + 0.6)
    if (watch > 0)
      for (const side of [-1, 1]) {
        const x = towerX(s, side)
        const y = s.horizon - Math.round(s.h * 0.1) + 1 - 5 * tierH(s) - 4
        const c = side < 0 ? '#c86aff' : '#6ad0ff'
        const gr2 = Math.round(10 + 4 * Math.sin(t * 6))
        g.drawImage(glow(gr2, c, 1.3, 0.8 * watch), x - gr2, y - gr2)
        rect(g, x - 1, y - 1, 3, 3, '#ffffff')
      }
    g.drawImage(s.yard, 0, 0)
    // The posts, each bending back from its strikes.
    for (const [i, [x, y, k]] of s.posts.entries()) {
      const hit = STRIKES.filter(([at, p]) => p === i && t >= at)
        .map(([at]) => t - at)
        .reduce((m, e) => Math.min(m, e), 9)
      const bend = hit < 0.4 ? Math.round(Math.sin(hit * 30) * 3 * (1 - hit / 0.4)) * (i < 2 ? -1 : 1) : 0
      drawPost(g, x, y, Math.round(postH(s) * k), Math.max(4, Math.round(6 * k)), bend)
    }
    drawStack(g, s, t)
  },
  before(g, s, t) {
    // Darting between the posts: a streak from each strike to the next, its shadow at each post.
    for (let i = 0; i < STRIKES.length; i++) {
      const [at, p] = STRIKES[i]!
      const [x, y, k] = s.posts[p]!
      const side = p < 2 ? 1 : -1
      const kx = x + side * Math.round(4 + s.sz.w * 0.3 * k * 0.6)
      if (t >= at - 0.04 && t < at + 0.14)
        drawSprite(g, s.mon, kx, y, {
          sx: k * 0.6,
          sy: k * 0.6,
          sil: '#1a120e',
          outline: AURA[2],
          flip: side < 0,
        })
      const next = STRIKES[i + 1]
      if (next && t > at + 0.14 && t < next[0] - 0.04) {
        const [nx, ny, nk] = s.posts[next[1]]!
        const nside = next[1] < 2 ? 1 : -1
        const q = span(t, at + 0.14, next[0] - 0.04)
        const ex = nx + nside * Math.round(4 + s.sz.w * 0.3 * nk * 0.6)
        const px = lerp(kx, ex, q)
        const py = lerp(y, ny, q) - Math.sin(q * Math.PI) * 10
        const bx = lerp(kx, ex, Math.max(0, q - 0.25))
        const by = lerp(y, ny, Math.max(0, q - 0.25)) - Math.sin(Math.max(0, q - 0.25) * Math.PI) * 10
        line(g, bx, by - 6, px, py - 6, '#fff0c8', 2)
        line(g, bx, by - 3, px, py - 3, '#e0a040')
      }
    }
    // Standing still before the tiles, its spirit flaring.
    if (t > STRIKES[STRIKES.length - 1]![0] + 0.14 && t < T_LEAP) {
      const q = span(t, T_STILL, T_LEAP)
      const x = s.cx - s.stack.hw - Math.round(s.sz.w * 0.35)
      if (q > 0) {
        const gr = Math.round(s.sz.h * (0.6 + 0.2 * Math.sin(t * 20)))
        g.drawImage(glow(gr, '#e0a040', 1.4, 0.4 + 0.3 * q), x - gr, s.ground - Math.round(s.sz.h / 2) - gr)
      }
      drawSprite(g, s.mon, x, s.ground, {
        sx: 0.85,
        sy: 0.85,
        sil: '#1a120e',
        outline: q > 0 && Math.floor(t * 16) % 2 ? '#ffffff' : AURA[2],
        flip: true,
      })
    }
    // The leap over the tiles and the punch straight down through them.
    if (t >= T_LEAP && t < T_PUNCH + 0.05) {
      const x0 = s.cx - s.stack.hw - Math.round(s.sz.w * 0.35)
      const q = span(t, T_LEAP, T_PUNCH)
      const p = quad(
        { x: x0, y: s.ground },
        { x: s.cx - 4, y: s.stack.top - s.sz.h * 1.3 },
        { x: s.cx, y: s.stack.top },
        ease.inQ(q),
      )
      drawSprite(g, s.mon, p.x, p.y, { sx: 0.85, sy: 0.85, sil: '#1a120e', outline: '#ffffff', flip: true })
      if (q > 0.7) line(g, s.cx, p.y - s.sz.h, s.cx, p.y, '#ffffff', 2)
    }
    // In the dust after the punch.
    if (t >= T_PUNCH + 0.05)
      drawSprite(g, s.mon, s.cx, s.ground, {
        sil: '#1a120e',
        outline: Math.floor(t * 10) % 2 ? AURA[1] : AURA[2],
      })
  },
  front(g, s, t) {
    // The punch: speed lines closing on the stack, its ring along the ground.
    const k = 1 - span(t, T_PUNCH, T_PUNCH + 0.3)
    if (t >= T_PUNCH && k > 0)
      speedLines(g, s.w, s.h, s.cx, s.stack.top + 10, k, pattern(g, '#fff6e0', 10), 891)
    burstRing(g, s.cx, s.ground, span(t, T_PUNCH, T_PUNCH + 0.5), s.w * 0.7, 2, '#fff0c8')
    drawLeaf(g, s, t)
    g.drawImage(s.fore, 0, 0)
  },
  sounds: [
    [0.05, () => hiss(2, { freq: 600, type: 'lowpass', vol: 0.04 })],
    [0.3, () => tone(523, 0.3, { type: 'triangle', vol: 0.02 })],
    ...STRIKES.map(
      ([at], i) =>
        [
          at,
          () => (
            hiss(0.08, { freq: 900 - i * 40, vol: 0.1 }),
            tone(180 - i * 8, 0.08, { type: 'square', vol: 0.05, slide: -60 })
          ),
        ] as const,
    ),
    [T_STILL, () => tone(784, 1.2, { type: 'sine', vol: 0.025 })],
    [T_STILL + 0.3, () => tone(1175, 0.9, { type: 'sine', vol: 0.015 })],
    [T_STILL + 0.5, () => fxSound('psychic.focus')],
    [T_LEAP, () => hiss(0.2, { freq: 800, slide: 1600, vol: 0.06 })],
    [
      T_PUNCH,
      () => (
        fxSound('impact.hit'),
        hiss(0.6, { freq: 400, type: 'lowpass', vol: 0.16 }),
        Array.from({ length: 6 }, (_, i) =>
          tone(1400 - i * 120, 0.04, { type: 'square', vol: 0.03, at: i * 0.035 }),
        )
      ),
    ],
    [T_SUN, () => tone(659, 0.8, { type: 'triangle', vol: 0.03 })],
  ],
})

const postH = (s: Raid) => Math.round(Math.max(34, s.h * 0.15, s.sz.h * 0.85))
const towerX = (s: Raid, side: number) => Math.round(s.cx + side * s.w * 0.36)
const tierH = (s: Raid) => Math.round(Math.max(6, s.h * 0.026))

/** A training post: a round wooden pole, rope bound round its middle, bent back by a blow. */
function drawPost(g: G, x: number, base: number, ht: number, wd: number, bend: number) {
  for (let y = 0; y < ht; y++) {
    const off = Math.round(bend * (y / ht) ** 2)
    const yy = base - y
    rect(g, x - (wd >> 1) + off, yy, wd, 1, '#7a4a2a')
    rect(g, x - (wd >> 1) + off, yy, 1, 1, '#b07a4a')
    rect(g, x + (wd >> 1) - 1 + off, yy, 1, 1, '#4a2a18')
    if (y > ht * 0.45 && y < ht * 0.75 && y % 2) rect(g, x - (wd >> 1) + off, yy, wd, 1, '#d8c090')
  }
  ellipse(g, x, base, wd, 2, '#3a2a20')
}

/** The stack of roof tiles on its two blocks: whole, then breaking top to bottom, its halves thrown apart. */
function drawStack(g: G, s: Raid & X, t: number) {
  const st = s.stack
  const bh = 10
  ellipse(g, st.x, st.base, st.hw + 6, 2, '#3a2a20')
  for (const side of [-1, 1]) {
    const bx = st.x + side * (st.hw - 6)
    rect(g, bx - 6, st.base - bh, 12, bh, '#6a6a6e')
    rect(g, bx - 6, st.base - bh, 12, 1, '#9a9aa0')
    rect(g, bx + 5, st.base - bh, 1, bh, '#3a3a3e')
    rect(g, bx - 4, st.base - bh + 4, 3, 2, '#4a4a4e')
  }
  for (let i = 0; i < st.n; i++) {
    const y0 = st.top + i * 6
    // Tile i breaks a moment after the one above it.
    const at = T_PUNCH + i * 0.03
    const fall = span(t, at, at + 0.55)
    if (fall <= 0) {
      tile(g, st.x - st.hw, y0, st.hw * 2, 0)
      continue
    }
    // Two halves, each thrown out and down to the yard, tipping as they go; they land in two scattered heaps.
    const r = ((i * 7919) % 13) / 13
    for (const side of [-1, 1]) {
      const land = st.base - 3 - ((st.n - 1 - i) % 3) * 3
      const drop = ease.inQ(fall) * (land - y0)
      const out = side * (3 + ease.outQ(fall) * (st.hw * 0.4 + i * 3 + r * 10))
      const x0 = side < 0 ? st.x - st.hw + out : st.x + 1 + out
      tile(g, x0, y0 + drop, st.hw - 1, Math.round(side * fall * (2 + (i % 3))))
    }
  }
}

/** One roof tile (or half of one), seen edge on: `tilt` in pixels across its width. */
function tile(g: G, x: number, y: number, wd: number, tilt: number) {
  for (let k = 0; k < wd; k++) {
    const ty = Math.round(y + (tilt * (k - wd / 2)) / Math.max(1, wd))
    rect(g, x + k, ty, 1, 1, '#e8a080')
    rect(g, x + k, ty + 1, 1, 2, k === 0 || k === wd - 1 ? TILE[1] : TILE[0])
    rect(g, x + k, ty + 3, 1, 1, TILE[2])
  }
}

/** The one leaf: falling slowly onto the tiles, then cut in two by the punch. */
function drawLeaf(g: G, s: Raid & X, t: number) {
  if (t < T_STILL || t > REVEAL + 1) return
  const q = span(t, T_STILL, T_PUNCH)
  const x0 = s.cx + 18
  const y = lerp(-6, s.stack.top - 3, ease.ioS(q))
  const x = x0 + Math.sin(q * 9) * 14 * (1 - q) - 18 * q
  if (t < T_PUNCH) {
    leaf(g, x, y, Math.floor(t * 5) % 2 === 0)
    return
  }
  // Its halves, fluttering apart and down.
  const f = span(t, T_PUNCH, REVEAL + 1)
  for (const side of [-1, 1])
    leaf(g, x + side * (3 + f * 26) + Math.sin(f * 12 + side) * 4, y + f * (s.ground - y), side < 0, true)
}

function leaf(g: G, x: number, y: number, flip: boolean, half = false) {
  const px = Math.round(x)
  const py = Math.round(y)
  const c = ['#7ac74c', '#4a8a2a', '#c8f58a']
  rect(g, px - 2, py, half ? 2 : 5, 2, c[0]!)
  rect(g, px - 1, py - 1, half ? 1 : 3, 1, c[2]!)
  rect(g, px - 1, py + 2, half ? 1 : 3, 1, c[1]!)
  if (!half) rect(g, flip ? px - 3 : px + 3, py + 1, 1, 1, '#3a5a1a')
}
