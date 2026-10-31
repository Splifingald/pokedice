// Kukui's entrance (docs/54), on the battle stage: the Pokémon League on Mount Lanakila's summit at dusk. The camera
// rises out of a bank of cloud onto the summit: below it Alola, the ocean gold and rose with the sun just gone, the
// islands dark on it and Wela Volcano's crater glowing; a full moon coming up behind a spire of rock; and the champion's
// court, a square of stone with a Tapu totem at each corner. A figure stands on the spire against the moon. Lycanroc
// bounds up beside him and howls, and one by one the four guardians' crests light on their totems; ropes of light run
// from post to post and the court is a ring. The professor dives off the spire as off the top rope, a moonsault across
// the moon (the camera tilting up after him), and lands in the ring with a quake that sets the ropes thrumming. His
// Z-Ring flares, rings of Z-Power climb round him, and Lycanroc's Splintered Stormshards burst up out of the floor in a
// circle round him and shatter: the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  mix,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import {
  burstRing,
  dGradient,
  dissolve,
  drawShards,
  makeShard,
  pulse,
  stepShards,
  tri,
  type Shard,
} from '../kit'

const REVEAL = 4.6
/** How far the camera rises (px, at the summit's depth); the sky and the cloud sea move less, the near cloud more. */
const RISE = 44
const T_RISE0 = 0.05
const T_RISE1 = 1.2
const T_WOLF = 0.85
const T_HOWL = 1.18
/** The four crests light in turn round the ring, then the ropes run post to post. */
const T_CREST = 1.5
const T_ROPES = 2.1
const T_CROUCH = 2.32
const T_LEAP = 2.5
const T_LAND = 3.05
const T_ZRING = 3.22
const T_SHARDS = 3.74
const T_BREAK = 4.24

/** The cloud sea's horizon, the moon, the spire's top (where they stand). */
const HZ = 60
const MOON = { x: 82, y: 30, r: 28 }
const PEAK = 56
const WOLF_X = 56
const PROF_X = 92
const FAR_SC = 0.5
const SKY_M = 24
const LYC = spriteKey(745, false)

/** The court: its far edge, the totems at its corners (x, foot, height), far left first, then round the ring. */
const FAR = 88
const POSTS = [
  [42, 88, 36],
  [206, 88, 36],
  [232, 152, 62],
  [8, 152, 62],
] as const
/** Each guardian's light: Lele, Koko, Fini, Bulu (their crests' colours, light to dark). */
const CRESTS = [
  ['#ffe0f0', '#ff8ac8', '#c84a90'],
  ['#fff6c0', '#ffd23a', '#d88a1a'],
  ['#f0e0ff', '#b48aff', '#6a4ac8'],
  ['#ffe0c0', '#ff6a3a', '#b02a1a'],
] as const
/** Rope heights over the floor at a far post; a near post is bigger by its own height's ratio. */
const ROPES = [10, 18, 26] as const

const SNOW = ['#fff4fa', '#f4d4e4', '#c8a8d8', '#8a78b8', '#5a4a88'] as const
const ROCK = ['#a0607a', '#6a3a62', '#3e2448', '#24163a', '#160c26'] as const
/** Stormshards' stone: its Z-lit face, its facets, its shade, the ground's dark at its foot. */
const STONE = ['#ffc898', '#d8906a', '#9a6060', '#5a3a4e', '#2e1c30'] as const
const ZP = ['#ffffff', '#fff6c8', '#ffe04a', '#ffa82a', '#e8601a'] as const
const NIGHT = '#120a22'

const q8 = (v: number) => Math.round(clamp(v) * 8) / 8
/** Where the camera is: 0 down in the cloud, 1 on the summit. */
const camAt = (t: number) => ease.ioS(span(t, T_RISE0, T_RISE1))

/** The sky at dusk: indigo overhead through violet and rose to the gold where the sun has just gone. */
function skyLayer(): Canvas {
  // SKY_M rows above the frame: the camera's tilt after him shows some of them.
  const cv = canvas(W, H + SKY_M)
  const g = cv.g
  rect(g, 0, 0, W, H + SKY_M, '#ffd08a')
  rect(g, 0, 0, W, SKY_M, '#120c34')
  g.drawImage(
    dGradient(W, HZ + 12, [
      '#120c34',
      '#22145a',
      '#3e1c6e',
      '#6a2a7a',
      '#a8407a',
      '#e0687a',
      '#ffa070',
      '#ffd08a',
    ]),
    0,
    SKY_M,
  )
  const r = rng(7451)
  for (let i = 0; i < 52; i++) {
    const y = r.range(0, 34 + SKY_M)
    rect(g, r.range(0, W), y, 1, 1, y < 16 + SKY_M && r() < 0.3 ? '#ffffff' : '#8a7ac8')
  }
  // The afterglow where the sun went down, to the right.
  g.drawImage(glow(60, '#ffc890', 1.3, 0.7), SUN_X - 60, HZ - 50 + SKY_M)
  return cv
}

/** The full moon rising: pale gold, its seas, a thin lit limb toward the sunset. */
function moonDisc(): Canvas {
  const R = MOON.r
  const cv = canvas(R * 2 + 1, R * 2 + 1)
  const g = cv.g
  ellipse(g, R, R, R, R, '#f8ecd0')
  // Its seas: soft-edged blotches, a darker heart in each.
  for (const [x, y, rx, ry] of [
    [-9, -7, 8, 6],
    [6, -10, 6, 4],
    [-3, 7, 11, 7],
    [11, 4, 5, 6],
  ] as const)
    for (let yy = -ry; yy <= ry; yy++)
      for (let xx = -rx; xx <= rx; xx++) {
        const d = (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry)
        if (d >= 1) continue
        const px = R + x + xx
        const py = R + y + yy
        if (d < 0.35) rect(g, px, py, 1, 1, '#d8c4a0')
        else if (d < 0.75 || bayer(px, py) < (1 - d) * 3) rect(g, px, py, 1, 1, '#e8d8b6')
      }
  for (const [x, y] of [
    [-12, 10],
    [6, 13],
    [12, -10],
    [-2, -14],
  ] as const) {
    ellipse(g, R + x, R + y, 1, 1, '#d0b890')
    rect(g, R + x - 1, R + y - 1, 1, 1, '#fffaf0')
  }
  // The lower-left limb a shade dimmer: the light comes from the sunset side.
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const x = Math.round(R + Math.cos(a) * R)
    const y = Math.round(R + Math.sin(a) * R)
    rect(g, x, y, 1, 1, Math.cos(a) > 0.2 ? '#fffaf0' : '#e8d4b0')
  }
  return cv
}

