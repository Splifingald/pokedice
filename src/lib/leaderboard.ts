// The leaderboard: every cloud save (Google-signed-in players only) played in the last 72 hours, ranked by best level,
// campaign progress or Pokédex. The rows come from the `leaderboard()` SQL function, which leaves inactive players out
// (migration 0023), and a region's row out until the player holds a badge there (0024); ranking happens here, against
// the game data.
import { linearAreas } from '@/engine/data'
import { regionSpecies } from '@/engine/regions'
import type { GameData, RegionId } from '@/engine/types'
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'
import { t } from '@/i18n'

export type LeaderboardTab = 'level' | 'progress' | 'dex'

export interface LeaderboardRow {
  /** Which region this row is about: a player who has played several appears once per region. */
  region: RegionId
  isMe: boolean
  name: string
  /** Their look: an id from src/lib/avatars, already checked. */
  avatar: string
  team: { dex: number; level: number; shiny: boolean }[]
  pokedex: number
  maxLevel: number
  /** Per area of the region, from leaderboard() (a database without 0029). */
  progress?: Record<string, { cleared: boolean; gyms: number }>
  /** The same, already counted over the region's main route, from leaderboard_region() (0029). They win over `progress`. */
  cleared?: number
  gyms?: number
}

export interface RankedRow extends LeaderboardRow {
  /** 1-based; tied players share a rank (1, 2, 2, 4). */
  rank: number
  /** What the tab sorts by, as shown on the row. */
  score: string
}

/** How far into this region: its main-route areas cleared, then gym / Elite Four battles won. */
function progressKey(row: LeaderboardRow, data: GameData): [number, number] {
  if (row.cleared != null) return [row.cleared, row.gyms ?? 0]
  let cleared = 0
  let gyms = 0
  for (const a of linearAreas(data, row.region)) {
    if (row.progress?.[a.id]?.cleared) cleared++
    gyms += row.progress?.[a.id]?.gyms ?? 0
  }
  return [cleared, gyms]
}

/**
 * The area the player is working on: the first area of their region's chain not cleared yet. From a count, the one
 * after the cleared ones: the chain unlocks one area at a time, so what is cleared is always its start.
 */
export function frontierArea(row: LeaderboardRow, data: GameData): string {
  const chain = linearAreas(data, row.region)
  const next = row.cleared != null ? chain[row.cleared] : chain.find((a) => !row.progress?.[a.id]?.cleared)
  return next ? next.name : t('ui.board.hall')
}

/** How many species this region's Pokédex holds; the National Dex when the region declares none. */
const dexTotal = (data: GameData, region: RegionId) => regionSpecies(data, region).size || data.speciesList.length

/** Every area of the region's chain cleared — there is nothing left of it to finish. */
export function clearedRegion(row: LeaderboardRow, data: GameData): boolean {
  const chain = linearAreas(data, row.region)
  if (row.cleared != null) return chain.length > 0 && row.cleared >= chain.length
  return chain.length > 0 && chain.every((a) => row.progress?.[a.id]?.cleared)
}

/**
 * Done with what this board measures: the level cap, the whole region cleared, or its Pokédex filled.
 * Such a player can't be passed and can't climb, so the board is no longer a race they're in — they
 * move to the Hall of Fame and the ranking below them closes up.
 */
export function atMax(row: LeaderboardRow, tab: LeaderboardTab, data: GameData, region: RegionId): boolean {
  if (tab === 'level') return row.maxLevel >= data.config.maxLevel
  if (tab === 'dex') return row.pokedex >= dexTotal(data, region)
  return clearedRegion(row, data)
}

function sortKey(row: LeaderboardRow, tab: LeaderboardTab, data: GameData): number[] {
  const [cleared, gyms] = progressKey(row, data)
  // The tab's measure first, the others break ties.
  if (tab === 'level') return [row.maxLevel, cleared, gyms, row.pokedex]
  if (tab === 'dex') return [row.pokedex, cleared, gyms, row.maxLevel]
  return [cleared, gyms, row.maxLevel, row.pokedex]
}

function scoreLabel(row: LeaderboardRow, tab: LeaderboardTab, data: GameData, total: number): string {
  if (tab === 'level') return t('ui.common.level.short', { n: row.maxLevel })
  if (tab === 'dex') return `${row.pokedex}/${total}`
  return frontierArea(row, data)
}

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i]! - a[i]!
  return 0
}

/**
 * One board per region: the rows are filtered to `region` before they are ranked, so a Johto board ranks Johto Boxes,
 * Johto Pokédex completion and Johto progress only. A player who has played several regions appears on each.
 */
export function rankLeaderboard(rows: LeaderboardRow[], tab: LeaderboardTab, data: GameData, region: RegionId): RankedRow[] {
  const keyed = rows.filter((r) => r.region === region).map((row) => ({ row, key: sortKey(row, tab, data) }))
  keyed.sort((a, b) => compare(a.key, b.key) || a.row.name.localeCompare(b.row.name))
  // The dex score is out of what this region actually holds, not the National Dex.
  const total = dexTotal(data, region)
  let rank = 0
  return keyed.map(({ row, key }, i) => {
    // Ties share a rank on the tab's own measure and its tie-breakers.
    if (i === 0 || compare(keyed[i - 1]!.key, key) !== 0) rank = i + 1
    return { ...row, rank, score: scoreLabel(row, tab, data, total) }
  })
}

