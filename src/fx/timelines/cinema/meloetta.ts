// Meloetta's entrance (docs/53), on the battle stage: a theatre in the dark, its red curtain closed, the footlights low,
// heads of an audience in front. One note; the curtain opens on a painted night and a single spotlight. A staff of five
// lines draws itself across the backdrop and the song is written on it note by note as it plays: the Aria, a shape in
// pale green light singing in the spotlight, notes rising off it, the staff's lines starting to sway. Then the music
// quickens into the Pirouette: the light turns orange, the shape spins faster and faster and the staff comes loose in
// five ribbons whirling round it, until the final chord throws a ring of notes out over the hall.
import { fxSound, hiss, tone } from '@/audio/sfx'
import { canvas, ease, ellipse, glow, lerp, pattern, rect, span, type Canvas, type G } from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W, within } from '../../timeline'
import { bossCinema } from './boss'
import { dGradient, dissolve, tri } from './kit'

const REVEAL = 4.1
const T_OPEN = 0.7
const T_STAFF = 1.35
const T_ARIA = 1.75
const T_PIROUETTE = 2.75
const T_CHORD = 3.7
const FLOOR = 104
/** The staff: its top line and the gap between lines. */
const STAFF_Y = 26
const GAP = 5
/** The song, written on the staff as it plays: when, which line or space (0 the bottom line, up in half steps). */
const SONG: readonly [number, number][] = [
  [1.85, 2],
  [2.05, 4],
  [2.25, 5],
  [2.4, 6],
  [2.55, 5],
  [2.68, 3],
  [2.8, 4],
  [2.9, 6],
  [3.0, 7],
  [3.08, 8],
  [3.16, 7],
  [3.24, 6],
  [3.32, 8],
  [3.4, 9],
]
const FREQ = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319] as const
const GREEN = ['#ffffff', '#d8ffe0', '#6ad890', '#1e6a46'] as const
const ORANGE = ['#ffffff', '#ffe0b0', '#ff9a40', '#a8481a'] as const

type X = { hall: Canvas; drape: Canvas }

const pats = new WeakMap<G, Map<string, CanvasPattern | string>>()
/** pattern(), kept per canvas: a light drawn row by row would otherwise make hundreds of patterns a frame. */
function pat(g: G, c: string, lv: number) {
  let m = pats.get(g)
  if (!m) pats.set(g, (m = new Map()))
  const k = `${c}|${Math.round(lv)}`
  let p = m.get(k)
  if (!p) m.set(k, (p = pattern(g, c, lv)))
  return p
}

/** The hall behind the curtain: a painted night backdrop, the stage's boards, the footlights' rail. */
function hallAt(): Canvas {
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, FLOOR, ['#0a0a24', '#14143a', '#1e1e4e', '#2a2050']), 0, 0)
  // Painted stars and a crescent moon on the backdrop.
  for (let i = 0; i < 40; i++)
    rect(g, (i * 53) % W, 6 + ((i * 31) % (FLOOR - 30)), 1, 1, i % 4 ? '#6a6aa8' : '#d8d8ff')
  ellipse(g, 60, 70, 9, 9, '#f0e8c0')
  ellipse(g, 64, 67, 8, 8, '#1a1a46')
  // Painted hills along the backdrop's foot.
  for (let x = 0; x < W; x++) {
    const y = Math.round(FLOOR - 8 - Math.abs(Math.sin(x / 26)) * 9)
    rect(g, x, y, 1, FLOOR - y, '#141430')
  }
  // The boards, in perspective, lit warmer at the front.
  g.drawImage(dGradient(W, 26, ['#3a2416', '#5a3a22', '#7a5030']), 0, FLOOR)
  for (let k = 1; k < 6; k++) rect(g, 0, FLOOR + Math.round((k / 6) ** 1.4 * 26), W, 1, '#2a180e')
  for (let k = -10; k <= 10; k++) {
    const x0 = W / 2 + k * 14
    const x1 = W / 2 + k * 22
    for (let y = FLOOR; y < FLOOR + 26; y++)
      rect(g, Math.round(lerp(x0, x1, (y - FLOOR) / 26)), y, 1, 1, '#2a180e')
  }
  // The stage's front edge and the footlight rail.
  rect(g, 0, FLOOR + 26, W, 4, '#1a0e08')
  rect(g, 0, FLOOR + 26, W, 1, '#c89a4a')
  g.drawImage(dGradient(W, H - FLOOR - 30, ['#3a2410', '#1a1008', '#08060a']), 0, FLOOR + 30)
  return cv
}

