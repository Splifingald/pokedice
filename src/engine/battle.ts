// The battle reducer. The UI dispatches events and renders the returned log — it never recomputes rules.
import { aiRerollMask } from './ai'
import { getSpecies } from './data'
import { attackMultiplier, attackType, computeDamage, type DamageResult, type UpgradeLevels } from './damage'
import { rerollMasked, rollAll, type RolledDie } from './dice'
import { reviveHp } from './economy'
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
import type { CurableStatus, DieType, GameData, PokeType, StatusKind } from './types'

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
  }
  const log: LogEntry[] = [{ kind: 'start', first }]
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
      break
    }
    case 'PASS': {
      if (s.phase !== 'player_stunned') return NOOP(state)
      const a = activeBattler(s)
      a.status = consumeStun(a.status)
      beginTurn(s, 'enemy', data, log)
      break
    }
    case 'SWITCH': {
      const idx = s.player.findIndex((b) => b.uid === e.instanceId)
      const target = s.player[idx]
      if (!target || target.hp <= 0 || idx === s.activeIndex) return NOOP(state)
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
