// The Regis' raid entrances (docs/53): the sealed chambers, one each (Regirock's in the Desert Ruins' sandstone,
// Regice's in the Island Cave's blue stone, Registeel's in the Ancient Tomb's dark iron-banded stone). Black; a torch's
// circle of light slides along the wall and stops on a tablet of Braille (the chamber's own words: where it is, its
// sleeper's name, "awake"). The Braille lights up by itself, cell by cell, and its light runs out through the wall's
// joints like veins, down to the floor and over it to the dark alcove in the middle. Then the chamber answers in its
// own element: Regirock's walls crack and pour sand, and boulders fly in from everywhere and build its body from the
// feet up; Regice's cold draws a great snowflake of frost over the floor and a column of ice grows round its body;
// Registeel's steel rings like a struck bell, three times, each ring a shockwave through the room and a glint over its
// iron body, its field standing the iron filings up on the floor. In the dark its seven dots light one by one (the
// Regis' beeping), in its own pattern; they flare, and the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
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
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays, gleam } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  inOrder,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Cinema,
  type CinemaParams,
  type Shard,
} from './kit'

const T_TORCH = 0.2
const T_READ = 0.85
const T_VEINS = 1.9
const T_ELEM = 2.45
const T_DOTS = 3.5
const DOT_STEP = 0.1
const T_FLARE = 4.25
const REVEAL = 4.7
const DUR = REVEAL + AFTER_REVEAL
/** Registeel's three rings. */
const RINGS = [2.5, 2.95, 3.32] as const
/** A course of blocks, and a block's length. */
const COURSE = 11
const BLOCK = 24

type Elem = 'rock' | 'ice' | 'steel'
interface Stone {
  light: string
  mid: string
  dark: string
  ink: string
}
interface Regi {
  id: string
  seed: number
  elem: Elem
  /** The tablet's lines, in Braille: where it sleeps, its name, the word that wakes it. */
  words: readonly string[]
  /** Its seven dots in the order they light (in dot spacings from the middle of its face). */
  dots: readonly (readonly [number, number])[]
  stone: Stone
  floor: readonly string[]
  /** The Braille's light; its seven dots' colour and their white-hot heart. */
  rune: string
  dot: string
  hot: string
  aura: readonly [string, string, string, string]
  /** Its body in the dark before the reveal. */
  sil: string
  /** Its beeps' pitches, one per dot. */
  beeps: readonly number[]
}

const REGIROCK: Regi = {
  id: 'regirock',
  seed: 377,
  elem: 'rock',
  words: ['desert', 'regirock', 'awake'],
  // An H.
  dots: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
  stone: { light: '#c89a5a', mid: '#8a6438', dark: '#523a20', ink: '#20150a' },
  floor: ['#7a5a34', '#4a3420', '#24180c'],
  rune: '#ffb43a',
  dot: '#ff8a2a',
  hot: '#fff0b0',
  aura: ['#ffffff', '#ffd8a0', '#e08a3a', '#6a3a14'],
  sil: '#2a1a0e',
  beeps: [523, 659, 784, 587, 880, 698, 1047],
}

const REGICE: Regi = {
  id: 'regice',
  seed: 378,
  elem: 'ice',
  words: ['island', 'regice', 'awake'],
  // A line of five, one above its middle and one below.
  dots: [
    [-2, 0],
    [-1, 0],
    [0, -1],
    [0, 0],
    [0, 1],
    [1, 0],
    [2, 0],
  ],
  stone: { light: '#6a9ac0', mid: '#365e84', dark: '#1c3656', ink: '#08142a' },
  floor: ['#365e84', '#1c3656', '#0a1830'],
  rune: '#8ae8ff',
  dot: '#ffe14a',
  hot: '#ffffff',
  aura: ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'],
  sil: '#0c2238',
  beeps: [1175, 988, 1319, 1047, 880, 1397, 1568],
}

const REGISTEEL: Regi = {
  id: 'registeel',
  seed: 379,
  elem: 'steel',
  words: ['ancient', 'registeel', 'awake'],
  // A hexagon and its middle.
  dots: [
    [-0.5, -1],
    [0.5, -1],
    [1, 0],
    [0.5, 1],
    [-0.5, 1],
    [-1, 0],
    [0, 0],
  ],
  stone: { light: '#7a7490', mid: '#4a4460', dark: '#2a2640', ink: '#100d1a' },
  floor: ['#423c58', '#26223a', '#100e1a'],
  rune: '#d0d8ff',
  dot: '#ff3a3a',
  hot: '#ffd0d0',
  aura: ['#ffffff', '#dfe6f2', '#8f9ab4', '#3e4458'],
  sil: '#14121c',
  beeps: [880, 880, 1175, 880, 1319, 1175, 1760],
}

// Braille, dots 1–3 down the left column and 4–6 down the right (the letters the chambers' words use).
const BRAILLE: Record<string, string> = {
  a: '1',
  c: '14',
  d: '145',
  e: '15',
  g: '1245',
  h: '125',
  i: '24',
  k: '13',
  l: '123',
  n: '1345',
  o: '135',
  p: '1234',
  r: '1235',
  s: '234',
  t: '2345',
  w: '2456',
}
/** A Braille cell's pitch, a line's, the tablet's margin. */
const CELL = 8
const ROW = 12
const PAD = 5
/** The seven dots' spacing on its face. */
const SP = 7

interface Cell {
  x: number
  y: number
  dots: [number, number][]
  /** When it lights. */
  at: number
}

interface Layout {
  w: number
  h: number
  cx: number
  feet: number
  /** Where the wall meets the floor. */
  base: number
  sw: number
  sh: number
  alc: { x0: number; x1: number; top: number }
  tab: { x0: number; y0: number; w: number; h: number }
  /** The seven dots' middle. */
  head: number
  pillars: number[]
  cells: Cell[]
}

function layout(w: number, h: number, mon: string, P: Regi): Layout {
  const s = spriteSize(mon)
  const cx = Math.round(w / 2)
  const feet = Math.round(h * 0.63)
  const base = feet - 8
  // Narrower than the Regi: it stands in the doorway, its arms over the frame.
  const aw = Math.round(Math.min(w * 0.6, s.w + 6))
  const tw = Math.max(...P.words.map((x) => x.length)) * CELL - 3 + PAD * 2
  const th = P.words.length * ROW - 4 + PAD * 2
  const top = Math.max(th + 16, feet - s.h - 12)
  const alc = { x0: cx - (aw >> 1), x1: cx - (aw >> 1) + aw, top }
  const tab = { x0: cx - (tw >> 1), y0: Math.max(5, top - 12 - th), w: tw, h: th }
  const pillars = [alc.x0 - 8 - 10, alc.x1 + 8]
  // The cells, line by line, each line centred; on a wide screen more Braille on the walls each side.
  const cells: Cell[] = []
  const lines = (words: readonly string[], x0: number, y0: number, wd: number) =>
    words.flatMap((word, li) => {
      const lw = word.length * CELL - 3
      return [...word].map((ch, i) => ({
        x: x0 + Math.round((wd - lw) / 2) + i * CELL,
        y: y0 + li * ROW,
        dots: [...(BRAILLE[ch] ?? '')].map((d) => {
          const n = Number(d) - 1
          return [n < 3 ? 0 : 3, (n % 3) * 3] as [number, number]
        }),
        at: 0,
      }))
    })
  const dur = T_VEINS - 0.12 - T_READ
  const main = lines(P.words, tab.x0 + PAD, tab.y0 + PAD, tw - PAD * 2)
  main.forEach((c, i) => (c.at = T_READ + (i / main.length) * dur))
  cells.push(...main)
  for (const side of [-1, 1]) {
    const room = side < 0 ? pillars[0]! - 4 : w - (pillars[1]! + 14)
    if (room < 56) continue
    const wd = Math.min(room - 10, 72)
    const x0 = side < 0 ? pillars[0]! - 8 - wd : pillars[1]! + 18
    const more = lines([P.elem, 'sleeps', 'here'], x0, tab.y0 + 2, wd)
    more.forEach((c, i) => (c.at = T_READ + 0.2 + (i / more.length) * dur))
    cells.push(...more)
  }
  return {
    w,
    h,
    cx,
    feet,
    base,
    sw: s.w,
    sh: s.h,
    alc,
    tab,
    head: Math.round(feet - s.h * 0.62),
    pillars,
    cells,
  }
}

