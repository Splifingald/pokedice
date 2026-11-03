// Zygarde's raid entrance (docs/53): the depths of Terminus Cave. Black rock, columns of basalt standing in their
// hexagons, stalactites, a floor of hexagonal stone. One green light blinks on in the dark, then another, then dozens:
// Zygarde Cells, all over the walls and the columns. They drop and crawl towards the middle, and as they come the
// floor's hexagons light up ring by ring, outward, in order. The Core rises out of the middle tile; the cells whirl up
// round it in a helix, then fly into a shape that builds itself from the ground up, tile by hexagonal tile, the Core
// at its heart. The reveal: hexagonal rings and the whole floor pulsing green under it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
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
import { drawSprite, silhouette, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { AFTER_REVEAL, dGradient, dissolve, inOrder, tri, type Cinema, type CinemaParams } from './kit'

const T_BLINK = 0.45
const T_SWARM = 1.5
const T_GRID = 1.6
const T_CORE = 2.65
const T_WHIRL = 2.9
const T_BUILD = 3.6
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL
/** The floor's rings of hexagons, lighting outward. */
const RINGS = 12
const RING_DT = 0.085

const AURA = ['#ffffff', '#c8ffc8', '#3ac83a', '#145a14'] as const
const CELL = ['#ffffff', '#c8ffc8', '#5ae05a', '#2a9a2a', '#145a14'] as const
const ROCK = { ink: '#0a0a08', dark: '#16160f', mid: '#24241a', lit: '#363626', edge: '#4a4a34' }

interface Layout {
  cx: number
  hz: number
  feet: number
  /** The floor's depth at the middle tile (the perspective's scale). */
  zc: number
}

interface Cell {
  /** On the rock, where it blinks on. */
  x: number
  y: number
  on: number
  /** Where it reaches the floor, and its place in the whirl. */
  fx: number
  fy: number
  ph: number
  /** When it dives into the shape. */
  dive: number
}

type S = {
  r: Rng
  fx: Particles
  bg: Canvas
  rings: { dim: Canvas; hot: Canvas }[]
  cells: Cell[]
  tiles: { x: number; y: number; at: number }[]
  lattice: Canvas | null
  mask: Canvas | null
  tmp: Canvas | null
  stamped: number
  rays: Canvas
  shakes: [number, number, number][]
}

/** The floor in perspective: world (X, Z) to the screen, Z = 1 at the bottom edge. */
const floorAt = (L: Layout, h: number, X: number, Z: number): [number, number] => [
  L.cx + (X * (h - L.hz) * 1.25) / Z,
  L.hz + (h - L.hz) / Z,
]

/** The hexagons of the floor, flat-topped, by ring from the middle tile; each its six screen corners. */
function hexFloor(L: Layout, w: number, h: number) {
  const out: { ring: number; pts: [number, number][] }[] = []
  const rho = 0.3
  for (let q = -RINGS - 4; q <= RINGS + 4; q++)
    for (let r = -RINGS - 4; r <= RINGS + 4; r++) {
      const ring = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
      if (ring > RINGS + 3) continue
      const X = rho * 1.5 * q
      const Z = L.zc + rho * Math.sqrt(3) * (r + q / 2)
      // The far floor is left in the dark: its tiles would crush into a jumble of lines at the horizon.
      if (Z > L.zc * 1.55) continue
      const pts: [number, number][] = []
      let ok = true
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3
        const z = Z + rho * Math.sin(a)
        if (z < 0.9) ok = false
        pts.push(floorAt(L, h, X + rho * Math.cos(a), z))
      }
      if (ok && pts.some(([x, y]) => x > -10 && x < w + 10 && y < h + 10)) out.push({ ring, pts })
    }
  return out
}

/** A basalt column: a lit face and a shaded one, its hexagonal top seen from a little above. */
function column(g: G, x: number, top: number, base: number, wd: number) {
  const half = wd >> 1
  rect(g, x - half, top, half, base - top, ROCK.lit)
  rect(g, x, top, wd - half, base - top, ROCK.mid)
  rect(g, x - half, top, 1, base - top, ROCK.edge)
  rect(g, x + wd - half - 1, top, 1, base - top, ROCK.ink)
  // Joints across it, here and there.
  for (let y = top + 9 + (x % 7); y < base - 3; y += 11 + (x % 5)) rect(g, x - half, y, wd, 1, ROCK.dark)
  // The top: a flattened hexagon.
  rect(g, x - half + 2, top - 3, wd - 4, 1, ROCK.edge)
  rect(g, x - half + 1, top - 2, wd - 2, 2, '#5a5a42')
  rect(g, x - half + 2, top, wd - 4, 1, ROCK.lit)
}

