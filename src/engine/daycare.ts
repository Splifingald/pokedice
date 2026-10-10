// The Pokémon Day Care, one for every region (docs/15): your Pokémon gain XP in real time (no battles) all the way to
// the level cap and never evolve from it; friends' Pokémon visit; Eggs hatch on the spot into the first form of an
// evolving line, favouring species the player doesn't have yet. The Egg-group checks that lay the Eggs are in
// breeding.ts.
import { createInstance, gainXp, instanceMaxHp, xpToNext } from './progression'
import { regionCases, regionOf, regionOfSpecies } from './regions'
import { createRng, type Rng } from './rng'
import { badgeCase, ownedPokemon } from './run'
import type {
  DayCareGuest,
  DayCareResident,
  DayCareState,
  GameData,
  PokemonInstance,
  RegionId,
  SaveData,
  Species,
} from './types'

const MINUTE = 60_000

const EMPTY: DayCareState = { residents: [], guests: [], eggClaimed: false }

/** The one Day Care, whichever region is live. */
export const dayCareOf = (save: SaveData): DayCareState => {
  const dc = save.dayCare
  if (!dc) return EMPTY
  return dc.guests ? dc : { ...dc, guests: [] }
}

/** Distinct species caught across every region's Pokédex: what opens the Day Care. */
export function speciesCaughtEverywhere(save: SaveData): number {
  const all = new Set(save.pokedex)
  for (const block of Object.values(save.parked ?? {})) for (const dex of block?.pokedex ?? []) all.add(dex)
  return all.size
}

/** The Day Care opens once enough species are caught, all regions counted. Pokédexes only grow: open for good. */
export const isDayCareOpen = (save: SaveData, data: GameData) =>
  speciesCaughtEverywhere(save) >= data.config.dayCare.unlockPokedex

/**
 * The unlock tutorial is due: the Day Care is open and the player has never been in. Saves that already used it
 * (a resident or the free Egg) count as visited. The Day Care is shared, so it fires once ever, not once per region.
 */
export function dayCareTutorialDue(save: SaveData, data: GameData): boolean {
  if (!isDayCareOpen(save, data)) return false
  const dc = dayCareOf(save)
  return !dc.visited && !dc.eggClaimed && dc.residents.length === 0
}

/**
 * The leaderboard opens with the first gym badge, in any region played: before it there is nothing worth comparing,
 * and the board itself only lists trainers who hold one (leaderboard(), migration 0024).
 */
export function leaderboardUnlocked(save: SaveData, data: GameData): boolean {
  return regionCases(save, data).some((r) => r.earned > 0)
}

/**
 * The leaderboard tutorial is due: never opened, a badge already won, and the Day Care's turn has passed.
 *
 * It used to fire on the first quiet moment of a new game, which is the moment a player has least to put on a board
 * and most else to take in. The first badge is the first thing worth comparing.
 */
export function leaderboardTutorialDue(save: SaveData, data: GameData): boolean {
  if (save.leaderboardVisited) return false
  if (!badgeCase(save, data).some((b) => b.earned)) return false
  return !dayCareTutorialDue(save, data)
}

/**
 * Whether one of Prof. Oak's one-time pop-ups is waiting. They queue rather than stack: the Day Care first, then the
 * leaderboard, and only once both are done does anything else (the region offer) take the screen.
 */
export function tutorialPending(save: SaveData, data: GameData): boolean {
  return dayCareTutorialDue(save, data) || leaderboardTutorialDue(save, data)
}

export const markDayCareVisited = (save: SaveData): SaveData =>
  dayCareOf(save).visited ? save : { ...save, dayCare: { ...dayCareOf(save), visited: true } }

// ---------------------------------------------------------------- XP

const tickMs = (data: GameData) => Math.max(1, data.config.dayCare.tickMinutes) * MINUTE

/** XP earned so far this stay: xpPerTick for each full tick since drop-off. Lv.100 is the only cap (residentNow). */
export function dayCareXp(res: Pick<DayCareResident, 'since'>, now: number, data: GameData): number {
  const ticks = Math.floor(Math.max(0, now - res.since) / tickMs(data))
  return ticks * Math.max(0, data.config.dayCare.xpPerTick)
}

