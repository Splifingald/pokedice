// Unova, in order of discovery, routed on Black and White. Same shape as Sinnoh's content-sinnoh.ts.
//
// Black and White's story uses only Gen 5 Pokémon, so every wild pool here is Gen 5 and the region's Pokédex is exactly
// its dex range (version exclusives merged: Gothita and Solosis, Cottonee and Petilil, Rufflet and Vullaby side by
// side). Gym leaders and the Elite Four use their real top Pokémon. Legendaries are never in a wild pool — each is an
// area boss. The fossil lines (Tirtouga and Archen) are never wild either: the Cover and Plume Fossil in Relic Castle
// are their only source.
//
// Striaton's gym is its three brothers fought back to back (the user's choice), each with his own monkey; only the
// last one hands over the Trio Badge, so the three count as one gym everywhere a badge is counted.
import { area, DECK as W, type AreaPlan } from './content'

/** Unova's starters: Snivy, Tepig, Oshawott. */
export const UNOVA_STARTERS = [495, 498, 501]

/** Unova areas sit at 501+, after Sinnoh's 401+. */
export const UNOVA_AREAS: AreaPlan[] = [
  area({
    key: 'un-route-1',
    name: 'Route 1 & Nuvema Town',
    orderIndex: 501,
    banner: { scene: 'plains' },
    roundsToClear: 2,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    easyMode: true,
    tier: 1,
    wild: [
      [504, 50, 2, 5], // Patrat
      [506, 50, 2, 5], // Lillipup
    ],
    trainers: [],
  }),
  area({
    key: 'un-route-2',
    name: 'Route 2 & Accumula Town',
    orderIndex: 502,
    banner: { scene: 'plains', flip: true },
    roundsToClear: 2,
    minLevel: 3,
    maxLevel: 8,
    weights: W.light,
    easyMode: true,
    tier: 1,
    wild: [
      [504, 30, 3, 7], // Patrat
      [506, 30, 3, 7], // Lillipup
      [509, 30, 3, 7], // Purrloin
    ],
    trainers: [
      { name: 'Youngster Jimmy', team: [[504, 6], [506, 6]] },
      { name: 'Lass Tilly', team: [[509, 7]] },
      { name: 'Cheren', team: [[506, 8], [509, 8]] },
      { name: 'Bianca', team: [[504, 7], [506, 8]] },
    ],
  }),
  area({
    key: 'un-striaton',
    name: 'Striaton City & the Dreamyard',
    orderIndex: 503,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 7,
    maxLevel: 13,
    weights: W.mixed,
    tier: 1,
    // The Dreamyard is where the monkeys live, so the player can answer any of the three brothers in kind.
    wild: [
      [517, 18, 8, 12], // Munna
      [509, 16, 7, 11], // Purrloin
      [504, 16, 7, 11], // Patrat
      [511, 12, 8, 12], // Pansage
      [513, 12, 8, 12], // Pansear
      [515, 12, 8, 12], // Panpour
      [506, 14, 7, 11], // Lillipup
    ],
    trainers: [
      { name: 'Waitress Flo', team: [[506, 10], [509, 10]] },
      { name: 'Waiter Bert', team: [[504, 10], [517, 11]] },
      { name: 'Team Plasma Grunt', team: [[509, 11], [504, 11]] },
    ],
    gyms: [
      { name: 'Chili', role: 'leader', specialty: 'fire', team: [[506, 12], [513, 14]] }, // Lillipup, Pansear
      { name: 'Cress', role: 'leader', specialty: 'water', team: [[506, 12], [515, 14]] }, // Lillipup, Panpour
      { name: 'Cilan', role: 'leader', badge: 'Trio Badge', specialty: 'grass', team: [[506, 12], [511, 14]] }, // Lillipup, Pansage
    ],
  }),
  area({
    key: 'un-route-3',
    name: 'Route 3 & Wellspring Cave',
    orderIndex: 504,
    banner: { scene: 'plains' },
    roundsToClear: 1,
    minLevel: 10,
    maxLevel: 16,
    weights: W.mixed,
    tier: 2,
    wild: [
      [519, 18, 10, 15], // Pidove
      [522, 16, 11, 16], // Blitzle
      [509, 12, 10, 15], // Purrloin
      [506, 12, 10, 15], // Lillipup
      [527, 14, 11, 16], // Woobat
      [524, 14, 11, 16], // Roggenrola
      [535, 12, 11, 16], // Tympole
      [531, 6, 12, 16], // Audino
    ],
    trainers: [
      { name: 'Preschooler Doyle', team: [[519, 12]] },
      { name: 'Twins Kumi & Amy', team: [[504, 13], [509, 13]] },
      { name: 'Pokémon Breeder Galen', team: [[506, 14], [522, 14]] },
      { name: 'Team Plasma Grunt', team: [[509, 14], [504, 15]] },
      { name: 'Cheren', team: [[507, 16], [509, 15]] }, // Herdier, Purrloin
    ],
  }),
  area({
    key: 'un-nacrene',
    name: 'Nacrene City & Pinwheel Forest',
    orderIndex: 505,
    banner: { scene: 'forest' },
    roundsToClear: 1,
    minLevel: 13,
    maxLevel: 20,
    weights: W.mixed,
    tier: 2,
    wild: [
      [540, 16, 14, 19], // Sewaddle
      [543, 16, 14, 19], // Venipede
      [532, 12, 15, 20], // Timburr
      [535, 10, 14, 19], // Tympole
      [546, 10, 14, 19], // Cottonee
      [548, 10, 14, 19], // Petilil
      [538, 8, 15, 20], // Throh
      [539, 8, 15, 20], // Sawk
      [519, 10, 13, 18], // Pidove
    ],
    trainers: [
      { name: 'Pokémon Ranger Forrest', team: [[540, 16], [543, 16]] },
      { name: 'Hiker Hardy', team: [[524, 17], [532, 17]] },
      { name: 'Team Plasma Grunt', team: [[509, 17], [543, 17]] },
      { name: 'Bianca', team: [[517, 17], [506, 18]] }, // Munna, Lillipup
    ],
    gyms: [
      { name: 'Lenora', role: 'leader', badge: 'Basic Badge', specialty: 'normal', team: [[507, 18], [505, 20]] }, // Herdier, Watchog
    ],
  }),
  area({
    key: 'un-castelia',
    name: 'Skyarrow Bridge & Castelia City',
    orderIndex: 506,
    banner: { scene: 'bridge' },
    roundsToClear: 1,
    minLevel: 17,
    maxLevel: 24,
    weights: W.busy,
    tier: 2,
    wild: [
      [541, 16, 19, 23], // Swadloon
      [544, 16, 19, 23], // Whirlipede
      [520, 14, 18, 23], // Tranquill
      [546, 10, 18, 22], // Cottonee
      [548, 10, 18, 22], // Petilil
      [532, 10, 18, 22], // Timburr
      [531, 8, 18, 23], // Audino
    ],
    trainers: [
      { name: 'School Kid Marsha', team: [[540, 20], [546, 20]] },
      { name: 'Clerk Clarence', team: [[505, 21], [520, 21]] },
      { name: 'Harlequin Jack', team: [[509, 21], [548, 21]] },
      { name: 'Team Plasma Grunt', team: [[510, 22], [544, 22]] },
    ],
    gyms: [
      { name: 'Burgh', role: 'leader', badge: 'Insect Badge', specialty: 'bug', team: [[544, 21], [557, 21], [542, 23]] }, // Whirlipede, Dwebble, Leavanny
    ],
  }),
  area({
    key: 'un-desert-resort',
    name: 'Route 4, the Desert Resort & Relic Castle',
    orderIndex: 507,
    banner: { scene: 'dunes' },
    roundsToClear: 1,
    minLevel: 19,
    maxLevel: 27,
    weights: W.mixed,
    tier: 3,
    // The two fossils of Relic Castle, each found once: the only Tirtouga and Archen in the game.
    once: [
      ['cover-fossil', 6, 1, 1, true],
      ['plume-fossil', 6, 1, 1, true],
      // The Sun Stone, for Cottonee and Petilil, out of the desert sand.
      ['sun-stone', 8, 1, 1, true],
    ],
    wild: [
      [551, 18, 19, 25], // Sandile
      [554, 14, 20, 26], // Darumaka
      [559, 14, 20, 26], // Scraggy
      [557, 12, 20, 26], // Dwebble
      [556, 10, 21, 27], // Maractus
      [561, 8, 22, 27], // Sigilyph
      [562, 12, 21, 27], // Yamask
    ],
    trainers: [
      { name: 'Backpacker Kiyo', team: [[551, 23], [557, 23]] },
      { name: 'Psychic Tully', team: [[517, 23], [562, 24]] },
      { name: 'Team Plasma Grunt', team: [[551, 24], [510, 24]] },
      { name: 'Cheren', team: [[507, 24], [510, 25]] }, // Herdier, Liepard
    ],
  }),
  area({
    key: 'un-nimbasa',
    name: 'Nimbasa City & Route 5',
    orderIndex: 508,
    banner: { scene: 'city', flip: true },
    roundsToClear: 1,
    minLevel: 22,
    maxLevel: 29,
    // Nimbasa's amusement park stands in for a Game Corner.
    weights: W.casino,
    tier: 3,
    // The Shiny Stone, for Minccino.
    once: [['shiny-stone', 8, 1, 1, true]],
    wild: [
      [572, 16, 22, 27], // Minccino
      [510, 14, 23, 28], // Liepard
      [574, 12, 22, 27], // Gothita
      [577, 12, 22, 27], // Solosis
      [568, 12, 22, 27], // Trubbish
      [507, 12, 23, 28], // Herdier
      [520, 10, 23, 28], // Tranquill
      [531, 6, 23, 28], // Audino
    ],
    trainers: [
      { name: 'Artist Horton', team: [[572, 25], [510, 25]] },
      { name: 'Backers Ami & Eli', team: [[568, 25], [574, 25]] },
      { name: 'Dancer Edwardo', team: [[577, 26], [520, 26]] },
      // N, on the Ferris wheel: the team he caught on the way here.
      { name: 'N', team: [[551, 26], [554, 26], [559, 26]] },
    ],
    gyms: [
      { name: 'Elesa', role: 'leader', badge: 'Bolt Badge', specialty: 'electric', team: [[587, 25], [587, 25], [523, 27]] }, // Emolga ×2, Zebstrika
    ],
  }),
  area({
    key: 'un-driftveil',
    name: 'Driftveil City & Route 6',
    orderIndex: 509,
    banner: { scene: 'bridge', flip: true },
    roundsToClear: 1,
    minLevel: 25,
    maxLevel: 32,
    weights: W.mixed,
    tier: 3,
    wild: [
      [585, 16, 25, 30], // Deerling
      [590, 14, 26, 31], // Foongus
      [588, 12, 26, 31], // Karrablast
      [616, 12, 26, 31], // Shelmet
      [580, 12, 25, 30], // Ducklett
      [536, 12, 26, 31], // Palpitoad
      [525, 10, 26, 31], // Boldore
      [610, 6, 26, 30], // Axew
    ],
    trainers: [
      { name: 'Pokémon Ranger Shanti', team: [[585, 28], [590, 28]] },
      { name: 'Worker Jeremy', team: [[525, 28], [532, 29]] },
      { name: 'Fisherman Andrew', team: [[580, 28], [536, 29]] },
      { name: 'Team Plasma Grunt', team: [[510, 29], [568, 29]] },
      { name: 'Bianca', team: [[518, 29], [507, 29]] }, // Musharna, Herdier
    ],
    gyms: [
      { name: 'Clay', role: 'leader', badge: 'Quake Badge', specialty: 'ground', team: [[552, 29], [536, 29], [530, 31]] }, // Krokorok, Palpitoad, Excadrill
    ],
  }),
  area({
    key: 'un-chargestone',
    name: 'Chargestone Cave',
    orderIndex: 510,
    banner: { scene: 'crystal_cave' },
    roundsToClear: 1,
    minLevel: 27,
    maxLevel: 34,
    weights: W.mixed,
    tier: 3,
    wild: [
      [595, 18, 27, 32], // Joltik
      [597, 16, 27, 32], // Ferroseed
      [599, 16, 27, 32], // Klink
      [602, 10, 27, 32], // Tynamo
      [525, 14, 28, 33], // Boldore
      [529, 12, 28, 33], // Drilbur
    ],
    trainers: [
      { name: 'Scientist Ronald', team: [[599, 30], [597, 30]] },
      { name: 'Team Plasma Grunt', team: [[510, 31], [595, 31]] },
      // N again, before the cave's exit: its own Pokémon, befriended on the way through.
      { name: 'N', team: [[525, 32], [599, 32], [595, 32]] },
    ],
  }),
  area({
    key: 'un-mistralton',
    name: 'Mistralton City & Route 7',
    orderIndex: 511,
    banner: { scene: 'sky' },
    roundsToClear: 1,
    minLevel: 29,
    maxLevel: 36,
    weights: W.busy,
    tier: 4,
    wild: [
      [587, 12, 30, 35], // Emolga
      [523, 14, 30, 35], // Zebstrika
      [585, 14, 29, 34], // Deerling
      [505, 12, 29, 34], // Watchog
      [520, 14, 30, 35], // Tranquill
      [590, 12, 30, 35], // Foongus
      [527, 12, 29, 34], // Woobat
    ],
    trainers: [
      { name: 'Pilot Ted', team: [[520, 33], [580, 33]] },
      { name: 'Pokéfan Jojo', team: [[587, 33], [572, 33]] },
      { name: 'Ace Trainer Webster', team: [[523, 34], [585, 34]] },
      { name: 'Cheren', team: [[508, 34], [510, 34]] }, // Stoutland, Liepard
    ],
    gyms: [
      { name: 'Skyla', role: 'leader', badge: 'Jet Badge', specialty: 'flying', team: [[528, 33], [521, 33], [581, 35]] }, // Swoobat, Unfezant, Swanna
    ],
  }),
  area({
    key: 'un-celestial-tower',
    name: 'Celestial Tower',
    orderIndex: 512,
    banner: { scene: 'haunted' },
    roundsToClear: 1,
    minLevel: 30,
    maxLevel: 37,
    weights: W.mixed,
    tier: 4,
    // The Dusk Stone, at the top of the tower where the Litwick are.
    once: [['dusk-stone', 8, 1, 1, true]],
    wild: [
      [607, 26, 30, 35], // Litwick
      [605, 22, 31, 36], // Elgyem
      [562, 16, 31, 36], // Yamask
      [527, 12, 30, 35], // Woobat
    ],
    trainers: [
      { name: 'Psychic Bryce', team: [[605, 34], [575, 34]] }, // Elgyem, Gothorita
      { name: 'Nurse Dixie', team: [[531, 35], [546, 35]] },
      { name: 'Lady Sarah', team: [[607, 34], [578, 35]] }, // Litwick, Duosion
    ],
  }),
  area({
    key: 'un-twist-mountain',
    name: 'Twist Mountain',
    orderIndex: 513,
    banner: { scene: 'mountains' },
    roundsToClear: 1,
    minLevel: 32,
    maxLevel: 39,
    weights: W.mixed,
    tier: 4,
    wild: [
      [525, 18, 33, 38], // Boldore
      [533, 16, 33, 38], // Gurdurr
      [613, 16, 32, 37], // Cubchoo
      [615, 10, 33, 38], // Cryogonal
      [527, 12, 32, 37], // Woobat
      [528, 10, 34, 39], // Swoobat
    ],
    trainers: [
      { name: 'Worker Dick', team: [[533, 36], [525, 36]] },
      { name: 'Hiker Grant', team: [[525, 36], [529, 37]] },
      { name: 'Backpacker Blossom', team: [[613, 36], [528, 37]] },
    ],
  }),
  area({
    key: 'un-icirrus',
    name: 'Icirrus City & the Moor of Icirrus',
    orderIndex: 514,
    banner: { scene: 'swamp' },
    roundsToClear: 1,
    minLevel: 34,
    maxLevel: 41,
    weights: W.busy,
    tier: 4,
    wild: [
      [618, 14, 35, 40], // Stunfisk
      [537, 10, 37, 41], // Seismitoad
      [536, 14, 34, 39], // Palpitoad
      [591, 12, 35, 40], // Amoonguss
      [588, 10, 34, 39], // Karrablast
      [616, 10, 34, 39], // Shelmet
      [586, 10, 36, 41], // Sawsbuck
      [582, 12, 34, 39], // Vanillite
    ],
    trainers: [
      { name: 'Fisherman Eustace', team: [[536, 37], [618, 37]] },
      { name: 'Parasol Lady Tyra', team: [[586, 38], [581, 38]] },
      { name: 'Team Plasma Grunt', team: [[510, 38], [591, 38]] },
    ],
    gyms: [
      { name: 'Brycen', role: 'leader', badge: 'Freeze Badge', specialty: 'ice', team: [[583, 37], [615, 37], [614, 39]] }, // Vanillish, Cryogonal, Beartic
    ],
  }),
  area({
    key: 'un-dragonspiral',
    name: 'Dragonspiral Tower',
    orderIndex: 515,
    banner: { scene: 'snow_mountains' },
    roundsToClear: 1,
    minLevel: 37,
    maxLevel: 44,
    weights: W.mixed,
    tier: 5,
    // Team Plasma's stand at the tower is its biggest: the region's one Master Ball is in the rubble after it.
    once: [['master-ball', 2, 1, 1, true]],
    wild: [
      [621, 14, 38, 43], // Druddigon
      [622, 16, 37, 42], // Golett
      [619, 16, 37, 42], // Mienfoo
      [586, 12, 38, 43], // Sawsbuck
      [521, 10, 39, 44], // Unfezant
      [614, 10, 38, 43], // Beartic
    ],
    trainers: [
      { name: 'Team Plasma Grunt', team: [[510, 41], [591, 41]] },
      { name: 'Team Plasma Grunt', team: [[569, 41], [552, 42]] }, // Garbodor, Krokorok
      { name: 'Zinzolin', team: [[614, 43], [615, 43]] }, // Beartic, Cryogonal
    ],
  }),
  area({
    key: 'un-opelucid',
    name: 'Route 9 & Opelucid City',
    orderIndex: 516,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 39,
    maxLevel: 46,
    weights: W.busy,
    tier: 5,
    wild: [
      [569, 14, 40, 45], // Garbodor
      [575, 12, 40, 45], // Gothorita
      [578, 12, 40, 45], // Duosion
      [626, 12, 41, 46], // Bouffalant
      [624, 12, 39, 44], // Pawniard
      [510, 12, 39, 44], // Liepard
      [573, 10, 40, 45], // Cinccino
      [611, 8, 41, 46], // Fraxure
    ],
    trainers: [
      { name: 'Gentleman Manuel', team: [[573, 43], [626, 43]] },
      { name: 'Socialite Emilia', team: [[576, 43], [579, 43]] }, // Gothitelle, Reuniclus
      { name: 'Biker Jeremiah', team: [[569, 44], [560, 44]] }, // Garbodor, Scrafty
      { name: 'Bianca', team: [[518, 44], [508, 44]] },
    ],
    gyms: [
      { name: 'Drayden', role: 'leader', badge: 'Legend Badge', specialty: 'dragon', team: [[611, 41], [621, 41], [612, 43]] }, // Fraxure, Druddigon, Haxorus
    ],
  }),
  area({
    key: 'un-victory-road',
    name: 'Route 10 & Victory Road',
    orderIndex: 517,
    banner: { scene: 'cave_dark' },
    roundsToClear: 1,
    minLevel: 42,
    maxLevel: 50,
    weights: W.mixed,
    tier: 5,
    wild: [
      [626, 12, 42, 48], // Bouffalant
      [627, 10, 42, 48], // Rufflet
      [629, 10, 42, 48], // Vullaby
      [631, 12, 43, 49], // Heatmor
      [632, 12, 43, 49], // Durant
      [633, 6, 43, 48], // Deino
      [620, 10, 45, 50], // Mienshao
      [530, 10, 44, 50], // Excadrill
      [525, 12, 42, 48], // Boldore
      [538, 8, 43, 49], // Throh
      [539, 8, 43, 49], // Sawk
    ],
    trainers: [
      { name: 'Ace Trainer Ethan', team: [[508, 47], [591, 47]] },
      { name: 'Ace Trainer Carol', team: [[586, 47], [579, 47]] },
      { name: 'Battle Girl Nicola', team: [[620, 47], [534, 47]] },
      { name: 'Cheren', team: [[508, 48], [510, 48]] }, // Stoutland, Liepard
    ],
  }),
  area({
    key: 'un-pokemon-league',
    name: 'The Pokémon League',
    orderIndex: 518,
    banner: { scene: 'default' },
    roundsToClear: 1,
    minLevel: 46,
    maxLevel: 56,
    weights: W.trainersOnly,
    tier: 5,
    wild: [],
    trainers: [
      { name: 'Ace Trainer Chandra', team: [[612, 50], [591, 50]] },
      { name: 'Veteran Lance', team: [[534, 51], [589, 51]] }, // Conkeldurr, Escavalier
      { name: 'Team Plasma Grunt', team: [[510, 50], [569, 50]] },
    ],
    // BW's story ends here: the Elite Four, then N's Castle rising out of the ground — N first, Ghetsis last.
    gyms: [
      { name: 'Elite Four Shauntal', role: 'elite', specialty: 'ghost', team: [[563, 48], [623, 48], [609, 50]] }, // Cofagrigus, Golurk, Chandelure
      { name: 'Elite Four Grimsley', role: 'elite', specialty: 'dark', team: [[560, 48], [553, 48], [625, 50]] }, // Scrafty, Krookodile, Bisharp
      { name: 'Elite Four Caitlin', role: 'elite', specialty: 'psychic', team: [[579, 48], [561, 48], [576, 50]] }, // Reuniclus, Sigilyph, Gothitelle
      { name: 'Elite Four Marshal', role: 'elite', specialty: 'fighting', team: [[538, 48], [539, 48], [534, 50]] }, // Throh, Sawk, Conkeldurr
      { name: 'N', role: 'elite', specialty: 'dragon', team: [[571, 50], [601, 50], [565, 51]] }, // Zoroark, Klinklang, Carracosta
      { name: 'Ghetsis', role: 'champion', specialty: 'dark', team: [[625, 52], [537, 52], [635, 54]] }, // Bisharp, Seismitoad, Hydreigon
    ],
  }),
  area({
    key: 'un-undella',
    name: 'Routes 11–14 & Undella Town',
    orderIndex: 519,
    banner: { scene: 'beach' },
    roundsToClear: 1,
    minLevel: 52,
    maxLevel: 64,
    weights: W.busy,
    tier: 5,
    wild: [
      [592, 14, 52, 60], // Frillish
      [594, 10, 53, 61], // Alomomola
      [550, 12, 52, 60], // Basculin
      [581, 12, 53, 61], // Swanna
      [628, 10, 55, 63], // Braviary
      [630, 10, 55, 63], // Mandibuzz
      [634, 8, 54, 62], // Zweilous
      [620, 10, 54, 62], // Mienshao
      [621, 10, 54, 62], // Druddigon
      [637, 4, 57, 64], // Volcarona
    ],
    trainers: [
      { name: 'Ace Trainer Jacob', team: [[628, 58], [612, 58]] },
      { name: 'Veteran Chaz', team: [[635, 59], [623, 59]] },
      { name: 'Socialite Grier', team: [[593, 58], [584, 58]] }, // Jellicent, Vanilluxe
    ],
    gyms: [
      // Alder, the Champion the story never let the player fight, waits at the end of the post-league coast.
      { name: 'Champion Alder', role: 'champion', specialty: 'bug', team: [[589, 62], [621, 62], [637, 64]] }, // Escavalier, Druddigon, Volcarona
    ],
  }),
  area({
    key: 'un-black-city',
    name: 'Black City & White Forest',
    orderIndex: 520,
    banner: { scene: 'sunset' },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 76,
    weights: W.endgame,
    tier: 5,
    scalesToTeam: true,
    // Every Unova species, so the Pokédex can be finished after the league: Black's city and White's forest, merged
    // the way every version exclusive is.
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Kelvin', specialty: 'dragon', size: 3 },
      { name: 'Veteran Naomi', specialty: 'steel', size: 3 },
      { name: 'Pokémon Ranger Brent', specialty: 'grass', size: 3 },
    ],
  }),

  // ---------------------------------------------------------------- secret areas

  area({
    key: 'un-liberty-garden',
    name: 'Liberty Garden',
    orderIndex: 551,
    banner: { scene: 'flowers' },
    roundsToClear: 1,
    minLevel: 25,
    maxLevel: 33,
    weights: W.shrine,
    tier: 3,
    hidden: true,
    // Victini, under the lighthouse off Castelia: the one Unova legendary met on the way through the story.
    conditions: [{ kind: 'area', areaId: 'un-castelia' }, { kind: 'maxLevel', level: 25 }],
    bosses: [{ dex: 494, level: 30, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'un-castelia-cafe',
    name: 'The Castelia Café',
    orderIndex: 552,
    banner: { scene: 'city' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 55,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Meloetta, who sings in the café once the league is behind the player.
    conditions: [{ kind: 'area', areaId: 'un-pokemon-league' }, { kind: 'maxLevel', level: 45 }],
    bosses: [{ dex: 648, level: 50, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'un-dragonspiral-summit',
    name: "Dragonspiral Tower's Summit",
    orderIndex: 553,
    banner: { scene: 'snow_mountains', flip: true },
    roundsToClear: 1,
    minLevel: 48,
    maxLevel: 56,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The tao duo, where the story first shows them. Both, one visit, the way Spear Pillar holds Dialga and Palkia.
    conditions: [{ kind: 'area', areaId: 'un-pokemon-league' }, { kind: 'maxLevel', level: 48 }],
    bosses: [
      { dex: 643, level: 52 }, // Reshiram
      { dex: 644, level: 52 }, // Zekrom
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'un-swords-of-justice',
    name: 'The Swords of Justice',
    orderIndex: 554,
    banner: { scene: 'cave' },
    roundsToClear: 1,
    minLevel: 45,
    maxLevel: 54,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Mistralton Cave, Pinwheel Forest's Rumination Field and Victory Road's Trial Chamber, walked in one trip.
    conditions: [{ kind: 'area', areaId: 'un-pokemon-league' }, { kind: 'maxLevel', level: 45 }],
    bosses: [
      { dex: 638, level: 50, teamAvgThreshold: 0 }, // Cobalion
      { dex: 640, level: 50, teamAvgThreshold: 0 }, // Virizion
      { dex: 639, level: 50, teamAvgThreshold: 0 }, // Terrakion
    ],
    wild: [
      [526, 18, 45, 53], // Gigalith
      [534, 14, 46, 54], // Conkeldurr
      [612, 8, 47, 54], // Haxorus
      [542, 16, 45, 53], // Leavanny
      [545, 16, 45, 53], // Scolipede
      [530, 14, 46, 54], // Excadrill
    ],
    trainers: [],
  }),
  area({
    key: 'un-moor-spring',
    name: 'The Moor of Icirrus Spring',
    orderIndex: 555,
    banner: { scene: 'swamp', flip: true },
    roundsToClear: 1,
    minLevel: 50,
    maxLevel: 58,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // Keldeo comes looking for the three who taught it, so it waits for the Swords of Justice.
    conditions: [{ kind: 'area', areaId: 'un-swords-of-justice' }, { kind: 'maxLevel', level: 50 }],
    bosses: [{ dex: 647, level: 55, teamAvgThreshold: 0 }],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'un-abundant-shrine',
    name: 'The Abundant Shrine',
    orderIndex: 556,
    banner: { scene: 'flowers', flip: true },
    roundsToClear: 1,
    minLevel: 52,
    maxLevel: 62,
    weights: W.shrine,
    tier: 5,
    hidden: true,
    // The Forces of Nature: the two storms that roam Unova, and Landorus called down by them.
    conditions: [{ kind: 'area', areaId: 'un-undella' }, { kind: 'maxLevel', level: 52 }],
    bosses: [
      { dex: 641, level: 56, teamAvgThreshold: 0 }, // Tornadus
      { dex: 642, level: 56, teamAvgThreshold: 0 }, // Thundurus
      { dex: 645, level: 60, teamAvgThreshold: 0 }, // Landorus
    ],
    wild: [],
    trainers: [],
  }),
  area({
    key: 'un-p2-laboratory',
    name: 'The P2 Laboratory',
    orderIndex: 557,
    banner: { scene: 'factory' },
    roundsToClear: 1,
    minLevel: 55,
    maxLevel: 64,
    weights: W.lair,
    tier: 5,
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'un-undella' }, { kind: 'maxLevel', level: 55 }],
    bosses: [{ dex: 649, level: 60 }], // Genesect
    wild: [
      [600, 20, 55, 62], // Klang
      [601, 10, 58, 64], // Klinklang
      [603, 16, 55, 62], // Eelektrik
      [598, 16, 56, 63], // Ferrothorn
      [596, 16, 55, 62], // Galvantula
      [632, 14, 56, 63], // Durant
    ],
    trainers: [],
  }),
  area({
    key: 'un-giant-chasm',
    name: 'The Giant Chasm',
    orderIndex: 558,
    banner: { scene: 'cave_dark', flip: true },
    roundsToClear: 1,
    minLevel: 60,
    maxLevel: 70,
    weights: W.lair,
    tier: 5,
    hidden: true,
    // Kyurem, the last thing in Unova: the third of the tao dragons, waiting in the ice at the bottom of the crater.
    conditions: [{ kind: 'area', areaId: 'un-dragonspiral-summit' }, { kind: 'maxLevel', level: 60 }],
    bosses: [{ dex: 646, level: 70 }],
    wild: [
      [614, 18, 60, 68], // Beartic
      [584, 16, 61, 69], // Vanilluxe
      [615, 14, 60, 68], // Cryogonal
      [623, 14, 61, 69], // Golurk
      [591, 14, 60, 68], // Amoonguss
      [528, 14, 60, 68], // Swoobat
      [635, 4, 64, 70], // Hydreigon
    ],
    trainers: [],
  }),
]
