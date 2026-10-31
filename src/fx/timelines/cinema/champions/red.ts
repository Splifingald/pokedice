// Red's entrance (docs/56), on the battle stage: Mt. Silver, the silent legend. A blizzard on the mountain at night:
// the camera climbs its snowfields and black rock ribs up into the storm wrapped round its summit, where something
// yellow flickers. Into the white; and out on the summit, a lone figure at the cliff's edge with his back to us, the
// snow tearing past him sideways. He doesn't move. On his shoulder a small shape with long ears: two red cheeks spark,
// once, again, crackling. Then Pikachu's Thunder goes up into the storm, a column of lightning from his shoulder to the
// sky, and the storm is blown open from the inside: the clouds torn back in a ring, the snow flung away, and behind
// it all the dawn over a sea of clouds, far peaks standing out of it. Silence; the snow left in the air glitters as it
// settles. He turns round, slowly. Three dots over his head, one at a time — that's all he says. The sun clears the
// clouds right behind him: the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  canvas,
  clamp,
  ease,
  ellipse,
  lerp,
  Particles,
  polyline,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
} from '../../../pixel'
import { drawSprite, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { dGradient, dissolve, tri } from '../kit'

const REVEAL = 4.7
/** The climb: the camera tilting up the mountain; the white it goes into; the summit. */
const T_TILT = 1.15
const T_WHITE = 1.08
const T_SHOT2 = 1.42
/** Pikachu: its cheeks spark; it chirps; the charge; the Thunder; the storm torn open. */
const T_SPARK = 1.92
const T_SPARK2 = 2.3
const T_CHARGE = 2.62
const T_THUNDER = 2.98
const T_HOLE = 3.04
/** He turns; his three dots; the sun. */
const T_TURN = 3.72
const TURN_DUR = 0.5
const T_DOTS = [4.1, 4.26, 4.42] as const
const T_SUN = 4.15

/** The sea of clouds' horizon on the summit, the mountain's canvas height, its summit. */
const HZ = 60
const MH = 440
const PEAK_X = 124
const PEAK_Y = 150

const SIL = '#121626'
const RIM = '#ffb47a'

/** How much of the storm is left: all of it until the Thunder blows it apart. */
const stormK = (t: number) => 1 - ease.outQ(span(t, T_THUNDER + 0.05, T_THUNDER + 0.55))

/** A smooth 1-D value noise from a seed table (the same hills every time). */
function noise1(tab: readonly number[], x: number) {
  const i = Math.floor(x)
  const f = x - i
  const a = tab[((i % tab.length) + tab.length) % tab.length]!
  const b = tab[(((i + 1) % tab.length) + tab.length) % tab.length]!
  return a + (b - a) * (f * f * (3 - 2 * f))
}

/** A 2-D value noise from a seed: smooth hills of 0..1 a unit or so across, repeating every nx × ny units. */
function noise2(seed: number, nx = 64, ny = 64) {
  const r = rng(seed)
  const tab = Array.from({ length: nx * ny }, () => r())
  const at = (i: number, j: number) => tab[(((j % ny) + ny) % ny) * nx + (((i % nx) + nx) % nx)]!
  return (x: number, y: number) => {
    const i = Math.floor(x)
    const j = Math.floor(y)
    const fx = x - i
    const fy = y - j
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(i, j)
    const b = at(i + 1, j)
    const c = at(i, j + 1)
    const d = at(i + 1, j + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

// ---------------------------------------------------------------- shot one: the mountain in the storm

/**
 * Mt. Silver, drawn once: its peak towering over lesser ones round its flanks. Each column belongs to whichever peak
 * stands highest there; that peak's face towards the faint light on the left is lit, the other in blue shade. Gullies
 * run down each face along its fall line, bare rock showing in the deepest of them (more of it lower down), and the
 * foot is lost in the drifting snow.
 */
function mountain(): Canvas {
  const nz = noise2(2601)
  // Peaks: x, summit, how steeply its faces fall (px down per px out).
  const PK = [
    [PEAK_X, PEAK_Y, 1.75],
    [76, 236, 1.25],
    [184, 214, 1.4],
    [18, 300, 1.05],
    [230, 286, 1.15],
    [136, 324, 1.6],
  ] as const
  const cols = Array.from({ length: W }, (_, x) => {
    let best = Infinity
    let face = 0
    let pi = 0
    PK.forEach(([px, py, sl], i) => {
      const v = py + Math.abs(x + 0.5 - px) * sl
      if (v < best) [best, face, pi] = [v, Math.sign(x + 0.5 - px), i]
    })
    return [best + (nz(x / 3, 0) - 0.5) * 5 + (nz(x / 1.1, 5) - 0.5) * 1.6, face, pi] as const
  })
  return shade(W, MH, (x, y) => {
    const [top, face, pi] = cols[x]!
    if (y < top) return null
    const d = y - top
    const lit = face < 0
    // The foot, swallowed by drifting snow in two ragged banks.
    if (y > 404 + (nz(x / 7, 9) - 0.5) * 14) return '#8894ac'
    if (y > 372 + (nz(x / 6, 3) - 0.5) * 12) return '#73819c'
    if (d < 1) return lit ? '#f6f9ff' : '#8a98bc'
    // Gullies along the fall line: the noise is read along lines running down and outwards.
    const n = nz((x - d * face * 0.75) / 3.2, d / 9 + pi * 7)
    const rockT = 0.76 - clamp((y - 250) / 150) * 0.24
    if (n > rockT) return lit ? '#585c78' : '#25273c'
    if (n > rockT - 0.07) return lit ? '#9eacca' : '#44527a'
    if (lit) return n < 0.32 ? '#c2cee4' : '#e2eaf8'
    return n < 0.32 ? '#56668e' : '#6a7aa0'
  })
}

/** The ranges behind, lower and hazier, sliding slower as the camera climbs. */
function farRanges(): Canvas {
  const cv = canvas(W, MH)
  const g = cv.g
  const r = rng(2603)
  for (const [cx, top, k, col, snow] of [
    [20, 250, 1.3, '#3e4862', '#7a86a6'],
    [214, 236, 1.1, '#3a445e', '#76829e'],
  ] as const) {
    const tab = Array.from({ length: 32 }, () => r.range(-1, 1))
    for (let y = top; y < MH; y++) {
      const dy = y - top
      const hw = k * dy + noise1(tab, dy / 6) * 4
      rect(g, cx - hw, y, hw * 2, 1, dy < 26 ? snow : col)
      rect(g, cx - hw, y, Math.max(1, hw * 0.7), 1, dy < 26 ? '#9aa6c2' : '#4a5470')
    }
  }
  return cv
}

/** The storm's cloud: long smears dragged sideways by the wind, three greys with crisp edges, drawn once, scrolled. */
function stormTexture(seed: number, dark: string | null, mid: string, light: string): Canvas {
  // Its noise repeats every 16 cells across: 2W spans 16 (and 32 for the finer octave), so the strip tiles.
  const nz = noise2(seed, 16, 64)
  return shade(W * 2, H, (x, y) => {
    const u = (x / (W * 2)) * 16
    const v = nz(u, y / 6) * 0.6 + nz(u * 2, y / 3 + 20) * 0.4 - (y / H) * 0.1
    const e = (bayer(x, y) - 0.5) * 0.02
    return v > 0.63 + e ? light : v > 0.48 + e ? mid : dark
  })
}

/**
 * Banks of driven snow blowing across the view, faster than the cloud behind: long pale bands, their edges ragged,
 * a checkered fringe on each.
 */
function fogBands(g: G, t: number, k: number, bands: readonly (readonly [number, number, number, number])[]) {
  if (k <= 0) return
  for (const [y0, hh, speed, ph] of bands) {
    const h = Math.round(hh * k)
    if (h < 1) continue
    const off = t * speed + ph
    for (let x = 0; x < W; x++) {
      const u = (x + off) / 23
      const top = Math.round(y0 - h / 2 + Math.sin(u) * 3 + Math.sin(u * 2.7 + 1) * 2)
      const bot = Math.round(y0 + h / 2 + Math.sin(u * 1.3 + 2) * 2)
      if (bot <= top) continue
      rect(g, x, top, 1, bot - top, '#9aa6bc')
      if ((x + top) & 1) rect(g, x, top - 1, 1, 1, '#9aa6bc')
      if ((x + bot) & 1) rect(g, x, bot, 1, 1, '#9aa6bc')
    }
  }
}

/**
 * The cloud cap wrapped round the summit, churning: banks of storm cloud circling the peak, the ones swinging in
 * front drawn over it, those behind under the paler core.
 */
function cap(g: G, cx: number, cy: number, t: number, lit: boolean) {
  const banks = Array.from({ length: 8 }, (_, i) => {
    const a = t * 2.1 + (i * Math.PI * 2) / 8
    return { a, z: Math.sin(a), i }
  }).sort((p, q) => p.z - q.z)
  // Its heart, lit from inside when something in there flashes.
  const core = () => {
    ellipseC(g, cx, cy - 4, 46, 14, lit ? '#a8a690' : '#6e7892')
    ellipseC(g, cx - 3, cy - 8, 36, 9, lit ? '#d0cca8' : '#8c96ae')
    ellipseC(g, cx - 7, cy - 12, 22, 5, lit ? '#f0eac0' : '#aeb6c8')
  }
  let drawn = false
  for (const b of banks) {
    if (!drawn && b.z > 0) {
      core()
      drawn = true
    }
    const x = cx + Math.cos(b.a) * 52
    const y = cy - 4 + b.z * 7 + (b.i % 3) * 2
    const rx = 24 + (b.i % 3) * 8
    const ry = 6 + (b.i % 2) * 3
    ellipseC(g, x, y + 2, rx, ry, '#3a4258')
    ellipseC(g, x, y, rx, ry, b.z > 0 ? '#7a849c' : '#5a6480')
    ellipseC(g, x - 3, y - ry + 2, rx * 0.6, 2, b.z > 0 ? '#a4acc0' : '#76809a')
  }
  if (!drawn) core()
}

/** An ellipse clipped to the screen's rows (a huge one costs only the rows it covers). */
function ellipseC(g: G, cx: number, cy: number, rx: number, ry: number, c: string | CanvasPattern) {
  cx = Math.round(cx)
  cy = Math.round(cy)
  rx = Math.round(rx)
  ry = Math.max(1, Math.round(ry))
  g.fillStyle = c
  for (let dy = Math.max(-ry, -cy - 1); dy <= Math.min(ry, H - cy); dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.25))))
    const x0 = Math.max(-1, cx - hw)
    const x1 = Math.min(W + 1, cx + hw + 1)
    if (x1 > x0) g.fillRect(x0, cy + dy, x1 - x0, 1)
  }
}

