import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { getLang } from '@/i18n'
import { progressOf, tracksModeOf, undergroundLive } from '@/engine'
import { useDexNew } from '@/lib/dexSeen'
import { affordableUpgrades } from '@/lib/upgrades'
import { pushToast, useGame } from '@/store/game'
import { useInFight, useLockReason, useNavLock } from '@/store/hooks'
import { CloudSyncButton } from './CloudSyncButton'
import { ExtremeBand } from './Extreme'
import { PlayerMenu } from './PlayerMenu'
import { cx } from '@/theme/util'
import { useCountUp, useGoldBump } from './GoldPill'
import { DayNightButton } from './DayNight'
import { PixelIcon, type IconName } from './icons'
import { CashChip } from '@/screens/events/live'
import { useSocial } from '@/lib/social'
import { SOCIAL_PATHS } from './SocialTabs'
import { useLive } from '@/store/live'
import { serverNow } from '@/store/serverTime'

interface NavItem {
  to: string
  /** A sheet key — the label is looked up at render, so it follows the language. */
  label: string
  icon: IconName
}

const HOME: NavItem = { to: '/home', label: 'ui.nav.home', icon: 'ball' }
const TEAM: NavItem = { to: '/team', label: 'ui.nav.team', icon: 'navTeam' }
// The Poké Mart and Upgrades are one place to spend gold (docs/43 §3): Buy, Upgrades, Bag.
const MART: NavItem = { to: '/shop', label: 'ui.nav.shop', icon: 'navShop' }
const DEX: NavItem = { to: '/pokedex', label: 'ui.nav.pokedex', icon: 'navDex' }
// The other trainers in one tab (docs/43 §3): the leaderboard, Versus, Friends, Trades.
const SOCIAL: NavItem = { to: '/social', label: 'ui.nav.social', icon: 'navFriends' }

/** Side rail (desktop): Home first, then the bar's order. */
const SIDE_NAV = [HOME, MART, TEAM, DEX, SOCIAL]
/** Bottom bar (phones): Home in the middle, under the thumb, a tab like the others; the Mart first (the user, 2026-10-27). */
const BOTTOM_NAV = [MART, TEAM, HOME, DEX, SOCIAL]

/** Home stays lit while an encounter plays on /area: it is where you are. A tab stays lit on each of its views. */
const isActive = (n: NavItem, pathname: string) =>
  n === HOME
    ? pathname === '/home' || pathname === '/area'
    : n === MART
      ? pathname === '/shop' || pathname === '/upgrades'
      : n === SOCIAL
        ? SOCIAL_PATHS.includes(pathname)
        : pathname === n.to

/**
 * Dots only for what you can act on: a sale or the Underground's kits, else the upgrades you can afford (9+ at most), on
 * the Mart; a gold NEW for new Pokédex entries; what's new with friends and trades on Social.
 */
function useNavDot(n: NavItem): { text: string; label: string; gold?: boolean; to?: string } | null {
  const { t } = useT()
  const upgrades = useGame((s) => (n === MART && s.save ? affordableUpgrades(s.save, s.data) : 0))
  const dexNew = useDexNew()
  const social = useSocial()
  const { lives } = useLive(15_000)
  // The Underground's kits are sold while it runs for this player (its own switch on too).
  const ugOn = useGame((s) => !!s.save && !!undergroundLive(s.save, s.data, serverNow()))
  if (n === MART && lives.some((e) => e.type === 'shop')) return { text: t('ui.live.sale'), label: t('ui.live.shopDot'), gold: true }
  if (n === MART && ugOn) return { text: t('ui.ug.kitsTag'), label: t('ui.ug.kitsDot'), gold: true }
  // The dot is where the tab leads: upgrades to afford open the Mart on Upgrades, so an upgrade stays 2 taps from Home.
  if (n === MART && upgrades > 0)
    return { text: upgrades > 9 ? '9+' : String(upgrades), label: t('ui.nav.upgradesDot', { n: upgrades }), to: '/shop?tab=upgrades' }
  if (n === DEX && dexNew > 0) return { text: t('ui.common.new'), label: t('ui.nav.dexDot', { n: dexNew }), gold: true }
  if (n === SOCIAL && social.news > 0) return { text: social.news > 9 ? '9+' : String(social.news), label: t('ui.nav.socialDot', { n: social.news }), gold: true }
  return null
}

function Dot({ dot, className }: { dot: { text: string; gold?: boolean }; className?: string }) {
  return (
    <i
      aria-hidden
      className={cx(
        'grid h-[20px] min-w-[20px] place-items-center px-1 font-pixel-sm text-tag not-italic leading-none shadow-ring',
        // White under 24 px needs the deeper red (docs/15 §2): the bright one failed axe's contrast.
        dot.gold ? 'bg-gold text-ink' : 'light-scope bg-crimson text-white',
        className,
      )}
    >
      {dot.text}
    </i>
  )
}

