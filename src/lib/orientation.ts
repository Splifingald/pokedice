// Phones play upright (docs/15 §6). The installed app is held in portrait by its manifest; a browser tab can't be (iOS
// never lets a page lock the screen, Android only in full screen), so the game tries the lock and, whenever a phone is
// still turned sideways, covers itself with a "turn your device" card (`RotateCover`). A tablet turned sideways has
// the room of a small computer: it plays on, in the wide layout (side nav from 768 px, columns from 1024 px). The
// manifest can't tell a tablet from a phone, so it keeps its portrait lock for phones' sake: an Android tablet with the
// game installed stays upright, as before (iOS doesn't read the manifest's orientation).
import { useSyncExternalStore } from 'react'
import { platform } from './platform'

/**
 * A tablet's screen is at least this wide on its short side, in CSS px (Android's own line between phones and
 * tablets, `sw600dp`). The biggest phones stay under it (an iPhone Pro Max is 430), the smallest tablets reach it (an
 * iPad mini is 744, a 7" Android tablet 600).
 */
export const TABLET_SHORT_SIDE = 600

/** A tablet rather than a phone, from the screen's size: its short side, whichever way it is held. */
export const isTabletScreen = (s: { width: number; height: number }): boolean =>
  Math.min(s.width, s.height) >= TABLET_SHORT_SIDE

/** Whether the "turn your device" card covers the game: a phone (not a tablet, not a computer) held sideways. */
export const coversSideways = (d: { landscape: boolean; mobile: boolean; tablet: boolean }): boolean =>
  d.landscape && d.mobile && !d.tablet

function tabletNow(): boolean {
  const s = typeof window === 'undefined' ? undefined : window.screen
  return !!s && isTabletScreen(s)
}

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

/** A phone turned sideways: the game waits behind the cover until it's upright again. Tablets play on. */
export function useSideways(): boolean {
  const landscape = useSyncExternalStore(subscribe, landscapeNow, () => false)
  return coversSideways({ landscape, mobile: platform().mobile, tablet: tabletNow() })
}

type Lockable = ScreenOrientation & { lock?: (o: 'portrait') => Promise<void> }

/**
 * Ask the browser to hold a phone's screen in portrait. Allowed only in full screen or the installed app on Android,
 * and never on iOS: refusals are expected and silent (the cover does the rest). Again on entering full screen. A
 * tablet is left free to turn.
 */
export function lockPortrait() {
  if (typeof window === 'undefined' || !platform().mobile || tabletNow()) return
  const tryLock = () => {
    const so = window.screen?.orientation as Lockable | undefined
    so?.lock?.('portrait')?.catch(() => {})
  }
  tryLock()
  document.addEventListener('fullscreenchange', tryLock)
}
