// Distortion World's portal run (docs/28): the deck (wild and finds shuffled, the distortion last, for ever), the way in
// (healed on arrival as at a Center, the team free to change until READY!), the boons offered (distinct kinds, only
// those that can help, the 8-dice cap), what each does (the +10 boost added like a combo, the extra die in battle), the
// last portal (won for good, the raid open at Lv.100), the wipe (back to 0, boons lost, XP, ₽ and items kept), and the
// switch (off: the area plays as before).
import { describe, expect, it } from 'vitest'
import {
  applyWipe,
  arriveAtPortal,
  canStartPortal,
  computeDamage,
  createInstance,
  createRng,
  DEFAULT_PORTAL_RUN,
  drawOffers,
  emptyProgress,
  drawPortalCard,
  portalNextCard,
  eligibleOffers,
  enterWorld,
  inPortalRun,
  isAreaSealed,
  instanceMaxHp,
  makeBattler,
  newSave,
  normalisePortal,
  openDistortion,
  pickDistortion,
  portalCycle,
  portalDiceCount,
  portalDiceFor,
  portalLevels,
  portalLock,
  portalModeOf,
  portalNoCatch,
  portalStateOf,
  portalVictoryDue,
  markPortalWonSeen,
  openRaidIn,
  portalVictoryToRaid,
  progressRaidKey,
  progressRaidOf,
  progressRaidState,
  raidRules,
  raidTeamCap,
  startPortalRun,
  teamSwapsOpen,
  uniformLevels,
  withExtraDice,
  type DistortionOffer,
  type GameData,
  type PortalState,
  type RolledDie,
  type SaveData,
} from '@/engine'
import { haunted, WORLD_ID } from '../../scripts/content-haunted-hollow'
import { makeDataWith, newId } from '../fixtures'

const h = haunted()
const DW = h.areas.find((a) => a.name === 'Distortion World')!
const NOW = Date.parse('2026-10-20T12:00:00.000Z')
const world = { ...h.world, start: '2026-10-18T12:00:00.000Z', minBadges: 0, previewHours: 48 }
const dataWith = (access: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, portalRun: { access } },
  )
const data = dataWith('all')
const off = dataWith('off')

