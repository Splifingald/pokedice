// Giratina's raid entrance (docs/53), its everyday raid (the Distortion World portal has its own): Turnback Cave. A
// misty chamber of stone pillars, a dark doorway at the back, water dripping into still puddles. Then the shadows move:
// the pillars' shadows stretch across the floor toward the middle like fingers, though no light has moved, and the
// drips start falling upward, pebbles lifting off the floor. The world turns over: the whole cave flips upside down,
// and through it the Distortion World seeps in (rocks floating the right way up, its grey-green sky, gold motes). A
// vast shadow with wings passes behind everything. The cave lurches back the right way; the shadows have pooled into a
// black hole in the floor, and Giratina rises out of it (Shadow Force), its red and gold burning on the black. The
// reveal scatters the shadow; a few of the other world's rocks still hang in the air.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  lerp,
  Particles,
  rect,
  rng,
  softEllipse,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, silhouette, spriteSize } from '../../sprites'
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

const T_CREEP = 1.0
const T_UP = 1.5
const FLIP = [2.1, 2.6] as const
const T_PASS = 2.85
const BACK = [3.75, 4.05] as const
const T_POOL = 3.6
const T_RISE = 4.1
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffe58a', '#ffbe2e', '#c4382a', '#5a0a14'] as const
const STONE = ['#6a6278', '#4a4458', '#322e3e', '#1c1a24', '#0e0c14'] as const

interface Pillar {
  x: number
  base: number
  hgt: number
  hw: number
}

interface Isle {
  cv: Canvas
  x: number
  y: number
  bob: number
}

type S = {
  r: Rng
  fx: Particles
  up: Particles
  cave: Canvas
  void: Canvas
  /** Where its world shows through this one: patches of it, soft-edged. */
  holes: Canvas
  mist: Canvas
  buf: Canvas
  rays: Canvas
  pillars: Pillar[]
  puddles: { x: number; y: number; rx: number }[]
  isles: Isle[]
  /** Its shadow, huge, for the pass behind the world. */
  big: Canvas | null
  shakes: [number, number, number][]
}

