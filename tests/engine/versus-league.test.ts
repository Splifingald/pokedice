import { describe, expect, it } from 'vitest'
import {
  applyGifts,
  botTierOf,
  buildBotTeam,
  createRng,
  isBallFor,
  leagueGifts,
  leagueGroupCount,
  leagueReward,
  newSave,
  opponentRange,
  rankLeague,
  simulateVersus,
  startVersus,
  teamCoverage,
  trophyChange,
  versusAutoMove,
  versusNextRound,
  versusPower,
  versusStanding,
  versusStep,
  VERSUS_LEAGUE_DEFAULTS as CFG,
  weekEndOf,
  weekId,
  weekStartOf,
  winTooFast,
  type VersusMatch,
  type VersusMon,
} from '@/engine'
import { data } from '../fixtures'

const side = (dexes: number[]): VersusMon[] => dexes.map((dex) => ({ dex, level: 50, shiny: false }))

describe('trophies', () => {
  it('a win gives by your Pokémon left, a loss takes by theirs, a leave the most, nothing under 100', () => {
    expect([1, 2, 3].map((left) => trophyChange('won', { left, foeLeft: 0 }, 0, CFG))).toEqual([3, 6, 10])
    expect([1, 2, 3].map((foeLeft) => trophyChange('lost', { left: 0, foeLeft }, 150, CFG))).toEqual([
      -3, -6, -10,
    ])
    expect(trophyChange('left', { left: 0, foeLeft: 0 }, 100, CFG)).toBe(-10)
    expect(trophyChange('lost', { left: 0, foeLeft: 3 }, 99, CFG)).toBe(0)
    expect(trophyChange('left', { left: 0, foeLeft: 0 }, 99, CFG)).toBe(0)
  })

  it('offers opponents within 15 % of your trophies, 30 at least', () => {
    expect(opponentRange(0, CFG)).toEqual([0, 30])
    expect(opponentRange(100, CFG)).toEqual([70, 130])
    expect(opponentRange(400, CFG)).toEqual([340, 460])
  })

  it('refuses a win too fast to have been played', () => {
    expect(winTooFast(4, 3, CFG)).toBe(true)
    expect(winTooFast(6, 20, CFG)).toBe(false)
    expect(winTooFast(6, 40, CFG)).toBe(true)
  })
})

describe('the week', () => {
  it('runs from Monday 00:00 to the next Monday, UTC', () => {
    const sunday = Date.UTC(2026, 9, 25, 23, 59, 59)
    const monday = Date.UTC(2026, 9, 26, 0, 0, 0)
    expect(weekId(sunday)).toBe('2026-10-19')
    expect(weekId(monday)).toBe('2026-10-26')
    expect(weekStartOf(Date.UTC(2026, 9, 29, 12))).toBe(monday)
    expect(weekEndOf(monday)).toBe(Date.UTC(2026, 10, 2))
  })

  it('opens groups for last week’s players, grown or shrunk with the Sundays, 16 a group', () => {
    expect(
      leagueGroupCount({ lastWeekPlayers: 1200, lastSunday: 300, sundayBefore: 300, teams: 0 }, CFG),
    ).toBe(75)
    expect(
      leagueGroupCount({ lastWeekPlayers: 1200, lastSunday: 330, sundayBefore: 300, teams: 0 }, CFG),
    ).toBe(83)
    // No league last week: everyone with a team.
    expect(leagueGroupCount({ lastWeekPlayers: 0, lastSunday: 0, sundayBefore: 0, teams: 40 }, CFG)).toBe(3)
    expect(leagueGroupCount({ lastWeekPlayers: 0, lastSunday: 0, sundayBefore: 0, teams: 0 }, CFG)).toBe(1)
  })
})

describe('the ranking and the rewards', () => {
  it('ranks by trophies, ties sharing their rank', () => {
    const ranked = rankLeague([
      { name: 'b', trophies: 30 },
      { name: 'a', trophies: 50 },
      { name: 'c', trophies: 30 },
      { name: 'd', trophies: 10 },
    ])
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ])
  })

  it('gives the top 10 their Raid Balls and Rare Candies', () => {
    expect([1, 2, 3, 4, 5, 6, 10, 11].map((r) => leagueReward(r, CFG))).toEqual([
      { raidBalls: 5, rareCandies: 10 },
      { raidBalls: 2, rareCandies: 5 },
      { raidBalls: 1, rareCandies: 3 },
      { raidBalls: 0, rareCandies: 3 },
      { raidBalls: 0, rareCandies: 3 },
      { raidBalls: 0, rareCandies: 1 },
      { raidBalls: 0, rareCandies: 1 },
      { raidBalls: 0, rareCandies: 0 },
    ])
  })

  it('sends ₽ a trophy and the rank’s items, to the region played when opened', () => {
    expect(leagueGifts(1, 120, CFG)).toEqual([
      { kind: 'gold', amount: 120, region: 'current' },
      { kind: 'item', key: 'raid-ball', qty: 5, region: 'current' },
      { kind: 'item', key: 'rare-candy', qty: 10, region: 'current' },
    ])
    expect(leagueGifts(15, 0, CFG)).toEqual([])
    const save = newSave(1, data, 0, () => 'starter')
    const r = applyGifts(save, data, 7, leagueGifts(2, 40, CFG), 0, () => 'x')!
    expect(r.save.gold).toBe(save.gold + 40)
    expect(r.save.inventory['raid-ball']).toBe(2)
    expect(r.landed.every((l) => l.region === (save.region ?? 'kanto') && !l.moved)).toBe(true)
  })
})

