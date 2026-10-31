// Leon's entrance (docs/54), on the battle stage: Wyndon Stadium on the night of the Champion Cup final. The camera
// comes down out of the sky, searchlights sweeping it, into the bowl: a packed house in the dark, thousands of lights
// twinkling in the stands, Wyndon's great wheel turning beyond the rim. The floodlights bang on bank by bank and the
// LED ring runs gold. A rumble: behind the far stand a colossal shape rises, black, its outline burning, and the
// camera tilts up and up with it: Gigantamax Charizard, towering over the stadium. Its fire catches, it roars, and the
// heat rolls over the bowl and sets the roof's edge alight. Back down to the pitch as it leans in over the rim to
// watch, and the showman's entrance: a hatch opens in the grass, a column of light and smoke, pyro jets firing in
// pairs, and Leon rises out of the floor on the lift; the whole stadium answers with his pose, arms up in a wave from
// stand to stand, stamping in time, and the reveal fires the confetti cannons. No Dynamax red (the Galar legends have
// it): the show is the stadium's, and Charizard's fire.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bayer,
  canvas,
  clamp,
  ease,
  ellipse,
  ellipseLine,
  glow,
  icon,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  rng,
  shade,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../../pixel'
import { drawSprite, spriteFrame, spriteKey, spriteSize } from '../../../sprites'
import { H, screenFlash, screenShake, W, within } from '../../../timeline'
import { championCinema } from '../champion'
import { burstRing, dGradient, dissolve, pulse } from '../kit'

const REVEAL = 4.8
/** How far above its resting place the camera starts (px): the sky over the stadium. */
const TILT = 70
const T_TILT0 = 0.1
const T_TILT1 = 1.1
/** The floodlight banks banging on, one after another. */
const T_BANKS = [1.2, 1.36, 1.52, 1.68] as const
const T_RUMBLE = 1.82
/** Gigantamax Charizard rising behind the far stand, the camera tilting up with it; its fire catching; its roar. */
const T_RISE = 1.9
const T_TALL = 2.6
const UP = 105
const T_LOOK0 = 1.95
const T_LOOK1 = 2.55
const T_IGNITE = 2.38
const T_ROAR = 2.75
/** Back down to the pitch, as it leans in over the rim to watch. */
const T_DOWN0 = 3.05
const T_DOWN1 = 3.5
/** The lift: the hatch opens, the pyro fires in pairs, Leon rises. */
const T_HATCH = 3.55
const T_PYRO = [3.62, 3.8] as const
const T_UP0 = 3.65
const T_UP1 = 4.25
/** The crowd's answer: the pose in a wave from left to right, then everyone, stamping. */
const T_WAVE = 4.08
const T_STAMPS = [4.2, 4.4, 4.6] as const

/** The eye line: the stand's rows open out above and below it toward the sides, a bowl round us. */
const HZ = 62
const CX = W / 2
/** The far stand at its middle (un-bent rows): the roof's edge, the upper tier, the LED ring, the lower tier, the wall. */
const RIM = 44
const ROOF1 = 49
const RING0 = 63
const RING1 = 66
const WALL0 = 79
const WALL1 = 85
/** The halfway line and the centre circle on the pitch. */
const MID = 118
/** How much sky the scene keeps above the stadium (px): enough for the camera's tilts. */
const SKY = 180
/** Where the giant stands behind the far stand (its middle), how tall it stands, where it leans in to. */
const GIANT_X = 90
const TALL_TOP = -100
const LEAN_TOP = 3

const FIRE = ['#fff6c8', '#ffe08a', '#ffbe2e', '#ff8a1e', '#e0501e', '#a8281a', '#5a120c'] as const
const CONFETTI = ['#ffd23a', '#ffffff', '#c8283a', '#3a6ad8', '#ffbe2e', '#e0e0f0'] as const
/** The champion's colours: his cape's burgundy, its gold trim. */
const BURGUNDY = '#7a1a2a'
const GOLD = '#e8b63a'

/** How much nearer the stand is at column x (1 in the middle): the bowl's curve. */
const bowl = (x: number) => 1 + 0.35 * ((x - CX) / CX) ** 2
/** Where an un-bent row y of the far stand lands at column x. */
const bend = (x: number, y: number) => Math.round(HZ + (y - HZ) * bowl(x))
/** The un-bent row of a screen row at column x. */
const unbend = (x: number, y: number) => HZ + (y - HZ) / bowl(x)

/** The camera: down out of the sky, up with the giant, back down to the pitch (px the world moves down). */
const camAt = (t: number) =>
  Math.round(
    TILT * (1 - ease.ioS(span(t, T_TILT0, T_TILT1))) +
      UP * (ease.ioS(span(t, T_LOOK0, T_LOOK1)) - ease.ioS(span(t, T_DOWN0, T_DOWN1))),
  )

