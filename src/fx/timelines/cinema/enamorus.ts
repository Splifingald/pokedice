// Enamorus's raid entrance (docs/53): Hisui in spring. A green hillside under a soft evening sky, Mt. Coronet far off,
// cherry trees in bloom either side, petals drifting. The wind rises: the trees shake, the grass bends flat, the petals
// stream sideways and the clouds race and blush pink. Then the Springtide Storm: dark pink clouds gather overhead with
// pink lightning inside them, and the petals are torn up into a whirling funnel, hearts flashing among them. The funnel
// draws itself into a giant heart of petals that beats, once, twice, three times, faster; it bursts in a pink storm,
// and Enamorus rides down out of it on its cloud.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { burstRing, dGradient, dissolve } from './kit'
import { fogBand, heartC, noise, raidCinema, scroll, type Raid } from './gen8kit'

const REVEAL = 4.6
const T_WIND = 1.0
const T_STORM = 1.95
const T_HEART = 2.95
const BEATS = [3.3, 3.62, 3.86] as const
const T_BURST = 4.08
const T_RIDE = 4.12
const N = 220

const AURA = ['#ffffff', '#ffd0e8', '#f070b0', '#7a1a5a'] as const
const PINK = ['#fff0f8', '#ffc0dc', '#f590c0', '#d8609a', '#9a2a6a'] as const

type X = {
  back: Canvas
  /** The mid and near cherries, swaying (the far ones are in the backdrop). */
  trees: Tree[]
  clouds: Canvas
  storm: Canvas
  petals: { a: number; r: number; h: number; s: number; c: number }[]
  bolts: [number, number][][]
  horizon: number
  /** The heart's centre and size. */
  hc: [number, number]
  hs: number
}

/** A depth's colours: blossom and bark ramps (dark to light) and the light's own edge. */
interface Tone {
  bloom: readonly string[]
  bark: readonly string[]
  rim: string
  grass: readonly [string, string]
}
// Near: deep pinks to white, near-black bark. Mid: lighter, the bark gone mauve. Far: pale, hazed into the evening.
const NEAR: Tone = {
  bloom: ['#5a1440', '#8a2462', '#b8417f', '#de6ca2', '#f598c2', '#ffc4de', '#fff0f8'],
  bark: ['#140810', '#221018', '#341a22', '#48262e'],
  rim: '#fff6fa',
  grass: ['#3a7a30', '#5aa04a'],
}
const MID: Tone = {
  bloom: ['#8e3a70', '#b65a92', '#d880b0', '#f0a8cc', '#ffd2e6'],
  bark: ['#3a2232', '#4c2e3e', '#603c4c'],
  rim: '#fff0f6',
  grass: ['#4a8a3c', '#5a9a4a'],
}
const FAR: Tone = {
  bloom: ['#bc84a8', '#d4a0c0', '#e8bed4', '#f8dce8'],
  bark: ['#8a6a82', '#a08096'],
  rim: '#fff0f4',
  grass: ['#6aa05a', '#78ac66'],
}

/** A cherry tree's own canvas, and its foot's row in it (the sway leaves the foot still). */
interface Tree {
  cv: Canvas
  x: number
  y: number
  foot: number
  amp: number
}

/**
 * A cherry tree in bloom, drawn once, pixel by pixel: a dark crooked trunk forking into boughs that spread wide and
 * nearly level, and on them rounded clouds of blossom, each a heap of lobes lit from the low sun on the left, the pink
 * ramp dithered across them and speckled with single flowers, the boughs dark through the gaps. Its foot at (fx, fy)
 * in its canvas; `inw` the way it leans (towards the middle of the screen), `spread` its crown's half-width.
 */
