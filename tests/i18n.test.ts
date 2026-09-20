import { describe, expect, it } from 'vitest'
import areas from '@/data/areas.json'
import items from '@/data/items.json'
import pokemon from '@/data/pokemon.json'
import trainers from '@/data/trainers.json'
import { allKeys, hasKey, LANGS, tableFor, tIn } from '@/i18n'
import { areaKey, itemDescKey, itemKey, pokemonKey, slug, splitTrainerName, trainerClassKey } from '@/i18n/names'

const missing = (keys: string[]) => keys.filter((k) => !hasKey(k))

describe('the localization sheet', () => {
  it('names every Pokémon in the bundle', () => {
    expect(missing((pokemon as { dex: number }[]).map((p) => pokemonKey(p.dex)))).toEqual([])
  })

  it('names and describes every item', () => {
    const keys = (items as { key: string }[]).flatMap((i) => [itemKey(i.key), itemDescKey(i.key)])
    expect(missing(keys)).toEqual([])
  })

  it('names every area', () => {
    expect(missing((areas as { name: string }[]).map((a) => areaKey(a.name)))).toEqual([])
  })

  it('knows every trainer class and badge in the bundle', () => {
    const rows = trainers as { name: string; badge: string | null }[]
    const classes = [...new Set(rows.map((t) => splitTrainerName(t.name).cls).filter((c): c is string => !!c))]
    expect(missing(classes.map(trainerClassKey))).toEqual([])
    const badges = [...new Set(rows.map((t) => t.badge).filter((b): b is string => !!b))]
    expect(missing(badges.map((b) => `badge.${slug(b)}`))).toEqual([])
  })

  it('gives a trainer with no known class its name back unchanged', () => {
    expect(splitTrainerName('Misty')).toEqual({ cls: null, given: 'Misty' })
    expect(splitTrainerName('Bug Catcher Kent')).toEqual({ cls: 'Bug Catcher', given: 'Kent' })
  })

  it('leaves no cell empty in any language', () => {
    const gaps: string[] = []
    for (const lang of LANGS) for (const key of allKeys()) if (!tableFor(lang)[key]) gaps.push(`${lang}:${key}`)
    expect(gaps).toEqual([])
  })

  it('interpolates {vars}, and shows the key when a row is missing', () => {
    expect(tIn('fr', 'pokemon.6')).toBe('Dracaufeu')
    expect(tIn('de', 'ui.common.level.short', { n: 12 })).toContain('12')
    expect(tIn('fr', 'nope.at.all')).toBe('nope.at.all')
  })
})