/** A cheap repeatable hash, 0..1. */
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** A flicker 0..1 for a column of fire at x: two waves and a jitter that changes a few times a second. */
function flick(x: number, t: number) {
  const f = Math.floor(t * 24)
  const j = hash(x * 7.13 + f * 1.31)
  return clamp(0.5 + 0.28 * Math.sin(x * 0.7 + t * 11) + 0.18 * Math.sin(x * 1.9 - t * 17) + (j - 0.5) * 0.3)
}

/** A tongue of fire standing on (x, y), h tall: white-gold at its root, red at its tip, dithered between. */
function tongue(g: G, x: number, y: number, h: number, hot = 0) {
  for (let i = 0; i < h; i++) {
    const c = clamp(Math.floor((i / h) * 4.6 + bayer(x, y - i) * 1.3) + hot, 0, 6)
    rect(g, x, y - i, 1, 1, FIRE[c]!)
  }
}

/** A glow's strength in eighths: `glow` caches each strength it is asked for. */
const q8 = (v: number) => Math.round(clamp(v) * 8) / 8

/**
 * A searchlight's beam from (x, y) at angle `a` (0 straight up), widening over its length, filled row by row (a canvas
 * path would antialias): near solid at its lamp, its dither thinning out up the sky, a brighter core.
 */
function beam(g: G, x: number, y: number, a: number, len: number, k: number) {
  const slope = Math.tan(a)
  const y1 = Math.round(y - Math.cos(a) * len)
  for (let yy = y1; yy <= y; yy++) {
    const u = (y - yy) / (y - y1)
    const cx = x + slope * (y - yy)
    const hw = lerp(1.5, 15, u)
    const fade = k * (1 - u) ** 1.3
    rect(g, cx - hw, yy, hw * 2 + 1, 1, pattern(g, '#4a5a9a', 1 + 9 * fade))
    rect(g, cx - hw * 0.3, yy, hw * 0.6 + 1, 1, pattern(g, '#9aaae0', 2 + 12 * fade))
  }
}

/** The searchlights behind the stands: where they stand on the rim, how they sweep. */
const LIGHTS = [
  [16, -0.45, 0.9, 0],
  [74, -0.15, 1.3, 2],
  [166, 0.2, 1.1, 4],
  [228, 0.5, 0.8, 1],
] as const
const lightAngle = (i: number, t: number) => {
  const [, a0, w, ph] = LIGHTS[i]!
  return a0 + 0.34 * Math.sin(t * w + ph)
}

/** The floodlight banks under the roof's edge: their middles. */
const BANKS = [36, 92, 148, 204] as const

type Fan = {
  x: number
  /** Its head's row. */
  y: number
  skin: string
  shirt: string
  /** It holds up a light (a phone, a glow stick), and when it flickers. */
  light: number
  /** It waves a flag in the champion's colours. */
  flag: boolean
}

type X = {
  buf: Canvas
  sky: Canvas
  stand: Canvas
  pitch: Canvas
  zard: Canvas
  rise: Canvas
  fogBuf: Canvas
  fans: Fan[]
  /** The Gigantamax's sprite: its own form when it has loaded, else the champion's ace. */
  giant: string
  fire: Particles
  fog: Particles
  sparks: Particles
}

/** The sky over Wyndon: night, warmer and lighter down to the stadium's glow; stars; the city's towers. */
function sky(r: Rng): Canvas {
  const h = SKY + 70
  const cv = canvas(W, h)
  const g = cv.g
  g.drawImage(dGradient(W, h, ['#03040c', '#05071a', '#080c24', '#0e1432', '#161e46', '#222a5a']), 0, 0)
  for (let i = 0; i < 90; i++) {
    const y = r.range(0, SKY - 20)
    rect(g, r.range(0, W), y, 1, 1, r() < 0.15 ? '#e8e8ff' : y < SKY * 0.6 ? '#5a5a8a' : '#363a68')
  }
  // Wyndon beyond the rim: towers with their lit windows, a red light on each mast.
  const towers = [
    [190, 24, 8, '#121634'],
    [200, 6, 8, '#0e122c'],
    [210, 16, 12, '#121634'],
    [230, 2, 11, '#0e122c'],
    [44, 28, 8, '#121634'],
    [-2, 12, 8, '#0e122c'],
  ] as const
  for (const [x, top, w, c] of towers) {
    const y0 = SKY + top
    rect(g, x, y0, w, h - y0, c)
    rect(g, x, y0, 1, h - y0, '#1c2246')
    for (let yy = y0 + 2; yy < h; yy += 3)
      for (let xx = x + 2; xx < x + w - 1; xx += 2) if (r() < 0.3) rect(g, xx, yy, 1, 1, '#a8803a')
    rect(g, x + (w >> 1), y0 - 3, 1, 3, c)
    rect(g, x + (w >> 1), y0 - 4, 1, 1, '#e0403a')
  }
  return cv
}

