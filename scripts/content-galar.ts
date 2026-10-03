// Galar, in order of discovery, routed on Sword and Shield with the Isle of Armor and the Crown Tundra after the
// league. Same shape as content-kalos.ts.
//
// Wild pools are the games' own, read off PokeAPI's encounter tables (Sword, Shield and both DLCs merged); the Wild
// Area's Pokémon are taken at the levels a player meets them first. Every Gen 8 species, or the first stage of its
// line, has a home outside the catch-all — Hisui's seven too: Sword and Shield have none of them, so they come in
// through the Space-Time Rift, a side area the league opens (Legends: Arceus's own way into Hisui).
//
// The two version-exclusive gyms are fought back to back, as Striaton's three brothers are: Allister then Bea in
// Stow-on-Side, Melony then Gordie in Circhester, and the second hands over the badge. The league is the Champion Cup
// at Wyndon Stadium: Marnie in the semi-final, then the finals against Nessa, Bea and Raihan, then Leon. Teams over
// three keep the Gen 8 Pokémon first, then the highest levels (the user's rule).
import { area, DECK as W, type AreaPlan } from './content'

/** Galar's starters: Grookey, Scorbunny, Sobble. */
export const GALAR_STARTERS = [810, 813, 816]

/**
 * The Pokédex gates of the secret areas, as plain counts of the Galar Pokédex: 55 % for the trios, Kubfu and Enamorus,
 * 70 % for a box legendary, 85 % for a mythical, of the 314 species catchable in Galar, counted when the region was built.
 * tests/region-content.test.ts holds the floor.
 */
export const GALAR_DEX = { trio: 173, box: 220, mythical: 267 }

