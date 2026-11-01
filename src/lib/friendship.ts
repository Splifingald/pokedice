// Friendship streaks and the Friend Market on the server (docs/59, migration 0105): the status, a purchase, purchases
// put away, and the two interactions only the game sees (a raid beside friends' teams, an Egg with a friend's Pokémon).
// Trades count on the server by themselves.
import type { FriendStreak, FriendshipKind, MarketBuy } from '@/engine'
import { realmArgs } from './realm'
import { getSupabase } from './supabase'

/** What friendship_status() says: null while the switch is off for the player. */
export interface FriendshipStatus {
  /** The server's UTC day and the market's week (its Monday). */
  day: string
  week: string
  /** The shiny of the week, as the server draws it. */
  shiny: number | null
  balance: number
  /** Coins earned today, toward the day's cap. */
  earned: number
  total: number
  streaks: FriendStreak[]
  /** Today's paid streak days, oldest first. */
  today: { friend: string; kind: FriendshipKind; streak: number; coins: number }[]
  /** This week's purchases, by key. */
  bought: Record<string, number>
  /** Purchases not put in a save yet. */
  pending: MarketBuy[]
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('friendship_offline')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

const KINDS: readonly FriendshipKind[] = ['raid', 'trade', 'egg']
const kindOf = (k: unknown): FriendshipKind =>
  KINDS.includes(k as FriendshipKind) ? (k as FriendshipKind) : 'trade'
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

export function parseFriendshipStatus(raw: unknown): FriendshipStatus | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const bought: Record<string, number> = {}
  if (r.bought && typeof r.bought === 'object')
    for (const [k, v] of Object.entries(r.bought as Record<string, unknown>)) bought[k] = num(v)
  return {
    day: String(r.day ?? ''),
    week: String(r.week ?? ''),
    shiny: r.shiny == null ? null : num(r.shiny),
    balance: num(r.balance),
    earned: num(r.earned),
    total: num(r.total),
    streaks: list(r.streaks).map((s) => ({
      friend: String(s.friend),
      streak: num(s.streak),
      best: num(s.best),
      lastDay: String(s.lastDay ?? ''),
      lastKind: kindOf(s.lastKind),
    })),
    today: list(r.today).map((x) => ({
      friend: String(x.friend),
      kind: kindOf(x.kind),
      streak: num(x.streak),
      coins: num(x.coins),
    })),
    bought,
    pending: list(r.pending).map((p) => ({ id: String(p.id), gifts: p.gifts })),
  }
}

export const fetchFriendshipStatus = async () => parseFriendshipStatus(await rpc('friendship_status'))

export async function buyFromMarket(key: string, qty: number): Promise<MarketBuy & { balance: number }> {
  const r = await rpc<Record<string, unknown>>('friend_market_buy', { p_key: key, p_qty: qty })
  return { id: String(r?.id), gifts: r?.gifts, balance: num(r?.balance) }
}

export const markMarketApplied = (ids: string[]) => rpc('friend_market_applied', { p_ids: ids })

/** A raid fought beside friends' teams (won or lost): how many streaks moved. */
export const reportRaidFriends = (helpers: string[], key: string | null) =>
  rpc<number>('friendship_raid', { p_helpers: helpers, p_key: key, ...realmArgs() })

/** An Egg made with a friend's Pokémon: the streak it reached, 0 when nothing moved. */
export const reportEggFriend = (friend: string) => rpc<number>('friendship_egg', { p_friend: friend })

/** The server's refusal, as a word the screens can say. */
export function marketError(err: unknown): 'off' | 'limit' | 'tooPoor' | 'notSold' | 'failed' {
  const msg = String((err as { message?: unknown })?.message ?? err)
  if (msg.includes('friendship_off')) return 'off'
  if (msg.includes('friendship_limit')) return 'limit'
  if (msg.includes('friendship_too_poor')) return 'tooPoor'
  if (msg.includes('friendship_not_sold')) return 'notSold'
  return 'failed'
}
