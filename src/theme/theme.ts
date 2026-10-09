// Light (Daybreak) or dark (Dusk): `data-theme` on <html> picks the colour variables (tailwind.config.ts), and the
// pixel frames are redrawn in the theme's colours. "Auto" follows the device and changes with it.
import type { ThemeSetting } from '@/save/storage'
import type { ThemeName } from './colors'
import { setFrameTheme } from './frames'

/** Read by index.html before any script loads, so a dark page never flashes light first. */
export const THEME_KEY = 'pokedice.theme'

const darkQuery = () =>
  typeof window === 'undefined' ? null : (window.matchMedia?.('(prefers-color-scheme: dark)') ?? null)

export function resolveTheme(setting: ThemeSetting | undefined): ThemeName {
  if (setting === 'dark') return 'dark'
  if (setting === 'auto') return darkQuery()?.matches ? 'dark' : 'light'
  return 'light'
}

let unwatch: (() => void) | null = null

/** Puts the theme on the page now, and, for "auto", again whenever the device switches. */
export function applyTheme(setting: ThemeSetting | undefined) {
  if (typeof document === 'undefined') return
  unwatch?.()
  unwatch = null
  const put = () => {
    const theme = resolveTheme(setting)
    const root = document.documentElement
    if (theme === 'dark') root.dataset.theme = 'dark'
    else delete root.dataset.theme
    // The browser's own bar follows the page's ground.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#10172a' : '#24304f')
    setFrameTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* private mode: the page just paints light for a moment */
    }
  }
  put()
  const q = setting === 'auto' ? darkQuery() : null
  if (q) {
    q.addEventListener?.('change', put)
    unwatch = () => q.removeEventListener?.('change', put)
  }
}
