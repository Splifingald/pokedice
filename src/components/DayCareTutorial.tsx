// The Day Care has opened (20 species caught, across every region): once, between fights, its rules in the special
// events' pop-up and a button straight to it. Later closes it for good, as the first visit does (saved, so it syncs).
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { dayCareTutorialDue } from '@/engine'
import { joinList, t } from '@/i18n'
import { takeDayCareNotice, visitDayCare } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { DayCareRulesModal } from './FeatureRules'

export function DayCareTutorial() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const due = useGame((s) => !!s.save && dayCareTutorialDue(s.save, s.data))
  // Only between fights, never on top of a battle, a catch, the results or the Game Corner.
  const idle = useGame((s) => s.run.phase === 'idle')
  if (!due) return null
  return (
    <DayCareRulesModal
      open={idle && pathname !== '/daycare'}
      onClose={visitDayCare}
      onGo={() => navigate('/daycare')}
    />
  )
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
