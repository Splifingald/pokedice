import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  applyFieldItem,
  buildLootDeck,
  catchChance,
  catchTarget,
  createBattle,
  createInstance,
  createRng,
  drawLoot,
  emptyProgress,
  emptyStatus,
  fledLegendary,
  getInstance,
  linearAreas,
  lootPoolFor,
  MONEY,
  newSave,
  nextEncounter,
  pickUpItem,
  progressOf,
  recordDraws,
  reduce,
  rollCatch,
  shopStock,
  teamAverageLevel,
  teamOf,
  uniformLevels,
  type Area,
  type GameData,
  type LootEntry,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'
import { effectText } from '@/i18n/text'

const ROUTE1 = linearAreas(data)[0]!
const SEAFOAM = data.areas.find((a) => a.name === 'Seafoam Islands')!
const fresh = () => newSave(4, data, 0, newId)
const withArea = (area: Area): GameData => ({ ...data, areas: data.areas.map((a) => (a.id === area.id ? area : a)) })
const candy: LootEntry = { id: 'candy', itemKey: 'rare-candy', weight: 50, unique: true, minQty: 1, maxQty: 1 }
const potions: LootEntry = { id: 'pots', itemKey: 'potion', weight: 5, unique: false, minQty: 1, maxQty: 3 }