/** The resident as it stands now: its Day Care XP applied as levels (never an evolution). */
export function residentNow(res: Pick<DayCareResident, 'inst' | 'since'>, now: number, data: GameData): PokemonInstance {
  // No evolution means no random branch: the rng is never read.
  return gainXp(res.inst, dayCareXp(res, now, data), data, createRng(0), { evolve: false }).inst
}

/** Ms until the next XP tick; null once it is at the level cap (or the Day Care gives no XP). */
export function nextDayCareTick(res: DayCareResident, now: number, data: GameData): number | null {
  if (data.config.dayCare.xpPerTick <= 0) return null
  if (residentNow(res, now, data).level >= data.config.maxLevel) return null
  const t = tickMs(data)
  return t - (Math.max(0, now - res.since) % t)
}

/** Where a resident stands on the way to its next level: the bar under it. `toNext` is 0 at the level cap. */
export function dayCareLevelProgress(
  res: DayCareResident,
  now: number,
  data: GameData,
): { level: number; xp: number; toNext: number } {
  const grown = residentNow(res, now, data)
  const capped = grown.level >= data.config.maxLevel
  return { level: grown.level, xp: capped ? 0 : grown.xp, toNext: capped ? 0 : xpToNext(grown.level, data.config) }
}

// ---------------------------------------------------------------- your Pokémon

/** The residents left from the live region: the ones that count as owned here (regions never pool). */
export const liveResidents = (save: SaveData): DayCareResident[] =>
  dayCareOf(save).residents.filter((r) => (r.region ?? regionOf(save)) === regionOf(save))

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

/** Leave a Pokémon from the live region's team or Box: it remembers the region, to go back to its Box. */
export function depositPokemon(save: SaveData, uid: string, data: GameData, now: number): SaveData | null {
  if (depositError(save, uid, data)) return null
  const inst = save.box.find((p) => p.id === uid)!
  const dc = dayCareOf(save)
  return {
    ...save,
    box: save.box.filter((p) => p.id !== uid),
    team: save.team.filter((id) => id !== uid),
    dayCare: { ...dc, residents: [...dc.residents, { inst, since: now, region: regionOf(save) }] },
  }
}

export interface Pickup {
  save: SaveData
  inst: PokemonInstance
  xpGained: number
  levelsGained: number
  joinedTeam: boolean
  /** The region whose Box it went to. */
  region: RegionId
  /** That region is the live one (otherwise it waits in a parked Box: "back in your Kanto Box"). */
  live: boolean
}

/**
 * A resident goes home, its XP turned into levels and fully healed: to its own region's Box, the live one through the
 * top level, a parked one through `save.parked`. It joins the team only when its region is live, the team has room,
 * and `team` allows it. A region that no longer exists falls back to the live one.
 */
function sendHome(save: SaveData, res: DayCareResident, data: GameData, now: number, team: boolean): Pickup {
  const dc = dayCareOf(save)
  const grown = residentNow(res, now, data)
  const inst = { ...grown, currentHp: instanceMaxHp(grown, data) }
  const rest: DayCareState = { ...dc, residents: dc.residents.filter((r) => r.inst.id !== res.inst.id) }
  const base = { inst, xpGained: dayCareXp(res, now, data), levelsGained: inst.level - res.inst.level }
  const here = regionOf(save)
  const block = res.region && res.region !== here ? save.parked?.[res.region] : undefined
  if (block) {
    return {
      ...base,
      save: { ...save, dayCare: rest, parked: { ...save.parked, [res.region]: { ...block, box: [...block.box, inst] } } },
      joinedTeam: false,
      region: res.region,
      live: false,
    }
  }
  const joinedTeam = team && save.team.length < data.config.maxTeamSize
  return {
    ...base,
    save: { ...save, box: [...save.box, inst], team: joinedTeam ? [...save.team, inst.id] : save.team, dayCare: rest },
    joinedTeam,
    region: here,
    live: true,
  }
}

/** Take a resident back: into its region's Box, and the team when that region is live and the team has room. */
export function withdrawPokemon(save: SaveData, uid: string, data: GameData, now: number): Pickup | null {
  const res = dayCareOf(save).residents.find((r) => r.inst.id === uid)
  return res ? sendHome(save, res, data, now, true) : null
}

