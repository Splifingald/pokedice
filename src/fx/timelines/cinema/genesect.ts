// Genesect's entrance (docs/53), on the battle stage: Team Plasma's laboratory, a steel hangar in red emergency light,
// hex-plated walls, a launch pad, and over it a rig of clamps holding a dark insect shape. The feeder arm brings the
// drives one by one and clicks each into its back: Douse, Shock, Burn, Chill, the lab flaring blue, yellow, red, white
// with each. A red scan line sweeps it, a targeting reticle hunts across the stage and locks onto where your Pokémon
// will stand. The clamps let go, steam bursts, it drops onto the pad; the cannon on its back charges through all four
// colours and fires Techno Blast across the stage, the target spot bursting. Smoke clears off it.
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
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, screenFlash, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve } from './kit'

const REVEAL = 4.0
/** The drives: when each clicks home, its colour. Douse, Shock, Burn, Chill. */
const DRIVES: readonly [number, string][] = [
  [1.0, '#3a9aff'],
  [1.38, '#ffd23a'],
  [1.76, '#ff4a2a'],
  [2.14, '#c8f4ff'],
]
const FEED = 0.28
const T_SCAN = 0.9
const T_LOCK = 2.3
const T_DROP = 2.45
const T_CHARGE = 2.7
const T_FIRE = 3.3
const T_FIRE_END = 3.62
const FLOOR = 112

type X = { lab: Canvas }

/** The hangar: hex-plated walls, a gantry, hazard stripes, the grated floor and the launch pad's rings. */
function labAt(foe: { x: number; y: number }): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, FLOOR, ['#0a0810', '#120e1a', '#1a1424', '#20182c']), 0, 0)
  // Hex plates: rows of hexagon outlines, every other row offset.
  for (let row = 0; row * 9 < FLOOR - 20; row++)
    for (let col = -1; col * 14 < W + 14; col++) {
      const x = col * 14 + (row % 2) * 7
      const y = 6 + row * 9
      const pts: [number, number][] = [
        [x - 6, y],
        [x - 3, y - 4],
        [x + 3, y - 4],
        [x + 6, y],
        [x + 3, y + 4],
        [x - 3, y + 4],
      ]
      for (let i = 0; i < 6; i++) {
        const [ax, ay] = pts[i]!
        const [bx, by] = pts[(i + 1) % 6]!
        line(g, ax, ay, bx, by, i < 3 ? '#2e2440' : '#0c0a12')
      }
    }
  // A gantry across the top, the rig's rails down from it.
  rect(g, 0, 8, W, 6, '#2a2434')
  rect(g, 0, 8, W, 1, '#5a5068')
  rect(g, 0, 13, W, 1, '#08060c')
  for (let x = 4; x < W; x += 10) rect(g, x, 9, 6, 4, '#1c1826')
  for (const dx of [-34, 30]) {
    rect(g, foe.x + dx, 14, 4, 46, '#2a2434')
    rect(g, foe.x + dx, 14, 1, 46, '#5a5068')
  }
  // Pipes down the walls, and hazard stripes along the wall's foot.
  for (const x of [22, 30, 214]) {
    rect(g, x, 14, 4, FLOOR - 14, '#241e2e')
    rect(g, x, 14, 1, FLOOR - 14, '#4a4058')
  }
  for (let x = 0; x < W; x++)
    for (let y = FLOOR - 6; y < FLOOR; y++) rect(g, x, y, 1, 1, ((x + y) >> 2) % 2 ? '#3a3010' : '#141008')
  // The floor: steel grating in perspective.
  g.drawImage(dGradient(W, H - FLOOR, ['#2a2434', '#1a1622', '#0c0a10']), 0, FLOOR)
  rect(g, 0, FLOOR, W, 1, '#6a6078')
  for (let k = 1; k < 6; k++) rect(g, 0, FLOOR + Math.round((k / 6) ** 1.4 * (H - FLOOR)), W, 1, '#0c0a10')
  for (let k = -12; k <= 12; k++) line(g, W / 2 + k * 12, FLOOR, W / 2 + k * 30, H, '#0c0a10')
  // The launch pad under its place: rings of steel.
  ellipse(g, foe.x, foe.y + 3, 34, 8, '#1a1622')
  ellipseLine(g, foe.x, foe.y + 3, 34, 8, '#5a5068')
  ellipseLine(g, foe.x, foe.y + 3, 24, 5, '#3a3448')
  return cv
}

let scratch: Canvas | null = null

