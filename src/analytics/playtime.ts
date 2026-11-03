// Playtime (docs/57 §3.2): the seconds the game is on screen and in use, counted here and sent with the analytics call
// the game already makes at most once an hour (ping.ts, migration 0130). Nothing is sent on its own.
// "In use": the tab is visible and the player touched, clicked, scrolled or typed in the last IDLE_MS, so a battle
// watched to its end counts and a tab left open on the desk stops counting after that.
// The seconds not sent yet wait in localStorage, per player, so a reload or a closed tab keeps them for the next call.

const KEY = 'pokedice.analytics.playtime'
/** How often the time on screen is added up. */
export const TICK_MS = 15_000
/** No input for this long and the game counts as left on screen, not played. */
export const IDLE_MS = 5 * 60_000
/** The most one call carries (the server drops more, migration 0130): the hour sent, and the end of the last session. */
export const MAX_SEND = 7200
/** The most kept waiting per player, if calls keep failing: the rest of a day of play isn't worth more storage. */
const MAX_PENDING = 24 * 3600

/**
 * The milliseconds played between the last tick and `now`: none while hidden, none past IDLE_MS after the last input,
 * and never more than two ticks (a sleeping laptop or a throttled tab wakes up with a long gap it didn't play).
 */
export function playedMs(now: number, lastTick: number, lastInput: number, visible: boolean): number {
  if (!visible || now <= lastTick) return 0
  const until = Math.min(now, lastInput + IDLE_MS)
  return Math.max(0, Math.min(until - lastTick, 2 * TICK_MS))
}

/** player key → seconds played and not sent yet. */
function readPending(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0),
    )
  } catch {
    return {}
  }
}

function writePending(p: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage blocked: the seconds of this page load are lost, nothing else */
  }
}

/** The seconds waiting for `player`, as whole seconds (the call takes an int). */
export const pendingSeconds = (player: string) => Math.floor(readPending()[player] ?? 0)

export function addPlaytime(player: string, seconds: number) {
  if (!(seconds > 0)) return
  const p = readPending()
  p[player] = Math.min(MAX_PENDING, (p[player] ?? 0) + seconds)
  writePending(p)
}

/** `seconds` of `player`'s were sent: what was counted since (while the call was out) stays waiting. */
export function markPlaytimeSent(player: string, seconds: number) {
  const p = readPending()
  const left = (p[player] ?? 0) - seconds
  if (left > 0) p[player] = left
  else delete p[player]
  writePending(p)
}

/** A guest who signs in: their seconds go with the account's call, as the server merges their row into it (0102). */
export function movePlaytime(from: string, to: string) {
  const p = readPending()
  if (!p[from] || from === to) return
  p[to] = Math.min(MAX_PENDING, (p[to] ?? 0) + p[from])
  delete p[from]
  writePending(p)
}

let started = false
/** Counts from now on, for whoever `player()` says is playing (null: nobody yet, the time isn't counted). */
export function startPlaytime(player: () => string | null) {
  if (started || typeof document === 'undefined') return
  started = true
  let lastTick = Date.now()
  let lastInput = lastTick
  // `visible`: on hiding, the state already reads hidden, but the time up to it was on screen.
  const tick = (visible = document.visibilityState === 'visible') => {
    const now = Date.now()
    const ms = playedMs(now, lastTick, lastInput, visible)
    lastTick = now
    const who = ms > 0 ? player() : null
    if (who) addPlaytime(who, ms / 1000)
  }
  const onInput = () => {
    lastInput = Date.now()
  }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const)
    window.addEventListener(ev, onInput, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    // Hidden: the time up to now was played. Shown again: the time away wasn't, and coming back is an input.
    if (document.visibilityState === 'hidden') tick(true)
    else lastTick = lastInput = Date.now()
  })
  window.addEventListener('pagehide', () => tick())
  setInterval(() => tick(), TICK_MS)
}

/** "12 h 05 min", "45 min", "< 1 min": how the admin reads a playtime. */
export function formatPlaytime(seconds: number): string {
  const min = Math.floor(seconds / 60)
  if (min < 1) return seconds > 0 ? '< 1 min' : '0 min'
  const h = Math.floor(min / 60)
  if (!h) return `${min} min`
  return `${h.toLocaleString()} h ${String(min % 60).padStart(2, '0')} min`
}
