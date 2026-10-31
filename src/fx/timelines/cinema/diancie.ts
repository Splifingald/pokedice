// Diancie's entrance (docs/53), on the battle stage: deep in a diamond mine. Timber frames down a tunnel, rails into
// the dark, a cart of ore, lanterns, gems glinting in the rock. A chime: crystals start to grow, out of the floor and
// the walls, cluster after cluster, and the lamplight turns pink. Then the mine's black dust (coal, carbon) is drawn
// out of every corner into one point and squeezed until it glows red, then white; and it crystallises: a pink diamond,
// faceted, turning in the air and growing, glinting. It bursts into light and Diancie floats where it was.
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
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { spriteSize } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const FLOOR = 104
/** The tunnel's far mouth: the frames and the rails run towards it. */
const VP = { x: 78, y: 72 }
const T_GROW = 0.6
const T_DUST = 1.9
const T_HOT = 2.7
const T_GEM = 3.0
const PINK = ['#ffffff', '#ffd0e8', '#ff9ad0', '#e060a0', '#a03070', '#5a1a40'] as const

interface Cluster {
  x: number
  y: number
  /** Its prisms: angle (0 up), length, width. */
  prisms: [number, number, number][]
  at: number
}

type X = { back: Canvas; clusters: Cluster[]; gems: [number, number, string][]; dust: Particles }

/** The mine: rock, the tunnel's mouth, timber frames receding, rails and sleepers, a cart of ore. */
function mine(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, FLOOR, ['#0c0810', '#160e16', '#20141c', '#2a1a22']), 0, 0)
  // Rock: lumps lit from the lanterns' side.
  for (let i = 0; i < 70; i++) {
    const x = (i * 53) % W
    const y = (i * 29) % FLOOR
    const r = 4 + ((i * 7) % 7)
    ellipse(g, x, y, r, Math.round(r * 0.7), i % 3 ? '#1e141c' : '#281a22')
    rect(g, x - r + 2, y - 2, r, 1, '#3a2830')
  }
  // The tunnel's mouth, black, deep.
  ellipse(g, VP.x, VP.y, 22, 20, '#050307')
  rect(g, VP.x - 22, VP.y, 44, FLOOR - VP.y, '#050307')
  // The floor.
  g.drawImage(dGradient(W, H - FLOOR, ['#2a1c18', '#1e1410', '#120c0a']), 0, FLOOR)
  rect(g, 0, FLOOR, W, 1, '#3a2a22')
  // Rails into the tunnel, sleepers closer together as they go.
  for (let k = 0; k < 14; k++) {
    const q = (k / 14) ** 1.8
    const y = Math.round(lerp(H + 4, FLOOR - 2, q))
    const half = Math.round(lerp(34, 6, q))
    const x = Math.round(lerp(40, VP.x, q))
    rect(g, x - half - 3, y, half * 2 + 6, Math.max(1, Math.round(4 * (1 - q))), '#3a2414')
  }
  for (const side of [-1, 1]) {
    line(g, 40 + side * 28, H + 4, VP.x + side * 5, FLOOR - 2, '#8a8a92', 2)
    line(g, 40 + side * 28, H + 3, VP.x + side * 5, FLOOR - 3, '#c8c8d0')
  }
  // Timber frames, nearest last: posts, a beam, a brace in each corner.
  for (let k = 2; k >= 0; k--) {
    const s = 1 + k * 0.9
    const half = Math.round(30 * s)
    const top = Math.round(VP.y - 24 * s)
    const bot = Math.round(FLOOR + 8 * k)
    const wd = Math.round(3 + k * 2)
    for (const side of [-1, 1]) {
      const x = VP.x + side * half - (side < 0 ? wd : 0)
      rect(g, x, top, wd, bot - top, '#4a3020')
      rect(g, x, top, 1, bot - top, '#7a5232')
      rect(g, x + wd - 1, top, 1, bot - top, '#24160c')
      line(
        g,
        VP.x + side * half,
        top + wd + 8 * s,
        VP.x + side * (half - 10 * s),
        top + wd,
        '#3a2414',
        wd - 1,
      )
    }
    rect(g, VP.x - half - wd, top - wd, half * 2 + wd * 2, wd + 1, '#4a3020')
    rect(g, VP.x - half - wd, top - wd, half * 2 + wd * 2, 1, '#7a5232')
  }
  // A cart of ore on the rails.
  const cx = 30
  const cy = 140
  rect(g, cx - 14, cy - 12, 28, 12, '#3a3a44')
  rect(g, cx - 14, cy - 12, 28, 2, '#6a6a78')
  rect(g, cx - 12, cy - 16, 24, 4, '#2a2028')
  for (let i = 0; i < 9; i++)
    rect(g, cx - 11 + i * 2.6, cy - 17 - (i % 3), 2, 2, i % 3 ? '#8a5a7a' : '#ffd0e8')
  for (const dx of [-8, 8]) {
    ellipse(g, cx + dx, cy + 1, 3, 3, '#1a1a20')
    rect(g, cx + dx, cy + 1, 1, 1, '#8a8a92')
  }
  return cv
}

