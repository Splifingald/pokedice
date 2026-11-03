/**
 * What every small world's content script shares (docs/21): its areas written as short specs, turned into the game's
 * rows, and the same content as a migration. Haunted Hollow (scripts/content-haunted-hollow.ts, docs/26) and Snowglobe
 * Valley (scripts/content-snowglobe-valley.ts, docs/64) are built with it, so both worlds' rows have one shape.
 */
import type {
  Area,
  BossDef,
  EncounterKind,
  LootEntry,
  Region,
  SmallWorld,
  Trainer,
  WildPoolEntry,
} from '../src/engine/types'
import { upsert } from './seed'

export type Mon = [dex: number, level: number]

export interface TrainerSpec {
  name: string
  sprite: string
  team: Mon[]
  role?: Trainer['role']
  items?: string[]
}

export interface AreaSpec {
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

/** A world's content: its region row, areas, trainers and the world's settings. */
export interface WorldContent {
  region: Region
  areas: Area[]
  trainers: Trainer[]
  world: Omit<SmallWorld, 'previewHours'>
}

export const balls = (lo: [number, number], hi?: [number, number]): AreaSpec['loot'] => [
  ['poke-ball', 3, ...lo],
  ...(hi ? ([['great-ball', 2, ...hi]] as AreaSpec['loot']) : []),
]

const sprite = (s: string) => `/trainers/classes/${s}.png`

/** A trainer's row; `id` gives the world's stable ids. */
export function trainerOf(
  id: (...parts: (string | number)[]) => string,
  areaKey: string,
  t: TrainerSpec,
): Trainer {
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

/**
 * The world's areas and trainers from its specs, in order from `order0`. Every area with a deck holds one item and
 * one Pokémon Center (the user's rule for both worlds); `deckExtra` adds a world's own cards (Haunted Hollow's Trick
 * or Treat).
 */
export function buildAreas(
  id: (...parts: (string | number)[]) => string,
  regionId: string,
  order0: number,
  specs: readonly AreaSpec[],
  deckExtra?: (key: string) => Partial<Area['encounterWeights']> | undefined,
): { areas: Area[]; trainers: Trainer[] } {
  const trainers: Trainer[] = []
  const areas = specs.map((a, i): Area => {
    const pool = a.trainers.map((t) => trainerOf(id, a.key, t))
    const gyms = (a.gyms ?? []).map((t) => trainerOf(id, a.key, t))
    trainers.push(...pool, ...gyms)
    const deck = { wild: 0, trainer: 0, center: 0, item: 0, casino: 0, ...a.deck }
    if (a.wild.length || a.trainers.length) Object.assign(deck, { item: 1, center: 1 })
    Object.assign(deck, deckExtra?.(a.key) ?? {})
    return {
      id: id('area', a.key),
      orderIndex: order0 + i,
      regionId,
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
  return { areas, trainers }
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * A world's content as SQL for a live database (supabase/migrations): upserts of its region, trainers, areas and their
 * pools (rows the script no longer has are deleted), the world added to `smallWorlds` (its switch and other worlds
 * kept), and `configVersion` + 1 so players fetch the new content. Safe to run again. `header` opens the file.
 */
export function worldSql(h: WorldContent, header: string[], opts: { modes?: boolean } = {}): string {
  // With `modes`, each area's special mode (`areas.mode`, docs/28) is written too: Haunted Hollow's came as patches
  // after its content ran (0057, 0060), so its own migration stays without it.
  const modeCol = opts.modes ? ['mode'] : []
  const areaIds = h.areas.map((a) => q(a.id)).join(', ')
  const keep = (ids: string[]) => (ids.length ? ids.map(q).join(', ') : "''")
  return [
    ...header,
    'begin;',
    ...(opts.modes ? ['alter table areas add column if not exists mode jsonb;'] : []),
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
        ...modeCol,
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
        ...(opts.modes ? [a.mode ?? null] : []),
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
  coalesce((select jsonb_agg(w) from jsonb_array_elements(coalesce(value -> 'list', '[]'::jsonb)) w where w ->> 'id' <> ${q(h.world.id)}), '[]'::jsonb)
    || jsonb_build_array(${q(JSON.stringify(h.world))}::jsonb)
) where key = 'smallWorlds';`,
    "insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);",
    'commit;',
    '',
  ].join('\n')
}
