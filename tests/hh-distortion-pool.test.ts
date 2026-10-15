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

  it('has Haunter and Dusclops as reliefs, below the strong ones', () => {
    expect(entries.map((e) => e.dex)).toEqual(DISTORTION_NEW)
    const relief = entries.filter((e) => e.dex === 93 || e.dex === 356)
    const strong = entries.filter((e) => e.dex !== 93 && e.dex !== 356)
    for (const r of relief) for (const s of strong) expect(r.maxLevel).toBeLessThan(s.minLevel)
  })

  it('patches an export once: the pool grows by the new ones, an existing row for one of them kept', () => {
    const b = withHaunted(BUNDLE as BundleRaw)
    const before = b.areas.find((a) => a.id === areaId)!
    // An export from before the change: the area without its new rows, Sableye already added by the admin.
    const old: BundleRaw = {
      ...b,
      areas: b.areas.map((a) =>
        a.id === areaId
          ? {
              ...a,
              wildPool: [
                ...a.wildPool.filter((w) => !DISTORTION_NEW.includes(w.dex)),
                { id: 'admin-sableye', dex: 302, weight: 3, minLevel: 60, maxLevel: 61 },
              ],
            }
          : a,
      ),
    }
    const patched = patchHhDistortionPool(old)
    const pool = patched.areas.find((a) => a.id === areaId)!.wildPool
    expect(pool.filter((w) => w.dex === 302)).toEqual([
      { id: 'admin-sableye', dex: 302, weight: 3, minLevel: 60, maxLevel: 61 },
    ])
    expect(new Set(pool.map((w) => w.dex))).toEqual(new Set(before.wildPool.map((w) => w.dex)))
    expect(Number(patched.config.configVersion)).toBe(Number(old.config.configVersion ?? 0) + 1)
    const again = patchHhDistortionPool(patched)
    expect(again.areas.find((a) => a.id === areaId)!.wildPool).toEqual(pool)
  })
})
