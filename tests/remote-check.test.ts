import { describe, expect, it } from 'vitest'
import { checkRemote } from '@/admin/remoteCheck'
import { BUNDLE } from '@/config/bundle'
import { bundleToRows } from '@/config/mapping'

const rows = () => structuredClone(bundleToRows(BUNDLE))

describe('checkRemote', () => {
  it('accepts a Supabase copy identical to the bundle', () => {
    const c = checkRemote(rows(), BUNDLE)
    expect(c.blockers).toEqual([])
    expect(c.bundle).not.toBeNull()
  })

  it('refuses an empty table (migration or seed not run)', () => {
    const r = rows()
    r.area_loot_pool = []
    const c = checkRemote(r, BUNDLE)
    expect(c.blockers.join()).toContain('area_loot_pool')
    expect(c.bundle).toBeNull()
  })

  it('refuses a missing column', () => {
    const r = rows()
    const col = Object.keys(r.pokemon[0]!).find((k) => k !== 'dex')!
    for (const p of r.pokemon) delete p[col]
    expect(checkRemote(r, BUNDLE).blockers.join()).toContain(col)
  })

  it('refuses missing Pokémon and config keys', () => {
    const r = rows()
    r.pokemon = r.pokemon.filter((p) => p.dex !== 25)
    r.game_config = r.game_config.slice(1)
    const b = checkRemote(r, BUNDLE).blockers.join('\n')
    expect(b).toContain('#25')
    expect(b).toContain('Config keys missing')
  })

  it('only warns when other rows were removed', () => {
    const r = rows()
    r.items = r.items.slice(1)
    const c = checkRemote(r, BUNDLE)
    expect(c.blockers).toEqual([])
    expect(c.warnings.join()).toContain('items')
  })
})
