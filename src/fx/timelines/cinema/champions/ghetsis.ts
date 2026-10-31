// Ghetsis's entrance (docs/54): the Unova League at night, a great pale moon over it, its hall lit warm at the end of
// the plaza, braziers burning. A rumble; cracks of green light race across the plaza and the ground gives: N's Castle
// rises out of the earth round the League, tower after tower shedding rock and dust, its keep last and highest behind
// the hall, swallowing it; the League's lights die and the braziers gutter out. The castle settles with a boom; Team
// Plasma's banners unfurl down its walls one by one to a drum, its windows open green like eyes, the braziers flare back
// up in green fire. The night darkens and a shape climbs from behind the castle onto the moon: Hydreigon, black against
// it, its three heads lighting one after the other. The storm breaks, rain slanting down, and each flash of lightning
// shows a robed figure nearer, his shadow thrown at us: in the League's green doorway, out on the plaza, here; between
// the flashes only his red eye in the dark. The last one leaves him standing on his mark; the reveal lights him up as
// Hydreigon's heads blaze.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  bolt,
  cached,
  canvas,
  clamp,
  ease,
  ellipse,
  glow,
  icon,
  lerp,
  line,
  mix,
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteFrame, spriteKey } from '../../../sprites'
import { H, screenFlash, screenShake, W, within, type Stage } from '../../../timeline'
import { championCinema, type ChampionState } from '../champion'
import { burstRing, dGradient, dissolve, pulse, tri } from '../kit'

const REVEAL = 4.7
const T_QUAKE = 0.85
/** The League's lights going out, the castle settling, the dark falling. */
const T_OUT = 1.6
const T_SET = 2.32
const T_DARK = 2.92
/** Hydreigon climbing into the moon; its three heads lighting. */
const T_HY0 = 2.82
const T_HY1 = 3.34
const HEADS = [3.12, 3.24, 3.36] as const
/** The lightning: each flash shows him nearer. A last one, after the reveal, lights only the sky. */
const FLASHES = [3.56, 3.95, 4.33] as const
const T_AFTER = 5.35

const HYDREIGON = 635
const HY = spriteKey(HYDREIGON, false)
/** Hydreigon over the moon: its frame's foot, its heads as fractions of its frame. */
const HX = 60
const HFOOT = 74
const HEAD_AT = [
  [0.67, 0.57],
  [0.23, 0.53],
  [0.12, 0.69],
] as const

/** The far edge of the plaza (the horizon the castle rises from), the League's doorway on it. */
const EDGE = 80
const DOOR = 131
const MOON = { x: 60, y: 38, r: 22 }

const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a'] as const
const GREEN = ['#e8fff0', '#b8ffd0', '#6af0a0', '#3ac878', '#1e8a50', '#0e4a2a'] as const
const STONE = { lit: '#4e4864', mid: '#2c283a', dark: '#1a1724', ink: '#0e0c14', mortar: '#221e2e' }

/** Where he is: in the League's doorway, out on the plaza, on his mark (feet, scale), from each flash. */
const STEPS = [
  [DOOR, EDGE + 1, 0.42],
  [154, 89, 0.68],
  [0, 0, 1],
] as const

/** The castle's pieces: x, width, height, when it starts and stops rising. The keep last, behind the League. */
interface Piece {
  cv: Canvas
  lit: Canvas
  x: number
  t0: number
  t1: number
}

type X = {
  buf: Canvas
  sky: Canvas
  skyLit: Canvas
  hills: Canvas
  league: Canvas
  leagueLit: Canvas
  plaza: Canvas
  pieces: Piece[]
  braziers: Canvas
  cracks: [number, number][][]
  bolts: [number, number][][]
  stars: [number, number, number][]
  banners: { x: number; y: number; len: number; t: number }[]
  rubble: Particles
  dust: Dust[]
  rain: Particles
  /** His eye in his picture, from its feet (found the first time he is drawn); null: not found. */
  eye?: { x: number; y: number } | null
}
type S = ChampionState<X>
/** A billow of dust: dithered, so it reads as haze over the stone, not as a solid ball. */
interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  r0: number
  r1: number
  age: number
  life: number
}

/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** How bright the lightning is: a stab, a flicker, then gone. */
function lightning(t: number) {
  let L = 0
  for (const at of [...FLASHES, T_AFTER]) {
    const e = t - at
    if (e < 0 || e > 0.4) continue
    L = Math.max(L, e < 0.05 ? 1 : e < 0.09 ? 0.35 : e < 0.13 ? 0.8 : 0.8 * (1 - (e - 0.13) / 0.27))
  }
  return L
}
/** How dark the night has fallen: none, then deep once the castle is up and Hydreigon climbs. */
const darkAt = (t: number) => 0.5 * span(t, T_DARK, T_DARK + 0.45)
/** Which flash has shown him last (-1: none yet). */
const stepAt = (t: number) => FLASHES.reduce((n, at, i) => (t >= at ? i : n), -1)

