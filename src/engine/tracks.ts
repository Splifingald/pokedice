// Tracks in the Snow (docs/61 §4.1, the user's design): Moonlit Glade's mode, hide and seek with Stantler. Each round
// is a glade of snowy bushes; the player opens them one by one. A bush holds a wild Pokémon (a fight, catchable), a
// find, a warm cabin (a Pokémon Center's heal) or nothing, and once opened shows hoofprints pointing at Stantler. The
// first bush opened is never Stantler's: it is hidden only then, away from it (on the 4 × 4 not next to it either).
// Out of taps, snow falls: the prints vanish, Stantler moves, the bushes refill. Rounds before the last end on a wild
// Stantler; the last on the area's boss, the shiny Stantler, which bolts to another bush (a fresh glade) when the
// throw misses. Caught, the glade closes for good. A cleared round is kept through a wipe or a trip Home. Every
// number is the area's (`Area.mode`, Admin → Areas), the switch the admin's (`tracks`); every draw is the engine's rng.
import { rollWild, type Encounter, type EncounterContext } from './encounters'
import { drawLoot } from './items'
import { instanceMaxHp } from './progression'
import type { Rng } from './rng'
import { tracksModeOf } from './tracksMode'
import type {
  Area,
  AreaProgress,
  BossDef,
  GameData,
  PokemonInstance,
  SaveData,
  TracksBush,
  TracksField,
  TracksMode,
  TracksRound,
  TracksState,
} from './types'

export {
  DEFAULT_TRACKS,
  normaliseTracks,
  normaliseTracksRound,
  TRACKS_MAX_SIZE,
  tracksModeOf,
  tracksRunsOn,
} from './tracksMode'

const EMPTY: TracksState = { active: false, round: 0 }

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

const modeAt = (data: GameData, areaId: string | null | undefined): TracksMode | null =>
  tracksModeOf(areaOf(data, areaId), data)

/** Where Tracks in the Snow stands in this area of the region being played (nothing yet: not begun). */
export const tracksStateOf = (save: SaveData, areaId: string): TracksState =>
  save.areaProgress[areaId]?.tracks ?? EMPTY

function withTracks(save: SaveData, areaId: string, tracks: TracksState): SaveData {
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [areaId]: { ...progressAt(save, areaId), tracks } },
  }
}

const teamIds = (save: SaveData) => new Set(save.team)

/** The whole team back to full HP, K.O. or not (the way in, a wipe at the glade's edge). */
function healTeam(save: SaveData, data: GameData): SaveData {
  const team = teamIds(save)
  const heal = (p: PokemonInstance) =>
    team.has(p.id) && data.species[p.dex] ? { ...p, currentHp: instanceMaxHp(p, data) } : p
  return { ...save, box: save.box.map(heal) }
}

/** The round under way (`index`, 0-based) and its glade; the last round's once every round is cleared. */
export function tracksRoundOf(
  mode: TracksMode,
  round: number,
): { index: number; spec: TracksRound; last: boolean } {
  const index = Math.max(0, Math.min(round, mode.rounds.length - 1))
  return { index, spec: mode.rounds[index]!, last: index === mode.rounds.length - 1 }
}

/** A glade before its first bush is opened: nothing hidden yet, every tap left. */
export const freshTracksField = (spec: TracksRound): TracksField => ({
  taps: spec.taps,
  bushes: null,
  opened: [],
})

/**
 * Who hides in the glade: the area's boss (the shiny Stantler), whose species the rounds before the last end on too.
 * Null when the area has no boss: then every round ends on a wild one of the pool's first species, the last included.
 */
export const tracksBoss = (area: Area): BossDef | null => area.legendaryBoss?.[0] ?? null

/** The species hiding in the glade's bushes. */
export const tracksQuarryDex = (area: Area): number | null =>
  tracksBoss(area)?.dex ?? area.wildPool[0]?.dex ?? null

// ------------------------------------------------------------------ the glade's geometry

/** The 8 bushes around one (fewer on an edge or in a corner), as indices row by row. */
export function tracksNeighbours(index: number, size: number): number[] {
  const x = index % size
  const y = Math.floor(index / size)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx)
    }
  return out
}

