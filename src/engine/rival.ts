// The rival: the character the player didn't pick. An area can list one version of a trainer per starter
// (Trainer.rivalOf); a player only ever meets the version for their own starter, under the rival's name and sprite.
import type { Area, GameData, SaveData, Trainer } from './types'

export type Character = 'red' | 'green'

/** What rival versions depend on: the starter picked on day one (the first Pokédex entry) and the player's character. */
export interface PlayerSide {
  starterDex: number | null
  character: Character | null
}

export const playerSideOf = (save: SaveData): PlayerSide => ({
  starterDex: save.pokedex[0] ?? null,
  character: save.player?.character ?? null,
})

/** Red plays against Green and the other way round; a player with no character yet counts as Red. */
export const rivalCharacter = (side?: PlayerSide | null): Character => (side?.character === 'green' ? 'red' : 'green')

/**
 * The area's gym / Elite battles for this player, in order: every rival version but the one for their starter is
 * dropped (no match — an unusual starter — keeps the first version).
 */
export function gymsFor(area: Area, data: GameData, side?: PlayerSide | null): string[] {
  const rivals = area.gyms.filter((id) => data.trainers[id]?.rivalOf != null)
  if (!rivals.length) return area.gyms
  const mine = rivals.find((id) => data.trainers[id]!.rivalOf === side?.starterDex) ?? rivals[0]
  return area.gyms.filter((id) => !rivals.includes(id) || id === mine)
}

/**
 * Hoenn's rival is the other character (docs/61 §5.2): May for a player in Red's look, Brendan for one in Green's.
 * Keyed by the trainer's name as the content has it.
 */
const SWAPS: Record<string, { name: string; spriteUrl: string }> = {
  May: { name: 'Brendan', spriteUrl: '/trainers/classes/hoenn/brendan.png' },
}

/** Kanto's rival, whose name is the other character's: "Champion Rival", "Rival Blue". */
const KANTO_RIVAL = /(^|\s)(Rival|Blue)$/

/**
 * A rival version shows the rival's name and sprite ("Champion Blue" → "Champion Green"; May → Brendan for a player in
 * Green's look); other trainers, and the other regions' rivals, are as they are.
 */
export function asSeenBy(t: Trainer, side?: PlayerSide | null): Trainer {
  const swap = SWAPS[t.name]
  if (swap) return side?.character === 'green' ? { ...t, ...swap } : t
  if (t.rivalOf == null || !KANTO_RIVAL.test(t.name)) return t
  const rival = rivalCharacter(side)
  const name = rival === 'red' ? 'Red' : 'Green'
  const title = t.name.split(' ').slice(0, -1).join(' ')
  return { ...t, name: title ? `${title} ${name}` : name, spriteUrl: `/characters/${rival}.png` }
}
