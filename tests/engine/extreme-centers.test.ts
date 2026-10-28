// Extreme mode's Pokémon Centers (docs/47): a boon to pick instead of the heal, Centers that run out, the Center a K.O.
// sends, and each boon's effect.
import { describe, expect, it } from 'vitest'
import {
  applyWipe,
  autoAvailable,
  averageTrainerGold,
  boonCenters,
  boonCentersHere,
  boonTargets,
  buffDiceFor,
  centerPotion,
  centerRulesDue,
  createRng,
  DEFAULT_CONFIG,
  donorGold,
  drawCenterBoons,
  evolutionStage,
  HOUR_MS,
  instanceMaxHp,
  isLegendary,
  linearAreas,
  newSave,
  nextEncounter,
  openBoonCenter,
  pendingBoons,
  pickCenterBoon,
  progressOf,
  recordDraws,
  regionSpecies,
  rocketPool,
  roundCenterHere,
  teamAverageLevel,
  teamSwapsOpen,
  wipeCenterDue,
  type Area,
  type CenterBoon,
  type EncounterContext,
  type ExtremeCentersConfig,
  type GameData,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const ON = makeData({ extremeCenters: { ...DEFAULT_CONFIG.extremeCenters, access: 'all' } })
const OFF = makeData()
const withCfg = (
  over: Partial<ExtremeCentersConfig>,
  extreme: Partial<GameData['config']['extreme']> = {},
): GameData =>
  makeData({
    extremeCenters: { ...DEFAULT_CONFIG.extremeCenters, access: 'all', ...over },
    extreme: { ...DEFAULT_CONFIG.extreme, ...extreme },
  })

/** A route of the main chain whose deck deals Center cards and trainers. */
const AREA: Area = linearAreas(ON).find(
  (a) =>
    (a.encounterWeights.center ?? 0) > 0 &&
    a.wildPool.length > 0 &&
    a.trainerPool.length > 0 &&
    a.roundsToClear != null,
)!
/** A secret area: it never completes. */
const SECRET: Area = ON.areas.find((a) => a.roundsToClear == null && a.wildPool.length > 0)!

const extreme = (): SaveData => ({ ...newSave(4, ON, 0, newId), mode: 'extreme', currentAreaId: AREA.id })
const main = (): SaveData => newSave(4, ON, 0, newId)
const lead = (s: SaveData) => s.box.find((p) => p.id === s.team[0])!
const at = (s: SaveData, area: Area, patch: Partial<ReturnType<typeof progressOf>>): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [area.id]: { ...progressOf(s, area.id), ...patch } },
})
/** A team of three from Kanto at `level`, the first at `hp`. */
function team(s: SaveData, dexes: number[], level = 20): SaveData {
  const box = dexes.map((dex, i) => ({
    id: `t${i}`,
    dex,
    level,
    xp: 0,
    currentHp: instanceMaxHp({ dex, level }, ON),
    caughtAt: 0,
  }))
  return { ...s, box, team: box.map((p) => p.id), pokedex: [...new Set([...s.pokedex, ...dexes])] }
}
const hp = (s: SaveData, id: string, value: number, koAt?: number): SaveData => ({
  ...s,
  box: s.box.map((p) => (p.id === id ? { ...p, currentHp: value, ...(koAt != null && { koAt }) } : p)),
})
const ctx = (
  save: SaveData,
  data: GameData,
  area: Area,
  over: Partial<EncounterContext> = {},
): EncounterContext => ({
  area,
  progress: progressOf(save, area.id),
  data,
  teamAvgLevel: teamAverageLevel(save),
  teamHurt: true,
  teamFainted: true,
  isFirstInArea: true,
  pokedex: save.pokedex,
  noCenters: !boonCentersHere(save, area, data),
  boonCenters: boonCenters(save, data),
  wipeCenter: wipeCenterDue(save, area.id, data),
  ...over,
})
/** The save with these boons waiting in AREA. */
const offering = (s: SaveData, offers: CenterBoon[]): SaveData => ({
  ...s,
  extreme: { ...s.extreme, center: { areaId: AREA.id, offers } },
})

