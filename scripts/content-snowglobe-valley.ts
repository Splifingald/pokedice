/**
 * Snowglobe Valley (docs/61): the winter small world, as content, built like Haunted Hollow (docs/26) with
 * scripts/world-content.ts. `snowglobe()` builds its region, areas, trainers and the world's settings;
 * `pnpm snowglobe-valley <in-bundle.json> <out-bundle.json>` adds them to an admin export for `pnpm import-bundle`, and
 * `pnpm snowglobe-valley --sql <out.sql>` writes the same as a migration. Ids are stable (`stableUuid`), so a re-run
 * updates in place.
 *
 * The user's brief (2026-11-01): Ice instead of Ghost; Sat 19 Dec 2026 → Sun 3 Jan 2027; Alolan Sandshrew, Alolan
 * Vulpix and a third Ice starter; about 125 Pokémon; Ice ×1.2; XP ×1.5; ten areas, the Frost League, five secret areas
 * (shiny Stantler; shiny Delibird from 24 Dec; shiny Abomasnow at 50 caught; shiny Dialga or Palkia after the league,
 * from 25 Dec; shiny Arceus at 90 caught, from 1 Jan). Each secret area gets a gameplay of its own (docs/61 §4): until
 * those are built they play as plain secret areas, which is how this content runs today. Moonlit Glade's (Tracks in
 * the Snow, §4.1) is built: its area carries the mode, which plays only while its switch is on.
 *
 * Its own rules (docs/61 §3): every area holds an Ice type; every item evolution uses an item its Mart sells; no
 * legendary or mythical but the prizes, no fossil, no starter of another region; a level-evolving species is wild only
 * below its evolution level, its evolution only above it.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORTAL_RUN, PLATE_BARS } from '../src/engine/portalMode'
import { DEFAULT_TRACKS } from '../src/engine/tracksMode'
import type { BundleRaw, PortalRunMode, Region, SmallWorld } from '../src/engine/types'
import { DEFAULT_WHITEOUT } from '../src/engine/whiteoutMode'
import { stableUuid } from './seed'
import { balls, buildAreas, worldSql, type AreaSpec, type WorldContent } from './world-content'
import { DEFAULT_TIME_RACE } from '../src/engine/timeRaceMode'

/**
 * The Hall of Origin's mode (docs/61 §4.5, the user's review: "keep it like the Giratina event"): Distortion World's
 * portal run with its numbers, dressed as the Stairway of Plates, and its raid: shiny Arceus Lv.90, foes' dice 10,
 * 4 HP bars, teams up to Lv.90, its Plate changing on each bar (Normal → Ice → Steel → Dragon).
 */
export const HALL_OF_ORIGIN_RUN: PortalRunMode = {
  ...DEFAULT_PORTAL_RUN,
  skin: 'plates',
  raid: { level: 90, upgradeLevel: 10, bars: 4, teamCap: 90, barTypes: [...PLATE_BARS] },
}

export const REGION_ID = 'world-snowglobe-valley'
export const WORLD_ID = 'snowglobe-valley-2026'
const ORDER0 = 9200

const id = (...parts: (string | number)[]) => stableUuid(['snowglobe-valley', ...parts].join(':'))

/**
 * The three partners (the user's reviews of 2026-11-01): fan favourites with a plain three-stage line evolving by level
 * at about the same levels (no trade, no stone), none strong against Ice, and none a game's own starter: Mareep (the
 * woolly sheep, 15/30), Lillipup (Stoutland, the snow-rescue dog, 16/32), Pikipek (Toucannon, 14/28): each clears the
 * chain and the league on the campaign simulator (Bounsweet, Grass, struggled on the first trail; Abra's Kadabra
 * evolves by trade here). Alolan Sandshrew and Vulpix, the first picks, stay in the wild.
 */
export const STARTERS = [179, 506, 731]

/**
 * The world's areas, in order: its chain, its league, then its secret areas. Each main area's item card becomes a Gift
 * card while the Gift card's switch is on (docs/61 §4.0): its `gift: 1`, which takes the item card's place then.
 */
