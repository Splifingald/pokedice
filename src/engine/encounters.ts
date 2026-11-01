import { areaVersusConfig, foeEncounter, placeVersusCards, type AreaFoe } from './areaVersus'
import { safariDealable, safariTier } from './safari'
import { dealtAsMeeting } from './moments'
import { isLegendary } from './breeding'
import { areaDayTime, wildPoolAt } from './dayNight'
import { shuffle } from './deal'
import { eventOn, gameCornerOn } from './events'
import { regionOfArea } from './regions'
import { drawLoot } from './items'
import { openingCardAt, openingDeck, openingRound, openingRoundDue } from './opening'
import { pityChance } from './pity'
import { asSeenBy, gymsFor, type PlayerSide } from './rival'
import { createRng, type Rng } from './rng'
import { dealTrainerItems } from './trainerItems'
import { foeTalentChance, rollTalent, talentsOn } from './talents'
import { pickTrickGhost, trickDealable } from './trickOrTreat'
import { isWorldMythical, worldOfArea } from './worldList'
import { weatherPoolTimes } from './weather'
import { titansOn } from './titans'
import { trialOf, trialTeam } from './trials'
import type {
  Area,
  AreaProgress,
  BattleBackground,
  BossDef,
  LootDisguise,
  RoadblockKind,
  DeckCard,
  SaveData,
  EncounterKind,
  GameData,
  LevelOffsetRange,
  OpeningCard,
  SkipPolicy,
  Trainer,
  TrainerMon,
  TrainerRole,
  TrickTier,
  Weather,
  WildPoolEntry,
} from './types'

export type Encounter =
  /** `partner`: a second wild Pokémon, for a double battle (docs/33). */
  /** `talent`: it carries its family's hidden talent (docs/51). */
  /** `disguisedAs`: it posed as this item until picked up (docs/61 §3): never fled from, never one of a pair. */
  | {
      kind: 'wild'
      dex: number
      level: number
      isNew: boolean
      shiny?: boolean
      talent?: boolean
      partner?: WildPartner
      disguisedAs?: string
      /** A Kalos horde (docs/62 §5): the others, fought two at a time with this one. */
      horde?: WildPartner[]
    }
  /**
   * `double`: fought 2 v 2, two of the team out at once (docs/33). `prize`: a set opening's trainer (docs/46) pays these
   * ₽ for the win instead of the usual amount per K.O.
   */
  | {
      kind: 'trainer'
      trainerId: string
      name: string
      spriteUrl: string | null
      team: TrainerMon[]
      double?: boolean
      prize?: number
      /** A real player's team (docs/54): the fight is theirs, as it was, with its own rules (`isPlayerFoe`). */
      player?: AreaFoe
      /** A rival's set meeting (docs/61 §5.2): met once it's won. */
      moment?: string
    }
  | {
      kind: 'gym'
      trainerId: string
      name: string
      spriteUrl: string | null
      team: TrainerMon[]
      role: TrainerRole
      badge: string | null
      /** 1-based position among the area's gym battles, and their count (Elite Four = 5). */
      index: number
      total: number
      /** The upgrade level its Pokémon fight at, when not the trainer's or the area's (the Elite Rebattle's tiers). */
      upgradeLevel?: number
      /** An Elite Rebattle fight: the region and the tier (0 = Bronze). */
      rebattle?: { regionId: string; tier: number }
      /** Fought 2 v 2 (Tate & Liza, docs/33). */
      double?: boolean
      /** An island trial (docs/62 §6): its Totem and allies are `team`, the captain greets. */
      trial?: string
    }
  /** `reason`: 'round' opens a new round; 'fainted' follows a K.O. in an easy area. */
  | { kind: 'center'; forced: boolean; reason?: 'fainted' | 'round' | 'wipe' }
  /** `returning`: beaten before, fled the catch, back for another try. */
  /** `titan`: a Titan (docs/62 §7), fought in two phases and never caught. */
  | { kind: 'boss'; dex: number; level: number; returning?: boolean; shiny?: boolean; talent?: boolean; titan?: boolean }
  /** Something on the ground: `qty` of an item, or Pokédollars (itemKey 'money', qty = ₽). */
  /** `pickup`: found after a win by this Pokémon's Pickup talent (docs/51), not a card of the deck. */
  | { kind: 'item'; entryId: string; itemKey: string; qty: number; pickup?: { uid: string; dex: number } }
  /** The Game Corner: play the slot machine as long as you like. */
  | { kind: 'casino' }
  /** Trick or Treat (docs/29): a ghost from the area's list, tempted with Treats and caught with a Trick Ball. */
  | { kind: 'trick'; dex: number; level: number; tier: TrickTier; isNew: boolean; shiny?: boolean; talent?: boolean }
  /** A Safari's wild card (docs/61 §4): Trick or Treat's gauge, with Bait and Safari Balls; nobody battles. */
  | { kind: 'safari'; dex: number; level: number; tier: TrickTier; isNew: boolean; shiny?: boolean; talent?: boolean }

/** A wild double battle's second Pokémon (docs/33). */
export interface WildPartner {
  dex: number
  level: number
  isNew: boolean
  shiny?: boolean
  talent?: boolean
}

export type ForceKind = EncounterKind | 'boss' | 'gym'

