// Meltan's entrance (docs/53), on the battle stage: a scrapyard at night under one sodium lamp, heaps of scrap, a crane
// with an electromagnet hanging over the middle of the yard. The magnet hums on: every loose nut and bolt in the yard
// leaps up and clings to it. Then eyes in the heaps, dozens of them: Meltan, popping out of the scrap and scuttling
// down to the middle, a swarm. One of them is chewing the magnet's cable; it sparks, the magnet dies, and everything it
// held rains down on the swarm. They melt together, scrap and all, into a glowing pool of metal that gathers itself up
// into a blob, then into a great hex nut, white-hot, spinning and cooling. It snaps small, and Meltan is there.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  bolt,
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  icon,
  lerp,
  line,
  polyline,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { spriteSize } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
const GROUND = 88
const T_MAGNET = 0.6
const T_SWARM = 1.45
const T_CUT = 2.45
const T_MELT = 2.75
const T_NUT = 3.3
const MAG = { x: 173, y: 26 }
const HOT = ['#ffffff', '#fff6c8', '#ffd23a', '#ff8a1e', '#c83a10'] as const
const STEEL = ['#ffffff', '#d8dce8', '#a8acb8', '#6a6e7a', '#3a3c46'] as const

/** A Meltan, tiny: its nut head (gold, the eye in the hole), its body of liquid metal. */
const MELTAN = ['.yyyyy.', 'yyyyyyy', 'yyykyyy', 'yyyyyyy', '.yyyyy.', '..sss..', '.sssss.', '..s.ss.']
const PAL = { y: '#e8b83a', k: '#1a1a1a', s: '#b8bcc8' }
/** Loose scrap: a nut, a bolt, a scrap of plate. */
const SCRAP = {
  nut: ['.ll.', 'lkkg', 'gkkd', '.dd.'],
  bolt: ['lgg', '.d.', '.g.', '.d.'],
  plate: ['lllgg', 'gdddd'],
} as const

interface Bit {
  kind: keyof typeof SCRAP
  x: number
  y: number
  /** Where it clings under the magnet, and when it leaps. */
  ox: number
  oy: number
  at: number
}

interface Mel {
  x: number
  y: number
  at: number
  tx: number
  ty: number
  speed: number
}

type X = { back: Canvas; bits: Bit[]; mels: Mel[]; cable: [number, number][] }

/** The yard: night, a lamp, the crane's boom and cable, heaps of scrap each side, the oily ground. */
function yard(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, GROUND, ['#06060e', '#0e0c1a', '#1a1424', '#261a22']), 0, 0)
  for (let i = 0; i < 26; i++) rect(g, r.range(0, W), r.range(0, 50), 1, 1, '#5a5a7a')
  // A fence far off, chain-link against the sky.
  rect(g, 0, GROUND - 26, W, 1, '#2a2a36')
  for (let x = 0; x < W; x += 3) line(g, x, GROUND - 26, x + 3, GROUND - 6, '#1c1c28')
  for (let x = 0; x < W; x += 30) rect(g, x, GROUND - 30, 2, 30, '#2a2a36')
  // The crane: a lattice boom from the left over the middle, the cable hanging.
  const base = { x: 6, y: GROUND - 4 }
  const tip = { x: MAG.x + 4, y: 8 }
  line(g, base.x, base.y, tip.x, tip.y, '#5a4a20', 2)
  line(g, base.x + 8, base.y, tip.x, tip.y + 4, '#5a4a20', 2)
  for (let k = 0; k < 14; k++) {
    const q0 = k / 14
    const q1 = (k + 1) / 14
    line(
      g,
      lerp(base.x, tip.x, q0),
      lerp(base.y, tip.y, q0),
      lerp(base.x + 8, tip.x, q1),
      lerp(base.y, tip.y + 4, q1),
      '#3a3014',
    )
  }
  rect(g, 0, GROUND - 14, 20, 14, '#3a3428')
  rect(g, 2, GROUND - 12, 6, 5, '#6a8a9a')
  // Heaps of scrap each side: dark mounds bristling with sheets, pipes, a tyre, a car door.
  for (const [cx, half, ht] of [
    [30, 44, 40],
    [92, 26, 18],
    [226, 40, 46],
  ] as const) {
    tri(g, cx - half, GROUND + 2, cx + half, GROUND + 2, cx, GROUND - ht, '#1c1a20')
    tri(g, cx - half, GROUND + 2, cx, GROUND - ht, cx - 6, GROUND + 2, '#24222a')
    for (let i = 0; i < 16; i++) {
      const q = r()
      const x = cx + r.range(-half, half) * (1 - q * 0.8)
      const y = GROUND - q * ht + r.range(-2, 4)
      const kind = r()
      if (kind < 0.35) rect(g, x, y, r.range(4, 10), 2, r() < 0.5 ? '#5a5e6a' : '#7a4a2a')
      else if (kind < 0.6) line(g, x, y, x + r.range(-8, 8), y - r.range(2, 8), '#6a6e7a', 2)
      else if (kind < 0.75) {
        ellipseLine(g, x, y, 4, 3, '#121216')
        ellipseLine(g, x, y, 3, 2, '#121216')
      } else rect(g, x, y, 3, 3, '#4a4e5a')
      if (r() < 0.3) rect(g, x, y, 1, 1, '#a8acb8')
    }
  }
  // The ground: packed dirt, oil stains, the lamp's pool.
  g.drawImage(dGradient(W, H - GROUND, ['#2a2420', '#1e1a18', '#121010']), 0, GROUND)
  rect(g, 0, GROUND, W, 1, '#3a322a')
  for (let i = 0; i < 6; i++) ellipse(g, r.range(0, W), r.range(GROUND + 8, H), r.range(6, 14), 2, '#14121a')
  // The sodium lamp on its pole.
  rect(g, 122, 30, 2, GROUND - 30, '#2a2a36')
  rect(g, 118, 28, 10, 3, '#3a3a46')
  return cv
}

