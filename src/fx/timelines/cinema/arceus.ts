// Arceus's entrances (docs/53): the god of the Hall of Origin, met two ways.
//
// The boss (`arceusCinema`, the battle stage): the night over Mt. Coronet, high above a sea of cloud, the Milky Way
// across the sky (not Spear Pillar's ruins: those are Dialga's and Palkia's, spearPillar.ts). The Azure Flute's notes
// drift up out of the clouds; the sky splits along a seam of light that opens into a gate, the Hall of Origin's
// colonnade glimpsed through it, and a stairway of light builds itself note by note from the clouds up to it. A white
// shape stands in the gate, the gold wheel round its middle shining, and walks down, growing as it nears, each step
// flaring under it. The plates fall like meteors, one of each colour, lighting the clouds round the stairs' foot; they
// lift and whirl round it, and it is there.
//
// The raid (`arceusRaidCinema`, the daily raid, full screen): the grandest of them. Black, a point of light; a staircase
// of light descends out of nothing, step by step, to a floor that isn't there yet. The Hall of Origin builds itself out
// of the light: the marble floor spreading out from the stairs' foot in a ring, the colonnades rising out of it into a
// dawn-gold sky. The seventeen plates flash into being one by one in a ring and turn; the god's golden wheel draws
// itself in the sky. Arceus walks down the stairs into the wheel while the plates whirl faster and rise; Judgment: they
// streak into the wheel's hub, which ignites, rays wheeling out. The reveal flings the plates back out into orbit round it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  mix,
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { H, screenFlash, screenShake, skippingNow, W, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import { bossCinema } from './boss'
import { AFTER_REVEAL, burstRing, dGradient, dissolve, inOrder, type Cinema, type CinemaParams } from './kit'

/** The seventeen plates' colours, by type (Normal's is the god's own white-gold, last). */
/** A glow's strength in eighths: `glow` caches each strength it is asked for, so a fading one makes eight, not one a frame. */
const q8 = (v: number) => Math.round(v * 8) / 8

const PLATES = [
  '#ee8130',
  '#6390f0',
  '#f7d02c',
  '#7ac74c',
  '#96d9d6',
  '#c22e28',
  '#a33ea1',
  '#e2bf65',
  '#a98ff3',
  '#f95587',
  '#a6b91a',
  '#b6a136',
  '#735797',
  '#6f35fc',
  '#705746',
  '#b7b7ce',
  '#fff0c0',
] as const
const AURA = ['#ffffff', '#fff3c0', '#e0b050', '#6a4a1a'] as const
const GOLD = { hi: '#fff4c0', lit: '#ffd870', mid: '#e0b050', dark: '#a87830' }

/** A plate: a little tablet in its colour, lit along its top, turning (`turn` −1..1: its face, edge-on at 0). */
function drawPlate(g: G, x: number, y: number, size: number, c: string, turn: number, t: number, i: number) {
  const pw = Math.max(2, Math.round(size))
  const ph = Math.round(pw * 1.35)
  const ww = Math.max(1, Math.round(pw * Math.abs(turn)))
  const xx = Math.round(x - ww / 2)
  const yy = Math.round(y - ph / 2)
  const gr = Math.round(pw * 1.3)
  g.drawImage(glow(gr, c, 1.3, 0.55), Math.round(x) - gr, Math.round(y) - gr)
  const face = turn > 0 ? c : mix(c, '#000000', 0.35)
  rect(g, xx, yy, ww, ph, face)
  // A pale rim on the lit edges, a dark one under, the engraved line down its middle once it's wide enough.
  rect(g, xx, yy, ww, 1, mix(c, '#ffffff', 0.6))
  rect(g, xx, yy, 1, ph, mix(c, '#ffffff', 0.4))
  rect(g, xx, yy + ph - 1, ww, 1, mix(c, '#000000', 0.45))
  if (ww > 4) rect(g, xx + (ww >> 1), yy + 2, 1, ph - 4, mix(c, '#000000', 0.3))
  if (ww > 2 && (Math.floor(t * 10) + i) % 7 === 0) rect(g, xx + 1, yy + 1, 1, 1, '#ffffff')
}

/**
 * A step of light seen from below as it comes down towards us: its riser (the face we see, gold, lit along its top),
 * its tread's bright nose, a thin halo; white for a moment when it comes or is trod on. `rise` is how far down the next
 * step starts; `fill` how much of that the riser covers (all of it: one solid flight; less: slabs of light floating
 * apart, the gaps glowing).
 */
function drawStep(g: G, x: number, y: number, hw: number, rise: number, hot: number, fill = 1) {
  const h2 = Math.max(1, Math.round(hw))
  const rr = Math.max(1, Math.round(rise * fill))
  rect(g, x - h2 - 2, y - 1, h2 * 2 + 4, Math.max(1, rise) + 2, pattern(g, GOLD.lit, 3 + Math.round(hot * 8)))
  rect(g, x - h2, y, h2 * 2, rr, hot > 0.3 ? '#fff4d0' : fill < 1 ? GOLD.lit : GOLD.mid)
  if (rr > 2)
    rect(g, x - h2, y + 1, h2 * 2, Math.ceil(rr / 3), hot > 0.3 ? '#ffffff' : fill < 1 ? GOLD.hi : GOLD.lit)
  rect(g, x - h2, y, h2 * 2, 1, '#ffffff')
  rect(g, x - h2, y, 1, rr, GOLD.hi)
  rect(g, x + h2 - 1, y, 1, rr, GOLD.dark)
}

// ---------------------------------------------------------------------------------------------- the boss: the gate

const B_REVEAL = 4.3
/** The cloud sea's top, and the gate in the sky (its middle; its arch reaches GATE_H above and below that). */
const CLOUDS = 80
const GATE = { x: 173, y: 21 }
const GATE_H = 11
const B_STEPS = 13
const FLUTE = [0.12, 0.34, 0.52, 0.72, 0.98] as const
const T_SEAM = 0.95
const T_BUILD = 1.35
const BUILD_DUR = 1.05
const T_WALK_B = 2.5
const WALK_END_B = 3.75
const T_RAIN = 3.4
const T_LIFT = 3.95

type BX = { heavens: Canvas; buf: Canvas; rays: Canvas }

/** Step i of the boss's stairs, 0 at the gate: its middle, half width and thickness. */
const bStep = (i: number) => {
  const v = i / (B_STEPS - 1)
  return {
    y: Math.round(lerp(GATE.y + GATE_H + 3, 96, v ** 1.2)),
    hw: lerp(2, 22, v ** 1.1),
    th: Math.round(lerp(1, 4, v)),
  }
}

/** The heavens over Mt. Coronet: the night, the Milky Way slanting across it, the cloud sea below in perspective. */
function heavens(r: Rng): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, CLOUDS + 8, ['#03021a', '#08082a', '#12103c', '#221c4e', '#3a2e62']), 0, 0)
  // The Milky Way: a slanting band of faint dust and close stars.
  for (let i = 0; i < 900; i++) {
    const u = r()
    const off = (r() + r() + r() - 1.5) * 16
    const x = lerp(-20, W + 20, u) + off * 0.5
    const y = lerp(CLOUDS - 4, -10, u) + off
    if (y < 0 || y > CLOUDS) continue
    rect(g, x, y, 1, 1, Math.abs(off) < 5 ? (r() < 0.3 ? '#8a7ab8' : '#3a3068') : '#241e4a')
  }
  for (let i = 0; i < 80; i++) {
    const x = r.range(0, W)
    const y = r.range(0, CLOUDS - 6)
    rect(g, x, y, 1, 1, r() < 0.15 ? '#ffffff' : r() < 0.5 ? '#a8a8d8' : '#5a5a90')
  }
  // The cloud sea: rows of puffs of every size, small and flat far off, big and round in front, lit on top.
  g.drawImage(dGradient(W, H - CLOUDS, ['#2a2858', '#1e1c46', '#161436', '#0e0c26']), 0, CLOUDS)
  for (let k = 0; k <= 7; k++) {
    const v = k / 7
    const y0 = Math.round(CLOUDS + 3 + v ** 1.6 * (H - CLOUDS))
    for (let x = r.range(-30, 0); x < W + 30;) {
      const rx = Math.round((5 + v * 22) * r.range(0.6, 1.4))
      const ry = Math.max(2, Math.round(rx * r.range(0.3, 0.45)))
      const y = y0 + Math.round(r.range(-2, 2) * (1 + v))
      ellipse(g, x + 1, y + 1, rx, ry, '#12102c')
      ellipse(g, x, y, rx, ry, '#2c2a5c')
      ellipse(
        g,
        x - Math.round(rx * 0.2),
        y - Math.round(ry * 0.35),
        Math.round(rx * 0.7),
        Math.max(1, Math.round(ry * 0.6)),
        '#3c3a74',
      )
      ellipseLine(g, x, y, rx, ry, '#5a58a0', Math.PI * 1.15, Math.PI * 1.85)
      x += rx * r.range(1.1, 1.8)
    }
  }
  rect(g, 0, CLOUDS, W, 1, '#4a4888')
  return cv
}

