// The one-time pop-ups' queue (engine/popups.ts, docs/15 §20): one at a time, only between fights, in one order, never
// on the page a pop-up leads to; the battle powers' rules no longer wait on the gifts' and Trick or Treat's.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  DEFAULT_CONFIG,
  giftRulesDue,
  inviteRulesDue,
  newSave,
  nextOneTimePopup,
  ONE_TIME_POPUPS,
  regionCaseOf,
  trickRulesDue,
  type GameData,
  type PopupContext,
  type RegionId,
  type SaveData,
} from '@/engine'
import { makeData } from '../fixtures'

const D = DEFAULT_CONFIG
/** Mega Evolution's rules, the gifts and Trick or Treat switched on for everyone. */
const on: GameData = makeData({
  megaEvolution: { ...D.megaEvolution, gems: { ...D.megaEvolution.gems, access: 'all' } },
  gifts: { ...D.gifts, access: 'all' },
  trickOrTreat: { ...D.trickOrTreat, access: 'all' },
})

let n = 0
const newId = () => `id${++n}`

/** Between fights on Home, signed out, Prof. Oak's invite already seen. */
const HOME: PopupContext = { calm: true, path: '/home', signedIn: false, now: null, shareSeen: true }

/** A save with the old tutorials and Versus's rules behind it, as most saves are. */
const start = (): SaveData => ({
  ...newSave(7, on, 1, newId),
  leaderboardVisited: true,
  versusRulesSeen: true,
})

/** The first `badges` badges of `region` won; another region than the one being played is parked. */
function withBadges(save: SaveData, region: RegionId, badges: number): SaveData {
  const progress: Record<string, { gymsDefeated: string[] }> = {}
  for (const b of regionCaseOf(on, region, [], false)!.badges.slice(0, badges)) {
    const p = progress[b.areaId] ?? { gymsDefeated: [] }
    progress[b.areaId] = { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] }
  }
  const block = { ...save, areaProgress: { ...save.areaProgress, ...progress } as SaveData['areaProgress'] }
  if (region === (save.region ?? 'kanto')) return block
  return { ...save, parked: { ...save.parked, [region]: { ...block, region: undefined } as never } }
}

/** Three Pokémon at Lv.50: Versus opens. */
const versusOpen = (save: SaveData): SaveData => {
  const mons = [1, 4, 7].map((dex) => createInstance(dex, 50, on, newId(), 1))
  return { ...save, box: [...save.box, ...mons], versusRulesSeen: false }
}

/** Twenty species caught: the Day Care opens, never visited. */
const dayCareOpen = (save: SaveData): SaveData => ({
  ...save,
  pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
})

/** Kalos's 3rd badge (Korrina's): Mega Evolution's rules are due, from the save being played in Kanto. */
const megaWon = (save: SaveData): SaveData => withBadges(save, 'kalos', 3)

