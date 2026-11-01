// Real-player battles in areas (docs/54): a card of the area's deck that brings a real player's team, as it was when
// that area was their newest one. The server keeps the teams and picks one (migration 0099); the engine decides where
// the card goes, what it pays, and turns the server's answer into a trainer's fight.
import { trainerGoldFor } from './economy'
import { maxComboLevel, maxDieLevel } from './economy'
import { isExtreme } from './extreme'
import { eventOpenTo } from './events'
import { nightmareModeOf } from './nightmareMode'
import { whiteoutModeOf } from './whiteoutMode'
import { portalModeOf } from './portalMode'
import { timeRaceModeOf } from './timeRaceMode'
import { shuffle } from './deal'
import { talentsOn } from './talents'
import { worldOfArea } from './worldList'
import type { Rng } from './rng'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type Area,
  type AreaVersusConfig,
  type ComboKey,
  type DeckCard,
  type GameData,
  type PokeType,
  type SaveData,
  type TrainerMon,
} from './types'
import type { UpgradeLevels } from './damage'

export const AREA_VERSUS_DEFAULTS: AreaVersusConfig = {
  access: 'off',
  prizeMultiplier: 1.5,
  recentDays: 14,
  requestDays: 30,
  lastCards: 3,
}

/** The admin's numbers over the defaults; an odd number keeps its default. */
export function areaVersusConfig(data: GameData): AreaVersusConfig {
  const raw = data.config.areaVersus ?? {}
  const num = (v: unknown, fallback: number, min: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= min ? n : fallback
  }
  const d = AREA_VERSUS_DEFAULTS
  return {
    access: raw.access ?? d.access,
    prizeMultiplier: num(raw.prizeMultiplier, d.prizeMultiplier, 0),
    recentDays: Math.round(num(raw.recentDays, d.recentDays, 1)),
    requestDays: Math.round(num(raw.requestDays, d.requestDays, 1)),
    lastCards: Math.round(num(raw.lastCards, d.lastCards, 1)),
  }
}

/** The admin's switch (docs/15 §20). Off: no deck holds the card, the server offers nobody. */
export const areaVersusOn = (data: GameData): boolean => eventOpenTo(data.config.areaVersus?.access, data)

/** The area's real-player cards a round, as Admin › Areas sets them (its `versus` weight). */
export const versusWeight = (area: Area): number =>
  Math.max(0, Math.round(Number(area.encounterWeights.versus) || 0))

/**
 * This save meets real players in this area: the switch is on, the main game (never Extreme mode), and the area deals
 * the card — a main region's area or its secret one, not a small world's, a portal run's or the nightmare's.
 */
export function areaVersusHere(
  save: SaveData | null | undefined,
  area: Area | undefined,
  data: GameData,
): boolean {
  if (!save || !area || !areaVersusOn(data) || isExtreme(save)) return false
  if (
    worldOfArea(data, area) ||
    portalModeOf(area, data) ||
    nightmareModeOf(area, data) ||
    timeRaceModeOf(area, data) ||
    whiteoutModeOf(area, data)
  )
    return false
  return versusWeight(area) > 0
}

// ---------------------------------------------------------------- the team, as the server sends it

export interface AreaFoeMon {
  dex: number
  level: number
  shiny?: boolean
  /** It carries its family's hidden talent (docs/51). */
  talent?: boolean
}

/** A real player's team for an area (`area_versus_offer`). */
export interface AreaFoe {
  /** The owner's account. */
  id: string
  name: string
  /** Their look: an id from src/lib/avatars (the screens check it). */
  avatar: string
  /** Their look's sprite, as the game resolved it: the fight's foe sprite. */
  sprite?: string | null
  /** Their name shines gold ("I am just rich", docs/25). */
  rich?: boolean
  /** Already the player's friend. */
  friend?: boolean
  /** When they last played there (ms). */
  playedAt: number
  team: AreaFoeMon[]
  comboLevels: Partial<Record<ComboKey, number>>
  dieLevels: Partial<Record<PokeType, number>>
}

const int = (v: unknown, min: number, max: number): number | null => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}

/**
 * The server's answer, checked: unknown species left out, levels within 1–100 and the team within the team's size,
 * upgrade levels within the game's tracks (a missing one at 1). Null without a team left, or without an owner.
 */
