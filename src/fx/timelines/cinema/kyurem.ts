// Kyurem's raid entrance (docs/53): the Giant Chasm at night. A crater ringed by snowy cliffs, a dark forest on its
// floor, mist lying in it, and at the back the mouth of the cave into the deep. The cold comes out of the cave: the
// colour drains out of the world in a widening ring (everything it reaches frozen grey and white), and the falling snow
// stops in the air. In the cave mouth a void opens, blacker than the night, frost spiking round its rim; the hanging
// snow drifts into it, and two yellow eyes open inside. A wing of ice grows out of the void across the screen, spike
// upon spike, creaks, cracks — and shatters into a storm of glittering shards. Kyurem stands in the cold mist.
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
import { drawSprite, spriteSize } from '../../sprites'
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

const T_COLD = 0.9
const T_VOID = 2.2
const T_EYES = 2.85
const T_WING = 3.2
const T_CRACK = 3.95
const T_SHATTER = 4.3
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#d8f0ff', '#7ab8d8', '#2a3a5a'] as const
const ICE = { lit: '#f4fcff', face: '#c8e8f8', mid: '#8ac0dc', dark: '#4a7a9a', edge: '#ffffff' }
/** The frozen world: four greys with a blue cast, light to dark. */
const FROZEN = ['#e8f0f4', '#a8b8c4', '#64748a', '#2a3242', '#10141c'] as const

type Pt = [number, number]

interface Spike {
  /** From the void's edge, along angle a, len long, base half-width bw; it grows from t0. */
  a: number
  len: number
  bw: number
  t0: number
  /** Branches off it: at fraction f, angle offset, length. */
  kids: { f: number; da: number; len: number }[]
}

type S = {
  r: Rng
  fx: Particles
  snow: Particles
  mist: Particles
  shards: Shard[]
  scene: Canvas
  frozen: Canvas
  rays: Canvas
  wing: Spike[]
  ground: Spike[]
  shakes: [number, number, number][]
}

