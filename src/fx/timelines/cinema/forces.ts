// The Forces of Nature's raid entrances (docs/53): one family, Unova's open country, each riding its own cloud.
//
// Tornadus, the wind: grassland on a grey afternoon, a lone tree. A green-tinged cloud races across the sky, its shadow
// running over the fields and the grass flattening behind it; it swings back and stops overhead, the wind howling,
// straw circling. A funnel twists down out of it and touches the ground, spinning faster, a shape turning inside it;
// the reveal blows the tornado apart and Tornadus is there, on its cloud.
//
// Thundurus, the thunder: dry fields at dusk. A black-violet thunderhead races in from the horizon straight at us,
// dropping bolt after bolt, each strike nearer and bigger and each leaving a fire burning in the field. It stops
// overhead and swells, arcs crawling under it; five bolts come down at once in a cage round the middle and stay, and
// Thundurus drops through them; they fold into it, and a ring of thunder runs out over the fields.
//
// Landorus, the harvest: the morning after the storms, scorched fields, smoke, the Abundant Shrine on its hill. A
// golden cloud comes in slowly and the overcast parts round it; the earth rumbles, its cracks glow and rocks lift out
// of it, turning in the air. Then the harvest: a wave of green sweeps out from the middle over the burnt ground and
// turns to gold wheat as it goes; the rocks crumble to dust and Landorus comes down on its cloud.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  Particles,
  pattern,
  polyline,
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
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  inOrder,
  tri,
  type Cinema,
  type CinemaParams,
} from './kit'

type Pt = [number, number]

const pats = new WeakMap<G, Map<string, CanvasPattern | string>>()
/** pattern(), kept per canvas: a light drawn row by row would otherwise make hundreds of patterns a frame. */
function pat(g: G, c: string, lv: number) {
  let m = pats.get(g)
  if (!m) pats.set(g, (m = new Map()))
  const k = `${c}|${Math.round(lv)}`
  let p = m.get(k)
  if (!p) m.set(k, (p = pattern(g, c, lv)))
  return p
}
type Aura = readonly [string, string, string, string]

function frame(p: CinemaParams) {
  const w = p.w ?? 240
  const h = p.h ?? 160
  return {
    w,
    h,
    cx: Math.round(w / 2),
    m: Math.min(w, h),
    feet: Math.round(h * 0.6),
    // The horizon sits high: these are scenes of open fields under a big sky.
    hz: Math.round(h * 0.46),
    sz: spriteSize(p.mon),
    many: p.short ? 0.4 : 1,
    quiet: (f: () => void) => () => void (!skippingNow() && f()),
  }
}

/** How far down the field a row is, 0 at the horizon, 1 at the screen's foot: rows crowd towards the horizon. */
const depth = (y: number, hz: number, h: number) => Math.max(0, (y - hz) / (h - hz))

interface FieldPal {
  sky: readonly string[]
  hills: readonly [string, string, string]
  field: readonly string[]
  furrow: string
  crop: readonly [string, string]
}

/** Unova's open country: a sky, two lines of hills, fields in perspective with their furrows and crops. */
function country(w: number, h: number, hz: number, pal: FieldPal, r: Rng, crops = true): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, hz, pal.sky), 0, 0)
  // Hills: far and pale, then nearer and darker, a ridge line lit along its top.
  for (const [i, amp, f] of [
    [0, 12, 31],
    [1, 7, 17],
  ] as const) {
    const base = hz - (i ? 2 : 9)
    for (let x = 0; x < w; x++) {
      const y = Math.round(base - Math.abs(Math.sin(x / f + i * 2)) * amp - Math.sin(x / 7 + i) * 1.5)
      rect(g, x, y, 1, hz - y + 1, pal.hills[i]!)
      if (i) rect(g, x, y, 1, 1, pal.hills[2])
    }
  }
  // The fields: a patchwork in perspective. Bands crowd towards the horizon; each band is cut into plots whose edges
  // converge on the middle of the horizon, each plot its own shade, its crop rows running towards us, a hedgerow
  // between the bands.
  const cx = w / 2
  const seed = r.int(1, 9999)
  const hash = (a: number, b: number) => {
    const v = Math.sin(a * 127.1 + b * 311.7 + seed) * 43758.5453
    return v - Math.floor(v)
  }
  const fieldH = h - hz
  g.drawImage(
    shade(w, fieldH, (x, y) => {
      const d = (y + 0.5) / fieldH
      const z = Math.sqrt(d) * 7
      const band = Math.floor(z)
      const across = (x - cx) / (6 + d * w * 0.55) + hash(band, 0) * 3
      const plot = Math.floor(across)
      // A hedgerow along the band's far edge.
      if (z - band < 0.05 + 0.02 / (d + 0.1)) return pal.furrow
      const c = pal.field[Math.floor(hash(band, plot) * pal.field.length)]!
      // The crop's rows, converging; every other one a step darker.
      const row = Math.floor((x - cx) / (1.5 + d * 5) + hash(plot, band) * 4)
      if (hash(band, plot) > 0.3 && row % 2 && bayer(x, y) < 0.7) return pal.crop[0]
      return c
    }),
    0,
    hz,
  )
  rect(g, 0, hz, w, 1, pal.furrow)
  if (crops)
    for (let i = 0; i < Math.round((w * (h - hz)) / 40); i++) {
      const y = hz + (h - hz) * r() ** 1.6
      const d = depth(y, hz, h)
      const x = r.range(0, w)
      const ht = Math.max(1, Math.round(1 + d * 4))
      rect(g, x, y - ht, 1, ht, r() < 0.5 ? pal.crop[0] : pal.crop[1])
    }
  return cv
}

/** A cumulus of puffs (cx, cy, r), seeded: drawn at any scale with its dark belly, body and lit top. */
type Puff = [number, number, number]
const puffs = (r: Rng, n: number, wd: number): Puff[] =>
  Array.from({ length: n }, (_, i) => {
    const q = n > 1 ? i / (n - 1) : 0.5
    const x = (q - 0.5) * wd + r.range(-3, 3)
    const rr = r.range(0.22, 0.34) * wd * (1 - Math.abs(q - 0.5) * 0.9)
    return [x, -rr * 0.4 + r.range(-2, 2), rr] as Puff
  })

