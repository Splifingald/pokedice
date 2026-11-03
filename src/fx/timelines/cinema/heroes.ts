// Zacian's and Zamazenta's raid entrances (docs/53): the Slumbering Weald at night. Moonlight falls through a gap in
// the canopy onto the old stone dais where the hero's relic lies, fog drifting between the trunks. A howl, and the fog
// thickens: two eyes open in it, then a giant wolf's shadow walks through it and is gone. The relic wakes.
// Zacian's: the Rusted Sword trembles in the stone, its rust flaking off, and pulls itself free; a blue streak leaps
// out of the fog and takes it in its jaws, and one slash of light cuts the whole screen in two, the fog parting along
// the cut and the moon pouring in. Zamazenta's: three blows ring on the Rusted Shield, knocking its rust off; it rises
// and opens into a dome of hexagons; the fog surges in from both sides and breaks on it, then the dome bursts outward
// and sweeps the fog away as a red streak charges in from the deep. Each is revealed crowned with a glint of gold.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  pattern,
  rect,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { quad } from '../../timeline'
import { gleam } from '../legend'
import { burstRing, dGradient, tri } from './kit'
import { fogBand, hexFill, hexLine, raidCinema, scroll, shield, sword, type Raid } from './gen8kit'

const REVEAL = 4.6
const T_HOWL = 1.05
const T_EYES = 1.45
const T_STRIDE = 1.8
/** Zacian's: the sword wakes, pulls free, is caught, and the slash. */
const T_WAKE = 2.55
const T_PULL = 3.2
const T_LEAP = 3.5
const T_CATCH = 3.72
const T_SLASH = 3.95
const T_LAND = 4.3
/** Zamazenta's: the three blows, the rise, the dome, the fog's surge and the burst. */
const CLANGS = [2.45, 2.78, 3.05] as const
const T_RISE = 3.15
const T_DOME = 3.35
const T_SURGE = 3.65
const T_BURST = 4.1
const T_CHARGE = 4.12

const ZACIAN = ['#ffffff', '#c8f0ff', '#4aa8f0', '#1a3a8a'] as const
const ZAMAZENTA = ['#ffffff', '#ffd0c0', '#e0503a', '#6a1a1a'] as const
const GOLD = ['#fff6c8', '#ffd23a', '#c8901e'] as const

interface Weald {
  back: Canvas
  near: Canvas
  far: Canvas
  low: Canvas
  wall: Canvas
  /** Scratch for the fog cut in two. */
  fogs: Canvas
  ground: number
}

function trunk(
  g: G,
  x: number,
  top: number,
  bottom: number,
  wd: number,
  c: readonly [string, string, string],
) {
  const [dark, lit, ink] = c
  rect(g, x, top, wd, bottom - top, dark)
  rect(g, x, top, Math.max(1, wd >> 3), bottom - top, lit)
  rect(g, x + wd - 1, top, 1, bottom - top, ink)
  for (let y = top + 4; y < bottom - 4; y += 7) rect(g, x + 2 + ((y * 7) % Math.max(1, wd - 4)), y, 1, 3, ink)
  // Its roots flaring into the ground.
  tri(g, x - wd * 0.5, bottom, x + 2, bottom, x + 2, bottom - wd, dark)
  tri(g, x + wd - 2, bottom, x + wd * 1.5, bottom, x + wd - 2, bottom - wd, dark)
}

