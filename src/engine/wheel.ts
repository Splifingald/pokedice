// The Fortune Wheel (docs/18): a ticket a spin since 2026-10-25 (the user's design). One free ticket every 12 h, 4 held
// at most, more for ₽200 each while under 4. Equal slices, each prize taking `count` of them and each slice won `odds` %
// of the time (the admin's numbers, scaled to 100 % if they don't add up), plus the jackpot's slice: Porygon, then a
// shiny Porygon once Porygon is caught, then a Master Ball once that's caught, each at its own fixed chance. The draw
// is the device's, as the Underground's walls are: the tickets, the purse and the prize all live in the save.
import { rollTalentFor } from './talents'
import { applyCatch, catchTarget } from './catching'
import { inWorldRegion } from './regions'
import type { Rng } from './rng'
import type { GameData, SaveData, WheelConfig, WheelPrize, WheelReward } from './types'

const HOUR = 60 * 60 * 1000

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

/** A prize (its index), drawn with the real chances. */
export function drawPrize(prizes: readonly WheelPrize[], rng: Rng): number {
  const weights = prizes.map((p) => (p.count > 0 && p.odds > 0 ? p.count * p.odds : 0))
  return rng.weighted(weights.map((w, i) => ({ w, i })), (x) => x.w)?.i ?? 0
}

/** Where the wheel stops for a prize: one of its slices, picked at random so it doesn't always land on the same one. */
export function sliceFor(slices: readonly number[], prize: number, rng: Rng): number {
  const mine = slices.map((p, i) => (p === prize ? i : -1)).filter((i) => i >= 0)
  return mine.length ? rng.pick(mine) : 0
}

// ------------------------------------------------------------------ the jackpot

/** This Pokémon prize is already the player's: caught (in the Pokédex), or for a shiny, owned shiny in any region. */
function prizeOwned(save: SaveData, r: Extract<WheelReward, { kind: 'pokemon' }>): boolean {
  if (!r.shiny) return save.pokedex.includes(r.dex)
  if (Object.values(save.shinyDex ?? {}).some((dexes) => dexes?.includes(r.dex))) return true
  const boxes = [save.box, ...Object.values(save.parked ?? {}).map((b) => b?.box ?? [])]
  return boxes.some((box) => box.some((p) => p.dex === r.dex && p.shiny))
}

/**
 * The jackpot stage on the wheel for this save: the first Pokémon not caught yet, or the first item stage, which stays
 * for good. Read from the Pokédex and the Boxes, never stored, so a Porygon won before the tickets counts too.
 */
export function jackpotStage(save: SaveData, wheel: WheelConfig): number {
  const stages = wheel.jackpot ?? []
  for (const [i, s] of stages.entries()) if (s.reward.kind !== 'pokemon' || !prizeOwned(save, s.reward)) return i
  return Math.max(0, stages.length - 1)
}

/** The jackpot's chance a spin, kept between 0 and 99 % so the other slices always keep a share. */
const jackpotOdds = (odds: number) => Math.min(99, Math.max(0, Number(odds) || 0))

/**
 * The wheel's prizes for a stage: the ordinary slices, then the jackpot's (one slice). Its weight is set so it comes
 * up exactly its `odds` % of spins, whatever the others add up to.
 */
export function roulettePrizes(wheel: WheelConfig, stage: number): WheelPrize[] {
  const jp = wheel.jackpot?.[stage]
  const odds = jp ? jackpotOdds(jp.odds) : 0
  if (!jp || odds <= 0) return wheel.slices
  const rest = wheel.slices.reduce((n, p) => n + (p.count > 0 && p.odds > 0 ? p.count * p.odds : 0), 0)
  const weight = rest > 0 ? (odds * rest) / (100 - odds) : 1
  return [...wheel.slices, { reward: jp.reward, count: 1, odds: weight }]
}

/** The index of the jackpot in `roulettePrizes` (−1 when this stage has none). */
export const jackpotIndex = (wheel: WheelConfig, stage: number) =>
  wheel.jackpot?.[stage] && jackpotOdds(wheel.jackpot[stage]!.odds) > 0 ? wheel.slices.length : -1

/** What a spin pays back on average at a stage, in ₽: ₽ as is, items at their Mart price, a Pokémon at its `value`. */
export function wheelAverage(wheel: WheelConfig, stage: number, data: GameData): number {
  const prizes = roulettePrizes(wheel, stage)
  const jp = jackpotIndex(wheel, stage)
  const worth = (r: WheelReward, i: number) =>
    r.kind === 'gold'
      ? r.amount
      : r.kind === 'item'
        ? (data.items[r.key]?.price ?? 0) * r.qty
        : i === jp
          ? Math.max(0, wheel.jackpot[stage]!.value || 0)
          : 0
  return prizeChances(prizes).reduce((sum, c, i) => sum + (c / 100) * worth(prizes[i]!.reward, i), 0)
}

