// The battle reducer. The UI dispatches events and renders the returned log — it never recomputes rules.
import { aiRerollMask } from './ai'
import { getSpecies } from './data'
import { attackMultiplier, attackType, computeDamage, type DamageResult, type UpgradeLevels } from './damage'
import { rerollMasked, rollAll, type RolledDie } from './dice'
import { reviveHp } from './economy'
import { choiceFormDie, choiceFormsOf, gmaxFormsOf, lowHpFormOf, megaDie, megaOptions, swapOneDie } from './forms'
import { effectiveStats } from './progression'
import { potionHeal, shouldUsePotion } from './trainerItems'
import type { Rng } from './rng'
import {
  applyStatuses,
  clearStatuses,
  consumeStun,
  emptyStatus,
  hasStatus,
  statusesFromRoll,
  stunKind,
  tickDot,
  type StatusState,
} from './status'
import type { CurableStatus, DieType, GameData, PokeType, RaidTypeScale, Species, StatusKind } from './types'

export type Side = 'player' | 'enemy'
export type BattleKind = 'wild' | 'trainer' | 'boss'
export type BattlePhase =
  | 'player_roll'
  | 'player_reroll'
  /** The player's Pokémon is frozen or paralyzed: cure it with an item, or PASS (the stun eats the turn). */
  | 'player_stunned'
  | 'enemy_turn'
  | 'player_switch'
  | 'won'
  | 'lost'
  | 'fled'
  /** A raid step is over (`single`): the raid takes it from here. */
  | 'done'

export interface Battler {
  uid: string
  dex: number
  /** What the battle calls it: its nickname, or the species (the form) it shows now. */
  name: string
  /** One of your own with a nickname: it keeps it through a Mega Evolution or any other form. */
  nickname?: string
  level: number
  types: PokeType[]
  maxHp: number
  hp: number
  speed: number
  dice: DieType[]
  rerolls: number
  rerollsLeft: number
  status: StatusState
  spriteUrl: string
  shiny: boolean
  /** A trainer Pokémon's potion, used once (null when used or never given). */
  item?: string | null
  /** Ditto: its dice are a copy of the opponent's, taken again whenever the opponent changes. `ownDice` = its own set. */
  copiesFoe?: boolean
  ownDice?: DieType[]
  /** The species it was sent out as. `dex` is the form it shows now (a Mega, Giratina's Origin Forme, an Arceus type). */
  baseDex?: number
  /** Mega Evolved (or Primal Reversion, Ultra Burst) this battle: it stays so until the fight ends. */
  mega?: boolean
  /** A form taken below half HP (Giratina's Origin Forme…): how it looked and rolled before, for above half again. */
  preForm?: FormSnapshot
  /** A raid Pokémon: its below-half-HP form waits for its last bar (`unleashForm`), whatever its HP does. */
  formHeld?: boolean
  /** Type changes (Arceus, Silvally, Ogerpon) this Pokémon has made this battle. */
  formChanges?: number
  /** Gigantamaxed: its own turns left, and how it looked before (the die it gained goes when it shrinks back). */
  gmax?: { turns: number; pre: FormSnapshot }
}

export interface FormSnapshot {
  dex: number
  name: string
  types: PokeType[]
  dice: DieType[]
}

/** Species that fight with a copy of their opponent's dice (Ditto), rolled on their own and with their own upgrades. */
export const COPIES_FOE_DICE: ReadonlySet<number> = new Set([132])

export interface BattleState {
  kind: BattleKind
  phase: BattlePhase
  turn: number
  actor: Side
  /** Whose turn comes after the pending free switch. */
  nextActor: Side
  player: Battler[]
  activeIndex: number
  enemy: Battler
  dice: RolledDie[]
  selected: boolean[]
  playerLevels: UpgradeLevels
  enemyLevels: UpgradeLevels
  /** Player instance ids that were sent out in this battle. */
  participants: string[]
  canRun: boolean
  /** Extreme mode with the admin's items switch off: no Potion or Revive works. */
  noHealItems?: boolean
  lastDamage: DamageResult | null
  /** One item per turn — it doesn't end the turn. */
  itemUsedThisTurn: boolean
  /** The player may Mega Evolve in this fight (they have reached Kalos). Absent = no. */
  megaAllowed?: boolean
  /** The player may Gigantamax in this fight (they have reached Galar). Absent = no. */
  gmaxAllowed?: boolean
  /** Mega Evolutions and Gigantamax the player's side has used this battle (they share one limit). */
  megaUsed?: number
  /** An auto battle: no Mega Evolution or Gigantamax on either side; type changers on both pick their type themselves. */
  auto?: boolean
  /** What the foe does on its first turn — a trainer's ace Mega Evolving or Gigantamaxing — and whether it changes type. */
  enemyPlan?: EnemyPlan
  /** The plan's Mega / Gigantamax has been used. */
  enemyPlanDone?: boolean
  /**
   * A raid step (engine/raidBattle.ts): one actor's one action, then phase 'done'. No next turn, no K.O. handling, no
   * end of battle and no statuses cleared: the raid decides what a K.O. means and who acts next.
   */
  single?: boolean
  /**
   * A double battle (docs/33): two of each side out at once. `activeIndex` and `enemy` are then the pair in front —
   * the Pokémon whose turn it is and the one it targets — so every rule written for one against one applies to them.
   */
  double?: DoubleState
}

/** A double battle's field (docs/33). */
export interface DoubleState {
  /** Every foe of the fight: a wild pair, or the trainer's whole team (those not out yet wait for a free slot). */
  foes: Battler[]
  /** Indexes into `foes` of those out on the field (one or two), left to right. */
  foeSlots: number[]
  /** Indexes into `player` of yours out on the field (one or two), left to right. */
  ownSlots: number[]
  /** Index into `foes` of `enemy`: the foe in front. */
  foeIndex: number
  /** Still to act this round, fastest first (uids). Newcomers wait for the next round. */
  queue: string[]
  round: number
  /** Your K.O.'d Pokémon still to replace from the bench (the player_switch phase). */
  toReplace: number
  /** Foes K.O.'d so far, in order, with yours that were out when each fell: they share its XP in full. */
  kos: DoubleKo[]
  /** The trainer's Mega / Gigantamax / type change, by foe uid (its ace's), and those already used. */
  plans?: Record<string, EnemyPlan>
  plansDone?: string[]
}

export interface DoubleKo {
  uid: string
  /** The species it was sent out as (a Giratina K.O.'d in its Origin Forme is still Giratina). */
  dex: number
  level: number
  shiny: boolean
  fighters: string[]
}

export interface EnemyPlan {
  /** The Mega (or Primal / Ultra Burst) form it takes. */
  mega?: number | null
  /** The Gigantamax form it takes. */
  gmax?: number | null
  /** It may change type (Arceus, Silvally, Ogerpon) to the one best against your Pokémon. */
  formChanges?: boolean
}

export type BattleEvent =
  | { t: 'ROLL' }
  | { t: 'TOGGLE_DIE'; i: number }
  | { t: 'REROLL' }
  | { t: 'ATTACK' }
  | { t: 'USE_ITEM'; key: string; targetUid?: string }
  | { t: 'SWITCH'; instanceId: string }
  | { t: 'AI_TURN' }
  | { t: 'RUN' }
  /** Accept a stunned turn (player_stunned). */
  | { t: 'PASS' }
  /** Give up: every Pokémon of the team is K.O. and the battle is lost. */
  | { t: 'FORFEIT' }
  /** Mega Evolve the Pokémon in battle into this Mega form. It doesn't end the turn. */
  | { t: 'MEGA'; toDex: number }
  /** Gigantamax the Pokémon in battle. It doesn't end the turn. */
  | { t: 'GMAX'; toDex: number }
  /** Arceus, Silvally, Ogerpon: take this form (a type). It doesn't end the turn. */
  | { t: 'CHANGE_FORM'; toDex: number }
  /** A double battle: the foe your Pokémon will attack (docs/33). It doesn't end the turn. */
  | { t: 'TARGET'; uid: string }

