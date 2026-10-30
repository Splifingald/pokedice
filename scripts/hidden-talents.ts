/**
 * pnpm talents — writes src/data/talents.json: one hidden talent per evolution family (docs/51), keyed by the family's
 * lowest dex. The admin can pick another for any family (Config → Hidden talents); this is the starting assignment.
 *
 * Three rarities (the user's call, 2026-10-30), by the family's strength: its strongest plain member's base stat total
 * (Megas and other forms left out). **Ultra**: a legendary or mythical, a starter line, a pseudo-legendary, an Ultra
 * Beast or Paradox Pokémon, or `ULTRA_AT`+; **rare**: `RARE_AT`+; **common**: the rest. Within its rarity, the family's
 * strongest member's first type picks from a short list (by the family's dex, so neighbours differ), and a few
 * well-known families get a talent picked by hand.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import { compileGameData } from '../src/engine/data'
import {
  familyMembers,
  familyOf,
  isStarterFamily,
  talentTier,
  type TalentKey,
  type TalentTier,
} from '../src/engine/talents'
import type { PokeType, Species } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const RARE_AT = 495
export const ULTRA_AT = 540

const LISTS: Record<TalentTier, Record<PokeType, TalentKey[]>> = {
  common: {
    normal: ['extraReroll', 'daycareDarling', 'pairPro'],
    fire: ['quick', 'extraReroll'],
    water: ['thickHide', 'daycareDarling'],
    grass: ['daycareDarling', 'thickHide'],
    electric: ['quick', 'extraReroll'],
    ice: ['thaw', 'thickHide'],
    fighting: ['pairPro', 'thickHide'],
    poison: ['pairPro', 'extraReroll'],
    ground: ['thickHide', 'pairPro'],
    flying: ['quick', 'extraReroll'],
    psychic: ['extraReroll', 'quick'],
    bug: ['pairPro', 'daycareDarling'],
    rock: ['thaw', 'thickHide'],
    ghost: ['extraReroll', 'quick'],
    dragon: ['quick', 'thickHide'],
    dark: ['pairPro', 'quick'],
    steel: ['thaw', 'thickHide'],
    fairy: ['daycareDarling', 'extraReroll'],
  },
  rare: {
    normal: ['pickup', 'payDay', 'gentleTouch', 'companion'],
    fire: ['opener', 'finisher'],
    water: ['naturalCure', 'fieldMedic'],
    grass: ['fieldMedic', 'naturalCure'],
    electric: ['opener', 'companion'],
    ice: ['finisher', 'naturalCure'],
    fighting: ['finisher', 'companion'],
    poison: ['naturalCure', 'finisher'],
    ground: ['companion', 'opener'],
    flying: ['opener', 'companion'],
    psychic: ['mindsEye', 'companion'],
    bug: ['gentleTouch', 'pickup', 'companion'],
    rock: ['companion', 'finisher'],
    ghost: ['mindsEye', 'opener'],
    dragon: ['opener', 'finisher'],
    dark: ['payDay', 'pickup', 'finisher'],
    steel: ['mindsEye', 'companion'],
    fairy: ['gentleTouch', 'fieldMedic'],
  },
  ultra: {
    normal: ['doubleReroll', 'amuletCoin', 'eggRush'],
    fire: ['raider', 'ultraSpeed'],
    water: ['leftovers', 'eggRush', 'doubleReroll'],
    grass: ['leftovers', 'eggRush'],
    electric: ['ultraSpeed', 'reroller'],
    ice: ['sturdy', 'mirror'],
    fighting: ['raider', 'sturdy'],
    poison: ['leftovers', 'reroller'],
    ground: ['sturdy', 'raider'],
    flying: ['ultraSpeed', 'raider'],
    psychic: ['reroller', 'mirror'],
    bug: ['reroller', 'ultraSpeed'],
    rock: ['sturdy', 'raider'],
    ghost: ['mirror', 'reroller'],
    dragon: ['mirror', 'raider'],
    dark: ['amuletCoin', 'reroller'],
    steel: ['sturdy', 'reroller'],
    fairy: ['eggRush', 'mirror'],
  },
}

/** Picked by hand, by the family's lowest dex: each fits its family's rarity but Meowth's (Pay Day is its move). */
const BY_HAND: Record<number, TalentKey> = {
  1: 'leftovers', // Bulbasaur
  4: 'raider', // Charmander
  7: 'sturdy', // Squirtle
  10: 'daycareDarling', // Caterpie
  16: 'quick', // Pidgey
  19: 'extraReroll', // Rattata
  25: 'opener', // Pikachu (Pichu, Raichu)
  52: 'payDay', // Meowth
  63: 'mindsEye', // Abra
  113: 'eggRush', // Chansey
  129: 'doubleReroll', // Magikarp
  132: 'daycareDarling', // Ditto
  133: 'companion', // Eevee
  143: 'leftovers', // Snorlax (and Munchlax)
  147: 'mirror', // Dratini
  150: 'reroller', // Mewtwo
  151: 'mirror', // Mew
  246: 'raider', // Larvitar
  263: 'pickup', // Zigzagoon
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
  const tiers: Record<string, number> = {}
  for (const root of roots) {
    const members = familyMembers(data, root)
    const plain = members.filter((m) => !m.form)
    const strongest = [...(plain.length ? plain : members)].sort((a, b) => bst(b) - bst(a))[0]!
    const top = bst(strongest)
    const tier: TalentTier =
      members.some((m) => data.eggGroups[m.dex]?.l === 1 || strong.has(m.dex)) ||
      isStarterFamily(data, root) ||
      top >= ULTRA_AT
        ? 'ultra'
        : top >= RARE_AT
          ? 'rare'
          : 'common'
    const list = LISTS[tier][strongest.type1]
    const talent = BY_HAND[root] ?? list[root % list.length]!
    families[String(root)] = talent
    tally[talent] = (tally[talent] ?? 0) + 1
    tiers[talentTier(talent)] = (tiers[talentTier(talent)] ?? 0) + 1
  }
  await writeFile(
    path.join(ROOT, 'src', 'data', 'talents.json'),
    JSON.stringify({ families }, null, 1) + '\n',
  )
  console.log(`✓ src/data/talents.json — ${roots.length} families: ${JSON.stringify(tiers)}`)
  console.log(
    Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(' · '),
  )
}

void main()
