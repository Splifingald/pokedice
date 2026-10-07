/**
 * Forms: regional forms, Mega Evolutions and the battle forms of Giratina and Arceus.
 *
 * Every form is a species row of its own (`Species.form` says which kind), numbered past the National Dex — PokeAPI's
 * own ids (Alolan Rattata is 10091, Mega Venusaur 10033), so sprites and names line up with it. A **regional** form is
 * a Pokémon like any other: it is caught, levels, evolves and has its Pokédex entry. **Mega** and **battle** forms are
 * looks a Pokémon takes in a fight and loses when it ends: nothing about them is ever saved.
 */
import { getRegion, regionOf } from './regions'
import type { DieType, Evolution, GameData, PokeType, RegionId, SaveData, Species } from './types'

/** A form that only exists inside a battle (a Mega Evolution, Giratina's Origin Forme, Arceus's types). */
export const isBattleForm = (s: Species | null | undefined): boolean => s?.form?.kind === 'mega' || s?.form?.kind === 'battle'

/** The Pokémon a battle form is a look of (its own dex for anything else). */
export const baseOfForm = (data: GameData, dex: number): number => {
  const s = data.species[dex]
  return s && isBattleForm(s) ? s.form!.of : dex
}

/** The dex number shown next to a name: a form shows its species' National Dex number (Alolan Rattata is #019). */
export const nationalDex = (data: GameData, dex: number): number => data.species[dex]?.form?.of ?? dex

/** Battle forms by the Pokémon they come from, built once per GameData. */
const index = new WeakMap<GameData, Map<number, Species[]>>()
function formsOf(data: GameData, dex: number): Species[] {
  let map = index.get(data)
  if (!map) {
    map = new Map()
    for (const s of data.speciesList) {
      if (!isBattleForm(s)) continue
      const list = map.get(s.form!.of) ?? []
      list.push(s)
      map.set(s.form!.of, list)
    }
    index.set(data, map)
  }
  return map.get(dex) ?? []
}

/** The Mega Evolutions of a species — two for Charizard, Mewtwo and Raichu (X and Y), none for most. */
export const megaFormsOf = (data: GameData, dex: number): Species[] => formsOf(data, dex).filter((s) => s.form!.kind === 'mega')

/** Giratina's Origin Forme: the form a Pokémon takes below half HP. */
export const lowHpFormOf = (data: GameData, dex: number): Species | undefined =>
  formsOf(data, dex).find((s) => s.form!.kind === 'battle' && s.form!.trigger === 'lowHp')

/** Arceus's types: the forms picked from the battle menu. The Pokémon's own form is one of the choices too. */
export const choiceFormsOf = (data: GameData, dex: number): Species[] =>
  formsOf(data, dex).filter((s) => s.form!.kind === 'battle' && s.form!.trigger === 'choice')

const typesOf = (s: Species): PokeType[] => (s.type2 ? [s.type1, s.type2] : [s.type1])

/**
 * The die a Mega Evolution adds: the type it gains by Mega Evolving (Charizard X's Dragon, Gyarados's Dark), or —
 * when it gains none — the Pokémon's first type (Venusaur's Grass, Aggron's Steel).
 */
export function megaDie(base: Species, mega: Species): PokeType {
  const had = new Set(typesOf(base))
  return typesOf(mega).find((t) => !had.has(t)) ?? base.type1
}

/**
 * Mega Evolution is on once the player has reached `megaEvolution.region` (Kalos) — the region started, live or
 * parked — or any region after it. From then on it works everywhere, earlier regions included.
 */
export function megaUnlocked(save: SaveData, data: GameData): boolean {
  const gate = getRegion(data, data.config.megaEvolution.region)
  if (!gate) return false
  const started = new Set<RegionId>([regionOf(save), ...Object.keys(save.parked ?? {})])
  return data.regions.some((r) => started.has(r.id) && r.orderIndex >= gate.orderIndex)
}

/** The Mega forms open to a Pokémon of this species and level (empty below the level, or with none). */
export function megaOptions(data: GameData, dex: number, level: number): Species[] {
  if (level < data.config.megaEvolution.level) return []
  return megaFormsOf(data, dex)
}

/**
 * The evolutions open in a region. A regional evolution (`region`) only happens there, and the one it stands in for
 * (`notInRegion`) happens everywhere else: Pikachu becomes an Alolan Raichu in Alola and a Raichu anywhere else.
 * With no region known, a Pokémon evolves as it would outside every region.
 */
export function evolutionsIn(evos: readonly Evolution[], region?: RegionId | null): Evolution[] {
  return evos.filter((e) => (e.region ? e.region === region : true) && (!e.notInRegion || e.notInRegion !== region))
}

/** The die type a battle-form swap leaves on the Pokémon: one `from` die becomes a `to` die, if it has one. */
export function swapOneDie(dice: readonly DieType[], from: DieType, to: DieType): DieType[] {
  const out = [...dice]
  const i = out.indexOf(from)
  if (i >= 0) out[i] = to
  return out
}
