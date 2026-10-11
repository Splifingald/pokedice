import type { ItemDef } from '@/engine'
import sheet from '@/assets/item-icons.png'
import atlas from '@/data/item-atlas.json'
import { cx } from '@/theme/util'

const INDEX = atlas.index as Record<string, number | undefined>

/**
 * An item's picture, at a fixed box so names line up in a list (blank when the item has no sprite). Pictures come
 * from one sheet (`pnpm item-sprites`), so a whole shelf costs one request; an item added since the sheet was built
 * falls back to its own URL.
 */
export function ItemSprite({
  item,
  size = 28,
  className,
}: {
  item: ItemDef | undefined
  size?: number
  className?: string
}) {
  const url = item?.spriteUrl
  if (!url)
    return <span className={cx('shrink-0', className)} style={{ width: size, height: size }} aria-hidden />
  const n = INDEX[url]
  if (n == null)
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={cx('pixelated shrink-0', className)}
        style={{ imageRendering: 'pixelated' }}
      />
    )
  const k = size / atlas.cell
  return (
    <span
      aria-hidden
      className={cx('pixelated inline-block shrink-0', className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${atlas.cols * atlas.cell * k}px ${atlas.rows * atlas.cell * k}px`,
        backgroundPosition: `-${(n % atlas.cols) * atlas.cell * k}px -${Math.floor(n / atlas.cols) * atlas.cell * k}px`,
        imageRendering: 'pixelated',
      }}
    />
  )
}
