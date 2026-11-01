// Gifts with the developer's messages (docs/15 §23): items (a quantity each), Pokémon (a level each, shiny or not),
// Pokédollars and Heart Scales (docs/60), each sent to a region the admin picked or to the player's latest one (Heart
// Scales go to the player's wallet on the server, migration 0108). The server holds them on the message until the
// player's game claims them (migration 0048); these functions decide where each one lands, and the screens only say it.
import { cleanOutfit, hasOutfit, outfitsOn } from './outfits'
import { rollTalentFor } from './talents'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { createInstance } from './progression'
import { addToRegion } from './raid'
import { inWorldRegion, isWorldRegion, KANTO, regionOf, unlockedRegions } from './regions'
import type { GameData, Gift, GiftRegion, GiftsSave, RegionId, SaveData } from './types'

/** The admin's "the player's latest region" (the newest region they've started), as stored on a gift. */
export const GIFT_LATEST: GiftRegion = 'latest'
/** The region being played when the gift is opened (the weekly league's ₽, docs/44). */
export const GIFT_CURRENT: GiftRegion = 'current'
/** At most this many gifts on one message, this many of one item, this many ₽ at once (the server checks the same: 0048). */
export const GIFT_MAX = 20
export const GIFT_QTY_MAX = 999
export const GIFT_GOLD_MAX = 999_999
/** Heart Scales on one gift (0108 checks the same): a few weeks of the Friend Market's shelf. */
export const GIFT_SCALES_MAX = 9_999
/** Messages remembered as opened in the save. */
const DONE_KEPT = 100

/** The admin's switch (docs/15 §20): on for everyone, or for the admin only. */
export const giftsOn = (data: GameData): boolean => eventOpenTo(data.config.gifts?.access, data)

/**
 * Why gifts can't be opened in this save right now, and wait on the server: the switch is off, this is the Extreme save
 * (gifts are for the main game), or the player is inside a small world (nothing from outside reaches one, docs/21).
 */
export type GiftsWait = 'off' | 'extreme' | 'world'

export function giftsWait(save: SaveData, data: GameData): GiftsWait | null {
  if (!giftsOn(data)) return 'off'
  if (isExtreme(save)) return 'extreme'
  if (inWorldRegion(save, data)) return 'world'
  return null
}

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const regionId = (v: unknown): GiftRegion | null =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null

/** A message's gifts as the server sent them: anything malformed is left out, never the rest. */
export function parseGifts(raw: unknown): Gift[] {
  if (!Array.isArray(raw)) return []
  const out: Gift[] = []
  for (const g of raw.slice(0, GIFT_MAX)) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const region = regionId(o.region)
    if (!region) continue
    if (o.kind === 'item') {
      const qty = int(o.qty)
      if (typeof o.key === 'string' && o.key && qty != null && qty >= 1 && qty <= GIFT_QTY_MAX)
        out.push({ kind: 'item', key: o.key, qty, region })
    } else if (o.kind === 'pokemon') {
      const dex = int(o.dex)
      const level = int(o.level)
      if (dex != null && dex >= 1 && level != null && level >= 1 && level <= 100)
        out.push({
          kind: 'pokemon',
          dex,
          level,
          ...(o.shiny === true && { shiny: true }),
          ...(cleanOutfit(o.outfit, dex) && { outfit: o.outfit as string }),
          region,
        })
    } else if (o.kind === 'gold') {
      const amount = int(o.amount)
      if (amount != null && amount >= 1 && amount <= GIFT_GOLD_MAX) out.push({ kind: 'gold', amount, region })
    } else if (o.kind === 'heartScales') {
      const amount = int(o.amount)
      if (amount != null && amount >= 1 && amount <= GIFT_SCALES_MAX)
        out.push({ kind: 'heartScales', amount, region })
    }
  }
  return out
}

/** The regions this save has started (live or parked), small worlds left out. */
const started = (save: SaveData, data: GameData, id: RegionId): boolean =>
  !isWorldRegion(data, id) &&
  (id === regionOf(save) || !!save.parked?.[id]) &&
  id !== save.events?.world?.regionId

/**
 * The player's latest region: the newest one (in the regions' order) they have started. Kanto when nothing else is,
 * which every save has.
 */
export function latestRegion(save: SaveData, data: GameData): RegionId {
  const mine = unlockedRegions(save, data).filter((r) => started(save, data, r.id))
  return mine[mine.length - 1]?.id ?? (started(save, data, regionOf(save)) ? regionOf(save) : KANTO)
}

/**
 * Where a gift for `region` lands: that region, once the player has started it; otherwise (not reached yet, or a
 * region that no longer exists) their latest one. Never a small world's: it closes with everything in it.
 */
export function giftLanding(save: SaveData, data: GameData, region: GiftRegion): RegionId {
  if (region === GIFT_CURRENT)
    return started(save, data, regionOf(save)) ? regionOf(save) : latestRegion(save, data)
  return region !== GIFT_LATEST && started(save, data, region) ? region : latestRegion(save, data)
}

/** One gift, put away: where it went, and for a Pokémon whether it's new to that Pokédex and joined the team. */
export interface GiftLanded {
  gift: Gift
  region: RegionId
  /** The region it was meant for wasn't started: it went to the latest one instead. */
  moved: boolean
  /** A Pokémon its region's Pokédex didn't have. */
  isNew?: boolean
  /** A Pokémon that joined the team of the region being played (there was room). */
  joinedTeam?: boolean
  /** Heart Scales: the server put them in the wallet (0108); nothing went into the save. */
  scales?: boolean
  /**
   * A Friend Market Pokémon (docs/60) waiting in its species' region, locked until one of the player's Pokémon there
   * reaches its level (or until that region is started).
   */
  locked?: boolean
}

