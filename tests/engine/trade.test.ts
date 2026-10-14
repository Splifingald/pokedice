// Trades (docs/23): the level a Pokémon arrives at, the species' minimum, where it lands and how it's kept, trade
// evolutions, what can be listed or asked for, a listing's snapshot of its poster, and each side applied once.
import { describe, expect, it } from 'vitest'
import {
  applyEnded,
  applyTake,
  applyTaken,
  arrivalLevel,
  createInstance,
  DEFAULT_CONFIG,
  everyRegionBox,
  gainXp,
  homeRegionOf,
  levelEvolutions,
  listBack,
  listOut,
  markTradesSeen,
  missesTrades,
  newRegionBlock,
  newSave,
  receiveTrade,
  reconcileListings,
  regionOf,
  speciesMinLevel,
  startRegion,
  tradeBlocked,
  tradeChoices,
  tradeClosed,
  tradeRegions,
  tradeEvolutionOf,
  tradeSnapshot,
  tradesOf,
  tradesToWatch,
  untradable,
  wantable,
  wantMatches,
  createRng,
  encodeDexSet,
  newForTrade,
  previewTake,
  takeBlock,
  takeChoices,
  tradesTakenToday,
  type PokemonInstance,
  type SaveData,
  type TradeConfig,
  type WorldSave,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const TRADE: TradeConfig = { ...DEFAULT_CONFIG.trade, access: 'all', minBadges: 0 }
const data = makeData({ trade: TRADE })
const NOW = 1_000_000

const mon = (dex: number, level: number, extra: Partial<PokemonInstance> = {}): PokemonInstance => ({
  ...createInstance(dex, level, data, newId(), NOW),
  ...extra,
})

/** A Kanto save with these Pokémon in its Box (the first in the team). */
function kanto(...mons: PokemonInstance[]): SaveData {
  const s = newSave(4, data, NOW, newId)
  return { ...s, box: [...s.box, ...mons], pokedex: [...new Set([...s.pokedex, ...mons.map((m) => m.dex)])] }
}

/** The same, with Johto started on Totodile (and parked back, Kanto live). */
function withJohto(save: SaveData): SaveData {
  const johto = data.regions.find((r) => r.id === 'johto')!
  const started = startRegion(save, johto, newRegionBlock(johto, 158, data, NOW, newId, createInstance))
  // Back to Kanto: Johto parked.
  const { parked } = started
  const kantoBlock = parked!.kanto!
  return {
    ...started,
    region: 'kanto',
    ...kantoBlock,
    parked: {
      johto: {
        gold: started.gold,
        pokedex: started.pokedex,
        box: started.box,
        team: started.team,
        inventory: started.inventory,
        comboLevels: started.comboLevels,
        dieLevels: started.dieLevels,
        currentAreaId: started.currentAreaId,
        areaProgress: started.areaProgress,
      },
    },
  }
}

describe('the species minimum (§1.3)', () => {
  const min = (dex: number) => speciesMinLevel(data, dex)
  it('is its pre-evolution’s evolution level', () => {
    expect(min(8)).toMatchObject({ level: 16, reason: { kind: 'evolves', from: 7, level: 16 } }) // Wartortle
    expect(min(6).level).toBe(36) // Charizard
    expect(min(130).level).toBe(20) // Gyarados
    expect(min(149).level).toBe(55) // Dragonite: above the cap
    expect(min(635).level).toBe(64) // Hydreigon
  })
  it('is lower when the species is met wild lower in a fixed-level area', () => {
    expect(min(25)).toMatchObject({ level: 3, reason: { kind: 'wild' } }) // Pikachu, though Pichu evolves at 30
    expect(min(148).level).toBe(25) // Dragonair, wild in the Safari Zone under Dratini's 30
  })
  it('takes the pre-evolution’s minimum for an item or a trade evolution', () => {
    expect(min(26)).toMatchObject({ level: 3, reason: { kind: 'via', from: 25, how: 'item' } }) // Raichu = Pikachu
    expect(min(64).level).toBe(16) // Kadabra
    expect(min(65)).toMatchObject({ level: 16, reason: { kind: 'via', from: 64, how: 'trade' } }) // Alakazam = Kadabra
  })
  it('starts at Lv.1 with no pre-evolution', () => {
    expect(min(16)).toMatchObject({ level: 1, reason: { kind: 'base' } }) // Pidgey
  })
})

describe('the arrival level', () => {
  it('is the level of the Pokémon given, raised to the minimum, capped at 50', () => {
    expect(arrivalLevel(data, 8, 12)).toMatchObject({ level: 16, raised: true }) // Charmander Lv.12 → Wartortle 16
    expect(arrivalLevel(data, 4, 34)).toMatchObject({ level: 34, raised: false, capped: false })
    expect(arrivalLevel(data, 130, 5).level).toBe(20)
    expect(arrivalLevel(data, 129, 41).level).toBe(41)
    expect(arrivalLevel(data, 149, 10)).toMatchObject({ level: 55, raised: true }) // Dragonite's own minimum
    expect(arrivalLevel(data, 147, 62)).toMatchObject({ level: 50, capped: true }) // Dratini at the cap
  })
  it('follows the admin’s cap', () => {
    const d = makeData({ trade: { ...TRADE, levelCap: 30 } })
    expect(arrivalLevel(d, 4, 45).level).toBe(30)
  })
})

describe('trade evolutions (§1.5)', () => {
  it('never happen by level', () => {
    const k = mon(64, 40)
    expect(levelEvolutions(k, data)).toEqual([])
    const { inst } = gainXp(k, 50_000, data, createRng(1))
    expect(inst.dex).toBe(64)
    // Graveler and Alola's, Haunter, and the rest of the admin's list.
    expect(levelEvolutions(mon(75, 50), data)).toEqual([])
    expect(levelEvolutions(mon(10110, 50), data)).toEqual([])
    expect(tradeEvolutionOf(data, 93)).toBe(94)
  })
  it('come back by level for a pair taken off the admin’s list', () => {
    const d = makeData({ trade: { ...TRADE, evolveOnTrade: [] } })
    expect(levelEvolutions(createInstance(64, 40, d, 'k', NOW), d).map((e) => e.toDex)).toEqual([65])
  })
  it('evolve the moment they arrive, at the level they arrive at', () => {
    const r = receiveTrade(kanto(), data, { dex: 64 }, 22, NOW, newId)
    expect(r.evolvedTo).toBe(65)
    expect(r.arrival.level).toBe(22)
    const got = r.save.box.find((p) => p.dex === 65)!
    expect(got.level).toBe(22)
    expect(r.save.pokedex).toEqual(expect.arrayContaining([64, 65]))
    expect(r.isNew).toBe(true)
  })
  it('leave item evolutions alone', () => {
    expect(tradeEvolutionOf(data, 95)).toBeNull() // Onix keeps the Metal Coat
  })
})

describe('where it lands, and the one-copy rule (§1.4)', () => {
  it('a new species joins the Box (and the team, with room)', () => {
    const r = receiveTrade(kanto(), data, { dex: 25 }, 12, NOW, newId)
    expect(r.outcome).toBe('new')
    expect(r.save.box.some((p) => p.dex === 25 && p.level === 12)).toBe(true)
    expect(r.save.pokedex).toContain(25)
  })
  it('a stronger one replaces your plain copy in place', () => {
    const old = mon(25, 8)
    const s = { ...kanto(old), team: [old.id] }
    const r = receiveTrade(s, data, { dex: 25 }, 20, NOW, newId)
    expect(r.outcome).toBe('replaced')
    expect(r.save.box.filter((p) => p.dex === 25)).toHaveLength(1)
    expect(r.save.box.find((p) => p.id === old.id)!.level).toBe(20)
    expect(r.save.team).toContain(old.id)
  })
  it('as strong or weaker, it merges into yours', () => {
    const s = kanto(mon(25, 30))
    const r = receiveTrade(s, data, { dex: 25 }, 12, NOW, newId)
    expect(r.outcome).toBe('merged')
    expect(r.save.box.filter((p) => p.dex === 25)).toHaveLength(1)
  })
  it('a shiny is always its own Pokémon', () => {
    const s = kanto(mon(25, 30))
    const r = receiveTrade(s, data, { dex: 25, shiny: true }, 12, NOW, newId)
    expect(r.outcome).toBe('shiny')
    expect(r.save.box.filter((p) => p.dex === 25)).toHaveLength(2)
  })
  it('lands in its home region’s Box, parked or not', () => {
    const s = withJohto(kanto())
    expect(regionOf(s)).toBe('kanto')
    const r = receiveTrade(s, data, { dex: 161 }, 9, NOW, newId) // Sentret, Johto
    expect(r.region).toBe('johto')
    expect(r.save.parked!.johto!.box.some((p) => p.dex === 161)).toBe(true)
    expect(r.save.box.some((p) => p.dex === 161)).toBe(false)
    expect(homeRegionOf(data, 10091)).toBe('alola') // Alolan Rattata
  })
})

describe('what can be traded', () => {
  it('never legendaries, mythicals, the Ultra Beasts or a Mega form', () => {
    expect(untradable(data, 150)).toBe('legendary')
    expect(untradable(data, 151)).toBe('legendary')
    expect(untradable(data, 793)).toBe('excluded')
    expect(untradable(data, 10034)).toBe('excluded') // Mega Charizard X
    expect(untradable(data, 25)).toBeNull()
  })
  it('not a fossil still reviving, nor a region’s last Pokémon', () => {
    const fossil = mon(138, 5, { revivesAt: NOW + 1000 })
    const s = kanto(fossil)
    const at = (id: string) => everyRegionBox(s, data).find((m) => m.inst.id === id)!
    expect(tradeBlocked(s, data, at(fossil.id))).toBe('reviving')
    // The starter is the only other one: it is the last that can play.
    expect(tradeBlocked(s, data, at(s.team[0]!))).toBe('last')
    const two = kanto(mon(16, 5))
    expect(tradeBlocked(two, data, everyRegionBox(two, data)[0]!)).toBeNull()
  })
  it('asks only for species of the regions started, legendaries out', () => {
    const w = wantable(kanto(), data)
    expect(w).toContain(25)
    expect(w).not.toContain(150)
    expect(w).not.toContain(158)
    expect(wantable(withJohto(kanto()), data)).toContain(158)
  })
})

describe('a listing’s snapshot of its poster', () => {
  const s = kanto(mon(25, 20), mon(129, 10, { shiny: true }))
  const snap = tradeSnapshot(s, data)
  it('knows what’s in each species’ home Box', () => {
    expect(snap.regions).toEqual(['kanto'])
    expect(snap.shiny).toEqual([129])
  })
  it('answers the three wants', () => {
    expect(wantMatches({ kind: 'species', dex: 25 }, { dex: 25 }, snap)).toBe(true)
    expect(wantMatches({ kind: 'species', dex: 25 }, { dex: 26 }, snap)).toBe(false)
    expect(wantMatches({ kind: 'notOwned' }, { dex: 25 }, snap)).toBe(false) // has one
    expect(wantMatches({ kind: 'notOwned' }, { dex: 26 }, snap)).toBe(true)
    expect(wantMatches({ kind: 'notOwned' }, { dex: 25, shiny: true }, snap)).toBe(true) // no shiny Pikachu
    expect(wantMatches({ kind: 'notOwned' }, { dex: 129, shiny: true }, snap)).toBe(false) // has a shiny Magikarp
    expect(wantMatches({ kind: 'any' }, { dex: 25 }, snap)).toBe(true)
  })
})

describe('listing out and back', () => {
  const listing = {
    id: 'L1',
    code: 'K7QM4XD9',
    endsAt: NOW + 3 * 86_400_000,
    want: { kind: 'any' as const },
    visibility: 'public' as const,
  }
  it('takes it out of its Box and team, and the next one steps in', () => {
    const p = mon(25, 12)
    const s = { ...kanto(p), team: [p.id] }
    const out = listOut(s, data, p.id, listing, NOW)!
    expect(out.box.some((x) => x.id === p.id)).toBe(false)
    expect(out.team).toHaveLength(1)
    expect(out.team).not.toContain(p.id)
    expect(tradesOf(out).out[0]).toMatchObject({ listing: 'L1', region: 'kanto', mon: { id: p.id } })
  })
  it('brings it back by the catch rule', () => {
    const p = mon(25, 12)
    const out = listOut(kanto(p), data, p.id, listing, NOW)!
    const back = listBack(out, data, 'L1')!
    expect(back.outcome).toBe('new')
    expect(back.save.box.some((x) => x.id === p.id)).toBe(true)
    // Meanwhile a stronger Pikachu: the listed one merges into it.
    const stronger = { ...out, box: [...out.box, mon(25, 40)] }
    expect(listBack(stronger, data, 'L1')!.outcome).toBe('merged')
  })
  it('survives the save’s schema', () => {
    const p = mon(25, 12)
    const out = listOut(kanto(p), data, p.id, listing, NOW)!
    const parsed = parseSave(JSON.parse(JSON.stringify(out)))
    expect(parsed.ok && tradesOf(parsed.save).out[0]!.listing).toBe('L1')
  })
})

describe('a trade, applied once on each side', () => {
  it('the taker gives theirs for good and gets the listed one at that level', () => {
    const given = mon(16, 22)
    const s = kanto(given)
    const listed = mon(4, 12)
    const t = { id: 'T1', listed, given, with: 'Misty' }
    const r = applyTake(s, data, t, NOW, newId)
    expect(r.save.box.some((p) => p.id === given.id)).toBe(false)
    expect(r.save.box.find((p) => p.dex === 4)!.level).toBe(22)
    expect(r.save.pokedex).toContain(16) // the Pokédex entry stays
    expect(tradesOf(r.save).log![0]).toMatchObject({
      role: 'taker',
      with: 'Misty',
      got: { dex: 4, level: 22 },
    })
    const again = applyTake(r.save, data, t, NOW, newId)
    expect(again.already).toBe(true)
    expect(again.save).toBe(r.save)
  })
  it('the poster’s listing goes, theirs arrives at the listed level, the gold dot waits', () => {
    const listedInst = mon(4, 12)
    const s = listOut(
      kanto(listedInst),
      data,
      listedInst.id,
      { id: 'T2', code: 'C', endsAt: NOW + 1, want: { kind: 'species', dex: 8 }, visibility: 'public' },
      NOW,
    )!
    const r = applyTaken(
      s,
      data,
      { id: 'T2', listed: listedInst, given: mon(8, 34), with: 'Misty' },
      NOW,
      newId,
    )
    expect(tradesOf(r.save).out).toHaveLength(0)
    expect(r.received!.arrival).toMatchObject({ level: 16, raised: true }) // Wartortle's minimum
    expect(tradesOf(r.save).unseen).toEqual(['T2'])
    expect(
      applyTaken(r.save, data, { id: 'T2', listed: listedInst, given: mon(8, 34), with: 'Misty' }, NOW, newId)
        .already,
    ).toBe(true)
  })
  it('a listing taken while away waits to be watched, oldest first, until its scene has played', () => {
    const a = mon(4, 12)
    const b = mon(7, 12)
    let s = kanto(a, b)
    for (const [id, inst] of [
      ['W1', a],
      ['W2', b],
    ] as const)
      s = listOut(
        s,
        data,
        inst.id,
        { id, code: id, endsAt: NOW + 1, want: { kind: 'any' }, visibility: 'public' },
        NOW,
      )!
    s = applyTaken(s, data, { id: 'W1', listed: a, given: mon(16, 9), with: 'Misty' }, NOW, newId).save
    s = applyTaken(s, data, { id: 'W2', listed: b, given: mon(19, 9), with: 'Brock' }, NOW + 1, newId).save
    // A trade you took yourself was watched as it happened.
    s = applyTake(
      s,
      data,
      { id: 'W3', listed: mon(25, 9), given: mon(16, 9), with: 'Sora' },
      NOW + 2,
      newId,
    ).save
    expect(tradesToWatch(s).map((e) => e.with)).toEqual(['Misty', 'Brock'])
    expect(tradesToWatch(markTradesSeen(s, ['W1'])).map((e) => e.id)).toEqual(['W2'])
  })
  it('an unseen trade that falls out of the log no longer waits (nor keeps the gold dot)', () => {
    const p = mon(4, 12)
    const want = { kind: 'any' } as const
    let s = listOut(
      kanto(p),
      data,
      p.id,
      { id: 'OLD', code: 'C', endsAt: NOW + 1, want, visibility: 'public' },
      NOW,
    )!
    s = applyTaken(s, data, { id: 'OLD', listed: p, given: mon(16, 9), with: 'Misty' }, NOW, newId).save
    expect(tradesOf(s).unseen).toEqual(['OLD'])
    for (let i = 0; i < 20; i++)
      s = applyTake(
        s,
        data,
        { id: `N${i}`, listed: mon(19, 5), given: mon(16, 5), with: 'Sora' },
        NOW + i,
        newId,
      ).save
    expect(tradesOf(s).unseen).toEqual([])
    expect(tradesToWatch(s)).toEqual([])
  })
  it('an ended listing gives its Pokémon back once', () => {
    const p = mon(25, 12)
    const s = listOut(
      kanto(p),
      data,
      p.id,
      { id: 'T3', code: 'C', endsAt: NOW, want: { kind: 'any' }, visibility: 'private' },
      NOW,
    )!
    const r = applyEnded(s, data, 'T3')
    expect(r.save.box.some((x) => x.id === p.id)).toBe(true)
    expect(applyEnded(r.save, data, 'T3').already).toBe(true)
  })
})

describe('going back to an older copy of the save (a backup)', () => {
  it('is refused once a trade was done since: the Pokémon given away would come back', () => {
    const given = mon(16, 22)
    const before = kanto(given)
    const after = applyTake(
      before,
      data,
      { id: 'T1', listed: mon(4, 12), given, with: 'Misty' },
      NOW,
      newId,
    ).save
    expect(missesTrades(before, after)).toBe(true)
    // Going forward (the backup knows the trade) or nothing traded since: fine.
    expect(missesTrades(after, before)).toBe(false)
    expect(missesTrades(after, after)).toBe(false)
  })
  it('is allowed after a listing that only ended: its Pokémon comes back to the Box either way', () => {
    const p = mon(25, 12)
    const listed = listOut(
      kanto(p),
      data,
      p.id,
      { id: 'T3', code: 'C', endsAt: NOW, want: { kind: 'any' }, visibility: 'private' },
      NOW,
    )!
    expect(missesTrades(listed, applyEnded(listed, data, 'T3').save)).toBe(false)
  })
})

describe('tidying up with the server', () => {
  it('moves out a listed Pokémon an older copy of the save still has in its Box', () => {
    const p = mon(25, 12)
    const s = kanto(p)
    const open = [
      {
        id: 'L9',
        code: 'C',
        region: 'kanto',
        inst: p,
        endsAt: NOW + 1,
        want: { kind: 'any' as const },
        visibility: 'public' as const,
        at: NOW,
      },
    ]
    const next = reconcileListings(s, data, open, new Set())
    expect(next.box.some((x) => x.id === p.id)).toBe(false)
    expect(tradesOf(next).out.map((o) => o.listing)).toEqual(['L9'])
  })
  it('gives back a listing the server no longer knows', () => {
    const p = mon(25, 12)
    const s = listOut(
      kanto(p),
      data,
      p.id,
      { id: 'L8', code: 'C', endsAt: NOW, want: { kind: 'any' }, visibility: 'public' },
      NOW,
    )!
    const next = reconcileListings(s, data, [], new Set())
    expect(tradesOf(next).out).toHaveLength(0)
    expect(next.box.some((x) => x.id === p.id)).toBe(true)
  })
})

describe('who can trade', () => {
  it('needs the switch, the main save and the badges', () => {
    const s = kanto()
    expect(tradeClosed(s, makeData())).toBe('off') // Off by default
    expect(tradeClosed(s, data)).toBeNull()
    expect(tradeClosed({ ...s, mode: 'extreme' }, data)).toBe('extreme')
    expect(tradeClosed(s, makeData({ trade: { ...TRADE, minBadges: 2 } }))).toBe('badges')
  })
})

describe('taking a listing, as the screens show it', () => {
  const poster = (has: number[] = [], regions = ['kanto']) => ({ ...encodeDexSet(has), shiny: [], regions })

  it('offers the Pokémon that answer the want, the ones that can’t go last with why', () => {
    const pidgey = mon(16, 22)
    const s = kanto(pidgey)
    const choices = takeChoices(s, data, { kind: 'species', dex: 16 }, poster())
    expect(choices.map((c) => [c.at.inst.id, c.why])).toEqual([[pidgey.id, null]])
    // A poster who hasn't started Johto can't receive a Totodile.
    const j = withJohto(kanto())
    const johto = j.parked!.johto!
    const t = { ...j, parked: { ...j.parked, johto: { ...johto, box: [...johto.box, mon(161, 5)] } } }
    const toto = takeChoices(t, data, { kind: 'species', dex: 158 }, poster())
    expect(toto[0]!.why).toBe('region')
    // Any I don't own: not one the poster has.
    expect(takeChoices(s, data, { kind: 'notOwned' }, poster([16, 4])).map((c) => c.at.inst.dex)).toEqual([])
  })

  it('says why a listing can’t be taken: its region, the day’s cap, nothing matching', () => {
    const s = kanto(mon(16, 22))
    const l = { dex: 4, want: { kind: 'species' as const, dex: 16 }, poster: poster() }
    expect(takeBlock(s, data, l, NOW)).toBeNull()
    expect(takeBlock(s, data, { ...l, dex: 158 }, NOW)).toBe('region')
    expect(takeBlock(s, data, { ...l, want: { kind: 'species', dex: 7 } }, NOW)).toBe('no_match')
    const log = Array.from({ length: TRADE.tradesPerDay }, (_, i) => ({
      id: `x${i}`,
      at: NOW,
      role: 'taker' as const,
      with: 'Misty',
      gave: { dex: 1, level: 5 },
      got: { dex: 4, level: 5 },
      outcome: 'new' as const,
    }))
    const capped = { ...s, trades: { out: [], done: [], log } }
    expect(tradesTakenToday(capped, NOW)).toBe(TRADE.tradesPerDay)
    expect(takeBlock(capped, data, l, NOW)).toBe('daily_cap')
    // A new UTC day.
    expect(takeBlock(capped, data, l, NOW + 86_400_000)).toBeNull()
  })

  it('previews what a trade brings without doing it', () => {
    const given = mon(16, 22)
    const s = kanto(given, mon(64, 10))
    const p = previewTake(s, data, { dex: 64 }, given)
    expect(p.received.evolvedTo).toBe(65)
    expect(p.received.arrival.level).toBe(22)
    expect(p.mine).toBeNull() // no Alakazam yet
    expect(s.box.some((m) => m.id === given.id)).toBe(true)
    const weak = previewTake(kanto(given, mon(19, 30)), data, { dex: 19 }, given)
    expect(weak).toMatchObject({ received: { outcome: 'merged' }, mine: 30 })
  })

  it('calls a species NEW when the Pokédex it lands in lacks it', () => {
    const s = kanto()
    expect(newForTrade(s, data, 4)).toBe(false)
    expect(newForTrade(s, data, 25)).toBe(true)
  })
})

describe('small worlds: no trade reaches one (docs/21)', () => {
  const held: WorldSave = { id: 'isle', regionId: 'w-isle', from: 'kanto', partner: 25 }
  /** Kanto live, with a small world parked (its own Box). */
  function parkedWorld(): SaveData {
    const s = kanto(mon(16, 12))
    return {
      ...s,
      parked: {
        'w-isle': {
          gold: 0,
          pokedex: [25, 7],
          box: [mon(25, 12), mon(7, 9)],
          team: [],
          inventory: {},
          comboLevels: {},
          dieLevels: {},
          currentAreaId: s.currentAreaId,
          areaProgress: {},
        },
      },
      events: { ...s.events, world: held },
    } as unknown as SaveData
  }

  it('never offers a world’s Pokémon, nor counts its region as started', () => {
    const s = parkedWorld()
    expect(tradeChoices(s, data).some((m) => m.region === 'w-isle')).toBe(false)
    expect(tradeRegions(s, data)).not.toContain('w-isle')
    expect(tradeClosed(s, data)).toBeNull()
  })

  it('is closed while the player is inside one, and lands nothing there', () => {
    const s = parkedWorld()
    const w = s.parked!['w-isle']!
    // Inside: the world's block is the live one, Kanto's is parked.
    const inside = {
      ...s,
      ...w,
      region: 'w-isle',
      parked: {
        kanto: {
          gold: s.gold,
          pokedex: s.pokedex,
          box: s.box,
          team: s.team,
          inventory: s.inventory,
          comboLevels: s.comboLevels,
          dieLevels: s.dieLevels,
          currentAreaId: s.currentAreaId,
          areaProgress: s.areaProgress,
        },
      },
    } as SaveData
    expect(tradeClosed(inside, data)).toBe('world')
    expect(tradeChoices(inside, data).some((m) => m.region === 'w-isle')).toBe(false)
    // A Pokémon owed meanwhile (a check run before entering) goes to a real region's Box, never the world's.
    const r = receiveTrade(inside, data, { dex: 4 }, 20, NOW, newId)
    expect(r.region).not.toBe('w-isle')
  })
})