function cherry(
  seed: number,
  ht: number,
  spread: number,
  inw: number,
  T: Tone,
): Omit<Tree, 'x' | 'y' | 'amp'> & {
  fx: number
} {
  const r = rng(seed)
  const W = Math.ceil(spread * 2.6 + 8)
  const H = Math.ceil(ht * 1.12 + 4)
  const fx = Math.round(W / 2 - inw * spread * 0.3)
  const fy = H - 3
  const tw = Math.max(1.4, ht * 0.07)
  const limbs: [number, number, number, number, number, number][] = []
  // The trunk, crooked, forking a little under halfway up.
  const forkX = fx + inw * ht * 0.05 + r.range(-1, 1) * ht * 0.03
  const forkY = fy - ht * r.range(0.38, 0.46)
  const k1: [number, number] = [fx - inw * ht * 0.06 + r.range(-1, 1) * tw, lerp(fy, forkY, 0.32)]
  const k2: [number, number] = [fx + inw * ht * 0.01 + r.range(-1, 1) * tw, lerp(fy, forkY, 0.68)]
  limbs.push(
    [fx, fy + 3, k1[0], k1[1], tw * 1.35, tw * 1.05],
    [k1[0], k1[1], k2[0], k2[1], tw * 1.05, tw * 0.95],
    [k2[0], k2[1], forkX, forkY, tw * 0.95, tw],
  )
  // Boughs spreading wide and level, each forking again at its end: where the blossom gathers.
  const cxr = fx + inw * spread * 0.3
  const tips: [number, number][] = []
  for (const a of [-1.15, -0.45, 0.2, 0.85]) {
    const ex = cxr + a * spread * 0.78 + r.range(-1, 1) * spread * 0.06
    const ey = fy - ht * r.range(0.68, 0.82) + Math.abs(a) * ht * 0.06
    const bx = lerp(forkX, ex, 0.45) + r.range(-1, 1) * ht * 0.04
    const by = lerp(forkY, ey, 0.6) + ht * 0.03
    limbs.push([forkX, forkY, bx, by, tw * 0.7, tw * 0.5], [bx, by, ex, ey, tw * 0.5, tw * 0.28])
    const ang = Math.atan2(ey - by, ex - bx)
    for (const d of [-0.55, 0.5]) {
      const l2 = Math.hypot(ex - bx, ey - by) * r.range(0.35, 0.55)
      const [tx, ty] = [ex + Math.cos(ang + d) * l2, ey + Math.sin(ang + d) * l2]
      limbs.push([ex, ey, tx, ty, tw * 0.28, 1])
      tips.push([tx, ty])
    }
    tips.push([ex, ey])
  }
  // The blossom: a clump on every tip, more filling a broad dome over them, the low ones nearer.
  const R0 = Math.max(2.5, Math.min(ht * 0.11, spread * 0.3))
  const cyr = fy - ht * 0.78
  const clumps: { x: number; y: number; r: number; back: boolean; lobes: [number, number, number][] }[] = []
  const add = (x: number, y: number, R: number) => {
    const lobes: [number, number, number][] = [[0, R * 0.1, R * 0.66]]
    const k = r.int(6, 8)
    const a0 = r() * Math.PI
    for (let j = 0; j < k; j++) {
      const b = a0 + (j / k) * Math.PI * 2 + r.range(-0.25, 0.25)
      const d = R * r.range(0.45, 0.62)
      lobes.push([Math.cos(b) * d, Math.sin(b) * d * (Math.sin(b) > 0 ? 0.5 : 0.85), R * r.range(0.34, 0.46)])
    }
    clumps.push({ x, y, r: R, back: r() < 0.35, lobes })
  }
  for (const [x, y] of tips) add(x, y - R0 * 0.3, R0 * r.range(0.8, 1.1))
  for (
    let tries = 0, n = 0, want = Math.round((spread * ht * 0.22 * 1.8) / (R0 * R0));
    tries < want * 30 && n < want;
    tries++
  ) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r())
    const x = cxr + Math.cos(a) * spread * 0.85 * d
    const y = cyr + Math.sin(a) * ht * 0.2 * d - (Math.sin(a) > 0 ? 0 : ht * 0.04)
    const R = R0 * r.range(0.75, 1.1)
    // Spaced so the crown keeps gaps, the boughs dark through them.
    if (clumps.some((c) => Math.hypot(c.x - x, (c.y - y) * 1.2) < (c.r + R) * 0.6)) continue
    add(x, y, R)
    n++
  }
  clumps.sort((a, b) => a.y - b.y)
  // Twigs from the boughs into the clumps, so the gaps between them show wood.
  for (const c of clumps) {
    const [tx, ty] = tips.reduce((b, p) =>
      Math.hypot(p[0] - c.x, p[1] - c.y) < Math.hypot(b[0] - c.x, b[1] - c.y) ? p : b,
    )
    limbs.push([tx, ty, c.x, c.y, 1.2, 1])
  }

  // Paint: the blossom behind the boughs, the wood, the blossom in front; then light, shadows and edges per pixel.
  const n = W * H
  const kind = new Uint8Array(n)
  const val = new Float32Array(n)
  const zb = new Float32Array(n)
  const ord = new Int16Array(n)
  const [lx, ly, lz] = [-0.66, -0.52, 0.54]
  // The fine noise each pixel reads (its petals' fringe, their grain), worked out the first time a clump needs it.
  const [fringeN, grainN] = [noise(seed + 1), noise(seed + 2)]
  const fringe = new Float32Array(n).fill(-1)
  const grain = new Float32Array(n).fill(-1)
  const bloom = (c: (typeof clumps)[number], o: number) => {
    const R = c.r * 1.3
    for (let y = Math.max(0, Math.floor(c.y - R)); y <= Math.min(H - 1, c.y + R); y++)
      for (let x = Math.max(0, Math.floor(c.x - R)); x <= Math.min(W - 1, c.x + R); x++) {
        const px = x + 0.5 - c.x
        const py = y + 0.5 - c.y
        if (px * px + py * py > R * R) continue
        const i = y * W + x
        if (fringe[i]! < 0) fringe[i] = fringeN(x / 1.5, y / 1.5)
        const f = 1 + (fringe[i]! - 0.5) * 0.45
        let top = 0
        let nx = 0
        let ny = 0
        for (const [ox, oy, lr] of c.lobes) {
          const rr = lr * f
          const d2 = (px - ox) ** 2 + (py - oy) ** 2
          if (d2 >= rr * rr) continue
          const ht = Math.sqrt(rr * rr - d2)
          if (ht > top) {
            top = ht
            nx = (px - ox) / rr
            ny = (py - oy) / rr
          }
        }
        if (top <= 0) continue
        let mx = nx * 0.5 + (px / c.r) * 0.6
        let my = ny * 0.5 + (py / c.r) * 0.6
        const m = Math.hypot(mx, my)
        if (m > 0.98) {
          mx *= 0.98 / m
          my *= 0.98 / m
        }
        const diff = mx * lx + my * ly + Math.sqrt(1 - mx * mx - my * my) * lz
        if (grain[i]! < 0) grain[i] = grainN(x / 1.6, y / 1.6)
        kind[i] = 2
        ord[i] = o
        val[i] =
          0.5 +
          diff * 0.34 +
          ((x - cxr) / spread) * lx * 0.12 -
          ((y - cyr) / ht) * 0.5 -
          (c.back ? 0.14 : 0) +
          (grain[i]! - 0.5) * 0.34
      }
  }
  const wood = ([x0, y0, x1, y1, w0, w1]: (typeof limbs)[number]) => {
    const vx = x1 - x0
    const vy = y1 - y0
    const l2 = vx * vx + vy * vy || 1
    const len = Math.sqrt(l2)
    const pad = Math.max(w0, w1) / 2 + 1
    for (
      let y = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
      y <= Math.min(H - 1, Math.max(y0, y1) + pad);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
        x <= Math.min(W - 1, Math.max(x0, x1) + pad);
        x++
      ) {
        const qx = x + 0.5 - x0
        const qy = y + 0.5 - y0
        const t = Math.max(0, Math.min(1, (qx * vx + qy * vy) / l2))
        const dx = qx - t * vx
        const dy = qy - t * vy
        const rr = Math.max(0.62, lerp(w0, w1, t) / 2)
        const d2 = dx * dx + dy * dy
        if (d2 > rr * rr || y > fy) continue
        const i = y * W + x
        const hh = Math.sqrt(rr * rr - d2)
        if (kind[i] === 1 && hh <= zb[i]!) continue
        const u = (dx * -vy + dy * vx) / len / rr
        kind[i] = 1
        zb[i] = hh
        ord[i] = 500
        // Round, lit on the left; a cherry's bark ringed with pale bands across the trunk.
        const along = (x * vx + y * vy) / len
        val[i] =
          0.4 +
          ((u * (-vy * lx + vx * ly)) / len) * 0.4 +
          Math.sqrt(Math.max(0, 1 - u * u)) * lz * 0.3 -
          (((along % 5) + 5) % 5 < 1 ? 0.14 : 0)
      }
  }
  clumps.filter((c) => c.back).forEach((c, i) => bloom(c, i))
  for (const l of limbs) wood(l)
  clumps.filter((c) => !c.back).forEach((c, i) => bloom(c, 1000 + i))
  const empty = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !kind[y * W + x]
  const cv = shade(W, H, (x, y) => {
    const i = y * W + x
    const k = kind[i]!
    if (!k) return null
    const ramp = k === 1 ? T.bark : T.bloom
    const lit = empty(x - 1, y) || empty(x, y - 1)
    const dark = empty(x + 1, y) || (y < fy && empty(x, y + 1))
    if (lit && !dark && k === 2 && !empty(x + 2, y + 2)) return T.rim
    if (dark && !lit) return ramp[0]
    let v = val[i]!
    // Shadow from whatever is nearer the light, just up and left.
    for (let d = 1; d <= 3; d++) {
      const j = (y - d) * W + (x - d)
      if (x - d >= 0 && y - d >= 0 && kind[j] && ord[j]! > ord[i]!) {
        v -= 0.2
        break
      }
    }
    if (k === 1 && y < fy - ht * 0.3) v -= 0.15
    let tt = Math.floor(v * ramp.length + (bayer(x, y) - 0.5) * 0.9)
    // Single flowers catching the light, and the dark between them.
    const hsh = ((x * 73856093) ^ (y * 19349663)) >>> 0
    if (k === 2 && hsh % 13 === 0) tt += tt >= ramp.length / 2 ? 1 : -1
    return ramp[Math.max(0, Math.min(ramp.length - 1, tt))]!
  })
  // Grass over its foot.
  for (let x = Math.round(fx - tw * 1.5); x <= fx + tw * 1.5; x++) {
    const k = (x * 7 + 3) % 5
    rect(cv.g, x, fy - (k < 2 ? 2 : 1), 1, k < 2 ? 3 : 2, k % 2 ? T.grass[1] : T.grass[0])
  }
  return { cv, fx, foot: fy }
}