// ---------------------------------------------------------------- shot two: the summit

/** The dawn sky over the summit: night still at the top, a few stars, gold at the horizon. */
function dawnSky(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, HZ + 2, ['#0a0e2e', '#181c4c', '#3a2a66', '#86406a', '#e0705a', '#ffb070']), 0, 0)
  const r = rng(2605)
  for (let i = 0; i < 30; i++) {
    const y = r.range(1, 28)
    rect(g, r.range(0, W), y, 1, 1, y < 14 ? '#c8d0ff' : '#7a7ab0')
  }
  return cv
}

/**
 * The sea of clouds below the summit, lit from the horizon where the sun is coming: puffs in rows, small and flat
 * far off, big near, their tops gold near the sun and rose further away; far peaks standing out of it.
 */
function cloudSea(sunX: number): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  const r = rng(2607)
  rect(g, 0, HZ, W, H - HZ, '#3e3466')
  // Far peaks standing out of the clouds: jagged, a ridge splitting each into its sunward face (rose, snow gold) and
  // its shaded one, gullies down both.
  const nz = noise2(2615)
  for (const [px, top, hw, sl] of [
    [34, HZ - 17, 30, 0.75],
    [90, HZ - 9, 18, 0.7],
    [226, HZ - 14, 28, 0.7],
    [136, HZ - 5, 12, 0.6],
  ] as const) {
    const toSun = px < sunX ? 1 : -1
    for (let x = px - hw; x <= px + hw; x++) {
      const dx = x - px
      const h = Math.round(top + Math.abs(dx) * sl + (nz(x / 3, 1) - 0.5) * 3 + (nz(x / 1.3, 4) - 0.5) * 1.4)
      for (let y = Math.max(top - 3, h); y < HZ + 8; y++) {
        const dy = y - top
        const split = px + dy * 0.22 * toSun + (nz(y / 3, 8) - 0.5) * 3
        const sunny = toSun > 0 ? x > split : x < split
        const snow = dy < 5 + nz(x / 2, y / 3) * 7
        const gully = nz((x - dy * 0.6 * Math.sign(dx || 1)) / 2, dy / 4 + 9) > 0.64
        const c = sunny
          ? snow
            ? gully
              ? '#e8a8a0'
              : '#ffd8bc'
            : gully
              ? '#6a3e62'
              : '#a05a76'
          : snow
            ? gully
              ? '#545494'
              : '#6c6cac'
            : gully
              ? '#1c1c46'
              : '#2a2858'
        rect(g, x, y, 1, 1, c)
      }
    }
  }
  // Rows of puffs, back to front.
  for (let row = 0; row < 11; row++) {
    const y = HZ + 1 + Math.round(row ** 1.45 * 1.6)
    const rx = 5 + row * 2.4
    const ry = 1 + Math.round(row * 0.6)
    for (let x = -rx + r.range(-rx, 0); x < W + rx; x += rx * r.range(1.1, 1.6)) {
      const near = Math.abs(x - sunX) < 50
      ellipse(g, x, y + 1, rx, ry + 1, '#3a3062')
      ellipse(g, x, y, rx, ry, row < 3 ? '#8a5a86' : '#6a4a7e')
      ellipse(
        g,
        x - 1,
        y - Math.max(1, ry * 0.4),
        rx * 0.8,
        Math.max(1, ry * 0.6),
        near ? '#ffc890' : '#d08a96',
      )
      if (ry >= 2)
        ellipse(g, x - 2, y - ry * 0.6, rx * 0.5, Math.max(1, ry * 0.3), near ? '#fff0c8' : '#f0b0a8')
    }
  }
  return cv
}

