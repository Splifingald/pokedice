// Leaderboard ranking: each tab sorts by its own measure, ties share a rank, and SQL rows are parsed defensively.
import { describe, expect, it } from 'vitest'
import { boardWindow, friendsOnly, frontierArea, parseLeaderboard, rankLeaderboard, splitLeaderboard, type BoardItem, type LeaderboardRow } from '@/lib/leaderboard'
import { leagueArea, regionSpecies, type GameData } from '@/engine'
import { data } from './fixtures'

const main = data.areas.filter((a) => !a.hidden && (a.regionId ?? 'kanto') === 'kanto')
const cleared = (n: number, gyms = 0) =>
  Object.fromEntries(main.slice(0, n).map((a, i) => [a.id, { cleared: true, gyms: i === 0 ? gyms : 0 }]))

const league = leagueArea(data, 'kanto')!.id
/** Every main area cleared, and `tiers` of the Elite Rebattle on the League's entry, as the card writer keeps it (0078). */
const rebattled = (tiers: number) => {
  const p = cleared(main.length)
  return { ...p, [league]: { ...p[league]!, ...(tiers > 0 && { rebattle: tiers }) } }
}

const row = (name: string, p: Partial<LeaderboardRow>): LeaderboardRow => ({
  region: 'kanto',
  isMe: false,
  name,
  avatar: 'red',
  team: [{ dex: 1, level: 5, shiny: false }],
  pokedex: 1,
  maxLevel: 5,
  shinies: 0,
  raidsWon: 0,
  progress: {},
  friendId: null,
  rich: false,
  ...p,
})

const rows = [
  row('Ash', { maxLevel: 30, pokedex: 20, shinies: 2, progress: cleared(3) }),
  row('Misty', { maxLevel: 45, pokedex: 12, shinies: 2, progress: cleared(2) }),
  row('Brock', { maxLevel: 30, pokedex: 60, shinies: 1, progress: cleared(3, 1) }),
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

  it('Shiny: most shinies caught first, the Pokédex breaks ties', () => {
    const r = rankLeaderboard(rows, 'shiny', data, 'kanto')
    expect(r.map((x) => [x.name, x.rank, x.score])).toEqual([
      ['Ash', 1, '2 shinies'],
      ['Misty', 2, '2 shinies'],
      ['Brock', 3, '1 shiny'],
    ])
  })

  it('exact ties share a rank', () => {
    const r = rankLeaderboard([row('A', {}), row('B', {}), row('C', { maxLevel: 2 })], 'level', data, 'kanto')
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3])
  })

  it('a player who cleared every main area is in the Hall of Fame', () => {
    expect(frontierArea(row('Red', { progress: cleared(main.length) }), data)).toBe('Hall of Fame')
    expect(frontierArea(row('New', {}), data)).toBe(main[0]!.name)
  })

  it('Progression: past the last area, Elite Rebattle tiers rank, and the tier being fought shows', () => {
    const r = rankLeaderboard(
      [row('Ash', { progress: cleared(main.length) }), row('Gold', { progress: rebattled(2) }), row('Blue', { progress: cleared(3) })],
      'progress',
      data,
      'kanto',
    )
    expect(r.map((x) => [x.name, x.rank, x.score])).toEqual([
      ['Gold', 1, 'Elite Rebattle · Gold'],
      ['Ash', 2, 'Elite Rebattle · Bronze'],
      ['Blue', 3, main[3]!.name],
    ])
  })

  it('Progression: with the rebattle off, the board ends at the last area as before', () => {
    const off: GameData = {
      ...data,
      config: { ...data.config, events: { ...data.config.events, rebattle: { ...data.config.events.rebattle, access: 'off' } } },
    }
    const r = rankLeaderboard([row('Ash', { progress: cleared(main.length) }), row('Gold', { progress: rebattled(2) })], 'progress', off, 'kanto')
    expect(r.map((x) => [x.name, x.rank, x.score])).toEqual([
      ['Ash', 1, 'Hall of Fame'],
      ['Gold', 1, 'Hall of Fame'],
    ])
    expect(splitLeaderboard(r, 'progress', off, 'kanto').hall.map((x) => x.name)).toEqual(['Ash', 'Gold'])
  })
})

