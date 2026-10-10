// The friend list, the cloud side (docs/16, migration 0033): the calls the game makes and their parsing, the friend
// ID's format, the invite link, and a small store. The store holds the friend ids and the friends not seen yet
// (`friend_status()`, at game load and when the player comes back to the tab, at most every 5 minutes) and the list
// itself (`friend_list()`, only while the Friends page is open, at most once a minute). No polling, no Realtime.
import { create } from 'zustand'
import { useGame } from '@/store/game'
import { avatarOf } from './avatars'
import { deviceId } from './device'
import { getSupabase } from './supabase'

/** Crockford base32, as the database makes friend IDs: no I, L, O or U. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/

/** A typed code, read the forgiving way (the database reads it the same): any case, spaces and dashes ignored, O as 0, I and L as 1. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export const isCode = (code: string) => CODE_RE.test(code)

/** K7QM4XD9 → K7QM-4XD9. */
export const formatCode = (code: string) => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code)

/** The invite link: this site (a preview deploy shares its own links), /f/ and the code. */
export const inviteUrl = (code: string, origin = typeof location === 'undefined' ? '' : location.origin) => `${origin}/f/${code}`

export interface TeamMon {
  dex: number
  level: number
  shiny: boolean
}

/** A friend as the Friends page lists them: their card, as of their last cloud push. */
export interface FriendRow {
  userId: string
  name: string
  /** Their look: an id from src/lib/avatars, already checked. */
  avatar: string
  /** The region they are playing; null when they have never pushed a save. */
  region: string | null
  areaId: string | null
  /** Their best level in that region. */
  maxLevel: number
  team: TeamMon[]
  since: number | null
  updatedAt: number | null
  isNew: boolean
}

/** A friend in a toast or a preview: who they are and nothing more. */
export interface FriendNotice {
  id: string
  name: string
  avatar: string
}

export interface CardRegion {
  region: string
  team: TeamMon[]
  pokedex: number
  maxLevel: number
  shinies: number
  progress: Record<string, { cleared: boolean; gyms: number }>
  /** The gym leaders beaten there whose badge is set. */
  badges: string[]
  /** The league area cleared: the crown. */
  endgame: boolean
}

export interface FriendProfile {
  userId: string
  name: string
  avatar: string
  region: string | null
  areaId: string | null
  updatedAt: number | null
  since: number | null
  regions: CardRegion[]
  versus: { team: TeamMon[]; attackWins: number; defenseWins: number } | null
}

export type AddStatus = 'added' | 'already' | 'self' | 'not_found' | 'full' | 'friend_full'

/** What went wrong, for a sentence: too many tries, signed out, a database without 0033, a reset too soon, anything else. */
export type FriendError = 'rate_limited' | 'signed_out' | 'not_set_up' | 'reset_too_soon' | 'failed'

export function friendError(err: unknown): FriendError {
  const e = (err ?? {}) as { code?: string; message?: string }
  const msg = `${e.message ?? err}`
  if (msg.includes('friends_rate_limited')) return 'rate_limited'
  if (msg.includes('friends_signed_out')) return 'signed_out'
  if (msg.includes('friends_reset_too_soon')) return 'reset_too_soon'
  // PGRST202: no such function (0033 not run); 42883: the same, from Postgres.
  if (e.code === 'PGRST202' || e.code === '42883') return 'not_set_up'
  return 'failed'
}

const time = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const ms = new Date(v).getTime()
  return Number.isFinite(ms) ? ms : null
}

const team = (raw: unknown): TeamMon[] =>
  Array.isArray(raw)
    ? raw.map((m) => ({ dex: Number(m?.dex) || 0, level: Number(m?.level) || 0, shiny: !!m?.shiny })).filter((m) => m.dex > 0)
    : []

const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback)

export function parseFriendList(raw: unknown): FriendRow[] {
  return (Array.isArray(raw) ? raw : []).map((r) => ({
    userId: String(r.user_id),
    name: text(r.name, 'Trainer'),
    avatar: avatarOf(r.avatar).id,
    region: typeof r.region === 'string' ? r.region : null,
    areaId: typeof r.area_id === 'string' ? r.area_id : null,
    maxLevel: Number(r.max_level) || 0,
    team: team(r.team),
    since: time(r.since),
    updatedAt: time(r.updated_at),
    isNew: !!r.is_new,
  }))
}

export function parseNotices(raw: unknown): FriendNotice[] {
  return (Array.isArray(raw) ? raw : []).map((n) => ({
    id: String(n?.id),
    name: text(n?.name, 'Trainer'),
    avatar: avatarOf(n?.avatar).id,
  }))
}