/** A tree swaying in the wind: each row shifted more the higher it is, its foot still; drawn in bands of one shift. */
function sway(g: G, T: Tree, dx: number) {
  const shift = (y: number) => Math.round(dx * Math.max(0, (T.foot - y) / T.foot) ** 1.3)
  let start = 0
  let sh = shift(0)
  for (let y = 1; y <= T.cv.height; y++) {
    const n = y < T.cv.height ? shift(y) : NaN
    if (n === sh) continue
    g.drawImage(T.cv, 0, start, T.cv.width, y - start, T.x + sh, T.y + start, T.cv.width, y - start)
    ;[start, sh] = [y, n]
  }
}

/** Point i of N on the heart's outline, centred on its box (unit size: about ±0.85 tall, ±0.95 wide). */
function heartPt(i: number): [number, number] {
  const th = (i / N) * Math.PI * 2
  const x = 16 * Math.sin(th) ** 3
  const y = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th))
  return [x / 17, y / 17 - 0.16]
}

/** The heart filled, the same outline as the petals', cached by size (in steps of 2). */
const heartFill = (size: number) => {
  const S = Math.max(4, size - (size % 2))
  return cached(`enam-heart|${S}`, () => {
    const pts = Array.from(
      { length: 64 },
      (_, i) => heartPt((i / 64) * N).map((v) => v * S) as [number, number],
    )
    const d = Math.ceil(S * 2.1)
    return shade(d, d, (x, y) => {
      const px = x - d / 2
      const py = y - d / 2
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!
        const [xj, yj] = pts[j]!
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      if (!inside) return null
      // Lit towards its top left, deep at its point.
      const k = (py / S + 0.2) * 1.4 - (px / S) * 0.3 + bayer(x, y) * 0.5
      return k < 0 ? PINK[1] : k < 0.6 ? PINK[2] : PINK[3]
    })
  })
}

