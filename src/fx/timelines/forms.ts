// Battle form changes. Mega Evolution: the Key Stone and the Mega Stone link in seven colours, a sphere of light, the
// change flickering inside, cracks, a shatter, the Mega symbol (yours, or a trainer's ace on the far side).
// Gigantamax: the recall into the ball, Dynamax energy swells it, it is thrown up under a crimson sky, a red
// silhouette rises in steps, the G-Max form with its cloud crown and a shockwave; on its end it shrinks back.
// Short motion: a white flash and the new sprite.
import { fxSound } from '@/audio/sfx'
import type { DieType } from '@/engine/types'
import { typeColor } from '@/theme/util'
import {
  bolt,
  cached,
  canvas,
  ditherFill,
  ease,
  ellipse,
  ellipseLine,
  glow,
  icon,
  lerp,
  line,
  mix,
  polyline,
  px,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
} from '../pixel'
import { ball, type Point } from '../scenes'
import { drawSprite, spriteSize, type SpriteLook } from '../sprites'
import { quad, screenFlash, Stage, STEP, W, within, type Cue, type Side, type Timeline } from '../timeline'

const PRISM = ['#ff6b8f', '#ffb23a', '#ffe14d', '#7cf07a', '#4ad7ff', '#8f7bff', '#e07bff']

export interface FormParams {
  own: string
  foe: string
  /** Whose form changes. */
  side: Side
  /** The changing side's sprite before and after. */
  from: string
  to: string
  /** The die the new form gains: its aura takes that colour. */
  die: DieType
  short?: boolean
}

/** Draw one side's Pokémon (the changing one with its own key). */
function drawSide(g: G, s: Stage, side: Side, key: string, o: SpriteLook = {}) {
  const at = side === 'own' ? s.L.own : s.L.foe
  drawSprite(g, key, at.x + (o.dx || 0), at.y + (o.dy || 0), o)
}

// ---------------------------------------------------------------- short: a flash and the new sprite
function flashSwap(p: FormParams, mechanic: 'mega' | 'gmax'): Timeline<Stage> {
  const T_SWAP = 0.25
  return {
    id: `${mechanic}-short`,
    dur: 0.9,
    setup: () => new Stage({ own: p.own, foe: p.foe }, 5),
    step(s, t, dt) {
      s.step(t, dt)
    },
    draw(g, s, t) {
      s.begin(g, t)
      const key = t < T_SWAP ? p.from : p.to
      const flash = t < T_SWAP ? span(t, 0, T_SWAP) : 1 - span(t, T_SWAP, T_SWAP + 0.35)
      for (const side of ['foe', 'own'] as const)
        if (side === p.side) drawSide(g, s, side, key, { flash })
        else drawSide(g, s, side, side === 'own' ? p.own : p.foe)
      s.end(g)
    },
    cues: () => [
      [T_SWAP, () => fxSound('form.flash')],
      [T_SWAP + 0.1, (hud) => hud.form?.(p.side, mechanic)],
    ],
  }
}

// ---------------------------------------------------------------- Mega Evolution
/** The Key Stone (and the Mega Stone it answers): a small orb whose colours turn. */
const STONE_MAP = ['..kkk..', '.kabck.', 'kabcdek', 'kbcdefk', 'kcdefak', '.kefak.', '..kkk..']
const keyStone = (turn: number): Canvas => {
  const pal: Record<string, string> = { k: '#24304f' }
  'abcdef'.split('').forEach((ch, i) => (pal[ch] = PRISM[(i + turn) % PRISM.length]!))
  return icon(STONE_MAP, pal, 1)
}

/** The Mega Evolution symbol: a ring in the seven colours around a white orb crossed by a helix. */
function megaSymbol(g: G, cx: number, cy: number, R: number, t: number) {
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2 + t
    const a1 = a0 + (Math.PI * 2) / 14
    ellipseLine(g, cx, cy, R, R, PRISM[i % PRISM.length]!, a0, a1)
    ellipseLine(g, cx, cy, R - 1, R - 1, PRISM[i % PRISM.length]!, a0, a1)
  }
  ellipse(g, cx, cy, R - 2, R - 2, '#ffffff')
  // The helix: two strands crossing, one dark, one in the ring's colours.
  for (let y = -R + 3; y <= R - 3; y++) {
    const w = Math.sin((y / (R - 2)) * Math.PI) * (R - 4)
    px(g, Math.round(cx + w), cy + y, '#24304f')
    px(g, Math.round(cx - w), cy + y, PRISM[(((y + R) % PRISM.length) + PRISM.length) % PRISM.length]!)
  }
}