/** A cumulus puff: lit on top in the sunset, violet underneath, dithered between. */
function puff(g: G, cx: number, cy: number, rx: number, ry: number, lit: readonly string[]) {
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25))))
    for (let x = -hw; x <= hw; x++) {
      // Light from above and from the sunset (right).
      const v = 0.55 - (y / ry) * 0.45 + (x / rx) * 0.15
      const i = clamp(
        Math.floor((1 - v) * (lit.length - 0.01) + bayer(cx + x, cy + y) - 0.5),
        0,
        lit.length - 1,
      )
      rect(g, cx + x, cy + y, 1, 1, lit[i]!)
    }
  }
}

const CLOUD = ['#ffd8b8', '#f8a0a0', '#c870a0', '#8a4a8e', '#523272'] as const

/**
 * The bank of cloud the camera rises out of: rows of heaped puffs, each row in front of the one above, deeper in shade
 * the lower it is, so there is no flat fill anywhere.
 */
function cloudBank(r: Rng): Canvas {
  const cv = canvas(W, 190)
  const tones = [CLOUD, CLOUD.slice(1), CLOUD.slice(2)] as const
  for (let row = 0; row < 9; row++) {
    const y = 10 + row * 20
    const pal = tones[Math.min(2, Math.floor(row / 3))]!
    for (let x = -14 + r.range(0, 10); x < W + 24; x += r.range(18, 28))
      puff(cv.g, Math.round(x), Math.round(y + r.range(-4, 4)), r.int(16, 26), r.int(12, 18), pal)
  }
  return cv
}

/** Where the sun went down (its path of light on the sea lies under it). */
const SUN_X = 184

/**
 * Below the summit, Alola: the ocean at sunset with the sun's path glittering across it, the islands dark on it (Akala
 * far off with Wela Volcano's crater glowing, Melemele low on the horizon), Mount Hokulani's observatory on the next
 * peak, and a few clouds lying low under the summit.
 */
function seaLayer(r: Rng): Canvas {
  const cv = canvas(W, H + RISE)
  const g = cv.g
  // The sea: the sky's rose and gold at the horizon, deepening to violet toward us; long swells catching the light.
  g.drawImage(
    dGradient(W, H + RISE - HZ, ['#f0a088', '#c8708e', '#8a4a8a', '#56357a', '#36286a', '#261e58']),
    0,
    HZ,
  )
  for (let i = 0; i < 70; i++) {
    const y = HZ + 2 + Math.round(r() ** 1.6 * (H + RISE - HZ - 4))
    const len = Math.round(lerp(3, 14, (y - HZ) / (H + RISE - HZ)))
    rect(g, r.range(-4, W), y, len, 1, y < HZ + 12 ? '#ffc8a0' : '#a8609a')
  }
  // The sun's path: gold dashes under where it set, wider and broken toward us.
  for (let y = HZ + 1; y < H + RISE; y += 2) {
    const q = (y - HZ) / (H + RISE - HZ)
    const hw = Math.round(lerp(3, 26, q))
    for (let k = 0; k < 3; k++) {
      const x = SUN_X + Math.round(r.range(-hw, hw))
      rect(g, x, y, Math.round(r.range(2, 2 + 6 * (1 - q))), 1, k ? '#ffd08a' : '#fff0c8')
    }
  }
  // Akala, far off: Wela Volcano's cone, its crater lit red, a thread of smoke leaning away.
  const WT = HZ - 12
  for (let y = WT; y < HZ + 1; y++) {
    const hw = Math.round(3 + ((y - WT) / (HZ - WT)) ** 1.3 * 30)
    rect(g, 22 - hw, y, hw * 2 + 1, 1, '#5a3a7a')
    rect(g, 22, y, hw + 1, 1, '#6a4280')
    rect(g, 22 + hw, y, 1, 1, '#d87a8a')
  }
  rect(g, 20, WT, 5, 1, '#ff6a3a')
  rect(g, 21, WT - 1, 3, 1, '#ffb070')
  for (let i = 0; i < 16; i++) {
    const y = WT - 2 - i
    const x = 22 + Math.round(i * 0.9 + Math.sin(i * 0.6) * 1.5)
    if (bayer(x, y) < 0.7 - i * 0.03) rect(g, x, y, 2, 1, '#8a5a8a')
  }
  // Melemele, low on the horizon.
  for (let x = 118; x < 160; x++) {
    const top = Math.round(HZ - 2 - Math.max(0, Math.sin(((x - 118) / 42) * Math.PI)) * 4)
    rect(g, x, top, 1, HZ + 1 - top, '#4a3272')
    rect(g, x, top, 1, 1, '#c87a8a')
  }
  // Mount Hokulani, the next peak along the island, near and dark, the observatory's dome on top catching the sun.
  const HX = 232
  for (let y = 44; y < H + RISE; y++) {
    const hw = Math.round(2 + Math.min(1, (y - 44) / 40) ** 1.3 * 22)
    rect(g, HX - hw, y, hw * 2 + 1, 1, '#3a2860')
    rect(g, HX - hw, y, Math.round(hw * 0.6), 1, '#2e2050')
    rect(g, HX - hw, y, 1, 1, '#b86a86')
    if ((y - 44) % 7 === 3) rect(g, HX - Math.round(hw * 0.7), y, Math.round(hw * 0.5), 1, '#4a3270')
  }
  ellipse(g, HX, 42, 4, 3, '#e8d8f0')
  rect(g, HX - 4, 42, 9, 3, '#9a8ab8')
  rect(g, HX - 3, 40, 1, 2, '#fff6e0')
  // A few clouds lying low under the summit, lit rose on top, leaving the sun's path clear.
  for (let row = 0; row < 3; row++) {
    const y = HZ + 12 + row * 8
    const sc = 0.6 + row * 0.35
    for (let x = r.range(-10, 30); x < W + 20; x += r.range(40, 70))
      if (Math.abs(x - SUN_X) > 24)
        puff(
          g,
          Math.round(x),
          Math.round(y + r.range(-2, 2)),
          Math.round(r.range(9, 15) * sc),
          Math.round(r.range(3, 4) * sc),
          CLOUD,
        )
  }
  return cv
}