describe('splitLeaderboard', () => {
  const capped = row('Red', { maxLevel: data.config.maxLevel, pokedex: 5, progress: cleared(1) })
  const dexDone = row('Blue', { pokedex: regionSpecies(data, 'kanto').size, maxLevel: 40 })
  const champ = row('Green', { progress: rebattled(4), maxLevel: 40, pokedex: 5 })
  // Every area cleared, but the rebattle's Diamond tier still to win: still on the board.
  const almost = row('Silver', { progress: rebattled(3), maxLevel: 40, pokedex: 5 })
  const all = [...rows, capped, dexDone, champ, almost]

  it('sends whoever maxed the tab out to the Hall of Fame, and closes the ranking up', () => {
    const { board, hall } = splitLeaderboard(all, 'level', data, 'kanto')
    expect(hall.map((x) => x.name)).toEqual(['Red'])
    expect(board.map((x) => x.name)).not.toContain('Red')
    // The board still ranks from 1 with nobody missing in the middle.
    expect(board.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('each tab has its own maximum', () => {
    expect(splitLeaderboard(all, 'dex', data, 'kanto').hall.map((x) => x.name)).toEqual(['Blue'])
    // Clearing the region also fills its Pokédex measure for nobody but the one who cleared it.
    // Progression's Hall of Fame wants every area and every rebattle tier.
    const progress = splitLeaderboard(all, 'progress', data, 'kanto')
    expect(progress.hall.map((x) => x.name)).toEqual(['Green'])
    expect(progress.board[0]!.name).toBe('Silver')
    // Shinies have no ceiling: everyone stays on the board.
    expect(splitLeaderboard(all, 'shiny', data, 'kanto').hall).toEqual([])
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
    // …and one from a database without 0032 has no shinies, without 0033 no friends, without 0035 no raids, without
    // 0049 no golden name.
    expect(r).toEqual({ region: 'kanto', isMe: false, name: 'Trainer', avatar: 'red', team: [], pokedex: 0, maxLevel: 12, shinies: 0, raidsWon: 0, progress: { x: { cleared: true, gyms: 0 } }, friendId: null, rich: false })
  })

  it("reads the League's rebattle tiers (0078), leaving them out where there are none", () => {
    const [r] = parseLeaderboard([
      { region: 'kanto', is_me: false, name: 'A', character: 'red', team: [], pokedex: 1, max_level: 5, progress: { l: { cleared: true, gyms: 5, rebattle: 2 }, x: { cleared: true, rebattle: 0 } } },
    ])
    expect(r!.progress).toEqual({ l: { cleared: true, gyms: 5, rebattle: 2 }, x: { cleared: true, gyms: 0 } })
  })

  it('carries the golden name the server sends', () => {
    const base = { region: 'kanto', is_me: false, name: 'A', character: 'red', team: [], pokedex: 1, max_level: 5, progress: {} }
    expect(parseLeaderboard([{ ...base, rich: true }, { ...base, rich: null }]).map((r) => r.rich)).toEqual([true, false])
  })

  it('keeps a look from the list and nothing else', () => {
    const base = { region: 'kanto', is_me: false, name: 'A', team: [], pokedex: 1, max_level: 5, progress: {} }
    const looks = parseLeaderboard(['green', 'johto/silver', 'kanto/youngster', 'kanto/champion-brock', '../../evil', null].map((character) => ({ ...base, character })))
    expect(looks.map((r) => r.avatar)).toEqual(['green', 'johto/silver', 'kanto/youngster', 'red', 'red', 'red'])
  })
})

describe('friends on the board (docs/16)', () => {
  it('reads is_friend and friend_id, and nobody is a friend on a database without 0033', () => {
    const [friend, stranger, old] = parseLeaderboard([
      { region: 'kanto', is_me: false, name: 'Misty', character: 'green', team: [], pokedex: 1, max_level: 5, progress: {}, is_friend: true, friend_id: 'u-misty' },
      { region: 'kanto', is_me: false, name: 'Brock', character: 'red', team: [], pokedex: 1, max_level: 5, progress: {}, is_friend: false, friend_id: null },
      { region: 'kanto', is_me: false, name: 'Gary', character: 'red', team: [], pokedex: 1, max_level: 5, progress: {} },
    ])
    expect(friend!.friendId).toBe('u-misty')
    expect(stranger!.friendId).toBeNull()
    expect(old!.friendId).toBeNull()
  })

  it('keeps you and your friends, with the ranks of the whole board', () => {
    const board = rankLeaderboard(
      [
        row('Blue', { maxLevel: 40 }),
        row('Misty', { maxLevel: 30, friendId: 'u-misty' }),
        row('Erika', { maxLevel: 20 }),
        row('Ash', { maxLevel: 10, isMe: true }),
      ],
      'level',
      data,
      'kanto',
    )
    expect(friendsOnly(board).map((r) => [r.name, r.rank])).toEqual([
      ['Misty', 2],
      ['Ash', 4],
    ])
  })
})

describe('the Raids tab', () => {
  it('ranks by raids won, a count with no Hall of Fame, and parses it from the board', () => {
    const rows = [row('Ash', { raidsWon: 2 }), row('Gary', { raidsWon: 5 }), row('Misty', { raidsWon: 2, pokedex: 9 })]
    const ranked = rankLeaderboard(rows, 'raids', data, 'kanto')
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['Gary', 1],
      ['Misty', 2],
      ['Ash', 3],
    ])
    expect(ranked[0]!.score).toBe('5 raids won')
    expect(splitLeaderboard(rows, 'raids', data, 'kanto').hall).toEqual([])
    const parsed = parseLeaderboard([
      { region: 'kanto', is_me: false, name: 'Gary', character: 'green', team: [], pokedex: 1, max_level: 5, progress: {}, raids_won: 3 },
      { region: 'kanto', is_me: false, name: 'Old', character: 'red', team: [], pokedex: 1, max_level: 5, progress: {} },
    ])
    expect(parsed.map((r) => r.raidsWon)).toEqual([3, 0])
  })
})

describe('Shiny and Raids span every region (0054)', () => {
  // Ash plays Johto and has a Kanto row too; Misty is on the Johto board only.
  const rows = [
    row('Ash', { region: 'johto', lead: true, shinies: 5, raidsWon: 1 }),
    row('Ash', { region: 'kanto', lead: false, shinies: 5, raidsWon: 1 }),
    row('Misty', { region: 'johto', lead: true, shinies: 2, raidsWon: 3 }),
    row('Brock', { region: 'kanto', lead: true, shinies: 3, raidsWon: 0 }),
  ]

  it('ranks each trainer once, the same board from any region', () => {
    for (const region of ['kanto', 'johto']) {
      expect(rankLeaderboard(rows, 'shiny', data, region).map((r) => [r.name, r.rank])).toEqual([
        ['Ash', 1],
        ['Brock', 2],
        ['Misty', 3],
      ])
      // Brock has won no raid: he isn't on the Raids board.
      expect(splitLeaderboard(rows, 'raids', data, region).board.map((r) => r.name)).toEqual(['Misty', 'Ash'])
    }
  })

  it('leaves out whoever has no shiny, or no raid won, on that board only', () => {
    const more = [...rows, row('Gary', { region: 'kanto', lead: true, isMe: true, pokedex: 90 })]
    for (const tab of ['shiny', 'raids'] as const) {
      const { board, hall } = splitLeaderboard(more, tab, data, 'kanto')
      expect([...board, ...hall].map((r) => r.name)).not.toContain('Gary')
    }
    expect(rankLeaderboard(more, 'level', data, 'kanto').map((r) => r.name)).toContain('Gary')
    // The same on a database without 0054.
    const old = more.map(({ lead: _, ...r }) => r)
    expect(rankLeaderboard(old, 'raids', data, 'kanto').map((r) => r.name)).toEqual(['Ash'])
  })

  it('leaves the other boards per region', () => {
    expect(rankLeaderboard(rows, 'level', data, 'kanto').map((r) => r.name)).toEqual(['Ash', 'Brock'])
    expect(rankLeaderboard(rows, 'dex', data, 'johto').map((r) => r.name)).toEqual(['Ash', 'Misty'])
  })

  it('stays per region on a database without 0054', () => {
    const old = rows.map(({ lead: _, ...r }) => r)
    expect(rankLeaderboard(old, 'shiny', data, 'kanto').map((r) => r.name)).toEqual(['Ash', 'Brock'])
  })

  it('parses the lead row and the shinies of every region', () => {
    const base = { region: 'kanto', is_me: false, name: 'A', character: 'red', team: [], pokedex: 1, max_level: 5, progress: {} }
    const [lead, other, old] = parseLeaderboard([
      { ...base, shinies: 1, shinies_all: 4, lead: true },
      { ...base, shinies: 3, shinies_all: 4, lead: false },
      { ...base, shinies: 2 },
    ])
    expect([lead!.lead, lead!.shinies, other!.lead, other!.shinies]).toEqual([true, 4, false, 4])
    expect(old!.shinies).toBe(2)
    expect('lead' in old!).toBe(false)
  })
})

describe('boardWindow: the top 100, you with 10 either side, your friends', () => {
  // 300 trainers ranked 1..300: rank n is at index n - 1.
  const ranked = (me: number, friends: number[] = []) =>
    Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      isMe: i + 1 === me,
      friendId: friends.includes(i + 1) ? `f${i + 1}` : null,
    }))
  const shape = (items: BoardItem<{ rank: number }>[]) =>
    items.map((it) => ('gap' in it ? `…${it.gap}` : it.row.rank))
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

  it('keeps the top 100 and the 10 ahead of you and behind you, with their real ranks', () => {
    expect(shape(boardWindow(ranked(200)))).toEqual([...range(1, 100), '…89', ...range(190, 210), '…90'])
  })

  it('keeps every friend wherever they are', () => {
    expect(shape(boardWindow(ranked(200, [150, 299])))).toEqual([
      ...range(1, 100),
      '…49',
      150,
      '…39',
      ...range(190, 210),
      '…88',
      299,
      '…1',
    ])
  })

  it('needs no gap where you are near the top, and cuts at 100 when you aren\'t on the board', () => {
    expect(shape(boardWindow(ranked(105)))).toEqual([...range(1, 115), '…185'])
    expect(shape(boardWindow(ranked(0)))).toEqual([...range(1, 100), '…200'])
    expect(shape(boardWindow(ranked(300)))).toEqual([...range(1, 100), '…189', ...range(290, 300)])
  })

  it('shows a short board whole', () => {
    expect(boardWindow(ranked(50).slice(0, 80)).every((it) => 'row' in it)).toBe(true)
  })

  it('keeps nobody around you with around = 0 (Versus global): the top 100, you and your friends', () => {
    expect(shape(boardWindow(ranked(200, [150, 299]), 0))).toEqual([
      ...range(1, 100),
      '…49',
      150,
      '…49',
      200,
      '…98',
      299,
      '…1',
    ])
    expect(shape(boardWindow(ranked(101), 0))).toEqual([...range(1, 101), '…199'])
    expect(shape(boardWindow(ranked(50), 0))).toEqual([...range(1, 100), '…200'])
  })
})