function drawCloud(g: G, ps: readonly Puff[], x: number, y: number, s: number, pal: readonly string[]) {
  for (const [dx, dy, rr] of ps)
    ellipse(g, x + dx * s, y + dy * s + rr * s * 0.25, Math.round(rr * s), Math.round(rr * s * 0.6), pal[0]!)
  for (const [dx, dy, rr] of ps)
    ellipse(g, x + dx * s, y + dy * s, Math.round(rr * s * 0.92), Math.round(rr * s * 0.55), pal[1]!)
  for (const [dx, dy, rr] of ps)
    ellipse(
      g,
      x + dx * s - rr * s * 0.15,
      y + dy * s - rr * s * 0.2,
      Math.round(rr * s * 0.6),
      Math.round(rr * s * 0.32),
      pal[2]!,
    )
}

/** The reveal's end, shared by the three: rays and rings in its colours, the legend hovering in full. */
function revealFx(
  g: G,
  rays: Canvas,
  mon: string,
  x: number,
  feet: number,
  t: number,
  R: number,
  A: Aura,
  big: number,
) {
  const k = span(t, R, R + 0.5) * lerp(0.7, 0.3, span(t, R + 0.4, R + 1.4))
  drawRays(rays, { x, y: feet - 30 }, t, A[3], k)
  g.drawImage(rays, 0, 0)
  const bob = Math.round(Math.sin((t - R) * 2.2) * 2)
  drawSprite(g, mon, x, feet + bob, {
    flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.45)),
    outline: t < R + 1.6 ? (Math.floor(t * 8) % 2 ? A[1] : A[2]) : undefined,
  })
  ;[A[0], A[1], A[2]].forEach((c, i) =>
    burstRing(g, x, feet - 30, span(t, R + i * 0.12, R + i * 0.12 + 0.6), big, 3, c),
  )
}

function revealBurst(fx: Particles, r: Rng, x: number, y: number, n: number, A: Aura) {
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const v = r.range(50, 170)
    fx.add({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      drag: 2.5,
      life: r.range(0.5, 1),
      size: r.int(1, 2),
      shape: r() < 0.5 ? 'star' : 'sq',
      colors: [...A],
    })
  }
}

/** The cloud it rides, under its feet after the reveal: a small cumulus of its own colours. */
function seat(g: G, ps: readonly Puff[], x: number, feet: number, t: number, pal: readonly string[]) {
  drawCloud(g, ps, x, feet + 2 + Math.round(Math.sin(t * 2.2) * 2), 1, pal)
}

// ================================================================================================= Tornadus

const TO_AURA: Aura = ['#ffffff', '#d4ffe8', '#5ad0a0', '#1f6a5a']
const TO_CLOUD = ['#3a5a50', '#6a9a88', '#b8e0cc'] as const
const TO_RACE = 0.7
const TO_BACK = 1.75
const TO_STOP = 2.45
const TO_DOWN = 2.65
const TO_TOUCH = 3.35
const TO_BLOW = 4.35
const TO_REVEAL = 4.6

type TOS = {
  r: Rng
  fx: Particles
  straw: Particles
  bg: Canvas
  rays: Canvas
  cloud: Puff[]
  small: Puff[]
  shakes: [number, number, number][]
}

/** Where the racing cloud is: across from the right, swinging back, stopping overhead. */
function racing(t: number, w: number, top: number) {
  if (t < TO_BACK) {
    const q = ease.ioQ(span(t, TO_RACE, TO_BACK))
    return { x: lerp(w * 1.4, -w * 0.4, q), y: top + Math.sin(q * Math.PI) * 6, on: t >= TO_RACE }
  }
  const q = ease.outC(span(t, TO_BACK, TO_STOP))
  return { x: lerp(-w * 0.4, w / 2, q), y: top + 4 - Math.sin(q * Math.PI) * 10, on: true }
}

