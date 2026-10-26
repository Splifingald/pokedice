import type { ReactNode } from 'react'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { MiniSprite } from './SpriteImg'

/**
 * A small square for a grid of Pokémon (the Box, the Pokédex): the menu icon (one sheet for the whole game, so a
 * grid of hundreds costs one request), an optional number, the name and a line under it. `tags` sit in the corners
 * (NEW, Nearby, a shiny star); `missing` greys the tile and turns the icon into a silhouette; `locked` greys the tile
 * and its icon and puts a lock in the corner (a small world's Pokémon waiting to unlock, docs/26 §1). `level`: a navy
 * tag in the top right corner (the Box: the name keeps the tile's 16 px line to itself); `selected`: the gold outline
 * of the one shown beside the grid (the Team's docked sheet on a PC).
 */
export function MonTile({
  dex,
  name,
  sub,
  number,
  missing,
  locked,
  tags,
  label,
  onClick,
  id,
  icon,
  level,
  selected,
}: {
  dex: number
  name: ReactNode
  sub?: ReactNode
  number?: string
  missing?: boolean
  locked?: boolean
  tags?: ReactNode
  /** The whole tile's accessible name. */
  label: string
  onClick: () => void
  id?: string
  /** In place of the menu icon (a fossil still reviving shows its fossil). */
  icon?: ReactNode
  /** Its level, as a corner tag. */
  level?: ReactNode
  /** Shown beside the grid right now (said as the current one). */
  selected?: boolean
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      aria-label={label}
      aria-current={selected || undefined}
      className={cx(
        'relative grid w-full justify-items-center gap-0.5 px-1 pb-[7px] pt-[3px] shadow-ring-line hover:shadow-ring',
        missing || locked ? 'bg-well' : 'bg-paper',
        level != null && 'pt-[14px]',
        selected && 'outline outline-[3px] outline-offset-1 outline-gold',
      )}
    >
      {icon ?? (
        <span className={cx('grid', locked && 'opacity-75 grayscale-[0.8]')}>
          <MiniSprite dex={dex} size={40} silhouette={missing} />
        </span>
      )}
      {number && <span className="font-pixel-sm text-tag leading-none text-muted">{number}</span>}
      <b className={cx('max-w-full truncate text-[16px] font-normal leading-none', missing && 'text-muted')}>
        {name}
      </b>
      {sub && <span className="font-pixel-sm text-[16px] leading-none text-muted">{sub}</span>}
      {level != null && (
        <span
          className="light-scope absolute right-[3px] top-[3px] bg-night px-[3px] pb-[2px] pt-px font-pixel-sm text-tag leading-none text-gold-light"
          aria-hidden
        >
          {level}
        </span>
      )}
      {locked && (
        <PixelIcon name="lock" size={12} className={cx('absolute right-[5px]', level != null ? 'top-[22px]' : 'top-[5px]')} />
      )}
      {tags}
    </button>
  )
}

/** A corner tag on a tile: gold NEW (top right), green Nearby (top left). */
export function TileTag({ tone, children }: { tone: 'new' | 'near'; children: ReactNode }) {
  return (
    <em
      className={cx(
        'absolute top-[3px] px-[3px] pb-[2px] pt-px font-pixel-sm text-tag not-italic leading-none',
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
