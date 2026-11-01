// Geeta's entrance (docs/56), on the battle stage: the Pokémon League's rooftop court above Mesagoza at sunset, a wind
// off the plateau snapping the League's flags, the Academy on its hill and the Great Crater's rim far off, the sun
// going down behind the court's far end and its gold laid down the polished floor. The camera drifts along the court
// and Kingambit comes into the foreground, black against the sun, the edge of its blade catching it. A figure comes
// out of the sun's glare at the far end and walks the length of the court towards us, heels clicking, unhurried; she
// stops on her mark and the wind drops dead, the flags falling still (the Top Champion has arrived). She lifts the
// Tera Orb: its light shoots into the sky, crystal gathers out of the air round Glimmora, facet by facet, and bursts,
// and Glimmora hangs there terastallized under the Rock Tera Jewel, shards of crystal glittering down. The reveal.
// Cool authority, not a show: the one loud thing is the crystal.
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
  Particles,
  pattern,
  polyline,
  rect,
  rng,
  shade,
  span,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, silhouette, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema } from '../champion'
import { burstRing, dissolve, drawShards, makeShard, pulse, stepShards, tri, type Shard } from '../kit'

const REVEAL = 4.75
/** The camera's drift along the court (px), and when it settles. */
const PAN = 44
const T_PAN = 1.7
/** Kingambit's blade catching the sun. */
const T_GLINT = 1.45
/** Geeta out of the glare at the far end; her walk; her stop, and the wind dropping. */
const T_APPEAR = 1.7
const T_WALK0 = 1.85
const T_WALK1 = 3.0
const T_STILL = 3.02
/** The Tera Orb: its glint, its beam, the crystal gathering round Glimmora, the burst, the jewel. */
const T_ORB = 3.12
const T_BEAM = 3.25
const T_FORM0 = 3.3
const T_FORM1 = 3.85
const T_BURST = 3.95
const T_JEWEL = 4.02

/** The horizon; the glass parapet along the court's far end; the floor from there. */
const HZ = 62
const RAIL = 65
const EDGE = 71
/** The sun, low behind the far end. */
const SUN = { x: 173, y: 57, r: 22 }
/** Where Glimmora hangs over the court (its middle), the crystal round it. */
const GLIM = { x: 106, y: 68 }
/** Kingambit in the foreground: its feet (off the bottom of the screen) and middle, at the camera's rest. */
const KING = { x: 22, y: 194 }
const GLIMMORA = spriteKey(970, false)
const KINGAMBIT = spriteKey(983, false)

/** Tera's light: the crystal's colours, catching every hue. */
const TERA = ['#ffffff', '#a8f0ff', '#ffb8f0', '#fff6b0', '#c8a8ff', '#8ae0d0'] as const
/** The sunset: the sky from its top down to the horizon. */
const SKY = ['#1c1240', '#341850', '#5a2060', '#8a2c62', '#c8445a', '#ec6a3a', '#ffa040', '#ffd27a'] as const
/** The Top Champion's colours: her coat's indigo, the gold of the League. */
const INDIGO = '#2a2050'
const GOLD = '#f0c060'

/** A cheap repeatable hash, 0..1. */
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/** The camera's drift (px the court is still shifted left of its rest), trucking left and settling. */
const panAt = (t: number) => Math.round(PAN * (1 - ease.ioS(span(t, 0, T_PAN))))

/** The sky's colour at a row (0 top, HZ the horizon), dithered between its stops. */
function skyAt(x: number, y: number) {
  const k = clamp(y / (RAIL + 2)) * (SKY.length - 1)
  const i = Math.min(SKY.length - 2, Math.floor(k))
  return k - i > bayer(x, y) ? SKY[i + 1]! : SKY[i]!
}

/** Where she is on the court at t: feet row, scale, the bob of her step; she walks the sun's path to her mark. */
function walkAt(t: number, fy: number) {
  const u = span(t, T_WALK0, T_WALK1)
  // Even steps in depth: the far end's rows are close together, so she seems to speed up as she nears.
  const e = 1 - (1 - u) ** 1.6
  const d0 = EDGE - HZ
  const d1 = fy - HZ
  const d = 1 / lerp(1 / d0, 1 / d1, e)
  const sc = d / d1
  const step = u > 0 && u < 1 ? Math.abs(Math.sin(u * Math.PI * 7)) : 0
  return { y: Math.round(HZ + d), sc, bob: Math.round(step * 2 * sc), u }
}

type X = {
  buf: Canvas
  sky: Canvas
  far: Canvas
  floor: Canvas
  glare: Canvas
  cry: Canvas
  tmp: Canvas
  glints: [number, number, number][]
  shards: Shard[]
  wind: Particles
  motes: Particles
  /** The crystal's flying pieces, gathering round Glimmora. */
  gather: { x: number; y: number; a: number; d: number; c: string; at: number }[]
}