export interface EncounterContext {
  area: Area
  progress: AreaProgress
  data: GameData
  teamAvgLevel: number
  teamHurt: boolean
  /** Anyone on the team at 0 HP — easy areas send a Center next. */
  teamFainted?: boolean
  /** The starter on the team at 0 HP: during the set opening (docs/46), only this sends an easy area's Center. */
  starterFainted?: boolean
  isFirstInArea: boolean
  pokedex: readonly number[]
  /** Dev tools: force the next encounter type. */
  forceKind?: ForceKind | null
  /** The player's starter and character: picks the rival version of a trainer. */
  player?: PlayerSide | null
  /** Extreme mode: no Pokémon Center is ever dealt or sent. */
  noCenters?: boolean
  /**
   * Extreme mode's boon Centers (docs/47): only a round's opening Center and the deck's Center cards; none sent for a
   * hurt or fainted team.
   */
  boonCenters?: boolean
  /** Extreme mode's boon Centers: the team was K.O. here, so the next round opens with a Center that only swaps. */
  wipeCenter?: boolean
  /** × the wild shiny odds here: a Shiny Parade live event covering the area (liveEvents shinyBoost). */
  shinyBoost?: number
  /** The player's wild shiny odds, 0–1: the Shiny Charm's (general wildShinyChance). Unset = game_config's. */
  shinyChance?: number
  /**
   * The player's local hour (0–23): in an area that keeps the time (docs/32), only its half's wild Pokémon come.
   * Unset = every one, as where time isn't kept.
   */
  hour?: number | null
  /**
   * Real-player battles (docs/54): the team the server has for this area, when the save meets them here
   * (`areaVersusHere`). Without one, no deck holds the card and a card already dealt is set aside.
   */
  versusFoe?: AreaFoe | null
  /** The area's weather now (docs/62 §2): in Galar, the day's brings its types out more. */
  weather?: Weather | null
}

/** A real player's team (docs/54), not a trainer of the content. */
export const isPlayerFoe = (enc: Encounter | null | undefined): enc is Extract<Encounter, { kind: 'trainer' }> & { player: AreaFoe } =>
  enc?.kind === 'trainer' && !!enc.player

/** Every round the area asks for is done: its gym / legendary waits, and the area can clear. */
export const roundsComplete = (area: Area, progress: AreaProgress) =>
  area.roundsToClear != null && (progress.roundsDone ?? 0) >= area.roundsToClear

/** The next gym / Elite battle once every round is done, in order; each is fought until won. */
export function dueGym(area: Area, progress: AreaProgress, data: GameData, side?: PlayerSide | null): Trainer | null {
  if (!area.gyms.length || !roundsComplete(area, progress)) return null
  for (const id of gymsFor(area, data, side)) {
    if (progress.gymsDefeated.includes(id)) continue
    const t = data.trainers[id]
    if (t && t.team.length) return asSeenBy(t, side)
  }
  return null
}

function gymEncounter(area: Area, t: Trainer, data: GameData, side?: PlayerSide | null, save?: SaveData | null): Encounter {
  const gyms = gymsFor(area, data, side)
  // An island trial (docs/62 §6): the Totem and its allies instead of the captain's team.
  const trial = trialOf(data, t.id, save)
  return {
    kind: 'gym',
    trainerId: t.id,
    name: t.name,
    spriteUrl: t.spriteUrl,
    team: trial ? trialTeam(trial, data) : dealTrainerItems(t.team, t.items, data),
    role: t.role,
    badge: t.badge,
    index: gyms.indexOf(t.id) + 1,
    total: gyms.length,
    ...(trial && { trial: trial.id }),
  }
}

/**
 * Progression raids (docs/24) follow the Raid Battles switch (Admin → Events: off, on for the admin, on for everyone),
 * not the area that opens the day's raid: switched off for a player, a raid boss is a boss fight as before, so nothing
 * is ever left uncatchable.
 */
export const progressRaidsOn = (data: GameData): boolean => eventOn(data, 'raid')

/**
 * This boss is fought as a raid in its area once the area is completed, never as a boss. A small world's too (docs/21):
 * its raids are that world's, fought from inside it (`progressRaidReachable`).
 */
export const isRaidBoss = (data: GameData, b: BossDef): boolean => !!b.raid && progressRaidsOn(data)

/** The bosses an area fights as bosses (its raids left out). */
/** The roadblock this area's boss is (docs/61 §2), or null for a legendary (or no boss of that species there). */
export const roadblockOf = (area: Area | null | undefined, dex: number): RoadblockKind | null =>
  area?.legendaryBoss?.find((b) => b.dex === dex)?.roadblock ?? null

export const fightBosses = (area: Area, data: GameData): BossDef[] =>
  // A Titan (docs/62 §7) is a boss only while its switch is on.
  (area.legendaryBoss ?? []).filter((b) => !isRaidBoss(data, b) && (!b.titan || titansOn(data)))

/** An area's progression raids, in order. */
export const raidBosses = (area: Area, data: GameData): BossDef[] => (area.legendaryBoss ?? []).filter((b) => isRaidBoss(data, b))

/**
 * The legendary that can be challenged next, if any. Round bosses are due once every round is done; Victory Road style bosses
 * at their team-average threshold, strictly in order. A defeated boss is never re-offered this way. Raids aren't bosses.
 */
export function dueBoss(area: Area, progress: AreaProgress, teamAvgLevel: number, data: GameData): BossDef | null {
  for (const b of fightBosses(area, data)) {
    if (progress.bossesDefeated.includes(b.dex)) continue
    if (b.teamAvgThreshold != null) return teamAvgLevel >= b.teamAvgThreshold ? b : null
    return roundsComplete(area, progress) ? b : null
  }
  return null
}

/**
 * One roll of the wild shiny odds — the player's (the Shiny Charm, `odds`) or game_config's `shinyChance` — × a Shiny
 * Parade's boost for wild Pokémon.
 */
export const rollShiny = (data: GameData, rng: Rng, boost = 1, odds?: number): boolean => {
  const chance = Math.min(1, (odds ?? data.config.shinyChance ?? 0) * Math.max(1, boost))
  return chance > 0 && rng.next() < chance
}

/**
 * Legendaries and mythicals are shiny-locked wherever they're met in an area (a boss, a roamer, a wild one): a shiny one
 * comes only from Raid Battles' calendar (the user's rule, 2026-10-11).
 */
export const shinyLocked = (data: GameData, dex: number): boolean => isLegendary(data, dex)

/**
 * A boss's colours each time it shows up: always shiny when its data says so, else a fresh roll of the wild odds — so
 * declining the challenge, losing, or seeing it come back after the throw missed all roll again. Never for a
 * legendary or mythical (shinyLocked), but for a small world's mythical in its own area: that one is always shiny.
 */