function NavEntry({ n, variant }: { n: NavItem; variant: 'side' | 'bottom' }) {
  const { t } = useT()
  const lock = useNavLock()
  const lockWhy = useLockReason()
  const inFight = !!lock
  const { pathname } = useLocation()
  const active = isActive(n, pathname)
  const dot = useNavDot(n)
  const label = t(n.label)
  const common = {
    to: inFight ? '#' : (dot?.to ?? n.to),
    'aria-current': active ? ('page' as const) : undefined,
    'aria-disabled': inFight || undefined,
    'aria-label': dot ? `${label} · ${dot.label}` : label,
    onClick: (e: React.MouseEvent) => inFight && e.preventDefault(),
    title: lockWhy ?? undefined,
    // What the dice tutorial points at (docs/46 §5): nav-home, nav-shop…
    'data-guide': `nav-${n.to.slice(1)}`,
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
  return (
    <Link
      {...common}
      className={cx(
        'relative flex min-h-[60px] flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-1.5 font-pixel-sm text-[16px] leading-none',
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
  const why = useLockReason()
  const shown = useCountUp(gold)
  const bump = useGoldBump()
  const text = shown.toLocaleString(getLang())
  const label = t('ui.nav.goldShop', { amount: gold.toLocaleString(getLang()) })
  return (
    <Link
      key={bump}
      to={why ? '#' : '/shop'}
      onClick={(e) => {
        if (!why) return
        e.preventDefault()
        pushToast(why, 'info')
      }}
      aria-disabled={why ? true : undefined}
      aria-label={why ? `${label}. ${why}` : label}
      title={why ?? undefined}
      // Where a reward's coins land (CoinFlight, docs/38 F5f).
      data-hud-gold=""
      className={cx(
        'pixel-corners inline-flex min-h-[44px] light-scope shrink-0 items-center gap-1.5 bg-night px-2.5 text-[19px] leading-none text-gold-light md:min-h-[40px]',
        why && 'opacity-60',
        bump > 0 && 'gold-bump',
      )}
    >
      <PixelIcon name="coin" size={16} />
      <span className="tabular-nums">₽ {text}</span>
    </Link>
  )
}

/**
 * Inside an area, the top bar's empty side says where you are (the user's call, 2026-10-27): the area's name and its
 * round, "2/3", or a check once it's cleared. Elsewhere it is the bar's room.
 */
function AreaTitle() {
  const { t } = useT()
  const inArea = useLocation().pathname === '/area'
  const area = useGame((s) => (s.run.rebattle ? undefined : s.data.areas.find((a) => a.id === s.run.areaId)))
  // The save itself, not progressOf's result: that is a fresh object for an area not played yet, and a selector
  // returning a new object every time re-renders forever (React #185).
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!inArea || !area || !save) return <span className="flex-1" />
  const progress = progressOf(save, area.id)
  // Tracks in the Snow's glade (docs/64 §4.1) counts its own rounds, not its deck's.
  const glade = tracksModeOf(area, data)
  const need = glade ? glade.rounds.length : area.roundsToClear || 0
  const doneRounds = glade ? (progress.tracks?.round ?? 0) : (progress.roundsDone ?? 0)
  const done = glade ? !!progress.tracks?.won : progress.cleared || (need > 0 && doneRounds >= need)
  const round = Math.min(doneRounds + 1, need)
  return (
    <p className="m-0 flex min-w-0 flex-1 items-center gap-2 leading-none" data-area-title>
      <span className="min-w-0 truncate text-[20px]">{area.name}</span>
      {done ? (
        <span className="flex shrink-0 items-center" title={t('ui.home.stTitle.cleared')}>
          <PixelIcon name="check" size={16} />
          <span className="sr-only">{t('ui.home.stTitle.cleared')}</span>
        </span>
      ) : need > 0 ? (
        <span className="shrink-0 font-pixel-sm text-[16px] tabular-nums text-muted">
          <span aria-hidden>
            {round}/{need}
          </span>
          <span className="sr-only">{t('ui.home.roundOf', { n: round, total: need })}</span>
        </span>
      ) : null}
    </p>
  )
}

/**
 * Top bar: in an area, its name on the left; on the right your gold (→ the Mart) and, last, you (your look, name and
 * badges: the trainer menu). The leaderboard's cup went to the Social tab (docs/43 §3): one way to each place. It stays
 * up in battle: mid-fight the way out (the Mart) is shut and says why, the rest (the sun or moon, the trainer menu)
 * works.
 */
export function Header() {
  const save = useGame((s) => s.save)
  if (!save) return null
  return (
    <header className="sticky top-0 z-40 bg-panel shadow-[0_2px_0_rgb(var(--c-edge)),0_4px_0_rgb(var(--c-edge)/0.13)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2.5 md:max-w-none">
        {/* Day and night (docs/32): the sun or the moon, far left, while in Johto. */}
        <DayNightButton />
        <AreaTitle />
        <CashChip />
        <GoldButton />
        <PlayerMenu />
      </div>
      <ExtremeBand />
    </header>
  )
}

/**
 * Desktop: the five places down the left, SYNC ONLINE at the foot. SUPPORT ME is the trainer menu's (docs/43 §3: a rare
 * action, out of the way).
 */
export function SideNav() {
  const { t } = useT()
  // Extreme mode's band (22 px) sits under the top bar.
  const extreme = useGame((s) => s.save?.mode === 'extreme')
  return (
    <aside
      className={cx(
        extreme ? 'top-[78px] h-[calc(100vh-78px)]' : 'top-14 h-[calc(100vh-3.5rem)]',
        'sticky hidden w-52 shrink-0 flex-col gap-3 overflow-y-auto bg-panel p-3 shadow-[2px_0_0_rgb(var(--c-edge))] md:flex lg:w-56',
      )}
    >
      <nav aria-label={t('ui.nav.menus')} className="flex flex-col gap-2.5">
        {SIDE_NAV.map((n) => (
          <NavEntry key={n.to} n={n} variant="side" />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2.5">
        <CloudSyncButton />
      </div>
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
