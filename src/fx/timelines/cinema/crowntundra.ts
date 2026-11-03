// The Crown Tundra's raid entrances (docs/53): the king and his two steeds, each in its own corner of the tundra.
// Glastrier's: a snowfield under a heavy sky. Hoofbeats shake the pines, snow sliding off them; a dark horse appears
// on the far ridge, its breath steaming, and charges straight at you: every hoofbeat raises a lance of ice behind it,
// a road of spears from the horizon to your feet. It rears, and a crown of ice spikes bursts up round it.
// Spectrier's: the Old Cemetery at night, graves in the snow, a low moon, wisps among the stones. Hoofbeats with no
// horse: glowing hoofprints cross the snow. Then the ghost gallops across the sky over the moon, its afterimages
// chasing it, the graves' wisps torn into its trail; the moon turns violet and it rides down at you through the graves.
// Calyrex's: Freezington's field at dawn under the old statue of the king. A seed glows; green rings melt the snow back
// to soil and the harvest grows in waves (sprouts, leaves, carrots, flowers); gold rises from the field into a crown
// of light that turns in the sky, then comes down onto the king as he appears beneath it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  pattern,
  rect,
  span,
  type Canvas,
  type G,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { burstRing, dGradient, dissolve, tri } from './kit'
import { peaks, pine, raidCinema, type Raid } from './gen8kit'

const G_REVEAL = 4.5
const S_REVEAL = 4.5
const C_REVEAL = 4.6

// ------------------------------------------------------------------------------------------------------- Glastrier

const ICE = ['#ffffff', '#d8f4ff', '#8ad0f0', '#4a90c0', '#1e4a78'] as const
const GLAS = ['#ffffff', '#d8f4ff', '#6ac0e8', '#1e4a78'] as const
/** Distant hoofbeats, then its charge: each step from T_CHARGE raises a lance. */
const THUDS = [0.95, 1.35, 1.7, 2.0] as const
const T_RIDGE = 2.2
const T_CHARGE = 2.5
const STEPS = [2.5, 2.72, 2.92, 3.1, 3.26, 3.4, 3.52, 3.63, 3.73] as const
const T_REAR = 3.95

type GX = { back: Canvas; horizon: number; snow: [number, number][] }

/** Where it is on its charge (0 on the ridge, 1 at its place), from the hoofbeats. */
const chargeQ = (t: number) => span(t, T_CHARGE, T_REAR - 0.1) ** 1.4

/** The lance raised by step i: its foot and size, along the charge's line, alternating sides. */
function lance(s: Raid & GX, i: number): [number, number, number] {
  const q = chargeQ(STEPS[i]!)
  const y = lerp(s.horizon + 2, s.feet + 6, q)
  const side = i % 2 ? 1 : -1
  const k = lerp(0.25, 1, q)
  // Flanking its path, so the road of spears shows either side of it rather than behind it.
  const x = s.cx + side * lerp(8, s.sz.w * 0.62 + 12, q)
  return [Math.round(x), Math.round(y), k]
}

/** An ice lance: a tall faceted spike, lit on one face. */
function spike(g: G, x: number, y: number, ht: number, wd: number, lean = 0) {
  const tx = x + lean
  tri(g, x - wd, y, x + wd, y, tx, y - ht, ICE[3])
  tri(g, x - wd, y, x, y, tx, y - ht, ICE[2])
  line(g, x - wd + 1, y - 1, tx, y - ht + 1, ICE[1])
  rect(g, tx, y - ht, 1, 2, ICE[0])
  rect(g, x - wd, y, wd * 2, 1, ICE[4])
}

