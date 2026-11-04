// Full screen (docs/66): the browser's own, the page over the whole screen (no address bar or tabs; on a phone, no
// status or navigation bar). Not the game's full-screen moments (lib/fullscreen.ts), which only move its own bars.
//
// The player's choice is this device's (a phone and a computer differ), kept in this browser and not in the save.
// Never chosen, a phone's installed app asks for it and anything else doesn't. A browser lets a page go full screen
// only inside a tap or a key, so the game asks on the player's next one, and again after the browser let it go
// without the player (a phone sent to the background drops it). An iPhone has no full screen for a page (an iPad
// has): the switch isn't offered there, and its installed app already has no browser bars.
import { useSyncExternalStore } from 'react'
import { platform, type Platform } from './platform'

export const FULL_SCREEN_KEY = 'pokedice.fullscreen'

export type FullScreenChoice = 'on' | 'off'

/** Whether the game wants full screen: the player's choice on this device, else on in a phone's installed app. */
export const wantsFullScreen = (
  choice: FullScreenChoice | null,
  p: Pick<Platform, 'mobile' | 'standalone'>,
): boolean => (choice ? choice === 'on' : p.mobile && p.standalone)

/**
 * The browser left full screen without the game asking. A computer's player pressed Esc: they chose to leave, and the
 * switch follows (asking again on the next click would trap them). A phone lets it go on its own (the app sent to the
 * background, the back gesture): the wish stays and the next tap brings it back; Settings turns it off.
 */
export const leftByChoice = (p: Pick<Platform, 'mobile'>): boolean => !p.mobile

type Doc = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
type El = HTMLElement & { webkitRequestFullscreen?: () => void }

const doc = (): Doc | null => (typeof document === 'undefined' ? null : (document as Doc))

/** This browser can put a page in full screen (not an iPhone, not an embedded frame that isn't allowed to). */
export function fullScreenSupported(): boolean {
  const d = doc()
  return !!d && (d.fullscreenEnabled === true || d.webkitFullscreenEnabled === true)
}

export function isFullScreen(): boolean {
  const d = doc()
  return !!d && !!(d.fullscreenElement ?? d.webkitFullscreenElement)
}

function readChoice(): FullScreenChoice | null {
  try {
    const v = localStorage.getItem(FULL_SCREEN_KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}

let choice: FullScreenChoice | null = readChoice()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Whether this device wants full screen now. */
export const fullScreenWanted = (): boolean => wantsFullScreen(choice, platform())

/** Ours: the exit the game asked for, so `fullscreenchange` doesn't read it as the player's. */
let leaving = false

function enter() {
  const el = doc()?.documentElement as El | undefined
  if (!el || isFullScreen()) return
  // Refusals (no tap behind the call, a browser that says no) are expected and silent: the next tap asks again.
  if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  else el.webkitRequestFullscreen?.()
}

function leave() {
  const d = doc()
  if (!d || !isFullScreen()) return
  leaving = true
  if (d.exitFullscreen) d.exitFullscreen().catch(() => {})
  else d.webkitExitFullscreen?.()
}

/** The player's choice, from Settings' switch (a tap, so the browser lets the page go full screen right away). */
export function setFullScreen(on: boolean) {
  choice = on ? 'on' : 'off'
  try {
    localStorage.setItem(FULL_SCREEN_KEY, choice)
  } catch {
    /* storage blocked: the choice holds until the page closes */
  }
  if (on) enter()
  else leave()
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The switch's state: what the player wants on this device (the browser may be out of it until the next tap). */
export function useFullScreenChoice(): boolean {
  return useSyncExternalStore(subscribe, fullScreenWanted, () => false)
}

/**
 * Keeps the page in full screen while the game wants it (`open`: the admin's switch is on for this player). Returns
 * the clean-up; with `open` false it leaves full screen if the game had asked for it.
 */
export function keepFullScreen(open: boolean): () => void {
  const d = doc()
  if (!d || !fullScreenSupported()) return () => {}
  if (!open) {
    leave()
    return () => {}
  }
  // A tap or a key (not Esc, which leaves): the moment the browser allows it.
  const onGesture = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') return
    if (fullScreenWanted() && d.visibilityState === 'visible') enter()
  }
  const onChange = () => {
    // In while no longer wanted: a tap asked for it just before that tap turned the switch off.
    if (isFullScreen()) return fullScreenWanted() ? undefined : leave()
    if (leaving) leaving = false
    else if (fullScreenWanted() && leftByChoice(platform())) setFullScreen(false)
  }
  d.addEventListener('pointerup', onGesture, true)
  d.addEventListener('keydown', onGesture, true)
  d.addEventListener('fullscreenchange', onChange)
  d.addEventListener('webkitfullscreenchange', onChange)
  return () => {
    d.removeEventListener('pointerup', onGesture, true)
    d.removeEventListener('keydown', onGesture, true)
    d.removeEventListener('fullscreenchange', onChange)
    d.removeEventListener('webkitfullscreenchange', onChange)
  }
}
