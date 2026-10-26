// The Pokédex's grid (docs/43 §5.6): one dense tile per species (or Unown letter), the same on the Pokédex, its Shiny
// view and its Unown view. An uncaught species is its silhouette alone (its number and "not caught" for screen readers
// only); a caught one its icon and its name. The whole grid is one stop for Tab; the arrow keys move through it.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { MiniSprite } from './SpriteImg'

/** As many ~64 px columns as fit: five on a 360 px phone, ten beside the docked entry on a PC. */
export const DEX_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1 lg:grid-cols-[repeat(auto-fill,minmax(76px,1fr))]'

/**
 * One tile. `name` is shown under the icon only for what was caught (null: the silhouette alone); `near` puts the green
 * Nearby word in that empty line (or, on a named tile, a map tag in the corner); `isNew` the gold NEW tag; `star` the
 * Box's shiny star. `selected` is the entry open beside the grid on a PC (a gold ring, `aria-current`).
 */
export function DexTile({
  dex,
  icon,
  iconSize = 32,
  name,
  missing,
  near,
  isNew,
  star,
  selected,
  label,
  nearLabel,
  newLabel,
  tabIndex,
  onClick,
  onFocus,
}: {
  dex: number
  icon?: ReactNode
  /** The menu icon's nominal size (drawn at 1.5×, `MiniSprite`): bigger beside a PC's docked entry. */
  iconSize?: number
  name: string | null
  missing: boolean
  near?: boolean
  isNew?: boolean
  star?: boolean
  selected?: boolean
  label: string
  nearLabel: string
  newLabel: string
  tabIndex: number
  onClick: (keyboard: boolean) => void
  onFocus?: () => void
}) {
  return (
    <button
      type="button"
      data-tile={dex}
      aria-label={label}
      aria-current={selected || undefined}
      title={name ?? undefined}
      tabIndex={tabIndex}
      // A keyboard's Enter or Space clicks with no pointer behind it (detail 0): the PC then moves into the entry.
      onClick={(e) => onClick(e.detail === 0)}
      onFocus={onFocus}
      className={cx(
        'relative grid h-[72px] w-full grid-rows-[1fr_auto] justify-items-center px-0.5 pb-1 pt-0.5 lg:h-[80px]',
        missing ? 'bg-well' : 'bg-paper',
        selected ? 'z-[1] shadow-card-gold' : 'shadow-ring-line hover:shadow-ring',
      )}
    >
      <span className="grid place-items-center self-center">
        {icon ?? <MiniSprite dex={dex} size={iconSize} silhouette={missing} />}
      </span>
      {/* The line under the icon keeps its height empty, so every row of the grid lines up. */}
      <span className="flex h-[18px] max-w-full items-center">
        {name != null ? (
          <b className={cx('truncate text-[16px] font-normal leading-none', missing && 'text-muted')}>{name}</b>
        ) : near ? (
          <em
            aria-hidden
            className="max-w-full truncate bg-good-pale px-1 font-pixel-sm text-[16px] not-italic leading-[18px] text-good shadow-[inset_0_0_0_1px_#34c97a]"
          >
            {nearLabel}
          </em>
        ) : null}
      </span>
      {near && name != null && (
        <em
          aria-hidden
          className="absolute left-[3px] top-[3px] grid h-[18px] w-[18px] place-items-center bg-good-pale shadow-[inset_0_0_0_1px_#34c97a]"
        >
          <PixelIcon name="map" size={12} />
        </em>
      )}
      {star && <PixelIcon name="star" size={12} className="absolute left-[4px] top-[4px]" />}
      {isNew && (
        <em
          aria-hidden
          className="absolute right-[3px] top-[3px] bg-gold px-[3px] pb-[2px] pt-px font-pixel-sm text-tag not-italic leading-none text-ink shadow-ring-thin"
        >
          {newLabel}
        </em>
      )}
    </button>
  )
}

/**
 * The grid's keyboard: one Tab stop (the tile `active`, or the first), the arrows move by one or by a row (the columns
 * read from the layout, so it follows the screen's width), Home and End to the ends. Focus is what moves; the screen
 * decides whether focus also opens the entry (`onFocus`, on a PC).
 */
export function DexGridList({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  const onKeyDown = (e: KeyboardEvent) => {
    const tiles = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])
    const i = tiles.indexOf(document.activeElement as HTMLElement)
    if (i < 0 || !tiles.length) return
    const top = tiles[0]!.offsetTop
    const cols = Math.max(1, tiles.findIndex((t) => t.offsetTop !== top) === -1 ? tiles.length : tiles.findIndex((t) => t.offsetTop !== top))
    const to =
      e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowLeft'
          ? i - 1
          : e.key === 'ArrowDown'
            ? i + cols
            : e.key === 'ArrowUp'
              ? i - cols
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? tiles.length - 1
                  : null
    if (to == null) return
    e.preventDefault()
    const next = tiles[Math.min(tiles.length - 1, Math.max(0, to))]
    next?.focus()
    next?.scrollIntoView({ block: 'nearest' })
  }
  return (
    <ul ref={ref} aria-label={label} onKeyDown={onKeyDown} className={cx(DEX_GRID, className)}>
      {children}
    </ul>
  )
}

/** Progress as a gauge in the page's head: the bar and "32/151", named for screen readers ("32 of 151 caught"). */
export function DexGauge({ n, total, label, className }: { n: number; total: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cx('flex min-w-0 items-center gap-2', className)}>
      <span className="pixel-corners relative block h-3 min-w-[72px] flex-1 bg-line shadow-ring" aria-hidden>
        <i className="block h-full bg-gold" style={{ width: `${(n / Math.max(1, total)) * 100}%` }} />
      </span>
      <span className="shrink-0 font-pixel-sm text-[18px] tabular-nums leading-none" aria-hidden>
        {n}/{total}
      </span>
    </span>
  )
}