/** The gate open in the sky: an arch of light, the Hall of Origin's white colonnade seen through it. */
function gate(g: G, oq: number, sq: number) {
  const hh = Math.round(lerp(1, GATE_H, ease.outC(sq)))
  const hw = Math.max(1, Math.round(9 * oq))
  const x = GATE.x
  const y = GATE.y
  rect(g, x - hw, y - hh, hw * 2, hh * 2 + 1, '#fff6dc')
  if (hw > 2) {
    ellipse(g, x, y - hh, hw, Math.round(hw * 0.7), '#fff6dc')
    // The hall inside: pillars in pairs, smaller as they recede to its far light; its floor.
    for (const [dx, k] of [
      [0.8, 1],
      [0.55, 0.7],
      [0.35, 0.5],
    ] as const) {
      const px = Math.round(hw * dx)
      const ph = Math.round(hh * 1.6 * k)
      rect(g, x - px - 1, y + hh - ph, 2, ph, k > 0.9 ? '#c8a868' : '#dcc088')
      rect(g, x + px - 1, y + hh - ph, 2, ph, k > 0.9 ? '#c8a868' : '#dcc088')
    }
    rect(g, x - hw, y + hh - 2, hw * 2, 2, '#f0dcb0')
    rect(g, x - 1, y - 2, 3, 3, '#ffffff')
    // Its golden frame.
    ellipseLine(g, x, y - hh, hw + 1, Math.round(hw * 0.7) + 1, GOLD.lit, Math.PI, Math.PI * 2)
    rect(g, x - hw - 1, y - hh, 2, hh * 2 + 1, GOLD.mid)
    rect(g, x + hw - 1, y - hh, 2, hh * 2 + 1, GOLD.mid)
    rect(g, x - hw - 2, y + hh, hw * 2 + 4, 2, GOLD.lit)
  }
  rect(g, x, y - hh - 6, 1, hh * 2 + 10, '#ffffff')
}