export const glastrierCinema = raidCinema<GX>({
  id: 'cinema-glastrier',
  reveal: G_REVEAL,
  seed: 896,
  aura: GLAS,
  flash: '#f0faff',
  feet: 0.63,
  rays: 0.5,
  bob: 0,
  shakes: [
    ...THUDS.map((at, i) => [at, 0.25, 1 + (i >> 1)] as const),
    ...STEPS.map((at, i) => [at, 0.12, 1 + Math.floor(i / 3)] as const),
    [T_REAR, 0.6, 5],
    [G_REVEAL, 0.4, 2],
  ],
  flashes: [[T_REAR, 0.2, '#f0faff', 0.5]],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.44)
    const cv = canvas(s.w, s.h)
    const g = cv.g
    g.drawImage(dGradient(s.w, horizon, ['#5a6a7a', '#7a8a9a', '#9aaab8', '#b8c8d4']), 0, 0)
    peaks(g, s.w, horizon, s.h * 0.16, r, '#6a7a8c', '#e8f0f8')
    peaks(g, s.w, horizon + 2, s.h * 0.09, r, '#56687a', '#d8e4ee')
    g.drawImage(dGradient(s.w, s.h - horizon, ['#e8f0f8', '#d0dce8', '#b8c8d8', '#a0b4c8']), 0, horizon)
    for (let y = horizon + 4; y < s.h; y += 5)
      for (let x = (y * 13) % 17; x < s.w; x += 17) rect(g, x, y, 5, 1, '#c0d0de')
    // Pines in two groups, far and near.
    const snow: [number, number][] = []
    for (const [side, n] of [
      [-1, 4],
      [1, 4],
    ] as const)
      for (let i = 0; i < n; i++) {
        const near = i >= 2
        const x = Math.round(s.cx + side * (s.w * (near ? 0.42 : 0.28) + i * 9 + r.range(-4, 4)))
        const base = near ? Math.round(s.h * 0.7 + i * 6) : horizon + 6 + i * 3
        const ht = Math.round((near ? s.h * 0.24 : s.h * 0.1) + r.range(-4, 4))
        pine(g, x, base, ht, '#1e3a3a', '#2e5048', '#f0f8ff')
        snow.push([x, base - ht * 0.6])
      }
    // Drifts across the foreground, their lit crests.
    for (let k = 0; k < 3; k++) {
      const y = Math.round(s.h * (0.8 + k * 0.07))
      for (let x = 0; x < s.w; x++) {
        const top = y - Math.round(4 + Math.sin(x / (12 + k * 5) + k * 2) * 4)
        rect(g, x, top, 1, s.h - top, k % 2 ? '#d4dfec' : '#e4ecf6')
        rect(g, x, top, 1, 1, '#ffffff')
      }
    }
    return { back: cv, horizon, snow }
  },
  step(s, t, dt) {
    const r = s.r
    // Each distant hoofbeat shakes snow off the pines.
    for (const at of THUDS)
      if (t >= at && t - dt < at)
        for (const [x, y] of s.snow)
          for (let k = 0; k < 4 * s.many; k++)
            s.fx.add({
              x: x + r.range(-6, 6),
              y: y + r.range(-8, 8),
              vx: r.range(-10, 10),
              vy: r.range(10, 30),
              ay: 60,
              life: 1,
              size: r.int(1, 2),
              shape: 'smoke',
              colors: ['#ffffff', '#e0ecf4'],
            })
    // Each step of the charge: a lance bursts up in a spray of snow and ice.
    STEPS.forEach((at, i) => {
      if (t < at || t - dt >= at) return
      const [x, y, k] = lance(s, i)
      for (let n = 0; n < 12 * s.many * k + 2; n++)
        s.fx.add({
          x: x + r.range(-4, 4) * k,
          y,
          vx: r.range(-50, 50) * k,
          vy: -r.range(30, 90) * k,
          ay: 200,
          life: r.range(0.4, 0.8),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'flake' : 'sq',
          colors: [ICE[0], ICE[1], ICE[2]],
        })
    })
    if (t >= T_REAR && t - dt < T_REAR)
      for (let n = 0; n < 60 * s.many; n++) {
        const a = r() * Math.PI * 2
        const v = r.range(40, 140)
        s.fx.add({
          x: s.cx + Math.cos(a) * 10,
          y: s.feet,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.4 - 40,
          ay: 160,
          life: r.range(0.6, 1.1),
          size: r.int(1, 3),
          shape: r() < 0.5 ? 'flake' : 'smoke',
          colors: [ICE[0], ICE[1]],
        })
      }
    // Its breath steaming, on the ridge and after.
    if ((t > T_RIDGE && t < T_CHARGE + 0.3) || t > G_REVEAL)
      if (r() < 0.15) {
        const [x, y] =
          t < G_REVEAL ? [s.cx - 4, s.horizon - 8] : [s.cx - s.sz.w * 0.35, s.feet - s.sz.h * 0.75]
        s.fx.add({
          x,
          y,
          vx: -r.range(8, 16),
          vy: -r.range(2, 6),
          life: 1,
          size: 2,
          size1: 5,
          shape: 'smoke',
          colors: ['#ffffff', '#e8f4ff'],
        })
      }
    // Snow falling throughout.
    if (r() < 0.6 * s.many)
      s.fx.add({
        x: r.range(0, s.w + 30),
        y: -3,
        vx: -r.range(10, 25),
        vy: r.range(20, 35),
        life: s.h / 25,
        size: 1,
        shape: 'px',
        colors: ['#ffffff'],
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // The ground freezing along its path, from the ridge to here.
    const fq = chargeQ(t)
    if (fq > 0) {
      const y1 = Math.round(lerp(s.horizon, s.feet + 8, fq))
      for (let y = s.horizon + 1; y < y1; y++) {
        const q = (y - s.horizon) / Math.max(1, s.feet - s.horizon)
        const hw = Math.round(lerp(3, s.sz.w * 0.7, q))
        rect(g, s.cx - hw, y, hw * 2, 1, pattern(g, ICE[2], 6 + (y % 3)))
      }
    }
    // The lances raised so far, the far ones first.
    STEPS.forEach((at, i) => {
      const q = ease.outBack(span(t, at, at + 0.1), 2)
      if (q <= 0) return
      const [x, y, k] = lance(s, i)
      const ht = Math.round(Math.max(s.h * 0.26, s.sz.h * 1.1) * k * q)
      spike(g, x, y, ht, Math.max(2, Math.round(10 * k)), (i % 2 ? 1 : -1) * Math.round(8 * k))
      // A smaller one leaning off its foot.
      if (k > 0.4)
        spike(
          g,
          x + (i % 2 ? 6 : -6),
          y + 1,
          Math.round(ht * 0.5),
          Math.max(2, Math.round(5 * k)),
          (i % 2 ? 1 : -1) * Math.round(10 * k),
        )
    })
    // On the ridge: a dark shape, its breath steaming.
    if (t > T_RIDGE && t < T_CHARGE)
      drawSprite(g, s.mon, s.cx, s.horizon - 1, { sx: 0.25, sy: 0.25, sil: '#1e2a3a', outline: ICE[2] })
  },
  before(g, s, t) {
    // The charge: growing as it comes, a little bob with each step.
    if (t >= T_CHARGE) {
      const q = chargeQ(t)
      const k = lerp(0.25, 1, q)
      const step = STEPS.findIndex((a) => a > t)
      const bob = step > 0 && t - STEPS[step - 1]! < 0.06 ? -2 : 0
      const rear = span(t, T_REAR - 0.15, T_REAR) * (1 - span(t, T_REAR, T_REAR + 0.25))
      drawSprite(g, s.mon, s.cx, Math.round(lerp(s.horizon - 1, s.feet, q)) + bob - Math.round(rear * 8), {
        sx: k,
        sy: k * (1 + rear * 0.1),
        sil: '#14202e',
        outline: Math.floor(t * 12) % 2 ? ICE[1] : ICE[2],
      })
    }
  },
  front(g, s, t) {
    // The crown of ice bursting up round it as it rears.
    const q = ease.outBack(span(t, T_REAR, T_REAR + 0.18), 1.8)
    if (t > T_REAR) {
      const R = Math.max(s.sz.w * 0.7, 30)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3
        const front = Math.sin(a) > 0.2
        if (!front) continue
        const x = s.cx + Math.cos(a) * R
        const y = s.feet + Math.sin(a) * R * 0.3 + 4
        spike(
          g,
          Math.round(x),
          Math.round(y),
          Math.round((s.h * 0.12 + (i % 3) * 6) * q),
          5,
          Math.round(Math.cos(a) * 8),
        )
      }
    }
    burstRing(g, s.cx, s.feet, span(t, T_REAR, T_REAR + 0.5), s.w * 0.8, 3, ICE[1])
  },
  sounds: [
    [0.05, () => hiss(4, { freq: 900, type: 'lowpass', vol: 0.05 })],
    ...THUDS.map(
      (at, i) =>
        [
          at,
          () => (
            tone(50, 0.4, { type: 'sine', vol: 0.1 + i * 0.02, slide: -10 }),
            hiss(0.2, { freq: 160, vol: 0.06 })
          ),
        ] as const,
    ),
    [T_RIDGE, () => hiss(0.6, { freq: 600, slide: -300, vol: 0.04 })],
    [T_RIDGE + 0.1, () => tone(330, 0.5, { type: 'triangle', vol: 0.03, slide: -120 })],
    ...STEPS.map(
      (at, i) =>
        [
          at,
          () => (
            hiss(0.12, { freq: 4000 - i * 200, vol: 0.05 + i * 0.006 }),
            tone(70, 0.15, { type: 'sine', vol: 0.08 })
          ),
        ] as const,
    ),
    [T_REAR, () => (fxSound('mega.crack'), tone(55, 0.6, { type: 'sine', vol: 0.15, slide: -20 }))],
  ],
})