/**
 * The veins: the Braille's light running out of the tablet's sides through the wall's joints, a step along a course
 * and down a joint, again and again, to the floor; then over the floor into its feet. On the joints the chamber
 * already has, so they read as the wall itself lighting up.
 */
function veins(L: Layout, r: Rng): [number, number][][] {
  const { cx, base, tab, alc } = L
  const out: [number, number][][] = []
  // The courses' top lines that cross the tablet's sides.
  const rows: number[] = []
  for (let row = 0; base - COURSE * (row + 1) > 0; row++) {
    const y = base - COURSE * (row + 1)
    if (y > tab.y0 + 2 && y < tab.y0 + tab.h - 2) rows.push(row)
  }
  if (!rows.length) rows.push(Math.floor((base - tab.y0 - tab.h / 2) / COURSE))
  for (const side of [-1, 1])
    rows.forEach((row0, k) => {
      let row = row0
      let x = side < 0 ? tab.x0 - 3 : tab.x0 + tab.w + 2
      let y = base - COURSE * (row + 1)
      const pts: [number, number][] = [[x, y]]
      // Out past the alcove's frame first, then down the joints in steps.
      const clear = (alc.x1 - alc.x0) / 2 + 6 + k * 8
      const edge = L.w / 2 - 3
      while (row >= 0) {
        const off = row % 2 ? 0 : BLOCK / 2
        // The next joint down, outwards (sometimes one further on), never off the screen.
        let jx = x
        while ((((jx - cx - off) % BLOCK) + BLOCK) % BLOCK !== 0) jx += side
        if (Math.abs(jx - cx) < clear || r() < 0.25) jx += side * BLOCK
        while (Math.abs(jx - cx) > edge) jx -= side * BLOCK
        if (jx !== x) pts.push([jx, y])
        x = jx
        y += COURSE
        row--
        pts.push([x, y])
      }
      pts.push([cx + side * (3 + k * 3), L.feet + 3])
      out.push(pts)
    })
  return out
}

/** The chamber, still: the block wall, the stepped alcove, its pillars, the tablet's carved Braille, the floor. */
function chamber(L: Layout, P: Regi): Canvas {
  const { w, h, cx, base, alc, tab } = L
  const S = P.stone
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, base, [S.dark, S.mid, S.mid], 3), 0, 0)
  // The blocks: courses of big stones, each bevelled (lit top and left, dark bottom and right), a few chipped.
  const r = rng(P.seed)
  for (let row = 0, y = base - COURSE; y > -COURSE; row++, y -= COURSE) {
    const off = row % 2 ? 0 : BLOCK / 2
    for (let x = ((cx + off) % BLOCK) - BLOCK; x < w; x += BLOCK) {
      if (r() < 0.35) rect(g, x + 1, y + 1, BLOCK - 1, COURSE - 1, r() < 0.5 ? S.dark : S.mid)
      rect(g, x + 1, y + 1, BLOCK - 2, 1, S.light)
      rect(g, x + 1, y + 1, 1, COURSE - 2, S.light)
      rect(g, x + 2, y + COURSE - 1, BLOCK - 2, 1, S.dark)
      rect(g, x + BLOCK - 1, y + 2, 1, COURSE - 2, S.dark)
      if (r() < 0.5) rect(g, x + r.int(4, 19), y + r.int(3, 8), r.int(1, 3), 1, S.dark)
      rect(g, x, y, 1, COURSE, S.ink)
    }
    rect(g, 0, y, w, 1, S.ink)
  }
  // Registeel's tomb is banded with iron: two rails along the wall, riveted.
  if (P.elem === 'steel')
    for (const y of rails(L)) {
      rect(g, 0, y, w, 4, '#3a3a48')
      rect(g, 0, y, w, 1, '#8a8aa0')
      rect(g, 0, y + 3, w, 1, '#0c0a12')
      for (let x = (cx % 12) - 12; x < w; x += 12) rect(g, x, y + 1, 1, 1, '#b0b0c8')
    }
  // The pillars, their capitals and feet.
  for (const x of L.pillars) {
    rect(g, x, 0, 10, base, S.mid)
    rect(g, x, 0, 2, base, S.light)
    rect(g, x + 7, 0, 3, base, S.dark)
    for (const y of [6, base - 6]) {
      rect(g, x - 2, y, 14, 4, S.mid)
      rect(g, x - 2, y, 14, 1, S.light)
      rect(g, x - 2, y + 3, 14, 1, S.ink)
    }
  }
  // The alcove: a stepped doorway into the dark, its frame carved round it.
  const aw = alc.x1 - alc.x0
  const steps = [
    [alc.x0 + 8, alc.top - 6, aw - 16],
    [alc.x0 + 4, alc.top - 3, aw - 8],
    [alc.x0, alc.top, aw],
  ] as const
  for (const [x, y, ww] of steps) rect(g, x - 3, y - 3, ww + 6, base - y + 3, S.light)
  for (const [x, y, ww] of steps) rect(g, x - 2, y - 2, ww + 4, base - y + 2, S.dark)
  for (const [x, y, ww] of steps) rect(g, x, y, ww, base - y, S.ink)
  // Its back wall, deep in shadow: the same courses, barely there.
  for (let y = base - COURSE, row = 0; y > alc.top - 6; y -= COURSE, row++) {
    rect(g, alc.x0 + 1, y, aw - 2, 1, '#000000')
    rect(g, alc.x0 + 1, y + 1, aw - 2, 1, S.dark)
    for (let x = alc.x0 + 6 + (row % 2) * 10; x < alc.x1 - 2; x += 20)
      rect(g, x, y + 1, 1, COURSE - 1, '#000000')
  }
  g.drawImage(
    dGradient(aw - 2, base - alc.top + 6, ['#000000', '#000000', S.ink], 3),
    alc.x0 + 1,
    alc.top - 6,
  )
  // The tablet: a slab set in the wall, its Braille carved in.
  rect(g, tab.x0 - 3, tab.y0 - 3, tab.w + 6, tab.h + 6, S.ink)
  rect(g, tab.x0 - 2, tab.y0 - 2, tab.w + 4, tab.h + 4, S.light)
  rect(g, tab.x0 - 1, tab.y0 - 1, tab.w + 2, tab.h + 2, S.dark)
  rect(g, tab.x0, tab.y0, tab.w, tab.h, S.mid)
  for (const c of L.cells)
    for (const [dx, dy] of c.dots) {
      rect(g, c.x + dx, c.y + dy, 2, 2, S.ink)
      rect(g, c.x + dx + 1, c.y + dy + 1, 1, 1, S.dark)
    }
  // The floor: big flags in perspective, a lip where it meets the wall.
  g.drawImage(dGradient(w, h - base, P.floor, 4), 0, base)
  rect(g, 0, base, w, 1, S.light)
  rect(g, 0, base + 1, w, 1, S.ink)
  for (let k = 1; k < 8; k++) {
    const y = Math.round(base + (h - base) * (k / 8) ** 1.6)
    rect(g, 0, y, w, 1, S.ink)
    rect(g, 0, y + 1, w, 1, S.dark)
  }
  const V = 70
  for (let k = -12; k <= 12; k++) line(g, cx + k * 18, base + 1, cx + (k * 18 * (h - base + V)) / V, h, S.ink)
  return cv
}

