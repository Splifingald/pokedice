/**
 * The side quests' content (docs/61): Snowpoint Temple's three Regis, the roadblock bosses, the Pokémon posing as
 * items, the Safari areas and the set moments (rivals and gift Pokémon).
 *
 * This file is the single source of that content for the bundle. `tsx scripts/patch-side-quests.ts --data` patches
 * src/data in place (then `pnpm seed-sql` writes supabase/seed.sql from it); the live database gets the same rows from
 * the migrations 0108 to 0112, which hold the same values. Safe to run again: every step looks before it writes.
 *
 * `pnpm seed-regions` rebuilds a region's content from its script and would undo what lands in that region; run this
 * with `--data` again after it.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area, BossDef, GiftMoment, RivalMeeting, Species, Trainer, UnlockCondition } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')

export interface SideQuestBundle {
  areas: Area[]
  trainers?: Trainer[]
  pokemon?: Species[]
}

// ---------------------------------------------------------------- 1. Regigigas (docs/61 §1, migration 0108)

export const SNOWPOINT_TEMPLE = '10a7f721-2f52-58c4-bba1-728e2f88d763'
export const REGIS: UnlockCondition = { kind: 'caught', dex: [377, 378, 379] }

export function withRegis(b: SideQuestBundle): void {
  const temple = b.areas.find((a) => a.id === SNOWPOINT_TEMPLE)
  if (!temple) return
  const conds = temple.unlockConditions ?? []
  if (!conds.some((c) => c.kind === 'caught')) temple.unlockConditions = [...conds, REGIS]
}

// ---------------------------------------------------------------- 2. Roadblocks (docs/61 §2, migration 0109)

/** The Pokémon across a road, as its area's boss; it leaves that area's wild pool (the boss replaces it). */
export const ROADBLOCKS: { areaId: string; area: string; boss: BossDef }[] = [
  { areaId: 'ff3f0086-1b99-559e-a646-e88006eec749', area: 'Routes 12–15', boss: { dex: 143, level: 30, roadblock: 'sleeping' } },
  { areaId: '61bfb445-9bdc-5e47-9c3a-f379bd33a06b', area: 'Routes 35–37', boss: { dex: 185, level: 20, roadblock: 'tree' } },
  {
    areaId: 'e34791dd-2b08-51ef-9c9f-be18cea0524b',
    area: 'Fortree City & Routes 120–121',
    boss: { dex: 352, level: 30, roadblock: 'invisible' },
  },
  {
    areaId: '77afa3c1-7785-5e6f-a3cc-f249ec9af432',
    area: 'Route 7 & the Connecting Cave',
    boss: { dex: 143, level: 15, roadblock: 'sleeping' },
  },
]

export function withRoadblocks(b: SideQuestBundle): void {
  for (const r of ROADBLOCKS) {
    const area = b.areas.find((a) => a.id === r.areaId)
    if (!area) continue
    if (area.name !== r.area) throw new Error(`Roadblock: ${r.areaId} is ${area.name}, not ${r.area}`)
    const bosses = area.legendaryBoss ?? []
    if (!bosses.some((x) => x.dex === r.boss.dex)) area.legendaryBoss = [...bosses, r.boss]
    area.wildPool = area.wildPool.filter((w) => w.dex !== r.boss.dex)
  }
}

// ---------------------------------------------------------------- 3. Pokémon posing as items (docs/61 §3, migration 0110)

/**
 * A loot row that looks like a Poké Ball and springs out as the Pokémon: the levels of that Pokémon in the area's wild
 * pool (the area's range where it isn't wild there), and enough copies that about a quarter of the area's finds are a
 * disguise. Ids are `stableUuid('disguise:<area id>:<dex>')`.
 */
