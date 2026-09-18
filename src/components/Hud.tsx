import { Link, NavLink, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { useInFight, useIsAdmin } from '@/store/hooks'
import { GoogleAccountButton } from './GoogleAccountButton'
import { cx } from '@/theme/util'
import { GoldPill } from './GoldPill'
import { HelpButton } from './HelpButton'
import { PixelIcon, type IconName } from './icons'

interface NavItem {
  to: string
  label: string
  icon: IconName
}

const MAP: NavItem = { to: '/map', label: 'Map', icon: 'map' }
const TEAM: NavItem = { to: '/team', label: 'Team', icon: 'ball' }
const SHOP: NavItem = { to: '/shop', label: 'Shop', icon: 'potion' }
const UPGRADES: NavItem = { to: '/upgrades', label: 'Upgrades', icon: 'up' }
const DEX: NavItem = { to: '/pokedex', label: 'Pokédex', icon: 'dex' }

/** Side bar (desktop): the map first. */
const SIDE_NAV = [MAP, TEAM, SHOP, UPGRADES, DEX]
/** Bottom bar (phones): the map in the middle, under the thumb. */
const BOTTOM_NAV = [SHOP, UPGRADES, MAP, TEAM, DEX]

/** While exploring, "Map" leads back to the area (the area's MAP button goes to the map itself). */
function useNavEntry(n: NavItem) {
  const runArea = useGame((s) => (s.run.areaId ? (s.data.areas.find((a) => a.id === s.run.areaId)?.name ?? null) : null))
  const { pathname } = useLocation()
  const isMap = n.to === '/map'
  return {
    to: isMap && runArea ? '/area' : n.to,
    active: isMap ? pathname === '/map' || pathname === '/area' : pathname === n.to,
    exploring: isMap ? runArea : null,
  }
}

function NavEntry({ n, variant }: { n: NavItem; variant: 'side' | 'bottom' }) {
  const inFight = useInFight()
  const { to, active, exploring } = useNavEntry(n)
  return (
    <Link
      to={inFight ? '#' : to}
      aria-current={active ? 'page' : undefined}
      aria-disabled={inFight || undefined}
      onClick={(e) => inFight && e.preventDefault()}
      title={inFight ? 'Finish the fight first' : undefined}
      className={cx(
        variant === 'side'
          ? 'pixel-btn flex min-h-[44px] items-center gap-3 px-3 py-2 text-2xl leading-none'
          : 'relative flex flex-1 flex-col items-center justify-center gap-1',
        active && !inFight ? 'bg-gold' : variant === 'side' ? 'bg-panel' : '',
        variant === 'bottom' && active && 'shadow-[inset_0_3px_0_#2a2438]',
        inFight && 'hatched pointer-events-none',
      )}
    >
      <PixelIcon name={n.icon} size={variant === 'side' ? 20 : 22} />
      {variant === 'side' ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span>{n.label}</span>
          {exploring && (
            // Ink on the gold highlight: the muted grey fails contrast there.
            <span className={cx('truncate font-pixel-sm text-sm leading-none', active && !inFight ? 'text-ink' : 'text-muted')}>{exploring}</span>
          )}
        </span>
      ) : (
        <span className="font-pixel-sm text-base leading-none">{n.label}</span>
      )}
      {variant === 'bottom' && exploring && (
        <span className="absolute right-[26%] top-1.5 h-2.5 w-2.5 border-2 border-ink bg-danger" aria-hidden style={{ borderRadius: 2 }} />
      )}
      {exploring && <span className="sr-only"> (exploring {exploring})</span>}
    </Link>
  )
}

