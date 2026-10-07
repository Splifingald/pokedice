// Pokémon forms: the regional forms, the Mega Evolutions and the battle forms of Giratina and Arceus, as the content
// `pnpm seed-forms` (scripts/seed-forms.ts) writes into the bundle. Ids are PokeAPI's `pokemon.csv` ids, which is
// also where the sprites and the names live; Arceus's types have no PokeAPI pokemon id, so they get 20001+ here.
import type { Evolution, PokeType, RegionId } from '../src/engine/types'

export interface RegionalFormPlan {
  id: number
  of: number
  region: RegionId
  /** The form's own evolutions (into another form or a new species). */
  evolutions: Evolution[]
}

const lv = (toDex: number, level: number): Evolution => ({ toDex, level })
const stone = (toDex: number, item: string): Evolution => ({ toDex, level: null, item })

/**
 * Every Alolan, Galarian, Hisuian and Paldean form. Hisui's forms belong to Galar: Galar's league opens the Space-Time
 * Rift, this game's way into Hisui (content-galar.ts), and that is where they are caught.
 */
export const REGIONAL_FORMS: RegionalFormPlan[] = [
  // ---- Alola
  { id: 10091, of: 19, region: 'alola', evolutions: [lv(10092, 20)] }, // Rattata
  { id: 10092, of: 20, region: 'alola', evolutions: [] }, // Raticate
  { id: 10100, of: 26, region: 'alola', evolutions: [] }, // Raichu (Pikachu + Thunder Stone in Alola)
  { id: 10101, of: 27, region: 'alola', evolutions: [stone(10102, 'ice-stone')] }, // Sandshrew
  { id: 10102, of: 28, region: 'alola', evolutions: [] }, // Sandslash
  { id: 10103, of: 37, region: 'alola', evolutions: [stone(10104, 'ice-stone')] }, // Vulpix
  { id: 10104, of: 38, region: 'alola', evolutions: [] }, // Ninetales
  { id: 10105, of: 50, region: 'alola', evolutions: [lv(10106, 26)] }, // Diglett
  { id: 10106, of: 51, region: 'alola', evolutions: [] }, // Dugtrio
  { id: 10107, of: 52, region: 'alola', evolutions: [lv(10108, 28)] }, // Meowth
  { id: 10108, of: 53, region: 'alola', evolutions: [] }, // Persian
  { id: 10109, of: 74, region: 'alola', evolutions: [lv(10110, 25)] }, // Geodude
  { id: 10110, of: 75, region: 'alola', evolutions: [lv(10111, 34)] }, // Graveler
  { id: 10111, of: 76, region: 'alola', evolutions: [] }, // Golem
  { id: 10112, of: 88, region: 'alola', evolutions: [lv(10113, 38)] }, // Grimer
  { id: 10113, of: 89, region: 'alola', evolutions: [] }, // Muk
  { id: 10114, of: 103, region: 'alola', evolutions: [] }, // Exeggutor (Exeggcute + Leaf Stone in Alola)
  { id: 10115, of: 105, region: 'alola', evolutions: [] }, // Marowak (Cubone in Alola)
  // ---- Galar
  { id: 10161, of: 52, region: 'galar', evolutions: [lv(863, 28)] }, // Meowth → Perrserker
  { id: 10162, of: 77, region: 'galar', evolutions: [lv(10163, 40)] }, // Ponyta
  { id: 10163, of: 78, region: 'galar', evolutions: [] }, // Rapidash
  { id: 10164, of: 79, region: 'galar', evolutions: [stone(10165, 'galarica-cuff'), stone(10172, 'galarica-wreath')] }, // Slowpoke
  { id: 10165, of: 80, region: 'galar', evolutions: [] }, // Slowbro
  { id: 10172, of: 199, region: 'galar', evolutions: [] }, // Slowking
  { id: 10166, of: 83, region: 'galar', evolutions: [lv(865, 30)] }, // Farfetch'd → Sirfetch'd
  { id: 10167, of: 110, region: 'galar', evolutions: [] }, // Weezing (Koffing in Galar)
  { id: 10168, of: 122, region: 'galar', evolutions: [lv(866, 42)] }, // Mr. Mime → Mr. Rime (Mime Jr. in Galar)
  { id: 10169, of: 144, region: 'galar', evolutions: [] }, // Articuno
  { id: 10170, of: 145, region: 'galar', evolutions: [] }, // Zapdos
  { id: 10171, of: 146, region: 'galar', evolutions: [] }, // Moltres
  { id: 10173, of: 222, region: 'galar', evolutions: [lv(864, 38)] }, // Corsola → Cursola
  { id: 10174, of: 263, region: 'galar', evolutions: [lv(10175, 20)] }, // Zigzagoon
  { id: 10175, of: 264, region: 'galar', evolutions: [lv(862, 35)] }, // Linoone → Obstagoon
  { id: 10176, of: 554, region: 'galar', evolutions: [stone(10177, 'ice-stone')] }, // Darumaka
  { id: 10177, of: 555, region: 'galar', evolutions: [] }, // Darmanitan
  { id: 10179, of: 562, region: 'galar', evolutions: [lv(867, 34)] }, // Yamask → Runerigus
  { id: 10180, of: 618, region: 'galar', evolutions: [] }, // Stunfisk
  // ---- Hisui (in Galar's Space-Time Rift)
  { id: 10229, of: 58, region: 'galar', evolutions: [stone(10230, 'fire-stone')] }, // Growlithe
  { id: 10230, of: 59, region: 'galar', evolutions: [] }, // Arcanine
  { id: 10231, of: 100, region: 'galar', evolutions: [stone(10232, 'leaf-stone')] }, // Voltorb
  { id: 10232, of: 101, region: 'galar', evolutions: [] }, // Electrode
  { id: 10233, of: 157, region: 'galar', evolutions: [] }, // Typhlosion (Quilava in Galar)
  { id: 10234, of: 211, region: 'galar', evolutions: [lv(904, 30)] }, // Qwilfish → Overqwil
  { id: 10235, of: 215, region: 'galar', evolutions: [lv(903, 40)] }, // Sneasel → Sneasler
  { id: 10236, of: 503, region: 'galar', evolutions: [] }, // Samurott (Dewott in Galar)
  { id: 10237, of: 549, region: 'galar', evolutions: [] }, // Lilligant (Petilil + Sun Stone in Galar)
  { id: 10238, of: 570, region: 'galar', evolutions: [lv(10239, 30)] }, // Zorua
  { id: 10239, of: 571, region: 'galar', evolutions: [] }, // Zoroark
  { id: 10240, of: 628, region: 'galar', evolutions: [] }, // Braviary (Rufflet in Galar)
  { id: 10241, of: 705, region: 'galar', evolutions: [lv(10242, 50)] }, // Sliggoo (Goomy in Galar)
  { id: 10242, of: 706, region: 'galar', evolutions: [] }, // Goodra
  { id: 10243, of: 713, region: 'galar', evolutions: [] }, // Avalugg (Bergmite in Galar, a branch)
  { id: 10244, of: 724, region: 'galar', evolutions: [] }, // Decidueye (Dartrix in Galar)
  // ---- Paldea
  { id: 10250, of: 128, region: 'paldea', evolutions: [] }, // Tauros, Combat Breed
  { id: 10251, of: 128, region: 'paldea', evolutions: [] }, // Tauros, Blaze Breed
  { id: 10252, of: 128, region: 'paldea', evolutions: [] }, // Tauros, Aqua Breed
  { id: 10253, of: 194, region: 'paldea', evolutions: [lv(980, 20)] }, // Wooper → Clodsire
]

