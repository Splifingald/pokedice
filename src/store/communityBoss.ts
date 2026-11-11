// The Community Boss (docs/71 §4), the game's side: the page's numbers from the server (boss_state, migration 0146),
// placing a Pokémon (the server first, then it leaves its Box) and taking it back, and the placed Pokémon coming home
// once the event is over. The damage is the server's alone: the game only shows it, and plays the hits in between.
import {
  bossCandidates,
  bossHomecoming,
  bossPlacedOf,
  placeOnBoss,
  takeBackFromBoss,
  type LiveEvent,
} from '@/engine'
import { t } from '@/i18n'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { create } from 'zustand'
import { mutateSave, pushToast, useGame } from './game'
import { serverNow } from './serverTime'

/** A Pokémon around the boss in the arena (the server's field: the player's, their friends', others). */
export interface BossFieldMon {
  name: string
  dex: number
  level: number
  shiny: boolean
  hit: number
  own?: boolean
  friend?: boolean
}

/** One of the player's slots, as the server holds it. */
export interface BossSlot {
  slot: number
  instId: string
  dex: number
  level: number
  shiny: boolean
  hit: number
  affinity: number
  placedAt: string
}

/** What boss_state answers. */
export interface BossServerState {
  now: string
  ended: boolean
  total: number
  lastHour: number
  participants: number
  top: { name: string; damage: number; me: boolean }[]
  builtAt: string | null
  me: { damage: number; rank: number; slots: BossSlot[] } | null
  field: BossFieldMon[]
  result: { broken: number; total: number; participants: number } | null
}

/** Read again this often while the page is open (the server rebuilds its numbers once a minute). */
export const BOSS_REFRESH_MS = 60_000

export const useBoss = create<{
  eventId: string | null
  state: BossServerState | null
  /** When it was read (the device's clock), for the bar's pace in between. */
  at: number
  loading: boolean
  failed: boolean
  busy: boolean
}>(() => ({ eventId: null, state: null, at: 0, loading: false, failed: false, busy: false }))

/** The page's numbers, read now. Without Supabase, or failing, the page says the boss can't be reached. */
export async function loadBoss(eventId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    useBoss.setState({ eventId, failed: true })
    return
  }
  if (useBoss.getState().loading) return
  useBoss.setState((s) => ({ loading: true, ...(s.eventId !== eventId && { eventId, state: null }) }))
  try {
    const client = await getSupabase()
    if (!client) throw new Error('offline')
    const { data, error } = await client.rpc('boss_state', { p_event: eventId })
    if (error) throw error
    useBoss.setState({ eventId, state: data as BossServerState, at: Date.now(), failed: false })
  } catch (err) {
    console.warn('[boss] state', err)
    useBoss.setState({ failed: true })
  } finally {
    useBoss.setState({ loading: false })
  }
}

const signedIn = () => useGame.getState().auth.status === 'signed_in'

/** The server's refusal, in words. */
function refusal(err: unknown): string {
  const m = String((err as { message?: string })?.message ?? err)
  if (m.includes('not_running')) return t('ui.boss.err.notRunning')
  if (m.includes('bad_level')) return t('ui.boss.err.level')
  if (m.includes('not_signed_in')) return t('ui.boss.signIn')
  return t('ui.boss.err.failed')
}

/**
 * Places one of the player's Pokémon in a slot: the server takes it first (it checks the dates and the level, and
 * works out its hit), then it leaves its Box, the one in the slot before coming back. False when refused.
 */
export async function placeBoss(e: LiveEvent, slot: number, uid: string): Promise<boolean> {
  const { save, data } = useGame.getState()
  if (!save || !signedIn() || useBoss.getState().busy) return false
  const mon = bossCandidates(save, data, e.boss.dex).find((m) => m.inst.id === uid)
  if (!mon) return false
  useBoss.setState({ busy: true })
  try {
    const client = await getSupabase()
    if (!client) throw new Error('offline')
    const { error } = await client.rpc('boss_place', {
      p_event: e.id,
      p_slot: slot,
      p_inst: uid,
      p_dex: mon.inst.dex,
      p_level: mon.inst.level,
      p_shiny: !!mon.inst.shiny,
    })
    if (error) throw error
    mutateSave((s) => placeOnBoss(s, useGame.getState().data, e, slot, uid, Date.now()))
    void loadBoss(e.id)
    return true
  } catch (err) {
    console.warn('[boss] place', err)
    pushToast(refusal(err), 'bad')
    return false
  } finally {
    useBoss.setState({ busy: false })
  }
}

/** Takes a slot's Pokémon back: the server stops its hits (what it dealt stays), then it's back in its Box. */
export async function takeBackBoss(e: LiveEvent, slot: number): Promise<boolean> {
  const { save } = useGame.getState()
  if (!save || useBoss.getState().busy || !bossPlacedOf(save, e.id).some((p) => p.slot === slot)) return false
  useBoss.setState({ busy: true })
  try {
    const client = await getSupabase()
    if (!client) throw new Error('offline')
    const { error } = await client.rpc('boss_take_back', { p_event: e.id, p_slot: slot })
    if (error) throw error
    mutateSave((s) => {
      const next = takeBackFromBoss(s, e.id, slot)
      return next === s ? null : next
    })
    void loadBoss(e.id)
    return true
  } catch (err) {
    console.warn('[boss] take back', err)
    pushToast(t('ui.boss.err.failed'), 'bad')
    return false
  } finally {
    useBoss.setState({ busy: false })
  }
}

/**
 * The Pokémon placed on a Community Boss that has ended come home, to their Box (run at start, when the tab comes
 * back and once a minute). A toast says how many.
 */
export function bossHomecomingNow(): void {
  const { save, data } = useGame.getState()
  if (!save?.events?.boss) return
  const next = bossHomecoming(save, data, serverNow())
  if (next === save) return
  const before = Object.values(save.events.boss).flat().length
  const after = Object.values(next.events?.boss ?? {}).flat().length
  mutateSave(() => next)
  if (before > after) pushToast(t('ui.boss.home', { n: before - after }), 'good', 4500)
}
