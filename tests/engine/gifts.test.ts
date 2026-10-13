// Gifts with the developer's messages (docs/15 §23): the switch, where each gift lands (a region the player has
// started, or their latest one), what goes in (items into a Bag, new Pokémon into a Box) and each message's gifts once.
import { describe, expect, it } from 'vitest'
import {
  applyGifts,
  createInstance,
  DEFAULT_CONFIG,
  GIFT_LATEST,
  giftLanding,
  giftRulesDue,
  giftsOf,
  giftsOn,
  giftsWait,
  latestRegion,
  markGiftRulesSeen,
  newRegionBlock,
  newSave,
  parseGifts,
  regionOf,
  startRegion,
  switchRegion,
  type Gift,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const data = makeData({ gifts: { access: 'all' } })
const NOW = 1_000_000

const kanto = (): SaveData => newSave(4, data, NOW, newId)
/** Kanto, then Johto started on Totodile: Johto live, Kanto parked. */
function johto(save = kanto()): SaveData {
  const r = data.regions.find((x) => x.id === 'johto')!
  return startRegion(save, r, newRegionBlock(r, 158, data, NOW, newId, createInstance))
}

const candy = (qty: number, region = GIFT_LATEST): Gift => ({ kind: 'item', key: 'rare-candy', qty, region })
const pika = (o: Partial<Extract<Gift, { kind: 'pokemon' }>> = {}): Gift => ({
  kind: 'pokemon',
  dex: 25,
  level: 20,
  region: GIFT_LATEST,
  ...o,
})

describe('the switch', () => {
  it('is off by default; on for the admin alone, or for everyone', () => {
    expect(DEFAULT_CONFIG.gifts.access).toBe('off')
    expect(giftsOn(makeData())).toBe(false)
    const admin = makeData({ gifts: { access: 'admin' } })
    expect(giftsOn(admin)).toBe(false)
    expect(giftsOn({ ...admin, viewer: { admin: true } })).toBe(true)
    expect(giftsOn(data)).toBe(true)
  })

  it('opens gifts in the main game only, outside a small world', () => {
    expect(giftsWait(kanto(), makeData())).toBe('off')
    expect(giftsWait(kanto(), data)).toBeNull()
    expect(giftsWait({ ...kanto(), mode: 'extreme' }, data)).toBe('extreme')
    const inWorld: SaveData = {
      ...kanto(),
      region: 'mirage',
      events: { world: { id: 'w', regionId: 'mirage', from: 'kanto', partner: 1 } },
    }
    expect(giftsWait(inWorld, data)).toBe('world')
  })
})

describe('reading the server’s gifts', () => {
  it('keeps what is well formed, and only that', () => {
    expect(
      parseGifts([
        candy(5),
        pika({ shiny: true, region: 'kanto' }),
        { kind: 'item', key: 'potion', qty: 0, region: 'latest' },
        { kind: 'item', key: 'potion', qty: 2.5, region: 'latest' },
        { kind: 'pokemon', dex: 25, level: 101, region: 'kanto' },
        { kind: 'pokemon', dex: 25, level: 5 },
        { kind: 'gold', amount: 2500, region: 'kanto' },
        { kind: 'gold', amount: 0, region: 'kanto' },
        { kind: 'gold', amount: 1_000_000, region: 'kanto' },
        { kind: 'egg', region: 'kanto' },
        null,
        'x',
      ]),
    ).toEqual([
      candy(5),
      pika({ shiny: true, region: 'kanto' }),
      { kind: 'gold', amount: 2500, region: 'kanto' },
    ])
    expect(parseGifts(null)).toEqual([])
    expect(parseGifts({ kind: 'item' })).toEqual([])
  })
})

describe('where a gift lands', () => {
  it('“latest” is the newest region started, whichever is being played', () => {
    expect(latestRegion(kanto(), data)).toBe('kanto')
    const j = johto()
    expect(latestRegion(j, data)).toBe('johto')
    // Back in Kanto, Johto parked: still Johto.
    const back = switchRegion(j, 'kanto')
    expect(regionOf(back)).toBe('kanto')
    expect(latestRegion(back, data)).toBe('johto')
  })

  it('a region picked by the admin, once started; the latest one until then', () => {
    const j = johto()
    expect(giftLanding(j, data, 'kanto')).toBe('kanto')
    expect(giftLanding(j, data, 'johto')).toBe('johto')
    expect(giftLanding(j, data, 'hoenn')).toBe('johto')
    expect(giftLanding(j, data, 'nowhere')).toBe('johto')
    expect(giftLanding(kanto(), data, GIFT_LATEST)).toBe('kanto')
  })
})

describe('opening a message’s gifts', () => {
  it('puts items in the Bag of their region, live or parked', () => {
    const back = switchRegion(johto(), 'kanto')
    const before = back.inventory['rare-candy'] ?? 0
    const res = applyGifts(back, data, 7, [candy(5, 'kanto'), candy(3)], NOW, newId)!
    expect(res.save.inventory['rare-candy']).toBe(before + 5)
    expect(res.save.parked!.johto!.inventory['rare-candy']).toBe(
      (back.parked!.johto!.inventory['rare-candy'] ?? 0) + 3,
    )
    expect(res.landed.map((l) => [l.region, l.moved])).toEqual([
      ['kanto', false],
      ['johto', false],
    ])
  })

  it('adds Pokédollars to their region’s ₽, live or parked', () => {
    const back = switchRegion(johto(), 'kanto')
    const res = applyGifts(
      back,
      data,
      14,
      [
        { kind: 'gold', amount: 5000, region: 'kanto' },
        { kind: 'gold', amount: 750, region: GIFT_LATEST },
      ],
      NOW,
      newId,
    )!
    expect(res.save.gold).toBe(back.gold + 5000)
    expect(res.save.parked!.johto!.gold).toBe(back.parked!.johto!.gold + 750)
    expect(res.landed.map((l) => l.region)).toEqual(['kanto', 'johto'])
  })

  it('gives a new Pokémon at its level and full HP, shiny when asked, into the Box (and a team with room)', () => {
    const s = kanto()
    const res = applyGifts(s, data, 8, [pika({ shiny: true }), pika({ dex: 1, level: 7 })], NOW, newId)!
    const added = res.save.box.slice(s.box.length)
    expect(added.map((p) => [p.dex, p.level, !!p.shiny])).toEqual([
      [25, 20, true],
      [1, 7, false],
    ])
    for (const p of added) expect(p.currentHp).toBeGreaterThan(0)
    expect(res.save.team).toEqual([...s.team, ...added.map((p) => p.id)])
    expect(res.save.pokedex).toEqual(expect.arrayContaining([25, 1]))
    expect(res.landed.map((l) => [l.isNew, l.joinedTeam])).toEqual([
      [!s.pokedex.includes(25), true],
      [!s.pokedex.includes(1), true],
    ])
  })

  it('keeps a copy you already have: the gift is its own Pokémon', () => {
    const s = kanto()
    const starter = s.box[0]!
    const res = applyGifts(s, data, 9, [pika({ dex: starter.dex, level: starter.level + 30 })], NOW, newId)!
    expect(res.save.box.filter((p) => p.dex === starter.dex)).toHaveLength(2)
    expect(res.save.box.find((p) => p.id === starter.id)).toEqual(starter)
    expect(res.landed[0]!.isNew).toBe(false)
  })

  it('a region not started yet sends it to the latest one, and says so', () => {
    const res = applyGifts(kanto(), data, 10, [pika({ region: 'johto' })], NOW, newId)!
    expect(res.landed[0]).toMatchObject({ region: 'kanto', moved: true })
  })

  it('goes into a parked region’s Box and Pokédex, not the team being played', () => {
    const back = switchRegion(johto(), 'kanto')
    const res = applyGifts(back, data, 11, [pika({ dex: 152, level: 12 })], NOW, newId)!
    expect(res.save.parked!.johto!.box.at(-1)).toMatchObject({ dex: 152, level: 12 })
    expect(res.save.parked!.johto!.pokedex).toContain(152)
    expect(res.save.team).toEqual(back.team)
    expect(res.landed[0]).toMatchObject({ region: 'johto', joinedTeam: false })
  })

  it('caps the level at the game’s, and leaves out what the game no longer knows', () => {
    const res = applyGifts(
      kanto(),
      data,
      12,
      [
        pika({ level: 100 }),
        { kind: 'item', key: 'no-such-item', qty: 1, region: 'latest' },
        pika({ dex: 99999 }),
      ],
      NOW,
      newId,
    )!
    expect(res.landed).toHaveLength(1)
    expect(res.landed[0]!.gift).toMatchObject({ level: data.config.maxLevel })
  })

  it('happens once per message, and the save keeps that through a reload', () => {
    const first = applyGifts(kanto(), data, 13, [candy(1)], NOW, newId)!
    expect(applyGifts(first.save, data, 13, [candy(1)], NOW, newId)).toBeNull()
    expect(giftsOf(first.save).done).toEqual([13])
    const parsed = parseSave(JSON.parse(JSON.stringify(first.save)))
    expect(parsed.ok && parsed.save.gifts).toEqual({ done: [13] })
  })
})

describe('the rules', () => {
  it('open once before the first gift, and only while gifts are on', () => {
    expect(giftRulesDue(kanto(), data)).toBe(true)
    expect(giftRulesDue(markGiftRulesSeen(kanto()), data)).toBe(false)
    expect(giftRulesDue(kanto(), makeData())).toBe(false)
  })
})
