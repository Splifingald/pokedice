/**
 * pnpm talents — writes src/data/talents.json: one hidden talent per evolution family (docs/51), keyed by the family's
 * lowest dex. The admin can pick another for any family (Config → Hidden talents); this is the starting assignment.
 *
 * A family gets a super talent when it's strong: a legendary or mythical in it, a starter line, a pseudo-legendary, an
 * Ultra Beast or Paradox Pokémon, or a member with a base stat total of 500 or more. Every other family gets a base
 * talent. Within its tier, the family's strongest member's first type picks from a short list (by the family's dex,
 * so neighbours differ), and a few well-known families get a talent picked by hand.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import { compileGameData } from '../src/engine/data'
import { familyMembers, familyOf, isStarterFamily, type TalentKey } from '../src/engine/talents'
import type { PokeType, Species } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BASE: Record<PokeType, TalentKey[]> = {
  normal: ['pickup', 'payDay', 'extraReroll', 'daycareDarling'],
  fire: ['opener', 'finisher'],
  water: ['naturalCure', 'fieldMedic'],
  grass: ['fieldMedic', 'naturalCure'],
  electric: ['quick', 'opener'],
  ice: ['thaw', 'thickHide'],
  fighting: ['finisher', 'duelist'],
  poison: ['naturalCure', 'finisher'],
  ground: ['thickHide', 'pairPro'],
  flying: ['quick', 'extraReroll'],
  psychic: ['extraReroll', 'duelist'],
  bug: ['pairPro', 'daycareDarling'],
  rock: ['thickHide', 'pairPro'],
  ghost: ['extraReroll', 'opener'],
  dragon: ['opener', 'duelist'],
  dark: ['finisher', 'payDay'],
  steel: ['thickHide', 'duelist'],
  fairy: ['daycareDarling', 'fieldMedic'],
}

const SUPER: Record<PokeType, TalentKey[]> = {
  normal: ['doubleReroll', 'gentleTouch', 'amuletCoin'],
  fire: ['typeFocus', 'raider'],
  water: ['leftovers', 'typeFocus'],
  grass: ['leftovers', 'eggRush'],
  electric: ['ultraSpeed', 'reroller'],
  ice: ['sturdy', 'mirror'],
  fighting: ['raider', 'typeFocus'],
  poison: ['mindsEye', 'leftovers'],
  ground: ['sturdy', 'typeFocus'],
  flying: ['ultraSpeed', 'raider'],
  psychic: ['mindsEye', 'reroller'],
  bug: ['reroller', 'ultraSpeed'],
  rock: ['sturdy', 'raider'],
  ghost: ['mindsEye', 'mirror'],
  dragon: ['mirror', 'typeFocus'],
  dark: ['amuletCoin', 'gentleTouch'],
  steel: ['sturdy', 'reroller'],
  fairy: ['eggRush', 'gentleTouch'],
}

/** Picked by hand, by the family's lowest dex. */
const BY_HAND: Record<number, TalentKey> = {
  1: 'leftovers', // Bulbasaur
  4: 'typeFocus', // Charmander
  7: 'sturdy', // Squirtle
  10: 'daycareDarling', // Caterpie
  16: 'extraReroll', // Pidgey
  19: 'pickup', // Rattata
  25: 'opener', // Pikachu (Pichu, Raichu)
  52: 'payDay', // Meowth
  63: 'mindsEye', // Abra
  113: 'eggRush', // Chansey
  129: 'doubleReroll', // Magikarp
  132: 'daycareDarling', // Ditto
  133: 'eggRush', // Eevee
  143: 'leftovers', // Snorlax (and Munchlax)
  147: 'mirror', // Dratini
  150: 'reroller', // Mewtwo
  151: 'mirror', // Mew
  246: 'raider', // Larvitar
}

const bst = (s: Species) => Number(/BST (\d+)/.exec(s.notes ?? '')?.[1] ?? 0)

async function main() {
  const data = compileGameData(BUNDLE)
  const strong = new Set([
    ...data.config.events.raid.exclude.pseudo,
    ...data.config.events.raid.exclude.extra,
  ])
  const roots = [...new Set(data.speciesList.map((s) => familyOf(data, s.dex)))].sort((a, b) => a - b)
  const families: Record<string, TalentKey> = {}
  const tally: Record<string, number> = {}
  for (const root of roots) {
    const members = familyMembers(data, root)
    const plain = members.filter((m) => !m.form)
    const top = [...(plain.length ? plain : members)].sort((a, b) => bst(b) - bst(a))[0]!
    const superTier =
      members.some((m) => data.eggGroups[m.dex]?.l === 1 || strong.has(m.dex) || bst(m) >= 500) ||
      isStarterFamily(data, root)
    const list = (superTier ? SUPER : BASE)[top.type1]
    const talent = BY_HAND[root] ?? list[root % list.length]!
    families[String(root)] = talent
    tally[talent] = (tally[talent] ?? 0) + 1
  }
  await writeFile(
    path.join(ROOT, 'src', 'data', 'talents.json'),
    JSON.stringify({ families }, null, 1) + '\n',
  )
  console.log(`✓ src/data/talents.json — ${roots.length} families`)
  console.log(
    Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(' · '),
  )
}

void main()