const rails = (L: Layout) => [Math.round(L.base * 0.2), Math.round(L.base * 0.62)]

/** What the element leaves on the chamber, over it: Regirock's cracks, Regice's frost, Registeel's iron lit. */
function marks(L: Layout, P: Regi): Canvas {
  const { w, h, base } = L
  const cv = canvas(w, h)
  const g = cv.g
  const r = rng(P.seed + 7)
  if (P.elem === 'rock') {
    for (let i = 0; i < 7; i++) {
      const x = r.range(0, w)
      const pts = bolt(r, x, 0, x + r.range(-30, 30), r.range(base * 0.3, base), 0.4, 4)
      polyline(g, pts, P.stone.ink, 2)
      polyline(
        g,
        pts.map(([a, b]) => [a + 1, b + 1] as [number, number]),
        P.stone.light,
      )
    }
  } else if (P.elem === 'ice') {
    // Frost along the courses, thicker near its feet where the cold comes from; icicles under the tablet, the
    // lintel and the capitals; rime on the floor round it.
    const near = (x: number, y: number) =>
      Math.max(0, 1 - Math.hypot(x - L.cx, (y - L.feet) * 1.4) / (w * 0.75))
    for (let y = base - COURSE; y > 0; y -= COURSE)
      for (let x = 0; x < w; x++)
        if (r() < 0.7 * near(x, y)) rect(g, x, y + 1, 1, r() < 0.3 ? 2 : 1, '#c8f4ff')
    const icicles = (x0: number, x1: number, y: number) => {
      for (let x = x0; x < x1; x += r.int(3, 6)) {
        const len = r.int(3, 10)
        tri(g, x, y, x + 3, y, x + 1, y + len, '#8ad8f0')
        rect(g, x, y, 1, Math.max(1, len - 3), '#ffffff')
      }
    }
    icicles(L.tab.x0 - 3, L.tab.x0 + L.tab.w + 3, L.tab.y0 + L.tab.h + 3)
    icicles(L.alc.x0 - 9, L.alc.x1 + 9, L.alc.top - 9)
    for (const x of L.pillars) icicles(x - 2, x + 12, 10)
    for (let i = 0; i < 70; i++) {
      const x = r.range(0, w)
      const y = r.range(base + 3, h)
      if (r() < near(x, y) * 1.5)
        rect(g, x, y, r.int(2, 4 + (y - base) / 10), 1, r() < 0.3 ? '#ffffff' : '#8ad8f0')
    }
  } else {
    // The iron ringing: its rails white along their edges, every rivet a spark.
    for (const y of rails(L)) {
      rect(g, 0, y, w, 1, '#ffffff')
      rect(g, 0, y + 1, w, 2, '#c8c8e0')
      for (let x = (L.cx % 12) - 12; x < w; x += 12) rect(g, x - 1, y, 3, 4, '#ffffff')
    }
    for (const x of L.pillars) rect(g, x, 0, 2, base, '#e0e0f0')
  }
  return cv
}

/** The room's dark corners, once (a vignette in ordered dither, never a smooth one). */
const vignette = (w: number, h: number) =>
  shade(w, h, (x, y) => {
    const dx = (x - w / 2) / (w / 2)
    const dy = (y - h * 0.55) / (h * 0.6)
    const d = Math.sqrt(dx * dx * 0.7 + dy * dy)
    return (d - 0.75) * 1.6 > bayer(x, y) ? '#000000' : null
  })

let lt: Canvas | null = null
/** A light on the dark chamber: its lit picture, seen through a dithered disc of radius R (k how bright). */
function lightAt(g: G, lit: Canvas, x: number, y: number, R: number, k: number, power = 1.1) {
  if (k <= 0.03) return
  const rr = Math.max(4, Math.round(R / 4) * 4)
  const n = 2 * rr + 1
  if (!lt || lt.width < n || lt.height < n)
    lt = canvas(Math.max(n, lt?.width ?? 0), Math.max(n, lt?.height ?? 0))
  const c = lt.g
  c.globalCompositeOperation = 'source-over'
  c.clearRect(0, 0, n, n)
  c.drawImage(glow(rr, '#ffffff', power, Math.ceil(Math.min(1, k) * 8) / 8), 0, 0)
  c.globalCompositeOperation = 'source-in'
  c.drawImage(lit, Math.round(rr - x), Math.round(rr - y))
  c.globalCompositeOperation = 'source-over'
  g.drawImage(lt, 0, 0, n, n, Math.round(x - rr), Math.round(y - rr), n, n)
}

/** Where Regirock's sand pours from the ceiling: over the pillars, or either side on a narrow screen. */
const sands = (L: Layout) =>
  L.w < 200 ? [Math.round(L.w * 0.12), Math.round(L.w * 0.86)] : L.pillars.map((x) => x + 5)

/** A boulder flying in to build Regirock. */
interface Rock {
  x0: number
  y0: number
  x1: number
  y1: number
  t0: number
  t1: number
  r: number
  a: number
}

type S = {
  r: Rng
  fx: Particles
  amb: Particles
  shards: Shard[]
  dark: Canvas
  lit: Canvas
  marks: Canvas
  vig: Canvas
  rays: Canvas
  body: Canvas
  veins: [number, number][][]
  rocks: Rock[]
  shakes: [number, number, number][]
}

