import { describe, expect, it } from 'vitest'
import {
  addAwayWindow,
  applyFieldItem,
  applyRebattleLoss,
  applyWipe,
  awayHeal,
  buildDeck,
  centerHeal,
  createBattle,
  createRng,
  DEFAULT_CONFIG,
  extremeOn,
  extremeOpen,
  extremeRules,
  extremeRulesDue,
  firstComeback,
  getRegion,
  HOUR_MS,
  instanceMaxHp,
  koLeft,
  linearAreas,
  newSave,
  nextEncounter,
  progressOf,
  reduce,
  settleKo,
  stampExtremeUnlock,
  teamAverageLevel,
  uniformLevels,
  withdrawPokemon,
  type Area,
  type EncounterContext,
  type ExtremeConfig,
  type GameData,
  type PokemonInstance,
  type SaveData,
} from '@/engine'
import { data, makeData, newId } from '../fixtures'

const MIN = 60_000
const extremeData = (over: Partial<ExtremeConfig>): GameData => makeData({ extreme: { ...DEFAULT_CONFIG.extreme, ...over } })

const main = () => newSave(4, data, 0, newId)
const extreme = (): SaveData => ({ ...newSave(4, data, 0, newId), mode: 'extreme' })
/** The save's lead, at `hp` (and resting since `koAt`). */
const withLead = (save: SaveData, hp: number, koAt?: number): SaveData => ({
  ...save,
  box: save.box.map((p, i) => (i === 0 ? { ...p, currentHp: hp, ...(koAt != null && { koAt }) } : p)),
})
const lead = (save: SaveData) => save.box[0]!
const maxHp = (p: PokemonInstance) => instanceMaxHp(p, data)

/** The Johto League beaten, in a parked Johto block (the player went back to Kanto). */
function johtoLeagueDone(save: SaveData): SaveData {
  const johto = getRegion(data, 'johto')!
  const block = {
    gold: 0,
    pokedex: [],
    box: [],
    team: [],
    inventory: {},
    comboLevels: save.comboLevels,
    dieLevels: save.dieLevels,
    currentAreaId: johto.leagueAreaId,
    areaProgress: { [johto.leagueAreaId]: { ...progressOf(save, johto.leagueAreaId), cleared: true } },
  }
  return { ...save, parked: { ...save.parked, johto: block } }
}

describe('opening Extreme mode', () => {
  // Off by default: these switch it on for everyone. Kanto's League opens it by default (docs/48); these read the
  // admin's other choice of region, Johto (its first default).
  const on = extremeData({ access: 'all', unlockRegion: 'johto' })

  it('opens once the Johto League is beaten, in any region of the main save, and stays open', () => {
    const fresh = main()
    expect(extremeOpen(fresh, on)).toBe(false)
    expect(stampExtremeUnlock(fresh, on, 5)).toBe(fresh)

    const done = johtoLeagueDone(fresh)
    expect(extremeOpen(done, on)).toBe(true)
    const stamped = stampExtremeUnlock(done, on, 5)
    expect(stamped.extremeUnlockedAt).toBe(5)
    expect(stampExtremeUnlock(stamped, on, 9)).toBe(stamped) // stamped once

    // The admin moves the unlock to a later league: a player who already had it keeps it.
    const later = extremeData({ access: 'all', unlockRegion: 'hoenn' })
    expect(extremeOpen(done, later)).toBe(false)
    expect(extremeOpen(stamped, later)).toBe(true)
  })

  it('is off by default; on for the admin, only the admin sees it; on for everyone, everyone does', () => {
    const done = stampExtremeUnlock(johtoLeagueDone(main()), on, 5)
    expect(DEFAULT_CONFIG.extreme.access).toBe('off')
    expect(extremeOn(data)).toBe(false)
    expect(extremeOpen(done, extremeData({ unlockRegion: 'johto' }))).toBe(false)
    const admin = extremeData({ access: 'admin', unlockRegion: 'johto' })
    expect(extremeOpen(done, admin)).toBe(false)
    expect(extremeOpen(done, { ...admin, viewer: { admin: true } })).toBe(true)
    expect(extremeOpen(done, on)).toBe(true)
  })

  it('the rules pop-up is due once; nothing shows while the admin has the mode off', () => {
    const open = stampExtremeUnlock(johtoLeagueDone(main()), on, 5)
    expect(extremeRulesDue(open, on)).toBe(true)
    expect(extremeRulesDue({ ...open, extremeRulesSeen: true }, on)).toBe(false)
    expect(extremeRulesDue(open, extremeData({ access: 'off' }))).toBe(false)
  })

  it('an Extreme save never opens it again, nor stamps anything', () => {
    const x = johtoLeagueDone(extreme())
    expect(extremeOpen(x, data)).toBe(false)
    expect(stampExtremeUnlock(x, data, 5)).toBe(x)
  })

  it('gives the pop-up its numbers from the config', () => {
    expect(extremeRules(data)).toMatchObject({ koHours: 12, koHp: 1, awayPct: 10, fullHours: 10 })
    expect(extremeRules(extremeData({ awayHealPctPerHour: 0 })).fullHours).toBeNull()
  })
})