export const tornadusCinema: Cinema = {
  reveal: TO_REVEAL,
  dur: TO_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<TOS> {
    const F = frame(p)
    const { w, h, cx, m, feet, hz, sz, many, quiet } = F
    const R = TO_REVEAL
    const top = Math.round(h * 0.13)
    const cw = Math.round(Math.min(w * 0.9, m * 0.95))
    // The funnel hangs from the cloud's belly, so it shows its whole length on any screen.
    const belly = top + Math.round(cw * 0.16)
    const ground = Math.round(feet + 6)
    /** The wind, 0 calm to 1 howling. */
    const gale = (t: number) =>
      Math.min(1, 0.15 + span(t, TO_RACE, TO_BACK) * 0.4 + span(t, TO_STOP, TO_TOUCH) * 0.5)
    return {
      id: 'cinema-tornadus',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(641)
        const bg = country(
          w,
          h,
          hz,
          {
            sky: ['#4a5a5e', '#6a7e7e', '#8aa09a', '#a8bcb0'],
            hills: ['#6a8478', '#3e5a48', '#7a9a80'],
            field: ['#4a7a3a', '#5a8a40', '#3e6e34', '#6a9a48', '#52823c'],
            furrow: '#24401e',
            crop: ['#36622e', '#8ab85a'],
          },
          r,
        )
        // A lone tree on a rise to one side.
        const g = bg.g
        const tx = Math.round(w * 0.2)
        rect(g, tx - 1, hz - 18, 3, 20, '#2a2a1e')
        ellipse(g, tx, hz - 22, 9, 7, '#2a4a30')
        ellipse(g, tx - 2, hz - 24, 6, 4, '#3a6a40')
        // Fence posts running into the distance.
        for (let i = 0; i < 9; i++) {
          const y = Math.round(hz + (h - hz) * (i / 9) ** 2) + 2
          const d = depth(y, hz, h)
          const x = Math.round(w * 0.85 + d * w * 0.3)
          rect(
            g,
            x,
            y - Math.round(2 + d * 12),
            Math.max(1, Math.round(d * 3)),
            Math.round(2 + d * 12),
            '#3a2e1e',
          )
        }
        return {
          r,
          fx: new Particles(),
          straw: new Particles(),
          bg,
          rays: canvas(w, h),
          cloud: puffs(r, 7, cw),
          small: puffs(r, 5, Math.max(40, sz.w * 1.1)),
          shakes: p.short
            ? []
            : [
                [TO_TOUCH, 0.5, 2],
                [3.8, 0.6, 2],
                [TO_BLOW, 0.4, 4],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.straw.update(dt)
        const k = gale(t)
        // Wind streaks across the screen, more as the gale rises.
        if (r() < (0.3 + k * 1.2) * many)
          s.fx.add({
            x: w + 4,
            y: r.range(0, h),
            vx: -r.range(160, 260) * (0.6 + k),
            life: 1.2,
            size: 1,
            shape: 'streak',
            trail: 0.06,
            colors: ['#e8fff4', '#b8e0cc'],
          })
        // Straw and leaves: blown across, then caught in the whirl.
        if (t < TO_TOUCH && r() < (0.2 + k) * many)
          s.straw.add({
            x: w + 4,
            y: r.range(hz, h),
            vx: -r.range(60, 140) * (0.5 + k),
            vy: -r.range(0, 30),
            ay: 20,
            life: 3,
            size: 2,
            shape: 'leaf',
            spin: r.range(-8, 8),
            colors: [r() < 0.5 ? '#d8c070' : '#7aa850'],
          })
        // Round the funnel: debris spiralling up.
        if (t > TO_TOUCH && t < TO_BLOW && r() < 1.2 * many)
          for (let i = 0; i < 2; i++)
            s.fx.add({
              x: cx + r.range(-m * 0.15, m * 0.15),
              y: ground - r.range(0, 6),
              vx: r.range(-80, 80),
              vy: -r.range(30, 90),
              life: r.range(0.8, 1.4),
              size: 2,
              shape: 'leaf',
              spin: r.range(-12, 12),
              colors: [r() < 0.5 ? '#d8c070' : '#7aa850'],
            })
        // The funnel blows apart: everything it held thrown out.
        if (within(t, TO_BLOW, TO_BLOW + dt))
          for (let i = 0; i < 50 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: cx,
              y: r.range(top, ground),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 1.5,
              life: r.range(0.6, 1.2),
              size: 2,
              shape: r() < 0.5 ? 'leaf' : 'streak',
              trail: 0.05,
              spin: r.range(-10, 10),
              colors: r() < 0.5 ? ['#d8c070'] : ['#e8fff4', '#b8e0cc'],
            })
          }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, TO_AURA)
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#4a5a5e'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        const k = gale(t)
        // The grass bending: bright wind lines rolling over the field.
        for (let i = 0; i < 6; i++) {
          const y = Math.round(hz + (h - hz) * ((i + 0.5) / 6) ** 1.6)
          const d = depth(y, hz, h)
          const L = Math.round(6 + d * 30)
          const x = Math.round(w - ((t * (60 + k * 160) * (0.5 + d) + i * 47) % (w + L * 2)))
          rect(g, x, y, L, 1, '#9acf78')
        }
        // The storm darkens the sky once the cloud stops.
        const dark = span(t, TO_STOP - 0.3, TO_TOUCH) * (1 - span(t, R, R + 0.6))
        if (dark > 0) wash(g, '#1a2a26', dark * 0.5, 8)
        // The racing cloud's shadow on the fields.
        const c = racing(t, w, top)
        if (c.on && t < TO_STOP + 0.3) {
          const sy = Math.round(lerp(hz + 8, h - 20, 0.5))
          ellipse(
            g,
            c.x + 10,
            sy,
            Math.round(cw * 0.5),
            Math.round((h - hz) * 0.12),
            pattern(g, '#1a2a18', 8),
          )
        }
        // The funnel: down out of the cloud, touching the ground, spinning faster; a shape turning in it.
        const grow = ease.inQ(span(t, TO_DOWN, TO_TOUCH))
        const blow = span(t, TO_BLOW, R)
        if (grow > 0 && t < R) {
          const bottom = lerp(belly + 4, ground, grow)
          funnelBody(g, cx, belly - 2, bottom, t, m, blow)
          if (t > TO_TOUCH) {
            // A skirt of dust where it touches.
            const dr = Math.round(m * (0.18 + 0.04 * Math.sin(t * 20)))
            ellipse(g, cx, ground, dr, 4, pattern(g, '#8a8a6a', 9))
            ellipse(g, cx, ground - 2, Math.round(dr * 0.7), 3, pattern(g, '#c8c8a0', 6))
          }
          if (t > 3.6 && blow < 0.5) {
            const spin = Math.cos(t * 18)
            drawSprite(g, p.mon, cx, Math.round(feet - 4 + Math.sin(t * 9) * 3), {
              sil: '#1a2a26',
              outline: TO_AURA[1],
              sx: Math.max(0.15, Math.abs(spin)),
              flip: spin < 0,
              alpha: span(t, 3.6, 3.9),
            })
          }
          funnelBands(g, cx, belly - 2, bottom, t, k, m, blow)
        }
        // The cloud: racing over, then still, black-bellied; it shrinks to its seat as the funnel goes.
        if (c.on && t < R) drawCloud(g, s.cloud, c.x, c.y, 1, TO_CLOUD)
        if (t < R) s.straw.draw(g)
        if (t >= R) {
          seat(g, s.small, cx, feet, t, TO_CLOUD)
          revealFx(g, s.rays, p.mon, cx, feet, t, R, TO_AURA, Math.max(w, h) * 0.7)
        }
        // Rings of wind thrown out by the blow.
        burstRing(
          g,
          cx,
          Math.round((top + ground) / 2),
          span(t, TO_BLOW, TO_BLOW + 0.5),
          m * 0.8,
          2,
          '#e8fff4',
        )
        s.fx.draw(g)
        g.restore()
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(2.4, { freq: 700, q: 2, vol: 0.03, slide: 300 }))],
          [TO_RACE, quiet(() => hiss(1.0, { freq: 500, slide: 1500, vol: 0.06 }))],
          [TO_BACK, quiet(() => hiss(0.8, { freq: 1800, slide: -1000, vol: 0.06 }))],
          [TO_STOP, quiet(() => hiss(2.0, { freq: 400, q: 4, slide: 900, vol: 0.06 }))],
          [TO_DOWN, quiet(() => tone(110, 1.6, { type: 'sawtooth', vol: 0.02, slide: 110 }))],
          [
            TO_TOUCH,
            quiet(
              () => (
                hiss(1.0, { freq: 250, type: 'lowpass', vol: 0.12 }),
                hiss(1.0, { freq: 1200, q: 6, slide: 1200, vol: 0.05 })
              ),
            ),
          ],
          [3.9, quiet(() => fxSound('legend.heart'))],
          [TO_BLOW, quiet(() => hiss(0.5, { freq: 3000, slide: -2400, vol: 0.12 }))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<TOS>[]),
    }
  },
}

/**
 * A tornado: a column of wind narrowing to the ground, row by row, a rope swaying. `blow` 0→1 throws it apart: the rows
 * fly outward and thin out. Its body, then (after whatever turns inside it) its bands, bright where they come round
 * the front.
 */
