// Zapdos's raid entrance (docs/53): the Power Plant in a thunderstorm. Rain, the plant's windows lit, pylons and
// sagging lines against heavy clouds that flicker from inside. A bolt strikes far off; sparks start running along the
// lines towards the plant, the clouds overhead begin to turn, a bolt hits a pylon. Then the power is pulled into the
// sky: arcs climb from the pylons and the chimneys into the turning clouds and the plant goes dark, window by window.
// In the black, Zapdos's outline burns in the eye of the storm; a colossal bolt drops and Zapdos comes down it. The
// reveal surges every light back on, white; it hovers there crackling, the storm going on.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

const T_FAR = 1.15
const T_LINES = 1.6
const T_PYLON = 2.3
const T_DRAIN = 2.9
const T_DARK = 3.45
const T_BOLT = 4.05
const REVEAL = 4.3
const DUR = REVEAL + AFTER_REVEAL
/** Lightning in the distance after the reveal, never closer than 0.4 s apart (no flash faster than 3 a second). */
const LATER = [5.4, 6.6, 7.3]

const AURA = ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'] as const
const YELLOW = '#ffd23a'

interface Layout {
  cx: number
  ground: number
  feet: number
  eye: { x: number; y: number }
  plant: { x0: number; x1: number; top: number }
  chimneys: number[]
  pylons: { x: number; top: number }[]
  windows: { x: number; y: number; at: number }[]
  /** The power lines: each a list of points from pylon to pylon (and into the plant). */
  wires: [number, number][][]
}

type S = {
  r: Rng
  rain: Particles
  fx: Particles
  back: Canvas
  sky: Canvas
  lit: Canvas
  scene: Canvas
  rays: Canvas
  bolts: Record<string, [number, number][]>
  arcs: [number, number][][]
  arcAt: number
  shakes: [number, number, number][]
}

function layout(w: number, h: number): Layout {
  const cx = Math.round(w / 2)
  const ground = Math.round(h * 0.76)
  const pw = Math.round(Math.max(90, Math.min(w * 0.7, 220)))
  const top = ground - Math.round(Math.max(22, h * 0.11))
  const plant = { x0: cx - (pw >> 1), x1: cx + (pw >> 1), top }
  const chimneys = [plant.x0 + Math.round(pw * 0.18), plant.x1 - Math.round(pw * 0.2)]
  const pyH = Math.round(Math.max(60, h * 0.36))
  const pylons: Layout['pylons'] = []
  for (let k = 0; k < 6; k++)
    for (const side of [-1, 1]) {
      const x = Math.round(cx + side * (pw / 2 + 16 + k * Math.max(70, w * 0.22)))
      if (x > -40 && x < w + 40) pylons.push({ x, top: ground - Math.round(pyH * (1 - k * 0.12)) })
    }
  pylons.sort((a, b) => a.x - b.x)
  const wires: Layout['wires'] = []
  const sag = (ax: number, ay: number, bx: number, by: number) =>
    Array.from({ length: 21 }, (_, i) => {
      const q = i / 20
      return [lerp(ax, bx, q), lerp(ay, by, q) + Math.sin(q * Math.PI) * Math.abs(bx - ax) * 0.08] as [
        number,
        number,
      ]
    })
  for (let i = 0; i + 1 < pylons.length; i++) {
    const a = pylons[i]!
    const b = pylons[i + 1]!
    if (a.x < cx && b.x > cx) {
      // The two nearest the plant feed it.
      wires.push(sag(a.x + 8, a.top + 4, plant.x0 + 6, plant.top - 2))
      wires.push(sag(plant.x1 - 6, plant.top - 2, b.x - 8, b.top + 4))
    } else for (const dy of [4, 9]) wires.push(sag(a.x + 8, a.top + dy, b.x - 8, b.top + dy))
  }
  const windows: Layout['windows'] = []
  const rows = Math.max(2, Math.floor((ground - top - 8) / 6))
  for (let y = 0; y < rows; y++)
    for (let x = plant.x0 + 6; x < plant.x1 - 6; x += 7)
      windows.push({ x, y: top + 6 + y * 6, at: T_DRAIN + 0.12 + ((x - plant.x0) / pw) * 0.4 + y * 0.05 })
  return {
    cx,
    ground,
    feet: Math.round(h * 0.6),
    eye: { x: cx, y: Math.round(h * 0.14) },
    plant,
    chimneys,
    pylons,
    windows,
    wires,
  }
}

