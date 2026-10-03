// Alola, in order of discovery, routed on Sun and Moon with Ultra Sun and Ultra Moon's additions. Same shape as
// content-kalos.ts.
//
// Wild pools are the games' own, read off PokeAPI's encounter tables (Sun, Moon, Ultra Sun, Ultra Moon merged). Alola
// mixes every generation on its routes; every Gen 7 species, or the first stage of its line, has a home outside the
// catch-all.
//
// The island challenge has twelve trials and grand trials, and the game counts eight badges (the foe upgrade level
// climbs one per badge, 1 → 9). So two per island hand over their Z-Crystal as the badge — the island's first trial and
// its kahuna's grand trial, and on Poni Mina's trial and Hapu's — and the other captains are fought without one, the
// way Striaton's first two brothers are. A captain's battle ends on the totem Pokémon of the trial, at its totem
// level. Teams over three keep the Gen 7 Pokémon first, then the highest levels (the user's rule).
import { area, DECK as W, type AreaPlan } from './content'

/** Alola's starters: Rowlet, Litten, Popplio. */
export const ALOLA_STARTERS = [722, 725, 728]

/**
 * The Pokédex gates of the secret areas, as plain counts of the Alola Pokédex: 35 % for the story's legendary
 * (Cosmog), 55 % for the Tapus and the Ultra Beasts, 70 % for a box legendary, 85 % for a mythical, of the 359
 * species catchable in Alola, counted when the region was built. tests/region-content.test.ts holds the floor.
 */
export const ALOLA_DEX = { story: 126, trio: 197, box: 251, mythical: 305 }

