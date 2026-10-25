// The Fortune Wheel's spin (docs/18): a ticket a spin, drawn on the device on the server's clock (the tickets refill on
// it, so changing the device's clock changes nothing). The ticket is spent and the prize saved before the wheel turns,
// and paid when it stops: a reload can neither spin for free nor lose it.
import {
  buyTicket,
  canSpin,
  cashReward,
  createRng,
  drawPrize,
  inWorldRegion,
  jackpotStage,
  livesFor,
  payWheelPrize,
  randomSeed,
  roulettePrizes,
  sliceFor,
  takeSpin,
  ticketRules,
  wheelSlices,
  wheelTickets,
  type WheelReward,
} from '@/engine'
import { mutateSave, useGame } from './game'
import { newId } from './run'
import { serverNow, useServerNow } from './serverTime'

export type Spin =
  | { ok: true; slice: number; reward: WheelReward }
  /** tickets: none held · time: the real time isn't known yet. */
  | { ok: false; reason: 'tickets' | 'time' }

/** Spends a ticket on a spin. Returns where the wheel stops; the prize is paid by `collectWheelPrize` when it has. */
export function spinWheel(): Spin {
  const { save, data } = useGame.getState()
  const now = serverNow()
  // Inside a small world no event reaches (docs/21): its page says to leave first.
  if (!save || now == null || inWorldRegion(save, data)) return { ok: false, reason: 'time' }
  if (!canSpin(save, data, now)) return { ok: false, reason: 'tickets' }
  const wheel = data.config.events.wheel
  const prizes = roulettePrizes(wheel, jackpotStage(save, wheel))
  const rng = createRng(randomSeed())
  const prize = drawPrize(prizes, rng)
  // Cash Flow, if it runs: the wheel stops on its slice, the ₽ paid are boosted.
  const paid = cashReward(prizes[prize]!.reward, livesFor(save, data, now))
  if (!mutateSave((s) => takeSpin(s, data, now, paid))) return { ok: false, reason: 'tickets' }
  return { ok: true, slice: sliceFor(wheelSlices(prizes), prize, rng), reward: paid }
}

/** Buys a ticket at its price. False when the stack is full, the purse short or the time unknown. */
export function buyWheelTicket(): boolean {
  const { data } = useGame.getState()
  const now = serverNow()
  if (now == null) return false
  return mutateSave((s) => buyTicket(s, data, now))
}

/** Pays the waiting prize (the wheel has stopped, or the page closed while it turned). */
export function collectWheelPrize(): void {
  const { data } = useGame.getState()
  mutateSave((s) => {
    const next = payWheelPrize(s, data, Date.now(), newId)
    return next === s ? null : next
  })
}

/** The tickets on the server's clock, re-read every `ms`: `known` false while the real time isn't known yet. */
export function useWheelTickets(ms = 1000): { known: false } | { known: true; tickets: number; cap: number; msLeft: number | null } {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (now == null || !save) return { known: false }
  const { tickets, nextAt } = wheelTickets(save, data, now)
  return { known: true, tickets, cap: ticketRules(data.config.events.wheel).cap, msLeft: nextAt == null ? null : Math.max(0, nextAt - now) }
}
