// The developer answered: when the player opens the game (or signs in), answers they haven't seen yet pop up, between
// fights and after Prof. Oak's tutorials. Closing it marks them seen; they stay in Contact the developer → My messages.
import { useEffect } from 'react'
import { dayCareTutorialDue, leaderboardTutorialDue } from '@/engine'
import { useT } from '@/i18n/react'
import { unseenReplies, useInbox } from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { ReplyBox } from './ContactModal'

export function ReplyPopup() {
  const { t } = useT()
  const status = useGame((s) => s.auth.status)
  const userId = useGame((s) => s.auth.userId)
  const messages = useInbox((s) => s.messages)
  const load = useInbox((s) => s.load)
  const markSeen = useInbox((s) => s.markSeen)
  const idle = useGame((s) => s.run.phase === 'idle')
  const tutorial = useGame(
    (s) => !!s.save && (dayCareTutorialDue(s.save, s.data) || leaderboardTutorialDue(s.save, s.data)),
  )

  // Once we know who is playing, and again whenever that changes (signing in brings the account's messages).
  useEffect(() => {
    if (isSupabaseConfigured && status !== 'unknown') void load()
  }, [status, userId, load])

  const unseen = messages ? unseenReplies(messages) : []
  const open = unseen.length > 0 && idle && !tutorial
  const close = () => markSeen(unseen.map((m) => m.id))

  return (
    <Modal open={open} onClose={close} title={t('ui.contact.replyTitle')}>
      <div className="flex flex-col gap-3">
        <p className="text-xl leading-snug">{t('ui.contact.replyIntro')}</p>
        <ul className="flex flex-col gap-3">
          {unseen.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              <p className="break-words text-xl leading-tight">{m.title}</p>
              <ReplyBox reply={m.reply!} at={m.replied_at} />
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <PixelButton variant="primary" onClick={close}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
