import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useFullscreen, useTopBarHidden } from '@/lib/fullscreen'
import { useInFight } from '@/store/hooks'
import { useServerTimeSync } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { useInWorld, worldVars } from '@/screens/events/world'
import { BottomNav, Header, SideNav } from './Hud'
import { OneTimePopups, PopupQueue } from './PopupQueue'
import { PortalGuard } from '@/screens/area/PortalRun'
import { NightmareGuard } from '@/screens/area/NightmareRun'
import { TimeRaceGuard } from '@/screens/area/TimeRaceRun'
import { WhiteoutGuard } from '@/screens/area/WhiteoutRun'
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
  const path = useLocation().pathname
  const home = path === '/home'
  // In an area the page's own bars (HOME / CONTINUE, the Center's, LEAVE) are the way out: no tab bar on phones (the
  // rework). They come down to the screen's foot, over the home indicator's room.
  const area = path === '/area'
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
    // The one-time pop-ups take turns (engine/popups.ts): the queue wraps the pages too, whose own pop-ups (the region
    // offer, the push question) wait their turn.
    <PopupQueue>
      <div
        className={cx('flex min-h-screen flex-col', inside && 'in-world')}
        // --top-bar: the top bar's height, for a full-screen page under it to fit the rest of the screen (the battle).
        style={{
          ...(inside ? worldVars(world) : undefined),
          ['--top-bar' as string]: noTop ? '0px' : extreme ? '78px' : '56px',
          ...(area && { ['--bottom-nav' as string]: '0px', ['--bottom-safe' as string]: 'env(safe-area-inset-bottom)' }),
        }}
      >
        {!noTop && <Header />}
        <div className="flex flex-1">
          {!full && <SideNav />}
          <main
            className={cx(
              // Home and the battle spread over wide screens (the scene and the stage grow with them); every other screen
              // keeps a reading width.
              'mx-auto w-full min-w-0 flex-1',
              bare ? 'max-w-none' : home ? 'max-w-[1760px]' : 'max-w-[1400px]',
              bare
                ? 'p-0'
                : inFight
                  ? 'px-3 pb-2 pt-2 md:pb-10 md:pt-4'
                  : area
                    ? 'px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:pb-10 md:pt-4'
                    : 'px-3 pb-24 pt-4 md:pb-10 md:pt-4',
            )}
          >
            <Outlet />
          </main>
        </div>
        {!full && !area && <BottomNav />}
        <OneTimePopups />
        {/* A portal run under way (docs/28): the area is the only page, and the screen wears the distortion. */}
        <PortalGuard />
        {/* The nightmare holding the player (docs/30): the run kept in its area (no screen effect). */}
        <NightmareGuard />
        {/* The race of time and space (docs/61 §4.4): a try kept in its area, ended by its clock wherever it is. */}
        <TimeRaceGuard />
        {/* The whiteout holding the player (docs/61 §4.3): the run kept in Crown Shrine. */}
        <WhiteoutGuard />
      </div>
    </PopupQueue>
  )
}
