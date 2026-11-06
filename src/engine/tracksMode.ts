// Tracks in the Snow's settings (docs/64 §4.1), on their own as nightmareMode.ts and portalMode.ts are: an area's
// `mode` as the admin set it, cleaned and filled from the defaults, and the switch that turns it on.
import { eventOpenTo } from './events'
import type { Area, GameData, TracksMode, TracksRound } from './types'

/**
 * Moonlit Glade's hide and seek (the user's design, docs/64 §4.1): two rounds on a 3 × 3 glade (3 wild Pokémon, a
 * find, a cabin, 3 empty bushes, 5 taps a snowfall), then the shiny Stantler's on a 4 × 4 (5 wild, 2 finds, a cabin,
 * 7 empty, 7 taps), where it never hides next to the first bush opened. Prints on every bush opened.
 */
export const DEFAULT_TRACKS: TracksMode = {
  kind: 'tracks',
  rounds: [
    { size: 3, taps: 5, wild: 3, finds: 1, cabins: 1, apart: false },
    { size: 3, taps: 5, wild: 3, finds: 1, cabins: 1, apart: false },
    { size: 4, taps: 7, wild: 5, finds: 2, cabins: 1, apart: true },
  ],
  emptyPrintsOnly: false,
}

/** The biggest glade the screen lays out at phone width (a 6 × 6 still fits 360 px at 44 px a bush). */
export const TRACKS_MAX_SIZE = 6

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * One round as the admin left it: 2 to 6 bushes a side, at least one tap, and never more contents than bushes beside
 * Stantler's (the wild ones kept first, then the finds, then the cabins).
 */
export function normaliseTracksRound(raw: unknown, fallback: TracksRound): TracksRound {
  const r = obj(raw)
  const size = num(r.size, fallback.size, 2, TRACKS_MAX_SIZE)
  const room = size * size - 1
  const wild = num(r.wild, fallback.wild, 0, room)
  const finds = num(r.finds, fallback.finds, 0, room - wild)
  const cabins = num(r.cabins, fallback.cabins, 0, room - wild - finds)
  return {
    size,
    taps: num(r.taps, fallback.taps, 1, size * size),
    wild,
    finds,
    cabins,
    apart: typeof r.apart === 'boolean' ? r.apart : fallback.apart,
  }
}

/** Tracks in the Snow as the admin left it (a missing or odd number falls back to the default); null when it isn't. */
export function normaliseTracks(raw: unknown): TracksMode | null {
  const r = obj(raw)
  if (r.kind !== 'tracks') return null
  const d = DEFAULT_TRACKS
  const rounds = Array.isArray(r.rounds)
    ? r.rounds.slice(0, 9).map((x, i) => normaliseTracksRound(x, d.rounds[Math.min(i, d.rounds.length - 1)]!))
    : d.rounds
  return {
    kind: 'tracks',
    rounds: rounds.length ? rounds : d.rounds,
    emptyPrintsOnly: typeof r.emptyPrintsOnly === 'boolean' ? r.emptyPrintsOnly : d.emptyPrintsOnly,
  }
}

/** Tracks in the Snow is switched on for whoever is playing (Off by default; docs/15 §20). */
export const tracksRunsOn = (data: GameData): boolean => eventOpenTo(data.config.tracks?.access, data)

/** The area's Tracks in the Snow, when it has one and the switch is on for the player; null otherwise (a plain area). */
export function tracksModeOf(area: Pick<Area, 'mode'> | undefined | null, data: GameData): TracksMode | null {
  if (!area?.mode || !tracksRunsOn(data)) return null
  return normaliseTracks(area.mode)
}
