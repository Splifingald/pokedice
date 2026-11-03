// Regigigas's raid entrance (docs/53): the deepest chamber of Snowpoint Temple. Ice-glazed stone, icicles, a shaft of
// cold light with snow dust turning in it, panels of braille carved in the walls, and in the alcove a colossus of
// frosted stone that has not moved in an age. Three lights come in, one after another: the orange of Regirock, the
// ice-blue of Regice, the steel of Registeel, each lighting a braille panel dot by dot as it passes, circling the
// colossus and sinking into it. Then it wakes, slowly (Slow Start): a glow climbing it from its feet, the frost
// cracking off. It reaches out with ropes of light and drags the land itself: the temple's floor splits into plates
// like continents and they grind in toward it, tug by tug, the whole screen heaving. The reveal throws the last frost
// off it in a burst of ice, the three colours ringing out.
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
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteFrame, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  drawShards,
  inOrder,
  makeShard,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
} from './kit'

/** The three lights' arrivals: Regirock, Regice, Registeel. */
const LIGHTS = [1.1, 1.6, 2.1] as const
const T_WAKE = 2.85
/** Each tug on the land. */
const TUGS = [3.75, 4.15, 4.5, 4.78] as const
const REVEAL = 5.0
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#fff6d0', '#e8d890', '#6a6040'] as const
/** Regirock, Regice, Registeel: a light, its glow. */
const REGI = [
  ['#ffc080', '#e07a2a'],
  ['#c8f4ff', '#5ac8f0'],
  ['#f0f0ff', '#9aa0c0'],
] as const
const GOLD = ['#fff6c8', '#ffe08a', '#ffc83a', '#c89020'] as const
const STONE = { lit: '#9aaabb', mid: '#6a7a8c', dark: '#3e4a58', ink: '#1a2028', frost: '#d8e8f4' }

interface Plate {
  cv: Canvas
  /** Its middle, and where it is dragged: toward it, a step per tug. */
  x: number
  y: number
  dx: number
  dy: number
  order: number
}

type S = {
  r: Rng
  fx: Particles
  shards: Shard[]
  back: Canvas
  plates: Plate[]
  rays: Canvas
  /** The braille panels' dots, each panel lit by one of the three. */
  dots: { x: number; y: number; who: number; k: number }[]
  shakes: [number, number, number][]
}