export const arceusCinema = bossCinema<BX>({
  id: 'cinema-arceus',
  reveal: B_REVEAL,
  seed: 493,
  aura: AURA,
  flash: '#fff6d8',
  setup() {
    return { heavens: heavens(rng(4931)), buf: canvas(W, H), rays: canvas(W, H) }
  },
  step(s, t, dt) {
    const r = s.r
    // The flute's notes drifting up from below.
    for (const at of FLUTE)
      if (within(t, at, at + dt))
        s.fx.add({
          x: r.range(30, 130),
          y: H - 6,
          vx: r.range(5, 18),
          vy: -r.range(22, 34),
          life: 2,
          size: 1,
          shape: 'note',
          colors: ['#c8e0ff', '#8ab0f0', '#5a78c8'],
        })
    // Sparks as each step forms.
    for (let i = 0; i < B_STEPS; i++)
      if (within(t, stepAtB(i), stepAtB(i) + dt)) {
        const st = bStep(i)
        for (let k = 0; k < 6; k++)
          s.fx.add({
            x: GATE.x + r.range(-st.hw, st.hw),
            y: st.y,
            vy: -r.range(10, 30),
            life: 0.5,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', GOLD.lit],
          })
      }
    // Each plate landing: a burst in its colour.
    PLATES.forEach((c, j) => {
      if (!within(t, landAt(j), landAt(j) + dt)) return
      const at = ringB(j, 0)
      for (let k = 0; k < 8; k++) {
        const a = r() * Math.PI * 2
        s.fx.add({
          x: at.x,
          y: at.y,
          vx: Math.cos(a) * 30,
          vy: Math.sin(a) * 12 - 10,
          drag: 3,
          life: 0.4,
          size: 1,
          shape: 'px',
          colors: ['#ffffff', c],
        })
      }
    })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    const b = s.buf.g
    b.drawImage(s.heavens, 0, 0)
    // The seam in the sky, opening into a gate of light, its rays fanning out.
    const sq = span(t, T_SEAM, T_SEAM + 0.25)
    if (sq > 0) {
      const oq = ease.outBack(span(t, T_SEAM + 0.2, T_SEAM + 0.55), 1.5)
      const rk = 0.3 * span(t, T_SEAM + 0.2, T_SEAM + 0.8) + 0.25 * span(t, B_REVEAL - 0.4, B_REVEAL)
      drawRays(s.rays, GATE, t * 0.6, GOLD.lit, rk)
      b.drawImage(s.rays, 0, 0)
      b.drawImage(
        glow(Math.round(14 + 12 * oq), GOLD.hi, 1.3, 0.8),
        GATE.x - Math.round(14 + 12 * oq),
        GATE.y - Math.round(14 + 12 * oq),
      )
      gate(b, oq, sq)
    }
    // The stairs' light pooled on the clouds at their foot.
    const built = span(t, T_BUILD, T_BUILD + 0.3)
    if (built > 0) b.drawImage(glow(40, GOLD.lit, 1.6, q8(0.4 * built)), GATE.x - 40, 98 - 40)
    // The stairs, from the clouds up to the gate, a step to each note; flaring where it treads.
    const pos = walkB(t)
    for (let i = 0; i < B_STEPS; i++) {
      const at = stepAtB(i)
      if (t < at) continue
      const st = bStep(i)
      const hot = Math.max(
        1 - span(t, at, at + 0.25),
        pos != null ? 1 - Math.min(1, Math.abs(pos - i) * 1.5) : 0,
      )
      drawStep(b, GATE.x, st.y, st.hw, i < B_STEPS - 1 ? bStep(i + 1).y - st.y - 1 : st.th, hot)
    }
    // The plates: meteors falling into a ring round the foot, then lifting and whirling round it.
    PLATES.forEach((c, j) => {
      const t0 = landAt(j) - 0.2
      if (t < t0 || t > B_REVEAL) return
      const at = ringB(j, t)
      if (t < landAt(j)) {
        const q = span(t, t0, landAt(j))
        const sx = at.x + 60
        const sy = -30
        const x = lerp(sx, at.x, q)
        const y = lerp(sy, at.y, q)
        b.drawImage(glow(6, c, 1.3, 0.8), Math.round(x) - 6, Math.round(y) - 6)
        line(b, x, y, x + 16, y - 36, c, 2)
        line(b, x, y, x + 6, y - 13, '#ffffff', 2)
        return
      }
      if (at.z < 0 || t < T_LIFT) drawPlate(b, at.x, at.y, 5, c, Math.cos(t * 6 + j), t, j)
    })
    dissolve(g, s.buf, k)
  },
  before(g, s, t) {
    // Walking down out of the gate, growing as it nears; standing at the foot, the plates whirling round.
    const pos = walkB(t) ?? (t >= WALK_END_B ? B_STEPS - 1 : null)
    if (pos == null) return
    const i = Math.floor(pos)
    const f = pos - i
    const a = bStep(i)
    const n = bStep(Math.min(B_STEPS - 1, i + 1))
    const y = Math.round(lerp(a.y, n.y, f))
    const sz = spriteSize(s.foe)
    // As wide as the stairs under it: small up in the gate, itself at the foot.
    const sc = Math.min(1, Math.max(0.08, (lerp(a.hw, n.hw, f) * 3.2) / sz.w))
    // The gold wheel round its middle, shining ahead of it.
    const wr = Math.round((sz.w * 0.55 + 4) * sc)
    if (wr > 2) {
      g.drawImage(glow(wr + 6, GOLD.lit, 1.4, 0.5), GATE.x - wr - 6, Math.round(y - sz.h * sc * 0.5) - wr - 6)
      ellipseLine(
        g,
        GATE.x,
        Math.round(y - sz.h * sc * 0.5),
        wr,
        Math.max(1, Math.round(wr * 0.35)),
        GOLD.lit,
      )
    }
    drawSprite(g, s.foe, GATE.x, y, {
      sx: sc,
      sy: sc,
      tint: { color: '#fffbe8', a: 0.72 },
      outline: Math.floor(t * 10) % 2 ? GOLD.mid : GOLD.lit,
    })
    // The plates in front of it.
    if (t >= T_LIFT && t < B_REVEAL)
      PLATES.forEach((c, j) => {
        const at = ringB(j, t)
        if (at.z >= 0) drawPlate(g, at.x, at.y, 6, c, Math.cos(t * 6 + j), t, j)
      })
  },
  front(g, _s, t, k) {
    // Near clouds drifting past below, in front of everything.
    if (k < 0.5) return
    for (let i = 0; i < 5; i++) {
      const x = Math.round(((i * 71 - t * 9) % (W + 80)) + (i * 71 - t * 9 < 0 ? W + 80 : 0) - 40)
      const y = 152 + (i % 2) * 6
      ellipse(g, x, y, 30, 10, '#1a1838')
      ellipse(g, x - 4, y - 3, 24, 7, '#24224a')
      rect(g, x - 20, y - 10, 34, 1, '#3a3870')
    }
  },
  sounds: [
    [0.05, () => hiss(1.4, { freq: 900, type: 'lowpass', vol: 0.03 })],
    // The Azure Flute: a slow, rising phrase.
    ...FLUTE.map(
      (at, i) =>
        [at, () => tone([659, 784, 880, 1047, 988][i]!, 0.42, { type: 'sine', vol: 0.045 })] as const,
    ),
    [
      T_SEAM,
      () => (hiss(0.8, { freq: 3000, slide: -1500, vol: 0.04 }), tone(1568, 1, { type: 'sine', vol: 0.025 })),
    ],
    ...Array.from(
      { length: B_STEPS },
      (_, i) =>
        [
          stepAtB(B_STEPS - 1 - i),
          () =>
            tone(523 * 2 ** ([0, 2, 4, 7, 9][i % 5]! / 12 + Math.floor(i / 5)), 0.2, {
              type: 'triangle',
              vol: 0.025,
            }),
        ] as const,
    ),
    ...[0, 1, 2, 3, 4, 5].map(
      (i) => [T_WALK_B + 0.12 + i * 0.21, () => tone(98, 0.18, { type: 'sine', vol: 0.07 })] as const,
    ),
    [T_RAIN, () => hiss(0.8, { freq: 2400, slide: -1600, vol: 0.05 })],
    [T_LIFT, () => fxSound('psychic.focus')],
    [B_REVEAL, () => fxSound('legend.roar')],
  ],
})

