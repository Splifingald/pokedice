// Friendship streaks and the Friend Market (docs/57): the tiers and what a streak day pays (as the server's
// friendship_coins_for), where a streak stands on a day, the market's week, its shiny of the week (as the server's
// friendship_shiny), its shelf and limits, purchases put in the save once, the rules, an Egg with a friend's Pokémon
// queued for the server, and the Home notice.
import { describe, expect, it } from 'vitest'
import {
  applyMarketBuys,
  clearEggReports,
  createInstance,
  createRng,
  DEFAULT_CONFIG,
  friendshipCap,
  friendshipOf,
  friendshipRulesDue,
  friendshipTiers,
  friendshipWaits,
  homeNotices,
  markFriendshipRulesSeen,
  marketQtys,
  marketRows,
  marketShiny,
  marketWeek,
  marketWeekEnds,
  marketWhy,
  newSave,
  nextStreakDay,
  processDayCare,
  queueEggReport,
  rushEgg,
  streakCoins,
  streakState,
  streakTier,
  type FriendStreak,
  type GameData,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, makeData, newId } from '../fixtures'

const on = (patch: Partial<GameData['config']['friendship']> = {}): GameData =>
  makeData({ friendship: { ...DEFAULT_CONFIG.friendship, access: 'all', ...patch } })
const ON = on()
const fresh = (): SaveData => newSave(4, data, 0, newId)
const s = (streak: number, lastDay: string): FriendStreak => ({
  friend: 'f',
  streak,
  best: streak,
  lastDay,
  lastKind: 'trade',
})

describe('the streak', () => {
  it('pays by its tier: 3 on days 1–3, 4 on 4–7, 5 on 8–14, 6 on 15–30, 7 from 31', () => {
    const pay = [1, 2, 3, 4, 7, 8, 14, 15, 30, 31, 365].map((n) => streakCoins(n, ON))
    expect(pay).toEqual([3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7])
    expect(streakCoins(0, ON)).toBe(0)
    expect(friendshipCap(ON)).toBe(50)
  })

  it('names the tier and the next one', () => {
    expect(streakTier(5, ON)).toEqual({ level: 1, coins: 4, next: { from: 8, coins: 5 }, toNext: 3 })
    expect(streakTier(40, ON)).toMatchObject({ level: 4, coins: 7, next: null, toNext: 0 })
  })

  it('cleans the admin’s tiers', () => {
    const d = on({
      tiers: [
        { from: 10, coins: 9 },
        { from: 1, coins: 2 },
        { from: 10, coins: 1 },
        { from: 0, coins: 5 },
        { from: 3, coins: 500 },
      ],
    })
    expect(friendshipTiers(d)).toEqual([
      { from: 1, coins: 2 },
      { from: 10, coins: 9 },
    ])
  })

  it('is kept today, waiting from yesterday, lost after a whole day', () => {
    expect(streakState(s(4, '2026-11-04'), '2026-11-04')).toBe('kept')
    expect(streakState(s(4, '2026-11-03'), '2026-11-04')).toBe('waiting')
    expect(streakState(s(4, '2026-11-02'), '2026-11-04')).toBe('lost')
    expect(streakState(undefined, '2026-11-04')).toBe('lost')
  })

  it('says what the next interaction pays: the next day, or day 1 again', () => {
    expect(nextStreakDay(s(3, '2026-11-03'), '2026-11-04', ON)).toEqual({ streak: 4, coins: 4 })
    expect(nextStreakDay(s(30, '2026-11-01'), '2026-11-04', ON)).toEqual({ streak: 1, coins: 3 })
    expect(nextStreakDay(s(3, '2026-11-04'), '2026-11-04', ON)).toBeNull()
  })
})