/** A hex nut seen turning: its six faces squeezed by how far round it is, a hole in it, a lit edge. */
function hexNut(g: G, x: number, y: number, R: number, spin: number, cols: readonly string[]) {
  const sx = Math.max(0.12, Math.abs(Math.cos(spin)))
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = (k * Math.PI) / 3 + Math.PI / 6
    return [x + Math.cos(a) * R * sx, y + Math.sin(a) * R] as [number, number]
  })
  // Its thickness, showing on the side as it turns.
  const th = Math.round(R * 0.45 * Math.abs(Math.sin(spin)))
  const dir = Math.sin(spin) > 0 ? 1 : -1
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = pts[k]!
    const [bx, by] = pts[(k + 1) % 6]!
    tri(g, x + dir * th, y, ax + dir * th, ay, bx + dir * th, by, cols[3]!)
  }
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = pts[k]!
    const [bx, by] = pts[(k + 1) % 6]!
    // Each face lit by which way it looks: the top ones brighter.
    tri(g, x, y, ax, ay, bx, by, cols[(ay + by) / 2 < y - R * 0.3 ? 1 : (ay + by) / 2 > y + R * 0.3 ? 3 : 2]!)
    line(g, ax, ay, bx, by, cols[0]!)
  }
  ellipse(g, x, y, Math.max(1, Math.round(R * 0.42 * sx)), Math.round(R * 0.42), cols[4]!)
  ellipseLine(
    g,
    x,
    y,
    Math.max(1, Math.round(R * 0.42 * sx)),
    Math.round(R * 0.42),
    cols[3]!,
    Math.PI,
    Math.PI * 2,
  )
}

