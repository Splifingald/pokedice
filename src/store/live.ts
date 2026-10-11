// Live events (docs/20): the one running for this player, on the server's clock (none while the time is unknown, so
// changing the device's clock starts or stretches nothing). Payouts, wild encounters and the shop read it at the
// moment they happen; Home, the shop and the chips re-read it every second.
import { buyLiveItem, liveFor, markLiveSeen, type LiveEvent } from '@/engine'
import { t } from '@/i18n'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'
import { serverNow, useServerNow } from './serverTime'

/** The live event in effect for this player right now. */
export function currentLive(): LiveEvent | null {
  const { save, data } = useGame.getState()
  return save ? liveFor(save, data, serverNow()) : null
}

/** The live event for this player and the server time, re-read every `ms`. */
export function useLive(ms = 1000): { live: LiveEvent | null; now: number | null } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  return { live: save ? liveFor(save, data, now) : null, now }
}

/** Buys from the Special Shop; false (and a toast) when it can't. */
export function buyLive(key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const live = currentLive()
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
