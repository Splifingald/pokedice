// Rayquaza's raids in the sky (docs/15 §14): its entrance lands its reveal on the raid intro's white-out, lasts as long
// as the intro, its cues in order.
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

const { skyRaidEntranceTimeline } = await import('@/fx/timelines/skyRaid')
const { RAID_ENTRANCE_DUR, RAID_ENTRANCE_REVEAL } = await import('@/fx/timelines/portalRaid')
const { fullStage } = await import('@/fx/timelines/portal')
import type { Cue, Hud } from '@/fx/timeline'

function play(cues: readonly Cue<unknown>[]) {
  const heard: [number, string][] = []
  const hud: Hud = { beat: (b) => void heard.push([-1, b]) }
  for (const [t, fire] of cues) {
    const before = heard.length
    fire(hud, undefined)
    for (let i = before; i < heard.length; i++) heard[i]![0] = t
  }
  return { times: cues.map(([t]) => t), heard }
}

describe('Rayquaza’s raid entrance (skyRaidEntranceTimeline)', () => {
  it('lands its reveal on the raid intro’s white-out and lasts as long as the intro', () => {
    const tl = skyRaidEntranceTimeline({ ...fullStage(390, 844), mon: '384f' })
    expect(tl.dur).toBe(RAID_ENTRANCE_DUR)
    const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(heard).toEqual([[RAID_ENTRANCE_REVEAL, 'roar']])
    expect(tl.hold).toBeFalsy()
  })
})