const legendShiny = (b: BossDef, area: Area, data: GameData, rng?: Rng, odds?: number): boolean =>
  shinyLocked(data, b.dex)
    ? !!b.shiny && isWorldMythical(data, area.id, b.dex)
    : !!b.shiny || (!!rng && rollShiny(data, rng, 1, odds))

/**
 * This boss of this area has been caught. In a small world each boss is its own catch (docs/26 §2.5), noted in the
 * area's progress, so its shiny Haunter can be caught there with Haunters in the Box already; elsewhere a boss is one of
 * a kind and the Pokédex says it.
 */
export const bossCaught = (area: Area, progress: AreaProgress, pokedex: readonly number[], dex: number, data: GameData): boolean =>
  // A Titan (docs/62 §7) is beaten, never caught: done once beaten.
  area.legendaryBoss?.some((b) => b.dex === dex && b.titan)
    ? progress.bossesDefeated.includes(dex)
    : worldOfArea(data, area)
      ? !!progress.bossesCaught?.includes(dex)
      : pokedex.includes(dex)

/**
 * A legendary beaten earlier that fled the catch. It keeps coming back — one card per encounter deck — until caught. A
 * boss that is now a raid doesn't: its raid is where it's caught.
 */
export function fledLegendary(area: Area, progress: AreaProgress, pokedex: readonly number[], data: GameData): BossDef | null {
  return fightBosses(area, data).find((b) => progress.bossesDefeated.includes(b.dex) && !bossCaught(area, progress, pokedex, b.dex, data)) ?? null
}

const clampLevel = (lv: number, data: GameData) => Math.max(1, Math.min(data.config.maxLevel, Math.round(lv)))

/**
 * Where a scalesToTeam area puts its wild or trainer Pokémon, as offsets from the team average: the area's own range
 * for that kind, else ± game_config.scaleLevelSpread.
 */
export function scaleOffsetRange(area: Area, kind: 'wild' | 'trainer', data: GameData): LevelOffsetRange {
  const own = area.scaleOffsets?.[kind]
  if (own) return { min: Math.min(own.min, own.max), max: Math.max(own.min, own.max) }
  const spread = data.config.scaleLevelSpread
  return { min: -spread, max: spread }
}

/**
 * The levels a scalesToTeam area's foes can have right now: the lowest to the highest over the kinds it deals (wild,
 * trainers), around the team average.
 */
export function scaledLevelSpan(area: Area, teamAvgLevel: number, data: GameData): { min: number; max: number } {
  const kinds = (['wild', 'trainer'] as const).filter((k) => (k === 'wild' ? area.wildPool : area.trainerPool).length > 0)
  const ranges = (kinds.length ? kinds : (['wild'] as const)).map((k) => scaleOffsetRange(area, k, data))
  return {
    min: clampLevel(teamAvgLevel + Math.min(...ranges.map((r) => r.min)), data),
    max: clampLevel(teamAvgLevel + Math.max(...ranges.map((r) => r.max)), data),
  }
}

export function enemyLevel(
  base: number,
  ctx: Pick<EncounterContext, 'area' | 'data' | 'teamAvgLevel'>,
  rng: Rng,
  kind: 'wild' | 'trainer' = 'wild',
) {
  if (!ctx.area.scalesToTeam) return clampLevel(base, ctx.data)
  const { min, max } = scaleOffsetRange(ctx.area, kind, ctx.data)
  return clampLevel(ctx.teamAvgLevel + rng.int(min, max), ctx.data)
}

/**
 * The roaming legendaries — Raikou, Entei and Suicune. They have no area: once every Pokémon the config `requires`
 * has been **caught**, each one still uncaught has `chance` of turning up instead of the wild Pokémon that was
 * rolled, anywhere in its region. It arrives as a boss, so the legendary catch flow and the one-of-a-kind rule apply
 * unchanged; miss the throw and it goes back into the pool for next time.
 *
 * The gate is *caught*, not defeated, so knocking Lugia out and missing the ball does not start the beasts roaming.
 */
export function rollRoamer(ctx: EncounterContext, rng: Rng): Encounter | null {
  const roamers = ctx.data.config.roamers
  if (!roamers?.dex.length || roamers.chance <= 0) return null
  if (regionOfArea(ctx.area) !== roamers.regionId) return null
  const caught = new Set(ctx.pokedex)
  if (!roamers.requires.every((dex) => caught.has(dex))) return null
  for (const dex of roamers.dex) {
    if (caught.has(dex) || !ctx.data.species[dex]) continue
    // A roamer is met afresh each time it shows up, so each meeting rolls the wild odds.
    if (rng.next() < roamers.chance)
      return {
        kind: 'boss',
        dex,
        level: clampLevel(roamers.level, ctx.data),
        ...(!shinyLocked(ctx.data, dex) && rollShiny(ctx.data, rng, 1, ctx.shinyChance) && { shiny: true }),
      }
  }
  return null
}

/**
 * Each wild pool entry's weight for the next wild Pokémon. Where the area keeps the time (docs/32), the other half's
 * Pokémon weigh 0. Once the pity (game_config.newPokemonPity) kicks in, the ones not caught yet are weighted up
 * together so that they come `pityChance` of the time instead of their share of the pool, keeping their odds among
 * themselves. While it's ×1, or every one is caught (or none is), the pool's own weights.
 */
