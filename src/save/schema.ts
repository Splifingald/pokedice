import { z } from 'zod'
import {
  COMBO_KEYS,
  EVENT_IDS,
  POKE_TYPES,
  type ComboKey,
  type DayCareResident,
  type DayCareState,
  type PokeType,
  type RegionSave,
  type SaveData,
} from '@/engine/types'
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
    // Legacy: each region had its own Day Care until they became one (docs/15). Read once by parseSave, never written.
    dayCare: dayCareSchema.optional(),
    boughtUnique: z.array(z.string()).optional(),
  })

const levelRecord = <K extends string>(keys: readonly K[]) =>
  z
    .record(z.number().int().min(1).max(10))
    .transform((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? 1])) as Record<K, number>)

const eggParentSchema = z.object({ dex: z.number().int().min(1), owner: z.string().max(40).optional() })

const dayCareSchema = z.object({
  // `region` is absent on saves from before the one Day Care: parseSave tags them.
  residents: z.array(z.object({ inst: instanceSchema, since: z.number(), region: z.string().optional() })),
  guests: z
    .array(
      z.object({
        owner: z.string().min(1),
        ownerName: z.string().max(40),
        ownerAvatar: z.string().max(40),
        inst: z.string().min(1),
        dex: z.number().int().min(1),
        level: z.number().int().min(1).max(100),
        shiny: z.boolean().optional(),
        addedAt: z.number(),
      }),
    )
    .default([]),
  eggClaimed: z.boolean().default(false),
  visited: z.boolean().optional(),
  breedAt: z.number().optional(),
  dittoAt: z.number().optional(),
  egg: z
    .object({
      at: z.number(),
      parents: z.tuple([eggParentSchema, eggParentSchema]).optional(),
      gift: z.literal(true).optional(),
    })
    .optional(),
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
    sound: z.boolean().optional(),
    reducedMotion: z.boolean(),
    animations: z.enum(['full', 'short']).optional(),
    multiExp: z.boolean().default(true),
    autoMode: z.boolean().optional(),
    typeHints: z.boolean().optional(),
    lang: z.enum(LANGS).optional(),
    theme: z.enum(['light', 'dark', 'auto']).optional(),
  }),
  hpScale: z.number().positive().optional(),
  player: z.object({ name: z.string().max(12), character: z.enum(['red', 'green']), avatar: z.string().max(40).optional() }).optional(),
  dayCare: dayCareSchema.optional(),
  dayCareNotice: z.object({ dex: z.array(z.number().int().min(1)) }).optional(),
  energy: z.object({ value: z.number().min(0), at: z.number() }).optional(),
  adminEditAt: z.number().optional(),
  leaderboardVisited: z.boolean().optional(),
  events: z
    .object({
      seen: z.array(z.enum(EVENT_IDS)).optional(),
      wheelDay: z.string().max(10).optional(),
      wheelPending: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('gold'), amount: z.number().min(0) }),
          z.object({ kind: z.literal('item'), key: z.string().min(1).max(60), qty: z.number().int().min(1) }),
        ])
        .optional(),
    })
    .optional(),
  region: z.string().optional(),
  parked: z.record(regionBlockSchema()).optional(),
  // Legacy: regions whose things were folded forward while that behaviour existed. Nothing reads it; it is kept so
  // a save that went through it still says so.
  merged: z.array(z.string()).optional(),
  boughtUnique: z.array(z.string()).optional(),
  donationSeen: z.object({ round: z.number().int().min(0), regions: z.array(z.string()) }).optional(),
  regionOfferSeen: z.array(z.string()).optional(),
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

type ParsedDayCare = z.infer<typeof dayCareSchema>
type ParsedBlock = RegionSave & { dayCare?: ParsedDayCare }

/** A parked region, made self-consistent: team ids that exist in its Box, no duplicate Pokédex entries. */
function repairBlock(block: RegionSave): RegionSave {
  const ids = new Set(block.box.map((p) => p.id))
  const team = [...new Set(block.team)].filter((id) => ids.has(id))
  if (!team.length && block.box.length) team.push(block.box[0]!.id)
  return { ...block, team, pokedex: [...new Set(block.pokedex)] }
}

