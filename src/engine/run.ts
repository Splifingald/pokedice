// Pure state transitions on the save: new game, rewards, catches, wipes, center, team, shop, upgrades.
import { getSpecies, linearAreas } from './data'
import { KANTO, regionOf, regionOfArea } from './regions'
import { asSeenBy, gymsFor, playerSideOf } from './rival'
import { nextComboCost, nextDieCost, pokemonXp, trainerGoldFor, healAmount, multiExpShareFor } from './economy'
import { roundsComplete } from './encounters'
import { addFossil, isReviving } from './fossils'
import { LEGACY_GAUGE } from './legacyGauge'
import { MONEY, sellPrice, usableIn } from './items'
import { averageLevel, createInstance, evolve, gainXp, instanceMaxHp, stoneEvolution, xpToNext, type ProgressEvent } from './progression'
import { createRng, type Rng } from './rng'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type Area,
  type AreaProgress,
  type ComboKey,
  type GameData,
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
    settings: { sfx: false, reducedMotion: false, multiExp: true },
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
    return !!lastCenter === !!p.lastCenter ? save : withProgress(save, areaId, { ...p, lastCenter })
  }
  const round = roll.newRound ? (p.round ?? 0) + 1 : p.round
  const drawn = roll.newRound ? (roll.drawn ?? []) : roll.drawn ? [...(p.drawn ?? []), ...roll.drawn] : p.drawn
  return withProgress(save, areaId, {
    ...p,
    ...(roll.deck ? { deck: roll.deck } : {}),
    ...(roll.lootDeck ? { lootDeck: roll.lootDeck } : {}),
    ...(round != null ? { round } : {}),
    ...(drawn ? { drawn } : {}),
    ...(roll.newRound ? { roundCounted: false } : {}),
    lastCenter,
  })
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
): SaveData {
  const qty = Math.max(0, Math.floor(find.qty))
  const item = data.items[find.itemKey]
  let next: SaveData =
    find.itemKey === MONEY
      ? { ...save, gold: save.gold + qty }
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

/** Every Pokémon the player owns: the Box (team included) and the Day Care's residents. */
export const ownedPokemon = (save: SaveData): PokemonInstance[] => [
  ...save.box,
  ...(save.dayCare?.residents.map((r) => r.inst) ?? []),
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

export function unlockedHiddenAreas(save: SaveData, data: GameData): string[] {
  return data.areas.filter((a) => a.hidden && isAreaUnlocked(save, a.id, data)).map((a) => a.id)
}

export interface BadgeInfo {
  trainerId: string
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
      if (t?.badge) out.push({ trainerId: id, leader: t.name, badge: t.badge, earned: p.gymsDefeated.includes(id) })
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
  | { kind: 'gold'; amount: number }
  /** `replacedLevel`: a stronger copy replaced the one you had at that level. */
  | { kind: 'caught'; uid: string; dex: number; level: number; joinedTeam: boolean; replacedLevel?: number }
  | { kind: 'fled'; dex: number }
  | { kind: 'boss_defeated'; dex: number }
  | { kind: 'gym_defeated'; trainerId: string; name: string; badge: string | null; role: TrainerRole }
  | { kind: 'area_cleared'; areaId: string; nextAreaId: string | null }
  | { kind: 'secret_unlocked'; areaId: string }

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
): VictoryResult {
  const area = getArea(data, input.areaId)
  let progress = progressOf(save, area.id)
  const events: RunEvent[] = []
  const hiddenBefore = new Set(unlockedHiddenAreas(save, data))
  let next: SaveData = { ...save, pokedex: [...save.pokedex] }

  // XP: the foe's level × xpMultiplier.
  const xp = pokemonXp(input.enemyLevel, area, progress.cleared, data)
  const award = (uid: string, amount: number, shared: boolean) => {
    const inst = getInstance(next, uid)
    if (!inst) return
    events.push(shared ? { kind: 'xp', uid, amount, shared } : { kind: 'xp', uid, amount })
    const res = gainXp(inst, amount, data, rng, { owned: save.pokedex })
    next = replaceInstance(next, res.inst)
    events.push(...res.events)
    for (const ev of res.events)
      if (ev.kind === 'evolve' && !next.pokedex.includes(ev.toDex)) next.pokedex.push(ev.toDex)
  }
  const recipients = data.config.xpShareMode === 'team' ? next.team : [input.fighterUid]
  // Multi EXP compares levels from before this K.O.'s XP.
  const fighterLevel = getInstance(next, input.fighterUid)?.level ?? 1
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

  // Gold — trainers only (gym leaders, the Elite Four and the Champion pay extra)
  if (input.kind === 'trainer' || input.kind === 'gym') {
    const gold = trainerGoldFor(input.enemyLevel, area, progress.cleared, data, input.kind === 'gym')
    next = { ...next, gold: next.gold + gold }
    events.push({ kind: 'gold', amount: gold })
  }

  // Boss
  if (input.kind === 'boss') {
    if (!progress.bossesDefeated.includes(input.enemyDex))
      progress = { ...progress, bossesDefeated: [...progress.bossesDefeated, input.enemyDex] }
    const all = (area.legendaryBoss ?? []).every((b) => progress.bossesDefeated.includes(b.dex))
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
 * Clear: every round done + every gym beaten + every round legendary beaten → the next linear area opens.
 */
function clearIfDone(
  area: Area,
  progress: AreaProgress,
  save: SaveData,
  data: GameData,
): { progress: AreaProgress; event: Extract<RunEvent, { kind: 'area_cleared' }> | null } {
  if (progress.cleared || !roundsComplete(area, progress)) return { progress, event: null }
  const roundBosses = (area.legendaryBoss ?? []).filter((b) => b.teamAvgThreshold == null)
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
 * Pokémon levels and XP, items and Pokédollars are all kept.
 */
export function applyWipe(save: SaveData, areaId: string, data: GameData): SaveData {
  const p = progressOf(save, areaId)
  const healed = new Set(save.team)
  return {
    ...withProgress(save, areaId, { ...p, deck: [], drawn: [] }),
    box: save.box.map((inst) => (healed.has(inst.id) ? { ...inst, currentHp: instanceMaxHp(inst, data) } : inst)),
  }
}

/** Pokémon Center: full heal for team and box. */
export function centerHeal(save: SaveData, data: GameData): SaveData {
  return { ...save, box: save.box.map((inst) => ({ ...inst, currentHp: instanceMaxHp(inst, data) })) }
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

export function buyItem(save: SaveData, key: string, qty: number, data: GameData): SaveData | null {
  const item = data.items[key]
  if (!item || qty <= 0) return null
  const cost = item.price * qty
  if (save.gold < cost) return null
  return { ...save, gold: save.gold - cost, inventory: { ...save.inventory, [key]: (save.inventory[key] ?? 0) + qty } }
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
    const healed = applyItemToInstance(save, key, instId, data)
    return healed ? { save: healed, events: [] } : null
  }
  if (item.effect.kind === 'stone') {
    const toDex = stoneEvolution(inst, key, data)
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
    const res = gainXp(cur, xpToNext(cur.level, data.config) - cur.xp, data, rng, { owned: save.pokedex })
    cur = res.inst
    events.push(...res.events)
  }
  let next = replaceInstance(consumeItem(save, key)!, cur)
  for (const ev of events) if (ev.kind === 'evolve' && !next.pokedex.includes(ev.toDex)) next = { ...next, pokedex: [...next.pokedex, ev.toDex] }
  return { save: next, events }
}

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
    const res = gainXp(p, 0, data, rng, { owned: save.pokedex })
    for (const e of res.events) if (e.kind === 'evolve') pokedex.add(e.toDex)
    return res.inst
  })
  return { ...save, box, pokedex: [...pokedex] }
}

/**
 * One copy per species in the Box: when an evolution (or a Pokémon coming back from the team) leaves two copies of a
 * species, only the one with the highest level stays (then the most XP, then the one that was there first). Shiny
 * Pokémon are never let go and don't count; team members are left alone until they come back to the Box, and a team
 * member at least as strong as a Box copy sends that copy away. Day Care residents are checked when picked up.
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
