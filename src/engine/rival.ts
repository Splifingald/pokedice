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

/** A rival version shows the rival's name and sprite ("Champion Blue" → "Champion Green"); other trainers are as is. */
export function asSeenBy(t: Trainer, side?: PlayerSide | null): Trainer {
  if (t.rivalOf == null) return t
  const rival = rivalCharacter(side)
  const name = rival === 'red' ? 'Red' : 'Green'
  const title = t.name.split(' ').slice(0, -1).join(' ')
  return { ...t, name: title ? `${title} ${name}` : name, spriteUrl: `/characters/${rival}.png` }
}
