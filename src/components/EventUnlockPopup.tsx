// A special event has opened (docs/18): once, between fights, its picture as a banner, its 2–4 rules (with the admin's
// numbers) and a button straight to it. It waits for Prof. Oak's tutorials and the donation pop-up. Only the newest
// open event shows; the others count as seen with it.
import { useLocation, useNavigate } from 'react-router-dom'
import { dayCareTutorialDue, donationDue, eventUnlockDue, leaderboardTutorialDue } from '@/engine'
import { useT } from '@/i18n/react'
import { markEventsSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { EventPicture, EventRules, EVENT_ICON } from '@/screens/events/shared'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

export function EventUnlockPopup() {
  const { t } = useT()
  const navigate = useNavigate()
  const onEvents = useLocation().pathname.startsWith('/events')
  const data = useGame((s) => s.data)
  const due = useGame((s) =>
    s.save && !dayCareTutorialDue(s.save, s.data) && !leaderboardTutorialDue(s.save, s.data) && !donationDue(s.save, s.data)
      ? eventUnlockDue(s.save, s.data)
      : null,
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  const open = !!due && idle && !onEvents
  if (!due) return null
  const name = t(`ui.events.${due}.name`)
  const go = () => {
    markEventsSeen()
    navigate(`/events/${due}`)
  }
  return (
    <Modal open={open} onClose={markEventsSeen} title={name} className="max-w-md">
      <div className="flex flex-col gap-3">
        <EventPicture id={due} data={data} className="-mx-4 h-[124px] shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]">
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 bg-gold px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px] tracking-[0.08em] text-ink shadow-ring-line">
            <PixelIcon name={EVENT_ICON[due]} size={16} />
            {t('ui.events.newEvent')}
          </span>
        </EventPicture>
        <EventRules id={due} data={data} />
        <div className="grid grid-cols-[1fr_1.5fr] gap-2.5 pt-1">
          <PixelButton onClick={markEventsSeen}>{t('ui.events.later')}</PixelButton>
          <PixelButton variant="primary" onClick={go}>
            {t('ui.events.go')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
