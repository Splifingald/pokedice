// Seedable mulberry32. Every random decision in the engine goes through an Rng so battles are reproducible.

export interface Rng {
  /** float in [0, 1) */
  next(): number
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  /** Weighted pick; entries with weight <= 0 are never chosen. Returns undefined when nothing is pickable. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined
  getState(): number
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list')
      return items[Math.floor(next() * items.length)] as (typeof items)[number]
    },
    weighted: (items, weightOf) => {
      let total = 0
      for (const it of items) total += Math.max(0, weightOf(it))
      if (total <= 0) return undefined
      let r = next() * total
      for (const it of items) {
        const w = Math.max(0, weightOf(it))
        if (w <= 0) continue
        if (r < w) return it
        r -= w
      }
      // Floating-point fallthrough: return the last pickable entry.
      for (let i = items.length - 1; i >= 0; i--) if (weightOf(items[i]!) > 0) return items[i]
      return undefined
    },
    getState: () => a >>> 0,
  }
  return rng
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
