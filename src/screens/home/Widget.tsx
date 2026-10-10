import type { ReactNode } from 'react'
import { cx } from '@/theme/util'

/** A widget's frame: a framed panel, a small header row, and whatever it shows. */
export function Widget({
  title,
  tag,
  label,
  onClick,
  children,
  className,
}: {
  title: string
  tag?: ReactNode
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx('pixel-panel flex min-w-0 flex-col gap-[5px] px-2.5 pb-2.5 pt-2 text-left', className)}
    >
      <span className="flex w-full items-center gap-1.5 text-[19px] leading-none text-ink">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {tag}
      </span>
      {children}
    </button>
  )
}

/** Every widget's banner is this tall for 288 wide: the Day Care's yard strip. */
export const WIDGET_BANNER_H = 92

/** Every widget's banner: the Day Care's shape (288 × WIDGET_BANNER_H), whatever it shows, so the widgets line up. */
export function WidgetBanner({ children }: { children: ReactNode }) {
  return (
    <span
      className="relative block w-full overflow-hidden leading-[0] shadow-halo"
      style={{ aspectRatio: `288 / ${WIDGET_BANNER_H}` }}
    >
      {children}
    </span>
  )
}

/** Every state's header holds the same height, a tag or not: the widget never grows by the tag's few pixels. */
export const HeadTag = ({ children }: { children?: ReactNode }) => <span className="flex h-[19px] items-center">{children}</span>

/**
 * Under the banner, the same three rows in every state, so the widget never changes size: a line (the tags, or the
 * state in words), the gauge (or the room it takes), and the small print. Each is one line; the whole is in the label.
 */
export function WidgetRows({ top, meter, bottom }: { top: ReactNode; meter?: ReactNode; bottom: ReactNode }) {
  return (
    <span className="grid w-full grid-rows-[22px_6px_15px] gap-[5px]">
      <span className="flex min-w-0 items-center">{top}</span>
      <span>{meter}</span>
      <span className="truncate font-pixel-sm text-[15px] leading-none text-muted">{bottom}</span>
    </span>
  )
}

/** A thin progress meter: gold, green when full. */
export function Meter({ value, max }: { value: number; max: number }) {
  const k = max > 0 ? Math.min(1, value / max) : 0
  return (
    <span className="relative block h-1.5 w-full bg-line shadow-ring-line-thin" aria-hidden>
      <i
        className={cx('absolute inset-y-0 left-0 block', k >= 1 ? 'bg-hp-green' : 'bg-gold')}
        style={{ width: `${k * 100}%` }}
      />
    </span>
  )
}
