// The champions' own cinematics (docs/56): their switch (Off by default, the admin alone, everyone); every champion in
// the game's data, every version of it, finds its scene by its picture (a Kanto rival's Red or Green too); each scene
// reveals its champion between 3.8 and 5 s and ends with its lead thrown out (the HUD's one cue), after the reveal.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
})

const { CHAMPION_CINEMAS, championCinemaFor, championSceneId } =
  await import('@/fx/timelines/cinema/champions')
const { championAfter, sampleParams } = await import('@/fx/timelines/cinema/champion')
const { championCinemaOn } = await import('@/engine')
const { makeData } = await import('./fixtures')
const trainers = (await import('@/data/trainers.json')).default as {
  name: string
  spriteUrl: string | null
  role: string
}[]
import type { Cue, Hud } from '@/fx/timeline'

describe('the switch', () => {
  it('is Off by default, then the admin alone, then everyone', () => {
    expect(championCinemaOn(makeData())).toBe(false)
    const admin = makeData({ championCinema: { access: 'admin' } })
    expect(championCinemaOn(admin)).toBe(false)
    expect(championCinemaOn({ ...admin, viewer: { admin: true } })).toBe(true)
    expect(championCinemaOn(makeData({ championCinema: { access: 'all' } }))).toBe(true)
  })
})

describe('which scene a champion gets', () => {
  it('goes by the picture: every version of a champion alike, a Kanto rival as Kanto’s champion', () => {
    expect(championSceneId('/trainers/classes/johto/champion-lance.png')).toBe('lance')
    expect(championSceneId('/trainers/classes/blue-3.png')).toBe('blue')
    expect(championSceneId('/characters/green.png')).toBe('blue')
    expect(championSceneId('/characters/red.png')).toBe('blue')
    expect(championSceneId('/trainers/classes/johto/red.png')).toBe('red')
    expect(championSceneId('/trainers/classes/unova/cynthia.png')).toBe('cynthia')
    expect(championSceneId(null)).toBeNull()
    expect(championCinemaFor('/trainers/classes/youngster.png')).toBeUndefined()
    expect(championCinemaFor('/trainers/classes/constructor.png')).toBeUndefined()
  })

  it('has a scene for every champion in the game', () => {
    const pictures = [...new Set(trainers.filter((t) => t.role === 'champion').map((t) => t.spriteUrl))]
    expect(pictures.length).toBeGreaterThan(10)
    for (const url of pictures) expect(championCinemaFor(url), `${url}`).toBeDefined()
  })
})

describe('the champions’ cinematics', () => {
  it('has each champion’s', () => {
    expect(Object.keys(CHAMPION_CINEMAS).sort()).toEqual(
      [
        'blue',
        'cynthia',
        'diantha',
        'geeta',
        'ghetsis',
        'kieran',
        'kukui',
        'lance',
        'leon',
        'nemona',
        'palmer',
        'red',
        'steven',
        'wallace',
      ].sort(),
    )
  })

  for (const [id, c] of Object.entries(CHAMPION_CINEMAS))
    it(`${id}: its champion revealed in time, its sample real, its lead thrown out last`, () => {
      expect(c.id).toBe(id)
      expect(c.reveal).toBeGreaterThanOrEqual(3.8)
      expect(c.reveal).toBeLessThanOrEqual(5)
      expect(c.dur).toBeCloseTo(championAfter(c.reveal).dur)
      expect(existsSync(path.join('public', c.sample.trainer)), c.sample.trainer).toBe(true)
      expect(championCinemaFor(c.sample.trainer)).toBe(c)
      const tl = c.makeBattle(sampleParams(c.sample))
      expect(tl.dur).toBe(c.dur)
      const cues = tl.cues(undefined as never) as Cue<unknown>[]
      const times = cues.map(([t]) => t)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(times.every((t) => t >= 0 && t <= c.dur)).toBe(true)
      const heard: [number, string][] = []
      for (const [t, fire] of cues) {
        const hud: Hud = {
          beat: (b) => void heard.push([t, b]),
          show: (side, on) => void heard.push([t, `show:${side}:${on}`]),
        }
        fire(hud, undefined)
      }
      expect(heard.map(([, b]) => b)).toEqual(['show:foe:true'])
      expect(heard[0]![0]).toBeGreaterThan(c.reveal)
      expect(heard[0]![0]).toBeLessThan(c.dur)
    })
})