export const DISGUISES: { id: string; areaId: string; area: string; dex: number; minLevel: number; maxLevel: number; weight: number }[] = [
  { id: 'ac4762ac-52d0-5cb5-a237-1fffa7e1e1d3', areaId: 'bf32fe1a-051d-517b-83c3-55bd24b8e077', area: 'Power Plant', dex: 100, minLevel: 25, maxLevel: 32, weight: 2 },
  { id: '271d2ecb-a1ec-54b6-9e66-dc1a6c118dac', areaId: 'bf32fe1a-051d-517b-83c3-55bd24b8e077', area: 'Power Plant', dex: 101, minLevel: 33, maxLevel: 36, weight: 2 },
  { id: '3278e5ac-76c1-5399-8619-397dc62edcd0', areaId: '9046f263-c9c8-537c-9548-133e08237781', area: 'Mahogany Town & the Team Rocket HQ', dex: 100, minLevel: 33, maxLevel: 39, weight: 16 },
  { id: '30953001-6060-5359-a922-36c7ea4c0a66', areaId: '9046f263-c9c8-537c-9548-133e08237781', area: 'Mahogany Town & the Team Rocket HQ', dex: 101, minLevel: 35, maxLevel: 41, weight: 16 },
  { id: 'cc331cf8-fc26-5b16-958a-f123495650de', areaId: 'f4125979-a6a1-5086-9a5a-5314568b77a9', area: 'Mauville City', dex: 100, minLevel: 18, maxLevel: 24, weight: 32 },
  { id: '56f72fe5-e1dd-59ac-9181-e25d3eb33fa7', areaId: '0935501c-7f1e-5cf5-a84f-0b04fc538632', area: 'The Magma & Aqua Hideouts', dex: 101, minLevel: 36, maxLevel: 45, weight: 30 },
  { id: '8d04b152-b23b-5c37-b009-de0bf1055105', areaId: '0f04ef44-9fa0-57a3-b121-3b883b80e4b3', area: 'Route 13 & the Kalos Power Plant', dex: 100, minLevel: 27, maxLevel: 29, weight: 32 },
  { id: '35c80365-6e31-5113-a33a-d0cb4e0e6bfa', areaId: '8b1e0609-a1b6-5392-ba40-54c23b592aac', area: 'Driftveil City & Route 6', dex: 590, minLevel: 26, maxLevel: 31, weight: 32 },
  { id: '2f62d186-c3bd-5d48-8749-8d09c4238542', areaId: 'a703817b-8a2f-5bdb-8e08-898f6db6e1b5', area: 'Mistralton City & Route 7', dex: 590, minLevel: 30, maxLevel: 35, weight: 32 },
  { id: 'ef9fdc57-ba18-5810-8b43-98d62ff05ed9', areaId: 'e22227a1-ae4f-5c8f-aa5a-141aeef63db6', area: 'Icirrus City & the Moor of Icirrus', dex: 591, minLevel: 35, maxLevel: 40, weight: 32 },
  { id: 'ff71b70c-4aaf-55d6-b6e1-f9f6ed2ff284', areaId: '1f3afed9-f2be-5b47-82c5-e281ba2584ae', area: 'The Giant Chasm', dex: 591, minLevel: 60, maxLevel: 68, weight: 29 },
]

/** The item a disguise looks like. */
export const DISGUISE_ITEM = 'poke-ball'

export function withDisguises(b: SideQuestBundle): void {
  for (const d of DISGUISES) {
    const area = b.areas.find((a) => a.id === d.areaId)
    if (!area) continue
    if (area.name !== d.area) throw new Error(`Disguise: ${d.areaId} is ${area.name}, not ${d.area}`)
    if (area.lootPool.some((l) => l.id === d.id)) continue
    area.lootPool = [
      ...area.lootPool,
      {
        id: d.id,
        itemKey: DISGUISE_ITEM,
        weight: d.weight,
        unique: false,
        minQty: 1,
        maxQty: 1,
        disguise: { dex: d.dex, minLevel: d.minLevel, maxLevel: d.maxLevel },
      },
    ]
  }
}

// ---------------------------------------------------------------- 4. The Safaris (docs/61 §4, migration 0111)

/** Kanto's "Safari Zone" held Fuchsia's Gym too: it keeps its id, progress and Koga as Fuchsia City (trainers only). */
export const FUCHSIA_CITY = '2238f26a-2629-5f28-af07-e74cb41d5f7a'
/** Kanto's Safari Zone, split off: a secret area of its own (`stableUuid('area:kanto-safari-zone')`). */
export const KANTO_SAFARI = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'
export const HOENN_SAFARI = 'd5fe2203-9a4f-5874-99c6-005b01b42ece'
export const GREAT_MARSH = '132bb05f-9768-59fb-89de-b25ecb1acc45'
export const FRIEND_SAFARI = 'cb642e3e-986b-5430-b507-7baf6cc0567b'
const FORTREE = 'e34791dd-2b08-51ef-9c9f-be18cea0524b'
const PASTORIA = '67b3b539-dd5b-5c9a-96d4-60e4d8b8d188'
const KILOUDE = 'a3a909e6-bd11-52cd-8d21-bc6a6aa8992d'