/** The chasm, drawn once: sky and moon, the ringing cliffs with snow on their ledges, the cave mouth, the forest. */
function chasm(
  w: number,
  h: number,
  cx: number,
  floor: number,
  cave: { y: number; rx: number; ry: number },
  r: Rng,
) {
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, h, ['#04060e', '#0a1224', '#12223a', '#1a3048']), 0, 0)
  for (let i = 0; i < Math.round(w / 4); i++)
    rect(g, r.range(0, w), r.range(0, h * 0.25), 1, 1, r() < 0.2 ? '#ffffff' : '#7a8ab0')
  // The moon, high on one side.
  const mx = Math.round(w * 0.78)
  const my = Math.round(h * 0.09)
  g.drawImage(glow(18, '#9ab8e0', 1.4, 0.5), mx - 18, my - 18)
  ellipse(g, mx, my, 7, 7, '#e8f0ff')
  ellipse(g, mx + 2, my - 1, 2, 2, '#c8d8f0')
  // The crater's far wall: a cliff across the screen, its top ragged; columns of rock, each lit on its left, snow
  // caught on short ledges.
  const wallTop = Math.round(h * 0.22)
  const tops: number[] = []
  for (let x = 0; x < w; x++)
    tops.push(Math.round(wallTop + Math.abs(Math.sin(x / 23)) * 10 + Math.sin(x / 7) * 3 + Math.sin(x / 3.1)))
  for (let x = 0; x < w;) {
    const cw = r.int(5, 11)
    const shade2 = r() < 0.5 ? '#161e2c' : '#121a26'
    for (let i = 0; i < cw && x + i < w; i++) {
      const y = tops[x + i]!
      rect(g, x + i, y, 1, floor - y, i === 0 ? '#202c3e' : i === cw - 1 ? '#0e1420' : shade2)
      rect(g, x + i, y, 1, 2, '#c8d8e8')
    }
    // Now and then a ledge: a step of rock, snow lying on it.
    for (let y = tops[x]! + r.int(8, 30); y < floor - 10; y += r.int(24, 50)) {
      const lw = r.int(4, cw * 2)
      rect(g, x, y, lw, 1, r() < 0.5 ? '#a8bccc' : '#7a8ea4')
      rect(g, x, y + 1, lw, 1, '#0a0e16')
    }
    x += cw
  }
  // The cave mouth: a dark arch in the cliff, its lip of rock and icicles.
  for (let dy = -cave.ry; dy <= 0; dy++) {
    const hw = Math.round(cave.rx * Math.sqrt(1 - (dy * dy) / (cave.ry * cave.ry)))
    rect(g, cx - hw - 3, cave.y + dy, hw * 2 + 6, 1, '#2a3446')
    rect(g, cx - hw, cave.y + dy, hw * 2, 1, '#05070c')
  }
  rect(g, cx - cave.rx, cave.y, cave.rx * 2, floor - cave.y, '#05070c')
  for (let x = -cave.rx + 2; x < cave.rx - 1; x += 3) {
    const k = 1 - Math.abs(x) / cave.rx
    const y0 = Math.round(cave.y - cave.ry * Math.sqrt(Math.max(0, 1 - (x * x) / (cave.rx * cave.rx))))
    tri(g, cx + x - 1, y0, cx + x + 1, y0, cx + x, y0 + 3 + ((x * 7) % 5) * k, '#8ab0c8')
  }
  // The forest on the crater's floor: snowy pines in two rows, the far ones smaller, a gap before the cave. Each a
  // dark cone in three tiers, a trunk, snow lying on each tier's top and its moonlit edge.
  for (const [row, s, c, snow] of [
    [floor - 4, 0.9, '#101a26', '#7a90a8'],
    [floor + 4, 1.3, '#0a121c', '#c8d8e8'],
  ] as const)
    for (let x = -6 + r.range(0, 6); x < w + 6; x += r.range(9, 15) * s) {
      if (Math.abs(x - cx) < cave.rx * (row > floor ? 1.15 : 0.95)) continue
      const ht = Math.round(r.range(16, 26) * s)
      const y = Math.round(row + r.range(-2, 3))
      rect(g, x - 1, y - 3, 2, 4, '#06080c')
      for (let k = 0; k < 3; k++) {
        const yy = y - 2 - ht + (k * ht) / 3.2
        const ww = (3 + k * 2.6) * s
        const by = yy + ht / 2.6
        tri(g, x - ww, by, x + ww, by, x, yy, c)
        // Snow on the tier: a cap on its tip, a band along its lower edge, the moonlit right flank.
        tri(g, x - ww * 0.35, yy + ht * 0.12, x + ww * 0.35, yy + ht * 0.12, x, yy, snow)
        rect(g, x - ww + 1, by - 1, ww * 2 - 2, 1, snow)
        line(g, x + 1, yy + 2, x + ww - 1, by - 1, k === 2 ? snow : c)
      }
    }
  // The ground: snow, lit by the moon, the cave's shadow on it.
  g.drawImage(dGradient(w, h - floor, ['#6a7c94', '#4a5a70', '#2a3448', '#141a26']), 0, floor)
  rect(g, 0, floor, w, 1, '#a8bccc')
  for (let i = 0; i < w; i++)
    rect(g, r.range(0, w), r.range(floor + 2, h), 1, 1, r() < 0.5 ? '#8a9cb0' : '#3a4860')
  return cv
}

/** The same picture with its colour gone: each pixel to one of the frozen greys by its brightness, dithered. */
function drain(src: Canvas): Canvas {
  const w = src.width
  const h = src.height
  const out = canvas(w, h)
  const d = src.g.getImageData(0, 0, w, h)
  const px = d.data
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const l = (px[i]! * 0.3 + px[i + 1]! * 0.55 + px[i + 2]! * 0.15) / 255
      // Brighter than it was: frost lies on everything.
      const v = Math.min(
        FROZEN.length - 1,
        Math.max(0, Math.floor((1 - Math.min(1, l * 1.9 + 0.08)) * 4 + bayer(x, y) - 0.5)),
      )
      const c = FROZEN[v]!
      px[i] = parseInt(c.slice(1, 3), 16)
      px[i + 1] = parseInt(c.slice(3, 5), 16)
      px[i + 2] = parseInt(c.slice(5, 7), 16)
    }
  out.g.putImageData(d, 0, 0)
  return out
}

