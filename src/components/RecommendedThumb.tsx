// The raid team's green thumb (docs/18 §3, `raidRecommended`): a Pokémon worth bringing to this raid. The engine
// decides; this only draws it, inline after a name or over a sprite's corner.
import { PixelIcon } from '@/components/icons'
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

export function RecommendedThumb({
  overlay = false,
  size = 14,
  className,
}: {
  /** Over the bottom-right corner of a sprite (its parent `relative`). */
  overlay?: boolean
  size?: number
  className?: string
}) {
  const { t } = useT()
  return (
    <PixelIcon
      name="thumbUp"
      size={size}
      title={t('ui.raid.recommended')}
      className={cx('shrink-0', overlay && 'absolute -bottom-0.5 -right-0.5', className)}
    />
  )
}
