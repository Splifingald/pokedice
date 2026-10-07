import { describe, expect, it, vi } from 'vitest'
import { guardRefresh } from '@/lib/refreshGuard'

const REFRESH = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token'
const answer = (status: number) => new Response('{}', { status })

/** A guarded fetch whose network answers with `statuses` in turn, on a clock the test moves. */
function setup(...statuses: number[]) {
  let clock = 0
  const network = vi.fn(async () => answer(statuses.shift() ?? 200))
  // No jitter: random() = 1 gives the full pause.
  const guarded = guardRefresh(network as unknown as typeof fetch, () => clock, () => 1)
  return { network, guarded, wait: (ms: number) => void (clock += ms) }
}

describe('token refresh backoff', () => {
  it('holds refreshes back after a server error, without reaching the network', async () => {
    const { network, guarded, wait } = setup(504)
    expect((await guarded(REFRESH)).status).toBe(504)
    wait(29_000)
    // A 5xx, so supabase-js keeps the session and tries again later.
    expect((await guarded(REFRESH)).status).toBe(503)
    expect(network).toHaveBeenCalledTimes(1)
    wait(1_000)
    expect((await guarded(REFRESH)).status).toBe(200)
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('waits longer each time, up to 5 minutes, and starts over after a success', async () => {
    const { network, guarded, wait } = setup(500, 500, 500, 500, 500, 500, 500, 200, 500)
    await guarded(REFRESH)
    // How long until a refresh reaches the network again, after each of the 7 errors.
    const pauses: number[] = []
    for (let i = 0; i < 7; i++) {
      const before = network.mock.calls.length
      let waited = 0
      while (network.mock.calls.length === before) {
        wait(10_000)
        waited += 10_000
        await guarded(REFRESH)
      }
      pauses.push(waited)
    }
    expect(pauses).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000])
    // The 8th got through (200), so the next error pauses for 30 s again, not 5 minutes.
    await guarded(REFRESH)
    wait(29_000)
    expect((await guarded(REFRESH)).status).toBe(503)
    wait(1_000)
    await guarded(REFRESH)
    expect(network).toHaveBeenCalledTimes(10)
  })

  it('lets everything else through, and does not count client errors', async () => {
    const { network, guarded } = setup(500, 200, 400, 200)
    await guarded('https://x.supabase.co/rest/v1/saves')
    await guarded('https://x.supabase.co/auth/v1/token?grant_type=pkce')
    // A 400 (a used refresh token) is the server's answer, not an outage: no pause.
    await guarded(REFRESH)
    expect((await guarded(REFRESH)).status).toBe(200)
    expect(network).toHaveBeenCalledTimes(4)
  })
})
