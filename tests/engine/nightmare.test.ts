// Newmoon Island's nightmare (docs/30): the foes in their fixed order (weakest to strongest, mostly Dark), the way in
// (healed on arrival as at a Center, the team free to change until it begins), Darkrai's strike after each round (10 %
// of max HP, rounded, at least 1, never a K.O.), the gifts after rounds 3 and 6 (once for good), the travel lock, the
// last round (woken up for good, the raid open at Lv.80), the wipe (back to 0, XP, ₽ and items kept), and the switch
// (off: the area plays as before).
import { describe, expect, it } from 'vitest'
import {
  applyNightmareStrike,
  applyWipe,
  arriveAtNightmare,
  canStartNightmare,
  canStartPortal,
  createInstance,
  DEFAULT_NIGHTMARE,
  emptyProgress,
  enterWorld,
  inNightmare,
  instanceMaxHp,
  markNightmareWonSeen,
  newSave,
  nightmareEncounter,
  nightmareFoe,
  nightmareLock,
  nightmareModeOf,
  nightmareNext,
  nightmareNoCatch,
  nightmareRounds,
  nightmareStateOf,
  nightmareStrikeHp,
  nightmareVictoryDue,
  nightmareVictoryToRaid,
  nightmareWon,
  normaliseNightmare,
  normalisePortal,
  openRaidIn,
  portalLock,
  progressRaidKey,
  progressRaidOf,
  progressRaidState,
  raidRules,
  raidTeamCap,
  simulateMany,
  startNightmare,
  teamSwapsOpen,
  uniformLevels,
  winNightmareRound,
  withWorldBoost,
  type GameData,
  type NightmareState,
  type SaveData,
} from '@/engine'
import { haunted } from '../../scripts/content-haunted-hollow'
import { makeDataWith, newId } from '../fixtures'

const h = haunted()
const NM = h.areas.find((a) => a.name === 'Newmoon Island')!
const NOW = Date.parse('2026-10-20T12:00:00.000Z')
const world = { ...h.world, start: '2026-10-18T12:00:00.000Z', minBadges: 0 }
const dataWith = (access: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, nightmare: { access } },
  )
const data = dataWith('all')
const off = dataWith('off')

