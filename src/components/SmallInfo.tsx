import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

/**
 * A panel's INFO (docs/43 §5.5, §5.7): the same rules as the big blue INFO at the foot of an event's page, as a small,
 * quiet button at the foot of a panel — a rare action, out of the way. Same name for screen readers.
 */
export function SmallInfo({
  name,
  onClick,
  className,
}: {
  name: string
  onClick: () => void
  className?: string
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('ui.events.infoLabel', { name })}
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 bg-paper px-3 text-[18px] uppercase leading-none tracking-[0.04em] text-ink shadow-ring-line hover:shadow-ring md:min-h-[40px]',
        className,
      )}
    >
      <PixelIcon name="book" size={16} />
      {t('ui.events.info')}
    </button>
  )
}
