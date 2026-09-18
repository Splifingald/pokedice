import { z } from 'zod'
import { COMBO_KEYS, POKE_TYPES, type ComboKey, type PokeType, type SaveData } from '@/engine/types'

export const CURRENT_SAVE_VERSION = 1

const instanceSchema = z.object({
  id: z.string().min(1),
  dex: z.number().int().min(1),
  level: z.number().int().min(1).max(100),
  xp: z.number().min(0),
  currentHp: z.number().min(0),
  caughtAt: z.number(),
  regenCarry: z.number().min(0).optional(),
  shiny: z.boolean().optional(),
})

const progressSchema = z.object({
  xp: z.number().min(0),
  cleared: z.boolean(),
  bossDefeated: z.boolean(),
  bossesDefeated: z.array(z.number().int()).default([]),
  gymsDefeated: z.array(z.string()).default([]),
  deck: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'legend'])).optional(),
  lootDeck: z.array(z.string()).optional(),
  uniqueFound: z.array(z.string()).optional(),
  roundStartXp: z.number().min(0).optional(),
  round: z.number().int().min(0).optional(),
  drawn: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'legend'])).optional(),
  lastCenter: z.boolean().optional(),
})

const levelRecord = <K extends string>(keys: readonly K[]) =>
  z
    .record(z.number().int().min(1).max(10))
    .transform((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? 1])) as Record<K, number>)

export const saveSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number(),
  lastRegenTick: z.number(),
  gold: z.number().min(0),
  pokedex: z.array(z.number().int().min(1)),
  box: z.array(instanceSchema),
  team: z.array(z.string()),
  inventory: z.record(z.number().int().min(0)),
  comboLevels: levelRecord<ComboKey>(COMBO_KEYS),
  dieLevels: levelRecord<PokeType>(POKE_TYPES),
  currentAreaId: z.string(),
  areaProgress: z.record(progressSchema),
  settings: z.object({ sfx: z.boolean(), reducedMotion: z.boolean(), multiExp: z.boolean().default(true), autoMode: z.boolean().optional() }),
  hpScale: z.number().positive().optional(),
  player: z.object({ name: z.string().max(12), character: z.enum(['red', 'green']) }).optional(),
  dayCare: z
    .object({
      residents: z.array(z.object({ inst: instanceSchema, since: z.number() })),
      eggClaimed: z.boolean().default(false),
      visited: z.boolean().optional(),
    })
    .optional(),
  adminEditAt: z.number().optional(),
  leaderboardVisited: z.boolean().optional(),
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
  return { ok: true, save: { ...s, team, pokedex: [...new Set(s.pokedex)], ...(dayCare && { dayCare }) } }
}
