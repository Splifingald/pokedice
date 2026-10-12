// A feature's rules in the special events' pop-up (docs/18): its picture as a banner, two to four rule rows (an icon, a
// short title, a line or two) and its buttons. Opened once when the feature unlocks (Later / Let's go!), and again
// from the INFO button at the bottom of its page (just OK). The Day Care and Versus use it (FeatureRules.tsx).
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

export interface RuleRow {
  /** A PixelIcon, or a small drawing of its own (the Day Care's Egg). */
  icon: IconName | ReactNode
  title: string
  text: string
}

/** The rule rows, as the events' unlock pop-up lists them. */
export function RuleList({ rules }: { rules: RuleRow[] }) {
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {rules.map((r) => (
        <li key={r.title} className="flex items-center gap-2.5">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
            {typeof r.icon === 'string' ? <PixelIcon name={r.icon as IconName} size={24} /> : r.icon}
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[19px] font-normal leading-none">{r.title}</b>
            <small className="font-pixel-sm text-[15px] text-muted">{r.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A feature's picture: a strip across the pop-up's top, cropped at `focus` (an object-position). */
export interface RulesPicture {
  src: string
  focus?: string
}

export function RulesModal({
  open,
  onClose,
  title,
  picture,
  icon,
  rules,
  onGo,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Its picture, or a banner drawn in code (the gifts' presents). */
  picture: RulesPicture | ReactElement
  /** The banner's tag icon; with `onGo` (the unlock), the tag says it's now open. */
  icon: IconName
  rules: RuleRow[]
  /** The unlock: Later and Let's go! (to the feature). Without it, the INFO copy: OK. */
  onGo?: () => void
}) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col gap-3">
        <div className="relative -mx-4 h-[124px] overflow-hidden bg-night shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]">
          {isValidElement(picture) ? (
            picture
          ) : (
            <img
              src={(picture as RulesPicture).src}
              alt=""
              className="pixelated absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: (picture as RulesPicture).focus ?? '50% 50%' }}
            />
          )}
          {onGo && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 bg-gold px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px] tracking-[0.08em] text-ink shadow-ring-line">
              <PixelIcon name={icon} size={16} />
              {t('ui.rules.nowOpen')}
            </span>
          )}
        </div>
        <RuleList rules={rules} />
        {onGo ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 pt-1">
            <PixelButton onClick={onClose}>{t('ui.events.later')}</PixelButton>
            <PixelButton variant="primary" onClick={onGo}>
              {t('ui.events.go')}
            </PixelButton>
          </div>
        ) : (
          // The INFO copy closes on OK, as the events' (EventInfo) does.
          <PixelButton variant="primary" onClick={onClose}>
            {t('ui.common.ok')}
          </PixelButton>
        )}
      </div>
    </Modal>
  )
}

/** The blue INFO button at the bottom of a feature's page (the events' EventInfo, the same words), opening its rules. */
export function InfoButton({ name, onClick, className }: { name: string; onClick: () => void; className?: string }) {
  const { t } = useT()
  return (
    <button type="button" className={cx('ev-info w-full', className)} onClick={onClick} aria-label={t('ui.events.infoLabel', { name })}>
      {t('ui.events.info')}
    </button>
  )
}
