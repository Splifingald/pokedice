// Act 1, the title (0 → 2.5 s): eight pixel-art dice thrown onto a wooden table roll right to left and stop, a little
// crooked, on the letters P O K É D I C E. The gold combo ring, the push in, "A dice battler", then the É die flies at
// the camera and its yellow fills the screen.
import { canvas, ellipseLine } from '@/fx/pixel'
import { ACT, hit } from '../lib/clock'
import { play } from '../lib/audio'
import { drawDie, drawShadow, faceTexture, FACES, project, restOn, throwAt, type DieDraw, type Throw, type View } from '../lib/cube'
import { clamp, GOLD, OH, OW, outBack, span, text, TYPE, wash } from '../lib/draw'
import type { Act } from '../main'

const LW = 320
const LH = 180
const K = 6
const low = canvas(LW, LH)

export const LETTERS = ['P', 'O', 'K', 'É', 'D', 'I', 'C', 'E'] as const
export const FILLS = [TYPE.fire, TYPE.water, TYPE.grass, TYPE.electric, TYPE.psychic, TYPE.ice, TYPE.dragon, TYPE.fairy]
const SIZE = 24
const GAP = 5
// Thrown, not typeset: each die's turn and its step off the line (world units).
const YAW = [0.1, -0.06, 0.13, -0.11, 0.04, -0.14, 0.08, -0.05]
const OFF = [1.5, -1, 0.5, -2, 1, -0.5, 2, -1.5]

/** The eight dice at rest, or rolling in: where each one is at time t (seconds since the throw). */
export function logoDice(t: number, { thrown = true, dur = 1.1 } = {}): DieDraw[] {
  return LETTERS.map((letter, i) => {
    const x = (i - 3.5) * (SIZE + GAP)
    const faces: (number | string)[] = FACES.map((f) => f.pips)
    faces[0] = letter
    const th: Throw = {
      from: [x + 170 + i * 10, OFF[i]! - 120 - (7 - i) * 4, 0],
      to: [x, OFF[i]!, 0],
      t0: i * 0.04,
      t1: i * 0.04 + dur + (i === 7 ? 0.05 : 0),
      rest: restOn(0, YAW[i]!),
      spin: 10 + (i % 3) * 3,
      spinAxis: [0.2 + (i % 2) * 0.5, 0.6, 1],
      arcs: [64 + (i % 3) * 10, 20 - (i % 2) * 5, 6],
      wobble: i === 7 ? 0.5 : 0,
      size: SIZE,
    }
    const at = thrown ? throwAt(th, t) : { pos: [x, OFF[i]!, SIZE / 2] as const, R: th.rest, landings: [] }
    return { pos: at.pos, R: at.R, fill: FILLS[i]!, faces, size: SIZE, landings: at.landings } as DieDraw & {
      landings: number[]
    }
  })
}

// ---------------------------------------------------------------- the table
const woodCache = new Map<string, ImageData>()
/** Oak planks seen from above at an angle: planks along x, seams, grain, a pool of morning light. */
function table(v: View, lightK: number) {
  const key = `${v.cs.toFixed(3)}|${v.cx.toFixed(1)}|${v.cy.toFixed(1)}|${lightK.toFixed(2)}`
  let img = woodCache.get(key)
  if (!img) {
    img = low.g.createImageData(LW, LH)
    const sin = Math.sin(v.tilt)
    const P = 19
    for (let sy = 0; sy < LH; sy++) {
      // The table's world y for this row (z = 0): sy = cy − y·sin(tilt)·cs.
      const wy = -(sy - v.cy) / (sin * v.cs)
      const plank = Math.floor(wy / P)
      const inPlank = wy - plank * P
      const seed = Math.sin(plank * 12.9898) * 43758.5453
      const tone = seed - Math.floor(seed)
      for (let sx = 0; sx < LW; sx++) {
        const wx = (sx - v.cx) / v.cs + plank * 37
        const grain = Math.sin(wx * 0.09 + Math.sin(wx * 0.021 + plank) * 3 + inPlank * 0.7)
        let r = 196 + tone * 26
        let g = 140 + tone * 18
        let b = 86 + tone * 10
        if (grain > 0.55) {
          r -= 22
          g -= 18
          b -= 12
        } else if (grain < -0.8) {
          r += 8
          g += 6
          b += 4
        }
        // Seams between planks and a few nail holes.
        if (inPlank < 1.1 || inPlank > P - 0.4) {
          r = 112
          g = 70
          b = 40
        }
        // The morning light: brighter in a wide pool, stepped (ordered dither on the edge).
        const dx = (sx - LW * 0.42) / LW
        const dy = (sy - LH * 0.42) / LH
        const d = Math.sqrt(dx * dx * 0.9 + dy * dy * 1.6)
        const bay = ((sx & 3) * 4 + (sy & 3)) / 16
        const lightV = clamp(1.25 - d * 1.9 + (bay - 0.5) * 0.25)
        const lv = Math.round(lightV * 4) / 4
        const k = (0.55 + 0.55 * lv) * lightK
        const i = (sy * LW + sx) * 4
        img.data[i] = Math.min(255, r * k)
        img.data[i + 1] = Math.min(255, g * k)
        img.data[i + 2] = Math.min(255, b * k * 0.96)
        img.data[i + 3] = 255
      }
    }
    if (woodCache.size > 80) woodCache.clear()
    woodCache.set(key, img)
  }
  low.g.putImageData(img, 0, 0)
}

