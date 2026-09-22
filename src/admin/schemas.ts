// Zod row schemas for every config table (snake_case, as stored). Errors are shown in the cell; saving is blocked.
import { z } from 'zod'
import type { Row, TableName } from '@/config/mapping'
import { BATTLE_BACKGROUNDS, COMBO_KEYS, POKE_TYPES, STATUS_KINDS } from '@/engine/types'

const pokeType = z.enum(POKE_TYPES)
const background = z.enum(BATTLE_BACKGROUNDS)
const dieType = z.enum(['base', ...POKE_TYPES] as [string, ...string[]])
const int = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) =>
  z.number({ invalid_type_error: 'must be a number' }).int('must be a whole number').min(min).max(max)
const uuid = z.string().uuid('must be a UUID')
/** Levels vs the team average (negative = below), min ≤ max. */
const levelOffsets = z
  .object({ min: int(-99, 99), max: int(-99, 99) })
  .refine((r) => r.max >= r.min, { message: 'max below min', path: ['max'] })
const face = z.union([
  z.object({ kind: z.literal('number'), value: int(0, 99) }),
  z.object({ kind: z.literal('status'), status: z.enum(STATUS_KINDS), value: int(0, 99) }),
])

const itemEffect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heal'), amount: int(1) }),
  z.object({ kind: z.literal('revive'), percent: int(1, 100) }),
  z.object({
    kind: z.literal('cure'),
    statuses: z.array(z.enum(['burn', 'poison', 'frozen', 'paralyze', 'confuse'])).min(1, 'pick a status'),
  }),
  z.object({ kind: z.literal('rerolls'), amount: int(1) }),
  z.object({ kind: z.literal('level'), amount: int(1, 10) }),
  z.object({ kind: z.literal('stone') }),
  z.object({ kind: z.literal('fossil'), dex: int(1, 493), level: int(1, 100), hours: z.number().min(0) }),
  z.object({ kind: z.literal('ball'), bonus: int(0, 12) }),
])

