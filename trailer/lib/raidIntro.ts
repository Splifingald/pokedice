// A legend's raid opening for the trailer: its own cinematic (src/fx/timelines/cinema, docs/53: Rayquaza at Sky
// Pillar, Lugia out of the Whirl Islands' whirlpool…) on the trailer's clock, with the raid intro's words laid over it
// as RaidIntro.tsx times them from the reveal (wordsAt): RAID BATTLE and the name slamming down, then its three HP bars
// filling. No warning tapes: the game has none with the cinematics on. Drawn at the size it is shown, in art pixels.
import { canvas, ease, text, textWidth } from '@/fx/pixel'
import { RAID_CINEMAS, wordsAt } from '@/fx/timelines/cinema'
import { hiss, tone } from '@/audio/sfx'
import { playWith } from './audio'
import { Run } from './run'
import { mon } from './sprites'

// A raid boss has three HP bars.
const BARS = 3
const BAR_PITCH = 46

export class RaidIntro {
  readonly cv
  readonly reveal: number
  private readonly run: Run
  private last = -1
  /** The words' pixel size: 1 at 180 art pixels high, 2 for a full 1080p frame at ×4. */
  private readonly u: number

  constructor(
    dex: number,
    private readonly name: string,
    readonly w: number,
    readonly h: number,
  ) {
    const cinema = RAID_CINEMAS[dex]!
    this.reveal = cinema.reveal
    this.run = new Run(() => cinema.make({ mon: mon(dex), w, h }), { w, h })
    this.cv = canvas(w, h)
    this.u = Math.max(1, Math.round(h / 180))
  }

  /**
   * The opening at its time t (seconds), started from `from` (what comes before is stepped through unheard), heard or
   * not (a grid's tiles play together, one heard).
   */
  draw(t: number, from: number, audible = true) {
    const r = this.run
    r.loud = audible
    r.at(t, from)
    const g = this.cv.g
    g.clearRect(0, 0, this.w, this.h)
    g.drawImage(r.draw(), 0, 0)
    if (audible) this.sounds(this.last, t)
    this.last = t
    this.words(t)
    return this.cv
  }

  /** The words' sounds, between two times, as the raid intro plays them: the name's slam, a tick per bar. */
  private sounds(a: number, b: number) {
    if (b < a) return
    const W = wordsAt(this.reveal)
    const at = (ms: number, fn: () => void) => a < ms / 1000 && b >= ms / 1000 && playWith(fn)
    at(W.name, () => hiss(0.18, { vol: 0.09, freq: 160 }))
    for (let i = 0; i < BARS; i++) at(W.bars + i * 250, () => tone(1320 + i * 220, 0.12, { vol: 0.045 }))
  }

  /** RAID BATTLE and the name slamming down, then the bars filling one by one, in the game's bitmap font. */
  private words(t: number) {
    const W = wordsAt(this.reveal)
    const e = t - W.name / 1000
    if (e < 0) return
    const g = this.cv.g
    const u = this.u
    const p = Math.min(1, e / 0.2)
    const s = Math.max(3 * u, Math.round((6 - 3 * ease.outBack(p, 1.6)) * u))
    const nw = textWidth(this.name, s)
    text(g, 'RAID BATTLE', this.w / 2 - textWidth('RAID BATTLE', u) / 2, 10 * u, '#ffbe2e', '#24304f', u)
    text(g, this.name, this.w / 2 - nw / 2, 22 * u, '#fbfdff', '#24304f', s, '#c4382a')
    const pitch = BAR_PITCH * u
    for (let i = 0; i < BARS; i++) {
      const f = Math.max(0, Math.min(1, (t - W.bars / 1000 - i * 0.25) / 0.24))
      const bx = this.w / 2 - (BARS * pitch - 4 * u) / 2 + i * pitch
      const y = 49 * u
      g.fillStyle = '#fbfdff'
      g.fillRect(bx - u, y, pitch - 2 * u, 7 * u)
      g.fillStyle = '#24304f'
      g.fillRect(bx, y + u, pitch - 4 * u, 5 * u)
      g.fillStyle = ['#34c97a', '#ffbe2e', '#ff5a4a'][i]!
      g.fillRect(bx + u, y + 2 * u, Math.round((pitch - 6 * u) * f), 3 * u)
    }
  }
}
