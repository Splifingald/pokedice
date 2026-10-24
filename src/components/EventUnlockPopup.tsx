// A special event has opened (docs/18): once, between fights, its picture as a banner, its 2–4 rules (with the admin's
// numbers) and a button straight to it. It takes its turn in the one-time pop-ups' queue (engine/popups.ts): after Prof.
// Oak's tutorials, the donation pop-up and a new region's offer (winning a League opens both that and the rebattle),
// never on the events' pages. Only the newest open event shows; the others count as seen with it.
import { useNavigate } from 'react-router-dom'
import { eventUnlockDue } from '@/engine'
import { useT } from '@/i18n/react'
import { markEventsSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { EventPicture, EventRules, EVENT_ICON } from '@/screens/events/shared'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'

export function EventUnlockPopup() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const due = useGame((s) => (s.save ? eventUnlockDue(s.save, s.data) : null))
  const open = useMyTurn('event') && !!due
  useOnScreen('event', open)
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 pt-1">
          <PixelButton onClick={markEventsSeen}>{t('ui.events.later')}</PixelButton>
          <PixelButton variant="primary" onClick={go}>
            {t('ui.events.go')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
