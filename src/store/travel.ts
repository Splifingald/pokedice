// Travelling between areas from Home: the save's current area changes and the next CONTINUE plays there.
import type { Area } from '@/engine'
import { t } from '@/i18n'
import { pushToast, useGame } from '@/store/game'
import { enterArea } from '@/store/run'

/** Go to an area (from the Areas sheet, its details, a widget). False when it can't be entered right now. */
export function travelTo(area: Area): boolean {
  const { run } = useGame.getState()
  // Mid-encounter, the run belongs to the area it started in.
  if (run.phase !== 'idle') {
    pushToast(t('ui.home.finishFirst'), 'info')
    return false
  }
  if (!enterArea(area.id)) return false
  pushToast(t('ui.home.nowExploring', { area: area.name }), 'good')
  return true
}
