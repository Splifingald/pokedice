// The race of time and space (docs/61 §4.4, the user's design of 2026-11-01): Spear Pillar's mode. A time trial: from
// READY! the clock runs on the server's time, kept in the save, so closing the app or reloading never stops it. Every
// few fights a fork offers two gates, each a type (the next foes are of it, drawn from the area's wild pool) and each
// holding a find: an item, or a time shard that puts time back on the clock. The last fork's gate decides the raid:
// Water for shiny Palkia, Steel for shiny Dialga. Winning the last fight in time opens that raid; out of time or a full
// K.O. sends the player back to the start, healed, XP and items kept, as many times as it takes. Once that legend is
// caught, one replay with other types, harder foes and less time opens the other. Inside, no Pokémon Center, no catch,
// no way out, and every fight plays at one speed with no auto-battle, so the clock means the same for everyone. Every
// number is the area's (`Area.mode`, Admin → Areas), the switch the admin's (`timeRace`).
import type { Encounter } from './encounters'
import { progressRaidKey } from './progressRaid'
import { instanceMaxHp } from './progression'
import type { Rng } from './rng'
import { timeRaceModeOf } from './timeRaceMode'
import type {
  Area,
  AreaProgress,
  GameData,
  PokemonInstance,
  PokeType,
  SaveData,
  TimeRaceGate,
  TimeRaceMode,
  TimeRaceState,
  WildPoolEntry,
} from './types'

export {
  DEFAULT_TIME_RACE,
  normaliseTimeRace,
  timeRaceModeOf,
  timeRaceRaidRules,
  timeRaceRunsOn,
} from './timeRaceMode'

const EMPTY: TimeRaceState = { active: false, fights: 0, path: [] }

const progressAt = (save: SaveData, areaId: string): AreaProgress => ({
  roundsDone: 0,
  cleared: false,
  bossDefeated: false,
  bossesDefeated: [],
  gymsDefeated: [],
  ...save.areaProgress[areaId],
})

const areaOf = (data: GameData, areaId: string | null | undefined): Area | undefined =>
  areaId ? data.areas.find((a) => a.id === areaId) : undefined

const modeAt = (data: GameData, areaId: string | null | undefined): TimeRaceMode | null =>
  timeRaceModeOf(areaOf(data, areaId), data)

/** Where the race stands in this area of the region being played (nothing yet: not in a try, nothing won). */
export const timeRaceStateOf = (save: SaveData, areaId: string): TimeRaceState =>
  save.areaProgress[areaId]?.timeRace ?? EMPTY

function withRace(save: SaveData, areaId: string, timeRace: TimeRaceState): SaveData {
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [areaId]: { ...progressAt(save, areaId), timeRace } },
  }
}

const mapTeam = (save: SaveData, f: (p: PokemonInstance) => PokemonInstance): SaveData => {
  const team = new Set(save.team)
  return { ...save, box: save.box.map((p) => (team.has(p.id) ? f(p) : p)) }
}

/** The whole team back to full HP, K.O. or not (READY!, the way back to the start, the win). */
const healTeam = (save: SaveData, data: GameData): SaveData =>
  mapTeam(save, (p) => (data.species[p.dex] ? { ...p, currentHp: instanceMaxHp(p, data) } : p))

/** What a try keeps: the legends won and the tries counted. */
const kept = (r: TimeRaceState): Partial<TimeRaceState> => ({
  ...(r.won?.length && { won: [...r.won] }),
  ...(r.wonSeen != null && { wonSeen: r.wonSeen }),
  ...(r.tries != null && { tries: r.tries }),
})

// ------------------------------------------------------------------ the legends and the replay

/** The legends whose raid the race opened here, in order (the first race's, then the replay's). */
export const timeRaceWonDexes = (save: SaveData, areaId: string): number[] => timeRaceStateOf(save, areaId).won ?? []

/** The race opened this legend's raid here (its raid can be fought: progressRaidState). */
export const timeRaceOpened = (save: SaveData, areaId: string, dex: number): boolean =>
  timeRaceWonDexes(save, areaId).includes(dex)

/**
 * The replay is open: one legend won and caught (its raid done), the other still to win. Its forks are the replay's
 * own, then the other legend's gate alone.
 */
export function timeRaceReplayOpen(save: SaveData, data: GameData, areaId: string): boolean {
  const mode = modeAt(data, areaId)
  const won = timeRaceWonDexes(save, areaId)
  if (!mode || won.length !== 1) return false
  const done = save.events?.raidsDone ?? []
  return done.includes(progressRaidKey(areaId, won[0]!)) && mode.legends.some((l) => !won.includes(l.dex))
}

/** One fork of a try: its gate types (one alone is a gate the player must take). */
export type TimeRaceFork = PokeType[]

