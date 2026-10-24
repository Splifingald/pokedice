// The raid overhaul (docs/40): each progression raid's own numbers, rules and last bar, behind its switch. Off: raids
// as before. On: the numbers, the weather, telegraphed moves and their interrupt, the shield, the type changes, the
// last bar's power, Mega raids; every raid plays to its end without throwing, the same for a given seed.
import { describe, expect, it } from 'vitest'
import {
  adjustRaidHit,
  computeDamage,
  createRaid,
  createRng,
  MEGA_RAIDS,
  npcTeam,
  RAID_SPECIALS,
  raidRules,
  raidSpecialFor,
  raidTeamCap,
  simulateRaid,
  uniformLevels,
  type GameData,
  type RaidLogEntry,
  type RaidSideSeed,
} from '@/engine'
import { makeData } from '../fixtures'

const off = makeData()
const on: GameData = { ...off, config: { ...off.config, raidOverhaul: { access: 'all' } } }
const regions = off.regions.map((r) => r.id)
const areaOf = (dex: number) =>
  off.areas.find((a) => a.legendaryBoss?.some((b) => b.dex === dex && b.raid))?.id

function sides(d: GameData, seed: number, cap: number): RaidSideSeed[] {
  const rng = createRng(seed)
  return [0, 1, 2].map((k) => ({
    owner: `Side ${k}`,
    look: null,
    kind: k === 0 ? 'me' : 'npc',
    team: npcTeam(d, regions, rng, `s${k}`, cap),
  }))
}
function raid(
  d: GameData,
  dex: number,
  seed = 1,
  kind: 'progress' | 'daily' = 'progress',
  areaId = areaOf(dex),
) {
  const cap = raidTeamCap(d, dex, kind, areaId)
  return createRaid(
    { boss: { dex, shiny: false }, sides: sides(d, seed, cap), kind, areaId, auto: true },
    d,
    createRng(seed * 31),
  )
}
const kinds = (log: RaidLogEntry[]) => log.map((e) => e.kind)

describe('the switch', () => {
  it('off: the old numbers and no rules', () => {
    expect(raidSpecialFor(off, 150, 'progress', areaOf(150))).toBeNull()
    expect(raidRules(off, 150, 'progress', areaOf(150)).level).toBe(off.config.events.raid.level)
    expect(raidTeamCap(off, 150, 'progress', areaOf(150))).toBe(off.config.events.raid.progress.teamCap)
    const { state, log } = raid(off, 144)
    expect(state.special).toBeUndefined()
    expect(kinds(log)).not.toContain('raid_field')
  })
  it('on: its own level, bars, HP per bar and dice level; the team cap is its level', () => {
    const r = raidRules(on, 150, 'progress', areaOf(150))
    expect(r).toEqual({ level: 70, bars: 5, barHp: RAID_SPECIALS[150]!.barHp, upgradeLevel: 9 })
    expect(raidTeamCap(on, 150, 'progress', areaOf(150))).toBe(70)
  })
  it("the admin's own numbers still win", () => {
    const raidCfg = on.config.events.raid
    const d: GameData = {
      ...on,
      config: {
        ...on.config,
        events: {
          ...on.config.events,
          raid: { ...raidCfg, progress: { ...raidCfg.progress, perMon: { 150: { level: 61 } } } },
        },
      },
    }
    expect(raidRules(d, 150, 'progress', areaOf(150)).level).toBe(61)
  })
  it('only Arceus among the daily raids', () => {
    expect(raidSpecialFor(on, 493, 'daily')).not.toBeNull()
    expect(raidSpecialFor(on, 150, 'daily')).toBeNull()
    expect(raidTeamCap(on, 493, 'daily')).toBe(70)
  })
})