/** Top bar: logo, Pokédollars, leaderboard, help and settings. The menus live in the side / bottom bar; sound is in Settings. */
export function Header() {
  const save = useGame((s) => s.save)
  const runArea = useGame((s) => s.run.areaId)
  const inFight = useInFight()
  const { pathname } = useLocation()
  if (!save) return null
  const onSettings = pathname === '/settings'
  const onBoard = pathname === '/leaderboard'
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-panel shadow-[0_3px_0_#6b6480]">
      <div className="flex h-14 items-center gap-2 px-3">
        <Link
          to={runArea ? '/area' : '/map'}
          className="mr-auto flex min-h-[44px] items-center text-2xl leading-none tracking-wider"
          aria-label="Pokédice — back to the game"
        >
          POKÉ<span className="text-danger">DICE</span>
        </Link>
        <GoldPill amount={save.gold} />
        <Link
          to={inFight ? '#' : '/leaderboard'}
          aria-label="Leaderboard"
          aria-current={onBoard ? 'page' : undefined}
          aria-disabled={inFight || undefined}
          onClick={(e) => inFight && e.preventDefault()}
          title={inFight ? 'Finish the fight first' : 'Leaderboard'}
          className={cx(
            'pixel-btn flex h-11 w-11 items-center justify-center md:h-9 md:w-9',
            onBoard ? 'bg-gold' : 'bg-panel',
            inFight && 'hatched pointer-events-none',
          )}
        >
          <PixelIcon name="trophy" size={20} />
        </Link>
        <HelpButton />
        <Link
          to={inFight ? '#' : '/settings'}
          aria-label="Settings"
          aria-current={onSettings ? 'page' : undefined}
          aria-disabled={inFight || undefined}
          onClick={(e) => inFight && e.preventDefault()}
          title={inFight ? 'Finish the fight first' : 'Settings'}
          className={cx(
            'pixel-btn flex h-11 w-11 items-center justify-center md:h-9 md:w-9',
            onSettings ? 'bg-gold' : 'bg-panel',
            inFight && 'hatched pointer-events-none',
          )}
        >
          <PixelIcon name="gear" size={18} />
        </Link>
      </div>
    </header>
  )
}

/** Google sign-in for the cloud backup, at the foot of the side bar. */
function AccountBox() {
  const auth = useGame((s) => s.auth)
  if (!isSupabaseConfigured || auth.status === 'unavailable') {
    return (
      <p className="copy text-sm text-muted">
        Your save lives in this browser.{' '}
        <Link to="/setup" className="underline">
          Cloud backup
        </Link>
      </p>
    )
  }
  if (auth.status === 'unknown') return null
  return (
    <div className="flex flex-col gap-1.5">
      {auth.status === 'signed_out' && <p className="copy text-sm text-muted">Back up your save and play on any device.</p>}
      <GoogleAccountButton size="sm" className="w-full" />
    </div>
  )
}

/** Desktop: the menus down the left, with the Google account at the bottom. */
export function SideNav() {
  const isAdmin = useIsAdmin()
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r-[3px] border-ink bg-parchment p-3 md:flex lg:w-56">
      <nav aria-label="Menus" className="flex flex-col gap-2.5">
        {SIDE_NAV.map((n) => (
          <NavEntry key={n.to} n={n} variant="side" />
        ))}
        {isAdmin && (
          <NavLink to="/admin" className="pixel-btn flex items-center bg-ink px-3 py-2 text-2xl leading-none text-panel">
            Admin
          </NavLink>
        )}
      </nav>
      <div className="mt-auto">
        <AccountBox />
      </div>
    </aside>
  )
}

/** Phones: a bottom tab bar (height: --bottom-nav). Hidden mid-fight — the battle controls take the bottom. */
export function BottomNav() {
  const inFight = useInFight()
  if (inFight) return null
  return (
    <nav
      aria-label="Menus"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t-[3px] border-ink bg-panel shadow-[0_-3px_0_#6b6480] md:hidden"
      style={{ height: 'var(--bottom-nav)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_NAV.map((n) => (
        <NavEntry key={n.to} n={n} variant="bottom" />
      ))}
    </nav>
  )
}
