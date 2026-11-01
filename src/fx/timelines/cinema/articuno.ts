// Articuno's raid entrance (docs/53): Seafoam's ice cavern at night. Moonlight falls through a hole in the cave's roof,
// snow sifting down its shaft onto black water; icicles hang everywhere. The cold comes: the water freezes over from
// both shores, frost grows across the screen's corners, an icicle cracks loose and shatters on the new ice. A huge
// winged shadow crosses the hole and the light dims; then Articuno comes down the shaft in silhouette, diamond dust
// trailing from its wings, the snow turning round it. One beat of its wings: a blizzard gust, a white-out, the reveal.
// It hovers over the frozen pool, mirrored in the ice.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  cached,
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  makeShard,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
  inOrder,
} from './kit'

const T_FREEZE = 1.5
const T_DROP = 2.25
const T_SHADOW = 2.95
const T_DESC = 3.5
const T_GUST = 4.45
const REVEAL = 4.7
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'] as const
const ICE = { lit: '#e8faff', body: '#8fc8e4', mid: '#5a98bc', dark: '#2a5a7e', deep: '#14304a' }

interface Layout {
  cx: number
  water: number
  feet: number
  hole: { rx: number; ry: number }
  /** Where the icicle that falls hangs, and how long it is. */
  drop: { x: number; len: number }
}

type S = {
  r: Rng
  snow: Particles
  fx: Particles
  dust: Particles
  shards: Shard[]
  cave: Canvas
  ice: Canvas
  rays: Canvas
  frost: [number, number][][]
  shakes: [number, number, number][]
}

function layout(w: number, h: number): Layout {
  const cx = Math.round(w / 2)
  return {
    cx,
    water: Math.round(h * 0.74),
    feet: Math.round(h * 0.62),
    hole: { rx: Math.round(Math.max(26, w * 0.2)), ry: Math.round(Math.max(14, h * 0.06)) },
    drop: { x: Math.round(cx - Math.max(30, w * 0.28)), len: 26 },
  }
}

/** An icicle hanging from y0: a long thin triangle, lit on its left edge. */
function icicle(g: G, x: number, y0: number, wd: number, len: number) {
  tri(g, x - wd, y0, x + wd, y0, x, y0 + len, ICE.mid)
  tri(g, x - wd, y0, x, y0, x, y0 + len, ICE.body)
  line(g, x - wd + 1, y0, x, y0 + len - 1, ICE.lit)
}