export const ghetsisChampion = championCinema<X>({
  id: 'ghetsis',
  reveal: REVEAL,
  seed: 6350,
  aura: ['#ffffff', '#e0a8ff', '#8a2ad0', '#24063a'],
  flash: '#f0e0ff',
  sample: { trainer: '/trainers/classes/unova/ghetsis.png', name: 'Ghetsis', lead: 625, ace: 635, team: 3 },
  extras: [HYDREIGON],
  setup(st: Stage, r: Rng) {
    // The quake rumbling on under the rise, a jolt for each piece breaking the ground, the boom as it settles.
    for (let k = 0; k < 12; k++) st.screenShakes.push([T_QUAKE + k * 0.12, 0.2, 1])
    st.screenShakes.push(
      [1.05, 0.3, 2],
      [1.35, 0.4, 3],
      [T_SET, 0.5, 4],
      [FLASHES[2], 0.25, 1],
      [REVEAL, 0.45, 3],
    )
    const pieces = castle(rng(6351))
    return {
      buf: canvas(W, H),
      sky: dGradient(W, 90, ['#04030a', '#0a0716', '#120d22', '#1c142e', '#281c3a', '#34243e'], 6),
      skyLit: dGradient(W, 90, ['#2a2050', '#4a3c84', '#7a6ab8', '#a898e0', '#c8c0f0'], 6),
      hills: hills(),
      league: league(false),
      leagueLit: league(true),
      plaza: plaza(rng(6352)),
      pieces,
      braziers: braziers(),
      cracks: Array.from({ length: 7 }, (_, i) => {
        const x0 = 40 + i * 28 + r.range(-8, 8)
        return bolt(r, x0, EDGE + 2, x0 + (x0 - DOOR) * 1.6 + r.range(-20, 20), H + 4, 0.28, 4)
      }),
      bolts: [
        bolt(r, 150, -6, 131, 4, 0.35, 5),
        bolt(r, 30, -6, 10, 46, 0.35, 5),
        bolt(r, 200, -6, 219, 12, 0.35, 5),
        bolt(r, 80, -6, 101, 8, 0.35, 5),
      ],
      stars: Array.from(
        { length: 40 },
        () => [r.int(0, W - 1), r.int(0, 60), r()] as [number, number, number],
      ),
      banners: [
        { x: 30, y: 63, len: 16, t: 2.46 },
        { x: 70, y: 63, len: 16, t: 2.56 },
        { x: 104, y: 22, len: 34, t: 2.66 },
        { x: 158, y: 22, len: 34, t: 2.76 },
        { x: 219, y: 26, len: 32, t: 2.86 },
      ],
      rubble: new Particles(),
      dust: [],
      rain: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    s.rubble.update(dt)
    for (let i = s.dust.length - 1; i >= 0; i--) {
      const d = s.dust[i]!
      d.age += dt
      if (d.age > d.life) s.dust.splice(i, 1)
      else {
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.vx *= 1 - 1.2 * dt
        d.vy *= 1 - 0.8 * dt
      }
    }
    const puff = (x: number, y: number, vx: number, vy: number, r0: number, r1: number, life: number) =>
      s.dust.push({ x, y, vx, vy, r0, r1, age: 0, life })
    s.rain.update(dt)
    // Each piece of the castle sheds rock off its faces as it climbs, and churns dust up at its foot.
    for (const p of s.pieces) {
      const q = span(t, p.t0, p.t1)
      if (q <= 0 || q >= 1) continue
      const top = EDGE - p.cv.height * ease.outQ(q)
      if (r() < 0.7)
        s.rubble.add({
          x: p.x + r.range(0, p.cv.width),
          y: top + r.range(0, 20),
          vx: r.range(-12, 12),
          vy: r.range(-10, 20),
          ay: 260,
          life: 0.8,
          size: r.int(1, 2),
          shape: 'sq',
          colors: ['#5a5468', '#3a3448', '#2a2636'],
        })
      if (r() < 0.35)
        puff(
          p.x + r.range(-6, p.cv.width + 6),
          EDGE - r.range(0, 3),
          r.range(-16, 16),
          -r.range(16, 36),
          r.range(3, 5),
          r.range(10, 16),
          r.range(0.9, 1.4),
        )
    }
    // The boom as it settles: dust rolling out along the plaza's edge.
    if (within(t, T_SET, T_SET + dt))
      for (let k = 0; k < 16; k++) {
        const sd = r() < 0.5 ? -1 : 1
        puff(
          r.range(0, W),
          EDGE - r.range(0, 4),
          sd * r.range(20, 60),
          -r.range(4, 14),
          6,
          r.range(14, 20),
          r.range(1, 1.5),
        )
      }
    // The cracks spit green sparks as they open.
    if (t > T_QUAKE + 0.05 && t < T_SET && r() < 0.5) {
      const c = r.pick(s.cracks)
      const n = Math.floor(c.length * crackAt(t))
      if (n > 1) {
        const [x, y] = c[r.int(0, n - 1)]!
        s.fx.add({
          x,
          y,
          vx: r.range(-20, 20),
          vy: -r.range(30, 80),
          ay: 160,
          life: 0.5,
          size: 1,
          shape: 'px',
          colors: [...GREEN],
        })
      }
    }
    // The storm: a slanting rain once the dark has fallen.
    const rn = span(t, T_DARK + 0.3, FLASHES[0])
    for (let k = 0; k < Math.round(rn * 3); k++)
      s.rain.add({
        x: r.range(-20, W + 40),
        y: -4,
        vx: -60,
        vy: r.range(240, 300),
        life: 0.7,
        size: 1,
        shape: 'streak',
        trail: 0.02,
        colors: ['#4a4868', '#3a3858'],
      })
    // Hydreigon's heads blaze up at the reveal: dark sparks thrown off them.
    if (within(t, REVEAL, REVEAL + dt))
      for (const [hx, hy] of headsAt()) {
        for (let k = 0; k < 5; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: hx,
            y: hy,
            vx: Math.cos(a) * r.range(30, 70),
            vy: Math.sin(a) * r.range(30, 70),
            drag: 2.5,
            life: 0.6,
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: ['#ffffff', '#ff8ac8', '#c8287a', '#5a0a3a'],
          })
        }
      }
    // The reveal's violet burst off him.
    if (within(t, REVEAL, REVEAL + dt))
      for (let k = 0; k < 16; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: F.x,
          y: F.y - 40,
          vx: Math.cos(a) * 80,
          vy: Math.sin(a) * 60,
          drag: 3,
          life: 0.5,
          size: 1,
          shape: 'plus',
          colors: ['#ffffff', '#e0a8ff', '#8a2ad0'],
        })
      }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const L = lightning(t)
    // The sky, the stars; the lightning lighting it all at once.
    b.drawImage(s.sky, 0, 0)
    for (const [x, y, ph] of s.stars)
      rect(b, x, y, 1, 1, Math.sin(t * 4 + ph * 20) > 0.7 ? '#c8c8e8' : ph > 0.5 ? '#5a5478' : '#3a3458')
    if (L > 0) dissolve(b, s.skyLit, L)
    moon(b)
    // The bolt for each flash, down onto a spire.
    const bi = [...FLASHES, T_AFTER].findIndex((at) => t >= at && t < at + 0.16)
    if (bi >= 0 && Math.floor((t - [...FLASHES, T_AFTER][bi]!) * 30) % 3 !== 1) {
      const pts = s.bolts[bi]!
      polyline(
        b,
        pts.map(([x, y]) => [x + 1, y] as [number, number]),
        '#8a6ad8',
        2,
      )
      polyline(b, pts, '#ffffff', 1)
    }
    drawHydreigon(b, t, L)
    b.drawImage(s.hills, 0, EDGE - 22)
    // The castle: each piece climbing out of the ground, shuddering as it comes.
    for (const p of s.pieces) {
      const q = ease.outQ(span(t, p.t0, p.t1))
      if (q <= 0) continue
      const jit = q < 1 ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
      const y = Math.round(EDGE - p.cv.height * q)
      const hgt = EDGE - y
      b.drawImage(p.cv, 0, 0, p.cv.width, hgt, p.x + jit, y, p.cv.width, hgt)
    }
    // The League's hall at the keep's foot: lit, flickering as the ground shakes, dark.
    b.drawImage(s.league, DOOR - 23, EDGE - 28)
    const on = t < T_OUT ? (t > T_QUAKE + 0.3 && Math.floor(t * 17) % 4 === 0 ? 0 : 1) : 0
    if (on) b.drawImage(s.leagueLit, DOOR - 23, EDGE - 28)
    s.rubble.draw(b)
    for (const d of s.dust) {
      const q = d.age / d.life
      const rr = Math.round(lerp(d.r0, d.r1, ease.outQ(q)))
      const lv = 11 * Math.min(1, d.age / 0.15) * (1 - q)
      ellipse(b, d.x, d.y, rr, Math.round(rr * 0.7), pattern(b, '#2c2838', lv))
      ellipse(
        b,
        d.x - 1,
        d.y - Math.round(rr * 0.3),
        Math.round(rr * 0.7),
        Math.round(rr * 0.4),
        pattern(b, '#3e3850', lv * 0.8),
      )
    }
    b.drawImage(s.plaza, 0, EDGE)
    // The hall's warm light on the plaza while it lasts.
    if (on) b.drawImage(glow(40, '#3a2a28', 1.1, 0.8), DOOR - 40, EDGE - 18)
    // The cracks: running out from the edge, burning green, cooling once the castle stands.
    const cq = crackAt(t)
    const heat = 1 - span(t, T_SET + 0.2, T_DARK + 0.4)
    if (cq > 0 && heat > 0)
      for (const c of s.cracks) {
        const n = Math.max(2, Math.round(c.length * cq))
        polyline(b, c.slice(0, n), heat > 0.5 ? GREEN[4] : '#14301e', 2)
        if (heat > 0.3) polyline(b, c.slice(0, n), GREEN[heat > 0.7 ? 1 : 3])
      }
    else if (cq > 0) for (const c of s.cracks) polyline(b, c, '#0c0a12')
    drawBraziers(b, s, t)
    // The dark falls on everything but the lights the castle keeps.
    const dk = darkAt(t) * (1 - 0.8 * L)
    if (dk > 0) wash(b, '#04020a', dk, 8)
    windows(b, s, t, L)
    // The banners over the windows they hang across, darkened with the night as the wash would.
    for (const bn of s.banners) banner(b, bn.x, bn.y, bn.len, t, bn.t, dk)
    drawHeads(b, t)
    // His doorway glowing green before he comes out of it.
    const dg = pulse(t, FLASHES[0] - 0.3, FLASHES[1])
    if (dg > 0) {
      b.drawImage(glow(14, GREEN[3], 1.4, q8(0.8 * dg)), DOOR - 14, EDGE - 20)
      rect(b, DOOR - 3, EDGE - 11, 7, 11, GREEN[2])
      rect(b, DOOR - 2, EDGE - 10, 5, 10, GREEN[1])
    }
    s.rain.draw(b)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#04030a')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    const i = stepAt(t)
    if (i < 0) return
    const F = s.L.foe
    const sh = screenShake(t, s.screenShakes)
    const st = STEPS[i]!
    const x = (i === 2 ? F.x : st[0]) + sh.x
    const y = (i === 2 ? F.y + 2 : st[1]) + sh.y
    const kk = st[2]
    const L = lightning(t)
    // In the flash: black against the white sky, a hard rim, his shadow thrown at us across the stones. Between the
    // flashes he is all but gone in the dark, but for his eye.
    if (L > 0.3) {
      const sil = silhouette(s.p.trainer, '#06050a')
      if (sil) {
        const w = Math.round(sil.width * kk)
        const h = Math.round(sil.height * kk * 0.55)
        g.save()
        g.translate(Math.round(x - w / 2), Math.round(y))
        g.scale(1, -1)
        g.drawImage(sil, 0, 0, sil.width, sil.height, 0, -h, w, h)
        g.restore()
      }
    }
    const dim = i === 2 ? span(t, FLASHES[2] + 0.3, REVEAL) : 0
    drawSprite(g, s.p.trainer, x, y, {
      sil: L > 0.3 ? '#06050a' : '#0c0a12',
      outline: L > 0.3 ? '#e8e0ff' : dim > 0 ? (Math.floor(t * 10) % 2 ? '#3a2a5a' : '#4a3470') : undefined,
      sx: kk,
      sy: kk,
    })
    // His eye: a red point in the dark, a tiny glow round it.
    if (s.eye === undefined) s.eye = eyeOf(s.p.trainer)
    const e = s.eye
    if (e) {
      const ex = Math.round(x + e.x * kk)
      const ey = Math.round(y + e.y * kk)
      const pulseOn = 0.6 + 0.4 * Math.sin(t * 9)
      g.drawImage(glow(4, '#ff2a3a', 1.2, q8(0.7 * pulseOn)), ex - 4, ey - 4)
      rect(g, ex, ey, kk > 0.6 ? 2 : 1, 1, '#ff6a6a')
    }
  },
  front(g, _s, t) {
    // The lightning's flashes: never closer than a third of a second, the last a third of a second before the reveal.
    for (const at of FLASHES) if (within(t, at, at + 0.06)) screenFlash(g, '#e8e0ff', 0.3)
  },
  sounds: [
    [
      0.05,
      () => (
        hiss(1.6, { freq: 260, type: 'lowpass', vol: 0.05 }),
        tone(55, 1.6, { type: 'sine', vol: 0.05 }),
        tone(82, 1.4, { type: 'triangle', vol: 0.02, at: 0.2 })
      ),
    ],
    [
      T_QUAKE,
      () => (
        hiss(1.5, { freq: 120, type: 'lowpass', vol: 0.12 }),
        tone(38, 1.5, { type: 'sine', vol: 0.12, slide: 10 })
      ),
    ],
    [1.05, () => fxSound('ug.collapse')],
    [
      1.35,
      () => (
        tone(45, 0.8, { type: 'sine', vol: 0.14, slide: -10 }),
        hiss(0.8, { freq: 180, type: 'lowpass', vol: 0.1 })
      ),
    ],
    [1.65, () => fxSound('ug.collapse')],
    [
      T_SET,
      () => (
        tone(36, 0.9, { type: 'sine', vol: 0.18, slide: -8 }),
        hiss(0.9, { freq: 160, type: 'lowpass', vol: 0.12 })
      ),
    ],
    // A drum for each banner, an organ's minor chord swelling under them.
    ...[2.46, 2.56, 2.66, 2.76, 2.86].map(
      (at) =>
        [
          at,
          () => (
            tone(70, 0.22, { type: 'sine', vol: 0.12, slide: -25 }),
            hiss(0.08, { freq: 900, vol: 0.05 })
          ),
        ] as const,
    ),
    [
      2.5,
      () => [147, 175, 220, 294].forEach((f) => tone(f, 1.3, { type: 'sawtooth', vol: 0.014, attack: 0.3 })),
    ],
    [T_HY0, () => hiss(0.6, { freq: 300, slide: -150, type: 'lowpass', vol: 0.08 })],
    ...HEADS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(90 - i * 12, 0.35, { type: 'sawtooth', vol: 0.05, slide: -30 }),
            hiss(0.3, { freq: 400, type: 'lowpass', vol: 0.06 })
          ),
        ] as const,
    ),
    [T_DARK + 0.3, () => hiss(2, { freq: 2200, q: 0.4, vol: 0.025 })],
    ...FLASHES.map(
      (at, i) =>
        [at, () => (fxSound('thunder.strike'), tone(55 - i * 4, 0.5, { type: 'sine', vol: 0.08 }))] as const,
    ),
    [
      REVEAL,
      () => (
        fxSound('legend.roar'),
        [110, 131, 165, 208].forEach((f) => tone(f, 0.9, { type: 'sawtooth', vol: 0.02 })),
        tone(55, 0.9, { type: 'square', vol: 0.03 })
      ),
    ],
    [T_AFTER, () => hiss(0.6, { freq: 220, type: 'lowpass', vol: 0.07 })],
  ],
})