/**
 * More residents than slots (two regions each had two when the Day Cares became one, or the admin cut the slots): the
 * ones that have stayed longest stay, the others go home to their region's Box with their levels, and
 * `dayCareNotice` asks the next screen for one toast. Unchanged (the same object) when they fit.
 */
export function fitDayCare(save: SaveData, data: GameData, now: number): SaveData {
  const slots = Math.max(0, data.config.dayCare.slots)
  const dc = dayCareOf(save)
  if (dc.residents.length <= slots) return save
  const leaving = [...dc.residents].sort((a, b) => a.since - b.since).slice(slots)
  let next = save
  for (const res of leaving) next = sendHome(next, res, data, now, false).save
  const dex = [...(save.dayCareNotice?.dex ?? []), ...leaving.map((r) => r.inst.dex)]
  return { ...next, dayCareNotice: { dex } }
}

// ---------------------------------------------------------------- friends' Pokémon

export type InviteRefusal = 'full' | 'here'

/** Invite a friend's Pokémon: refused when the friend slots are full, or when that same Pokémon is already here. */
export function inviteGuest(
  save: SaveData,
  guest: DayCareGuest,
  data: GameData,
): { save: SaveData } | { refused: InviteRefusal } {
  const dc = dayCareOf(save)
  if (dc.guests.some((g) => g.owner === guest.owner && g.inst === guest.inst)) return { refused: 'here' }
  if (dc.guests.length >= Math.max(0, data.config.dayCare.friendSlots)) return { refused: 'full' }
  return { save: { ...save, dayCare: { ...dc, guests: [...dc.guests, guest] } } }
}

/** Send a visitor back. Nothing changes for the friend: it never left their Day Care. */
export function removeGuest(save: SaveData, owner: string, inst: string): SaveData {
  const dc = dayCareOf(save)
  const guests = dc.guests.filter((g) => !(g.owner === owner && g.inst === inst))
  return guests.length === dc.guests.length ? save : { ...save, dayCare: { ...dc, guests } }
}

/** One Pokémon in a friend's Day Care, as their card shows it: the instance at drop-off, and since when. */
export interface FriendCareMon {
  inst: string
  dex: number
  level: number
  xp: number
  since: number
  shiny?: boolean
}

/** A friend's Day Care, as the server reads it from their card (friend_day_cares(), migration 0034). */
export interface FriendDayCare {
  owner: string
  mons: FriendCareMon[]
}

/** A friend's resident's level now: the same rule as yours, from their card's level, XP and drop-off time. */
export function friendMonLevel(m: FriendCareMon, now: number, data: GameData): number {
  const inst: PokemonInstance = { id: m.inst, dex: m.dex, level: m.level, xp: m.xp, currentHp: 0, caughtAt: 0 }
  return data.species[m.dex] ? residentNow({ inst, since: m.since }, now, data).level : m.level
}

/**
 * What the server says is in those friends' Day Cares now: visitors no longer there go home (their owner took them
 * back, or the friendship ended), the others' levels are brought up to date. Returns the ones that left, for one
 * toast. Offline nothing is refreshed, and the snapshot keeps breeding.
 */
export function refreshGuests(
  save: SaveData,
  live: FriendDayCare[],
  now: number,
  data: GameData,
): { save: SaveData; left: DayCareGuest[] } {
  const dc = dayCareOf(save)
  const left: DayCareGuest[] = []
  let changed = false
  const guests = dc.guests.flatMap((g) => {
    const m = live.find((f) => f.owner === g.owner)?.mons.find((x) => x.inst === g.inst)
    if (!m) {
      left.push(g)
      return []
    }
    const level = friendMonLevel(m, now, data)
    if (level === g.level) return [g]
    changed = true
    return [{ ...g, level }]
  })
  if (!left.length && !changed) return { save, left }
  return { save: { ...save, dayCare: { ...dc, guests } }, left }
}

// ---------------------------------------------------------------- the Egg

/**
 * First forms of evolving lines (nothing evolves into them), starters excluded — and, with a region, only that
 * region's own generation.
 *
 * An Egg is a region's Egg: hatching a Chikorita in Kanto would put a #152 in a Pokédex that ends at #151, and
 * hatching a Pidgey in Johto would hand out a region the player has already finished. So the pool is cut to the
 * species whose dex number belongs to the region (see `regionOfSpecies`), never a previous or a later one. A region
 * with no first forms of its own (nothing in the table yet) falls back to the whole pool, so Eggs never dry up.
 */