describe('no Pokémon Centers', () => {
  // An area whose deck deals Centers (Route 1's only opens rounds with one).
  const DECK_AREA: Area = linearAreas(data).find((a) => (a.encounterWeights.center ?? 0) > 0 && a.wildPool.length > 0)!
  const ctx = (save: SaveData, over: Partial<EncounterContext> = {}): EncounterContext => ({
    area: DECK_AREA,
    progress: progressOf(save, DECK_AREA.id),
    data,
    teamAvgLevel: teamAverageLevel(save),
    teamHurt: true,
    teamFainted: true,
    isFirstInArea: true,
    pokedex: save.pokedex,
    ...over,
  })

  it('a deck holds none', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(buildDeck(DECK_AREA, data, createRng(seed))).toContain('center')
      expect(buildDeck(DECK_AREA, data, createRng(seed), [], { noCenters: true })).not.toContain('center')
    }
  })

  it('none is ever sent: not to open a round, not entering hurt, not after a K.O.', () => {
    const save = extreme()
    expect(nextEncounter(ctx(save), createRng(1)).encounter.kind).toBe('center') // the main game would
    for (let seed = 1; seed <= 30; seed++) {
      const roll = nextEncounter(ctx(save, { noCenters: true }), createRng(seed))
      expect(roll.encounter.kind).not.toBe('center')
      expect(roll.deck ?? []).not.toContain('center')
    }
  })

  it('a Center card already in a deck is set aside', () => {
    const save = extreme()
    const progress = { ...progressOf(save, DECK_AREA.id), deck: ['wild', 'center', 'center'] as const }
    const roll = nextEncounter(ctx(save, { noCenters: true, progress: { ...progress, deck: [...progress.deck] } }), createRng(3))
    expect(roll.encounter.kind).toBe('wild')
  })

  it('a Center heals nobody, a lost round heals nobody, a lost Rebattle tier heals nobody', () => {
    const hurt = withLead(extreme(), 0)
    expect(centerHeal(hurt, data)).toBe(hurt)
    expect(lead(applyWipe(hurt, DECK_AREA.id, data)).currentHp).toBe(0)
    expect(lead(applyRebattleLoss(hurt, data, 'kanto')).currentHp).toBe(0)
    // The main game, and Extreme with the admin's switches on, heal as before.
    const mainHurt = withLead(main(), 0)
    expect(lead(applyWipe(mainHurt, DECK_AREA.id, data)).currentHp).toBe(maxHp(lead(mainHurt)))
    const lenient = extremeData({ centers: true, wipeHeals: true })
    expect(lead(centerHeal(hurt, lenient)).currentHp).toBe(maxHp(lead(hurt)))
    expect(lead(applyWipe(hurt, DECK_AREA.id, lenient)).currentHp).toBe(maxHp(lead(hurt)))
  })
})

