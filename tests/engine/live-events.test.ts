// Live events (docs/20): scheduled by the admin, the same for everyone, one at a time. A Shiny Parade boosts wild shiny
// odds where it runs, a Special Shop sells items for a while (some never sold, some limited per player), Cash Flow
// multiplies every ₽ earned but selling. A player sees and gets it from the event's badge count.
import { describe, expect, it } from 'vitest'
import {
  applyRebattleKO,
  applyVictory,
  badgesHeld,
  buyLiveItem,
  cashMultiplier,
  cashReward,
  createRng,
  earnedGold,
  emptyProgress,
  leagueArea,
  liveCovers,
  liveEventAt,
  liveFor,
  liveLeft,
  liveOverlap,
  livePopupDue,
  liveProblems,
  liveShopRows,
  liveState,
  markLiveSeen,
  MONEY,
  newLiveEvent,
  newSave,
  pickUpItem,
  rebattleEncounter,
  regionOfArea,
  rollWild,
  sellItem,
  sellPrice,
  shinyBoost,
  spinSlots,
  type Area,
  type EncounterContext,
  type GameData,
  type LiveEvent,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, makeData, newId } from '../fixtures'

const T0 = Date.parse('2026-11-01T18:00:00.000Z')
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

function ev(over: Partial<LiveEvent> = {}): LiveEvent {
  return { ...newLiveEvent('e1', iso(T0), iso(T0 + 72 * H)), minBadges: 0, ...over }
}
const shiny = (s: Partial<LiveEvent['shiny']>, over: Partial<LiveEvent> = {}) => ev({ type: 'shiny', shiny: { ...ev().shiny, ...s }, ...over })
const cash = (multiplier = 1.5, over: Partial<LiveEvent> = {}) => ev({ type: 'cash', cash: { multiplier }, ...over })
const shop = (items: LiveEvent['shop']['items'], over: Partial<LiveEvent> = {}) => ev({ type: 'shop', shop: { items }, ...over })
const withLive = (...list: LiveEvent[]): GameData => makeData({ liveEvents: { access: 'all', list } })

const fresh = (): SaveData => newSave(4, data, 0, newId)
const rich = (gold = 100_000): SaveData => ({ ...fresh(), gold })
const kantoArea = (name: string) => data.areas.find((a) => a.name === name && regionOfArea(a) === 'kanto')!
const FOREST = kantoArea('Viridian Forest')

/** A save holding the first `n` Kanto badges (their gyms beaten). */
function withBadges(n: number): SaveData {
  const s = fresh()
  const gyms = data.areas
    .filter((a) => regionOfArea(a) === 'kanto' && a.gyms.some((id) => data.trainers[id]?.badge))
    .sort((a, b) => a.orderIndex - b.orderIndex)
  const progress = { ...s.areaProgress }
  let left = n
  for (const a of gyms)
    for (const id of a.gyms) {
      if (left <= 0 || !data.trainers[id]?.badge) continue
      const p = progress[a.id] ?? emptyProgress()
      progress[a.id] = { ...p, gymsDefeated: [...p.gymsDefeated, id] }
      left--
    }
  return { ...s, areaProgress: progress }
}

