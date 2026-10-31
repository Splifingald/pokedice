import { z } from 'zod'
import { cleanNickname } from '@/engine/nickname'
import { isUnownLetter, UNOWN_LETTERS } from '@/engine/unownDex'
import {
  COMBO_KEYS,
  EVENT_IDS,
  PLAY_STYLES,
  POKE_TYPES,
  POWER_KINDS,
  TRADE_VISIBILITY,
  type ComboKey,
  type DayCareResident,
  type DayCareState,
  type PokeType,
  type PowerKind,
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
  koAt: z.number().optional(),
  // Extreme mode's Pokébuff (docs/47): an odd one (an edited save) is dropped, never the Pokémon.
  buff: z
    .object({ type: z.enum(POKE_TYPES as unknown as [PokeType, ...PokeType[]]), until: z.number() })
    .optional()
    .catch(undefined),
  // Kept as renaming keeps it: a bad one (an edited save) is dropped, never the save.
  nickname: z.unknown().transform(cleanNickname),
  // Unown's letter (docs/41): a bad one (an edited save) is dropped, the Unown reads as an A.
  letter: z.unknown().transform((v) => (isUnownLetter(v) ? v : undefined)),
  // Its hidden talent (docs/51): anything but true is no talent.
  talent: z.unknown().transform((v) => (v === true ? true : undefined)),
})

// Extreme mode's Centers (docs/47): the boons waiting for the pick.
const centerBoonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heal'), percent: z.number() }),
  z.object({ kind: z.literal('full') }),
  z.object({ kind: z.literal('item'), itemKey: z.string().min(1) }),
  z.object({ kind: z.literal('buff'), uid: z.string().min(1), type: z.enum(POKE_TYPES as unknown as [PokeType, ...PokeType[]]) }),
  z.object({ kind: z.literal('donor'), gold: z.number().min(0) }),
  z.object({ kind: z.literal('rocket') }),
])
const runSchema = z.object({
  id: z.string().min(1).max(80),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  best: z.number().min(0).optional(),
  untimed: z.boolean().optional(),
})
const centerBoonsSchema = z.object({ areaId: z.string().min(1), offers: z.array(centerBoonSchema).max(10) })

// Trades (docs/23): a listing's want, and a Pokémon as the Done list remembers it.
const tradeWantSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('species'), dex: z.number().int().min(1) }),
  z.object({ kind: z.literal('notOwned') }),
  z.object({ kind: z.literal('any') }),
])
const tradeMonSchema = z.object({
  dex: z.number().int().min(1),
  level: z.number().int().min(1).max(100),
  shiny: z.boolean().optional(),
  nickname: z.unknown().transform(cleanNickname),
})

const typeEnum = z.enum(POKE_TYPES as unknown as [PokeType, ...PokeType[]])
const powerKinds = z
  .array(z.string().max(20))
  .max(20)
  .transform((ks) => ks.filter((k): k is PowerKind => (POWER_KINDS as readonly string[]).includes(k)))

// The Underground (docs/34): one event's kits, pickaxe, orb bag and open wall.
const count = z.number().int().min(0)
const orbRow = z.object({ s: count, m: count, l: count })
const wallThingSchema = z.object({
  kind: z.enum(['orbS', 'orbM', 'orbL', 'fossil', 'plate']),
  x: count,
  y: count,
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  colour: z.enum(['red', 'blue', 'green']).optional(),
  item: z.string().max(80).optional(),
  plate: typeEnum.optional(),
})
const undergroundSchema = z.object({
  eventId: z.string().max(80),
  freeKits: count,
  freeAt: z.number().nullable(),
  boughtKits: count,
  boughtCount: count,
  pickaxe: count,
  bag: z.object({ red: orbRow, blue: orbRow, green: orbRow }),
  wall: z
    .object({
      id: z.string().max(120),
      cols: z.number().int().min(1).max(12),
      rows: z.number().int().min(1).max(12),
      depth: z.array(z.number().int().min(0).max(3)).max(144),
      things: z.array(wallThingSchema).max(20),
      strikes: z.number().int().min(1).max(200),
      used: count,
      neighbourLoss: count,
    })
    .nullable(),
  walls: count,
  hauls: z.array(z.string().max(120)).max(50),
  received: z.array(z.string().max(80)).max(100).optional(),
  outbox: z
    .array(
      z.object({
        wallId: z.string().max(120),
        orbs: z.array(z.object({ colour: z.enum(['red', 'blue', 'green']), size: z.enum(['s', 'm', 'l']), to: z.string().max(80) })).max(20),
      }),
    )
    .max(200)
    .optional(),
  rulesSeen: z.boolean().optional(),
})
const offerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heal'), percent: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('revive'), uid: z.string() }),
  z.object({ kind: z.literal('boost'), type: typeEnum, amount: z.number().min(0) }),
  z.object({ kind: z.literal('die'), uid: z.string(), type: typeEnum }),
  z.object({ kind: z.literal('item') }),
])
const portalSchema = z.object({
  active: z.boolean(),
  closed: z.number().int().min(0),
  deck: z.array(z.enum(['wild', 'item', 'distortion'])),
  offers: z.array(offerSchema).max(8).nullable().optional(),
  boosts: z.record(typeEnum, z.number().min(0)).optional(),
  dice: z.record(z.array(typeEnum).max(8)).optional(),
  won: z.boolean().optional(),
  wonSeen: z.boolean().optional(),
  tries: z.number().int().min(0).optional(),
})

