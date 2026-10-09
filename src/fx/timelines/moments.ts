// Moments outside battle, on a quiet stage: evolution (silhouette, a flicker that speeds up, rays, burst, reveal; a
// stone floats down first) and the Egg hatching (nest, three wobbles, cracks, light, burst, hello hop, hearts). Both
// play in full whatever the motion setting short; only "off" skips them.
import { fxSound } from '@/audio/sfx'
import type { PokeType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  bayer,
  cached,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  mix,
  Particles,
  polyline,
  px,
  rect,
  ring,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  type Canvas,
  type Rng,
} from '../pixel'
import { drawSprite } from '../sprites'
import { H, screenFlash, screenShake, STEP, W, within, type Cue, type Timeline } from '../timeline'
import { drawRays } from './legend'

const C = { x: 120, y: 112 }

/** A quiet stage for moments outside battle: a vertical gradient, a floor, a pool of light where the Pokémon stands. */
function momentBg(top: string, bottom: string, floor: string, spot: string, seed: number): Canvas {
  return cached(`moment|${top}|${bottom}|${floor}|${spot}`, () => {
    const r = rng(seed)
    const c = shade(W, H, (x, y) => {
      if (y < 118) return y / 118 > bayer(x, y) * 0.9 + 0.05 ? bottom : top
      // The floor: lit near the horizon, fading to the floor colour, dithered.
      return (y - 118) / 42 > bayer(x, y) * 0.85 + 0.1 ? floor : mix(floor, spot, 0.45)
    })
    const g = c.g
    // The pool of light on the floor and a halo behind.
    for (let k = 0; k < 4; k++) softEllipse(g, 120, 116, 70 - k * 12, 12 - k * 2, spot, 0.35 + k * 0.12, 0.8)
    g.drawImage(glow(70, spot, 1.4, 0.32), 120 - 70, 70 - 70)
    for (let i = 0; i < 26; i++) px(g, r.int(0, W - 1), r.int(0, 100), r() < 0.5 ? spot : '#ffffff')
    return c
  })
}

// ---------------------------------------------------------------- evolution
export interface EvolveParams {
  /** Front sprite keys of the two forms. */
  from: string
  to: string
  /** The new form's type: the light takes its colour. */
  type: PokeType
  /** The stone's canvas key (fx/sprites `loadItemSprite`), when a stone does it. */
  stone?: string | null
}

interface EvoState {
  r: Rng
  fx: Particles
  amb: Particles
  rays: Canvas
  shakes: [number, number, number][]
  bg: Canvas
}

