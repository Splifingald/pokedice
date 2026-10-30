// Fossils: found in the field, they go straight to the Box as the Pokémon they hold and revive after a while.
import { createInstance, instanceMaxHp } from './progression'
import { createRng } from './rng'
import type { GameData, ItemDef, PokemonInstance, SaveData } from './types'

export const isReviving = (p: Pick<PokemonInstance, 'revivesAt'>): boolean => p.revivesAt != null

/** The fossil's Pokémon, in the Box at its level, reviving until `now + hours`. */
export function addFossil(save: SaveData, item: ItemDef, data: GameData, now: number, id: string): SaveData {
  if (item.effect.kind !== 'fossil' || !data.species[item.effect.dex]) return save
  const inst = createInstance(item.effect.dex, item.effect.level, data, id, now)
  const revivesAt = now + Math.max(0, item.effect.hours) * 3_600_000
  return { ...save, box: [...save.box, { ...inst, revivesAt, fossil: item.key }] }
}

/** FNV-1a: a Pokémon's id as a seed. */
const idSeed = (id: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * Whether this fossil revives shiny: game_config's `fossilShinyChance`, its own odds, which the Shiny Charm and a Shiny
 * Parade never touch. The roll is seeded by the Pokémon's id, so it is settled from the find: reloading before the
 * revived save is written can't roll it again. Never in Extreme mode, which has no shiny Pokémon (docs/48).
 */
export function fossilRevivesShiny(save: Pick<SaveData, 'mode'>, p: Pick<PokemonInstance, 'id'>, data: GameData): boolean {
  const chance = Math.max(0, Math.min(1, data.config.fossilShinyChance ?? 0))
  return save.mode !== 'extreme' && chance > 0 && createRng(idSeed(p.id)).next() < chance
}

/** Fossils whose time has come are revived: full HP, into the Pokédex, shiny at the fossil odds. `revived` lists them. */
export function reviveFossils(save: SaveData, data: GameData, now: number): { save: SaveData; revived: PokemonInstance[] } {
  const revived: PokemonInstance[] = []
  const box = save.box.map((p) => {
    if (p.revivesAt == null || p.revivesAt > now) return p
    const { revivesAt: _t, fossil: _f, ...rest } = p
    const done = {
      ...rest,
      currentHp: instanceMaxHp(rest, data),
      ...(fossilRevivesShiny(save, p, data) && { shiny: true }),
    }
    revived.push(done)
    return done
  })
  if (!revived.length) return { save, revived }
  const pokedex = [...save.pokedex]
  for (const p of revived) if (!pokedex.includes(p.dex)) pokedex.push(p.dex)
  return { save: { ...save, box, pokedex }, revived }
}
