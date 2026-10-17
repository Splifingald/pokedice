// The Underground's teams (docs/31 §3), the game's side of migration 0061: the team and its invitations as the server
// tells them, the orbs a finished wall owes to teammates (they wait in the save's outbox until the server has them),
// the orbs teammates dug for this player (into the bag, each delivery once), and selling, which the server confirms.
// Signed out, there is no team: every orb is the player's, and orbs can't be sold while a full team is asked for.
import { useEffect } from 'react'
import { create } from 'zustand'
import {
  clearOutbox,
  receiveOrbs,
  sellOrbs,
  ugCfg,
  undergroundLive,
  ORB_COLOURS,
  type OrbColour,
  type OrbSize,
  type UgTeam,
} from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { mutateSave, useGame } from './game'
import { serverNow } from './serverTime'
import { settleUgNow, useUgTeam } from './underground'

/** An invitation waiting for this player: whose team, who sent it, who sits there. */
export interface UgInvite {
  team: string
  from: string
  name: string
  seats: number
}

interface TeamsState {
  /** The team's id on the server; null when the player has none. */
  teamId: string | null
  invites: UgInvite[]
  /** Friends this player's team has invited, waiting for their answer. */
  sent: { id: string; name: string }[]
  state: 'idle' | 'loading' | 'ready' | 'error'
  at: number
}

export const useUgTeams = create<TeamsState>(() => ({
  teamId: null,
  invites: [],
  sent: [],
  state: 'idle',
  at: 0,
}))

const EVERY_MS = 60_000

