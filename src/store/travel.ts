// Travelling between areas from Home: the save's current area changes and the next CONTINUE plays there.
import { nightmareLock, type Area } from '@/engine'
import { t } from '@/i18n'
import { pushToast, useGame } from '@/store/game'
import { closeVictoryLeftOpen, enterArea } from '@/store/run'

/** Go to an area (from the Areas sheet, its details, a widget). False when it can't be entered right now. */
export function travelTo(area: Area): boolean {
  const { run, save, data } = useGame.getState()
  // Darkrai's nightmare (docs/30) holds the player in its area until they wake up: travel is the one thing it shuts.
  const held = nightmareLock(save, data)
  if (held && held.id !== area.id) {
    pushToast(t('ui.nightmare.locked', { area: held.name }), 'info')
    return false
  }
  // Mid-encounter, the run belongs to the area it started in; a won fight's card left open is over, so it closes.
  if (run.phase !== 'idle' && !closeVictoryLeftOpen()) {
    pushToast(t('ui.home.finishFirst'), 'info')
    return false
  }
  if (!enterArea(area.id)) return false
  pushToast(t('ui.home.nowExploring', { area: area.name }), 'good')
  return true
}