/** The Weald, drawn once: sky through the canopy, three depths of trunks, moon shafts, the dais and its pillars. */
function weald(s: Raid, r: Rng): Weald {
  const { w, h, cx } = s
  const ground = s.feet + 2
  const back = canvas(w, h)
  const g = back.g
  g.drawImage(dGradient(w, h, ['#03080e', '#08141e', '#0c1e2a', '#0a1820', '#060c10']), 0, 0)
  // The moon in the canopy's gap, its halo.
  const my = Math.round(h * 0.08)
  g.drawImage(glow(34, '#2a4a5a', 1.2, 0.8), cx + 6 - 34, my - 34)
  ellipse(g, cx + 6, my, 8, 8, '#e8f4f0')
  ellipse(g, cx + 9, my - 2, 2, 2, '#c8dcd8')
  // Far trunks, pale with the fog between them.
  for (let x = -6; x < w; x += r.int(14, 24))
    trunk(g, x, 0, ground - 10, r.int(4, 7), ['#16303c', '#24485a', '#10242e'])
  // Moonlight falling through the gap: three dithered shafts fanning down onto the dais.
  const shaft = pattern(g, '#9ac8d4', 2)
  for (const k of [-1, 0, 1]) {
    const x0 = cx + 6 + k * 5
    const bx = cx + k * w * 0.13
    const bw = Math.max(6, Math.round(w * 0.045))
    tri(g, x0 - 2, my, x0 + 2, my, bx + bw, ground, shaft)
    tri(g, x0 - 2, my, bx + bw, ground, bx - bw, ground, shaft)
  }
  // Mid trunks, darker.
  for (let x = -10; x < w; x += r.int(26, 40)) {
    if (Math.abs(x + 4 - cx) < w * 0.16) continue
    trunk(g, x, 0, ground - 3, r.int(7, 11), ['#0c1c26', '#1a3444', '#060e14'])
  }
  // The forest floor.
  g.drawImage(dGradient(w, h - ground, ['#14261e', '#0c1a16', '#060c0c']), 0, ground)
  rect(g, 0, ground, w, 1, '#24402e')
  for (let x = 0; x < w; x += 2) rect(g, x, ground - ((x * 7) % 3), 1, 2 + ((x * 5) % 3), '#1a3424')
  // The dais: two slabs, moss, and a broken pillar either side.
  const rw = Math.round(Math.min(w * 0.36, 70))
  ellipse(g, cx, ground + 5, rw + 4, 6, '#20282a')
  ellipse(g, cx, ground + 3, rw, 5, '#3a464a')
  ellipse(g, cx, ground + 1, rw - 5, 4, '#56666a')
  for (let x = -rw + 6; x < rw - 6; x += 3)
    rect(g, cx + x, ground - 3 + ((x * 13) % 3 === 0 ? 1 : 0), 1, 1, '#7a8a8a')
  for (let i = 0; i < 18; i++) rect(g, cx + r.int(-rw, rw), ground + r.int(1, 6), r.int(1, 3), 1, '#3a6a3a')
  for (const side of [-1, 1]) {
    const px = cx + side * (rw + 2)
    const ph = Math.round(Math.min(h * 0.16, 40)) + (side < 0 ? 4 : -6)
    rect(g, px - 5, ground - ph, 10, ph + 3, '#3a464a')
    rect(g, px - 5, ground - ph, 2, ph + 3, '#6a7a7a')
    rect(g, px + 4, ground - ph, 1, ph + 3, '#1a2224')
    tri(g, px - 5, ground - ph, px + 5, ground - ph, px + side * 3, ground - ph - 5, '#3a464a')
    for (let y = ground - ph + 6; y < ground; y += 9) rect(g, px - 4, y, 8, 1, '#2a3436')
    rect(g, px - 5, ground - 6, 10, 2, '#3a6a3a')
  }
  // The nearest trunks, black at the edges, and the canopy across the top: in front of everything.
  const near = canvas(w, h)
  const n = near.g
  for (const side of [-1, 1]) {
    const tw = Math.round(Math.max(12, w * 0.07))
    const x = side < 0 ? -4 : w - tw + 4
    trunk(n, x, 0, h, tw, ['#03070a', side < 0 ? '#14262e' : '#0a161c', '#010304'])
  }
  for (let x = -10; x < w + 10; x += 9) {
    const gap = Math.abs(x - cx - 6) < w * 0.16
    const y = gap ? -8 : Math.round(4 + Math.sin(x * 0.3) * 4 + ((x * 7) % 9))
    ellipse(n, x, y, 12, 9, '#03080a')
    if (!gap)
      for (let k = 0; k < 3; k++) rect(n, x - 6 + ((k * 5 + x) % 12), y + 7 + (k % 2), 2, 1, '#14303a')
  }
  // Ferns and roots along the bottom edge, black against the floor: the camera stands in the undergrowth.
  for (let x = -4; x < w + 4; x += r.int(7, 13)) {
    const fh = r.int(10, 22) + (Math.abs(x - cx) < w * 0.2 ? -6 : 4)
    const base = h + 2
    for (let k = -3; k <= 3; k++) {
      const tipX = x + k * 4 + r.int(-2, 2)
      const tipY = base - fh + Math.abs(k) * 3
      tri(n, x - 1, base, x + 1, base, tipX, tipY, k % 2 ? '#020605' : '#06120c')
    }
  }
  // Stepping stones leading up to the dais.
  for (let i = 0; i < 4; i++) {
    const y = Math.round(lerp(ground + 12, h - 14, i / 3.5))
    const sw = 5 + i * 2
    ellipse(g, cx + (i % 2 ? 4 : -4) * (i + 1) * 0.5, y, sw, 2 + (i >> 1), '#2a3436')
    rect(g, cx + (i % 2 ? 4 : -4) * (i + 1) * 0.5 - sw + 2, y - 1, sw, 1, '#4a5658')
  }
  const fogs = canvas(w, h)
  const wallH = Math.round(h * 0.62)
  return {
    back,
    near,
    far: fogBand(w, Math.round(h * 0.26), 11, '#2e4a58', '#1e3642', 0.6, 60),
    low: fogBand(w, Math.round(h * 0.2), 12, '#7a98a6', '#46646f', 0.6, 46),
    wall: fogBand(w, wallH, 13, '#9ab4c0', '#58788a', 0.82, 56),
    fogs,
    ground,
  }
}

