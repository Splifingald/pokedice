// A gym battle's type (docs/67): which of the 18 gym stages it is fought on. The data has no "speciality" field, so
// it is read from the team, the way a player would: the type most of its Pokémon share. A few leaders' teams say
// otherwise than their gym does (Agatha's poison team in a Ghost post), so they are named here.
import type { GameData, PokeType, TrainerMon } from './types'

/**
 * Trainers whose team doesn't show their gym's type, by name (names are stable across the bundled and remote data;
 * a trainer renamed in the admin falls back to their team).
 */
export const GYM_TYPE_BY_NAME: Readonly<Record<string, PokeType>> = {
  'Elite Four Agatha': 'ghost',
  'Elite Four Koga': 'poison',
  'Champion Lance': 'dragon',
  Mela: 'fire',
  Eri: 'fighting',
  Giacomo: 'dark',
  Lusamine: 'fairy',
  N: 'dark',
}

/** A Pokémon's types as its trainer would count them: Normal/Flying birds are Flying (Falkner's Pidgey). */
function countedTypes(type1: PokeType, type2: PokeType | null): PokeType[] {
  if (!type2) return [type1]
  if (type1 === 'normal') return [type2]
  if (type2 === 'normal') return [type1]
  return [type1, type2]
}

/**
 * The type of a gym battle's stage: the trainer's named type, else the type most of the team share; a tie goes to
 * the strongest Pokémon's (the highest level, the last of equals), its first type first. Null for an empty team.
 */
export function gymTypeOf(
  trainerName: string,
  team: readonly TrainerMon[],
  data: Pick<GameData, 'species'>,
): PokeType | null {
  const named = GYM_TYPE_BY_NAME[trainerName]
  if (named) return named
  const count = new Map<PokeType, number>()
  let ace: TrainerMon | null = null
  for (const m of team) {
    const s = data.species[m.dex]
    if (!s) continue
    for (const t of countedTypes(s.type1, s.type2)) count.set(t, (count.get(t) ?? 0) + 1)
    if (!ace || m.level >= ace.level) ace = m
  }
  if (!count.size) return null
  const best = Math.max(...count.values())
  const tied = [...count].filter(([, n]) => n === best).map(([t]) => t)
  if (tied.length === 1) return tied[0] ?? null
  const a = ace && data.species[ace.dex]
  const aceTypes = a ? countedTypes(a.type1, a.type2) : []
  return aceTypes.find((t) => tied.includes(t)) ?? tied[0] ?? null
}