export const AREAS: AreaSpec[] = [
  {
    key: 'snowy-trail',
    name: 'Snowy Trail',
    art: 'snow',
    banner: '/banners/snow_mountains.png',
    min: 3,
    max: 7,
    rounds: 1,
    deck: { wild: 7, trainer: 1, gift: 1 },
    upgrade: 1,
    wild: [
      [161, 30, 3, 5],
      [396, 18, 3, 5],
      [872, 8, 3, 5],
      [163, 10, 4, 6],
      [220, 6, 4, 6],
      [506, 5, 4, 6],
      [613, 3, 4, 6],
    ],
    trainers: [
      {
        name: 'Youngster Tim',
        sprite: 'youngster',
        team: [
          [161, 4],
          [396, 4],
        ],
      },
      { name: 'Skier Lena', sprite: 'sinnoh/skier-f', team: [[872, 5]] },
      {
        name: 'Lass Pippa',
        sprite: 'lass',
        team: [
          [163, 4],
          [161, 4],
        ],
      },
    ],
    loot: [...balls([2, 3]), ['potion', 3, 1, 2], ['money', 2, 30, 60]],
  },
  {
    key: 'pinewood-forest',
    name: 'Pinewood Forest',
    art: 'forest',
    banner: '/banners/forest.png',
    min: 7,
    max: 12,
    rounds: 1,
    deck: { wild: 6, trainer: 2, gift: 1 },
    upgrade: 1,
    wild: [
      [204, 25, 6, 9],
      [216, 20, 6, 9],
      [585, 20, 7, 10],
      [821, 20, 6, 9],
      [661, 15, 6, 9],
      [459, 6, 7, 9],
      [41, 12, 6, 9],
      [179, 12, 7, 10],
      [827, 12, 6, 9],
      [397, 5, 9, 11],
      [613, 4, 8, 10],
      [10103, 8, 7, 9],
      [234, 8, 7, 9],
      [731, 4, 7, 9],
    ],
    trainers: [
      {
        name: 'Bug Catcher Moss',
        sprite: 'bug-catcher',
        team: [
          [204, 9],
          [872, 9],
        ],
      },
      {
        name: 'Ranger Fir',
        sprite: 'sinnoh/ranger-m',
        team: [
          [585, 10],
          [216, 9],
        ],
      },
      {
        name: 'Bird Keeper Robin',
        sprite: 'bird-keeper',
        team: [
          [661, 9],
          [821, 9],
        ],
      },
      {
        name: 'Picnicker Ivy',
        sprite: 'picnicker',
        team: [
          [459, 10],
          [613, 9],
        ],
      },
    ],
    loot: [...balls([2, 3]), ['potion', 3, 1, 2], ['money', 2, 40, 80]],
  },
  {
    key: 'frozen-pond',
    name: 'Frozen Pond',
    art: 'lake',
    banner: '/banners/snow_mountains.png',
    min: 11,
    max: 16,
    rounds: 1,
    deck: { wild: 6, trainer: 2, gift: 1 },
    upgrade: 2,
    wild: [
      [194, 20, 11, 14],
      [129, 20, 11, 14],
      [86, 20, 11, 14],
      [90, 15, 12, 15],
      [361, 15, 12, 15],
      [363, 10, 12, 15],
      [170, 8, 12, 15],
      [349, 4, 14, 16],
      [195, 4, 14, 16],
    ],
    trainers: [
      {
        name: 'Fisherman Pike',
        sprite: 'fisherman',
        team: [
          [129, 13],
          [349, 14],
        ],
      },
      {
        name: 'Skier Neve',
        sprite: 'sinnoh/skier-f',
        team: [
          [361, 14],
          [86, 14],
        ],
      },
      {
        name: 'Fisherman Brook',
        sprite: 'johto/fisherman',
        team: [
          [90, 14],
          [194, 15],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 1]),
      ['potion', 3, 1, 2],
      ['money', 2, 60, 100],
      ['water-stone', 1, 1, 1, true],
    ],
  },
  {
    key: 'holly-village',
    name: 'Holly Village',
    art: 'snowtown',
    banner: '/banners/snow_mountains.png',
    min: 15,
    max: 21,
    rounds: 1,
    deck: { wild: 5, trainer: 3, gift: 1 },
    upgrade: 2,
    wild: [
      [433, 15, 15, 18],
      [868, 15, 15, 18],
      [180, 15, 16, 19],
      [831, 20, 15, 18],
      [582, 20, 16, 19],
      [333, 15, 16, 19],
      [322, 12, 15, 18],
      [427, 10, 15, 18],
      [764, 8, 16, 19],
      [225, 4, 18, 21],
      [446, 5, 17, 20],
      [181, 3, 19, 21],
    ],
    trainers: [
      {
        name: 'Pokéfan Carol',
        sprite: 'sinnoh/pokefan-f',
        team: [
          [868, 18],
          [446, 18],
        ],
      },
      {
        name: 'Gentleman Jasper',
        sprite: 'gentleman',
        team: [
          [831, 19],
          [180, 18],
        ],
      },
      {
        name: 'Lady Ginger',
        sprite: 'lady',
        team: [
          [582, 18],
          [433, 18],
        ],
      },
      {
        name: 'School Kid Joy',
        sprite: 'sinnoh/school-kid-f',
        team: [
          [582, 17],
          [872, 17],
          [433, 17],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 2]),
      ['super-potion', 3, 1, 2],
      ['money', 2, 80, 140],
      ['ice-stone', 1, 1, 1, true],
    ],
  },
  {
    key: 'toy-workshop',
    name: 'Toy Workshop',
    art: 'a761',
    banner: '/banners/factory.png',
    min: 20,
    max: 26,
    rounds: 1,
    deck: { wild: 5, trainer: 3, gift: 1 },
    // 2, not 3: Steel and Steel/Fairy wall an Ice team (the campaign simulator's wipes, docs/61 §5).
    upgrade: 2,
    wild: [
      [599, 20, 20, 23],
      [438, 15, 20, 23],
      [436, 15, 21, 24],
      [957, 15, 20, 23],
      [10176, 15, 21, 24],
      [624, 10, 22, 25],
      [958, 5, 24, 26],
      [185, 5, 24, 26],
    ],
    trainers: [
      {
        name: 'Engineer Gus',
        sprite: 'engineer',
        team: [
          [599, 23],
          [436, 23],
        ],
      },
      {
        name: 'Worker Tinsel',
        sprite: 'sinnoh/worker',
        team: [
          [957, 24],
          [438, 23],
        ],
      },
      {
        name: 'Clown Jingle',
        sprite: 'sinnoh/clown',
        team: [
          [185, 24],
          [10176, 24],
        ],
      },
      {
        name: 'Scientist Gearhart',
        sprite: 'scientist',
        team: [
          [599, 25],
          [436, 24],
          [624, 24],
        ],
      },
    ],
    loot: [...balls([2, 3], [1, 2]), ['super-potion', 3, 1, 2], ['money', 2, 100, 180]],
  },
  {
    key: 'icicle-cave',
    name: 'Icicle Cave',
    art: 'icecave',
    banner: '/banners/cave.png',
    min: 25,
    max: 32,
    rounds: 1,
    deck: { wild: 5, trainer: 3, gift: 1 },
    upgrade: 3,
    wild: [
      [42, 15, 25, 29],
      [712, 20, 25, 29],
      [215, 15, 26, 30],
      [615, 10, 27, 31],
      [220, 15, 25, 28],
      [361, 8, 27, 31],
      [10101, 8, 26, 29],
      // Very rare, as Dreepy in Haunted Hollow's Cavern: Arctibax at 35, Baxcalibur at 54.
      [996, 1, 25, 28],
    ],
    trainers: [
      {
        name: 'Hiker Alder',
        sprite: 'hiker',
        team: [
          [712, 29],
          [220, 29],
        ],
      },
      {
        name: 'Skier Sven',
        sprite: 'sinnoh/skier-m',
        team: [
          [215, 29],
          [361, 29],
        ],
      },
      {
        name: 'Ace Trainer Crystal',
        sprite: 'sinnoh/ace-trainer-f',
        team: [
          [615, 30],
          [42, 30],
          [221, 30],
        ],
      },
      {
        name: 'Ninja Boy Hail',
        sprite: 'hoenn/ninja-boy',
        team: [
          [215, 30],
          [41, 29],
        ],
      },
    ],
    loot: [
      ...balls([2, 3], [1, 2]),
      ['super-potion', 3, 1, 2],
      ['money', 2, 120, 200],
      ['dawn-stone', 1, 1, 1, true],
      ['razor-claw', 1, 1, 1, true],
    ],
  },
  {
    key: 'frostbite-harbour',
    name: 'Frostbite Harbour',
    art: 'harbour',
    banner: '/banners/ocean.png',
    min: 31,
    max: 38,
    rounds: 1,
    deck: { wild: 4, trainer: 4, gift: 1 },
    upgrade: 4,
    wild: [
      [171, 20, 31, 34],
      [739, 15, 32, 35],
      [974, 15, 32, 35],
      [875, 10, 33, 36],
      [364, 10, 33, 36],
      [87, 5, 35, 38],
      [131, 3, 36, 38],
    ],
    trainers: [
      {
        name: 'Sailor Hal',
        sprite: 'sailor',
        team: [
          [739, 35],
          [171, 35],
        ],
      },
      {
        name: 'Fisherman Marlin',
        sprite: 'sinnoh/fisherman',
        team: [
          [171, 35],
          [130, 36],
        ],
      },
      {
        name: 'Beauty Opal',
        sprite: 'beauty',
        team: [
          [875, 35],
          [87, 36],
        ],
      },
      {
        name: 'Sailor Floe',
        sprite: 'hoenn/sailor',
        team: [
          [364, 35],
          [974, 35],
          [171, 35],
        ],
      },
      {
        name: 'Swimmer Bjorn',
        sprite: 'swimmer-m',
        team: [
          [364, 34],
          [171, 34],
        ],
      },
    ],
    loot: [
      ['great-ball', 3, 1, 3],
      ['hyper-potion', 2, 1, 1],
      ['super-potion', 3, 1, 2],
      ['money', 2, 160, 260],
    ],
  },
  {
    key: 'ember-springs',
    name: 'Ember Springs',
    art: 'volcano',
    banner: '/banners/volcano.png',
    min: 37,
    max: 44,
    rounds: 1,
    deck: { wild: 4, trainer: 4, gift: 1 },
    // 4, not 5: the Fire area is the Ice team's hardest on purpose, not a wall (docs/61 §5).
    upgrade: 4,
    wild: [
      [323, 15, 37, 41],
      [218, 15, 37, 37],
      [324, 15, 38, 41],
      [663, 15, 38, 41],
      [364, 10, 38, 42],
      [219, 5, 41, 43],
      [143, 3, 41, 43],
    ],
    trainers: [
      {
        name: 'Kindler Cinder',
        sprite: 'hoenn/kindler',
        team: [
          [219, 41],
          [323, 41],
        ],
      },
      {
        name: 'Firebreather Ember',
        sprite: 'johto/firebreather',
        team: [
          [219, 41],
          [324, 41],
        ],
      },
      {
        name: 'Hiker Basalt',
        sprite: 'hiker',
        team: [
          [323, 42],
          [219, 41],
        ],
      },
      {
        name: 'Aroma Lady Cocoa',
        sprite: 'aroma-lady',
        team: [
          [143, 42],
          [324, 41],
        ],
      },
      {
        name: 'Ace Trainer Sol',
        sprite: 'sinnoh/ace-trainer-m',
        team: [
          [663, 42],
          [219, 42],
          [323, 41],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['hyper-potion', 2, 1, 1],
      ['money', 2, 200, 320],
      ['peat-block', 1, 1, 1, true],
    ],
  },
  {
    key: 'blizzard-pass',
    name: 'Blizzard Pass',
    art: 'mountain',
    banner: '/banners/snow_mountains.png',
    min: 42,
    max: 50,
    rounds: 1,
    deck: { wild: 4, trainer: 4, gift: 1 },
    upgrade: 4,
    wild: [
      [359, 15, 42, 46],
      [362, 10, 43, 47],
      [614, 10, 43, 47],
      [334, 10, 44, 47],
      [823, 10, 44, 47],
      [583, 15, 42, 46],
      [740, 10, 43, 47],
      [745, 6, 44, 48],
      [473, 4, 47, 50],
      [478, 4, 47, 50],
    ],
    trainers: [
      {
        name: 'Skier Frost',
        sprite: 'sinnoh/skier-m',
        team: [
          [362, 46],
          [478, 46],
        ],
      },
      {
        name: 'Ace Trainer Aspen',
        sprite: 'sinnoh/ace-trainer-f',
        team: [
          [614, 47],
          [334, 47],
        ],
      },
      {
        name: 'Bird Keeper Kestrel',
        sprite: 'hoenn/bird-keeper',
        team: [
          [823, 47],
          [334, 46],
        ],
      },
      {
        name: 'Hiker Everest',
        sprite: 'sinnoh/hiker',
        team: [
          [740, 46],
          [614, 46],
          [359, 46],
        ],
      },
      {
        name: 'Dragon Tamer Draven',
        sprite: 'hoenn/dragon-tamer',
        team: [
          [334, 48],
          [473, 48],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['revive', 2, 1, 1],
      ['money', 2, 240, 380],
      ['rare-candy', 1, 1, 1],
    ],
  },
  {
    key: 'aurora-summit',
    name: 'Aurora Summit',
    art: 'a54',
    banner: '/banners/snow_mountains.png',
    min: 48,
    max: 56,
    rounds: 1,
    // 4 wild · 4 trainers at upgrade 4 (was 3 · 5 at 5): ten wipes a run there before (docs/61 §5).
    deck: { wild: 4, trainer: 4, gift: 1 },
    upgrade: 4,
    wild: [
      [461, 10, 48, 52],
      [365, 10, 50, 53],
      [713, 10, 49, 53],
      [873, 10, 48, 52],
      [124, 10, 48, 52],
      [437, 10, 49, 53],
      [227, 10, 48, 52],
      [584, 8, 50, 54],
      [10102, 4, 52, 55],
      [10104, 4, 52, 55],
    ],
    trainers: [
      {
        name: 'Ace Trainer Boreal',
        sprite: 'sinnoh/ace-trainer-m',
        team: [
          [461, 52],
          [713, 52],
        ],
      },
      {
        name: 'Psychic Aurora',
        sprite: 'psychic-f',
        team: [
          [124, 52],
          [437, 52],
        ],
      },
      {
        name: 'Skier Yuki',
        sprite: 'johto/skier',
        team: [
          [365, 52],
          [473, 52],
        ],
      },
      {
        name: 'Veteran Tundra',
        sprite: 'sinnoh/veteran-m',
        team: [
          [227, 52],
          [584, 52],
          [713, 53],
        ],
      },
      {
        name: 'Ranger Lumi',
        sprite: 'sinnoh/ranger-f',
        team: [
          [873, 52],
          [10104, 53],
        ],
      },
      {
        name: 'Cooltrainer Glacier',
        sprite: 'cooltrainer-m',
        team: [
          [461, 53],
          [10102, 53],
          [614, 52],
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
    key: 'frost-league',
    name: 'Frost League',
    art: 'league',
    banner: '/banners/default.png',
    min: 52,
    max: 60,
    // The five fights only, as the Shadow Elite: no round to play first.
    rounds: 0,
    deck: {},
    upgrade: 7,
    wild: [],
    trainers: [],
    loot: [],
    // Water and Steel come first: they foreshadow Spear Pillar's last choice (Palkia's Water, Dialga's Steel).
    gyms: [
      {
        name: 'Elite Four Fjord',
        sprite: 'kalos/elite-siebold',
        role: 'elite',
        team: [
          [131, 53],
          [87, 53],
          [91, 54],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Gunnar',
        sprite: 'kalos/elite-wikstrom',
        role: 'elite',
        team: [
          [10102, 55],
          [823, 55],
          [601, 56],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Drasna',
        sprite: 'kalos/elite-drasna',
        role: 'elite',
        team: [
          [334, 57],
          [149, 57],
          [998, 58],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Elite Four Holly',
        sprite: 'hoenn/elite-glacia',
        role: 'elite',
        team: [
          // No Ghost type a league must get past: a team of Normal types couldn't touch it (the simulator's stuck runs).
          [365, 58],
          [362, 57],
          [10104, 58],
        ],
        items: ['hyper-potion'],
      },
      {
        name: 'Champion Nicholas',
        sprite: 'kalos/wulfric',
        role: 'champion',
        team: [
          [473, 59],
          [461, 59],
          [460, 60],
        ],
        // His Abomasnow Mega Evolves with its gem (the user's review: enemyPlanFor reads a gem among a trainer's items).
        items: ['hyper-potion', 'abomasite'],
      },
    ],
  },
  // The secret areas (docs/61 §4): each will play its own way; until then, a short deck, its boss or raid at the end.
  {
    key: 'moonlit-glade',
    name: 'Moonlit Glade',
    art: 'a126',
    banner: '/banners/forest.png',
    min: 24,
    max: 30,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 3,
    hidden: true,
    unlock: [{ kind: 'pokedex', count: 20 }],
    boss: [{ dex: 234, level: 30, shiny: true }],
    // Tracks in the Snow (docs/61 §4.1): hide and seek in three rounds, behind its switch (Off: a plain secret area).
    mode: DEFAULT_TRACKS,
    wild: [
      [234, 15, 24, 28],
      [164, 20, 25, 29],
      [585, 20, 24, 28],
      [427, 15, 24, 28],
      [828, 15, 24, 28],
      [215, 10, 25, 29],
      [745, 4, 27, 30],
    ],
    trainers: [
      {
        name: 'Ranger Luna',
        sprite: 'sinnoh/ranger-f',
        team: [
          [164, 27],
          [234, 28],
          [828, 28],
        ],
      },
    ],
    loot: [
      ['great-ball', 3, 1, 2],
      ['super-potion', 2, 1, 2],
      ['money', 2, 120, 200],
    ],
  },
  {
    key: 'evergreen-hill',
    name: 'Evergreen Hill',
    art: 'a858',
    banner: '/banners/snow_mountains.png',
    min: 34,
    max: 40,
    rounds: 1,
    // Christmas Eve on the hill (docs/61 §4.2): three Gift cards, which take the item card's place while the Gift card is
    // on; then Delibird bursts out of a present of its own. Off, a plain secret area: its item card, its boss as usual.
    deck: { wild: 2, trainer: 2, gift: 3 },
    upgrade: 5,
    hidden: true,
    // No count to reach: it opens on Christmas Eve (the world's `opens`), for everyone who has started the world.
    unlock: [],
    boss: [{ dex: 225, level: 40, shiny: true, present: true }],
    wild: [
      [225, 15, 34, 38],
      [764, 10, 35, 38],
      [869, 10, 35, 38],
      [358, 15, 34, 38],
      [334, 10, 36, 39],
      [459, 15, 34, 37],
      [899, 10, 35, 38],
    ],
    trainers: [
      {
        name: 'Pokéfan Mistle',
        sprite: 'sinnoh/pokefan-m',
        team: [
          [225, 38],
          [869, 38],
        ],
      },
      {
        name: 'Lady Garland',
        sprite: 'sinnoh/lady',
        team: [
          [764, 39],
          [358, 38],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['hyper-potion', 2, 1, 1],
      ['money', 2, 180, 300],
      ['rare-candy', 1, 1, 1],
    ],
  },
  {
    key: 'crown-shrine',
    name: 'Crown Shrine',
    art: 'a855',
    banner: '/banners/snow_mountains.png',
    min: 48,
    max: 55,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 6,
    hidden: true,
    unlock: [{ kind: 'pokedex', count: 50 }],
    boss: [{ dex: 460, level: 50, shiny: true }],
    // Whiteout (docs/61 §4.3): three waves of fixed foes in the blizzard, a bonfire after each, then Abomasnow. With
    // its switch Off the area plays as the plain secret area below (its short deck, then its boss).
    mode: DEFAULT_WHITEOUT,
    wild: [
      [460, 15, 48, 52],
      [586, 15, 48, 52],
      [217, 15, 48, 52],
      [437, 10, 49, 53],
      [614, 15, 48, 52],
      [359, 10, 49, 53],
    ],
    trainers: [
      {
        name: 'Sage Hiemal',
        sprite: 'johto/sage',
        team: [
          [460, 53],
          [217, 53],
          [586, 54],
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
    key: 'spear-pillar',
    name: 'Spear Pillar',
    art: 'lair-summit',
    banner: '/banners/sky.png',
    min: 56,
    max: 64,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 7,
    hidden: true,
    // After the Frost League, from Christmas Day (the world's `opens`). Its time race (docs/61 §4.4) decides which of
    // the two raids opens: Water → Palkia, Steel → Dialga; the replay opens the other.
    unlock: [{ kind: 'cleared', areaId: id('area', 'frost-league') }],
    boss: [
      { dex: 483, level: 70, shiny: true, raid: true },
      { dex: 484, level: 70, shiny: true, raid: true },
    ],
    // The race of time and space (docs/61 §4.4): its own switch (`timeRace`, Off by default); off, the area plays as a
    // plain secret area (its short deck, then its raids).
    mode: DEFAULT_TIME_RACE,
    // The race's forks draw by type from this pool (docs/61 §4.4), all met elsewhere: Fire or Grass, Dark or Psychic,
    // Dragon or Ice, Electric or Ground, then Water (Palkia) or Steel (Dialga); the replay's other types (Normal or
    // Fairy, Rock or Flying, Bug or Dragon, Ice or Dark, then the other gate) come last.
    wild: [
      [663, 10, 56, 60],
      [323, 10, 56, 60],
      [219, 10, 56, 60],
      [460, 10, 56, 60],
      [586, 10, 56, 60],
      [359, 10, 56, 60],
      [461, 10, 56, 60],
      [828, 10, 56, 60],
      [124, 10, 56, 60],
      [358, 10, 56, 60],
      [899, 10, 56, 60],
      [334, 10, 56, 60],
      [998, 3, 60, 62],
      [362, 10, 56, 60],
      [478, 10, 56, 60],
      [713, 10, 56, 60],
      [171, 10, 56, 60],
      [181, 10, 56, 60],
      [473, 10, 56, 60],
      [195, 10, 56, 60],
      [901, 10, 56, 60],
      [131, 10, 56, 60],
      [130, 10, 56, 60],
      [91, 10, 56, 60],
      [350, 10, 56, 60],
      [437, 10, 56, 60],
      [601, 10, 56, 60],
      [227, 10, 56, 60],
      [823, 10, 56, 60],
      [10102, 10, 56, 60],
      [143, 10, 56, 60],
      [832, 10, 56, 60],
      [428, 10, 56, 60],
      [869, 10, 56, 60],
      [959, 10, 56, 60],
      [185, 10, 56, 60],
      [745, 10, 56, 60],
      [398, 10, 56, 60],
      [169, 10, 56, 60],
      [873, 10, 56, 60],
      [205, 10, 56, 60],
    ],
    trainers: [
      {
        name: 'Ace Trainer Chrona',
        sprite: 'sinnoh/ace-trainer-f',
        team: [
          [601, 60],
          [131, 60],
          [998, 61],
        ],
      },
    ],
    loot: [
      ['ultra-ball', 3, 1, 2],
      ['revive', 2, 1, 1],
      ['money', 2, 300, 480],
    ],
  },
  {
    key: 'hall-of-origin',
    name: 'Hall of Origin',
    art: 'a130',
    banner: '/banners/sky.png',
    min: 52,
    max: 70,
    rounds: 1,
    deck: { wild: 3, trainer: 1 },
    upgrade: 8,
    hidden: true,
    // 90 of the world's Pokémon, from New Year's Day (the world's `opens`).
    unlock: [{ kind: 'pokedex', count: 90 }],
    // Lv.90 (the user's review); its portal run (docs/61 §4.5) holds the raid's own numbers.
    boss: [{ dex: 493, level: 90, shiny: true, raid: true }],
    mode: HALL_OF_ORIGIN_RUN,
    // Only Pokémon met elsewhere too: everything must be catchable before it opens.
    wild: [
      [461, 15, 60, 64],
      [473, 15, 60, 64],
      [365, 15, 60, 64],
      [713, 15, 60, 64],
      [478, 15, 60, 64],
      [362, 15, 60, 64],
      [614, 15, 60, 64],
      [584, 15, 60, 64],
      [873, 15, 60, 64],
      [10104, 15, 60, 64],
      [10102, 15, 60, 64],
      [131, 15, 60, 64],
      [225, 15, 52, 55],
      [875, 15, 52, 55],
      // Every type among its Pokémon (the user's review): Normal, Fire and Rock, Grass, Electric, Fighting, Poison and
      // Psychic join the Ice-led pool.
      [143, 15, 60, 64],
      [219, 15, 60, 64],
      [460, 15, 60, 64],
      [181, 15, 60, 64],
      [740, 15, 60, 64],
      [169, 15, 60, 64],
      [124, 15, 60, 64],
      [998, 2, 68, 70],
    ],
    trainers: [
      {
        name: 'Cooltrainer Genesis',
        sprite: 'cooltrainer-f',
        team: [
          [998, 68],
          [473, 68],
          [10104, 69],
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

/** Snowglobe Valley's name in the ten languages (the region's and the world's). */
export const TITLE: SmallWorld['title'] = {
  en: 'Snowglobe Valley',
  fr: 'Vallée Boule-de-Neige',
  es: 'Valle Bola de Nieve',
  de: 'Schneekugeltal',
  it: 'Valle Palla di Neve',
  pt: 'Vale Globo de Neve',
  'pt-BR': 'Vale Globo de Neve',
  ja: 'スノードームの谷',
  ko: '스노우볼 골짜기',
  'zh-Hans': '雪景球山谷',
}

/**
 * The world opens and closes at 12:00 UTC like Haunted Hollow, which makes it exactly 15 days; its dated bosses open at
 * the same hour on their day (the user's call: Delibird on 24 Dec, Dialga and Palkia on 25 Dec, Arceus on 1 Jan).
 */
export const DATES = {
  start: '2026-12-19T12:00:00.000Z',
  end: '2027-01-03T12:00:00.000Z',
  christmasEve: '2026-12-24T12:00:00.000Z',
  christmas: '2026-12-25T12:00:00.000Z',
  newYear: '2027-01-01T12:00:00.000Z',
}

const SHOP: SmallWorld['shop'] = [
  { key: 'poke-ball', price: 20, limit: null },
  { key: 'great-ball', price: 50, limit: null },
  { key: 'ultra-ball', price: 100, limit: null },
  { key: 'master-ball', price: 999, limit: 1 },
  { key: 'potion', price: 15, limit: null },
  { key: 'super-potion', price: 35, limit: null },
  { key: 'hyper-potion', price: 80, limit: null },
  { key: 'revive', price: 300, limit: null },
  // Every item evolution of the world (its rule): Alolan Sandshrew and Vulpix, Galarian Darumaka, Crabrawler and
  // Cetoddle (Ice Stone), Shellder (Water Stone), Snorunt's Froslass (Dawn Stone), Sneasel (Razor Claw), Ursaring
  // (Peat Block).
  { key: 'ice-stone', price: 200, limit: null },
  { key: 'water-stone', price: 200, limit: null },
  { key: 'dawn-stone', price: 200, limit: null },
  { key: 'razor-claw', price: 200, limit: null },
  { key: 'peat-block', price: 200, limit: null },
]

/** Its region row, areas, trainers and world settings. */
export function snowglobe(): WorldContent {
  const { areas, trainers } = buildAreas(id, REGION_ID, ORDER0, AREAS)
  const region: Region = {
    id: REGION_ID,
    name: TITLE.en!,
    orderIndex: 100,
    // Past every species and form (docs/21 §8c): a world names no generation.
    dexRange: [99999, 99999],
    starters: STARTERS,
    starterLevel: 5,
    leagueAreaId: id('area', 'frost-league'),
    nextRegion: null,
    enabled: false,
  }
  const world: Omit<SmallWorld, 'previewHours'> = {
    id: WORLD_ID,
    regionId: REGION_ID,
    start: DATES.start,
    end: DATES.end,
    title: TITLE,
    banner: 'snowtown',
    theme: { main: '#25557f', accent: '#d8333f', ground: '#eaf3fa' },
    minBadges: 3,
    starters: STARTERS,
    xpMultiplier: 1.5,
    boosters: [{ type: 'ice', multiplier: 1.2 }],
    shop: SHOP,
    // No mythical: its prizes are its shiny bosses and raids (docs/26 §2.5).
    mythical: { dex: 0, level: 60, areaId: '' },
    opens: {
      [id('area', 'evergreen-hill')]: DATES.christmasEve,
      [id('area', 'spear-pillar')]: DATES.christmas,
      [id('area', 'hall-of-origin')]: DATES.newYear,
    },
  }
  return { region, areas, trainers, world }
}

/** The bundle with Snowglobe Valley in it: an earlier copy of it replaced, everything else as it was. */
export function withSnowglobe(b: BundleRaw): BundleRaw {
  const h = snowglobe()
  const areaIds = new Set(h.areas.map((a) => a.id))
  const trainerIds = new Set(h.trainers.map((t) => t.id))
  const config = b.config as Record<string, unknown> & {
    smallWorlds?: { access?: string; previewAccess?: string; list?: Partial<SmallWorld>[] }
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
      // The switch stays where the admin left it.
      smallWorlds: {
        ...worlds,
        access: worlds.access ?? 'admin',
        list: [...(worlds.list ?? []).filter((w) => w.id !== WORLD_ID), h.world],
      },
    },
  }
}

/** The same content as a migration: safe to run again (scripts/world-content.ts). */
export function snowglobeSql(): string {
  return worldSql(
    snowglobe(),
    [
      '-- Snowglobe Valley (docs/61), the winter small world. Generated by `pnpm snowglobe-valley --sql`: do not edit by',
      '-- hand. Its region, areas, pools and trainers, and the world in game_config `smallWorlds` (the switch is left as',
      '-- it is). Safe to run again.',
    ],
    { modes: true },
  )
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--sql') {
    if (!args[1]) throw new Error('Usage: pnpm snowglobe-valley --sql <out.sql>')
    await writeFile(path.resolve(args[1]), snowglobeSql())
    console.log(`✓ Snowglobe Valley SQL → ${args[1]}`)
    return
  }
  const [input, output] = args
  if (!input || !output)
    throw new Error('Usage: pnpm snowglobe-valley <in-bundle.json> <out-bundle.json> | --sql <out.sql>')
  const b = JSON.parse(await readFile(path.resolve(input), 'utf8')) as BundleRaw
  await writeFile(path.resolve(output), JSON.stringify(withSnowglobe(b)))
  const h = snowglobe()
  console.log(`✓ Snowglobe Valley: ${h.areas.length} areas, ${h.trainers.length} trainers → ${output}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
