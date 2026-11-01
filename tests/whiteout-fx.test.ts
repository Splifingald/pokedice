// Crown Shrine's whiteout's effects (docs/61 §4.3, docs/15 §47): the way in holds its end and says its line once the
// eyes glow, before its name card; the bonfire catches before it heals (the screen has the engine give the heal on that
// cue), quicker when short; the team sits round the fire, those on its left turned to face it; the end's card comes
// after the boss shows; Abomasnow's entrance is a boss cinematic like the others.
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

const { bonfireTimeline, campSlots, whiteoutIntroTimeline, whiteoutOutroTimeline } =
  await import('@/fx/timelines/whiteout')
const { BOSS_CINEMAS } = await import('@/fx/timelines/cinema')
const { abomasnowCinema } = await import('@/fx/timelines/cinema/abomasnow')
const { fullStage } = await import('@/fx/timelines/portal')
import type { Cue, Hud } from '@/fx/timeline'

/** The cues' times, and what the HUD heard (beats, heals) firing them all in order. */
function play(cues: readonly Cue<unknown>[]) {
  const heard: [number, string][] = []
  const hud: Hud = {
    beat: (b) => void heard.push([-1, b]),
    heal: () => void heard.push([-1, 'heal']),
  }
  for (const [t, fire] of cues) {
    const before = heard.length
    fire(hud, undefined)
    for (let i = before; i < heard.length; i++) heard[i]![0] = t
  }
  return { times: cues.map(([t]) => t), heard }
}
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
const at = (heard: [number, string][], b: string) => heard.find(([, x]) => x === b)?.[0]

describe('the way in (the blizzard rolls in, eyes in the crown tree)', () => {
  const size = fullStage(390, 844, 200)

  it('holds its end for the tap; its line once the eyes glow, then the name card, in half the time when short', () => {
    const tl = whiteoutIntroTimeline({ ...size, title: 'Whiteout' })
    expect(tl.hold).toBe(true)
    const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(sorted(times)).toEqual(times)
    expect(at(heard, 'line')!).toBeLessThan(at(heard, 'card')!)
    expect(at(heard, 'card')!).toBeLessThan(tl.dur)
    const short = whiteoutIntroTimeline({ ...size, title: 'Whiteout', short: true })
    expect(short.dur).toBeLessThan(tl.dur)
    expect(at(play(short.cues(undefined as never) as Cue<unknown>[]).heard, 'line')).toBeCloseTo(
      at(heard, 'line')! / 2,
    )
  })
})

describe('the bonfire', () => {
  it('catches, then heals once (the screen gives the heal on that cue), and holds, burning; quicker when short', () => {
    const tl = bonfireTimeline({ team: ['181f', '508f', '733f'] })
    expect(tl.hold).toBe(true)
    const { heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(heard.filter(([, b]) => b === 'heal')).toHaveLength(1)
    expect(at(heard, 'warm')).toBe(at(heard, 'heal'))
    expect(at(heard, 'heal')!).toBeLessThanOrEqual(tl.dur)
    const short = bonfireTimeline({ team: ['181f'], short: true })
    expect(at(play(short.cues(undefined as never) as Cue<unknown>[]).heard, 'heal')!).toBeLessThan(
      at(heard, 'heal')!,
    )
  })

  it('seats the team round the fire, left to right, those on its left turned to face it', () => {
    for (const n of [1, 2, 3, 6]) {
      const slots = campSlots(n, 240, 120)
      expect(slots).toHaveLength(n)
      for (let i = 1; i < n; i++) expect(slots[i]!.x).toBeGreaterThan(slots[i - 1]!.x)
      for (const s of slots) {
        expect(s.flip).toBe(s.x < 120)
        expect(s.x).toBeGreaterThan(0)
        expect(s.x).toBeLessThan(240)
      }
    }
  })
})

describe('the end and Abomasnow', () => {
  it('shows the boss in the sun before its name card, and holds', () => {
    const tl = whiteoutOutroTimeline({ title: 'The blizzard lifts', mon: '460fs' })
    expect(tl.hold).toBe(true)
    const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(sorted(times)).toEqual(times)
    expect(at(heard, 'mon')!).toBeLessThan(at(heard, 'card')!)
  })

  it('makes Abomasnow’s entrance one of the bosses’ cinematics', () => {
    expect(BOSS_CINEMAS[460]).toBe(abomasnowCinema)
    expect(abomasnowCinema.reveal).toBeLessThan(abomasnowCinema.dur)
  })
})