/**
 * The summit underfoot: the crest of the mountain climbing from the lower left to the flat top where he stands at the
 * edge, the cliff falling away on his right; a craggy outcrop breaking the skyline to his left, drifts across the snow.
 * Two lights: the storm's grey, and the dawn behind (a rim of gold along every edge against the sky, the snow facing
 * us in blue shade).
 */
function summit(dawn: boolean, fx: number, fy: number): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  const r = rng(2609)
  const tab = Array.from({ length: 40 }, () => r.range(-1, 1))
  const edge = fx + 27
  const flat = fx - 34
  const lip = (x: number) =>
    Math.round(
      fy +
        noise1(tab, x / 9) * 1.2 +
        (x < flat ? (flat - x) * 0.36 + noise1(tab, x / 4 + 9) * 2 : 0) +
        (x > edge ? (x - edge) * 2.6 + noise1(tab, x / 3 + 17) * 3 : 0),
    )
  const C = dawn
    ? {
        base: '#46568a',
        ridge: '#6676aa',
        hollow: '#34427a',
        rim: '#ffd8b8',
        rim2: '#c88a9a',
        rock: '#181a32',
        cliff: '#1c2040',
      }
    : {
        base: '#8a94aa',
        ridge: '#a2abbe',
        hollow: '#78829a',
        rim: '#c4cad6',
        rim2: '#a4acbc',
        rock: '#465064',
        cliff: '#5a6278',
      }
  for (let x = 0; x < W; x++) {
    const top = lip(x)
    if (top >= H) continue
    const cliff = x > edge
    rect(g, x, top, 1, H - top, cliff ? C.cliff : C.base)
    rect(g, x, top, 1, 1, C.rim)
    rect(g, x, top + 1, 1, 1, cliff ? C.cliff : C.rim2)
    // The cliff's face: ledges of snow across it.
    if (cliff) for (let y = top + 6; y < H; y += 9) rect(g, x, y + ((x * 3) % 4), 1, 1, C.hollow)
  }
  // Drifts: low ridges of snow running along the crest's slope, a lit top and a hollow under each.
  for (let i = 0; i < 12; i++) {
    const off = 7 + i * 5 + r.int(-1, 2)
    const x0 = r.range(-30, edge - 30)
    const len = r.range(30, 90)
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + k)
      if (x < 0 || x > edge - 4) continue
      const yy = lip(x) + off + Math.round(Math.sin(k * 0.1) * 1.5)
      rect(g, x, yy, 1, 1, C.ridge)
      if (k % 4) rect(g, x, yy + 1, 1, 1, C.hollow)
    }
  }
  // A craggy outcrop on the crest to his left: broken rock, black against the sky, the dawn catching the edges that
  // fall towards it, snow lodged on the rest.
  const nz = noise2(2617)
  for (const [cx, w, h] of [
    [56, 20, 9],
    [86, 30, 19],
    [110, 14, 8],
  ] as const) {
    const tops: number[] = []
    for (let x = cx - w / 2; x <= cx + w / 2; x++) {
      const u = (x - cx) / (w / 2)
      const k = (1 - Math.abs(u) ** 1.6) * (0.65 + 0.35 * nz(x / 2.2, cx))
      tops.push(Math.round(lip(Math.round(x)) + 3 - h * k - (nz(x / 0.9, cx + 5) - 0.5) * 2))
    }
    tops.forEach((ty, i) => {
      const x = Math.round(cx - w / 2 + i)
      const by = lip(x) + 3
      if (by <= ty) return
      rect(g, x, ty, 1, by - ty, C.rock)
      const next = tops[i + 1] ?? by
      const prev = tops[i - 1] ?? by
      if (next > ty) rect(g, x, ty, 1, Math.min(3, by - ty), C.rim)
      else if (prev >= ty) rect(g, x, ty, 1, 1, dawn ? '#7a8cc0' : '#b4bccc')
      // Cracks down its face.
      if (nz(x / 1.5, 40) > 0.7) rect(g, x, ty + 3, 1, Math.max(0, by - ty - 4), dawn ? '#0c0e22' : '#3a4252')
    })
  }
  // Rocks breaking through the snow nearer us.
  for (const [rx, ry, w, h] of [
    [30, 150, 26, 14],
    [118, 154, 16, 8],
    [196, 152, 12, 6],
  ] as const) {
    for (let k = 0; k < h; k++) {
      const hw = Math.round(w * Math.sqrt(1 - ((k - h) / h) ** 2) * 0.5)
      rect(g, rx - hw, ry - h + k, hw * 2, 1, C.rock)
      if (k < 3) rect(g, rx - hw + 1, ry - h + k, hw * 2 - 2, 1, dawn ? '#7a8cc0' : '#b4bccc')
    }
  }
  return cv
}

