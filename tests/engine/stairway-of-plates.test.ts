// The Stairway of Plates (docs/64 §4.5): the Hall of Origin's portal run, Distortion World's rules and numbers dressed
// for Arceus. The skin leaves Haunted Hollow's run as it was; the run plays the same; each look has its own rules
// pop-up; the raid is shiny Arceus at Lv.90, foes' dice 10, 4 HP bars, teams up to Lv.90, its Plate changing on each
// bar (Normal → Ice → Steel → Dragon), announced as a form change of its own.
import { describe, expect, it } from 'vitest'
import {
  BOSS_UID,
  choiceFormsOf,
  choiceFormDie,
  createInstance,
  createRaid,
  createRng,
  DEFAULT_PORTAL_RUN,
  enterWorld,
  instanceMaxHp,
  markPortalRulesSeen,
  newSave,
  normalisePortal,
  openDistortion,
  PLATE_BARS,
  portalCycle,
  portalModeOf,
  portalNoCatch,
  portalRulesDue,
  portalRulesSeen,
  portalSkin,
  portalSwitchOf,
  portalStateOf,
  progressRaidKey,
  progressRaidOf,
  progressRaidState,
  raidRules,
  raidTeamCap,
  startPortalRun,
  type Area,
  type EventAccess,
  type GameData,
  type PokeType,
  type RaidLogEntry,
  type RaidSideSeed,
  type SaveData,
} from '@/engine'
import { haunted } from '../../scripts/content-haunted-hollow'
import { HALL_OF_ORIGIN_RUN, snowglobe, STARTERS } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const sg = snowglobe()
const HALL = sg.areas.find((a) => a.name === 'Hall of Origin')!
const DW = haunted().areas.find((a) => a.name === 'Distortion World')!
const NOW = Date.parse('2027-01-02T12:00:00.000Z')
const world = { ...sg.world, minBadges: 0, previewHours: 48 }
const dataWith = (areas: Area[] = sg.areas, sw: { portalRun?: EventAccess; platesRun?: EventAccess } = {}) =>
  makeDataWith(
    { areas, regions: [sg.region] },
    {
      smallWorlds: { access: 'all', list: [world] },
      portalRun: { access: sw.portalRun ?? 'off' },
      platesRun: { access: sw.platesRun ?? 'all' },
    },
  )
const data = dataWith()

