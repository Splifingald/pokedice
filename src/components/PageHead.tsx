import type { ReactNode } from 'react'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { useCountUp } from './GoldPill'
import { PixelIcon, type IconName } from './icons'

/** Your gold as a navy plate, for screens where spending is the point (Poké Mart, Upgrades). */
export function Wallet() {
  const { t } = useT()
  const gold = useGame((s) => s.save?.gold ?? 0)
  // Counts up or down to the new amount after a purchase, like the top bar's gold.
  const shown = useCountUp(gold)
  return (
    <span
      role="img"
      className="inline-flex shrink-0 items-center gap-1.5 bg-ink px-2.5 pb-[5px] pt-[3px] text-[20px] leading-none text-gold-light"
      aria-label={t('ui.mon.pokedollars', { amount: gold })}
    >
      <PixelIcon name="coin" size={16} />
      <span className="tabular-nums">{money(shown)}</span>
    </span>
  )
}

/**
 * A tab's title row: its tab-bar icon, the screen's one <h1>, an optional count ("3/3", "81/151") and, at the far
 * end, whatever the screen needs there (a wallet, a hint button).
 */
export function PageHead({
  icon,
  title,
  count,
  children,
  as: Heading = 'h1',
}: {
  icon: IconName
  title: ReactNode
  count?: ReactNode
  children?: ReactNode
  /** h2 where the page already has its title (the kitchen sink). */
  as?: 'h1' | 'h2'
}) {
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-x-2.5 gap-y-1">
      <PixelIcon name={icon} size={32} className="-mr-0.5 shrink-0" />
      <Heading className="text-[32px] leading-none">{title}</Heading>
      {count != null && <span className="font-pixel-sm text-[17px] text-muted">{count}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