/** A crystal prism: a body and a point, lit on one side, its edge catching the light. */
function prism(g: G, x: number, y: number, a: number, len: number, wd: number, light: number) {
  if (len < 1) return
  const ux = Math.sin(a)
  const uy = -Math.cos(a)
  const nx = -uy
  const ny = ux
  const hw = wd / 2
  const bx = x + ux * len * 0.72
  const by = y + uy * len * 0.72
  const tx = x + ux * len
  const ty = y + uy * len
  const lit = light > 0.5 ? PINK[1] : PINK[2]
  // The shaded half, then the lit half, then the point.
  tri(g, x, y, x + nx * hw, y + ny * hw, bx + nx * hw, by + ny * hw, PINK[3])
  tri(g, x, y, bx + nx * hw, by + ny * hw, bx, by, PINK[3])
  tri(g, x, y, x - nx * hw, y - ny * hw, bx - nx * hw, by - ny * hw, lit)
  tri(g, x, y, bx - nx * hw, by - ny * hw, bx, by, lit)
  tri(g, bx - nx * hw, by - ny * hw, bx + nx * hw, by + ny * hw, tx, ty, PINK[2])
  tri(g, bx - nx * hw, by - ny * hw, bx, by, tx, ty, PINK[1])
  line(g, x - nx * hw, y - ny * hw, bx - nx * hw, by - ny * hw, PINK[0])
  rect(g, tx, ty, 1, 1, '#ffffff')
}

/**
 * The diamond: a brilliant cut, its crown and pavilion split into facets that turn with `spin` (each facet lit by how
 * much it faces the light), drawn row by row so its edges stay crisp.
 */
function diamond(g: G, cx: number, cy: number, size: number, spin: number) {
  const crown = Math.round(size * 0.35)
  const pav = Math.round(size * 0.65)
  const half = size * 0.55
  const top = Math.round(cy - crown)
  const facets = 10
  for (let y = 0; y < crown + pav; y++) {
    const hw =
      y < crown
        ? lerp(half * 0.55, half, y / Math.max(1, crown))
        : half * (1 - (y - crown) / Math.max(1, pav))
    const n = Math.round(hw)
    let pf = NaN
    for (let x = -n; x <= n; x++) {
      const th = Math.asin(Math.max(-1, Math.min(1, x / (hw + 0.01)))) + spin
      const f = Math.floor(th / ((Math.PI * 2) / facets))
      const mid = (f + 0.5) * ((Math.PI * 2) / facets) - spin
      // Facing the light (up and to the left) or away; the crown's facets brighter than the pavilion's.
      const lit = Math.cos(mid + 0.6) * (y < crown ? 1 : 0.7) + (y < crown ? 0.3 : 0)
      const i = lit > 0.8 ? 1 : lit > 0.35 ? 2 : lit > -0.2 ? 3 : 4
      // Where one facet meets the next: a fine dark seam (a light one on the crown).
      const seam = f !== pf && x > -n
      rect(g, cx + x, top + y, 1, 1, seam ? (y < crown ? PINK[0] : PINK[4]) : PINK[i]!)
      pf = f
    }
    // Its rim, dark.
    rect(g, cx - n - 1, top + y, 1, 1, PINK[5])
    rect(g, cx + n + 1, top + y, 1, 1, PINK[5])
  }
  // The table and the girdle, bright lines; a star of light on the table.
  rect(g, Math.round(cx - half * 0.55), top, Math.round(half * 1.1) + 1, 1, PINK[0])
  rect(g, Math.round(cx - half), top + crown, Math.round(half * 2) + 1, 1, PINK[1])
  const sx = Math.round(cx + Math.sin(spin * 2) * half * 0.4)
  rect(g, sx - 3, top + 2, 7, 1, '#ffffff')
  rect(g, sx, top - 1, 1, 7, '#ffffff')
}