/**
 * Pikachu, small, sitting on his shoulder: from behind (ears, round back, its stripes, the zigzag tail up) or from
 * the front (eyes, nose, red cheeks). `dark` 1 draws it black against the storm, cheeks still glowing.
 */
const PIKA_BACK = [
  'K.............K',
  'KK...........KK',
  '.YY.........YY.',
  '.YY.........YY.',
  '..YY.......YY..',
  '..YY.......YY..',
  '...YY.....YY...',
  '....YYYYYYY....',
  '...YYYYYYYYY...',
  '..YYYYYYYYYYY..',
  '.RYYYYYYYYYYYR.',
  '..yYYYYYYYYYy..',
  '...yYYYYYYYy...',
  '...yBBBBBBBy...',
  '...yYYYYYYYy...',
  '...yBBBBBBBy...',
  '....yyyyyyy....',
]
const PIKA_FRONT = [
  'K.............K',
  'KK...........KK',
  '.YY.........YY.',
  '.YY.........YY.',
  '..YY.......YY..',
  '..YY.......YY..',
  '...YY.....YY...',
  '....YYYYYYY....',
  '...YYYYYYYYY...',
  '..YYEWYYYEWYY..',
  '..YYEEYYYEEYY..',
  '.RRYYYYKYYYYRR.',
  '.rRYYYYYYYYYRr.',
  '..yYYYYYYYYYy..',
  '...yYYYYYYYy...',
  '...YY.yyy.YY...',
  '...yy.....yy...',
]
/** The tail, a zigzag of lightning standing up beside it (drawn mirrored on the other side from the front). */
const TAIL = ['.....YYY', '....YYY.', '...YYY..', '..YYYYYY', '.....YY.', '....YY..', '...YY...', '..BB....']
const PIKA_PAL: Record<string, string> = {
  K: '#202028',
  Y: '#f8d838',
  y: '#c89a20',
  B: '#8a5a20',
  R: '#e83a28',
  r: '#a82418',
  E: '#181820',
  W: '#ffffff',
}

function pika(g: G, x: number, y: number, front: boolean, dark: boolean, cheeks: number, rim: boolean) {
  const map = front ? PIKA_FRONT : PIKA_BACK
  const w = map[0]!.length
  const h = map.length
  const x0 = x - (w >> 1)
  const y0 = y - h
  // The tail first: standing up behind its back on the right from behind, peeking out on the left from the front.
  const tw = TAIL[0]!.length
  const tx = front ? x0 - 3 : x0 + w - 5
  const ty = y0 + h - TAIL.length - 3
  for (let j = 0; j < TAIL.length; j++)
    for (let i = 0; i < tw; i++) {
      const c = TAIL[j]![front ? tw - 1 - i : i]!
      if (c === '.') continue
      rect(g, tx + i, ty + j, 1, 1, dark ? SIL : PIKA_PAL[c]!)
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = map[j]![i]!
      if (c === '.') continue
      const cheek = c === 'R' || c === 'r'
      const col = cheek && cheeks > 0 ? (cheeks > 0.6 ? '#ffe070' : '#ff5a38') : dark ? SIL : PIKA_PAL[c]!
      rect(g, x0 + i, y0 + j, 1, 1, col)
    }
  // The dawn round its edge, from behind.
  if (rim)
    for (let j = 0; j < h; j++) {
      const row = map[j]!
      const a = row.search(/[^.]/)
      const b = row.length - 1 - [...row].reverse().join('').search(/[^.]/)
      if (a >= 0) {
        rect(g, x0 + a - 1, y0 + j, 1, 1, RIM)
        rect(g, x0 + b + 1, y0 + j, 1, 1, RIM)
      }
    }
}