function funnelRow(y: number, top: number, bottom: number, t: number, m: number, x: number, blow: number) {
  const qq = (y - top) / Math.max(1, bottom - top)
  const rr = lerp(m * 0.32, m * 0.045, Math.pow(qq, 0.55)) * (1 + blow * 1.6)
  const cxo = x + Math.sin(qq * 4 - t * 3) * m * 0.05 * qq
  return { qq, rr, cxo }
}

function funnelBody(g: G, x: number, top: number, bottom: number, t: number, m: number, blow: number) {
  for (let y = Math.round(top); y < bottom; y++) {
    const { qq, rr, cxo } = funnelRow(y, top, bottom, t, m, x, blow)
    const lv = Math.round((15 - qq * 3) * (1 - blow))
    if (lv <= 0) continue
    // Darker at its edges: a round column, not a flat ribbon.
    g.fillStyle = pat(g, '#2e4a42', lv)
    g.fillRect(Math.round(cxo - rr), y, Math.round(rr * 2), 1)
    g.fillStyle = pat(g, '#4e6e64', lv)
    g.fillRect(Math.round(cxo - rr * 0.7), y, Math.round(rr * 1.4), 1)
    g.fillStyle = pat(g, '#6a8a80', Math.round(lv * 0.6))
    g.fillRect(Math.round(cxo - rr * 0.35), y, Math.round(rr * 0.5), 1)
    // Spray tearing off its edges.
    if (bayer(y, Math.floor(t * 20)) < 0.25) rect(g, cxo - rr - 2, y, 1, 1, '#b8e0cc')
    if (bayer(y + 2, Math.floor(t * 20)) < 0.25) rect(g, cxo + rr + 1, y, 1, 1, '#b8e0cc')
  }
}

function funnelBands(
  g: G,
  x: number,
  top: number,
  bottom: number,
  t: number,
  k: number,
  m: number,
  blow: number,
) {
  for (let y = Math.round(top); y < bottom; y++) {
    const { qq, rr, cxo } = funnelRow(y, top, bottom, t, m, x, blow)
    if (blow > 0.7) continue
    for (let b = 0; b < 4; b++) {
      const ph = qq * 10 - t * (8 + k * 12) + (b * Math.PI) / 2
      if (Math.cos(ph) < 0.1) continue
      const bx = cxo + Math.sin(ph) * rr
      rect(g, bx - 1, y, rr > 12 ? 3 : 2, 1, b % 2 ? '#b8e0cc' : '#e8fff4')
    }
  }
}

// ================================================================================================= Thundurus

const TH_AURA: Aura = ['#ffffff', '#e4d4ff', '#9a6af0', '#3a1a7a']
const TH_CLOUD = ['#140a24', '#2a1a44', '#4a3a6a'] as const
/** Its strikes as it comes: when, and how far down the field (0 at the horizon). */
const TH_STRIKES: readonly [number, number, number][] = [
  [0.95, 0.06, 0.3],
  [1.3, 0.14, 0.7],
  [1.62, 0.24, 0.25],
  [1.9, 0.36, 0.78],
  [2.14, 0.5, 0.2],
  [2.36, 0.66, 0.85],
]
const TH_OVER = 2.55
const TH_CAGE = 3.35
const TH_DROP = 3.55
const TH_FOLD = 4.05
const TH_REVEAL = 4.5

type THS = {
  r: Rng
  fx: Particles
  smoke: Particles
  bg: Canvas
  rays: Canvas
  cloud: Puff[]
  small: Puff[]
  bolts: Pt[][]
  cage: Pt[][]
  shakes: [number, number, number][]
}