export function eggSpecies(data: GameData, regionId?: RegionId | null): Species[] {
  const evolvedInto = new Set(data.speciesList.flatMap((s) => s.evolutions.map((e) => e.toDex)))
  const starters = new Set(data.config.starters)
  const pool = data.speciesList.filter((s) => s.evolutions.length > 0 && !evolvedInto.has(s.dex) && !starters.has(s.dex))
  if (!regionId) return pool
  const here = pool.filter((s) => regionOfSpecies(data, s.dex) === regionId)
  return here.length ? here : pool
}

/**
 * Each hatchable species with its weight: missing from the Pokédex → unownedWeight, else 1. The live region's pool,
 * wherever the parents came from.
 */
export function eggOdds(save: SaveData, data: GameData): { species: Species; weight: number }[] {
  const dex = new Set(save.pokedex)
  const unowned = Math.max(0, data.config.dayCare.unownedWeight)
  return eggSpecies(data, regionOf(save)).map((species) => ({ species, weight: dex.has(species.dex) ? 1 : unowned }))
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
  /** False when you already own a plain copy at a level at least as high: the hatchling isn't kept. */
  kept: boolean
  /** The weaker copy the hatchling replaced (it takes its team slot). */
  replaced?: PokemonInstance
  joinedTeam: boolean
  shiny: boolean
  /** ₽ from the Day Care couple: `notKeptGold` when it isn't kept, else 0. */
  gold: number
  /** It was the free first Egg. */
  gift: boolean
}

/**
 * Hatch the Egg waiting (null when none waits). Only one plain copy of a species is kept: a hatchling stronger than
 * every plain copy you own replaces the weakest one, otherwise the Day Care couple keeps it and gives `notKeptGold`.
 * A shiny is a Pokémon of its own (the catching rule): it never replaces a copy, nothing holds it back, so it is
 * always kept.
 */
export function hatchEgg(save: SaveData, data: GameData, rng: Rng, now: number, newId: () => string): Hatch | null {
  const dc = dayCareOf(save)
  if (!dc.egg) return null
  const cfg = data.config.dayCare
  const pick = rng.weighted(eggOdds(save, data), (o) => o.weight)
  if (!pick) return null
  const shiny = rng.next() < Math.max(0, cfg.shinyChance)
  const inst = createInstance(pick.species.dex, hatchLevel(save, data), data, newId(), now)
  if (shiny) inst.shiny = true
  const isNew = !save.pokedex.includes(inst.dex)
  const copies = shiny ? [] : ownedPokemon(save).filter((p) => p.dex === inst.dex && !p.shiny)
  const kept = copies.every((p) => p.level < inst.level)
  const replaced = kept ? copies.sort((a, b) => a.level - b.level)[0] : undefined
  const gold = kept ? 0 : Math.max(0, Math.round(cfg.notKeptGold))
  const gift = !!dc.egg.gift
  const { egg: _hatched, ...rest } = dc
  const cleared: DayCareState = { ...rest, eggClaimed: dc.eggClaimed || gift }
  const base: SaveData = {
    ...save,
    gold: save.gold + gold,
    pokedex: isNew ? [...save.pokedex, inst.dex] : save.pokedex,
    dayCare: cleared,
  }
  const out = { inst, isNew, kept, shiny, gold, gift }
  if (!kept) return { ...out, save: base, joinedTeam: false }
  const inTeam = replaced ? save.team.includes(replaced.id) : false
  const box = save.box.filter((p) => p.id !== replaced?.id)
  const team = inTeam
    ? save.team.map((id) => (id === replaced!.id ? inst.id : id))
    : save.team.filter((id) => id !== replaced?.id)
  const joinedTeam = inTeam || team.length < data.config.maxTeamSize
  return {
    ...out,
    save: {
      ...base,
      box: [...box, inst],
      team: joinedTeam && !inTeam ? [...team, inst.id] : team,
      dayCare: { ...cleared, residents: cleared.residents.filter((r) => r.inst.id !== replaced?.id) },
    },
    replaced,
    joinedTeam,
  }
}