export type LogEntry =
  /** `double`: a double battle's opening, yours and the foes out (docs/33). */
  | { kind: 'start'; first: Side; double?: { own: string[]; foes: string[] } }
  /** A double battle: the pair in front changed — the Pokémon whose turn it is, and the one it attacks. */
  | { kind: 'focus'; own: string; foe: string }
  /** A double battle: the trainer's next Pokémon takes the place of one K.O.'d. */
  | { kind: 'foe_out'; uid: string }
  | { kind: 'turn'; side: Side; turn: number; uid: string }
  | { kind: 'roll'; side: Side; dice: RolledDie[] }
  | { kind: 'reroll'; side: Side; mask: boolean[]; dice: RolledDie[]; rerollsLeft: number }
  | {
      kind: 'damage'
      side: Side
      target: Side
      targetUid: string
      amount: number
      hpAfter: number
      dice: RolledDie[]
      result: DamageResult
    }
  | { kind: 'status'; target: Side; targetUid: string; status: StatusKind; stacks?: number; turns?: number }
  | { kind: 'status_tick'; target: Side; targetUid: string; status: 'burn' | 'poison'; amount: number; hpAfter: number }
  /** `pending`: the player may still cure it before the turn is lost. */
  | { kind: 'stunned'; side: Side; uid: string; status: 'frozen' | 'paralyze'; pending?: boolean }
  | { kind: 'faint'; side: Side; uid: string; dex: number }
  | { kind: 'switch'; uid: string; free: boolean }
  /** Ditto took a copy of its opponent's dice. */
  | { kind: 'transform'; side: Side; uid: string; fromUid: string; dice: DieType[] }
  /** `side` 'enemy': a trainer's potion (absent = the player's item). */
  | { kind: 'item'; key: string; targetUid: string; amount: number; hpAfter: number; cured?: CurableStatus[]; rerolls?: number; side?: Side; revived?: boolean }
  | { kind: 'heal'; side: Side; uid: string; amount: number; hpAfter: number }
  /** Confusion recoil: the confused attacker hurts itself after its attack. */
  | { kind: 'recoil'; side: Side; uid: string; amount: number; hpAfter: number }
  | { kind: 'end'; result: 'won' | 'lost' | 'fled'; reason?: 'stalemate' | 'forfeit' }
  /**
   * A Pokémon changed form: `mega` (Mega Evolution, Primal Reversion, Ultra Burst — `die` is the die it gained),
   * `gmax` (Gigantamax; `revert` when it shrinks back), `lowHp` (Giratina's Origin Forme…, `revert` when it goes back
   * above half HP), `unleash` (that form on a raid Pokémon's last bar, for good; `die` is the die it gained)
   * or `choice` (an Arceus, Silvally or Ogerpon type).
   */
  | {
      kind: 'form'
      side: Side
      uid: string
      fromDex: number
      toDex: number
      reason: 'mega' | 'gmax' | 'lowHp' | 'unleash' | 'choice'
      dice: DieType[]
      die?: DieType
      revert?: boolean
    }

export interface BattlerSeed {
  uid: string
  dex: number
  level: number
  hp: number
  shiny?: boolean
  item?: string
  nickname?: string
  /** A portal run's extra dice (docs/28), after its typed dice; the whole set kept to `diceCap` dice. */
  extraDice?: DieType[]
  diceCap?: number
}

/** A set of dice with extra ones joining the typed dice (ahead of any base die), the extras cut to stay within `cap`. */
export function withExtraDice(dice: readonly DieType[], extra: readonly DieType[] | undefined, cap = Infinity): DieType[] {
  if (!extra?.length) return [...dice]
  const room = Math.max(0, cap - dice.length)
  const add = extra.slice(0, room)
  const typed = dice.filter((d) => d !== 'base')
  return [...typed, ...add, ...dice.filter((d) => d === 'base')]
}

export function makeBattler(seed: BattlerSeed, data: GameData): Battler {
  const species = getSpecies(data, seed.dex)
  const base = effectiveStats(species, seed.level, data)
  const stats = seed.extraDice?.length ? { ...base, dice: withExtraDice(base.dice, seed.extraDice, seed.diceCap) } : base
  return {
    uid: seed.uid,
    dex: seed.dex,
    name: seed.nickname || species.name,
    ...(seed.nickname && { nickname: seed.nickname }),
    level: seed.level,
    types: stats.types,
    maxHp: stats.maxHp,
    hp: Math.max(0, Math.min(stats.maxHp, seed.hp)),
    speed: species.speed,
    dice: stats.dice,
    rerolls: stats.rerolls,
    rerollsLeft: stats.rerolls,
    status: emptyStatus(),
    spriteUrl: species.spriteUrl,
    shiny: !!seed.shiny,
    baseDex: seed.dex,
    ...(seed.item && { item: seed.item }),
    ...(COPIES_FOE_DICE.has(seed.dex) && { copiesFoe: true, ownDice: stats.dice }),
  }
}

/**
 * Ditto copies whoever it faces: the dice of the opponent now in front of it (a copying opponent lends its own set).
 * Called when a battle starts and whenever either side's active Pokémon changes.
 */
export function copyFoeDice(s: BattleState, log: LogEntry[]) {
  const mine = activeBattler(s)
  for (const [side, b, foe] of [
    ['player', mine, s.enemy],
    ['enemy', s.enemy, mine],
  ] as const) {
    if (!b.copiesFoe || b.hp <= 0) continue
    const dice = [...(foe.copiesFoe ? (foe.ownDice ?? foe.dice) : foe.dice)]
    b.dice = dice
    log.push({ kind: 'transform', side, uid: b.uid, fromUid: foe.uid, dice })
  }
}

export interface FoeSeed {
  dex: number
  level: number
  hp?: number
  shiny?: boolean
  item?: string
}

export interface CreateBattleOptions {
  kind: BattleKind
  team: BattlerSeed[]
  leadUid?: string
  enemy: FoeSeed
  /**
   * A double battle (docs/33): every foe, two out at once (`enemy` is ignored), and yours led by `leadUids`. With
   * `plans` each foe's Mega / Gigantamax / type change, in the same order.
   */
  double?: { foes: FoeSeed[]; leadUids?: string[]; plans?: (EnemyPlan | null)[] }
  playerLevels: UpgradeLevels
  enemyLevels: UpgradeLevels
  /** The player has unlocked Mega Evolution (see `megaUnlocked`). */
  megaAllowed?: boolean
  /** The player has unlocked Gigantamax (see `gmaxUnlocked`). */
  gmaxAllowed?: boolean
  /** The foe's Mega / Gigantamax / type change (see `enemyPlanFor`). */
  enemyPlan?: EnemyPlan | null
  /** An auto battle: no Mega Evolution or Gigantamax, for either side — only the foe's type change is kept. */
  auto?: boolean
  /** No Potion or Revive works (Extreme mode, items switched off). */
  noHealItems?: boolean
}

/** Takes on a form's look and types (the dice are the caller's business). */
function wearForm(b: Battler, form: Species) {
  b.dex = form.dex
  b.name = b.nickname || form.name
  b.types = form.type2 ? [form.type1, form.type2] : [form.type1]
  b.spriteUrl = form.spriteUrl
}

