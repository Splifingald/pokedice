// Pokémon posing as items (docs/61 §3): a loot row with a `disguise` is dealt and shown as the find it looks like (a
// Poké Ball on the ground), and springs out as a wild Pokémon once picked up: Voltorb and Electrode in the power plants
// and hideouts, Foongus and Amoonguss across Unova. Only while the switch is on; off, the row is left out of the loot.
import type { Encounter } from './encounters'
import { eventOpenTo } from './events'
import type { GameData, LootEntry } from './types'

/** Switched on for whoever is playing. */
export const disguisesOn = (data: GameData): boolean => eventOpenTo(data.config.disguises?.access, data)

/** A loot row that can be dealt now: any plain find, and a disguise only while the switch is on and its Pokémon exists. */
export const lootDealable = (e: LootEntry, data: GameData): boolean =>
  !e.disguise || (disguisesOn(data) && !!data.species[e.disguise.dex])

/** A wild Pokémon still posing as the find it was dealt as: shown on the find's screen, not fought yet. */
export const isDisguisedFind = (enc: Encounter | null | undefined): boolean => enc?.kind === 'wild' && !!enc.disguisedAs
