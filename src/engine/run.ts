// Pure state transitions on the save: new game, rewards, catches, wipes, center, team, shop, upgrades.
import { getSpecies, linearAreas } from './data'
import { KANTO, evolutionGate, inWorldRegion, regionOf, regionOfArea } from './regions'
import { asSeenBy, gymsFor, playerSideOf } from './rival'
import { nextComboCost, nextDieCost, pokemonXp, trainerGoldFor, healAmount, multiExpShareFor } from './economy'
import { bossCaught, deckAbilities, deckCounts, fightBosses, roundsComplete } from './encounters'
import { centersOn, healItemsOn, wipeHeals } from './extreme'
import { addFossil, isReviving } from './fossils'
import { LEGACY_GAUGE } from './legacyGauge'
import { itemOnFor, MONEY, sellPrice, shopSells, usableIn } from './items'
import { earnedGold } from './liveEvents'
import { canStartPortal, inPortalRun, markPortalWonSeen, portalModeOf, portalStateOf, portalWipe } from './portal'
import { canStartNightmare, inNightmare, markNightmareWonSeen, nightmareStateOf, nightmareWipe } from './nightmare'
import { areaOpenAt } from './worldList'
import {
  averageLevel,
  createInstance,
  evolve,
  gainXp,
  instanceMaxHp,
  levelEvolutions,
  preferUnowned,
  stoneEvolution,
  linkEvolution,
  xpToNext,
  type ProgressEvent,
} from './progression'
import { createRng, type Rng } from './rng'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type Area,
  type AreaProgress,
  type ComboKey,
  type GameData,
  type LiveEvent,
  type PokeType,
  type PlayerProfile,
  type PokemonInstance,
  type DeckCard,
  type SaveData,
  type TrainerRole,
  type UnlockCondition,
} from './types'

export const emptyProgress = (): AreaProgress => ({
  roundsDone: 0,
  cleared: false,
  bossDefeated: false,
  bossesDefeated: [],
  gymsDefeated: [],
})

export function newSave(starterDex: number, data: GameData, now: number, newId: () => string, player?: PlayerProfile): SaveData {
  const inst = createInstance(starterDex, data.config.starterLevel, data, newId(), now)
  const comboLevels = Object.fromEntries(COMBO_KEYS.map((k) => [k, 1])) as Record<ComboKey, number>
  const dieLevels = Object.fromEntries(POKE_TYPES.map((t) => [t, 1])) as Record<PokeType, number>
  return {
    version: 1,
    updatedAt: now,
    gold: 0,
    pokedex: [starterDex],
    box: [inst],
    team: [inst.id],
    inventory: Object.fromEntries(Object.entries(data.config.startInventory ?? {}).filter(([k, q]) => data.items[k] && q > 0)),
    comboLevels,
    dieLevels,
    currentAreaId: linearAreas(data, data.regions[0]?.id)[0]?.id ?? data.areas[0]?.id ?? '',
    areaProgress: {},
    settings: { sfx: true, sound: true, reducedMotion: false, multiExp: true },
    hpScale: data.config.hpMultiplier,
    // A new game starts in the first region, with none parked behind it.
    region: data.regions[0]?.id ?? KANTO,
    parked: {},
    ...(player ? { player } : {}),
  }
}

/**
 * Current HP is stored in points, measured against the hpMultiplier of the day. When the admin changes it, rescale
 * every Pokémon so its HP % stays put (a K.O. stays a K.O.). Returns the same save when nothing changes.
 */
export function syncHpScale(save: SaveData, data: GameData): SaveData {
  const now = data.config.hpMultiplier
  const seen = save.hpScale ?? 1
  if (seen === now) return save.hpScale === undefined ? { ...save, hpScale: now } : save
  const f = now / seen
  return {
    ...save,
    hpScale: now,
    box: save.box.map((p) => ({
      ...p,
      currentHp: p.currentHp <= 0 ? 0 : Math.max(1, Math.min(instanceMaxHp(p, data), Math.round(p.currentHp * f))),
    })),
  }
}

export const progressOf = (save: SaveData, areaId: string): AreaProgress => ({
  ...emptyProgress(),
  ...save.areaProgress[areaId],
})

export const getInstance = (save: SaveData, id: string) => save.box.find((p) => p.id === id)

export const teamOf = (save: SaveData): PokemonInstance[] =>
  save.team.map((id) => getInstance(save, id)).filter((p): p is PokemonInstance => !!p)

export const teamAverageLevel = (save: SaveData) => averageLevel(teamOf(save).map((p) => p.level))

export function isTeamHurt(save: SaveData, data: GameData): boolean {
  return teamOf(save).some((p) => p.currentHp < instanceMaxHp(p, data))
}

export function hasAbleTeam(save: SaveData): boolean {
  return teamOf(save).some((p) => p.currentHp > 0)
}

/** Anyone on the team at 0 HP (easy areas send a Center next). */
export function hasFaintedMember(save: SaveData): boolean {
  return teamOf(save).some((p) => p.currentHp <= 0)
}

/** Store what's left of an area's encounter deck. */
export function setAreaDeck(save: SaveData, areaId: string, deck: DeckCard[]): SaveData {
  return withProgress(save, areaId, { ...progressOf(save, areaId), deck })
}

/**
 * Store what's left of the decks an encounter was drawn from (encounter deck, loot deck), and the round: a fresh deck
 * starts a new one (its number goes up) and the cards turned over join the round's record. Call it for every encounter met (challenges too): it also notes whether
 * this one was a Pokémon Center, so the next one isn't.
 */
