// Alola's island trials (docs/62 §6): the seven captains' battles become a fight against the trial's Totem Pokémon,
// bigger, with ×2 HP and a die more (its aura), calling its allies one at a time. The trial is won when the Totem
// falls (its allies flee); its rewards are the captain's gym's. Vast Poni Canyon's Kommo-o is a trial of its own, a gym
// row there only for it. Never in Extreme mode, where the captains stay trainer battles.
import type { FoeSeed } from './battle'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { regionOf } from './regions'
import { POKE_TYPES, type AreaProgress, type DieType, type GameData, type PokeType, type SaveData, type TrainerMon, type TrialDef } from './types'

/** Island trials are switched on for whoever is playing. */
export const trialsOn = (data: GameData): boolean => eventOpenTo(data.config.trials?.access, data)

/** The gym row exists only as a trial (Vast Poni Canyon's): left out while the switch is off. */
export const trialOnlyGym = (data: GameData, trainerId: string): boolean =>
  !!data.config.trials?.trials?.some((t) => t.own && t.trainerId === trainerId)

/** The trial fought instead of this gym battle, while the switch is on and outside Extreme mode; else null. */
export function trialOf(data: GameData, trainerId: string, save?: SaveData | null): TrialDef | null {
  if (!trialsOn(data) || isExtreme(save)) return null
  return data.config.trials?.trials?.find((t) => t.trainerId === trainerId && data.species[t.totem]) ?? null
}

/** A trial by its id. */
export const trialById = (data: GameData, id: string | null | undefined): TrialDef | null =>
  (id && data.config.trials?.trials?.find((t) => t.id === id)) || null

/** The trial's foes as its card shows them: the Totem, then the allies it can call. */
export function trialTeam(def: TrialDef, data: GameData): TrainerMon[] {
  const calls = Math.max(0, Math.floor(data.config.trials?.calls ?? 2))
  return [
    { dex: def.totem, level: def.level },
    ...def.allies.filter((d) => data.species[d]).slice(0, calls).map((dex) => ({ dex, level: def.allyLevel })),
  ]
}

/** The trial's foes as they fight: the Totem with its aura (×HP, extra dice of its type), then its allies. */
export function trialFoes(def: TrialDef, data: GameData, team: readonly TrainerMon[] = trialTeam(def, data)): FoeSeed[] {
  const cfg = data.config.trials
  const sp = data.species[def.totem]
  const extra = Math.max(0, Math.floor(cfg?.extraDice ?? 1))
  return team.map((m, i) =>
    i === 0
      ? {
          dex: m.dex,
          level: m.level,
          hpTimes: Math.max(1, cfg?.hpTimes ?? 2),
          ...(extra > 0 && sp && { extraDice: Array.from({ length: extra }, () => sp.type1 as DieType) }),
          aura: 'totem' as const,
          ...(m.talent && { talent: true }),
        }
      : { dex: m.dex, level: m.level, ...(m.talent && { talent: true }) },
  )
}

/**
 * Z-Crystals (docs/62 §6, the user's call of 2026-11-01): with the island trials on, each trial and grand trial gives
 * its type's crystal, eighteen in all, and a Z-Move is only for a Pokémon of a type whose crystal is held; Z-Moves open
 * with the first one. With the trials off, Z-Moves open with Lana's badge, for every type (docs/35).
 */
export const zCrystalsOn = (data: GameData): boolean => trialsOn(data)

/** The Z-Crystal this battle gives once won, or null. */
export function crystalOf(data: GameData, trainerId: string): PokeType | null {
  const cfg = data.config.trials
  return cfg?.trials?.find((t) => t.trainerId === trainerId)?.crystal ?? cfg?.crystals?.[trainerId] ?? null
}

/** Alola's progress, played now or parked. */
const alolaProgress = (save: SaveData): Record<string, AreaProgress> =>
  regionOf(save) === 'alola' ? save.areaProgress : (save.parked?.alola?.areaProgress ?? {})

/** The Z-Crystals this save holds, in type order: those of the Alola battles won that give one. */
export function zCrystalsOf(save: SaveData, data: GameData): PokeType[] {
  const held = new Set<PokeType>()
  for (const p of Object.values(alolaProgress(save)))
    for (const id of p?.gymsDefeated ?? []) {
      const c = crystalOf(data, id)
      if (c) held.add(c)
    }
  return POKE_TYPES.filter((t) => held.has(t))
}
