// The red Gyarados's raid entrance (docs/53): the Lake of Rage at dusk. Magikarp leaping in a calm lake under a red
// sky, hills all round, a radio mast on the far shore. The mast's lamp starts blinking and its signal pulses out over
// the water in red rings: the Magikarp go wild, leaping everywhere. One leaps higher than the rest and stops in the air,
// glowing white; it swells and flickers between its shape and a serpent's, as an evolution does, then crashes into the
// lake as one. The sky breaks into a storm; a red glow circles under the water; the lake erupts and the red Gyarados
// rises out of it, enraged. The reveal; it towers over the lake in the storm.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  glow,
  icon,
  lerp,
  Particles,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

const T_SIGNAL = 0.9
const T_LEAP = 1.95
const T_EVOLVE = 2.25
const T_CRASH = 3.05
const T_RISE = 3.75
const REVEAL = 4.5
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffb0a0', '#e0403a', '#6a0a0a'] as const
/** A Magikarp, ten pixels long, facing left. */
const KARP = [
  '...yy.....',
  '..rrrr..y.',
  '.rwkrrryyy',
  'rrrrrrrryy',
  '.rwwwrry.y',
  '..yrrry...',
  '...y......',
]
const KARP_PAL = { r: '#e0503a', w: '#fff0e0', k: '#1a1010', y: '#ffd23a' }
const flipped = KARP.map((row) => [...row].reverse().join(''))

type S = {
  r: ReturnType<typeof rng>
  fx: Particles
  rain: Particles
  dusk: Canvas
  storm: Canvas
  hills: Canvas
  rays: Canvas
  karps: { x: number; y: number; t0: number; dur: number; h: number; left: boolean }[]
  shakes: [number, number, number][]
  bolts: [number, number][][]
}