/** The new Safari's finds: Balls and pocket money for its rounds (nothing heals: nothing hurts there). */
export const KANTO_SAFARI_LOOT = [
  { id: 'dcc370fd-62b2-53f9-aa28-49aa3134c009', itemKey: 'poke-ball', weight: 4, unique: false, minQty: 2, maxQty: 3 },
  { id: 'cb20f0b9-da4b-594a-a678-450d03ed770b', itemKey: 'great-ball', weight: 3, unique: false, minQty: 1, maxQty: 2 },
  { id: 'c11f996f-f818-5b78-a861-35f6faab7693', itemKey: 'ultra-ball', weight: 1, unique: false, minQty: 1, maxQty: 1 },
  { id: '73301700-6705-5c69-a182-7aa6e9a72dc1', itemKey: 'money', weight: 3, unique: false, minQty: 100, maxQty: 300 },
]

const SAFARI_MODE = { kind: 'safari' } as const

/**
 * A Safari as a secret mini game: no rounds to clear, no Center, trainer or real player's card in its deck (docs/54's
 * `versus`), its own mode. The same again changes nothing.
 */
function asSafari(area: Area, unlock: UnlockCondition[] | null): void {
  area.hidden = true
  if (unlock) area.unlockConditions = unlock
  area.roundsToClear = null
  const versus = 'versus' in area.encounterWeights ? { versus: 0 } : {}
  area.encounterWeights = { ...area.encounterWeights, center: 0, trainer: 0, ...versus }
  area.mode = SAFARI_MODE
}

/** Trainers of a Safari go to the town beside it (the Great Marsh's Rangers to Pastoria, the Friend Safari's to Kiloude). */
function moveTrainers(b: SideQuestBundle, from: string, to: string): void {
  const src = b.areas.find((a) => a.id === from)
  const dst = b.areas.find((a) => a.id === to)
  if (!src || !dst || !src.trainerPool.length) return
  // In front: the double battles' pairs (scripts/patch-double-battles.ts) are added at the end of a pool.
  dst.trainerPool = [...src.trainerPool.filter((e) => !dst.trainerPool.some((x) => x.id === e.id)), ...dst.trainerPool]
  src.trainerPool = []
}

export function withSafaris(b: SideQuestBundle): void {
  const fuchsia = b.areas.find((a) => a.id === FUCHSIA_CITY)
  if (fuchsia && fuchsia.name === 'Safari Zone' && !b.areas.some((a) => a.id === KANTO_SAFARI)) {
    const order = Math.max(...b.areas.map((a) => a.orderIndex)) + 1
    b.areas.push({
      ...fuchsia,
      id: KANTO_SAFARI,
      orderIndex: order,
      name: 'Safari Zone',
      hidden: true,
      unlockConditions: [{ kind: 'area', areaId: FUCHSIA_CITY }],
      roundsToClear: null,
      encounterWeights: { wild: 6, item: 2, center: 0, trainer: 0, casino: 0 },
      legendaryBoss: null,
      gyms: [],
      wildPool: fuchsia.wildPool,
      trainerPool: [],
      lootPool: KANTO_SAFARI_LOOT.map((l) => ({ ...l })),
      battleBackground: 'grass',
      mode: SAFARI_MODE,
    })
    Object.assign(fuchsia, {
      name: 'Fuchsia City',
      wildPool: [],
      encounterWeights: { wild: 0, item: 2, center: 1, trainer: 5, casino: 0 },
      roundsToClear: 1,
      minLevel: 30,
      maxLevel: 34,
      battleBackground: 'default',
    })
  }
  const hoenn = b.areas.find((a) => a.id === HOENN_SAFARI)
  const plain = (a: Area | undefined): a is Area => !!a && (!a.mode || a.mode.kind === 'safari')
  if (plain(hoenn)) asSafari(hoenn, [{ kind: 'area', areaId: FORTREE }])
  const marsh = b.areas.find((a) => a.id === GREAT_MARSH)
  if (plain(marsh)) {
    moveTrainers(b, GREAT_MARSH, PASTORIA)
    asSafari(marsh, [{ kind: 'area', areaId: PASTORIA }])
  }
  const friend = b.areas.find((a) => a.id === FRIEND_SAFARI)
  if (plain(friend)) {
    moveTrainers(b, FRIEND_SAFARI, KILOUDE)
    asSafari(friend, null)
  }
}

