// Phones and tablets play upright (docs/15 §6). The installed app is held in portrait by its manifest; a browser tab
// can't be (iOS never lets a page lock the screen, Android only in full screen), so the game tries the lock and,
// whenever the device is still turned sideways, covers itself with a "turn your device" card (`RotateCover`).
import { useSyncExternalStore } from 'react'
import { platform } from './platform'

/**
 * The device is held sideways. The screen's own orientation, not the page's shape: an Android keyboard makes the
 * page wider than tall without anything turning. Old Safari (before iOS 16.4) has no `screen.orientation`; its
 * keyboard doesn't resize the page, so the page's shape is right there.
 */
function landscapeNow(): boolean {
  if (typeof window === 'undefined') return false
  const type = window.screen?.orientation?.type
  if (type) return type.startsWith('landscape')
  return window.matchMedia?.('(orientation: landscape)').matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const so = window.screen?.orientation
  const mq = window.matchMedia?.('(orientation: landscape)')
  so?.addEventListener('change', onChange)
  mq?.addEventListener('change', onChange)
  return () => {
    so?.removeEventListener('change', onChange)
    mq?.removeEventListener('change', onChange)
  }
}

/** A phone or a tablet turned sideways: the game waits behind the cover until it's upright again. */
export function useSideways(): boolean {
  const sideways = useSyncExternalStore(subscribe, landscapeNow, () => false)
  return sideways && platform().mobile
}

type Lockable = ScreenOrientation & { lock?: (o: 'portrait') => Promise<void> }

/**
 * Ask the browser to hold the screen in portrait. Allowed only in full screen or the installed app on Android, and
 * never on iOS: refusals are expected and silent (the cover does the rest). Again on entering full screen.
 */
export function lockPortrait() {
  if (typeof window === 'undefined' || !platform().mobile) return
  const tryLock = () => {
    const so = window.screen?.orientation as Lockable | undefined
    so?.lock?.('portrait')?.catch(() => {})
  }
  tryLock()
  document.addEventListener('fullscreenchange', tryLock)
}