/**
 * The evolutions of plain species, rewritten for the regional forms. `[dex, evolutions]` replaces that species' whole
 * list. A regional evolution (`region`) happens only there, and the one it stands in for (`notInRegion`) happens
 * everywhere else. The form evolutions that used to be grafted onto the plain species (Meowth → Perrserker,
 * Farfetch'd → Sirfetch'd …) now come from the regional form, as in the games.
 */
export const BASE_EVOLUTIONS: [dex: number, evolutions: Evolution[]][] = [
  // Alola: evolving there gives the Alolan form.
  [25, [{ ...stone(26, 'thunder-stone'), notInRegion: 'alola' }, { ...stone(10100, 'thunder-stone'), region: 'alola' }]],
  [102, [{ ...stone(103, 'leaf-stone'), notInRegion: 'alola' }, { ...stone(10114, 'leaf-stone'), region: 'alola' }]],
  [104, [{ ...lv(105, 28), notInRegion: 'alola' }, { ...lv(10115, 28), region: 'alola' }]],
  // Galar.
  [109, [{ ...lv(110, 35), notInRegion: 'galar' }, { ...lv(10167, 35), region: 'galar' }]],
  [439, [{ ...lv(122, 30), notInRegion: 'galar' }, { ...lv(10168, 30), region: 'galar' }]],
  // Hisui, through Galar's Space-Time Rift.
  [156, [{ ...lv(157, 36), notInRegion: 'galar' }, { ...lv(10233, 36), region: 'galar' }]],
  [502, [{ ...lv(503, 36), notInRegion: 'galar' }, { ...lv(10236, 36), region: 'galar' }]],
  [723, [{ ...lv(724, 34), notInRegion: 'galar' }, { ...lv(10244, 34), region: 'galar' }]],
  [548, [{ ...stone(549, 'sun-stone'), notInRegion: 'galar' }, { ...stone(10237, 'sun-stone'), region: 'galar' }]],
  [627, [{ ...lv(628, 54), notInRegion: 'galar' }, { ...lv(10240, 54), region: 'galar' }]],
  [704, [{ ...lv(705, 40), notInRegion: 'galar' }, { ...lv(10241, 40), region: 'galar' }]],
  // Bergmite lives on Galar's Route 9 as itself: there it becomes either Avalugg, the one not caught yet first.
  [712, [lv(713, 37), { ...lv(10243, 37), region: 'galar' }]],
  // The grafts, now on the forms.
  [52, [lv(53, 28)]],
  [83, []],
  [122, []],
  [222, []],
  [264, []],
  [562, [lv(563, 34)]],
  [211, []],
  [215, [stone(461, 'razor-claw')]],
  [194, [lv(195, 20)]],
]

