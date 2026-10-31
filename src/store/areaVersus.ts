// Real-player battles in areas (docs/54), the game's side: one real player's team kept ready for the area being
// played (asked when the area opens, and again after each meet), the meets told to the server, and the friend
// requests: sent from the result card, answered on the Friends page. No polling: the requests ride on friend_status's
// moments (game load, back to the tab).
import { create } from 'zustand'
import {
  areaVersusHere,
  areaVersusOn,
  createRng,
  parseAreaFoe,
  randomSeed,
  withVersusCards,
  type AreaFoe,
} from '@/engine'
import { avatarOf } from '@/lib/avatars'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { commitSave, useGame } from './game'

export type RequestStatus =
  'sent' | 'pending' | 'added' | 'already' | 'self' | 'not_met' | 'full' | 'friend_full'
export type AnswerStatus = 'added' | 'declined' | 'already' | 'gone' | 'full' | 'friend_full'

/** A friend request to answer: who sent it, where they met your team, when. */
export interface FriendRequest {
  id: string
  name: string
  avatar: string
  rich: boolean
  areaId: string | null
  at: number
}

interface AreaVersusState {
  /** The team waiting for each area: null when the server has nobody (no card is dealt then). */
  foes: Record<string, AreaFoe | null>
  /** The players met lately on this device: offered last (a guest's memory; the server keeps a signed-in one's). */
  met: string[]
  /** Each foe's friend request, as the server answered it (or 'sending'). */
  sent: Record<string, RequestStatus | 'sending' | 'error'>
  /** Requests to answer (the Friends page and its dots). */
  requests: FriendRequest[]
}

export const useAreaVersus = create<AreaVersusState>(() => ({ foes: {}, met: [], sent: {}, requests: [] }))

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('area_versus_offline')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
const signedIn = () => useGame.getState().auth.status === 'signed_in'
const asking = new Set<string>()

/** The team for an area, from what the store holds: what the encounter context passes (null: no card). */
export const areaFoeFor = (areaId: string | null | undefined): AreaFoe | null =>
  (areaId && useAreaVersus.getState().foes[areaId]) || null

/**
 * Asks the server for a team for this area, when the save meets real players there (`areaVersusHere`) and nothing is
 * waiting for it yet (`fresh`: a new one, after a meet). Quiet on failure: no team, no card.
 */
export async function loadAreaFoe(areaId: string | null | undefined, fresh = false): Promise<void> {
  const { save, data } = useGame.getState()
  const area = data.areas.find((a) => a.id === areaId)
  if (!areaId || !area || !areaVersusHere(save, area, data) || !isSupabaseConfigured || !online()) return
  if (asking.has(areaId) || (!fresh && areaId in useAreaVersus.getState().foes)) return
  asking.add(areaId)
  try {
    const raw = await rpc<unknown>('area_versus_offer', {
      p_area: areaId,
      p_skip: useAreaVersus.getState().met,
    })
    const parsed = parseAreaFoe(raw, useGame.getState().data)
    const foe = parsed && {
      ...parsed,
      avatar: avatarOf(parsed.avatar).id,
      sprite: avatarOf(parsed.avatar).src,
    }
    useAreaVersus.setState((s) => ({ foes: { ...s.foes, [areaId]: foe } }))
    // The round already dealt without it (the area just entered, a reload): its card joins the round's last ones.
    const now = useGame.getState()
    if (foe && now.save) {
      const next = withVersusCards(now.save, area, now.data, createRng(randomSeed()))
      if (next !== now.save) commitSave(next)
    }
  } catch (err) {
    console.warn('[area versus] no team:', err instanceof Error ? err.message : err)
  } finally {
    asking.delete(areaId)
  }
}

/** The fight is over (won or lost) or the card was skipped: the server is told, and the area gets its next team. */
export function noteMeet(foe: AreaFoe, areaId: string, outcome: 'won' | 'lost' | 'skipped') {
  useAreaVersus.setState((s) => ({
    met: [foe.id, ...s.met.filter((id) => id !== foe.id)].slice(0, 10),
    foes: Object.fromEntries(Object.entries(s.foes).filter(([id]) => id !== areaId)),
  }))
  const next = () => void loadAreaFoe(areaId, true)
  if (!signedIn() || !isSupabaseConfigured) return next()
  rpc('area_versus_met', { p_foe: foe.id, p_area: areaId, p_outcome: outcome })
    .catch((err) => console.warn('[area versus] meet not kept:', err instanceof Error ? err.message : err))
    .finally(next)
}

/** SEND FRIEND REQUEST on the result card. */
export async function sendFriendRequest(foe: AreaFoe, areaId: string | null): Promise<void> {
  if (!signedIn()) return
  useAreaVersus.setState((s) => ({ sent: { ...s.sent, [foe.id]: 'sending' } }))
  try {
    const status = await rpc<RequestStatus>('friend_request_send', { p_to: foe.id, p_area: areaId })
    useAreaVersus.setState((s) => ({ sent: { ...s.sent, [foe.id]: status } }))
  } catch (err) {
    console.warn('[area versus] request not sent:', err instanceof Error ? err.message : err)
    useAreaVersus.setState((s) => ({ sent: { ...s.sent, [foe.id]: 'error' } }))
  }
}

export function parseRequests(raw: unknown): FriendRequest[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => typeof r?.id === 'string')
    .map((r) => {
      const at = new Date(r.at).getTime()
      return {
        id: String(r.id),
        name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Trainer',
        avatar: avatarOf(r.avatar).id,
        rich: r.rich === true,
        areaId: typeof r.area === 'string' ? r.area : null,
        at: Number.isFinite(at) ? at : 0,
      }
    })
}

/** The requests to answer: with the friend status (game load, back to the tab) and when the Friends page opens. */
export async function loadFriendRequests(): Promise<void> {
  if (!signedIn() || !isSupabaseConfigured || !areaVersusOn(useGame.getState().data)) {
    if (useAreaVersus.getState().requests.length) useAreaVersus.setState({ requests: [] })
    return
  }
  try {
    useAreaVersus.setState({ requests: parseRequests(await rpc('friend_requests')) })
  } catch (err) {
    // A database without 0099: no requests.
    console.warn('[area versus] requests not loaded:', err instanceof Error ? err.message : err)
  }
}

/** ACCEPT or NO: the request leaves the list either way; the answer says how it went. */
export async function answerFriendRequest(from: string, accept: boolean): Promise<AnswerStatus> {
  const status = await rpc<AnswerStatus>('friend_request_answer', { p_from: from, p_accept: accept })
  useAreaVersus.setState((s) => ({ requests: s.requests.filter((r) => r.id !== from) }))
  return status
}

/** Signed out, or another account: nothing of the last one's stays. */
export function clearAreaVersus() {
  useAreaVersus.setState({ sent: {}, requests: [], foes: {} })
}