describe('K.O. lasts 12 hours', () => {
  it('a Pokémon at 0 HP starts resting; it comes back at 1 HP 12 h later, on the real clock only', () => {
    const down = withLead(extreme(), 0)
    // While the real time is unknown, nothing moves: the device's clock neither starts nor ends a rest.
    expect(settleKo(down, data, null).save).toBe(down)
    const started = settleKo(down, data, 1000).save
    expect(lead(started).koAt).toBe(1000)
    expect(koLeft(lead(started), 1000 + HOUR_MS, data)).toBe(11 * HOUR_MS)
    expect(settleKo(started, data, 1000 + 12 * HOUR_MS - 1).save).toBe(started)
    expect(settleKo(started, data, null).save).toBe(started)
    const back = settleKo(started, data, 1000 + 12 * HOUR_MS)
    expect(back.back).toEqual([lead(started).id])
    expect(lead(back.save).currentHp).toBe(1)
    expect(lead(back.save).koAt).toBeUndefined()
  })

  it('while an absence is open or waiting, a rest is left for the away heal to end', () => {
    const resting = withLead(extreme(), 0, 0)
    const open = { ...resting, extreme: { awayFrom: HOUR_MS } }
    const waiting = { ...resting, extreme: { pending: [[HOUR_MS, 14 * HOUR_MS]] as [number, number][] } }
    expect(settleKo(open, data, 14 * HOUR_MS).save).toBe(open)
    expect(settleKo(waiting, data, 14 * HOUR_MS).save).toBe(waiting)
    // The heal ends it at 12 h and heals the 2 h after, not the whole 13.
    const max = maxHp(lead(resting))
    const healed = awayHeal(waiting, data, waiting.extreme.pending)
    expect(lead(healed.save).currentHp).toBe(1 + Math.floor(max * 0.1 * 2))
  })

  it('a Revive stops the clock; a main save never has one', () => {
    const resting = withLead(extreme(), 12, 1000)
    expect(lead(settleKo(resting, data, 2000).save).koAt).toBeUndefined()
    const mainDown = withLead(main(), 0)
    expect(settleKo(mainDown, data, 2000).save).toBe(mainDown)
  })

  it('runs for parked regions and the Day Care too, and names the first one back', () => {
    const base = withLead(extreme(), 0, 0)
    const other = { ...lead(base), id: 'parked-1', currentHp: 0, koAt: 5 * HOUR_MS }
    const { koAt: _k, ...fresh } = lead(base)
    const resident = { ...fresh, id: 'care-1', currentHp: 0 }
    const save: SaveData = {
      ...base,
      parked: { johto: { gold: 0, pokedex: [], box: [other], team: [other.id], inventory: {}, comboLevels: base.comboLevels, dieLevels: base.dieLevels, currentAreaId: '', areaProgress: {} } },
      dayCare: { residents: [{ inst: resident, since: 0, region: 'kanto' }], guests: [], eggClaimed: true },
    }
    expect(firstComeback(save, data)).toMatchObject({ at: 12 * HOUR_MS })
    const later = settleKo(save, data, 13 * HOUR_MS).save
    expect(lead(later).currentHp).toBe(1)
    expect(later.parked!.johto!.box[0]!.koAt).toBe(5 * HOUR_MS)
    expect(later.dayCare!.residents[0]!.inst.koAt).toBe(13 * HOUR_MS)
  })

  it("the Day Care is no Center: a resident comes home with its HP %, still resting if it was K.O.", () => {
    const base = extreme()
    const resting = { ...lead(base), id: 'care-1', currentHp: 0, koAt: 7 }
    const save: SaveData = { ...base, dayCare: { residents: [{ inst: resting, since: 0, region: 'kanto' }], guests: [], eggClaimed: true } }
    const home = withdrawPokemon(save, 'care-1', data, 10 * MIN)!
    expect(home.inst).toMatchObject({ currentHp: 0, koAt: 7 })
    // Nor in the main game: it comes home K.O.
    const mainSave: SaveData = { ...save, mode: undefined }
    expect(withdrawPokemon(mainSave, 'care-1', data, 10 * MIN)!.inst.currentHp).toBe(0)
  })
})

