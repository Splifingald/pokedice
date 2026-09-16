// Dealing decks: split `size` cards between weighted entries (largest remainder), then shuffle.
import type { Rng } from './rng'

/**
 * Cards per entry for a deck of `size`: the weights scaled by largest remainder. Every entry with a positive weight gets
 * at least one card (the deck grows if it has to), `caps` limits an entry's cards (a unique find: 1), zero weights get
 * none.
 */
export function apportion(weights: readonly number[], size: number, caps: readonly (number | undefined)[] = []): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0))
  const out = w.map(() => 0)
  const live = w.flatMap((x, i) => (x > 0 ? [i] : []))
  if (!live.length) return out
  const total = live.reduce((s, i) => s + w[i]!, 0)
  const n = Math.max(Math.round(size) || 1, live.length)
  const exact = (i: number) => (w[i]! / total) * n
  for (const i of live) out[i] = Math.max(1, Math.floor(exact(i)))
  let left = n - live.reduce((s, i) => s + out[i]!, 0)
  const byRemainder = [...live].sort((a, b) => (exact(b) % 1) - (exact(a) % 1))
  for (let k = 0; left > 0; k++, left--) {
    const i = byRemainder[k % byRemainder.length]!
    out[i] = out[i]! + 1
  }
  // The one-card floor can overshoot a small deck: take the excess from the biggest pile.
  for (; left < 0; left++) {
    const big = live.reduce((a, b) => (out[b]! > out[a]! ? b : a))
    out[big] = out[big]! - 1
  }
  caps.forEach((c, i) => {
    if (c != null && out[i]! > c) out[i] = c
  })
  return out
}

/** Fisher–Yates on the given Rng, so every deal is reproducible. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}
