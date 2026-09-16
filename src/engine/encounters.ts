import { shuffle } from './deal'
import { drawLoot } from './items'
import type { Rng } from './rng'
import type {
  Area,
  AreaProgress,
  BossDef,
  DeckCard,
  EncounterKind,
  GameData,
  SkipPolicy,
  Trainer,
  TrainerMon,
  TrainerRole,
} from './types'

export type Encounter =
  | { kind: 'wild'; dex: number; level: number; isNew: boolean }
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
}

const gaugeFull = (area: Area, progress: AreaProgress) =>
  area.xpToUnlockNext != null && progress.xp >= area.xpToUnlockNext

/** The next gym / Elite battle once the gauge is full, in order; each is fought until won. */
export function dueGym(area: Area, progress: AreaProgress, data: GameData): Trainer | null {
  if (!area.gyms.length || !gaugeFull(area, progress)) return null
  for (const id of area.gyms) {
    if (progress.gymsDefeated.includes(id)) continue
    const t = data.trainers[id]
    if (t && t.team.length) return t
  }
  return null
}

function gymEncounter(area: Area, t: Trainer): Encounter {
  return {
    kind: 'gym',
    trainerId: t.id,
    name: t.name,
    spriteUrl: t.spriteUrl,
    team: t.team.map((m) => ({ ...m })),
    role: t.role,
    badge: t.badge,
    index: area.gyms.indexOf(t.id) + 1,
    total: area.gyms.length,
  }
}

/**
 * The legendary that can be challenged next, if any. Gauge bosses are due at 100 % gauge; Victory Road style bosses
 * at their team-average threshold, strictly in order. A defeated boss is never re-offered this way.
 */
export function dueBoss(area: Area, progress: AreaProgress, teamAvgLevel: number): BossDef | null {
  for (const b of area.legendaryBoss ?? []) {
    if (progress.bossesDefeated.includes(b.dex)) continue
    if (b.teamAvgThreshold != null) return teamAvgLevel >= b.teamAvgThreshold ? b : null
    return gaugeFull(area, progress) ? b : null
  }
  return null
}

/** A legendary beaten earlier that fled the catch. It keeps coming back — one card per encounter deck — until caught. */
export function fledLegendary(area: Area, progress: AreaProgress, pokedex: readonly number[]): BossDef | null {
  return (area.legendaryBoss ?? []).find((b) => progress.bossesDefeated.includes(b.dex) && !pokedex.includes(b.dex)) ?? null
}

const clampLevel = (lv: number, data: GameData) => Math.max(1, Math.min(data.config.maxLevel, Math.round(lv)))

export function enemyLevel(base: number, ctx: Pick<EncounterContext, 'area' | 'data' | 'teamAvgLevel'>, rng: Rng) {
  if (!ctx.area.scalesToTeam) return clampLevel(base, ctx.data)
  const spread = ctx.data.config.scaleLevelSpread
  return clampLevel(ctx.teamAvgLevel + rng.int(-spread, spread), ctx.data)
}

export function rollWild(ctx: EncounterContext, rng: Rng): Encounter | null {
  const entry = rng.weighted(ctx.area.wildPool, (w) => (ctx.data.species[w.dex] ? w.weight : 0))
  if (!entry) return null
  const level = enemyLevel(rng.int(entry.minLevel, Math.max(entry.minLevel, entry.maxLevel)), ctx, rng)
  return { kind: 'wild', dex: entry.dex, level, isNew: !ctx.pokedex.includes(entry.dex) }
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
    team: trainer.team.map((m) => ({ dex: m.dex, level: enemyLevel(m.level, ctx, rng) })),
  }
}

const DECK_KINDS = ['wild', 'trainer', 'center', 'item'] as const
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
  const c = { wild: copies('wild'), trainer: copies('trainer'), center: copies('center'), item: copies('item') }
  return c.wild + c.trainer + c.center + c.item > 0 ? c : { wild: 0, trainer: 0, center: 1, item: 0 }
}

/** Cards in one freshly dealt encounter deck of the area. */
export const deckSize = (area: Area) => Object.values(deckCounts(area.encounterWeights, deckAbilities(area))).reduce((a, b) => a + b, 0)