/**
 * The board and its Hall of Fame, split on this tab's own measure: whoever has maxed it out is ranked
 * separately, so the board itself only holds players still climbing (and ranks them 1..n).
 */
export function splitLeaderboard(
  rows: LeaderboardRow[],
  tab: LeaderboardTab,
  data: GameData,
  region: RegionId,
): { board: RankedRow[]; hall: RankedRow[] } {
  const here = rows.filter((r) => r.region === region)
  const done = (r: LeaderboardRow) => atMax(r, tab, data, region)
  return {
    board: rankLeaderboard(here.filter((r) => !done(r)), tab, data, region),
    hall: rankLeaderboard(here.filter(done), tab, data, region),
  }
}

interface RawRow {
  region: string | null
  is_me: boolean | null
  name: string | null
  character: string | null
  team: { dex: number; level: number; shiny?: boolean }[] | null
  pokedex: number | null
  max_level: number | null
  progress: Record<string, { cleared?: boolean; gyms?: number }> | null
}

export function parseLeaderboard(raw: RawRow[]): LeaderboardRow[] {
  return raw.map((r) => ({
    // Rows from a database that predates regions are Kanto's.
    region: r.region || 'kanto',
    isMe: !!r.is_me,
    name: r.name || 'Trainer',
    // The column carries the look (migration 0022); an unknown id shows as Red.
    avatar: avatarOf(r.character).id,
    team: (r.team ?? []).map((m) => ({ dex: Number(m.dex), level: Number(m.level), shiny: !!m.shiny })),
    pokedex: Number(r.pokedex) || 0,
    maxLevel: Number(r.max_level) || 0,
    progress: Object.fromEntries(
      Object.entries(r.progress ?? {}).map(([id, p]) => [id, { cleared: !!p.cleared, gyms: Number(p.gyms) || 0 }]),
    ),
  }))
}

/** A short reason for the error line. PGRST202 = the database has no leaderboard() (migration 0011 not run). */
export function leaderboardError(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883') return 'The leaderboard() function is missing from the database (run 0011_leaderboard.sql).'
  return [e.code, e.message].filter(Boolean).join(' — ') || String(err)
}

interface RawRegionRow {
  is_me: boolean | null
  name: string | null
  character: string | null
  team: { dex: number; level: number; shiny?: boolean }[] | null
  pokedex: number | null
  max_level: number | null
  cleared: number | null
  gyms: number | null
}

/** leaderboard_region()'s rows (0029): one region, the progress already counted. */
export function parseRegionBoard(raw: RawRegionRow[], region: RegionId): LeaderboardRow[] {
  return raw.map((r) => ({
    region,
    isMe: !!r.is_me,
    name: r.name || 'Trainer',
    avatar: avatarOf(r.character).id,
    team: (r.team ?? []).map((m) => ({ dex: Number(m.dex), level: Number(m.level), shiny: !!m.shiny })),
    pokedex: Number(r.pokedex) || 0,
    maxLevel: Number(r.max_level) || 0,
    cleared: Number(r.cleared) || 0,
    gyms: Number(r.gyms) || 0,
  }))
}

/** A board fetched less than this long ago is shown again rather than downloaded again (docs/11 §6.2). */
export const BOARD_CACHE_MS = 5 * 60_000
const CACHE_KEY = 'pokedice.board'

type Cached = { at: number; user: string | null; region: string; rows: LeaderboardRow[] }
let memo: Cached | null = null

function readCache(user: string | null, region: string, now: number): LeaderboardRow[] | null {
  if (!memo) {
    try {
      memo = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null
    } catch {
      memo = null
    }
  }
  const c = memo
  return c && c.user === user && c.region === region && now - c.at >= 0 && now - c.at < BOARD_CACHE_MS ? c.rows : null
}

function writeCache(entry: Cached) {
  memo = entry
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* storage blocked or full: the in-memory copy still serves this page */
  }
}

/** Forget the cached board (tests, or after something that changes it on purpose). */
export function clearBoardCache() {
  memo = null
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing to clear */
  }
}

const missingFunction = (e: { code?: string }) => e.code === 'PGRST202' || e.code === '42883'

/**
 * One region's board, for `user` (null = signed out). Reopened within BOARD_CACHE_MS, the same rows come back without a
 * request. A database that hasn't run 0029 yet answers through the older leaderboard(), every region at once.
 * null when the cloud isn't configured on this site.
 */
export async function fetchLeaderboard(region: RegionId, user: string | null, now = Date.now()): Promise<LeaderboardRow[] | null> {
  const cached = readCache(user, region, now)
  if (cached) return cached
  const client = await getSupabase()
  if (!client) return null
  let rows: LeaderboardRow[]
  const fresh = await client.rpc('leaderboard_region', { p_region: region })
  if (!fresh.error) {
    rows = parseRegionBoard((fresh.data ?? []) as RawRegionRow[], region)
  } else if (missingFunction(fresh.error)) {
    const old = await client.rpc('leaderboard')
    if (old.error) throw old.error
    rows = parseLeaderboard((old.data ?? []) as RawRow[]).filter((r) => r.region === region)
  } else {
    throw fresh.error
  }
  writeCache({ at: now, user, region, rows })
  return rows
}