/** The sky: the sunset's bands, long clouds lit gold from beneath, the sun's halo; wider than the screen for the drift. */
function sky(r: Rng): Canvas {
  const cv = shade(W + PAN, RAIL + 2, (x, y) => skyAt(x, y))
  const g = cv.g
  // The sun's halo, dithered out into the sky close round it.
  const sx = SUN.x
  g.drawImage(glow(44, '#ffb050', 2.2, 0.8), sx - 44, SUN.y - 44)
  g.drawImage(glow(32, '#ffd27a', 2, 0.9), sx - 32, SUN.y - 32)
  // Long clouds: dark violet bodies, their undersides lit gold, brighter near the sun.
  for (let i = 0; i < 9; i++) {
    const y = Math.round(r.range(8, 50))
    const x = r.range(-30, W + PAN)
    const len = r.range(40, 110)
    const near = clamp(1 - Math.abs(x + len / 2 - sx) / 140)
    const body = y < 26 ? '#3a1a4e' : '#5a2252'
    for (let k = 0; k < len; k++) {
      const u = k / len
      const th = Math.round(2.5 * Math.sin(Math.PI * u) ** 0.6 + (hash(i * 31 + k) > 0.8 ? 1 : 0))
      if (th <= 0) continue
      rect(g, x + k, y - th, 1, th, body)
      rect(g, x + k, y, 1, 1, near > 0.4 ? '#ffc060' : near > 0.15 ? '#e07a4a' : '#a8405a')
      if (near > 0.6 && u > 0.2 && u < 0.8) rect(g, x + k, y - 1, 1, 1, '#ff9a4a')
    }
  }
  // The sun: a white-gold disc, a ring of gold, its lower edge already behind the far parapet.
  ellipse(g, sx, SUN.y, SUN.r + 2, SUN.r + 2, '#ffd890')
  ellipse(g, sx, SUN.y, SUN.r, SUN.r, '#fff2c0')
  ellipse(g, sx, SUN.y, SUN.r - 5, SUN.r - 5, '#fffbe8')
  return cv
}

/** The far land: the Great Crater's rim on the horizon, ranges, the Academy on its hill over Mesagoza's roofs. */
function far(r: Rng): Canvas {
  const w = W + PAN
  const cv = canvas(w, H)
  const g = cv.g
  // The crater's long rim, hazy violet; ranges darker in front of it.
  for (let x = 0; x < w; x++) {
    const rim = Math.round(HZ - 4 - 2 * Math.sin(x / 40) - (x > 150 && x < 210 ? 0 : 1))
    rect(g, x, rim, 1, RAIL + 2 - rim, x % 2 ? '#8a3a5c' : '#843858')
    const ridge = Math.round(HZ - 1 - 4 * Math.abs(Math.sin(x / 23 + 1)) * (x < 140 || x > 220 ? 1 : 0.3))
    rect(g, x, ridge, 1, RAIL + 2 - ridge, '#5a2448')
  }
  // Mesagoza's roofs below the horizon, terracotta catching the last light.
  for (let x = 0; x < w; x += r.int(3, 6)) {
    const h = r.int(1, 3)
    rect(g, x, HZ - h + 1, r.int(3, 5), h + 4, '#3a1838')
    rect(g, x, HZ - h + 1, r.int(2, 4), 1, r() < 0.5 ? '#c8603a' : '#a8483a')
    if (r() < 0.3) rect(g, x + 1, HZ + 1, 1, 1, '#ffd27a')
  }
  // The Academy on its hill: the hall, the great clock tower, the side towers, windows lit.
  const ax = 52
  const hill = (x: number) => Math.round(HZ - 6 * Math.max(0, 1 - ((x - ax) / 46) ** 2))
  for (let x = ax - 46; x < ax + 46; x++) rect(g, x, hill(x), 1, HZ - hill(x) + 2, '#3a1a3e')
  const body = '#2a1234'
  const lit = '#ffc870'
  rect(g, ax - 24, HZ - 18, 49, 12, body)
  for (let k = 0; k < 4; k++) {
    // The hall's pitched roof in steps.
    rect(g, ax - 24 + k * 2, HZ - 19 - k, 49 - k * 4, 1, body)
  }
  rect(g, ax - 5, HZ - 34, 11, 16, body)
  for (let k = 0; k < 6; k++) rect(g, ax - 5 + k, HZ - 34 - k, 11 - k * 2, 1, body)
  rect(g, ax, HZ - 42, 1, 3, body)
  ellipse(g, ax, HZ - 28, 3, 3, '#e8b060')
  ellipse(g, ax, HZ - 28, 2, 2, '#fff0c0')
  for (const sd of [-1, 1]) {
    const tx = ax + sd * 18
    rect(g, tx - 3, HZ - 26, 7, 10, body)
    for (let k = 0; k < 4; k++) rect(g, tx - 3 + k, HZ - 26 - k, 7 - k * 2, 1, body)
  }
  for (let y = HZ - 15; y < HZ - 7; y += 3)
    for (let x = ax - 22; x < ax + 23; x += 3) if (r() < 0.55) rect(g, x, y, 1, 2, lit)
  // Its west faces caught by the sun.
  rect(g, ax + 6, HZ - 33, 1, 15, '#7a3a4a')
  rect(g, ax + 25, HZ - 18, 1, 12, '#7a3a4a')
  return cv
}

