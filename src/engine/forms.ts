/**
 * Forms: regional forms, Mega Evolutions and the battle forms of Giratina and Arceus.
 *
 * Every form is a species row of its own (`Species.form` says which kind), numbered past the National Dex — PokeAPI's
 * own ids (Alolan Rattata is 10091, Mega Venusaur 10033), so sprites and names line up with it. A **regional** form is
 * a Pokémon like any other: it is caught, levels, evolves and has its Pokédex entry. **Mega** and **battle** forms are
 * looks a Pokémon takes in a fight and loses when it ends: nothing about them is ever saved.
 */
import type { EnemyPlan } from './battle'
import { getRegion, regionOf } from './regions'
import type { DieType, Evolution, GameData, PokeType, RegionId, SaveData, Species, TrainerRole } from './types'

/** A form that only exists inside a battle (a Mega Evolution, a Gigantamax, Giratina's Origin Forme, Arceus's types). */
export const isBattleForm = (s: Species | null | undefined): boolean =>
  s?.form?.kind === 'mega' || s?.form?.kind === 'gmax' || s?.form?.kind === 'battle'

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

/** The Gigantamax form of a species (none for most). */
export const gmaxFormsOf = (data: GameData, dex: number): Species[] => formsOf(data, dex).filter((s) => s.form!.kind === 'gmax')

/** Giratina's Origin Forme, Darmanitan's Zen Mode…: the form a Pokémon takes below half HP. */
export const lowHpFormOf = (data: GameData, dex: number): Species | undefined =>
  formsOf(data, dex).find((s) => s.form!.kind === 'battle' && s.form!.trigger === 'lowHp')

/** Arceus's types, Silvally's Memories, Ogerpon's masks: the forms picked from the battle menu. */
export const choiceFormsOf = (data: GameData, dex: number): Species[] =>
  formsOf(data, dex).filter((s) => s.form!.kind === 'battle' && s.form!.trigger === 'choice')

const typesOf = (s: Species): PokeType[] => (s.type2 ? [s.type1, s.type2] : [s.type1])

/** The type every die takes in a menu form: the one it adds (Ogerpon's mask), else its only type (Arceus, Silvally). */
export const choiceFormDie = (form: Species): PokeType => form.type2 ?? form.type1

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
  return reached(save, data, data.config.megaEvolution.region)
}

/** Gigantamax is on once the player has reached `gigantamax.region` (Galar), and then everywhere. */
export function gmaxUnlocked(save: SaveData, data: GameData): boolean {
  return reached(save, data, data.config.gigantamax.region)
}

function reached(save: SaveData, data: GameData, regionId: RegionId): boolean {
  const gate = getRegion(data, regionId)
  if (!gate) return false
  const started = new Set<RegionId>([regionOf(save), ...Object.keys(save.parked ?? {})])
  return data.regions.some((r) => started.has(r.id) && r.orderIndex >= gate.orderIndex)
}

/**
 * What a foe does with these mechanics. A type changer (Arceus, Silvally, Ogerpon) picks its type against yours. A
 * trainer's ace — a leader's, the Elite Four's, a Champion's: the last of its strongest — Gigantamaxes in Galar and
 * Mega Evolves (Primal Reversion, Ultra Burst) in the regions whose games have it (Hoenn, Kalos, Alola), at Lv.50 like
 * yours. Only once the player has the mechanic too: a foe never shows one first.
 */
export function enemyPlanFor(
  save: SaveData,
  data: GameData,
  foe: { dex: number; level: number },
  trainer: { regionId: RegionId; role: TrainerRole; ace: boolean } | null,
): EnemyPlan | null {
  const plan: EnemyPlan = {}
  if (choiceFormsOf(data, foe.dex).length) plan.formChanges = true
  const cfg = data.config
  if (trainer?.ace && cfg.megaEvolution.trainerRoles.includes(trainer.role)) {
    const gmax = gmaxFormsOf(data, foe.dex)[0]
    const mega = megaOptions(data, foe.dex, foe.level)[0]
    if (gmax && gmaxUnlocked(save, data) && cfg.gigantamax.trainerRegions.includes(trainer.regionId)) plan.gmax = gmax.dex
    else if (mega && megaUnlocked(save, data) && cfg.megaEvolution.trainerRegions.includes(trainer.regionId)) plan.mega = mega.dex
  }
  return Object.keys(plan).length ? plan : null
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
