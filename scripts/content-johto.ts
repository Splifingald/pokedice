// Johto, in order of discovery, routed and balanced on HeartGold / SoulSilver. Same shape as Kanto's content.ts:
// hand-written plans that become plain data rows, all editable in admin afterwards.
//
// Wild pools follow the HGSS routes (version exclusives merged, day/night merged since this game has no cycle).
// Gym leaders, the Elite Four and Lance use their real top Pokémon. Legendaries are never in a wild pool — each is
// attached to an area as a boss, except the three beasts, which roam (see engine/encounters.ts).
import { area, DECK as W, type AreaPlan } from './content'

/** Johto's starters: Chikorita, Cyndaquil, Totodile. */
export const JOHTO_STARTERS = [152, 155, 158]

/** Johto areas sit at 201+ so the three regions stay grouped when areas are sorted by orderIndex. */
export const JOHTO_AREAS: AreaPlan[] = [
  area({
    key: 'jo-route-29',
    name: 'Route 29',
    orderIndex: 201,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [161, 40, 2, 5], // Sentret
      [163, 25, 2, 5], // Hoothoot
      [16, 20, 2, 4], // Pidgey
      [19, 15, 2, 4], // Rattata
    ],
    trainers: [],
  }),
  area({
    key: 'jo-routes-30-31',
    name: 'Routes 30 & 31',
    orderIndex: 202,
    banner: { scene: 'forest' },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 8,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [10, 14, 3, 6], // Caterpie
      [13, 14, 3, 6], // Weedle
      [165, 16, 3, 6], // Ledyba
      [167, 16, 3, 6], // Spinarak
      [69, 12, 4, 7], // Bellsprout
      [163, 12, 3, 7], // Hoothoot
      [161, 10, 3, 7], // Sentret
      [41, 6, 4, 7], // Zubat
    ],
    trainers: [
      { name: 'Youngster Joey', team: [[19, 5]] },
      { name: 'Bug Catcher Don', team: [[167, 6], [165, 6]] },
      { name: 'Lass Abigail', team: [[161, 7], [163, 7]] },
      { name: 'Youngster Mikey', team: [[16, 7], [19, 7]] },
    ],
  }),
  area({
    key: 'jo-violet-city',
    name: 'Violet City & Sprout Tower',
    orderIndex: 203,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 4,
    maxLevel: 10,
    weights: W.mixed,
    tier: 1,
    wild: [
      [69, 30, 4, 8], // Bellsprout
      [19, 20, 4, 8], // Rattata
      [92, 16, 5, 9], // Gastly
      [163, 18, 4, 9], // Hoothoot
      [16, 16, 4, 9], // Pidgey
    ],
    trainers: [
      { name: 'Sage Nico', team: [[69, 8], [69, 8]] },
      { name: 'Sage Chow', team: [[69, 9], [69, 9], [69, 9]] },
      { name: 'Sage Edmond', team: [[69, 9], [92, 8]] },
      { name: 'Bird Keeper Rod', team: [[16, 9], [16, 9]] },
      { name: 'Youngster Albert', team: [[19, 10], [41, 9]] },
    ],
    gyms: [
      { name: 'Falkner', role: 'leader', badge: 'Zephyr Badge', specialty: 'flying', team: [[16, 9], [17, 13]] },
    ],
  }),
  area({
    key: 'jo-route-32',
    name: 'Route 32',
    orderIndex: 204,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 6,
    maxLevel: 13,
    weights: W.mixed,
    tier: 2,
    wild: [
      [23, 18, 6, 10], // Ekans
      [179, 18, 6, 10], // Mareep
      [187, 16, 6, 10], // Hoppip
      [194, 14, 7, 11], // Wooper
      [69, 12, 7, 11], // Bellsprout
      [41, 12, 7, 12], // Zubat
      [129, 14, 6, 10], // Magikarp
      [72, 10, 8, 12], // Tentacool
    ],
    trainers: [
      { name: 'Fisherman Justin', team: [[129, 11], [129, 11]] },
      { name: 'Fisherman Ralph', team: [[129, 12], [118, 12]] }, // Goldeen
      { name: 'Youngster Albert', team: [[19, 12], [23, 12]] },
      { name: 'Bird Keeper Peter', team: [[16, 12], [163, 12]] },
      { name: 'Camper Roland', team: [[29, 13], [187, 13]] },
      { name: 'Picnicker Liz', team: [[179, 13], [161, 13]] },
    ],
  }),
  area({
    key: 'jo-union-cave',
    name: 'Union Cave',
    orderIndex: 205,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 8,
    maxLevel: 15,
    weights: W.mixed,
    tier: 2,
    wild: [
      [74, 24, 8, 13], // Geodude
      [41, 20, 8, 13], // Zubat
      [95, 10, 9, 14], // Onix
      [19, 14, 8, 13], // Rattata
      [27, 14, 9, 14], // Sandshrew
      [194, 12, 9, 14], // Wooper
      [66, 10, 10, 15], // Machop
    ],
    trainers: [
      { name: 'Hiker Russell', team: [[74, 13], [74, 13], [95, 14]] },
      { name: 'Hiker Daniel', team: [[74, 14], [66, 14]] },
      { name: 'Pokémaniac Larry', team: [[95, 15], [27, 14]] },
      { name: 'Firebreather Ray', team: [[109, 14], [126, 15]] }, // Koffing, Magmar
    ],
  }),
  area({
    key: 'jo-slowpoke-well',
    name: 'Route 33 & Slowpoke Well',
    orderIndex: 206,
    banner: { scene: 'cave', flip: true },
    roundsToClear: 1,
    minLevel: 9,
    maxLevel: 16,
    weights: W.mixed,
    tier: 2,
    wild: [
      [79, 30, 9, 15], // Slowpoke
      [41, 22, 10, 15], // Zubat
      [74, 16, 10, 15], // Geodude
      [21, 16, 10, 15], // Spearow
      [187, 16, 10, 15], // Hoppip
    ],
    trainers: [
      { name: 'Team Rocket Grunt Silas', team: [[23, 15], [41, 15]] },
      { name: 'Team Rocket Grunt Wade', team: [[109, 16], [19, 15]] },
      { name: 'Hiker Anthony', team: [[74, 16], [95, 16]] },
    ],
  }),
  area({
    key: 'jo-azalea-town',
    name: 'Azalea Town',
    orderIndex: 207,
    banner: { scene: 'city', flip: true },
    roundsToClear: 1,
    minLevel: 10,
    maxLevel: 18,
    weights: W.busy,
    tier: 2,
    wild: [
      [10, 20, 10, 14], // Caterpie
      [13, 20, 10, 14], // Weedle
      [167, 20, 11, 16], // Spinarak
      [165, 20, 11, 16], // Ledyba
      [46, 12, 12, 17], // Paras
      [123, 4, 14, 17], // Scyther
    ],
    trainers: [
      { name: 'Team Rocket Grunt Kyle', team: [[41, 17], [109, 17]] },
      { name: 'Team Rocket Grunt Nick', team: [[19, 17], [23, 17]] },
      { name: 'Twins Amy & May', team: [[35, 17], [35, 17]] }, // Clefairy
      { name: 'Bug Catcher Benny', team: [[13, 16], [14, 17]] },
    ],
    gyms: [
      { name: 'Bugsy', role: 'leader', badge: 'Hive Badge', specialty: 'bug', team: [[11, 14], [14, 14], [123, 16]] },
    ],
  }),
  area({
    key: 'jo-ilex-forest',
    name: 'Ilex Forest',
    orderIndex: 208,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 1,
    minLevel: 12,
    maxLevel: 20,
    weights: W.light,
    tier: 2,
    wild: [
      [10, 14, 12, 16], // Caterpie
      [11, 12, 14, 18], // Metapod
      [46, 16, 13, 18], // Paras
      [43, 16, 13, 18], // Oddish
      [54, 14, 13, 18], // Psyduck
      [41, 12, 13, 18], // Zubat
      [204, 12, 14, 19], // Pineco
      [114, 4, 15, 20], // Tangela
    ],
    trainers: [
      { name: 'Bug Catcher Wayne', team: [[11, 18], [14, 18]] },
      { name: 'Lass Krise', team: [[43, 19], [46, 19]] },
      { name: 'Camper Ivan', team: [[54, 19], [204, 19]] },
    ],
  }),
  area({
    key: 'jo-route-34',
    name: 'Route 34 & the Day Care',
    orderIndex: 209,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 14,
    maxLevel: 22,
    weights: W.mixed,
    tier: 3,
    wild: [
      [19, 18, 14, 19], // Rattata
      [63, 14, 14, 19], // Abra
      [96, 16, 15, 20], // Drowzee
      [132, 8, 15, 20], // Ditto
      [209, 14, 15, 20], // Snubbull
      [16, 16, 14, 20], // Pidgey
      [161, 14, 14, 20], // Sentret
    ],
    trainers: [
      { name: 'Camper Todd', team: [[58, 20], [77, 20]] }, // Growlithe, Ponyta
      { name: 'Picnicker Gina', team: [[43, 20], [187, 20]] },
      { name: 'Youngster Samuel', team: [[19, 21], [96, 21]] },
      { name: 'Psychic Mark', team: [[63, 21], [96, 21]] },
      { name: 'Schoolboy Alan', team: [[81, 21], [100, 21]] }, // Magnemite, Voltorb
    ],
  }),
  area({
    key: 'jo-goldenrod-city',
    name: 'Goldenrod City',
    orderIndex: 210,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 15,
    maxLevel: 24,
    // The Game Corner sits in Goldenrod, exactly as it does in the originals.
    weights: W.casino,
    tier: 3,
    wild: [
      [19, 30, 15, 20], // Rattata
      [16, 30, 15, 20], // Pidgey
      [35, 20, 16, 22], // Clefairy
      [39, 20, 16, 22], // Jigglypuff
    ],
    trainers: [
      { name: 'Lass Dana', team: [[209, 22], [35, 22]] },
      { name: 'Beauty Valerie', team: [[39, 23], [35, 23]] },
      { name: 'Gentleman Alfred', team: [[83, 23], [58, 23]] }, // Farfetch'd, Growlithe
      { name: 'Team Rocket Grunt Kenny', team: [[109, 23], [88, 23]] }, // Koffing, Grimer
      { name: 'Schoolboy Chad', team: [[81, 23], [81, 23]] },
    ],
    gyms: [
      { name: 'Whitney', role: 'leader', badge: 'Plain Badge', specialty: 'normal', team: [[35, 20], [241, 24]] },
    ],
  }),
  area({
    key: 'jo-routes-35-37',
    name: 'Routes 35–37',
    orderIndex: 211,
    banner: { scene: 'flowers' },
    roundsToClear: 1,
    minLevel: 17,
    maxLevel: 26,
    weights: W.mixed,
    tier: 3,
    wild: [
      [29, 12, 17, 22], // Nidoran♀
      [32, 12, 17, 22], // Nidoran♂
      [63, 10, 17, 22], // Abra
      [187, 12, 17, 23], // Hoppip
      [191, 12, 18, 23], // Sunkern
      [58, 10, 18, 24], // Growlithe
      [234, 10, 19, 25], // Stantler
      [165, 10, 18, 24], // Ledyba
      [167, 10, 18, 24], // Spinarak
      [203, 8, 19, 25], // Girafarig
      [16, 10, 17, 24], // Pidgey
    ],
    trainers: [
      { name: 'Bug Catcher Arnie', team: [[165, 24], [167, 24]] },
      { name: 'Camper Ivan', team: [[234, 25], [58, 25]] },
      { name: 'Picnicker Brooke', team: [[187, 25], [191, 25]] },
      { name: 'Psychic Greg', team: [[63, 25], [203, 25]] },
      { name: 'Schoolboy Jack', team: [[81, 25], [96, 25]] },
      { name: 'Bird Keeper Vance', team: [[163, 26], [17, 26]] },
    ],
  }),
  area({
    key: 'jo-national-park',
    name: 'National Park',
    orderIndex: 212,
    banner: { scene: 'flowers', flip: true },
    roundsToClear: 1,
    minLevel: 18,
    maxLevel: 27,
    weights: W.light,
    tier: 3,
    wild: [
      [10, 12, 18, 22], // Caterpie
      [11, 10, 20, 24], // Metapod
      [12, 8, 22, 27], // Butterfree
      [13, 12, 18, 22], // Weedle
      [14, 10, 20, 24], // Kakuna
      [15, 8, 22, 27], // Beedrill
      [48, 12, 19, 25], // Venonat
      [204, 10, 20, 26], // Pineco
      [191, 10, 19, 25], // Sunkern
      [123, 4, 24, 27], // Scyther
      [127, 4, 24, 27], // Pinsir
    ],
    trainers: [
      { name: 'Bug Catcher Ed', team: [[12, 26], [48, 26]] },
      { name: 'Schoolboy Jack', team: [[81, 26], [63, 26]] },
      { name: 'Lass Krise', team: [[43, 26], [69, 26]] },
      { name: 'Camper Todd', team: [[204, 27], [46, 27]] },
    ],
  }),
  area({
    key: 'jo-ecruteak-city',
    name: 'Ecruteak City & the Burned Tower',
    orderIndex: 213,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 20,
    maxLevel: 29,
    weights: W.mixed,
    tier: 3,
    wild: [
      [92, 22, 20, 26], // Gastly
      [93, 10, 24, 29], // Haunter
      [19, 16, 20, 25], // Rattata
      [109, 14, 21, 27], // Koffing
      [41, 16, 21, 27], // Zubat
      [126, 6, 24, 29], // Magmar
      [77, 10, 22, 28], // Ponyta
    ],
    trainers: [
      { name: 'Sage Jeffrey', team: [[92, 28], [92, 28]] },
      { name: 'Sage Ping', team: [[93, 28], [109, 28]] },
      { name: 'Psychic Norman', team: [[96, 28], [63, 28]] },
      { name: 'Beauty Nina', team: [[35, 28], [39, 28]] },
      { name: 'Firebreather Bill', team: [[126, 29], [77, 29]] },
    ],
    gyms: [
      { name: 'Morty', role: 'leader', badge: 'Fog Badge', specialty: 'ghost', team: [[92, 21], [93, 25], [94, 29]] },
    ],
  }),
  area({
    key: 'jo-routes-38-39',
    name: 'Routes 38 & 39',
    orderIndex: 214,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 1,
    minLevel: 22,
    maxLevel: 31,
    weights: W.mixed,
    tier: 3,
    wild: [
      [128, 12, 24, 30], // Tauros
      [81, 14, 22, 28], // Magnemite
      [52, 16, 22, 28], // Meowth
      [209, 14, 23, 29], // Snubbull
      [16, 12, 22, 28], // Pidgey
      [19, 12, 22, 28], // Rattata
      [241, 8, 25, 31], // Miltank
      [83, 6, 24, 30], // Farfetch'd
    ],
    trainers: [
      { name: 'Pokéfan Derek', team: [[52, 30], [241, 30]] },
      { name: 'Beauty Valerie', team: [[39, 30], [209, 30]] },
      { name: 'Schoolboy Chad', team: [[81, 30], [82, 30]] }, // Magneton
      { name: 'Lass Dana', team: [[52, 31], [161, 31]] },
      { name: 'Sailor Harry', team: [[72, 31], [98, 31]] }, // Tentacool, Krabby
    ],
  }),
  area({
    key: 'jo-olivine-city',
    name: 'Olivine City & the Lighthouse',
    orderIndex: 215,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 24,
    maxLevel: 34,
    weights: W.mixed,
    tier: 4,
    wild: [
      [72, 20, 24, 30], // Tentacool
      [98, 18, 24, 30], // Krabby
      [120, 16, 25, 31], // Staryu
      [90, 16, 25, 31], // Shellder
      [129, 14, 24, 30], // Magikarp
      [170, 16, 25, 32], // Chinchou
    ],
    trainers: [
      { name: 'Sailor Eugene', team: [[99, 32], [98, 32]] }, // Kingler, Krabby
      { name: 'Sailor Huey', team: [[72, 33], [73, 33]] }, // Tentacruel
      { name: 'Swimmer Nina', team: [[120, 33], [90, 33]] },
      { name: 'Black Belt Kenji', team: [[67, 33], [57, 33]] }, // Machoke, Primeape
    ],
    gyms: [
      { name: 'Jasmine', role: 'leader', badge: 'Mineral Badge', specialty: 'steel', team: [[81, 30], [81, 30], [208, 35]] },
    ],
  }),
  area({
    key: 'jo-routes-40-41',
    name: 'Routes 40 & 41',
    orderIndex: 216,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 26,
    maxLevel: 36,
    weights: W.mixed,
    tier: 4,
    wild: [
      [72, 18, 26, 32], // Tentacool
      [226, 8, 28, 35], // Mantine
      [170, 16, 26, 33], // Chinchou
      [116, 14, 27, 33], // Horsea
      [98, 14, 26, 32], // Krabby
      [129, 12, 26, 32], // Magikarp
      [86, 12, 28, 34], // Seel
      [79, 10, 27, 34], // Slowpoke
    ],
    trainers: [
      { name: 'Swimmer Nicole', team: [[120, 35], [121, 35]] }, // Staryu, Starmie
      { name: 'Swimmer Charlie', team: [[73, 35], [90, 35]] },
      { name: 'Sailor Kent', team: [[99, 36], [86, 36]] },
      { name: 'Bird Keeper Vance', team: [[163, 36], [164, 36]] }, // Noctowl
    ],
  }),
  area({
    key: 'jo-cianwood-city',
    name: 'Cianwood City',
    orderIndex: 217,
    banner: { scene: 'beach', flip: true },
    roundsToClear: 1,
    minLevel: 28,
    maxLevel: 38,
    weights: W.busy,
    tier: 4,
    wild: [
      [72, 24, 28, 34], // Tentacool
      [98, 20, 28, 34], // Krabby
      [90, 18, 29, 35], // Shellder
      [213, 6, 30, 36], // Shuckle
      [120, 16, 29, 35], // Staryu
    ],
    trainers: [
      { name: 'Black Belt Yoshi', team: [[67, 37], [57, 37]] },
      { name: 'Black Belt Lao', team: [[106, 37], [107, 37]] }, // Hitmonlee, Hitmonchan
      { name: 'Black Belt Nob', team: [[68, 38]] }, // Machamp
      { name: 'Swimmer Charlie', team: [[73, 37], [121, 37]] },
    ],
    gyms: [
      { name: 'Chuck', role: 'leader', badge: 'Storm Badge', specialty: 'fighting', team: [[57, 33], [62, 38]] },
    ],
  }),
  area({
    key: 'jo-lake-of-rage',
    name: 'Routes 42 & 43 and the Lake of Rage',
    orderIndex: 218,
    banner: { scene: 'ocean', flip: true },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 40,
    weights: W.mixed,
    tier: 4,
    // The red Gyarados waits at the lake, once the routes have been walked.
    bosses: [{ dex: 130, level: 36 }],
    wild: [
      [129, 20, 30, 35], // Magikarp
      [179, 14, 30, 36], // Mareep
      [180, 10, 33, 39], // Flaaffy
      [183, 14, 30, 36], // Marill
      [203, 12, 31, 37], // Girafarig
      [56, 12, 30, 36], // Mankey
      [194, 12, 30, 36], // Wooper
      [195, 10, 33, 39], // Quagsire
      [163, 10, 30, 37], // Hoothoot
    ],
    trainers: [
      { name: 'Fisherman Ralph', team: [[129, 39], [130, 39]] },
      { name: 'Fisherman Tully', team: [[118, 39], [119, 39]] }, // Goldeen, Seaking
      { name: 'Ace Trainer Blake', team: [[180, 40], [203, 40]] },
      { name: 'Hiker Benjamin', team: [[75, 40], [95, 40]] }, // Graveler, Onix
    ],
  }),
  area({
    key: 'jo-mahogany-town',
    name: 'Mahogany Town & the Rocket Hideout',
    orderIndex: 219,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 32,
    maxLevel: 42,
    weights: W.busy,
    tier: 4,
    // The Master Ball sits in the Rocket Hideout — very rare, and only ever found once.
    once: [
      ['master-ball', 2, 1, 1, true],
      ['rare-candy', 8, 1, 1, true],
    ],
    wild: [
      [109, 22, 32, 38], // Koffing
      [88, 20, 32, 38], // Grimer
      [100, 18, 33, 39], // Voltorb
      [101, 12, 35, 41], // Electrode
      [81, 16, 33, 39], // Magnemite
      [19, 12, 32, 38], // Rattata
    ],
    trainers: [
      { name: 'Team Rocket Grunt Boris', team: [[109, 41], [88, 41]] },
      { name: 'Team Rocket Grunt Lars', team: [[100, 41], [19, 41]] },
      { name: 'Team Rocket Grunt Vera', team: [[23, 41], [41, 41]] },
      { name: 'Rocket Executive Ariana', team: [[53, 42], [42, 42]] }, // Persian, Golbat
      { name: 'Rocket Executive Petrel', team: [[110, 42], [89, 42]] }, // Weezing, Muk
    ],
    gyms: [
      { name: 'Pryce', role: 'leader', badge: 'Glacier Badge', specialty: 'ice', team: [[86, 27], [87, 29], [221, 31]] },
    ],
  }),
  area({
    key: 'jo-ice-path',
    name: 'Route 44 & the Ice Path',
    orderIndex: 220,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 35,
    maxLevel: 45,
    weights: W.mixed,
    tier: 4,
    wild: [
      [220, 20, 35, 41], // Swinub
      [225, 12, 36, 42], // Delibird
      [124, 10, 37, 43], // Jynx
      [42, 16, 35, 42], // Golbat
      [215, 10, 37, 44], // Sneasel
      [60, 12, 35, 41], // Poliwag
      [114, 10, 36, 42], // Tangela
      [108, 10, 36, 42], // Lickitung
    ],
    trainers: [
      { name: 'Skier Roxanne', team: [[220, 44], [225, 44]] },
      { name: 'Skier Clarissa', team: [[124, 44], [87, 44]] },
      { name: 'Ace Trainer Irene', team: [[221, 45], [215, 45]] },
      { name: 'Bird Keeper Roy', team: [[164, 45], [22, 45]] }, // Noctowl, Fearow
    ],
  }),
  area({
    key: 'jo-blackthorn-city',
    name: "Blackthorn City & the Dragon's Den",
    orderIndex: 221,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 38,
    maxLevel: 48,
    weights: W.busy,
    tier: 5,
    wild: [
      [147, 14, 38, 44], // Dratini
      [148, 8, 42, 48], // Dragonair
      [129, 16, 38, 44], // Magikarp
      [116, 14, 38, 44], // Horsea
      [117, 10, 42, 48], // Seadra
      [42, 14, 38, 45], // Golbat
      [95, 12, 39, 46], // Onix
      [111, 12, 39, 46], // Rhyhorn
    ],
    trainers: [
      { name: 'Ace Trainer Cody', team: [[148, 47], [117, 47]] },
      { name: 'Ace Trainer Fran', team: [[112, 47], [105, 47]] }, // Rhydon, Marowak
      { name: 'Sage Koji', team: [[93, 47], [97, 47]] }, // Haunter, Hypno
      { name: 'Black Belt Nob', team: [[68, 48], [106, 48]] },
    ],
    gyms: [
      { name: 'Clair', role: 'leader', badge: 'Rising Badge', specialty: 'dragon', team: [[148, 38], [148, 38], [230, 41]] },
    ],
  }),
  area({
    key: 'jo-victory-road',
    name: 'Victory Road',
    orderIndex: 222,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 40,
    maxLevel: 50,
    weights: W.mixed,
    tier: 5,
    wild: [
      [42, 16, 40, 46], // Golbat
      [75, 14, 40, 46], // Graveler
      [95, 12, 40, 46], // Onix
      [232, 10, 42, 48], // Donphan
      [217, 10, 42, 48], // Ursaring
      [111, 12, 40, 46], // Rhyhorn
      [28, 12, 41, 47], // Sandslash
      [105, 12, 41, 47], // Marowak
      [246, 6, 42, 48], // Larvitar
    ],
    trainers: [
      { name: 'Ace Trainer Blake', team: [[232, 49], [217, 49]] },
      { name: 'Ace Trainer Irene', team: [[112, 49], [76, 49]] }, // Rhydon, Golem
      { name: 'Ace Trainer Cody', team: [[149, 50], [148, 50]] }, // Dragonite
      { name: 'Black Belt Lao', team: [[68, 50], [237, 50]] }, // Machamp, Hitmontop
    ],
  }),
  area({
    key: 'jo-indigo-plateau',
    name: 'Indigo Plateau',
    orderIndex: 223,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 55,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      { name: 'Ace Trainer Quinn', team: [[181, 50], [232, 50]] }, // Ampharos, Donphan
      { name: 'Ace Trainer Mira', team: [[196, 51], [197, 51]] }, // Espeon, Umbreon
      { name: 'Ace Trainer Vance', team: [[248, 52], [212, 52]] }, // Tyranitar, Scizor
    ],
    gyms: [
      { name: 'Elite Four Will', role: 'elite', specialty: 'psychic', team: [[178, 42], [124, 44], [103, 46]] }, // Xatu, Jynx, Exeggutor
      { name: 'Elite Four Koga', role: 'elite', specialty: 'poison', team: [[168, 44], [49, 46], [205, 48]] }, // Ariados, Venomoth, Forretress
      { name: 'Elite Four Bruno', role: 'elite', specialty: 'fighting', team: [[237, 46], [107, 48], [68, 50]] },
      { name: 'Elite Four Karen', role: 'elite', specialty: 'dark', team: [[198, 47], [229, 49], [197, 51]] }, // Murkrow, Houndoom, Umbreon
      { name: 'Champion Lance', role: 'champion', specialty: 'dragon', team: [[130, 50], [149, 52], [149, 54]] },
    ],
  }),
  area({
    key: 'jo-mt-silver',
    name: 'Mt. Silver',
    orderIndex: 224,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 1,
    minLevel: 55,
    maxLevel: 70,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    // Every Johto species, so the Pokédex can be finished after the league.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Quinn', specialty: 'rock', size: 3 },
      { name: 'Ace Trainer Mira', specialty: 'ice', size: 3 },
      { name: 'Ace Trainer Vance', specialty: 'dragon', size: 3 },
    ],
    gyms: [
      { name: 'Red', role: 'champion', specialty: 'normal', team: [[25, 68], [3, 66], [6, 66]] }, // Pikachu, Venusaur, Charizard
    ],
  }),

  // ---------------------------------------------------------------- secret areas

  area({
    key: 'jo-ruins-of-alph',
    name: 'Ruins of Alph',
    orderIndex: 251,
    banner: { scene: 'crystal_cave' },
    roundsToClear: null,
    minLevel: 12,
    maxLevel: 28,
    weights: W.lair,
    tier: 3,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'jo-route-32' }, { kind: 'pokedex', count: 12 }],
    // The only place Unown is found.
    wild: [
      [201, 70, 12, 28], // Unown
      [41, 15, 12, 24], // Zubat
      [74, 15, 12, 24], // Geodude
    ],
    trainers: [],
  }),
  area({
    key: 'jo-whirl-islands',
    name: 'Whirl Islands',
    orderIndex: 252,
    banner: { scene: 'ocean' },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 42,
    weights: W.lair,
    tier: 4,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'jo-routes-40-41' }, { kind: 'maxLevel', level: 38 }],
    bosses: [{ dex: 249, level: 45 }], // Lugia
    wild: [
      [41, 20, 30, 38], // Zubat
      [42, 16, 34, 42], // Golbat
      [79, 16, 30, 38], // Slowpoke
      [86, 16, 31, 39], // Seel
      [90, 16, 31, 39], // Shellder
      [116, 16, 31, 39], // Horsea
    ],
    trainers: [],
  }),
  area({
    key: 'jo-bell-tower',
    name: 'Bell Tower',
    orderIndex: 253,
    banner: { scene: 'haunted', flip: true },
    roundsToClear: 1,
    minLevel: 32,
    maxLevel: 44,
    weights: W.lair,
    tier: 4,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'jo-ecruteak-city' }, { kind: 'maxLevel', level: 40 }],
    bosses: [{ dex: 250, level: 45 }], // Ho-Oh
    wild: [
      [163, 20, 32, 40], // Hoothoot
      [164, 14, 36, 44], // Noctowl
      [92, 18, 32, 40], // Gastly
      [93, 14, 36, 44], // Haunter
      [16, 16, 32, 40], // Pidgey
      [17, 12, 36, 44], // Pidgeotto
    ],
    trainers: [],
  }),
  area({
    key: 'jo-ilex-shrine',
    name: 'Ilex Shrine',
    orderIndex: 254,
    banner: { scene: 'forest' },
    roundsToClear: null,
    minLevel: 45,
    maxLevel: 55,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The shrine answers only to a full-ish Pokédex.
    conditions: [{ kind: 'area', areaId: 'jo-ilex-forest' }, { kind: 'pokedex', count: 120 }],
    bosses: [{ dex: 251, level: 50, teamAvgThreshold: 0 }], // Celebi, waiting on arrival
    wild: [],
    trainers: [],
  }),
]
