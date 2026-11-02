// Friend Battles, the cloud side (docs/65): the calls to supabase/migrations/0131_friend_battles.sql and its two
// private Realtime topics — `pvp-inbox:<you>` (a challenge, its answer) and `pvp:<match>` (each move with its seed, and
// "something changed"). The rules and the fight are the engine's (engine/friendBattle.ts); the store drives them
// (store/pvp.ts).
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DraftMon, FriendBattlesConfig, PvpMode, PvpMove, PvpSide, VersusMon } from '@/engine'
import { FRIEND_BATTLES_DEFAULTS } from '@/engine'
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'

export type PvpState = 'invited' | 'declined' | 'expired' | 'cancelled' | 'draft' | 'order' | 'battle' | 'done' | 'void'

export interface PvpPlayer {
  id: string
  name: string
  avatar: string
}

/** A match as the server shows it to one of its players (pvp_public). */
export interface PvpInfo {
  id: number
  mode: PvpMode
  state: PvpState
  side: PvpSide
  a: PvpPlayer
  b: PvpPlayer
  firstPicker: PvpSide | null
  picks: (DraftMon & { side: PvpSide })[]
  /** What this player may draft (their own). */
  cand: DraftMon[]
  /** Their team, in their order once set; the other's only from the battle on. */
  team: VersusMon[]
  foeTeam: VersusMon[] | null
  readyA: boolean
  readyB: boolean
  seq: number
  /** The battle's opening seed, from the battle on. */
  seed: number | null
  /** When the step running out of time ends (ms, the server's clock), and the server's clock when it answered. */
  deadline: number | null
  serverNow: number
  /** When the other player's game last called the server (ms, the server's clock). */
  foeSeen: number | null
  winner: PvpSide | 'draw' | null
  reason: string | null
  cfg: FriendBattlesConfig
}

export interface PvpMoveRow {
  seq: number
  side: PvpSide
  move: PvpMove
  seed: number
}

export interface PvpRecord extends PvpPlayer {
  wins: number
  losses: number
  draws: number
}

export interface PvpHistoryRow {
  id: number
  mode: PvpMode
  at: number
  foe: PvpPlayer
  result: 'win' | 'loss' | 'draw'
  reason: string | null
}

/** Battle tickets (docs/65 §15): what the player holds, the cap a midnight fills to, and the next midnight (ms). */
export interface PvpTickets {
  balance: number
  cap: number
  daily: number
  nextAt: number
}

export function parseTickets(raw: unknown): PvpTickets | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return null
  return { balance: Math.max(0, num(r.balance)), cap: num(r.cap, 3), daily: num(r.daily, 1), nextAt: num(r.nextAt) }
}

export interface PvpHome {
  /** Null from a database before 0132: no tickets to show, none asked. */
  tickets: PvpTickets | null
  current: PvpInfo | null
  records: PvpRecord[]
  history: PvpHistoryRow[]
}

const LIVE: readonly PvpState[] = ['invited', 'draft', 'order', 'battle']
export const isLive = (s: PvpState) => LIVE.includes(s)

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v))
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || d)
const side = (v: unknown): PvpSide => (v === 'b' ? 'b' : 'a')

export function parsePlayer(raw: unknown): PvpPlayer {
  const r = (raw ?? {}) as Record<string, unknown>
  return { id: str(r.id), name: str(r.name, 'Trainer') || 'Trainer', avatar: avatarOf(str(r.avatar)).id }
}

const mon = (raw: unknown): DraftMon => {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    dex: num(r.dex),
    level: Math.max(1, Math.min(100, num(r.level, 50))),
    shiny: r.shiny === true,
    ...(r.talent === true && { talent: true }),
  }
}
const mons = (raw: unknown): DraftMon[] => (Array.isArray(raw) ? raw.map(mon).filter((m) => m.dex > 0) : [])

export function parseInfo(raw: unknown): PvpInfo | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object' || r.id == null) return null
  const state = str(r.state) as PvpState
  const picks = Array.isArray(r.picks)
    ? r.picks.map((p) => ({ ...mon(p), side: side((p as { side?: unknown }).side) })).filter((m) => m.dex > 0)
    : []
  return {
    id: num(r.id),
    mode: r.mode === 'draft' ? 'draft' : 'classic',
    state,
    side: side(r.side),
    a: parsePlayer(r.a),
    b: parsePlayer(r.b),
    firstPicker: r.firstPicker === 'a' || r.firstPicker === 'b' ? r.firstPicker : null,
    picks,
    cand: mons(r.cand),
    team: mons(r.team),
    foeTeam: Array.isArray(r.foeTeam) ? mons(r.foeTeam) : null,
    readyA: r.readyA === true,
    readyB: r.readyB === true,
    seq: num(r.seq),
    seed: r.seed == null ? null : num(r.seed),
    deadline: r.deadline == null ? null : num(r.deadline),
    serverNow: num(r.now, Date.now()),
    foeSeen: r.foeSeen == null ? null : num(r.foeSeen),
    winner: r.winner === 'a' || r.winner === 'b' || r.winner === 'draw' ? r.winner : null,
    reason: r.reason == null ? null : str(r.reason),
    cfg: { ...FRIEND_BATTLES_DEFAULTS, ...((r.cfg as Partial<FriendBattlesConfig>) ?? {}) },
  }
}