/** Wyndon's great wheel, turning: its rim of lights, spokes, the legs it stands on. */
function wheel(g: G, cx: number, cy: number, R: number, t: number, lit: boolean) {
  line(g, cx, cy, cx - 11, cy + R + 14, '#1a1e40', 2)
  line(g, cx, cy, cx + 11, cy + R + 14, '#1a1e40', 2)
  ellipseLine(g, cx, cy, R, R, '#262a50')
  ellipseLine(g, cx, cy, R - 2, R - 2, '#1a1e3e')
  const n = 16
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.15
    const x = Math.round(cx + Math.cos(a) * R)
    const y = Math.round(cy + Math.sin(a) * R)
    line(g, cx, cy, x, y, '#1a1e3e')
    rect(g, x - 1, y, 3, 2, '#2a2e56')
    const on = lit && (i + Math.floor(t * 6)) % 4 !== 0
    rect(g, x, y, 1, 1, on ? (i % 2 ? '#ffe08a' : '#8ad8ff') : '#6a6ea8')
  }
  rect(g, cx - 1, cy - 1, 3, 3, '#3a3e66')
}

/** The far stand, bent round the bowl: the roof's steel edge, two tiers of seats, the ring between, the wall's boards. */
function stand(): Canvas {
  return shade(W, H, (x, y) => {
    const u = unbend(x, y)
    if (u < RIM || u >= WALL1) return null
    if (u < RIM + 1) return '#3a3c62'
    if (u < ROOF1 - 1) {
      // The truss: crossed braces along the roof's edge.
      const a = (((x - u * 2.2) % 9) + 9) % 9
      const b = (((x + u * 2.2) % 9) + 9) % 9
      return a < 1.1 || b < 1.1 ? '#24264c' : '#121430'
    }
    if (u < ROOF1) return '#2a2c50'
    if (u >= RING0 && u < RING1) return u < RING0 + 0.8 ? '#24203c' : '#08080e'
    if (u >= WALL0) return u < WALL0 + 1 ? '#1a1828' : '#06060c'
    // The seats: rows of three, their backs a shade lighter; stairs down the stand.
    if (x % 37 === 5 || x % 37 === 6) return Math.floor(u) % 2 ? '#2a2640' : '#221e36'
    const row = Math.floor(u - (u < RING0 ? ROOF1 : RING1)) % 3
    return row === 2 ? '#1c1830' : '#120e22'
  })
}

/** The crowd: a fan in every seat but a few, in team colours, many holding up lights. Drawn into the stand. */
function crowd(g: G, r: Rng): Fan[] {
  const fans: Fan[] = []
  const skins = ['#e0b090', '#c8906a', '#8a5a3a', '#5a3a26', '#f0c8a0']
  const shirts = [BURGUNDY, '#a02838', GOLD, '#2a3a7a', '#d8d8e0', '#2a6a6a', '#c8601e', '#3a2a5a']
  const rows: number[] = []
  for (let y = ROOF1 + 1; y < RING0 - 1; y += 3) rows.push(y)
  for (let y = RING1 + 1; y < WALL0 - 1; y += 3) rows.push(y)
  for (const ry of rows)
    for (let x = (ry % 2) + 1; x < W - 1; x += 3) {
      if (x % 37 >= 4 && x % 37 <= 7) continue
      if (r() < 0.06) continue
      const y = bend(x, ry)
      const f: Fan = {
        x,
        y,
        skin: r.pick(skins),
        shirt: r.pick(shirts),
        light: r() < 0.38 ? r() : -1,
        flag: r() < 0.05,
      }
      fans.push(f)
      rect(g, x, y, 2, 1, f.skin === '#5a3a26' ? '#3a2418' : f.skin)
      if (r() < 0.5) rect(g, x + (r() < 0.5 ? 0 : 1), y, 1, 1, '#2a1a14')
      rect(g, x, y + 1, 2, 1, f.shirt)
    }
  return fans
}

/** The pitch in perspective: mown stripes and a cross-cut, the halfway line, the centre circle, the touchlines. */
function pitch(): Canvas {
  const cv = shade(W, H, (x, y) => {
    const edge = bend(x, WALL1)
    if (y < edge) return null
    // The track along the wall, in the stand's shadow.
    if (y < edge + 3) return '#163020'
    const d = y - HZ
    const stripe = Math.floor(190 / d) % 2
    const cut = Math.floor(((x - CX) / d) * 2.2 + 100) % 2
    return ['#24582c', '#2a6032', '#2c6834', '#337238'][stripe * 2 + cut]!
  })
  const g = cv.g
  for (let x = 0; x < W; x++) if (MID > bend(x, WALL1) + 3) rect(g, x, MID, 1, 1, '#c8dcc4')
  ellipseLine(g, CX, MID, 66, 11, '#c8dcc4')
  ellipse(g, CX, MID, 2, 1, '#c8dcc4')
  for (const s of [-1, 1])
    line(g, CX + s * 100, bend(CX + s * 100, WALL1) + 4, CX + s * 300, H + 30, '#a8bca4')
  return cv
}

