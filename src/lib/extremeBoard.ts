// Extreme mode's board (docs/48): one per region. First every player whose League has been won there, fastest best
// time first; then the runs still going, most badges first, the earliest started first among equals. The rows come
// from `extreme_board()` (migration 0087), which keeps the best times for good and the runs going of players seen in the
// last 72 hours; the ranking happens here.
import type { RegionId } from '@/engine/types'
import { avatarOf } from './avatars'
import { getSupabase } from './supabase'

export interface ExtremeBoardRow {
  region: RegionId
  isMe: boolean
  name: string
  avatar: string
  team: { dex: number; level: number; shiny: boolean }[]
  badges: number
  /** The best time ever in this region (ms), or null when its League hasn't been won yet. */
  bestMs: number | null
  /** A run is going (not won yet). */
  running: boolean
  /** When the server first saw the run going (ms), or null. */
  runSince: number | null
  friendId: string | null
  rich: boolean
}

export interface RankedExtremeRow extends ExtremeBoardRow {
  /** 1-based; equal times share a rank. */
  rank: number
}

interface RawRow {
  region: string | null
  is_me: boolean | null
  name: string | null
  character: string | null
  team: { dex: number; level: number; shiny?: boolean }[] | null
  badges: number | null
  best_ms: number | string | null
  running: boolean | null
  run_seen: string | null
  is_friend: boolean | null
  friend_id: string | null
  rich: boolean | null
}

export function parseExtremeBoard(raw: RawRow[]): ExtremeBoardRow[] {
  return raw.map((r) => {
    const best = r.best_ms == null ? null : Number(r.best_ms)
    const since = r.run_seen ? Date.parse(r.run_seen) : NaN
    return {
      region: r.region || 'kanto',
      isMe: !!r.is_me,
      name: r.name || 'Trainer',
      avatar: avatarOf(r.character).id,
      team: (r.team ?? []).map((m) => ({ dex: Number(m.dex), level: Number(m.level), shiny: !!m.shiny })),
      badges: Number(r.badges) || 0,
      bestMs: best != null && Number.isFinite(best) ? best : null,
      running: !!r.running,
      runSince: Number.isFinite(since) ? since : null,
      friendId: r.is_friend && r.friend_id ? String(r.friend_id) : null,
      rich: !!r.rich,
    }
  })
}

/** A region's board: the best times first (fastest first), then the runs going without one (most badges first). */
export function rankExtremeBoard(rows: ExtremeBoardRow[], region: RegionId): RankedExtremeRow[] {
  const here = rows.filter((r) => r.region === region && (r.bestMs != null || r.running))
  const timed = here
    .filter((r) => r.bestMs != null)
    .sort((a, b) => a.bestMs! - b.bestMs! || a.name.localeCompare(b.name))
  const going = here
    .filter((r) => r.bestMs == null)
    .sort(
      (a, b) =>
        b.badges - a.badges ||
        (a.runSince ?? Infinity) - (b.runSince ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
  let rank = 0
  const ranked: RankedExtremeRow[] = []
  timed.forEach((r, i) => {
    if (i === 0 || timed[i - 1]!.bestMs !== r.bestMs) rank = i + 1
    ranked.push({ ...r, rank })
  })
  going.forEach((r, i) => {
    if (i === 0 || going[i - 1]!.badges !== r.badges) rank = timed.length + i + 1
    ranked.push({ ...r, rank })
  })
  return ranked
}

export async function fetchExtremeBoard(): Promise<ExtremeBoardRow[] | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('extreme_board')
  if (error) throw error
  return parseExtremeBoard((data ?? []) as RawRow[])
}