// ------------------------------------------------------------------------------------------------------- Spectrier

const SPEC = ['#ffffff', '#e0c8ff', '#9a6ae0', '#3a1a6a'] as const
const PRINTS = 9
const T_PRINTS = 0.95
const T_SKY = 2.0
const T_DOWN = 3.4

type SX = {
  back: Canvas
  horizon: number
  graves: [number, number][]
  moon: [number, number]
  prints: [number, number][]
}

/** The ghost's path in the sky: a wide arc over the moon, then wheeling back. */
function skyAt(s: Raid & SX, tau: number): [number, number] {
  const q = span(tau, T_SKY, T_DOWN)
  const a = lerp(Math.PI * 1.05, Math.PI * 2.6, ease.ioS(q))
  const rx = s.w * 0.4
  const ry = s.h * 0.08
  return [s.cx + Math.cos(a) * rx, s.moon[1] + s.h * 0.1 + Math.sin(a) * ry]
}

export const spectrierCinema = raidCinema<SX>({
  id: 'cinema-spectrier',
  reveal: S_REVEAL,
  seed: 897,
  aura: SPEC,
  flash: '#f0e0ff',
  feet: 0.63,
  rays: 0.55,
  bob: 0,
  shakes: [
    [T_DOWN + 0.9, 0.4, 3],
    [S_REVEAL, 0.4, 2],
  ],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.5)
    const cv = canvas(s.w, s.h)
    const g = cv.g
    g.drawImage(dGradient(s.w, horizon, ['#04030c', '#0a0820', '#141034', '#1e1840']), 0, 0)
    for (let i = 0; i < 40; i++)
      rect(g, r.range(0, s.w), r.range(0, horizon * 0.7), 1, 1, r() < 0.3 ? '#ffffff' : '#7a70b0')
    peaks(g, s.w, horizon, s.h * 0.1, r, '#141030', '#3a3460')
    g.drawImage(dGradient(s.w, s.h - horizon, ['#3a3660', '#2a2648', '#1a1834', '#100e22']), 0, horizon)
    // Dead trees, bare and crooked.
    for (const side of [-1, 1]) {
      const x = Math.round(s.cx + side * s.w * 0.4)
      const base = Math.round(s.h * 0.72)
      const ht = Math.round(s.h * 0.26)
      line(g, x, base, x - side * 3, base - ht, '#08060e', 3)
      for (let k = 0; k < 5; k++) {
        const y = base - ht * (0.4 + k * 0.12)
        const d = (k % 2 ? 1 : -1) * (10 + k * 2)
        line(g, x - side * 2, y, x + d, y - 8 - k, '#08060e', k < 2 ? 2 : 1)
      }
    }
    // The graves scattered in rows down the slope, nearer ones bigger, some leaning, some crosses.
    const graves: [number, number][] = []
    for (const [row, v] of [0.06, 0.22, 0.45, 0.78].entries()) {
      const y = Math.round(horizon + (s.h - horizon) * v)
      const k = 0.55 + row * 0.3
      const gap = Math.round(30 * k)
      for (let x = ((row * 17) % gap) - gap / 2; x < s.w + gap; x += gap + r.int(-4, 6)) {
        if (Math.abs(x - s.cx) < s.sz.w * 0.5 && row >= 1) continue
        const gx = Math.round(x + r.range(-3, 3))
        const gw = Math.round(5 * k)
        const gh = Math.round((8 + r.int(0, 4)) * k)
        const lean = r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0
        if (r() < 0.25) {
          // A cross.
          rect(g, gx - 1, y - gh - 2, Math.max(2, Math.round(k * 2)), gh + 2, '#4a4670')
          rect(g, gx - gw + 1, y - gh + 1, gw * 2 - 2, Math.max(2, Math.round(k * 2)), '#4a4670')
          rect(g, gx - 1, y - gh - 2, 1, gh + 2, '#7a76a0')
        } else
          for (let yy = 0; yy < gh; yy++) {
            const off = Math.round(((lean * (gh - yy)) / gh) * 2)
            const hw =
              yy < gw * 0.6 ? Math.round(gw * Math.sqrt(1 - ((gw * 0.6 - yy) / (gw * 0.6)) ** 2)) : gw
            rect(g, gx - hw + off, y - gh + yy, hw * 2, 1, '#4a4670')
            rect(g, gx - hw + off, y - gh + yy, 1, 1, '#7a76a0')
            if (yy === Math.round(gh * 0.4)) rect(g, gx - 1 + off, y - gh + yy, 3, 1, '#2a2648')
          }
        rect(g, gx - gw - 2, y, gw * 2 + 4, 1, '#e0e4f8')
        rect(g, gx - gw - 1, y - 1, gw * 2 + 2, 1, '#b8bcd8')
        graves.push([gx, y - gh - 2])
      }
    }
    const moon: [number, number] = [s.cx, Math.round(s.h * 0.17)]
    const prints: [number, number][] = Array.from({ length: PRINTS }, (_, i) => {
      const q = i / (PRINTS - 1)
      return [
        Math.round(lerp(s.w * 0.08, s.cx, q) + (i % 2 ? 3 : -3)),
        Math.round(lerp(horizon + 10, s.feet + 2, q)),
      ]
    })
    return { back: cv, horizon, graves, moon, prints }
  },
  step(s, t, dt) {
    const r = s.r
    // Wisps among the graves, drifting; once it rides the sky they are pulled up into its trail.
    if (r() < 0.25 * s.many) {
      const [x, y] = r.pick(s.graves)
      const [hx, hy] = skyAt(s, t)
      s.fx.add({
        x,
        y,
        vx: r.range(-4, 4),
        vy: -r.range(3, 8),
        life: 1.6,
        size: 1,
        shape: 'disc',
        home: t > T_SKY && t < T_DOWN ? { x: hx, y: hy, k: 160 } : undefined,
        colors: [SPEC[1], SPEC[2], SPEC[3]],
      })
    }
    // Each hoofprint's puff of ghost fire.
    for (let i = 0; i < PRINTS; i++) {
      const at = T_PRINTS + i * 0.11
      if (t >= at && t - dt < at)
        for (let k = 0; k < 6 * s.many; k++)
          s.fx.add({
            x: s.prints[i]![0] + r.range(-2, 2),
            y: s.prints[i]![1],
            vx: r.range(-6, 6),
            vy: -r.range(10, 25),
            life: 0.6,
            size: r.int(1, 2),
            size1: 0,
            shape: 'smoke',
            colors: [SPEC[1], SPEC[2], SPEC[3]],
          })
    }
    // Ghost fire trailing it across the sky and down.
    if (t > T_SKY && t < S_REVEAL && r() < 1.2 * s.many) {
      const [x, y] = t < T_DOWN ? skyAt(s, t) : downAt(s, t)
      s.fx.add({
        x: x + r.range(-6, 6),
        y: y - r.range(0, 10),
        vx: r.range(-10, 10),
        vy: -r.range(5, 20),
        life: 0.7,
        size: r.int(1, 3),
        size1: 0,
        shape: 'smoke',
        colors: [SPEC[1], SPEC[2], SPEC[3]],
      })
    }
    if (t > S_REVEAL && r() < 0.4 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.sz.w * 0.5, s.sz.w * 0.5),
        y: s.feet - r.range(0, s.sz.h * 0.3),
        vy: -r.range(10, 25),
        life: 0.8,
        size: r.int(1, 2),
        size1: 0,
        shape: 'smoke',
        colors: [SPEC[1], SPEC[2], SPEC[3]],
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // The moon, turning violet as it comes down.
    const vio = span(t, T_DOWN - 0.3, T_DOWN + 0.3)
    const [mx, my] = s.moon
    const mr = Math.round(Math.max(12, s.m * 0.1))
    g.drawImage(glow(mr * 3, vio > 0.5 ? '#5a2a9a' : '#3a4a8a', 1.3, 0.6), mx - mr * 3, my - mr * 3)
    ellipse(g, mx, my, mr, mr, vio > 0.5 ? '#c8a8ff' : '#e8ecff')
    ellipse(g, mx + mr * 0.3, my - mr * 0.2, mr * 0.3, mr * 0.3, vio > 0.5 ? '#a888e8' : '#c8d0f0')
    ellipse(g, mx - mr * 0.35, my + mr * 0.3, mr * 0.2, mr * 0.2, vio > 0.5 ? '#a888e8' : '#c8d0f0')
    // Mist lying among the graves.
    for (let i = 0; i < 6; i++) {
      const y = s.horizon + 8 + i * Math.round((s.h - s.horizon) * 0.1)
      const x = ((i * 47 + t * (6 + i)) % (s.w + 60)) - 30
      ellipse(g, x, y, 24 + i * 3, 2, pattern(g, '#6a5aa8', 4))
    }
    // The hoofprints, appearing one by one with no horse, glowing, then fading.
    s.prints.forEach(([x, y], i) => {
      const at = T_PRINTS + i * 0.11
      if (t < at) return
      const k = 1 - span(t, at + 1.2, at + 2.2)
      if (k <= 0) return
      // A hoof's print: a horseshoe of light, bigger as the prints come nearer.
      const sz = 2 + Math.round(i / 3)
      g.drawImage(glow(sz * 3 + 3, SPEC[2], 1.3, 0.75 * k), x - sz * 3 - 3, y - sz * 3 - 3)
      ellipseLine(
        g,
        x,
        y,
        sz + 1,
        Math.max(1, (sz >> 1) + 1),
        k > 0.5 ? SPEC[0] : SPEC[1],
        Math.PI * 0.85,
        Math.PI * 2.15,
      )
      ellipse(g, x, y, sz, Math.max(1, sz >> 1), k > 0.5 ? SPEC[2] : SPEC[3])
    })
  },
  before(g, s, t) {
    // Across the sky: the ghost and its afterimages chasing it, all outline and dark.
    if (t > T_SKY && t < T_DOWN + 0.05) {
      for (let k = 4; k >= 0; k--) {
        const tau = t - k * 0.07
        if (tau < T_SKY) continue
        const [x, y] = skyAt(s, tau)
        const [px] = skyAt(s, tau - 0.02)
        drawSprite(g, s.mon, x, y + s.sz.h * 0.3, {
          sx: 0.55,
          sy: 0.55,
          sil: k ? SPEC[3] : '#120a22',
          outline: k ? undefined : Math.floor(t * 14) % 2 ? SPEC[1] : SPEC[0],
          flip: x > px,
        })
      }
    }
    // Down at you through the graves, its afterimages strung out behind.
    if (t >= T_DOWN) {
      for (let k = 4; k >= 0; k--) {
        const tau = Math.max(T_DOWN, t - k * 0.06)
        const [x, y] = downAt(s, tau)
        const q = ease.inQ(span(tau, T_DOWN, S_REVEAL - 0.2))
        const sc = lerp(0.55, 1, q)
        if (k && tau === T_DOWN) continue
        drawSprite(g, s.mon, x, y, {
          sx: sc,
          sy: sc,
          sil: k ? SPEC[3] : '#120a22',
          outline: k ? undefined : Math.floor(t * 14) % 2 ? SPEC[1] : SPEC[0],
          wave: k ? undefined : { amp: 1, len: 7, phase: t * 30 },
        })
      }
    }
  },
  front(g, s, t) {
    burstRing(g, s.cx, s.feet - s.sz.h / 2, span(t, S_REVEAL - 0.3, S_REVEAL + 0.2), s.m * 0.6, 3, SPEC[2])
  },
  sounds: [
    [0.05, () => hiss(3, { freq: 400, type: 'lowpass', vol: 0.04 })],
    [0.2, () => tone(196, 2, { type: 'sine', vol: 0.03, slide: -30 })],
    ...Array.from(
      { length: PRINTS },
      (_, i) =>
        [
          T_PRINTS + i * 0.11,
          () => tone(i % 2 ? 140 : 120, 0.08, { type: 'square', vol: 0.03, slide: -40 }),
        ] as const,
    ),
    [T_SKY, () => fxSound('nightmare.breath')],
    [T_SKY + 0.1, () => tone(330, 1.2, { type: 'triangle', vol: 0.025, slide: 220 })],
    ...Array.from(
      { length: 8 },
      (_, i) => [T_SKY + 0.2 + i * 0.16, () => tone(110, 0.06, { type: 'square', vol: 0.025 })] as const,
    ),
    [T_DOWN, () => fxSound('nightmare.charge')],
    ...Array.from(
      { length: 6 },
      (_, i) =>
        [T_DOWN + 0.1 + i * 0.13, () => tone(90, 0.08, { type: 'square', vol: 0.04 + i * 0.006 })] as const,
    ),
  ],
})

