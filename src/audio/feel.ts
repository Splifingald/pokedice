// The game-feel pass's sounds (docs/38), synthesised from sfx.ts's tone and hiss, on the same Sound switch. Callers
// check `gameFeelOn` first: with the pass off, none of these plays. Each part of the pass keeps its sounds in its own
// block below, so they can grow apart.
import { hiss, tone } from './sfx'

/** `f` raised by `n` semitones: a run of ticks climbs the scale. */
const up = (f: number, n: number) => f * 2 ** (n / 12)

/** A short tune: [frequency, start, length] notes on one voice. */
const tune = (notes: [number, number, number][], type: OscillatorType = 'square', vol = 0.05) => {
  for (const [f, at, d] of notes) tone(f, d, { type, vol, at })
}

const FEEL_SOUNDS = {
  // ---------------------------------------------------------------- the dice and the readout
  'die.pick': () => tone(988, 0.035, { vol: 0.045 }),
  'die.unpick': () => tone(659, 0.035, { vol: 0.045 }),
  'die.landHeavy': () => {
    hiss(0.05, { freq: 320, vol: 0.09 })
    tone(120, 0.08, { type: 'triangle', vol: 0.09, slide: -40 })
  },
  'die.jitter': () => hiss(0.06, { freq: 1800, vol: 0.03 }),
  /** One scoring die: `n` is its place in the run, a semitone higher each time. */
  'score.tick': (n = 0) => tone(up(523, n), 0.045, { vol: 0.045 }),
  /** The total counting up: one soft click per step. */
  'score.count': () => tone(1568, 0.018, { vol: 0.025 }),
  'combo.1': () => tune([[659, 0, 0.06], [880, 0.06, 0.09]]),
  'combo.2': () => tune([[659, 0, 0.06], [784, 0.06, 0.06], [988, 0.12, 0.12]]),
  'combo.3': () => {
    tune([[523, 0, 0.06], [659, 0.06, 0.06], [784, 0.12, 0.06], [1047, 0.18, 0.16]])
    hiss(0.12, { freq: 2400, vol: 0.03, at: 0.18 })
  },
  'combo.4': () => {
    tune([[523, 0, 0.07], [659, 0.07, 0.07], [784, 0.14, 0.07], [1047, 0.21, 0.07], [1319, 0.28, 0.24]])
    tune([[262, 0.28, 0.24]], 'triangle', 0.07)
    hiss(0.2, { freq: 3000, vol: 0.035, at: 0.28 })
  },
  'reroll.last': () => tune([[392, 0, 0.05], [392, 0.08, 0.05]], 'square', 0.035),

  // ---------------------------------------------------------------- hits
  'hit.super': () => {
    tune([[880, 0, 0.05], [1175, 0.05, 0.05], [1760, 0.1, 0.1]], 'square', 0.05)
    hiss(0.1, { freq: 2200, vol: 0.05 })
  },
  'hit.resisted': () => tone(220, 0.08, { type: 'triangle', vol: 0.05, slide: -60 }),
  'hit.ko': () => {
    hiss(0.3, { freq: 380, vol: 0.13, slide: -200 })
    tone(98, 0.3, { type: 'square', vol: 0.06, slide: -50 })
  },
  'ko.sting': () => tune([[784, 0, 0.08], [659, 0.08, 0.08], [523, 0.16, 0.08], [784, 0.26, 0.18]], 'triangle', 0.07),

  // ---------------------------------------------------------------- the area's flow (docs/42)
  /** A new encounter: the stage's bars pulling away, a rush of air and a low hit. */
  'encounter.swipe': () => {
    hiss(0.22, { freq: 900, vol: 0.06, slide: 1400 })
    tone(147, 0.12, { type: 'triangle', vol: 0.07, slide: 60, at: 0.04 })
  },
  /** A round of the area done: its pip on the gauge fills. */
  'round.fill': () => tune([[784, 0, 0.05], [1175, 0.05, 0.1]], 'square', 0.04),

  // ---------------------------------------------------------------- rewards and moments
  'win.jingle': () =>
    tune([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.12], [988, 0.44, 0.08], [1047, 0.52, 0.3]], 'square', 0.05),
  'coin.tick': () => tone(1976, 0.03, { vol: 0.03 }),
  /** The XP bar filling: `n` steps up the scale as it goes. */
  'xp.tick': (n = 0) => tone(up(440, n % 12), 0.025, { type: 'triangle', vol: 0.04 }),
  'level.roll': () => tune([[784, 0, 0.06], [988, 0.06, 0.06], [1175, 0.12, 0.06], [1568, 0.18, 0.2]], 'square', 0.05),
  'badge.fanfare': () => {
    tune([[392, 0, 0.12], [523, 0.12, 0.12], [659, 0.24, 0.12], [784, 0.36, 0.24], [659, 0.6, 0.1], [784, 0.7, 0.4]], 'square', 0.05)
    tune([[196, 0, 0.36], [262, 0.36, 0.34], [196, 0.7, 0.4]], 'triangle', 0.07)
  },
  'area.fanfare': () =>
    tune([[523, 0, 0.1], [784, 0.1, 0.1], [1047, 0.2, 0.1], [784, 0.32, 0.08], [1047, 0.4, 0.3]], 'square', 0.05),
  'champion.fanfare': () => {
    tune([[523, 0, 0.14], [523, 0.14, 0.07], [523, 0.21, 0.07], [698, 0.28, 0.2], [880, 0.48, 0.14], [1047, 0.62, 0.5]], 'square', 0.055)
    tune([[131, 0, 0.28], [175, 0.28, 0.34], [262, 0.62, 0.5]], 'triangle', 0.08)
  },
  'defeat.jingle': () => tune([[523, 0, 0.14], [466, 0.14, 0.14], [415, 0.28, 0.14], [349, 0.42, 0.36]], 'triangle', 0.07),
  'dex.registered': () => tune([[1047, 0, 0.07], [1319, 0.07, 0.07], [1568, 0.14, 0.07], [2093, 0.21, 0.18]], 'square', 0.04),
  'shiny.chime': () => {
    tune([[1568, 0, 0.12], [2093, 0.08, 0.12], [2637, 0.16, 0.2]], 'triangle', 0.06)
    hiss(0.25, { freq: 6000, vol: 0.02, at: 0.1 })
  },
  'upgrade.pop': () => tune([[659, 0, 0.05], [988, 0.05, 0.05], [1319, 0.1, 0.12]], 'square', 0.045),

  // ---------------------------------------------------------------- taps and Home
  'ui.press': () => tone(880, 0.025, { vol: 0.03 }),
  /** The title's dice logo formed (docs/38 §9): a bright run up, a low note under its top, a sparkle. */
  'title.chime': () => {
    tune([[784, 0, 0.06], [1047, 0.06, 0.06], [1319, 0.12, 0.06], [1568, 0.18, 0.24]], 'square', 0.045)
    tune([[523, 0.18, 0.24]], 'triangle', 0.06)
    hiss(0.18, { freq: 5200, vol: 0.02, at: 0.18 })
  },
} satisfies Record<string, (n?: number) => void>

export type FeelSound = keyof typeof FEEL_SOUNDS

export function feelSound(name: FeelSound, n?: number) {
  try {
    FEEL_SOUNDS[name](n)
  } catch {
    /* audio is best-effort */
  }
}
