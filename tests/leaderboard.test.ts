// Leaderboard ranking: each tab sorts by its own measure, ties share a rank, and SQL rows are parsed defensively.
import { describe, expect, it } from 'vitest'
import { frontierArea, parseLeaderboard, rankLeaderboard, splitLeaderboard, type LeaderboardRow } from '@/lib/leaderboard'
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

describe('splitLeaderboard', () => {
  const capped = row('Red', { maxLevel: data.config.maxLevel, pokedex: 5, progress: cleared(1) })
  const dexDone = row('Blue', { pokedex: regionSpecies(data, 'kanto').size, maxLevel: 40 })
  const champ = row('Green', { progress: cleared(main.length), maxLevel: 40, pokedex: 5 })
  const all = [...rows, capped, dexDone, champ]

  it('sends whoever maxed the tab out to the Hall of Fame, and closes the ranking up', () => {
    const { board, hall } = splitLeaderboard(all, 'level', data, 'kanto')
    expect(hall.map((x) => x.name)).toEqual(['Red'])
    expect(board.map((x) => x.name)).not.toContain('Red')
    // The board still ranks from 1 with nobody missing in the middle.
    expect(board.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it('each tab has its own maximum', () => {
    expect(splitLeaderboard(all, 'dex', data, 'kanto').hall.map((x) => x.name)).toEqual(['Blue'])
    // Clearing the region also fills its Pokédex measure for nobody but the one who cleared it.
    expect(splitLeaderboard(all, 'progress', data, 'kanto').hall.map((x) => x.name)).toEqual(['Green'])
  })

  it('is empty when nobody has finished, which is what hides the button', () => {
    expect(splitLeaderboard(rows, 'level', data, 'kanto').hall).toEqual([])
    expect(splitLeaderboard(rows, 'progress', data, 'kanto').hall).toEqual([])
    expect(splitLeaderboard(rows, 'dex', data, 'kanto').hall).toEqual([])
  })

  it('a board of nothing but finished players leaves the ranking empty', () => {
    const { board, hall } = splitLeaderboard([capped], 'level', data, 'kanto')
    expect(board).toEqual([])
    expect(hall.map((x) => x.score)).toEqual([`Lv.${data.config.maxLevel}`])
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
