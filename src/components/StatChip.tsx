import type { ReactNode } from 'react'
import { t } from '@/i18n'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'

/** Labels and hints are sheet keys: `statLabel` / `statHint` read them in the player's language. */
const STATS = {
  hp: { icon: 'heart' },
  speed: { icon: 'speed' },
  rerolls: { icon: 'reroll' },
  catch: { icon: 'ball' },
} satisfies Record<string, { icon: IconName }>

export const statLabel = (stat: StatKind) => t(`ui.stat.${stat}.label`)
export const statHint = (stat: StatKind) => t(`ui.stat.${stat}.hint`)

export type StatKind = keyof typeof STATS

/** A stat as a pixel icon + value. The name is in the tooltip and for screen readers. */
export function StatChip({
  stat,
  value,
  size = 16,
  className,
}: {
  stat: StatKind
  value: ReactNode
  size?: number
  className?: string
}) {
  const s = STATS[stat]
  return (
    <span className={cx('inline-flex items-center gap-1 tabular-nums', className)} title={statHint(stat)}>
      <PixelIcon name={s.icon} size={size} />
      <span className="sr-only">{statLabel(stat)}</span>
      {value}
    </span>
  )
}

export const STAT_INFO = STATS