/** The court: polished dark stone mirroring the sunset, tiles in perspective, the League's star inlaid in gold. */
function floor(): Canvas {
  const w = W + PAN
  const vx = SUN.x
  const cv = shade(w, H, (x, y) => {
    if (y < EDGE) return null
    // The mirror: the sky's row as far above the horizon as this is below it, darkened into the stone.
    const m = 2 * HZ - y
    const c = m >= 0 ? skyAt(x, m) : SKY[0]
    const d = y - HZ
    // Tile joints: rows at even steps of depth, columns running to the vanishing point under the sun.
    const row = (220 / d) % 1
    const col = (((x - vx) / d) * 1.4 + 100) % 1
    // A joint is one pixel wide at any depth: its share of a tile shrinks as the tiles grow toward us.
    if (row < Math.min(0.4, 220 / (d * d)) || col < Math.min(0.4, 1.4 / d)) return mix(c, '#0a0614', 0.7)
    return mix(c, '#140a1e', 0.55)
  })
  const g = cv.g
  // The court's lines, rose in the light, and the League's star inlaid in the middle.
  const cx = W / 2
  const ly = 120
  for (let x = 0; x < w; x++) rect(g, x, ly, 1, 1, '#d8a8b8')
  ellipseLine(g, cx, ly, 70, 12, '#d8a8b8')
  ellipseLine(g, cx, ly, 30, 5, GOLD)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const r0 = k % 2 ? 14 : 26
    line(g, cx, ly, cx + Math.cos(a) * r0, ly + Math.sin(a) * r0 * 0.18, GOLD)
  }
  for (const s of [-1, 1]) line(g, cx + s * 110, EDGE + 3, cx + s * 300, H + 40, '#d8a8b8')
  return cv
}

/** The sun laid down the polished floor: a path of gold from the far end toward us, narrow, fading as it nears. */
function glare(): Canvas {
  const cv = canvas(W + PAN, H)
  const g = cv.g
  for (let y = EDGE; y < H; y++) {
    const d = y - HZ
    const u = (y - EDGE) / (H - EDGE)
    const hw = 4 + d * 0.07
    rect(g, SUN.x - hw, y, hw * 2 + 1, 1, pattern(g, '#ffb860', 14 * (1 - u) ** 1.5))
    rect(g, SUN.x - hw * 0.4, y, hw * 0.8 + 1, 1, pattern(g, '#fff2c0', 16 * (1 - u) ** 2.2))
  }
  return cv
}