export function wildOdds(
  ctx: Pick<EncounterContext, 'area' | 'progress' | 'data' | 'pokedex' | 'hour' | 'weather'>,
): { entry: WildPoolEntry; weight: number; isNew: boolean }[] {
  const caught = new Set(ctx.pokedex)
  const pool = wildPoolAt(ctx.area, areaDayTime(ctx.data, ctx.area, ctx.hour))
  const odds = pool.map((entry) => {
    const sp = ctx.data.species[entry.dex]
    // Galar's weather of the day (docs/62 §4): its types come out more; no species is added or taken away.
    const times = sp ? weatherPoolTimes(ctx.area, ctx.data, ctx.weather, sp.type2 ? [sp.type1, sp.type2] : [sp.type1]) : 1
    return { entry, weight: sp ? Math.max(0, entry.weight) * times : 0, isNew: !caught.has(entry.dex) }
  })
  const total = odds.reduce((sum, o) => sum + o.weight, 0)
  const fresh = odds.reduce((sum, o) => sum + (o.isNew ? o.weight : 0), 0)
  if (!(fresh > 0 && fresh < total)) return odds
  const share = fresh / total
  const chance = pityChance(share, ctx.progress.roundsDone ?? 0, ctx.data.config.newPokemonPity)
  if (chance <= share) return odds
  if (chance >= 1) return odds.map((o) => (o.isNew ? o : { ...o, weight: 0 }))
  // × k on the new ones: k·fresh / (k·fresh + the caught ones) = chance.
  const k = (chance * (total - fresh)) / ((1 - chance) * fresh)
  return odds.map((o) => (o.isNew ? { ...o, weight: o.weight * k } : o))
}

export function rollWild(ctx: EncounterContext, rng: Rng): Encounter | null {
  const roamer = rollRoamer(ctx, rng)
  if (roamer) return roamer
  const entry = rng.weighted(wildOdds(ctx), (o) => o.weight)?.entry
  if (!entry) return null
  const level = enemyLevel(rng.int(entry.minLevel, Math.max(entry.minLevel, entry.maxLevel)), ctx, rng)
  const shiny = !shinyLocked(ctx.data, entry.dex) && rollShiny(ctx.data, rng, ctx.shinyBoost, ctx.shinyChance)
  return { kind: 'wild', dex: entry.dex, level, isNew: !ctx.pokedex.includes(entry.dex), ...(shiny && { shiny }) }
}

/**
 * A Trick or Treat card (docs/29): a ghost from the area's list (by its tier's weight), at a level of the area's range
 * (around the team for an area that scales), with the wild shiny odds. Null while the switch is off for the player or
 * the area has no ghosts: the card is then discarded like any card the area can't produce.
 */
export function rollTrick(ctx: EncounterContext, rng: Rng): Encounter | null {
  if (!trickDealable(ctx.data, ctx.area)) return null
  const ghost = pickTrickGhost(ctx.data, ctx.area.id, rng)
  if (!ghost) return null
  const level = enemyLevel(rng.int(ctx.area.minLevel, Math.max(ctx.area.minLevel, ctx.area.maxLevel)), ctx, rng)
  const shiny = !shinyLocked(ctx.data, ghost.dex) && rollShiny(ctx.data, rng, ctx.shinyBoost, ctx.shinyChance)
  return { kind: 'trick', dex: ghost.dex, level, tier: ghost.tier, isNew: !ctx.pokedex.includes(ghost.dex), ...(shiny && { shiny }) }
}

/**
 * A Safari's wild card (docs/61 §4): a Pokémon from the area's wild pool by its odds (the new-Pokémon pity and the time
 * of day as for a wild card; never a roamer), its tier from the Safari's list or its catch value, the wild shiny odds.
 */
export function rollSafari(ctx: EncounterContext, rng: Rng): Encounter | null {
  const entry = rng.weighted(wildOdds(ctx), (o) => o.weight)?.entry
  if (!entry) return null
  const level = enemyLevel(rng.int(entry.minLevel, Math.max(entry.minLevel, entry.maxLevel)), ctx, rng)
  const shiny = !shinyLocked(ctx.data, entry.dex) && rollShiny(ctx.data, rng, ctx.shinyBoost, ctx.shinyChance)
  const tier = safariTier(ctx.data, ctx.area.id, entry.dex)
  return { kind: 'safari', dex: entry.dex, level, tier, isNew: !ctx.pokedex.includes(entry.dex), ...(shiny && { shiny }) }
}

export function rollTrainer(ctx: EncounterContext, rng: Rng): Encounter | null {
  // A rival is met at a set point while rivals are on (docs/61 §5.2), never as a pool's card.
  const entry = rng.weighted(ctx.area.trainerPool, (t) =>
    ctx.data.trainers[t.trainerId] && !dealtAsMeeting(ctx.data, t.trainerId) ? t.weight : 0,
  )
  const trainer = entry && ctx.data.trainers[entry.trainerId]
  if (!trainer || !trainer.team.length) return null
  return {
    kind: 'trainer',
    trainerId: trainer.id,
    name: trainer.name,
    spriteUrl: trainer.spriteUrl,
    team: dealTrainerItems(
      trainer.team.map((m) => ({ dex: m.dex, level: enemyLevel(m.level, ctx, rng, 'trainer'), ...(m.shiny && { shiny: true }) })),
      trainer.items,
      ctx.data,
    ),
  }
}

const DECK_KINDS = ['wild', 'trainer', 'center', 'item', 'casino', 'trick', 'versus'] as const
export type DeckCounts = Record<(typeof DECK_KINDS)[number], number>

/**
 * Cards of each kind in one encounter deck. An area's encounter weight *is* its number of copies (v1.6): wild 8,
 * Center 1, item 1 → a 10-card deck. Kinds the area can't produce (no wild pool / no trainers / no loot / the Game Corner
 * or Trick or Treat switched off, or no ghosts) get none; an area with nothing at all gets a single Center.
 */
