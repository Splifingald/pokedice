import type { ReactNode } from 'react'
import { cx } from '@/theme/util'
import { MiniSprite } from './SpriteImg'

/**
 * A small square for a grid of Pokémon (the Box, the Pokédex): the menu icon (one sheet for the whole game, so a
 * grid of hundreds costs one request), an optional number, the name and a line under it. `tags` sit in the corners
 * (NEW, Nearby, a shiny star); `missing` greys the tile and turns the icon into a silhouette.
 */
export function MonTile({
  dex,
  name,
  sub,
  number,
  missing,
  tags,
  label,
  onClick,
  id,
  icon,
}: {
  dex: number
  name: ReactNode
  sub?: ReactNode
  number?: string
  missing?: boolean
  tags?: ReactNode
  /** The whole tile's accessible name. */
  label: string
  onClick: () => void
  id?: string
  /** In place of the menu icon (a fossil still reviving shows its fossil). */
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      aria-label={label}
      className={cx(
        'relative grid w-full justify-items-center gap-0.5 px-1 pb-[7px] pt-[3px] shadow-ring-line hover:shadow-ring',
        missing ? 'bg-well' : 'bg-paper',
      )}
    >
      {icon ?? <MiniSprite dex={dex} size={40} silhouette={missing} />}
      {number && <span className="font-pixel-sm text-[12px] leading-none text-muted">{number}</span>}
      <b className={cx('max-w-full truncate text-[15px] font-normal leading-none', missing && 'text-muted')}>
        {name}
      </b>
      {sub && <span className="font-pixel-sm text-[13px] leading-none text-muted">{sub}</span>}
      {tags}
    </button>
  )
}

/** A corner tag on a tile: gold NEW (top right), green Nearby (top left). */
export function TileTag({ tone, children }: { tone: 'new' | 'near'; children: ReactNode }) {
  return (
    <em
      className={cx(
        'absolute top-[3px] px-[3px] pb-[2px] pt-px font-pixel-sm text-[12px] not-italic leading-none',
        tone === 'new'
          ? 'right-[3px] bg-gold text-ink shadow-ring-thin'
          : 'left-[3px] bg-good-pale text-good shadow-[inset_0_0_0_1px_#34c97a]',
      )}
      aria-hidden
    >
      {children}
    </em>
  )
}

/** Box/Pokédex grid: as many ~84px columns as fit. */
export const TILE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5'
