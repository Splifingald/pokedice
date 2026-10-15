// Distortion World's new wild Pokémon (docs/28): the patch over an admin export and its migration (0058), which is the
// script's own output. The reliefs are weaker than the rest; nothing but the area's pool and the content version moves.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BundleRaw } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { withHaunted } from '../scripts/content-haunted-hollow'
import {
  DISTORTION_NEW,
  distortionRows,
  hhDistortionPoolSql,
  patchHhDistortionPool,
} from '../scripts/patch-hh-distortion-pool'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')

describe('Distortion World’s new wild Pokémon', () => {
  const { areaId, entries } = distortionRows()

  it('0058 is what the patch script generates', () => {
    expect(readFileSync(path.join(MIG, '0058_hh_distortion_pool.sql'), 'utf8')).toBe(hhDistortionPoolSql())
  })

  it('has Haunter and Dusclops as reliefs below the strong ones, every one as likely but Dragapult', () => {
    const relief = entries.filter((e) => e.dex === 93 || e.dex === 356)
    const strong = entries.filter((e) => e.dex !== 93 && e.dex !== 356 && e.dex !== 887)
    expect(relief).toHaveLength(2)
    expect(strong).toHaveLength(13)
    for (const e of [...relief, ...strong]) expect(e.weight).toBe(15)
    expect(entries.find((e) => e.dex === 887)!.weight).toBeLessThan(15)
    for (const r of relief) for (const s of strong) expect(r.maxLevel).toBeLessThan(s.minLevel)
    for (const dex of DISTORTION_NEW) expect(entries.some((e) => e.dex === dex)).toBe(true)
  })

  it('patches an export: the newcomers added, every row set to its numbers (its id kept), the range set', () => {
    const b = withHaunted(BUNDLE as BundleRaw)
    // An export from before: the area at Lv.65–70 without the newcomers, Gengar at its old numbers, Sableye added
    // by hand.
    const old: BundleRaw = {
      ...b,
      areas: b.areas.map((a) =>
        a.id === areaId
          ? {
              ...a,
              minLevel: 65,
              wildPool: [
                ...a.wildPool
                  .filter((w) => !DISTORTION_NEW.includes(w.dex))
                  .map((w) => (w.dex === 94 ? { ...w, minLevel: 65, maxLevel: 69 } : w)),
                { id: 'admin-sableye', dex: 302, weight: 3, minLevel: 70, maxLevel: 71 },
              ],
            }
          : a,
      ),
    }
    const patched = patchHhDistortionPool(old)
    const area = patched.areas.find((a) => a.id === areaId)!
    expect([area.minLevel, area.maxLevel]).toEqual([52, 70])
    const by = (dex: number) => area.wildPool.filter((w) => w.dex === dex)
    expect(by(302)).toEqual([{ id: 'admin-sableye', dex: 302, weight: 15, minLevel: 60, maxLevel: 64 }])
    expect(by(94).map((w) => [w.minLevel, w.maxLevel])).toEqual([[60, 64]])
    expect(new Set(area.wildPool.map((w) => w.dex))).toEqual(new Set(entries.map((w) => w.dex)))
    expect(Number(patched.config.configVersion)).toBe(Number(old.config.configVersion ?? 0) + 1)
    const again = patchHhDistortionPool(patched)
    expect(again.areas.find((a) => a.id === areaId)!.wildPool).toEqual(area.wildPool)
  })
})