function regiCinema(P: Regi): Cinema {
  return {
    reveal: REVEAL,
    dur: DUR,
    make(p: CinemaParams): Timeline<S> {
      const w = p.w ?? 240
      const h = p.h ?? 160
      const L = layout(w, h, p.mon, P)
      const { cx, feet, sw, sh } = L
      const mid = feet - Math.round(sh / 2)
      const quiet = (f: () => void) => () => void (!skippingNow() && f())
      const many = p.short ? 0.4 : 1
      const shakes: [number, number, number][] =
        P.elem === 'rock'
          ? [
              [T_ELEM, 1.1, 2],
              [T_FLARE, 0.45, 2],
              [REVEAL, 0.6, 4],
            ]
          : P.elem === 'steel'
            ? [...RINGS.map((at, i) => [at, 0.3, 1 + i] as [number, number, number]), [REVEAL, 0.5, 3]]
            : [[REVEAL, 0.5, 3]]
      return {
        id: `cinema-${P.id}`,
        dur: DUR,
        setup() {
          const r = rng(P.seed)
          const lit = chamber(L, P)
          const dark = canvas(w, h)
          dark.g.drawImage(lit, 0, 0)
          wash(dark.g, '#000000', 0.75, 8)
          // Regirock's boulders: each lands on the line its body has been built up to by then.
          const rocks: Rock[] = []
          if (P.elem === 'rock') {
            const n = Math.round(30 * (p.short ? 0.6 : 1))
            for (let i = 0; i < n; i++) {
              const t1 = lerp(T_ELEM + 0.45, T_DOTS + 0.2, i / (n - 1))
              const side = i % 2 ? 1 : -1
              const fromFloor = r() < 0.3
              rocks.push({
                x0: fromFloor ? cx + r.range(-w * 0.45, w * 0.45) : side < 0 ? -12 : w + 12,
                y0: fromFloor ? h + 10 : r.range(L.base - 30, h - 20),
                x1: cx + r.range(-sw * 0.3, sw * 0.3),
                y1: feet - sh * build(t1) + r.range(-2, 5),
                t0: t1 - r.range(0.4, 0.6),
                t1,
                r: r.range(4, 8) * (1 - i / n / 2),
                a: r() * 6,
              })
            }
          }
          return {
            r,
            fx: new Particles(),
            amb: new Particles(),
            shards: [],
            dark,
            lit,
            marks: marks(L, P),
            vig: vignette(w, h),
            rays: canvas(w, h),
            body: canvas(sw + 4, sh + 4),
            veins: veins(L, r),
            rocks,
            shakes: p.short ? [] : shakes,
          }
        },
        step(s, t, dt) {
          const r = s.r
          s.fx.update(dt)
          s.amb.update(dt)
          stepShards(s.shards, dt, { floor: feet + 6 })
          // Dust in the air, always.
          if (r() < 0.15 * many)
            s.amb.add({
              x: r.range(0, w),
              y: r.range(0, L.base),
              vx: r.range(-3, 3),
              vy: r.range(1, 5),
              life: 2.5,
              size: 1,
              shape: 'px',
              colors: [P.stone.light, P.stone.mid],
            })
          // The veins' light arriving at its feet: a spray of sparks there.
          if (within(t, T_ELEM - 0.05, T_ELEM - 0.05 + dt))
            for (let i = 0; i < 24 * many; i++)
              s.fx.add({
                x: cx + r.range(-6, 6),
                y: feet + 3,
                vx: r.range(-50, 50),
                vy: -r.range(20, 80),
                ay: 200,
                life: r.range(0.4, 0.8),
                size: 1,
                shape: 'px',
                colors: ['#ffffff', P.rune, P.stone.light],
              })
          if (P.elem === 'rock') stepRock(s, t, dt, L, many)
          else if (P.elem === 'ice') stepIce(s, t, L, many)
          else stepSteel(s, t, dt, L, many)
          // The reveal: its element thrown out round it.
          if (within(t, REVEAL, REVEAL + dt)) {
            const col =
              P.elem === 'rock'
                ? (['#c89a5a', '#8a6438'] as const)
                : P.elem === 'ice'
                  ? (['#e8fbff', '#8ad8f0'] as const)
                  : (['#e0e0f0', '#8a8aa0'] as const)
            for (let i = 0; i < 40 * many + 10; i++) {
              const k = makeShard(
                r,
                cx + r.range(-sw * 0.4, sw * 0.4),
                mid + r.range(-sh * 0.4, sh * 0.4),
                170,
                col[i % 2]!,
                '#ffffff',
                0.9,
              )
              if (P.elem === 'rock') k.r += 1.5
              s.shards.push(k)
            }
            for (let k = 0; k < 50 * many; k++) {
              const a = r() * Math.PI * 2
              const v = r.range(50, 170)
              s.fx.add({
                x: cx,
                y: mid,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                drag: 2.5,
                life: r.range(0.5, 1),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'star' : 'sq',
                colors: [...P.aura],
              })
            }
          }
        },
        draw(g, s, t) {
          const sh0 = screenShake(t, s.shakes)
          g.fillStyle = '#000000'
          g.fillRect(0, 0, w, h)
          g.save()
          g.translate(sh0.x, sh0.y)
          // The chamber in the dark; its lights show it: the torch, the tablet, the pool at its feet, the element.
          g.drawImage(s.dark, 0, 0)
          drawLights(g, s, t, L, P)
          const mk = P.elem === 'steel' ? ringing(t) : span(t, T_ELEM + 0.1, T_DOTS)
          if (mk > 0) dissolve(g, s.marks, mk)
          // Deeper dark while the dots wake.
          if (t > T_DOTS && t < REVEAL) wash(g, '#000000', 0.35 * span(t, T_DOTS, T_DOTS + 0.4), 8)
          drawBraille(g, t, L, P)
          drawVeins(g, s, t, P)
          s.amb.draw(g)
          if (P.elem === 'ice') drawFlake(g, t, L)
          if (P.elem === 'steel') drawField(g, t, L)
          // The legend: its element's body before the reveal, then itself.
          if (t < REVEAL) {
            if (P.elem === 'rock') drawRockBody(g, s, t, L, P, p.mon)
            else if (P.elem === 'ice') drawIceBody(g, t, L, p.mon)
            else drawSteelBody(g, t, L, P, p.mon)
            drawDots(g, t, L, P)
          } else {
            const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.6, 0.28, span(t, REVEAL + 0.4, REVEAL + 1.4))
            drawRays(s.rays, { x: cx, y: mid }, t, P.aura[3], k)
            g.drawImage(s.rays, 0, 0)
            drawSprite(g, p.mon, cx, feet, {
              flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
              outline: Math.floor(t * 8) % 2 ? P.aura[1] : P.aura[2],
            })
            if (P.elem === 'steel' && within(t, REVEAL + 0.5, REVEAL + 0.9))
              gleam(g, p.mon, { x: cx, y: feet }, 0, span(t, REVEAL + 0.5, REVEAL + 0.9))
          }
          for (const [d, c] of [
            [0, P.aura[0]],
            [0.1, P.aura[1]],
            [0.22, P.aura[2]],
          ] as const)
            burstRing(g, cx, mid, span(t, REVEAL + d, REVEAL + d + 0.6), Math.max(w, h) * 0.75, 3, c)
          drawShards(g, s.shards, P.elem === 'rock' ? P.stone.ink : undefined)
          s.fx.draw(g)
          if (P.elem === 'rock') drawSand(g, t, L)
          g.drawImage(s.vig, 0, 0)
          g.restore()
          if (P.elem === 'steel')
            for (const at of RINGS)
              if (within(t, at, at + 0.15)) screenFlash(g, '#e0e0f0', 0.3 * (1 - span(t, at, at + 0.15)))
          if (P.elem === 'rock' && within(t, T_ELEM, T_ELEM + 0.15)) screenFlash(g, '#ffd8a0', 0.2)
          if (within(t, REVEAL, REVEAL + 0.35))
            screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
          if (t < 0.4) wash(g, '#000000', 1 - span(t, 0, 0.4), 8)
        },
        cues: () =>
          inOrder([
            [0.05, quiet(() => hiss(1.8, { freq: 180, type: 'lowpass', vol: 0.05 }))],
            [T_TORCH, quiet(() => tone(98, 2.2, { type: 'sine', vol: 0.04 }))],
            // The Braille: a tick for each cell of the tablet as it lights.
            ...L.cells
              .filter((c) => c.x >= L.tab.x0 && c.x < L.tab.x0 + L.tab.w)
              .map(
                (c, i) =>
                  [
                    c.at,
                    quiet(() => tone(1400 + (i % 5) * 140, 0.035, { type: 'square', vol: 0.012 })),
                  ] as const,
              ),
            [T_VEINS, quiet(() => hiss(0.55, { freq: 600, slide: 2400, vol: 0.05 }))],
            [T_VEINS + 0.02, quiet(() => tone(196, 0.6, { type: 'triangle', vol: 0.04, slide: 196 }))],
            ...elemCues(P, quiet),
            ...P.dots.map(
              (_, i) =>
                [
                  T_DOTS + i * DOT_STEP,
                  quiet(() => tone(P.beeps[i]!, 0.07, { type: 'square', vol: 0.03 })),
                ] as const,
            ),
            [T_FLARE, quiet(() => fxSound('legend.heart'))],
            [T_FLARE + 0.02, quiet(() => tone(110, 0.5, { type: 'sawtooth', vol: 0.04, slide: 220 }))],
            [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          ] satisfies Cue<S>[]),
      }
    },
  }
}

