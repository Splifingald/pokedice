// The Pokédex tab's NEW dot: entries added since the player last looked, per region. A per-device convenience
// (localStorage), not part of the save: a fresh device simply starts from what the save already holds.
import { useEffect, useState } from 'react'
import { regionOf } from '@/engine'
import { useGame } from '@/store/game'

const keyOf = (region: string) => `pokedice.dexSeen.${region}`

function read(region: string): number | null {
  try {
    const v = localStorage.getItem(keyOf(region))
    return v == null ? null : Number(v) || 0
  } catch {
    return null
  }
}
function write(region: string, n: number) {
  try {
    localStorage.setItem(keyOf(region), String(n))
  } catch {
    /* storage can be off: the dot then never shows */
  }
}

const listeners = new Set<() => void>()

/** How many Pokédex entries are new since the last look (0 on a device that never looked: it starts from now). */
export function useDexNew(): number {
  const count = useGame((s) => s.save?.pokedex.length ?? 0)
  const region = useGame((s) => (s.save ? regionOf(s.save) : 'kanto'))
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    listeners.add(on)
    return () => {
      listeners.delete(on)
    }
  }, [])
  const seen = read(region)
  if (seen == null) {
    write(region, count)
    return 0
  }
  return Math.max(0, count - seen)
}

/** The Pokédex was opened: everything in it has been seen. */
export function markDexSeen() {
  const save = useGame.getState().save
  if (!save) return
  write(regionOf(save), save.pokedex.length)
  listeners.forEach((l) => l())
}