function cave(
  w: number,
  h: number,
  L: Layout,
  hexes: ReturnType<typeof hexFloor>,
  sz: { w: number },
): Canvas {
  const r = rng(718)
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, L.hz, ['#050504', '#0a0a07', '#12120c', '#1a1a12']), 0, 0)
  // The back wall's rough rock: blotches lit from the left.
  for (let i = 0; i < Math.round((w * L.hz) / 140); i++) {
    const x = r.range(0, w)
    const y = r.range(0, L.hz)
    const rr = r.range(3, 9)
    ellipse(g, x, y, rr, Math.round(rr * 0.6), r() < 0.5 ? ROCK.dark : '#1e1e15')
    rect(g, x - rr + 1, y - 1, Math.max(1, rr - 2), 1, ROCK.mid)
  }
  // Basalt columns on both sides, stepping down towards the middle, a few far ones on the back wall.
  for (let i = 0; i < 9; i++) {
    const x = Math.round(L.cx + (i - 4) * Math.max(14, w * 0.09))
    if (Math.abs(x - L.cx) < sz.w * 0.6) continue
    column(g, x, Math.round(L.hz - 18 - ((i * 7) % 11)), L.hz + 2, 8)
  }
  for (const side of [-1, 1]) {
    let x = side < 0 ? 4 : w - 4
    let k = 0
    while (side < 0 ? x < L.cx - sz.w * 0.4 : x > L.cx + sz.w * 0.4) {
      const wd = 13 + ((k * 5) % 6)
      const reach = Math.abs(x - L.cx) / (w / 2)
      const top = Math.round(lerp(L.feet - 6, h * 0.14, reach ** 0.8) + ((k * 13) % 9))
      const base = Math.round(L.hz + (h - L.hz) * (0.25 + reach * 0.3))
      column(g, x, top, base, wd)
      x += side * -(wd - 1)
      k++
    }
  }
  // Stalactites from the ceiling.
  for (let i = 0; i < Math.round(w / 9); i++) {
    const x = r.range(0, w)
    const len = r.range(6, h * 0.14)
    tri(g, x - 3, 0, x + 3, 0, x + r.range(-1, 1), len, ROCK.dark)
    rect(g, x - 2, 0, 1, Math.round(len * 0.6), ROCK.mid)
  }
  // The floor: dark stone, its hexagonal seams faint until they light.
  g.drawImage(dGradient(w, h - L.hz, ['#141410', '#0e0e0a', '#080806']), 0, L.hz)
  rect(g, 0, L.hz, w, 1, '#2a2a1e')
  for (const hx of hexes)
    for (let k = 0; k < 6; k++) {
      const [x0, y0] = hx.pts[k]!
      const [x1, y1] = hx.pts[(k + 1) % 6]!
      line(g, x0, y0, x1, y1, '#22221a')
    }
  return cv
}

/** One ring of the floor's hexagons: its seams, dim (once lit, it stays) and hot (the instant it lights, filled). */
function ringLayers(w: number, h: number, hexes: ReturnType<typeof hexFloor>, ring: number) {
  const dim = canvas(w, h)
  const hot = canvas(w, h)
  for (const hx of hexes) {
    if (hx.ring !== ring) continue
    const [c0x, c0y] = hx.pts[0]!
    for (let k = 1; k < 5; k++) {
      const [ax, ay] = hx.pts[k]!
      const [bx, by] = hx.pts[k + 1]!
      tri(hot.g, c0x, c0y, ax, ay, bx, by, pattern(hot.g, CELL[3], 6))
    }
    for (let k = 0; k < 6; k++) {
      const [x0, y0] = hx.pts[k]!
      const [x1, y1] = hx.pts[(k + 1) % 6]!
      line(dim.g, x0, y0, x1, y1, '#1e6a2a')
      line(hot.g, x0, y0, x1, y1, CELL[1])
    }
  }
  return { dim, hot }
}

/** A Cell: a little green blob, its eye bright. */
function drawCell(g: G, x: number, y: number, lit: boolean) {
  x = Math.round(x)
  y = Math.round(y)
  rect(g, x - 1, y - 1, 3, 3, CELL[2])
  rect(g, x - 1, y + 1, 3, 1, CELL[3])
  rect(g, x, y, 1, 1, lit ? CELL[0] : CELL[1])
}

