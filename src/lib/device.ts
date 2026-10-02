// A random id kept in this browser: who a guest is, for their messages and the daily analytics ping.
const DEVICE_KEY = 'pokedice.analytics.device'

export function deviceId(): string {
  let ls: Storage | null = null
  try {
    ls = typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    /* storage blocked */
  }
  let id = ls?.getItem(DEVICE_KEY) ?? null
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      ls?.setItem(DEVICE_KEY, id)
    } catch {
      /* private mode: a per-session id is fine */
    }
  }
  return id
}
