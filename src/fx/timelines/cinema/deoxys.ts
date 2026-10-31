// Deoxys's entrance (docs/53), on the battle stage: a journey through space. Deep space, the Milky Way faint across
// it; the Moon close, its craters sharp in the sunlight and its night side grey-blue in earthlight; the Earth far off,
// a blue marble, half in night. A violet crystal streaks across the Moon's face, a comet's tail of green motes behind
// it (the virus it carries), and the camera goes after it: the Moon slides away, dust rushes past, the Earth swells
// till its curve fills the screen. The crystal hits the air and bursts into flame: a fireball over the Earth's glowing
// limb, the sunset line beside it, its tail across the sky, falling into the night side over the cities' lights. The
// camera dives after it into the clouds, their deck glowing from inside as it goes through, and comes out under them
// over Birth Island at night: it comes down burning, lights the sea, and hits the shore. A flash, a ring of dust, a
// glowing crater; the rock cracks, the crystal shines in it, a double helix of light (DNA) climbs out of it in a column
// of violet, mutating, and wraps into a body glitching between copies of itself: the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  cached,
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
  rgba,
  rng,
  shade,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, screenFlash, screenShake, W, within, type Stage } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dissolve, tri } from './kit'

const REVEAL = 4.35
/** The crystal comes into view and crosses the Moon; then the camera goes after it. */
const T_COMET = 0.28
const T_FOLLOW = 0.9
/** It hits the air: the cut to the Earth's limb, the fire. */
const T_ENTRY = 1.95
/** Down into the clouds: heaps of them rushing up, then their deck, which hides the cut onto Birth Island. */
const T_CLOUDS = 2.66
const T_DECK = 2.8
const DECK_DUR = 0.21
const T_ISLAND = 2.89
const T_IMPACT = 3.3
const T_CRACK = 3.5
const T_HELIX = 3.6
const T_MUTATE = 3.8
const T_WRAP = 4.0
/** The entry's jolt, the impact's. */
const SHAKES = [
  [T_ENTRY, 0.6, 2],
  [T_IMPACT, 0.5, 3],
] as const

const FIRE = ['#fff8e0', '#ffd060', '#ff8a2a', '#c8401a', '#5a1a10'] as const
const ORANGE = ['#fff0d0', '#ffb05a', '#ff6a2a', '#8a2a10'] as const
const TEAL = ['#e0ffff', '#6af0e0', '#2aa8a8', '#0a4a4a'] as const
const VIOLET = ['#ffffff', '#e0b8ff', '#a05ae0', '#4a1a7a'] as const
const VIRUS = ['#ffffff', '#c8ffd8', '#6af0b0', '#2aa88a', '#1a4a5a'] as const

const norm = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l] as const
}
/** The sun, off to the left: the Moon and the Earth half lit, their night sides to the right. */
const SUN = norm(-0.86, -0.34, 0.38)
/** Its way across a face, on screen: craters are dark on that side inside, lit on the other. */
const SUN2 = (() => {
  const l = Math.hypot(SUN[0], SUN[1])
  return [SUN[0] / l, SUN[1] / l] as const
})()
/** The Earth, to the Moon's right: its light on the Moon's night side. */
const EARTHWARD = norm(0.8, 0.3, 0.5)
/** The sun for the close-up of the limb: a little behind the planet, so the night side runs down to the right. */
const SUN_LIMB = norm(-0.93, 0.126, -0.34)

const clampi = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// ---------------------------------------------------------------- noise (once, for the planets' faces)
function hash3(x: number, y: number, z: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Value noise's lattice: a shuffled table and a value per entry (lookups, not hashing: the planets cost less). */
const PERM = (() => {
  const r = rng(3865)
  const a = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return Uint8Array.from({ length: 512 }, (_, i) => a[i & 255]!)
})()
const VAL = (() => {
  const r = rng(3866)
  return Float32Array.from({ length: 256 }, () => r())
})()
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  let u = x - xi
  let v = y - yi
  let w = z - zi
  u = u * u * (3 - 2 * u)
  v = v * v * (3 - 2 * v)
  w = w * w * (3 - 2 * w)
  const X = xi & 255
  const Y = yi & 255
  const Z = zi & 255
  const A = PERM[X]! + Y
  const B = PERM[X + 1]! + Y
  const AA = PERM[A]! + Z
  const AB = PERM[A + 1]! + Z
  const BA = PERM[B]! + Z
  const BB = PERM[B + 1]! + Z
  const a = lerp(VAL[PERM[AA]!]!, VAL[PERM[BA]!]!, u)
  const b = lerp(VAL[PERM[AB]!]!, VAL[PERM[BB]!]!, u)
  const c = lerp(VAL[PERM[AA + 1]!]!, VAL[PERM[BA + 1]!]!, u)
  const d = lerp(VAL[PERM[AB + 1]!]!, VAL[PERM[BB + 1]!]!, u)
  return lerp(lerp(a, b, v), lerp(c, d, v), w)
}
function fbm(x: number, y: number, z: number, oct: number) {
  let s = 0
  let a = 1
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z)
    n += a
    x = x * 2.02 + 17
    y *= 2.02
    z = z * 2.02 + 5
    a *= 0.5
  }
  return s / n
}

// ---------------------------------------------------------------- the Earth
const DEEP = 0
const OCEAN = 1
const SHALLOW = 2
const GREEN = 3
const DRY = 4
const ICE = 5
/** A flag on the ground: a city, lit at night. */
const CITY = 8

const RAMPS: readonly (readonly string[])[] = [
  ['#050f30', '#0a1c4e', '#102c72', '#1a3f92'],
  ['#08183e', '#0e2a62', '#16408a', '#2258aa'],
  ['#0c2450', '#14427a', '#1e62a2', '#3a88c8'],
  ['#101c0c', '#1e3616', '#2e5222', '#4a7432'],
  ['#221a0e', '#4a3a1e', '#7a6034', '#a8884e'],
  ['#3a4656', '#7a8a9e', '#bccada', '#eef4fc'],
]
const CLOUD = ['#38465e', '#76869e', '#b8c6da', '#f2f6ff'] as const
const NIGHT = ['#02060f', '#040a18', '#071024', '#0a0e12', '#0c0e10', '#10141e'] as const

/** What lies at a point of the Earth (a unit vector): its ground (and a city?), and how cloudy it is (0–3). */
function ground(x: number, y: number, z: number, oct: number): [number, number] {
  const e = fbm(x * 1.5 + 7, y * 1.5 + 3, z * 1.5 + 5, oct)
  let b: number
  if (Math.abs(y) + (e - 0.5) * 0.5 > 0.86) b = ICE
  else if (e > 0.55) {
    b = Math.abs(y) < 0.45 && fbm(x * 3 + 20, y * 3 + 1, z * 3 + 2, 2) > 0.55 ? DRY : GREEN
    // Cities: in clusters, thickest along the coasts, a few lone lights between them.
    const h = hash3(Math.floor(x * 900), Math.floor(y * 900), Math.floor(z * 900))
    const urban = fbm(x * 22 + 3, y * 22 + 9, z * 22 + 1, 2)
    if ((e < 0.565 && urban > 0.5 && h < 0.4) || (urban > 0.63 && h < 0.3) || h < 0.008) b |= CITY
  } else b = e > 0.52 ? SHALLOW : e > 0.445 ? OCEAN : DEEP
  const c = fbm(x * 2.6 + 31, y * 3.6 + 17, z * 2.6 + 9, Math.max(3, oct - 2))
  return [b, c > 0.66 ? 3 : c > 0.62 ? 2 : c > 0.59 ? 1 : 0]
}

