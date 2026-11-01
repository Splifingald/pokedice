// Kalos hordes (docs/62 §5): now and then a wild card is five of one species (one in ten with another among them),
// a few levels down, fought two at a time on the doubles engine (docs/33), the next one taking a fallen one's spot.
// Each rolls the shiny odds on its own; one throw at the end goes to the shiny one if there is one, else the last one
// K.O.'d. Only while two of the team can fight, at most `perArea` a visit, never in Extreme mode, a small world or an
// area with a mode.
import { isLegendary } from './breeding'
import { rollShiny, shinyLocked, type Encounter, type EncounterContext, type WildPartner } from './encounters'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { regionOfArea } from './regions'
import type { Rng } from './rng'
import { teamOf } from './run'
import { rollTalent } from './talents'
import { worldOfArea } from './worldList'
import type { Area, AreaProgress, GameData, SaveData } from './types'

/** Hordes are switched on for whoever is playing. */
export const hordesOn = (data: GameData): boolean => eventOpenTo(data.config.hordes?.access, data)

/** This area deals hordes: the switch on, one of its regions, a plain area of the main game. */
export const hordesIn = (data: GameData, area: Area): boolean =>
  hordesOn(data) && !area.mode && !worldOfArea(data, area) && !!data.config.hordes?.regions?.includes(regionOfArea(area))

/** Hordes already met this round in the area. */
export const hordesThisRound = (p: AreaProgress): number => (p.hordes && p.hordes.round === (p.roundsDone ?? 0) ? p.hordes.n : 0)

/** One more horde met this round (the store notes it once dealt). */
export function noteHorde(save: SaveData, areaId: string): SaveData {
  const p = save.areaProgress[areaId]
  if (!p) return save
  const round = p.roundsDone ?? 0
  return { ...save, areaProgress: { ...save.areaProgress, [areaId]: { ...p, hordes: { round, n: hordesThisRound(p) + 1 } } } }
}

/** The pool entries that can make a horde: not the rarest (weight ≤ `minWeight`), never a legendary. */
function hordeEntries(ctx: EncounterContext) {
  const min = ctx.data.config.hordes?.minWeight ?? 2
  return ctx.area.wildPool.filter((e) => e.weight > min && ctx.data.species[e.dex] && !isLegendary(ctx.data, e.dex))
}

/**
 * A wild card as a horde, or as it was. Rolled only where hordes come and the card could be one (a plain wild card of
 * a species common enough, no partner, not a disguise): the rng is untouched otherwise.
 */
export function asHorde(enc: Encounter, ctx: EncounterContext, save: SaveData, rng: Rng): Encounter {
  const cfg = ctx.data.config.hordes
  if (enc.kind !== 'wild' || enc.partner || enc.disguisedAs || enc.horde || !cfg) return enc
  if (isExtreme(save) || !hordesIn(ctx.data, ctx.area)) return enc
  if (teamOf(save).filter((p) => p.currentHp > 0).length < 2) return enc
  if (hordesThisRound(ctx.progress) >= Math.max(0, cfg.perArea)) return enc
  const entries = hordeEntries(ctx)
  if (!entries.some((e) => e.dex === enc.dex)) return enc
  if (rng.next() * 100 >= cfg.chance) return enc
  const level = Math.max(2, enc.level - Math.max(0, cfg.levelDrop))
  const others = entries.filter((e) => e.dex !== enc.dex)
  const mixed = others.length > 0 && rng.next() * 100 < cfg.mixedChance
  const size = Math.max(2, Math.floor(cfg.size))
  const horde: WildPartner[] = []
  for (let i = 1; i < size; i++) {
    const dex = mixed && i === size - 1 ? (rng.weighted(others, (e) => e.weight)?.dex ?? enc.dex) : enc.dex
    const lv = Math.max(2, level - rng.int(0, 1))
    const shiny = !shinyLocked(ctx.data, dex) && rollShiny(ctx.data, rng, ctx.shinyBoost, ctx.shinyChance)
    const talent = rollTalent(ctx.data, dex, rng)
    horde.push({ dex, level: lv, isNew: !ctx.pokedex.includes(dex), ...(shiny && { shiny }), ...(talent && { talent }) })
  }
  return { ...enc, level, horde }
}

/**
 * Which one of a horde gets the throw (docs/62 §5): the first shiny one K.O.'d, else the last one K.O.'d. `kos`: the
 * fight's K.O.s in order.
 */
export function hordeThrowAt<T extends { uid: string; shiny: boolean }>(kos: readonly T[]): T | null {
  return kos.find((k) => k.shiny) ?? kos[kos.length - 1] ?? null
}