export const leonChampion = championCinema<X>({
  id: 'leon',
  reveal: REVEAL,
  seed: 887,
  aura: ['#ffffff', '#ffe08a', GOLD, BURGUNDY],
  flash: '#fff4d8',
  sample: {
    trainer: '/trainers/classes/galar/champion-leon.png',
    name: 'Champion Leon',
    lead: 887,
    ace: 6,
    team: 3,
  },
  // Gigantamax Charizard, whatever his team that day (Charizard itself if its form hasn't loaded).
  extras: [10196, 6],
  setup(st, r, p) {
    const sc = stand()
    const fans = crowd(sc.g, r)
    st.screenShakes.push([T_RUMBLE, 0.7, 1], [T_TALL - 0.1, 0.3, 1], [T_ROAR, 0.55, 3], [T_HATCH, 0.25, 1])
    const gmax = spriteKey(10196, false)
    const zard = spriteKey(6, false)
    return {
      buf: canvas(W, H),
      sky: sky(rng(8871)),
      stand: sc,
      pitch: pitch(),
      zard: canvas(W, H),
      rise: canvas(W, H),
      fogBuf: canvas(W, H),
      fans,
      giant: spriteFrame(gmax) ? gmax : spriteFrame(zard) ? zard : p.ace,
      fire: new Particles(),
      fog: new Particles(),
      sparks: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    const F = s.L.foe
    for (const p of [s.fire, s.fog, s.sparks]) p.update(dt)
    const gz = giantAt(s, t)
    // Its fire, behind it, so it shows round its shape: licking its outline as it rises, roaring up once it catches.
    if (gz) {
      const blaze = t > T_IGNITE && t < T_ROAR + 0.7
      const n = t < T_IGNITE ? (r() < 0.5 ? 1 : 0) : blaze ? 5 : 2
      for (let i = 0; i < n; i++)
        s.fire.add({
          x: gz.x + r.range(-gz.w * 0.5, gz.w * 0.55),
          y: gz.top + r.range(gz.h * 0.05, gz.h * 0.55),
          vx: r.range(-12, 16),
          vy: -r.range(25, blaze ? 90 : 60),
          life: r.range(0.5, 0.9),
          size: r.int(2, blaze ? 7 : 5),
          size1: 0,
          shape: 'sq',
          colors: [...FIRE],
        })
    }
    // The roar's blast of heat: fire thrown out of its head over the stadium.
    if (within(t, T_ROAR, T_ROAR + dt) && gz) {
      const hd = headAt(gz)
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2
        const v = r.range(60, 200)
        s.sparks.add({
          x: hd.x,
          y: hd.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.7,
          ay: 70,
          drag: 0.8,
          life: r.range(0.7, 1.3),
          size: r.int(1, 3),
          shape: 'sq',
          colors: [...FIRE],
        })
      }
    }
    // Embers drifting down over the stadium once it has roared.
    if (t > T_ROAR && r() < 0.6)
      s.sparks.add({
        x: r.range(-20, W),
        y: r.range(-UP, 30),
        vx: r.range(6, 20),
        vy: r.range(10, 30),
        life: r.range(1.5, 2.5),
        size: 1,
        shape: 'sq',
        colors: ['#fff6c8', '#ffbe2e', '#ff8a1e', '#a8281a'],
      })
    // The lift's smoke: rolling out low from the hatch over the grass, lit gold from below.
    if (t > T_HATCH && t < T_UP1 + 0.3 && r() < 0.8) {
      const sd = r() < 0.5 ? -1 : 1
      s.fog.add({
        x: F.x + sd * r.range(14, 24),
        y: F.y + 3 + r.range(-1, 2),
        vx: sd * r.range(30, 70),
        vy: -r.range(2, 8),
        drag: 1.4,
        life: r.range(0.8, 1.3),
        size: 2,
        size1: 5,
        shape: 'smoke',
        density: 0.7,
        colors: ['#a8a090', '#7a7a8a', '#4a5068'],
        light: '#f0e0b8',
      })
    }
    // The pyro: a burst of sparks off each jet as it fires.
    T_PYRO.forEach((at, i) => {
      if (!within(t, at, at + dt)) return
      for (const x of pyroXs(F.x, i))
        for (let k = 0; k < 14; k++)
          s.fx.add({
            x,
            y: pyroY(F.y, i) - r.range(20, 40),
            vx: r.range(-30, 30),
            vy: -r.range(30, 90),
            ay: 160,
            life: r.range(0.4, 0.8),
            size: 1,
            shape: 'sq',
            colors: ['#ffffff', '#ffe08a', '#ff8a1e'],
          })
    })
    // The reveal: the confetti cannons at both corners, paper fluttering down over the pitch.
    if (within(t, REVEAL, REVEAL + dt))
      for (const sd of [-1, 1])
        for (let i = 0; i < 70; i++) {
          const c = r.pick(CONFETTI)
          s.fx.add({
            x: sd < 0 ? -2 : W + 2,
            y: r.range(70, 110),
            vx: -sd * r.range(60, 170),
            vy: -r.range(90, 190),
            ay: 90,
            drag: 1.6,
            life: r.range(1.6, 2.6),
            size: 2,
            shape: r() < 0.7 ? 'leaf' : 'sq',
            spin: r.range(-8, 8),
            colors: [c],
            light: '#ffffff',
            dark: c === '#ffffff' ? '#a8a8c0' : '#3a1a10',
          })
        }
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    const cam = camAt(t)
    const banks = T_BANKS.filter((at) => t >= at).length
    const roar = span(t, T_ROAR, T_ROAR + 0.4)
    // The world, under the camera.
    b.setTransform(1, 0, 0, 1, 0, cam)
    b.drawImage(s.sky, 0, -SKY)
    wheel(b, 22, 18, 20, t, banks > 0)
    // Its fire lights the sky behind the stadium.
    const heat = q8(0.45 * span(t, T_RISE, T_IGNITE) + 0.55 * roar)
    if (heat > 0) {
      b.drawImage(glow(100, '#2e1022', 1.1, heat), GIANT_X - 100, RIM - 110)
      b.drawImage(glow(70, '#5a2018', 1.3, heat), GIANT_X - 70, RIM - 60)
    }
    LIGHTS.forEach(([x], i) => beam(b, x, RIM - 2, lightAngle(i, t), 240, t > T_ROAR ? 0.5 : 1))
    drawGiant(b, s, t)
    b.drawImage(s.stand, 0, 0)
    b.drawImage(s.pitch, 0, 0)
    // The stadium in the dark until the floodlights bang on, a step at a time; one dip as the ground shakes.
    const stutter = within(t, T_RUMBLE + 0.05, T_RUMBLE + 0.17)
    b.setTransform(1, 0, 0, 1, 0, 0)
    wash(b, '#04030c', 0.62 - 0.155 * banks + (stutter ? 0.3 : 0), 8)
    b.setTransform(1, 0, 0, 1, 0, cam)
    drawCrowd(b, s, t)
    drawBoards(b, t, banks)
    drawBanks(b, t, stutter)
    // The roof's edge alight near it.
    if (roar > 0) drawRimFire(b, t)
    drawLift(b, s, t)
    s.sparks.draw(b)
    b.setTransform(1, 0, 0, 1, 0, 0)
    const sh = screenShake(t, s.screenShakes)
    if (sh.x || sh.y) rect(g, 0, 0, W, H, '#05040c')
    dissolve(g, s.buf, k, sh.x, sh.y)
  },
  before(g, s, t) {
    if (t < T_UP0) return
    const F = s.L.foe
    const fy = F.y + 2
    const sz = spriteSize(s.p.trainer)
    // Up out of the floor on the lift, cut at the hatch: a black figure in its column of light, rimmed gold.
    const q = ease.outC(span(t, T_UP0, T_UP1))
    const y = Math.round(fy + (sz.h + 4) * (1 - q))
    const sh = screenShake(t, s.screenShakes)
    const b = s.rise.g
    b.clearRect(0, 0, W, H)
    // Rim light: Charizard's fire from behind on his left, the column's white-gold on his right, the hatch below.
    const flare = Math.floor(t * 10) % 3 ? 0 : 1
    drawSprite(b, s.p.trainer, F.x - 1, y - 1, { sil: flare ? '#ffe08a' : '#ff9a2e' })
    drawSprite(b, s.p.trainer, F.x + 1, y - 1, { sil: '#fff6d8' })
    drawSprite(b, s.p.trainer, F.x, y + 1, { sil: '#ffd27a' })
    drawSprite(b, s.p.trainer, F.x, y, { sil: '#1a0c16' })
    g.drawImage(s.rise, 0, 0, W, fy, sh.x, sh.y, W, fy)
  },
  front(g, s, t, k) {
    // The lift's smoke in front of his legs, thinning out as the scene goes.
    const f = s.fogBuf.g
    f.clearRect(0, 0, W, H)
    s.fog.draw(f)
    dissolve(g, s.fogBuf, k)
    // The roar's flash; the hatch's (never closer than 0.34 s).
    if (within(t, T_ROAR, T_ROAR + 0.1)) screenFlash(g, '#ff8a1e', 0.3)
    if (within(t, T_HATCH, T_HATCH + 0.08)) screenFlash(g, '#fff4d8', 0.25)
  },
  sounds: [
    [0.05, () => hiss(1.6, { freq: 700, q: 0.4, vol: 0.035 })],
    [0.9, () => hiss(1.2, { freq: 900, q: 0.4, vol: 0.045 })],
    ...T_BANKS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(62 - i * 3, 0.2, { type: 'square', vol: 0.06, slide: -20 }),
            hiss(0.12, { freq: 1800, vol: 0.04 })
          ),
        ] as const,
    ),
    [T_BANKS[3] + 0.05, () => hiss(1.2, { freq: 1300, q: 0.35, vol: 0.07 })],
    [T_RUMBLE, () => (tone(38, 1, { type: 'sine', vol: 0.15, slide: -8 }), fxSound('gmax.grow'))],
    [T_RISE + 0.2, () => fxSound('gmax.step')],
    [T_RISE + 0.5, () => fxSound('gmax.step')],
    [T_IGNITE, () => (fxSound('fire.inhale'), fxSound('fire.stream'))],
    [T_ROAR, () => (fxSound('legend.roar'), hiss(0.6, { freq: 400, slide: 1600, vol: 0.06 }))],
    [T_DOWN0, () => hiss(0.5, { freq: 1200, q: 0.35, vol: 0.05 })],
    [
      T_HATCH,
      () => (
        tone(220, 0.5, { type: 'triangle', vol: 0.05, slide: 330 }),
        hiss(0.5, { freq: 300, vol: 0.05 })
      ),
    ],
    ...T_PYRO.map(
      (at) => [at, () => (fxSound('fire.hit'), hiss(0.4, { freq: 500, slide: 900, vol: 0.06 }))] as const,
    ),
    [T_UP0, () => hiss(0.7, { freq: 250, slide: 1400, vol: 0.05 })],
    ...T_STAMPS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(55, 0.14, { type: 'square', vol: 0.08 }),
            hiss(0.08, { freq: 900, vol: 0.06 }),
            i === 2 ? hiss(0.1, { freq: 2600, vol: 0.05, at: 0.1 }) : undefined
          ),
        ] as const,
    ),
    [
      REVEAL,
      () => (
        hiss(0.5, { freq: 3000, slide: -2000, vol: 0.07 }),
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, i === 3 ? 0.5 : 0.14, { type: 'square', vol: 0.04, at: i * 0.1 }),
        )
      ),
    ],
  ],
})