/** One pixel of the Earth: its ground and clouds under the light `l` (below 0, night), dithered at (x, y). */
function earthPx(b: number, cl: number, l: number, x: number, y: number, gain = 1): string {
  const base = b & 7
  const d = bayer(x, y)
  // `gain` brightens a close-up, whose light changes slowly across it: its sunset line stays as thin as from afar.
  const lg = l * gain
  if (lg > (d - 0.5) * 0.1) {
    const cloudy = cl >= 2 || (cl === 1 && bayer(x + 1, y + 2) < 0.5)
    const ramp = cloudy ? CLOUD : RAMPS[base]!
    // The sunset line: the last light on the clouds goes rose, the ground dark.
    if (lg < 0.07) return cloudy ? (d < 0.5 ? '#b0646a' : '#6a3a52') : ramp[0]!
    const lv = 0.35 + Math.pow(Math.min(1, lg), 0.65) * 3.1
    return ramp[clampi(Math.floor(lv + d - 0.5), 0, 3)]!
  }
  // Night: the ground nearly black, the clouds a faint grey-blue, the cities lit (a few of them bright).
  if (cl >= 2) return cl === 3 && d < 0.5 ? '#1a2236' : '#121a2c'
  if (b & CITY) return (x * 7 + y * 13) % 5 === 0 ? '#fff2c0' : (x + y) % 3 ? '#ffc860' : '#ff9a40'
  return NIGHT[base]!
}

/** How the globe sits: its axis leaning towards us, turned to show its oceans and a long coast. */
const TILT = 0.4
const SPIN = 3.4
function toBody(x: number, y: number, z: number, spin: number, tilt = TILT): [number, number, number] {
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  const y1 = y * ct - z * st
  const z1 = y * st + z * ct
  const cs = Math.cos(spin)
  const ss = Math.sin(spin)
  return [x * cs + z1 * ss, y1, -x * ss + z1 * cs]
}

/** The Earth's map, longitude by latitude (made once): what each far view of it samples. */
const TW = 256
const TH = 128
const globe = () =>
  cached('deoxys-globe', () => {
    const map = new Uint8Array(TW * TH * 2)
    for (let v = 0; v < TH; v++) {
      const lat = ((v + 0.5) / TH - 0.5) * Math.PI
      for (let u = 0; u < TW; u++) {
        const lon = ((u + 0.5) / TW) * Math.PI * 2
        const [b, c] = ground(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), 5)
        map[(v * TW + u) * 2] = b
        map[(v * TW + u) * 2 + 1] = c
      }
    }
    return map
  })

/** Its air round the disc, in pixels: thicker the closer it is. */
const haloOf = (r: number) => 2 + Math.round(r / 12)

/**
 * The Earth seen whole at radius r (cached per radius, so it can swell a pixel at a time): oceans, land, clouds and
 * ice in the sunlight, the night side black with its cities lit, the sunset line between, the air a blue rim.
 */
function earthDisc(r: number): Canvas {
  return cached(`deoxys-earth|${r}`, () => {
    const map = globe()
    const h = haloOf(r)
    const c = r + h
    return shade(2 * c + 1, 2 * c + 1, (x, y) => {
      const dx = (x - c) / r
      const dy = (y - c) / r
      const d2 = dx * dx + dy * dy
      const d = Math.sqrt(d2)
      if (d2 > 1) {
        // The air: bright on the day side, a sunset at the terminator, a faint blue on the night side.
        const e = ((d - 1) * r) / h
        if (e >= 1) return null
        const lit = (dx * SUN[0] + dy * SUN[1]) / d + (bayer(x, y) - 0.5) * 0.1
        const k = (1 - e) ** 1.7 * (lit > -0.12 ? 1 : 0.45)
        if (k <= bayer(x + 2, y + 1)) return null
        if (lit < -0.12) return '#141c58'
        if (lit < 0.05) return e < 0.5 ? '#ffb070' : '#8a3a5a'
        return e < 0.3 ? '#a8e0ff' : e < 0.6 ? '#4a96f0' : '#1e50b8'
      }
      const nz = Math.sqrt(1 - d2)
      const [bx, by, bz] = toBody(dx, dy, nz, SPIN)
      const lat = Math.asin(clampi(by, -1, 1))
      const lon = Math.atan2(bz, bx)
      const u = Math.floor(((((lon / (Math.PI * 2)) % 1) + 1) % 1) * TW) % TW
      const v = clampi(Math.floor((lat / Math.PI + 0.5) * TH), 0, TH - 1)
      const i = (v * TW + u) * 2
      const l = dx * SUN[0] + dy * SUN[1] + nz * SUN[2]
      // The air seen edge-on at the rim: a blue haze on the day side.
      const rim = (d - 0.84) / 0.16
      if (rim > 0 && l > 0 && rim * rim * 0.9 > bayer(x, y)) return rim > 0.75 ? '#8ac8f8' : '#3a78d0'
      return earthPx(map[i]!, map[i + 1]!, l, x, y)
    })
  })
}

/** The close-up: a slice of the Earth's curve, the camera skimming its limb. */
const LP = { w: 340, h: 236, cx: 214, cy: 566, R: 476 }
const limbY = (px: number) => LP.cy - Math.sqrt(LP.R * LP.R - (px - LP.cx) ** 2)
const SPIN_LIMB = 3.72

/**
 * One pixel of the limb: the day side to the left under a thick blue band of air, the sunset's red line where the
 * light ends, the night side down to the right with its coasts strung with cities, clouds over both.
 */
function limbPx(x: number, y: number): string | null {
  const dx = (x - LP.cx) / LP.R
  const dy = (y - LP.cy) / LP.R
  const d = Math.sqrt(dx * dx + dy * dy)
  const lit = (dx * SUN_LIMB[0] + dy * SUN_LIMB[1]) / d + (bayer(x, y) - 0.5) * 0.06
  if (d > 1) {
    const e = (d - 1) * LP.R
    if (e >= 15) return null
    if (lit > 0.06) {
      const k = (1 - e / 15) ** 1.6
      if (k <= bayer(x + 1, y + 3)) return null
      return e < 1.5 ? '#d8f4ff' : e < 4 ? '#7ac0ff' : e < 8 ? '#3a7ae0' : '#1a3a9a'
    }
    if (lit > -0.1) {
      const k = Math.max(0, 1 - e / 10) ** 1.4
      if (k <= bayer(x + 1, y + 3)) return null
      return e < 1.5 ? '#ffe0a0' : e < 4 ? '#ff7a4a' : '#8a2a5a'
    }
    const k = Math.max(0, 1 - e / 5) ** 1.5 * 0.7
    if (k <= bayer(x + 1, y + 3)) return null
    return e < 2 ? '#3a4ab0' : '#1a1e5a'
  }
  const nz = Math.sqrt(1 - d * d)
  // The air seen through at a slant near the limb: blue by day, rose at the sunset, a deep blue by night.
  const haze = 1 - nz / 0.22
  if (haze > 0 && haze * haze * 0.85 > bayer(x, y))
    return lit > 0.06 ? (haze > 0.6 ? '#9ad0ff' : '#4a8ad8') : lit > -0.1 ? '#c8705a' : '#0c1440'
  // Tipped forward: the limb's top is the tropics, not the pole's ice.
  const [bx, by, bz] = toBody(dx, dy, nz, SPIN_LIMB, 1.45)
  const [b, cl] = ground(bx, by, bz, 7)
  const l = dx * SUN_LIMB[0] + dy * SUN_LIMB[1] + nz * SUN_LIMB[2]
  return earthPx(b, cl, l, x, y, 2.6)
}