/** The cavern, drawn once: its walls of ice, the roof's hole onto the night, the icicles, the black water. */
function cave(w: number, h: number, L: Layout, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const { cx, water, hole } = L
  g.drawImage(dGradient(w, water, ['#050d18', '#0b1d30', '#14344e', '#1c4866']), 0, 0)
  // Faceted ice on the back wall: slanted planes catching the light.
  for (let i = 0; i < Math.round(w / 6); i++) {
    const x = r.range(-10, w + 10)
    const y = r.range(water * 0.25, water)
    const s = r.range(6, 18)
    tri(g, x, y, x + s * 0.6, y - s, x + s * 1.2, y + 2, r() < 0.5 ? '#18405c' : '#0f2c44')
    line(g, x, y, x + s * 0.6, y - s, '#2c6488')
  }
  // Ice pillars in the back, from floor to roof.
  for (const k of [-1, 1]) {
    const x = Math.round(cx + k * Math.max(hole.rx + 18, w * 0.3))
    const pw = Math.max(8, Math.round(w * 0.04))
    rect(g, x - pw, 0, pw * 2, water, '#123650')
    rect(g, x - pw, 0, 2, water, '#3a7aa0')
    rect(g, x + pw - 2, 0, 2, water, '#0a2236')
    for (let y = 10; y < water; y += 17) rect(g, x - pw + 3, y, pw, 1, '#1e4a6a')
  }
  // The roof, a band of ice, and the hole in it showing the night sky and its stars.
  rect(g, 0, 0, w, 10, ICE.deep)
  g.fillStyle = '#050a1c'
  ellipse(g, cx, -2, hole.rx, hole.ry, '#060c22')
  for (let i = 0; i < 18; i++) {
    const a = r.range(Math.PI * 0.05, Math.PI * 0.95)
    const d = r.range(0.2, 0.9)
    rect(
      g,
      cx + Math.cos(a) * hole.rx * d,
      -2 + Math.sin(a) * hole.ry * d,
      1,
      1,
      r() < 0.3 ? '#ffffff' : '#8aa8d8',
    )
  }
  // The hole's lit rim.
  for (let x = -hole.rx; x <= hole.rx; x++) {
    const y = Math.round(-2 + hole.ry * Math.sqrt(Math.max(0, 1 - (x * x) / (hole.rx * hole.rx))))
    rect(g, cx + x, y, 1, 2, x % 3 ? ICE.body : ICE.lit)
  }
  // Icicles all along the roof, leaving the hole and the one that falls.
  for (let x = 2; x < w; x += r.int(4, 9)) {
    if (Math.abs(x - cx) < hole.rx + 2 || Math.abs(x - L.drop.x) < 5) continue
    const big = r() < 0.25
    icicle(g, x, 8, big ? 3 : 2, big ? r.range(22, 46) : r.range(6, 18))
  }
  // Crystal clusters on both shores: tall points, a lit face and a dark one.
  for (const side of [-1, 1]) {
    const base = side < 0 ? Math.round(w * 0.1) : Math.round(w * 0.9)
    for (let i = 0; i < 5; i++) {
      const x = base + side * (i * 7 - 10) + r.int(-2, 2)
      const ht = Math.round([30, 44, 22, 36, 16][i]! * Math.min(1, h / 260) + 8)
      const cw = r.int(3, 5)
      const y = water - 4
      rect(g, x - cw, y - ht, cw, ht, '#5a98bc')
      rect(g, x, y - ht, cw, ht, '#2a5a7e')
      tri(g, x - cw, y - ht, x + cw, y - ht, x, y - ht - cw * 2, '#8fc8e4')
      rect(g, x - cw, y - ht, 1, ht, '#c8f0ff')
    }
  }
  // Ice shelves at the water's edge, both sides.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w
    const reach = Math.round(Math.max(24, w * 0.22))
    for (let i = 0; i < reach; i++) {
      const x = x0 - side * i
      const top = water - 6 + Math.round((i / reach) ** 2 * 6) + (i % 7 === 0 ? -2 : 0)
      rect(g, x, top, 1, water - top + 4, i % 2 ? ICE.dark : '#336a90')
      rect(g, x, top, 1, 1, ICE.lit)
    }
  }
  g.drawImage(dGradient(w, h - water, ['#0a2236', '#06131f', '#030a12']), 0, water)
  rect(g, 0, water, w, 1, '#3a7aa0')
  return cv
}

/** The pool frozen: pale ice with cracks, drawn once and uncovered from the shores in. */
function iceSheet(w: number, h: number, L: Layout, r: Rng): Canvas {
  const cv = canvas(w, h - L.water)
  const g = cv.g
  g.drawImage(dGradient(w, h - L.water, ['#5a98bc', '#2e6a90', '#163e5c', '#0c2438']), 0, 0)
  rect(g, 0, 0, w, 1, ICE.lit)
  for (let i = 0; i < 9; i++) {
    const x = r.range(0, w)
    polyline(g, bolt(r, x, 0, x + r.range(-40, 40), h - L.water, 0.4, 3), '#8fc8e4')
  }
  return cv
}

/** Frost growing in from the four corners: branching lines, drawn in order of growth. */
function frostLines(w: number, h: number, r: Rng): [number, number][][] {
  const out: [number, number][][] = []
  const corners: [number, number, number][] = [
    [0, 0, Math.PI * 0.25],
    [w, 0, Math.PI * 0.75],
    [0, h, -Math.PI * 0.25],
    [w, h, -Math.PI * 0.75],
  ]
  const reach = Math.min(w, h) * 0.32
  for (const [x, y, a0] of corners)
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k - 1.5) * 0.35
      const len = reach * r.range(0.6, 1)
      const main = bolt(r, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.18, 4)
      out.push(main)
      // Side branches off the main one, shorter.
      for (let b = 2; b < main.length - 2; b += 3) {
        const [bx, by] = main[b]!
        const ba = a + (b % 2 ? 0.8 : -0.8)
        const bl = len * 0.25 * (1 - b / main.length)
        out.push(bolt(r, bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, 0.2, 2))
      }
    }
  return out
}

