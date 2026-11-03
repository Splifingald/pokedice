// The Ultra Beasts' raid entrance (docs/53), one for all of them: an Ultra Wormhole tearing open over Alola. A bright
// afternoon on the beach: palms, the sea rolling in, clouds, Akala far off. Reality glitches (rows of the picture
// slipping sideways, a hum); a point of white light hangs in the sky, and cracks run out from it across the blue as if
// the sky were glass. The sky shatters: its pieces are sucked into the hole they leave, the wormhole behind them
// turning in iridescent spirals, the beach drained of colour and the sand and leaves pulled up towards it. Deep in the
// vortex something is coming: a silhouette, tiny, growing, its edges split into cyan and magenta; it comes through and
// drops onto the sand. The reveal; the wormhole closes behind it. Every Ultra Beast fits: the silhouette is its own.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  polyline,
  rect,
  ring,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { bush, palm, raysCanvas, revealLight } from './alolaKit'
import { AFTER_REVEAL, dGradient, dissolve, inOrder, tri, type Cinema, type CinemaParams } from './kit'

const T_GLITCH = 1.05
const T_POINT = 1.45
const T_CRACK = 1.85
const T_CRACK2 = 2.25
const T_TEAR = 2.6
const T_EMERGE = 3.05
const T_DROP = 4.0
const REVEAL = 4.5
const T_CLOSE = REVEAL + 1.2
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#e0c8ff', '#a06af0', '#2a0a5a'] as const
/** The wormhole's rim and spirals: the iridescence of Ultra Space. */
const IRIS = ['#ffffff', '#8af0ff', '#c8a0ff', '#ff8ae0', '#fff3a0', '#8affc8'] as const

type Shard = { a: [number, number]; b: [number, number]; c: [number, number]; t0: number; spin: number }

type S = {
  r: Rng
  fx: Particles
  day: Canvas
  drained: Canvas
  front: Canvas
  rays: Canvas
  cracks: [number, number][][]
  rings: [number, number][][]
  shards: Shard[]
  shakes: [number, number, number][]
}