describe('the switch', () => {
  it('is off by default, and only an Extreme save has boon Centers', () => {
    expect(DEFAULT_CONFIG.extremeCenters.access).toBe('off')
    expect(boonCenters(extreme(), OFF)).toBe(false)
    expect(boonCenters(extreme(), ON)).toBe(true)
    expect(boonCenters(main(), ON)).toBe(false)
  })

  it("is the admin's alone while On for admin", () => {
    const admin = withCfg({ access: 'admin' })
    expect(boonCenters(extreme(), admin)).toBe(false)
    expect(boonCenters(extreme(), { ...admin, viewer: { admin: true } } as GameData)).toBe(true)
  })

  it("gives way to Extreme mode's own classic Centers", () => {
    expect(boonCenters(extreme(), withCfg({}, { centers: true }))).toBe(false)
  })

  it('turns Idle mode and auto-mode off in Extreme', () => {
    const s = at(extreme(), AREA, { cleared: true })
    const settings = { autoMode: true, playStyle: 'explored' as const }
    expect(autoAvailable(s, OFF, settings, AREA.id)).toBe(true)
    expect(autoAvailable(s, ON, settings, AREA.id)).toBe(false)
  })
})

describe('where Centers come', () => {
  it('a round opens with one, but a completed area has none', () => {
    const s = extreme()
    expect(boonCentersHere(s, AREA, ON)).toBe(true)
    expect(roundCenterHere(s, AREA, ON)).toBe(true)
    const roll = nextEncounter(ctx(s, ON, AREA), createRng(1))
    expect(roll.encounter).toEqual({ kind: 'center', forced: true, reason: 'round' })
    expect(roll.deck).toContain('center')

    const done = at(s, AREA, { cleared: true })
    expect(boonCentersHere(done, AREA, ON)).toBe(false)
    for (let seed = 1; seed <= 20; seed++) {
      const r = nextEncounter(ctx(done, ON, AREA), createRng(seed))
      expect(r.encounter.kind).not.toBe('center')
      expect(r.deck ?? []).not.toContain('center')
    }
  })

  it('never sends one for a hurt or fainted team', () => {
    const s = at(extreme(), AREA, { deck: ['wild', 'wild', 'wild'], drawn: ['center'], round: 1 })
    const r = nextEncounter(
      ctx(s, ON, AREA, { teamHurt: true, teamFainted: true, isFirstInArea: true }),
      createRng(3),
    )
    expect(r.encounter.kind).toBe('wild')
    // An easy area too.
    const easy = { ...AREA, easyMode: true }
    expect(nextEncounter(ctx(s, ON, easy), createRng(3)).encounter.kind).toBe('wild')
  })

  it('a secret area has its very first one only', () => {
    const s = { ...extreme(), currentAreaId: SECRET.id }
    expect(boonCentersHere(s, SECRET, ON)).toBe(true)
    const roll = nextEncounter(ctx(s, ON, SECRET), createRng(1))
    expect(roll.encounter.kind).toBe('center')
    const met = recordDraws(s, SECRET.id, roll)
    expect(progressOf(met, SECRET.id).centerMet).toBe(true)
    expect(boonCentersHere(met, SECRET, ON)).toBe(false)
  })

  it('a main save notes nothing', () => {
    const s = main()
    const roll = nextEncounter(
      ctx(s, ON, AREA, { noCenters: false, boonCenters: false, wipeCenter: false }),
      createRng(1),
    )
    expect(progressOf(recordDraws(s, AREA.id, roll), AREA.id).centerMet).toBeUndefined()
  })
})

describe('a K.O. of the whole team', () => {
  it('starts the round over at a Center that only swaps, even where Centers ran out', () => {
    const s = at(extreme(), AREA, { cleared: true, deck: ['wild'], drawn: ['center', 'wild'], round: 2 })
    const wiped = applyWipe(hp(s, s.team[0]!, 0), AREA.id, ON)
    expect(progressOf(wiped, AREA.id)).toMatchObject({ wiped: true, deck: [] })
    expect(wipeCenterDue(wiped, AREA.id, ON)).toBe(true)
    expect(roundCenterHere(wiped, AREA, ON)).toBe(true)

    const roll = nextEncounter(ctx(wiped, ON, AREA), createRng(2))
    expect(roll.encounter).toEqual({ kind: 'center', forced: true, reason: 'wipe' })
    // No boon there.
    expect(openBoonCenter(wiped, ON, AREA.id, 'wipe', createRng(2))).toBe(wiped)
    // Met, it is spent: the next round opens without it (and this completed area has no other).
    const after = recordDraws(wiped, AREA.id, roll)
    expect(progressOf(after, AREA.id).wiped).toBeUndefined()
    expect(wipeCenterDue(after, AREA.id, ON)).toBe(false)
  })

  it('without the switch, a wipe is as before', () => {
    const s = extreme()
    expect(progressOf(applyWipe(s, AREA.id, OFF), AREA.id).wiped).toBeUndefined()
  })
})

