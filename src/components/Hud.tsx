import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { getLang } from '@/i18n'
import { donationEnabled, leaderboardUnlocked } from '@/engine'
import { useDexNew } from '@/lib/dexSeen'
import { affordableUpgrades } from '@/lib/upgrades'
import { pushToast, useGame } from '@/store/game'
import { useInFight } from '@/store/hooks'
import { CloudSyncButton } from './CloudSyncButton'
import { DonationModal } from './DonationPopup'
import { PlayerMenu } from './PlayerMenu'
import { cx } from '@/theme/util'
import { useCountUp } from './GoldPill'
import { EnergyPill } from './EnergyPill'
import { PixelIcon, type IconName } from './icons'

interface NavItem {
  to: string
  /** A sheet key — the label is looked up at render, so it follows the language. */
  label: string
  icon: IconName
}

const HOME: NavItem = { to: '/home', label: 'ui.nav.home', icon: 'ball' }
const TEAM: NavItem = { to: '/team', label: 'ui.nav.team', icon: 'navTeam' }
const SHOP: NavItem = { to: '/shop', label: 'ui.nav.shop', icon: 'navShop' }
const UPGRADES: NavItem = { to: '/upgrades', label: 'ui.nav.upgrades', icon: 'navUpgrades' }
const DEX: NavItem = { to: '/pokedex', label: 'ui.nav.pokedex', icon: 'navDex' }

/** Side bar (desktop): Home first. */
const SIDE_NAV = [HOME, TEAM, SHOP, UPGRADES, DEX]
/** Bottom bar (phones): Home in the middle, under the thumb. */
const BOTTOM_NAV = [SHOP, UPGRADES, HOME, TEAM, DEX]

/** Home stays lit while an encounter plays on /area: it is where you are. */
const isActive = (n: NavItem, pathname: string) => (n === HOME ? pathname === '/home' || pathname === '/area' : pathname === n.to)

/** Dots only for what you can act on: affordable upgrades (9+ at most), a gold NEW for new Pokédex entries. */
function useNavDot(n: NavItem): { text: string; label: string; gold?: boolean } | null {
  const { t } = useT()
  const upgrades = useGame((s) => (n === UPGRADES && s.save ? affordableUpgrades(s.save, s.data) : 0))
  const dexNew = useDexNew()
  if (n === UPGRADES && upgrades > 0) return { text: upgrades > 9 ? '9+' : String(upgrades), label: t('ui.nav.upgradesDot', { n: upgrades }) }
  if (n === DEX && dexNew > 0) return { text: t('ui.common.new'), label: t('ui.nav.dexDot', { n: dexNew }), gold: true }
  return null
}

function Dot({ dot, className }: { dot: { text: string; gold?: boolean }; className?: string }) {
  return (
    <i
      aria-hidden
      className={cx(
        'grid h-[18px] min-w-[18px] place-items-center px-1 font-pixel-sm text-[13px] not-italic leading-none shadow-ring',
        dot.gold ? 'bg-gold text-ink' : 'bg-accent text-white',
        className,
      )}
    >
      {dot.text}
    </i>
  )
}

function NavEntry({ n, variant }: { n: NavItem; variant: 'side' | 'bottom' }) {
  const { t } = useT()
  const inFight = useInFight()
  const { pathname } = useLocation()
  const active = isActive(n, pathname)
  const dot = useNavDot(n)
  const label = t(n.label)
  const common = {
    to: inFight ? '#' : n.to,
    'aria-current': active ? ('page' as const) : undefined,
    'aria-disabled': inFight || undefined,
    'aria-label': dot ? `${label} · ${dot.label}` : label,
    onClick: (e: React.MouseEvent) => inFight && e.preventDefault(),
    title: inFight ? t('ui.nav.finishFight') : undefined,
  }
  if (variant === 'side')
    return (
      <Link
        {...common}
        className={cx(
          'pixel-btn relative flex min-h-[48px] items-center gap-3 px-3 py-2 text-[22px] leading-none',
          active && !inFight && 'bg-rose text-danger',
          inFight && 'hatched pointer-events-none',
        )}
      >
        <PixelIcon name={n.icon} size={n === HOME ? 22 : 28} />
        <span>{label}</span>
        {dot && <Dot dot={dot} className="ml-auto" />}
      </Link>
    )
  if (n === HOME)
    return (
      <Link {...common} className={cx('relative flex min-h-[60px] flex-1 flex-col items-center justify-start', inFight && 'pointer-events-none opacity-60')}>
        {/* Home: a raised Poké Ball in the middle of the bar. */}
        <span
          className={cx(
            '-mt-[26px] grid h-[62px] w-[62px] place-items-center rounded-full shadow-[inset_0_0_0_3px_rgb(var(--c-edge)),inset_0_-6px_0_#c4382a,0_0_0_4px_rgb(var(--c-panel))]',
            active ? 'bg-accent' : 'bg-crimson',
          )}
        >
          <PixelIcon name="ball" size={36} />
        </span>
      </Link>
    )
  return (
    <Link
      {...common}
      className={cx(
        'relative flex min-h-[60px] flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-1.5 font-pixel-sm text-[15px] leading-none',
        active && !inFight ? 'bg-rose text-danger shadow-[inset_0_3px_0_#f2553f]' : 'text-muted',
        inFight && 'pointer-events-none opacity-60',
      )}
    >
      <PixelIcon name={n.icon} size={32} />
      <span>{label}</span>
      {dot && <Dot dot={dot} className="absolute left-[calc(50%+6px)] top-1" />}
    </Link>
  )
}

