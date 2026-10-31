// Cresselia's raid entrance (docs/53): Fullmoon Island at night. A clearing ringed by dark trees, a still pond with the
// full moon in it, flowers in the grass, fireflies. Then the moon wanes before your eyes: a shadow slides across it,
// full to half to a thin crescent, its light in the pond waning with it; lunar feathers drift down and the clearing
// turns to a dream, the trees swaying, light rising off the flowers. And the crescent comes down: it leaves the sky and
// swoops round the clearing trailing dream light, comes to rest over the pond, turning, and opens into Cresselia, two
// veils of light circling it. The reveal sets the moon back in the sky, full, and rings out crescents of light.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
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
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, burstRing, dGradient, inOrder, wobble, type Cinema, type CinemaParams } from './kit'

const T_WANE = 1.0
const T_DREAM = 1.7
const T_LEAVE = 2.55
const T_REST = 3.75
const T_OPEN = 4.1
const REVEAL = 4.7
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffd0f0', '#e08ac8', '#5a2a6a'] as const
const MOON = ['#ffffff', '#fff6d8', '#ffe8a8', '#e8c878'] as const
/** Dream light: rose, lilac, moon-gold. */
const DREAM = ['#ffd0f0', '#e0b0ff', '#fff3a0', '#ff9ad8'] as const

type S = {
  r: Rng
  fx: Particles
  feathers: Particles
  sky: Canvas
  trees: Canvas
  ground: Canvas
  rays: Canvas
  flies: { x: number; y: number; ph: number }[]
  flowers: { x: number; y: number; c: string }[]
  shakes: [number, number, number][]
}

/**
 * The moon as a lit disc with a shadow disc laid over it at an offset (sx, sy): full when the shadow is far, a
 * crescent when it is near, turned by the offset's direction. Row by row, so its edge stays pixel-sharp.
 */
function moonShape(
  g: G,
  x: number,
  y: number,
  R: number,
  sx: number,
  sy: number,
  lit: string,
  dark: string | null,
) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)))
    if (half <= 0) continue
    const a = cx - half
    const b = cx + half + 1
    // The shadow disc's chord on this row.
    const ry = dy - sy
    const sh = R * R - ry * ry
    if (sh <= 0) {
      rect(g, a, cy + dy, b - a, 1, lit)
      continue
    }
    const sw = Math.sqrt(sh)
    const s0 = Math.round(cx + sx - sw)
    const s1 = Math.round(cx + sx + sw + 1)
    if (s0 > a) rect(g, a, cy + dy, Math.min(b, s0) - a, 1, lit)
    if (s1 < b) rect(g, Math.max(a, s1), cy + dy, b - Math.max(a, s1), 1, lit)
    if (dark && s1 > a && s0 < b)
      rect(g, Math.max(a, s0), cy + dy, Math.min(b, s1) - Math.max(a, s0), 1, dark)
  }
}