/** The fogs over the Weald (far, low, and the wall once it rolls in) into one picture, for cutting or drawing. */
function fogLayer(f: Weald, s: Raid, t: number, wall: number) {
  const g = f.fogs.g
  g.clearRect(0, 0, s.w, s.h)
  scroll(g, f.low, t * 9, f.ground - Math.round(f.low.height * 0.6))
  if (wall > 0) scroll(g, f.wall, -t * 6, Math.round(s.h * 0.16), wall)
  return f.fogs
}

/**
 * A picture cut along a line and its two halves pushed apart, row by row (no canvas path: its edge would blend). The
 * cut runs from a to b; `d` how far each half has moved along the cut's normal.
 */
function cutApart(g: G, src: Canvas, a: [number, number], b: [number, number], d: number) {
  const [ax, ay] = a
  const [bx, by] = b
  const L = Math.hypot(bx - ax, by - ay)
  const nx = (by - ay) / L
  const ny = -(bx - ax) / L
  // The normal pointing into the half on the cut's right, as seen going from a to b.
  const ox = Math.round(-nx * d)
  const oy = Math.round(-ny * d)
  for (let y = 0; y < src.height; y++) {
    const xs = Math.round(ax + ((y - ay) / (by - ay)) * (bx - ax))
    const x0 = Math.max(0, Math.min(src.width, xs))
    if (x0 > 0) g.drawImage(src, 0, y, x0, 1, ox, y + oy, x0, 1)
    if (x0 < src.width) g.drawImage(src, x0, y, src.width - x0, 1, x0 - ox, y - oy, src.width - x0, 1)
  }
}

/** Two eyes opening in the fog, blinking once, closing. */
function eyes(g: G, x: number, y: number, t: number, col: string) {
  const o = span(t, T_EYES, T_EYES + 0.15) * (1 - span(t, T_EYES + 0.75, T_EYES + 0.9))
  const blink = t > T_EYES + 0.4 && t < T_EYES + 0.48
  if (o <= 0 || blink) return
  g.drawImage(glow(10, col, 1.4, 0.6 * o), x - 10, y - 10)
  for (const dx of [-5, 3]) {
    rect(g, x + dx, y, 3, 1, col)
    if (o > 0.5) rect(g, x + dx + 1, y - 1, 1, 1, '#ffffff')
  }
}

/** The giant wolf's shadow walking through the fog. */
function stride(g: G, s: Raid, f: Weald, t: number, dir: 1 | -1) {
  const q = span(t, T_STRIDE, T_STRIDE + 0.85)
  if (q <= 0 || q >= 1) return
  const x = lerp(s.cx - dir * (s.w * 0.5 + s.sz.w), s.cx + dir * (s.w * 0.5 + s.sz.w), q)
  const y = f.ground - 6 + Math.round(Math.abs(Math.sin(q * 18)) * -3)
  drawSprite(g, s.mon, x, y, { sil: '#0e1a22', sx: 1.4, sy: 1.4, flip: dir > 0 })
  // Veiled: a thin pass of the fog over it, so it is a shape in the fog, not in front of it.
  scroll(g, f.wall, -t * 6, Math.round(s.h * 0.16), 0.45)
}

type ZX = Weald & { trail: [number, number][] }

/** Where Zacian's leap is at time t: out of the fog low left, up through the sword, on to the top right. */
const leapAt = (s: Raid, t: number, top: number): [number, number] => {
  const q = span(t, T_LEAP, T_SLASH)
  const p = quad(
    { x: -20, y: s.feet - 10 },
    { x: s.cx - s.w * 0.1, y: top - 30 },
    { x: s.w + 20, y: s.h * 0.1 },
    q,
  )
  return [p.x, p.y]
}