export function recordDraws(
  save: SaveData,
  areaId: string,
  roll: { encounter?: { kind: string }; deck: DeckCard[] | null; lootDeck?: string[] | null; drawn?: DeckCard[]; newRound?: boolean },
): SaveData {
  const p = progressOf(save, areaId)
  const lastCenter = roll.encounter ? roll.encounter.kind === 'center' : p.lastCenter
  if (!roll.deck && !roll.lootDeck) {
    return spendLoneCenters(!!lastCenter === !!p.lastCenter ? save : withProgress(save, areaId, { ...p, lastCenter }), areaId)
  }
  const round = roll.newRound ? (p.round ?? 0) + 1 : p.round
  const drawn = roll.newRound ? (roll.drawn ?? []) : roll.drawn ? [...(p.drawn ?? []), ...roll.drawn] : p.drawn
  return spendLoneCenters(
    withProgress(save, areaId, {
      ...p,
      ...(roll.deck ? { deck: roll.deck } : {}),
      ...(roll.lootDeck ? { lootDeck: roll.lootDeck } : {}),
      ...(round != null ? { round } : {}),
      ...(drawn ? { drawn } : {}),
      ...(roll.newRound ? { roundCounted: false } : {}),
      lastCenter,
    }),
    areaId,
  )
}

/**
 * Right after a Pokémon Center, Centers left on their own in the deck can't be met (never two in a row): they are
 * turned over at once and the round ends, so it counts. A legendary's lair is mostly Centers; set aside one draw at a
 * time instead, they emptied the deck in the middle of a draw, a new one was dealt and the round never counted.
 */
function spendLoneCenters(save: SaveData, areaId: string): SaveData {
  const p = progressOf(save, areaId)
  if (!p.lastCenter || !p.deck?.length || p.deck.some((c) => c !== 'center')) return save
  return withProgress(save, areaId, { ...p, deck: [], drawn: [...(p.drawn ?? []), ...p.deck] })
}

/** A Pokémon Center would do something: a Pokémon (team or Box) below full HP, or one in the Box to swap in. */
export function centerWouldHelp(save: SaveData, data: GameData): boolean {
  return save.box.length > save.team.length || save.box.some((p) => p.currentHp < instanceMaxHp(p, data))
}

/** Take a find: an item into the bag, or Pokédollars. A one-time find is struck off the area's loot table. */
export function pickUpItem(
  save: SaveData,
  areaId: string,
  find: { entryId: string; itemKey: string; qty: number },
  data: GameData,
  now = Date.now(),
  newId: () => string = () => `fossil-${now}`,
  live: LiveEvent | null = null,
): SaveData {
  const qty = Math.max(0, Math.floor(find.qty))
  const item = data.items[find.itemKey]
  let next: SaveData =
    find.itemKey === MONEY
      ? { ...save, gold: save.gold + earnedGold(qty, live).amount }
      : item?.effect.kind === 'fossil'
        ? addFossil(save, item, data, now, newId()) // straight to the Box, reviving
        : item
          ? { ...save, inventory: { ...save.inventory, [find.itemKey]: (save.inventory[find.itemKey] ?? 0) + qty } }
          : save
  const entry = data.areas.find((a) => a.id === areaId)?.lootPool.find((e) => e.id === find.entryId)
  if (entry?.unique) {
    const p = progressOf(next, areaId)
    const found = p.uniqueFound ?? []
    if (!found.includes(entry.id)) next = withProgress(next, areaId, { ...p, uniqueFound: [...found, entry.id] })
  }
  return next
}

/**
 * Every Pokémon the player owns here: the Box (team included) and the Day Care's residents left from this region.
 * The Day Care is shared, but regions never pool: a Johto resident is nobody's in Kanto.
 */
export const ownedPokemon = (save: SaveData): PokemonInstance[] => [
  ...save.box,
  ...(save.dayCare?.residents ?? []).filter((r) => (r.region ?? regionOf(save)) === regionOf(save)).map((r) => r.inst),
]

export const maxOwnedLevel = (save: SaveData) => ownedPokemon(save).reduce((m, p) => Math.max(m, p.level), 0)

export interface ConditionStatus {
  cond: UnlockCondition
  met: boolean
  current: number
  target: number
  label: string
}

export function conditionStatus(cond: UnlockCondition, save: SaveData, data: GameData, depth = 0): ConditionStatus {
  if (cond.kind === 'area') {
    const area = data.areas.find((a) => a.id === cond.areaId)
    // depth: two secret areas that require each other must not loop forever.
    const met = !!area && depth < 8 && isAreaUnlocked(save, area.id, data, depth + 1)
    return { cond, current: met ? 1 : 0, target: 1, met, label: `Reach ${area?.name ?? 'an unknown area'}` }
  }
  if (cond.kind === 'cleared') {
    const area = data.areas.find((a) => a.id === cond.areaId)
    const met = !!area && progressOf(save, area.id).cleared
    return { cond, current: met ? 1 : 0, target: 1, met, label: `Clear ${area?.name ?? 'an unknown area'}` }
  }
  if (cond.kind === 'pokedex') {
    const current = new Set(save.pokedex).size
    return { cond, current, target: cond.count, met: current >= cond.count, label: `Catch ${cond.count} Pokémon` }
  }
  const current = maxOwnedLevel(save)
  return { cond, current, target: cond.level, met: current >= cond.level, label: `Raise a Pokémon to Lv.${cond.level}` }
}

