import type { ReactNode } from 'react'
import type { StatusKind } from '@/engine'
import { useT } from '@/i18n/react'
import { STATUS_COLORS } from '@/theme/colors'
import { cx } from '@/theme/util'
import { PixelIcon, STATUS_ICON } from './icons'

/**
 * A small label. Tones: plain (white, ink ring), gold (new, lead, combo), green (ready), done (cleared), red (where you
 * are), blue (open), lock (not yet). Text on red uses the deeper red: white on the bright accent is too faint under 24px.
 */
export type ChipTone = 'plain' | 'gold' | 'green' | 'done' | 'red' | 'blue' | 'lock' | 'dark'

const TONE: Record<ChipTone, string> = {
  plain: 'bg-paper text-ink shadow-ring',
  gold: 'bg-gold text-ink shadow-ring',
  green: 'bg-hp-green text-[#0f2e1d] shadow-ring',
  done: 'bg-good-pale text-good shadow-[inset_0_0_0_2px_#34c97a]',
  red: 'bg-crimson text-white',
  blue: 'bg-sky text-ink shadow-[inset_0_0_0_2px_#5b8def]',
  lock: 'bg-well-deep text-ink',
  dark: 'light-scope bg-night text-gold-light',
}

export function Chip({
  tone = 'plain',
  children,
  className,
  title,
}: {
  tone?: ChipTone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'pixel-corners inline-flex items-center gap-1 whitespace-nowrap px-1.5 pb-[3px] pt-[2px] font-pixel-sm text-[14px] leading-none',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** NEW on something you haven't seen yet. */
export function NewTag({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <Chip tone="gold" className={cx('tracking-[0.04em]', className)}>
      {t('ui.common.new')}
    </Chip>
  )
}

/** "Lv.36": Jersey 15, muted. */
export function LevelTag({ level, className }: { level: number; className?: string }) {
  const { t } = useT()
  return (
    <span className={cx('whitespace-nowrap font-pixel-sm text-[16px] leading-none text-muted', className)}>
      {t('ui.common.level.short', { n: level })}
    </span>
  )
}

/**
 * A status as words and colour, never colour alone: its icon, its short name (BRN, PAR…) and an optional counter
 * ("1/2" toward its threshold, turns left). `lit`: the status will land (the threshold is met).
 */
export function StatusChip({
  status,
  count,
  lit = true,
  className,
}: {
  status: StatusKind
  count?: string
  lit?: boolean
  className?: string
}) {
  const { t } = useT()
  const color = STATUS_COLORS[status]
  return (
    <span
      title={t(`ui.status.${status}.name`)}
      className={cx(
        'pixel-corners inline-flex items-center gap-1 whitespace-nowrap px-1.5 pb-[3px] pt-[2px] font-pixel-sm text-[14px] leading-none text-ink',
        lit ? 'bg-paper' : 'bg-panel text-muted',
        className,
      )}
      style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
    >
      <PixelIcon name={STATUS_ICON[status] ?? 'star'} size={12} />
      {t(`ui.status.${status}.short`)}
      {count && <span className="tabular-nums">{count}</span>}
    </span>
  )
}
