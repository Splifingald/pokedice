// Spear Pillar's race of time and space (docs/61 §4.4): the clock on the server's time from READY!, kept in the save
// (it runs on through a reload); a fork every 3 fights, its two gates each a type (the foes drawn from the area's pool by
// that type) and a find (an item or a time shard of 0:30); the last gate picks the raid (Water: Palkia, Steel: Dialga);
// out of time or a wipe sends the player back to the start, healed, XP and items kept; the one replay once that legend is
// caught (other types, foes +4 levels, 10:00, only the other last gate); one speed and no auto inside; the switch.
import { describe, expect, it } from 'vitest'
import {
  applyWipe,
  arriveAtTimeRace,
  autoAvailable,
  autoLevel,
  canStartTimeRace,
  createInstance,
  createRng,
  DEFAULT_TIME_RACE,
  emptyProgress,
  enterWorld,
  inTimeRace,
  instanceMaxHp,
  isAreaSealed,
  markTimeRaceWonSeen,
  newSave,
  normaliseTimeRace,
  openRaidIn,
  openTimeRaceFork,
  pickTimeRaceGate,
  progressRaidKey,
  progressRaidOf,
  progressRaidState,
  raidRules,
  raidTeamCap,
  startTimeRace,
  teamSwapsOpen,
  timeRaceBattleSpeed,
  timeRaceEncounter,
  timeRaceForkDue,
  timeRaceLeft,
  timeRaceLock,
  timeRaceModeOf,
  timeRaceNoCatch,
  timeRacePlanAt,
  timeRacePool,
  timeRaceStateOf,
  timeRaceTimeUp,
  timeRaceVictoryDue,
  timeRaceVictoryToRaid,
  winTimeRaceFight,
  type GameData,
  type PokeType,
  type SaveData,
  type TimeRaceState,
} from '@/engine'
import { snowglobe } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const h = snowglobe()
const SP = h.areas.find((a) => a.name === 'Spear Pillar')!
const NOW = Date.parse('2026-12-26T12:00:00.000Z')
const world = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (access: 'off' | 'all') =>
  makeDataWith({ areas: h.areas, regions: [h.region] }, { smallWorlds: { access: 'all', list: [world] }, timeRace: { access } })
const data = dataWith('all')
const off = dataWith('off')
const PALKIA = 484
const DIALGA = 483
const MIN = 60_000

/** Inside Snowglobe Valley, standing on Spear Pillar with three Lv.65 Pokémon, hurt. */
function atPillar(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 179, NOW, newId)!
  const team = [181, 508, 733].map((dex) => {
    const p = createInstance(dex, 65, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  return { ...s, box: team, team: team.map((p) => p.id), currentAreaId: SP.id, gold: 500, inventory: { potion: 2 } }
}
const started = (d: GameData = data, at = NOW) => startTimeRace(atPillar(d), d, SP.id, at)!
const race = (s: SaveData) => timeRaceStateOf(s, SP.id)
const withRace = (s: SaveData, patch: Partial<TimeRaceState>): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [SP.id]: { ...emptyProgress(), ...s.areaProgress[SP.id], timeRace: { ...race(s), ...patch } } },
})
const typesOf = (dex: number) => [data.species[dex]!.type1, data.species[dex]!.type2].filter(Boolean)

/** Open the fork due and walk through the gate of `type`. */
function through(s: SaveData, type: PokeType, rng = createRng(1)): SaveData {
  const opened = openTimeRaceFork(s, data, SP.id, rng)!
  const i = race(opened).gates!.findIndex((g) => g.type === type)
  expect(i, `a gate of ${type}`).toBeGreaterThanOrEqual(0)
  return pickTimeRaceGate(opened, data, SP.id, i)!.save
}

/** Win the fights until the next fork (or the end), at `at`. */
function winStretch(s: SaveData, at: number): SaveData {
  let next = s
  for (let i = 0; i < DEFAULT_TIME_RACE.perFork; i++) next = winTimeRaceFight(next, data, SP.id, at)!.save
  return next
}

