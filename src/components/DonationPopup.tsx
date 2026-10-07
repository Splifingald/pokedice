// "Keep the game alive": Prof. Oak asks for help with the hosting costs, once per region when its 5th badge is won
// (engine/donation). Admin → Config switches it on, sets the PayPal link and can show it to everyone once more.
// Between fights only, and after Prof. Oak's tutorials and the developer's answers; the share prompt waits for it.
// Settings → HELP POKÉDICE opens the same pop-up whenever it is switched on.
import { donationDue, donationEnabled, donationUrl, tutorialPending } from '@/engine'
import { useT } from '@/i18n/react'
import { unseenReplies, useInbox } from '@/lib/feedback'
import { closeDonation } from '@/store/actions'
import { useGame } from '@/store/game'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

export function DonationPopup() {
  const due = useGame((s) => !!s.save && donationDue(s.save, s.data) && !tutorialPending(s.save, s.data))
  const idle = useGame((s) => s.run.phase === 'idle')
  const replies = useInbox((s) => (s.messages ? unseenReplies(s.messages).length : 0))
  return <DonationModal open={due && idle && !replies} onClose={() => undefined} />
}

/** The pop-up itself. Closing it, either way, also counts as this region's showing. */
export function DonationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const url = useGame((s) => donationUrl(s.data))
  const enabled = useGame((s) => donationEnabled(s.data))

  const close = () => {
    closeDonation()
    onClose()
  }
  const donate = () => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    close()
  }

  return (
    <Modal open={open && enabled} onClose={close} title={t('ui.donate.title')}>
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
            <b>{t('ui.oak.prefix')}</b> {t('ui.donate.body')}
          </p>
        </div>
        <PixelButton variant="primary" size="lg" className="w-full" onClick={donate}>
          {t('ui.donate.button')}
        </PixelButton>
        <div className="flex justify-end">
          <PixelButton size="sm" onClick={close}>
            {t('ui.donate.later')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