/**
 * Linear areas open when the previous linear area is cleared (the first is always open).
 * Hidden areas open when every unlock condition holds.
 */
export function isAreaUnlocked(save: SaveData, areaId: string, data: GameData, depth = 0): boolean {
  const area = data.areas.find((a) => a.id === areaId)
  if (!area) return false
  if (area.hidden) return (area.unlockConditions ?? []).every((c) => conditionStatus(c, save, data, depth).met)
  // A region is a run of its own: an area opens behind the one before it *in its own region*, never across a border.
  const chain = linearAreas(data, regionOfArea(area))
  const idx = chain.findIndex((a) => a.id === areaId)
  if (idx <= 0) return idx === 0
  return progressOf(save, chain[idx - 1]!.id).cleared
}

/**
 * The furthest area of the region's main chain the player can play (secret areas don't count), when they stand
 * somewhere else: Home offers to go there. Null once the whole chain is cleared, or when they are already there. With
 * the server's time (`now`), a small world's area still waiting for its date doesn't count.
 */
export function latestOpenArea(save: SaveData, data: GameData, now?: number | null): Area | null {
  const chain = linearAreas(data, regionOf(save))
  if (!chain.length || chain.every((a) => progressOf(save, a.id).cleared)) return null
  const latest = [...chain]
    .reverse()
    .find((a) => isAreaUnlocked(save, a.id, data) && !isAreaClosed(save, a.id, data) && (now === undefined || areaOpenAt(data, a.id, now)))
  return latest && latest.id !== save.currentAreaId ? latest : null
}

/**
 * An area with no deck — no wild Pokémon, trainers or Game Corner to meet, only Pokémon Centers and items, e.g. a
 * legendary's lair — closes once nothing is left to do there: every gym battle won, every legendary beaten and caught.
 * It can't be entered anymore. Areas with a deck, and ones with nothing special to begin with, never close.
 */
export function isAreaClosed(save: SaveData, areaId: string, data: GameData): boolean {
  const area = data.areas.find((a) => a.id === areaId)
  if (!area) return false
  const c = deckCounts(area.encounterWeights, deckAbilities(area))
  if (c.wild + c.trainer + c.casino > 0) return false
  const bosses = fightBosses(area, data)
  const gyms = gymsFor(area, data, playerSideOf(save)).filter((id) => data.trainers[id]?.team.length)
  if (!bosses.length && !gyms.length) return false
  const p = progressOf(save, areaId)
  return (
    gyms.every((id) => p.gymsDefeated.includes(id)) &&
    bosses.every((b) => p.bossesDefeated.includes(b.dex) && bossCaught(area, p, save.pokedex, b.dex, data))
  )
}

/** A boss of this area was caught here: noted in its progress (what a small world's bosses go by, docs/26 §2.5). */
export function noteBossCaught(save: SaveData, areaId: string, dex: number): SaveData {
  const p = progressOf(save, areaId)
  const caught = p.bossesCaught ?? []
  return caught.includes(dex) ? save : withProgress(save, areaId, { ...p, bossesCaught: [...caught, dex] })
}

/**
 * The open secret areas of the region being played. Only that region's: the conditions read the live region's
 * Pokédex and Box, so another region's secret area "opening" here would be announced to a player who isn't there.
 */
export function unlockedHiddenAreas(save: SaveData, data: GameData): string[] {
  const region = regionOf(save)
  return data.areas
    .filter((a) => a.hidden && regionOfArea(a) === region && isAreaUnlocked(save, a.id, data))
    .map((a) => a.id)
}

export interface BadgeInfo {
  trainerId: string
  /** The area the gym sits in — what groups the case into regions. */
  areaId: string
  leader: string
  badge: string
  earned: boolean
}

/** Every gym badge in chain order, and whether it's been won. */
export function badgeCase(save: SaveData, data: GameData): BadgeInfo[] {
  const out: BadgeInfo[] = []
  for (const a of linearAreas(data, regionOf(save))) {
    const p = progressOf(save, a.id)
    for (const id of a.gyms) {
      const t = data.trainers[id]
      if (t?.badge) out.push({ trainerId: id, areaId: a.id, leader: t.name, badge: t.badge, earned: p.gymsDefeated.includes(id) })
    }
  }
  return out
}

export function getArea(data: GameData, areaId: string): Area {
  const a = data.areas.find((x) => x.id === areaId)
  if (!a) throw new Error(`Unknown area ${areaId}`)
  return a
}

function replaceInstance(save: SaveData, inst: PokemonInstance): SaveData {
  return { ...save, box: save.box.map((p) => (p.id === inst.id ? inst : p)) }
}

function withProgress(save: SaveData, areaId: string, p: AreaProgress): SaveData {
  return { ...save, areaProgress: { ...save.areaProgress, [areaId]: p } }
}

/** Write battle HP back into the save. */
export function applyHp(save: SaveData, hpByUid: Record<string, number>): SaveData {
  return { ...save, box: save.box.map((p) => (p.id in hpByUid ? { ...p, currentHp: hpByUid[p.id]! } : p)) }
}