/** A try's plan: the replay or not, its forks in order, its clock, its foes' extra levels, its fights. */
export interface TimeRacePlan {
  replay: boolean
  forks: TimeRaceFork[]
  seconds: number
  levelBonus: number
  total: number
}

/**
 * The try under way here, or the next one: the first race's forks then both legends' gates; the replay's own forks
 * then the gate of the legend not won yet.
 */
export function timeRacePlan(save: SaveData, mode: TimeRaceMode, areaId: string): TimeRacePlan {
  const won = timeRaceWonDexes(save, areaId)
  const replay = won.length > 0
  const forks: TimeRaceFork[] = replay
    ? [...mode.replay.forks, mode.legends.filter((l) => !won.includes(l.dex)).map((l) => l.type)]
    : [...mode.forks, mode.legends.map((l) => l.type)]
  return {
    replay,
    forks,
    seconds: replay ? mode.replay.seconds : mode.seconds,
    levelBonus: replay ? mode.replay.levelBonus : 0,
    total: forks.length * mode.perFork,
  }
}

/** The try's plan here, or null outside a race area (switched off included). */
export function timeRacePlanAt(save: SaveData, data: GameData, areaId: string): TimeRacePlan | null {
  const mode = modeAt(data, areaId)
  return mode ? timeRacePlan(save, mode, areaId) : null
}

// ------------------------------------------------------------------ in a try or not

/** A try is under way in this area (switched on, READY! pressed, not won, not lost). */
export function inTimeRace(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = areaOf(data, areaId)
  return !!area && !!timeRaceModeOf(area, data) && timeRaceStateOf(save, area.id).active
}

/**
 * The area the player can't leave: the region being played's current area, while a try is under way there. Null
 * everywhere else.
 */
export function timeRaceLock(save: SaveData | null, data: GameData): Area | null {
  if (!save) return null
  const area = areaOf(data, save.currentAreaId)
  return area && inTimeRace(save, data, area.id) ? area : null
}

/** Its foes can't be caught (all are met elsewhere): no throw after a win. */
export const timeRaceNoCatch = (save: SaveData, data: GameData, areaId: string | null | undefined): boolean =>
  inTimeRace(save, data, areaId)

/** A try can start here: a race area, switched on, none under way, and the first race or the replay still to win. */
export function canStartTimeRace(save: SaveData, data: GameData, areaId: string): boolean {
  if (!modeAt(data, areaId)) return false
  const r = timeRaceStateOf(save, areaId)
  if (r.active) return false
  return !r.won?.length || timeRaceReplayOpen(save, data, areaId)
}

/**
 * The race is done for now: a legend won, and no try can start (its legend not caught yet, or both won). The area is
 * only its raids meanwhile.
 */
export function timeRaceSealed(save: SaveData, data: GameData, areaId: string): boolean {
  if (!modeAt(data, areaId)) return false
  const r = timeRaceStateOf(save, areaId)
  return !r.active && !!r.won?.length && !canStartTimeRace(save, data, areaId)
}

// ------------------------------------------------------------------ the clock

/**
 * READY!: into a try. The team is fully healed, the clock starts now (the server's time) with the plan's seconds,
 * nothing won yet; the first fork comes next. Null when a try can't start here.
 */
export function startTimeRace(save: SaveData, data: GameData, areaId: string, now: number): SaveData | null {
  const mode = modeAt(data, areaId)
  if (!mode || !canStartTimeRace(save, data, areaId)) return null
  const before = timeRaceStateOf(save, areaId)
  const plan = timeRacePlan(save, mode, areaId)
  return withRace(healTeam(save, data), areaId, {
    ...kept(before),
    active: true,
    startedAt: now,
    deadline: now + plan.seconds * 1000,
    fights: 0,
    path: [],
    gates: null,
    met: [],
    shards: 0,
    tries: (before.tries ?? 0) + 1,
  })
}

/** Milliseconds left on the clock at `now` (never below 0), or null outside a try. */
export function timeRaceLeft(save: SaveData, data: GameData, areaId: string, now: number): number | null {
  if (!inTimeRace(save, data, areaId)) return null
  const r = timeRaceStateOf(save, areaId)
  return Math.max(0, (r.deadline ?? now) - now)
}

/** The clock has reached 0:00 in a try under way (on the server's time). */
export const timeRaceOutOfTime = (save: SaveData, data: GameData, areaId: string, now: number): boolean =>
  timeRaceLeft(save, data, areaId, now) === 0

/** Back to the start: the try ends, the team healed; XP, ₽ and items stay; the legends won stay won. */
function backToStart(save: SaveData, data: GameData, areaId: string): SaveData {
  return withRace(healTeam(save, data), areaId, { ...kept(timeRaceStateOf(save, areaId)), active: false, fights: 0, path: [] })
}

/**
 * Out of time: the clock reached 0:00 (the app open or not): back to the start, healed, XP and items kept, to try again
 * (no limit). Null while there is time left, or outside a try.
 */
