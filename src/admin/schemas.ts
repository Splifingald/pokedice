// Zod row schemas for every config table (snake_case, as stored). Errors are shown in the cell; saving is blocked.
import { z } from 'zod'
import type { Row, TableName } from '@/config/mapping'
import {
  BATTLE_BACKGROUNDS,
  COMBO_KEYS,
  DAY_TIMES,
  EVENT_ACCESS,
  GIFT_REWARD_KINDS,
  POKE_TYPES,
  STATUS_KINDS,
  TRICK_TIERS,
} from '@/engine/types'

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
  z.object({ kind: z.literal('fossil'), dex: int(1, 1025), level: int(1, 100), hours: z.number().min(0) }),
  z.object({ kind: z.literal('ball'), bonus: int(0, 12), raidOnly: z.boolean().optional(), talentBoost: z.boolean().optional() }),
  z.object({ kind: z.literal('link') }),
  z.object({ kind: z.literal('talent') }),
  z.object({ kind: z.literal('bait'), faces: z.array(int(0, 12)).length(6, 'exactly 6 faces') }),
  z.object({ kind: z.literal('megaGem'), mega: int(1, 99999) }),
])

/** One rarity tier of Trick or Treat (docs/29): its weight, its sections (from 0, rising, inside the flee zone) and flee. */
const trickTier = z
  .object({
    weight: z.number().min(0),
    flee: int(1, 100),
    sections: z
      .array(z.object({ from: int(0, 99), need: int(1, 7) }))
      .min(1, 'at least one section')
      .max(6, 'six sections at most'),
  })
  .superRefine((t, ctx) => {
    if (t.sections[0]?.from !== 0) ctx.addIssue({ code: 'custom', message: 'the first section starts at 0', path: ['sections'] })
    t.sections.forEach((sec, i) => {
      if (i > 0 && sec.from <= t.sections[i - 1]!.from)
        ctx.addIssue({ code: 'custom', message: 'sections must start higher and higher', path: ['sections', i, 'from'] })
      if (sec.from >= t.flee) ctx.addIssue({ code: 'custom', message: 'a section starts inside the flee zone', path: ['sections', i, 'from'] })
    })
  })

/** game_config `trickOrTreat` (docs/29): the switch, the Treat's range, a miss's push, the tiers and each area's ghosts. */
export const TRICK_SCHEMA = z
  .object({
    access: z.enum(EVENT_ACCESS),
    treatMin: int(1, 100),
    treatMax: int(1, 100),
    failPush: int(1, 100),
    tiers: z.object(Object.fromEntries(TRICK_TIERS.map((k) => [k, trickTier])) as Record<(typeof TRICK_TIERS)[number], typeof trickTier>),
    areas: z.record(z.array(z.object({ dex: int(1, 99999), tier: z.enum(TRICK_TIERS) }))),
  })
  .refine((c) => c.treatMax >= c.treatMin, { message: 'Treat max below min', path: ['treatMax'] })

/** One part of a Gift card's reward (docs/61 §4.0): an item names its key. */
const giftPart = z
  .object({ kind: z.enum(GIFT_REWARD_KINDS), key: z.string().optional(), qty: int(1, 999) })
  .refine((p) => p.kind !== 'item' || !!p.key, { message: 'an item needs its key', path: ['key'] })

/**
 * game_config `giftCard` (docs/61 §4.0): the switch, each level's break chance (whole %), Delibird's help, each level's
 * reward options (at least one part each), the balls from worst to best, the taps a boss's present takes.
 */
export const GIFT_SCHEMA = z.object({
  access: z.enum(EVENT_ACCESS),
  breakChances: z.array(int(0, 100)).min(1, 'at least one level that can grow').max(8, 'eight at most'),
  helper: z.object({ dex: int(0, 99999), safer: int(0, 100), extraLevels: int(0, 5) }),
  rewards: z
    .array(z.array(z.array(giftPart).min(1, 'an option gives something')).min(1, 'a level needs an option'))
    .min(1, 'at least level 1'),
  balls: z.array(z.string().min(1)).min(1, 'at least one ball'),
  bossTaps: int(1, 10),
})