/** How far the cracks have run across the plaza. */
const crackAt = (t: number) => ease.outQ(span(t, T_QUAKE + 0.05, T_QUAKE + 0.55))

/**
 * His eye in his picture, from its feet: the reddest pixel in its top quarter (his monocle's red eye). His picture is the
 * site's own, so it can be read back; any other that can't simply has no glint.
 */
function eyeOf(key: string): { x: number; y: number } | null {
  const fr = spriteFrame(key)
  if (!fr) return null
  try {
    const h = Math.max(1, Math.round(fr.height * 0.25))
    const d = fr.g.getImageData(0, 0, fr.width, h).data
    let best = 0
    let at: { x: number; y: number } | null = null
    for (let y = 0; y < h; y++)
      for (let x = 0; x < fr.width; x++) {
        const i = (y * fr.width + x) * 4
        const red = d[i]! - Math.max(d[i + 1]!, d[i + 2]!)
        if (d[i + 3]! > 200 && red > 60 && red > best) {
          best = red
          at = { x: x - fr.width / 2, y: y - fr.height }
        }
      }
    return at
  } catch {
    return null
  }
}

/** Hydreigon's three heads on the screen (its frame at twice its size, risen into the moon). */
function headsAt(): [number, number][] {
  const fr = spriteFrame(HY)
  const fw = fr?.width ?? 60
  const fh = fr?.height ?? 80
  return HEAD_AT.map(([fx, fy]) => [HX - fw / 2 + fx * fw, HFOOT - fh + fy * fh] as [number, number])
}

