// Hoenn, in order of discovery, routed and balanced on Emerald. Same shape as Kanto's content.ts.
//
// Wild pools follow the Emerald routes (version exclusives merged). Gym leaders, the Elite Four and Wallace use
// their real top Pokémon. Legendaries are never in a wild pool — each is attached to an area as a boss.
import { area, DECK as W, type AreaPlan } from './content'

/** Hoenn's starters: Treecko, Torchic, Mudkip. */
export const HOENN_STARTERS = [252, 255, 258]

/** Hoenn areas sit at 301+, after Johto's 201+. */
export const HOENN_AREAS: AreaPlan[] = [
  area({
    key: 'ho-route-101',
    name: 'Route 101',
    orderIndex: 301,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [263, 40, 2, 5], // Zigzagoon
      [265, 35, 2, 5], // Wurmple
      [261, 25, 2, 5], // Poochyena
    ],
    trainers: [],
  }),
  area({
    key: 'ho-routes-102-103',
    name: 'Routes 102 & 103',
    orderIndex: 302,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 8,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [263, 18, 3, 6], // Zigzagoon
      [261, 16, 3, 6], // Poochyena
      [265, 16, 3, 6], // Wurmple
      [270, 14, 3, 7], // Lotad
      [273, 14, 3, 7], // Seedot
      [280, 10, 4, 7], // Ralts
      [276, 12, 4, 7], // Taillow
    ],
    trainers: [
      { name: 'Youngster Calvin', team: [[263, 6], [261, 6]] },
      { name: 'Lass Haley', team: [[270, 7], [265, 7]] },
      { name: 'Bug Catcher Rick', team: [[266, 8], [268, 8]] }, // Silcoon, Cascoon
    ],
  }),
  area({
    key: 'ho-petalburg-woods',
    name: 'Petalburg Woods & Route 104',
    orderIndex: 303,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 5,
    maxLevel: 11,
    weights: W.light,
    tier: 1,
    wild: [
      [265, 16, 5, 9], // Wurmple
      [266, 10, 6, 10], // Silcoon
      [268, 10, 6, 10], // Cascoon
      [285, 14, 5, 10], // Shroomish
      [263, 14, 5, 9], // Zigzagoon
      [276, 14, 5, 10], // Taillow
      [270, 12, 5, 10], // Lotad
      [283, 10, 6, 11], // Surskit
    ],
    trainers: [
      { name: 'Bug Catcher Lyle', team: [[265, 9], [265, 9]] },
      { name: 'Team Aqua Grunt Dale', team: [[261, 10], [263, 10]] },
      { name: 'Lady Cindy', team: [[285, 11], [270, 11]] },
      { name: 'Fisherman Darian', team: [[129, 10], [283, 10]] },
    ],
  }),
  area({
    key: 'ho-rustboro-city',
    name: 'Rustboro City',
    orderIndex: 304,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 7,
    maxLevel: 14,
    weights: W.mixed,
    tier: 2,
    wild: [
      [263, 24, 7, 12], // Zigzagoon
      [276, 20, 7, 12], // Taillow
      [293, 18, 8, 13], // Whismur
      [290, 18, 8, 13], // Nincada
      [280, 12, 8, 13], // Ralts
    ],
    trainers: [
      { name: 'Youngster Tommy', team: [[276, 13], [263, 13]] },
      { name: 'Lass Janice', team: [[293, 13], [285, 13]] },
      { name: 'Hiker Marc', team: [[74, 14], [304, 14]] }, // Geodude, Aron
      { name: 'Bug Catcher James', team: [[290, 14], [265, 14]] },
    ],
    gyms: [
      { name: 'Roxanne', role: 'leader', badge: 'Stone Badge', specialty: 'rock', team: [[74, 12], [299, 12], [304, 15]] }, // Geodude, Nosepass, Aron
    ],
  }),
  area({
    key: 'ho-rusturf-tunnel',
    name: 'Route 116 & Rusturf Tunnel',
    orderIndex: 305,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 9,
    maxLevel: 16,
    weights: W.mixed,
    tier: 2,
    wild: [
      [293, 22, 9, 14], // Whismur
      [290, 18, 9, 14], // Nincada
      [263, 16, 9, 14], // Zigzagoon
      [276, 14, 9, 14], // Taillow
      [304, 12, 10, 15], // Aron
      [74, 12, 10, 15], // Geodude
      [296, 10, 11, 16], // Makuhita
    ],
    trainers: [
      { name: 'Hiker Clark', team: [[74, 15], [304, 15]] },
      { name: 'Team Aqua Grunt Ronan', team: [[261, 16], [41, 16]] },
      { name: 'Ruin Maniac Dusty', team: [[299, 16], [27, 16]] }, // Nosepass, Sandshrew
    ],
  }),
  area({
    key: 'ho-dewford-town',
    name: 'Dewford Town & Granite Cave',
    orderIndex: 306,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 11,
    maxLevel: 19,
    weights: W.mixed,
    tier: 2,
    wild: [
      [41, 20, 11, 17], // Zubat
      [74, 16, 11, 17], // Geodude
      [296, 16, 12, 18], // Makuhita
      [302, 10, 13, 19], // Sableye
      [303, 10, 13, 19], // Mawile
      [304, 14, 12, 18], // Aron
      [63, 10, 12, 18], // Abra
      [307, 8, 14, 19], // Meditite
    ],
    trainers: [
      { name: 'Black Belt Takao', team: [[296, 18], [307, 18]] },
      { name: 'Battle Girl Laura', team: [[296, 18], [66, 18]] },
      { name: 'Ninja Boy Lung', team: [[290, 19], [41, 19]] },
      { name: 'Hiker Trent', team: [[75, 19], [305, 19]] }, // Graveler, Lairon
    ],
    gyms: [
      { name: 'Brawly', role: 'leader', badge: 'Knuckle Badge', specialty: 'fighting', team: [[66, 16], [307, 16], [297, 19]] }, // Machop, Meditite, Hariyama
    ],
  }),
  area({
    key: 'ho-routes-105-107',
    name: 'Routes 105–107',
    orderIndex: 307,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 22,
    weights: W.mixed,
    tier: 3,
    wild: [
      [72, 20, 13, 19], // Tentacool
      [278, 20, 13, 19], // Wingull
      [129, 16, 13, 19], // Magikarp
      [320, 12, 15, 21], // Wailmer
      [116, 12, 14, 20], // Horsea
      [72, 10, 15, 21],
      [370, 8, 16, 22], // Luvdisc
    ],
    trainers: [
      { name: 'Swimmer Tony', team: [[278, 21], [72, 21]] },
      { name: 'Swimmer Nina', team: [[129, 21], [320, 21]] },
      { name: 'Fisherman Elliot', team: [[129, 22], [118, 22]] },
      { name: 'Sailor Dwayne', team: [[73, 22], [98, 22]] },
    ],
  }),
  area({
    key: 'ho-slateport-city',
    name: 'Slateport City & Route 110',
    orderIndex: 308,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 15,
    maxLevel: 24,
    weights: W.busy,
    tier: 3,
    wild: [
      [263, 16, 15, 21], // Zigzagoon
      [309, 16, 16, 22], // Electrike
      [311, 10, 18, 24], // Plusle
      [312, 10, 18, 24], // Minun
      [278, 14, 15, 21], // Wingull
      [316, 14, 16, 22], // Gulpin
      [43, 12, 15, 22], // Oddish
      [100, 10, 17, 23], // Voltorb
    ],
    trainers: [
      { name: 'Team Aqua Grunt Milo', team: [[261, 23], [72, 23]] },
      { name: 'Team Aqua Grunt Pete', team: [[41, 23], [316, 23]] },
      { name: 'Triathlete Alyssa', team: [[309, 24], [278, 24]] },
      { name: 'Pokéfan Isabel', team: [[311, 24], [312, 24]] },
      { name: 'Sailor Edmond', team: [[320, 24], [73, 24]] },
    ],
  }),
  area({
    key: 'ho-mauville-city',
    name: 'Mauville City',
    orderIndex: 309,
    banner: { scene: 'city', flip: true },
    roundsToClear: 1,
    minLevel: 17,
    maxLevel: 26,
    // Mauville has the Game Corner.
    weights: W.casino,
    tier: 3,
    wild: [
      [309, 24, 17, 23], // Electrike
      [263, 20, 17, 23], // Zigzagoon
      [311, 14, 19, 25], // Plusle
      [312, 14, 19, 25], // Minun
      [100, 14, 18, 24], // Voltorb
      [81, 14, 18, 24], // Magnemite
    ],
    trainers: [
      { name: 'Guitarist Kirk', team: [[309, 25], [100, 25]] },
      { name: 'Battle Girl Vivian', team: [[307, 25], [296, 25]] },
      { name: 'Triathlete Benjamin', team: [[309, 26], [263, 26]] },
      { name: 'Gentleman Walter', team: [[81, 26], [311, 26]] },
    ],
    gyms: [
      { name: 'Wattson', role: 'leader', badge: 'Dynamo Badge', specialty: 'electric', team: [[100, 20], [82, 22], [310, 24]] }, // Voltorb, Magneton, Manectric
    ],
  }),
  area({
    key: 'ho-route-111-desert',
    name: 'Route 111 Desert & Mirage Tower',
    orderIndex: 310,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 19,
    maxLevel: 28,
    weights: W.mixed,
    tier: 3,
    // The two fossils are here and nowhere else — the only source of Lileep and Anorith.
    once: [
      ['root-fossil', 8, 1, 1, true],
      ['claw-fossil', 8, 1, 1, true],
      ['rare-candy', 8, 1, 1, true],
    ],
    wild: [
      [27, 20, 19, 25], // Sandshrew
      [343, 20, 20, 26], // Baltoy
      [328, 16, 20, 26], // Trapinch
      [331, 16, 19, 25], // Cacnea
      [322, 14, 20, 26], // Numel
      [227, 8, 22, 28], // Skarmory
      [104, 10, 20, 26], // Cubone
    ],
    trainers: [
      { name: 'Ruin Maniac Andres', team: [[343, 27], [299, 27]] },
      { name: 'Camper Drew', team: [[331, 27], [322, 27]] },
      { name: 'Picnicker Heidi', team: [[27, 28], [104, 28]] },
      { name: 'Ace Trainer Wilton', team: [[328, 28], [227, 28]] },
    ],
  }),
  area({
    key: 'ho-mt-chimney',
    name: 'Route 112, Fiery Path & Mt. Chimney',
    orderIndex: 311,
    banner: { scene: 'volcano' },
    roundsToClear: 1,
    minLevel: 21,
    maxLevel: 30,
    weights: W.busy,
    tier: 4,
    wild: [
      [322, 22, 21, 27], // Numel
      [324, 14, 22, 28], // Torkoal
      [88, 14, 22, 28], // Grimer
      [109, 14, 22, 28], // Koffing
      [66, 14, 21, 27], // Machop
      [218, 12, 22, 28], // Slugma
      [74, 12, 21, 27], // Geodude
    ],
    trainers: [
      { name: 'Team Magma Grunt Ivan', team: [[322, 29], [261, 29]] },
      { name: 'Team Magma Grunt Joel', team: [[88, 29], [109, 29]] },
      { name: 'Hiker Eli', team: [[75, 29], [305, 29]] },
      { name: 'Kindler Cole', team: [[324, 30], [218, 30]] },
      { name: 'Team Magma Grunt Neil', team: [[218, 30], [41, 30]] },
    ],
  }),
  area({
    key: 'ho-lavaridge-town',
    name: 'Lavaridge Town',
    orderIndex: 312,
    banner: { scene: 'volcano', flip: true },
    roundsToClear: 1,
    minLevel: 23,
    maxLevel: 32,
    weights: W.mixed,
    tier: 4,
    wild: [
      [218, 24, 23, 29], // Slugma
      [322, 20, 23, 29], // Numel
      [324, 16, 24, 30], // Torkoal
      [126, 10, 25, 31], // Magmar
      [77, 14, 24, 30], // Ponyta
      [37, 12, 24, 30], // Vulpix
    ],
    trainers: [
      { name: 'Kindler Axle', team: [[324, 31], [218, 31]] },
      { name: 'Hiker Otto', team: [[76, 31], [305, 31]] },
      { name: 'Battle Girl Danielle', team: [[297, 32], [307, 32]] },
      { name: 'Picnicker Irene', team: [[37, 32], [77, 32]] },
    ],
    gyms: [
      { name: 'Flannery', role: 'leader', badge: 'Heat Badge', specialty: 'fire', team: [[218, 24], [322, 24], [324, 29]] },
    ],
  }),
  area({
    key: 'ho-meteor-falls',
    name: 'Routes 113–115 & Meteor Falls',
    orderIndex: 313,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 25,
    maxLevel: 34,
    weights: W.mixed,
    tier: 4,
    wild: [
      [41, 18, 25, 31], // Zubat
      [338, 14, 26, 32], // Solrock
      [337, 14, 26, 32], // Lunatone
      [371, 10, 27, 33], // Bagon
      [218, 14, 25, 31], // Slugma
      [27, 14, 25, 31], // Sandshrew
      [333, 14, 25, 31], // Swablu
      [227, 10, 27, 33], // Skarmory
    ],
    trainers: [
      { name: 'Ace Trainer Quinn', team: [[338, 33], [337, 33]] },
      { name: 'Dragon Tamer Nicolas', team: [[371, 34], [333, 34]] },
      { name: 'Hiker Lucas', team: [[76, 33], [306, 33]] }, // Golem, Aggron
      { name: 'Bird Keeper Presley', team: [[227, 34], [334, 34]] }, // Skarmory, Altaria
    ],
  }),
  area({
    key: 'ho-petalburg-gym',
    name: 'Petalburg City',
    orderIndex: 314,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 27,
    maxLevel: 36,
    weights: W.busy,
    tier: 4,
    wild: [
      [263, 24, 27, 33], // Zigzagoon
      [264, 14, 30, 36], // Linoone
      [293, 18, 27, 33], // Whismur
      [294, 12, 30, 36], // Loudred
      [183, 16, 28, 34], // Marill
      [276, 16, 27, 33], // Taillow
    ],
    trainers: [
      { name: 'Ace Trainer Randall', team: [[264, 35], [277, 35]] }, // Linoone, Swellow
      { name: 'Ace Trainer Mary', team: [[294, 35], [183, 35]] },
      { name: 'Gentleman Everett', team: [[264, 36], [352, 36]] }, // Linoone, Kecleon
      { name: 'Rich Boy Winston', team: [[263, 36], [300, 36]] }, // Zigzagoon, Skitty
    ],
    gyms: [
      { name: 'Norman', role: 'leader', badge: 'Balance Badge', specialty: 'normal', team: [[289, 31], [288, 33], [264, 36]] }, // Slaking, Vigoroth, Linoone
    ],
  }),
  area({
    key: 'ho-weather-institute',
    name: 'Routes 118 & 119',
    orderIndex: 315,
    banner: { scene: 'swamp' },
    roundsToClear: 1,
    minLevel: 29,
    maxLevel: 38,
    weights: W.mixed,
    tier: 4,
    wild: [
      [263, 16, 29, 35], // Zigzagoon
      [352, 12, 30, 36], // Kecleon
      [357, 10, 31, 37], // Tropius
      [183, 14, 29, 35], // Marill
      [278, 14, 29, 35], // Wingull
      [349, 6, 30, 36], // Feebas
      [351, 8, 31, 37], // Castform
      [285, 12, 29, 35], // Shroomish
      [43, 12, 29, 35], // Oddish
    ],
    trainers: [
      { name: 'Team Aqua Grunt Shelly', team: [[262, 37], [72, 37]] }, // Mightyena, Tentacool
      { name: 'Team Aqua Grunt Barry', team: [[41, 37], [320, 37]] },
      { name: 'Bug Catcher Doug', team: [[267, 38], [269, 38]] }, // Beautifly, Dustox
      { name: 'Fisherman Wade', team: [[349, 38], [118, 38]] },
      { name: 'Ace Trainer Jazmyn', team: [[357, 38], [352, 38]] },
    ],
  }),
  area({
    key: 'ho-fortree-city',
    name: 'Fortree City & Routes 120–121',
    orderIndex: 316,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 31,
    maxLevel: 40,
    weights: W.busy,
    tier: 4,
    wild: [
      [276, 14, 31, 37], // Taillow
      [352, 12, 32, 38], // Kecleon
      [287, 12, 32, 38], // Slakoth
      [285, 14, 31, 37], // Shroomish
      [43, 12, 31, 37], // Oddish
      [353, 12, 33, 39], // Shuppet
      [355, 12, 33, 39], // Duskull
      [333, 12, 32, 38], // Swablu
    ],
    trainers: [
      { name: 'Bird Keeper Presley', team: [[277, 39], [334, 39]] },
      { name: 'Ace Trainer Jazmyn', team: [[288, 39], [352, 39]] },
      { name: 'Hex Maniac Kindra', team: [[353, 40], [355, 40]] },
      { name: 'Ninja Boy Jaiden', team: [[291, 40], [292, 40]] }, // Ninjask, Shedinja
    ],
    gyms: [
      { name: 'Winona', role: 'leader', badge: 'Feather Badge', specialty: 'flying', team: [[277, 33], [227, 35], [334, 38]] },
    ],
  }),
  area({
    key: 'ho-safari-zone',
    name: 'Safari Zone',
    orderIndex: 317,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 32,
    maxLevel: 41,
    weights: W.wildOnly,
    tier: 4,
    wild: [
      [25, 10, 32, 38], // Pikachu
      [84, 10, 32, 38], // Doduo
      [111, 10, 33, 39], // Rhyhorn
      [127, 8, 34, 40], // Pinsir
      [123, 8, 34, 40], // Scyther
      [203, 10, 33, 39], // Girafarig
      [191, 10, 32, 38], // Sunkern
      [216, 10, 33, 39], // Teddiursa
      [179, 10, 32, 38], // Mareep
      [234, 8, 34, 40], // Stantler
      [231, 10, 33, 39], // Phanpy
      [190, 8, 33, 39], // Aipom
    ],
    trainers: [
      { name: 'Ace Trainer Wilton', specialty: 'ground', size: 3 },
      { name: 'Picnicker Heidi', specialty: 'grass', size: 2 },
    ],
  }),
  area({
    key: 'ho-mt-pyre',
    name: 'Mt. Pyre & Routes 122–123',
    orderIndex: 318,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 34,
    maxLevel: 43,
    weights: W.mixed,
    tier: 5,
    wild: [
      [353, 20, 34, 40], // Shuppet
      [355, 20, 34, 40], // Duskull
      [354, 10, 38, 43], // Banette
      [356, 10, 38, 43], // Dusclops
      [278, 12, 34, 40], // Wingull
      [352, 10, 35, 41], // Kecleon
      [359, 8, 37, 43], // Absol
    ],
    trainers: [
      { name: 'Hex Maniac Tasha', team: [[354, 42], [356, 42]] },
      { name: 'Psychic Cedric', team: [[282, 42], [326, 42]] }, // Gardevoir, Grumpig
      { name: 'Team Magma Grunt Sarah', team: [[262, 43], [324, 43]] },
      { name: 'Bird Keeper Edwardo', team: [[279, 43], [277, 43]] }, // Pelipper, Swellow
    ],
  }),
  area({
    key: 'ho-team-hideout',
    name: 'The Magma & Aqua Hideouts',
    orderIndex: 319,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 36,
    maxLevel: 45,
    weights: W.busy,
    tier: 5,
    // Hoenn's Master Ball, the same very rare one-off as the other regions'.
    once: [
      ['master-ball', 2, 1, 1, true],
      ['max-ether', 8, 1, 1, true],
    ],
    wild: [
      [324, 18, 36, 42], // Torkoal
      [218, 16, 36, 42], // Slugma
      [88, 16, 36, 42], // Grimer
      [72, 16, 36, 42], // Tentacool
      [320, 14, 37, 43], // Wailmer
      [41, 14, 36, 42], // Zubat
    ],
    trainers: [
      { name: 'Team Magma Grunt Blake', team: [[262, 44], [323, 44]] }, // Mightyena, Camerupt
      { name: 'Team Aqua Grunt Mack', team: [[321, 44], [73, 44]] }, // Wailord, Tentacruel
      { name: 'Team Magma Grunt Sasha', team: [[324, 44], [42, 44]] },
      { name: 'Maxie', team: [[323, 45], [262, 45]] },
      { name: 'Archie', team: [[321, 45], [262, 45]] },
    ],
  }),
  area({
    key: 'ho-shoal-cave',
    name: 'Lilycove, Route 124 & Shoal Cave',
    orderIndex: 320,
    banner: { scene: 'crystal_cave', flip: true },
    roundsToClear: 1,
    minLevel: 38,
    maxLevel: 47,
    weights: W.mixed,
    tier: 5,
    wild: [
      [363, 18, 38, 44], // Spheal
      [364, 10, 42, 47], // Sealeo
      [41, 14, 38, 44], // Zubat
      [72, 14, 38, 44], // Tentacool
      [366, 12, 39, 45], // Clamperl
      [369, 8, 41, 47], // Relicanth
      [116, 12, 38, 44], // Horsea
      [278, 12, 38, 44], // Wingull
    ],
    trainers: [
      { name: 'Swimmer Tara', team: [[364, 46], [279, 46]] },
      { name: 'Swimmer Reed', team: [[321, 46], [73, 46]] },
      { name: 'Black Belt Koichi', team: [[297, 47], [68, 47]] },
      { name: 'Ace Trainer Randall', team: [[365, 47], [369, 47]] }, // Walrein, Relicanth
    ],
  }),
  area({
    key: 'ho-mossdeep-city',
    name: 'Mossdeep City & the Space Center',
    orderIndex: 321,
    banner: { scene: 'beach', flip: true },
    roundsToClear: 1,
    minLevel: 40,
    maxLevel: 49,
    weights: W.busy,
    tier: 5,
    wild: [
      [278, 18, 40, 46], // Wingull
      [72, 16, 40, 46], // Tentacool
      [337, 14, 41, 47], // Lunatone
      [338, 14, 41, 47], // Solrock
      [307, 14, 41, 47], // Meditite
      [280, 12, 40, 46], // Ralts
      [343, 12, 40, 46], // Baltoy
    ],
    trainers: [
      { name: 'Psychic Blake', team: [[282, 48], [326, 48]] },
      { name: 'Psychic Samantha', team: [[344, 48], [337, 48]] }, // Claydol, Lunatone
      { name: 'Team Magma Grunt Ivan', team: [[323, 48], [262, 48]] },
      { name: 'Ace Trainer Kelvin', team: [[308, 49], [338, 49]] }, // Medicham, Solrock
    ],
    gyms: [
      { name: 'Tate & Liza', role: 'leader', badge: 'Mind Badge', specialty: 'psychic', team: [[337, 42], [338, 42], [344, 45]] },
    ],
  }),
  area({
    key: 'ho-seafloor-cavern',
    name: 'Routes 125–128 & Seafloor Cavern',
    orderIndex: 322,
    banner: { scene: 'ocean', flip: true },
    roundsToClear: 1,
    minLevel: 42,
    maxLevel: 51,
    weights: W.mixed,
    tier: 5,
    wild: [
      [72, 16, 42, 48], // Tentacool
      [73, 10, 46, 51], // Tentacruel
      [320, 14, 42, 48], // Wailmer
      [321, 8, 46, 51], // Wailord
      [366, 12, 43, 49], // Clamperl
      [369, 10, 44, 50], // Relicanth
      [370, 12, 42, 48], // Luvdisc
      [278, 12, 42, 48], // Wingull
      [116, 12, 42, 48], // Horsea
    ],
    trainers: [
      { name: 'Swimmer Tara', team: [[321, 50], [365, 50]] },
      { name: 'Team Aqua Grunt Mack', team: [[262, 50], [73, 50]] },
      { name: 'Ace Trainer Kelvin', team: [[230, 51], [117, 51]] }, // Kingdra, Seadra
      { name: 'Sailor Dwayne', team: [[99, 51], [364, 51]] },
    ],
  }),
  area({
    key: 'ho-sootopolis-city',
    name: 'Sootopolis City & the Cave of Origin',
    orderIndex: 323,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 44,
    maxLevel: 53,
    weights: W.busy,
    tier: 5,
    wild: [
      [41, 18, 44, 50], // Zubat
      [42, 12, 48, 53], // Golbat
      [72, 14, 44, 50], // Tentacool
      [366, 12, 45, 51], // Clamperl
      [370, 12, 44, 50], // Luvdisc
      [116, 12, 44, 50], // Horsea
      [349, 6, 45, 51], // Feebas
    ],
    trainers: [
      { name: 'Swimmer Reed', team: [[350, 52], [365, 52]] }, // Milotic, Walrein
      { name: 'Ace Trainer Mary', team: [[230, 52], [321, 52]] },
      { name: 'Beauty Connie', team: [[350, 53], [370, 53]] },
      { name: 'Black Belt Koichi', team: [[308, 53], [297, 53]] },
    ],
    gyms: [
      { name: 'Juan', role: 'leader', badge: 'Rain Badge', specialty: 'water', team: [[340, 46], [364, 46], [230, 49]] }, // Whiscash, Sealeo, Kingdra
    ],
  }),
  area({
    key: 'ho-victory-road',
    name: 'Victory Road',
    orderIndex: 324,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 46,
    maxLevel: 55,
    weights: W.mixed,
    tier: 5,
    wild: [
      [42, 14, 46, 52], // Golbat
      [75, 12, 46, 52], // Graveler
      [305, 12, 46, 52], // Lairon
      [308, 12, 47, 53], // Medicham
      [326, 12, 47, 53], // Grumpig
      [344, 10, 47, 53], // Claydol
      [372, 10, 48, 54], // Shelgon
      [294, 10, 46, 52], // Loudred
      [359, 8, 48, 54], // Absol
    ],
    trainers: [
      { name: 'Ace Trainer Albert', team: [[306, 54], [376, 54]] }, // Aggron, Metagross
      { name: 'Ace Trainer Hope', team: [[373, 55], [282, 55]] }, // Salamence, Gardevoir
      { name: 'Dragon Tamer Nicolas', team: [[372, 54], [334, 54]] },
      { name: 'Psychic Samantha', team: [[344, 55], [326, 55]] },
    ],
  }),
  area({
    key: 'ho-ever-grande',
    name: 'Ever Grande City',
    orderIndex: 325,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 58,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      { name: 'Ace Trainer Albert', team: [[376, 55], [306, 55]] },
      { name: 'Ace Trainer Hope', team: [[373, 56], [350, 56]] },
      { name: 'Dragon Tamer Nicolas', team: [[334, 56], [372, 56]] },
    ],
    gyms: [
      { name: 'Elite Four Sidney', role: 'elite', specialty: 'dark', team: [[262, 46], [275, 48], [359, 49]] }, // Mightyena, Shiftry, Absol
      { name: 'Elite Four Phoebe', role: 'elite', specialty: 'ghost', team: [[356, 48], [354, 49], [356, 51]] },
      { name: 'Elite Four Glacia', role: 'elite', specialty: 'ice', team: [[364, 50], [362, 50], [365, 53]] }, // Sealeo, Glalie, Walrein
      { name: 'Elite Four Drake', role: 'elite', specialty: 'dragon', team: [[334, 52], [230, 53], [373, 55]] },
      { name: 'Champion Wallace', role: 'champion', specialty: 'water', team: [[340, 55], [346, 56], [350, 58]] }, // Whiscash, Cradily, Milotic
    ],
  }),
  area({
    key: 'ho-battle-frontier',
    name: 'The Battle Frontier',
    orderIndex: 326,
    banner: { scene: 'sunset' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 75,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    // Every Hoenn species, so the Pokédex can be finished after the league.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Albert', specialty: 'steel', size: 3 },
      { name: 'Ace Trainer Hope', specialty: 'dragon', size: 3 },
      { name: 'Ace Trainer Kelvin', specialty: 'water', size: 3 },
    ],
    gyms: [
      { name: 'Steven', role: 'champion', specialty: 'steel', team: [[376, 70], [306, 68], [346, 68]] }, // Metagross, Aggron, Cradily
    ],
  }),

  // ---------------------------------------------------------------- secret areas

  area({
    key: 'ho-cave-of-origin',
    name: 'The Cave of Origin Depths',
    orderIndex: 351,
    banner: { scene: 'volcano' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 55,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ho-sootopolis-city' }, { kind: 'maxLevel', level: 45 }],
    bosses: [{ dex: 383, level: 50 }], // Groudon
    wild: [
      [74, 20, 45, 52], // Geodude
      [322, 20, 45, 52], // Numel
      [324, 20, 46, 53], // Torkoal
      [218, 20, 45, 52], // Slugma
      [41, 20, 45, 52], // Zubat
    ],
    trainers: [],
  }),
  area({
    key: 'ho-seafloor-depths',
    name: 'The Seafloor Cavern Depths',
    orderIndex: 352,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 55,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ho-seafloor-cavern' }, { kind: 'maxLevel', level: 45 }],
    bosses: [{ dex: 382, level: 50 }], // Kyogre
    wild: [
      [320, 20, 45, 52], // Wailmer
      [321, 14, 48, 55], // Wailord
      [72, 20, 45, 52], // Tentacool
      [366, 16, 45, 52], // Clamperl
      [369, 14, 46, 53], // Relicanth
      [41, 16, 45, 52], // Zubat
    ],
    trainers: [],
  }),
  area({
    key: 'ho-sky-pillar',
    name: 'Sky Pillar',
    orderIndex: 353,
    banner: { scene: 'sky' },
    roundsToClear: 1,
    minLevel: 55,
    maxLevel: 68,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Rayquaza only answers once both of the others have been met.
    conditions: [
      { kind: 'area', areaId: 'ho-cave-of-origin' },
      { kind: 'area', areaId: 'ho-seafloor-depths' },
      { kind: 'maxLevel', level: 55 },
    ],
    bosses: [{ dex: 384, level: 70 }], // Rayquaza
    wild: [
      [42, 22, 55, 62], // Golbat
      [334, 20, 55, 62], // Altaria
      [372, 20, 56, 63], // Shelgon
      [227, 20, 55, 62], // Skarmory
      [344, 18, 56, 63], // Claydol
    ],
    trainers: [],
  }),
  area({
    key: 'ho-regi-chambers',
    name: 'The Sealed Chambers',
    orderIndex: 354,
    banner: { scene: 'dunes', flip: true },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 60,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ho-shoal-cave' }, { kind: 'pokedex', count: 150 }],
    bosses: [
      { dex: 377, level: 55 }, // Regirock
      { dex: 378, level: 55 }, // Regice
      { dex: 379, level: 55 }, // Registeel
    ],
    wild: [
      [343, 25, 50, 57], // Baltoy
      [344, 20, 52, 59], // Claydol
      [299, 20, 50, 57], // Nosepass
      [27, 20, 50, 57], // Sandshrew
      [302, 15, 51, 58], // Sableye
    ],
    trainers: [],
  }),
  area({
    key: 'ho-southern-island',
    name: 'Southern Island',
    orderIndex: 355,
    banner: { scene: 'beach' },
    roundsToClear: null,
    minLevel: 50,
    maxLevel: 60,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'ho-ever-grande' }, { kind: 'pokedex', count: 170 }],
    bosses: [
      { dex: 380, level: 55, teamAvgThreshold: 0 }, // Latias
      { dex: 381, level: 55, teamAvgThreshold: 0 }, // Latios
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'ho-birth-island',
    name: 'Birth Island',
    orderIndex: 356,
    banner: { scene: 'sunset', flip: true },
    roundsToClear: null,
    minLevel: 60,
    maxLevel: 70,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The last two, the way Kanto keeps Mew for a nearly-full Pokédex.
    conditions: [{ kind: 'pokedex', count: 200 }, { kind: 'maxLevel', level: 60 }],
    bosses: [
      { dex: 385, level: 60, teamAvgThreshold: 0 }, // Jirachi
      { dex: 386, level: 65, teamAvgThreshold: 0 }, // Deoxys
    ],
    wild: [],
    trainers: [],
  }),
]