const motes = Array.from({ length: 26 }, (_, i) => {
  const s = Math.sin(i * 78.233) * 43758.5453
  const r = s - Math.floor(s)
  return { x: r * LW, y: ((i * 37) % 100) / 100 * LH, v: 2 + r * 4, ph: i }
})

/** The dice row on its table at time t (seconds since the throw), on the low-res canvas. */
export function drawTableScene(t: number, v: View, { combo = -1, flash = -1, lightK = 1, thrown = true } = {}) {
  table(v, lightK)
  const g = low.g
  const dice = logoDice(t, { thrown })
  for (const d of dice) drawShadow(g, v, d, 'rgba(60,28,10,0.45)')
  // Smears behind the dice still in the air: two ghost frames.
  if (thrown)
    for (const back of [2 / 60, 1 / 60]) {
      const prev = logoDice(t - back)
      g.globalAlpha = 0.3
      prev.forEach((d, i) => {
        if (dice[i]!.pos[2] > SIZE * 0.9 && t - back > 0) drawDie(g, v, d)
      })
      g.globalAlpha = 1
    }
  const order = dice.map((d, i) => ({ d, i })).sort((a, b) => b.d.pos[1] - a.d.pos[1])
  for (const { d } of order) {
    if (t < 0) continue
    drawDie(g, v, {
      ...d,
      ring: combo >= 0 && t >= combo ? GOLD : null,
      flash: flash >= 0 && t >= flash && t < flash + 2 / 60 ? 1 : 0,
    })
  }
  // Dust in the light.
  for (const m of motes) {
    const y = (m.y - t * m.v + LH * 4) % LH
    const x = m.x + Math.sin(t * 0.8 + m.ph) * 4
    g.fillStyle = 'rgba(255,240,200,0.55)'
    g.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
  return { low, dice }
}

const T0 = ACT.title[0]
const COMBO = 1.5
const PUSH = 1.75

export const title: Act = {
  range: ACT.title,
  load: async () => {},
  render(g, T) {
    const t = T - T0
    // The camera trails the dice a little, then pushes in on the beat.
    const pan = 26 * (1 - clamp(t / 1.3)) ** 2
    const push = PUSH <= t ? 1 + 0.16 * outBack(span(t, PUSH, PUSH + 0.35), 1.2) : 1
    const v: View = { tilt: (60 * Math.PI) / 180, cs: 1.2 * push, cx: LW / 2 - pan * push, cy: LH * 0.5 }
    const { dice } = drawTableScene(t, v, { combo: COMBO, flash: COMBO })
    // The combo: a gold ring rushes out over the table, in art pixels.
    if (t >= COMBO && t < COMBO + 0.5) {
      const p = span(t, COMBO, COMBO + 0.5)
      const c = project(v, [0, 0, 0])
      const r = 30 + 260 * p
      // Two pixel rings, a texel apart: a 2-px line with hard edges.
      low.g.globalAlpha = Math.round((1 - p) * 4) / 4
      for (const k of [0, 1]) ellipseLine(low.g, c.x, c.y, r + k, (r + k) * Math.sin(v.tilt), GOLD)
      low.g.globalAlpha = 1
    }
    // Sounds: the throw, then each landing.
    if (hit(T0 + 0.02)) play('rattle')
    dice.forEach((d) => {
      const L = (d as unknown as { landings: number[] }).landings
      L.slice(0, 2).forEach((l) => hit(T0 + l) && play('land'))
    })
    if (hit(T0 + COMBO)) play('levelup')
    g.drawImage(low, 0, 0, LW * K, LH * K)

    // "A dice battler", under the row.
    if (t >= PUSH + 0.1) {
      const a = Math.round(span(t, PUSH + 0.1, PUSH + 0.3) * 4) / 4
      text(g, 'A dice battler', OW / 2, OH * 0.86, { size: 84, font: 'Jersey 15', align: 'center', ow: 6, alpha: a, spacing: 6 })
    }
    // The É die flies at the camera: its yellow fills the screen.
    if (t >= 2.3) {
      const p = span(t, 2.3, 2.5)
      const d = dice[3]!
      const c = project(v, d.pos)
      const s = 140 + 2600 * p ** 2
      g.save()
      g.translate(c.x * K + (OW / 2 - c.x * K) * p, c.y * K + (OH / 2 - c.y * K) * p - 300 * Math.sin(p * Math.PI))
      g.rotate(p * 2.4)
      g.imageSmoothingEnabled = false
      g.drawImage(faceTexture(TYPE.electric, 'É', 24), -s / 2, -s / 2, s, s)
      g.restore()
    }
    // The first frames come out of black.
    if (t < 0.12) wash(g, '#000000', 1 - t / 0.12)
  },
}
