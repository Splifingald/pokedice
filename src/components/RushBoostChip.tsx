// Type Rush's factor in a hit's recap (docs/71 §3.4): its own file, so the battle screen imports it without the
// event's pop-up (its gifts' art draws on a canvas as it loads).
import type { PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { TypeBadge } from './TypeBadge'

/** Type Rush's factor in a hit's recap (docs/71 §3.4): the type's badge and ×1.2, named for screen readers. */
export function RushBoostChip({ type, n, className }: { type: PokeType; n: number; className?: string }) {
  const { t } = useT()
  const label = t('ui.rush.boostChip', { type: typeName(type), n })
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx('inline-flex shrink-0 items-center gap-0.5', className)}
    >
      <PixelIcon name="star" size={12} />
      <TypeBadge type={type} size="sm" />
      <span className="w-boost-x font-pixel-sm">×{n}</span>
    </span>
  )
}
