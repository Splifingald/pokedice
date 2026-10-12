// The offline earnings' clock (docs/25): time out of the game pays the save's ₽ an hour, on the server's clock only —
// moving the device's clock changes nothing, and without the real time an absence neither starts nor pays. The rules
// and numbers are the engine's (engine/general); this keeps the save in step with the page going away and coming back.
import { create } from 'zustand'
import { collectOffline, inWorldRegion, markOfflineFrom } from '@/engine'
import { t } from '@/i18n'
import { money } from '@/lib/format'
import { trustedNow } from './clock'
import { commitSave, pushToast, useGame } from './game'
import { syncServerTime } from './serverTime'

const HOUR = 3_600_000

export interface OfflineReport {
  gold: number
  ms: number
  perHour: number
}

/** "While you were away": what the last absence paid, until the player closes the card. */
export const useOfflineReport = create<{ report: OfflineReport | null }>(() => ({ report: null }))
export const closeOfflineReport = () => useOfflineReport.setState({ report: null })

/** The page is hidden or leaving: no collecting until it's back, whatever save arrives meanwhile. */
let away = false

/** The page is hidden or leaving: the absence starts now, on the real time (unknown: this one won't pay). */
export function markOfflineAway() {
  away = true
  const { save, data } = useGame.getState()
  const now = trustedNow()
  if (!save || now == null) return
  const next = markOfflineFrom(save, data, now)
  if (next !== save) commitSave(next)
}

let returning = false
/** When the last try failed to read the real time (performance.now): the next save change doesn't ask again at once. */
let failedAt = -Infinity
const RETRY_MS = 60_000

/**
 * Back in the game (or loaded): the real time is read again first — a phone that slept may have stopped the page's
 * own clock — then the absence pays. An hour or more opens the card; less is a toast.
 */
export async function collectOfflineGold(force = false) {
  away = false
  const { save: first, data: firstData } = useGame.getState()
  // Inside a small world the absence waits (engine: nothing is paid there), so there's nothing to ask the time for.
  if (returning || first?.general?.awayFrom == null || inWorldRegion(first, firstData)) return
  if (!force && performance.now() - failedAt < RETRY_MS) return
  returning = true
  try {
    await syncServerTime()
    const now = trustedNow()
    const { save, data } = useGame.getState()
    if (now == null) failedAt = performance.now()
    if (now == null || !save) return
    const res = collectOffline(save, data, now)
    if (!res) return
    commitSave(res.save)
    if (res.gold <= 0) return
    if (res.ms >= HOUR)
      useOfflineReport.setState({ report: { gold: res.gold, ms: res.ms, perHour: res.perHour } })
    else pushToast(t('ui.general.offline.toast', { amount: money(res.gold) }), 'good')
  } finally {
    returning = false
  }
}

let started = false
/**
 * Once, at start: the absence the last visit left open pays, and so does one that arrives with a save while the player
 * is here (pulled from the cloud, left open on another device).
 */
export function startOfflineClock() {
  if (started) return
  started = true
  useGame.subscribe((st, prev) => {
    if (
      st.save !== prev.save &&
      !away &&
      st.save?.general?.awayFrom != null &&
      document.visibilityState === 'visible'
    )
      void collectOfflineGold()
  })
  void collectOfflineGold(true)
}
