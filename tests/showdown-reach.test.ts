// Showdown's CDN stalling or failing (src/lib/showdownReach.ts): a battle stood empty, the HP plates over no Pokémon,
// while play.pokemonshowdown.com kept a sprite loading (players on Discord, 2026-10-27). A sprite still loading after a
// few seconds on screen, or one that fails, now sends every sprite to the local copies for a while, placed as those are.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads; the stall check reads the tab's visibility, and waits for a
// lazy image to come on screen (`shown` plays the browser telling it so).
const { shown } = vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  const store = new Map<string, string>()
  const observers: { cb: (e: { target: unknown; isIntersecting: boolean }[]) => void; els: Set<unknown> }[] =
    []
  class FakeObserver {
    els = new Set<unknown>()
    constructor(public cb: (e: { target: unknown; isIntersecting: boolean }[]) => void) {
      observers.push(this)
    }
    observe(el: unknown) {
      this.els.add(el)
    }
    unobserve(el: unknown) {
      this.els.delete(el)
    }
  }
  Object.assign(globalThis, {
    document: {
      documentElement: {},
      visibilityState: 'visible',
      createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
    },
    window: globalThis,
    IntersectionObserver: FakeObserver,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
  const shown = (el: unknown) => {
    for (const o of observers) if (o.els.has(el)) o.cb([{ target: el, isIntersecting: true }])
  }
  return { shown }
})

const { DOWN_MS, PATIENCE_MS, resetShowdownReach, showdownDown, showdownMissed, watchShowdown } =
  await import('@/lib/showdownReach')
const { showdownView, spriteUrlFor } = await import('@/components/SpriteImg')
const { stageSprite } = await import('@/fx/sprites')

const doc = globalThis.document as unknown as { visibilityState: string }

/** An <img> as the stall check sees it: its URL, whether it is done and on the page, and whether it loads lazily. */
function fakeImg(src: string, opts: { lazy?: boolean } = {}) {
  return {
    src,
    complete: false,
    isConnected: true,
    loading: opts.lazy ? 'lazy' : 'auto',
  } as unknown as HTMLImageElement & { complete: boolean; isConnected: boolean; src: string }
}

const WEEPINBELL = showdownView(70, false, false)!.url

beforeEach(() => {
  vi.useFakeTimers()
  resetShowdownReach()
  doc.visibilityState = 'visible'
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Showdown down', () => {
  it('sends every sprite to the local copies, placed as those are, then tries Showdown again', () => {
    expect(WEEPINBELL).toMatch(/^https:\/\/play\.pokemonshowdown\.com\/sprites\/gen5ani\/weepinbell\.gif$/)
    showdownMissed()
    expect(showdownDown()).toBe(true)
    expect(showdownView(70, false, false)).toBeNull()
    const s = stageSprite(12, true, false)
    expect(s.url).toBe(spriteUrlFor(12, 'back'))
    expect(s.fallback).toBeNull()
    expect(s.w).toBe(64)
    vi.advanceTimersByTime(DOWN_MS)
    expect(showdownDown()).toBe(false)
    expect(stageSprite(12, true, false).url).toMatch(/gen5ani-back\/butterfree\.gif$/)
  })

  it('is remembered by the next page', () => {
    const now = Date.now()
    showdownMissed(now)
    expect(Number(localStorage.getItem('pokedice.showdownDown'))).toBe(now + DOWN_MS)
  })
})

describe('a Showdown sprite that stalls', () => {
  it('marks Showdown down once it has been loading PATIENCE_MS', () => {
    const img = fakeImg(WEEPINBELL)
    watchShowdown(img)
    vi.advanceTimersByTime(PATIENCE_MS - 1)
    expect(showdownDown()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(showdownDown()).toBe(true)
  })

  it('leaves a sprite that loaded, left the page or changed alone', () => {
    const loaded = fakeImg(WEEPINBELL)
    const gone = fakeImg(WEEPINBELL)
    const local = fakeImg(`https://poke-dice.netlify.app${spriteUrlFor(70)}`)
    for (const img of [loaded, gone, local]) watchShowdown(img)
    loaded.complete = true
    gone.isConnected = false
    vi.advanceTimersByTime(PATIENCE_MS * 3)
    expect(showdownDown()).toBe(false)
  })

  it("doesn't restart the wait on every render", () => {
    const img = fakeImg(WEEPINBELL)
    watchShowdown(img)
    vi.advanceTimersByTime(PATIENCE_MS / 2)
    watchShowdown(img)
    vi.advanceTimersByTime(PATIENCE_MS / 2)
    expect(showdownDown()).toBe(true)
  })

  it('judges only on a shown tab', () => {
    doc.visibilityState = 'hidden'
    watchShowdown(fakeImg(WEEPINBELL))
    vi.advanceTimersByTime(PATIENCE_MS * 3)
    expect(showdownDown()).toBe(false)
    doc.visibilityState = 'visible'
    vi.advanceTimersByTime(PATIENCE_MS)
    expect(showdownDown()).toBe(true)
  })

  it('waits for a lazy image to come on screen (it only starts loading then)', () => {
    const below = fakeImg(WEEPINBELL, { lazy: true })
    watchShowdown(below)
    vi.advanceTimersByTime(PATIENCE_MS * 3)
    expect(showdownDown()).toBe(false)
    shown(below)
    vi.advanceTimersByTime(PATIENCE_MS - 1)
    expect(showdownDown()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(showdownDown()).toBe(true)
  })
})
