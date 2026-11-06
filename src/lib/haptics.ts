// Haptics (docs/38): short vibrations on dice, hits and catches. One call per moment, `haptic(cue)`, from anywhere.
// They play unless the player has turned them off in Settings, the device isn't asking for less motion, and the browser can vibrate: Android's Chrome can, iOS Safari can't, and
// Chrome ignores a vibration before the player's first tap.
//
// iOS gets one thing instead (`useSwitchHaptics`): Safari plays the system's haptic when a native switch
// (`<input type="checkbox" switch>`, Safari 17.4+, felt from iOS 18) is toggled by a real tap, so a primary button
// lays an invisible one over itself (PixelButton's `HapticSwitch`) and the tap goes through it. Only a real tap counts:
// toggling it from code stopped working in iOS 26.5, so dice, hits and catches stay silent on an iPhone.
import { useGame } from '@/store/game'
import type { Settings } from '@/save/storage'

/** Each moment's pattern, in ms (vibrate, pause, vibrate…): one meaning per pattern, stronger for bigger moments. */
export const HAPTICS = {
  tap: 6,
  diePick: 8,
  diceLand: 12,
  hit1: 20,
  hit2: 30,
  hit3: 45,
  ko: [30, 40, 60],
  wobble: 10,
  catch: [20, 40, 20],
  reward: [10, 30, 10],
} satisfies Record<string, number | number[]>

export type HapticCue = keyof typeof HAPTICS

const calmDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The player's setting and the game's own "no animations": what every haptic needs, whatever the device. */
const allowed = (settings: Settings) => settings.haptics !== false && !settings.reducedMotion

/** The browser can vibrate (Android's Chrome; a desktop's says it can and does nothing). */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

/**
 * An iPhone or iPad whose Safari has the native switch. iPadOS says it's a Mac: a Mac with a touch screen is one.
 * The switch is feature-detected (its `switch` property), never assumed from the version.
 */
export const IOS_SWITCH =
  typeof navigator !== 'undefined' &&
  typeof HTMLInputElement !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  'switch' in HTMLInputElement.prototype

/** Whether a haptic would play now: the switch, the player's setting, a calm device, a browser that can vibrate. */
export function hapticsReady(): boolean {
  return allowed(useGame.getState().settings) && !calmDevice() && canVibrate()
}

export function haptic(cue: HapticCue) {
  if (!hapticsReady()) return
  try {
    navigator.vibrate(HAPTICS[cue])
  } catch {
    /* haptics are best-effort */
  }
}

/**
 * iOS: whether this button should wear the invisible switch that gives the system haptic (`wanted`: a primary
 * button). Off everywhere else, so no other device ever gets the extra element.
 */
export function useSwitchHaptics(wanted: boolean): boolean {
  const on = useGame((s) => wanted && IOS_SWITCH && allowed(s.settings))
  return on && !calmDevice()
}

/** Whether Settings should offer the Vibration switch: this device can feel something. */
export function hapticsOffered(): boolean {
  return IOS_SWITCH || canVibrate()
}