export function timeRaceTimeUp(
  save: SaveData,
  data: GameData,
  areaId: string,
  now: number,
): { save: SaveData; fights: number; total: number } | null {
  if (!timeRaceOutOfTime(save, data, areaId, now)) return null
  const r = timeRaceStateOf(save, areaId)
  const plan = timeRacePlanAt(save, data, areaId)!
  return { save: backToStart(save, data, areaId), fights: r.fights, total: plan.total }
}

/**
 * The whole team K.O. in a try: back to the start, as when the clock runs out (through `applyWipe`). Unchanged outside
 * a try.
 */
export function timeRaceWipe(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!inTimeRace(save, data, areaId)) return save
  return backToStart(save, data, areaId)
}

// ------------------------------------------------------------------ the forks

/** A fork is waiting to be opened: the fights since the last one are done and there are forks left. */
export function timeRaceForkDue(save: SaveData, data: GameData, areaId: string): boolean {
  const mode = modeAt(data, areaId)
  if (!mode || !inTimeRace(save, data, areaId)) return false
  const r = timeRaceStateOf(save, areaId)
  const plan = timeRacePlan(save, mode, areaId)
  return !r.gates?.length && r.path.length < plan.forks.length && r.fights >= r.path.length * mode.perFork
}

/** A gate's find: a time shard `shard.chance` % of the time, else an item by weight (a shard when none can be had). */
function drawFind(mode: TimeRaceMode, data: GameData, rng: Rng): TimeRaceGate['find'] {
  const shard = mode.shard.seconds > 0 ? ({ kind: 'shard', seconds: mode.shard.seconds } as const) : null
  if (shard && rng.next() * 100 < mode.shard.chance) return shard
  const item = rng.weighted(
    mode.items.filter((i) => data.items[i.key]),
    (i) => i.weight,
  )
  return item ? { kind: 'item', key: item.key, qty: item.qty } : shard
}

/** The fork due now opens: its gates are drawn with their finds and wait in the save for the pick. Null when none is due. */
export function openTimeRaceFork(save: SaveData, data: GameData, areaId: string, rng: Rng): SaveData | null {
  const mode = modeAt(data, areaId)
  if (!mode || !timeRaceForkDue(save, data, areaId)) return null
  const r = timeRaceStateOf(save, areaId)
  const types = timeRacePlan(save, mode, areaId).forks[r.path.length]!
  const gates: TimeRaceGate[] = types.map((type) => ({ type, find: drawFind(mode, data, rng) }))
  return withRace(save, areaId, { ...r, gates })
}

/**
 * The player walks through a gate: its find is theirs (a shard puts time back on the clock, an item goes into the bag),
 * its type is the next foes', and the fork closes. Null for a gate that isn't offered.
 */
export function pickTimeRaceGate(
  save: SaveData,
  data: GameData,
  areaId: string,
  index: number,
): { save: SaveData; gate: TimeRaceGate } | null {
  const r = timeRaceStateOf(save, areaId)
  const gate = r.gates?.[index]
  if (!gate || !inTimeRace(save, data, areaId)) return null
  let next = save
  let state: TimeRaceState = { ...r, gates: null, path: [...r.path, gate.type], met: [] }
  if (gate.find?.kind === 'shard') {
    state = { ...state, deadline: (r.deadline ?? 0) + gate.find.seconds * 1000, shards: (r.shards ?? 0) + 1 }
  } else if (gate.find?.kind === 'item' && data.items[gate.find.key]) {
    const { key, qty } = gate.find
    next = { ...next, inventory: { ...next.inventory, [key]: (next.inventory[key] ?? 0) + qty } }
  }
  return { save: withRace(next, areaId, state), gate }
}

// ------------------------------------------------------------------ the fights

/** The area's wild Pokémon of a type (their own type or their second one), any weight above 0. */
export function timeRacePool(area: Area, data: GameData, type: PokeType): WildPoolEntry[] {
  return area.wildPool.filter((w) => {
    const sp = data.species[w.dex]
    return w.weight > 0 && !!sp && (sp.type1 === type || sp.type2 === type)
  })
}

/** The fight to come: its number (1-based), the try's total and its type. Null outside a try or while a fork is due. */
export function timeRaceFoe(
  save: SaveData,
  data: GameData,
  areaId: string,
): { fight: number; total: number; type: PokeType } | null {
  const mode = modeAt(data, areaId)
  if (!mode || !inTimeRace(save, data, areaId) || timeRaceForkDue(save, data, areaId)) return null
  const r = timeRaceStateOf(save, areaId)
  if (r.gates?.length) return null
  const type = r.path[r.path.length - 1]
  if (!type) return null
  return { fight: r.fights + 1, total: timeRacePlan(save, mode, areaId).total, type }
}

