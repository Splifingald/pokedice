// Trades' background work (docs/23 §1.6, §2), mounted with the game shell:
// - the check once the sign-in's sync has settled (and when the save switches back from Extreme mode), and on return
//   to the tab (at most every 5 minutes);
// - "Trade done!" for a listing of yours taken while you were away, between fights, then the scene; a toast for a
//   listing that came back, and for a trade you took that a closed tab left half done;
// - a shared link (/t/<code>): the listing in its sheet once the run is idle, never mid-fight;
// - the trade scene itself, over any page.
import { useEffect, useRef, useState } from 'react'
import { dayCareTutorialDue, leaderboardTutorialDue, tradesOf } from '@/engine'
import { useT } from '@/i18n/react'
import { useFullscreen } from '@/lib/fullscreen'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clearTradeLink, readTradeLink, TRADE_LINK_EVENT, viewListing, type TradeListing } from '@/lib/trades'
import { pushToast, useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { checkTrades, clearReturned, endTrade, playTrade, shiftPopup, useTrades } from '@/store/trades'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { MiniSprite } from '../SpriteImg'
import { PixelIcon } from '../icons'
import { ListingSheet } from './ListingSheet'
import { TradeScene } from './TradeScene'
import { TradesUnlockPopup } from './TradeRules'

export function TradesService() {
  const userId = useGame((s) => (s.auth.status === 'signed_in' ? s.auth.userId : null))
  const mode = useGame((s) => s.save?.mode ?? null)
  // The sign-in's sync is over: the save won't give way to the cloud copy now.
  const synced = useCloudSync((s) => s.settled)
  const scene = useTrades((s) => s.scene)

  useEffect(() => {
    if (userId && synced) void checkTrades(true)
  }, [userId, synced, mode])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && void checkTrades()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

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

/** Between fights, after Prof. Oak's tutorials, never over a full-screen moment (a battle, a hatching, a trade). */
function useCalm() {
  const full = useFullscreen()
  const calm = useGame(
    (s) =>
      s.run.phase === 'idle' &&
      !!s.save &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data),
  )
  return calm && !full
}

/** What happened while you were away: the pop-up for each listing taken, a toast for the rest. */
function Comebacks() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const popups = useTrades((s) => s.popups)
  const returned = useTrades((s) => s.returned)
  const settled = useTrades((s) => s.settled)
  const calm = useCalm()
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')

  useEffect(() => {
    if (!calm || (!returned.length && !settled.length)) return
    for (const dex of returned) pushToast(t('ui.trades.cameBack', { name: name(dex) }), 'info', 4500)
    const log = save ? (tradesOf(save).log ?? []) : []
    for (const id of settled) {
      const e = log.find((l) => l.id === id)
      if (e) pushToast(t('ui.trades.settled', { name: name(e.evolvedTo ?? e.got.dex) }), 'good', 4500)
    }
    clearReturned()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, returned, settled])

  const id = popups[0]
  const entry = id && save ? (tradesOf(save).log ?? []).find((l) => l.id === id) : undefined
  // A pop-up for a trade the log no longer holds (an older save loaded since) is dropped.
  useEffect(() => {
    if (id && save && !entry) shiftPopup()
  }, [id, save, entry])

  return (
    <Modal open={!!entry && calm} onClose={shiftPopup} title={t('ui.trades.pop.title')}>
      {entry && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-3" aria-hidden>
            <span className="grid justify-items-center">
              <MiniSprite dex={entry.gave.dex} size={56} />
              <small className="font-pixel-sm text-[14px] text-muted">{t('ui.trades.pop.yours')}</small>
            </span>
            <PixelIcon name="trade" size={36} />
            <span className="grid justify-items-center">
              <MiniSprite dex={entry.got.dex} size={56} />
              <small className="font-pixel-sm text-[14px] text-muted">
                {t('ui.trades.whose', { name: entry.with || t('ui.friends.someone') })}
              </small>
            </span>
          </div>
          <p className="copy m-0 text-center text-[20px]">
            {t('ui.trades.pop.body', {
              name: entry.with || t('ui.friends.someone'),
              mon: name(entry.gave.dex),
            })}
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5">
            <PixelButton onClick={shiftPopup}>{t('ui.events.later')}</PixelButton>
            <PixelButton
              variant="primary"
              onClick={() => {
                shiftPopup()
                playTrade({ entry })
              }}
            >
              {t('ui.trades.pop.see')}
            </PixelButton>
          </div>
        </div>
      )}
    </Modal>
  )
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