const snapshot = (b: Battler): FormSnapshot => ({ dex: b.dex, name: b.name, types: [...b.types], dice: [...b.dice] })
function restore(b: Battler, pre: FormSnapshot, data: GameData) {
  b.dex = pre.dex
  b.name = pre.name
  b.types = pre.types
  b.dice = pre.dice
  b.spriteUrl = data.species[pre.dex]?.spriteUrl ?? b.spriteUrl
}

/** A new die goes with the other typed dice, ahead of any base die; thrown into the hand when the hand is out. */
function addDie(s: BattleState, side: Side, b: Battler, die: DieType, data: GameData, rng: Rng) {
  const at = b.dice.filter((d) => d !== 'base').length
  b.dice.splice(at, 0, die)
  if (side === 'player' && s.phase === 'player_reroll') {
    s.dice.splice(Math.min(at, s.dice.length), 0, rollAll([die], data, rng)[0]!)
    s.selected.splice(Math.min(at, s.selected.length), 0, false)
  }
}

/** Mega Evolution (Primal Reversion, Ultra Burst): its look and types, and a die, until the battle ends. */
function megaEvolve(s: BattleState, side: Side, b: Battler, mega: Species, data: GameData, rng: Rng, log: LogEntry[]) {
  const base = data.species[b.baseDex ?? b.dex]
  if (!base) return
  const fromDex = b.dex
  const die = megaDie(base, mega)
  wearForm(b, mega)
  b.mega = true
  addDie(s, side, b, die, data, rng)
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'mega', dice: [...b.dice], die })
}

/** Gigantamax: its look and a die of its first type, for `gigantamax.turns` of its own turns. */
function gigantamax(s: BattleState, side: Side, b: Battler, form: Species, data: GameData, rng: Rng, log: LogEntry[]) {
  const base = data.species[b.baseDex ?? b.dex]
  if (!base) return
  const pre = snapshot(b)
  const die = megaDie(base, form)
  wearForm(b, form)
  addDie(s, side, b, die, data, rng)
  b.gmax = { turns: Math.max(1, data.config.gigantamax.turns), pre }
  log.push({ kind: 'form', side, uid: b.uid, fromDex: pre.dex, toDex: b.dex, reason: 'gmax', dice: [...b.dice], die })
}

/** Back to its size: the look and the dice it had before. */
function endGmax(side: Side, b: Battler, data: GameData, log: LogEntry[]) {
  if (!b.gmax) return
  const fromDex = b.dex
  restore(b, b.gmax.pre, data)
  delete b.gmax
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'gmax', dice: [...b.dice], revert: true })
}

/** One of its own turns has gone by: a Gigantamax Pokémon shrinks back after its last. */
function tickGmax(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  const b = side === 'player' ? activeBattler(s) : s.enemy
  if (!b.gmax || b.hp <= 0) return
  b.gmax.turns -= 1
  if (b.gmax.turns <= 0) endGmax(side, b, data, log)
}

/** A type picked from the menu (Arceus, Silvally, Ogerpon): its look, and every die — the hand too — takes the type. */
function changeForm(s: BattleState, side: Side, b: Battler, form: Species, log: LogEntry[]) {
  const fromDex = b.dex
  const type = choiceFormDie(form)
  wearForm(b, form)
  b.dice = b.dice.map(() => type)
  if (side === 'player') s.dice = s.dice.map((d) => ({ ...d, type }))
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'choice', dice: [...b.dice] })
}

/** The type forms open to this battler (its own form among them once it has taken another). */
function typeForms(b: Battler, data: GameData): Species[] {
  const base = b.baseDex ?? b.dex
  const forms = choiceFormsOf(data, base)
  if (!forms.length) return []
  const own = data.species[base]
  return [...(own ? [own] : []), ...forms].filter((f) => f.dex !== b.dex)
}

/**
 * The type forms whose type hits `target` hardest, when that beats every type `b` rolls now (an Arceus facing a
 * Pokémon its Normal dice can't touch turns Fighting, or whatever is best). Empty when none does better.
 */
function bestTypeForms(b: Battler, target: Battler, forms: Species[], data: GameData): Species[] {
  const score = (t: PokeType) => attackMultiplier(t, target.types, data)
  let bestScore = Math.max(0, ...b.dice.filter((d): d is PokeType => d !== 'base').map(score))
  let best: Species[] = []
  for (const f of forms) {
    const sc = score(choiceFormDie(f))
    if (sc > bestScore) {
      best = [f]
      bestScore = sc
    } else if (sc === bestScore && best.length) best.push(f)
  }
  return best
}

/** The foe's pick: a type form best against your Pokémon — the first of them, or in an auto battle one at random. */
function foeTypeForm(s: BattleState, b: Battler, target: Battler, data: GameData, rng: Rng): Species | null {
  const best = bestTypeForms(b, target, typeForms(b, data), data)
  if (!best.length) return null
  return s.auto ? rng.pick(best) : best[0]!
}

/** Auto-mode's pick for the Pokémon in battle: a type form best against the foe, at random among equals. */
export function autoTypeForm(s: BattleState, data: GameData, rng: Rng): Species | null {
  const best = bestTypeForms(activeBattler(s), s.enemy, formChoices(s, data), data)
  return best.length ? rng.pick(best) : null
}

/**
 * Giratina's Origin Forme: below half HP it takes it, one Ghost die turning Dragon; back at half or above it returns
 * to its Altered Forme. Checked for both sides whenever HP may have moved. A K.O.'d Pokémon keeps the look it fell in.
 */
function checkHpForms(s: BattleState, data: GameData, log: LogEntry[]) {
  const foes = s.double?.foes ?? [s.enemy]
  for (const [side, b] of [...s.player.map((p) => ['player', p] as const), ...foes.map((f) => ['enemy', f] as const)]) {
    // A Mega or Gigantamax Pokémon keeps that look whatever its HP; a raid Pokémon's waits for its last bar.
    if (b.hp <= 0 || b.mega || b.gmax || b.formHeld) continue
    const low = b.hp * 2 < b.maxHp
    if (low && !b.preForm) {
      const form = lowHpFormOf(data, b.dex)
      if (!form) continue
      const swap = form.form?.swapDie
      b.preForm = snapshot(b)
      const fromDex = b.dex
      wearForm(b, form)
      if (swap) b.dice = swapOneDie(b.dice, swap.from, swap.to)
      log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'lowHp', dice: [...b.dice] })
    } else if (!low && b.preForm) {
      const fromDex = b.dex
      restore(b, b.preForm, data)
      delete b.preForm
      log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'lowHp', dice: [...b.dice], revert: true })
    }
  }
}

/**
 * A raid Pokémon's last bar (docs/28, the user's call of 2026-10-16): its below-half-HP form is unleashed for
 * good, and it gains a die of the type the form brings (Giratina's Origin Forme: one more Dragon die) where a
 * battle swaps one. Null for a Pokémon with no such form, or already in it.
 */
export function unleashForm(b: Battler, data: GameData): Extract<LogEntry, { kind: 'form' }> | null {
  const form = lowHpFormOf(data, b.baseDex ?? b.dex)
  if (!form || b.dex === form.dex) return null
  const die = form.form?.swapDie?.to ?? form.type1
  const fromDex = b.dex
  wearForm(b, form)
  // With the other typed dice, ahead of any base die.
  b.dice.splice(b.dice.filter((d) => d !== 'base').length, 0, die)
  return {
    kind: 'form',
    side: 'enemy',
    uid: b.uid,
    fromDex,
    toDex: b.dex,
    reason: 'unleash',
    dice: [...b.dice],
    die,
  }
}

