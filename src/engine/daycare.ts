// The Pokémon Day Care: residents gain XP in real time (no battles), capped per stay, and never evolve from it. Eggs
// hatch on the spot into the first form of an evolving line, favouring species the player doesn't have yet.
import { createInstance, gainXp, instanceMaxHp } from './progression'
import { createRng, type Rng } from './rng'
import { ownedPokemon } from './run'
import type { DayCareResident, DayCareState, GameData, PokemonInstance, SaveData, Species } from './types'

const MINUTE = 60_000

export const dayCareOf = (save: SaveData): DayCareState => save.dayCare ?? { residents: [], eggClaimed: false }

/** The Day Care appears on the Map once enough species are in the Pokédex. */
export const isDayCareOpen = (save: SaveData, data: GameData) =>
  new Set(save.pokedex).size >= data.config.dayCare.unlockPokedex

/**
 * The unlock tutorial is due: the Day Care is open and the player has never been in. Saves that already used it
 * (a resident or the free Egg) count as visited.
 */
export function dayCareTutorialDue(save: SaveData, data: GameData): boolean {
  if (!isDayCareOpen(save, data)) return false
  const dc = dayCareOf(save)
  return !dc.visited && !dc.eggClaimed && dc.residents.length === 0
}

export const markDayCareVisited = (save: SaveData): SaveData =>
  dayCareOf(save).visited ? save : { ...save, dayCare: { ...dayCareOf(save), visited: true } }

const tickMs = (data: GameData) => Math.max(1, data.config.dayCare.tickMinutes) * MINUTE

/** XP earned so far this stay: xpPerTick for each full tick since drop-off, up to maxXp. */
export function dayCareXp(res: DayCareResident, now: number, data: GameData): number {
  const cfg = data.config.dayCare
  const ticks = Math.floor(Math.max(0, now - res.since) / tickMs(data))
  return Math.max(0, Math.min(cfg.maxXp, ticks * Math.max(0, cfg.xpPerTick)))
}

/** Ms until the next XP tick; null once the stay's cap is reached. */
export function nextDayCareTick(res: DayCareResident, now: number, data: GameData): number | null {
  if (dayCareXp(res, now, data) >= data.config.dayCare.maxXp || data.config.dayCare.xpPerTick <= 0) return null
  const t = tickMs(data)
  return t - (Math.max(0, now - res.since) % t)
}

/** The resident as it stands now: its Day Care XP applied as levels (never an evolution). */
export function residentNow(res: DayCareResident, now: number, data: GameData): PokemonInstance {
  // No evolution means no random branch: the rng is never read.
  return gainXp(res.inst, dayCareXp(res, now, data), data, createRng(0), { evolve: false }).inst
}

export type DepositError = 'full' | 'last' | 'missing' | 'fossil'

/** Why this Pokémon can't be left here, or null when it can (keeps at least one Pokémon in the team). */
export function depositError(save: SaveData, uid: string, data: GameData): DepositError | null {
  const inst = save.box.find((p) => p.id === uid)
  if (!inst) return 'missing'
  if (inst.revivesAt != null) return 'fossil'
  if (dayCareOf(save).residents.length >= data.config.dayCare.slots) return 'full'
  if (save.team.includes(uid) && save.team.length <= 1) return 'last'
  return null
}

export function depositPokemon(save: SaveData, uid: string, data: GameData, now: number): SaveData | null {
  if (depositError(save, uid, data)) return null
  const inst = save.box.find((p) => p.id === uid)!
  const dc = dayCareOf(save)
  return {
    ...save,
    box: save.box.filter((p) => p.id !== uid),
    team: save.team.filter((id) => id !== uid),
    dayCare: { ...dc, residents: [...dc.residents, { inst, since: now }] },
  }
}

export interface Pickup {
  save: SaveData
  inst: PokemonInstance
  xpGained: number
  levelsGained: number
  joinedTeam: boolean
}

/** Take a resident back, its XP turned into levels and fully healed: into the team if there's room, else the Box. */
export function withdrawPokemon(save: SaveData, uid: string, data: GameData, now: number): Pickup | null {
  const dc = dayCareOf(save)
  const res = dc.residents.find((r) => r.inst.id === uid)
  if (!res) return null
  const grown = residentNow(res, now, data)
  const inst = { ...grown, currentHp: instanceMaxHp(grown, data) }
  const joinedTeam = save.team.length < data.config.maxTeamSize
  return {
    save: {
      ...save,
      box: [...save.box, inst],
      team: joinedTeam ? [...save.team, inst.id] : save.team,
      dayCare: { ...dc, residents: dc.residents.filter((r) => r.inst.id !== uid) },
    },
    inst,
    xpGained: dayCareXp(res, now, data),
    levelsGained: inst.level - res.inst.level,
    joinedTeam,
  }
}

