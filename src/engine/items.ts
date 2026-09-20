// Items: where each one can be used, what the Poké Mart sells, and the per-area loot decks behind item finds.
import { shuffle } from './deal'
import type { Rng } from './rng'
import type { Area, AreaProgress, GameData, ItemDef, LootEntry } from './types'

/** Loot key for Pokédollars lying on the ground (not an inventory item). */
export const MONEY = 'money'

export type ItemUse = 'battle' | 'field' | 'catch'

/**
 * Potions work anywhere; status heals and Ethers only mean something mid-battle (statuses and rerolls reset after it);
 * Rare Candy is used from the Team screen; balls at the catch throw.
 */
export function itemUses(item: ItemDef): ItemUse[] {
  switch (item.effect.kind) {
    case 'heal':
    case 'revive':
      return ['battle', 'field']
    case 'cure':
    case 'rerolls':
      return ['battle']
    case 'level':
    case 'stone':
      return ['field']
    case 'ball':
      return ['catch']
    case 'fossil':
      return []
  }
}

export const usableIn = (item: ItemDef | undefined, use: ItemUse): boolean => !!item && itemUses(item).includes(use)

/** What a ball adds to the catch die (0 for anything else). */
export const ballBonus = (item: ItemDef | undefined): number => (item?.effect.kind === 'ball' ? item.effect.bonus : 0)

/** What the Mart pays for one: half its price, rounded down. Only items the Mart sells can be sold back (0 = can't). */
export const sellPrice = (item: ItemDef | undefined): number => (item?.inShop ? Math.floor(item.price / 2) : 0)

/**
 * The Poké Mart's stock, by badge tier then price; `unlocked` once the player holds enough badges and has reached the
 * item's area, if it names one (`areaOpen` answers that; without it, area-bound items stay locked).
 */
export function shopStock(
  data: GameData,
  badges: number,
  areaOpen: (areaId: string) => boolean = () => false,
): { item: ItemDef; unlocked: boolean }[] {
  return Object.values(data.items)
    .filter((i) => i.inShop)
    .sort((a, b) => a.shopBadges - b.shopBadges || a.price - b.price || a.name.localeCompare(b.name))
    .map((item) => ({ item, unlocked: badges >= item.shopBadges && (!item.shopArea || areaOpen(item.shopArea)) }))
}

/** Loot still to be found in this area: a unique find already made is gone for good. */
export function lootPoolFor(area: Area, progress: AreaProgress, data: GameData): LootEntry[] {
  const found = new Set(progress.uniqueFound ?? [])
  return area.lootPool.filter((e) => e.weight > 0 && (e.itemKey === MONEY || !!data.items[e.itemKey]) && !(e.unique && found.has(e.id)))
}

/** Copies of a loot entry in the area's loot deck: its weight (v1.6), at least one; a unique find gets one at most. */
export const lootCopies = (e: Pick<LootEntry, 'weight' | 'unique'>) => (e.weight > 0 ? (e.unique ? 1 : Math.max(1, Math.round(e.weight))) : 0)

/** A shuffled loot deck of entry ids: each entry's weight is its number of copies. */
export function buildLootDeck(pool: readonly LootEntry[], rng: Rng): string[] {
  return shuffle(
    pool.flatMap((e) => Array.from({ length: lootCopies(e) }, () => e.id)),
    rng,
  )
}

/** Draw the next find from the area's loot deck (dealt afresh when empty). Null when the area has nothing to find. */
export function drawLoot(
  area: Area,
  progress: AreaProgress,
  data: GameData,
  rng: Rng,
): { entry: LootEntry; qty: number; lootDeck: string[] } | null {
  const pool = lootPoolFor(area, progress, data)
  if (!pool.length) return null
  const byId = new Map(pool.map((e) => [e.id, e]))
  const size = pool.reduce((sum, e) => sum + lootCopies(e), 0)
  let deck = progress.lootDeck?.length ? [...progress.lootDeck] : buildLootDeck(pool, rng)
  const tries = 2 * (deck.length + Math.max(1, size))
  for (let i = 0; i < tries; i++) {
    if (!deck.length) deck = buildLootDeck(pool, rng)
    const entry = byId.get(deck.pop()!)
    if (!entry) continue // a card for loot that's gone: a unique find already made, or content edited since the deal
    const lo = Math.max(1, Math.min(entry.minQty, entry.maxQty))
    const hi = Math.max(lo, entry.maxQty, entry.minQty)
    return { entry, qty: rng.int(lo, hi), lootDeck: deck }
  }
  return null
}
