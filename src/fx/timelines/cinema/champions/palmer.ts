// Palmer's entrance (docs/56): the Battle Tower at the Fight Area, at dusk. The glass lift waits in the tower's lobby,
// the Tower Tycoon's figure inside it; a ding, and it rockets up the tower's face, the floors' windows smearing into
// streaks, the harbour falling away, up through the clouds into the night, until the art-deco crown rises over a sea of
// clouds and the lift brakes hard into the glass top floor: the crown is floodlit gold, the Tower's emblem blazes, two
// searchlights swing up into the sky. Cut inside: the top floor's hall, dark, the lamps by the lift doors climbing to
// the top; ding. The doors part on a blaze of light and he stands in it, a black shape; he strides out to his mark,
// his shadow thrown at us across the marble. Behind him something huge looms up out of the glare and fills the
// doorway: Rhyperior, stomping out to his left, the hall shaking twice. On his mark he throws his head back and laughs,
// three great laughs booming out across the floor, and the spotlights slam on as the confetti cannons go off.
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
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteKey } from '../../../sprites'
import { H, screenShake, W, within, type Stage } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dGradient, dissolve, pulse } from '../kit'

const REVEAL = 4.6
/** The lift's ding in the lobby, its launch, its stop at the top floor, the cut inside. */
const T_DING = 0.42
const T_LAUNCH = 0.62
const T_DOCK = 2.05
const T_CUT = 2.42
/** Inside: the lamps reach the top, the doors part, he strides out to his mark, Rhyperior's two stomps, the laughs. */
const T_TOP = 2.66
const T_OPEN = 2.8
const T_STEP = 3.02
const T_MARK = 3.48
/** Rhyperior looming up out of the glare behind him, its two steps out. */
const T_RH = 3.28
const STOMPS = [3.66, 3.98] as const
const LAUGHS = [4.08, 4.24, 4.4] as const

const RHYPERIOR = 464
const RH = spriteKey(RHYPERIOR, false)

/** The lift's shaft on the screen: the doors inside stand on the same x, so the eye stays on it across the cut. */
const CX = 173
/** The tower: its width, the ground's row before the climb, and its heights (px above the ground). */
const TWD = 128
const TX0 = CX - TWD / 2
const GY = 142
const LOBBY = 34
const FLOOR = 18
const NF = 50
const SET = LOBBY + NF * FLOOR
/** Three setbacks of two floors, each narrower; the glass top floor; the crown; the spire's tip. */
const SETBACKS: readonly number[] = [112, 96, 80]
/** The top floor's width: the last setback's. */
const RW = 80
const TOPF = SET + SETBACKS.length * 2 * FLOOR
const ROOM = 30
const CROWN = TOPF + ROOM
const TIP = CROWN + 78
const TH = TIP + 6
/** Where the camera ends: the docked lift low in the frame, the spire's tip at its top. */
const CAM_END = TOPF - 30
/** The cloud deck it climbs through. */
const CLOUD0 = 430
const CLOUD1 = 700

/** The hall: the back wall's foot, the lift's doorway. */
const WALL = 92
const DX0 = 143
const DX1 = 203
const DY0 = 16

const GOLD = ['#fff4d0', '#ffe08a', '#e8b84a', '#b08a3a', '#6a4a1a'] as const

type Pt = { x: number; y: number }
type X = {
  buf: Canvas
  sky: Canvas
  world: Canvas
  plaza: Canvas
  tower: Canvas
  smear: Canvas
  room: Canvas
  crown: Canvas
  clouds: Canvas[]
  deck: Canvas
  hall: Canvas
  doors: Canvas
  lit: Canvas
  stars: [number, number, number][]
  wisps: [number, number, number, number][]
  far: [number, number, number][]
  amb: Particles
  dust: Particles
  confetti: Particles
}
type S = ChampionState<X>

/** A canvas row for a height on the tower. */
const row = (a: number) => TH - a
/** A rectangle on the tower by height: its foot at `a`, `h` tall. */
const R = (g: G, x: number, a: number, w: number, h: number, c: string) => rect(g, x, row(a + h), w, h, c)

/** How high the lift is (px above the ground): waiting, then a launch that tears up the tower and brakes at the top. */
function capAt(t: number) {
  if (t < T_LAUNCH) return 0
  if (t < T_DOCK) {
    // Hard off the mark, flat out, then braking only at the very end: a trapezoid of speed.
    const u = span(t, T_LAUNCH, T_DOCK)
    const ta = 0.25
    const td = 0.12
    const v = 1 / (1 - ta / 2 - td / 2)
    const f =
      u < ta ? (v * u * u) / (2 * ta) : u < 1 - td ? v * (ta / 2 + u - ta) : 1 - (v * (1 - u) ** 2) / (2 * td)
    return TOPF * f
  }
  // It sways on its cables as it stops.
  const e = t - T_DOCK
  return TOPF + 3 * Math.sin(e * 22) * Math.exp(-e * 8)
}
/** The camera's height: still in the lobby, then riding a little behind the lift, then settling past it at the top. */
function camAt(t: number) {
  const c = capAt(t)
  const lead = lerp(58, 30, span(c, TOPF - 300, TOPF))
  const e = Math.max(0, t - T_DOCK)
  return Math.max(0, c - lead) + (e > 0 ? 7 * Math.sin(e * 15) * Math.exp(-e * 6) : 0)
}
/** How fast it climbs (px/s): the windows smear and the lift's light trails by it. */
const speedAt = (t: number) => (capAt(t + 0.01) - capAt(t - 0.01)) / 0.02

/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** The world's rows for a height, on the screen. */
const sy = (a: number, cam: number) => GY - a + cam

