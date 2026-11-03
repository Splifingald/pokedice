// Solgaleo's raid entrance (docs/53): the Altar of the Sunne before dawn. The platform above the sea of clouds, the
// last stars; the Sun Flute's notes rise gold off the left pedestal. The sun comes up out of the clouds behind the altar
// and the sky warms; the sun emblem in the floor lights ray by ray and light stands on both pedestals. Round the sun a
// great emblem of spikes grows, the sun's own crest, turning. The sun flares, and the Sunsteel Strike leaves it: a
// white-hot comet climbing into the sky, turning over and plunging onto the altar. The impact; in the settling light
// the lion stands on the emblem, the crest blazing behind it. The reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { quad, screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { altarCanvas, altarLayout, cloudSea, emblemCanvas, peaks } from './altar'
import { raysCanvas, revealLight, stars } from './alolaKit'
import { AFTER_REVEAL, dGradient, dissolve, inOrder, tri, type Cinema, type CinemaParams } from './kit'

const NOTES = [0.35, 0.55, 0.75, 0.95, 1.2] as const
const T_RISE = 0.9
const T_ALTAR = 1.6
const T_CREST = 2.3
const T_LAUNCH = 3.35
const T_IMPACT = 4.15
const REVEAL = 4.6
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#fff3a0', '#ffa03a', '#7a3a0a'] as const
const GOLD = ['#ffffff', '#fff3a0', '#ffd23a', '#ff9a2a', '#c85a1a'] as const

type S = {
  r: Rng
  fx: Particles
  night: Canvas
  dawn: Canvas
  seaNight: Canvas
  seaDawn: Canvas
  altar: Canvas
  lit: Canvas
  rays: Canvas
  shakes: [number, number, number][]
}