describe('the one-time pop-ups queue', () => {
  it('keeps one order, from what you came back to, to the question about notifications', () => {
    expect(ONE_TIME_POPUPS).toEqual([
      'away',
      'offline',
      'dayCare',
      'leaderboard',
      'replies',
      'raidGifts',
      'donation',
      'regionOffer',
      'event',
      'versus',
      'share',
      'extreme',
      'trades',
      'general',
      'shinyDex',
      'inviteReward',
      'portal',
      'dayNight',
      'powers',
      'raidRules',
      'world',
      'worldFinish',
      'worldBye',
      'live',
      'tradeScene',
      'push',
    ])
  })

  it('has nothing to show a new game, or without a save', () => {
    expect(nextOneTimePopup(start(), on, HOME)).toBeNull()
    expect(nextOneTimePopup(null, on, { ...HOME, awayReport: true })).toBeNull()
  })

  it('only between fights: nothing mid-encounter, mid-battle or over a full-screen moment', () => {
    const save = versusOpen(start())
    expect(nextOneTimePopup(save, on, HOME)).toBe('versus')
    expect(nextOneTimePopup(save, on, { ...HOME, calm: false })).toBeNull()
    expect(
      nextOneTimePopup(save, on, { ...HOME, calm: false, awayReport: true, pushAsking: true }),
    ).toBeNull()
  })

  it('opens the battle powers’ rules with the gifts and Trick or Treat switched on and their rules unseen', () => {
    const save = megaWon(start())
    // Their own rules open at their moment (the first gift, the first ghost), so they are due and stay due.
    expect(giftRulesDue(save, on)).toBe(true)
    expect(trickRulesDue(save, on)).toBe(true)
    expect(nextOneTimePopup(save, on, HOME)).toBe('powers')
    expect(nextOneTimePopup({ ...save, powers: { ...save.powers, seen: ['mega'] } }, on, HOME)).toBeNull()
  })

  it('shows one at a time, each in its turn, as each is seen', () => {
    let save: SaveData = { ...megaWon(versusOpen(dayCareOpen(start()))), leaderboardVisited: false }
    const ctx: PopupContext = { ...HOME, shareSeen: false, replies: true, pushAsking: true }
    const seen: string[] = []
    let shareSeen = false
    let replies = true
    let asking = true
    for (let i = 0; i < 10; i++) {
      const id = nextOneTimePopup(save, on, { ...ctx, shareSeen, replies, pushAsking: asking })
      if (!id) break
      seen.push(id)
      // Closing each one: what its own close does.
      if (id === 'dayCare')
        save = { ...save, dayCare: { ...save.dayCare!, visited: true } as SaveData['dayCare'] }
      else if (id === 'leaderboard') save = { ...save, leaderboardVisited: true }
      else if (id === 'replies') replies = false
      else if (id === 'versus') save = { ...save, versusRulesSeen: true }
      else if (id === 'share') shareSeen = true
      else if (id === 'powers') save = { ...save, powers: { ...save.powers, seen: ['mega'] } }
      else if (id === 'push') asking = false
    }
    // The leaderboard's waits for a badge in the region being played: the Kalos ones are parked.
    expect(seen).toEqual(['dayCare', 'replies', 'versus', 'powers', 'push'])
  })

  it('Prof. Oak’s tutorials go first: the Day Care’s, then the leaderboard’s', () => {
    const save = withBadges(dayCareOpen({ ...start(), leaderboardVisited: false }), 'kanto', 2)
    const ctx = { ...HOME, shareSeen: false }
    expect(nextOneTimePopup(save, on, ctx)).toBe('dayCare')
    const visited = { ...save, dayCare: { ...save.dayCare!, visited: true } as SaveData['dayCare'] }
    expect(nextOneTimePopup(visited, on, ctx)).toBe('leaderboard')
    // Then Prof. Oak's invite, at the region's 2nd badge.
    expect(nextOneTimePopup({ ...visited, leaderboardVisited: true }, on, ctx)).toBe('share')
    expect(
      nextOneTimePopup({ ...visited, leaderboardVisited: true }, on, { ...ctx, shareSeen: true }),
    ).toBeNull()
  })

  it('what you came back to goes first, the question about notifications last', () => {
    const save = versusOpen(start())
    expect(nextOneTimePopup(save, on, { ...HOME, awayReport: true, pushAsking: true })).toBe('away')
    expect(nextOneTimePopup(save, on, { ...HOME, offlineReport: true })).toBe('offline')
    expect(nextOneTimePopup(save, on, { ...HOME, raidGifts: true })).toBe('raidGifts')
    expect(nextOneTimePopup(start(), on, { ...HOME, pushAsking: true, inviteReward: true })).toBe(
      'inviteReward',
    )
    expect(nextOneTimePopup(start(), on, { ...HOME, pushAsking: true })).toBe('push')
  })

  it('never opens on the page it leads to: the next one due takes the turn there', () => {
    const save = megaWon(versusOpen(start()))
    expect(nextOneTimePopup(save, on, HOME)).toBe('versus')
    expect(nextOneTimePopup(save, on, { ...HOME, path: '/versus' })).toBe('powers')
    expect(nextOneTimePopup(save, on, { ...HOME, path: '/versus/fight' })).toBe('powers')
    const dc = dayCareOpen(start())
    expect(nextOneTimePopup(dc, on, { ...HOME, path: '/daycare' })).toBeNull()
    // The invite reward waits off the Friends page, where its gauge already is.
    expect(nextOneTimePopup(start(), on, { ...HOME, path: '/friends', inviteReward: true })).toBeNull()
  })

  it('keeps the one on screen while it is due, rather than let one that came later take its place', () => {
    const save = megaWon(start())
    expect(nextOneTimePopup(save, on, { ...HOME, raidGifts: true })).toBe('raidGifts')
    expect(nextOneTimePopup(save, on, { ...HOME, raidGifts: true, showing: 'powers' })).toBe('powers')
    // Once it's closed (no longer due), the queue's order again.
    const closed = { ...save, powers: { ...save.powers, seen: ['mega' as const] } }
    expect(nextOneTimePopup(closed, on, { ...HOME, raidGifts: true, showing: 'powers' })).toBe('raidGifts')
    // Mid-fight even the one on screen waits.
    expect(nextOneTimePopup(save, on, { ...HOME, calm: false, showing: 'powers' })).toBeNull()
  })

  it('Trades’ rules only for an account; the invite rewards’ are never queued (the Friends page opens them)', () => {
    const social = makeData({
      inviteRewards: { ...D.inviteRewards, access: 'all' },
      trade: { ...D.trade, access: 'all', minBadges: 0 },
    })
    const save = start()
    expect(inviteRulesDue(save, social)).toBe(true)
    expect(nextOneTimePopup(save, social, HOME)).toBeNull()
    expect(nextOneTimePopup(save, social, { ...HOME, signedIn: true })).toBe('trades')
    const traded = { ...save, trades: { out: [], done: [], rulesSeen: true } }
    expect(nextOneTimePopup(traded, social, { ...HOME, signedIn: true })).toBeNull()
    expect(nextOneTimePopup(traded, social, { ...HOME, signedIn: true, path: '/friends' })).toBeNull()
  })
})