export const geetaChampion = championCinema<X>({
  id: 'geeta',
  reveal: REVEAL,
  seed: 970,
  aura: ['#ffffff', '#ffe8b0', GOLD, INDIGO],
  flash: '#fff6e8',
  sample: {
    trainer: '/trainers/classes/paldea/champion-geeta.png',
    name: 'Champion Geeta',
    lead: 956,
    ace: 970,
    team: 3,
  },
  // Her terastallized Glimmora and her Kingambit, whatever her team that day.
  extras: [970, 983],
  setup(st, r) {
    st.screenShakes.push([T_BURST, 0.35, 2])
    const gather: X['gather'] = []
    for (let i = 0; i < 26; i++)
      gather.push({
        x: r.range(-60, W + 60),
        y: r.range(-40, 130),
        a: r() * Math.PI * 2,
        d: r.range(0, 30),
        c: r.pick(TERA),
        at: lerp(T_FORM0 - 0.05, T_FORM1 - 0.15, i / 26) + r.range(-0.05, 0.05),
      })
    return {
      buf: canvas(W, H),
      sky: sky(rng(9701)),
      far: far(rng(9702)),
      floor: floor(),
      glare: glare(),
      cry: canvas(W, H),
      tmp: canvas(W, H),
      glints: Array.from(
        { length: 14 },
        () => [r.range(-30, 30), r.range(-40, 40), r()] as [number, number, number],
      ),
      shards: [],
      wind: new Particles(),
      motes: new Particles(),
      gather,
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.wind.update(dt)
    s.motes.update(dt)
    stepShards(s.shards, dt, { g: 40, drag: 1.4 })
    // The wind off the plateau: streaks of it racing across, dust in it; it drops dead when she stops.
    const gust = 1 - span(t, T_STILL, T_STILL + 0.12)
    if (gust > 0 && r() < 0.8)
      s.wind.add({
        x: -10,
        y: r.range(4, H - 4),
        vx: r.range(260, 380),
        vy: r.range(-10, 10),
        life: 1.2,
        size: 1,
        shape: 'streak',
        trail: r.range(0.02, 0.05),
        colors: [r() < 0.5 ? '#ffe0b0' : '#e8a8a0'],
      })
    if (gust > 0 && r() < 0.5)
      s.motes.add({
        x: -4,
        y: r.range(40, H),
        vx: r.range(120, 200),
        vy: r.range(-20, 10),
        life: 2,
        size: 1,
        shape: 'px',
        colors: ['#ffd8a0', '#c87a6a'],
      })
    // When it drops, what it carried drifts down.
    if (within(t, T_STILL, T_STILL + dt))
      for (const p of s.wind.list) {
        p.vx *= 0.1
        p.life = Math.min(p.life, p.age + 0.15)
      }
    if (t > T_STILL)
      for (const p of s.motes.list) {
        p.vx *= 0.9
        p.vy = Math.max(p.vy, 8)
      }
    // The burst: the crystal breaking into shards of every hue, flying out and glittering down.
    if (within(t, T_BURST, T_BURST + dt)) {
      for (let i = 0; i < 46; i++) {
        const c = r.pick(TERA)
        s.shards.push(
          makeShard(r, GLIM.x + r.range(-20, 20), GLIM.y + r.range(-30, 30), 170, c, '#ffffff', 0.4),
        )
      }
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(50, 160)
        s.fx.add({
          x: GLIM.x,
          y: GLIM.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 2.2,
          life: r.range(0.5, 1),
          size: r.int(1, 2),
          shape: 'star',
          colors: [r.pick(TERA), '#ffffff'],
        })
      }
    }
    // Glitter round the terastallized Glimmora, and Tera light motes rising off it.
    if (t > T_BURST && r() < 0.5)
      s.fx.add({
        x: GLIM.x + r.range(-26, 26),
        y: GLIM.y + r.range(-30, 26),
        vy: -r.range(6, 16),
        life: r.range(0.4, 0.8),
        size: r.int(1, 2),
        shape: 'star',
        colors: [r.pick(TERA), '#ffffff'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const F = s.L.foe
    const fy = F.y + 2
    const p = panAt(t)
    // The drift: sky barely, the far land a little, the court at the camera's own speed (the sun's path on the
    // floor goes with the sun).
    b.drawImage(s.sky, -Math.round(p * 0.2), 0)
    b.drawImage(s.far, -Math.round(p * 0.5), 0)
    drawParapet(b, p, t)
    b.drawImage(s.floor, -p, 0)
    b.drawImage(s.glare, -Math.round(p * 0.2), 0)
    drawReflection(b, s, t, fy)
    drawTera(b, s, t)
    drawShards(b, s.shards)
    drawKing(b, t, p)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#140a1e')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_APPEAR) return
    const F = s.L.foe
    const fy = F.y + 2
    const w = walkAt(t, fy)
    const sz = spriteSize(s.p.trainer)
    // A figure in the glare: dark against the sun, rimmed in its gold; out of it, the dusk's rose on her edges.
    const appear = span(t, T_APPEAR, T_WALK0 + 0.1)
    const inSun = clamp(1 - Math.abs(F.x - SUN.x) / SUN.r) * clamp(1 - (w.y - EDGE) / 14)
    const tb = s.tmp.g
    tb.clearRect(0, 0, W, H)
    // Rim light: the sun's gold on her right; on her left the dusk's rose, then the crystal's light.
    const y = w.y - w.bob
    const o = { sx: w.sc, sy: w.sc }
    const tera = t > T_FORM0 ? TERA[(Math.floor(t * 10) % 5) + 1]! : '#c86a8a'
    drawSprite(tb, s.p.trainer, F.x + 1, y - 1, { ...o, sil: inSun > 0.3 ? '#fff2c0' : '#ffc870' })
    drawSprite(tb, s.p.trainer, F.x - 1, y, { ...o, sil: tera })
    drawSprite(tb, s.p.trainer, F.x, y + (w.sc > 0.9 ? 1 : 0), { ...o, sil: '#ffc870' })
    drawSprite(tb, s.p.trainer, F.x, y, { ...o, sil: '#1a1028' })
    // The Tera Orb in her hand, gathering its light.
    const orb = span(t, T_ORB, T_ORB + 0.2) * (1 - span(t, T_BURST, T_BURST + 0.3))
    if (orb > 0 && w.u >= 1) {
      const h = handAt(F.x, fy, sz)
      tb.drawImage(glow(10, TERA[Math.floor(t * 12) % 6]!, 1.5, q8(orb)), h.x - 10, h.y - 10)
      ellipse(tb, h.x, h.y, 2, 2, '#ffffff')
      rect(tb, h.x - 1, h.y - 1, 1, 1, TERA[2])
    }
    dissolve(g, s.tmp, appear)
  },
  front(g, s, t, k) {
    if (k <= 0) return
    // The wind's streaks over everything, dust in them.
    s.wind.draw(g)
    s.motes.draw(g)
    if (within(t, T_BURST, T_BURST + 0.1)) screenFlash(g, '#f0e8ff', 0.4)
  },
  sounds: [
    [0.05, () => hiss(2.8, { freq: 500, slide: 400, q: 0.6, vol: 0.05 })],
    [0.6, () => hiss(0.25, { freq: 1600, q: 2, vol: 0.02 })],
    [1.1, () => hiss(0.25, { freq: 1500, q: 2, vol: 0.02 })],
    [1.2, () => (tone(46, 0.4, { type: 'sine', vol: 0.12 }), hiss(0.2, { freq: 300, vol: 0.05 }))],
    [T_GLINT, () => tone(2093, 0.4, { type: 'triangle', vol: 0.03 })],
    [1.75, () => hiss(1.3, { freq: 700, slide: 300, q: 0.6, vol: 0.05 })],
    // Her heels on the stone, unhurried.
    ...Array.from(
      { length: 7 },
      (_, i) =>
        [
          T_WALK0 + ((i + 0.5) / 7) * (T_WALK1 - T_WALK0),
          () => tone(1250 - i * 30, 0.03, { type: 'square', vol: 0.012 + i * 0.002 }),
        ] as const,
    ),
    [
      T_ORB,
      () => (tone(1568, 0.5, { type: 'triangle', vol: 0.035 }), tone(2349, 0.5, { type: 'sine', vol: 0.02 })),
    ],
    [T_BEAM, () => hiss(0.5, { freq: 2600, slide: 2000, vol: 0.04 })],
    ...Array.from(
      { length: 6 },
      (_, i) =>
        [
          T_FORM0 + i * 0.09,
          () => tone([1047, 1175, 1319, 1568, 1760, 2093][i]!, 0.25, { type: 'triangle', vol: 0.03 }),
        ] as const,
    ),
    [
      T_BURST,
      () => (
        fxSound('legend.shatter'),
        fxSound('mega.burst'),
        tone(65, 0.5, { type: 'sine', vol: 0.12, slide: -20 })
      ),
    ],
    [
      T_JEWEL,
      () =>
        [2093, 2637, 3136].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.025, at: i * 0.06 })),
    ],
    [
      REVEAL,
      () => (
        tone(392, 0.7, { type: 'triangle', vol: 0.05 }),
        tone(587, 0.7, { type: 'triangle', vol: 0.04 }),
        tone(784, 0.7, { type: 'sine', vol: 0.03 })
      ),
    ],
  ],
})