export const zacianCinema = raidCinema<ZX>({
  id: 'cinema-zacian',
  reveal: REVEAL,
  seed: 888,
  aura: ZACIAN,
  flash: '#e8f8ff',
  rays: 0.55,
  bob: 0,
  shakes: [
    [T_PULL, 0.3, 1],
    [T_SLASH, 0.5, 4],
    [T_LAND, 0.3, 2],
    [REVEAL, 0.5, 2],
  ],
  flashes: [[T_SLASH, 0.22, '#e8f8ff', 0.7]],
  setup(s) {
    return { ...weald(s, s.r), trail: [] }
  },
  step(s, t, dt) {
    const r = s.r
    const len = swordLen(s)
    // Rust flaking off the waking sword.
    if (t > T_WAKE && t < T_PULL + 0.1 && r() < 0.7 * s.many)
      s.fx.add({
        x: s.cx + r.range(-3, 3),
        y: swordTop(s, t) + r.range(len * 0.1, len * 0.7),
        vx: r.range(-30, 30),
        vy: -r.range(10, 40),
        ay: 160,
        life: r.range(0.5, 0.9),
        size: r.int(1, 2),
        shape: 'sq',
        colors: ['#e0904a', '#b0602a', '#7a3a1a'],
      })
    // Light leaking from it as the rust goes; gold motes once it is free.
    if (t > T_WAKE + 0.3 && t < T_CATCH && r() < 0.5 * s.many)
      s.fx.add({
        x: s.cx + r.range(-6, 6),
        y: swordTop(s, t) + r.range(0, len),
        vy: -r.range(10, 30),
        life: 0.6,
        size: 1,
        shape: 'star',
        colors: [GOLD[0], GOLD[1], ZACIAN[2]],
      })
    // The slash's sparks, all along the cut.
    if (t >= T_SLASH && t - dt < T_SLASH)
      for (let i = 0; i < 70 * s.many; i++) {
        const [a, b] = cutLine(s)
        const q = r()
        s.fx.add({
          x: lerp(a[0], b[0], q),
          y: lerp(a[1], b[1], q),
          vx: r.range(-60, 60),
          vy: r.range(-60, 60),
          drag: 3,
          life: r.range(0.4, 0.9),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'star' : 'px',
          colors: ['#ffffff', ZACIAN[1], ZACIAN[2]],
        })
      }
    if (t >= T_LAND && t - dt < T_LAND) dust(s, s.feet, 26)
    if (t > REVEAL + 0.3 && r() < 0.4 * s.many) goldDust(s)
  },
  back(g, s, t) {
    const len = swordLen(s)
    g.drawImage(s.back, 0, 0)
    scroll(g, s.far, t * 4, Math.round(s.h * 0.34))
    // The moonlight pouring in once the fog is cut.
    const moon = span(t, T_SLASH + 0.1, REVEAL)
    if (moon > 0) {
      const gr = Math.round(s.m * 0.5)
      g.drawImage(glow(gr, '#5a8aa0', 1.3, 0.55 * moon), s.cx - gr, Math.round(s.h * 0.06) - gr * 0.3)
    }
    // The sword: in the stone, waking, pulled free, rising, until it is caught.
    if (t < T_CATCH) {
      const top = swordTop(s, t)
      const shake = t > T_WAKE && t < T_PULL ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
      const rust = 1 - span(t, T_WAKE, T_PULL)
      const lit = span(t, T_WAKE + 0.2, T_PULL)
      if (lit > 0) {
        const gr = Math.round(len * 0.7)
        g.drawImage(glow(gr, '#c8901e', 1.4, 0.45 * lit), s.cx - gr, top + len / 2 - gr)
      }
      g.save()
      g.beginPath()
      g.rect(0, 0, s.w, t < T_PULL ? s.ground + 1 : s.h)
      g.clip()
      sword(g, s.cx + shake, top, len, rust)
      g.restore()
      if (t < T_PULL) rect(g, s.cx - 4, s.ground, 9, 2, '#20282a')
    }
    // The fog: whole, then cut in two and parting.
    const wall = span(t, T_HOWL, T_HOWL + 0.7) * (1 - span(t, REVEAL - 0.1, REVEAL + 0.7) * 0.75)
    const fogs = fogLayer(s, s, t, wall)
    if (t < T_SLASH + 0.04) g.drawImage(fogs, 0, 0)
    else {
      const [a, b] = cutLine(s)
      const d = ease.outC(span(t, T_SLASH + 0.04, REVEAL + 0.3)) * s.m * 0.4
      // Moonlight down the gap, as wide as the fog has parted.
      const lw = Math.round(d * 1.3 * (1 - span(t, REVEAL, REVEAL + 0.8)))
      if (lw > 1) line(g, a[0], a[1], b[0], b[1], pattern(g, '#c8e8f0', 2) as string, lw)
      cutApart(g, fogs, a, b, d)
    }
    eyes(g, Math.round(s.cx - s.w * 0.22), Math.round(s.h * 0.4), t, '#8af0ff')
    stride(g, s, s, t, 1)
  },
  before(g, s, t) {
    // The leap: a blue streak out of the fog, through the sword, up out of sight.
    if (t > T_LEAP && t < T_SLASH) {
      const pts = Array.from({ length: 10 }, (_, i) => leapAt(s, t - i * 0.018, swordTop(s, T_CATCH)))
      for (let i = pts.length - 1; i > 0; i--)
        line(
          g,
          pts[i]![0],
          pts[i]![1],
          pts[i - 1]![0],
          pts[i - 1]![1],
          i < 3 ? '#ffffff' : ZACIAN[2],
          i < 5 ? 3 : 1,
        )
      const [x, y] = pts[0]!
      drawSprite(g, s.mon, x, y + s.sz.h * 0.3, {
        sx: 0.5,
        sy: 0.5,
        sil: '#0a1a3a',
        outline: ZACIAN[1],
        flip: true,
      })
    }
    drawSlash(g, s, t)
    // Down out of the parted sky, then waiting in the light.
    if (t > T_SLASH + 0.15) {
      const q = ease.inQ(span(t, T_SLASH + 0.15, T_LAND))
      const x = lerp(s.w * 0.85, s.cx, q)
      const y = lerp(-10, s.feet, q)
      drawSprite(g, s.mon, x, y, { sil: '#0a1a3a', outline: Math.floor(t * 14) % 2 ? ZACIAN[1] : ZACIAN[2] })
    }
  },
  front(g, s, t) {
    crowned(g, s, t)
    g.drawImage(s.near, 0, 0)
  },
  sounds: [
    [0.05, () => hiss(2.4, { freq: 500, type: 'lowpass', vol: 0.05 })],
    [T_HOWL, () => tone(330, 1.1, { type: 'sine', vol: 0.05, slide: 260, attack: 0.25 })],
    [T_HOWL + 0.5, () => tone(590, 0.7, { type: 'triangle', vol: 0.025, slide: -200 })],
    [T_EYES, () => tone(1568, 0.25, { type: 'sine', vol: 0.02 })],
    ...[0, 1, 2, 3].map(
      (i) => [T_STRIDE + 0.1 + i * 0.2, () => hiss(0.12, { freq: 180, vol: 0.08 })] as const,
    ),
    [T_WAKE, () => tone(220, 0.7, { type: 'sawtooth', vol: 0.025, slide: 330 })],
    ...[0, 1, 2].map(
      (i) => [T_WAKE + 0.15 + i * 0.18, () => tone(2400 + i * 300, 0.05, { vol: 0.02 })] as const,
    ),
    [
      T_PULL,
      () => (
        hiss(0.3, { freq: 2600, vol: 0.06, slide: 1600 }),
        tone(880, 0.4, { type: 'triangle', vol: 0.04 })
      ),
    ],
    [T_LEAP, () => hiss(0.4, { freq: 900, slide: 2400, vol: 0.06 })],
    [T_CATCH, () => tone(1760, 0.08, { type: 'square', vol: 0.04 })],
    [
      T_SLASH,
      () => (
        hiss(0.6, { freq: 5200, slide: -4200, vol: 0.12 }),
        tone(1319, 0.5, { type: 'triangle', vol: 0.05, slide: -500 }),
        tone(80, 0.5, { type: 'sine', vol: 0.12, slide: -30 })
      ),
    ],
    [T_LAND, () => fxSound('impact.hit')],
  ],
})