/** Inside Haunted Hollow, standing in Distortion World with Gengar, Dusknoir and Chandelure at Lv.68, hurt. */
function atDistortion(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 425, NOW, newId)!
  const team = [94, 477, 609].map((dex) => {
    const p = createInstance(dex, 68, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  return {
    ...s,
    box: team,
    team: team.map((p) => p.id),
    currentAreaId: DW.id,
    gold: 500,
    inventory: { potion: 2 },
  }
}
const rng = () => createRng(7)
const inRun = (d: GameData = data) => startPortalRun(atDistortion(d), d, DW.id, rng())!
const withPortal = (s: SaveData, patch: Partial<PortalState>): SaveData => ({
  ...s,
  areaProgress: {
    ...s.areaProgress,
    [DW.id]: {
      ...emptyProgress(),
      ...s.areaProgress[DW.id],
      portal: { ...portalStateOf(s, DW.id), ...patch },
    },
  },
})

describe('the area and its switch', () => {
  it('Distortion World has its portal run with the user’s numbers, read only while the switch is on', () => {
    expect(portalModeOf(DW, data)).toEqual(DEFAULT_PORTAL_RUN)
    expect(DEFAULT_PORTAL_RUN).toMatchObject({
      portals: 10,
      wild: 5,
      items: 1,
      offers: 3,
      raid: { level: 100, upgradeLevel: 10, bars: 4, teamCap: 100 },
    })
    expect(portalModeOf(DW, off)).toBeNull()
    expect(DW.unlockConditions).toEqual([{ kind: 'pokedex', count: 100 }])
  })

  it('cleans what the admin left: odd numbers fall back, kinds that aren’t a portal are none', () => {
    expect(normalisePortal({ kind: 'portal', portals: 'x', die: { maxDice: 40 } })).toMatchObject({
      portals: 10,
      die: { maxDice: 12 },
    })
    expect(normalisePortal({ kind: 'other' })).toBeNull()
  })

  it('switched off, nothing starts and a run under way no longer holds the player', () => {
    expect(startPortalRun(atDistortion(off), off, DW.id, rng())).toBeNull()
    const s = inRun()
    expect(portalLock(s, data)?.id).toBe(DW.id)
    expect(portalLock(s, off)).toBeNull()
    expect(inPortalRun(s, off, DW.id)).toBe(false)
  })
})

describe('the deck', () => {
  it('is 5 wild and 1 find shuffled, then the distortion, always last', () => {
    for (let seed = 1; seed < 20; seed++) {
      const cycle = portalCycle(DEFAULT_PORTAL_RUN, createRng(seed))
      expect(cycle).toHaveLength(7)
      expect(cycle[0]).toBe('distortion') // drawn from the end: last
      expect(cycle.filter((c) => c === 'wild')).toHaveLength(5)
      expect(cycle.filter((c) => c === 'item')).toHaveLength(1)
    }
  })

  it('repeats: seven draws end on the distortion, the eighth starts a new cycle', () => {
    let s = inRun()
    const r = rng()
    const cards = []
    for (let i = 0; i < 8; i++) {
      const d = drawPortalCard(s, data, DW.id, r)!
      cards.push(d.card)
      s = d.save
      if (d.card === 'distortion') s = withPortal(s, { closed: portalStateOf(s, DW.id).closed + 1 })
    }
    expect(cards[6]).toBe('distortion')
    expect(cards.slice(0, 6)).not.toContain('distortion')
    expect(cards[7]).not.toBe('distortion')
  })

  it('tells which card comes next: the distortion after the sixth draw, nothing while a choice waits', () => {
    let s = inRun()
    const r = rng()
    for (let i = 0; i < 6; i++) {
      expect(portalNextCard(s, DW.id)).not.toBe('distortion')
      s = drawPortalCard(s, data, DW.id, r)!.save
    }
    expect(portalNextCard(s, DW.id)).toBe('distortion')
    expect(portalNextCard(withPortal(s, { offers: [{ kind: 'item' }] }), DW.id)).toBeNull()
  })

  it('waits while a distortion is open', () => {
    const s = withPortal(inRun(), { offers: [{ kind: 'item' }] })
    expect(drawPortalCard(s, data, DW.id, rng())).toBeNull()
  })
})

describe('the way in', () => {
  it('heals the team fully and starts at 0, counting the try', () => {
    const before = atDistortion()
    const s = startPortalRun(
      { ...before, box: before.box.map((p, i) => (i === 0 ? { ...p, currentHp: 0 } : p)) },
      data,
      DW.id,
      rng(),
    )!
    for (const p of s.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(portalStateOf(s, DW.id)).toMatchObject({ active: true, closed: 0, tries: 1 })
    expect(canStartPortal(s, data, DW.id)).toBe(false)
    expect(portalLock(s, data)?.id).toBe(DW.id)
  })

  it('its wild Pokémon can’t be caught', () => {
    expect(portalNoCatch(inRun(), data, DW.id)).toBe(true)
    expect(portalNoCatch(atDistortion(), data, DW.id)).toBe(false)
  })

  it('arriving there heals the team and the Box as a Pokémon Center does; nothing to heal, the same save', () => {
    const before = atDistortion()
    const boxed = { ...createInstance(92, 40, data, newId(), NOW), currentHp: 1 }
    const s = { ...before, box: [...before.box, boxed] }
    const healed = arriveAtPortal(s, data, DW.id)
    for (const p of healed.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(healed.team).toEqual(s.team)
    // Back from the Team screen: nothing changes, nothing to write.
    expect(arriveAtPortal(healed, data, DW.id)).toBe(healed)
    // READY! heals again, harmlessly.
    const started = startPortalRun(healed, data, DW.id, rng())!
    for (const p of started.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
  })

  it('no heal outside a way in: inside a run, once won, switched off', () => {
    const hurt = (s: SaveData) => ({ ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) })
    const running = hurt(inRun())
    expect(arriveAtPortal(running, data, DW.id)).toBe(running)
    const won = hurt(withPortal(atDistortion(), { won: true }))
    expect(arriveAtPortal(won, data, DW.id)).toBe(won)
    const plain = hurt(atDistortion(off))
    expect(arriveAtPortal(plain, off, DW.id)).toBe(plain)
  })

  it('the team can change at the way in (as at a Center) until READY!, and never inside the run', () => {
    const idle = { phase: 'idle', areaId: DW.id }
    expect(teamSwapsOpen(atDistortion(), data, idle)).toBe(true)
    expect(teamSwapsOpen(atDistortion(), data, { phase: 'center', areaId: 'anywhere' })).toBe(true)
    // READY! pressed: the run is under way.
    expect(teamSwapsOpen(inRun(), data, idle)).toBe(false)
    // Not standing at it (NOT NOW, another area), a fight, the run won, the switch off.
    expect(teamSwapsOpen(atDistortion(), data, { phase: 'idle', areaId: null })).toBe(false)
    expect(teamSwapsOpen({ ...atDistortion(), currentAreaId: 'elsewhere' }, data, idle)).toBe(false)
    expect(teamSwapsOpen(atDistortion(), data, { phase: 'battle', areaId: DW.id })).toBe(false)
    expect(teamSwapsOpen(withPortal(atDistortion(), { won: true }), data, idle)).toBe(false)
    expect(teamSwapsOpen(atDistortion(off), off, idle)).toBe(false)
  })
})

describe('the boons', () => {
  it('offers distinct kinds, only those that can help', () => {
    const s = inRun() // everyone at full HP: no heal, nobody K.O.: no revive
    const p = portalStateOf(s, DW.id)
    expect(eligibleOffers(s, data, DEFAULT_PORTAL_RUN, p)).toEqual(['boost', 'die', 'item'])
    const hurt = {
      ...s,
      box: s.box.map((x, i) => (i === 0 ? { ...x, currentHp: 0 } : i === 1 ? { ...x, currentHp: 5 } : x)),
    }
    expect(eligibleOffers(hurt, data, DEFAULT_PORTAL_RUN, p)).toEqual([
      'heal',
      'revive',
      'boost',
      'die',
      'item',
    ])
    for (let seed = 1; seed < 30; seed++) {
      const offers = drawOffers(hurt, data, DEFAULT_PORTAL_RUN, p, createRng(seed))
      expect(offers).toHaveLength(3)
      expect(new Set(offers.map((o) => o.kind)).size).toBe(3)
      const revive = offers.find((o) => o.kind === 'revive')
      if (revive) expect(revive).toEqual({ kind: 'revive', uid: hurt.box[0]!.id })
    }
  })

  it('names a die of one of the Pokémon’s types, never for one at 8 dice already', () => {
    const s = inRun()
    const [gengar, dusknoir, chandelure] = s.box
    const full = (p: typeof gengar) =>
      Array.from({ length: 8 - portalDiceCount(p!, data, portalStateOf(s, DW.id)) }, () => 'ghost' as const)
    const capped = withPortal(s, { dice: { [gengar!.id]: full(gengar), [dusknoir!.id]: full(dusknoir) } })
    const p = portalStateOf(capped, DW.id)
    expect(portalDiceCount(gengar!, data, p)).toBe(8)
    for (let seed = 1; seed < 30; seed++) {
      const o = drawOffers(capped, data, DEFAULT_PORTAL_RUN, p, createRng(seed)).find((x) => x.kind === 'die')
      if (o?.kind === 'die') {
        expect(o.uid).toBe(chandelure!.id)
        expect(['ghost', 'fire']).toContain(o.type)
      }
    }
    const all = withPortal(capped, { dice: { ...p.dice, [chandelure!.id]: full(chandelure) } })
    expect(eligibleOffers(all, data, DEFAULT_PORTAL_RUN, portalStateOf(all, DW.id))).not.toContain('die')
  })

  it('a boost names one of the team’s dice types', () => {
    const s = inRun()
    for (let seed = 1; seed < 20; seed++) {
      const o = drawOffers(
        s,
        data,
        { ...DEFAULT_PORTAL_RUN, offers: 5 },
        portalStateOf(s, DW.id),
        createRng(seed),
      ).find((x) => x.kind === 'boost')
      expect(o?.kind === 'boost' && ['ghost', 'poison', 'fire'].includes(o.type)).toBe(true)
    }
  })

  const pick = (s: SaveData, offer: DistortionOffer) =>
    pickDistortion(withPortal(s, { offers: [offer] }), data, DW.id, 0, rng())!

  it('heal: 30 % of max HP to every Pokémon standing; revive: a Revive’s HP; each closes the distortion', () => {
    const s0 = inRun()
    const s = {
      ...s0,
      box: s0.box.map((x, i) => (i === 0 ? { ...x, currentHp: 0 } : { ...x, currentHp: 10 })),
    }
    const healed = pick(s, { kind: 'heal', percent: 30 }).save
    expect(healed.box[0]!.currentHp).toBe(0)
    expect(healed.box[1]!.currentHp).toBe(10 + Math.round(instanceMaxHp(s.box[1]!, data) * 0.3))
    expect(portalStateOf(healed, DW.id)).toMatchObject({ closed: 1, offers: null })
    const revived = pick(s, { kind: 'revive', uid: s.box[0]!.id }).save
    expect(revived.box[0]!.currentHp).toBe(Math.floor(instanceMaxHp(s.box[0]!, data) / 2))
  })

  it('boost: stacks; die: one more for the run; item: one of the rare ones into the bag', () => {
    let s = inRun()
    s = pick(s, { kind: 'boost', type: 'ghost', amount: 10 }).save
    s = pick(s, { kind: 'boost', type: 'ghost', amount: 10 }).save
    expect(portalStateOf(s, DW.id).boosts).toEqual({ ghost: 20 })
    s = pick(s, { kind: 'die', uid: s.box[0]!.id, type: 'poison' }).save
    expect(portalStateOf(s, DW.id).dice).toEqual({ [s.box[0]!.id]: ['poison'] })
    const got = pick(s, { kind: 'item' })
    expect(['hyper-potion', 'revive', 'max-revive']).toContain(got.itemKey)
    expect(got.save.inventory[got.itemKey!]).toBe(1)
    expect(portalStateOf(got.save, DW.id).closed).toBe(4)
  })
})

describe('in battle', () => {
  const dice = (type: 'ghost' | 'base', faces: number[]): RolledDie[] =>
    faces.map((faceIndex) => ({ type, faceIndex }))

  it('the boost adds its amount like a combo, × the attack type’s multiplier, only on attacks of its type', () => {
    const levels = { ...uniformLevels(1), typeFlat: { ghost: 10 } }
    const roll = dice('ghost', [0, 1])
    const plain = computeDamage(roll, ['ghost'], ['psychic'], uniformLevels(1), data)
    const boosted = computeDamage(roll, ['ghost'], ['psychic'], levels, data)
    expect(boosted.flat).toEqual({ type: 'ghost', amount: 10 })
    expect(boosted.raw - plain.raw).toBe(10 * 2) // Ghost on Psychic: ×2
    // An untyped attack, or one of another type, gets nothing.
    const base = computeDamage(dice('base', [0, 1]), ['ghost'], ['psychic'], levels, data)
    expect(base.flat).toBeUndefined()
    expect(computeDamage(roll, ['ghost'], ['normal'], levels, data).final).toBe(0) // immune stays immune
  })

  it('the run’s boosts and dice reach the battle; extra dice stay under the cap', () => {
    let s = inRun()
    s = withPortal(s, {
      boosts: { fire: 10 },
      dice: { [s.box[0]!.id]: ['poison', 'poison', 'poison', 'poison', 'poison'] },
    })
    expect(portalLevels(uniformLevels(1), s, data, DW.id).typeFlat).toEqual({ fire: 10 })
    const extra = portalDiceFor(s, data, DW.id, s.box[0]!.id)!
    expect(extra.diceCap).toBe(8)
    const b = makeBattler({ uid: 'g', dex: 94, level: 68, hp: 100, ...extra }, data)
    expect(b.dice.length).toBe(8)
    expect(withExtraDice(['ghost', 'base'], ['fire'], 8)).toEqual(['ghost', 'fire', 'base'])
    expect(withExtraDice(['ghost', 'ghost'], ['fire', 'fire'], 3)).toEqual(['ghost', 'ghost', 'fire'])
    // Out of a run, nothing.
    expect(portalLevels(uniformLevels(1), atDistortion(), data, DW.id).typeFlat).toBeUndefined()
    expect(portalDiceFor(atDistortion(), data, DW.id, s.box[0]!.id)).toBeNull()
  })
})

describe('how a run ends', () => {
  const giratina = () => progressRaidOf(data, progressRaidKey(DW.id, 487))!

  it('the 10th distortion wins: no boon, the boons gone, the team healed, the raid open at its own numbers', () => {
    let s = withPortal(inRun(), { closed: 9, boosts: { ghost: 10 }, dice: { x: ['ghost'] } })
    s = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 1 })) }
    expect(progressRaidState(s, data, giratina())).toBe('locked')
    const r = openDistortion(s, data, DW.id, rng())!
    expect(r.victory).toBe(true)
    const p = portalStateOf(r.save, DW.id)
    expect(p).toMatchObject({ active: false, closed: 10, won: true, wonSeen: false })
    expect(p.boosts).toBeUndefined()
    expect(p.dice).toBeUndefined()
    for (const x of r.save.box) expect(x.currentHp).toBe(instanceMaxHp(x, data))
    expect(portalLock(r.save, data)).toBeNull()
    expect(canStartPortal(r.save, data, DW.id)).toBe(false)
    expect(portalVictoryDue(r.save, data, DW.id)).toBe(true)
    expect(portalVictoryDue(markPortalWonSeen(r.save, DW.id), data, DW.id)).toBe(false)
    expect(progressRaidState(r.save, data, giratina())).toBe('open')
    expect(raidRules(data, 487, 'progress', DW.id)).toMatchObject({ level: 100, upgradeLevel: 10, bars: 4 })
    expect(raidTeamCap(data, 487, 'progress', DW.id)).toBe(100)
  })

  it('HEAL & START RAID: the team and the Box healed as at a Center, the victory seen, the raid open to start', () => {
    let s = withPortal(inRun(), { closed: 9 })
    const boxed = { ...createInstance(92, 40, data, newId(), NOW), currentHp: 1 }
    s = { ...s, box: [...s.box.map((p) => ({ ...p, currentHp: 1 })), boxed] }
    const won = openDistortion(s, data, DW.id, rng())!.save
    // winPortal heals the team only: the Box waits for a Center.
    expect(won.box.at(-1)!.currentHp).toBe(1)
    const r = portalVictoryToRaid(won, data, DW.id)
    for (const p of r.box) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    expect(portalVictoryDue(r, data, DW.id)).toBe(false)
    expect(portalStateOf(r, DW.id)).toMatchObject({ won: true, wonSeen: true })
    expect(openRaidIn(r, data, DW)?.key).toBe(giratina().key)
    // No victory here: nothing changes.
    const plain = atDistortion()
    expect(portalVictoryToRaid(plain, data, DW.id)).toBe(plain)
  })

  it('once won, the area deals no more cards (only its raid, then sealed); never before, nor switched off', () => {
    const won = withPortal(atDistortion(), { active: false, closed: 10, deck: [], won: true, wonSeen: true })
    expect(isAreaSealed(won, data, DW.id)).toBe(true)
    expect(isAreaSealed(inRun(), data, DW.id)).toBe(false)
    expect(isAreaSealed(atDistortion(), data, DW.id)).toBe(false)
    expect(isAreaSealed(withPortal(atDistortion(off), { won: true }), off, DW.id)).toBe(false)
  })

  it('any other distortion opens its boons instead', () => {
    const r = openDistortion(withPortal(inRun(), { closed: 3 }), data, DW.id, rng())!
    expect(r.victory).toBe(false)
    expect(portalStateOf(r.save, DW.id).offers?.length).toBe(3)
  })

  it('a wipe: back to 0, boons lost, the team healed; XP, ₽ and items kept; the raid still shut', () => {
    let s = withPortal(inRun(), {
      closed: 6,
      boosts: { ghost: 20 },
      dice: { a: ['ghost'] },
      offers: [{ kind: 'item' }],
    })
    s = {
      ...s,
      gold: 1234,
      inventory: { revive: 3 },
      box: s.box.map((p) => ({ ...p, currentHp: 0, xp: 77 })),
    }
    const w = applyWipe(s, DW.id, data)
    expect(portalStateOf(w, DW.id)).toEqual({ active: false, closed: 0, deck: [], tries: 1 })
    expect(w.gold).toBe(1234)
    expect(w.inventory).toEqual({ revive: 3 })
    for (const p of w.box) {
      expect(p.currentHp).toBe(instanceMaxHp(p, data))
      expect(p.xp).toBe(77)
    }
    expect(progressRaidState(w, data, giratina())).toBe('locked')
    expect(canStartPortal(w, data, DW.id)).toBe(true)
  })

  it('switched off, the raid is as before: open once the area is cleared', () => {
    const s = atDistortion(off)
    const raid = progressRaidOf(off, progressRaidKey(DW.id, 487))!
    expect(progressRaidState(s, off, raid)).toBe('locked')
    const cleared = {
      ...s,
      areaProgress: { ...s.areaProgress, [DW.id]: { ...emptyProgress(), cleared: true } },
    }
    expect(progressRaidState(cleared, off, raid)).toBe('open')
    expect(raidRules(off, 487, 'progress', DW.id).level).toBe(70)
    void WORLD_ID
  })
})
