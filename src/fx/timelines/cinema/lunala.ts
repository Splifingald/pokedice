// Lunala's raid entrance (docs/53): the Altar of the Moone at night. The platform above a silver sea of clouds, a huge
// full moon behind it; the Moon Flute's notes rise blue off the right pedestal. Then the eclipse: a black disc slides
// across the moon, the sky and the clouds go dark and the stars come out in thousands; at totality the diamond ring
// flashes and the corona opens round the black moon. Out of the eclipse two enormous wings unfold across the whole sky,
// a night sky themselves, full of stars. The Moongeist Beam drops from the eclipse onto the moon emblem, which lights
// up in violet fire; the wings fold down towards the altar into one shape, hovering in the beam. The reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  ring,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { altarCanvas, altarLayout, cloudSea, emblemCanvas, peaks } from './altar'
import { hash2, raysCanvas, revealLight, stars } from './alolaKit'
import { AFTER_REVEAL, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

const NOTES = [0.35, 0.55, 0.75, 0.95, 1.2] as const
const T_ECLIPSE = 1.0
const T_TOTAL = 2.15
const T_WINGS = 2.5
const T_BEAM = 3.4
const T_FOLD = 3.95
const REVEAL = 4.75
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#e0c8ff', '#8a5ad0', '#2a1a5a'] as const

type S = {
  r: Rng
  fx: Particles
  sky: Canvas
  starsMore: Canvas
  sea: Canvas
  altar: Canvas
  lit: Canvas
  wings: Canvas
  rays: Canvas
  shakes: [number, number, number][]
}

export const lunalaCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const A = altarLayout(w, h, p.mon)
    const { cx, m, feet, sz } = A
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const moonR = Math.round(m * 0.19)
    const moon = { x: cx, y: Math.round(Math.min(A.sea - moonR * 0.3, feet - sz.h * 0.62)) }
    const body = { x: cx, y: Math.round(feet - sz.h * 0.5) }
    /** How covered the moon is: 0 full, 1 total. */
    const cover = (t: number) => ease.ioS(span(t, T_ECLIPSE, T_TOTAL))
    const WW = Math.round(Math.max(w * 0.5 + 6, Math.min(w * 0.5, m * 1.05)))
    const WH = Math.round(Math.min(h * 0.5, m * 0.85))
    return {
      id: 'cinema-lunala',
      dur: DUR,
      setup() {
        const r = rng(792)
        const sky = dGradient(w, A.sea + 2, ['#04030e', '#0a0a24', '#16163e', '#28285a', '#3a3a70'])
        stars(sky.g, r, w, A.sea, Math.round(w * 0.35), '#4a4a8a', '#e0e8ff')
        peaks(sky.g, A, '#1e2048', '#141634', rng(7921))
        const starsMore = shade(w, A.sea, (x, y) => {
          const v = hash2(x, y)
          return v > 0.985 ? (v > 0.996 ? '#ffffff' : '#8a8ad0') : null
        })
        return {
          r,
          fx: new Particles(),
          sky,
          starsMore,
          sea: cloudSea(A, ['#e0e8ff', '#9aa8d8', '#6a74a8', '#4a4e80'], rng(7922)),
          altar: altarCanvas(A, 'moone', {
            lit: '#a8b0d0',
            mid: '#6a7098',
            dark: '#3a3e60',
            ink: '#181a30',
            groove: '#2a2c48',
          }),
          lit: emblemCanvas(A, 'moone', '#c8a0ff', '#ffffff'),
          wings: nightWings(WW * 2, WH),
          rays: raysCanvas(w, h),
          shakes: p.short
            ? []
            : [
                [T_BEAM, 0.7, 3],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        for (const [i, at] of NOTES.entries())
          if (within(t, at, at + dt))
            s.fx.add({
              x: A.peds[1]!.x + r.range(-3, 3),
              y: A.peds[1]!.top - 4,
              vx: -r.range(4, 14) - i * 2,
              vy: -r.range(14, 24),
              life: 1.6,
              size: 1,
              shape: 'note',
              colors: ['#e0e8ff', '#a8b8ff', '#8a7ad8'],
            })
        // The Moongeist Beam's violet fire licking up off the emblem.
        if (t > T_BEAM && t < REVEAL + 0.4 && r() < 1.5 * many) {
          const a = r() * Math.PI * 2
          const d = Math.sqrt(r())
          s.fx.add({
            x: cx + Math.cos(a) * d * A.rx * 0.7,
            y: A.py + Math.sin(a) * d * A.ry * 0.7,
            vy: -r.range(20, 50),
            vx: r.range(-6, 6),
            life: r.range(0.5, 0.9),
            size: r.int(2, 3),
            size1: 0,
            shape: 'disc',
            colors: ['#ffffff', '#e0c8ff', '#a06af0', '#5a2aa8'],
          })
        }
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 190)
            s.fx.add({
              x: body.x,
              y: body.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              drag: 2.5,
              life: r.range(0.5, 1.1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...AURA],
            })
          }
        if (t > REVEAL && r() < 0.4 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.6, sz.w * 0.6),
            y: feet - r.range(0, sz.h),
            vy: -r.range(6, 14),
            life: 1.2,
            size: 1,
            shape: r() < 0.4 ? 'star' : 'px',
            colors: ['#ffffff', '#e0c8ff', '#8a5ad0'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        const cv = cover(t)
        g.drawImage(s.sky, 0, 0)
        // The dark of the eclipse, and its thousand stars.
        wash(g, '#000004', 0.55 * cv, 8)
        if (cv > 0.3) dissolve(g, s.starsMore, span(cv, 0.3, 1), 0, 0)
        drawMoon(g, t, cv)
        drawWings(g, s, t)
        g.drawImage(s.sea, 0, A.sea)
        g.drawImage(s.altar, 0, 0)
        if (cv > 0) {
          // The clouds and the altar in the eclipse's shadow: a stepped dim over the low part only.
          g.save()
          g.globalAlpha = Math.round(cv * 0.5 * 8) / 8
          g.fillStyle = '#02010a'
          g.fillRect(-8, A.sea, w + 16, h - A.sea + 8)
          g.restore()
        }
        // The emblem lit by the beam.
        const lk = span(t, T_BEAM + 0.05, T_BEAM + 0.4)
        if (lk > 0) dissolve(g, s.lit, lk, 0, 0)
        if (t > T_BEAM - 0.05 && t < REVEAL + 0.5) drawBeam(g, t)
        // Where the wings fold to: its silhouette in the beam.
        if (t > T_FOLD + 0.25 && t < REVEAL)
          drawSprite(g, p.mon, cx, feet, {
            sil: '#0a0820',
            outline: Math.floor(t * 12) % 3 ? AURA[1] : AURA[0],
          })
        if (t >= REVEAL) {
          revealLight(g, s.rays, t, REVEAL, body, AURA, Math.max(w, h) * 0.8, 0.8, AURA[2])
          drawSprite(g, p.mon, cx, feet - 2 + Math.round(Math.sin((t - REVEAL) * 1.8) * 2), {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        s.fx.draw(g)
        g.restore()
        if (within(t, T_TOTAL, T_TOTAL + 0.18))
          screenFlash(g, '#f0f0ff', 0.5 * (1 - span(t, T_TOTAL, T_TOTAL + 0.18)))
        if (within(t, T_BEAM, T_BEAM + 0.18))
          screenFlash(g, '#e0c8ff', 0.5 * (1 - span(t, T_BEAM, T_BEAM + 0.18)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.6, { freq: 300, type: 'lowpass', vol: 0.03 }))],
          // The Moon Flute: a falling phrase.
          ...[1319, 1047, 880, 784, 659].map(
            (f, i) =>
              [NOTES[i]!, quiet(() => tone(f, i === 4 ? 0.7 : 0.22, { type: 'sine', vol: 0.045 }))] as const,
          ),
          [T_ECLIPSE, quiet(() => tone(196, 1.3, { type: 'sine', vol: 0.05, slide: -60 }))],
          [T_ECLIPSE + 0.3, quiet(() => tone(98, 1.1, { type: 'sawtooth', vol: 0.015 }))],
          [T_TOTAL, quiet(() => (tone(2637, 0.5, { type: 'triangle', vol: 0.03 }), fxSound('legend.pulse')))],
          [T_WINGS, quiet(() => hiss(0.9, { freq: 180, slide: 500, vol: 0.09 }))],
          [T_WINGS + 0.1, quiet(() => tone(147, 0.8, { type: 'square', vol: 0.02, slide: 74 }))],
          [3.0, quiet(() => fxSound('legend.heart'))],
          [3.25, quiet(() => fxSound('legend.heart'))],
          [
            T_BEAM,
            quiet(() => (fxSound('nightmare.beam'), hiss(1.0, { freq: 1200, slide: -900, vol: 0.07 }))),
          ],
          [T_FOLD, quiet(() => hiss(0.6, { freq: 600, slide: -400, vol: 0.06 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }

    /** The moon, the black disc crossing it, at totality the diamond ring, then the corona. */
    function drawMoon(g: G, t: number, cv: number) {
      const glowK = 1 - cv
      if (glowK > 0) {
        const gr = Math.round(moonR * 2)
        g.drawImage(glow(gr, '#8a9ad8', 2, 0.6 * glowK), moon.x - gr, moon.y - gr)
      }
      ellipse(g, moon.x, moon.y, moonR, moonR, '#e8eeff')
      // Its seas.
      for (const [dx, dy, k] of [
        [-0.3, -0.2, 0.28],
        [0.25, 0.1, 0.22],
        [-0.1, 0.35, 0.18],
        [0.35, -0.35, 0.12],
      ] as const)
        ellipse(
          g,
          moon.x + dx * moonR,
          moon.y + dy * moonR,
          Math.round(k * moonR),
          Math.round(k * moonR * 0.8),
          '#c0c8e8',
        )
      // The black disc sliding across from the left: only where it covers the moon (against the night it can't be
      // seen), row by row.
      const off = Math.round(-moonR * 2.3 * (1 - cv))
      for (let dy = -moonR; dy <= moonR; dy++) {
        const hw = Math.round(moonR * Math.sqrt(Math.max(0, 1 - (dy * dy) / (moonR * moonR + 0.25))))
        const x0 = Math.max(moon.x - hw, moon.x + off - hw - 1)
        const x1 = Math.min(moon.x + hw, moon.x + off + hw + 1)
        if (x1 >= x0) rect(g, x0, moon.y + dy, x1 - x0 + 1, 1, '#04030c')
      }
      if (t >= T_TOTAL) {
        // The corona: rings of thin light, pulsing; a bead of light at the edge for an instant (the diamond ring).
        const k = span(t, T_TOTAL, T_TOTAL + 0.3)
        for (const [dr, col, d] of [
          [3, '#ffffff', 0.9],
          [7, '#c8a0ff', 0.6],
          [12, '#6a4ab0', 0.4],
        ] as const) {
          const rr = moonR + Math.round(dr * (1 + 0.1 * Math.sin(t * 3)))
          const r2 = rr - (rr % 2)
          g.drawImage(ring(r2, Math.round(3 + dr * 0.3), col, d * k), moon.x - r2 - 1, moon.y - r2 - 1)
        }
        const bead = 1 - span(t, T_TOTAL, T_TOTAL + 0.5)
        if (bead > 0) {
          const bx = moon.x + Math.round(moonR * 0.7)
          const by = moon.y - Math.round(moonR * 0.7)
          const br = Math.round(6 + 8 * bead)
          g.drawImage(glow(br, '#ffffff', 1.4, 0.95), bx - br, by - br)
          rect(g, bx - br * 1.5, by, br * 3, 1, '#ffffff')
          rect(g, bx, by - br * 1.5, 1, br * 3, '#ffffff')
        }
        ellipse(g, moon.x, moon.y, moonR, moonR, '#04030c')
      }
    }

    /** The wings: unfolding out of the eclipse across the sky, then folding down to the altar. */
    function drawWings(g: G, s: S, t: number) {
      if (t < T_WINGS || t > REVEAL) return
      const open = ease.outBack(span(t, T_WINGS, T_WINGS + 0.6), 1.2)
      const fold = ease.inQ(span(t, T_FOLD, T_FOLD + 0.35))
      const sx = Math.max(0.04, open * (1 - fold * 0.92))
      const sy = lerp(0.5, 1, Math.min(1, open)) * (1 - fold * 0.75)
      const ww = Math.max(2, Math.round(s.wings.width * sx))
      const hh = Math.max(2, Math.round(s.wings.height * sy))
      const y0 = lerp(moon.y, body.y, fold)
      // The wings' root sits at the eclipse, a third of the way down them.
      g.drawImage(s.wings, cx - (ww >> 1), Math.round(y0 - hh * 0.38), ww, hh)
    }

    /** The Moongeist Beam: a column of violet light from the eclipse to the emblem, two strands winding round it. */
    function drawBeam(g: G, t: number) {
      const q = ease.outC(span(t, T_BEAM - 0.05, T_BEAM + 0.1))
      const fade = 1 - span(t, REVEAL, REVEAL + 0.5)
      const half = Math.round(m * 0.06 * fade * (1 + 0.1 * Math.sin(t * 30)))
      if (half < 1) return
      const top = moon.y
      const bottom = Math.round(lerp(top, A.py, q))
      rect(g, cx - half - 3, top, half * 2 + 6, bottom - top, pattern(g, '#6a3ab0', 8))
      rect(g, cx - half, top, half * 2, bottom - top, '#a06af0')
      rect(g, cx - Math.round(half * 0.55), top, Math.round(half * 1.1), bottom - top, '#e0c8ff')
      rect(g, cx - Math.round(half * 0.2), top, Math.max(1, Math.round(half * 0.4)), bottom - top, '#ffffff')
      for (let y = top; y < bottom; y++) {
        const a = y / 6 - t * 14
        const x1 = cx + Math.round(Math.sin(a) * (half + 3))
        const x2 = cx - Math.round(Math.sin(a) * (half + 3))
        rect(g, x1, y, 1, 1, Math.cos(a) > 0 ? '#ffffff' : '#5ad8ff')
        rect(g, x2, y, 1, 1, Math.cos(a) > 0 ? '#ff8ae0' : '#ffffff')
      }
      // Its splash on the emblem.
      if (q >= 1) {
        ellipse(g, cx, A.py, half * 3, Math.max(2, Math.round(half * 0.8)), pattern(g, '#e0c8ff', 9))
        line(g, cx - half * 3, A.py, cx + half * 3, A.py, '#ffffff')
      }
    }
  },
}

/**
 * Lunala's wings, drawn once: two great bat wings from the middle out, a night sky inside them (deep blue, stars,
 * the finger bones in violet), their tops rimmed in violet with a gold crescent line, the lower edge scalloped
 * between the fingers.
 */
function nightWings(W2: number, H: number): Canvas {
  const W = W2 / 2
  const top = (u: number) => -0.08 - 0.62 * Math.pow(Math.sin((u * Math.PI) / 2), 1.2)
  const bot = (u: number) => lerp(0.75, -0.42, u) - 0.17 * Math.abs(Math.sin(u * Math.PI * 3))
  const cy = H * 0.38
  const inside = (x: number, y: number) => {
    const u = Math.abs(x + 0.5 - W) / W
    const v = (y - cy) / H
    if (u > 1) return false
    // The body between the wings: a narrow column.
    if (u < 0.03) return v > -0.2 && v < 0.5
    return v > top(u) && v < bot(u)
  }
  const cv = shade(W2, H, (x, y) => {
    if (!inside(x, y)) return null
    const u = Math.abs(x + 0.5 - W) / W
    if (!inside(x, y - 1) || !inside(x, y - 2)) return u > 0.55 ? '#ffd23a' : '#c8a0ff'
    if (!inside(x, y - 4)) return '#8a5ad0'
    if (!inside(x, y + 1) || !inside(x + 1, y) || !inside(x - 1, y)) return '#8a5ad0'
    if (!inside(x, y + 3)) return '#4a2a8a'
    const v = hash2(x, y)
    if (v > 0.982) return '#ffffff'
    if (v > 0.962) return '#8ab0ff'
    if (v > 0.95) return '#5a4aa8'
    // Deep blue, a little lighter towards the tips, dithered.
    return bayer(x, y) < u * 0.5 ? '#1a1a4a' : '#0a0a26'
  })
  // The finger bones: from the shoulder to each point of the scalloped edge.
  const g = cv.g
  for (const side of [-1, 1])
    for (const u of [1 / 3, 2 / 3, 1]) {
      const x = W + side * u * W * 0.98
      const y = cy + bot(u) * H - 2
      line(g, W + side * W * 0.05, cy - H * 0.05, x, y, '#3a2a6a')
    }
  return cv
}