type MX = Weald & { cells: [number, number, number][]; storm: Canvas; veil: Canvas }

export const zamazentaCinema = raidCinema<MX>({
  id: 'cinema-zamazenta',
  reveal: REVEAL,
  seed: 889,
  aura: ZAMAZENTA,
  flash: '#fff0e8',
  rays: 0.55,
  bob: 0,
  shakes: [
    ...CLANGS.map((c, i) => [c, 0.2, 1 + i] as const),
    [T_SURGE + 0.25, 0.45, 3],
    [T_BURST, 0.4, 4],
    [REVEAL, 0.5, 2],
  ],
  flashes: [[T_BURST, 0.22, '#ffe8c8', 0.65]],
  setup(s) {
    // The dome's honeycomb, its cells' centres and how far each lies from the heart (they grow outward).
    const R = domeR(s)
    const cr = Math.max(5, Math.round(R / 5))
    const cells: [number, number, number][] = []
    const dx = cr * 1.5
    const dy = cr * Math.sqrt(3)
    for (let i = -8; i <= 8; i++)
      for (let j = -8; j <= 8; j++) {
        const x = i * dx
        const y = j * dy + (i % 2 ? dy / 2 : 0)
        const d = Math.hypot(x, y)
        if (d < R - cr * 0.5) cells.push([x, y, d / R])
      }
    const f = weald(s, s.r)
    return {
      ...f,
      cells,
      storm: fogBand(s.w, f.wall.height, 14, '#b8ccd4', '#6a8898', 0.7, 40),
      veil: canvas(s.w, s.h),
    }
  },
  step(s, t, dt) {
    const r = s.r
    for (const [i, c] of CLANGS.entries())
      if (t >= c && t - dt < c) {
        const [x, y] = shieldAt(s, c)
        for (let k = 0; k < (16 + i * 6) * s.many; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 110)
          s.fx.add({
            x: x + Math.cos(a) * 4,
            y: y + Math.sin(a) * 4,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 20,
            ay: 140,
            life: r.range(0.4, 0.8),
            size: r() < 0.5 ? 1 : 2,
            shape: r() < 0.5 ? 'sq' : 'px',
            colors: r() < 0.6 ? ['#e0904a', '#b0602a', '#7a3a1a'] : ['#ffffff', GOLD[1], GOLD[2]],
          })
        }
      }
    // The fog breaking on the dome: sparks round its rim.
    if (t > T_SURGE + 0.2 && t < T_BURST && r() < 0.9 * s.many) {
      const a = r.range(-Math.PI, Math.PI)
      const R = domeR(s)
      const [x, y] = domeC(s)
      s.fx.add({
        x: x + Math.cos(a) * R,
        y: y + Math.sin(a) * R,
        vx: Math.cos(a) * 30,
        vy: Math.sin(a) * 30,
        life: 0.4,
        size: 1,
        shape: 'star',
        colors: ['#ffffff', GOLD[1], ZAMAZENTA[2]],
      })
    }
    if (t >= T_LAND && t - dt < T_LAND) dust(s, s.feet, 30)
    if (t > REVEAL + 0.3 && r() < 0.4 * s.many) goldDust(s)
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    scroll(g, s.far, t * 4, Math.round(s.h * 0.34))
    const [dcx, dcy] = domeC(s)
    // The shield: leaning on the dais, ringing under three blows, rising and growing.
    if (t < T_BURST) {
      const [x, y] = shieldAt(s, t)
      const rust = 1 - CLANGS.filter((c) => t >= c).length / 3
      const sr = Math.round(shieldR(s) * lerp(1, 1.5, ease.outQ(span(t, T_RISE, T_DOME + 0.2))))
      const lit = span(t, CLANGS[0], T_DOME)
      if (lit > 0) {
        const gr = Math.round(sr * 2.2)
        g.drawImage(glow(gr, '#c8901e', 1.4, 0.5 * lit), x - gr, y - gr)
      }
      shield(g, x, y, sr, rust)
      for (const c of CLANGS) burstRing(g, x, y, span(t, c, c + 0.45), s.m * 0.45, 2, GOLD[1])
    }
    // The fog: rolling in, then pressing on the dome from every side, the dome holding a clear hole in it, then
    // swept off the screen by the burst.
    const wall = span(t, T_HOWL, T_HOWL + 0.7)
    const v = s.veil.g
    v.clearRect(0, 0, s.w, s.h)
    v.drawImage(fogLayer(s, s, t, wall), 0, 0)
    const surge = span(t, T_SURGE - 0.2, T_SURGE + 0.2)
    if (surge > 0) scroll(v, s.storm, t * 70, Math.round(s.h * 0.14), surge)
    const R = domeR(s)
    const hole =
      t < T_BURST
        ? R * ease.outC(span(t, T_DOME, T_DOME + 0.35)) * (1 - 0.07 * span(t, T_SURGE, T_SURGE + 0.3)) +
          Math.sin(t * 38) * 2 * span(t, T_SURGE + 0.2, T_BURST)
        : lerp(R, Math.hypot(s.w, s.h), ease.outC(span(t, T_BURST, T_BURST + 0.45)))
    if (hole > 1) {
      v.globalCompositeOperation = 'destination-out'
      ellipse(v, dcx, dcy, Math.round(hole), Math.round(hole * 0.95), '#000000')
      v.globalCompositeOperation = 'source-over'
    }
    g.drawImage(s.veil, 0, 0)
    eyes(g, Math.round(s.cx + s.w * 0.2), Math.round(s.h * 0.42), t, '#ff7a5a')
    stride(g, s, s, t, -1)
    drawDome(g, s, t, dcx, dcy)
  },
  before(g, s, t) {
    // The charge: a red streak out of the deep, growing as it comes.
    if (t > T_CHARGE && t < T_LAND + 0.3) {
      const q = ease.inQ(span(t, T_CHARGE, T_LAND))
      const k = lerp(0.2, 1, q)
      const y = lerp(s.h * 0.42, s.feet, q)
      for (let i = 1; i < 6; i++) {
        const kk = lerp(0.2, 1, ease.inQ(span(t - i * 0.025, T_CHARGE, T_LAND)))
        const yy = lerp(s.h * 0.42, s.feet, ease.inQ(span(t - i * 0.025, T_CHARGE, T_LAND)))
        if (i % 2)
          drawSprite(g, s.mon, s.cx, yy, { sx: kk, sy: kk, sil: i < 3 ? ZAMAZENTA[2] : ZAMAZENTA[3] })
      }
      drawSprite(g, s.mon, s.cx, y, {
        sx: k,
        sy: k,
        sil: '#2a0a0a',
        outline: Math.floor(t * 14) % 2 ? ZAMAZENTA[1] : ZAMAZENTA[2],
      })
    }
  },
  front(g, s, t) {
    crowned(g, s, t)
    g.drawImage(s.near, 0, 0)
  },
  sounds: [
    [0.05, () => hiss(2.4, { freq: 500, type: 'lowpass', vol: 0.05 })],
    [T_HOWL, () => tone(220, 1.2, { type: 'sine', vol: 0.06, slide: 160, attack: 0.25 })],
    [T_HOWL + 0.55, () => tone(392, 0.7, { type: 'triangle', vol: 0.025, slide: -160 })],
    [T_EYES, () => tone(1175, 0.25, { type: 'sine', vol: 0.02 })],
    ...[0, 1, 2, 3].map(
      (i) => [T_STRIDE + 0.1 + i * 0.2, () => hiss(0.12, { freq: 160, vol: 0.09 })] as const,
    ),
    ...CLANGS.map(
      (c, i) =>
        [
          c,
          () => (
            tone(988 + i * 196, 0.5, { type: 'square', vol: 0.035, slide: -40 }),
            tone(1480 + i * 220, 0.35, { type: 'triangle', vol: 0.03 }),
            hiss(0.1, { freq: 3000, vol: 0.06 })
          ),
        ] as const,
    ),
    [T_DOME, () => tone(330, 0.8, { type: 'triangle', vol: 0.04, slide: 330 })],
    [T_SURGE, () => hiss(1, { freq: 400, slide: 600, vol: 0.09 })],
    [T_SURGE + 0.25, () => tone(70, 0.6, { type: 'sawtooth', vol: 0.05, slide: -20 })],
    [T_BURST, () => (fxSound('mega.burst'), hiss(0.5, { freq: 1200, slide: 2000, vol: 0.06 }))],
    [T_LAND, () => fxSound('impact.hit')],
  ],
})

