// Players online (docs/70): how many players have the game open, at the foot of the side menu, for everyone (no
// switch, the user's call of 2026-11-09). Each game says it's open (online_ping, migration 0144) every 5 minutes while
// its tab is visible, and the answer is the count: one tiny call, about 12 per hour of play, and none from a hidden tab.
// Opening the menu asks again when the last answer is more than a minute old. The server counts the players heard from
// in the last 6 minutes. The call carries this player's card (name, look, badges, team: migration 0146) for VIEW's
// list, where INVITE asks a player to be friends (online_invite: a friend request the Friends page answers).
import { create } from 'zustand'
import { broadcastBadges, isExtreme } from '@/engine'
import { playerAvatarId } from '@/lib/avatars'
import { deviceId } from '@/lib/device'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { otherSave } from './extreme'
import { useGame } from './game'

/** The last count the server gave, or null: not asked yet, or never answered (offline, before migration 0144). */
export const useOnlineCount = create<{ count: number | null }>(() => ({ count: null }))

export const ONLINE_PING_MS = 5 * 60_000
/** Opening the menu asks again past this. */
export const ONLINE_MENU_MS = 60_000
// A little under the timer's gap, so a timer firing a hair early isn't skipped (and the player missed for 10 minutes).
const TIMER_GAP_MS = ONLINE_PING_MS - 15_000

let lastPing = 0
let pinging = false

/** A team holds 3 Pokémon: the most a card carries (the server keeps no more). */
export const ONLINE_TEAM_MAX = 3

/** A Pokémon of a team as the list shows it. */
export interface OnlineMon {
  dex: number
  level: number
  shiny?: boolean
}

/**
 * This player's card in the list: the main save's name, look, team and badges (every region's, as global messages
 * count them: only to pick the players closest to each one, never shown), also while playing Extreme, as the
 * leaderboard shows the main game.
 */
function myCard(): { p_name?: string | null; p_look?: string; p_badges?: number; p_team?: OnlineMon[] } {
  const { save, data } = useGame.getState()
  const main = save && isExtreme(save) ? (otherSave() ?? save) : save
  if (!main) return {}
  const team = main.team
    .map((id) => main.box.find((p) => p.id === id))
    .filter((p) => !!p)
    .slice(0, ONLINE_TEAM_MAX)
    .map((p) => ({ dex: p.dex, level: p.level, ...(p.shiny && { shiny: true }) }))
  return {
    p_name: main.player?.name?.trim() || null,
    p_look: playerAvatarId(main.player),
    p_badges: broadcastBadges(main, data),
    p_team: team,
  }
}

/** Says this game is open and keeps the count, unless the last call was less than `minGap` ago. */
export async function pingOnline(minGap = TIMER_GAP_MS): Promise<void> {
  if (!isSupabaseConfigured || pinging) return
  // Until the sign-in is known, the call would count the device and then the account: the same player twice.
  if (useGame.getState().auth.status === 'unknown') return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  if (Date.now() - lastPing < minGap) return
  pinging = true
  lastPing = Date.now()
  try {
    const client = await getSupabase()
    if (!client) return
    const { data: n, error } = await client.rpc('online_ping', { p_device_id: deviceId(), ...myCard() })
    if (error) throw error
    useOnlineCount.setState({ count: typeof n === 'number' && n > 0 ? n : null })
  } catch {
    // Offline, or before migration 0144: the last count stays (none at first, so the line stays hidden).
  } finally {
    pinging = false
  }
}

let started = false
/** On start, once the sign-in is known, every 5 minutes while visible, and on coming back to the tab. */
export function startOnlinePing() {
  if (started || !isSupabaseConfigured) return
  started = true
  setInterval(() => void pingOnline(), ONLINE_PING_MS)
  document.addEventListener('visibilitychange', () => void pingOnline())
  // The sign-in becoming known (or changing): counted as who they are now.
  useGame.subscribe((s, prev) => {
    if (s.auth.status !== prev.auth.status || s.auth.userId !== prev.auth.userId) {
      lastPing = 0
      void pingOnline()
    }
  })
  void pingOnline()
}

/** One player in VIEW's list, as the server gives it (online_players). */
export interface OnlinePlayer {
  name: string
  /** An avatar id (src/lib/avatars); null or unknown is Red. */
  look: string | null
  team: OnlineMon[]
  /** This player. */
  me: boolean
  /** One of this player's friends. */
  friend: boolean
  /**
   * 'yes': this player, signed in, can ask them to be friends (an account, not a friend, no request waiting, both lists
   * with room); 'sent': asked already; null: no INVITE.
   */
  invite: 'yes' | 'sent' | null
  /** Their account, only with `invite`: what online_invite takes. */
  id: string | null
}

export const ONLINE_LIST_MAX = 30

const parseMon = (v: unknown): OnlineMon | null => {
  const o = (v ?? {}) as Record<string, unknown>
  if (typeof o.dex !== 'number' || typeof o.level !== 'number') return null
  return { dex: o.dex, level: o.level, ...(o.shiny === true && { shiny: true }) }
}

export const parseOnlinePlayer = (v: unknown): OnlinePlayer | null => {
  const o = (v ?? {}) as Record<string, unknown>
  if (typeof o.name !== 'string') return null
  const id = typeof o.id === 'string' ? o.id : null
  return {
    name: o.name,
    look: typeof o.look === 'string' ? o.look : null,
    team: (Array.isArray(o.team) ? o.team : [])
      .map(parseMon)
      .filter((m): m is OnlineMon => !!m)
      .slice(0, ONLINE_TEAM_MAX),
    me: o.me === true,
    friend: o.friend === true,
    // No account, nothing to send it to.
    invite: id && (o.invite === 'yes' || o.invite === 'sent') ? o.invite : null,
    id,
  }
}

/** Up to 30 players online, the closest to this one in badges, most badges first. Throws when it can't ask. */
export async function loadOnlinePlayers(): Promise<OnlinePlayer[]> {
  const client = await getSupabase()
  if (!client) throw new Error('no_cloud')
  const { data, error } = await client.rpc('online_players', { p_device_id: deviceId() })
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .map(parseOnlinePlayer)
    .filter((p): p is OnlinePlayer => !!p)
    .slice(0, ONLINE_LIST_MAX)
}

export type InviteStatus = 'sent' | 'added' | 'already' | 'pending' | 'self' | 'offline' | 'full' | 'friend_full'

/** INVITE: a friend request to a player in the list (or friends at once, when they had asked). Throws when it fails. */
export async function inviteOnline(id: string): Promise<InviteStatus> {
  const client = await getSupabase()
  if (!client) throw new Error('no_cloud')
  const { data, error } = await client.rpc('online_invite', { p_to: id })
  if (error) throw error
  return String(data) as InviteStatus
}

/** Tests: forget the last call. */
export function resetOnlinePing() {
  lastPing = 0
  pinging = false
  useOnlineCount.setState({ count: null })
}
