// Crown Shrine's whiteout (docs/61 §4.3): the blizzard (the raids' Snow: 4 % of max HP a round from every Pokémon that
// isn't Ice type, both sides), the three waves of fixed foes in their order (wild, not catchable), the bonfire after
// each (40 % back, the only place the team changes and the bag opens), no bag in battle, the boss after the last
// bonfire, a wipe back to wave 1 (XP, ₽ and items kept), the travel lock, the shrine closing once the boss is caught,
// and the switch (off: the area plays as a plain secret area).
import { describe, expect, it } from 'vitest'
import {
  applyFieldItem,
  applyWipe,
  arriveAtWhiteout,
  atBonfire,
  blizzardWear,
  bonfireHp,
  canStartNightmare,
  canStartWhiteout,
  createBattle,
  createInstance,
  createRng,
  DEFAULT_WHITEOUT,
  emptyProgress,
  enterWorld,
  inWhiteout,
  instanceMaxHp,
  isAreaClosed,
  isAreaSealed,
  lastBonfire,
  leaveBonfire,
  markWhiteoutWonSeen,
  newSave,
  normaliseWhiteout,
  reduce,
  startWhiteout,
  teamSwapsOpen,
  uniformLevels,
  warmAtBonfire,
  WEATHER_CHIP,
  whiteoutBagShut,
  whiteoutBossGotAway,
  whiteoutEncounter,
  whiteoutFoe,
  whiteoutFoeCount,
  whiteoutLock,
  whiteoutModeOf,
  whiteoutNext,
  whiteoutNoCatch,
  whiteoutStateOf,
  whiteoutVictoryDue,
  whiteoutWeather,
  whiteoutWon,
  winWhiteout,
  winWhiteoutFoe,
  type BattleState,
  type GameData,
  type LogEntry,
  type SaveData,
} from '@/engine'
import { snowglobe } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const h = snowglobe()
const CS = h.areas.find((a) => a.name === 'Crown Shrine')!
const NOW = Date.parse('2026-12-26T12:00:00.000Z')
const world = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (access: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, whiteout: { access } },
  )
const data = dataWith('all')
const off = dataWith('off')
const typesOf = (d: GameData, dex: number) => [d.species[dex]!.type1, d.species[dex]!.type2].filter(Boolean)

