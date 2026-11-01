// Rayquaza's raid entrance (docs/53): the top of Sky Pillar, above a sea of clouds, so high that the sky is black and
// starry and the world's edge curves below it, the ozone layer a thin glowing band along it. The wind howls (the
// Delta Stream in streaks across the screen); a long green body ringed with gold weaves through the clouds, surfacing
// and diving like a sea serpent, and is gone. A meteor appears high up, burning, falling towards the pillar. Out of
// the clouds a green streak shoots straight up at it, spiralling with gold (Dragon Ascent), and smashes it apart: a
// flash, a shockwave, the pieces raining down in fire. Out of the explosion the dragon comes coiling down round the
// pillar's top; the reveal's wind ring, and it hovers over the pillar, the sky ringing green.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  ease,
  ellipse,
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

const T_SERPENT = 0.65
const T_SERPENT_END = 2.0
const T_METEOR = 1.7
const T_ASCENT = 2.85
const T_HIT = 3.3
const T_COIL = 3.55
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'] as const
const BODY = { dark: '#145a30', mid: '#2e9a52', light: '#7ae0a0', ring: '#ffd23a', ringDark: '#a87a10' }
const FIRE = ['#ffffff', '#fff3a0', '#ffbe2e', '#ff6a1e', '#8a2a10'] as const

type S = {
  r: Rng
  fx: Particles
  wind: Particles
  sky: Canvas
  back: Canvas
  front: Canvas
  pillar: Canvas
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * The sea of clouds, as wide as the screen and a tile more: rows of puffs, small and close together far off, big
 * near you, each lit on top by the earthshine and shadowed underneath.
 */
function clouds(w: number, h: number, top: number, seed: number, cols: readonly string[]): Canvas {
  const W2 = w + 64
  const H2 = h - top + 12
  const cv = canvas(W2, H2)
  const g = cv.g
  const r = rng(seed)
  g.fillStyle = cols[3]!
  g.fillRect(0, 14, W2, H2)
  const rows = 6
  for (let row = 0; row < rows; row++) {
    const k = row / (rows - 1)
    const y = Math.round(10 + (H2 - 10) * k ** 1.4)
    const big = lerp(7, 22, k)
    for (let x = -12 + r.range(0, 8); x < W2 + 12; x += big * r.range(0.9, 1.4)) {
      // The tile repeats every 64 px: puffs near its ends are drawn on both, so the seam never shows.
      for (const ox of x < 24 ? [0, 64] : [0]) {
        const rr = Math.round(big * r.range(0.6, 1.3))
        const yy = y + Math.round(r.range(-0.25, 0.25) * big)
        ellipse(g, x + ox, yy + rr * 0.35, rr, Math.round(rr * 0.6), cols[2]!)
        ellipse(g, x + ox - 1, y, rr - 1, Math.round(rr * 0.5), cols[1]!)
        ellipse(
          g,
          x + ox - 2,
          y - Math.round(rr * 0.15),
          Math.round(rr * 0.7),
          Math.round(rr * 0.32),
          cols[0]!,
        )
      }
    }
  }
  return cv
}

/** Sky Pillar's top: its stone tiers, broken columns at its corners, standing out of the clouds. */
function pillar(w: number, h: number, feet: number): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const cx = Math.round(w / 2)
  const pw = Math.round(Math.min(w * 0.46, 76))
  const x0 = cx - (pw >> 1)
  // The shaft, lit on its left, its courses of stone.
  g.drawImage(dGradient(pw, h - feet, ['#6a7a6a', '#4a5a50', '#2a3430'], 3), x0, feet + 6)
  rect(g, x0, feet + 6, 3, h - feet, '#8a9a88')
  rect(g, x0 + pw - 4, feet + 6, 4, h - feet, '#1a2220')
  for (let y = feet + 14; y < h; y += 9) rect(g, x0, y, pw, 1, '#2a3430')
  for (let y = feet + 14, i = 0; y < h; y += 9, i++)
    for (let x = x0 + (i % 2 ? 6 : 12); x < x0 + pw - 4; x += 14) rect(g, x, y, 1, 9, '#2a3430')
  // The top platform, wider, its edge and the shadow under it.
  rect(g, x0 - 6, feet, pw + 12, 7, '#7a8a78')
  rect(g, x0 - 6, feet, pw + 12, 1, '#b0c0a8')
  rect(g, x0 - 6, feet + 6, pw + 12, 1, '#1a2220')
  rect(g, x0 - 2, feet + 7, pw + 4, 2, '#2a3430')
  // Broken columns at its corners, and a carved dragon-eye in the middle of the lintel.
  for (const [x, hh] of [
    [x0 - 3, 16],
    [x0 + pw - 3, 10],
  ] as const) {
    rect(g, x, feet - hh, 6, hh, '#6a7a6a')
    rect(g, x, feet - hh, 2, hh, '#9aaa98')
    rect(g, x + 5, feet - hh, 1, hh, '#2a3430')
    tri(g, x, feet - hh, x + 6, feet - hh, x + 2, feet - hh - 4, '#6a7a6a')
  }
  rect(g, cx - 4, feet + 2, 8, 3, '#2a3430')
  rect(g, cx - 2, feet + 3, 4, 1, '#3ac87a')
  return cv
}

