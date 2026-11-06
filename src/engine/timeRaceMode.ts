// The race of time and space's settings (docs/64 §4.4), on their own so the raid's numbers can read them without the
// race's rules, as portalMode.ts does for the portal run: an area's `mode` as the admin set it, cleaned and filled from
// the defaults, and the switch that turns it on.
import { eventOpenTo } from './events'
import { POKE_TYPES, type Area, type GameData, type PokeType, type TimeRaceMode } from './types'

/**
 * Spear Pillar's race (the user's design of 2026-11-01, docs/64 §4.4): 15 fights in 12:00, a fork every 3 fights (Fire
 * or Grass, Dark or Psychic, Dragon or Ice, Electric or Ground, then Water for Palkia or Steel for Dialga), a time shard
 * of 0:30 or an item behind each gate; the replay's other types at +4 levels on 10:00; the raids at Lv.70, dice 8, three
 * bars, teams up to Lv.70.
 */
export const DEFAULT_TIME_RACE: TimeRaceMode = {
  kind: 'timeRace',
  forks: [
    ['fire', 'grass'],
    ['dark', 'psychic'],
    ['dragon', 'ice'],
    ['electric', 'ground'],
  ],
  legends: [
    // Water: Palkia, the master of space.
    { type: 'water', dex: 484 },
    // Steel: Dialga, the master of time.
    { type: 'steel', dex: 483 },
  ],
  perFork: 3,
  seconds: 720,
  // About one gate in three holds a shard: a fork more often offers one than not, but never both gates for sure.
  shard: { chance: 35, seconds: 30 },
  // What helps a team with no Pokémon Center: HP, a K.O. brought back, rarely a full one.
  items: [
    { key: 'hyper-potion', qty: 2, weight: 40 },
    { key: 'revive', qty: 1, weight: 35 },
    { key: 'max-revive', qty: 1, weight: 10 },
  ],
  // The auto battle's quick speed (1.5×, lib/pace AUTO_PACE), for everyone inside the race.
  speed: 1.5,
  replay: {
    forks: [
      ['normal', 'fairy'],
      ['rock', 'flying'],
      ['bug', 'dragon'],
      ['ice', 'dark'],
    ],
    levelBonus: 4,
    seconds: 600,
  },
  raid: { level: 70, upgradeLevel: 8, bars: 3, teamCap: 70 },
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const int = (v: unknown, fallback: number, min: number, max: number) => Math.round(num(v, fallback, min, max))
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
const isType = (v: unknown): v is PokeType =>
  typeof v === 'string' && (POKE_TYPES as readonly string[]).includes(v)

/** A list of forks: two distinct types each, 10 at most; anything odd dropped (the default when none is left). */
function forksOf(raw: unknown, fallback: [PokeType, PokeType][]): [PokeType, PokeType][] {
  if (!Array.isArray(raw)) return fallback
  const out = raw
    .filter(
      (f): f is unknown[] =>
        Array.isArray(f) && f.length === 2 && isType(f[0]) && isType(f[1]) && f[0] !== f[1],
    )
    .slice(0, 10)
    .map((f) => [f[0], f[1]] as [PokeType, PokeType])
  return out.length ? out : fallback
}

/** A race as the admin left it (a missing or odd number falls back to the default); null when it isn't one. */
export function normaliseTimeRace(raw: unknown): TimeRaceMode | null {
  const r = obj(raw)
  if (r.kind !== 'timeRace') return null
  const d = DEFAULT_TIME_RACE
  const shard = obj(r.shard)
  const replay = obj(r.replay)
  const raid = obj(r.raid)
  // Two legends, of two types: the last fork's gates. Anything else is the default's pair.
  const legends = Array.isArray(r.legends)
    ? r.legends
        .map((x) => obj(x))
        .filter((x) => isType(x.type) && Number.isInteger(Number(x.dex)) && Number(x.dex) > 0)
        .map((x) => ({ type: x.type as PokeType, dex: Number(x.dex) }))
    : []
  const twoLegends =
    legends.length === 2 && legends[0]!.type !== legends[1]!.type && legends[0]!.dex !== legends[1]!.dex
  const items = Array.isArray(r.items)
    ? r.items
        .map((x) => obj(x))
        .filter((x) => typeof x.key === 'string' && x.key)
        .map((x) => ({ key: String(x.key), qty: int(x.qty, 1, 1, 99), weight: num(x.weight, 0, 0, 1e6) }))
    : d.items
  return {
    kind: 'timeRace',
    forks: forksOf(r.forks, d.forks),
    legends: twoLegends ? legends : d.legends,
    perFork: int(r.perFork, d.perFork, 1, 10),
    seconds: int(r.seconds, d.seconds, 30, 7200),
    shard: {
      chance: num(shard.chance, d.shard.chance, 0, 100),
      seconds: int(shard.seconds, d.shard.seconds, 0, 600),
    },
    items,
    speed: num(r.speed, d.speed, 1, 3),
    replay: {
      forks: forksOf(replay.forks, d.replay.forks),
      levelBonus: int(replay.levelBonus, d.replay.levelBonus, 0, 40),
      seconds: int(replay.seconds, d.replay.seconds, 30, 7200),
    },
    raid: {
      level: int(raid.level, d.raid.level, 1, 100),
      upgradeLevel: int(raid.upgradeLevel, d.raid.upgradeLevel, 1, 10),
      bars: int(raid.bars, d.raid.bars, 1, 10),
      teamCap: int(raid.teamCap, d.raid.teamCap, 1, 100),
    },
  }
}

/** The race of time and space is switched on for whoever is playing (Off by default; docs/15 §20). */
export const timeRaceRunsOn = (data: GameData): boolean => eventOpenTo(data.config.timeRace?.access, data)

/** The area's race, when it has one and the switch is on for the player; null otherwise (it plays as before). */
export function timeRaceModeOf(
  area: Pick<Area, 'mode'> | undefined | null,
  data: GameData,
): TimeRaceMode | null {
  if (!area?.mode || !timeRaceRunsOn(data)) return null
  return normaliseTimeRace(area.mode)
}

/** The raids' numbers of a race area (Lv.70, dice level 8, 3 bars, teams up to Lv.70); null elsewhere. */
export function timeRaceRaidRules(data: GameData, areaId: string | undefined): TimeRaceMode['raid'] | null {
  const area = areaId ? data.areas.find((a) => a.id === areaId) : undefined
  return timeRaceModeOf(area, data)?.raid ?? null
}
