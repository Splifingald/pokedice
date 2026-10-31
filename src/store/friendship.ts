// Friendship streaks and the Friend Market (docs/57): the status from the server (on game load, on the Friends and
// market pages, and on return to the tab, at most once a minute), a purchase put in the save with the gifts' own
// opening, purchases a closed tab left unapplied, and the interactions only the game sees told to the server.
import { create } from 'zustand'
import {
  applyMarketBuys,
  clearEggReports,
  friendshipOf,
  friendshipOn,
  friendshipWaits,
  markFriendshipRulesSeen,
  type MarketBuy,
} from '@/engine'
import { t } from '@/i18n'
import {
  buyFromMarket,
  fetchFriendshipStatus,
  marketError,
  markMarketApplied,
  reportEggFriend,
  reportRaidFriends,
  type FriendshipStatus,
} from '@/lib/friendship'
import { mutateSave, pushToast, useGame } from './game'
import { useGiftMoment } from './gifts'
import { newId } from './run'
import { pushSaveNow, syncSettled } from './sync'

interface FriendshipState {
  status: FriendshipStatus | null
  state: 'idle' | 'loading' | 'ready' | 'error'
  at: number
  /** A purchase on its way: the buttons wait. */
  busy: string | null
}

export const useFriendship = create<FriendshipState>(() => ({
  status: null,
  state: 'idle',
  at: 0,
  busy: null,
}))

const EVERY_MS = 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const signedIn = () => useGame.getState().auth.status === 'signed_in'

/** friendship_status(), at most once a minute unless forced; then what waits (purchases, Egg reports) goes out. */
export async function loadFriendship(force = false, now = Date.now()): Promise<void> {
  const { data } = useGame.getState()
  if (!signedIn() || !friendshipOn(data)) {
    if (useFriendship.getState().status) useFriendship.setState({ status: null, state: 'idle' })
    return
  }
  const st = useFriendship.getState()
  if (!force && st.state === 'loading') return
  if (!force && st.state === 'ready' && now - st.at < EVERY_MS) return
  useFriendship.setState({ state: st.status ? 'ready' : 'loading', at: now })
  try {
    await sendEggReports()
    const status = await fetchFriendshipStatus()
    sayNewDays(useFriendship.getState().status, status)
    useFriendship.setState({ status, state: 'ready' })
    putAwayWaiting()
  } catch (err) {
    console.warn('[friendship] status not loaded:', err instanceof Error ? err.message : err)
    useFriendship.setState({ state: 'error' })
  }
}

/** A streak day paid since the last status: said once, with the friend's name when the list knows it. */
function sayNewDays(before: FriendshipStatus | null, after: FriendshipStatus | null) {
  if (!before || !after || before.day !== after.day) return
  const fresh = after.today.slice(before.today.length).filter((x) => x.coins > 0)
  const total = fresh.reduce((n, x) => n + x.coins, 0)
  if (total > 0) pushToast(t('ui.fship.toastCoins', { n: total }), 'good')
}

/** The market can be used here and now: signed in, the main game outside a small world, the save settled. */
export function canUseMarket(): boolean {
  const { save, data } = useGame.getState()
  return !!save && signedIn() && !friendshipWaits(save, data) && syncSettled()
}

/**
 * Purchases the server handed back that no save has yet (a tab closed mid-way): into this one, then marked applied.
 * Only between fights, with no other opening on screen, once the sign-in's sync has settled; FriendsService asks
 * again when that changes.
 */
export function putAwayWaiting() {
  const buys = useFriendship.getState().status?.pending ?? []
  const { run } = useGame.getState()
  if (!buys.length || !canUseMarket() || run.phase !== 'idle' || useGiftMoment.getState().opening) return
  if (useFriendship.getState().busy) return
  place(buys)
  void settle(buys.map((b) => b.id))
}

function place(buys: MarketBuy[]): boolean {
  let landed: ReturnType<typeof applyMarketBuys> = null
  mutateSave((s) => {
    landed = applyMarketBuys(s, useGame.getState().data, buys, Date.now(), newId)
    return landed?.save ?? null
  })
  const res = landed as ReturnType<typeof applyMarketBuys>
  if (res?.landed.length) useGiftMoment.setState({ opening: res.landed, source: 'market' })
  return true
}

/** The save goes up first, so the cloud copy holds the gifts before the server forgets them. */
async function settle(ids: string[]) {
  try {
    await pushSaveNow()
    await markMarketApplied(ids)
    const st = useFriendship.getState().status
    if (st)
      useFriendship.setState({ status: { ...st, pending: st.pending.filter((p) => !ids.includes(p.id)) } })
  } catch (err) {
    // They come back in the next status; the save remembers they're in, so nothing doubles.
    console.warn('[friendship] not marked applied:', err instanceof Error ? err.message : err)
  }
}

/** Buys `qty` of a market row (an item's key, or 'shiny'): paid on the server, then opened like a gift. */
export async function buyMarket(key: string, qty: number): Promise<boolean> {
  if (useFriendship.getState().busy || !canUseMarket()) return false
  useFriendship.setState({ busy: key })
  try {
    const buy = await buyFromMarket(key, qty)
    const st = useFriendship.getState().status
    if (st)
      useFriendship.setState({
        status: {
          ...st,
          balance: buy.balance,
          bought: { ...st.bought, [key]: (st.bought[key] ?? 0) + qty },
        },
      })
    place([buy])
    void settle([buy.id])
    return true
  } catch (err) {
    const why = marketError(err)
    pushToast(t(`ui.market.err.${why}`), 'bad')
    if (why !== 'failed') void loadFriendship(true)
    return false
  } finally {
    useFriendship.setState({ busy: null })
  }
}

/** Eggs made with friends' Pokémon, told to the server; each leaves the queue once told (or refused for good). */
export async function sendEggReports(): Promise<void> {
  const save = useGame.getState().save
  const eggs = save ? (friendshipOf(save).eggs ?? []) : []
  if (!eggs.length || !signedIn()) return
  const sent: string[] = []
  for (const friend of eggs) {
    try {
      await reportEggFriend(friend)
      sent.push(friend)
    } catch (err) {
      console.warn('[friendship] egg not told:', err instanceof Error ? err.message : err)
    }
  }
  if (sent.length) mutateSave((s) => clearEggReports(s, sent), { auto: true })
}

/** A raid fought beside friends' teams, won or lost (`key`: a progression raid's; null for the day's raid). */
export async function raidWithFriends(ids: string[], key: string | null): Promise<void> {
  // Friends only: an NPC partner has no account.
  const helpers = ids.filter((id) => UUID.test(id))
  if (!helpers.length || !signedIn() || !friendshipOn(useGame.getState().data)) return
  try {
    if ((await reportRaidFriends(helpers, key)) > 0) void loadFriendship(true)
  } catch (err) {
    console.warn('[friendship] raid not told:', err instanceof Error ? err.message : err)
  }
}

export const seeFriendshipRules = () => mutateSave(markFriendshipRulesSeen)
