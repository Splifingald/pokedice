// Items: where each one can be used, what the Poké Mart sells, and the per-area loot decks behind item finds.
import { shuffle } from './deal'
import { eventOpenTo } from './events'
import { pityChance } from './pity'
import type { Rng } from './rng'
import type { Area, AreaProgress, GameData, ItemDef, LootEntry, RegionId, SaveData } from './types'
import { worldOfArea, worldOfRegion } from './worldList'

/** Loot key for Pokédollars lying on the ground (not an inventory item). */
export const MONEY = 'money'

export type ItemUse = 'battle' | 'field' | 'catch'

/**
 * Potions work anywhere; status heals and Ethers only mean something mid-battle (statuses and rerolls reset after it);
 * Rare Candy, stones and the Link Cable are used from the Team screen; balls and the Bait at the catch throw.
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
    case 'link':
      return ['field']
    case 'ball':
    case 'bait':
      return ['catch']
    // A fossil revives on its own; a Mega Gem is held, not used: the battle reads it (docs/35).
    case 'fossil':
    case 'megaGem':
      return []
  }
}

/**
 * An item with a switch of its own (game_config `itemSwitches`, docs/15 §20) is only there for whoever it's switched
 * on for: off, it isn't sold, found or usable (a bag that holds some keeps them). Items without a switch are always on.
 */
export function itemOn(data: GameData, key: string): boolean {
  const access = data.config.itemSwitches?.[key]
  return access == null || eventOpenTo(access, data)
}

/**
 * On where this save stands: switched on, or anywhere inside a small world, whose Mart and loot are the admin's own
 * choice for it (docs/26 §2.2: its Link Cable is sold and used there while the switch keeps it off elsewhere).
 */
export const itemOnFor = (save: Pick<SaveData, 'region'>, data: GameData, key: string): boolean =>
  itemOn(data, key) || !!worldOfRegion(data, save.region ?? 'kanto')

export const usableIn = (item: ItemDef | undefined, use: ItemUse): boolean => !!item && itemUses(item).includes(use)

/**
 * A ball that can be thrown at this catch: any ball in a raid, every ball but the raids' own elsewhere (the Raid Ball,
 * docs/44, is thrown in raids alone).
 */
export const isBallFor = (item: ItemDef | undefined, raid: boolean): boolean =>
  item?.effect.kind === 'ball' && (raid || !item.effect.raidOnly)

/** What a ball adds to the catch die (0 for anything else). */
export const ballBonus = (item: ItemDef | undefined): number => (item?.effect.kind === 'ball' ? item.effect.bonus : 0)

/**
 * What the Mart pays for one: half its price, rounded down. Only items the Mart sells can be sold back (0 = can't); a
 * Mega Gem never is (docs/35).
 */
export const sellPrice = (item: ItemDef | undefined): number =>
  item?.inShop && item.effect.kind !== 'megaGem' ? Math.floor(item.price / 2) : 0

/**
 * The Poké Mart's stock, by badge tier then price; `unlocked` once the player holds enough badges and has reached the
 * item's area, if it names one (`areaOpen` answers that; without it, area-bound items stay locked).
 *
 * Two things take an item off the shelf entirely rather than locking it, because neither is something the player can
 * work towards here: one that belongs to another region, and a `unique` one this region has already sold. Both are
 * skipped only when the caller says where it is standing — `where.region` unset means "every region's stock", which
 * is what the admin simulator and the tests want.
 */
export function shopStock(
  data: GameData,
  badges: number,
  areaOpen: (areaId: string) => boolean = () => false,
  where: { region?: RegionId; bought?: readonly string[] } = {},
): { item: ItemDef; unlocked: boolean }[] {
  const bought = new Set(where.bought ?? [])
  return Object.values(data.items)
    .filter((i) => i.inShop && itemOn(data, i.key))
    .filter((i) => !where.region || !i.region || i.region === where.region)
    .filter((i) => !(i.unique && bought.has(i.key)))
    .sort((a, b) => a.shopBadges - b.shopBadges || a.price - b.price || a.name.localeCompare(b.name))
    .map((item) => ({ item, unlocked: badges >= item.shopBadges && (!item.shopArea || areaOpen(item.shopArea)) }))
}

/** Whether the Mart here would sell this item at all, ignoring badges and areas. */
export function shopSells(
  item: ItemDef | undefined,
  save: Pick<SaveData, 'boughtUnique'>,
  region: RegionId,
  data?: GameData,
): boolean {
  if (!item?.inShop || (data && !itemOn(data, item.key))) return false
  if (item.region && item.region !== region) return false
  return !(item.unique && (save.boughtUnique ?? []).includes(item.key))
}

