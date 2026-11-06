// Each page names itself (docs/15 §7): the tab's title says where the player is ("Team · Pokédice", in their
// language), and after a move inside the game the focus lands on the new page's <h1>, so a screen reader reads where it
// arrived instead of starting again from the top of an unchanged <body>. Mounted once, inside the router (App.tsx).
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { hasKey } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useInFight } from '@/store/hooks'
import { dialogsOpen } from './useDialog'

/** The game's name: the title page's whole title, and every other page's ending. */
export const BRAND = 'Pokédice'

/**
 * What names a page: a sheet key, the area being explored (`area`), or nothing but the game's name (the title page,
 * the developers' pages). Pure, so the routes are tested without a browser.
 */
export function pageTitleKey(path: string): string | 'area' | null {
  const p = path.replace(/\/+$/, '') || '/'
  const exact: Record<string, string> = {
    '/new': 'ui.newGame.heading',
    '/help': 'ui.help.title',
    '/home': 'ui.nav.home',
    '/daycare': 'ui.home.dayCare',
    '/team': 'ui.team.title',
    '/shop': 'ui.shop.title',
    '/upgrades': 'ui.upgrades.title',
    '/pokedex': 'ui.dex.title',
    '/leaderboard': 'ui.nav.leaderboard',
    '/friends': 'ui.friends.title',
    '/market': 'ui.market.title',
    '/versus': 'ui.versus.title',
    '/trades': 'ui.trades.title',
    '/settings': 'ui.settings.title',
    '/social': 'ui.nav.social',
  }
  if (exact[p]) return exact[p]
  if (p === '/area') return 'area'
  const [, first, second] = p.split('/')
  if (first === 'f') return 'ui.friends.title'
  if (first === 't') return 'ui.trades.title'
  if (first === 'admin') return 'ui.nav.admin'
  if (first === 'underground') return 'ui.live.underground.name'
  if (first === 'calendar') return 'ui.live.calendar.name'
  if (first === 'raid') return 'ui.raid.progress.kicker'
  if (first === 'events' && second) return `ui.events.${second}.name`
  return null
}

/** "Team · Pokédice"; the game's name alone where the page has none. */
export const pageTitle = (
  page: string | null,
  t: (key: string, vars?: Record<string, string>) => string,
): string => (page ? t('ui.page.title', { page }) : BRAND)

/**
 * Tries for the new page's <h1> while it renders (a lazy page on a slow phone, a screen waiting for its data) for 3 s,
 * then gives up. Late is harmless: a field or a dialog the player went to meanwhile keeps the focus.
 */
const H1_TRIES = 60
const H1_GAP_MS = 50

/** Puts the tab's title on the page and, after each move inside the game, the focus on its <h1>. */
export function usePageMeta() {
  const { t } = useT()
  const { pathname } = useLocation()
  const fight = useInFight()
  const areaName = useGame(
    (s) => s.data.areas.find((a) => a.id === (s.run.areaId ?? s.save?.currentAreaId))?.name,
  )

  const key = pageTitleKey(pathname)
  const page = fight
    ? t('ui.page.battle')
    : key === 'area'
      ? (areaName ?? null)
      : key && hasKey(key)
        ? t(key)
        : null
  const title = pageTitle(page, t)
  useEffect(() => {
    document.title = title
  }, [title])

  // The first load keeps the browser's own start (the page from its top); only a move inside the game moves the focus.
  // The last page seen, rather than a "first run" flag: React's strict mode runs the effect twice on the first load.
  const last = useRef(pathname)
  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    let tries = 0
    let timer = 0
    const from = document.activeElement
    const land = () => {
      const h1 = document.querySelector<HTMLElement>('#root h1')
      if (!h1) {
        if (++tries < H1_TRIES) timer = window.setTimeout(land, H1_GAP_MS)
        return
      }
      // A dialog still open over the new page keeps the focus it has, and so does a field the player went to meanwhile.
      if (dialogsOpen() > 0) return
      const at = document.activeElement
      if (at && at !== from && at !== document.body && at.isConnected) return
      // Focusable from a script only (not in the Tab order); the ring shows for a keyboard, not for a tap or a click.
      if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1
      h1.focus({ preventScroll: true })
    }
    // After the page has rendered and a closing dialog has handed the focus back where it came from.
    timer = window.setTimeout(land, 0)
    return () => window.clearTimeout(timer)
  }, [pathname])
}

/** `usePageMeta` as a component, for a one-line mount inside the router. */
export function PageMeta() {
  usePageMeta()
  return null
}
