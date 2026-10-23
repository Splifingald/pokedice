// The shell's rules (docs/38 §7): which devices the rotate cover holds, what a dialog puts to sleep behind it, and
// what each page is called in the tab's title.
import { describe, expect, it } from 'vitest'
import { hasKey } from '@/i18n'
import { inertTargets } from '@/lib/inert'
import { BRAND, pageTitle, pageTitleKey } from '@/lib/pageMeta'
import { coversSideways, isTabletScreen } from '@/lib/orientation'

describe('the rotate cover', () => {
  it('tells a tablet from a phone by the screen’s short side, either way up', () => {
    expect(isTabletScreen({ width: 390, height: 844 })).toBe(false) // an iPhone
    expect(isTabletScreen({ width: 932, height: 430 })).toBe(false) // a Pro Max, sideways
    expect(isTabletScreen({ width: 744, height: 1133 })).toBe(true) // an iPad mini
    expect(isTabletScreen({ width: 960, height: 600 })).toBe(true) // a 7" Android tablet, sideways
  })

  it('covers a phone held sideways, never a tablet or a computer', () => {
    expect(coversSideways({ landscape: true, mobile: true, tablet: false })).toBe(true)
    expect(coversSideways({ landscape: false, mobile: true, tablet: false })).toBe(false)
    expect(coversSideways({ landscape: true, mobile: true, tablet: true })).toBe(false)
    expect(coversSideways({ landscape: true, mobile: false, tablet: false })).toBe(false)
  })
})

describe('the page behind a dialog', () => {
  const live = (el: string) => el === 'toasts'

  it('goes inert before the dialog; the toasts and what opened after it stay live', () => {
    const body = ['root', 'toasts', 'sheet', 'gift-moment']
    expect(inertTargets(body, 'sheet', false, live)).toEqual(['root'])
  })

  it('puts the dialog under a new one to sleep too', () => {
    const body = ['root', 'toasts', 'menu', 'settings']
    expect(inertTargets(body, 'settings', false, live)).toEqual(['root', 'menu'])
  })

  it('holds everything under the rotate cover, the toasts and later dialogs included', () => {
    const body = ['root', 'toasts', 'cover', 'modal']
    expect(inertTargets(body, 'cover', true, live)).toEqual(['root', 'toasts', 'modal'])
  })

  it('puts nothing to sleep for a host that has left', () => {
    expect(inertTargets(['root', 'toasts'], 'gone', false, live)).toEqual([])
  })
})

describe('the tab’s title', () => {
  it('names every page of the game from the sheet', () => {
    for (const path of [
      '/home',
      '/team',
      '/shop',
      '/upgrades',
      '/pokedex',
      '/leaderboard',
      '/friends',
      '/versus',
      '/trades',
      '/settings',
      '/daycare',
      '/help',
      '/new',
      '/underground',
      '/underground/dig',
      '/raid/viridian-forest/25',
      '/events/wheel',
      '/events/raid',
      '/events/rebattle',
      '/f/ABCD1234',
      '/t/xyz',
      '/admin/config',
    ]) {
      const key = pageTitleKey(path)
      expect(key, path).toBeTruthy()
      expect(key === 'area' || hasKey(key!), `${path}: ${key}`).toBe(true)
    }
    expect(hasKey('ui.page.title')).toBe(true)
    expect(hasKey('ui.page.battle')).toBe(true)
  })

  it('names the area being explored, and nothing but the game on the title page', () => {
    expect(pageTitleKey('/area')).toBe('area')
    expect(pageTitleKey('/')).toBeNull()
    expect(pageTitleKey('/team/')).toBe('ui.team.title')
  })

  it('ends with the game’s name', () => {
    const t = (key: string, vars?: Record<string, string>) =>
      key === 'ui.page.title' ? `${vars!.page} · ${BRAND}` : key
    expect(pageTitle('Team', t)).toBe('Team · Pokédice')
    expect(pageTitle(null, t)).toBe('Pokédice')
  })
})