/**
 * One Day Care for every region (docs/15). Before, each region had its own: the live one at the top level, the
 * others parked with their region. They merge into the top level, each resident tagged with the region it came from
 * (a resident already tagged keeps its tag); `visited` and `eggClaimed` are OR-ed; the clocks stay as they were (unset
 * on old saves, so the first check starts them). The caller drops the parked copies. Idempotent.
 *
 * More residents than slots (two regions each had two) is left to `fitDayCare` (engine/daycare.ts): sending the extra
 * ones home with their levels needs the game data, which a save is parsed without.
 */
function oneDayCare(
  top: ParsedDayCare | undefined,
  live: string,
  parked: Record<string, ParsedBlock> | undefined,
): DayCareState | undefined {
  const sources: [string, ParsedDayCare][] = [
    ...(top ? [[live, top] as [string, ParsedDayCare]] : []),
    ...Object.entries(parked ?? {}).flatMap(([id, b]) => (b.dayCare ? [[id, b.dayCare] as [string, ParsedDayCare]] : [])),
  ]
  if (!sources.length) return undefined
  const seen = new Set<string>()
  const residents: DayCareResident[] = []
  for (const [region, dc] of sources)
    for (const r of dc.residents) {
      if (seen.has(r.inst.id)) continue
      seen.add(r.inst.id)
      residents.push({ ...r, region: r.region ?? region })
    }
  const guestKeys = new Set<string>()
  const guests = (top?.guests ?? []).filter((g) => {
    const key = `${g.owner}:${g.inst}`
    if (guestKeys.has(key)) return false
    guestKeys.add(key)
    return true
  })
  const visited = sources.some(([, dc]) => dc.visited)
  return {
    residents,
    guests,
    eggClaimed: sources.some(([, dc]) => dc.eggClaimed),
    ...(visited && { visited }),
    ...(top?.breedAt != null && { breedAt: top.breedAt }),
    ...(top?.dittoAt != null && { dittoAt: top.dittoAt }),
    ...(top?.egg && { egg: top.egg }),
  }
}

/** Migrate → validate → repair referential integrity (team ids must exist in the box, pokédex unique). */
export function parseSave(raw: unknown): ParseResult {
  const parsed = saveSchema.safeParse(migrate(raw))
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const { dayCare: top, parked: rawParked, ...s } = parsed.data as unknown as Omit<SaveData, 'dayCare' | 'parked'> & {
    dayCare?: ParsedDayCare
    parked?: Record<string, ParsedBlock>
  }
  const region = s.region ?? 'kanto'
  const ids = new Set(s.box.map((p) => p.id))
  const team = [...new Set(s.team)].filter((id) => ids.has(id))
  if (!team.length && s.box.length) team.push(s.box[0]!.id)
  if (!s.box.length) return { ok: false, error: 'box is empty' }
  const merged = oneDayCare(top, region, rawParked)
  // Parked regions get the same repair: their team ids must exist in their own Box, their Pokédex must be unique.
  // A parked Box can be legitimately empty: saves from when leagues folded earlier regions forward look like that.
  const parked =
    rawParked &&
    Object.fromEntries(Object.entries(rawParked).map(([id, { dayCare: _merged, ...b }]) => [id, repairBlock(b)]))
  // A Pokémon is either in its region's Box or at the Day Care, never both: the Box wins.
  const boxIds = (r: string) => (r === region ? ids : new Set((parked?.[r]?.box ?? []).map((p) => p.id)))
  const dayCare = merged && { ...merged, residents: merged.residents.filter((r) => !boxIds(r.region).has(r.inst.id)) }
  return {
    ok: true,
    save: { ...s, region, team, pokedex: [...new Set(s.pokedex)], ...(dayCare && { dayCare }), ...(parked && { parked }) },
  }
}
