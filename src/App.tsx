import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { setCriesEnabled, unlockCriesOnFirstTap } from '@/audio/cries'
import { setSfxEnabled } from '@/audio/sfx'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GameLayout } from '@/components/GameLayout'
import { PageLoading } from '@/components/PageLoading'
import { RotateCover } from '@/components/RotateCover'
import { ToastStack } from '@/components/Toast'
import { AreaScreen } from '@/screens/Area'
import { DayCareScreen } from '@/screens/DayCareScreen'
import { FriendInvite } from '@/screens/FriendInvite'
import { TradeLink } from '@/screens/TradeLink'
import { TradesScreen } from '@/screens/Trades'
import { FriendsScreen } from '@/screens/Friends'
import { HomeScreen } from '@/screens/Home'
import { LeaderboardScreen } from '@/screens/Leaderboard'
import { NewGame } from '@/screens/NewGame'
import { PokedexScreen } from '@/screens/Pokedex'
import { SettingsScreen } from '@/screens/Settings'
import { ShopScreen } from '@/screens/Shop'
import { TeamScreen } from '@/screens/Team'
import { Title } from '@/screens/Title'
import { UpgradesScreen } from '@/screens/Upgrades'
import { VersusScreen } from '@/screens/Versus'
import { EventsScreen } from '@/screens/events/EventsScreen'
import { UndergroundScreen } from '@/screens/events/Underground'
import { UndergroundDig } from '@/screens/events/UndergroundDig'
import { ProgressRaidScreen } from '@/screens/events/ProgressRaidScreen'
import { PageMeta } from '@/lib/pageMeta'
import { soundOn } from '@/save/storage'
import { useGame } from '@/store/game'
import { startBackgroundServices } from '@/store/sync'

// Route-split out of the main bundle. The rework prototype (one page, no server) carries neither.
const AdminApp = import.meta.env.VITE_PROTO ? () => null : lazy(() => import('@/admin/AdminApp'))
const SetupPage = import.meta.env.VITE_PROTO ? () => null : lazy(() => import('@/setup/SetupPage'))
const HelpPage = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpPage })))
const KitchenSink = lazy(() => import('@/screens/KitchenSink').then((m) => ({ default: m.KitchenSink })))
const FxLab = lazy(() => import('@/screens/FxLab').then((m) => ({ default: m.FxLab })))

/**
 * The rework prototype (vite.proto.config.ts) runs inside an Artifact, whose address is not the game's: its pages live
 * in memory, and it opens on Home (or a new game), not the title screen.
 */
const PROTO = !!import.meta.env.VITE_PROTO
function Router({ children }: { children: ReactNode }) {
  if (!PROTO) return <BrowserRouter>{children}</BrowserRouter>
  return <MemoryRouter initialEntries={[useGame.getState().save ? '/home' : '/new']}>{children}</MemoryRouter>
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

export function App() {
  const settings = useGame((s) => s.settings)

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion)
    setSfxEnabled(soundOn(settings))
    setCriesEnabled(soundOn(settings))
  }, [settings])

  useEffect(() => startBackgroundServices(), [])
  useEffect(() => unlockCriesOnFirstTap(), [])

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
      <ErrorBoundary>
        <Router>
          {/* The tab's title per page, and the focus on its <h1> after a move (docs/15 §7). */}
          <PageMeta />
          <Routes>
            <Route path="/" element={<Title />} />
            <Route path="/new" element={<NewGame />} />
            <Route path="/f/:code" element={<FriendInvite />} />
            <Route path="/t/:code" element={<TradeLink />} />
            <Route path="/help" element={<Lazy><HelpPage /></Lazy>} />
            <Route path="/setup" element={<Lazy><SetupPage /></Lazy>} />
            <Route path="/admin" element={<Lazy><AdminApp /></Lazy>} />
            <Route path="/admin/:section" element={<Lazy><AdminApp /></Lazy>} />
            {import.meta.env.DEV && <Route path="/kitchen-sink" element={<Lazy><KitchenSink /></Lazy>} />}
            {import.meta.env.DEV && <Route path="/kitchen-sink/fx" element={<Lazy><FxLab /></Lazy>} />}
            <Route element={<GameLayout />}>
              <Route path="/home" element={<HomeScreen />} />
              {/* Home replaced the Map as the landing screen: old links land there. */}
              <Route path="/map" element={<Navigate to="/home" replace />} />
              <Route path="/daycare" element={<DayCareScreen />} />
              <Route path="/area" element={<AreaScreen />} />
              <Route path="/team" element={<TeamScreen />} />
              <Route path="/shop" element={<ShopScreen />} />
              <Route path="/upgrades" element={<UpgradesScreen />} />
              <Route path="/pokedex" element={<PokedexScreen />} />
              <Route path="/leaderboard" element={<LeaderboardScreen />} />
              <Route path="/friends" element={<FriendsScreen />} />
              <Route path="/versus" element={<VersusScreen />} />
              <Route path="/trades" element={<TradesScreen />} />
              <Route path="/events/:id" element={<EventsScreen />} />
              <Route path="/underground" element={<UndergroundScreen />} />
              <Route path="/underground/dig" element={<UndergroundDig />} />
              <Route path="/raid/:areaId/:dex" element={<ProgressRaidScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
        <ToastStack />
        {/* Phones and tablets play upright: turned sideways, the game waits behind it (docs/15 §6). */}
        <RotateCover />
      </ErrorBoundary>
    </MotionConfig>
  )
}