export type RunEvent =
  | ProgressEvent
  | { kind: 'xp'; uid: string; amount: number; shared?: boolean }
  /** `bonus`: the part of `amount` a Cash Flow live event added. */
  | { kind: 'gold'; amount: number; bonus?: number }
  /** `replacedLevel`: a stronger copy replaced the one you had at that level. */
  /** `isNew`: the species wasn't in the Pokédex before this catch. */
  | { kind: 'caught'; uid: string; dex: number; level: number; joinedTeam: boolean; replacedLevel?: number; isNew?: boolean }
  | { kind: 'fled'; dex: number }
  | { kind: 'boss_defeated'; dex: number }
  | { kind: 'gym_defeated'; trainerId: string; name: string; badge: string | null; role: TrainerRole }
  | { kind: 'area_cleared'; areaId: string; nextAreaId: string | null }
  | { kind: 'secret_unlocked'; areaId: string }
  /** An Elite Rebattle tier won: every trainer of its gauntlet beaten in a row. */
  | { kind: 'rebattle_cleared'; regionId: string; tier: number }
  /**
   * A small world's shiny mythical caught (docs/21): it left the world for its home region's Box (`region`), or waits
   * for that region to be started (`waiting`).
   */
  | { kind: 'world_mythical'; dex: number; level: number; region: string; waiting: boolean }
  /** A round of the nightmare won (docs/30): `round` of `total`. */
  | { kind: 'nightmare_round'; round: number; total: number }
  /** The item a nightmare round left in the bag (docs/30), once for good. */
  | { kind: 'nightmare_gift'; key: string; qty: number }

export interface VictoryInput {
  areaId: string
  kind: 'wild' | 'trainer' | 'boss' | 'gym'
  enemyDex: number
  enemyLevel: number
  fighterUid: string
  /** Gym battles: the trainer, and whether this K.O. was their last Pokémon. */
  gymTrainerId?: string
  gymComplete?: boolean
}

export interface VictoryResult {
  save: SaveData
  events: RunEvent[]
}

/**
 * A K.O.'s XP: the foe's level × xpMultiplier (× the area's backtrack when it's cleared) to the fighter (or the whole
 * team), and Multi EXP's shares to the bench. Level-ups, milestones and evolutions go into `events`; an evolution adds
 * its species to the Pokédex.
 */
export function awardBattleXp(
  save: SaveData,
  enemyLevel: number,
  fighterUid: string,
  area: Area,
  cleared: boolean,
  data: GameData,
  rng: Rng,
  events: RunEvent[],
): SaveData {
  let next: SaveData = { ...save, pokedex: [...save.pokedex] }
  const xp = pokemonXp(enemyLevel, area, cleared, data)
  // Cross-generation evolutions wait for their generation; the gate is the same for every award in this battle.
  const allowDex = evolutionGate(save, data)
  const award = (uid: string, amount: number, shared: boolean) => {
    const inst = getInstance(next, uid)
    if (!inst) return
    events.push(shared ? { kind: 'xp', uid, amount, shared } : { kind: 'xp', uid, amount })
    const res = gainXp(inst, amount, data, rng, { owned: save.pokedex, allowDex })
    next = replaceInstance(next, res.inst)
    events.push(...res.events)
    for (const ev of res.events)
      if (ev.kind === 'evolve' && !next.pokedex.includes(ev.toDex)) next.pokedex.push(ev.toDex)
  }
  const recipients = data.config.xpShareMode === 'team' ? next.team : [fighterUid]
  // Multi EXP compares levels from before this K.O.'s XP.
  const fighterLevel = getInstance(next, fighterUid)?.level ?? 1
  for (const uid of recipients) award(uid, xp, false)

  // Multi EXP: team members who didn't fight (and are still standing) get a share, bigger the further behind they are.
  if (data.config.multiExpShare > 0 && next.settings?.multiExp !== false && data.config.xpShareMode !== 'team') {
    for (const uid of [...next.team]) {
      if (recipients.includes(uid)) continue
      const inst = getInstance(next, uid)
      if (!inst || inst.currentHp <= 0) continue
      const share = multiExpShareFor(fighterLevel, inst.level, data)
      if (share > 0) award(uid, Math.max(1, Math.round(xp * share)), true)
    }
  }
  return next
}

/**
 * Everything a K.O. pays out: XP to the fighter (or team), trainer Pokédollars, boss, area unlock.
 * Catching is its own step afterwards — the catch die (catching.ts).
 */
export function applyVictory(
  save: SaveData,
  input: VictoryInput,
  data: GameData,
  rng: Rng,
  now: number,
  newId: () => string,
  /** The live event running for this player (Cash Flow pays more). */
  live: LiveEvent | null = null,
): VictoryResult {
  const area = getArea(data, input.areaId)
  let progress = progressOf(save, area.id)
  const events: RunEvent[] = []
  const hiddenBefore = new Set(unlockedHiddenAreas(save, data))
  let next = awardBattleXp(save, input.enemyLevel, input.fighterUid, area, progress.cleared, data, rng, events)

  // Gold — trainers only (gym leaders, the Elite Four and the Champion pay extra), more under Cash Flow
  if (input.kind === 'trainer' || input.kind === 'gym') {
    const { amount, bonus } = earnedGold(trainerGoldFor(input.enemyLevel, area, progress.cleared, data, input.kind === 'gym'), live)
    next = { ...next, gold: next.gold + amount }
    events.push(bonus ? { kind: 'gold', amount, bonus } : { kind: 'gold', amount })
  }

  // Boss
  if (input.kind === 'boss') {
    if (!progress.bossesDefeated.includes(input.enemyDex))
      progress = { ...progress, bossesDefeated: [...progress.bossesDefeated, input.enemyDex] }
    const all = fightBosses(area, data).every((b) => progress.bossesDefeated.includes(b.dex))
    progress = { ...progress, bossDefeated: all }
    events.push({ kind: 'boss_defeated', dex: input.enemyDex })
  }

  // Gym / Elite battle won (after its last Pokémon falls)
  if (input.kind === 'gym' && input.gymComplete && input.gymTrainerId) {
    const raw = data.trainers[input.gymTrainerId]
    const t = raw && asSeenBy(raw, playerSideOf(save))
    if (!progress.gymsDefeated.includes(input.gymTrainerId))
      progress = { ...progress, gymsDefeated: [...progress.gymsDefeated, input.gymTrainerId] }
    if (t) events.push({ kind: 'gym_defeated', trainerId: t.id, name: t.name, badge: t.badge, role: t.role })
  }

  const cleared = clearIfDone(area, progress, save, data)
  progress = cleared.progress
  if (cleared.event) events.push(cleared.event)

  next = withProgress(next, area.id, progress)

  // Secret areas whose conditions just came true (a catch, a level-up…)
  for (const id of unlockedHiddenAreas(next, data)) if (!hiddenBefore.has(id)) events.push({ kind: 'secret_unlocked', areaId: id })

  void now
  void newId
  return { save: next, events }
}