/** When boss step i lights: the bottom first, climbing to the gate. (Declared, not const: the sounds use it.) */
function stepAtB(i: number) {
  return T_BUILD + ((B_STEPS - 1 - i) / (B_STEPS - 1)) * BUILD_DUR
}
/** Where it is on the stairs (0 the gate .. the last step), stepping; null when not walking. */
function walkB(t: number): number | null {
  if (t < T_WALK_B || t >= WALK_END_B) return null
  const p = span(t, T_WALK_B, WALK_END_B) * (B_STEPS - 1)
  const i = Math.floor(p)
  return i + ease.ioQ(p - i)
}
/** When plate j lands. */
function landAt(j: number) {
  return T_RAIN + j * 0.032
}
/** Plate j on its ring round the stairs' foot: lying on the floor, then lifted to its middle and whirling, closing in. */
function ringB(j: number, t: number) {
  const lift = ease.ioS(span(t, T_LIFT, T_LIFT + 0.2))
  const a = (j / PLATES.length) * Math.PI * 2 + Math.max(0, t - T_LIFT) ** 2 * 9
  const R = lerp(56, 34, span(t, T_LIFT, B_REVEAL))
  const cy = lerp(100, 66, lift)
  return { x: GATE.x + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.25, z: Math.sin(a) }
}

// ---------------------------------------------------------------------------------------------- the raid: the Hall