describe('items', () => {
  it('the classic items are there, with menu text for each effect', () => {
    for (const key of ['potion', 'antidote', 'paralyze-heal', 'burn-heal', 'ice-heal', 'rare-candy', 'poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'ether', 'max-ether'])
      expect(data.items[key], key).toBeDefined()
    expect(effectText(data.items['potion']!)).toBe('+20 HP')
    expect(effectText(data.items['paralyze-heal']!)).toBe('Cures paralysis')
    expect(effectText(data.items['great-ball']!)).toBe('+2 to the catch die')
    expect(effectText(data.items['master-ball']!)).toBe('Never misses')
  })

  it('a new game starts with 5 Poké Balls and 2 Potions', () => {
    expect(fresh().inventory).toEqual({ 'poke-ball': 5, potion: 2 })
  })

  it('the Poké Mart opens its stock badge by badge; the Master Ball and Rare Candy are never sold', () => {
    const at = (badges: number) => new Map(shopStock(data, badges).map((s) => [s.item.key, s.unlocked]))
    expect(at(0).get('poke-ball')).toBe(true)
    expect(at(0).get('great-ball')).toBe(false)
    expect(at(2).get('great-ball')).toBe(true)
    expect(at(8).has('master-ball')).toBe(false)
    expect(at(8).has('rare-candy')).toBe(false)
  })

  it('Rare Candy raises a level from the Team screen, evolving on the way', () => {
    const s0 = fresh()
    const id = s0.team[0]!
    const s = { ...s0, inventory: { 'rare-candy': 2 }, box: s0.box.map((p) => ({ ...p, level: 15 })) }
    const r = applyFieldItem(s, 'rare-candy', id, data, createRng(1))!
    expect(getInstance(r.save, id)).toMatchObject({ level: 16, dex: 5 }) // Charmander → Charmeleon at 16
    expect(r.save.inventory['rare-candy']).toBe(1)
    expect(r.save.pokedex).toContain(5)
    expect(r.events.some((e) => e.kind === 'evolve')).toBe(true)
    expect(applyFieldItem(s, 'ether', id, data, createRng(1))).toBeNull() // battle only
  })
})

describe('loot', () => {
  it('every area but Faraway Island has a loot table', () => {
    expect(ROUTE1.lootPool.length).toBeGreaterThan(0)
    expect(data.areas.find((a) => a.name === 'Faraway Island')!.lootPool).toHaveLength(0)
    expect(data.areas.find((a) => a.name === 'Silph Co.')!.lootPool.some((e) => e.itemKey === 'master-ball' && e.unique)).toBe(true)
  })

  it('a loot weight is its number of copies; a one-time find gets one card per loot deck', () => {
    const deck = buildLootDeck([candy, potions], createRng(3)) // candy weight 50, but once-only
    expect(deck.filter((id) => id === 'candy')).toHaveLength(1)
    expect(deck.filter((id) => id === 'pots')).toHaveLength(5)
  })

  it('a one-time find leaves the table once picked up', () => {
    const area = { ...ROUTE1, lootPool: [candy] }
    const d = withArea(area)
    const s = fresh()
    const loot = drawLoot(area, progressOf(s, area.id), d, createRng(1))!
    expect(loot.entry.id).toBe('candy')
    const after = pickUpItem(s, area.id, { entryId: 'candy', itemKey: 'rare-candy', qty: loot.qty }, d)
    expect(after.inventory['rare-candy']).toBe(1)
    expect(progressOf(after, area.id).uniqueFound).toEqual(['candy'])
    expect(lootPoolFor(area, progressOf(after, area.id), d)).toHaveLength(0)
    expect(drawLoot(area, progressOf(after, area.id), d, createRng(1))).toBeNull()
  })

  it('Pokédollars go straight to the wallet', () => {
    const s = fresh()
    expect(pickUpItem(s, ROUTE1.id, { entryId: 'x', itemKey: MONEY, qty: 40 }, data).gold).toBe(s.gold + 40)
  })

  it('item finds come from the encounter deck, and both decks are saved', () => {
    let s = fresh()
    const rng = createRng(12)
    const kinds = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const roll = nextEncounter(
        { area: ROUTE1, progress: progressOf(s, ROUTE1.id), data, teamAvgLevel: teamAverageLevel(s), teamHurt: false, isFirstInArea: false, pokedex: s.pokedex },
        rng,
      )
      kinds.add(roll.encounter.kind)
      if (roll.encounter.kind === 'item') expect(roll.lootDeck).not.toBeNull()
      s = recordDraws(s, ROUTE1.id, roll)
    }
    expect(kinds.has('item')).toBe(true)
    expect(progressOf(s, ROUTE1.id).lootDeck).toBeDefined()
  })
})

describe('catching', () => {
  it('the catch die: P(d6 + ball ≥ value)', () => {
    expect(catchChance(1, 0)).toBe(1)
    expect(catchChance(4, 0)).toBe(0.5)
    expect(catchChance(7, 0)).toBe(0)
    expect(catchChance(7, 1)).toBeCloseTo(1 / 6)
    expect(catchChance(9, 3)).toBeCloseTo(1 / 6)
    expect(catchChance(9, 9)).toBe(1)
    const rng = createRng(5)
    const hits = Array.from({ length: 1200 }, () => rollCatch(4, 0, rng)).filter((r) => r.caught).length
    expect(hits / 1200).toBeGreaterThan(0.44)
    expect(hits / 1200).toBeLessThan(0.56)
  })

  it('catch values come from the originals: Pidgey is easy, legendaries need the best balls', () => {
    expect(data.species[16]!.catchValue).toBe(1)
    // Legendaries are the hardest catches (admin-tuned below 9 since).
    for (const dex of [144, 145, 146, 150]) expect(data.species[dex]!.catchValue).toBeGreaterThanOrEqual(6)
  })

  it('new species, or a stronger copy that replaces yours; legendaries are one of a kind', () => {
    const s = fresh() // a Lv.5 Charmander
    expect(catchTarget(s, 16, 3, 'wild', data)).toEqual({ mode: 'new' })
    expect(catchTarget(s, 4, 5, 'wild', data)).toBeNull()
    expect(catchTarget(s, 4, 9, 'wild', data)).toMatchObject({ mode: 'replace', level: 5 })
    const withMoltres = { ...s, pokedex: [...s.pokedex, 146] }
    expect(catchTarget(withMoltres, 146, 60, 'boss', data)).toBeNull()
  })

  it('a stronger copy replaces the weaker one in place', () => {
    const s = fresh()
    const id = s.team[0]!
    const target = catchTarget(s, 4, 12, 'wild', data)!
    const r = applyCatch(s, { dex: 4, level: 12 }, target, data, 9, newId)
    expect(r.caughtId).toBe(id)
    expect(r.save.box).toHaveLength(1)
    expect(teamOf(r.save)[0]).toMatchObject({ id, level: 12, xp: 0 })
    expect(r.events).toContainEqual(expect.objectContaining({ kind: 'caught', replacedLevel: 5, joinedTeam: true }))
  })

  it('a legendary that fled comes back through the encounter deck until caught', () => {
    const s: SaveData = { ...fresh(), areaProgress: { [SEAFOAM.id]: { ...emptyProgress(), xp: 999, bossesDefeated: [144], bossDefeated: true, cleared: true } } }
    expect(fledLegendary(SEAFOAM, progressOf(s, SEAFOAM.id), s.pokedex)?.dex).toBe(144)
    let save = s
    const rng = createRng(4)
    let back = false
    for (let i = 0; i < 30 && !back; i++) {
      const roll = nextEncounter(
        { area: SEAFOAM, progress: progressOf(save, SEAFOAM.id), data, teamAvgLevel: 40, teamHurt: false, isFirstInArea: false, pokedex: save.pokedex },
        rng,
      )
      back = roll.encounter.kind === 'boss' && !!roll.encounter.returning
      save = recordDraws(save, SEAFOAM.id, roll)
    }
    expect(back).toBe(true)
    expect(fledLegendary(SEAFOAM, progressOf(s, SEAFOAM.id), [...s.pokedex, 144])).toBeNull()
  })
})

describe('items in battle', () => {
  // A sturdy Snorlax against a faster Rattata: the enemy moves first, and the Snorlax survives it.
  const battle = () =>
    createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 143, level: 50, hp: 999 }, { uid: 'b', dex: 16, level: 5, hp: 1 }],
        enemy: { dex: 19, level: 3 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
      },
      data,
    ).state

  it('a paralyzed Pokémon can be cured on the spot, and its turn goes ahead', () => {
    const s = battle()
    s.player[0]!.status = { ...emptyStatus(), paralyze: 1 }
    const stunned = reduce(s, { t: 'AI_TURN' }, data, createRng(2)).state
    expect(stunned.phase).toBe('player_stunned')
    const cured = reduce(stunned, { t: 'USE_ITEM', key: 'paralyze-heal' }, data, createRng(2))
    expect(cured.state.phase).toBe('player_roll')
    expect(cured.log).toContainEqual(expect.objectContaining({ kind: 'item', cured: ['paralyze'] }))
    expect(reduce(stunned, { t: 'USE_ITEM', key: 'antidote' }, data, createRng(2)).state).toBe(stunned) // nothing to cure
  })

  it('or it passes: the stun eats the turn', () => {
    const s = battle()
    s.player[0]!.status = { ...emptyStatus(), paralyze: 1 }
    const stunned = reduce(s, { t: 'AI_TURN' }, data, createRng(2)).state
    const passed = reduce(stunned, { t: 'PASS' }, data, createRng(2)).state
    expect(passed.phase).toBe('enemy_turn')
    expect(passed.player[0]!.status.paralyze).toBe(0)
  })

  it('Ethers give rerolls back, never past the maximum', () => {
    const s = reduce(battle(), { t: 'AI_TURN' }, data, createRng(2)).state
    expect(s.phase).toBe('player_roll')
    const a = s.player[0]!
    a.rerollsLeft = a.rerolls - 1
    const r = reduce(s, { t: 'USE_ITEM', key: 'max-ether' }, data, createRng(1))
    expect(r.state.player[0]!.rerollsLeft).toBe(a.rerolls)
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'item', rerolls: 1 }))
    const full = reduce(battle(), { t: 'AI_TURN' }, data, createRng(2)).state
    expect(reduce(full, { t: 'USE_ITEM', key: 'ether' }, data, createRng(1)).state).toBe(full)
    expect(reduce(full, { t: 'USE_ITEM', key: 'poke-ball' }, data, createRng(1)).state).toBe(full) // not a battle item
  })

  it('a caught Pokémon arrives at full HP', () => {
    const r = applyCatch(fresh(), { dex: 16, level: 4 }, { mode: 'new' }, data, 0, newId)
    const p = getInstance(r.save, r.caughtId)!
    expect(p.currentHp).toBe(createInstance(16, 4, data, 'x', 0).currentHp)
  })
})
