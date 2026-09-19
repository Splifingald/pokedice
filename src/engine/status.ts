import { dieValue, faceOf, statusCounts, type RolledDie } from './dice'
import type { CurableStatus, GameData, StatusKind, StatusRules } from './types'

export interface StatusState {
  burn: { stacks: number; turns: number } | null
  poison: { turns: number } | null
  /** Remaining stunned turns. */
  frozen: number
  paralyze: number
  /** The next attack hits the attacker itself. */
  confused: boolean
}

export const emptyStatus = (): StatusState => ({
  burn: null,
  poison: null,
  frozen: 0,
  paralyze: 0,
  confused: false,
})

export interface StatusApplication {
  status: StatusKind
  /** burn: stacks added this roll */
  stacks?: number
  turns?: number
  /** heal: HP the attacker restores */
  amount?: number
}

/** Which statuses a roll triggers — Burn from 1 face (stacking), the rest only once their threshold is met. */
export function statusesFromRoll(dice: readonly RolledDie[], data: GameData): StatusApplication[] {
  const r = data.config.status
  const c = statusCounts(dice, data)
  const out: StatusApplication[] = []
  if (c.burn >= r.burn.threshold && c.burn > 0) out.push({ status: 'burn', stacks: c.burn, turns: r.burn.duration })
  if (c.poison >= r.poison.threshold && c.poison > 0) out.push({ status: 'poison', turns: r.poison.duration })
  if (c.frozen >= r.frozen.threshold && c.frozen > 0) out.push({ status: 'frozen', turns: r.frozen.stunTurns })
  if (c.paralyze >= r.paralyze.threshold && c.paralyze > 0)
    out.push({ status: 'paralyze', turns: r.paralyze.stunTurns })
  if (c.confuse >= r.confuse.threshold && c.confuse > 0) out.push({ status: 'confuse' })
  if (c.heal >= r.heal.threshold && c.heal > 0) {
    const amount =
      r.heal.amount === 'healFaces'
        ? dice.reduce((sum, d) => {
            const f = faceOf(d, data)
            return sum + (f.kind === 'status' && f.status === 'heal' ? f.value : 0)
          }, 0)
        : dice.reduce((sum, d) => sum + dieValue(d, data), 0) // the total value of the dice rolled
    out.push({ status: 'heal', amount })
  }
  return out
}

/** Status faces whose threshold is met in this roll — the AI always keeps these. */
export function satisfiedStatusMask(dice: readonly RolledDie[], data: GameData): boolean[] {
  const triggered = new Set(statusesFromRoll(dice, data).map((a) => a.status))
  return dice.map((d) => {
    const f = data.diceTypes[d.type]?.faces[d.faceIndex]
    return !!f && f.kind === 'status' && triggered.has(f.status)
  })
}

export function applyStatuses(state: StatusState, apps: readonly StatusApplication[], rules: StatusRules): StatusState {
  const s: StatusState = { ...state, burn: state.burn && { ...state.burn }, poison: state.poison && { ...state.poison } }
  for (const a of apps) {
    switch (a.status) {
      case 'burn':
        // Stacks; duration refreshes.
        s.burn = { stacks: (s.burn?.stacks ?? 0) + (a.stacks ?? 1), turns: rules.burn.duration }
        break
      case 'poison':
        // Does not stack; re-applying only refreshes.
        s.poison = { turns: rules.poison.duration }
        break
      case 'frozen':
        s.frozen = rules.frozen.stunTurns
        break
      case 'paralyze':
        s.paralyze = rules.paralyze.stunTurns
        break
      case 'confuse':
        s.confused = true
        break
      case 'heal':
        break // a self-effect, resolved by the battle on the attacker
    }
  }
  return s
}

export interface DotTick {
  status: 'burn' | 'poison'
  amount: number
}

/** A share of max HP, at least 1 (0 only when the share is 0). */
const hpShare = (maxHp: number, percent: number) => (percent > 0 ? Math.max(1, Math.round((maxHp * percent) / 100)) : 0)

/** Damage-over-time at the start of the victim's turn, as a share of its max HP (Burn: per stack). */
export function tickDot(state: StatusState, rules: StatusRules, maxHp: number): { state: StatusState; ticks: DotTick[] } {
  const s: StatusState = { ...state }
  const ticks: DotTick[] = []
  if (state.burn) {
    ticks.push({ status: 'burn', amount: hpShare(maxHp, state.burn.stacks * rules.burn.percentPerStack) })
    const turns = state.burn.turns - 1
    s.burn = turns > 0 ? { stacks: state.burn.stacks, turns } : null
  }
  if (state.poison) {
    ticks.push({ status: 'poison', amount: hpShare(maxHp, rules.poison.percent) })
    const turns = state.poison.turns - 1
    s.poison = turns > 0 ? { turns } : null
  }
  return { state: s, ticks }
}

export function stunKind(state: StatusState): 'frozen' | 'paralyze' | null {
  if (state.frozen > 0) return 'frozen'
  if (state.paralyze > 0) return 'paralyze'
  return null
}

/** A skipped turn burns down the stun counters. Confusion is untouched. */
export function consumeStun(state: StatusState): StatusState {
  return { ...state, frozen: Math.max(0, state.frozen - 1), paralyze: Math.max(0, state.paralyze - 1) }
}

export function hasAnyStatus(s: StatusState): boolean {
  return !!(s.burn || s.poison || s.frozen || s.paralyze || s.confused)
}

export function hasStatus(s: StatusState, k: CurableStatus): boolean {
  switch (k) {
    case 'burn':
      return !!s.burn
    case 'poison':
      return !!s.poison
    case 'frozen':
      return s.frozen > 0
    case 'paralyze':
      return s.paralyze > 0
    case 'confuse':
      return s.confused
  }
}

/** Status heals (Antidote, Burn Heal, Ice Heal, Paralyze Heal…). */
export function clearStatuses(s: StatusState, kinds: readonly CurableStatus[]): StatusState {
  const out: StatusState = { ...s }
  for (const k of kinds) {
    if (k === 'burn') out.burn = null
    else if (k === 'poison') out.poison = null
    else if (k === 'frozen') out.frozen = 0
    else if (k === 'paralyze') out.paralyze = 0
    else out.confused = false
  }
  return out
}
