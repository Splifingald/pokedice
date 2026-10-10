import { describe, expect, it } from 'vitest'
import {
  createInstance,
  createRng,
  dayCareLevelProgress,
  dayCareOf,
  badgeCase,
  dayCareTutorialDue,
  dayCareXp,
  depositError,
  depositPokemon,
  eggOdds,
  eggSpecies,
  fitDayCare,
  getRegion,
  hatchEgg,
  hatchLevel,
  inviteGuest,
  leaderboardTutorialDue,
  leaderboardUnlocked,
  isDayCareOpen,
  markDayCareVisited,
  newRegionBlock,
  newSave,
  nextDayCareTick,
  ownedPokemon,
  refreshGuests,
  removeGuest,
  residentNow,
  startRegion,
  switchRegion,
  withdrawPokemon,
  xpToNext,
  type DayCareGuest,
  type DayCareResident,
  type DayCareState,
  type Rng,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { data, newId } from '../fixtures'

const MIN = 60_000
const cfg = data.config.dayCare
const withMons = (levels: number[]): SaveData => {
  const s = newSave(4, data, 0, newId)
  const extra = levels.slice(1).map((lv, i) => createInstance(16 + i * 3, lv, data, `m${i}`, 0))
  const box = [{ ...s.box[0]!, level: levels[0]! }, ...extra]
  return { ...s, box, team: box.slice(0, 3).map((p) => p.id), gold: 1000 }
}
const resident = (dex: number, level: number, id: string, since = 0, region = 'kanto'): DayCareResident => ({
  inst: createInstance(dex, level, data, id, 0),
  since,
  region,
})
const care = (dc: Partial<DayCareState>): DayCareState => ({ residents: [], guests: [], eggClaimed: true, ...dc })
const guest = (dex: number, inst: string, owner = 'lea', level = 30): DayCareGuest => ({
  owner,
  ownerName: owner === 'lea' ? 'Lea' : 'Noor',
  ownerAvatar: 'red',
  inst,
  dex,
  level,
  addedAt: 0,
})
const withEgg = (s: SaveData): SaveData => ({ ...s, dayCare: { ...dayCareOf(s), egg: { at: 0 } } })
/** The real rng for the species, with the shiny roll forced. */
const shinyRng = (seed: number, shiny: boolean): Rng => ({ ...createRng(seed), next: () => (shiny ? 0 : 0.999) })
const johto = getRegion(data, 'johto')!

describe('Day Care', () => {
  it('opens once enough species are caught', () => {
    const s = newSave(4, data, 0, newId)
    expect(isDayCareOpen(s, data)).toBe(false)
    expect(isDayCareOpen({ ...s, pokedex: Array.from({ length: cfg.unlockPokedex }, (_, i) => i + 1) }, data)).toBe(true)
  })

  it('counts distinct species across every region: 12 in Kanto and 8 others in Johto open it', () => {
    const s = newSave(4, data, 0, newId)
    const kanto = { ...s, pokedex: Array.from({ length: 12 }, (_, i) => i + 1) }
    const both = startRegion(kanto, johto, newRegionBlock(johto, 152, data, 0, newId, createInstance))
    const at = (pokedex: number[]) => ({ ...both, pokedex })
    // 7 new ones and one Kanto species again: 19 distinct, still shut.
    expect(isDayCareOpen(at([152, 153, 154, 155, 156, 157, 158, 1]), data)).toBe(false)
    expect(isDayCareOpen(at([152, 153, 154, 155, 156, 157, 158, 159]), data)).toBe(true)
  })

  it('sends the player there once when it opens: due until the first visit, never for saves that used it', () => {
    const closed = newSave(4, data, 0, newId)
    expect(dayCareTutorialDue(closed, data)).toBe(false)
    const open = { ...closed, pokedex: Array.from({ length: cfg.unlockPokedex }, (_, i) => i + 1) }
    expect(dayCareTutorialDue(open, data)).toBe(true)
    const visited = markDayCareVisited(open)
    expect(dayCareTutorialDue(visited, data)).toBe(false)
    expect(markDayCareVisited(visited)).toBe(visited)
    expect(dayCareTutorialDue({ ...open, dayCare: care({ eggClaimed: true }) }, data)).toBe(false)
  })

  it('takes Pokémon out of the team and the Box, 2 at most, never the last team member', () => {
    const s = withMons([10, 12, 14, 16])
    const [a, b, c] = s.box
    const one = depositPokemon(s, a!.id, data, 0)!
    expect(one.box.map((p) => p.id)).not.toContain(a!.id)
    expect(one.team).not.toContain(a!.id)
    expect(dayCareOf(one).residents.map((r) => [r.inst.id, r.region])).toEqual([[a!.id, 'kanto']])
    const two = depositPokemon(one, b!.id, data, 0)!
    expect(depositError(two, c!.id, data)).toBe('full')

    const lonely = { ...s, box: [a!], team: [a!.id] }
    expect(depositError(lonely, a!.id, data)).toBe('last')
  })

  // The tick length is admin-tuned, so the rule is checked against the config rather than the numbers of the day.
  it('gains xpPerTick per tick with no cap but the level cap', () => {
    const { tickMinutes: tick, xpPerTick: per } = cfg
    const res = resident(4, 10, 'x')
    expect(dayCareXp(res, (tick - 1) * MIN, data)).toBe(0)
    expect(dayCareXp(res, tick * MIN, data)).toBe(per)
    expect(dayCareXp(res, 3 * tick * MIN + MIN, data)).toBe(3 * per)
    // Past the old 200 XP stay cap, it keeps going.
    expect(dayCareXp(res, 1000 * tick * MIN, data)).toBe(1000 * per)
    expect(residentNow(res, 1000 * tick * MIN, data).level).toBeGreaterThan(residentNow(res, 200 * tick * MIN, data).level)
    expect(nextDayCareTick(res, Math.floor(1.5 * tick) * MIN, data)).toBe(Math.ceil(0.5 * tick) * MIN)
  })

  it('stops at Lv.100, where nothing ticks any more', () => {
    const forever = 10 ** 9 * MIN
    const res = resident(4, 90, 'x')
    expect(residentNow(res, forever, data).level).toBe(data.config.maxLevel)
    expect(nextDayCareTick(res, forever, data)).toBeNull()
    expect(nextDayCareTick(resident(4, 100, 'y'), 0, data)).toBeNull()
    expect(dayCareLevelProgress(res, forever, data)).toEqual({ level: 100, xp: 0, toNext: 0 })
  })

  it('shows the way to the next level', () => {
    const res = resident(4, 10, 'x')
    const p = dayCareLevelProgress(res, cfg.tickMinutes * MIN, data)
    expect(p).toEqual({ level: 10, xp: cfg.xpPerTick, toNext: xpToNext(10, data.config) })
  })

  it('levels up with Day Care XP but never evolves; it evolves on its next XP in battle', () => {
    // Charmander evolves at 16: a long stay from Lv.14 takes it well past that.
    const res = resident(4, 14, 'x')
    const later = 2000 * cfg.tickMinutes * MIN
    const now = residentNow(res, later, data)
    expect(now.level).toBeGreaterThan(16)
    expect(now.dex).toBe(4)

    const s = { ...withMons([14, 20]), dayCare: care({ residents: [res] }) }
    const back = withdrawPokemon(s, 'x', data, later)!
    expect(back.inst.dex).toBe(4)
    expect(back.xpGained).toBe(dayCareXp(res, later, data))
    expect(back.levelsGained).toBe(now.level - 14)
    expect(dayCareOf(back.save).residents).toHaveLength(0)
    expect(back.save.box.some((p) => p.id === 'x')).toBe(true)
    expect(back).toMatchObject({ region: 'kanto', live: true })
  })
})

describe('One Day Care for every region', () => {
  const kanto = () => {
    const s = withMons([10, 12, 14])
    return depositPokemon(s, s.box[1]!.id, data, 0)!
  }
  const inJohto = (s: SaveData) => startRegion(s, johto, newRegionBlock(johto, 152, data, 0, newId, createInstance))

  it('left in Kanto, it is still there after the move to Johto, and back', () => {
    const left = kanto()
    const j = inJohto(left)
    expect(dayCareOf(j)).toBe(dayCareOf(left))
    expect(j.parked?.kanto && 'dayCare' in j.parked.kanto).toBe(false)
    expect(dayCareOf(switchRegion(j, 'kanto'))).toBe(dayCareOf(left))
  })

  it('taken back in Johto, it goes to the Kanto Box', () => {
    const left = kanto()
    const id = dayCareOf(left).residents[0]!.inst.id
    const back = withdrawPokemon(inJohto(left), id, data, 0)!
    expect(back).toMatchObject({ region: 'kanto', live: false, joinedTeam: false })
    expect(back.save.box.some((p) => p.id === id)).toBe(false)
    expect(back.save.team).not.toContain(id)
    expect(back.save.parked!.kanto!.box.some((p) => p.id === id)).toBe(true)
  })

  it('counts a resident as owned only in its own region', () => {
    const left = kanto()
    const id = dayCareOf(left).residents[0]!.inst.id
    expect(ownedPokemon(left).some((p) => p.id === id)).toBe(true)
    expect(ownedPokemon(inJohto(left)).some((p) => p.id === id)).toBe(false)
  })
})

describe('Too many residents (the Day Cares became one)', () => {
  it('keeps the ones that have stayed longest and sends the others home with their levels', () => {
    const s = withMons([10, 12])
    const j = startRegion(s, johto, newRegionBlock(johto, 152, data, 0, newId, createInstance))
    const now = 600 * cfg.tickMinutes * MIN
    const rs = [resident(19, 5, 'old-k', 0), resident(16, 5, 'new-k', 50 * MIN), resident(161, 5, 'old-j', 10 * MIN, 'johto')]
    const full = { ...j, region: 'johto', dayCare: care({ residents: [...rs, resident(163, 5, 'new-j', 90 * MIN, 'johto')] }) }
    const fitted = fitDayCare(full, data, now)
    expect(dayCareOf(fitted).residents.map((r) => r.inst.id)).toEqual(['old-k', 'old-j'])
    const home = fitted.parked!.kanto!.box.find((p) => p.id === 'new-k')!
    expect(home.level).toBe(residentNow(rs[1]!, now, data).level)
    expect(home.level).toBeGreaterThan(5)
    expect(fitted.box.some((p) => p.id === 'new-j')).toBe(true)
    expect(fitted.team).not.toContain('new-j')
    expect(fitted.dayCareNotice).toEqual({ dex: [16, 163] })
    expect(fitDayCare(fitted, data, now)).toBe(fitted)
  })
})

describe("Friends' Pokémon", () => {
  const s = () => withMons([10, 12])

  it('invites up to friendSlots, never the same Pokémon twice', () => {
    let save = s()
    for (let i = 0; i < cfg.friendSlots; i++) {
      const r = inviteGuest(save, guest(133, `g${i}`), data)
      if (!('save' in r)) throw new Error('refused')
      save = r.save
    }
    expect(inviteGuest(save, guest(133, 'g9'), data)).toEqual({ refused: 'full' })
    const one = inviteGuest(s(), guest(133, 'g0'), data)
    if (!('save' in one)) throw new Error('refused')
    expect(inviteGuest(one.save, guest(133, 'g0'), data)).toEqual({ refused: 'here' })
    // The same instance id from another friend is another Pokémon.
    expect('save' in inviteGuest(one.save, guest(133, 'g0', 'noor'), data)).toBe(true)
    expect(dayCareOf(removeGuest(one.save, 'lea', 'g0')).guests).toEqual([])
  })

  it('refreshing drops the ones no longer there and brings levels up to date', () => {
    const save = { ...s(), dayCare: care({ guests: [guest(133, 'a', 'lea', 30), guest(135, 'b', 'lea', 40), guest(132, 'c', 'noor')] }) }
    const now = 400 * cfg.tickMinutes * MIN
    const live = [{ owner: 'lea', mons: [{ inst: 'a', dex: 133, level: 30, xp: 0, since: 0 }] }]
    const { save: next, left } = refreshGuests(save, live, now, data)
    expect(left.map((g) => g.inst)).toEqual(['b', 'c'])
    const a = dayCareOf(next).guests
    expect(a).toHaveLength(1)
    expect(a[0]!.level).toBe(residentNow(resident(133, 30, 'a'), now, data).level)
    expect(a[0]!.level).toBeGreaterThan(30)
    const again = refreshGuests(next, live, now, data)
    expect(again.save).toBe(next)
  })
})

describe('Hatching', () => {
  it('needs an Egg, and clears it', () => {
    const s = withMons([30, 30, 30])
    expect(hatchEgg(s, data, createRng(1), 0, newId)).toBeNull()
    const h = hatchEgg(withEgg(s), data, createRng(1), 0, newId)!
    expect(dayCareOf(h.save).egg).toBeUndefined()
    expect(hatchEgg(h.save, data, createRng(1), 0, newId)).toBeNull()
  })

  it('hatches only first forms of evolving lines, never starters, favouring species not owned', () => {
    const pool = eggSpecies(data).map((s) => s.dex)
    expect(pool).toContain(16) // Pidgey
    expect(pool).not.toContain(17) // Pidgeotto: evolved form
    expect(pool).not.toContain(128) // Tauros: never evolves
    expect(pool).not.toContain(4) // starter
    expect(pool).not.toContain(150) // legendary

    const s = withMons([10, 10, 10])
    const odds = eggOdds({ ...s, pokedex: [16] }, data)
    expect(odds.find((o) => o.species.dex === 16)!.weight).toBe(1)
    expect(odds.find((o) => o.species.dex === 19)!.weight).toBe(cfg.unownedWeight)
  })

  it("hatches only the live region's own generation, wherever the parents came from", () => {
    const kanto = eggSpecies(data, 'kanto').map((s) => s.dex)
    const johtoPool = eggSpecies(data, 'johto').map((s) => s.dex)
    expect(kanto.every((d) => d <= 151)).toBe(true)
    expect(johtoPool.every((d) => d >= 152 && d <= 251)).toBe(true)
    expect(eggSpecies(data, 'hoenn').every((s) => s.dex >= 252 && s.dex <= 386)).toBe(true)
    expect(eggSpecies(data, 'sinnoh').every((s) => s.dex >= 387 && s.dex <= 493)).toBe(true)
    expect(eggSpecies(data, 'unova').every((s) => s.dex >= 494 && s.dex <= 649)).toBe(true)
    expect(eggSpecies(data, 'kalos').every((s) => s.dex >= 650 && s.dex <= 721)).toBe(true)
    expect(eggSpecies(data, 'alola').every((s) => (s.dex >= 722 && s.dex <= 809) || s.form?.region === 'alola')).toBe(true)
    expect(eggSpecies(data, 'galar').every((s) => (s.dex >= 810 && s.dex <= 905) || s.form?.region === 'galar')).toBe(true)
    expect(eggSpecies(data, 'paldea').every((s) => (s.dex >= 906 && s.dex <= 1025) || s.form?.region === 'paldea')).toBe(true)

    // Johto parents, a Kanto save: Kanto Eggs.
    const s = withEgg({ ...withMons([30, 30, 30]), dayCare: care({ residents: [resident(161, 20, 'j', 0, 'johto')] }) })
    const rng = createRng(11)
    for (let i = 0; i < 100; i++) expect(hatchEgg(s, data, rng, 0, newId)!.inst.dex).toBeLessThanOrEqual(151)
    // The same player in Johto hatches Johto Eggs.
    const inJohto = { ...s, region: 'johto' as const }
    const johtoRng = createRng(11)
    for (let i = 0; i < 100; i++) {
      const dex = hatchEgg(inJohto, data, johtoRng, 0, newId)!.inst.dex
      expect(dex).toBeGreaterThanOrEqual(152)
      expect(dex).toBeLessThanOrEqual(251)
    }
  })

  it('hatches at the 3rd-lowest owned level minus 5, never below 5', () => {
    expect(hatchLevel(withMons([40, 30, 25, 10]), data)).toBe(25)
    expect(hatchLevel(withMons([8, 7, 6]), data)).toBe(5)
    expect(hatchLevel(withMons([30, 20]), data)).toBe(25) // fewer than 3: the highest one
  })

  it('keeps only the highest-level plain copy; one it does not keep brings notKeptGold', () => {
    const s = withEgg(withMons([30, 30, 30]))
    const dex = hatchEgg(s, data, shinyRng(1, false), 0, newId)!.inst.dex
    const weak = createInstance(dex, 10, data, 'weak', 0)
    const strong = createInstance(dex, 40, data, 'strong', 0)

    const fresh = hatchEgg(s, data, shinyRng(1, false), 0, newId)!
    expect(fresh).toMatchObject({ kept: true, isNew: true, gold: 0, shiny: false })
    expect(fresh.save.gold).toBe(s.gold)

    const replaced = hatchEgg({ ...s, box: [...s.box, weak] }, data, shinyRng(1, false), 0, newId)!
    expect(replaced).toMatchObject({ kept: true, gold: 0 })
    expect(replaced.replaced?.id).toBe('weak')
    expect(replaced.save.box.filter((p) => p.dex === dex).map((p) => p.level)).toEqual([25])

    const inTeam = { ...s, box: [...s.box, weak], team: [s.team[0]!, s.team[1]!, 'weak'] }
    const slot = hatchEgg(inTeam, data, shinyRng(1, false), 0, newId)!
    expect(slot.joinedTeam).toBe(true)
    expect(slot.save.team).toEqual([s.team[0], s.team[1], slot.inst.id])

    const dropped = hatchEgg({ ...s, box: [...s.box, strong] }, data, shinyRng(1, false), 0, newId)!
    expect(dropped).toMatchObject({ kept: false, gold: cfg.notKeptGold })
    expect(dropped.save.gold).toBe(s.gold + cfg.notKeptGold)
    expect(dropped.save.box.filter((p) => p.dex === dex).map((p) => p.id)).toEqual(['strong'])
  })

  it('hatches shiny when the roll hits; a shiny is always kept and never brings money', () => {
    const s = withEgg(withMons([30, 30, 30]))
    const dex = hatchEgg(s, data, shinyRng(1, false), 0, newId)!.inst.dex
    const strong = createInstance(dex, 40, data, 'strong', 0)
    const h = hatchEgg({ ...s, box: [...s.box, strong] }, data, shinyRng(1, true), 0, newId)!
    expect(h).toMatchObject({ shiny: true, kept: true, gold: 0 })
    expect(h.inst.shiny).toBe(true)
    expect(h.replaced).toBeUndefined()
    expect(h.save.box.find((p) => p.id === 'strong')).toBeDefined()
    expect(h.save.gold).toBe(s.gold)
  })

  it('never lets a plain hatchling replace a shiny copy', () => {
    const s = withEgg(withMons([30, 30, 30]))
    const dex = hatchEgg(s, data, shinyRng(1, false), 0, newId)!.inst.dex
    const shiny = { ...createInstance(dex, 40, data, 'shiny', 0), shiny: true }
    const hatched = hatchEgg({ ...s, box: [...s.box, shiny] }, data, shinyRng(1, false), 0, newId)!
    expect(hatched.kept).toBe(true)
    expect(hatched.replaced).toBeUndefined()
    expect(hatched.save.box.find((p) => p.id === 'shiny')!.shiny).toBe(true)
  })

  it('the gift Egg sets eggClaimed when it hatches; a bred one does not', () => {
    const s = withMons([30, 30, 30])
    const open = { ...s, dayCare: care({ eggClaimed: false, egg: { at: 0, gift: true } }) }
    const gift = hatchEgg(open, data, createRng(1), 0, newId)!
    expect(gift.gift).toBe(true)
    expect(dayCareOf(gift.save).eggClaimed).toBe(true)
    const bred = hatchEgg({ ...s, dayCare: care({ eggClaimed: false, egg: { at: 0 } }) }, data, createRng(1), 0, newId)!
    expect(bred.gift).toBe(false)
    expect(dayCareOf(bred.save).eggClaimed).toBe(false)
  })
})

describe('Day Care in the save file', () => {
  it('keeps residents through a save round-trip, and never lets one also sit in the Box', () => {
    const s = withMons([10, 12])
    const left = depositPokemon(s, s.box[1]!.id, data, 5)!
    const back = parseSave(JSON.parse(JSON.stringify(left)))
    expect(back.ok && back.save.dayCare?.residents.map((r) => r.inst.id)).toEqual([s.box[1]!.id])

    const clash = { ...left, box: [...left.box, left.dayCare!.residents[0]!.inst] }
    const fixed = parseSave(JSON.parse(JSON.stringify(clash)))
    expect(fixed.ok && fixed.save.dayCare?.residents).toEqual([])
  })

  /** A save from before the one Day Care: Johto live with two residents, Kanto parked with two of its own. */
  const legacy = () => {
    const s = withMons([10, 12])
    const j = startRegion(s, johto, newRegionBlock(johto, 152, data, 0, newId, createInstance))
    const untagged = (r: DayCareResident) => ({ inst: r.inst, since: r.since })
    return JSON.parse(
      JSON.stringify({
        ...j,
        dayCare: { residents: [resident(161, 8, 'j1', 30 * MIN), resident(163, 8, 'j2', 90 * MIN)].map(untagged), eggClaimed: false },
        parked: {
          kanto: {
            ...j.parked!.kanto!,
            dayCare: { residents: [resident(16, 8, 'k1', 0), resident(19, 8, 'k2', 60 * MIN)].map(untagged), eggClaimed: true, visited: true },
          },
        },
      }),
    )
  }

  it('merges every region’s Day Care into one, each resident tagged with its region', () => {
    const r = parseSave(legacy())
    if (!r.ok) throw new Error(r.error)
    const dc = r.save.dayCare!
    expect(dc.residents.map((x) => [x.inst.id, x.region])).toEqual([
      ['j1', 'johto'],
      ['j2', 'johto'],
      ['k1', 'kanto'],
      ['k2', 'kanto'],
    ])
    expect(dc).toMatchObject({ guests: [], eggClaimed: true, visited: true })
    expect(dc.breedAt).toBeUndefined()
    expect('dayCare' in r.save.parked!.kanto!).toBe(false)
  })

  it('then keeps the two oldest and sends the other two home with their levels, with a notice', () => {
    const r = parseSave(legacy())
    if (!r.ok) throw new Error(r.error)
    const now = 500 * cfg.tickMinutes * MIN
    const fitted = fitDayCare(r.save, data, now)
    expect(dayCareOf(fitted).residents.map((x) => x.inst.id)).toEqual(['j1', 'k1'])
    expect(fitted.parked!.kanto!.box.find((p) => p.id === 'k2')!.level).toBeGreaterThan(8)
    expect(fitted.box.find((p) => p.id === 'j2')!.level).toBeGreaterThan(8)
    expect(fitted.dayCareNotice).toEqual({ dex: [19, 163] })
  })

  it('is idempotent: parsing twice gives the same save', () => {
    const once = parseSave(legacy())
    if (!once.ok) throw new Error(once.error)
    const twice = parseSave(JSON.parse(JSON.stringify(once.save)))
    expect(twice.ok && twice.save).toEqual(once.save)
  })

  it('keeps guests, the clocks and the Egg', () => {
    const s = {
      ...withMons([10, 12]),
      dayCare: care({ guests: [guest(132, 'g')], breedAt: 5, dittoAt: 7, egg: { at: 9, parents: [{ dex: 133 }, { dex: 132, owner: 'Noor' }] } }),
    }
    const r = parseSave(JSON.parse(JSON.stringify(s)))
    expect(r.ok && r.save.dayCare).toEqual(s.dayCare)
  })
})

describe('leaderboardTutorialDue', () => {
  const fresh = newSave(4, data, 1000, newId)
  /** Beat the first gym leader the badge case knows about. */
  const withBadge = (save: typeof fresh) => {
    const first = badgeCase(save, data)[0]!
    const p = save.areaProgress[first.areaId] ?? {
      roundsDone: 0,
      cleared: false,
      bossDefeated: false,
      bossesDefeated: [],
      gymsDefeated: [],
    }
    return { ...save, areaProgress: { ...save.areaProgress, [first.areaId]: { ...p, gymsDefeated: [first.trainerId] } } }
  }

  it('waits for the first badge', () => {
    // A brand new game has nothing to put on a board yet.
    expect(leaderboardTutorialDue(fresh, data)).toBe(false)
    expect(leaderboardTutorialDue(withBadge(fresh), data)).toBe(true)
  })

  it('still only fires once', () => {
    expect(leaderboardTutorialDue({ ...withBadge(fresh), leaderboardVisited: true }, data)).toBe(false)
  })

  it('the board itself opens with the first badge, in any region played', () => {
    expect(leaderboardUnlocked(fresh, data)).toBe(false)
    expect(leaderboardUnlocked(withBadge(fresh), data)).toBe(true)
    // Moved on to Johto with no badge there yet: Kanto's badge still counts.
    const kanto = withBadge(fresh)
    const moved = { ...fresh, region: 'johto', areaProgress: {}, parked: { kanto } } as unknown as SaveData
    expect(leaderboardUnlocked(moved, data)).toBe(true)
  })
})