describe('when a live event runs', () => {
  it('from its start (included) to its end (excluded), and never with dates that make no sense', () => {
    const e = ev()
    expect(liveState(e, T0 - 1)).toBe('scheduled')
    expect(liveState(e, T0)).toBe('live')
    expect(liveState(e, T0 + 72 * H - 1)).toBe('live')
    expect(liveState(e, T0 + 72 * H)).toBe('ended')
    expect(liveState({ start: iso(T0), end: iso(T0) }, T0)).toBe('ended')
    expect(liveState({ start: 'soon', end: iso(T0 + H) }, T0)).toBe('ended')
  })

  it('on the server’s clock: no time known, no event; the running one is found among past and future ones', () => {
    const past = ev({ id: 'past', start: iso(T0 - 100 * H), end: iso(T0 - 50 * H) })
    const now = cash(1.5, { id: 'now' })
    const later = ev({ id: 'later', start: iso(T0 + 100 * H), end: iso(T0 + 150 * H) })
    const d = withLive(past, now, later)
    expect(liveEventAt(d, null)).toBeNull()
    expect(liveEventAt(d, T0 + H)?.id).toBe('now')
    expect(liveEventAt(d, T0 - 60 * H)?.id).toBe('past')
    expect(liveEventAt(d, T0 + 80 * H)).toBeNull()
    expect(liveEventAt(data, T0)).toBeNull()
  })

  it('runs only when switched on: off by default, for the admin alone, for everyone', () => {
    const list = [cash()]
    const off = makeData({ liveEvents: { access: 'off', list } })
    expect(liveEventAt(off, T0)).toBeNull()
    const admin = makeData({ liveEvents: { access: 'admin', list } })
    expect(liveEventAt(admin, T0)).toBeNull()
    expect(liveEventAt({ ...admin, viewer: { admin: true } }, T0)?.type).toBe('cash')
    expect(liveEventAt(withLive(...list), T0)?.type).toBe('cash')
  })

  it('a row saved by an older admin, missing settings, still reads', () => {
    const d = makeData({ liveEvents: { access: 'all', list: [{ id: 'old', type: 'cash', start: iso(T0), end: iso(T0 + H) } as LiveEvent] } })
    const e = liveEventAt(d, T0)!
    expect(e.cash.multiplier).toBe(1.5)
    expect(e.shiny.areaIds).toEqual([])
    expect(e.title).toEqual({})
  })

  it('shows (and works) from its badge count, every region’s badges counted', () => {
    const d = withLive(cash(2, { minBadges: 3 }))
    expect(badgesHeld(withBadges(2), d)).toBe(2)
    expect(liveFor(withBadges(2), d, T0)).toBeNull()
    expect(liveFor(withBadges(3), d, T0)?.type).toBe('cash')
  })

  it('counts down: time left and the gauge’s share', () => {
    const e = ev()
    expect(liveLeft(e, T0)).toEqual({ ms: 72 * H, share: 1 })
    expect(liveLeft(e, T0 + 36 * H)).toEqual({ ms: 36 * H, share: 0.5 })
    expect(liveLeft(e, T0 + 99 * H)).toEqual({ ms: 0, share: 0 })
  })

  it('its pop-up shows once per event, and only the last 50 are remembered', () => {
    const e = cash()
    const s = fresh()
    expect(livePopupDue(s, e)).toBe(true)
    const seen = markLiveSeen(s, e)
    expect(livePopupDue(seen, e)).toBe(false)
    expect(markLiveSeen(seen, e)).toBe(seen)
    expect(livePopupDue(seen, cash(1.5, { id: 'e2' }))).toBe(true)
    expect(livePopupDue(seen, null)).toBe(false)
    let many = s
    for (let i = 0; i < 60; i++) many = markLiveSeen(many, cash(1.5, { id: `x${i}` }))
    expect(many.events?.liveSeen).toHaveLength(50)
    expect(many.events?.liveSeen?.[49]).toBe('x59')
  })
})

describe('Cash Flow', () => {
  it('multiplies ₽ earned and says how much it added', () => {
    expect(cashMultiplier(cash(1.5))).toBe(1.5)
    expect(cashMultiplier(shiny({}))).toBe(1)
    expect(cashMultiplier(null)).toBe(1)
    expect(cashMultiplier(cash(0.5))).toBe(1)
    expect(earnedGold(240, cash(1.5))).toEqual({ amount: 360, bonus: 120 })
    expect(earnedGold(7, cash(1.5))).toEqual({ amount: 11, bonus: 4 })
    expect(earnedGold(240, null)).toEqual({ amount: 240, bonus: 0 })
  })

  it('a trainer pays more, with the bonus on its gold event; a wild Pokémon still pays nothing', () => {
    const s = fresh()
    const win = (kind: 'trainer' | 'wild', live: LiveEvent | null) =>
      applyVictory(s, { areaId: FOREST.id, kind, enemyDex: 10, enemyLevel: 7, fighterUid: s.team[0]! }, data, createRng(1), 5, newId, live)
    const plain = win('trainer', null)
    const boosted = win('trainer', cash(2))
    const base = plain.events.find((e) => e.kind === 'gold')!
    expect(base).toEqual({ kind: 'gold', amount: base.kind === 'gold' ? base.amount : 0 })
    const gold = boosted.events.find((e) => e.kind === 'gold')
    expect(gold).toEqual({ kind: 'gold', amount: (base as { amount: number }).amount * 2, bonus: (base as { amount: number }).amount })
    expect(boosted.save.gold - s.gold).toBe((base as { amount: number }).amount * 2)
    expect(win('wild', cash(2)).events.some((e) => e.kind === 'gold')).toBe(false)
  })

  it('₽ found in an area, the Elite Rebattle, the Game Corner and the wheel’s ₽ are boosted; selling is not', () => {
    const s = fresh()
    const found = pickUpItem(s, FOREST.id, { entryId: 'x', itemKey: MONEY, qty: 100 }, data, 0, newId, cash(1.5))
    expect(found.gold - s.gold).toBe(150)

    // The rebattle: its first trainer's first Pokémon.
    const league = leagueArea(data, 'kanto')!
    const champ = { ...s, areaProgress: { ...s.areaProgress, [league.id]: { ...emptyProgress(), cleared: true } } }
    const enc = rebattleEncounter(champ, data, 'kanto')
    if (enc?.kind !== 'gym') throw new Error('no rebattle fight')
    const ko = { regionId: 'kanto', tier: 0, trainerId: enc.trainerId, index: 0, last: false, enemyLevel: enc.team[0]!.level, fighterUid: champ.team[0]! }
    const plain = applyRebattleKO(champ, ko, data, createRng(1)).events.find((e) => e.kind === 'gold') as { amount: number }
    const more = applyRebattleKO(champ, ko, data, createRng(1), cash(1.5)).events.find((e) => e.kind === 'gold')
    expect(more).toEqual({ kind: 'gold', amount: Math.round(plain.amount * 1.5), bonus: Math.round(plain.amount * 1.5) - plain.amount })

    // The Game Corner: only the 3-ball result, 50 ₽.
    const slots = makeData({
      slotMachine: { ...data.config.slotMachine, cost: 10, oneBall: { weight: 0, gold: 1 }, twoBalls: { weight: 0, gold: 10 }, threeBalls: { weight: 1, gold: 50 }, jackpot: { weight: 0, gold: 10 } },
    })
    const spin = spinSlots(rich(), slots, createRng(3), 0, newId, cash(1.5))!
    expect([spin.gold, spin.bonus]).toEqual([75, 25])
    expect(spin.save.gold).toBe(100_000 - 10 + 75)
    expect(spinSlots(rich(), slots, createRng(3), 0, newId)!.bonus).toBe(0)

    expect(cashReward({ kind: 'gold', amount: 10 }, cash(1.5))).toEqual({ kind: 'gold', amount: 15 })
    expect(cashReward({ kind: 'item', key: 'poke-ball', qty: 2 }, cash(1.5))).toEqual({ kind: 'item', key: 'poke-ball', qty: 2 })

    // Selling has no live event to read at all: the same ₽ either way.
    const bag = { ...s, inventory: { ...s.inventory, potion: 4 } }
    expect(sellItem(bag, 'potion', 2, data)!.gold - bag.gold).toBe(2 * sellPrice(data.items.potion))
  })
})

