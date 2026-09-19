import { shuffle } from './deal'
import { drawLoot } from './items'
import { asSeenBy, gymsFor, type PlayerSide } from './rival'
import type { Rng } from './rng'
import { dealTrainerItems } from './trainerItems'
import type {
  Area,
  AreaProgress,
  BattleBackground,
  BossDef,
  DeckCard,
  EncounterKind,
  GameData,
  LevelOffsetRange,
  SkipPolicy,
  Trainer,
  TrainerMon,
  TrainerRole,
} from './types'

export type Encounter =
  | { kind: 'wild'; dex: number; level: number; isNew: boolean; shiny?: boolean }
  | { kind: 'trainer'; trainerId: string; name: string; spriteUrl: string | null; team: TrainerMon[] }
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
    }
  /** `reason`: 'round' opens a new round; 'fainted' follows a K.O. in an easy area. */
  | { kind: 'center'; forced: boolean; reason?: 'fainted' | 'round' }
  /** `returning`: beaten before, fled the catch, back for another try. */
  | { kind: 'boss'; dex: number; level: number; returning?: boolean }
  /** Something on the ground: `qty` of an item, or Pokédollars (itemKey 'money', qty = ₽). */
  | { kind: 'item'; entryId: string; itemKey: string; qty: number }
  /** The Game Corner: play the slot machine as long as you like. */
  | { kind: 'casino' }

export type ForceKind = EncounterKind | 'boss' | 'gym'

export interface EncounterContext {
  area: Area
  progress: AreaProgress
  data: GameData
  teamAvgLevel: number
  teamHurt: boolean
  /** Anyone on the team at 0 HP — easy areas send a Center next. */
  teamFainted?: boolean
  isFirstInArea: boolean
  pokedex: readonly number[]
  /** Dev tools: force the next encounter type. */
  forceKind?: ForceKind | null
  /**
   * A Pokémon Center would do something (someone hurt, or a Pokémon in the Box to swap in) — then every new round
   * opens with one. Unset = no round Center.
   */
  centerUseful?: boolean
  /** The player's starter and character: picks the rival version of a trainer. */
  player?: PlayerSide | null
}

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

function gymEncounter(area: Area, t: Trainer, data: GameData, side?: PlayerSide | null): Encounter {
  const gyms = gymsFor(area, data, side)
  return {
    kind: 'gym',
    trainerId: t.id,
    name: t.name,
    spriteUrl: t.spriteUrl,
    team: dealTrainerItems(t.team, t.items, data),
    role: t.role,
    badge: t.badge,
    index: gyms.indexOf(t.id) + 1,
    total: gyms.length,
  }
}

/**
 * The legendary that can be challenged next, if any. Round bosses are due once every round is done; Victory Road style bosses
 * at their team-average threshold, strictly in order. A defeated boss is never re-offered this way.
 */
export function dueBoss(area: Area, progress: AreaProgress, teamAvgLevel: number): BossDef | null {
  for (const b of area.legendaryBoss ?? []) {
    if (progress.bossesDefeated.includes(b.dex)) continue
    if (b.teamAvgThreshold != null) return teamAvgLevel >= b.teamAvgThreshold ? b : null
    return roundsComplete(area, progress) ? b : null
  }
  return null
}