/** The summit: its ridge of snow and rock, the spire, the court's stone square, the far totems. */
function summitLayer(r: Rng): Canvas {
  const cv = canvas(W, H + RISE)
  const g = cv.g
  // Behind the court: drifts and boulders along the ridge.
  for (let x = 0; x < W; x++) {
    const top = Math.round(82 + Math.sin(x * 0.07) * 2 + Math.sin(x * 0.19 + 1) * 1.5)
    for (let y = top; y < FAR + 2; y++) {
      const v = (y - top) / 12
      rect(g, x, y, 1, 1, v < 0.15 ? SNOW[0] : v < 0.5 + bayer(x, y) * 0.3 ? SNOW[1] : SNOW[2])
    }
  }
  for (let i = 0; i < 9; i++) rock(g, r.range(100, 236), r.range(85, 88), r.range(4, 8), r.range(2, 4))
  rock(g, 228, 88, 14, 10)
  rock(g, 108, 87, 8, 6)
  spire(g, r)
  // The court: stone slabs in perspective, a lip of dressed stone at the far edge, the ring's circle.
  for (let y = FAR; y < H + RISE; y++) {
    const q = (y - FAR) / (H - FAR)
    const x0 = Math.round(lerp(40, -70, q))
    const x1 = Math.round(lerp(208, 310, q))
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      // Lit from the sunset side, darker toward us.
      const v = 0.62 - q * 0.25 + ((x - x0) / (x1 - x0)) * 0.18
      rect(
        g,
        x,
        y,
        1,
        1,
        v > 0.6 + bayer(x, y) * 0.15 ? '#9a7a9a' : v > 0.42 + bayer(x, y) * 0.15 ? '#7a5a86' : '#5a4272',
      )
    }
    // Slab joints: across at widening intervals, and toward the vanishing point.
    if ([0, 3, 8, 15, 25, 39, 58].includes(y - FAR))
      rect(g, Math.max(0, x0), y, Math.min(W, x1) - Math.max(0, x0), 1, '#4a3462')
    for (let k = -6; k <= 6; k++) {
      const x = Math.round(124 + k * lerp(14, 40, q))
      if (x >= x0 && x <= x1) rect(g, x, y, 1, 1, '#4a3462')
    }
    if (x0 >= 0) {
      rect(g, x0, y, 2, 1, SNOW[1])
      rect(g, x0 - 1, y, 1, 1, SNOW[3])
    }
    if (x1 < W) {
      rect(g, x1 - 1, y, 2, 1, '#c8a0b8')
      rect(g, x1 + 1, y, 1, 1, SNOW[3])
    }
  }
  rect(g, 40, FAR - 2, 169, 2, '#b89ab8')
  rect(g, 40, FAR - 2, 169, 1, '#e8d0e0')
  // The ring's emblem: a circle and the Poké Ball's band, white lines worn into the stone.
  ellipseLine(g, 124, 112, 44, 11, '#d8c8e0')
  ellipseLine(g, 124, 112, 43, 11, '#b8a0c8')
  rect(g, 50, 112, 33, 1, '#c8b8d8')
  rect(g, 165, 112, 44, 1, '#c8b8d8')
  ellipseLine(g, 124, 112, 8, 3, '#d8c8e0')
  // Snow drifted against the near edges.
  for (let x = 0; x < W; x++) {
    const d = Math.round(Math.max(0, Math.sin(x * 0.05) * 3 + 2))
    if (x < 30 || x > 214) for (let y = 0; y < d; y++) rect(g, x, H + RISE - 1 - y, 1, 1, SNOW[1])
  }
  return cv
}

/** A boulder half in the snow: rose on its sunset side, violet in shade, snow on its top. */
function rock(g: G, cx: number, base: number, rx: number, ry: number) {
  for (let y = -ry; y <= 0; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    for (let x = -hw; x <= hw; x++) {
      const v = 0.45 + (x / rx) * 0.4 - (y / ry) * 0.1
      const i = clamp(Math.floor((1 - v) * 3.5 + bayer(cx + x, base + y) * 0.9), 0, 4)
      rect(g, cx + x, base + y, 1, 1, ROCK[i]!)
    }
    if (y === -ry || y === -ry + 1) rect(g, cx - hw + 1, base + y, Math.max(1, hw * 2 - 1), 1, SNOW[1])
  }
}

/** The spire of rock against the moon: jagged, its sunset face rose, its moon side rimmed cool, snow on its ledges. */
function spire(g: G, r: Rng) {
  const top = PEAK
  const base = FAR + 2
  let lj = 0
  let rj = 0
  for (let y = top; y < base; y++) {
    const q = (y - top) / (base - top)
    if (y % 3 === 0) {
      lj = clamp(lj + r.range(-1.6, 1.6), -3, 3)
      rj = clamp(rj + r.range(-1.6, 1.6), -3, 3)
    }
    const x0 = Math.round(lerp(42, 20, q ** 1.4) + lj)
    const x1 = Math.round(lerp(102, 118, q ** 1.4) + rj)
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0)
      const v = 0.2 + u * 0.55 + (Math.sin(y * 0.6 + x * 0.2) > 0.6 ? 0.12 : 0)
      const i = clamp(Math.floor((1 - v) * 4 + bayer(x, y) * 0.9), 1, 4)
      rect(g, x, y, 1, 1, ROCK[i]!)
    }
    rect(g, x0, y, 1, 1, '#a898d8')
    rect(g, x1, y, 1, 1, ROCK[0])
    // Ledges holding snow.
    if (y > top + 6 && y % 9 === 4) rect(g, x0 + 2, y, Math.round((x1 - x0) * r.range(0.3, 0.6)), 1, SNOW[1])
  }
  // Cracks down its face.
  for (let i = 0; i < 4; i++) {
    let x = r.range(54, 84)
    for (let y = top + 4; y < base - 4; y += 2) {
      x += r.range(-1, 1)
      rect(g, Math.round(x), y, 1, 2, ROCK[4])
    }
  }
  // The summit's snow cap, flat enough to stand on.
  for (let x = 40; x <= 104; x++) {
    const d = Math.round(2 + Math.sin(x * 0.4) * 0.8)
    rect(g, x, top - 1, 1, d + 1, SNOW[0])
    rect(g, x, top + d, 1, 1, SNOW[2])
  }
}

