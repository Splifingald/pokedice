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
import type { Area, BossDef, UnlockCondition } from '../src/engine/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')

export interface SideQuestBundle {
  areas: Area[]
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

// ---------------------------------------------------------------- the whole patch

export function patchSideQuests(b: SideQuestBundle): void {
  withRegis(b)
  withRoadblocks(b)
  withDisguises(b)
  withSafaris(b)
}

/** The data files are written as the seed writes them: one space of indent and a final newline. */
const write = (file: string, value: unknown) => writeFile(path.join(DATA, file), JSON.stringify(value, null, 1) + '\n')
const read = async <T>(file: string): Promise<T> => JSON.parse(await readFile(path.join(DATA, file), 'utf8')) as T

async function main() {
  if (!process.argv.includes('--data')) {
    console.log('Usage: tsx scripts/patch-side-quests.ts --data')
    process.exit(1)
  }
  const b: SideQuestBundle = { areas: await read<Area[]>('areas.json') }
  patchSideQuests(b)
  await write('areas.json', b.areas)
  console.log('✓ src/data patched with the side quests (docs/61)')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
