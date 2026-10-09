import { Navigate, Outlet } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useFullscreen } from '@/lib/fullscreen'
import { useInFight } from '@/store/hooks'
import { cx } from '@/theme/util'
import { DayCareTutorial } from './DayCareTutorial'
import { DonationPopup } from './DonationPopup'
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
  if (!hasSave) return <Navigate to="/" replace />
  return (
    <div className="flex min-h-screen flex-col">
      {!full && <Header />}
      <div className="flex flex-1">
        {!full && <SideNav />}
        <main
          className={cx(
            'mx-auto w-full min-w-0 max-w-6xl flex-1',
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
    </div>
  )
}