/** Down from the sky at the camera, over the graves, to its place. */
function downAt(s: Raid & SX, tau: number): [number, number] {
  const q = ease.inQ(span(tau, T_DOWN, S_REVEAL - 0.2))
  const [x0, y0] = skyAt(s, T_DOWN)
  return [lerp(x0, s.cx, q), lerp(y0 + s.sz.h * 0.3, s.feet, q) - Math.sin(q * Math.PI) * s.h * 0.05]
}

// --------------------------------------------------------------------------------------------------------- Calyrex

const CALY = ['#ffffff', '#e0ffd0', '#7ad86a', '#2a6a3a'] as const
const GOLD = ['#fff6c8', '#ffd23a', '#c8901e', '#7a5010'] as const
const T_SEED = 0.9
const T_MELT = 1.3
const T_GROW = 1.75
const T_BLOOM = 2.6
const T_CROWN = 3.0
const T_KING = 3.75

type CX = {
  back: Canvas
  snowField: Canvas
  soil: Canvas
  horizon: number
  /** The field's centre (the seed), and how far it reaches. */
  fy: number
  plants: { x: number; y: number; d: number; kind: number; k: number }[]
}

export const calyrexCinema = raidCinema<CX>({
  id: 'cinema-calyrex',
  reveal: C_REVEAL,
  seed: 898,
  aura: CALY,
  flash: '#f8ffe8',
  feet: 0.6,
  rays: 0.6,
  bob: 2,
  shakes: [[C_REVEAL, 0.3, 1]],
  setup(s) {
    const r = s.r
    const horizon = Math.round(s.h * 0.42)
    const cv = canvas(s.w, s.h)
    const g = cv.g
    g.drawImage(dGradient(s.w, horizon, ['#2a3a6a', '#5a5a8a', '#b08aa0', '#f0b8a0', '#ffe0b8']), 0, 0)
    peaks(g, s.w, horizon, s.h * 0.2, r, '#6a6a90', '#f8f0f8')
    // The Crown Shrine high on the tallest peak: a speck with a light.
    rect(g, Math.round(s.w * 0.7), Math.round(horizon - s.h * 0.17), 3, 3, '#3a2a4a')
    // Freezington's cottages on the far snow, smoke-less at dawn.
    for (let i = 0; i < 4; i++) {
      const x = Math.round(s.w * (0.1 + i * 0.07))
      rect(g, x, horizon - 4, 7, 5, '#5a4a4a')
      tri(g, x - 2, horizon - 4, x + 9, horizon - 4, x + 3, horizon - 9, '#f0f4ff')
      rect(g, x + 2, horizon - 2, 2, 2, '#ffd08a')
    }
    // The old statue of the king on its plinth, grey stone, worn.
    const sx = Math.round(s.w * 0.86)
    const sb = horizon + Math.round(s.h * 0.06)
    rect(g, sx - 9, sb - 8, 18, 8, '#5a5a6a')
    rect(g, sx - 9, sb - 8, 18, 1, '#8a8a9a')
    const snowField = dGradient(s.w, s.h - horizon, ['#f0f4ff', '#dce4f4', '#c4cee4', '#aab6d0'])
    for (let y = 2; y < s.h - horizon; y += 4)
      for (let x = (y * 11) % 13; x < s.w; x += 13) rect(snowField.g, x, y, 4, 1, '#c8d2e8')
    const fy = s.feet + 4
    // The grown field: soil heaped in rows, the near ones bigger; plants along each row, each with its distance from
    // the seed (they grow outward from it).
    const soil = dGradient(s.w, s.h - horizon, ['#3a2818', '#2e2012', '#22180c'])
    const plants: CX['plants'] = []
    for (let row = 0; row < 8; row++) {
      const v = (row + 0.6) / 8
      const y = Math.round(horizon + (s.h - horizon) * v ** 1.3)
      const k = lerp(0.5, 1.7, v)
      const mh = Math.max(1, Math.round(3 * k))
      for (let x = 0; x < s.w; x++) {
        const bump = Math.round(Math.sin(x * 0.4 + row) * 0.6)
        rect(soil.g, x, y - horizon - mh + bump, 1, mh, '#4a3420')
        rect(soil.g, x, y - horizon - mh + bump, 1, 1, '#6a4a2c')
        rect(soil.g, x, y - horizon + bump, 1, 1, '#1a1208')
      }
      const gap = Math.round(13 * k)
      for (let x = ((row * 7) % gap) + 3; x < s.w; x += gap) {
        const d = Math.hypot((x - s.cx) / s.w, ((y - fy) / s.h) * 1.6)
        plants.push({ x, y: y - mh + 1, d, kind: r.int(0, 3), k })
      }
    }
    return { back: cv, snowField, soil, horizon, fy, plants }
  },
  step(s, t, dt) {
    const r = s.r
    // Gold rising out of the field into the crown.
    if (t > T_BLOOM && t < T_KING && r() < 1.2 * s.many) {
      const p = r.pick(s.plants)
      s.fx.add({
        x: p.x,
        y: p.y - 4,
        vx: r.range(-10, 10),
        vy: -r.range(20, 40),
        home: { x: s.cx, y: crownY(s, t), k: 140 },
        life: 1.4,
        size: 1,
        shape: r() < 0.3 ? 'star' : 'px',
        colors: [GOLD[0], GOLD[1], GOLD[2]],
      })
    }
    // Green motes of the king's power while the field grows.
    if (t > T_MELT && t < C_REVEAL && r() < 0.5 * s.many)
      s.fx.add({
        x: s.cx + r.range(-s.w * 0.4, s.w * 0.4),
        y: s.fy + r.range(-4, 20),
        vy: -r.range(10, 25),
        life: 1,
        size: 1,
        shape: 'px',
        colors: [CALY[1], CALY[2]],
      })
    if (t >= T_SEED && t - dt < T_SEED)
      for (let k = 0; k < 12 * s.many; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: s.cx,
          y: s.fy,
          vx: Math.cos(a) * 30,
          vy: Math.sin(a) * 15,
          drag: 3,
          life: 0.5,
          size: 1,
          shape: 'star',
          colors: [CALY[0], CALY[1], CALY[2]],
        })
      }
    if (t > C_REVEAL && r() < 0.3 * s.many)
      s.fx.add({
        x: r.range(0, s.w),
        y: -3,
        vx: r.range(4, 10),
        vy: r.range(14, 24),
        life: s.h / 18,
        size: 2,
        shape: 'leaf',
        spin: r.range(-3, 3),
        colors: ['#ffd0e8'],
        light: '#fff0f8',
        dark: '#e090b8',
      })
  },
  back(g, s, t) {
    g.drawImage(s.back, 0, 0)
    // The statue: the king's own shape in worn stone, coming back to colour at the reveal.
    const sx = Math.round(s.w * 0.86)
    const sb = s.horizon + Math.round(s.h * 0.06) - 8
    drawSprite(g, s.mon, sx, sb, { sx: 0.4, sy: 0.4, sil: t > C_REVEAL ? '#9ac89a' : '#7a7a8a' })
    // The snow, melting back from the seed in a widening ring of soil.
    g.drawImage(s.snowField, 0, s.horizon)
    const R = ease.ioS(span(t, T_MELT, T_BLOOM)) * Math.hypot(s.w, s.h) * 0.85
    if (R > 1)
      for (let y = s.horizon; y < s.h; y++) {
        const dy = (y - s.fy) * 1.8
        const hw2 = R * R - dy * dy
        if (hw2 <= 0) continue
        const hw = Math.round(Math.sqrt(hw2))
        const x0 = Math.max(0, s.cx - hw)
        const x1 = Math.min(s.w, s.cx + hw)
        if (x1 > x0) g.drawImage(s.soil, x0, y - s.horizon, x1 - x0, 1, x0, y, x1 - x0, 1)
        // A dithered thaw line at the ring's edge.
        if (hw > 2) {
          rect(g, s.cx - hw - 2, y, 2, 1, y & 1 ? '#8aa0b8' : '#6a5a48')
          rect(g, s.cx + hw, y, 2, 1, y & 1 ? '#8aa0b8' : '#6a5a48')
        }
      }
    // The green rings out of the seed.
    for (const [i, at] of [T_SEED, T_MELT, T_MELT + 0.4].entries())
      burstRing(g, s.cx, s.fy, span(t, at, at + 0.8), s.w * 0.9, 2, i % 2 ? CALY[1] : CALY[2])
    if (t > T_SEED - 0.4 && t < T_GROW + 0.3) {
      const gr = Math.round(6 + 3 * Math.sin(t * 10))
      g.drawImage(glow(gr, CALY[2], 1.3, 0.8), s.cx - gr, s.fy - gr)
      rect(g, s.cx - 1, s.fy - 1, 3, 2, CALY[0])
    }
    // The harvest growing in waves outward, the rows swaying.
    for (const p of s.plants) {
      const t0 = T_GROW - 0.3 + p.d * 1.6
      const q = span(t, t0, t0 + 0.4)
      if (q <= 0) continue
      const sway = Math.round(Math.sin(t * 3 + p.x * 0.1) * span(t, T_BLOOM, T_BLOOM + 0.5))
      plant(g, p.x, p.y, q, p.kind, span(t, T_BLOOM + p.d * 0.8, T_BLOOM + p.d * 0.8 + 0.3), sway, p.k)
    }
    drawCrown(g, s, t)
  },
  before(g, s, t) {
    // The king appearing beneath the crown, out of the light.
    if (t > T_KING) {
      const q = span(t, T_KING, C_REVEAL - 0.1)
      dissolveSprite(g, s, q)
    }
  },
  sounds: [
    [0.05, () => hiss(2.4, { freq: 1200, type: 'lowpass', vol: 0.03 })],
    [T_SEED, () => tone(784, 0.4, { type: 'triangle', vol: 0.03 })],
    [T_MELT, () => (fxSound('psychic.focus'), hiss(1, { freq: 2000, slide: -1200, vol: 0.03 }))],
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_GROW + i * 0.12,
          () => tone([523, 587, 659, 784, 880, 988, 1047, 1175][i]!, 0.1, { type: 'triangle', vol: 0.03 }),
        ] as const,
    ),
    [T_BLOOM, () => tone(1319, 0.6, { type: 'sine', vol: 0.025 })],
    [T_CROWN, () => fxSound('evolve.touch')],
    [T_CROWN + 0.4, () => tone(392, 1.2, { type: 'triangle', vol: 0.03, slide: 196 })],
    [T_KING, () => fxSound('legend.heart')],
  ],
})