/** First forms of evolving lines (nothing evolves into them), starters excluded. */
export function eggSpecies(data: GameData): Species[] {
  const evolvedInto = new Set(data.speciesList.flatMap((s) => s.evolutions.map((e) => e.toDex)))
  const starters = new Set(data.config.starters)
  return data.speciesList.filter((s) => s.evolutions.length > 0 && !evolvedInto.has(s.dex) && !starters.has(s.dex))
}

/** Each hatchable species with its weight: missing from the Pokédex → unownedWeight, else 1. */
export function eggOdds(save: SaveData, data: GameData): { species: Species; weight: number }[] {
  const dex = new Set(save.pokedex)
  const unowned = Math.max(0, data.config.dayCare.unownedWeight)
  return eggSpecies(data).map((species) => ({ species, weight: dex.has(species.dex) ? 1 : unowned }))
}

/** The hatchling's level: the hatchRank-th lowest level owned (or the highest, with fewer Pokémon), minus hatchOffset. */
export function hatchLevel(save: SaveData, data: GameData): number {
  const cfg = data.config.dayCare
  const levels = ownedPokemon(save)
    .map((p) => p.level)
    .sort((a, b) => a - b)
  const ref = levels[Math.min(Math.max(1, cfg.hatchRank), levels.length) - 1] ?? cfg.hatchMinLevel
  return Math.max(1, Math.min(data.config.maxLevel, Math.max(cfg.hatchMinLevel, ref - cfg.hatchOffset)))
}

export interface Hatch {
  save: SaveData
  inst: PokemonInstance
  isNew: boolean
  /** False when you already own that species at a level at least as high: the hatchling isn't kept. */
  kept: boolean
  /** The weaker copy the hatchling replaced (it takes its team slot). */
  replaced?: PokemonInstance
  joinedTeam: boolean
  paid: number
}

/**
 * Hatch an Egg: the free one (once) or a bought one. Null when it isn't available or affordable. Only one copy of a
 * species is kept: a hatchling stronger than every copy you own replaces the weakest one, otherwise it isn't kept.
 */
export function hatchEgg(
  save: SaveData,
  data: GameData,
  rng: Rng,
  now: number,
  newId: () => string,
  opts: { free: boolean },
): Hatch | null {
  const dc = dayCareOf(save)
  const price = Math.max(0, Math.round(data.config.dayCare.eggPrice))
  if (opts.free ? dc.eggClaimed : save.gold < price) return null
  const pick = rng.weighted(eggOdds(save, data), (o) => o.weight)
  if (!pick) return null
  const inst = createInstance(pick.species.dex, hatchLevel(save, data), data, newId(), now)
  const isNew = !save.pokedex.includes(inst.dex)
  const paid = opts.free ? 0 : price
  const copies = ownedPokemon(save).filter((p) => p.dex === inst.dex)
  const kept = copies.every((p) => p.level < inst.level)
  const replaced = kept ? copies.sort((a, b) => a.level - b.level)[0] : undefined
  const paidSave: SaveData = {
    ...save,
    gold: save.gold - paid,
    pokedex: isNew ? [...save.pokedex, inst.dex] : save.pokedex,
    dayCare: { ...dc, eggClaimed: dc.eggClaimed || opts.free },
  }
  if (!kept) return { save: paidSave, inst, isNew, kept, joinedTeam: false, paid }
  const inTeam = replaced ? save.team.includes(replaced.id) : false
  const box = save.box.filter((p) => p.id !== replaced?.id)
  const team = inTeam
    ? save.team.map((id) => (id === replaced!.id ? inst.id : id))
    : save.team.filter((id) => id !== replaced?.id)
  const joinedTeam = inTeam || team.length < data.config.maxTeamSize
  return {
    save: {
      ...paidSave,
      box: [...box, inst],
      team: joinedTeam && !inTeam ? [...team, inst.id] : team,
      dayCare: { ...paidSave.dayCare!, residents: dc.residents.filter((r) => r.inst.id !== replaced?.id) },
    },
    inst,
    isNew,
    kept,
    replaced,
    joinedTeam,
    paid,
  }
}
