// Double battles (docs/33): when an encounter is fought two against two. The admin's switch and regions decide where,
// the wild odds how often; duo trainers (the Twins, Tate & Liza…) always are. The battle itself is engine/battle.ts.
import { rollTalent } from './talents'
import { DEFAULT_CONFIG } from './defaults'
import { rollWild, type Encounter, type EncounterContext } from './encounters'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { regionOfArea } from './regions'
import type { Rng } from './rng'
import { teamOf } from './run'
import { worldOfArea } from './worldList'
import type { DoubleBattlesConfig, GameData, RegionId, SaveData, Trainer } from './types'

export const doublesConfig = (data: GameData): DoubleBattlesConfig => ({
  ...DEFAULT_CONFIG.doubleBattles,
  ...(data.config.doubleBattles ?? {}),
})

/** Switched on for whoever is playing (Off / On for admin / On for everyone). */
export const doublesOn = (data: GameData): boolean => eventOpenTo(data.config.doubleBattles?.access, data)

/** Double battles happen in this region, for whoever is playing. */
export const doublesIn = (data: GameData, regionId: RegionId): boolean =>
  doublesOn(data) && doublesConfig(data).regions.includes(regionId)

/** A trainer that fights 2 v 2: a duo with two Pokémon or more, never the Elite Four or a Champion. */
export const fightsDouble = (t: Pick<Trainer, 'duo' | 'role' | 'team'>): boolean =>
  !!t.duo && t.team.length >= 2 && t.role !== 'elite' && t.role !== 'champion'

/**
 * Two of the team able to fight. A wild pair needs them: a team of one, or with one left standing, never meets two wild
 * Pokémon (the user, 2026-10-31). A duo trainer still fights it 1 v 2: its pair is the trainer itself.
 */
export const pairAble = (save: SaveData): boolean => teamOf(save).filter((p) => p.currentHp > 0).length >= 2

/**
 * The encounter as it will be fought: a wild Pokémon may come with a partner (`wildChance` %, rolled from the area's
 * pool like any wild one, the new-Pokémon pity included) when two of the team can fight, a duo trainer or Tate & Liza
 * with `double`. Never in Extreme mode, a small world, an area with a special mode (the portal run, the nightmare) or
 * the Elite Rebattle, and never while the switch is off or the region isn't ticked: the rng is then left untouched.
 */
export function asDouble(enc: Encounter, ctx: EncounterContext, save: SaveData, rng: Rng): Encounter {
  const { area, data } = ctx
  if (isExtreme(save) || worldOfArea(data, area) || area.mode || !doublesIn(data, regionOfArea(area))) return enc
  if (enc.kind === 'wild') {
    // A Pokémon that posed as a find comes alone (docs/61 §3).
    if (enc.partner || enc.disguisedAs || !pairAble(save) || rng.next() * 100 >= doublesConfig(data).wildChance) return enc
    const partner = rollWild(ctx, rng)
    // A roamer turning up instead is a legendary on its own: no pair this time.
    if (partner?.kind !== 'wild') return enc
    const { dex, level, isNew, shiny } = partner
    const talent = rollTalent(data, dex, rng)
    return { ...enc, partner: { dex, level, isNew, ...(shiny && { shiny }), ...(talent && { talent }) } }
  }
  if (enc.kind === 'trainer' || (enc.kind === 'gym' && !enc.rebattle)) {
    const t = data.trainers[enc.trainerId]
    return t && fightsDouble({ ...t, team: enc.team }) ? { ...enc, double: true } : enc
  }
  return enc
}

/**
 * A wild pair drawn earlier, as it is fought now: the first one alone when the team no longer has two able (one put in
 * the box or the day care while the card waited, a save resumed on it). Anything else as it is.
 */
export function fitWildPair(enc: Encounter, save: SaveData): Encounter {
  if (enc.kind !== 'wild' || !enc.partner || pairAble(save)) return enc
  const { partner: _partner, ...alone } = enc
  return alone
}

/** The encounter is a double battle. */
export const isDoubleEncounter = (enc: Encounter | null | undefined): boolean =>
  !!enc && ((enc.kind === 'wild' && !!enc.partner) || ((enc.kind === 'trainer' || enc.kind === 'gym') && !!enc.double))