export function parseAreaFoe(raw: unknown, data: GameData): AreaFoe | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null
  const team = (Array.isArray(r.team) ? r.team : [])
    .map((m: Record<string, unknown> | null) => {
      const dex = int(m?.dex, 0, 1e6) ?? 0
      const level = int(m?.level, 1, 100) ?? 1
      return {
        dex,
        level,
        ...(m?.shiny === true && { shiny: true }),
        ...(m?.talent === true && { talent: true }),
      }
    })
    .filter((m) => !!data.species[m.dex])
    .slice(0, Math.max(1, data.config.maxTeamSize))
  if (!team.length) return null
  const levels = (r.levels ?? {}) as { combo?: Record<string, unknown>; dice?: Record<string, unknown> }
  const comboLevels = Object.fromEntries(
    COMBO_KEYS.map((k) => [k, int(levels.combo?.[k], 1, Math.max(1, maxComboLevel(k, data))) ?? 1]),
  ) as Record<ComboKey, number>
  const dieLevels = Object.fromEntries(
    POKE_TYPES.map((t) => [t, int(levels.dice?.[t], 1, Math.max(1, maxDieLevel(t, data))) ?? 1]),
  ) as Record<PokeType, number>
  const at = new Date(
    typeof r.playedAt === 'string' || typeof r.playedAt === 'number' ? r.playedAt : NaN,
  ).getTime()
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 12) : 'Trainer',
    avatar: typeof r.avatar === 'string' ? r.avatar : 'red',
    ...(r.rich === true && { rich: true }),
    ...(r.friend === true && { friend: true }),
    playedAt: Number.isFinite(at) ? at : 0,
    team,
    comboLevels,
    dieLevels,
  }
}

// ---------------------------------------------------------------- the fight

/** The trainer id a real player's fight goes by: no trainer of the content has it. */
export const playerTrainerId = (foe: Pick<AreaFoe, 'id'>) => `player:${foe.id}`

/**
 * The card's encounter: a trainer's fight, their team in their order. Their talents count only while talents are on;
 * nothing else is drawn (their Pokémon are as they were). Null with nobody left that the game knows.
 */
export function foeEncounter(foe: AreaFoe, data: GameData) {
  const talents = talentsOn(data)
  const team: TrainerMon[] = foe.team
    .filter((m) => !!data.species[m.dex])
    .map((m) => ({
      dex: m.dex,
      level: m.level,
      ...(m.shiny && { shiny: true }),
      ...(m.talent && talents && { talent: true }),
    }))
  if (!team.length) return null
  return {
    kind: 'trainer' as const,
    trainerId: playerTrainerId(foe),
    name: foe.name,
    spriteUrl: foe.sprite ?? null,
    team,
    player: foe,
  }
}

/** Their dice and combo upgrades, as they had them: the levels their side fights at. */
export const foeLevels = (foe: AreaFoe): UpgradeLevels => ({
  comboLevels: { ...foe.comboLevels },
  dieLevels: { ...foe.dieLevels },
})

/** × a trainer's ₽ each K.O. of a real player's team pays. */
export const foeGoldMultiplier = (data: GameData): number => areaVersusConfig(data).prizeMultiplier

/**
 * What beating the whole team pays, before the talents that add to a K.O. (Pay Day, Amulet Coin): each Pokémon's
 * trainer ₽ (a cleared area's backtrack included) × the multiplier, as `applyVictory` pays them one K.O. at a time.
 */
export function foePrize(
  team: readonly { level: number }[],
  area: Area,
  cleared: boolean,
  data: GameData,
): number {
  const x = foeGoldMultiplier(data)
  return team.reduce((sum, m) => sum + Math.round(trainerGoldFor(m.level, area, cleared, data) * x), 0)
}

/** Whole days since they played there, for "Played here 2 days ago" (0 = today). */
export const daysAgo = (at: number, now: number): number => Math.max(0, Math.floor((now - at) / 86_400_000))

// ---------------------------------------------------------------- the deck

/**
 * The round's real-player cards, among its last `last` cards (the user's call: the round's last steps). `order` is the
 * draw order (first drawn first); the cards keep their order around them.
 */
export function placeVersusCards(order: readonly DeckCard[], n: number, last: number, rng: Rng): DeckCard[] {
  if (n <= 0) return [...order]
  const size = order.length + n
  const span = Math.min(size, Math.max(last, n))
  const slots = new Set(
    shuffle(
      Array.from({ length: span }, (_, i) => size - span + i),
      rng,
    ).slice(0, n),
  )
  const rest = [...order]
  return Array.from({ length: size }, (_, i): DeckCard => (slots.has(i) ? 'versus' : rest.shift()!))
}

/**
 * The round in progress gets its real-player cards once a team arrives for the area (the deck was dealt before the
 * server answered: the area just entered, a reload). Only a round that has none yet, met or to come, nor is a set
 * opening's; the cards go among its last ones, as a dealt deck's. The same save otherwise.
 */
export function withVersusCards(save: SaveData, area: Area, data: GameData, rng: Rng): SaveData {
  if (!areaVersusHere(save, area, data)) return save
  const p = save.areaProgress[area.id]
  const deck = p?.deck
  if (!p || !deck?.length || p.opening != null) return save
  if (deck.includes('versus') || (p.drawn ?? []).includes('versus')) return save
  // The deck is drawn from its end: the round's last cards are its first ones.
  const placed = placeVersusCards(
    [...deck].reverse(),
    versusWeight(area),
    areaVersusConfig(data).lastCards,
    rng,
  ).reverse()
  return { ...save, areaProgress: { ...save.areaProgress, [area.id]: { ...p, deck: placed } } }
}