// ---------------------------------------------------------------- 5. Set moments: rivals and gifts (docs/61 §5, migration 0112)

/** A place, by region and the area's name (resolved to its id when the content is written). */
type Place = [region: string, area: string]

/** Kanto's rival picks the starter strong against yours; so do Silver, May (or Brendan) and Barry. */
const RIVAL_STARTER: Record<string, Record<number, number>> = {
  kanto: { 1: 4, 4: 7, 7: 1 },
  johto: { 152: 155, 155: 158, 158: 152 },
  hoenn: { 252: 255, 255: 258, 258: 252 },
  sinnoh: { 387: 390, 390: 393, 393: 387 },
}

/** A new rival meeting: per player starter (`rivalOf`), its team; `S` in a team is the rival's starter at that level. */
interface NewRival {
  key: string
  place: Place
  round: number
  after: number
  name: string
  sprite: string
  /** [dex or 'S', level]; per rival starter when `by` is set (partners differ by the rival's starter). */
  team: [number | 'S', number][]
  by?: Record<number, [number | 'S', number][]>
  /** One version for everyone (Wally). */
  single?: boolean
}

const BLUE = '/trainers/classes/blue-1.png'
const SILVER = '/trainers/classes/johto/silver.png'
const MAY = '/trainers/classes/hoenn/may.png'
const WALLY = '/trainers/classes/hoenn/wally.png'
const BARRY = '/trainers/classes/sinnoh/barry.png'

/**
 * The rivals' new meetings, from the originals (the top three at each meeting, at the area's level; docs/61 §5.2):
 * Blue's (Red and Blue), Silver's (Gold and Silver), May's (Emerald; Brendan for a player in Green's look), Wally's and
 * Barry's first. Blue's partners follow his starter as in the games: Exeggcute and Gyarados with Charmander, Growlithe and
 * Exeggcute with Squirtle, Gyarados and Growlithe with Bulbasaur; May's: Lotad with Torchic, Shroomish with Mudkip, Numel
 * with Treecko.
 */
