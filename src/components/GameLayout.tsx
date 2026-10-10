import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useFullscreen } from '@/lib/fullscreen'
import { useInFight } from '@/store/hooks'
import { useServerTimeSync } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { DayCareNotice, DayCareTutorial } from './DayCareTutorial'
import { DonationPopup } from './DonationPopup'
import { EventUnlockPopup } from './EventUnlockPopup'
import { FriendsService } from './friends/FriendsService'
import { BottomNav, Header, SideNav } from './Hud'
import { LeaderboardTutorial } from './LeaderboardTutorial'
import { ReplyPopup } from './ReplyPopup'
import { ShareTutorial } from './ShareTutorial'

/** In-game shell: top bar, side bar (desktop) or bottom bar (phones), and the screen. No save → back to the title. */
export function GameLayout() {
  const hasSave = useGame((s) => !!s.save)
  const inFight = useInFight()
  // The battle takes the whole screen: no top bar, no side bar, no tab bar.
  const full = useFullscreen()
  const home = useLocation().pathname === '/home'
  // The special events read the real time (docs/18): kept fresh while the game is open.
  useServerTimeSync()
  if (!hasSave) return <Navigate to="/" replace />
  return (
    <div className="flex min-h-screen flex-col">
      {!full && <Header />}
      <div className="flex flex-1">
        {!full && <SideNav />}
        <main
          className={cx(
            // Home and the battle spread over wide screens (the scene and the stage grow with them); every other screen
            // keeps a reading width.
            'mx-auto w-full min-w-0 flex-1',
            full ? 'max-w-none' : home ? 'max-w-[1760px]' : 'max-w-6xl',
            full ? 'p-0' : inFight ? 'px-3 pb-2 pt-2 md:pb-10 md:pt-4' : 'px-3 pb-24 pt-4 md:pb-10 md:pt-4',
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
      <DonationPopup />
      <EventUnlockPopup />
      <FriendsService />
    </div>
  )
}