export function evolveTimeline(p: EvolveParams): Timeline<EvoState> {
  const c = typeColor(p.type)
  const GLOW = ['#ffffff', mix(c, '#ffffff', 0.62), mix(c, '#ffffff', 0.25), c] as const
  const stone = !!p.stone
  const T_STONE = stone ? 0.25 : -1
  const T_TOUCH = stone ? 1.0 : -1
  const T_DARK = stone ? 1.35 : 0.9
  const T_WHITE = T_DARK + 0.45
  const T_MORPH = T_WHITE + 0.75
  const T_BURST = T_MORPH + 3.7
  const T_CONGRATS = T_BURST + 0.55
  const dur = T_BURST + 3.2
  // The flicker between the two forms: each swap comes sooner than the last.
  const swaps: number[] = []
  for (let t = T_MORPH, k = 0.5; t < T_BURST - 0.02; k = Math.max(0.045, k * 0.84)) swaps.push((t += k))
  const formAt = (t: number) => swaps.filter((s) => s <= t).length % 2 // 0: before, 1: after
  return {
    id: 'evolve',
    dur,
    setup: () => ({
      r: rng(97),
      fx: new Particles(),
      amb: new Particles(),
      rays: canvas(W, H),
      shakes: [[T_BURST, 0.35, 3]],
      bg: momentBg('#141a36', '#2a2458', '#221c40', '#4a3f86', 3),
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      // Sparks drift in from the edges and are drawn into the Pokémon.
      if (t > T_DARK && t < T_BURST && r() < 0.6) {
        const a = r() * Math.PI * 2
        s.amb.add({
          x: C.x + Math.cos(a) * 130,
          y: C.y - 30 + Math.sin(a) * 90,
          home: { x: C.x, y: C.y - 30, k: 260 },
          life: 1.6,
          size: r.int(1, 2),
          shape: r() < 0.3 ? 'star' : 'sq',
          colors: GLOW.slice(0, 3),
        })
      }
      if (stone && t >= T_TOUCH && t < T_TOUCH + STEP * 1.5)
        for (let k = 0; k < 18; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: C.x,
            y: C.y - 46,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 40,
            drag: 3,
            life: 0.6,
            shape: 'plus',
            colors: ['#ffffff', GLOW[1], GLOW[3]],
          })
        }
      if (t >= T_BURST && t < T_BURST + STEP * 1.5)
        for (let k = 0; k < 46; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(50, 150)
          s.fx.add({
            x: C.x,
            y: C.y - 36,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 2.4,
            life: r.range(0.6, 1.1),
            size: r.int(1, 2),
            shape: k % 3 ? 'star' : 'sq',
            colors: GLOW,
          })
        }
      // Afterwards, sparkles keep twinkling around the new form.
      if (t > T_BURST + 0.6 && r() < 0.12) {
        const a = r() * Math.PI * 2
        s.amb.add({
          x: C.x + Math.cos(a) * r.range(30, 60),
          y: C.y - 40 + Math.sin(a) * r.range(20, 45),
          life: 0.6,
          shape: 'star',
          size: 1,
          colors: GLOW.slice(0, 2),
        })
      }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(s.bg, 0, 0)
      const dark =
        t < T_DARK
          ? 0
          : t < T_BURST
            ? 0.55 * span(t, T_DARK, T_DARK + 0.6)
            : 0.55 * (1 - span(t, T_BURST, T_BURST + 1.2))
      if (dark > 0) wash(g, '#06040c', dark, 12)
      // Light rays behind, turning and growing through the morph.
      if (t > T_MORPH - 0.2 && t < T_BURST + 1.4) {
        const k =
          0.55 *
          (t < T_BURST ? 0.3 + 0.7 * span(t, T_MORPH - 0.2, T_BURST) : 1 - span(t, T_BURST, T_BURST + 1.4))
        drawRays(
          s.rays,
          { x: C.x, y: C.y - 36 },
          t * (t < T_BURST ? 1 + 2 * span(t, T_MORPH, T_BURST) : 1),
          GLOW[1],
          k,
        )
        g.drawImage(s.rays, 0, 0)
      }
      if (t > T_DARK)
        g.drawImage(glow(44, GLOW[1], 1.6, 0.25 + 0.35 * span(t, T_DARK, T_BURST)), C.x - 44, C.y - 36 - 44)
      const before = t < T_BURST && (t < T_MORPH || formAt(t) === 0)
      const key = before ? p.from : p.to
      if (t < T_WHITE) drawSprite(g, p.from, C.x, C.y, { flash: span(t, T_WHITE - 0.45, T_WHITE) })
      else if (t < T_BURST)
        // A white silhouette with a rim that pulses in the glow colours.
        drawSprite(g, key, C.x, C.y, { sil: '#ffffff', outline: GLOW[Math.floor(t * 10) % 2 ? 2 : 3] })
      else {
        const hop = within(t, T_BURST + 0.6, T_BURST + 0.95)
          ? Math.round(Math.sin(Math.PI * span(t, T_BURST + 0.6, T_BURST + 0.95)) * 7)
          : 0
        drawSprite(g, p.to, C.x, C.y - hop, { flash: 1 - span(t, T_BURST + 0.05, T_BURST + 0.5) })
      }
      // A ring at each swap, and a big one at the burst.
      for (const sw of swaps) {
        const q = span(t, sw, sw + 0.35)
        if (q > 0 && q < 1) {
          const R = Math.round(20 + 40 * ease.outC(q))
          g.drawImage(ring(R, 2, GLOW[1], 0.7 * (1 - q)), C.x - R - 1, C.y - 36 - R - 1)
        }
      }
      const q = span(t, T_BURST, T_BURST + 0.7)
      if (q > 0 && q < 1) {
        const R = Math.min(150, Math.round(10 + 140 * ease.outC(q)))
        g.drawImage(ring(R, 4, GLOW[2], 1 - q), C.x - R - 1, C.y - 36 - R - 1)
      }
      if (p.stone && t >= T_STONE && t < T_TOUCH) {
        const k = span(t, T_STONE, T_TOUCH)
        const y = Math.round(lerp(20, C.y - 52, ease.outQ(k)) + Math.sin(t * 8) * 1.5)
        g.drawImage(glow(10, GLOW[1], 1.6, 0.6), C.x - 10, y - 6)
        drawSprite(g, p.stone, C.x, y + 6)
      }
      s.amb.draw(g)
      s.fx.draw(g)
      g.restore()
      if (t < 0.5) wash(g, '#06040c', 1 - span(t, 0, 0.5))
      if (within(t, T_BURST, T_BURST + 0.5)) screenFlash(g, '#ffffff', 1 - span(t, T_BURST, T_BURST + 0.5))
    },
    cues: () => {
      const c: Cue<EvoState>[] = [
        [T_DARK - 0.1, (hud) => hud.beat?.('evolving')],
        [T_CONGRATS, (hud) => hud.beat?.('evolved')],
        [T_WHITE, () => fxSound('evolve.white')],
        [T_BURST, () => fxSound('evolve.burst')],
      ]
      if (stone) c.push([T_TOUCH, () => fxSound('evolve.touch')])
      swaps.forEach((sw, i) => c.push([sw, () => fxSound('evolve.swap', i)]))
      for (let i = 0; i < 6; i++) c.push([T_CONGRATS + i * 0.13, () => fxSound('evolve.fanfare', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}

// ---------------------------------------------------------------- the Egg
const EGG_MAP = [
  '............aaaa............',
  '..........aabbbbaa..........',
  '........aabbbbbbbbaa........',
  '.......acbbbbbbbbbbca.......',
  '......deebbbbbbbbbbeed......',
  '.....deeeebbbbbbbbeeeed.....',
  '....deeeeeeebbbbeeeeeeed....',
  '...aceeeeeeeeeeeeeeeeeeca...',
  '...deeeeeeeeeeeeeeeeeeeed...',
  '..dffgeeeeeeeeeeeeeeeeeeha..',
  '..dffffeeeeeeeeeeeeeeeeeed..',
  '.affffffeeeeeeeeeeeeeeeeeha.',
  '.dfffffffeeeeeeffgeeeeeeeed.',
  '.dfffffffeeeeeffffeeeeeeeed.',
  'afffffffgeeeeeffffeeegfgeeha',
  'dfffffffeeeeeegffeeeffffgehd',
  'dhgfffgeeeeeeeeeeeegfffffehd',
  'dheeeeeeeeeeeeeeeeeffffffghd',
  'dceeeeeeeeeeeeeeeegfffffffcd',
  '.deeeeeeeeeeeeeeeegfffffffd.',
  '.dheeeeeeeeeeeeeeegffffffid.',
  '.dchheeeeeeeeeeeeeeffffiicd.',
  '..dcccchheeeeeeeeeehiiiiid..',
  '..dccciiicchhhhhhcccciiicd..',
  '...dciiiiiccccccccccccccd...',
  '....diiiiiiccccccccccccd....',
  '.....diiiiicccccccccccd.....',
  '......ddiiicccccccccdd......',
  '........ddccccccccdd........',
  '..........dddddddd..........',
]
const EGG_PAL: Record<string, string> = {
  a: '#5a5241',
  b: '#ffffff',
  c: '#cdbd83',
  d: '#24304f',
  e: '#fff6de',
  f: '#9ccd83',
  g: '#cde6b4',
  h: '#e6deb4',
  i: '#83b46a',
}
const egg = () => cached('egg', () => shade(28, 30, (x, y) => EGG_PAL[EGG_MAP[y]![x]!] ?? null))

/** Each stage adds lines (egg-local pixels; the egg is 28×30). */
const CRACKS: [number, number][][][] = [
  [
    [
      [9, 6],
      [11, 8],
      [10, 10],
      [13, 12],
    ],
  ],
  [
    [
      [13, 12],
      [16, 11],
      [18, 13],
      [21, 12],
    ],
    [
      [10, 10],
      [7, 12],
      [6, 15],
    ],
  ],
  [
    [
      [21, 12],
      [23, 15],
      [22, 18],
      [25, 20],
    ],
    [
      [6, 15],
      [4, 17],
      [6, 20],
      [3, 22],
    ],
    [
      [16, 11],
      [15, 7],
      [17, 4],
    ],
  ],
]

let eggScratch: Canvas | null = null
/** The egg with its cracks, drawn into its own canvas so the wobble can tilt it around its base. */
function eggCanvas(stage: number, leak: number, t: number): Canvas {
  const c = (eggScratch ??= canvas(30, 32))
  c.g.clearRect(0, 0, 30, 32)
  c.g.drawImage(egg(), 1, 1)
  for (let k = 0; k < stage; k++)
    for (const ln of CRACKS[k]!) {
      polyline(
        c.g,
        ln.map(([x, y]) => [x + 1, y + 1] as [number, number]),
        '#24304f',
      )
      // Light leaking from the cracks once they open.
      if (leak > 0 && (Math.floor(t * 14) + k) % 2)
        polyline(
          c.g,
          ln.map(([x, y]) => [x + 1, y] as [number, number]),
          leak > 0.5 ? '#ffffff' : '#fff2b8',
        )
    }
  return c
}

export interface HatchParams {
  /** The baby's front sprite key. */
  baby: string
}

interface HatchState {
  r: Rng
  fx: Particles
  amb: Particles
  shakes: [number, number, number][]
  bg: Canvas
  nest: Canvas
}

export function hatchTimeline(p: HatchParams): Timeline<HatchState> {
  const WOB = [
    [0.8, 0.55, 5, 2],
    [1.75, 0.75, 7, 3],
    [2.95, 0.9, 10, 4],
  ] as const
  const T_CRACK = [1.95, 3.15, 4.0] as const
  const T_SHAKE = 4.0
  const T_BURST = 4.85
  const T_HATCHED = 5.5
  return {
    id: 'hatch',
    dur: 9,
    setup() {
      // A straw nest, built once.
      const nest = cached('nest', () => {
        const n = canvas(80, 24)
        ellipse(n.g, 40, 14, 34, 8, '#8a5a32')
        ellipse(n.g, 40, 12, 32, 7, '#c8945a')
        const r = rng(9)
        for (let i = 0; i < 60; i++) {
          const a = r() * Math.PI
          const x = Math.round(40 + Math.cos(a) * r.range(18, 33))
          const y = Math.round(12 + Math.sin(a) * r.range(2, 7))
          rect(n.g, x, y, r.int(2, 4), 1, r() < 0.5 ? '#e0b070' : '#a0704a')
        }
        ellipse(n.g, 40, 10, 22, 4, '#6b4a34')
        return n
      })
      return {
        r: rng(41),
        fx: new Particles(),
        amb: new Particles(),
        shakes: [[T_BURST, 0.3, 2]],
        bg: momentBg('#ffe6d2', '#ffc8c0', '#e8a890', '#fff3e0', 7),
        nest,
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (r() < 0.08)
        s.amb.add({
          x: r.int(20, 220),
          y: r.int(20, 100),
          vy: -4,
          life: 1.2,
          shape: 'star',
          size: 1,
          colors: ['#ffffff', '#fff3e0'],
        })
      for (const tc of T_CRACK)
        if (t >= tc && t < tc + STEP * 1.5)
          for (let k = 0; k < 5; k++)
            s.fx.add({
              x: C.x + r.range(-8, 8),
              y: C.y - 22,
              vx: r.range(-30, 30),
              vy: -r.range(20, 50),
              ay: 160,
              life: 0.5,
              size: 1,
              shape: 'sq',
              colors: ['#f6efd6', '#d8cfb4'],
            })
      if (t >= T_BURST && t < T_BURST + STEP * 1.5) {
        // The shell flies apart: big pieces that fall, then stars.
        for (let k = 0; k < 22; k++) {
          const a = -Math.PI * r.range(0.05, 0.95)
          const sp = r.range(70, 150)
          s.fx.add({
            x: C.x + r.range(-6, 6),
            y: C.y - 16,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            ay: 260,
            drag: 0.4,
            life: r.range(0.8, 1.3),
            size: r.int(2, 3),
            shape: 'sq',
            colors: k % 4 ? ['#f6efd6', '#e8e0c4'] : ['#7cc070', '#5aa850'],
          })
        }
        for (let k = 0; k < 24; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 110)
          s.fx.add({
            x: C.x,
            y: C.y - 20,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 2.6,
            life: r.range(0.5, 0.9),
            shape: 'star',
            size: 1,
            colors: ['#ffffff', '#fff2b8', '#ffd0d8'],
          })
        }
      }
      if (t >= T_HATCHED && t < T_HATCHED + 1.6 && r() < 0.06)
        s.amb.add({
          x: C.x + r.range(-16, 16),
          y: C.y - 50,
          vy: -14,
          vx: r.range(-4, 4),
          life: 1.3,
          shape: 'heart',
          size: 2,
          colors: ['#ff6f9c', '#ff9ab8'],
        })
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(s.bg, 0, 0)
      g.drawImage(s.nest, C.x - 40, C.y - 13)
      if (t < T_BURST) {
        // The wobble: a tilt around the base, in bursts, then a constant shake with little hops.
        let ang = 0
        let hop = 0
        let dx = 0
        for (const [t0, d, deg, n] of WOB)
          if (within(t, t0, t0 + d))
            ang = Math.sin(span(t, t0, t0 + d) * Math.PI * n) * deg * (1 - 0.3 * span(t, t0, t0 + d))
        if (t >= T_SHAKE) {
          const k = span(t, T_SHAKE, T_BURST)
          ang = Math.sin(t * 46) * (8 + 6 * k)
          dx = Math.round(Math.sin(t * 61) * (1 + k))
          hop = Math.round(Math.abs(Math.sin(t * 9)) * 4 * k)
        }
        const stage = T_CRACK.filter((c) => t >= c).length
        const leak = t >= T_CRACK[2] ? span(t, T_CRACK[2], T_BURST) : 0
        if (leak > 0) g.drawImage(glow(30, '#fff2b8', 1.5, 0.3 + 0.5 * leak), C.x - 30, C.y - 16 - 30)
        const e = eggCanvas(stage, leak, t)
        g.save()
        g.translate(C.x + dx, C.y - 2 - hop)
        g.rotate((ang * Math.PI) / 180)
        g.drawImage(e, -Math.round(e.width / 2), -e.height)
        g.restore()
        // Light streaks out of the cracks just before it breaks.
        if (leak > 0.45)
          for (let i = 0; i < 6; i++) {
            const a = -Math.PI * (0.1 + i * 0.16) + Math.sin(t * 3 + i) * 0.05
            const L = Math.round(20 + 40 * leak)
            line(
              g,
              C.x,
              C.y - 18,
              Math.round(C.x + Math.cos(a) * L),
              Math.round(C.y - 18 + Math.sin(a) * L),
              i % 2 ? '#ffffff' : '#fff2b8',
            )
          }
      } else {
        const hop = within(t, T_BURST + 0.6, T_BURST + 0.9)
          ? Math.round(Math.sin(Math.PI * span(t, T_BURST + 0.6, T_BURST + 0.9)) * 6)
          : within(t, T_HATCHED + 1.4, T_HATCHED + 1.7)
            ? Math.round(Math.sin(Math.PI * span(t, T_HATCHED + 1.4, T_HATCHED + 1.7)) * 4)
            : 0
        drawSprite(g, p.baby, C.x, C.y - 2 - hop, { flash: 1 - span(t, T_BURST + 0.05, T_BURST + 0.45) })
      }
      const q = span(t, T_BURST, T_BURST + 0.6)
      if (q > 0 && q < 1) {
        const R = Math.round(10 + 90 * ease.outC(q))
        g.drawImage(ring(R, 3, '#ffffff', 1 - q), C.x - R - 1, C.y - 20 - R - 1)
      }
      s.amb.draw(g)
      s.fx.draw(g)
      g.restore()
      if (t < 0.45) wash(g, '#ffffff', 1 - span(t, 0, 0.45))
      if (within(t, T_BURST, T_BURST + 0.45)) screenFlash(g, '#ffffff', 1 - span(t, T_BURST, T_BURST + 0.45))
    },
    cues: () => {
      const c: Cue<HatchState>[] = [
        [WOB[0][0], (hud) => hud.beat?.('oh')],
        [T_CRACK[1], (hud) => hud.beat?.('moving')],
        [T_HATCHED, (hud) => hud.beat?.('hatched')],
        [T_BURST, () => fxSound('hatch.burst')],
      ]
      for (const [t0, d, , n] of WOB)
        for (let i = 0; i < n; i++) c.push([t0 + (i * d) / n, () => fxSound('hatch.wobble')])
      for (const tc of T_CRACK) c.push([tc, () => fxSound('hatch.crack')])
      for (let i = 0; i < 4; i++) c.push([T_HATCHED + i * 0.14, () => fxSound('hatch.fanfare', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
