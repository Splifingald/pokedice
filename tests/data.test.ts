// Phase 1 acceptance: the generated bundle obeys 02-DATA-MODEL.md.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pokemon from '@/data/pokemon.json'
import typeChart from '@/data/type-chart.json'
import diceTypes from '@/data/dice-types.json'
import areas from '@/data/areas.json'
import trainers from '@/data/trainers.json'
import upgrades from '@/data/upgrades.json'
import { BUNDLE } from '@/config/bundle'
import { compileGameData, effectiveStats } from '@/engine'
import type { Area, DiceEntry, Species, Trainer } from '@/engine/types'
import { composeDice, diceCountFromBst, hpAtLevel, stableUuid } from '../scripts/seed'

const species = pokemon as Species[]
const byDex = (dex: number) => species.find((p) => p.dex === dex)!
const count = (dice: DiceEntry[], type: string) => dice.filter((d) => d.type === type).reduce((s, d) => s + d.count, 0)
const total = (dice: DiceEntry[]) => dice.reduce((s, d) => s + d.count, 0)
const LEGENDARIES = [144, 145, 146, 150, 151]
/** Every region's legendaries and mythicals. */
const ALL_LEGENDARIES = [
  144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
]
const STARTERS = [1, 4, 7]

describe('pokemon.json', () => {
  it('has 386 complete entries — Kanto, Johto and Hoenn', () => {
    expect(species).toHaveLength(386)
    for (const p of species) {
      expect(total(p.dice)).toBeGreaterThanOrEqual(1)
      expect(total(p.dice)).toBeLessThanOrEqual(5)
      expect(p.spriteUrl).toBe(`/pokemon/${String(p.dex).padStart(3, '0')}_front.png`)
      for (const view of ['front', 'front_shiny', 'back', 'back_shiny', 'mini_1', 'mini_2'])
        expect(existsSync(path.join('public/pokemon', `${String(p.dex).padStart(3, '0')}_${view}.png`)), `${p.dex} ${view}`).toBe(true)
      expect(p.baseHp).toBeGreaterThan(0)
      expect(p.maxHp).toBeGreaterThan(p.baseHp)
      expect(Array.isArray(p.milestones)).toBe(true)
      expect(p.rerolls).toBeGreaterThanOrEqual(1) // tuned per species in admin
    }
  })

  // Dice and milestones are tuned per species in admin (Supabase is the source), so only their bounds are checked here;
  // the seed's schedule itself is covered by tests/dice-schedule.test.ts.
  it('keeps every species within the dice rules at every level', () => {
    const d = compileGameData(BUNDLE)
    for (const p of species) {
      expect(effectiveStats(d.species[p.dex]!, 100, d).dice.length, p.name).toBeLessThanOrEqual(5)
    }
    expect(count(byDex(149).dice, 'dragon')).toBeGreaterThan(0)
  })
  it('computes HP curves and evolutions from PokeAPI', () => {
    expect(byDex(6).baseHp).toBe(12)
    expect(byDex(6).maxHp).toBe(297)
    expect(byDex(4).evolutions).toEqual([{ toDex: 5, level: 16 }])
    expect(byDex(133).evolutions.map((e) => e.toDex).sort((a, b) => a - b)).toEqual([134, 135, 136, 196, 197])
    // v1.10: Eevee's forms come from the stones (Water, Thunder, Fire) — and, with Johto, Espeon and Umbreon, which
    // evolve on happiness by day and by night in the originals and on the Sun and Moon Stone here (no day/night cycle).
    expect(byDex(133).evolutions.map((e) => e.item).sort()).toEqual([
      'fire-stone',
      'moon-stone',
      'sun-stone',
      'thunder-stone',
      'water-stone',
    ])
    expect(byDex(64).evolutions).toEqual([{ toDex: 65, level: 34 }]) // trade
  })
})

