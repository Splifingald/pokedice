// Trades (docs/23), the game's side: the check on load and on return to the tab (what the server says changed while
// you were away, applied once), posting, taking and cancelling, the board's small cache, and the "Trade done!" pop-ups
// waiting for a calm moment. A trade's id is written into the save, the save pushed, then the server told: a tab that
// dies in between gets the trade again, and the save already says it's done.
import { create } from 'zustand'
import {
  applyEnded,
  applyTake,
  applyTaken,
  isExtreme,
  listOut,
  reconcileListings,
  tradeSnapshot,
  tradesOf,
  tradesOn,
  type OpenListing,
  type Received,
  type TradeVisibility,
  type TradeWant,
} from '@/engine'
import {
  cancelListing,
  fetchBoard,
  fetchMine,
  markApplied,
  postListing,
  takeListing,
  type BoardQuery,
  type TradeListing,
} from '@/lib/trades'
import { commitSave, useGame } from './game'
import { newId } from './run'
import { pushSaveNow, syncSettled } from './sync'

interface TradesState {
  /** Whose these are; everything clears when the signed-in account changes. */
  userId: string | null
  board: TradeListing[] | null
  boardKey: string
  boardAt: number
  boardState: 'idle' | 'loading' | 'ready' | 'error'
  /** Listings of yours taken while you were away, applied by the last check: the "Trade done!" pop-ups, in order. */
  popups: string[]
  /** Listings that ended without a trade, back in the Box: a toast each (their dex). */
  returned: number[]
  /** Trades you took that a check applied (a tab closed mid-trade): a toast each. */
  settled: string[]
}

const EMPTY: TradesState = {
  userId: null,
  board: null,
  boardKey: '',
  boardAt: 0,
  boardState: 'idle',
  popups: [],
  returned: [],
  settled: [],
}

export const useTrades = create<TradesState>(() => ({ ...EMPTY }))

/** At most this often on return to the tab, as the friends check. */
export const CHECK_EVERY_MS = 5 * 60_000
/** The board is read at most once a minute for the same filters. */
export const BOARD_EVERY_MS = 60_000

let lastCheck = 0
let checking = false

function signedInUser(): string | null {
  const { auth } = useGame.getState()
  const user = auth.status === 'signed_in' ? auth.userId : null
  if (useTrades.getState().userId !== user) useTrades.setState({ ...EMPTY, userId: user })
  return user
}

/**
 * Push, then tell the server these trades are in the save. Not pushed (an upload refused, the network gone): the
 * server still has them as not applied, and the next check finds them already in the save.
 */
async function settle(ids: string[]): Promise<void> {
  if (!ids.length) return
  try {
    if (await pushSaveNow()) await markApplied(ids)
  } catch (err) {
    console.warn('[trades] not marked applied:', err instanceof Error ? err.message : err)
  }
}

const ENDED = new Set(['cancelled', 'expired', 'removed'])

/**
 * The check (§1.6): once the sign-in's sync has settled, and on return to the tab (at most every 5 minutes; `force`
 * skips that). Your listings taken while away arrive and wait for their pop-up; ended ones come back; a trade you took
 * whose tab closed before it was applied is applied now; the save is made to agree with the server's open listings.
 * Not before the sync: the save it changes could be about to give way to the cloud copy. With the switch off it still
 * runs for anyone who has traded, so nothing is ever stranded.
 */
export async function checkTrades(force = false, now = Date.now()): Promise<void> {
  const { save, data } = useGame.getState()
  if (checking || !signedInUser() || !save || isExtreme(save) || !syncSettled()) return
  const mine = tradesOf(save)
  if (!tradesOn(data) && !mine.out.length && !mine.log?.length && !mine.done.length) return
  if (!force && now - lastCheck < CHECK_EVERY_MS) return
  checking = true
  lastCheck = now
  try {
    const rows = await fetchMine()
    const st = useGame.getState()
    if (!st.save || isExtreme(st.save)) return
    let next = st.save
    const ids: string[] = []
    const popups: string[] = []
    const returned: number[] = []
    const settled: string[] = []
    const open: OpenListing[] = rows
      .filter((r) => r.role === 'owner' && r.status === 'open')
      .map((r) => ({
        id: r.id,
        code: r.code,
        region: r.fromRegion,
        inst: r.mon,
        endsAt: r.endsAt,
        want: r.want,
        visibility: r.visibility,
        at: r.createdAt,
      }))
    next = reconcileListings(next, st.data, open, new Set(rows.map((r) => r.id)))
    for (const r of rows) {
      if (r.role === 'owner' && r.status === 'taken' && r.takerMon) {
        const res = applyTaken(
          next,
          st.data,
          { id: r.id, listed: r.mon, given: r.takerMon, with: r.with },
          now,
          newId,
        )
        next = res.save
        ids.push(r.id)
        if (!res.already) popups.push(r.id)
      } else if (r.role === 'owner' && ENDED.has(r.status)) {
        const res = applyEnded(next, st.data, r.id)
        next = res.save
        ids.push(r.id)
        if (!res.already && res.back) returned.push(r.mon.dex)
      } else if (r.role === 'taker' && r.takerMon) {
        const res = applyTake(
          next,
          st.data,
          { id: r.id, listed: r.mon, given: r.takerMon, with: r.with },
          now,
          newId,
        )
        next = res.save
        ids.push(r.id)
        if (!res.already) settled.push(r.id)
      }
    }
    if (next !== st.save) commitSave(next)
    if (popups.length || returned.length || settled.length)
      useTrades.setState((s) => ({
        popups: [...s.popups, ...popups],
        returned: [...s.returned, ...returned],
        settled: [...s.settled, ...settled],
      }))
    await settle(ids)
  } catch (err) {
    console.warn('[trades] check failed:', err instanceof Error ? err.message : err)
  } finally {
    checking = false
  }
}

