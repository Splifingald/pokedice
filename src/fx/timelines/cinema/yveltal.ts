// Yveltal's raid entrance (docs/53): the Allearth Forest at golden hour. A warm valley, birds crossing the sun, a
// meadow in flower, and in the middle, on a black rock, a huge dark cocoon: Yveltal asleep. It beats, red. Then it
// feeds: threads of colour tear loose from everything (the flowers, the trees, the sun) and stream into it, and the
// world drains to ash; the birds go grey and fall. The cocoon cracks with red light and splits, a black shape inside
// unfolding its wings. Oblivion Wing: a red-black beam strikes the meadow, and from where it lands everything turns to
// stone, a crust of grey and cracks spreading over the whole valley behind a red front. The reveal: Yveltal in its
// own colours, the only colour left in a world of stone.
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
  polyline,
  rect,
  rgba,
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
  pulse,
  tri,
  type Cinema,
  type CinemaParams,
} from './kit'

/** The cocoon's heart: slow, then hungry. */
const BEATS = [0.6, 1.25, 1.8, 2.2, 2.5] as const
const T_DRAIN = 1.0
const T_CRACK = 2.55
const T_SPLIT = 2.95
const T_BEAM = 3.35
const T_STONE = 3.5
const REVEAL = 4.75
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffb0b0', '#e0303a', '#5a0a14'] as const
const RED = ['#ffffff', '#ff8a8a', '#e0303a', '#8a1420', '#2a0408'] as const
/** Stone, light to dark: what the beam leaves. */
const STONE = ['#b8b4b0', '#8e8a88', '#6a6766', '#4a4848', '#2e2d2e'] as const

/** A thread of colour torn from something in the valley and reeled into the cocoon. */
interface Thread {
  x: number
  y: number
  c: string
  t0: number
  /** How far its path bows up on the way. */
  bow: number
}

interface Layout {
  cx: number
  horizon: number
  feet: number
  /** Where the beam lands, the stone's first spot. */
  hit: { x: number; y: number }
  cocoon: { w: number; h: number }
}

type S = {
  r: Rng
  fx: Particles
  dust: Particles
  vivid: Canvas
  drained: Canvas
  stone: Canvas
  veins: [number, number][][]
  birds: { x: number; y: number; v: number; ph: number; fall: number; vy: number }[]
  threads: Thread[]
  rays: Canvas
  shakes: [number, number, number][]
}