/** A Tapu totem: a carved post (faces stacked up it), its guardian's crest on top. Its crest's glow is drawn live. */
function totem(g: G, x: number, foot: number, h: number, i: number) {
  const s = h / 36
  const w = Math.round(4 * s)
  // The plinth.
  rect(g, x - w - 2, foot - Math.round(3 * s), w * 2 + 5, Math.round(3 * s), '#5a4272')
  rect(g, x - w - 2, foot - Math.round(3 * s), w * 2 + 5, 1, '#b89ab8')
  for (let y = foot - h; y < foot - Math.round(3 * s); y++) {
    const k = (y - (foot - h)) % Math.round(10 * s)
    // Wood: lit on its sunset side; a band and a carved face every few rows.
    for (let xx = -w; xx <= w; xx++) {
      const v = 0.4 + (xx / w) * 0.35
      rect(
        g,
        x + xx,
        y,
        1,
        1,
        v > 0.55 + bayer(x + xx, y) * 0.2 ? '#a8684a' : v > 0.3 ? '#7a4632' : '#4a2a22',
      )
    }
    if (k === 0) rect(g, x - w, y, w * 2 + 1, 1, '#2a1612')
    if (k === Math.round(4 * s)) {
      rect(g, x - Math.round(2 * s), y, Math.max(1, Math.round(s)), Math.max(1, Math.round(s)), '#1a0e0a')
      rect(g, x + Math.round(s), y, Math.max(1, Math.round(s)), Math.max(1, Math.round(s)), '#1a0e0a')
    }
    if (k === Math.round(7 * s)) rect(g, x - Math.round(2 * s), y, Math.round(4 * s) + 1, 1, '#1a0e0a')
  }
  // The crest's shell: a disc set on the post, dark until it lights.
  const cr = Math.round(6 * s)
  const cy = foot - h - cr + 2
  ellipse(g, x, cy, cr + 1, cr + 1, '#2a1a2a')
  ellipse(g, x, cy, cr, cr, CRESTS[i]![2])
  ellipse(g, x - 1, cy - 1, Math.max(1, cr - 2), Math.max(1, cr - 2), mix(CRESTS[i]![2], '#000000', 0.35))
}

/** Each guardian's mark on its crest, in light (shapes, never letters): Lele's butterfly, Koko's bolt, Fini's wave, Bulu's leaf. */
const MARKS = [
  ['xx.xx', 'xxxxx', '..x..', 'xxxxx', 'xx.xx'],
  ['..xx.', '.xx..', 'xxxxx', '..xx.', '.xx..'],
  ['.....', '.xx..', 'x..x.', '....x', 'xxxxx'],
  ['..x..', '.xxx.', 'xxxxx', '.xxx.', '..x..'],
] as const

type X = {
  buf: Canvas
  sky: Canvas
  moon: Canvas
  sea: Canvas
  summit: Canvas
  near: Canvas
  posts: Canvas
  spires: { x: number; y: number; h: number; w: number; at: number; lean: number }[]
  flakes: { x: number; y: number; v: number; s: number }[]
  shards: Shard[]
}

/** The camera tilting up after him as he goes over the top, and back down onto his landing. */
const follow = (t: number) => Math.round(22 * Math.sin(Math.PI * span(t, T_LEAP - 0.08, T_LAND)))

/** Where he is in the air: the moonsault from the spire to his place in the ring (0..1 over the leap). */
function flight(s: ChampionState<X>, q: number) {
  const F = s.L.foe
  const x = lerp(PROF_X, F.x, ease.ioS(q))
  const y = lerp(PEAK, F.y + 2, ease.inQ(q)) - Math.sin(q * Math.PI) * 40
  return { x, y, sc: lerp(FAR_SC, 1, q ** 2.5) }
}

