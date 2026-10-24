// The one-time pop-ups on screen. The engine decides whose turn it is (engine/popups.ts, `nextOneTimePopup`); PopupQueue
// gathers what the engine can't know (the page, the account, the clock, what waits outside the save) and works the
// turn out once for the whole game, and OneTimePopups mounts every pop-up and the services that bring them in. Each
// pop-up opens only on its turn (popupTurn.ts), so they queue, one at a time, in one order.
import { useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { nextOneTimePopup } from '@/engine'
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
import { DayCareNotice, DayCareTutorial } from './DayCareTutorial'
import { DayNightRulesPopup } from './DayNight'
import { EventUnlockPopup } from './EventUnlockPopup'
import { AwayReportModal, ExtremeUnlockPopup } from './Extreme'
import { VersusUnlockPopup } from './FeatureRules'
import { FriendsService } from './friends/FriendsService'
import { InviteRewardPopup, InviteRulesPopup, useInviteRewardWaiting } from './friends/InviteRewards'
import { GeneralUnlockPopup, OfflineReportModal } from './GeneralRules'
import { GiftService } from './Gifts'
import { LeaderboardTutorial } from './LeaderboardTutorial'
import { PopupTurnContext, usePopupOnScreen } from './popupTurn'
import { PowersUnlockPopup } from './PowersRules'
import { PushService } from './PushService'
import { RaidGiftPopup } from './RaidGiftPopup'
import { ReplyPopup, useRepliesWaiting } from './ReplyPopup'
import { ShareTutorial, useShareSeen } from './ShareTutorial'
import { DonationPopup } from './SupportModal'
import { TradesService } from './trades/TradesService'

/** Works out whose turn it is, once, and hands it down to every pop-up (the pages' too: the region offer, push). */
export function PopupQueue({ children }: { children: ReactNode }) {
  const path = useLocation().pathname
  // Never over a full-screen moment (a battle, a hatching, a trade, the lab) or a gift being opened.
  const full = useFullscreen()
  const gifts = useGiftMoment((s) => s.busy || !!s.rulesFor || !!s.opening)
  const now = useServerNow(5000)
  const shareSeen = useShareSeen()
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
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  // Worked out again only when one of these changes, not on every change to the store (a toast, a fight's turn).
  const turn = useMemo(
    () =>
      nextOneTimePopup(save, data, {
        calm: idle && !full && !gifts,
        path,
        signedIn,
        online: isSupabaseConfigured,
        now,
        shareSeen,
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
      full,
      gifts,
      path,
      signedIn,
      now,
      shareSeen,
      awayReport,
      offlineReport,
      replies,
      raidGifts,
      inviteReward,
      asking,
      showing,
    ],
  )
  return <PopupTurnContext.Provider value={turn}>{children}</PopupTurnContext.Provider>
}

/** Every one-time pop-up, and the services that load what they show (the developer's answers, trades, friends, push). */
export function OneTimePopups() {
  return (
    <>
      <AwayReportModal />
      <OfflineReportModal />
      <DayCareTutorial />
      <DayCareNotice />
      <LeaderboardTutorial />
      <ReplyPopup />
      <RaidGiftPopup />
      <GiftService />
      <DonationPopup />
      <EventUnlockPopup />
      <VersusUnlockPopup />
      <ShareTutorial />
      <ExtremeUnlockPopup />
      <GeneralUnlockPopup />
      <InviteRulesPopup />
      <InviteRewardPopup />
      <PortalUnlockPopup />
      <DayNightRulesPopup />
      <PowersUnlockPopup />
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
