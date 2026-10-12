// Trades, the cloud side (docs/23, migration 0044): the calls the game makes, their parsing, what went wrong in a
// word the screens can phrase, and a shared link (/t/<code>) kept in this browser until the game can open it. The main
// save only: Extreme mode has no trades, so these calls never carry a realm.
import type { PokemonInstance, TradeSnapshot, TradeVisibility, TradeWant } from '@/engine'
import { avatarOf } from './avatars'
import { deviceId } from './device'
import { isCode, normalizeCode } from './friends'
import { getSupabase } from './supabase'

/** A listing as the board, a link and a friend's card show it. */
export interface TradeListing {
  id: string
  code: string
  owner: string | null
  name: string
  avatar: string
  isMe: boolean
  isFriend: boolean
  dex: number
  level: number
  shiny: boolean
  homeRegion: string
  want: TradeWant
  visibility: TradeVisibility
  createdAt: number
  endsAt: number
  /** What "any I don't own" is checked against, and the regions the poster can receive from. */
  poster: TradeSnapshot
}

/** A link to a listing that is no longer open: taken, cancelled, run out or removed. */
export interface GoneListing {
  code: string
  status: 'taken' | 'cancelled' | 'expired' | 'removed'
}

/** One row of the check on load: a listing of yours, or a trade you took that your save doesn't hold yet. */
export interface MineRow {
  id: string
  code: string
  role: 'owner' | 'taker'
  status: 'open' | 'taken' | 'cancelled' | 'expired' | 'removed'
  mon: PokemonInstance
  fromRegion: string
  want: TradeWant
  visibility: TradeVisibility
  createdAt: number
  endsAt: number
  takerMon: PokemonInstance | null
  with: string
}

/** What a trade taken just now brought: the listed Pokémon and the one given, as the server saw them. */
export interface TakeResult {
  id: string
  listed: PokemonInstance
  given: PokemonInstance
  with: string
}

/** What went wrong, for a sentence (strings.csv `ui.trades.error.*`). */
export type TradeError =
  | 'off'
  | 'badges'
  | 'full'
  | 'not_found'
  | 'reviving'
  | 'last'
  | 'untradable'
  | 'listed'
  | 'bad_want'
  | 'gone'
  | 'own'
  | 'friends_only'
  | 'daily_cap'
  | 'region'
  | 'poster_region'
  | 'no_match'
  | 'no_save'
  | 'not_synced'
  | 'signed_out'
  | 'rate_limited'
  | 'not_set_up'
  | 'failed'

const ERRORS: TradeError[] = [
  'off',
  'badges',
  'full',
  'not_found',
  'reviving',
  'last',
  'untradable',
  'listed',
  'bad_want',
  'gone',
  'own',
  'friends_only',
  'daily_cap',
  'poster_region',
  'region',
  'no_match',
  'no_save',
  'not_synced',
  'signed_out',
]

export function tradeError(err: unknown): TradeError {
  const e = (err ?? {}) as { code?: string; message?: string }
  const msg = `${e.message ?? err}`
  // Longest first: trades_poster_region before trades_region.
  for (const k of ERRORS) if (msg.includes(`trades_${k}`)) return k
  if (msg.includes('friends_rate_limited') || msg.includes('save_rate_limited') || e.code === 'PT429')
    return 'rate_limited'
  // PGRST202: no such function (0044 not run); 42883: the same, from Postgres.
  if (e.code === 'PGRST202' || e.code === '42883') return 'not_set_up'
  return 'failed'
}

// ---------------------------------------------------------------- parsing

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const time = (v: unknown): number => {
  const ms = typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN
  return Number.isFinite(ms) ? ms : 0
}
const VIS: TradeVisibility[] = ['public', 'friends', 'private']

export function parseWant(raw: unknown): TradeWant {
  const w = (raw ?? {}) as { kind?: unknown; dex?: unknown }
  if (w.kind === 'species' && num(w.dex) > 0) return { kind: 'species', dex: num(w.dex) }
  if (w.kind === 'notOwned') return { kind: 'notOwned' }
  return { kind: 'any' }
}

/** A Pokémon as a cloud save holds it. */
export function parseInstance(raw: unknown): PokemonInstance | null {
  const m = (raw ?? {}) as Record<string, unknown>
  if (typeof m.id !== 'string' || !(num(m.dex) > 0)) return null
  return {
    id: m.id,
    dex: num(m.dex),
    level: Math.max(1, Math.min(100, num(m.level, 1))),
    xp: Math.max(0, num(m.xp)),
    currentHp: Math.max(0, num(m.currentHp)),
    caughtAt: num(m.caughtAt),
    ...(m.shiny === true && { shiny: true }),
  }
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => num(x)).filter((x) => x > 0) : [])

export function parseListing(raw: unknown): TradeListing | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.code !== 'string' || !(num(r.dex) > 0)) return null
  const p = (r.poster ?? {}) as Record<string, unknown>
  return {
    id: r.id,
    code: r.code,
    owner: typeof r.owner === 'string' ? r.owner : null,
    name: typeof r.name === 'string' && r.name.trim() ? r.name : '',
    avatar: avatarOf(typeof r.avatar === 'string' ? r.avatar : null).id,
    isMe: r.is_me === true,
    isFriend: r.is_friend === true,
    dex: num(r.dex),
    level: Math.max(1, num(r.level, 1)),
    shiny: r.shiny === true,
    homeRegion: typeof r.home_region === 'string' ? r.home_region : 'kanto',
    want: parseWant(r.want),
    visibility: VIS.includes(r.visibility as TradeVisibility) ? (r.visibility as TradeVisibility) : 'public',
    createdAt: time(r.created_at),
    endsAt: time(r.ends_at),
    poster: {
      has: typeof p.has === 'string' ? p.has : '',
      forms: ints(p.forms),
      shiny: ints(p.shiny),
      regions: Array.isArray(p.regions) ? p.regions.map(String) : [],
    },
  }
}

