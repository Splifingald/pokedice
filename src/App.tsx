import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { setSfxEnabled } from '@/audio/sfx'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GameLayout } from '@/components/GameLayout'
import { SyncConflictModal } from '@/components/SyncConflictModal'
import { ToastStack } from '@/components/Toast'
import { AreaScreen } from '@/screens/Area'
import { DayCareScreen } from '@/screens/DayCareScreen'
import { MapScreen } from '@/screens/MapScreen'
import { NewGame } from '@/screens/NewGame'
import { PokedexScreen } from '@/screens/Pokedex'
import { SettingsScreen } from '@/screens/Settings'
import { ShopScreen } from '@/screens/Shop'
import { TeamScreen } from '@/screens/Team'
import { Title } from '@/screens/Title'
import { UpgradesScreen } from '@/screens/Upgrades'
import { useGame } from '@/store/game'
import { startBackgroundServices } from '@/store/sync'

// Route-split out of the main bundle.
const AdminApp = lazy(() => import('@/admin/AdminApp'))
const SetupPage = lazy(() => import('@/setup/SetupPage'))
const HelpPage = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpPage })))
const KitchenSink = lazy(() => import('@/screens/KitchenSink').then((m) => ({ default: m.KitchenSink })))

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-3xl">Loading…</div>}>{children}</Suspense>
}

export function App() {
  const settings = useGame((s) => s.settings)

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion)
    setSfxEnabled(settings.sfx)
  }, [settings])

  useEffect(() => startBackgroundServices(), [])

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Title />} />
            <Route path="/new" element={<NewGame />} />
            <Route path="/help" element={<Lazy><HelpPage /></Lazy>} />
            <Route path="/setup" element={<Lazy><SetupPage /></Lazy>} />
            <Route path="/admin" element={<Lazy><AdminApp /></Lazy>} />
            <Route path="/admin/:section" element={<Lazy><AdminApp /></Lazy>} />
            {import.meta.env.DEV && <Route path="/kitchen-sink" element={<Lazy><KitchenSink /></Lazy>} />}
            <Route element={<GameLayout />}>
              <Route path="/map" element={<MapScreen />} />
              <Route path="/daycare" element={<DayCareScreen />} />
              <Route path="/area" element={<AreaScreen />} />
              <Route path="/team" element={<TeamScreen />} />
              <Route path="/shop" element={<ShopScreen />} />
              <Route path="/upgrades" element={<UpgradesScreen />} />
              <Route path="/pokedex" element={<PokedexScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <ToastStack />
        <SyncConflictModal />
      </ErrorBoundary>
    </MotionConfig>
  )
}
