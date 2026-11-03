// The gift calendar (docs/55): the calendars running for this player on the server's clock (none while it's unknown,
// so changing the device's clock opens no door early), opening a door (the engine decides if it can, and where the
// reward lands), then the gifts' own opening full screen, and the rules card read once.
import {
  calendarsFor,
  markCalendarRulesSeen,
  openCalendarDay,
  type GiftLanded,
  type LiveEvent,
} from '@/engine'
import { t } from '@/i18n'
import { mutateSave, pushToast, useGame } from './game'
import { useGiftMoment } from './gifts'
import { newId } from './run'
import { serverNow, useServerNow } from './serverTime'
import { pushSaveNow } from './sync'

/** The calendars running for this player and the server time, re-read every `ms`. */
export function useCalendars(ms = 1000): { calendars: LiveEvent[]; now: number | null } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  return { calendars: save ? calendarsFor(save, data, now) : [], now }
}

/**
 * Opens that calendar's door for `day`: its reward into the save, then the gift's opening plays. False (and a toast)
 * when it can't be opened now: the calendar ended, or the door closed while the page was open.
 */
export function openCalendarDoor(eventId: string, day: number): boolean {
  const { save, data } = useGame.getState()
  const now = serverNow()
  const cal = save && now != null ? calendarsFor(save, data, now).find((e) => e.id === eventId) : null
  if (!cal || now == null) {
    pushToast(t('ui.live.over'), 'info')
    return false
  }
  const out: { landed: GiftLanded[] | null } = { landed: null }
  const ok = mutateSave((s) => {
    const res = openCalendarDay(s, data, cal, day, now, newId)
    out.landed = res?.landed ?? null
    return res?.save
  })
  if (!ok || !out.landed) {
    pushToast(t('ui.cal.cantOpen'), 'info')
    return false
  }
  useGiftMoment.setState({ opening: out.landed, source: 'calendar', day })
  void pushSaveNow().catch(() => {})
  return true
}

/** GOT IT on the rules card: once, for every calendar. */
export const calendarRulesSeen = () =>
  mutateSave((s) => {
    const next = markCalendarRulesSeen(s)
    return next === s ? null : next
  })
