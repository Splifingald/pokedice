import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  comboBonusAt,
  dieBonusAt,
  generalCfg,
  generalLevel,
  generalMax,
  charmChanceAt,
  generalOn,
  generalShown,
  luckAt,
  maxComboLevel,
  maxDieLevel,
  nextComboCost,
  nextDieCost,
  nextGeneralCost,
  offlineAt,
  POKE_TYPES,
  type ComboKey,
  type GeneralId,
  type PokeType,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { FaceDice, facesStatuses, StatusLines } from '@/components/FaceDice'
import { PixelIcon } from '@/components/icons'
import { PageHead, Wallet } from '@/components/PageHead'
import { Seg } from '@/components/Segmented'
import { COMBO_EXAMPLES, comboExampleText, comboName, money, oneInText, typeName } from '@/lib/format'
import { dieCarriers, maxDiceOwned } from '@/lib/upgrades'
import { useT } from '@/i18n/react'
import { GeneralRulesModal } from '@/components/GeneralRules'
import { InfoButton } from '@/components/RulesModal'
import { TrainerName } from '@/components/TrainerName'
import { markGeneralRulesSeen, upgradeCombo, upgradeDie, upgradeGeneral } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { useInWorld } from '@/screens/events/world'
import { cx } from '@/theme/util'

/** One upgrade, whatever its kind: the card reads only this. */
export interface Up {
  id: string
  kind: 'combo' | 'die' | 'general'
  name: string
  level: number
  max: number
  bonus: number
  next: number | null
  /** A General upgrade's own words for what it does now and at the next level (null at the top). */
  now?: string
  then?: string | null
  cost: number | null
  /** Why nobody you own would benefit yet. */
  locked: string | null
  visual: ReactNode
  /** Under the name: what a die is (dice only). */
  desc?: string
  /** The die's six faces and what its status faces do (dice only). */
  faces?: ReactNode
  buy: () => boolean
}

/** The combo as a roll of little base dice. */
function ComboExample({ k }: { k: ComboKey }) {
  const { t } = useT()
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      role="img"
      aria-label={t('ui.upgrades.example', { roll: comboExampleText(k) })}
    >
      {COMBO_EXAMPLES[k].flat().map((v, i) => (
        <Die key={i} type="base" face={{ kind: 'number', value: v }} size={22} />
      ))}
    </span>
  )
}

/** The level track: one pip per level, gold up to the current one. */
function Pips({ level, max }: { level: number; max: number }) {
  const { t } = useT()
  return (
    <span
      className="flex flex-1 gap-[2px]"
      role="img"
      aria-label={t('ui.upgrades.trackLevel', { level, max })}
    >
      {Array.from({ length: max }, (_, i) => (
        <i
          key={i}
          className={cx(
            'h-2.5 flex-1',
            i < level ? 'bg-gold shadow-ring-thin' : 'bg-well-deep shadow-ring-line-thin',
          )}
        />
      ))}
    </span>
  )
}

export function UpCard({ u, gold }: { u: Up; gold: number }) {
  const { t } = useT()
  const can = !u.locked && u.cost != null && u.cost <= gold
  const bonus = (n: number) =>
    t(u.kind === 'combo' ? 'ui.upgrades.comboBonus' : 'ui.upgrades.dieBonus', { n })
  const now = u.now ?? bonus(u.bonus)
  const then = u.then !== undefined ? u.then : u.next != null ? `+${u.next}` : null
  const buy = () => {
    if (u.cost == null || u.locked) return
    if (!can) return pushToast(t('ui.upgrades.short', { amount: money(u.cost - gold) }), 'info')
    if (!u.buy()) return
    sfx('levelup')
    pushToast(
      t('ui.upgrades.bought', { name: u.name, level: u.level + 1, bonus: u.then ?? bonus(u.next ?? u.bonus) }),
      'good',
    )
  }
  return (
    <li
      className={cx(
        'grid gap-1.5 px-2.5 pb-2.5 pt-2',
        u.locked
          ? 'bg-well text-muted shadow-ring-line'
          : can
            ? 'bg-cream shadow-card-warm'
            : 'bg-paper shadow-card',
      )}
    >
      <div className="flex min-h-[30px] items-center gap-2">
        <span className="grid min-w-0 flex-1 leading-[1.05]">
          <b className="text-[20px] font-normal leading-none">{u.name}</b>
          {u.desc && <small className="font-pixel-sm text-[14px] text-muted">{u.desc}</small>}
        </span>
        {u.visual}
      </div>
      {u.faces}
      <div className="flex items-center gap-2">
        <Pips level={u.level} max={u.max} />
        <span className="font-pixel-sm text-[15px] text-muted">
          {t('ui.common.level.short', { n: u.level })}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[18px]">
          {now}
          {then != null && (
            <>
              {' '}
              <span className="text-muted" aria-hidden>
                →
              </span>
              <span className="sr-only">{t('ui.upgrades.then')}</span>{' '}
              <em className="not-italic text-good">{then}</em>
            </>
          )}
        </span>
        {u.locked ? (
          <span className="inline-flex min-h-[46px] min-w-[96px] items-center justify-center gap-1.5 bg-well-deep px-2.5 font-pixel-sm text-[15px] text-ink">
            <PixelIcon name="lock" size={16} />
            {t('ui.upgrades.lockedWord')}
          </span>
        ) : u.cost == null ? (
          <span className="inline-flex min-h-[46px] min-w-[96px] items-center justify-center bg-gold text-[18px] text-ink shadow-ring">
            {t('ui.upgrades.max')}
          </span>
        ) : (
          <button
            type="button"
            onClick={buy}
            aria-disabled={!can || undefined}
            className={cx(
              'grid min-h-[46px] min-w-[96px] place-items-center px-2.5 pb-2 pt-1 leading-none',
              can ? 'pixel-btn frame-deep text-white' : 'bg-well-deep text-ink shadow-ring-line',
            )}
          >
            <b className="text-[20px] font-normal">{money(u.cost)}</b>
            <small className="font-pixel-sm text-[13px]">
              {can ? t('ui.upgrades.upgrade') : t('ui.upgrades.needShort', { amount: money(u.cost - gold) })}
            </small>
          </button>
        )}
      </div>
      {u.locked && <p className="font-pixel-sm text-[14px] text-muted">{u.locked}</p>}
    </li>
  )
}