export const meltanCinema = bossCinema<X>({
  id: 'cinema-meltan',
  reveal: REVEAL,
  seed: 808,
  aura: ['#ffffff', '#fff3a0', '#e8b83a', '#4a4e5a'],
  flash: '#fffbe8',
  setup(st, r) {
    const foe = st.L.foe
    const bits: Bit[] = Array.from({ length: 30 }, (_, i) => {
      const a = r() * Math.PI * 2
      const rr = Math.sqrt(r())
      return {
        kind: (['nut', 'nut', 'bolt', 'plate'] as const)[i % 4]!,
        x: r.range(10, W - 10),
        y: r.range(GROUND + 4, H - 6),
        ox: Math.cos(a) * rr * 12,
        oy: 10 + Math.abs(Math.sin(a)) * rr * 8,
        at: T_MAGNET + 0.2 + (i / 30) * 0.9,
      }
    })
    // The swarm: out of the heaps, down to the middle.
    const heaps: [number, number][] = [
      [30, GROUND - 20],
      [18, GROUND - 8],
      [50, GROUND - 10],
      [92, GROUND - 8],
      [226, GROUND - 24],
      [212, GROUND - 10],
      [238, GROUND - 6],
    ]
    const mels: Mel[] = Array.from({ length: 34 }, (_, i) => {
      const [hx, hy] = heaps[i % heaps.length]!
      return {
        x: hx + r.range(-10, 10),
        y: hy + r.range(-6, 6),
        at: T_SWARM + r.range(0, 0.7),
        tx: foe.x + r.range(-20, 20),
        ty: foe.y - r.range(0, 8),
        speed: r.range(0.45, 0.8),
      }
    })
    return { back: yard(r), bits, mels, cable: [] }
  },
  step(s, t, dt) {
    const r = s.r
    const foe = s.L.foe
    // Sparks where the cable is chewed through.
    if (t > T_CUT - 0.3 && t < T_CUT + 0.1 && r() < 0.6)
      s.fx.add({
        x: MAG.x + 3,
        y: MAG.y - 10,
        vx: r.range(-40, 40),
        vy: r.range(-40, 10),
        ay: 200,
        life: 0.3,
        size: 1,
        shape: 'px',
        colors: ['#ffffff', '#fff3a0', '#5ad8ff'],
      })
    // The pool: heat shimmer and spits of molten metal.
    if (t > T_MELT && t < REVEAL && r() < 0.7)
      s.fx.add({
        x: foe.x + r.range(-20, 20),
        y: foe.y - 2,
        vx: r.range(-20, 20),
        vy: -r.range(30, 70),
        ay: 200,
        life: 0.5,
        size: 1,
        shape: 'sq',
        colors: [HOT[0], HOT[2], HOT[3]],
      })
    if (within(t, REVEAL, REVEAL + dt))
      for (let k = 0; k < 30; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: foe.x,
          y: foe.y - 14,
          vx: Math.cos(a) * r.range(50, 120),
          vy: Math.sin(a) * r.range(50, 120),
          drag: 2.5,
          life: r.range(0.5, 0.9),
          size: 2,
          shape: r() < 0.5 ? 'star' : 'sq',
          colors: [...STEEL.slice(0, 3), '#e8b83a'],
        })
      }
  },
  back(g, s, t, k) {
    dissolve(g, s.back, k)
    // Leaving: its dark thins out with the rest of the scene.
    if (k <= 0.5) return void wash(g, '#02020a', 0.18 * k, 8)
    const foe = s.L.foe
    // The lamp's light, warm, flickering.
    const lit = Math.floor(t * 7) % 9 === 0 ? 0.25 : 0.375
    g.drawImage(glow(40, '#c88a3a', 1.7, lit), 123 - 40, 30 - 6)
    rect(g, 119, 31, 8, 2, '#ffd88a')
    // The cable and the electromagnet: humming on, rings of force going down, then dead once it is cut.
    const on = t > T_MAGNET && t < T_CUT
    line(g, MAG.x + 4, 8, MAG.x, MAG.y - 6, '#1a1a20')
    rect(g, MAG.x - 12, MAG.y - 6, 24, 6, '#4a4e5a')
    rect(g, MAG.x - 12, MAG.y - 6, 24, 1, '#8a8e9a')
    rect(g, MAG.x - 14, MAG.y, 28, 3, on ? '#5ad8ff' : '#2a2c34')
    if (on) {
      g.drawImage(glow(18, '#2a8aff', 1.4, 0.5), MAG.x - 18, MAG.y - 8)
      for (const d of [0, 0.33, 0.66]) {
        const q = (t * 1.5 + d) % 1
        ellipseLine(
          g,
          MAG.x,
          MAG.y + 4 + q * 40,
          Math.round(14 + q * 20),
          Math.round(3 + q * 4),
          q < 0.5 ? '#5ad8ff' : '#2a6ab0',
        )
      }
    }
    // The Meltan on the cable, chewing.
    if (t > T_SWARM + 0.4 && t < T_CUT + 0.1) {
      const m = icon(MELTAN, PAL)
      g.drawImage(m, MAG.x - 1, MAG.y - 16 + (Math.floor(t * 10) % 2))
    }
    // The scrap: on the ground, leaping to the magnet, clinging, then falling onto the swarm and melting.
    for (const b of s.bits) {
      const im = icon(SCRAP[b.kind], { l: '#e8ecf4', g: '#a8acb8', k: '#2a2a34', d: '#6a6e7a' }, 2)
      let x = b.x
      let y = b.y
      if (t > b.at) {
        const q = ease.inQ(span(t, b.at, b.at + 0.35))
        x = lerp(b.x, MAG.x + b.ox, q)
        y = lerp(b.y, MAG.y + b.oy, q)
        // Jittering in the field before it leaps.
      } else if (t > b.at - 0.3) x += Math.floor(t * 30) % 2 ? 1 : -1
      if (t > T_CUT) {
        const f = t - T_CUT
        x = MAG.x + b.ox * (1 + f)
        y = Math.min(foe.y - 2, MAG.y + b.oy + 160 * f * f)
        if (t > T_MELT + 0.15) continue
      }
      g.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2))
    }
    // The swarm: eyes glinting in the heaps, then popping out and scuttling down to the middle in hops.
    const m = icon(MELTAN, PAL)
    for (const mel of s.mels) {
      if (t < mel.at - 0.4 || t > T_MELT + 0.2) continue
      if (t < mel.at) {
        if (Math.floor(t * 8 + mel.x) % 3) rect(g, mel.x, mel.y, 1, 1, '#ffd23a')
        continue
      }
      const q = span(t, mel.at, mel.at + mel.speed)
      const x = lerp(mel.x, mel.tx, q)
      const hop = Math.abs(Math.sin(q * Math.PI * 5)) * 4 * (1 - q)
      const y = lerp(mel.y, mel.ty, q) - hop
      // Melting: sinking into the pool.
      const melt = span(t, T_MELT - 0.05, T_MELT + 0.2)
      if (melt > 0) {
        g.drawImage(
          m,
          0,
          0,
          m.width,
          Math.max(1, Math.round(m.height * (1 - melt))),
          Math.round(x - 3),
          Math.round(y - 7 + m.height * melt),
          m.width,
          Math.max(1, Math.round(m.height * (1 - melt))),
        )
        continue
      }
      g.drawImage(m, Math.round(x - 3), Math.round(y - 7))
    }
    wash(g, '#02020a', 0.3 * (1 - span(t, T_MELT, T_MELT + 0.4) * 0.7), 8)
  },
  before(g, s, t) {
    const foe = s.L.foe
    const fz = spriteSize(s.foe)
    if (t < T_MELT) return
    // The pool of molten metal: spreading, rippling, glowing at its rim; then drawn up into a blob.
    const spread = ease.outC(span(t, T_MELT, T_MELT + 0.3))
    const gather = ease.inQ(span(t, T_NUT - 0.25, T_NUT + 0.1))
    const rx = Math.round(26 * spread * (1 - gather * 0.7))
    if (rx > 1) {
      g.drawImage(glow(rx + 10, HOT[3], 1.5, 0.6), foe.x - rx - 10, foe.y - rx - 10)
      ellipse(g, foe.x, foe.y, rx + 1, 5, HOT[3])
      ellipse(g, foe.x, foe.y, rx, 4, STEEL[2])
      ellipse(g, foe.x - 2, foe.y - 1, Math.max(1, rx - 6), 2, STEEL[1])
      for (let i = 0; i < 3; i++) {
        const bx = foe.x + Math.round(Math.sin(t * 7 + i * 2.1) * rx * 0.6)
        rect(g, bx, foe.y - 1 - (Math.floor(t * 12 + i) % 2), 2, 1, '#ffffff')
      }
    }
    // The blob rising out of the pool, and the nut forming from it, white-hot, turning, cooling to gold.
    const cy = Math.round(foe.y - fz.h * 0.55)
    if (t > T_NUT - 0.3 && t < T_NUT + 0.15) {
      const q = span(t, T_NUT - 0.3, T_NUT + 0.1)
      const by = Math.round(lerp(foe.y - 3, cy, ease.outC(q)))
      const br = Math.round(lerp(6, 12, q))
      line(g, foe.x, foe.y - 2, foe.x, by, STEEL[2], Math.max(1, Math.round(6 * (1 - q))))
      ellipse(g, foe.x, by, br, br, STEEL[2])
      ellipse(g, foe.x - 2, by - 2, Math.max(1, br - 4), Math.max(1, br - 4), STEEL[1])
      rect(g, foe.x - 4, by - 5, 2, 2, '#ffffff')
    }
    if (t >= T_NUT && t < REVEAL) {
      const q = span(t, T_NUT, REVEAL)
      const cool = span(t, T_NUT + 0.2, REVEAL - 0.1)
      const R = Math.round(
        lerp(14, 18, ease.outBack(Math.min(1, q * 3), 2)) *
          (1 - ease.inQ(span(t, REVEAL - 0.15, REVEAL)) * 0.6),
      )
      const cols =
        cool < 0.5
          ? [HOT[0], HOT[1], HOT[2], HOT[3], '#3a1008']
          : ['#fff6c8', '#ffe08a', '#e8b83a', '#8a6a1a', '#1a1a1a']
      g.drawImage(glow(R + 12, cool < 0.5 ? HOT[2] : '#e8b83a', 1.4, 0.6), foe.x - R - 12, cy - R - 12)
      hexNut(g, foe.x, cy, R, (t - T_NUT) * lerp(14, 4, q), cols)
    }
  },
  front(g, s, t) {
    const foe = s.L.foe
    const fz = spriteSize(s.foe)
    // The cable parting: a spark, a snap.
    if (within(t, T_CUT, T_CUT + 0.15)) {
      const pts = bolt(rng(9), MAG.x - 6, MAG.y - 12, MAG.x + 8, MAG.y - 2, 0.4, 3)
      polyline(g, pts, '#ffffff')
    }
    // The scrap landing: a clang ring; the nut forming: a ring of heat.
    burstRing(g, foe.x, foe.y - 4, span(t, T_CUT + 0.3, T_CUT + 0.7), 60, 2, STEEL[1])
    burstRing(g, foe.x, foe.y - fz.h * 0.55, span(t, T_NUT, T_NUT + 0.5), 70, 2, HOT[2])
  },
  sounds: [
    [0.1, () => hiss(3.6, { freq: 300, type: 'lowpass', vol: 0.02 })],
    [T_MAGNET, () => tone(60, 1.85, { type: 'sawtooth', vol: 0.03 })],
    [T_MAGNET + 0.05, () => tone(120, 1.8, { type: 'square', vol: 0.01 })],
    ...Array.from(
      { length: 10 },
      (_, i) =>
        [T_MAGNET + 0.25 + i * 0.09, () => tone(1800 + i * 90, 0.03, { type: 'square', vol: 0.02 })] as const,
    ),
    ...Array.from(
      { length: 8 },
      (_, i) =>
        [
          T_SWARM + i * 0.09,
          () => tone(880 + (i % 3) * 220, 0.05, { type: 'triangle', vol: 0.025 }),
        ] as const,
    ),
    [T_CUT - 0.25, () => hiss(0.3, { freq: 3500, q: 3, vol: 0.04 })],
    [T_CUT, () => (fxSound('thunder.strike'), tone(300, 0.4, { type: 'sawtooth', vol: 0.03, slide: -250 }))],
    [
      T_CUT + 0.3,
      () =>
        [0, 0.05, 0.11, 0.16].forEach((at, i) =>
          tone(1300 - i * 150, 0.12, { type: 'square', vol: 0.03, at }),
        ),
    ],
    [T_MELT, () => (fxSound('fire.stream'), hiss(0.6, { freq: 2000, slide: -1200, vol: 0.05 }))],
    [T_NUT, () => tone(220, 0.6, { type: 'triangle', vol: 0.05, slide: 440 })],
    [3.7, () => fxSound('legend.heart')],
    [REVEAL, () => (fxSound('ball.pop'), fxSound('legend.roar'))],
  ],
})