/** A legendary beaten earlier that fled the catch. It keeps coming back — one card per encounter deck — until caught. */
export function fledLegendary(area: Area, progress: AreaProgress, pokedex: readonly number[]): BossDef | null {
  return (area.legendaryBoss ?? []).find((b) => progress.bossesDefeated.includes(b.dex) && !pokedex.includes(b.dex)) ?? null
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

export function rollWild(ctx: EncounterContext, rng: Rng): Encounter | null {
  const entry = rng.weighted(ctx.area.wildPool, (w) => (ctx.data.species[w.dex] ? w.weight : 0))
  if (!entry) return null
  const level = enemyLevel(rng.int(entry.minLevel, Math.max(entry.minLevel, entry.maxLevel)), ctx, rng)
  const chance = ctx.data.config.shinyChance ?? 0
  const shiny = chance > 0 && rng.next() < chance
  return { kind: 'wild', dex: entry.dex, level, isNew: !ctx.pokedex.includes(entry.dex), ...(shiny && { shiny }) }
}

export function rollTrainer(ctx: EncounterContext, rng: Rng): Encounter | null {
  const entry = rng.weighted(ctx.area.trainerPool, (t) => (ctx.data.trainers[t.trainerId] ? t.weight : 0))
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

const DECK_KINDS = ['wild', 'trainer', 'center', 'item', 'casino'] as const
export type DeckCounts = Record<(typeof DECK_KINDS)[number], number>

/**
 * Cards of each kind in one encounter deck. An area's encounter weight *is* its number of copies (v1.6): wild 8,
 * Center 1, item 1 → a 10-card deck. Kinds the area can't produce (no wild pool / no trainers / no loot) get none; an
 * area with nothing at all gets a single Center.
 */
export function deckCounts(
  weights: Partial<Record<EncounterKind, number>>,
  can: { wild: boolean; trainer: boolean; item?: boolean },
): DeckCounts {
  const copies = (k: (typeof DECK_KINDS)[number]) =>
    (k === 'wild' && !can.wild) || (k === 'trainer' && !can.trainer) || (k === 'item' && !can.item)
      ? 0
      : Math.max(0, Math.round(Number(weights[k]) || 0))
  const c = { wild: copies('wild'), trainer: copies('trainer'), center: copies('center'), item: copies('item'), casino: copies('casino') }
  return c.wild + c.trainer + c.center + c.item + c.casino > 0 ? c : { wild: 0, trainer: 0, center: 1, item: 0, casino: 0 }
}

/** Cards in one freshly dealt encounter deck of the area. */
export const deckSize = (area: Area) => Object.values(deckCounts(area.encounterWeights, deckAbilities(area))).reduce((a, b) => a + b, 0)

export const deckAbilities = (area: Area) => ({
  wild: area.wildPool.length > 0,
  trainer: area.trainerPool.length > 0,
  item: area.lootPool.length > 0,
})

/**
 * A freshly shuffled deck for the area (plus any `extra` cards, e.g. a returning legendary). No two Centers are dealt
 * back to back, and with `noCenterFirst` (the round opens with a Center, or one was just met) the first card isn't
 * one — as long as the deck has enough other cards to keep them apart. Cards are drawn from the end of the array.
 */
export function buildDeck(
  area: Area,
  data: GameData,
  rng: Rng,
  extra: readonly DeckCard[] = [],
  opts: { noCenterFirst?: boolean } = {},
): DeckCard[] {
  void data
  const c = deckCounts(area.encounterWeights, deckAbilities(area))
  const others = shuffle([...DECK_KINDS.filter((k) => k !== 'center').flatMap((k) => Array.from({ length: c[k] }, (): DeckCard => k)), ...extra], rng)
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
  return order.reverse()
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
}

/**
 * The Pokémon Center the game sends next on its own, if any (dev-forced types aside): a new round opens with one when
 * it would help, entering an area hurt, or after a K.O. in an easy area. Never two Centers in a row.
 */
export function dueCenter(ctx: EncounterContext): 'round' | 'hurt' | 'fainted' | null {
  const { area, data } = ctx
  if (ctx.progress.lastCenter) return null
  // A round is one full deck. A new one opens with a Pokémon Center, outside the deck — unless it would do nothing.
  if (data.config.encounterMode !== 'random' && !ctx.progress.deck?.length && ctx.centerUseful) return 'round'
  if (ctx.isFirstInArea && ctx.teamHurt && data.config.forcedCenterWhenHurt) return 'hurt'
  if (area.easyMode && ctx.teamFainted) return 'fainted'
  return null
}

/**
 * The next encounter is a Pokémon Center, known without drawing: one the game sends (`dueCenter`), or a Center card
 * on top of the deck (none right after a Center). Centers cost no energy, so this is what 0 energy still allows.
 */
export function centerIsNext(ctx: EncounterContext): boolean {
  if (dueCenter(ctx)) return true
  const deck = ctx.progress.deck
  return ctx.data.config.encounterMode !== 'random' && !ctx.progress.lastCenter && !!deck?.length && deck[deck.length - 1] === 'center'
}

/**
 * Dev-forced type → a new round's opening Center (when one would help) → forced Center (entering hurt; a K.O. in an
 * easy area) → the area's encounter deck (or, in 'random' mode, a weighted roll over {wild, trainer, center, item}).
 * A due gym battle or legendary is never dealt here: the player takes it on when ready (`challengeEncounter`).
 */
export function nextEncounter(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const { area, data } = ctx
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
    const deck = buildDeck(area, data, rng, legendCards(ctx), { noCenterFirst: true })
    return { encounter: { kind: 'center', forced: true, reason: 'round' }, deck, lootDeck: null, drawn: [], newRound: true }
  }
  if (due === 'hurt') return fixed({ kind: 'center', forced: true })
  if (due === 'fainted') return fixed({ kind: 'center', forced: true, reason: 'fainted' })
  return data.config.encounterMode === 'random' ? rollWeighted(ctx, rng) : drawFromDeck(ctx, rng)
}

/**
 * The challenge waiting in this area, if any: the next gym / Elite battle once every round is done, else a legendary
 * that's due. The player picks it (CHALLENGE on the area screen) whenever they're ready, or keeps exploring.
 */
export function challengeEncounter(
  area: Area,
  progress: AreaProgress,
  data: GameData,
  teamAvgLevel: number,
  side?: PlayerSide | null,
): Encounter | null {
  const gym = dueGym(area, progress, data, side)
  if (gym) return gymEncounter(area, gym, data, side)
  const boss = dueBoss(area, progress, teamAvgLevel)
  return boss ? { kind: 'boss', dex: boss.dex, level: boss.level } : null
}

/** The next encounter alone, for callers that don't keep decks (each call deals from fresh ones). */
export function rollEncounter(ctx: EncounterContext, rng: Rng): Encounter {
  return nextEncounter(ctx, rng).encounter
}

function findItem(ctx: EncounterContext, rng: Rng): { encounter: Encounter; lootDeck: string[] } | null {
  const loot = drawLoot(ctx.area, ctx.progress, ctx.data, rng)
  return loot
    ? { encounter: { kind: 'item', entryId: loot.entry.id, itemKey: loot.entry.itemKey, qty: loot.qty }, lootDeck: loot.lootDeck }
    : null
}

function returningLegend(ctx: EncounterContext): Encounter | null {
  const b = fledLegendary(ctx.area, ctx.progress, ctx.pokedex)
  return b ? { kind: 'boss', dex: b.dex, level: b.level, returning: true } : null
}

const cardEncounter = (card: 'wild' | 'trainer' | 'center' | 'casino', ctx: EncounterContext, rng: Rng): Encounter | null =>
  card === 'wild'
    ? rollWild(ctx, rng)
    : card === 'trainer'
      ? rollTrainer(ctx, rng)
      : card === 'casino'
        ? { kind: 'casino' }
        : { kind: 'center', forced: false }

/** The extra card a fled legendary adds to every deck dealt until it's caught. */
const legendCards = (ctx: EncounterContext): DeckCard[] => (fledLegendary(ctx.area, ctx.progress, ctx.pokedex) ? ['legend'] : [])

function drawFromDeck(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const afterCenter = !!ctx.progress.lastCenter
  const deal = () => buildDeck(ctx.area, ctx.data, rng, legendCards(ctx), { noCenterFirst: afterCenter })
  let newRound = !ctx.progress.deck?.length
  let deck = newRound ? deal() : [...ctx.progress.deck!]
  let drawn: DeckCard[] = []
  // A card the area can no longer produce (content edited since the deal, a legendary caught) is discarded.
  const tries = 2 * (deck.length + deckSize(ctx.area) + 1)
  for (let i = 0; i < tries; i++) {
    if (!deck.length) {
      deck = deal()
      newRound = true
      drawn = []
    }
    let card = deck.pop()!
    if (card === 'center' && afterCenter) {
      // A Center right after a Center (e.g. a forced one came first): meet the next other card now, keep the Center
      // on top for later. Only Centers left → this one is set aside.
      let j = deck.length - 1
      while (j >= 0 && deck[j] === 'center') j--
      if (j < 0) {
        drawn.push(card)
        continue
      }
      card = deck.splice(j, 1)[0]!
      deck.push('center')
    }
    drawn.push(card)
    if (card === 'item') {
      const found = findItem(ctx, rng)
      if (found) return { encounter: found.encounter, deck, lootDeck: found.lootDeck, drawn, newRound }
      continue
    }
    const encounter = card === 'legend' ? returningLegend(ctx) : cardEncounter(card, ctx, rng)
    if (encounter) return { encounter, deck, lootDeck: null, drawn, newRound }
  }
  return { encounter: { kind: 'center', forced: false }, deck, lootDeck: null, drawn, newRound }
}

function rollWeighted(ctx: EncounterContext, rng: Rng): EncounterRoll {
  const w = ctx.area.encounterWeights
  const can = deckAbilities(ctx.area)
  const kinds: { kind: 'wild' | 'trainer' | 'center' | 'item' | 'casino'; weight: number }[] = [
    { kind: 'wild', weight: can.wild ? w.wild : 0 },
    { kind: 'trainer', weight: can.trainer ? w.trainer : 0 },
    { kind: 'center', weight: w.center },
    { kind: 'item', weight: can.item ? (w.item ?? 0) : 0 },
    { kind: 'casino', weight: w.casino ?? 0 },
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
    case 'boss': {
      const b = (ctx.area.legendaryBoss ?? []).find((x) => !ctx.progress.bossesDefeated.includes(x.dex))
      return b ? { kind: 'boss', dex: b.dex, level: b.level } : returningLegend(ctx)
    }
    default:
      return null
  }
}

export function canSkip(enc: Encounter, policy: SkipPolicy, skipsThisEncounter: number): boolean {
  if (enc.kind !== 'wild' && enc.kind !== 'trainer') return false
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
