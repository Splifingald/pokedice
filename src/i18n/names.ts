// Turning the English content names in src/data/*.json into keys for the sheet. Shared with the
// node scripts, so nothing here may import the CSV.

/** `Routes 12–15` → `routes-12-15`. Stable enough to key a sheet row on. */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Trainer classes, longest first so `Ace Trainer` wins over a would-be `Ace`. A trainer is
 * `<class> <given name>`: the class is translated, the given name never is (same rule as Blue,
 * Red or Silver — a proper name stays a proper name).
 */
export const TRAINER_CLASSES = [
  'Team Rocket Grunt',
  'Rocket Executive',
  'Team Magma Grunt',
  'Team Aqua Grunt',
  'Dragon Tamer',
  'Firebreather',
  'Ruin Maniac',
  'Battle Girl',
  'Hex Maniac',
  'Triathlete',
  'Guitarist',
  'Ninja Boy',
  'Schoolboy',
  'Rich Boy',
  'Kindler',
  'Pokéfan',
  'Skier',
  'Twins',
  'Sage',
  'Lady',
  'Ace Trainer',
  'Bird Keeper',
  'Black Belt',
  'Bug Catcher',
  'Cue Ball',
  'Elite Four',
  'Rocket Boss',
  'Rocket Grunt',
  'Super Nerd',
  'Cooltrainer',
  'Pokémaniac',
  'Channeler',
  'Fisherman',
  'Gentleman',
  'Picnicker',
  'Scientist',
  'Youngster',
  'Champion',
  'Engineer',
  'Burglar',
  'Gambler',
  'Juggler',
  'Psychic',
  'Swimmer',
  'Beauty',
  'Camper',
  'Biker',
  'Hiker',
  'Rocker',
  'Sailor',
  'Tamer',
  'Lass',
  'Rival',
  // Sinnoh and Unova
  'Team Plasma Grunt',
  'Pokémon Breeder',
  'Galactic Grunt',
  'Pokémon Ranger',
  'Parasol Lady',
  'Preschooler',
  'Aroma Lady',
  'Backpacker',
  'School Kid',
  'Harlequin',
  'Roughneck',
  'Socialite',
  'Waitress',
  'Cyclist',
  'Veteran',
  'Artist',
  'Backers',
  'Dancer',
  'Jogger',
  'Worker',
  'Waiter',
  'Clerk',
  'Nurse',
  'Pilot',
  'Tuber',
  'Idol',
].sort((a, b) => b.length - a.length)

/** Splits `Bug Catcher Kent` into its class and its given name; a bare `Misty` has neither. */
export function splitTrainerName(name: string): { cls: string | null; given: string } {
  for (const cls of TRAINER_CLASSES) {
    if (name === cls) return { cls, given: '' }
    if (name.startsWith(cls + ' ')) return { cls, given: name.slice(cls.length + 1) }
  }
  return { cls: null, given: name }
}

/** `Aaron II` → `Aaron` + ` II`: a rematch is the same person, so it shares the name row. */
export function splitRematch(given: string): { base: string; suffix: string } {
  const m = / (II|III|IV)$/.exec(given)
  return m ? { base: given.slice(0, m.index), suffix: m[0] } : { base: given, suffix: '' }
}

export const pokemonKey = (dex: number) => `pokemon.${dex}`
export const itemKey = (key: string) => `item.${key}`
export const itemDescKey = (key: string) => `itemDesc.${key}`
export const areaKey = (name: string) => `area.${slug(name)}`
export const trainerClassKey = (cls: string) => `trainerClass.${slug(cls)}`
export const trainerNameKey = (given: string) => `trainerName.${slug(given)}`
