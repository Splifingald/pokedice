// The Gym Leaders' entrance (docs/68): its switch (Off by default, the admin alone, everyone); one film for all 18 gym
// types, each in its own colours with a real leader of that type as its sample; the leader revealed between 3.8 and
// 5 s and its lead thrown out (the HUD's one cue) after it. Migration 0141 puts the switch in Off, and seed.sql
// carries it.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
})

const { GYM_CINEMA_TYPES, gymCinemaFor, gymTheme } = await import('@/fx/timelines/cinema/gymLeader')
const { championAfter, sampleParams } = await import('@/fx/timelines/cinema/champion')
const { gymCinemaOn, gymTypeOf } = await import('@/engine')
const { makeData } = await import('./fixtures')
const { DAYBREAK_TYPES } = await import('@/theme/colors')
const trainers = (await import('@/data/trainers.json')).default as {
  name: string
  spriteUrl: string | null
  role: string
  team: { dex: number; level: number }[]
}[]
const pokemon = (await import('@/data/pokemon.json')).default as {
  dex: number
  type1: string
  type2: string | null
}[]
import type { Cue, Hud } from '@/fx/timeline'
import type { GameData, PokeType } from '@/engine/types'

describe('the switch', () => {
  it('is Off by default, then the admin alone, then everyone', () => {
    expect(gymCinemaOn(makeData())).toBe(false)
    const admin = makeData({ gymCinema: { access: 'admin' } })
    expect(gymCinemaOn(admin)).toBe(false)
    expect(gymCinemaOn({ ...admin, viewer: { admin: true } })).toBe(true)
    expect(gymCinemaOn(makeData({ gymCinema: { access: 'all' } }))).toBe(true)
  })
})

describe('one film, every type', () => {
  it('has all 18 types, each in its own colours', () => {
    const types = Object.keys(DAYBREAK_TYPES).filter((t) => t !== 'base')
    expect([...GYM_CINEMA_TYPES].sort()).toEqual(types.sort())
    const auras = new Set(GYM_CINEMA_TYPES.map((t) => gymTheme(t).aura[2]))
    expect(auras.size).toBe(18)
    for (const t of GYM_CINEMA_TYPES) expect(gymTheme(t).aura[2]).toBe(DAYBREAK_TYPES[t])
  })

  it('every Gym Leader in the game finds its type’s film', () => {
    const species = Object.fromEntries(pokemon.map((p) => [p.dex, p])) as unknown as GameData['species']
    const leaders = trainers.filter((t) => t.role === 'leader')
    expect(leaders.length).toBeGreaterThan(50)
    for (const l of leaders) {
      const type = gymTypeOf(l.name, l.team, { species })
      expect(type, l.name).not.toBeNull()
      expect(gymCinemaFor(type!).id).toBe(`gym-${type}`)
    }
  })

  for (const type of GYM_CINEMA_TYPES as PokeType[])
    it(`${type}: its sample a real leader of the type, revealed in time, its lead thrown out last`, () => {
      const c = gymCinemaFor(type)
      expect(gymCinemaFor(type)).toBe(c)
      expect(c.reveal).toBeGreaterThanOrEqual(3.8)
      expect(c.reveal).toBeLessThanOrEqual(5)
      expect(c.dur).toBeCloseTo(championAfter(c.reveal).dur)
      expect(existsSync(path.join('public', c.sample.trainer)), c.sample.trainer).toBe(true)
      const leader = trainers.find((t) => t.role === 'leader' && t.spriteUrl === c.sample.trainer)
      expect(leader, c.sample.trainer).toBeDefined()
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
    })
})

describe('0141: the switch in the database', () => {
  const ROOT = path.join(__dirname, '..', 'supabase')
  const FILE = '0141_gym_cinema.sql'
  const sql = readFileSync(path.join(ROOT, 'migrations', FILE), 'utf8')

  it('goes in Off, bumps the content version, and keeps the admin’s choice the second time', async () => {
    const db = new PGlite()
    const value = async (key: string) =>
      (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql)
    expect(await value('gymCinema')).toEqual({ access: 'off' })
    expect(await value('configVersion')).toBe(42)
    await db.exec(`update game_config set value = '{"access": "all"}' where key = 'gymCinema'`)
    await db.exec(sql)
    expect(await value('gymCinema')).toEqual({ access: 'all' })
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql.replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