export const kukuiChampion = championCinema<X>({
  id: 'kukui',
  reveal: REVEAL,
  seed: 7451,
  aura: ['#ffffff', '#fff0a0', '#ffa82a', '#7a2a1a'],
  flash: '#fff6d8',
  sample: {
    trainer: '/trainers/classes/alola/champion-kukui.png',
    name: 'Professor Kukui',
    lead: 10104,
    ace: 745,
    team: 3,
  },
  extras: [745],
  setup(st, r) {
    const F = st.L.foe
    const near = cloudBank(rng(7452))
    const posts = canvas(W, H)
    POSTS.forEach(([x, foot, h], i) => totem(posts.g, x, foot, h, i))
    // Splintered Stormshards: spires round him in a ring, rising one after another going round.
    const spires = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 - Math.PI / 2
      // The far ones tall over his shoulders, the near ones low enough to leave him seen.
      const near = Math.sin(a)
      return {
        x: Math.round(F.x + Math.cos(a) * r.range(40, 50)),
        y: Math.round(F.y + 2 + near * 13),
        h: Math.round(r.range(34, 50) * (near > 0.3 ? 0.55 : 1)),
        w: Math.round(r.range(6, 10) * (near > 0.3 ? 0.8 : 1)),
        at: T_SHARDS + (i / 14) * 0.28,
        lean: r.range(-0.15, 0.15) + Math.cos(a) * 0.3,
      }
    })
    // The Z-Power glows at every strength they light at, made now rather than on the landing's frames.
    for (let i = 1; i <= 8; i++) {
      glow(34, '#ffa82a', 1.9, q8((0.6 * i) / 8))
      glow(12, ZP[2], 1.5, q8(i / 8))
    }
    st.screenShakes.push([T_WOLF + 0.25, 0.2, 1], [T_LAND, 0.5, 4], [T_SHARDS, 0.4, 1], [T_BREAK, 0.35, 3])
    return {
      buf: canvas(W, H),
      sky: skyLayer(),
      moon: moonDisc(),
      sea: seaLayer(rng(7453)),
      summit: summitLayer(rng(7454)),
      near,
      posts,
      spires,
      flakes: Array.from({ length: 50 }, () => ({
        x: r.range(0, W),
        y: r.range(0, H),
        v: r.range(6, 14),
        s: r() < 0.2 ? 2 : 1,
      })),
      shards: [],
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    // No floor: the rock falls out of the frame before the scene gives way to the battle's ground.
    stepShards(s.shards, dt, { g: 300 })
    for (const f of s.flakes) {
      f.y += f.v * dt
      f.x += (Math.sin(f.y * 0.05 + f.v) * 6 - 4) * dt
      if (f.y > H) {
        f.y -= H + 4
        f.x = r.range(0, W + 20)
      }
    }
    // The landing: snow thrown up all round, a skirt of it low along the floor.
    if (within(t, T_LAND, T_LAND + dt))
      for (let i = 0; i < 60; i++) {
        const sd = r() < 0.5 ? -1 : 1
        s.fx.add({
          x: F.x + r.range(-10, 10),
          y: F.y + r.range(-2, 4),
          vx: sd * r.range(30, 150),
          vy: -r.range(10, 90),
          ay: 160,
          drag: 1.5,
          life: r.range(0.5, 1),
          size: r.int(1, 3),
          shape: r() < 0.5 ? 'sq' : 'smoke',
          colors: [SNOW[0], SNOW[1], SNOW[2]],
        })
      }
    // Z-Power streaming up round him.
    if (t > T_ZRING && t < REVEAL + 0.3 && r() < 0.9)
      s.fx.add({
        x: F.x + r.range(-22, 22),
        y: F.y + r.range(-4, 4),
        vy: -r.range(40, 90),
        life: r.range(0.4, 0.8),
        size: r.int(1, 2),
        shape: r() < 0.3 ? 'star' : 'sq',
        colors: [ZP[0], ZP[2], ZP[3], ZP[4]],
      })
    // The spires bursting up throw grit; breaking, they fly apart.
    for (const sp of s.spires)
      if (within(t, sp.at, sp.at + dt))
        for (let i = 0; i < 6; i++)
          s.fx.add({
            x: sp.x + r.range(-4, 4),
            y: sp.y,
            vx: r.range(-30, 30),
            vy: -r.range(20, 70),
            ay: 200,
            life: 0.5,
            size: 1,
            shape: 'sq',
            colors: [ROCK[0], ROCK[1], ROCK[2]],
          })
    if (within(t, T_BREAK, T_BREAK + dt))
      for (const sp of s.spires)
        for (let i = 0; i < 4; i++)
          s.shards.push(makeShard(r, sp.x, sp.y - r.range(2, sp.h), 190, ROCK[1], '#ffb070', 0.7))
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F = s.L.foe
    // While the camera rises, everything sits higher in the frame, the nearer the more: `up(p)` for a layer at depth p.
    const c = camAt(t)
    const fo = follow(t)
    const up = (p: number) => -Math.round(RISE * p * (1 - c)) + Math.round(fo * p)
    b.drawImage(s.sky, 0, up(0.15) - SKY_M)
    // The moon brightening as Lycanroc howls at it.
    const howl = pulse(t, T_HOWL, T_HOWL + 0.8)
    b.drawImage(
      glow(MOON.r + 14, '#d89ab8', 1.2, q8(0.5 + 0.4 * howl)),
      MOON.x - MOON.r - 14,
      MOON.y - MOON.r - 14 + up(0.15),
    )
    b.drawImage(s.moon, MOON.x - MOON.r, MOON.y - MOON.r + up(0.15))
    // The howl: rings going out from Lycanroc's head.
    for (let i = 0; i < 3; i++)
      burstRing(
        b,
        WOLF_X + 12,
        PEAK - 26 + up(1),
        span(t, T_HOWL + i * 0.16, T_HOWL + 0.7 + i * 0.16),
        80,
        1,
        '#fff6e0',
      )
    b.drawImage(s.sea, 0, up(0.5))
    // The sun's path glittering: a few glints winking on and off along it.
    const fz = Math.floor(t * 7)
    for (let i = 0; i < 9; i++) {
      const y = HZ + 1 + ((i * 13 + fz * 7) % 12)
      const x = SUN_X + ((i * 37 + fz * 11) % 23) - 11
      rect(b, x, y + up(0.5), 2, 1, '#ffffff')
    }
    b.drawImage(s.summit, 0, up(1))
    drawWolf(b, t, up(1))
    // The totems and their crests lighting in turn.
    b.drawImage(s.posts, 0, up(1))
    POSTS.forEach(([x, foot, h], i) => {
      const at = T_CREST + i * 0.15
      const on = span(t, at, at + 0.12)
      if (on <= 0) return
      const sc = h / 36
      const cr = Math.round(6 * sc)
      const cx = x
      const cy = foot - h - cr + 2 + up(1)
      const C = CRESTS[i]!
      const flare =
        pulse(t, at, at + 0.4) + 0.6 * pulse(t, T_LAND, T_LAND + 0.5) + 0.4 * span(t, T_ZRING, REVEAL)
      b.drawImage(glow(cr + 12, C[2], 1.3, q8(0.55 + 0.3 * flare)), cx - cr - 12, cy - cr - 12)
      ellipse(b, cx, cy, cr, cr, C[1])
      ellipse(b, cx - 1, cy - 1, Math.max(1, cr - 2), Math.max(1, cr - 2), C[0])
      const m = MARKS[i]!
      const ps = Math.max(1, Math.round(sc))
      for (let yy = 0; yy < 5; yy++)
        for (let xx = 0; xx < 5; xx++)
          if (m[yy]![xx] === 'x')
            rect(b, cx - Math.round(2.5 * ps) + xx * ps, cy - Math.round(2.5 * ps) + yy * ps, ps, ps, C[2])
      // A shaft of its light going up as it wakes.
      const sh = pulse(t, at, at + 0.35)
      if (sh > 0) {
        b.fillStyle = pattern(b, C[0], Math.round(sh * 10))
        b.fillRect(cx - Math.round(cr * 0.6), 0, Math.round(cr * 1.2) + 1, cy - cr)
      }
    })
    drawRopes(b, t, up(1))
    // Lycanroc's Stormshards, the ones behind him.
    drawSpires(b, s, t, false)
    // The quake's ring running out over the floor.
    const qk = span(t, T_LAND, T_LAND + 0.45)
    if (qk > 0 && qk < 1) {
      const rx = Math.round(lerp(10, 130, ease.outC(qk)))
      const ry = Math.round(rx * 0.24)
      ellipseLine(b, F.x, F.y + 1, rx, ry, qk < 0.5 ? '#ffffff' : SNOW[1])
      ellipseLine(b, F.x, F.y + 2, rx - 2, Math.max(1, ry - 1), SNOW[2])
    }
    // Z-Power: the dusk dims round the ring; its rings climb round him.
    const zdim = span(t, T_ZRING, T_ZRING + 0.3) * (1 - span(t, T_BREAK, T_BREAK + 0.4)) * 0.35
    if (zdim > 0) wash(b, '#1a0a1a', zdim)
    if (t > T_ZRING - 0.05) {
      b.drawImage(glow(34, '#ffa82a', 1.9, q8(0.6 * span(t, T_ZRING, T_ZRING + 0.3))), F.x - 34, F.y - 72)
      zRings(b, F.x, F.y + 2, t, false)
    }
    // Snow drifting down over the summit.
    for (const f of s.flakes) rect(b, Math.round(f.x), Math.round(f.y), f.s, f.s, f.s > 1 ? SNOW[0] : SNOW[1])
    // The near cloud the camera rises out of, dropping away.
    if (c < 1) b.drawImage(s.near, 0, Math.round(lerp(26, H + 20, ease.inQ(c))))
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, NIGHT)
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    const F = s.L.foe
    const sh = screenShake(t, s.screenShakes)
    const dy = -Math.round(RISE * (1 - camAt(t)))
    if (t < T_LEAP) {
      // On the spire against the moon: black, rimmed with moonlight; crouching for the jump.
      const cr = span(t, T_CROUCH, T_LEAP)
      const sq = Math.sin(cr * Math.PI * 0.5) * 0.18
      figure(
        g,
        s.p.trainer,
        PROF_X + sh.x,
        PEAK + dy + sh.y,
        1,
        FAR_SC * (1 + sq * 0.4),
        FAR_SC * (1 - sq),
        '#fff2d8',
      )
      return
    }
    if (t < T_LAND) {
      // The moonsault: a backflip across the sky, a trail of Z-gold behind him, lit more as he comes.
      const q = span(t, T_LEAP, T_LAND)
      const fo = follow(t)
      for (const [lag, col, a] of [
        [0.15, ZP[2], 0.25],
        [0.075, ZP[1], 0.5],
      ] as const) {
        const qq = Math.max(0, q - lag)
        const p = flight(s, qq)
        spun(g, s.p.trainer, p.x + sh.x, p.y + fo + sh.y, p.sc, spinAt(qq), col, a)
      }
      const p = flight(s, q)
      spun(g, s.p.trainer, p.x + sh.x, p.y + fo + sh.y, p.sc, spinAt(q), null, 1, 1 - 0.55 * q)
      return
    }
    // Landed: the squash of it; then Z-Power round him, his outline burning gold.
    const land = span(t, T_LAND, T_LAND + 0.18)
    const sq = Math.sin(land * Math.PI) * 0.16
    const z = span(t, T_ZRING, T_ZRING + 0.2)
    const rim = z > 0 ? (Math.floor(t * 16) % 2 ? ZP[2] : ZP[3]) : null
    figure(
      g,
      s.p.trainer,
      F.x + sh.x,
      F.y + 2 + sh.y,
      0.45 - 0.2 * span(t, T_ZRING, REVEAL),
      1 + sq,
      1 - sq,
      rim,
    )
    // His Z-Ring: a crystal of light at his wrist (his hand on the picture's left), turning.
    const zr = span(t, T_ZRING, T_ZRING + 0.15)
    if (zr > 0) {
      const pz = spriteSize(s.p.trainer)
      const zx = F.x - Math.round(pz.w * 0.36) + sh.x
      const zy = F.y + 2 - Math.round(pz.h * 0.52) + sh.y
      const fl = 1 - span(t, T_ZRING + 0.1, T_ZRING + 0.5) * 0.5
      g.drawImage(glow(12, ZP[2], 1.5, q8(fl)), zx - 12, zy - 12)
      const sw = Math.round(Math.abs(Math.cos(t * 9)) * 4) + 1
      tri(g, zx - sw, zy, zx + sw, zy, zx, zy - 6, ZP[1])
      tri(g, zx - sw, zy, zx + sw, zy, zx, zy + 6, ZP[3])
      rect(g, zx, zy - 6, 1, 12, ZP[0])
      const ray = Math.round(4 + pulse(t, T_ZRING, T_ZRING + 0.4) * 10)
      rect(g, zx - ray, zy, ray * 2 + 1, 1, ZP[0])
      rect(g, zx, zy - ray, 1, ray * 2 + 1, ZP[0])
    }
  },
  front(g, s, t, k) {
    if (k <= 0) return
    const F = s.L.foe
    // The rings' front halves, the spires in front of him, the rock flying: shaken with the rest.
    const sh = screenShake(t, s.screenShakes)
    g.save()
    g.translate(sh.x, sh.y)
    if (t > T_ZRING - 0.05 && t < REVEAL) zRings(g, F.x, F.y + 2, t, true)
    drawSpires(g, s, t, true)
    drawShards(g, s.shards, '#1a0e1a')
    g.restore()
    if (within(t, T_LAND, T_LAND + 0.1)) screenFlash(g, '#fff0f0', 0.45)
    if (within(t, T_BREAK, T_BREAK + 0.1)) screenFlash(g, '#fff4d8', 0.4)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.6, { freq: 380, type: 'lowpass', vol: 0.05 }),
        tone(110, 1.2, { type: 'sine', vol: 0.04 })
      ),
    ],
    [0.2, () => hiss(0.9, { freq: 500, slide: 1600, vol: 0.03 })],
    [T_WOLF + 0.25, () => tone(80, 0.15, { type: 'sine', vol: 0.08 })],
    [
      T_HOWL,
      () => (
        tone(392, 0.45, { type: 'sine', vol: 0.06, slide: 400 }),
        tone(784, 0.6, { type: 'sine', vol: 0.05, at: 0.42, slide: -260 }),
        tone(392, 0.9, { type: 'triangle', vol: 0.02, at: 0.1, slide: 380 })
      ),
    ],
    ...[0, 1, 2, 3].map(
      (i) =>
        [
          T_CREST + i * 0.15,
          () => tone([523, 659, 784, 1047][i]!, 0.5, { type: 'triangle', vol: 0.04, slide: 12 }),
        ] as const,
    ),
    [T_ROPES, () => hiss(0.3, { freq: 1500, slide: 3000, vol: 0.04 })],
    [
      T_CROUCH,
      () => {
        for (let i = 0; i < 4; i++) tone(98, 0.05, { type: 'square', vol: 0.04, at: i * 0.045 })
      },
    ],
    [T_LEAP, () => hiss(0.5, { freq: 900, slide: -500, vol: 0.05 })],
    [
      T_LAND,
      () => (
        fxSound('legend.pulse'),
        tone(49, 0.6, { type: 'sine', vol: 0.12 }),
        hiss(0.5, { freq: 300, vol: 0.1 })
      ),
    ],
    [T_LAND + 0.05, () => tone(196, 0.5, { type: 'triangle', vol: 0.03, slide: -40 })],
    [T_ZRING, () => (fxSound('thunder.charge'), tone(262, 0.6, { type: 'square', vol: 0.03, slide: 262 }))],
    [T_ZRING + 0.25, () => tone(392, 0.5, { type: 'square', vol: 0.025, slide: 392 })],
    [T_SHARDS, () => hiss(0.4, { freq: 700, vol: 0.08 })],
    [T_SHARDS + 0.16, () => hiss(0.3, { freq: 600, vol: 0.07 })],
    [T_BREAK, () => (fxSound('legend.shatter'), tone(65, 0.5, { type: 'sine', vol: 0.1 }))],
    [
      REVEAL,
      () => {
        for (const [f, at] of [
          [392, 0],
          [523, 0.06],
          [659, 0.12],
          [784, 0.18],
        ] as const)
          tone(f, 0.6, { type: 'square', vol: 0.03, at })
      },
    ],
  ],
})

