import { Navigate, Outlet } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useInFight } from '@/store/hooks'
import { cx } from '@/theme/util'
import { DayCareTutorial } from './DayCareTutorial'
import { BottomNav, Header, SideNav } from './Hud'

/** In-game shell: top bar, side bar (desktop) or bottom bar (phones), and the screen. No save → back to the title. */
export function GameLayout() {
  const hasSave = useGame((s) => !!s.save)
  const inFight = useInFight()
  if (!hasSave) return <Navigate to="/" replace />
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <SideNav />
        <main className={cx('mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 md:pb-10 md:pt-4', inFight ? 'pb-2 pt-2' : 'pb-24 pt-4')}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <DayCareTutorial />
    </div>
  )
}
