// Prof. Oak's leaderboard tutorial: the first time the player is in the game (between fights), he points them to the
// trophy button. The pop-up's only button opens the leaderboard, and that first visit ends it (saved, so it syncs).
import { useLocation, useNavigate } from 'react-router-dom'
import { leaderboardTutorialDue } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

export function LeaderboardTutorial() {
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The Day Care tutorial goes first when both are due.
  const due = useGame((s) => !!s.save && leaderboardTutorialDue(s.save, s.data))
  const idle = useGame((s) => s.run.phase === 'idle')
  const open = due && idle && pathname !== '/leaderboard'
  return (
    <Modal open={open} dismissable={false} title={t('ui.tutorial.boardTitle')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <img
            src="/characters/prof-oak.png"
            alt={t('ui.newGame.oak')}
            width={64}
            height={64}
            className="shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.tutorial.boardBody')}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <PixelIcon name="trophy" size={36} />
          <PixelButton variant="primary" size="lg" onClick={() => navigate('/leaderboard')}>
            {t('ui.tutorial.seeBoard')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
