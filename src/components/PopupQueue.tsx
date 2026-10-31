// The one-time pop-ups on screen. The engine decides whose turn it is (engine/popups.ts, `nextOneTimePopup`); PopupQueue
// gathers what the engine can't know (the page, the account, the clock, what waits outside the save) and works the
// turn out once for the whole game, and OneTimePopups mounts every pop-up and the services that bring them in. Each
// pop-up opens only on its turn (popupTurn.ts), so they queue, one at a time, in one order. The rules of a feature with
// a page of its own, Prof. Oak's tips and Support me aren't here: they are notices on Home (docs/43 §7,
// screens/home/Notices.tsx), the rules a card on the feature's page.
import { DiceTutorial } from './DiceTutorial'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { nextOneTimePopup, type OneTimePopup } from '@/engine'
import { useFullscreen } from '@/lib/fullscreen'
import { pushReady, usePush } from '@/lib/push'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAwayReport } from '@/store/extreme'
import { useGame } from '@/store/game'
import { useOfflineReport } from '@/store/general'
import { useGiftMoment } from '@/store/gifts'
import { useRaidGifts } from '@/store/raidGifts'
import { useServerNow } from '@/store/serverTime'
import { LivePopup } from '@/screens/events/live'
import { WorldByePopup, WorldFinishPopup, WorldPopup } from '@/screens/events/world'
import { WorldPick } from '@/screens/events/worldPick'
import { PortalUnlockPopup } from '@/screens/area/PortalRun'
import { DayCareNotice } from './DayCareTutorial'
import { DayNightRulesPopup } from './DayNight'
import { AwayReportModal, ExtremeUnlockPopup } from './Extreme'
import { FriendsService } from './friends/FriendsService'
import { InviteRewardPopup, useInviteRewardWaiting } from './friends/InviteRewards'
import { OfflineReportModal } from './GeneralRules'
import { GiftService } from './Gifts'
import { POPUP_GAP_MS, PopupTurnContext, usePopupOnScreen } from './popupTurn'
import { PowersUnlockPopup } from './PowersRules'
import { TalentRulesPopup } from './Talent'
import { PushService } from './PushService'
import { RaidGiftPopup } from './RaidGiftPopup'
import { ReplyPopup, useRepliesWaiting } from './ReplyPopup'
import { TradesService } from './trades/TradesService'

/**
 * What the player is owed rather than told: the answer to what they just did (a world finished: its goodbye), a report
 * or a gift waiting, the notifications' question a page asked. These come without the rest; the rules, the tutorials
 * and the asks wait their minute.
 */
const FOLLOWS_AT_ONCE = new Set<OneTimePopup>([
  'worldBye',
  'away',
  'offline',
  'replies',
  'raidGifts',
  'inviteReward',
  'push',
])

/** How long a Center's heal plays before the dice tutorial may start over it. */
const CENTER_HEAL_MS = 3200

/** Works out whose turn it is, once, and hands it down to every pop-up (the pages' too: the region offer, push). */
export function PopupQueue({ children }: { children: ReactNode }) {
  const path = useLocation().pathname
  // Never over a full-screen moment (a battle, a hatching, a trade, the lab) or a gift being opened.
  const full = useFullscreen()
  const gifts = useGiftMoment((s) => s.busy || !!s.rulesFor || !!s.opening)
  const now = useServerNow(5000)
  const awayReport = useAwayReport((s) => !!s.report)
  const offlineReport = useOfflineReport((s) => !!s.report)
  const replies = useRepliesWaiting()
  const raidGifts = useRaidGifts((s) => s.gifts.length > 0)
  const inviteReward = useInviteRewardWaiting()
  const asking = usePush((s) => !!s.asking)
  const showing = usePopupOnScreen((s) => s.id)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const idle = useGame((s) => s.run.phase === 'idle' && !s.battle)
  // A Pokémon Center, once its heal has had time to play (about 2.7 s): the dice tutorial may start there.
  const center = useGame((s) => s.run.phase === 'center' && !s.battle)
  const [healed, setHealed] = useState(false)
  useEffect(() => {
    setHealed(false)
    if (!center) return
    const timer = setTimeout(() => setHealed(true), CENTER_HEAL_MS)
    return () => clearTimeout(timer)
  }, [center])
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  // Worked out again only when one of these changes, not on every change to the store (a toast, a fight's turn).
  const due = useMemo(
    () =>
      nextOneTimePopup(save, data, {
        calm: idle && !full && !gifts,
        atCenter: center && healed && !full && !gifts,
        path,
        signedIn,
        online: isSupabaseConfigured,
        now,
        awayReport,
        offlineReport,
        replies,
        raidGifts,
        inviteReward,
        pushAsking: asking && pushReady(data),
        showing,
      }),
    [
      save,
      data,
      idle,
      center,
      healed,
      full,
      gifts,
      path,
      signedIn,
      now,
      awayReport,
      offlineReport,
      replies,
      raidGifts,
      inviteReward,
      asking,
      showing,
    ],
  )
  // Pacing (docs/42): the moment the pop-up on screen is done (no longer due), the queue rests a minute rather than hand
  // the screen straight to the next — the Day Care's rules then the invite, one after the other on arrival, was the
  // heaviest moment of a visit. In memory: a page loaded afresh starts without a wait.
  const closing = showing != null && due !== showing
  // Set in the very render that sees it close: the next render (the pop-up gone from the screen) must already rest.
  const restUntil = useRef(0)
  if (closing) restUntil.current = Date.now() + POPUP_GAP_MS
  const until = restUntil.current
  const resting = until > Date.now()
  const [, wake] = useState(0)
  useEffect(() => {
    if (!resting) return
    const timer = setTimeout(() => wake((n) => n + 1), until - Date.now() + 50)
    return () => clearTimeout(timer)
  }, [resting, until])
  const turn = closing || (resting && !showing && !(due && FOLLOWS_AT_ONCE.has(due))) ? null : due
  return <PopupTurnContext.Provider value={turn}>{children}</PopupTurnContext.Provider>
}

/** Every one-time pop-up, and the services that load what they show (the developer's answers, trades, friends, push). */
export function OneTimePopups() {
  return (
    <>
      <DiceTutorial />
      <AwayReportModal />
      <OfflineReportModal />
      <DayCareNotice />
      <ReplyPopup />
      <RaidGiftPopup />
      <GiftService />
      <ExtremeUnlockPopup />
      <InviteRewardPopup />
      <PortalUnlockPopup />
      <DayNightRulesPopup />
      <PowersUnlockPopup />
      <TalentRulesPopup />
      <WorldPopup />
      <WorldPick />
      <WorldFinishPopup />
      <WorldByePopup />
      <LivePopup />
      <FriendsService />
      <TradesService />
      <PushService />
    </>
  )
}
