// Moltres's raid entrance (docs/53): the heart of Mt. Ember. A caldera under a sky of ash, black rock walls lit from
// below, a lake of lava with its crust drifting, embers rising, the air above it shimmering. The mountain shakes: rocks
// break off the walls and splash into the lava, bubbles swell and burst. The lake's heart melts open and blazes; then
// it erupts, a pillar of fire to the sky with a dark shape rising inside it. The pillar parts into two wings of flame
// sweeping out, and the reveal throws a ring of fire across the screen. Moltres hovers over the lava, burning.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  line,
  pattern,
  ease,
  ellipse,
  glow,
  lerp,
  Particles,
  rect,
  rng,
  shade,
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
  makeShard,
  stepShards,
  tri,
  wobble,
  type Cinema,
  type CinemaParams,
  type Shard,
  inOrder,
} from './kit'

const QUAKES = [1.2, 1.95, 2.5] as const
const T_MELT = 2.7
const T_ERUPT = 3.45
const T_WINGS = 4.0
const REVEAL = 4.45
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'] as const
/** Fire, hottest first. */
const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const

interface Layout {
  cx: number
  lava: number
  feet: number
}

type S = {
  r: Rng
  fx: Particles
  amb: Particles
  rocks: Shard[]
  sky: Canvas
  walls: Canvas
  crust: Canvas
  rays: Canvas
  bubbles: { x: number; y: number; at: number; r: number }[]
  shakes: [number, number, number][]
}

/** The caldera, still: an ash sky glowing low, far ridges with lava streams, the near walls lit from below. */
function walls(w: number, h: number, L: Layout, r: Rng): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const { lava, cx } = L
  // Ash clouds hanging over the crater, their undersides lit by the lava.
  for (let i = 0; i < Math.round(w / 12); i++) {
    const x = r.range(-20, w + 20)
    const y = r.range(h * 0.04, h * 0.3)
    const rx = Math.round(r.range(16, 36))
    const ry = Math.round(r.range(4, 8))
    ellipse(g, x, y + 2, rx, ry, '#5a1a0a')
    ellipse(g, x, y, rx, ry, y > h * 0.18 ? '#24090a' : '#160606')
  }
  // Far ridge, the crater's other side, streams of lava down it.
  const ridge: number[] = []
  for (let x = 0; x < w; x++)
    ridge.push(
      Math.round(lava - h * 0.16 - Math.sin(x / 23) * 6 - Math.sin(x / 7 + 2) * 2 - Math.abs(x - cx) * 0.05),
    )
  for (let x = 0; x < w; x++) {
    rect(g, x, ridge[x]!, 1, lava - ridge[x]!, '#1c0806')
    rect(g, x, ridge[x]!, 1, 1, '#5a1a0a')
  }
  for (let k = 0; k < Math.max(2, Math.round(w / 70)); k++) {
    let x = Math.round(r.range(w * 0.1, w * 0.9))
    for (let y = ridge[x]! + 1; y < lava; y++) {
      x += r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0
      rect(g, x, y, 1, 1, y % 3 ? '#ff6a1e' : '#ffbe2e')
    }
  }
  // Near walls each side: jagged black rock, their edges facing the lava lit orange.
  for (const side of [-1, 1]) {
    const reach = Math.round(Math.max(30, w * 0.26))
    for (let i = 0; i < reach; i++) {
      const x = side < 0 ? i : w - 1 - i
      const k = i / reach
      const top = Math.round(h * 0.08 + k * k * lava * 0.85 + Math.sin(i * 1.7) * 4 + (i % 9 === 0 ? -5 : 0))
      rect(g, x, top, 1, lava - top + 2, '#100403')
      rect(g, x, top, 1, 2, '#c4521a')
      // Rock strata catching light lower down.
      for (let y = top + 6; y < lava; y += 7 + ((i * 3) % 5)) if ((i + y) % 4) rect(g, x, y, 1, 1, '#3a1208')
    }
  }
  // A basalt spire each side, nearer.
  for (const side of [-1, 1]) {
    const x = Math.round(cx + side * Math.max(hw(w), w * 0.36))
    const top = Math.round(lava - h * 0.3)
    tri(g, x - 7, lava + 2, x + 7, lava + 2, x + side * 2, top, '#140504')
    tri(g, x - side * 7, lava + 2, x + side * 2, top, x, lava + 2, '#2a0a06')
    rect(g, x + side * 2, top, 1, 3, '#ff8a1e')
  }
  return cv
}
const hw = (w: number) => Math.min(70, w * 0.3)