/** Loot still to be found in this area: a unique find already made is gone for good. */
export function lootPoolFor(area: Area, progress: AreaProgress, data: GameData): LootEntry[] {
  const found = new Set(progress.uniqueFound ?? [])
  return area.lootPool.filter(
    (e) =>
      e.weight > 0 &&
      (e.itemKey === MONEY || (!!data.items[e.itemKey] && (itemOn(data, e.itemKey) || !!worldOfArea(data, area)))) &&
      !(e.unique && found.has(e.id)),
  )
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

/**
 * The loot deck alone makes a find once-only `share` of the time on average. Once the pity (game_config.uniquePity)
 * kicks in, a roll before the draw tops that up to `pityChance` with one of the once-only finds left; its card stays in
 * the deck and is skipped when it comes up. No roll (and no change to the draw) while the pity is ×1.
 */
function pityFind(pool: readonly LootEntry[], size: number, progress: AreaProgress, data: GameData, rng: Rng): LootEntry | null {
  const uniques = pool.filter((e) => e.unique)
  const extra = pityExtra(uniques, size, progress, data)
  return extra > 0 && rng.next() < extra ? rng.pick(uniques) : null
}

/** The pity roll's chance of handing out one of `uniques` before the deck is drawn; 0 while the pity is ×1. */
function pityExtra(uniques: readonly LootEntry[], size: number, progress: AreaProgress, data: GameData): number {
  if (!uniques.length || !size) return 0
  const share = uniques.reduce((sum, e) => sum + lootCopies(e), 0) / size
  const chance = pityChance(share, progress.roundsDone ?? 0, data.config.uniquePity)
  // chance = extra + (1 − extra) × share: the roll, else the deck as usual.
  return chance > share ? (chance - share) / (1 - share) : 0
}

/**
 * The chance an item find in this area is each one-time find still to be made, by entry id: the pity roll's even
 * share of it, else its one card in the loot deck. The odds over a whole deck, for the area's sheet: which cards are
 * left in the current deal is not read.
 */
export function uniqueFindChances(area: Area, progress: AreaProgress, data: GameData): Map<string, number> {
  const pool = lootPoolFor(area, progress, data)
  const size = pool.reduce((sum, e) => sum + lootCopies(e), 0)
  const uniques = pool.filter((e) => e.unique)
  const extra = pityExtra(uniques, size, progress, data)
  return new Map(uniques.map((e) => [e.id, extra / uniques.length + ((1 - extra) * lootCopies(e)) / size]))
}

/** How rare a find is (docs/43), for its step to say: "Common find", "Uncommon find", "Rare find". */
export type FindRarity = 'common' | 'uncommon' | 'rare'
/** A find is common from this share of the area's loot deck, uncommon from the next, rare under it. */
export const FIND_COMMON_SHARE = 0.12
export const FIND_UNCOMMON_SHARE = 0.05

/**
 * A find's rarity, from its share of the area's loot deck as the deck is dealt (its copies over all the copies of
 * what's still to be found): 12 % and up is common, 5 % and up uncommon, less is rare. A once-only find is always rare.
 * An entry no longer on the table (a unique just struck off, content edited since the draw) reads as rare.
 */
export function findRarity(area: Area, progress: AreaProgress, data: GameData, entryId: string): FindRarity {
  const pool = lootPoolFor(area, progress, data)
  const entry = pool.find((e) => e.id === entryId)
  if (!entry || entry.unique) return 'rare'
  const size = pool.reduce((sum, e) => sum + lootCopies(e), 0)
  const share = size > 0 ? lootCopies(entry) / size : 0
  return share >= FIND_COMMON_SHARE ? 'common' : share >= FIND_UNCOMMON_SHARE ? 'uncommon' : 'rare'
}

/**
 * Draw the next find from the area's loot deck (dealt afresh when empty), after the pity roll for once-only finds.
 * Null when the area has nothing to find.
 */
export function drawLoot(
  area: Area,
  progress: AreaProgress,
  data: GameData,
  rng: Rng,
): { entry: LootEntry; qty: number; lootDeck: string[] } | null {
  const pool = lootPoolFor(area, progress, data)
  if (!pool.length) return null
  const qtyOf = (entry: LootEntry) => {
    const lo = Math.max(1, Math.min(entry.minQty, entry.maxQty))
    const hi = Math.max(lo, entry.maxQty, entry.minQty)
    return rng.int(lo, hi)
  }
  const byId = new Map(pool.map((e) => [e.id, e]))
  const size = pool.reduce((sum, e) => sum + lootCopies(e), 0)
  const pity = pityFind(pool, size, progress, data, rng)
  if (pity) return { entry: pity, qty: qtyOf(pity), lootDeck: [...(progress.lootDeck ?? [])] }
  let deck = progress.lootDeck?.length ? [...progress.lootDeck] : buildLootDeck(pool, rng)
  const tries = 2 * (deck.length + Math.max(1, size))
  for (let i = 0; i < tries; i++) {
    if (!deck.length) deck = buildLootDeck(pool, rng)
    const entry = byId.get(deck.pop()!)
    if (!entry) continue // a card for loot that's gone: a unique find already made, or content edited since the deal
    return { entry, qty: qtyOf(entry), lootDeck: deck }
  }
  return null
}