export const palmerChampion = championCinema<X>({
  id: 'palmer',
  reveal: REVEAL,
  seed: 4640,
  aura: ['#ffffff', '#ffe08a', '#58b848', '#1e4a1e'],
  flash: '#fff4d0',
  sample: { trainer: '/trainers/classes/sinnoh/palmer.png', name: 'Palmer', lead: 445, ace: 464, team: 3 },
  extras: [RHYPERIOR],
  setup(st: Stage, r: Rng) {
    st.screenShakes.push(
      [T_LAUNCH, 0.35, 2],
      [T_DOCK, 0.4, 3],
      [STOMPS[0], 0.35, 3],
      [STOMPS[1], 0.45, 4],
      [REVEAL, 0.4, 2],
    )
    const tw = tower(rng(4641))
    return {
      buf: canvas(W, H),
      sky: dGradient(
        W,
        420,
        ['#04040e', '#070a1c', '#0c1230', '#141a40', '#22204a', '#3a2654', '#6a3456', '#b0544a', '#e08a4a'],
        6,
      ),
      world: world(rng(4642)),
      plaza: plaza(),
      tower: tw.cv,
      smear: tw.smear,
      room: tw.room,
      crown: tw.crown,
      clouds: [0, 1, 2, 3, 4, 5].map((i) => cloud(rng(4650 + i), 26 + (i % 3) * 10, 8 + (i % 2) * 4)),
      deck: deck(rng(4660)),
      hall: hall(rng(4643)),
      doors: doors(),
      lit: canvas(W, H),
      stars: Array.from(
        { length: 46 },
        () => [r.int(0, W - 1), r.int(0, 300), r()] as [number, number, number],
      ),
      wisps: Array.from(
        { length: 9 },
        (_, i) =>
          [r.int(-30, W - 10), CLOUD0 + 40 + i * 28, r.int(0, 5), r.range(1.15, 1.45)] as [
            number,
            number,
            number,
            number,
          ],
      ),
      far: Array.from(
        { length: 8 },
        (_, i) => [r.int(-20, 90), CLOUD0 - 60 + i * 44, r.int(0, 5)] as [number, number, number],
      ),
      amb: new Particles(),
      dust: new Particles(),
      confetti: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    s.amb.update(dt)
    s.dust.update(dt)
    s.confetti.update(dt)
    // The cut inside leaves the wind behind.
    if (within(t, T_CUT, T_CUT + dt)) s.amb.clear()
    // The top: the floodlights' sparks off the crown as the lift docks.
    if (within(t, T_DOCK, T_DOCK + dt))
      for (let i = 0; i < 30; i++) {
        const a = r.range(-Math.PI, 0)
        const sp = r.range(30, 110)
        s.amb.add({
          x: CX + r.range(-30, 30),
          y: sy(CROWN, camAt(t)),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          ay: 90,
          drag: 1.5,
          life: r.range(0.5, 0.9),
          size: 1,
          shape: r() < 0.5 ? 'star' : 'px',
          colors: [...GOLD],
        })
      }
    // Inside: dust turning in the lift's light once the doors part.
    const op = span(t, T_OPEN, T_OPEN + 0.3)
    if (t > T_CUT && op > 0 && t < REVEAL + 1.4 && r() < 0.5)
      s.dust.add({
        x: r.range(DX0 - 10, DX1 + 10),
        y: r.range(DY0 + 10, H - 10),
        vx: r.range(-4, 4),
        vy: r.range(-6, 2),
        life: r.range(1, 2),
        size: 1,
        shape: 'px',
        colors: ['#fff4d0', '#e8c070', '#8a6a3a'],
      })
    // Rhyperior's feet: dust thrown out low along the floor.
    STOMPS.forEach((at, i) => {
      if (!within(t, at, at + dt)) return
      const p = rhAt(at + 0.001)
      if (!p) return
      for (let k = 0; k < 26; k++) {
        const sd = r() < 0.5 ? -1 : 1
        s.dust.add({
          x: p.x + sd * r.range(4, 22),
          y: p.y - r.range(0, 3),
          vx: sd * r.range(40, 120 + i * 40),
          vy: -r.range(4, 30),
          drag: 3,
          life: r.range(0.4, 0.8),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          colors: ['#4a3e3a', '#2e2624'],
          light: '#6a5a50',
        })
      }
      for (let k = 0; k < 8; k++)
        s.dust.add({
          x: p.x + r.range(-20, 20),
          y: p.y - 2,
          vx: r.range(-40, 40),
          vy: -r.range(40, 100),
          ay: 300,
          life: 0.6,
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#8a7a6a', '#4a3e3a'],
        })
    })
    // The confetti cannons at the reveal, both sides of the hall: gold, silver and his coat's green, fluttering down.
    if (within(t, REVEAL, REVEAL + dt))
      for (const [x, dir] of [
        [4, 1],
        [W - 4, -1],
      ] as const)
        for (let k = 0; k < 46; k++) {
          const c = r.pick(CONFETTI)
          s.confetti.add({
            x,
            y: H - 30 - r.range(0, 10),
            vx: dir * r.range(40, 150),
            vy: -r.range(120, 230),
            ay: 120,
            drag: 2.2,
            life: r.range(1.4, 2.2),
            size: r.int(1, 2),
            shape: 'sq',
            colors: c,
          })
        }
    if (t > REVEAL && t < REVEAL + 1.2 && r() < 0.5) {
      const c = r.pick(CONFETTI)
      s.confetti.add({
        x: r.range(0, W),
        y: -4,
        vx: r.range(-10, 10),
        vy: r.range(20, 40),
        life: 2,
        size: 1,
        shape: 'sq',
        colors: c,
      })
    }
    // The reveal's burst of gold off him.
    if (within(t, REVEAL, REVEAL + dt))
      for (let k = 0; k < 20; k++) {
        const a = r() * Math.PI * 2
        s.amb.add({
          x: F.x,
          y: F.y - 40,
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 60,
          drag: 3,
          life: 0.6,
          size: 2,
          shape: 'star',
          colors: [...GOLD],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    if (t < T_CUT) outside(b, s, t)
    else inside(b, s, t)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#05060c')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_CUT) return
    const sh = screenShake(t, s.screenShakes)
    const F = s.L.foe
    const p = palmerAt(t, F)
    if (!p) return
    // Backlit: black against the lift's blaze, a rim of its light round him once he is out in the dark hall. Then the
    // laughs: thrown back, bouncing.
    const lq = laughAt(t)
    const out = span(t, T_STEP + 0.15, T_STEP + 0.4)
    // Still in the car, only what the parting doors show of him.
    const half = Math.round(30 * ease.ioQ(span(t, T_OPEN, T_OPEN + 0.32)))
    const clip = t < T_STEP + 0.1
    if (clip) {
      g.save()
      g.beginPath()
      g.rect(CX - half + sh.x, 0, half * 2, H)
      g.clip()
    }
    drawSprite(g, s.p.trainer, p.x + sh.x, p.y + sh.y - Math.round(lq * 3), {
      sil: '#07060a',
      outline: out > 0 ? (lq > 0.5 ? '#fff4d0' : '#e8b84a') : undefined,
      sx: p.k * (1 + 0.03 * lq),
      sy: p.k * (1 - 0.045 * lq),
    })
    if (clip) g.restore()
    // Each laugh booms out of him: strokes flung out round his head, a ring.
    LAUGHS.forEach((at, i) => {
      const q = span(t, at, at + 0.22)
      if (q <= 0 || q >= 1) return
      const hx = F.x + sh.x - 2
      const hy = F.y - 70 + sh.y
      for (const [dx, dy] of [
        [-1, -0.6],
        [-1, 0.1],
        [-0.8, -1],
        [1, -0.6],
        [1, 0.1],
        [0.8, -1],
      ] as const) {
        const d0 = 18 + 12 * q
        const d1 = d0 + 11 - 6 * q
        // Ink-edged, so they read on the doorway's glare and on the dark wall alike.
        line(g, hx + dx * d0, hy + dy * d0, hx + dx * d1, hy + dy * d1, '#2a1a0a', 3)
        line(g, hx + dx * d0, hy + dy * d0, hx + dx * d1, hy + dy * d1, i === 2 ? '#ffffff' : GOLD[1], 2)
      }
      burstRing(g, hx, hy, q, 40 + i * 12, 1, GOLD[2])
    })
  },
  front(g, s) {
    // The confetti keeps falling a moment over the battle's own ground.
    s.confetti.draw(g)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.2, { freq: 300, type: 'lowpass', vol: 0.04 }),
        tone(62, 0.9, { type: 'sine', vol: 0.04 })
      ),
    ],
    [
      T_DING,
      () => (
        tone(1319, 0.5, { type: 'triangle', vol: 0.05 }),
        tone(1047, 0.7, { type: 'triangle', vol: 0.04, at: 0.12 })
      ),
    ],
    [
      T_LAUNCH,
      () => (
        tone(90, 1.5, { type: 'sawtooth', vol: 0.035, slide: 520 }),
        hiss(1.45, { freq: 400, slide: 3200, vol: 0.06 }),
        tone(50, 0.4, { type: 'sine', vol: 0.12, slide: -10 })
      ),
    ],
    // The floors ticking past, faster and higher.
    ...[0.78, 0.98, 1.14, 1.27, 1.38, 1.47, 1.55, 1.62, 1.68, 1.74, 1.8, 1.86, 1.92].map(
      (at, i) => [at, () => tone(880 + i * 70, 0.03, { type: 'square', vol: 0.02 })] as const,
    ),
    [T_DOCK - 0.08, () => hiss(0.3, { freq: 2600, slide: -2200, vol: 0.06 })],
    [
      T_DOCK,
      () => (
        tone(70, 0.4, { type: 'square', vol: 0.06, slide: -30 }),
        hiss(0.5, { freq: 220, type: 'lowpass', vol: 0.1 }),
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, 0.35, { type: 'triangle', vol: 0.03, at: 0.06 + i * 0.06 }),
        )
      ),
    ],
    [T_CUT, () => (tone(55, 1.2, { type: 'sine', vol: 0.06 }), hiss(0.25, { freq: 900, vol: 0.03 }))],
    ...[2.46, 2.52, 2.57, 2.61].map(
      (at, i) => [at, () => tone(1175 + i * 120, 0.03, { type: 'square', vol: 0.02 })] as const,
    ),
    [
      T_TOP,
      () => (
        tone(1568, 0.6, { type: 'triangle', vol: 0.06 }),
        tone(1319, 0.8, { type: 'triangle', vol: 0.05, at: 0.14 })
      ),
    ],
    [
      T_OPEN,
      () => (
        hiss(0.4, { freq: 600, type: 'lowpass', vol: 0.06 }),
        [392, 494, 587, 784].forEach((f) => tone(f, 0.9, { type: 'triangle', vol: 0.022, attack: 0.15 }))
      ),
    ],
    ...[3.2, 3.4, 3.58].map(
      (at) => [at, () => tone(80, 0.1, { type: 'sine', vol: 0.08, slide: -20 })] as const,
    ),
    ...STOMPS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(42, 0.6, { type: 'sine', vol: 0.15 + i * 0.03, slide: -12 }),
            hiss(0.5, { freq: 180, type: 'lowpass', vol: 0.1 })
          ),
        ] as const,
    ),
    // His laugh: three big brassy "ha"s, falling.
    ...LAUGHS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(196 - i * 22, 0.14, { type: 'sawtooth', vol: 0.05, slide: -40 }),
            tone(98 - i * 11, 0.16, { type: 'square', vol: 0.04, slide: -20 })
          ),
        ] as const,
    ),
    [
      REVEAL,
      () => (
        hiss(0.08, { freq: 3000, vol: 0.06 }),
        hiss(0.5, { freq: 1800, q: 0.5, vol: 0.05, at: 0.05 }),
        fxSound('legend.roar'),
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          tone(f, i === 4 ? 0.6 : 0.14, { type: 'square', vol: 0.035, at: 0.05 + i * 0.08 }),
        )
      ),
    ],
  ],
})