/** One curtain's cloth: deep red velvet in folds, each lit along one side. */
function drapeAt(): Canvas {
  const cv = canvas(W / 2 + 8, FLOOR + 26)
  const g = cv.g
  for (let x = 0; x < cv.width; x++) {
    const f = (x % 12) / 12
    const c = f < 0.2 ? '#e0404a' : f < 0.5 ? '#a81e2a' : f < 0.85 ? '#7a1220' : '#4a0a14'
    rect(g, x, 0, 1, cv.height, c)
  }
  // Its hem, heavier, gold-edged.
  rect(g, 0, cv.height - 4, cv.width, 4, '#5a0c18')
  rect(g, 0, cv.height - 4, cv.width, 1, '#e0b050')
  return cv
}

/** A note on the staff: a head (3 × 2), a stem, a flag for the quick ones. */
function note(g: G, x: number, y: number, c: string, flag: boolean) {
  rect(g, x - 1, y - 1, 3, 2, c)
  rect(g, x + 1, y - 7, 1, 7, c)
  if (flag) {
    rect(g, x + 2, y - 7, 2, 1, c)
    rect(g, x + 3, y - 6, 1, 1, c)
  }
}

let scratch: Canvas | null = null
let scratchFront: Canvas | null = null

export const meloettaCinema = bossCinema<X>({
  id: 'cinema-meloetta',
  reveal: REVEAL,
  seed: 648,
  aura: ['#ffffff', '#d8ffe0', '#6ad890', '#1e6a46'],
  flash: '#f4fff0',
  setup() {
    return { hall: hallAt(), drape: drapeAt() }
  },
  step(s, t, dt) {
    const r = s.r
    const f = s.L.foe
    // The Aria: notes rising off it as it sings.
    if (t > T_ARIA && t < T_PIROUETTE && r() < 0.18)
      s.fx.add({
        x: f.x + r.range(-14, 14),
        y: f.y - r.range(30, 50),
        vx: r.range(-10, 10),
        vy: -r.range(14, 26),
        life: 1.4,
        size: 1,
        shape: 'note',
        colors: [GREEN[1], GREEN[2], GREEN[2], GREEN[3]],
      })
    // The Pirouette: sparks of orange flung off the spin.
    if (t > T_PIROUETTE && t < T_CHORD && r() < 0.6) {
      const a = r() * Math.PI * 2
      s.fx.add({
        x: f.x + Math.cos(a) * 16,
        y: f.y - 28 + Math.sin(a) * 6,
        vx: Math.cos(a) * r.range(40, 90),
        vy: Math.sin(a) * r.range(10, 30) - 10,
        drag: 2,
        life: 0.6,
        size: 1,
        shape: r() < 0.5 ? 'star' : 'px',
        colors: [ORANGE[0], ORANGE[1], ORANGE[2]],
      })
    }
    // The final chord: a ring of notes thrown out over the hall.
    if (within(t, T_CHORD, T_CHORD + dt))
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2
        s.fx.add({
          x: f.x,
          y: f.y - 30,
          vx: Math.cos(a) * r.range(70, 120),
          vy: Math.sin(a) * r.range(50, 90),
          drag: 1.6,
          life: 1.2,
          size: 1,
          shape: 'note',
          colors: i % 2 ? [GREEN[0], GREEN[1], GREEN[2]] : [ORANGE[0], ORANGE[1], ORANGE[2]],
        })
      }
    // Petals thrown on the stage after.
    if (t > REVEAL + 0.2 && t < REVEAL + 1.4 && r() < 0.5)
      s.fx.add({
        x: r.range(20, W - 20),
        y: -4,
        vx: r.range(-10, 10),
        vy: r.range(30, 50),
        life: 3,
        size: 2,
        shape: 'leaf',
        spin: r.range(-6, 6),
        colors: [r() < 0.5 ? '#ff7a9a' : '#ffe080'],
        light: '#ffffff',
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    scratch ??= canvas(W, H)
    const c = scratch.g
    const f = s.L.foe
    c.clearRect(0, 0, W, H)
    c.drawImage(s.hall, 0, 0)
    // The staff, drawing itself across the backdrop; swaying once it sings, loosening as it spins.
    const sq = ease.outC(span(t, T_STAFF, T_STAFF + 0.45))
    const sway = span(t, T_ARIA, T_PIROUETTE) * 2 + span(t, T_PIROUETTE, T_CHORD) * 3
    const gone = span(t, T_PIROUETTE + 0.2, T_CHORD - 0.2)
    if (sq > 0 && gone < 1)
      for (let i = 0; i < 5; i++) {
        const y0 = STAFF_Y + i * GAP
        for (let x = 0; x < W * sq; x++) {
          // As the ribbons tear loose they unthread from the right, towards the spinner.
          if (x > W * (1 - gone)) continue
          const y = Math.round(y0 + Math.sin(x / 18 + t * 4 + i * 0.4) * sway)
          rect(c, x, y, 1, 1, (x + i) % 9 ? '#c8c8f0' : '#8a8ac8')
        }
      }
    // The notes, written on the staff as they sound.
    if (gone < 1)
      SONG.forEach(([at, step], i) => {
        if (t < at) return
        const x = 18 + i * 15
        if (x > W * (1 - gone)) return
        const y = Math.round(STAFF_Y + 4 * GAP - step * (GAP / 2) + Math.sin(x / 18 + t * 4) * sway)
        const fresh = t - at < 0.12
        note(c, x, y, fresh ? '#ffffff' : t < T_PIROUETTE ? GREEN[2] : ORANGE[2], at > T_PIROUETTE)
        if (fresh) c.drawImage(glow(6, '#ffffff', 1.3, 0.6), x - 6, y - 6)
      })
    // The spotlight: from above, a cone onto its place; pale green, then orange, wide and white on the chord.
    const on = span(t, T_OPEN + 0.5, T_ARIA)
    if (on > 0) {
      const col = t < T_PIROUETTE ? '#d8ffe0' : t < T_CHORD ? '#ffd090' : '#ffffff'
      const wide = 1 + span(t, T_CHORD, T_CHORD + 0.3) * 0.6
      for (let y = 0; y < f.y + 4; y++) {
        const q = y / (f.y + 4)
        const hw = Math.round(lerp(6, 30 * wide, q))
        c.fillStyle = pat(c, col, Math.round(on * (3 + q * 2)))
        c.fillRect(Math.round(f.x - hw + (1 - q) * 20), y, hw * 2, 1)
      }
      ellipse(c, f.x, f.y + 2, Math.round(30 * wide), 5, pattern(c, col, Math.round(on * 8)))
    }
    // Footlights along the stage's edge, glowing up with the curtain.
    const fl = 0.3 + span(t, T_OPEN, T_OPEN + 0.8) * 0.5 + span(t, T_CHORD, T_CHORD + 0.2) * 0.2
    for (let x = 10; x < W; x += 20) {
      rect(c, x - 2, FLOOR + 24, 5, 2, '#ffe8a0')
      c.drawImage(glow(10, '#ffd070', 1.4, fl * 0.6), x - 10, FLOOR + 15)
    }
    dissolve(g, scratch, k)
  },
  before(g, s, t) {
    if (t < T_OPEN + 0.6) return
    const f = s.L.foe
    if (t < T_PIROUETTE) {
      // The Aria: a pale green shape singing in the light, swaying.
      const q = span(t, T_OPEN + 0.6, T_ARIA)
      drawSprite(g, s.foe, f.x, f.y + Math.round(Math.sin(t * 3) * 1), {
        sil: '#14402a',
        outline: Math.floor(t * 10) % 3 ? GREEN[2] : GREEN[1],
        alpha: q,
      })
      return
    }
    // The Pirouette: spinning faster and faster, in orange light, the five ribbons whirling round it.
    const spin = (t - T_PIROUETTE) * lerp(6, 26, span(t, T_PIROUETTE, T_CHORD))
    const cs = t < T_CHORD ? Math.cos(spin * Math.PI) : 1
    const ribbons = (front: boolean) => {
      if (t >= T_CHORD + 0.15) return
      const out = span(t, T_CHORD, T_CHORD + 0.15)
      ;['#ffffff', ORANGE[1], ORANGE[2], GREEN[2], GREEN[1]].forEach((col, i) => {
        const rx = 22 + i * 3 + out * 40
        const ry = 6 + i
        const cy = f.y - 12 - i * 9
        const a0 = spin * 0.8 + i * 1.3
        for (let j = 0; j < 14; j++) {
          const a = a0 + j * 0.18
          if (Math.sin(a) > 0 !== front) continue
          rect(g, Math.round(f.x + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 2, 1, col)
        }
      })
    }
    ribbons(false)
    drawSprite(g, s.foe, f.x, f.y - Math.round(Math.abs(Math.sin(spin * Math.PI)) * 2), {
      sil: t < T_CHORD ? '#5a2410' : undefined,
      tint: t >= T_CHORD ? { color: '#ffffff', a: 0.5 } : null,
      outline: Math.floor(t * 16) % 2 ? ORANGE[1] : ORANGE[2],
      sx: Math.max(0.12, Math.abs(cs)),
      flip: cs < 0,
    })
    ribbons(true)
  },
  front(g, s, t, k) {
    if (k <= 0) return
    scratchFront ??= canvas(W, H)
    const c = scratchFront.g
    c.clearRect(0, 0, W, H)
    // The curtains: closed, then drawn apart to the sides, swaying as they settle.
    const open = ease.ioS(span(t, T_OPEN, T_OPEN + 0.8))
    const side = Math.round(lerp(0, W / 2 - 22, open))
    const sw = Math.round(Math.sin(t * 5) * (1 - span(t, T_OPEN + 0.8, T_OPEN + 1.6)) * 2 * open)
    c.drawImage(s.drape, -side - 8 + sw, 0)
    c.save()
    c.translate(W, 0)
    c.scale(-1, 1)
    c.drawImage(s.drape, -side - 8 + sw, 0)
    c.restore()
    // The valance across the top, with its gold fringe.
    rect(c, 0, 0, W, 12, '#7a1220')
    for (let x = 0; x < W; x += 12) tri(c, x, 12, x + 12, 12, x + 6, 17, '#7a1220')
    rect(c, 0, 11, W, 1, '#e0b050')
    for (let x = 2; x < W; x += 4) rect(c, x, 12, 1, 3, '#c89a3a')
    // The audience: heads and shoulders in two rows, black against the footlights, rimmed in their glow.
    for (let row = 0; row < 2; row++)
      for (let x = (row ? 9 : 0) - 4; x < W + 8; x += 18) {
        const y = H - 8 + row * 6 - ((x * 7) % 3)
        ellipse(c, x, y - 7, 6, 6, '#c89a4a')
        rect(c, x - 9, y - 1, 18, 1, '#c89a4a')
        ellipse(c, x, y - 6, 6, 6, '#050306')
        rect(c, x - 9, y, 18, 14, '#050306')
      }
    // The chord: a gold flare across the footlights.
    if (t > T_CHORD && t < REVEAL + 0.4) {
      const q = 1 - span(t, T_CHORD, REVEAL + 0.4)
      rect(c, 0, FLOOR + 22, W, 3, pattern(c, '#fff0b0', Math.round(q * 12)))
    }
    dissolve(g, scratchFront, k)
  },
  sounds: [
    [0.15, () => tone(440, 1.2, { type: 'sine', vol: 0.03 })],
    [T_OPEN, () => hiss(0.9, { freq: 600, slide: -300, vol: 0.04 })],
    [
      T_STAFF,
      () => [1047, 1319, 1568].forEach((fq, i) => tone(fq, 0.3, { type: 'sine', vol: 0.015, at: i * 0.05 })),
    ],
    ...SONG.map(
      ([at, st], i) =>
        [
          at,
          () => {
            tone(FREQ[st]!, at < T_PIROUETTE ? 0.3 : 0.12, { type: 'triangle', vol: 0.035 })
            if (i % 2 === 0) tone(FREQ[st]! / 2, at < T_PIROUETTE ? 0.3 : 0.12, { type: 'sine', vol: 0.02 })
          },
        ] as const,
    ),
    [T_PIROUETTE, () => hiss(1.0, { freq: 1200, slide: 1800, vol: 0.03 })],
    [3.5, () => fxSound('legend.heart')],
    [
      T_CHORD,
      () =>
        [523, 659, 784, 1047].forEach((fq) => {
          tone(fq, 0.9, { type: 'triangle', vol: 0.03 })
          tone(fq * 2, 0.6, { type: 'sine', vol: 0.01 })
        }),
    ],
    [REVEAL, () => fxSound('legend.roar')],
    // Applause.
    ...[0.35, 0.5, 0.62, 0.8, 0.95].map(
      (d) => [REVEAL + d, () => hiss(0.25, { freq: 2500, q: 0.6, vol: 0.03 })] as const,
    ),
  ],
})
