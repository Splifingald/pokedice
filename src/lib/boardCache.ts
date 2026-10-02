// A board downloaded less than BOARD_CACHE_MS ago is shown again instead of downloaded again (docs/11 §6.2–6.3): the
// leaderboard and the Versus board are the game's biggest reads, and players reopen them often. One entry per board,
// in memory and in sessionStorage (so a reload within the window costs nothing either). Keyed on whatever the rows
// depend on — the player, the region — so a sign-in or a region switch never shows the wrong board.

export const BOARD_CACHE_MS = 5 * 60_000

interface Entry<T> {
  at: number
  key: string
  rows: T
}

export interface BoardCache<T> {
  /** The rows cached under `key`, while they are fresh. */
  get(key: string, now?: number): T | null
  put(key: string, rows: T, now?: number): void
  /** Forget them: something just changed the board (a fight recorded, a team saved). */
  clear(): void
}

export function boardCache<T>(name: string): BoardCache<T> {
  const storageKey = `pokedice.board.${name}`
  let memo: Entry<T> | null | undefined
  const read = (): Entry<T> | null => {
    if (memo === undefined) {
      try {
        memo = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Entry<T> | null
      } catch {
        memo = null
      }
    }
    return memo
  }
  return {
    get(key, now = Date.now()) {
      const e = read()
      return e && e.key === key && now - e.at >= 0 && now - e.at < BOARD_CACHE_MS ? e.rows : null
    },
    put(key, rows, now = Date.now()) {
      memo = { at: now, key, rows }
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(memo))
      } catch {
        /* storage blocked or full: the in-memory copy still serves this page */
      }
    },
    clear() {
      memo = null
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        /* nothing to clear */
      }
    },
  }
}