export const thundurusCinema: Cinema = {
  reveal: TH_REVEAL,
  dur: TH_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<THS> {
    const F = frame(p)
    const { w, h, cx, m, feet, hz, sz, many, quiet } = F
    const R = TH_REVEAL
    const cw = Math.round(Math.min(w * 1.1, m * 1.2))
    // The cloud comes at us: from a speck over the horizon to a mass filling the top of the screen.
    const cloudAt = (t: number) => {
      const q = ease.inQ(span(t, 0.6, TH_OVER))
      return { x: cx + Math.sin(q * 3) * w * 0.08, y: lerp(hz - 10, h * 0.16, q), s: lerp(0.18, 1.1, q) }
    }
    const strikeAt = (d: number, side: number): Pt => {
      const y = hz + (h - hz) * d
      return [cx + (side - 0.5) * w * (0.2 + d * 0.9), y]
    }
    const cageR = Math.round(Math.min(w * 0.36, m * 0.42))
    const ground = feet + 8
    return {
      id: 'cinema-thundurus',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(642)
        const bg = country(
          w,
          h,
          hz,
          {
            sky: ['#1a1030', '#3a1e48', '#7a3a4a', '#c86a48'],
            hills: ['#3a2234', '#1e1220', '#5a3040'],
            field: ['#8a6a38', '#7a5a30', '#9a7a40', '#6a5028', '#a8844a'],
            furrow: '#2a1e10',
            crop: ['#5a4220', '#c8a060'],
          },
          r,
        )
        // A farm far off: a barn and a silo against the last light.
        const g = bg.g
        const fx0 = Math.round(w * 0.72)
        rect(g, fx0, hz - 9, 12, 9, '#140c14')
        tri(g, fx0 - 1, hz - 9, fx0 + 13, hz - 9, fx0 + 6, hz - 14, '#140c14')
        rect(g, fx0 + 14, hz - 16, 5, 16, '#140c14')
        ellipse(g, fx0 + 16, hz - 16, 2, 2, '#140c14')
        rect(g, fx0 + 4, hz - 6, 2, 2, '#ffb040')
        return {
          r,
          fx: new Particles(),
          smoke: new Particles(),
          bg,
          rays: canvas(w, h),
          cloud: puffs(r, 8, cw),
          small: puffs(r, 5, Math.max(40, sz.w * 1.1)),
          bolts: TH_STRIKES.map(([at, d, side]) => {
            const c = cloudAt(at)
            const [x, y] = strikeAt(d, side)
            return bolt(r, c.x + (x - c.x) * 0.3, c.y + 6 * c.s, x, y, 0.3, 5)
          }),
          // A ring of bolts in perspective round where it will be: the far ones behind it, the near in front.
          cage: [0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2 + 0.5
            const x = cx + Math.cos(a) * cageR
            const y = ground + Math.sin(a) * cageR * 0.22
            return bolt(r, x + r.range(-8, 8), h * 0.14, x, y, 0.22, 5)
          }),
          shakes: p.short
            ? []
            : [
                ...TH_STRIKES.map(([at], i) => [at, 0.2, 1 + Math.floor(i / 2)] as [number, number, number]),
                [TH_CAGE, 0.5, 3],
                [TH_FOLD, 0.5, 4],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.smoke.update(dt)
        // Each strike: sparks, and a fire that keeps burning in the field.
        TH_STRIKES.forEach(([at, d, side]) => {
          const [x, y] = strikeAt(d, side)
          if (within(t, at, at + dt))
            for (let i = 0; i < (8 + d * 20) * many; i++)
              s.fx.add({
                x,
                y,
                vx: r.range(-60, 60) * (0.4 + d),
                vy: -r.range(20, 90) * (0.4 + d),
                ay: 240,
                life: r.range(0.3, 0.6),
                size: 1,
                shape: 'px',
                colors: ['#ffffff', '#e4d4ff', '#ffb040'],
              })
          if (t > at && r() < (0.12 + d * 0.3) * many)
            s.smoke.add({
              x: x + r.range(-2, 2),
              y: y - 2,
              vx: r.range(-4, 4) + (t > TH_OVER ? -10 : 0),
              vy: -r.range(8, 18),
              life: r.range(1, 2),
              size: Math.round(1 + d * 3),
              size1: Math.round(2 + d * 5),
              shape: 'smoke',
              colors: ['#4a3a3a', '#3a2e30', '#2a2228'],
            })
        })
        // Under the cloud once it's overhead: arcs crawling along its belly.
        if (t > TH_OVER && t < R && r() < 0.5 * many) {
          const c = cloudAt(t)
          const x = c.x + r.range(-cw * 0.45, cw * 0.45)
          s.fx.add({
            x,
            y: c.y + r.range(4, 12),
            vx: r.range(-80, 80),
            life: 0.15,
            size: 1,
            shape: 'streak',
            trail: 0.08,
            colors: ['#ffffff', TH_AURA[1]],
          })
        }
        if (within(t, TH_FOLD, TH_FOLD + dt))
          for (let i = 0; i < 60 * many; i++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: cx + Math.cos(a) * 6,
              y: ground,
              vx: Math.cos(a) * r.range(80, 200),
              vy: Math.sin(a) * r.range(10, 40),
              drag: 2,
              life: r.range(0.4, 0.8),
              size: 1,
              shape: 'px',
              colors: ['#ffffff', TH_AURA[1], TH_AURA[2]],
            })
          }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, TH_AURA)
        if (t > R && r() < 0.15)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h),
            vx: r.range(-30, 30),
            life: 0.12,
            size: 1,
            shape: 'streak',
            trail: 0.06,
            colors: ['#ffffff', TH_AURA[1]],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#1a1030'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // The storm's dark comes with the cloud.
        const dark = span(t, 0.8, TH_OVER + 0.5) * (1 - span(t, R, R + 0.6) * 0.5)
        if (dark > 0) wash(g, '#0a0614', dark * 0.6, 8)
        // The fires it left.
        TH_STRIKES.forEach(([at, d, side]) => {
          if (t < at) return
          const [x, y] = strikeAt(d, side)
          fire(g, x, y, d, t, at)
        })
        s.smoke.draw(g)
        // The ring of thunder running out over the field.
        const rq = span(t, TH_FOLD, TH_FOLD + 0.6)
        if (rq > 0 && rq < 1) {
          const rr = Math.round(lerp(8, w * 0.8, ease.outC(rq)))
          ellipseLine(g, cx, ground, rr, Math.round(rr * 0.22), TH_AURA[1])
          ellipseLine(g, cx, ground, rr - 2, Math.round(rr * 0.22) - 1, TH_AURA[2])
          ellipseLine(
            g,
            cx,
            ground,
            Math.round(rr * 0.8),
            Math.round(rr * 0.17),
            pattern(g, TH_AURA[2], 8) as string,
          )
        }
        // The cloud racing at us.
        const c = cloudAt(t)
        if (t > 0.6) drawCloud(g, s.cloud, c.x, c.y, c.s, TH_CLOUD)
        // Its flickers from inside, between strikes.
        if (t > 0.6 && t < R && Math.floor(t * 23) % 9 === 0)
          g.drawImage(
            glow(Math.round(cw * 0.3 * c.s), '#6a4aa8', 1.4, 0.5),
            c.x - Math.round(cw * 0.3 * c.s),
            c.y - Math.round(cw * 0.3 * c.s),
          )
        // The strikes: each a bolt for a tenth of a second.
        TH_STRIKES.forEach(([at, d], i) => {
          if (within(t, at, at + 0.12)) drawBolt(g, s.bolts[i]!, Math.max(1, Math.round(1 + d * 4)))
        })
        // The cage: five bolts standing round the middle, flickering, then folding into it.
        const cageOn = t >= TH_CAGE && t < TH_FOLD + 0.05
        const fold = span(t, TH_FOLD - 0.25, TH_FOLD)
        const drawCage = (front: boolean) =>
          s.cage.forEach((pts, i) => {
            const a = (i / 6) * Math.PI * 2 + 0.5
            if (Math.sin(a) > 0 !== front || Math.floor(t * 30 + i * 3) % 5 === 0) return
            const bent = fold > 0 ? pts.map(([x, y]) => [lerp(x, cx, fold), y] as Pt) : pts
            drawBolt(g, bent, front ? 3 : 2)
            // Where each one stands, the field is scorched and crackling.
            const [ex, ey] = pts.at(-1)!
            ellipse(g, ex, ey, front ? 5 : 3, 1, '#ffffff')
          })
        if (cageOn) {
          const ar = Math.round(m * 0.25)
          g.drawImage(glow(ar, TH_AURA[2], 1.4, 0.4), cx - ar, feet - 30 - ar)
          drawCage(false)
        }
        // It drops through the cage out of the cloud.
        if (t >= TH_DROP && t < R) {
          const q = ease.outQ(span(t, TH_DROP, TH_FOLD))
          drawSprite(g, p.mon, cx, Math.round(lerp(c.y, feet, q)), {
            sil: '#0a0614',
            outline: Math.floor(t * 20) % 2 ? TH_AURA[0] : TH_AURA[1],
          })
        }
        if (cageOn) drawCage(true)
        if (t >= R) {
          seat(g, s.small, cx, feet, t, TH_CLOUD)
          revealFx(g, s.rays, p.mon, cx, feet, t, R, TH_AURA, Math.max(w, h) * 0.7)
        }
        s.fx.draw(g)
        g.restore()
        // Flashes: on the strikes far enough apart, the cage, the reveal.
        for (const at of [0.95, 1.62, 2.14]) if (within(t, at, at + 0.1)) screenFlash(g, '#d8c8ff', 0.25)
        if (within(t, TH_CAGE, TH_CAGE + 0.12)) screenFlash(g, '#e8dcff', 0.4)
        if (within(t, TH_FOLD, TH_FOLD + 0.12)) screenFlash(g, '#ffffff', 0.35)
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(2.6, { freq: 160, type: 'lowpass', vol: 0.05, slide: 60 }))],
          ...TH_STRIKES.map(
            ([at, d]) =>
              [
                at,
                quiet(() => {
                  fxSound('thunder.strike')
                  hiss(0.6 + d, { freq: 120 + d * 80, type: 'lowpass', vol: 0.06 + d * 0.1 })
                }),
              ] as const,
          ),
          [TH_OVER, quiet(() => tone(55, 1.2, { type: 'sawtooth', vol: 0.03, slide: 20 }))],
          [3.0, quiet(() => fxSound('thunder.charge'))],
          [TH_CAGE, quiet(() => (fxSound('thunder.strike'), hiss(1.2, { freq: 3000, q: 2, vol: 0.04 })))],
          [3.75, quiet(() => fxSound('legend.heart'))],
          [
            TH_FOLD,
            quiet(() => (fxSound('thunder.strike'), hiss(0.8, { freq: 150, type: 'lowpass', vol: 0.16 }))),
          ],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<THS>[]),
    }
  },
}