// ------------------------------------------------------------------ tickets

/** The ticket numbers as the game uses them: whole, at least one held, at least an hour between two free ones. */
export function ticketRules(wheel: WheelConfig) {
  const t = wheel.tickets
  return {
    everyMs: Math.max(1, Number(t?.everyHours) || 12) * HOUR,
    cap: Math.max(1, Math.round(Number(t?.cap) || 4)),
    price: Math.max(0, Math.round(Number(t?.price) || 0)),
  }
}

/**
 * The tickets held right now and when the next free one comes (null while the stack is full: at the cap the clock
 * stops, as the Underground's free kits do). A save that never spun holds a full stack.
 */
export function wheelTickets(save: SaveData, data: GameData, now: number): { tickets: number; nextAt: number | null } {
  const { everyMs, cap } = ticketRules(data.config.events.wheel)
  let tickets = save.events?.wheelTickets ?? cap
  let at = save.events?.wheelTicketAt ?? null
  if (tickets >= cap) return { tickets, nextAt: null }
  if (at == null) at = now + everyMs
  while (at != null && at <= now && tickets < cap) {
    tickets++
    at = tickets >= cap ? null : at + everyMs
  }
  return { tickets, nextAt: at }
}

/** The save with its tickets counted up to now. */
function refilled(save: SaveData, data: GameData, now: number): SaveData {
  const { tickets, nextAt } = wheelTickets(save, data, now)
  return { ...save, events: { ...save.events, wheelTickets: tickets, wheelTicketAt: nextAt } }
}

/** A spin is there: a ticket held, and no prize still waiting to be paid. */
export const canSpin = (save: SaveData, data: GameData, now: number) =>
  save.events?.wheelPending == null && wheelTickets(save, data, now).tickets > 0

/**
 * The spin is taken: a ticket is spent and the prize waits to be paid (when the wheel stops, or on the next start if
 * the page closes while it turns), so a reload can neither spin for free nor lose the prize. Null without a ticket.
 */
export function takeSpin(save: SaveData, data: GameData, now: number, reward: WheelReward): SaveData | null {
  if (!canSpin(save, data, now)) return null
  const next = refilled(save, data, now)
  const { everyMs } = ticketRules(data.config.events.wheel)
  const held = next.events!.wheelTickets!
  return {
    ...next,
    events: {
      ...next.events,
      wheelTickets: held - 1,
      // A full stack's clock was stopped: it starts with the first ticket spent.
      wheelTicketAt: next.events!.wheelTicketAt ?? now + everyMs,
      wheelPending: reward,
    },
  }
}

/** Buys one ticket at its price while fewer than the cap are held. Null when the stack is full or the purse short. */
export function buyTicket(save: SaveData, data: GameData, now: number): SaveData | null {
  const { cap, price } = ticketRules(data.config.events.wheel)
  const next = refilled(save, data, now)
  const held = next.events!.wheelTickets!
  if (held >= cap || save.gold < price) return null
  const full = held + 1 >= cap
  return {
    ...next,
    gold: next.gold - price,
    events: { ...next.events, wheelTickets: held + 1, wheelTicketAt: full ? null : next.events!.wheelTicketAt },
  }
}

/**
 * Pays the waiting prize into the live region (₽, the bag, or the Pokémon as a catch) and clears it. Unchanged when
 * nothing waits. A Pokémon the player can't take (a stronger plain copy is owned) is let go.
 */
export function payWheelPrize(save: SaveData, data: GameData, now: number, newId: () => string): SaveData {
  const r = save.events?.wheelPending
  // Inside a small world it waits: nothing from outside reaches its bag or purse (docs/21).
  if (!r || inWorldRegion(save, data)) return save
  const { wheelPending: _paid, ...events } = save.events!
  const cleared = { ...save, events }
  if (r.kind === 'gold') return { ...cleared, gold: save.gold + Math.max(0, Math.round(r.amount)) }
  if (r.kind === 'pokemon') {
    const level = Math.max(1, Math.round(r.level))
    // Its family's hidden talent, at the wild odds (docs/51), drawn from the prize's moment so a reload rolls the same.
    const talent = rollTalentFor(data, r.dex, `wheel-${r.dex}-${level}-${save.updatedAt}`)
    const target = catchTarget(cleared, r.dex, level, 'wild', data, !!r.shiny, cleared.currentAreaId, talent)
    return target ? applyCatch(cleared, { dex: r.dex, level, shiny: !!r.shiny, talent }, target, data, now, newId).save : cleared
  }
  if (!data.items[r.key]) return cleared
  const qty = Math.max(1, Math.round(r.qty))
  return { ...cleared, inventory: { ...save.inventory, [r.key]: (save.inventory[r.key] ?? 0) + qty } }
}