/**
 * Mega Evolutions left out: a second gender or pattern of a species the game has as one — and Mega Zygarde, which
 * PokeAPI has no sprite for yet.
 */
export const MEGA_SKIPPED = new Set([
  'meowstic-female-mega',
  'tatsugiri-droopy-mega',
  'tatsugiri-stretchy-mega',
  'magearna-original-mega',
  'zygarde-mega',
])

/** Giratina's Origin Forme: below half HP, one Ghost die becomes a Dragon die. */
export const GIRATINA_ORIGIN = { id: 10007, of: 487, from: 'ghost', to: 'dragon' } as const

/** Arceus's types, as battle forms (PokeAPI sprite `493-<type>.png`). Plain Arceus (#493) is its Normal type. */
export const ARCEUS = 493
export const ARCEUS_TYPES: PokeType[] = [
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]
export const arceusFormId = (type: PokeType) => 20001 + ARCEUS_TYPES.indexOf(type)

/**
 * Wild pools: [area name, from dex, to dex] — the plain species replaced by its form (same weight and levels). Area
 * names match with any apostrophe (’ or ').
 */
export const WILD_REPLACE: [area: string, from: number, to: number][] = [
  // Alola: Alola's own forms, as in Sun and Moon.
  ['Route 1 & Hau’oli Outskirts', 19, 10091],
  ['Hau’oli City & the Cemetery', 52, 10107],
  ['Hau’oli City & the Cemetery', 88, 10112],
  ['Route 2 & the Verdant Cavern', 50, 10105],
  ['Memorial Hill, Akala Outskirts & Konikoni City', 50, 10105],
  ['Malie City & Malie Garden', 88, 10112],
  ['Malie City & Malie Garden', 52, 10107],
  ['Routes 11 & 12 and Blush Mountain', 74, 10109],
  ['Routes 13 & 14, Haina Desert & Tapu Village', 51, 10106],
  ['Routes 13 & 14, Haina Desert & Tapu Village', 37, 10103],
  ['Routes 13 & 14, Haina Desert & Tapu Village', 27, 10101],
  ['Route 17 & Po Town', 75, 10110],
  ['Exeggutor Island & Vast Poni Canyon', 103, 10114],
  ['Exeggutor Island & Vast Poni Canyon', 51, 10106],
  ['Mount Lanakila', 27, 10101],
  ['Mount Lanakila', 37, 10103],
  // Galar: Galar's own forms, as in Sword and Shield.
  ['Wedgehurst & Route 2', 263, 10174],
  ['Route 4 & Turffield', 52, 10161],
  ['Route 5 & Hulbury', 83, 10166],
  ['Galar Mine No. 2 & Motostoke Stadium', 618, 10180],
  ['Hammerlocke & Route 6', 562, 10179],
  ['Stow-on-Side', 562, 10179],
  ['Glimwood Tangle & Ballonlea', 77, 10162],
  ['Steamdrift Way & Circhester', 554, 10176],
  ['Route 9 & Spikemuth', 222, 10173],
  ['Route 10 & Wyndon', 122, 10168],
  ['The Isle of Armor', 83, 10166],
  ['The Isle of Armor', 554, 10176],
  // Hisui, through the Space-Time Rift.
  ['The Space-Time Rift', 211, 10234],
  ['The Space-Time Rift', 215, 10235],
  // Paldea.
  ['Los Platos & South Province (Area One)', 194, 10253],
]