/** Where hoofprints point: one of 8 directions, north at the top of the glade. */
export type TracksPrint = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * The way from a bush to Stantler's, by row and column: straight along the row or column they share, else the
 * diagonal of its quarter. So a print never sends the player past it: everything it points at is on that side.
 */
export function tracksPrintDirection(from: number, to: number, size: number): TracksPrint {
  const dx = Math.sign((to % size) - (from % size))
  const dy = Math.sign(Math.floor(to / size) - Math.floor(from / size))
  const ns = dy < 0 ? 'n' : dy > 0 ? 's' : ''
  const ew = dx < 0 ? 'w' : dx > 0 ? 'e' : ''
  return (ns + ew || 'n') as TracksPrint
}

/** Fisher–Yates on the engine's rng. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * The glade's bushes once its first (`first`) is opened: Stantler anywhere but there (and, `apart`, but next to it;
 * where that leaves nowhere, a small glade, anywhere but there), then the wild Pokémon, finds and cabins shuffled over
 * the rest, empty bushes left over. The first bush can hold anything but Stantler.
 */
export function hideStantler(spec: TracksRound, first: number, rng: Rng): TracksBush[] {
  const n = spec.size * spec.size
  const all = Array.from({ length: n }, (_, i) => i)
  const near = new Set(spec.apart ? tracksNeighbours(first, spec.size) : [])
  const far = all.filter((i) => i !== first && !near.has(i))
  const spots = far.length ? far : all.filter((i) => i !== first)
  const stantler = spots[rng.int(0, spots.length - 1)]!
  const bushes: TracksBush[] = all.map(() => 'empty')
  bushes[stantler] = 'stantler'
  const rest = shuffle(
    all.filter((i) => i !== stantler),
    rng,
  )
  const contents: TracksBush[] = [
    ...Array<TracksBush>(spec.wild).fill('wild'),
    ...Array<TracksBush>(spec.finds).fill('find'),
    ...Array<TracksBush>(spec.cabins).fill('cabin'),
  ]
  contents.slice(0, rest.length).forEach((c, k) => (bushes[rest[k]!] = c))
  return bushes
}

/**
 * The prints an opened bush shows, pointing at Stantler: none on Stantler's own, none on a bush that held something
 * when the admin keeps them for empty bushes only, none before Stantler is hidden.
 */
export function tracksPrintAt(
  mode: TracksMode,
  field: TracksField,
  size: number,
  index: number,
): TracksPrint | null {
  const bushes = field.bushes
  if (!bushes || !field.opened.includes(index)) return null
  const at = bushes.indexOf('stantler')
  if (at < 0 || at === index) return null
  if (mode.emptyPrintsOnly && bushes[index] !== 'empty') return null
  return tracksPrintDirection(index, at, size)
}

// ------------------------------------------------------------------ in the glade or not

/** The glade is being searched here (switched on, begun, not over). */
export function inTracks(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = areaOf(data, areaId)
  return !!area && !!tracksModeOf(area, data) && tracksStateOf(save, area.id).active
}

/** The shiny Stantler is caught: the glade is closed for good. */
export const tracksWon = (save: SaveData, data: GameData, areaId: string): boolean =>
  !!modeAt(data, areaId) && !!tracksStateOf(save, areaId).won

/** The glade can be entered here: switched on, not over, not already under way. */
export function canStartTracks(save: SaveData, data: GameData, areaId: string): boolean {
  if (!modeAt(data, areaId)) return false
  const s = tracksStateOf(save, areaId)
  return !s.active && !s.won
}

/** Its field as it stands (a fresh one when none was kept), with its round. Null outside the glade. */
export function tracksField(
  save: SaveData,
  data: GameData,
  areaId: string,
): { field: TracksField; spec: TracksRound; index: number; total: number; last: boolean } | null {
  const mode = modeAt(data, areaId)
  const s = tracksStateOf(save, areaId)
  if (!mode || !s.active) return null
  const r = tracksRoundOf(mode, s.round)
  return {
    field: s.field ?? freshTracksField(r.spec),
    spec: r.spec,
    index: r.index,
    total: mode.rounds.length,
    last: r.last,
  }
}