export const giratinaCinema: Cinema = {
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
    const fl = Math.round(h * 0.55)
    const feet = Math.round(h * 0.63)
    const my = Math.round(feet - sz.h * 0.5)
    const pool = { y: feet + 3, rx: Math.round(Math.max(sz.w * 0.6, m * 0.2)) }
    /** The world's vertical scale: 1 upright, −1 upside down, through a squash. */
    const flipAt = (t: number) => {
      if (t < FLIP[0]) return 1
      if (t < FLIP[1]) return Math.cos(Math.PI * ease.ioS(span(t, FLIP[0], FLIP[1])))
      if (t < BACK[0]) return -1
      if (t < BACK[1]) return -Math.cos(Math.PI * ease.inQ(span(t, BACK[0], BACK[1])))
      // A lurch past upright, settling.
      const e = t - BACK[1]
      return 1 - Math.sin(e * 20) * 0.08 * (1 - span(e, 0, 0.4))
    }
    const seep = (t: number) =>
      span(t, FLIP[0] + 0.2, FLIP[1] + 0.3) * (1 - 0.6 * span(t, BACK[0], REVEAL + 0.5))
    return {
      id: 'cinema-giratina',
      dur: DUR,
      setup() {
        const r = rng(487)
        const cave = canvas(w, h)
        const g = cave.g
        // The back wall: rough blocks fading up into the dark, a doorway to the next chamber.
        g.drawImage(dGradient(w, fl, ['#08070c', '#110f18', '#1c1926', '#2a2636']), 0, 0)
        for (let i = 0; i < Math.round((w * fl) / 60); i++) {
          const x = r.range(-4, w)
          const y = r.range(h * 0.12, fl)
          const bw = Math.round(r.range(5, 14))
          const bh = Math.round(r.range(3, 7))
          rect(g, x, y, bw, bh, y > fl * 0.7 ? STONE[2] : STONE[3])
          rect(g, x, y, bw, 1, y > fl * 0.7 ? STONE[1] : STONE[2])
        }
        const dw = Math.round(Math.max(10, m * 0.09))
        const dh = Math.round(h * 0.16)
        rect(g, cx - dw, fl - dh, dw * 2, dh, '#04030a')
        ellipse(g, cx, fl - dh, dw, Math.round(dw * 0.6), '#04030a')
        rect(g, cx - dw - 2, fl - dh, 2, dh, STONE[1])
        rect(g, cx + dw, fl - dh, 2, dh, STONE[1])
        // A cold light from the next chamber, spilling out over the floor.
        softEllipse(
          g,
          cx,
          fl + Math.round((h - fl) * 0.15),
          Math.round(dw * 2.4),
          Math.round((h - fl) * 0.18),
          '#4a4466',
          0.7,
          1.2,
        )
        softEllipse(
          g,
          cx,
          fl - Math.round(dh * 0.4),
          Math.round(dw * 0.7),
          Math.round(dh * 0.4),
          '#2a2440',
          0.8,
          1,
        )
        // The ceiling: black, ragged, stalactites.
        for (let x = 0; x < w; x++) {
          const y = Math.round(h * 0.1 + Math.sin(x * 0.17) * 3 + Math.sin(x * 0.05 + 2) * 4)
          rect(g, x, 0, 1, y, '#050408')
          rect(g, x, y, 1, 1, STONE[3])
        }
        for (let i = 0; i < Math.round(w / 16); i++) {
          const x = r.range(0, w)
          const len = r.range(h * 0.03, h * 0.08)
          tri(g, x - 3, h * 0.1, x + 3, h * 0.1, x, h * 0.1 + len, '#0a0910')
        }
        // The floor: flagstones in perspective, mist on them.
        g.drawImage(dGradient(w, h - fl, ['#1e1a28', '#262232', '#2e2a3c', '#363044']), 0, fl)
        for (let y = fl + 2, k = 0; y < h; k++) {
          rect(g, 0, y, w, 1, STONE[3])
          const step = Math.round(2 + k * 1.6)
          const n = 4 + k * 2
          for (let i = -n; i <= n; i++) {
            const x = Math.round(cx + ((i + (k % 2) * 0.5) * w) / n)
            rect(g, x, y, 1, step, STONE[3])
          }
          y += step
        }
        rect(g, 0, fl, w, 1, STONE[1])
        // Two rows of pillars receding to the door, bigger toward us.
        const pillars: Pillar[] = []
        for (let k = 0; k < 3; k++) {
          const d = k / 2
          const base = Math.round(lerp(fl + 4, h * 0.92, d))
          const off = lerp(w * 0.14, w * 0.42, d) + m * 0.04
          const hw = Math.round(lerp(3, Math.max(6, m * 0.05), d))
          for (const side of [-1, 1]) pillars.push({ x: Math.round(cx + side * off), base, hgt: base, hw })
        }
        const puddles = Array.from({ length: Math.max(3, Math.round(w / 60)) }, () => {
          const y = r.range(fl + 6, h - 6)
          return { x: r.range(w * 0.1, w * 0.9), y, rx: Math.round(3 + (y - fl) * 0.12) }
        })
        // The Distortion World behind: grey-green, streaked, gold motes; and its floating rocks.
        const vd = dGradient(w, h, ['#0c0e0c', '#1a2018', '#2a3226', '#141a12'])
        for (let i = 0; i < 26; i++) {
          const y = r.range(0, h)
          rect(vd.g, r.range(-20, w), y, r.range(10, 40), 1, r() < 0.5 ? '#3a4a34' : '#4a3a5a')
        }
        for (let i = 0; i < 40; i++) rect(vd.g, r.range(0, w), r.range(0, h), 1, 1, '#c8a040')
        const isles: Isle[] = Array.from({ length: Math.max(4, Math.round(w / 50)) }, (_, i) => {
          const s = Math.round(r.range(6, 13) * Math.max(1, m / 160))
          const cv = canvas(s * 2 + 4, s * 3 + 4)
          const ig = cv.g
          tri(ig, 2, s + 2, s * 2 + 2, s + 2, s + 2 + r.range(-2, 2), s * 3 + 2, '#2a2420')
          tri(ig, s + 2, s + 2, s * 2 + 2, s + 2, s + 2, s * 3 + 2, '#1a1612')
          rect(ig, 2, s, s * 2 + 1, 3, '#3a4a2a')
          rect(ig, 2, s, s * 2 + 1, 1, '#6a7a4a')
          if (i % 2) {
            // A tree growing sideways out of it, as things do there.
            rect(ig, s + 2, s - Math.round(s * 0.8), 1, Math.round(s * 0.8), '#2a2018')
            ellipse(
              ig,
              s + 2 + Math.round(s * 0.4),
              s - Math.round(s * 0.8),
              Math.round(s * 0.5),
              Math.round(s * 0.35),
              '#4a5a34',
            )
          }
          // Clear of the middle, where it will rise.
          const side = i % 2 ? 1 : -1
          return {
            cv,
            x: cx + side * r.range(sz.w * 0.6, w * 0.48),
            y: r.range(h * 0.12, h * 0.8),
            bob: r() * 6,
          }
        })
        // Mist banks along the floor, twice the screen wide (it drifts round).
        const mist = canvas(w * 2, h - fl + 6)
        for (let i = 0; i < Math.round(w / 8); i++) {
          const x = r.range(0, w)
          const y = r.range(4, h - fl)
          const rx = Math.round(r.range(10, 26))
          for (const o of [0, w])
            softEllipse(mist.g, x + o, y, rx, Math.max(2, Math.round(rx * 0.18)), '#5a5470', 0.45, 1.3)
        }
        const holes = canvas(w, h)
        const mask = canvas(w, h)
        for (let i = 0; i < Math.max(4, Math.round(w / 45)); i++) {
          const side = i % 2 ? 1 : -1
          softEllipse(
            mask.g,
            cx + side * r.range(w * 0.2, w * 0.5),
            r.range(h * 0.1, h * 0.9),
            Math.round(r.range(14, 30)),
            Math.round(r.range(10, 24)),
            '#000000',
            1.4,
            0.8,
          )
        }
        holes.g.drawImage(vd, 0, 0)
        holes.g.globalCompositeOperation = 'destination-in'
        holes.g.drawImage(mask, 0, 0)
        holes.g.globalCompositeOperation = 'source-over'
        return {
          r,
          fx: new Particles(),
          up: new Particles(),
          cave,
          void: vd,
          holes,
          mist,
          buf: canvas(w, h),
          rays: canvas(w, h),
          pillars,
          puddles,
          isles,
          big: null,
          shakes: p.short
            ? []
            : [
                [FLIP[0], 0.5, 2],
                [BACK[1], 0.6, 5],
                [REVEAL, 0.7, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.up.update(dt)
        // Drips from the ceiling into the puddles; then they rise out of them instead, and the pebbles lift.
        if (t < T_UP && r() < 0.06 * many * 4) {
          const pd = s.puddles[Math.floor(r() * s.puddles.length)]!
          s.up.add({
            x: pd.x,
            y: h * 0.12,
            vy: 40,
            ay: 360,
            life: Math.sqrt((2 * (pd.y - h * 0.12)) / 360),
            size: 1,
            shape: 'drop',
            colors: ['#8a8ab0'],
          })
        }
        if (t > T_UP && t < BACK[1] && r() < 0.5 * many) {
          const pd = s.puddles[Math.floor(r() * s.puddles.length)]!
          s.up.add({
            x: pd.x + r.range(-pd.rx, pd.rx),
            y: pd.y,
            vy: -10,
            ay: -160,
            life: 1.4,
            size: 1,
            shape: r() < 0.6 ? 'drop' : 'sq',
            colors: r() < 0.6 ? ['#a8a8d0'] : ['#5a5468'],
          })
        }
        if (t > T_UP && t < BACK[1] && r() < 0.25 * many)
          s.up.add({
            x: r.range(0, w),
            y: r.range(fl + 4, h),
            vy: -r.range(4, 12),
            ay: -30,
            life: 2.5,
            size: 2,
            shape: 'sq',
            colors: [STONE[1], STONE[2]],
          })
        // Shadow wisps off the pool, and off it as it rises.
        if (t > T_POOL && t < REVEAL + 1.5 && r() < 0.8 * many)
          s.fx.add({
            x: cx + r.range(-pool.rx, pool.rx),
            y: pool.y + r.range(-2, 2),
            vx: r.range(-8, 8),
            vy: -r.range(15, 45),
            life: r.range(0.6, 1.1),
            size: r.int(2, 3),
            size1: 0,
            shape: 'sq',
            colors: ['#000000', '#14081a', '#2a1030'],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 80 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              drag: 2.2,
              life: r.range(0.6, 1.1),
              size: r.int(1, 3),
              shape: k % 3 ? 'sq' : 'star',
              colors: k % 3 ? ['#000000', '#2a1030', '#5a0a14'] : [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        // The cave, into its buffer: it is the world that turns over.
        const b = s.buf.g
        b.drawImage(s.cave, 0, 0)
        for (const pd of s.puddles) {
          ellipse(b, pd.x, pd.y, pd.rx, Math.max(1, Math.round(pd.rx * 0.3)), '#14121e')
          rect(b, pd.x - pd.rx + 2, pd.y - 1, Math.max(1, pd.rx * 2 - 4), 1, '#4a4a6a')
        }
        // The pillars' shadows stretching toward the middle like fingers, though no light has moved.
        const creep =
          ease.inQ(span(t, T_CREEP, T_POOL)) * (t < REVEAL ? 1 : 1 - span(t, REVEAL, REVEAL + 0.6))
        for (const pl of s.pillars) {
          const L = Math.abs(cx - pl.x) * (0.15 + 0.85 * creep)
          const dir = Math.sign(cx - pl.x)
          const n = Math.max(2, Math.round(L / 2))
          for (let i = 0; i < n; i++) {
            const u = i / n
            const x = pl.x + dir * u * L
            const y = pl.base + 1 + Math.sin(u * 6 + t * 4 + pl.x) * 2 * u - u * (pl.base - pool.y) * creep
            const th = Math.max(1, Math.round(pl.hw * 1.6 * (1 - u * 0.8)))
            rect(b, x, y - (th >> 1), 2, th, '#06050a')
          }
        }
        for (const pl of s.pillars) pillar(b, pl, fl)
        // The pool of shadow, gathered where the fingers meet.
        const pq = ease.outC(span(t, T_POOL, T_RISE)) * (1 - span(t, REVEAL + 0.4, REVEAL + 1.4))
        if (pq > 0) {
          const rx = Math.round(pool.rx * pq)
          const ry = Math.max(1, Math.round(rx * 0.24))
          for (let dy = -ry; dy <= ry; dy++) {
            const half = Math.round(
              rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5)) + Math.sin(dy * 2 + t * 9) * 2,
            )
            rect(b, cx - half, pool.y + dy, half * 2, 1, '#000000')
          }
          ellipseLine(b, cx, pool.y, rx + 1, ry + 1, Math.floor(t * 10) % 2 ? AURA[2] : AURA[3])
        }
        s.up.draw(b)
        // It, rising out of the shadow: nothing below the pool's surface.
        if (t > T_RISE && t < REVEAL) {
          const q = ease.outC(span(t, T_RISE, REVEAL - 0.05))
          const y = Math.round(lerp(pool.y + sz.h, feet, q))
          b.save()
          b.beginPath()
          b.rect(0, 0, w, pool.y)
          b.clip()
          drawSprite(b, p.mon, cx, y, {
            sil: '#0a0610',
            outline: Math.floor(t * 12) % 3 ? AURA[2] : AURA[1],
          })
          b.restore()
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.55, 0.22, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: my }, t, AURA[2], k)
          b.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - REVEAL) * 1.8) * 2)
          drawSprite(b, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        s.fx.draw(b)
        // Mist on the floor, drifting.
        const mo = Math.round((t * 10) % w)
        b.drawImage(s.mist, -mo, fl - 6)
        // Onto the screen: the Distortion World behind, the world turning over in front of it.
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.void, 0, 0)
        const sy = flipAt(t)
        const hh = Math.round(h * Math.abs(sy))
        if (hh > 0) {
          g.save()
          g.translate(0, Math.round(h / 2))
          g.scale(1, sy < 0 ? -1 : 1)
          g.drawImage(s.buf, 0, 0, w, h, 0, -Math.round(hh / 2), w, hh)
          g.restore()
        }
        // Its world seeping in: the far world's tint, its rocks floating the right way up, gold motes.
        const sk = seep(t)
        if (sk > 0) {
          dissolve(g, s.holes, sk)
          for (const isle of s.isles) {
            const y = Math.round(isle.y + Math.sin(t * 1.3 + isle.bob) * 3 - (1 - sk) * h * 0.1)
            dissolve(g, isle.cv, Math.min(1, sk * 1.5), Math.round(isle.x - isle.cv.width / 2), y)
          }
        }
        // The vast shadow passing behind the world.
        const pass = span(t, T_PASS, T_PASS + 0.9)
        if (pass > 0 && pass < 1) {
          s.big ??= bigShadow(p.mon, 2.6)
          if (s.big) {
            const x = Math.round(lerp(w + s.big.width * 0.5, -s.big.width * 0.5, pass))
            const y = Math.round(h * 0.45 + Math.sin(pass * Math.PI) * h * 0.05)
            dissolve(g, s.big, 0.7, x - (s.big.width >> 1), y - (s.big.height >> 1))
          }
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[2]],
          [0.22, '#2a1030'],
        ] as const)
          burstRing(g, cx, my, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        g.restore()
        // The squeeze of the world turning: dark at the seams.
        if (Math.abs(sy) < 0.98 && t < BACK[1]) {
          const band = Math.round((h - hh) / 2)
          rect(g, 0, band - 1, w, 1, AURA[3])
          rect(g, 0, h - band, w, 1, AURA[3])
        }
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffe58a', 0.8 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2, { freq: 300, type: 'lowpass', vol: 0.05 }))],
          ...[0.45, 0.9, 1.25].map(
            (at, i) =>
              [
                at,
                quiet(() => tone(1760 + i * 120, 0.12, { type: 'sine', vol: 0.03, slide: -600 })),
              ] as const,
          ),
          [
            T_CREEP,
            quiet(
              () => (
                hiss(1.6, { freq: 2400, q: 3, vol: 0.02 }),
                tone(62, 2.6, { type: 'sawtooth', vol: 0.02 })
              ),
            ),
          ],
          // Drips rising: the same notes, going up.
          ...[1.6, 1.8, 1.95].map(
            (at, i) =>
              [at, quiet(() => tone(880 + i * 220, 0.12, { type: 'sine', vol: 0.03, slide: 600 }))] as const,
          ),
          [
            FLIP[0],
            quiet(
              () => (
                hiss(0.5, { freq: 300, slide: 1800, vol: 0.07 }),
                tone(98, 0.6, { type: 'sine', vol: 0.06, slide: -40 })
              ),
            ),
          ],
          [
            T_PASS,
            quiet(
              () => (
                tone(49, 1, { type: 'sawtooth', vol: 0.04 }),
                hiss(1, { freq: 180, type: 'lowpass', vol: 0.08 })
              ),
            ),
          ],
          [T_POOL, quiet(() => fxSound('legend.heart'))],
          [BACK[0], quiet(() => hiss(0.3, { freq: 2000, slide: -1700, vol: 0.07 }))],
          [
            BACK[1],
            quiet(() => (fxSound('legend.pulse'), hiss(0.5, { freq: 160, type: 'lowpass', vol: 0.12 }))),
          ],
          [T_RISE + 0.1, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** A cave pillar: a rough column, lit on its left, a darker band at its foot. */
function pillar(g: G, pl: Pillar, fl: number) {
  const top = Math.max(0, Math.round(fl - (pl.base - fl) * 0.2 - pl.hgt * 0.62))
  const { x, base, hw } = pl
  // Stacked drums of rough stone, each a little off the one under it.
  const drum = Math.max(4, hw * 2)
  for (let y = base, k = 0; y > top; y -= drum, k++) {
    const y0 = Math.max(top, y - drum)
    const off = ((k * 7 + x) % 3) - 1
    rect(g, x - hw + off, y0, hw * 2, y - y0, STONE[2])
    rect(g, x - hw + off, y0, Math.max(1, Math.round(hw * 0.55)), y - y0, STONE[1])
    rect(g, x - hw + off, y0, 1, y - y0, STONE[0])
    rect(g, x + hw - 1 + off, y0, 1, y - y0, STONE[4])
    rect(g, x - hw + off, y0, hw * 2, 1, STONE[3])
  }
  rect(g, x - hw - 2, base - 3, hw * 2 + 4, 3, STONE[2])
  rect(g, x - hw - 2, base - 3, hw * 2 + 4, 1, STONE[1])
  if (bayer(x, base) < 0.5) rect(g, x - hw + 1, base - 7, 1, 1, STONE[4])
}

/** Its shadow, enormous: its silhouette scaled up, in near-black, for the pass behind the world. */
function bigShadow(mon: string, k: number): Canvas | null {
  const sil = silhouette(mon, '#050208')
  if (!sil) return null
  const cv = canvas(Math.round(sil.width * k), Math.round(sil.height * k))
  cv.g.imageSmoothingEnabled = false
  cv.g.drawImage(sil, 0, 0, cv.width, cv.height)
  softEllipse(cv.g, cv.width * 0.3, cv.height * 0.4, 2, 1, '#c4382a', 1)
  return cv
}
