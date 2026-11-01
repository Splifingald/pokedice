// Alola's island trials (docs/62 §6): the seven captains' battles become a fight against the trial's Totem Pokémon,
// bigger, with ×2 HP and a die more (its aura), calling its allies one at a time. The trial is won when the Totem
// falls (its allies flee); its rewards are the captain's gym's. Vast Poni Canyon's Kommo-o is a trial of its own, a gym
// row there only for it. Never in Extreme mode, where the captains stay trainer battles.
import type { FoeSeed } from './battle'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import type { DieType, GameData, SaveData, TrainerMon, TrialDef } from './types'

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