const CONFETTI = [
  ['#ffe08a', '#b08a3a', '#ffe08a', '#b08a3a', '#ffe08a', '#b08a3a'],
  ['#ffffff', '#8a9ab8', '#ffffff', '#8a9ab8', '#ffffff', '#8a9ab8'],
  ['#7ad858', '#2e7a2e', '#7ad858', '#2e7a2e', '#7ad858', '#2e7a2e'],
  ['#ff6a5a', '#9a2a2a', '#ff6a5a', '#9a2a2a', '#ff6a5a', '#9a2a2a'],
] as const

// ---------------------------------------------------------------------------------------------------------------- outside

/** The climb up the tower's face. */
function outside(b: G, s: S, t: number) {
  const cam = camAt(t)
  const u = clamp(cam / CAM_END)
  // The sky: dusk at the foot, night with its stars at the top.
  b.drawImage(s.sky, 0, Math.round(-(s.sky.height - H) * (1 - u)))
  const night = span(cam, CLOUD1 - 80, CAM_END)
  for (const [x, y, ph] of s.stars) {
    if (y > 30 + 200 * night) continue
    const tw = Math.sin(t * 5 + ph * 30) > 0.6
    rect(b, x, y * 0.5, 1, 1, tw ? '#ffffff' : ph > 0.5 ? '#8a8ab8' : '#4a4a78')
  }
  // The moon, far off: it barely moves.
  const my = 30 + Math.round(cam * 0.02)
  b.drawImage(glow(22, '#2a2a5a', 1.2, 0.8), 42 - 22, my - 22)
  ellipse(b, 42, my, 9, 9, '#e8e4c8')
  ellipse(b, 44, my - 1, 8, 8, '#fffbe8')
  rect(b, 39, my + 2, 2, 2, '#d0ccb0')
  rect(b, 45, my - 4, 2, 1, '#e8e4c8')
  // The Fight Area falling away below.
  const wy = Math.round(78 + cam * 0.55)
  if (wy < H) b.drawImage(s.world, 0, wy)
  // The cloud deck: far clouds behind the tower, the sea of clouds once it is above them.
  for (const [x, a, i] of s.far) {
    const y = Math.round(GY - a + cam * 0.8)
    if (y > -30 && y < H + 10) b.drawImage(s.clouds[i]!, x, y)
  }
  const dk = span(cam, CLOUD1 - 40, CAM_END)
  if (dk > 0) {
    const y = Math.round(lerp(H, 96, ease.outQ(dk)))
    b.drawImage(s.deck, -Math.round((cam * 0.05) % 40), y)
  }
  // The plaza at the tower's foot, with it.
  const py = Math.round(GY - 6 + cam)
  if (py < H) b.drawImage(s.plaza, 0, py)
  // The tower: its windows smear into streaks as the lift tears past them.
  const v = Math.abs(speedAt(t))
  const top = TH - GY - Math.round(cam)
  // Only the rows the canvas has (the spire's tip bobs above it as the camera settles).
  const s0 = Math.max(0, top)
  const hs = Math.min(TH, top + H) - s0
  b.drawImage(s.tower, 0, s0, TWD, hs, TX0, s0 - top, TWD, hs)
  const sm = clamp((v - 250) / 600)
  if (sm > 0) {
    const tmp = s.lit
    tmp.g.clearRect(0, 0, W, H)
    tmp.g.drawImage(s.smear, 0, s0, TWD, hs, TX0, s0 - top, TWD, hs)
    dissolve(b, tmp, sm)
  }
  // The floors' lamps by the shaft, each flicking on as the lift passes.
  const cap = capAt(t)
  for (let i = 0; i < NF; i++) {
    const a = LOBBY + i * FLOOR + 9
    const y = sy(a, cam)
    if (y < -2 || y > H) continue
    const on = Math.abs(cap + 14 - a) < 26
    rect(b, CX + 15, y, 2, 2, on ? '#ffe08a' : '#3a2a1a')
    if (on) rect(b, CX + 14, y - 1, 4, 4, pattern(b, '#ffe08a', 6))
  }
  // The crown: floodlights up its faces, the emblem blazing, the beacon, once the lift is in.
  const fl = span(t, T_DOCK, T_DOCK + 0.12)
  if (fl > 0) crownLights(b, s, cam, t, fl)
  // The glass top floor lights up as the lift docks.
  const rm = span(t, T_DOCK - 0.05, T_DOCK + 0.2)
  if (rm > 0) {
    const tmp = s.lit
    tmp.g.clearRect(0, 0, W, H)
    tmp.g.drawImage(s.room, CX - s.room.width / 2, sy(TOPF + ROOM, cam))
    dissolve(b, tmp, rm)
  }
  // The beacon on the spire's tip: red, blinking; gold once it is home.
  const by = sy(TIP, cam)
  if (by > -8) {
    const home = t > T_DOCK
    const on = home || Math.floor(t * 2.5) % 2 === 0
    if (on)
      b.drawImage(
        glow(home ? 14 : 6, home ? '#ffe08a' : '#ff3a2a', 1.4, home ? 0.8 : 0.6),
        CX - (home ? 14 : 6),
        by - (home ? 14 : 6),
      )
    rect(b, CX - 1, by - 1, 2, 2, on ? (home ? '#ffffff' : '#ff6a5a') : '#5a1a1a')
  }
  capsule(b, s, t, cam)
  // Wisps of the cloud deck streaming past in front of the tower.
  for (const [x, a, i, par] of s.wisps) {
    const y = Math.round(GY - a + cam * par - (par - 1) * a)
    if (y > -30 && y < H + 10) dissolve(b, s.clouds[i]!, 0.75, x, y)
  }
  s.amb.draw(b)
  // The fog of the cloud as it passes through it.
  const fog = pulse(cam, CLOUD0 + 40, CLOUD1 - 20)
  if (fog > 0) wash(b, '#8a86b0', 0.35 * fog, 8)
}

