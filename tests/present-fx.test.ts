// The Gift card's present (docs/61 §4.0, §4.2; docs/15 §45): every take holds its last frame, says its beats in order
// (`grown`; `broke` then `out`; `opened` after the last thing has risen), and short takes are shorter.
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

const { presentTimeline, presentSize } = await import('@/fx/timelines/present')
import type { Cue, Hud } from '@/fx/timeline'
import type { PresentParams } from '@/fx/timelines/present'

/** The beats the HUD heard firing every cue in order, with when. */
function beats(p: PresentParams) {
  const tl = presentTimeline(p)
  const heard: [number, string][] = []
  for (const [t, fire] of tl.cues(undefined as never) as Cue<unknown>[]) {
    const hud: Hud = { beat: (b) => void heard.push([t, b]) }
    fire(hud, undefined)
  }
  return { tl, heard }
}

describe('the Gift card’s present', () => {
  it('grows in whole pixels, a little more each level', () => {
    for (let l = 1; l < 7; l++) {
      const a = presentSize(l)
      const b = presentSize(l + 1)
      expect(b.bw).toBeGreaterThan(a.bw)
      expect(b.bh).toBeGreaterThan(a.bh)
      expect(Number.isInteger(a.bw) && Number.isInteger(a.bh) && a.bw % 2 === 0).toBe(true)
    }
  })

  it('every take holds its end', () => {
    for (const mode of ['appear', 'idle', 'grow', 'break', 'burst', 'open'] as const)
      expect(presentTimeline({ mode, level: 3, to: 4 }).hold).toBe(true)
  })

  it('a grow says `grown` once, inside the take; short is shorter', () => {
    for (const short of [false, true]) {
      const { tl, heard } = beats({ mode: 'grow', level: 3, to: 4, short })
      expect(heard.map(([, b]) => b)).toEqual(['grown'])
      expect(heard[0]![0]).toBeLessThan(tl.dur)
    }
    expect(presentTimeline({ mode: 'grow', level: 3, to: 4, short: true }).dur).toBeLessThan(
      presentTimeline({ mode: 'grow', level: 3, to: 4 }).dur,
    )
  })

  it('a break says `broke`, then `out` as the Pokémon lands, both before the end; a boss’s strains longer', () => {
    for (const mode of ['break', 'burst'] as const) {
      const { tl, heard } = beats({ mode, level: 4, look: mode === 'burst' ? 'silver' : 'red', mon: 'x' })
      expect(heard.map(([, b]) => b)).toEqual(['broke', 'out'])
      expect(heard[0]![0]).toBeLessThan(heard[1]![0])
      expect(heard[1]![0]).toBeLessThan(tl.dur)
    }
    expect(presentTimeline({ mode: 'burst', level: 5, look: 'silver' }).dur).toBeGreaterThan(
      presentTimeline({ mode: 'break', level: 5 }).dur,
    )
  })

  it('an open says `opened` after the last thing has come out', () => {
    const contents = [0, 1, 2].map((i) => ({ key: `item|${i}`, kind: 'item' as const }))
    const { tl, heard } = beats({ mode: 'open', level: 5, contents })
    expect(heard.map(([, b]) => b)).toEqual(['opened'])
    expect(heard[0]![0]).toBeLessThan(tl.dur)
    // The cues are in time order (the player fires them in list order).
    const times = tl.cues(undefined as never).map(([t]) => t)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
