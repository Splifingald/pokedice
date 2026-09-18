// Hand-written seeded content: Kanto in order of discovery (Red/Blue/FireRed/LeafGreen), hidden areas, trainers,
// gym leaders, the Elite Four and the Champion. Everything becomes plain data rows — all editable in admin.
//
// Rosters follow the original games (version exclusives merged); gym leaders / E4 / Champion use their real top-3
// Pokémon. Gift/static Pokémon (Eevee, Lapras, Snorlax, fossils, Porygon…) are rare wild encounters nearby.

import type { BossDef, EncounterKind, PokeType, UnlockCondition } from '../src/engine/types'

export const LEGENDARIES = [144, 145, 146, 150, 151]
export const STARTERS = [1, 4, 7]

/** Banner scenes: 118×16 pixel strips in graphics/banners, published to public/banners by scripts/art.ts. */
export const BANNER_SCENES = [
  'beach',
  'bridge',
  'cave',
  'cave_dark',
  'city',
  'crystal_cave',
  'default',
  'dunes',
  'factory',
  'flowers',
  'forest',
  'haunted',
  'mountains',
  'ocean',
  'plains',
  'sky',
  'snow_mountains',
  'sunset',
  'swamp',
  'volcano',
] as const
export type BannerScene = (typeof BANNER_SCENES)[number]

/** An area's banner; `flip` mirrors it horizontally so a shared scene reads as a new place. */
export interface BannerPlan {
  scene: BannerScene
  flip?: boolean
}

/** [dex, level] */
export type Mon = [number, number]

export interface TrainerPlan {
  name: string
  /** Explicit team, or generated from the area's pool with `specialty` + `size`. */
  team?: Mon[]
  specialty?: PokeType
  size?: 1 | 2 | 3
}

export interface GymPlan {
  name: string
  role: 'leader' | 'elite' | 'champion'
  badge?: string
  specialty: PokeType
  team: Mon[]
  /** Rival version for players who picked this starter (see Trainer.rivalOf); fought as the character they didn't pick. */
  rivalOf?: number
}

export interface AreaPlan {
  key: string
  name: string
  orderIndex: number
  banner: BannerPlan
  xpToUnlockNext: number | null
  minLevel: number
  maxLevel: number
  /** Copies of each card; kinds left out get none. */
  weights: Partial<Record<EncounterKind, number>>
  backtrackMultiplier: number
  bosses: BossDef[] | null
  scalesToTeam: boolean
  /** A Center comes next whenever a team member is K.O. (set per area in admin). */
  easyMode?: boolean
  hidden?: boolean
  conditions?: UnlockCondition[]
  /** Explicit loot table (copies per deck, like the admin's), instead of the stage's. */
  loot?: LootPlan[]
  /** [dex, weight, minLevel, maxLevel] — or 'ALL' for every non-legendary species (starters included, rare). */
  wild: [number, number, number, number][] | 'ALL'
  trainers: TrainerPlan[]
  gyms?: GymPlan[]
}

// With a 10-card deck: wildOnly 8/0/1/1, light 5/3/1/1, mixed 5/3/1/1, busy 4/4/1/1, trainersOnly 0/8/1/1.
const W = {
  wildOnly: { wild: 78, trainer: 0, center: 12, item: 10 },
  light: { wild: 52, trainer: 26, center: 12, item: 10 },
  mixed: { wild: 46, trainer: 32, center: 12, item: 10 },
  busy: { wild: 38, trainer: 40, center: 12, item: 10 },
  trainersOnly: { wild: 0, trainer: 75, center: 15, item: 10 },
}

/** [itemKey, weight, minQty, maxQty, once?] — itemKey 'money' is Pokédollars (quantity = ₽). */
export type LootPlan = [string, number, number, number, boolean?]

/** What lies on the ground, by stage of the journey. */
const LOOT_TIERS: Record<1 | 2 | 3 | 4 | 5, LootPlan[]> = {
  1: [
    ['potion', 30, 1, 1],
    ['poke-ball', 26, 1, 2],
    ['antidote', 12, 1, 1],
    ['paralyze-heal', 10, 1, 1],
    ['ether', 4, 1, 1],
    ['money', 18, 10, 25],
  ],
  2: [
    ['potion', 22, 1, 2],
    ['super-potion', 10, 1, 1],
    ['poke-ball', 20, 1, 2],
    ['great-ball', 6, 1, 1],
    ['antidote', 8, 1, 1],
    ['paralyze-heal', 8, 1, 1],
    ['burn-heal', 6, 1, 1],
    ['ether', 6, 1, 1],
    ['money', 16, 25, 50],
  ],
  3: [
    ['super-potion', 20, 1, 2],
    ['poke-ball', 10, 2, 3],
    ['great-ball', 16, 1, 2],
    ['ultra-ball', 4, 1, 1],
    ['antidote', 5, 1, 1],
    ['paralyze-heal', 5, 1, 1],
    ['burn-heal', 5, 1, 1],
    ['ice-heal', 5, 1, 1],
    ['ether', 8, 1, 1],
    ['max-ether', 3, 1, 1],
    ['money', 16, 50, 100],
  ],
  4: [
    ['super-potion', 12, 1, 2],
    ['hyper-potion', 14, 1, 1],
    ['great-ball', 12, 1, 2],
    ['ultra-ball', 12, 1, 1],
    ['paralyze-heal', 4, 1, 1],
    ['burn-heal', 4, 1, 1],
    ['ice-heal', 4, 1, 1],
    ['ether', 8, 1, 2],
    ['max-ether', 6, 1, 1],
    ['rare-candy', 3, 1, 1],
    ['money', 18, 100, 200],
  ],
  5: [
    ['hyper-potion', 20, 1, 2],
    ['ultra-ball', 20, 1, 2],
    ['max-ether', 12, 1, 1],
    ['ether', 8, 1, 2],
    ['rare-candy', 8, 1, 1],
    ['money', 20, 200, 400],
  ],
}

