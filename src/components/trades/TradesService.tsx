// Trades' background work (docs/23 §1.6, §2), mounted with the game shell:
// - the check once the sign-in's sync has settled (and when the save switches back from Extreme mode), on return to
//   the tab (at most every 5 minutes), and back Home with a listing out (at most every minute);
// - "Trade done!" for a listing of yours taken while you were away: its scene, by itself, once you're back Home, on its
//   turn in the one-time pop-ups' queue (engine/popups.ts); a toast for a listing that came back, and for a trade you
//   took that a closed tab left half done;
// - a shared link (/t/<code>): the listing in its sheet once the run is idle, never mid-fight;
// - the trade scene itself, over any page.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { inWorldRegion, isExtreme, tradesOf, tradesToWatch } from '@/engine'
import { useT } from '@/i18n/react'
import { useFullscreen } from '@/lib/fullscreen'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clearTradeLink, readTradeLink, TRADE_LINK_EVENT, viewListing, type TradeListing } from '@/lib/trades'
import { pushToast, useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { checkListings, checkTrades, clearReturned, endTrade, playTrade, useTrades } from '@/store/trades'
import { useMyTurn, usePopupTurn } from '../popupTurn'
import { ListingSheet } from './ListingSheet'
import { TradeScene } from './TradeScene'
import { TradesUnlockPopup } from './TradeRules'

export function TradesService() {
  const userId = useGame((s) => (s.auth.status === 'signed_in' ? s.auth.userId : null))
  const mode = useGame((s) => s.save?.mode ?? null)
  const inWorld = useGame((s) => !!s.save && inWorldRegion(s.save, s.data))
  // The sign-in's sync is over: the save won't give way to the cloud copy now.
  const synced = useCloudSync((s) => s.settled)
  const scene = useTrades((s) => s.scene)
  const home = useLocation().pathname === '/home'

  useEffect(() => {
    if (userId && synced && !inWorld) void checkTrades(true)
  }, [userId, synced, mode, inWorld])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && void checkTrades()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  // Back Home (after a fight, from another page): a listing out may have been taken meanwhile.
  useEffect(() => {
    if (home && userId && synced) void checkListings()
  }, [home, userId, synced])

  if (!isSupabaseConfigured) return null
  return (
    <>
      <Comebacks />
      <LinkHandler />
      <TradesUnlockPopup />
      <TradeScene show={scene} onDone={endTrade} />
    </>
  )
}

/**
 * Between fights, once no one-time pop-up is due (they open by themselves, one at a time), never over a full-screen
 * moment (a battle, a hatching, a trade), and never inside a small world (no trade reaches one: they wait until the
 * player is back).
 */
function useCalm() {
  const full = useFullscreen()
  const popup = usePopupTurn()
  const calm = useGame((s) => s.run.phase === 'idle' && !!s.save && !inWorldRegion(s.save, s.data))
  return calm && !full && !popup
}

/** A beat on Home before the scene, so it reads as coming home to it rather than a cut. */
const HOME_PAUSE_MS = 700

/** What happened while you were away: the scene for each listing taken (back Home), a toast for the rest. */
function Comebacks() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const returned = useTrades((s) => s.returned)
  const settled = useTrades((s) => s.settled)
  const playing = useTrades((s) => !!s.scene)
  // The scene's own turn in the queue (engine/popups.ts): back Home, between fights, nothing else up. The toasts may
  // come with it.
  const sceneTurn = useMyTurn('tradeScene')
  const calm = useCalm() || sceneTurn
  // The oldest taken listing whose scene hasn't played (or traded Pokémon whose Box is still to pick): kept in the
  // save, so a reload or another device can't lose it.
  const next = useGame((s) => (s.save && !isExtreme(s.save) ? (tradesToWatch(s.save)[0] ?? null) : null))
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')

  useEffect(() => {
    if (!calm || (!returned.length && !settled.length)) return
    for (const dex of returned) pushToast(t('ui.trades.cameBack', { name: name(dex) }), 'info', 4500)
    const log = save ? (tradesOf(save).log ?? []) : []
    for (const id of settled) {
      const e = log.find((l) => l.id === id)
      if (e)
        pushToast(
          t('ui.trades.settled', { name: e.got.nickname || name(e.evolvedTo ?? e.got.dex) }),
          'good',
          4500,
        )
    }
    clearReturned()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, returned, settled])

  useEffect(() => {
    if (!next || !sceneTurn || playing) return
    // A trade you took comes back here only for its Box still to pick: it isn't "Trade done!".
    const id = setTimeout(() => playTrade({ entry: next, away: next.role === 'poster' }), HOME_PAUSE_MS)
    return () => clearTimeout(id)
  }, [next, sceneTurn, playing])

  return null
}

/** A shared link (/t/<code>), kept through a sign-in: the listing in its sheet when the moment is calm. */
function LinkHandler() {
  const { t } = useT()
  const status = useGame((s) => s.auth.status)
  const calm = useCalm()
  const [code, setCode] = useState(() => readTradeLink())
  const [listing, setListing] = useState<TradeListing | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const onLink = () => setCode(readTradeLink())
    window.addEventListener(TRADE_LINK_EVENT, onLink)
    return () => window.removeEventListener(TRADE_LINK_EVENT, onLink)
  }, [])

  // Without the online service there is no listing to open.
  useEffect(() => {
    if (code && status === 'unavailable') {
      clearTradeLink()
      setCode(null)
    }
  }, [code, status])

  useEffect(() => {
    if (!code || !calm || busy.current || (status !== 'signed_in' && status !== 'signed_out')) return
    busy.current = true
    viewListing(code)
      .then((l) => {
        if (l && 'id' in l) setListing(l)
        else {
          clearTradeLink()
          setCode(null)
          pushToast(t(l ? 'ui.trades.linkGone' : 'ui.trades.linkNone'), 'info', 4500)
        }
      })
      .catch(() => {
        clearTradeLink()
        setCode(null)
        pushToast(t('ui.trades.error.failed'), 'bad')
      })
      .finally(() => {
        busy.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, calm, status])

  const close = () => {
    clearTradeLink()
    setCode(null)
    setListing(null)
  }
  return (
    <ListingSheet listing={listing && calm ? listing : null} via="link" onClose={close} onChanged={close} />
  )
}