/** The valley at golden hour: a warm sky and sun, hills, the forest's crowns, a meadow in flower, the black rock. */
function valley(w: number, h: number, L: Layout): Canvas {
  const r = rng(717)
  const cv = canvas(w, h)
  const g = cv.g
  const hz = L.horizon
  g.drawImage(dGradient(w, hz, ['#3a2a6a', '#8a4a8a', '#e07a5a', '#ffc070']), 0, 0)
  const sun = { x: Math.round(L.cx + w * 0.27), y: Math.round(hz - h * 0.13) }
  const sr = Math.round(Math.min(w, h) * 0.08)
  g.drawImage(glow(sr * 3, '#ffd23a', 1.4, 0.55), sun.x - sr * 3, sun.y - sr * 3)
  ellipse(g, sun.x, sun.y, sr, sr, '#fff3c8')
  ellipse(g, sun.x, sun.y, sr - 2, sr - 2, '#ffffff')
  // Long clouds lit from below.
  for (let i = 0; i < 6; i++) {
    const x = r.range(-20, w)
    const y = r.range(hz * 0.15, hz * 0.6)
    const len = r.range(30, 70)
    rect(g, x, y, len, 2, '#c86a7a')
    rect(g, x + 4, y + 2, len - 8, 1, '#ffb08a')
  }
  // Far hills, two layers.
  for (let x = 0; x < w; x++) {
    const y1 = Math.round(hz - 22 - Math.sin(x / 31 + 1) * 8 - Math.sin(x / 13) * 3)
    rect(g, x, y1, 1, hz - y1, '#8a5a8a')
    const y2 = Math.round(hz - 12 - Math.sin(x / 19 + 4) * 5)
    rect(g, x, y2, 1, hz - y2, '#6a4a6a')
  }
  // The forest: two rows of round crowns of uneven size, autumn-bright, lit on the sun's side, the back row darker.
  const crowns = ['#3a7a3a', '#6aa03a', '#c8a02a', '#d06a2a', '#4a8a4a', '#a8402a'] as const
  const lit = ['#6ab05a', '#a8d05a', '#ffe07a', '#ffa05a', '#7ac06a', '#e0704a'] as const
  for (const row of [0, 1])
    for (let x = -6 + row * 5; x < w + 10;) {
      const rx = Math.round(r.range(5, 10)) + row
      const ry = Math.round(r.range(5, 9)) + row * 2
      const y = hz - 3 - (row ? 0 : 6) - Math.round(r.range(0, 4))
      const k = Math.floor(r() * crowns.length)
      rect(g, x - 1, y, 2, hz - y, '#2a1a14')
      ellipse(g, x, y, rx, ry, row ? '#24402a' : '#3a3a40')
      ellipse(g, x + 1, y - 1, rx - 1, ry - 1, row ? crowns[k]! : '#5a5a5a')
      if (row) {
        ellipse(g, x + 2, y - 3, Math.max(1, rx - 4), Math.max(1, ry - 4), lit[k]!)
        ellipse(g, x + 1, y - 1, Math.max(1, rx - 4), Math.max(1, ry - 4), crowns[k]!)
      }
      x += rx + Math.round(r.range(2, 7))
    }
  rect(g, 0, hz - 2, w, 2, '#2a4a2a')
  // The meadow: green, then darker towards us, flowers all over it.
  g.drawImage(dGradient(w, h - hz, ['#7ab04a', '#4a8a3a', '#2a6a2a', '#1a4a20']), 0, hz)
  rect(g, 0, hz, w, 1, '#a8d06a')
  const petals = ['#ff5a6a', '#ffe85a', '#ffffff', '#ff9ad0', '#ffb02e', '#a87aff']
  for (let i = 0; i < Math.round((w * (h - hz)) / 45); i++) {
    const y = Math.round(hz + 2 + (h - hz - 2) * r() ** 1.2)
    const x = r.range(0, w)
    const near = (y - hz) / (h - hz)
    const ht = 1 + Math.round(near * 3)
    rect(g, x, y - ht, 1, ht, r() < 0.5 ? '#8ac85a' : '#3a7a2a')
    if (r() < 0.35) {
      const c = petals[Math.floor(r() * petals.length)]!
      if (near > 0.45) {
        rect(g, x - 1, y - ht - 1, 3, 1, c)
        rect(g, x, y - ht - 2, 1, 3, c)
        rect(g, x, y - ht - 1, 1, 1, '#fff6c8')
      } else rect(g, x, y - ht, 1, 1, c)
    }
  }
  // A stream winding down the meadow, the sky in it.
  for (let y = hz + 2; y < h; y++) {
    const q = (y - hz) / (h - hz)
    const x = Math.round(L.cx - w * 0.3 + Math.sin(q * 5) * w * 0.08 - q * w * 0.1)
    const ww = Math.round(2 + q * 12)
    rect(g, x, y, ww, 1, (y & 3) === 0 ? '#ffd0a0' : '#7ab0d0')
  }
  // The black rock the cocoon stands on.
  const rw = Math.round(L.cocoon.w * 1.5)
  tri(g, L.cx - rw, L.feet + 6, L.cx + rw, L.feet + 6, L.cx + 3, L.feet - 6, '#1a1418')
  ellipse(g, L.cx, L.feet + 2, rw - 4, 5, '#241c22')
  rect(g, L.cx - rw + 6, L.feet - 1, rw * 2 - 12, 1, '#3a2e34')
  return cv
}

/** The valley with its colour gone: the hues pulled towards grey, a little dusk in it. */
function drain(src: Canvas): Canvas {
  const cv = canvas(src.width, src.height)
  const im = src.g.getImageData(0, 0, src.width, src.height)
  const d = im.data
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11
    d[i] = lerp(d[i]!, l * 0.92, 0.82)
    d[i + 1] = lerp(d[i + 1]!, l * 0.86, 0.82)
    d[i + 2] = lerp(d[i + 2]!, l * 0.84, 0.82)
  }
  cv.g.putImageData(im, 0, 0)
  return cv
}