export const cresseliaCinema: Cinema = {
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
    const hz = Math.round(h * 0.52)
    const feet = Math.round(h * 0.6)
    const my = Math.round(feet - sz.h * 0.5)
    const R = Math.round(Math.min(w * 0.28, h * 0.12))
    const moon = { x: cx + Math.round(w * 0.06), y: Math.round(h * 0.17) }
    const pond = {
      x: cx,
      y: Math.round(lerp(feet, h, 0.42)),
      rx: Math.round(Math.min(w * 0.42, m * 0.55)),
      ry: Math.round((h - feet) * 0.22),
    }
    /** How far the shadow sits from the moon's middle: off it (full), to a crescent's width. */
    const shadowAt = (t: number) => lerp(R * 2.2, R * 0.55, ease.ioS(span(t, T_WANE, T_LEAVE - 0.15)))
    /** The crescent's flight: off the sky, a swoop round the clearing, to rest over the pond; and its size. */
    const flight = (t: number) => {
      const q = span(t, T_LEAVE, T_REST)
      const e = ease.ioS(q)
      // A loop: down to one side, across low, back up to the middle.
      const a = -Math.PI / 2 + e * Math.PI * 2.2
      const loopR = lerp(0, Math.min(w * 0.32, h * 0.2), Math.sin(Math.PI * Math.min(1, q * 1.1)))
      return {
        x: lerp(moon.x, cx, e) + Math.cos(a) * loopR,
        y: lerp(moon.y, my, ease.ioQ(q)) + Math.sin(a) * loopR * 0.5 + loopR * 0.5,
        k: lerp(1, 1.3, e),
        turn: e * Math.PI * 3,
      }
    }
    return {
      id: 'cinema-cresselia',
      dur: DUR,
      setup() {
        const r = rng(488)
        const sky = dGradient(w, hz + 4, ['#05061a', '#0c0e2e', '#181a46', '#2c2a5e'])
        for (let i = 0; i < Math.round((w * hz) / 90); i++)
          rect(sky.g, r.range(0, w), r.range(0, hz - 8), 1, 1, r() < 0.25 ? '#ffffff' : '#8a8ac8')
        // The clearing's trees: rounded crowns in layers, the near ones darker and bigger, the moonlit edge on top.
        const trees = canvas(w, h)
        const tg = trees.g
        for (let layer = 0; layer < 3; layer++) {
          const col = ['#1a1c3a', '#121430', '#0a0b20'][layer]!
          const lit = ['#3a3a6a', '#2a2a58', '#1e1e46'][layer]!
          const gap = w * (0.24 - layer * 0.05) + m * 0.06
          for (const side of [-1, 1])
            for (let d = gap; d < w * 0.62; d += r.range(8, 14) + layer * 4) {
              const x = cx + side * d
              const top =
                hz - Math.round(r.range(h * 0.1, h * 0.2) * (1 + layer * 0.3) * Math.min(1.5, d / (w * 0.3)))
              const rr = Math.round(r.range(7, 12) + layer * 4)
              rect(tg, x - 1, top + rr, 3, hz + layer * 8 - top - rr + 2, col)
              ellipse(tg, x, top + rr, rr, rr, col)
              ellipse(
                tg,
                x + Math.round(rr * 0.5),
                top + rr * 1.6,
                Math.round(rr * 0.8),
                Math.round(rr * 0.8),
                col,
              )
              ellipse(
                tg,
                x - Math.round(rr * 0.4),
                top + Math.round(rr * 0.4),
                Math.round(rr * 0.6),
                Math.round(rr * 0.4),
                lit,
              )
              ellipse(tg, x, top + rr, rr - 1, rr - 2, col)
            }
        }
        // The grass and the pond.
        const ground = dGradient(w, h - hz, ['#121a2a', '#16223a', '#1a2a3e', '#1e3040'])
        const gg = ground.g
        for (let i = 0; i < Math.round(w / 2); i++) {
          const y = r.range(0, h - hz)
          rect(gg, r.range(0, w), y, 1, Math.round(1 + y * 0.03), '#24364a')
        }
        ellipse(gg, pond.x, pond.y - hz + 1, pond.rx + 2, pond.ry + 2, '#2e4458')
        ellipse(gg, pond.x, pond.y - hz, pond.rx, pond.ry, '#080c22')
        const flowers: S['flowers'] = []
        for (let i = 0; i < Math.round(w / 4); i++) {
          const x = r.range(0, w)
          const y = r.range(hz + 2, h - 2)
          if (((x - pond.x) / (pond.rx + 4)) ** 2 + ((y - pond.y) / (pond.ry + 4)) ** 2 < 1) continue
          flowers.push({ x, y, c: r.pick(['#ffd0f0', '#e0b0ff', '#fff3a0', '#c8e0ff']) })
        }
        return {
          r,
          fx: new Particles(),
          feathers: new Particles(),
          sky,
          trees,
          ground,
          rays: canvas(w, h),
          flies: Array.from({ length: Math.round(14 * many) + 4 }, () => ({
            x: r.range(0, w),
            y: r.range(hz - h * 0.1, h),
            ph: r() * 6,
          })),
          flowers,
          shakes: p.short ? [] : [[REVEAL, 0.5, 2]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.feathers.update(dt)
        // Lunar feathers drifting down once the moon starts to wane.
        if (t > T_WANE + 0.3 && r() < 0.12 * many)
          s.feathers.add({
            x: r.range(0, w),
            y: -4,
            vx: r.range(-10, 10),
            vy: r.range(12, 22),
            spin: r.range(-2, 2),
            life: 10,
            size: 2,
            shape: 'leaf',
            ...((c) => ({ colors: [c], light: '#ffffff', dark: '#8a5aa0' }))(r.pick(DREAM)),
          })
        // Dream light rising off the flowers.
        const dream = span(t, T_DREAM, T_DREAM + 0.8)
        if (dream > 0 && r() < 0.7 * dream * many) {
          const f = s.flowers[Math.floor(r() * s.flowers.length)]
          if (f)
            s.fx.add({
              x: f.x,
              y: f.y,
              vx: r.range(-4, 4),
              vy: -r.range(8, 22),
              life: r.range(1, 1.8),
              size: 1,
              shape: 'star',
              colors: [f.c, '#ffffff'],
            })
        }
        // The crescent's trail as it swoops down.
        if (t > T_LEAVE && t < T_OPEN) {
          const at = flight(t)
          for (let i = 0; i < 3 * many; i++)
            s.fx.add({
              x: at.x + r.range(-R * 0.6, R * 0.6),
              y: at.y + r.range(-R * 0.6, R * 0.6),
              vx: r.range(-6, 6),
              vy: r.range(-6, 10),
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [r.pick(DREAM), '#ffffff'],
            })
        }
        // Lunar Dance: motes spiralling in as it opens.
        if (t > T_REST && t < REVEAL && r() < 0.9 * many) {
          const a = r() * Math.PI * 2
          const d = m * r.range(0.3, 0.45)
          s.fx.add({
            x: cx + Math.cos(a) * d,
            y: my + Math.sin(a) * d * 0.6,
            vx: -Math.sin(a) * 60,
            vy: Math.cos(a) * 36,
            home: { x: cx, y: my, k: 220 },
            life: 1,
            size: 1,
            shape: 'star',
            colors: [...DREAM],
          })
        }
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.7,
              drag: 2.4,
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...AURA, ...DREAM],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#05061a'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.sky, 0, 0)
        // The moon in the sky: full, waning, gone once it leaves; back, full, on the reveal.
        const sd = shadowAt(t)
        const inSky = t < T_LEAVE || t >= REVEAL
        const back = t >= REVEAL ? ease.outC(span(t, REVEAL, REVEAL + 0.6)) : 1
        if (inSky) {
          const full = t >= REVEAL ? 1 : span(sd, R * 0.55, R * 2.2)
          const gr = Math.round(R * (1.6 + 1.2 * full * back)) & ~1
          g.drawImage(glow(gr, MOON[3], 1.5, 0.45 * (0.35 + 0.65 * full)), moon.x - gr, moon.y - gr)
          moonShape(
            g,
            moon.x,
            moon.y,
            Math.round(R * back),
            t >= REVEAL ? R * 3 : sd,
            t >= REVEAL ? 0 : -sd * 0.15,
            MOON[1],
            '#1c1c40',
          )
          if (t < T_WANE || t >= REVEAL) {
            ellipse(
              g,
              moon.x - Math.round(R * 0.3),
              moon.y - Math.round(R * 0.2),
              Math.round(R * 0.22),
              Math.round(R * 0.18),
              MOON[2],
            )
            ellipse(
              g,
              moon.x + Math.round(R * 0.25),
              moon.y + Math.round(R * 0.3),
              Math.round(R * 0.15),
              Math.round(R * 0.12),
              MOON[2],
            )
          }
        } else if (t < T_LEAVE + 0.4) {
          // The hole it left: a faint ring where the moon was.
          ellipseLine(g, moon.x, moon.y, R, R, '#2a2a5a')
        }
        // The clearing, swaying as it turns to a dream.
        g.drawImage(s.ground, 0, hz)
        for (const f of s.flowers) {
          const lit = span(t, T_DREAM, T_DREAM + 0.8) * (0.5 + 0.5 * Math.sin(t * 4 + f.x))
          rect(g, f.x, f.y, 1, 1, lit > 0.5 ? '#ffffff' : f.c)
        }
        const sway = span(t, T_DREAM, T_DREAM + 0.8) * (t < REVEAL ? 1 : 1 - span(t, REVEAL, REVEAL + 1))
        if (sway > 0) wobble(g, s.trees, w, 0, h, t, 2 * sway, 11, 2.5)
        else g.drawImage(s.trees, 0, 0)
        // The pond: the moon in it, waning with it, wavering.
        const py = pond.y - Math.round(pond.ry * 0.35)
        if (inSky) {
          const rr = Math.max(2, Math.round(R * 0.45 * back))
          const rx = Math.round(moon.x + (pond.x - moon.x) * 0.5)
          for (let dy = -Math.round(rr * 0.5); dy <= Math.round(rr * 0.5); dy++) {
            const half = Math.round(rr * Math.sqrt(1 - (dy * dy) / (rr * rr * 0.25 + 0.5)))
            const wob = Math.round(Math.sin(dy * 1.4 + t * 3) * 1.5)
            const frac = t >= REVEAL ? 1 : span(sd, R * 0.55, R * 2.2)
            const lw = Math.max(1, Math.round(half * 2 * (0.25 + 0.75 * frac)))
            rect(g, rx - half + wob, py + dy, lw, 1, dy % 2 ? MOON[2] : MOON[1])
          }
        }
        // The fireflies.
        for (const f of s.flies) {
          const x = Math.round(f.x + Math.sin(t * 0.7 + f.ph) * 10)
          const y = Math.round(f.y + Math.sin(t * 1.1 + f.ph * 2) * 6)
          if (Math.sin(t * 3 + f.ph * 5) > 0.2)
            rect(g, x, y, 1, 1, t > T_DREAM ? DREAM[Math.floor(f.ph) % 4]! : '#d8f07a')
        }
        s.feathers.draw(g)
        // The crescent, come down: swooping, then turning over the pond, then opening into it.
        if (t >= T_LEAVE && t < REVEAL) {
          const at = t < T_REST ? flight(t) : { x: cx, y: my, k: 1.3, turn: Math.PI * 3 + (t - T_REST) * 9 }
          const open = ease.inQ(span(t, T_OPEN, REVEAL))
          const RR = Math.max(2, Math.round(R * at.k * (1 - open * 0.7)))
          const gr = Math.round(RR * 2.2) & ~1
          g.drawImage(glow(gr, DREAM[0], 1.4, 0.6), Math.round(at.x) - gr, Math.round(at.y) - gr)
          const d = RR * 0.55 + open * RR
          moonShape(g, at.x, at.y, RR, Math.cos(at.turn) * d, Math.sin(at.turn) * d, MOON[1], null)
          // Its reflection in the pond.
          if (at.y > hz - R * 2)
            rect(g, Math.round(at.x) - 3, py + Math.round((pond.y - at.y) * 0.15), 7, 1, MOON[2])
        }
        // Its two veils of light circling it as it opens.
        const vq = span(t, T_OPEN - 0.2, T_OPEN + 0.3) * (1 - span(t, REVEAL + 1.2, REVEAL + 2))
        if (vq > 0) veils(g, cx, my, Math.round(Math.max(sz.w * 0.62, m * 0.22) * ease.outC(vq)), t, false)
        if (t >= T_OPEN && t < REVEAL)
          drawSprite(g, p.mon, cx, feet, {
            sil: Math.floor(t * 12) % 2 ? '#ffd0f0' : '#e8b8f0',
            outline: Math.floor(t * 8) % 2 ? MOON[2] : '#ffffff',
            sx: lerp(0.4, 1, ease.outC(span(t, T_OPEN, REVEAL))),
            sy: lerp(0.4, 1, ease.outC(span(t, T_OPEN, REVEAL))),
          })
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.55, 0.22, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: my }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const bob = Math.round(Math.sin((t - REVEAL) * 2) * 2)
          // Its reflection in the pond, upside down and dimmed.
          g.save()
          g.beginPath()
          g.rect(
            pond.x - Math.round(pond.rx * 0.72),
            pond.y - pond.ry + 2,
            Math.round(pond.rx * 1.44),
            Math.round(pond.ry * 1.7),
          )
          g.clip()
          g.translate(0, 2 * (pond.y - pond.ry + 2))
          g.scale(1, -1)
          drawSprite(g, p.mon, cx, pond.y - pond.ry, { sil: '#241c48', outline: '#3a2a62' })
          g.restore()
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        if (vq > 0) veils(g, cx, my, Math.round(Math.max(sz.w * 0.62, m * 0.22) * ease.outC(vq)), t, true)
        // Crescents of light ringing out on the reveal, each turned its own way, then a ring.
        for (const [d, c, a] of [
          [0, AURA[0], -0.6],
          [0.12, DREAM[0], 2.4],
        ] as const) {
          const q = span(t, REVEAL + d, REVEAL + d + 0.6)
          if (q <= 0 || q >= 1) continue
          const Rc = Math.round(lerp(8, Math.max(w, h) * 0.7, ease.outC(q)))
          const off = Math.min(Rc * 0.2, 7 * (1 - q) + 2)
          if (Math.floor(q * 14) % 4 !== 3)
            moonShape(g, cx, my, Rc, Math.cos(a) * off, Math.sin(a) * off, c, null)
        }
        burstRing(g, cx, my, span(t, REVEAL + 0.22, REVEAL + 0.82), Math.max(w, h) * 0.75, 3, AURA[2])
        s.fx.draw(g)
        g.restore()
        // The dream's haze.
        if (t > T_DREAM && t < REVEAL) wash(g, '#3a1a4a', 0.15 * span(t, T_DREAM, T_DREAM + 0.8), 8)
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#fff6f0', 0.85 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          // Crickets in the grass.
          ...[0.2, 0.32, 0.9, 1.02, 1.6, 1.72].map(
            (at) => [at, quiet(() => tone(4200, 0.05, { type: 'square', vol: 0.006 }))] as const,
          ),
          [0.05, quiet(() => hiss(1.6, { freq: 1200, type: 'lowpass', vol: 0.02 }))],
          [T_WANE, quiet(() => tone(784, 1.6, { type: 'sine', vol: 0.03, slide: -390 }))],
          [
            T_DREAM,
            quiet(() =>
              [659, 784, 988, 1175].forEach((f, i) =>
                tone(f, 0.9, { type: 'triangle', vol: 0.018, at: i * 0.18 }),
              ),
            ),
          ],
          [
            T_LEAVE,
            quiet(
              () => (
                hiss(1.1, { freq: 1500, slide: -1100, vol: 0.04 }),
                tone(1568, 1.2, { type: 'sine', vol: 0.025, slide: -784 })
              ),
            ),
          ],
          [T_REST, quiet(() => fxSound('legend.heart'))],
          [
            T_OPEN,
            quiet(() =>
              [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
                tone(f, 0.5, { type: 'sine', vol: 0.025, at: i * 0.08 }),
              ),
            ),
          ],
          [T_OPEN + 0.3, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** Its two veils: tilted rings of rose light circling it, the back half behind it, the front half before it. */
function veils(g: G, x: number, y: number, R: number, t: number, front: boolean) {
  if (R < 3) return
  for (const [tilt, col] of [
    [0.28, '#ffb0e0'],
    [-0.22, '#e0b0ff'],
  ] as const) {
    const ry = Math.max(2, Math.round(R * 0.32))
    const a0 = front ? 0 : Math.PI
    // A ring drawn as dots so it can lean: each point raised by the tilt as it goes round.
    for (let k = 0; k < 64; k++) {
      const a = a0 + (k / 64) * Math.PI
      const px = x + Math.cos(a) * R
      const py = y + Math.sin(a) * ry + Math.cos(a) * R * tilt
      rect(g, Math.round(px), Math.round(py), 2, 1, (k + Math.floor(t * 20)) % 6 ? col : '#ffffff')
    }
  }
  softEllipse(g, x, y, 2, 2, '#ffffff', 0.9)
}
