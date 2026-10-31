// The legends' own cinematics (docs/53): their switch (Off by default, the admin alone, everyone); the raid intro's
// words follow each cinematic's reveal, at the shared entrance's old times when it has none; every raid cinematic roars
// on its reveal and ends when the words are done; Mew's boss entrance shows the foe, sends yours out and shows it, in
// that order, before it ends.
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
})

const { BOSS_CINEMAS, RAID_CINEMAS, wordsAt } = await import('@/fx/timelines/cinema')
const { AFTER_REVEAL } = await import('@/fx/timelines/cinema/kit')
const { legendCinemaOn } = await import('@/engine')
const { makeData } = await import('./fixtures')
import type { Cue, Hud, Side } from '@/fx/timeline'

/** The cues' times, and the beats the HUD heard firing them all in order. */
function play(cues: readonly Cue<unknown>[]) {
  const heard: string[] = []
  const hud: Hud = {
    beat: (b) => void heard.push(b),
    show: (side: Side, on: boolean) => void heard.push(`show:${side}:${on}`),
  }
  for (const [, fire] of cues) fire(hud, undefined)
  return { times: cues.map(([t]) => t), heard }
}

describe('the switch', () => {
  it('is Off by default, then the admin alone, then everyone', () => {
    expect(legendCinemaOn(makeData())).toBe(false)
    const admin = makeData({ legendCinema: { access: 'admin' } })
    expect(legendCinemaOn(admin)).toBe(false)
    expect(legendCinemaOn({ ...admin, viewer: { admin: true } })).toBe(true)
    expect(legendCinemaOn(makeData({ legendCinema: { access: 'all' } }))).toBe(true)
  })
})

describe('the raid intro’s words', () => {
  it('keep the shared entrance’s times when there is no cinematic', () => {
    expect(wordsAt()).toEqual({ boom: 2750, name: 3250, bars: 3600, cuts: 4550, go: 5500, end: 6150 })
  })

  it('follow a cinematic’s reveal, and end with it', () => {
    for (const c of Object.values(RAID_CINEMAS)) {
      const w = wordsAt(c.reveal)
      expect(w.boom).toBe(Math.round(c.reveal * 1000))
      expect(w.end).toBeLessThanOrEqual(Math.round(c.dur * 1000))
    }
  })
})

describe('the raid cinematics', () => {
  it('has each finished legend’s raid', () => {
    expect(
      Object.keys(RAID_CINEMAS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([
      130, 144, 145, 146, 150, 249, 250, 480, 481, 482, 483, 484, 485, 486, 487, 488, 493, 716, 717, 718,
    ])
  })

  for (const [dex, c] of Object.entries(RAID_CINEMAS))
    it(`#${dex}: a longer build-up than the shared one, its roar on the reveal, its cues in order`, () => {
      expect(c.reveal).toBeGreaterThan(2.75)
      expect(c.dur).toBeCloseTo(c.reveal + AFTER_REVEAL)
      const tl = c.make({ mon: `${dex}f`, w: 130, h: 282 })
      expect(tl.dur).toBe(c.dur)
      const cues = tl.cues(undefined as never) as Cue<unknown>[]
      const { times, heard } = play(cues)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(times.every((t) => t >= 0 && t <= c.dur)).toBe(true)
      expect(heard).toEqual(['roar'])
      const roar = cues.findIndex(([, fire]) => {
        let said = false
        fire({ beat: () => void (said = true) }, undefined)
        return said
      })
      expect(cues[roar]![0]).toBe(c.reveal)
    })
})

describe('the bosses’ cinematics', () => {
  it('has each finished mythical’s and boss’s fight', () => {
    expect(
      Object.keys(BOSS_CINEMAS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([151, 243, 244, 245, 251, 489, 490, 491, 492, 493, 494, 719, 720, 721, 801, 802, 807, 808])
  })

  for (const [dex, c] of Object.entries(BOSS_CINEMAS))
    it(`#${dex}: shows the foe, sends yours out and shows it, in that order, after the reveal and before it ends`, () => {
      const tl = c.makeBattle({
        own: '6b',
        foe: `${dex}f`,
        look: { aura: ['#ffffff', '#ffd0f0', '#e070d0', '#6a3aa0'], fx: 'psy', night: '#1a0a20' },
        name: 'Boss',
        level: 'Lv.65',
        types: 'PSYCHIC',
      })
      const cues = tl.cues(undefined as never) as Cue<unknown>[]
      const times = cues.map(([t]) => t)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      const order: [number, string][] = []
      for (const [t, fire] of cues) {
        const hud: Hud = {
          beat: (b) => void order.push([t, b]),
          show: (side, on) => void order.push([t, `show:${side}:${on}`]),
        }
        fire(hud, undefined)
      }
      expect(order.map(([, b]) => b)).toEqual(['show:foe:true', 'appeared', 'sendOut', 'show:own:true'])
      expect(order[0]![0]).toBeGreaterThan(c.reveal)
      expect(order[order.length - 1]![0]).toBeLessThan(tl.dur)
    })
})
