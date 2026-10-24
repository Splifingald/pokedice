// The damage count-up after the dice land (docs/38 F2a), as a list of timed beats: each scoring die pops its "+N", the
// combo lands as its own beat, then the total counts to the engine's number. Pure: the numbers all come from the
// engine's damage result (the die's points, the combo's tier, the final damage); this only says when each shows.

export type ScoreLevel = 'full' | 'short' | 'off'

export type ScoreBeat =
  /** A scoring die shows its points; `tick` is its place in the run (the sound climbs a semitone each). */
  | { at: number; kind: 'pop'; die: number; n: number; tick: number }
  /** The combo lands: its chip, its ring, its sound. */
  | { at: number; kind: 'combo'; tier: 1 | 2 | 3 | 4 }
  /** The total shows this whole number; the last one is the engine's damage. */
  | { at: number; kind: 'count'; value: number }

export interface ScoreRunInput {
  /** Each die's points as the engine gives them (its face plus its upgrade), in tray order. */
  points: readonly number[]
  /** The combo's tier (comboTier), 0 with none. */
  tier: 0 | 1 | 2 | 3 | 4
  /** Where the total starts: 0 on a fresh roll, the damage shown before on a reroll. */
  from: number
  /** The engine's damage: where the total ends. */
  to: number
  level: ScoreLevel
  /** The battle's pace: every time × pace. */
  pace?: number
}

/** Full: a die every 60 ms, the combo after a short breath, the total over 300–500 ms. */
export const POP_GAP_MS = 60
export const COMBO_GAP_MS = 100
export const COUNT_MIN_MS = 300
export const COUNT_MAX_MS = 500
/** Short (the setting, auto battles): the whole run in this much. */
export const SHORT_TOTAL_MS = 250
/** One click per step of the count, never closer than this. */
const STEP_MS = 35

/** The count's steps: whole numbers from `from` (left out) to `to` (always last), at most `steps` of them. */
export function countSteps(from: number, to: number, steps: number): number[] {
  const span = Math.abs(to - from)
  const n = Math.max(1, Math.min(span, Math.floor(steps)))
  const out: number[] = []
  for (let s = 1; s <= n; s++) {
    const v = s === n ? to : Math.round(from + ((to - from) * s) / n)
    if (v !== out[out.length - 1] && v !== from) out.push(v)
  }
  if (out[out.length - 1] !== to) out.push(to)
  return out
}

export function planScore({ points, tier, from, to, level, pace = 1 }: ScoreRunInput): ScoreBeat[] {
  const beats: ScoreBeat[] = []
  // Off: the end state at once (the combo still named, for its sound and ring).
  if (level === 'off') {
    if (tier) beats.push({ at: 0, kind: 'combo', tier })
    beats.push({ at: 0, kind: 'count', value: to })
    return beats
  }
  const scoring = points.flatMap((n, die) => (n > 0 ? [{ die, n }] : []))
  const short = level === 'short'
  // Short squeezes the pops into 100 ms however many dice there are.
  const gap = short ? (scoring.length ? Math.min(25, 100 / scoring.length) : 0) : POP_GAP_MS
  scoring.forEach((s, tick) => beats.push({ at: tick * gap, kind: 'pop', die: s.die, n: s.n, tick }))
  const popsEnd = scoring.length ? (scoring.length - 1) * gap : 0
  let at = scoring.length ? popsEnd + (short ? 30 : COMBO_GAP_MS) : 0
  if (tier) {
    beats.push({ at, kind: 'combo', tier })
    at += short ? 20 : 120
  }
  // The count: longer for a bigger climb, inside its window, a step at most every STEP_MS.
  const span = Math.abs(to - from)
  const length = short
    ? Math.max(0, SHORT_TOTAL_MS - at)
    : Math.min(COUNT_MAX_MS, Math.max(COUNT_MIN_MS, COUNT_MIN_MS + span * 4))
  const values = countSteps(from, to, short ? 4 : length / STEP_MS)
  values.forEach((value, i) =>
    beats.push({ at: at + (length * (i + 1)) / values.length, kind: 'count', value }),
  )
  return beats.map((b) => ({ ...b, at: Math.round(b.at * pace) }))
}

/** How long a run lasts (ms): its last beat. */
export const scoreLength = (beats: readonly ScoreBeat[]) => beats.reduce((m, b) => Math.max(m, b.at), 0)