/** Inside Snowglobe Valley, standing on Crown Shrine with Ampharos, Stoutland and Toucannon at Lv.52, hurt. */
function atShrine(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 179, NOW, newId)!
  const team = [181, 508, 733].map((dex) => {
    const p = createInstance(dex, 52, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  const spare = createInstance(461, 50, d, newId(), NOW)
  return {
    ...s,
    box: [...team, spare],
    team: team.map((p) => p.id),
    currentAreaId: CS.id,
    gold: 500,
    inventory: { 'hyper-potion': 2, revive: 1 },
  }
}
const begun = (d: GameData = data) => startWhiteout(atShrine(d), d, CS.id)!
const teamHp = (s: SaveData) => s.team.map((id) => s.box.find((p) => p.id === id)!.currentHp)
const maxOf = (s: SaveData, d: GameData = data) =>
  s.team.map((id) =>
    instanceMaxHp(
      s.box.find((p) => p.id === id)!,
      d,
    ),
  )

/** Wins every foe of the wave under way: the bonfire is lit after its last. */
function clearWave(s: SaveData): SaveData {
  let next = s
  for (let guard = 0; guard < 10 && whiteoutNext(next, data, CS.id) === 'foe'; guard++)
    next = winWhiteoutFoe(next, data, CS.id)!.save
  return next
}
/** Every wave and bonfire behind: the boss is next. */
function toBoss(): SaveData {
  let s = begun()
  for (let i = 0; i < DEFAULT_WHITEOUT.waves.length; i++) s = leaveBonfire(clearWave(s), data, CS.id)!
  return s
}

describe('the area and its switch', () => {
  it('Crown Shrine has its whiteout with the user’s numbers, read only while the switch is on', () => {
    expect(whiteoutModeOf(CS, data)).toEqual(DEFAULT_WHITEOUT)
    expect(DEFAULT_WHITEOUT).toMatchObject({ weather: 'snow', bonfirePercent: 40 })
    expect(whiteoutModeOf(CS, off)).toBeNull()
  })

  it('cleans what the admin left: odd values fall back, empty waves go; other kinds are none', () => {
    const w = normaliseWhiteout({
      kind: 'whiteout',
      waves: [[{ dex: 362, level: 500 }, { dex: 'x' }], [], [{ dex: 614, level: 48 }]],
      weather: 'hail',
      bonfirePercent: 'lots',
    })!
    expect(w.waves).toEqual([[{ dex: 362, level: 100 }], [{ dex: 614, level: 48 }]])
    expect(w.weather).toBe('snow')
    expect(w.bonfirePercent).toBe(40)
    expect(normaliseWhiteout({ kind: 'whiteout', weather: null })!.weather).toBeNull()
    expect(normaliseWhiteout({ kind: 'whiteout' })!.waves).toEqual(DEFAULT_WHITEOUT.waves)
    expect(normaliseWhiteout({ kind: 'nightmare' })).toBeNull()
    expect(canStartNightmare(atShrine(), data, CS.id)).toBe(false)
  })

  it('switched off, the area plays as a plain secret area: nothing begins, nothing holds the player', () => {
    expect(startWhiteout(atShrine(off), off, CS.id)).toBeNull()
    expect(canStartWhiteout(atShrine(off), off, CS.id)).toBe(false)
    const s = begun()
    expect(whiteoutLock(s, data)?.id).toBe(CS.id)
    expect(whiteoutLock(s, off)).toBeNull()
    expect(inWhiteout(s, off, CS.id)).toBe(false)
    expect(whiteoutWeather(s, off, CS.id)).toBeNull()
    expect(whiteoutBagShut(s, off)).toBe(false)
    expect(whiteoutEncounter(s, off, CS.id)).toBeNull()
    expect(isAreaClosed(atShrine(off), CS.id, off)).toBe(false)
    // Its plain deck and boss are still there for it.
    expect(CS.legendaryBoss).toEqual([{ dex: 460, level: 50, shiny: true }])
    expect(CS.encounterWeights.wild).toBeGreaterThan(0)
  })
})

describe('the blizzard: the raids’ Snow, both sides, Ice spared', () => {
  it('takes 4 % of max HP, rounded, at least 1, from anything but an Ice type', () => {
    expect(WEATHER_CHIP).toBe(0.04)
    expect(blizzardWear('snow', ['electric'], 150)).toBe(6)
    expect(blizzardWear('snow', ['normal'], 10)).toBe(1)
    expect(blizzardWear('snow', ['ice', 'water'], 300)).toBe(0)
    expect(blizzardWear('snow', ['grass', 'ice'], 300)).toBe(0)
    expect(blizzardWear(null, ['normal'], 300)).toBe(0)
    // A sandstorm, the admin's other weather, spares its own types.
    expect(blizzardWear('sand', ['steel'], 300)).toBe(0)
    expect(blizzardWear('sand', ['ice'], 300)).toBe(12)
  })

  /** Plays a fight on both sides' AI (rolls, attacks, the foe's turns) until it ends; its whole log. */
  function play(
    team: [number, number][],
    foe: [number, number, number?],
    weather: 'snow' | null,
  ): { s: BattleState; log: LogEntry[] } {
    const start = createBattle(
      {
        kind: 'wild',
        team: team.map(([dex, level], i) => ({ uid: `p${i}`, dex, level, hp: 9999 })),
        enemy: { dex: foe[0], level: foe[1], ...(foe[2] != null && { hp: foe[2] }) },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        weather,
      },
      data,
    )
    let s = start.state
    const log = [...start.log]
    const rng = createRng(7)
    for (let i = 0; i < 400 && !['won', 'lost', 'fled'].includes(s.phase); i++) {
      const e =
        s.phase === 'player_roll'
          ? ({ t: 'ROLL' } as const)
          : s.phase === 'player_reroll'
            ? ({ t: 'ATTACK' } as const)
            : s.phase === 'player_stunned'
              ? ({ t: 'PASS' } as const)
              : s.phase === 'player_switch'
                ? ({ t: 'SWITCH', instanceId: s.player.find((b) => b.hp > 0)!.uid } as const)
                : ({ t: 'AI_TURN' } as const)
      const r = reduce(s, e, data, rng)
      s = r.state
      log.push(...r.log)
    }
    return { s, log }
  }

  it('falls at the end of every round on both Pokémon out, with its line; an Ice type takes nothing', () => {
    // Ampharos (Electric) against Glalie (Ice): only Ampharos is worn down.
    const { log } = play([[181, 30]], [362, 30], 'snow')
    const wear = log.filter((e): e is Extract<LogEntry, { kind: 'weather' }> => e.kind === 'weather')
    expect(wear.length).toBeGreaterThan(0)
    expect(wear.every((e) => e.target === 'player' && e.weather === 'snow')).toBe(true)
    // Ampharos and Stoutland (Normal) against Bronzong (Steel / Psychic): both sides every round.
    const both = play(
      [
        [181, 30],
        [508, 30],
      ],
      [437, 30],
      'snow',
    )
    const w2 = both.log.filter((e): e is Extract<LogEntry, { kind: 'weather' }> => e.kind === 'weather')
    expect(w2.some((e) => e.target === 'player')).toBe(true)
    expect(w2.some((e) => e.target === 'enemy')).toBe(true)
    const foeMax = both.s.enemy.maxHp
    for (const e of w2.filter((x) => x.target === 'enemy'))
      expect(e.amount).toBe(Math.min(Math.max(1, Math.round(foeMax * 0.04)), e.amount + e.hpAfter))
    // Once a round: two turns between each fall.
    const turnsBefore = (i: number) =>
      both.log.slice(0, both.log.indexOf(w2[i]!)).filter((e) => e.kind === 'turn').length
    expect(turnsBefore(0) % 2).toBe(0)
  })

  it('never falls without weather', () => {
    const { log } = play([[181, 30]], [437, 30], null)
    expect(log.some((e) => e.kind === 'weather')).toBe(false)
  })

  it('ends a fight neither side could win: the blizzard K.O.s the foe', () => {
    // Stoutland (Normal) and Misdreavus (Ghost) can't touch each other: without weather, a stalemate at once…
    const calm = play([[508, 50]], [200, 50, 20], null)
    expect(calm.s.phase).toBe('fled')
    expect(calm.log.some((e) => e.kind === 'end' && e.reason === 'stalemate')).toBe(true)
    // …in the blizzard both wear down each round, and the foe, lower, falls: the fight is won.
    const { s, log } = play([[508, 50]], [200, 50, 20], 'snow')
    expect(s.phase).toBe('won')
    expect(log.every((e) => e.kind !== 'damage' || e.amount === 0)).toBe(true)
    expect(log.filter((e) => e.kind === 'weather' && e.target === 'enemy').length).toBeGreaterThan(1)
  })
})

describe('the waves: fixed foes in order, not catchable', () => {
  const waves = DEFAULT_WHITEOUT.waves

  it('are waves of 2, 3 and 4, an Ice type in each, no Ghost type, all below Abomasnow’s Lv.50', () => {
    expect(waves.map((w) => w.map((f) => data.species[f.dex]!.name))).toEqual([
      ['Glalie', 'Bronzong'],
      ['Beartic', 'Sawsbuck', 'Absol'],
      ['Walrein', 'Crabominable', 'Lanturn', 'Ursaluna'],
    ])
    expect(waves.map((w) => w.map((f) => f.level))).toEqual([
      [47, 47],
      [48, 48, 49],
      [49, 49, 50, 50],
    ])
    for (const w of waves) expect(w.some((f) => typesOf(data, f.dex).includes('ice'))).toBe(true)
    for (const f of waves.flat()) expect(typesOf(data, f.dex)).not.toContain('ghost')
    expect(whiteoutFoeCount(DEFAULT_WHITEOUT)).toBe(9)
  })

  it('come in that order every try, never shiny, and can’t be caught', () => {
    let s = begun()
    const met: number[] = []
    for (let w = 0; w < waves.length; w++) {
      for (let i = 0; i < waves[w]!.length; i++) {
        const enc = whiteoutEncounter(s, data, CS.id)!
        expect(whiteoutEncounter(s, data, CS.id)).toEqual(enc)
        expect(enc).toMatchObject({ kind: 'wild', dex: waves[w]![i]!.dex, level: waves[w]![i]!.level })
        expect(enc.kind === 'wild' && enc.shiny).toBeFalsy()
        expect(whiteoutFoe(s, data, CS.id)).toMatchObject({
          wave: w + 1,
          waves: 3,
          index: i + 1,
          size: waves[w]!.length,
        })
        expect(whiteoutNoCatch(s, data, CS.id)).toBe(true)
        met.push(enc.kind === 'wild' ? enc.dex : 0)
        s = winWhiteoutFoe(s, data, CS.id)!.save
      }
      expect(whiteoutNext(s, data, CS.id)).toBe('bonfire')
      expect(whiteoutEncounter(s, data, CS.id)).toBeNull()
      s = leaveBonfire(s, data, CS.id)!
    }
    expect(met).toEqual(waves.flat().map((f) => f.dex))
    expect(whiteoutNext(s, data, CS.id)).toBe('boss')
  })

  it('fight in the blizzard: the weather of every fight while it is under way, the boss’s too', () => {
    expect(whiteoutWeather(atShrine(), data, CS.id)).toBeNull()
    expect(whiteoutWeather(begun(), data, CS.id)).toBe('snow')
    expect(whiteoutWeather(toBoss(), data, CS.id)).toBe('snow')
  })
})

describe('the way in and the bonfires: the only places the team changes and the bag opens', () => {
  it('heals as a Pokémon Center on arrival; BEGIN heals the team and counts the try', () => {
    const s = atShrine()
    const arrived = arriveAtWhiteout(s, data, CS.id)
    expect(teamHp(arrived)).toEqual(maxOf(arrived))
    expect(arriveAtWhiteout(arrived, data, CS.id)).toBe(arrived)
    const b = begun()
    expect(teamHp(b)).toEqual(maxOf(b))
    expect(whiteoutStateOf(b, CS.id)).toEqual({ active: true, wave: 0, foe: 0, tries: 1 })
    expect(arriveAtWhiteout(b, data, CS.id)).toBe(b)
  })

  it('lets the team change at the way in and at a bonfire, never between foes', () => {
    const idle = (s: SaveData) => teamSwapsOpen(s, data, { phase: 'idle', areaId: CS.id })
    expect(idle(atShrine())).toBe(true)
    const b = begun()
    expect(idle(b)).toBe(false)
    const camp = clearWave(b)
    expect(atBonfire(camp, data, CS.id)).toBe(true)
    expect(idle(camp)).toBe(true)
    expect(idle(leaveBonfire(camp, data, CS.id)!)).toBe(false)
    expect(teamSwapsOpen(atShrine(off), off, { phase: 'idle', areaId: CS.id })).toBe(false)
  })

  it('opens the bag only at a bonfire once it has begun', () => {
    const hurt = (s: SaveData): SaveData => ({
      ...s,
      box: s.box.map((p, i) => (i === 0 ? { ...p, currentHp: 10 } : p)),
    })
    const use = (s: SaveData) => applyFieldItem(s, 'hyper-potion', s.team[0]!, data, createRng(1))
    const b = hurt(begun())
    expect(whiteoutBagShut(b, data)).toBe(true)
    expect(use(b)).toBeNull()
    const camp = hurt(clearWave(begun()))
    expect(whiteoutBagShut(camp, data)).toBe(false)
    expect(use(camp)!.save.inventory['hyper-potion']).toBe(1)
    // Before it begins, as anywhere else.
    expect(use(hurt(atShrine()))).not.toBeNull()
  })

  it('gives 40 % of max HP back, once, to every team member still standing (a K.O. stays K.O.)', () => {
    expect(bonfireHp(10, 100, 40)).toBe(50)
    expect(bonfireHp(90, 100, 40)).toBe(100)
    expect(bonfireHp(0, 100, 40)).toBe(0)
    expect(bonfireHp(1, 3, 40)).toBe(2)
    const camp = clearWave(begun())
    const hurt: SaveData = {
      ...camp,
      box: camp.box.map((p) =>
        p.id === camp.team[0]
          ? { ...p, currentHp: 0 }
          : camp.team.includes(p.id)
            ? { ...p, currentHp: 5 }
            : p,
      ),
    }
    const max = maxOf(hurt)
    const r = warmAtBonfire(hurt, data, CS.id)!
    expect(teamHp(r.save)).toEqual([0, ...max.slice(1).map((m) => Math.min(m, 5 + Math.round(m * 0.4)))])
    expect(r.heals.map((x) => x.to)).toEqual(teamHp(r.save))
    expect(warmAtBonfire(r.save, data, CS.id)).toBeNull()
    // MOVE ON without having warmed: the heal is given then, never twice.
    const left = leaveBonfire(hurt, data, CS.id)!
    expect(teamHp(left)).toEqual(teamHp(r.save))
  })

  it('lights a bonfire after every wave, the last one just before the boss', () => {
    let s = begun()
    for (let w = 1; w <= 3; w++) {
      s = clearWave(s)
      expect(whiteoutStateOf(s, CS.id)).toMatchObject({ bonfire: true, wave: w, foe: 0 })
      expect(lastBonfire(s, data, CS.id)).toBe(w === 3)
      s = leaveBonfire(s, data, CS.id)!
    }
    expect(whiteoutStateOf(s, CS.id).boss).toBe(true)
  })
})

describe('no bag in battle', () => {
  it('turns every item away in the whiteout’s fights', () => {
    const fight = (noBag: boolean) =>
      createBattle(
        {
          kind: 'wild',
          team: [{ uid: 'a', dex: 181, level: 30, hp: 20 }],
          enemy: { dex: 362, level: 30 },
          playerLevels: uniformLevels(1),
          enemyLevels: uniformLevels(1),
          noBag,
          weather: 'snow',
        },
        data,
      ).state
    const s = fight(true)
    s.phase = 'player_roll'
    expect(s.noBag).toBe(true)
    expect(reduce(s, { t: 'USE_ITEM', key: 'hyper-potion', targetUid: 'a' }, data, createRng(1)).state).toBe(
      s,
    )
    const open = fight(false)
    open.phase = 'player_roll'
    expect(
      reduce(open, { t: 'USE_ITEM', key: 'hyper-potion', targetUid: 'a' }, data, createRng(1)).state,
    ).not.toBe(open)
  })
})

describe('the boss and the end', () => {
  it('brings shiny Abomasnow Lv.50 after the last bonfire, in the blizzard, and it can be caught', () => {
    const s = toBoss()
    expect(whiteoutEncounter(s, data, CS.id)).toEqual({ kind: 'boss', dex: 460, level: 50, shiny: true })
    expect(whiteoutNoCatch(s, data, CS.id)).toBe(false)
    expect(whiteoutBagShut(s, data)).toBe(true)
  })

  it('caught: the blizzard lifts, the lock goes and the shrine closes for good', () => {
    const won = winWhiteout(toBoss(), data, CS.id)
    expect(whiteoutStateOf(won, CS.id)).toMatchObject({ won: true, wonSeen: false, active: false, tries: 1 })
    expect(teamHp(won)).toEqual(maxOf(won))
    expect(whiteoutLock(won, data)).toBeNull()
    expect(whiteoutWon(won, data, CS.id)).toBe(true)
    expect(isAreaClosed(won, CS.id, data)).toBe(true)
    expect(isAreaSealed(won, data, CS.id)).toBe(true)
    expect(canStartWhiteout(won, data, CS.id)).toBe(false)
    expect(whiteoutVictoryDue(won, data, CS.id)).toBe(true)
    const seen = markWhiteoutWonSeen(won, CS.id)
    expect(whiteoutVictoryDue(seen, data, CS.id)).toBe(false)
    // Closed even if the switch goes off later: its boss stays caught.
    expect(isAreaClosed(seen, CS.id, off)).toBe(true)
  })

  it('got away: back at the last bonfire (no second heal), then the boss again', () => {
    const away = whiteoutBossGotAway(toBoss(), data, CS.id)
    expect(whiteoutStateOf(away, CS.id)).toMatchObject({ active: true, bonfire: true, warmed: true })
    expect(warmAtBonfire(away, data, CS.id)).toBeNull()
    expect(teamSwapsOpen(away, data, { phase: 'idle', areaId: CS.id })).toBe(true)
    const again = leaveBonfire(away, data, CS.id)!
    expect(whiteoutNext(again, data, CS.id)).toBe('boss')
  })

  it('a wipe: back to wave 1, healed, the lock lifted; XP, ₽ and items kept; no limit on tries', () => {
    let s = winWhiteoutFoe(leaveBonfire(clearWave(begun()), data, CS.id)!, data, CS.id)!.save
    s = { ...s, box: s.box.map((p) => (s.team.includes(p.id) ? { ...p, currentHp: 0, xp: 77 } : p)) }
    const wiped = applyWipe(s, CS.id, data)
    expect(whiteoutStateOf(wiped, CS.id)).toEqual({ active: false, wave: 0, foe: 0, tries: 1 })
    expect(teamHp(wiped)).toEqual(maxOf(wiped))
    expect(wiped.gold).toBe(s.gold)
    expect(wiped.inventory).toEqual(s.inventory)
    expect(wiped.box.filter((p) => s.team.includes(p.id)).every((p) => p.xp === 77)).toBe(true)
    expect(whiteoutLock(wiped, data)).toBeNull()
    const again = startWhiteout(wiped, data, CS.id)!
    expect(whiteoutStateOf(again, CS.id)).toEqual({ active: true, wave: 0, foe: 0, tries: 2 })
    expect(whiteoutEncounter(again, data, CS.id)).toMatchObject({ dex: 362 })
  })

  it('holds the player in the shrine while it is under way, and only then', () => {
    expect(whiteoutLock(atShrine(), data)).toBeNull()
    expect(whiteoutLock(begun(), data)?.id).toBe(CS.id)
    expect(whiteoutLock(clearWave(begun()), data)?.id).toBe(CS.id)
    // Standing elsewhere (a parked whiteout can't be under way, but the lock reads the area the player is on).
    const elsewhere = { ...begun(), currentAreaId: h.areas[0]!.id }
    expect(whiteoutLock(elsewhere, data)).toBeNull()
    expect(emptyProgress().whiteout).toBeUndefined()
  })
})