/**
 * Saves from before rounds (v1.10) measured exploration in XP: turn it into rounds done — a cleared area has them all,
 * otherwise the share of the old gauge filled, rounded down — and drop the XP. Nothing to do on a newer save.
 */
export function migrateRounds(save: SaveData, data: GameData): SaveData {
  const entries = Object.entries(save.areaProgress)
  if (!entries.some(([, p]) => p.xp !== undefined)) return save
  const areaProgress = Object.fromEntries(
    entries.map(([id, p]) => {
      if (p.xp === undefined) return [id, p]
      const { xp = 0, ...rest } = p
      const rounds = data.areas.find((a) => a.id === id)?.roundsToClear
      const gauge = LEGACY_GAUGE[id]
      // Content without round counts yet (older database content): keep the XP until there's something to convert to.
      if (rounds == null && gauge) return [id, p]
      const done = rounds == null ? 0 : p.cleared ? rounds : gauge ? Math.min(rounds, Math.floor((rounds * xp) / gauge)) : 0
      return [id, { ...rest, roundsDone: Math.max(rest.roundsDone ?? 0, done) }]
    }),
  )
  return { ...save, areaProgress }
}

/**
 * Clear: every round done + every gym beaten + every round legendary beaten → the next linear area opens. A raid isn't
 * waited for: it opens once the area is cleared (docs/24).
 */
function clearIfDone(
  area: Area,
  progress: AreaProgress,
  save: SaveData,
  data: GameData,
): { progress: AreaProgress; event: Extract<RunEvent, { kind: 'area_cleared' }> | null } {
  if (progress.cleared || !roundsComplete(area, progress)) return { progress, event: null }
  const roundBosses = fightBosses(area, data).filter((b) => b.teamAvgThreshold == null)
  const gymsDone = gymsFor(area, data, playerSideOf(save)).every((id) => progress.gymsDefeated.includes(id) || !data.trainers[id])
  if (!gymsDone || !roundBosses.every((b) => progress.bossesDefeated.includes(b.dex))) return { progress, event: null }
  const chain = linearAreas(data, regionOfArea(area))
  const idx = chain.findIndex((a) => a.id === area.id)
  return {
    progress: { ...progress, cleared: true },
    event: { kind: 'area_cleared', areaId: area.id, nextAreaId: idx >= 0 ? (chain[idx + 1]?.id ?? null) : null },
  }
}

/**
 * Areas whose rounds and gyms were done, waiting only on a boss that is now a raid (docs/24), are cleared: the live
 * region's and the parked ones'. Nothing to do on most saves.
 */
export function settleClears(save: SaveData, data: GameData): SaveData {
  const settle = (block: Record<string, AreaProgress>, regionSave: SaveData): Record<string, AreaProgress> | null => {
    let out: Record<string, AreaProgress> | null = null
    for (const [id, p] of Object.entries(block)) {
      const area = data.areas.find((a) => a.id === id)
      if (!area || p.cleared || !(area.legendaryBoss ?? []).some((b) => b.raid)) continue
      const { progress } = clearIfDone(area, p, regionSave, data)
      if (progress.cleared) (out ??= { ...block })[id] = progress
    }
    return out
  }
  let next = save
  const live = settle(save.areaProgress, save)
  if (live) next = { ...next, areaProgress: live }
  for (const [region, block] of Object.entries(save.parked ?? {})) {
    if (!block) continue
    const parked = settle(block.areaProgress, { ...save, ...block } as SaveData)
    if (parked) next = { ...next, parked: { ...next.parked, [region]: { ...block, areaProgress: parked } } }
  }
  return next
}

/**
 * The encounter just met is over (won, healed, picked up…). If it was the last card of the round's deck, the round
 * counts — once — and the area may clear. A wipe drops the deck before this can happen, so a lost round never counts.
 */
export function finishRound(
  save: SaveData,
  areaId: string,
  data: GameData,
): { save: SaveData; roundDone: boolean; cleared: Extract<RunEvent, { kind: 'area_cleared' }> | null } {
  const area = data.areas.find((a) => a.id === areaId)
  const p = progressOf(save, areaId)
  if (!area || !p.deck || p.deck.length > 0 || !p.drawn?.length || p.roundCounted) return { save, roundDone: false, cleared: null }
  const done = clearIfDone(area, { ...p, roundsDone: (p.roundsDone ?? 0) + 1, roundCounted: true }, save, data)
  return { save: withProgress(save, areaId, done.progress), roundDone: true, cleared: done.event }
}

