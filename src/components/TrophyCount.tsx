// A Versus league trophy count (docs/44): the number and the pixel trophy, the words for screen readers. The league's
// rows and offers use it, and so does the trainer card's best (§10), a friend's too.
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'

/** A trophy count with its icon (the words for screen readers). */
export function TrophyCount({
  n,
  size = 16,
  inherit = false,
}: {
  n: number
  size?: number
  /** In the font of the line around it (the trainer card's values), not the boards' smaller one for numbers. */
  inherit?: boolean
}) {
  const { t } = useT()
  return (
    <span
      className={cx('inline-flex items-center gap-1 leading-none tabular-nums', !inherit && 'font-pixel-sm')}
      style={{ fontSize: size + 4 }}
      aria-label={t('ui.league.trophiesLabel', { n })}
    >
      {n}
      <PixelIcon name="trophy" size={size} />
    </span>
  )
}