/**
 * The limb's plate, made once but a few rows at a time while the space shot plays (it is the dearest layer, and
 * needed only when the fire starts); asking for it whole finishes whatever is left.
 */
const limbJob = () =>
  cached('deoxys-limb', () => {
    const cv = canvas(LP.w, LP.h)
    return { cv, img: cv.g.createImageData(LP.w, LP.h), row: 0 }
  })
function limbPlate(rows = LP.h): Canvas {
  const j = limbJob()
  if (j.row >= LP.h) return j.cv
  const y0 = j.row
  const y1 = Math.min(LP.h, y0 + rows)
  const data = j.img.data
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < LP.w; x++) {
      const c = limbPx(x, y)
      if (!c) continue
      const v = rgba(c)
      const i = (y * LP.w + x) * 4
      data[i] = v[0]
      data[i + 1] = v[1]
      data[i + 2] = v[2]
      data[i + 3] = 255
    }
  j.cv.g.putImageData(j.img, 0, 0, 0, y0, LP.w, y1 - y0)
  j.row = y1
  return j.cv
}

// ---------------------------------------------------------------- the Moon
type Crater = { x: number; y: number; z: number; r: number }
/** Its craters, on the side facing us: four great basins and a scatter of small ones. */
const CRATERS: Crater[] = (() => {
  const r = rng(3862)
  const out: Crater[] = []
  while (out.length < 34) {
    const x = r.range(-1, 1)
    const y = r.range(-1, 1)
    const z = r.range(0.05, 1)
    const l = Math.hypot(x, y, z)
    if (l > 1) continue
    out.push({ x: x / l, y: y / l, z: z / l, r: out.length < 4 ? r.range(0.16, 0.24) : r.range(0.05, 0.12) })
  }
  return out
})()
const MOON_LIT = ['#2e2e38', '#4c4c58', '#6e6e7a', '#9696a0', '#bebec6', '#e6e6ec'] as const
const MOON_EARTHLIT = ['#05070c', '#0b1120', '#141e34', '#203052'] as const

/** The Moon at radius r (cached per radius): grey seas, craters shadowed on the sun's side, earthlight on its night. */
function moonDisc(r: number): Canvas {
  return cached(`deoxys-moon|${r}`, () =>
    shade(2 * r + 1, 2 * r + 1, (x, y) => {
      const dx = (x - r) / r
      const dy = (y - r) / r
      const d2 = dx * dx + dy * dy
      if (d2 > 1) return null
      const nz = Math.sqrt(1 - d2)
      const m = fbm(dx * 1.4 + 50, dy * 1.4 + 20, nz * 1.4 + 3, 3)
      let alb = m > 0.56 ? -1.3 : m > 0.53 ? -0.6 : (m - 0.5) * 2
      for (const c of CRATERS) {
        const ox = dx - c.x
        const oy = dy - c.y
        const oz = nz - c.z
        const dd = Math.sqrt(ox * ox + oy * oy + oz * oz)
        if (dd > c.r * 1.3) continue
        // Inside, the wall on the sun's side is in its own shadow and the far one lit; the rim the other way round.
        const side = (ox * SUN2[0] + oy * SUN2[1]) / c.r
        if (dd < c.r) alb += side > 0.2 ? -1.8 : side < -0.3 ? 0.9 : -0.25
        else alb += side > 0 ? 0.9 : -0.5
      }
      const l = dx * SUN[0] + dy * SUN[1] + nz * SUN[2]
      if (l > (bayer(x, y) - 0.5) * 0.12) {
        const lv = 0.6 + Math.pow(Math.max(0, l), 0.55) * 4.4 + alb
        return MOON_LIT[clampi(Math.floor(lv + bayer(x, y) - 0.5), 0, 5)]
      }
      const e = Math.max(0, dx * EARTHWARD[0] + dy * EARTHWARD[1] + nz * EARTHWARD[2])
      const lv = 0.4 + e * 2.6 + alb * 0.45
      return MOON_EARTHLIT[clampi(Math.floor(lv + bayer(x, y) - 0.5), 0, 3)]
    }),
  )
}

// ---------------------------------------------------------------- space
const SW = 340
const SH = 230
/** Deep space (made once): the Milky Way a faint violet band across it, stars of every brightness. */
const starfield = () =>
  cached('deoxys-stars', () => {
    const bandAt = (x: number, y: number) => Math.exp(-(((x * 0.42 - y + 70) / 40) ** 2))
    // Its noise on a grid of every other pixel, read back smoothly: a quarter of the work, the same clouds.
    const gw = (SW >> 1) + 2
    const grid = Float32Array.from({ length: gw * ((SH >> 1) + 2) }, (_, i) =>
      fbm((i % gw) / 10, Math.floor(i / gw) / 10, 1.5, 3),
    )
    const at = (x: number, y: number) => {
      const gx = x / 2
      const gy = y / 2
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const u = gx - i
      const top = lerp(grid[j * gw + i]!, grid[j * gw + i + 1]!, u)
      const bot = lerp(grid[(j + 1) * gw + i]!, grid[(j + 1) * gw + i + 1]!, u)
      return lerp(top, bot, gy - j)
    }
    const cv = shade(SW, SH, (x, y) => {
      const k = bandAt(x, y)
      if (k < 0.15) return '#02030a'
      // Its glow torn by dark lanes of dust: dithered, never more than a deep violet.
      const v = k * (at(x, y) - 0.32) * 2.6
      const d = bayer(x, y)
      return v > 0.5
        ? d < 0.5
          ? '#1e1034'
          : '#160c2a'
        : v > 0.32
          ? d < 0.5
            ? '#120a24'
            : '#0a0818'
          : v > 0.18 && d < 0.3
            ? '#0a0818'
            : '#02030a'
    })
    const g = cv.g
    const r = rng(3863)
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(r() * SW)
      const y = Math.floor(r() * SH)
      // Thicker in the band: most stars away from it are skipped.
      if (i >= 220 && bandAt(x, y) < 0.5) continue
      const b = r()
      rect(g, x, y, 1, 1, b < 0.5 ? '#2e3858' : b < 0.8 ? '#5a6a98' : b < 0.93 ? '#a8b4dc' : '#ffffff')
    }
    // A few bright ones, with a little cross of light; one warm, one blue.
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * SW)
      const y = Math.floor(r() * SH)
      const c = i % 5 === 0 ? '#ffd8a8' : i % 5 === 1 ? '#a8d0ff' : '#ffffff'
      rect(g, x - 1, y, 3, 1, '#4a5680')
      rect(g, x, y - 1, 1, 3, '#4a5680')
      rect(g, x, y, 1, 1, c)
    }
    return cv
  })