describe('the Raid Ball', () => {
  it('is thrown in raids alone, +5', () => {
    const ball = data.items['raid-ball']
    expect(ball?.effect).toEqual({ kind: 'ball', bonus: 5, raidOnly: true })
    expect(ball?.inShop).toBe(false)
    expect(isBallFor(ball, true)).toBe(true)
    expect(isBallFor(ball, false)).toBe(false)
    expect(isBallFor(data.items['ultra-ball'], false)).toBe(true)
    expect(isBallFor(data.items['potion'], true)).toBe(false)
  })
})

describe('the bots', () => {
  it('get stronger with trophies: a tier each from 0, 100, 250 and 500', () => {
    expect([0, 99, 100, 249, 250, 499, 500, 9999].map((t) => botTierOf(t, CFG))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ])
  })

  it('field three different Pokémon at Lv.50, with as many powers as their tier', () => {
    for (let tier = 0; tier < 4; tier++)
      for (let i = 0; i < 6; i++) {
        const { team, powers } = buildBotTeam(data, tier, createRng(tier * 100 + i))
        expect(team).toHaveLength(3)
        expect(new Set(team.map((m) => m.dex)).size).toBe(3)
        expect(team.every((m) => m.level === 50 && !data.species[m.dex]!.evolutions?.length)).toBe(true)
        const count = Number(powers.gems.length > 0) + Number(powers.gmax) + Number(powers.z)
        expect(count, `tier ${tier}`).toBeLessThanOrEqual(tier)
        expect(count, `tier ${tier}`).toBeGreaterThanOrEqual(tier - 1)
      }
  })

  it('pick for coverage and strength, more so as they climb', () => {
    const avg = (tier: number, f: (dexes: number[]) => number) => {
      let sum = 0
      for (let i = 0; i < 20; i++) sum += f(buildBotTeam(data, tier, createRng(i + 1)).team.map((m) => m.dex))
      return sum / 20
    }
    const cover = (d: number[]) => teamCoverage(data, d)
    const power = (d: number[]) => d.reduce((s, x) => s + versusPower(data, x), 0)
    expect(avg(3, cover)).toBeGreaterThan(avg(0, cover) - 0.5)
    expect(avg(3, power)).toBeGreaterThan(avg(2, power))
    expect(avg(2, power)).toBeGreaterThan(avg(0, power))
  })

  it('are the same for the same seed', () => {
    expect(buildBotTeam(data, 2, createRng(9))).toEqual(buildBotTeam(data, 2, createRng(9)))
  })
})

describe('a match fought step by step', () => {
  /** Plays a match out with the auto player, as the battle screen would on AUTO. */
  function autoPlay(m: VersusMatch): { match: VersusMatch; moves: number } {
    let match = m
    let moves = 0
    for (let guard = 0; guard < 20000 && !match.winner; guard++) {
      const move = versusAutoMove(match, data)
      match = move.match
      if (!move.events.length) {
        match = versusNextRound(match, data).match
        continue
      }
      for (const e of move.events) match = versusStep(match, e, data).match
      moves++
    }
    return { match, moves }
  }

  it('comes out as the auto fight does, for the same seed', () => {
    const a = side([6, 9, 3])
    const d = side([65, 68, 94])
    for (const seed of [1, 2, 3, 42]) {
      const { match } = autoPlay(startVersus(a, d, data, seed).match)
      expect(match.winner).toBe(simulateVersus(a, d, data, seed).winner)
    }
  })

  it('says how many Pokémon each side had left', () => {
    const { match } = autoPlay(startVersus(side([150, 150, 150]), side([10, 13, 16]), data, 5).match)
    expect(match.winner).toBe('attacker')
    const s = versusStanding(match)
    expect(s.foeLeft).toBe(0)
    expect(s.left).toBeGreaterThanOrEqual(1)
    const lost = autoPlay(startVersus(side([10, 13, 16]), side([150, 150, 150]), data, 5).match).match
    expect(lost.winner).toBe('defender')
    expect(versusStanding(lost)).toEqual({ left: 0, foeLeft: 3 })
  })

  it('takes no item and no running away', () => {
    const { match } = startVersus(side([6, 9, 3]), side([65, 68, 94]), data, 1)
    expect(versusStep(match, { t: 'USE_ITEM', key: 'potion' }, data).match).toBe(match)
    expect(versusStep(match, { t: 'RUN' }, data).match).toBe(match)
  })

  it('counts a forfeit as the defender’s win', () => {
    let { match } = startVersus(side([6, 9, 3]), side([65, 68, 94]), data, 1)
    while (match.state.phase !== 'player_roll' && match.state.phase !== 'player_switch') {
      const move = versusAutoMove(match, data)
      match = move.match
      for (const e of move.events) match = versusStep(match, e, data).match
    }
    match = versusStep(match, { t: 'FORFEIT' }, data).match
    match = versusNextRound(match, data).match
    expect(match.winner).toBe('defender')
  })
})