// ---------------------------------------------------------------------------------------------------------- shared

const swordLen = (s: Raid) => Math.round(Math.max(40, Math.min(66, s.m * 0.42)))

/** The sword's pommel: stuck with a third of its blade in the stone, then rising free to the middle. */
function swordTop(s: Raid & Weald, t: number) {
  const len = swordLen(s)
  const stuck = s.ground - Math.round(len * 0.75)
  const up = s.feet - Math.round(s.sz.h * 0.6) - Math.round(len * 0.6)
  const q = ease.outBack(span(t, T_PULL, T_LEAP + 0.1), 1.2)
  return Math.round(lerp(stuck, up, q) + (t > T_LEAP ? Math.sin((t - T_LEAP) * 20) : 0))
}

/** The cut: corner to corner through the middle, steeper on a tall phone. */
const cutLine = (s: Raid): [[number, number], [number, number]] => [
  [s.w * 0.88, -4],
  [s.w * 0.12, s.h + 4],
]

/** The slash: a blade of light drawn across the screen in an instant, then thinning to a glinting seam. */
function drawSlash(g: G, s: Raid, t: number) {
  const q = span(t, T_SLASH, T_SLASH + 0.07)
  const fade = span(t, T_SLASH + 0.08, REVEAL - 0.1)
  if (q <= 0 || fade >= 1) return
  const [a, b] = cutLine(s)
  const ex = lerp(a[0], b[0], q)
  const ey = lerp(a[1], b[1], q)
  const wd = Math.round(lerp(8, 1, ease.outQ(fade)))
  if (wd > 2) line(g, a[0], a[1], ex, ey, ZACIAN[2], wd + 4)
  line(g, a[0], a[1], ex, ey, ZACIAN[1], Math.max(1, wd))
  if (wd > 3) line(g, a[0], a[1], ex, ey, '#ffffff', wd - 3)
}

