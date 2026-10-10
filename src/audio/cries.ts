// Pokémon cries: Showdown's MP3s, played straight from its CDN like the sprites (docs/13-SHOWDOWN-SPRITES.md), so they
// cost our host no request. A cry is fetched the first time it plays, then the browser's cache has it (31 days);
// nothing is fetched ahead, and nothing at all while sound is off. One that can't load (offline, Showdown down) is
// simply not heard: no retry, no message.
import showdownSprites from '@/data/showdown-sprites.json'
import { cryId, SHOWDOWN_CRIES, type ShowdownEntry } from '@/lib/showdown'

const ENTRIES = showdownSprites as unknown as Record<string, ShowdownEntry | undefined>

/** Showdown's cries are mastered loud; this keeps them near the 8-bit sounds. */
const VOLUME = 0.4

let enabled = false
// One element for every cry: a new cry cuts the last one off, and iOS only lets an element it has seen a tap for play
// later on its own (a battle's cries start from timers, not taps).
let player: HTMLAudioElement | null = null
// A cry waiting for the one playing to end (`wait`); only the latest is kept.
let waiting: string | null = null
// Whether a cry is playing or loading. Kept here: an element whose file failed to load still says it isn't paused.
let busy = false
// The latest `start`: a play() promise from an earlier one (a cry cut off) is no news.
let current = 0

export function setCriesEnabled(on: boolean) {
  enabled = on
  if (on) return
  waiting = null
  busy = false
  player?.pause()
}

/** The cry's file, or null when Showdown has none: a form without its own cry gets its species'. */
export function cryUrl(dex: number): string | null {
  const e = ENTRIES[dex]
  const id = e && cryId(e)
  return id ? `${SHOWDOWN_CRIES}/${id}.mp3` : null
}

/** Whether this species or form has a cry of its own (a Mega's, rather than its species'). */
export function hasOwnCry(dex: number) {
  const e = ENTRIES[dex]
  return !!e && e.c === undefined
}

function element(): HTMLAudioElement | null {
  if (player) return player
  if (typeof Audio === 'undefined') return null
  try {
    const a = new Audio()
    a.preload = 'none'
    a.volume = VOLUME
    // A cry that ends, or never loads, lets the waiting one play.
    a.onended = a.onerror = () => next(a)
    player = a
    return a
  } catch {
    return null
  }
}

function next(a: HTMLAudioElement) {
  busy = false
  const url = waiting
  waiting = null
  if (url && enabled) start(a, url)
}

function start(a: HTMLAudioElement, url: string) {
  const id = ++current
  busy = true
  try {
    a.src = url
    // A browser that won't play yet (no tap so far) or a file that won't load: no cry, and on to the next.
    void a.play()?.catch(() => id === current && next(a))
  } catch {
    next(a)
  }
}

/**
 * Plays `dex`'s cry. `wait`: after the cry already playing, rather than over it (the foe's, then yours, when a battle
 * opens with no entrance to space them).
 */
export function playCry(dex: number, { wait = false }: { wait?: boolean } = {}) {
  if (!enabled) return
  const url = cryUrl(dex)
  const a = url && element()
  if (!a) return
  if (wait && busy) {
    waiting = url
    return
  }
  waiting = null
  start(a, url)
}

/**
 * iOS plays an audio element on its own only once a tap has touched it: the first tap anywhere does, with `load()`
 * on the empty element (no request). Other browsers only need the page to have had a tap, which it has by then.
 */
export function unlockCriesOnFirstTap() {
  if (typeof window === 'undefined') return () => {}
  const unlock = () => {
    if (!enabled) return
    element()?.load()
    off()
  }
  const events = ['pointerdown', 'keydown'] as const
  const off = () => events.forEach((e) => window.removeEventListener(e, unlock, true))
  events.forEach((e) => window.addEventListener(e, unlock, true))
  return off
}
