// The players' suggestions of 2026-11-04/05 (docs/67), five small helps, each behind its own admin switch (docs/15 §20),
// Off by default:
// - raidFavourites: a heart on a Pokémon; the raid team picker lists the favourites first (Ash).
// - shinyTiles: a shiny's tile in the Box on a gold ground, not only its star (Ash).
// - passOwned: PASS on the catch panel, for a Pokémon already owned (Ash).
// - routeShinies: the area's Pokémon grid marks a species already in the shiny Pokédex (Ceurana).
// - autoCure: in auto-mode, a stunned Pokémon with its cure in the Bag gets a few seconds' HEAL button (Ash).
// All of them live on the player's device: no server function acts for them, so none reads their switches.
import { activeBattler, type BattleState } from './battle'
import { eventOpenTo } from './events'
import { usableIn } from './items'
import { stunKind } from './status'
import type { GameData, SaveData } from './types'

export const raidFavouritesOn = (data: GameData): boolean =>
  eventOpenTo(data.config.raidFavourites?.access, data)
export const shinyTilesOn = (data: GameData): boolean => eventOpenTo(data.config.shinyTiles?.access, data)
export const passOwnedOn = (data: GameData): boolean => eventOpenTo(data.config.passOwned?.access, data)
export const routeShiniesOn = (data: GameData): boolean => eventOpenTo(data.config.routeShinies?.access, data)
export const autoCureOn = (data: GameData): boolean => eventOpenTo(data.config.autoCure?.access, data)

/** How long auto-mode holds a stunned turn for its HEAL button (× the battle pace). */
export const AUTO_CURE_MS = 3000

/** The most favourites a save keeps (the schema's bound too). */
export const MAX_FAVOURITES = 600

/** Whether this Pokémon (an instance id) wears the heart. */
export const isFavourite = (save: Pick<SaveData, 'favourites'>, id: string): boolean =>
  !!save.favourites?.includes(id)

/**
 * The heart put on or taken off. Ids of Pokémon no longer in any Box (traded, released) are dropped on the way, so the
 * list never grows past what the save holds; the same save back when nothing changes (an unknown id, the list full).
 */
export function toggleFavourite(save: SaveData, id: string): SaveData {
  const held = new Set(save.box.map((p) => p.id))
  for (const block of Object.values(save.parked ?? {})) for (const p of block?.box ?? []) held.add(p.id)
  if (!held.has(id)) return save
  const kept = (save.favourites ?? []).filter((x) => x !== id && held.has(x))
  const on = !isFavourite(save, id)
  if (on && kept.length >= MAX_FAVOURITES) return save
  return { ...save, favourites: on ? [...kept, id] : kept }
}

/**
 * PASS on the catch panel: the switch, and a Pokémon already owned, by Idle's rule (`idleOwns`, docs/36): a plain one
 * once its species is in the Pokédex, a shiny once a shiny of its species is in the Box. A new one is never passed by
 * a slip of the thumb.
 */
export function canPassCatch(
  save: Pick<SaveData, 'pokedex' | 'box'>,
  data: GameData,
  dex: number,
  shiny = false,
): boolean {
  if (!passOwnedOn(data)) return false
  return shiny ? save.box.some((m) => m.dex === dex && m.shiny) : save.pokedex.includes(dex)
}

/**
 * Auto-mode's cure (Ash's ask): the item its HEAL button would use on the Pokémon out, stunned (frozen or paralysed)
 * this turn, or null: not stunned, an item already used this turn, the bag shut (the whiteout), or no cure for it in the
 * bag. The narrowest cure first (a Paralyze Heal before a Full Heal), then the cheapest, so the rarer one is kept.
 */
export function autoCureItem(
  state: BattleState,
  data: GameData,
  inventory: Readonly<Record<string, number>> | undefined,
): string | null {
  if (state.phase !== 'player_stunned' || state.itemUsedThisTurn || state.noBag) return null
  const stun = stunKind(activeBattler(state).status)
  if (!stun) return null
  const cures = Object.entries(inventory ?? {}).flatMap(([key, n]) => {
    const item = data.items[key]
    if (n <= 0 || !item || !usableIn(item, 'battle')) return []
    const fx = item.effect
    return fx.kind === 'cure' && fx.statuses.includes(stun)
      ? [{ key, width: fx.statuses.length, price: item.price }]
      : []
  })
  cures.sort((a, b) => a.width - b.width || a.price - b.price || a.key.localeCompare(b.key))
  return cures[0]?.key ?? null
}
