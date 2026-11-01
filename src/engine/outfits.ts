// Outfits (docs/59): a Pokémon dressed up, Santa Pikachu first. Only how it looks changes: the same species, dice,
// stats and talent. Its one rule is evolution's: it evolves only into a species that has the same outfit drawn.
import { eventOpenTo } from './events'
import type { GameData, PokemonInstance } from './types'

export interface OutfitDef {
  /** The sprite of each species that wears it: Showdown's id style, our own drawings live in sprites-custom/. */
  sprites: Record<number, string>
  /**
   * Drawn by us, so only our sprite copy (VITE_SPRITES_HOST, docs/45) has it: without the copy the game shows the plain
   * species rather than ask Showdown for a file it doesn't have.
   */
  own: boolean
}

/** Every outfit, by key (the instance's `outfit`, the strings' `outfit.<key>`). */
export const OUTFITS: Record<string, OutfitDef> = {
  santa: { sprites: { 25: 'pikachu-santa' }, own: true },
}

export const outfitsOn = (data: GameData): boolean => eventOpenTo(data.config.outfits?.access, data)

/** The outfit an instance wears, when the switch is on and its species has it drawn; null otherwise. */
export function outfitOf(data: GameData, inst: Pick<PokemonInstance, 'dex' | 'outfit'>): string | null {
  const key = inst.outfit
  if (!key || !outfitsOn(data)) return null
  return OUTFITS[key]?.sprites[inst.dex] ? key : null
}

/** Whether a species has this outfit drawn (an outfit Pokémon evolves only into one that has). */
export const hasOutfit = (key: string, dex: number): boolean => !!OUTFITS[key]?.sprites[dex]

/**
 * Whether an instance may evolve into `toDex`: always without an outfit; with one, only when the evolution wears it too
 * (no Santa Raichu is drawn, so Santa Pikachu stays a Pikachu). The tag is kept whatever the switch says, and so is
 * the rule: a switch turned off and on again must not find a Raichu in a Santa hat it can't draw.
 */
export const outfitAllowsEvolution = (inst: Pick<PokemonInstance, 'outfit'>, toDex: number): boolean =>
  !inst.outfit || hasOutfit(inst.outfit, toDex)

/** Every species that can wear an outfit, with the outfit's key (for the admin's gift pickers). */
export const outfitChoices = (dex: number): string[] =>
  Object.entries(OUTFITS)
    .filter(([, o]) => o.sprites[dex])
    .map(([k]) => k)

/** An outfit key a gift or a save may carry: a known one, worn by that species. Anything else is dropped. */
export const cleanOutfit = (key: unknown, dex: number): string | undefined =>
  typeof key === 'string' && hasOutfit(key, dex) ? key : undefined