/** Registeel's iron flaring at each ring, fading. */
const ringing = (t: number) => Math.max(0, ...RINGS.map((at) => (t >= at ? 1 - span(t, at, at + 0.45) : 0)))

/** Regirock's body: how far up it has been built by t (0 → 1). */
const build = (t: number) => ease.ioS(span(t, T_ELEM + 0.35, T_DOTS + 0.25))

function elemCues(P: Regi, quiet: (f: () => void) => () => void): (readonly [number, () => void])[] {
  if (P.elem === 'rock')
    return [
      [
        T_ELEM,
        quiet(
          () => (
            hiss(1.4, { freq: 120, type: 'lowpass', vol: 0.14 }),
            tone(48, 1.2, { type: 'sawtooth', vol: 0.05 })
          ),
        ),
      ],
      [T_ELEM + 0.15, quiet(() => hiss(1.6, { freq: 2200, type: 'highpass', vol: 0.03 }))],
      ...[0.6, 0.85, 1.05, 1.25, 1.4].map(
        (d, i) =>
          [
            T_ELEM + d,
            quiet(
              () => (
                hiss(0.12, { freq: 260, type: 'lowpass', vol: 0.1 }),
                tone(80 + i * 6, 0.1, { type: 'square', vol: 0.03 })
              ),
            ),
          ] as const,
      ),
    ]
  if (P.elem === 'ice')
    return [
      [T_ELEM, quiet(() => hiss(1.4, { freq: 5000, type: 'highpass', vol: 0.04, slide: 2000 }))],
      ...[0, 0.12, 0.24, 0.36, 0.48, 0.6].map(
        (d, i) =>
          [T_ELEM + d, quiet(() => tone(2093 + i * 220, 0.25, { type: 'triangle', vol: 0.018 }))] as const,
      ),
      [
        T_ELEM + 0.8,
        quiet(
          () => (
            hiss(0.9, { freq: 900, slide: 2500, vol: 0.05 }),
            tone(330, 0.8, { type: 'sine', vol: 0.03, slide: 330 })
          ),
        ),
      ],
      [T_FLARE + 0.1, quiet(() => hiss(0.2, { freq: 6000, vol: 0.05 }))],
    ]
  return RINGS.map(
    (at, i) =>
      [
        at,
        quiet(() => {
          // A bell's partials, out of tune with each other: struck steel, not a note.
          tone(196 - i * 12, 1.4, { type: 'sine', vol: 0.06 })
          tone(523 - i * 20, 1.0, { type: 'sine', vol: 0.03 })
          tone(1163 - i * 40, 0.6, { type: 'triangle', vol: 0.02 })
          hiss(0.08, { freq: 4000, vol: 0.05 })
        }),
      ] as const,
  )
}

/** The lights that show the chamber: the torch, the tablet's glow, the pool at its feet, the element's own. */
function drawLights(g: G, s: S, t: number, L: Layout, P: Regi) {
  const { cx, w, tab } = L
  // A torch's circle: across the wall and onto the tablet, gone once the Braille lights itself.
  const tk = span(t, T_TORCH, T_TORCH + 0.2) * (1 - span(t, T_READ + 0.3, T_VEINS))
  if (tk > 0) {
    const e = ease.ioS(span(t, T_TORCH, T_READ))
    const x = lerp(w * 0.1, cx, e) + Math.sin(t * 7) * 2 * (1 - e)
    const y = lerp(L.base * 0.8, tab.y0 + tab.h / 2, e)
    lightAt(g, s.lit, x, y, Math.min(36, w * 0.28), tk)
  }
  // The tablet's light on the wall round it.
  const on = span(t, T_READ, T_VEINS)
  if (on > 0) lightAt(g, s.lit, cx, tab.y0 + tab.h / 2, tab.w * 0.62 + 12, on * 0.9)
  // The pool of light at its feet once the veins reach them; the element's light over the floor.
  const pool = span(t, T_ELEM - 0.1, T_ELEM + 0.4)
  const el = P.elem === 'ice' ? span(t, T_ELEM, T_ELEM + 0.8) : P.elem === 'steel' ? ringing(t) : 0
  // One size of pool (a cached mask per size): the element shows in its brightness.
  if (pool > 0) lightAt(g, s.lit, cx, L.feet, Math.max(L.sw * 0.8, w * 0.42), pool * (0.7 + 0.3 * el))
  // The reveal lifts the whole room.
  if (t > REVEAL) {
    g.drawImage(s.lit, 0, 0)
    wash(g, '#000000', lerp(0.2, 0.4, span(t, REVEAL, REVEAL + 1)), 8)
  }
}

/** The Braille lighting, cell by cell, each with a glow. */
function drawBraille(g: G, t: number, L: Layout, P: Regi) {
  for (const c of L.cells) {
    if (t < c.at) continue
    // Each cell flares as it lights, then glows on, a dot twinkling now and then.
    const fl = 1 - span(t, c.at, c.at + 0.25)
    for (const [dx, dy] of c.dots) {
      const x = c.x + dx
      const y = c.y + dy
      if (fl > 0.3) g.drawImage(glow(4, P.rune, 1.2, 0.8), x - 3, y - 3)
      rect(g, x, y, 2, 2, fl > 0.5 ? '#ffffff' : P.rune)
      if ((Math.floor(t * 6) + c.x + dy) % 7 === 0) rect(g, x, y, 1, 1, '#ffffff')
    }
  }
  // The reading's head: a light moving over the tablet.
  const head = L.cells.find((c) => c.at > t)
  if (head && t > T_READ) g.drawImage(glow(7, '#ffffff', 1.4, 0.5), head.x - 5, head.y - 3)
}

/** The veins: light running through the joints to the floor and into its feet, then pulsing on. */
function drawVeins(g: G, s: S, t: number, P: Regi) {
  const q = ease.inQ(span(t, T_VEINS, T_ELEM))
  if (q <= 0) return
  const dim = t > REVEAL + 0.8
  s.veins.forEach((v, n) => {
    const lens = v.slice(1).map((pt, i) => Math.hypot(pt[0] - v[i]![0], pt[1] - v[i]![1]))
    const total = lens.reduce((a, b) => a + b, 0)
    let left = total * q
    const pts: [number, number][] = [v[0]!]
    for (let i = 0; i < lens.length && left > 0; i++) {
      const k = Math.min(1, left / lens[i]!)
      const [ax, ay] = v[i]!
      const [bx, by] = v[i + 1]!
      pts.push([lerp(ax, bx, k), lerp(ay, by, k)])
      left -= lens[i]!
    }
    polyline(g, pts, dim ? P.stone.light : P.rune)
    // Once full, pulses of light keep running down them into its feet.
    if (q >= 1 && t < REVEAL + 1.5) {
      const d = ((t * 140 + n * 37) % (total + 40)) - 20
      let acc = 0
      for (let i = 0; i < lens.length; i++) {
        if (d >= acc && d < acc + lens[i]!) {
          const k = (d - acc) / lens[i]!
          const x = Math.round(lerp(v[i]![0], v[i + 1]![0], k))
          const y = Math.round(lerp(v[i]![1], v[i + 1]![1], k))
          rect(g, x - 1, y, 3, 1, '#ffffff')
          rect(g, x, y - 1, 1, 3, '#ffffff')
        }
        acc += lens[i]!
      }
    }
    const [hx, hy] = pts[pts.length - 1]!
    if (q < 1) {
      g.drawImage(glow(6, P.rune, 1.2, 0.9), Math.round(hx) - 6, Math.round(hy) - 6)
      rect(g, Math.round(hx) - 1, Math.round(hy) - 1, 3, 3, '#ffffff')
    }
  })
}