/** The lava's crust: plates in the dark with glowing seams between them, wider than the screen so it can drift. */
function crust(w: number, h: number, r: Rng): Canvas {
  // A jittered grid, not random points: no two plates melt into one big bright patch.
  const seeds: (readonly [number, number])[] = []
  for (let y = 0, row = 0; y < h + 7; y += 7, row++)
    for (let x = 0; x < w + 16; x += 16) seeds.push([x + (row % 2) * 8 + r.range(-7, 7), y + r.range(-3, 3)])
  return shade(w, h, (x, y) => {
    let d1 = Infinity
    let d2 = Infinity
    for (const [sx, sy] of seeds) {
      const d = (sx - x) ** 2 + ((sy - y) * 2.2) ** 2
      if (d < d1) {
        d2 = d1
        d1 = d
      } else if (d < d2) d2 = d
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1)
    if (edge < 0.8) return '#ffe08a'
    if (edge < 1.8) return bayer(x, y) < 0.6 ? '#ff8a1e' : '#c4381a'
    if (edge < 3) return bayer(x, y) < 0.4 ? '#a8281a' : '#4a1008'
    return bayer(x, y) < 0.15 ? '#5a160a' : '#2a0905'
  })
}

export const moltresCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const L: Layout = { cx, lava: Math.round(h * 0.72), feet: Math.round(h * 0.6) }
    const { lava } = L
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const many = p.short ? 0.4 : 1
    const sz = spriteSize(p.mon)
    const fire = (P: Particles, x: number, y: number, vx: number, vy: number, life = 0.7, size = 2) =>
      P.add({ x, y, vx, vy, life, size, size1: 0, shape: 'sq', colors: [...FIRE] })
    return {
      id: 'cinema-moltres',
      dur: DUR,
      setup() {
        const r = rng(146)
        const bubbles: S['bubbles'] = []
        for (let i = 0; i < 9; i++)
          bubbles.push({
            x: Math.round(r.range(w * 0.12, w * 0.88)),
            y: Math.round(r.range(lava + 4, h - 6)),
            at: r.range(1.0, 3.3),
            r: r.int(3, 6),
          })
        return {
          r,
          fx: new Particles(),
          amb: new Particles(),
          rocks: [],
          sky: dGradient(w, lava, ['#080202', '#1c0604', '#3a0c06', '#6a1a08']),
          walls: walls(w, h, L, r),
          crust: crust(Math.round(w * 2.4) + 64, Math.round((h - lava) * 1.3), r),
          rays: canvas(w, h),
          bubbles,
          shakes: p.short
            ? []
            : [
                ...QUAKES.map((q, i) => [q, 0.45, 1 + i] as [number, number, number]),
                [T_ERUPT, 0.9, 4],
                [REVEAL, 0.7, 4],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.amb.update(dt)
        stepShards(s.rocks, dt, { floor: lava + 3 })
        // Ash falling, embers rising, all through.
        if (r() < 0.4 * many)
          s.amb.add({
            x: r.range(0, w),
            y: -2,
            vx: r.range(-6, 2),
            vy: r.range(8, 16),
            life: 9,
            size: 1,
            shape: 'px',
            colors: ['#5a4a48', '#3a302e'],
          })
        if (r() < (t > REVEAL ? 0.9 : 0.5) * many)
          s.amb.add({
            x: r.range(0, w),
            y: lava + r.range(0, 6),
            vx: r.range(-6, 6),
            vy: -r.range(16, 40),
            life: r.range(2, 3.5),
            size: 1,
            shape: 'sq',
            colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#a8281a'],
          })
        // Rocks breaking off the walls at each quake, splashing into the lava.
        for (const q of QUAKES)
          if (t >= q && t - dt < q)
            for (let i = 0; i < 5 * many + 2; i++) {
              const side = r() < 0.5 ? -1 : 1
              const rk = makeShard(
                r,
                side < 0 ? r.range(4, w * 0.2) : r.range(w * 0.8, w - 4),
                r.range(h * 0.1, lava * 0.6),
                40,
                '#1c0806',
                '#ff8a1e',
                0,
              )
              rk.vx = -side * r.range(10, 40)
              rk.vy = r.range(-20, 10)
              rk.r = r.range(2, 5)
              rk.life = 2
              s.rocks.push(rk)
            }
        for (const rk of s.rocks)
          if (rk.down && rk.life > 0.2 && rk.age < rk.life - 0.1) {
            // A splash where it hits, then it sinks.
            for (let i = 0; i < 6; i++) fire(s.fx, rk.x, lava, r.range(-30, 30), -r.range(30, 80), 0.5, 1)
            rk.life = 0
          }
        // Bubbles bursting: drops of lava thrown up.
        for (const b of s.bubbles)
          if (t >= b.at + 0.5 && t - dt < b.at + 0.5)
            for (let i = 0; i < 8; i++) fire(s.fx, b.x, b.y, r.range(-30, 30), -r.range(40, 90), 0.6, 1)
        // The eruption: a column of fire roaring up.
        if (t > T_ERUPT && t < T_WINGS + 0.2)
          for (let i = 0; i < 6 * many + 2; i++)
            fire(
              s.fx,
              cx + r.range(-10, 10),
              lava,
              r.range(-12, 12),
              -r.range(220, 340),
              r.range(0.4, 0.8),
              r.int(2, 4),
            )
        // The wings: two arcs of fire sweeping out from its shoulders.
        if (t > T_WINGS && t < REVEAL) {
          const q = span(t, T_WINGS, REVEAL)
          for (const side of [-1, 1])
            for (let i = 0; i < 5 * many + 1; i++) {
              const a = -Math.PI / 2 + side * lerp(0.2, 1.5, q) + r.range(-0.15, 0.15)
              const R = r.range(10, 40 + 50 * q)
              fire(
                s.fx,
                cx + Math.cos(a) * R,
                L.feet - 34 + Math.sin(a) * R * 0.7,
                side * r.range(30, 90),
                -r.range(10, 50),
                0.45,
                r.int(2, 3),
              )
            }
        }
        if (t >= REVEAL && t - dt < REVEAL)
          for (let k = 0; k < 70 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            fire(s.fx, cx, L.feet - 30, Math.cos(a) * v, Math.sin(a) * v, r.range(0.5, 1), r.int(1, 3))
          }
        // Burning: flames off its body as it hovers.
        if (t > REVEAL && r() < 0.9 * many)
          for (let i = 0; i < 2; i++)
            fire(
              s.fx,
              cx + r.range(-sz.w * 0.45, sz.w * 0.45),
              L.feet - r.range(sz.h * 0.4, sz.h),
              r.range(-8, 8),
              -r.range(20, 50),
              r.range(0.3, 0.6),
              r.int(1, 2),
            )
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#080202'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // Above the lava, the heat makes it all shimmer.
        g.drawImage(s.sky, 0, 0)
        wobble(g, s.walls, w, 0, lava, t, 1, 7, 5)
        // The lava: its crust drifting, its glow breathing; the heart melting open and blazing.
        drawLava(g, s.crust, w, h, lava, t)
        rect(g, 0, lava, w, 1, '#ffe08a')
        const melt = ease.outC(span(t, T_MELT, T_ERUPT))
        if (melt > 0) {
          // The crust melting from the middle: rings of molten light, their edges dithered.
          const mr = Math.round(lerp(4, Math.min(w * 0.3, 80), melt))
          const ry = (k: number) => Math.max(1, Math.round(mr * k * 0.2))
          ellipse(g, cx, lava + 5, Math.round(mr * 1.15), ry(1.15), pattern(g, '#ff8a1e', 7))
          ellipse(g, cx, lava + 5, mr, ry(1), '#e0501e')
          ellipse(g, cx, lava + 5, Math.round(mr * 0.8), ry(0.8), pattern(g, '#ffbe2e', 10))
          ellipse(g, cx, lava + 4, Math.round(mr * 0.55), ry(0.55), '#ffbe2e')
          ellipse(g, cx, lava + 4, Math.round(mr * 0.3), ry(0.3), pattern(g, '#fff6c8', 12))
        }
        // Bubbles swelling.
        for (const b of s.bubbles) {
          const q = span(t, b.at, b.at + 0.5)
          if (q > 0 && q < 1) {
            const rr = Math.max(1, Math.round(b.r * q))
            ellipse(g, b.x, b.y - (rr >> 1), rr, Math.max(1, rr - 1), '#ff8a1e')
            rect(g, b.x - 1, b.y - rr, 2, 1, '#fff6c8')
          }
        }
        // The light of the lava on everything: more as the heart opens.
        const heat = Math.max(melt, t > T_ERUPT ? 1 : 0)
        if (heat > 0) {
          const gr = Math.round(lerp(20, Math.min(w, h) * 0.55, heat))
          g.drawImage(glow(gr, '#ff8a1e', 1.2, (t > REVEAL ? 0.3 : 0.5) * heat), cx - gr, lava - gr)
        }
        drawShards(g, s.rocks)
        s.amb.draw(g)
        // The pillar of fire, the shape rising inside it.
        if (t > T_ERUPT && t < REVEAL + 0.1) {
          const q = span(t, T_ERUPT, T_ERUPT + 0.25)
          const top = Math.round(lerp(lava, -4, ease.outC(q)))
          const fade = 1 - span(t, T_WINGS, REVEAL)
          for (let y = top; y < lava; y++) {
            const k = (y - top) / Math.max(1, lava - top)
            // Ragged and never still: each row's width jumps a little every frame or two.
            const n = (((y * 13 + Math.floor(t * 24) * 7) % 7) - 3) * 0.7
            const half = Math.round((7 + k * 7 + n + Math.sin(y / 6 + t * 24) * 2) * (0.4 + 0.6 * fade))
            for (let x = -half; x <= half; x++) {
              const e = Math.abs(x) / Math.max(1, half)
              const i = Math.min(
                FIRE.length - 1,
                Math.floor(e * 4 + bayer(x + cx, y + Math.floor(t * 30)) * 1.5 + (1 - fade) * 2),
              )
              rect(g, cx + x, y, 1, 1, FIRE[i]!)
            }
          }
          const rise = ease.outC(span(t, T_ERUPT + 0.1, T_WINGS))
          drawSprite(g, p.mon, cx, Math.round(lerp(lava + sz.h, L.feet, rise)), {
            sil: '#2a0804',
            outline: Math.floor(t * 14) % 3 ? AURA[1] : AURA[0],
          })
        }
        if (t > T_WINGS && t < REVEAL + 0.15)
          drawWings(g, cx, L.feet - 36, Math.min(w, h), ease.outC(span(t, T_WINGS, REVEAL)), t)
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.7, 0.3, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: L.feet - 30 }, t, AURA[2], k)
          g.drawImage(s.rays, 0, 0)
          const ar = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(ar, '#ff8a1e', 1.3, 0.45), cx - ar, L.feet - 30 - ar)
          const bob = Math.round(Math.sin((t - REVEAL) * 2.2) * 2)
          drawSprite(g, p.mon, cx, L.feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 10) % 2 ? AURA[1] : AURA[2],
          })
        }
        s.fx.draw(g)
        // The ring of fire: thick, from the heart of it out past the screen.
        for (const [d, c, wd] of [
          [0, FIRE[2], 6],
          [0.06, FIRE[0], 3],
          [0.16, AURA[2], 4],
        ] as const)
          burstRing(g, cx, L.feet - 30, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, wd, c)
        g.restore()
        // Before the heart opens, the dark; then the eruption's and the reveal's flashes.
        if (t < T_MELT) wash(g, '#0a0202', lerp(0.35, 0.15, span(t, 0.5, T_MELT)), 8)
        if (within(t, T_ERUPT, T_ERUPT + 0.2))
          screenFlash(g, '#ffe08a', 0.55 * (1 - span(t, T_ERUPT, T_ERUPT + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#fff6c8', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => hiss(3, { freq: 90, type: 'lowpass', vol: 0.09 }))],
          [0.4, quiet(() => tone(45, 2.5, { type: 'sine', vol: 0.07 }))],
          ...QUAKES.map(
            (q) =>
              [
                q,
                quiet(
                  () => (
                    hiss(0.6, { freq: 120, type: 'lowpass', vol: 0.14 }),
                    tone(50, 0.5, { type: 'sawtooth', vol: 0.04, slide: -15 })
                  ),
                ),
              ] as const,
          ),
          ...[1.45, 2.15, 2.6].map((q) => [q, quiet(() => hiss(0.2, { freq: 600, vol: 0.06 }))] as const),
          [T_MELT, quiet(() => hiss(0.8, { freq: 300, slide: 1500, vol: 0.06 }))],
          [3.05, quiet(() => fxSound('legend.heart'))],
          [3.3, quiet(() => fxSound('legend.heart'))],
          [
            T_ERUPT,
            quiet(() => (fxSound('fire.stream'), hiss(1.2, { freq: 200, type: 'lowpass', vol: 0.14 }))),
          ],
          [T_WINGS, quiet(() => hiss(0.5, { freq: 800, slide: 1600, vol: 0.09 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** The lava in perspective: far rows of the crust squeezed small, near ones wide, each drifting at its own pace. */
function drawLava(g: G, crust: Canvas, w: number, h: number, lava: number, t: number) {
  const lh = h - lava
  for (let y = 0; y < lh; y++) {
    const k = (y + 1) / lh
    const sy = Math.min(crust.height - 1, Math.floor(crust.height * k ** 1.5))
    const sw = w / lerp(0.45, 1.3, k)
    const sx = (crust.width - sw) / 2 + ((t * 6 * k) % 32)
    g.drawImage(crust, Math.round(sx), sy, Math.round(sw), 1, 0, lava + y, w, 1)
  }
}

/** Two wings of flame sweeping out from its shoulders: three strokes each, the hottest on top. */
function drawWings(g: G, x: number, y: number, u: number, q: number, t: number) {
  const R = lerp(8, u * 0.42, q)
  for (const side of [-1, 1])
    for (let layer = 2; layer >= 0; layer--) {
      const pts: [number, number][] = []
      for (let i = 0; i <= 14; i++) {
        const k = i / 14
        // Shoulder → up and out → the tip drooping a little, each stroke lower than the one above.
        const px = x + side * (4 + R * k)
        const py = y + layer * 5 - Math.sin(k * Math.PI * 0.8) * R * 0.55 + k * k * R * 0.25
        const jit = Math.round(Math.sin(i * 2.3 + t * 30 + layer) * 1.5)
        pts.push([px, py + jit])
      }
      for (let i = 1; i < pts.length; i++) {
        const wd = Math.max(1, Math.round((4 - layer) * (1 - i / pts.length) + 1))
        line(
          g,
          pts[i - 1]![0],
          pts[i - 1]![1],
          pts[i]![0],
          pts[i]![1],
          FIRE[Math.min(FIRE.length - 1, layer * 2 + (i > 9 ? 1 : 0))]!,
          wd,
        )
      }
    }
}
