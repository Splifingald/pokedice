// A small world's starting gift (docs/64 §4.7): right after the partner pick, a blue present holding the world's
// starting bag and ₽ (Snowglobe Valley's: 2 Potions, 5 Poké Balls, ₽10, 2 Ice Heals). While its switch is on, a fresh
// start's bag and purse begin empty and the present fills them once opened; off, the new-game bag as before. Pure: the
// screen shows the present, the store asks the server, this decides.
import { eventOpenTo } from './events'
import type { GiftItem } from './giftCard'
import { MONEY } from './items'
import { regionOf } from './regions'
import type { GameData, SaveData, SmallWorld, WelcomeGift, WorldSave } from './types'
import { worldById } from './worldList'

// As worlds.ts' heldWorld, which enterWorld (there) can't import back from here.
const held = (save: SaveData): WorldSave | null =>
  save.events?.world && !save.events.world.closed ? save.events.world : null

/** Switched on for whoever is playing (the server confirms it for a signed-in player: store/welcomeGift.ts). */
export const welcomeGiftOn = (data: GameData): boolean => eventOpenTo(data.config.welcomeGift?.access, data)

const count = (n: unknown): number => {
  const x = Math.floor(Number(n))
  return Number.isFinite(x) && x > 0 ? x : 0
}

/** The world's starting gift as the game can give it: items it has, whole positive counts; null when it holds nothing. */
export function welcomeGiftOf(
  data: Pick<GameData, 'items'>,
  world: Pick<SmallWorld, 'welcomeGift'>,
): WelcomeGift | null {
  const raw = world.welcomeGift
  if (!raw) return null
  const items = Object.fromEntries(
    Object.entries(raw.items ?? {})
      .map(([k, q]) => [k, count(q)] as const)
      .filter(([k, q]) => q > 0 && !!data.items[k]),
  )
  const gold = count(raw.gold)
  return gold > 0 || Object.keys(items).length ? { gold, items } : null
}

/** What comes out, as the Gift card's rewards are listed: ₽ first, then the items in the admin's order. */
export const welcomeGiftContents = (gift: WelcomeGift): GiftItem[] => [
  ...(gift.gold > 0 ? [{ key: MONEY, qty: gift.gold }] : []),
  ...Object.entries(gift.items).map(([key, qty]) => ({ key, qty })),
]

/** Entering a world for the first time gives its present: the switch on (and the server's yes) and a gift to give. */
export const welcomeGiftGiven = (data: GameData, world: SmallWorld, allowed: boolean): boolean =>
  allowed && welcomeGiftOn(data) && !!welcomeGiftOf(data, world)

/** The present waiting to be opened, inside its world: its world and what it holds; null otherwise. */
export function welcomeGiftDue(
  save: SaveData,
  data: GameData,
): { world: SmallWorld; gift: WelcomeGift } | null {
  const w = held(save)
  if (w?.welcome !== 'due' || regionOf(save) !== w.regionId) return null
  const world = worldById(data, w.id)
  const gift = world && welcomeGiftOf(data, world)
  return world && gift ? { world, gift } : null
}

/**
 * Opens it: its items go into the world's bag and its ₽ into the world's purse, once. Null when no present waits here.
 * Opened even if the switch went off meanwhile: it was given, and the bag started empty for it.
 */
export function openWelcomeGift(save: SaveData, data: GameData): SaveData | null {
  const due = welcomeGiftDue(save, data)
  if (!due) return null
  const inventory = { ...save.inventory }
  for (const [k, q] of Object.entries(due.gift.items)) inventory[k] = (inventory[k] ?? 0) + q
  return {
    ...save,
    gold: save.gold + due.gift.gold,
    inventory,
    events: { ...save.events, world: { ...held(save)!, welcome: 'opened' } },
  }
}
