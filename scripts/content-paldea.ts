// Paldea, in order of discovery, routed on Scarlet and Violet's three stories woven together — Victory Road's eight gyms,
// the Path of Legends' titans and Starfall Street's five Team Star bases — by their levels, then the Way Home and Area
// Zero after the league, with the Teal Mask's Kitakami and the Indigo Disk's Blueberry Academy as side areas. Same
// shape as content-galar.ts.
//
// PokeAPI has no encounter tables for Scarlet and Violet, so the wild pools are the games' own as the Paldea Pokédex and
// the area guides list them, at the levels a player meets them first. Every Gen 9 species, or the first stage of its
// line, has a home outside the catch-all: the paradox Pokémon live in Area Zero (both versions' at once), Kitakami's in
// the Land of Kitakami, and Duraludon, for Archaludon, in Blueberry Academy's Terarium.
//
// The titans are wild Pokémon, not trainers, so each is in its own area's pool at its titan level, rare: Klawf in
// Cortondo's, Bombirdier in the Segin Squad's, Orthworm in the Schedar Squad's, Dondozo and Tatsugiri in Casseroya Lake;
// the Quaking Earth titan is a Great Tusk or an Iron Treads, and both are in Area Zero. Team Star's bosses fight as
// leaders without a badge (Striaton's precedent), each ending on the squad's Starmobile, a Revavroom. Teams over three
// keep the Gen 9 Pokémon first, then the highest levels (the user's rule); the region's starters are left out of every
// team, Nemona's included.
import { area, DECK as W, type AreaPlan } from './content'

/** Paldea's starters: Sprigatito, Fuecoco, Quaxly. */
export const PALDEA_STARTERS = [906, 909, 912]

/**
 * The Pokédex gates of the secret areas, as plain counts of the Paldea Pokédex: 55 % for the trios, the Loyal Three,
 * Ogerpon and the paradox legendaries, 70 % for a box legendary, 85 % for a mythical, of the 352 species catchable in
 * Paldea, counted when the region was built. tests/region-content.test.ts holds the floor.
 */
export const PALDEA_DEX = { trio: 194, box: 246, mythical: 299 }