/** The valley in stone: its shapes kept by their lightness, stepped to five greys, cracks over everything below. */
function petrify(src: Canvas, L: Layout, r: Rng): Canvas {
  const w = src.width
  const h = src.height
  const cv = canvas(w, h)
  const im = src.g.getImageData(0, 0, w, h)
  const d = im.data
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const l = (d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11) / 255
      // The sky is ash, not stone: flatter and paler.
      const k = y < L.horizon - 30 ? 1.2 + l * 1.2 : 4.4 - l * 5.2 + (bayer(x, y) - 0.5) * 0.9
      const [rr, gg, bb] = rgba(STONE[Math.max(0, Math.min(4, Math.round(k)))]!)
      d[i] = rr
      d[i + 1] = gg
      d[i + 2] = bb
    }
  cv.g.putImageData(im, 0, 0)
  // Cracks: dark seams branching across the ground and the trees, each with a lit lip.
  for (let i = 0; i < Math.round((w * h) / 900); i++) {
    const x = r.range(0, w)
    const y = r.range(L.horizon - 24, h)
    const a = r() * Math.PI * 2
    const len = r.range(8, 26)
    const pts = Array.from({ length: 5 }, (_, k) => {
      const q = k / 4
      return [
        x + Math.cos(a) * len * q + r.range(-2, 2),
        y + Math.sin(a) * len * q * 0.6 + r.range(-1.5, 1.5),
      ] as [number, number]
    })
    polyline(
      cv.g,
      pts.map(([px, py]) => [px, py + 1] as [number, number]),
      STONE[0],
    )
    polyline(cv.g, pts, '#1a1a1c')
  }
  return cv
}

/** Red veins inside the cocoon's shell, from its heart outward. */
function veinSet(r: Rng, L: Layout): [number, number][][] {
  const { cx, feet, cocoon } = L
  const cy = feet - cocoon.h * 0.5
  return Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4
    const pts: [number, number][] = [[cx, cy]]
    let x = cx
    let y = cy
    for (let k = 0; k < 5; k++) {
      x += Math.cos(a) * cocoon.w * 0.11 + r.range(-1.5, 1.5)
      y += Math.sin(a) * cocoon.h * 0.1 + r.range(-1.5, 1.5)
      pts.push([x, y])
    }
    return pts
  })
}