export function deckCounts(
  weights: Partial<Record<EncounterKind, number>>,
  can: { wild: boolean; trainer: boolean; item?: boolean; casino?: boolean; trick?: boolean; versus?: boolean },
): DeckCounts {
  const copies = (k: (typeof DECK_KINDS)[number]) =>
    (k === 'wild' && !can.wild) ||
    (k === 'trainer' && !can.trainer) ||
    (k === 'item' && !can.item) ||
    (k === 'casino' && !can.casino) ||
    (k === 'trick' && !can.trick) ||
    (k === 'versus' && !can.versus)
      ? 0
      : Math.max(0, Math.round(Number(weights[k]) || 0))
  const c = Object.fromEntries(DECK_KINDS.map((k) => [k, copies(k)])) as DeckCounts
  // A real player's card alone is no deck: it only comes on top of the area's own cards.
  return DECK_KINDS.some((k) => k !== 'versus' && c[k] > 0) ? c : { wild: 0, trainer: 0, center: 1, item: 0, casino: 0, trick: 0, versus: 0 }
}

/**
 * Cards in one freshly dealt encounter deck of the area (Trick or Treat counted only with the game data to say so; a
 * real player's card only with `foe`, a team waiting for the area: docs/54).
 */
export const deckSize = (area: Area, data?: GameData, foe = false) =>
  Object.values(deckCounts(area.encounterWeights, deckAbilities(area, data, foe))).reduce((a, b) => a + b, 0)

/** The next round dealt here is the set opening's first (docs/42): no Pokémon Center opens it. */
export const opensWithoutCenter = (area: Area, progress: AreaProgress, data: GameData): boolean =>
  openingRoundDue(area, progress, data) === 0

/** Cards in the next round dealt here: the set opening's round when one is due (docs/46), else a fresh deck's. */
export function nextRoundSize(area: Area, progress: AreaProgress, data: GameData, foe = false): number {
  const due = openingRoundDue(area, progress, data)
  return (due == null ? null : openingRound(area, data, due))?.length ?? deckSize(area, data, foe)
}

/** `foe`: a real player's team waits for the area (docs/54); the caller has checked the save meets them here. */
export const deckAbilities = (area: Area, data?: GameData, foe = false) => ({
  wild: area.wildPool.length > 0,
  trainer: area.trainerPool.length > 0,
  item: area.lootPool.length > 0,
  casino: !!data && gameCornerOn(data),
  trick: !!data && trickDealable(data, area),
  versus: foe,
})

/**
 * A freshly shuffled deck for the area (plus any `extra` cards, e.g. a returning legendary). No two Centers are dealt
 * back to back, and with `noCenterFirst` (the round opens with a Center, or one was just met) the first card isn't
 * one — as long as the deck has enough other cards to keep them apart. With `foe` (a real player's team waits for the
 * area, docs/54), its cards go among the round's last ones. Cards are drawn from the end of the array.
 */
export function buildDeck(
  area: Area,
  data: GameData,
  rng: Rng,
  extra: readonly DeckCard[] = [],
  opts: { noCenterFirst?: boolean; noCenters?: boolean; foe?: boolean } = {},
): DeckCard[] {
  const counts = deckCounts(area.encounterWeights, deckAbilities(area, data, !!opts.foe))
  const c = opts.noCenters ? { ...counts, center: 0 } : counts
  const shuffled = DECK_KINDS.filter((k) => k !== 'center' && k !== 'versus')
  const others = shuffle([...shuffled.flatMap((k) => Array.from({ length: c[k] }, (): DeckCard => k)), ...extra], rng)
  // Centers go into distinct gaps between the other cards (gap i = just before the i-th card drawn).
  const gaps = shuffle(Array.from({ length: others.length + 1 }, (_, i) => i).filter((i) => !opts.noCenterFirst || i > 0 || others.length === 0), rng)
  const perGap = new Map<number, number>()
  for (let n = 0; n < c.center; n++) {
    const g = gaps.length ? gaps[n % gaps.length]! : 0 // more Centers than gaps: some have to touch
    perGap.set(g, (perGap.get(g) ?? 0) + 1)
  }
  const order: DeckCard[] = [] // draw order
  for (let i = 0; i <= others.length; i++) {
    for (let k = 0; k < (perGap.get(i) ?? 0); k++) order.push('center')
    if (i < others.length) order.push(others[i]!)
  }
  return placeVersusCards(order, c.versus, areaVersusConfig(data).lastCards, rng).reverse()
}

export interface EncounterRoll {
  encounter: Encounter
  /** What's left of the area's encounter deck after this draw — save it. Null when no card was drawn. */
  deck: DeckCard[] | null
  /** What's left of the area's loot deck when this was an item find — save it too. */
  lootDeck: string[] | null
  /** The cards turned over for this encounter (a stale card can be discarded on the way). */
  drawn?: DeckCard[]
  /** A fresh deck was dealt: a new round began. */
  newRound?: boolean
  /** With `newRound`: the set opening's round the fresh deck is (docs/46), or null for a shuffled one. */
  opening?: number | null
}

/**
 * The Pokémon Center the game sends next on its own, if any (dev-forced types aside): a new round opens with one when
 * it would help, entering an area hurt, or after a K.O. in an easy area. Never two Centers in a row.
 */
export function dueCenter(ctx: EncounterContext): 'round' | 'hurt' | 'fainted' | null {
  const { area, data } = ctx
  // After a K.O. of the whole team in Extreme mode (docs/47) the round starts over at a Center, wherever this is.
  if (ctx.wipeCenter && !ctx.progress.deck?.length) return 'round'
  if (ctx.noCenters || ctx.progress.lastCenter) return null
  // A round is one full deck. A new one opens with a Pokémon Center, outside the deck, even with nothing to heal (the
  // user's call, 2026-10-27: a step of every round, on its gauge).
  // The set opening's first round (docs/46) starts straight with its first card: the game begins with a fight.
  if (data.config.encounterMode !== 'random' && !ctx.progress.deck?.length && !opensWithoutCenter(area, ctx.progress, data))
    return 'round'
  if (ctx.boonCenters) return null
  if (ctx.isFirstInArea && ctx.teamHurt && data.config.forcedCenterWhenHurt) return 'hurt'
  // During the set opening (docs/46), only the starter's K.O. sends one.
  const opening = openingRoundDue(area, ctx.progress, data) != null
  if (area.easyMode && (opening ? ctx.starterFainted : ctx.teamFainted)) return 'fainted'
  return null
}

