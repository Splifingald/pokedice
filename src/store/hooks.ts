import { useEffect, useState } from 'react'
import { energyNow, type EnergyView } from '@/engine'
import { isAdminEmail } from '@/lib/supabase'
import { useGame } from './game'

/** Cosmetic gate (renders the Admin link / route). Every write is enforced by Postgres RLS. */
export function useIsAdmin(): boolean {
  return useGame((s) => s.auth.status === 'signed_in' && isAdminEmail(s.auth.email))
}

export function useInFight(): boolean {
  return useGame((s) => s.run.phase === 'battle' || s.run.phase === 'catch' || s.run.phase === 'victory')
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

/** The player's energy, ticking every second; null when the energy system is off (or there's no save). */
export function useEnergy(): (EnergyView & { now: number }) | null {
  const save = useGame((s) => s.save)
  const cfg = useGame((s) => s.data.config.energy)
  const now = useNow()
  if (!save || !cfg.enabled) return null
  return { ...energyNow(save, cfg, now), now }
}
