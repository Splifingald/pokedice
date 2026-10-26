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
export const SOCIAL_PATHS = ['/social', ...VIEWS.map((v) => v.to)]

/**
 * The Social tab's views (docs/43 §3): the leaderboard, Versus, Friends and Trades, one place for the other trainers.
 * Each view keeps its own route (deep links work); this strip is how you move between them, and names where you are:
 * the view's own `<h1>` is the strip's current tab, read by screen readers, so the title isn't written twice. A view
 * that isn't open yet stays listed with a lock (its page says what opens it).
 */
export function SocialTabs({ current, title, aside }: { current: SocialView; title: string; aside?: ReactNode }) {
  const { t } = useT()
  const social = useSocial()
  const boardOpen = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  const versusOpen = useGame((s) => !!s.save && versusUnlocked(s.save, s.data))
  const shown = VIEWS.filter((v) => (v.id === 'friends' ? social.friends : v.id === 'trades' ? social.trades : true))
  const locked = (v: SocialView) => (v === 'board' && !boardOpen) || (v === 'versus' && !versusOpen)
  const dot = (v: SocialView) => (v === 'friends' ? social.friendsNew : v === 'trades' ? social.tradesNew : 0)
  return (
    <div className="flex flex-col gap-2">
      <h1 className="sr-only">{title}</h1>
      <nav aria-label={t('ui.nav.social')} className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-1.5 md:min-w-0">
          {shown.map((v) => {
            const on = v.id === current
            const n = dot(v.id)
            const label = t(v.label)
            return (
              <li key={v.id} className="flex-1">
                <Link
                  to={v.to}
                  aria-current={on ? 'page' : undefined}
                  aria-label={n ? `${label} (${n})` : label}
                  className={cx(
                    'relative flex min-h-[52px] items-center justify-center gap-2 px-3 text-[20px] leading-none',
                    on ? 'bg-ink text-panel' : 'bg-paper text-ink shadow-ring-line hover:shadow-ring',
                  )}
                >
                  <PixelIcon name={locked(v.id) ? 'lock' : v.icon} size={22} className="shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                  {n > 0 && (
                    <i
                      aria-hidden
                      className="grid h-[20px] min-w-[20px] place-items-center bg-gold px-1 font-pixel-sm text-tag not-italic text-ink shadow-ring-thin"
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