export const articunoCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const L = layout(w, h)
    const { cx, water, hole } = L
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const many = p.short ? 0.4 : 1
    // The shaft of moonlight: from the hole to the water, widening.
    const shaft = { top: hole.rx * 0.7, bottom: hole.rx * 1.25 }
    const inShaft = (r: Rng) => cx + r.range(-shaft.top, shaft.top)
    return {
      id: 'cinema-articuno',
      dur: DUR,
      setup() {
        const r = rng(144)
        return {
          r,
          snow: new Particles(),
          fx: new Particles(),
          dust: new Particles(),
          shards: [],
          cave: cave(w, h, L, r),
          ice: iceSheet(w, h, L, r),
          rays: canvas(w, h),
          frost: frostLines(w, h, r),
          shakes: p.short
            ? []
            : [
                [T_GUST, 0.5, 2],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.snow.update(dt)
        s.fx.update(dt)
        s.dust.update(dt)
        stepShards(s.shards, dt, { floor: water + 1 })
        // Snow: in the shaft, thicker as the cold comes; then whirling round it as it comes down.
        const thick = t < T_FREEZE ? 0.5 : t < REVEAL ? 0.9 : 0.6
        if (r() < thick * many)
          s.snow.add({
            x: r() < 0.7 ? inShaft(r) : r.range(0, w),
            y: -2,
            vx: t < T_FREEZE ? r.range(-4, 4) : -r.range(4, 16),
            vy: r.range(12, 24),
            life: 9,
            size: r.int(1, 2),
            shape: 'flake',
            colors: ['#ffffff', '#c8f4ff'],
          })
        if (t > T_DESC && t < T_GUST && r() < 0.8 * many) {
          const a = r() * Math.PI * 2
          const R = r.range(20, 50)
          const y = lerp(-40, L.feet - 30, ease.outC(span(t, T_DESC, T_GUST - 0.1)))
          s.snow.add({
            x: cx + Math.cos(a) * R,
            y: y + Math.sin(a) * R * 0.5,
            vx: -Math.sin(a) * 60,
            vy: Math.cos(a) * 30,
            home: { x: cx, y, k: 120 },
            life: 0.7,
            size: 1,
            shape: 'flake',
            colors: ['#ffffff', '#c8f4ff'],
          })
        }
        // Diamond dust off it as it comes down.
        if (t > T_DESC && t < REVEAL + 2 && r() < 0.6 * many) {
          const sz = spriteSize(p.mon)
          const y = t < REVEAL ? lerp(-40, L.feet, ease.outC(span(t, T_DESC, T_GUST - 0.1))) : L.feet
          s.dust.add({
            x: cx + r.range(-sz.w / 2, sz.w / 2),
            y: y - r.range(0, sz.h),
            vy: r.range(6, 16),
            vx: r.range(-4, 4),
            life: r.range(0.6, 1.4),
            size: r.int(1, 2),
            shape: 'star',
            colors: ['#ffffff', '#e8faff', '#9fe0f4'],
          })
        }
        // The icicle lands and shatters.
        if (t >= T_DROP + 0.42 && t - dt < T_DROP + 0.42)
          for (let i = 0; i < 26 * many + 6; i++) {
            const sh = makeShard(
              r,
              L.drop.x,
              water,
              r.range(60, 130),
              r() < 0.5 ? ICE.body : ICE.lit,
              '#ffffff',
              0.9,
            )
            sh.r = r.range(1, 3)
            s.shards.push(sh)
          }
        // The gust: snow flung both ways.
        if (t >= T_GUST && t - dt < T_GUST)
          for (let i = 0; i < 160 * many; i++) {
            const side = r() < 0.5 ? -1 : 1
            s.fx.add({
              x: cx + side * r.range(0, 20),
              y: L.feet - r.range(0, 70),
              vx: side * r.range(140, 320),
              vy: r.range(-40, 40),
              drag: 1.2,
              life: r.range(0.6, 1.2),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'flake' : 'px',
              colors: ['#ffffff', '#e8faff', '#c8f4ff'],
            })
          }
        if (t >= REVEAL && t - dt < REVEAL)
          for (let k = 0; k < 40 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 150)
            s.fx.add({
              x: cx,
              y: L.feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.2,
              life: r.range(0.6, 1.1),
              size: 3,
              shape: 'flake',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#02060c'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.cave, 0, 0)
        // The pool: black water with light rolling on it, frozen from the shores in.
        const fq = ease.ioS(span(t, T_FREEZE, T_FREEZE + 1.1))
        for (let y = water + 3; y < h; y += 4) {
          const off = Math.round((t * 10 + y * 5) % 14)
          for (let x = -14 + off; x < w; x += 14) rect(g, x, y, 5, 1, '#1a4a6a')
        }
        if (fq > 0) {
          const reach = (w / 2 + 6) * fq
          for (let x = 0; x < w; x++) {
            const d = w / 2 - Math.abs(x + 0.5 - w / 2)
            // The frozen edge is ragged: the dither decides the last few columns.
            if (d < reach - 3 || (d < reach + 3 && ((x * 7) % 5) / 5 < span(reach - d, -3, 3)))
              g.drawImage(s.ice, x, 0, 1, h - water, x, water, 1, h - water)
          }
        }
        // The shaft of moonlight and its shine on the water; dimmed while the shadow crosses, bright as it comes.
        const pass = Math.sin(Math.PI * span(t, T_SHADOW, T_SHADOW + 0.55))
        const sk = Math.max(0, (t < T_DESC ? 3.5 : lerp(3.5, 6, span(t, T_DESC, REVEAL))) - pass * 3)
        if (sk > 0) {
          // Three nested beams, denser to the middle: soft edges with no blended pixel.
          for (const [k, d] of [
            [1, 0.35],
            [0.66, 0.6],
            [0.33, 1],
          ] as const) {
            const P = pattern(g, '#d8f2ff', sk * d)
            const a = shaft.top * k
            const b = shaft.bottom * k
            tri(g, cx - a, 0, cx + a, 0, cx + b, water, P)
            tri(g, cx - a, 0, cx - b, water, cx + b, water, P)
          }
          for (let y = water + 2; y < h; y += 3) {
            const wob = Math.round(Math.sin(y + t * 6) * 3)
            rect(g, cx - 6 + wob, y, 12 - ((y - water) >> 3), 1, fq > 0.9 ? '#e8faff' : '#8ad0f0')
          }
        }
        // The shadow crossing the hole: a great bird, far up, against the stars.
        if (t > T_SHADOW && t < T_SHADOW + 0.55) {
          const f = spriteFrame(p.mon)
          if (f) {
            const q = span(t, T_SHADOW, T_SHADOW + 0.55)
            const sw = f.width * 2
            const shh = f.height * 2
            // Its shadow thrown down the shaft, twice its size, sweeping across the light.
            const big = shadowOf(p.mon, sw, shh)
            dissolve(
              g,
              big,
              0.7,
              Math.round(lerp(cx - shaft.bottom - sw, cx + shaft.bottom, q)),
              Math.round(water * 0.4 - shh / 2),
            )
          }
        }
        // The icicle: trembling, then falling.
        const dropY = t < T_DROP ? 8 : 8 + 0.5 * 900 * (t - T_DROP) ** 2
        if (t < T_DROP + 0.42) {
          const tremble = t > T_DROP - 0.6 ? (Math.floor(t * 30) % 2 ? 1 : 0) : 0
          icicle(g, L.drop.x + tremble, Math.min(dropY, water - L.drop.len), 3, L.drop.len)
        }
        s.snow.draw(g)
        // Frost over the corners, growing branch by branch.
        const gq = span(t, T_FREEZE, T_FREEZE + 1.6)
        if (gq > 0)
          for (const pts of s.frost) {
            const n = Math.round(pts.length * gq)
            if (n < 2) continue
            polyline(g, pts.slice(0, n), '#9fd2e6', 2)
            polyline(g, pts.slice(0, n), '#f0fcff')
          }
        drawShards(g, s.shards)
        // Articuno: in silhouette coming down the shaft, then itself, mirrored in the ice.
        if (t >= T_DESC) {
          const q = ease.outC(span(t, T_DESC, T_GUST - 0.1))
          const y = Math.round(lerp(-10, L.feet, q))
          const ar = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(ar, '#9fe0f4', 1.4, t < REVEAL ? 0.35 : 0.3), cx - ar, y - 30 - ar)
          if (t >= REVEAL) {
            const k = span(t, REVEAL, REVEAL + 0.5) * lerp(0.6, 0.25, span(t, REVEAL + 0.4, REVEAL + 1.4))
            drawRays(s.rays, { x: cx, y: L.feet - 30 }, t, AURA[2], k)
            g.drawImage(s.rays, 0, 0)
            reflect(g, p.mon, cx, L.feet, water, t)
          }
          const bob = t < REVEAL ? 0 : Math.round(Math.sin((t - REVEAL) * 2) * 2)
          drawSprite(
            g,
            p.mon,
            cx,
            y + bob,
            t < REVEAL
              ? { sil: '#0a1c30', outline: Math.floor(t * 12) % 3 === 0 ? AURA[0] : AURA[1] }
              : {
                  flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
                  outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
                },
          )
        }
        s.dust.draw(g)
        for (const [d, c] of [
          [0, AURA[0]],
          [0.12, AURA[1]],
          [0.24, AURA[2]],
        ] as const)
          burstRing(g, cx, L.feet - 30, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.7, 3, c)
        s.fx.draw(g)
        g.restore()
        // The white-out: rising with the gust, gone with the reveal.
        if (t >= T_GUST && t < REVEAL + 0.4)
          screenFlash(
            g,
            '#f4fcff',
            t < REVEAL ? 0.85 * span(t, T_GUST, REVEAL) : 0.85 * (1 - span(t, REVEAL, REVEAL + 0.4)),
          )
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.6, { freq: 700, q: 6, vol: 0.03, slide: 400 }))],
          [1.2, quiet(() => tone(1568, 0.5, { type: 'triangle', vol: 0.02 }))],
          ...[0, 1, 2, 3, 4, 5].map(
            (i) =>
              [T_FREEZE + i * 0.19, quiet(() => hiss(0.06, { freq: 5000 - i * 300, vol: 0.04 }))] as const,
          ),
          [T_DROP - 0.5, quiet(() => tone(2400, 0.08, { type: 'square', vol: 0.015 }))],
          [
            T_DROP + 0.42,
            quiet(() => {
              hiss(0.3, { freq: 5200, vol: 0.08 })
              for (let i = 0; i < 5; i++)
                tone(2093 + i * 260, 0.08, { type: 'triangle', vol: 0.03, at: i * 0.05 })
            }),
          ],
          [T_SHADOW, quiet(() => hiss(0.7, { freq: 300, slide: 900, vol: 0.06 }))],
          [
            T_DESC,
            quiet(() =>
              [1319, 1568, 1976, 2349, 2637].forEach((f, i) =>
                tone(f, 0.3, { type: 'triangle', vol: 0.02, at: i * 0.14 }),
              ),
            ),
          ],
          [3.9, quiet(() => fxSound('legend.heart'))],
          [4.2, quiet(() => fxSound('legend.heart'))],
          [T_GUST, quiet(() => hiss(0.8, { freq: 1200, slide: 2500, vol: 0.1 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** Its shadow, twice its size, ready to be dissolved across the light. */
const shadowOf = (mon: string, w: number, h: number) =>
  cached(`articuno-shadow|${mon}|${w}x${h}`, () => {
    const cv = canvas(w, h)
    const sil = silhouette(mon, '#06121f')
    if (sil) cv.g.drawImage(sil, 0, 0, w, h)
    return cv
  })

/** Its reflection in the ice: upside down under the water line, pale, broken into rows. */
function reflect(g: G, mon: string, x: number, feet: number, water: number, t: number) {
  const f = spriteFrame(mon)
  if (!f) return
  g.save()
  g.beginPath()
  g.rect(0, water + 1, g.canvas.width, f.height)
  g.clip()
  g.globalAlpha = 0.35
  g.translate(0, 2 * water)
  g.scale(1, -1)
  drawSprite(g, mon, x + Math.round(Math.sin(t * 3)), feet, { tint: { color: '#c8f4ff', a: 0.5 } })
  g.restore()
}