/** Stantler was found and its fight (or catch) is under way. */
export const tracksFound = (save: SaveData, data: GameData, areaId: string | null | undefined): boolean =>
  !!areaId && inTracks(save, data, areaId) && !!tracksStateOf(save, areaId).field?.found

// ------------------------------------------------------------------ the search

/**
 * ENTER THE GLADE's BEGIN: the team fully healed, the round the player had reached (cleared rounds are kept), a fresh
 * glade, the try counted. Null when it can't begin here.
 */
export function startTracks(save: SaveData, data: GameData, areaId: string): SaveData | null {
  const mode = modeAt(data, areaId)
  if (!mode || !canStartTracks(save, data, areaId)) return null
  const before = tracksStateOf(save, areaId)
  const round = Math.min(before.round, mode.rounds.length - 1)
  return withTracks(healTeam(save, data), areaId, {
    active: true,
    round,
    field: freshTracksField(tracksRoundOf(mode, round).spec),
    tries: (before.tries ?? 0) + 1,
  })
}

export interface BushOpened {
  save: SaveData
  index: number
  bush: TracksBush
  /** Its prints, read before any snowfall (the screen shows them on the bush as the snow comes). */
  print: TracksPrint | null
  /** That was the last tap: snow fell, a fresh glade waits (Stantler hidden again after its first bush). */
  snowfall: boolean
}

/**
 * A bush opened: its tap is spent and it shows what it held (Stantler is hidden first, when it's the glade's first
 * bush). Stantler's: found (its fight next). Otherwise, the last tap brings the snow: a fresh glade. Null when it
 * can't be opened (not in the glade, Stantler already found, a bush opened already or not there).
 */
export function openBush(
  save: SaveData,
  data: GameData,
  areaId: string,
  index: number,
  rng: Rng,
): BushOpened | null {
  const mode = modeAt(data, areaId)
  const at = tracksField(save, data, areaId)
  if (!mode || !at) return null
  const { field, spec } = at
  const n = spec.size * spec.size
  if (field.found || !Number.isInteger(index) || index < 0 || index >= n || field.opened.includes(index))
    return null
  const bushes = field.bushes ?? hideStantler(spec, index, rng)
  const opened: TracksField = { taps: Math.max(0, field.taps - 1), bushes, opened: [...field.opened, index] }
  const bush = bushes[index]!
  const print = tracksPrintAt(mode, opened, spec.size, index)
  const s = tracksStateOf(save, areaId)
  if (bush === 'stantler')
    return {
      save: withTracks(save, areaId, { ...s, field: { ...opened, found: true } }),
      index,
      bush,
      print,
      snowfall: false,
    }
  const snowfall = opened.taps <= 0
  const next: TracksField = snowfall ? { ...freshTracksField(spec), snowed: true } : opened
  return { save: withTracks(save, areaId, { ...s, field: next }), index, bush, print, snowfall }
}

/**
 * What an opened bush brings: a wild Pokémon of the area's pool (not Stantler's species: Stantler is only ever the one
 * found), a find of its loot (with what's left of the loot deck), a cabin's heal (a Pokémon Center), or Stantler: a
 * wild one of its species at the pool's levels for it before the last round, the area's boss in the last. Null for an
 * empty bush (or one the area can't fill: it is empty then).
 */
export function tracksEncounter(
  ctx: EncounterContext,
  bush: TracksBush,
  last: boolean,
  rng: Rng,
): { encounter: Encounter; lootDeck: string[] | null } | null {
  const { area } = ctx
  const quarry = tracksQuarryDex(area)
  if (bush === 'cabin') return { encounter: { kind: 'center', forced: true }, lootDeck: null }
  if (bush === 'find') {
    const loot = drawLoot(area, ctx.progress, ctx.data, rng)
    return loot
      ? {
          encounter: { kind: 'item', entryId: loot.entry.id, itemKey: loot.entry.itemKey, qty: loot.qty },
          lootDeck: loot.lootDeck,
        }
      : null
  }
  if (bush === 'wild') {
    const others = area.wildPool.filter((w) => w.dex !== quarry)
    const wild = rollWild(
      { ...ctx, area: { ...area, wildPool: others.length ? others : area.wildPool } },
      rng,
    )
    return wild ? { encounter: wild, lootDeck: null } : null
  }
  if (bush !== 'stantler' || quarry == null || !ctx.data.species[quarry]) return null
  const boss = tracksBoss(area)
  if (last && boss)
    return {
      encounter: { kind: 'boss', dex: boss.dex, level: boss.level, ...(boss.shiny && { shiny: true }) },
      lootDeck: null,
    }
  const entry = area.wildPool.find((w) => w.dex === quarry)
  const lo = entry?.minLevel ?? area.minLevel
  const hi = Math.max(lo, entry?.maxLevel ?? area.maxLevel)
  // A plain one: never shiny, so the shiny Stantler stays the last round's.
  return {
    encounter: { kind: 'wild', dex: quarry, level: rng.int(lo, hi), isNew: !ctx.pokedex.includes(quarry) },
    lootDeck: null,
  }
}

