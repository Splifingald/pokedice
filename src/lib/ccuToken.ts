// The player cap's token (docs/74): the place in the game the server gave this browser (ccu_join), sent as the
// `x-ccu-token` header on every request to the database, where the gate (ccu_check_request, migration 0157) checks it.
// It lives here, below the store, so the Supabase client can attach it without importing the store.

/** Kept across reloads, so a reload within the grace keeps its place (and a guest signing in carries theirs). */
const TOKEN_KEY = 'pokedice.ccu.token'
export const CCU_HEADER = 'x-ccu-token'

let token: string | null = null
let loaded = false
let onRequired: (() => void) | null = null

export function ccuToken(): string | null {
  if (!loaded) {
    loaded = true
    try {
      token = localStorage.getItem(TOKEN_KEY)
    } catch {
      /* storage blocked: a token for this page only */
    }
  }
  return token
}

export function setCcuToken(next: string | null) {
  loaded = true
  token = next
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* see above */
  }
}

/** What to do when the server says a call needs a place (HTTP 428): the store joins again. */
export function onCcuRequired(fn: (() => void) | null) {
  onRequired = fn
}

/**
 * The header can't go (a request carrying it failed where the same without it went through): the page stops sending
 * it rather than lose every request. Only matters once the gate is on, and then the gate says so with 428s.
 */
let headerBroken = false

const isRest = (url: string) => url.includes('/rest/v1/')

/**
 * The Supabase client's fetch: the token on every database request, and a 428 (the gate's "needs a place") passed on
 * to the store. Anything else goes as it came.
 */
export function withCcuToken(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const t = ccuToken()
    if (!t || headerBroken || !isRest(url)) return seen(await inner(input, init), url)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CCU_HEADER, t)
    try {
      return seen(await inner(input, { ...init, headers }), url)
    } catch (err) {
      // A browser refusing the header fails the request before it leaves. Without it, does it go?
      const plain = await inner(input, init)
      headerBroken = true
      console.warn('[ccu] the token header was refused; sending without it', err)
      return seen(plain, url)
    }
  }
}

function seen(res: Response, url: string): Response {
  if (res.status === 428 && isRest(url)) onRequired?.()
  return res
}

/** Tests: forget everything. */
export function resetCcuToken() {
  token = null
  loaded = false
  headerBroken = false
  onRequired = null
}
