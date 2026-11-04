// A rival's team matched to the player (docs/61 §5.5): the levels by the admin's mode (never stronger, always level,
// Pokémon for Pokémon), the species following the levels (by level, no further than the player's), and the rival's
// encounter carrying it while the switch is on. Off, the team is as written.
import { describe, expect, it } from 'vitest'
import {
  RIVAL_MATCH_DEFAULTS,
  compileGameData,
  dueRival,
  emptyProgress,
  matchLevels,
  matchRivalTeam,
  newSave,
  progressOf,
  rivalEncounter,
  rivalMatchConfig,
  rivalMatchOn,
  stageForLevel,
  stageIndex,
  type AreaProgress,
  type GameData,
  type RivalMatchConfig,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'

const base = compileGameData(BUNDLE)
const withConfig = (patch: Partial<GameData['config']>): GameData => ({
  ...base,
  config: { ...base.config, ...patch },
})
const rivals = { ...base.config.rivals, access: 'all' as const }
const match = (m: Partial<RivalMatchConfig> = {}) =>
  withConfig({ rivals, rivalMatch: { ...RIVAL_MATCH_DEFAULTS, access: 'all', ...m } })

let n = 0
const id = () => `id-${++n}`
const bridge = base.areas.find(
  (a) => a.name === 'Route 4 & Nugget Bridge' && (a.regionId ?? 'kanto') === 'kanto',
)!

/** A Bulbasaur player whose team stands at these levels (more Pokémon cloned from the starter), on Nugget Bridge. */
function playerAt(levels: number[], dex: number[] = []): SaveData {
  const s = newSave(1, base, 0, id)
  const starter = s.box[0]!
  const box = levels.map((level, i) => ({ ...starter, id: `m${i}`, level, dex: dex[i] ?? starter.dex }))
  const p: AreaProgress = {
    ...emptyProgress(),
    roundsDone: 1,
    deck: ['wild', 'trainer'],
    drawn: ['wild', 'wild'],
  }
  return {
    ...s,
    box,
    team: box.map((m) => m.id),
    currentAreaId: bridge.id,
    areaProgress: { ...s.areaProgress, [bridge.id]: p },
  }
}

const levels = (t: { level: number }[]) => t.map((m) => m.level)
const team = (...lv: number[]) => lv.map((level, i) => ({ dex: 1000 + i, level }))

describe('the switch and its choices', () => {
  it('is Off by default, the admin alone seeing it On for admin', () => {
    expect(rivalMatchOn(base)).toBe(false)
    expect(rivalMatchOn(match())).toBe(true)
    const admin = match({ access: 'admin' })
    expect(rivalMatchOn(admin)).toBe(false)
    expect(rivalMatchOn({ ...admin, viewer: { admin: true } } as GameData)).toBe(true)
  })

  it('keeps the defaults for a missing or odd choice', () => {
    expect(rivalMatchConfig(base)).toEqual(RIVAL_MATCH_DEFAULTS)
    const odd = withConfig({
      rivalMatch: { access: 'all', levels: 'nope' as never, margin: 99, stages: 'player' },
    })
    expect(rivalMatchConfig(odd)).toEqual({ access: 'all', levels: 'cap', margin: 20, stages: 'player' })
  })
})

describe('the levels', () => {
  const cfg = (levels: RivalMatchConfig['levels'], margin = 1) => ({ levels, margin })

  it('never stronger: a team above the player’s best + margin is scaled down by one ratio, a team within reach kept', () => {
    // The real-player level match's own example: 45/42/38/30/22 against a best of 30 → 31/29/26/21/15.
    expect(levels(matchLevels(team(45, 42, 38, 30, 22), [30, 12], cfg('cap'), 100))).toEqual([
      31, 29, 26, 21, 15,
    ])
    expect(levels(matchLevels(team(20, 18, 17), [25], cfg('cap'), 100))).toEqual([20, 18, 17])
  })

  it('always level: scaled up or down so the best is the player’s best + margin', () => {
    expect(levels(matchLevels(team(20, 18, 17), [14, 11, 9], cfg('mirror'), 100))).toEqual([15, 14, 13])
    expect(levels(matchLevels(team(20, 18, 17), [26, 25, 24], cfg('mirror'), 100))).toEqual([27, 24, 23])
    // A negative margin keeps the rival under the player; never past the max level, never under 1.
    expect(levels(matchLevels(team(20, 10), [10], cfg('mirror', -2), 100))).toEqual([8, 4])
    expect(levels(matchLevels(team(50, 2), [100], cfg('mirror', 5), 100))).toEqual([100, 4])
  })

  it('Pokémon for Pokémon: by rank, the team keeping its order, the extra ones at the player’s weakest', () => {
    // The lead (17) is the rival's weakest, so it takes the player's third: 9 + 1.
    expect(levels(matchLevels(team(17, 20, 18), [14, 11, 9], cfg('pairs'), 100))).toEqual([10, 15, 12])
    expect(levels(matchLevels(team(20, 18, 17, 16), [30, 12], cfg('pairs', 0), 100))).toEqual([
      30, 12, 12, 12,
    ])
  })

  it('as written, or no team to go by: as written', () => {
    expect(levels(matchLevels(team(20, 18), [5], cfg('asWritten'), 100))).toEqual([20, 18])
    expect(levels(matchLevels(team(20, 18), [], cfg('mirror'), 100))).toEqual([20, 18])
  })
})

describe('the evolution stages', () => {
  const s = playerAt([10])

  it('counts the forms before a species in its line', () => {
    expect([4, 5, 6].map((d) => stageIndex(base, d))).toEqual([0, 1, 2])
    expect(stageIndex(base, 26)).toBe(2) // Pichu, Pikachu, Raichu
  })

  it('brought down, goes back through the evolutions the new level undoes', () => {
    expect(stageForLevel(base, s, 6, 40, 20)).toBe(5) // Charizard → Charmeleon
    expect(stageForLevel(base, s, 6, 40, 10)).toBe(4) // → Charmander
    expect(stageForLevel(base, s, 6, 40, 38)).toBe(6)
    // A written Lv.12 Pikachu stays one at 10: its Pichu evolves at 30, an evolution the content never had.
    expect(stageForLevel(base, s, 25, 12, 10)).toBe(25)
    // A stone's evolution has no level to undo: Raichu stays Raichu.
    expect(stageForLevel(base, s, 26, 30, 5)).toBe(26)
  })

  it('raised, evolves along the level evolutions it reaches; stones wait', () => {
    expect(stageForLevel(base, s, 4, 18, 40)).toBe(6) // Charmander → Charizard
    expect(stageForLevel(base, s, 4, 10, 20)).toBe(5)
    expect(stageForLevel(base, s, 133, 10, 50)).toBe(133) // Eevee: stones only
    expect(stageForLevel(base, s, 6, 40, 40)).toBe(6)
  })
})

describe('the rival’s team (docs/61 §5.5)', () => {
  // Blue on Nugget Bridge, Bulbasaur's version: Pidgeotto 18, Abra 16, Charmeleon 19.
  const meetingOf = (s: SaveData, data: GameData) => dueRival(s, bridge, progressOf(s, bridge.id), data)!
  const side = { starterDex: 1, character: 'red' as const }

  it('is as written with the switch off', () => {
    const s = playerAt([8, 7])
    const enc = rivalEncounter(meetingOf(s, withConfig({ rivals })), withConfig({ rivals }), side, s)!
    expect(enc.kind === 'trainer' && enc.team).toEqual([
      { dex: 17, level: 18 },
      { dex: 63, level: 16 },
      { dex: 5, level: 19 },
    ])
    expect(enc.kind === 'trainer' && enc.matched).toBeFalsy()
  })

  it('never stronger, by level: a team at Lv.8 meets a Lv.9 rival, its Pokémon back to the stage of their levels', () => {
    const data = match()
    const s = playerAt([8, 7])
    const enc = rivalEncounter(meetingOf(s, data), data, side, s)!
    expect(enc.kind === 'trainer' && enc.team).toEqual([
      { dex: 16, level: 9 }, // Pidgeotto (Pidgey evolves at 18) → Pidgey
      { dex: 63, level: 8 },
      { dex: 4, level: 9 }, // Charmeleon (Charmander evolves at 16) → Charmander
    ])
    expect(enc.kind === 'trainer' && enc.matched).toBe(true)
  })

  it('always level: a player far ahead meets a rival ahead too, evolved by its level', () => {
    const data = match({ levels: 'mirror', margin: 0 })
    const s = playerAt([40, 38])
    const enc = rivalEncounter(meetingOf(s, data), data, side, s)!
    const t = enc.kind === 'trainer' ? enc.team : []
    expect(Math.max(...levels(t))).toBe(40)
    expect(t[0]).toEqual({ dex: 18, level: 38 }) // Pidgeotto → Pidgeot at 36
    expect(t[2]).toEqual({ dex: 6, level: 40 }) // Charmeleon → Charizard at 36
  })

  it('no further than the player’s: a team of first forms meets first forms, whatever their levels', () => {
    const data = match({ levels: 'asWritten', stages: 'player' })
    const s = playerAt([20, 20], [1, 4]) // Bulbasaur and Charmander
    const { team: t } = matchRivalTeam(
      [
        { dex: 17, level: 18 },
        { dex: 5, level: 19 },
      ],
      s,
      data,
    )
    expect(t).toEqual([
      { dex: 16, level: 18 },
      { dex: 4, level: 19 },
    ])
    // One Ivysaur on the team: the middle stages stay.
    const mid = playerAt([20, 20], [2, 4])
    expect(matchRivalTeam([{ dex: 6, level: 40 }], mid, data).team).toEqual([{ dex: 5, level: 40 }])
  })

  it('nothing changed: not said to be matched', () => {
    const data = match({ levels: 'cap', margin: 5 })
    const s = playerAt([30])
    expect(matchRivalTeam([{ dex: 17, level: 18 }], s, data)).toEqual({
      team: [{ dex: 17, level: 18 }],
      matched: false,
    })
  })
})