/** A whole first race, gate by gate, every fight won at `at`, ending at `last`. */
function runRace(s: SaveData, types: PokeType[], at = NOW + MIN): SaveData {
  let next = s
  for (const type of types) next = winStretch(through(next, type), at)
  return next
}
const FIRST: PokeType[] = ['fire', 'dark', 'ice', 'ground']

describe('the area and its switch', () => {
  it('Spear Pillar has the race with the user’s numbers, read only while the switch is on', () => {
    expect(timeRaceModeOf(SP, data)).toEqual(DEFAULT_TIME_RACE)
    expect(DEFAULT_TIME_RACE).toMatchObject({
      forks: [
        ['fire', 'grass'],
        ['dark', 'psychic'],
        ['dragon', 'ice'],
        ['electric', 'ground'],
      ],
      legends: [
        { type: 'water', dex: PALKIA },
        { type: 'steel', dex: DIALGA },
      ],
      perFork: 3,
      seconds: 720,
      shard: { seconds: 30 },
      replay: { forks: [['normal', 'fairy'], ['rock', 'flying'], ['bug', 'dragon'], ['ice', 'dark']], levelBonus: 4, seconds: 600 },
      raid: { level: 70, upgradeLevel: 8, bars: 3, teamCap: 70 },
    })
    expect(timeRacePlanAt(atPillar(), data, SP.id)).toMatchObject({ replay: false, total: 15, seconds: 720 })
    expect(timeRaceModeOf(SP, off)).toBeNull()
  })

  it('cleans what the admin left: odd numbers fall back, odd forks dropped, the legends always two', () => {
    const r = normaliseTimeRace({
      kind: 'timeRace',
      forks: [['fire', 'fire'], ['water', 'nope'], ['rock', 'bug']],
      legends: [{ type: 'water', dex: 484 }],
      perFork: 0,
      seconds: 'x',
      speed: 9,
    })!
    expect(r.forks).toEqual([['rock', 'bug']])
    expect(r.legends).toEqual(DEFAULT_TIME_RACE.legends)
    expect(r.perFork).toBe(1)
    expect(r.seconds).toBe(720)
    expect(r.speed).toBe(3)
    expect(normaliseTimeRace({ kind: 'portal' })).toBeNull()
  })

  it('switched off: no race, the area plays as a plain secret area', () => {
    const s = atPillar(off)
    expect(canStartTimeRace(s, off, SP.id)).toBe(false)
    expect(startTimeRace(s, off, SP.id, NOW)).toBeNull()
    expect(inTimeRace(withRace(s, { active: true }), off, SP.id)).toBe(false)
    expect(isAreaSealed(s, off, SP.id)).toBe(false)
    // Its raids as before: open once the area is cleared.
    const raid = progressRaidOf(off, progressRaidKey(SP.id, DIALGA))!
    expect(progressRaidState(s, off, raid)).toBe('locked')
    const cleared = { ...s, areaProgress: { ...s.areaProgress, [SP.id]: { ...emptyProgress(), cleared: true } } }
    expect(progressRaidState(cleared, off, raid)).toBe('open')
  })

  it('every fork’s type, the replay’s too, has Pokémon of its own in the area’s pool', () => {
    const all = [...DEFAULT_TIME_RACE.forks, ...DEFAULT_TIME_RACE.replay.forks].flat()
    for (const type of [...all, 'water', 'steel'] as PokeType[])
      expect(timeRacePool(SP, data, type).length, type).toBeGreaterThanOrEqual(2)
  })
})

