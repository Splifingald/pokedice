// The Elite Rebattle (docs/18, docs/19 phase 3): a region's League again in three tiers, once it's won. Kanto's
// Champion seat is the rival, one version per starter, met as the character the player didn't pick. A tier is a
// gauntlet; each Pokémon pays once per tier; a loss starts the tier over, healed. Victory Road II and League II are gone
// and old saves standing there go back to their League.
import { describe, expect, it } from 'vitest'
import {
  applyRebattleKO,
  applyRebattleLoss,
  createRng,
  currentTier,
  emptyProgress,
  eventUnlocked,
  instanceMaxHp,
  LEAGUE_II,
  leagueArea,
  migrateLeagueII,
  newRegionBlock,
  newSave,
  createInstance,
  rebattleComplete,
  rebattleEncounter,
  rebattleGold,
  rebattleLineup,
  rebattleOnHome,
  rebattleOpen,
  rebattleProgress,
  rebattleUpgradeLevel,
  startRegion,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const KANTO_LEAGUE = leagueArea(data, 'kanto')!

const save = (starter: number, character?: 'red' | 'green'): SaveData =>
  newSave(starter, data, 0, newId, character ? { name: 'ASH', character } : undefined)
/** The Kanto League won. */
const champion = (s: SaveData): SaveData => ({ ...s, areaProgress: { ...s.areaProgress, [KANTO_LEAGUE.id]: { ...emptyProgress(), cleared: true } } })

/** Every K.O. of the current trainer, as the store reports them. */
function beatTrainer(s: SaveData): { save: SaveData; events: ReturnType<typeof applyRebattleKO>['events'] } {
  const enc = rebattleEncounter(s, data, 'kanto')
  if (enc?.kind !== 'gym') throw new Error('no fight')
  const tier = currentTier(s, data, 'kanto')
  let next = s
  const events: ReturnType<typeof applyRebattleKO>['events'] = []
  enc.team.forEach((m, index) => {
    const r = applyRebattleKO(
      next,
      { regionId: 'kanto', tier, trainerId: enc.trainerId, index, last: index === enc.team.length - 1, enemyLevel: m.level, fighterUid: next.team[0]! },
      data,
      createRng(index + 1),
    )
    next = r.save
    events.push(...r.events)
  })
  return { save: next, events }
}

describe('the Elite Rebattle opens', () => {
  it('once the region’s League is won, and only that region’s is fought', () => {
    const s = save(1)
    expect(rebattleOpen(s, data, 'kanto')).toBe(false)
    expect(eventUnlocked('rebattle', s, data)).toBe(false)
    const won = champion(s)
    expect(rebattleOpen(won, data, 'kanto')).toBe(true)
    expect(eventUnlocked('rebattle', won, data)).toBe(true)
    expect(rebattleOnHome(won, data)).toBe(true)
    // Off to Johto: Kanto's rebattle stays open, but it can't be fought from there.
    const johto = data.regions.find((r) => r.id === 'johto')!
    const away = startRegion(won, johto, newRegionBlock(johto, 152, data, 1, newId, createInstance))
    expect(rebattleOpen(away, data, 'kanto')).toBe(true)
    expect(rebattleEncounter(away, data, 'kanto')).toBeNull()
    expect(rebattleOnHome(away, data)).toBe(false)
  })

  it('needs a lineup: a region without one has no rebattle', () => {
    const bare = makeData({ rebattleLineups: {} })
    expect(eventUnlocked('rebattle', champion(save(1)), bare)).toBe(false)
  })
})

describe('the rival Champion', () => {
  it.each([
    [1, 6, 130],
    [4, 9, 59],
    [7, 3, 59],
  ])('a player who started with #%i faces #%i with #%i and Raichu, at the tier’s levels', (starter, ace, second) => {
    const lineup = rebattleLineup(champion(save(starter)), data, 'kanto', 0)
    expect(lineup.map((t) => t.role)).toEqual(['elite', 'elite', 'elite', 'elite', 'champion'])
    expect(lineup.at(-1)!.team).toEqual([
      { dex: 26, level: 69 },
      { dex: second, level: 71 },
      { dex: ace, level: 73 },
    ])
  })

  it('is the character the player did not pick', () => {
    expect(rebattleLineup(champion(save(4, 'red')), data, 'kanto', 0).at(-1)).toMatchObject({
      name: 'Champion Green',
      spriteUrl: '/characters/green.png',
    })
    expect(rebattleLineup(champion(save(4, 'green')), data, 'kanto', 2).at(-1)).toMatchObject({
      name: 'Champion Red',
      spriteUrl: '/characters/red.png',
    })
  })
})

describe('the gauntlet', () => {
  it('starts with the first Elite Four member, a League battle at the tier’s upgrade level', () => {
    const enc = rebattleEncounter(champion(save(1)), data, 'kanto')
    expect(enc).toMatchObject({ kind: 'gym', role: 'elite', index: 1, total: 5, badge: null, rebattle: { regionId: 'kanto', tier: 0 } })
    const base = KANTO_LEAGUE.enemyUpgradeLevel ?? data.config.enemyUpgradeLevel
    expect(rebattleUpgradeLevel(data, 'kanto', 0)).toBe(Math.min(10, base + 1))
    expect(rebattleUpgradeLevel(data, 'kanto', 2)).toBe(10)
  })

  it('pays each Pokémon once per tier, at the tier’s multiplier', () => {
    const s = champion(save(1))
    const enc = rebattleEncounter(s, data, 'kanto')!
    if (enc.kind !== 'gym') throw new Error('no fight')
    const first = enc.team[0]!
    const ko = (from: SaveData) =>
      applyRebattleKO(
        from,
        { regionId: 'kanto', tier: 0, trainerId: enc.trainerId, index: 0, last: false, enemyLevel: first.level, fighterUid: from.team[0]! },
        data,
        createRng(1),
      )
    const once = ko(s)
    const gold = rebattleGold(data, 'kanto', 0, first.level)
    expect(gold).toBeGreaterThan(0)
    expect(once.save.gold).toBe(s.gold + gold)
    expect(once.events).toContainEqual({ kind: 'gold', amount: gold })
    // Lost, then beaten again: no more ₽ from that Pokémon.
    const again = ko(applyRebattleLoss(once.save, data, 'kanto'))
    expect(again.save.gold).toBe(once.save.gold)
    expect(again.events.some((e) => e.kind === 'gold')).toBe(false)
  })

  it('moves on trainer by trainer; the last one clears the tier and opens the next', () => {
    let s = champion(save(1))
    for (let i = 0; i < 4; i++) {
      const r = beatTrainer(s)
      expect(r.events).toContainEqual(expect.objectContaining({ kind: 'gym_defeated', role: 'elite', badge: null }))
      s = r.save
      expect(rebattleProgress(s, 'kanto')).toMatchObject({ done: 0, step: i + 1 })
    }
    const champ = beatTrainer(s)
    expect(champ.events).toContainEqual({ kind: 'rebattle_cleared', regionId: 'kanto', tier: 0 })
    expect(rebattleProgress(champ.save, 'kanto')).toMatchObject({ done: 1, step: 0 })
    expect(currentTier(champ.save, data, 'kanto')).toBe(1)
    // No badge, no area progress: the League's own record is untouched.
    expect(champ.save.areaProgress[KANTO_LEAGUE.id]).toEqual(s.areaProgress[KANTO_LEAGUE.id])
  })

  it('a loss sends the player back to the first trainer, healed, keeping the ₽', () => {
    let s = beatTrainer(champion(save(1))).save
    s = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }
    const lost = applyRebattleLoss(s, data, 'kanto')
    expect(rebattleProgress(lost, 'kanto').step).toBe(0)
    expect(rebattleProgress(lost, 'kanto').paid).toEqual(rebattleProgress(s, 'kanto').paid)
    expect(lost.gold).toBe(s.gold)
    for (const p of lost.box.filter((p) => lost.team.includes(p.id))) expect(p.currentHp).toBe(instanceMaxHp(p, data))
  })

  it('leaves Home once every tier is cleared', () => {
    let s = champion(save(1))
    for (let tier = 0; tier < 3; tier++) for (let i = 0; i < 5; i++) s = beatTrainer(s).save
    expect(rebattleComplete(s, data, 'kanto')).toBe(true)
    expect(rebattleOnHome(s, data)).toBe(false)
  })
})

