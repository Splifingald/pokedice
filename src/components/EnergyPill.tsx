import { useState } from 'react'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { useGame } from '@/store/game'
import { useEnergy } from '@/store/hooks'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'

/** Top bar: energy left (hidden when the admin turned energy off). Tap for the refill times and the rules. */
export function EnergyPill() {
  const { t } = useT()
  const energy = useEnergy()
  const minutes = useGame((s) => s.data.config.energy.minutesPerEnergy)
  const [open, setOpen] = useState(false)
  if (!energy) return null
  const { value, max, nextAt, now } = energy
  const next = nextAt == null ? null : countdown(nextAt - now)
  const full = nextAt == null ? null : countdown(nextAt - now + (max - value - 1) * minutes * 60_000)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] shrink-0 items-center md:min-h-[36px]"
        aria-label={t('ui.energy.label', {
          value,
          max,
          rest: next ? t('ui.energy.nextIn', { time: next }) : t('ui.energy.isFull'),
        })}
        title={next ? t('ui.energy.nextTitle', { time: next }) : t('ui.energy.fullTitle')}
      >
        <span
          className={cx('inline-flex items-center gap-1 border-2 border-ink bg-ink px-2 py-0.5', value > 0 ? 'text-gold' : 'text-danger-light')}
          style={{ borderRadius: 2 }}
        >
          <PixelIcon name="energy" size={14} />
          <span className="font-mono text-sm tabular-nums leading-none">
            {value}/{max}
          </span>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('ui.energy.title')}>
        <div className="flex flex-col gap-3">
          <p className="text-3xl">
            {value} / {max}
          </p>
          <p className="copy">{next ? t('ui.energy.nextAndFull', { next, full: full ?? '' }) : t('ui.energy.full')}</p>
          <p className="copy text-muted">{t('ui.energy.rules', { minutes })}</p>
        </div>
      </Modal>
    </>
  )
}