/** The Mega forms the Pokémon in battle could take right now (empty when it can't Mega Evolve). */
export function megaChoices(s: BattleState, data: GameData): Species[] {
  if (s.auto || !s.megaAllowed || (s.megaUsed ?? 0) >= data.config.megaEvolution.perBattle) return []
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  if (a.mega || a.gmax || a.hp <= 0 || a.preForm) return []
  return megaOptions(data, a.baseDex ?? a.dex, a.level)
}

/** The Gigantamax form the Pokémon in battle could take right now — it shares the Mega's one-per-battle. */
export function gmaxChoices(s: BattleState, data: GameData): Species[] {
  if (s.auto || !s.gmaxAllowed || (s.megaUsed ?? 0) >= data.config.megaEvolution.perBattle) return []
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  if (a.mega || a.gmax || a.hp <= 0 || a.preForm) return []
  return gmaxFormsOf(data, a.baseDex ?? a.dex)
}

/** The types the Pokémon in battle could take right now (empty when it has none, or the change is spent). */
export function formChoices(s: BattleState, data: GameData): Species[] {
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  // Each Pokémon has its own changes for the battle.
  if (a.hp <= 0 || (a.formChanges ?? 0) >= data.config.formChangesPerBattle) return []
  return typeForms(a, data)
}

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player')
export const activeBattler = (s: BattleState): Battler => s.player[s.activeIndex]!

export function createBattle(opts: CreateBattleOptions, data: GameData): { state: BattleState; log: LogEntry[] } {
  if (opts.double && opts.double.foes.length > 1) return createDouble(opts, opts.double, data)
  const player = opts.team.map((t) => makeBattler(t, data))
  let activeIndex = player.findIndex((b) => b.uid === opts.leadUid && b.hp > 0)
  if (activeIndex < 0) activeIndex = player.findIndex((b) => b.hp > 0)
  if (activeIndex < 0) throw new Error('No able Pokémon to send out')
  const enemyMax = effectiveStats(getSpecies(data, opts.enemy.dex), opts.enemy.level, data).maxHp
  const enemy = makeBattler(
    { uid: 'enemy', dex: opts.enemy.dex, level: opts.enemy.level, hp: opts.enemy.hp ?? enemyMax, shiny: opts.enemy.shiny, item: opts.enemy.item },
    data,
  )
  const lead = player[activeIndex]!
  const first: Side = lead.speed >= enemy.speed ? 'player' : 'enemy' // tie → player
  const state: BattleState = {
    kind: opts.kind,
    phase: 'player_roll',
    turn: 0,
    actor: first,
    nextActor: first,
    player,
    activeIndex,
    enemy,
    dice: [],
    selected: [],
    playerLevels: opts.playerLevels,
    enemyLevels: opts.enemyLevels,
    participants: [lead.uid],
    canRun: opts.kind === 'wild' && !data.config.noEscape,
    ...(opts.noHealItems && { noHealItems: true }),
    lastDamage: null,
    itemUsedThisTurn: false,
    ...(opts.auto
      ? { auto: true, ...(opts.enemyPlan?.formChanges && { enemyPlan: { formChanges: true } }) }
      : {
          ...(opts.megaAllowed && { megaAllowed: true }),
          ...(opts.gmaxAllowed && { gmaxAllowed: true }),
          ...(opts.enemyPlan && { enemyPlan: opts.enemyPlan }),
        }),
  }
  const log: LogEntry[] = [{ kind: 'start', first }]
  // A Giratina sent out below half HP is already in its Origin Forme.
  checkHpForms(state, data, log)
  copyFoeDice(state, log)
  beginTurn(state, first, data, log)
  return { state, log }
}

function finish(s: BattleState, result: 'won' | 'lost' | 'fled', log: LogEntry[], reason?: 'stalemate' | 'forfeit') {
  s.phase = result
  s.dice = []
  s.selected = []
  // All statuses clear when the battle ends; HP damage persists.
  for (const b of s.player) b.status = emptyStatus()
  s.enemy.status = emptyStatus()
  for (const f of s.double?.foes ?? []) f.status = emptyStatus()
  log.push(reason ? { kind: 'end', result, reason } : { kind: 'end', result })
}

/** Handles K.O.s. Returns true when the flow stopped (battle over or a switch is required). */
function checkKnockouts(s: BattleState, log: LogEntry[]): boolean {
  if (s.enemy.hp <= 0) {
    log.push({ kind: 'faint', side: 'enemy', uid: s.enemy.uid, dex: s.enemy.dex })
    finish(s, 'won', log)
    return true
  }
  const a = activeBattler(s)
  if (a.hp <= 0) {
    log.push({ kind: 'faint', side: 'player', uid: a.uid, dex: a.dex })
    if (s.player.some((b) => b.hp > 0)) {
      s.phase = 'player_switch'
      s.dice = []
      s.selected = []
      return true
    }
    finish(s, 'lost', log)
    return true
  }
  return false
}

/**
 * Whether `atk`'s attacks can hurt `def` at all (v1.8: the whole attack takes its best dice type's effectiveness),
 * through a raid's matchups when it has them.
 */
export function canHurt(atk: Battler, def: Battler, data: GameData, scale?: RaidTypeScale): boolean {
  const dice = atk.dice.map((type) => ({ type, faceIndex: 0 }))
  return attackMultiplier(attackType(dice, atk.types, def.types, data), def.types, data, scale) > 0
}

/**
 * Nobody can ever lose: the foe can't hurt the active Pokémon, no Pokémon on the team can hurt the foe, and no
 * burn / poison / confusion is left to change that. The fight ends as a stalemate at once instead of at the turn cap.
 */
function deadlocked(s: BattleState, data: GameData): boolean {
  const me = activeBattler(s)
  const foe = s.enemy
  if (me.hp <= 0 || foe.hp <= 0) return false
  const pending = (b: Battler) => !!b.status.burn || !!b.status.poison || b.status.confused
  if (pending(me) || pending(foe) || canHurt(foe, me, data)) return false
  return !s.player.some((p) => p.hp > 0 && canHurt(p, foe, data))
}

/** A raid step has had its action (or lost it to a stun or a K.O. at its start). */
function endStep(s: BattleState) {
  s.phase = 'done'
  s.dice = []
  s.selected = []
}

/**
 * A raid step: `side` takes one turn in this one-on-one duel. It starts like any turn (the DoT ticks, then the stun
 * check: the player may still cure it) and ends with phase 'done' after its one action.
 */
export function startDuelStep(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  s.single = true
  copyFoeDice(s, log)
  beginTurn(s, side, data, log)
}

/** Turn start: DoT tick (can K.O.), then the stun check (skips the turn), then the actor may act. */
function beginTurn(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  if (s.double) return beginDoubleTurn(s, data, log)
  const rules = data.config.status
  for (let guard = 0; guard < 50; guard++) {
    // A raid keeps its own count of turns.
    if (!s.single && (s.turn >= data.config.maxBattleTurns || deadlocked(s, data))) {
      // No rewards, no wipe; HP damage is kept like a RUN.
      finish(s, 'fled', log, 'stalemate')
      return
    }
    s.turn += 1
    s.actor = side
    s.dice = []
    s.selected = []
    s.itemUsedThisTurn = false
    const b = side === 'player' ? activeBattler(s) : s.enemy
    log.push({ kind: 'turn', side, turn: s.turn, uid: b.uid })

    const { state, ticks } = tickDot(b.status, rules, b.maxHp)
    b.status = state
    for (const t of ticks) {
      b.hp = Math.max(0, b.hp - t.amount)
      log.push({ kind: 'status_tick', target: side, targetUid: b.uid, status: t.status, amount: t.amount, hpAfter: b.hp })
    }
    if (ticks.length) checkHpForms(s, data, log)
    if (b.hp <= 0 && s.single) return endStep(s)
    if (b.hp <= 0) {
      // A K.O. here ends the turn.
      if (checkKnockouts(s, log) && s.phase === 'player_switch') s.nextActor = other(side)
      return
    }

    const stun = stunKind(b.status)
    if (stun && side === 'player') {
      // The player may cure it first (Ice Heal, Paralyze Heal) — or PASS, which spends the stunned turn.
      s.phase = 'player_stunned'
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun, pending: true })
      return
    }
    if (stun) {
      b.status = consumeStun(b.status)
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun })
      if (s.single) return endStep(s)
      side = other(side)
      continue
    }
    s.phase = side === 'player' ? 'player_roll' : 'enemy_turn'
    return
  }
}