describe('healing only while away', () => {
  it('heals 10 % of max HP an hour, to the minute, rounded down, never above max', () => {
    const save = withLead(extreme(), 1)
    const max = maxHp(lead(save))
    const r = awayHeal(save, data, [[0, 3 * HOUR_MS + 30 * MIN]])
    expect(r.minutes).toBe(210)
    expect(lead(r.save).currentHp).toBe(Math.min(max, 1 + Math.floor(max * 0.1 * 3.5)))
    expect(r.changes).toEqual([{ id: lead(save).id, dex: 4, from: 1, to: lead(r.save).currentHp, max, back: false, resting: false }])
    expect(lead(awayHeal(save, data, [[0, 30 * HOUR_MS]]).save).currentHp).toBe(max)
  })

  it("absences under 2 minutes don't count; a main save never heals this way", () => {
    const save = withLead(extreme(), 1)
    expect(awayHeal(save, data, [[0, MIN]]).save).toBe(save)
    const mainSave = withLead(main(), 1)
    expect(awayHeal(mainSave, data, [[0, 5 * HOUR_MS]]).save).toBe(mainSave)
  })

  it('a rest that ends during the absence: back at 1 HP, then healing for the rest of it', () => {
    const save = withLead(extreme(), 0, 0)
    const max = maxHp(lead(save))
    // Away from 10 h to 14 h: back at 12 h, then 2 h of healing.
    const r = awayHeal(save, data, [[10 * HOUR_MS, 14 * HOUR_MS]])
    expect(lead(r.save)).toMatchObject({ currentHp: 1 + Math.floor(max * 0.1 * 2) })
    expect(lead(r.save).koAt).toBeUndefined()
    expect(r.changes[0]).toMatchObject({ back: true, resting: false, from: 0 })
    // Away from 1 h to 5 h: still resting, listed as such, nothing healed.
    const still = awayHeal(save, data, [[HOUR_MS, 5 * HOUR_MS]])
    expect(lead(still.save)).toBe(lead(save))
    expect(still.changes[0]).toMatchObject({ resting: true, from: 0, to: 0 })
  })

  it('several absences heal one after the other, and the time played between them never does', () => {
    const save = withLead(extreme(), 1)
    const max = maxHp(lead(save))
    const r = awayHeal(save, data, [
      [0, HOUR_MS],
      [5 * HOUR_MS, 6 * HOUR_MS],
    ])
    expect(r.minutes).toBe(120)
    expect(lead(r.save).currentHp).toBe(1 + 2 * Math.floor(max * 0.1))
  })

  it('keeps at most the last 20 absences waiting', () => {
    let save = extreme()
    for (let i = 0; i < 25; i++) save = addAwayWindow(save, i, i + 1)
    expect(save.extreme!.pending).toHaveLength(20)
    expect(save.extreme!.pending![0]).toEqual([5, 6])
  })
})

describe('items', () => {
  it('Potions and Revives work, unless the admin switches them off', () => {
    const save = { ...withLead(extreme(), 1), inventory: { potion: 2 } }
    expect(applyFieldItem(save, 'potion', lead(save).id, data, createRng(1))).not.toBeNull()
    const off = extremeData({ items: false })
    expect(applyFieldItem(save, 'potion', lead(save).id, off, createRng(1))).toBeNull()
    expect(applyFieldItem({ ...save, mode: undefined }, 'potion', lead(save).id, off, createRng(1))).not.toBeNull()

    const fight = createBattle(
      {
        kind: 'wild',
        team: [{ uid: 'a', dex: 7, level: 10, hp: 5 }],
        leadUid: 'a',
        enemy: { dex: 19, level: 5 },
        playerLevels: uniformLevels(1),
        enemyLevels: uniformLevels(1),
        noHealItems: true,
      },
      data,
    ).state
    const turn = { ...fight, phase: 'player_roll' as const }
    expect(reduce(turn, { t: 'USE_ITEM', key: 'potion' }, data, createRng(1)).state).toBe(turn)
  })
})