export const ROW_SCHEMAS: Record<TableName, z.ZodTypeAny> = {
  type_chart: z.object({
    attacking: pokeType,
    defending: pokeType,
    multiplier: z.number().refine((v) => [0, 0.5, 1, 2].includes(v), 'must be 0, 0.5, 1 or 2'),
  }),
  dice_types: z.object({
    type: dieType,
    label: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex colour like #aa8844'),
    faces: z.array(face).length(6, 'exactly 6 faces'),
    description: z.string().max(40, 'keep it short (40 characters max)'),
    upgradeable: z.boolean(),
    counts_for_majority: z.boolean(),
    sort_order: int(),
  }),
  pokemon: z
    .object({
      dex: int(1, 9999),
      name: z.string().min(1),
      type1: pokeType,
      type2: pokeType.nullable(),
      base_hp: int(1),
      max_hp: int(1),
      speed: int(0),
      sprite_url: z.string().min(1),
      dice: z
        .array(z.object({ type: dieType, count: int(1, 6) }))
        .min(1, 'at least one die')
        .refine((d) => d.reduce((s, x) => s + x.count, 0) <= 6, 'at most 6 dice'),
      rerolls: int(0, 20),
      // Optional so a database created before migration 0003 still loads.
      catch_value: int(1, 9).optional(),
      evolutions: z.array(
        z.object({ toDex: int(1), level: int(1, 100).nullable(), item: z.string().nullable().optional() }),
      ),
      milestones: z.array(
        z.object({
          level: int(1, 100),
          effect: z.enum(['UPGRADE_DIE', 'REPLACE_DIE', 'ADD_REROLL', 'ADD_DIE', 'ADD_HP', 'EVOLVE']),
          dieType: dieType.optional(),
          fromDieType: dieType.optional(),
          amount: int(0).optional(),
        }),
      ),
      notes: z.string().nullable(),
    })
    .refine((r) => r.max_hp >= r.base_hp, { message: 'max_hp must be ≥ base_hp', path: ['max_hp'] }),
  regions: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    order_index: int(0),
    dex_range: z.tuple([int(1), int(1)]),
    starters: z.array(int(1)).min(1),
    starter_level: int(1, 100),
    league_area_id: uuid,
    next_region: z.string().nullable(),
    // Kanto is where a new game begins, so it can never be switched off.
    enabled: z.boolean(),
  }),
  areas: z.object({
    id: uuid,
    order_index: int(1),
    region_id: z.string().min(1),
    name: z.string().min(1),
    banner_url: z.string().nullable(),
    // Optional so a database created before migration 0014 still loads.
    rounds_to_clear: int(1, 20).nullable().optional(),
    min_level: int(1, 100),
    max_level: int(1, 100),
    encounter_weights: z.object({
      wild: z.number().min(0),
      trainer: z.number().min(0),
      center: z.number().min(0),
      item: z.number().min(0),
    }),
    backtrack_multiplier: z.number().min(0).max(1),
    legendary_boss: z
      .array(
        z.object({
          dex: int(1),
          level: int(1, 100),
          teamAvgThreshold: z.number().optional(),
          upgradeLevel: int(1, 10).nullable().optional(),
          battleBackground: background.nullable().optional(),
          shiny: z.boolean().optional(),
        }),
      )
      .nullable(),
    scales_to_team: z.boolean(),
    // Optional so a database created before migration 0012 still loads.
    scale_offsets: z
      .object({ wild: levelOffsets.nullable().optional(), trainer: levelOffsets.nullable().optional() })
      .nullable()
      .optional(),
    // Optional so a database created before migration 0002 still loads.
    easy_mode: z.boolean().optional(),
    enemy_upgrade_level: int(1, 10).nullable().optional(),
    // Optional so a database created before migration 0005 still loads.
    battle_background: background.nullable().optional(),
    hidden: z.boolean(),
    unlock_conditions: z
      .array(
        z.union([
          z.object({ kind: z.literal('pokedex'), count: int(1, 493) }),
          z.object({ kind: z.literal('maxLevel'), level: int(1, 100) }),
          // "Another area is reached" — the kind the Rocket Hideout and the Johto/Hoenn secrets use.
          z.object({ kind: z.literal('area'), areaId: uuid }),
        ]),
      )
      .nullable(),
    gyms: z.array(uuid),
  }),
  area_wild_pool: z
    .object({
      id: uuid,
      area_id: uuid,
      dex: int(1),
      weight: int(0),
      min_level: int(1, 100),
      max_level: int(1, 100),
    })
    .refine((r) => r.max_level >= r.min_level, { message: 'max below min', path: ['max_level'] }),
  trainers: z.object({
    id: uuid,
    name: z.string().min(1),
    sprite_url: z.string().nullable(),
    team: z
      .array(z.object({ dex: int(1), level: int(1, 100), shiny: z.boolean().optional() }))
      .min(1, '1–3 Pokémon')
      .max(3, '1–3 Pokémon'),
    role: z.enum(['trainer', 'leader', 'elite', 'champion']),
    badge: z.string().nullable(),
    upgrade_level: int(1, 10).nullable().optional(),
    battle_background: background.nullable().optional(),
    rival_of: int(1).nullable().optional(),
    items: z.array(z.string().min(1)).max(3, 'one potion per Pokémon').nullable().optional(),
  }),
  area_trainer_pool: z.object({ id: uuid, area_id: uuid, trainer_id: uuid, weight: int(0) }),
  area_loot_pool: z
    .object({
      id: uuid,
      area_id: uuid,
      item_key: z.string().min(1),
      weight: int(0),
      unique_find: z.boolean(),
      min_qty: int(1),
      max_qty: int(1),
    })
    .refine((r) => r.max_qty >= r.min_qty, { message: 'max below min', path: ['max_qty'] }),
  combo_upgrades: z.object({ combo_key: z.enum(COMBO_KEYS), level: int(1, 10), bonus: int(0), cost: int(0) }),
  die_upgrades: z.object({ die_type: pokeType, level: int(1, 10), bonus: int(0), cost: int(0) }),
  items: z.object({
    key: z.string().regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case'),
    name: z.string().min(1),
    description: z.string().nullable(),
    sprite_url: z.string().nullable(),
    price: int(0),
    effect: itemEffect,
    in_shop: z.boolean().optional(),
    shop_badges: int(0, 8).optional(),
    // Optional so a database created before migration 0015 still loads.
    shop_area: uuid.nullable().optional(),
  }),
  game_config: z.object({ key: z.string().min(1), value: z.unknown() }),
}

/** column → first error message ('*' for row-level problems). */
export function validateRow(t: TableName, row: Row): Record<string, string> {
  const res = ROW_SCHEMAS[t].safeParse(row)
  if (res.success) return {}
  const out: Record<string, string> = {}
  for (const i of res.error.issues) {
    const col = String(i.path[0] ?? '*')
    out[col] ??= i.message
  }
  return out
}
