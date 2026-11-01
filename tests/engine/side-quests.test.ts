// The side quests (docs/61): Snowpoint Temple's three Regis, the roadblock bosses, the Pokémon posing as items, the
// Safari areas and the set moments.
import { describe, expect, it } from 'vitest'
import {
  canSkip,
  compileGameData,
  createRng,
  conditionStatus,
  dueBoss,
  emptyProgress,
  feedTreat,
  isAreaUnlocked,
  isSafariArea,
  lureCfg,
  lootPoolFor,
  newSave,
  nextEncounter,
  pokedexEverywhere,
  roadblockOf,
  safariRoundPrice,
  safariTier,
  startSafariRound,
  startTrick,
  tierFromCatchValue,
  trickBestPlay,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { conditionLabel } from '@/i18n/text'

const data = compileGameData(BUNDLE)
let n = 0
const id = () => `id-${++n}`
const fresh = (): SaveData => newSave(1, data, 0, id)

describe('Regigigas: the three Regis (docs/61 §1)', () => {
  const TEMPLE = '10a7f721-2f52-58c4-bba1-728e2f88d763'
  const temple = data.areas.find((a) => a.id === TEMPLE)!
  const regis = { kind: 'caught' as const, dex: [377, 378, 379] }
  /** A Sinnoh save that meets the Temple's other conditions, its Hoenn Pokédex parked with these species. */
  const sinnoh = (hoennDex: number[], entered = false): SaveData => {
    const s = fresh()
    const other = (temple.unlockConditions ?? []).find((c) => c.kind === 'area')
    const areaProgress: SaveData['areaProgress'] = {}
    if (other?.kind === 'area') areaProgress[other.areaId] = { ...emptyProgress(), cleared: true }
    if (entered) areaProgress[TEMPLE] = emptyProgress()
    return {
      ...s,
      region: 'sinnoh',
      pokedex: Array.from({ length: 140 }, (_, i) => 387 + (i % 107)).concat(Array.from({ length: 40 }, (_, i) => i + 1)),
      box: s.box.map((p) => ({ ...p, level: 70 })),
      areaProgress,
      parked: { hoenn: { pokedex: hoennDex } as never },
    }
  }

  it('waits for the three Regis in the shipped content', () => {
    expect(temple.unlockConditions).toContainEqual(regis)
  })

  it('counts the species caught in every region, parked ones included', () => {
    const s = sinnoh([377, 378])
    expect(pokedexEverywhere(s).has(377)).toBe(true)
    const st = conditionStatus(regis, s, data)
    expect(st).toMatchObject({ current: 2, target: 3, met: false })
    expect(conditionStatus(regis, sinnoh([377, 378, 379]), data).met).toBe(true)
  })

  it('opens the Temple only once all three are caught', () => {
    const base = sinnoh([377, 378])
    // The Temple's other conditions are met here except what the save can't fake (an area reached): check the Regis'
    // part alone through a copy of the Temple that only has it.
    const only = { ...data, areas: data.areas.map((a) => (a.id === TEMPLE ? { ...a, unlockConditions: [regis] } : a)) }
    expect(isAreaUnlocked(base, TEMPLE, only)).toBe(false)
    expect(isAreaUnlocked(sinnoh([377, 378, 379]), TEMPLE, only)).toBe(true)
  })

  it('keeps the Temple open to a player who has already been in', () => {
    const only = { ...data, areas: data.areas.map((a) => (a.id === TEMPLE ? { ...a, unlockConditions: [regis] } : a)) }
    expect(isAreaUnlocked(sinnoh([], true), TEMPLE, only)).toBe(true)
    // Only the species condition is waived: the others still hold.
    const lvl = { ...data, areas: data.areas.map((a) => (a.id === TEMPLE ? { ...a, unlockConditions: [regis, { kind: 'maxLevel' as const, level: 99 }] } : a)) }
    expect(isAreaUnlocked(sinnoh([], true), TEMPLE, lvl)).toBe(false)
  })

  it('names the species in the label', () => {
    expect(conditionLabel(regis, data)).toBe('Catch Regirock, Regice, Registeel')
  })
})

describe('Roadblocks (docs/61 §2)', () => {
  const at = (name: string, region: string) => data.areas.find((a) => a.name === name && (a.regionId ?? 'kanto') === region)!
  const cases = [
    { area: at('Routes 12–15', 'kanto'), dex: 143, level: 30, kind: 'sleeping' },
    { area: at('Routes 35–37', 'johto'), dex: 185, level: 20, kind: 'tree' },
    { area: at('Fortree City & Routes 120–121', 'hoenn'), dex: 352, level: 30, kind: 'invisible' },
    { area: at('Route 7 & the Connecting Cave', 'kalos'), dex: 143, level: 15, kind: 'sleeping' },
  ] as const

  it.each(cases)('$area.name has its roadblock as its boss, out of its wild pool', ({ area, dex, level, kind }) => {
    expect(area.legendaryBoss).toContainEqual({ dex, level, roadblock: kind })
    expect(roadblockOf(area, dex)).toBe(kind)
    expect(area.wildPool.some((w) => w.dex === dex)).toBe(false)
  })

  it('is still met in the wild somewhere else in its region', () => {
    for (const { area, dex } of cases) {
      const region = area.regionId ?? 'kanto'
      const elsewhere = data.areas.filter((a) => (a.regionId ?? 'kanto') === region && a.wildPool.some((w) => w.dex === dex))
      expect(elsewhere.length, area.name).toBeGreaterThan(0)
    }
  })

  it('waits once every round is done, in an area already cleared too, and is no legendary', () => {
    const { area } = cases[0]
    const done = { ...emptyProgress(), roundsDone: area.roundsToClear ?? 1, cleared: true }
    expect(dueBoss(area, done, 30, data)?.dex).toBe(143)
    expect(dueBoss(area, { ...done, bossesDefeated: [143] }, 30, data)).toBeNull()
    expect(roadblockOf(data.areas.find((a) => a.name === 'Seafoam Islands'), 144)).toBeNull()
  })
})

describe('Pokémon posing as items (docs/61 §3)', () => {
  const withSwitch = (access: 'off' | 'all') => ({ ...data, config: { ...data.config, disguises: { access } } })
  const plant = data.areas.find((a) => a.name === 'Power Plant' && (a.regionId ?? 'kanto') === 'kanto')!
  /** Only the plant's disguises in its loot, so every find is one. */
  const onlyDisguises = { ...plant, lootPool: plant.lootPool.filter((l) => l.disguise) }
  const find = (d: typeof data, area = onlyDisguises, seed = 1) =>
    nextEncounter(
      { area, progress: { ...emptyProgress(), deck: ['item'] }, data: d, teamAvgLevel: 30, teamHurt: false, isFirstInArea: false, pokedex: [] },
      createRng(seed),
    )

  it('places Voltorb, Electrode, Foongus and Amoonguss where the games did', () => {
    const rows = data.areas.flatMap((a) => a.lootPool.filter((l) => l.disguise).map((l) => ({ a, l })))
    expect(new Set(rows.map((r) => r.l.disguise!.dex))).toEqual(new Set([100, 101, 590, 591]))
    for (const { a, l } of rows) {
      expect(l.itemKey).toBe('poke-ball')
      expect(l.unique).toBe(false)
      const wild = a.wildPool.find((w) => w.dex === l.disguise!.dex)
      if (wild) expect([l.disguise!.minLevel, l.disguise!.maxLevel], a.name).toEqual([wild.minLevel, wild.maxLevel])
    }
  })

  it('springs out as a wild Pokémon that keeps the look of its find', () => {
    for (let seed = 1; seed < 20; seed++) {
      const enc = find(withSwitch('all'), onlyDisguises, seed).encounter
      expect(enc.kind).toBe('wild')
      if (enc.kind !== 'wild') continue
      expect([100, 101]).toContain(enc.dex)
      expect(enc.disguisedAs).toBe('poke-ball')
      expect(enc.isNew).toBe(true)
      expect(canSkip(enc, 'free', 0)).toBe(false)
    }
  })

  it('is never dealt while switched off, nor picked up by Pickup', () => {
    const off = withSwitch('off')
    expect(lootPoolFor(plant, emptyProgress(), off).some((l) => l.disguise)).toBe(false)
    expect(lootPoolFor(plant, emptyProgress(), withSwitch('all')).some((l) => l.disguise)).toBe(true)
    for (let seed = 1; seed < 20; seed++) expect(find(off, plant, seed).encounter.kind).toBe('item')
  })
})

describe('Safari Zones (docs/61 §4)', () => {
  const withSafari = (access: 'off' | 'all') => ({ ...data, config: { ...data.config, safari: { ...data.config.safari, access } } })
  const on = withSafari('all')
  const kanto = data.areas.find((a) => a.name === 'Safari Zone' && (a.regionId ?? 'kanto') === 'kanto')!
  const ctx = (d: typeof data, area = kanto, deck: ('wild' | 'item' | 'center')[] = ['wild']) => ({
    area,
    progress: { ...emptyProgress(), deck },
    data: d,
    teamAvgLevel: 30,
    teamHurt: true,
    isFirstInArea: true,
    pokedex: [] as number[],
  })

  it('is a secret area of its own in every region that has one, Kanto split from Fuchsia City', () => {
    const safaris = data.areas.filter((a) => isSafariArea(a))
    expect(safaris.map((a) => `${a.regionId}:${a.name}`).sort()).toEqual([
      'hoenn:Safari Zone',
      'kalos:The Friend Safari',
      'kanto:Safari Zone',
      'sinnoh:The Great Marsh',
    ])
    for (const a of safaris) {
      expect(a.hidden, a.name).toBe(true)
      expect(a.roundsToClear, a.name).toBeNull()
      expect(a.encounterWeights.center, a.name).toBe(0)
      expect(a.encounterWeights.trainer, a.name).toBe(0)
      expect(a.gyms, a.name).toEqual([])
      expect(a.unlockConditions?.[0]?.kind, a.name).toBe('area')
    }
    const fuchsia = data.areas.find((a) => a.id === '2238f26a-2629-5f28-af07-e74cb41d5f7a')!
    expect(fuchsia.name).toBe('Fuchsia City')
    expect(fuchsia.hidden).toBe(false)
    expect(fuchsia.wildPool).toEqual([])
    expect(fuchsia.gyms).toHaveLength(1)
    expect(fuchsia.encounterWeights.trainer).toBeGreaterThan(0)
  })

  it('deals Safari encounters from its wild cards while on, wild fights while off', () => {
    for (let seed = 1; seed < 15; seed++) {
      const enc = nextEncounter(ctx(on, kanto, ['wild']), createRng(seed)).encounter
      expect(enc.kind).toBe('safari')
      if (enc.kind !== 'safari') continue
      expect(kanto.wildPool.some((w) => w.dex === enc.dex)).toBe(true)
      expect(enc.tier).toBe(safariTier(on, kanto.id, enc.dex))
      expect(nextEncounter(ctx(withSafari('off'), kanto, ['wild']), createRng(seed)).encounter.kind).not.toBe('safari')
    }
  })

  it('deals no Pokémon Center while on, even for a hurt team entering', () => {
    // A new round (no deck) would open with a Center anywhere else.
    const roll = nextEncounter({ ...ctx(on), progress: emptyProgress() }, createRng(4))
    expect(roll.encounter.kind).not.toBe('center')
  })

  it('takes a tier from its catch value unless the admin set one', () => {
    expect(tierFromCatchValue(2)).toBe('common')
    expect(tierFromCatchValue(5)).toBe('rare')
    expect(tierFromCatchValue(6)).toBe('veryRare')
    expect(safariTier(on, kanto.id, 113)).toBe('veryRare') // Chansey
    expect(safariTier(on, kanto.id, 128)).toBe('rare') // Tauros
    const set = { ...on, config: { ...on.config, safari: { ...on.config.safari, areas: { [kanto.id]: [{ dex: 113, tier: 'common' as const }] } } } }
    expect(safariTier(set, kanto.id, 113)).toBe('common')
  })

  it('charges a round as it is dealt: the first free, then ₽100', () => {
    let s: SaveData = { ...fresh(), gold: 150 }
    expect(safariRoundPrice(on, kanto, emptyProgress())).toBe(0)
    s = startSafariRound(s, on, kanto)!
    expect(s.gold).toBe(150)
    expect(s.areaProgress[kanto.id]!.safariRounds).toBe(1)
    expect(safariRoundPrice(on, kanto, s.areaProgress[kanto.id]!)).toBe(100)
    // Mid-round: nothing to pay.
    expect(safariRoundPrice(on, kanto, { ...s.areaProgress[kanto.id]!, deck: ['wild'] })).toBe(0)
    s = startSafariRound(s, on, kanto)!
    expect(s.gold).toBe(50)
    expect(startSafariRound(s, on, kanto)).toBeNull()
    // Switched off: no price, nothing counted.
    expect(safariRoundPrice(withSafari('off'), kanto, s.areaProgress[kanto.id]!)).toBe(0)
  })

  it('plays Trick or Treat’s gauge with its own numbers and look', () => {
    const st = startTrick({ dex: 113, level: 25, tier: 'veryRare' }, lureCfg(on, 'safari'), createRng(2), 'safari')
    expect(st.theme).toBe('safari')
    expect(feedTreat(st, lureCfg(on, 'safari'), createRng(3))?.state.theme).toBe('safari')
    expect(trickBestPlay(lureCfg(on, 'safari'), 'common').best).toBeGreaterThan(0.6)
  })
})