/** Two strands of light twisting from a to b, drawn up to `prog`: the Key Stone reaching the Mega Stone. */
function helix(g: G, a: Point, b: Point, prog: number, t: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  const n = Math.round(len / 2)
  for (let i = 0; i <= n * prog; i++) {
    const u = i / n
    const x = lerp(a.x, b.x, u)
    const y = lerp(a.y, b.y, u)
    const amp = 6 * Math.sin(Math.PI * u)
    const w = Math.sin(u * Math.PI * 5 - t * 9)
    for (const side of [1, -1]) {
      const c = PRISM[Math.floor(u * 14 + t * 10 + (side > 0 ? 0 : 3)) % PRISM.length]!
      rect(g, Math.round(x + nx * w * amp * side), Math.round(y + ny * w * amp * side), 2, 2, c)
    }
    if (i % 6 === 0 && Math.abs(w) > 0.4)
      line(
        g,
        Math.round(x + nx * w * amp),
        Math.round(y + ny * w * amp),
        Math.round(x - nx * w * amp),
        Math.round(y - ny * w * amp),
        '#ffffff',
      )
  }
}

type MegaState = Stage & { C: Point; stones: Canvas[]; aura: string[] }

export function megaTimeline(p: FormParams): Timeline<MegaState> {
  const c = typeColor(p.die)
  const aura = ['#ffffff', mix(c, '#ffffff', 0.6), c, mix(c, '#05030a', 0.3)]
  const T_KEY = 0.35
  const T_BEAM = 0.8
  const T_LINK = 1.35
  const T_ORB = 1.7
  const T_SWAP = 2.2
  const T_CRACK = 3.35
  const T_BURST = 3.8
  const T_MSG = 4.05
  const swaps: number[] = []
  for (let t = T_SWAP, k = 0.32; t < T_CRACK; k = Math.max(0.05, k * 0.8)) swaps.push((t += k))
  const formAt = (t: number) => swaps.filter((s) => s <= t).length % 2
  // The trainer holds the Key Stone just off the stage: bottom left for you, top right for the foe's trainer.
  const KEY = p.side === 'own' ? { x: 14, y: 148 } : { x: W - 14, y: 12 }
  const feet = (s: Stage) => (p.side === 'own' ? s.L.own : s.L.foe)
  const centre = (s: Stage, key: string) => {
    const sz = spriteSize(key)
    return { x: feet(s).x, y: feet(s).y - sz.h * 0.55 }
  }
  return {
    id: 'mega',
    dur: 6.6,
    setup() {
      const st = new Stage({ own: p.own, foe: p.foe }, 61)
      st.screenShakes = [[T_BURST, 0.45, 3]]
      return Object.assign(st, { C: centre(st, p.from), stones: PRISM.map((_, i) => keyStone(i)), aura })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      const key = t < T_BURST ? p.from : p.to
      const sz = spriteSize(key)
      s.C = centre(s, key)
      const C = s.C
      // Prismatic motes drawn into the sphere while it forms.
      if (within(t, T_ORB, T_CRACK) && r() < 0.7) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: C.x + Math.cos(a) * 90,
          y: C.y + Math.sin(a) * 70,
          home: { x: C.x, y: C.y, k: 300 },
          life: 1.2,
          size: r.int(1, 2),
          shape: r() < 0.3 ? 'plus' : 'sq',
          colors: [PRISM[r.int(0, 6)]!, '#ffffff'],
        })
      }
      if (t >= T_BURST && t < T_BURST + STEP * 1.5)
        for (let k = 0; k < 60; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(60, 170)
          s.fx.add({
            x: C.x + Math.cos(a) * 20,
            y: C.y + Math.sin(a) * 20,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 30,
            ay: 160,
            drag: 1.6,
            life: r.range(0.7, 1.2),
            size: r.int(1, 3),
            shape: k % 4 ? 'sq' : 'star',
            colors: [PRISM[k % 7]!, '#ffffff'],
          })
        }
      // The new form's aura: flames of its colour licking upward.
      if (t > T_BURST + 0.2 && r() < 0.55)
        s.fx.add({
          x: C.x + r.range(-sz.w * 0.42, sz.w * 0.42),
          y: feet(s).y - r.range(4, sz.h * 0.7),
          vx: r.range(-6, 6),
          vy: r.range(-50, -25),
          drag: 0.6,
          life: r.range(0.4, 0.8),
          size: r.int(1, 2),
          size1: 0,
          shape: 'sq',
          colors: s.aura,
        })
    },
    draw(g, s, t) {
      s.begin(g, t)
      const C = s.C
      const at = feet(s)
      const dim =
        t < T_ORB
          ? 0
          : t < T_BURST
            ? 0.5 * span(t, T_ORB, T_ORB + 0.5)
            : 0.5 * (1 - span(t, T_BURST, T_BURST + 0.8))
      // The other side first if it is behind (the foe's platform is further away).
      const other: Side = p.side === 'own' ? 'foe' : 'own'
      const drawOther = () => drawSide(g, s, other, other === 'own' ? p.own : p.foe)
      if (other === 'foe') drawOther()
      if (dim > 0) wash(g, '#0a0820', dim, 12)
      // The sphere's light behind.
      if (within(t, T_ORB, T_BURST)) {
        const q = span(t, T_ORB, T_ORB + 0.45)
        const R = Math.round(10 + 44 * ease.outBack(q, 1.6) + Math.sin(t * 9) * (t > T_CRACK ? 2 : 1))
        g.drawImage(glow(R, '#ffffff', 1.4, 0.35 + 0.3 * span(t, T_SWAP, T_CRACK)), C.x - R, C.y - R)
      }
      if (t < T_ORB) drawSide(g, s, p.side, p.from, { flash: span(t, T_ORB - 0.35, T_ORB) })
      else if (t < T_BURST) {
        const key = t < T_SWAP || formAt(t) === 0 ? p.from : p.to
        drawSide(g, s, p.side, key, { sil: '#ffffff', outline: PRISM[Math.floor(t * 12) % 7] })
      } else drawSide(g, s, p.side, p.to, { flash: 1 - span(t, T_BURST + 0.05, T_BURST + 0.55) })
      if (other === 'own') drawOther()
      // The sphere's rim: arcs in the seven colours, turning; cracks before it breaks.
      if (within(t, T_ORB, T_BURST)) {
        const q = span(t, T_ORB, T_ORB + 0.45)
        const R = Math.round(10 + 44 * ease.outBack(q, 1.6))
        for (let i = 0; i < 14; i++) {
          const a0 = (i / 14) * Math.PI * 2 + t * 2.2
          const a1 = a0 + (Math.PI * 2) / 14 - 0.05
          ellipseLine(g, C.x, C.y, R, R, PRISM[i % 7]!, a0, a1)
          if (i % 2) ellipseLine(g, C.x, C.y, R - 2, R - 2, '#ffffff', a0, a1)
        }
        if (t > T_CRACK) {
          const k = span(t, T_CRACK, T_BURST)
          const r = rng(13)
          for (let i = 0; i < 6; i++) {
            const a = r() * Math.PI * 2
            polyline(
              g,
              bolt(
                r,
                C.x + Math.cos(a) * R,
                C.y + Math.sin(a) * R,
                C.x + Math.cos(a) * R * (1 - 0.7 * k),
                C.y + Math.sin(a) * R * (1 - 0.7 * k),
                0.4,
                3,
              ),
              '#ffffff',
            )
          }
        }
      }
      // The Key Stone and the strands to the Mega Stone.
      const stone = s.stones[Math.floor(t * 8) % 7]!
      const fs = spriteSize(p.from)
      const chest = { x: at.x - fs.w / 2 + fs.w * 0.55, y: at.y - fs.h + fs.h * 0.35 }
      if (within(t, T_KEY - 0.2, T_ORB + 0.3)) {
        const k = span(t, T_KEY - 0.2, T_KEY + 0.1)
        g.drawImage(glow(10, PRISM[Math.floor(t * 8) % 7]!, 1.5, 0.7 * k), KEY.x - 10, KEY.y - 10)
        g.drawImage(stone, KEY.x - 3, KEY.y - 3)
        g.drawImage(glow(7, '#ffffff', 1.5, 0.5 * k), Math.round(chest.x - 7), Math.round(chest.y - 7))
        g.drawImage(stone, Math.round(chest.x - 3), Math.round(chest.y - 3))
      }
      if (within(t, T_BEAM, T_ORB + 0.2)) helix(g, KEY, chest, span(t, T_BEAM, T_LINK), t)
      s.fx.draw(g)
      // The symbol flares above the new form.
      if (within(t, T_BURST + 0.05, T_BURST + 1.6)) {
        const q = span(t, T_BURST + 0.05, T_BURST + 0.35)
        const R = Math.max(3, Math.round(11 * ease.outBack(q, 2.2)))
        const out = t > T_BURST + 1.3 && Math.floor(t * 20) % 2
        if (!out)
          megaSymbol(
            g,
            Math.round(C.x + 4),
            Math.max(14, Math.round(at.y - spriteSize(p.to).h - 12)),
            R,
            t * 1.5,
          )
      }
      s.end(g)
      if (within(t, T_BURST, T_BURST + 0.45)) screenFlash(g, '#ffffff', 1 - span(t, T_BURST, T_BURST + 0.45))
    },
    cues: () => {
      const c: Cue<MegaState>[] = [
        [T_KEY, () => fxSound('mega.key')],
        [T_BEAM, () => fxSound('mega.beam')],
        [T_ORB, (hud) => (hud.beat?.('changing'), fxSound('mega.orb'))],
        [T_CRACK, () => fxSound('mega.crack')],
        [T_BURST, () => fxSound('mega.burst')],
        [T_MSG + 0.1, (hud) => hud.form?.(p.side, 'mega')],
      ]
      swaps.forEach((sw, i) => c.push([sw, () => fxSound('mega.swap', i)]))
      for (let i = 0; i < 4; i++) c.push([T_MSG + 0.05 + i * 0.12, () => fxSound('mega.fanfare', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}

// ---------------------------------------------------------------- Gigantamax
/** The Dynamax sky: crimson clouds rolling over the top of the stage, built once. */
function dynamaxSky(): Canvas {
  return cached('dynamax-sky', () => {
    const c = canvas(W * 2, 64)
    const r = rng(77)
    const g = c.g
    for (let i = 0; i < 46; i++) {
      const x = r.int(0, W * 2)
      const y = r.int(-6, 34)
      const rx = r.int(14, 34)
      const ry = r.int(6, 13)
      ellipse(g, x, y + 3, rx, ry, '#3a0718')
      ellipse(g, x, y, rx - 2, ry - 2, '#6a1030')
      ellipse(g, x - 3, y - 3, rx - 8, ry - 5, '#a01c48')
      if (r() < 0.5) ellipseLine(g, x - 3, y - 3, rx - 8, ry - 5, '#ff5f8f', Math.PI * 1.1, Math.PI * 1.7)
    }
    // Wrap the seam so it scrolls without a jump.
    g.drawImage(c, 0, 0, W, 64, W, 0, W, 64)
    return c
  })
}

/** A small red cloud of the Gigantamax crown. */
function crownCloud(g: G, x: number, y: number, k: number) {
  const n = (v: number) => Math.max(1, Math.round(v * k))
  ellipse(g, x, y + n(2), n(11), n(4), '#3a0718')
  ellipse(g, x - n(5), y - n(1), n(6), n(4), '#8a1638')
  ellipse(g, x + n(5), y - n(1), n(6), n(4), '#8a1638')
  ellipse(g, x, y - n(3), n(6), n(5), '#b0204e')
  ellipseLine(g, x, y - n(3), n(6), n(5), '#ff7ab0', Math.PI * 1.05, Math.PI * 1.75)
  ellipseLine(g, x - n(5), y - n(1), n(6), n(4), '#ff7ab0', Math.PI * 1.1, Math.PI * 1.5)
  px(g, x - n(2), y - n(6), '#ffd0de')
}

type GmaxState = Stage & { sky: Canvas; spark: string[] }

/** Gigantamax happens on your side: the trainer's ball sits bottom left. */
export function gmaxTimeline(p: FormParams): Timeline<GmaxState> {
  const c = typeColor(p.die)
  const spark = ['#ffffff', mix(c, '#ffffff', 0.55), c]
  const BP = { x: 30, y: 128 }
  const T_RECALL = 0.35
  const T_IN = 0.8
  const T_GROW = 1.0
  const T_THROW = 2.1
  const T_OPEN = 2.55
  const T_SKY = 2.3
  const T_RISE = 2.75
  const T_REVEAL = 3.9
  const T_MSG = 4.15
  // Below the foe's plate, so nothing hides the ball opening.
  const APEX = { x: 66, y: 48 }
  return {
    id: 'gmax',
    dur: 7.2,
    setup() {
      const st = new Stage({ own: p.own, foe: p.foe }, 67)
      st.screenShakes = [
        [T_RISE + 0.25, 0.25, 2],
        [T_RISE + 0.6, 0.25, 2],
        [T_RISE + 0.95, 0.25, 2],
        [T_REVEAL, 0.6, 4],
      ]
      return Object.assign(st, { sky: dynamaxSky(), spark })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      const big = spriteSize(p.to)
      // Energy pours into the ball from every edge.
      if (within(t, T_GROW, T_THROW) && r() < 0.9) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: BP.x + Math.cos(a) * 140,
          y: BP.y + Math.sin(a) * 110,
          home: { x: BP.x, y: BP.y, k: 380 },
          life: 1.1,
          size: r.int(1, 2),
          shape: r() < 0.3 ? 'plus' : 'sq',
          colors: ['#ffffff', '#ff7ab0', '#ff2d6f', '#c2185b'],
        })
      }
      if (t >= T_REVEAL && t < T_REVEAL + STEP * 1.5)
        for (let k = 0; k < 40; k++) {
          const a = Math.PI + r() * Math.PI
          const sp = r.range(50, 140)
          s.fx.add({
            x: s.L.own.x + r.range(-30, 30),
            y: s.L.own.y - 6,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.6,
            ay: 140,
            drag: 1.4,
            life: r.range(0.5, 1),
            size: r.int(1, 3),
            shape: 'sq',
            colors: k % 2 ? ['#ff7ab0', '#c2185b'] : ['#e8d8c0', '#8a7a68'],
          })
        }
      // Red energy rising off the giant, sparks of its type.
      if (t > T_REVEAL + 0.2 && r() < 0.6)
        s.fx.add({
          x: s.L.own.x + r.range(-big.w * 0.45, big.w * 0.45),
          y: s.L.own.y - r.range(2, big.h * 0.8),
          vx: r.range(-5, 5),
          vy: r.range(-40, -18),
          life: r.range(0.4, 0.9),
          size: r.int(1, 2),
          size1: 0,
          shape: r() < 0.25 ? 'plus' : 'sq',
          colors: r() < 0.3 ? s.spark : ['#ffb3c8', '#ff2d6f', '#8a1030'],
        })
    },
    draw(g, s, t) {
      s.begin(g, t)
      // The sky and the field go red; the clouds come down and drift.
      const red = span(t, T_SKY, T_SKY + 0.7)
      if (red > 0) {
        wash(g, '#2a0612', 0.45 * red, 12)
        const yy = Math.round(-64 + 64 * ease.outC(red))
        const off = Math.round(t * 6) % W
        g.drawImage(s.sky, off, 0, W, 64, 0, yy, W, 64)
      }
      drawSide(g, s, 'foe', p.foe, red > 0 ? { tint: { color: '#ff2d6f', a: 0.12 * red } } : {})
      const big = spriteSize(p.to)
      const cx = s.L.own.x
      const gy = s.L.own.y
      // The recall: red, shrinking toward the ball.
      if (t < T_RECALL) drawSide(g, s, 'own', p.from)
      else if (t < T_IN) {
        const q = span(t, T_RECALL, T_IN)
        const x = Math.round(lerp(cx, BP.x, ease.inQ(q)))
        const y = Math.round(lerp(gy, BP.y + 8, ease.inQ(q)))
        line(g, BP.x, BP.y, x, y - 20 * (1 - q), '#ff2d6f')
        drawSprite(g, p.from, x, y, {
          sil: '#ff2d6f',
          outline: '#ffb3c8',
          sx: 1 - q * 0.92,
          sy: 1 - q * 0.92,
        })
      }
      // The column of red light from the open ball.
      if (within(t, T_OPEN, T_REVEAL + 0.3)) {
        const k = t < T_REVEAL ? span(t, T_OPEN, T_OPEN + 0.2) : 1 - span(t, T_REVEAL, T_REVEAL + 0.3)
        const w = Math.round(14 + 30 * span(t, T_OPEN, T_REVEAL))
        ditherFill(g, cx - w, APEX.y, w * 2, gy - APEX.y, '#ff2d6f', 0.45 * k)
        ditherFill(g, cx - (w >> 1), APEX.y, w, gy - APEX.y, '#ffd0de', 0.35 * k)
      }
      // The giant: a red silhouette growing in steps, then the form itself.
      if (within(t, T_RISE, T_REVEAL)) {
        const steps = [0.3, 0.55, 0.8, 1]
        const i = Math.min(3, Math.floor(span(t, T_RISE, T_REVEAL - 0.15) * 4))
        const q = span(t, T_RISE + i * 0.3, T_RISE + i * 0.3 + 0.18)
        const k = lerp(i ? steps[i - 1]! : 0.1, steps[i]!, ease.outBack(q, 2))
        drawSprite(g, p.to, cx, gy, { sil: '#ff2d6f', outline: '#ffb3c8', sx: k, sy: k })
      }
      // The cloud crown: behind the head first, the giant, then the clouds in front.
      const crown = t > T_REVEAL + 0.1
      const crownAt = (i: number) => {
        const a = t * 1.8 + (i * Math.PI * 2) / 4
        return {
          x: Math.round(cx + Math.cos(a) * big.w * 0.46),
          y: Math.round(gy - big.h + 2 + Math.sin(a) * 6),
          front: Math.sin(a) > 0,
        }
      }
      const k = span(t, T_REVEAL + 0.1, T_REVEAL + 0.5)
      if (crown)
        for (let i = 0; i < 4; i++)
          if (!crownAt(i).front) crownCloud(g, crownAt(i).x, Math.max(6, crownAt(i).y), k > 0.5 ? 1 : 0.7)
      if (t >= T_REVEAL) {
        if (t > T_REVEAL + 0.1)
          g.drawImage(
            glow(40, '#ff2d6f', 1.6, 0.35 + 0.1 * Math.sin(t * 6)),
            cx - 40,
            Math.round(gy - big.h * 0.5 - 40),
          )
        drawSide(g, s, 'own', p.to, {
          flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.5),
          dy: Math.round(Math.sin(t * 2.4)),
        })
      }
      if (crown)
        for (let i = 0; i < 4; i++)
          if (crownAt(i).front) crownCloud(g, crownAt(i).x, Math.max(6, crownAt(i).y), k > 0.5 ? 1 : 0.7)
      // The shockwave on the ground.
      const q = span(t, T_REVEAL, T_REVEAL + 0.6)
      if (q > 0 && q < 1)
        ellipseLine(
          g,
          cx,
          gy - 4,
          Math.round(20 + 90 * ease.outC(q)),
          Math.round(4 + 14 * ease.outC(q)),
          q < 0.5 ? '#ffffff' : '#ff7ab0',
        )
      // The ball: at the trainer's side, swelling, then thrown up and open.
      if (within(t, T_IN - 0.1, T_OPEN + 0.5)) {
        let x = BP.x
        let y = BP.y
        let R = 6
        let ang = 0
        let open = 0
        if (t < T_THROW) {
          R = Math.round(6 + 16 * ease.outQ(span(t, T_GROW, T_THROW - 0.15)))
          ang = Math.sin(t * 30) * 0.12 * span(t, T_GROW, T_THROW)
          x += Math.round(Math.sin(t * 40) * (t > T_GROW ? 1 : 0))
        } else {
          const u = span(t, T_THROW, T_OPEN)
          const pt = quad({ x: BP.x, y: BP.y }, { x: 8, y: 20 }, APEX, ease.outQ(u))
          x = pt.x
          y = pt.y
          R = Math.round(lerp(22, 14, u))
          ang = u * Math.PI * 3
          open = span(t, T_OPEN, T_OPEN + 0.2)
        }
        if (t > T_GROW)
          g.drawImage(glow(R + 10, '#ff2d6f', 1.4, 0.6), Math.round(x - R - 10), Math.round(y - R - 10))
        const b = ball('poke', ang, { R, open, button: t > T_GROW ? '#ff7ab0' : '#ffffff' })
        if (t < T_OPEN + 0.5)
          g.drawImage(b, Math.round(x - (b.width - 1) / 2), Math.round(y - (b.height - 1) / 2))
        // Red lightning crackles around it while it swells.
        if (within(t, T_GROW, T_THROW) && Math.floor(t * 20) % 3 === 0) {
          const r = rng(Math.floor(t * 20))
          const a = r() * Math.PI * 2
          polyline(
            g,
            bolt(r, x, y, x + Math.cos(a) * (R + 14), y + Math.sin(a) * (R + 14), 0.45, 3),
            '#ffb3c8',
          )
        }
      }
      s.fx.draw(g)
      s.end(g)
      if (within(t, T_REVEAL, T_REVEAL + 0.4))
        screenFlash(g, '#ffffff', 1 - span(t, T_REVEAL, T_REVEAL + 0.4))
    },
    cues: () => {
      const c: Cue<GmaxState>[] = [
        [T_RECALL, () => fxSound('gmax.recall')],
        [T_GROW, () => fxSound('gmax.grow')],
        [T_THROW - 0.2, (hud) => hud.beat?.('dynamax')],
        [T_THROW, () => fxSound('gmax.throw')],
        [T_OPEN, () => fxSound('gmax.open')],
        [T_RISE + 0.25, () => fxSound('gmax.step')],
        [T_RISE + 0.6, () => fxSound('gmax.step')],
        [T_RISE + 0.95, () => fxSound('gmax.step')],
        [T_REVEAL, () => fxSound('gmax.reveal')],
        [T_MSG + 0.1, (hud) => hud.form?.('own', 'gmax')],
      ]
      for (let i = 0; i < 4; i++) c.push([T_MSG + 0.05 + i * 0.14, () => fxSound('gmax.fanfare', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}

/** The G-Max form ends: it shrinks back in red steps to its own form. */
export function gmaxEndTimeline(p: FormParams): Timeline<Stage> {
  const at = (s: Stage) => (p.side === 'own' ? s.L.own : s.L.foe)
  const T_END = 1.0
  return {
    id: 'gmax-end',
    dur: p.short ? 0.6 : 1.5,
    setup: () => new Stage({ own: p.own, foe: p.foe }, 9),
    step(s, t, dt) {
      s.step(t, dt)
    },
    draw(g, s, t) {
      s.begin(g, t)
      const other: Side = p.side === 'own' ? 'foe' : 'own'
      if (other === 'foe') drawSide(g, s, 'foe', p.foe)
      const L = at(s)
      if (p.short)
        drawSide(g, s, p.side, t < 0.25 ? p.from : p.to, {
          flash: t < 0.25 ? span(t, 0, 0.25) : 1 - span(t, 0.25, 0.55),
        })
      else if (t < T_END) {
        // The giant as a red silhouette, shrinking in three steps to the size of its own form.
        const big = spriteSize(p.from)
        const small = spriteSize(p.to)
        const goal = Math.max(0.3, small.h / Math.max(1, big.h))
        const i = Math.min(2, Math.floor(span(t, 0.1, T_END) * 3))
        const k = lerp(1, goal, (i + ease.outQ(span(t, 0.1 + i * 0.3, 0.3 + i * 0.3))) / 3)
        drawSprite(g, p.from, L.x, L.y, { sil: '#ff2d6f', outline: '#ffb3c8', sx: k, sy: k })
      } else drawSide(g, s, p.side, p.to, { flash: 1 - span(t, T_END, T_END + 0.35) })
      if (other === 'own') drawSide(g, s, 'own', p.own)
      s.end(g)
    },
    cues: () => [
      [0.05, () => fxSound('gmax.shrink')],
      [p.short ? 0.3 : T_END, (hud) => hud.formEnd?.(p.side)],
    ],
  }
}

/** The form change for a motion level: the full timeline, or the short flash-and-swap. */
export const megaFor = (p: FormParams) => (p.short ? flashSwap(p, 'mega') : megaTimeline(p))
export const gmaxFor = (p: FormParams) =>
  // A trainer's Gigantamax has no ball at your side to come from: it changes with the flash.
  p.short || p.side === 'foe' ? flashSwap(p, 'gmax') : gmaxTimeline(p)