type X = {
  buf: Canvas
  hole: Canvas
  /** Pikachu alone, to fade it out with the scene after the reveal. */
  pk: Canvas
  mount: Canvas
  far: Canvas
  stormSky: Canvas
  smear: Canvas
  smear2: Canvas
  dawn: Canvas
  sea: Canvas
  summitDawn: Canvas
  summitStorm: Canvas
  snow: Particles
  glitter: Particles
  bolts: [number, number][][]
  forks: [number, number][][]
  /** The hole's scalloped edge: where each puff of torn cloud sits round it, and how big. */
  puffs: [number, number][]
}

/** Where Pikachu sits on his shoulder: his left, which is on our left while his back is turned. */
function shoulder(s: ChampionState<X>, t: number) {
  const tz = spriteSize(s.p.trainer)
  const q = ease.ioS(span(t, T_TURN, T_TURN + TURN_DUR))
  const cs = Math.cos(q * Math.PI)
  return {
    x: s.L.foe.x + Math.round(-tz.w * 0.34 * cs),
    y: s.L.foe.y + 2 - Math.round(tz.h * 0.6),
    front: cs < 0,
  }
}

export const redChampion = championCinema<X>({
  id: 'red',
  reveal: REVEAL,
  seed: 2600,
  aura: ['#ffffff', '#ffd0a0', '#e03a30', '#4a0c10'],
  flash: '#fff4e4',
  sample: { trainer: '/trainers/classes/johto/red.png', name: 'Red', lead: 25, ace: 6, team: 3 },
  extras: [25],
  setup(st, r) {
    st.screenShakes.push([T_THUNDER, 0.6, 4], [REVEAL, 0.4, 2])
    const F0 = st.L.foe
    const sky = canvas(W, H)
    sky.g.drawImage(dGradient(W, H, ['#1e2436', '#2c3448', '#3c465c', '#4e586e']), 0, 0)
    // The Thunder: a few shapes of the bolt to flicker between, from his shoulder up out of the frame, and forks.
    const bx = F0.x - 9
    const by = F0.y - 50
    const bolts = Array.from({ length: 4 }, () => bolt(r, bx, by, bx + r.range(-14, 14), -12, 0.28, 5))
    const forks = Array.from({ length: 6 }, (_, i) => {
      const from = bolts[i % 4]![r.int(8, 20)]!
      return bolt(r, from[0], from[1], from[0] + r.range(-60, 60), from[1] - r.range(20, 50), 0.4, 3)
    })
    return {
      buf: canvas(W, H),
      hole: canvas(W, H),
      pk: canvas(32, 32),
      mount: mountain(),
      far: farRanges(),
      stormSky: sky,
      smear: stormTexture(2611, '#343c52', '#465068', '#5c667e'),
      smear2: stormTexture(2613, null, '#56607a', '#76809a'),
      dawn: dawnSky(),
      sea: cloudSea(F0.x),
      summitDawn: summit(true, F0.x, F0.y + 1),
      summitStorm: summit(false, F0.x, F0.y + 1),
      snow: new Particles(),
      glitter: new Particles(),
      bolts,
      forks,
      puffs: Array.from({ length: 22 }, (_, i) => [
        (i / 22) * Math.PI * 2 + r.range(-0.08, 0.08),
        r.range(0.14, 0.26),
      ]),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.snow.update(dt)
    s.glitter.update(dt)
    const st = stormK(t)
    // The blizzard: flakes and streaks tearing past sideways; while the camera climbs, sliding down past it too.
    const climb = t < T_TILT ? 160 * Math.sin(Math.PI * span(t, 0, T_TILT)) : 0
    for (let i = 0; i < Math.round(9 * st); i++) {
      const near = r() < 0.35
      s.snow.add({
        x: r.range(0, W + 120),
        y: r.range(-30, H),
        vx: -r.range(260, 380) * (near ? 1.3 : 0.8),
        vy: r.range(50, 110) + climb,
        life: r.range(0.6, 1.1),
        size: near ? 2 : 1,
        shape: near ? 'streak' : r() < 0.5 ? 'streak' : 'px',
        trail: near ? 0.025 : 0.018,
        colors: near ? ['#f4f8ff', '#dce4f2'] : ['#c4cee0', '#a4b0c8'],
      })
    }
    // The Thunder flings the storm's snow out from him, every flake at once.
    const F0 = s.L.foe
    if (within(t, T_THUNDER, T_THUNDER + dt)) {
      for (const p of s.snow.list) {
        const dx = p.x - F0.x
        const dy = p.y - (F0.y - 50)
        const d = Math.hypot(dx, dy) || 1
        p.vx = (dx / d) * r.range(420, 640)
        p.vy = (dy / d) * r.range(320, 520)
        p.life = Math.min(p.life, p.age + 0.6)
      }
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: F0.x - 9,
          y: F0.y - 52,
          vx: Math.cos(a) * r.range(80, 220),
          vy: Math.sin(a) * r.range(80, 220),
          drag: 2,
          life: r.range(0.3, 0.6),
          size: 1,
          shape: r() < 0.5 ? 'plus' : 'px',
          colors: ['#ffffff', '#fff070', '#ffc020'],
        })
      }
    }
    // Afterwards: what snow is left in the air, settling, glittering in the dawn.
    if (t > T_HOLE + 0.25 && r() < 0.7)
      s.glitter.add({
        x: r.range(0, W),
        y: r.range(-10, 70),
        vx: r.range(-6, 2),
        vy: r.range(8, 18),
        life: r.range(1.6, 2.6),
        size: r() < 0.2 ? 2 : 1,
        shape: r() < 0.25 ? 'star' : 'px',
        colors: ['#ffffff', '#ffe0c8', '#c8b0d8', '#8a7aa8'],
      })
    // Pikachu's sparks: a few off its cheeks when they flare; a spray while it charges.
    const sp = shoulder(s, t)
    const charging = t > T_CHARGE && t < T_THUNDER
    if (within(t, T_SPARK, T_SPARK + dt) || within(t, T_SPARK2, T_SPARK2 + dt) || (charging && r() < 0.6))
      for (let i = 0; i < (charging ? 2 : 8); i++)
        s.fx.add({
          x: sp.x + (r() < 0.5 ? -6 : 6),
          y: sp.y - 5,
          vx: r.range(-60, 60),
          vy: r.range(-70, 30),
          ay: 120,
          life: r.range(0.2, 0.45),
          size: 1,
          shape: 'px',
          colors: ['#ffffff', '#fff070', '#ffb020'],
        })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    if (t < T_SHOT2) climbShot(b, s, t)
    else summitShot(b, s, t)
    const sh = screenShake(t, s.screenShakes)
    if ((sh.x || sh.y) && k >= 1) rect(g, 0, 0, W, H, '#0a0c18')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_SHOT2) return
    const F0 = s.L.foe
    const sh = screenShake(t, s.screenShakes)
    const x = F0.x + sh.x
    const y = F0.y + 2 + sh.y
    const clear = t > T_HOLE + 0.15
    // His back to us, black against the storm, then rimmed by the dawn; one slow half-turn round to face us.
    const q = ease.ioS(span(t, T_TURN, T_TURN + TURN_DUR))
    const cs = Math.cos(q * Math.PI)
    const backTurned = cs > 0
    drawSprite(g, s.p.trainer, x, y, {
      sx: Math.max(0.06, Math.abs(cs)),
      flip: backTurned,
      sil: backTurned ? SIL : undefined,
      outline: clear ? RIM : undefined,
    })
    // Pikachu on his shoulder: dark in the storm, its cheeks the only colour; lit once it clears.
    const sp = shoulder(s, t)
    // Lit by its own sparks when they flare, and all through the charge.
    const self =
      Math.abs(t - T_SPARK - 0.05) < 0.07 ||
      Math.abs(t - T_SPARK2 - 0.05) < 0.09 ||
      within(t, T_CHARGE, T_THUNDER + 0.3)
    pika(
      g,
      sp.x + sh.x,
      sp.y + sh.y,
      sp.front,
      !self && (!clear || !sp.front),
      cheekAt(t),
      clear && !sp.front,
    )
    sparks(g, s, t, sp.x + sh.x, sp.y + sh.y)
    // His three dots, one at a time: all he has to say.
    const tz = spriteSize(s.p.trainer)
    T_DOTS.forEach((at, i) => {
      if (t < at) return
      const dx = x + (i - 1) * 6
      const dy = y - tz.h - 8
      const pop = t - at < 0.05 ? 1 : 0
      rect(g, dx - 2 - pop, dy - 2 - pop, 4 + pop * 2, 4 + pop * 2, '#141828')
      rect(g, dx - 1 - pop, dy - 1 - pop, 2 + pop * 2, 2 + pop * 2, '#ffffff')
    })
  },
  front(g, s, t, k) {
    // The blizzard over everything, then the glitter left after it.
    if (k > 0) {
      s.snow.draw(g)
      s.glitter.draw(g)
    }
    // After the reveal Pikachu stays on his shoulder, part of the scene, until that fades into the fight's ground.
    if (t >= REVEAL && k > 0) {
      const sp = shoulder(s, t)
      const pc = s.pk.g
      pc.clearRect(0, 0, 32, 32)
      pika(pc, 16, 26, true, false, cheekAt(t), false)
      const sh = screenShake(t, s.screenShakes)
      dissolve(g, s.pk, k, sp.x - 16 + sh.x, sp.y - 26 + sh.y)
    }
    // The Thunder: a column of lightning from Pikachu up out of the sky, flickering between its shapes.
    if (within(t, T_THUNDER - 0.04, T_THUNDER + 0.36)) {
      const f = Math.floor(t * 30) % 4
      const sh = screenShake(t, s.screenShakes)
      const off = (pts: [number, number][]) => pts.map(([x, y]) => [x + sh.x, y + sh.y] as [number, number])
      const main = off(s.bolts[f]!)
      const fade = span(t, T_THUNDER + 0.2, T_THUNDER + 0.36)
      if (fade < 0.7) {
        polyline(g, main, '#c89a20', 7)
        polyline(g, main, '#ffe050', 5)
      }
      polyline(g, main, '#fff8c0', 3)
      polyline(g, main, '#ffffff', 1)
      if (fade < 0.5)
        for (let i = 0; i < 2; i++) {
          const fk = off(s.forks[(f + i * 3) % s.forks.length]!)
          polyline(g, fk, '#ffe050', 2)
          polyline(g, fk, '#ffffff', 1)
        }
    }
    if (within(t, T_THUNDER, T_THUNDER + 0.12)) screenFlash(g, '#fff6c8', 0.55)
    // Into the white, out of it on the summit.
    const wh = span(t, T_WHITE, T_SHOT2) * (1 - span(t, T_SHOT2, T_SHOT2 + 0.35))
    if (wh > 0) wash(g, '#dae0ea', wh, 8)
  },
  sounds: [
    // The wind: a howl rising and falling, then a second gust over the summit.
    [
      0.02,
      () => (
        hiss(1.5, { freq: 420, slide: 300, type: 'lowpass', vol: 0.07 }),
        hiss(1.3, { freq: 1600, q: 3, vol: 0.02 })
      ),
    ],
    [0.8, () => tone(62, 0.6, { type: 'sine', vol: 0.05, slide: -10 })],
    [T_WHITE, () => hiss(0.5, { freq: 900, slide: -500, vol: 0.05 })],
    [
      T_SHOT2,
      () => (
        hiss(1.6, { freq: 500, slide: -150, type: 'lowpass', vol: 0.08 }),
        hiss(1.4, { freq: 2200, q: 4, vol: 0.02 })
      ),
    ],
    // Pikachu: a crackle; again, and a small chirp; the charge climbing.
    [T_SPARK, () => hiss(0.12, { freq: 5200, q: 2, vol: 0.05 })],
    [
      T_SPARK2,
      () => (
        hiss(0.16, { freq: 4800, q: 2, vol: 0.06 }),
        tone(1320, 0.07, { type: 'triangle', vol: 0.025, at: 0.12 }),
        tone(1760, 0.1, { type: 'triangle', vol: 0.025, at: 0.2, slide: -200 })
      ),
    ],
    [
      T_CHARGE,
      () => (fxSound('thunder.charge'), tone(180, 0.36, { type: 'sawtooth', vol: 0.025, slide: 700 })),
    ],
    [
      T_THUNDER,
      () => (
        fxSound('thunder.strike'),
        tone(44, 0.9, { type: 'sine', vol: 0.16, slide: -12 }),
        hiss(0.9, { freq: 260, type: 'lowpass', vol: 0.14 })
      ),
    ],
    [T_HOLE + 0.1, () => hiss(0.7, { freq: 1400, slide: -1200, vol: 0.04 })],
    // The silence after: one high, thin note.
    [T_HOLE + 0.55, () => tone(1568, 1.2, { type: 'sine', vol: 0.015 })],
    [T_TURN, () => hiss(0.1, { freq: 2600, vol: 0.03 })],
    ...T_DOTS.map((at) => [at, () => tone(988, 0.05, { type: 'square', vol: 0.025 })] as const),
    [
      REVEAL,
      () => (
        tone(55, 0.7, { type: 'sine', vol: 0.15, slide: -10 }),
        tone(110, 0.5, { type: 'sawtooth', vol: 0.03 }),
        [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.02, at: i * 0.04 }))
      ),
    ],
  ],
})