// ------------------------------------------------------------------ how a round ends

/**
 * Stantler, found, is K.O.: before the last round, the round is cleared (kept for good) and the next one's glade
 * waits; in the last, its catch decides (the field stays as it is). With no boss to catch, the last one's K.O. wins
 * the glade. `round`: the rounds cleared now. Null when no Stantler was found.
 */
export function tracksQuarryDown(
  save: SaveData,
  data: GameData,
  areaId: string,
): { save: SaveData; round: number; total: number; last: boolean } | null {
  const mode = modeAt(data, areaId)
  const area = areaOf(data, areaId)
  const s = tracksStateOf(save, areaId)
  if (!mode || !area || !s.active || !s.field?.found) return null
  const total = mode.rounds.length
  const { last } = tracksRoundOf(mode, s.round)
  if (last && tracksBoss(area)) return { save, round: s.round, total, last: true }
  if (last) return { save: tracksCaught(save, data, areaId), round: total, total, last: true }
  const round = s.round + 1
  return {
    save: withTracks(save, areaId, { ...s, round, field: freshTracksField(tracksRoundOf(mode, round).spec) }),
    round,
    total,
    last: false,
  }
}

/**
 * The shiny Stantler caught: every round cleared, the glade closed for good (`tracksWon`); the outro is due. Unchanged
 * outside the glade.
 */
export function tracksCaught(save: SaveData, data: GameData, areaId: string): SaveData {
  const mode = modeAt(data, areaId)
  const s = tracksStateOf(save, areaId)
  if (!mode || !s.active) return save
  return withTracks(save, areaId, {
    active: false,
    round: mode.rounds.length,
    won: true,
    wonSeen: false,
    ...(s.tries != null && { tries: s.tries }),
  })
}

/**
 * Back on the glade with Stantler found but not taken (fled from its fight, the throw missed, a draw): it bolts to
 * another bush, a fresh glade of the same round with the same rules. Unchanged when nothing was found.
 */
export function tracksBolt(save: SaveData, data: GameData, areaId: string): SaveData {
  const mode = modeAt(data, areaId)
  const s = tracksStateOf(save, areaId)
  if (!mode || !s.active || !s.field?.found) return save
  return withTracks(save, areaId, {
    ...s,
    field: { ...freshTracksField(tracksRoundOf(mode, s.round).spec), bolted: true },
  })
}

/** The outro has played: the glade is closed (`isAreaClosed`). */
export function markTracksWonSeen(save: SaveData, areaId: string): SaveData {
  const s = tracksStateOf(save, areaId)
  return s.won && !s.wonSeen ? withTracks(save, areaId, { ...s, wonSeen: true }) : save
}

/** The outro is due here. */
export const tracksOutroDue = (save: SaveData, data: GameData, areaId: string): boolean =>
  tracksWon(save, data, areaId) && !tracksStateOf(save, areaId).wonSeen

/**
 * The whole team K.O. in the glade: back at its edge, the team healed, XP, ₽ and items kept, the rounds cleared kept;
 * the glade being searched is gone (a fresh one next time). Unchanged outside it.
 */
export function tracksWipe(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!inTracks(save, data, areaId)) return save
  const s = tracksStateOf(save, areaId)
  return withTracks(healTeam(save, data), areaId, {
    active: false,
    round: s.round,
    ...(s.tries != null && { tries: s.tries }),
  })
}
