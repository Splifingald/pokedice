// Versus, the cloud side: every registered team with both scores, setting your own, and recording a fight. The rows
// come from the SQL functions of supabase/migrations/0018_versus.sql; the fight itself is engine/versus.
import type { UpgradeLevels, VersusMon, VersusSide } from '@/engine'
import { getSupabase } from './supabase'

export type VersusBoardTab = 'attack' | 'defense'

export interface VersusEntry {
  userId: string
  isMe: boolean
  name: string
  character: 'red' | 'green'
  team: VersusMon[]
  levels: UpgradeLevels
  /** Which version of the team this is: a win is against one version. */
  version: number
  /** Teams this player has beaten (one per team version). */
  attackWins: number
  /** Fights this player's teams have won in defense. */
  defenseWins: number
  /** The signed-in player has already beaten this version of the team. */
  beaten: boolean
}

export interface RankedVersusEntry extends VersusEntry {
  /** 1-based; tied players share a rank (1, 2, 2, 4). */
  rank: number
  score: number
}

interface RawEntry {
  user_id: string
  is_me: boolean | null
  name: string | null
  character: string | null
  team: { dex: number; level: number; shiny?: boolean }[] | null
  levels: { comboLevels?: Record<string, number>; dieLevels?: Record<string, number> } | null
  version: number | null
  attack_wins: number | null
  defense_wins: number | null
  beaten: boolean | null
}

export function parseVersusBoard(raw: RawEntry[]): VersusEntry[] {
  return raw.map((r) => ({
    userId: r.user_id,
    isMe: !!r.is_me,
    name: r.name || 'Trainer',
    character: r.character === 'green' ? 'green' : 'red',
    team: (r.team ?? []).map((m) => ({ dex: Number(m.dex), level: Number(m.level), shiny: !!m.shiny })),
    levels: { comboLevels: r.levels?.comboLevels ?? {}, dieLevels: r.levels?.dieLevels ?? {} } as UpgradeLevels,
    version: Number(r.version) || 1,
    attackWins: Number(r.attack_wins) || 0,
    defenseWins: Number(r.defense_wins) || 0,
    beaten: !!r.beaten,
  }))
}

/** The fight-ready side of an entry: its clones and its upgrades. */
export const sideOf = (e: VersusEntry): VersusSide => ({ team: e.team, levels: e.levels })

/** Ranked by attack or defense wins; ties share a rank and are listed by name. Players with no win yet are left out. */
export function rankVersus(rows: VersusEntry[], tab: VersusBoardTab): RankedVersusEntry[] {
  const scoreOf = (r: VersusEntry) => (tab === 'attack' ? r.attackWins : r.defenseWins)
  const sorted = rows
    .filter((r) => scoreOf(r) > 0)
    .sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || scoreOf(sorted[i - 1]!) !== scoreOf(r)) rank = i + 1
    return { ...r, rank, score: scoreOf(r) }
  })
}

/** The opponents to show: everyone but you, the ones still to beat first, then the newest teams (the SQL order). */
export function opponentsOf(rows: VersusEntry[]): VersusEntry[] {
  const others = rows.filter((r) => !r.isMe)
  return [...others.filter((r) => !r.beaten), ...others.filter((r) => r.beaten)]
}

/** The known refusals of the Versus functions (their exception messages), for a translated line. */
export const VERSUS_ERRORS = [
  'versus_signed_out',
  'versus_team_size',
  'versus_no_save',
  'versus_not_eligible',
  'versus_self',
  'versus_no_team',
  'versus_gone',
  'versus_team_changed',
  'versus_already_won',
] as const
export type VersusErrorCode = (typeof VERSUS_ERRORS)[number] | 'versus_missing' | 'versus_unknown'

/** Which refusal an error is. `versus_missing` = the database has no Versus functions (0018_versus.sql not run). */
export function versusErrorCode(err: unknown): VersusErrorCode {
  const e = (err ?? {}) as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01') return 'versus_missing'
  return VERSUS_ERRORS.find((k) => e.message?.includes(k)) ?? 'versus_unknown'
}

/** null when the cloud isn't configured on this site. */
export async function fetchVersusBoard(): Promise<VersusEntry[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('versus_board')
  if (error) throw error
  return parseVersusBoard((data ?? []) as RawEntry[])
}

/** Registers the team (three Box ids, in fight order) from the cloud save. Returns the team's version. */
export async function setVersusTeam(ids: string[]): Promise<number> {
  const client = await getSupabase()
  if (!client) throw new Error('versus_signed_out')
  const { data, error } = await client.rpc('versus_set_team', { ids })
  if (error) throw error
  return Number(data) || 1
}

/** Writes a fight's result. Called before the fight plays, so leaving halfway can't take it back. */
export async function recordVersus(defender: VersusEntry, seed: number, won: boolean): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('versus_signed_out')
  const { error } = await client.rpc('versus_record', { defender: defender.userId, defender_version: defender.version, seed, won })
  if (error) throw error
}
