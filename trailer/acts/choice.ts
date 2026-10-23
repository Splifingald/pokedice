// Act 5, the choice (50 → 54.5 s): Prof. Oak's lab (the partner moment, docs/15 §18). The three Poké Balls drop onto
// their cradles and stay shut; the camera closes in on the middle one while it shakes, and the game's dialogue box
// asks "What's your choice?"
import { LAB_ART, loadArt as loadAreaArt } from '@/fx/areaArt'
import { labColors, starterSeats, StarterScene } from '@/fx/timelines/starter'
import type { Timeline } from '@/fx/timeline'
import { tone } from '@/audio/sfx'
import { PALETTE } from '@/theme/colors'
import { ACT } from '../lib/clock'
import { playWith } from '../lib/audio'
import { inOut, INK, OW, rect, span, text, wash, type G } from '../lib/draw'
import { Run } from '../lib/run'
import { loadMon, mon } from '../lib/sprites'
import { F, stageEdge, surround } from '../lib/frame'
import { camLerp, drawStage, sharpDraw, type Cam } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.choice[0]
// The lab's own clock: 1.5× through the drop, then its own pace.
const FROM = 0.6
const labTime = (c: number) => (c < 1.2 ? FROM + c * 1.5 : 2.4 + (c - 1.2))
const ZOOM = [1.3, 3.0] as const
const ASK = 2.7
const SEAT = starterSeats(true)[1]!

/** The middle ball's shake: bursts of a quick rattle, more often as the camera closes in, like one about to open. */
const shakeOf = (t: number) => {
  if (t < 2.5) return 0
  const p = (t - 2.5) % 0.9
  return p < 0.4 ? Math.sin(p * 44) * 0.42 * (1 - p / 0.4) : 0
}

let lab: Run<StarterScene> | null = null
let labImg: HTMLImageElement | null = null

function labTimeline(): Timeline<StarterScene> {
  return {
    id: 'trailer.lab',
    dur: 600,
    setup: () => {
      const s = new StarterScene({ lab: labColors('kanto'), mons: [mon(1), mon(4), mon(7)], ribbon: null, picture: true })
      // The scene's idle wobble is its own (a private method); the trailer swaps in the middle ball's shake.
      Object.defineProperty(s, 'wobble', { value: (i: number, t: number) => (i === 1 ? shakeOf(t) : 0) })
      return s
    },
    step: (s, t, dt) => s.step(t, dt),
    draw: (g, s, t) => s.draw(g, t),
    cues: () => [],
  }
}

const LINE = "What's your choice?"

/** The game's dialogue box: paper, the ink edge, its pale inner ring, the typewriter and the blinking ▼. */
export function dialogue(g: G, line: string, shown: number, t: number, y = F.portrait ? F.stage.y + F.stage.h + 60 : 790) {
  // Portrait: under the lab, nearly the frame's width, the words a little smaller to fit.
  const x = F.portrait ? 40 : 150
  const w = OW - 2 * x
  const h = 220
  const size = F.portrait ? 92 : 104
  rect(g, x - 8, y - 8, w + 16, h + 16 + 8, 'rgba(36,48,79,0.25)')
  rect(g, x - 8, y - 8, w + 16, h + 16, INK)
  rect(g, x, y, w, h, PALETTE.paper)
  rect(g, x + 8, y + 8, w - 16, 6, '#cfe0f4')
  rect(g, x + 8, y + h - 14, w - 16, 6, '#cfe0f4')
  rect(g, x + 8, y + 8, 6, h - 16, '#cfe0f4')
  rect(g, x + w - 14, y + 8, 6, h - 16, '#cfe0f4')
  const n = Math.floor(shown)
  text(g, line.slice(0, n), x + (F.portrait ? 50 : 70), y + 138, { size, color: INK, ow: 0 })
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
    // The lab picture under the scene, as PartnerMoment lays it (the 240×160 stage, drawn 400 px wide), the camera
    // closing in on the middle ball. Its two zooms put 5, then 10, screen pixels on each picture pixel (portrait: 3,
    // then 6, in the stage's window): crisp.
    const [z0, z1] = F.portrait ? [5, 10] : [25 / 3, 50 / 3]
    const cam: Cam = camLerp({ x: 120, y: 80, z: z0 }, { x: SEAT.x, y: SEAT.y, z: z1 }, inOut(span(c, ZOOM[0], ZOOM[1])))
    const box = F.stage
    surround(g, T)
    drawStage(g, null, [], cam, box, { ground: '#2a3150' })
    const ox = Math.round(box.x + box.w / 2 - cam.x * cam.z)
    const oy = Math.round(box.y + box.h / 2 - cam.y * cam.z)
    const w = Math.round(240 * cam.z)
    const h = Math.round(160 * cam.z)
    g.save()
    g.beginPath()
    g.rect(box.x, box.y, box.w, box.h)
    g.clip()
    if (labImg) sharpDraw(g, labImg, ox, oy, w, h, true)
    sharpDraw(g, r.draw(), ox, oy, w, h)
    g.restore()
    stageEdge(g)
    // Each shake rattles.
    const prev = labTime(Math.max(0, c - 1 / 60))
    if (st >= 2.5 && (st - 2.5) % 0.9 < (prev - 2.5 + 0.9) % 0.9) playWith(() => tone(220, 0.05, { vol: 0.05, type: 'triangle' }))
    // The question types in, a blip per letter, and holds.
    if (c >= ASK) {
      const shown = (c - ASK) * 38
      dialogue(g, LINE, shown, c)
      const n = Math.floor(shown)
      const before = Math.floor(Math.max(0, c - 1 / 60 - ASK) * 38)
      if (n > before && n <= LINE.length && LINE[n - 1] !== ' ') playWith(() => tone(880, 0.03, { vol: 0.03 }))
    }
    if (c < 0.08) wash(g, '#ffffff', 1 - c / 0.08)
  },
}