/** The lift: a brass-capped glass car, lit inside, the Tycoon standing in it; its light on the shaft, a trail below it. */
function capsule(b: G, s: S, t: number, cam: number) {
  const cap = capAt(t)
  const fy = Math.round(sy(cap, cam))
  const x0 = CX - 10
  const y0 = fy - 30
  const v = speedAt(t)
  b.drawImage(glow(26, '#e8b84a', 1.5, 0.5), CX - 26, fy - 41)
  // Its light streaming behind it, longer the faster it goes.
  const tr = Math.round(clamp(v / 1400) * 70)
  for (let k = 0; k < tr; k++) {
    const q = k / tr
    if ((1 - q) * 1.1 > bayer(CX, fy + k)) {
      rect(b, x0 + 2, fy + k, 1, 1, q < 0.3 ? '#ffe08a' : '#b08a3a')
      rect(b, x0 + 17, fy + k, 1, 1, q < 0.3 ? '#ffe08a' : '#b08a3a')
    }
    if ((1 - q) * 0.7 > bayer(CX + 3, fy + k)) rect(b, x0 + 6, fy + k, 8, 1, q < 0.4 ? '#fff4d0' : '#e8b84a')
  }
  // Cables up into the dark.
  rect(b, CX - 3, 0, 1, Math.max(0, y0 - 2), '#2a2a3a')
  rect(b, CX + 2, 0, 1, Math.max(0, y0 - 2), '#2a2a3a')
  // The car.
  rect(b, x0 + 1, y0 + 4, 18, 22, '#ffe8b0')
  rect(b, x0 + 1, y0 + 4, 18, 22, pattern(b, '#fff8e0', 8))
  rect(b, x0 + 1, y0 + 4, 2, 22, '#e8c070')
  rect(b, x0 + 17, y0 + 4, 2, 22, '#c8a050')
  drawSprite(b, s.p.trainer, CX, fy - 4, { sil: '#2a1a0e', sx: 0.29, sy: 0.29 })
  rect(b, x0, y0 + 4, 1, 22, '#8a6a2a')
  rect(b, x0 + 19, y0 + 4, 1, 22, '#5a4018')
  rect(b, x0 + 1, y0 + 16, 18, 1, '#c8a050')
  for (const yy of [y0, y0 + 26]) {
    rect(b, x0 - 1, yy, 22, 4, '#c8a040')
    rect(b, x0 - 1, yy, 22, 1, '#ffe08a')
    rect(b, x0 - 1, yy + 3, 22, 1, '#6a4a1a')
    rect(b, x0 + 9, yy + 1, 2, 2, '#fff4d0')
  }
  rect(b, CX - 4, y0 - 2, 8, 2, '#8a6a2a')
}

/** The crown floodlit gold the moment the lift is home, two searchlights swinging up off it into the night. */
function crownLights(b: G, s: S, cam: number, t: number, k: number) {
  const base = sy(CROWN, cam)
  const top = sy(TH, cam)
  dissolve(b, s.crown, k, TX0, top)
  for (const sd of [-1, 1]) {
    // Each beam swings out and back, crossing the other's.
    const a = -Math.PI / 2 + sd * (0.28 + 0.22 * Math.sin((t - T_DOCK) * 2.2 + (sd > 0 ? 1.2 : 0)))
    const x0 = CX + sd * 20
    const y0 = base - 2
    const len = 190 * ease.outC(span(t, T_DOCK, T_DOCK + 0.25))
    // A widening shaft of dithered light, thinning out with distance, a brighter core near its lamp.
    for (let i = 0; i < len; i++) {
      const x = x0 + Math.cos(a) * i
      const y = y0 + Math.sin(a) * i
      const q = i / 190
      const hw = Math.round(1 + q * 7)
      rect(b, x - hw, y, hw * 2 + 1, 1, pattern(b, '#a8a4c8', 7 * (1 - q)))
      if (q < 0.5) rect(b, x, y, 1, 1, pattern(b, '#fff4d0', 16 * (1 - q * 2)))
    }
  }
  const ey = base - 22
  b.drawImage(glow(16, '#ffe08a', 1.4, q8(0.75 * k)), CX - 16, ey - 16)
  emblem(b, CX, ey, true)
  if (t < T_DOCK + 0.5) burstRing(b, CX, ey, span(t, T_DOCK, T_DOCK + 0.5), 44, 2, '#ffe08a')
}

/** The Battle Tower's medallion: a ring and a stepped tower in it. */
function emblem(g: G, x: number, y: number, lit: boolean) {
  const rim = lit ? '#ffe08a' : '#6a5020'
  const fill = lit ? '#fff4d0' : '#3a2e18'
  ellipse(g, x, y, 7, 7, rim)
  ellipse(g, x, y, 5, 5, lit ? '#b08a3a' : '#1e1a14')
  rect(g, x - 1, y - 4, 3, 9, fill)
  rect(g, x - 2, y - 1, 5, 6, fill)
  rect(g, x - 3, y + 2, 7, 3, fill)
  rect(g, x, y - 5, 1, 1, fill)
}

