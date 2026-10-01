// Content names come out of src/data/*.json in English. Rather than translate at every render site,
// the store swaps the whole compiled GameData when the language changes, so `species.name`,
// `area.name`, `item.name` and `trainer.name` are already in the player's language everywhere.
import type { GameData } from '@/engine'
import { tIn, type Lang } from '.'
import { areaKey, itemDescKey, itemKey, pokemonKey, slug, splitRematch, splitTrainerName, trainerClassKey, trainerNameKey } from './names'

/** A key the sheet has nothing for falls back to the English name it was built from. */
const pick = (lang: Lang, key: string, english: string) => {
  const hit = tIn(lang, key)
  return hit === key ? english : hit
}

export const localizeSpeciesName = (lang: Lang, dex: number, english: string) => pick(lang, pokemonKey(dex), english)
export const localizeAreaName = (lang: Lang, english: string) => pick(lang, areaKey(english), english)
export const localizeBadge = (lang: Lang, english: string) => pick(lang, `badge.${slug(english)}`, english)
export const localizeRegionName = (lang: Lang, id: string, english: string) => pick(lang, `region.${id}`, english)

/**
 * `Bug Catcher Kent` → `Chasseur d'insectes Kent`: the class is translated; a given name only when the sheet has a row
 * for it (gym leaders, the Elite Four, champions: official names in CJK, kept in Latin languages). `Lance II` reads
 * the `Lance` row.
 */
export function localizeTrainerName(lang: Lang, english: string): string {
  const { cls, given } = splitTrainerName(english)
  const { base, suffix } = splitRematch(given)
  const name = given ? pick(lang, trainerNameKey(base), base) + suffix : ''
  if (!cls) return name
  const label = pick(lang, trainerClassKey(cls), cls)
  return name ? `${label} ${name}` : label
}

export function localizeGameData(data: GameData, lang: Lang): GameData {
  if (lang === 'en') return data

  const species: GameData['species'] = {}
  for (const [dex, sp] of Object.entries(data.species))
    species[Number(dex)] = { ...sp, name: localizeSpeciesName(lang, sp.dex, sp.name) }

  const items: GameData['items'] = {}
  for (const [key, item] of Object.entries(data.items))
    items[key] = {
      ...item,
      name: pick(lang, itemKey(item.key), item.name),
      description: item.description ? pick(lang, itemDescKey(item.key), item.description) : item.description,
    }

  const trainers: GameData['trainers'] = {}
  for (const [id, tr] of Object.entries(data.trainers))
    trainers[id] = { ...tr, name: localizeTrainerName(lang, tr.name), badge: tr.badge ? localizeBadge(lang, tr.badge) : tr.badge }

  const areas = data.areas.map((a) => ({ ...a, name: localizeAreaName(lang, a.name) }))
  const regions = data.regions.map((r) => ({ ...r, name: localizeRegionName(lang, r.id, r.name) }))

  return {
    ...data,
    species,
    speciesList: Object.values(species).sort((a, b) => a.dex - b.dex),
    items,
    trainers,
    areas,
    regions,
  }
}