/** Lycanroc: bounding up onto the spire beside him, howling at the moon, standing guard after. */
function drawWolf(b: G, t: number, dy: number) {
  if (t < T_WOLF) return
  const q = span(t, T_WOLF, T_WOLF + 0.3)
  // Up from behind the spire in an arc, then a little settle.
  const x = Math.round(lerp(WOLF_X - 34, WOLF_X, ease.outQ(q)))
  const y = Math.round(lerp(PEAK + 30, PEAK, q) - Math.sin(q * Math.PI) * 26) + dy
  const howl = pulse(t, T_HOWL, T_HOWL + 0.7)
  const lit = span(t, T_LAND, T_LAND + 0.4) * 0.4 + span(t, T_ZRING, REVEAL) * 0.2
  const sc = FAR_SC * 1.1
  const f = spriteFrame(LYC)
  if (!f) return
  // It faces the court (flipped), black against the moon with a rim of its light, rearing as it howls.
  drawSprite(b, LYC, x, y, {
    sx: sc,
    sy: sc * (1 + howl * 0.12),
    flip: true,
    sil: lit > 0.2 ? undefined : '#1a1028',
    outline: '#fff2d8',
    tint: lit > 0.2 ? { color: '#1a1028', a: q8(1 - lit) } : null,
  })
}