/** The giant's box at t (2× its sprite, world rows): rising behind the stand, standing tall, leaning in over it. */
function giantAt(s: X, t: number) {
  if (t < T_RISE) return null
  const sz = spriteSize(s.giant)
  const w = sz.w * 2
  const h = sz.h * 2
  const lean = ease.ioS(span(t, T_DOWN0, T_DOWN1 + 0.1))
  const rise = ease.outQ(span(t, T_RISE, T_TALL))
  const top = Math.round(lerp(lerp(RIM + 8, TALL_TOP, rise), LEAN_TOP, lean) + Math.sin(t * 3) * rise)
  return { x: GIANT_X + Math.round(10 * lean), top, w, h, feet: top + h }
}

/** Where its head is (its sprite looks left, its head high on that side): the roar comes from there. */
const headAt = (gz: { x: number; top: number; w: number; h: number }) => ({
  x: gz.x - Math.round(gz.w * 0.12),
  y: gz.top + Math.round(gz.h * 0.14),
})

/** Gigantamax Charizard behind the stand: a black shape, its outline burning; then its fire catches and lights it. */
function drawGiant(g: G, s: X, t: number) {
  const gz = giantAt(s, t)
  if (!gz) return
  s.fire.draw(g)
  const lit = span(t, T_IGNITE, T_IGNITE + 0.22)
  const breath = 1 + 0.03 * pulse(t, T_ROAR, T_ROAR + 0.5)
  const sx = 2 * breath
  // A shadow, its shape just made out against the glow behind it.
  if (lit < 1)
    drawSprite(g, s.giant, gz.x, gz.feet, {
      sx,
      sy: sx,
      tint: { color: '#120608', a: 0.82 },
      outline: Math.floor(t * 12) % 3 ? '#ff8a1e' : '#ffbe2e',
    })
  if (lit > 0) {
    const z = s.zard.g
    z.setTransform(1, 0, 0, 1, 0, 0)
    z.clearRect(0, 0, W, H)
    z.setTransform(g.getTransform())
    drawSprite(z, s.giant, gz.x, gz.feet, {
      sx,
      sy: sx,
      outline: t < T_ROAR + 0.3 ? (Math.floor(t * 20) % 2 ? '#ffffff' : '#ffe08a') : '#ff8a1e',
    })
    z.setTransform(1, 0, 0, 1, 0, 0)
    const m = g.getTransform()
    g.setTransform(1, 0, 0, 1, 0, 0)
    dissolve(g, s.zard, lit)
    g.setTransform(m)
  }
  // The roar: rings of heat from its head.
  const hd = headAt(gz)
  ;['#ffffff', '#ffe08a', '#ff8a1e'].forEach((c, i) =>
    burstRing(g, hd.x, hd.y, span(t, T_ROAR + i * 0.12, T_ROAR + i * 0.12 + 0.6), 150, 2, c),
  )
}

