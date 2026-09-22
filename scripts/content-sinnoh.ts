// Sinnoh, in order of discovery, routed and balanced on Platinum. Same shape as Kanto's content.ts.
//
// Wild pools follow the Platinum routes (version exclusives merged). Gym leaders, the Elite Four and Cynthia use
// their real top Pokémon. Legendaries are never in a wild pool — each is attached to an area as a boss. The two
// fossil lines (Cranidos and Shieldon) are never wild either: the Skull and Armor Fossil in the Oreburgh Mine are
// their only source, the way Kanto's Dome and Helix work.
import { area, DECK as W, type AreaPlan } from './content'

/** Sinnoh's starters: Turtwig, Chimchar, Piplup. */
export const SINNOH_STARTERS = [387, 390, 393]

/** Sinnoh areas sit at 401+, after Hoenn's 301+. */
export const SINNOH_AREAS: AreaPlan[] = [
  area({
    key: 'si-route-201',
    name: 'Route 201 & Lake Verity',
    orderIndex: 401,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [396, 45, 2, 5], // Starly
      [399, 40, 2, 5], // Bidoof
      [401, 15, 2, 4], // Kricketot
    ],
    trainers: [],
  }),
  area({
    key: 'si-route-202',
    name: 'Route 202 & Jubilife City',
    orderIndex: 402,
    banner: { scene: 'city' },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 8,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [396, 22, 3, 6], // Starly
      [399, 20, 3, 6], // Bidoof
      [403, 20, 3, 7], // Shinx
      [401, 14, 3, 6], // Kricketot
      [63, 12, 4, 7], // Abra
      [265, 12, 3, 6], // Wurmple
    ],
    trainers: [
      { name: 'Youngster Tristan', team: [[399, 6], [396, 6]] },
      { name: 'Lass Natalie', team: [[401, 7], [265, 7]] },
      { name: 'Barry', team: [[396, 8], [399, 8]] },
    ],
  }),
  area({
    key: 'si-route-203',
    name: 'Route 203 & Oreburgh Gate',
    orderIndex: 403,
    banner: { scene: 'cave' },
    roundsToClear: 3,
    minLevel: 5,
    maxLevel: 11,
    weights: W.light,
    tier: 1,
    wild: [
      [41, 22, 5, 10], // Zubat
      [74, 20, 5, 10], // Geodude
      [403, 16, 5, 10], // Shinx
      [54, 14, 6, 11], // Psyduck
      [66, 14, 6, 11], // Machop
      [396, 14, 5, 10], // Starly
    ],
    trainers: [
      { name: 'Youngster Logan', team: [[403, 9], [396, 9]] },
      { name: 'Bug Catcher Jonah', team: [[401, 9], [265, 10]] },
      { name: 'Hiker Nolan', team: [[74, 10], [41, 10]] },
    ],
  }),
  area({
    key: 'si-oreburgh',
    name: 'Oreburgh City & the Mine',
    orderIndex: 404,
    banner: { scene: 'mountains' },
    roundsToClear: 3,
    minLevel: 8,
    maxLevel: 14,
    weights: W.mixed,
    tier: 2,
    // The two fossils of the mine, each found once: they are the only Cranidos and Shieldon in the game.
    once: [
      ['skull-fossil', 6, 1, 1, true],
      ['armor-fossil', 6, 1, 1, true],
    ],
    wild: [
      [74, 26, 8, 13], // Geodude
      [41, 22, 8, 13], // Zubat
      [95, 14, 9, 14], // Onix
      [66, 14, 9, 14], // Machop
      [438, 12, 9, 14], // Bonsly
      [111, 12, 9, 14], // Rhyhorn
    ],
    trainers: [
      { name: 'Worker Colin', team: [[74, 12], [95, 12]] },
      { name: 'Hiker Marcos', team: [[74, 12], [111, 13]] },
    ],
    gyms: [
      // Cranidos is his, and the mine's fossils are the player's way to one of their own.
      { name: 'Roark', role: 'leader', badge: 'Coal Badge', specialty: 'rock', team: [[74, 12], [95, 12], [408, 14]] },
    ],
  }),
  area({
    key: 'si-route-204',
    name: 'Route 204 & the Ravaged Path',
    orderIndex: 405,
    banner: { scene: 'forest' },
    roundsToClear: 3,
    minLevel: 10,
    maxLevel: 16,
    weights: W.mixed,
    tier: 2,
    wild: [
      [406, 22, 10, 15], // Budew
      [265, 18, 10, 15], // Wurmple
      [41, 16, 10, 15], // Zubat
      [54, 16, 11, 16], // Psyduck
      [399, 14, 10, 15], // Bidoof
      [427, 14, 11, 16], // Buneary
    ],
    trainers: [
      { name: 'Lass Erin', team: [[406, 14], [427, 14]] },
      { name: 'Bug Catcher Kevin', team: [[266, 14], [268, 14]] }, // Silcoon, Cascoon
      { name: 'Twins Amy', team: [[399, 13], [396, 13]] },
    ],
  }),
  area({
    key: 'si-eterna-forest',
    name: 'Eterna Forest',
    orderIndex: 406,
    banner: { scene: 'forest', flip: true },
    roundsToClear: 3,
    minLevel: 12,
    maxLevel: 18,
    weights: W.mixed,
    tier: 2,
    wild: [
      [265, 18, 12, 17], // Wurmple
      [266, 14, 13, 18], // Silcoon
      [268, 14, 13, 18], // Cascoon
      [427, 16, 12, 17], // Buneary
      [163, 16, 12, 17], // Hoothoot
      [406, 12, 12, 17], // Budew
      [412, 10, 13, 18], // Burmy
    ],
    trainers: [
      // Cheryl walks the forest with you in Platinum; here she is simply the hardest thing in it.
      { name: 'Cheryl', team: [[440, 16], [415, 16], [406, 17]] }, // Happiny, Combee, Budew
      { name: 'Bug Catcher Philip', team: [[269, 16], [267, 16]] }, // Dustox, Beautifly
      { name: 'Psychic Nadia', team: [[63, 16], [436, 17]] }, // Abra, Bronzor
    ],
  }),
  area({
    key: 'si-eterna-city',
    name: 'Eterna City & the Galactic Building',
    orderIndex: 407,
    banner: { scene: 'city', flip: true },
    roundsToClear: 3,
    minLevel: 15,
    maxLevel: 22,
    weights: W.busy,
    tier: 2,
    wild: [
      [415, 22, 15, 20], // Combee
      [420, 20, 15, 20], // Cherubi
      [396, 18, 15, 20], // Starly
      [427, 16, 16, 21], // Buneary
      [401, 14, 15, 20], // Kricketot
      [434, 10, 16, 21], // Stunky
    ],
    trainers: [
      { name: 'Galactic Grunt Deane', team: [[431, 18], [434, 18]] }, // Glameow, Stunky
      { name: 'Galactic Grunt Sara', team: [[41, 18], [431, 19]] },
      { name: 'Jupiter', team: [[431, 20], [42, 21], [434, 22]] }, // Glameow, Golbat, Stunky
      { name: 'Cyclist Ryan', team: [[403, 19], [396, 19]] },
    ],
    gyms: [
      // Her Turtwig is a starter, and a starter can never be on a trainer's team; Roselia stands in for it.
      { name: 'Gardenia', role: 'leader', badge: 'Forest Badge', specialty: 'grass', team: [[420, 19], [315, 19], [407, 22]] }, // Cherubi, Roselia, Roserade
    ],
  }),
  area({
    key: 'si-cycling-road',
    name: 'Cycling Road & Routes 206–207',
    orderIndex: 408,
    banner: { scene: 'bridge' },
    roundsToClear: 3,
    minLevel: 18,
    maxLevel: 25,
    weights: W.busy,
    tier: 3,
    wild: [
      [434, 20, 18, 24], // Stunky
      [431, 18, 18, 24], // Glameow
      [111, 16, 18, 24], // Rhyhorn
      [74, 16, 18, 24], // Geodude
      [417, 16, 19, 25], // Pachirisu
      [228, 14, 19, 25], // Houndour
    ],
    trainers: [
      { name: 'Cyclist Nina', team: [[403, 22], [417, 22]] },
      { name: 'Jogger Bruno', team: [[399, 22], [396, 23]] },
      { name: 'Ace Trainer Dana', team: [[404, 23], [427, 23]] }, // Luxio, Buneary
      { name: 'Roughneck Kevan', team: [[228, 23], [434, 23]] },
    ],
  }),
  area({
    key: 'si-mt-coronet-south',
    name: 'Mt. Coronet South',
    orderIndex: 409,
    banner: { scene: 'cave_dark' },
    roundsToClear: 4,
    minLevel: 20,
    maxLevel: 28,
    weights: W.mixed,
    tier: 3,
    // The Dawn Stone is a Mt. Coronet find in Platinum, and Sinnoh has two Pokémon waiting on it.
    once: [
      ['dawn-stone', 8, 1, 1, true],
    ],
    wild: [
      [41, 20, 20, 27], // Zubat
      [74, 18, 20, 27], // Geodude
      [436, 16, 21, 28], // Bronzor
      [35, 14, 21, 28], // Clefairy
      [307, 14, 21, 28], // Meditite
      [66, 12, 21, 28], // Machop
      [299, 12, 21, 28], // Nosepass
      [439, 10, 21, 28], // Mime Jr.
    ],
    trainers: [
      { name: 'Hiker Maurice', team: [[75, 25], [95, 25]] }, // Graveler, Onix
      { name: 'Black Belt Steve', team: [[67, 26], [307, 26]] }, // Machoke, Meditite
      { name: 'Ruin Maniac Gerald', team: [[436, 25], [299, 26]] },
    ],
  }),
  area({
    key: 'si-hearthome',
    name: 'Hearthome City',
    orderIndex: 410,
    banner: { scene: 'city' },
    roundsToClear: 3,
    minLevel: 22,
    maxLevel: 30,
    weights: W.casino,
    tier: 3,
    wild: [
      [425, 22, 22, 29], // Drifloon
      [355, 20, 22, 29], // Duskull
      [92, 18, 23, 30], // Gastly
      [200, 16, 23, 30], // Misdreavus
      [431, 14, 22, 29], // Glameow
      [441, 10, 23, 30], // Chatot
    ],
    trainers: [
      { name: 'Barry', team: [[397, 27], [403, 27], [427, 28]] }, // Staravia, Shinx, Buneary
      { name: 'Idol Yuki', team: [[441, 27], [431, 27]] },
      { name: 'Socialite Claire', team: [[427, 28], [420, 28]] },
      { name: 'Artist Salvador', team: [[425, 28], [200, 28]] },
    ],
    gyms: [
      { name: 'Fantina', role: 'leader', badge: 'Relic Badge', specialty: 'ghost', team: [[355, 24], [93, 24], [429, 26]] }, // Duskull, Haunter, Mismagius
    ],
  }),
  area({
    key: 'si-solaceon',
    name: 'Route 209 & the Solaceon Ruins',
    orderIndex: 411,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 4,
    minLevel: 25,
    maxLevel: 32,
    weights: W.mixed,
    tier: 3,
    // What the Underground gives up, dug out of the walls under Solaceon.
    once: [
      ['thunder-stone', 8, 1, 1, true],
      ['shiny-stone', 8, 1, 1, true],
    ],
    wild: [
      [436, 22, 25, 31], // Bronzor
      [74, 18, 25, 31], // Geodude
      [434, 16, 25, 31], // Stunky
      [64, 16, 26, 32], // Kadabra
      [163, 14, 25, 31], // Hoothoot
      [440, 14, 26, 32], // Happiny
    ],
    trainers: [
      { name: 'Ruin Maniac Karl', team: [[436, 29], [95, 29]] },
      { name: 'Pokéfan Elle', team: [[440, 29], [427, 29]] },
      { name: 'School Kid Toby', team: [[401, 29], [402, 30]] }, // Kricketot, Kricketune
      { name: 'Veteran Harry', team: [[64, 30], [42, 30]] },
    ],
  }),
  area({
    key: 'si-veilstone',
    name: 'Veilstone City & the Galactic HQ',
    orderIndex: 412,
    banner: { scene: 'city', flip: true },
    roundsToClear: 4,
    minLevel: 27,
    maxLevel: 35,
    weights: W.casino,
    tier: 3,
    // Left lying in the warehouses behind the Galactic building, as they are in Platinum — and, deepest in the
    // building and once only, the region's Master Ball, the way each region hides one in its villains' hideout.
    once: [
      ['dusk-stone', 8, 1, 1, true],
      ['dubious-disc', 8, 1, 1, true],
      ['master-ball', 2, 1, 1, true],
    ],
    wild: [
      [307, 20, 27, 34], // Meditite
      [66, 18, 27, 34], // Machop
      [453, 18, 28, 35], // Croagunk
      [431, 16, 27, 34], // Glameow
      [436, 14, 28, 35], // Bronzor
      [447, 14, 28, 35], // Riolu
    ],
    trainers: [
      { name: 'Galactic Grunt Eric', team: [[434, 31], [42, 31]] },
      { name: 'Galactic Grunt Nell', team: [[431, 31], [453, 32]] },
      { name: 'Saturn', team: [[42, 33], [453, 33], [436, 35]] }, // Golbat, Croagunk, Bronzor
      { name: 'Battle Girl Tara', team: [[307, 33], [66, 33]] },
    ],
    gyms: [
      { name: 'Maylene', role: 'leader', badge: 'Cobble Badge', specialty: 'fighting', team: [[307, 28], [67, 29], [448, 32]] }, // Meditite, Machoke, Lucario
    ],
  }),
  area({
    key: 'si-pastoria',
    name: 'Route 212 & Pastoria City',
    orderIndex: 413,
    banner: { scene: 'swamp' },
    roundsToClear: 4,
    minLevel: 29,
    maxLevel: 37,
    weights: W.busy,
    tier: 4,
    wild: [
      [422, 20, 29, 36], // Shellos
      [418, 18, 29, 36], // Buizel
      [453, 18, 29, 36], // Croagunk
      [194, 16, 29, 36], // Wooper
      [55, 14, 30, 37], // Golduck
      [400, 14, 30, 37], // Bibarel
    ],
    trainers: [
      { name: 'Swimmer Ivy', team: [[418, 34], [422, 34]] },
      { name: 'Fisherman Andrew', team: [[129, 34], [339, 34]] }, // Magikarp, Barboach
      { name: 'Tuber Kate', team: [[194, 33], [422, 33]] },
      { name: 'Parasol Lady Beth', team: [[55, 35], [419, 35]] }, // Golduck, Floatzel
    ],
    gyms: [
      { name: 'Crasher Wake', role: 'leader', badge: 'Fen Badge', specialty: 'water', team: [[130, 27], [195, 27], [419, 30]] }, // Gyarados, Quagsire, Floatzel
    ],
  }),
  area({
    key: 'si-great-marsh',
    name: 'The Great Marsh',
    orderIndex: 414,
    banner: { scene: 'swamp', flip: true },
    roundsToClear: 4,
    minLevel: 30,
    maxLevel: 38,
    weights: W.mixed,
    tier: 4,
    wild: [
      [455, 16, 30, 37], // Carnivine
      [451, 16, 30, 37], // Skorupi
      [193, 14, 30, 37], // Yanma
      [357, 12, 31, 38], // Tropius
      [46, 12, 30, 37], // Paras
      [316, 12, 30, 37], // Gulpin
      [114, 10, 31, 38], // Tangela
      [195, 10, 30, 37], // Quagsire
      [352, 8, 31, 38], // Kecleon
    ],
    trainers: [
      { name: 'Pokémon Ranger Nicolas', team: [[455, 36], [193, 36]] },
      { name: 'Pokémon Ranger Rosa', team: [[114, 36], [316, 36]] },
    ],
  }),
  area({
    key: 'si-valley-windworks',
    name: 'Route 213 & the Valley Windworks',
    orderIndex: 415,
    banner: { scene: 'factory' },
    roundsToClear: 4,
    minLevel: 31,
    maxLevel: 39,
    weights: W.busy,
    tier: 4,
    // The Electirizer, off the Elekid that live around the Windworks.
    once: [
      ['electirizer', 8, 1, 1, true],
    ],
    wild: [
      [425, 20, 31, 38], // Drifloon
      [417, 18, 31, 38], // Pachirisu
      [404, 16, 31, 38], // Luxio
      [418, 16, 31, 38], // Buizel
      [435, 14, 32, 39], // Skuntank
      [426, 12, 32, 39], // Drifblim
    ],
    trainers: [
      { name: 'Galactic Grunt Wes', team: [[435, 36], [42, 36]] },
      { name: 'Mars', team: [[435, 37], [42, 37], [431, 39]] }, // Skuntank, Golbat, Glameow
      { name: 'Worker Brendon', team: [[404, 36], [436, 36]] },
      { name: 'Beauty Alexa', team: [[426, 37], [417, 37]] },
    ],
  }),
  area({
    key: 'si-celestic',
    name: 'Celestic Town & Route 210',
    orderIndex: 416,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 4,
    minLevel: 32,
    maxLevel: 40,
    weights: W.mixed,
    tier: 4,
    wild: [
      [285, 18, 32, 39], // Shroomish
      [400, 16, 32, 39], // Bibarel
      [441, 16, 33, 40], // Chatot
      [397, 16, 32, 39], // Staravia
      [420, 14, 32, 39], // Cherubi
      [446, 12, 33, 40], // Munchlax
      [443, 8, 33, 40], // Gible
    ],
    trainers: [
      { name: 'Ace Trainer Maria', team: [[398, 38], [405, 38]] }, // Staraptor, Luxray
      { name: 'Veteran Terrell', team: [[443, 38], [435, 38]] },
      { name: 'Aroma Lady Rose', team: [[285, 37], [407, 38]] },
    ],
  }),
  area({
    key: 'si-canalave',
    name: 'Canalave City & Iron Island',
    orderIndex: 417,
    banner: { scene: 'ocean' },
    roundsToClear: 4,
    minLevel: 34,
    maxLevel: 42,
    weights: W.busy,
    tier: 4,
    // The Protector, out of the Iron Island tunnels.
    once: [
      ['protector', 8, 1, 1, true],
    ],
    wild: [
      [436, 18, 34, 41], // Bronzor
      [74, 16, 34, 41], // Geodude
      [95, 14, 35, 42], // Onix
      [304, 14, 35, 42], // Aron
      [447, 12, 35, 42], // Riolu
      [41, 12, 34, 41], // Zubat
      [418, 12, 34, 41], // Buizel
      [211, 12, 34, 41], // Qwilfish
    ],
    trainers: [
      // Riley works the island's tunnels beside you; his Lucario is the reason the island is remembered.
      { name: 'Riley', team: [[448, 40], [305, 40], [436, 41]] }, // Lucario, Lairon, Bronzor
      { name: 'Sailor Duncan', team: [[211, 39], [418, 39]] },
      { name: 'Worker Brand', team: [[305, 39], [95, 39]] },
      { name: 'Barry', team: [[398, 40], [405, 40], [419, 41]] },
    ],
    gyms: [
      { name: 'Byron', role: 'leader', badge: 'Mine Badge', specialty: 'steel', team: [[436, 36], [208, 36], [411, 39]] }, // Bronzor, Steelix, Bastiodon
    ],
  }),
  area({
    key: 'si-the-lakes',
    name: 'Lake Valor & Lake Acuity',
    orderIndex: 418,
    banner: { scene: 'ocean', flip: true },
    roundsToClear: 4,
    minLevel: 36,
    maxLevel: 44,
    weights: W.busy,
    tier: 4,
    wild: [
      [418, 18, 36, 43], // Buizel
      [422, 16, 36, 43], // Shellos
      [130, 12, 37, 44], // Gyarados
      [55, 14, 36, 43], // Golduck
      [419, 14, 37, 44], // Floatzel
      [400, 12, 36, 43], // Bibarel
      [195, 14, 36, 43], // Quagsire
    ],
    trainers: [
      { name: 'Galactic Grunt Jose', team: [[435, 41], [42, 41]] },
      { name: 'Galactic Grunt Mary', team: [[431, 41], [453, 42]] },
      { name: 'Jupiter', team: [[42, 42], [431, 42], [435, 44]] },
      { name: 'Saturn', team: [[42, 42], [453, 43], [436, 44]] },
    ],
  }),
  area({
    key: 'si-snowpoint',
    name: 'Routes 216 & 217 and Snowpoint City',
    orderIndex: 419,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 4,
    minLevel: 38,
    maxLevel: 46,
    weights: W.busy,
    tier: 4,
    wild: [
      [459, 20, 38, 45], // Snover
      [215, 16, 38, 45], // Sneasel
      [361, 16, 38, 45], // Snorunt
      [220, 16, 38, 45], // Swinub
      [225, 14, 39, 46], // Delibird
      [473, 8, 40, 46], // Mamoswine
      [460, 10, 40, 46], // Abomasnow
    ],
    trainers: [
      { name: 'Skier Bjorn', team: [[459, 43], [220, 43]] },
      { name: 'Skier Yuki', team: [[361, 43], [225, 43]] },
      { name: 'Ace Trainer Dennis', team: [[215, 44], [460, 44]] },
      // Candice's friend, and the only thing in Sinnoh that never says a word.
      { name: 'Marley', team: [[431, 44], [432, 45]] }, // Glameow, Purugly
    ],
    gyms: [
      { name: 'Candice', role: 'leader', badge: 'Icicle Badge', specialty: 'ice', team: [[459, 38], [215, 38], [460, 42]] }, // Snover, Sneasel, Abomasnow
    ],
  }),
  area({
    key: 'si-spear-pillar',
    name: 'Mt. Coronet North & Spear Pillar',
    orderIndex: 420,
    banner: { scene: 'sky' },
    roundsToClear: 5,
    minLevel: 40,
    maxLevel: 48,
    weights: W.mixed,
    tier: 5,
    // The creation duo, at the top of the world. Both, because Platinum lets you stand in front of both.
    bosses: [
      { dex: 483, level: 47 }, // Dialga
      { dex: 484, level: 47 }, // Palkia
    ],
    wild: [
      [42, 18, 40, 47], // Golbat
      [437, 14, 41, 48], // Bronzong
      [75, 14, 40, 47], // Graveler
      [308, 14, 41, 48], // Medicham
      [35, 12, 40, 47], // Clefairy
      [444, 12, 41, 48], // Gabite
      [458, 12, 40, 47], // Mantyke
      [460, 14, 41, 48], // Abomasnow
    ],
    trainers: [
      { name: 'Galactic Grunt Fabian', team: [[435, 45], [42, 45]] },
      { name: 'Mars', team: [[435, 46], [42, 46], [432, 47]] },
      { name: 'Jupiter', team: [[42, 46], [431, 46], [435, 47]] },
      { name: 'Cyrus', team: [[430, 47], [437, 47], [448, 48]] }, // Honchkrow, Bronzong, Lucario
    ],
  }),
  area({
    key: 'si-sunyshore',
    name: 'Sunyshore City',
    orderIndex: 421,
    banner: { scene: 'beach' },
    roundsToClear: 4,
    minLevel: 42,
    maxLevel: 50,
    weights: W.busy,
    tier: 5,
    wild: [
      [417, 18, 42, 49], // Pachirisu
      [404, 16, 42, 49], // Luxio
      [458, 16, 42, 49], // Mantyke
      [419, 14, 43, 50], // Floatzel
      [426, 14, 43, 50], // Drifblim
      [170, 12, 42, 49], // Chinchou
      [405, 10, 44, 50], // Luxray
    ],
    trainers: [
      { name: 'Guitarist Lonnie', team: [[405, 47], [125, 47]] }, // Luxray, Electabuzz
      { name: 'Sailor Edmond', team: [[419, 47], [458, 47]] },
      { name: 'Ace Trainer Rosa', team: [[398, 48], [432, 48]] },
      { name: 'Barry', team: [[398, 48], [405, 48], [419, 49]] },
    ],
    gyms: [
      { name: 'Volkner', role: 'leader', badge: 'Beacon Badge', specialty: 'electric', team: [[26, 46], [405, 48], [466, 50]] }, // Raichu, Luxray, Electivire
    ],
  }),
  area({
    key: 'si-victory-road',
    name: 'Victory Road',
    orderIndex: 422,
    banner: { scene: 'cave_dark', flip: true },
    roundsToClear: 5,
    minLevel: 45,
    maxLevel: 54,
    weights: W.mixed,
    tier: 5,
    // Victory Road keeps the last two: the Razor Claw and the Reaper Cloth.
    once: [
      ['razor-claw', 8, 1, 1, true],
      ['reaper-cloth', 8, 1, 1, true],
    ],
    wild: [
      [42, 16, 45, 53], // Golbat
      [75, 14, 45, 53], // Graveler
      [437, 14, 46, 54], // Bronzong
      [308, 12, 46, 54], // Medicham
      [444, 12, 46, 54], // Gabite
      [452, 12, 46, 54], // Drapion
      [332, 10, 45, 53], // Cacturne
      [297, 10, 46, 54], // Hariyama
      [232, 10, 45, 53], // Donphan
    ],
    trainers: [
      { name: 'Veteran Clayton', team: [[445, 52], [452, 52]] }, // Garchomp, Drapion
      { name: 'Ace Trainer Naomi', team: [[437, 51], [398, 51]] },
      { name: 'Black Belt Paul', team: [[297, 51], [308, 51]] },
      { name: 'Psychic Sara', team: [[65, 51], [437, 52]] },
    ],
  }),
  area({
    key: 'si-pokemon-league',
    name: 'The Pokémon League',
    orderIndex: 423,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 60,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      { name: 'Ace Trainer Alyssa', team: [[445, 55], [462, 55]] }, // Garchomp, Magnezone
      { name: 'Veteran Lamar', team: [[448, 56], [452, 56]] },
      { name: 'Ace Trainer Maya', team: [[468, 56], [465, 56]] }, // Togekiss, Tangrowth
    ],
    gyms: [
      { name: 'Elite Four Aaron', role: 'elite', specialty: 'bug', team: [[452, 53], [416, 54], [469, 55]] }, // Drapion, Vespiquen, Yanmega
      { name: 'Elite Four Bertha', role: 'elite', specialty: 'ground', team: [[450, 55], [473, 55], [464, 57]] }, // Hippowdon, Mamoswine, Rhyperior
      { name: 'Elite Four Flint', role: 'elite', specialty: 'fire', team: [[229, 57], [78, 57], [467, 59]] }, // Houndoom, Rapidash, Magmortar
      { name: 'Elite Four Lucian', role: 'elite', specialty: 'psychic', team: [[437, 57], [122, 58], [475, 60]] }, // Bronzong, Mr. Mime, Gallade
      { name: 'Champion Cynthia', role: 'champion', specialty: 'dragon', team: [[442, 58], [468, 60], [445, 62]] }, // Spiritomb, Togekiss, Garchomp
    ],
  }),
  area({
    key: 'si-fight-area',
    name: 'The Fight Area & Routes 225–226',
    orderIndex: 424,
    banner: { scene: 'volcano' },
    roundsToClear: 3,
    minLevel: 55,
    maxLevel: 66,
    weights: W.busy,
    tier: 5,
    // The Magmarizer, from the slopes below Stark Mountain.
    once: [
      ['magmarizer', 8, 1, 1, true],
    ],
    wild: [
      [126, 14, 55, 64], // Magmar
      [125, 14, 55, 64], // Electabuzz
      [324, 12, 55, 64], // Torkoal
      [232, 12, 55, 64], // Donphan
      [219, 12, 55, 64], // Magcargo
      [471, 10, 56, 65], // Glaceon
      [470, 10, 56, 65], // Leafeon
      [464, 10, 57, 66], // Rhyperior
      [430, 10, 56, 65], // Honchkrow
    ],
    trainers: [
      { name: 'Black Belt Hugh', team: [[297, 62], [475, 62]] },
      { name: 'Ace Trainer Elle', team: [[471, 62], [470, 62]] },
      { name: 'Veteran Sterling', team: [[464, 63], [467, 63]] },
    ],
  }),
  area({
    key: 'si-battle-frontier',
    name: 'The Battle Frontier',
    orderIndex: 425,
    banner: { scene: 'sunset' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 76,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    // Every Sinnoh species, so the Pokédex can be finished after the league.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Kelvin', specialty: 'steel', size: 3 },
      { name: 'Ace Trainer Naomi', specialty: 'dragon', size: 3 },
      { name: 'Veteran Sterling', specialty: 'ghost', size: 3 },
    ],
    gyms: [
      // The Tower Tycoon, and the Frontier's own on the way to him.
      { name: 'Thorton', role: 'elite', specialty: 'steel', team: [[462, 68], [437, 68], [476, 69]] }, // Magnezone, Bronzong, Probopass
      { name: 'Argenta', role: 'elite', specialty: 'fighting', team: [[448, 69], [475, 69], [307, 68]] },
      { name: 'Darach', role: 'elite', specialty: 'normal', team: [[468, 69], [428, 69], [463, 70]] }, // Togekiss, Lopunny, Lickilicky
      { name: 'Palmer', role: 'champion', specialty: 'dragon', team: [[445, 72], [472, 70], [464, 70]] }, // Garchomp, Gliscor, Rhyperior
    ],
  }),

  // ---------------------------------------------------------------- secret areas

  area({
    key: 'si-old-chateau',
    name: 'The Old Chateau',
    orderIndex: 451,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 22,
    maxLevel: 32,
    weights: W.lair,
    tier: 3,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'si-eterna-forest' }, { kind: 'maxLevel', level: 25 }],
    // Rotom lives in a television in a room at the back, and is the one Sinnoh legendary met before the first badge.
    bosses: [{ dex: 479, level: 28 }],
    wild: [
      [92, 24, 22, 30], // Gastly
      [93, 18, 24, 32], // Haunter
      [200, 18, 23, 31], // Misdreavus
      [355, 18, 23, 31], // Duskull
      [425, 14, 23, 31], // Drifloon
      [19, 14, 22, 30], // Rattata
    ],
    trainers: [],
  }),
  area({
    key: 'si-lake-depths',
    name: 'The Lakes of Sinnoh',
    orderIndex: 452,
    banner: { scene: 'crystal_cave', flip: true },
    roundsToClear: 1,
    minLevel: 40,
    maxLevel: 50,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The three come at once, the way the Regis do in Hoenn: one visit, one cave each, one chance.
    conditions: [{ kind: 'area', areaId: 'si-the-lakes' }, { kind: 'maxLevel', level: 40 }],
    bosses: [
      { dex: 480, level: 45, teamAvgThreshold: 0 }, // Uxie
      { dex: 481, level: 45, teamAvgThreshold: 0 }, // Mesprit
      { dex: 482, level: 45, teamAvgThreshold: 0 }, // Azelf
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'si-turnback-cave',
    name: 'Turnback Cave',
    orderIndex: 453,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 56,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'si-spear-pillar' }, { kind: 'maxLevel', level: 45 }],
    bosses: [{ dex: 487, level: 50 }], // Giratina
    wild: [
      [42, 20, 45, 54], // Golbat
      [93, 18, 45, 54], // Haunter
      [356, 16, 46, 55], // Dusclops
      [452, 16, 46, 55], // Drapion
      [437, 16, 46, 55], // Bronzong
      [477, 8, 48, 56], // Dusknoir
    ],
    trainers: [],
  }),
  area({
    key: 'si-stark-mountain',
    name: 'Stark Mountain',
    orderIndex: 454,
    banner: { scene: 'volcano', flip: true },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 62,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'si-fight-area' }, { kind: 'maxLevel', level: 50 }],
    bosses: [{ dex: 485, level: 58 }], // Heatran
    wild: [
      [126, 20, 50, 60], // Magmar
      [219, 18, 50, 60], // Magcargo
      [324, 16, 51, 61], // Torkoal
      [75, 16, 50, 60], // Graveler
      [42, 16, 50, 60], // Golbat
      [467, 8, 52, 62], // Magmortar
    ],
    trainers: [
      // Buck goes in ahead of you and comes back out with the story.
      { name: 'Buck', team: [[464, 58], [126, 57]] }, // Rhyperior, Magmar
    ],
  }),
  area({
    key: 'si-snowpoint-temple',
    name: 'Snowpoint Temple',
    orderIndex: 455,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 62,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Its Hoenn prerequisite — the three Regis — does not survive the region split, so the temple simply opens late.
    conditions: [{ kind: 'area', areaId: 'si-snowpoint' }, { kind: 'pokedex', count: 80 }],
    bosses: [{ dex: 486, level: 60 }], // Regigigas
    wild: [
      [460, 20, 50, 60], // Abomasnow
      [461, 16, 51, 61], // Weavile
      [473, 14, 52, 62], // Mamoswine
      [364, 16, 50, 60], // Sealeo
      [215, 18, 50, 60], // Sneasel
      [459, 16, 50, 60], // Snover
    ],
    trainers: [],
  }),
  area({
    key: 'si-fullmoon-island',
    name: 'Fullmoon Island',
    orderIndex: 456,
    banner: { scene: 'beach', flip: true },
    roundsToClear: null,
    minLevel: 50,
    maxLevel: 62,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'si-pokemon-league' }, { kind: 'pokedex', count: 90 }],
    bosses: [{ dex: 488, level: 55, teamAvgThreshold: 0 }], // Cresselia
    wild: [],
    trainers: [],
  }),
  area({
    key: 'si-newmoon-island',
    name: 'Newmoon Island',
    orderIndex: 457,
    banner: { scene: 'haunted', flip: true },
    roundsToClear: null,
    minLevel: 55,
    maxLevel: 66,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Darkrai answers only once Cresselia has been met — the two are one story.
    conditions: [{ kind: 'area', areaId: 'si-fullmoon-island' }, { kind: 'maxLevel', level: 55 }],
    bosses: [{ dex: 491, level: 60, teamAvgThreshold: 0 }], // Darkrai
    wild: [],
    trainers: [],
  }),
  area({
    key: 'si-seabreak-path',
    name: 'The Seabreak Path',
    orderIndex: 458,
    banner: { scene: 'ocean' },
    roundsToClear: null,
    minLevel: 50,
    maxLevel: 62,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'si-battle-frontier' }, { kind: 'pokedex', count: 95 }],
    bosses: [
      { dex: 489, level: 50, teamAvgThreshold: 0 }, // Phione
      { dex: 490, level: 55, teamAvgThreshold: 0 }, // Manaphy
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'si-flower-paradise',
    name: 'Flower Paradise',
    orderIndex: 459,
    banner: { scene: 'flowers' },
    roundsToClear: null,
    minLevel: 55,
    maxLevel: 68,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'pokedex', count: 100 }, { kind: 'maxLevel', level: 55 }],
    bosses: [{ dex: 492, level: 60, teamAvgThreshold: 0 }], // Shaymin
    wild: [],
    trainers: [],
  }),
  area({
    key: 'si-hall-of-origin',
    name: 'The Hall of Origin',
    orderIndex: 460,
    banner: { scene: 'sky', flip: true },
    roundsToClear: null,
    minLevel: 60,
    maxLevel: 75,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The last thing in Sinnoh, the way Kanto keeps Mew for a nearly-full Pokédex.
    conditions: [{ kind: 'pokedex', count: 105 }, { kind: 'maxLevel', level: 60 }],
    bosses: [{ dex: 493, level: 70, teamAvgThreshold: 0 }], // Arceus
    wild: [],
    trainers: [],
  }),
]
