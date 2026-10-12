// Moments outside battle, on a quiet stage: evolution (silhouette, a flicker that speeds up, rays, burst, reveal; a
// stone floats down first), the Egg hatching (nest, three wobbles, cracks, light, burst, hello hop, hearts) and a trade
// (into the ball, up a link of light, the other ball down it). They play in full whatever the motion setting short;
// only "off" skips them.
import { fxSound } from '@/audio/sfx'
import type { PokeType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  bayer,
  cached,
  canvas,
  ditherFill,
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
import { ball, type BallKind } from '../scenes'
import { drawSprite, spriteSize } from '../sprites'
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
  /** The baby's front sprite key (its shiny one for a shiny). */
  baby: string
  /** A shiny hatchling: two rings of stars just after the reveal, and the shiny chime. */
  shiny?: boolean
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
  // The shiny sparkle, just after the reveal: two rings of stars a beat apart.
  const T_SHINY = T_HATCHED - 0.35
  const RINGS = p.shiny
    ? ([
        [T_SHINY, 18],
        [T_SHINY + 0.25, 30],
      ] as const)
    : []
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
      for (const [t0, R] of RINGS)
        if (t >= t0 && t < t0 + STEP * 1.5)
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            s.fx.add({
              x: C.x + Math.cos(a) * R * 0.4,
              y: C.y - 24 + Math.sin(a) * R * 0.4,
              vx: Math.cos(a) * R * 2.2,
              vy: Math.sin(a) * R * 2.2,
              drag: 3,
              life: 0.55,
              size: 2,
              shape: 'star',
              colors: ['#ffffff', '#fff6a8', '#ffe14d'],
            })
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
      if (p.shiny) c.push([T_SHINY, () => fxSound('hatch.shiny', 0)], [T_SHINY + 0.12, () => fxSound('hatch.shiny', 1)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}

// ---------------------------------------------------------------- a trade (docs/23)
export interface TradeParams {
  /** Front sprite keys: the Pokémon that leaves, and the one that arrives (its shiny one for a shiny). */
  give: string
  get: string
  giveBall: BallKind
  getBall: BallKind
  shiny?: boolean
}

interface TradeState {
  r: Rng
  fx: Particles
  under: Particles
  bg: Canvas
}

const LINK = ['#ffffff', '#c8f0ff', '#7cc8f0', '#3a7be0'] as const

/** The link of light: a dithered column with a white core, and the pulses running along it. */
function linkBeam(
  g: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  k: number,
  pulses: number[],
) {
  if (k <= 0 || bottom <= top) return
  const h = bottom - top
  ditherFill(g, x - 10, top, 20, h, LINK[3], 0.3 * k)
  ditherFill(g, x - 6, top, 12, h, LINK[2], 0.55 * k)
  rect(g, x - 2, top, 4, h, k > 0.5 ? LINK[1] : LINK[2])
  if (k > 0.35) rect(g, x - 1, top, 2, h, LINK[0])
  for (const py of pulses)
    if (py > top - 8 && py < bottom + 8) {
      rect(g, x - 4, Math.max(top, py - 5), 8, 10, LINK[1])
      rect(g, x - 2, Math.max(top, py - 8), 4, 16, LINK[0])
    }
}

/**
 * Your Pokémon goes into its ball, the ball flies up and away along a link of light, the other ball comes
 * down the same way and opens on the new Pokémon. Beats: 'sending', 'incoming', 'care' (the host says the
 * lines).
 */
export function tradeTimeline(p: TradeParams): Timeline<TradeState> {
  const shiny = !!p.shiny
  const C = { x: 120, y: 122 }
  const R = 7
  const REST = C.y - R - 1
  const T_RECALL = 0.55
  const T_IN = 1.1
  const T_LINK = 1.12
  const T_UP = 1.32
  const T_GONE = 1.82
  const T_DOWN = 2.38
  const T_LAND = 2.86
  const T_OPEN = 3.14
  const T_SHINY = 3.42
  const T_CARE = 3.6
  const dur = 4.4
  // The recall ball hovers just over the Pokémon's head, whatever its size.
  const BALL_Y = Math.max(28, C.y - Math.min(76, spriteSize(p.give).h) - 8)
  type Ball = { x: number; y: number; kind: BallKind; open: number; a: number; fast?: boolean }
  /** Where the ball is, which one, its lid and its spin; null while it is off screen. */
  const ballAt = (t: number): Ball | null => {
    if (t < T_RECALL - 0.15) return null
    if (t < T_IN) {
      const open = t < T_IN - 0.1 ? 1 : 1 - span(t, T_IN - 0.1, T_IN)
      return { x: C.x, y: BALL_Y + Math.round(Math.sin(t * 9)), kind: p.giveBall, open, a: 0 }
    }
    if (t < T_UP) {
      const dip = within(t, T_UP - 0.14, T_UP)
        ? Math.round(3 * Math.sin(Math.PI * span(t, T_UP - 0.14, T_UP)))
        : 0
      return { x: C.x, y: BALL_Y + dip, kind: p.giveBall, open: 0, a: 0 }
    }
    if (t < T_GONE) {
      const k = ease.inQ(span(t, T_UP, T_GONE))
      return { x: C.x, y: lerp(BALL_Y, -14, k), kind: p.giveBall, open: 0, a: k * 9, fast: k > 0.15 }
    }
    if (t < T_DOWN) return null
    if (t < T_LAND) {
      const k = ease.outQ(span(t, T_DOWN, T_LAND))
      return { x: C.x, y: lerp(-14, REST, k), kind: p.getBall, open: 0, a: (1 - k) * 7, fast: k < 0.8 }
    }
    const b = t - T_LAND
    const y = b < 0.14 ? REST - Math.round(4 * Math.sin(Math.PI * (b / 0.14))) : REST
    const wob = within(t, T_LAND + 0.14, T_OPEN)
      ? 0.45 * Math.sin(span(t, T_LAND + 0.14, T_OPEN) * Math.PI * 2)
      : 0
    if (t < T_OPEN) return { x: C.x, y, kind: p.getBall, open: 0, a: wob }
    if (t < T_OPEN + 0.16) return { x: C.x, y, kind: p.getBall, open: span(t, T_OPEN, T_OPEN + 0.12), a: 0 }
    return null
  }
  return {
    id: 'trade',
    dur,
    setup: () => ({
      r: rng(53),
      fx: new Particles(),
      under: new Particles(),
      bg: momentBg('#132044', '#2b4a86', '#1c2f5c', '#5fa8e8', 11),
    }),
    step(s, t, dt) {
      s.fx.update(dt)
      s.under.update(dt)
      const r = s.r
      const b = ballAt(t)
      // Drawn into the ball: red streaks from the Pokémon's outline.
      if (within(t, T_RECALL + 0.1, T_IN - 0.08) && b) {
        const m = spriteSize(p.give)
        for (let i = 0; i < 3; i++)
          s.fx.add({
            x: C.x + r.range(-m.w / 2, m.w / 2) * 0.7,
            y: C.y - r.range(0, m.h * 0.8),
            home: { x: b.x, y: b.y, k: 1500 },
            life: 0.35,
            size: 1,
            shape: 'streak',
            trail: 0.02,
            colors: ['#ffffff', '#ff9aa8', '#ff3b5c'],
          })
      }
      // A light trail behind a ball on the move.
      if (b?.fast && r() < 0.9)
        s.fx.add({
          x: b.x + r.range(-2, 2),
          y: b.y + (t < T_DOWN ? R : -R),
          vy: t < T_DOWN ? 30 : -30,
          life: 0.35,
          size: 2,
          size1: 0,
          shape: 'sq',
          colors: LINK,
        })
      // Sparkles drifting around the link while it holds.
      if (within(t, T_LINK + 0.2, T_OPEN) && r() < 0.35)
        s.under.add({
          x: C.x + r.range(-26, 26),
          y: r.range(10, C.y - 10),
          vy: r.range(-10, -3),
          life: 0.8,
          size: 1,
          shape: r() < 0.4 ? 'star' : 'px',
          colors: [LINK[0], LINK[1], LINK[2]],
        })
      if (t >= T_LAND && t < T_LAND + STEP * 1.5)
        for (const d of [-1, 1])
          for (let i = 0; i < 3; i++)
            s.under.add({
              x: C.x + d * r.range(3, 6),
              y: C.y,
              vx: d * r.range(15, 35),
              vy: -r.range(5, 16),
              drag: 3,
              life: 0.45,
              size: 1,
              size1: 3,
              shape: 'smoke',
              colors: ['#9fb8de', '#6f8cc0'],
              density: 1,
            })
      if (t >= T_OPEN && t < T_OPEN + STEP * 1.5)
        for (let k = 0; k < 28; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 110)
          s.fx.add({
            x: C.x,
            y: REST - 6,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.8,
            drag: 2.6,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: k % 3 ? 'star' : 'sq',
            colors: shiny ? ['#ffffff', '#fff6a8', '#ffd23a', '#f0a000'] : LINK,
          })
        }
      if (shiny && (Math.abs(t - T_SHINY) < STEP * 0.75 || Math.abs(t - T_SHINY - 0.22) < STEP * 0.75)) {
        const big = t > T_SHINY + 0.1
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2
          s.fx.add({
            x: C.x + Math.cos(a) * 6,
            y: C.y - 30 + Math.sin(a) * 6,
            vx: Math.cos(a) * (big ? 70 : 45),
            vy: Math.sin(a) * (big ? 55 : 35),
            drag: 2.2,
            life: 0.7,
            size: big ? 2 : 1,
            shape: 'star',
            colors: ['#ffffff', '#fff6a8', '#ffd23a'],
          })
        }
      }
      // Afterwards, a few sparkles keep twinkling around the newcomer.
      if (t > T_OPEN + 0.5 && r() < 0.1) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: C.x + Math.cos(a) * r.range(26, 50),
          y: C.y - 34 + Math.sin(a) * r.range(16, 34),
          life: 0.6,
          shape: 'star',
          size: 1,
          colors: shiny ? ['#ffffff', '#ffe14d'] : [LINK[0], LINK[1]],
        })
      }
    },
    draw(g, s, t) {
      g.drawImage(s.bg, 0, 0)
      // The link: rises from the floor, runs while the balls travel, fades once the newcomer is out.
      const top = lerp(C.y, -4, ease.outC(span(t, T_LINK, T_LINK + 0.24)))
      const k = t < T_LINK ? 0 : t < T_OPEN + 0.1 ? 1 : 1 - span(t, T_OPEN + 0.1, T_CARE + 0.3)
      const pulses: number[] = []
      if (within(t, T_UP + 0.1, T_DOWN))
        for (let i = 0; i < 3; i++) pulses.push(C.y - (((t - T_UP) * 260 + i * 46) % (C.y + 40)))
      if (within(t, T_DOWN - 0.2, T_LAND)) pulses.push(lerp(-10, C.y, span(t, T_DOWN - 0.2, T_LAND - 0.1)))
      if (k > 0) g.drawImage(glow(26, LINK[2], 1.4, 0.55 * k), C.x - 26, C.y - 26)
      linkBeam(g, C.x, Math.round(top), C.y, k, pulses)
      s.under.draw(g)
      // Yours: a hop, then red and drawn up into the ball.
      if (t < T_IN) {
        const q = span(t, T_RECALL + 0.15, T_IN - 0.05)
        const hop = within(t, 0.18, 0.46) ? Math.round(Math.sin(Math.PI * span(t, 0.18, 0.46)) * 6) : 0
        const sc = 1 - ease.inQ(q)
        if (sc > 0.02)
          drawSprite(g, p.give, C.x, Math.round(lerp(C.y, BALL_Y + 4, ease.inQ(q))) - hop, {
            sx: sc,
            sy: sc,
            tint: { color: '#ff3b5c', a: 0.85 * span(t, T_RECALL, T_RECALL + 0.25) },
          })
      }
      // Theirs: out of the ball from white, a quick grow, then a hop.
      if (t >= T_OPEN) {
        const grow = ease.outC(span(t, T_OPEN, T_OPEN + 0.18))
        const hop = within(t, T_OPEN + 0.5, T_OPEN + 0.8)
          ? Math.round(Math.sin(Math.PI * span(t, T_OPEN + 0.5, T_OPEN + 0.8)) * 7)
          : 0
        // Two white frames, then the colours.
        const white = t < T_OPEN + 2 * STEP ? 1 : 1 - span(t, T_OPEN + 0.1, T_OPEN + 0.42)
        drawSprite(g, p.get, C.x, C.y - hop, { sx: 0.3 + 0.7 * grow, sy: 0.3 + 0.7 * grow, flash: white })
        const q = span(t, T_OPEN, T_OPEN + 0.5)
        if (q > 0 && q < 1) {
          const Rr = Math.round(8 + 46 * ease.outC(q))
          g.drawImage(ring(Rr, 3, shiny ? '#ffe14d' : LINK[1], 1 - q), C.x - Rr - 1, C.y - 24 - Rr - 1)
        }
      }
      const b = ballAt(t)
      if (b) {
        const im = ball(b.kind, b.a, { R, open: b.open })
        // A ball on the move leaves two ghosts behind (the catch throw's trail).
        if (b.fast) {
          const back = t < T_DOWN ? 7 : -7
          g.globalAlpha = 0.3
          g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y + back * 2 - im.height / 2))
          g.globalAlpha = 0.55
          g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y + back - im.height / 2))
          g.globalAlpha = 1
        }
        if (b.open > 0)
          g.drawImage(glow(14, t < T_DOWN ? '#ff9aa8' : '#ffffff', 1.5, 0.7 * b.open), b.x - 14, b.y - 14)
        g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
      }
      s.fx.draw(g)
      if (t < 0.4) wash(g, '#0b1430', 1 - span(t, 0, 0.4))
    },
    cues: () => {
      const c: Cue<TradeState>[] = [
        [0.12, (hud) => hud.beat?.('sending')],
        [T_RECALL, () => fxSound('trade.recall')],
        [T_IN, () => fxSound('trade.shut')],
        [T_UP, () => fxSound('trade.up')],
        [T_GONE + 0.05, (hud) => hud.beat?.('incoming')],
        [T_DOWN, () => fxSound('trade.down')],
        [T_LAND, () => fxSound('trade.land')],
        [T_OPEN, () => fxSound('trade.open')],
        [T_CARE, (hud) => hud.beat?.('care')],
      ]
      if (shiny)
        c.push([T_SHINY, () => fxSound('trade.shiny', 0)], [T_SHINY + 0.09, () => fxSound('trade.shiny', 1)])
      for (let i = 0; i < 4; i++) c.push([T_CARE + 0.05 + i * 0.12, () => fxSound('trade.jingle', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