/**
 * The next foe: a wild Pokémon of the gate's type from the area's pool, at its pool level (the replay's higher), never
 * shiny, another species than those met since the fork while the pool has one (any of the pool when it has none of the
 * type). The species met is noted in the save. Null outside a try or while a fork is due.
 */
export function timeRaceEncounter(
  save: SaveData,
  data: GameData,
  areaId: string,
  rng: Rng,
): { save: SaveData; encounter: Extract<Encounter, { kind: 'wild' }> } | null {
  const area = areaOf(data, areaId)
  const mode = modeAt(data, areaId)
  const foe = timeRaceFoe(save, data, areaId)
  if (!area || !mode || !foe) return null
  const r = timeRaceStateOf(save, areaId)
  const typed = timeRacePool(area, data, foe.type)
  const pool = typed.length ? typed : area.wildPool.filter((w) => w.weight > 0 && data.species[w.dex])
  const fresh = pool.filter((w) => !r.met?.includes(w.dex))
  const entry = rng.weighted(fresh.length ? fresh : pool, (w) => w.weight)
  if (!entry) return null
  const plan = timeRacePlan(save, mode, areaId)
  const lo = Math.min(entry.minLevel, entry.maxLevel)
  const level = Math.min(100, rng.int(lo, Math.max(lo, entry.maxLevel)) + plan.levelBonus)
  return {
    save: withRace(save, areaId, { ...r, met: [...(r.met ?? []), entry.dex] }),
    encounter: { kind: 'wild', dex: entry.dex, level, isNew: !save.pokedex.includes(entry.dex) },
  }
}

/**
 * A fight is won at `now`. In time, it counts; the last one wins the try for good: the legend of the last gate taken
 * opens its raid, the team is healed, the win's moment is due. Past the clock it counts for nothing: back to the start
 * (`outOfTime`). Null outside a try.
 */
export function winTimeRaceFight(
  save: SaveData,
  data: GameData,
  areaId: string,
  now: number,
): { save: SaveData; fights: number; total: number; legend: number | null; outOfTime: boolean } | null {
  const mode = modeAt(data, areaId)
  if (!mode || !inTimeRace(save, data, areaId)) return null
  const r = timeRaceStateOf(save, areaId)
  const plan = timeRacePlan(save, mode, areaId)
  if (timeRaceOutOfTime(save, data, areaId, now))
    return { save: backToStart(save, data, areaId), fights: r.fights, total: plan.total, legend: null, outOfTime: true }
  const fights = r.fights + 1
  if (fights < plan.total)
    return { save: withRace(save, areaId, { ...r, fights }), fights, total: plan.total, legend: null, outOfTime: false }
  const last = r.path[r.path.length - 1]
  const legend = mode.legends.find((l) => l.type === last)?.dex ?? null
  const won = legend != null && !r.won?.includes(legend) ? [...(r.won ?? []), legend] : (r.won ?? [])
  const done = withRace(healTeam(save, data), areaId, {
    active: false,
    fights,
    path: r.path,
    won,
    wonSeen: false,
    ...(r.tries != null && { tries: r.tries }),
    ...(r.shards != null && { shards: r.shards }),
    ...(r.startedAt != null && { startedAt: r.startedAt }),
    // The moment it was won, for the win's line (how much time was left).
    deadline: r.deadline,
  })
  return { save: done, fights, total: plan.total, legend, outOfTime: false }
}

// ------------------------------------------------------------------ how it ends

/** The legend the last won try opened (its win's moment), or null. */
export const timeRaceLastWon = (save: SaveData, areaId: string): number | null =>
  timeRaceWonDexes(save, areaId).at(-1) ?? null

/** The last win's moment is due here. */
export const timeRaceVictoryDue = (save: SaveData, data: GameData, areaId: string): boolean =>
  !!modeAt(data, areaId) && timeRaceLastWon(save, areaId) != null && timeRaceStateOf(save, areaId).wonSeen === false

/** The win's moment has played. */
export function markTimeRaceWonSeen(save: SaveData, areaId: string): SaveData {
  const r = timeRaceStateOf(save, areaId)
  return r.won?.length && r.wonSeen === false ? withRace(save, areaId, { ...r, wonSeen: true }) : save
}

// ------------------------------------------------------------------ in battle

/**
 * One speed for everyone inside a try (the user's call, 2026-11-01): every fight plays at the short motion level and
 * the race's pace (1 / speed: the quick speed), whatever the player's setting, and never on auto. Null outside a try.
 */
export function timeRaceBattleSpeed(
  save: SaveData,
  data: GameData,
  areaId: string | null | undefined,
): { motion: 'short'; pace: number } | null {
  const mode = modeAt(data, areaId)
  if (!mode || !inTimeRace(save, data, areaId)) return null
  return { motion: 'short', pace: 1 / mode.speed }
}
