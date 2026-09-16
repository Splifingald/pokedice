import { isAdminEmail } from '@/lib/supabase'
import { useGame } from './game'

/** Cosmetic gate (renders the Admin link / route). Every write is enforced by Postgres RLS. */
export function useIsAdmin(): boolean {
  return useGame((s) => s.auth.status === 'signed_in' && isAdminEmail(s.auth.email))
}

export function useInFight(): boolean {
  return useGame((s) => s.run.phase === 'battle' || s.run.phase === 'catch' || s.run.phase === 'victory')
}
