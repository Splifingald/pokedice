import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useFullscreen } from '@/lib/fullscreen'
import { useInFight } from '@/store/hooks'
import { cx } from '@/theme/util'
import { DayCareTutorial } from './DayCareTutorial'
import { DonationPopup } from './DonationPopup'
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
  if (!hasSave) return <Navigate to="/" replace />
  return (
    <div className="flex min-h-screen flex-col">
      {!full && <Header />}
      <div className="flex flex-1">
        {!full && <SideNav />}
        <main
          className={cx(
            // Home spreads over wide screens (its scene grows with them); every other screen keeps a reading width.
            'mx-auto w-full min-w-0 flex-1',
            home ? 'max-w-[1760px]' : 'max-w-6xl',
            full ? 'p-0' : inFight ? 'px-3 pb-2 pt-2 md:pb-10 md:pt-4' : 'px-3 pb-24 pt-4 md:pb-10 md:pt-4',
          )}
        >
          <Outlet />
        </main>
      </div>
      {!full && <BottomNav />}
      <DayCareTutorial />
      <LeaderboardTutorial />
      <ShareTutorial />
      <ReplyPopup />
      <DonationPopup />
      <FriendsService />
    </div>
  )
}