/** Her hand, where the picture holds the ball (a fraction of its box). */
const handAt = (x: number, fy: number, sz: { w: number; h: number }) => ({
  x: Math.round(x - sz.w / 2 + sz.w * 0.13),
  y: Math.round(fy - sz.h + sz.h * 0.25),
})

/** The glass parapet along the far end: the city seen through it, its top rail, the League's flags on their poles. */
function drawParapet(g: G, p: number, t: number) {
  // Dark glass, the sun glowing through it, a streak of reflection on each panel, its posts and its rail.
  const sx = SUN.x - Math.round(p * 0.2)
  rect(g, 0, RAIL, W, EDGE - RAIL, '#2e1838')
  rect(g, sx - 16, RAIL, 33, EDGE - RAIL - 1, '#8a4a3e')
  rect(g, sx - 10, RAIL, 21, EDGE - RAIL - 2, '#c8784a')
  for (let x = -p; x < W; x += 16) {
    if (x < -16) continue
    line(g, x + 5, EDGE - 2, x + 9, RAIL, '#4a2848')
    rect(g, x, RAIL, 1, EDGE - RAIL, '#1a0e24')
  }
  rect(g, 0, RAIL - 1, W, 1, '#1e1028')
  rect(g, 0, RAIL - 2, W, 1, '#a8604a')
  rect(g, sx - 26, RAIL - 2, 53, 1, '#ffd090')
  rect(g, 0, EDGE - 1, W, 1, '#1a0e24')
  // The flags: a pole at each far corner, the banner snapping in the wind until it drops, then hanging still.
  const still = ease.outQ(span(t, T_STILL, T_STILL + 0.5))
  for (const [px, c0, c1] of [
    [26, INDIGO, GOLD],
    [222, '#8a2a48', GOLD],
  ] as const) {
    const x = px - p
    rect(g, x, RAIL - 30, 1, 30, '#2a1636')
    rect(g, x, RAIL - 31, 1, 1, GOLD)
    for (let k = 0; k < 14; k++) {
      // Out in the wind, rippling; once it drops, hanging down the pole.
      const wave = Math.round(Math.sin(t * 22 - k * 0.8) * 1.5 * (k / 14))
      const fx = Math.round(lerp(x + 1 + k, x + 1 + Math.round(k * 0.15), still))
      const fy = Math.round(lerp(RAIL - 29 + wave, RAIL - 29 + k * 0.9, still))
      const len = Math.round(lerp(8, 3, still))
      rect(g, fx, fy, still > 0.5 ? len : 1, still > 0.5 ? 1 : len, k % 5 === 2 ? c1 : c0)
    }
  }
}

