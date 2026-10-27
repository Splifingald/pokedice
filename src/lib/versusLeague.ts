// The weekly Versus league, the cloud side (docs/44): this week's (or last week's) group, the 3 opponents offered,
// starting a match (recorded as a leave before it's fought) and its result. The rows come from the SQL functions of
// supabase/migrations/0082_versus_league.sql; the rules and the fight are the engine's (engine/versusLeague).
import type { VersusMon, VersusPowers } from '@/engine'
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'
import { parsePowers } from './versus'

export interface LeagueRow {
  /** A player's id; a bot's looks the same to everyone but the admin. */
  id: string
  isMe: boolean
  name: string
  avatar: string
  team: VersusMon[]
  trophies: number
  /** 1-based; tied players share a rank (and its reward). */
  rank: number
  rich: boolean
  /** The admin alone is told (null for everyone else). */
  bot: boolean | null
}

export interface LeagueHome {
  /** The week's Monday, "2026-10-26". */
  week: string
  /** When it ends (ms). */
  endsAt: number
  /** The player has a place in a group this week (from their first match). */
  joined: boolean
  trophies: number
  rows: LeagueRow[]
  /** The week's rewards have been sent. */
  closed: boolean
  /** A match started and not finished: it counts as a leave. */
  pending: number | null
}

export interface LeagueChoice {
  slot: number
  name: string
  avatar: string
  team: VersusMon[]
  powers: VersusPowers
  trophies: number
  rich: boolean
  bot: boolean | null
}

/** A match the server has opened: what the fight needs. */
export interface LeagueMatchStart {
  matchId: number
  seed: number
  foe: LeagueChoice
}

const mons = (raw: unknown): VersusMon[] =>
  Array.isArray(raw)
    ? raw.map((m: { dex?: unknown; level?: unknown; shiny?: unknown }) => ({
        dex: Number(m?.dex) || 1,
        level: Number(m?.level) || 50,
        shiny: !!m?.shiny,
      }))
    : []

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

export function parseLeagueHome(raw: unknown): LeagueHome {
  const o = (raw ?? {}) as Record<string, unknown>
  const rows = Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]) : []
  const ends = Date.parse(String(o.endsAt ?? ''))
  return {
    week: String(o.week ?? ''),
    endsAt: Number.isFinite(ends) ? ends : 0,
    joined: o.joined === true,
    trophies: Number(o.trophies) || 0,
    closed: o.closed === true,
    pending: o.pending == null ? null : Number(o.pending),
    rows: rows.map((r) => ({
      id: String(r.id ?? ''),
      isMe: r.isMe === true,
      name: String(r.name || 'Trainer'),
      avatar: avatarOf(r.avatar as string).id,
      team: mons(r.team),
      trophies: Number(r.trophies) || 0,
      rank: Number(r.rank) || 1,
      rich: r.rich === true,
      bot: bool(r.bot),
    })),
  }
}

interface RawChoice {
  slot: number
  name: string | null
  avatar: string | null
  team: unknown
  powers: { gems?: unknown; gmax?: unknown; z?: unknown } | null
  trophies: number | null
  rich: boolean | null
  is_bot?: boolean | null
}

const parseChoice = (r: RawChoice): LeagueChoice => ({
  slot: Number(r.slot) || 1,
  name: r.name || 'Trainer',
  avatar: avatarOf(r.avatar).id,
  team: mons(r.team),
  powers: parsePowers(r.powers),
  trophies: Number(r.trophies) || 0,
  rich: !!r.rich,
  bot: bool(r.is_bot),
})

export const parseLeagueChoices = (raw: RawChoice[]): LeagueChoice[] =>
  raw.map(parseChoice).sort((a, b) => a.slot - b.slot)

/** The known refusals of the league's functions (their exception messages), for a translated line. */
export const LEAGUE_ERRORS = [
  'versus_signed_out',
  'versus_no_team',
  'versus_league_off',
  'versus_league_no_choice',
  'versus_league_no_match',
  'versus_league_done',
  'versus_league_week_over',
  'versus_league_bad_result',
  'versus_league_item',
  'versus_league_too_fast',
] as const
export type LeagueErrorCode =
  (typeof LEAGUE_ERRORS)[number] | 'versus_league_missing' | 'versus_league_unknown'