describe('Victory Road II and League II are gone', () => {
  const ROAD2 = '35c40458-61da-5321-adda-6df33b930671'
  const INDIGO2 = '2737f8c1-713a-54d8-986e-30b92f7c4a8f'

  it('from the game', () => {
    for (const id of Object.keys(LEAGUE_II)) expect(data.areas.some((a) => a.id === id), id).toBe(false)
    for (const league of new Set(Object.values(LEAGUE_II))) expect(data.areas.some((a) => a.id === league), league).toBe(true)
  })

  it('a save standing there goes back to its League; their progress goes, nothing else changes', () => {
    const s = save(1)
    const old: SaveData = {
      ...s,
      currentAreaId: INDIGO2,
      areaProgress: { ...s.areaProgress, [ROAD2]: { ...emptyProgress(), cleared: true }, [INDIGO2]: { ...emptyProgress(), roundsDone: 2 } },
      parked: {
        johto: {
          ...newRegionBlock(data.regions.find((r) => r.id === 'johto')!, 152, data, 1, newId, createInstance),
          currentAreaId: '82775277-caba-462e-8209-c08d46b403e6',
        },
      },
    }
    const moved = migrateLeagueII(old)
    expect(moved.currentAreaId).toBe(KANTO_LEAGUE.id)
    expect(moved.areaProgress[ROAD2]).toBeUndefined()
    expect(moved.areaProgress[INDIGO2]).toBeUndefined()
    expect(moved.parked!.johto!.currentAreaId).toBe('1ab44ea6-29c0-51c0-9a1f-e1a4b77cfc74')
    expect(moved.box).toBe(old.box)
    expect(moved.gold).toBe(old.gold)
    expect(migrateLeagueII(s)).toBe(s)
  })
})
