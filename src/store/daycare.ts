// The Day Care's clocks, run by the store (the engine takes the time and the dice): at app start, when the tab comes
// back, when the Day Care page opens, and from one timer set to the next check (docs/15).
import { createRng, dayCareOf, isDayCareOpen, nextCheckAt, processDayCare, randomSeed, type EggParent } from '@/engine'
import { t } from '@/i18n'
import { commitSave, pushToast, useGame } from './game'

let timer: ReturnType<typeof setTimeout> | undefined

/** "Eevee", or "Ditto (Noor)" for a friend's. */
export function parentName(p: EggParent): string {
  const name = useGame.getState().data.species[p.dex]?.name ?? t('ui.common.pokemon')
  return p.owner ? t('ui.dayCare.parentGuest', { name, owner: p.owner }) : name
}

/** Runs the checks that are due. True when one left an Egg. */
export function tickDayCare(now = Date.now()): boolean {
  const { save, data } = useGame.getState()
  if (!save) return false
  const res = processDayCare(save, data, now, createRng(randomSeed()))
  if (res.save !== save) commitSave(res.save)
  const parents = res.laid ? dayCareOf(res.save).egg?.parents : undefined
  if (parents)
    pushToast(t('ui.dayCare.eggLaidToast', { a: parentName(parents[0]), b: parentName(parents[1]) }), 'good', 4500)
  armDayCareTimer()
  return !!res.laid
}

/**
 * One timer, to the next check that could leave an Egg. None while an Egg waits (no check can leave another) or the
 * Day Care is closed: hatching and opening call `tickDayCare`, which sets it again.
 */
export function armDayCareTimer() {
  clearTimeout(timer)
  const { save, data } = useGame.getState()
  if (!save || !isDayCareOpen(save, data) || dayCareOf(save).egg) return
  const now = Date.now()
  // setTimeout keeps 32 bits: a far check is re-armed on the way (the visibility and minute checks run it too).
  const ms = Math.min(2 ** 31 - 1, Math.max(1000, nextCheckAt(save, data, now) - now + 500))
  timer = setTimeout(() => tickDayCare(), ms)
}