/** Inside Haunted Hollow, standing on Newmoon Island with Gengar, Dusknoir and Chandelure at Lv.66, hurt. */
function atNewmoon(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 425, NOW, newId)!
  const team = [94, 477, 609].map((dex) => {
    const p = createInstance(dex, 66, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  return {
    ...s,
    box: team,
    team: team.map((p) => p.id),
    currentAreaId: NM.id,
    gold: 500,
    inventory: { potion: 2 },
  }
}
const begun = (d: GameData = data) => startNightmare(atNewmoon(d), d, NM.id)!
const withNightmare = (s: SaveData, patch: Partial<NightmareState>): SaveData => ({
  ...s,
  areaProgress: {
    ...s.areaProgress,
    [NM.id]: {
      ...emptyProgress(),
      ...s.areaProgress[NM.id],
      nightmare: { ...nightmareStateOf(s, NM.id), ...patch },
    },
  },
})
/** Win the round under way and take Darkrai's strike after it, as the game does between two rounds. */
function winAndStrike(s: SaveData): SaveData {
  const w = winNightmareRound(s, data, NM.id)!
  return w.victory ? w.save : applyNightmareStrike(w.save, data, NM.id)!.save
}

describe('the area and its switch', () => {
  it('Newmoon Island has its nightmare with the user’s numbers, read only while the switch is on', () => {
    expect(nightmareModeOf(NM, data)).toEqual(DEFAULT_NIGHTMARE)
    expect(DEFAULT_NIGHTMARE).toMatchObject({
      strikePercent: 10,
      gifts: [
        { round: 3, key: 'revive', qty: 1 },
        { round: 6, key: 'max-revive', qty: 1 },
      ],
      raid: { level: 80, upgradeLevel: 9, bars: 3, teamCap: 80 },
    })
    expect(nightmareRounds(DEFAULT_NIGHTMARE)).toBe(7)
    expect(nightmareModeOf(NM, off)).toBeNull()
  })

  it('cleans what the admin left: odd numbers fall back, gifts kept inside the rounds, one a round; other kinds are none', () => {
    const n = normaliseNightmare({
      kind: 'nightmare',
      foes: [{ dex: 359, level: 500 }, { dex: 'x' }, { dex: 571, level: 66 }],
      strikePercent: 'lots',
      gifts: [
        { round: 9, key: 'revive', qty: 1 },
        { round: 2, key: 'potion', qty: 0 },
        { round: 2, key: 'revive', qty: 1 },
      ],
    })!
    expect(n.foes).toEqual([
      { dex: 359, level: 100 },
      { dex: 571, level: 66 },
    ])
    expect(n.strikePercent).toBe(10)
    // Round 9 is past the last round (2): it becomes the last; the second gift of round 2 goes.
    expect(n.gifts).toEqual([{ round: 2, key: 'potion', qty: 1 }])
    expect(n.raid).toEqual(DEFAULT_NIGHTMARE.raid)
    expect(normaliseNightmare({ kind: 'portal' })).toBeNull()
    expect(normalisePortal(DEFAULT_NIGHTMARE)).toBeNull()
  })

  it('switched off, nothing begins and a nightmare under way no longer holds the player', () => {
    expect(startNightmare(atNewmoon(off), off, NM.id)).toBeNull()
    const s = begun()
    expect(nightmareLock(s, data)?.id).toBe(NM.id)
    expect(nightmareLock(s, off)).toBeNull()
    expect(inNightmare(s, off, NM.id)).toBe(false)
    // It is not a portal run: the portal's lock (every page shut) never holds it.
    expect(portalLock(s, data)).toBeNull()
    expect(canStartPortal(s, data, NM.id)).toBe(false)
  })
})

describe('the foes: a fixed order, weakest to strongest', () => {
  const foes = DEFAULT_NIGHTMARE.foes

  it('are seven of Darkrai’s nightmares, mostly Dark types, a level up each round', () => {
    expect(foes.map((f) => data.species[f.dex]!.name)).toEqual([
      'Musharna',
      'Sableye',
      'Absol',
      'Zoroark',
      'Hydreigon',
      'Tyranitar',
      'Honchkrow',
    ])
    const dark = foes.filter((f) => [data.species[f.dex]!.type1, data.species[f.dex]!.type2].includes('dark'))
    expect(dark.length).toBe(6)
    for (let i = 1; i < foes.length; i++) expect(foes[i]!.level).toBe(foes[i - 1]!.level + 1)
  })

  it('get harder: the world’s own Pokémon beat the first far more often than the last, at the same level', () => {
    // A light version of `pnpm nightmare-balance rank` (docs/30 §3): Gengar Lv.64 against each at Lv.65.
    const track = withWorldBoost(uniformLevels(8), data, NM)
    const foeTrack = withWorldBoost(uniformLevels(NM.enemyUpgradeLevel ?? 7), data, NM)
    const lost = (dex: number) =>
      1 - simulateMany({ dex: 94, level: 64 }, { dex, level: 65 }, track, foeTrack, 60, data, dex).winRate
    expect(lost(foes[0]!.dex)).toBeLessThan(0.3)
    expect(lost(foes.at(-1)!.dex)).toBeGreaterThan(0.6)
  })

  it('come in that order every time, whatever the try: the round’s foe, never shiny', () => {
    let s = begun()
    const met: number[] = []
    for (let r = 0; r < foes.length; r++) {
      const enc = nightmareEncounter(s, data, NM.id)!
      // Asked twice, the same foe: nothing is drawn at random.
      expect(nightmareEncounter(s, data, NM.id)).toEqual(enc)
      expect(enc).toMatchObject({ kind: 'wild', dex: foes[r]!.dex, level: foes[r]!.level })
      expect(enc.kind === 'wild' && enc.shiny).toBeFalsy()
      expect(nightmareFoe(s, data, NM.id)).toMatchObject({ round: r + 1, total: 7 })
      met.push(foes[r]!.dex)
      s = winAndStrike(s)
    }
    expect(met).toEqual(foes.map((f) => f.dex))
    expect(nightmareEncounter(s, data, NM.id)).toBeNull()
  })

  it('can’t be caught', () => {
    expect(nightmareNoCatch(begun(), data, NM.id)).toBe(true)
    expect(nightmareNoCatch(atNewmoon(), data, NM.id)).toBe(false)
  })
})

describe('the way in', () => {
  it('arriving heals the team and the Box as a Pokémon Center does; nothing to heal, the same save', () => {
    const boxed = { ...createInstance(92, 40, data, newId(), NOW), currentHp: 1 }
    const s = { ...atNewmoon(), box: [...atNewmoon().box, boxed] }
    const healed = arriveAtNightmare(s, data, NM.id)
    for (const p of healed.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(arriveAtNightmare(healed, data, NM.id)).toBe(healed)
    // Not at a way in: inside it, or once it's over.
    const inside = begun()
    expect(arriveAtNightmare(inside, data, NM.id)).toBe(inside)
  })

  it('the team can change at the way in (as at a Center) until it begins, never inside', () => {
    const at = { phase: 'idle', areaId: NM.id }
    expect(teamSwapsOpen(atNewmoon(), data, at)).toBe(true)
    expect(teamSwapsOpen(begun(), data, at)).toBe(false)
    expect(teamSwapsOpen(atNewmoon(off), off, at)).toBe(false)
  })

  it('begins healed, at round 1, the try counted, holding the player in the area', () => {
    const s = begun()
    for (const p of s.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(nightmareStateOf(s, NM.id)).toEqual({ active: true, round: 0, tries: 1 })
    expect(nightmareNext(s, data, NM.id)).toBe('foe')
    expect(nightmareLock(s, data)?.id).toBe(NM.id)
    expect(canStartNightmare(s, data, NM.id)).toBe(false)
    expect(startNightmare(s, data, NM.id)).toBeNull()
  })
})

describe('after each round: Darkrai’s strike', () => {
  it('is due once a round is won, and holds the next foe until it lands', () => {
    const w = winNightmareRound(begun(), data, NM.id)!
    expect(w).toMatchObject({ round: 1, total: 7, victory: false, gift: null })
    expect(nightmareStateOf(w.save, NM.id)).toMatchObject({ round: 1, strike: true })
    expect(nightmareNext(w.save, data, NM.id)).toBe('strike')
    expect(nightmareEncounter(w.save, data, NM.id)).toBeNull()
    // A round can't be won twice before the strike.
    expect(winNightmareRound(w.save, data, NM.id)).toBeNull()
  })

  it('takes 10 % of each one’s max HP, rounded, at least 1, and never K.O.s: a K.O. one stays as it is', () => {
    expect(nightmareStrikeHp(200, 271, 10)).toBe(173)
    // 10 % of 245 is 24.5: rounded to 25.
    expect(nightmareStrikeHp(245, 245, 10)).toBe(220)
    // 10 % of 4 is 0.4: at least 1.
    expect(nightmareStrikeHp(4, 4, 10)).toBe(3)
    // Never a K.O.: down to 1 HP at most.
    expect(nightmareStrikeHp(12, 271, 10)).toBe(1)
    expect(nightmareStrikeHp(1, 271, 10)).toBe(1)
    expect(nightmareStrikeHp(0, 271, 10)).toBe(0)
    expect(nightmareStrikeHp(100, 271, 0)).toBe(100)
  })

  it('hits every team member, then the next round can come', () => {
    let s = winNightmareRound(begun(), data, NM.id)!.save
    const [a, b, c] = s.team.map((id) => s.box.find((p) => p.id === id)!)
    s = {
      ...s,
      box: s.box.map((p) =>
        p.id === b!.id ? { ...p, currentHp: 3 } : p.id === c!.id ? { ...p, currentHp: 0 } : p,
      ),
    }
    const r = applyNightmareStrike(s, data, NM.id)!
    const max = instanceMaxHp(a!, data)
    expect(r.hits).toEqual([
      { uid: a!.id, from: max, to: max - Math.round(max / 10) },
      { uid: b!.id, from: 3, to: 1 },
      { uid: c!.id, from: 0, to: 0 },
    ])
    expect(r.save.box.find((p) => p.id === a!.id)!.currentHp).toBe(max - Math.round(max / 10))
    expect(nightmareStateOf(r.save, NM.id)).toMatchObject({ round: 1, strike: false })
    expect(nightmareNext(r.save, data, NM.id)).toBe('foe')
    expect(nightmareEncounter(r.save, data, NM.id)).toMatchObject({ dex: DEFAULT_NIGHTMARE.foes[1]!.dex })
    // Nothing due: no strike.
    expect(applyNightmareStrike(r.save, data, NM.id)).toBeNull()
  })
})

describe('the gifts', () => {
  it('a Revive after round 3, a Max Revive after round 6, nothing after the others', () => {
    let s = begun()
    const gifts: (string | null)[] = []
    for (let r = 1; r <= 6; r++) {
      const w = winNightmareRound(s, data, NM.id)!
      gifts.push(w.gift?.key ?? null)
      s = applyNightmareStrike(w.save, data, NM.id)!.save
    }
    expect(gifts).toEqual([null, null, 'revive', null, null, 'max-revive'])
    expect(s.inventory).toMatchObject({ potion: 2, revive: 1, 'max-revive': 1 })
    expect(nightmareStateOf(s, NM.id).gifted).toEqual([3, 6])
  })

  it('once for good: after a wipe, the next try’s rounds 3 and 6 give nothing again', () => {
    let s = begun()
    for (let r = 1; r <= 3; r++) s = winAndStrike(s)
    expect(s.inventory.revive).toBe(1)
    s = applyWipe({ ...s, box: s.box.map((p) => ({ ...p, currentHp: 0 })) }, NM.id, data)
    s = startNightmare(s, data, NM.id)!
    expect(nightmareStateOf(s, NM.id)).toMatchObject({ round: 0, gifted: [3], tries: 2 })
    for (let r = 1; r <= 3; r++) {
      const w = winNightmareRound(s, data, NM.id)!
      expect(w.gift).toBeNull()
      s = applyNightmareStrike(w.save, data, NM.id)!.save
    }
    expect(s.inventory.revive).toBe(1)
    // Round 6's is still to come.
    for (let r = 4; r <= 5; r++) s = winAndStrike(s)
    expect(winNightmareRound(s, data, NM.id)!.gift).toEqual({ key: 'max-revive', qty: 1 })
  })
})

describe('how it ends', () => {
  const darkrai = () => progressRaidOf(data, progressRaidKey(NM.id, 491))!

  it('the 7th round won wakes the player: no strike, the team healed, the lock gone, the raid open at Lv.80', () => {
    let s = withNightmare(begun(), { round: 6 })
    s = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }
    expect(progressRaidState(s, data, darkrai())).toBe('locked')
    const w = winNightmareRound(s, data, NM.id)!
    expect(w).toMatchObject({ round: 7, victory: true })
    expect(nightmareStateOf(w.save, NM.id)).toMatchObject({
      active: false,
      round: 7,
      won: true,
      wonSeen: false,
    })
    expect(nightmareStateOf(w.save, NM.id).strike).toBeUndefined()
    for (const p of w.save.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(nightmareLock(w.save, data)).toBeNull()
    expect(nightmareWon(w.save, data, NM.id)).toBe(true)
    expect(canStartNightmare(w.save, data, NM.id)).toBe(false)
    expect(nightmareVictoryDue(w.save, data, NM.id)).toBe(true)
    expect(nightmareVictoryDue(markNightmareWonSeen(w.save, NM.id), data, NM.id)).toBe(false)
    expect(progressRaidState(w.save, data, darkrai())).toBe('open')
    expect(raidRules(data, 491, 'progress', NM.id)).toMatchObject({ level: 80, upgradeLevel: 9, bars: 3 })
    expect(raidTeamCap(data, 491, 'progress', NM.id)).toBe(80)
  })

  it('HEAL & START RAID: the team and the Box healed as at a Center, the waking seen, the raid open to start', () => {
    let s = withNightmare(begun(), { round: 6 })
    const boxed = { ...createInstance(92, 40, data, newId(), NOW), currentHp: 1 }
    s = { ...s, box: [...s.box.map((p) => ({ ...p, currentHp: 1 })), boxed] }
    const won = winNightmareRound(s, data, NM.id)!.save
    // Waking heals the team only: the Box waits for a Center.
    expect(won.box.at(-1)!.currentHp).toBe(1)
    const r = nightmareVictoryToRaid(won, data, NM.id)
    for (const p of r.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(nightmareStateOf(r, NM.id)).toMatchObject({ won: true, wonSeen: true })
    expect(openRaidIn(r, data, NM)?.key).toBe(darkrai().key)
    const plain = atNewmoon()
    expect(nightmareVictoryToRaid(plain, data, NM.id)).toBe(plain)
  })

  it('a wipe wakes the player: back to round 1, the team healed, free to go; XP, ₽ and items kept; the raid still shut', () => {
    let s = withNightmare(begun(), { round: 4, strike: true, gifted: [3] })
    s = {
      ...s,
      gold: 1234,
      inventory: { revive: 3 },
      box: s.box.map((p) => ({ ...p, currentHp: 0, xp: 77 })),
    }
    const w = applyWipe(s, NM.id, data)
    expect(nightmareStateOf(w, NM.id)).toEqual({ active: false, round: 0, gifted: [3], tries: 1 })
    expect(w.gold).toBe(1234)
    expect(w.inventory).toEqual({ revive: 3 })
    for (const p of w.box) {
      expect(p.currentHp).toBe(instanceMaxHp(p, data))
      expect(p.xp).toBe(77)
    }
    expect(nightmareLock(w, data)).toBeNull()
    expect(progressRaidState(w, data, darkrai())).toBe('locked')
    expect(canStartNightmare(w, data, NM.id)).toBe(true)
  })

  it('switched off, the raid is as before: open once the area is cleared, at the world’s level', () => {
    const s = atNewmoon(off)
    const raid = progressRaidOf(off, progressRaidKey(NM.id, 491))!
    expect(progressRaidState(s, off, raid)).toBe('locked')
    const cleared = {
      ...s,
      areaProgress: { ...s.areaProgress, [NM.id]: { ...emptyProgress(), cleared: true } },
    }
    expect(progressRaidState(cleared, off, raid)).toBe('open')
    expect(raidRules(off, 491, 'progress', NM.id).level).toBe(60)
  })
})