/** The camera in space, from the Moon to the Earth: where each is and how big, and how fast it goes. */
function spaceCam(t: number) {
  const q = span(t, T_FOLLOW, T_ENTRY)
  // A rush that keeps gaining speed till it reaches the air.
  const c = q * q * (0.4 + 0.6 * q)
  // The Moon, the nearer, slides away first and fast, growing a little as it passes; it is gone halfway.
  const mq = ease.ioS(span(t, T_FOLLOW - 0.15, T_FOLLOW + 0.75))
  const drift = t * 3
  return {
    c,
    q,
    stars: { x: 24 + drift + 60 * c, y: 26 + 34 * c },
    moon: { x: 72 - drift - 200 * mq ** 1.3, y: 66 - 30 * mq, r: Math.round(30 * (1 + 0.7 * mq)) },
    // The Earth, far ahead: it swells as the dolly's perspective has it, slowly, then all at once.
    earth: {
      x: lerp(184, 128, ease.ioS(q)),
      y: lerp(100, 152, c),
      r: Math.round(1 / lerp(1 / 14, 1 / 78, c)),
    },
  }
}

/** Where the crystal is in space: across the Moon, slowing as the camera catches it up, then on to the air. */
function cometAt(t: number) {
  const a = ease.outQ(span(t, T_COMET, T_FOLLOW + 0.15))
  const cam = spaceCam(t)
  // Diving at the limb (where it is now, a little right of the top): it touches the air as the shot ends.
  const f = cam.c ** 1.6
  const e = cam.earth
  const x = lerp(lerp(-10, 132, a), e.x + e.r * 0.33, f)
  const y = lerp(lerp(34, 66, a), e.y - e.r * 0.94 - haloOf(e.r) * 0.5, f)
  // Its tail: behind it as it crosses, then streaming out from the Earth as it dives towards it.
  const ex = x - cam.earth.x
  const ey = y - cam.earth.y
  const el = Math.hypot(ex, ey) || 1
  const k = span(t, T_FOLLOW, T_FOLLOW + 0.4)
  const tx = lerp(-0.976, ex / el, k)
  const ty = lerp(-0.22, ey / el, k)
  const tl = Math.hypot(tx, ty) || 1
  return { x, y, tx: tx / tl, ty: ty / tl }
}

/** The fireball over the limb, the camera following it: it sinks and drifts right a little; `q` 0..1 over the shot. */
function fireAt(t: number) {
  const q = (t - T_ENTRY) / (T_CLOUDS - T_ENTRY)
  return { x: 112 + 40 * q, y: 58 + 22 * q, q }
}
/** Where the limb's plate sits: panning after the fireball, the limb rising past it as it falls into the air. */
function plateAt(t: number) {
  const f = fireAt(t)
  const ox = -12 - 62 * f.q
  // How far under the limb the fireball is (on screen): just inside the air at first, then well down over the night.
  const gap = lerp(7, -30, ease.ioS(clampi(f.q, 0, 1))) - Math.max(0, f.q - 1) * 30
  return { x: ox, y: f.y + gap - limbY(f.x - ox) }
}
/** Its fall onto the island: from high in the sky to the shore, faster and faster. */
function fallAt(t: number, fx: number, fy: number) {
  const q = ease.inQ(span(t, T_ISLAND, T_IMPACT))
  return { x: lerp(104, fx, q), y: lerp(-10, fy - 5, q), q }
}

// ---------------------------------------------------------------- Birth Island
/** Birth Island at night: the sky with the Moon high in it, the sea, the shore, the island's black triangle of rock. */
const islandPlate = () =>
  cached('deoxys-island', () => {
    const cv = canvas(W, H)
    const g = cv.g
    // The same sky we came through, the Milky Way across it, hazier down to the sea.
    g.drawImage(starfield(), -60, -70)
    g.drawImage(
      shade(W, 92, (x, y) => {
        const k = (y - 34) / 58
        return k > 0 && k ** 1.3 > bayer(x, y) ? (y > 74 ? '#16203e' : '#0c1230') : null
      }),
      0,
      0,
    )
    // The Moon we came past, small and high.
    g.drawImage(moonDisc(7), 30, 12)
    // The sea at the horizon.
    rect(g, 0, 88, W, 6, '#0a1430')
    for (let x = 0; x < W; x += 7) rect(g, x, 90 + (x % 3), 4, 1, '#1e2e58')
    // The shore: dark rock and grass, their tops pale in the moonlight.
    for (let x = 0; x < W; x++) {
      const y = Math.round(94 + Math.sin(x / 31) * 3 + Math.sin(x / 9) * 1)
      rect(g, x, y, 1, H - y, '#0c1220')
      rect(g, x, y, 1, 1, '#2a3a5a')
    }
    for (let i = 0; i < 40; i++) rect(g, (i * 53) % W, 100 + ((i * 29) % 55), 2, 1, '#18243a')
    for (let i = 0; i < 14; i++) {
      const x = (i * 71 + 30) % W
      const y = 104 + ((i * 37) % 50)
      const rx = 3 + ((i * 5) % 6) + Math.round((y - 100) / 12)
      ellipse(g, x, y, rx, Math.max(2, rx >> 1), '#141c2c')
      rect(g, x - (rx >> 1), y - Math.max(2, rx >> 1), rx, 1, '#2e3e5a')
    }
    // The triangle of rock, black, its edges catching the moonlight.
    tri(g, 14, 97, 74, 97, 40, 34, '#05070e')
    tri(g, 40, 34, 74, 97, 52, 97, '#0a0e1a')
    line(g, 40, 34, 14, 97, '#34466a')
    line(g, 40, 34, 74, 97, '#1a2a4a')
    return cv
  })

type Dust = { x: number; y: number; z: number }
type Puff = { x: number; y: number; z: number; s: number }
type X = {
  trail: Particles
  virus: Particles
  dust: Dust[]
  puffs: Puff[]
}