/** Which refusal an error is. `versus_league_missing`: the database has no league (0082_versus_league.sql not run). */
export function leagueErrorCode(err: unknown): LeagueErrorCode {
  const e = (err ?? {}) as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01') return 'versus_league_missing'
  return LEAGUE_ERRORS.find((k) => e.message?.includes(k)) ?? 'versus_league_unknown'
}

/** The last home fetched, and when: Home's Versus card reads it rather than asking again. */
let lastHome: { at: number; home: LeagueHome | null } | null = null

/** This week's league (or last week's): null when the cloud isn't configured on this site. */
export async function fetchLeagueHome(last = false): Promise<LeagueHome | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('versus_league_home', { p_last: last })
  if (error) throw error
  const home = parseLeagueHome(data)
  if (!last) lastHome = { at: Date.now(), home }
  return home
}

/** This week's league, fetched at most once every `maxAgeMs` (the Versus screen always fetches it fresh). */
export async function leagueHomeCached(maxAgeMs = 10 * 60_000): Promise<LeagueHome | null> {
  if (lastHome && Date.now() - lastHome.at < maxAgeMs) return lastHome.home
  return fetchLeagueHome()
}

/** The 3 opponents offered (kept by the server until one is fought). */
export async function fetchLeagueChoices(): Promise<LeagueChoice[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('versus_league_choices')
  if (error) throw error
  return parseLeagueChoices((data ?? []) as RawChoice[])
}

/** Opens a match against offer `slot`: from here on it counts as a leave until its result is in. */
export async function startLeagueMatch(slot: number): Promise<LeagueMatchStart> {
  const client = await getSupabase()
  if (!client) throw new Error('versus_signed_out')
  const { data, error } = await client.rpc('versus_league_start', { p_slot: slot })
  if (error) throw error
  const r = ((data ?? []) as (RawChoice & { match_id: number; seed: number })[])[0]
  if (!r) throw new Error('versus_league_no_choice')
  lastHome = null
  return { matchId: Number(r.match_id), seed: Number(r.seed), foe: parseChoice({ ...r, slot }) }
}

/** The match's result: the server works out the trophies from it and checks it. Returns the change and the new total. */
export async function finishLeagueMatch(
  matchId: number,
  result: { outcome: 'won' | 'lost' | 'left'; left: number; foeLeft: number; moves: unknown[] },
): Promise<{ delta: number; trophies: number }> {
  const client = await getSupabase()
  if (!client) throw new Error('versus_signed_out')
  const { data, error } = await client.rpc('versus_league_finish', {
    p_match: matchId,
    p_outcome: result.outcome,
    p_left: result.left,
    p_foe_left: result.foeLeft,
    p_moves: result.moves,
  })
  if (error) throw error
  lastHome = null
  const r = ((data ?? []) as { delta: number; trophies: number }[])[0]
  return { delta: Number(r?.delta) || 0, trophies: Number(r?.trophies) || 0 }
}

/** The admin's buttons: run the hourly tick now, or seat bots in this week's groups now. Returns how many were seated. */
export async function leagueAdmin(action: 'tick' | 'seat_bots'): Promise<number> {
  const client = await getSupabase()
  if (!client) throw new Error('versus_signed_out')
  const { data, error } = await client.rpc('versus_league_admin', { p_action: action })
  if (error) throw error
  lastHome = null
  return Number(data) || 0
}

// ---------------------------------------------------------------- the week's reward message

/** The server's words for a league reward message (0082 versus_league_close_week): the game says them in its language. */
const REWARD_PREFIX = '@versus_league:'
/** The reward message's title, as the server writes it. */
export const LEAGUE_REWARD_TITLE = 'versus_league'

export interface LeagueRewardNote {
  week: string
  rank: number
  trophies: number
  size: number
}

/** A league reward message's numbers, or null for any other message. */
export function leagueRewardNote(reply: string | null | undefined): LeagueRewardNote | null {
  if (!reply?.startsWith(REWARD_PREFIX)) return null
  try {
    const o = JSON.parse(reply.slice(REWARD_PREFIX.length)) as Record<string, unknown>
    return {
      week: String(o.week ?? ''),
      rank: Number(o.rank) || 0,
      trophies: Number(o.trophies) || 0,
      size: Number(o.size) || 0,
    }
  } catch {
    return null
  }
}
