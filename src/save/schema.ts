import { z } from 'zod'
import { COMBO_KEYS, POKE_TYPES, type ComboKey, type PokeType, type RegionSave, type SaveData } from '@/engine/types'
import { LANGS } from '@/i18n/langs'

export const CURRENT_SAVE_VERSION = 1

const instanceSchema = z.object({
  id: z.string().min(1),
  dex: z.number().int().min(1),
  level: z.number().int().min(1).max(100),
  xp: z.number().min(0),
  currentHp: z.number().min(0),
  caughtAt: z.number(),
  shiny: z.boolean().optional(),
  revivesAt: z.number().optional(),
  fossil: z.string().optional(),
})

const progressSchema = z.object({
  roundsDone: z.number().int().min(0).optional(),
  roundCounted: z.boolean().optional(),
  // Saves from before rounds replaced the exploration gauge (converted on load).
  xp: z.number().min(0).optional(),
  cleared: z.boolean(),
  bossDefeated: z.boolean(),
  bossesDefeated: z.array(z.number().int()).default([]),
  gymsDefeated: z.array(z.string()).default([]),
  deck: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'legend'])).optional(),
  lootDeck: z.array(z.string()).optional(),
  uniqueFound: z.array(z.string()).optional(),
  round: z.number().int().min(0).optional(),
  drawn: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'legend'])).optional(),
  lastCenter: z.boolean().optional(),
})

/** One parked region's block: the same fields the live region keeps at the top level of the save. */
const regionBlockSchema = () =>
  z.object({
    gold: z.number().min(0),
    pokedex: z.array(z.number().int().min(1)),
    box: z.array(instanceSchema),
    team: z.array(z.string()),
    inventory: z.record(z.number().int().min(0)),
    comboLevels: levelRecord<ComboKey>(COMBO_KEYS),
    dieLevels: levelRecord<PokeType>(POKE_TYPES),
    currentAreaId: z.string(),
    areaProgress: z.record(progressSchema),
    dayCare: dayCareSchema.optional(),
    boughtUnique: z.array(z.string()).optional(),
  })

const levelRecord = <K extends string>(keys: readonly K[]) =>
  z
    .record(z.number().int().min(1).max(10))
    .transform((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? 1])) as Record<K, number>)

const dayCareSchema = z.object({
  residents: z.array(z.object({ inst: instanceSchema, since: z.number() })),
  eggClaimed: z.boolean().default(false),
  visited: z.boolean().optional(),
})

export const saveSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number(),
  gold: z.number().min(0),
  pokedex: z.array(z.number().int().min(1)),
  box: z.array(instanceSchema),
  team: z.array(z.string()),
  inventory: z.record(z.number().int().min(0)),
  comboLevels: levelRecord<ComboKey>(COMBO_KEYS),
  dieLevels: levelRecord<PokeType>(POKE_TYPES),
  currentAreaId: z.string(),
  areaProgress: z.record(progressSchema),
  settings: z.object({
    sfx: z.boolean(),
    reducedMotion: z.boolean(),
    multiExp: z.boolean().default(true),
    autoMode: z.boolean().optional(),
    lang: z.enum(LANGS).optional(),
  }),
  hpScale: z.number().positive().optional(),
  player: z.object({ name: z.string().max(12), character: z.enum(['red', 'green']) }).optional(),
  dayCare: dayCareSchema.optional(),
  energy: z.object({ value: z.number().min(0), at: z.number() }).optional(),
  adminEditAt: z.number().optional(),
  leaderboardVisited: z.boolean().optional(),
  region: z.string().optional(),
  parked: z.record(regionBlockSchema()).optional(),
  // Legacy: regions whose things were folded forward while that behaviour existed. Nothing reads it; it is kept so
  // a save that went through it still says so.
  merged: z.array(z.string()).optional(),
  boughtUnique: z.array(z.string()).optional(),
})

/**
 * Migration hook: each future version bumps `version` and adds a step here, oldest first.
 * v1 is the current format, so there is nothing to do yet.
 */
export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const v = (raw as { version?: unknown }).version
  if (v === CURRENT_SAVE_VERSION) return raw
  // e.g. if (v === 1) raw = migrateV1toV2(raw)
  return raw
}

export type ParseResult = { ok: true; save: SaveData } | { ok: false; error: string }

/** A parked region, made self-consistent: team ids that exist in its Box, no duplicate Pokédex entries. */
function repairBlock(block: RegionSave): RegionSave {
  const ids = new Set(block.box.map((p) => p.id))
  const team = [...new Set(block.team)].filter((id) => ids.has(id))
  if (!team.length && block.box.length) team.push(block.box[0]!.id)
  const dayCare = block.dayCare && { ...block.dayCare, residents: block.dayCare.residents.filter((r) => !ids.has(r.inst.id)) }
  return { ...block, team, pokedex: [...new Set(block.pokedex)], ...(dayCare && { dayCare }) }
}

/** Migrate → validate → repair referential integrity (team ids must exist in the box, pokédex unique). */
export function parseSave(raw: unknown): ParseResult {
  const parsed = saveSchema.safeParse(migrate(raw))
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const s = parsed.data as SaveData
  const ids = new Set(s.box.map((p) => p.id))
  const team = [...new Set(s.team)].filter((id) => ids.has(id))
  if (!team.length && s.box.length) team.push(s.box[0]!.id)
  if (!s.box.length) return { ok: false, error: 'box is empty' }
  // A Pokémon is either in the Box or at the Day Care, never both.
  const dayCare = s.dayCare && { ...s.dayCare, residents: s.dayCare.residents.filter((r) => !ids.has(r.inst.id)) }
  // Parked regions get the same repair: their team ids must exist in their own Box, their Pokédex must be unique.
  // A parked Box can be legitimately empty: saves from when leagues folded earlier regions forward look like that.
  const parked = s.parked && Object.fromEntries(Object.entries(s.parked).map(([id, b]) => [id, repairBlock(b!)]))
  return {
    ok: true,
    save: { ...s, region: s.region ?? 'kanto', team, pokedex: [...new Set(s.pokedex)], ...(dayCare && { dayCare }), ...(parked && { parked }) },
  }
}