export const yveltalCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const sz = spriteSize(p.mon)
    const feet = Math.round(h * 0.6)
    const ch = Math.round(Math.min(sz.h * 0.95, h * 0.34))
    const L: Layout = {
      cx,
      horizon: Math.round(h * 0.5),
      feet,
      hit: { x: Math.round(cx - w * 0.22), y: Math.round(h * 0.84) },
      cocoon: { w: Math.round(ch * 0.52), h: ch },
    }
    const core = { x: cx, y: feet - Math.round(sz.h * 0.55) }
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    return {
      id: 'cinema-yveltal',
      dur: DUR,
      setup() {
        const r = rng(717)
        const vivid = valley(w, h, L)
        return {
          r,
          fx: new Particles(),
          dust: new Particles(),
          vivid,
          drained: drain(vivid),
          stone: petrify(vivid, L, r),
          veins: veinSet(r, L),
          birds: Array.from({ length: 6 }, (_, i) => ({
            x: -20 - i * 22 - r.range(0, 12),
            y: L.horizon * r.range(0.25, 0.7),
            v: r.range(26, 40),
            ph: r() * 6,
            fall: 0,
            vy: 0,
          })),
          threads: Array.from({ length: Math.round(34 * many) }, (_, i) => {
            const near = r() < 0.7
            return {
              x: r.range(0, w),
              y: near ? r.range(L.horizon + 6, h - 4) : r.range(L.horizon - 14, L.horizon),
              c: r.pick([
                '#ff5a6a',
                '#ffe85a',
                '#8ad05a',
                '#ffb02e',
                '#ff9ad0',
                '#a87aff',
                '#7ab0d0',
              ] as const),
              t0: lerp(T_DRAIN, T_SPLIT - 0.65, (i + r() * 0.8) / Math.round(34 * many)),
              bow: r.range(10, 40),
            }
          }),
          rays: canvas(w, h),
          shakes: p.short
            ? []
            : [
                [T_SPLIT, 0.4, 2],
                [T_BEAM + 0.1, 0.6, 4],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.dust.update(dt)
        // Birds crossing the sun; once the colour goes out of them, they drop like stones.
        for (const b of s.birds) {
          if (t > T_DRAIN + 0.9 && !b.fall && r() < dt * 3) b.fall = t
          if (b.fall) {
            b.vy += 220 * dt
            b.y += b.vy * dt
            b.x += b.v * 0.3 * dt
          } else b.x += b.v * dt
        }
        // The shell's halves flung off, splinters with them.
        if (within(t, T_SPLIT, T_SPLIT + dt))
          for (let i = 0; i < 40 * many; i++) {
            const a = -Math.PI / 2 + r.range(-1.6, 1.6)
            const v = r.range(40, 120)
            s.dust.add({
              x: cx + r.range(-L.cocoon.w * 0.4, L.cocoon.w * 0.4),
              y: feet - r.range(0, L.cocoon.h),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 260,
              life: r.range(0.6, 1.2),
              size: r.int(1, 2),
              shape: 'sq',
              colors: ['#3a2e34', '#241c22', '#8a1420'],
            })
          }
        // The stone's front: grit thrown up all along it.
        const R = stoneR(t, w, h)
        if (R > 0 && R < Math.max(w, h) * 1.4)
          for (let i = 0; i < 7 * many; i++) {
            const a = r() * Math.PI * 2
            const x = L.hit.x + Math.cos(a) * R
            const y = L.hit.y + Math.sin(a) * R * 0.6
            if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue
            s.dust.add({
              x,
              y,
              vx: Math.cos(a) * 20,
              vy: -r.range(20, 50),
              ay: 200,
              life: r.range(0.4, 0.7),
              size: 1,
              shape: 'sq',
              colors: r() < 0.3 ? ['#ff8a8a', '#e0303a'] : [STONE[0], STONE[2], STONE[3]],
            })
          }
        // Where the beam lands: rock and red sparks thrown up.
        if (within(t, T_BEAM + 0.05, T_BEAM + 0.05 + dt))
          for (let i = 0; i < 60 * many; i++) {
            const a = -Math.PI / 2 + r.range(-1.3, 1.3)
            const v = r.range(60, 180)
            s.dust.add({
              x: L.hit.x,
              y: L.hit.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              ay: 280,
              life: r.range(0.6, 1.1),
              size: r.int(1, 3),
              shape: 'sq',
              colors: r() < 0.4 ? ['#ffffff', '#ff8a8a', '#e0303a'] : [STONE[1], STONE[3], STONE[4]],
            })
          }
        // Once it is out: dark feathers of red light peeling off its wings.
        if (t > T_SPLIT && r() < 0.5 * many)
          s.fx.add({
            x: core.x + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: core.y + r.range(-sz.h * 0.3, sz.h * 0.3),
            vx: r.range(-12, 12),
            vy: r.range(-20, -6),
            life: r.range(0.6, 1.2),
            size: 2,
            size1: 0,
            shape: 'sq',
            colors: ['#ff8a8a', '#e0303a', '#8a1420', '#2a0408'],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 190)
            s.fx.add({
              x: core.x,
              y: core.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.4,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#100808'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The world: vivid, draining to ash as it feeds, then stone from where the beam lands.
        g.drawImage(s.vivid, 0, 0)
        dissolve(g, s.drained, ease.inQ(span(t, T_DRAIN, T_SPLIT)))
        const R = stoneR(t, w, h)
        if (R > 0) drawStone(g, s.stone, L.hit.x, L.hit.y, R, t, w, h)
        for (const th of s.threads) drawThread(g, th, t, cx, feet - (L.cocoon.h >> 1))
        // Birds: dark specks flapping, grey once drained, falling.
        for (const b of s.birds) {
          if (b.y > h + 4 || b.x > w + 8) continue
          const up = Math.floor(t * 8 + b.ph) % 2 === 0
          const c = b.fall ? STONE[3] : '#3a1a2a'
          const x = Math.round(b.x)
          const y = Math.round(b.y)
          if (b.fall) {
            rect(g, x - 1, y - 1, 3, 3, c)
            rect(g, x - 1, y - 1, 1, 1, STONE[1])
          } else {
            rect(g, x - 1, y, 3, 1, c)
            rect(g, x - 3, y + (up ? -1 : 1), 2, 1, c)
            rect(g, x + 2, y + (up ? -1 : 1), 2, 1, c)
            rect(g, x - 4, y + (up ? -2 : 1), 1, 1, c)
            rect(g, x + 4, y + (up ? -2 : 1), 1, 1, c)
          }
        }
        // The cocoon: whole and beating, cracking, then its halves falling away.
        const beat = Math.max(
          0,
          ...BEATS.map((b, i) => (t >= b ? (1 - span(t, b, b + 0.3)) * (0.5 + i * 0.1) : 0)),
        )
        if (t < T_SPLIT + 0.4) drawCocoon(g, s, t, L, beat)
        // What came out: a black shape unfolding its wings, red at its edges.
        if (t >= T_SPLIT && t < REVEAL) {
          const q = ease.outBack(span(t, T_SPLIT, T_SPLIT + 0.45), 1.4)
          const rise = Math.round(lerp(0, -4, span(t, T_BEAM + 0.4, REVEAL)))
          const ar = Math.round(sz.w * 0.65)
          g.drawImage(glow(ar, '#8a1420', 1.3, 0.6), core.x - ar, core.y - ar + rise)
          drawSprite(g, p.mon, cx, feet + rise, {
            sx: lerp(0.25, 1, q),
            sy: lerp(0.8, 1, q),
            sil: '#0c0406',
            outline: Math.floor(t * 12) % 3 ? RED[2] : RED[1],
          })
        }
        // Oblivion Wing: the beam, from its heart to the meadow, a dark core in a red sheath.
        if (within(t, T_BEAM - 0.15, T_BEAM + 0.45)) {
          const q = span(t, T_BEAM - 0.15, T_BEAM + 0.05)
          const end = { x: lerp(core.x, L.hit.x, q), y: lerp(core.y, L.hit.y, q) }
          const fade = 1 - span(t, T_BEAM + 0.25, T_BEAM + 0.45)
          const wd = Math.max(1, Math.round(9 * fade))
          const jit = (k: number) => Math.round(Math.sin(t * 60 + k) * 1.5)
          line(g, core.x + jit(1), core.y, end.x, end.y, RED[3], wd + 4)
          line(g, core.x, core.y, end.x + jit(2), end.y, RED[2], wd + 1)
          line(g, core.x, core.y, end.x, end.y, '#1a0204', Math.max(1, wd - 3))
          if (Math.floor(t * 30) % 2) line(g, core.x, core.y, end.x, end.y, RED[1])
          // The charge at its heart.
          g.drawImage(glow(14, RED[2], 1.2, 0.9), core.x - 14, core.y - 14)
          rect(g, core.x - 2, core.y - 2, 5, 5, '#ffffff')
        }
        burstRing(g, L.hit.x, L.hit.y, span(t, T_BEAM + 0.05, T_BEAM + 0.6), Math.max(w, h) * 0.5, 3, RED[2])
        // Before the beam: the charge drawing the red in.
        if (t > T_SPLIT + 0.2 && t < T_BEAM)
          burstRing(g, core.x, core.y, 1 - span(t, T_SPLIT + 0.2, T_BEAM), Math.min(w, h) * 0.5, 2, RED[2])
        s.dust.draw(g)
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.25, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, core, t, RED[3], k)
          g.drawImage(s.rays, 0, 0)
          const ar = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(ar, RED[3], 1.4, 0.5), core.x - ar, core.y - ar)
          const bob = Math.round(Math.sin((t - REVEAL) * 2) * 2)
          drawSprite(g, p.mon, cx, feet - 4 + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, AURA[2]],
          [0.22, '#1a0204'],
        ] as const)
          burstRing(g, core.x, core.y, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
        s.fx.draw(g)
        g.restore()
        // The light going out of the world as it feeds; darker still when it opens.
        wash(g, '#140408', 0.3 * span(t, T_DRAIN, T_SPLIT) * (1 - span(t, REVEAL, REVEAL + 0.5) * 0.5), 8)
        if (within(t, T_BEAM + 0.05, T_BEAM + 0.3))
          screenFlash(g, '#ff6a6a', 0.3 * (1 - span(t, T_BEAM + 0.05, T_BEAM + 0.3)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffe0e0', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(1.6, { freq: 900, type: 'lowpass', vol: 0.03 }))],
          ...[0.3, 0.55, 0.9].map(
            (at, i) =>
              [
                at,
                quiet(() => {
                  tone(2600 + i * 200, 0.06, { type: 'triangle', vol: 0.02 })
                  tone(3100 + i * 150, 0.05, { type: 'triangle', vol: 0.02, at: 0.08 })
                }),
              ] as const,
          ),
          ...BEATS.map((b) => [b, quiet(() => fxSound('legend.heart'))] as const),
          [
            T_DRAIN,
            quiet(() => (fxSound('nightmare.fall'), hiss(1.8, { freq: 2400, slide: -2200, vol: 0.04 }))),
          ],
          [
            T_CRACK,
            quiet(
              () => (hiss(0.15, { freq: 3800, vol: 0.06 }), tone(1400, 0.05, { type: 'square', vol: 0.02 })),
            ),
          ],
          [T_CRACK + 0.2, quiet(() => hiss(0.15, { freq: 3200, vol: 0.07 }))],
          [T_SPLIT, quiet(() => (fxSound('ug.collapse'), hiss(0.6, { freq: 500, slide: 1200, vol: 0.06 })))],
          [T_SPLIT + 0.2, quiet(() => fxSound('nightmare.charge'))],
          [
            T_BEAM,
            quiet(
              () => (fxSound('nightmare.beam'), tone(90, 0.8, { type: 'sawtooth', vol: 0.05, slide: -40 })),
            ),
          ],
          [T_STONE, quiet(() => hiss(1.1, { freq: 300, type: 'lowpass', vol: 0.12 }))],
          [T_STONE + 0.1, quiet(() => hiss(1, { freq: 1800, slide: -1400, vol: 0.04 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** How far the stone has spread from where the beam landed. */
const stoneR = (t: number, w: number, h: number) =>
  t < T_STONE
    ? 0
    : lerp(
        3,
        Math.max(w, h) * 1.5,
        ease.inQ(span(t, T_STONE, T_STONE + 1.1)) * 0.6 + span(t, T_STONE, T_STONE + 1.1) * 0.4,
      )

/** The stone world inside the spreading front, row by row, the front glowing red where it bites. */
function drawStone(g: G, stone: Canvas, cx: number, cy: number, R: number, t: number, w: number, h: number) {
  const ry = R * 0.6
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++) {
    const dy = (y - cy) / ry
    const rag = ((y * 13) % 5) - 2 + Math.sin(y * 0.7) * 2
    const hw = Math.round(R * Math.sqrt(Math.max(0, 1 - dy * dy)) + rag)
    if (hw <= 0) continue
    const x0 = Math.max(0, cx - hw)
    const x1 = Math.min(w, cx + hw)
    if (x1 > x0) g.drawImage(stone, x0, y, x1 - x0, 1, x0, y, x1 - x0, 1)
    if (R < Math.max(w, h) * 1.45) {
      const c = Math.floor(t * 20 + y) % 3 ? RED[2] : RED[1]
      rect(g, cx - hw - 1, y, 2, 1, c)
      rect(g, cx + hw - 1, y, 2, 1, c)
    }
  }
}

/** The cocoon: a dark chrysalis banded like bark, red veins beating in it, cracking, then split in two and falling. */
function drawCocoon(g: G, s: S, t: number, L: Layout, beat: number) {
  const { cx, feet, cocoon } = L
  const split = ease.inQ(span(t, T_SPLIT, T_SPLIT + 0.4))
  const top = feet - cocoon.h
  const glowR = Math.round(cocoon.h * 0.7)
  if (split < 1)
    g.drawImage(
      glow(glowR, '#8a1420', 1.5, Math.round((0.25 + beat * 0.5) * (1 - split) * 8) / 8),
      cx - glowR,
      feet - (cocoon.h >> 1) - glowR,
    )
  for (const side of [-1, 1]) {
    // Each half slides away from the middle and drops, once it splits.
    const ox = Math.round(side * split * cocoon.w * 1.2)
    const oy = Math.round(split * split * cocoon.h * 0.5)
    for (let y = 0; y < cocoon.h; y++) {
      const q = y / cocoon.h
      // Pointed at the top, full at two thirds down, rounded at the foot.
      const hw = Math.round((cocoon.w / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, q * 0.85 + 0.08)), 0.8))
      if (hw <= 0) continue
      const band = Math.floor(y / 5) % 2
      const x0 = side < 0 ? cx - hw : cx
      const ww = hw
      rect(g, x0 + ox, top + y + oy, ww, 1, band ? '#2a2026' : '#221a20')
      // The lit edge on the left, the dark one on the right: it is round.
      if (side < 0) rect(g, cx - hw + ox, top + y + oy, 2, 1, '#4a3a42')
      else rect(g, cx + hw - 2 + ox, top + y + oy, 2, 1, '#120c10')
      if (y % 5 === 0) rect(g, x0 + ox, top + y + oy, ww, 1, '#120c10')
    }
  }
  if (split > 0) return
  // The Y on its front, and the veins: dim, flaring on each beat, red-hot once it cracks.
  const hot = t > T_CRACK
  const vc = hot || beat > 0.45 ? RED[1] : beat > 0.15 ? RED[2] : RED[3]
  for (const v of s.veins) polyline(g, v, vc)
  const yy = feet - cocoon.h * 0.62
  line(g, cx, yy, cx, yy + cocoon.h * 0.3, vc, 2)
  line(g, cx, yy, cx - cocoon.w * 0.25, yy - cocoon.h * 0.2, vc, 2)
  line(g, cx, yy, cx + cocoon.w * 0.25, yy - cocoon.h * 0.2, vc, 2)
  // The cracks: red light splitting it from the top down.
  if (hot) {
    const q = span(t, T_CRACK, T_SPLIT)
    const n = Math.round(cocoon.h * q)
    for (let y = 0; y < n; y++) {
      const x = cx + Math.round(Math.sin(y * 0.9) * 2)
      rect(g, x - 1, top + y, 3, 1, RED[2])
      rect(g, x, top + y, 1, 1, '#ffffff')
    }
    const pr = Math.round(cocoon.w * 0.5 * pulse(t, T_CRACK, T_SPLIT))
    if (pr > 1) g.drawImage(glow(pr, RED[1], 1.2, 0.5), cx - pr, top + n - pr)
  }
}

/** A thread of colour: torn loose, then reeled in along a bowed path, its tail following its head into the cocoon. */
function drawThread(g: G, th: Thread, t: number, tx: number, ty: number) {
  const head = ease.inQ(span(t, th.t0, th.t0 + 0.6))
  const tail = ease.inQ(span(t, th.t0 + 0.25, th.t0 + 0.85))
  if (head <= 0 || tail >= 1) return
  const at = (q: number): [number, number] => {
    const x = lerp(th.x, tx, q)
    const y = lerp(th.y, ty, q) - Math.sin(q * Math.PI) * th.bow
    return [x, y]
  }
  const n = 10
  let [px, py] = at(tail)
  for (let i = 1; i <= n; i++) {
    const [x, y] = at(lerp(tail, head, i / n))
    // It reddens as it nears the cocoon.
    line(g, px, py, x, y, i > n * 0.7 && head > 0.6 ? RED[2] : th.c)
    px = x
    py = y
  }
  // Where it tore from: a spark of its colour.
  if (tail < 0.1) rect(g, th.x - 1, th.y - 1, 3, 3, th.c)
}
