import type { ReactNode } from 'react'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'

const STATS = {
  hp: { icon: 'heart', label: 'HP', hint: 'HP: the damage it can take' },
  speed: { icon: 'speed', label: 'Speed', hint: 'Speed: the faster Pokémon acts first (ties go to you)' },
  rerolls: { icon: 'reroll', label: 'Rerolls', hint: 'Rerolls: how many times per battle it can reroll dice' },
  catch: { icon: 'ball', label: 'Catch value', hint: 'Catch value: the catch die plus a ball must reach this (1 = always)' },
} satisfies Record<string, { icon: IconName; label: string; hint: string }>

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
    <span className={cx('inline-flex items-center gap-1 tabular-nums', className)} title={s.hint}>
      <PixelIcon name={s.icon} size={size} />
      <span className="sr-only">{s.label}</span>
      {value}
    </span>
  )
}

export const STAT_INFO = STATS