export const gyaradosCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const lake = Math.round(h * 0.62)
    const feet = Math.round(h * 0.66)
    const sz = spriteSize(p.mon)
    const mast = { x: Math.round(w * 0.82), top: lake - Math.round(h * 0.2) }
    const apex = { x: cx, y: Math.round(h * 0.3) }
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const karp = (g: G, x: number, y: number, left: boolean, k = 1) =>
      g.drawImage(icon(left ? KARP : flipped, KARP_PAL, k), Math.round(x - 5 * k), Math.round(y - 4 * k))
    return {
      id: 'cinema-gyarados',
      dur: DUR,
      setup() {
        const r = rng(130)
        const hills = canvas(w, h)
        for (const [k, c] of [
          [0, '#2a0e12'],
          [1, '#1a080c'],
        ] as const)
          for (let x = 0; x < w; x++) {
            const y = Math.round(
              lake - 6 - k * 4 - Math.abs(Math.sin(x / (40 - k * 12) + k)) * h * (0.08 - k * 0.03),
            )
            rect(hills.g, x, y, 1, lake - y + 1, c)
          }
        // The radio mast: a lattice line, its lamp lit live.
        for (let y = mast.top; y < lake; y += 2) {
          const half = Math.round(((y - mast.top) / (lake - mast.top)) * 4)
          rect(hills.g, mast.x - half, y, 1, 2, '#0a0406')
          rect(hills.g, mast.x + half, y, 1, 2, '#0a0406')
          if (y % 6 === 0) rect(hills.g, mast.x - half, y, half * 2 + 1, 1, '#0a0406')
        }
        // Leaping Magikarp: when, where, how high.
        const karps: S['karps'] = []
        for (let i = 0; i < 6; i++)
          karps.push({
            x: r.range(w * 0.1, w * 0.9),
            y: lake + Math.round(r.range(3, (h - lake) * 0.5)),
            t0: 0.2 + i * 0.28,
            dur: 0.6,
            h: r.range(10, 18),
            left: r() < 0.5,
          })
        for (let i = 0; i < 26; i++)
          karps.push({
            x: r.range(w * 0.05, w * 0.95),
            y: lake + Math.round(r.range(3, (h - lake) * 0.6)),
            t0: T_SIGNAL + 0.2 + r.range(0, 1.0),
            dur: r.range(0.35, 0.55),
            h: r.range(14, 34),
            left: r() < 0.5,
          })
        return {
          r,
          fx: new Particles(),
          rain: new Particles(),
          dusk: dGradient(w, lake, ['#2a0a24', '#6a1a34', '#c0402a', '#f08a3a']),
          storm: dGradient(w, lake, ['#0a0408', '#200810', '#3a0c14', '#5a1418']),
          hills,
          rays: canvas(w, h),
          karps,
          bolts: [0, 1, 2].map((i) =>
            bolt(r, w * (0.2 + i * 0.3), 0, w * (0.25 + i * 0.28), lake - 4, 0.35, 5),
          ),
          shakes: p.short
            ? []
            : [
                [T_CRASH, 0.6, 4],
                [T_RISE, 0.8, 3],
                [REVEAL, 0.8, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.rain.update(dt)
        if (t > T_CRASH)
          for (let i = 0; i < 3; i++)
            if (r() < many)
              s.rain.add({
                x: r.range(0, w + 60),
                y: -6,
                vx: -70,
                vy: r.range(240, 300),
                life: 2,
                size: 1,
                shape: 'streak',
                trail: 0.03,
                colors: ['#8a4a5a', '#c8a0a8'],
              })
        // A splash where each Magikarp lands.
        for (const k of s.karps)
          if (within(t, k.t0 + k.dur, k.t0 + k.dur + dt))
            for (let i = 0; i < 5; i++)
              s.fx.add({
                x: k.x,
                y: k.y,
                vx: r.range(-20, 20),
                vy: -r.range(20, 50),
                ay: 200,
                life: 0.4,
                size: 1,
                shape: 'px',
                colors: ['#ffffff', '#ffd0c0'],
              })
        // The crash: the lake thrown up.
        if (within(t, T_CRASH, T_CRASH + dt))
          for (let i = 0; i < 120 * many; i++) {
            const a = -Math.PI / 2 + r.range(-0.9, 0.9)
            const v = r.range(80, 260)
            s.fx.add({
              x: cx + r.range(-20, 20),
              y: lake,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 300,
              life: r.range(0.8, 1.5),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: ['#ffffff', '#ffd0c0', '#c8a0a8'],
            })
          }
        // Water pouring off it as it rises.
        if (t > T_RISE && t < REVEAL + 1.2 && r() < 0.9 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: lerp(lake + sz.h, feet, ease.outC(span(t, T_RISE, REVEAL))) - r.range(0, sz.h * 0.8),
            vy: r.range(0, 30),
            ay: 300,
            life: 0.9,
            size: 1,
            shape: 'drop',
            colors: ['#ffffff', '#ffd0c0', '#c8a0a8'],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: cx,
              y: feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'sq' : 'drop',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#0a0408'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // Dusk, then the storm.
        g.drawImage(s.dusk, 0, 0)
        dissolve(g, s.storm, span(t, T_CRASH - 0.2, T_CRASH + 0.5))
        if (t < T_CRASH) {
          const sunR = Math.round(Math.min(w, h) * 0.08)
          ellipse(g, Math.round(w * 0.3), lake - Math.round(h * 0.1), sunR, sunR, '#ffd08a')
          ellipse(g, Math.round(w * 0.3), lake - Math.round(h * 0.1), sunR - 2, sunR - 2, '#fff0c8')
        }
        for (const [i, at] of [3.3, 3.95, 5.6, 6.8].entries())
          if (within(t, at, at + 0.12)) polyline(g, s.bolts[i % 3]!, '#fff0f0', 2)
        g.drawImage(s.hills, 0, 0)
        // The mast's lamp, blinking once the signal starts; its rings of signal over the lake.
        const blink = t > T_SIGNAL && t < T_CRASH ? Math.floor(t * 6) % 2 : Math.floor(t * 1.5) % 2
        rect(g, mast.x - 1, mast.top - 2, 3, 2, blink ? '#ff3a3a' : '#5a1010')
        if (t > T_SIGNAL && t < T_CRASH)
          for (let k = 0; k < 3; k++)
            burstRing(
              g,
              mast.x,
              mast.top,
              ((t - T_SIGNAL) * 1.1 + k / 3) % 1,
              Math.max(w, h) * 0.8,
              2,
              '#ff4a4a',
            )
        // The lake: calm, then rough; its red reflection of the sky; a red glow under the water before it rises.
        const rough = span(t, T_CRASH - 0.1, T_CRASH + 0.6)
        for (let y = lake; y < h; y++)
          rect(
            g,
            0,
            y,
            w,
            1,
            y % 3 ? (t < T_CRASH ? '#3a1220' : '#1a0810') : t < T_CRASH ? '#6a2030' : '#2a0c14',
          )
        for (let row = 0; row < 12; row++) {
          const y = lake + 2 + Math.round((row / 12) ** 1.4 * (h - lake - 2))
          const len = 4 + row
          for (let x = (row * 13 + Math.round(t * (6 + rough * 40))) % (len * 3); x < w; x += len * 3)
            rect(
              g,
              x,
              y + Math.round(Math.sin(x / 8 + t * 5 + row) * rough * 3),
              len,
              1,
              t < T_CRASH ? '#c0503a' : '#5a2030',
            )
        }
        rect(g, 0, lake, w, 1, t < T_CRASH ? '#f08a3a' : '#6a2030')
        if (t > T_CRASH + 0.2 && t < T_RISE + 0.3) {
          const a = (t - T_CRASH) * 4
          const gx = cx + Math.cos(a) * w * 0.25
          const gr = Math.round(14 + 10 * span(t, T_CRASH, T_RISE))
          g.drawImage(glow(gr, '#e0403a', 1.2, 0.7), Math.round(gx - gr), lake + 14 - gr)
        }
        // The Magikarp, leaping; one stopped in the air, glowing and changing.
        for (const k of s.karps) {
          const q = (t - k.t0) / k.dur
          if (q <= 0 || q >= 1) continue
          karp(
            g,
            k.x + (k.left ? -1 : 1) * q * 10,
            k.y - Math.sin(q * Math.PI) * k.h,
            k.left,
            k.y > lake + (h - lake) * 0.3 ? 2 : 1,
          )
        }
        if (t > T_LEAP && t < T_CRASH + 0.05) drawEvolution(g, p.mon, t, apex, lake, karp, sz)
        s.rain.draw(g)
        if (t > T_CRASH) wash(g, '#0a0204', 0.25, 8)
        // The serpent rising out of the lake, then itself.
        if (t > T_RISE && t < REVEAL) {
          const y = Math.round(lerp(lake + sz.h, feet, ease.outC(span(t, T_RISE, REVEAL - 0.1))))
          g.save()
          g.beginPath()
          g.rect(-10, -10, w + 20, lake + 12)
          g.clip()
          drawSprite(g, p.mon, cx, y, {
            sil: '#2a0606',
            outline: Math.floor(t * 12) % 3 ? '#ff4a3a' : '#ffb0a0',
          })
          g.restore()
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.7, 0.3, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: feet - 30 }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - REVEAL) * 2) * 2)
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[1]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, feet - 30, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        for (const at of [3.3, 3.95, 5.6, 6.8]) if (within(t, at, at + 0.1)) screenFlash(g, '#ffd0d0', 0.25)
        if (within(t, T_CRASH, T_CRASH + 0.2))
          screenFlash(g, '#ffffff', 0.6 * (1 - span(t, T_CRASH, T_CRASH + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffe0e0', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.45) wash(g, '#000000', 1 - span(t, 0, 0.45), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.2, { freq: 900, q: 3, vol: 0.02 }))],
          ...[0.2, 0.48, 0.76].map(
            (at) => [at + 0.6, quiet(() => tone(880, 0.05, { type: 'triangle', vol: 0.02 }))] as const,
          ),
          ...[0, 1, 2, 3, 4, 5].map(
            (i) =>
              [
                T_SIGNAL + i * 0.18,
                quiet(() => tone(1400, 0.08, { type: 'square', vol: 0.02, slide: -600 })),
              ] as const,
          ),
          [T_LEAP, quiet(() => tone(523, 0.3, { type: 'square', vol: 0.04, slide: 523 }))],
          ...Array.from(
            { length: 8 },
            (_, i) => [T_EVOLVE + i * 0.09, quiet(() => fxSound('evolve.swap', i))] as const,
          ),
          [T_CRASH, quiet(() => (hiss(1, { freq: 250, type: 'lowpass', vol: 0.16 }), fxSound('water.jet')))],
          [3.35, quiet(() => fxSound('thunder.strike'))],
          [T_RISE, quiet(() => fxSound('legend.heart'))],
          [4.05, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** The one that leaps: up to the top of its leap, stopped there, glowing white, swelling, flickering between a Magikarp
 * and the serpent, then falling into the lake as the serpent. */
function drawEvolution(
  g: G,
  mon: string,
  t: number,
  apex: { x: number; y: number },
  lake: number,
  karp: (g: G, x: number, y: number, left: boolean, k?: number) => void,
  sz: { w: number; h: number },
) {
  if (t < T_EVOLVE) {
    const q = ease.outQ(span(t, T_LEAP, T_EVOLVE))
    karp(g, apex.x, lerp(lake, apex.y, q), true, 2)
    return
  }
  const gr = Math.round(10 + 22 * span(t, T_EVOLVE, T_EVOLVE + 0.6))
  g.drawImage(glow(gr, '#ffffff', 1.3, 0.8), apex.x - gr, apex.y - gr)
  if (t < T_CRASH - 0.15) {
    // The evolution's flicker, faster and faster: Magikarp, serpent, Magikarp…
    const e = t - T_EVOLVE
    const serpent = Math.floor(e * (4 + e * 14)) % 2 === 1
    if (serpent)
      drawSprite(g, mon, apex.x, Math.round(apex.y + sz.h / 2), { sil: '#ffffff', sx: 0.8, sy: 0.8 })
    else
      g.drawImage(
        icon(KARP, { r: '#ffffff', w: '#ffffff', k: '#ffffff', y: '#ffffff' }, 3),
        apex.x - 15,
        apex.y - 12,
      )
    return
  }
  // Falling into the lake, a white serpent.
  const q = ease.inQ(span(t, T_CRASH - 0.15, T_CRASH))
  drawSprite(g, mon, apex.x, Math.round(lerp(apex.y + sz.h / 2, lake + sz.h * 0.6, q)), { sil: '#ffffff' })
}