/** The tower's face, built once: floors of windows either side of the glass shaft, the setbacks, the crown, the spire. */
function tower(r: Rng): { cv: Canvas; smear: Canvas; room: Canvas; crown: Canvas } {
  const cv = canvas(TWD, TH)
  const sm = canvas(TWD, TH)
  const g = cv.g
  const m = sm.g
  const C = TWD / 2
  // The wall: lit along its left edge by the last of the dusk and the moon, falling into shade on its right.
  const wall = (x0: number, w: number, a0: number, h: number) => {
    for (let x = 0; x < w; x++) {
      const e = x / (w - 1)
      // Most columns are one colour top to bottom; only the dithered ones go pixel by pixel.
      if (e < 0.06 || (e >= 0.12 && e <= 0.8)) {
        R(g, x0 + x, a0, 1, h, e < 0.06 ? '#4a5678' : '#222a40')
        continue
      }
      for (let a = a0; a < a0 + h; a++) {
        const y = row(a)
        const c =
          e < 0.12
            ? bayer(x, y) < 0.5
              ? '#4a5678'
              : '#2c3450'
            : bayer(x, y) < (e - 0.8) * 4
              ? '#121624'
              : '#1e2438'
        rect(g, x0 + x, y, 1, 1, c)
      }
    }
  }

  wall(0, TWD, 0, SET)
  // The smeared copy starts from the bare wall: at speed the floors' slabs blur away and each column of windows runs
  // into one streak.
  m.drawImage(cv, 0, 0)
  // The lobby: a gold canopy over the glass doors, two lamps.
  R(g, 4, LOBBY - 6, TWD - 8, 4, '#8a6a2a')
  R(g, 4, LOBBY - 3, TWD - 8, 1, '#e8b84a')
  for (const x of [14, 34, 86, 106]) {
    R(g, x, 0, 8, LOBBY - 8, '#3a2e30')
    R(g, x + 1, 2, 6, LOBBY - 12, '#ffd890')
    R(g, x + 1, 2, 6, 2, '#b08a3a')
    R(g, x + 4, 2, 1, LOBBY - 12, '#b08a3a')
  }
  // The floors.
  for (let i = 0; i < NF; i++) {
    const a0 = LOBBY + i * FLOOR
    R(g, 0, a0, TWD, 3, '#262e46')
    R(g, 0, a0 + 2, TWD, 1, '#3a4460')
    R(g, 0, a0, TWD, 1, '#121624')
    for (let x = 3; x < TWD - 4; x += 7) {
      if (x + 4 > C - 15 && x < C + 15) continue
      const k = r()
      const warm = k < 0.42
      const cool = !warm && k < 0.56
      // Lower floors more lit (the shops), the high ones mostly dark rooms.
      const c = warm ? (r() < 0.3 ? '#ffe8b0' : '#ffd070') : cool ? '#8ad0e8' : '#0c1220'
      R(g, x, a0 + 4, 4, 10, c)
      if (warm || cool) {
        R(g, x, a0 + 13, 4, 1, warm ? '#fff4d0' : '#d8f4ff')
        R(g, x + 3, a0 + 4, 1, 9, warm ? '#c89040' : '#4a90b0')
        if (r() < 0.3) R(g, x, a0 + 4, 4, 4, warm ? '#a86a30' : '#3a6a8a')
        R(m, x, a0, 4, FLOOR, warm ? '#a87a48' : '#3a6a88')
        R(m, x + 1, a0, 2, FLOOR, warm ? '#e8b060' : '#6ab0d0')
      } else {
        R(g, x, a0 + 12, 1, 2, '#2a3a58')
        R(m, x + 1, a0, 2, FLOOR, '#1a2236')
      }
    }
    // Piers between the bays: their lit and shaded faces.
    for (const x of [24, 45, 82, 103]) {
      R(g, x, a0 + 3, 1, FLOOR - 3, '#3a4462')
      R(g, x + 1, a0 + 3, 1, FLOOR - 3, '#141a2a')
    }
  }
  // The setbacks: each tier narrower, a gold trim at its top, its ledge catching the light.
  let a = SET
  for (const w of SETBACKS) {
    const x0 = Math.round(C - w / 2)
    wall(x0, w, a, 2 * FLOOR)
    for (let f = 0; f < 2; f++) {
      const a0 = a + f * FLOOR
      R(g, x0, a0, w, 2, '#262e46')
      for (let x = x0 + 4; x < x0 + w - 6; x += 9) {
        if (x + 5 > C - 15 && x < C + 15) continue
        R(g, x, a0 + 4, 5, 11, r() < 0.5 ? '#ffd070' : '#0c1220')
      }
    }
    R(g, x0 - 2, a + 2 * FLOOR - 3, w + 4, 3, '#b08a3a')
    R(g, x0 - 2, a + 2 * FLOOR - 1, w + 4, 1, '#ffe08a')
    R(g, x0 - 2, a + 2 * FLOOR - 3, w + 4, 1, '#5a4018')
    a += 2 * FLOOR
  }
  // The glass top floor (dark until the lift is home): tall panes in brass.
  const rw = RW
  const rx0 = Math.round(C - rw / 2)
  R(g, rx0, TOPF, rw, ROOM, '#0e1a2c')
  for (let x = rx0; x < rx0 + rw; x += 10) {
    R(g, x, TOPF, 1, ROOM, '#8a6a2a')
    R(g, x + 2, TOPF + 6, 1, ROOM - 10, '#1c3048')
  }
  R(g, rx0, TOPF + ROOM - 2, rw, 2, '#b08a3a')
  crown(g, false)
  const lit = canvas(TWD, row(CROWN) + 1)
  crown(lit.g, true)
  // The shaft: dark glass in a brass frame, two rails, a floor's frame at every floor, glints across the panes.
  const sx0 = C - 13
  R(g, sx0, 0, 26, TOPF + 2, '#0e1c30')
  for (let aa = 0; aa < TOPF; aa++) {
    const y = row(aa)
    for (let x = 0; x < 24; x++) if (bayer(x, y) < 0.18) rect(g, sx0 + 1 + x, y, 1, 1, '#16304a')
    if ((aa + 3) % 30 < 8) rect(g, sx0 + 4 + ((aa * 3) % 16), y, 1, 1, '#2a5a7a')
  }
  for (let i = 0; i <= NF + 6; i++) R(g, sx0, LOBBY + i * FLOOR, 26, 1, '#5a4a2a')
  R(g, sx0 + 4, 0, 1, TOPF, '#3a4a60')
  R(g, sx0 + 21, 0, 1, TOPF, '#3a4a60')
  R(g, sx0 - 1, 0, 1, TOPF + 2, '#c8a040')
  R(g, sx0, 0, 1, TOPF + 2, '#6a5020')
  R(g, sx0 + 26, 0, 1, TOPF + 2, '#8a6a2a')
  R(g, sx0 + 27, 0, 1, TOPF + 2, '#3a2a14')
  // The smeared copy takes the shaft, the lobby and all above the floors as they are.
  m.drawImage(cv, sx0 - 1, 0, 30, TH, sx0 - 1, 0, 30, TH)
  m.drawImage(cv, 0, 0, TWD, row(SET), 0, 0, TWD, row(SET))
  m.drawImage(cv, 0, row(LOBBY), TWD, LOBBY, 0, row(LOBBY), TWD, LOBBY)
  // The top floor, lit: its panes blazing gold, the hall's lamps inside.
  const room = canvas(rw, ROOM)
  const q = room.g
  q.drawImage(dGradient(rw, ROOM, ['#fff4d0', '#ffe08a', '#e8b84a']), 0, 0)
  for (let x = 0; x < rw; x += 10) rect(q, x, 0, 1, ROOM, '#8a6a2a')
  rect(q, 0, ROOM - 2, rw, 2, '#b08a3a')
  rect(q, 0, 4, rw, 1, '#fff8e8')
  return { cv, smear: sm, room, crown: lit }
}

/** The crown: three stepped tiers with gold fins, the emblem on the middle one, the spire. Floodlit, all of it gold. */
function crown(g: G, lit: boolean) {
  const C = TWD / 2
  const tiers = [
    [64, 16],
    [48, 18],
    [30, 16],
  ] as const
  let ca = CROWN
  for (const [w, h] of tiers) {
    const x0 = Math.round(C - w / 2)
    for (let x = 0; x < w; x++) {
      const e = x / (w - 1)
      for (let a = ca; a < ca + h; a++) {
        const y = row(a)
        const c = lit
          ? e < 0.1
            ? '#c8b088'
            : e > 0.75
              ? bayer(x, y) < (e - 0.75) * 4
                ? '#5a4a40'
                : '#8a7458'
              : '#a08a68'
          : e < 0.1
            ? '#4a5678'
            : e > 0.75
              ? bayer(x, y) < (e - 0.75) * 4
                ? '#121624'
                : '#1e2438'
              : '#222a40'
        rect(g, x0 + x, y, 1, 1, c)
      }
    }
    for (let x = x0 + 3; x < x0 + w - 2; x += 6) {
      R(g, x, ca + 2, 1, h - 4, lit ? '#fff4d0' : '#b08a3a')
      R(g, x + 1, ca + 2, 1, h - 4, lit ? '#b08a3a' : '#5a4018')
    }
    R(g, x0 - 1, ca + h - 2, w + 2, 2, lit ? '#ffe08a' : '#e8b84a')
    R(g, x0 - 1, ca + h - 1, w + 2, 1, lit ? '#ffffff' : '#ffe08a')
    ca += h
  }
  emblem(g, C, row(CROWN + 22), lit)
  for (let k = 0; ca + k < TIP; k++) {
    const w = Math.max(1, Math.round(5 * (1 - k / (TIP - ca))))
    R(
      g,
      C - (w >> 1),
      ca + k,
      w,
      1,
      k % 7 === 3 ? (lit ? '#ffe08a' : '#e8b84a') : lit ? '#c8b088' : '#3a4460',
    )
  }
}

/** The Fight Area below at dusk: the sea's horizon, the harbour's lights, the Frontier's halls. */
function world(r: Rng): Canvas {
  const cv = canvas(W, 82)
  const g = cv.g
  g.drawImage(dGradient(W, 64, ['#3a2a4e', '#1c1a38', '#10142a']), 0, 18)
  // The sea, the dusk on it in long strokes.
  for (let i = 0; i < 40; i++) {
    const y = r.int(20, 40)
    rect(g, r.int(0, W), y, r.int(3, 14), 1, y < 28 ? '#a8606a' : '#4a3a6a')
  }
  rect(g, 0, 18, W, 1, '#c87a5a')
  // The far shore's hills, a lighthouse.
  for (let x = 0; x < W; x++) {
    const h = Math.round(4 + 3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13 + 1))
    rect(g, x, 18 - h, 1, h, '#2a1e3a')
  }
  rect(g, 18, 6, 2, 8, '#3a2e48')
  rect(g, 18, 5, 2, 1, '#ffe08a')
  // The Frontier's buildings along the near shore, their windows lit.
  const blocks = [
    [0, 40, 22, 16],
    [20, 34, 18, 22],
    [40, 44, 26, 12],
    [64, 30, 14, 26],
    [80, 38, 26, 18],
    [104, 46, 30, 10],
  ] as const
  for (const [x, y, w, h] of blocks) {
    rect(g, x, y, w, h + 20, '#141428')
    rect(g, x, y, w, 1, '#2e2e4a')
    for (let yy = y + 3; yy < y + h + 18; yy += 4)
      for (let xx = x + 2; xx < x + w - 2; xx += 3)
        if (r() < 0.4) rect(g, xx, yy, 1, 2, r() < 0.7 ? '#ffd070' : '#8ad0e8')
  }
  // A dome hall, its lit ring.
  ellipse(g, 52, 44, 12, 9, '#1a1a32')
  rect(g, 40, 44, 25, 20, '#1a1a32')
  for (let x = 42; x < 64; x += 3) rect(g, x, 46, 1, 1, '#ffd070')
  // The harbour lights' reflections.
  for (let i = 0; i < 14; i++) {
    const x = r.int(0, 130)
    for (let y = 58; y < 82; y += 2) if (r() < 0.6) rect(g, x, y, 1, 1, '#a8804a')
  }
  return cv
}

