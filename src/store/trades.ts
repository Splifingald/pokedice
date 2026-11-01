// Trades (docs/23), the game's side: the check on load, on return to the tab and back Home (what the server says
// changed while you were away, applied once), posting, taking and cancelling, the board's small cache, and the scene.
// A listing taken while away waits in the save (`trades.unseen`) until its scene has played on Home. A trade's id is
// written into the save, the save pushed, then the server told: a tab that dies in between gets the trade again, and
// the save already says it's done.
import { create } from 'zustand'
import {
  applyEnded,
  applyTake,
  applyTaken,
  chooseLanding,
  inWorldRegion,
  isExtreme,
  listOut,
  markTradeRulesSeen,
  markTradesSeen,
  picksAsk,
  picksToday,
  reconcileListings,
  rerollPicks,
  tradeSnapshot,
  tradesOf,
  tradesOn,
  previewTake,
  type Landed,
  type OpenListing,
  type RegionId,
  type TradeLogEntry,
  type TradeVisibility,
  type TradeWant,
} from '@/engine'
import {
  cancelListing,
  fetchBoard,
  fetchMine,
  fetchPicks,
  markApplied,
  postListing,
  takeListing,
  type BoardQuery,
  type TradeListing,
} from '@/lib/trades'
import { commitSave, useGame } from './game'
import { newId } from './run'
import { pushSaveNow, syncSettled } from './sync'

/** A trade to show in the scene: as the save's log has it, and what only the moment knows. */
export interface TradeShow {
  entry: TradeLogEntry
  /** It (or what it evolved into) wasn't in that region's Pokédex. */
  isNew?: boolean
  /** The level of your copy it replaced or merged into. */
  mine?: number | null
  /** The instance it is now, for the evolution scene's numbers. */
  instId?: string | null
  /** One of your listings, taken while you were away: the scene opens as "Trade done!". */
  away?: boolean
}

interface TradesState {
  /** Whose these are; everything clears when the signed-in account changes. */
  userId: string | null
  board: TradeListing[] | null
  boardKey: string
  boardAt: number
  boardState: 'idle' | 'loading' | 'ready' | 'error'
  /** The board's candidates for this player (docs/23 §2.1): the page shows the picks among them. */
  picks: TradeListing[] | null
  /** The listings passed over today, as the candidates were asked for them. */
  picksKey: string
  picksAt: number
  picksState: 'idle' | 'loading' | 'ready' | 'error'
  /** Listings that ended without a trade, back in the Box: a toast each (their dex). */
  returned: number[]
  /** Trades you took that a check applied (a tab closed mid-trade): a toast each. */
  settled: string[]
  /** The trade scene playing (the game shell shows it, over any page). */
  scene: TradeShow | null
}

const EMPTY: TradesState = {
  userId: null,
  board: null,
  boardKey: '',
  boardAt: 0,
  boardState: 'idle',
  picks: null,
  picksKey: '',
  picksAt: 0,
  picksState: 'idle',
  returned: [],
  settled: [],
  scene: null,
}

export const useTrades = create<TradesState>(() => ({ ...EMPTY }))

/** At most this often on return to the tab, as the friends check. */
export const CHECK_EVERY_MS = 5 * 60_000
/** Back Home (or on the Trades page) with a listing out: at most once a minute, so a trade shows up between fights. */
export const HOME_EVERY_MS = 60_000
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
 * The check (§1.6): once the sign-in's sync has settled, and on return to the tab (at most every `every` ms; `force`
 * skips that). Your listings taken while away arrive and wait in the save for their scene; ended ones come back; a
 * trade you took whose tab closed before it was applied is applied now; the save is made to agree with the server's
 * open listings.
 * Not before the sync: the save it changes could be about to give way to the cloud copy. With the switch off it still
 * runs for anyone who has traded, so nothing is ever stranded.
 */
