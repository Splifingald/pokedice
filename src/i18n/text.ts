// Sentences the game builds from data rather than reads off a single row: an item's one-line effect,
// the Multi EXP share, a secret area's unlock condition. They live here, not in the engine, because
// the engine also runs under `tsx` in the seed and sim scripts, where the CSV import has no loader.
import type { GameData, ItemDef, UnlockCondition } from '@/engine/types'
import { t } from '.'

/** One-line effect for menus: "+20 HP", "Cures paralysis", "+1 reroll", "+2 to the catch die". */
export function effectText(item: ItemDef): string {
  const e = item.effect
  switch (e.kind) {
    case 'heal':
      return t('ui.effect.heal', { amount: e.amount })
    case 'revive':
      return e.percent >= 100 ? t('ui.effect.reviveFull') : t('ui.effect.revivePercent', { percent: e.percent })
    case 'cure':
      return t('ui.effect.cure', { statuses: e.statuses.map((s) => t(`ui.status.${s}.noun`)).join(', ') })
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
  }
}

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
  if (cond.kind === 'area')
    return t('ui.unlock.area', { area: data.areas.find((a) => a.id === cond.areaId)?.name ?? t('ui.unlock.unknownArea') })
  if (cond.kind === 'pokedex') return t('ui.unlock.pokedex', { count: cond.count })
  return t('ui.unlock.maxLevel', { level: cond.level })
}
