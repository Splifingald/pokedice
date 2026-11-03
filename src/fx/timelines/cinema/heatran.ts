// Heatran's raid entrance (docs/53): the magma chamber under Stark Mountain. A cavern shut in by a low ceiling of black
// rock, stalactites lit red at their tips, iron veins glinting in the walls, a lake of molten rock below flowing in
// bright rivers between dark crust, bubbles swelling and bursting. Then, overhead: clang. Clang. Something is walking
// on the ceiling, upside down, its feet leaving glowing footprints in the rock and dust raining from each step,
// molten drips falling from it into the lake. It stops over the middle; the rock round it glows red-hot and cracks, the
// lake below swells. It lets go, turns over as it falls and lands on the rock island with a crown of magma thrown up
// round it; the magma whirls up into a storm of fire round it (Magma Storm), and the reveal blows it out. Heatran
// stands red-hot on its rock, cooling to its own colours, steaming.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, inOrder, tri, type Cinema, type CinemaParams } from './kit'

/** Its steps on the ceiling. */
const STEPS = [1.1, 1.45, 1.8, 2.1, 2.4, 2.65] as const
const T_HEAT = 2.9
const T_DROP = 3.5
const T_LAND = 3.85
const REVEAL = 4.75
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffd0a0', '#e05a1e', '#6a1a06'] as const
/** Fire and molten rock, hottest first. */
const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const

type S = {
  r: Rng
  fx: Particles
  back: Canvas
  magma: Canvas
  rays: Canvas
  bubbles: { x: number; y: number; at: number; r: number; done?: boolean }[]
  /** The flames whirling round it in the storm: a phase each. */
  storm: { a: number; h: number; v: number; s: number }[]
  shakes: [number, number, number][]
}

