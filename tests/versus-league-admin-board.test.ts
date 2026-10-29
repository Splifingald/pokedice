// The admin's view of the league's groups (0086 versus_league_admin_board, docs/44 §5): the server's rows read into
// players and bots, and the week's totals the admin box shows. And the players' global board (0088, docs/44 §8).
import { describe, expect, it } from 'vitest'
import { leagueAdminTotals, parseLeagueAdminBoard, parseLeagueGlobal } from '@/lib/versusLeague'

const raw = {
  week: '2026-10-26',
  endsAt: '2026-11-02T00:00:00+00:00',
  opened: 1,
  closed: false,
  groups: [
    {
      n: 1,
      members: [
        {
          userId: '00000000-0000-4000-8000-000000000001',
          botId: null,
          name: 'ASH',
          avatar: 'red',
          team: [{ dex: 25, level: 50, shiny: false }],
          trophies: 40,
          rank: 1,
          botTarget: null,
          joinedAt: '2026-10-26T08:00:00+00:00',
          matches: 5,
          won: 3,
          lost: 1,
          leaves: 0,
          open: 1,
          lastMatchAt: '2026-10-28T20:00:00+00:00',
          faced: 2,
        },
        {
          userId: null,
          botId: 7,
          name: 'Gengar50',
          avatar: 'red',
          team: [],
          trophies: 13,
          rank: 2,
          botTarget: 180,
          joinedAt: '2026-10-28T00:00:00+00:00',
          matches: 0,
          won: 0,
          lost: 0,
          leaves: 0,
          open: 0,
          lastMatchAt: null,
          faced: 4,
        },
      ],
    },
    {
      n: 2,
      members: [
        {
          userId: '00000000-0000-4000-8000-000000000002',
          botId: null,
          name: 'MISTY',
          avatar: 'red',
          team: [],
          trophies: 0,
          rank: 1,
          joinedAt: '2026-10-27T08:00:00+00:00',
          matches: 0,
          lastMatchAt: null,
        },
      ],
    },
  ],
}

describe('the admin board of the league', () => {
  it('reads players and bots, their matches and times', () => {
    const b = parseLeagueAdminBoard(raw)
    expect(b.week).toBe('2026-10-26')
    expect(b.endsAt).toBe(Date.parse('2026-11-02T00:00:00Z'))
    expect(b.opened).toBe(1)
    const [ash, bot] = b.groups[0]!.members
    expect(ash).toMatchObject({ name: 'ASH', botId: null, matches: 5, open: 1, faced: 2 })
    expect(ash!.lastMatchAt).toBe(Date.parse('2026-10-28T20:00:00Z'))
    expect(bot).toMatchObject({ userId: null, botId: 7, botTarget: 180, lastMatchAt: null })
    // What the server leaves out reads as nothing.
    expect(b.groups[1]!.members[0]).toMatchObject({ won: 0, leaves: 0, botTarget: null, faced: 0 })
  })

  it('counts the week: groups, players and bots, who fought, and the matches', () => {
    expect(leagueAdminTotals(parseLeagueAdminBoard(raw))).toEqual({
      groups: 2,
      members: 3,
      players: 2,
      bots: 1,
      fought: 1,
      matches: 5,
      open: 1,
    })
  })

  it('reads an empty or missing answer as no group', () => {
    expect(parseLeagueAdminBoard(null).groups).toEqual([])
    expect(leagueAdminTotals(parseLeagueAdminBoard({ week: '2026-10-26', groups: [] }))).toMatchObject({
      groups: 0,
      members: 0,
    })
  })
})

describe('the global board (0088)', () => {
  it('reads every player of the week, ranked, with no bot mark', () => {
    const g = parseLeagueGlobal({
      week: '2026-10-26',
      endsAt: '2026-11-02T00:00:00+00:00',
      rows: [
        {
          id: 'a',
          isMe: true,
          name: 'ASH',
          avatar: 'red',
          team: [{ dex: 25 }],
          trophies: 150,
          rank: 1,
          rich: false,
        },
        { id: 'b', isMe: false, name: '', avatar: null, team: null, trophies: 150, rank: 1, rich: true },
      ],
    })
    expect(g.week).toBe('2026-10-26')
    expect(g.endsAt).toBe(Date.parse('2026-11-02T00:00:00Z'))
    expect(g.rows.map((r) => [r.name, r.rank, r.isMe, r.rich, r.bot])).toEqual([
      ['ASH', 1, true, false, null],
      ['Trainer', 1, false, true, null],
    ])
    expect(g.rows[0]!.team).toEqual([{ dex: 25, level: 50, shiny: false }])
    expect(parseLeagueGlobal(null).rows).toEqual([])
  })
})