/** Its seven dots in the dark, one by one, then flaring. */
function drawDots(g: G, t: number, L: Layout, P: Regi) {
  const big = pulse(t, T_FLARE, REVEAL + 0.1)
  P.dots.forEach(([dx, dy], i) => {
    const at = T_DOTS + i * DOT_STEP
    if (t < at) return
    const x = Math.round(L.cx + dx * SP)
    const y = Math.round(L.head + dy * SP)
    const fl = 1 - span(t, at, at + 0.2)
    const gr = 4 + Math.round(fl * 3 + big * 3)
    g.drawImage(glow(gr, P.dot, 1.4, 0.7), x - gr, y - gr)
    rect(g, x - 1, y - 1, 3, 3, fl > 0.6 ? '#ffffff' : P.dot)
    rect(g, x, y, 1, 1, P.hot)
    burstRing(g, x, y, span(t, at, at + 0.3), 12, 1, P.dot)
  })
  if (big > 0) {
    // The dots joined, for a moment, by the light between them.
    for (let i = 1; i < P.dots.length; i++) {
      const [ax, ay] = P.dots[i - 1]!
      const [bx, by] = P.dots[i]!
      if (Math.floor(t * 20 + i) % 3 === 0)
        line(g, L.cx + ax * SP, L.head + ay * SP, L.cx + bx * SP, L.head + by * SP, P.hot)
    }
  }
}

/** The body, drawn whole into its scratch canvas: a silhouette and an outline. */
function body(s: S, mon: string, L: Layout, sil: string, outline?: string) {
  const b = s.body.g
  b.clearRect(0, 0, s.body.width, s.body.height)
  drawSprite(b, mon, (L.sw + 4) / 2, L.sh + 2, { sil, outline })
  return { x: L.cx - ((L.sw + 4) >> 1), y: L.feet - L.sh - 2 }
}

// ---------------------------------------------------------------- Regirock: the walls crack, the rocks build it

function stepRock(s: S, t: number, dt: number, L: Layout, many: number) {
  const r = s.r
  if (t < T_ELEM || t > REVEAL) return
  // Stones falling from the ceiling with the sand.
  if (t < T_DOTS && r() < 0.08 * many) {
    const sh = makeShard(r, r.range(0, L.w), -4, 30, '#8a6438', '#c89a5a', 0)
    sh.vy = r.range(40, 90)
    sh.r += 1.5
    s.shards.push(sh)
  }
  // The sand splashing where it lands.
  if (t < T_DOTS + 0.2)
    for (const x of sands(L))
      if (r() < 0.5 * many)
        s.fx.add({
          x: x + r.range(-2, 2),
          y: L.base + 2,
          vx: r.range(-30, 30),
          vy: -r.range(10, 40),
          ay: 200,
          life: 0.4,
          size: 1,
          shape: 'px',
          colors: ['#e8c890', '#c89a5a'],
        })
  // Each boulder landing on the body: a puff of dust.
  for (const k of s.rocks)
    if (within(t, k.t1, k.t1 + dt))
      for (let i = 0; i < 4 * many + 1; i++)
        s.fx.add({
          x: k.x1 + r.range(-3, 3),
          y: k.y1,
          vx: r.range(-40, 40),
          vy: r.range(-30, 10),
          drag: 3,
          life: r.range(0.3, 0.6),
          size: r.int(2, 3),
          shape: 'smoke',
          colors: ['#c89a5a', '#8a6438'],
        })
  if (within(t, T_ELEM, T_ELEM + dt))
    for (let i = 0; i < 30 * many; i++)
      s.fx.add({
        x: r.range(0, L.w),
        y: L.base + r.range(0, 4),
        vx: r.range(-20, 20),
        vy: -r.range(5, 30),
        drag: 2,
        life: r.range(0.6, 1.2),
        size: r.int(2, 4),
        shape: 'smoke',
        colors: ['#a07a44', '#6a4c2c'],
      })
}

/** The sand pouring from the ceiling's cracks: a ragged stream, heaping on the floor. */
function drawSand(g: G, t: number, L: Layout) {
  const k = span(t, T_ELEM, T_ELEM + 0.25) * (1 - span(t, T_DOTS + 0.2, REVEAL))
  if (k <= 0) return
  const fall = Math.round(L.base * span(t, T_ELEM, T_ELEM + 0.25))
  for (const x of sands(L)) {
    for (let y = 0; y < fall; y++) {
      const wob = Math.round(Math.sin(y * 0.7 + t * 30) * 0.6)
      const wd = k > 0.6 ? 3 : 2
      rect(g, x - 1 + wob, y, wd, 1, (y + Math.floor(t * 90)) % 7 < 2 ? '#f0d8a0' : '#c89a5a')
      if ((y * 7 + Math.floor(t * 60)) % 11 === 0) rect(g, x + wob + (y % 2 ? 2 : -2), y, 1, 1, '#a07a44')
    }
    // The heap it makes.
    const hh = Math.round(1 + 4 * span(t, T_ELEM, T_DOTS))
    ellipse(g, x, L.base + 2, hh * 3, hh, '#a07a44')
    ellipse(g, x, L.base + 1, hh * 2, Math.max(1, hh - 1), '#c89a5a')
  }
}

function drawRock(g: G, x: number, y: number, rad: number, a: number) {
  const pts: [number, number][] = []
  for (let k = 0; k < 6; k++) {
    const rr = rad * (k % 2 ? 0.78 : 1)
    pts.push([x + Math.cos(a + k * 1.047) * rr, y + Math.sin(a + k * 1.047) * rr * 0.85])
  }
  // Its dark rim first, then the facets: those facing up and left catch the Braille's light.
  ellipse(g, x, y, Math.round(rad + 1), Math.round(rad * 0.85 + 1), '#20150a')
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = pts[k]!
    const [bx, by] = pts[(k + 1) % 6]!
    const lit = -((ax + bx) / 2 - x) - ((ay + by) / 2 - y)
    tri(g, x, y, ax, ay, bx, by, lit > rad * 0.4 ? '#d8aa68' : lit < -rad * 0.4 ? '#523a20' : '#8a6438')
  }
}