/** How hot its cheeks are (0..1): two flares, a steady glow, then blazing as it charges. */
function cheekAt(t: number) {
  if (t < T_SPARK) return 0
  const flare = (a: number) => Math.max(0, 1 - Math.abs(t - a - 0.06) / 0.1)
  const base = t < T_CHARGE ? 0.35 : 1
  if (t > T_THUNDER + 0.4) return 0.35
  return Math.max(base * (Math.floor(t * 12) % 3 ? 1 : 0.5), flare(T_SPARK), flare(T_SPARK2))
}

/** Little arcs crackling off Pikachu's cheeks: a few pixels of zigzag, new every few frames; longer while it charges. */
function sparks(g: G, s: ChampionState<X>, t: number, x: number, y: number) {
  if (t < T_SPARK || t > T_THUNDER + 0.05) return
  const f = Math.floor(t * 20)
  const charging = t > T_CHARGE
  const on =
    charging || Math.abs(t - T_SPARK - 0.05) < 0.12 || Math.abs(t - T_SPARK2 - 0.05) < 0.14 || f % 5 === 0
  if (!on) return
  const r = rng(f * 31 + 7)
  const n = charging ? 4 : 2
  for (let i = 0; i < n; i++) {
    const sd = i % 2 ? 1 : -1
    const x0 = x + sd * 6
    const y0 = y - 5
    const len = charging ? r.range(8, 22) : r.range(4, 9)
    const a = (sd > 0 ? 0 : Math.PI) + r.range(-1, 1)
    const pts = bolt(r, x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 0.5, 2)
    polyline(g, pts, '#fff070')
    if (charging) polyline(g, pts.slice(0, 3), '#ffffff')
  }
  // While it charges, an arc to the snow at his feet now and then.
  if (charging && f % 3 === 0) {
    const fy = s.L.foe.y + 2
    const pts = bolt(r, x, y - 2, x + r.range(-30, 30), fy, 0.4, 3)
    polyline(g, pts, '#ffd030')
    polyline(g, pts, '#ffffff')
  }
}

