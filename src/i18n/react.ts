import { useGame } from '@/store/game'
import { t, tPlural, type TVars } from '.'

/**
 * `const { t } = useT()` — the component re-renders when the player switches language.
 * Outside React, import `t` from '@/i18n' directly.
 */
export function useT(): { t: (key: string, vars?: TVars) => string; tPlural: typeof tPlural } {
  useGame((s) => s.settings.lang)
  return { t, tPlural }
}