describe('the market', () => {
  it('turns over on Mondays (UTC)', () => {
    expect(marketWeek('2026-11-01')).toBe('2026-10-26') // a Sunday
    expect(marketWeek('2026-11-02')).toBe('2026-11-02') // a Monday
    expect(new Date(marketWeekEnds('2026-11-02')).toISOString()).toBe('2026-11-09T00:00:00.000Z')
  })

  it('draws the shiny of the week from the pool, a species a week, as the server', () => {
    const pool = DEFAULT_CONFIG.friendship.shiny.pool
    expect(marketShiny('1970-01-05', ON)).toBe(pool[0])
    expect(marketShiny('1970-01-12', ON)).toBe(pool[1])
    const weeks = Array.from({ length: pool.length }, (_, i) =>
      marketShiny(new Date(Date.parse('2026-11-02') + i * 7 * 86_400_000).toISOString().slice(0, 10), ON),
    )
    expect(new Set(weeks).size).toBe(pool.length)
    expect(marketShiny('2026-11-02', on({ shiny: { price: 1, level: 1, pool: [] } }))).toBeNull()
  })

  it('lays out the shelf: the shiny first, then the items, with what’s left', () => {
    const rows = marketRows(ON, '2026-11-02', { 'rare-candy': 8, shiny: 1 })
    expect(rows.map((r) => r.key)).toEqual(['shiny', 'friend-ball', 'rare-candy', 'talent-candy'])
    expect(rows[0]).toMatchObject({ kind: 'pokemon', price: 150, left: 0, level: 15 })
    expect(rows[2]).toMatchObject({ price: 15, limit: 10, left: 2 })
    expect(marketQtys(rows[2]!)).toEqual([1])
    expect(marketQtys(rows[1]!)).toEqual([1, 5, 10])
    expect(marketWhy(rows[0]!, 999)).toBe('soldOut')
    expect(marketWhy(rows[2]!, 14)).toBe('tooPoor')
    expect(marketWhy(rows[2]!, 30, 2)).toBeNull()
  })

  it('puts a purchase in the save once, wherever the gifts land', () => {
    const save = fresh()
    const buy = { id: 'b1', gifts: [{ kind: 'item', key: 'friend-ball', qty: 5, region: 'latest' }] }
    const res = applyMarketBuys(save, ON, [buy], 0, newId)!
    expect(res.save.inventory['friend-ball']).toBe(5)
    expect(friendshipOf(res.save).applied).toEqual(['b1'])
    expect(applyMarketBuys(res.save, ON, [buy], 0, newId)).toBeNull()
    const shiny = applyMarketBuys(
      save,
      ON,
      [{ id: 'b2', gifts: [{ kind: 'pokemon', dex: 175, level: 15, shiny: true, region: 'latest' }] }],
      0,
      newId,
    )!
    expect(shiny.save.box.find((p) => p.dex === 175)).toMatchObject({ level: 15, shiny: true })
  })

  it('waits in Extreme mode and while switched off', () => {
    expect(friendshipWaits(fresh(), ON)).toBeNull()
    expect(friendshipWaits(fresh(), on({ access: 'off' }))).toBe('off')
    expect(friendshipWaits({ ...fresh(), mode: 'extreme' } as SaveData, ON)).toBe('extreme')
  })
})

describe('the save', () => {
  it('reads the rules once, and the save keeps it', () => {
    const save = fresh()
    expect(friendshipRulesDue(save, ON)).toBe(true)
    expect(friendshipRulesDue(save, on({ access: 'off' }))).toBe(false)
    const seen = markFriendshipRulesSeen(save)!
    expect(friendshipRulesDue(seen, ON)).toBe(false)
    expect(markFriendshipRulesSeen(seen)).toBeNull()
    const back = parseSave(
      JSON.parse(
        JSON.stringify({ ...seen, friendship: { ...seen.friendship, applied: ['b1'], eggs: ['u1'] } }),
      ),
    )
    expect(back.ok && back.save.friendship).toEqual({ rulesSeen: true, applied: ['b1'], eggs: ['u1'] })
  })

  it('announces itself on Home for an account, until the rules are read', () => {
    expect(homeNotices(fresh(), ON, { signedIn: true })).toContain('friendship')
    expect(homeNotices(fresh(), ON, { signedIn: false })).not.toContain('friendship')
    expect(homeNotices(markFriendshipRulesSeen(fresh())!, ON, { signedIn: true })).not.toContain('friendship')
  })

  it('queues Eggs with friends for the server, each friend once', () => {
    let save = queueEggReport(fresh(), 'u1')
    save = queueEggReport(save, 'u2')
    save = queueEggReport(save, 'u1')
    expect(friendshipOf(save).eggs).toEqual(['u2', 'u1'])
    expect(friendshipOf(clearEggReports(save, ['u1', 'u2'])!).eggs).toBeUndefined()
  })

  it('an Egg made with a friend’s Pokémon is queued; with your own pair, nothing', () => {
    const HOUR = 3_600_000
    const base = fresh()
    const s0: SaveData = {
      ...base,
      gold: 10_000,
      pokedex: Array.from({ length: data.config.dayCare.unlockPokedex }, (_, i) => i + 1),
      dayCare: {
        residents: [{ inst: createInstance(133, 20, data, 'r0', 0), since: 0, region: 'kanto' }],
        guests: [
          {
            owner: 'friend-1',
            ownerName: 'Lea',
            ownerAvatar: 'red',
            inst: 'g0',
            dex: 135,
            level: 30,
            addedAt: 0,
          },
        ],
        eggClaimed: true,
      },
    }
    const rushed = rushEgg(s0, ON, 1000 * HOUR, createRng(3))
    expect('save' in rushed && friendshipOf(rushed.save).eggs).toEqual(['friend-1'])
    expect('save' in rushed && rushed.save.dayCare?.egg?.parents?.find((p) => p.owner)).toMatchObject({
      ownerId: 'friend-1',
    })
    const off = rushEgg(s0, on({ access: 'off' }), 1000 * HOUR, createRng(3))
    expect('save' in off && friendshipOf(off.save).eggs).toBeUndefined()
    // The clocks: an Egg left in the background is queued too.
    const started = processDayCare(s0, ON, 0, createRng(3)).save
    const later = processDayCare(started, ON, 1000 * HOUR, createRng(3))
    expect(later.laid).toBe(true)
    expect(friendshipOf(later.save).eggs).toEqual(['friend-1'])
  })
})