describe('the way in and the clock', () => {
  it('arriving heals as a Center; the team can change until READY!; READY! heals, starts the clock and locks the area', () => {
    const s = atPillar()
    const arrived = arriveAtTimeRace(s, data, SP.id)
    expect(arrived.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
    expect(teamSwapsOpen(s, data, { phase: 'idle', areaId: SP.id })).toBe(true)
    const r = started()
    expect(race(r)).toMatchObject({ active: true, fights: 0, path: [], startedAt: NOW, deadline: NOW + 12 * MIN, tries: 1 })
    expect(r.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
    expect(timeRaceLock(r, data)?.id).toBe(SP.id)
    expect(timeRaceNoCatch(r, data, SP.id)).toBe(true)
    expect(teamSwapsOpen(r, data, { phase: 'idle', areaId: SP.id })).toBe(false)
    expect(canStartTimeRace(r, data, SP.id)).toBe(false)
  })

  it('runs on the server’s time and from the save: a reload later finds the same clock, minutes gone', () => {
    const r = started()
    expect(timeRaceLeft(r, data, SP.id, NOW)).toBe(12 * MIN)
    // The app closed and opened again 5 minutes later: the save read back as it was, the server's clock moved on.
    const reloaded = JSON.parse(JSON.stringify(r)) as SaveData
    expect(timeRaceLeft(reloaded, data, SP.id, NOW + 5 * MIN)).toBe(7 * MIN)
    expect(timeRaceTimeUp(reloaded, data, SP.id, NOW + 5 * MIN)).toBeNull()
    // Closed for 13 minutes: out of time, back to the start on the next look.
    const up = timeRaceTimeUp(reloaded, data, SP.id, NOW + 13 * MIN)!
    expect(up.fights).toBe(0)
    expect(race(up.save)).toMatchObject({ active: false, fights: 0, path: [] })
    expect(timeRaceLock(up.save, data)).toBeNull()
  })
})

describe('the forks', () => {
  it('opens a fork before fights 1, 4, 7, 10 and 13, its gates the fork’s types each with a find', () => {
    let s = started()
    for (let f = 0; f < 5; f++) {
      expect(timeRaceForkDue(s, data, SP.id)).toBe(true)
      expect(timeRaceEncounter(s, data, SP.id, createRng(f))).toBeNull()
      const opened = openTimeRaceFork(s, data, SP.id, createRng(f))!
      const gates = race(opened).gates!
      expect(gates.map((g) => g.type)).toEqual(f < 4 ? DEFAULT_TIME_RACE.forks[f] : ['water', 'steel'])
      for (const g of gates) expect(g.find).not.toBeNull()
      s = winStretch(pickTimeRaceGate(opened, data, SP.id, 0)!.save, NOW + MIN)
      expect(race(s).fights).toBe(Math.min(15, (f + 1) * 3))
      if (f < 4) expect(timeRaceForkDue(s, data, SP.id)).toBe(true)
    }
  })

  it('draws the next three foes of the gate’s type from the area’s pool, at its levels, never the same one twice', () => {
    let s = through(started(), 'grass')
    const met: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = timeRaceEncounter(s, data, SP.id, createRng(10 + i))!
      expect(typesOf(res.encounter.dex)).toContain('grass')
      expect(res.encounter.level).toBeGreaterThanOrEqual(56)
      expect(res.encounter.level).toBeLessThanOrEqual(62)
      expect(res.encounter.shiny).toBeUndefined()
      met.push(res.encounter.dex)
      s = winTimeRaceFight(res.save, data, SP.id, NOW + MIN)!.save
    }
    // Grass has two species in the pool: both come before either comes again.
    expect(new Set(met.slice(0, 2)).size).toBe(2)
  })

  it('a time shard puts 0:30 back on the clock; an item goes into the bag', () => {
    const s = started()
    const opened = openTimeRaceFork(s, data, SP.id, createRng(3))!
    const shard = withRace(opened, {
      gates: [
        { type: 'fire', find: { kind: 'shard', seconds: 30 } },
        { type: 'grass', find: { kind: 'item', key: 'revive', qty: 1 } },
      ],
    })
    const a = pickTimeRaceGate(shard, data, SP.id, 0)!.save
    expect(race(a)).toMatchObject({ path: ['fire'], deadline: NOW + 12 * MIN + 30_000, shards: 1, gates: null })
    const b = pickTimeRaceGate(shard, data, SP.id, 1)!.save
    expect(race(b).deadline).toBe(NOW + 12 * MIN)
    expect(b.inventory.revive).toBe(1)
    expect(pickTimeRaceGate(a, data, SP.id, 0)).toBeNull()
  })

  it('finds are shards about as often as the admin says, else the admin’s items', () => {
    let shards = 0
    const rng = createRng(42)
    for (let i = 0; i < 400; i++) {
      const g = race(openTimeRaceFork(started(), data, SP.id, rng)!).gates!
      for (const x of g) {
        if (x.find?.kind === 'shard') shards++
        else expect(DEFAULT_TIME_RACE.items.map((it) => it.key)).toContain(x.find?.kind === 'item' && x.find.key)
      }
    }
    expect(shards / 800).toBeGreaterThan(0.28)
    expect(shards / 800).toBeLessThan(0.42)
  })
})

describe('how it ends', () => {
  it('the last gate decides the raid: Water opens shiny Palkia’s, Steel shiny Dialga’s, healed, the win due', () => {
    for (const [type, dex, other] of [
      ['water', PALKIA, DIALGA],
      ['steel', DIALGA, PALKIA],
    ] as const) {
      const before = runRace(started(), FIRST)
      const last = through(before, type)
      const w1 = winTimeRaceFight(last, data, SP.id, NOW + 11 * MIN)!
      const w2 = winTimeRaceFight(w1.save, data, SP.id, NOW + 11 * MIN)!
      const hurt = w2.save
      const end = winTimeRaceFight(hurt, data, SP.id, NOW + 11 * MIN)!
      expect(end).toMatchObject({ fights: 15, total: 15, legend: dex, outOfTime: false })
      expect(race(end.save)).toMatchObject({ active: false, won: [dex], wonSeen: false })
      expect(end.save.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
      expect(timeRaceVictoryDue(end.save, data, SP.id)).toBe(true)
      const raid = progressRaidOf(data, progressRaidKey(SP.id, dex))!
      expect(progressRaidState(end.save, data, raid)).toBe('open')
      expect(progressRaidState(end.save, data, progressRaidOf(data, progressRaidKey(SP.id, other))!)).toBe('locked')
      expect(openRaidIn(end.save, data, SP)?.dex).toBe(dex)
      expect(raidRules(data, dex, 'progress', SP.id)).toMatchObject({ level: 70, upgradeLevel: 8, bars: 3 })
      expect(raidTeamCap(data, dex, 'progress', SP.id)).toBe(70)
      // Until that legend is caught the area is only its raid.
      expect(isAreaSealed(end.save, data, SP.id)).toBe(true)
      expect(canStartTimeRace(end.save, data, SP.id)).toBe(false)
      const toRaid = timeRaceVictoryToRaid(end.save, data, SP.id)
      expect(timeRaceVictoryDue(toRaid, data, SP.id)).toBe(false)
    }
  })

  it('out of time: the last fight won a second late counts for nothing, back to the start, XP and items kept', () => {
    let s = through(runRace(started(), FIRST), 'water')
    s = winTimeRaceFight(s, data, SP.id, NOW + 11 * MIN)!.save
    s = winTimeRaceFight(s, data, SP.id, NOW + 11 * MIN)!.save
    s = { ...s, inventory: { ...s.inventory, revive: 3 } }
    const late = winTimeRaceFight(s, data, SP.id, NOW + 12 * MIN + 1000)!
    expect(late).toMatchObject({ outOfTime: true, legend: null, fights: 14 })
    expect(race(late.save)).toMatchObject({ active: false, fights: 0, path: [] })
    expect(race(late.save).won).toBeUndefined()
    expect(late.save.inventory.revive).toBe(3)
    expect(canStartTimeRace(late.save, data, SP.id)).toBe(true)
    // A shard picked up on the way would have saved it.
    const saved = withRace(s, { deadline: NOW + 12 * MIN + 30_000 })
    expect(winTimeRaceFight(saved, data, SP.id, NOW + 12 * MIN + 1000)!.legend).toBe(PALKIA)
  })

  it('a wipe: back to the start, healed, XP, ₽ and items kept, no limit to the tries', () => {
    const s = winStretch(through(started(), 'fire'), NOW + MIN)
    const ko = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 0, xp: 77 })), gold: 900 }
    const w = applyWipe(ko, SP.id, data)
    expect(race(w)).toMatchObject({ active: false, fights: 0, path: [], tries: 1 })
    expect(w.box.every((p) => p.currentHp === instanceMaxHp(p, data) && p.xp === 77)).toBe(true)
    expect(w.gold).toBe(900)
    expect(timeRaceLock(w, data)).toBeNull()
    const again = startTimeRace(w, data, SP.id, NOW + 20 * MIN)!
    expect(race(again)).toMatchObject({ active: true, tries: 2, deadline: NOW + 32 * MIN })
  })
})