/** Her reflection in the polished floor: her figure upside down under her feet, faint, in step with her. */
function drawReflection(
  g: G,
  s: X & { L: { foe: { x: number } }; p: { trainer: string } },
  t: number,
  fy: number,
) {
  if (t < T_APPEAR) return
  const w = t < REVEAL ? walkAt(t, fy) : { y: fy, sc: 1, bob: 0 }
  const tb = s.tmp.g
  tb.clearRect(0, 0, W, H)
  tb.save()
  tb.translate(0, 2 * w.y)
  tb.scale(1, -1)
  drawSprite(tb, s.p.trainer, s.L.foe.x, w.y - w.bob, {
    sx: w.sc,
    sy: w.sc * 0.7,
    sil: t < REVEAL ? '#120a1c' : undefined,
  })
  tb.restore()
  const fade = span(t, T_APPEAR, T_WALK0 + 0.1) * 0.3
  dissolve(g, s.tmp, fade)
}

/** Kingambit in the foreground, black against the sun, its rim lit gold; the glint on its blade, its eye. */
function drawKing(g: G, t: number, p: number) {
  const x = KING.x - Math.round(p * 1.9)
  const sz = spriteSize(KINGAMBIT)
  const top = KING.y - sz.h * 2
  // Turned toward the court, watching: the sun behind it on the right lights its edges there, its blade crest
  // stands black against the sky, its armour just made out in the dusk.
  drawSprite(g, KINGAMBIT, x + 2, KING.y - 1, { sx: 2, sy: 2, sil: '#ffc870', flip: true })
  drawSprite(g, KINGAMBIT, x, KING.y, { sx: 2, sy: 2, tint: { color: '#140a1c', a: 0.84 }, flip: true })
  // The blade's tip glinting as the camera passes the sun; its eye lighting once Geeta has stopped.
  const gl = pulse(t, T_GLINT, T_GLINT + 0.35)
  if (gl > 0.05) {
    const gx = x + Math.round(sz.w * 0.9)
    const gy = top + 4
    const n = Math.round(3 + 8 * gl)
    rect(g, gx - n, gy, n * 2 + 1, 1, '#fff6d8')
    rect(g, gx, gy - n, 1, n * 2 + 1, '#fff6d8')
    rect(g, gx - 1, gy - 1, 3, 3, '#ffffff')
    g.drawImage(glow(8, '#ffe8b0', 1.5, q8(gl)), gx - 8, gy - 8)
  }
  const eyes = span(t, T_STILL + 0.05, T_STILL + 0.15) * (1 - span(t, REVEAL + 0.3, REVEAL + 0.6))
  if (eyes > 0) {
    const ex = x + Math.round(sz.w * 0.12)
    const ey = top + Math.round(sz.h * 2 * 0.47)
    g.drawImage(glow(5, '#ffe04a', 1.5, q8(0.6 * eyes)), ex - 5, ey - 5)
    rect(g, ex - 1, ey, 3, 1, '#ffe04a')
    rect(g, ex, ey, 1, 1, '#ffffff')
  }
}