function afterAction(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  tickGmax(s, side, data, log)
  if (s.single) return endStep(s)
  if (s.double) {
    if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log)
    return
  }
  if (checkKnockouts(s, log)) {
    if (s.phase === 'player_switch') s.nextActor = other(side)
    return
  }
  beginTurn(s, other(side), data, log)
}

// ---------------------------------------------------------------- Double battles (docs/33)
//
// Two of each side out at once. Every round, all of them act once, fastest first (a tie goes to yours). The one whose
// turn it is and the one it attacks are the pair in front — `activeIndex` and `enemy` — so the rules above (the roll,
// the damage, statuses, items, forms) work on them unchanged; these functions only move the pair and run the round.

/** The foe uid of each of a trainer's or wild pair's Pokémon: the first keeps the one-on-one's. */
const foeUid = (i: number) => (i === 0 ? 'enemy' : `enemy-${i}`)

/** Yours out on the field. */
export const ownOnField = (s: BattleState): Battler[] => (s.double ? s.double.ownSlots.map((i) => s.player[i]!) : [activeBattler(s)])
/** The foes out on the field. */
export const foesOnField = (s: BattleState): Battler[] => (s.double ? s.double.foeSlots.map((i) => s.double!.foes[i]!) : [s.enemy])

function createDouble(
  opts: CreateBattleOptions,
  double: NonNullable<CreateBattleOptions['double']>,
  data: GameData,
): { state: BattleState; log: LogEntry[] } {
  const player = opts.team.map((t) => makeBattler(t, data))
  // The leads picked, then whoever is able, two at most; one alone fights both (docs/33).
  const ownSlots: number[] = []
  for (const uid of [...(double.leadUids ?? []), ...(opts.leadUid ? [opts.leadUid] : []), ...player.map((b) => b.uid)]) {
    const i = player.findIndex((b) => b.uid === uid && b.hp > 0)
    if (i >= 0 && !ownSlots.includes(i) && ownSlots.length < 2) ownSlots.push(i)
  }
  if (!ownSlots.length) throw new Error('No able Pokémon to send out')
  const foes = double.foes.map((f, i) => {
    const max = effectiveStats(getSpecies(data, f.dex), f.level, data).maxHp
    return makeBattler({ uid: foeUid(i), dex: f.dex, level: f.level, hp: f.hp ?? max, shiny: f.shiny, item: f.item }, data)
  })
  const plans: Record<string, EnemyPlan> = {}
  double.plans?.forEach((p, i) => {
    if (p && foes[i]) plans[foes[i]!.uid] = opts.auto ? { ...(p.formChanges && { formChanges: true }) } : p
  })
  const state: BattleState = {
    kind: opts.kind,
    phase: 'player_roll',
    turn: 0,
    actor: 'player',
    nextActor: 'player',
    player,
    activeIndex: ownSlots[0]!,
    enemy: foes[0]!,
    dice: [],
    selected: [],
    playerLevels: opts.playerLevels,
    enemyLevels: opts.enemyLevels,
    participants: ownSlots.map((i) => player[i]!.uid),
    canRun: opts.kind === 'wild' && !data.config.noEscape,
    ...(opts.noHealItems && { noHealItems: true }),
    lastDamage: null,
    itemUsedThisTurn: false,
    ...(opts.auto
      ? { auto: true }
      : { ...(opts.megaAllowed && { megaAllowed: true }), ...(opts.gmaxAllowed && { gmaxAllowed: true }) }),
    double: {
      foes,
      foeSlots: foes.length > 1 ? [0, 1] : [0],
      ownSlots,
      foeIndex: 0,
      queue: [],
      round: 0,
      toReplace: 0,
      kos: [],
      ...(Object.keys(plans).length > 0 && { plans }),
    },
  }
  const order = roundOrder(state)
  const first: Side = order[0]?.side ?? 'player'
  const log: LogEntry[] = [
    { kind: 'start', first, double: { own: ownOnField(state).map((b) => b.uid), foes: foesOnField(state).map((b) => b.uid) } },
  ]
  checkHpForms(state, data, log)
  // Every Ditto out copies the Pokémon facing it.
  for (const [side, row, facing] of [
    ['player', ownOnField(state), foesOnField(state)],
    ['enemy', foesOnField(state), ownOnField(state)],
  ] as const)
    row.forEach((b, i) => copyDiceOf(b, side, facing[Math.min(i, facing.length - 1)]!, log))
  beginDoubleTurn(state, data, log)
  return { state, log }
}

/** Who acts this round, fastest first; a tie goes to yours, then left before right. */
function roundOrder(s: BattleState): { side: Side; uid: string }[] {
  const d = s.double!
  const all = [
    ...d.ownSlots.map((i, at) => ({ side: 'player' as Side, b: s.player[i]!, at })),
    ...d.foeSlots.map((i, at) => ({ side: 'enemy' as Side, b: d.foes[i]!, at })),
  ].filter((x) => x.b.hp > 0)
  all.sort((a, b) => b.b.speed - a.b.speed || (a.side === b.side ? 0 : a.side === 'player' ? -1 : 1) || a.at - b.at)
  return all.map((x) => ({ side: x.side, uid: x.b.uid }))
}

/** The pair in front: yours at `own`, the foe at `foe` (indexes into `player` and `double.foes`); said when it moves. */
function setFront(s: BattleState, own: number, foe: number, log: LogEntry[]) {
  const d = s.double!
  const changed = s.activeIndex !== own || d.foeIndex !== foe
  s.activeIndex = own
  d.foeIndex = foe
  s.enemy = d.foes[foe]!
  if (changed) log.push({ kind: 'focus', own: s.player[own]!.uid, foe: s.enemy.uid })
}

/** Ditto takes `foe`'s dice (a copying foe lends its own set), said only when that changes them. */
function copyDiceOf(b: Battler, side: Side, foe: Battler, log: LogEntry[]) {
  if (!b.copiesFoe || b.hp <= 0) return
  const dice = [...(foe.copiesFoe ? (foe.ownDice ?? foe.dice) : foe.dice)]
  if (dice.length === b.dice.length && dice.every((d, i) => d === b.dice[i])) return
  b.dice = dice
  log.push({ kind: 'transform', side, uid: b.uid, fromUid: foe.uid, dice })
}

/** The Pokémon in front on `side` copies the one it faces (Ditto). */
function copyTarget(s: BattleState, side: Side, log: LogEntry[]) {
  const mine = activeBattler(s)
  if (side === 'player') copyDiceOf(mine, 'player', s.enemy, log)
  else copyDiceOf(s.enemy, 'enemy', mine, log)
}

/** The first able foe out, for yours to aim at when its last target fell. */
function firstFoe(s: BattleState): number {
  const d = s.double!
  return d.foeSlots.find((i) => d.foes[i]!.hp > 0) ?? d.foeSlots[0] ?? d.foeIndex
}

