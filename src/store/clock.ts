// The real time for Extreme mode's clocks (docs/22): the server's time at the last sync, carried forward on the page's
// own monotonic clock (performance.now), so moving the device's clock changes nothing. No imports: the game store reads
// it while settling a save, and serverTime.ts sets it on each sync.

let anchor: { server: number; perf: number } | null = null

/** The server read `server` (ms) when this page's monotonic clock said `perf`. */
export function anchorClock(server: number, perf: number) {
  anchor = { server, perf }
}

/** The real time now, or null until the first sync. */
export function trustedNow(): number | null {
  return anchor ? anchor.server + (performance.now() - anchor.perf) : null
}
