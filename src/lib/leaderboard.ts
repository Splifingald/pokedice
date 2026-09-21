// The leaderboard: every cloud save (Google-signed-in players only), ranked by best level, campaign progress or
// Pokédex. The rows come from the `leaderboard()` SQL function; ranking happens here, against the game data.
import { linearAreas } from '@/engine/data'
import { regionSpecies } from '@/engine/regions'
import type { GameData, RegionId } from '@/engine/types'
import { getSupabase } from './supabase'
import { t } from '@/i18n'

export type LeaderboardTab = 'level' | 'progress' | 'dex'

export interface LeaderboardRow {
  /** Which region this row is about: a player who has played several appears once per region. */
  region: RegionId
  isMe: boolean
  name: string
  character: 'red' | 'green'
  team: { dex: number; level: number; shiny: boolean }[]
  pokedex: number
  maxLevel: number
  progress: Record<string, { cleared: boolean; gyms: number }>
}

export interface RankedRow extends LeaderboardRow {
  /** 1-based; tied players share a rank (1, 2, 2, 4). */
  rank: number
  /** What the tab sorts by, as shown on the row. */
  score: string
}

/** How far into this region: its main-route areas cleared, then gym / Elite Four battles won. */
function progressKey(row: LeaderboardRow, data: GameData): [number, number] {
  let cleared = 0
  let gyms = 0
  for (const a of linearAreas(data, row.region)) {
    if (row.progress[a.id]?.cleared) cleared++
    gyms += row.progress[a.id]?.gyms ?? 0
  }
  return [cleared, gyms]
}

/** The area the player is working on: the first area of their region's chain not cleared yet. */
export function frontierArea(row: LeaderboardRow, data: GameData): string {
  const chain = linearAreas(data, row.region)
  const next = chain.find((a) => !row.progress[a.id]?.cleared)
  return next ? next.name : t('ui.board.hall')
}

/** How many species this region's Pokédex holds; the National Dex when the region declares none. */
const dexTotal = (data: GameData, region: RegionId) => regionSpecies(data, region).size || data.speciesList.length

/** Every area of the region's chain cleared — there is nothing left of it to finish. */
export function clearedRegion(row: LeaderboardRow, data: GameData): boolean {
  const chain = linearAreas(data, row.region)
  return chain.length > 0 && chain.every((a) => row.progress[a.id]?.cleared)
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
    character: r.character === 'green' ? 'green' : 'red',
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

/** null when the cloud isn't configured on this site. */
export async function fetchLeaderboard(): Promise<LeaderboardRow[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('leaderboard')
  if (error) throw error
  return parseLeaderboard((data ?? []) as RawRow[])
}