export const giftsOf = (save: SaveData): GiftsSave => save.gifts ?? { done: [] }

/** This message's gifts are in the save already. */
export const giftsOpened = (save: SaveData, messageId: number): boolean =>
  giftsOf(save).done.includes(messageId)

/**
 * Gifts go into the save: each item into its region's Bag, Pokédollars to its ₽, each Pokémon (a new one, at full HP,
 * at its level within the game's cap, whatever copies the player has) into its region's Box — and the team, when that
 * region is the one being played and has room. Gifts the game doesn't know (an item or species since removed) are left
 * out. The developer's gifts (below) and the invite rewards (engine/invites.ts) both put theirs away here.
 * Heart Scales never go into the save: only a message's claim pays them (on the server), so `scales` says it did and
 * they show among what arrived; otherwise they're left out.
 */
export function placeGifts(
  save: SaveData,
  data: GameData,
  gifts: readonly Gift[],
  now: number,
  newId: () => string,
  scales = false,
): { save: SaveData; landed: GiftLanded[] } {
  let next = save
  const landed: GiftLanded[] = []
  for (const gift of gifts) {
    if (gift.kind === 'heartScales') {
      if (scales) landed.push({ gift, region: regionOf(next), moved: false, scales: true })
      continue
    }
    const region = giftLanding(next, data, gift.region)
    const moved = gift.region !== GIFT_LATEST && gift.region !== GIFT_CURRENT && gift.region !== region
    if (gift.kind === 'item') {
      if (!data.items[gift.key]) continue
      next = addToBag(next, region, gift.key, Math.min(GIFT_QTY_MAX, gift.qty))
      landed.push({ gift, region, moved })
      continue
    }
    if (gift.kind === 'gold') {
      next = addGold(next, region, Math.min(GIFT_GOLD_MAX, gift.amount))
      landed.push({ gift, region, moved })
      continue
    }
    if (!data.species[gift.dex]) continue
    const inst = createInstance(gift.dex, gift.level, data, newId(), now)
    if (gift.shiny) inst.shiny = true
    // Its outfit (docs/59), only while outfits are on: off, the same gift brings the plain Pokémon.
    if (gift.outfit && outfitsOn(data) && hasOutfit(gift.outfit, inst.dex)) inst.outfit = gift.outfit
    // Its family's hidden talent, at the wild odds (docs/51); a legendary always.
    if (rollTalentFor(data, inst.dex, inst.id)) inst.talent = true
    const dexBefore = region === regionOf(next) ? next.pokedex : (next.parked?.[region]?.pokedex ?? [])
    const teamBefore = region === regionOf(next) ? next.team.length : null
    const put = addToRegion(next, data, region, inst)
    if (!put) continue
    next = put.save
    landed.push({
      gift: { ...gift, level: inst.level },
      region,
      moved,
      isNew: !dexBefore.includes(gift.dex),
      joinedTeam: teamBefore != null && next.team.length > teamBefore,
    })
  }
  return { save: next, landed }
}

/**
 * A message's gifts go into the save, once (placeGifts). Null when this message's gifts are in the save already. Its
 * Heart Scales are in the wallet already (the claim paid them); they show while Friendship is on for the player.
 */
export function applyGifts(
  save: SaveData,
  data: GameData,
  messageId: number,
  gifts: readonly Gift[],
  now: number,
  newId: () => string,
): { save: SaveData; landed: GiftLanded[] } | null {
  if (giftsOpened(save, messageId)) return null
  const scales = eventOpenTo(data.config.friendship?.access, data)
  const { save: next, landed } = placeGifts(save, data, gifts, now, newId, scales)
  const g = giftsOf(next)
  return { save: { ...next, gifts: { ...g, done: [messageId, ...g.done].slice(0, DONE_KEPT) } }, landed }
}

/** Items into a region's Bag: the live one at the top level, a parked one in `save.parked`. */
function addToBag(save: SaveData, region: RegionId, key: string, qty: number): SaveData {
  if (region === regionOf(save))
    return { ...save, inventory: { ...save.inventory, [key]: (save.inventory[key] ?? 0) + qty } }
  const block = save.parked?.[region]
  if (!block) return save
  return {
    ...save,
    parked: {
      ...save.parked,
      [region]: { ...block, inventory: { ...block.inventory, [key]: (block.inventory[key] ?? 0) + qty } },
    },
  }
}

/** Pokédollars to a region's ₽: each region has its own (engine/regions.ts). */
function addGold(save: SaveData, region: RegionId, amount: number): SaveData {
  if (region === regionOf(save)) return { ...save, gold: save.gold + amount }
  const block = save.parked?.[region]
  if (!block) return save
  return { ...save, parked: { ...save.parked, [region]: { ...block, gold: block.gold + amount } } }
}

/** The rules pop-up opens once, before the first gift does (docs/15 §20). */
export const giftRulesDue = (save: SaveData, data: GameData): boolean =>
  giftsOn(data) && !giftsOf(save).rulesSeen

export const markGiftRulesSeen = (save: SaveData): SaveData => ({
  ...save,
  gifts: { ...giftsOf(save), rulesSeen: true },
})