/** A violet bolt: a dark halo, the lilac body, the white core. */
function drawBolt(g: G, pts: Pt[], wd: number) {
  polyline(
    g,
    pts.map(([x, y]) => [x + 1, y] as Pt),
    '#5a2aa8',
    wd + 1,
  )
  polyline(g, pts, '#c8b0ff', wd)
  polyline(g, pts, '#ffffff', Math.max(1, wd - 2))
}

/** A field fire where a bolt struck: flames licking, their size by how near it is. */
function fire(g: G, x: number, y: number, d: number, t: number, at: number) {
  const s = (0.6 + d * 2.4) * Math.min(1, (t - at) * 4)
  const n = 3
  for (let i = 0; i < n; i++) {
    const ox = (i - 1) * 3 * s
    const ht = (5 + 3 * Math.sin(t * 17 + i * 2 + x)) * s
    tri(g, x + ox - 2 * s, y, x + ox + 2 * s, y, x + ox + Math.sin(t * 9 + i) * s, y - ht, '#e0501e')
    tri(g, x + ox - s, y, x + ox + s, y, x + ox + Math.sin(t * 11 + i) * s * 0.6, y - ht * 0.6, '#ffc040')
  }
  rect(g, x - 3 * s, y, 6 * s, 1, '#2a1408')
}

// ================================================================================================= Landorus

const LA_AURA: Aura = ['#ffffff', '#ffecb0', '#e0a040', '#7a4a1a']
const LA_CLOUD = ['#a86a2a', '#e0a050', '#ffe0a0'] as const
const LA_SUN = 0.9
const LA_RUMBLE = 1.9
const LA_LIFT = 2.3
const LA_WAVE = 3.2
const LA_CRUMBLE = 4.2
const LA_REVEAL = 4.7

type LAS = {
  r: Rng
  fx: Particles
  smoke: Particles
  bg: Canvas
  gold: Canvas
  rays: Canvas
  sunRays: Canvas
  cloud: Puff[]
  small: Puff[]
  rocks: { a: number; r: number; y: number; s: number; sp: number; pts: Pt[] }[]
  stumps: [number, number, number][]
  warm: Canvas
  cracks: Pt[][]
  shakes: [number, number, number][]
}

/** The harvest: tall wheat in rows, gold heads, green at its feet. */
function wheat(w: number, h: number, hz: number, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, h - hz, ['#c8a040', '#a8802a', '#7a5a1a', '#4a3a10']), 0, hz)
  for (let i = 0; i < Math.round((w * (h - hz)) / 6); i++) {
    const y = hz + (h - hz) * r() ** 1.4
    const d = depth(y, hz, h)
    const x = r.range(0, w)
    const ht = Math.max(1, Math.round(2 + d * 9))
    rect(g, x, y - ht, 1, ht, r() < 0.3 ? '#5a8a2a' : '#c89a3a')
    rect(g, x, y - ht, 1, Math.max(1, Math.round(ht * 0.35)), r() < 0.5 ? '#ffe080' : '#f0c050')
  }
  return cv
}