/** The gold, as a navy pill; a tap opens the Poké Mart. */
function GoldButton() {
  const { t } = useT()
  const gold = useGame((s) => s.save?.gold ?? 0)
  const inFight = useInFight()
  const shown = useCountUp(gold)
  const text = shown.toLocaleString(getLang())
  return (
    <Link
      to={inFight ? '#' : '/shop'}
      onClick={(e) => inFight && e.preventDefault()}
      aria-disabled={inFight || undefined}
      aria-label={t('ui.nav.goldShop', { amount: gold.toLocaleString(getLang()) })}
      className={cx(
        'pixel-corners inline-flex min-h-[44px] light-scope shrink-0 items-center gap-1.5 bg-night px-2.5 text-[19px] leading-none text-gold-light md:min-h-[40px]',
        inFight && 'pointer-events-none opacity-60',
      )}
    >
      <PixelIcon name="coin" size={16} />
      <span className="tabular-nums">₽ {text}</span>
    </Link>
  )
}

function RoundLink({ to, label, children, blocked, current, onBlocked }: { to: string; label: string; children: ReactNode; blocked: boolean; current: boolean; onBlocked: () => void }) {
  return (
    <Link
      to={blocked ? '#' : to}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      aria-disabled={blocked || undefined}
      onClick={(e) => {
        if (!blocked) return
        e.preventDefault()
        onBlocked()
      }}
      title={label}
      className={cx(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel shadow-card',
        current && 'bg-gold-pale',
        blocked && 'opacity-60 grayscale',
      )}
    >
      {children}
    </Link>
  )
}

/**
 * Top bar: energy on the left; on the right your gold (→ Poké Mart), the cup (→ the leaderboard, locked until the
 * first badge) and, last, you (your look, name and badges: the trainer menu). Menus mid-fight are disabled.
 */
export function Header() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const inFight = useInFight()
  const { pathname } = useLocation()
  const boardOpen = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  if (!save) return null
  // Before the first badge the cup is greyed; a tap says what opens it.
  const blocked = inFight || !boardOpen
  return (
    <header className="sticky top-0 z-40 bg-panel shadow-[0_2px_0_rgb(var(--c-edge)),0_4px_0_rgb(var(--c-edge)/0.13)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2.5 md:max-w-none">
        <EnergyPill />
        <span className="flex-1" />
        <GoldButton />
        <RoundLink
          to="/leaderboard"
          label={t(inFight ? 'ui.nav.finishFight' : boardOpen ? 'ui.nav.leaderboard' : 'ui.nav.boardLocked')}
          blocked={blocked}
          current={pathname === '/leaderboard'}
          onBlocked={() => !inFight && pushToast(t('ui.nav.boardLocked'), 'info')}
        >
          <PixelIcon name="navRanks" size={30} />
        </RoundLink>
        <PlayerMenu />
      </div>
    </header>
  )
}

/** Desktop: the game menus down the left; at the bottom HELP POKÉDICE (when donations are on), then SYNC ONLINE. */
export function SideNav() {
  const { t } = useT()
  const canDonate = useGame((s) => donationEnabled(s.data))
  const [donating, setDonating] = useState(false)
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col gap-3 overflow-y-auto bg-panel p-3 shadow-[2px_0_0_rgb(var(--c-edge))] md:flex lg:w-56">
      <nav aria-label={t('ui.nav.menus')} className="flex flex-col gap-2.5">
        {SIDE_NAV.map((n) => (
          <NavEntry key={n.to} n={n} variant="side" />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2.5">
        {canDonate && (
          <button
            type="button"
            onClick={() => setDonating(true)}
            className="pixel-btn flex min-h-[48px] items-center justify-center gap-2 bg-rose px-3 py-2 text-[20px] leading-none text-danger"
          >
            <PixelIcon name="heart" size={22} />
            {t('ui.settings.helpPokedice')}
          </button>
        )}
        <CloudSyncButton />
      </div>
      <DonationModal open={donating} onClose={() => setDonating(false)} />
    </aside>
  )
}

/** Phones: the tab bar (height: --bottom-nav). Hidden mid-fight — the battle controls take the bottom. */
export function BottomNav() {
  const { t } = useT()
  const inFight = useInFight()
  if (inFight) return null
  return (
    <nav
      aria-label={t('ui.nav.menus')}
      className="fixed inset-x-0 bottom-0 z-40 flex items-end bg-panel shadow-[0_-2px_0_rgb(var(--c-edge)),0_-4px_0_rgb(var(--c-edge)/0.09)] md:hidden"
      style={{ height: 'var(--bottom-nav)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_NAV.map((n) => (
        <NavEntry key={n.to} n={n} variant="bottom" />
      ))}
    </nav>
  )
}