describe('the boons on offer', () => {
  it('the team heal always first, then distinct kinds that can do something now', () => {
    const s = hp(team(extreme(), [1, 4, 7]), 't1', 3)
    for (let seed = 1; seed <= 40; seed++) {
      const offers = drawCenterBoons(s, ON, AREA, createRng(seed))
      expect(offers).toHaveLength(3)
      expect(offers[0]).toEqual({ kind: 'heal', percent: 30 })
      expect(new Set(offers.map((o) => o.kind)).size).toBe(3)
      for (const o of offers) {
        if (o.kind === 'buff') expect(s.team).toContain(o.uid)
        if (o.kind === 'item') expect(['potion', 'revive', 'max-revive']).toContain(o.itemKey)
        if (o.kind === 'donor') expect(o.gold).toBe(donorGold(AREA, ON))
      }
    }
  })

  it('no full heal when everyone is at full HP; no item when Potions are off', () => {
    const full = team(extreme(), [1, 4, 7])
    const noItems = withCfg({}, { items: false })
    for (let seed = 1; seed <= 40; seed++) {
      expect(drawCenterBoons(full, ON, AREA, createRng(seed)).some((o) => o.kind === 'full')).toBe(false)
      expect(drawCenterBoons(full, noItems, AREA, createRng(seed)).some((o) => o.kind === 'item')).toBe(false)
    }
  })

  it('the potion gets better with the badges', () => {
    expect(centerPotion(extreme(), ON)).toBe('potion')
    const region = ON.regions.find((r) => r.id === 'kanto')!
    const gyms = linearAreas(ON, 'kanto').filter((a) => a.gyms.length && a.id !== region.leagueAreaId)
    const withBadges = (n: number) =>
      gyms.slice(0, n).reduce((s, a) => at(s, a, { gymsDefeated: a.gyms }), extreme())
    expect(centerPotion(withBadges(3), ON)).toBe('super-potion')
    expect(centerPotion(withBadges(6), ON)).toBe('hyper-potion')
  })

  it("a donor gives 3 × an average trainer's pay", () => {
    expect(donorGold(AREA, ON)).toBe(Math.round(3 * averageTrainerGold(AREA, ON)))
    expect(donorGold(AREA, ON)).toBeGreaterThan(0)
  })

  it('a Center opened keeps its boons for the pick, and the team waits for it', () => {
    const s = extreme()
    const open = openBoonCenter(s, ON, AREA.id, 'round', createRng(4))
    const offers = pendingBoons(open, AREA.id)!
    expect(offers[0]?.kind).toBe('heal')
    expect(openBoonCenter(open, ON, AREA.id, 'round', createRng(9))).toBe(open)
    expect(teamSwapsOpen(open, ON, { phase: 'center', areaId: AREA.id })).toBe(false)
    expect(teamSwapsOpen(s, ON, { phase: 'center', areaId: AREA.id })).toBe(true)
    expect(openBoonCenter(s, OFF, AREA.id, 'round', createRng(4))).toBe(s)
  })

  it('the rules are due at the first boon Center, once', () => {
    expect(centerRulesDue(extreme(), ON)).toBe(true)
    expect(centerRulesDue({ ...extreme(), extreme: { centerRulesSeen: true } }, ON)).toBe(false)
    expect(centerRulesDue(extreme(), OFF)).toBe(false)
  })
})

