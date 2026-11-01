// The server's time, read through the device's clock: a reading whose round trip took too long (the page frozen in the
// background, the device asleep or its clock moved meanwhile) can't say when the server read its clock, so it is
// dropped and the last one stays — a guess off by days closed a small world early (2026-10-25).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trustedNow } from '@/store/clock'
import { MAX_ROUND_TRIP_MS, serverNow, syncServerTime, useServerTime } from '@/store/serverTime'

const T0 = Date.parse('2026-10-25T15:41:00.000Z')
const DAY = 86_400_000

/** What the server answers, and how long the device waits for it (the device's clock moves on by that much). */
const net = vi.hoisted(() => ({ wait: 0, server: 0 }))
vi.mock('@/lib/supabase', () => ({
  getSupabase: async () => ({
    rpc: async () => {
      vi.setSystemTime(Date.now() + net.wait)
      return { data: { now: new Date(net.server).toISOString() }, error: null }
    },
  }),
}))

beforeEach(() => {
  vi.useFakeTimers({ now: T0, toFake: ['Date'] })
  useServerTime.setState({ offset: null })
})
afterEach(() => vi.useRealTimers())

describe('reading the server’s time', () => {
  it('keeps a quick reading: the halfway guess, on both clocks', async () => {
    net.wait = 200
    net.server = T0 + 100
    await syncServerTime()
    expect(useServerTime.getState().offset).toBe(0)
    // The page's steady clock (not faked here) barely moved during the reading: the server's reading carried on it.
    expect(Math.abs(serverNow()! - (T0 + 100))).toBeLessThan(50)
    expect(trustedNow()).not.toBeNull()
  })

  it('reads the steady clock, so moving the device’s clock after a reading changes nothing (docs/63)', async () => {
    net.wait = 0
    net.server = T0
    await syncServerTime()
    vi.setSystemTime(Date.now() + 7 * DAY)
    expect(Math.abs(serverNow()! - T0)).toBeLessThan(50)
  })

  it('drops a reading whose round trip outlasted the limit, and keeps the last one', async () => {
    net.wait = 200
    net.server = T0 + 100
    await syncServerTime()
    // The page froze for a week mid-reading; the server answered at its end.
    net.wait = 7 * DAY
    net.server = Date.now() + 7 * DAY
    await syncServerTime()
    expect(useServerTime.getState().offset).toBe(0)
    // Up to the limit, still kept.
    net.wait = MAX_ROUND_TRIP_MS
    net.server = Date.now() + MAX_ROUND_TRIP_MS / 2 + 1000
    await syncServerTime()
    expect(useServerTime.getState().offset).toBe(1000)
  })

  it('drops a reading taken while the device’s clock went back', async () => {
    net.wait = -3_600_000
    net.server = T0
    await syncServerTime()
    expect(useServerTime.getState().offset).toBeNull()
  })
})
