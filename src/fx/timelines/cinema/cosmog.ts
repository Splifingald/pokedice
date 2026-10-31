// Cosmog's raid entrance (docs/53): the altar at night, the sun's mark and the moon's both cut in its floor. A clear
// sky over the sea of clouds, the Milky Way across it. Then the sky turns into a nebula: clouds of pink, violet and
// blue gas bloom across the stars and begin to turn round a point above the altar. They turn faster and fall inward,
// the stars streaking after them, the whole sky spiralling down to one point, until all of it is a tiny cloud of stars
// no bigger than a fist. It drifts down to the altar, wobbling, twinkling, bounces once on the emblem, and pops. The
// reveal: the smallest legend of all.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  Particles,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { altarCanvas, altarLayout, cloudSea, emblemCanvas, peaks } from './altar'
import { hash2, raysCanvas, revealLight, stars } from './alolaKit'
import { AFTER_REVEAL, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

const T_NEB = 0.9
const T_SPIN = 2.1
const T_POINT = 3.3
const T_DRIFT = 3.45
const T_BOUNCE = 4.05
const REVEAL = 4.4
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#c8d8ff', '#6a6af0', '#1a1a5a'] as const
const NEB = ['#ff6ad0', '#c050ff', '#7a5aff', '#3a8aff', '#3ad8ff', '#ffd0f0'] as const

type Blob = { r: number; a: number; s: number; c: string; d: number; star: boolean }

type S = {
  r: Rng
  fx: Particles
  sky: Canvas
  band: Canvas
  sea: Canvas
  altar: Canvas
  lit: Canvas
  rays: Canvas
  blobs: Blob[]
}

export const cosmogCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const A = altarLayout(w, h, p.mon)
    const { cx, m, feet, sz } = A
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const eye = { x: cx, y: Math.round(h * 0.3) }
    const reach = Math.max(w, h) * 0.62
    /** How far the nebula has fallen in on itself: 0 spread over the sky, 1 one point. */
    const fall = (t: number) => ease.inQ(span(t, T_SPIN, T_POINT))
    /** The little cloud's way down: drifting, wobbling, one bounce on the emblem. */
    const puff = (t: number) => {
      const q = span(t, T_DRIFT, T_BOUNCE)
      const y = lerp(eye.y, feet - sz.h * 0.4, ease.ioS(q))
      const bounce = t > T_BOUNCE ? -Math.abs(Math.sin(span(t, T_BOUNCE, REVEAL) * Math.PI)) * m * 0.06 : 0
      return { x: cx + Math.round(Math.sin(q * Math.PI * 3) * m * 0.12 * (1 - q)), y: Math.round(y + bounce) }
    }
    return {
      id: 'cinema-cosmog',
      dur: DUR,
      setup() {
        const r = rng(789)
        const sky = dGradient(w, A.sea + 2, ['#03030c', '#08081e', '#121234', '#1e1a48', '#2a2458'])
        stars(sky.g, r, w, A.sea, Math.round(w * 0.3), '#4a4a8a', '#ffffff')
        peaks(sky.g, A, '#1a1a40', '#121230', rng(7891))
        // The Milky Way: a faint dithered band across the sky, dusted with stars.
        const band = canvas(w, A.sea)
        for (let x = 0; x < w; x++)
          for (let y = 0; y < A.sea; y++) {
            const d = Math.abs(y - (A.sea * 0.75 - x * 0.45 * (A.sea / w))) / (A.sea * 0.16)
            if (d > 1) continue
            const v = hash2(x, y)
            if (v > 0.9 - (1 - d) * 0.2)
              rect(band.g, x, y, 1, 1, v > 0.985 ? '#ffffff' : (x + y) % 3 ? '#3a3a78' : '#5a4a90')
          }
        // The nebula's clouds and knots of stars, in rings round the point they'll fall into.
        const blobs: Blob[] = Array.from({ length: Math.round(110 * (many < 1 ? 0.6 : 1)) }, (_, i) => {
          const arm = i % 3
          const rr = (0.08 + 0.92 * Math.sqrt(r())) * reach
          const star = r() < 0.3
          return {
            r: rr,
            // Three arms: each cloud sits along a spiral, close enough that the arms read.
            a: (arm / 3) * Math.PI * 2 + rr / (reach * 0.3) + r.range(-0.18, 0.18),
            s: Math.round(m * r.range(0.06, 0.13) * (0.6 + rr / reach)),
            // Pale near the heart, deeper colours out along the arms.
            c: rr < reach * 0.2 ? NEB[5] : NEB[(arm * 2 + (r() < 0.5 ? 0 : 1)) % 5]!,
            d: r.range(0.45, 0.75),
            star,
          }
        })
        return {
          r,
          fx: new Particles(),
          sky,
          band,
          sea: cloudSea(A, ['#c8c8f0', '#7a7ab0', '#4a4a80', '#2e2e5e'], rng(7892)),
          altar: altarCanvas(A, 'both', {
            lit: '#a098c8',
            mid: '#665e98',
            dark: '#3a3466',
            ink: '#181430',
            groove: '#2a2450',
          }),
          lit: emblemCanvas(A, 'both', '#c8d8ff', '#ffffff'),
          rays: raysCanvas(w, h),
          blobs,
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Stars streaking inward as the sky falls in.
        if (t > T_SPIN && t < T_POINT && r() < 2 * many) {
          const a = r() * Math.PI * 2
          const d = reach * r.range(0.5, 1.1)
          s.fx.add({
            x: eye.x + Math.cos(a) * d,
            y: eye.y + Math.sin(a) * d * 0.7,
            vx: -Math.cos(a + 0.6) * 60,
            vy: -Math.sin(a + 0.6) * 60,
            home: { x: eye.x, y: eye.y, k: 900 },
            life: 1.2,
            size: 1,
            shape: 'streak',
            trail: 0.03,
            colors: ['#ffffff', '#c8d8ff', NEB[r.int(0, 5)]!],
          })
        }
        // The little cloud trails glitter.
        if (t > T_DRIFT && t < REVEAL && r() < 0.8 * many) {
          const c = puff(t)
          s.fx.add({
            x: c.x + r.range(-4, 4),
            y: c.y + r.range(-4, 4),
            vy: r.range(-4, 6),
            life: r.range(0.4, 0.8),
            size: 1,
            shape: r() < 0.3 ? 'star' : 'px',
            colors: ['#ffffff', '#fff3a0', '#c8d8ff'],
          })
        }
        if (within(t, T_POINT, T_POINT + dt))
          for (let k = 0; k < 30 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(30, 90)
            s.fx.add({
              x: eye.x,
              y: eye.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 4,
              life: r.range(0.3, 0.6),
              size: 1,
              shape: 'star',
              colors: ['#ffffff', NEB[k % 6]!],
            })
          }
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 150)
            s.fx.add({
              x: cx,
              y: feet - sz.h * 0.5,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1.1),
              size: r.int(1, 2),
              shape: r() < 0.6 ? 'star' : 'sq',
              colors: ['#ffffff', '#fff3a0', NEB[k % 6]!],
            })
          }
        if (t > REVEAL + 0.3 && r() < 0.4 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h),
            vy: -r.range(4, 12),
            life: 1.2,
            size: 1,
            shape: r() < 0.5 ? 'star' : 'px',
            colors: ['#ffffff', '#fff3a0', '#c8d8ff'],
          })
      },
      draw(g, s, t) {
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.drawImage(s.sky, 0, 0)
        const f = fall(t)
        // The Milky Way fading as its stars are taken.
        dissolve(g, s.band, 1 - f, 0, 0)
        drawNebula(g, s, t)
        if (f > 0.5) wash(g, '#000004', 0.4 * span(f, 0.5, 1) * (1 - span(t, REVEAL, REVEAL + 1)), 8)
        g.drawImage(s.sea, 0, A.sea)
        g.drawImage(s.altar, 0, 0)
        // The emblem lights where it bounces.
        const lk = span(t, T_BOUNCE, T_BOUNCE + 0.25)
        if (lk > 0) dissolve(g, s.lit, lk, 0, 0)
        if (t > T_POINT && t < REVEAL) drawPuff(g, t)
        if (t >= REVEAL) {
          revealLight(
            g,
            s.rays,
            t,
            REVEAL,
            { x: cx, y: feet - sz.h * 0.5 },
            AURA,
            Math.max(w, h) * 0.6,
            0.6,
            AURA[2],
          )
          // It pops out a little squashed, then bobs.
          const pop = span(t, REVEAL, REVEAL + 0.3)
          const sq = 1 + Math.sin(pop * Math.PI * 2) * 0.12 * (1 - pop)
          drawSprite(g, p.mon, cx, feet - 4 + Math.round(Math.sin((t - REVEAL) * 3) * 2), {
            sx: 1 / sq,
            sy: sq,
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.4)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        s.fx.draw(g)
        if (within(t, T_POINT, T_POINT + 0.15))
          screenFlash(g, '#e0e8ff', 0.4 * (1 - span(t, T_POINT, T_POINT + 0.15)))
        if (within(t, REVEAL, REVEAL + 0.3))
          screenFlash(g, '#ffffff', 0.8 * (1 - span(t, REVEAL, REVEAL + 0.3)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => tone(131, 2.0, { type: 'sine', vol: 0.04 }))],
          ...[0.4, 0.7, 1.15, 1.6].map(
            (at, i) =>
              [
                at,
                quiet(() => tone([2093, 2637, 3136, 2349][i]!, 0.3, { type: 'sine', vol: 0.015 })),
              ] as const,
          ),
          [T_NEB, quiet(() => tone(262, 2.4, { type: 'triangle', vol: 0.03, slide: 131 }))],
          [T_NEB + 0.3, quiet(() => tone(392, 2.0, { type: 'sine', vol: 0.025 }))],
          [T_SPIN, quiet(() => hiss(1.2, { freq: 300, slide: 3000, vol: 0.06 }))],
          [T_SPIN + 0.4, quiet(() => tone(196, 0.8, { type: 'sawtooth', vol: 0.02, slide: 400 }))],
          [
            T_POINT,
            quiet(
              () => (tone(1568, 0.15, { type: 'square', vol: 0.03, slide: 800 }), fxSound('legend.pulse')),
            ),
          ],
          ...[0, 1, 2, 3].map(
            (i) =>
              [
                T_DRIFT + 0.1 + i * 0.13,
                quiet(() => tone(2349 + i * 300, 0.08, { type: 'triangle', vol: 0.02 })),
              ] as const,
          ),
          [T_BOUNCE, quiet(() => tone(440, 0.12, { type: 'square', vol: 0.03, slide: 440 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          // Its cry: "pew!"
          [REVEAL + 0.08, quiet(() => tone(1200, 0.14, { type: 'square', vol: 0.04, slide: 900 }))],
        ] satisfies Cue<S>[]),
    }

    /** The nebula: clouds blooming over the stars, turning round the point, falling into it faster and faster. */
    function drawNebula(g: G, s: S, t: number) {
      const bloom = span(t, T_NEB, T_NEB + 1)
      if (bloom <= 0 || t > T_POINT + 0.05) return
      const f = fall(t)
      // It turns slowly while it blooms, then whirls as it falls.
      const spin = (t - T_NEB) * 0.25 + ease.inQ(span(t, T_SPIN, T_POINT)) * 9
      for (const b of s.blobs) {
        const rr = b.r * (1 - f)
        const a = b.a + spin * (1 + (1 - b.r / reach) * 0.8)
        const x = eye.x + Math.cos(a) * rr
        const y = eye.y + Math.sin(a) * rr * 0.62
        const sz2 = Math.max(1, Math.round(b.s * (1 - f * 0.85)))
        if (b.star) {
          rect(g, x, y, 1, 1, '#ffffff')
          if (sz2 > 3) {
            rect(g, x - 1, y, 3, 1, '#ffffff')
            rect(g, x, y - 1, 1, 3, '#ffffff')
          }
          continue
        }
        // A soft cloud: a dithered glow, its size kept to even steps so the glows are drawn once each.
        const gr = Math.max(2, sz2 - (sz2 % 2))
        g.drawImage(
          glow(gr, b.c, 1.3, Math.round(b.d * bloom * 8) / 8),
          Math.round(x) - gr,
          Math.round(y) - gr,
        )
      }
      // Its heart, brighter as everything falls into it.
      const gr = Math.round(6 + 10 * f + 4 * bloom)
      g.drawImage(glow(gr, '#ffe0f8', 1.5, 0.5 + 0.4 * f), eye.x - gr, eye.y - gr)
    }

    /** The tiny cloud of stars: a puff of dark blue gas, gold and white points twinkling in it. */
    function drawPuff(g: G, t: number) {
      const c = puff(t)
      const pr = Math.round(m * 0.05) + 2
      const squash = t > T_BOUNCE && t < T_BOUNCE + 0.08 ? 0.7 : 1
      g.drawImage(glow(pr * 2, '#8a8aff', 1.5, 0.6), c.x - pr * 2, c.y - pr * 2)
      for (const [dx, dy, k, col] of [
        [0, 0, 1, '#2a2a7a'],
        [-0.6, 0.2, 0.7, '#3a3a9a'],
        [0.6, 0.2, 0.7, '#3a3a9a'],
        [0, -0.3, 0.6, '#5a5ac8'],
      ] as const)
        ellipse(
          g,
          c.x + dx * pr,
          c.y + dy * pr * squash,
          Math.round(pr * k),
          Math.max(1, Math.round(pr * k * 0.8 * squash)),
          col,
        )
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + t * 2
        const x = c.x + Math.cos(a) * pr * 0.6
        const y = c.y + Math.sin(a) * pr * 0.4
        rect(g, x, y, 1, 1, Math.floor(t * 12 + i) % 3 ? '#fff3a0' : '#ffffff')
      }
      // Two bright eyes peeking.
      rect(g, c.x - 2, c.y - 1, 1, 1, '#ffd23a')
      rect(g, c.x + 2, c.y - 1, 1, 1, '#ffd23a')
    }
  },
}