describe('Shiny Parade', () => {
  const johtoArea = data.areas.find((a) => regionOfArea(a) === 'johto' && a.wildPool.length)!

  it('covers some areas, one region, or everywhere', () => {
    expect(liveCovers(shiny({ scope: 'all' }), FOREST)).toBe(true)
    expect(liveCovers(shiny({ scope: 'region', regionId: 'kanto' }), FOREST)).toBe(true)
    expect(liveCovers(shiny({ scope: 'region', regionId: 'kanto' }), johtoArea)).toBe(false)
    expect(liveCovers(shiny({ scope: 'areas', areaIds: [FOREST.id] }), FOREST)).toBe(true)
    expect(liveCovers(shiny({ scope: 'areas', areaIds: [FOREST.id] }), kantoArea('Mt. Moon'))).toBe(false)
    expect(liveCovers(cash(), FOREST)).toBe(false)
    expect(shinyBoost(shiny({ scope: 'all', multiplier: 5 }), FOREST)).toBe(5)
    expect(shinyBoost(shiny({ scope: 'areas', areaIds: [], multiplier: 5 }), FOREST)).toBe(1)
    expect(shinyBoost(null, FOREST)).toBe(1)
  })

  const ctx = (area: Area, boost?: number): EncounterContext => ({
    area,
    progress: emptyProgress(),
    data,
    teamAvgLevel: 10,
    teamHurt: false,
    isFirstInArea: false,
    pokedex: [],
    ...(boost != null && { shinyBoost: boost }),
  })

  it('makes wild Pokémon shinier where it runs; legendaries stay shiny-locked', () => {
    const rate = (boost?: number) => {
      const rng = createRng(11)
      let n = 0
      for (let i = 0; i < 4000; i++) if ((rollWild(ctx(FOREST, boost), rng) as { shiny?: boolean } | null)?.shiny) n++
      return n / 4000
    }
    const base = data.config.shinyChance
    expect(rate()).toBeCloseTo(base, 1)
    expect(rate(20)).toBeGreaterThan(rate() + 0.02)
    expect(rate(20)).toBeCloseTo(Math.min(1, base * 20), 1)
    // A certain shiny for a normal Pokémon, never for a legendary.
    const sure = 1 / base + 1
    expect((rollWild(ctx(FOREST, sure), createRng(2)) as { shiny?: boolean }).shiny).toBe(true)
    const lair: Area = { ...FOREST, wildPool: [{ dex: 150, weight: 1, minLevel: 50, maxLevel: 50 } as Area['wildPool'][number]] }
    expect((rollWild(ctx(lair, sure), createRng(2)) as { shiny?: boolean }).shiny).toBeUndefined()
  })
})