/** The ropes: three a side, drawn out post to post as the crests light, thrumming when he lands. */
function drawRopes(b: G, t: number, dy: number) {
  const run = span(t, T_ROPES, T_ROPES + 0.24)
  if (run <= 0) return
  const thrum = Math.max(0, 1 - span(t, T_LAND, T_LAND + 0.7))
  const glowK = 0.5 + 0.5 * pulse(t, T_LAND, T_LAND + 0.4) + 0.3 * span(t, T_ZRING, REVEAL)
  for (let side = 0; side < 4; side++) {
    const a = POSTS[side]!
    const e = POSTS[(side + 1) % 4]!
    const q = clamp(run * 4 - side)
    if (q <= 0) continue
    const sa = a[2] / 36
    const se = e[2] / 36
    for (let k = 0; k < ROPES.length; k++) {
      const y0 = a[1] - ROPES[k]! * sa + dy
      const y1 = e[1] - ROPES[k]! * se + dy
      const n = Math.max(8, Math.round(Math.hypot(e[0] - a[0], y1 - y0) / 2))
      let px: number = a[0]
      let py = Math.round(y0)
      for (let i = 1; i <= Math.round(n * q); i++) {
        const u = i / n
        const wob = Math.sin(u * Math.PI) * Math.sin(t * 48 + k) * 4 * thrum
        const x = Math.round(lerp(a[0], e[0], u))
        const y = Math.round(lerp(y0, y1, u) + wob)
        line(b, px, py, x, y, k === 2 ? ZP[1] : ZP[2], glowK > 0.9 ? 2 : 1)
        px = x
        py = y
      }
      // The light's head running along it.
      if (q < 1) b.drawImage(glow(4, ZP[0], 1.4, 1), px - 4, py - 4)
    }
  }
}

