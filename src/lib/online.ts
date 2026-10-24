// Whether the device has a connection at all (`navigator.onLine`). The social screens (Friends, Trades, the
// leaderboard, Versus, the messages, signing in and the cloud sync) say "You're offline" when it hasn't, rather than a
// "try again later" that can't help (docs/15 §11). `onLine` false is sure; true only means a network is there.
import { useSyncExternalStore } from 'react'
import { t } from '@/i18n'

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** The device has a connection; re-renders when it goes or comes back. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isOffline(),
    () => true,
  )
}

/** A failure said in words: "You're offline" when the device has no connection (nothing else could have answered). */
export const offlineOr = (text: string): string => (isOffline() ? t('ui.common.offline') : text)