/**
 * Dev-forced type → a new round's opening Center (when one would help) → forced Center (entering hurt; a K.O. in an
 * easy area) → the area's encounter deck (or, in 'random' mode, a weighted roll over {wild, trainer, center, item}).
 * A due gym battle or legendary is never dealt here: the player takes it on when ready (`challengeEncounter`).
 */
export function nextEncounter(ctx: EncounterContext, rng: Rng): EncounterRoll {
  // A Safari (docs/61 §4) deals no Pokémon Center while it's played: nothing there hurts.
  const roll = dealEncounter(safariDealable(ctx.data, ctx.area) ? { ...ctx, noCenters: true } : ctx, rng)
  return { ...roll, encounter: dealTalents(roll.encounter, ctx.data, rng) }
}

/**
 * Hidden talents (docs/51): who of this encounter carries its family's talent. A wild Pokémon, a ghost or a boss: a
 * legendary always, a starter line never, any other at the wild odds. A trainer's: a gym leader's, an Elite Four's or a
 * Champion's ace always, any other at the wild odds. Nothing is drawn while the switch is off.
 */
export function dealTalents(enc: Encounter, data: GameData, rng: Rng): Encounter {
  if (!talentsOn(data)) return enc
  switch (enc.kind) {
    case 'wild':
    case 'trick':
    case 'safari':
    case 'boss':
      return rollTalent(data, enc.dex, rng) ? { ...enc, talent: true } : enc
    case 'trainer':
    case 'gym': {
      // A real player's team is as it was (docs/54): their talents came with it.
      if (enc.kind === 'trainer' && enc.player) return enc
      const levels = enc.team.map((m) => m.level)
      const ace = enc.kind === 'gym' && enc.role !== 'trainer' ? levels.lastIndexOf(Math.max(...levels)) : -1
      const has = (dex: number) => {
        const chance = foeTalentChance(data, dex)
        return chance >= 1 || rng.next() < chance
      }
      const team = enc.team.map((m, i) => (i === ace || has(m.dex) ? { ...m, talent: true } : m))
      return { ...enc, team }
    }
    default:
      return enc
  }
}

function dealEncounter(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const { data } = ctx
  const fixed = (encounter: Encounter): EncounterRoll => ({ encounter, deck: null, lootDeck: null })
  if (ctx.forceKind === 'item') {
    const found = findItem(ctx, rng)
    if (found) return { ...found, deck: null }
  } else if (ctx.forceKind) {
    const forced = forcedEncounter(ctx, ctx.forceKind, rng)
    if (forced) return fixed(forced)
  }
  const due = dueCenter(ctx)
  if (due === 'round') {
    const { deck, opening } = dealRound(ctx, rng, true)
    // The opening Center is the round's first step: it is in the round's record, so its gauge shows it met.
    const reason = ctx.wipeCenter ? 'wipe' : 'round'
    return { encounter: { kind: 'center', forced: true, reason }, deck, lootDeck: null, drawn: ['center'], newRound: true, opening }
  }
  if (due === 'hurt') return fixed({ kind: 'center', forced: true })
  if (due === 'fainted') return fixed({ kind: 'center', forced: true, reason: 'fainted' })
  return data.config.encounterMode === 'random' ? rollWeighted(ctx, rng) : drawFromDeck(ctx, rng)
}

/**
 * The challenge waiting in this area, if any: the next gym / Elite battle once every round is done, else a legendary
 * that's due. The player picks it (CHALLENGE on the area screen) whenever they're ready, or keeps exploring. A boss
 * that isn't shiny-locked rolls `shinyOdds` (the player's, with the Shiny Charm), else game_config's.
 */
export function challengeEncounter(
  area: Area,
  progress: AreaProgress,
  data: GameData,
  teamAvgLevel: number,
  side?: PlayerSide | null,
  rng?: Rng,
  shinyOdds?: number,
  save?: SaveData | null,
): Encounter | null {
  const gym = dueGym(area, progress, data, side)
  // Hidden talents (docs/51): without a draw to make, a gym's ace and a legendary boss still carry theirs.
  const talents = (enc: Encounter) => dealTalents(enc, data, rng ?? NO_DRAW)
  if (gym) return talents(gymEncounter(area, gym, data, side, save))
  const boss = dueBoss(area, progress, teamAvgLevel, data)
  // A Titan (docs/62 §7) is never shiny: it is fought, not caught.
  if (boss?.titan) return { kind: 'boss', dex: boss.dex, level: boss.level, titan: true }
  return boss
    ? talents({ kind: 'boss', dex: boss.dex, level: boss.level, ...(legendShiny(boss, area, data, rng, shinyOdds) && { shiny: true }) })
    : null
}

/** An rng that never lands a chance: only what is sure happens. */
const NO_DRAW: Rng = { ...createRng(1), next: () => 1 }

/** The next encounter alone, for callers that don't keep decks (each call deals from fresh ones). */
export function rollEncounter(ctx: EncounterContext, rng: Rng): Encounter {
  return nextEncounter(ctx, rng).encounter
}

function findItem(ctx: EncounterContext, rng: Rng): { encounter: Encounter; lootDeck: string[] } | null {
  const loot = drawLoot(ctx.area, ctx.progress, ctx.data, rng)
  if (!loot) return null
  const disguise = loot.entry.disguise
  if (disguise) return { encounter: disguisedWild(disguise, loot.entry.itemKey, ctx, rng), lootDeck: loot.lootDeck }
  return { encounter: { kind: 'item', entryId: loot.entry.id, itemKey: loot.entry.itemKey, qty: loot.qty }, lootDeck: loot.lootDeck }
}

/**
 * The Pokémon a disguised find is (docs/61 §3): a wild one at a level of its row (around the team where the area
 * scales), with the wild shiny odds; it keeps the item it posed as, for the find to look like it until picked up.
 */
