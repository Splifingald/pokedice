// Groudon's raid entrance (docs/53): a red badland at dusk, a volcano smoking on the horizon, the last pools of water
// lying in the hollows. Then the drought: the sun swells and burns white, its rays stabbing down, the sky bleaching
// to white-hot, the pools boiling off into steam, the dry earth cracking into plates. The ground shakes; magma wells
// up into the cracks, and in the middle the cracks draw an Ω of fire (the mark of Omega). The land splits along it:
// the two halves grind apart, a chasm of lava opens between them, geysers of magma burst up one after another, and a
// colossal shape climbs out of the rift, its lines glowing. The reveal: a ring of magma and the sun flaring behind it.
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
  polyline,
  rect,
  rng,
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
  wobble,
  type Cinema,
  type CinemaParams,
} from './kit'

const T_SUN = 0.8
const T_DRY = 1.3
const T_QUAKE = 2.2
const T_OMEGA = 2.5
const T_SPLIT = 3.15
const GEYSERS = [3.35, 3.65, 3.95] as const
const T_RISE = 3.5
const REVEAL = 4.75
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffd0a0', '#ff4a1e', '#7a1606'] as const
const LAVA = ['#fff6c8', '#ffd23a', '#ff8a1e', '#e0401e', '#8a1a0a'] as const

type Crack = { pts: [number, number][]; at: number }

type S = {
  r: Rng
  fx: Particles
  amb: Particles
  dusk: Canvas
  hot: Canvas
  land: Canvas
  dry: Canvas
  rays: Canvas
  cracks: Crack[]
  pools: { x: number; y: number; rx: number }[]
  shakes: [number, number, number][]
}