export const rayquazaCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const feet = Math.round(h * 0.6)
    const cloudTop = Math.round(h * 0.7)
    const sz = spriteSize(p.mon)
    const hover = feet - 4
    const mid = hover - Math.round(sz.h / 2)
    const hit = { x: Math.round(cx + w * 0.14), y: Math.round(h * 0.17) }
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    // The world's edge: a great arc below the stars.
    const arcR = Math.max(w, h) * 1.6
    const arcY = Math.round(h * 0.5)
    const edge = (x: number) => Math.round(arcY + arcR - Math.sqrt(Math.max(0, arcR * arcR - (x - cx) ** 2)))
    /** The serpent's head weaving through the clouds: left to right, surfacing and diving. */
    const weave = (u: number): [number, number] => [
      lerp(-w * 0.3, w * 1.3, u),
      cloudTop + 6 - Math.sin(u * Math.PI * 3.2) * Math.max(14, h * 0.07),
    ]
    /** The dragon coming down round the pillar out of the explosion, in a narrowing helix. */
    const coil = (u: number): [number, number, number] => {
      const th = u * Math.PI * 4.5
      const R = lerp(m * 0.32, 4, ease.inQ(u))
      return [cx + Math.cos(th) * R, lerp(hit.y, mid, ease.ioS(u)), Math.sin(th)]
    }
    return {
      id: 'cinema-rayquaza',
      dur: DUR,
      setup() {
        const r = rng(384)
        // Space, its stars and a faint band of the galaxy; the world's edge with the ozone glowing on it.
        const sky = shade(w, h, (x, y) => {
          const e = edge(x)
          if (y < e - 6) {
            const k = y / Math.max(1, e)
            // The glow above the edge, in dithered steps: blue, then the ozone's green, then black space.
            const d = e - y
            if (d < 9) return d < 3 ? '#7ae0c8' : bayer(x, y) < 0.6 ? '#2a8a7a' : '#0a2a3a'
            if (d < 22 && bayer(x, y) < (22 - d) / 26) return '#0e3a4a'
            return k < 0.4 ? '#01020a' : bayer(x, y) < k - 0.4 ? '#040a1c' : '#01020a'
          }
          if (y < e) return y < e - 3 ? '#c8fff0' : '#5ab0d8'
          // Below the edge: the cloud sea far off, hazy blue.
          const k = (y - e) / Math.max(1, h - e)
          return bayer(x, y) < 0.5 + k ? '#1a2c50' : '#2a4a78'
        })
        for (let i = 0; i < 80; i++) {
          const x = r.range(0, w)
          const y = r.range(0, edge(x) - 12)
          rect(sky.g, x, y, 1, 1, r() < 0.15 ? '#ffffff' : r() < 0.5 ? '#8aa8d8' : '#4a5a88')
        }
        for (let i = 0; i < 40; i++) {
          const x = (i / 40) * w + r.range(-4, 4)
          const y = h * 0.08 + (i / 40) * h * 0.2 + r.range(-6, 6)
          if (y < edge(x) - 12) rect(sky.g, x, y, r.int(1, 3), 1, '#1a2448')
        }
        return {
          r,
          fx: new Particles(),
          wind: new Particles(),
          sky,
          back: clouds(w, h, cloudTop - 10, 3841, ['#6a7aa8', '#4a5a88', '#2a3a68', '#1a2448']),
          front: clouds(w, h, cloudTop, 3842, ['#c8d8f0', '#8a9ac8', '#5a6a98', '#2a3a68']),
          pillar: pillar(w, h, feet),
          rays: canvas(w, h),
          shakes: p.short
            ? []
            : [
                [T_HIT, 0.8, 4],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.wind.update(dt)
        // The Delta Stream: streaks of wind tearing across, stronger as it comes.
        const gust =
          t < T_HIT ? 0.3 + span(t, T_SERPENT, T_SERPENT_END) * 0.4 : 0.5 + span(t, T_COIL, REVEAL) * 0.5
        if (r() < gust * 0.6 * many)
          s.wind.add({
            x: -10,
            y: r.range(h * 0.1, h * 0.95),
            vx: r.range(260, 420),
            vy: r.range(-10, 10),
            life: 1,
            size: 1,
            shape: 'streak',
            trail: 0.06,
            colors: ['#c8d8f0', '#6a7aa8', '#3a4a78'],
          })
        // The meteor shedding fire as it falls.
        if (t > T_METEOR && t < T_HIT) {
          const [mx, my] = meteorAt(t)
          if (r() < 0.8)
            s.fx.add({
              x: mx,
              y: my,
              vx: r.range(10, 40),
              vy: -r.range(10, 40),
              drag: 2,
              life: 0.5,
              size: r.int(1, 2),
              shape: 'px',
              colors: [...FIRE],
            })
        }
        // The ascent's gold sparks.
        if (within(t, T_ASCENT, T_HIT)) {
          const [ax, ay] = ascentAt(t)
          for (let i = 0; i < 3 * many + 1; i++)
            s.fx.add({
              x: ax + r.range(-4, 4),
              y: ay + r.range(0, 20),
              vx: r.range(-30, 30),
              vy: r.range(10, 50),
              drag: 2,
              life: r.range(0.3, 0.6),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'px',
              colors: ['#ffffff', '#fff3a0', BODY.ring, BODY.mid],
            })
        }
        // The meteor smashed: fire and rock flung out, raining down.
        if (within(t, T_HIT, T_HIT + dt)) {
          for (let i = 0; i < 120 * many + 20; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 220)
            s.fx.add({
              x: hit.x,
              y: hit.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              ay: 140,
              drag: 0.6,
              life: r.range(0.8, 1.8),
              size: r.int(1, 2),
              shape: r() < 0.4 ? 'streak' : 'sq',
              trail: 0.05,
              colors: [...FIRE],
            })
          }
          for (let i = 0; i < 30 * many; i++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: hit.x,
              y: hit.y,
              vx: Math.cos(a) * r.range(20, 70),
              vy: Math.sin(a) * r.range(20, 70),
              drag: 1.5,
              life: r.range(1, 1.6),
              size: r.int(3, 5),
              size1: 7,
              shape: 'smoke',
              colors: ['#ffbe2e', '#5a4a4a', '#2a2a34'],
              density: 0.4,
            })
          }
        }
        // Green sparks off it as it coils down.
        if (within(t, T_COIL, REVEAL) && r() < 0.8 * many) {
          const [x, y] = coil(span(t, T_COIL, REVEAL - 0.1))
          s.fx.add({
            x,
            y,
            vx: r.range(-20, 20),
            vy: r.range(-10, 20),
            life: 0.5,
            size: 1,
            shape: 'star',
            colors: ['#ffffff', AURA[1], AURA[2]],
          })
        }
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 190)
            s.fx.add({
              x: cx,
              y: mid,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#01020a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.sky, 0, 0)
        // The ozone band shimmering along the edge.
        for (let x = 0; x < w; x += 2) {
          const e = edge(x)
          if ((x + Math.floor(t * 10)) % 9 < 3)
            rect(g, x, e - 8 - Math.round(Math.sin(x / 13 + t * 2) * 2), 2, 1, '#7ae0c8')
        }
        // The meteor: a burning head, its tail streaming back.
        if (within(t, T_METEOR, T_HIT)) {
          const [mx, my] = meteorAt(t)
          const k = span(t, T_METEOR, T_HIT)
          const rr = Math.round(lerp(1, 5, k))
          const [tx, ty] = meteorAt(Math.max(T_METEOR, t - 0.5))
          line(g, tx, ty, mx, my, FIRE[3], Math.max(1, rr - 1))
          line(g, lerp(tx, mx, 0.5), lerp(ty, my, 0.5), mx, my, FIRE[2], Math.max(1, rr))
          g.drawImage(
            glow(rr * 3 + 3, FIRE[2], 1.3, 0.8),
            Math.round(mx) - rr * 3 - 3,
            Math.round(my) - rr * 3 - 3,
          )
          ellipse(g, mx, my, rr, rr, FIRE[1])
          rect(g, mx - 1, my - 1, 2, 2, '#ffffff')
        }
        // The far clouds, drifting.
        const drift = (cv: Canvas, y: number, v: number) => {
          const off = Math.round((t * v) % 64)
          g.drawImage(cv, -off, y)
        }
        drift(s.back, cloudTop - 22, 6)
        // The serpent weaving through the cloud sea (the front clouds hide what's under them).
        if (within(t, T_SERPENT, T_SERPENT_END)) {
          const u = span(t, T_SERPENT, T_SERPENT_END)
          serpent(g, (i) => weave(u - i * 0.012), 46, 1)
        }
        g.drawImage(s.pillar, 0, 0)
        // Dragon Ascent: a green streak shooting up out of the clouds, gold spiralling round it.
        if (within(t, T_ASCENT, T_HIT + 0.25)) {
          const [ax, ay] = ascentAt(Math.min(t, T_HIT))
          const x0 = cx - Math.round(w * 0.04)
          const fade = 1 - span(t, T_HIT, T_HIT + 0.25)
          if (fade > 0) {
            line(g, x0, cloudTop, ax, ay, BODY.dark, 5)
            line(g, x0, cloudTop, ax, ay, BODY.mid, 3)
            line(g, x0, cloudTop, ax, ay, '#ffffff', 1)
            const n = Math.max(1, Math.round((cloudTop - ay) / 2))
            for (let i = 0; i < n; i++) {
              const q = i / n
              const y = lerp(ay, cloudTop, q)
              const x = lerp(ax, x0, q)
              const sw = Math.sin(y / 5 - t * 40) * 5
              rect(g, x + sw, y, 1, 1, BODY.ring)
              rect(g, x - sw, y, 1, 1, '#fff3a0')
            }
            g.drawImage(glow(9, AURA[1], 1.2, 0.9), Math.round(ax) - 9, Math.round(ay) - 9)
          }
        }
        // The explosion: a white core, fire, and its shockwave.
        if (within(t, T_HIT, T_HIT + 0.6)) {
          const q = span(t, T_HIT, T_HIT + 0.6)
          const R = Math.round(lerp(6, m * 0.22, ease.outC(q)) * (1 - q * 0.3))
          shine(g, hit.x, hit.y, R + 6, FIRE[3], 1.1, 0.8 * (1 - q))
          ellipse(
            g,
            hit.x,
            hit.y,
            Math.round(R * (1 - q)),
            Math.round(R * (1 - q)),
            q < 0.3 ? '#ffffff' : FIRE[1],
          )
        }
        for (const [d, c] of [
          [0, '#ffffff'],
          [0.08, FIRE[2]],
          [0.18, AURA[2]],
        ] as const)
          burstRing(g, hit.x, hit.y, span(t, T_HIT + d, T_HIT + d + 0.8), Math.max(w, h) * 0.9, 2, c)
        // The dragon coiling down round the pillar's top out of the smoke.
        if (within(t, T_COIL, REVEAL)) {
          const u = span(t, T_COIL, REVEAL - 0.1)
          serpent(
            g,
            (i) => {
              const [x, y, z] = coil(Math.max(0, u - i * 0.018))
              return [x, y, z]
            },
            46,
            1,
          )
        }
        s.fx.draw(g)
        drift(s.front, cloudTop, 14)
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.25, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: mid }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, hover + Math.round(Math.sin((t - REVEAL) * 2) * 2), {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[1]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, mid, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.wind.draw(g)
        g.restore()
        if (within(t, T_HIT, T_HIT + 0.3)) screenFlash(g, '#fff6e0', 0.85 * (1 - span(t, T_HIT, T_HIT + 0.3)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(3, { freq: 900, slide: -400, vol: 0.05 }))],
          [0.1, quiet(() => tone(110, 2.4, { type: 'sine', vol: 0.03 }))],
          [T_SERPENT, quiet(() => hiss(1.4, { freq: 500, slide: 1500, vol: 0.06 }))],
          [T_SERPENT + 0.5, quiet(() => tone(196, 0.8, { type: 'sawtooth', vol: 0.025, slide: 60 }))],
          [T_METEOR, quiet(() => tone(1760, 1.5, { type: 'sine', vol: 0.015, slide: -1200 }))],
          [T_METEOR + 0.05, quiet(() => hiss(1.6, { freq: 2400, slide: -1600, vol: 0.04 }))],
          [
            T_ASCENT,
            quiet(
              () => (
                tone(330, 0.45, { type: 'sawtooth', vol: 0.04, slide: 990 }),
                hiss(0.45, { freq: 600, slide: 3000, vol: 0.08 })
              ),
            ),
          ],
          [
            T_HIT,
            quiet(
              () => (
                hiss(1.2, { freq: 120, type: 'lowpass', vol: 0.2 }),
                tone(45, 1, { type: 'sawtooth', vol: 0.06, slide: -15 }),
                fxSound('fire.hit')
              ),
            ),
          ],
          [T_COIL, quiet(() => hiss(1.2, { freq: 1500, slide: -1000, vol: 0.06 }))],
          [T_COIL + 0.6, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }

    function meteorAt(t: number): [number, number] {
      const q = ease.inQ(span(t, T_METEOR, T_HIT))
      return [lerp(w * 1.05, hit.x, q), lerp(-h * 0.08, hit.y, q)]
    }
    function ascentAt(t: number): [number, number] {
      const q = ease.inC(span(t, T_ASCENT, T_HIT))
      return [lerp(cx - w * 0.04, hit.x, q), lerp(cloudTop, hit.y, q)]
    }

    /**
     * The serpent: a chain of round segments behind its head (`at(i)` is segment i, 0 the head), dark green with a lit
     * back, a gold ring every few segments, thinning to the tail. Segments further away (z < 0) are a shade darker.
     */
    function serpent(
      g: G,
      at: (i: number) => [number, number] | [number, number, number],
      n: number,
      k: number,
    ) {
      // The body as one tube: its dark rim, its green, its lit back, its gold rings; thinning to the tail.
      const pts = Array.from({ length: n }, (_, i) => at(i))
      const rad = (i: number) => Math.max(1, Math.round((4.5 - (i / n) * 3.2) * k))
      for (let i = n - 1; i > 0; i--) {
        const [x0, y0] = pts[i]!
        const [x1, y1] = pts[i - 1]!
        const far = (pts[i]![2] ?? 1) < 0
        line(g, x0, y0, x1, y1, '#0a2a18', rad(i) * 2 + 2)
        line(g, x0, y0, x1, y1, far ? BODY.dark : BODY.mid, rad(i) * 2)
      }
      for (let i = n - 1; i > 0; i--) {
        const [x0, y0] = pts[i]!
        const [x1, y1] = pts[i - 1]!
        const far = (pts[i]![2] ?? 1) < 0
        const rr = rad(i)
        line(g, x0, y0 - rr + 1, x1, y1 - rr + 1, far ? BODY.mid : BODY.light)
        line(g, x0, y0 + rr - 1, x1, y1 + rr - 1, BODY.dark)
        if (i % 6 === 3) {
          // A gold ring across the body, square to it.
          const dx = x1 - x0
          const dy = y1 - y0
          const d = Math.hypot(dx, dy) || 1
          const nx = (-dy / d) * rr
          const ny = (dx / d) * rr
          line(g, x0 - nx, y0 - ny, x0 + nx, y0 + ny, far ? BODY.ringDark : BODY.ring, 2)
        }
      }
      // The head: bigger, its yellow crest swept back, a glint of an eye.
      const [hx, hy] = pts[0]!
      const [nx2] = pts[1] ?? pts[0]!
      const dir = hx >= nx2 ? 1 : -1
      const hr = Math.round(5 * k)
      ellipse(g, hx, hy, hr + 2, hr + 1, '#0a2a18')
      ellipse(g, hx, hy, hr + 1, hr, BODY.mid)
      rect(g, hx - hr, hy - hr, hr * 2, 1, BODY.light)
      line(g, hx, hy - hr, hx - dir * (hr + 5), hy - hr - 4, BODY.ring, 2)
      line(g, hx - dir * 2, hy + hr - 1, hx - dir * (hr + 4), hy + hr + 3, BODY.ring)
      rect(g, hx + dir * Math.round(hr * 0.4), hy - 1, 2, 1, '#ffd23a')
      rect(g, hx + dir * hr, hy + 1, 2, 1, '#ff3a3a')
    }
  },
}

/**
 * A dithered glow centred on (x, y), its radius and strength in steps: `glow` caches a canvas per radius and
 * strength, so a light that grows or fades reuses a handful of them instead of making one a frame.
 */
function shine(g: G, x: number, y: number, r: number, c: string, power: number, max: number) {
  const k = Math.round(Math.min(1, max) * 8) / 8
  if (k <= 0 || r < 1) return
  const rr = r > 12 ? Math.round(r / 4) * 4 : Math.round(r)
  g.drawImage(glow(rr, c, power, k), Math.round(x) - rr, Math.round(y) - rr)
}