/** Alola areas sit at 701+, after Kalos's 601+. */
export const ALOLA_AREAS: AreaPlan[] = [
  // ---------------------------------------------------------------- Melemele Island
  area({
    key: 'al-route-1',
    name: "Route 1 & Hau'oli Outskirts",
    orderIndex: 701,
    banner: { scene: 'beach' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [731, 20, 2, 4], // Pikipek
      [734, 20, 2, 4], // Yungoos
      [19, 16, 2, 4], // Rattata
      [165, 10, 2, 4], // Ledyba
      [167, 10, 2, 4], // Spinarak
      [10, 10, 2, 4], // Caterpie
      [736, 6, 3, 5], // Grubbin
      [427, 4, 3, 5], // Buneary
      [172, 2, 3, 5], // Pichu
    ],
    trainers: [],
  }),
  area({
    key: 'al-hauoli',
    name: "Hau'oli City & the Cemetery",
    orderIndex: 702,
    banner: { scene: 'city' },
    roundsToClear: 2,
    minLevel: 4,
    maxLevel: 9,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [278, 14, 4, 8], // Wingull
      [81, 10, 5, 8], // Magnemite
      [52, 10, 5, 8], // Meowth
      [79, 8, 4, 7], // Slowpoke
      [88, 8, 5, 8], // Grimer
      [686, 8, 4, 7], // Inkay
      [63, 6, 5, 8], // Abra
      [607, 10, 6, 9], // Litwick
      [92, 8, 6, 9], // Gastly
      [425, 6, 6, 9], // Drifloon
      [570, 4, 5, 8], // Zorua
      [439, 4, 6, 9], // Mime Jr.
    ],
    trainers: [
      {
        name: 'Youngster Joey',
        team: [
          [734, 6],
          [731, 7],
        ],
      },
      {
        name: 'Lass Kimberly',
        team: [
          [165, 7],
          [278, 7],
        ],
      },
      { name: 'Hau', team: [[172, 8]] }, // Pichu
      {
        name: 'Team Skull Grunt',
        team: [
          [41, 8],
          [734, 8],
        ],
      }, // Zubat, Yungoos
    ],
  }),
  area({
    key: 'al-verdant-cavern',
    name: 'Route 2 & the Verdant Cavern',
    orderIndex: 703,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 6,
    maxLevel: 12,
    weights: W.mixed,
    tier: 1,
    wild: [
      [739, 14, 7, 11], // Crabrawler
      [296, 10, 7, 11], // Makuhita
      [96, 10, 7, 11], // Drowzee
      [23, 8, 7, 11], // Ekans
      [21, 8, 7, 10], // Spearow
      [742, 8, 7, 10], // Cutiefly
      [58, 6, 7, 10], // Growlithe
      [235, 4, 7, 10], // Smeargle
      [206, 4, 8, 11], // Dunsparce
      [41, 10, 8, 11], // Zubat
      [50, 8, 8, 11], // Diglett
      [714, 4, 8, 11], // Noibat
    ],
    trainers: [
      {
        name: 'Trial Guide Oscar',
        team: [
          [734, 10],
          [19, 10],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [96, 10],
          [23, 10],
        ],
      }, // Drowzee, Ekans
      {
        name: 'Team Skull Grunt',
        team: [
          [41, 10],
          [19, 11],
        ],
      }, // Zubat, Rattata
      {
        name: 'Hau',
        team: [
          [172, 10],
          [133, 10],
        ],
      }, // Pichu, Eevee
    ],
    gyms: [
      // Ilima's trial: three Pokémon rummaging in the cavern, then the Totem Gumshoos.
      {
        name: 'Captain Ilima',
        role: 'leader',
        badge: 'Normalium Z',
        specialty: 'normal',
        team: [
          [734, 10],
          [235, 11],
          [735, 12],
        ],
      }, // Yungoos, Smeargle, Gumshoos
    ],
  }),
  area({
    key: 'al-melemele-meadow',
    name: 'Route 3 & Melemele Meadow',
    orderIndex: 704,
    banner: { scene: 'flowers' },
    roundsToClear: 1,
    minLevel: 9,
    maxLevel: 14,
    weights: W.mixed,
    tier: 1,
    wild: [
      [741, 12, 9, 12], // Oricorio
      [742, 12, 9, 12], // Cutiefly
      [21, 12, 9, 13], // Spearow
      [56, 10, 9, 12], // Mankey
      [629, 6, 10, 13], // Vullaby
      [627, 6, 10, 13], // Rufflet
      [701, 4, 9, 12], // Hawlucha
      [548, 6, 9, 12], // Petilil
      [546, 6, 9, 12], // Cottonee
      [669, 6, 9, 12], // Flabébé
      [12, 6, 10, 12], // Butterfree
      [371, 2, 9, 12], // Bagon
    ],
    trainers: [
      {
        name: 'Team Skull Grunt',
        team: [
          [56, 12],
          [41, 12],
        ],
      }, // Mankey, Zubat
      {
        name: 'Team Skull Grunt',
        team: [
          [734, 12],
          [23, 12],
        ],
      }, // Yungoos, Ekans
      {
        name: 'Rising Star Taylor',
        team: [
          [742, 12],
          [741, 12],
        ],
      },
      {
        name: 'Gladion',
        team: [
          [41, 13],
          [772, 14],
        ],
      }, // Zubat, Type: Null
    ],
  }),
  area({
    key: 'al-ten-carat-hill',
    name: "Ten Carat Hill & Kala'e Bay",
    orderIndex: 705,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 10,
    maxLevel: 15,
    weights: W.mixed,
    tier: 1,
    wild: [
      [744, 12, 10, 14], // Rockruff
      [524, 10, 10, 14], // Roggenrola
      [703, 8, 10, 14], // Carbink
      [66, 8, 10, 14], // Machop
      [327, 8, 10, 14], // Spinda
      [302, 4, 11, 14], // Sableye
      [303, 4, 11, 14], // Mawile
      [116, 10, 11, 15], // Horsea
      [90, 8, 11, 15], // Shellder
      [86, 6, 11, 15], // Seel
      [238, 6, 10, 14], // Smoochum
      [225, 6, 10, 14], // Delibird
    ],
    trainers: [
      {
        name: 'Hiker Wesley',
        team: [
          [524, 13],
          [66, 13],
        ],
      },
      {
        name: 'Swimmer Kai',
        team: [
          [116, 13],
          [90, 13],
        ],
      },
      {
        name: 'Fisherman Russell',
        team: [
          [129, 13],
          [86, 14],
        ],
      },
    ],
  }),
  area({
    key: 'al-iki-town',
    name: 'Route 1 South & Iki Town',
    orderIndex: 706,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 11,
    maxLevel: 16,
    weights: W.mixed,
    tier: 2,
    wild: [
      [438, 12, 11, 14], // Bonsly
      [446, 8, 11, 14], // Munchlax
      [744, 10, 11, 14], // Rockruff
      [731, 10, 11, 13], // Pikipek
      [734, 10, 11, 14], // Yungoos
      [440, 6, 11, 14], // Happiny
      [185, 6, 11, 14], // Sudowoodo
      [736, 8, 11, 14], // Grubbin
      [143, 2, 13, 15], // Snorlax
    ],
    trainers: [
      {
        name: 'Youngster Tyler',
        team: [
          [732, 14],
          [744, 14],
        ],
      },
      {
        name: 'Lass Ellen',
        team: [
          [742, 14],
          [741, 14],
        ],
      },
      {
        name: 'Hau',
        team: [
          [172, 14],
          [133, 14],
        ],
      }, // Pichu, Eevee
    ],
    gyms: [
      {
        name: 'Kahuna Hala',
        role: 'leader',
        badge: 'Fightinium Z',
        specialty: 'fighting',
        team: [
          [56, 15],
          [296, 15],
          [739, 16],
        ],
      }, // Mankey, Makuhita, Crabrawler
    ],
  }),

  // ---------------------------------------------------------------- Akala Island
  area({
    key: 'al-heahea',
    name: 'Heahea City & Routes 4–6',
    orderIndex: 707,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 18,
    weights: W.mixed,
    tier: 2,
    wild: [
      [749, 12, 13, 17], // Mudbray
      [506, 12, 13, 15], // Lillipup
      [731, 10, 13, 13], // Pikipek
      [133, 6, 13, 17], // Eevee
      [174, 6, 13, 17], // Igglybuff
      [736, 8, 13, 17], // Grubbin
      [440, 6, 13, 17], // Happiny
      [741, 8, 14, 17], // Oricorio
      [128, 6, 13, 17], // Tauros
      [241, 6, 13, 17], // Miltank
      [179, 6, 12, 14], // Mareep
      [761, 8, 14, 17], // Bounsweet
    ],
    trainers: [
      {
        name: 'Rising Star Leah',
        team: [
          [749, 16],
          [506, 16],
        ],
      },
      {
        name: 'Preschooler Lilly',
        team: [
          [174, 15],
          [133, 15],
        ],
      },
      {
        name: 'Hiker Calhoun',
        team: [
          [749, 16],
          [524, 16],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [19, 16],
          [88, 16],
        ],
      }, // Rattata, Grimer
    ],
  }),
  area({
    key: 'al-brooklet-hill',
    name: 'Brooklet Hill',
    orderIndex: 708,
    banner: { scene: 'swamp', flip: true },
    roundsToClear: 1,
    minLevel: 14,
    maxLevel: 20,
    weights: W.mixed,
    tier: 2,
    wild: [
      [751, 12, 14, 17], // Dewpider
      [746, 10, 14, 20], // Wishiwashi
      [60, 10, 14, 17], // Poliwag
      [283, 10, 14, 17], // Surskit
      [54, 8, 14, 17], // Psyduck
      [755, 8, 14, 17], // Morelull
      [46, 6, 14, 17], // Paras
      [118, 8, 14, 20], // Goldeen
      [550, 6, 14, 20], // Basculin
      [594, 4, 16, 20], // Alomomola
      [349, 2, 14, 20], // Feebas
    ],
    trainers: [
      {
        name: 'Fisherman Edmond',
        team: [
          [118, 18],
          [746, 18],
        ],
      },
      {
        name: 'Swimmer Lucy',
        team: [
          [60, 18],
          [283, 18],
        ],
      },
      {
        name: 'Trial Guide Ewan',
        team: [
          [751, 18],
          [54, 18],
        ],
      },
    ],
    gyms: [
      // Lana's trial: the Totem Wishiwashi in its school form.
      {
        name: 'Captain Lana',
        role: 'leader',
        badge: 'Waterium Z',
        specialty: 'water',
        team: [
          [751, 18],
          [594, 19],
          [746, 20],
        ],
      }, // Dewpider, Alomomola, Wishiwashi
    ],
  }),
  area({
    key: 'al-wela-volcano',
    name: 'Routes 7 & 8 and Wela Volcano Park',
    orderIndex: 709,
    banner: { scene: 'volcano' },
    roundsToClear: 1,
    minLevel: 16,
    maxLevel: 22,
    weights: W.mixed,
    tier: 2,
    wild: [
      [757, 12, 16, 20], // Salandit
      [767, 10, 17, 20], // Wimpod
      [759, 8, 17, 20], // Stufful
      [732, 8, 17, 20], // Trumbeak
      [661, 8, 16, 16], // Fletchling
      [104, 8, 16, 19], // Cubone
      [115, 4, 16, 19], // Kangaskhan
      [240, 6, 16, 19], // Magby
      [771, 8, 16, 19], // Pyukumuku
      [120, 6, 16, 19], // Staryu
      [456, 6, 16, 19], // Finneon
      [170, 6, 16, 20], // Chinchou
    ],
    trainers: [
      {
        name: 'Firefighter Ernest',
        team: [
          [661, 19],
          [757, 19],
        ],
      },
      {
        name: 'Surfer Kalani',
        team: [
          [771, 19],
          [120, 19],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [757, 20],
          [41, 20],
        ],
      }, // Salandit, Zubat
    ],
    gyms: [
      // Kiawe's trial on the volcano: the Totem Salazzle, ringed by Salandit.
      {
        name: 'Captain Kiawe',
        role: 'leader',
        specialty: 'fire',
        team: [
          [757, 20],
          [662, 21],
          [758, 22],
        ],
      }, // Salandit, Fletchinder, Salazzle
    ],
  }),
  area({
    key: 'al-lush-jungle',
    name: 'Lush Jungle',
    orderIndex: 710,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 18,
    maxLevel: 24,
    weights: W.mixed,
    tier: 2,
    wild: [
      [753, 14, 18, 22], // Fomantis
      [762, 10, 19, 22], // Steenee
      [761, 8, 16, 17], // Bounsweet
      [732, 10, 18, 22], // Trumbeak
      [764, 6, 18, 22], // Comfey
      [765, 4, 18, 22], // Oranguru
      [766, 4, 18, 22], // Passimian
      [755, 6, 18, 22], // Morelull
      [704, 4, 18, 22], // Goomy
      [163, 6, 19, 19], // Hoothoot
      [438, 6, 18, 22], // Bonsly
      [127, 2, 19, 22], // Pinsir
    ],
    trainers: [
      {
        name: 'Pokémon Breeder Mercy',
        team: [
          [761, 21],
          [764, 21],
        ],
      },
      {
        name: 'Trial Guide Kent',
        team: [
          [732, 21],
          [753, 21],
        ],
      },
      {
        name: 'Hau',
        team: [
          [25, 22],
          [133, 21],
          [714, 21],
        ],
      }, // Pikachu, Eevee, Noibat
    ],
    gyms: [
      {
        name: 'Captain Mallow',
        role: 'leader',
        specialty: 'grass',
        team: [
          [732, 22],
          [753, 22],
          [754, 24],
        ],
      }, // Trumbeak, Fomantis, Lurantis
    ],
  }),
  area({
    key: 'al-konikoni',
    name: 'Memorial Hill, Akala Outskirts & Konikoni City',
    orderIndex: 711,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 19,
    maxLevel: 27,
    weights: W.mixed,
    tier: 3,
    wild: [
      [679, 12, 20, 24], // Honedge
      [759, 8, 20, 24], // Stufful
      [747, 10, 20, 23], // Mareanie
      [92, 10, 20, 24], // Gastly
      [708, 8, 20, 24], // Phantump
      [41, 8, 19, 21], // Zubat
      [50, 8, 19, 23], // Diglett
      [299, 6, 20, 24], // Nosepass
      [177, 6, 21, 24], // Natu
      [222, 6, 20, 23], // Corsola
      [370, 6, 20, 23], // Luvdisc
      [246, 2, 20, 23], // Larvitar
    ],
    trainers: [
      {
        name: 'Team Skull Grunt',
        team: [
          [747, 24],
          [92, 24],
        ],
      }, // Mareanie, Gastly
      {
        name: 'Team Skull Grunt',
        team: [
          [41, 24],
          [88, 25],
        ],
      }, // Zubat, Grimer
      {
        name: 'Beauty Nicole',
        team: [
          [222, 24],
          [370, 24],
        ],
      },
      {
        name: 'Plumeria',
        team: [
          [42, 25],
          [758, 26],
        ],
      }, // Golbat, Salazzle
    ],
    gyms: [
      {
        name: 'Kahuna Olivia',
        role: 'leader',
        badge: 'Rockium Z',
        specialty: 'rock',
        team: [
          [299, 26],
          [525, 26],
          [745, 27],
        ],
      }, // Nosepass, Boldore, Lycanroc
    ],
  }),
  area({
    key: 'al-aether-house',
    name: 'Hano Beach & Aether Paradise',
    orderIndex: 712,
    banner: { scene: 'beach', flip: true },
    roundsToClear: 1,
    minLevel: 21,
    maxLevel: 28,
    weights: W.busy,
    tier: 3,
    // The first visit to Aether Paradise, with the beach of the Hano Grand Resort beside it.
    wild: [
      [769, 12, 21, 25], // Sandygast
      [771, 10, 21, 25], // Pyukumuku
      [72, 12, 21, 25], // Tentacool
      [120, 8, 21, 25], // Staryu
      [456, 8, 21, 25], // Finneon
      [278, 8, 21, 24], // Wingull
      [137, 2, 24, 27], // Porygon
    ],
    trainers: [
      {
        name: 'Aether Foundation Employee Jordan',
        team: [
          [81, 24],
          [137, 25],
        ],
      },
      {
        name: 'Aether Foundation Employee Rae',
        team: [
          [121, 25],
          [279, 25],
        ],
      },
      {
        name: 'Sightseer Mira',
        team: [
          [769, 25],
          [771, 25],
        ],
      },
      {
        name: 'Hau',
        team: [
          [25, 26],
          [134, 26],
          [714, 25],
        ],
      }, // Pikachu, Vaporeon, Noibat
    ],
  }),

  // ---------------------------------------------------------------- Ula'ula Island
  area({
    key: 'al-malie',
    name: 'Malie City & Malie Garden',
    orderIndex: 713,
    banner: { scene: 'city', flip: true },
    roundsToClear: 1,
    minLevel: 23,
    maxLevel: 29,
    weights: W.casino,
    tier: 3,
    // Malie's outer cape and its garden. Alola's closest thing to a Game Corner deck: its biggest city.
    wild: [
      [568, 10, 24, 28], // Trubbish
      [88, 10, 24, 28], // Grimer
      [81, 8, 24, 28], // Magnemite
      [572, 6, 25, 28], // Minccino
      [52, 8, 24, 27], // Meowth
      [60, 6, 24, 24], // Poliwag
      [54, 6, 24, 28], // Psyduck
      [284, 6, 24, 28], // Masquerain
      [752, 6, 24, 28], // Araquanid
      [166, 6, 24, 28], // Ledian
      [168, 6, 24, 28], // Ariados
    ],
    trainers: [
      {
        name: 'Office Worker Rob',
        team: [
          [81, 27],
          [52, 27],
        ],
      },
      {
        name: 'Golfer Nathaniel',
        team: [
          [284, 27],
          [752, 27],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [568, 27],
          [757, 27],
        ],
      }, // Trubbish, Salandit
    ],
  }),
  area({
    key: 'al-hokulani',
    name: 'Route 10 & Mount Hokulani',
    orderIndex: 714,
    banner: { scene: 'sky' },
    roundsToClear: 1,
    minLevel: 24,
    maxLevel: 30,
    weights: W.mixed,
    tier: 3,
    wild: [
      [774, 12, 25, 30], // Minior
      [739, 10, 24, 29], // Crabrawler
      [22, 10, 24, 29], // Fearow
      [227, 6, 24, 29], // Skarmory
      [605, 8, 27, 30], // Elgyem
      [173, 4, 25, 30], // Cleffa
      [374, 2, 18, 19], // Beldum
      [610, 6, 28, 30], // Axew
      [204, 6, 26, 29], // Pineco
      [132, 4, 25, 30], // Ditto
      [674, 6, 24, 29], // Pancham
    ],
    trainers: [
      {
        name: 'Scientist Hugh',
        team: [
          [81, 28],
          [605, 28],
        ],
      },
      {
        name: 'Ace Trainer Emma',
        team: [
          [774, 28],
          [605, 28],
        ],
      },
      {
        name: 'Youngster Raymond',
        team: [
          [22, 27],
          [739, 27],
        ],
      },
    ],
    gyms: [
      // Sophocles's trial at the Hokulani Observatory: the Totem Vikavolt.
      {
        name: 'Captain Sophocles',
        role: 'leader',
        badge: 'Electrium Z',
        specialty: 'electric',
        team: [
          [777, 27],
          [737, 27],
          [738, 29],
        ],
      }, // Togedemaru, Charjabug, Vikavolt
    ],
  }),
  area({
    key: 'al-blush-mountain',
    name: 'Routes 11 & 12 and Blush Mountain',
    orderIndex: 715,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 26,
    maxLevel: 32,
    weights: W.mixed,
    tier: 3,
    wild: [
      [775, 10, 26, 29], // Komala
      [776, 6, 26, 32], // Turtonator
      [777, 8, 26, 32], // Togedemaru
      [749, 8, 26, 29], // Mudbray
      [324, 8, 26, 32], // Torkoal
      [74, 8, 23, 24], // Geodude
      [737, 6, 26, 32], // Charjabug
      [702, 6, 29, 32], // Dedenne
      [239, 6, 26, 29], // Elekid
      [288, 6, 27, 29], // Vigoroth
      [111, 6, 30, 32], // Rhyhorn
    ],
    trainers: [
      {
        name: 'Hiker Frank',
        team: [
          [324, 30],
          [111, 30],
        ],
      },
      {
        name: 'Punk Guy Dax',
        team: [
          [776, 30],
          [775, 30],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [42, 30],
          [747, 30],
        ],
      }, // Golbat, Mareanie
    ],
  }),
  area({
    key: 'al-haina-desert',
    name: 'Routes 13 & 14, Haina Desert & Tapu Village',
    orderIndex: 716,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 28,
    maxLevel: 34,
    weights: W.mixed,
    tier: 3,
    wild: [
      [779, 8, 28, 33], // Bruxish
      [746, 8, 28, 33], // Wishiwashi
      [551, 10, 28, 28], // Sandile
      [552, 6, 32, 35], // Krokorok
      [51, 8, 28, 33], // Dugtrio
      [343, 6, 32, 35], // Baltoy
      [622, 6, 32, 35], // Golett
      [328, 6, 28, 33], // Trapinch
      [444, 4, 28, 33], // Gabite
      [361, 8, 28, 33], // Snorunt
      [359, 4, 28, 33], // Absol
      [37, 6, 28, 33], // Vulpix
      [27, 6, 20, 21], // Sandshrew
    ],
    trainers: [
      {
        name: 'Surfer Tanoa',
        team: [
          [779, 32],
          [746, 32],
        ],
      },
      {
        name: 'Sightseer Ellie',
        team: [
          [551, 32],
          [328, 32],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [552, 32],
          [42, 32],
        ],
      }, // Krokorok, Golbat
    ],
  }),
  area({
    key: 'al-thrifty-megamart',
    name: 'Routes 15 & 16 and the Thrifty Megamart',
    orderIndex: 717,
    banner: { scene: 'haunted', flip: true },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 35,
    weights: W.mixed,
    tier: 4,
    // Acerola's trial: the abandoned Thrifty Megamart, and the Totem Mimikyu in its back room.
    wild: [
      [778, 6, 30, 34], // Mimikyu
      [93, 10, 30, 34], // Haunter
      [42, 10, 30, 34], // Golbat
      [707, 8, 30, 34], // Klefki
      [353, 8, 31, 34], // Shuppet
      [279, 10, 30, 35], // Pelipper
      [769, 8, 30, 35], // Sandygast
      [559, 6, 32, 35], // Scraggy
      [366, 6, 30, 35], // Clamperl
      [739, 8, 30, 33], // Crabrawler
    ],
    trainers: [
      {
        name: 'Janitor Ralph',
        team: [
          [93, 33],
          [353, 33],
        ],
      },
      {
        name: 'Aether Foundation Employee Vicky',
        team: [
          [279, 33],
          [121, 33],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [42, 33],
          [559, 33],
        ],
      }, // Golbat, Scraggy
    ],
    gyms: [
      {
        name: 'Captain Acerola',
        role: 'leader',
        specialty: 'ghost',
        team: [
          [302, 31],
          [426, 31],
          [778, 33],
        ],
      }, // Sableye, Drifblim, Mimikyu
    ],
  }),
  area({
    key: 'al-po-town',
    name: 'Route 17 & Po Town',
    orderIndex: 718,
    banner: { scene: 'sunset' },
    roundsToClear: 2,
    minLevel: 31,
    maxLevel: 41,
    weights: W.busy,
    tier: 4,
    wild: [
      [351, 8, 31, 36], // Castform
      [22, 10, 31, 36], // Fearow
      [75, 8, 31, 36], // Graveler
      [227, 6, 31, 36], // Skarmory
      [559, 8, 33, 36], // Scraggy
      [624, 6, 33, 36], // Pawniard
      [675, 6, 32, 36], // Pangoro
      [704, 4, 31, 36], // Goomy
    ],
    trainers: [
      {
        name: 'Team Skull Grunt',
        team: [
          [42, 36],
          [748, 36],
        ],
      }, // Golbat, Toxapex
      {
        name: 'Team Skull Grunt',
        team: [
          [758, 36],
          [20, 36],
        ],
      }, // Salazzle, Raticate
      {
        name: 'Team Skull Grunt',
        team: [
          [569, 37],
          [89, 37],
        ],
      }, // Garbodor, Muk
      {
        name: 'Plumeria',
        team: [
          [42, 37],
          [758, 38],
        ],
      }, // Golbat, Salazzle
    ],
    gyms: [
      // Guzma in his Shady House, then Nanu's grand trial at the police station on the way out.
      {
        name: 'Guzma',
        role: 'leader',
        specialty: 'bug',
        team: [
          [168, 40],
          [768, 41],
        ],
      }, // Ariados, Golisopod
      {
        name: 'Kahuna Nanu',
        role: 'leader',
        badge: 'Darkinium Z',
        specialty: 'dark',
        team: [
          [302, 38],
          [553, 38],
          [53, 39],
        ],
      }, // Sableye, Krookodile, Persian
    ],
  }),
  area({
    key: 'al-aether-paradise',
    name: 'Aether Paradise',
    orderIndex: 719,
    banner: { scene: 'factory' },
    roundsToClear: 2,
    minLevel: 38,
    maxLevel: 49,
    weights: W.trainersOnly,
    tier: 4,
    // The Master Ball, from the Aether Foundation's own stores: one per region, in its villains' hideout.
    once: [['master-ball', 2, 1, 1, true]],
    wild: [],
    trainers: [
      {
        name: 'Aether Foundation Employee Jordan',
        team: [
          [137, 42],
          [82, 42],
        ],
      },
      {
        name: 'Aether Foundation Employee Rae',
        team: [
          [121, 42],
          [199, 43],
        ],
      },
      {
        name: 'Team Skull Grunt',
        team: [
          [748, 43],
          [42, 43],
        ],
      }, // Toxapex, Golbat
      {
        name: 'Gladion',
        team: [
          [42, 43],
          [745, 43],
          [772, 44],
        ],
      }, // Golbat, Lycanroc, Type: Null
    ],
    // The story's last stand: Faba, Guzma again, and Lusamine.
    gyms: [
      {
        name: 'Faba',
        role: 'leader',
        specialty: 'psychic',
        team: [
          [97, 42],
          [779, 43],
        ],
      }, // Hypno, Bruxish
      {
        name: 'Guzma',
        role: 'leader',
        specialty: 'bug',
        team: [
          [168, 46],
          [284, 46],
          [768, 47],
        ],
      }, // Ariados, Masquerain, Golisopod
      {
        name: 'Lusamine',
        role: 'leader',
        specialty: 'fairy',
        team: [
          [36, 47],
          [350, 47],
          [760, 48],
        ],
      }, // Clefable, Milotic, Bewear
    ],
  }),

  // ---------------------------------------------------------------- Poni Island
  area({
    key: 'al-seafolk',
    name: 'Seafolk Village, Poni Wilds & Ancient Poni Path',
    orderIndex: 720,
    banner: { scene: 'ocean' },
    roundsToClear: 2,
    minLevel: 40,
    maxLevel: 46,
    weights: W.mixed,
    tier: 4,
    wild: [
      [781, 6, 40, 45], // Dhelmise
      [320, 10, 38, 39], // Wailmer
      [279, 10, 40, 44], // Pelipper
      [767, 8, 26, 29], // Wimpod
      [210, 8, 40, 44], // Granbull
      [423, 8, 40, 44], // Gastrodon
      [676, 6, 41, 44], // Furfrou
      [686, 6, 26, 29], // Inkay
      [73, 6, 40, 44], // Tentacruel
      [369, 4, 40, 44], // Relicanth
      [131, 2, 41, 44], // Lapras
      [772, 1, 40, 44], // Type: Null
    ],
    trainers: [
      {
        name: 'Fisherman Kaimana',
        team: [
          [320, 43],
          [369, 43],
        ],
      },
      {
        name: 'Veteran Kanoa',
        team: [
          [423, 44],
          [210, 44],
        ],
      },
      {
        name: 'Hau',
        team: [
          [26, 44],
          [134, 44],
          [715, 43],
        ],
      }, // Raichu, Vaporeon, Noivern
    ],
    gyms: [
      // Mina's trial on Poni, in Ultra Sun and Ultra Moon: the Totem Ribombee.
      {
        name: 'Captain Mina',
        role: 'leader',
        badge: 'Fairium Z',
        specialty: 'fairy',
        team: [
          [707, 43],
          [210, 43],
          [743, 45],
        ],
      }, // Klefki, Granbull, Ribombee
    ],
  }),
  area({
    key: 'al-vast-poni-canyon',
    name: 'Exeggutor Island & Vast Poni Canyon',
    orderIndex: 721,
    banner: { scene: 'cave_dark' },
    roundsToClear: 2,
    minLevel: 41,
    maxLevel: 48,
    weights: W.mixed,
    tier: 4,
    wild: [
      [782, 6, 33, 34], // Jangmo-o
      [783, 4, 41, 44], // Hakamo-o
      [745, 8, 41, 46], // Lycanroc
      [103, 8, 40, 45], // Exeggutor
      [51, 10, 41, 45], // Dugtrio
      [42, 10, 41, 45], // Golbat
      [525, 8, 41, 45], // Boldore
      [703, 6, 41, 45], // Carbink
      [67, 6, 41, 46], // Machoke
      [619, 6, 43, 46], // Mienfoo
      [357, 4, 42, 45], // Tropius
      [148, 2, 41, 44], // Dragonair
    ],
    trainers: [
      {
        name: 'Ace Trainer Sanjay',
        team: [
          [783, 46],
          [745, 46],
        ],
      },
      {
        name: 'Veteran Dorothy',
        team: [
          [525, 46],
          [103, 46],
        ],
      },
      {
        name: 'Black Belt Leilani',
        team: [
          [67, 46],
          [619, 46],
        ],
      },
    ],
    gyms: [
      {
        name: 'Kahuna Hapu',
        role: 'leader',
        badge: 'Groundium Z',
        specialty: 'ground',
        team: [
          [423, 47],
          [330, 47],
          [750, 48],
        ],
      }, // Gastrodon, Flygon, Mudsdale
    ],
  }),
  area({
    key: 'al-mount-lanakila',
    name: 'Mount Lanakila',
    orderIndex: 722,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 2,
    minLevel: 46,
    maxLevel: 54,
    weights: W.busy,
    tier: 5,
    // Crabrawler climbs out of the cold here: the Ice Stone is the mountain's.
    once: [['ice-stone', 8, 1, 1, true]],
    wild: [
      [780, 6, 46, 51], // Drampa
      [362, 8, 46, 51], // Glalie
      [215, 8, 46, 51], // Sneasel
      [359, 8, 46, 51], // Absol
      [361, 8, 40, 41], // Snorunt
      [27, 6, 46, 51], // Sandshrew
      [37, 6, 46, 51], // Vulpix
      [583, 6, 42, 46], // Vanillish
      [351, 6, 46, 51], // Castform
      [42, 8, 46, 51], // Golbat
      [739, 8, 46, 51], // Crabrawler
    ],
    trainers: [
      {
        name: 'Ace Trainer Ollie',
        team: [
          [740, 52],
          [780, 52],
        ],
      },
      {
        name: 'Ace Trainer Rosie',
        team: [
          [743, 52],
          [748, 52],
        ],
      },
      {
        name: 'Veteran Stuart',
        team: [
          [784, 53],
          [768, 53],
        ],
      },
      // Gladion waits at the top of the mountain, before the league.
      {
        name: 'Gladion',
        team: [
          [169, 53],
          [448, 53],
          [773, 55],
        ],
      }, // Crobat, Lucario, Silvally
    ],
  }),
  area({
    key: 'al-pokemon-league',
    name: 'The Pokémon League',
    orderIndex: 723,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 54,
    maxLevel: 62,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Ace Trainer Ollie',
        team: [
          [740, 55],
          [780, 55],
        ],
      },
      {
        name: 'Veteran Stuart',
        team: [
          [784, 55],
          [768, 55],
        ],
      },
    ],
    // Sun and Moon's first league, with Kukui waiting as the challenger the player has to beat to become Champion.
    gyms: [
      {
        name: 'Elite Four Hala',
        role: 'elite',
        specialty: 'fighting',
        team: [
          [297, 54],
          [760, 54],
          [740, 55],
        ],
      }, // Hariyama, Bewear, Crabominable
      {
        name: 'Elite Four Olivia',
        role: 'elite',
        specialty: 'rock',
        team: [
          [476, 54],
          [76, 54],
          [745, 55],
        ],
      }, // Probopass, Golem, Lycanroc
      {
        name: 'Elite Four Acerola',
        role: 'elite',
        specialty: 'ghost',
        team: [
          [478, 54],
          [781, 54],
          [770, 55],
        ],
      }, // Froslass, Dhelmise, Palossand
      {
        name: 'Elite Four Kahili',
        role: 'elite',
        specialty: 'flying',
        team: [
          [227, 54],
          [741, 54],
          [733, 55],
        ],
      }, // Skarmory, Oricorio, Toucannon
      {
        name: 'Professor Kukui',
        role: 'champion',
        specialty: 'rock',
        team: [
          [38, 56],
          [143, 56],
          [745, 57],
        ],
      }, // Ninetales, Snorlax, Lycanroc
    ],
  }),
  // The endgame lap every region has, then the side areas the league opens.
  area({
    key: 'al-mount-lanakila-ii',
    name: 'Mount Lanakila II',
    orderIndex: 724,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: { wild: 4, trainer: 3, center: 1, item: 1 },
    tier: 5,
    wild: [
      [784, 6, 60, 66], // Kommo-o
      [780, 8, 60, 66], // Drampa
      [740, 10, 60, 66], // Crabominable
      [362, 10, 60, 66], // Glalie
      [461, 8, 60, 66], // Weavile
      [359, 8, 60, 66], // Absol
      [584, 6, 60, 66], // Vanilluxe
      [169, 8, 60, 66], // Crobat
    ],
    trainers: [
      {
        name: 'Ace Trainer Ollie II',
        team: [
          [740, 65],
          [780, 65],
        ],
      },
      {
        name: 'Ace Trainer Rosie II',
        team: [
          [743, 65],
          [748, 66],
        ],
      },
      {
        name: 'Veteran Stuart II',
        team: [
          [784, 66],
          [768, 66],
        ],
      },
    ],
  }),
  area({
    key: 'al-pokemon-league-ii',
    name: 'The Pokémon League II',
    orderIndex: 725,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 76,
    weights: { wild: 0, trainer: 2, center: 1, item: 1 },
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Ace Trainer Ollie II',
        team: [
          [740, 65],
          [780, 65],
        ],
      },
      {
        name: 'Veteran Stuart II',
        team: [
          [784, 66],
          [768, 66],
        ],
      },
    ],
    // The title defences of Ultra Sun and Ultra Moon: the Elite Four again, and Kukui last.
    gyms: [
      {
        name: 'Elite Four Hala II',
        role: 'elite',
        specialty: 'fighting',
        team: [
          [297, 69],
          [760, 69],
          [740, 71],
        ],
      }, // Hariyama, Bewear, Crabominable
      {
        name: 'Elite Four Olivia II',
        role: 'elite',
        specialty: 'rock',
        team: [
          [476, 69],
          [76, 69],
          [745, 71],
        ],
      }, // Probopass, Golem, Lycanroc
      {
        name: 'Elite Four Acerola II',
        role: 'elite',
        specialty: 'ghost',
        team: [
          [478, 69],
          [781, 69],
          [770, 71],
        ],
      }, // Froslass, Dhelmise, Palossand
      {
        name: 'Elite Four Kahili II',
        role: 'elite',
        specialty: 'flying',
        team: [
          [227, 69],
          [741, 69],
          [733, 71],
        ],
      }, // Skarmory, Oricorio, Toucannon
      {
        name: 'Professor Kukui II',
        role: 'champion',
        specialty: 'rock',
        team: [
          [38, 72],
          [143, 72],
          [745, 74],
        ],
      }, // Ninetales, Snorlax, Lycanroc
    ],
  }),
  area({
    key: 'al-battle-tree',
    name: 'Poni Gauntlet & the Battle Tree',
    orderIndex: 726,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 72,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'al-pokemon-league' }],
    wild: [
      [147, 4, 28, 30], // Dratini
      [149, 2, 62, 66], // Dragonite
      [468, 4, 60, 66], // Togekiss
      [663, 8, 60, 66], // Talonflame
      [128, 10, 60, 66], // Tauros
      [210, 10, 60, 66], // Granbull
      [55, 10, 60, 66], // Golduck
      [108, 8, 60, 66], // Lickitung
      [760, 8, 60, 66], // Bewear
      [733, 8, 60, 66], // Toucannon
    ],
    trainers: [
      {
        name: 'Ace Trainer Keala',
        team: [
          [733, 65],
          [760, 65],
        ],
      },
      {
        name: 'Veteran Makana',
        team: [
          [784, 66],
          [778, 66],
        ],
      },
      {
        name: 'Young Athlete Kira',
        team: [
          [768, 65],
          [776, 65],
        ],
      },
    ],
    gyms: [
      // The Battle Tree's two legends, from Kanto.
      {
        name: 'Blue',
        role: 'leader',
        specialty: 'normal',
        team: [
          [18, 68],
          [65, 68],
          [130, 70],
        ],
      }, // Pidgeot, Alakazam, Gyarados
      {
        name: 'Red',
        role: 'leader',
        specialty: 'electric',
        team: [
          [143, 70],
          [131, 70],
          [25, 72],
        ],
      }, // Snorlax, Lapras, Pikachu
    ],
  }),
  area({
    key: 'al-poke-pelago',
    name: 'The Poké Pelago',
    orderIndex: 727,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 76,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'al-pokemon-league' }],
    // Every Alola species, so the Pokédex can be finished after the league: the islands the Pokémon of the PC visit.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Leilani', specialty: 'water', size: 3 },
      { name: 'Veteran Akoni', specialty: 'rock', size: 3 },
      { name: 'Surfer Kapono', specialty: 'flying', size: 3 },
    ],
  }),

  // ---------------------------------------------------------------- secret areas
  // Every one carries the stricter gate of docs/11-GEN6-9-REGIONS-PLAN.md: a story point, a share of the Alola
  // Pokédex and a Pokémon at the boss's own level.

  area({
    key: 'al-lake-of-the-sunne',
    name: 'The Lakes of the Sunne and Moone',
    orderIndex: 751,
    banner: { scene: 'sky', flip: true },
    roundsToClear: 1,
    minLevel: 40,
    maxLevel: 48,
    weights: W.shrine,
    tier: 4,
    hidden: true,
    // Cosmog, the nebula Pokémon Lillie carries through the whole story, found again where it first came to Alola.
    conditions: [
      { kind: 'area', areaId: 'al-aether-paradise' },
      { kind: 'pokedex', count: ALOLA_DEX.story },
      { kind: 'maxLevel', level: 40 },
    ],
    bosses: [{ dex: 789, level: 40, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-altar',
    name: 'The Altar of the Sunne and Moone',
    orderIndex: 752,
    banner: { scene: 'sunset', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Solgaleo and Lunala, both, as the versions merge.
    conditions: [
      { kind: 'area', areaId: 'al-pokemon-league' },
      { kind: 'pokedex', count: ALOLA_DEX.box },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [
      { dex: 791, level: 65 }, // Solgaleo
      { dex: 792, level: 65 }, // Lunala
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-ultra-megalopolis',
    name: 'Ultra Megalopolis',
    orderIndex: 753,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 64,
    maxLevel: 74,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Necrozma, the light-eater, at the top of the city it starved of light.
    conditions: [
      { kind: 'area', areaId: 'al-altar' },
      { kind: 'pokedex', count: ALOLA_DEX.box },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 800, level: 70 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-ruins',
    name: 'The Ruins of the Guardians',
    orderIndex: 754,
    banner: { scene: 'mountains', flip: true },
    roundsToClear: 1,
    minLevel: 58,
    maxLevel: 66,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The four island guardians in their ruins: Conflict, Life, Abundance and Hope, walked in one trip.
    conditions: [
      { kind: 'area', areaId: 'al-pokemon-league' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 60 },
    ],
    bosses: [
      { dex: 785, level: 60, teamAvgThreshold: 0 }, // Tapu Koko
      { dex: 786, level: 60, teamAvgThreshold: 0 }, // Tapu Lele
      { dex: 787, level: 60, teamAvgThreshold: 0 }, // Tapu Bulu
      { dex: 788, level: 60, teamAvgThreshold: 0 }, // Tapu Fini
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-ultra-deep-sea',
    name: 'Ultra Space: the Deep Sea & the Jungle',
    orderIndex: 755,
    banner: { scene: 'ocean', flip: true },
    roundsToClear: 1,
    minLevel: 58,
    maxLevel: 66,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Through the Ultra Wormholes, with the Ultra Recon Squad's warning ringing: Nihilego and Buzzwole.
    conditions: [
      { kind: 'area', areaId: 'al-pokemon-league' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 60 },
    ],
    bosses: [
      { dex: 793, level: 60, teamAvgThreshold: 0 }, // Nihilego
      { dex: 794, level: 60, teamAvgThreshold: 0 }, // Buzzwole
    ],
    wild: [
      [748, 14, 58, 64], // Toxapex
      [771, 12, 58, 64], // Pyukumuku
      [760, 12, 58, 64], // Bewear
      [766, 12, 58, 64], // Passimian
      [765, 10, 58, 64], // Oranguru
    ],
    trainers: [],
  }),
  area({
    key: 'al-ultra-desert',
    name: 'Ultra Space: the Desert & the Plant',
    orderIndex: 756,
    banner: { scene: 'dunes', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 68,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [
      { kind: 'area', areaId: 'al-ultra-deep-sea' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 62 },
    ],
    bosses: [
      { dex: 795, level: 62, teamAvgThreshold: 0 }, // Pheromosa
      { dex: 796, level: 62, teamAvgThreshold: 0 }, // Xurkitree
    ],
    wild: [
      [770, 14, 60, 66], // Palossand
      [553, 12, 60, 66], // Krookodile
      [738, 12, 60, 66], // Vikavolt
      [777, 12, 60, 66], // Togedemaru
      [462, 10, 60, 66], // Magnezone
    ],
    trainers: [],
  }),
  area({
    key: 'al-ultra-crater',
    name: 'Ultra Space: the Crater & the Forest',
    orderIndex: 757,
    banner: { scene: 'volcano', flip: true },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 70,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [
      { kind: 'area', areaId: 'al-ultra-desert' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [
      { dex: 797, level: 65, teamAvgThreshold: 0 }, // Celesteela
      { dex: 798, level: 65, teamAvgThreshold: 0 }, // Kartana
    ],
    wild: [
      [776, 14, 62, 68], // Turtonator
      [754, 12, 62, 68], // Lurantis
      [763, 12, 62, 68], // Tsareena
      [756, 12, 62, 68], // Shiinotic
      [781, 10, 62, 68], // Dhelmise
    ],
    trainers: [],
  }),
  area({
    key: 'al-ultra-ruin',
    name: 'Ultra Space: the Ruin',
    orderIndex: 758,
    banner: { scene: 'cave_dark', flip: true },
    roundsToClear: 1,
    minLevel: 64,
    maxLevel: 72,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Guzzlord, alone in the world it ate.
    conditions: [
      { kind: 'area', areaId: 'al-ultra-crater' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 799, level: 70, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-poni-grove',
    name: 'Poni Grove',
    orderIndex: 759,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 68,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Stakataka and Blacephalon, the two Ultra Beasts that came through to Poni's own grove and plains.
    conditions: [
      { kind: 'area', areaId: 'al-pokemon-league' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 63 },
    ],
    bosses: [
      { dex: 805, level: 63, teamAvgThreshold: 0 }, // Stakataka
      { dex: 806, level: 63, teamAvgThreshold: 0 }, // Blacephalon
    ],
    wild: [
      [604, 14, 60, 66], // Eelektross
      [448, 10, 60, 66], // Lucario
      [428, 12, 60, 66], // Lopunny
      [571, 10, 60, 66], // Zoroark
      [214, 10, 60, 66], // Heracross
      [733, 12, 60, 66], // Toucannon
    ],
    trainers: [],
  }),
  area({
    key: 'al-ultra-recon',
    name: 'The Ultra Recon Squad',
    orderIndex: 760,
    banner: { scene: 'sky', flip: true },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 60,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Poipole, entrusted by the Ultra Recon Squad once Necrozma has given back the light.
    conditions: [
      { kind: 'area', areaId: 'al-ultra-megalopolis' },
      { kind: 'pokedex', count: ALOLA_DEX.trio },
      { kind: 'maxLevel', level: 55 },
    ],
    bosses: [{ dex: 803, level: 55, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-magearna',
    name: "Magearna's Workshop",
    orderIndex: 761,
    banner: { scene: 'factory', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 68,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Magearna, the artificial Pokémon built by the Soul-Heart's makers five hundred years ago.
    conditions: [
      { kind: 'area', areaId: 'al-pokemon-league' },
      { kind: 'pokedex', count: ALOLA_DEX.mythical },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [{ dex: 801, level: 65, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-marshadow',
    name: "Ten Carat Hill's Farthest Hollow",
    orderIndex: 762,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Marshadow, the shadow that hides in others' shadows, at the far end of the hill the journey began beside.
    conditions: [
      { kind: 'area', areaId: 'al-magearna' },
      { kind: 'pokedex', count: ALOLA_DEX.mythical },
      { kind: 'maxLevel', level: 67 },
    ],
    bosses: [{ dex: 802, level: 67, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-zeraora',
    name: 'The Blush Mountain Storm',
    orderIndex: 763,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 64,
    maxLevel: 72,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Zeraora, the thunderclap Pokémon, where Ula'ula's power plant draws its lightning.
    conditions: [
      { kind: 'area', areaId: 'al-marshadow' },
      { kind: 'pokedex', count: ALOLA_DEX.mythical },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 807, level: 70, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'al-meltan',
    name: 'The Mystery Box',
    orderIndex: 764,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 40,
    maxLevel: 50,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Meltan, the hex-nut Pokémon that melts metal, drawn out of the Mystery Box. It grows into Melmetal at Lv.50.
    conditions: [
      { kind: 'area', areaId: 'al-zeraora' },
      { kind: 'pokedex', count: ALOLA_DEX.mythical },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 808, level: 40, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
]
