// Whether the sprite sources answer this player (docs/13-SHOWDOWN-SPRITES.md, "Offline and misses"). The Pokémon sprites
// load from our copy of Showdown's files (docs/45), else from play.pokemonshowdown.com itself, and when such a server
// stalls an <img> neither loads nor fails: the browser just waits, and a battle stood empty, the HP plates over no
// Pokémon (players on Discord, 2026-10-27). So a sprite that fails, or is still loading after PATIENCE_MS on screen,
// marks its source down for DOWN_MS and every sprite moves to the next one: our copy, then Showdown, then our own
// built-in copies (public/pokemon), placed as those are. A reload remembers it. The game never asks a source for a file
// it doesn't have, so one failure already means that source isn't serving us.
import { create } from 'zustand'
import { SPRITE_SOURCES, type SpriteSource } from './showdown'

/** How long a sprite (about 45 KB) may take on screen before the next source takes its place. */
export const PATIENCE_MS = 4000
/** How long a source that failed is then left alone before the game tries it again. */
export const DOWN_MS = 10 * 60_000
/** `{ [sprites folder]: down until (epoch ms) }`, so a source added or removed by a deploy reads nothing stale. */
const KEY = 'pokedice.spritesDown'

/** Until when each source counts as down (epoch ms), by its sprites folder. */
const until = new Map<string, number>()

/** What the store holds: a date further than DOWN_MS ahead is a clock that moved. */
function readStored(now: number) {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Record<string, unknown>
    for (const s of SPRITE_SOURCES) {
      const at = Number(stored?.[s.sprites])
      if (at > now && at <= now + DOWN_MS) until.set(s.sprites, at)
    }
  } catch {
    /* nothing stored, or not ours */
  }
}

function store() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(until)))
  } catch {
    /* private mode: this page only */
  }
}

readStored(Date.now())

const isUp = (s: SpriteSource, now: number) => !(now < (until.get(s.sprites) ?? 0))

/** The source the game reads now: the first that hasn't failed lately, or null (the local sprites). */
export const spriteSource = (now = Date.now()): SpriteSource | null =>
  SPRITE_SOURCES.find((s) => isUp(s, now)) ?? null

/** Where the cries come from: the sprites' source, else Showdown (a cry that can't load is simply not heard). */
export const crySource = (now = Date.now()): SpriteSource => spriteSource(now) ?? SPRITE_SOURCES.at(-1)!

/** Re-renders whatever shows a sprite when a source goes down or comes back. */
const useReach = create<{ sprites: string | null }>(() => ({ sprites: spriteSource()?.sprites ?? null }))

/**
 * The sprites folder the game reads now (null: the local sprites), re-rendering when it changes; read the source with
 * `spriteSource` (it gives the same answer).
 */
export const useSpriteSource = (): string | null => useReach((s) => s.sprites)

let back: ReturnType<typeof setTimeout> | undefined

/** Follow the sources: the store says which is read, and a timer wakes when the next one that failed is due back. */
function settle(now = Date.now()) {
  useReach.setState({ sprites: spriteSource(now)?.sprites ?? null })
  clearTimeout(back)
  const due = Math.min(...[...until.values()].filter((at) => at > now))
  if (Number.isFinite(due)) back = setTimeout(() => settle(), due - now)
}
if (until.size) settle()

/** The source this URL is one of the files of, if any. */
const sourceOf = (url: string) => SPRITE_SOURCES.find((s) => url.startsWith(s.sprites))

/** A sprite from this URL failed or stalled: its source is down for DOWN_MS, this page and the next. */
export function spriteMissed(url: string, now = Date.now()) {
  const s = sourceOf(url)
  if (!s) return
  until.set(s.sprites, now + DOWN_MS)
  store()
  settle(now)
}

/** A sprite from one of the sources (our copy or Showdown), not a local one. */
export const isShowdownUrl = (url: string): boolean => !!sourceOf(url)

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
 * Watch an <img> showing a source's sprite (call it from its ref): still loading PATIENCE_MS after it came on screen,
 * it marks that source down, and the components move on to the next. A failure is the <img>'s own onError to report
 * (`spriteMissed`). Nothing to clean up: the wait ends by itself once the image loads, leaves the page or changes.
 */
export function watchShowdown(img: HTMLImageElement | null) {
  if (!img || typeof window === 'undefined') return
  const url = img.src
  const source = sourceOf(url)
  if (!source || watched.get(img) === url) return
  watched.set(img, url)
  const check = () => {
    if (!img.isConnected || img.src !== url || img.complete || !isUp(source, Date.now())) return
    // A hidden tab's timers run late and its loads may wait: only a shown page judges.
    if (document.visibilityState === 'hidden') setTimeout(check, PATIENCE_MS)
    else spriteMissed(url)
  }
  whenShown(img, () => setTimeout(check, PATIENCE_MS))
}

/** For tests: every source reachable again, with nothing stored. */
export function resetShowdownReach() {
  until.clear()
  clearTimeout(back)
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
  useReach.setState({ sprites: spriteSource()?.sprites ?? null })
}