describe('Special Shop', () => {
  const items = [
    { key: 'master-ball', price: 9000, limit: 1, regions: 'all' as const },
    { key: 'ultra-ball', price: Math.round(data.items['ultra-ball']!.price * 0.75), limit: 10, regions: 'all' as const },
    { key: 'potion', price: 1, limit: null, regions: ['kanto' as const] },
    { key: 'super-potion', price: 10, limit: null, regions: ['johto' as const] },
  ]
  const e = shop(items)
  const d = withLive(e)

  it('lists the items sold where the player plays, with the usual price, the limit and what’s left', () => {
    const rows = liveShopRows(rich(), d, e)
    expect(rows.map((r) => r.item.key)).toEqual(['master-ball', 'ultra-ball', 'potion'])
    const [master, ultra, potion] = rows
    expect(master!.usual).toBeNull()
    expect(master!.left).toBe(1)
    expect(ultra!.usual).toBe(data.items['ultra-ball']!.price)
    expect(ultra!.price).toBeLessThan(ultra!.usual!)
    // Never below what the Mart pays back for it: buying to sell back can't pay.
    expect(potion!.price).toBe(Math.max(1, sellPrice(data.items.potion)))
    expect(potion!.left).toBeNull()
    expect(liveShopRows(rich(), d, cash())).toEqual([])
    expect(liveShopRows(rich(), d, null)).toEqual([])
  })

  it('sells within the limit, counts what each player bought per event, and refuses past it or when short', () => {
    const s = rich(20_000)
    const one = buyLiveItem(s, d, e, 'master-ball', 1, 0, newId)!
    expect(one.gold).toBe(20_000 - 9000)
    expect(one.inventory['master-ball']).toBe((s.inventory['master-ball'] ?? 0) + 1)
    expect(one.events?.liveBought).toEqual({ e1: { 'master-ball': 1 } })
    expect(buyLiveItem(one, d, e, 'master-ball', 1, 0, newId)).toBeNull()
    expect(liveShopRows(one, d, e)[0]!.left).toBe(0)
    expect(buyLiveItem(s, d, e, 'ultra-ball', 11, 0, newId)).toBeNull()
    expect(buyLiveItem(s, d, e, 'ultra-ball', 10, 0, newId)!.events?.liveBought?.e1?.['ultra-ball']).toBe(10)
    expect(buyLiveItem({ ...s, gold: 100 }, d, e, 'master-ball', 1, 0, newId)).toBeNull()
    expect(buyLiveItem(s, d, e, 'super-potion', 1, 0, newId)).toBeNull()
    expect(buyLiveItem(s, d, e, 'ultra-ball', 0, 0, newId)).toBeNull()
    expect(buyLiveItem(s, d, null, 'master-ball', 1, 0, newId)).toBeNull()
    // Another event starts from zero.
    const next = shop(items, { id: 'e2' })
    expect(liveShopRows(one, withLive(next), next)[0]!.left).toBe(1)
  })

  it('keeps purchases and seen pop-ups through a save round trip', () => {
    const bought = markLiveSeen(buyLiveItem(rich(20_000), d, e, 'master-ball', 1, 0, newId)!, e)
    const back = parseSave(JSON.parse(JSON.stringify(bought)))
    if (!back.ok) throw new Error(back.error)
    expect(back.save.events?.liveBought).toEqual({ e1: { 'master-ball': 1 } })
    expect(back.save.events?.liveSeen).toEqual(['e1'])
  })
})

describe('the admin', () => {
  it('refuses two live events at once, and an event that makes no sense', () => {
    const a = cash(1.5, { id: 'a' })
    const b = ev({ id: 'b', start: iso(T0 + 71 * H), end: iso(T0 + 80 * H) })
    const c = ev({ id: 'c', start: iso(T0 + 72 * H), end: iso(T0 + 80 * H) })
    expect(liveOverlap([a], b)?.id).toBe('a')
    expect(liveOverlap([a], c)).toBeNull()
    expect(liveOverlap([a], a)).toBeNull()
    expect(liveProblems([a], b, data)).toHaveLength(1)
    expect(liveProblems([a], c, data)).toEqual([])
    expect(liveProblems([], ev({ end: iso(T0 - H) }), data)[0]).toMatch(/ends before/)
    expect(liveProblems([], shiny({ scope: 'areas', areaIds: [] }), data)).toEqual(['No area picked.'])
    expect(liveProblems([], shiny({ scope: 'region', regionId: null }), data)).toEqual(['No region picked.'])
    expect(liveProblems([], cash(1), data)).toHaveLength(1)
    expect(liveProblems([], shop([]), data)).toEqual(['The shop has no item.'])
    expect(liveProblems([], shop([{ key: 'nope', price: 1, limit: null, regions: 'all' }]), data)).toEqual(['Unknown item: nope.'])
  })
})