const signedIn = () => {
  const { auth } = useGame.getState()
  return auth.status === 'signed_in' ? auth.userId : null
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('ug_offline')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

const isColour = (c: unknown): c is OrbColour =>
  typeof c === 'string' && (ORB_COLOURS as readonly string[]).includes(c)

/** ug_team()'s answer, read the careful way. */
function readTeam(raw: unknown): {
  team: UgTeam | null
  teamId: string | null
  invites: UgInvite[]
  sent: TeamsState['sent']
} {
  const r = (raw ?? {}) as Record<string, unknown>
  const seats: UgTeam['seats'] = {}
  for (const s of Array.isArray(r.seats) ? r.seats : []) {
    const o = s as Record<string, unknown>
    if (isColour(o.colour) && typeof o.id === 'string')
      seats[o.colour] = { id: o.id, name: String(o.name ?? '') }
  }
  const teamId = typeof r.team === 'string' ? r.team : null
  const invites = (Array.isArray(r.invites) ? r.invites : []).flatMap((i) => {
    const o = i as Record<string, unknown>
    return typeof o.team === 'string'
      ? [
          {
            team: o.team,
            from: String(o.from ?? ''),
            name: String(o.name ?? ''),
            seats: Array.isArray(o.seats) ? o.seats.length : 0,
          },
        ]
      : []
  })
  const sent = (Array.isArray(r.sent) ? r.sent : []).flatMap((s) => {
    const o = s as Record<string, unknown>
    return typeof o.id === 'string' ? [{ id: o.id, name: String(o.name ?? '') }] : []
  })
  return { team: teamId ? { me: isColour(r.me) ? r.me : null, seats } : null, teamId, invites, sent }
}

function apply(raw: unknown) {
  const { team, teamId, invites, sent } = readTeam(raw)
  useUgTeam.setState({ team })
  useUgTeams.setState({ teamId, invites, sent, state: 'ready', at: Date.now() })
}

/** Nothing of a team while the player is signed out or outside the event. */
function solo() {
  useUgTeam.setState({ team: null })
  useUgTeams.setState({ teamId: null, invites: [], sent: [], state: 'idle' })
}

const running = () => {
  const { save, data } = useGame.getState()
  return !!save && !!undergroundLive(save, data, serverNow())
}

/** The finished walls' orbs owed to teammates go to the server; those it took leave the outbox. */
export async function flushUgOutbox(): Promise<void> {
  const owed = useGame.getState().save?.underground?.outbox ?? []
  if (!owed.length || !signedIn() || !running()) return
  const done: string[] = []
  for (const w of owed) {
    try {
      await rpc('ug_send', { p_wall: w.wallId, p_orbs: w.orbs.map(({ colour, size }) => ({ colour, size })) })
      done.push(w.wallId)
    } catch (err) {
      console.warn('[underground] orbs not sent:', err instanceof Error ? err.message : err)
      break
    }
  }
  if (done.length) mutateSave((s) => clearOutbox(s, done))
}

/** Orbs teammates dug for this player: into the bag, then the server is told. */
export async function pullUgInbox(): Promise<void> {
  if (!signedIn() || !running()) return
  try {
    const raw = await rpc<unknown[]>('ug_inbox')
    const gifts = (Array.isArray(raw) ? raw : []).flatMap((g) => {
      const o = g as { id?: unknown; orbs?: unknown }
      if (typeof o.id !== 'string' || !Array.isArray(o.orbs)) return []
      const orbs = o.orbs.flatMap((x) => {
        const b = x as { colour?: unknown; size?: unknown }
        return isColour(b.colour) && (b.size === 's' || b.size === 'm' || b.size === 'l')
          ? [{ colour: b.colour, size: b.size as OrbSize }]
          : []
      })
      return [{ id: o.id, orbs }]
    })
    if (!gifts.length) return
    mutateSave((s) => {
      const next = receiveOrbs(s, gifts)
      return next === s ? null : next
    })
    await rpc('ug_applied', { p_ids: gifts.map((g) => g.id) })
  } catch (err) {
    console.warn('[underground] orbs not received:', err instanceof Error ? err.message : err)
  }
}

/** The team, the invitations, and both ways of orbs. `force` skips the minute's rest. */
export async function refreshUgTeam(force = false): Promise<void> {
  if (!signedIn() || !running()) return solo()
  const st = useUgTeams.getState()
  if (!force && st.state === 'ready' && Date.now() - st.at < EVERY_MS) return
  useUgTeams.setState({ state: st.state === 'ready' ? 'ready' : 'loading' })
  try {
    apply(await rpc('ug_team'))
  } catch (err) {
    console.warn('[underground] team not loaded:', err instanceof Error ? err.message : err)
    useUgTeams.setState({ state: 'error' })
    return
  }
  await flushUgOutbox()
  await pullUgInbox()
}

/**
 * On the Underground's page: the team now, then every minute while it's open; again as soon as the event becomes
 * known (its content arrives after the page) or the player signs in.
 */
export function useUgTeamSync(eventId: string | null): void {
  const user = useGame((s) => (s.auth.status === 'signed_in' ? s.auth.userId : null))
  useEffect(() => {
    void refreshUgTeam(true)
    const timer = setInterval(() => void refreshUgTeam(true), EVERY_MS)
    return () => clearInterval(timer)
  }, [user, eventId])
}

/** A team action; the server's error code when it refuses (ug_team_full, ug_not_friends…), else null. */
async function act(fn: string, args: Record<string, unknown>): Promise<string | null> {
  try {
    apply(await rpc(fn, args))
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err)
    return msg.match(/ug_[a-z_]+|signed_out/)?.[0] ?? 'ug_failed'
  }
}

export const ugInvite = (friend: string) => act('ug_invite', { p_friend: friend })
export const ugCancelInvite = (friend: string) => act('ug_cancel', { p_friend: friend })
export const ugAnswer = (team: string, yes: boolean) => act('ug_answer', { p_team: team, p_yes: yes })
export const ugLeave = () => act('ug_leave', {})

/**
 * Sells the orb bag: when the admin asks for a full team, the server confirms it first (a team can change on another
 * device). False when it can't.
 */
export async function ugSellOrbs(): Promise<boolean> {
  settleUgNow()
  const { data } = useGame.getState()
  let team = useUgTeam.getState().team
  if (ugCfg(data).sellNeedsFull) {
    if (!signedIn()) return false
    try {
      const full = await rpc<boolean>('ug_can_sell')
      // The seats as they are now, whatever the server said: the next sell reads them.
      await refreshUgTeam(true)
      if (!full) return false
      team = useUgTeam.getState().team
    } catch {
      return false
    }
  }
  return mutateSave((s) => sellOrbs(s, useGame.getState().data, serverNow(), team))
}