/** Splintered Stormshards: jagged spires bursting up out of the floor round him, then breaking apart. */
function drawSpires(g: G, s: ChampionState<X>, t: number, front: boolean) {
  if (t < T_SHARDS || t >= T_BREAK) return
  const F = s.L.foe
  for (const sp of s.spires) {
    if (sp.y > F.y + 2 !== front) continue
    const q = ease.outBack(span(t, sp.at, sp.at + 0.12), 2)
    if (q <= 0) continue
    const h = Math.round(sp.h * q)
    const tipX = sp.x + Math.round(sp.lean * h)
    const tipY = sp.y - h
    // A jagged blade of stone: the face toward him lit orange by the Z-Power, the far face dark, a mid facet
    // between, a notch knocked out of its shoulder, a bright ridge up its front.
    const toward = sp.x < F.x ? 1 : -1
    const L = [sp.x - sp.w, sp.y] as const
    const Rt = [sp.x + sp.w, sp.y] as const
    const M = [sp.x + toward * Math.round(sp.w * 0.25), sp.y + 1] as const
    const lit = toward > 0 ? Rt : L
    const dark = toward > 0 ? L : Rt
    tri(g, dark[0], dark[1], M[0], M[1], tipX, tipY, STONE[3])
    tri(g, M[0], M[1], lit[0], lit[1], tipX, tipY, STONE[1])
    const sx = Math.round(lerp(M[0], tipX, 0.35))
    const sy = Math.round(lerp(M[1], tipY, 0.35))
    tri(g, M[0], M[1], sx + toward * 2, sy, tipX, tipY, STONE[2])
    tri(
      g,
      lit[0],
      lit[1],
      lerp(lit[0], tipX, 0.5) + toward * 3,
      lerp(lit[1], tipY, 0.5),
      lerp(lit[0], tipX, 0.62),
      lerp(lit[1], tipY, 0.62),
      STONE[0],
    )
    const nx = lerp(dark[0], tipX, 0.55)
    const ny = lerp(dark[1], tipY, 0.55)
    tri(g, nx - toward * 2, ny + 2, nx + toward * 2, ny - 1, nx - toward, ny - 4, STONE[4])
    line(g, M[0], M[1], tipX, tipY, '#ffe0b8')
    rect(g, tipX - 1, tipY, 2, 1, '#fff6d8')
    rect(g, sp.x - sp.w - 1, sp.y, sp.w * 2 + 3, 1, STONE[4])
  }
}

/** Rings of Z-Power climbing round him: flat ellipses rising from his feet over his head, widening; back or front half. */
function zRings(g: G, x: number, foot: number, t: number, front: boolean) {
  for (let i = 0; i < 4; i++) {
    const at = T_ZRING + 0.08 + i * 0.16
    const q = span(t, at, at + 0.5)
    if (q <= 0 || q >= 1) continue
    const y = Math.round(foot - ease.outQ(q) * 86)
    const rx = Math.round(lerp(12, 34, q))
    const ry = Math.max(2, Math.round(rx * 0.3))
    const col = q < 0.4 ? ZP[1] : q < 0.75 ? ZP[2] : ZP[3]
    ellipseLine(g, x, y, rx, ry, col, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
    if (q < 0.7) ellipseLine(g, x, y + 1, rx, ry, ZP[3], front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
  }
}

/** How far round the backflip is (radians): a full turn over the leap, eased so he hangs at the top. */
const spinAt = (q: number) => -Math.PI * 2 * ease.ioS(span(q, 0.08, 0.86))

let spinTmp: Canvas | null = null
/**
 * The champion's picture turned about its middle, in steps of a sixteenth of a turn (a pixel spin, not a smooth one):
 * a silhouette in `sil` at alpha `a`, or the picture itself darkened by `dark`.
 */
function spun(
  g: G,
  key: string,
  x: number,
  foot: number,
  sc: number,
  ang: number,
  sil: string | null,
  a = 1,
  dark = 0,
) {
  const f = spriteFrame(key)
  if (!f) return
  const w = Math.max(1, Math.round(f.width * sc))
  const h = Math.max(1, Math.round(f.height * sc))
  const st = Math.round(ang / (Math.PI / 8)) * (Math.PI / 8)
  const tmp = (spinTmp ??= canvas(96, 96))
  tmp.g.clearRect(0, 0, 96, 96)
  tmp.g.drawImage(sil ? silhouette(key, sil)! : f, 0, 0, w, h)
  if (!sil && dark > 0) {
    tmp.g.globalAlpha = q8(dark)
    tmp.g.drawImage(silhouette(key, '#1a1028')!, 0, 0, w, h)
    tmp.g.globalAlpha = 1
  }
  const prev = g.globalAlpha
  g.globalAlpha = q8(a)
  g.save()
  g.translate(Math.round(x), Math.round(foot - h / 2))
  g.rotate(st)
  g.drawImage(tmp, 0, 0, w, h, -Math.round(w / 2), -Math.round(h / 2), w, h)
  g.restore()
  g.globalAlpha = prev
}

/** The champion's picture at a scale (sx, sy), darkened toward a silhouette, with an optional rim of light. */
function figure(
  g: G,
  key: string,
  x: number,
  foot: number,
  dark: number,
  sx: number,
  sy: number,
  rim: string | null,
) {
  const f = spriteFrame(key)
  if (!f) return
  const w = Math.max(1, Math.round(f.width * sx))
  const h = Math.max(1, Math.round(f.height * sy))
  const dx = Math.round(x - w / 2)
  const dy = Math.round(foot - h)
  if (rim) {
    const rs = silhouette(key, rim)!
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      g.drawImage(rs, dx + ox, dy + oy, w, h)
  }
  g.drawImage(f, dx, dy, w, h)
  const a = q8(dark)
  if (a > 0) {
    g.globalAlpha = a
    g.drawImage(silhouette(key, '#1a1028')!, dx, dy, w, h)
    g.globalAlpha = 1
  }
}