/** Each head's eyes lighting in turn, magenta; at the reveal they blaze. */
function drawHeads(b: G, t: number) {
  const blaze = pulse(t, REVEAL, REVEAL + 0.6)
  headsAt().forEach(([x, y], i) => {
    const on = span(t, HEADS[i]!, HEADS[i]! + 0.12)
    if (on <= 0) return
    const fl = 0.75 + 0.25 * Math.sin(t * 13 + i * 2)
    const R = Math.round(5 + 3 * blaze)
    b.drawImage(glow(R, '#c8287a', 1.4, q8(on * fl)), Math.round(x - R), Math.round(y - R))
    rect(b, x - 1, y, 1, 1, '#ff8ac8')
    rect(b, x + 1, y, 1, 1, '#ff8ac8')
    rect(b, x, y, 1, 1, '#ffffff')
    if (blaze > 0) burstRing(b, x, y, span(t, REVEAL + i * 0.05, REVEAL + 0.5 + i * 0.05), 30, 1, '#ff8ac8')
  })
}

/**
 * Hydreigon climbing out from behind the castle into the moon: in deep shadow, the moon rimming it; black against the
 * lightning; its colours coming up at the reveal.
 */
function drawHydreigon(b: G, t: number, L: number) {
  const q = ease.outC(span(t, T_HY0, T_HY1))
  if (q <= 0) return
  const bob = Math.round(Math.sin(t * 3) * 1.5)
  const y = Math.round(HFOOT + 70 * (1 - q)) + bob
  const lit = span(t, REVEAL, REVEAL + 0.3)
  if (L > 0.3 && t < REVEAL) return void drawSprite(b, HY, HX, y, { sil: '#05040a', outline: '#e8e0ff' })
  drawSprite(b, HY, HX, y, {
    outline: '#8a84b8',
    tint: { color: '#0a0814', a: 0.78 - 0.5 * lit },
  })
}