export const diancieCinema = bossCinema<X>({
  id: 'cinema-diancie',
  reveal: REVEAL,
  seed: 719,
  aura: ['#ffffff', '#ffd0e8', '#ff9ad0', '#a03070'],
  flash: '#ffe8f4',
  setup(st, r) {
    const foe = st.L.foe
    // The clusters: round where it will float, along the walls, one by the cart; nearest the foe last.
    const spots: [number, number][] = [
      [8, 66],
      [232, 52],
      [118, FLOOR + 2],
      [214, FLOOR + 14],
      [62, FLOOR + 30],
      [140, 40],
      [foe.x - 30, foe.y + 4],
      [foe.x + 32, foe.y + 2],
      [foe.x - 12, foe.y + 10],
      [foe.x + 16, foe.y + 12],
    ]
    return {
      back: mine(),
      dust: new Particles(),
      clusters: spots.map(([x, y], i) => ({
        x,
        y,
        at: T_GROW + i * 0.13,
        prisms: Array.from({ length: 3 + (i % 3) }, (_, k) => [
          (k - 1.5) * 0.45 + r.range(-0.15, 0.15) + (x < 20 ? 1 : x > 220 ? -1 : 0),
          r.range(10, 22) * (i > 5 ? 1.1 : 0.8),
          r.range(4, 7),
        ]),
      })),
      gems: Array.from({ length: 40 }, () => [
        Math.round(r.range(0, W)),
        Math.round(r.range(4, FLOOR - 4)),
        r.pick(['#ffd0e8', '#ffffff', '#a8e8ff', '#ff9ad0'] as const),
      ]),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.dust.update(dt)
    const fz = spriteSize(s.foe)
    const at = { x: s.L.foe.x, y: s.L.foe.y - fz.h / 2 }
    // The black dust of the mine, drawn into one point from every corner.
    if (t > T_DUST && t < T_GEM)
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2
        const R = r.range(70, 150)
        s.dust.add({
          x: at.x + Math.cos(a) * R,
          y: at.y + Math.sin(a) * R * 0.6,
          vx: -Math.sin(a) * 60,
          vy: Math.cos(a) * 40,
          home: { x: at.x, y: at.y, k: 420 },
          life: 1.2,
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#8a7a8a', '#5a4a58', '#3a3038', '#1a141c'],
        })
      }
    // Each cluster's chips as it bursts out of the rock.
    for (const c of s.clusters)
      if (within(t, c.at, c.at + dt))
        for (let i = 0; i < 10; i++)
          s.fx.add({
            x: c.x,
            y: c.y,
            vx: r.range(-40, 40),
            vy: -r.range(20, 70),
            ay: 220,
            life: r.range(0.3, 0.6),
            size: 1,
            shape: r() < 0.5 ? 'star' : 'px',
            colors: ['#ffffff', ...PINK.slice(1, 4)],
          })
    // Glints round the diamond once it forms, then a storm of little diamonds when it bursts.
    if (t > T_GEM && t < REVEAL && r() < 0.6)
      s.fx.add({
        x: at.x + r.range(-20, 20),
        y: at.y + r.range(-20, 20),
        life: 0.3,
        size: 2,
        shape: 'star',
        colors: ['#ffffff', PINK[1]],
      })
    if (within(t, REVEAL, REVEAL + dt))
      for (let i = 0; i < 50; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(60, 160)
        s.fx.add({
          x: at.x,
          y: at.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 120,
          drag: 1.5,
          life: r.range(0.7, 1.3),
          size: 2,
          shape: 'cross',
          colors: [PINK[1], PINK[2]],
        })
      }
    if (t > REVEAL && t < REVEAL + 2.5 && r() < 0.5)
      s.fx.add({
        x: at.x + r.range(-fz.w * 0.6, fz.w * 0.6),
        y: at.y + r.range(-fz.h * 0.5, fz.h * 0.4),
        life: 0.35,
        size: 2,
        shape: 'star',
        colors: ['#ffffff', PINK[1], PINK[2]],
      })
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    // Leaving: its dark thins out with the rest of the scene (the crystals and lamps go at half way).
    if (k <= 0.5) return void wash(g, '#05020a', 0.36 * k, 8)
    // The lanterns: warm, then pink as the crystals wake.
    const pinkK = span(t, T_GROW, T_GROW + 1.4)
    for (const [x, y] of [
      [VP.x - 54, VP.y - 44],
      [VP.x + 54, VP.y - 44],
      [VP.x, VP.y - 50],
      [214, 30],
    ] as const) {
      const flick = Math.floor(t * 9 + x) % 7 === 0 ? 0.375 : 0.5
      g.drawImage(glow(26, pinkK > 0.5 ? '#c04a8a' : '#c87a2a', 1.6, flick), x - 26, y - 26)
      rect(g, x, y - 8, 1, 5, '#2a1a10')
      rect(g, x - 2, y - 3, 5, 6, '#3a2a1a')
      rect(g, x - 1, y - 2, 3, 4, pinkK > 0.5 ? '#ffd0e8' : '#ffd88a')
    }
    // Gems in the rock, glinting in turn.
    for (const [i, [x, y, c]] of s.gems.entries()) {
      rect(g, x, y, 2, 1, c)
      if ((Math.floor(t * 6) + i * 5) % 17 === 0) {
        rect(g, x - 2, y, 6, 1, '#ffffff')
        rect(g, x + 1, y - 2, 1, 5, '#ffffff')
      }
    }
    // The crystals growing, cluster by cluster, the whole mine glowing pink with them.
    if (pinkK > 0)
      g.drawImage(glow(70, '#a03070', 1.8, Math.round(pinkK * 0.35 * 8) / 8), s.L.foe.x - 70, s.L.foe.y - 70)
    for (const c of s.clusters) {
      const q = ease.outBack(span(t, c.at, c.at + 0.35), 1.6)
      if (q <= 0) continue
      for (const [a, len, wd] of c.prisms) prism(g, c.x, c.y, a, len * q, wd, 0.5 + Math.cos(a + 0.6) * 0.5)
    }
    // The cave's dark while it waits, lifting as the crystals light it.
    wash(g, '#05020a', 0.45 * (1 - pinkK * 0.6), 8)
    s.dust.draw(g)
  },
  before(g, s, t) {
    const fz = spriteSize(s.foe)
    const cx = s.L.foe.x
    const cy = Math.round(s.L.foe.y - fz.h / 2)
    // The dust squeezed to a point: dark, then red-hot, then white.
    if (t > T_DUST + 0.3 && t < T_GEM + 0.1) {
      const hot = span(t, T_HOT, T_GEM)
      const rr = Math.round(lerp(3, 7, span(t, T_DUST, T_HOT)) * (1 - hot * 0.5))
      if (hot > 0)
        g.drawImage(glow(rr * 4, hot > 0.5 ? '#ffffff' : '#ff4a2a', 1.3, 0.75), cx - rr * 4, cy - rr * 4)
      ellipse(g, cx, cy, rr, rr, hot > 0.6 ? '#ffffff' : hot > 0.2 ? '#ff6a3a' : '#1a141c')
      const jit = Math.floor(t * 30) % 2
      rect(g, cx - rr - 1 + jit, cy, 1, 1, '#ffffff')
    }
    // The diamond, crystallising out of the light, turning and growing.
    if (t >= T_GEM) {
      const q = ease.outBack(span(t, T_GEM, T_GEM + 0.35), 1.8)
      const size = Math.round(
        lerp(4, Math.min(34, fz.h * 0.55), q) * (1 + 0.08 * Math.sin(t * 20) * span(t, 3.6, REVEAL)),
      )
      g.drawImage(glow(size + 10, PINK[2], 1.4, 0.6), cx - size - 10, cy - size - 10)
      diamond(g, cx, cy, size, (t - T_GEM) * lerp(3, 9, span(t, T_GEM, REVEAL)))
    }
  },
  front(g, s, t) {
    // Rings of light off the diamond as it forms and as it bursts.
    const fz = spriteSize(s.foe)
    burstRing(g, s.L.foe.x, s.L.foe.y - fz.h / 2, span(t, T_GEM, T_GEM + 0.5), 60, 2, PINK[1])
    burstRing(g, s.L.foe.x, s.L.foe.y - fz.h / 2, span(t, T_HOT, T_HOT + 0.4), 40, 1, '#ff6a3a')
  },
  sounds: [
    [0.1, () => hiss(3.8, { freq: 260, type: 'lowpass', vol: 0.03 })],
    ...[0.3, 1.1, 1.7].map(
      (at) => [at, () => tone(1800, 0.05, { type: 'sine', vol: 0.03, slide: -600 })] as const,
    ),
    ...Array.from(
      { length: 10 },
      (_, i) =>
        [
          T_GROW + i * 0.13,
          () =>
            tone([1047, 1175, 1319, 1568, 1760, 2093][i % 6]! * (i > 5 ? 1.5 : 1), 0.35, {
              type: 'triangle',
              vol: 0.025,
            }),
        ] as const,
    ),
    [T_DUST, () => (fxSound('nightmare.charge'), hiss(0.9, { freq: 400, slide: 1200, vol: 0.05 }))],
    [T_HOT, () => tone(110, 0.35, { type: 'sawtooth', vol: 0.04, slide: 200 })],
    [
      T_GEM,
      () => {
        hiss(0.12, { freq: 5000, vol: 0.05 })
        ;[1568, 2093, 2637, 3136].forEach((f, i) =>
          tone(f, 0.25, { type: 'triangle', vol: 0.03, at: i * 0.05 }),
        )
      },
    ],
    [3.6, () => fxSound('legend.heart')],
    [REVEAL, () => (fxSound('legend.shatter'), fxSound('legend.roar'))],
  ],
})