export const heatranCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const many = p.short ? 0.4 : 1
    const sz = spriteSize(p.mon)
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    /** The ceiling's underside, where it walks. */
    const roof = Math.round(h * 0.2)
    const lake = Math.round(h * 0.5)
    const feet = Math.round(h * 0.62)
    const my = Math.round(feet - sz.h * 0.5)
    /** Where it is on the ceiling: a lurch forward with each step, from off the left edge to over the middle. */
    const walkX = (t: number) => {
      let k = 0
      STEPS.forEach((at, i) => (k += ease.outQ(span(t, at, at + 0.22)) * (i < STEPS.length ? 1 : 0)))
      return Math.round(lerp(-sz.w * 0.6, cx, k / STEPS.length))
    }
    return {
      id: 'cinema-heatran',
      dur: DUR,
      setup() {
        const r = rng(485)
        const back = canvas(w, h)
        const g = back.g
        // The chamber's back wall, lit red from below by the lake.
        g.drawImage(dGradient(w, lake, ['#0a0303', '#160605', '#2a0c07', '#4a1a0c']), 0, 0)
        // Strata and boulders in the rock.
        for (let i = 0; i < Math.round((w * lake) / 120); i++) {
          const y = r.range(roof, lake)
          const rx = Math.round(r.range(3, 10))
          ellipse(
            g,
            r.range(0, w),
            y,
            rx,
            Math.max(1, Math.round(rx * 0.4)),
            y > lake * 0.8 ? '#5a2010' : '#1e0806',
          )
        }
        // Iron veins: grey streaks with glints, the metal it is made of.
        for (let k = 0; k < Math.max(3, Math.round(w / 45)); k++) {
          let x = r.range(0, w)
          let y = r.range(roof + 6, lake - 6)
          const a = r.range(-0.6, 0.6)
          for (let i = 0; i < r.range(16, 40); i++) {
            x += Math.cos(a) + r.range(-0.5, 0.5)
            y += Math.sin(a) + r.range(-0.6, 0.6)
            rect(g, x, y, 2, 1, '#4a4a54')
            if (r() < 0.12) rect(g, x, y - 1, 1, 1, '#c8ccd8')
          }
        }
        // Seams of magma glowing in the wall.
        for (let k = 0; k < Math.max(2, Math.round(w / 70)); k++) {
          let x = r.range(w * 0.05, w * 0.95)
          for (let y = lake; y > lake - r.range(h * 0.08, h * 0.22); y--) {
            x += r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0
            rect(g, x, y, 1, 1, y % 3 ? '#e0501e' : '#ffbe2e')
          }
        }
        // Stalagmites standing out of the lake each side, nearer and taller to the edges.
        for (const side of [-1, 1])
          for (let k = 0; k < 3; k++) {
            const x = Math.round(cx + side * (w * 0.28 + k * w * 0.1))
            const hh = Math.round(h * (0.1 + k * 0.05))
            const hw = Math.round(5 + k * 3)
            tri(g, x - hw, lake + 2, x + hw, lake + 2, x + side * 2, lake - hh, '#140504')
            tri(g, x - side * hw, lake + 2, x + side * 2, lake - hh, x, lake + 2, '#3a1208')
            rect(g, x - hw, lake, hw * 2, 2, '#ff6a1e')
          }
        // The ceiling: black rock down to its jagged underside, stalactites hanging, their tips lit red.
        for (let x = 0; x < w; x++) {
          const y = Math.round(roof + Math.sin(x * 0.21) * 2 + Math.sin(x * 0.05 + 1) * 3)
          rect(g, x, 0, 1, y, '#0a0403')
          rect(g, x, y, 1, 1, '#4a160a')
        }
        // Its rock: slabs and boulders, their undersides catching the lake's light.
        for (let i = 0; i < Math.round((w * roof) / 70); i++) {
          const x = r.range(-6, w + 6)
          const y = r.range(2, roof - 2)
          const rx = Math.round(r.range(4, 12))
          const ry = Math.max(2, Math.round(rx * r.range(0.3, 0.5)))
          ellipse(g, x, y + 1, rx, ry, y > roof * 0.6 ? '#2e0e08' : '#1a0806')
          ellipse(g, x, y, rx - 1, ry - 1, '#120504')
        }
        for (let i = 0; i < Math.round(w / 14); i++) {
          const x = Math.round(r.range(0, w))
          if (Math.abs(x - cx) < sz.w * 0.5) continue
          const len = Math.round(r.range(h * 0.03, h * 0.1))
          const hw = Math.round(r.range(2, 5))
          tri(g, x - hw, roof - 2, x + hw, roof - 2, x, roof + len, '#0c0403')
          rect(g, x, roof + len - 2, 1, 2, '#c4421a')
        }
        const magma = magmaFlow(w, h - lake, r)
        return {
          r,
          fx: new Particles(),
          back,
          magma,
          rays: canvas(w, h),
          bubbles: [],
          storm: Array.from({ length: Math.round(110 * many) }, () => ({
            a: r() * 6.3,
            h: r(),
            v: r.range(0.6, 1.2),
            s: r.range(0.8, 1.2),
          })),
          shakes: p.short
            ? []
            : [
                ...STEPS.map((at, i) => [at, 0.18, 1 + (i >> 1)] as [number, number, number]),
                [T_HEAT + 0.3, 0.5, 1],
                [T_LAND, 0.8, 6],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Bubbles swelling in the lake, bursting into a splash; more as it heats.
        const rate = 0.08 + 0.4 * span(t, T_HEAT, T_LAND)
        if (r() < rate * many * 2) {
          const d = r()
          s.bubbles.push({
            x: r.range(0, w),
            y: lake + 3 + d * d * (h - lake - 6),
            at: t,
            r: Math.round(lerp(2, 6, d)),
          })
        }
        for (const b of s.bubbles)
          if (!b.done && t > b.at + 0.5) {
            b.done = true
            for (let i = 0; i < 6; i++)
              s.fx.add({
                x: b.x,
                y: b.y - b.r,
                vx: r.range(-25, 25),
                vy: -r.range(30, 70),
                ay: 240,
                life: 0.5,
                size: 1,
                shape: 'sq',
                colors: [FIRE[1], FIRE[3], FIRE[5]],
              })
          }
        s.bubbles = s.bubbles.filter((b) => !b.done)
        // Embers always rising off the lake.
        if (r() < 0.6 * many)
          s.fx.add({
            x: r.range(0, w),
            y: r.range(lake, h),
            vx: r.range(-6, 6),
            vy: -r.range(15, 35),
            life: r.range(1.2, 2.2),
            size: 1,
            shape: 'px',
            colors: [FIRE[1], FIRE[3], FIRE[5]],
          })
        // Each step: dust and pebbles out of the ceiling where it set its foot.
        STEPS.forEach((at, i) => {
          if (!within(t, at, at + dt)) return
          const x = walkX(at + 0.25) + (i % 2 ? sz.w * 0.25 : -sz.w * 0.25)
          for (let k = 0; k < 14 * many; k++)
            s.fx.add({
              x: x + r.range(-5, 5),
              y: roof + 1,
              vx: r.range(-15, 15),
              vy: r.range(0, 30),
              ay: 260,
              life: r.range(0.6, 1.2),
              size: k % 4 ? 1 : 2,
              shape: 'sq',
              colors: ['#6a3a2a', '#3a1a10'],
            })
        })
        // Molten drips falling off it as it crawls and while it heats the rock.
        if (t > STEPS[0] && t < T_DROP && r() < 0.2 * many)
          s.fx.add({
            x: walkX(t) + r.range(-sz.w * 0.35, sz.w * 0.35),
            y: roof + sz.h * r.range(0.4, 0.8),
            vy: 20,
            ay: 300,
            life: 1.2,
            size: 1,
            shape: 'streak',
            trail: 0.02,
            colors: [FIRE[1], FIRE[2], FIRE[3]],
          })
        // The drop: a trail of fire behind it.
        if (t > T_DROP && t < T_LAND)
          for (let i = 0; i < 4 * many; i++)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.3, sz.w * 0.3),
              y: lerp(roof + sz.h * 0.5, my, span(t, T_DROP, T_LAND)) + r.range(-8, 8),
              vy: -r.range(10, 40),
              life: 0.4,
              size: 2,
              size1: 0,
              shape: 'sq',
              colors: [...FIRE],
            })
        // The landing: a crown of magma thrown up round the island.
        if (within(t, T_LAND, T_LAND + dt))
          for (let i = 0; i < 170 * many; i++) {
            const side = r() < 0.5 ? -1 : 1
            const a = -Math.PI / 2 + side * r.range(0.2, 1.3)
            const v = r.range(90, 280)
            s.fx.add({
              x: cx + side * r.range(sz.w * 0.3, sz.w * 0.6),
              y: feet + 2,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 330,
              life: r.range(0.8, 1.4),
              size: r.int(1, 3),
              shape: r() < 0.6 ? 'sq' : 'drop',
              colors: [...FIRE],
            })
          }
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 70 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(80, 220)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.2,
              life: r.range(0.6, 1.1),
              size: r.int(1, 3),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...FIRE],
            })
          }
        // Steam off its cooling metal.
        if (t > REVEAL && r() < 0.5 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.4, sz.w * 0.4),
            y: feet - r.range(sz.h * 0.4, sz.h),
            vx: r.range(-5, 5),
            vy: -r.range(10, 22),
            life: 1.4,
            size: r.int(2, 4),
            shape: 'smoke',
            colors: ['#a89890', '#6a5a54', '#3a2e2a'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#080303'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.back, 0, 0)
        // The lake of molten rock, drifting, brighter as it heats.
        const off = Math.round(w * 0.5 + Math.sin(t * 0.35) * w * 0.3)
        g.drawImage(s.magma, off, 0, w, h - lake, 0, lake, w, h - lake)
        const swell = span(t, T_HEAT, T_DROP) * (1 - span(t, T_LAND, T_LAND + 0.3))
        if (swell > 0) {
          const R = Math.round(Math.max(sz.w * 0.7, m * 0.24) * swell)
          const gr = Math.max(4, R & ~1)
          g.drawImage(
            glow(gr, FIRE[1], 1.2, 0.85),
            cx - gr,
            feet + 2 - Math.round(gr * 0.5),
            gr * 2 + 1,
            gr + 1,
          )
        }
        for (const b of s.bubbles) {
          const k = span(t, b.at, b.at + 0.5)
          const rr = Math.max(1, Math.round(b.r * k))
          ellipse(g, b.x, b.y - rr, rr, rr, FIRE[4])
          ellipse(g, b.x - 1, b.y - rr - 1, Math.max(1, rr - 1), Math.max(1, rr - 1), FIRE[2])
          rect(g, b.x - 1, b.y - rr * 2 + 1, 1, 1, FIRE[0])
        }
        rect(g, 0, lake, w, 1, FIRE[2])
        // Its glowing footprints in the ceiling, cooling from white-hot to a dull red.
        STEPS.forEach((at, i) => {
          if (t < at) return
          const x = walkX(at + 0.25) + (i % 2 ? sz.w * 0.25 : -sz.w * 0.25)
          const age = t - at
          const c = FIRE[Math.min(6, Math.floor(age * 3))]!
          ellipse(g, x, roof + 1, 3, 1, c)
          if (age < 0.4) g.drawImage(glow(8, FIRE[2], 1.4, 0.7), Math.round(x) - 8, roof - 7)
        })
        // The rock round it heating to red then white, cracks running out from it.
        const heat = span(t, T_HEAT, T_DROP)
        if (heat > 0 && t < T_LAND + 0.6) {
          const gr = Math.round(m * 0.22 * (0.4 + 0.6 * heat)) & ~1
          const fade = 1 - span(t, T_DROP, T_LAND + 0.6)
          g.drawImage(glow(gr, heat > 0.6 ? FIRE[1] : FIRE[3], 1.3, 0.85 * fade), cx - gr, roof - gr)
          for (let k = 0; k < 7; k++) {
            const a = Math.PI * (k / 6)
            const len = m * 0.3 * heat
            const rr = rng(k + 5)
            let x = cx
            let y = roof
            for (let i = 0; i < len / 3; i++) {
              const nx = x + Math.cos(a) * 3 + rr.range(-2, 2)
              const ny = y - Math.abs(Math.sin(a)) * 0.6 + rr.range(-1, 1)
              line(g, x, y, nx, ny, i % 2 ? FIRE[2] : FIRE[3])
              x = nx
              y = Math.min(roof, ny)
            }
          }
        }
        // It, on the ceiling: upside down, its feet on the rock, crawling; then falling and turning over.
        if (t > STEPS[0] - 0.4 && t < T_DROP) {
          const x = walkX(t)
          const sway = Math.round(Math.sin(t * 9) * (t < STEPS[STEPS.length - 1]! + 0.2 ? 1 : 0))
          g.save()
          g.translate(0, 2 * roof)
          g.scale(1, -1)
          drawSprite(g, p.mon, x + sway, roof, {
            sil: heat > 0.3 ? '#4a1408' : '#260905',
            outline: Math.floor(t * 10) % 3 ? FIRE[4] : heat > 0.3 ? FIRE[1] : FIRE[3],
          })
          g.restore()
        }
        if (t >= T_DROP && t < T_LAND + 0.05) {
          const q = span(t, T_DROP, T_LAND)
          const y = lerp(roof + sz.h * 0.5, my, ease.inQ(q))
          const sy = -Math.cos(Math.PI * Math.min(1, q * 1.3))
          g.save()
          g.translate(cx, Math.round(y))
          g.scale(1, Math.abs(sy) < 0.15 ? 0.15 * Math.sign(sy || 1) : sy)
          drawSprite(g, p.mon, 0, Math.round(sz.h / 2), { sil: '#5a1a0a', outline: FIRE[2] })
          g.restore()
        }
        // The island it lands on.
        island(g, cx, feet, Math.round(Math.max(sz.w * 0.48, m * 0.14)), t > T_LAND)
        // Magma Storm: the lake whirling up round it in rings and tongues of fire.
        const st = span(t, T_LAND + 0.05, T_LAND + 0.4) * (1 - span(t, REVEAL, REVEAL + 0.25))
        const H = sz.h * 1.8
        const SR = Math.min(sz.w * 0.6, w * 0.4) * st
        if (st > 0) whirl(g, s, t, cx, feet, H, SR, false)
        if (t > T_LAND && t < REVEAL) {
          drawSprite(g, p.mon, cx, feet, {
            sil: Math.floor(t * 14) % 2 ? FIRE[1] : FIRE[2],
            outline: FIRE[0],
          })
        }
        if (st > 0) whirl(g, s, t, cx, feet, H, SR, true)
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.55, 0.22, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: my }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            // Red-hot, cooling to its own colours.
            tint: { color: '#ff5a1e', a: 0.7 * (1 - span(t, REVEAL + 0.3, REVEAL + 1.8)) },
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        // Rings of fire going out over the lake on the landing and on the reveal.
        for (const [at, c] of [
          [T_LAND, FIRE[1]],
          [T_LAND + 0.12, FIRE[3]],
        ] as const) {
          const q = span(t, at, at + 0.8)
          if (q > 0 && q < 1) {
            const rx = Math.round(lerp(sz.w * 0.5, w * 0.8, ease.outC(q)))
            if (Math.floor(q * 12) % 3 !== 2)
              ellipseLine(g, cx, feet + 4, rx, Math.max(2, Math.round(rx * 0.22)), c)
          }
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, FIRE[2]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, my, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, T_LAND, T_LAND + 0.25))
          screenFlash(g, '#ffbe2e', 0.6 * (1 - span(t, T_LAND, T_LAND + 0.25)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#fff6c8', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.5, { freq: 160, type: 'lowpass', vol: 0.08 }))],
          [0.5, quiet(() => tone(70, 0.5, { type: 'sine', vol: 0.05 }))],
          // Clang: iron on rock, overhead.
          ...STEPS.map(
            (at, i) =>
              [
                at,
                quiet(() => {
                  tone(150 - i * 6, 0.18, { type: 'square', vol: 0.05 })
                  tone(1180 - i * 40, 0.4, { type: 'triangle', vol: 0.025, slide: -300 })
                  hiss(0.15, { freq: 900, vol: 0.04 })
                }),
              ] as const,
          ),
          [
            T_HEAT,
            quiet(
              () => (
                tone(90, 1.2, { type: 'sawtooth', vol: 0.025, slide: 60 }),
                hiss(0.9, { freq: 400, slide: 800, vol: 0.05 })
              ),
            ),
          ],
          [T_HEAT + 0.3, quiet(() => fxSound('legend.heart'))],
          [T_DROP, quiet(() => hiss(0.4, { freq: 600, slide: 1600, vol: 0.06 }))],
          [
            T_LAND,
            quiet(
              () => (
                fxSound('legend.pulse'),
                hiss(0.9, { freq: 220, type: 'lowpass', vol: 0.16 }),
                fxSound('fire.hit')
              ),
            ),
          ],
          [T_LAND + 0.15, quiet(() => fxSound('fire.stream'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/**
 * The lake: dark slag drifting on molten metal (its home is iron and fire), the melt showing through in bright
 * winding rivers that run across it, wider nearer; twice as wide as the screen (it drifts).
 */
function magmaFlow(w: number, hh: number, r: Rng): Canvas {
  const p1 = r() * 6
  const p2 = r() * 6
  const RAMP = [
    '#fff3a0',
    '#ffd23a',
    '#ffbe2e',
    '#ff8a1e',
    '#e0501e',
    '#a8281a',
    '#5a160c',
    '#3a0e08',
    '#2a0a06',
  ] as const
  return shade(w * 2, hh, (x, y) => {
    const d = (y + 1) / hh
    const z = 1 / (d + 0.2)
    const u = (x - w) / (0.3 + 0.7 * d)
    const v =
      Math.sin(z * 11 + Math.sin(u * 0.028 + p1) * 1.8 + Math.sin(u * 0.085 + p2) * 0.6) +
      0.45 * Math.sin(u * 0.05 + z * 2.5 + p2)
    // Bright where a river runs (v near 0), slag elsewhere; dithered between steps.
    const k = Math.min(1, Math.abs(v) / 0.9) * 8.5 + bayer(x, y) * 1.3 - 0.65
    return RAMP[Math.max(0, Math.min(8, Math.round(k)))]
  })
}

/** The basalt island in the lake: a low black mound, its rim lit by the magma; cracked once it has landed on it. */
function island(g: G, x: number, y: number, R: number, cracked: boolean) {
  const ry = Math.max(3, Math.round(R * 0.25))
  const face = Math.max(4, Math.round(R * 0.22))
  // The magma lapping round its foot, its rocky face, its top.
  ellipse(g, x, y + face + 1, R + 3, ry + 2, '#ffbe2e')
  ellipse(g, x, y + face, R + 1, ry + 1, '#1a0806')
  rect(g, x - R, y, R * 2 + 1, face, '#1a0806')
  for (let i = -R; i <= R; i += 3) rect(g, x + i, y + 2 + ((i * 7) & 3), 1, face - 2, '#2e100a')
  ellipse(g, x, y, R, ry, '#3a140c')
  ellipse(g, x - 1, y - 1, R - 3, Math.max(1, ry - 1), '#2a0e08')
  ellipseLine(g, x, y, R, ry, '#7a2a12', Math.PI, Math.PI * 2)
  if (cracked)
    for (const [a, b] of [
      [-0.6, 0.2],
      [0.3, -0.4],
      [0.7, 0.3],
    ] as const)
      line(g, x + a * R * 0.3, y, x + a * R * 0.9, y + b * ry, '#ffbe2e')
}

/** The storm's flames whirling up round it: the back half (behind it) or the front. */
function whirl(g: G, s: S, t: number, x: number, feet: number, H: number, R: number, front: boolean) {
  if (R < 2) return
  // Rings of fire climbing.
  for (let k = 0; k < 5; k++) {
    const q = (((t * 1.4 + k / 5) % 1) + 1) % 1
    const y = Math.round(feet - q * H)
    const rx = Math.round(R * (0.8 + q * 0.5))
    const ry = Math.max(2, Math.round(rx * 0.28))
    const a0 = t * 9 + k
    ellipseLine(
      g,
      x,
      y,
      rx,
      ry,
      FIRE[Math.min(5, 1 + Math.floor(q * 4))]!,
      front ? 0 : Math.PI,
      front ? Math.PI : Math.PI * 2,
    )
    if (front) ellipseLine(g, x, y + 1, rx, ry, FIRE[3], a0 % Math.PI, (a0 % Math.PI) + 0.8)
  }
  // Tongues of flame riding round and up.
  for (const f of s.storm) {
    const q = (((t * 0.9 * f.v + f.h) % 1) + 1) % 1
    const a = f.a + t * 7 * f.s
    const z = Math.sin(a)
    if (front !== z > 0) continue
    const rr = R * (0.7 + q * 0.6)
    const px = Math.round(x + Math.cos(a) * rr)
    const py = Math.round(feet - q * H + z * rr * 0.28)
    const size = q < 0.7 ? 2 : 1
    rect(g, px, py, size, size + 1, FIRE[Math.min(6, Math.floor(q * 5) + (front ? 0 : 2))]!)
  }
}