/**
 * Wipe: the round is lost. Back to the start of the area, team fully healed; the deck is dropped, so the round in
 * progress never counts and the next encounter starts a new, freshly shuffled round. Rounds already done stay done.
 * Pokémon levels and XP, items and Pokédollars are all kept. In Extreme mode nothing heals: the team rests.
 */
export function applyWipe(save: SaveData, areaId: string, data: GameData): SaveData {
  // A portal run (docs/28) ends there: its portals closed go back to 0 and its boons are lost.
  if (inPortalRun(save, data, areaId)) return portalWipe(save, data, areaId)
  // So does the nightmare (docs/30): the player wakes up, the rounds back to 0.
  if (inNightmare(save, data, areaId)) return nightmareWipe(save, data, areaId)
  const p = progressOf(save, areaId)
  const healed = new Set(wipeHeals(save, data) ? save.team : [])
  return {
    ...withProgress(save, areaId, { ...p, deck: [], drawn: [] }),
    box: save.box.map((inst) => (healed.has(inst.id) ? { ...inst, currentHp: instanceMaxHp(inst, data) } : inst)),
  }
}

/**
 * Pokémon Center: full heal for team and box, and for the Day Care's residents (it heals no one itself), except in a
 * small world, where the main game's Day Care is closed. None in Extreme mode (unless the admin turns them back on).
 */
export function centerHeal(save: SaveData, data: GameData): SaveData {
  if (!centersOn(save, data)) return save
  const heal = (inst: PokemonInstance): PokemonInstance => ({ ...inst, currentHp: instanceMaxHp(inst, data) })
  const healed = { ...save, box: save.box.map(heal) }
  const dc = save.dayCare
  if (!dc?.residents.length || inWorldRegion(save, data)) return healed
  return { ...healed, dayCare: { ...dc, residents: dc.residents.map((r) => ({ ...r, inst: heal(r.inst) })) } }
}

/**
 * Arriving at a portal area's way in (docs/28: the breach and its pop-up, before READY!) heals as a Pokémon Center
 * does, with its rules (the user, 2026-10-15). The same save when there is nothing to heal, so coming back to the
 * pop-up writes nothing; the same save outside a way in.
 */
export function arriveAtPortal(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!canStartPortal(save, data, areaId)) return save
  return healedOrSame(save, data)
}

/** A Center's heal (its rules), or the same save when it heals nobody. */
function healedOrSame(save: SaveData, data: GameData): SaveData {
  const healed = centerHeal(save, data)
  const same =
    healed.box.every((p, i) => p.currentHp === save.box[i]?.currentHp) &&
    (healed.dayCare?.residents ?? []).every((r, i) => r.inst.currentHp === save.dayCare?.residents[i]?.inst.currentHp)
  return same ? save : healed
}

/**
 * Arriving at a nightmare area's way in (docs/30, before BEGIN THE NIGHTMARE) heals as a Pokémon Center does, as the
 * portal's way in does. The same save when there is nothing to heal, or outside a way in.
 */
export function arriveAtNightmare(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!canStartNightmare(save, data, areaId)) return save
  return healedOrSame(save, data)
}

/**
 * Waking up from the nightmare, HEAL & START RAID (docs/30, as the portal run's victory): the team and the Box healed as
 * a Pokémon Center would, the waking marked seen. The same save when no waking is waiting here.
 */
export function nightmareVictoryToRaid(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!nightmareStateOf(save, areaId).won) return save
  return markNightmareWonSeen(centerHeal(save, data), areaId)
}

/**
 * The portal run's victory, HEAL & START RAID (docs/28, the user's ask of 2026-10-15): the team and the Box healed as a
 * Pokémon Center would (its rules: centerHeal), and the victory marked seen, as BACK TO THE WORLD does. The same save
 * when no victory is waiting here.
 */
export function portalVictoryToRaid(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!portalStateOf(save, areaId).won) return save
  return markPortalWonSeen(centerHeal(save, data), areaId)
}

/** Where the run stands, as far as team changes go. */
export interface SwapPlace {
  phase: string
  areaId: string | null
}

/**
 * The team can change (a Pokémon from the Box in, one sent to it) here and now: inside a Pokémon Center, or at a portal
 * area's way in while the run hasn't started (docs/28, as at a Center). Never once READY! is pressed: there is no
 * Center inside the run. The order of the team can change anywhere (setTeam).
 */
export function teamSwapsOpen(save: SaveData, data: GameData, at: SwapPlace): boolean {
  if (at.phase === 'center') return true
  // The nightmare's way in too (docs/30), before it begins: there is no Center inside it either.
  return (
    at.phase === 'idle' &&
    !!at.areaId &&
    save.currentAreaId === at.areaId &&
    (canStartPortal(save, data, at.areaId) || canStartNightmare(save, data, at.areaId))
  )
}

export function setTeam(save: SaveData, ids: readonly string[], data: GameData): SaveData {
  const valid = [...new Set(ids)]
    .filter((id) => {
      const p = getInstance(save, id)
      return !!p && !isReviving(p)
    })
    .slice(0, data.config.maxTeamSize)
  if (!valid.length) return save
  return { ...save, team: valid }
}

