// The Day Care has opened (20 species caught, across every region): once, between fights, its rules in the special
// events' pop-up and a button straight to it. Later closes it for good, as the first visit does (saved, so it syncs).
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { joinList, t } from '@/i18n'
import { takeDayCareNotice, visitDayCare } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { DayCareRulesModal } from './FeatureRules'
import { useMyTurn, useOnScreen } from './popupTurn'

export function DayCareTutorial() {
  const navigate = useNavigate()
  // Its turn in the one-time pop-ups' queue (engine/popups.ts): first of Prof. Oak's, between fights, never on the Day
  // Care's own page.
  const open = useMyTurn('dayCare')
  useOnScreen('dayCare', open)
  // Gone the moment its turn ends, as before the queue: its button leads to another page, which a fading pop-up
  // would cover.
  if (!open) return null
  return <DayCareRulesModal open={open} onClose={visitDayCare} onGo={() => navigate('/daycare')} />
}

/**
 * The Day Care sent residents home (the Day Cares became one and it had more than its slots): one toast on the next
 * screen, then the notice is gone.
 */
export function DayCareNotice() {
  const pending = useGame((s) => !!s.save?.dayCareNotice)
  const data = useGame((s) => s.data)
  useEffect(() => {
    if (!pending) return
    const dex = takeDayCareNotice()
    if (!dex.length) return
    const names = joinList(dex.map((d) => data.species[d]?.name ?? `#${d}`))
    pushToast(t('ui.dayCare.roomFor', { slots: data.config.dayCare.slots, names }), 'info', 6000)
  }, [pending, data])
  return null
}