/** One-time finds, where the originals hid something good. */
const ONCE_ONLY: Record<string, LootPlan[]> = {
  'viridian-forest': [['poke-ball', 12, 3, 3, true]],
  'mt-moon': [
    ['rare-candy', 12, 1, 1, true],
    ['money', 8, 150, 150, true],
  ],
  'route-4-nugget-bridge': [['money', 12, 250, 250, true]], // the Nugget
  'rock-tunnel': [['rare-candy', 10, 1, 1, true]],
  'pokemon-tower': [['max-ether', 10, 1, 1, true]],
  'safari-zone': [['ultra-ball', 10, 3, 3, true]],
  'silph-co': [
    ['master-ball', 14, 1, 1, true],
    ['rare-candy', 8, 1, 1, true],
  ],
  'seafoam-islands': [['ultra-ball', 10, 2, 2, true]],
  'pokemon-mansion': [['rare-candy', 10, 1, 1, true]],
  'victory-road': [
    ['rare-candy', 10, 1, 1, true],
    ['max-ether', 8, 1, 1, true],
  ],
  'power-plant': [['max-ether', 10, 1, 1, true]],
  'cerulean-cave': [['rare-candy', 12, 2, 2, true]],
}

/** An area's loot table: its stage's finds plus its one-time extras (Faraway Island has none). */
export function lootPlanFor(plan: AreaPlan): LootPlan[] {
  if (plan.loot) return plan.loot
  if (plan.key === 'faraway-island') return []
  const tier: 1 | 2 | 3 | 4 | 5 =
    plan.key === 'cerulean-cave' ? 5 : plan.key === 'power-plant' ? 4 : plan.key === 'rocket-hideout' ? 3 : plan.orderIndex <= 4 ? 1 : plan.orderIndex <= 9 ? 2 : plan.orderIndex <= 15 ? 3 : 4
  return [...LOOT_TIERS[tier], ...(ONCE_ONLY[plan.key] ?? [])]
}

const area = (p: Omit<AreaPlan, 'backtrackMultiplier' | 'bosses' | 'scalesToTeam'> & Partial<AreaPlan>): AreaPlan => ({
  backtrackMultiplier: 0.5,
  bosses: null,
  scalesToTeam: false,
  ...p,
})