export async function checkTrades(force = false, now = Date.now(), every = CHECK_EVERY_MS): Promise<void> {
  const { save, data } = useGame.getState()
  // Inside a small world no trade reaches the player (docs/21): the check waits until they're back.
  if (checking || !signedInUser() || !save || isExtreme(save) || inWorldRegion(save, data) || !syncSettled())
    return
  const mine = tradesOf(save)
  if (!tradesOn(data) && !mine.out.length && !mine.log?.length && !mine.done.length) return
  if (!force && now - lastCheck < every) return
  checking = true
  lastCheck = now
  try {
    const rows = await fetchMine()
    const st = useGame.getState()
    if (!st.save || isExtreme(st.save)) return
    let next = st.save
    const ids: string[] = []
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
      // One trade the game can't apply (a species it doesn't know: a forged save on the other side) stays unapplied on
      // its own; it must never hold back every other trade, as one shared try did (docs/61).
      try {
        if (r.role === 'owner' && r.status === 'taken' && r.takerMon) {
          const res = applyTaken(
            next,
            st.data,
            { id: r.id, listed: r.mon, given: r.takerMon, with: r.with, withRich: r.withRich },
            now,
            newId,
          )
          next = res.save
          ids.push(r.id)
        } else if (r.role === 'owner' && ENDED.has(r.status)) {
          const res = applyEnded(next, st.data, r.id)
          next = res.save
          ids.push(r.id)
          if (!res.already && res.back) returned.push(r.mon.dex)
        } else if (r.role === 'taker' && r.takerMon) {
          const res = applyTake(
            next,
            st.data,
            { id: r.id, listed: r.mon, given: r.takerMon, with: r.with, withRich: r.withRich },
            now,
            newId,
          )
          next = res.save
          ids.push(r.id)
          if (!res.already) settled.push(r.id)
        }
      } catch (err) {
        console.warn('[trades] skipped', r.id, err instanceof Error ? err.message : err)
      }
    }
    // Trades settled by the server, not played here: a copy that misses one loses the sync anyway (missesTrades).
    if (next !== st.save) commitSave(next, { auto: true })
    if (returned.length || settled.length)
      useTrades.setState((s) => ({
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

/**
 * Back Home, or the Trades page opened, with a listing out: it may have been taken since the last check. Only a
 * listing of yours can change while you play, so nobody without one asks the server.
 */
export async function checkListings(now = Date.now()): Promise<void> {
  const { save } = useGame.getState()
  if (save && !isExtreme(save) && tradesOf(save).out.length) await checkTrades(false, now, HOME_EVERY_MS)
}

/** The trades looked at (all, or these): the gold dot on the avatar and the Trades row goes. */
export function seeTrades(ids?: string[]) {
  const { save } = useGame.getState()
  const next = save && markTradesSeen(save, ids)
  if (next && next !== save) commitSave(next)
}

/** The rules pop-up was shown (or the page opened): it won't open by itself again. */
export function seeTradeRules() {
  const { save } = useGame.getState()
  const next = save && markTradeRulesSeen(save)
  if (next && next !== save) commitSave(next)
}

/** Plays the trade scene over whatever is on screen; it marks that trade seen (watched). */
export function playTrade(show: TradeShow) {
  useTrades.setState({ scene: show })
  seeTrades([show.entry.id])
}
export const endTrade = () => useTrades.setState({ scene: null })

/** The toasts said. */
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

/**
 * The board's candidates (docs/23 §2.1), for what the save owns now and the listings it passed over today: from the
 * cache when read under a minute ago for the same ones, unless `force`.
 */
export async function loadPicks(force = false, now = Date.now()): Promise<void> {
  signedInUser()
  const { save, data } = useGame.getState()
  if (!save) return
  const skip = picksToday(save, now).skip
  const key = JSON.stringify(skip)
  const st = useTrades.getState()
  if (!force && st.picksKey === key && st.picksState === 'ready' && now - st.picksAt < BOARD_EVERY_MS) return
  useTrades.setState({ picksKey: key, picksState: st.picks ? 'ready' : 'loading', picksAt: now })
  try {
    const picks = await fetchPicks(picksAsk(save, data), skip)
    if (useTrades.getState().picksKey !== key) return
    useTrades.setState({ picks, picksState: 'ready' })
  } catch (err) {
    console.warn('[trades] picks not loaded:', err instanceof Error ? err.message : err)
    useTrades.setState({ picksState: 'error' })
  }
}

/**
 * NEW PICKS: the listings shown go to the back of the line until tomorrow and one of the day's is used, then the
 * candidates are asked for again (offline, the ones at hand are ranked again). False when none is left.
 */
export async function newPicks(shown: string[], now = Date.now()): Promise<boolean> {
  const { save, data } = useGame.getState()
  const next = save && rerollPicks(save, data, shown, now)
  if (!next) return false
  commitSave(next)
  await loadPicks(true, now)
  return true
}

const forgetBoard = (id?: string) =>
  useTrades.setState((s) => ({
    boardAt: 0,
    picksAt: 0,
    board: id ? (s.board?.filter((l) => l.id !== id) ?? null) : s.board,
    picks: id ? (s.picks?.filter((l) => l.id !== id) ?? null) : s.picks,
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

/**
 * TRADE: the server takes the listing (first come), then this save applies its half at once, in the Box picked on the
 * confirm (`region`) when several may take it; the scene follows.
 */
export async function take(listing: TradeListing, instId: string, region?: RegionId): Promise<TradeShow> {
  await pushed()
  const r = await takeListing(listing.code, instId)
  const cur = useGame.getState()
  if (!cur.save) throw new Error('trades_no_save')
  // Your copy it will meet, as it is before the trade.
  const { mine } = previewTake(cur.save, cur.data, r.listed, r.given, region)
  const res = applyTake(cur.save, cur.data, r, Date.now(), newId, region)
  commitSave(res.save)
  forgetBoard(listing.id)
  void settle([r.id])
  const entry = tradesOf(res.save).log?.find((l) => l.id === r.id)
  if (!entry) throw new Error('trades_failed')
  return { entry, isNew: res.received?.isNew, mine, instId: res.received?.instId }
}

/**
 * The Box picked for a traded Pokémon several could take (the scene's last step): it goes there, or waits there
 * locked, and the cloud copy follows. Null when it no longer waits (picked on another device).
 */
export function land(id: string, region: RegionId): Landed | null {
  const { save, data } = useGame.getState()
  const res = save && chooseLanding(save, data, id, region)
  if (!res) return null
  commitSave(res.save)
  void pushSaveNow().catch(() => {})
  return res
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