/** The plaza at the tower's foot: paving, lamp posts and their pools of light, the flags of the Frontier. */
function plaza(): Canvas {
  const cv = canvas(W, 30)
  const g = cv.g
  g.drawImage(dGradient(W, 30, ['#2a2638', '#1a1826', '#100e18']), 0, 4)
  rect(g, 0, 4, W, 1, '#4a4258')
  for (let k = -12; k <= 12; k++) line(g, CX + k * 8, 5, CX + k * 30, 30, '#14121e')
  for (const x of [20, 62, 100]) {
    g.drawImage(glow(10, '#6a5030', 1.2, 0.7), x - 10, -2)
    rect(g, x, -10, 1, 15, '#2a2638')
    rect(g, x - 1, -12, 3, 2, '#ffe08a')
  }
  return cv
}

/** A cloud: puffs with a moonlit top and a shadowed belly. */
function cloud(r: Rng, w: number, h: number): Canvas {
  const cv = canvas(w * 2 + 8, h * 2 + 6)
  const g = cv.g
  const puffs = Array.from(
    { length: 7 },
    () => [r.range(8, w * 2), r.range(h * 0.6, h * 1.4), r.range(4, h)] as const,
  )
  for (const [x, y, rr] of puffs) ellipse(g, x, y + 2, Math.round(rr * 1.5), Math.round(rr), '#3a3866')
  for (const [x, y, rr] of puffs) ellipse(g, x, y, Math.round(rr * 1.4), Math.round(rr * 0.9), '#6a6898')
  for (const [x, y, rr] of puffs)
    ellipse(g, x - 1, y - 2, Math.round(rr * 1), Math.round(rr * 0.5), '#a8a8d0')
  return cv
}

/**
 * The sea of clouds below the top, moonlit: bands of rolling billows, low and fine at the horizon, big in front, each
 * band's tops lit by the moon and its foot sunk in the shadow of the band before it.
 */
function deck(r: Rng): Canvas {
  const w = W + 40
  const h = 74
  const cv = canvas(w, h)
  const g = cv.g
  g.drawImage(dGradient(w, h - 4, ['#2e2c5a', '#24224a', '#1a1840']), 0, 4)
  const N = 10
  for (let n = 0; n < N; n++) {
    const f = n / (N - 1)
    const y0 = Math.round(6 + 64 * f ** 1.5)
    const amp = 0.8 + f * 11
    const wl = 3 + f * 10
    const p1 = r() * 10
    const p2 = r() * 10
    const p3 = r() * 10
    for (let x = 0; x < w; x++) {
      // Billows of uneven sizes: the higher of two trains of rounded bumps, on a slow swell.
      const b1 = Math.abs(Math.sin(x / wl + p1)) ** 0.45
      const b2 = 0.8 * Math.abs(Math.sin(x / (wl * 1.7) + p2)) ** 0.45
      const bump = Math.max(b1, b2) + 0.4 * Math.sin(x / (wl * 4.1) + p3)
      const top = Math.round(y0 - amp * bump)
      const crest = bump > 0.75
      const moon = Math.abs(x - 52) < 22 + f * 30
      // Its runs down the column: the lit crest, the lit side, the body, the shadowed foot in dither.
      const yt = Math.max(0, top)
      const lit = Math.max(0, Math.floor(f * 2))
      const body = Math.floor(2 + amp * 0.7)
      rect(g, x, yt, 1, 1, crest ? (moon ? '#b8b8e0' : '#8a88c0') : '#6a68a0')
      if (lit) rect(g, x, yt + 1, 1, lit, moon && crest ? '#7a78b0' : '#5a5890')
      if (body > lit) rect(g, x, yt + 1 + lit, 1, body - lit, '#423f74')
      rect(g, x, yt + 1 + body, 1, h, '#26244e')
      rect(g, x, yt + 1 + body, 1, h, pattern(g, '#2e2c5a', 8))
    }
  }
  rect(g, 0, 4, w, 1, '#8a88b8')
  return cv
}

function palmerAt(t: number, F: Pt): (Pt & { k: number }) | null {
  if (t < T_OPEN) return null
  const q = ease.ioQ(span(t, T_STEP, T_MARK))
  // A stride's bob, three of them. He ends where the wrapper draws him: his feet two rows under the stage's mark.
  const bob = q > 0 && q < 1 ? Math.round(Math.abs(Math.sin(q * Math.PI * 3)) * 2) : 0
  return { x: Math.round(lerp(CX, F.x, q)), y: Math.round(lerp(WALL, F.y + 2, q)) - bob, k: lerp(0.84, 1, q) }
}
/** Rhyperior: looming up out of the car's glare into the doorway behind him, then two heavy steps out to his left. */
function rhAt(t: number): (Pt & { k: number }) | null {
  if (t < T_RH) return null
  const steps = [
    [CX, WALL - 5, 0.86],
    [CX - 2, WALL + 1, 1],
    [104, WALL + 4, 1],
  ] as const
  const i = t < STOMPS[0] ? 0 : 1
  const a = steps[i]!
  const c = steps[i + 1]!
  const q = span(t, i ? STOMPS[0] + 0.06 : T_RH, STOMPS[i]!)
  const e = i ? ease.inQ(q) : ease.ioQ(q)
  // Each step lifts it and slams it down.
  const lift = Math.sin(span(t, STOMPS[i]! - 0.26, STOMPS[i]!) * Math.PI) * 5
  return {
    x: Math.round(lerp(a[0], c[0], e)),
    y: Math.round(lerp(a[1], c[1], e) - lift),
    k: lerp(a[2], c[2], e),
  }
}
/** His laugh: 0..1, a bounce for each "ha". */
const laughAt = (t: number) => Math.max(0, ...LAUGHS.map((at) => pulse(t, at, at + 0.15)))

