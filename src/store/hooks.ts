import { useEffect, useState } from 'react'
import { badgesHeld, portalLock } from '@/engine'
import { useT } from '@/i18n/react'
import { isAdminEmail } from '@/lib/supabase'
import { typeHintsOn } from '@/save/storage'
import { useGame } from './game'

/** Cosmetic gate (renders the Admin link / route). Every write is enforced by Postgres RLS. */
export function useIsAdmin(): boolean {
  return useGame((s) => s.auth.status === 'signed_in' && isAdminEmail(s.auth.email))
}

export function useInFight(): boolean {
  return useGame((s) => s.run.phase === 'battle' || s.run.phase === 'catch' || s.run.phase === 'victory')
}

/**
 * Whether type hints show (docs/38 U1b): the player's choice once made; until then on while no badge is won, so a new
 * player sees the matchups from the start. The badges are only counted while the setting is unset.
 */
export function useTypeHints(): boolean {
  return useGame((s) =>
    typeHintsOn(s.settings, s.settings.typeHints == null && s.save ? badgesHeld(s.save, s.data) : 0),
  )
}

/**
 * Why the menus are shut right now: a fight under way, or a portal run (docs/28: no way out of the area until it's won
 * or the party is K.O.). Null when they're open.
 */
export function useNavLock(): 'fight' | 'portal' | null {
  const fight = useInFight()
  const portal = useGame((s) => !!portalLock(s.save, s.data))
  return fight ? 'fight' : portal ? 'portal' : null
}

/**
 * Why the ways out of the page are shut right now (useNavLock), in words; null when they're open. What says it stays in
 * reach (docs/15 §12): focusable, the reason in its name, and a tap says it again in a toast.
 */
export function useLockReason(): string | null {
  const { t } = useT()
  const lock = useNavLock()
  return lock ? t(lock === 'portal' ? 'ui.portal.locked' : 'ui.nav.finishFight') : null
}

/** The clock, refreshed every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
