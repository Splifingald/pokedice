// A game timeline (src/fx) played on the trailer's clock instead of the screen's: stepped to any local time in the
// same fixed 1/60 s steps the game uses, so frame n always looks the same. Steps are cheap, so going back means
// starting over from zero.
import { setSfxEnabled } from '@/audio/sfx'
import { canvas, type Canvas } from '@/fx/pixel'
import { setArtUnderStage } from '@/fx/scenes'
import { H, STEP, W, type Cue, type Hud, type Timeline } from '@/fx/timeline'
import { sound } from './audio'

export interface RunOptions {
  /** An area picture lies under the stage: the timeline draws no background of its own (as in a battle). */
  art?: boolean
  /** The timeline's own canvas size when it isn't the 240×160 stage. */
  w?: number
  h?: number
  /** Its sounds are heard (a montage tile next to others stays quiet). */
  audible?: boolean
}

export class Run<S = unknown> {
  readonly cv: Canvas
  def!: Timeline<S>
  s!: S
  t = 0
  /** Heard now (a montage switches its tiles' sounds on and off as the grid changes). */
  loud = true
  /** Cue names (the HUD hook each one called) and when they fired, in local time. */
  readonly fired = new Map<string, number>()
  private cueList: Cue<S>[] = []
  private ci = 0
  private quietUntil = 0
  private readonly hud: Hud

  constructor(
    private readonly make: () => Timeline<S>,
    private readonly o: RunOptions = {},
  ) {
    this.cv = canvas(o.w ?? W, o.h ?? H)
    const note = (name: string) => () => void (this.fired.has(name) || this.fired.set(name, this.t))
    this.hud = {
      contact: note('contact'),
      status: note('status'),
      show: note('show'),
      heal: note('heal'),
      form: note('form'),
      formEnd: note('formEnd'),
      catchResult: note('catch'),
      beat: (name) => void (this.fired.has(name) || this.fired.set(name, this.t)),
    }
    this.reset()
  }

  reset() {
    // The battle stage reads this when it is built: over a picture it draws only the zones.
    setArtUnderStage(!!this.o.art)
    this.def = this.make()
    this.s = this.def.setup()
    setArtUnderStage(false)
    this.cueList = this.def.cues(this.s)
    this.ci = 0
    this.t = 0
    this.fired.clear()
  }

  /**
   * Step to local time `t`. Sounds only play for the steps from `heardFrom` on, so jumping into the middle of a
   * timeline doesn't fire everything before it at once.
   */
  at(t: number, heardFrom = 0) {
    if (t < this.t - 1e-6) this.reset()
    this.quietUntil = heardFrom
    while (this.t + STEP <= t + 1e-6) {
      this.t += STEP
      const loud = this.loud && this.o.audible !== false && this.t >= this.quietUntil && sound.on
      setSfxEnabled(loud)
      this.def.step(this.s, this.t, STEP)
      while (this.ci < this.cueList.length && this.cueList[this.ci]![0] <= this.t)
        this.cueList[this.ci++]![1](this.hud, this.s)
      setSfxEnabled(false)
    }
    return this
  }

  /** Draw the timeline as it is now onto its own canvas. */
  draw() {
    const g = this.cv.g
    g.clearRect(0, 0, this.cv.width, this.cv.height)
    g.imageSmoothingEnabled = false
    this.def.draw(g, this.s, this.def.hold ? this.t : Math.min(this.t, this.def.dur))
    return this.cv
  }
}