function drawRockBody(g: G, s: S, t: number, L: Layout, P: Regi, mon: string) {
  // The body, built from the feet up, its seam glowing where the stones are fusing.
  const q = build(t)
  if (q > 0) {
    const lit = t > T_DOTS
    const at = body(s, mon, L, P.sil, lit ? (Math.floor(t * 12) % 3 ? P.dot : P.rune) : '#8a6438')
    const bh = s.body.height
    const cut = Math.round(bh * (1 - q))
    g.drawImage(s.body, 0, cut, s.body.width, bh - cut, at.x, at.y + cut, s.body.width, bh - cut)
    if (q < 1) {
      g.save()
      g.beginPath()
      g.rect(at.x, at.y + cut, s.body.width, 2)
      g.clip()
      drawSprite(g, mon, L.cx, L.feet, { sil: '#ffffff', outline: P.rune })
      g.restore()
      g.drawImage(glow(10, P.rune, 1.3, 0.6), L.cx - 10, at.y + cut - 10)
    }
  }
  // The boulders in flight, on an arc, tumbling.
  for (const k of s.rocks) {
    if (t < k.t0 || t >= k.t1) continue
    const e = ease.inQ(span(t, k.t0, k.t1))
    const lift = Math.min(k.y0, k.y1) - 30
    const x = lerp(lerp(k.x0, (k.x0 + k.x1) / 2, e), lerp((k.x0 + k.x1) / 2, k.x1, e), e)
    const y = lerp(lerp(k.y0, lift, e), lerp(lift, k.y1, e), e)
    drawRock(g, x, y, k.r, k.a + t * 8)
  }
}

// ---------------------------------------------------------------- Regice: the snowflake, the column of ice

function stepIce(s: S, t: number, L: Layout, many: number) {
  const r = s.r
  if (t < T_ELEM) return
  // Snow out of nowhere, and the cold rolling over the floor away from its feet.
  if (r() < 0.5 * many)
    s.amb.add({
      x: r.range(0, L.w),
      y: -2,
      vx: r.range(-6, 6),
      vy: r.range(12, 26),
      life: 8,
      size: r.int(1, 2),
      shape: 'flake',
      colors: ['#ffffff', '#c8f4ff'],
    })
  if (t < REVEAL + 1 && r() < 0.3 * many) {
    const side = r() < 0.5 ? -1 : 1
    s.fx.add({
      x: L.cx + side * r.range(0, 20),
      y: L.feet + r.range(-1, 5),
      vx: side * r.range(15, 40),
      vy: r.range(-2, 2),
      drag: 0.6,
      life: r.range(1, 1.8),
      size: r.int(3, 5),
      shape: 'smoke',
      colors: ['#c8f4ff', '#8ad8f0', '#5fa8c8'],
      density: 0.6,
    })
  }
  // Diamond dust glinting in the air round the column.
  if (t > T_ELEM + 0.8 && t < REVEAL && r() < 0.4 * many)
    s.fx.add({
      x: L.cx + r.range(-L.sw * 0.7, L.sw * 0.7),
      y: L.feet - r.range(0, L.sh * 1.2),
      vy: -r.range(2, 8),
      life: 0.7,
      size: r.int(1, 2),
      shape: 'star',
      colors: ['#ffffff', '#c8f4ff', '#5fc0e0'],
    })
}

/** The snowflake of frost growing over the floor from its feet: six arms, their branches, ice spikes at the tips. */
function drawFlake(g: G, t: number, L: Layout) {
  const q = ease.outC(span(t, T_ELEM, T_ELEM + 1))
  if (q <= 0) return
  const R = Math.min(L.w * 0.48, 96)
  const cy = L.feet + 2
  // Perspective: the floor seen from a little above.
  const fy = 0.36
  const at = (a: number, d: number, ox = L.cx, oy = cy) =>
    [ox + Math.cos(a) * d, oy + Math.sin(a) * d * fy] as [number, number]
  for (let arm = 0; arm < 6; arm++) {
    const a = (arm / 6) * Math.PI * 2 + Math.PI / 6
    const len = R * q
    const [ex, ey] = at(a, len)
    line(g, L.cx, cy, ex, ey, '#3a8ab8', 3)
    line(g, L.cx, cy, ex, ey, '#c8f4ff')
    for (const [d, bl] of [
      [0.3, 0.3],
      [0.55, 0.24],
      [0.78, 0.15],
    ] as const) {
      const k = span(q, d, d + 0.2)
      if (k <= 0) continue
      const [ox, oy] = at(a, R * d)
      for (const side of [-1, 1]) {
        const [bx, by] = at(a + (side * Math.PI) / 3, R * bl * k, ox, oy)
        line(g, ox, oy, bx, by, '#3a8ab8', 2)
        line(g, ox, oy, bx, by, '#e8fbff')
      }
    }
    // An ice spike thrust up at each arm's tip once it is full grown.
    const sp = span(t, T_ELEM + 0.9, T_ELEM + 1.2)
    if (sp > 0) {
      const hh = Math.round((8 + (arm % 3) * 4) * ease.outBack(sp))
      tri(g, ex - 3, ey, ex + 3, ey, ex, ey - hh, '#8ad8f0')
      tri(g, ex, ey, ex + 3, ey, ex, ey - hh, '#3a8ab8')
      rect(g, ex - 1, ey - hh + 2, 1, Math.max(1, hh - 4), '#ffffff')
    }
    // Light running out along the arm.
    const [rx, ry] = at(a, ((t * 1.4 + arm * 0.17) % 1) * len)
    rect(g, rx - 1, ry, 3, 1, '#ffffff')
  }
  shine(g, L.cx, cy, 6, '#ffffff', 1.2, 0.8 * q)
}

function drawIceBody(g: G, t: number, L: Layout, mon: string) {
  const q = ease.outC(span(t, T_ELEM + 0.75, T_DOTS - 0.05))
  if (q <= 0) return
  const { cx, feet, sw, sh } = L
  const cw = Math.round(Math.max(34, sw * 0.9))
  const ch = Math.round((sh + 12) * q)
  const top = feet + 2 - ch
  const x0 = cx - (cw >> 1)
  const f0 = x0 + Math.round(cw * 0.22)
  const f1 = x0 + Math.round(cw * 0.78)
  const pt = Math.round(cw * 0.32)
  // The column: a hexagonal prism of ice, its side faces deeper, its front clear, its point a pyramid.
  rect(g, x0, top, f0 - x0, ch, '#3a8ab8')
  rect(g, f1, top, x0 + cw - f1, ch, '#235f8c')
  rect(g, f0, top, f1 - f0, ch, '#7ac8e8')
  if (q >= 1) {
    tri(g, x0, top, f0, top, cx, top - pt, '#8ad8f0')
    tri(g, f1, top, x0 + cw, top, cx, top - pt, '#3a8ab8')
    tri(g, f0, top, f1, top, cx, top - pt, '#c8f4ff')
  }
  // Its body seen through the ice, one shade darker.
  g.save()
  g.beginPath()
  g.rect(x0, top, cw, ch)
  g.clip()
  const lit = t > T_DOTS
  drawSprite(g, mon, cx, feet, {
    sil: '#1a5a88',
    alpha: 0.75,
    outline: lit ? (Math.floor(t * 12) % 3 ? '#ffffff' : '#c8f4ff') : '#5fc0e0',
  })
  g.restore()
  // Its edges, a streak of light down the front, a glint climbing it.
  for (const x of [x0, f0, f1, x0 + cw - 1]) rect(g, x, top, 1, ch, x === f0 ? '#ffffff' : '#c8f4ff')
  rect(g, x0, top, cw, 1, '#ffffff')
  rect(g, f0 + 3, top + 4, 2, Math.max(0, ch - 10), '#e8fbff')
  rect(g, f0 + 7, top + 10, 1, Math.max(0, ch - 22), '#c8f4ff')
  if (q >= 1) {
    line(g, x0, top, cx, top - pt, '#ffffff')
    line(g, x0 + cw - 1, top, cx, top - pt, '#8ad8f0')
    line(g, f0, top, cx, top - pt, '#ffffff')
  }
  const gy = feet - ((t * 50) % (ch + 10))
  if (gy > top) rect(g, f0 + 1, Math.round(gy), f1 - f0 - 2, 1, '#ffffff')
  rect(g, x0 - 3, feet, cw + 6, 3, '#c8f4ff')
  rect(g, x0 - 1, feet + 1, cw + 2, 1, '#ffffff')
  // Cracks through it, the instant before it bursts.
  const cr = span(t, T_FLARE, REVEAL - 0.05)
  if (cr > 0) {
    const r = rng(78)
    for (let i = 0; i < 6; i++) {
      const pts = bolt(
        r,
        cx + r.range(-4, 4),
        L.head,
        cx + r.range(-cw, cw) * 0.6,
        top + r.range(0, ch),
        0.4,
        3,
      )
      polyline(g, pts.slice(0, Math.max(2, Math.round(pts.length * cr))), '#ffffff')
    }
  }
}

