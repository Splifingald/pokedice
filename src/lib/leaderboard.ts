// The leaderboard: every cloud save (Google-signed-in players only), ranked by best level, campaign progress or
// Pokédex. The rows come from the `leaderboard()` SQL function; ranking happens here, against the game data.
import { linearAreas } from '@/engine/data'
import type { GameData } from '@/engine/types'
import { getSupabase } from './supabase'
import { t } from '@/i18n'

export type LeaderboardTab = 'level' | 'progress' | 'dex'

export interface LeaderboardRow {
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

/** How far into the campaign: main-route areas cleared, then gym / Elite Four battles won. */
function progressKey(row: LeaderboardRow, data: GameData): [number, number] {
  let cleared = 0
  for (const a of linearAreas(data)) if (row.progress[a.id]?.cleared) cleared++
  const gyms = Object.values(row.progress).reduce((n, p) => n + (p.gyms || 0), 0)
  return [cleared, gyms]
}

/** The area the player is working on: the first main-route area not cleared yet. */
export function frontierArea(row: LeaderboardRow, data: GameData): string {
  const chain = linearAreas(data)
  const next = chain.find((a) => !row.progress[a.id]?.cleared)
  return next ? next.name : 'Hall of Fame'
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

export function rankLeaderboard(rows: LeaderboardRow[], tab: LeaderboardTab, data: GameData): RankedRow[] {
  const keyed = rows.map((row) => ({ row, key: sortKey(row, tab, data) }))
  keyed.sort((a, b) => compare(a.key, b.key) || a.row.name.localeCompare(b.row.name))
  const total = data.speciesList.length
  let rank = 0
  return keyed.map(({ row, key }, i) => {
    // Ties share a rank on the tab's own measure and its tie-breakers.
    if (i === 0 || compare(keyed[i - 1]!.key, key) !== 0) rank = i + 1
    return { ...row, rank, score: scoreLabel(row, tab, data, total) }
  })
}

interface RawRow {
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