/** Terastallization: the orb's beam into the sky, the crystal gathering round Glimmora, its burst, the jewel. */
function drawTera(g: G, s: X & { L: { foe: { x: number; y: number } }; p: { trainer: string } }, t: number) {
  if (t < T_BEAM) return
  const F = s.L.foe
  const fy = F.y + 2
  const sz = spriteSize(s.p.trainer)
  const h = handAt(F.x, fy, sz)
  // The beam: a prismatic line from her hand up to where the crystal will be, flickering through Tera's hues.
  const bq = span(t, T_BEAM, T_BEAM + 0.12) * (1 - span(t, T_FORM1, T_BURST))
  if (bq > 0) {
    const ex = lerp(h.x, GLIM.x, bq)
    const ey = lerp(h.y, GLIM.y, bq)
    line(g, h.x, h.y + 1, ex, ey + 1, TERA[(Math.floor(t * 20) + 2) % 6]!, 3)
    line(g, h.x, h.y, ex, ey, '#ffffff')
  }
  const form = span(t, T_FORM0, T_FORM1)
  const burst = t >= T_BURST
  // The light gathering: a glow swelling where the crystal forms.
  if (t < T_BURST + 0.4) {
    const gl = form * (1 - span(t, T_BURST, T_BURST + 0.4))
    g.drawImage(glow(50, '#c8a8ff', 1.3, q8(0.6 * gl)), GLIM.x - 50, GLIM.y - 50)
  }
  // Glimmora: its shape inside the crystal, then itself, terastallized.
  const gs = spriteSize(GLIMMORA)
  const bob = burst ? Math.round(Math.sin((t - T_BURST) * 3) * 2) : 0
  const feet = GLIM.y + Math.round(gs.h / 2) + bob
  if (burst) {
    // The League's star in the floor answers: its points flaring in Tera's hues, out from its heart.
    const star = span(t, T_BURST, T_BURST + 0.25) * (1 - span(t, REVEAL + 0.2, REVEAL + 1))
    if (star > 0) {
      const cx = W / 2
      const ly = 120
      g.drawImage(glow(34, '#8a6ab8', 1.6, q8(0.7 * star)), cx - 34, ly - 34)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r0 = (i % 2 ? 14 : 26) * (0.4 + 0.6 * star)
        line(
          g,
          cx,
          ly,
          cx + Math.cos(a) * r0,
          ly + Math.sin(a) * r0 * 0.18,
          TERA[(i + Math.floor(t * 12)) % 6]!,
        )
      }
      ellipseLine(g, cx, ly, Math.round(30 * star), Math.max(1, Math.round(5 * star)), '#ffffff')
    }
    const settle = span(t, T_BURST, T_BURST + 0.3)
    drawSprite(g, GLIMMORA, GLIM.x, feet, {
      flash: 1 - settle,
      outline: TERA[(Math.floor(t * 10) % 5) + 1],
    })
    sheen(g, s, t, GLIM.x, feet)
    jewel(g, GLIM.x, GLIM.y - Math.round(gs.h / 2) - 4 + bob, span(t, T_JEWEL, T_JEWEL + 0.25), t)
    ;[TERA[0], TERA[2]].forEach((c, i) =>
      burstRing(g, GLIM.x, GLIM.y, span(t, T_BURST + i * 0.12, T_BURST + i * 0.12 + 0.55), 96, 2, c),
    )
  }
  // The pieces flying in out of the air and the crystal building up, facet by facet.
  if (!burst && t >= T_FORM0 - 0.1) {
    for (const pc of s.gather) {
      const q = span(t, pc.at - 0.25, pc.at)
      if (q <= 0 || q >= 1) continue
      const e = ease.inQ(q)
      const x = lerp(pc.x, GLIM.x + Math.cos(pc.a) * pc.d * 0.5, e)
      const y = lerp(pc.y, GLIM.y + Math.sin(pc.a) * pc.d, e)
      tri(g, x - 2, y + 2, x + 2, y + 1, x, y - 3, pc.c)
      rect(g, x, y - 2, 1, 1, '#ffffff')
    }
    crystal(g, s, GLIM.x, GLIM.y, form, t)
  }
}