/** The foe in front picks one of yours out at random, and brings its own plan (a trainer's ace). */
function aimAtRandom(s: BattleState, rng: Rng, log: LogEntry[]) {
  const d = s.double!
  const able = d.ownSlots.filter((i) => s.player[i]!.hp > 0)
  if (able.length) setFront(s, able.length === 1 ? able[0]! : rng.pick(able), d.foeIndex, log)
  const plan = d.plans?.[s.enemy.uid]
  if (plan) s.enemyPlan = plan
  else delete s.enemyPlan
  s.enemyPlanDone = !!d.plansDone?.includes(s.enemy.uid)
  copyTarget(s, 'enemy', log)
}

/** Nobody out can hurt anyone on the other side, nobody on the bench could change that, and no DoT is pending. */
function doubleDeadlocked(s: BattleState, data: GameData): boolean {
  const d = s.double!
  const own = ownOnField(s).filter((b) => b.hp > 0)
  const foes = foesOnField(s).filter((b) => b.hp > 0)
  if (!own.length || !foes.length) return false
  const pending = (b: Battler) => !!b.status.burn || !!b.status.poison || b.status.confused
  if ([...own, ...foes].some(pending)) return false
  if (foes.some((f) => own.some((o) => canHurt(f, o, data)))) return false
  return !s.player.some((p) => p.hp > 0 && d.foes.some((f) => f.hp > 0 && canHurt(p, f, data)))
}

/** The next one to act this round (a new round when everyone has), or null when nobody is left to. */
function nextActor(s: BattleState): { side: Side; index: number } | null {
  const d = s.double!
  for (let guard = 0; guard < 2; guard++) {
    while (d.queue.length) {
      const uid = d.queue.shift()!
      const own = d.ownSlots.find((i) => s.player[i]!.uid === uid && s.player[i]!.hp > 0)
      if (own != null) return { side: 'player', index: own }
      const foe = d.foeSlots.find((i) => d.foes[i]!.uid === uid && d.foes[i]!.hp > 0)
      if (foe != null) return { side: 'enemy', index: foe }
    }
    d.round += 1
    d.queue = roundOrder(s).map((x) => x.uid)
  }
  return null
}

/** The next turn of the round: its actor moves to the front, then the DoT tick and the stun check as in any turn. */
function beginDoubleTurn(s: BattleState, data: GameData, log: LogEntry[]) {
  const rules = data.config.status
  for (let guard = 0; guard < 50; guard++) {
    // Four Pokémon take turns: the cap counts every one of them, so it is twice a single battle's.
    const next = s.turn >= data.config.maxBattleTurns * 2 || doubleDeadlocked(s, data) ? null : nextActor(s)
    if (!next) {
      finish(s, 'fled', log, 'stalemate')
      return
    }
    const side = next.side
    if (side === 'player') {
      // Yours faces the foe in front (the last one to act), or the first foe left.
      const foe = s.double!.foeSlots.includes(s.double!.foeIndex) && s.enemy.hp > 0 ? s.double!.foeIndex : firstFoe(s)
      setFront(s, next.index, foe, log)
    } else setFront(s, s.activeIndex, next.index, log)
    if (side === 'player') copyTarget(s, 'player', log)
    s.turn += 1
    s.actor = side
    s.nextActor = side
    s.dice = []
    s.selected = []
    s.itemUsedThisTurn = false
    const b = side === 'player' ? activeBattler(s) : s.enemy
    log.push({ kind: 'turn', side, turn: s.turn, uid: b.uid })

    const { state, ticks } = tickDot(b.status, rules, b.maxHp)
    b.status = state
    for (const t of ticks) {
      b.hp = Math.max(0, b.hp - t.amount)
      log.push({ kind: 'status_tick', target: side, targetUid: b.uid, status: t.status, amount: t.amount, hpAfter: b.hp })
    }
    if (ticks.length) checkHpForms(s, data, log)
    if (b.hp <= 0) {
      // A K.O. here ends the turn.
      if (doubleKnockouts(s, log)) return
      continue
    }
    const stun = stunKind(b.status)
    if (stun && side === 'player') {
      s.phase = 'player_stunned'
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun, pending: true })
      return
    }
    if (stun) {
      b.status = consumeStun(b.status)
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun })
      continue
    }
    s.phase = side === 'player' ? 'player_roll' : 'enemy_turn'
    return
  }
  finish(s, 'fled', log, 'stalemate')
}

/**
 * K.O.s on the field: a fallen foe makes way for the trainer's next one, a fallen one of yours for one from your bench
 * (your pick: the player_switch phase), or leaves its side to fight on alone. Returns true when the flow stopped
 * (the battle is over or you pick a replacement).
 */
function doubleKnockouts(s: BattleState, log: LogEntry[]): boolean {
  const d = s.double!
  const fighters = d.ownSlots.map((i) => s.player[i]!.uid)
  for (const [at, i] of [...d.foeSlots].entries()) {
    const f = d.foes[i]!
    if (f.hp > 0) continue
    log.push({ kind: 'faint', side: 'enemy', uid: f.uid, dex: f.dex })
    d.kos.push({ uid: f.uid, dex: f.baseDex ?? f.dex, level: f.level, shiny: f.shiny, fighters })
    const slot = d.foeSlots.indexOf(i)
    // A foe never out yet (alive and off the field) takes its place, in the same spot.
    const reserve = d.foes.findIndex((x, k) => x.hp > 0 && !d.foeSlots.includes(k))
    if (reserve >= 0) {
      d.foeSlots[slot] = reserve
      log.push({ kind: 'foe_out', uid: d.foes[reserve]!.uid })
      const facing = ownOnField(s).filter((b) => b.hp > 0)
      if (facing.length) copyDiceOf(d.foes[reserve]!, 'enemy', facing[Math.min(at, facing.length - 1)]!, log)
    } else d.foeSlots.splice(slot, 1)
  }
  if (!d.foes.some((f) => f.hp > 0)) {
    finish(s, 'won', log)
    return true
  }
  if (!d.foeSlots.includes(d.foeIndex) || s.enemy.hp <= 0) setFront(s, s.activeIndex, firstFoe(s), log)
  let fallen = 0
  for (const i of [...d.ownSlots]) {
    const b = s.player[i]!
    if (b.hp > 0) continue
    log.push({ kind: 'faint', side: 'player', uid: b.uid, dex: b.dex })
    d.ownSlots.splice(d.ownSlots.indexOf(i), 1)
    fallen += 1
  }
  if (!s.player.some((b) => b.hp > 0)) {
    finish(s, 'lost', log)
    return true
  }
  if (fallen) {
    const bench = s.player.filter((b, k) => b.hp > 0 && !d.ownSlots.includes(k)).length
    d.toReplace = Math.min(fallen, bench, 2 - d.ownSlots.length)
    if (d.toReplace > 0) {
      s.phase = 'player_switch'
      s.dice = []
      s.selected = []
      return true
    }
    if (!d.ownSlots.includes(s.activeIndex)) setFront(s, d.ownSlots[0]!, d.foeIndex, log)
  }
  return false
}

/**
 * A switch in a double battle: after a K.O., a free one into the empty spot; on your turn, the Pokémon whose turn it
 * is goes back for one from the bench (or, with a spot empty, the bench one joins it), and the turn ends.
 */