/** The top floor's hall. */
function inside(b: G, s: S, t: number) {
  const F = s.L.foe
  b.drawImage(s.hall, 0, 0)
  // The lamps up the doorway's sides climbing as the lift comes; the top one a star.
  const climb = span(t, T_CUT, T_TOP)
  for (const x of [DX0 - 9, DX1 + 6]) {
    for (let i = 0; i < 8; i++) {
      const on = climb * 8 >= i + 1 && (t > T_TOP || climb * 8 < i + 2.5)
      const y = WALL - 10 - i * 9
      rect(b, x, y, 3, 3, on ? '#ffe08a' : '#2a2014')
      if (on) rect(b, x + 1, y + 1, 1, 1, '#ffffff')
    }
    if (t > T_TOP) {
      const y = WALL - 10 - 8 * 9
      b.drawImage(glow(6, '#ffe08a', 1.4, 0.8), x + 1 - 6, y + 1 - 6)
      rect(b, x - 1, y + 1, 5, 1, '#ffffff')
      rect(b, x + 1, y - 1, 1, 5, '#ffffff')
    }
  }
  // The sunburst over the doors lights with the ding.
  const sun = span(t, T_TOP, T_TOP + 0.15)
  if (sun > 0) sunburst(b, sun)
  // The doors: closed, a thread of light at their seam as it arrives, then sliding apart on the blaze inside.
  const op = ease.ioQ(span(t, T_OPEN, T_OPEN + 0.32))
  const seam = span(t, T_CUT + 0.05, T_TOP)
  const rh = rhAt(t)
  const p = palmerAt(t, F)
  if (op > 0) {
    // The light over the wall round the doorway and spilling out across the floor towards us; the car's glare.
    spill(b, op, rh)
    lift(b)
  }
  // The reveal: the spotlights slam on, him in the middle, Rhyperior on his left, a third between them.
  if (t >= REVEAL - 0.02) {
    const q = span(t, REVEAL - 0.02, REVEAL + 0.08)
    spot(b, 96, 6, 104, WALL + 5, 34, q)
    spot(b, CX, 6, F.x, F.y + 3, 28, q)
  }
  // Their shadows thrown at us along the floor; Rhyperior (Palmer is drawn over the scene).
  if (op > 0) {
    if (rh) shadow(b, RH, rh)
    if (p) shadow(b, s.p.trainer, p)
  }
  if (rh) drawRh(b, t, rh)
  const half = Math.round(30 * op)
  if (half < 30) {
    // Each panel slides into the wall: only the part still in the doorway shows.
    b.drawImage(s.doors, half, 0, 30 - half, s.doors.height, DX0, DY0, 30 - half, s.doors.height)
    b.drawImage(s.doors, 30, 0, 30 - half, s.doors.height, CX + half, DY0, 30 - half, s.doors.height)
    if (seam > 0 && op === 0) {
      rect(b, CX - 1, DY0, 1, WALL - DY0, seam > 0.6 ? '#fff4d0' : '#b08a3a')
      if (seam > 0.6) b.drawImage(glow(8, '#ffe08a', 1.5, 0.5), CX - 9, DY0 + 20)
    }
  }
  // Each laugh booms out across the floor from his feet.
  LAUGHS.forEach((at, i) => {
    const q = span(t, at, at + 0.4)
    if (q <= 0 || q >= 1) return
    const e = ease.outC(q)
    const c = q < 0.5 ? (i === 2 ? '#ffffff' : '#ffe08a') : '#b08a3a'
    ellipseLine(b, F.x, F.y + 3, Math.round(12 + 70 * e), Math.round(2 + 9 * e), c)
    if (q < 0.6) ellipseLine(b, F.x, F.y + 3, Math.round(8 + 50 * e), Math.round(1 + 6 * e), '#6a5020')
  })
  // The ring of lamps round his mark, running round as he arrives; all of them bright at the reveal.
  const ring = span(t, T_MARK - 0.1, T_MARK + 0.35)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.PI / 2
    const x = Math.round(F.x + Math.cos(a) * 34)
    const y = Math.round(F.y + 3 + Math.sin(a) * 6)
    const on = ring * 14 > i
    const bright = t > REVEAL || laughAt(t) > 0.5
    rect(b, x, y, 2, 1, on ? (bright ? '#ffffff' : '#ffd070') : '#2a2416')
    if (on && bright) rect(b, x - 1, y - 1, 4, 3, pattern(b, '#ffe08a', 5))
  }
  s.dust.draw(b)
  s.amb.draw(b)
}

/** The lift's car, blazing behind the parting doors: white at its heart, gold at its walls, a brass rail. */
function lift(b: G) {
  const h = WALL - DY0
  rect(b, DX0, DY0, DX1 - DX0, h, '#ffe8b0')
  rect(b, DX0 + 5, DY0 + 3, DX1 - DX0 - 10, h - 6, '#fff4d0')
  rect(b, DX0 + 12, DY0 + 6, DX1 - DX0 - 24, h - 14, '#ffffff')
  rect(b, DX0, DY0, DX1 - DX0, 2, '#e8c070')
  rect(b, DX0, 58, DX1 - DX0, 1, '#e8c070')
  rect(b, DX0, WALL - 3, DX1 - DX0, 3, '#e8c070')
}

/** The light out of the lift: a warm trapezoid widening across the floor to us, the wall round the doorway lit. */
function spill(b: G, k: number, rh: (Pt & { k: number }) | null) {
  // While Rhyperior fills the doorway it blocks the light.
  const block = rh ? 1 - 0.6 * span(rh.x, CX - 30, CX - 2) * (rh.x > 130 ? 1 : 0) : 1
  const kk = k * block
  for (let y = WALL; y < H; y++) {
    const q = (y - WALL) / (H - WALL)
    const x0 = Math.round(lerp(DX0, DX0 - 44, q))
    const x1 = Math.round(lerp(DX1, DX1 + 44, q))
    // Tones close to the marble's own, so the dither between them reads as light, not as dots.
    rect(b, x0, y, x1 - x0, 1, pattern(b, '#2a2420', 16 * kk * (1 - q * 0.5)))
    const c0 = Math.round(lerp(x0, x1, 0.15))
    const c1 = Math.round(lerp(x0, x1, 0.85))
    rect(b, c0, y, c1 - c0, 1, pattern(b, '#3e3428', 16 * kk * (1 - q)))
    if (q < 0.45) {
      const d0 = Math.round(lerp(x0, x1, 0.3))
      const d1 = Math.round(lerp(x0, x1, 0.7))
      rect(b, d0, y, d1 - d0, 1, pattern(b, '#5e4c34', 16 * kk * (1 - q / 0.45)))
    }
  }
  rect(b, DX0, WALL, DX1 - DX0, 1, '#8a7048')
  b.drawImage(glow(54, '#2a2430', 1, q8(0.9 * kk)), CX - 54, 54 - 54)
  b.drawImage(glow(38, '#4a3c30', 1.3, q8(0.8 * kk)), CX - 38, 54 - 38)
}

/** A figure's shadow from the lift's light, thrown at us along the floor: dark only where the light falls. */
function shadow(b: G, key: string, p: Pt & { k: number }) {
  const sil = silhouette(key, '#0e1018')
  if (!sil) return
  const w = Math.round(sil.width * p.k * 1.2)
  const h = Math.round(sil.height * p.k * 0.5)
  b.save()
  b.translate(Math.round(p.x - w / 2), Math.round(p.y))
  b.scale(1, -1)
  b.drawImage(sil, 0, 0, sil.width, sil.height, 0, -h, w, h)
  b.restore()
}

/**
 * Rhyperior: a shape in the glare that darkens as it comes, filling the doorway, a black giant rim-lit by the light
 * behind it; its colours at the reveal, rearing in a roar. Inside the car the doorway's frame hides what is beyond it.
 */
function drawRh(b: G, t: number, p: Pt & { k: number }) {
  const lit = t >= REVEAL
  const roar = pulse(t, REVEAL, REVEAL + 0.5)
  const dark = span(t, T_RH, T_RH + 0.25)
  const inCar = t < STOMPS[0] - 0.12
  if (inCar) {
    b.save()
    b.beginPath()
    b.rect(DX0, 0, DX1 - DX0, WALL + 1)
    b.clip()
  }
  drawSprite(b, RH, p.x, p.y, {
    sil: lit ? undefined : dark < 0.5 ? '#e8c890' : dark < 1 ? '#6a5438' : '#08070c',
    outline: lit || inCar ? undefined : '#c89040',
    sx: p.k * (1 + 0.03 * roar),
    sy: p.k * (1 + 0.06 * roar),
    flash: lit ? 1 - span(t, REVEAL, REVEAL + 0.35) : 0,
  })
  if (inCar) b.restore()
}

