// An invite link opened (/f/<code>): kept in this browser for a week, so it survives the sign-in's trip to Google or
// Discord and a new game, until the game can make the two players friends.
import { isCode, normalizeCode } from './friends'

const KEY = 'pokedice.friendInvite'
const WEEK_MS = 7 * 24 * 3_600_000

export function saveInvite(raw: string, now = Date.now()): string | null {
  const code = normalizeCode(raw)
  if (!isCode(code)) return null
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }))
  } catch {
    /* private mode: the link can be opened again */
  }
  return code
}

export function readInvite(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    if (!v?.code || !isCode(v.code)) return null
    if (typeof v.at !== 'number' || now - v.at > WEEK_MS || v.at > now) {
      clearInvite()
      return null
    }
    return v.code
  } catch {
    return null
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing kept */
  }
}
