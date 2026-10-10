// The Day Care unlock tutorial: once enough species are in the Pokédex, Professor Oak sends the player there. The
// pop-up can't be dismissed — its only button goes to the Day Care, and the first visit ends it (saved, so it syncs).
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { dayCareTutorialDue } from '@/engine'
import { joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { takeDayCareNotice } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { EggSprite } from './EggSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'

export function DayCareTutorial() {
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const data = useGame((s) => s.data)
  const due = useGame((s) => !!s.save && dayCareTutorialDue(s.save, s.data))
  // Only between fights, never on top of a battle, a catch, the results or the Game Corner.
  const idle = useGame((s) => s.run.phase === 'idle')
  const open = due && idle && pathname !== '/daycare'
  return (
    <Modal open={open} dismissable={false} title={t('ui.tutorial.dayCareTitle')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={64} className="shrink-0" />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.tutorial.dayCareBody', { count: data.config.dayCare.unlockPokedex })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <EggSprite size={40} />
          <PixelButton variant="primary" size="lg" onClick={() => navigate('/daycare')}>
            {t('ui.tutorial.goToDayCare')}
          </PixelButton>
        </div>
      </div>
    </Modal>
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
