// The Fortune Wheel's spin (docs/18): signed-in players' prize is drawn by the server (wheel_spin(), one a UTC day),
// guests' here on the server's day. Either way the day is spent and the prize saved before the wheel turns, and paid
// when it stops: a reload can neither spin twice nor lose it.
import {
  canSpin,
  createRng,
  drawPrize,
  payWheelPrize,
  randomSeed,
  sameReward,
  sliceFor,
  spinSpent,
  takeSpin,
  utcDay,
  wheelSlices,
  type WheelReward,
} from '@/engine'
import { getSupabase } from '@/lib/supabase'
import { mutateSave, useGame } from './game'
import { serverNow } from './serverTime'

export type Spin =
  | { ok: true; slice: number; reward: WheelReward }
  /** spent: already spun today (maybe on another device) · time: the real time isn't known yet · error: the server said no. */
  | { ok: false; reason: 'spent' | 'time' | 'error' }

interface ServerSpin {
  day: string
  prize: number
  reward: WheelReward
  fresh: boolean
}

async function serverSpin(): Promise<ServerSpin> {
  const client = await getSupabase()
  if (!client) throw new Error('events_signed_out')
  const { data, error } = await client.rpc('wheel_spin')
  if (error) throw error
  return data as ServerSpin
}

/** Takes today's spin. Returns where the wheel stops; the prize is paid by `collectWheelPrize` when it has. */
export async function spinWheel(): Promise<Spin> {
  const { save, data, auth } = useGame.getState()
  const now = serverNow()
  // Signed in or not isn't known yet: a guest's draw now could be a signed-in player's second spin.
  if (!save || now == null || auth.status === 'unknown') return { ok: false, reason: 'time' }
  const day = utcDay(now)
  if (!canSpin(save, day)) return { ok: false, reason: 'spent' }
  const prizes = data.config.events.wheel.prizes
  const slices = wheelSlices(prizes)
  const rng = createRng(randomSeed())
  if (auth.status !== 'signed_in') {
    const prize = drawPrize(prizes, rng)
    mutateSave((s) => takeSpin(s, day, prizes[prize]!.reward))
    return { ok: true, slice: sliceFor(slices, prize, rng), reward: prizes[prize]!.reward }
  }
  let res: ServerSpin
  try {
    res = await serverSpin()
  } catch {
    return { ok: false, reason: 'error' }
  }
  // Spun already today, on this account: the day is spent here too, and that prize was paid where it was won.
  if (!res.fresh) {
    mutateSave((s) => spinSpent(s, res.day))
    return { ok: false, reason: 'spent' }
  }
  mutateSave((s) => takeSpin(s, res.day, res.reward))
  // The server's prize is the one paid; the wheel stops on one of its slices (by index, or by the same reward if the
  // admin's list changed while this page was open).
  const prize = prizes[res.prize] && sameReward(prizes[res.prize]!.reward, res.reward) ? res.prize : prizes.findIndex((p) => sameReward(p.reward, res.reward))
  return { ok: true, slice: prize >= 0 ? sliceFor(slices, prize, rng) : 0, reward: res.reward }
}

/** Pays the waiting prize (the wheel has stopped, or the page closed while it turned). */
export function collectWheelPrize(): void {
  const { data } = useGame.getState()
  mutateSave((s) => {
    const next = payWheelPrize(s, data)
    return next === s ? null : next
  })
}