export function parseMine(raw: unknown): MineRow[] {
  return (Array.isArray(raw) ? raw : [])
    .map((r): MineRow | null => {
      const mon = parseInstance(r?.mon)
      if (!mon || typeof r?.id !== 'string') return null
      return {
        id: r.id,
        code: String(r.code ?? ''),
        role: r.role === 'taker' ? 'taker' : 'owner',
        status: ['open', 'taken', 'cancelled', 'expired', 'removed'].includes(r.status)
          ? r.status
          : 'expired',
        mon,
        fromRegion: typeof r.from_region === 'string' ? r.from_region : 'kanto',
        want: parseWant(r.want),
        visibility: VIS.includes(r.visibility) ? r.visibility : 'public',
        createdAt: time(r.created_at),
        endsAt: time(r.ends_at),
        takerMon: parseInstance(r.taker_mon),
        with: typeof r.with === 'string' ? r.with : '',
      }
    })
    .filter((r): r is MineRow => !!r)
}

// ---------------------------------------------------------------- the calls

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('trades_signed_out')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Post a listing: the server reads the Pokémon from the cloud save (pushed just before). */
export async function postListing(
  inst: string,
  want: TradeWant,
  visibility: TradeVisibility,
  poster: TradeSnapshot,
): Promise<{ id: string; code: string; endsAt: number }> {
  const r = await rpc<{ id: string; code: string; ends_at: string }>('trade_post', {
    p_inst: inst,
    p_want: want,
    p_visibility: visibility,
    p_poster: poster,
  })
  return { id: String(r.id), code: String(r.code), endsAt: time(r.ends_at) }
}

/** Take a listing with one of your Pokémon (from the cloud save, pushed just before). */
export async function takeListing(code: string, inst: string): Promise<TakeResult> {
  const r = await rpc<Record<string, unknown>>('trade_take', { p_code: code, p_inst: inst })
  const listed = parseInstance(r?.listed)
  const given = parseInstance(r?.given)
  if (!listed || !given) throw new Error('trades_failed')
  return { id: String(r.id), listed, given, with: typeof r.with === 'string' ? r.with : '' }
}

export async function cancelListing(id: string): Promise<'cancelled' | 'taken' | 'gone' | string> {
  return String(await rpc<string>('trade_cancel', { p_id: id }))
}

export interface BoardQuery {
  friends?: boolean
  sort?: 'soon' | 'newest'
  /** A search's species (names read in the player's language) and the words, for a trainer's name. */
  dex?: number[] | null
  query?: string
  offset?: number
}

export async function fetchBoard(q: BoardQuery = {}): Promise<TradeListing[]> {
  const rows = await rpc<unknown[]>('trade_board', {
    p_friends: !!q.friends,
    p_sort: q.sort ?? 'soon',
    p_dex: q.dex?.length ? q.dex : null,
    p_query: q.query?.trim() || null,
    p_offset: q.offset ?? 0,
  })
  return (Array.isArray(rows) ? rows : []).map(parseListing).filter((l): l is TradeListing => !!l)
}

/** One listing by its link: open (its row), gone (its status), or null (no such code). */
export async function viewListing(code: string): Promise<TradeListing | GoneListing | null> {
  const r = await rpc<Record<string, unknown> | null>('trade_view', { p_code: code, p_device_id: deviceId() })
  if (!r) return null
  if (r.status && r.status !== 'open' && !r.id)
    return { code: String(r.code), status: r.status as GoneListing['status'] }
  return parseListing(r)
}

export async function fetchMine(): Promise<MineRow[]> {
  return parseMine(await rpc('trade_mine'))
}

export async function markApplied(ids: string[]): Promise<void> {
  if (ids.length) await rpc('trade_applied', { p_ids: ids })
}

/** The admin takes a listing off the board. */
export async function removeListing(id: string): Promise<boolean> {
  return !!(await rpc<boolean>('trade_remove', { p_id: id }))
}

// ---------------------------------------------------------------- links

/** A listing's link: this site, /t/ and its code. */
export const tradeUrl = (code: string, origin = typeof location === 'undefined' ? '' : location.origin) =>
  `${origin}/t/${code}`

const LINK_KEY = 'pokedice.tradeLink'
const WEEK_MS = 7 * 24 * 3_600_000

/** A link opened: kept a week, so it survives the sign-in's trip to Google or Discord. */
export function saveTradeLink(raw: string, now = Date.now()): string | null {
  const code = normalizeCode(raw)
  if (!isCode(code)) return null
  try {
    localStorage.setItem(LINK_KEY, JSON.stringify({ code, at: now }))
  } catch {
    /* private mode: the link can be opened again */
  }
  return code
}

export function readTradeLink(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as { code?: string; at?: number } | null
    if (!v?.code || !isCode(v.code)) return null
    if (typeof v.at !== 'number' || now - v.at > WEEK_MS || v.at > now) {
      clearTradeLink()
      return null
    }
    return v.code
  } catch {
    return null
  }
}

export function clearTradeLink() {
  try {
    localStorage.removeItem(LINK_KEY)
  } catch {
    /* nothing kept */
  }
}

/** Sent by the /t/<code> route when the game is already open. */
export const TRADE_LINK_EVENT = 'pokedice:trade-link'
