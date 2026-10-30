// The Mart's categories, apart from the screen so a test can check them without loading it (and the art it pulls in).
import type { ItemDef } from '@/engine'

type Kind = ItemDef['effect']['kind']
export type GroupId = 'ball' | 'heal' | 'battle' | 'cure' | 'stone' | 'fossil' | 'gem'
export type Cat = GroupId | 'all'

/**
 * The Mart's categories, Balls first. Both tabs list items by group, so an item whose effect kind is in no group would
 * silently vanish the moment it unlocked. Every kind of `ItemEffect` must appear here; `groupOf` and its test are what
 * keep that true as kinds are added.
 */
export const GROUPS: { id: GroupId; chip: string; title: string; kinds: Kind[] }[] = [
  { id: 'ball', chip: 'ui.shop.catBalls', title: 'ui.shop.groupCatch', kinds: ['ball', 'bait'] },
  { id: 'heal', chip: 'ui.shop.groupHealing', title: 'ui.shop.groupHealing', kinds: ['heal', 'revive'] },
  { id: 'battle', chip: 'ui.shop.groupBattle', title: 'ui.shop.groupBattle', kinds: ['rerolls', 'level', 'talent'] },
  { id: 'cure', chip: 'ui.shop.groupCures', title: 'ui.shop.groupCures', kinds: ['cure'] },
  { id: 'stone', chip: 'ui.shop.groupEvolution', title: 'ui.shop.groupEvolution', kinds: ['stone', 'link'] },
  { id: 'fossil', chip: 'ui.shop.groupFossils', title: 'ui.shop.groupFossils', kinds: ['fossil'] },
  // Mega Gems have a shelf of their own (GemShelf), never the Mart's stock; the bag lists the ones held.
  { id: 'gem', chip: 'ui.shop.groupGems', title: 'ui.shop.groupGems', kinds: ['megaGem'] },
]

/** The group an item is listed under (its title key), or null when no group claims its kind. */
export const groupOf = (kind: Kind): string | null =>
  GROUPS.find((g) => g.kinds.includes(kind))?.title ?? null
export const groupIndex = (it: ItemDef) => GROUPS.findIndex((g) => g.kinds.includes(it.effect.kind))
export const inCat = (cat: Cat) => (it: ItemDef) =>
  cat === 'all' || GROUPS.find((g) => g.id === cat)!.kinds.includes(it.effect.kind)