export const NEW_RIVALS: NewRival[] = [
  { key: 'kanto-22', place: ['kanto', 'Routes 22 & 2'], round: 0, after: 3, name: 'Rival Blue', sprite: BLUE, team: [[16, 6], ['S', 7]] },
  { key: 'kanto-cerulean', place: ['kanto', 'Route 4 & Nugget Bridge'], round: 0, after: 2, name: 'Rival Blue', sprite: BLUE, team: [[17, 18], [63, 16], ['S', 19]] },
  { key: 'kanto-ss-anne', place: ['kanto', 'Routes 5 & 6'], round: 0, after: 2, name: 'Rival Blue', sprite: BLUE, team: [[17, 21], [64, 20], ['S', 23]] },
  { key: 'kanto-route-22-again', place: ['kanto', 'Route 21'], round: 0, after: 2, name: 'Rival Blue', sprite: BLUE, team: [[18, 44], [65, 45], ['S', 47]] },
  { key: 'johto-cherrygrove', place: ['johto', 'Routes 30 & 31'], round: 0, after: 3, name: 'Silver', sprite: SILVER, team: [['S', 6]] },
  { key: 'johto-azalea', place: ['johto', 'Azalea Town'], round: 0, after: 2, name: 'Silver', sprite: SILVER, team: [[92, 14], [41, 15], ['S', 17]] },
  { key: 'johto-burned-tower', place: ['johto', 'Ecruteak City & the Burned Tower'], round: 0, after: 2, name: 'Silver', sprite: SILVER, team: [[93, 27], [81, 26], ['S', 29]] },
  { key: 'johto-radio-tower', place: ['johto', 'Mahogany Town & the Team Rocket HQ'], round: 0, after: 2, name: 'Silver', sprite: SILVER, team: [[215, 40], [42, 40], ['S', 42]] },
  { key: 'johto-victory-road', place: ['johto', 'Victory Road'], round: 0, after: 2, name: 'Silver', sprite: SILVER, team: [[82, 48], [42, 48], ['S', 50]] },
  { key: 'hoenn-route-103', place: ['hoenn', 'Routes 102 & 103'], round: 0, after: 3, name: 'May', sprite: MAY, team: [['S', 6]] },
  {
    key: 'hoenn-rustboro',
    place: ['hoenn', 'Rustboro City'],
    round: 0,
    after: 2,
    name: 'May',
    sprite: MAY,
    team: [],
    by: { 255: [[278, 13], [270, 13], ['S', 15]], 258: [[278, 13], [285, 13], ['S', 15]], 252: [[278, 13], [322, 13], ['S', 15]] },
  },
  {
    key: 'hoenn-route-110',
    place: ['hoenn', 'Slateport City & Route 110'],
    round: 0,
    after: 2,
    name: 'May',
    sprite: MAY,
    team: [],
    by: { 255: [[278, 21], [271, 21], ['S', 23]], 258: [[278, 21], [285, 21], ['S', 23]], 252: [[278, 21], [322, 21], ['S', 23]] },
  },
  {
    key: 'hoenn-route-119',
    place: ['hoenn', 'Routes 118 & 119'],
    round: 0,
    after: 2,
    name: 'May',
    sprite: MAY,
    team: [],
    by: { 255: [[279, 36], [272, 36], ['S', 38]], 258: [[279, 36], [286, 36], ['S', 38]], 252: [[279, 36], [323, 36], ['S', 38]] },
  },
  {
    key: 'hoenn-lilycove',
    place: ['hoenn', 'Lilycove City, Route 124 & Shoal Cave'],
    round: 0,
    after: 2,
    name: 'May',
    sprite: MAY,
    team: [],
    by: { 255: [[279, 45], [272, 45], ['S', 47]], 258: [[279, 45], [286, 45], ['S', 47]], 252: [[279, 45], [323, 45], ['S', 47]] },
  },
  { key: 'hoenn-wally-mauville', place: ['hoenn', 'Mauville City'], round: 0, after: 2, name: 'Wally', sprite: WALLY, team: [[281, 25]], single: true },
  { key: 'hoenn-wally-victory-road', place: ['hoenn', 'Victory Road'], round: 0, after: 2, name: 'Wally', sprite: WALLY, team: [[334, 53], [315, 53], [282, 55]], single: true },
  { key: 'sinnoh-route-201', place: ['sinnoh', 'Route 201 & Lake Verity'], round: 0, after: 2, name: 'Barry', sprite: BARRY, team: [['S', 5]] },
]

/**
 * Kanto's two meetings with Blue already in the game (Pokémon Tower, Silph Co.): the rows there are one version each
 * (Squirtle's at the Tower, Charmander's at Silph Co.); the other two versions join them.
 */
export const BLUE_VERSIONS: { id: string; place: Place; rivalOf: number; others: Record<number, [number, number][]> }[] = [
  {
    id: '8ac18ebf-ef70-5887-9076-1714e5870d7b',
    place: ['kanto', 'Pokémon Tower'],
    rivalOf: 4,
    others: { 1: [[5, 25], [17, 25], [102, 23]], 7: [[2, 25], [17, 25], [130, 23]] },
  },
  {
    id: '82eb7a7a-2fa5-5a69-9e84-a56fb850da5d',
    place: ['kanto', 'Silph Co.'],
    rivalOf: 1,
    others: { 4: [[9, 40], [58, 38], [18, 37]], 7: [[3, 40], [130, 38], [18, 37]] },
  },
]

/** The rivals already in a region's trainer pools (a random card today): each becomes a meeting where it is. */
export const POOL_RIVALS: Record<string, string[]> = {
  sinnoh: ['Barry'],
  unova: ['Cheren', 'Bianca'],
  kalos: ['Shauna', 'Tierno', 'Trevor'],
  alola: ['Hau', 'Gladion'],
  galar: ['Hop', 'Bede', 'Marnie'],
  paldea: ['Nemona'],
}

/** A gift (docs/61 §5.3), by place; the content writes its area's id. */
interface GiftPlan extends Omit<GiftMoment, 'areaId'> {
  place: Place
}

const G = (p: string) => `/trainers/classes/${p}.png`
/** The Odd Egg's babies (Crystal): Pichu, Cleffa, Igglybuff, Tyrogue, Smoochum, Elekid, Magby. */
const ODD_EGG = [172, 173, 174, 236, 238, 239, 240]

