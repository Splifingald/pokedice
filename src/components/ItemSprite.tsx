import type { ItemDef } from '@/engine'

/** An item's picture, at a fixed box so names line up in a list (blank when the item has no sprite). */
export function ItemSprite({ item, size = 28 }: { item: ItemDef | undefined; size?: number }) {
  if (!item?.spriteUrl) return <span className="shrink-0" style={{ width: size, height: size }} />
  return <img src={item.spriteUrl} alt="" width={size} height={size} className="shrink-0" style={{ imageRendering: 'pixelated' }} />
}