/** A spike of ice from (x, y) along a, grown to q: a lit face, a shaded face, a white edge. */
function spike(g: G, x: number, y: number, a: number, len: number, bw: number, q: number) {
  if (q <= 0) return
  const L = len * q
  const tx = x + Math.cos(a) * L
  const ty = y + Math.sin(a) * L
  const nx = -Math.sin(a) * bw
  const ny = Math.cos(a) * bw
  tri(g, x + nx, y + ny, x, y, tx, ty, ICE.face)
  tri(g, x - nx, y - ny, x, y, tx, ty, ICE.dark)
  line(g, x, y, tx, ty, ICE.lit)
  line(g, x + nx, y + ny, tx, ty, ICE.mid)
}

export const kyuremCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const feet = Math.round(h * 0.63)
    const floor = Math.round(h * 0.66)
    const sz = spriteSize(p.mon)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const cave = {
      y: floor - 2,
      rx: Math.round(Math.max(22, Math.min(w * 0.24, m * 0.34))),
      ry: Math.round(m * 0.34),
    }
    const vx = cx
    const vy = Math.round(feet - Math.max(30, sz.h * 0.5))
    const voidR = (t: number) =>
      Math.round(
        lerp(0, m * 0.2, ease.outBack(span(t, T_VOID, T_VOID + 0.6))) *
          (1 - span(t, T_SHATTER, REVEAL) * 0.7),
      )
    /** Where a spike of the ground's ring breaks out: spread along the floor by its lean. */
    const groundAt = (sp: Spike): Pt => [cx + (sp.a + Math.PI / 2) * cave.rx * 2.2, floor + 1]
    /** How far the cold has spread from the cave. */
    const coldR = (t: number) => ease.inQ(span(t, T_COLD, T_VOID)) * Math.hypot(w, h) * 1.05
    return {
      id: 'cinema-kyurem',
      dur: DUR,
      setup() {
        const r = rng(646)
        const scene = chasm(w, h, cx, floor, cave, r)
        // The wing: long spikes fanning out up and to the left of the void, branching; a few to the right.
        const wing: Spike[] = Array.from({ length: 11 }, (_, i) => {
          const left = i < 8
          const k = left ? i / 7 : (i - 8) / 2
          const a = left
            ? lerp(-Math.PI * 0.95, -Math.PI * 0.42, k)
            : lerp(-Math.PI * 0.3, -Math.PI * 0.05, k)
          return {
            a: a + r.range(-0.05, 0.05),
            len: m * (left ? r.range(0.45, 0.8) : r.range(0.25, 0.4)),
            bw: r.range(3, 6),
            t0: T_WING + (left ? k * 0.35 : 0.2 + k * 0.2) + r.range(0, 0.08),
            kids: Array.from({ length: r.int(1, 3) }, () => ({
              f: r.range(0.3, 0.75),
              da: (r() < 0.5 ? -1 : 1) * r.range(0.4, 0.8),
              len: m * r.range(0.1, 0.22),
            })),
          }
        })
        // Ice breaking out of the ground in a ring round the cave mouth.
        const ground: Spike[] = Array.from({ length: 9 }, (_, i) => ({
          a: -Math.PI / 2 + (i - 4) * 0.12 + r.range(-0.05, 0.05),
          len: m * r.range(0.08, 0.16),
          bw: r.range(2, 4),
          t0: T_WING + 0.1 + Math.abs(i - 4) * 0.06,
          kids: [],
        }))
        return {
          r,
          fx: new Particles(),
          snow: new Particles(),
          mist: new Particles(),
          shards: [],
          scene,
          frozen: drain(scene),
          rays: canvas(w, h),
          wing,
          ground,
          shakes: p.short
            ? []
            : [
                [T_WING, 0.9, 1],
                [T_CRACK, 0.35, 2],
                [T_SHATTER, 0.7, 5],
                [REVEAL, 0.5, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.mist.update(dt)
        stepShards(s.shards, dt, { g: 90, drag: 0.6, floor: h + 20 })
        // Snow: falling, then stopped in the air by the cold, then drawn into the void.
        const cr = coldR(t)
        for (const f of s.snow.list) {
          if (f.home) continue
          if (Math.hypot(f.x - vx, f.y - vy) < cr && f.vy !== 0) {
            f.vx = 0
            f.vy = 0
            f.life = 99
          }
          if (t > T_VOID + 0.3 && f.vy === 0 && r() < 0.03) f.home = { x: vx, y: vy, k: 300 }
        }
        // The flakes that never froze fall on; frozen ones simply hang until the void takes them.
        s.snow.update(dt)
        if (t < T_COLD + 0.8 && r() < 0.9 * many)
          s.snow.add({
            x: r.range(-10, w + 10),
            y: -4,
            vx: r.range(-4, 4),
            vy: r.range(12, 22),
            life: 20,
            size: r() < 0.3 ? 2 : 1,
            shape: 'flake',
            colors: ['#ffffff'],
          })
        // The void's rim: frost growing round it, the air's light pulled in.
        if (t > T_VOID && t < T_SHATTER && r() < 0.8 * many) {
          const a = r() * Math.PI * 2
          const d = r.range(m * 0.3, m * 0.6)
          s.fx.add({
            x: vx + Math.cos(a) * d,
            y: vy + Math.sin(a) * d,
            home: { x: vx, y: vy, k: 260 },
            life: 1,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#c8e8f8'],
          })
        }
        // The wing shatters: every spike breaks into shards along its length.
        if (within(t, T_SHATTER, T_SHATTER + dt)) {
          for (const sp of [...s.wing, ...s.ground]) {
            const base: Pt = s.ground.includes(sp) ? groundAt(sp) : [vx, vy]
            const n = Math.round((sp.len / 8) * many) + 2
            for (let i = 0; i < n; i++) {
              const f = (i + 0.5) / n
              const x = base[0] + Math.cos(sp.a) * sp.len * f
              const y = base[1] + Math.sin(sp.a) * sp.len * f
              const sh = makeShard(r, x, y, r.range(70, 180), r() < 0.5 ? ICE.face : ICE.mid, ICE.edge, 0.3)
              sh.vx += (x - vx) * 1.5
              sh.vy += (y - vy) * 1.2
              sh.life = r.range(1.2, 2.2)
              s.shards.push(sh)
            }
          }
          for (let i = 0; i < 80 * many; i++) {
            const a = r() * Math.PI * 2
            const v = r.range(40, 200)
            s.fx.add({
              x: vx,
              y: vy,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2,
              life: r.range(0.6, 1.4),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'px',
              colors: ['#ffffff', '#d8f0ff', '#7ab8d8'],
            })
          }
        }
        // Its cold breath after: frost clouds rolling off it.
        if (t > T_SHATTER + 0.1 && r() < 0.35 * many)
          s.mist.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h * 0.4),
            vx: r.range(-20, 20),
            vy: -r.range(2, 10),
            life: 1.2,
            size: r.int(2, 4),
            shape: 'smoke',
            density: 0.25,
            colors: ['#e8f4ff', '#c8d8e8'],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 50 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(50, 170)
            s.fx.add({
              x: cx,
              y: feet - 30,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [...AURA],
            })
          }
        if (t > REVEAL && r() < 0.3 * many)
          s.fx.add({
            x: r.range(0, w),
            y: -2,
            vx: r.range(-6, 6),
            vy: r.range(14, 24),
            life: 10,
            size: 1,
            shape: 'flake',
            colors: ['#ffffff'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#04060e'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.scene, 0, 0)
        // The colour draining away from the cave in a widening ring; frost at its edge.
        const cr = coldR(t)
        if (cr > 0) {
          for (let y = 0; y < h; y++) {
            const dy = y - vy
            if (Math.abs(dy) >= cr) continue
            const hw = Math.round(Math.sqrt(cr * cr - dy * dy))
            const a = Math.max(0, vx - hw)
            const b = Math.min(w, vx + hw)
            if (b > a) g.drawImage(s.frozen, a, y, b - a, 1, a, y, b - a, 1)
            if (t < T_VOID) {
              rect(g, vx - hw - 1, y, 2, 1, (y >> 1) % 3 ? '#ffffff' : '#c8e8f8')
              rect(g, vx + hw - 1, y, 2, 1, (y >> 1) % 3 ? '#ffffff' : '#c8e8f8')
            }
          }
        }
        // Mist lying on the crater floor, drifting: thin dithered bands.
        for (let k = 0; k < 5; k++) {
          const y = floor - 8 + k * 6
          const x = Math.round(((t * (6 + k * 3) + k * 61) % (w + 140)) - 140)
          const P = pattern(g, k % 2 ? '#8a9cb0' : '#6a7c94', 4 - (k % 2))
          rect(g, x, y, 130, 3, P)
          rect(g, x + 26, y - 2, 70, 2, P)
          rect(g, x - w * 0.6, y + 2, 90, 2, P)
        }
        s.mist.draw(g)
        // The void: a hole of nothing, frost spiking round its rim; eyes opening in it.
        const vr = voidR(t)
        if (vr > 0) {
          g.drawImage(glow(vr + 14, '#c8e8f8', 1.6, 0.6), vx - vr - 14, vy - vr - 14)
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + 0.2
            const L = vr * (0.3 + 0.25 * ((i * 7) % 3))
            spike(
              g,
              vx + Math.cos(a) * vr * 0.85,
              vy + Math.sin(a) * vr * 0.85,
              a,
              L,
              2,
              span(t, T_VOID + 0.2, T_VOID + 0.7),
            )
          }
          ellipse(g, vx, vy, vr, vr, '#000000')
          ellipse(g, vx, vy, vr, vr, pattern(g, '#0a1020', 2))
          if (t > T_EYES && t < T_SHATTER) {
            // Two eyes, slits widening; a blink.
            const open = span(t, T_EYES, T_EYES + 0.25) * (within(t, 3.6, 3.68) ? 0 : 1)
            const eh = Math.max(1, Math.round(open * 2))
            const ex = Math.max(4, Math.round(vr * 0.35))
            for (const sd of [-1, 1]) {
              rect(g, vx + sd * ex - 2, vy - 2, 4, eh, '#ffe040')
              rect(g, vx + sd * ex - 1, vy - 2, 2, 1, '#ffffff')
            }
            g.drawImage(glow(8, '#ffe040', 1.5, 0.35 * open), vx - ex - 8, vy - 10)
            g.drawImage(glow(8, '#ffe040', 1.5, 0.35 * open), vx + ex - 8, vy - 10)
          }
        }
        // The ice wing growing out of the void, and the ice breaking out of the ground; cracks before it goes.
        if (t >= T_WING && t < T_SHATTER) {
          for (const sp of s.ground) {
            const q = ease.outC(span(t, sp.t0, sp.t0 + 0.25))
            const [gx, gy] = groundAt(sp)
            spike(g, gx, gy, sp.a, sp.len, sp.bw, q)
          }
          for (const sp of s.wing) {
            const q = ease.outC(span(t, sp.t0, sp.t0 + 0.4))
            const bx = vx + Math.cos(sp.a) * vr * 0.7
            const by = vy + Math.sin(sp.a) * vr * 0.7
            spike(g, bx, by, sp.a, sp.len, sp.bw, q)
            for (const k of sp.kids) {
              const kq = span(q, k.f, 1) * ease.outC(span(t, sp.t0 + 0.2, sp.t0 + 0.5))
              const kx = bx + Math.cos(sp.a) * sp.len * k.f
              const ky = by + Math.sin(sp.a) * sp.len * k.f
              spike(g, kx, ky, sp.a + k.da, k.len, sp.bw * 0.6, kq)
            }
            // Cracks running down it, white.
            const cq = span(t, T_CRACK, T_SHATTER)
            if (cq > 0) {
              const n = Math.round(6 * cq) + 1
              for (let i = 1; i <= n; i++) {
                const f = i / 7
                const x = bx + Math.cos(sp.a) * sp.len * f
                const y = by + Math.sin(sp.a) * sp.len * f
                const da = sp.a + Math.PI / 2
                line(
                  g,
                  x - Math.cos(da) * sp.bw,
                  y - Math.sin(da) * sp.bw,
                  x + Math.cos(da) * sp.bw,
                  y + Math.sin(da) * sp.bw,
                  '#ffffff',
                )
              }
            }
          }
          // The wing's glint, sweeping out along it.
          const gq = span(t, T_WING + 0.4, T_CRACK)
          if (gq > 0 && gq < 1) {
            const sp = s.wing[3]!
            const x = vx + Math.cos(sp.a) * sp.len * gq
            const y = vy + Math.sin(sp.a) * sp.len * gq
            rect(g, x - 4, y, 9, 1, '#ffffff')
            rect(g, x, y - 4, 1, 9, '#ffffff')
          }
        }
        // Out of the void, after the shatter: its silhouette in the cold mist, then itself.
        if (t >= T_SHATTER && t < REVEAL) {
          const q = ease.outC(span(t, T_SHATTER, REVEAL))
          drawSprite(g, p.mon, cx, feet, {
            sil: '#141c2a',
            outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[2],
            alpha: lerp(0.5, 1, q),
          })
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.5) * lerp(0.75, 0.3, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: feet - 30 }, t, AURA[3], k)
          g.drawImage(s.rays, 0, 0)
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: t < REVEAL + 1.6 ? (Math.floor(t * 8) % 2 ? AURA[1] : AURA[2]) : undefined,
          })
          ;[AURA[0], AURA[1], AURA[2]].forEach((c, i) =>
            burstRing(
              g,
              cx,
              feet - 30,
              span(t, REVEAL + i * 0.12, REVEAL + i * 0.12 + 0.6),
              Math.max(w, h) * 0.75,
              3,
              c,
            ),
          )
        }
        drawShards(g, s.shards, '#2a3a5a')
        s.snow.draw(g)
        s.fx.draw(g)
        g.restore()
        if (within(t, T_SHATTER, T_SHATTER + 0.25))
          screenFlash(g, '#f4fcff', 0.7 * (1 - span(t, T_SHATTER, T_SHATTER + 0.25)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.8 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        // The dark of the void deepening the whole picture while it's open.
        if (t > T_VOID && t < T_SHATTER) wash(g, '#000000', 0.2 * span(t, T_VOID, T_VOID + 0.5), 8)
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.1, quiet(() => hiss(2.0, { freq: 500, q: 2, vol: 0.02 }))],
          [
            T_COLD,
            quiet(
              () => (
                hiss(1.3, { freq: 6000, q: 6, slide: -3000, vol: 0.03 }),
                tone(1760, 1.2, { type: 'sine', vol: 0.015, slide: -800 })
              ),
            ),
          ],
          [T_VOID, quiet(() => tone(41, 2.0, { type: 'sine', vol: 0.12 }))],
          [T_VOID + 0.05, quiet(() => tone(82, 1.4, { type: 'sawtooth', vol: 0.02, slide: -40 }))],
          [T_EYES, quiet(() => tone(196, 0.5, { type: 'square', vol: 0.02, slide: -60 }))],
          ...[0, 0.12, 0.24, 0.36].map(
            (d, i) =>
              [T_WING + d, quiet(() => tone(2637 - i * 220, 0.15, { type: 'triangle', vol: 0.02 }))] as const,
          ),
          [T_WING, quiet(() => hiss(0.9, { freq: 3000, q: 3, vol: 0.04 }))],
          ...[0, 0.13, 0.24].map(
            (d) => [T_CRACK + d, quiet(() => hiss(0.08, { freq: 5000, vol: 0.06 }))] as const,
          ),
          [4.1, quiet(() => fxSound('legend.heart'))],
          [
            T_SHATTER,
            quiet(() => {
              hiss(1.0, { freq: 5000, slide: -3500, vol: 0.12 })
              for (let i = 0; i < 8; i++)
                tone(2000 + i * 410, 0.08, { type: 'triangle', vol: 0.02, at: 0.05 + i * 0.06 })
            }),
          ],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}
