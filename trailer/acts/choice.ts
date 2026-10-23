// Act 5, the choice (17.5 → 19.5 s): Prof. Oak's lab (the partner moment, docs/15 §18). Three Poké Balls drop onto
// their cradles, Bulbasaur, Charmander and Squirtle flash out one after another, then everything holds on the game's
// dialogue box: "What's your choice?"
import { LAB_ART, loadArt as loadAreaArt } from '@/fx/areaArt'
import { labColors, StarterScene } from '@/fx/timelines/starter'
import type { Timeline } from '@/fx/timeline'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { cry, playWith } from '../lib/audio'
import { tone } from '@/audio/sfx'
import { INK, OH, OW, rect, span, text, wash, type G } from '../lib/draw'
import { Run } from '../lib/run'
import { loadMon, mon } from '../lib/sprites'
import { camLerp, drawStage, type Cam } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.choice[0]
// The lab's own clock: 2.4× through the drop, 2.5× through the three peeks, then slow while the question holds.
const FROM = 0.6
const OPEN = [2.45, 2.95, 3.45]
const SHUT = 0.45
const HOLD = 1.35
const labTime = (c: number) => (c < 0.75 ? FROM + c * 2.4 : c < HOLD ? 2.4 + (c - 0.75) * 2.5 : 3.9 + (c - HOLD) * 0.6)
const realOf = (s: number) => (s < 2.4 ? (s - FROM) / 2.4 : 0.75 + (s - 2.4) / 2.5)

let lab: Run<StarterScene> | null = null
let labImg: HTMLImageElement | null = null

function labTimeline(): Timeline<StarterScene> {
  return {
    id: 'trailer.lab',
    dur: 600,
    setup: () => new StarterScene({ lab: labColors('kanto'), mons: [mon(1), mon(4), mon(7)], ribbon: null, picture: true }),
    step(s, t, dt) {
      OPEN.forEach((o, i) => {
        const opened = s.slots[i]!.openAt
        if (t >= o && t < o + SHUT && s.open !== i && (opened == null || opened < o)) s.openBall(i, o)
        if (t >= o + SHUT && s.open === i) s.closeBall(i, o + SHUT)
      })
      s.step(t, dt)
    },
    draw: (g, s, t) => s.draw(g, t),
    cues: () => [],
  }
}

const LINE = "What's your choice?"

/** The game's dialogue box: paper, the ink edge, its pale inner ring, the typewriter and the blinking ▼. */
export function dialogue(g: G, line: string, shown: number, t: number, y = 790) {
  const x = 150
  const w = OW - 300
  const h = 220
  rect(g, x - 8, y - 8, w + 16, h + 16 + 8, 'rgba(36,48,79,0.25)')
  rect(g, x - 8, y - 8, w + 16, h + 16, INK)
  rect(g, x, y, w, h, PALETTE.paper)
  rect(g, x + 8, y + 8, w - 16, 6, '#cfe0f4')
  rect(g, x + 8, y + h - 14, w - 16, 6, '#cfe0f4')
  rect(g, x + 8, y + 8, 6, h - 16, '#cfe0f4')
  rect(g, x + w - 14, y + 8, 6, h - 16, '#cfe0f4')
  const n = Math.floor(shown)
  text(g, line.slice(0, n), x + 70, y + 138, { size: 104, color: INK, ow: 0 })
  if (n >= line.length && Math.floor(t * 3) % 2 === 0) {
    g.fillStyle = INK
    g.beginPath()
    g.moveTo(x + w - 90, y + h - 70)
    g.lineTo(x + w - 50, y + h - 70)
    g.lineTo(x + w - 70, y + h - 46)
    g.closePath()
    g.fill()
  }
}

export const choice: Act = {
  range: ACT.choice,
  async load() {
    await Promise.all([loadMon(1), loadMon(4), loadMon(7)])
    labImg = await loadAreaArt(LAB_ART)
    lab = new Run(labTimeline)
  },
  render(g, T) {
    const c = T - T0
    const r = lab!
    const st = labTime(c)
    r.at(st, FROM)
    // The lab picture under the scene, as PartnerMoment lays it: the 240×160 stage, drawn 400 px wide.
    const cam: Cam = camLerp({ x: 120, y: 80, z: 8 }, { x: 120, y: 92, z: 9 }, span(c, 0.35, 1.25) ** 0.7)
    g.save()
    drawStage(g, null, [], cam, undefined, { ground: '#2a3150' })
    const ox = OW / 2 - cam.x * cam.z
    const oy = OH / 2 - cam.y * cam.z
    g.imageSmoothingEnabled = false
    if (labImg) g.drawImage(labImg, Math.round(ox), Math.round(oy), Math.round(240 * cam.z), Math.round(160 * cam.z))
    g.drawImage(r.draw(), Math.round(ox), Math.round(oy), Math.round(240 * cam.z), Math.round(160 * cam.z))
    g.restore()
    OPEN.forEach((o, i) => hit(T0 + realOf(o) + 0.05) && cry([1, 4, 7][i]!, 0.8))
    // The question types in, a blip per letter.
    const start = HOLD + 0.05
    if (c >= start) {
      const shown = (c - start) * 38
      dialogue(g, LINE, shown, c)
      const n = Math.floor(shown)
      const prev = Math.floor(Math.max(0, c - 1 / 60 - start) * 38)
      if (n > prev && n <= LINE.length && LINE[n - 1] !== ' ') playWith(() => tone(880, 0.03, { vol: 0.03 }))
    }
    if (c < 0.06) wash(g, '#ffffff', 1 - c / 0.06)
  },
}