export function parseMove(raw: unknown): PvpMoveRow | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const m = (r.move ?? {}) as Record<string, unknown>
  const k = str(m.k)
  const move: PvpMove | null =
    k === 'reroll' && Array.isArray(m.mask)
      ? { k: 'reroll', mask: m.mask.map((x) => x === true) }
      : k === 'attack' || k === 'timeout' || k === 'forfeit'
        ? { k }
        : null
  if (!move || r.seq == null) return null
  return { seq: num(r.seq), side: side(r.side), move, seed: num(r.seed) }
}

export function parseHome(raw: unknown): PvpHome | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return null
  return {
    tickets: r.tickets ? parseTickets(r.tickets) : null,
    current: r.current ? parseInfo(r.current) : null,
    records: Array.isArray(r.records)
      ? r.records.map((x) => {
          const o = x as Record<string, unknown>
          return { ...parsePlayer(o), wins: num(o.wins), losses: num(o.losses), draws: num(o.draws) }
        })
      : [],
    history: Array.isArray(r.history)
      ? r.history.map((x) => {
          const o = x as Record<string, unknown>
          const result = o.result === 'win' || o.result === 'draw' ? o.result : 'loss'
          return {
            id: num(o.id),
            mode: o.mode === 'draft' ? 'draft' : 'classic',
            at: num(o.at),
            foe: parsePlayer(o.foe),
            result,
            reason: o.reason == null ? null : str(o.reason),
          } satisfies PvpHistoryRow
        })
      : [],
  }
}

/** The server's refusal, as a short code ('pvp_busy'…), or 'offline'. */
export function pvpError(err: unknown): string {
  const m = (err as { message?: string })?.message ?? String(err)
  const code = /pvp_[a-z_]+/.exec(m)?.[0]
  if (code) return code
  if (/fetch|network|offline|Failed/i.test(m)) return 'offline'
  return 'unknown'
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('offline')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

const info = async (fn: string, args: Record<string, unknown>) => {
  const m = parseInfo(await rpc(fn, args))
  if (!m) throw new Error('pvp_not_found')
  return m
}

export const pvpChallenge = (friend: string, mode: PvpMode) => info('pvp_challenge', { p_friend: friend, p_mode: mode })
export const pvpAnswer = (id: number, accept: boolean) => info('pvp_answer', { p_match: id, p_accept: accept })
export const pvpCancel = (id: number) => info('pvp_cancel', { p_match: id })
export const pvpPick = (id: number, m: Pick<DraftMon, 'dex' | 'shiny'>) =>
  info('pvp_pick', { p_match: id, p_dex: m.dex, p_shiny: m.shiny })
export const pvpOrder = (id: number, order: number[]) => info('pvp_order', { p_match: id, p_order: order })
export const pvpTimeout = (id: number, seq?: number) => info('pvp_timeout', { p_match: id, p_seq: seq ?? null })
export const pvpClaim = (id: number) => info('pvp_claim', { p_match: id })
export const pvpFinish = (id: number, winner: PvpSide | 'draw', hash: string) =>
  info('pvp_finish', { p_match: id, p_winner: winner, p_hash: hash })
export const pvpPing = (id: number) => rpc<void>('pvp_ping', { p_match: id })
export const pvpHere = () => rpc<void>('pvp_here')

export async function pvpMove(id: number, seq: number, move: PvpMove): Promise<{ seq: number; seed: number }> {
  const r = (await rpc<{ seq?: unknown; seed?: unknown }>('pvp_move', { p_match: id, p_seq: seq, p_move: move })) ?? {}
  return { seq: num(r.seq), seed: num(r.seed) }
}

export async function pvpState(id: number, after = 0): Promise<{ match: PvpInfo; moves: PvpMoveRow[] }> {
  const r = (await rpc<{ match?: unknown; moves?: unknown }>('pvp_state', { p_match: id, p_after: after })) ?? {}
  const match = parseInfo(r.match)
  if (!match) throw new Error('pvp_not_found')
  const moves = Array.isArray(r.moves) ? r.moves.map(parseMove).filter((m): m is PvpMoveRow => !!m) : []
  return { match, moves }
}

export async function pvpHome(): Promise<PvpHome | null> {
  return parseHome(await rpc('pvp_home'))
}

export async function pvpOnline(): Promise<string[]> {
  const ids = await rpc<unknown>('pvp_online')
  return Array.isArray(ids) ? ids.map(String) : []
}

// ---------------------------------------------------------------- Realtime

export interface TopicHandlers {
  onState?: (p: { id: number; state: string; seq: number }) => void
  onMove?: (m: PvpMoveRow) => void
  onChallenge?: (p: { id: number }) => void
  /** Joined (true) or dropped (false): a game coming back reads what it missed. */
  onStatus?: (joined: boolean) => void
}

/** Listens on a private topic; returns how to leave it. */
export async function listen(topic: string, h: TopicHandlers): Promise<() => void> {
  const client = await getSupabase()
  if (!client) return () => {}
  let ch: RealtimeChannel | null = client
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = (payload ?? {}) as Record<string, unknown>
      h.onState?.({ id: num(p.id), state: str(p.state), seq: num(p.seq) })
    })
    .on('broadcast', { event: 'move' }, ({ payload }) => {
      const m = parseMove(payload)
      if (m) h.onMove?.(m)
    })
    .on('broadcast', { event: 'challenge' }, ({ payload }) => {
      h.onChallenge?.({ id: num((payload as { id?: unknown })?.id) })
    })
  ch.subscribe((status) => h.onStatus?.(status === 'SUBSCRIBED'))
  return () => {
    if (ch) void client.removeChannel(ch)
    ch = null
  }
}