/** Paldea areas sit at 901+, after Galar's 801+. */
export const PALDEA_AREAS: AreaPlan[] = [
  area({
    key: 'pa-poco-path',
    name: 'Cabo Poco, the Poco Path & the Inlet Grotto',
    orderIndex: 901,
    banner: { scene: 'beach' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 6,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [915, 24, 2, 5], // Lechonk
      [917, 16, 2, 5], // Tarountula
      [187, 12, 2, 5], // Hoppip
      [661, 10, 2, 5], // Fletchling
      [921, 10, 3, 6], // Pawmi
      [819, 8, 2, 5], // Skwovet
      [191, 6, 2, 5], // Sunkern
      [278, 6, 3, 6], // Wingull
      [396, 6, 2, 5], // Starly
    ],
    trainers: [],
  }),
  area({
    key: 'pa-los-platos',
    name: 'Los Platos & South Province (Area One)',
    orderIndex: 902,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 9,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [915, 12, 4, 8], // Lechonk
      [921, 12, 4, 8], // Pawmi
      [928, 10, 4, 8], // Smoliv
      [919, 10, 4, 8], // Nymble
      [427, 6, 4, 8], // Buneary
      [194, 6, 4, 8], // Wooper
      [664, 6, 3, 7], // Scatterbug
      [401, 6, 3, 7], // Kricketot
      [183, 6, 4, 8], // Marill
      [174, 4, 3, 6], // Igglybuff
      [440, 4, 3, 6], // Happiny
      [403, 4, 4, 8], // Shinx
      [187, 6, 4, 8], // Hoppip
      [661, 6, 4, 8], // Fletchling
    ],
    trainers: [
      {
        name: 'Youngster Nico',
        team: [
          [915, 7],
          [661, 7],
        ],
      },
      {
        name: 'Backpacker Tomás',
        team: [
          [917, 7],
          [928, 8],
        ],
      },
    ],
  }),
  area({
    key: 'pa-mesagoza',
    name: 'Mesagoza & South Province (Area Two)',
    orderIndex: 903,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 6,
    maxLevel: 13,
    weights: W.casino,
    tier: 1,
    // Mesagoza, Paldea's biggest city and the academy's, carries its Game Corner deck.
    wild: [
      [926, 12, 6, 11], // Fidough
      [924, 12, 6, 11], // Tandemaus
      [942, 8, 6, 11], // Maschiff
      [944, 8, 6, 11], // Shroodle
      [931, 6, 7, 12], // Squawkabilly
      [821, 8, 6, 11], // Rookidee
      [415, 6, 6, 11], // Combee
      [179, 6, 6, 11], // Mareep
      [734, 6, 6, 11], // Yungoos
      [744, 4, 7, 11], // Rockruff
      [280, 4, 7, 11], // Ralts
      [172, 4, 6, 10], // Pichu
      [999, 2, 8, 12], // Gimmighoul (roaming form)
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [944, 11],
          [942, 11],
        ],
      },
      {
        name: 'Cook Sofia',
        team: [
          [926, 11],
          [924, 11],
        ],
      },
      { name: 'Nemona', team: [[921, 12]] }, // Pawmi (her starter is left out)
    ],
  }),
  area({
    key: 'pa-cortondo',
    name: 'South Province (Area Three) & Cortondo',
    orderIndex: 904,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 10,
    maxLevel: 17,
    weights: W.mixed,
    tier: 2,
    wild: [
      [919, 10, 10, 15], // Nymble
      [917, 8, 10, 14], // Tarountula
      [955, 8, 10, 15], // Flittle
      [932, 8, 10, 15], // Nacli
      [548, 6, 10, 15], // Petilil
      [216, 6, 10, 15], // Teddiursa
      [928, 6, 10, 15], // Smoliv
      [540, 6, 10, 15], // Sewaddle
      [415, 6, 10, 15], // Combee
      [402, 4, 12, 16], // Kricketune
      [918, 4, 15, 17], // Spidops
      [950, 2, 16, 16], // Klawf, the Stony Cliff Titan
    ],
    trainers: [
      {
        name: 'Cook Rosa',
        team: [
          [915, 14],
          [928, 14],
        ],
      },
      {
        name: 'Hiker Pablo',
        team: [
          [932, 14],
          [216, 15],
        ],
      },
    ],
    gyms: [
      {
        name: 'Katy',
        role: 'leader',
        badge: 'Bug Badge',
        specialty: 'bug',
        team: [
          [919, 14],
          [917, 14],
          [216, 15],
        ],
      }, // Nymble, Tarountula, Teddiursa
    ],
  }),
  area({
    key: 'pa-artazon',
    name: 'South Province (Area Six) & Artazon',
    orderIndex: 905,
    banner: { scene: 'flowers' },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 19,
    weights: W.mixed,
    tier: 2,
    wild: [
      [928, 8, 13, 18], // Smoliv
      [548, 8, 13, 18], // Petilil
      [957, 8, 13, 18], // Tinkatink
      [669, 8, 13, 18], // Flabébé
      [753, 6, 13, 18], // Fomantis
      [54, 6, 13, 18], // Psyduck
      [188, 6, 18, 19], // Skiploom
      [438, 4, 13, 17], // Bonsly
      [185, 4, 15, 19], // Sudowoodo
      [926, 6, 13, 18], // Fidough
      [924, 6, 13, 18], // Tandemaus
      [25, 2, 14, 18], // Pikachu
    ],
    trainers: [
      {
        name: 'Artist Paula',
        team: [
          [548, 16],
          [669, 16],
        ],
      },
      {
        name: 'Beauty Marta',
        team: [
          [753, 16],
          [187, 16],
        ],
      },
    ],
    gyms: [
      {
        name: 'Brassius',
        role: 'leader',
        badge: 'Grass Badge',
        specialty: 'grass',
        team: [
          [548, 16],
          [928, 16],
          [185, 17],
        ],
      }, // Petilil, Smoliv, Sudowoodo
    ],
  }),
  area({
    key: 'pa-segin',
    name: "West Province (Area One) & the Segin Squad's Base",
    orderIndex: 906,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 16,
    maxLevel: 22,
    weights: W.mixed,
    tier: 2,
    wild: [
      [942, 8, 16, 21], // Maschiff
      [944, 8, 16, 21], // Shroodle
      [967, 4, 18, 22], // Cyclizar
      [744, 6, 18, 22], // Rockruff
      [56, 6, 16, 21], // Mankey
      [198, 6, 16, 21], // Murkrow
      [570, 4, 16, 21], // Zorua
      [228, 6, 16, 21], // Houndour
      [624, 6, 16, 21], // Pawniard
      [915, 6, 16, 17], // Lechonk
      [955, 6, 16, 21], // Flittle
      [962, 2, 20, 20], // Bombirdier, the Open Sky Titan
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [198, 19],
          [570, 19],
        ],
      },
      {
        name: 'Team Star Grunt',
        team: [
          [624, 19],
          [228, 19],
        ],
      },
    ],
    gyms: [
      {
        name: 'Giacomo',
        role: 'leader',
        specialty: 'dark',
        team: [
          [624, 21],
          [966, 20],
        ],
      }, // Pawniard, the Segin Starmobile (Revavroom)
    ],
  }),
  area({
    key: 'pa-levincia',
    name: 'East Province (Areas One & Two) & Levincia',
    orderIndex: 907,
    banner: { scene: 'city', flip: true },
    roundsToClear: 1,
    minLevel: 18,
    maxLevel: 25,
    weights: W.mixed,
    tier: 2,
    wild: [
      [938, 8, 18, 23], // Tadbulb
      [940, 8, 18, 23], // Wattrel
      [965, 6, 18, 24], // Varoom
      [417, 6, 18, 24], // Pachirisu
      [100, 6, 18, 24], // Voltorb
      [81, 6, 18, 24], // Magnemite
      [922, 4, 20, 25], // Pawmo
      [404, 4, 20, 25], // Luxio
      [180, 4, 20, 25], // Flaaffy
      [702, 4, 18, 24], // Dedenne
      [741, 4, 18, 24], // Oricorio
      [957, 4, 18, 23], // Tinkatink
    ],
    trainers: [
      {
        name: 'Office Worker Sergio',
        team: [
          [81, 22],
          [922, 22],
        ],
      },
      {
        name: 'Office Worker Lucia',
        team: [
          [417, 22],
          [702, 22],
        ],
      },
      {
        name: 'Cabbie Diego',
        team: [
          [965, 22],
          [100, 22],
        ],
      },
    ],
    gyms: [
      {
        name: 'Iono',
        role: 'leader',
        badge: 'Electric Badge',
        specialty: 'electric',
        team: [
          [940, 23],
          [939, 23],
          [429, 24],
        ],
      }, // Wattrel, Bellibolt, Mismagius
    ],
  }),
  area({
    key: 'pa-schedar',
    name: "The Schedar Squad's Base & East Province (Area Three)",
    orderIndex: 908,
    banner: { scene: 'volcano' },
    roundsToClear: 1,
    minLevel: 22,
    maxLevel: 30,
    weights: W.mixed,
    tier: 3,
    // Charcadet's two armors, each found once: Armarouge from the auspicious, Ceruledge from the malicious.
    once: [
      ['auspicious-armor', 6, 1, 1, true],
      ['malicious-armor', 6, 1, 1, true],
    ],
    wild: [
      [935, 6, 22, 28], // Charcadet
      [948, 6, 22, 28], // Toedscool
      [951, 6, 22, 28], // Capsakid
      [58, 6, 22, 28], // Growlithe
      [757, 6, 22, 28], // Salandit
      [324, 6, 22, 28], // Torkoal
      [218, 6, 22, 28], // Slugma
      [322, 6, 22, 28], // Numel
      [667, 6, 22, 28], // Litleo
      [126, 4, 22, 28], // Magmar
      [214, 4, 22, 28], // Heracross
      [968, 2, 29, 29], // Orthworm, the Lurking Steel Titan
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [228, 26],
          [58, 26],
        ],
      },
      {
        name: 'Team Star Grunt',
        team: [
          [218, 26],
          [667, 26],
        ],
      },
    ],
    gyms: [
      {
        name: 'Mela',
        role: 'leader',
        specialty: 'fire',
        team: [
          [324, 27],
          [966, 27],
        ],
      }, // Torkoal, the Schedar Starmobile (Revavroom)
    ],
  }),
  area({
    key: 'pa-cascarrafa',
    name: 'The Asado Desert & Cascarrafa',
    orderIndex: 909,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 24,
    maxLevel: 31,
    weights: W.mixed,
    tier: 3,
    wild: [
      [953, 8, 24, 29], // Rellor
      [946, 8, 24, 29], // Bramblin
      [551, 6, 24, 28], // Sandile
      [843, 6, 24, 29], // Silicobra
      [449, 6, 24, 29], // Hippopotas
      [331, 6, 24, 29], // Cacnea
      [951, 4, 24, 29], // Capsakid
      [636, 2, 24, 29], // Larvesta
      [960, 8, 24, 25], // Wiglett
      [963, 6, 24, 29], // Finizen
      [976, 4, 25, 30], // Veluza
      [418, 6, 24, 25], // Buizel
      [279, 4, 25, 30], // Pelipper
      [456, 4, 24, 29], // Finneon
    ],
    trainers: [
      {
        name: 'Waiter Marco',
        team: [
          [963, 28],
          [419, 28],
        ],
      },
      {
        name: 'Waitress Elena',
        team: [
          [961, 28],
          [976, 28],
        ],
      },
      {
        name: 'Hiker Tomás',
        team: [
          [449, 28],
          [843, 28],
        ],
      },
    ],
    gyms: [
      {
        name: 'Kofu',
        role: 'leader',
        badge: 'Water Badge',
        specialty: 'water',
        team: [
          [976, 29],
          [961, 29],
          [740, 30],
        ],
      }, // Veluza, Wugtrio, Crabominable
    ],
  }),
  area({
    key: 'pa-navi',
    name: "Tagtree Thicket & the Navi Squad's Base",
    orderIndex: 910,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 28,
    maxLevel: 34,
    weights: W.mixed,
    tier: 3,
    wild: [
      [945, 6, 28, 33], // Grafaiai
      [944, 6, 26, 27], // Shroodle
      [948, 6, 28, 29], // Toedscool
      [88, 6, 28, 33], // Grimer
      [109, 6, 28, 33], // Koffing
      [317, 4, 28, 33], // Swalot
      [48, 6, 28, 30], // Venonat
      [204, 6, 28, 30], // Pineco
      [206, 4, 28, 31], // Dunsparce
      [203, 4, 28, 31], // Girafarig
      [708, 4, 28, 33], // Phantump
      [127, 4, 28, 33], // Pinsir
      [434, 6, 28, 33], // Stunky
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [88, 31],
          [109, 31],
        ],
      },
      {
        name: 'Team Star Grunt',
        team: [
          [317, 31],
          [434, 31],
        ],
      },
    ],
    gyms: [
      {
        name: 'Atticus',
        role: 'leader',
        specialty: 'poison',
        team: [
          [89, 32],
          [966, 33],
          [966, 32],
        ],
      }, // Muk, Revavroom, the Navi Starmobile (Revavroom)
    ],
  }),
  area({
    key: 'pa-medali',
    name: 'West Province (Area Two) & Medali',
    orderIndex: 911,
    banner: { scene: 'sunset' },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 37,
    weights: W.mixed,
    tier: 4,
    wild: [
      [967, 6, 30, 35], // Cyclizar
      [973, 6, 30, 35], // Flamigo
      [916, 6, 30, 35], // Oinkologne
      [925, 6, 30, 35], // Maushold
      [927, 6, 30, 35], // Dachsbun
      [958, 6, 30, 35], // Tinkatuff
      [920, 6, 30, 35], // Lokix
      [918, 4, 30, 35], // Spidops
      [397, 6, 30, 33], // Staravia
      [128, 6, 30, 35], // Tauros
      [775, 4, 30, 35], // Komala
      [876, 4, 30, 35], // Indeedee
      [941, 4, 30, 35], // Kilowattrel
    ],
    trainers: [
      {
        name: 'Office Worker Rosa',
        team: [
          [916, 34],
          [925, 34],
        ],
      },
      {
        name: 'Cook Pedro',
        team: [
          [927, 34],
          [128, 34],
        ],
      },
    ],
    gyms: [
      {
        name: 'Larry',
        role: 'leader',
        badge: 'Normal Badge',
        specialty: 'normal',
        team: [
          [775, 35],
          [982, 35],
          [398, 36],
        ],
      }, // Komala, Dudunsparce, Staraptor
    ],
  }),
  area({
    key: 'pa-montenevera',
    name: 'The Dalizapa Passage & Montenevera',
    orderIndex: 912,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 35,
    maxLevel: 43,
    weights: W.mixed,
    tier: 4,
    wild: [
      [972, 6, 35, 41], // Houndstone
      [971, 6, 28, 29], // Greavard
      [969, 6, 33, 34], // Glimmet
      [970, 2, 38, 42], // Glimmora
      [200, 6, 35, 41], // Misdreavus
      [353, 6, 35, 36], // Shuppet
      [354, 4, 37, 41], // Banette
      [93, 6, 32, 33], // Haunter
      [94, 2, 35, 41], // Gengar
      [778, 4, 35, 41], // Mimikyu
      [426, 4, 35, 41], // Drifblim
      [302, 4, 35, 41], // Sableye
      [361, 6, 35, 41], // Snorunt
    ],
    trainers: [
      {
        name: 'Musician Lola',
        team: [
          [93, 39],
          [200, 39],
        ],
      },
      {
        name: 'Hiker Javier',
        team: [
          [437, 39],
          [302, 39],
        ],
      },
    ],
    gyms: [
      {
        name: 'Ryme',
        role: 'leader',
        badge: 'Ghost Badge',
        specialty: 'ghost',
        team: [
          [778, 41],
          [972, 41],
          [849, 42],
        ],
      }, // Mimikyu, Houndstone, Toxtricity
    ],
  }),
  area({
    key: 'pa-alfornada',
    name: 'The Alfornada Cavern & Alfornada',
    orderIndex: 913,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 38,
    maxLevel: 46,
    weights: W.mixed,
    tier: 4,
    wild: [
      [956, 6, 38, 44], // Espathra
      [955, 4, 33, 34], // Flittle
      [575, 6, 38, 40], // Gothorita
      [857, 6, 38, 41], // Hattrem
      [678, 6, 38, 44], // Meowstic
      [876, 4, 38, 44], // Indeedee
      [308, 4, 38, 44], // Medicham
      [326, 6, 38, 44], // Grumpig
      [437, 4, 38, 44], // Bronzong
      [949, 6, 38, 44], // Toedscruel
      [282, 2, 38, 44], // Gardevoir
      [999, 2, 38, 39], // Gimmighoul
      [633, 2, 38, 44], // Deino
    ],
    trainers: [
      {
        name: 'Beauty Valentina',
        team: [
          [282, 42],
          [678, 42],
        ],
      },
      {
        name: 'Artist Hugo',
        team: [
          [326, 42],
          [857, 42],
        ],
      },
    ],
    gyms: [
      {
        name: 'Tulip',
        role: 'leader',
        badge: 'Psychic Badge',
        specialty: 'psychic',
        team: [
          [981, 44],
          [956, 44],
          [671, 45],
        ],
      }, // Farigiraf, Espathra, Florges
    ],
  }),
  area({
    key: 'pa-glaseado',
    name: 'Glaseado Mountain',
    orderIndex: 914,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 42,
    maxLevel: 49,
    weights: W.mixed,
    tier: 4,
    // The Ice Stone, for Cetoddle's Cetitan, found once on the mountain.
    once: [['ice-stone', 8, 1, 1, true]],
    wild: [
      [974, 8, 42, 48], // Cetoddle
      [996, 2, 30, 34], // Frigibax
      [873, 4, 42, 48], // Frosmoth
      [614, 6, 42, 48], // Beartic
      [613, 4, 35, 36], // Cubchoo
      [459, 6, 38, 39], // Snover
      [460, 4, 42, 48], // Abomasnow
      [215, 6, 38, 39], // Sneasel
      [473, 4, 42, 48], // Mamoswine
      [712, 6, 35, 36], // Bergmite
      [713, 4, 42, 48], // Avalugg
      [225, 6, 42, 48], // Delibird
      [875, 4, 42, 48], // Eiscue
      [739, 4, 42, 48], // Crabrawler
    ],
    trainers: [
      {
        name: 'Hiker Jordi',
        team: [
          [614, 46],
          [713, 46],
        ],
      },
      {
        name: 'Bodybuilder Inés',
        team: [
          [460, 46],
          [473, 46],
        ],
      },
    ],
    gyms: [
      {
        name: 'Grusha',
        role: 'leader',
        badge: 'Ice Badge',
        specialty: 'ice',
        team: [
          [873, 47],
          [975, 47],
          [334, 48],
        ],
      }, // Frosmoth, Cetitan, Altaria
    ],
  }),
  area({
    key: 'pa-ruchbah',
    name: "North Province (Area Three) & the Ruchbah Squad's Base",
    orderIndex: 915,
    banner: { scene: 'mountains', flip: true },
    roundsToClear: 1,
    minLevel: 44,
    maxLevel: 52,
    weights: W.mixed,
    tier: 5,
    wild: [
      [184, 6, 44, 50], // Azumarill
      [40, 4, 44, 50], // Wigglytuff
      [927, 6, 44, 50], // Dachsbun
      [958, 6, 36, 37], // Tinkatuff
      [959, 4, 44, 50], // Tinkaton
      [707, 6, 44, 50], // Klefki
      [671, 4, 44, 50], // Florges
      [764, 4, 44, 50], // Comfey
      [702, 4, 44, 50], // Dedenne
      [941, 4, 44, 50], // Kilowattrel
      [920, 4, 44, 50], // Lokix
      [279, 4, 44, 50], // Pelipper
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [184, 48],
          [707, 48],
        ],
      },
      {
        name: 'Team Star Grunt',
        team: [
          [40, 48],
          [927, 48],
        ],
      },
    ],
    gyms: [
      {
        name: 'Ortega',
        role: 'leader',
        specialty: 'fairy',
        team: [
          [184, 50],
          [927, 50],
          [966, 51],
        ],
      }, // Azumarill, Dachsbun, the Ruchbah Starmobile (Revavroom)
    ],
  }),
  area({
    key: 'pa-caph',
    name: "North Province (Area Two) & the Caph Squad's Base",
    orderIndex: 916,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 48,
    maxLevel: 57,
    weights: W.busy,
    tier: 5,
    // The Master Ball, in Team Star's last base: one per region, in its villains' hideout.
    once: [['master-ball', 2, 1, 1, true]],
    wild: [
      [979, 4, 48, 54], // Annihilape
      [448, 4, 48, 54], // Lucario
      [766, 6, 48, 54], // Passimian
      [297, 6, 48, 54], // Hariyama
      [454, 6, 48, 54], // Toxicroak
      [453, 6, 35, 36], // Croagunk
      [701, 4, 48, 54], // Hawlucha
      [308, 4, 48, 54], // Medicham
      [560, 4, 48, 54], // Scrafty
      [923, 4, 48, 54], // Pawmot
      [704, 4, 38, 39], // Goomy
      [371, 2, 28, 29], // Bagon
      [443, 2, 22, 23], // Gible
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [297, 53],
          [560, 53],
        ],
      },
      {
        name: 'Team Star Grunt',
        team: [
          [454, 53],
          [766, 53],
        ],
      },
    ],
    gyms: [
      {
        name: 'Eri',
        role: 'leader',
        specialty: 'fighting',
        team: [
          [448, 55],
          [979, 56],
          [966, 56],
        ],
      }, // Lucario, Annihilape, the Caph Starmobile (Revavroom)
    ],
  }),
  area({
    key: 'pa-casseroya',
    name: 'Casseroya Lake',
    orderIndex: 917,
    banner: { scene: 'ocean' },
    // Two rounds: the lake is where a team catches up to the league's band, as Alola's Vast Poni Canyon is.
    roundsToClear: 2,
    minLevel: 50,
    maxLevel: 58,
    weights: W.mixed,
    tier: 5,
    wild: [
      [978, 6, 50, 56], // Tatsugiri
      [977, 2, 56, 57], // Dondozo, Tatsugiri's titan partner
      [976, 6, 50, 56], // Veluza
      [130, 6, 50, 56], // Gyarados
      [129, 4, 15, 19], // Magikarp
      [973, 6, 50, 56], // Flamigo
      [147, 4, 28, 29], // Dratini
      [148, 4, 50, 54], // Dragonair
      [131, 4, 50, 56], // Lapras
      [55, 4, 50, 56], // Golduck
      [419, 4, 50, 56], // Floatzel
      [964, 2, 50, 56], // Palafin
      [714, 4, 46, 47], // Noibat
      [715, 2, 50, 56], // Noivern
    ],
    trainers: [
      {
        name: 'Dragon Tamer Lucas',
        team: [
          [148, 54],
          [715, 54],
        ],
      },
      {
        name: 'Black Belt Rafael',
        team: [
          [297, 54],
          [448, 54],
        ],
      },
    ],
  }),
  area({
    key: 'pa-pokemon-league',
    name: 'The Pokémon League',
    orderIndex: 918,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 55,
    maxLevel: 66,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      {
        name: 'Beauty Carmen',
        team: [
          [282, 58],
          [671, 58],
        ],
      },
      {
        name: 'Dragon Tamer Leo',
        team: [
          [148, 58],
          [715, 58],
        ],
      },
    ],
    // The Champion Assessment: the Elite Four, Top Champion Geeta, then Nemona at last, Champion against Champion.
    gyms: [
      {
        name: 'Elite Four Rika',
        role: 'elite',
        specialty: 'ground',
        team: [
          [232, 57],
          [323, 57],
          [980, 58],
        ],
      }, // Donphan, Camerupt, Clodsire
      {
        name: 'Elite Four Poppy',
        role: 'elite',
        specialty: 'steel',
        team: [
          [879, 58],
          [823, 58],
          [959, 59],
        ],
      }, // Copperajah, Corviknight, Tinkaton
      {
        name: 'Elite Four Larry',
        role: 'elite',
        specialty: 'flying',
        team: [
          [334, 59],
          [398, 59],
          [973, 60],
        ],
      }, // Altaria, Staraptor, Flamigo
      {
        name: 'Elite Four Hassel',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [612, 60],
          [841, 60],
          [998, 61],
        ],
      }, // Haxorus, Flapple, Baxcalibur
      {
        name: 'Champion Geeta',
        role: 'champion',
        specialty: 'rock',
        team: [
          [956, 61],
          [983, 61],
          [970, 62],
        ],
      }, // Espathra, Kingambit, Glimmora
      {
        name: 'Champion Nemona',
        role: 'champion',
        specialty: 'electric',
        team: [
          [982, 65],
          [968, 65],
          [923, 65],
        ],
      }, // Dudunsparce, Orthworm, Pawmot
    ],
  }),
  // The Way Home and Area Zero: what every story leads to, after the league.
  area({
    key: 'pa-way-home',
    name: 'The Way Home',
    orderIndex: 919,
    banner: { scene: 'beach', flip: true },
    roundsToClear: 1,
    minLevel: 58,
    maxLevel: 66,
    weights: W.busy,
    tier: 5,
    wild: [
      [934, 6, 58, 64], // Garganacl
      [943, 6, 58, 64], // Mabosstiff
      [952, 4, 58, 64], // Scovillain
      [949, 6, 58, 64], // Toedscruel
      [820, 4, 58, 64], // Greedent
      [91, 4, 58, 64], // Cloyster
      [941, 6, 58, 64], // Kilowattrel
      [939, 4, 58, 64], // Bellibolt
      [947, 4, 58, 64], // Brambleghast
      [954, 4, 58, 64], // Rabsca
      [966, 4, 58, 64], // Revavroom
    ],
    trainers: [
      {
        name: 'Team Star Grunt',
        team: [
          [966, 60],
          [943, 60],
        ],
      },
      {
        name: 'Hiker Pablo II',
        team: [
          [934, 60],
          [950, 60],
        ],
      },
    ],
    // Arven at the Poco Path lighthouse, after every titan; Penny, Team Star's Cassiopeia, at the Star Barrage.
    gyms: [
      {
        name: 'Arven',
        role: 'leader',
        specialty: 'dark',
        team: [
          [949, 61],
          [934, 62],
          [943, 63],
        ],
      }, // Toedscruel, Garganacl, Mabosstiff
      {
        name: 'Penny',
        role: 'leader',
        specialty: 'fairy',
        team: [
          [197, 62],
          [134, 62],
          [700, 63],
        ],
      }, // Umbreon, Vaporeon, Sylveon
    ],
  }),
  area({
    key: 'pa-area-zero',
    name: 'Area Zero',
    orderIndex: 920,
    banner: { scene: 'crystal_cave', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.busy,
    tier: 5,
    // The Great Crater of Paldea: the past's and the future's paradox Pokémon, both versions' at once.
    wild: [
      [984, 4, 60, 66], // Great Tusk
      [985, 4, 60, 66], // Scream Tail
      [986, 4, 60, 66], // Brute Bonnet
      [987, 4, 60, 66], // Flutter Mane
      [988, 4, 60, 66], // Slither Wing
      [989, 4, 60, 66], // Sandy Shocks
      [990, 4, 60, 66], // Iron Treads
      [991, 4, 60, 66], // Iron Bundle
      [992, 4, 60, 66], // Iron Hands
      [993, 4, 60, 66], // Iron Jugulis
      [994, 4, 60, 66], // Iron Moth
      [995, 4, 60, 66], // Iron Thorns
      [1005, 2, 62, 66], // Roaring Moon
      [1006, 2, 62, 66], // Iron Valiant
      [998, 2, 60, 66], // Baxcalibur
      [970, 4, 60, 66], // Glimmora
      [149, 2, 60, 66], // Dragonite
    ],
    trainers: [],
    // The professor's AI at the Zero Lab: Sada's paradoxes of the past, Turo's of the future. Both, as the versions merge.
    gyms: [
      {
        name: 'Professor Sada',
        role: 'leader',
        specialty: 'dragon',
        team: [
          [988, 66],
          [987, 66],
          [1005, 67],
        ],
      }, // Slither Wing, Flutter Mane, Roaring Moon
      {
        name: 'Professor Turo',
        role: 'leader',
        specialty: 'fairy',
        team: [
          [992, 66],
          [994, 66],
          [1006, 67],
        ],
      }, // Iron Hands, Iron Moth, Iron Valiant
    ],
  }),
  // The side areas the league opens: the two DLCs, and the Terarium as the catch-all.
  area({
    key: 'pa-kitakami',
    name: 'The Land of Kitakami',
    orderIndex: 921,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 72,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'pa-pokemon-league' }],
    // Kitakami's two evolution items: the Syrupy Apple for Applin's Dipplin, the Unremarkable Teacup for Sinistcha.
    once: [
      ['syrupy-apple', 6, 1, 1, true],
      ['unremarkable-teacup', 6, 1, 1, true],
    ],
    wild: [
      [1012, 8, 60, 66], // Poltchageist
      [840, 8, 60, 66], // Applin
      [1011, 4, 40, 44], // Dipplin
      [469, 6, 60, 66], // Yanmega
      [217, 6, 60, 66], // Ursaring
      [207, 6, 60, 66], // Gligar
      [61, 6, 60, 66], // Poliwhirl
      [274, 6, 60, 66], // Nuzleaf
      [299, 4, 60, 66], // Nosepass
      [164, 6, 60, 66], // Noctowl
      [56, 4, 26, 27], // Mankey
    ],
    trainers: [
      {
        name: 'Kieran',
        team: [
          [1011, 72],
          [62, 72],
          [472, 76],
        ],
      }, // Dipplin, Poliwrath, Gliscor
      {
        name: 'Hiker Taro',
        team: [
          [476, 68],
          [217, 68],
        ],
      },
      {
        name: 'Backpacker Mio',
        team: [
          [1012, 68],
          [840, 68],
        ],
      },
    ],
  }),
  area({
    key: 'pa-blueberry',
    name: 'Blueberry Academy & the BB League',
    orderIndex: 922,
    banner: { scene: 'ocean', flip: true },
    roundsToClear: 1,
    minLevel: 70,
    maxLevel: 85,
    weights: W.busy,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'pa-kitakami' }],
    // The Metal Alloy, for Duraludon's Archaludon, from the Terarium.
    once: [['metal-alloy', 6, 1, 1, true]],
    wild: [
      [884, 6, 70, 76], // Duraludon
      [227, 6, 70, 76], // Skarmory
      [246, 4, 28, 29], // Larvitar
      [374, 4, 15, 19], // Beldum
      [869, 6, 70, 76], // Alcremie
      [323, 6, 70, 76], // Camerupt
      [612, 4, 70, 76], // Haxorus
      [330, 4, 70, 76], // Flygon
      [230, 4, 70, 76], // Kingdra
      [530, 4, 70, 76], // Excadrill
    ],
    trainers: [
      {
        name: 'Dragon Tamer Leo II',
        team: [
          [330, 76],
          [612, 76],
        ],
      },
    ],
    // The BB League's Elite Four, then its Champion, Kieran.
    gyms: [
      {
        name: 'Elite Four Crispin',
        role: 'elite',
        specialty: 'fire',
        team: [
          [323, 78],
          [467, 78],
          [257, 79],
        ],
      }, // Camerupt, Magmortar, Blaziken
      {
        name: 'Elite Four Amarys',
        role: 'elite',
        specialty: 'steel',
        team: [
          [395, 84],
          [212, 84],
          [376, 85],
        ],
      }, // Empoleon, Scizor, Metagross
      {
        name: 'Elite Four Lacey',
        role: 'elite',
        specialty: 'fairy',
        team: [
          [730, 79],
          [869, 79],
          [530, 80],
        ],
      }, // Primarina, Alcremie, Excadrill
      {
        name: 'Elite Four Drayton',
        role: 'elite',
        specialty: 'dragon',
        team: [
          [612, 79],
          [230, 79],
          [1018, 80],
        ],
      }, // Haxorus, Kingdra, Archaludon
      {
        name: 'Champion Kieran',
        role: 'champion',
        specialty: 'dragon',
        team: [
          [727, 81],
          [861, 81],
          [1019, 82],
        ],
      }, // Incineroar, Grimmsnarl, Hydrapple
    ],
  }),
  area({
    key: 'pa-terarium',
    name: 'The Terarium',
    orderIndex: 923,
    banner: { scene: 'sky' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 80,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'pa-pokemon-league' }],
    // Every Paldea species, so the Pokédex can be finished after the league: Blueberry Academy's dome of four biomes.
    wild: 'ALL',
    trainers: [
      { name: 'Dragon Tamer Leo III', specialty: 'dragon', size: 3 },
      { name: 'Black Belt Rafael II', specialty: 'fighting', size: 3 },
      { name: 'Beauty Carmen II', specialty: 'fairy', size: 3 },
    ],
  }),

  // ---------------------------------------------------------------- secret areas
  // Every one carries the stricter gate of docs/11-GEN6-9-REGIONS-PLAN.md: a story point, a share of the Paldea
  // Pokédex and a Pokémon at the boss's own level.

  area({
    key: 'pa-zero-lab',
    name: 'The Zero Lab',
    orderIndex: 951,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 76,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Koraidon and Miraidon, the professor's legendaries, at the bottom of the crater. Both, as the versions merge.
    conditions: [
      { kind: 'area', areaId: 'pa-area-zero' },
      { kind: 'pokedex', count: PALDEA_DEX.box },
      { kind: 'maxLevel', level: 72 },
    ],
    bosses: [
      { dex: 1007, level: 72 }, // Koraidon
      { dex: 1008, level: 72 }, // Miraidon
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-shrines-of-ruin',
    name: 'The Shrines of Ruin',
    orderIndex: 952,
    banner: { scene: 'haunted', flip: true },
    roundsToClear: 1,
    minLevel: 56,
    maxLevel: 64,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The Treasures of Ruin, sealed in four shrines by the stakes scattered over Paldea: Wo-Chien, Chien-Pao, Ting-Lu and
    // Chi-Yu.
    conditions: [
      { kind: 'area', areaId: 'pa-pokemon-league' },
      { kind: 'pokedex', count: PALDEA_DEX.trio },
      { kind: 'maxLevel', level: 60 },
    ],
    bosses: [
      { dex: 1001, level: 60, teamAvgThreshold: 0 }, // Wo-Chien
      { dex: 1002, level: 60, teamAvgThreshold: 0 }, // Chien-Pao
      { dex: 1003, level: 60, teamAvgThreshold: 0 }, // Ting-Lu
      { dex: 1004, level: 60, teamAvgThreshold: 0 }, // Chi-Yu
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-loyalty-plaza',
    name: 'Loyalty Plaza',
    orderIndex: 953,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 74,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The Loyal Three, Kitakami's heroes of legend: Okidogi, Munkidori and Fezandipiti.
    conditions: [
      { kind: 'area', areaId: 'pa-kitakami' },
      { kind: 'pokedex', count: PALDEA_DEX.trio },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [
      { dex: 1014, level: 70, teamAvgThreshold: 0 }, // Okidogi
      { dex: 1015, level: 70, teamAvgThreshold: 0 }, // Munkidori
      { dex: 1016, level: 70, teamAvgThreshold: 0 }, // Fezandipiti
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-oni-mountain',
    name: 'Oni Mountain & the Crystal Pool',
    orderIndex: 954,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 66,
    maxLevel: 74,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Ogerpon, the masked ogre the Loyal Three wronged, on its mountain.
    conditions: [
      { kind: 'area', areaId: 'pa-loyalty-plaza' },
      { kind: 'pokedex', count: PALDEA_DEX.trio },
      { kind: 'maxLevel', level: 70 },
    ],
    bosses: [{ dex: 1017, level: 70, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-paradox-sightings',
    name: 'The Paradox Sightings',
    orderIndex: 955,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 70,
    maxLevel: 80,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The paradox legendaries, found in Area Zero for Perrin's research: Walking Wake and Iron Leaves, then Gouging Fire,
    // Raging Bolt, Iron Boulder and Iron Crown.
    conditions: [
      { kind: 'area', areaId: 'pa-blueberry' },
      { kind: 'pokedex', count: PALDEA_DEX.trio },
      { kind: 'maxLevel', level: 75 },
    ],
    bosses: [
      { dex: 1009, level: 75, teamAvgThreshold: 0 }, // Walking Wake
      { dex: 1010, level: 75, teamAvgThreshold: 0 }, // Iron Leaves
      { dex: 1020, level: 75, teamAvgThreshold: 0 }, // Gouging Fire
      { dex: 1021, level: 75, teamAvgThreshold: 0 }, // Raging Bolt
      { dex: 1022, level: 75, teamAvgThreshold: 0 }, // Iron Boulder
      { dex: 1023, level: 75, teamAvgThreshold: 0 }, // Iron Crown
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-underdepths',
    name: 'The Area Zero Underdepths',
    orderIndex: 956,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 78,
    maxLevel: 88,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Terapagos, the Stellar Pokémon, below Area Zero.
    conditions: [
      { kind: 'area', areaId: 'pa-blueberry' },
      { kind: 'pokedex', count: PALDEA_DEX.box },
      { kind: 'maxLevel', level: 85 },
    ],
    bosses: [{ dex: 1024, level: 85 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'pa-kitakami-hall',
    name: 'Kitakami Hall',
    orderIndex: 957,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 80,
    maxLevel: 90,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Pecharunt, the poison-mochi mythical behind Kitakami's Mochi Mayhem.
    conditions: [
      { kind: 'area', areaId: 'pa-underdepths' },
      { kind: 'pokedex', count: PALDEA_DEX.mythical },
      { kind: 'maxLevel', level: 88 },
    ],
    bosses: [{ dex: 1025, level: 88, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
]