function disguisedWild(d: LootDisguise, itemKey: string, ctx: EncounterContext, rng: Rng): Encounter {
  const level = enemyLevel(rng.int(d.minLevel, Math.max(d.minLevel, d.maxLevel)), ctx, rng)
  const shiny = !shinyLocked(ctx.data, d.dex) && rollShiny(ctx.data, rng, ctx.shinyBoost, ctx.shinyChance)
  return { kind: 'wild', dex: d.dex, level, isNew: !ctx.pokedex.includes(d.dex), disguisedAs: itemKey, ...(shiny && { shiny }) }
}

function returningLegend(ctx: EncounterContext, rng: Rng): Encounter | null {
  const b = fledLegendary(ctx.area, ctx.progress, ctx.pokedex, ctx.data)
  return b ? { kind: 'boss', dex: b.dex, level: b.level, returning: true, ...(legendShiny(b, ctx.area, ctx.data, rng, ctx.shinyChance) && { shiny: true }) } : null
}

const cardEncounter = (card: 'wild' | 'trainer' | 'center' | 'casino' | 'trick' | 'versus', ctx: EncounterContext, rng: Rng): Encounter | null =>
  card === 'wild'
    ? safariDealable(ctx.data, ctx.area)
      ? rollSafari(ctx, rng)
      : rollWild(ctx, rng)
    : card === 'trainer'
      ? rollTrainer(ctx, rng)
      : card === 'casino'
        ? { kind: 'casino' }
        : card === 'trick'
          ? rollTrick(ctx, rng)
          : card === 'versus'
            ? playerEncounter(ctx)
            : { kind: 'center', forced: false }

/** A real player's card (docs/54): the team waiting for the area, else nothing (the card is set aside). */
const playerEncounter = (ctx: EncounterContext): Encounter | null => (ctx.versusFoe ? foeEncounter(ctx.versusFoe, ctx.data) : null)

/** The extra card a fled legendary adds to every deck dealt until it's caught. */
const legendCards = (ctx: EncounterContext): DeckCard[] => (fledLegendary(ctx.area, ctx.progress, ctx.pokedex, ctx.data) ? ['legend'] : [])

/** A new round's deck: the set opening's round when one is due here (docs/46), else a freshly shuffled one. */
function dealRound(ctx: EncounterContext, rng: Rng, noCenterFirst: boolean): { deck: DeckCard[]; opening: number | null } {
  const opening = openingRoundDue(ctx.area, ctx.progress, ctx.data)
  const round = opening == null ? null : openingRound(ctx.area, ctx.data, opening)
  if (round) return { deck: openingDeck(round, ctx.noCenters), opening }
  const deck = buildDeck(ctx.area, ctx.data, rng, legendCards(ctx), { noCenterFirst, noCenters: ctx.noCenters, foe: !!ctx.versusFoe })
  return { deck, opening: null }
}

/**
 * The set opening's card for a draw from its round's deck (docs/46): a wild Pokémon at its level (the wild shiny odds
 * still roll), a trainer with their prize, a find. Null when the content no longer has it: the card is discarded.
 */
function openingEncounter(card: OpeningCard, ctx: EncounterContext, rng: Rng, id: string): Encounter | null {
  const { data } = ctx
  if (card.kind === 'wild') {
    if (!data.species[card.dex]) return null
    const shiny = !shinyLocked(data, card.dex) && rollShiny(data, rng, ctx.shinyBoost, ctx.shinyChance)
    return { kind: 'wild', dex: card.dex, level: enemyLevel(card.level, ctx, rng), isNew: !ctx.pokedex.includes(card.dex), ...(shiny && { shiny }) }
  }
  if (card.kind === 'item')
    return card.itemKey === 'money' || data.items[card.itemKey]
      ? { kind: 'item', entryId: id, itemKey: card.itemKey, qty: Math.max(1, Math.round(card.qty)) }
      : null
  if (card.kind === 'trainer') {
    const t = data.trainers[card.trainerId]
    if (!t?.team.length) return null
    return {
      kind: 'trainer',
      trainerId: t.id,
      name: t.name,
      spriteUrl: t.spriteUrl,
      team: dealTrainerItems(
        t.team.map((m) => ({ dex: m.dex, level: enemyLevel(m.level, ctx, rng, 'trainer'), ...(m.shiny && { shiny: true }) })),
        t.items,
        data,
      ),
      ...(card.prize != null && { prize: Math.max(0, Math.round(card.prize)) }),
    }
  }
  return { kind: 'center', forced: false }
}

function drawFromDeck(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const afterCenter = !!ctx.progress.lastCenter
  let newRound = !ctx.progress.deck?.length
  let opening: number | null = newRound ? null : (ctx.progress.opening ?? null)
  const deal = () => {
    const dealt = dealRound(ctx, rng, afterCenter)
    opening = dealt.opening
    return dealt.deck
  }
  let deck = newRound ? deal() : [...ctx.progress.deck!]
  let drawn: DeckCard[] = []
  const roll = (r: Omit<EncounterRoll, 'opening'>): EncounterRoll => (r.newRound ? { ...r, opening } : r)
  // A card the area can no longer produce (content edited since the deal, a legendary caught) is discarded.
  const tries = 2 * (deck.length + deckSize(ctx.area, ctx.data, !!ctx.versusFoe) + 1)
  for (let i = 0; i < tries; i++) {
    if (!deck.length) {
      deck = deal()
      newRound = true
      drawn = []
      if (!deck.length) break // nothing the area can deal (Extreme mode, an area of Centers only)
    }
    let card = deck.pop()!
    // A Center dealt before Extreme mode's rule applied to this deck: set aside.
    if (card === 'center' && ctx.noCenters) {
      drawn.push(card)
      continue
    }
    if (card === 'center' && afterCenter) {
      // A Center right after a Center (e.g. a forced one came first): meet the next other card now, keep the Center
      // on top for later. Only Centers left can't happen any more (recordDraws spends them, ending the round); a save
      // from before that meets this one anyway: setting them aside emptied the deck mid-round and dealt a new one, so
      // the round in progress never counted (the gauge jumped back, a lair's legendary never came).
      let j = deck.length - 1
      while (j >= 0 && deck[j] === 'center') j--
      if (j >= 0) {
        card = deck.splice(j, 1)[0]!
        deck.push('center')
      }
    }
    // A set opening's round (docs/46): the card is its next one (switched off since the deal: as any deck's card).
    const set = opening == null ? null : openingRound(ctx.area, ctx.data, opening)
    if (set && card !== 'center') {
      const turnedOver = [...(newRound ? [] : (ctx.progress.drawn ?? [])), ...drawn]
      const planned = openingCardAt(set, turnedOver)
      drawn.push(card)
      const encounter = planned?.kind === card ? openingEncounter(planned, ctx, rng, `opening:${opening}:${turnedOver.length}`) : null
      if (encounter) return roll({ encounter, deck, lootDeck: null, drawn, newRound })
      continue
    }
    drawn.push(card)
    if (card === 'item') {
      const found = findItem(ctx, rng)
      if (found) return roll({ encounter: found.encounter, deck, lootDeck: found.lootDeck, drawn, newRound })
      continue
    }
    const encounter = card === 'legend' ? returningLegend(ctx, rng) : cardEncounter(card, ctx, rng)
    if (encounter) return roll({ encounter, deck, lootDeck: null, drawn, newRound })
  }
  return roll({ encounter: { kind: 'center', forced: false }, deck, lootDeck: null, drawn, newRound })
}