export const deckAbilities = (area: Area) => ({
  wild: area.wildPool.length > 0,
  trainer: area.trainerPool.length > 0,
  item: area.lootPool.length > 0,
})

/** A freshly shuffled deck for the area (plus any `extra` cards, e.g. a returning legendary). */
export function buildDeck(area: Area, data: GameData, rng: Rng, extra: readonly DeckCard[] = []): DeckCard[] {
  void data
  const c = deckCounts(area.encounterWeights, deckAbilities(area))
  const cards: DeckCard[] = [...DECK_KINDS.flatMap((k) => Array.from({ length: c[k] }, (): DeckCard => k)), ...extra]
  return shuffle(cards, rng)
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
  // A round is one full deck. A new one opens with a Pokémon Center, outside the deck — unless it would do nothing.
  if (data.config.encounterMode !== 'random' && !ctx.progress.deck?.length && ctx.centerUseful) {
    const deck = buildDeck(area, data, rng, legendCards(ctx))
    return { encounter: { kind: 'center', forced: true, reason: 'round' }, deck, lootDeck: null, drawn: [], newRound: true }
  }
  if (ctx.isFirstInArea && ctx.teamHurt && data.config.forcedCenterWhenHurt) return fixed({ kind: 'center', forced: true })
  if (area.easyMode && ctx.teamFainted) return fixed({ kind: 'center', forced: true, reason: 'fainted' })
  return data.config.encounterMode === 'random' ? rollWeighted(ctx, rng) : drawFromDeck(ctx, rng)
}

/**
 * The challenge waiting in this area, if any: the next gym / Elite battle once the gauge is full, else a legendary
 * that's due. The player picks it (CHALLENGE on the area screen) whenever they're ready, or keeps exploring.
 */
export function challengeEncounter(area: Area, progress: AreaProgress, data: GameData, teamAvgLevel: number): Encounter | null {
  const gym = dueGym(area, progress, data)
  if (gym) return gymEncounter(area, gym)
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

const cardEncounter = (card: 'wild' | 'trainer' | 'center', ctx: EncounterContext, rng: Rng): Encounter | null =>
  card === 'wild' ? rollWild(ctx, rng) : card === 'trainer' ? rollTrainer(ctx, rng) : { kind: 'center', forced: false }

/** The extra card a fled legendary adds to every deck dealt until it's caught. */
const legendCards = (ctx: EncounterContext): DeckCard[] => (fledLegendary(ctx.area, ctx.progress, ctx.pokedex) ? ['legend'] : [])

function drawFromDeck(ctx: EncounterContext, rng: Rng): EncounterRoll {
  let newRound = !ctx.progress.deck?.length
  let deck = newRound ? buildDeck(ctx.area, ctx.data, rng, legendCards(ctx)) : [...ctx.progress.deck!]
  let drawn: DeckCard[] = []
  // A card the area can no longer produce (content edited since the deal, a legendary caught) is discarded.
  const tries = 2 * (deck.length + deckSize(ctx.area) + 1)
  for (let i = 0; i < tries; i++) {
    if (!deck.length) {
      deck = buildDeck(ctx.area, ctx.data, rng, legendCards(ctx))
      newRound = true
      drawn = []
    }
    const card = deck.pop()!
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
  const kinds: { kind: 'wild' | 'trainer' | 'center' | 'item'; weight: number }[] = [
    { kind: 'wild', weight: can.wild ? w.wild : 0 },
    { kind: 'trainer', weight: can.trainer ? w.trainer : 0 },
    { kind: 'center', weight: w.center },
    { kind: 'item', weight: can.item ? (w.item ?? 0) : 0 },
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
      const t = ctx.area.gyms.map((id) => ctx.data.trainers[id]).find((x) => x && !ctx.progress.gymsDefeated.includes(x.id))
      return t ? gymEncounter(ctx.area, t) : null
    }
    case 'wild':
      return rollWild(ctx, rng)
    case 'trainer':
      return rollTrainer(ctx, rng)
    case 'center':
      return { kind: 'center', forced: false }
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