export const deoxysCinema = bossCinema<X>({
  id: 'cinema-deoxys',
  reveal: REVEAL,
  seed: 386,
  aura: ['#ffffff', '#c8f0ff', '#a05ae0', '#3a1a5a'],
  flash: '#f0e0ff',
  setup(_st, r) {
    // The static layers, made once: the sky, the Earth's map, the island (the limb comes a few rows a frame).
    starfield()
    globe()
    islandPlate()
    const dust: Dust[] = []
    for (let i = 0; i < 70; i++) dust.push({ x: r.range(-1, 1), y: r.range(-1, 1), z: r() })
    const puffs: Puff[] = []
    for (let i = 0; i < 18; i++)
      puffs.push({
        x: r.range(-1.2, 1.2),
        y: r.range(-0.6, 1),
        z: 1.5 + (i / 18) * 1.5,
        s: r.range(0.7, 1.3),
      })
    // Far first: the near ones drawn over them.
    puffs.sort((a, b) => b.z - a.z)
    return { trail: new Particles(), virus: new Particles(), dust, puffs }
  },
  step(s, t, dt) {
    const r = s.r
    s.trail.update(dt)
    s.virus.update(dt)
    if (t < T_ENTRY) limbPlate(4)
    const fx = s.L.foe.x
    const fy = s.L.foe.y
    // The comet's tail: green motes shed back along it.
    if (t > T_COMET && t < T_ENTRY) {
      const m = cometAt(t)
      for (let i = 0; i < 2; i++) {
        const v = r.range(30, 90) * (1 + spaceCam(t).c * 2)
        s.trail.add({
          x: m.x + r.range(-1, 1),
          y: m.y + r.range(-1, 1),
          vx: m.tx * v + r.range(-8, 8),
          vy: m.ty * v + r.range(-8, 8),
          drag: 1.2,
          life: r.range(0.4, 0.8),
          size: 1,
          shape: r() < 0.3 ? 'plus' : 'px',
          colors: VIRUS,
        })
      }
    }
    if (within(t, T_ENTRY, T_ENTRY + dt)) s.trail.clear()
    // The fire: sparks torn off it, streaming back, and embers glowing out behind.
    if (t > T_ENTRY && t < T_ISLAND) {
      const f = fireAt(t)
      for (let i = 0; i < 3; i++)
        s.trail.add({
          x: f.x + r.range(-3, 3),
          y: f.y + r.range(-3, 3),
          vx: -r.range(90, 200),
          vy: -r.range(30, 110),
          drag: 1.5,
          life: r.range(0.3, 0.6),
          size: r.int(1, 2),
          shape: r() < 0.4 ? 'plus' : 'sq',
          colors: [FIRE[0], FIRE[1], FIRE[2], FIRE[3]],
        })
      if (r() < 0.6)
        s.trail.add({
          x: f.x - r.range(20, 60),
          y: f.y - r.range(10, 30),
          vx: -r.range(20, 60),
          vy: -r.range(5, 20),
          life: r.range(0.4, 0.7),
          size: 1,
          shape: 'px',
          colors: [FIRE[2], FIRE[3], FIRE[4]],
        })
    }
    if (within(t, T_ISLAND, T_ISLAND + dt)) s.trail.clear()
    // Falling on the island: sparks off it.
    if (t > T_ISLAND && t < T_IMPACT) {
      const f = fallAt(t, fx, fy)
      for (let i = 0; i < 3; i++)
        s.trail.add({
          x: f.x + r.range(-3, 3),
          y: f.y + r.range(-3, 3),
          vx: -r.range(30, 90),
          vy: -r.range(60, 140),
          drag: 2,
          life: r.range(0.25, 0.5),
          size: 1,
          shape: 'sq',
          colors: [FIRE[0], FIRE[1], FIRE[2], FIRE[3]],
        })
    }
    // The impact: dust and rock thrown out, embers, smoke.
    if (within(t, T_IMPACT, T_IMPACT + dt)) {
      for (let i = 0; i < 48; i++) {
        const a = -Math.PI / 2 + r.range(-1.4, 1.4)
        const v = r.range(40, 180)
        s.fx.add({
          x: fx,
          y: fy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          ay: 260,
          life: r.range(0.6, 1.1),
          size: r.int(1, 2),
          shape: 'sq',
          colors: [ORANGE[0], ORANGE[1], ORANGE[2], '#3a2a2a'],
        })
      }
      for (let i = 0; i < 20; i++)
        s.fx.add({
          x: fx + r.range(-6, 6),
          y: fy,
          vx: r.range(-70, 70),
          vy: -r.range(0, 24),
          drag: 2,
          life: r.range(0.8, 1.3),
          size: r.int(3, 5),
          size1: 7,
          shape: 'smoke',
          colors: ['#3a3038', '#2a2430', '#1c1824'],
          light: '#4a3a40',
          density: 0.5,
        })
    }
    // The rock smoking.
    if (t > T_IMPACT && t < T_HELIX && r() < 0.5)
      s.fx.add({
        x: fx + r.range(-5, 5),
        y: fy - 6,
        vx: r.range(-4, 4),
        vy: -r.range(8, 16),
        life: 1.2,
        size: 2,
        size1: 5,
        shape: 'smoke',
        colors: ['#342e3c', '#221e2a'],
        light: '#3e3646',
        density: 0.4,
      })
    // The virus climbing with the helix: motes spiralling up it to its tip.
    if (t > T_HELIX && t < T_WRAP)
      for (let i = 0; i < 2; i++) {
        const side = r() < 0.5 ? -1 : 1
        s.virus.add({
          x: fx + side * r.range(8, 16),
          y: fy - 8 - r.range(0, 30),
          vx: -side * r.range(20, 40),
          vy: -r.range(40, 90),
          home: { x: fx, y: fy - 92, k: 220 },
          life: r.range(0.5, 0.8),
          size: 1,
          shape: r() < 0.5 ? 'plus' : 'px',
          colors: ['#ffffff', '#c8ffa0', '#6ae05a', '#2a8a3a'],
        })
      }
    // The virus: green motes swarming out of the crystal and round it.
    if (t > T_CRACK + 0.05 && t < REVEAL + 0.6 && r() < 0.85) {
      const a = r() * Math.PI * 2
      s.virus.add({
        x: fx + Math.cos(a) * 4,
        y: fy - 8 + Math.sin(a) * 3,
        vx: Math.cos(a) * r.range(20, 50),
        vy: Math.sin(a) * r.range(10, 30) - 10,
        drag: 1.5,
        life: r.range(0.6, 1.2),
        size: 1,
        shape: r() < 0.5 ? 'plus' : 'px',
        colors: ['#c8ffa0', '#6ae05a', '#2a8a3a'],
      })
    }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const sh = screenShake(t, SHAKES)
    g.save()
    g.translate(sh.x, sh.y)
    if (t < T_ENTRY) space(g, s, t)
    else if (t < T_ISLAND) limbShot(g, s, t)
    else island(g, s, t, k)
    if (t > T_CLOUDS && t < T_ISLAND) clouds(g, s, t)
    if (within(t, T_DECK, T_DECK + DECK_DUR)) deck(g, span(t, T_DECK, T_DECK + DECK_DUR))
    g.restore()
  },
  before(g, s, t) {
    // The body, glitching into being: copies of it in orange, teal and violet jumping round a silhouette.
    if (t < T_WRAP) return
    const q = span(t, T_WRAP, REVEAL)
    const jit = (n: number) => (Math.floor(t * 30 + n) % 3) - 1
    const glitch = Math.round((1 - q) * 6)
    drawSprite(g, s.foe, s.L.foe.x + jit(0) * glitch, s.L.foe.y, {
      sil: '#120a1e',
      outline: Math.floor(t * 20) % 2 ? TEAL[1] : ORANGE[1],
      ghost: [
        { dx: -glitch - 2, color: ORANGE[2], a: 0.6 },
        { dx: glitch + 2, color: TEAL[2], a: 0.6 },
        { dy: jit(1) * glitch, color: VIOLET[2], a: 0.5 },
      ],
    })
    // Scan lines across it, the mutation settling.
    for (let i = 0; i < 4; i++) {
      const y = s.L.foe.y - ((Math.floor(t * 40) * 7 + i * 13) % 60)
      if (Math.floor(t * 25 + i) % 2) rect(g, s.L.foe.x - 30, y, 60, 1, i % 2 ? TEAL[1] : ORANGE[1])
    }
  },
  front(g, s, t, k) {
    // The air catching fire, and the impact: one flash each, a second and more apart (none in a calm OS).
    if (within(t, T_ENTRY, T_ENTRY + 0.25))
      screenFlash(g, '#ffe8c0', 0.7 * (1 - span(t, T_ENTRY, T_ENTRY + 0.25)))
    if (within(t, T_IMPACT, T_IMPACT + 0.22))
      screenFlash(g, '#fff6e0', 0.65 * (1 - span(t, T_IMPACT, T_IMPACT + 0.22)))
    if (k < 0.5) return
    // The impact's dome of light on the land, gone fast.
    const q = span(t, T_IMPACT, T_IMPACT + 0.35)
    if (q > 0 && q < 1)
      shine(g, s.L.foe.x, s.L.foe.y, Math.round(lerp(8, 44, q)), '#fff6e0', 1, 0.9 * (1 - q))
  },
  sounds: [
    // Space: a low hum, the stars' faint hiss.
    [
      0.05,
      () => (
        tone(55, 1.9, { type: 'sine', vol: 0.05, slide: 8 }),
        hiss(1.8, { freq: 5000, type: 'highpass', vol: 0.012 })
      ),
    ],
    // The crystal passing: a glassy shimmer.
    [
      T_COMET,
      () =>
        [1568, 2093, 1760, 2349].forEach((f, i) =>
          tone(f, 0.25, { type: 'triangle', vol: 0.018, at: i * 0.08 }),
        ),
    ],
    // The camera's rush: a rising whoosh.
    [
      T_FOLLOW,
      () => (
        hiss(1.05, { freq: 250, slide: 2800, vol: 0.06 }),
        tone(82, 1.05, { type: 'sawtooth', vol: 0.025, slide: 120 })
      ),
    ],
    // The air catching fire: a boom and a roar.
    [
      T_ENTRY,
      () => (
        hiss(0.9, { freq: 180, type: 'lowpass', vol: 0.16 }),
        fxSound('fire.stream'),
        tone(62, 0.7, { type: 'sawtooth', vol: 0.05, slide: -22 })
      ),
    ],
    [T_CLOUDS, () => hiss(0.32, { freq: 1600, slide: -1200, vol: 0.06 })],
    // Its whistle as it falls.
    [T_ISLAND, () => tone(1500, 0.42, { type: 'sine', vol: 0.03, slide: -1250 })],
    [
      T_IMPACT,
      () => (
        hiss(1, { freq: 120, type: 'lowpass', vol: 0.2 }),
        tone(45, 0.8, { type: 'sawtooth', vol: 0.06, slide: -15 }),
        fxSound('impact.hit')
      ),
    ],
    [T_CRACK, () => (hiss(0.1, { freq: 5000, vol: 0.05 }), tone(1976, 0.3, { type: 'triangle', vol: 0.02 }))],
    [T_CRACK + 0.1, () => fxSound('legend.heart')],
    // The helix's climb: a rising run of notes, the mutation detuning them.
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_HELIX + i * 0.05,
          () => tone(330 * 2 ** (i / 6) + (i > 4 ? 37 : 0), 0.08, { type: 'square', vol: 0.018 }),
        ] as const,
    ),
    [
      T_MUTATE,
      () => (
        tone(220, 0.45, { type: 'sawtooth', vol: 0.03, slide: 330 }),
        tone(233, 0.45, { type: 'sawtooth', vol: 0.03, slide: 300 })
      ),
    ],
    [T_WRAP, () => fxSound('psychic.focus')],
    [REVEAL, () => (fxSound('legend.roar'), hiss(0.2, { freq: 6000, vol: 0.04 }))],
  ],
})

