// Day and night (docs/31): the player's local hour. The real time (the server's, as the events read it) in the
// device's time zone, so winding the device's clock on doesn't bring the night sooner; until the server has answered,
// the device's own clock, so the game never waits on it.
import { areaDayTime, dayTimeAt, regionKeepsTime, type DayTime } from '@/engine'
import { useGame } from './game'
import { serverNow, useServerNow } from './serverTime'
import { useNow } from './hooks'

/** The player's local hour (0–23) now. */
export const localHour = (now: number = serverNow() ?? Date.now()): number => new Date(now).getHours()

/** Re-read twice a minute: the turn of the hour shows within 30 s. */
const TICK_MS = 30_000

function useHour(): number {
  const device = useNow(TICK_MS)
  const server = useServerNow(TICK_MS)
  return localHour(server ?? device)
}

/** The time where the player is (the top bar's sun or moon): null outside a region that keeps it, or switched off. */
export function useDayTime(): DayTime | null {
  const keeps = useGame((s) => !!s.save && regionKeepsTime(s.save, s.data))
  const hour = useHour()
  return keeps ? dayTimeAt(hour) : null
}

/** The time in an area (its fights' indicator, its lists): null where the area doesn't keep it. */
export function useAreaDayTime(areaId: string | null | undefined): DayTime | null {
  const area = useGame((s) => (areaId ? s.data.areas.find((a) => a.id === areaId) : undefined))
  const data = useGame((s) => s.data)
  const hour = useHour()
  return area ? areaDayTime(data, area, hour) : null
}