export const ultraBeastCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const hz = Math.round(h * 0.47)
    const shore = Math.round(h * 0.585)
    const feet = Math.round(h * 0.63)
    const hole = { x: cx, y: Math.round(h * (w > h ? 0.3 : 0.28)) }
    const R = Math.round(Math.min(w * 0.42, m * 0.3, hole.y - 6))
    const sz = spriteSize(p.mon)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    /** How open the hole is: torn to full, then a breath wider, then closing after the reveal. */
    const openR = (t: number) =>
      Math.round(
        R *
          (ease.outBack(span(t, T_TEAR, T_TEAR + 0.45), 1.4) * (1 + 0.06 * Math.sin(t * 5)) -
            ease.inQ(span(t, T_CLOSE, T_CLOSE + 0.7))),
      )
    return {
      id: 'cinema-ultra-beast',
      dur: DUR,
      setup() {
        const r = rng(793)
        const day = beach(w, h, hz, shore, r)
        // The same beach with Ultra Space's light on it: drained, violet.
        const drained = canvas(w, h)
        drained.g.drawImage(day, 0, 0)
        wash(drained.g, '#2a1048', 0.5, 8)
        wash(drained.g, '#6a3a9a', 0.125, 8)
        const front = canvas(w, h)
        // Leaves in the bottom corners, near the viewer (over the drained beach too: they stay green).
        for (const side of [-1, 1])
          bush(front.g, cx + side * Math.round(w * 0.5), h - 2, Math.round(m * 0.16), '#1e4a22', '#2e6a2e', r)
        // Cracks from the point, then a ring of cracks round them: the pieces the sky breaks into.
        const cracks = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + r.range(-0.2, 0.2)
          const len = R * r.range(1.0, 1.45)
          return bolt(r, hole.x, hole.y, hole.x + Math.cos(a) * len, hole.y + Math.sin(a) * len, 0.22, 4)
        })
        const rings = [0.45, 0.8].map((k) => {
          const pts: [number, number][] = []
          for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2
            const rr = R * k * (1 + r.range(-0.12, 0.12))
            pts.push([hole.x + Math.cos(a) * rr, hole.y + Math.sin(a) * rr])
          }
          return pts
        })
        // The shards: a polar web over the hole, inner ones going first.
        const shards: Shard[] = []
        for (let ring = 0; ring < 3; ring++)
          for (let i = 0; i < 8 + ring * 4; i++) {
            const n = 8 + ring * 4
            const a0 = (i / n) * Math.PI * 2
            const a1 = ((i + 1) / n) * Math.PI * 2
            const r0 = (R * ring) / 3
            const r1 = (R * (ring + 1)) / 3 + 1
            const P = (a: number, rr: number): [number, number] => [Math.cos(a) * rr, Math.sin(a) * rr]
            const t0 = T_TEAR + ring * 0.07 + r() * 0.08
            shards.push({ a: P(a0, r0), b: P(a1, r0), c: P(a0, r1), t0, spin: r.range(-6, 6) })
            if (ring > 0)
              shards.push({ a: P(a1, r0), b: P(a1, r1), c: P(a0, r1), t0: t0 + 0.03, spin: r.range(-6, 6) })
          }
        return {
          r,
          fx: new Particles(),
          day,
          drained,
          front,
          rays: raysCanvas(w, h),
          cracks,
          rings,
          shards,
          shakes: p.short
            ? []
            : [
                [T_TEAR, 0.6, 3],
                [REVEAL, 0.6, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Gulls and spray while it's calm.
        if (t < T_GLITCH && r() < 0.15 * many)
          s.fx.add({
            x: r.range(0, w),
            y: shore + r.range(-2, 2),
            vy: -r.range(5, 15),
            ay: 30,
            life: 0.5,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#c8f0ff'],
          })
        // The hole pulls the beach up into it: sand, leaves, spray.
        if (t > T_TEAR && t < REVEAL && r() < 1.4 * many)
          s.fx.add({
            x: r.range(0, w),
            y: r.range(shore, h),
            vy: -r.range(10, 40),
            home: { x: hole.x, y: hole.y, k: 260 },
            life: 2,
            size: 1,
            shape: r() < 0.2 ? 'leaf' : 'px',
            spin: r.range(-8, 8),
            colors: r() < 0.5 ? ['#f0e0b0', '#c8b07a'] : ['#c8f0ff', '#8ac8e8'],
          })
        // Light pouring out of the vortex while something comes through it.
        if (t > T_EMERGE && t < T_DROP && r() < 1.2 * many) {
          const a = r() * Math.PI * 2
          const v = r.range(30, 90)
          s.fx.add({
            x: hole.x,
            y: hole.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: r.range(0.4, 0.8),
            size: 1,
            shape: 'streak',
            trail: 0.05,
            colors: [...IRIS],
          })
        }
        if (within(t, REVEAL, REVEAL + dt)) {
          // It lands: the sand thrown up, light everywhere.
          for (let i = 0; i < 50 * many; i++) {
            const a = Math.PI + r() * Math.PI
            const v = r.range(40, 130)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.4, sz.w * 0.4),
              y: feet,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              ay: 160,
              drag: 1.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: 'smoke',
              colors: ['#f0e0b0', '#d8c090'],
            })
          }
          for (let i = 0; i < 40 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: feet - sz.h / 2,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...IRIS],
            })
          }
        }
        // Afterwards, motes of Ultra Space drifting off it.
        if (t > REVEAL + 0.3 && r() < 0.4 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h),
            vy: -r.range(6, 16),
            life: 1.2,
            size: 1,
            shape: r() < 0.4 ? 'star' : 'px',
            colors: [IRIS[1], IRIS[2], IRIS[3]],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The beach, its colour draining as the sky opens.
        const drain = span(t, T_TEAR - 0.1, T_TEAR + 0.4) * (1 - span(t, T_CLOSE + 0.6, T_CLOSE + 1))
        g.drawImage(s.day, 0, 0)
        if (drain > 0) dissolve(g, s.drained, drain, 0, 0)
        drawSea(g, t, w, hz, shore, drain)
        // The point of light, the cracks, the shatter, the wormhole.
        const pr = span(t, T_POINT, T_POINT + 0.3) * (1 - span(t, T_TEAR, T_TEAR + 0.2))
        if (pr > 0) {
          const gr = Math.round(10 + 6 * Math.sin(t * 14))
          g.drawImage(glow(gr, '#ffffff', 1.5, 0.8 * pr), hole.x - gr, hole.y - gr)
          rect(g, hole.x - 1, hole.y - 1, 3, 3, '#ffffff')
          rect(g, hole.x - 4, hole.y, 9, 1, '#ffffff')
          rect(g, hole.x, hole.y - 4, 1, 9, '#ffffff')
        }
        const RR = openR(t)
        if (RR > 2) drawWormhole(g, t, hole, RR)
        if (t > T_TEAR - 0.05 && t < T_TEAR + 0.6) drawShards(g, s, t, hole)
        if (t > T_CRACK && t < T_TEAR + 0.05) {
          const q = span(t, T_CRACK, T_CRACK + 0.3)
          for (const pts of s.cracks) drawCrack(g, pts.slice(0, Math.max(2, Math.round(pts.length * q))))
          const q2 = span(t, T_CRACK2, T_CRACK2 + 0.25)
          if (q2 > 0)
            for (const pts of s.rings) drawCrack(g, pts.slice(0, Math.max(2, Math.round(pts.length * q2))))
        }
        // The beast: deep in the vortex, small and growing, then through and down onto the sand.
        if (t > T_EMERGE && t < REVEAL) {
          const k = ease.inQ(span(t, T_EMERGE, T_DROP))
          const sc = lerp(0.12, 0.85, k)
          const drop = ease.inQ(span(t, T_DROP, REVEAL))
          const scale = lerp(sc, 1, drop)
          const cy = lerp(hole.y, feet - sz.h / 2, drop)
          const y = Math.round(cy + (sz.h * scale) / 2)
          const split = Math.round(1 + 2 * k)
          drawSprite(g, p.mon, cx, y, {
            sx: scale,
            sy: scale,
            sil: '#0a0418',
            outline: IRIS[Math.floor(t * 16) % IRIS.length],
            ghost: [
              { dx: -split, color: '#3af0ff', a: 1 },
              { dx: split, color: '#ff3ad0', a: 1 },
            ],
          })
        }
        if (t >= REVEAL) {
          // A shadow on the sand under it, a crater ring.
          ellipse(g, cx, feet + 1, Math.round(sz.w * 0.4), 2, pattern(g, '#8a7050', 8))
          revealLight(
            g,
            s.rays,
            t,
            REVEAL,
            { x: cx, y: feet - sz.h / 2 },
            AURA,
            Math.max(w, h) * 0.8,
            0.7,
            AURA[1],
          )
          const glitch = t < REVEAL + 0.8 && Math.floor(t * 20) % 5 === 0 ? 2 : 0
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
            ghost: glitch
              ? [
                  { dx: -glitch, color: '#3af0ff', a: 1 },
                  { dx: glitch, color: '#ff3ad0', a: 1 },
                ]
              : undefined,
          })
        }
        s.fx.draw(g)
        g.drawImage(s.front, 0, 0)
        g.restore()
        // Reality glitching: bands of the picture slipping sideways, more and more.
        if (t > T_GLITCH && t < T_TEAR + 0.3) glitch(g, t, w, h, span(t, T_GLITCH, T_TEAR))
        if (within(t, T_TEAR, T_TEAR + 0.2))
          screenFlash(g, '#e8d8ff', 0.6 * (1 - span(t, T_TEAR, T_TEAR + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.4, { freq: 500, type: 'lowpass', vol: 0.05 }))],
          [0.4, quiet(() => tone(1800, 0.25, { type: 'triangle', vol: 0.015, slide: -500 }))],
          [0.62, quiet(() => tone(1700, 0.2, { type: 'triangle', vol: 0.012, slide: -400 }))],
          [T_GLITCH, quiet(() => tone(55, 1.6, { type: 'sawtooth', vol: 0.03, slide: 60 }))],
          [T_GLITCH + 0.02, quiet(() => hiss(0.08, { freq: 3000, vol: 0.04 }))],
          [T_GLITCH + 0.4, quiet(() => hiss(0.06, { freq: 4200, vol: 0.04 }))],
          [T_POINT, quiet(() => tone(1568, 1.0, { type: 'sine', vol: 0.025, slide: 400 }))],
          [T_CRACK, quiet(() => (hiss(0.15, { freq: 5000, vol: 0.07 }), tone(2400, 0.05, { vol: 0.03 })))],
          [T_CRACK2, quiet(() => (hiss(0.15, { freq: 4400, vol: 0.08 }), tone(2000, 0.05, { vol: 0.03 })))],
          [T_TEAR, quiet(() => (fxSound('legend.shatter'), fxSound('portal.breach')))],
          [T_TEAR + 0.05, quiet(() => hiss(1.4, { freq: 200, slide: 600, vol: 0.08 }))],
          [T_EMERGE, quiet(() => tone(110, 1.0, { type: 'square', vol: 0.025, slide: 110 }))],
          [3.5, quiet(() => fxSound('legend.heart'))],
          [3.8, quiet(() => fxSound('legend.heart'))],
          [T_DROP, quiet(() => hiss(0.5, { freq: 800, slide: -600, vol: 0.06 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          [REVEAL + 0.02, quiet(() => fxSound('impact.hit'))],
          [T_CLOSE, quiet(() => fxSound('portal.close'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** The beach, drawn once: sky and clouds, Akala far off, the sea, the sand. */
function beach(w: number, h: number, hz: number, shore: number, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, hz, ['#2a74c8', '#3a8ad8', '#5aa8e8', '#8ac8f0', '#c8e8f8']), 0, 0)
  // Cumulus: flat-bottomed heaps, lit on top, a blue shade beneath.
  for (let i = 0; i < Math.round(3 + w / 70); i++) {
    const x = r.range(-10, w + 10)
    const y = r.range(hz * 0.18, hz * 0.8)
    const s = r.range(0.6, 1.2) * Math.min(w, h) * 0.07
    for (let k = 0; k < 6; k++) {
      const ex = x + (k - 2.5) * s * 0.8
      const ey = y - Math.sin((k / 5) * Math.PI) * s * 0.7
      ellipse(g, ex, ey + 2, s, s * 0.6, '#b8d0ec')
      ellipse(g, ex, ey, s, s * 0.6, k % 2 ? '#ffffff' : '#f0f6ff')
    }
    rect(g, x - s * 2.5, y + s * 0.4, s * 5, 2, '#a8c4e4')
  }
  // Akala far off: its volcano, blue with the distance.
  const ax = Math.round(w * 0.24)
  const ah = Math.round(h * 0.07)
  tri(g, ax - ah * 3, hz + 1, ax + ah * 3, hz + 1, ax, hz - ah, '#7a9ac8')
  tri(g, ax - ah * 3, hz + 1, ax, hz - ah, ax - ah, hz + 1, '#8aaad4')
  ellipse(g, ax + Math.round(w * 0.45), hz, Math.round(ah * 2), Math.round(ah * 0.4), '#7a9ac8')
  // The sea: deep far off, turquoise in the shallows, glints.
  g.drawImage(dGradient(w, shore - hz, ['#1e5ab0', '#2a7ac0', '#3aa0c8', '#4ac8c8'], 4), 0, hz)
  rect(g, 0, hz, w, 1, '#a8d8f0')
  for (let y = hz + 2; y < shore; y += 2)
    for (let x = (y * 13) % 17; x < w; x += 18 + ((y * 7) % 9)) rect(g, x, y, 2 + ((x + y) % 3), 1, '#8ad8f0')
  // The sand: wet and darker at the water, ripples, a few shells.
  g.drawImage(dGradient(w, h - shore, ['#c8b48a', '#f0e0b0', '#e8d4a0', '#d8c090'], 3), 0, shore)
  for (let y = shore + 6; y < h; y += 5)
    for (let x = (y * 11) % 23; x < w; x += 23) rect(g, x, y, 6 + ((x * 3) % 5), 1, '#d0b880')
  for (let i = 0; i < w * 0.06; i++) {
    const x = r.range(0, w)
    const y = r.range(shore + 8, h)
    rect(g, x, y, 2, 1, r() < 0.5 ? '#ffffff' : '#ffc8b0')
  }
  // Palms up the beach at either side, leaning over the sand, clear of the middle.
  const m = Math.min(w, h)
  for (const side of [-1, 1])
    for (let k = 0; k < (w > 200 ? 2 : 1); k++) {
      const x = Math.round(w / 2 + side * (w / 2 + 4 - k * m * 0.24))
      const ph = Math.round(Math.min(h * 0.36, m * 0.55) * (1 - k * 0.22))
      palm(
        g,
        x,
        Math.round(shore + (h - shore) * (0.35 - k * 0.2)),
        ph,
        side * Math.round(m * 0.07),
        '#1e5a2a',
        '#6ac04a',
        '#6a4a2a',
      )
    }
  return cv
}

/** The surf: a foam line running up the sand and back, pulled away once the sky is open. */
function drawSea(g: G, t: number, w: number, hz: number, shore: number, drain: number) {
  const pull = drain * 6
  const y = Math.round(shore - 2 + Math.sin(t * 1.4) * 2 - pull)
  for (let x = 0; x < w; x++) {
    const yy = y + Math.round(Math.sin(x / 9 + t * 2) * 1.5)
    rect(g, x, yy, 1, 1, drain > 0.5 ? '#c8b8e8' : '#ffffff')
    if ((x + Math.floor(t * 8)) % 3 === 0) rect(g, x, yy + 1, 1, 1, '#e8f8ff')
  }
  // Glints on the water.
  for (let k = 0; k < 10; k++) {
    const x = Math.round(((k * 47 + t * 6) % w) + 0.5)
    const yy = hz + 3 + ((k * 13) % Math.max(1, shore - hz - 6))
    if (Math.floor(t * 4 + k) % 3 === 0) rect(g, x, yy, 3, 1, '#ffffff')
  }
}

/** A crack in the sky: white, its edges split cyan and magenta. */
function drawCrack(g: G, pts: [number, number][]) {
  polyline(
    g,
    pts.map(([x, y]) => [x - 1, y] as [number, number]),
    '#3af0ff',
  )
  polyline(
    g,
    pts.map(([x, y]) => [x + 1, y] as [number, number]),
    '#ff3ad0',
  )
  polyline(g, pts, '#ffffff')
}

/** The sky's pieces: in place (the cracked sky) until they're sucked into the hole, spinning and shrinking. */
function drawShards(g: G, s: S, t: number, hole: { x: number; y: number }) {
  // Each piece is the sky itself (its own texture, clouds and all), so the cracked sky and its pieces match.
  const sky = g.createPattern(s.day, 'no-repeat') ?? '#5aa8e8'
  for (const sh of s.shards) {
    const q = span(t, sh.t0, sh.t0 + 0.4)
    if (q >= 1) continue
    const k = 1 - ease.inQ(q)
    const a = sh.spin * q
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // The shard's centre falls in; its corners turn about it.
    const mx = (sh.a[0] + sh.b[0] + sh.c[0]) / 3
    const my = (sh.a[1] + sh.b[1] + sh.c[1]) / 3
    const P = (p: [number, number]): [number, number] => {
      const dx = (p[0] - mx) * k
      const dy = (p[1] - my) * k
      return [hole.x + mx * k + dx * ca - dy * sa, hole.y + my * k + dx * sa + dy * ca]
    }
    const A = P(sh.a)
    const B = P(sh.b)
    const C = P(sh.c)
    tri(g, A[0], A[1], B[0], B[1], C[0], C[1], sky)
    if (q <= 0) continue
    line(g, A[0], A[1], B[0], B[1], '#ffffff')
    line(g, B[0], B[1], C[0], C[1], '#c8f0ff')
  }
}

/**
 * The Ultra Wormhole: Ultra Space's dark behind it, spiral arms of pastel light turning in towards a white heart, an
 * iridescent rim that crackles.
 */
function drawWormhole(g: G, t: number, c: { x: number; y: number }, R: number) {
  // Its light on the sky round it.
  const hr = R + 8 - ((R + 8) % 2)
  g.drawImage(ring(hr, 10, '#c8a0ff', 0.55), c.x - hr - 1, c.y - hr - 1)
  ellipse(g, c.x, c.y, R, R, '#140828')
  ellipse(g, c.x, c.y, Math.round(R * 0.85), Math.round(R * 0.85), pattern(g, '#3a1a6a', 8))
  const gr = Math.max(3, Math.round(R * 0.55))
  g.drawImage(glow(gr, '#ffffff', 1.6, 0.9), c.x - gr, c.y - gr)
  // The arms: log spirals turning inwards.
  for (let k = 0; k < 6; k++) {
    let prev: [number, number] | null = null
    for (let i = 0; i <= 18; i++) {
      const q = i / 18
      const rr = R * (0.12 + 0.86 * q)
      const a = (k / 6) * Math.PI * 2 + q * 2.6 - t * 3.2
      const pt: [number, number] = [c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr]
      if (prev) line(g, prev[0], prev[1], pt[0], pt[1], IRIS[(k + (i >> 2)) % IRIS.length]!, q < 0.5 ? 2 : 1)
      prev = pt
    }
  }
  // The rim, its colours running round it.
  const n = Math.max(24, Math.round(R * 6.5))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = R + Math.round(Math.sin(a * 7 + t * 9) * 1.2)
    const col = IRIS[Math.floor(i / 3 + t * 20) % IRIS.length]!
    rect(g, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 2, 2, col)
  }
  ellipseLine(g, c.x, c.y, R + 2, R + 2, '#3a1a6a')
  // Crackling off the rim.
  const r = rng(Math.floor(t * 15) + 3)
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2
    const x = c.x + Math.cos(a) * R
    const y = c.y + Math.sin(a) * R
    polyline(g, bolt(r, x, y, x + Math.cos(a) * 12, y + Math.sin(a) * 12, 0.5, 2), k ? '#8af0ff' : '#ffffff')
  }
}

/** Reality slipping: a few bands of the frame copied sideways, edged in cyan and magenta. */
function glitch(g: G, t: number, w: number, h: number, k: number) {
  const r = rng(Math.floor(t * 12) + 1)
  // Bursts, not a steady shimmer: some frames are clean.
  if (r() > 0.25 + 0.6 * k) return
  const n = 1 + Math.round(k * 4)
  for (let i = 0; i < n; i++) {
    const y = Math.round(r.range(0, h - 4))
    const bh = r.int(1, 2 + Math.round(k * 6))
    const dx = Math.round(r.range(-1, 1) * (3 + k * 10))
    g.drawImage(g.canvas, 0, y, w, bh, dx, y, w, bh)
    rect(g, dx < 0 ? w + dx : 0, y, Math.abs(dx), bh, r() < 0.5 ? '#3af0ff' : '#ff3ad0')
  }
}
