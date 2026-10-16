/**
 * Haunted Hollow (docs/26): the ghost small world, as content. `haunted()` builds its region, areas, trainers and the
 * world's settings; `pnpm haunted-hollow <in-bundle.json> <out-bundle.json>` adds them to an admin export (replacing an
 * earlier copy of them) for `pnpm import-bundle`, and `pnpm haunted-hollow --sql <out.sql>` writes the same as a migration
 * (supabase/migrations/0052_haunted_hollow.sql). Ids are stable (`stableUuid`), so a re-run updates in place. Later
 * changes reach a live database as patches of their own (0055: scripts/patch-hh-new-species.ts), as 0052 has run there.
 *
 * The rules it keeps (the user's, 2026-10-13): 10 areas easy to hard, the first a simple road; each deck 10 cards with
 * one item and one Pokémon Center; the Shadow Elite's five fights; five short secret areas, each with its boss or raid;
 * 124 Pokémon to catch; no Normal or Fighting type anywhere (but Riolu and Lucario, the user's call of 2026-10-15), no
 * item-evolving filler, no Dark type before area 5.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Area,
  BossDef,
  BundleRaw,
  EncounterKind,
  LootEntry,
  Region,
  SmallWorld,
  Trainer,
  TrickGhost,
  TrickOrTreatConfig,
  TrickTier,
  WildPoolEntry,
} from '../src/engine/types'
import { DEFAULT_PORTAL_RUN } from '../src/engine/portalMode'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import { stableUuid, upsert } from './seed'

export const REGION_ID = 'world-haunted-hollow'
export const WORLD_ID = 'haunted-hollow-2026'
const ORDER0 = 9100

const id = (...parts: (string | number)[]) => stableUuid(['haunted-hollow', ...parts].join(':'))

type Mon = [dex: number, level: number]
interface TrainerSpec {
  name: string
  sprite: string
  team: Mon[]
  role?: Trainer['role']
  items?: string[]
}
interface AreaSpec {
  key: string
  name: string
  /** Its picture (public/area-art), for src/fx/areaArtMap.ts. */
  art: string
  banner: string
  min: number
  max: number
  rounds: number | null
  deck: Partial<Record<EncounterKind, number>>
  upgrade: number
  wild: [dex: number, weight: number, min: number, max: number][]
  trainers: TrainerSpec[]
  loot: [key: string, weight: number, min: number, max: number, unique?: boolean][]
  hidden?: boolean
  unlock?: Area['unlockConditions']
  boss?: BossDef[]
  gyms?: TrainerSpec[]
  background?: Area['battleBackground']
  mode?: Area['mode']
}

const balls = (lo: [number, number], hi?: [number, number]): AreaSpec['loot'] => [
  ['poke-ball', 3, ...lo],
  ...(hi ? ([['great-ball', 2, ...hi]] as AreaSpec['loot']) : []),
]

