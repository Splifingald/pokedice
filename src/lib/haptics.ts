// Haptics (docs/38): short vibrations on dice, hits and catches. One call per moment, `haptic(cue)`, from anywhere.
// They play only where the admin has switched them on (`hapticsOn`), the player hasn't turned them off in Settings,
// the device isn't asking for less motion, and the browser can vibrate: Android's Chrome can, iOS Safari can't, and
// Chrome ignores a vibration before the player's first tap.
import { hapticsOn } from '@/engine'
import { useGame } from '@/store/game'

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

/** Whether a haptic would play now: the switch, the player's setting, a calm device, a browser that can vibrate. */
export function hapticsReady(): boolean {
  const { data, settings } = useGame.getState()
  if (!data || !hapticsOn(data) || settings.haptics === false || settings.reducedMotion || calmDevice()) return false
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function haptic(cue: HapticCue) {
  if (!hapticsReady()) return
  try {
    navigator.vibrate(HAPTICS[cue])
  } catch {
    /* haptics are best-effort */
  }
}