const nightmareSchema = z.object({
  active: z.boolean(),
  round: z.number().int().min(0).max(99),
  strike: z.boolean().optional(),
  gifted: z.array(z.number().int().min(1).max(99)).max(99).optional(),
  won: z.boolean().optional(),
  wonSeen: z.boolean().optional(),
  tries: z.number().int().min(0).optional(),
})

const progressSchema = z.object({
  roundsDone: z.number().int().min(0).optional(),
  roundCounted: z.boolean().optional(),
  // Saves from before rounds replaced the exploration gauge (converted on load).
  xp: z.number().min(0).optional(),
  cleared: z.boolean(),
  bossDefeated: z.boolean(),
  bossesDefeated: z.array(z.number().int()).default([]),
  bossesCaught: z.array(z.number().int()).optional(),
  gymsDefeated: z.array(z.string()).default([]),
  deck: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'trick', 'legend'])).optional(),
  lootDeck: z.array(z.string()).optional(),
  uniqueFound: z.array(z.string()).optional(),
  round: z.number().int().min(0).optional(),
  drawn: z.array(z.enum(['wild', 'trainer', 'center', 'item', 'casino', 'trick', 'legend'])).optional(),
  lastCenter: z.boolean().optional(),
  // Route 1's set opening (docs/46): the deck in play is its round of this index. An odd value: a shuffled deck's cards.
  opening: z.number().int().min(0).optional().catch(undefined),
  // The portal run (docs/28): an odd value in an edited save drops the run, never the save.
  portal: portalSchema.optional().catch(undefined),
  // The nightmare (docs/30): the same, an odd value drops it, never the save.
  nightmare: nightmareSchema.optional().catch(undefined),
  // Extreme mode's Centers (docs/47): a secret area's first one met, and a round to start over at a Center.
  centerMet: z.boolean().optional(),
  wiped: z.boolean().optional(),
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
    advance: z.enum(['auto']).optional().catch(undefined),
    // A style this build doesn't know (a newer one's) reads as unset rather than failing the whole save.
    playStyle: z.enum(PLAY_STYLES).optional().catch(undefined),
    typeHints: z.boolean().optional(),
    raidFast: z.boolean().optional(),
    details: z.boolean().optional(),
    lang: z.enum(LANGS).optional(),
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    // The game-feel switches (docs/38). Without them here the save's settings, read first at boot, dropped them.
    haptics: z.boolean().optional(),
    music: z.boolean().optional(),
    musicVolume: z.number().min(0).max(1).optional().catch(undefined),
  }),
  hpScale: z.number().positive().optional(),
  player: z.object({ name: z.string().max(12), character: z.enum(['red', 'green']), avatar: z.string().max(40).optional() }).optional(),
  dayCare: dayCareSchema.optional(),
  dayCareNotice: z.object({ dex: z.array(z.number().int().min(1)) }).optional(),
  adminEditAt: z.number().optional(),
  playedAt: z.number().optional(),
  leaderboardVisited: z.boolean().optional(),
  versusRulesSeen: z.boolean().optional(),
  versusLeagueRulesSeen: z.boolean().optional(),
  portalRulesSeen: z.boolean().optional(),
  nightmareRulesSeen: z.boolean().optional(),
  events: z
    .object({
      seen: z.array(z.enum(EVENT_IDS)).optional(),
      wheelDay: z.string().max(10).optional(),
      wheelPending: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('gold'), amount: z.number().min(0) }),
          z.object({ kind: z.literal('item'), key: z.string().min(1).max(60), qty: z.number().int().min(1) }),
          z.object({
            kind: z.literal('pokemon'),
            dex: z.number().int().min(1),
            level: z.number().int().min(1),
            shiny: z.boolean().optional(),
          }),
        ])
        .optional(),
      wheelTickets: z.number().int().min(0).max(1000).optional(),
      wheelTicketAt: z.number().nullable().optional(),
      wheelRulesSeen: z.boolean().optional(),
      raid: z
        .object({
          day: z.string().max(10),
          dex: z.number().int().min(1),
          shiny: z.boolean(),
          areaId: z.string().max(60),
          caught: z.boolean(),
          tries: z.number().int().min(0).default(0),
        })
        .optional(),
      raidHistory: z.array(z.object({ day: z.string().max(10), dex: z.number().int().min(1) })).optional(),
      raidPool: z.array(z.number().int().min(1)).optional(),
      raidTeam: z.array(z.string().max(80)).max(3).optional(),
      raidLocked: z
        .array(z.object({ dex: z.number().int().min(1), shiny: z.boolean(), areaId: z.string().max(60), day: z.string().max(10) }))
        .max(500)
        .optional(),
      raidsWon: z.number().int().min(0).optional(),
      raidsDone: z.array(z.string().max(120)).max(400).optional(),
      raidTeams: z.record(z.array(z.string().max(80)).max(3)).optional(),
      raidNpc: z.object({ key: z.string().max(140), seed: z.number().int() }).optional(),
      raidRulesSeen: z.boolean().optional(),
      raidIntrosSeen: z.array(z.number().int()).max(200).optional(),
      liveSeen: z.array(z.string().max(80)).max(50).optional(),
      liveBought: z.record(z.record(z.number().int().min(0))).optional(),
      // Small worlds (docs/21): the one held, the pop-ups shown, the mythicals waiting for their home region.
      world: z
        .object({
          id: z.string().min(1).max(80),
          regionId: z.string().min(1).max(80),
          from: z.string().min(1).max(80),
          partner: z.number().int().min(1),
          caught: z.boolean().optional(),
          bought: z.record(z.number().int().min(0)).optional(),
          closed: z.boolean().optional(),
          home: z.record(z.number().int().min(0)).optional(),
          finished: z.boolean().optional(),
          finishSeen: z.boolean().optional(),
        })
        .optional(),
      worldSeen: z.array(z.string().max(80)).max(20).optional(),
      worldBye: z.array(z.string().max(80)).max(20).optional(),
      worldDone: z.array(z.string().max(80)).max(20).optional(),
      worldPending: z
        .array(z.object({ dex: z.number().int().min(1), level: z.number().int().min(1), shiny: z.boolean(), worldId: z.string().max(80) }))
        .max(50)
        .optional(),
      // A closed world's Pokémon (or one sent on from another region) waiting in a region until its best reaches
      // their level (docs/26 §1).
      worldHome: z
        .array(
          z.object({
            inst: instanceSchema,
            region: z.string().min(1).max(80),
            worldId: z.string().max(80).optional(),
            from: z.string().min(1).max(80).optional(),
            tradedBy: z.string().max(40).optional(),
          }),
        )
        .max(2000)
        .optional(),
      rebattle: z
        .record(
          z.object({
            done: z.number().int().min(0),
            step: z.number().int().min(0),
            paid: z.array(z.string().max(120)).default([]),
          }),
        )
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
  mode: z.enum(['main', 'extreme']).optional(),
  extreme: z
    .object({
      awayFrom: z.number().optional(),
      pending: z.array(z.tuple([z.number(), z.number()])).max(20).optional(),
      // A Center's boons waiting for the pick (docs/47): an odd value drops them, never the save.
      center: centerBoonsSchema.optional().catch(undefined),
      centerRulesSeen: z.boolean().optional(),
      // Each region's run (docs/48): an odd one (an edited save) is dropped, never the save.
      runs: z.record(runSchema.optional().catch(undefined)).optional().catch(undefined),
    })
    .optional(),
  extremeUnlockedAt: z.number().optional(),
  extremeRulesSeen: z.boolean().optional(),
  extremePageSeen: z.boolean().optional(),
  // The shiny Pokédex (docs/39): each region's species owned shiny, and its rules seen.
  shinyDex: z.record(z.array(z.number().int().min(1)).max(3000)).optional(),
  shinyDexSeen: z.boolean().optional(),
  // The Unown Pokédex (docs/41): each region's letters, the prizes paid, its rules seen.
  unownDex: z.record(z.array(z.string().max(1)).max(UNOWN_LETTERS.length)).optional(),
  unownDexPaid: z.array(z.string().max(40)).max(40).optional(),
  unownDexSeen: z.boolean().optional(),
  // Hidden talents (docs/51): the families unlocked by region, and those met.
  talents: z.record(z.array(z.number().int().min(1)).max(3000)).optional(),
  talentsMet: z.array(z.number().int().min(1)).max(3000).optional(),
  talentRulesSeen: z.boolean().optional(),
  // The dice tutorial (docs/46 §5): an odd value starts it afresh, never fails the save.
  diceTutorial: z.enum(['started', 'done']).optional().catch(undefined),
  // The reroll lesson (docs/46 §6): played once.
  rerollLesson: z.literal('done').optional().catch(undefined),
  // The item tutorial (docs/46 §7): shown once.
  itemLesson: z.literal('done').optional().catch(undefined),
  // The battle powers (docs/35): the Mega Gems held, bought ones included, which nothing else gives back. A power kind
  // this build doesn't know is dropped rather than failing the save, so an odd one never costs the gems.
  powers: z
    .object({
      gems: z.array(z.string().min(1).max(60)).max(400).optional(),
      seen: powerKinds.optional(),
      earned: powerKinds.optional(),
    })
    .optional(),
  // The General upgrades (docs/25): their levels and the offline earnings' clock.
  general: z
    .object({
      luck: z.number().int().min(0).max(100).optional(),
      offline: z.number().int().min(0).max(100).optional(),
      rich: z.boolean().optional(),
      charm: z.number().int().min(0).max(100).optional(),
      awayFrom: z.number().optional(),
      carryMs: z.number().int().min(0).optional(),
      rulesSeen: z.boolean().optional(),
      charmSeen: z.boolean().optional(),
    })
    .optional(),
  trades: z
    .object({
      out: z
        .array(
          z.object({
            listing: z.string().min(1).max(80),
            code: z.string().max(20),
            region: z.string().max(40),
            mon: instanceSchema,
            at: z.number(),
            endsAt: z.number(),
            want: tradeWantSchema,
            visibility: z.enum(TRADE_VISIBILITY),
          }),
        )
        .max(20)
        .default([]),
      done: z.array(z.string().max(80)).max(100).default([]),
      log: z
        .array(
          z.object({
            id: z.string().max(80),
            at: z.number(),
            role: z.enum(['poster', 'taker']),
            with: z.string().max(40),
            withRich: z.boolean().optional(),
            gave: tradeMonSchema,
            got: tradeMonSchema,
            evolvedTo: z.number().int().min(1).optional(),
            outcome: z.enum(['new', 'replaced', 'merged', 'shiny', 'locked', 'pending']),
            region: z.string().min(1).max(80).optional(),
          }),
        )
        .max(40)
        .optional(),
      unseen: z.array(z.string().max(80)).max(40).optional(),
      landing: z
        .array(z.object({ id: z.string().min(1).max(80), inst: instanceSchema, dex: z.number().int().min(1) }))
        .max(20)
        .optional(),
      rulesSeen: z.boolean().optional(),
    })
    .optional(),
  gifts: z
    .object({
      done: z.array(z.number().int()).max(200).default([]),
      rulesSeen: z.boolean().optional(),
    })
    .optional(),
  invites: z
    .object({
      done: z.array(z.number().int()).max(200).default([]),
      rulesSeen: z.boolean().optional(),
    })
    .optional(),
  // Trick or Treat (docs/29): its rules pop-up seen.
  trickOrTreat: z.object({ rulesSeen: z.boolean().optional() }).optional(),
  // The Underground (docs/34): the running event's block, and the plates kept for good.
  underground: undergroundSchema.optional(),
  plates: z.array(typeEnum).max(18).optional(),
  // Trainer looks (docs/31): the unlocked looks seen in the menu (the red dot), its rules pop-up shown, and the event
  // looks granted (§7).
  looks: z
    .object({
      seen: z.array(z.string().max(40)).max(400).optional(),
      rulesSeen: z.boolean().optional(),
      earned: z.array(z.string().max(40)).max(100).optional(),
    })
    .optional(),
  // Day and night (docs/32): its rules pop-up seen.
  dayNight: z.object({ rulesSeen: z.boolean().optional() }).optional(),
  idle: z
    .object({
      rulesSeen: z.boolean().optional(),
      detour: z.object({ from: z.string(), to: z.string(), rounds: z.number().int().min(0) }).optional(),
    })
    .optional(),
  // An encounter under way when the page was left (src/store/resume.ts). Only its outline is checked here: the store
  // checks the rest against the save and the content before playing on. One that doesn't fit is dropped, never the save
  // (`catch`), so an older or a damaged one costs the encounter at worst. An optional field: no new save version.
  resume: z
    .object({
      v: z.literal(1),
      run: z.record(z.unknown()),
      battle: z
        .object({
          id: z.number().int().min(0),
          state: z.record(z.unknown()),
          log: z.array(z.unknown()).max(20_000),
        })
        .nullable(),
      rng: z.object({ run: z.number().int().min(0), battle: z.number().int().min(0) }),
    })
    .optional()
    .catch(undefined),
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