// ---------------------------------------------------------------- Registeel: the ringing steel

function stepSteel(s: S, t: number, dt: number, L: Layout, many: number) {
  const r = s.r
  for (const at of RINGS)
    if (within(t, at, at + dt)) {
      // Dust shaken down from the ceiling, sparks off its body.
      for (let i = 0; i < 30 * many; i++)
        s.amb.add({
          x: r.range(0, L.w),
          y: r.range(-4, 4),
          vx: r.range(-4, 4),
          vy: r.range(20, 60),
          ay: 60,
          life: 2.5,
          size: 1,
          shape: 'px',
          colors: ['#7a7490', '#4a4460'],
        })
      for (let i = 0; i < 16 * many; i++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: L.cx + Math.cos(a) * L.sw * 0.4,
          y: L.feet - L.sh / 2 + Math.sin(a) * L.sh * 0.45,
          vx: Math.cos(a) * r.range(40, 110),
          vy: Math.sin(a) * r.range(40, 110) - 30,
          ay: 240,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', '#fff3a0', '#ffbe2e'],
        })
      }
    }
  // Its field: crackles drawn in round it.
  if (t > RINGS[2] && t < REVEAL && r() < 0.5 * many) {
    const a = r() * Math.PI * 2
    s.fx.add({
      x: L.cx + Math.cos(a) * L.sw * 0.6,
      y: L.feet - L.sh / 2 + Math.sin(a) * L.sh * 0.6,
      home: { x: L.cx, y: L.feet - L.sh / 2, k: 300 },
      life: 0.4,
      size: 1,
      shape: 'plus',
      colors: ['#ffffff', '#dfe6f2', '#8f9ab4'],
    })
  }
  if (within(t, REVEAL, REVEAL + dt))
    for (let i = 0; i < 50 * many; i++)
      s.fx.add({
        x: L.cx + r.range(-L.sw * 0.4, L.sw * 0.4),
        y: L.feet - r.range(0, L.sh),
        vx: r.range(-150, 150),
        vy: -r.range(40, 200),
        ay: 320,
        life: r.range(0.5, 1.1),
        size: 1,
        shape: r() < 0.7 ? 'px' : 'plus',
        colors: ['#ffffff', '#fff3a0', '#ffbe2e', '#c4382a'],
      })
}

/** The steel's ring made visible: rings going out, ripples over the floor; then its field, iron filings rising. */
function drawField(g: G, t: number, L: Layout) {
  const { cx, feet, sh, w } = L
  const mid = feet - sh / 2
  for (const at of RINGS) {
    for (const [d, c] of [
      [0, '#ffffff'],
      [0.08, '#dfe6f2'],
      [0.18, '#8f9ab4'],
    ] as const)
      burstRing(g, cx, mid, span(t, at + d, at + d + 0.7), Math.max(w, L.h) * 0.6, 2, c)
    // The ring through the floor, flattened by the perspective, and along the iron rails.
    const q = span(t, at, at + 0.8)
    if (q > 0 && q < 1) {
      const R = Math.round(lerp(10, w * 0.7, ease.outC(q)))
      ellipseLine(g, cx, feet + 2, R, Math.max(2, Math.round(R * 0.28)), q < 0.5 ? '#ffffff' : '#8f9ab4')
      ellipseLine(g, cx, feet + 3, R - 2, Math.max(2, Math.round(R * 0.28) - 1), '#4a4460')
      const rx = Math.round(lerp(0, w * 0.6, ease.outC(q)))
      for (const y of rails(L))
        for (const side of [-1, 1]) {
          rect(g, cx + side * rx - 6, y, 12, 1, '#ffffff')
          rect(g, cx + side * rx - 3, y - 1, 6, 3, '#ffffff')
        }
    }
  }
  // The filings: short needles on the floor, standing up and leaning towards it as its field grows.
  const k = span(t, RINGS[1], T_DOTS) * (1 - span(t, REVEAL + 0.2, REVEAL + 1))
  if (k > 0) {
    const r = rng(379)
    for (let i = 0; i < 40; i++) {
      const x = r.range(-w * 0.5, w * 0.5)
      const y = feet + r.range(-1, L.h - feet - 4)
      const hh = Math.round(k * (4 - Math.min(3, Math.abs(x) / 30)) * (0.7 + 0.3 * Math.sin(t * 20 + i)))
      if (hh <= 0) continue
      const lean = Math.sign(-x) * Math.min(2, Math.round(hh / 2))
      line(g, cx + x, y, cx + x + lean, y - hh, i % 3 ? '#8f9ab4' : '#dfe6f2')
    }
    // The field's lines, arcing over it from the floor, flickering.
    if (t < REVEAL)
      for (let i = 0; i < 3; i++) {
        if ((Math.floor(t * 24) + i) % 3 === 0) continue
        const rx = Math.round(L.sw * (0.6 + i * 0.16))
        ellipseLine(
          g,
          cx,
          feet,
          rx,
          Math.round(sh * (0.62 + i * 0.12)),
          i ? '#8f9ab4' : '#dfe6f2',
          Math.PI * 1.05,
          Math.PI * 1.95,
        )
      }
  }
}

function drawSteelBody(g: G, t: number, L: Layout, P: Regi, mon: string) {
  if (t < RINGS[0]) return
  // Each ring: its body shudders, its outline white-hot, a glint sweeping over the steel.
  const last = [...RINGS].reverse().find((at) => t >= at)!
  const e = t - last
  const jit = e < 0.25 ? (Math.floor(e * 40) % 2 ? 1 : -1) : 0
  const lit = t > T_DOTS
  const ol =
    e < 0.12
      ? '#ffffff'
      : lit
        ? Math.floor(t * 12) % 3
          ? P.dot
          : '#ffd0d0'
        : e < 0.4
          ? P.aura[2]
          : P.aura[3]
  drawSprite(g, mon, L.cx + jit, L.feet, { sil: P.sil, outline: ol })
  if (e < 0.4) gleam(g, mon, { x: L.cx + jit, y: L.feet }, 0, e / 0.4)
}

export const regirockCinema = regiCinema(REGIROCK)
export const regiceCinema = regiCinema(REGICE)
export const registeelCinema = regiCinema(REGISTEEL)

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
