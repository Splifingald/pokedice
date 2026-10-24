// Live events (docs/20): the ones running for this player, on the server's clock (none while the time is unknown, so
// changing the device's clock starts or stretches nothing). Several can run at once. Payouts, wild encounters and the
// shop read them at the moment they happen; Home, the shop and the chips re-read them every second.
import { buyLiveItem, livesFor, markLiveSeen, type LiveEvent } from '@/engine'
import { t } from '@/i18n'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'
import { serverNow, useServerNow } from './serverTime'

/** The live events in effect for this player right now. */
export function currentLive(): LiveEvent[] {
  const { save, data } = useGame.getState()
  return save ? livesFor(save, data, serverNow()) : []
}

/** The live events for this player and the server time, re-read every `ms`. */
export function useLive(ms = 1000): { lives: LiveEvent[]; now: number | null } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  return { lives: save ? livesFor(save, data, now) : [], now }
}

/** Buys from that event's Special Shop; false (and a toast) when it can't. */
export function buyLive(eventId: string, key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const live = currentLive().find((e) => e.id === eventId)
  if (!live) {
    pushToast(t('ui.live.over'), 'info')
    return false
  }
  const ok = mutateSave((s) => buyLiveItem(s, data, live, key, qty, Date.now(), newId))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/** Its pop-up was shown. */
export function markLivePopupSeen(live: LiveEvent): void {
  mutateSave((s) => {
    const next = markLiveSeen(s, live)
    return next === s ? null : next
  })
}
