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

// ---------------------------------------------------------------- the whole patch

export function patchSideQuests(b: SideQuestBundle): void {
  withRegis(b)
  withRoadblocks(b)
  withDisguises(b)
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
