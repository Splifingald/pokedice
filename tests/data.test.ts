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
import type { Area, DiceEntry, Species, Trainer } from '@/engine/types'
import { composeDice, diceCountFromBst, hpAtLevel, stableUuid } from '../scripts/seed'

const species = pokemon as Species[]
const byDex = (dex: number) => species.find((p) => p.dex === dex)!
const count = (dice: DiceEntry[], type: string) => dice.filter((d) => d.type === type).reduce((s, d) => s + d.count, 0)
const total = (dice: DiceEntry[]) => dice.reduce((s, d) => s + d.count, 0)
const LEGENDARIES = [144, 145, 146, 150, 151]
const STARTERS = [1, 4, 7]

describe('pokemon.json', () => {
  it('has 151 complete entries', () => {
    expect(species).toHaveLength(151)
    for (const p of species) {
      expect(total(p.dice)).toBeGreaterThanOrEqual(1)
      expect(total(p.dice)).toBeLessThanOrEqual(5)
      expect(p.spriteUrl).toBe(`/pokemon/${String(p.dex).padStart(3, '0')}_front.png`)
      for (const view of ['front', 'front_shiny', 'back', 'back_shiny', 'mini_1', 'mini_2'])
        expect(existsSync(path.join('public/pokemon', `${String(p.dex).padStart(3, '0')}_${view}.png`)), `${p.dex} ${view}`).toBe(true)
      expect(p.baseHp).toBeGreaterThan(0)
      expect(p.maxHp).toBeGreaterThan(p.baseHp)
      expect(Array.isArray(p.milestones)).toBe(true)
      expect(p.rerolls).toBe(total(p.dice))
    }
  })

  it('matches the worked examples (dice grow with the evolution stage)', () => {
    const squirtle = byDex(7) // first stage: one die of its main type
    expect(squirtle.dice).toEqual([{ type: 'water', count: 1 }])
    expect(squirtle.rerolls).toBe(1)

    expect(total(byDex(5).dice)).toBe(3) // Charmeleon: the 3rd die on evolving

    const charizard = byDex(6) // final of three: 4 dice on evolving
    expect(count(charizard.dice, 'fire')).toBe(1)
    expect(count(charizard.dice, 'flying')).toBe(1)
    expect(count(charizard.dice, 'base')).toBe(2)
    expect(charizard.rerolls).toBe(4)

    const mewtwo = byDex(150) // legendaries: 5 dice
    expect(count(mewtwo.dice, 'psychic')).toBe(3)
    expect(count(mewtwo.dice, 'base')).toBe(2)

    expect(byDex(143).dice).toEqual([{ type: 'normal', count: 1 }]) // Snorlax: single stage, grows by level
    expect(count(byDex(149).dice, 'dragon')).toBeGreaterThan(0)
  })

  it('computes HP curves and evolutions from PokeAPI', () => {
    expect(byDex(6).baseHp).toBe(12)
    expect(byDex(6).maxHp).toBe(297)
    expect(byDex(4).evolutions).toEqual([{ toDex: 5, level: 16 }])
    expect(byDex(133).evolutions.map((e) => e.toDex).sort()).toEqual([134, 135, 136])
    expect(byDex(133).evolutions.every((e) => e.level === 28)).toBe(true)
    expect(byDex(64).evolutions).toEqual([{ toDex: 65, level: 34 }]) // trade
    expect(byDex(6).milestones).toEqual([
      { level: 50, effect: 'ADD_DIE', dieType: 'fire' },
      { level: 50, effect: 'ADD_REROLL', amount: 1 },
    ])
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
  const allAreas = areas as Area[]
  const allTrainers = trainers as Trainer[]

  it('has 5 areas with valid dex references', () => {
    expect(allAreas).toHaveLength(25)
    for (const a of allAreas) for (const w of a.wildPool) expect(w.dex).toBeGreaterThanOrEqual(1)
    for (const a of allAreas) for (const w of a.wildPool) expect(w.dex).toBeLessThanOrEqual(151)
    for (const t of allTrainers) for (const m of t.team) expect(m.dex).toBeGreaterThanOrEqual(1)
  })

  it('keeps legendaries out of wild pools and attaches each as a boss', () => {
    const wild = new Set(allAreas.flatMap((a) => a.wildPool.map((w) => w.dex)))
    for (const l of LEGENDARIES) expect(wild.has(l)).toBe(false)
    const bosses = allAreas.flatMap((a) => a.legendaryBoss ?? []).map((b) => b.dex)
    expect(bosses.sort((x, y) => x - y)).toEqual(LEGENDARIES)
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
    const catchable = new Set([...allAreas.flatMap((a) => a.wildPool.map((w) => w.dex)), ...LEGENDARIES])
    expect(catchable.size).toBe(151)
  })

  it('every trainer referenced exists and has 1–3 Pokémon', () => {
    const ids = new Set(allTrainers.map((t) => t.id))
    for (const a of allAreas) for (const p of a.trainerPool) expect(ids.has(p.trainerId)).toBe(true)
    for (const t of allTrainers) {
      expect(t.team.length).toBeGreaterThanOrEqual(1)
      expect(t.team.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('Kanto structure', () => {
  const allAreas = areas as Area[]
  const allTrainers = trainers as Trainer[]
  const tById = new Map(allTrainers.map((t) => [t.id, t]))
  const linear = allAreas.filter((a) => !a.hidden).sort((a, b) => a.orderIndex - b.orderIndex)
  const hidden = allAreas.filter((a) => a.hidden)

  it('has 22 linear areas in order, Route 1 → Indigo Plateau, and 3 secret areas with conditions', () => {
    expect(linear.map((a) => a.orderIndex)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(linear[0]!.name).toBe('Route 1')
    expect(linear[21]!.name).toBe('Indigo Plateau')
    expect(hidden.map((a) => a.name).sort()).toEqual(['Cerulean Cave', 'Faraway Island', 'Power Plant'])
    for (const a of hidden) expect(a.unlockConditions?.length).toBeGreaterThan(0)
    expect(allAreas.find((a) => a.name === 'Faraway Island')!.unlockConditions).toEqual([{ kind: 'pokedex', count: 150 }])
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

  it('gives every trainer a sprite cut from the trainer sheet', () => {
    for (const t of trainers as Trainer[]) {
      expect(t.spriteUrl, t.name).toMatch(/^\/trainers\/classes\//)
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
