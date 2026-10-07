// Kalos, in order of discovery, routed on X and Y. Same shape as content-unova.ts.
//
// Wild pools are X/Y's own, read off PokeAPI's encounter tables (versions merged): Kalos's routes mix every
// generation, as Johto's, Hoenn's and Sinnoh's do, and every Gen 6 species — or the first stage of its line — has a
// route of its own here, outside the catch-all. Tyrunt and Amaura are the exception: the Jaw and Sail Fossil in the
// Glittering Cave are their only source, as in the games.
//
// Gym leaders, the Elite Four and the Champion carry their X/Y Pokémon at X/Y's levels. A team holds at most three, so
// a bigger roster keeps, in order, the Pokémon new to Gen 6 and then the highest levels (the user's rule).
// Legendaries are never in a wild pool — each is an area boss.
import { area, DECK as W, type AreaPlan } from './content'

/** Kalos's starters: Chespin, Fennekin, Froakie. */
export const KALOS_STARTERS = [650, 653, 656]

/**
 * The Pokédex gates of the secret areas, as plain counts of the Kalos Pokédex (what the admin edits): 70 % of the
 * species catchable in Kalos (364) for a box legendary, 85 % for a mythical. Kalos's routes borrow from every generation,
 * so the base is the region's whole catchable list, counted when the region was built (tests/region-content.test.ts
 * re-derives it and fails if the shares drift).
 */
export const KALOS_DEX = { box: 255, mythical: 309 }

