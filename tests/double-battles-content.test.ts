// Double battles' pairs (docs/31) in the bundled content: who is a duo, and the real games' pairs added from Hoenn on.
// Every duo can send out two Pokémon and is never the Elite Four or a Champion; the only Gym Leader is Tate & Liza;
// every new pair fights with species the game has, in one area of its own region at that area's levels, under a pair's
// sprite and a class the sheet translates. The bundle is exactly what scripts/patch-double-battles.ts makes of it,
// and the admin's mapping keeps the flag both ways.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { bundleToRows, rowsToBundle } from '@/config/mapping'
import type { Area, Trainer } from '@/engine'
import { hasKey } from '@/i18n'
import { splitTrainerName, trainerClassKey } from '@/i18n/names'
import {
  FLAGGED,
  NEW_DUOS,
  areaIdOf,
  duoPoolEntry,
  duoTrainer,
  patchDoubleBattles,
  withDuos,
} from '../scripts/patch-double-battles'

const trainers = BUNDLE.trainers as Trainer[]
const areas = BUNDLE.areas as Area[]
const byId = new Map(trainers.map((t) => [t.id, t]))
const PAIR_SPRITE =
  /\/(twins|young-couple|interviewers|backers|tate-and-liza|crush-kin|sis-and-bro|cool-couple|swimmers|preschoolers)\.png$/

/** The bundle as it was before this change: no flag, no new pair. */
function before() {
  const newIds = new Set(NEW_DUOS.map((d) => duoTrainer(d).id))
  const poolIds = new Set(NEW_DUOS.map((d) => duoPoolEntry(d).id))
  return {
    ...BUNDLE,
    trainers: trainers.filter((t) => !newIds.has(t.id)).map(({ duo: _duo, ...t }) => t as Trainer),
    areas: areas.map((a) => ({ ...a, trainerPool: a.trainerPool.filter((p) => !poolIds.has(p.id)) })),
  }
}

describe('the duos', () => {
  const duos = trainers.filter((t) => t.duo)

  it('can all send out two Pokémon, and are never the Elite Four or a Champion; Tate & Liza the only Gym Leader', () => {
    expect(duos.length).toBe(FLAGGED.length + NEW_DUOS.length)
    for (const t of duos) {
      expect(t.team.length, t.name).toBeGreaterThanOrEqual(2)
      expect(['trainer', 'leader'], t.name).toContain(t.role)
    }
    expect(duos.filter((t) => t.role === 'leader').map((t) => t.name)).toEqual(['Tate & Liza'])
  })

  it('are exactly the trainers who look like a pair', () => {
    const pairs = trainers.filter((t) => PAIR_SPRITE.test(t.spriteUrl ?? ''))
    expect(pairs.map((t) => t.id).sort()).toEqual(duos.map((t) => t.id).sort())
  })

  it('flags the pairs already in the game by their right ids', () => {
    for (const [id, name] of FLAGGED) expect(byId.get(id)?.name, id).toBe(name)
  })
})

describe('the new pairs', () => {
  const species = new Set(BUNDLE.pokemon.map((p) => p.dex))

  it('field species the game has, 2 or 3 of them', () => {
    for (const d of NEW_DUOS) {
      expect(d.team.length, d.name).toBeGreaterThanOrEqual(2)
      expect(d.team.length, d.name).toBeLessThanOrEqual(3)
      for (const [dex] of d.team) expect(species.has(dex), `${d.name}: #${dex}`).toBe(true)
    }
  })

  it('are each in one area of their region, at that area’s levels, with its trainers’ weight', () => {
    for (const d of NEW_DUOS) {
      const t = duoTrainer(d)
      expect(byId.get(t.id), d.name).toEqual(t)
      const homes = areas.filter((a) => a.trainerPool.some((p) => p.trainerId === t.id))
      expect(
        homes.map((a) => a.id),
        d.name,
      ).toEqual([areaIdOf(d.area)])
      const area = homes[0]!
      expect(area.regionId, d.name).toBe(d.region)
      for (const [, level] of d.team) {
        expect(level, d.name).toBeGreaterThanOrEqual(area.minLevel)
        expect(level, d.name).toBeLessThanOrEqual(area.maxLevel)
      }
      const weights = new Set(area.trainerPool.map((p) => p.weight))
      expect([...weights], area.name).toEqual([duoPoolEntry(d).weight])
    }
  })

  it('have from 3 to 8 pairs in each region from Hoenn on', () => {
    for (const r of ['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea']) {
      const n = NEW_DUOS.filter((d) => d.region === r).length
      expect(n, r).toBeGreaterThanOrEqual(3)
      expect(n, r).toBeLessThanOrEqual(8)
    }
  })

  it('show a pair’s sprite that exists, under a class the sheet translates', () => {
    for (const d of NEW_DUOS) {
      expect(d.sprite, d.name).toMatch(PAIR_SPRITE)
      expect(existsSync(path.join('public', d.sprite)), d.sprite).toBe(true)
      const cls = splitTrainerName(d.name).cls
      expect(cls, d.name).toBeTruthy()
      expect(hasKey(trainerClassKey(cls!)), d.name).toBe(true)
    }
  })
})

describe('the patch', () => {
  it('makes the bundle what it is from the bundle before it, and changes nothing the second time', () => {
    const b = before()
    const out = withDuos(b)
    expect(out.trainers).toEqual(trainers)
    expect(out.areas).toEqual(areas)
    expect(withDuos(out)).toEqual(out)
  })

  it('on an export, sets the switch Off where missing and keeps the admin’s; content version + 1', () => {
    const b = before()
    const v = Number((b.config as { configVersion: number }).configVersion)
    const out = patchDoubleBattles(b)
    expect((out.config as { doubleBattles: unknown }).doubleBattles).toEqual({
      access: 'off',
      regions: ['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'],
      wildChance: 10,
    })
    expect((out.config as { configVersion: number }).configVersion).toBe(v + 1)
    const own = {
      ...b,
      config: { ...b.config, doubleBattles: { access: 'admin', regions: ['hoenn'], wildChance: 5 } },
    }
    expect((patchDoubleBattles(own).config as { doubleBattles: unknown }).doubleBattles).toEqual({
      access: 'admin',
      regions: ['hoenn'],
      wildChance: 5,
    })
  })

  it('skips a pair whose area this content hasn’t got', () => {
    const b = before()
    const d = NEW_DUOS[0]!
    const out = withDuos({ ...b, areas: b.areas.filter((a) => a.id !== areaIdOf(d.area)) })
    expect(out.trainers.some((t) => t.id === duoTrainer(d).id)).toBe(false)
  })
})

describe('the admin’s tables', () => {
  it('keep the flag both ways, and leave it off the trainers who aren’t pairs', () => {
    const rows = bundleToRows(BUNDLE)
    expect(rows.trainers.filter((r) => r.duo === true).length).toBe(FLAGGED.length + NEW_DUOS.length)
    const back = rowsToBundle(rows)
    expect(back.trainers).toEqual(BUNDLE.trainers)
  })
})
