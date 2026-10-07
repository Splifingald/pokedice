// Token refresh backoff. When Supabase Auth is struggling, supabase-js keeps trying to refresh the session: up to ~7
// requests in 30 s per attempt, a new attempt a minute later, in every open tab, for as long as the outage lasts. Each
// of those reaches a database that is already too slow to answer (2026-10-07: hundreds of /token timeouts every
// 15 minutes, and Google sign-in stuck behind them).
//
// This wraps the fetch supabase-js uses. After a refresh comes back with a server error, the next ones are answered
// here with a 503 without reaching the network, for 30 s, then 1, 2, 4 and at most 5 minutes as the errors continue,
// with some jitter so the tabs don't all come back at once. A 5xx is what supabase-js treats as a passing failure: the
// session is kept and the player stays signed in once a refresh gets through. The first success resets the backoff.
// Only refreshes are held back; sign-in and every other request go straight through.

const FIRST_PAUSE_MS = 30_000
const MAX_PAUSE_MS = 5 * 60_000

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const isRefresh = (url: string) => url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')

/** The answer while refreshes are paused: a 503, which supabase-js retries later rather than signing the player out. */
const paused = () =>
  new Response(JSON.stringify({ code: 503, error_code: 'refresh_paused', msg: 'Token refresh paused after a server error' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  })

export function guardRefresh(
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
  random: () => number = Math.random,
): typeof fetch {
  let failures = 0
  let pausedUntil = 0
  return async (input, init) => {
    if (!isRefresh(urlOf(input))) return fetchImpl(input, init)
    if (now() < pausedUntil) return paused()
    const res = await fetchImpl(input, init)
    if (res.status >= 500) {
      failures++
      const pause = Math.min(MAX_PAUSE_MS, FIRST_PAUSE_MS * 2 ** (failures - 1))
      pausedUntil = now() + pause * (0.75 + random() * 0.25)
    } else {
      failures = 0
      pausedUntil = 0
    }
    return res
  }
}