/** The Core: a bigger blob with feelers, a red-orange hexagon at its heart. */
function drawCore(g: G, x: number, y: number, t: number) {
  x = Math.round(x)
  y = Math.round(y)
  g.drawImage(glow(12, CELL[2], 1.3, 0.7), x - 12, y - 12)
  ellipse(g, x, y, 5, 4, CELL[3])
  ellipse(g, x, y - 1, 4, 3, CELL[2])
  rect(g, x - 2, y - 3, 2, 1, CELL[1])
  rect(g, x - 1, y - 1, 3, 3, '#ff7a2a')
  rect(g, x - 2, y, 5, 1, '#ff7a2a')
  rect(g, x, y, 1, 1, Math.floor(t * 10) % 2 ? '#fff6c8' : '#ffd23a')
  line(g, x - 2, y - 4, x - 4, y - 8, CELL[2])
  line(g, x + 2, y - 4, x + 4, y - 8, CELL[2])
}

/** A hexagon's outline, flat-topped, `wd` pixels thick. */
function hexLine(g: G, x: number, y: number, R: number, c: string, wd: number, squash = 1) {
  for (let k = 0; k < 6; k++) {
    const a0 = (k * Math.PI) / 3
    const a1 = ((k + 1) * Math.PI) / 3
    line(
      g,
      x + Math.cos(a0) * R,
      y + Math.sin(a0) * R * squash,
      x + Math.cos(a1) * R,
      y + Math.sin(a1) * R * squash,
      c,
      wd,
    )
  }
}

/** The form's tiles: a brick of little hexagons, staggered, over its whole box. */
function latticeOf(w: number, h: number): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  for (let row = 0, y = h - 5; y > -5; row++, y -= 4)
    for (let x = row % 2 ? -3 : 0; x < w; x += 6) {
      rect(g, x + 1, y, 4, 1, CELL[1])
      rect(g, x, y + 1, 6, 2, CELL[2])
      rect(g, x + 1, y + 3, 4, 1, CELL[3])
    }
  return cv
}

