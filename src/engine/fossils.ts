// Fossils: found in the field, they go straight to the Box as the Pokémon they hold and revive after a while.
import { createInstance, instanceMaxHp } from './progression'
import type { GameData, ItemDef, PokemonInstance, SaveData } from './types'

export const isReviving = (p: Pick<PokemonInstance, 'revivesAt'>): boolean => p.revivesAt != null

/** The fossil's Pokémon, in the Box at its level, reviving until `now + hours`. */
export function addFossil(save: SaveData, item: ItemDef, data: GameData, now: number, id: string): SaveData {
  if (item.effect.kind !== 'fossil' || !data.species[item.effect.dex]) return save
  const inst = createInstance(item.effect.dex, item.effect.level, data, id, now)
  const revivesAt = now + Math.max(0, item.effect.hours) * 3_600_000
  return { ...save, box: [...save.box, { ...inst, revivesAt, fossil: item.key }] }
}

/** Fossils whose time has come are revived: full HP, into the Pokédex. `revived` lists them. */
export function reviveFossils(save: SaveData, data: GameData, now: number): { save: SaveData; revived: PokemonInstance[] } {
  const revived: PokemonInstance[] = []
  const box = save.box.map((p) => {
    if (p.revivesAt == null || p.revivesAt > now) return p
    const { revivesAt: _t, fossil: _f, ...rest } = p
    const done = { ...rest, currentHp: instanceMaxHp(rest, data) }
    revived.push(done)
    return done
  })
  if (!revived.length) return { save, revived }
  const pokedex = [...save.pokedex]
  for (const p of revived) if (!pokedex.includes(p.dex)) pokedex.push(p.dex)
  return { save: { ...save, box, pokedex }, revived }
}