/** The pop-up for a trade was seen, or the toasts said. */
export const shiftPopup = () => useTrades.setState((s) => ({ popups: s.popups.slice(1) }))
export const clearReturned = () => useTrades.setState({ returned: [], settled: [] })

/** The board for these filters: from the cache when read under a minute ago, unless `force`. */
export async function loadBoard(q: BoardQuery = {}, force = false, now = Date.now()): Promise<void> {
  signedInUser()
  const key = JSON.stringify(q)
  const st = useTrades.getState()
  if (!force && st.boardKey === key && st.boardState === 'ready' && now - st.boardAt < BOARD_EVERY_MS) return
  useTrades.setState({
    boardKey: key,
    boardState: st.board && st.boardKey === key ? 'ready' : 'loading',
    boardAt: now,
  })
  try {
    const board = await fetchBoard(q)
    if (useTrades.getState().boardKey !== key) return
    useTrades.setState({ board, boardState: 'ready' })
  } catch (err) {
    console.warn('[trades] board not loaded:', err instanceof Error ? err.message : err)
    useTrades.setState({ boardState: 'error' })
  }
}

const forgetBoard = (id?: string) =>
  useTrades.setState((s) => ({
    boardAt: 0,
    board: id ? (s.board?.filter((l) => l.id !== id) ?? null) : s.board,
  }))

/** Your save must be in the cloud first: the server reads the Pokémon from there, never from what the page sends. */
async function pushed(): Promise<void> {
  if (!(await pushSaveNow())) throw new Error('trades_not_synced')
}

/** POST: the listing is made on the server, then its Pokémon leaves the Box and waits in the save. */
export async function post(
  instId: string,
  want: TradeWant,
  visibility: TradeVisibility,
): Promise<{ id: string; code: string; endsAt: number }> {
  await pushed()
  const { save, data } = useGame.getState()
  if (!save) throw new Error('trades_no_save')
  const listing = await postListing(instId, want, visibility, tradeSnapshot(save, data))
  const cur = useGame.getState()
  const next = cur.save && listOut(cur.save, cur.data, instId, { ...listing, want, visibility }, Date.now())
  if (next) commitSave(next)
  // The cloud copy follows, so another device sees it out of the Box; failing that, the automatic sync carries it.
  void pushSaveNow().catch(() => {})
  forgetBoard()
  return listing
}

export interface Taken {
  id: string
  received: Received
  givenDex: number
  givenLevel: number
  givenShiny: boolean
  with: string
}

/** TRADE: the server takes the listing (first come), then this save applies its half at once. */
export async function take(listing: TradeListing, instId: string): Promise<Taken> {
  await pushed()
  const r = await takeListing(listing.code, instId)
  const cur = useGame.getState()
  if (!cur.save) throw new Error('trades_no_save')
  const res = applyTake(cur.save, cur.data, r, Date.now(), newId)
  commitSave(res.save)
  forgetBoard(listing.id)
  void settle([r.id])
  return {
    id: r.id,
    received: res.received!,
    givenDex: r.given.dex,
    givenLevel: r.given.level,
    givenShiny: !!r.given.shiny,
    with: r.with,
  }
}

/** CANCEL: back to the Box; too late (taken a moment before), the check applies the trade instead. */
export async function cancel(listingId: string): Promise<'cancelled' | 'taken' | 'gone'> {
  const status = await cancelListing(listingId)
  if (status === 'cancelled') {
    const cur = useGame.getState()
    if (cur.save) {
      const res = applyEnded(cur.save, cur.data, listingId)
      commitSave(res.save)
    }
    forgetBoard(listingId)
    await settle([listingId])
    return 'cancelled'
  }
  await checkTrades(true)
  return status === 'taken' ? 'taken' : 'gone'
}