/** Galar areas sit at 801+, after Alola's 701+. */
export const GALAR_AREAS: AreaPlan[] = [
  area({
    key: 'ga-route-1',
    name: 'Postwick, Route 1 & the Slumbering Weald',
    orderIndex: 801,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 6,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [819, 24, 2, 6], // Skwovet
      [821, 16, 3, 6], // Rookidee
      [824, 14, 2, 5], // Blipbug
      [831, 10, 3, 6], // Wooloo
      [10, 8, 2, 5], // Caterpie
      [736, 8, 2, 5], // Grubbin
      [827, 6, 3, 6], // Nickit
      [163, 6, 2, 5], // Hoothoot
    ],
    trainers: [],
  }),
  area({
    key: 'ga-route-2',
    name: 'Wedgehurst & Route 2',
    orderIndex: 802,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 2,
    minLevel: 4,
    maxLevel: 9,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [833, 16, 4, 8], // Chewtle
      [835, 14, 5, 8], // Yamper
      [821, 10, 4, 7], // Rookidee
      [824, 8, 4, 6], // Blipbug
      [819, 8, 5, 7], // Skwovet
      [827, 6, 5, 7], // Nickit
      [273, 6, 4, 6], // Seedot
      [509, 6, 4, 6], // Purrloin
      [270, 6, 4, 6], // Lotad
      [846, 4, 4, 6], // Arrokuda
      [263, 4, 5, 7], // Zigzagoon
      [129, 8, 4, 6], // Magikarp
    ],
    trainers: [
      {
        name: 'Youngster Ivan',
        team: [
          [819, 7],
          [821, 7],
        ],
      },
      {
        name: 'Lass Chloe',
        team: [
          [831, 7],
          [835, 7],
        ],
      },
      { name: 'Hop', team: [[831, 8]] }, // Wooloo
    ],
  }),
  area({
    key: 'ga-wild-area',
    name: 'The Wild Area: Rolling Fields & Dappled Grove',
    orderIndex: 803,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 7,
    maxLevel: 13,
    weights: W.mixed,
    tier: 1,
    wild: [
      [659, 10, 7, 12], // Bunnelby
      [519, 10, 7, 12], // Pidove
      [50, 8, 8, 12], // Diglett
      [524, 8, 8, 12], // Roggenrola
      [309, 8, 7, 12], // Electrike
      [674, 8, 7, 12], // Pancham
      [582, 6, 7, 12], // Vanillite
      [280, 4, 8, 12], // Ralts
      [343, 6, 7, 12], // Baltoy
      [535, 6, 11, 12], // Tympole
      [43, 6, 11, 12], // Oddish
      [595, 4, 11, 12], // Joltik
      [759, 4, 11, 12], // Stufful
      [236, 2, 8, 12], // Tyrogue
    ],
    trainers: [
      {
        name: 'Backpacker Tobias',
        team: [
          [659, 11],
          [519, 11],
        ],
      },
      {
        name: 'Pokémon Breeder Lily',
        team: [
          [280, 11],
          [535, 11],
        ],
      },
      {
        name: 'Hop',
        team: [
          [831, 11],
          [821, 12],
        ],
      }, // Wooloo, Rookidee
    ],
  }),
  area({
    key: 'ga-galar-mine',
    name: 'Motostoke, Route 3 & the Galar Mine',
    orderIndex: 804,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 9,
    maxLevel: 16,
    weights: W.casino,
    tier: 1,
    // Motostoke, Galar's first big city, carries its Game Corner deck.
    wild: [
      [837, 12, 10, 14], // Rolycoly
      [527, 12, 11, 16], // Woobat
      [819, 10, 8, 13], // Skwovet
      [821, 8, 8, 13], // Rookidee
      [829, 8, 10, 14], // Gossifleur
      [66, 6, 8, 13], // Machop
      [420, 6, 8, 13], // Cherubi
      [532, 6, 11, 14], // Timburr
      [524, 6, 11, 14], // Roggenrola
      [529, 4, 11, 14], // Drilbur
      [599, 4, 8, 13], // Klink
      [568, 4, 10, 14], // Trubbish
      [850, 2, 8, 13], // Sizzlipede
    ],
    trainers: [
      {
        name: 'Worker Mitchell',
        team: [
          [837, 14],
          [66, 14],
        ],
      },
      {
        name: 'Hiker Bart',
        team: [
          [524, 14],
          [527, 14],
        ],
      },
      {
        name: 'Bede',
        team: [
          [577, 15],
          [574, 15],
          [856, 16],
        ],
      }, // Solosis, Gothita, Hatenna
    ],
  }),
  area({
    key: 'ga-turffield',
    name: 'Route 4 & Turffield',
    orderIndex: 805,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 20,
    weights: W.mixed,
    tier: 2,
    wild: [
      [52, 12, 13, 16], // Meowth
      [868, 8, 13, 15], // Milcery
      [831, 8, 13, 15], // Wooloo
      [835, 8, 14, 16], // Yamper
      [309, 8, 14, 16], // Electrike
      [710, 6, 14, 16], // Pumpkaboo
      [833, 6, 13, 15], // Chewtle
      [595, 4, 13, 15], // Joltik
      [742, 4, 13, 15], // Cutiefly
      [406, 4, 13, 15], // Budew
      [25, 2, 14, 16], // Pikachu
      [133, 2, 14, 16], // Eevee
    ],
    trainers: [
      {
        name: 'Youngster Henry',
        team: [
          [831, 17],
          [835, 17],
        ],
      },
      {
        name: 'Madame Imelda',
        team: [
          [868, 17],
          [710, 17],
        ],
      },
      {
        name: 'Team Yell Grunt',
        team: [
          [827, 17],
          [509, 17],
        ],
      }, // Nickit, Purrloin
    ],
    gyms: [
      {
        name: 'Milo',
        role: 'leader',
        badge: 'Grass Badge',
        specialty: 'grass',
        team: [
          [829, 19],
          [830, 20],
        ],
      }, // Gossifleur, Eldegoss
    ],
  }),
  area({
    key: 'ga-hulbury',
    name: 'Route 5 & Hulbury',
    orderIndex: 806,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 16,
    maxLevel: 24,
    weights: W.mixed,
    tier: 2,
    // Applin's two apples, each found once on the way: Flapple from the tart, Appletun from the sweet.
    once: [
      ['tart-apple', 6, 1, 1, true],
      ['sweet-apple', 6, 1, 1, true],
    ],
    wild: [
      [840, 6, 16, 18], // Applin
      [825, 8, 16, 18], // Dottler
      [848, 4, 16, 18], // Toxel
      [759, 8, 19, 21], // Stufful
      [684, 6, 16, 21], // Swirlix
      [682, 6, 16, 21], // Spritzee
      [677, 6, 16, 18], // Espurr
      [572, 6, 19, 21], // Minccino
      [274, 4, 16, 18], // Nuzleaf
      [271, 4, 16, 18], // Lombre
      [83, 4, 19, 21], // Farfetch'd
      [846, 10, 20, 24], // Arrokuda
      [170, 6, 20, 24], // Chinchou
      [550, 4, 20, 24], // Basculin
    ],
    trainers: [
      {
        name: 'Fisher Mark',
        team: [
          [846, 20],
          [170, 20],
        ],
      },
      {
        name: 'Swimmer Lucy',
        team: [
          [833, 21],
          [550, 21],
        ],
      },
      {
        name: 'Team Yell Grunt',
        team: [
          [263, 21],
          [827, 21],
        ],
      }, // Zigzagoon, Nickit
    ],
    gyms: [
      {
        name: 'Nessa',
        role: 'leader',
        badge: 'Water Badge',
        specialty: 'water',
        team: [
          [118, 22],
          [846, 23],
          [834, 24],
        ],
      }, // Goldeen, Arrokuda, Drednaw
    ],
  }),
  area({
    key: 'ga-motostoke',
    name: 'Galar Mine No. 2 & Motostoke Stadium',
    orderIndex: 807,
    banner: { scene: 'cave', flip: true },
    roundsToClear: 1,
    minLevel: 20,
    maxLevel: 27,
    weights: W.mixed,
    tier: 2,
    wild: [
      [339, 10, 20, 24], // Barboach
      [833, 10, 20, 21], // Chewtle
      [422, 8, 20, 24], // Shellos
      [767, 8, 20, 24], // Wimpod
      [341, 6, 20, 24], // Corphish
      [714, 6, 20, 24], // Noibat
      [688, 6, 20, 24], // Binacle
      [559, 6, 20, 24], // Scraggy
      [453, 6, 20, 24], // Croagunk
      [618, 4, 20, 24], // Stunfisk
      [213, 2, 20, 24], // Shuckle
      [850, 6, 20, 24], // Sizzlipede
    ],
    trainers: [
      {
        name: 'Hiker Corey',
        team: [
          [838, 25],
          [688, 25],
        ],
      },
      {
        name: 'Black Belt Kenzo',
        team: [
          [559, 25],
          [453, 25],
        ],
      },
      {
        name: 'Hop',
        team: [
          [831, 25],
          [822, 25],
        ],
      }, // Wooloo, Corvisquire
    ],
    gyms: [
      {
        name: 'Kabu',
        role: 'leader',
        badge: 'Fire Badge',
        specialty: 'fire',
        team: [
          [38, 25],
          [59, 25],
          [851, 27],
        ],
      }, // Ninetales, Arcanine, Centiskorch
    ],
  }),
  area({
    key: 'ga-outskirts',
    name: 'Motostoke Outskirts & the Wild Area South',
    orderIndex: 808,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 22,
    maxLevel: 29,
    weights: W.busy,
    tier: 3,
    wild: [
      [856, 8, 22, 26], // Hatenna
      [859, 6, 21, 24], // Impidimp
      [164, 8, 22, 26], // Noctowl
      [185, 6, 22, 26], // Sudowoodo
      [624, 6, 21, 24], // Pawniard
      [109, 6, 22, 26], // Koffing
      [757, 4, 22, 26], // Salandit
      [561, 8, 26, 29], // Sigilyph
      [822, 8, 26, 29], // Corvisquire
      [830, 6, 26, 29], // Eldegoss
      [451, 6, 26, 29], // Skorupi
      [586, 4, 26, 29], // Sawsbuck
    ],
    trainers: [
      {
        name: 'Team Yell Grunt',
        team: [
          [509, 26],
          [559, 26],
        ],
      }, // Purrloin, Scraggy
      {
        name: 'Team Yell Grunt',
        team: [
          [827, 26],
          [453, 26],
        ],
      }, // Nickit, Croagunk
      {
        name: 'Cameraman Rolf',
        team: [
          [856, 27],
          [561, 27],
        ],
      },
      {
        name: 'Marnie',
        team: [
          [509, 26],
          [859, 27],
        ],
      }, // Purrloin, Impidimp
    ],
  }),
  area({
    key: 'ga-route-6',
    name: 'Hammerlocke & Route 6',
    orderIndex: 809,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 26,
    maxLevel: 33,
    weights: W.mixed,
    tier: 3,
    // Cara Liss's fossils on Route 6: each pair she restores, found once — the only Dracozolt, Arctozolt, Dracovish and
    // Arctovish in Galar.
    once: [
      ['bird-and-drake-fossils', 4, 1, 1, true],
      ['bird-and-dino-fossils', 4, 1, 1, true],
      ['fish-and-drake-fossils', 4, 1, 1, true],
      ['fish-and-dino-fossils', 4, 1, 1, true],
    ],
    wild: [
      [843, 10, 28, 30], // Silicobra
      [562, 10, 29, 33], // Yamask
      [694, 8, 29, 33], // Helioptile
      [51, 8, 29, 33], // Dugtrio
      [355, 6, 28, 30], // Duskull
      [632, 6, 28, 30], // Durant
      [631, 6, 28, 30], // Heatmor
      [556, 4, 29, 33], // Maractus
      [449, 6, 28, 30], // Hippopotas
      [610, 2, 29, 33], // Axew
      [328, 2, 29, 33], // Trapinch
      [701, 2, 28, 30], // Hawlucha
    ],
    trainers: [
      {
        name: 'Backpacker Rhonda',
        team: [
          [843, 30],
          [449, 30],
        ],
      },
      {
        name: 'Doctor Hyde',
        team: [
          [562, 31],
          [355, 31],
        ],
      },
      {
        name: 'Hiker Calvin',
        team: [
          [51, 31],
          [632, 31],
        ],
      },
    ],
  }),
  area({
    key: 'ga-stow-on-side',
    name: 'Stow-on-Side',
    orderIndex: 810,
    banner: { scene: 'dunes', flip: true },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 36,
    weights: W.mixed,
    tier: 3,
    wild: [
      [856, 10, 30, 31], // Hatenna
      [859, 10, 30, 31], // Impidimp
      [843, 8, 30, 33], // Silicobra
      [624, 8, 30, 34], // Pawniard
      [562, 6, 30, 33], // Yamask
      [538, 6, 30, 34], // Throh
      [539, 6, 30, 34], // Sawk
      [302, 4, 30, 34], // Sableye
    ],
    trainers: [
      {
        name: 'Black Belt Glenn',
        team: [
          [538, 33],
          [539, 33],
        ],
      },
      {
        name: 'Artist Mia',
        team: [
          [857, 33],
          [860, 33],
        ],
      },
      {
        name: 'Bede',
        team: [
          [578, 33],
          [575, 33],
          [857, 34],
        ],
      }, // Duosion, Gothorita, Hattrem
    ],
    gyms: [
      // Sword's and Shield's leaders, back to back: Allister first, then Bea and her Fighting Badge.
      {
        name: 'Allister',
        role: 'leader',
        specialty: 'ghost',
        team: [
          [778, 34],
          [864, 35],
          [94, 36],
        ],
      }, // Mimikyu, Cursola, Gengar
      {
        name: 'Bea',
        role: 'leader',
        badge: 'Fighting Badge',
        specialty: 'fighting',
        team: [
          [675, 34],
          [865, 35],
          [68, 36],
        ],
      }, // Pangoro, Sirfetch'd, Machamp
    ],
  }),
  area({
    key: 'ga-ballonlea',
    name: 'Glimwood Tangle & Ballonlea',
    orderIndex: 811,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 31,
    maxLevel: 38,
    weights: W.mixed,
    tier: 3,
    // The Cracked Pot, for Sinistea, from the antique shop the path passes.
    once: [['cracked-pot', 6, 1, 1, true]],
    wild: [
      [860, 10, 34, 38], // Morgrem
      [857, 6, 34, 36], // Hattrem
      [854, 6, 34, 36], // Sinistea
      [876, 6, 34, 36], // Indeedee
      [756, 8, 34, 36], // Shiinotic
      [708, 6, 34, 36], // Phantump
      [684, 4, 34, 36], // Swirlix
      [682, 4, 34, 36], // Spritzee
      [77, 4, 34, 36], // Ponyta
      [766, 4, 34, 36], // Passimian
      [765, 4, 34, 36], // Oranguru
    ],
    trainers: [
      {
        name: 'Model Gina',
        team: [
          [858, 36],
          [869, 36],
        ],
      },
      {
        name: 'Musician Elliott',
        team: [
          [756, 36],
          [860, 36],
        ],
      },
      {
        name: 'Madame Celeste',
        team: [
          [855, 37],
          [868, 37],
        ],
      },
    ],
    gyms: [
      {
        name: 'Opal',
        role: 'leader',
        badge: 'Fairy Badge',
        specialty: 'fairy',
        team: [
          [110, 36],
          [468, 37],
          [869, 38],
        ],
      }, // Weezing, Togekiss, Alcremie
    ],
  }),
  area({
    key: 'ga-route-7',
    name: 'Routes 7 & 8',
    orderIndex: 812,
    banner: { scene: 'mountains', flip: true },
    roundsToClear: 1,
    minLevel: 36,
    maxLevel: 42,
    weights: W.mixed,
    tier: 4,
    wild: [
      [870, 8, 38, 40], // Falinks
      [877, 6, 37, 41], // Morpeko
      [863, 6, 37, 41], // Perrserker
      [828, 8, 37, 41], // Thievul
      [848, 4, 29, 29], // Toxel
      [510, 6, 36, 41], // Liepard
      [596, 6, 37, 41], // Galvantula
      [823, 4, 36, 40], // Corviknight
      [588, 4, 36, 40], // Karrablast
      [616, 4, 36, 40], // Shelmet
      [844, 6, 38, 40], // Sandaconda
      [558, 6, 38, 40], // Crustle
      [622, 4, 39, 41], // Golett
      [356, 4, 38, 40], // Dusclops
    ],
    trainers: [
      {
        name: 'Dancer Rowena',
        team: [
          [877, 40],
          [863, 40],
        ],
      },
      {
        name: 'Reporter Ellie',
        team: [
          [828, 40],
          [596, 40],
        ],
      },
      {
        name: 'Team Yell Grunt',
        team: [
          [510, 40],
          [860, 40],
        ],
      }, // Liepard, Morgrem
      {
        name: 'Hop',
        team: [
          [832, 40],
          [823, 40],
          [871, 40],
        ],
      }, // Dubwool, Corviknight, Pincurchin
    ],
  }),
  area({
    key: 'ga-circhester',
    name: 'Steamdrift Way & Circhester',
    orderIndex: 813,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 38,
    maxLevel: 44,
    weights: W.mixed,
    tier: 4,
    wild: [
      [872, 12, 38, 43], // Snom
      [215, 8, 37, 39], // Sneasel
      [361, 8, 39, 41], // Snorunt
      [459, 6, 38, 39], // Snover
      [225, 6, 38, 41], // Delibird
      [583, 6, 39, 43], // Vanillish
      [554, 2, 33, 34], // Darumaka
      [538, 2, 39, 43], // Throh
      [539, 2, 39, 43], // Sawk
    ],
    trainers: [
      {
        name: 'Hiker Laurie',
        team: [
          [839, 42],
          [874, 42],
        ],
      },
      {
        name: 'Pokémon Breeder Dina',
        team: [
          [873, 42],
          [875, 42],
        ],
      },
      {
        name: 'Policeman Archie',
        team: [
          [215, 42],
          [584, 42],
        ],
      },
    ],
    gyms: [
      // Shield's and Sword's leaders, back to back: Melony first, then Gordie and his Rock Badge.
      {
        name: 'Melony',
        role: 'leader',
        specialty: 'ice',
        team: [
          [873, 40],
          [875, 41],
          [131, 42],
        ],
      }, // Frosmoth, Eiscue, Lapras
      {
        name: 'Gordie',
        role: 'leader',
        badge: 'Rock Badge',
        specialty: 'rock',
        team: [
          [689, 40],
          [874, 41],
          [839, 42],
        ],
      }, // Barbaracle, Stonjourner, Coalossal
    ],
  }),
  area({
    key: 'ga-spikemuth',
    name: 'Route 9 & Spikemuth',
    orderIndex: 814,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 39,
    maxLevel: 46,
    weights: W.mixed,
    tier: 4,
    wild: [
      [845, 8, 38, 42], // Cramorant
      [852, 8, 32, 34], // Clobbopus
      [871, 6, 38, 42], // Pincurchin
      [224, 8, 38, 42], // Octillery
      [279, 8, 39, 44], // Pelipper
      [211, 6, 27, 29], // Qwilfish
      [593, 6, 39, 44], // Jellicent
      [99, 6, 38, 42], // Kingler
      [458, 6, 39, 43], // Mantyke
      [747, 6, 35, 37], // Mareanie
      [222, 4, 36, 37], // Corsola
      [712, 6, 36, 36], // Bergmite
    ],
    trainers: [
      {
        name: 'Team Yell Grunt',
        team: [
          [828, 43],
          [559, 43],
        ],
      }, // Thievul, Scraggy
      {
        name: 'Team Yell Grunt',
        team: [
          [675, 43],
          [860, 43],
        ],
      }, // Pangoro, Morgrem
      {
        name: 'Swimmer Pamela',
        team: [
          [845, 43],
          [593, 43],
        ],
      },
      {
        name: 'Marnie',
        team: [
          [510, 43],
          [454, 43],
          [860, 44],
        ],
      }, // Liepard, Toxicroak, Morgrem
    ],
    gyms: [
      {
        name: 'Piers',
        role: 'leader',
        badge: 'Dark Badge',
        specialty: 'dark',
        team: [
          [687, 45],
          [435, 45],
          [862, 46],
        ],
      }, // Malamar, Skuntank, Obstagoon
    ],
  }),
  area({
    key: 'ga-hammerlocke',
    name: 'Hammerlocke Hills & the Lake of Outrage',
    orderIndex: 815,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 42,
    maxLevel: 48,
    weights: W.mixed,
    tier: 4,
    wild: [
      [878, 10, 31, 33], // Cufant
      [884, 4, 42, 46], // Duraludon
      [885, 2, 42, 46], // Dreepy
      [436, 8, 31, 32], // Bronzor
      [596, 6, 42, 46], // Galvantula
      [738, 6, 42, 46], // Vikavolt
      [208, 4, 42, 46], // Steelix
      [760, 6, 42, 46], // Bewear
      [610, 4, 36, 37], // Axew
      [612, 2, 44, 46], // Haxorus
    ],
    trainers: [
      {
        name: 'Clerk Bryce',
        team: [
          [884, 45],
          [879, 45],
        ],
      },
      {
        name: 'Clerk Augustin',
        team: [
          [437, 45],
          [596, 45],
        ],
      },
      {
        name: 'Hiker Malcolm',
        team: [
          [208, 46],
          [879, 46],
        ],
      },
    ],
    gyms: [
      {
        name: 'Raihan',
        role: 'leader',
        badge: 'Dragon Badge',
        specialty: 'dragon',
        team: [
          [844, 46],
          [330, 47],
          [884, 48],
        ],
      }, // Sandaconda, Flygon, Duraludon
    ],
  }),
  area({
    key: 'ga-route-10',
    name: 'Route 10 & Wyndon',
    orderIndex: 816,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 2,
    minLevel: 44,
    maxLevel: 52,
    weights: W.busy,
    tier: 5,
    wild: [
      [460, 12, 44, 50], // Abomasnow
      [614, 12, 44, 50], // Beartic
      [122, 6, 40, 41], // Mr. Mime
      [583, 6, 44, 46], // Vanillish
      [613, 6, 36, 36], // Cubchoo
      [215, 6, 37, 39], // Sneasel
      [872, 6, 29, 29], // Snom
      [600, 6, 44, 48], // Klang
      [112, 6, 44, 49], // Rhydon
      [874, 2, 44, 46], // Stonjourner
      [875, 2, 44, 46], // Eiscue
    ],
    trainers: [
      {
        name: 'Model Eliza',
        team: [
          [873, 49],
          [866, 49],
        ],
      },
      {
        name: 'Team Yell Grunt',
        team: [
          [828, 49],
          [862, 49],
        ],
      }, // Thievul, Obstagoon
      {
        name: 'Bede',
        team: [
          [858, 50],
          [282, 50],
          [78, 50],
        ],
      }, // Hatterene, Gardevoir, Rapidash
      {
        name: 'Hop',
        team: [
          [832, 50],
          [823, 50],
          [143, 51],
        ],
      }, // Dubwool, Corviknight, Snorlax
    ],
  }),
  area({
    key: 'ga-energy-plant',
    name: 'Rose Tower & the Energy Plant',
    orderIndex: 817,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 63,
    weights: W.trainersOnly,
    tier: 5,
    // The Master Ball, in the chairman's tower: one per region, in its villains' hideout.
    once: [['master-ball', 2, 1, 1, true]],
    wild: [],
    trainers: [
      {
        name: 'Clerk Kendra',
        team: [
          [823, 54],
          [601, 54],
        ],
      },
      {
        name: 'Clerk Gerald',
        team: [
          [879, 55],
          [598, 55],
        ],
      },
      {
        name: 'Worker Lara',
        team: [
          [839, 55],
          [569, 55],
        ],
      },
    ],
    // Chairman Rose's plan: Oleana in his tower, then Rose himself at the top of the Energy Plant.
    gyms: [
      {
        name: 'Oleana',
        role: 'leader',
        specialty: 'poison',
        team: [
          [478, 52],
          [763, 52],
          [569, 53],
        ],
      }, // Froslass, Tsareena, Garbodor
      {
        name: 'Rose',
        role: 'leader',
        specialty: 'steel',
        team: [
          [598, 61],
          [863, 61],
          [879, 63],
        ],
      }, // Ferrothorn, Perrserker, Copperajah
    ],
  }),
  area({
    key: 'ga-champion-cup',
    name: 'Wyndon Stadium & the Champion Cup',
    orderIndex: 818,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 56,
    maxLevel: 66,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Clerk Bryce',
        team: [
          [884, 58],
          [879, 58],
        ],
      },
      {
        name: 'Model Eliza',
        team: [
          [873, 58],
          [866, 58],
        ],
      },
    ],
    // The Champion Cup: Marnie in the semi-final, the gym leaders' finals, then Leon.
    gyms: [
      {
        name: 'Marnie',
        role: 'elite',
        specialty: 'dark',
        team: [
          [454, 57],
          [860, 58],
          [861, 59],
        ],
      }, // Toxicroak, Morgrem, Grimmsnarl
      {
        name: 'Nessa',
        role: 'elite',
        specialty: 'water',
        team: [
          [768, 59],
          [847, 60],
          [834, 61],
        ],
      }, // Golisopod, Barraskewda, Drednaw
      {
        name: 'Bea',
        role: 'elite',
        specialty: 'fighting',
        team: [
          [853, 60],
          [865, 60],
          [870, 61],
        ],
      }, // Grapploct, Sirfetch'd, Falinks
      {
        name: 'Raihan',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [330, 61],
          [844, 61],
          [884, 62],
        ],
      }, // Flygon, Sandaconda, Duraludon
      {
        name: 'Champion Leon',
        role: 'champion',
        specialty: 'fire',
        team: [
          [887, 62],
          [866, 64],
          [6, 65],
        ],
      }, // Dragapult, Mr. Rime, Charizard
    ],
  }),
  // The endgame lap every region has, then the side areas the league opens.
  area({
    key: 'ga-wild-area-ii',
    name: 'The Wild Area II',
    orderIndex: 819,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: { wild: 4, trainer: 3, center: 1, item: 1 },
    tier: 5,
    wild: [
      [887, 2, 62, 66], // Dragapult
      [886, 4, 57, 59], // Drakloak
      [879, 8, 60, 66], // Copperajah
      [823, 10, 60, 66], // Corviknight
      [861, 8, 60, 66], // Grimmsnarl
      [612, 6, 60, 66], // Haxorus
      [625, 8, 60, 66], // Bisharp
      [143, 6, 60, 66], // Snorlax
      [131, 6, 60, 66], // Lapras
      [130, 8, 60, 66], // Gyarados
    ],
    trainers: [
      {
        name: 'Clerk Bryce II',
        team: [
          [884, 66],
          [879, 66],
        ],
      },
      {
        name: 'Model Eliza II',
        team: [
          [873, 66],
          [866, 66],
        ],
      },
      {
        name: 'Hiker Malcolm II',
        team: [
          [208, 67],
          [879, 67],
        ],
      },
    ],
  }),
  area({
    key: 'ga-champion-cup-ii',
    name: 'The Champion Cup II',
    orderIndex: 820,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 76,
    weights: { wild: 0, trainer: 2, center: 1, item: 1 },
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Clerk Bryce II',
        team: [
          [884, 66],
          [879, 66],
        ],
      },
      {
        name: 'Hiker Malcolm II',
        team: [
          [208, 67],
          [879, 67],
        ],
      },
    ],
    // The Galarian Star Tournament: the same finalists stronger, and Leon last.
    gyms: [
      {
        name: 'Marnie II',
        role: 'elite',
        specialty: 'dark',
        team: [
          [454, 70],
          [860, 70],
          [861, 72],
        ],
      }, // Toxicroak, Morgrem, Grimmsnarl
      {
        name: 'Nessa II',
        role: 'elite',
        specialty: 'water',
        team: [
          [768, 70],
          [847, 71],
          [834, 72],
        ],
      }, // Golisopod, Barraskewda, Drednaw
      {
        name: 'Bea II',
        role: 'elite',
        specialty: 'fighting',
        team: [
          [853, 71],
          [865, 71],
          [870, 72],
        ],
      }, // Grapploct, Sirfetch'd, Falinks
      {
        name: 'Raihan II',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [330, 72],
          [844, 72],
          [884, 73],
        ],
      }, // Flygon, Sandaconda, Duraludon
      {
        name: 'Champion Leon II',
        role: 'champion',
        specialty: 'fire',
        team: [
          [887, 73],
          [866, 74],
          [6, 76],
        ],
      }, // Dragapult, Mr. Rime, Charizard
    ],
  }),
  area({
    key: 'ga-isle-of-armor',
    name: 'The Isle of Armor',
    orderIndex: 821,
    banner: { scene: 'beach', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ga-champion-cup' }],
    // The Scroll of Darkness, from the top of the Tower of Darkness: what turns Kubfu into Urshifu.
    once: [['scroll-of-darkness', 6, 1, 1, true]],
    wild: [
      [123, 6, 60, 66], // Scyther
      [83, 6, 27, 29], // Farfetch'd
      [554, 6, 33, 34], // Darumaka
      [622, 6, 40, 42], // Golett
      [748, 8, 60, 66], // Toxapex
      [845, 8, 60, 66], // Cramorant
      [871, 8, 60, 66], // Pincurchin
      [877, 8, 60, 66], // Morpeko
      [870, 6, 60, 66], // Falinks
      [534, 8, 60, 66], // Conkeldurr
      [784, 2, 62, 66], // Kommo-o
    ],
    trainers: [
      {
        name: 'Klara',
        team: [
          [748, 64],
          [80, 65],
        ],
      }, // Toxapex, Slowbro
      {
        name: 'Avery',
        team: [
          [64, 64],
          [199, 65],
        ],
      }, // Kadabra, Slowking
      {
        name: 'Black Belt Kenji II',
        team: [
          [870, 65],
          [534, 65],
        ],
      },
    ],
  }),
  area({
    key: 'ga-crown-tundra',
    name: 'The Crown Tundra',
    orderIndex: 822,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 72,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ga-champion-cup' }],
    wild: [
      [875, 8, 62, 68], // Eiscue
      [874, 8, 62, 68], // Stonjourner
      [873, 8, 62, 68], // Frosmoth
      [878, 8, 31, 33], // Cufant
      [712, 8, 35, 36], // Bergmite
      [473, 6, 62, 68], // Mamoswine
      [596, 6, 62, 68], // Galvantula
      [530, 6, 62, 68], // Excadrill
      [571, 6, 62, 68], // Zoroark
      [887, 2, 64, 68], // Dragapult
    ],
    trainers: [
      {
        name: 'Peony',
        team: [
          [879, 68],
          [376, 69],
        ],
      }, // Copperajah, Metagross
      {
        name: 'Hiker Laurie II',
        team: [
          [874, 68],
          [839, 68],
        ],
      },
      {
        name: 'Model Eliza II',
        team: [
          [873, 68],
          [866, 68],
        ],
      },
    ],
  }),
  area({
    key: 'ga-max-lair',
    name: 'The Max Lair',
    orderIndex: 823,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 76,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ga-champion-cup' }],
    // Every Galar species, so the Pokédex can be finished after the league: the Dynamax Adventures under the tundra.
    wild: 'ALL',
    trainers: [
      { name: 'Clerk Bryce III', specialty: 'dragon', size: 3 },
      { name: 'Black Belt Kenji III', specialty: 'fighting', size: 3 },
      { name: 'Beauty Odette', specialty: 'fairy', size: 3 },
    ],
  }),
  area({
    key: 'ga-space-time-rift',
    name: 'The Space-Time Rift',
    orderIndex: 824,
    banner: { scene: 'sky', flip: true },
    roundsToClear: 1,
    minLevel: 58,
    maxLevel: 68,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ga-champion-cup' }],
    // Through the rift into Hisui, the Obsidian Fieldlands of Legends: Arceus: the old species Hisui's seven evolve from,
    // and the Black Augurite and Peat Block they need.
    once: [
      ['black-augurite', 6, 1, 1, true],
      ['peat-block', 6, 1, 1, true],
    ],
    wild: [
      [234, 10, 27, 29], // Stantler
      [216, 8, 27, 29], // Teddiursa
      [217, 6, 58, 64], // Ursaring
      [123, 8, 58, 64], // Scyther
      [211, 8, 27, 29], // Qwilfish
      [215, 8, 37, 39], // Sneasel
      [550, 8, 27, 29], // Basculin
      [399, 8, 12, 14], // Bidoof
      [403, 6, 12, 14], // Shinx
      [77, 6, 37, 39], // Ponyta
    ],
    trainers: [
      {
        name: 'Backpacker Arlo',
        team: [
          [899, 64],
          [900, 64],
        ],
      },
      {
        name: 'Hiker Maddox',
        team: [
          [901, 65],
          [903, 65],
        ],
      },
      {
        name: 'Pokémon Breeder Carly',
        team: [
          [902, 64],
          [904, 64],
        ],
      },
    ],
  }),

  // ---------------------------------------------------------------- secret areas
  // Every one carries the stricter gate of docs/11-GEN6-9-REGIONS-PLAN.md: a story point, a share of the Galar
  // Pokédex and a Pokémon at the boss's own level.

  area({
    key: 'ga-energy-plant-summit',
    name: 'The Energy Plant Summit',
    orderIndex: 851,
    banner: { scene: 'factory', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Eternatus, the Darkest Day's cause, at the top of the tower it was woken in.
    conditions: [
      { kind: 'area', areaId: 'ga-champion-cup' },
      { kind: 'pokedex', count: GALAR_DEX.box },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [{ dex: 890, level: 65 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ga-slumbering-weald',
    name: "The Slumbering Weald's Depths",
    orderIndex: 852,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 64,
    maxLevel: 74,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Zacian and Zamazenta, the heroes of Galar, back at their shrine in the mist. Both, as the versions merge.
    conditions: [
      { kind: 'area', areaId: 'ga-energy-plant-summit' },
      { kind: 'pokedex', count: GALAR_DEX.box },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [
      { dex: 888, level: 70 }, // Zacian
      { dex: 889, level: 70 }, // Zamazenta
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ga-master-dojo',
    name: 'The Master Dojo',
    orderIndex: 853,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 60,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Kubfu, Mustard's charge on the Isle of Armor. The Scroll of Darkness on the island makes it an Urshifu.
    conditions: [
      { kind: 'area', areaId: 'ga-isle-of-armor' },
      { kind: 'pokedex', count: GALAR_DEX.trio },
      { kind: 'maxLevel', level: 55 },
    ],
    bosses: [{ dex: 891, level: 55, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ga-split-decision-ruins',
    name: 'The Split-Decision Ruins',
    orderIndex: 854,
    banner: { scene: 'mountains', flip: true },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Regieleki and Regidrago, the two new Regis of the Crown Tundra. Both, as the player's choice merges.
    conditions: [
      { kind: 'area', areaId: 'ga-crown-tundra' },
      { kind: 'pokedex', count: GALAR_DEX.trio },
      { kind: 'maxLevel', level: 65 },
    ],
    bosses: [
      { dex: 894, level: 65, teamAvgThreshold: 0 }, // Regieleki
      { dex: 895, level: 65, teamAvgThreshold: 0 }, // Regidrago
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ga-crown-shrine',
    name: 'The Crown Shrine',
    orderIndex: 855,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 76,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Calyrex, the King of Bountiful Harvests, with both its steeds: Glastrier and Spectrier.
    conditions: [
      { kind: 'area', areaId: 'ga-split-decision-ruins' },
      { kind: 'pokedex', count: GALAR_DEX.box },
      { kind: 'maxLevel', level: 75 },
    ],
    bosses: [
      { dex: 896, level: 75, teamAvgThreshold: 0 }, // Glastrier
      { dex: 897, level: 75, teamAvgThreshold: 0 }, // Spectrier
      { dex: 898, level: 80, teamAvgThreshold: 0 }, // Calyrex
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ga-forest-of-focus',
    name: 'The Forest of Focus',
    orderIndex: 856,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 62,
    maxLevel: 70,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Zarude, the rogue monkey of the jungle, deep in the Isle of Armor's forest.
    conditions: [
      { kind: 'area', areaId: 'ga-isle-of-armor' },
      { kind: 'pokedex', count: GALAR_DEX.mythical },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 893, level: 70, teamAvgThreshold: 0 }],
    wild: [
      [766, 14, 62, 68], // Passimian
      [765, 12, 62, 68], // Oranguru
      [820, 12, 62, 68], // Greedent
      [763, 10, 62, 68], // Tsareena
      [760, 10, 62, 68], // Bewear
    ],
    trainers: [],
  }),
  area({
    key: 'ga-crimson-mirelands',
    name: 'The Crimson Mirelands',
    orderIndex: 857,
    banner: { scene: 'swamp' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 74,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Enamorus, the fourth of the Forces of Nature, over the mirelands of Hisui.
    conditions: [
      { kind: 'area', areaId: 'ga-space-time-rift' },
      { kind: 'pokedex', count: GALAR_DEX.trio },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 905, level: 70, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
]