export const zygardeCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const hz = Math.round(h * 0.47)
    const feet = Math.round(h * 0.64)
    const L: Layout = { cx, hz, feet, zc: (h - hz) / (feet - hz) }
    const sz = spriteSize(p.mon)
    const many = p.short ? 0.45 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const heart = { x: cx, y: feet - Math.round(sz.h * 0.5) }
    /** Where the cell is at t: on the rock, crawling to the middle, whirling up, diving into the shape. */
    const cellAt = (c: Cell, t: number): [number, number] | null => {
      if (t < c.on) return null
      const drop = T_SWARM + (c.ph % 1) * 0.5
      if (t < drop) return [c.x, c.y]
      const down = span(t, drop, drop + 0.3)
      if (down < 1) return [c.x, lerp(c.y, c.fy, ease.inQ(down))]
      const crawl = ease.ioS(span(t, drop + 0.3, T_WHIRL))
      if (t < T_WHIRL) {
        const x = lerp(c.fx, cx, crawl * 0.85)
        const y = lerp(c.fy, feet, crawl * 0.85)
        // Marching, not wandering: a small sideways step in time with the rest.
        return [x + Math.sin(t * 14 + c.ph * 6) * 1, y]
      }
      const sx = lerp(c.fx, cx, 0.85)
      const sy = lerp(c.fy, feet, 0.85)
      const wq = span(t, T_WHIRL, c.dive)
      const a = c.ph * Math.PI * 2 + (t - T_WHIRL) * 7
      // The whirl narrows as it climbs.
      const R = lerp(Math.min(w * 0.42, sz.w * 1.1), sz.w * 0.45, wq)
      const ox = cx + Math.cos(a) * R
      const oy = feet - lerp(2, sz.h * (0.2 + (c.ph % 0.37) * 2), wq) + Math.sin(a) * R * 0.28
      const into = span(t, T_WHIRL, T_WHIRL + 0.35)
      if (t < c.dive) return [lerp(sx, ox, into), lerp(sy, oy, into)]
      const dq = ease.inQ(span(t, c.dive, c.dive + 0.25))
      if (dq >= 1) return null
      return [
        lerp(ox, heart.x + Math.sin(c.ph * 40) * sz.w * 0.3, dq),
        lerp(oy, heart.y + Math.cos(c.ph * 31) * sz.h * 0.35, dq),
      ]
    }
    return {
      id: 'cinema-zygarde',
      dur: DUR,
      setup() {
        const r = rng(718)
        const hexes = hexFloor(L, w, h)
        const n = Math.round(110 * many)
        const cells: Cell[] = Array.from({ length: n }, (_, i) => {
          // On the rock: the columns either side, the back wall, a few on the floor's edge.
          const side = i % 2 ? 1 : -1
          const x = cx + side * r.range(sz.w * 0.3, w * 0.5)
          const y = r.range(h * 0.12, hz + (h - hz) * 0.3)
          return {
            x,
            y,
            on: T_BLINK + (i / n) ** 1.6 * 1.1 + r.range(0, 0.08),
            fx: x,
            fy: Math.max(y, hz + r.range(4, (h - hz) * 0.5)),
            ph: r(),
            dive: T_BUILD + r.range(0, 0.9),
          }
        })
        // The shape's tiles, bottom row first: it builds from the ground up.
        const tiles: { x: number; y: number; at: number }[] = []
        for (let row = 0, y = sz.h - 5; y > -5; row++, y -= 4)
          for (let x = row % 2 ? -3 : 0; x < sz.w; x += 6)
            tiles.push({ x, y, at: T_BUILD + 0.1 + (1 - y / sz.h) * 0.85 + r.range(0, 0.12) })
        tiles.sort((a, b) => a.at - b.at)
        return {
          r,
          fx: new Particles(),
          bg: cave(w, h, L, hexes, sz),
          rings: Array.from({ length: RINGS + 1 }, (_, k) => ringLayers(w, h, hexes, k)),
          cells,
          tiles,
          lattice: null,
          mask: null,
          tmp: null,
          stamped: 0,
          rays: canvas(w, h),
          shakes: p.short ? [] : [[REVEAL, 0.6, 3]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // The shape's mask, made once the sprite is there; its tiles stamped as their time comes.
        if (!s.mask && silhouette(p.mon, '#ffffff')) {
          s.mask = canvas(sz.w, sz.h)
          s.lattice = latticeOf(sz.w, sz.h)
          s.tmp = canvas(sz.w, sz.h)
        }
        if (s.mask)
          while (s.stamped < s.tiles.length && s.tiles[s.stamped]!.at <= t) {
            const tl = s.tiles[s.stamped++]!
            rect(s.mask.g, tl.x, tl.y, 6, 4, '#ffffff')
          }
        // Green motes up the light column once the Core is up.
        if (t > T_CORE && t < REVEAL && r() < 0.8 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.3, sz.w * 0.3),
            y: feet,
            vy: -r.range(30, 70),
            life: 0.8,
            size: 1,
            shape: 'px',
            colors: [CELL[1], CELL[2], CELL[3]],
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: heart.x,
              y: heart.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1),
              size: 1,
              shape: r() < 0.5 ? 'sq' : 'plus',
              colors: [...AURA],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = ROCK.ink
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg, 0, 0)
        // The floor lighting ring by ring: hot as it lights, then a steady green seam. Again, all at once, on the
        // reveal.
        for (let k = 0; k <= RINGS; k++) {
          const at = T_GRID + k * RING_DT
          if (t < at) continue
          g.drawImage(s.rings[k]!.dim, 0, 0)
          const hot = 1 - span(t, at, at + 0.35)
          if (hot > 0) dissolve(g, s.rings[k]!.hot, hot)
          const again = REVEAL + k * 0.05
          if (t > again) dissolve(g, s.rings[k]!.hot, 1 - span(t, again, again + 0.4))
        }
        // The cave's own dark, lifting a little with the green.
        wash(g, '#000000', 0.35 * (1 - span(t, T_GRID, T_GRID + 1.2) * 0.6), 8)
        // The Core rising out of the middle tile, a column of green light under it.
        if (t > T_CORE - 0.2 && t < REVEAL) {
          const q = ease.outC(span(t, T_CORE, T_CORE + 0.8))
          const y = lerp(feet + 2, heart.y, q)
          const k = span(t, T_CORE - 0.2, T_CORE + 0.3) * (1 - span(t, REVEAL - 0.3, REVEAL))
          const cw = Math.round(sz.w * 0.3)
          rect(g, cx - cw, 0, cw * 2, feet, pattern(g, CELL[3], Math.round(k * 4)))
          rect(g, cx - (cw >> 1), 0, cw, feet, pattern(g, CELL[2], Math.round(k * 4)))
          rect(g, cx - 1, 0, 2, feet, pattern(g, CELL[1], Math.round(k * 8)))
          if (t < T_BUILD + 0.9) drawCore(g, cx, y, t)
        }
        // The shape building itself from the ground up, tile by tile, its outline flaring once it is whole.
        if (t >= T_BUILD && t < REVEAL && s.tmp && s.mask && s.lattice) {
          const tg = s.tmp.g
          tg.globalCompositeOperation = 'source-over'
          tg.clearRect(0, 0, sz.w, sz.h)
          tg.drawImage(silhouette(p.mon, '#0c3a14')!, 0, 0)
          tg.globalCompositeOperation = 'source-atop'
          tg.drawImage(s.lattice, 0, 0)
          tg.globalCompositeOperation = 'destination-in'
          tg.drawImage(s.mask, 0, 0)
          tg.globalCompositeOperation = 'source-over'
          const whole = span(t, T_BUILD + 1.05, T_BUILD + 1.15)
          if (whole > 0)
            drawSprite(g, p.mon, cx, feet, {
              sil: '#0c3a14',
              outline: Math.floor(t * 12) % 2 ? CELL[1] : CELL[2],
            })
          g.drawImage(s.tmp, cx - (sz.w >> 1), feet - sz.h)
          if (t < T_BUILD + 0.9 && t > T_BUILD) drawCore(g, heart.x, heart.y, t)
        }
        // The cells: blinking on in the dark, marching, whirling, diving in.
        for (const c of s.cells) {
          const at = cellAt(c, t)
          if (!at) continue
          const blink = t - c.on < 0.25 && Math.floor((t - c.on) * 24) % 2 === 0
          if (t - c.on < 0.5)
            g.drawImage(glow(5, CELL[2], 1.2, 0.6), Math.round(at[0]) - 5, Math.round(at[1]) - 5)
          drawCell(g, at[0], at[1], blink)
        }
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.5, 0.2, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, heart, t, CELL[3], k)
          g.drawImage(s.rays, 0, 0)
          const ar = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(ar, AURA[3], 1.5, 0.5), heart.x - ar, heart.y - ar)
          drawSprite(g, p.mon, cx, feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        // Hexagonal rings: one from the Core as it comes up, three on the reveal.
        for (const [at, c, R] of [
          [T_CORE, CELL[2], Math.min(w, h) * 0.45],
          [REVEAL, AURA[0], Math.max(w, h) * 0.8],
          [REVEAL + 0.1, AURA[1], Math.max(w, h) * 0.8],
          [REVEAL + 0.22, AURA[2], Math.max(w, h) * 0.8],
        ] as const) {
          const q = span(t, at, at + 0.6)
          if (q > 0 && q < 1) hexLine(g, heart.x, heart.y, lerp(6, R, ease.outC(q)), c, q < 0.6 ? 2 : 1)
        }
        s.fx.draw(g)
        g.restore()
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#e0ffe0', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => tone(41, 3, { type: 'sine', vol: 0.06 }))],
          [0.1, quiet(() => hiss(2.5, { freq: 180, type: 'lowpass', vol: 0.04 }))],
          ...[0, 1, 2, 3, 4, 5, 6, 7].map(
            (i) =>
              [
                T_BLINK + (i / 8) ** 1.6 * 1.1,
                quiet(() => tone(1568 + ((i * 5) % 7) * 120, 0.04, { type: 'square', vol: 0.015 })),
              ] as const,
          ),
          [T_SWARM, quiet(() => hiss(1.3, { freq: 2600, q: 3, vol: 0.025 }))],
          ...Array.from(
            { length: RINGS + 1 },
            (_, k) =>
              [
                T_GRID + k * RING_DT,
                quiet(() => tone(262 * 2 ** (k / 8), 0.12, { type: 'square', vol: 0.02 })),
              ] as const,
          ),
          [T_CORE, quiet(() => (fxSound('psychic.focus'), tone(392, 0.3, { type: 'triangle', vol: 0.04 })))],
          [T_WHIRL, quiet(() => hiss(0.8, { freq: 600, slide: 1600, vol: 0.05 }))],
          ...[0, 1, 2, 3, 4, 5].map(
            (i) =>
              [
                T_BUILD + 0.1 + i * 0.16,
                quiet(() => tone([523, 659, 784, 1047, 1319, 1568][i]!, 0.1, { type: 'square', vol: 0.025 })),
              ] as const,
          ),
          [4.45, quiet(() => fxSound('legend.heart'))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}