/** Problems with a game_config value that has a schema of its own (Trick or Treat's, the Gift card's), as lines. */
export function configProblems(key: string, value: unknown): string[] {
  const schema = key === 'trickOrTreat' ? TRICK_SCHEMA : key === 'giftCard' ? GIFT_SCHEMA : null
  if (!schema) return []
  const res = schema.safeParse(value)
  return res.success ? [] : res.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
}

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
      // Forms are numbered past the National Dex: PokeAPI's 10001+ ids, Arceus's types 20001+.
      dex: int(1, 99999),
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
        z.object({
          toDex: int(1),
          level: int(1, 100).nullable(),
          item: z.string().nullable().optional(),
          region: z.string().nullable().optional(),
          notInRegion: z.string().nullable().optional(),
        }),
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
      // Optional so a database from before forms still loads.
      form: z
        .object({
          of: int(1),
          kind: z.enum(['regional', 'mega', 'gmax', 'battle']),
          region: z.string().nullable().optional(),
          trigger: z.enum(['lowHp', 'choice']).nullable().optional(),
          swapDie: z.object({ from: dieType, to: dieType }).nullable().optional(),
          mechanic: z.enum(['primal', 'ultra']).nullable().optional(),
        })
        .nullable()
        .optional(),
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
    // 0: no round to play, the area's gyms come at once (a league of fights only, docs/26).
    rounds_to_clear: int(0, 20).nullable().optional(),
    min_level: int(1, 100),
    max_level: int(1, 100),
    encounter_weights: z.object({
      wild: z.number().min(0),
      trainer: z.number().min(0),
      center: z.number().min(0),
      item: z.number().min(0),
      casino: z.number().min(0).optional(),
      // Trick or Treat (docs/29): its copies, dealt only while its switch is on and the area has ghosts.
      trick: z.number().min(0).optional(),
      // The Gift card (docs/61 §4.0): its copies, in place of the item cards while its switch is on.
      gift: z.number().min(0).optional(),
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
          raid: z.boolean().optional(),
          // Out of a present while the Gift card is on (docs/61 §4.2).
          present: z.boolean().optional(),
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
          z.object({ kind: z.literal('pokedex'), count: int(1, 1025) }),
          z.object({ kind: z.literal('maxLevel'), level: int(1, 100) }),
          // "Another area is reached" — the kind the Rocket Hideout and the Johto/Hoenn secrets use.
          z.object({ kind: z.literal('area'), areaId: uuid }),
          // "Another area is cleared": a small world's league beaten (docs/26 §2.5).
          z.object({ kind: z.literal('cleared'), areaId: uuid }),
        ]),
      )
      .nullable(),
    gyms: z.array(uuid),
    // A special mode (docs/28): Distortion World's portal run. Optional so a database before migration 0057 still loads.
    mode: z
      .discriminatedUnion('kind', [
        z.object({
        kind: z.literal('portal'),
        portals: int(1, 99),
        wild: int(0, 30),
        items: int(0, 30),
        offers: int(1, 5),
        heal: z.object({ weight: z.number().min(0), percent: z.number().min(0).max(100) }),
        revive: z.object({ weight: z.number().min(0) }),
        boost: z.object({ weight: z.number().min(0), amount: int(0, 999) }),
        die: z.object({ weight: z.number().min(0), maxDice: int(1, 12) }),
        item: z.object({
          weight: z.number().min(0),
          items: z.array(z.object({ key: z.string().min(1), weight: z.number().min(0) })),
        }),
        raid: z.object({ level: int(1, 100), upgradeLevel: int(1, 10), bars: int(1, 10), teamCap: int(1, 100) }),
        }),
        // Newmoon Island's nightmare (docs/30): its foes in order, Darkrai's strike, the rounds' gifts, the raid after.
        z.object({
          kind: z.literal('nightmare'),
          foes: z.array(z.object({ dex: int(1, 99999), level: int(1, 100) })).min(1, 'at least one foe').max(20),
          strikePercent: z.number().min(0).max(99),
          gifts: z.array(z.object({ round: int(1, 20), key: z.string().min(1), qty: int(1, 99) })),
          raid: z.object({ level: int(1, 100), upgradeLevel: int(1, 10), bars: int(1, 10), teamCap: int(1, 100) }),
        }),
        // Spear Pillar's race of time and space (docs/61 §4.4): its forks, legends, clock, finds, speed, replay and raids.
        z.object({
          kind: z.literal('timeRace'),
          forks: z.array(z.tuple([z.string(), z.string()])).min(1).max(10),
          legends: z.array(z.object({ type: z.string(), dex: int(1, 99999) })).length(2),
          perFork: int(1, 10),
          seconds: int(30, 7200),
          shard: z.object({ chance: z.number().min(0).max(100), seconds: int(0, 600) }),
          items: z.array(z.object({ key: z.string().min(1), qty: int(1, 99), weight: z.number().min(0) })),
          speed: z.number().min(1).max(3),
          replay: z.object({
            forks: z.array(z.tuple([z.string(), z.string()])).min(1).max(10),
            levelBonus: int(0, 40),
            seconds: int(30, 7200),
          }),
          raid: z.object({ level: int(1, 100), upgradeLevel: int(1, 10), bars: int(1, 10), teamCap: int(1, 100) }),
        }),
        // Crown Shrine's whiteout (docs/61 §4.3): its waves of foes in order, the weather, the bonfires' heal.
        z.object({
          kind: z.literal('whiteout'),
          waves: z
            .array(z.array(z.object({ dex: int(1, 99999), level: int(1, 100) })).min(1, 'a wave needs a foe').max(8))
            .min(1, 'at least one wave')
            .max(10),
          weather: z.enum(['snow', 'sand']).nullable(),
          bonfirePercent: z.number().min(0).max(100),
        }),
      ])
      .nullable()
      .optional(),
  }),
  area_wild_pool: z
    .object({
      id: uuid,
      area_id: uuid,
      dex: int(1),
      weight: int(0),
      min_level: int(1, 100),
      max_level: int(1, 100),
      // Day and night (docs/32): met only by day or only by night; null = any time.
      time_of_day: z.enum(DAY_TIMES).nullable().optional(),
    })
    .refine((r) => r.max_level >= r.min_level, { message: 'max below min', path: ['max_level'] }),
  trainers: z
    .object({
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
      // Two Pokémon out at once where double battles are on (docs/33): a pair needs a second one to send out.
      duo: z.boolean().optional(),
    })
    .refine((r) => !r.duo || r.team.length >= 2, { message: 'a duo needs 2 Pokémon', path: ['duo'] })
    .refine((r) => !r.duo || (r.role !== 'elite' && r.role !== 'champion'), {
      message: 'the Elite Four and Champion never fight doubles',
      path: ['duo'],
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
    // Likewise for 0017: the only region that stocks it (null = all), and one sale per region for good.
    region: z.string().nullable().optional(),
    once_only: z.boolean().optional(),
  }),
  game_config: z.object({ key: z.string().min(1), value: z.unknown() }).superRefine((r, ctx) => {
    for (const message of configProblems(r.key, r.value)) ctx.addIssue({ code: 'custom', message, path: ['value'] })
  }),
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