describe('taking a boon', () => {
  const rng = () => createRng(7)
  const take = (s: SaveData, boon: CenterBoon, target: string | null = null, now = 1000) =>
    pickCenterBoon(offering(s, [boon]), ON, AREA.id, 0, target, rng(), now, newId)

  it('the team heal: everyone standing, team and Box, never a K.O. one', () => {
    let s = team(extreme(), [1, 4, 7])
    s = hp(hp(s, 't0', 1), 't1', 0, 5)
    const max = instanceMaxHp(s.box[0]!, ON)
    const r = take(s, { kind: 'heal', percent: 30 })!
    expect(r.save.box[0]!.currentHp).toBe(1 + Math.round(max * 0.3))
    expect(r.save.box[1]!.currentHp).toBe(0)
    expect(pendingBoons(r.save, AREA.id)).toBeNull()
  })

  it('the full heal: the one picked, a K.O. one back at once', () => {
    const s = hp(team(extreme(), [1, 4, 7]), 't1', 0, 5)
    expect(boonTargets(s, ON, 'full').map((p) => p.id)).toEqual(['t1'])
    const r = take(s, { kind: 'full' }, 't1')!
    const back = r.save.box.find((p) => p.id === 't1')!
    expect(back.currentHp).toBe(instanceMaxHp(back, ON))
    expect(back.koAt).toBeUndefined()
    // Nobody to heal, or no one named: nothing is taken.
    expect(take(s, { kind: 'full' }, 't0')).toBeNull()
    expect(take(s, { kind: 'full' })).toBeNull()
  })

  it('an item into the bag, a donor’s ₽ into the purse', () => {
    const s = extreme()
    expect(take(s, { kind: 'item', itemKey: 'revive' })!.save.inventory.revive).toBe(
      (s.inventory.revive ?? 0) + 1,
    )
    expect(take(s, { kind: 'donor', gold: 450 })!.save.gold).toBe(s.gold + 450)
  })

  it('a Pokébuff: one more die in its battles for 24 h; a second one starts the clock again', () => {
    const s = team(extreme(), [1, 4, 7])
    const r = take(s, { kind: 'buff', uid: 't0', type: 'grass' }, null, 1000)!
    expect(r.save.box[0]!.buff).toEqual({ type: 'grass', until: 1000 + 24 * HOUR_MS })
    expect(buffDiceFor(r.save, ON, 't0', 1000 + HOUR_MS)).toEqual({ extraDice: ['grass'], diceCap: 8 })
    expect(buffDiceFor(r.save, ON, 't0', 1000 + 24 * HOUR_MS)).toBeNull()
    expect(buffDiceFor(r.save, ON, 't1', 1000)).toBeNull()
    const again = take(r.save, { kind: 'buff', uid: 't0', type: 'poison' }, null, 5000)!
    expect(again.save.box[0]!.buff).toEqual({ type: 'poison', until: 5000 + 24 * HOUR_MS })
  })

  it("Team Rocket's trade: its place in the team, 3 levels higher, at full HP, never a legendary", () => {
    // Ivysaur, a middle stage: what comes back is one too.
    const s = hp(team(extreme(), [2, 4, 7], 20), 't0', 0, 5)
    const pool = rocketPool(s, ON, s.box[0]!)
    expect(pool.length).toBeGreaterThan(0)
    const kanto = regionSpecies(ON, 'kanto')
    for (const dex of pool) {
      expect(kanto.has(dex)).toBe(true)
      expect(isLegendary(ON, dex)).toBe(false)
      expect(evolutionStage(ON, dex)).toBe('middle')
      expect(dex).not.toBe(2)
    }
    for (let seed = 1; seed <= 10; seed++) {
      const r = pickCenterBoon(
        offering(s, [{ kind: 'rocket' }]),
        ON,
        AREA.id,
        0,
        't0',
        createRng(seed),
        1000,
        newId,
      )!
      const got = r.rocket!.got
      expect(r.rocket!.gave.id).toBe('t0')
      expect(r.save.team[0]).toBe(got.id)
      expect(r.save.box.some((p) => p.id === 't0')).toBe(false)
      expect(got.level).toBe(23)
      expect(got.currentHp).toBe(instanceMaxHp(got, ON))
      expect(pool).toContain(got.dex)
      expect(r.save.pokedex).toContain(got.dex)
    }
    // Only a team member can go.
    expect(take(s, { kind: 'rocket' }, 'nobody')).toBeNull()
  })

  it('an evolution stage is read from the lines', () => {
    expect(evolutionStage(ON, 1)).toBe('first')
    expect(evolutionStage(ON, 2)).toBe('middle')
    expect(evolutionStage(ON, 3)).toBe('final')
    expect(evolutionStage(ON, 128)).toBe('final') // Tauros never evolves
  })
})

describe('the save', () => {
  it('keeps the boons waiting, a Pokébuff and the area notes through a reload', () => {
    let s = offering(team(extreme(), [1, 4, 7]), [{ kind: 'heal', percent: 30 }, { kind: 'rocket' }])
    s = {
      ...s,
      box: s.box.map((p, i) => (i === 0 ? { ...p, buff: { type: 'grass' as const, until: 99 } } : p)),
    }
    s = at(s, AREA, { centerMet: true, wiped: true })
    const parsed = parseSave(JSON.parse(JSON.stringify(s)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.save.extreme?.center).toEqual(s.extreme!.center)
    expect(lead(parsed.save).buff).toEqual({ type: 'grass', until: 99 })
    expect(progressOf(parsed.save, AREA.id)).toMatchObject({ centerMet: true, wiped: true })
  })

  it('drops an odd boon list, never the save', () => {
    const s = { ...extreme(), extreme: { center: { areaId: AREA.id, offers: [{ kind: 'nope' }] } } }
    const parsed = parseSave(JSON.parse(JSON.stringify(s)))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.save.extreme?.center).toBeUndefined()
  })
})