export const solgaleoCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const A = altarLayout(w, h, p.mon)
    const { cx, m, feet, sz } = A
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const sunR = Math.round(m * 0.15)
    const sunTop = Math.round(Math.min(A.sea - sunR * 0.6, feet - sz.h * 0.62, A.py - A.ry - sunR * 0.3))
    const sunAt = (t: number) => ({
      x: cx,
      y: Math.round(lerp(A.sea + sunR + 4, sunTop, ease.outC(span(t, T_RISE, T_RISE + 1.3)))),
    })
    const body = { x: cx, y: Math.round(feet - sz.h * 0.45) }
    /** The comet's path: up out of the sun, over, and down onto the emblem. */
    const comet = (t: number) => {
      const q = ease.inQ(span(t, T_LAUNCH, T_IMPACT))
      return quad(sunAt(T_LAUNCH), { x: w * 1.05, y: -h * 0.45 }, { x: body.x, y: body.y }, q)
    }
    return {
      id: 'cinema-solgaleo',
      dur: DUR,
      setup() {
        const r = rng(791)
        const night = dGradient(w, A.sea + 2, ['#060818', '#121434', '#2a2050', '#5a3060', '#9a4a5a'])
        stars(night.g, r, w, Math.round(A.sea * 0.7), Math.round(w * 0.3), '#5a5a8a', '#ffffff')
        const dawn = dGradient(w, A.sea + 2, ['#2a3a7a', '#6a5a9a', '#d0789a', '#ff9a6a', '#ffd08a'])
        for (const [cv, far, near] of [
          [night, '#2a2448', '#1a1834'],
          [dawn, '#9a6a9a', '#6a4a7a'],
        ] as const)
          peaks(cv.g, A, far, near, rng(7911))
        return {
          r,
          fx: new Particles(),
          night,
          dawn,
          seaNight: cloudSea(A, ['#8a7aa8', '#5a4a7a', '#3a3058', '#2a2244'], rng(7912)),
          seaDawn: cloudSea(A, ['#fff3c8', '#ffc89a', '#e0907a', '#b06a6a'], rng(7912)),
          altar: altarCanvas(A, 'sunne', {
            lit: '#e8d0b0',
            mid: '#b89878',
            dark: '#7a5a48',
            ink: '#3a2420',
            groove: '#5a4030',
          }),
          lit: emblemCanvas(A, 'sunne', '#ffd23a', '#ffffff'),
          rays: raysCanvas(w, h),
          shakes: p.short
            ? []
            : [
                [T_LAUNCH, 0.3, 2],
                [T_IMPACT, 0.75, 5],
                [REVEAL, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        for (const [i, at] of NOTES.entries())
          if (within(t, at, at + dt))
            s.fx.add({
              x: A.peds[0]!.x + r.range(-3, 3),
              y: A.peds[0]!.top - 4,
              vx: r.range(4, 14) + i * 2,
              vy: -r.range(14, 24),
              life: 1.6,
              size: 1,
              shape: 'note',
              colors: ['#fff3a0', '#ffd23a', '#ff9a2a'],
            })
        // Light standing on the pedestals once the emblem is lit.
        if (t > T_ALTAR && r() < 0.6 * many)
          for (const pd of A.peds)
            s.fx.add({
              x: pd.x + r.range(-2, 2),
              y: pd.top - 3,
              vy: -r.range(30, 60),
              life: 0.6,
              size: 1,
              shape: 'px',
              colors: ['#ffffff', '#fff3a0', '#ffd23a'],
            })
        // The comet's fire shed behind it.
        if (t > T_LAUNCH && t < T_IMPACT)
          for (let i = 0; i < 3; i++) {
            const c = comet(t)
            s.fx.add({
              x: c.x + r.range(-3, 3),
              y: c.y + r.range(-3, 3),
              vx: r.range(-30, 30),
              vy: r.range(-30, 30),
              drag: 2,
              life: r.range(0.3, 0.6),
              size: r.int(1, 3),
              size1: 0,
              shape: 'disc',
              colors: [...GOLD],
            })
          }
        if (within(t, T_IMPACT, T_IMPACT + dt)) {
          for (let i = 0; i < 90 * many; i++) {
            const a = Math.PI + r() * Math.PI
            const v = r.range(60, 220)
            s.fx.add({
              x: body.x + r.range(-6, 6),
              y: feet,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              ay: 240,
              life: r.range(0.5, 1.1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'sq' : 'streak',
              trail: 0.03,
              colors: [...GOLD],
            })
          }
          for (let i = 0; i < 24 * many; i++)
            s.fx.add({
              x: body.x + r.range(-A.rx * 0.5, A.rx * 0.5),
              y: feet + r.range(-3, 3),
              vx: r.range(-40, 40),
              vy: -r.range(5, 25),
              drag: 1.5,
              life: r.range(0.6, 1.2),
              size: r.int(3, 5),
              shape: 'smoke',
              colors: ['#e8d0b0', '#b89878'],
            })
        }
        if (t > REVEAL && r() < 0.5 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.6, sz.w * 0.6),
            y: feet - r.range(0, sz.h),
            vy: -r.range(10, 24),
            life: 1,
            size: 1,
            shape: r() < 0.3 ? 'star' : 'px',
            colors: ['#ffffff', '#fff3a0', '#ffd23a'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The sky warming as the sun comes up.
        const warm = ease.ioS(span(t, T_RISE, T_RISE + 1.2))
        g.drawImage(s.night, 0, 0)
        if (warm > 0) dissolve(g, s.dawn, warm, 0, 0)
        const sun = sunAt(t)
        drawSun(g, t, sun, warm)
        // The sea of clouds, in front of the sun's lower half (it rises out of them).
        g.drawImage(s.seaNight, 0, A.sea)
        if (warm > 0) dissolve(g, s.seaDawn, warm, 0, A.sea)
        g.drawImage(s.altar, 0, 0)
        // The emblem lighting up, a ring of light running out over it.
        const lk = span(t, T_ALTAR, T_ALTAR + 0.5)
        if (lk > 0) {
          const flare = t > T_IMPACT ? 1 : 0
          dissolve(g, s.lit, Math.min(1, lk), 0, 0)
          if (flare) {
            const q = span(t, T_IMPACT, T_IMPACT + 0.6)
            if (q < 1)
              ellipse(
                g,
                cx,
                A.py,
                Math.round(A.rx * 0.8 * q),
                Math.round(A.ry * 0.8 * q),
                pattern(g, '#fff3a0', 10 * (1 - q)),
              )
          }
          const rq = span(t, T_ALTAR, T_ALTAR + 0.5)
          if (rq < 1)
            ellipseLine(
              g,
              cx,
              A.py,
              Math.round(A.rx * 0.8 * rq),
              Math.max(1, Math.round(A.ry * 0.8 * rq)),
              '#ffffff',
            )
        }
        // Light standing on the pedestals.
        if (t > T_ALTAR)
          for (const pd of A.peds) {
            const k = span(t, T_ALTAR, T_ALTAR + 0.3)
            g.drawImage(glow(9, '#ffd23a', 1.5, 0.7 * k), pd.x - 9, pd.top - 12)
            rect(g, pd.x - 1, pd.top - 6, 3, 3, '#ffffff')
          }
        // Before the crest takes the light, a pause: the world holds its breath.
        // The comet: up out of the sun, over, down.
        if (t > T_LAUNCH && t < T_IMPACT + 0.02) drawComet(g, t)
        // After the impact: its silhouette standing in the light, then itself.
        if (t > T_IMPACT && t < REVEAL) {
          const k = span(t, T_IMPACT, REVEAL)
          const gr = Math.round(m * (0.35 - 0.12 * k))
          g.drawImage(glow(gr, '#fff3a0', 1.3, 0.8), body.x - gr, body.y - gr)
          drawSprite(g, p.mon, cx, feet, {
            sil: '#2a1206',
            outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[0],
          })
        }
        if (t >= REVEAL) {
          revealLight(g, s.rays, t, REVEAL, body, AURA, Math.max(w, h) * 0.8, 0.8, AURA[2])
          drawSprite(g, p.mon, cx, feet + Math.round(Math.sin((t - REVEAL) * 1.6)), {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        s.fx.draw(g)
        g.restore()
        if (within(t, T_LAUNCH, T_LAUNCH + 0.15))
          screenFlash(g, '#fff3c8', 0.35 * (1 - span(t, T_LAUNCH, T_LAUNCH + 0.15)))
        if (within(t, T_IMPACT, T_IMPACT + 0.2))
          screenFlash(g, '#fff8e0', 0.7 * (1 - span(t, T_IMPACT, T_IMPACT + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.6, { freq: 400, type: 'lowpass', vol: 0.03 }))],
          // The Sun Flute: a rising phrase.
          ...[659, 784, 988, 1175, 1319].map(
            (f, i) =>
              [
                NOTES[i]!,
                quiet(() => tone(f, i === 4 ? 0.6 : 0.22, { type: 'triangle', vol: 0.04 })),
              ] as const,
          ),
          [T_RISE, quiet(() => tone(262, 2.0, { type: 'sine', vol: 0.04, slide: 130 }))],
          [T_RISE + 0.2, quiet(() => tone(392, 1.8, { type: 'sine', vol: 0.025, slide: 196 }))],
          [T_ALTAR, quiet(() => tone(1568, 0.6, { type: 'triangle', vol: 0.03, slide: 400 }))],
          [T_CREST, quiet(() => hiss(0.9, { freq: 900, slide: 1800, vol: 0.04 }))],
          [2.65, quiet(() => fxSound('legend.heart'))],
          [2.95, quiet(() => fxSound('legend.heart'))],
          [3.15, quiet(() => fxSound('legend.heart'))],
          [T_LAUNCH, quiet(() => (fxSound('z.blaze'), hiss(0.8, { freq: 500, slide: 2500, vol: 0.08 })))],
          [3.85, quiet(() => hiss(0.4, { freq: 3000, slide: -2400, vol: 0.08 }))],
          [
            T_IMPACT,
            quiet(() => (fxSound('impact.hit'), tone(55, 0.9, { type: 'sawtooth', vol: 0.06, slide: -20 }))),
          ],
          [T_IMPACT + 0.02, quiet(() => hiss(0.9, { freq: 250, type: 'lowpass', vol: 0.14 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }

    /** The sun, its rays turning, and from T_CREST its crest of spikes growing round it, one spike at a time. */
    function drawSun(g: G, t: number, c: { x: number; y: number }, warm: number) {
      if (warm <= 0) return
      const pulseK = t > 2.6 && t < T_LAUNCH ? Math.max(0, Math.sin((t - 2.6) * Math.PI * 3.3)) : 0
      const R = Math.round(sunR * (1 + 0.08 * pulseK))
      // Long rays fanning up out of it, dithered, turning.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.12
        const len = Math.max(w, h)
        const a0 = a - 0.06
        const a1 = a + 0.06
        tri(
          g,
          c.x,
          c.y,
          c.x + Math.cos(a0) * len,
          c.y + Math.sin(a0) * len,
          c.x + Math.cos(a1) * len,
          c.y + Math.sin(a1) * len,
          pattern(g, '#ffe8a0', 3 * warm),
        )
      }
      const gr = Math.round(R * 2.2)
      g.drawImage(glow(gr, '#ffb04a', 1.8, 0.7 * warm), c.x - gr, c.y - gr)
      // The crest: twenty spikes round the sun, each pushed out in turn, the whole turning.
      const crest = span(t, T_CREST, T_CREST + 0.6)
      if (crest > 0) {
        const n = 20
        for (let i = 0; i < n; i++) {
          const k = span(crest * n - i, 0, 1)
          if (k <= 0) continue
          const a = (i / n) * Math.PI * 2 - t * 0.5
          const r0 = R + 3
          const r1 = R + 3 + Math.round((i % 2 ? 0.55 : 0.95) * R * ease.outBack(k))
          const da = Math.PI / n
          tri(
            g,
            c.x + Math.cos(a - da) * r0,
            c.y + Math.sin(a - da) * r0,
            c.x + Math.cos(a + da) * r0,
            c.y + Math.sin(a + da) * r0,
            c.x + Math.cos(a) * r1,
            c.y + Math.sin(a) * r1,
            i % 2 ? '#ff9a2a' : '#ffd23a',
          )
          line(
            g,
            c.x + Math.cos(a) * r0,
            c.y + Math.sin(a) * r0,
            c.x + Math.cos(a) * r1,
            c.y + Math.sin(a) * r1,
            '#fff3a0',
          )
        }
        ellipseLine(g, c.x, c.y, R + 3, R + 3, '#fff3a0')
      }
      ellipse(g, c.x, c.y, R, R, '#ffd23a')
      ellipse(g, c.x, c.y, R - 2, R - 2, '#fff3a0')
      ellipse(g, c.x - 1, c.y - 1, Math.max(1, R - 5), Math.max(1, R - 5), '#fffbe8')
      // The flare as the comet leaves it.
      const fl = span(t, T_LAUNCH - 0.15, T_LAUNCH + 0.25)
      if (fl > 0 && fl < 1) {
        const fr = Math.round(R * (1.5 + fl * 2))
        g.drawImage(
          glow(fr - (fr % 2), '#ffffff', 1.4, 0.9 * Math.sin(fl * Math.PI)),
          c.x - fr + (fr % 2),
          c.y - fr + (fr % 2),
        )
      }
    }

    /** The Sunsteel Strike: a white-hot head with its silhouette inside, a long burning tail along its path. */
    function drawComet(g: G, t: number) {
      // The tail: the path behind it, thick and white near the head, thinning to orange.
      for (let k = 14; k >= 0; k--) {
        const a = comet(t - k * 0.025)
        const b = comet(t - (k + 1) * 0.025)
        const wd = Math.max(1, Math.round((1 - k / 15) * m * 0.07))
        line(g, b.x, b.y, a.x, a.y, GOLD[Math.min(4, Math.floor(k / 3))]!, wd)
      }
      const c = comet(t)
      const gr = Math.round(m * 0.14)
      g.drawImage(glow(gr, '#fff3a0', 1.3, 0.9), c.x - gr, c.y - gr)
      drawSprite(g, p.mon, c.x, c.y + sz.h * 0.25, { sx: 0.5, sy: 0.5, sil: '#ffffff', outline: '#ffd23a' })
    }
  },
}
