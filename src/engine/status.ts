import { dieUpgradeBonus, type UpgradeLevels } from './damage'
import { faceOf, statusCounts, type RolledDie } from './dice'
import type { CurableStatus, GameData, StatusKind, StatusRules } from './types'

export interface StatusState {
  burn: { stacks: number; turns: number } | null
  poison: { turns: number } | null
  /** Remaining stunned turns. */
  frozen: number
  paralyze: number
  /**
   * How confused (0 = not): the Confuse faces that landed, 1 to `confuse.maxFaces`. The next attack costs that many
   * times `confuse.recoilPercentPerFace` % of max HP. A battle saved before levels holds `true`: read it with
   * `confusionLevel`.
   */
  confused: number
}

export const emptyStatus = (): StatusState => ({
  burn: null,
  poison: null,
  frozen: 0,
  paralyze: 0,
  confused: 0,
})

/** How confused a Pokémon is, 0 when not (a battle resumed from before the levels may hold `true`: level 1). */
export const confusionLevel = (s: StatusState): number => {
  const c = s.confused as number | boolean
  return c === true ? 1 : typeof c === 'number' && c > 0 ? Math.floor(c) : 0
}

export interface StatusApplication {
  status: StatusKind
  /** burn: stacks added this roll */
  stacks?: number
  turns?: number
  /** heal: HP the attacker restores */
  amount?: number
  /** confuse: how confused the foe gets (its Confuse faces, capped) */
  level?: number
  /** frozen, paralyze: the chance it lands, 0–1 (1 = sure) */
  chance?: number
}

/** Freeze and Paralysis: each face adds 1 / `sureAt` to the chance, so `sureAt` faces make it sure. */
const stunChance = (faces: number, sureAt: number) => Math.min(1, faces / Math.max(1, sureAt))

/**
 * What a roll's status faces do — a single face is enough for each: Burn stacks per face, Poison lands, Freeze and
 * Paralysis each have a chance per face (sure from `sureAt` faces), Confusion grows with its faces, and Heal faces
 * heal their own value plus their die's upgrade. `levels`: the attacker's, for that upgrade.
 */
export function statusesFromRoll(dice: readonly RolledDie[], data: GameData, levels?: UpgradeLevels): StatusApplication[] {
  const r = data.config.status
  const c = statusCounts(dice, data)
  const out: StatusApplication[] = []
  if (c.burn >= r.burn.threshold && c.burn > 0) out.push({ status: 'burn', stacks: c.burn, turns: r.burn.duration })
  if (c.poison > 0) out.push({ status: 'poison', turns: r.poison.duration })
  if (c.frozen > 0)
    out.push({ status: 'frozen', turns: r.frozen.stunTurns, chance: stunChance(c.frozen, r.frozen.sureAt) })
  if (c.paralyze > 0)
    out.push({ status: 'paralyze', turns: r.paralyze.stunTurns, chance: stunChance(c.paralyze, r.paralyze.sureAt) })
  if (c.confuse > 0) out.push({ status: 'confuse', level: Math.min(c.confuse, Math.max(1, r.confuse.maxFaces)) })
  if (c.heal > 0) {
    const amount = dice.reduce((sum, d) => {
      const f = faceOf(d, data)
      if (f.kind !== 'status' || f.status !== 'heal') return sum
      return sum + f.value + (levels ? dieUpgradeBonus(d.type, levels, data) : 0)
    }, 0)
    out.push({ status: 'heal', amount })
  }
  return out
}

/** Status faces in this roll — the AI always keeps these, as each one already does something. */
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
        // The stronger confusion holds: a lighter one never eases it.
        s.confused = Math.max(confusionLevel(s), a.level ?? 1)
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
  return !!(s.burn || s.poison || s.frozen || s.paralyze || confusionLevel(s))
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
      return confusionLevel(s) > 0
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
    else out.confused = 0
  }
  return out
}
