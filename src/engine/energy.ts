// Energy: each encounter discovered costs 1, refilled in real time (offline too) up to a cap. Admin-toggleable.
import type { Encounter } from './encounters'
import type { EnergyConfig, SaveData } from './types'

export interface EnergyView {
  /** Energy right now, 0 … max. */
  value: number
  max: number
  /** When the next point comes in (ms), or null when full. */
  nextAt: number | null
}

const interval = (cfg: EnergyConfig) => Math.max(1, cfg.minutesPerEnergy) * 60_000

/** The save's energy at `now`: what it held at `energy.at`, plus a point per interval since, capped. Absent = full. */
export function energyNow(save: SaveData, cfg: EnergyConfig, now: number): EnergyView {
  const max = Math.max(1, Math.floor(cfg.max))
  const e = save.energy
  if (!e) return { value: max, max, nextAt: null }
  const step = interval(cfg)
  const gained = Math.max(0, Math.floor((now - e.at) / step))
  const value = Math.max(0, Math.min(max, e.value + gained))
  return { value, max, nextAt: value >= max ? null : e.at + (gained + 1) * step }
}

/**
 * Spend `n` energy. The time already put towards the next point is kept (a spend from full starts the clock now).
 * Null when there isn't enough.
 */
export function spendEnergy(save: SaveData, cfg: EnergyConfig, now: number, n = 1): SaveData | null {
  const cur = energyNow(save, cfg, now)
  if (cur.value < n) return null
  const at = cur.nextAt == null ? now : cur.nextAt - interval(cfg)
  return { ...save, energy: { value: cur.value - n, at } }
}

/** What discovering this encounter costs: 1, except a gym / Elite / Champion battle, a legendary or a Pokémon Center. */
export function encounterEnergyCost(enc: Encounter): number {
  return enc.kind === 'gym' || enc.kind === 'boss' || enc.kind === 'center' ? 0 : 1
}