/** The roof's edge caught by its heat: fire along it either side of the giant, flaring as it roars, then burning low. */
function drawRimFire(g: G, t: number) {
  const run = ease.outQ(span(t, T_ROAR, T_ROAR + 0.4))
  const die = 1 - 0.6 * span(t, T_ROAR + 0.4, T_ROAR + 1.2)
  const reach = run * 80
  for (let x = Math.max(0, GIANT_X - 90); x < Math.min(W, GIANT_X + 90); x++) {
    const d = Math.abs(x - GIANT_X)
    if (d > reach) continue
    const h = Math.round(die * (1 - d / 95) * (2 + 8 * flick(x, t)))
    if (h > 0) tongue(g, x, bend(x, RIM) - 1, h)
  }
}

/** The floodlight banks under the roof's edge: dark, then on with a bang each, glaring. */
function drawBanks(g: G, t: number, stutter: boolean) {
  BANKS.forEach((x, i) => {
    const on = t >= T_BANKS[i]! && !stutter
    const y = bend(x, RIM + 1)
    rect(g, x - 8, y, 17, 5, '#1c1c2c')
    for (let k = 0; k < 7; k++)
      for (let j = 0; j < 2; j++)
        rect(g, x - 7 + k * 2 + j, y + 1 + j * 2, 1, 1, on ? (j ? '#ffe8a8' : '#fffbe8') : '#2a2a40')
    if (!on) return
    // The glare: a hot bloom and a long star, flaring as it bangs on.
    const bang = 1 - span(t, T_BANKS[i]!, T_BANKS[i]! + 0.3)
    g.drawImage(glow(14, '#fff0c0', 2, q8(0.5 + 0.5 * bang)), x - 14, y - 12)
    const arm = 12 + Math.round(18 * bang)
    rect(g, x - arm, y + 2, arm * 2 + 1, 1, '#fff6d8')
    rect(g, x, y - 5 - Math.round(4 * bang), 1, 13 + Math.round(8 * bang), '#fff6d8')
  })
}

