// Admin → Live events → Calendar: a month's runs laid out as bars across its weeks, the way a wall calendar shows a
// trip. Pure layout (UTC days, Monday first, as the raid calendar): the engine's liveRuns says when each run is on, this
// only says where its bar goes, so a recurring event's runs show exactly as players will get them.
import { liveRuns, type LiveEvent } from '@/engine'

const DAY = 86_400_000

/** One run's bar in one week: its first column (0 = Monday), how many days it spans, its lane (row) in the week. */
export interface CalBar {
  run: LiveEvent
  /** The event in the admin's list it comes from (the run itself for a one-off event). */
  rule: LiveEvent
  col: number
  span: number
  lane: number
  /** It starts this week (else it carries on from the week before), it ends this week (else it carries on). */
  startsHere: boolean
  endsHere: boolean
}

export interface CalWeek {
  /** Its seven UTC days, "YYYY-MM-DD", Monday first; some may be the month before's or after's. */
  days: string[]
  bars: CalBar[]
  /** How many lanes its bars need (0 when none runs that week). */
  lanes: number
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** "2026-11" → the weeks (Monday to Sunday) that show it, each with the runs on in it laid out in lanes. */
export function monthWeeks(month: string, list: readonly LiveEvent[]): CalWeek[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = Date.UTC(y, m - 1, 1)
  const last = Date.UTC(y, m, 0)
  const weeks: CalWeek[] = []
  for (let ws = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY; ws <= last; ws += 7 * DAY) {
    const we = ws + 7 * DAY
    const runs = list
      .flatMap((rule) => liveRuns(rule, ws, we).map((run) => ({ run, rule })))
      .map(({ run, rule }) => {
        const s = Date.parse(run.start)
        const e = Date.parse(run.end)
        // The last day it's on: an end at midnight sharp leaves that day free.
        const from = Math.max(ws, Math.floor(s / DAY) * DAY)
        const to = Math.min(we - DAY, Math.floor((e - 1) / DAY) * DAY)
        return { run, rule, col: (from - ws) / DAY, span: (to - from) / DAY + 1, startsHere: s >= ws, endsHere: e <= we, s }
      })
      // The earliest first, the longer first on the same day: long bars keep the top lanes, as on a wall calendar.
      .sort((a, b) => a.col - b.col || b.span - a.span || a.s - b.s || a.run.id.localeCompare(b.run.id))
    const laneEnds: number[] = []
    const bars = runs.map(({ run, rule, col, span, startsHere, endsHere }): CalBar => {
      let lane = laneEnds.findIndex((end) => end < col)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = col + span - 1
      return { run, rule, col, span, lane, startsHere, endsHere }
    })
    weeks.push({ days: Array.from({ length: 7 }, (_, i) => ymd(ws + i * DAY)), bars, lanes: laneEnds.length })
  }
  return weeks
}

/** The month after or before "YYYY-MM", n months away. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return ymd(Date.UTC(y, m - 1 + n, 1)).slice(0, 7)
}
