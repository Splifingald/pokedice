// The Stairway of Plates' words (docs/64 §4.5): every type has a Plate's name in the ten languages (the games' names,
// Normal the Legend Plate), and a portal line takes the Stairway's own wording where it has one, the portal run's
// where it reads the same.
import { describe, expect, it } from 'vitest'
import { POKE_TYPES } from '@/engine'
import { LANGS, tableFor, tIn } from '@/i18n'
import { plateKey, plateType, skinKey } from '@/components/portalSkin'

describe('the Plates’ names', () => {
  it('names every type’s Plate in every language', () => {
    for (const type of POKE_TYPES)
      for (const lang of LANGS) expect(tableFor(lang)[plateKey(type)], `${type} in ${lang}`).toBeTruthy()
  })

  it('uses the games’ names: the Flame Plate for Fire, the Icicle, Iron and Draco Plates, the Legend Plate for Normal', () => {
    expect(tIn('en', plateKey('fire'))).toBe('Flame Plate')
    expect(['normal', 'ice', 'steel', 'dragon'].map((x) => tIn('en', plateKey(x as 'ice')))).toEqual([
      'Legend Plate',
      'Icicle Plate',
      'Iron Plate',
      'Draco Plate',
    ])
    expect(tIn('fr', plateKey('ice'))).toBe('Plaque Glace')
  })

  it('reads a Plate’s type off its form change’s dice', () => {
    expect(plateType(['ice', 'ice', 'base'])).toBe('ice')
    expect(plateType(['base'])).toBe('normal')
  })
})

describe('a portal line in the Stairway’s look', () => {
  it('takes its own words where it has them, the portal run’s otherwise; Distortion World’s never change', () => {
    expect(skinKey('plates', 'ui.portal.title')).toBe('ui.plates.title')
    expect(skinKey('plates', 'ui.portal.ready')).toBe('ui.portal.ready')
    expect(skinKey('distortion', 'ui.portal.title')).toBe('ui.portal.title')
    expect(skinKey('plates', 'ui.raid.unleash')).toBe('ui.raid.unleash')
  })

  it('keeps every placeholder of its words in all ten languages', () => {
    const keys = Object.keys(tableFor('en')).filter((k) => k.startsWith('ui.plates.'))
    expect(keys.length).toBeGreaterThan(30)
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const k of [...keys, 'ui.raid.log.plate', 'ui.hist.plate'])
      for (const lang of LANGS)
        expect(vars(tableFor(lang)[k] ?? ''), `${k} in ${lang}`).toEqual(vars(tableFor('en')[k]!))
  })
})