const shieldR = (s: Raid) => Math.round(Math.max(11, Math.min(20, s.m * 0.1)))

/** The shield's centre: leaning on the dais, jolted by each blow, then rising to the dome's heart. */
function shieldAt(s: Raid & Weald, t: number): [number, number] {
  const sr = shieldR(s)
  const rest = s.ground - sr + 2
  const jolt = CLANGS.reduce((k, c) => k + (t > c && t < c + 0.12 ? -3 : 0), 0)
  const [, dcy] = domeC(s)
  return [s.cx, Math.round(lerp(rest, dcy, ease.ioS(span(t, T_RISE, T_DOME + 0.1)))) + jolt]
}

const domeR = (s: Raid) => Math.round(Math.min(s.w * 0.44, s.h * 0.3, 90))
const domeC = (s: Raid): [number, number] => [s.cx, s.feet - Math.round(Math.max(30, s.sz.h * 0.5))]

/** The dome of hexagons: growing out from the shield, flaring where the fog breaks on it, bursting outward. */
function drawDome(g: G, s: Raid & MX, t: number, cx: number, cy: number) {
  if (t < T_DOME) return
  const R = domeR(s)
  const cr = Math.max(5, Math.round(R / 5))
  const burst = span(t, T_BURST, T_BURST + 0.5)
  if (burst >= 1) return
  const hit = span(t, T_SURGE + 0.2, T_BURST)
  for (const [x, y, d] of s.cells) {
    const on = span(t, T_DOME + d * 0.3, T_DOME + d * 0.3 + 0.08)
    if (on <= 0) continue
    const out = 1 + ease.outC(burst) * (1.5 + d * 1.5)
    const px = Math.round(cx + x * out)
    const py = Math.round(cy + y * out)
    const rim = d > 0.7
    // Flaring red-gold where the fog strikes the rim, in turns.
    const flare = rim && hit > 0 && Math.floor(t * 20 + x * 0.3 + y * 0.2) % 5 === 0
    if (burst <= 0)
      hexFill(g, px, py, cr - 1, pattern(g, flare ? '#ff8a5a' : ZAMAZENTA[2], flare ? 8 : 3 + d * 3))
    hexLine(g, px, py, cr - 1, flare || on < 1 ? '#ffffff' : burst > 0.5 ? GOLD[2] : GOLD[1])
  }
}

