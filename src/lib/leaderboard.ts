// The leaderboard: every cloud save (signed-in players only, Google or Discord) played in the last 72 hours, ranked by best level,
// campaign progress, Pokédex, shinies caught or raids won. The rows come from the `leaderboard()` SQL function, which leaves inactive players out
// (migration 0023), and a region's row out until the player holds a badge there (0024); ranking happens here, against
// the game data. Level, Progression and Pokédex are one board per region; Shiny and Raids span every region (0054)
// and hold only the trainers with at least one shiny / raid won. Progression goes on past the region's last area into
// its Elite Rebattle's tiers (0076).
import { linearAreas } from '@/engine/data'
import { eventOn } from '@/engine/events'
import { leagueArea, rebattleRegions, rebattleTiers } from '@/engine/rebattle'
import { regionSpecies } from '@/engine/regions'
import type { GameData, RegionId } from '@/engine/types'
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'
import { t, tPlural } from '@/i18n'
import { realmArgs } from '@/lib/realm'

export type LeaderboardTab = 'level' | 'progress' | 'dex' | 'shiny' | 'raids'

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
  /** Shiny Pokémon owned over every region the player has played (a shiny is never released). */
  shinies: number
  /** Raids won — their raid Pokémon caught — over every region (D4). */
  raidsWon: number
  /**
   * The one row of this player that stands for them on the cross-region boards (their live region, 0054); undefined
   * from a database without 0054, whose boards stay per region.
   */
  lead?: boolean
  /** Per area; the League's entry also counts the Elite Rebattle tiers cleared (0076; absent = none, or an older card). */
  progress: Record<string, { cleared: boolean; gyms: number; rebattle?: number }>
  /** One of the caller's friends (docs/16), with their id so the row can open their card; null for anyone else. */
  friendId: string | null
  /** Their name shines gold ("I am just rich", docs/25); the server says so only while the switch is on for you. */
  rich: boolean
}

export interface RankedRow extends LeaderboardRow {
  /** 1-based; tied players share a rank (1, 2, 2, 4). */
  rank: number
  /** What the tab sorts by, as shown on the row. */
  score: string
}

/**
 * How many Elite Rebattle tiers the Progression board counts in this region: all of them while the rebattle is on for
 * the viewer and the region has one, else none (a board can't wait on tiers nobody can fight).
 */
export function rebattleOnBoard(data: GameData, region: RegionId): number {
  return eventOn(data, 'rebattle') && rebattleRegions(data).includes(region) ? rebattleTiers(data).length : 0
}

/** The row's Elite Rebattle tiers cleared, as far as the board counts them. */
function rebattleDone(row: LeaderboardRow, data: GameData): number {
  const league = leagueArea(data, row.region)
  return Math.min(league ? (row.progress[league.id]?.rebattle ?? 0) : 0, rebattleOnBoard(data, row.region))
}

/** How far into this region: its main-route areas cleared, then gym / Elite Four battles won, then rebattle tiers. */
function progressKey(row: LeaderboardRow, data: GameData): [number, number, number] {
  let cleared = 0
  let gyms = 0
  for (const a of linearAreas(data, row.region)) {
    if (row.progress[a.id]?.cleared) cleared++
    gyms += row.progress[a.id]?.gyms ?? 0
  }
  return [cleared, gyms, rebattleDone(row, data)]
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

/** Shiny and Raids rank a trainer once, over every region, not once per region played. */
export const crossRegion = (tab: LeaderboardTab) => tab === 'shiny' || tab === 'raids'

/** What Shiny and Raids count; a trainer at 0 on it isn't on that board at all. */
const crossScore = (row: LeaderboardRow, tab: LeaderboardTab) => (tab === 'shiny' ? row.shinies : row.raidsWon)

/**
 * The rows this tab's board ranks: the region's own, or one per trainer on a cross-region board. Shiny and Raids leave
 * out whoever has no shiny / no raid won yet (the user's ask of 2026-10-18): a long tail of zeros ranks nobody.
 */
function boardRows(rows: LeaderboardRow[], tab: LeaderboardTab, region: RegionId): LeaderboardRow[] {
  if (!crossRegion(tab)) return rows.filter((r) => r.region === region)
  const scored = rows.filter((r) => crossScore(r, tab) > 0)
  if (rows.every((r) => r.lead !== undefined)) return scored.filter((r) => r.lead)
  return scored.filter((r) => r.region === region)
}

/** The whole region cleared and, where the board counts it, every tier of its Elite Rebattle too. */
const progressDone = (row: LeaderboardRow, data: GameData) =>
  clearedRegion(row, data) && rebattleDone(row, data) >= rebattleOnBoard(data, row.region)

/**
 * Done with what this board measures: the level cap, the whole region and its rebattle cleared, or its Pokédex filled.
 * Such a player can't be passed and can't climb, so the board is no longer a race they're in — they
 * move to the Hall of Fame and the ranking below them closes up. Shinies have no ceiling: nobody leaves that board.
 */
export function atMax(row: LeaderboardRow, tab: LeaderboardTab, data: GameData, region: RegionId): boolean {
  if (tab === 'level') return row.maxLevel >= data.config.maxLevel
  if (tab === 'dex') return row.pokedex >= dexTotal(data, region)
  if (tab === 'shiny' || tab === 'raids') return false
  return progressDone(row, data)
}

function sortKey(row: LeaderboardRow, tab: LeaderboardTab, data: GameData): number[] {
  const progress = progressKey(row, data)
  // The tab's measure first, the others break ties.
  if (tab === 'level') return [row.maxLevel, ...progress, row.pokedex]
  if (tab === 'dex') return [row.pokedex, ...progress, row.maxLevel]
  if (tab === 'shiny') return [row.shinies, row.pokedex, ...progress, row.maxLevel]
  if (tab === 'raids') return [row.raidsWon, row.pokedex, ...progress, row.maxLevel]
  return [...progress, row.maxLevel, row.pokedex]
}

/** Where the row stands on Progression: the area being worked on, then the rebattle tier being fought. */
function progressLabel(row: LeaderboardRow, data: GameData): string {
  if (!clearedRegion(row, data) || progressDone(row, data)) return frontierArea(row, data)
  const tier = rebattleTiers(data)[rebattleDone(row, data)]!
  return t('ui.board.rebattle', { tier: t(`ui.events.rebattle.tier.${tier.id}`) })
}

function scoreLabel(row: LeaderboardRow, tab: LeaderboardTab, data: GameData, total: number): string {
  if (tab === 'level') return t('ui.common.level.short', { n: row.maxLevel })
  if (tab === 'dex') return `${row.pokedex}/${total}`
  if (tab === 'shiny') return tPlural('ui.board.shinies', row.shinies)
  if (tab === 'raids') return tPlural('ui.board.raids', row.raidsWon)
  return progressLabel(row, data)
}

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i]! - a[i]!
  return 0
}

