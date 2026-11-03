// Admin → Live events → Calendar: a month's live event runs and small worlds laid out as bars across its weeks, the way
// a wall calendar shows a trip. Pure layout (UTC days, Monday first, as the raid calendar): the engine's liveRuns says
// when each run is on, this only says where its bar goes, so a recurring event's runs show exactly as players get them.
import { liveRuns, type LiveEvent, type SmallWorld } from '@/engine'

const DAY = 86_400_000

/**
 * What a bar stands for: a live event's run (and the event in the admin's list it comes from: the run itself for a
 * one-off event), or a small world (docs/21), which runs once between its dates.
 */
export type CalEntry = { kind: 'live'; run: LiveEvent; rule: LiveEvent } | { kind: 'world'; world: SmallWorld }

/** One entry's bar in one week: its first column (0 = Monday), how many days it spans, its lane (row) in the week. */
export interface CalBar {
  entry: CalEntry
  /** Its run's or world's id, its start and end (ISO). */
  id: string
  start: string
  end: string
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

/** The live events' runs and the small worlds on at some point between `from` and `to` (ms). */
export function calEntries(list: readonly LiveEvent[], worlds: readonly SmallWorld[], from: number, to: number): CalEntry[] {
  const on = (w: SmallWorld) => {
    const s = Date.parse(w.start)
    const e = Date.parse(w.end)
    return s < to && from < e && e > s
  }
  return [
    ...list.flatMap((rule) => liveRuns(rule, from, to).map((run): CalEntry => ({ kind: 'live', run, rule }))),
    ...worlds.filter(on).map((world): CalEntry => ({ kind: 'world', world })),
  ]
}

const dates = (e: CalEntry) => (e.kind === 'live' ? e.run : e.world)

/**
 * "2026-11" → the weeks (Monday to Sunday) that show it, each with the live event runs and small worlds on in it laid
 * out in lanes.
 */
export function monthWeeks(month: string, list: readonly LiveEvent[], worlds: readonly SmallWorld[] = []): CalWeek[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = Date.UTC(y, m - 1, 1)
  const last = Date.UTC(y, m, 0)
  const weeks: CalWeek[] = []
  for (let ws = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY; ws <= last; ws += 7 * DAY) {
    const we = ws + 7 * DAY
    const runs = calEntries(list, worlds, ws, we)
      .map((entry) => {
        const { id, start, end } = dates(entry)
        const s = Date.parse(start)
        const e = Date.parse(end)
        // The last day it's on: an end at midnight sharp leaves that day free.
        const from = Math.max(ws, Math.floor(s / DAY) * DAY)
        const to = Math.min(we - DAY, Math.floor((e - 1) / DAY) * DAY)
        return { entry, id, start, end, col: (from - ws) / DAY, span: (to - from) / DAY + 1, startsHere: s >= ws, endsHere: e <= we, s }
      })
      // The earliest first, the longer first on the same day: long bars keep the top lanes, as on a wall calendar.
      .sort((a, b) => a.col - b.col || b.span - a.span || a.s - b.s || a.id.localeCompare(b.id))
    const laneEnds: number[] = []
    const bars = runs.map(({ s: _s, ...r }): CalBar => {
      let lane = laneEnds.findIndex((end) => end < r.col)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = r.col + r.span - 1
      return { ...r, lane }
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