export const enamorusCinema = raidCinema<X>({
  id: 'cinema-enamorus',
  reveal: REVEAL,
  seed: 905,
  aura: AURA,
  flash: '#fff0f8',
  feet: 0.6,
  rays: 0.6,
  bob: 2,
  shakes: [...BEATS.map((b, i) => [b, 0.18, 1 + i] as const), [T_BURST, 0.5, 3], [REVEAL, 0.4, 2]],
  flashes: [[T_BURST, 0.22, '#ffe0f0', 0.6]],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.5)
    const cv = canvas(s.w, s.h)
    const g = cv.g
    g.drawImage(dGradient(s.w, horizon, ['#4a6aa8', '#7a8ac0', '#c8a0c8', '#f8c0c8', '#ffe0d0']), 0, 0)
    // Mt. Coronet, far and pale: its face to the low sun lit, the other in shade, the ridge between them wavering,
    // gullies down both, its snow ragged at the foot; then the hills before it.
    const mx = Math.round(s.w * 0.62)
    const mh = Math.round(s.h * 0.26)
    const jag = noise(907)
    g.drawImage(
      shade(Math.ceil(mh * 3.2) + 2, mh + 1, (x, y) => {
        const dx = x - mh * 1.6 - 1
        if (Math.abs(dx) > (y + (jag(x / 2, 1) - 0.5) * 2) * 1.6) return null
        const lit = dx < (jag(y / 3, 4) - 0.5) * mh * 0.12
        const gully = jag((x + y * Math.sign(dx) * 0.8) / 2.4, 9 + y / 5) < 0.26
        if (y < mh * (0.26 + (jag(x / 2.2, 6) - 0.5) * 0.16)) return lit && !gully ? '#f0f0fa' : '#c4c8e2'
        return lit ? (gully ? '#7e84ae' : '#8a90b8') : gully ? '#6c7298' : '#7a80a8'
      }),
      Math.round(mx - mh * 1.6 - 1),
      horizon - mh,
    )
    // The sky's last colour under the hills, so their dips never open on nothing.
    rect(g, 0, horizon - 1, s.w, 14, '#ffe0d0')
    const crest = (k: number, x: number) =>
      Math.round(horizon - 4 + k * 8 - Math.sin(x / (30 + k * 20) + k * 2) * 6)
    for (const [k, c] of [
      [0, '#6aa05a'],
      [1, '#5a9050'],
    ] as const) {
      for (let x = 0; x < s.w; x++) rect(g, x, crest(k, x), 1, s.h - crest(k, x), c)
      // Far cherries along the far hill's crest, small and pale in the evening haze.
      if (k === 0)
        for (const [i, fx] of [0.08, 0.22, 0.36, 0.55, 0.7, 0.86].entries()) {
          const x = Math.round(s.w * fx + r.range(-4, 4))
          const ht = Math.round(s.h * 0.065 * r.range(0.8, 1.25))
          const t = cherry(950 + i, ht, ht * 0.75, 0, FAR)
          g.drawImage(t.cv, x - t.fx, crest(0, x) + 3 - t.foot)
        }
    }
    g.drawImage(
      dGradient(s.w, s.h - horizon - 10, ['#5a9a4a', '#4a8a3c', '#3a7030', '#2a5a24']),
      0,
      horizon + 10,
    )
    for (let i = 0; i < 40; i++)
      rect(g, r.range(0, s.w), r.range(horizon + 14, s.h), 1, 1, r() < 0.5 ? '#ffd0e8' : '#fff6a0')
    const hs = Math.round(Math.min(s.w * 0.34, s.h * 0.19))
    // Two cherries in the middle distance leaning out of the way, and the two great ones framing the sides.
    const trees: Tree[] = []
    const plant = (
      seed: number,
      fx: number,
      fy: number,
      ht: number,
      spread: number,
      inw: number,
      T: Tone,
      amp: number,
    ) => {
      const t = cherry(seed, ht, spread, inw, T)
      // Fallen petals on the grass round its foot.
      for (let i = 0; i < spread * 0.6; i++) {
        const a = r() * Math.PI * 2
        const d = Math.sqrt(r())
        rect(
          g,
          fx + Math.cos(a) * spread * d,
          fy + Math.sin(a) * ht * 0.05 * d,
          1,
          1,
          r() < 0.5 ? PINK[1] : PINK[0],
        )
      }
      trees.push({ cv: t.cv, x: Math.round(fx - t.fx), y: Math.round(fy - t.foot), foot: t.foot, amp })
    }
    const midH = Math.round(s.h * 0.13)
    for (const side of [-1, 1])
      plant(
        960 + side,
        s.cx + side * s.w * 0.18,
        horizon + s.h * 0.04,
        midH,
        Math.min(midH * 0.62, s.w * 0.1),
        0,
        MID,
        1,
      )
    const nearH = Math.round(Math.min(s.h * 0.56, s.w * 1.1))
    for (const side of [-1, 1])
      plant(
        970 + side,
        s.cx + side * s.w * 0.46,
        s.h * 0.84,
        nearH,
        Math.min(nearH * 0.55, s.w * 0.26),
        -side,
        NEAR,
        2,
      )
    return {
      back: cv,
      trees,
      clouds: fogBand(s.w, Math.round(s.h * 0.3), 905, '#ffe8f0', '#f0c0d8', 0.55, 60),
      storm: fogBand(s.w, Math.round(s.h * 0.34), 906, '#9a3a7a', '#6a1a52', 0.75, 50),
      petals: Array.from({ length: N }, () => ({
        a: r() * Math.PI * 2,
        r: r.range(0.2, 1),
        h: r(),
        s: r.range(0.8, 1.4),
        c: r.int(0, 2),
      })),
      bolts: Array.from({ length: 3 }, (_, i) =>
        bolt(
          r,
          s.w * (0.2 + i * 0.3),
          s.h * 0.04,
          s.w * (0.25 + i * 0.28) + r.range(-10, 10),
          s.h * 0.22,
          0.4,
          4,
        ),
      ),
      horizon,
      hc: [s.cx, s.feet - Math.round(Math.max(30, s.sz.h * 0.55))],
      hs,
    }
  },
  step(s, t) {
    const r = s.r
    // Petals: drifting at first, then streaming on the wind, then everywhere after the burst.
    const wind = span(t, T_WIND, T_WIND + 0.6)
    const rate = t < T_STORM ? 0.4 + wind * 1.4 : t > T_BURST ? 0.8 : 0.2
    if (r() < rate * s.many)
      s.fx.add({
        x: wind > 0.3 && t < T_STORM ? -4 : r.range(0, s.w),
        y: wind > 0.3 && t < T_STORM ? r.range(0, s.h * 0.8) : -3,
        vx: lerp(r.range(4, 12), r.range(90, 150), t < T_STORM ? wind : 0.1),
        vy: r.range(10, 24),
        life: 4,
        size: 2,
        shape: 'leaf',
        spin: r.range(-6, 6),
        colors: [PINK[2]],
        light: PINK[0],
        dark: PINK[3],
      })
    if (t >= T_BURST && t - 1 / 60 < T_BURST)
      for (let i = 0; i < 70 * s.many; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(60, 200)
        s.fx.add({
          x: s.hc[0],
          y: s.hc[1],
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 1.8,
          life: r.range(0.8, 1.6),
          size: 2,
          shape: r() < 0.25 ? 'heart' : 'leaf',
          spin: r.range(-8, 8),
          colors: [PINK[2], PINK[1]],
          light: PINK[0],
          dark: PINK[3],
        })
      }
    if (t > REVEAL && r() < 0.15 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.6, s.sz.w * 0.6),
        y: s.feet - r.range(0, s.sz.h),
        vy: -r.range(10, 20),
        life: 1.2,
        size: 1,
        shape: 'heart',
        colors: [PINK[1], PINK[2]],
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // Clouds: drifting, then racing on the wind; the storm's dark ones gathering over them.
    const wind = span(t, T_WIND, T_WIND + 0.6)
    const off = t * 6 + Math.max(0, t - T_WIND) ** 1.5 * 40
    scroll(g, s.clouds, off, -Math.round(s.h * 0.02))
    const st = span(t, T_STORM - 0.3, T_STORM + 0.4) * (1 - span(t, T_BURST, REVEAL + 0.6))
    if (st > 0) scroll(g, s.storm, -off * 0.8, -Math.round(s.h * 0.04), st)
    // Pink lightning inside the storm clouds.
    if (st > 0.5 && t < T_HEART + 0.4) {
      const f = Math.floor(t * 12)
      if (f % 4 === 0) {
        const b = s.bolts[f % s.bolts.length]!
        polyline(g, b, PINK[1], 2)
        polyline(g, b, '#ffffff')
      }
    }
    // The cherry trees, swaying hard in the wind.
    const calm = 1 - span(t, T_BURST, REVEAL + 1)
    for (const [i, tr] of s.trees.entries()) sway(g, tr, Math.sin(t * (20 + i * 3)) * tr.amp * wind * calm)
    drawGrass(g, s, t, wind)
    // The cloud it rides, once it is here.
    if (t > T_RIDE)
      cloud(
        g,
        s.cx,
        s.feet + 2,
        Math.round(Math.max(20, s.sz.w * 0.45)) * ease.outBack(span(t, T_RIDE, T_RIDE + 0.3)),
        t,
      )
    drawPetalStorm(g, s, t)
  },
  before(g, s, t) {
    if (t < T_RIDE) return
    const q = ease.outC(span(t, T_RIDE, REVEAL - 0.05))
    drawSprite(g, s.mon, s.cx, Math.round(lerp(s.hc[1], s.feet, q)), {
      sil: '#5a0a3a',
      outline: Math.floor(t * 14) % 2 ? AURA[1] : AURA[2],
      sx: lerp(0.6, 1, q),
      sy: lerp(0.6, 1, q),
    })
  },
  sounds: [
    [0.05, () => hiss(1.6, { freq: 2400, type: 'highpass', vol: 0.02 })],
    [0.3, () => tone(784, 0.5, { type: 'triangle', vol: 0.02 })],
    [0.6, () => tone(988, 0.5, { type: 'triangle', vol: 0.02 })],
    [T_WIND, () => hiss(1.4, { freq: 600, slide: 1400, vol: 0.06 })],
    [
      T_STORM,
      () => (
        hiss(1.6, { freq: 900, slide: 600, vol: 0.07 }),
        tone(392, 1.2, { type: 'sine', vol: 0.03, slide: 196 })
      ),
    ],
    [T_STORM + 0.35, () => fxSound('thunder.strike')],
    [T_HEART, () => fxSound('psychic.focus')],
    ...BEATS.map(
      (b, i) =>
        [
          b,
          () => (fxSound('legend.heart'), tone(1047 + i * 131, 0.15, { type: 'triangle', vol: 0.03 })),
        ] as const,
    ),
    [T_BURST, () => (fxSound('evolve.burst'), hiss(0.6, { freq: 3000, slide: -2000, vol: 0.06 }))],
  ],
})

