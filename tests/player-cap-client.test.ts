// The player cap's client side (docs/74): the server's answers read safely (anything else is "no cap here"), the token
// on every database request and nowhere else, the gate's 428 passed on, and a refused header dropped rather than
// losing every request.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CCU_HEADER, onCcuRequired, resetCcuToken, setCcuToken, withCcuToken } from '@/lib/ccuToken'
import { parseCcuAnswer } from '@/store/ccu'

const TOKEN = 'ab'.repeat(32)
const REST = 'https://x.supabase.co/rest/v1/rpc/versus_record'

afterEach(() => resetCcuToken())

/** The headers a call went with, read by iterating (a copied Headers' get() misreads here). */
const sentHeaders = (call: unknown) =>
  Object.fromEntries([...new Headers(((call as unknown[])[1] as RequestInit | undefined)?.headers).entries()])

describe('parseCcuAnswer', () => {
  it('reads a place in the game and a place in line', () => {
    expect(parseCcuAnswer({ status: 'active', token: TOKEN, heartbeatSeconds: 30, cap: 30 })).toMatchObject({
      status: 'active',
      token: TOKEN,
      heartbeatSeconds: 30,
      cap: 30,
      idle: false,
    })
    expect(
      parseCcuAnswer({ status: 'queued', token: TOKEN, position: 4, queueLength: 9, reason: 'idle' }),
    ).toMatchObject({
      status: 'queued',
      position: 4,
      queueLength: 9,
      idle: true,
    })
    expect(parseCcuAnswer({ status: 'gone' })).toMatchObject({ status: 'gone', token: null })
  })

  it('takes anything else as no answer, and keeps the timers sensible', () => {
    for (const v of [
      null,
      '',
      [],
      {},
      { status: 'active' },
      { status: 'active', token: 'not hex!' },
      { status: 'maybe', token: TOKEN },
    ])
      expect(parseCcuAnswer(v)).toBeNull()
    expect(
      parseCcuAnswer({ status: 'active', token: TOKEN, heartbeatSeconds: 0, queueHeartbeatSeconds: 9999 }),
    ).toMatchObject({
      heartbeatSeconds: 5,
      queueHeartbeatSeconds: 300,
    })
  })
})

describe('withCcuToken', () => {
  it('sends the token to the database only, and nothing before there is one', async () => {
    const inner = vi.fn(async () => new Response('{}'))
    const f = withCcuToken(inner as unknown as typeof fetch)
    await f(REST, { headers: { apikey: 'k' } })
    expect(sentHeaders(inner.mock.calls[0])).toEqual({ apikey: 'k' })
    setCcuToken(TOKEN)
    await f(REST, { headers: { apikey: 'k' } })
    expect(sentHeaders(inner.mock.calls[1])).toEqual({ apikey: 'k', [CCU_HEADER]: TOKEN })
    await f('https://x.supabase.co/auth/v1/token', {})
    expect((inner.mock.calls[2] as unknown[])[1]).toEqual({})
  })

  it('passes the gate’s 428 on, so the game asks for its place again', async () => {
    const required = vi.fn()
    onCcuRequired(required)
    setCcuToken(TOKEN)
    const f = withCcuToken((async () => new Response('{}', { status: 428 })) as unknown as typeof fetch)
    expect((await f(REST, {})).status).toBe(428)
    expect(required).toHaveBeenCalledTimes(1)
  })

  it('drops a header the browser refuses, once the same request goes without it', async () => {
    setCcuToken(TOKEN)
    const inner = vi.fn(async (_: unknown, init?: RequestInit) => {
      if (CCU_HEADER in Object.fromEntries([...new Headers(init?.headers).entries()]))
        throw new TypeError('Failed to fetch')
      return new Response('{}')
    })
    const f = withCcuToken(inner as unknown as typeof fetch)
    expect((await f(REST, {})).ok).toBe(true)
    expect((await f(REST, {})).ok).toBe(true)
    // The second went without trying the header again.
    expect(inner).toHaveBeenCalledTimes(3)
  })

  it('keeps a real network failure a failure', async () => {
    setCcuToken(TOKEN)
    const f = withCcuToken((async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)
    await expect(f(REST, {})).rejects.toThrow('offline')
  })
})