/** The moon: a great pale disc low over the League, lit from the left, its seas dithered in, a halo round it. */
function moon(b: G) {
  const { x, y, r } = MOON
  b.drawImage(glow(r + 20, '#1e1a36', 1.1, 0.9), x - r - 20, y - r - 20)
  b.drawImage(glow(r + 8, '#3a3450', 1.3, 0.8), x - r - 8, y - r - 8)
  b.drawImage(moonDisc(), x - r, y - r)
}
const moonDisc = () =>
  cached('ghetsis-moon', () => {
    const { r } = MOON
    const cv = canvas(r * 2 + 1, r * 2 + 1)
    const g = cv.g
    const sea = rng(6353)
    const seas = Array.from({ length: 8 }, () => [
      sea.range(-0.6, 0.5),
      sea.range(-0.6, 0.6),
      sea.range(0.08, 0.2),
    ])
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++) {
        const d = Math.hypot(xx, yy) / (r + 0.5)
        if (d > 1) continue
        // Lit from the upper left: the far limb in shade, a bright rim on the near one.
        const sh = (xx * 0.8 + yy * 0.6) / r
        let c =
          sh > 0.55
            ? bayer(xx, yy) < (sh - 0.55) * 2
              ? '#8a8c7c'
              : '#b8bca4'
            : sh > 0.2
              ? '#cfd3bc'
              : '#e4e8d4'
        if (d > 0.9 && sh < -0.2) c = '#f8faec'
        for (const [mx, my, mr] of seas)
          if (Math.hypot(xx / r - mx!, yy / r - my!) < mr!) c = sh > 0.4 ? '#9a9c8a' : '#bcc0aa'
        rect(g, xx + r, yy + r, 1, 1, c)
      }
    return cv
  })