describe('seed rules', () => {
  it('hp formula', () => {
    expect(hpAtLevel(78, 1)).toBe(12)
    expect(hpAtLevel(78, 100)).toBe(297)
    expect(hpAtLevel(250, 100)).toBe(641)
  })
  it('dice count thresholds', () => {
    expect(diceCountFromBst(314)).toBe(2)
    expect(diceCountFromBst(405)).toBe(3)
    expect(diceCountFromBst(534)).toBe(5)
    expect(diceCountFromBst(680)).toBe(6)
  })
  it('composition table', () => {
    expect(composeDice(6, 'dragon', 'flying')).toEqual([
      { type: 'dragon', count: 3 },
      { type: 'flying', count: 1 },
      { type: 'base', count: 2 },
    ])
    expect(composeDice(2, 'grass', 'poison')).toEqual([
      { type: 'grass', count: 1 },
      { type: 'base', count: 1 },
    ])
  })
  it('stable uuids', () => {
    expect(stableUuid('x')).toBe(stableUuid('x'))
    expect(stableUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('type-chart.json', () => {
  const mult = (a: string, d: string) =>
    typeChart.find((r) => r.attacking === a && r.defending === d)?.multiplier ?? 1
  it('round-trips the key matchups', () => {
    expect(mult('water', 'fire')).toBe(2)
    expect(mult('normal', 'ghost')).toBe(0)
    expect(mult('fighting', 'ghost')).toBe(0)
    expect(mult('dragon', 'fairy')).toBe(0)
    expect(mult('electric', 'ground')).toBe(0)
    expect(mult('fire', 'grass')).toBe(2)
    expect(mult('normal', 'normal')).toBe(1)
  })
  it('stores only non-1 entries', () => {
    expect(typeChart.every((r) => r.multiplier !== 1)).toBe(true)
  })
})

describe('areas & trainers', () => {
  const everyArea = areas as Area[]
  const allTrainers = trainers as Trainer[]
  const allAreas = everyArea.filter((a) => (a.regionId ?? 'kanto') === 'kanto')

  it('has 28 Kanto areas with valid dex references', () => {
    expect(allAreas).toHaveLength(28)
    for (const a of allAreas) for (const w of a.wildPool) expect(w.dex).toBeGreaterThanOrEqual(1)
    for (const a of allAreas) for (const w of a.wildPool) expect(w.dex).toBeLessThanOrEqual(151)
    for (const t of allTrainers) for (const m of t.team) expect(m.dex).toBeGreaterThanOrEqual(1)
  })

  it('keeps legendaries out of every wild pool, in every region', () => {
    const wild = new Set(everyArea.flatMap((a) => a.wildPool.filter((w) => w.weight > 0).map((w) => w.dex)))
    for (const l of ALL_LEGENDARIES) expect(wild.has(l), `#${l}`).toBe(false)
    // Each is attached to an area as a boss — except the three roamers, which have no area at all.
    const bosses = new Set(everyArea.flatMap((a) => a.legendaryBoss ?? []).map((b) => b.dex))
    const roamers = new Set(BUNDLE.config.roamers ? (BUNDLE.config.roamers as { dex: number[] }).dex : [])
    for (const l of ALL_LEGENDARIES) expect(bosses.has(l) || roamers.has(l), `#${l}`).toBe(true)
  })

  it('puts the starters in Victory Road only (rare), never in trainer teams — so 151/151 is reachable', () => {
    const vr = allAreas.find((a) => a.scalesToTeam)!
    for (const a of allAreas) {
      for (const s of STARTERS) {
        const entry = a.wildPool.find((w) => w.dex === s)
        if (a === vr) expect(entry?.weight).toBe(3)
        else expect(entry).toBeUndefined()
      }
    }
    for (const t of allTrainers) for (const m of t.team) expect(STARTERS).not.toContain(m.dex)
    // The Game Corner jackpot prize (Porygon) counts too.
    const catchable = new Set([...allAreas.flatMap((a) => a.wildPool.map((w) => w.dex)), ...LEGENDARIES, (BUNDLE.config.slotMachine as { prizeDex: number }).prizeDex])
    expect(catchable.size).toBe(151)
  })

  it('every trainer referenced exists and has 1–3 Pokémon', () => {
    const ids = new Set(allTrainers.map((t) => t.id))
    for (const a of everyArea) for (const p of a.trainerPool) expect(ids.has(p.trainerId)).toBe(true)
    for (const a of everyArea) for (const g of a.gyms) expect(ids.has(g), `${a.name}: ${g}`).toBe(true)
    for (const t of allTrainers) {
      expect(t.team.length).toBeGreaterThanOrEqual(1)
      expect(t.team.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('Kanto structure', () => {
  const allAreas = (areas as Area[]).filter((a) => (a.regionId ?? 'kanto') === 'kanto')
  const allTrainers = trainers as Trainer[]
  const tById = new Map(allTrainers.map((t) => [t.id, t]))
  const linear = allAreas.filter((a) => !a.hidden).sort((a, b) => a.orderIndex - b.orderIndex)
  const hidden = allAreas.filter((a) => a.hidden)

  it('has 24 linear areas in order, Route 1 → Indigo Plateau → the endgame lap, and 4 secret areas with conditions', () => {
    expect(linear.map((a) => a.orderIndex)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(linear[0]!.name).toBe('Route 1')
    expect(linear.slice(21).map((a) => a.name)).toEqual(['Indigo Plateau', 'Victory Road II', 'Indigo Plateau II'])
    expect(hidden.map((a) => a.name).sort()).toEqual(['Cerulean Cave', 'Faraway Island', 'Power Plant', 'Rocket Hideout'])
    for (const a of hidden) expect(a.unlockConditions?.length).toBeGreaterThan(0)
    expect(allAreas.find((a) => a.name === 'Faraway Island')!.unlockConditions).toEqual([{ kind: 'pokedex', count: 150 }])
    const celadon = allAreas.find((a) => a.name === 'Routes 7 & 8')!
    expect(allAreas.find((a) => a.name === 'Rocket Hideout')!.unlockConditions).toEqual([{ kind: 'area', areaId: celadon.id }])
  })

  it('has the 8 gym leaders with their badges, then the Elite Four and the Champion', () => {
    const leaders = linear.flatMap((a) => a.gyms.map((id) => tById.get(id)!)).filter((t) => t.role === 'leader')
    expect(leaders.map((t) => t.name)).toEqual(['Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Giovanni'])
    expect(leaders.map((t) => t.badge)).toEqual([
      'Boulder Badge',
      'Cascade Badge',
      'Thunder Badge',
      'Rainbow Badge',
      'Soul Badge',
      'Marsh Badge',
      'Volcano Badge',
      'Earth Badge',
    ])
    expect(leaders[0]!.team).toEqual([
      { dex: 74, level: 12 },
      { dex: 95, level: 14 },
    ])
    const indigo = linear[21]!.gyms.map((id) => tById.get(id)!)
    expect(indigo.map((t) => t.role)).toEqual(['elite', 'elite', 'elite', 'elite', 'champion'])
    for (const t of [...leaders, ...indigo]) expect(t.spriteUrl).toMatch(/^\/trainers\/classes\/(champion|elite|blue)-/)
  })

  it('ends with an Elite Four around Lv.70 and a rival Champion per starter, their counter starter at Lv.80', () => {
    const gyms = linear[23]!.gyms.map((id) => tById.get(id)!)
    expect(gyms.map((t) => t.role)).toEqual(['elite', 'elite', 'elite', 'elite', 'champion', 'champion', 'champion'])
    for (const t of gyms.slice(0, 4)) for (const m of t.team) expect(Math.abs(m.level - 70)).toBeLessThanOrEqual(3)
    const rival = (starter: number) => gyms.find((t) => t.rivalOf === starter)!.team.map((m) => [m.dex, m.level])
    expect(rival(1)).toEqual([[26, 75], [130, 76], [6, 80]]) // Bulbasaur → Raichu, Gyarados, Charizard
    expect(rival(4)).toEqual([[26, 75], [59, 76], [9, 80]]) // Charmander → Raichu, Arcanine, Blastoise
    expect(rival(7)).toEqual([[26, 75], [59, 76], [3, 80]]) // Squirtle → Raichu, Arcanine, Venusaur
  })

  it('gives every trainer a sprite cut from the trainer sheet', () => {
    for (const t of trainers as Trainer[]) {
      // Rival versions show as the character the player didn't pick.
      expect(t.spriteUrl, t.name).toMatch(t.rivalOf != null ? /^\/characters\/(red|green)\.png$/ : /^\/trainers\/classes\//)
      expect(existsSync(path.join('public', t.spriteUrl!)), t.spriteUrl!).toBe(true)
    }
  })

  it('keeps gym trainers out of the random trainer pools', () => {
    const gymIds = new Set(allAreas.flatMap((a) => a.gyms))
    for (const a of allAreas) for (const p of a.trainerPool) expect(gymIds.has(p.trainerId)).toBe(false)
  })

  it('places legendaries where they belong', () => {
    const bossOf = (name: string) => allAreas.find((a) => a.name === name)!.legendaryBoss!.map((b) => b.dex)
    expect(bossOf('Seafoam Islands')).toEqual([144])
    expect(bossOf('Power Plant')).toEqual([145])
    expect(bossOf('Victory Road')).toEqual([146])
    expect(bossOf('Cerulean Cave')).toEqual([150])
    expect(bossOf('Faraway Island')).toEqual([151])
  })
})

describe('dice & upgrades', () => {
  it('has 19 dice types, base not upgradeable', () => {
    expect(diceTypes).toHaveLength(19)
    const base = diceTypes.find((d) => d.type === 'base')!
    expect(base.upgradeable).toBe(false)
    expect(base.countsForMajority).toBe(false)
    for (const d of diceTypes) expect(d.faces).toHaveLength(6)
  })
  it('has 180 die rows (none for base) and 80 combo rows', () => {
    expect(upgrades.dice).toHaveLength(180)
    expect(upgrades.dice.some((r) => r.dieType === 'base')).toBe(false)
    expect(upgrades.combos).toHaveLength(80)
  })
})

describe('generated art', () => {
  const root = path.resolve(__dirname, '..')
  it('banners and badges exist', () => {
    for (const a of areas as Area[]) expect(existsSync(path.join(root, 'public', a.bannerUrl!.replace(/#flip$/, '')))).toBe(true)
    for (const t of trainers as Trainer[]) expect(existsSync(path.join(root, 'public', t.spriteUrl!))).toBe(true)
  })
})
