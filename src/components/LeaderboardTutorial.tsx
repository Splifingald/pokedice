// Prof. Oak's leaderboard tip: once the first badge is won, Home shows his note (docs/43 §7: a card in the page, no
// longer a pop-up), pointing to the leaderboard in Social. SEE THE LEADERBOARD opens it, and that first visit ends the
// tip; ✕ ends it for good too (`leaderboardVisited`, saved, so it syncs): a tip, not a choice the player must make.
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { visitLeaderboard } from '@/store/actions'
import { PixelIcon } from './icons'
import { NoticeCard, OakFace } from './NoticeCard'
import { PixelButton } from './PixelButton'

export function LeaderboardNotice() {
  const navigate = useNavigate()
  return <LeaderboardNoticeView onClose={visitLeaderboard} onGo={() => navigate('/leaderboard')} />
}

/** The note itself (the kitchen sink shows it without a save). */
export function LeaderboardNoticeView({ onClose, onGo }: { onClose: () => void; onGo: () => void }) {
  const { t } = useT()
  return (
    <NoticeCard
      tone="oak"
      picture={<OakFace />}
      title={t('ui.tutorial.boardTitle')}
      onClose={onClose}
      action={
        <PixelButton size="sm" onClick={onGo}>
          <PixelIcon name="trophy" size={18} className="shrink-0" />
          {t('ui.tutorial.seeBoard')}
        </PixelButton>
      }
    >
      <b className="font-normal">{t('ui.oak.prefix')}</b> {t('ui.home.boardLine')}
    </NoticeCard>
  )
}
