import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useFullscreen, useTopBarHidden } from '@/lib/fullscreen'
import { useInFight } from '@/store/hooks'
import { useServerTimeSync } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { DayCareNotice, DayCareTutorial } from './DayCareTutorial'
import { DonationPopup } from './SupportModal'
import { EventUnlockPopup } from './EventUnlockPopup'
import { AwayReportModal, ExtremeUnlockPopup } from './Extreme'
import { LivePopup } from '@/screens/events/live'
import { useInWorld, worldVars, WorldByePopup, WorldFinishPopup, WorldPopup } from '@/screens/events/world'
import { WorldPick } from '@/screens/events/worldPick'
import { VersusUnlockPopup } from './FeatureRules'
import { GeneralUnlockPopup, OfflineReportModal } from './GeneralRules'
import { DayNightRulesPopup } from './DayNight'
import { IdleRulesPopup } from './IdleMode'
import { PowersUnlockPopup } from './PowersRules'
import { RaidGiftPopup } from './RaidGiftPopup'
import { FriendsService } from './friends/FriendsService'
import { InviteRewardPopup, InviteRulesPopup } from './friends/InviteRewards'
import { TradesService } from './trades/TradesService'
import { PushService } from './PushService'
import { BottomNav, Header, SideNav } from './Hud'
import { LeaderboardTutorial } from './LeaderboardTutorial'
import { ReplyPopup } from './ReplyPopup'
import { GiftService } from './Gifts'
import { ShareTutorial } from './ShareTutorial'
import { PortalGuard, PortalUnlockPopup } from '@/screens/area/PortalRun'
import { NightmareGuard } from '@/screens/area/NightmareRun'
import { useUndergroundSettle } from '@/store/underground'

/** In-game shell: top bar, side bar (desktop) or bottom bar (phones), and the screen. No save → back to the title. */
export function GameLayout() {
  const hasSave = useGame((s) => !!s.save)
  const inFight = useInFight()
  // The battle takes the whole screen: no side bar, no tab bar. It keeps the top bar (docs/15 §12): what's in it stays
  // in reach mid-fight; the other full-screen moments (a hatching, a trade) put it away too.
  const full = useFullscreen()
  const noTop = useTopBarHidden()
  // Extreme mode's band (22 px) sits under the top bar.
  const extreme = useGame((s) => s.save?.mode === 'extreme')
  const home = useLocation().pathname === '/home'
  // Over Home a full-screen moment is an overlay (a trade, the partner): the page keeps its padding, which Home's
  // scene bleeds into, rather than jumping and running off the side of a phone behind it.
  const bare = full && !home
  // Inside a small world (docs/21) the page wears its colours.
  const { inside, world } = useInWorld()
  // The special events read the real time (docs/18): kept fresh while the game is open.
  useServerTimeSync()
  // The Underground's block follows the event: a new one starts afresh, an ended one goes, free kits come in.
  useUndergroundSettle()
  if (!hasSave) return <Navigate to="/" replace />
  return (
    <div
      className={cx('flex min-h-screen flex-col', inside && 'in-world')}
      // --top-bar: the top bar's height, for a full-screen page under it to fit the rest of the screen (the battle).
      style={{ ...(inside ? worldVars(world) : undefined), ['--top-bar' as string]: noTop ? '0px' : extreme ? '78px' : '56px' }}
    >
      {!noTop && <Header />}
      <div className="flex flex-1">
        {!full && <SideNav />}
        <main
          className={cx(
            // Home and the battle spread over wide screens (the scene and the stage grow with them); every other screen
            // keeps a reading width.
            'mx-auto w-full min-w-0 flex-1',
            bare ? 'max-w-none' : home ? 'max-w-[1760px]' : 'max-w-6xl',
            bare ? 'p-0' : inFight ? 'px-3 pb-2 pt-2 md:pb-10 md:pt-4' : 'px-3 pb-24 pt-4 md:pb-10 md:pt-4',
          )}
        >
          <Outlet />
        </main>
      </div>
      {!full && <BottomNav />}
      <DayCareTutorial />
      <DayCareNotice />
      <LeaderboardTutorial />
      <ShareTutorial />
      <ReplyPopup />
      <GiftService />
      <DonationPopup />
      <EventUnlockPopup />
      <VersusUnlockPopup />
      <ExtremeUnlockPopup />
      <GeneralUnlockPopup />
      <DayNightRulesPopup />
      <IdleRulesPopup />
      <PowersUnlockPopup />
      <AwayReportModal />
      <OfflineReportModal />
      <RaidGiftPopup />
      <WorldPopup />
      <WorldPick />
      <WorldFinishPopup />
      <WorldByePopup />
      <LivePopup />
      <FriendsService />
      <InviteRulesPopup />
      <InviteRewardPopup />
      <TradesService />
      <PushService />
      <PortalUnlockPopup />
      {/* A portal run under way (docs/28): the area is the only page, and the screen wears the distortion. */}
      <PortalGuard />
      {/* The nightmare holding the player (docs/30): the run kept in its area (no screen effect). */}
      <NightmareGuard />
    </div>
  )
}