type S = Stage & X

/** Shot one: the Moon and the Earth in deep space, the crystal crossing, the camera rushing after it. */
function space(g: G, s: S, t: number) {
  const cam = spaceCam(t)
  g.drawImage(starfield(), -Math.round(cam.stars.x), -Math.round(cam.stars.y))
  const er = cam.earth.r
  const eh = haloOf(er)
  g.drawImage(earthDisc(er), Math.round(cam.earth.x) - er - eh, Math.round(cam.earth.y) - er - eh)
  // Dust rushing past, out from where the camera is heading: the faster it goes, the longer the streaks.
  const v = span(t, T_FOLLOW, T_FOLLOW + 0.3) * (0.3 + cam.c * 1.6)
  if (v > 0)
    for (const d of s.dust) {
      const travel = cam.c * 3.2 + (t - T_FOLLOW) * 0.25
      const z = 1 - ((((d.z + travel) % 1) + 1) % 1)
      if (z < 0.04) continue
      const z0 = Math.min(1, z + 0.05 * v)
      const p = (zz: number) => [cam.earth.x + (d.x * 70) / zz, cam.earth.y - 20 + (d.y * 60) / zz] as const
      const [x1, y1] = p(z)
      const [x0, y0] = p(z0)
      if (x1 < -20 || x1 > W + 20 || y1 < -20 || y1 > H + 20) continue
      line(g, x0, y0, x1, y1, z < 0.2 ? '#a8b8e0' : z < 0.45 ? '#5a6a98' : '#2e3858')
    }
  const m = cam.moon
  if (m.x + m.r > -2) g.drawImage(moonDisc(m.r), Math.round(m.x) - m.r, Math.round(m.y) - m.r)
  s.trail.draw(g)
  if (t > T_COMET) {
    const c = cometAt(t)
    comet(g, c.x, c.y, c.tx, c.ty, t)
  }
}

/** Shot two: the limb close up, the fireball over it, the camera following it down; then into the clouds. */
function limbShot(g: G, s: S, t: number) {
  const p = plateAt(t)
  const p0 = plateAt(T_ENTRY)
  g.drawImage(starfield(), Math.round(-40 + p.x * 0.25), Math.round(-50 + p.y * 0.25))
  g.drawImage(limbPlate(), Math.round(p.x), Math.round(p.y))
  const f = fireAt(t)
  const grow = ease.outBack(span(t, T_ENTRY, T_ENTRY + 0.22), 1.6)
  // The air lit where it went in: a flare spreading along the limb, fading.
  const ex = 108 - p0.x
  const fl = span(t, T_ENTRY, T_ENTRY + 0.7)
  if (fl < 1)
    flat(g, ex + p.x, limbY(ex) + p.y, Math.round(lerp(14, 60, ease.outC(fl))), '#ffb070', 0.9 * (1 - fl))
  // Its light round it in the air.
  shine(g, f.x, f.y, 20, '#ff9a3a', 1.4, 0.45)
  s.trail.draw(g)
  fireball(g, f.x, f.y, 0.894, 0.447, 6 * grow, 90 * ease.outC(span(t, T_ENTRY, T_ENTRY + 0.35)), t)
}

/** Diving after it: clouds rushing up at the camera, lit orange from above, the island opening out under them. */
function clouds(g: G, s: S, t: number) {
  const e = t - T_CLOUDS
  for (const p of s.puffs) {
    const z = p.z - e * 8.5
    if (z < 0.05 || z > 3) continue
    const x = 150 + (p.x * 80) / z
    const y = 82 + (p.y * 54) / z
    const r = Math.round((p.s * 14) / z)
    // Close enough to fill the screen: it has gone past.
    if (r > 150) continue
    if (x + r * 2 < 0 || x - r * 2 > W || y + r < 0 || y - r * 1.5 > H) continue
    cumulus(g, x, y, r)
  }
}

