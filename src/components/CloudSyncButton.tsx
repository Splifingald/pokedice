import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { SYNC_COOLDOWN_MS, syncBlockedBy, syncNow, useCloudSync } from '@/store/sync'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

/** "3 min ago" from a timestamp. */
function useAgo(): (at: number, now: number) => string {
  const { t } = useT()
  return (at, now) => {
    const min = Math.floor((now - at) / 60_000)
    if (min < 1) return t('ui.sync.justNow')
    if (min < 60) return t('ui.sync.minAgo', { n: min })
    if (min < 24 * 60) return t('ui.sync.hAgo', { n: Math.floor(min / 60) })
    return t('ui.sync.dAgo', { n: Math.floor(min / (24 * 60)) })
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * SYNC ONLINE, for players signed in with Google: when the save last matched the cloud, and a button to sync now. It
 * rests for 5 minutes after any successful sync (automatic ones included). In the desktop side bar, and in the avatar's
 * drawer for phones, which have no side bar.
 */
export function CloudSyncButton() {
  const { t } = useT()
  const ago = useAgo()
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  // Re-render on everything the block depends on, and every second for the countdown.
  useGame((s) => s.run.phase)
  useGame((s) => s.syncConflict)
  const { lastAt, busy } = useCloudSync()
  const now = useNow(1000)
  if (!signedIn) return null

  const blocked = syncBlockedBy(now)
  const status = busy
    ? t('ui.sync.syncing')
    : blocked === 'cooldown' && lastAt != null
      ? t('ui.sync.again', { time: mmss(lastAt + SYNC_COOLDOWN_MS - now) })
      : null
  const last = lastAt == null ? t('ui.sync.never') : t('ui.sync.last', { when: ago(lastAt, now) })
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={!!blocked}
      aria-busy={busy || undefined}
      title={blocked === 'fight' ? t('ui.nav.finishFight') : undefined}
      className={cx(
        'pixel-btn flex min-h-[44px] w-full items-center gap-3 bg-panel px-3 py-2 text-left',
        blocked && 'hatched cursor-not-allowed',
      )}
    >
      <PixelIcon name="cloud" size={20} className={cx(busy && 'animate-pulse')} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-2xl leading-none">{t('ui.sync.button')}</span>
        <span className="font-pixel-sm truncate text-sm leading-none text-muted">{last}</span>
        {status && <span className="font-pixel-sm truncate text-sm leading-none text-muted">{status}</span>}
      </span>
    </button>
  )
}