/** A plant at scale k: a carrot's feathery greens fanning up, its orange shoulder in the soil, a flower on some. */
function plant(g: G, x: number, y: number, q: number, kind: number, bloom: number, sway: number, k: number) {
  const ht = Math.round((3 + q * 9) * k)
  if (kind <= 1 && q > 0.6) {
    const cw = Math.max(1, Math.round(1.5 * k))
    rect(g, x - cw, y - 1, cw * 2 + 1, Math.max(2, Math.round(2 * k)), '#e07a2a')
    rect(g, x - cw, y - 1, cw * 2 + 1, 1, '#ffa050')
  }
  // Three fronds: out to each side and straight up, leafy at their tips.
  for (const f of [-1, 0, 1]) {
    const tx = x + f * Math.round(ht * 0.45) + sway
    const ty = y - ht + Math.abs(f) * Math.round(ht * 0.3)
    line(g, x, y - 1, tx, ty, f ? '#3a8a3a' : '#4aa03a')
    if (q > 0.5) {
      rect(g, tx - 1, ty, 2, 1, '#5ac04a')
      rect(g, tx, ty - 1, 1, 1, '#8ae06a')
    }
  }
  if (bloom > 0 && kind >= 2) {
    const c = kind === 2 ? '#ffd23a' : '#ffa0d0'
    const fx = x + sway
    const fy = y - ht - 1
    const pr = Math.max(1, Math.round(k * bloom))
    rect(g, fx - pr, fy, pr * 2 + 1, 1, c)
    rect(g, fx, fy - pr, 1, pr * 2 + 1, c)
    if (pr > 1) rect(g, fx - 1, fy - 1, 3, 3, c)
    rect(g, fx, fy, 1, 1, '#ffffff')
  }
}