export const groudonCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const hz = Math.round(h * 0.44)
    const feet = Math.round(h * 0.64)
    const sz = spriteSize(p.mon)
    const mid = feet - Math.round(sz.h / 2)
    const sun = { x: Math.round(cx + w * 0.18), y: Math.round(h * 0.15) }
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    /** The ground's perspective: how near a row is, 0 at the horizon, 1 at the bottom. */
    const near = (y: number) => Math.max(0, (y - hz) / (h - hz))
    /** How far the two halves have parted (px at the bottom of the screen). */
    const part = (t: number) =>
      Math.round(Math.min(w * 0.22, 46) * ease.outC(span(t, T_SPLIT, T_SPLIT + 0.9)))
    /** The rift's line down the ground. */
    const riftX = (y: number) => cx + Math.round(Math.sin(y / 9) * 2 + Math.sin(y / 23) * 3)
    return {
      id: 'cinema-groudon',
      dur: DUR,
      setup() {
        const r = rng(383)
        // The skies: dusk red, then the drought's white heat; both with the volcano and the mesas.
        const skyline = (g: G, c0: string, c1: string) => {
          tri(g, w * 0.12, hz + 1, w * 0.42, hz + 1, w * 0.26, hz - h * 0.14, c0)
          rect(g, w * 0.26 - 5, hz - h * 0.14, 10, 2, c0)
          for (const [x0, ww, hh] of [
            [w * 0.55, w * 0.16, h * 0.05],
            [w * 0.78, w * 0.26, h * 0.07],
            [-w * 0.05, w * 0.14, h * 0.04],
          ] as const) {
            rect(g, x0, hz - hh, ww, hh + 1, c0)
            rect(g, x0 + 2, hz - hh, ww - 4, 1, c1)
          }
        }
        const dusk = canvas(w, hz + 1)
        dusk.g.drawImage(dGradient(w, hz + 1, ['#2a0a14', '#6a1a1a', '#b0401e', '#e07a2a'], 4), 0, 0)
        skyline(dusk.g, '#2a0c0c', '#8a3a1a')
        const hot = canvas(w, hz + 1)
        hot.g.drawImage(dGradient(w, hz + 1, ['#ffd27a', '#fff0b0', '#fffae0', '#ffffff'], 4), 0, 0)
        skyline(hot.g, '#8a3a1a', '#ffd27a')
        // The badland: red earth in perspective, darker far off; stones; then the same baked pale.
        const ground = (ramp: readonly string[], speck: string) => {
          const cv = canvas(w, h - hz)
          cv.g.drawImage(dGradient(w, h - hz, ramp, 4), 0, 0)
          const rr = rng(83)
          for (let i = 0; i < 90; i++) {
            const y = rr.range(0, h - hz)
            const k = near(y + hz)
            rect(cv.g, rr.range(0, w), y, Math.max(1, Math.round(k * 4)), 1, speck)
          }
          return cv
        }
        const land = ground(['#4a1a10', '#6a2a14', '#7a3418', '#5a2410'], '#3a120a')
        const dry = ground(['#8a4a2a', '#b06a3a', '#c88a4a', '#a06a3a'], '#6a3a1a')
        // The cracks: a network over the ground, nearer ones wider; the ones near the middle open first.
        const cracks: Crack[] = []
        for (let i = 0; i < 46; i++) {
          const y = hz + 4 + (h - hz - 4) * r() ** 0.8
          const x = r.range(-10, w + 10)
          const k = near(y)
          const len = 8 + k * 40
          const a = r.range(-0.5, 0.5) + (r() < 0.5 ? 0 : Math.PI)
          const pts = bolt(r, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.4, 0.4, 3)
          const d = Math.hypot(x - cx, (y - feet) * 2) / Math.max(w, h)
          cracks.push({ pts, at: T_DRY + d * 1.4 + r() * 0.2 })
        }
        const pools = Array.from({ length: 5 }, (_, i) => {
          const y = hz + 8 + (h - hz - 14) * ((i + 0.5) / 5) ** 1.3
          return { x: (i % 2 ? 0.75 : 0.25) * w + r.range(-20, 20), y, rx: Math.round(4 + near(y) * 18) }
        })
        return {
          r,
          fx: new Particles(),
          amb: new Particles(),
          dusk,
          hot,
          land,
          dry,
          rays: canvas(w, h),
          cracks,
          pools,
          shakes: p.short
            ? []
            : [
                [T_QUAKE, 0.9, 2],
                [T_SPLIT, 1.2, 4],
                [GEYSERS[2], 0.4, 2],
                [REVEAL, 0.8, 5],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.amb.update(dt)
        // The volcano's smoke, always; ash and embers in the air.
        if (r() < 0.4 * many)
          s.amb.add({
            x: w * 0.26 + r.range(-3, 3),
            y: hz - h * 0.14,
            vx: r.range(4, 10),
            vy: -r.range(6, 14),
            life: 3,
            size: r.int(2, 4),
            size1: 6,
            shape: 'smoke',
            colors: ['#3a1a14', '#2a120e'],
            density: 0.7,
          })
        // The pools boiling away under the sun.
        if (t > T_SUN + 0.3 && t < T_QUAKE)
          for (const pl of s.pools)
            if (r() < 0.12 * many)
              s.fx.add({
                x: pl.x + r.range(-pl.rx, pl.rx),
                y: pl.y,
                vy: -r.range(10, 25),
                vx: r.range(-3, 3),
                life: 1,
                size: 1,
                size1: 3,
                shape: 'smoke',
                colors: ['#fff6e8', '#f0d8c0', '#e0c8b0'],
                density: 0.3,
              })
        // The quake: stones hopping on the ground.
        if (t > T_QUAKE && t < REVEAL && r() < 0.5 * many) {
          const y = r.range(hz + 4, h)
          s.fx.add({
            x: r.range(0, w),
            y,
            vy: -r.range(20, 60) * (0.4 + near(y)),
            ay: 260,
            life: 0.4,
            size: near(y) > 0.5 ? 2 : 1,
            shape: 'sq',
            colors: ['#7a3418', '#4a1a10'],
          })
        }
        // Magma geysers out of the rift, one after another.
        for (const [i, at] of GEYSERS.entries())
          if (within(t, at, at + dt)) {
            const y = Math.round(lerp(feet + 6, h - 6, i / 2))
            for (let k = 0; k < 50 * many + 10; k++)
              s.fx.add({
                x: riftX(y) + r.range(-4, 4),
                y,
                vx: r.range(-40, 40),
                vy: -r.range(120, 280),
                ay: 340,
                life: r.range(0.8, 1.4),
                size: r.int(1, 3),
                shape: r() < 0.6 ? 'sq' : 'drop',
                colors: [...LAVA],
              })
          }
        // Embers and sparks up out of the rift once it's open.
        if (t > T_SPLIT && r() < 0.8 * many) {
          const y = r.range(hz + 6, h)
          s.amb.add({
            x: riftX(y) + r.range(-3, 3) * near(y),
            y,
            vx: r.range(-10, 10),
            vy: -r.range(30, 80),
            life: r.range(0.8, 1.6),
            size: 1,
            shape: 'px',
            colors: ['#fff6c8', '#ffd23a', '#ff8a1e', '#8a1a0a'],
          })
        }
        // Magma running off the shape as it climbs out.
        if (t > T_RISE && t < REVEAL + 1 && r() < 0.7 * many) {
          const q = ease.outQ(span(t, T_RISE, REVEAL - 0.15))
          const top = lerp(feet + sz.h + 6, feet, q) - sz.h
          s.fx.add({
            x: cx + r.range(-sz.w * 0.4, sz.w * 0.4),
            y: top + r.range(sz.h * 0.1, sz.h * 0.7),
            vy: r.range(0, 20),
            ay: 200,
            life: 0.7,
            size: 1,
            shape: 'drop',
            colors: [LAVA[1], LAVA[2], LAVA[3]],
          })
        }
        if (within(t, REVEAL, REVEAL + dt)) {
          for (let k = 0; k < 90 * many; k++) {
            const a = -Math.PI / 2 + r.range(-1.4, 1.4)
            const v = r.range(80, 260)
            s.fx.add({
              x: cx + r.range(-sz.w * 0.4, sz.w * 0.4),
              y: mid + r.range(-sz.h * 0.3, sz.h * 0.3),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 320,
              life: r.range(0.8, 1.4),
              size: r.int(1, 3),
              shape: 'sq',
              colors: [...LAVA],
            })
          }
          for (let k = 0; k < 40 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 170)
            s.fx.add({
              x: cx,
              y: mid,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [...AURA],
            })
          }
        }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        // Under the shake's edges: the sky's own colour, not a black bar.
        g.fillStyle = t > T_DRY ? '#c06a3a' : '#4a1a10'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The sky bleaching white with the drought (and reddening a little again once the magma is up).
        const heat = span(t, T_SUN, T_DRY + 0.6)
        g.drawImage(s.dusk, 0, 0)
        if (heat > 0) dissolve(g, s.hot, heat)
        drawSun(g, t, heat)
        s.amb.draw(g)
        // The heat shimmer over the horizon.
        if (heat >= 1) {
          const band = Math.round(h * 0.07)
          wobble(g, s.hot, w, hz - band, hz + 1, t, 1.5, 4, 9)
        }
        // The ground: red, baked pale; then split down the rift, its halves grinding apart.
        const d = part(t)
        const dk = span(t, T_SUN + 0.2, T_DRY + 0.8) * (1 - 0.5 * span(t, T_QUAKE, T_SPLIT))
        for (let y = hz; y < h; y++) {
          const k = near(y)
          const shift = Math.round(d * k)
          const fx = riftX(y)
          const src = y - hz
          if (d === 0) {
            g.drawImage(s.land, 0, src, w, 1, 0, y, w, 1)
            continue
          }
          // The chasm between: lava deep down, its walls dark.
          rect(g, fx - shift - 1, y, shift * 2 + 2, 1, (y + Math.floor(t * 20)) % 6 < 2 ? LAVA[1] : LAVA[2])
          if (shift > 2) {
            rect(g, fx - shift, y, Math.max(1, Math.round(shift * 0.35)), 1, '#2a0a06')
            rect(
              g,
              fx + shift - Math.max(1, Math.round(shift * 0.35)),
              y,
              Math.max(1, Math.round(shift * 0.35)),
              1,
              '#4a120a',
            )
          }
          // Each half sinks a little at its broken edge as it goes.
          const sink = Math.round(shift * 0.12)
          // Two rows tall, so the halves sinking leave no gap between rows.
          g.drawImage(s.land, 0, src, fx, 1, -shift, y + sink, fx, 2)
          g.drawImage(s.land, fx, src, w - fx, 1, fx + shift, y + sink, w - fx, 2)
        }
        if (dk > 0) {
          g.save()
          g.beginPath()
          g.rect(0, hz, w, h - hz)
          g.clip()
          if (d === 0) dissolve(g, s.dry, dk, 0, hz)
          g.restore()
        }
        // The pools, shrinking as they boil off, the sky in them.
        for (const pl of s.pools) {
          const k = 1 - span(t, T_SUN + 0.2, T_QUAKE - 0.2)
          if (k <= 0 || d > 0) continue
          const rx = Math.round(pl.rx * k)
          if (rx < 1) continue
          ellipse(g, pl.x, pl.y, rx, Math.max(1, Math.round(rx * 0.3)), heat > 0.5 ? '#fff6d8' : '#c06a3a')
          rect(g, pl.x - rx * 0.5, pl.y - 1, rx, 1, '#ffffff')
        }
        // The cracks, opening, then filling with magma; the Ω of fire.
        const magma = span(t, T_QUAKE, T_QUAKE + 0.6)
        for (const c of s.cracks) {
          const q = span(t, c.at, c.at + 0.3)
          if (q <= 0) continue
          const n = Math.max(2, Math.round(c.pts.length * q))
          const pts = c.pts.slice(0, n)
          // Which side of the rift a crack lies on moves it with its half.
          const shift = Math.round(d * near(c.pts[0]![1]) * (c.pts[0]![0] < cx ? -1 : 1))
          const moved = d
            ? pts.map(([x, y]) => [x + shift, y + Math.round(Math.abs(shift) * 0.12)] as [number, number])
            : pts
          const wd = near(c.pts[0]![1]) > 0.5 ? 2 : 1
          polyline(g, moved, magma > 0 ? LAVA[4] : '#2a0a06', wd + (magma > 0.5 ? 1 : 0))
          if (magma > 0)
            polyline(g, moved, magma > 0.6 && Math.floor(t * 6 + c.at * 10) % 4 ? LAVA[1] : LAVA[2])
        }
        drawOmega(g, t, cx, feet + 2, Math.min(w * 0.3, 60), d)
        // The rift's glow, and the shape climbing out of it.
        // The geysers: columns of magma shooting up out of the rift.
        for (const [i, at] of GEYSERS.entries()) {
          const q = span(t, at, at + 0.6)
          if (q <= 0 || q >= 1) continue
          const y0 = Math.round(lerp(feet + 6, h - 6, i / 2))
          const x0 = riftX(y0)
          const top = Math.round(y0 - h * 0.3 * Math.sin(Math.PI * q) * (1 - i * 0.15))
          const wd = Math.round(2 + near(y0) * 4)
          g.drawImage(glow(wd * 3, LAVA[3], 1.2, 0.6), x0 - wd * 3, y0 - wd * 3)
          for (let y = top; y < y0; y++) {
            const k = (y - top) / Math.max(1, y0 - top)
            const ww = Math.max(1, Math.round(wd * (0.5 + k * 0.6)))
            rect(
              g,
              x0 - ww + Math.round(Math.sin(y / 3 + t * 30)),
              y,
              ww * 2,
              1,
              k < 0.15 ? LAVA[0] : (y + Math.floor(t * 40)) % 4 ? LAVA[1] : LAVA[2],
            )
          }
        }
        if (d > 0) {
          const gr = Math.round(m * 0.35)
          shine(g, cx, feet, gr, LAVA[3], 1.3, 0.5 * span(t, T_SPLIT, T_SPLIT + 0.5))
        }
        if (within(t, T_RISE, REVEAL)) {
          const q = ease.outQ(span(t, T_RISE, REVEAL - 0.15))
          const y = Math.round(lerp(feet + sz.h + 6, feet, q))
          g.save()
          g.beginPath()
          g.rect(0, 0, w, feet + 2)
          g.clip()
          const gr = Math.round(sz.w * 0.75)
          g.drawImage(glow(gr, LAVA[3], 1.2, 0.55), cx - gr, y - Math.round(sz.h / 2) - gr)
          drawSprite(g, p.mon, cx, y, {
            sil: '#2a0a06',
            outline: Math.floor(t * 12) % 3 ? LAVA[0] : LAVA[1],
          })
          g.restore()
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.28, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: mid }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        for (const [dd, c] of [
          [0, AURA[0]],
          [0.1, LAVA[1]],
          [0.22, AURA[2]],
        ] as const)
          burstRing(g, cx, mid, span(t, REVEAL + dd, REVEAL + dd + 0.6), Math.max(w, h) * 0.75, 3, c)
        // The magma ring over the ground, flattened.
        const mq = span(t, REVEAL, REVEAL + 0.8)
        if (mq > 0 && mq < 1) {
          const R = Math.round(lerp(10, w * 0.8, ease.outC(mq)))
          ellipseLine(g, cx, feet + 2, R, Math.max(2, Math.round(R * 0.25)), mq < 0.5 ? LAVA[1] : LAVA[3])
          ellipseLine(g, cx, feet + 3, R - 2, Math.max(2, Math.round(R * 0.25) - 1), LAVA[2])
        }
        s.fx.draw(g)
        g.restore()
        if (within(t, T_SPLIT, T_SPLIT + 0.15)) screenFlash(g, '#ffd23a', 0.3)
        // Only the middle geyser flashes: the split's flash and the others are too close (no more than 3 a second).
        if (within(t, GEYSERS[1], GEYSERS[1] + 0.08)) screenFlash(g, '#ff8a1e', 0.18)
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#fff6c8', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.5, { freq: 250, type: 'lowpass', vol: 0.05 }))],
          [T_SUN, quiet(() => tone(220, 1.6, { type: 'sawtooth', vol: 0.02, slide: 220 }))],
          [T_SUN + 0.05, quiet(() => hiss(1.6, { freq: 3000, type: 'highpass', vol: 0.03, slide: 2000 }))],
          [T_DRY, quiet(() => hiss(1, { freq: 1200, vol: 0.04 }))],
          ...[0, 0.25, 0.45, 0.6].map(
            (dd, i) =>
              [T_DRY + 0.1 + dd, quiet(() => hiss(0.06, { freq: 1800 - i * 200, vol: 0.05 }))] as const,
          ),
          [
            T_QUAKE,
            quiet(
              () => (
                hiss(1.6, { freq: 90, type: 'lowpass', vol: 0.16 }),
                tone(41, 1.4, { type: 'sawtooth', vol: 0.05 })
              ),
            ),
          ],
          [T_OMEGA, quiet(() => fxSound('fire.inhale'))],
          [
            T_SPLIT,
            quiet(
              () => (
                hiss(1.2, { freq: 160, type: 'lowpass', vol: 0.18 }),
                tone(36, 1.4, { type: 'square', vol: 0.04, slide: -6 })
              ),
            ),
          ],
          ...GEYSERS.map((at) => [at, quiet(() => fxSound('fire.stream'))] as const),
          [T_RISE + 0.4, quiet(() => fxSound('legend.heart'))],
          [REVEAL - 0.4, quiet(() => fxSound('legend.heart'))],
          [
            REVEAL,
            (hud) => (quiet(() => (fxSound('legend.roar'), fxSound('fire.hit')))(), hud.beat?.('roar')),
          ],
        ] satisfies Cue<S>[]),
    }

    /** The sun: swelling, burning white, its rays stabbing down. */
    function drawSun(g: G, t: number, heat: number) {
      const R = Math.round(lerp(m * 0.06, m * 0.13, ease.ioS(span(t, T_SUN, T_DRY + 0.4))))
      const hr = Math.round(R * (2 + heat))
      shine(g, sun.x, sun.y, hr, heat > 0.5 ? '#ffffff' : '#ffd27a', 1.4, 0.55 + 0.3 * heat)
      ellipse(g, sun.x, sun.y, R, R, heat > 0.4 ? '#fffae0' : '#ffd27a')
      ellipse(g, sun.x, sun.y, Math.round(R * 0.7), Math.round(R * 0.7), '#ffffff')
      if (heat <= 0) return
      // Rays: long wedges turning slowly, and straight down onto the land.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.4
        const L = R * (2 + heat * 2.5) * (i % 2 ? 0.7 : 1)
        line(
          g,
          sun.x + Math.cos(a) * (R + 2),
          sun.y + Math.sin(a) * (R + 2),
          sun.x + Math.cos(a) * L,
          sun.y + Math.sin(a) * L,
          heat > 0.5 ? '#ffffff' : '#fff0b0',
        )
      }
    }

    /** The Ω burnt into the ground in magma, flat on it, split by the rift once it opens. */
    function drawOmega(g: G, t: number, x: number, y: number, R: number, d: number) {
      const q = span(t, T_OMEGA, T_OMEGA + 0.5)
      if (q <= 0) return
      const fy = 0.32
      const pts: [number, number][] = []
      const from = Math.PI * 0.68
      const to = Math.PI * 2.32
      const n = Math.max(2, Math.round(48 * q))
      for (let i = 0; i <= n; i++) {
        const a = from + ((to - from) * i) / 48
        pts.push([Math.cos(a) * R, Math.sin(a) * R * fy - R * fy * 0.6])
      }
      // Its two feet.
      const ends: [number, number][][] =
        q >= 1
          ? [
              [pts[0]!, [pts[0]![0] - R * 0.45, pts[0]![1]]],
              [pts[pts.length - 1]!, [pts[pts.length - 1]![0] + R * 0.45, pts[pts.length - 1]![1]]],
            ]
          : []
      const shift = (px: number) => (d ? Math.round(d * near(y) * (px < 0 ? -1 : 1)) : 0)
      const place = (st: [number, number][]) =>
        st.map(
          ([a, b]) =>
            [Math.round(x + a + shift(a)), Math.round(y + b + (d ? Math.round(d * 0.06) : 0))] as [
              number,
              number,
            ],
        )
      const hot = Math.floor(t * 8) % 3 ? LAVA[1] : LAVA[0]
      const gr = Math.round(R * 0.9)
      shine(g, x, y - Math.round(R * fy * 0.6), gr, LAVA[3], 1.3, 0.45 * q)
      for (const st of [pts, ...ends]) polyline(g, place(st), LAVA[3], 3)
      for (const st of [pts, ...ends]) polyline(g, place(st), q < 1 ? LAVA[2] : hot)
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
