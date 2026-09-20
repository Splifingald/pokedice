// `pnpm seed` writes nothing unless asked to. The committed bundle is the source of truth — it holds three regions,
// 386 species and a campaign's worth of admin retuning, none of which the Kanto-only generator can reproduce — so a
// bare run that regenerated it would be a silent rollback of the whole game.
import { describe, expect, it } from 'vitest'
import { seedMode } from '../scripts/seed'

describe('pnpm seed', () => {
  it('reports by default, and writes only for an explicit --force', () => {
    expect(seedMode([])).toBe('report')
    expect(seedMode(['--dry-run'])).toBe('report')
    expect(seedMode(['--force'])).toBe('write')
    expect(seedMode(['--force', '--whatever'])).toBe('write')
  })

  it('is not tricked into writing by a flag that merely looks like it', () => {
    for (const argv of [['force'], ['-force'], ['--forced'], ['--no-force']]) expect(seedMode(argv)).toBe('report')
  })
})