function rollWeighted(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const w = ctx.area.encounterWeights
  const can = deckAbilities(ctx.area, ctx.data)
  const kinds: { kind: 'wild' | 'trainer' | 'center' | 'item' | 'casino' | 'trick'; weight: number }[] = [
    { kind: 'wild', weight: can.wild ? w.wild : 0 },
    { kind: 'trainer', weight: can.trainer ? w.trainer : 0 },
    { kind: 'center', weight: ctx.noCenters ? 0 : w.center },
    { kind: 'item', weight: can.item ? (w.item ?? 0) : 0 },
    { kind: 'casino', weight: can.casino ? (w.casino ?? 0) : 0 },
    { kind: 'trick', weight: can.trick ? (w.trick ?? 0) : 0 },
  ]
  for (let attempt = 0; attempt < 10; attempt++) {
    const pick = rng.weighted(kinds, (k) => k.weight)?.kind ?? 'wild'
    if (pick === 'item') {
      const found = findItem(ctx, rng)
      if (found) return { encounter: found.encounter, deck: null, lootDeck: found.lootDeck }
      continue
    }
    const enc = cardEncounter(pick, ctx, rng)
    if (enc) return { encounter: enc, deck: null, lootDeck: null }
  }
  return { encounter: { kind: 'center', forced: false }, deck: null, lootDeck: null }
}

function forcedEncounter(ctx: EncounterContext, kind: ForceKind, rng: Rng): Encounter | null {
  switch (kind) {
    case 'gym': {
      const t = gymsFor(ctx.area, ctx.data, ctx.player)
        .map((id) => ctx.data.trainers[id])
        .find((x) => x && !ctx.progress.gymsDefeated.includes(x.id))
      return t ? gymEncounter(ctx.area, asSeenBy(t, ctx.player), ctx.data, ctx.player) : null
    }
    case 'wild':
      return rollWild(ctx, rng)
    case 'trainer':
      return rollTrainer(ctx, rng)
    case 'center':
      return { kind: 'center', forced: false }
    case 'casino':
      return { kind: 'casino' }
    case 'trick':
      return rollTrick(ctx, rng)
    case 'versus':
      return playerEncounter(ctx)
    case 'boss': {
      const b = fightBosses(ctx.area, ctx.data).find((x) => !ctx.progress.bossesDefeated.includes(x.dex))
      if (b?.titan) return { kind: 'boss', dex: b.dex, level: b.level, titan: true }
      return b ? { kind: 'boss', dex: b.dex, level: b.level, ...(legendShiny(b, ctx.area, ctx.data, rng, ctx.shinyChance) && { shiny: true }) } : returningLegend(ctx, rng)
    }
    default:
      return null
  }
}

export function canSkip(enc: Encounter, policy: SkipPolicy, skipsThisEncounter: number): boolean {
  if (enc.kind !== 'wild' && enc.kind !== 'trainer') return false
  // A Pokémon that posed as a find was picked up: there's no leaving it (docs/61 §3).
  if (enc.kind === 'wild' && enc.disguisedAs) return false
  if (policy === 'none') return false
  if (policy === 'once') return skipsThisEncounter < 1
  return true
}

/**
 * The upgrade level (dice and combos) foes fight at: a trainer's or legendary's own override, else the area's level,
 * else game_config.enemyUpgradeLevel.
 */
export function enemyUpgradeLevelFor(enc: Encounter, area: Area | undefined, data: GameData): number {
  let own: number | null | undefined
  if (enc.kind === 'gym' && enc.upgradeLevel != null) return enc.upgradeLevel
  if (enc.kind === 'trainer' || enc.kind === 'gym') own = data.trainers[enc.trainerId]?.upgradeLevel
  else if (enc.kind === 'boss') own = area?.legendaryBoss?.find((b) => b.dex === enc.dex)?.upgradeLevel
  return own ?? area?.enemyUpgradeLevel ?? data.config.enemyUpgradeLevel
}

/** Battle scene: the trainer's or legendary's own, else the area's, else the plain indoor one. */
export function battleBackgroundFor(enc: Encounter | null, area: Area | undefined, data: GameData): BattleBackground {
  let own: BattleBackground | null | undefined
  if (enc?.kind === 'trainer' || enc?.kind === 'gym') own = data.trainers[enc.trainerId]?.battleBackground
  else if (enc?.kind === 'boss') own = area?.legendaryBoss?.find((b) => b.dex === enc.dex)?.battleBackground
  return own ?? area?.battleBackground ?? 'default'
}
