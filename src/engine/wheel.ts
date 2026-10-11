// The Fortune Wheel (docs/18): one free spin a day, from midnight UTC to midnight UTC. Equal slices on the wheel, each
// prize taking `count` of them, each slice won `odds` % of the time (the admin's numbers; they're scaled to 100 % if
// they don't add up). Signed-in players' prize is drawn by the server (wheel_spin(), migration 0035) and only shown
// here; guests draw it here, on the server's day.
import type { Rng } from './rng'
import type { GameData, SaveData, WheelPrize, WheelReward } from './types'

/** The prizes that can come up at all: on at least one slice, with a chance above zero. */
export const livePrizes = (prizes: readonly WheelPrize[]) => prizes.filter((p) => p.count > 0 && p.odds > 0)

/**
 * The wheel's slices, clockwise from the top: each one is the index of its prize in `prizes`. Equal prizes are spread
 * out (round-robin, the prize with the most slices left first, never twice in a row while another is left).
 */
export function wheelSlices(prizes: readonly WheelPrize[]): number[] {
  const left = prizes.map((p) => (p.count > 0 && p.odds > 0 ? Math.floor(p.count) : 0))
  const out: number[] = []
  const total = left.reduce((n, c) => n + c, 0)
  while (out.length < total) {
    const prev = out[out.length - 1]
    const order = left
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c || a.i - b.i)
    const pick = order.find((x) => x.i !== prev) ?? order[0]!
    out.push(pick.i)
    left[pick.i]!--
  }
  // The last slice touches the first: swap it with one that differs from both its neighbours when it can.
  if (out.length > 2 && out[out.length - 1] === out[0]) {
    const last = out.length - 1
    const j = out.findIndex((p, k) => k > 0 && k < last - 1 && p !== out[0] && out[k - 1] !== out[last] && out[k + 1] !== out[last])
    if (j > 0) [out[j], out[last]] = [out[last]!, out[j]!]
  }
  return out
}

/** Each prize's real chance per spin, in % (its slices × their odds, scaled so they add up to 100). */
export function prizeChances(prizes: readonly WheelPrize[]): number[] {
  const weights = prizes.map((p) => (p.count > 0 && p.odds > 0 ? p.count * p.odds : 0))
  const total = weights.reduce((n, w) => n + w, 0)
  return weights.map((w) => (total > 0 ? (w * 100) / total : 0))
}

/** A prize (its index), drawn with the real chances: guests' spins; the server draws signed-in players' the same way. */
export function drawPrize(prizes: readonly WheelPrize[], rng: Rng): number {
  const weights = prizes.map((p) => (p.count > 0 && p.odds > 0 ? p.count * p.odds : 0))
  return rng.weighted(weights.map((w, i) => ({ w, i })), (x) => x.w)?.i ?? 0
}

/** Where the wheel stops for a prize: one of its slices, picked at random so it doesn't always land on the same one. */
export function sliceFor(slices: readonly number[], prize: number, rng: Rng): number {
  const mine = slices.map((p, i) => (p === prize ? i : -1)).filter((i) => i >= 0)
  return mine.length ? rng.pick(mine) : 0
}

/** Today's spin is still there: the last one was on another UTC day (or never), and no prize is waiting. */
export const canSpin = (save: SaveData, day: string) => save.events?.wheelDay !== day && save.events?.wheelPending == null

/** Two rewards are the same prize. */
export const sameReward = (a: WheelReward, b: WheelReward) =>
  a.kind === 'gold' ? b.kind === 'gold' && a.amount === b.amount : b.kind === 'item' && a.key === b.key && a.qty === b.qty

/**
 * The spin is taken: the day is spent and the prize waits to be paid (when the wheel stops, or on the next start if
 * the page closes while it turns), so a reload can neither spin twice nor lose the prize.
 */
export function takeSpin(save: SaveData, day: string, reward: WheelReward): SaveData {
  return { ...save, events: { ...save.events, wheelDay: day, wheelPending: reward } }
}

/** The day is spent without a prize here (it was spun on another device): nothing to pay. */
export function spinSpent(save: SaveData, day: string): SaveData {
  return save.events?.wheelDay === day ? save : { ...save, events: { ...save.events, wheelDay: day } }
}

/** Pays the waiting prize into the live region (₽ or the bag) and clears it. Unchanged when nothing waits. */
export function payWheelPrize(save: SaveData, data: GameData): SaveData {
  const r = save.events?.wheelPending
  if (!r) return save
  const { wheelPending: _paid, ...events } = save.events!
  if (r.kind === 'gold') return { ...save, gold: save.gold + Math.max(0, Math.round(r.amount)), events }
  if (!data.items[r.key]) return { ...save, events }
  const qty = Math.max(1, Math.round(r.qty))
  return { ...save, inventory: { ...save.inventory, [r.key]: (save.inventory[r.key] ?? 0) + qty }, events }
}