/** Put `inId` into the team in place of `outId` (or append if there is room). */
export function swapIntoTeam(save: SaveData, inId: string, outId: string | null, data: GameData): SaveData {
  const inst = getInstance(save, inId)
  if (!inst || isReviving(inst) || save.team.includes(inId)) return save
  if (outId && save.team.includes(outId)) return setTeam(save, save.team.map((id) => (id === outId ? inId : id)), data)
  if (save.team.length < data.config.maxTeamSize) return setTeam(save, [...save.team, inId], data)
  return save
}

/**
 * Buys `qty` of an item. A fossil bought over the counter behaves exactly like one dug out of the ground: it goes
 * straight to the Box as the Pokémon it holds and revives on its own clock. Sitting in the bag it would be inert —
 * `itemUses` gives a fossil no use at all — so anything the Mart is configured to sell has to arrive usable.
 *
 * A `unique` item is one sale per region, for good: the key is written down here and the Mart never offers it again,
 * whether the player still has it, used it or sold it back.
 */
export function buyItem(
  save: SaveData,
  key: string,
  qty: number,
  data: GameData,
  now: number = Date.now(),
  newId: () => string = () => `fossil-${now}`,
): SaveData | null {
  const item = data.items[key]
  // A small world's Mart sells its own list only (engine/worlds.ts buyWorldItem).
  if (!item || qty <= 0 || inWorldRegion(save, data)) return null
  if (!shopSells(item, save, regionOf(save), data)) return null
  // One is all there is: asking for more is a mistake, not a smaller order.
  if (item.unique && qty !== 1) return null
  const cost = item.price * qty
  if (save.gold < cost) return null
  const paid = item.unique
    ? { ...save, gold: save.gold - cost, boughtUnique: [...(save.boughtUnique ?? []), item.key] }
    : { ...save, gold: save.gold - cost }
  if (item.effect.kind === 'fossil') {
    let next = paid
    for (let i = 0; i < qty; i++) next = addFossil(next, item, data, now, newId())
    return next
  }
  return { ...paid, inventory: { ...paid.inventory, [key]: (paid.inventory[key] ?? 0) + qty } }
}

/** Sells `qty` of an item back to the Mart for `sellPrice` each. Null when it can't be sold or the bag has too few. */
export function sellItem(save: SaveData, key: string, qty: number, data: GameData): SaveData | null {
  const price = sellPrice(data.items[key])
  const have = save.inventory[key] ?? 0
  if (price <= 0 || qty <= 0 || have < qty) return null
  return { ...save, gold: save.gold + price * qty, inventory: { ...save.inventory, [key]: have - qty } }
}

export function consumeItem(save: SaveData, key: string): SaveData | null {
  const have = save.inventory[key] ?? 0
  if (have <= 0) return null
  return { ...save, inventory: { ...save.inventory, [key]: have - 1 } }
}

/** Out of battle potions are free to use (no turn cost). */
export function applyItemToInstance(save: SaveData, key: string, instId: string, data: GameData): SaveData | null {
  const item = data.items[key]
  const inst = getInstance(save, instId)
  if (!item || !inst) return null
  const amount = healAmount(item, inst.currentHp, instanceMaxHp(inst, data))
  if (amount <= 0) return null
  const spent = consumeItem(save, key)
  if (!spent) return null
  return replaceInstance(spent, { ...inst, currentHp: inst.currentHp + amount })
}

/**
 * Use a bag item from the Team screen: potions heal, Rare Candy raises the level (with the usual level-up, milestone
 * and evolution events). Null when it would have no effect.
 */
export function applyFieldItem(
  save: SaveData,
  key: string,
  instId: string,
  data: GameData,
  rng: Rng,
): { save: SaveData; events: ProgressEvent[] } | null {
  const item = data.items[key]
  const inst = getInstance(save, instId)
  if (!item || !inst || isReviving(inst) || !usableIn(item, 'field') || (save.inventory[key] ?? 0) <= 0) return null
  if (item.effect.kind === 'heal' || item.effect.kind === 'revive') {
    if (!healItemsOn(save, data)) return null
    const healed = applyItemToInstance(save, key, instId, data)
    return healed ? { save: healed, events: [] } : null
  }
  // A switched-off item (docs/25: the Link Cable) waits in the bag, but inside a small world, whose items are its own.
  if (!itemOnFor(save, data, key)) return null
  if (item.effect.kind === 'stone' || item.effect.kind === 'link') {
    const gate = evolutionGate(save, data)
    const toDex = item.effect.kind === 'link' ? linkEvolution(inst, data, gate) : stoneEvolution(inst, key, data, gate)
    if (toDex == null) return null
    const evolved = evolve(inst, toDex, data)
    let next = replaceInstance(consumeItem(save, key)!, evolved)
    if (!next.pokedex.includes(toDex)) next = { ...next, pokedex: [...next.pokedex, toDex] }
    return { save: next, events: [{ kind: 'evolve', uid: inst.id, fromDex: inst.dex, toDex, level: inst.level }] }
  }
  if (item.effect.kind !== 'level' || inst.level >= data.config.maxLevel) return null
  let cur = inst
  const events: ProgressEvent[] = []
  for (let i = 0; i < item.effect.amount && cur.level < data.config.maxLevel; i++) {
    const res = gainXp(cur, xpToNext(cur.level, data.config) - cur.xp, data, rng, { owned: save.pokedex, allowDex: evolutionGate(save, data) })
    cur = res.inst
    events.push(...res.events)
  }
  let next = replaceInstance(consumeItem(save, key)!, cur)
  for (const ev of events) if (ev.kind === 'evolve' && !next.pokedex.includes(ev.toDex)) next = { ...next, pokedex: [...next.pokedex, ev.toDex] }
  return { save: next, events }
}