/** A Plasma banner unfurling from its rod: navy, swallow-tailed, the shield on it, rippling in the wind. */
const SHIELD = ['.kkkkk.', 'kwwkbbk', 'kwwkbbk', 'kkkkkkk', 'kbbkwwk', '.kbkwk.', '..kkk..']
function banner(g: G, x: number, y: number, len: number, t: number, t0: number, dim: number) {
  const c = (hex: string) => (dim > 0 ? mix(hex, '#04020a', Math.round(dim * 8) / 8) : hex)
  const q = ease.outBack(span(t, t0, t0 + 0.2), 1.4)
  if (q <= 0) return
  const n = Math.round(len * Math.min(q, 1.08))
  const w = 9
  for (let k = 0; k < n; k++) {
    const off = Math.round(Math.sin(k * 0.35 - t * 6) * (k / len) * 1.5)
    // Pale cloth, lit on its left, its right in shade; the swallow tail a notch cut up its foot.
    const notch = Math.max(0, k - (n - 4))
    const row = (x0: number, ww: number) => {
      rect(g, x0, y + k, ww, 1, c('#b4bcd4'))
      rect(g, x0, y + k, 1, 1, c('#e8eef8'))
      rect(g, x0 + ww - 1, y + k, 1, 1, c('#727c9a'))
    }
    if (notch) {
      row(x + off, 5 - notch)
      row(x + off + 4 + notch, w - 4 - notch)
    } else {
      row(x + off, w)
      rect(g, x + off + w - 2, y + k, 1, 1, c('#8a94b0'))
    }
    if (k === 1 || k === 12) rect(g, x + off + 1, y + k, w - 2, 1, c('#1e2a5a'))
  }
  if (n > 11)
    g.drawImage(
      icon(SHIELD, { k: c('#0e1430'), w: c('#26346a'), b: c('#4a9ae8') }),
      x + 1 + Math.round(Math.sin(4 * 0.35 - t * 6) * (4 / len) * 1.5),
      y + 3,
    )
  rect(g, x - 1, y - 1, w + 2, 2, c('#8a7a5a'))
  rect(g, x - 1, y - 1, w + 2, 1, c('#c8b88a'))
}

/** The castle's windows opening one by one in sickly green, like eyes; the lightning drowns them. */
function windows(b: G, s: S, t: number, L: number) {
  for (const p of s.pieces) {
    const q = span(t, p.t1 + 0.4, p.t1 + 0.9)
    if (q <= 0) continue
    const y = Math.round(EDGE - p.cv.height * ease.outQ(span(t, p.t0, p.t1)))
    dissolve(b, p.lit, q * (1 - 0.6 * L), p.x, y)
  }
}