/** The fans: lights twinkling in the dark, flags, camera flashes; then the champion's pose sweeping the stands. */
function drawCrowd(g: G, s: X, t: number) {
  const dark = t < T_BANKS[1]
  const front = (t - T_WAVE) / 0.45
  const f = Math.floor(t * 30)
  const bob = T_STAMPS.some((at) => within(t, at, at + 0.07)) ? 1 : 0
  for (const fan of s.fans) {
    const x = fan.x
    const y = fan.y
    // The pose: arms up as the wave goes past, lights held high, and up they stay; a stamp bobs them in time.
    if (front * (W + 40) - 20 > x) {
      const side = (x >> 1) % 2
      rect(g, x + side, y - 2 + bob, 1, 2, fan.skin)
      rect(g, x + side, y - 3 + bob, 1, 1, fan.light >= 0 ? '#fff6c8' : fan.light < -0.5 ? GOLD : fan.shirt)
      continue
    }
    if (fan.flag) {
      const wv = (f + x) % 8 < 4
      rect(g, x + 2, y - 3, 1, 4, '#8a8aa0')
      rect(g, x + 3, y - 3 + (wv ? 0 : 1), 3, 2, BURGUNDY)
      rect(g, x + 3, y - 3 + (wv ? 0 : 1), 3, 1, GOLD)
    }
    if (fan.light < 0) continue
    // A light held up: twinkling like stars in the dark, fewer and steadier once the floodlights are on.
    const tw = hash(fan.light * 91 + Math.floor(t * (dark ? 8 : 4) + fan.light * 13))
    if (tw < (dark ? 0.2 : 0.7)) continue
    rect(g, x, y - 1, 1, 1, tw > 0.93 ? '#ffffff' : fan.light > 0.5 ? '#fff6c8' : '#a8d8ff')
  }
  // Camera flashes popping round the stands.
  for (let i = 0; i < (dark ? 8 : 5); i++) {
    const n = Math.floor(t * 9) * 8 + i
    if (hash(n * 3.3) < 0.45) continue
    const fan = s.fans[Math.floor(hash(n * 7.7) * s.fans.length)]!
    rect(g, fan.x - 1, fan.y - 1, 3, 1, '#ffffff')
    rect(g, fan.x, fan.y - 2, 1, 3, '#ffffff')
  }
}