/**
 * Evolve a Pokémon at the level cap whose evolution by level is due: it earns no more XP, so the level-up path that
 * normally evolves it never runs again (a Golbat raised to 100 in Kanto, before Johto opened up Crobat). Asked for from
 * its sheet. A branching evolution picks like a level-up does. Null when there is nothing to evolve into.
 */
export function applyLevelEvolution(
  save: SaveData,
  instId: string,
  data: GameData,
  rng: Rng,
): { save: SaveData; events: ProgressEvent[] } | null {
  const inst = getInstance(save, instId)
  if (!inst || isReviving(inst) || inst.level < data.config.maxLevel) return null
  const ready = levelEvolutions(inst, data, evolutionGate(save, data))
  if (!ready.length) return null
  const target = ready.length === 1 ? ready[0]! : rng.pick(preferUnowned(ready, save.pokedex))
  let next = replaceInstance(save, evolve(inst, target.toDex, data))
  if (!next.pokedex.includes(target.toDex)) next = { ...next, pokedex: [...next.pokedex, target.toDex] }
  return { save: next, events: [{ kind: 'evolve', uid: inst.id, fromDex: inst.dex, toDex: target.toDex, level: inst.level }] }
}

/** A small world has tracks of its own, bought with its own ₽ (docs/26: the user's call, 2026-10-13). */
export function buyComboUpgrade(save: SaveData, key: ComboKey, data: GameData): SaveData | null {
  const lv = save.comboLevels[key] ?? 1
  const cost = nextComboCost(key, lv, data)
  if (cost == null || save.gold < cost) return null
  return { ...save, gold: save.gold - cost, comboLevels: { ...save.comboLevels, [key]: lv + 1 } }
}

export function buyDieUpgrade(save: SaveData, type: PokeType, data: GameData): SaveData | null {
  const lv = save.dieLevels[type] ?? 1
  const cost = nextDieCost(type, lv, data)
  if (cost == null || save.gold < cost) return null
  return { ...save, gold: save.gold - cost, dieLevels: { ...save.dieLevels, [type]: lv + 1 } }
}

export function speciesName(data: GameData, dex: number): string {
  return data.species[dex] ? getSpecies(data, dex).name : `#${dex}`
}

/**
 * Settle XP left over from an older, steeper level curve: a Pokémon already holding a level's worth levels up (and may
 * evolve) right away, so a victory screen only ever shows what that fight earned.
 */
export function syncXpCurve(save: SaveData, data: GameData): SaveData {
  const cfg = data.config
  const due = (p: PokemonInstance) => p.level < cfg.maxLevel && p.xp >= xpToNext(p.level, cfg)
  if (!save.box.some(due)) return save
  const rng = createRng(save.updatedAt || 1)
  const pokedex = new Set(save.pokedex)
  const box = save.box.map((p) => {
    if (!due(p)) return p
    const res = gainXp(p, 0, data, rng, { owned: save.pokedex, allowDex: evolutionGate(save, data) })
    for (const e of res.events) if (e.kind === 'evolve') pokedex.add(e.toDex)
    return res.inst
  })
  return { ...save, box, pokedex: [...pokedex] }
}

/**
 * One copy per species in the Box: when an evolution (or a Pokémon coming back from the team) leaves two copies of a
 * species, only the one with the highest level stays (then the most XP, then the one that was there first). A shiny is
 * its own Pokémon here: it is never let go and never counts against a plain copy, however strong either of them is —
 * shiny and normal share a Pokédex entry, nothing else. Team members are left alone until they come back to the Box,
 * and a team member at least as strong as a Box copy sends that copy away. Day Care residents are checked when picked
 * up.
 */
export function releaseDuplicates(save: SaveData): { save: SaveData; released: PokemonInstance[] } {
  const inTeam = new Set(save.team)
  const stronger = (a: PokemonInstance, b: PokemonInstance) => a.level > b.level || (a.level === b.level && a.xp > b.xp)
  const best = new Map<number, PokemonInstance>()
  // Team members first, so a Box copy has to beat them outright to stay.
  for (const p of [...teamOf(save), ...save.box.filter((p) => !inTeam.has(p.id))]) {
    if (p.shiny || isReviving(p)) continue
    const cur = best.get(p.dex)
    if (!cur || stronger(p, cur)) best.set(p.dex, p)
  }
  const released = save.box.filter((p) => !p.shiny && !isReviving(p) && !inTeam.has(p.id) && best.get(p.dex) !== p)
  if (!released.length) return { save, released }
  const gone = new Set(released.map((p) => p.id))
  return { save: { ...save, box: save.box.filter((p) => !gone.has(p.id)) }, released }
}

/**
 * The portal run's rules pop-up is due (docs/28, docs/15 §20): the first area of the region being played with a portal
 * run switched on, open and not won yet, while the player hasn't seen the rules. Null otherwise.
 */
export function portalRulesDue(save: SaveData, data: GameData): Area | null {
  if (save.portalRulesSeen) return null
  const region = regionOf(save)
  return (
    data.areas.find(
      (a) =>
        regionOfArea(a) === region &&
        !!portalModeOf(a, data) &&
        !portalStateOf(save, a.id).won &&
        isAreaUnlocked(save, a.id, data),
    ) ?? null
  )
}