export const genesectCinema = bossCinema<X>({
  id: 'cinema-genesect',
  reveal: REVEAL,
  seed: 649,
  aura: ['#ffffff', '#f0c8ff', '#b05ae0', '#4a1a6a'],
  flash: '#f4e8ff',
  setup(st) {
    return { lab: labAt(st.L.foe) }
  },
  step(s, t, dt) {
    const r = s.r
    const f = s.L.foe
    const fs = s.fs
    const cannon = { x: f.x + fs.w * 0.28, y: f.y - fs.h * 0.82 }
    // Each drive clicks home: sparks in its colour.
    DRIVES.forEach(([at, c]) => {
      if (within(t, at, at + dt))
        for (let i = 0; i < 14; i++)
          s.fx.add({
            x: cannon.x,
            y: cannon.y - 8,
            vx: r.range(-50, 50),
            vy: r.range(-60, 10),
            ay: 200,
            life: 0.4,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', c],
          })
    })
    // The clamps let go: steam bursting from the rig.
    if (within(t, T_DROP, T_DROP + dt))
      for (let i = 0; i < 30; i++) {
        const side = i % 2 ? 1 : -1
        s.fx.add({
          x: f.x + side * 32,
          y: r.range(30, 60),
          vx: side * r.range(20, 60),
          vy: r.range(-20, 10),
          drag: 2,
          life: r.range(0.6, 1.1),
          size: r.int(2, 4),
          size1: 6,
          shape: 'smoke',
          density: 0.5,
          colors: ['#e8e0f0', '#a8a0b8'],
        })
      }
    // The charge: light of every drive pulled into the cannon.
    if (t > T_CHARGE && t < T_FIRE && r() < 0.9)
      for (let i = 0; i < 2; i++) {
        const a = r() * Math.PI * 2
        const d = r.range(30, 60)
        s.fx.add({
          x: cannon.x + Math.cos(a) * d,
          y: cannon.y + Math.sin(a) * d,
          home: { x: cannon.x, y: cannon.y, k: 700 },
          life: 0.5,
          size: 1,
          shape: 'plus',
          colors: ['#ffffff', DRIVES[Math.floor(r() * 4)]![1]],
        })
      }
    // Where it lands: the target bursts.
    if (within(t, T_FIRE + 0.05, T_FIRE + 0.05 + dt))
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: s.L.own.x,
          y: s.L.own.y - 24,
          vx: Math.cos(a) * r.range(40, 140),
          vy: Math.sin(a) * r.range(40, 140),
          drag: 2,
          life: r.range(0.4, 0.9),
          size: r.int(1, 2),
          shape: r() < 0.5 ? 'sq' : 'px',
          colors: ['#ffffff', DRIVES[i % 4]![1], '#4a1a6a'],
        })
      }
    // Smoke off it and off the cannon afterwards.
    if (t > T_FIRE_END && t < REVEAL + 1 && r() < 0.35)
      s.fx.add({
        x: cannon.x + r.range(-2, 2),
        y: cannon.y,
        vx: r.range(-4, 4),
        vy: -r.range(10, 20),
        life: 1.2,
        size: 2,
        size1: 5,
        shape: 'smoke',
        density: 0.4,
        colors: ['#8a8098', '#5a5068'],
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    scratch ??= canvas(W, H)
    const c = scratch.g
    const f = s.L.foe
    c.clearRect(0, 0, W, H)
    c.drawImage(s.lab, 0, 0)
    // The red emergency lamps turning in the corners.
    for (const [x, dir] of [
      [12, 1],
      [W - 12, -1],
    ] as const) {
      const a = t * 5 * dir
      const on = 0.5 + 0.5 * Math.cos(a)
      rect(c, x - 3, 15, 6, 4, on > 0.5 ? '#ff3a2a' : '#7a140e')
      if (on > 0.3) c.drawImage(glow(26, '#c42a1e', 1.4, 0.45 * on), x - 26, 17 - 26)
    }
    // Each drive's colour flooding the lab for a moment.
    DRIVES.forEach(([at, col]) => {
      const q = within(t, at, at + 0.3) ? 1 - span(t, at, at + 0.3) : 0
      if (q > 0) c.drawImage(glow(56, col, 1.8, 0.45 * q), f.x - 56, f.y - 40 - 56)
    })
    // The status panel on the wall: a light for each drive that's in.
    for (let i = 0; i < 4; i++) {
      const [at, col] = DRIVES[i]!
      rect(c, 46 + i * 7, 40, 5, 3, t >= at ? col : '#1a1424')
      rect(c, 46 + i * 7, 40, 5, 1, t >= at ? '#ffffff' : '#2a2434')
    }
    rect(c, 44, 38, 30, 1, '#5a5068')
    // The launch pad's rings lighting when it lands.
    if (t > T_DROP + 0.12) ellipseLine(c, f.x, f.y + 3, 34, 8, Math.floor(t * 8) % 2 ? '#b05ae0' : '#f0c8ff')
    dissolve(g, scratch, k)
  },
  before(g, s, t) {
    const f = s.L.foe
    const fs = s.fs
    const cannon = { x: f.x + fs.w * 0.28, y: f.y - fs.h * 0.82 }
    // Held in the rig, then dropped onto the pad.
    const drop = ease.inQ(span(t, T_DROP, T_DROP + 0.12))
    const y = Math.round(lerp(f.y - 10, f.y, drop))
    const last = DRIVES.filter(([at]) => t >= at).at(-1)
    drawSprite(g, s.foe, f.x, y, {
      sil: '#140a1e',
      outline: last ? last[1] : Math.floor(t * 4) % 2 ? '#7a140e' : '#3a0a08',
    })
    // The clamps: closed on it, then pulled back up and out.
    const open = ease.outC(span(t, T_DROP - 0.1, T_DROP + 0.3))
    for (const sd of [-1, 1]) {
      const x = f.x + sd * (lerp(22, 40, open) + 0)
      const cy = lerp(f.y - fs.h * 0.55, 40, open)
      rect(g, x - 3, cy - 4, 6, 8, '#3a3448')
      rect(g, x - 3, cy - 4, 6, 1, '#7a7090')
      rect(g, x - sd * 5 - 2, cy - 1, 5, 3, '#5a5068')
      rect(g, f.x + sd * 32 - 1, 14, 2, Math.max(0, cy - 18), '#4a4058')
    }
    // The feeder arm bringing each drive in from the left to the slot on its back.
    DRIVES.forEach(([at, col]) => {
      const q = span(t, at - FEED, at)
      if (q <= 0 || t > at + 0.12) return
      const x = Math.round(lerp(-10, cannon.x, ease.ioQ(q)))
      const yy = Math.round(lerp(30, cannon.y - 8, ease.ioQ(q)))
      // The arm, a jointed bar from the gantry.
      line(g, x, 14, x, yy - 3, '#5a5068', 2)
      rect(g, x - 4, yy - 3, 9, 6, '#2a2434')
      rect(g, x - 3, yy - 2, 7, 4, col)
      rect(g, x - 3, yy - 2, 7, 1, '#ffffff')
    })
    // The scan: a red line sweeping down it and back up.
    if (t > T_SCAN && t < T_LOCK) {
      const q = (t - T_SCAN) * 1.4
      const k = q % 2 < 1 ? q % 1 : 1 - (q % 1)
      const sy = Math.round(lerp(f.y - fs.h - 6, f.y + 2, k))
      rect(g, f.x - fs.w / 2 - 8, sy, fs.w + 16, 1, '#ff3a2a')
      rect(g, f.x - fs.w / 2 - 8, sy - 1, fs.w + 16, 1, pattern(g, '#ff3a2a', 6))
    }
    // The reticle: hunting over the stage, then closing on the target and locking.
    if (t > 1.2 && t < T_FIRE_END) {
      const own = { x: s.L.own.x, y: s.L.own.y - 24 }
      const hunt = span(t, 1.2, T_LOCK)
      const x = Math.round(lerp(W * 0.45 + Math.sin(t * 5) * 40, own.x, ease.inQ(hunt)))
      const yy = Math.round(lerp(H * 0.5 + Math.cos(t * 4) * 20, own.y, ease.inQ(hunt)))
      const locked = t >= T_LOCK
      const R = Math.round(locked ? 10 + Math.max(0, 1 - (t - T_LOCK) * 6) * 6 : 16 - hunt * 4)
      const col = locked ? (Math.floor(t * 12) % 2 ? '#ff3a2a' : '#ffffff') : '#ff8a6a'
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        rect(g, x + sx * R - (sx > 0 ? 4 : 0), yy + sy * R, 5, 1, col)
        rect(g, x + sx * R, yy + sy * R - (sy > 0 ? 4 : 0), 1, 5, col)
      }
      rect(g, x - 1, yy, 3, 1, col)
      rect(g, x, yy - 1, 1, 3, col)
    }
    // The charge: a sphere at the cannon cycling through the drives' colours.
    if (t > T_CHARGE && t < T_FIRE_END) {
      const q = span(t, T_CHARGE, T_FIRE)
      const R = Math.round(lerp(2, 9, q) * (t > T_FIRE ? 1 - span(t, T_FIRE, T_FIRE_END) * 0.6 : 1))
      const col = DRIVES[Math.floor(t * 16) % 4]![1]
      g.drawImage(glow(R * 3, col, 1.3, 0.6), Math.round(cannon.x - R * 3), Math.round(cannon.y - R * 3))
      ellipse(g, cannon.x, cannon.y, R, R, col)
      ellipse(g, cannon.x, cannon.y, Math.max(1, R - 3), Math.max(1, R - 3), '#ffffff')
      if (t < T_FIRE)
        burstRing(g, cannon.x, cannon.y, 1 - ((t * 3) % 1), 30, 2, DRIVES[Math.floor(t * 3) % 4]![1])
    }
    // Techno Blast: a beam across the stage to the target, its bands cycling the four colours.
    if (t >= T_FIRE && t < T_FIRE_END) {
      const own = { x: s.L.own.x, y: s.L.own.y - 24 }
      const q = span(t, T_FIRE, T_FIRE + 0.06)
      const ex = lerp(cannon.x, own.x, q)
      const ey = lerp(cannon.y, own.y, q)
      const thin = 1 - span(t, T_FIRE_END - 0.12, T_FIRE_END)
      const wd = Math.max(1, Math.round(12 * thin))
      const cyc = Math.floor(t * 20)
      line(g, cannon.x, cannon.y, ex, ey, DRIVES[cyc % 4]![1], wd + 4)
      line(g, cannon.x, cannon.y, ex, ey, DRIVES[(cyc + 1) % 4]![1], Math.max(1, wd))
      line(g, cannon.x, cannon.y, ex, ey, '#ffffff', Math.max(1, wd - 6))
      // Rings running along it.
      for (let i = 0; i < 4; i++) {
        const k = ((t - T_FIRE) * 4 + i / 4) % 1
        const x = lerp(cannon.x, ex, k)
        const yy = lerp(cannon.y, ey, k)
        ellipseLine(g, x, yy, 4, wd, DRIVES[i]![1])
      }
    }
  },
  front(g, _s, t) {
    // The flashes of the drives and the blast (never closer than 0.34 s).
    for (const [at, col] of DRIVES) if (within(t, at, at + 0.08)) screenFlash(g, col, 0.2)
    if (within(t, T_FIRE, T_FIRE + 0.15)) screenFlash(g, '#ffffff', 0.5)
  },
  sounds: [
    [0.05, () => tone(55, 3.4, { type: 'sawtooth', vol: 0.015 })],
    ...[0.2, 0.8, 1.4, 2.0].map(
      (d) => [d, () => tone(660, 0.18, { type: 'square', vol: 0.02, slide: -200 })] as const,
    ),
    ...DRIVES.flatMap(
      ([at], i) =>
        [
          [at - FEED, () => hiss(FEED, { freq: 1500, slide: 800, vol: 0.03 })],
          [
            at,
            () => {
              tone(140, 0.08, { type: 'square', vol: 0.06 })
              hiss(0.06, { freq: 800, vol: 0.08 })
              tone([523, 659, 784, 1047][i]!, 0.2, { type: 'square', vol: 0.025, at: 0.06 })
            },
          ],
        ] as const,
    ),
    [T_SCAN, () => tone(1760, 1.3, { type: 'sine', vol: 0.01, slide: -400 })],
    [T_LOCK, () => [0, 0.08, 0.16].forEach((d) => tone(1568, 0.05, { type: 'square', vol: 0.03, at: d }))],
    [
      T_DROP,
      () => (
        hiss(0.6, { freq: 3000, slide: -2000, vol: 0.07 }),
        tone(80, 0.25, { type: 'square', vol: 0.06, at: 0.12 })
      ),
    ],
    [T_CHARGE, () => tone(220, 0.6, { type: 'sawtooth', vol: 0.03, slide: 1200 })],
    [3.0, () => fxSound('legend.heart')],
    [T_FIRE, () => (fxSound('mega.beam'), hiss(0.4, { freq: 2000, slide: -1500, vol: 0.1 }))],
    [T_FIRE + 0.05, () => hiss(0.5, { freq: 200, type: 'lowpass', vol: 0.14 })],
    [REVEAL, () => fxSound('legend.roar')],
  ],
})