/** A heap of cloud: round tops on a flat base, dark violet below, the fire's light on their crowns. */
function cumulus(g: G, x: number, y: number, r: number) {
  const tops = [
    [-1.1, 0.15, 0.6],
    [-0.45, -0.2, 0.8],
    [0.35, -0.1, 0.72],
    [1.05, 0.2, 0.55],
  ] as const
  // Lit first, then the body over it a little lower: the light stays as a thin crescent on each crown.
  const lit = Math.max(1, Math.round(r * 0.06))
  for (const [i, c] of [
    [0, '#d07a52'],
    [1, '#5a3450'],
    [3, '#2a2440'],
  ] as const)
    for (const [ox, oy, k] of tops) {
      const rr = Math.round(k * r)
      ellipse(g, x + ox * r, y + oy * r + lit * i, rr, rr, c)
    }
  // The base, flat and darker, its lower edge breaking up.
  const bw = Math.round(r * 1.7)
  const bh = Math.max(1, Math.round(r * 0.4))
  ellipse(g, x, y + r * 0.45, bw, bh, '#1c1a32')
  const fw = Math.round(bw / 8) * 8
  if (fw > 0) g.drawImage(fringe(fw), Math.round(x) - fw, Math.round(y + r * 0.45) + bh - 1)
}

/**
 * The cloud deck, `q` 0..1: its top rising into the frame, crowns lit by the fire above, then all of it (the cut
 * happens in there), then its ragged underside going up and out of the top.
 */
function deck(g: G, q: number) {
  const top = Math.round(lerp(H + 12, -300, q))
  const bot = top + 230
  rect(g, 0, Math.max(0, top + 6), W, Math.min(H, bot) - Math.max(0, top + 6), '#221c38')
  // The fire inside it, lighting it from within as it goes through.
  oval(g, 150, top + 96, 84, 56, '#4a2440', 0.8)
  oval(g, 150, top + 92, 52, 34, '#8a3a3a', 0.7)
  oval(g, 150, top + 90, 24, 16, '#e07a4a', 0.7)
  // Wisps inside it, going by.
  for (let i = 0; i < 8; i++) {
    const y = top + 30 + i * 24
    if (y < -6 || y > H + 6 || y > bot - 10) continue
    ellipse(g, (i * 67 + 20) % W, y, 26 + ((i * 13) % 24), 3, i % 2 ? '#2e2848' : '#1a1630')
  }
  // Its crowns: a row of heaps, lit orange on top.
  for (let x = -8, i = 0; x < W + 16; x += 22, i++) {
    const r = 12 + ((i * 7) % 3) * 4
    const y = top + 8 + ((i * 5) % 3) * 3
    if (y - r > H) continue
    ellipse(g, x, y, r, r, '#d07a52')
    ellipse(g, x, y + 2, r, r, '#5a3450')
    ellipse(g, x, y + 5, r, r, '#221c38')
  }
  // Its underside: hanging heaps, darker, a dithered fringe.
  for (let x = 0, i = 0; x < W + 16; x += 26, i++) {
    const r = 10 + ((i * 3) % 3) * 4
    if (bot + r < 0) continue
    ellipse(g, x, bot, r, Math.round(r * 0.6), '#1a1630')
    g.drawImage(fringe(r), x - r, bot + Math.round(r * 0.6) - 1)
  }
}

/** A cloud's ragged underside: a dithered strip under its base, thinning out (cached per width). */
const fringe = (w: number) =>
  cached(`deoxys-fringe|${w}`, () =>
    shade(2 * w + 1, 6, (x, y) => {
      const u = (x - w) / w
      return (1 - u * u) * (1 - y / 6) > bayer(x, y) ? '#1c1a32' : null
    }),
  )

/** Birth Island: the fireball coming down on it, the impact, the crater, the crystal and the helix. */
function island(g: G, s: S, t: number, k: number) {
  const fx = s.L.foe.x
  const fy = s.L.foe.y
  // Under the plate, for the impact's shake to uncover; never while it dissolves into the battle's ground.
  if (k >= 1) rect(g, -4, -4, W + 8, H + 8, '#05070e')
  dissolve(g, islandPlate(), k)
  if (k < 0.5) return
  // The fireball: down out of the sky onto the shore, the sea and the land lit orange under it.
  if (t < T_IMPACT) {
    const f = fallAt(t, fx, fy)
    for (let x = 0; x < W; x += 5) {
      const near = 1 - Math.abs(x - f.x) / 70
      if (near > 0 && near * f.q > bayer(x, 3) * 0.8) rect(g, x, 90 + (x % 3), 3, 1, ORANGE[1])
    }
    flat(g, fx, fy, Math.round(20 + 50 * f.q), '#ff7a2a', 0.2 + 0.6 * f.q)
    shine(g, f.x, f.y, 22, '#ff9a3a', 1.4, 0.5)
    s.trail.draw(g)
    fireball(g, f.x, f.y, 0.58, 0.815, 7, 100, t)
    return
  }
  // The crater, glowing; the rock in it, cracking; the crystal shining inside.
  const cool = span(t, T_IMPACT, T_IMPACT + 1.2)
  ellipse(g, fx, fy + 1, 26, 5, '#120c14')
  ellipse(g, fx, fy + 1, 22, 4, cool < 0.5 ? ORANGE[2] : ORANGE[3])
  ellipse(g, fx, fy, 18, 3, '#1a1420')
  if (t < T_HELIX + 0.3) {
    // The meteorite, half buried, glowing as it cools.
    ellipse(g, fx, fy - 4, 9, 7, cool < 0.3 ? '#8a3a1a' : '#2a2430')
    ellipse(g, fx - 2, fy - 6, 6, 4, cool < 0.3 ? '#c8602a' : '#4a4050')
    rect(g, fx - 5, fy - 9, 4, 1, cool < 0.3 ? ORANGE[1] : '#6a6070')
  }
  const cr = span(t, T_CRACK, T_CRACK + 0.18)
  if (cr > 0) {
    const pts: [number, number][] = [
      [fx - 1, fy - 11],
      [fx + 1, fy - 7],
      [fx - 2, fy - 4],
      [fx + 1, fy],
    ]
    polyline(g, pts.slice(0, Math.max(2, Math.round(pts.length * cr))), VIOLET[1])
    // The crystal: a violet diamond, pulsing, its light out through the cracks.
    const pul = 0.5 + 0.5 * Math.sin(t * 9)
    const gr = Math.round(10 + pul * 6 + span(t, T_HELIX, REVEAL) * 12)
    shine(g, fx, fy - 6, gr, VIOLET[2], 1.2, 0.6 * cr)
    const cs = t > T_HELIX ? 4 : 3
    tri(g, fx - cs, fy - 6, fx + cs, fy - 6, fx, fy - 6 - cs * 1.6, VIOLET[2])
    tri(g, fx - cs, fy - 6, fx + cs, fy - 6, fx, fy - 6 + cs * 1.4, VIOLET[3])
    rect(g, fx - 1, fy - 9, 1, 2, VIOLET[0])
  }
  for (const [d, c] of [
    [0, '#ffffff'],
    [0.1, ORANGE[1]],
  ] as const)
    burstRing(g, fx, fy, span(t, T_IMPACT + d, T_IMPACT + d + 0.7), 150, 2, c)
  s.virus.draw(g)
  // The double helix climbing out of the crystal, turning, mutating; then wrapping into a body.
  if (within(t, T_HELIX, REVEAL)) helix(g, t, fx, fy - 8)
}

