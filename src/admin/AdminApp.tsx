// /admin — route-guarded here (cosmetic) and on every write by Postgres RLS (the real gate).
import { useEffect, type ComponentType } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import type { TableName } from '@/config/mapping'
import { PixelButton } from '@/components/PixelButton'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { useIsAdmin } from '@/store/hooks'
import { signInWithGoogle, signOut } from '@/store/sync'
import { cx } from '@/theme/util'
import { AreasSection } from './sections/AreasSection'
import { ConfigSection } from './sections/ConfigSection'
import { DevToolsSection } from './sections/DevToolsSection'
import { PullRemoteButton } from './PullRemoteButton'
import { PokemonSection } from './sections/PokemonSection'
import { SimulatorSection } from './sections/SimulatorSection'
import { DiceSection, ItemsSection, TrainersSection, TypeChartSection, UpgradesSection } from './sections/TableSections'
import { discard, exportBundle, loadAdmin, publish, saveAll, undoLastSave, useAdmin, useDirtyTables } from './store'

const SECTIONS: { id: string; label: string; C: ComponentType }[] = [
  { id: 'pokemon', label: 'Pokémon', C: PokemonSection },
  { id: 'areas', label: 'Areas', C: AreasSection },
  { id: 'trainers', label: 'Trainers', C: TrainersSection },
  { id: 'dice', label: 'Dice Types', C: DiceSection },
  { id: 'upgrades', label: 'Upgrades', C: UpgradesSection },
  { id: 'items', label: 'Items', C: ItemsSection },
  { id: 'typechart', label: 'Type Chart', C: TypeChartSection },
  { id: 'config', label: 'Config', C: ConfigSection },
  { id: 'simulator', label: 'Simulator', C: SimulatorSection },
  { id: 'devtools', label: 'Dev Tools', C: DevToolsSection },
]

/** The tables each section edits — for the "unsaved" dot in the menu. */
const SECTION_TABLES: Partial<Record<string, TableName[]>> = {
  pokemon: ['pokemon'],
  areas: ['areas', 'area_wild_pool', 'area_trainer_pool', 'area_loot_pool'],
  trainers: ['trainers'],
  dice: ['dice_types'],
  upgrades: ['combo_upgrades', 'die_upgrades'],
  items: ['items'],
  typechart: ['type_chart'],
  config: ['game_config'],
}

function Gate() {
  const auth = useGame((s) => s.auth)
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="pixel-panel flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <h1 className="text-4xl">Admin</h1>
        {!isSupabaseConfigured || auth.status === 'unavailable' ? (
          <p className="text-xl">
            The admin panel needs Supabase. Follow the{' '}
            <Link to="/setup" className="underline">
              deployment guide
            </Link>
            .
          </p>
        ) : auth.status === 'signed_in' ? (
          <>
            <p className="text-xl">Signed in as {auth.email}, which is not the admin account.</p>
            <PixelButton onClick={() => void signOut()}>Sign out</PixelButton>
          </>
        ) : (
          <>
            <p className="text-xl">Sign in with the admin Google account.</p>
            <PixelButton variant="primary" onClick={() => void signInWithGoogle()}>
              Sign in with Google
            </PixelButton>
          </>
        )}
        <Link to="/" className="underline">
          Back to the game
        </Link>
      </div>
    </div>
  )
}

function SaveBar() {
  const dirty = useDirtyTables()
  const saving = useAdmin((s) => s.saving)
  const undo = useAdmin((s) => s.undo)
  const mode = useAdmin((s) => s.mode)
  return (
    <section aria-label="Save changes" className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-ink bg-panel px-3 py-2 shadow-[0_-3px_0_#6b6480]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
        <span className={cx('text-lg', dirty.length ? 'text-danger' : 'text-muted')}>
          {dirty.length ? `Unsaved: ${dirty.join(', ')}` : 'All changes saved'}
        </span>
        <PixelButton size="sm" variant="primary" disabled={!dirty.length || saving} onClick={() => void saveAll()} title="Ctrl+S">
          {saving ? 'Saving…' : 'Save changes'}
        </PixelButton>
        <kbd className="border-2 border-shadow px-1 font-mono text-xs text-muted">Ctrl+S</kbd>
        <PixelButton size="sm" disabled={!dirty.length || saving} onClick={() => discard()}>
          Discard
        </PixelButton>
        <PixelButton size="sm" disabled={!undo || saving} onClick={() => void undoLastSave()}>
          Undo last save
        </PixelButton>
        <span className="flex-1" />
        <PixelButton size="sm" variant="success" disabled={saving} onClick={() => void publish()} title="Bumps configVersion so every client hot-swaps">
          {dirty.length ? 'Save & Publish' : 'Publish'}
        </PixelButton>
        <PixelButton size="sm" onClick={exportBundle} title="Download the saved state as the bundle JSON">
          Export bundle
        </PixelButton>
        {import.meta.env.DEV && mode === 'remote' && <PullRemoteButton />}
      </div>
    </section>
  )
}

export default function AdminApp() {
  const isAdmin = useIsAdmin()
  const mode = useAdmin((s) => s.mode)
  const status = useAdmin((s) => s.status)
  const error = useAdmin((s) => s.error)
  const offlineDev = import.meta.env.DEV && !isSupabaseConfigured
  const allowed = isAdmin || offlineDev
  const { section = 'pokemon' } = useParams()

  const dirty = useDirtyTables()

  useEffect(() => {
    if (allowed) void loadAdmin()
  }, [allowed])

  // Ctrl/Cmd+S saves the working copy.
  useEffect(() => {
    if (!allowed) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      if (!useAdmin.getState().saving) void saveAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allowed])

  // Leaving (closing the tab, reloading) with unsaved edits asks first.
  useEffect(() => {
    if (!dirty.length) return
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty.length])

  if (!allowed) return <Gate />
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!
  const C = current.C

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-ink text-panel">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-3 py-2">
          <h1 className="text-2xl leading-none">
            POKÉ<span className="text-danger-light">DICE</span> Admin
          </h1>
          <span className={cx('border-2 px-2 text-base', mode === 'remote' ? 'border-hp-green text-hp-green' : 'border-gold text-gold')}>
            {mode === 'remote' ? 'LIVE · Supabase' : 'OFFLINE · this session only'}
          </span>
          <span className="flex-1" />
          <Link to="/map" className="underline">
            Back to game
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-3 lg:flex-row">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-16 lg:h-fit lg:w-44 lg:shrink-0 lg:flex-col" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={`/admin/${s.id}`}
              className={({ isActive }) =>
                cx('pixel-btn shrink-0 px-2 py-1 text-lg', isActive || (s.id === 'pokemon' && section === 'pokemon') ? 'bg-gold' : 'bg-panel')
              }
            >
              {s.label}
              {SECTION_TABLES[s.id]?.some((t) => dirty.includes(t)) && (
                <span className="ml-1 text-danger" title="Unsaved changes">
                  ●<span className="sr-only"> (unsaved changes)</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 pb-28">
          {status === 'loading' && <p className="text-2xl">Loading tables from Supabase…</p>}
          {status === 'error' && (
            <div className="pixel-panel flex flex-col gap-2 p-4">
              <p className="text-xl text-danger">Could not load the config tables: {error}</p>
              <p className="text-lg">Did you run 0001_init.sql and seed.sql? See the deployment guide.</p>
              <PixelButton className="self-start" onClick={() => void loadAdmin(true)}>
                Retry
              </PixelButton>
            </div>
          )}
          {status === 'ready' && <C />}
        </main>
      </div>
      <SaveBar />
    </div>
  )
}