const CROWN = ['x..x..x', 'xx.x.xx', 'xxxxxxx', '.xxxxx.']
const FLAME = ['..x..', '.xx..', '.xxx.', 'xxyxx', '.xyx.']

/** The LED ring between the tiers and the boards round the pitch: dim blue, then gold and burgundy, running. */
function drawBoards(g: G, t: number, banks: number) {
  const on = banks >= 2
  const run = Math.floor(t * 24)
  for (let x = 0; x < W; x++) {
    const ry = bend(x, RING0 + 1)
    const lit = on ? ((x + run) % 12 < 8 ? GOLD : '#a86a1a') : (x + run) % 16 < 2 ? '#3a4a8a' : '#1a2048'
    rect(g, x, ry, 1, 2, lit)
    const wy = bend(x, WALL0 + 1)
    rect(g, x, wy, 1, 5, on ? BURGUNDY : '#10122a')
    if (on) rect(g, x, wy + 4, 1, 1, '#4a0e18')
  }
  if (!on) return
  // His crown and Charizard's flame scrolling round the boards.
  const crown = icon(CROWN, { x: GOLD })
  const flame = icon(FLAME, { x: '#ff8a1e', y: '#ffe08a' })
  for (let i = -1; i < 12; i++) {
    const x = Math.round(i * 22 - ((t * 30) % 22))
    const wy = bend(x + 3, WALL0 + 1)
    if (i % 2) g.drawImage(crown, x, wy)
    else g.drawImage(flame, x + 1, wy)
  }
}

/** Pyro positions: the far pair, then the near pair, either side of the lift. */
const pyroXs = (fx: number, i: number) => (i ? [fx - 58, fx + 58] : [fx - 30, fx + 30])
const pyroY = (fy: number, i: number) => fy + (i ? 6 : 0)

/** The lift: the hatch opening in the pitch, its column of light; the pyro either side. */
function drawLift(g: G, s: X & { L: { foe: { x: number; y: number } } }, t: number) {
  const F = s.L.foe
  const open = ease.outBack(span(t, T_HATCH, T_HATCH + 0.25), 1.6)
  if (open > 0) {
    const fy = F.y + 3
    const rx = Math.round(24 * open)
    const ry = Math.max(1, Math.round(5 * open))
    // A pool of light on the grass round it, the hatch's bright mouth, its gold rim.
    g.drawImage(glow(40, '#3e6a30', 1.2, 0.75), F.x - 40, fy - 40)
    ellipse(g, F.x, fy, rx + 2, ry + 1, '#c89a3a')
    ellipse(g, F.x, fy, rx, ry, '#fff6d8')
    ellipse(g, F.x, fy + 1, Math.max(1, rx - 4), Math.max(1, ry - 2), '#ffffff')
    // The column: solid gold low down, its dither thinning out as it climbs, a white core.
    const col = span(t, T_HATCH, T_HATCH + 0.15) * (1 - 0.7 * span(t, T_UP1, REVEAL + 0.3))
    const top = Math.round(fy - 110 * ease.outQ(span(t, T_HATCH, T_HATCH + 0.2)))
    for (let y = Math.max(-UP, top); y < fy; y++) {
      const u = (fy - y) / (fy - top)
      const hw = rx - 3 + u * 3
      rect(g, F.x - hw, y, hw * 2 + 1, 1, pattern(g, '#ffd27a', col * 16 * (1 - u) ** 2))
      rect(g, F.x - hw * 0.45, y, hw * 0.9 + 1, 1, pattern(g, '#fff6d8', col * 18 * (1 - u) ** 1.5))
    }
  }
  // The pyro: jets of flame shooting up in pairs, a white-hot root, falling back.
  T_PYRO.forEach((at, i) => {
    const q = span(t, at, at + 0.6)
    if (q <= 0 || q >= 1) return
    const hmax = i ? 70 : 58
    const h = Math.round(hmax * ease.outC(span(t, at, at + 0.12)) * (1 - ease.inQ(q)))
    for (const x of pyroXs(F.x, i)) {
      const y = pyroY(F.y, i)
      rect(g, x - 3, y - 1, 7, 3, '#2a2a34')
      rect(g, x - 3, y - 1, 7, 1, '#4a4a58')
      for (let dx = -3; dx <= 3; dx++)
        tongue(
          g,
          x + dx,
          y - 1,
          Math.round(h * (1 - Math.abs(dx) * 0.16) * (0.75 + 0.25 * flick(x + dx, t))),
          -1,
        )
      g.drawImage(glow(12, '#ffbe2e', 1.5, 0.6), x - 12, y - 12)
    }
  })
}