/** A lattice pylon: two legs closing to the top, cross-braces, an arm with insulators. */
function pylon(g: G, x: number, top: number, ground: number, c: string) {
  const hw = Math.round((ground - top) * 0.16)
  line(g, x - hw, ground, x - 3, top, c)
  line(g, x + hw, ground, x + 3, top, c)
  for (let y = top + 8, i = 0; y < ground - 4; y += 9, i++) {
    const k = (y - top) / (ground - top)
    const half = Math.round(3 + (hw - 3) * k)
    const k2 = (y + 9 - top) / (ground - top)
    const half2 = Math.round(3 + (hw - 3) * k2)
    line(g, x - half, y, x + half2, Math.min(ground, y + 9), c)
    line(g, x + half, y, x - half2, Math.min(ground, y + 9), c)
  }
  rect(g, x - 9, top + 3, 18, 2, c)
  rect(g, x - 7, top + 8, 14, 1, c)
  for (const dx of [-8, 8]) rect(g, dx + x, top + 5, 1, 3, c)
}

/** The plant and its yard, a black silhouette against the storm (its windows are lit live). */
function scene(w: number, h: number, L: Layout): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const { plant, ground } = L
  const ink = '#06070d'
  // Far hills.
  for (let x = 0; x < w; x++) {
    const y = Math.round(ground - 10 - Math.sin(x / 31) * 5 - Math.sin(x / 13 + 1) * 2)
    rect(g, x, y, 1, ground - y, '#0b0d1a')
  }
  for (const pl of L.pylons) pylon(g, pl.x, pl.top, ground, '#0c0e18')
  // The hall: a sawtooth roof, a side block, two chimneys with their red lamps (lit live).
  rect(g, plant.x0, plant.top, plant.x1 - plant.x0, ground - plant.top, ink)
  for (let x = plant.x0; x < plant.x1; x += 12) {
    for (let i = 0; i < 6; i++) rect(g, x + i, plant.top - i, 1, i, ink)
    rect(g, x + 6, plant.top - 6, 6, 6, ink)
  }
  for (const x of L.chimneys) {
    const ch = Math.round((ground - plant.top) * 1.9)
    rect(g, x - 3, plant.top - ch, 7, ch, ink)
    rect(g, x - 4, plant.top - ch, 9, 2, ink)
    for (let y = plant.top - ch + 6; y < plant.top; y += 8) rect(g, x - 3, y, 7, 1, '#10121c')
  }
  // Transformers in the yard: boxes with insulator stacks.
  for (let x = plant.x0 - 2; x < plant.x1; x += Math.max(26, Math.round((plant.x1 - plant.x0) / 4))) {
    rect(g, x, ground - 7, 12, 7, ink)
    for (const dx of [2, 6, 10])
      for (let k = 0; k < 3; k++) rect(g, x + dx - 1, ground - 9 - k * 2, 3, 1, ink)
  }
  // Wet ground, puddles catching the light (lit live).
  g.drawImage(dGradient(w, h - ground, ['#0d0f1c', '#07080f', '#040509']), 0, ground)
  rect(g, 0, ground, w, 1, '#1c2036')
  return cv
}