export const GIFTS: GiftPlan[] = [
  { id: 'gift-magikarp', place: ['kanto', 'Mt. Moon'], round: 0, after: 1, giver: 'Gentleman', sprite: G('gentleman'), dex: [129], level: 5, price: 500 },
  { id: 'gift-eevee-celadon', place: ['kanto', 'Routes 7 & 8'], round: 0, after: 3, giver: 'Lady', sprite: G('lady'), dex: [133] },
  { id: 'gift-hitmon', place: ['kanto', 'Silph Co.'], round: 0, after: 1, giver: 'Black Belt', sprite: G('karateka'), dex: [106, 107] },
  { id: 'gift-lapras-silph', place: ['kanto', 'Silph Co.'], round: 0, after: 4, giver: 'Scientist', sprite: G('scientist'), dex: [131] },
  { id: 'gift-togepi-egg', place: ['johto', 'Violet City & Sprout Tower'], round: 0, after: 2, giver: 'Scientist', sprite: G('johto/scientist'), dex: [175], egg: true },
  { id: 'gift-eevee-bill', place: ['johto', 'Goldenrod City'], round: 0, after: 2, giver: 'Bill', sprite: G('super-nerd'), dex: [133] },
  { id: 'gift-odd-egg', place: ['johto', 'Route 34 & the Day Care'], round: 0, after: 2, giver: 'Gentleman', sprite: G('johto/gentleman'), dex: ODD_EGG, egg: true, shinyChance: 0.14 },
  { id: 'gift-shuckle', place: ['johto', 'Cianwood City'], round: 0, after: 2, giver: 'Pokémaniac Kirk', sprite: G('pokemaniac'), dex: [213] },
  { id: 'gift-dratini', place: ['johto', "Blackthorn City & the Dragon's Den"], round: 0, after: 2, giver: 'Sage', sprite: G('johto/sage'), dex: [147] },
  { id: 'gift-wynaut-egg', place: ['hoenn', 'Lavaridge Town'], round: 0, after: 2, giver: 'Lady', sprite: G('hoenn/lady'), dex: [360], egg: true },
  { id: 'gift-castform', place: ['hoenn', 'Routes 118 & 119'], round: 0, after: 4, giver: 'Scientist', sprite: G('scientist'), dex: [351] },
  { id: 'gift-beldum', place: ['hoenn', 'Mossdeep City & the Space Center'], round: 0, after: 2, giver: 'Steven', sprite: G('hoenn/steven'), dex: [374] },
  { id: 'gift-togepi-egg-sinnoh', place: ['sinnoh', 'Eterna City & the Galactic Building'], round: 0, after: 2, giver: 'Champion Cynthia', sprite: G('sinnoh/champion-cynthia'), dex: [175], egg: true },
  { id: 'gift-happiny-egg', place: ['sinnoh', 'Hearthome City'], round: 0, after: 1, giver: 'Hiker', sprite: G('sinnoh/hiker'), dex: [440], egg: true },
  { id: 'gift-eevee-bebe', place: ['sinnoh', 'Hearthome City'], round: 0, after: 4, giver: 'Lady', sprite: G('sinnoh/lady'), dex: [133] },
  { id: 'gift-porygon', place: ['sinnoh', 'Veilstone City & the Galactic HQ'], round: 0, after: 2, giver: 'Scientist', sprite: G('sinnoh/scientist'), dex: [137] },
  { id: 'gift-riolu-egg', place: ['sinnoh', 'Canalave City & Iron Island'], round: 0, after: 2, giver: 'Riley', sprite: G('sinnoh/riley'), dex: [447], egg: true },
  {
    id: 'gift-monkey',
    place: ['unova', 'Striaton City & the Dreamyard'],
    round: 0,
    after: 2,
    giver: 'Lady',
    sprite: G('unova/lady'),
    dex: [511, 513, 515],
    // Black and White: the monkey that beats the Striaton leader your starter faces.
    byStarter: { 495: 515, 498: 511, 501: 513 },
  },
  { id: 'gift-kanto-starter', place: ['kalos', 'Routes 4 & 22 and Lumiose City South'], round: 0, after: 2, giver: 'Professor Sycamore', sprite: G('kalos/sycamore'), dex: [1, 4, 7] },
  { id: 'gift-lucario', place: ['kalos', 'Route 11, Reflection Cave & Shalour City'], round: 0, after: 2, giver: 'Korrina', sprite: G('kalos/korrina'), dex: [448] },
  { id: 'gift-lapras-kalos', place: ['kalos', 'Route 12, Azure Bay & Coumarine City'], round: 0, after: 2, giver: 'Fisherman', sprite: G('kalos/fisherman'), dex: [131] },
  { id: 'gift-eevee-egg', place: ['alola', 'Heahea City & Routes 4–6'], round: 0, after: 2, giver: 'Pokémon Breeder', sprite: G('alola/breeder-f'), dex: [133], egg: true },
  { id: 'gift-type-null', place: ['alola', 'Aether Paradise'], round: 0, after: 2, giver: 'Gladion', sprite: G('alola/gladion'), dex: [772] },
  { id: 'gift-toxel-egg', place: ['galar', 'Route 5 & Hulbury'], round: 0, after: 2, giver: 'Pokémon Breeder', sprite: G('galar/breeder-f'), dex: [848], egg: true },
]