/** The grass: blades swaying, then bent flat by the wind. */
function drawGrass(g: G, s: Raid & X, t: number, wind: number) {
  const calm = span(t, T_BURST, REVEAL + 1)
  for (let i = 0; i < Math.round(s.w / 3); i++) {
    const x = i * 3 + ((i * 7) % 3)
    const y = s.h - 2 - ((i * 13) % Math.round(s.h * 0.12))
    const ht = 5 + ((i * 5) % 6)
    const bend =
      Math.sin(t * 3 + i * 0.7) * 1.5 + wind * (1 - calm) * (ht - 1) * (0.8 + 0.2 * Math.sin(t * 12 + i))
    line(g, x, y, x + bend, y - ht + Math.abs(bend) * 0.4, i % 3 ? '#3a7a30' : '#5aa04a')
  }
}

/** A puff of pink cloud: clumps, lit on top. */
function cloud(g: G, x: number, y: number, r: number, t: number) {
  if (r < 2) return
  for (let k = -2; k <= 2; k++) {
    const cx = x + k * r * 0.45
    const cr = r * (0.55 - Math.abs(k) * 0.08) + Math.sin(t * 3 + k) * 1
    ellipse(g, cx, y + 2, cr, cr * 0.5, PINK[3])
    ellipse(g, cx, y, cr - 1, cr * 0.45, PINK[1])
    ellipse(g, cx - 1, y - 1, cr * 0.5, cr * 0.25, PINK[0])
  }
}

