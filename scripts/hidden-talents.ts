/**
 * pnpm talents — writes src/data/talents.json: one hidden talent per evolution family (docs/51), keyed by the family's
 * lowest dex. The admin can pick another for any family (Config → Hidden talents); this is the starting assignment.
 *
 * Three rarities (the user's calls, 2026-10-30), by the family's strength: its strongest plain member's base stat total
 * (Megas and other forms left out). **Ultra**: a legendary or mythical, a starter line, a pseudo-legendary, an Ultra
 * Beast or Paradox Pokémon, or `ULTRA_AT`+; **rare**: `RARE_AT`+; **common**: the rest. Within its rarity, the family's
 * strongest member's first type picks from a short list (by the family's dex, so neighbours differ): names that say a
 * type go to it (Static to Electric, Poison Heal to Poison). Legendaries get Pressure or Fours Pro first. A few families
 * get, by hand, the ability they have in the games; Ditto gets Imposter, its unique talent.
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

const LISTS: Record<'common' | 'rare' | 'ultra', Record<PokeType, TalentKey[]>> = {
  common: {
    normal: ['extraReroll', 'limber', 'daycareDarling', 'technician'],
    fire: ['flameHeal', 'magmaArmor', 'quick'],
    water: ['thickHide', 'daycareDarling', 'roughSkin'],
    grass: ['daycareDarling', 'shedSkin', 'thickHide'],
    electric: ['static', 'quick'],
    ice: ['thickHide', 'extraReroll'],
    fighting: ['limber', 'technician'],
    poison: ['poisonHeal', 'shedSkin'],
    ground: ['roughSkin', 'thickHide'],
    flying: ['quick', 'extraReroll'],
    psychic: ['extraReroll', 'technician'],
    bug: ['shedSkin', 'technician', 'daycareDarling'],
    rock: ['magmaArmor', 'roughSkin'],
    ghost: ['extraReroll', 'quick'],
    dragon: ['roughSkin', 'shedSkin'],
    dark: ['technician', 'quick'],
    steel: ['thickHide', 'magmaArmor'],
    fairy: ['daycareDarling', 'extraReroll'],
  },
  rare: {
    normal: ['pickup', 'payDay', 'falseSwipe', 'triplePro', 'friendGuard'],
    fire: ['opener', 'guts', 'triplePro'],
    water: ['shellBell', 'naturalCure', 'regenerator'],
    grass: ['regenerator', 'naturalCure'],
    electric: ['opener', 'powerSpot'],
    ice: ['finisher', 'triplePro'],
    fighting: ['guts', 'finisher', 'intimidate'],
    poison: ['naturalCure', 'finisher'],
    ground: ['intimidate', 'powerSpot'],
    flying: ['opener', 'intimidate'],
    psychic: ['mindsEye', 'friendGuard'],
    bug: ['falseSwipe', 'pickup', 'triplePro'],
    rock: ['powerSpot', 'finisher'],
    ghost: ['disguise', 'mindsEye'],
    dragon: ['intimidate', 'opener'],
    dark: ['payDay', 'intimidate', 'pickup'],
    steel: ['mindsEye', 'powerSpot'],
    fairy: ['friendGuard', 'falseSwipe'],
  },
  ultra: {
    normal: ['skillLink', 'amuletCoin', 'doubleReroll'],
    fire: ['flameBody', 'raider'],
    water: ['leftovers', 'doubleReroll'],
    grass: ['leftovers', 'skillLink'],
    electric: ['ultraSpeed', 'reroller'],
    ice: ['sturdy', 'mirror'],
    fighting: ['raider', 'skillLink'],
    poison: ['magicGuard', 'leftovers'],
    ground: ['sturdy', 'raider'],
    flying: ['ultraSpeed', 'raider'],
    psychic: ['magicGuard', 'reroller'],
    bug: ['skillLink', 'ultraSpeed'],
    rock: ['sturdy', 'raider'],
    ghost: ['mirror', 'magicGuard'],
    dragon: ['mirror', 'raider'],
    dark: ['amuletCoin', 'reroller'],
    steel: ['sturdy', 'reroller'],
    fairy: ['magicGuard', 'mirror'],
  },
}

/** Legendaries and mythicals: Pressure (their signature ability in the games) and Fours Pro come first. */
const LEGEND: TalentKey[] = ['pressure', 'foursPro']

/**
 * Picked by hand, by the family's lowest dex: mostly the ability the family has in the games (Pikachu's Static,
 * Mimikyu's Disguise, Ditto's Imposter…), whatever its rarity.
 */
const BY_HAND: Record<number, TalentKey> = {
  1: 'leftovers', // Bulbasaur
  4: 'raider', // Charmander
  7: 'sturdy', // Squirtle
  10: 'shedSkin', // Caterpie
  16: 'quick', // Pidgey
  19: 'extraReroll', // Rattata
  25: 'static', // Pikachu (Pichu, Raichu)
  52: 'payDay', // Meowth
  58: 'intimidate', // Growlithe
  63: 'magicGuard', // Abra
  66: 'guts', // Machop
  74: 'sturdy', // Geodude
  79: 'regenerator', // Slowpoke
  113: 'naturalCure', // Chansey
  120: 'naturalCure', // Staryu
  129: 'doubleReroll', // Magikarp
  132: 'imposter', // Ditto
  133: 'powerSpot', // Eevee
  143: 'leftovers', // Snorlax (and Munchlax)
  147: 'mirror', // Dratini
  150: 'pressure', // Mewtwo
  151: 'mirror', // Mew
  246: 'raider', // Larvitar
  263: 'pickup', // Zigzagoon
  285: 'poisonHeal', // Shroomish
  778: 'disguise', // Mimikyu
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
    const tier: Exclude<TalentTier, 'unique'> =
      members.some((m) => data.eggGroups[m.dex]?.l === 1 || strong.has(m.dex)) ||
      isStarterFamily(data, root) ||
      top >= ULTRA_AT
        ? 'ultra'
        : top >= RARE_AT
          ? 'rare'
          : 'common'
    const legend = members.some((m) => data.eggGroups[m.dex]?.l === 1)
    // A legendary can't breed: Flame Body's Eggs would do nothing for it.
    const list = legend
      ? [...LEGEND, ...LISTS.ultra[strongest.type1].filter((k) => k !== 'flameBody')]
      : LISTS[tier][strongest.type1]
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
