// Friend invite rewards (docs/15 §24): the switch, the admin's tiers as the game reads them, the gauge (its stops, its
// fill, what's ready), where the rewards open, each tier's gifts put in once, and the rules seen once.
import { describe, expect, it } from 'vitest'
import {
  applyInviteReward,
  DEFAULT_CONFIG,
  GIFT_LATEST,
  inviteFill,
  inviteGauge,
  inviteRewardsOn,
  inviteRulesDue,
  invitesOf,
  invitesWait,
  inviteTiers,
  markInviteRulesSeen,
  newSave,
  type Gift,
  type InviteRewardsConfig,
  type InviteStatus,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const on = (patch: Partial<InviteRewardsConfig> = {}) =>
  makeData({ inviteRewards: { ...DEFAULT_CONFIG.inviteRewards, access: 'all', ...patch } })
const data = on()
const NOW = 1_000_000
const kanto = (): SaveData => newSave(4, data, NOW, newId)
const status = (count: number, claimed: number[] = [], pending = 0): InviteStatus => ({
  count,
  pending,
  claimed,
  latest: null,
})
const candy = (qty = 1): Gift => ({ kind: 'item', key: 'rare-candy', qty, region: GIFT_LATEST })

describe('the switch and the tiers', () => {
  it('ships off with the four tiers asked for: Rare Candy, ₽1,000, a shiny Ditto, a Master Ball', () => {
    expect(DEFAULT_CONFIG.inviteRewards.access).toBe('off')
    expect(inviteRewardsOn(makeData())).toBe(false)
    const admin = makeData({ inviteRewards: { ...DEFAULT_CONFIG.inviteRewards, access: 'admin' } })
    expect(inviteRewardsOn(admin)).toBe(false)
    expect(inviteRewardsOn({ ...admin, viewer: { admin: true } })).toBe(true)
    expect(inviteRewardsOn(data)).toBe(true)
    expect(inviteTiers(data)).toEqual([
      { friends: 1, gifts: [{ kind: 'item', key: 'rare-candy', qty: 1, region: 'latest' }] },
      { friends: 2, gifts: [{ kind: 'gold', amount: 1000, region: 'latest' }] },
      { friends: 3, gifts: [{ kind: 'pokemon', dex: 132, level: 10, shiny: true, region: 'latest' }] },
      { friends: 4, gifts: [{ kind: 'item', key: 'master-ball', qty: 1, region: 'latest' }] },
    ])
  })

  it('reads the admin’s tiers the safe way: in order, each count once, a gift each, six at most', () => {
    const tiers = [
      { friends: 5, gifts: [candy(5)] },
      { friends: 2, gifts: [candy(2)] },
      { friends: 2, gifts: [candy(9)] },
      { friends: 0, gifts: [candy()] },
      { friends: 1.5, gifts: [candy()] },
      { friends: 100, gifts: [candy()] },
      { friends: 3, gifts: [] },
      { friends: 4, gifts: [{ kind: 'gold', amount: 0, region: GIFT_LATEST }] },
      ...[6, 7, 8, 9, 10, 11].map((friends) => ({ friends, gifts: [candy()] })),
    ] as InviteRewardsConfig['tiers']
    const got = inviteTiers(on({ tiers }))
    expect(got.map((t) => t.friends)).toEqual([2, 5, 6, 7, 8, 9])
    expect(got[0]!.gifts).toEqual([candy(2)])
    expect(inviteTiers(on({ tiers: 'nope' as unknown as InviteRewardsConfig['tiers'] }))).toEqual([])
  })
})

describe('the gauge', () => {
  it('fills evenly between its stops, wherever they are', () => {
    const even = inviteTiers(data)
    expect([0, 1, 2, 3, 4, 9].map((n) => inviteFill(n, even))).toEqual([0, 0.25, 0.5, 0.75, 1, 1])
    // Stops at 1, 3 and 7: halfway to 3 is a quarter plus half a third.
    const uneven = [{ friends: 1 }, { friends: 3 }, { friends: 7 }]
    expect(inviteFill(2, uneven)).toBeCloseTo(1 / 3 + 1 / 6)
    expect(inviteFill(5, uneven)).toBeCloseTo(2 / 3 + 1 / 6)
    expect(inviteFill(3, [])).toBe(0)
  })

  it('says what is opened, ready and still ahead, and how far the next one is', () => {
    const g = inviteGauge(status(3, [1], 2), data)
    expect(g.tiers.map((t) => t.state)).toEqual(['claimed', 'ready', 'ready', 'locked'])
    expect(g.ready.map((t) => t.friends)).toEqual([2, 3])
    expect(g).toMatchObject({ count: 3, pending: 2, goal: 4, fill: 0.75, toNext: 1 })
    expect(g.next?.friends).toBe(4)
    const none = inviteGauge(null, data)
    expect(none).toMatchObject({ count: 0, fill: 0, toNext: 1 })
    expect(none.ready).toEqual([])
    const done = inviteGauge(status(4, [1, 2, 3, 4]), data)
    expect(done).toMatchObject({ next: null, toNext: 0, fill: 1 })
  })

  it('keeps a tier it handed over even if the count went down since', () => {
    const g = inviteGauge(status(0, [1, 2]), data)
    expect(g.tiers.map((t) => t.state)).toEqual(['claimed', 'claimed', 'locked', 'locked'])
    expect(g.ready).toEqual([])
  })
})

describe('opening the rewards', () => {
  it('only in the main game, outside a small world, with the switch on', () => {
    expect(invitesWait(kanto(), makeData())).toBe('off')
    expect(invitesWait(kanto(), data)).toBeNull()
    expect(invitesWait({ ...kanto(), mode: 'extreme' }, data)).toBe('extreme')
  })

  it('puts a tier’s gifts in the save once: the shiny Ditto into the Box (or the team), the ₽ to the money', () => {
    const save = kanto()
    const tiers = inviteTiers(data)
    const ditto = applyInviteReward(save, data, 3, tiers[2]!.gifts, NOW, newId)!
    const mon = ditto.save.box.find((m) => m.dex === 132)!
    expect(mon).toMatchObject({ level: 10, shiny: true })
    expect(ditto.landed).toMatchObject([{ region: 'kanto', isNew: true }])
    expect(invitesOf(ditto.save).done).toEqual([3])
    expect(applyInviteReward(ditto.save, data, 3, tiers[2]!.gifts, NOW, newId)).toBeNull()
    const gold = applyInviteReward(ditto.save, data, 2, tiers[1]!.gifts, NOW, newId)!
    expect(gold.save.gold).toBe(save.gold + 1000)
    expect(invitesOf(gold.save).done).toEqual([2, 3])
    // The save keeps it through a reload.
    const parsed = parseSave(JSON.parse(JSON.stringify(gold.save)))
    expect(parsed.ok && parsed.save.invites).toEqual({ done: [2, 3] })
  })

  it('shows the rules once, when the rewards are open to this save', () => {
    expect(inviteRulesDue(kanto(), makeData())).toBe(false)
    expect(inviteRulesDue(kanto(), data)).toBe(true)
    const seen = markInviteRulesSeen(kanto())
    expect(inviteRulesDue(seen, data)).toBe(false)
    expect(markInviteRulesSeen(seen)).toBe(seen)
    expect(inviteRulesDue({ ...kanto(), mode: 'extreme' }, data)).toBe(false)
  })
})