/** Dust thrown up where it lands. */
function dust(s: Raid, y: number, n: number) {
  const r = s.r
  for (let i = 0; i < n * s.many; i++) {
    const side = r() < 0.5 ? -1 : 1
    s.fx.add({
      x: s.cx + side * r.range(4, s.sz.w * 0.5),
      y,
      vx: side * r.range(20, 70),
      vy: -r.range(5, 25),
      drag: 3,
      life: r.range(0.5, 0.9),
      size: r.int(2, 4),
      shape: 'smoke',
      colors: ['#8aa0a8', '#5a6a70'],
    })
  }
}

/** Gold falling round the crowned hero. */
function goldDust(s: Raid) {
  const r = s.r
  s.fx.add({
    x: s.cx + r.range(-s.sz.w * 0.6, s.sz.w * 0.6),
    y: s.feet - s.sz.h - r.range(0, 10),
    vx: r.range(-4, 4),
    vy: r.range(8, 20),
    life: r.range(1, 1.6),
    size: 1,
    shape: r() < 0.4 ? 'star' : 'px',
    colors: [GOLD[0], GOLD[1], GOLD[2]],
  })
}

/** The crown's glint: a gold-white band sweeping across it once it is revealed. */
function crowned(g: G, s: Raid, t: number) {
  const q = span(t, REVEAL + 0.55, REVEAL + 1.0)
  if (q > 0 && q < 1) gleam(g, s.mon, { x: s.cx, y: s.feet }, 0, q)
}
