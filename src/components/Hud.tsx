import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useInFight } from '@/store/hooks'
import { PlayerMenu } from './PlayerMenu'
import { cx } from '@/theme/util'
import { GoldPill } from './GoldPill'
import { EnergyPill } from './EnergyPill'
import { PixelIcon, type IconName } from './icons'

interface NavItem {
  to: string
  /** A sheet key — the label is looked up at render, so it follows the language. */
  label: string
  icon: IconName
}

const MAP: NavItem = { to: '/map', label: 'ui.nav.map', icon: 'map' }
const TEAM: NavItem = { to: '/team', label: 'ui.nav.team', icon: 'ball' }
const SHOP: NavItem = { to: '/shop', label: 'ui.nav.shop', icon: 'potion' }
const UPGRADES: NavItem = { to: '/upgrades', label: 'ui.nav.upgrades', icon: 'up' }
const DEX: NavItem = { to: '/pokedex', label: 'ui.nav.pokedex', icon: 'dex' }

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
  const { t } = useT()
  const inFight = useInFight()
  const { to, active, exploring } = useNavEntry(n)
  return (
    <Link
      to={inFight ? '#' : to}
      aria-current={active ? 'page' : undefined}
      aria-disabled={inFight || undefined}
      onClick={(e) => inFight && e.preventDefault()}
      title={inFight ? t('ui.nav.finishFight') : undefined}
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
          <span>{t(n.label)}</span>
          {exploring && (
            // Ink on the gold highlight: the muted grey fails contrast there.
            <span className={cx('truncate font-pixel-sm text-sm leading-none', active && !inFight ? 'text-ink' : 'text-muted')}>{exploring}</span>
          )}
        </span>
      ) : (
        <span className="font-pixel-sm text-base leading-none">{t(n.label)}</span>
      )}
      {variant === 'bottom' && exploring && (
        <span className="absolute right-[26%] top-1.5 h-2.5 w-2.5 border-2 border-ink bg-danger" aria-hidden style={{ borderRadius: 2 }} />
      )}
      {exploring && <span className="sr-only">{t('ui.nav.exploring', { area: exploring })}</span>}
    </Link>
  )
}

/** Top bar: logo, energy, Pokédollars, the leaderboard and the player's avatar (profile, settings, rules, admin, connect). The game menus live in the side / bottom bar. */
export function Header() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const runArea = useGame((s) => s.run.areaId)
  const inFight = useInFight()
  const { pathname } = useLocation()
  if (!save) return null
  const onBoard = pathname === '/leaderboard'
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-panel shadow-[0_3px_0_#6b6480]">
      <div className="flex h-14 items-center gap-1.5 px-3 sm:gap-2">
        <Link
          to={runArea ? '/area' : '/map'}
          className="mr-auto flex min-h-[44px] min-w-0 items-center text-xl leading-none tracking-wider sm:text-2xl"
          aria-label={t('ui.nav.backToGame')}
        >
          POKÉ<span className="text-danger">DICE</span>
        </Link>
        <EnergyPill />
        <GoldPill amount={save.gold} className="shrink-0" />
        <Link
          to={inFight ? '#' : '/leaderboard'}
          aria-label={t('ui.nav.leaderboard')}
          aria-current={onBoard ? 'page' : undefined}
          aria-disabled={inFight || undefined}
          onClick={(e) => inFight && e.preventDefault()}
          title={t(inFight ? 'ui.nav.finishFight' : 'ui.nav.leaderboard')}
          className={cx(
            'pixel-btn flex h-11 w-11 shrink-0 items-center justify-center md:h-9 md:w-9',
            onBoard ? 'bg-gold' : 'bg-panel',
            inFight && 'hatched pointer-events-none',
          )}
        >
          <PixelIcon name="trophy" size={20} />
        </Link>
        <PlayerMenu />
      </div>
    </header>
  )
}

/** Desktop: the game menus down the left. The account, the admin and the rules live in the avatar's drawer. */
export function SideNav() {
  const { t } = useT()
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r-[3px] border-ink bg-parchment p-3 md:flex lg:w-56">
      <nav aria-label={t('ui.nav.menus')} className="flex flex-col gap-2.5">
        {SIDE_NAV.map((n) => (
          <NavEntry key={n.to} n={n} variant="side" />
        ))}
      </nav>
    </aside>
  )
}

/** Phones: a bottom tab bar (height: --bottom-nav). Hidden mid-fight — the battle controls take the bottom. */
export function BottomNav() {
  const { t } = useT()
  const inFight = useInFight()
  if (inFight) return null
  return (
    <nav
      aria-label={t('ui.nav.menus')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t-[3px] border-ink bg-panel shadow-[0_-3px_0_#6b6480] md:hidden"
      style={{ height: 'var(--bottom-nav)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_NAV.map((n) => (
        <NavEntry key={n.to} n={n} variant="bottom" />
      ))}
    </nav>
  )
}