/** Inside Snowglobe Valley, standing in the Hall of Origin with three Lv.70 Pokémon, hurt. */
function atHall(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, STARTERS[0]!, NOW, newId)!
  const team = [143, 461, 998].map((dex) => {
    const p = createInstance(dex, 70, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  return { ...s, box: team, team: team.map((p) => p.id), currentAreaId: HALL.id }
}

describe('its own switch (the user’s call of 2026-11-01)', () => {
  // Distortion World's mode moved onto a Snowglobe Valley area, so both runs sit in the same data.
  const both = (sw: { portalRun?: EventAccess; platesRun?: EventAccess }) => {
    const d = dataWith(sg.areas, sw)
    const dw = { ...HALL, mode: DEFAULT_PORTAL_RUN }
    return { hall: portalModeOf(HALL, d), dw: portalModeOf(dw, d) }
  }

  it('the Stairway answers to `platesRun`, every other portal run to `portalRun`', () => {
    expect(portalSwitchOf(normalisePortal(HALL.mode))).toBe('platesRun')
    expect(portalSwitchOf(normalisePortal(DW.mode))).toBe('portalRun')
    expect(portalSwitchOf(null)).toBe('portalRun')
  })

  it('`portalRun` on and `platesRun` off: Distortion World plays its run, the Hall plays as before', () => {
    const { hall, dw } = both({ portalRun: 'all', platesRun: 'off' })
    expect(hall).toBeNull()
    expect(dw).toEqual(DEFAULT_PORTAL_RUN)
  })

  it('`platesRun` on and `portalRun` off: the Hall climbs its Stairway, Distortion World plays as before', () => {
    const { hall, dw } = both({ portalRun: 'off', platesRun: 'all' })
    expect(hall?.skin).toBe('plates')
    expect(dw).toBeNull()
  })

  it('both off: neither; the Hall’s raid has no portal rules then', () => {
    const { hall, dw } = both({ portalRun: 'off', platesRun: 'off' })
    expect(hall).toBeNull()
    expect(dw).toBeNull()
  })

  it('ships Off', () => {
    expect(makeDataWith({}).config.platesRun).toEqual({ access: 'off' })
  })
})

describe('the skin', () => {
  it('leaves Distortion World’s mode exactly as it was: no skin written, its own look', () => {
    expect(normalisePortal(DW.mode)).toEqual(DEFAULT_PORTAL_RUN)
    expect(normalisePortal(DEFAULT_PORTAL_RUN)).not.toHaveProperty('skin')
    expect(portalSkin(normalisePortal(DW.mode))).toBe('distortion')
    expect(portalSkin(null)).toBe('distortion')
  })

  it('keeps the Stairway of Plates; an unknown skin falls back to Distortion World’s', () => {
    expect(normalisePortal({ ...DEFAULT_PORTAL_RUN, skin: 'plates' })!.skin).toBe('plates')
    expect(normalisePortal({ ...DEFAULT_PORTAL_RUN, skin: 'glitter' })).toEqual(DEFAULT_PORTAL_RUN)
  })

  it('keeps only real types for the raid’s bars, ten at most', () => {
    const raid = { ...DEFAULT_PORTAL_RUN.raid, barTypes: ['ice', 'plasma', 7, 'steel'] }
    expect(normalisePortal({ ...DEFAULT_PORTAL_RUN, raid })!.raid.barTypes).toEqual(['ice', 'steel'])
    const many = { ...DEFAULT_PORTAL_RUN.raid, barTypes: Array(12).fill('fire') }
    expect(normalisePortal({ ...DEFAULT_PORTAL_RUN, raid: many })!.raid.barTypes).toHaveLength(10)
    expect(
      normalisePortal({ ...DEFAULT_PORTAL_RUN, raid: { ...DEFAULT_PORTAL_RUN.raid, barTypes: [] } })!.raid,
    ).not.toHaveProperty('barTypes')
  })
})

describe('the Hall of Origin’s run', () => {
  it('is Distortion World’s run with its numbers, in the Stairway of Plates’ look', () => {
    const mode = portalModeOf(HALL, data)!
    expect(portalSkin(mode)).toBe('plates')
    const { skin: _s, raid: _r, ...rules } = mode
    const { raid: _dr, ...dw } = DEFAULT_PORTAL_RUN
    expect(rules).toEqual(dw)
    // The same deck as Distortion World's, card for card: 5 wild and a find, then the altar.
    expect(portalCycle(mode, createRng(3))).toEqual(portalCycle(DEFAULT_PORTAL_RUN, createRng(3)))
  })

  it('plays as the portal run: healed going in, its Pokémon never caught, the 10th altar wins and opens the raid', () => {
    const s = startPortalRun(atHall(), data, HALL.id, createRng(7))!
    for (const p of s.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(portalNoCatch(s, data, HALL.id)).toBe(true)
    const arceus = progressRaidOf(data, progressRaidKey(HALL.id, 493))!
    expect(progressRaidState(s, data, arceus)).toBe('locked')
    const at9 = {
      ...s,
      areaProgress: {
        ...s.areaProgress,
        [HALL.id]: { ...s.areaProgress[HALL.id]!, portal: { ...portalStateOf(s, HALL.id), closed: 9 } },
      },
    }
    const r = openDistortion(at9, data, HALL.id, createRng(1))!
    expect(r.victory).toBe(true)
    expect(progressRaidState(r.save, data, arceus)).toBe('open')
  })

  it('opens its raid at Lv.90, foes’ dice 10, 4 HP bars, teams up to Lv.90', () => {
    expect(raidRules(data, 493, 'progress', HALL.id)).toMatchObject({ level: 90, upgradeLevel: 10, bars: 4 })
    expect(raidTeamCap(data, 493, 'progress', HALL.id)).toBe(90)
    expect(HALL_OF_ORIGIN_RUN.raid.barTypes).toEqual([...PLATE_BARS])
    expect(PLATE_BARS).toEqual(['normal', 'ice', 'steel', 'dragon'])
  })

  it('has its own rules pop-up: Distortion World’s, seen last Halloween, doesn’t count', () => {
    // Open without its 90 caught, for the test.
    const open = dataWith(sg.areas.map((a) => (a.id === HALL.id ? { ...a, unlockConditions: null } : a)))
    const s = { ...atHall(open), portalRulesSeen: true }
    expect(portalRulesSeen(s, 'plates')).toBe(false)
    expect(portalRulesDue(s, open)?.id).toBe(HALL.id)
    const seen = markPortalRulesSeen(s, 'plates')
    expect(seen.platesRulesSeen).toBe(true)
    expect(portalRulesDue(seen, open)).toBeNull()
    expect(markPortalRulesSeen(seen, 'plates')).toBe(seen)
    expect(markPortalRulesSeen({ ...s, portalRulesSeen: false }, 'distortion').portalRulesSeen).toBe(true)
  })
})

describe('Arceus’s Plates in its raid', () => {
  // The Hall's raid made easy enough to reach its last bar (the admin's numbers, the same Plates).
  const easyHall: Area = {
    ...HALL,
    mode: { ...HALL_OF_ORIGIN_RUN, raid: { ...HALL_OF_ORIGIN_RUN.raid, level: 20, upgradeLevel: 1 } },
  }
  const easy = dataWith(sg.areas.map((a) => (a.id === HALL.id ? easyHall : a)))
  const strong = (k: number): RaidSideSeed => ({
    owner: `Side ${k}`,
    look: null,
    kind: 'npc',
    team: [0, 1, 2].map((i) => ({ uid: `s${k}-${i}`, dex: 150, level: 100, hp: 9999 })),
  })
  const raid = (d: GameData, areaId: string | undefined, dex = 493, seed = 1) =>
    createRaid(
      { boss: { dex, shiny: true }, sides: [0, 1, 2].map(strong), kind: 'progress', areaId, auto: true },
      d,
      createRng(seed),
    )
  const plates = (log: RaidLogEntry[]) =>
    log.filter(
      (e): e is Extract<RaidLogEntry, { kind: 'form' }> =>
        e.kind === 'form' && e.uid === BOSS_UID && e.reason === 'plate',
    )
  const formOf = (d: GameData, type: PokeType) =>
    choiceFormsOf(d, 493).find((f) => choiceFormDie(f) === type)!.dex

  it('starts Normal, then takes the Icicle, Iron and Draco Plates as its bars break, every die of the new type', () => {
    const { state, log } = raid(easy, HALL.id)
    expect(state.plates).toEqual(['normal', 'ice', 'steel', 'dragon'])
    expect(state.broken).toBe(4)
    const p = plates(log)
    expect(p.map((e) => e.toDex)).toEqual([
      formOf(easy, 'ice'),
      formOf(easy, 'steel'),
      formOf(easy, 'dragon'),
    ])
    expect(p[0]!.fromDex).toBe(493)
    p.forEach((e, i) => {
      // Right after its bar breaks: the next one starts in its Plate.
      expect(log[log.indexOf(e) - 1]).toMatchObject({ kind: 'raid_bar', broken: i + 1 })
      expect(new Set(e.dice)).toEqual(new Set([PLATE_BARS[i + 1]]))
      expect(e.side).toBe('enemy')
    })
  })

  it('announces a first bar’s Plate when it isn’t Normal', () => {
    const fireHall: Area = {
      ...easyHall,
      mode: { ...HALL_OF_ORIGIN_RUN, raid: { ...HALL_OF_ORIGIN_RUN.raid, level: 20, barTypes: ['fire'] } },
    }
    const d = dataWith(sg.areas.map((a) => (a.id === HALL.id ? fireHall : a)))
    const { state, log } = raid(d, HALL.id)
    expect(log[1]).toMatchObject({ kind: 'form', reason: 'plate', toDex: formOf(d, 'fire') })
    // No Plate for the later bars: it stays Fire.
    expect(plates(log)).toHaveLength(1)
    expect(state.boss.dex).toBe(formOf(d, 'fire'))
  })

  it('is the Hall’s raid only: Giratina’s, the day’s Arceus and a Pokémon with no type forms take none', () => {
    const hh = haunted()
    const dw = makeDataWith(
      { areas: hh.areas, regions: [hh.region] },
      {
        smallWorlds: { access: 'all', list: [{ ...hh.world, minBadges: 0, previewHours: 48 }] },
        portalRun: { access: 'all' },
      },
    )
    expect(raid(dw, DW.id, 487).state.plates).toBeUndefined()
    expect(
      plates(
        createRaid(
          { boss: { dex: 493, shiny: true }, sides: [0, 1, 2].map(strong), auto: true },
          easy,
          createRng(2),
        ).log,
      ),
    ).toEqual([])
    // A Mew in the Hall's place: the bars' types are skipped, nothing changes.
    expect(plates(raid(easy, HALL.id, 151).log)).toEqual([])
  })
})