export function parseStatus(raw: unknown): { ids: string[]; unseen: FriendNotice[] } {
  const row = (Array.isArray(raw) ? raw[0] : raw) as { ids?: unknown; unseen?: unknown } | undefined
  return {
    ids: Array.isArray(row?.ids) ? row.ids.map(String) : [],
    unseen: parseNotices(row?.unseen),
  }
}

export function parseProfile(raw: unknown): FriendProfile | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined
  if (!r) return null
  const vs = r.versus as { team?: unknown; attackWins?: unknown; defenseWins?: unknown } | null | undefined
  return {
    userId: String(r.user_id),
    name: text(r.name, 'Trainer'),
    avatar: avatarOf(r.avatar as string | null).id,
    region: typeof r.region === 'string' ? r.region : null,
    areaId: typeof r.area_id === 'string' ? r.area_id : null,
    updatedAt: time(r.updated_at),
    since: time(r.since),
    regions: (Array.isArray(r.regions) ? r.regions : []).map((g) => ({
      region: String(g?.region),
      team: team(g?.team),
      pokedex: Number(g?.pokedex) || 0,
      maxLevel: Number(g?.maxLevel) || 0,
      shinies: Number(g?.shinies) || 0,
      progress: Object.fromEntries(
        Object.entries((g?.progress ?? {}) as Record<string, { cleared?: unknown; gyms?: unknown }>).map(([id, p]) => [
          id,
          { cleared: !!p?.cleared, gyms: Number(p?.gyms) || 0 },
        ]),
      ),
      badges: Array.isArray(g?.badges) ? g.badges.map(String) : [],
      endgame: !!g?.endgame,
    })),
    versus: vs
      ? { team: team(vs.team), attackWins: Number(vs.attackWins) || 0, defenseWins: Number(vs.defenseWins) || 0 }
      : null,
  }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('friends_offline')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

// ---------------------------------------------------------------- the player's own friend ID

const codeKey = (userId: string) => `pokedice.friendCode.${userId}`

function cachedCode(userId: string | null): string | null {
  if (!userId) return null
  try {
    const c = localStorage.getItem(codeKey(userId))
    return c && isCode(c) ? c : null
  } catch {
    return null
  }
}

function keepCode(userId: string, code: string) {
  try {
    localStorage.setItem(codeKey(userId), code)
  } catch {
    /* asked again next time */
  }
}

// ---------------------------------------------------------------- the store

interface FriendsState {
  /** Whose friends these are; everything clears when the signed-in account changes. */
  userId: string | null
  /** The player's friend ID: kept on this device per account (it only changes on a reset). */
  code: string | null
  ids: Set<string>
  /** Friends the player hasn't seen on the Friends page yet: the dots. */
  unseen: FriendNotice[]
  list: FriendRow[] | null
  listState: 'idle' | 'loading' | 'ready' | 'error'
  listError: FriendError | null
  statusAt: number
  listAt: number
}

const EMPTY: FriendsState = {
  userId: null,
  code: null,
  ids: new Set(),
  unseen: [],
  list: null,
  listState: 'idle',
  listError: null,
  statusAt: 0,
  listAt: 0,
}

export const useFriends = create<FriendsState>(() => ({ ...EMPTY }))

/** At most this often: the status on return to the tab, the list on the Friends page. */
export const STATUS_EVERY_MS = 5 * 60_000
export const LIST_EVERY_MS = 60_000

/** The signed-in account, or null; the store is cleared when it isn't the one it holds. */
function signedInUser(): string | null {
  const { auth } = useGame.getState()
  const user = auth.status === 'signed_in' ? auth.userId : null
  if (useFriends.getState().userId !== user) useFriends.setState({ ...EMPTY, userId: user, code: cachedCode(user) })
  return user
}

/** friend_status(): friend ids and new friends. `force` skips the 5-minute rest (game load, sign-in). */
export async function loadFriendStatus(force = false, now = Date.now()): Promise<void> {
  if (!signedInUser()) return
  if (!force && now - useFriends.getState().statusAt < STATUS_EVERY_MS) return
  useFriends.setState({ statusAt: now })
  try {
    const { ids, unseen } = parseStatus(await rpc('friend_status'))
    useFriends.setState({ ids: new Set(ids), unseen })
  } catch (err) {
    console.warn('[friends] status not loaded:', err instanceof Error ? err.message : err)
  }
}

/** friend_list(), for the Friends page. */
export async function loadFriendList(force = false, now = Date.now()): Promise<void> {
  if (!signedInUser()) return
  const st = useFriends.getState()
  if (!force && st.listState === 'ready' && now - st.listAt < LIST_EVERY_MS) return
  useFriends.setState({ listState: st.list ? 'ready' : 'loading', listAt: now })
  try {
    const list = parseFriendList(await rpc('friend_list'))
    useFriends.setState({ list, listState: 'ready', listError: null, ids: new Set(list.map((f) => f.userId)) })
  } catch (err) {
    console.warn('[friends] list not loaded:', err instanceof Error ? err.message : err)
    useFriends.setState({ listState: 'error', listError: friendError(err) })
  }
}

