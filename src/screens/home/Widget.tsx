import type { ReactNode } from 'react'
import { cx } from '@/theme/util'

/** A card's picture is cut from its scene this tall (288 wide): about the card's own shape, so nothing is squashed. */
export const CARD_STRIP_H = 150

/**
 * Home's one card (docs/43 §4, "an area"): everything open on Home — an event, a secret area, the Day Care, Versus, a
 * small world — is the same row: its picture as a strip on the left, its name, one status line, and a thin gauge where
 * time or progress runs. One size for all, so the sections read as a list rather than a wall of squares.
 */
export function HomeCard({
  picture,
  name,
  status,
  tag,
  meter,
  label,
  onClick,
  tone,
  className,
  testId,
}: {
  /** The strip: fills its box (an `AreaStrip`, an <img>, sprites on a ground). */
  picture: ReactNode
  name: ReactNode
  /** One line: where it stands. */
  status: ReactNode
  /** A tag after the name: NEW, LIVE, Egg!… */
  tag?: ReactNode
  /** A thin gauge under the status (time left, progress). */
  meter?: ReactNode
  /** Everything said, for screen readers (the card is one button). */
  label: string
  onClick: () => void
  /** `gold`: one new thing to open (an Egg waiting, a ticket to spend). */
  tone?: 'gold'
  className?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={cx(
        'pixel-panel grid min-h-[76px] w-full min-w-0 grid-cols-[minmax(96px,34%)_minmax(0,1fr)] items-stretch gap-3 p-1.5 pr-3 text-left',
        tone === 'gold' && 'panel-gold',
        className,
      )}
    >
      <span className="relative block min-h-[60px] overflow-hidden bg-night leading-[0] shadow-ring-thin">
        {picture}
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-1 py-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[20px] leading-none text-ink">{name}</span>
          {tag}
        </span>
        <span className="truncate font-pixel-sm text-[16px] leading-tight text-muted">{status}</span>
        {meter}
      </span>
    </button>
  )
}

/**
 * The older frame's API (a title, a banner, three rows), kept for the squares other screens still build with it (a
 * world's mythical): it draws Home's one card now, its banner as the picture and the rows as the status.
 */
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
      className={cx(
        'pixel-panel grid min-h-[76px] w-full min-w-0 grid-cols-[minmax(96px,34%)_minmax(0,1fr)] items-stretch gap-x-3 p-1.5 pr-3 text-left',
        className,
      )}
    >
      {/* The banner takes the first column over every row; the title and the rows stack in the second. */}
      <span className="col-start-2 row-start-1 flex w-full min-w-0 items-center gap-1.5 pt-1 text-[20px] leading-none text-ink">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {tag}
      </span>
      {children}
    </button>
  )
}

/** Kept for the squares built on the older frame: the banner's shape is the card's picture now. */
export const WIDGET_BANNER_H = 92

/** The older frame's banner: the card's picture, in its first column. */
export function WidgetBanner({ children }: { children: ReactNode }) {
  return (
    <span className="relative col-start-1 row-span-2 row-start-1 block min-h-[60px] overflow-hidden bg-night leading-[0] shadow-ring-thin">
      {children}
    </span>
  )
}

/** A tag's room in a header: no taller than the line, so a tag never grows the card. */
export const HeadTag = ({ children }: { children?: ReactNode }) => (
  <span className="flex h-[20px] shrink-0 items-center">{children}</span>
)

/** The older frame's rows: on the card, the line, the gauge and the small print in its second column. */
export function WidgetRows({ top, meter, bottom }: { top: ReactNode; meter?: ReactNode; bottom: ReactNode }) {
  return (
    <span className="col-start-2 row-start-2 grid w-full min-w-0 content-center gap-1 pb-1">
      <span className="flex min-w-0 items-center">{top}</span>
      {meter && <span>{meter}</span>}
      <span className="truncate font-pixel-sm text-[16px] leading-tight text-muted">{bottom}</span>
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