/** A spotlight: a hazy cone from its can to a pool of light on the floor, in stepped rings. */
function spot(b: G, x0: number, y0: number, x1: number, y1: number, rx: number, k: number) {
  if (k <= 0) return
  for (let y = y0; y < y1; y++) {
    const q = (y - y0) / (y1 - y0)
    const hw = Math.round(lerp(2, rx, q))
    const x = Math.round(lerp(x0, x1, q))
    rect(b, x - hw, y, hw * 2 + 1, 1, pattern(b, '#7a7468', (4 + 3 * q) * k))
    rect(b, x - (hw >> 1), y, hw + 1, 1, pattern(b, '#a8a090', (2 + 3 * q) * k))
  }
  ellipse(b, x1, y1, rx, 5, '#3a3630')
  ellipse(b, x1, y1, Math.round(rx * 0.75), 4, '#5a5444')
  ellipse(b, x1, y1, Math.round(rx * 0.45), 2, '#8a8068')
  rect(b, x0 - 3, y0 - 6, 7, 5, '#2a2a36')
  rect(b, x0 - 2, y0 - 1, 5, 1, '#ffffff')
  b.drawImage(glow(6, '#fff4d0', 1.5, 0.75), x0 - 6, y0 - 6)
}

/** The art-deco sunburst over the doors, lit gold. */
function sunburst(b: G, k: number) {
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI
    line(b, CX, DY0 - 2, CX + Math.cos(a) * 15, DY0 - 2 + Math.sin(a) * 12, k > 0.5 ? '#ffe08a' : '#b08a3a')
  }
  ellipse(b, CX, DY0 - 2, 3, 3, '#fff4d0')
}

/** The hall at the top, built once: art-deco navy and brass, tall windows over the sea of clouds, the lift's doorway. */
function hall(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  // The back wall: panels, a dado rail.
  g.drawImage(dGradient(W, WALL, ['#0a0c18', '#121628', '#161c32']), 0, 0)
  for (let x = 0; x < W; x += 12) rect(g, x, 12, 1, WALL - 22, '#0c0e1c')
  rect(g, 0, WALL - 12, W, 2, '#3a3020')
  rect(g, 0, WALL - 12, W, 1, '#6a5428')
  // The windows: the night over the clouds, the moon in the middle one.
  for (const [x0, x1] of [
    [6, 40],
    [48, 82],
    [90, 124],
  ] as const) {
    const w = x1 - x0
    g.drawImage(dGradient(w, 66, ['#06081a', '#0c1230', '#1c2048', '#3a3866']), x0, 14)
    for (let i = 0; i < 9; i++)
      rect(g, x0 + r.int(1, w - 2), 16 + r.int(0, 34), 1, 1, r() < 0.3 ? '#ffffff' : '#6a6a98')
    for (let i = 0; i < 12; i++) {
      const cx = x0 + r.int(0, w)
      ellipse(g, cx, 70 + r.int(0, 6), r.int(4, 9), 2, '#4a4878')
      ellipse(g, cx, 69 + r.int(0, 6), r.int(3, 7), 1, '#8a88b8')
    }
    rect(g, x0, 76, w, 4, '#3a3866')
    // Mullions and the frame.
    rect(g, x0 + Math.round(w / 2), 14, 1, 66, '#6a5020')
    rect(g, x0, 38, w, 1, '#6a5020')
    rect(g, x0 - 2, 12, w + 4, 2, '#b08a3a')
    rect(g, x0 - 2, 80, w + 4, 2, '#b08a3a')
    rect(g, x0 - 2, 12, 2, 70, '#8a6a2a')
    rect(g, x1, 12, 2, 70, '#5a4018')
  }
  ellipse(g, 58, 26, 6, 6, '#e8e4c8')
  ellipse(g, 59, 25, 5, 5, '#fffbe8')
  rect(g, 48 + 17, 14, 1, 66, '#6a5020')
  rect(g, 48, 38, 34, 1, '#6a5020')
  // Fluted pilasters round the doorway and at the right.
  for (const [x, w] of [
    [128, 10],
    [208, 10],
    [230, 10],
  ] as const) {
    rect(g, x, 10, w, WALL - 10, '#1e1a2a')
    for (let k = 1; k < w - 1; k += 2) rect(g, x + k, 14, 1, WALL - 20, '#2e2840')
    rect(g, x, 10, 1, WALL - 10, '#4a4058')
    rect(g, x + w - 1, 10, 1, WALL - 10, '#0a0812')
    rect(g, x - 1, 10, w + 2, 4, '#b08a3a')
    rect(g, x - 1, 10, w + 2, 1, '#e8b84a')
  }
  // The ceiling: a dark coffer and its gold trim, the spotlights' cans.
  rect(g, 0, 0, W, 9, '#06070e')
  rect(g, 0, 9, W, 1, '#b08a3a')
  for (const x of [96, CX, 232]) {
    rect(g, x - 3, 0, 7, 5, '#1e1e2a')
    rect(g, x - 2, 4, 5, 1, '#3a3a4a')
  }
  // The doorway: a deep brass frame, stepped.
  rect(g, DX0 - 5, DY0 - 4, DX1 - DX0 + 10, WALL - DY0 + 4, '#6a5020')
  rect(g, DX0 - 5, DY0 - 4, DX1 - DX0 + 10, 1, '#e8b84a')
  rect(g, DX0 - 5, DY0 - 4, 1, WALL - DY0 + 4, '#c8a040')
  rect(g, DX1 + 4, DY0 - 4, 1, WALL - DY0 + 4, '#3a2a14')
  rect(g, DX0 - 2, DY0 - 1, DX1 - DX0 + 4, WALL - DY0 + 1, '#3a2a14')
  rect(g, DX0 - 2, DY0 - 1, DX1 - DX0 + 4, 1, '#8a6a2a')
  // The unlit sunburst.
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI
    line(g, CX, DY0 - 2, CX + Math.cos(a) * 15, DY0 - 2 + Math.sin(a) * 12, '#4a3a1a')
  }
  // The floor: polished black marble, the windows and the doorway mirrored in it, its seams running to us.
  g.drawImage(dGradient(W, H - WALL, ['#141a28', '#0e121e', '#080a12']), 0, WALL)
  rect(g, 0, WALL, W, 1, '#2a2a3a')
  for (const [x0, x1] of [
    [6, 40],
    [48, 82],
    [90, 124],
  ] as const)
    for (let y = WALL + 2; y < WALL + 30; y++)
      for (let x = x0; x < x1; x++)
        if ((1 - (y - WALL) / 30) * 0.45 > bayer(x, y))
          rect(g, x, y, 1, 1, y < WALL + 10 ? '#2a3050' : '#1c2038')
  for (let k = -10; k <= 10; k++) line(g, CX + k * 14, WALL + 1, CX + k * 60, H, '#0a0c16')
  for (let y = WALL + 4, d = 3; y < H; y += d, d += 2) rect(g, 0, Math.round(y), W, 1, '#0a0c16')
  return cv
}

/** The lift's two doors, side by side: brass, engraved with chevrons and a half sun at their foot. */
function doors(): Canvas {
  const h = WALL - DY0
  const cv = canvas(60, h)
  const g = cv.g
  g.drawImage(dGradient(60, h, ['#c8a040', '#a07a30', '#8a6a2a', '#6a5020']), 0, 0)
  for (const x0 of [0, 30]) {
    rect(g, x0, 0, 1, h, '#e8c070')
    rect(g, x0 + 29, 0, 1, h, '#3a2a14')
    rect(g, x0 + 3, 3, 24, h - 6, '#8a6a2a')
    rect(g, x0 + 4, 4, 22, h - 8, '#a07a30')
    for (let k = 0; k < 6; k++) {
      const y = 12 + k * 9
      const sd = x0 ? -1 : 1
      line(g, x0 + (x0 ? 26 : 4), y, x0 + 15 + sd * 0, y - 6, '#e8c070')
      line(g, x0 + (x0 ? 26 : 4), y + 1, x0 + 15, y - 5, '#6a5020')
    }
  }
  // A half sun across both doors, low down.
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI
    line(g, 30, h - 8, 30 + Math.cos(a) * 12, h - 8 + Math.sin(a) * 10, '#ffe08a')
  }
  rect(g, 29, 0, 2, h, '#2a1e0e')
  return cv
}