/** Shot one: up the mountain through the blizzard, to the storm wrapped round its summit and the yellow inside it. */
function climbShot(b: G, s: ChampionState<X>, t: number) {
  const u = ease.ioS(span(t, 0, T_TILT))
  const oy = Math.round(lerp(MH - H - 50, 40, u))
  b.drawImage(s.stormSky, 0, 0)
  // The storm's smears dragged across the sky, the nearer ones faster.
  const o1 = Math.round((t * 160) % (W * 2))
  b.drawImage(s.smear, -o1, 0)
  b.drawImage(s.smear, W * 2 - o1, 0)
  const o3 = Math.round((t * 240) % (W * 2))
  b.drawImage(s.smear2, -o3, 0)
  b.drawImage(s.smear2, W * 2 - o3, 0)
  b.drawImage(s.far, 0, -Math.round(oy * 0.55) - 60)
  b.drawImage(s.mount, 0, -oy)
  const cy = PEAK_Y - oy
  // Something yellow flickering in the cloud at the top: the cloud lit from inside, a thread of lightning.
  const fl = ([0.74, 0.86, 1.0] as const).find((a) => within(t, a, a + 0.05))
  cap(b, PEAK_X, cy + 8, t, fl != null)
  if (fl != null) {
    const r = rng(Math.floor(fl * 100))
    polyline(
      b,
      bolt(r, PEAK_X - 3, cy + 2, PEAK_X + r.range(-18, 18), cy - r.range(4, 10), 0.5, 3),
      '#fff070',
    )
  }
  // Banks of driven snow across the view, sliding down past us as the camera climbs.
  fogBands(b, t, 1, [
    [130 - oy * 0.25 + 60, 7, 300, 0],
    [60 - oy * 0.25 + 60, 4, 380, 90],
    [160 - oy * 0.25 + 60, 10, 260, 40],
  ])
}