/** The crystal round Glimmora: a double-pointed shaft of Tera crystal growing up out of the air, lit face and shade face. */
function crystal(g: G, s: X, cx: number, cy: number, k: number, t: number) {
  if (k <= 0) return
  type P = [number, number]
  const top: P = [cx, cy - 46]
  const shL: P = [cx - 25, cy - 21]
  const shC: P = [cx + 6, cy - 16]
  const shR: P = [cx + 23, cy - 22]
  const bL: P = [cx - 25, cy + 21]
  const bC: P = [cx + 6, cy + 26]
  const bR: P = [cx + 23, cy + 20]
  const bot: P = [cx + 1, cy + 44]
  const c = s.cry.g
  c.clearRect(0, 0, W, H)
  const face = (a: P, b: P, d: P, col: string) => tri(c, a[0], a[1], b[0], b[1], d[0], d[1], col)
  // The lit faces on the left, the shaded ones on the right, the points brightest.
  face(top, shL, shC, '#eafcff')
  face(top, shC, shR, '#c8b8ff')
  face(shL, shC, bC, '#a8eeff')
  face(shL, bC, bL, '#a8eeff')
  face(shC, shR, bR, '#e0a8f0')
  face(shC, bR, bC, '#e0a8f0')
  face(bL, bC, bot, '#88cce8')
  face(bC, bR, bot, '#a888d8')
  // Streaks down its faces, its edges white, the ridge down its middle brightest.
  for (const dx of [-18, -9, 14])
    line(c, cx + dx, cy - 18, cx + dx + 1, cy + 22, dx < 0 ? '#d8f8ff' : '#f0c8f8')
  c.globalCompositeOperation = 'source-atop'
  // A prism's gleam sliding up across it: a white band with Tera's hues fanned out along its edge.
  const gy = Math.round(lerp(cy + 80, cy - 90, (t * 1.4) % 1))
  for (let i = 0; i < 7; i++) {
    const col = i < 2 ? '#ffffff' : TERA[i - 1]!
    for (let x = cx - 30; x <= cx + 30; x++) rect(c, x, gy + i + Math.round((x - cx) * 0.5), 1, 1, col)
  }
  c.globalCompositeOperation = 'source-over'
  polyline(c, [top, shL, bL, bot, bR, shR, top], '#ffffff')
  polyline(c, [shL, shC, shR], '#ffffff')
  line(c, shC[0], shC[1], bC[0], bC[1], '#ffffff')
  polyline(c, [bL, bC, bR], '#f0f0ff')
  // It grows up out of the air from its lower point: the rows under the growing edge, a line of light along it.
  const fill = Math.round(lerp(bot[1] + 1, top[1] - 1, ease.outQ(k)))
  if (k < 1) {
    c.globalCompositeOperation = 'source-atop'
    rect(c, cx - 30, fill, 61, 1, '#ffffff')
    c.globalCompositeOperation = 'source-over'
  }
  g.drawImage(s.cry, 0, fill, W, H - fill, 0, fill, W, H - fill)
  // A glint running up its edge once it is whole.
  if (k >= 1) {
    const gy = Math.round(lerp(bL[1], shL[1], (t * 3) % 1))
    rect(g, shL[0] - 1, gy, 3, 1, '#ffffff')
    rect(g, shL[0], gy - 1, 1, 3, '#ffffff')
  }
}

/** The terastallized look on Glimmora: its body crossed by a crystal's facet lines, a gleam sweeping it. */
function sheen(g: G, s: X, t: number, x: number, feet: number) {
  const sil = silhouette(GLIMMORA, '#ffffff')
  if (!sil) return
  const tb = s.tmp.g
  tb.clearRect(0, 0, W, H)
  const x0 = Math.round(x - sil.width / 2)
  const y0 = feet - sil.height
  // Facet lines in Tera's colours over the body, a gleam band crossing it now and then.
  for (let i = 0; i < 5; i++) {
    const ax = x0 + ((i * 13 + 5) % sil.width)
    line(tb, ax, y0, ax - 14, feet, TERA[(i % 5) + 1]!)
  }
  const gp = ((t - T_BURST) * 0.9) % 1
  const gx = x0 - 20 + gp * (sil.width + 40)
  for (let y = y0; y < feet; y++) rect(tb, gx + (feet - y) * 0.4, y, 3, 1, '#ffffff')
  tb.globalCompositeOperation = 'destination-in'
  tb.drawImage(sil, x0, y0)
  tb.globalCompositeOperation = 'source-over'
  dissolve(g, s.tmp, 0.5)
}

/** The Rock Tera Jewel: a crown of amber crystal prisms over its head, each snapping into place in turn. */
function jewel(g: G, cx: number, by: number, k: number, t: number) {
  if (k <= 0) return
  // Each prism: offset from the middle, height, half-width.
  const prisms = [
    [0, 22, 4],
    [-9, 15, 3],
    [9, 17, 3],
    [-17, 9, 2],
    [16, 11, 2],
  ] as const
  prisms.forEach(([dx, ht, hw], i) => {
    const q = ease.outBack(span(k, i * 0.12, i * 0.12 + 0.4), 2)
    if (q <= 0) return
    const h = Math.round(ht * q)
    const x = cx + dx
    const tip = by - h
    // Light left face, dark right face, a pointed tip; a white edge and a glint.
    rect(g, x - hw, tip + hw, hw, h - hw, '#f0c890')
    rect(g, x, tip + hw, hw + 1, h - hw, '#a8703a')
    tri(g, x - hw, tip + hw, x + hw + 1, tip + hw, x + 0.5, tip - 1, '#ffe0b0')
    rect(g, x - hw, tip + hw, 1, h - hw, '#fff2d0')
    rect(g, x - hw, by, hw * 2 + 1, 1, '#7a4a20')
    if ((Math.floor(t * 8) + i) % 5 === 0) rect(g, x - 1, tip + 2, 1, 1, '#ffffff')
  })
  // Its halo, catching Tera's hues.
  ellipseLine(g, cx, by + 1, 21, 3, TERA[(Math.floor(t * 8) % 5) + 1]!)
}