export const regigigasCinema: Cinema = {
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
    const fl = Math.round(h * 0.6)
    const feet = Math.round(h * 0.64)
    const my = Math.round(feet - sz.h * 0.5)
    /** Where each light comes in from, and how it flies: in along a curve, once round it, into it. */
    const from = [
      [-10, h * 0.25],
      [w + 10, h * 0.3],
      [cx, -10],
    ] as const
    const lightAt = (i: number, t: number) => {
      const t0 = LIGHTS[i]!
      const q = span(t, t0, t0 + 0.8)
      const [fx0, fy0] = from[i]!
      const R = Math.max(sz.w * 0.7, m * 0.25)
      if (q < 0.45) {
        const k = ease.outQ(q / 0.45)
        const a = Math.PI + i * 2.1
        return {
          x: lerp(fx0, cx + Math.cos(a) * R, k),
          y: lerp(fy0, my + Math.sin(a) * R * 0.45, k) - Math.sin(k * Math.PI) * h * 0.08,
        }
      }
      const k = (q - 0.45) / 0.55
      const a = Math.PI + i * 2.1 + k * Math.PI * 2
      const rr = R * (1 - ease.inQ(k))
      return { x: cx + Math.cos(a) * rr, y: my + Math.sin(a) * rr * 0.45 }
    }
    const pull = (t: number) => TUGS.reduce((a, at) => a + ease.outBack(span(t, at, at + 0.28), 2.2), 0)
    return {
      id: 'cinema-regigigas',
      dur: DUR,
      setup() {
        const r = rng(486)
        const back = canvas(w, fl)
        const g = back.g
        // The chamber's back wall: great blocks of stone glazed with ice, darker up into the dark.
        g.drawImage(dGradient(w, fl, ['#0a0e14', '#141c26', '#1e2a38', '#2a3a4a']), 0, 0)
        const bh = Math.max(8, Math.round(m * 0.07))
        for (let y = fl - bh, row = 0; y > -bh; y -= bh, row++)
          for (let x = (row % 2) * -bh; x < w; x += bh * 2) {
            rect(g, x, y, bh * 2 - 1, bh - 1, row % 3 ? '#243242' : '#1e2a38')
            rect(g, x, y, bh * 2 - 1, 1, '#3a4c60')
            rect(g, x, y + bh - 1, bh * 2, 1, '#0e141c')
          }
        // The alcove the colossus stands in: an arch of darkness behind it.
        const aw = Math.round(Math.max(sz.w * 0.75, m * 0.3))
        const atop = Math.round(Math.max(h * 0.12, feet - sz.h - m * 0.18))
        rect(g, cx - aw, atop + aw * 0.5, aw * 2, fl - atop - aw * 0.5, '#06080c')
        ellipse(g, cx, Math.round(atop + aw * 0.5), aw, Math.round(aw * 0.5), '#06080c')
        for (const side of [-1, 1]) {
          rect(g, cx + side * aw - (side > 0 ? 0 : 4), atop + aw * 0.5, 4, fl - atop, '#4a5c70')
          rect(g, cx + side * aw - (side > 0 ? 0 : 4), atop + aw * 0.5, 1, fl - atop, STONE.frost)
        }
        // Frost along the wall's foot and icicles hanging from the top.
        for (let x = 0; x < w; x++) if (bayer(x, fl - 2) < 0.6) rect(g, x, fl - 2, 1, 2, STONE.frost)
        for (let i = 0; i < Math.round(w / 7); i++) {
          const x = Math.round(r.range(0, w))
          const len = Math.round(r.range(4, h * 0.09))
          tri(g, x - 2, 0, x + 2, 0, x, len, '#a8c8e0')
          rect(g, x, 0, 1, Math.round(len * 0.7), '#e8f4ff')
        }
        // Braille panels, two cells high, beside the alcove and over it: a dot pattern each Regi lights.
        const dots: S['dots'] = []
        const panel = (x0: number, y0: number, cols: number, rows: number, who: number) => {
          rect(g, x0 - 3, y0 - 3, cols * 7 + 3, rows * 10 + 3, '#16202c')
          rect(g, x0 - 3, y0 - 3, cols * 7 + 3, 1, '#3a4c60')
          for (let cy = 0; cy < rows; cy++)
            for (let c = 0; c < cols; c++)
              for (let k = 0; k < 6; k++) {
                if (r() < 0.45) continue
                const x = x0 + c * 7 + (k % 2) * 3
                const y = y0 + cy * 10 + Math.floor(k / 2) * 3
                rect(g, x, y, 2, 2, '#2e3e50')
                dots.push({ x, y, who, k: (c + cy * cols) / (cols * rows) })
              }
        }
        const pc = Math.min(5, Math.floor((cx - aw - 14) / 7))
        const tc = Math.max(3, Math.min(8, Math.floor((aw * 1.6) / 7)))
        if (pc >= 3) {
          // Wide: one each side of the alcove, Registeel's over it.
          const py = Math.round(fl - h * 0.24)
          panel(cx - aw - 8 - pc * 7, py, pc, 2, 0)
          panel(cx + aw + 10, py, pc, 2, 1)
          panel(cx - Math.round((tc * 7) / 2), Math.max(6, atop - 26), tc, 2, 2)
        } else
          // Narrow: the three stacked over the alcove.
          [0, 1, 2].forEach((who, i) =>
            panel(cx - Math.round((tc * 7) / 2), Math.max(4, atop - 26 - (2 - i) * 26), tc, 2, who),
          )
        // The floor: slabs of glazed stone in perspective, frost in their joints; broken into plates like continents.
        const fh = h - fl
        const seeds: [number, number][] = []
        const n = Math.max(9, Math.round(w / 26))
        for (let i = 0; i < n; i++) seeds.push([r.range(-w * 0.1, w * 1.1), r.range(-0.1, 1.1)])
        seeds.push([cx, 0.35])
        const tex = (x: number, y: number, d: number) => {
          const z = 1 / (d + 0.15)
          const wx = (((x - cx) * z) / (w * 0.5)) * 3 + 50
          const wz = z * 2
          const fx = wx - Math.floor(wx)
          const fz = wz - Math.floor(wz)
          if (fz < 0.06 * z || fx < 0.025 * z) return STONE.dark
          if (fz < 0.14 * z) return bayer(x, y) < 0.5 ? STONE.frost : STONE.lit
          return bayer(x, y) < 0.15 + (1 - d) * 0.3 ? STONE.lit : STONE.mid
        }
        const cells = seeds.map(() => ({ cv: canvas(w, fh), img: null as ImageData | null }))
        for (const c of cells) c.img = c.cv.g.createImageData(w, fh)
        const hex = (s: string) => [
          parseInt(s.slice(1, 3), 16),
          parseInt(s.slice(3, 5), 16),
          parseInt(s.slice(5, 7), 16),
        ]
        for (let y = 0; y < fh; y++) {
          const d = (y + 1) / fh
          for (let x = 0; x < w; x++) {
            let b1 = 0
            let d1 = Infinity
            let d2 = Infinity
            seeds.forEach(([sx, sy], i) => {
              const dd = Math.hypot(sx - x, (sy - d) * w * 0.7)
              if (dd < d1) {
                d2 = d1
                d1 = dd
                b1 = i
              } else if (dd < d2) d2 = dd
            })
            if (d2 - d1 < 0.7 + d * 0.6) continue
            const [R, G, B] = hex(tex(x, y, d))
            const data = cells[b1]!.img!.data
            const o = (y * w + x) * 4
            data[o] = R!
            data[o + 1] = G!
            data[o + 2] = B!
            data[o + 3] = 255
          }
        }
        const plates: Plate[] = cells.map((c, i) => {
          c.cv.g.putImageData(c.img!, 0, 0)
          const [sx, sy] = seeds[i]!
          const y = sy * fh
          // Dragged toward it, the nearest the hardest: seams open between them, glowing, the land pulled under it.
          const dx = cx - sx
          const near = Math.max(0.25, 1 - Math.abs(dx) / (w * 0.75))
          const step = m * 0.035 * near
          const centre = i === seeds.length - 1
          return {
            cv: c.cv,
            x: sx,
            y,
            dx: centre ? 0 : Math.sign(dx) * step,
            dy: centre ? 0 : -step * 0.25,
            order: centre ? 1e9 : -Math.abs(dx),
          }
        })
        plates.sort((a, b) => a.order - b.order)
        return {
          r,
          fx: new Particles(),
          shards: [],
          back,
          plates,
          rays: canvas(w, h),
          dots,
          shakes: p.short
            ? []
            : [
                [T_WAKE, 0.9, 1],
                [T_WAKE + 0.5, 0.9, 2],
                ...TUGS.map((at, i) => [at, 0.45, 3 + i] as [number, number, number]),
                [REVEAL, 0.7, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        stepShards(s.shards, dt, { g: 300, floor: feet + 6 })
        // Snow dust turning in the shaft of light.
        if (r() < 0.5 * many)
          s.fx.add({
            x: cx + r.range(-m * 0.25, m * 0.25),
            y: -2,
            vx: r.range(-6, 6),
            vy: r.range(10, 22),
            life: 6,
            size: 1,
            shape: 'px',
            colors: ['#e8f4ff', '#a8c8e0'],
          })
        // Each light trails its colour, and bursts as it sinks into the colossus.
        LIGHTS.forEach((t0, i) => {
          if (t > t0 && t < t0 + 0.8 && r() < 0.9 * many) {
            const at = lightAt(i, t)
            s.fx.add({
              x: at.x,
              y: at.y,
              vx: r.range(-8, 8),
              vy: r.range(-8, 8),
              life: 0.5,
              size: 1,
              shape: 'star',
              colors: [REGI[i]![0], REGI[i]![1]],
            })
          }
          if (within(t, t0 + 0.8, t0 + 0.8 + dt))
            for (let k = 0; k < 24 * many; k++) {
              const a = r() * Math.PI * 2
              s.fx.add({
                x: cx,
                y: my,
                vx: Math.cos(a) * r.range(30, 90),
                vy: Math.sin(a) * r.range(30, 90),
                drag: 3,
                life: 0.6,
                size: 1,
                shape: 'star',
                colors: [REGI[i]![0], REGI[i]![1]],
              })
            }
        })
        // Frost cracking off it as it wakes: ice falling.
        if (t > T_WAKE && t < REVEAL && r() < 0.35 * many) {
          const sh = makeShard(
            r,
            cx + r.range(-sz.w * 0.4, sz.w * 0.4),
            feet - r.range(sz.h * 0.2, sz.h * 0.9),
            40,
            '#c8e0f0',
            '#ffffff',
            0.2,
          )
          sh.r = r.range(1.2, 2.5)
          s.shards.push(sh)
        }
        // Each tug: dust and ice off the grinding plates.
        TUGS.forEach((at) => {
          if (!within(t, at, at + dt)) return
          for (let k = 0; k < 40 * many; k++)
            s.fx.add({
              x: r.range(0, w),
              y: fl + r.range(0, h - fl),
              vx: r.range(-20, 20),
              vy: -r.range(10, 40),
              ay: 80,
              drag: 1,
              life: r.range(0.5, 1),
              size: r.int(2, 3),
              shape: 'smoke',
              colors: ['#c8d8e8', '#8a9aaa'],
            })
        })
        // The reveal blows the last of its frost off.
        if (within(t, REVEAL, REVEAL + dt)) {
          for (let k = 0; k < 80 * many; k++) {
            const a = r() * Math.PI * 2
            const sh = makeShard(
              r,
              cx + Math.cos(a) * sz.w * 0.3,
              my + Math.sin(a) * sz.h * 0.35,
              260,
              '#c8e0f0',
              '#ffffff',
              0.4,
            )
            sh.vx = Math.cos(a) * r.range(80, 260)
            sh.vy = Math.sin(a) * r.range(80, 260) - 60
            s.shards.push(sh)
          }
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 190)
            s.fx.add({
              x: cx,
              y: my,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v * 0.6,
              drag: 2.4,
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: [REGI[k % 3]![0], REGI[k % 3]![1], ...GOLD],
            })
          }
        }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#06080c'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.back, 0, 0)
        // The braille lighting dot by dot as each light passes, in its colour.
        for (const d of s.dots) {
          const t0 = LIGHTS[d.who]!
          if (t < t0 + d.k * 0.5) continue
          const fresh = t < t0 + d.k * 0.5 + 0.15
          rect(g, d.x, d.y, 2, 2, fresh ? '#ffffff' : REGI[d.who]![t > REVEAL ? 0 : 1])
        }
        // The shaft of cold light from above.
        g.fillStyle = pattern(g, '#a8c8e0', 3)
        for (let y = 0; y < fl; y++) {
          const half = Math.round(m * 0.12 + y * 0.18)
          g.fillRect(cx - half, y, half * 2, 1)
        }
        // The floor: dark under its plates (the abyss showing where they part), the plates dragged in on each tug.
        rect(g, 0, fl, w, h - fl, '#05070a')
        const k = pull(t)
        if (k > 0) {
          const gk = Math.min(1, k)
          g.fillStyle = pattern(g, GOLD[2], gk * 10)
          g.fillRect(0, fl, w, h - fl)
        }
        for (const pl of s.plates) g.drawImage(pl.cv, Math.round(pl.dx * k), fl + Math.round(pl.dy * k))
        rect(g, 0, fl, w, 1, STONE.frost)
        // Ropes of light from its hands to the land, taut on each tug.
        if (t > TUGS[0] - 0.25 && t < REVEAL + 0.2) {
          const rk = span(t, TUGS[0] - 0.25, TUGS[0])
          for (const side of [-1, 1]) {
            const hx = cx + side * sz.w * 0.42
            const hy = feet - sz.h * 0.45
            const ex = side < 0 ? -4 : w + 4
            const ey = Math.round(lerp(fl, h, 0.55))
            const n = 24
            let px = hx
            let py = hy
            const taut = TUGS.reduce((a, at) => a + Math.max(0, 1 - Math.abs(t - at - 0.1) * 6), 0)
            for (let i = 1; i <= n * rk; i++) {
              const u = i / n
              const sag = (1 - Math.min(1, taut)) * m * 0.06 * Math.sin(u * Math.PI)
              const x = lerp(hx, ex, u)
              const y = lerp(hy, ey, u) + sag
              line(g, px, py, x, y, GOLD[taut > 0.5 ? 0 : 2], 2)
              px = x
              py = y
            }
          }
        }
        // The three lights flying in.
        LIGHTS.forEach((t0, i) => {
          if (t < t0 || t > t0 + 0.8) return
          const at = lightAt(i, t)
          g.drawImage(glow(10, REGI[i]![1], 1.3, 0.8), Math.round(at.x) - 10, Math.round(at.y) - 10)
          ellipse(g, at.x, at.y, 2, 2, REGI[i]![0])
        })
        // The colossus: frosted stone, asleep; the three lights' glow in it; waking from its feet up.
        if (t < REVEAL) {
          drawSprite(g, p.mon, cx, feet, { sil: STONE.frost })
          recolour(g, p.mon, cx, feet, '#5a6c80', 0)
          const absorbed = LIGHTS.filter((t0) => t > t0 + 0.8).length
          if (absorbed > 0) {
            const gr = Math.round(m * (0.08 + absorbed * 0.03)) & ~1
            const pul = 0.5 + 0.3 * Math.sin(t * 5)
            g.drawImage(glow(gr, GOLD[2], 1.6, pul), cx - gr, my - gr)
          }
          const wq = ease.inQ(span(t, T_WAKE, REVEAL - 0.1))
          if (wq > 0) {
            const top = Math.round(feet - (sz.h + 2) * wq)
            recolour(g, p.mon, cx, feet, '#e0b040', top)
            rect(g, cx - sz.w * 0.5, top, sz.w, 1, GOLD[0])
          }
        } else {
          const kr = span(t, REVEAL, REVEAL + 0.4) * lerp(0.55, 0.22, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: my }, t, GOLD[2], kr)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        drawShards(g, s.shards, '#5a7a96')
        LIGHTS.forEach((t0, i) => burstRing(g, cx, my, span(t, t0 + 0.8, t0 + 1.4), m * 0.5, 2, REGI[i]![1]))
        for (const [d, c] of [
          [0, AURA[0]],
          [0.08, REGI[0][1]],
          [0.16, REGI[1][1]],
          [0.24, REGI[2][1]],
        ] as const)
          burstRing(g, cx, my, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(2.2, { freq: 500, type: 'lowpass', vol: 0.05 }))],
          // Each Regi's light: its own chirp of beeps (their cries), then the chime as it sinks in.
          ...LIGHTS.flatMap((t0, i) => [
            [
              t0,
              quiet(() =>
                [0, 1, 2, 3].forEach((n) =>
                  tone([523, 659, 784][i]! * (n % 2 ? 1.5 : 1), 0.06, {
                    type: 'square',
                    vol: 0.025,
                    at: n * 0.07,
                  }),
                ),
              ),
            ] as const,
            [t0 + 0.8, quiet(() => tone([196, 247, 294][i]!, 1, { type: 'sine', vol: 0.05 }))] as const,
          ]),
          [T_WAKE, quiet(() => tone(41, 2.2, { type: 'sawtooth', vol: 0.03, slide: 40, attack: 0.6 }))],
          [T_WAKE + 0.5, quiet(() => fxSound('legend.heart'))],
          [T_WAKE + 0.5 + 0.5, quiet(() => fxSound('legend.heart'))],
          ...TUGS.map(
            (at, i) =>
              [
                at,
                quiet(
                  () => (
                    fxSound('legend.pulse'),
                    hiss(0.5, { freq: 140 + i * 20, type: 'lowpass', vol: 0.14 })
                  ),
                ),
              ] as const,
          ),
          [
            REVEAL,
            (hud) => (quiet(() => (fxSound('legend.roar'), fxSound('legend.shatter')))(), hud.beat?.('roar')),
          ],
        ] satisfies Cue<S>[]),
    }
  },
}

let tmp: Canvas | null = null
/**
 * Its sprite in one hue, every detail kept (stone, then gold as it wakes): the frame drawn, its colour replaced and
 * its shape cut back out. Only the rows from `from` down (the part already awake).
 */
function recolour(g: G, mon: string, x: number, feet: number, hue: string, from: number) {
  const f = spriteFrame(mon)
  if (!f) return
  if (!tmp || tmp.width < f.width || tmp.height < f.height) tmp = canvas(f.width, f.height)
  const t = tmp.g
  t.globalCompositeOperation = 'source-over'
  t.clearRect(0, 0, tmp.width, tmp.height)
  t.drawImage(f, 0, 0)
  t.globalCompositeOperation = 'color'
  t.fillStyle = hue
  t.fillRect(0, 0, f.width, f.height)
  t.globalCompositeOperation = 'destination-in'
  t.drawImage(f, 0, 0)
  t.globalCompositeOperation = 'source-over'
  const dx = Math.round(x - f.width / 2)
  const dy = feet - f.height
  const y0 = Math.max(0, from - dy)
  if (y0 < f.height) g.drawImage(tmp, 0, y0, f.width, f.height - y0, dx, dy + y0, f.width, f.height - y0)
}