/** Wild pools: [area name, dex, weight, min level, max level] added (the catch-alls keep their plain species too). */
export const WILD_ADD: [area: string, dex: number, weight: number, min: number, max: number][] = [
  // The Poké Pelago and the Max Lair are their regions' catch-alls: every form joins the plain species there.
  ...[10091, 10101, 10103, 10105, 10106, 10107, 10109, 10110, 10112, 10114].map(
    (d) => ['The Poké Pelago', d, 10, 60, 76] as [string, number, number, number, number],
  ),
  ...[10161, 10162, 10166, 10168, 10173, 10174, 10176, 10179, 10180, 10164].map(
    (d) => ['The Max Lair', d, 10, 60, 76] as [string, number, number, number, number],
  ),
  // Galarian Slowpoke on the Isle of Armor, with the Galarica Cuff and Wreath (loot below).
  ['The Isle of Armor', 10164, 8, 27, 29],
  // The Space-Time Rift: Hisui's forms, and the first stages of the lines that end in one.
  ['The Space-Time Rift', 10229, 8, 27, 29],
  ['The Space-Time Rift', 10231, 8, 27, 29],
  ['The Space-Time Rift', 10238, 6, 27, 29],
  ['The Space-Time Rift', 155, 4, 12, 14], // Cyndaquil
  ['The Space-Time Rift', 501, 4, 12, 14], // Oshawott
  ['The Space-Time Rift', 722, 4, 12, 14], // Rowlet
  ['The Space-Time Rift', 548, 6, 27, 29], // Petilil
  ['The Space-Time Rift', 627, 6, 27, 29], // Rufflet
  ['The Space-Time Rift', 704, 6, 27, 29], // Goomy
  ['The Space-Time Rift', 712, 6, 27, 29], // Bergmite
  // Paldea: the Tauros breeds where Tauros grazes, and Paldean Wooper in the Terarium beside the other.
  ['West Province (Area Two) & Medali', 10250, 2, 30, 35],
  ['West Province (Area Two) & Medali', 10251, 2, 30, 35],
  ['West Province (Area Two) & Medali', 10252, 2, 30, 35],
  ['The Terarium', 10253, 10, 60, 80],
  // Sneasler kept a way in: Hisuian Sneasel, where Paldea's Sneasel used to become one.
  ['The Terarium', 10235, 4, 60, 80],
  ['The Terarium', 10250, 1, 60, 80],
  ['The Terarium', 10251, 1, 60, 80],
  ['The Terarium', 10252, 1, 60, 80],
]

/**
 * Wild pool rows turned off (weight 0) where the three Paldean breeds take a plain Tauros's place, as in Scarlet and
 * Violet. Weight 0 rather than removed, so seed.sql — which only ever upserts — carries the change to a live database.
 */
export const WILD_OFF: [area: string, dex: number][] = [['West Province (Area Two) & Medali', 128]]

/** Once-only finds: [area name, item key]. */
export const LOOT_ADD: [area: string, item: string][] = [
  ['The Isle of Armor', 'galarica-cuff'],
  ['The Isle of Armor', 'galarica-wreath'],
  ['Steamdrift Way & Circhester', 'ice-stone'],
  ['The Space-Time Rift', 'sun-stone'],
]

/** Trainer Pokémon that are regional forms in their own games: [region, from dex, to dex], for every trainer there. */
export const TRAINER_REPLACE: [region: RegionId, from: number, to: number][] = [
  ['alola', 19, 10091],
  ['alola', 20, 10092],
  ['alola', 26, 10100],
  ['alola', 52, 10107],
  ['alola', 53, 10108],
  ['alola', 76, 10111],
  ['alola', 88, 10112],
  ['alola', 89, 10113],
  ['alola', 38, 10104],
  ['alola', 103, 10114],
  ['alola', 105, 10115],
  ['galar', 263, 10174],
  ['galar', 562, 10179],
  ['galar', 110, 10167],
  ['galar', 78, 10163],
  ['galar', 80, 10165],
  ['galar', 199, 10172],
  ['paldea', 128, 10250],
]

/** Names PokeAPI spells with its own form label ("Standard Galarian Darmanitan"): [id, lang, name]. */
export const NAME_FIXES: [id: number, lang: string, name: string][] = [
  [10177, 'en', 'Galarian Darmanitan'],
  [10177, 'fr', 'Darumacho de Galar'],
]

/** The Galarian legendary birds' secret area, after the Crown Tundra. */
export const BIRDS_AREA = {
  name: 'Dyna Tree Hill',
  orderIndex: 858,
  afterArea: 'The Crown Tundra',
  bosses: [10169, 10170, 10171],
  level: 70,
  pokedex: 173,
  maxLevel: 70,
}
