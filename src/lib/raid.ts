// Raid Battles with friends (docs/19 §6.5): your raid team on the server, your friends' teams to bring, the gifts a
// catch leaves the friends who helped, and the close of the day's raid. All through migration 0035's functions.
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'
import { realmArgs } from '@/lib/realm'

export interface RaidFriend {
  userId: string
  name: string
  /** Their look: an id from src/lib/avatars, already checked. */
  avatar: string
  team: { dex: number; level: number; shiny: boolean }[]
  /** Times they've helped you catch a raid Pokémon. */
  helped: number
  /** Their name shines gold ("I am just rich", docs/25). */
  rich: boolean
}

type RawFriend = { user_id: string; name: string; avatar: string; team: RaidFriend['team'] | null; helped: number; rich?: boolean | null }

const parseFriend = (r: RawFriend): RaidFriend => ({
  userId: String(r.user_id),
  name: r.name || 'Trainer',
  avatar: avatarOf(r.avatar).id,
  team: (r.team ?? []).map((m) => ({ dex: Number(m.dex), level: Number(m.level), shiny: !!m.shiny })),
  helped: Number(r.helped) || 0,
  // A database before 0049 doesn't say: nobody's is.
  rich: r.rich === true,
})

export interface RaidGift {
  id: number
  raider: string
  dex: number
  itemKey: string
}

/** Registers your raid team (1–3 Box ids, any region) from your cloud save. */
export async function setRaidTeam(ids: string[]): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('events_signed_out')
  const { error } = await client.rpc('raid_set_team', { p_ids: ids, ...realmArgs() })
  if (error) throw error
}

/** Your friends' raid teams (signed in); null when they can't be read. */
export async function fetchRaidFriends(): Promise<RaidFriend[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('raid_friend_teams', realmArgs())
  if (error || !Array.isArray(data)) return null
  return (data as RawFriend[]).map(parseFriend)
}

/** Today's raid is caught: the server closes it, counts it, and leaves the friends who helped a gift each. */
export async function closeRaid(helpers: string[]): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('events_signed_out')
  const { error } = await client.rpc('raid_close', { p_helpers: helpers, ...realmArgs() })
  if (error) throw error
}

/** The gifts your raid team has earned helping friends, claimed now (each comes once). */
export async function claimRaidGifts(): Promise<RaidGift[]> {
  const client = await getSupabase()
  if (!client) return []
  const { data, error } = await client.rpc('raid_gifts_claim', realmArgs())
  if (error || !Array.isArray(data)) return []
  return (data as { id: number; raider_name: string; dex: number; item_key: string }[]).map((g) => ({
    id: Number(g.id),
    raider: g.raider_name || 'Trainer',
    dex: Number(g.dex),
    itemKey: String(g.item_key),
  }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Progression raids (docs/24, migrations 0045 and 0046): the team you leave on each raid, your friends' teams left on
// it, the close of one you caught.

/** Leaves your team on a progression raid (1–3 ids from that raid's region's Box), built from your cloud save. */
export async function setProgressRaidTeam(key: string, region: string, ids: string[]): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('events_signed_out')
  const { error } = await client.rpc('raid_progress_set_team', { p_key: key, p_region: region, p_ids: ids, ...realmArgs() })
  if (error) throw error
}

/** Your friends who left a team on this progression raid (signed in); null when they can't be read. */
export async function fetchProgressRaidFriends(key: string): Promise<RaidFriend[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('raid_progress_friend_teams', { p_key: key, ...realmArgs() })
  if (error || !Array.isArray(data)) return null
  return (data as RawFriend[]).map(parseFriend)
}

/** A progression raid's Pokémon is caught: the server counts it once, and the friends who helped get a gift each. */
export async function closeProgressRaid(key: string, helpers: string[]): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('events_signed_out')
  const { error } = await client.rpc('raid_progress_close', { p_key: key, p_helpers: helpers, ...realmArgs() })
  if (error) throw error
}
