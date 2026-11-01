// Sentences the game builds from data rather than reads off a single row: an item's one-line effect,
// the Multi EXP share, a secret area's unlock condition. They live here, not in the engine, because
// the engine also runs under `tsx` in the seed and sim scripts, where the CSV import has no loader.
import type { ZEffect } from '@/engine/battle'
import type { GameData, ItemDef, PokeType, UnlockCondition } from '@/engine/types'
import { hasKey, joinList, t } from '.'
import { pokemonKey } from './names'

/** One-line effect for menus: "+20 HP", "Cures paralysis", "+1 reroll", "+2 to the catch die". */
export function effectText(item: ItemDef): string {
  const e = item.effect
  switch (e.kind) {
    case 'heal':
      return t('ui.effect.heal', { amount: e.amount })
    case 'revive':
      return e.percent >= 100 ? t('ui.effect.reviveFull') : t('ui.effect.revivePercent', { percent: e.percent })
    case 'cure':
      return t('ui.effect.cure', { statuses: joinList(e.statuses.map((s) => t(`ui.status.${s}.noun`))) })
    case 'rerolls':
      return t(`ui.effect.rerolls.${e.amount === 1 ? 'one' : 'other'}`, { amount: e.amount })
    case 'level':
      return t(`ui.effect.levels.${e.amount === 1 ? 'one' : 'other'}`, { amount: e.amount })
    case 'stone':
      return t('ui.effect.stone')
    case 'fossil':
      return t('ui.effect.fossil', { hours: e.hours })
    case 'ball':
      return e.bonus >= 9 ? t('ui.effect.ballAlways') : t('ui.effect.ball', { bonus: e.bonus })
    case 'link':
      return t('ui.effect.link')
    case 'talent':
      return t('ui.effect.talent')
    case 'bait':
      return t('ui.effect.bait', { faces: joinList(e.faces.map(String)) })
    case 'megaGem':
      return t('ui.effect.megaGem', { mega: hasKey(pokemonKey(e.mega)) ? t(pokemonKey(e.mega)) : `#${e.mega}` })
  }
}

/**
 * What a Z-Move of this type adds (docs/35), with the config's numbers: "Electric: 50% chance to paralyze the foe".
 * `typeLabel` is the type's name in the player's language; an untyped attack (base dice only) says "Z-Move".
 */
export function zMoveText(effect: ZEffect, typeLabel: string | null, data: GameData): string {
  const c = data.config.zMove
  const type = typeLabel ?? t('ui.battle.zMoveName')
  switch (effect) {
    case 'freeze':
      return t('ui.zmove.freeze', { type, pct: c.freezeChance })
    case 'paralyze':
      return t('ui.zmove.paralyze', { type, pct: c.paralyzeChance })
    case 'burn':
      return t('ui.zmove.burn', { type, n: c.burnStacks })
    case 'heal':
      return t('ui.zmove.heal', { type, pct: c.healPercent })
    case 'confuse':
      return t('ui.zmove.confuse', { type })
    case 'poison':
      return t('ui.zmove.poison', { type })
    case 'fly':
    case 'dig':
    case 'dive':
      return t(`ui.zmove.${effect}`, { type })
    case 'reckless':
      return t('ui.zmove.reckless', { type, pct: c.recklessPercent, back: c.recklessRecoilPercent })
    case 'cleanse':
      return t('ui.zmove.cleanse', { type })
    case 'power':
      return t('ui.zmove.power', { type, pct: c.damagePercent })
  }
}

/** The types whose Z-Move adds an effect of its own (the rest hit harder), in the rules' order. */
export const Z_TYPES: PokeType[] = ['ice', 'electric', 'fire', 'grass', 'psychic', 'poison', 'flying', 'ground', 'water', 'fighting', 'steel']

const pct = (x: number) => `${Math.round(x * 100)} %`

/** What a team member who sat the fight out takes home. */
export function multiExpText(data: GameData): string {
  const c = data.config
  const cap = Math.max(0, Math.min(1, c.multiExpMaxShare))
  if (c.multiExpGapBonus <= 0 || cap <= c.multiExpShare) return t('ui.multiExp.flat', { share: pct(c.multiExpShare) })
  return t('ui.multiExp.gap', { share: pct(c.multiExpShare), bonus: pct(c.multiExpGapBonus), cap: pct(cap) })
}

/** What a secret area is still waiting for. */
export function conditionLabel(cond: UnlockCondition, data: GameData): string {
  if (cond.kind === 'area' || cond.kind === 'cleared')
    return t(cond.kind === 'area' ? 'ui.unlock.area' : 'ui.unlock.cleared', {
      area: data.areas.find((a) => a.id === cond.areaId)?.name ?? t('ui.unlock.unknownArea'),
    })
  if (cond.kind === 'pokedex') return t('ui.unlock.pokedex', { count: cond.count })
  if (cond.kind === 'caught')
    return t('ui.unlock.caught', {
      names: joinList([...new Set(cond.dex)].map((d) => data.species[d]?.name ?? `#${d}`)),
    })
  return t('ui.unlock.maxLevel', { level: cond.level })
}

/** An Egg group as Showdown names it ("Water 1", "Human-Like"), in the player's language. */
export function eggGroupName(group: string): string {
  const key = `ui.eggGroup.${group.toLowerCase().replace(/[^a-z0-9]/g, '')}`
  return hasKey(key) ? t(key) : group
}

/** A wait, as the Day Care counts it down: "45 min", "7 h 14". */
export function waitText(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000))
  return m >= 60
    ? t('ui.dayCare.hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })
    : t('ui.dayCare.minutes', { n: m })
}
