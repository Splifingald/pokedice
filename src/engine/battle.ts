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
import type { CurableStatus, DieType, GameData, PokeType, Species, StatusKind } from './types'

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

export interface Battler {
  uid: string
  dex: number
  name: string
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

export type LogEntry =
  | { kind: 'start'; first: Side }
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
   * above half HP) or `choice` (an Arceus, Silvally or Ogerpon type).
   */
  | {
      kind: 'form'
      side: Side
      uid: string
      fromDex: number
      toDex: number
      reason: 'mega' | 'gmax' | 'lowHp' | 'choice'
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
}

export function makeBattler(seed: BattlerSeed, data: GameData): Battler {
  const species = getSpecies(data, seed.dex)
  const stats = effectiveStats(species, seed.level, data)
  return {
    uid: seed.uid,
    dex: seed.dex,
    name: species.name,
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
function copyFoeDice(s: BattleState, log: LogEntry[]) {
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

export interface CreateBattleOptions {
  kind: BattleKind
  team: BattlerSeed[]
  leadUid?: string
  enemy: { dex: number; level: number; hp?: number; shiny?: boolean; item?: string }
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
}

/** Takes on a form's look and types (the dice are the caller's business). */
function wearForm(b: Battler, form: Species) {
  b.dex = form.dex
  b.name = form.name
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
  for (const [side, b] of [...s.player.map((p) => ['player', p] as const), ['enemy', s.enemy] as const]) {
    // A Mega or Gigantamax Pokémon keeps that look whatever its HP.
    if (b.hp <= 0 || b.mega || b.gmax) continue
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

/** Whether `atk`'s attacks can hurt `def` at all (v1.8: the whole attack takes its best dice type's effectiveness). */
export function canHurt(atk: Battler, def: Battler, data: GameData): boolean {
  const dice = atk.dice.map((type) => ({ type, faceIndex: 0 }))
  return attackMultiplier(attackType(dice, atk.types, def.types, data), def.types, data) > 0
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

/** Turn start: DoT tick (can K.O.), then the stun check (skips the turn), then the actor may act. */
function beginTurn(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  const rules = data.config.status
  for (let guard = 0; guard < 50; guard++) {
    if (s.turn >= data.config.maxBattleTurns || deadlocked(s, data)) {
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
      side = other(side)
      continue
    }
    s.phase = side === 'player' ? 'player_roll' : 'enemy_turn'
    return
  }
}

function afterAction(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  tickGmax(s, side, data, log)
  if (checkKnockouts(s, log)) {
    if (s.phase === 'player_switch') s.nextActor = other(side)
    return
  }
  beginTurn(s, other(side), data, log)
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
  const terminal = state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled'
  if (terminal) return NOOP(state)
  const s = structuredClone(state)
  const log: LogEntry[] = []

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
      // Only a revive works on a K.O.'d Pokémon (a benched one: the active can't be K.O. on your turn), and only on one.
      if ((fx.kind === 'revive') !== target.hp <= 0) return NOOP(state)
      if (fx.kind === 'revive') {
        target.hp = reviveHp(fx.percent, target.maxHp)
        target.status = emptyStatus()
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: target.hp, hpAfter: target.hp, revived: true })
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
      beginTurn(s, 'enemy', data, log)
      break
    }
    case 'SWITCH': {
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
}

export function battleOutcome(s: BattleState): BattleOutcome {
  const result = s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled' ? s.phase : 'ongoing'
  return {
    result,
    hp: Object.fromEntries(s.player.map((b) => [b.uid, b.hp])),
    participants: [...s.participants],
    fighterUid: activeBattler(s).uid,
  }
}