/** Where the crown hangs: high over the field, then coming down onto the king's head. */
const crownY = (s: Raid, t: number) =>
  Math.round(lerp(s.h * 0.2, s.feet - s.sz.h - 4, ease.ioS(span(t, T_KING - 0.1, C_REVEAL - 0.05))))

/** The crown of light: a gold band and five points with gems, turning (its points slide round), beaming. */
function drawCrown(g: G, s: Raid & CX, t: number) {
  const k = ease.outBack(span(t, T_CROWN, T_CROWN + 0.4), 1.6)
  if (k <= 0 || t > C_REVEAL + 0.05) return
  const y = crownY(s, t)
  const W = Math.round(Math.max(18, s.m * 0.16) * k)
  const H = Math.round(W * 0.5)
  const gr = Math.round(W * 1.6)
  g.drawImage(glow(gr, GOLD[2], 1.3, 0.6), s.cx - gr, y - gr)
  // Beams fanning down from it.
  if (t < T_KING)
    for (let i = -2; i <= 2; i++)
      tri(g, s.cx - 2, y + 2, s.cx + 2, y + 2, s.cx + i * W * 0.9, s.fy, pattern(g, GOLD[1], 2))
  rect(g, s.cx - W, y, W * 2, Math.max(2, Math.round(H * 0.35)), GOLD[1])
  rect(g, s.cx - W, y, W * 2, 1, GOLD[0])
  rect(g, s.cx - W, y + Math.max(2, Math.round(H * 0.35)) - 1, W * 2, 1, GOLD[3])
  for (let i = 0; i < 5; i++) {
    // The points slide round the band as it turns; the back ones darker.
    const a = (i / 5) * Math.PI * 2 + t * 2
    const px = s.cx + Math.sin(a) * W * 0.85
    const back = Math.cos(a) < 0
    tri(g, px - 3, y + 1, px + 3, y + 1, px, y - H, back ? GOLD[2] : GOLD[1])
    if (!back) {
      line(g, px - 2, y, px, y - H + 1, GOLD[0])
      rect(g, px - 1, y + 1, 2, 2, i % 2 ? '#ff4a6a' : '#4ac8ff')
    }
  }
  ellipseLine(g, s.cx, y + 1, W, 2, GOLD[0], 0, Math.PI)
}

/** The king, coming out of the light in dithered steps under the crown. */
function dissolveSprite(g: G, s: Raid, q: number) {
  const c = calySil.get(s.mon)
  if (!c) {
    const cv = canvas(s.sz.w + 2, s.sz.h + 2)
    drawSprite(cv.g, s.mon, Math.round((s.sz.w + 2) / 2), s.sz.h + 1, { sil: '#f0ffe0', outline: CALY[2] })
    calySil.set(s.mon, cv)
    return dissolveSprite(g, s, q)
  }
  const y = s.feet - Math.round(Math.sin(q * Math.PI) * 2)
  dissolve(g, c, ease.inQ(q), s.cx - Math.round(c.width / 2), y - c.height + 1)
}
const calySil = new Map<string, Canvas>()
