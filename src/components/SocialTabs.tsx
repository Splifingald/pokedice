import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { leaderboardUnlocked, versusUnlocked } from '@/engine'
import { useT } from '@/i18n/react'
import { useSocial } from '@/lib/social'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'

export type SocialView = 'board' | 'versus' | 'friends' | 'trades'

const VIEWS: { id: SocialView; to: string; label: string; icon: IconName }[] = [
  { id: 'board', to: '/leaderboard', label: 'ui.board.title', icon: 'navRanks' },
  { id: 'versus', to: '/versus', label: 'ui.versus.title', icon: 'vs' },
  { id: 'friends', to: '/friends', label: 'ui.friends.title', icon: 'navFriends' },
  { id: 'trades', to: '/trades', label: 'ui.trades.title', icon: 'trade' },
]

/** The routes the Social tab lights up for. */
export const SOCIAL_PATHS = ['/social', '/market', ...VIEWS.map((v) => v.to)]

/**
 * The Social tab's views (docs/43 §3, §5.8): the leaderboard, Versus, Friends and Trades, one place for the other
 * trainers. Each view keeps its own route (deep links and Back work), so the strip is a `nav` of links with
 * `aria-current`, not a `Seg` tablist: a tab panel would claim the views share one page. It names where you are: the
 * view's own `<h1>` is the strip's current tab, read by screen readers, so the title isn't written twice.
 *
 * Phones: one row that never scrolls sideways, each view its icon over its name, as wide as its name needs. A view
 * that isn't open yet shrinks to its icon with a lock (its page says what opens it): the open ones get the room. From
 * 1024 px the same views sit in a row of their own size at the top of the view's two columns.
 */
export function SocialTabs({
  current,
  title,
  aside,
}: {
  current: SocialView
  title: string
  aside?: ReactNode
}) {
  const { t } = useT()
  const social = useSocial()
  const boardOpen = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  const versusOpen = useGame((s) => !!s.save && versusUnlocked(s.save, s.data))
  // Extreme mode is a race (docs/48): no Versus there.
  const extreme = useGame((s) => s.save?.mode === 'extreme')
  const shown = VIEWS.filter((v) =>
    v.id === 'friends' ? social.friends : v.id === 'trades' ? social.trades : v.id === 'versus' ? !extreme : true,
  )
  const locked = (v: SocialView) => (v === 'board' && !boardOpen) || (v === 'versus' && !versusOpen)
  const dot = (v: SocialView) => (v === 'friends' ? social.friendsNew : v === 'trades' ? social.tradesNew : 0)
  return (
    <div className="flex flex-col gap-2">
      <h1 className="sr-only">{title}</h1>
      <nav aria-label={t('ui.nav.social')}>
        <ul className="m-0 flex list-none gap-1.5 p-0">
          {shown.map((v) => {
            const on = v.id === current
            const n = dot(v.id)
            const label = t(v.label)
            // The current view stays full size even when locked: it is where you are.
            const small = locked(v.id) && !on
            const name = small ? `${label} · ${t('ui.card.locked')}` : n ? `${label} (${n})` : label
            return (
              <li key={v.id} className={small ? 'flex-none' : 'min-w-0 flex-auto lg:flex-none'}>
                <Link
                  to={v.to}
                  aria-current={on ? 'page' : undefined}
                  aria-label={name}
                  title={small ? name : undefined}
                  className={cx(
                    'relative flex h-full min-h-[56px] items-center justify-center leading-none',
                    small
                      ? 'w-12 lg:w-14'
                      : 'flex-col gap-1 px-1.5 pb-1.5 pt-2 text-[16px] lg:min-h-[48px] lg:flex-row lg:gap-2 lg:px-4 lg:py-0 lg:text-[20px]',
                    on ? 'bg-ink text-panel' : 'bg-paper text-ink shadow-ring-line hover:shadow-ring',
                    small && 'bg-well text-muted',
                  )}
                >
                  {small ? (
                    // What it is, and that it's locked: its icon, a lock on its corner.
                    <span className="relative" aria-hidden>
                      <PixelIcon name={v.icon} size={22} className="opacity-50" />
                      <PixelIcon name="lock" size={14} className="absolute -bottom-1 -right-2" />
                    </span>
                  ) : (
                    <>
                      <PixelIcon name={locked(v.id) ? 'lock' : v.icon} size={22} className="shrink-0" />
                      <span className="whitespace-nowrap">{label}</span>
                    </>
                  )}
                  {n > 0 && (
                    <i
                      aria-hidden
                      className="absolute right-1 top-1 grid h-[20px] min-w-[20px] place-items-center bg-gold px-1 font-pixel-sm text-tag not-italic text-ink shadow-ring-thin lg:static"
                    >
                      {n > 9 ? '9+' : n}
                    </i>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {aside && <div className="flex flex-wrap items-center justify-end gap-2">{aside}</div>}
    </div>
  )
}

/**
 * A Social view's two columns (docs/43 §5.8): from 1024 px the view's list on the left and, beside it, what goes with
 * it (your place and the Hall of Fame, your Versus team and its board, a friend's card, your listings), sticky and
 * scrolling inside itself. On a phone the side comes first or last (`sideFirst`) in one column.
 */
export function SocialColumns({
  main,
  side,
  sideFirst,
  className,
}: {
  main: ReactNode
  side?: ReactNode
  sideFirst?: boolean
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start lg:gap-5',
        className,
      )}
    >
      <div className={cx('flex min-w-0 flex-col gap-2.5', sideFirst && 'order-2 lg:order-none')}>{main}</div>
      {side && (
        <aside className="flex min-w-0 flex-col gap-2.5 lg:sticky lg:top-[calc(var(--top-bar,56px)+1rem)] lg:max-h-[calc(100dvh-var(--top-bar,56px)-2rem)] lg:overflow-y-auto lg:p-1 pixel-scroll">
          {side}
        </aside>
      )}
    </div>
  )
}

/**
 * A Social view's actions at the foot (docs/43 §2): on a phone pinned over the tab bar, the page scrolling behind it
 * (the room under the page's last row is index.css's); from 768 px it sticks to the bottom of the content; `wideHidden` leaves
 * it to the PC layout's side column from 1024 px, where the same actions sit in the flow.
 */
export function SocialDock({ children, wideHidden }: { children: ReactNode; wideHidden?: boolean }) {
  return (
    <div
      // Its room at the page's foot is index.css's (`main:has([data-social-dock])`), after everything on the page.
      data-social-dock=""
      className={cx(
        'fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3',
        wideHidden && 'lg:hidden',
      )}
      style={{ bottom: 'var(--bottom-nav)', paddingBottom: 'calc(0.5rem + var(--bottom-safe))' }}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-1.5">{children}</div>
    </div>
  )
}

/** `/social`: the view with something new first, else the leaderboard once it's open, else Friends. */
export function SocialScreen() {
  const social = useSocial()
  const boardOpen = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  const to =
    social.friendsNew > 0
      ? '/friends'
      : social.tradesNew > 0
        ? '/trades'
        : boardOpen || !social.friends
          ? '/leaderboard'
          : '/friends'
  return <Navigate to={to} replace />
}