/** Kalos's page can be filled though Sycamore's gift is one of three: the Kanto starters, rare in the Friend Safari. */
export const FRIEND_SAFARI_STARTERS = [1, 4, 7].map((dex) => ({ id: stableUuid(`wild:friend-safari:${dex}`), dex }))

const areaOf = (b: SideQuestBundle, [region, name]: Place): Area => {
  const a = b.areas.find((x) => (x.regionId ?? 'kanto') === region && x.name === name)
  if (!a) throw new Error(`No area ${region}: ${name}`)
  return a
}

/** A species at a level, evolved as far as its level evolutions go by then (a rival's starter). */
function evolvedAt(b: SideQuestBundle, dex: number, level: number): number {
  let d = dex
  for (let i = 0; i < 3; i++) {
    const next = b.pokemon?.find((p) => p.dex === d)?.evolutions?.find((e) => e.level != null && e.level <= level)
    if (!next) break
    d = next.toDex
  }
  return d
}

/** Each new rival's trainer rows: one per player starter, or one for everyone. Ids are stable. */
export function rivalTrainers(b: SideQuestBundle): { meeting: string; place: Place; round: number; after: number; trainers: Trainer[] }[] {
  return NEW_RIVALS.map((r) => {
    const region = r.place[0]
    const versions = r.single ? [null] : Object.keys(RIVAL_STARTER[region] ?? {}).map(Number)
    const trainers = versions.map((player) => {
      const rivalStarter = player == null ? null : RIVAL_STARTER[region]![player]!
      const team = (rivalStarter != null && r.by ? r.by[rivalStarter] : r.team) ?? r.team
      return {
        id: stableUuid(`rival:${r.key}:${player ?? 'all'}`),
        name: r.name,
        spriteUrl: r.sprite,
        team: team.map(([d, level]) => ({ dex: d === 'S' ? evolvedAt(b, rivalStarter!, level) : d, level })),
        role: 'trainer' as const,
        badge: null,
        upgradeLevel: null,
        battleBackground: null,
        ...(player != null && { rivalOf: player }),
      } as Trainer
    })
    return { meeting: `rival-${r.key}`, place: r.place, round: r.round, after: r.after, trainers }
  })
}

/** Blue's other versions at the Tower and Silph Co. */
export function blueVersions(b: SideQuestBundle): { place: Place; base: Trainer; trainers: Trainer[] }[] {
  return BLUE_VERSIONS.flatMap((v) => {
    const area = areaOf(b, v.place)
    const base = (b.trainers ?? []).find(
      (t) => t.name === 'Rival Blue' && area.trainerPool.some((e) => e.trainerId === t.id),
    )
    if (!base) return []
    const others = Object.entries(v.others).map(([player, team]) => ({
      ...base,
      id: stableUuid(`rival:blue:${area.id}:${player}`),
      team: team.map(([dex, level]) => ({ dex, level })),
      rivalOf: Number(player),
    }))
    return [{ place: v.place, base: { ...base, rivalOf: v.rivalOf }, trainers: others }]
  })
}