describe('the replay', () => {
  /** Palkia won through the race, and caught in its raid. */
  function palkiaCaught(): SaveData {
    let s = through(runRace(started(), FIRST), 'water')
    s = winStretch(s, NOW + 11 * MIN)
    s = markTimeRaceWonSeen(s, SP.id)
    return { ...s, events: { ...s.events, raidsDone: [progressRaidKey(SP.id, PALKIA)] } }
  }

  it('opens once that legend is caught: other types, foes +4 levels, 10:00, then only the other last gate', () => {
    const s = palkiaCaught()
    expect(isAreaSealed(s, data, SP.id)).toBe(false)
    expect(canStartTimeRace(s, data, SP.id)).toBe(true)
    expect(timeRacePlanAt(s, data, SP.id)).toMatchObject({ replay: true, seconds: 600, levelBonus: 4, total: 15 })
    let r = startTimeRace(s, data, SP.id, NOW + 60 * MIN)!
    expect(race(r).deadline).toBe(NOW + 70 * MIN)
    const types: PokeType[] = []
    for (let f = 0; f < 5; f++) {
      const opened = openTimeRaceFork(r, data, SP.id, createRng(f))!
      const gates = race(opened).gates!.map((g) => g.type)
      types.push(...gates)
      if (f === 4) expect(gates).toEqual(['steel'])
      r = pickTimeRaceGate(opened, data, SP.id, 0)!.save
      const foe = timeRaceEncounter(r, data, SP.id, createRng(f))!
      expect(typesOf(foe.encounter.dex)).toContain(gates[0])
      const entry = SP.wildPool.find((w) => w.dex === foe.encounter.dex)!
      expect(foe.encounter.level).toBeGreaterThanOrEqual(entry.minLevel + 4)
      expect(foe.encounter.level).toBeLessThanOrEqual(entry.maxLevel + 4)
      r = winStretch(foe.save, NOW + 65 * MIN)
    }
    expect(types).toEqual(['normal', 'fairy', 'rock', 'flying', 'bug', 'dragon', 'ice', 'dark', 'steel'])
    expect(race(r).won).toEqual([PALKIA, DIALGA])
    expect(progressRaidState(r, data, progressRaidOf(data, progressRaidKey(SP.id, DIALGA))!)).toBe('open')
    // Both won: the area is only its raids, no more tries.
    expect(canStartTimeRace(r, data, SP.id)).toBe(false)
    expect(isAreaSealed(r, data, SP.id)).toBe(true)
  })

  it('stays shut while that legend isn’t caught, and the replay is never offered twice', () => {
    const s = palkiaCaught()
    const notCaught = { ...s, events: { ...s.events, raidsDone: [] } }
    expect(canStartTimeRace(notCaught, data, SP.id)).toBe(false)
    const both = withRace(s, { won: [PALKIA, DIALGA] })
    expect(canStartTimeRace(both, data, SP.id)).toBe(false)
  })
})

describe('inside the race', () => {
  it('every fight plays at the quick speed (short motion, 1.5×) whatever the setting, and auto-battle is off', () => {
    const r = started()
    expect(timeRaceBattleSpeed(r, data, SP.id)).toEqual({ motion: 'short', pace: 1 / 1.5 })
    expect(timeRaceBattleSpeed(atPillar(), data, SP.id)).toBeNull()
    const cleared = { ...r, areaProgress: { ...r.areaProgress, [SP.id]: { ...r.areaProgress[SP.id]!, cleared: true } } }
    for (const playStyle of ['explored', 'idle'] as const) {
      const s = { autoMode: true, playStyle }
      expect(autoAvailable(cleared, data, s, SP.id)).toBe(false)
      expect(autoLevel(cleared, data, s, { areaId: SP.id })).toBe('off')
    }
  })
})