type Tab = 'combos' | 'dice' | 'general'

export function UpgradesScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [params] = useSearchParams()
  const inside = useInWorld().inside
  // The General tab is the admin's to switch on (docs/15 §20); its pop-up's Let's go! opens it (`?tab=general`). Its
  // levels hold in every region, so a small world, whose ₽ are its own, has its combos and dice only (docs/26).
  const generalOpen = generalOn(data) && !inside
  const [picked, setTab] = useState<Tab>(params.get('tab') === 'general' ? 'general' : 'combos')
  const tab: Tab = picked === 'general' && !generalOpen ? 'combos' : picked
  const [affordOnly, setAffordOnly] = useState(false)
  const [rules, setRules] = useState(false)
  // Opening the tab counts as having seen its rules.
  useEffect(() => {
    if (tab === 'general' && !inside) markGeneralRulesSeen()
  }, [tab, inside])
  if (!save) return null

  const maxDice = maxDiceOwned(save, data)
  const carriers = dieCarriers(save, data)
  const combos: Up[] = COMBO_KEYS.map((k) => {
    const lv = save.comboLevels[k] ?? 1
    const cost = nextComboCost(k, lv, data)
    return {
      id: k,
      kind: 'combo',
      name: comboName(k),
      level: lv,
      max: maxComboLevel(k, data),
      bonus: comboBonusAt(k, lv, data),
      next: cost == null ? null : comboBonusAt(k, lv + 1, data),
      cost,
      locked:
        maxDice < COMBO_MIN_DICE[k]
          ? t('ui.upgrades.needsDice', { need: COMBO_MIN_DICE[k], have: maxDice })
          : null,
      visual: <ComboExample k={k} />,
      buy: () => upgradeCombo(k),
    }
  })
  const dice: Up[] = [...POKE_TYPES]
    .sort((a, b) => carriers[b] - carriers[a] || typeName(a).localeCompare(typeName(b)))
    .map((type: PokeType) => {
      const lv = save.dieLevels[type] ?? 1
      const cost = nextDieCost(type, lv, data)
      const faces = data.diceTypes[type]?.faces ?? []
      const n = carriers[type]
      return {
        id: type,
        kind: 'die',
        name: t('ui.upgrades.dieName', { type: typeName(type) }),
        desc: data.diceTypes[type]?.description ?? undefined,
        level: lv,
        max: maxDieLevel(type, data),
        bonus: dieBonusAt(type, lv, data),
        next: cost == null ? null : dieBonusAt(type, lv + 1, data),
        cost,
        locked: n ? null : t('ui.upgrades.noCarrier'),
        visual: n ? (
          <small className="font-pixel-sm text-[14px] text-muted">
            {t(`ui.upgrades.onMons.${n === 1 ? 'one' : 'other'}`, { n })}
          </small>
        ) : null,
        faces: (
          <>
            <FaceDice type={type} faces={faces} size={36} />
            <StatusLines statuses={facesStatuses(faces)} />
          </>
        ),
        buy: () => upgradeDie(type),
      }
    })
  // The General upgrades (docs/25): every region's, bought with this region's ₽.
  const cfg = generalCfg(data)
  const pct = (n: number) => t('ui.general.luck.pct', { n: Math.round(n * 100) })
  const rate = (n: number) => t('ui.general.offline.rate', { amount: money(n) })
  const oneIn = (chance: number) =>
    chance > 0 ? t('ui.general.charm.odds', { n: oneInText(chance) }) : t('ui.general.none')
  const general: Up[] = generalOpen
    ? generalShown(data).map((id: GeneralId) => {
        const lv = generalLevel(save, id, data)
        const max = generalMax(data, id)
        const top = lv >= max
        const value = (l: number) =>
          id === 'luck'
            ? l > 0
              ? pct(luckAt(data, l))
              : t('ui.general.none')
            : id === 'offline'
              ? l > 0
                ? rate(offlineAt(data, l))
                : t('ui.general.none')
              : id === 'charm'
                ? oneIn(charmChanceAt(data, l))
                : t(l > 0 ? 'ui.general.rich.on' : 'ui.general.rich.off')
        return {
          id,
          kind: 'general' as const,
          name: t(`ui.general.${id}.name`),
          desc: t(`ui.general.${id}.desc`, { hours: cfg.offlineMaxHours }),
          level: lv,
          max,
          bonus: 0,
          next: null,
          now: value(lv),
          then: top ? null : value(lv + 1),
          cost: nextGeneralCost(save, data, id),
          locked: null,
          // "I am just rich" shows what it does: your own name, golden.
          visual:
            id === 'rich' ? (
              <TrainerName
                name={save.player?.name || t('ui.settings.noName')}
                rich
                className="max-w-[45%] truncate text-[20px] leading-none"
              />
            ) : (
              <PixelIcon name={id === 'luck' ? 'ball' : id === 'charm' ? 'sparkle' : 'moon'} size={24} />
            ),
          buy: () => upgradeGeneral(id),
        }
      })
    : []
  const affordable = (u: Up) => !u.locked && u.cost != null && u.cost <= save.gold
  const lists = { combos, dice, general }
  const shown = lists[tab].filter((u) => !affordOnly || affordable(u))
  const open = shown.filter((u) => !u.locked)
  const locked = shown.filter((u) => u.locked)
  const canCount = [...combos, ...dice, ...general].filter(affordable).length
  const tabCount = (l: Up[]) => l.filter(affordable).length || undefined

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHead icon="navUpgrades" title={t('ui.upgrades.title')}>
        <Wallet />
      </PageHead>
      <Seg
        tabs
        idPrefix="up"
        label={t('ui.upgrades.title')}
        value={tab}
        onChange={setTab}
        className="w-full"
        options={[
          { id: 'combos', label: t('ui.upgrades.tabCombos'), count: tabCount(combos) },
          { id: 'dice', label: t('ui.upgrades.tabDice'), count: tabCount(dice) },
          ...(generalOpen ? [{ id: 'general' as const, label: t('ui.upgrades.tabGeneral'), count: tabCount(general) }] : []),
        ]}
      />
      <div role="tabpanel" aria-labelledby={`up-${tab}`} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-[1_1_180px] font-pixel-sm text-[15px] leading-tight text-muted">
            {t(tab === 'combos' ? 'ui.upgrades.noteCombos' : tab === 'dice' ? 'ui.upgrades.noteDice' : 'ui.upgrades.noteGeneral')}
          </p>
          <button
            type="button"
            aria-pressed={affordOnly}
            onClick={() => setAffordOnly((v) => !v)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap px-2.5 text-[17px] md:min-h-[38px]',
              affordOnly ? 'bg-ink text-panel' : 'bg-paper shadow-ring-line',
            )}
          >
            {t('ui.upgrades.affordable')}
            <i
              className={cx(
                'font-pixel-sm text-[14px] not-italic',
                affordOnly ? 'text-gold-light' : 'text-muted',
              )}
            >
              {canCount}
            </i>
          </button>
        </div>
        <ul className="grid gap-2">
          {open.map((u) => (
            <UpCard key={u.id} u={u} gold={save.gold} />
          ))}
          {open.length === 0 && <li className="copy text-muted">{t('ui.upgrades.noneAffordable')}</li>}
        </ul>
        {locked.length > 0 && (
          <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-pixel-sm text-[16px] text-muted">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
                ▶
              </span>
              {t(`ui.upgrades.lockedCount.${locked.length === 1 ? 'one' : 'other'}`, { n: locked.length })}
            </summary>
            <ul className="grid gap-2">
              {locked.map((u) => (
                <UpCard key={u.id} u={u} gold={save.gold} />
              ))}
            </ul>
          </details>
        )}
        {tab === 'general' && (
          <>
            <InfoButton name={t('ui.upgrades.tabGeneral')} onClick={() => setRules(true)} className="mt-1" />
            <GeneralRulesModal open={rules} onClose={() => setRules(false)} />
          </>
        )}
      </div>
    </div>
  )
}
