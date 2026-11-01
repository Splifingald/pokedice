// Tracks in the Snow's effects (docs/64 §4.1, docs/15 §46): the way in holds its end and says its line as the reindeer
// lands in the bushes, before its card; the snowfall covers the glade at a known time (the fresh glade swaps in then),
// in half the time when short; the outro's card comes last; and the shiny Stantler's entrance is a boss's (its reveal
// before its card and the send-out).
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})

const { snowfallCoverAt, tracksIntroTimeline, tracksOutroTimeline, tracksSnowfallTimeline } =
  await import('@/fx/timelines/tracks')
const { stantlerCinema } = await import('@/fx/timelines/cinema/stantler')
import type { Cue, Hud } from '@/fx/timeline'

/** What the HUD heard firing every cue in order, with when. */
function play(cues: readonly Cue<unknown>[]) {
  const heard: [number, string][] = []
  const hud: Hud = { beat: (b) => void heard.push([-1, b]) }
  for (const [t, fire] of cues) {
    const before = heard.length
    fire(hud, undefined)
    for (let i = before; i < heard.length; i++) heard[i]![0] = t
  }
  return heard
}

describe('Tracks in the Snow: its scenes', () => {
  it('the way in: the line as the reindeer lands, then the card; it holds its end; short is half', () => {
    for (const short of [false, true]) {
      const tl = tracksIntroTimeline({ title: 'Tracks in the Snow', mon: 'x', short })
      expect(tl.hold).toBe(true)
      const heard = play(tl.cues(undefined as never) as Cue<unknown>[])
      const line = heard.find(([, b]) => b === 'line')![0]
      const card = heard.find(([, b]) => b === 'card')![0]
      expect(line).toBeLessThan(card)
      expect(card).toBeLessThanOrEqual(tl.dur)
    }
    const full = tracksIntroTimeline({ title: '', mon: 'x' })
    const short = tracksIntroTimeline({ title: '', mon: 'x', short: true })
    expect(short.dur).toBeCloseTo(full.dur / 2, 1)
  })

  it('the snowfall covers the glade halfway, then settles; short is half', () => {
    for (const short of [false, true]) {
      const tl = tracksSnowfallTimeline({ short })
      const heard = play(tl.cues(undefined as never) as Cue<unknown>[])
      expect(heard).toEqual([[snowfallCoverAt(short), 'covered']])
      expect(tl.dur).toBeCloseTo(snowfallCoverAt(short) * 2)
      expect(tl.hold).toBeFalsy()
    }
    expect(snowfallCoverAt(true)).toBeCloseTo(snowfallCoverAt() / 2)
  })

  it('the outro: its card last, held at its end', () => {
    const tl = tracksOutroTimeline({ mon: 'x', title: 'Stantler' })
    expect(tl.hold).toBe(true)
    const heard = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(heard.map(([, b]) => b)).toEqual(['card'])
    expect(heard[0]![0]).toBeLessThanOrEqual(tl.dur)
  })

  it('the shiny Stantler’s entrance is a boss’s: its reveal, then the card and the send-out', () => {
    expect(stantlerCinema.reveal).toBeGreaterThan(3)
    expect(stantlerCinema.dur).toBeGreaterThan(stantlerCinema.reveal + 2)
  })
})
