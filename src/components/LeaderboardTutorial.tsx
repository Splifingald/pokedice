// Prof. Oak's leaderboard tutorial: once the first badge is won, between fights, he points the player to the trophy
// button. SEE THE LEADERBOARD opens it, and that first visit ends the tutorial; Later and ✕ end it for good too, as the
// Day Care's Later does (saved, so it syncs): a tip, not a choice the player must make.
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { visitLeaderboard } from '@/store/actions'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'
import { useMyTurn, useOnScreen } from './popupTurn'

export function LeaderboardTutorial() {
  const navigate = useNavigate()
  // Its turn in the one-time pop-ups' queue: after the Day Care's, never on the leaderboard itself.
  const open = useMyTurn('leaderboard')
  useOnScreen('leaderboard', open)
  // Gone the moment its turn ends, as before the queue: its button leads to another page, which a fading pop-up
  // would cover.
  if (!open) return null
  return <LeaderboardTipModal open={open} onClose={visitLeaderboard} onGo={() => navigate('/leaderboard')} />
}

/** The tip itself: Prof. Oak's words, Later and SEE THE LEADERBOARD (the kitchen sink shows it without the queue). */
export function LeaderboardTipModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo: () => void
}) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('ui.tutorial.boardTitle')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TrainerSprite
            src="/characters/prof-oak.png"
            alt={t('ui.newGame.oak')}
            size={64}
            className="shrink-0"
          />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.tutorial.boardBody')}
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-2.5">
          <PixelButton onClick={onClose}>{t('ui.events.later')}</PixelButton>
          <PixelButton variant="primary" onClick={onGo}>
            <PixelIcon name="trophy" size={20} className="shrink-0" />
            {t('ui.tutorial.seeBoard')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