/** The meetings and gifts as the game's own content (src/engine/momentsContent.ts), every area by its id. */
export function momentsContent(b: SideQuestBundle): { meetings: RivalMeeting[]; gifts: GiftMoment[] } {
  const meetings: RivalMeeting[] = []
  for (const r of rivalTrainers(b)) {
    const area = areaOf(b, r.place)
    meetings.push({ id: r.meeting, areaId: area.id, round: r.round, after: r.after, trainers: r.trainers.map((t) => t.id) })
  }
  for (const v of blueVersions(b)) {
    const area = areaOf(b, v.place)
    meetings.push({ id: `rival-blue-${area.id.slice(0, 8)}`, areaId: area.id, round: 0, after: 2, trainers: [v.base.id, ...v.trainers.map((t) => t.id)] })
  }
  // The rivals already in the pools: a meeting where each one is, the second of an area a little later.
  for (const [region, names] of Object.entries(POOL_RIVALS)) {
    for (const area of b.areas.filter((a) => (a.regionId ?? 'kanto') === region && !a.hidden).sort((x, y) => x.orderIndex - y.orderIndex)) {
      let after = 2
      for (const e of area.trainerPool) {
        const t = (b.trainers ?? []).find((x) => x.id === e.trainerId)
        if (!t || !names.includes(t.name)) continue
        meetings.push({ id: `rival-${t.id.slice(0, 8)}`, areaId: area.id, round: 0, after, trainers: [t.id] })
        after += 2
      }
    }
  }
  const gifts = GIFTS.map(({ place, ...g }) => ({ ...g, areaId: areaOf(b, place).id }))
  return { meetings, gifts }
}

export function withMoments(b: SideQuestBundle): void {
  if (!b.trainers || !b.pokemon) return
  const have = new Set(b.trainers.map((t) => t.id))
  // New rows go first: the double battles' pairs (scripts/patch-double-battles.ts) are added at the end of the list.
  const added: Trainer[] = []
  for (const r of rivalTrainers(b)) for (const t of r.trainers) if (!have.has(t.id)) added.push(t)
  for (const v of blueVersions(b)) {
    const base = b.trainers.find((t) => t.id === v.base.id)
    if (base && base.rivalOf == null) base.rivalOf = v.base.rivalOf
    for (const t of v.trainers) if (!have.has(t.id)) added.push(t)
  }
  b.trainers.unshift(...added)
  const friend = b.areas.find((a) => a.id === FRIEND_SAFARI)
  if (friend)
    for (const s of FRIEND_SAFARI_STARTERS)
      if (!friend.wildPool.some((w) => w.dex === s.dex))
        friend.wildPool.push({ id: s.id, dex: s.dex, weight: 3, minLevel: friend.minLevel, maxLevel: friend.maxLevel })
}

// ---------------------------------------------------------------- the whole patch

export function patchSideQuests(b: SideQuestBundle): void {
  withRegis(b)
  withRoadblocks(b)
  withDisguises(b)
  withSafaris(b)
  withMoments(b)
}

/** The data files are written as the seed writes them: one space of indent and a final newline. */
const write = (file: string, value: unknown) => writeFile(path.join(DATA, file), JSON.stringify(value, null, 1) + '\n')
const read = async <T>(file: string): Promise<T> => JSON.parse(await readFile(path.join(DATA, file), 'utf8')) as T

async function main() {
  if (!process.argv.includes('--data')) {
    console.log('Usage: tsx scripts/patch-side-quests.ts --data')
    process.exit(1)
  }
  const b: SideQuestBundle = {
    areas: await read<Area[]>('areas.json'),
    trainers: await read<Trainer[]>('trainers.json'),
    pokemon: await read<Species[]>('pokemon.json'),
  }
  patchSideQuests(b)
  await write('areas.json', b.areas)
  await write('trainers.json', b.trainers)
  // The meetings and gifts are the game's own (docs/61 §5): written as code, the database holding only their switches.
  const { meetings, gifts } = momentsContent(b)
  const prettier = await import('prettier')
  const file = path.join(ROOT, 'src', 'engine', 'momentsContent.ts')
  const options = { ...(await prettier.resolveConfig(file)), filepath: file }
  await writeFile(
    file,
    await prettier.format(
      `// Generated by \`tsx scripts/patch-side-quests.ts --data\` (docs/61 §5): the rivals' meetings and the gifts, the game's
// own content. The database holds only their switches. Do not edit by hand: edit the script and run it again.
import type { GiftMoment, RivalMeeting } from './types'

export const RIVAL_MEETINGS: RivalMeeting[] = ${JSON.stringify(meetings, null, 2)}

export const GIFT_MOMENTS: GiftMoment[] = ${JSON.stringify(gifts, null, 2)}
`,
      options,
    ),
  )
  console.log('✓ src/data patched with the side quests (docs/61)')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