function doubleSwitch(s: BattleState, uid: string, data: GameData, log: LogEntry[]): boolean {
  const d = s.double!
  const idx = s.player.findIndex((b) => b.uid === uid)
  const target = s.player[idx]
  if (!target || target.hp <= 0 || d.ownSlots.includes(idx)) return false
  const enter = () => {
    if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
  }
  if (s.phase === 'player_switch') {
    d.ownSlots.push(idx)
    enter()
    log.push({ kind: 'switch', uid: target.uid, free: true })
    d.toReplace -= 1
    const facing = foesOnField(s).filter((f) => f.hp > 0)
    if (facing.length) copyDiceOf(target, 'player', facing[Math.min(d.ownSlots.length - 1, facing.length - 1)]!, log)
    if (d.toReplace > 0 && s.player.some((b, k) => b.hp > 0 && !d.ownSlots.includes(k))) return true
    d.toReplace = 0
    if (!d.ownSlots.includes(s.activeIndex)) setFront(s, idx, d.foeIndex, log)
    beginDoubleTurn(s, data, log)
    return true
  }
  if ((s.phase !== 'player_roll' && s.phase !== 'player_reroll') || !data.config.allowVoluntarySwitch) return false
  const outgoing = activeBattler(s)
  if (d.ownSlots.length >= 2) {
    // A Gigantamax Pokémon shrinks back when it leaves the field.
    if (outgoing.gmax) endGmax('player', outgoing, data, log)
    d.ownSlots[d.ownSlots.indexOf(s.activeIndex)] = idx
  } else d.ownSlots.push(idx)
  enter()
  log.push({ kind: 'switch', uid: target.uid, free: false })
  s.activeIndex = idx
  log.push({ kind: 'focus', own: target.uid, foe: s.enemy.uid })
  copyTarget(s, 'player', log)
  s.dice = []
  s.selected = []
  // The outgoing one's turn is spent; the newcomer waits for the next round.
  if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log)
  return true
}

/** Recoil a confused attacker takes after its attack: `status.confuse.recoilPercent` of its max HP, at least 1. */
export function confusionRecoil(maxHp: number, data: GameData): number {
  return Math.max(1, Math.round((maxHp * data.config.status.confuse.recoilPercent) / 100))
}

function resolveAttack(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  const atk = side === 'player' ? activeBattler(s) : s.enemy
  const def = side === 'player' ? s.enemy : activeBattler(s)
  const levels = side === 'player' ? s.playerLevels : s.enemyLevels
  const dice = s.dice

  const result = computeDamage(dice, atk.types, def.types, levels, data)
  def.hp = Math.max(0, def.hp - result.final)
  s.lastDamage = result
  log.push({
    kind: 'damage',
    side,
    target: other(side),
    targetUid: def.uid,
    amount: result.final,
    hpAfter: def.hp,
    dice,
    result,
  })
  const all = statusesFromRoll(dice, data)
  const apps = all.filter((a) => a.status !== 'heal')
  // An attack with no effect inflicts nothing either.
  if (def.hp > 0 && apps.length && !result.immune) {
    def.status = applyStatuses(def.status, apps, data.config.status)
    for (const a of apps)
      log.push({ kind: 'status', target: other(side), targetUid: def.uid, status: a.status, stacks: a.stacks, turns: a.turns })
  }
  // Heal faces: the attacker restores HP on top of the damage it dealt.
  const heal = all.find((a) => a.status === 'heal')
  if (heal?.amount && atk.hp > 0 && atk.hp < atk.maxHp) {
    const before = atk.hp
    atk.hp = Math.min(atk.maxHp, atk.hp + heal.amount)
    log.push({ kind: 'heal', side, uid: atk.uid, amount: atk.hp - before, hpAfter: atk.hp })
  }
  // Confusion: the attack still lands, then the attacker takes recoil (a % of its max HP) and the confusion clears.
  if (atk.status.confused) {
    atk.status = { ...atk.status, confused: false }
    const amount = confusionRecoil(atk.maxHp, data)
    atk.hp = Math.max(0, atk.hp - amount)
    log.push({ kind: 'recoil', side, uid: atk.uid, amount, hpAfter: atk.hp })
  }
  checkHpForms(s, data, log)
  s.dice = []
  s.selected = []
  afterAction(s, side, data, log)
}

const NOOP = (state: BattleState) => ({ state, log: [] as LogEntry[] })