/** The clouds, drawn twice: in the dark, and lit from inside (the lightning shows them for a frame or two). */
function clouds(w: number, h: number, lit: boolean, r: Rng): Canvas {
  const cv = canvas(w, Math.round(h * 0.4))
  const g = cv.g
  const C = lit ? ['#3a3a6a', '#5a5a9a', '#8a8ac8'] : ['#0b0c1a', '#14162a', '#1e2240']
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < Math.round(w / 9); i++) {
      const x = r.range(-20, w + 20)
      const y = r.range(0, h * (0.1 + layer * 0.08))
      ellipse(g, x, y, Math.round(r.range(14, 34)), Math.round(r.range(5, 10)), C[layer]!)
    }
  return cv
}

export const zapdosCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const L = layout(w, h)
    const { cx, ground } = L
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const many = p.short ? 0.4 : 1
    const sz = spriteSize(p.mon)
    return {
      id: 'cinema-zapdos',
      dur: DUR,
      setup() {
        const r = rng(145)
        const farX = Math.round(w * 0.12)
        const pylon = L.pylons.find((pl) => pl.x > cx) ?? L.pylons[L.pylons.length - 1]!
        return {
          r,
          rain: new Particles(),
          fx: new Particles(),
          back: dGradient(w, ground, ['#04050c', '#0c0f22', '#181c3a', '#232848']),
          sky: clouds(w, h, false, rng(7)),
          lit: clouds(w, h, true, rng(7)),
          scene: scene(w, h, L),
          rays: canvas(w, h),
          bolts: {
            far: bolt(r, farX, 0, farX + 10, ground - 10, 0.35, 5),
            pylon: bolt(r, pylon.x - 30, 0, pylon.x, pylon.top, 0.3, 5),
            big: bolt(r, cx, L.eye.y, cx, ground, 0.12, 5),
            ...Object.fromEntries(
              LATER.map((_, i) => [
                `l${i}`,
                bolt(r, w * (0.15 + 0.35 * i), 0, w * (0.2 + 0.33 * i), ground - 6, 0.35, 5),
              ]),
            ),
          },
          arcs: [],
          arcAt: -1,
          shakes: p.short
            ? []
            : [
                [T_PYLON, 0.3, 2],
                [T_BOLT, 0.25, 3],
                [REVEAL, 0.7, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.rain.update(dt)
        s.fx.update(dt)
        for (let i = 0; i < 3; i++)
          if (r() < many)
            s.rain.add({
              x: r.range(0, w + 60),
              y: -6,
              vx: -50,
              vy: r.range(220, 280),
              life: 1.4,
              size: 1,
              shape: 'streak',
              trail: 0.025,
              colors: ['#5a6a9a', '#8a9ac8'],
            })
        // Sparks on the pylon the bolt hits, falling down its legs.
        if (within(t, T_PYLON, T_PYLON + 0.8) && r() < 0.8 * many) {
          const pl = L.pylons.find((x) => x.x > cx) ?? L.pylons[0]!
          s.fx.add({
            x: pl.x + r.range(-8, 8),
            y: pl.top + r.range(0, 8),
            vx: r.range(-40, 40),
            vy: r.range(-60, 0),
            ay: 260,
            life: r.range(0.4, 0.9),
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#fff3a0', YELLOW, '#ff8a1e'],
          })
        }
        // The arcs climbing into the sky, redrawn every few frames: jagged, never still.
        if (t > T_DRAIN && t < T_DARK + 0.2 && Math.floor(t * 20) !== s.arcAt) {
          s.arcAt = Math.floor(t * 20)
          const from = [
            ...L.pylons.map((pl) => [pl.x, pl.top] as const),
            ...L.chimneys.map((x) => [x, L.plant.top - 30] as const),
          ]
          s.arcs = from
            .filter(() => r() < 0.6)
            .map(([x, y]) => bolt(r, x, y, L.eye.x + r.range(-20, 20), L.eye.y + r.range(-6, 6), 0.3, 4))
        }
        // Static crackling round it, then the bolt's burst.
        if (t > T_DARK && t < T_BOLT && r() < 0.5)
          s.fx.add({
            x: L.eye.x + r.range(-50, 50),
            y: L.eye.y + r.range(-20, 30),
            life: 0.12,
            size: r.int(1, 2),
            shape: 'plus',
            colors: ['#ffffff', YELLOW],
          })
        if (t >= REVEAL && t - dt < REVEAL)
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: cx,
              y: L.feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.4, 0.8),
              size: r.int(1, 2),
              shape: r() < 0.6 ? 'plus' : 'sq',
              colors: [...AURA],
            })
          }
        if (t > REVEAL && r() < 0.35 * many)
          s.fx.add({
            x: cx + r.range(-sz.w / 2, sz.w / 2),
            y: L.feet - r.range(0, sz.h),
            life: 0.1,
            size: r.int(1, 2),
            shape: 'plus',
            colors: ['#ffffff', YELLOW],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.back, 0, 0)
        // The clouds, lit from inside now and then (no flash faster than 3 a second: each glimmer is two frames).
        const glim = [0.55, 0.95, 1.9, 2.6, 3.2].some((x) => within(t, x, x + 0.06))
        const strike =
          within(t, T_FAR, T_FAR + 0.14) ||
          within(t, T_PYLON, T_PYLON + 0.14) ||
          LATER.some((x) => within(t, x, x + 0.12))
        const drift = Math.round(t * 3) % w
        for (const [cv, k] of [
          [s.sky, 1],
          [s.lit, glim || strike ? 0.6 : 0],
        ] as const) {
          if (!k) continue
          dissolve(g, cv, k, -drift, 0)
          dissolve(g, cv, k, w - drift, 0)
        }
        // The storm's eye turning over the plant, its light growing as it draws the power in.
        const vq = span(t, T_LINES, T_DARK)
        if (vq > 0) drawVortex(g, t, L.eye, Math.min(w, h), vq, t > T_DARK ? 1 : vq)
        g.drawImage(s.scene, 0, 0)
        // Lightning: the far strike, the pylon, and the storm after.
        for (const [key, at] of [
          ['far', T_FAR],
          ['pylon', T_PYLON],
          ...LATER.map((x, i) => [`l${i}`, x] as const),
        ] as const)
          if (within(t, at, at + 0.14)) drawBolt(g, s.bolts[key]!, 1)
        // The plant's windows: lit, flickering as the lines spark, dark one by one, surging back with it.
        const surge = t >= REVEAL ? 1 - span(t, REVEAL, REVEAL + 0.8) : 0
        for (const wi of L.windows) {
          const off = t > wi.at && t < REVEAL
          const flick = t > T_LINES && t < T_DRAIN && Math.floor(t * 18 + wi.x) % 9 === 0
          if (off || flick) continue
          rect(g, wi.x, wi.y, 3, 2, surge > 0.3 ? '#ffffff' : (wi.x + wi.y) % 5 ? '#ffd23a' : '#ffb84d')
        }
        // The chimneys' red lamps.
        for (const x of L.chimneys)
          if ((t < T_DRAIN || t > REVEAL) && Math.floor(t * 2) % 2) {
            const ch = Math.round((ground - L.plant.top) * 1.9)
            rect(g, x, L.plant.top - ch - 2, 2, 2, '#ff3a3a')
          }
        // The lines, and sparks running along them to the plant.
        for (const [i, wire] of L.wires.entries()) {
          polyline(g, wire, '#05060a')
          if (t > T_LINES && t < T_DRAIN + 0.2) {
            const q = ((t - T_LINES) * 1.4 + i * 0.37) % 1
            const n = Math.min(wire.length - 1, Math.floor(q * wire.length))
            // A spark with a short tail of the line lit behind it.
            polyline(g, wire.slice(Math.max(0, n - 3), n + 1), YELLOW)
            const at = wire[n]!
            rect(g, at[0] - 1, at[1] - 1, 3, 3, YELLOW)
            rect(g, at[0], at[1], 1, 1, '#ffffff')
            if (Math.floor(t * 30 + i) % 3 === 0) rect(g, at[0] - 2, at[1] - 3, 1, 2, '#fff6c8')
          }
          if (surge > 0) polyline(g, wire, '#fff3a0')
        }
        // Puddles catching the light.
        for (let k = 0; k < 6; k++) {
          const x = Math.round(((k * 53) % w) + Math.sin(t + k) * 2)
          const y = ground + 5 + ((k * 7) % Math.max(4, h - ground - 8))
          rect(g, x, y, 10, 1, strike || surge > 0 ? '#c8c8ff' : '#1c2240')
        }
        s.rain.draw(g)
        // The dark: deeper as the power goes.
        const dark =
          t < T_DRAIN
            ? 0.15
            : t < REVEAL
              ? lerp(0.15, 0.6, span(t, T_DRAIN, T_DARK))
              : lerp(0.6, 0.2, span(t, REVEAL, REVEAL + 0.6))
        wash(g, '#02030a', dark, 8)
        // The power pulled up into the sky.
        if (t > T_DRAIN && t < T_DARK + 0.2) for (const a of s.arcs) drawBolt(g, a, 0.6)
        // In the eye, its outline burning; then down the bolt; then itself.
        if (t > T_DARK && t < T_BOLT) {
          const fl = Math.floor(t * 14) % 3
          drawSprite(g, p.mon, L.eye.x, L.eye.y + Math.round(sz.h * 0.6), {
            sil: '#0b0a14',
            outline: fl ? YELLOW : '#ffffff',
          })
        }
        if (t >= T_BOLT && t < REVEAL + 0.1) {
          drawBolt(g, s.bolts.big!, 3)
          const q = ease.inQ(span(t, T_BOLT, REVEAL))
          drawSprite(g, p.mon, cx, Math.round(lerp(L.eye.y + sz.h * 0.6, L.feet, q)), {
            sil: '#ffffff',
            outline: YELLOW,
          })
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.7, 0.3, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: L.feet - 30 }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const ar = Math.round(Math.min(w, h) * 0.28)
          g.drawImage(glow(ar, '#ffd23a', 1.5, 0.35), cx - ar, L.feet - 30 - ar)
          const bob = Math.round(Math.sin((t - REVEAL) * 2.4) * 2)
          drawSprite(g, p.mon, cx, L.feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 10) % 2 ? AURA[1] : AURA[2],
          })
          // Arcs jumping round its body.
          if (Math.floor(t * 12) % 3 === 0) {
            const r = rng(Math.floor(t * 12))
            for (let i = 0; i < 2; i++) {
              const a0 = r() * Math.PI * 2
              const R = sz.w * 0.55
              const x0 = cx + Math.cos(a0) * R
              const y0 = L.feet - sz.h / 2 + Math.sin(a0) * sz.h * 0.5
              polyline(g, bolt(r, x0, y0, x0 + r.range(-14, 14), y0 + r.range(-14, 14), 0.5, 3), '#fff6c8')
            }
          }
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.12, AURA[1]],
          [0.24, AURA[2]],
        ] as const)
          burstRing(g, cx, L.feet - 30, span(t, REVEAL + d, REVEAL + d + 0.55), Math.max(w, h) * 0.7, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, T_FAR, T_FAR + 0.12)) screenFlash(g, '#c8c8ff', 0.3)
        if (within(t, T_PYLON, T_PYLON + 0.15)) screenFlash(g, '#fff6c8', 0.45)
        if (within(t, T_BOLT, T_BOLT + 0.12)) screenFlash(g, '#fff6c8', 0.6)
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        for (const x of LATER) if (within(t, x, x + 0.1)) screenFlash(g, '#c8c8ff', 0.25)
        if (t < 0.45) wash(g, '#000000', 1 - span(t, 0, 0.45), 8)
      },
      cues: () =>
        inOrder([
          [0.02, quiet(() => hiss(4, { freq: 1800, type: 'highpass', vol: 0.025 }))],
          [0.05, quiet(() => tone(60, 2.8, { type: 'sawtooth', vol: 0.012 }))],
          [T_FAR, quiet(() => fxSound('thunder.strike'))],
          [T_FAR + 0.3, quiet(() => hiss(1.4, { freq: 160, type: 'lowpass', vol: 0.1 }))],
          [T_LINES, quiet(() => fxSound('thunder.charge'))],
          [T_PYLON, quiet(() => fxSound('thunder.strike'))],
          [T_PYLON + 0.1, quiet(() => hiss(1.2, { freq: 140, type: 'lowpass', vol: 0.12 }))],
          [T_DRAIN, quiet(() => tone(440, 0.9, { type: 'sawtooth', vol: 0.04, slide: -380 }))],
          [T_DRAIN + 0.1, quiet(() => hiss(0.7, { freq: 2600, q: 3, vol: 0.05, slide: 2000 }))],
          [T_DARK, quiet(() => fxSound('legend.heart'))],
          [T_DARK + 0.3, quiet(() => fxSound('legend.heart'))],
          [
            T_BOLT,
            quiet(() => (fxSound('thunder.strike'), hiss(0.6, { freq: 4000, slide: -3000, vol: 0.1 }))),
          ],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          ...LATER.map(
            (x) => [x + 0.2, quiet(() => hiss(1, { freq: 150, type: 'lowpass', vol: 0.06 }))] as const,
          ),
        ] satisfies Cue<S>[]),
    }
  },
}