describe('a hit through the raid rules', () => {
  const lv = uniformLevels(5)
  const roll = (faces: number[], type: 'fire' | 'water' | 'steel' = 'steel') =>
    faces.map((faceIndex) => ({ type, faceIndex }))
  it('a combo-only shield: plain dice bounce, a combo hits the shield first', () => {
    // Steel faces 3,3,3,4,4,4: indexes 0 and 1 make a pair.
    const plain = computeDamage(roll([0, 3]), ['steel'], ['normal'], lv, on)
    const hit = { shield: 10 }
    expect(plain.combo).toBeNull()
    expect(adjustRaidHit(plain, hit, undefined).final).toBe(0)
    expect(hit).toMatchObject({ bounced: true, shield: 10 })
    const pair = computeDamage(roll([0, 1]), ['steel'], ['normal'], lv, on)
    const hit2 = { shield: 3 }
    expect(pair.combo).not.toBeNull()
    expect(adjustRaidHit(pair, hit2, undefined).final).toBe(pair.final - 3)
    expect(hit2.shield).toBe(0)
  })
  it('an absorbed type does nothing, a halved hit is half', () => {
    const fire = computeDamage(roll([1, 2], 'fire'), ['fire'], ['steel'], lv, on)
    const hit = { absorb: 'fire' as const }
    expect(adjustRaidHit(fire, hit, undefined).final).toBe(0)
    expect(hit).toMatchObject({ absorbed: true })
    expect(adjustRaidHit(fire, { mult: 0.5 }, undefined).final).toBe(Math.max(1, Math.round(fire.raw / 2)))
  })
  it('never resisted: a resisted hit lands as neutral', () => {
    const scale = on.config.events.raid.bossTypes
    const fire = computeDamage(roll([1, 2], 'fire'), ['fire'], ['water'], { ...lv, typeScale: scale }, on)
    expect(fire.effectiveness).toBeLessThan(1)
    const neutral = computeDamage(roll([1, 2], 'fire'), ['fire'], ['normal'], { ...lv, typeScale: scale }, on)
    expect(adjustRaidHit(fire, { neverResisted: ['fire'] }, scale).final).toBe(neutral.final)
  })
})

describe('the rules in a fight', () => {
  it('the weather is announced, and snow wears down whoever isn’t Ice', () => {
    const { log } = raid(on, 144)
    expect(log.find((e) => e.kind === 'raid_field')).toMatchObject({ weather: 'snow' })
    const ticks = log.filter(
      (e): e is Extract<RaidLogEntry, { kind: 'raid_tick' }> => e.kind === 'raid_tick' && e.cause === 'snow',
    )
    expect(ticks.length).toBeGreaterThan(0)
  })
  it('a telegraphed move charges a round ahead, then fires or is interrupted', () => {
    const { log } = raid(on, 249, 3)
    const i = kinds(log).indexOf('raid_charge')
    expect(i).toBeGreaterThan(0)
    expect(log[i]).toMatchObject({ move: 'spread', fires: 3 })
    const after = kinds(log.slice(i + 1))
    expect(after.includes('raid_move') || after.includes('raid_interrupt')).toBe(true)
  })
  it('a shield opens with each bar', () => {
    const { log } = raid(on, 150)
    expect(log.find((e) => e.kind === 'raid_shield')).toBeTruthy()
  })
  it('its last bar gains its dice', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { state, log } = raid(on, 249, seed)
      const fin = log.find((e): e is Extract<RaidLogEntry, { kind: 'raid_final' }> => e.kind === 'raid_final')
      if (!fin) continue
      expect(fin.dice).toEqual(['flying'])
      expect(state.special?.final).toBe(true)
      return
    }
    throw new Error('no raid reached Lugia’s last bar')
  })
  it('Arceus takes a plate against the side it faces', () => {
    const { log } = raid(on, 493, 2, 'daily')
    const form = log.find((e) => e.kind === 'form')
    if (form) expect(form).toMatchObject({ reason: 'choice' })
    expect(kinds(log)).toContain('raid_charge')
  })
  it('a Mega raid fights in its form, with the die Mega Evolving gives', () => {
    const areaId = areaOf(150)
    const { state } = raid(on, 10043, 1, 'progress', areaId)
    expect(state.boss.dex).toBe(10043)
    expect(state.boss.dice).toContain('fighting')
  })
  it('the same seed plays the same raid', () => {
    expect(raid(on, 384, 5).log).toEqual(raid(on, 384, 5).log)
  })
})

describe('every raid of the overhaul', () => {
  const all = [...Object.keys(RAID_SPECIALS).map(Number), ...Object.keys(MEGA_RAIDS).map(Number)]
  it.each(all)('#%i plays to its end', (dex) => {
    const kind = dex === 493 ? 'daily' : 'progress'
    const base = MEGA_RAIDS[dex]?.base ?? dex
    const areaId = kind === 'daily' ? undefined : areaOf(base)
    expect(on.species[dex], `species #${dex}`).toBeTruthy()
    if (kind === 'progress') expect(areaId, `#${dex}'s area`).toBeTruthy()
    const cap = raidTeamCap(on, dex, kind, areaId)
    const res = simulateRaid(
      { boss: { dex, shiny: false }, sides: sides(on, dex, cap), kind, areaId },
      on,
      createRng(dex),
    )
    expect(res.steps).toBeGreaterThan(0)
  })
})