const REVEAL = 5.1
const DUR = REVEAL + AFTER_REVEAL
const STEPS = 16
const T_POINT = 0.12
const T_DESCEND = 0.4
const DESCEND_DUR = 1.0
const T_HALL = 1.35
const HALL_DUR = 1.0
const T_PLATES = 2.15
const PLATE_GAP = 0.055
const T_WHEEL = 2.55
const T_WALK = 3.1
const WALK_END = 4.5
const T_RISE = 3.7
const T_JUDGE = 4.4
const T_IGNITE = 4.75

type S = {
  r: Rng
  fx: Particles
  sky: Canvas
  floor: Canvas
  rays: Canvas
  shakes: [number, number, number][]
}

export const arceusRaidCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const m = Math.min(w, h)
    const cx = Math.round(w / 2)
    const feet = Math.round(h * 0.62)
    const horizon = Math.round(h * 0.47)
    const top = Math.round(h * 0.06)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const sz = spriteSize(p.mon)
    /** The floor's plane: depth z (1 at the stairs' foot) to the screen. */
    const U = m * 0.5
    const yAt = (z: number) => horizon + (feet - horizon) / z
    const xAt = (X: number, z: number) => cx + (X * U) / z
    const wheel = {
      x: cx,
      y: Math.round(feet - Math.min(h * 0.2, m * 0.32)),
      R: Math.round(Math.min(w * 0.42, h * 0.27)),
    }
    const step = (i: number) => {
      const v = i / (STEPS - 1)
      return {
        y: Math.round(lerp(top + 6, feet, v ** 1.35)),
        hw: lerp(2, m * 0.17, v ** 1.3),
        th: Math.round(lerp(1, Math.max(2, m * 0.035), v)),
      }
    }
    /** Steps come down from the top, out of nothing. */
    const stepAt = (i: number) => T_DESCEND + (i / (STEPS - 1)) * DESCEND_DUR
    /** The colonnades: two rows of pillars receding to the hall's far light. */
    const pillars = [1.2, 1.8, 2.7, 4, 6, 9].flatMap((z, k) =>
      [-1, 1].map((side) => ({ X: side * 1.25, z, at: T_HALL + 0.15 + (5 - k) * 0.08 })),
    )
    const walk = (t: number) => {
      if (t < T_WALK) return null
      if (t >= WALK_END) return STEPS - 1
      const q = span(t, T_WALK, WALK_END) * (STEPS - 1)
      const i = Math.floor(q)
      return i + ease.ioQ(q - i)
    }
    /** How far the plates have turned: slow, quickening, flung out and slowing again after the reveal. */
    const spin = (t: number) =>
      (t - T_PLATES) * 0.9 +
      Math.max(0, Math.min(t, T_IGNITE) - T_RISE) ** 2 * 3 +
      Math.max(0, t - REVEAL) * 0.6
    /** Plate j: its place on the ring, how near (z > 0 in front), how big, whether it's out yet. */
    const plate = (j: number, t: number) => {
      const born = T_PLATES + j * PLATE_GAP
      const a = (j / PLATES.length) * Math.PI * 2 + spin(t)
      let R = m * 0.44
      let cy = lerp(feet - m * 0.04, wheel.y, ease.ioS(span(t, T_RISE, T_JUDGE)))
      // Judgment: the ring closing into the wheel's hub; then flung back out round it.
      if (t >= T_JUDGE && t < REVEAL) R *= 1 - ease.inQ(span(t, T_JUDGE, T_IGNITE))
      if (t >= REVEAL) {
        R = m * 0.46 * ease.outBack(span(t, REVEAL, REVEAL + 0.5), 1.6)
        cy = wheel.y + 6
      }
      const z = Math.sin(a)
      return {
        x: cx + Math.cos(a) * R,
        y: cy + z * R * 0.26,
        z,
        size: Math.min(9, m * 0.06) * (1 + z * 0.25) * ease.outBack(span(t, born, born + 0.15), 3),
        on: t >= born && !(t >= T_IGNITE && t < REVEAL),
      }
    }
    return {
      id: 'cinema-arceus-raid',
      dur: DUR,
      setup() {
        const r = rng(4930)
        // The hall's sky: deep violet at the top to dawn gold at the far light, motes like stars.
        const sky = dGradient(w, horizon + 1, ['#221a40', '#4e3e72', '#9a7a98', '#e8b890', '#fff0d0'])
        for (let i = 0; i < 50; i++)
          rect(sky.g, r.range(0, w), r.range(0, horizon * 0.6), 1, 1, r() < 0.3 ? '#ffffff' : '#c8b0d8')
        sky.g.drawImage(
          glow(Math.round(m * 0.5), '#fff8e0', 1.4, 0.8),
          cx - Math.round(m * 0.5),
          horizon - Math.round(m * 0.5),
        )
        // The floor: marble paling into the far light, gold seams in perspective.
        const floor = canvas(w, h - horizon)
        const fg = floor.g
        fg.drawImage(dGradient(w, h - horizon, ['#fff4dc', '#ece0c4', '#d4c4a0', '#b8a47c']), 0, 0)
        for (const z of [0.36, 0.45, 0.58, 0.75, 1, 1.3, 1.75, 2.4, 3.4, 5]) {
          const y = Math.round(yAt(z)) - horizon
          rect(fg, 0, y, w, 1, z < 2 ? '#c8a060' : '#dcc490')
        }
        for (let X = -6; X <= 6; X += 0.75) {
          const xb = xAt(X, 0.33)
          line(fg, cx, 0, xb, h - horizon, Math.abs(X) < 3 ? '#c8a060' : '#d4b878')
        }
        rect(fg, 0, 0, w, 1, '#ffffff')
        return {
          r,
          fx: new Particles(),
          sky,
          floor,
          rays: canvas(w, h),
          shakes: p.short
            ? []
            : [
                [T_IGNITE, 0.35, 2],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // Sparks off each step as it lands out of nothing.
        for (let i = 0; i < STEPS; i++)
          if (within(t, stepAt(i), stepAt(i) + dt)) {
            const st = step(i)
            for (let k = 0; k < 6 * many; k++)
              s.fx.add({
                x: cx + r.range(-st.hw, st.hw),
                y: st.y,
                vx: r.range(-10, 10),
                vy: r.range(-20, 10),
                drag: 2,
                life: 0.5,
                size: 1,
                shape: 'px',
                colors: ['#ffffff', GOLD.lit, GOLD.mid],
              })
          }
        // Gold motes rising through the hall once it stands.
        if (t > T_HALL + 0.5 && r() < 0.5 * many)
          s.fx.add({
            x: r.range(0, w),
            y: h + 2,
            vy: -r.range(14, 30),
            vx: r.range(-4, 4),
            life: 4,
            size: 1,
            shape: r() < 0.2 ? 'plus' : 'px',
            colors: ['#fff4c0', '#ffd870'],
          })
        // Each plate flashing into being throws its colour.
        PLATES.forEach((c, j) => {
          const born = T_PLATES + j * PLATE_GAP
          if (!within(t, born, born + dt)) return
          const at = plate(j, born + 0.15)
          for (let k = 0; k < 8 * many; k++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: at.x,
              y: at.y,
              vx: Math.cos(a) * 40,
              vy: Math.sin(a) * 40,
              drag: 4,
              life: 0.45,
              size: 1,
              shape: 'star',
              colors: ['#ffffff', c],
            })
          }
        })
        // Judgment's streaks into the hub, and the burst of every colour on the reveal.
        if (t > T_JUDGE && t < T_IGNITE)
          PLATES.forEach((c, j) => {
            if (r() > 0.5 * many) return
            const at = plate(j, t)
            s.fx.add({
              x: at.x,
              y: at.y,
              life: 0.25,
              size: 1,
              shape: 'sq',
              colors: [c, mix(c, '#000000', 0.3)],
            })
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 90 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 200)
            s.fx.add({
              x: wheel.x,
              y: wheel.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.4,
              life: r.range(0.6, 1.1),
              size: r.int(1, 2),
              shape: 'star',
              colors: ['#ffffff', PLATES[k % PLATES.length]!],
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The hall out of the light: its sky first, then its floor spreading from the stairs' foot.
        const hq = span(t, T_HALL, T_HALL + HALL_DUR)
        dissolve(g, s.sky, ease.ioS(span(t, T_HALL + 0.2, T_HALL + HALL_DUR + 0.2)))
        const fr = ease.outQ(hq) * Math.max(w, h) * 1.6
        if (fr > 0)
          for (let y = horizon; y < h; y++) {
            const dy = (y - feet) / 0.3
            if (Math.abs(dy) >= fr) continue
            const hw = Math.round(Math.sqrt(fr * fr - dy * dy))
            g.drawImage(s.floor, cx - hw, y - horizon, hw * 2, 1, cx - hw, y, hw * 2, 1)
          }
        if (hq > 0 && hq < 1) {
          const rx = Math.round(fr)
          ellipseLine(g, cx, feet, rx, Math.round(rx * 0.3), '#ffffff')
          ellipseLine(g, cx, feet, rx - 2, Math.round((rx - 2) * 0.3), GOLD.lit)
        }
        // The polished floor gives back the stairs' lowest steps, and a pool of light at their foot.
        if (hq > 0.3) {
          for (let i = STEPS - 1; i >= STEPS - 7; i--) {
            if (t < stepAt(i)) continue
            const st = step(i)
            const ry = feet + (feet - st.y) + 2
            if (ry < h) rect(g, cx - Math.round(st.hw), ry, Math.round(st.hw) * 2, 1, pattern(g, GOLD.lit, 7))
          }
          ellipse(
            g,
            cx,
            feet + 2,
            Math.round(m * 0.24),
            Math.max(2, Math.round(m * 0.05)),
            pattern(g, GOLD.hi, 6),
          )
        }
        // The rays: the far light's while the hall builds, the wheel's once it burns.
        const rk =
          0.25 * span(t, T_HALL + 0.4, T_HALL + 1) * (1 - span(t, T_IGNITE - 0.2, T_IGNITE)) +
          (t >= T_IGNITE ? lerp(0.6, 0.3, span(t, REVEAL, REVEAL + 1.2)) : 0)
        if (rk > 0) {
          drawRays(s.rays, t >= T_IGNITE ? wheel : { x: cx, y: horizon }, t * 0.5, GOLD.lit, rk)
          g.drawImage(s.rays, 0, 0)
        }
        // The colonnades rising out of the floor, far ones first.
        for (const pl of [...pillars].sort((a, b) => b.z - a.z)) drawPillar(g, pl, t)
        // The golden wheel drawing itself in the sky, turning.
        drawWheel(g, t)
        // Plates behind the stairs and the god; then the stairs; then it; then the plates in front.
        PLATES.forEach((c, j) => {
          const at = plate(j, t)
          if (at.on && at.z < 0) drawPlate(g, at.x, at.y, at.size, c, Math.cos(spin(t) * 2.5 + j), t, j)
        })
        const pos = walk(t)
        // The point of light it all comes out of, and the light running down ahead of the steps.
        const pq = span(t, T_POINT, T_POINT + 0.3) * (1 - span(t, T_HALL, T_HALL + 0.6))
        if (pq > 0) {
          const head = step(
            Math.min(STEPS - 1, Math.floor(span(t, T_DESCEND, T_DESCEND + DESCEND_DUR) * (STEPS - 1))),
          )
          const y = t < T_DESCEND ? top + 6 : head.y
          const gr = Math.round(6 + 8 * pq)
          g.drawImage(glow(gr, GOLD.hi, 1.3, q8(0.9 * pq)), cx - gr, y - gr)
          rect(g, cx - gr, y, gr * 2 + 1, 1, '#ffffff')
          rect(g, cx, y - gr, 1, gr * 2 + 1, '#ffffff')
        }
        for (let i = 0; i < STEPS; i++) {
          const at = stepAt(i)
          if (t < at) continue
          const st = step(i)
          const hot = Math.max(
            1 - span(t, at, at + 0.3),
            pos != null && t < REVEAL ? 1 - Math.min(1, Math.abs(pos - i) * 1.5) : 0,
          )
          drawStep(g, cx, st.y, st.hw, i < STEPS - 1 ? step(i + 1).y - st.y - 1 : st.th, hot, 0.5)
        }
        if (pos != null && t < REVEAL) {
          const i = Math.floor(pos)
          const a = step(i)
          const n = step(Math.min(STEPS - 1, i + 1))
          const y = Math.round(lerp(a.y, n.y, pos - i))
          const sc = Math.min(1, Math.max(0.08, (lerp(a.hw, n.hw, pos - i) * 2.6) / sz.w))
          drawSprite(g, p.mon, cx, y, {
            sx: sc,
            sy: sc,
            tint: { color: '#fffbe8', a: 0.72 },
            outline: Math.floor(t * 10) % 2 ? GOLD.mid : GOLD.lit,
          })
        }
        if (t >= REVEAL) {
          const bob = Math.round(Math.sin((t - REVEAL) * 1.6) * 1.5)
          drawSprite(g, p.mon, cx, feet + bob, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
        PLATES.forEach((c, j) => {
          const at = plate(j, t)
          if (at.on && at.z >= 0) drawPlate(g, at.x, at.y, at.size, c, Math.cos(spin(t) * 2.5 + j), t, j)
        })
        // Their whirl quickening into Judgment: each trails a streak of its colour along its path.
        if (t > T_RISE + 0.2 && t < T_IGNITE)
          PLATES.forEach((c, j) => {
            let prev = plate(j, t)
            for (let k = 1; k <= 4; k++) {
              const at = plate(j, t - k * 0.025)
              line(g, prev.x, prev.y, at.x, at.y, k < 3 ? c : mix(c, '#ffffff', 0.5), k < 2 ? 2 : 1)
              prev = at
            }
          })
        // Judgment's ignition in the hub, and the reveal's rings in every colour.
        const iq = span(t, T_IGNITE - 0.05, T_IGNITE + 0.25) * (1 - span(t, REVEAL + 0.2, REVEAL + 0.8))
        if (iq > 0) {
          const gr = Math.round(m * 0.12 * (0.7 + 0.3 * iq) + Math.sin(t * 30) * 2)
          g.drawImage(glow(gr, '#ffffff', 1.2, q8(0.9 * iq)), wheel.x - gr, wheel.y - gr)
        }
        burstRing(g, wheel.x, wheel.y, span(t, T_IGNITE, T_IGNITE + 0.5), Math.max(w, h) * 0.6, 2, GOLD.hi)
        ;[0, 3, 6, 9, 12, 16].forEach((j, i) =>
          burstRing(
            g,
            wheel.x,
            wheel.y,
            span(t, REVEAL + i * 0.05, REVEAL + i * 0.05 + 0.6),
            Math.max(w, h) * 0.8,
            2,
            PLATES[j]!,
          ),
        )
        s.fx.draw(g)
        g.restore()
        if (within(t, T_IGNITE, T_IGNITE + 0.2))
          screenFlash(g, '#fff4c0', 0.5 * (1 - span(t, T_IGNITE, T_IGNITE + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.4))
          screenFlash(g, '#fffbe8', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.4)))
        // The hall is all light after the reveal: a little dusk kept on the sky so the words sit on it.
        if (t > REVEAL + 0.4) wash(g, '#1a1030', 0.15 * span(t, REVEAL + 0.4, REVEAL + 1.2), 8)
      },
      cues: () =>
        inOrder([
          [T_POINT, quiet(() => tone(1568, 1.8, { type: 'sine', vol: 0.03 }))],
          // The steps coming down: a scale falling, a note each.
          ...Array.from(
            { length: STEPS },
            (_, i) =>
              [
                stepAt(i),
                quiet(() =>
                  tone(2093 * 2 ** (-[0, 2, 4, 7, 9][i % 5]! / 12 - Math.floor(i / 5)), 0.22, {
                    type: 'triangle',
                    vol: 0.025,
                  }),
                ),
              ] as const,
          ),
          [
            T_HALL,
            quiet(() => [262, 330, 392, 523].forEach((f) => tone(f, 1.8, { type: 'sine', vol: 0.02 }))),
          ],
          [T_HALL + 0.3, quiet(() => hiss(1.2, { freq: 400, slide: 800, vol: 0.04 }))],
          // A ping for each plate, up through two octaves.
          ...PLATES.map(
            (_, j) =>
              [
                T_PLATES + j * PLATE_GAP,
                quiet(() =>
                  tone(784 * 2 ** ([0, 2, 4, 7, 9][j % 5]! / 12 + Math.floor(j / 5) * 0.5), 0.12, {
                    type: 'square',
                    vol: 0.015,
                  }),
                ),
              ] as const,
          ),
          [T_WHEEL, quiet(() => fxSound('psychic.focus'))],
          ...[0, 1, 2, 3, 4, 5, 6].map(
            (i) => [T_WALK + 0.1 + i * 0.2, quiet(() => tone(82, 0.2, { type: 'sine', vol: 0.08 }))] as const,
          ),
          [T_RISE, quiet(() => hiss(0.9, { freq: 300, slide: 1800, vol: 0.05 }))],
          [T_JUDGE, quiet(() => tone(110, 0.4, { type: 'sawtooth', vol: 0.04, slide: 330 }))],
          [T_IGNITE, quiet(() => (fxSound('legend.heart'), hiss(0.5, { freq: 2600, vol: 0.06 })))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }

    /** A marble pillar rising out of the floor at its depth: lit side, shaded side, gold capital and foot. */
    function drawPillar(g: G, pl: { X: number; z: number; at: number }, t: number) {
      const q = ease.outC(span(t, pl.at, pl.at + 0.45))
      if (q <= 0) return
      const x = Math.round(xAt(pl.X, pl.z))
      const base = Math.round(yAt(pl.z))
      const full = Math.round(base - (horizon - (horizon * 0.95) / pl.z))
      const hgt = Math.round((base - (horizon - (horizon * 0.95) / pl.z)) * q)
      const pw = Math.max(2, Math.round((m * 0.09) / pl.z))
      const topY = base - hgt
      const far = pl.z > 3
      rect(g, x - pw / 2, topY, pw, hgt, far ? '#f4ead8' : '#ece0c8')
      rect(g, x - pw / 2, topY, Math.max(1, pw / 4), hgt, '#ffffff')
      rect(g, x + pw / 4, topY, Math.max(1, pw / 4), hgt, far ? '#e0d0b0' : '#c8b490')
      if (pw >= 6)
        for (let fx = x - pw / 2 + 2; fx < x + pw / 2 - 2; fx += 3)
          rect(g, fx, topY + 2, 1, hgt - 4, '#dccca8')
      rect(g, x - pw / 2 - 1, base - Math.max(1, pw / 4), pw + 2, Math.max(1, pw / 4), GOLD.mid)
      // The capital once it has risen to its height.
      if (q > 0.95 && full > 0) {
        rect(g, x - pw / 2 - 2, topY, pw + 4, Math.max(2, pw / 3), GOLD.lit)
        rect(g, x - pw / 2 - 2, topY, pw + 4, 1, GOLD.hi)
      }
    }

    /** The god's golden wheel in the sky: it draws itself round, then turns, its four jewels lit at Judgment. */
    function drawWheel(g: G, t: number) {
      const k = ease.ioS(span(t, T_WHEEL, T_WHEEL + 0.6))
      if (k <= 0) return
      const R = wheel.R
      const rot = t * 0.5
      const end = -Math.PI / 2 + Math.PI * 2 * k
      g.drawImage(glow(R + 8, GOLD.lit, 2.2, q8(0.35 * k)), wheel.x - R - 8, wheel.y - R - 8)
      for (const [dr, c] of [
        [1, GOLD.hi],
        [0, GOLD.lit],
        [-1, GOLD.lit],
        [-2, GOLD.mid],
        [-3, GOLD.dark],
      ] as const)
        ellipseLine(g, wheel.x, wheel.y, R + dr, R + dr, c, -Math.PI / 2, end)
      const lit = span(t, T_JUDGE, T_IGNITE)
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2
        if (k < (i + 1) / 4) continue
        const x = wheel.x + Math.cos(a) * R
        const y = wheel.y + Math.sin(a) * R
        // A spoke in towards the middle, and the jewel on the rim.
        line(g, x, y, wheel.x + Math.cos(a) * R * 0.72, wheel.y + Math.sin(a) * R * 0.72, GOLD.mid, 2)
        const jr = Math.max(2, Math.round(m * 0.025))
        ellipse(g, x, y, jr + 1, jr + 1, GOLD.dark)
        ellipse(g, x, y, jr, jr, lit > i / 4 ? '#ffffff' : '#3ad0a0')
        rect(g, x - 1, y - 1, 1, 1, '#e0fff0')
      }
    }
  },
}
