// Whether Showdown's CDN answers this player (docs/13-SHOWDOWN-SPRITES.md, "Offline and misses"). The Pokémon sprites
// load straight from play.pokemonshowdown.com, and when that server stalls an <img> neither loads nor fails: the browser
// just waits, and a battle stood empty, the HP plates over no Pokémon (players on Discord, 2026-10-27). So a Showdown
// sprite that fails, or is still loading after PATIENCE_MS on screen, marks Showdown down for DOWN_MS: every sprite then
// comes from our own copies (public/pokemon), placed as those are, and a reload remembers it. The game never asks for a
// file Showdown doesn't have, so one failure already means Showdown isn't serving us.
import { create } from 'zustand'
import { SHOWDOWN_SPRITES } from './showdown'

/** How long a Showdown sprite (about 45 KB) may take on screen before our own copy takes its place. */
export const PATIENCE_MS = 4000
/** How long the game then keeps to its own copies before it tries Showdown again. */
export const DOWN_MS = 10 * 60_000
const KEY = 'pokedice.showdownDown'

/** Until when Showdown counts as down (epoch ms); a date further than DOWN_MS ahead is a clock that moved. */
function readUntil(now: number): number {
  try {
    const at = Number(globalThis.localStorage?.getItem(KEY))
    return at > now && at <= now + DOWN_MS ? at : 0
  } catch {
    return 0
  }
}

let until = readUntil(Date.now())
let back: ReturnType<typeof setTimeout> | undefined

/** Re-renders whatever shows a sprite when Showdown goes down or comes back. */
const useReach = create<{ down: boolean }>(() => ({ down: until > Date.now() }))

/** The sprites come from our own copies: Showdown failed or stalled a moment ago. */
export const showdownDown = (now = Date.now()): boolean => now < until

/** Re-renders when Showdown goes down or comes back; read with `showdownDown` (it gives the same answer). */
export const useShowdownDown = (): boolean => useReach((s) => s.down)

function comeBackAt(at: number) {
  clearTimeout(back)
  const wait = at - Date.now()
  if (wait > 0) back = setTimeout(() => useReach.setState({ down: showdownDown() }), wait)
}
if (until) comeBackAt(until)

/** A Showdown sprite failed or stalled: our own copies for DOWN_MS, this page and the next. */
export function showdownMissed(now = Date.now()) {
  until = now + DOWN_MS
  try {
    globalThis.localStorage?.setItem(KEY, String(until))
  } catch {
    /* private mode: this page only */
  }
  useReach.setState({ down: true })
  comeBackAt(until)
}

export const isShowdownUrl = (url: string): boolean => url.startsWith(SHOWDOWN_SPRITES)

/** The <img>s already watched, with the URL they were watched for: a re-render doesn't restart the wait. */
const watched = new WeakMap<HTMLImageElement, string>()

/** Lazy <img>s waiting to come on screen (a lazy image only loads then), with what to do when they do. */
const toShow = new WeakMap<Element, () => void>()
let shows: IntersectionObserver | null = null

/** `go` once the image is on screen: at once for an eager one (it loads anyway), or with no IntersectionObserver. */
function whenShown(img: HTMLImageElement, go: () => void) {
  if (img.loading !== 'lazy' || typeof IntersectionObserver === 'undefined') return go()
  shows ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const then = e.isIntersecting && toShow.get(e.target)
      if (!then) continue
      toShow.delete(e.target)
      shows!.unobserve(e.target)
      then()
    }
  })
  toShow.set(img, go)
  shows.observe(img)
}

/**
 * Watch an <img> showing a Showdown sprite (call it from its ref): still loading PATIENCE_MS after it came on screen,
 * it marks Showdown down, and the components show our own copy instead. A failure is the <img>'s own onError to report
 * (`showdownMissed`). Nothing to clean up: the wait ends by itself once the image loads, leaves the page or changes.
 */
export function watchShowdown(img: HTMLImageElement | null) {
  if (!img || typeof window === 'undefined') return
  const url = img.src
  if (!isShowdownUrl(url) || watched.get(img) === url) return
  watched.set(img, url)
  const check = () => {
    if (!img.isConnected || img.src !== url || img.complete || showdownDown()) return
    // A hidden tab's timers run late and its loads may wait: only a shown page judges.
    if (document.visibilityState === 'hidden') setTimeout(check, PATIENCE_MS)
    else showdownMissed()
  }
  whenShown(img, () => setTimeout(check, PATIENCE_MS))
}

/** For tests: Showdown reachable again, with nothing stored. */
export function resetShowdownReach() {
  until = 0
  clearTimeout(back)
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
  useReach.setState({ down: false })
}
