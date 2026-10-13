// The push sender's work (docs/25), apart from Netlify and Supabase so the tests can drive it: ask the database for the
// notices due now (each already claimed, so no other run sends it), deliver each through its browser's push service,
// then report which subscriptions the push services say are gone (404, 410: the player turned notifications off or
// cleared the browser), so they're dropped.

export interface DueRow {
  notice: number
  endpoint: string
  p256dh: string
  auth: string
  payload: unknown
}

export interface SenderDeps {
  due: () => Promise<DueRow[]>
  /** Sends one; rejects with the push service's `statusCode` when it refuses. */
  push: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string) => Promise<unknown>
  report: (ok: string[], gone: string[]) => Promise<void>
}

/** Sends at once, a batch at a time: a push service is one request per notice. */
const BATCH = 25

const statusOf = (err: unknown): number | undefined =>
  typeof err === 'object' && err && 'statusCode' in err
    ? Number((err as { statusCode: unknown }).statusCode)
    : undefined

export async function sendDue(deps: SenderDeps): Promise<{ sent: number; gone: number; failed: number }> {
  const rows = await deps.due()
  const ok: string[] = []
  const gone: string[] = []
  let failed = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((r) =>
        deps.push(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify(r.payload),
        ),
      ),
    )
    results.forEach((res, k) => {
      const endpoint = batch[k]!.endpoint
      if (res.status === 'fulfilled') ok.push(endpoint)
      else if (statusOf(res.reason) === 404 || statusOf(res.reason) === 410) gone.push(endpoint)
      else failed++
    })
  }
  // A quiet run (nothing due) costs no second request.
  if (rows.length) await deps.report([...new Set(ok)], [...new Set(gone)])
  return { sent: ok.length, gone: gone.length, failed }
}