/** The petals of the Springtide Storm: whirled into a funnel, drawn into a beating heart, burst apart. */
function drawPetalStorm(g: G, s: Raid & X, t: number) {
  if (t < T_STORM || t > T_BURST + 0.5) return
  const [hx, hy] = s.hc
  const torn = span(t, T_STORM, T_STORM + 0.5)
  const gather = ease.ioS(span(t, T_HEART, T_HEART + 0.4))
  const burst = span(t, T_BURST, T_BURST + 0.5)
  const beat = BEATS.reduce((k, b) => k + Math.max(0, 1 - Math.abs(t - b - 0.04) / 0.1) * 0.22, 0)
  const size = s.hs * (1 + beat) * (1 + ease.outC(burst) * 1.5)
  if (gather > 0 && burst < 1) {
    const gr = Math.round(s.hs * (0.9 + beat))
    g.drawImage(glow(gr, PINK[2], 1.3, 0.5 * gather * (1 - burst)), hx - gr, hy - gr)
    // The heart's own fill, glowing through it as it gathers, flaring on each beat.
    const fill = Math.min(1, gather * 0.45 + beat * 3) * (1 - burst)
    if (fill > 0.05) {
      const hcv = heartFill(Math.round(size))
      dissolve(g, hcv, fill, Math.round(hx - hcv.width / 2), Math.round(hy - hcv.height / 2))
    }
  }
  // The wind's own lines, whirling round the funnel.
  if (gather < 1)
    for (let k = 0; k < 6; k++) {
      const lift = (k / 6 + t * 0.5) % 1
      const rr = Math.round(s.hs * (0.3 + lift * 1.1) * torn * (1 - gather))
      const y = Math.round(s.feet - lift * (s.feet - s.h * 0.12))
      const a0 = t * 7 + k * 1.3
      if (rr > 3)
        ellipseLine(g, hx, y, rr, Math.max(1, Math.round(rr * 0.25)), k % 2 ? PINK[0] : PINK[1], a0, a0 + 1.6)
    }
  s.petals.forEach((p, i) => {
    // In the funnel: whirling round the middle, wider at the top, rising.
    const a = p.a + t * 5 * p.s
    const lift = (p.h + t * 0.4) % 1
    const fr = s.hs * (0.2 + lift * 1.2) * (0.5 + p.r * 0.5) * torn
    const fx = hx + Math.cos(a) * fr
    const fy = s.feet - lift * (s.feet - s.h * 0.12) + Math.sin(a) * fr * 0.25
    const [ux, uy] = heartPt(i)
    const tx = hx + ux * size
    const ty = hy + uy * size
    const x = lerp(fx, tx, gather)
    const y = lerp(fy, ty, gather)
    const k = burst > 0 ? 1 - burst : 1
    if (k <= 0) return
    const c = p.c === 0 ? PINK[1] : p.c === 1 ? PINK[2] : PINK[0]
    // A petal turning: wide, then edge on.
    const flat = Math.floor(t * 8 + i) % 3
    rect(g, x - 1, y, flat ? 3 : 1, 2, c)
    rect(g, x - 1, y + 1, flat ? 2 : 1, 1, PINK[3])
    if (flat) rect(g, x - 1, y, 1, 1, PINK[0])
    // A heart flashing among them now and then.
    if (i % 17 === 0 && gather < 0.5 && Math.floor(t * 6 + i) % 3 === 0) {
      const hcv = heartC(3, PINK[2], PINK[0])
      g.drawImage(hcv, Math.round(x - hcv.width / 2), Math.round(y - hcv.height / 2))
    }
  })
  burstRing(g, hx, hy, burst, Math.max(s.w, s.h) * 0.7, 3, PINK[1])
  for (const b of BEATS) burstRing(g, hx, hy, span(t, b, b + 0.35), s.hs * 2, 2, PINK[2])
}