/**
 * Shot two: the summit. The dawn's sky and sea of clouds are there all along behind the storm; the Thunder tears the
 * storm open from the bolt's top outwards, the hole's edge lit; then the sun.
 */
function summitShot(b: G, s: ChampionState<X>, t: number) {
  const F0 = s.L.foe
  b.drawImage(s.dawn, 0, 0)
  sun(b, F0.x, t)
  b.drawImage(s.sea, 0, 0)
  const st = stormK(t)
  if (st > 0 || t < T_HOLE + 0.6) {
    const h = s.hole.g
    h.clearRect(0, 0, W, H)
    h.drawImage(s.stormSky, 0, 0)
    const o1 = Math.round((t * 200) % (W * 2))
    h.drawImage(s.smear, -o1, 0)
    h.drawImage(s.smear, W * 2 - o1, 0)
    const o2 = Math.round((t * 320) % (W * 2))
    h.drawImage(s.smear2, -o2, 0)
    h.drawImage(s.smear2, W * 2 - o2, 0)
    // The Thunder lights the storm from inside: its clouds paling round the bolt.
    const lt = 1 - span(t, T_THUNDER, T_THUNDER + 0.3)
    if (within(t, T_THUNDER, T_THUNDER + 0.3)) {
      ellipseC(h, F0.x - 9, 10, 120 * lt + 30, 70 * lt + 20, '#8a8ca8')
      ellipseC(h, F0.x - 9, 0, 70 * lt + 16, 44 * lt + 10, '#c8c4cc')
    }
    // The hole: torn open from the top of the bolt outwards, its edge a scallop of cloud lit by the dawn.
    const R = 290 * ease.outC(span(t, T_HOLE, T_HOLE + 0.6))
    if (R > 0) {
      const cx = F0.x - 9
      const cy = -24
      const puffs = (grow: number, c: string) => {
        ellipseC(h, cx, cy, R * 1.1 + grow, R * 0.82 + grow, c)
        for (const [a, f] of s.puffs) {
          const rr = R * f + grow
          ellipseC(h, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 0.84, rr, rr * 0.8, c)
        }
      }
      puffs(8, '#5a5878')
      puffs(4, '#d8b8b8')
      h.save()
      h.globalCompositeOperation = 'destination-out'
      puffs(0, '#000000')
      h.restore()
    }
    b.drawImage(s.hole, 0, 0)
  }
  // The summit under him: the storm's grey turning to the dawn's colours as it clears.
  b.drawImage(s.summitStorm, 0, 0)
  dissolve(b, s.summitDawn, span(t, T_HOLE + 0.12, T_HOLE + 0.36))
  fogBands(b, t, stormK(t), [
    [76, 9, 340, 0],
    [30, 5, 420, 70],
  ])
  // The sun's rays round him once it is up.
  if (t > REVEAL - 0.05) rays(b, F0.x, HZ + 4, t)
}

/** The sun coming up out of the clouds right behind him: rings of light, the disc, then clear of the horizon. */
function sun(g: G, x: number, t: number) {
  const q = ease.outQ(span(t, T_SUN, REVEAL + 0.3))
  const glowK = span(t, T_HOLE + 0.2, REVEAL)
  if (glowK <= 0) return
  const y = Math.round(lerp(HZ + 16, HZ + 3, q))
  for (const [R, c] of [
    [46, '#ffc480'],
    [34, '#ffd8a0'],
    [24, '#ffecc8'],
  ] as const)
    ellipse(g, x, HZ + 2, Math.round(R * (0.4 + 0.6 * glowK)), Math.round(R * 0.5 * (0.4 + 0.6 * glowK)), c)
  ellipse(g, x, y, 15, 15, '#ffd8a0')
  ellipse(g, x, y, 12, 12, '#fff4d8')
}

/**
 * Long rays fanning up from the sun behind him, turning slowly: flat slivers of light (one step of alpha over what
 * they cross, no dither net), fading as the fight's ground comes in.
 */
function rays(g: G, x: number, y: number, t: number) {
  const k = span(t, REVEAL - 0.05, REVEAL + 0.15) * (1 - 0.6 * span(t, REVEAL + 0.6, REVEAL + 1.4))
  if (k <= 0) return
  const prev = g.globalAlpha
  g.globalAlpha = Math.round(k * 0.22 * 8) / 8 || 0.125
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / n) + Math.sin(t * 0.6 + i) * 0.04
    const len = 160
    const wa = i % 2 ? 0.05 : 0.08
    tri(
      g,
      x + Math.cos(a) * 26,
      y + Math.sin(a) * 16,
      x + Math.cos(a - wa / 2) * len,
      y + Math.sin(a - wa / 2) * len,
      x + Math.cos(a + wa / 2) * len,
      y + Math.sin(a + wa / 2) * len,
      '#fff0d0',
    )
  }
  g.globalAlpha = prev
}