export function reduce(
  state: BattleState,
  e: BattleEvent,
  data: GameData,
  rng: Rng,
): { state: BattleState; log: LogEntry[] } {
  const terminal = state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled' || state.phase === 'done'
  if (terminal) return NOOP(state)
  const s = structuredClone(state)
  const log: LogEntry[] = []
  if (s.double) s.enemy = s.double.foes[s.double.foeIndex]!

  switch (e.t) {
    case 'ROLL': {
      if (s.phase !== 'player_roll') return NOOP(state)
      const a = activeBattler(s)
      s.dice = rollAll(a.dice, data, rng)
      s.selected = s.dice.map(() => false)
      s.phase = 'player_reroll'
      log.push({ kind: 'roll', side: 'player', dice: s.dice })
      break
    }
    case 'TOGGLE_DIE': {
      if (s.phase !== 'player_reroll' || e.i < 0 || e.i >= s.dice.length) return NOOP(state)
      s.selected[e.i] = !s.selected[e.i]
      break
    }
    case 'REROLL': {
      const a = activeBattler(s)
      if (s.phase !== 'player_reroll' || a.rerollsLeft <= 0 || !s.selected.some(Boolean)) return NOOP(state)
      // One press = one reroll spent, however many dice were selected.
      const mask = [...s.selected]
      s.dice = rerollMasked(s.dice, mask, data, rng)
      a.rerollsLeft -= 1
      s.selected = s.dice.map(() => false)
      log.push({ kind: 'reroll', side: 'player', mask, dice: s.dice, rerollsLeft: a.rerollsLeft })
      break
    }
    case 'ATTACK': {
      if (s.phase !== 'player_reroll') return NOOP(state)
      resolveAttack(s, 'player', data, log)
      break
    }
    case 'USE_ITEM': {
      // One item per turn — before the roll, after it, or while stunned. It doesn't end the turn.
      const phaseOk = s.phase === 'player_roll' || s.phase === 'player_reroll' || s.phase === 'player_stunned'
      if (!phaseOk || s.itemUsedThisTurn) return NOOP(state)
      const item = data.items[e.key]
      const target = s.player.find((b) => b.uid === (e.targetUid ?? activeBattler(s).uid))
      if (!item || !target) return NOOP(state)
      const fx = item.effect
      if (s.noHealItems && (fx.kind === 'heal' || fx.kind === 'revive')) return NOOP(state)
      // Only a revive works on a K.O.'d Pokémon (a benched one: the active can't be K.O. on your turn), and only on one.
      if ((fx.kind === 'revive') !== target.hp <= 0) return NOOP(state)
      if (fx.kind === 'revive') {
        target.hp = reviveHp(fx.percent, target.maxHp)
        target.status = emptyStatus()
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: target.hp, hpAfter: target.hp, revived: true })
        // A double battle with a spot empty (yours fought on alone): it stands back up there, and acts from next round.
        const d = s.double
        const at = s.player.indexOf(target)
        if (d && d.ownSlots.length < 2 && !d.ownSlots.includes(at)) {
          d.ownSlots.push(at)
          if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        }
      } else if (fx.kind === 'heal') {
        if (target.hp >= target.maxHp) return NOOP(state)
        const amount = Math.min(fx.amount, target.maxHp - target.hp)
        target.hp += amount
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount, hpAfter: target.hp })
      } else if (fx.kind === 'cure') {
        const cured = fx.statuses.filter((k) => hasStatus(target.status, k))
        if (!cured.length) return NOOP(state)
        target.status = clearStatuses(target.status, cured)
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: 0, hpAfter: target.hp, cured })
        // Cured of the stun that was about to eat the turn: the turn goes ahead.
        if (s.phase === 'player_stunned' && target === activeBattler(s) && !stunKind(target.status)) s.phase = 'player_roll'
      } else if (fx.kind === 'rerolls') {
        const gained = Math.min(fx.amount, target.rerolls - target.rerollsLeft)
        if (gained <= 0) return NOOP(state)
        target.rerollsLeft += gained
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: 0, hpAfter: target.hp, rerolls: gained })
      } else return NOOP(state) // Rare Candy and balls aren't battle items
      s.itemUsedThisTurn = true
      checkHpForms(s, data, log)
      break
    }
    case 'MEGA': {
      const a = activeBattler(s)
      const mega = megaChoices(s, data).find((m) => m.dex === e.toDex)
      if (!mega) return NOOP(state)
      megaEvolve(s, 'player', a, mega, data, rng, log)
      s.megaUsed = (s.megaUsed ?? 0) + 1
      break
    }
    case 'GMAX': {
      const a = activeBattler(s)
      const form = gmaxChoices(s, data).find((m) => m.dex === e.toDex)
      if (!form) return NOOP(state)
      gigantamax(s, 'player', a, form, data, rng, log)
      s.megaUsed = (s.megaUsed ?? 0) + 1
      break
    }
    case 'CHANGE_FORM': {
      const a = activeBattler(s)
      const form = formChoices(s, data).find((f) => f.dex === e.toDex)
      if (!form) return NOOP(state)
      changeForm(s, 'player', a, form, log)
      a.formChanges = (a.formChanges ?? 0) + 1
      break
    }
    case 'PASS': {
      if (s.phase !== 'player_stunned') return NOOP(state)
      const a = activeBattler(s)
      a.status = consumeStun(a.status)
      tickGmax(s, 'player', data, log)
      if (s.single) endStep(s)
      else if (s.double) {
        if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log)
      } else beginTurn(s, 'enemy', data, log)
      break
    }
    case 'SWITCH': {
      if (s.double) {
        if (!doubleSwitch(s, e.instanceId, data, log)) return NOOP(state)
        break
      }
      const idx = s.player.findIndex((b) => b.uid === e.instanceId)
      const target = s.player[idx]
      if (!target || target.hp <= 0 || idx === s.activeIndex) return NOOP(state)
      const outgoing = activeBattler(s)
      const switchable = s.phase === 'player_switch' || ((s.phase === 'player_roll' || s.phase === 'player_reroll') && data.config.allowVoluntarySwitch)
      // A Gigantamax Pokémon shrinks back when it leaves the field.
      if (switchable && outgoing.gmax) endGmax('player', outgoing, data, log)
      if (s.phase === 'player_switch') {
        s.activeIndex = idx
        if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        log.push({ kind: 'switch', uid: target.uid, free: true })
        copyFoeDice(s, log)
        beginTurn(s, s.nextActor, data, log)
      } else if ((s.phase === 'player_roll' || s.phase === 'player_reroll') && data.config.allowVoluntarySwitch) {
        // Before or after the roll (the UI rolls for you): the dice are dropped and the turn ends.
        s.activeIndex = idx
        if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        log.push({ kind: 'switch', uid: target.uid, free: false })
        copyFoeDice(s, log)
        afterAction(s, 'player', data, log)
      } else return NOOP(state)
      break
    }
    case 'TARGET': {
      if (!s.double || (s.phase !== 'player_roll' && s.phase !== 'player_reroll')) return NOOP(state)
      const i = s.double.foes.findIndex((f) => f.uid === e.uid)
      if (i < 0 || i === s.double.foeIndex || !s.double.foeSlots.includes(i) || s.double.foes[i]!.hp <= 0) return NOOP(state)
      setFront(s, s.activeIndex, i, log)
      // Ditto copies the foe it aims at, while its dice are still in its hand.
      if (s.phase === 'player_roll') copyTarget(s, 'player', log)
      break
    }
    case 'FORFEIT': {
      for (const b of s.player) b.hp = 0
      finish(s, 'lost', log, 'forfeit')
      break
    }
    case 'RUN': {
      if (!s.canRun || (s.phase !== 'player_roll' && s.phase !== 'player_reroll')) return NOOP(state)
      finish(s, 'fled', log)
      break
    }
    case 'AI_TURN': {
      if (s.phase !== 'enemy_turn') return NOOP(state)
      // A double battle: the foe attacks one of yours at random (docs/33), with its own plan if it is the ace.
      if (s.double) aimAtRandom(s, rng, log)
      const en = s.enemy
      const target = activeBattler(s)
      // A trainer's ace Mega Evolves or Gigantamaxes on its first turn; a type changer picks the type best against you.
      const plan = s.enemyPlan
      if (plan && !s.enemyPlanDone && en.hp > 0) {
        const mega = plan.mega ? data.species[plan.mega] : undefined
        const gmax = plan.gmax ? data.species[plan.gmax] : undefined
        if (mega && !en.mega) megaEvolve(s, 'enemy', en, mega, data, rng, log)
        else if (gmax && !en.gmax) gigantamax(s, 'enemy', en, gmax, data, rng, log)
        s.enemyPlanDone = true
        if (s.double) s.double.plansDone = [...(s.double.plansDone ?? []), en.uid]
      }
      if (plan?.formChanges && (en.formChanges ?? 0) < data.config.formChangesPerBattle) {
        const form = foeTypeForm(s, en, target, data, rng)
        if (form) {
          changeForm(s, 'enemy', en, form, log)
          en.formChanges = (en.formChanges ?? 0) + 1
        }
      }
      // A trainer's potion goes down first, once, when the next hit could K.O. — it doesn't cost the turn.
      const heal = en.item ? potionHeal(en.item, data) : 0
      if (
        heal > 0 &&
        shouldUsePotion(
          {
            hp: en.hp,
            maxHp: en.maxHp,
            attackerDice: target.dice,
            attackerTypes: target.types,
            defenderTypes: en.types,
            attackerLevels: s.playerLevels,
          },
          data,
          rng,
        )
      ) {
        const amount = Math.min(heal, en.maxHp - en.hp)
        en.hp += amount
        log.push({ kind: 'item', key: en.item!, targetUid: en.uid, amount, hpAfter: en.hp, side: 'enemy' })
        en.item = null
        checkHpForms(s, data, log)
      }
      s.dice = rollAll(en.dice, data, rng)
      log.push({ kind: 'roll', side: 'enemy', dice: s.dice })
      for (let guard = 0; guard < 20 && en.rerollsLeft > 0; guard++) {
        const mask = aiRerollMask({
          dice: s.dice,
          attackerTypes: en.types,
          defenderTypes: target.types,
          levels: s.enemyLevels,
          data,
          rng,
          targetHp: target.hp,
        })
        if (!mask || !mask.some(Boolean)) break
        s.dice = rerollMasked(s.dice, mask, data, rng)
        en.rerollsLeft -= 1
        log.push({ kind: 'reroll', side: 'enemy', mask, dice: s.dice, rerollsLeft: en.rerollsLeft })
      }
      resolveAttack(s, 'enemy', data, log)
      break
    }
  }
  return { state: s, log }
}

export interface BattleOutcome {
  result: 'won' | 'lost' | 'fled' | 'ongoing'
  /** Remaining HP of every player battler, by instance id. */
  hp: Record<string, number>
  participants: string[]
  /** The Pokémon active at the end — the one that earns XP in 'fighter' mode. */
  fighterUid: string
  /** A double battle: every foe K.O.'d, in order, with yours that were out (docs/33). */
  kos?: DoubleKo[]
}

export function battleOutcome(s: BattleState): BattleOutcome {
  const result = s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled' ? s.phase : 'ongoing'
  return {
    result,
    hp: Object.fromEntries(s.player.map((b) => [b.uid, b.hp])),
    participants: [...s.participants],
    fighterUid: activeBattler(s).uid,
    ...(s.double && { kos: s.double.kos.map((k) => ({ ...k, fighters: [...k.fighters] })) }),
  }
}