export const landorusCinema: Cinema = {
  reveal: LA_REVEAL,
  dur: LA_REVEAL + AFTER_REVEAL,
  make(p: CinemaParams): Timeline<LAS> {
    const F = frame(p)
    const { w, h, cx, m, feet, hz, sz, many, quiet } = F
    const R = LA_REVEAL
    const cw = Math.round(Math.min(w * 0.7, m * 0.9))
    const shrine = { x: cx, y: hz - 6 }
    const wave = (t: number) => ease.outC(span(t, LA_WAVE, LA_WAVE + 1.1))
    return {
      id: 'cinema-landorus',
      dur: R + AFTER_REVEAL,
      setup() {
        const r = rng(645)
        const bg = country(
          w,
          h,
          hz,
          {
            sky: ['#5a5a62', '#7a7470', '#9a8a7a', '#b8a088'],
            hills: ['#6a6058', '#3e3630', '#7a6a5a'],
            field: ['#3e342c', '#4a3e34', '#342a24', '#2e2620', '#46382c'],
            furrow: '#141010',
            crop: ['#221a16', '#5a4a3a'],
          },
          r,
        )
        // The Abundant Shrine on its hill: a mound, the shrine's stone roof, its posts, a little pond.
        const g = bg.g
        ellipse(g, shrine.x, hz, Math.round(m * 0.22), 10, '#3e3630')
        rect(g, shrine.x - 6, shrine.y - 6, 12, 7, '#2a2420')
        tri(g, shrine.x - 10, shrine.y - 6, shrine.x + 10, shrine.y - 6, shrine.x, shrine.y - 13, '#4a3a2e')
        rect(g, shrine.x - 10, shrine.y - 6, 20, 1, '#7a6a5a')
        rect(g, shrine.x - 5, shrine.y - 5, 1, 6, '#5a4a3a')
        rect(g, shrine.x + 4, shrine.y - 5, 1, 6, '#5a4a3a')
        ellipse(g, shrine.x + 14, hz + 2, 5, 1, '#5a6a72')
        // Burnt stumps of the last storm, still smoking.
        const stumps: [number, number, number][] = []
        for (let i = 0; i < 7; i++) {
          const y = Math.round(hz + (h - hz) * r.range(0.1, 0.9) ** 1.4)
          const d = depth(y, hz, h)
          const x = r.range(0, w)
          stumps.push([x, y - Math.round(2 + d * 8), d])
          rect(
            g,
            x,
            y - Math.round(2 + d * 8),
            Math.max(1, Math.round(d * 3)),
            Math.round(2 + d * 8),
            '#120e0c',
          )
        }
        // The cracks the earth will glow along, out from where it will stand.
        const cracks = Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
          return bolt(
            r,
            cx,
            feet + 4,
            cx + Math.cos(a) * w * 0.6,
            feet + 4 + Math.sin(a) * (h - hz) * 0.5,
            0.3,
            4,
          )
        })
        const rocks = Array.from({ length: p.short ? 5 : 8 }, (_, i) => {
          const s = r.range(m * 0.035, m * 0.065)
          return {
            a: (i / 8) * Math.PI * 2,
            r: r.range(m * 0.3, m * 0.44),
            y: r.range(-10, 10),
            s,
            sp: r.range(0.6, 1.1),
            pts: Array.from({ length: 5 }, (_, k) => {
              const aa = (k / 5) * Math.PI * 2 + r.range(-0.3, 0.3)
              const rr = s * r.range(0.7, 1.2)
              return [Math.cos(aa) * rr, Math.sin(aa) * rr * 0.8] as Pt
            }),
          }
        })
        return {
          r,
          fx: new Particles(),
          smoke: new Particles(),
          bg,
          gold: wheat(w, h, hz, r),
          rays: canvas(w, h),
          sunRays: canvas(w, h),
          cloud: puffs(r, 6, cw),
          small: puffs(r, 5, Math.max(40, sz.w * 1.1)),
          rocks,
          stumps,
          cracks,
          warm: dGradient(w, hz, ['#6a7ab0', '#c89a8a', '#f0b878', '#ffd8a0']),
          shakes: p.short
            ? []
            : [
                [LA_RUMBLE, 0.8, 1],
                [LA_LIFT, 0.6, 2],
                [LA_WAVE, 0.5, 2],
                [LA_CRUMBLE, 0.4, 3],
                [R, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.smoke.update(dt)
        // Smoke still rising in thin columns off the burnt stumps, until the harvest.
        if (t < LA_WAVE - 0.2 && r() < 0.5 * many) {
          const [x, y, d] = r.pick(s.stumps)
          s.smoke.add({
            x: x + r.range(-1, 1),
            y,
            vx: r.range(1, 4),
            vy: -r.range(8, 14) * (0.5 + d),
            life: 1.3,
            size: Math.round(1 + d * 2),
            size1: Math.round(3 + d * 6),
            shape: 'smoke',
            density: 0.6,
            colors: ['#6a6260', '#5a5452', '#4a4644'],
          })
        }
        // The rumble: grit jumping off the ground.
        if (t > LA_RUMBLE && t < LA_WAVE && r() < 0.6 * many)
          s.fx.add({
            x: r.range(0, w),
            y: r.range(hz + 6, h),
            vy: -r.range(20, 50),
            ay: 260,
            life: 0.4,
            size: 1,
            shape: 'px',
            colors: ['#7a6a5a', '#4a3e34'],
          })
        // The harvest's edge: seeds and petals thrown up as it passes.
        const q = wave(t)
        if (q > 0 && q < 1)
          for (let i = 0; i < 4 * many + 1; i++) {
            const a = r() * Math.PI * 2
            const rx = q * w * 0.75
            s.fx.add({
              x: cx + Math.cos(a) * rx,
              y: feet + 4 + Math.sin(a) * rx * 0.35,
              vx: r.range(-10, 10),
              vy: -r.range(20, 50),
              ay: 20,
              life: r.range(0.8, 1.4),
              size: 2,
              shape: r() < 0.3 ? 'leaf' : 'sq',
              size1: 1,
              spin: r.range(-6, 6),
              colors: r() < 0.3 ? ['#ff9ab8', '#ffd0e0'] : ['#ffe080', '#c8e070', '#7ab840'],
            })
          }
        // The rocks crumble to dust.
        if (within(t, LA_CRUMBLE, LA_CRUMBLE + dt))
          for (const rk of s.rocks) {
            const [x, y] = rockAt(rk, t, cx, feet)
            for (let i = 0; i < 10 * many; i++)
              s.fx.add({
                x,
                y,
                vx: r.range(-40, 40),
                vy: r.range(-40, 20),
                ay: 120,
                drag: 1,
                life: r.range(0.4, 0.9),
                size: r.int(1, 2),
                shape: r() < 0.6 ? 'px' : 'smoke',
                colors: ['#c8a070', '#8a6a4a', '#5a4632'],
              })
          }
        if (within(t, R, R + dt)) revealBurst(s.fx, r, cx, feet - 30, 50 * many, LA_AURA)
        if (t > R && r() < 0.25 * many)
          s.fx.add({
            x: r.range(0, w),
            y: h + 2,
            vx: r.range(-6, 6),
            vy: -r.range(12, 24),
            life: 5,
            size: 2,
            shape: 'leaf',
            spin: r.range(-2, 2),
            colors: [r() < 0.4 ? '#ff9ab8' : '#ffe080'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#5a5a62'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // The sky warming as the sun breaks through, behind the hills (the hills are drawn again over it).
        const warmK = ease.ioS(span(t, LA_SUN + 0.3, LA_WAVE))
        if (warmK > 0) {
          dissolve(g, s.warm, warmK)
          g.drawImage(s.bg, 0, hz - 24, w, 24, 0, hz - 24, w, 24)
        }
        // The sun breaking through round the golden cloud: the sky warms, rays fan down.
        const sun = span(t, LA_SUN, LA_SUN + 1.4)
        if (sun > 0) {
          const sx = Math.round(lerp(-cw * 0.6, cx, ease.outC(span(t, LA_SUN, LA_CRUMBLE))))
          const sy = Math.round(h * 0.18)
          g.drawImage(
            glow(Math.round(m * 0.5), '#ffd890', 1.3, 0.4 * sun),
            sx - Math.round(m * 0.5),
            sy - Math.round(m * 0.5),
          )
          const k = sun * (t > R ? 0.2 : 0.3)
          // The rays are a full-screen pass: redrawn only every third frame.
          if (Math.floor(t * 60) % 3 === 0) drawRays(s.sunRays, { x: sx, y: sy }, t * 0.3, '#ffe0a0', k)
          g.drawImage(s.sunRays, 0, 0)
        }
        // The cracks glowing as the earth wakes.
        const crackK = span(t, LA_RUMBLE, LA_LIFT) * (1 - span(t, LA_WAVE, LA_WAVE + 0.6))
        if (crackK > 0)
          s.cracks.forEach((pts, i) => {
            const n = Math.max(2, Math.round(pts.length * Math.min(1, crackK * 1.5 - i * 0.05)))
            polyline(g, pts.slice(0, n), crackK > 0.6 ? '#ffb040' : '#a8501e')
          })
        // The harvest sweeping out: inside its ring the burnt field is gold wheat.
        const q = wave(t)
        if (q > 0) {
          const rx = q * w * 0.8 + 4
          const ry = q * (h - hz) * 0.9 + 2
          const y0 = feet + 4
          for (let y = hz; y < h; y++) {
            const dy = (y - y0) / ry
            if (Math.abs(dy) >= 1) continue
            const hw = Math.round(rx * Math.sqrt(1 - dy * dy))
            const a = Math.max(0, cx - hw)
            const b = Math.min(w, cx + hw)
            if (b > a) g.drawImage(s.gold, a, y, b - a, 1, a, y, b - a, 1)
            // Its edge: a band of new green.
            if (q < 1) {
              rect(g, cx - hw, y, 2, 1, '#7ac840')
              rect(g, cx + hw - 2, y, 2, 1, '#7ac840')
            }
          }
          // Wheat swaying: bright heads rolling over it.
          for (let i = 0; i < 5; i++) {
            const y = Math.round(hz + (h - hz) * ((i + 0.5) / 5) ** 1.5)
            const L = Math.round(6 + depth(y, hz, h) * 24)
            const x = Math.round(((t * 30 + i * 53) % (w + L)) - L)
            const dy = (y - y0) / ry
            if (Math.abs(dy) < 1 && Math.abs(x - cx) < rx * Math.sqrt(1 - dy * dy))
              rect(g, x, y - 3, L, 1, '#fff0a0')
          }
        }
        s.smoke.draw(g)
        // The golden cloud gliding in, slow, then settling as its seat.
        const cq = ease.ioS(span(t, 0.7, LA_CRUMBLE))
        if (t < R) drawCloud(g, s.cloud, lerp(-cw, cx, cq), lerp(h * 0.2, h * 0.24, cq), 1, LA_CLOUD)
        // The rocks lifting out of the earth, turning round the middle.
        if (t >= LA_LIFT && t < LA_CRUMBLE)
          for (const rk of s.rocks) {
            const [x, y] = rockAt(rk, t, cx, feet)
            const pts = rk.pts.map(([px, py]) => [x + px, y + py] as Pt)
            for (let i = 1; i < pts.length - 1; i++)
              tri(
                g,
                pts[0]![0],
                pts[0]![1],
                pts[i]![0],
                pts[i]![1],
                pts[i + 1]![0],
                pts[i + 1]![1],
                '#5a4632',
              )
            tri(g, pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1], x, y, '#8a6a4a')
            rect(g, x - 1, y - rk.s * 0.6, 2, 1, '#c8a070')
          }
        // It comes down on its cloud.
        if (t >= LA_CRUMBLE && t < R) {
          const dq = ease.outQ(span(t, LA_CRUMBLE, R))
          const y = Math.round(lerp(h * 0.24, feet, dq))
          drawCloud(g, s.small, cx, y + 2, 1, LA_CLOUD)
          drawSprite(g, p.mon, cx, y, {
            sil: '#4a2a10',
            outline: Math.floor(t * 14) % 2 ? LA_AURA[1] : LA_AURA[2],
          })
        }
        if (t >= R) {
          seat(g, s.small, cx, feet, t, LA_CLOUD)
          revealFx(g, s.rays, p.mon, cx, feet, t, R, LA_AURA, Math.max(w, h) * 0.7)
        }
        s.fx.draw(g)
        g.restore()
        // The overcast lifting with the sun.
        const grey = 0.35 * (1 - span(t, LA_SUN, LA_WAVE + 0.6))
        if (grey > 0) wash(g, '#2a2a30', grey, 8)
        if (within(t, LA_WAVE, LA_WAVE + 0.2)) screenFlash(g, '#fff4d0', 0.3)
        if (within(t, R, R + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, R, R + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(1.5, { freq: 300, q: 1, vol: 0.02 }))],
          [
            LA_SUN,
            quiet(() =>
              [523, 659, 784].forEach((f, i) => tone(f, 1.6, { type: 'sine', vol: 0.02, at: i * 0.25 })),
            ),
          ],
          [
            LA_RUMBLE,
            quiet(() => (hiss(1.4, { freq: 120, type: 'lowpass', vol: 0.12 }), tone(41, 1.4, { vol: 0.08 }))),
          ],
          [LA_LIFT, quiet(() => tone(82, 0.9, { type: 'sawtooth', vol: 0.03, slide: 80 }))],
          [
            LA_WAVE,
            quiet(() => {
              hiss(1.1, { freq: 900, slide: 1200, vol: 0.05 })
              ;[784, 988, 1175, 1568].forEach((f, i) =>
                tone(f, 0.4, { type: 'triangle', vol: 0.025, at: i * 0.15 }),
              )
            }),
          ],
          [3.9, quiet(() => fxSound('legend.heart'))],
          [LA_CRUMBLE, quiet(() => hiss(0.6, { freq: 400, type: 'lowpass', vol: 0.1 }))],
          [R, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<LAS>[]),
    }
  },
}

/** A lifted rock at t: rising out of the ground, then turning round the middle on a flattened ring. */
function rockAt(
  rk: { a: number; r: number; y: number; sp: number },
  t: number,
  cx: number,
  feet: number,
): Pt {
  const lift = ease.outC(span(t, LA_LIFT, LA_LIFT + 0.8))
  const a = rk.a + (t - LA_LIFT) * rk.sp
  const x = cx + Math.cos(a) * rk.r
  const y = feet + 6 - lift * (56 + rk.y * 1.5) + Math.sin(a) * rk.r * 0.25
  // Pulled in to the middle just before they crumble.
  const pull = ease.inQ(span(t, LA_CRUMBLE - 0.35, LA_CRUMBLE))
  return [lerp(x, cx, pull * 0.7), lerp(y, feet - 30, pull * 0.7)]
}