/** Kalos areas sit at 601+, after Unova's 501+. */
export const KALOS_AREAS: AreaPlan[] = [
  area({
    key: 'ka-route-2',
    name: 'Routes 1 & 2 and Aquacorde Town',
    orderIndex: 601,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [659, 22, 2, 4], // Bunnelby
      [661, 22, 2, 4], // Fletchling
      [664, 22, 2, 4], // Scatterbug
      [263, 14, 3, 5], // Zigzagoon
      [16, 12, 3, 5], // Pidgey
      [13, 4, 3, 4], // Weedle
      [10, 4, 3, 4], // Caterpie
    ],
    trainers: [],
  }),
  area({
    key: 'ka-santalune-forest',
    name: 'Santalune Forest',
    orderIndex: 602,
    banner: { scene: 'forest' },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 7,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [664, 20, 3, 6], // Scatterbug
      [13, 14, 3, 6], // Weedle
      [10, 14, 3, 6], // Caterpie
      [661, 12, 4, 6], // Fletchling
      [511, 10, 4, 6], // Pansage
      [513, 10, 4, 6], // Pansear
      [515, 10, 4, 6], // Panpour
      [25, 6, 4, 6], // Pikachu
      [14, 2, 5, 6], // Kakuna
      [11, 2, 5, 6], // Metapod
    ],
    trainers: [
      {
        name: 'Youngster Austin',
        team: [
          [263, 5],
          [659, 5],
        ],
      },
      {
        name: 'Bug Catcher Charlie',
        team: [
          [13, 5],
          [664, 6],
        ],
      },
      { name: 'Trevor', team: [[25, 6]] }, // Pikachu
      { name: 'Tierno', team: [[659, 6]] }, // Bunnelby
    ],
  }),
  area({
    key: 'ka-santalune',
    name: 'Route 3 & Santalune City',
    orderIndex: 603,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 4,
    maxLevel: 12,
    weights: W.mixed,
    tier: 1,
    wild: [
      [659, 14, 4, 7], // Bunnelby
      [399, 14, 4, 7], // Bidoof
      [661, 14, 4, 7], // Fletchling
      [16, 8, 5, 8], // Pidgey
      [412, 8, 5, 8], // Burmy
      [298, 8, 5, 8], // Azurill
      [206, 6, 5, 8], // Dunsparce
      [25, 6, 5, 8], // Pikachu
      [183, 10, 6, 9], // Marill
      [129, 12, 5, 9], // Magikarp
    ],
    trainers: [
      {
        name: 'Youngster Zachary',
        team: [
          [263, 7],
          [659, 8],
        ],
      },
      {
        name: 'Lass Anna',
        team: [
          [298, 7],
          [412, 8],
        ],
      },
      {
        name: 'Fisherman Kyle',
        team: [
          [129, 8],
          [129, 9],
        ],
      },
      {
        name: 'Shauna',
        team: [
          [669, 9],
          [661, 9],
        ],
      }, // Flabébé, Fletchling
    ],
    gyms: [
      {
        name: 'Viola',
        role: 'leader',
        badge: 'Bug Badge',
        specialty: 'bug',
        team: [
          [283, 10],
          [666, 12],
        ],
      }, // Surskit, Vivillon
    ],
  }),
  area({
    key: 'ka-route-4',
    name: 'Routes 4 & 22 and Lumiose City South',
    orderIndex: 604,
    banner: { scene: 'flowers' },
    roundsToClear: 1,
    minLevel: 6,
    maxLevel: 11,
    weights: W.mixed,
    tier: 1,
    // Route 4's flower beds, and Route 22 back towards Santalune, where Litleo first turns up.
    wild: [
      [669, 18, 6, 9], // Flabébé
      [667, 12, 6, 10], // Litleo
      [415, 10, 6, 9], // Combee
      [165, 10, 6, 9], // Ledyba
      [406, 8, 7, 9], // Budew
      [300, 8, 7, 9], // Skitty
      [54, 10, 6, 10], // Psyduck
      [83, 6, 7, 10], // Farfetch'd
      [447, 4, 7, 10], // Riolu
      [280, 4, 8, 9], // Ralts
    ],
    trainers: [
      {
        name: 'Fairy Tale Girl Lucy',
        team: [
          [669, 9],
          [300, 9],
        ],
      },
      {
        name: 'Rising Star Tom',
        team: [
          [661, 9],
          [667, 10],
        ],
      },
      {
        name: 'Roller Skater Kenny',
        team: [
          [659, 9],
          [165, 10],
        ],
      },
      {
        name: 'Serena',
        team: [
          [677, 10],
          [661, 10],
        ],
      }, // Espurr, Fletchling
    ],
  }),
  area({
    key: 'ka-camphrier',
    name: 'Route 5 & Camphrier Town',
    orderIndex: 605,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 8,
    maxLevel: 13,
    weights: W.mixed,
    tier: 2,
    wild: [
      [316, 14, 8, 11], // Gulpin
      [672, 14, 8, 11], // Skiddo
      [674, 12, 8, 11], // Pancham
      [676, 12, 8, 11], // Furfrou
      [659, 10, 8, 11], // Bunnelby
      [559, 10, 8, 11], // Scraggy
      [84, 8, 9, 12], // Doduo
      [63, 6, 9, 12], // Abra
      [311, 6, 9, 12], // Plusle
      [312, 6, 9, 12], // Minun
    ],
    trainers: [
      {
        name: 'Roller Skater Mark',
        team: [
          [672, 11],
          [659, 11],
        ],
      },
      {
        name: 'Roller Skater Lily',
        team: [
          [316, 11],
          [676, 12],
        ],
      },
      {
        name: 'Black Belt Kenji',
        team: [
          [674, 12],
          [559, 12],
        ],
      },
      {
        name: 'Tierno',
        team: [
          [659, 12],
          [674, 12],
        ],
      }, // Bunnelby, Pancham
    ],
  }),
  area({
    key: 'ka-parfum-palace',
    name: 'Route 6 & Parfum Palace',
    orderIndex: 606,
    banner: { scene: 'flowers', flip: true },
    roundsToClear: 1,
    minLevel: 10,
    maxLevel: 15,
    weights: W.mixed,
    tier: 2,
    wild: [
      [543, 16, 10, 13], // Venipede
      [677, 14, 10, 13], // Espurr
      [679, 12, 11, 14], // Honedge
      [43, 12, 10, 13], // Oddish
      [161, 10, 10, 13], // Sentret
      [531, 8, 11, 14], // Audino
      [290, 8, 11, 14], // Nincada
      [352, 4, 12, 14], // Kecleon
      [118, 10, 12, 15], // Goldeen
    ],
    trainers: [
      {
        name: 'Butler Andre',
        team: [
          [677, 13],
          [161, 13],
        ],
      },
      {
        name: 'Maid Elizabeth',
        team: [
          [43, 13],
          [543, 14],
        ],
      },
      {
        name: 'Pokémon Ranger Brandon',
        team: [
          [679, 14],
          [290, 14],
        ],
      },
    ],
  }),
  area({
    key: 'ka-route-7',
    name: 'Route 7 & the Connecting Cave',
    orderIndex: 607,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 12,
    maxLevel: 17,
    weights: W.mixed,
    tier: 2,
    // The Sachet and the Whipped Dream: Spritzee and Swirlix live on Route 7, and the two trade items with them.
    once: [
      ['sachet', 6, 1, 1, true],
      ['whipped-dream', 6, 1, 1, true],
    ],
    wild: [
      [669, 14, 12, 16], // Flabébé
      [682, 10, 13, 16], // Spritzee
      [684, 10, 13, 16], // Swirlix
      [453, 10, 12, 16], // Croagunk
      [315, 8, 12, 16], // Roselia
      [580, 8, 13, 16], // Ducklett
      [235, 6, 13, 16], // Smeargle
      [293, 12, 12, 15], // Whismur
      [41, 10, 12, 15], // Zubat
      [610, 6, 12, 15], // Axew
      [143, 2, 15, 17], // Snorlax
    ],
    trainers: [
      {
        name: 'Pokémon Breeder Lucia',
        team: [
          [682, 15],
          [684, 15],
        ],
      },
      {
        name: 'Twins Mia & Pia',
        team: [
          [669, 15],
          [315, 15],
        ],
      },
      {
        name: 'Hiker Ryan',
        team: [
          [41, 15],
          [293, 16],
        ],
      },
      {
        name: 'Trevor',
        team: [
          [25, 16],
          [670, 16],
        ],
      }, // Pikachu, Floette
    ],
  }),
  area({
    key: 'ka-ambrette',
    name: 'Route 8 & Ambrette Town',
    orderIndex: 608,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 20,
    weights: W.mixed,
    tier: 2,
    wild: [
      [686, 10, 14, 18], // Inkay
      [688, 10, 13, 18], // Binacle
      [690, 10, 15, 19], // Skrelp
      [692, 10, 15, 19], // Clauncher
      [335, 8, 13, 17], // Zangoose
      [336, 8, 13, 17], // Seviper
      [425, 8, 13, 17], // Drifloon
      [619, 8, 13, 17], // Mienfoo
      [325, 6, 13, 17], // Spoink
      [359, 4, 14, 17], // Absol
      [371, 2, 14, 17], // Bagon
      [278, 8, 13, 17], // Wingull
      [72, 8, 15, 19], // Tentacool
    ],
    trainers: [
      {
        name: 'Fisherman Bucky',
        team: [
          [692, 17],
          [690, 17],
        ],
      },
      {
        name: 'Swimmer Nina',
        team: [
          [72, 17],
          [278, 17],
        ],
      },
      {
        name: 'Black Belt Gunner',
        team: [
          [619, 18],
          [688, 18],
        ],
      },
      {
        name: 'Team Flare Grunt',
        team: [
          [228, 18],
          [453, 18],
        ],
      }, // Houndour, Croagunk
    ],
  }),
  area({
    key: 'ka-cyllage',
    name: 'Route 9, the Glittering Cave & Cyllage City',
    orderIndex: 609,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 15,
    maxLevel: 25,
    weights: W.mixed,
    tier: 2,
    // The Jaw and the Sail Fossil, each found once in the Glittering Cave: the only Tyrunt and Amaura in the game.
    once: [
      ['jaw-fossil', 6, 1, 1, true],
      ['sail-fossil', 6, 1, 1, true],
      ['sun-stone', 4, 1, 1, true],
    ],
    wild: [
      [694, 14, 15, 18], // Helioptile
      [551, 10, 15, 18], // Sandile
      [449, 10, 15, 18], // Hippopotas
      [527, 14, 15, 18], // Woobat
      [66, 10, 15, 18], // Machop
      [104, 8, 15, 18], // Cubone
      [597, 6, 15, 18], // Ferroseed
      [111, 6, 16, 19], // Rhyhorn
      [95, 6, 16, 19], // Onix
      [337, 4, 16, 19], // Lunatone
      [338, 4, 16, 19], // Solrock
      [303, 4, 16, 19], // Mawile
      [115, 2, 17, 19], // Kangaskhan
    ],
    trainers: [
      {
        name: 'Hiker Bergin',
        team: [
          [66, 20],
          [95, 20],
        ],
      },
      {
        name: 'Team Flare Grunt',
        team: [
          [262, 20],
          [228, 21],
        ],
      }, // Mightyena, Houndour
      {
        name: 'Team Flare Grunt',
        team: [
          [453, 20],
          [42, 21],
        ],
      }, // Croagunk, Golbat
      {
        name: 'Ace Trainer Monique',
        team: [
          [694, 22],
          [527, 22],
        ],
      },
    ],
    gyms: [
      {
        name: 'Grant',
        role: 'leader',
        badge: 'Cliff Badge',
        specialty: 'rock',
        team: [
          [698, 25],
          [696, 25],
        ],
      }, // Amaura, Tyrunt
    ],
  }),
  area({
    key: 'ka-geosenge',
    name: 'Route 10 & Geosenge Town',
    orderIndex: 610,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 19,
    maxLevel: 24,
    weights: W.mixed,
    tier: 2,
    wild: [
      [701, 10, 19, 23], // Hawlucha
      [622, 12, 19, 23], // Golett
      [209, 12, 19, 22], // Snubbull
      [299, 10, 19, 23], // Nosepass
      [193, 8, 19, 23], // Yanma
      [561, 8, 19, 23], // Sigilyph
      [133, 8, 19, 23], // Eevee
      [228, 8, 19, 23], // Houndour
      [309, 8, 19, 23], // Electrike
      [587, 4, 19, 23], // Emolga
    ],
    trainers: [
      {
        name: 'Team Flare Grunt',
        team: [
          [228, 22],
          [309, 22],
        ],
      }, // Houndour, Electrike
      {
        name: 'Team Flare Grunt',
        team: [
          [316, 22],
          [559, 23],
        ],
      }, // Gulpin, Scraggy
      {
        name: 'Sky Trainer Bonnie',
        team: [
          [701, 23],
          [587, 23],
        ],
      },
      {
        name: 'Serena',
        team: [
          [677, 23],
          [133, 23],
        ],
      }, // Espurr, Eevee
    ],
  }),
  area({
    key: 'ka-shalour',
    name: 'Route 11, Reflection Cave & Shalour City',
    orderIndex: 611,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 21,
    maxLevel: 32,
    weights: W.mixed,
    tier: 3,
    wild: [
      [702, 10, 21, 25], // Dedenne
      [703, 10, 22, 26], // Carbink
      [434, 10, 21, 25], // Stunky
      [29, 8, 14, 15], // Nidoran♀
      [32, 8, 14, 15], // Nidoran♂
      [524, 10, 21, 24], // Roggenrola
      [439, 6, 21, 25], // Mime Jr.
      [577, 6, 22, 26], // Solosis
      [302, 4, 22, 26], // Sableye
      [297, 6, 23, 26], // Hariyama
      [538, 4, 23, 26], // Throh
      [539, 4, 23, 26], // Sawk
      [433, 4, 22, 26], // Chingling
    ],
    trainers: [
      {
        name: 'Hex Maniac Raziah',
        team: [
          [577, 26],
          [302, 26],
        ],
      },
      {
        name: 'Battle Girl Mariah',
        team: [
          [539, 27],
          [619, 27],
        ],
      },
      {
        name: 'Black Belt Ricardo',
        team: [
          [297, 27],
          [538, 27],
        ],
      },
      {
        name: 'Tierno',
        team: [
          [674, 27],
          [341, 26],
        ],
      }, // Pancham, Corphish
    ],
    gyms: [
      // The Tower of Mastery. Korrina's ace is Mega Lucario in the games; Lucario is Gen 4, so her three Gen 6-first
      // picks are these (Lucario is the gift she hands over instead — Riolu is on Route 22).
      {
        name: 'Korrina',
        role: 'leader',
        badge: 'Rumble Badge',
        specialty: 'fighting',
        team: [
          [619, 29],
          [67, 28],
          [701, 32],
        ],
      }, // Mienfoo, Machoke, Hawlucha
    ],
  }),
  area({
    key: 'ka-coumarine',
    name: 'Route 12, Azure Bay & Coumarine City',
    orderIndex: 612,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 23,
    maxLevel: 34,
    weights: W.mixed,
    tier: 3,
    wild: [
      [241, 10, 23, 27], // Miltank
      [128, 10, 23, 27], // Tauros
      [79, 10, 23, 27], // Slowpoke
      [441, 8, 23, 27], // Chatot
      [102, 6, 24, 27], // Exeggcute
      [417, 6, 23, 27], // Pachirisu
      [127, 4, 25, 28], // Pinsir
      [214, 4, 25, 28], // Heracross
      [180, 8, 23, 26], // Flaaffy
      [223, 10, 22, 24], // Remoraid
      [594, 6, 26, 29], // Alomomola
      [131, 2, 27, 30], // Lapras
      [672, 6, 24, 27], // Skiddo
    ],
    trainers: [
      {
        name: 'Fisherman Elias',
        team: [
          [223, 28],
          [594, 28],
        ],
      },
      {
        name: 'Pokéfan Corey',
        team: [
          [241, 28],
          [417, 28],
        ],
      },
      {
        name: 'Rich Boy Rich',
        team: [
          [128, 29],
          [441, 29],
        ],
      },
      {
        name: 'Shauna',
        team: [
          [670, 29],
          [440, 28],
        ],
      }, // Floette, Happiny
    ],
    gyms: [
      {
        name: 'Ramos',
        role: 'leader',
        badge: 'Plant Badge',
        specialty: 'grass',
        team: [
          [189, 30],
          [70, 31],
          [673, 34],
        ],
      }, // Jumpluff, Weepinbell, Gogoat
    ],
  }),
  area({
    key: 'ka-badlands',
    name: 'Route 13 & the Kalos Power Plant',
    orderIndex: 613,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 26,
    maxLevel: 32,
    weights: W.busy,
    tier: 3,
    wild: [
      [51, 16, 26, 29], // Dugtrio
      [328, 16, 26, 29], // Trapinch
      [75, 14, 26, 29], // Graveler
      [443, 8, 22, 23], // Gible
      [218, 10, 26, 29], // Slugma
      [694, 10, 26, 29], // Helioptile
      [100, 8, 27, 29], // Voltorb
      [81, 8, 27, 29], // Magnemite
    ],
    trainers: [
      {
        name: 'Team Flare Grunt',
        team: [
          [262, 29],
          [453, 29],
        ],
      }, // Mightyena, Croagunk
      {
        name: 'Team Flare Grunt',
        team: [
          [317, 30],
          [228, 30],
        ],
      }, // Swalot, Houndour
      {
        name: 'Worker Jay',
        team: [
          [81, 30],
          [75, 30],
        ],
      },
      {
        name: 'Hiker Rocco',
        team: [
          [328, 30],
          [75, 31],
        ],
      },
    ],
  }),
  area({
    key: 'ka-lumiose',
    name: 'Lumiose City',
    orderIndex: 614,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 37,
    weights: W.casino,
    tier: 3,
    // Lumiose's alleys, cafés and the Prism Tower: Kalos's Game Corner deck, its only big city.
    wild: [
      [568, 14, 30, 34], // Trubbish
      [676, 14, 30, 34], // Furfrou
      [677, 12, 22, 24], // Espurr
      [667, 12, 30, 34], // Litleo
      [82, 10, 30, 34], // Magneton
      [101, 8, 30, 34], // Electrode
    ],
    trainers: [
      {
        name: 'Garçon Jamie',
        team: [
          [676, 33],
          [668, 34],
        ],
      },
      {
        name: 'Café Master Arnaud',
        team: [
          [678, 34],
          [568, 33],
        ],
      },
      {
        name: 'Punk Guy Zeke',
        team: [
          [560, 34],
          [262, 34],
        ],
      },
      {
        name: 'Serena',
        team: [
          [678, 34],
          [359, 34],
          [135, 34],
        ],
      }, // Meowstic, Absol, Jolteon
    ],
    gyms: [
      {
        name: 'Clemont',
        role: 'leader',
        badge: 'Voltage Badge',
        specialty: 'electric',
        team: [
          [587, 35],
          [82, 35],
          [695, 37],
        ],
      }, // Emolga, Magneton, Heliolisk
    ],
  }),
  area({
    key: 'ka-laverre',
    name: 'Route 14 & Laverre City',
    orderIndex: 615,
    banner: { scene: 'swamp' },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 42,
    weights: W.mixed,
    tier: 3,
    once: [['shiny-stone', 8, 1, 1, true]],
    wild: [
      [704, 10, 30, 33], // Goomy
      [195, 14, 30, 33], // Quagsire
      [451, 10, 30, 33], // Skorupi
      [618, 10, 30, 33], // Stunfisk
      [588, 6, 30, 33], // Karrablast
      [616, 6, 30, 33], // Shelmet
      [455, 6, 30, 33], // Carnivine
      [93, 4, 31, 33], // Haunter
      [70, 6, 31, 33], // Weepinbell
      [24, 6, 30, 33], // Arbok
      [339, 8, 27, 29], // Barboach
    ],
    trainers: [
      {
        name: 'Psychic Lucien',
        team: [
          [178, 37],
          [576, 37],
        ],
      },
      {
        name: 'Fairy Tale Girl Linda',
        team: [
          [683, 37],
          [685, 37],
        ],
      },
      {
        name: 'Team Flare Grunt',
        team: [
          [510, 37],
          [42, 37],
        ],
      }, // Liepard, Golbat
      {
        name: 'Flare Admin Bryony',
        team: [
          [510, 38],
          [625, 39],
        ],
      }, // Liepard, Bisharp — the Poké Ball Factory
    ],
    gyms: [
      {
        name: 'Valerie',
        role: 'leader',
        badge: 'Fairy Badge',
        specialty: 'fairy',
        team: [
          [303, 38],
          [122, 39],
          [700, 42],
        ],
      }, // Mawile, Mr. Mime, Sylveon
    ],
  }),
  area({
    key: 'ka-lost-hotel',
    name: 'Routes 15 & 16 and the Lost Hotel',
    orderIndex: 616,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 34,
    maxLevel: 39,
    weights: W.mixed,
    tier: 4,
    once: [['dusk-stone', 8, 1, 1, true]],
    wild: [
      [707, 10, 34, 38], // Klefki
      [708, 10, 34, 38], // Phantump
      [710, 10, 34, 38], // Pumpkaboo
      [590, 10, 34, 38], // Foongus
      [505, 8, 34, 38], // Watchog
      [624, 8, 34, 38], // Pawniard
      [262, 6, 34, 38], // Mightyena
      [510, 6, 34, 38], // Liepard
      [198, 6, 34, 38], // Murkrow
      [568, 8, 34, 35], // Trubbish
      [607, 6, 36, 38], // Litwick
      [569, 4, 36, 38], // Garbodor
    ],
    trainers: [
      {
        name: 'Punk Girl Raissa',
        team: [
          [569, 37],
          [510, 37],
        ],
      },
      {
        name: 'Punk Guy Tyson',
        team: [
          [624, 37],
          [262, 37],
        ],
      },
      {
        name: 'Hex Maniac Kimberly',
        team: [
          [709, 38],
          [607, 38],
        ],
      },
    ],
  }),
  area({
    key: 'ka-frost-cavern',
    name: 'Dendemille Town, Route 17 & the Frost Cavern',
    orderIndex: 617,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 37,
    maxLevel: 42,
    weights: W.mixed,
    tier: 4,
    wild: [
      [712, 12, 34, 36], // Bergmite
      [582, 10, 32, 34], // Vanillite
      [613, 10, 34, 36], // Cubchoo
      [459, 10, 37, 39], // Snover
      [225, 10, 37, 40], // Delibird
      [215, 8, 37, 40], // Sneasel
      [221, 8, 37, 40], // Piloswine
      [614, 6, 38, 41], // Beartic
      [124, 6, 38, 41], // Jynx
      [615, 4, 39, 41], // Cryogonal
      [460, 2, 39, 41], // Abomasnow
    ],
    trainers: [
      {
        name: 'Ace Trainer Hilda',
        team: [
          [712, 40],
          [614, 40],
        ],
      },
      {
        name: 'Hiker Jacques',
        team: [
          [221, 40],
          [460, 40],
        ],
      },
      {
        name: 'Team Flare Grunt',
        team: [
          [215, 40],
          [459, 40],
        ],
      }, // Sneasel, Snover
    ],
  }),
  area({
    key: 'ka-anistar',
    name: 'Route 18 & Anistar City',
    orderIndex: 618,
    banner: { scene: 'mountains', flip: true },
    roundsToClear: 1,
    minLevel: 42,
    maxLevel: 48,
    weights: W.mixed,
    tier: 4,
    wild: [
      [632, 14, 42, 46], // Durant
      [75, 12, 42, 46], // Graveler
      [533, 10, 42, 46], // Gurdurr
      [324, 10, 42, 46], // Torkoal
      [28, 10, 42, 46], // Sandslash
      [631, 10, 42, 46], // Heatmor
      [305, 6, 40, 41], // Lairon
      [247, 4, 42, 46], // Pupitar
      [213, 4, 42, 46], // Shuckle
    ],
    trainers: [
      {
        name: 'Psychic Bryce',
        team: [
          [576, 45],
          [678, 45],
        ],
      },
      {
        name: 'Ace Trainer Sherlock',
        team: [
          [533, 45],
          [632, 45],
        ],
      },
      {
        name: 'Battle Girl Jocelyn',
        team: [
          [620, 46],
          [701, 46],
        ],
      },
    ],
    gyms: [
      {
        name: 'Olympia',
        role: 'leader',
        badge: 'Psychic Badge',
        specialty: 'psychic',
        team: [
          [561, 44],
          [199, 45],
          [678, 48],
        ],
      }, // Sigilyph, Slowking, Meowstic
    ],
  }),
  area({
    key: 'ka-flare-hq',
    name: 'Lysandre Labs & the Team Flare Secret HQ',
    orderIndex: 619,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 44,
    maxLevel: 53,
    weights: W.trainersOnly,
    tier: 4,
    // The Master Ball, left in Lysandre's lab: one per region, in its villains' hideout.
    once: [['master-ball', 2, 1, 1, true]],
    wild: [],
    trainers: [
      {
        name: 'Team Flare Grunt',
        team: [
          [229, 46],
          [452, 46],
        ],
      }, // Houndoom, Drapion
      {
        name: 'Team Flare Grunt',
        team: [
          [310, 46],
          [454, 46],
        ],
      }, // Manectric, Toxicroak
      {
        name: 'Team Flare Grunt',
        team: [
          [317, 46],
          [510, 47],
        ],
      }, // Swalot, Liepard
      {
        name: 'Flare Admin Mable',
        team: [
          [229, 48],
          [461, 48],
        ],
      }, // Houndoom, Weavile
      {
        name: 'Flare Admin Bryony',
        team: [
          [510, 48],
          [625, 49],
        ],
      }, // Liepard, Bisharp
    ],
    // The story's last stand under Geosenge: Xerosic, then Lysandre himself. No badge.
    gyms: [
      {
        name: 'Xerosic',
        role: 'leader',
        specialty: 'dark',
        team: [
          [342, 46],
          [101, 46],
          [687, 48],
        ],
      }, // Crawdaunt, Electrode, Malamar
      {
        name: 'Lysandre',
        role: 'leader',
        specialty: 'fire',
        team: [
          [430, 51],
          [130, 53],
          [668, 53],
        ],
      }, // Honchkrow, Gyarados, Pyroar
    ],
  }),
  area({
    key: 'ka-couriway',
    name: 'Route 19 & Couriway Town',
    orderIndex: 620,
    banner: { scene: 'swamp', flip: true },
    roundsToClear: 1,
    minLevel: 46,
    maxLevel: 51,
    weights: W.mixed,
    tier: 4,
    // The only Razor Fang in the game, for the Gligar of Route 19.
    once: [
      ['razor-fang', 8, 1, 1, true],
    ],
    wild: [
      [705, 10, 46, 49], // Sliggoo
      [195, 14, 46, 49], // Quagsire
      [618, 10, 46, 49], // Stunfisk
      [452, 8, 46, 49], // Drapion
      [70, 8, 46, 48], // Weepinbell
      [588, 6, 46, 48], // Karrablast
      [616, 6, 46, 48], // Shelmet
      [93, 6, 46, 48], // Haunter
      [455, 6, 46, 49], // Carnivine
      [207, 6, 46, 49], // Gligar
      [24, 4, 46, 49], // Arbok
      [61, 6, 46, 49], // Poliwhirl
    ],
    trainers: [
      {
        name: 'Ace Trainer Rachel',
        team: [
          [705, 49],
          [452, 49],
        ],
      },
      {
        name: 'Fisherman Jeff',
        team: [
          [61, 49],
          [130, 49],
        ],
      },
      {
        name: 'Pokémon Ranger Chaise',
        team: [
          [207, 50],
          [455, 50],
        ],
      },
    ],
  }),
  area({
    key: 'ka-snowbelle',
    name: 'Route 20, the Pokémon Village & Snowbelle City',
    orderIndex: 621,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 48,
    maxLevel: 59,
    weights: W.mixed,
    tier: 4,
    wild: [
      [709, 12, 48, 51], // Trevenant
      [591, 10, 48, 51], // Amoonguss
      [164, 10, 48, 51], // Noctowl
      [576, 8, 48, 51], // Gothitelle
      [39, 8, 48, 51], // Jigglypuff
      [571, 4, 48, 51], // Zoroark
      [185, 6, 48, 51], // Sudowoodo
      [354, 8, 48, 51], // Banette
      [569, 8, 48, 51], // Garbodor
      [132, 4, 48, 51], // Ditto
    ],
    trainers: [
      {
        name: 'Ace Trainer Gwendolyn',
        team: [
          [709, 52],
          [575, 52],
        ],
      },
      {
        name: 'Hex Maniac Hazel',
        team: [
          [354, 53],
          [711, 53],
        ],
      },
      {
        name: 'Furisode Girl Katherine',
        team: [
          [713, 54],
          [478, 54],
        ],
      },
      {
        name: 'Team Flare Grunt',
        team: [
          [229, 53],
          [461, 53],
        ],
      }, // Houndoom, Weavile
    ],
    gyms: [
      {
        name: 'Wulfric',
        role: 'leader',
        badge: 'Iceberg Badge',
        specialty: 'ice',
        team: [
          [460, 56],
          [615, 55],
          [713, 59],
        ],
      }, // Abomasnow, Cryogonal, Avalugg
    ],
  }),
  area({
    key: 'ka-victory-road',
    name: 'Route 21 & Victory Road',
    orderIndex: 622,
    banner: { scene: 'cave_dark' },
    roundsToClear: 2,
    minLevel: 50,
    maxLevel: 60,
    weights: W.busy,
    tier: 5,
    wild: [
      [714, 10, 45, 47], // Noibat
      [75, 12, 50, 58], // Graveler
      [168, 8, 50, 58], // Ariados
      [533, 8, 50, 58], // Gurdurr
      [621, 8, 50, 58], // Druddigon
      [108, 6, 50, 58], // Lickitung
      [327, 8, 50, 58], // Spinda
      [217, 8, 50, 58], // Ursaring
      [334, 6, 50, 58], // Altaria
      [123, 6, 50, 58], // Scyther
      [227, 6, 52, 58], // Skarmory
      [634, 2, 52, 58], // Zweilous
      [148, 2, 50, 54], // Dragonair
    ],
    trainers: [
      {
        name: 'Ace Trainer Robbie',
        team: [
          [706, 56],
          [635, 56],
        ],
      },
      {
        name: 'Ace Trainer Corinne',
        team: [
          [715, 56],
          [697, 56],
        ],
      },
      {
        name: 'Veteran Isaac',
        team: [
          [713, 57],
          [681, 57],
        ],
      },
      {
        name: 'Veteran Sabine',
        team: [
          [699, 57],
          [691, 57],
        ],
      },
      // The last of the rival battles, at the end of Victory Road. Her starter stays out (trainers never field one).
      {
        name: 'Serena',
        team: [
          [678, 57],
          [359, 57],
          [135, 59],
        ],
      }, // Meowstic, Absol, Jolteon
    ],
  }),
  area({
    key: 'ka-pokemon-league',
    name: 'The Pokémon League',
    orderIndex: 623,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Ace Trainer Sherlock',
        team: [
          [706, 60],
          [697, 60],
        ],
      },
      {
        name: 'Veteran Isaac',
        team: [
          [713, 61],
          [681, 61],
        ],
      },
    ],
    // X and Y's league. Each roster is the user's three: Gen 6 Pokémon first, then the highest levels.
    gyms: [
      {
        name: 'Elite Four Malva',
        role: 'elite',
        specialty: 'fire',
        team: [
          [668, 63],
          [609, 63],
          [663, 65],
        ],
      }, // Pyroar, Chandelure, Talonflame
      {
        name: 'Elite Four Siebold',
        role: 'elite',
        specialty: 'water',
        team: [
          [693, 63],
          [130, 63],
          [689, 65],
        ],
      }, // Clawitzer, Gyarados, Barbaracle
      {
        name: 'Elite Four Wikstrom',
        role: 'elite',
        specialty: 'steel',
        team: [
          [707, 63],
          [212, 63],
          [681, 65],
        ],
      }, // Klefki, Scizor, Aegislash
      {
        name: 'Elite Four Drasna',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [691, 63],
          [621, 63],
          [715, 65],
        ],
      }, // Dragalge, Druddigon, Noivern
      {
        name: 'Champion Diantha',
        role: 'champion',
        specialty: 'fairy',
        team: [
          [697, 65],
          [699, 65],
          [706, 66],
        ],
      }, // Tyrantrum, Aurorus, Goodra
    ],
  }),
  // The endgame lap every region has: a levelling Victory Road II, then the Elite Four again at rematch levels with
  // the Champion last. Kiloude City and the Friend Safari are side areas the league opens, as Unova's are.
  area({
    key: 'ka-victory-road-ii',
    name: 'Victory Road II',
    orderIndex: 624,
    banner: { scene: 'cave_dark', flip: true },
    roundsToClear: 1,
    minLevel: 63,
    maxLevel: 72,
    weights: { wild: 4, trainer: 3, center: 1, item: 1 },
    tier: 5,
    wild: [
      [715, 10, 63, 68], // Noivern
      [706, 6, 63, 68], // Goodra
      [76, 12, 63, 68], // Golem
      [168, 10, 63, 68], // Ariados
      [534, 10, 63, 68], // Conkeldurr
      [621, 10, 63, 68], // Druddigon
      [227, 10, 63, 68], // Skarmory
      [635, 4, 66, 70], // Hydreigon
      [149, 2, 66, 70], // Dragonite
    ],
    trainers: [
      {
        name: 'Ace Trainer Robbie II',
        team: [
          [706, 68],
          [635, 68],
        ],
      },
      {
        name: 'Ace Trainer Corinne II',
        team: [
          [715, 68],
          [697, 68],
        ],
      },
      {
        name: 'Veteran Sabine II',
        team: [
          [699, 69],
          [691, 69],
        ],
      },
    ],
  }),
  area({
    key: 'ka-pokemon-league-ii',
    name: 'The Pokémon League II',
    orderIndex: 625,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 68,
    maxLevel: 78,
    weights: { wild: 0, trainer: 2, center: 1, item: 1 },
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Ace Trainer Robbie II',
        team: [
          [706, 68],
          [635, 68],
        ],
      },
      {
        name: 'Veteran Sabine II',
        team: [
          [699, 69],
          [691, 69],
        ],
      },
    ],
    gyms: [
      {
        name: 'Elite Four Malva II',
        role: 'elite',
        specialty: 'fire',
        team: [
          [668, 71],
          [609, 71],
          [663, 73],
        ],
      }, // Pyroar, Chandelure, Talonflame
      {
        name: 'Elite Four Siebold II',
        role: 'elite',
        specialty: 'water',
        team: [
          [693, 71],
          [130, 71],
          [689, 73],
        ],
      }, // Clawitzer, Gyarados, Barbaracle
      {
        name: 'Elite Four Wikstrom II',
        role: 'elite',
        specialty: 'steel',
        team: [
          [707, 71],
          [212, 71],
          [681, 73],
        ],
      }, // Klefki, Scizor, Aegislash
      {
        name: 'Elite Four Drasna II',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [691, 71],
          [621, 71],
          [715, 73],
        ],
      }, // Dragalge, Druddigon, Noivern
      {
        name: 'Champion Diantha II',
        role: 'champion',
        specialty: 'fairy',
        team: [
          [697, 73],
          [699, 73],
          [706, 74],
        ],
      }, // Tyrantrum, Aurorus, Goodra
    ],
  }),
  area({
    key: 'ka-kiloude',
    name: 'Kiloude City & the Battle Maison',
    orderIndex: 626,
    banner: { scene: 'sunset' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ka-pokemon-league' }],
    wild: [
      [327, 10, 60, 66], // Spinda
      [419, 10, 60, 66], // Floatzel
      [217, 10, 60, 66], // Ursaring
      [334, 10, 60, 66], // Altaria
      [123, 8, 60, 66], // Scyther
      [149, 2, 62, 66], // Dragonite
      [673, 10, 60, 66], // Gogoat
      [675, 10, 60, 66], // Pangoro
      [687, 8, 60, 66], // Malamar
      [700, 4, 62, 66], // Sylveon
    ],
    trainers: [
      {
        name: 'Ace Trainer Bernard',
        team: [
          [675, 64],
          [687, 64],
        ],
      },
      {
        name: 'Veteran Abigail',
        team: [
          [700, 65],
          [673, 65],
        ],
      },
      {
        name: 'Rising Star Isaiah',
        team: [
          [663, 64],
          [695, 64],
        ],
      },
    ],
    gyms: [
      // The four Battle Chatelaines of the Maison, each with her Gen 6 favourites.
      {
        name: 'Battle Chatelaine Nita',
        role: 'leader',
        specialty: 'fairy',
        team: [
          [683, 64],
          [685, 64],
          [671, 66],
        ],
      }, // Aromatisse, Slurpuff, Florges
      {
        name: 'Battle Chatelaine Evelyn',
        role: 'leader',
        specialty: 'fighting',
        team: [
          [701, 65],
          [675, 65],
          [660, 67],
        ],
      }, // Hawlucha, Pangoro, Diggersby
      {
        name: 'Battle Chatelaine Dana',
        role: 'leader',
        specialty: 'psychic',
        team: [
          [678, 66],
          [687, 66],
          [681, 68],
        ],
      }, // Meowstic, Malamar, Aegislash
      {
        name: 'Battle Chatelaine Morgan',
        role: 'leader',
        specialty: 'dragon',
        team: [
          [691, 67],
          [715, 67],
          [706, 69],
        ],
      }, // Dragalge, Noivern, Goodra
    ],
  }),
  area({
    key: 'ka-friend-safari',
    name: 'The Friend Safari',
    orderIndex: 627,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 76,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ka-pokemon-league' }],
    // Every Kalos species, so the Pokédex can be finished after the league: Kiloude's safari of friends' types.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Margaux', specialty: 'fairy', size: 3 },
      { name: 'Veteran Lucien', specialty: 'dragon', size: 3 },
      { name: 'Pokémon Ranger Elsa', specialty: 'grass', size: 3 },
    ],
  }),

  // ---------------------------------------------------------------- secret areas
  // Every one carries the stricter gate of docs/11-GEN6-9-REGIONS-PLAN.md: a story point, a share of the Kalos
  // Pokédex (70 % for a box legendary, 85 % for a mythical) and a Pokémon at the boss's own level.

  area({
    key: 'ka-flare-hq-depths',
    name: 'The Team Flare Secret HQ Depths',
    orderIndex: 651,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Xerneas and Yveltal, under Geosenge where the ultimate weapon slept. Both, one visit, as the versions merge.
    conditions: [
      { kind: 'area', areaId: 'ka-pokemon-league' },
      { kind: 'pokedex', count: KALOS_DEX.box },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [
      { dex: 716, level: 65 }, // Xerneas
      { dex: 717, level: 65 }, // Yveltal
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ka-terminus-cave',
    name: 'Terminus Cave',
    orderIndex: 652,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 72,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Zygarde, in the deepest chamber of the cave past Route 18.
    conditions: [
      { kind: 'area', areaId: 'ka-pokemon-league' },
      { kind: 'pokedex', count: KALOS_DEX.box },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 718, level: 70 }],
    wild: [
      [632, 16, 62, 68], // Durant
      [168, 14, 62, 68], // Ariados
      [76, 14, 62, 68], // Golem
      [715, 10, 62, 68], // Noivern
      [306, 8, 62, 68], // Aggron
      [248, 4, 64, 70], // Tyranitar
      [28, 12, 62, 68], // Sandslash
    ],
    trainers: [],
  }),
  area({
    key: 'ka-diamond-domain',
    name: 'The Diamond Domain',
    orderIndex: 653,
    banner: { scene: 'crystal_cave', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 68,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Diancie, under the Carbink of the Reflection Cave.
    conditions: [
      { kind: 'area', areaId: 'ka-pokemon-league' },
      { kind: 'pokedex', count: KALOS_DEX.mythical },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [{ dex: 719, level: 65, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ka-hoopa-ring',
    name: "Hoopa's Ring",
    orderIndex: 654,
    banner: { scene: 'sky' },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Hoopa the trickster, whose rings bring it wherever there is mischief: after the Diamond Domain, as the films go.
    conditions: [
      { kind: 'area', areaId: 'ka-diamond-domain' },
      { kind: 'pokedex', count: KALOS_DEX.mythical },
      { kind: 'maxLevel', level: 68 },
    ],
    bosses: [{ dex: 720, level: 68, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ka-nebel-plateau',
    name: 'The Nebel Plateau',
    orderIndex: 655,
    banner: { scene: 'volcano' },
    roundsToClear: 1,
    minLevel: 64,
    maxLevel: 72,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Volcanion, in the mountains it guards from humans.
    conditions: [
      { kind: 'area', areaId: 'ka-hoopa-ring' },
      { kind: 'pokedex', count: KALOS_DEX.mythical },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 721, level: 70, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
]