/** The world's areas, in order: its chain, its league, then its secret areas. */
export const AREAS: AreaSpec[] = [
  {
    key: 'dusk-road',
    name: 'Dusk Road',
    art: 'evening',
    banner: '/banners/sunset.png',
    min: 3,
    max: 7,
    rounds: 1,
    deck: { wild: 7, trainer: 1 },
    upgrade: 1,
    wild: [
      [10, 30, 3, 5],
      [13, 30, 3, 5],
      [187, 20, 4, 6],
      [11, 6, 5, 7],
      [14, 6, 5, 7],
      [425, 6, 4, 6],
      [92, 5, 4, 6],
    ],
    trainers: [
      {
        name: 'Bug Catcher Toby',
        sprite: 'bug-catcher',
        team: [
          [10, 5],
          [13, 5],
        ],
      },
      { name: 'Youngster Wes', sprite: 'youngster', team: [[187, 6]] },
      {
        name: 'Lass Ivy',
        sprite: 'lass',
        team: [
          [13, 4],
          [187, 5],
        ],
      },
    ],
    loot: [...balls([2, 3]), ['potion', 3, 1, 2], ['money', 2, 30, 60]],
  },
  {
    key: 'foggy-marsh',
    name: 'Foggy Marsh',
    art: 'a857',
    banner: '/banners/swamp.png',
    min: 7,
    max: 12,
    rounds: 1,
    deck: { wild: 6, trainer: 2 },
    upgrade: 1,
    wild: [
      [194, 25, 7, 10],
      [88, 20, 7, 10],
      [283, 20, 7, 10],
      [92, 12, 8, 11],
      [622, 8, 8, 11],
      [188, 5, 10, 12],
    ],
    trainers: [
      {
        name: 'Fisherman Moss',
        sprite: 'fisherman',
        team: [
          [194, 10],
          [283, 9],
        ],
      },
      {
        name: 'Channeler Nell',
        sprite: 'channeler',
        team: [
          [92, 10],
          [92, 10],
        ],
      },
      { name: 'Camper Reed', sprite: 'camper', team: [[88, 11]] },
      {
        name: 'Picnicker Fen',
        sprite: 'picnicker',
        team: [
          [187, 10],
          [194, 11],
        ],
      },
    ],
    loot: [...balls([2, 3]), ['potion', 3, 1, 2], ['money', 2, 40, 80]],
  },
  {
    key: 'whispering-woods',
    name: 'Whispering Woods',
    art: 'a852',
    banner: '/banners/forest.png',
    min: 11,
    max: 16,
    rounds: 1,
    deck: { wild: 6, trainer: 2 },
    upgrade: 2,
    wild: [
      [708, 20, 11, 14],
      [710, 20, 11, 14],
      [946, 15, 12, 15],
      [48, 20, 11, 14],
      [167, 20, 11, 14],
      [204, 15, 12, 15],
      [12, 4, 14, 16],
      [15, 4, 14, 16],
      // Added 2026-10-15 (docs/26 §2.8), last so a patched export lists its pool as this does.
      [595, 20, 11, 14],
    ],
    trainers: [
      {
        name: 'Bug Catcher Ash',
        sprite: 'bug-catcher',
        team: [
          [48, 14],
          [167, 14],
        ],
      },
      {
        name: 'Hex Maniac Wren',
        sprite: 'hoenn/hex-maniac',
        team: [
          [708, 15],
          [710, 15],
        ],
      },
      {
        name: 'Aroma Lady Fern',
        sprite: 'aroma-lady',
        team: [
          [204, 15],
          [946, 15],
        ],
      },
    ],
    loot: [...balls([2, 3], [1, 1]), ['potion', 3, 1, 2], ['money', 2, 60, 100]],
  },
  {
    key: 'lantern-town',
    name: 'Lantern Town',
    art: 'oldtown',
    banner: '/banners/city.png',
    min: 15,
    max: 21,
    rounds: 1,
    deck: { wild: 5, trainer: 3 },
    upgrade: 2,
    wild: [
      [607, 25, 15, 18],
      [77, 20, 15, 18],
      [179, 20, 15, 18],
      [325, 20, 15, 18],
      [353, 15, 16, 19],
      [180, 5, 18, 20],
      [200, 4, 17, 20],
    ],
    trainers: [
      {
        name: 'Kindler Blaze',
        sprite: 'hoenn/kindler',
        team: [
          [77, 18],
          [607, 18],
        ],
      },
      {
        name: 'Psychic Iris',
        sprite: 'psychic-f',
        team: [
          [325, 18],
          [353, 19],
        ],
      },
      {
        name: 'Channeler Hilda',
        sprite: 'channeler',
        team: [
          [353, 18],
          [607, 19],
          [92, 18],
        ],
      },
      {
        name: 'Gentleman Orson',
        sprite: 'gentleman',
        team: [
          [179, 19],
          [180, 20],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 2]),
      ['super-potion', 3, 1, 1],
      ['money', 2, 80, 140],
      ['dusk-stone', 1, 1, 1, true],
    ],
  },
  {
    key: 'old-quarry',
    name: 'Old Quarry',
    art: 'a652',
    banner: '/banners/cave.png',
    min: 20,
    max: 26,
    rounds: 1,
    deck: { wild: 5, trainer: 3 },
    upgrade: 3,
    wild: [
      [622, 25, 20, 24],
      [74, 25, 20, 24],
      [304, 20, 20, 24],
      [104, 15, 21, 25],
      [261, 15, 21, 25],
      [75, 5, 24, 26],
      [305, 3, 25, 26],
      // Added 2026-10-15 (docs/26 §2.8): Fighting, the one exception to the filler rule.
      [447, 15, 21, 25],
    ],
    trainers: [
      {
        name: 'Hiker Rocco',
        sprite: 'hiker',
        team: [
          [74, 23],
          [622, 24],
        ],
      },
      {
        name: 'Ruin Maniac Pell',
        sprite: 'ruin-maniac',
        team: [
          [104, 24],
          [304, 24],
        ],
      },
      {
        name: 'Worker Gus',
        sprite: 'galar/worker-m',
        team: [
          [74, 24],
          [304, 25],
          [622, 24],
        ],
      },
      {
        name: 'Punk Guy Vex',
        sprite: 'alola/punk-guy',
        team: [
          [261, 25],
          [104, 25],
        ],
      },
    ],
    loot: [...balls([2, 3], [1, 2]), ['super-potion', 3, 1, 2], ['money', 2, 100, 180]],
  },
  {
    key: 'frozen-lake',
    name: 'Frozen Lake',
    art: 'snow',
    banner: '/banners/snow_mountains.png',
    min: 25,
    max: 32,
    rounds: 1,
    deck: { wild: 5, trainer: 3 },
    upgrade: 3,
    wild: [
      [361, 25, 25, 29],
      [220, 25, 25, 29],
      [363, 25, 25, 29],
      [238, 15, 25, 28],
      [124, 5, 29, 31],
    ],
    trainers: [
      {
        name: 'Skier Holly',
        sprite: 'sinnoh/skier-f',
        team: [
          [361, 29],
          [220, 29],
        ],
      },
      {
        name: 'Ace Trainer Neve',
        sprite: 'alola/ace-trainer-f',
        team: [
          [363, 29],
          [238, 29],
          [361, 30],
        ],
      },
      {
        name: 'Psychic Ilse',
        sprite: 'psychic-f',
        team: [
          [124, 30],
          [238, 28],
        ],
      },
      {
        name: 'Hex Maniac Rime',
        sprite: 'hoenn/hex-maniac',
        team: [
          [361, 30],
          [93, 30],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 2]),
      ['super-potion', 3, 1, 2],
      ['money', 2, 120, 220],
      ['dawn-stone', 1, 1, 1, true],
    ],
  },
  {
    key: 'sunken-shore',
    name: 'Sunken Shore',
    art: 'beach',
    banner: '/banners/beach.png',
    min: 31,
    max: 38,
    rounds: 1,
    deck: { wild: 4, trainer: 4 },
    upgrade: 4,
    wild: [
      [769, 25, 31, 35],
      [278, 25, 31, 35],
      [98, 20, 31, 35],
      [170, 20, 31, 35],
      [341, 20, 31, 35],
      [99, 4, 36, 37],
      [342, 4, 36, 37],
    ],
    trainers: [
      {
        name: 'Swimmer Coral',
        sprite: 'swimmer-f',
        team: [
          [170, 34],
          [98, 34],
        ],
      },
      {
        name: 'Fisherman Pike',
        sprite: 'fisherman',
        team: [
          [341, 35],
          [98, 35],
        ],
      },
      {
        name: 'Sailor Brine',
        sprite: 'sailor',
        team: [
          [278, 35],
          [341, 36],
          [98, 35],
        ],
      },
      {
        name: 'Beauty Pearl',
        sprite: 'beauty',
        team: [
          [769, 36],
          [170, 35],
        ],
      },
      {
        name: 'Picnicker Sandy',
        sprite: 'picnicker',
        team: [
          [769, 34],
          [278, 34],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 2]),
      ['hyper-potion', 2, 1, 1],
      ['super-potion', 2, 1, 2],
      ['money', 2, 150, 260],
    ],
  },
  {
    key: 'rusted-armory',
    name: 'Rusted Armory',
    art: 'industrial',
    banner: '/banners/factory.png',
    min: 37,
    max: 44,
    rounds: 1,
    deck: { wild: 4, trainer: 4 },
    upgrade: 5,
    wild: [
      [679, 25, 37, 41],
      [100, 25, 37, 41],
      [109, 25, 37, 41],
      [374, 15, 37, 41],
      [227, 10, 39, 42],
      [680, 4, 41, 43],
      [375, 3, 42, 43],
      // Added 2026-10-15 (docs/26 §2.8).
      [596, 4, 41, 43],
    ],
    trainers: [
      {
        name: 'Scientist Volt',
        sprite: 'scientist',
        team: [
          [100, 41],
          [109, 41],
          [101, 42],
        ],
      },
      {
        name: 'Engineer Rust',
        sprite: 'engineer',
        team: [
          [227, 41],
          [679, 41],
        ],
      },
      {
        name: 'Ninja Boy Kage',
        sprite: 'hoenn/ninja-boy',
        team: [
          [679, 41],
          [680, 42],
        ],
      },
      {
        name: 'Super Nerd Ohm',
        sprite: 'super-nerd',
        team: [
          [374, 41],
          [100, 41],
          [110, 42],
        ],
      },
      {
        name: 'Punk Girl Smog',
        sprite: 'alola/punk-girl',
        team: [
          [109, 42],
          [110, 42],
        ],
      },
    ],
    loot: [
      ...balls([1, 2], [2, 3]),
      ['hyper-potion', 2, 1, 1],
      ['money', 2, 180, 300],
      ['link-cable', 1, 1, 1, true],
    ],
  },
  {
    key: 'windy-cliffs',
    name: 'Windy Cliffs',
    art: 'mountain',
    banner: '/banners/mountains.png',
    min: 42,
    max: 50,
    rounds: 1,
    deck: { wild: 4, trainer: 4 },
    upgrade: 4,
    wild: [
      [425, 25, 42, 46],
      [41, 20, 42, 46],
      [322, 20, 42, 46],
      [371, 15, 42, 46],
      [42, 15, 44, 48],
      [426, 6, 46, 49],
      [947, 6, 44, 48],
      [372, 3, 47, 49],
    ],
    trainers: [
      {
        name: 'Bird Keeper Gale',
        sprite: 'bird-keeper',
        team: [
          [426, 47],
          [42, 47],
        ],
      },
      {
        name: 'Hiker Crag',
        sprite: 'hiker',
        team: [
          [322, 46],
          [323, 47],
        ],
      },
      {
        name: 'Dragon Tamer Ryu',
        sprite: 'hoenn/dragon-tamer',
        team: [
          [371, 46],
          [372, 48],
        ],
      },
      {
        name: 'Backpacker Sky',
        sprite: 'unova/backpacker-m',
        team: [
          [425, 46],
          [42, 46],
          [322, 46],
        ],
      },
      {
        name: 'Ace Trainer Kite',
        sprite: 'alola/ace-trainer-m',
        team: [
          [426, 48],
          [372, 48],
          [323, 47],
        ],
      },
    ],
    loot: [
      ['great-ball', 3, 2, 3],
      ['ultra-ball', 2, 1, 1],
      ['hyper-potion', 2, 1, 1],
      ['revive', 1, 1, 1],
      ['money', 2, 220, 360],
      ['rare-candy', 1, 1, 1, true],
    ],
  },
  {
    key: 'spirit-mountain',
    name: 'Spirit Mountain',
    art: 'lair-summit',
    banner: '/banners/haunted.png',
    min: 48,
    max: 56,
    rounds: 1,
    deck: { wild: 3, trainer: 5 },
    upgrade: 5,
    wild: [
      [355, 25, 48, 52],
      [200, 20, 48, 52],
      [228, 20, 48, 52],
      [360, 15, 48, 51],
      [354, 10, 50, 53],
      [359, 8, 50, 53],
      [202, 6, 51, 54],
      [356, 6, 51, 54],
      [229, 5, 52, 54],
      // Added 2026-10-15 (docs/26 §2.8): Fighting, the one exception to the filler rule.
      [448, 5, 52, 54],
    ],
    trainers: [
      {
        name: 'Sage Kaito',
        sprite: 'johto/sage',
        team: [
          [202, 52],
          [354, 52],
        ],
      },
      {
        name: 'Channeler Yumi',
        sprite: 'channeler',
        team: [
          [356, 52],
          [200, 51],
          [354, 51],
        ],
      },
      {
        name: 'Hex Maniac Morgana',
        sprite: 'hoenn/hex-maniac',
        team: [
          [429, 53],
          [356, 52],
        ],
      },
      {
        name: 'Psychic Orin',
        sprite: 'psychic-m',
        team: [
          [202, 52],
          [124, 52],
        ],
      },
      {
        name: 'Cooltrainer Raven',
        sprite: 'cooltrainer-f',
        team: [
          [229, 53],
          [359, 53],
          [426, 52],
        ],
      },
      {
        name: 'Punk Guy Ash',
        sprite: 'alola/punk-guy',
        team: [
          [229, 52],
          [262, 52],
        ],
      },
    ],
    loot: [
      ['great-ball', 2, 2, 3],
      ['ultra-ball', 3, 1, 2],
      ['hyper-potion', 2, 1, 2],
      ['revive', 2, 1, 1],
      ['money', 2, 260, 420],
      ['rare-candy', 1, 1, 1],
    ],
  },
  {
    key: 'shadow-elite',
    name: 'Shadow Elite',
    art: 'league',
    banner: '/banners/default.png',
    min: 52,
    max: 60,
    // The five fights only (the user's call): no round to play first.
    rounds: 0,
    deck: {},
    upgrade: 7,
    wild: [],
    trainers: [],
    loot: [],
    gyms: [
      {
        name: 'Elite Four Vesper',
        sprite: 'johto/elite-koga',
        role: 'elite',
        team: [
          [169, 53],
          [89, 53],
          [94, 54],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Rime',
        sprite: 'hoenn/elite-glacia',
        role: 'elite',
        team: [
          [478, 55],
          [365, 55],
          [473, 56],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Orin',
        sprite: 'johto/elite-will',
        role: 'elite',
        team: [
          [376, 57],
          [202, 56],
          [124, 56],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Morwen',
        sprite: 'hoenn/elite-phoebe',
        role: 'elite',
        team: [
          [609, 58],
          [477, 57],
          [681, 58],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Champion Nyx',
        sprite: 'johto/elite-karen',
        role: 'champion',
        team: [
          [248, 60],
          [461, 59],
          [571, 60],
        ],
        items: ['hyper-potion'],
      },
    ],
  },
  // ---------------------------------------------------------------- secret areas: short, then the boss or raid
  {
    key: 'cemetery',
    name: 'Cemetery',
    art: 'haunted',
    banner: '/banners/haunted.png',
    min: 24,
    max: 30,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 3,
    hidden: true,
    unlock: [{ kind: 'pokedex', count: 20 }],
    boss: [{ dex: 93, level: 30, shiny: true }],
    wild: [
      [971, 25, 24, 28],
      [355, 25, 24, 28],
      [92, 20, 24, 28],
      [104, 10, 24, 27],
      [93, 8, 27, 30],
      [972, 4, 29, 30],
    ],
    trainers: [
      {
        name: 'Channeler Agnes',
        sprite: 'channeler',
        team: [
          [92, 27],
          [355, 27],
          [93, 28],
        ],
      },
    ],
    loot: [
      ['super-potion', 3, 1, 2],
      ['great-ball', 2, 1, 2],
      ['money', 2, 120, 200],
      ['reaper-cloth', 1, 1, 1, true],
    ],
  },
  {
    key: 'haunted-house',
    name: 'Haunted House',
    art: 'a121',
    banner: '/banners/haunted.png',
    min: 34,
    max: 40,
    rounds: 1,
    deck: { wild: 2, trainer: 2 },
    upgrade: 5,
    hidden: true,
    unlock: [{ kind: 'pokedex', count: 50 }],
    boss: [{ dex: 778, level: 40, shiny: true }],
    wild: [
      [854, 25, 34, 38],
      [353, 20, 34, 38],
      [93, 15, 35, 39],
      [200, 15, 34, 38],
      [608, 10, 36, 40],
      [354, 6, 37, 40],
      [711, 4, 38, 40],
    ],
    trainers: [
      {
        name: 'Maid Lenore',
        sprite: 'kalos/maid',
        team: [
          [854, 38],
          [354, 38],
        ],
      },
      {
        name: 'Butler Grimsby',
        sprite: 'kalos/butler',
        team: [
          [608, 39],
          [93, 38],
        ],
      },
    ],
    loot: [
      ['hyper-potion', 2, 1, 1],
      ['ultra-ball', 2, 1, 1],
      ['money', 2, 180, 300],
      ['cracked-pot', 1, 1, 1, true],
    ],
  },
  {
    key: 'cavern',
    name: 'Cavern',
    art: 'deepcave',
    banner: '/banners/cave_dark.png',
    min: 48,
    max: 55,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 6,
    hidden: true,
    unlock: [{ kind: 'maxLevel', level: 60 }],
    boss: [{ dex: 442, level: 50, shiny: true }],
    wild: [
      [302, 25, 48, 52],
      [42, 20, 48, 52],
      [305, 15, 48, 52],
      [75, 15, 48, 52],
      [623, 15, 50, 54],
      [306, 4, 53, 55],
      // Dreepy: the very rare find (docs/26 §2.3).
      [885, 1, 48, 50],
    ],
    trainers: [
      {
        name: 'Ruin Maniac Dirk',
        sprite: 'ruin-maniac',
        team: [
          [302, 52],
          [623, 53],
          [306, 54],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['revive', 2, 1, 1],
      ['money', 2, 260, 400],
      ['rare-candy', 1, 1, 1],
    ],
  },
  {
    key: 'newmoon-island',
    name: 'Newmoon Island',
    art: 'a127',
    banner: '/banners/haunted.png',
    min: 58,
    max: 64,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 7,
    hidden: true,
    unlock: [{ kind: 'cleared', areaId: id('area', 'shadow-elite') }],
    boss: [{ dex: 491, level: 60, shiny: true, raid: true }],
    wild: [
      [331, 20, 58, 61],
      [262, 20, 58, 62],
      [229, 15, 58, 62],
      [342, 15, 58, 62],
      [332, 10, 60, 64],
      [359, 10, 60, 63],
    ],
    trainers: [
      {
        name: 'Punk Girl Noctis',
        sprite: 'alola/punk-girl',
        team: [
          [229, 62],
          [332, 62],
          [359, 63],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['hyper-potion', 2, 1, 2],
      ['revive', 2, 1, 1],
      ['money', 2, 300, 480],
    ],
  },
  {
    key: 'distortion-world',
    name: 'Distortion World',
    art: 'a123',
    banner: '/banners/crystal_cave.png',
    min: 52,
    max: 70,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 8,
    hidden: true,
    // 100 of the world's Pokémon (docs/28, the user's call of 2026-10-15; it was all but Giratina, 119, before). Its
    // portal run (docs/28) with Distortion World's numbers: 0057 patches the live area
    // (scripts/patch-hh-distortion.ts).
    unlock: [{ kind: 'pokedex', count: 100 }],
    mode: DEFAULT_PORTAL_RUN,
    boss: [{ dex: 487, level: 70, shiny: true, raid: true }],
    // Only Pokémon met elsewhere too: everything must be caught before it opens.
    wild: [
      // Every one as likely, Dragapult aside (rare, as everywhere here). Levels set for today's difficulty with the
      // 2026-10-15 newcomers (docs/28 §3): the strong ones Lv.60–64, Haunter and Dusclops as reliefs Lv.52–55.
      [94, 15, 60, 64],
      [609, 15, 60, 64],
      [681, 15, 60, 64],
      [477, 15, 60, 64],
      [709, 15, 60, 64],
      [429, 15, 60, 64],
      [887, 2, 68, 70],
      [93, 15, 52, 55],
      [356, 15, 52, 55],
      [229, 15, 60, 64],
      [302, 15, 60, 64],
      [478, 15, 60, 64],
      [711, 15, 60, 64],
      [770, 15, 60, 64],
      [778, 15, 60, 64],
      [855, 15, 60, 64],
    ],
    trainers: [
      {
        name: 'Hex Maniac Umbra',
        sprite: 'hoenn/hex-maniac',
        team: [
          [94, 68],
          [609, 68],
          [477, 69],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 2, 3],
      ['revive', 2, 1, 2],
      ['money', 2, 360, 560],
      ['rare-candy', 1, 1, 1],
    ],
  },
]

/** Haunted Hollow's name in the ten languages (the region's and the world's). */
export const TITLE: SmallWorld['title'] = {
  en: 'Haunted Hollow',
  fr: 'Vallon Hanté',
  es: 'Hondonada Encantada',
  de: 'Spukmulde',
  it: 'Valle Infestata',
  pt: 'Vale Assombrado',
  'pt-BR': 'Vale Assombrado',
  ja: 'おばけの谷',
  ko: '유령의 골짜기',
  'zh-Hans': '幽灵谷',
}

/**
 * Trick or Treat's ghosts per main area (docs/29): each area's ghost-type wild Pokémon, the tier from its wild weight
 * (`ghostsFromWildPool`, which the admin's Prefill uses too). Frozen Lake has no ghost in the wild: Shuppet and Duskull,
 * common, and Froslass, very rare (the user's call).
 */
export const TRICK_GHOSTS: Record<string, [dex: number, tier: TrickTier][]> = {
  'dusk-road': [
    [425, 'rare'],
    [92, 'veryRare'],
  ],
  'foggy-marsh': [
    [92, 'common'],
    [622, 'rare'],
  ],
  'whispering-woods': [
    [708, 'common'],
    [710, 'common'],
    [946, 'common'],
  ],
  'lantern-town': [
    [607, 'common'],
    [353, 'common'],
    [200, 'veryRare'],
  ],
  'old-quarry': [[622, 'common']],
  'frozen-lake': [
    [353, 'common'],
    [355, 'common'],
    [478, 'veryRare'],
  ],
  'sunken-shore': [[769, 'common']],
  'rusted-armory': [
    [679, 'common'],
    [680, 'veryRare'],
  ],
  'windy-cliffs': [
    [425, 'common'],
    [426, 'rare'],
    [947, 'rare'],
  ],
  'spirit-mountain': [
    [355, 'common'],
    [200, 'common'],
    [354, 'common'],
    [356, 'rare'],
  ],
}

/** The ghost lists by area id, as game_config `trickOrTreat.areas` holds them. */
export function trickAreas(): Record<string, TrickGhost[]> {
  return Object.fromEntries(
    Object.entries(TRICK_GHOSTS).map(([key, list]) => [
      id('area', key),
      list.map(([dex, tier]) => ({ dex, tier })),
    ]),
  )
}

/**
 * Trick or Treat's row with the world's ghost lists in it (docs/29): the admin's switch, numbers and own lists kept
 * (an area's list the admin has already set wins), Off by default.
 */
export function withTrickLists(cur: Partial<TrickOrTreatConfig> | undefined): TrickOrTreatConfig {
  const own = cur && typeof cur === 'object' ? cur : {}
  return { ...DEFAULT_CONFIG.trickOrTreat, ...own, areas: { ...trickAreas(), ...(own.areas ?? {}) } }
}

const SHOP: SmallWorld['shop'] = [
  { key: 'poke-ball', price: 20, limit: null },
  { key: 'great-ball', price: 50, limit: null },
  { key: 'ultra-ball', price: 100, limit: null },
  // ₽999 and the Link Cable ₽300 since 2026-10-15 (docs/26 §2.8: 0055 patches the live Mart).
  { key: 'master-ball', price: 999, limit: 1 },
  { key: 'potion', price: 15, limit: null },
  { key: 'super-potion', price: 35, limit: null },
  { key: 'hyper-potion', price: 80, limit: null },
  { key: 'revive', price: 300, limit: null },
  { key: 'link-cable', price: 300, limit: null },
  { key: 'dusk-stone', price: 200, limit: null },
  { key: 'dawn-stone', price: 200, limit: null },
  { key: 'reaper-cloth', price: 200, limit: null },
  { key: 'cracked-pot', price: 200, limit: null },
]

const sprite = (s: string) => `/trainers/classes/${s}.png`

function trainerOf(areaKey: string, t: TrainerSpec): Trainer {
  return {
    id: id('trainer', areaKey, t.name),
    name: t.name,
    spriteUrl: sprite(t.sprite),
    team: t.team.map(([dex, level]) => ({ dex, level })),
    role: t.role ?? 'trainer',
    // A world's trainers give no badge (docs/21 §8c: the leaderboard keeps rows with badges only).
    badge: null,
    upgradeLevel: null,
    battleBackground: null,
    ...(t.items && { items: t.items }),
  } as Trainer
}

/** Its region row, areas, trainers and world settings. */
export function haunted(): { region: Region; areas: Area[]; trainers: Trainer[]; world: Omit<SmallWorld, 'previewHours'> } {
  const trainers: Trainer[] = []
  const areas = AREAS.map((a, i): Area => {
    const pool = a.trainers.map((t) => trainerOf(a.key, t))
    const gyms = (a.gyms ?? []).map((t) => trainerOf(a.key, t))
    trainers.push(...pool, ...gyms)
    const deck = { wild: 0, trainer: 0, center: 0, item: 0, casino: 0, ...a.deck }
    // Every area's deck holds one item and one Pokémon Center (the user's rule); the Shadow Elite has no deck. The ten
    // main areas add a Trick or Treat card (docs/29, 2026-10-15): 11 cards, dealt only while its switch is on.
    if (a.wild.length || a.trainers.length) Object.assign(deck, { item: 1, center: 1 })
    if (TRICK_GHOSTS[a.key]) Object.assign(deck, { trick: 1 })
    return {
      id: id('area', a.key),
      orderIndex: ORDER0 + i,
      regionId: REGION_ID,
      name: a.name,
      bannerUrl: a.banner,
      roundsToClear: a.rounds,
      minLevel: a.min,
      maxLevel: a.max,
      encounterWeights: deck,
      backtrackMultiplier: 0.5,
      legendaryBoss: a.boss ?? null,
      scalesToTeam: false,
      easyMode: false,
      enemyUpgradeLevel: a.upgrade,
      battleBackground: a.background ?? 'default',
      hidden: !!a.hidden,
      unlockConditions: a.unlock ?? null,
      ...(a.mode && { mode: a.mode }),
      gyms: gyms.map((g) => g.id),
      wildPool: a.wild.map(([dex, weight, minLevel, maxLevel]): WildPoolEntry => ({
        id: id('wild', a.key, dex),
        dex,
        weight,
        minLevel,
        maxLevel,
      })),
      trainerPool: pool.map((t) => ({ id: id('pool', a.key, t.id), trainerId: t.id, weight: 10 })),
      lootPool: a.loot.map(([itemKey, weight, minQty, maxQty, unique]): LootEntry => ({
        id: id('loot', a.key, itemKey),
        itemKey,
        weight,
        unique: !!unique,
        minQty,
        maxQty,
      })),
    } as Area
  })
  const region: Region = {
    id: REGION_ID,
    name: TITLE.en!,
    orderIndex: 99,
    // Past every species and form (docs/21 §8c): a world names no generation.
    dexRange: [99999, 99999],
    starters: [425, 622, 710],
    starterLevel: 5,
    leagueAreaId: id('area', 'shadow-elite'),
    nextRegion: null,
    enabled: false,
  }
  // As the admin saved it before the preview existed (docs/21 §9): the game reads it with the default 48 hours, and
  // migration 0052, generated from this, stays as it was run.
  const world: Omit<SmallWorld, 'previewHours'> = {
    id: WORLD_ID,
    regionId: REGION_ID,
    start: '2026-10-18T12:00:00.000Z',
    end: '2026-11-01T12:00:00.000Z',
    title: TITLE,
    banner: 'haunted',
    theme: { main: '#4a2f7a', accent: '#ff8a2a', ground: '#ece4f6' },
    minBadges: 3,
    starters: [425, 622, 710],
    xpMultiplier: 1.5,
    boosters: [{ type: 'ghost', multiplier: 1.2 }],
    shop: SHOP,
    // No mythical: its prizes are its shiny bosses and raids (docs/26 §2.5).
    mythical: { dex: 0, level: 60, areaId: '' },
    opens: {},
  }
  return { region, areas, trainers, world }
}

/** The bundle with Haunted Hollow in it: an earlier copy of it replaced, everything else as it was. */
export function withHaunted(b: BundleRaw): BundleRaw {
  const h = haunted()
  const areaIds = new Set(h.areas.map((a) => a.id))
  const trainerIds = new Set(h.trainers.map((t) => t.id))
  const config = b.config as Record<string, unknown> & {
    smallWorlds?: { access?: string; previewAccess?: string; list?: Partial<SmallWorld>[] }
    trickOrTreat?: Partial<TrickOrTreatConfig>
  }
  const worlds = config.smallWorlds ?? {}
  return {
    ...b,
    regions: [...(b.regions ?? []).filter((r) => r.id !== REGION_ID), h.region],
    areas: [...b.areas.filter((a) => !areaIds.has(a.id) && a.regionId !== REGION_ID), ...h.areas],
    trainers: [...b.trainers.filter((t) => !trainerIds.has(t.id)), ...h.trainers],
    config: {
      ...config,
      configVersion: Number(config.configVersion ?? 0) + 1,
      // The switch stays where the admin left it (On for admin, to try it first).
      smallWorlds: {
        ...worlds,
        access: worlds.access ?? 'admin',
        list: [...(worlds.list ?? []).filter((w) => w.id !== WORLD_ID), h.world],
      },
      trickOrTreat: withTrickLists(config.trickOrTreat),
    },
  }
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * The same content as SQL for a live database (supabase/migrations): upserts of its region, trainers, areas and their
 * pools (rows the script no longer has are deleted), the world added to `smallWorlds` (its switch and other worlds
 * kept), and `configVersion` + 1 so players fetch the new content. Safe to run again.
 */
export function hauntedSql(): string {
  const h = haunted()
  const areaIds = h.areas.map((a) => q(a.id)).join(', ')
  const keep = (ids: string[]) => (ids.length ? ids.map(q).join(', ') : "''")
  return [
    '-- Haunted Hollow (docs/26), the ghost small world. Generated by `pnpm haunted-hollow --sql`: do not edit by hand.',
    '-- Its region, areas, pools and trainers, and the world in game_config `smallWorlds` (the switch is left as it is).',
    '-- Safe to run again.',
    'begin;',
    upsert(
      'regions',
      [
        'id',
        'name',
        'order_index',
        'dex_range',
        'starters',
        'starter_level',
        'league_area_id',
        'next_region',
        'enabled',
      ],
      [
        [
          h.region.id,
          h.region.name,
          h.region.orderIndex,
          h.region.dexRange,
          h.region.starters,
          h.region.starterLevel,
          h.region.leagueAreaId,
          h.region.nextRegion,
          h.region.enabled,
        ],
      ],
      ['id'],
    ),
    upsert(
      'trainers',
      [
        'id',
        'name',
        'sprite_url',
        'team',
        'role',
        'badge',
        'upgrade_level',
        'battle_background',
        'rival_of',
        'items',
      ],
      h.trainers.map((t) => [
        t.id,
        t.name,
        t.spriteUrl,
        t.team,
        t.role,
        t.badge,
        t.upgradeLevel,
        t.battleBackground,
        null,
        t.items ?? [],
      ]),
      ['id'],
    ),
    upsert(
      'areas',
      [
        'id',
        'order_index',
        'region_id',
        'name',
        'banner_url',
        'rounds_to_clear',
        'min_level',
        'max_level',
        'encounter_weights',
        'backtrack_multiplier',
        'legendary_boss',
        'scales_to_team',
        'scale_offsets',
        'easy_mode',
        'enemy_upgrade_level',
        'battle_background',
        'hidden',
        'unlock_conditions',
        'gyms',
      ],
      h.areas.map((a) => [
        a.id,
        a.orderIndex,
        a.regionId,
        a.name,
        a.bannerUrl,
        a.roundsToClear,
        a.minLevel,
        a.maxLevel,
        a.encounterWeights,
        a.backtrackMultiplier,
        a.legendaryBoss,
        a.scalesToTeam,
        null,
        a.easyMode,
        a.enemyUpgradeLevel,
        a.battleBackground,
        a.hidden,
        a.unlockConditions,
        a.gyms,
      ]),
      ['id'],
    ),
    `delete from area_wild_pool where area_id in (${areaIds}) and id not in (${keep(h.areas.flatMap((a) => a.wildPool.map((w) => w.id)))});`,
    `delete from area_trainer_pool where area_id in (${areaIds}) and id not in (${keep(h.areas.flatMap((a) => a.trainerPool.map((t) => t.id)))});`,
    `delete from area_loot_pool where area_id in (${areaIds}) and id not in (${keep(h.areas.flatMap((a) => a.lootPool.map((l) => l.id)))});`,
    upsert(
      'area_wild_pool',
      ['id', 'area_id', 'dex', 'weight', 'min_level', 'max_level'],
      h.areas.flatMap((a) => a.wildPool.map((w) => [w.id, a.id, w.dex, w.weight, w.minLevel, w.maxLevel])),
      ['id'],
    ),
    upsert(
      'area_trainer_pool',
      ['id', 'area_id', 'trainer_id', 'weight'],
      h.areas.flatMap((a) => a.trainerPool.map((t) => [t.id, a.id, t.trainerId, t.weight])),
      ['id'],
    ),
    upsert(
      'area_loot_pool',
      ['id', 'area_id', 'item_key', 'weight', 'unique_find', 'min_qty', 'max_qty'],
      h.areas.flatMap((a) =>
        a.lootPool.map((l) => [l.id, a.id, l.itemKey, l.weight, l.unique, l.minQty, l.maxQty]),
      ),
      ['id'],
    ),
    'insert into game_config (key, value) values (\'smallWorlds\', \'{"access":"admin","list":[]}\'::jsonb) on conflict (key) do nothing;',
    `update game_config set value = jsonb_set(
  case when jsonb_typeof(value) = 'object' then value else '{"access":"admin"}'::jsonb end,
  '{list}',
  coalesce((select jsonb_agg(w) from jsonb_array_elements(coalesce(value -> 'list', '[]'::jsonb)) w where w ->> 'id' <> ${q(WORLD_ID)}), '[]'::jsonb)
    || jsonb_build_array(${q(JSON.stringify(h.world))}::jsonb)
) where key = 'smallWorlds';`,
    "insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);",
    'commit;',
    '',
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--sql') {
    if (!args[1]) throw new Error('Usage: pnpm haunted-hollow --sql <out.sql>')
    await writeFile(path.resolve(args[1]), hauntedSql())
    console.log(`✓ Haunted Hollow SQL → ${args[1]}`)
    return
  }
  const [input, output] = args
  if (!input || !output)
    throw new Error('Usage: pnpm haunted-hollow <in-bundle.json> <out-bundle.json> | --sql <out.sql>')
  const b = JSON.parse(await readFile(path.resolve(input), 'utf8')) as BundleRaw
  const out = withHaunted(b)
  await writeFile(path.resolve(output), JSON.stringify(out))
  const h = haunted()
  console.log(`✓ Haunted Hollow: ${h.areas.length} areas, ${h.trainers.length} trainers → ${output}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