/** The braziers by the plaza's edges: fire, guttering out in the quake; green fire once the castle stands. */
function drawBraziers(b: G, s: S, t: number) {
  b.drawImage(s.braziers, 0, 0)
  const warm = 1 - span(t, T_QUAKE + 0.4, T_OUT + 0.1)
  const green = span(t, 2.5, 2.7)
  for (const x of [18, 222]) {
    const top = 118
    const f = warm > 0 ? warm : green
    if (f <= 0) {
      // A last wisp of smoke over the dead coals.
      if (t > T_OUT) rect(b, x + Math.round(Math.sin(t * 5 + x)), top - 4, 1, 2, '#3a3444')
      continue
    }
    const pal = warm > 0 ? FIRE : GREEN
    b.drawImage(glow(26, warm > 0 ? '#3a2018' : '#0e2a1c', 1.1, q8(0.9 * f)), x - 26, top - 26)
    for (let dx = -5; dx <= 5; dx++) {
      const fl = 0.5 + 0.3 * Math.sin(dx * 1.3 + t * 17 + x) + 0.2 * Math.sin(dx * 0.7 - t * 11)
      const h = Math.round(f * (4 + 9 * fl) * (1 - (dx / 6) ** 2))
      for (let i = 0; i < h; i++) {
        const c = clamp(Math.floor((i / Math.max(1, h)) * 4.6 + bayer(x + dx, top - i) * 1.3), 0, 5)
        rect(b, x + dx, top - i, 1, 1, pal[c]!)
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- built once

/** Stone, lit from the moon on its left: courses of blocks, mortar, its right side falling into shade. */
function stone(g: G, x0: number, y0: number, w: number, h: number, r: Rng) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = x / Math.max(1, w - 1)
      const course = Math.floor(y / 5)
      const joint = (x + (course % 2) * 4) % 8 === 0
      let c =
        e < 0.12
          ? STONE.lit
          : e > 0.7
            ? bayer(x0 + x, y0 + y) < (e - 0.7) * 3.3
              ? STONE.dark
              : STONE.mid
            : STONE.mid
      if (y % 5 === 4 || joint) c = e > 0.85 ? STONE.ink : STONE.mortar
      rect(g, x0 + x, y0 + y, 1, 1, c)
    }
  // A few blocks darker, weathered.
  for (let i = 0; i < (w * h) / 60; i++) rect(g, x0 + r.int(0, w - 4), y0 + r.int(0, h - 4), 3, 1, STONE.dark)
}

/** A pointed roof: its left half lit, its right half in shade, a finial. */
function spire(g: G, cx: number, base: number, hw: number, h: number) {
  tri(g, cx - hw, base, cx, base, cx, base - h, '#3e3858')
  tri(g, cx, base, cx + hw, base, cx, base - h, '#16131e')
  rect(g, cx - hw - 1, base, hw * 2 + 3, 2, STONE.ink)
  rect(g, cx, base - h - 4, 1, 4, '#5a5470')
}

/** Battlements along a wall's top. */
function crenel(g: G, x0: number, y: number, w: number) {
  for (let x = x0; x < x0 + w - 2; x += 6) {
    rect(g, x, y - 3, 3, 3, STONE.mid)
    rect(g, x, y - 3, 1, 3, STONE.lit)
  }
}

/** Arrow-slit windows: dark on the stone, green on the lit copy. */
function slits(
  g: G,
  lit: G,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
  dx: number,
  dy: number,
  r: Rng,
) {
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * dx
      const y = y0 + j * dy
      rect(g, x, y + 1, 2, 5, STONE.ink)
      rect(g, x, y, 1, 1, STONE.ink)
      if (r() < 0.75) {
        rect(lit, x, y + 1, 2, 5, GREEN[3])
        rect(lit, x, y + 2, 1, 3, GREEN[1])
        rect(lit, x, y, 1, 1, GREEN[4])
      }
    }
}

/** N's Castle in pieces, each built on its own canvas, its foot on its last row. */
function castle(r: Rng): Piece[] {
  const make = (w: number, h: number) => {
    const cv = canvas(w, h)
    const lit = canvas(w, h)
    return { cv, lit, g: cv.g, l: lit.g }
  }
  // The keep: a great block, a tall central tower, a turret each side; behind the League.
  const keep = make(78, 86)
  {
    const { g, l } = keep
    // Its rows from the top: 6 more than the block's own, for the spire's room.
    g.translate(0, 6)
    l.translate(0, 6)
    stone(g, 0, 34, 78, 46, r)
    crenel(g, 0, 34, 78)
    stone(g, 2, 20, 14, 14, r)
    stone(g, 62, 20, 14, 14, r)
    spire(g, 9, 20, 9, 12)
    spire(g, 69, 20, 9, 12)
    stone(g, 26, 8, 26, 26, r)
    spire(g, 39, 8, 15, 12)
    // Buttresses down its face.
    for (const x of [18, 58]) {
      rect(g, x, 36, 3, 44, STONE.lit)
      rect(g, x + 3, 36, 1, 44, STONE.ink)
    }
    slits(g, l, 30, 16, 4, 2, 6, 8, r)
    slits(g, l, 5, 24, 2, 1, 6, 8, r)
    slits(g, l, 65, 24, 2, 1, 6, 8, r)
    slits(g, l, 4, 40, 3, 2, 6, 9, r)
    slits(g, l, 62, 40, 3, 2, 6, 9, r)
    // A great rose window over where the League stands.
    ellipse(g, 39, 40, 5, 5, STONE.ink)
    ellipse(l, 39, 40, 4, 4, GREEN[3])
    ellipse(l, 39, 40, 2, 2, GREEN[1])
    rect(l, 39, 36, 1, 9, GREEN[4])
    rect(l, 35, 40, 9, 1, GREEN[4])
    g.setTransform(1, 0, 0, 1, 0, 0)
    l.setTransform(1, 0, 0, 1, 0, 0)
  }
  // The right tower: tall and round-shouldered, a spire.
  const tc = make(24, 74)
  {
    const { g, l } = tc
    stone(g, 0, 16, 24, 58, r)
    crenel(g, 0, 16, 24)
    spire(g, 12, 16, 11, 14)
    slits(g, l, 5, 22, 3, 4, 6, 12, r)
  }
  // A squat tower on the left, short.
  const ta = make(18, 44)
  {
    const { g, l } = ta
    stone(g, 0, 12, 18, 32, r)
    spire(g, 9, 12, 8, 10)
    slits(g, l, 4, 18, 2, 2, 8, 10, r)
  }
  // The curtain walls, low, between the towers.
  const wl = make(72, 18)
  {
    const { g, l } = wl
    stone(g, 0, 3, 72, 15, r)
    crenel(g, 0, 3, 72)
    slits(g, l, 6, 6, 6, 1, 12, 8, r)
  }
  const wr = make(46, 22)
  {
    const { g, l } = wr
    stone(g, 0, 3, 46, 19, r)
    crenel(g, 0, 3, 46)
    slits(g, l, 5, 7, 4, 1, 11, 8, r)
  }
  return [
    { ...ta, x: 0, t0: 1.05, t1: 1.7 },
    { ...tc, x: 210, t0: 1.15, t1: 1.9 },
    { ...keep, x: DOOR - 39, t0: 1.35, t1: 2.3 },
    { ...wl, x: 18, t0: 1.6, t1: 2.25 },
    { ...wr, x: 170, t0: 1.6, t1: 2.25 },
  ].map(({ cv, lit, x, t0, t1 }) => ({ cv, lit, x, t0, t1 }))
}

/** The far hills under the moon, behind the plaza's edge. */
function hills(): Canvas {
  const cv = canvas(W, 24)
  const g = cv.g
  for (let x = 0; x < W; x++) {
    const h = Math.round(8 + 5 * Math.sin(x * 0.03 + 1) + 3 * Math.sin(x * 0.11))
    rect(g, x, 24 - h, 1, h, '#120e1a')
    rect(g, x, 24 - h, 1, 1, '#2a2238')
  }
  return cv
}

/** The League's hall: steps, columns, a dome, its windows and doorway lit warm (the lit copy) or dark. */
function league(lit: boolean): Canvas {
  const cv = canvas(46, 28)
  const g = cv.g
  if (lit) {
    for (const x of [8, 14, 30, 36]) rect(g, x, 14, 2, 8, '#ffd070')
    rect(g, 20, 17, 6, 9, '#ffe8a0')
    rect(g, 21, 18, 4, 8, '#fff4d0')
    rect(g, 14, 5, 18, 1, '#e8b84a')
    return cv
  }
  ellipse(g, 23, 8, 10, 7, '#3a3448')
  ellipse(g, 21, 6, 6, 4, '#4e4864')
  rect(g, 22, 0, 2, 2, '#8a7a5a')
  rect(g, 4, 10, 38, 16, '#2c283a')
  rect(g, 4, 10, 38, 1, '#4e4864')
  rect(g, 2, 9, 42, 2, '#3a3448')
  for (const x of [5, 11, 17, 27, 33, 39]) {
    rect(g, x, 11, 2, 14, '#4e4864')
    rect(g, x + 2, 11, 1, 14, '#1a1724')
  }
  for (const x of [8, 14, 30, 36]) rect(g, x, 14, 2, 8, '#0e0c14')
  rect(g, 20, 17, 6, 9, '#0e0c14')
  rect(g, 0, 25, 46, 3, '#3a3448')
  rect(g, 0, 25, 46, 1, '#5a5470')
  return cv
}

/** The plaza: flagstones in perspective, a path to the League's doorway, worn and moonlit. */
function plaza(r: Rng): Canvas {
  const h = H - EDGE
  const cv = canvas(W, h)
  const g = cv.g
  g.drawImage(dGradient(W, h, ['#2a2636', '#221e2e', '#1a1724', '#120f1a']), 0, 0)
  rect(g, 0, 0, W, 1, '#4a4460')
  // The path to the doorway, paler.
  for (let y = 0; y < h; y++) {
    const q = y / h
    const hw = Math.round(5 + q * 40)
    rect(g, DOOR + Math.round(q * 18) - hw, y, hw * 2, 1, y < 6 ? '#3a3448' : '#2e2a3c')
  }
  for (let k = -12; k <= 12; k++) line(g, DOOR + k * 9, 0, DOOR + k * 44 + 20, h, '#151220')
  for (let y = 2, d = 2; y < h; y += d, d += 1.5) rect(g, 0, Math.round(y), W, 1, '#151220')
  for (let i = 0; i < 60; i++) rect(g, r.int(0, W), r.int(4, h), r.int(1, 3), 1, '#34304a')
  return cv
}

/** The braziers: stone pillars by the plaza's edges, iron bowls on top. */
function braziers(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  for (const x of [18, 222]) {
    rect(g, x - 5, 122, 11, 34, STONE.mid)
    rect(g, x - 5, 122, 2, 34, STONE.lit)
    rect(g, x + 4, 122, 2, 34, STONE.ink)
    rect(g, x - 7, 154, 15, 6, STONE.dark)
    rect(g, x - 7, 154, 15, 1, STONE.lit)
    ellipse(g, x, 119, 9, 3, '#1a1622')
    rect(g, x - 9, 117, 19, 3, '#2a2434')
    rect(g, x - 9, 117, 19, 1, '#5a5470')
  }
  return cv
}