/** The Friends page is open: nobody is new any more (the NEW tags stay until the page closes). */
export async function markFriendsSeen(): Promise<void> {
  if (!signedInUser() || !useFriends.getState().unseen.length) return
  useFriends.setState({ unseen: [] })
  try {
    await rpc('friend_seen')
  } catch (err) {
    console.warn('[friends] not marked seen:', err instanceof Error ? err.message : err)
  }
}

/** The player's friend ID: from this device if known, else from the database (which makes it the first time). */
export async function loadMyCode(): Promise<string | null> {
  const user = signedInUser()
  if (!user) return null
  const known = useFriends.getState().code
  if (known) return known
  const code = String(await rpc<string>('friend_code'))
  keepCode(user, code)
  useFriends.setState({ code })
  return code
}

/** A new friend ID; the old one and its links stop working. */
export async function resetMyCode(): Promise<string> {
  const user = signedInUser()
  if (!user) throw new Error('friends_signed_out')
  const code = String(await rpc<string>('friend_code_reset'))
  keepCode(user, code)
  useFriends.setState({ code })
  return code
}

/** Who a code belongs to (the ADD preview, an invite): null when nobody has it. */
export async function lookupCode(code: string): Promise<(FriendNotice & { region: string | null; maxLevel: number }) | null> {
  const rows = await rpc<{ name: string; avatar: string; region: string | null; max_level: number }[]>('friend_lookup', {
    p_code: code,
    p_device_id: deviceId(),
  })
  const r = rows?.[0]
  return r
    ? { id: code, name: text(r.name, 'Trainer'), avatar: avatarOf(r.avatar).id, region: r.region ?? null, maxLevel: Number(r.max_level) || 0 }
    : null
}

/** Adds the owner of a code, at once. The list and the ids learn it right away. */
export async function addFriend(code: string): Promise<{ status: AddStatus; friend: FriendNotice | null }> {
  const rows = await rpc<{ status: AddStatus; user_id: string | null; name: string | null; avatar: string | null }[]>('friend_add', {
    p_code: code,
  })
  const r = rows?.[0]
  const status = (r?.status ?? 'not_found') as AddStatus
  const friend = r?.user_id ? { id: String(r.user_id), name: text(r.name, 'Trainer'), avatar: avatarOf(r.avatar).id } : null
  if (status === 'added' && friend) {
    const st = useFriends.getState()
    useFriends.setState({ ids: new Set([...st.ids, friend.id]) })
    void loadFriendList(true)
  }
  return { status, friend }
}

/** Ends a friendship, for both players. */
export async function removeFriend(userId: string): Promise<void> {
  await rpc('friend_remove', { p_friend: userId })
  const st = useFriends.getState()
  const ids = new Set(st.ids)
  ids.delete(userId)
  useFriends.setState({
    ids,
    list: st.list?.filter((f) => f.userId !== userId) ?? null,
    unseen: st.unseen.filter((f) => f.id !== userId),
  })
  forgetProfile(userId)
}

// A profile opened in the last 5 minutes opens again without a request.
const profiles = new Map<string, { at: number; profile: FriendProfile | null }>()
const PROFILE_KEEP_MS = 5 * 60_000

export function forgetProfile(userId: string) {
  profiles.delete(userId)
}

/** A friend's trainer card; null for someone who isn't a friend (any more). */
export async function fetchFriendProfile(userId: string, now = Date.now()): Promise<FriendProfile | null> {
  const kept = profiles.get(userId)
  if (kept && now - kept.at < PROFILE_KEEP_MS) return kept.profile
  const profile = parseProfile(await rpc('friend_profile', { p_friend: userId }))
  profiles.set(userId, { at: now, profile })
  return profile
}

// ---------------------------------------------------------------- toasts, once per new friend and device

const toldKey = (userId: string) => `pokedice.friends.told.${userId}`

/** The new friends this device hasn't announced yet; marks them announced. */
export function takeUntold(userId: string, unseen: FriendNotice[]): FriendNotice[] {
  let told: string[] = []
  try {
    told = JSON.parse(localStorage.getItem(toldKey(userId)) ?? '[]') as string[]
  } catch {
    /* a garbled list: announce again */
  }
  const fresh = unseen.filter((f) => !told.includes(f.id))
  if (fresh.length) {
    try {
      localStorage.setItem(toldKey(userId), JSON.stringify([...fresh.map((f) => f.id), ...told].slice(0, 200)))
    } catch {
      /* announced again next time */
    }
  }
  return fresh
}