/** A bolt: a wide pale glow line, then the white core. */
function drawBolt(g: G, pts: [number, number][], wd: number) {
  polyline(
    g,
    pts.map(([x, y]) => [x + 1, y] as [number, number]),
    '#8a7ad8',
    wd + 1,
  )
  polyline(g, pts, '#fff6c8', wd)
  polyline(g, pts, '#ffffff', Math.max(1, wd - 2))
}

/** The storm's eye: arms of cloud turning round a light that grows. */
function drawVortex(g: G, t: number, c: { x: number; y: number }, u: number, q: number, light: number) {
  const R = u * 0.42
  for (let arm = 0; arm < 4; arm++)
    for (let i = 0; i < 26; i++) {
      const k = i / 26
      const a = arm * (Math.PI / 2) + k * 3.2 - t * (1 + q * 2)
      const rr = R * (1 - k) * q + 6
      const x = Math.round(c.x + Math.cos(a) * rr)
      const y = Math.round(c.y + Math.sin(a) * rr * 0.35)
      const s = Math.round(lerp(12, 3, k))
      // Dark outside, lit towards the eye, its rim catching the light that grows there.
      const col = k > 0.75 ? (light > 0.5 ? '#c8b870' : '#5a5a90') : k > 0.45 ? '#2e3260' : '#1c1f3c'
      ellipse(g, x, y, s, Math.max(1, s >> 1), col)
      if (k > 0.3) ellipse(g, x, y - (s >> 1), Math.max(1, s - 2), 1, k > 0.6 ? '#8a8ac8' : '#3a3e70')
    }
  if (light > 0) {
    const gr = Math.round(10 + 26 * light)
    g.drawImage(glow(gr, '#ffd23a', 1.2, 0.8 * light), c.x - gr, c.y - gr)
    // Lightning crawling inside the eye.
    if (Math.floor(t * 10) % 2) {
      const r = rng(Math.floor(t * 10))
      for (let i = 0; i < 2; i++) {
        const a = r() * Math.PI * 2
        polyline(
          g,
          bolt(r, c.x, c.y, c.x + Math.cos(a) * R * 0.5 * q, c.y + Math.sin(a) * R * 0.18, 0.4, 3),
          '#fff6c8',
        )
      }
    }
  }
}