/** The crystal in space: a violet diamond in a green glow, a glint turning on it, its tail of light behind. */
function comet(g: G, x: number, y: number, tx: number, ty: number, t: number) {
  x = Math.round(x)
  y = Math.round(y)
  for (const [len, c, w] of [
    [34, '#1a4a5a', 3],
    [26, '#2aa88a', 2],
    [14, '#8affc8', 1],
  ] as const)
    line(g, x, y, x + tx * len, y + ty * len, c, w)
  shine(g, x, y, 12, '#2ac8a0', 2.2, 0.6)
  shine(g, x, y, 6, '#8affc8', 1.4, 0.5)
  tri(g, x - 3, y, x + 3, y, x, y - 6, VIOLET[1])
  tri(g, x - 3, y, x + 3, y, x, y + 5, VIOLET[2])
  tri(g, x, y, x + 3, y, x, y + 5, VIOLET[3])
  rect(g, x - 1, y - 3, 1, 3, '#ffffff')
  // A four-point glint, turning: straight, then slanted.
  const L = 5 + (Math.floor(t * 12) % 2)
  if (Math.floor(t * 8) % 2) {
    rect(g, x - L, y, L * 2 + 1, 1, '#c8ffe0')
    rect(g, x, y - L, 1, L * 2 + 1, '#c8ffe0')
  } else
    for (let i = 2; i < L - 1; i++)
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const)
        rect(g, x + sx * i, y + sy * i, 1, 1, '#8affc8')
  rect(g, x, y, 1, 1, '#ffffff')
}

/**
 * A fireball heading along (dx, dy): its flames in layers, dark red outside to white in the core, streaming back and
 * wavering; the white-hot head, the crystal's violet at its heart, the shock in the air in front of it.
 */
function fireball(g: G, x: number, y: number, dx: number, dy: number, size: number, len: number, t: number) {
  if (size < 0.5) return
  const n = Math.max(6, Math.round(len / 3))
  const layers = [
    [FIRE[4], 1.25, 1],
    [FIRE[3], 1.0, 0.82],
    [FIRE[2], 0.78, 0.6],
    [FIRE[1], 0.56, 0.38],
    [FIRE[0], 0.34, 0.16],
  ] as const
  for (const [c, rs, ls] of layers) {
    const L = len * ls
    for (let i = n; i >= 0; i--) {
      const u = i / n
      const flick = Math.sin(u * 13 - t * 38) * 0.18 + Math.sin(u * 5 + t * 21) * 0.12
      const r = Math.round(size * rs * (1 - u) ** 0.6 * (1 + flick))
      if (r < 1 && u > 0.1) continue
      // The tail wavers sideways, more towards its end.
      const w = Math.sin(u * 7 - t * 26) * u * size * 0.6
      ellipse(g, x - dx * u * L - dy * w, y - dy * u * L + dx * w, r, r, c)
    }
  }
  // The head: white-hot, the crystal's violet at its heart.
  const hr = Math.max(1, Math.round(size * 0.45))
  ellipse(g, x, y, hr, hr, '#ffffff')
  rect(g, x - 1, y - 1, 2, 2, VIOLET[1])
  // The shock in front of it: a white arc and an orange one round its nose.
  const a = Math.atan2(dy, dx)
  const br = Math.round(size * 1.5)
  ellipseLine(g, x + dx * 1.5, y + dy * 1.5, br, br, '#fff6e0', a - 1.1, a + 1.1)
  ellipseLine(g, x + dx * 1.5, y + dy * 1.5, br + 2, br + 2, FIRE[2], a - 0.9, a + 0.9)
}

/** The helix: two strands climbing and turning, rungs between them; mutating (rungs flickering, strands breaking). */
function helix(g: G, t: number, x: number, y0: number) {
  const grow = ease.outC(span(t, T_HELIX, T_HELIX + 0.35))
  const wrap = ease.inQ(span(t, T_WRAP, REVEAL))
  const mut = span(t, T_MUTATE, T_WRAP)
  const top = Math.round(lerp(y0, y0 - 84, grow) + wrap * 24)
  const R = Math.round(lerp(13, 2, wrap))
  // A column of violet light behind it, from the crystal to its tip.
  const hh = (y0 - top) / 2
  if (hh > 2) {
    oval(g, x, y0 - hh, 14, hh + 8, VIOLET[3], 0.55 * (1 - wrap))
    oval(g, x, y0 - hh, 6, hh + 4, VIOLET[2], 0.5 * (1 - wrap))
  }
  for (let y = y0; y > top; y -= 2) {
    const ph = (y0 - y) / 8 + t * 6
    const a = Math.cos(ph) * R
    const b = -a
    const front = Math.sin(ph) > 0
    // The mutation: some rows jump sideways and swap colours.
    const glitch = mut > 0 && Math.floor(t * 15 + y) % 7 === 0 ? (Math.floor(t * 40 + y) % 7) - 3 : 0
    const ca = glitch ? TEAL[1] : ORANGE[1]
    const cb = glitch ? ORANGE[1] : TEAL[1]
    if ((y0 - y) % 6 === 0)
      line(
        g,
        x + a + glitch,
        y,
        x + b + glitch,
        y,
        glitch ? VIOLET[1] : (y0 - y) % 12 ? '#6a4a9a' : '#4a6a9a',
      )
    // The strand in front thick and bright, the one behind thin and dark.
    rect(g, x + a + glitch - (front ? 1 : 0), y, front ? 3 : 2, 2, front ? ca : ORANGE[3])
    rect(g, x + b + glitch - (front ? 1 : 0), y, front ? 2 : 3, 2, front ? TEAL[3] : cb)
  }
  // Its tip: a spark climbing.
  g.drawImage(glow(7, VIOLET[1], 1.2, 0.9), x - 7, top - 7)
  rect(g, x - 1, top - 1, 3, 3, '#ffffff')
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

/** A dithered oval of light, its radii and strength in steps (cached), centred on (x, y). */
function oval(g: G, x: number, y: number, rx: number, ry: number, c: string, max: number) {
  const k = Math.round(Math.min(1, max) * 8) / 8
  if (k <= 0 || rx < 2 || ry < 2) return
  const qx = Math.max(2, Math.round(rx / 4) * 4)
  const qy = Math.max(2, Math.round(ry / 4) * 4)
  const cv = cached(`deoxys-oval|${qx}|${qy}|${c}|${k}`, () =>
    shade(2 * qx + 1, 2 * qy + 1, (px, py) => {
      const d = ((px - qx) / qx) ** 2 + ((py - qy) / qy) ** 2
      return d < 1 && (1 - d) ** 1.4 * k > bayer(px, py) ? c : null
    }),
  )
  g.drawImage(cv, Math.round(x) - qx, Math.round(y) - qy)
}

/** A glow squashed flat: light lying on the ground, or along the air. */
const flat = (g: G, x: number, y: number, r: number, c: string, max: number) =>
  oval(g, x, y, r, r / 4, c, max)