/**
 * One board per region: the rows are filtered to `region` before they are ranked, so a Johto board ranks Johto Boxes,
 * Johto Pokédex completion and Johto progress only. A player who has played several regions appears on each. Shiny and
 * Raids are the exception: one board for every region, a player on it once.
 */
export function rankLeaderboard(rows: LeaderboardRow[], tab: LeaderboardTab, data: GameData, region: RegionId): RankedRow[] {
  const keyed = boardRows(rows, tab, region).map((row) => ({ row, key: sortKey(row, tab, data) }))
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
  const here = boardRows(rows, tab, region)
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
  /** Missing on a database that hasn't run 0032_leaderboard_shiny.sql. */
  shinies?: number | null
  progress: Record<string, { cleared?: boolean; gyms?: number; rebattle?: number }> | null
  /** Missing on a database that hasn't run 0035_events.sql. */
  raids_won?: number | null
  /** Missing on a database that hasn't run 0033_friends.sql. */
  is_friend?: boolean | null
  friend_id?: string | null
  /** Missing on a database that hasn't run 0049_general_upgrades.sql. */
  rich?: boolean | null
  /** Missing on a database that hasn't run 0054_leaderboard_cross_region.sql. */
  lead?: boolean | null
  shinies_all?: number | null
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
    // Without 0054 there is only the region's own count.
    shinies: Number(r.shinies_all ?? r.shinies) || 0,
    raidsWon: Number(r.raids_won) || 0,
    progress: Object.fromEntries(
      Object.entries(r.progress ?? {}).map(([id, p]) => [
        id,
        { cleared: !!p.cleared, gyms: Number(p.gyms) || 0, ...(Number(p.rebattle) > 0 && { rebattle: Number(p.rebattle) }) },
      ]),
    ),
    friendId: r.is_friend && r.friend_id ? String(r.friend_id) : null,
    rich: !!r.rich,
    ...(r.lead != null && { lead: !!r.lead }),
  }))
}

/**
 * Only you and your friends, still with the ranks of the whole board (docs/16): it answers "where are my friends on
 * the real board". Ranks are given before this filter, so they stay as they were.
 */
export function friendsOnly<T extends { isMe: boolean; friendId: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.isMe || !!r.friendId)
}

/** The real top of every board, always shown. */
export const BOARD_TOP = 100
/** Past the top, how many trainers either side of you are shown. */
export const BOARD_AROUND = 10

/** A shown row, or a run of hidden ones and how many it holds. */
export type BoardItem<T> = { row: T } | { gap: number }

/**
 * What a board shows of a long ranking (the user's ask of 2026-10-18): its real top 100, every friend wherever they
 * are, and you with the 10 trainers ahead of you and the 10 behind. Ranks are the whole board's, given before this;
 * each run of rows left out becomes one gap saying how many, the last one included so the board doesn't look ended.
 */
export function boardWindow<T extends { isMe: boolean; friendId: string | null }>(rows: T[]): BoardItem<T>[] {
  const me = rows.findIndex((r) => r.isMe)
  const items: BoardItem<T>[] = []
  let hidden = 0
  rows.forEach((row, i) => {
    const near = me >= 0 && Math.abs(i - me) <= BOARD_AROUND
    if (i >= BOARD_TOP && !near && !row.isMe && !row.friendId) {
      hidden++
      return
    }
    if (hidden) items.push({ gap: hidden })
    hidden = 0
    items.push({ row })
  })
  if (hidden) items.push({ gap: hidden })
  return items
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
  const { data, error } = await client.rpc('leaderboard', realmArgs())
  if (error) throw error
  return parseLeaderboard((data ?? []) as RawRow[])
}