export const AREAS: AreaPlan[] = [
  area({
    key: 'route-1',
    name: 'Route 1',
    orderIndex: 1,
    banner: { scene: 'plains' },
    xpToUnlockNext: 15,
    minLevel: 2,
    maxLevel: 5,
    weights: W.wildOnly,
    wild: [
      [16, 50, 2, 5], // Pidgey
      [19, 50, 2, 4], // Rattata
    ],
    trainers: [],
  }),
  area({
    key: 'routes-22-2',
    name: 'Routes 22 & 2',
    orderIndex: 2,
    banner: { scene: 'flowers' },
    xpToUnlockNext: 20,
    minLevel: 3,
    maxLevel: 7,
    weights: W.wildOnly,
    wild: [
      [19, 20, 3, 5],
      [21, 18, 3, 6], // Spearow
      [56, 12, 3, 6], // Mankey
      [29, 12, 3, 6], // Nidoran♀
      [32, 12, 3, 6], // Nidoran♂
      [16, 14, 3, 6],
      [10, 10, 3, 5], // Caterpie
      [13, 10, 3, 5], // Weedle
    ],
    trainers: [],
  }),
  area({
    key: 'viridian-forest',
    name: 'Viridian Forest',
    orderIndex: 3,
    banner: { scene: 'forest' },
    xpToUnlockNext: 30,
    minLevel: 4,
    maxLevel: 8,
    weights: W.light,
    wild: [
      [10, 20, 4, 6],
      [11, 14, 5, 7], // Metapod
      [13, 20, 4, 6],
      [14, 14, 5, 7], // Kakuna
      [16, 10, 4, 7],
      [17, 3, 8, 9], // Pidgeotto
      [25, 5, 3, 6], // Pikachu
    ],
    trainers: [
      { name: 'Bug Catcher Rick', team: [[13, 6], [10, 6]] },
      { name: 'Bug Catcher Doug', team: [[13, 7], [14, 7], [13, 7]] },
      { name: 'Bug Catcher Anthony', team: [[10, 7], [10, 8]] },
      { name: 'Bug Catcher Charlie', team: [[11, 7], [10, 7], [11, 7]] },
      { name: 'Bug Catcher Sammy', team: [[13, 9]] },
      { name: 'Camper Liam', team: [[74, 10], [27, 11]] },
    ],
    gyms: [{ name: 'Brock', role: 'leader', badge: 'Boulder Badge', specialty: 'rock', team: [[74, 12], [95, 14]] }],
  }),
  area({
    key: 'route-3',
    name: 'Route 3',
    orderIndex: 4,
    banner: { scene: 'mountains' },
    xpToUnlockNext: 40,
    minLevel: 5,
    maxLevel: 10,
    weights: W.mixed,
    wild: [
      [21, 25, 6, 8],
      [39, 10, 3, 7], // Jigglypuff
      [29, 12, 6, 8],
      [32, 12, 6, 8],
      [56, 12, 7, 8],
      [19, 10, 6, 8],
    ],
    trainers: [
      { name: 'Lass Janice', team: [[16, 9], [16, 9]] },
      { name: 'Bug Catcher Colton', team: [[10, 10], [13, 10], [10, 10]] },
      { name: 'Youngster Ben', team: [[19, 11], [23, 11]] },
      { name: 'Bug Catcher Greg', team: [[13, 9], [14, 9], [10, 9]] },
      { name: 'Youngster Calvin', team: [[21, 14]] },
      { name: 'Lass Sally', team: [[19, 10], [29, 10]] },
      { name: 'Bug Catcher James', team: [[10, 11], [11, 11]] },
      { name: 'Lass Robin', team: [[39, 14]] },
    ],
  }),
  area({
    key: 'mt-moon',
    name: 'Mt. Moon',
    orderIndex: 5,
    banner: { scene: 'cave' },
    xpToUnlockNext: 50,
    minLevel: 7,
    maxLevel: 12,
    weights: W.light,
    wild: [
      [41, 35, 7, 11], // Zubat
      [74, 25, 7, 10], // Geodude
      [46, 12, 8, 10], // Paras
      [35, 6, 8, 12], // Clefairy
      [138, 2, 10, 12], // Omanyte (Helix Fossil)
      [140, 2, 10, 12], // Kabuto (Dome Fossil)
    ],
    trainers: [
      { name: 'Bug Catcher Kent', team: [[13, 11], [14, 11]] },
      { name: 'Lass Iris', team: [[35, 14]] },
      { name: 'Super Nerd Jovan', team: [[81, 11], [100, 11]] },
      { name: 'Youngster Josh', team: [[19, 10], [19, 10], [41, 10]] },
      { name: 'Hiker Marcos', team: [[74, 10], [74, 10], [95, 10]] },
      { name: 'Rocket Grunt', team: [[27, 11], [19, 11], [41, 11]] },
      { name: 'Rocket Grunt', team: [[41, 12], [23, 12]] },
      { name: 'Super Nerd Miguel', team: [[88, 12], [100, 12], [109, 12]] },
      { name: 'Lass Miriam', team: [[43, 11], [69, 11]] },
    ],
  }),
  area({
    key: 'route-4-nugget-bridge',
    name: 'Route 4 & Nugget Bridge',
    orderIndex: 6,
    banner: { scene: 'bridge' },
    xpToUnlockNext: 60,
    minLevel: 9,
    maxLevel: 15,
    weights: W.busy,
    wild: [
      [19, 12, 8, 12],
      [21, 12, 8, 12],
      [23, 8, 6, 12], // Ekans
      [27, 8, 6, 12], // Sandshrew
      [56, 6, 10, 12],
      [10, 5, 8, 12],
      [13, 5, 8, 12],
      [11, 4, 9, 12],
      [14, 4, 9, 12],
      [43, 9, 12, 14], // Oddish
      [69, 9, 12, 14], // Bellsprout
      [48, 5, 13, 15], // Venonat
      [63, 5, 9, 12], // Abra
      [16, 6, 11, 15],
      [17, 2, 15, 17],
    ],
    trainers: [
      { name: 'Bug Catcher Cale', team: [[10, 10], [13, 10], [11, 10]] },
      { name: 'Lass Ali', team: [[16, 12], [43, 12], [69, 12]] },
      { name: 'Youngster Timmy', team: [[27, 14], [23, 14]] },
      { name: 'Lass Reli', team: [[32, 16], [29, 16]] },
      { name: 'Camper Ethan', team: [[56, 18]] },
      { name: 'Rocket Grunt', team: [[23, 15], [41, 15]] },
      { name: 'Hiker Franklin', team: [[66, 15], [74, 15]] },
      { name: 'Swimmer Luis', team: [[116, 16], [90, 16]] },
      { name: 'Picnicker Diana', team: [[118, 19]] },
    ],
    gyms: [{ name: 'Misty', role: 'leader', badge: 'Cascade Badge', specialty: 'water', team: [[120, 18], [121, 21]] }],
  }),
  area({
    key: 'routes-5-6',
    name: 'Routes 5 & 6',
    orderIndex: 7,
    banner: { scene: 'plains', flip: true },
    xpToUnlockNext: 70,
    minLevel: 12,
    maxLevel: 18,
    weights: W.busy,
    wild: [
      [16, 18, 13, 17],
      [43, 12, 13, 16],
      [69, 12, 13, 16],
      [52, 12, 10, 16], // Meowth
      [56, 10, 10, 16],
      [63, 5, 10, 15],
      [54, 6, 15, 20], // Psyduck
      [60, 6, 15, 20], // Poliwag
      [118, 5, 15, 20], // Goldeen
      [129, 8, 5, 15], // Magikarp
    ],
    trainers: [
      { name: 'Bug Catcher Keigo', team: [[13, 16], [10, 16], [13, 16]] },
      { name: 'Picnicker Nancy', team: [[19, 16], [25, 16]] },
      { name: 'Camper Jeff', team: [[21, 16], [20, 16]] },
      { name: 'Picnicker Isabelle', team: [[16, 16], [16, 16], [16, 16]] },
      { name: 'Sailor Trevor', team: [[66, 17], [72, 17]] },
      { name: 'Sailor Leonard', team: [[90, 21]] },
      { name: 'Gentleman Arthur', team: [[32, 19], [29, 19]] },
      { name: 'Gentleman Thomas', team: [[58, 18], [77, 18]] },
      { name: 'Fisherman Barny', team: [[72, 17], [120, 17], [90, 17]] },
      { name: 'Lass Ann', team: [[16, 18], [29, 18]] },
      { name: 'Sailor Dwayne', team: [[25, 21], [25, 21]] },
      { name: 'Engineer Baily', team: [[100, 21], [81, 21]] },
      { name: 'Gentleman Tucker', team: [[25, 23]] },
    ],
    gyms: [
      { name: 'Lt. Surge', role: 'leader', badge: 'Thunder Badge', specialty: 'electric', team: [[26, 24], [100, 21], [25, 18]] },
    ],
  }),
  area({
    key: 'digletts-cave-route-11',
    name: "Diglett's Cave & Route 11",
    orderIndex: 8,
    banner: { scene: 'cave', flip: true },
    xpToUnlockNext: 80,
    minLevel: 13,
    maxLevel: 22,
    weights: W.mixed,
    wild: [
      [50, 35, 15, 22], // Diglett
      [51, 4, 22, 25], // Dugtrio
      [21, 15, 13, 17],
      [23, 10, 12, 15],
      [27, 10, 12, 15],
      [96, 12, 9, 15], // Drowzee
    ],
    trainers: [
      { name: 'Gambler Hugo', team: [[60, 18], [116, 18]] },
      { name: 'Gambler Jasper', team: [[69, 18], [43, 18]] },
      { name: 'Youngster Eddie', team: [[23, 21]] },
      { name: 'Engineer Bernie', team: [[81, 18], [81, 18], [82, 18]] },
      { name: 'Youngster Dave', team: [[32, 18], [33, 18]] },
      { name: 'Engineer Braxton', team: [[81, 22]] },
      { name: 'Youngster Dillon', team: [[27, 19], [41, 19]] },
      { name: 'Gambler Dirk', team: [[100, 18], [81, 18]] },
      { name: 'Youngster Yasu', team: [[19, 17], [19, 17], [20, 17]] },
    ],
  }),
  area({
    key: 'routes-9-10',
    name: 'Routes 9 & 10',
    orderIndex: 9,
    banner: { scene: 'mountains', flip: true },
    xpToUnlockNext: 85,
    minLevel: 14,
    maxLevel: 22,
    weights: W.mixed,
    wild: [
      [19, 15, 14, 17],
      [20, 4, 17, 20], // Raticate
      [21, 15, 13, 17],
      [22, 3, 20, 22], // Fearow
      [23, 10, 11, 17],
      [27, 10, 11, 17],
      [100, 12, 14, 17], // Voltorb
      [60, 4, 15, 20],
      [98, 5, 15, 20], // Krabby
      [118, 4, 15, 20],
    ],
    trainers: [
      { name: 'Camper Chris', team: [[58, 21], [37, 21]] },
      { name: 'Picnicker Alicia', team: [[70, 18], [43, 18], [69, 18]] },
      { name: 'Hiker Alan', team: [[74, 21], [95, 21]] },
      { name: 'Bug Catcher Brent', team: [[15, 19], [15, 19]] },
      { name: 'Hiker Jeremy', team: [[66, 20], [95, 20]] },
      { name: 'Picnicker Caitlin', team: [[52, 23]] },
      { name: 'Camper Drew', team: [[19, 19], [23, 19], [27, 19]] },
      { name: 'Pokémaniac Mark', team: [[104, 20], [79, 20]] },
      { name: 'Hiker Clark', team: [[74, 19], [74, 19], [66, 19]] },
    ],
  }),
  area({
    key: 'rock-tunnel',
    name: 'Rock Tunnel',
    orderIndex: 10,
    banner: { scene: 'cave_dark' },
    xpToUnlockNext: 90,
    minLevel: 15,
    maxLevel: 23,
    weights: W.light,
    wild: [
      [41, 25, 15, 17],
      [74, 25, 15, 17],
      [66, 15, 15, 17], // Machop
      [95, 8, 13, 17], // Onix
      [56, 8, 16, 17],
      [42, 3, 20, 23], // Golbat
      [75, 3, 22, 24], // Graveler
    ],
    trainers: [
      { name: 'Hiker Lenny', team: [[74, 19], [66, 19], [74, 19]] },
      { name: 'Pokémaniac Ashton', team: [[104, 23], [79, 23]] },
      { name: 'Picnicker Leah', team: [[69, 22], [35, 22]] },
      { name: 'Hiker Oliver', team: [[95, 20], [95, 20], [74, 20]] },
      { name: 'Picnicker Dana', team: [[52, 20], [43, 20], [16, 20]] },
      { name: 'Pokémaniac Winston', team: [[79, 25]] },
      { name: 'Hiker Dudley', team: [[74, 21], [74, 21], [75, 21]] },
      { name: 'Picnicker Sofia', team: [[39, 21], [16, 21], [52, 21]] },
      { name: 'Hiker Nob', team: [[66, 25]] },
      { name: 'Picnicker Martha', team: [[43, 22], [17, 22]] },
    ],
  }),
  area({
    key: 'routes-7-8',
    name: 'Routes 7 & 8',
    orderIndex: 11,
    banner: { scene: 'sunset' },
    xpToUnlockNext: 105,
    minLevel: 17,
    maxLevel: 26,
    weights: W.busy,
    wild: [
      [16, 14, 17, 20],
      [17, 5, 22, 24],
      [52, 12, 17, 20],
      [23, 7, 17, 19],
      [27, 7, 17, 19],
      [37, 8, 15, 20], // Vulpix
      [58, 8, 15, 20], // Growlithe
      [63, 6, 19, 20],
      [64, 3, 22, 27], // Kadabra
      [43, 8, 19, 22],
      [69, 8, 19, 22],
      [39, 3, 20, 24],
      [133, 2, 25, 25], // Eevee (Celadon gift)
      [137, 2, 26, 26], // Porygon (Game Corner)
    ],
    trainers: [
      { name: 'Gambler Rich', team: [[58, 22], [37, 22]] },
      { name: 'Super Nerd Glenn', team: [[109, 24], [88, 24]] },
      { name: 'Lass Julia', team: [[35, 23], [35, 23]] },
      { name: 'Biker Jaren', team: [[88, 24], [88, 24]] },
      { name: 'Lass Paige', team: [[29, 22], [30, 22]] },
      { name: 'Gambler Stan', team: [[60, 22], [60, 22], [61, 22]] },
      { name: 'Rocket Grunt', team: [[96, 21], [66, 21]] },
      { name: 'Rocket Grunt', team: [[20, 20], [41, 20]] },
      { name: 'Rocket Grunt', team: [[109, 21], [88, 21], [23, 21]] },
      { name: 'Rocket Boss Giovanni', team: [[115, 29], [95, 25], [111, 24]] },
      { name: 'Lass Kay', team: [[69, 23], [70, 23]] },
      { name: 'Beauty Bridget', team: [[43, 21], [69, 21], [43, 21]] },
      { name: 'Cooltrainer Mary', team: [[44, 24], [2, 24]] },
    ],
    gyms: [{ name: 'Erika', role: 'leader', badge: 'Rainbow Badge', specialty: 'grass', team: [[71, 29], [45, 29], [114, 24]] }],
  }),
  area({
    key: 'pokemon-tower',
    name: 'Pokémon Tower',
    orderIndex: 12,
    banner: { scene: 'haunted' },
    xpToUnlockNext: 105,
    minLevel: 15,
    maxLevel: 25,
    weights: W.light,
    wild: [
      [92, 40, 15, 20], // Gastly
      [93, 6, 20, 25], // Haunter
      [104, 12, 15, 17], // Cubone
    ],
    trainers: [
      { name: 'Channeler Hope', team: [[92, 23]] },
      { name: 'Channeler Patricia', team: [[92, 22], [92, 22]] },
      { name: 'Channeler Carly', team: [[93, 23]] },
      { name: 'Channeler Laurel', team: [[92, 24]] },
      { name: 'Channeler Jody', team: [[92, 22], [92, 22], [93, 22]] },
      { name: 'Rocket Grunt', team: [[41, 25], [41, 25], [42, 25]] },
      { name: 'Rocket Grunt', team: [[109, 26], [96, 26]] },
      { name: 'Rival Blue', team: [[17, 25], [8, 25], [58, 23]] },
    ],
  }),
  area({
    key: 'routes-12-15',
    name: 'Routes 12–15',
    orderIndex: 13,
    banner: { scene: 'flowers', flip: true },
    xpToUnlockNext: 120,
    minLevel: 22,
    maxLevel: 30,
    weights: W.mixed,
    wild: [
      [16, 8, 23, 27],
      [17, 8, 25, 29],
      [43, 7, 22, 26],
      [44, 5, 26, 30], // Gloom
      [69, 7, 22, 26],
      [70, 5, 26, 30], // Weepinbell
      [48, 7, 24, 26],
      [49, 4, 27, 30], // Venomoth
      [132, 5, 23, 28], // Ditto
      [143, 2, 30, 30], // Snorlax
      [83, 3, 23, 26], // Farfetch'd
      [129, 7, 15, 25],
      [72, 6, 20, 25], // Tentacool
      [116, 5, 20, 25], // Horsea
      [98, 5, 20, 25],
      [118, 5, 20, 25],
    ],
    trainers: [
      { name: 'Fisherman Ned', team: [[118, 22], [60, 22], [118, 22]] },
      { name: 'Fisherman Chip', team: [[72, 24], [118, 24]] },
      { name: 'Rocker Luca', team: [[100, 29], [101, 29]] },
      { name: 'Bird Keeper Sebastian', team: [[16, 29], [17, 29]] },
      { name: 'Beauty Lola', team: [[19, 27], [25, 27], [19, 27]] },
      { name: 'Biker Lukas', team: [[109, 28], [109, 28], [88, 28]] },
      { name: 'Bird Keeper Perry', team: [[21, 25], [16, 25], [17, 25]] },
      { name: 'Picnicker Alma', team: [[118, 28], [60, 28], [116, 28]] },
      { name: 'Beauty Olivia', team: [[35, 24], [69, 24], [43, 24]] },
    ],
  }),
  area({
    key: 'cycling-road',
    name: 'Cycling Road',
    orderIndex: 14,
    banner: { scene: 'bridge', flip: true },
    xpToUnlockNext: 130,
    minLevel: 24,
    maxLevel: 32,
    weights: W.busy,
    wild: [
      [21, 12, 20, 24],
      [22, 8, 25, 29],
      [84, 15, 24, 28], // Doduo
      [85, 3, 29, 31], // Dodrio
      [19, 8, 20, 24],
      [20, 10, 25, 29],
      [143, 2, 30, 30],
    ],
    trainers: [
      { name: 'Biker Jared', team: [[110, 28], [109, 28], [110, 28]] },
      { name: 'Cue Ball Koji', team: [[66, 29], [56, 29], [66, 29]] },
      { name: 'Cue Ball Luke', team: [[56, 28], [57, 28]] },
      { name: 'Biker Lao', team: [[89, 29]] },
      { name: 'Bird Keeper Robert', team: [[21, 26], [21, 26], [22, 26]] },
      { name: 'Cue Ball Isaiah', team: [[57, 29], [67, 29]] },
      { name: 'Biker Hideo', team: [[109, 29], [88, 29]] },
      { name: 'Bird Keeper Ramiro', team: [[84, 29], [85, 29]] },
      { name: 'Biker Ruben', team: [[88, 28], [109, 28], [89, 28]] },
    ],
  }),
  area({
    key: 'safari-zone',
    name: 'Safari Zone',
    orderIndex: 15,
    banner: { scene: 'swamp' },
    xpToUnlockNext: 140,
    minLevel: 24,
    maxLevel: 33,
    weights: W.mixed,
    wild: [
      [29, 8, 22, 30],
      [30, 5, 28, 31], // Nidorina
      [32, 8, 22, 30],
      [33, 5, 28, 31], // Nidorino
      [102, 10, 24, 28], // Exeggcute
      [111, 8, 25, 28], // Rhyhorn
      [46, 6, 22, 26],
      [47, 4, 27, 30], // Parasect
      [48, 6, 22, 28],
      [49, 4, 30, 32],
      [84, 6, 26, 28],
      [113, 2, 23, 28], // Chansey
      [115, 2, 25, 28], // Kangaskhan
      [123, 2, 23, 28], // Scyther
      [127, 2, 23, 28], // Pinsir
      [128, 2, 25, 28], // Tauros
      [147, 2, 15, 25], // Dratini
      [148, 1, 25, 30], // Dragonair
      [79, 5, 20, 25], // Slowpoke
      [54, 5, 20, 25],
      [119, 3, 25, 30], // Seaking
      [60, 5, 20, 25],
      [129, 5, 5, 15],
    ],
    trainers: [
      { name: 'Juggler Kirk', team: [[64, 34], [122, 34]] },
      { name: 'Tamer Phil', team: [[28, 34], [24, 34]] },
      { name: 'Juggler Nate', team: [[96, 31], [96, 31], [64, 31]] },
      { name: 'Tamer Edgar', team: [[24, 33], [28, 33], [24, 33]] },
      { name: 'Juggler Shawn', team: [[97, 34], [96, 34]] },
      { name: 'Juggler Kayden', team: [[100, 33], [82, 33]] },
      { name: 'Fisherman Elliot', team: [[118, 30], [119, 30]] },
    ],
    gyms: [{ name: 'Koga', role: 'leader', badge: 'Soul Badge', specialty: 'poison', team: [[110, 43], [89, 39], [109, 37]] }],
  }),
  area({
    key: 'silph-co',
    name: 'Silph Co.',
    orderIndex: 16,
    banner: { scene: 'city' },
    xpToUnlockNext: 125,
    minLevel: 29,
    maxLevel: 41,
    weights: W.trainersOnly,
    wild: [],
    trainers: [
      { name: 'Rocket Grunt', team: [[20, 29], [97, 29]] },
      { name: 'Rocket Grunt', team: [[66, 30], [96, 30]] },
      { name: 'Rocket Grunt', team: [[23, 29], [41, 29], [104, 29]] },
      { name: 'Rocket Grunt', team: [[24, 26], [109, 26], [42, 26]] },
      { name: 'Scientist Taylor', team: [[100, 29], [81, 29], [101, 29]] },
      { name: 'Scientist Connor', team: [[88, 33], [110, 33]] },
      { name: 'Scientist Ed', team: [[101, 29], [89, 29], [110, 29]] },
      { name: 'Rival Blue', team: [[6, 40], [130, 38], [18, 37]] },
      { name: 'Rocket Boss Giovanni', team: [[31, 41], [33, 37], [111, 37]] },
      { name: 'Psychic Cameron', team: [[64, 31], [79, 31], [122, 31]] },
      { name: 'Channeler Tasha', team: [[92, 34], [93, 34], [92, 34]] },
      { name: 'Psychic Preston', team: [[79, 34], [79, 34], [80, 34]] },
      { name: 'Psychic Johan', team: [[122, 38], [64, 38]] },
    ],
    gyms: [{ name: 'Sabrina', role: 'leader', badge: 'Marsh Badge', specialty: 'psychic', team: [[65, 43], [64, 38], [49, 38]] }],
  }),
  area({
    key: 'sea-routes-19-20',
    name: 'Sea Routes 19 & 20',
    orderIndex: 17,
    banner: { scene: 'ocean' },
    xpToUnlockNext: 150,
    minLevel: 28,
    maxLevel: 38,
    weights: W.busy,
    wild: [
      [72, 30, 25, 35],
      [73, 6, 35, 40], // Tentacruel
      [116, 8, 25, 30],
      [117, 3, 30, 35], // Seadra
      [90, 8, 25, 30], // Shellder
      [120, 8, 25, 30], // Staryu
      [118, 6, 25, 30],
      [119, 4, 30, 35],
      [98, 6, 25, 30],
      [99, 3, 30, 35], // Kingler
      [129, 8, 15, 25],
      [130, 2, 30, 35], // Gyarados
    ],
    trainers: [
      { name: 'Swimmer Richard', team: [[72, 30], [90, 30]] },
      { name: 'Swimmer Reece', team: [[118, 29], [116, 29], [120, 29]] },
      { name: 'Swimmer Matthew', team: [[60, 30], [61, 30]] },
      { name: 'Swimmer Douglas', team: [[116, 27], [72, 27], [72, 27]] },
      { name: 'Swimmer David', team: [[116, 29], [117, 29]] },
      { name: 'Beauty Anya', team: [[118, 30], [119, 30]] },
      { name: 'Beauty Alice', team: [[60, 28], [118, 28], [119, 28]] },
      { name: 'Swimmer Barry', team: [[90, 31], [91, 31]] },
      { name: 'Beauty Tamara', team: [[121, 33]] },
      { name: 'Swimmer Axle', team: [[98, 33], [99, 33]] },
    ],
  }),
  area({
    key: 'seafoam-islands',
    name: 'Seafoam Islands',
    orderIndex: 18,
    banner: { scene: 'snow_mountains' },
    xpToUnlockNext: 160,
    minLevel: 30,
    maxLevel: 40,
    weights: W.wildOnly,
    bosses: [{ dex: 144, level: 50 }], // Articuno
    wild: [
      [86, 15, 30, 32], // Seel
      [87, 5, 34, 36], // Dewgong
      [79, 10, 28, 32],
      [80, 4, 33, 37], // Slowbro
      [54, 10, 28, 32],
      [55, 4, 33, 37], // Golduck
      [41, 12, 26, 30],
      [42, 6, 30, 36],
      [90, 6, 30, 35],
      [124, 2, 30, 35], // Jynx
      [131, 2, 30, 35], // Lapras
      [116, 5, 30, 35],
      [120, 5, 30, 35],
      [98, 5, 30, 35],
    ],
    trainers: [],
  }),
  area({
    key: 'pokemon-mansion',
    name: 'Pokémon Mansion',
    orderIndex: 19,
    banner: { scene: 'volcano' },
    xpToUnlockNext: 175,
    minLevel: 32,
    maxLevel: 42,
    weights: W.busy,
    wild: [
      [88, 12, 28, 32], // Grimer
      [89, 4, 36, 38], // Muk
      [109, 12, 28, 32], // Koffing
      [110, 4, 36, 38], // Weezing
      [77, 10, 28, 34], // Ponyta
      [58, 8, 30, 34],
      [37, 8, 30, 34],
      [126, 3, 34, 38], // Magmar
      [19, 8, 28, 32],
      [20, 8, 32, 36],
      [132, 5, 30, 34],
      [142, 2, 30, 30], // Aerodactyl (Old Amber)
    ],
    trainers: [
      { name: 'Burglar Simon', team: [[58, 36], [37, 36], [77, 36]] },
      { name: 'Scientist Ivan', team: [[101, 33], [110, 33]] },
      { name: 'Burglar Lewis', team: [[38, 41]] },
      { name: 'Scientist Braydon', team: [[81, 34], [82, 34], [101, 34]] },
      { name: 'Burglar Ramon', team: [[77, 34], [58, 34], [37, 34]] },
      { name: 'Scientist Ted', team: [[101, 29], [101, 29], [110, 29]] },
      { name: 'Super Nerd Erik', team: [[37, 36], [37, 36], [38, 36]] },
      { name: 'Burglar Quinn', team: [[77, 34], [58, 34], [78, 34]] },
      { name: 'Super Nerd Avery', team: [[77, 36], [78, 36]] },
    ],
    gyms: [{ name: 'Blaine', role: 'leader', badge: 'Volcano Badge', specialty: 'fire', team: [[59, 47], [78, 42], [58, 42]] }],
  }),
  area({
    key: 'route-21',
    name: 'Route 21',
    orderIndex: 20,
    banner: { scene: 'beach' },
    xpToUnlockNext: 180,
    minLevel: 30,
    maxLevel: 40,
    weights: W.busy,
    wild: [
      [17, 12, 28, 32],
      [20, 10, 28, 32],
      [114, 10, 28, 32], // Tangela
      [72, 15, 25, 35],
      [73, 4, 35, 40],
      [129, 6, 15, 25],
      [130, 2, 30, 35],
      [118, 5, 25, 30],
      [119, 3, 30, 35],
    ],
    trainers: [
      { name: 'Fisherman Wade', team: [[119, 28], [118, 28], [119, 28]] },
      { name: 'Swimmer Jack', team: [[90, 33], [91, 33]] },
      { name: 'Fisherman Ronald', team: [[129, 30], [130, 30]] },
      { name: 'Swimmer Spencer', team: [[73, 32], [72, 32]] },
      { name: 'Cooltrainer Samuel', team: [[28, 39], [51, 39], [111, 39]] },
      { name: 'Black Belt Atsushi', team: [[66, 40], [67, 40]] },
      { name: 'Cooltrainer Yuji', team: [[28, 38], [51, 38]] },
      { name: 'Tamer Cole', team: [[24, 43], [28, 43]] },
      { name: 'Black Belt Kiyo', team: [[67, 43]] },
      { name: 'Cooltrainer Warren', team: [[105, 39], [111, 39]] },
    ],
    gyms: [{ name: 'Giovanni', role: 'leader', badge: 'Earth Badge', specialty: 'ground', team: [[112, 50], [34, 45], [111, 45]] }],
  }),
  area({
    key: 'victory-road',
    name: 'Victory Road',
    orderIndex: 21,
    banner: { scene: 'cave_dark', flip: true },
    xpToUnlockNext: 205,
    minLevel: 38,
    maxLevel: 47,
    weights: W.busy,
    bosses: [{ dex: 146, level: 50 }], // Moltres
    wild: [
      [66, 10, 38, 42],
      [67, 8, 40, 44], // Machoke
      [74, 10, 38, 42],
      [75, 6, 40, 44],
      [95, 8, 38, 44],
      [41, 6, 36, 40],
      [42, 8, 40, 44],
      [49, 5, 40, 44],
      [105, 5, 40, 44], // Marowak
      [24, 4, 40, 44], // Arbok
      [28, 4, 40, 44], // Sandslash
      [57, 5, 40, 44], // Primeape
      [22, 4, 40, 44],
      [132, 3, 38, 42],
    ],
    trainers: [
      { name: 'Cooltrainer Naomi', team: [[53, 42], [78, 42], [38, 42]] },
      { name: 'Cooltrainer Rolando', team: [[6, 42], [2, 42], [8, 42]] },
      { name: 'Black Belt Daisuke', team: [[67, 43], [66, 43], [67, 43]] },
      { name: 'Juggler Nelson', team: [[97, 41], [64, 41], [64, 41]] },
      { name: 'Tamer Vincent', team: [[53, 44], [55, 44]] },
      { name: 'Cooltrainer George', team: [[103, 42], [91, 42], [59, 42]] },
      { name: 'Cooltrainer Alexa', team: [[36, 42], [87, 42], [113, 42]] },
      { name: 'Pokémaniac Dawson', team: [[5, 40], [131, 40], [108, 40]] },
      { name: 'Juggler Gregory', team: [[122, 48]] },
    ],
  }),
  area({
    key: 'indigo-plateau',
    name: 'Indigo Plateau',
    orderIndex: 22,
    banner: { scene: 'sky' },
    xpToUnlockNext: 100,
    minLevel: 45,
    maxLevel: 55,
    weights: W.trainersOnly,
    wild: [],
    trainers: [
      { name: 'Ace Trainer Jake', team: [[59, 48], [65, 48], [130, 48]] },
      { name: 'Ace Trainer Sara', team: [[121, 47], [124, 47], [36, 47]] },
      { name: 'Ace Trainer Bruce', team: [[68, 49], [76, 49], [112, 49]] },
      { name: 'Ace Trainer Nina', team: [[3, 48], [26, 48], [131, 48]] },
      { name: 'Ace Trainer Kyle', team: [[148, 50], [18, 48], [103, 48]] },
    ],
    gyms: [
      { name: 'Elite Four Lorelei', role: 'elite', specialty: 'ice', team: [[131, 54], [124, 54], [87, 52]] },
      { name: 'Elite Four Bruno', role: 'elite', specialty: 'fighting', team: [[68, 56], [95, 54], [106, 53]] },
      { name: 'Elite Four Agatha', role: 'elite', specialty: 'ghost', team: [[94, 58], [24, 56], [42, 54]] },
      { name: 'Elite Four Lance', role: 'elite', specialty: 'dragon', team: [[149, 60], [142, 58], [148, 54]] },
      { name: 'Champion Blue', role: 'champion', specialty: 'normal', team: [[6, 63], [130, 61], [18, 59]] },
    ],
  }),


  // ---------------------------------------------------------------- endgame (after the Champion)
  // A second lap: a stronger Victory Road to level up for a second Indigo Plateau (Elite Four ~70). Its Champion is
  // the rival — the character the player didn't pick — with the starter strong against theirs at Lv.80.
  area({
    key: 'victory-road-2',
    name: 'Victory Road II',
    orderIndex: 23,
    banner: { scene: 'cave_dark' },
    xpToUnlockNext: 400,
    minLevel: 55,
    maxLevel: 66,
    weights: { wild: 5, trainer: 4, center: 1, item: 1 },
    wild: [
      [68, 8, 58, 62], // Machamp
      [75, 8, 55, 58], // Graveler
      [76, 6, 58, 62], // Golem
      [95, 6, 55, 60], // Onix
      [111, 6, 55, 58], // Rhyhorn
      [112, 5, 60, 64], // Rhydon
      [105, 6, 58, 62], // Marowak
      [42, 8, 55, 60], // Golbat
      [57, 6, 58, 62], // Primeape
      [28, 6, 56, 60], // Sandslash
      [34, 4, 60, 64], // Nidoking
      [31, 4, 60, 64], // Nidoqueen
      [106, 2, 60, 64], // Hitmonlee
      [107, 2, 60, 64], // Hitmonchan
      [126, 3, 60, 64], // Magmar
      [125, 3, 60, 64], // Electabuzz
      [148, 2, 60, 64], // Dragonair
      [142, 2, 62, 66], // Aerodactyl
      [132, 2, 58, 62], // Ditto
    ],
    trainers: [
      { name: 'Cooltrainer Aiden', team: [[59, 60], [121, 60], [103, 60]] },
      { name: 'Cooltrainer Lena', team: [[36, 60], [124, 60], [65, 61]] },
      { name: 'Black Belt Kenji', team: [[106, 60], [107, 60], [68, 62]] },
      { name: 'Hiker Dwayne', team: [[95, 60], [112, 61], [76, 62]] },
      { name: 'Bird Keeper Ross', team: [[22, 60], [85, 61], [18, 60]] },
      { name: 'Psychic Tyron', team: [[64, 60], [97, 60], [65, 62]] },
      { name: 'Tamer Rex', team: [[128, 61], [115, 61], [143, 63]] },
      { name: 'Cooltrainer Ivy', team: [[87, 60], [91, 60], [131, 62]] },
      { name: 'Pokémaniac Hugo', team: [[80, 60], [108, 61], [112, 62]] },
    ],
    loot: [
      ['hyper-potion', 2, 1, 2],
      ['ultra-ball', 2, 1, 2],
      ['max-ether', 1, 1, 1],
      ['ether', 1, 1, 2],
      ['rare-candy', 1, 1, 1],
      ['money', 2, 200, 400],
      ['rare-candy', 1, 2, 2, true],
    ],
  }),
  area({
    key: 'indigo-plateau-2',
    name: 'Indigo Plateau II',
    orderIndex: 24,
    banner: { scene: 'sky', flip: true },
    xpToUnlockNext: 140,
    minLevel: 65,
    maxLevel: 72,
    weights: { trainer: 8, center: 1, item: 1 },
    wild: [],
    trainers: [
      { name: 'Ace Trainer Blake', team: [[135, 67], [59, 67], [130, 68]] },
      { name: 'Ace Trainer Claire', team: [[36, 67], [134, 67], [121, 68]] },
      { name: 'Ace Trainer Marcus', team: [[99, 67], [68, 67], [112, 68]] },
      { name: 'Ace Trainer Rosa', team: [[136, 67], [26, 67], [3, 68]] },
      { name: 'Ace Trainer Dante', team: [[123, 67], [142, 69], [149, 68]] },
      { name: 'Ace Trainer Yuki', team: [[87, 68], [124, 68], [131, 69]] },
      { name: 'Ace Trainer Leon', team: [[128, 68], [65, 68], [143, 70]] },
      { name: 'Ace Trainer Mira', team: [[97, 68], [65, 69], [94, 69]] },
    ],
    // Aces last, so each battle builds to its strongest Pokémon.
    gyms: [
      { name: 'Elite Four Lorelei', role: 'elite', specialty: 'ice', team: [[91, 68], [124, 69], [131, 70]] },
      { name: 'Elite Four Bruno', role: 'elite', specialty: 'fighting', team: [[95, 69], [107, 69], [68, 71]] },
      { name: 'Elite Four Agatha', role: 'elite', specialty: 'ghost', team: [[42, 70], [24, 70], [94, 72]] },
      { name: 'Elite Four Lance', role: 'elite', specialty: 'dragon', team: [[130, 71], [142, 71], [149, 73]] },
      // One per starter; the player meets only theirs. Bulbasaur → Charizard, Charmander → Blastoise, Squirtle → Venusaur.
      { name: 'Champion Rival', role: 'champion', specialty: 'fire', rivalOf: 1, team: [[26, 75], [130, 76], [6, 80]] },
      { name: 'Champion Rival', role: 'champion', specialty: 'water', rivalOf: 4, team: [[26, 75], [59, 76], [9, 80]] },
      { name: 'Champion Rival', role: 'champion', specialty: 'grass', rivalOf: 7, team: [[26, 75], [59, 76], [3, 80]] },
    ],
    loot: [
      ['hyper-potion', 2, 1, 2],
      ['ultra-ball', 1, 1, 2],
      ['max-ether', 1, 1, 1],
      ['rare-candy', 1, 1, 1],
      ['money', 2, 300, 500],
      ['rare-candy', 1, 3, 3, true],
    ],
  }),

  // ---------------------------------------------------------------- hidden areas (condition-based)
  area({
    key: 'power-plant',
    name: 'Power Plant',
    orderIndex: 101,
    banner: { scene: 'factory' },
    hidden: true,
    conditions: [{ kind: 'pokedex', count: 50 }],
    xpToUnlockNext: 75,
    minLevel: 25,
    maxLevel: 36,
    weights: W.wildOnly,
    bosses: [{ dex: 145, level: 50 }], // Zapdos
    wild: [
      [100, 20, 25, 32],
      [101, 6, 33, 36], // Electrode
      [81, 20, 25, 32], // Magnemite
      [82, 6, 33, 36], // Magneton
      [25, 10, 25, 30],
      [26, 3, 33, 36], // Raichu
      [125, 4, 33, 36], // Electabuzz
      [88, 6, 25, 30],
      [89, 3, 33, 36],
    ],
    trainers: [],
  }),
  area({
    key: 'cerulean-cave',
    name: 'Cerulean Cave',
    orderIndex: 102,
    banner: { scene: 'crystal_cave' },
    hidden: true,
    conditions: [{ kind: 'maxLevel', level: 55 }],
    xpToUnlockNext: null,
    minLevel: 50,
    maxLevel: 70,
    weights: W.mixed,
    scalesToTeam: true,
    bosses: [{ dex: 150, level: 70, teamAvgThreshold: 60 }], // Mewtwo
    wild: 'ALL',
    trainers: [
      { name: 'Ace Trainer Nadia', specialty: 'dragon', size: 3 },
      { name: 'Ace Trainer Samuel', specialty: 'fire', size: 3 },
      { name: 'Ace Trainer Mary', specialty: 'water', size: 3 },
      { name: 'Black Belt Daisuke', specialty: 'fighting', size: 3 },
      { name: 'Channeler Hope', specialty: 'ghost', size: 2 },
      { name: 'Tamer Phil', specialty: 'normal', size: 3 },
    ],
  }),
  area({
    key: 'faraway-island',
    name: 'Faraway Island',
    orderIndex: 103,
    banner: { scene: 'beach', flip: true },
    hidden: true,
    conditions: [{ kind: 'pokedex', count: 150 }],
    xpToUnlockNext: null,
    minLevel: 60,
    maxLevel: 70,
    weights: { wild: 0, trainer: 0, center: 100, item: 0 },
    bosses: [{ dex: 151, level: 65, teamAvgThreshold: 0 }], // Mew — waits for you on arrival
    wild: [],
    trainers: [],
  }),
  // Behind the Game Corner poster in Celadon: Rocket Grunts and the slot machine. Opens once Routes 7 & 8 (Celadon) is
  // reached; an 'area' condition names the area by its plan key (the seed turns it into the area's id).
  area({
    key: 'rocket-hideout',
    name: 'Rocket Hideout',
    orderIndex: 104,
    banner: { scene: 'city', flip: true },
    hidden: true,
    conditions: [{ kind: 'area', areaId: 'routes-7-8' }],
    xpToUnlockNext: null,
    minLevel: 19,
    maxLevel: 24,
    weights: { wild: 0, trainer: 5, center: 1, item: 1, casino: 3 },
    wild: [],
    trainers: [
      { name: 'Rocket Grunt', team: [[19, 19], [20, 20]] },
      { name: 'Rocket Grunt', team: [[41, 19], [23, 19], [41, 19]] },
      { name: 'Rocket Grunt', team: [[96, 20], [66, 20]] },
      { name: 'Rocket Grunt', team: [[88, 21], [109, 21]] },
      { name: 'Rocket Grunt', team: [[27, 21], [28, 22]] },
      { name: 'Rocket Grunt', team: [[23, 22], [24, 23]] },
      { name: 'Rocket Grunt', team: [[41, 23], [42, 24]] },
      { name: 'Rocket Grunt', team: [[109, 24], [110, 24]] },
    ],
  }),
]

/** Rarer species get a lower weight in the catch-all pool (Cerulean Cave), the three starters included. */
export const RARE_IN_CATCH_ALL = new Set([
  1, 4, 7, 83, 113, 115, 123, 127, 128, 131, 132, 133, 137, 138, 139, 140, 141, 142, 143, 147, 148, 149,
])
