// Leaderboard ranking: each tab sorts by its own measure, ties share a rank, and SQL rows are parsed defensively.
import { describe, expect, it } from 'vitest'
import { frontierArea, parseLeaderboard, rankLeaderboard, type LeaderboardRow } from '@/lib/leaderboard'
import { regionSpecies } from '@/engine'
import { data } from './fixtures'

const main = data.areas.filter((a) => !a.hidden && (a.regionId ?? 'kanto') === 'kanto')
const cleared = (n: number, gyms = 0) =>
  Object.fromEntries(main.slice(0, n).map((a, i) => [a.id, { cleared: true, gyms: i === 0 ? gyms : 0 }]))

const row = (name: string, p: Partial<LeaderboardRow>): LeaderboardRow => ({
  region: 'kanto',
  isMe: false,
  name,
  character: 'red',
  team: [{ dex: 1, level: 5, shiny: false }],
  pokedex: 1,
  maxLevel: 5,
  progress: {},
  ...p,
})

const rows = [
  row('Ash', { maxLevel: 30, pokedex: 20, progress: cleared(3) }),
  row('Misty', { maxLevel: 45, pokedex: 12, progress: cleared(2) }),
  row('Brock', { maxLevel: 30, pokedex: 60, progress: cleared(3, 1) }),
]

describe('rankLeaderboard', () => {
  it('Max level: best level first, progress breaks ties', () => {
    const r = rankLeaderboard(rows, 'level', data, 'kanto')
    expect(r.map((x) => [x.name, x.rank, x.score])).toEqual([
      ['Misty', 1, 'Lv.45'],
      ['Brock', 2, 'Lv.30'],
      ['Ash', 3, 'Lv.30'],
    ])
  })

  it('Progression: areas cleared, then gym battles won; shows the area being worked on', () => {
    const r = rankLeaderboard(rows, 'progress', data, 'kanto')
    expect(r.map((x) => x.name)).toEqual(['Brock', 'Ash', 'Misty'])
    expect(r[0]!.score).toBe(main[3]!.name)
  })

  it("Pokédex: most species first, scored out of what the region actually holds", () => {
    const r = rankLeaderboard(rows, 'dex', data, 'kanto')
    expect(r.map((x) => x.name)).toEqual(['Brock', 'Ash', 'Misty'])
    // Out of Kanto's own species, not the National Dex — a Johto board counts Johto's.
    expect(r[0]!.score).toBe(`60/${regionSpecies(data, 'kanto').size}`)
  })

  it('exact ties share a rank', () => {
    const r = rankLeaderboard([row('A', {}), row('B', {}), row('C', { maxLevel: 2 })], 'level', data, 'kanto')
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3])
  })

  it('a player who cleared every main area is in the Hall of Fame', () => {
    expect(frontierArea(row('Red', { progress: cleared(main.length) }), data)).toBe('Hall of Fame')
    expect(frontierArea(row('New', {}), data)).toBe(main[0]!.name)
  })
})

describe('parseLeaderboard', () => {
  it('fills gaps from the SQL rows', () => {
    const [r] = parseLeaderboard([
      { region: null, is_me: null, name: null, character: 'purple', team: null, pokedex: null, max_level: 12, progress: { x: { cleared: true } } },
    ])
    // A row from a database that predates regions reads as Kanto.
    expect(r).toEqual({ region: 'kanto', isMe: false, name: 'Trainer', character: 'red', team: [], pokedex: 0, maxLevel: 12, progress: { x: { cleared: true, gyms: 0 } } })
  })
})
