// A sprite source stalling or failing (src/lib/showdownReach.ts): a battle stood empty, the HP plates over no Pokémon,
// while play.pokemonshowdown.com kept a sprite loading (players on Discord, 2026-10-27). A sprite still loading after a
// few seconds on screen, or one that fails, now sends every sprite to the next source for a while: our copy (docs/45),
// then Showdown itself, then the local copies, placed as those are.
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

const { DOWN_MS, PATIENCE_MS, resetShowdownReach, spriteMissed, spriteSource, watchShowdown } =
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
/** The local sprites are what the game reads: no source left. */
const showdownDown = () => spriteSource() === null

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
    spriteMissed(WEEPINBELL)
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
    spriteMissed(WEEPINBELL, now)
    const stored = JSON.parse(localStorage.getItem('pokedice.spritesDown')!)
    expect(stored).toEqual({ 'https://play.pokemonshowdown.com/sprites': now + DOWN_MS })
  })

  it('ignores a failure of anything but a source (a local sprite, a trainer sheet)', () => {
    spriteMissed(`https://poke-dice.netlify.app${spriteUrlFor(70)}`)
    expect(showdownDown()).toBe(false)
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

// With our copy (VITE_SPRITES_HOST, docs/45): the copy first, Showdown itself when it fails, the local sprites after.
describe('our sprite copy, then Showdown', () => {
  const COPY = 'https://pokedice-sprites.pages.dev'

  /** The game's modules as a build with the copy has them (the address is read once, at load). */
  async function withCopy() {
    vi.stubEnv('VITE_SPRITES_HOST', COPY)
    vi.resetModules()
    const reach = await import('@/lib/showdownReach')
    const sprite = await import('@/components/SpriteImg')
    const { stageSprite } = await import('@/fx/sprites')
    const { outfitSprite } = await import('@/lib/outfitSprites')
    const { cryUrl } = await import('@/audio/cries')
    return { ...reach, ...sprite, stageSprite, outfitSprite, cryUrl }
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reads the copy, then Showdown when the copy fails, then the local sprites', async () => {
    const m = await withCopy()
    const fromCopy = m.showdownView(70, false, false)!.url
    expect(fromCopy).toBe(`${COPY}/sprites/gen5ani/weepinbell.gif`)
    expect(m.cryUrl(25)).toBe(`${COPY}/audio/cries/pikachu.mp3`)

    m.spriteMissed(fromCopy)
    // Still animated, from Showdown: the same file, placed the same.
    expect(m.showdownView(70, false, false)!.url).toBe(WEEPINBELL)
    expect(m.stageSprite(12, true, false).url).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5ani-back/butterfree.gif',
    )
    expect(m.cryUrl(25)).toBe('https://play.pokemonshowdown.com/audio/cries/pikachu.mp3')

    m.spriteMissed(WEEPINBELL)
    expect(m.spriteSource()).toBeNull()
    expect(m.stageSprite(12, true, false).url).toBe(m.spriteUrlFor(12, 'back'))
    // No source left: the cries still try Showdown (one that can't load is simply not heard).
    expect(m.cryUrl(25)).toBe('https://play.pokemonshowdown.com/audio/cries/pikachu.mp3')

    vi.advanceTimersByTime(DOWN_MS)
    expect(m.showdownView(70, false, false)!.url).toBe(fromCopy)
  })

  it('shows an outfit only from the copy: the plain species from Showdown', async () => {
    const m = await withCopy()
    expect(m.outfitSprite('santa', 25)?.id).toBe('pikachu-santa')
    expect(m.showdownView(25, false, false, 'santa')!.url).toBe(`${COPY}/sprites/gen5ani/pikachu-santa.gif`)
    m.spriteMissed(`${COPY}/sprites/gen5ani/pikachu-santa.gif`)
    expect(m.outfitSprite('santa', 25)).toBeNull()
    expect(m.showdownView(25, false, false, 'santa')!.url).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5ani/pikachu.gif',
    )
  })

  it('marks only the source that stalled', async () => {
    const m = await withCopy()
    const img = fakeImg(m.showdownView(70, false, false)!.url)
    m.watchShowdown(img)
    vi.advanceTimersByTime(PATIENCE_MS)
    expect(m.spriteSource()?.sprites).toBe('https://play.pokemonshowdown.com/sprites')
    // The copy's image, still loading, doesn't count against Showdown.
    vi.advanceTimersByTime(PATIENCE_MS * 3)
    expect(m.spriteSource()?.sprites).toBe('https://play.pokemonshowdown.com/sprites')
  })

  it('remembers on the next page which source failed', async () => {
    const m = await withCopy()
    m.spriteMissed(`${COPY}/sprites/gen5ani/weepinbell.gif`)
    const next = await withCopy()
    expect(next.spriteSource()?.sprites).toBe('https://play.pokemonshowdown.com/sprites')
    expect(next.showdownView(70, false, false)!.url).toBe(WEEPINBELL)
  })
})
