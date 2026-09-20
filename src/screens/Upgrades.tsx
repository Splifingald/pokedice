import { useId, useMemo, useState } from 'react'
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  comboBonusAt,
  dieBonusAt,
  instanceStats,
  maxComboLevel,
  maxDieLevel,
  nextComboCost,
  nextDieCost,
  POKE_TYPES,
  type ComboKey,
  type PokeType,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die, DieFaces } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { COMBO_EXAMPLES, comboExampleText, comboName, money, statusEffects } from '@/lib/format'
import { useT } from '@/i18n/react'
import { upgradeCombo, upgradeDie } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The combo shown as a roll of mini dice, groups spaced apart. */
function ComboExample({ k }: { k: ComboKey }) {
  const { t } = useT()
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1"
      role="img"
      aria-label={t('ui.upgrades.example', { roll: comboExampleText(k) })}
    >
      {COMBO_EXAMPLES[k].map((group, gi) => (
        <span key={gi} className="flex gap-1" aria-hidden>
          {group.map((v, i) => (
            <Die key={i} type="base" face={{ kind: 'number', value: v }} size={26} />
          ))}
        </span>
      ))}
    </div>
  )
}

/** What a die's status faces do, with the live rules — only for dice that have one. */
function DieEffects({ type }: { type: PokeType }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const statuses = new Set(
    (data.diceTypes[type]?.faces ?? []).flatMap((f) => (f.kind === 'status' ? [f.status] : [])),
  )
  const effects = statusEffects(data.config.status).filter((e) => statuses.has(e.status))
  if (!effects.length) return null
  return (
    <ul className="copy w-full text-base">
      {effects.map((e) => (
        <li key={e.status} className="flex items-start gap-1.5">
          <PixelIcon name={e.icon} size={16} className="mt-1" />
          <span>
            <b>{e.name}</b> — {t('ui.upgrades.statusLine', { when: e.when, what: e.what })}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The track as a segmented bar, like the area gauge. */
function Pips({ level, max }: { level: number; max: number }) {
  const { t } = useT()
  return (
    <div
      className="flex h-4 w-full gap-[2px] border-2 border-ink bg-ink p-[1px]"
      role="img"
      aria-label={t('ui.upgrades.trackLevel', { level, max })}
      style={{ borderRadius: 2 }}
    >
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx('flex-1', i < level ? 'bg-gold' : 'bg-[#3e3552]')} />
      ))}
    </div>
  )
}

/**
 * One upgrade: its name and dice on the first line, what its faces do (when they do anything), the track full width,
 * the level and bonus under it, and the buy button.
 */
function Row({
  title,
  dice,
  effect,
  level,
  max,
  bonus,
  nextBonus,
  cost,
  gold,
  onBuy,
  locked,
}: {
  title: React.ReactNode
  /** The example roll (combos) or the die's faces — top right. */
  dice?: React.ReactNode
  effect?: React.ReactNode
  level: number
  max: number
  bonus: number
  nextBonus: number | null
  cost: number | null
  gold: number
  onBuy: () => void
  /** Why no Pokémon you own would benefit yet — the row is greyed out and can't be bought. */
  locked?: string | null
}) {
  const { t } = useT()
  const short = !locked && cost != null && gold < cost
  const reasonId = useId()
  return (
    <div className={cx('pixel-panel flex flex-col gap-1.5 p-2', locked && 'hatched')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="text-2xl leading-none">{title}</div>
        {dice}
      </div>
      {effect}
      {locked && (
        <div className="flex items-center gap-1.5 text-lg leading-tight">
          <PixelIcon name="lock" size={14} /> {locked}
        </div>
      )}
      <Pips level={level} max={max} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-lg leading-none">
        <span>
          {t('ui.common.level.short', { n: level })}
          <span className="text-muted">/{max}</span>
        </span>
        <span>
          +{bonus}
          {nextBonus != null && <span className="text-good"> → +{nextBonus}</span>}
        </span>
      </div>
      <PixelButton
        variant="primary"
        disabled={!!locked || cost == null || short}
        className="w-full"
        onClick={onBuy}
        aria-describedby={short ? `${reasonId}` : undefined}
      >
        {locked ? t('ui.upgrades.locked') : cost == null ? t('ui.upgrades.max') : t('ui.upgrades.buy', { price: money(cost) })}
      </PixelButton>
      {short && (
        <span id={reasonId} className="text-center text-base leading-none text-muted">
          {t('ui.upgrades.short', { amount: money(cost - gold) })}
        </span>
      )}
    </div>
  )
}

export function UpgradesScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [tab, setTab] = useState<'combos' | 'dice'>('combos')

  const carriers = useMemo(() => {
    const out = {} as Record<PokeType, number>
    for (const t of POKE_TYPES) out[t] = 0
    if (!save) return out
    for (const inst of save.box) {
      const types = new Set(instanceStats(inst, data).dice)
      for (const t of types) if (t !== 'base') out[t] += 1
    }
    return out
  }, [save, data])
  // The most dice any Pokémon you own throws: a combo needing more can't happen yet.
  const maxDice = useMemo(() => Math.max(0, ...(save?.box ?? []).map((p) => instanceStats(p, data).dice.length)), [save, data])

  if (!save) return null
  const buyAnd = (ok: boolean) => ok && sfx('levelup')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-5xl">{t('ui.upgrades.title')}</h1>
      <div className="flex gap-2" role="tablist">
        {(['combos', 'dice'] as const).map((id) => (
          <PixelButton
            key={id}
            role="tab"
            aria-selected={tab === id}
            variant={tab === id ? 'primary' : 'secondary'}
            onClick={() => setTab(id)}
          >
            {t(id === 'combos' ? 'ui.upgrades.tabCombos' : 'ui.upgrades.tabDice')}
          </PixelButton>
        ))}
      </div>

      {tab === 'combos' && (
        <div className="flex flex-col gap-2">
          {COMBO_KEYS.map((k) => {
            const lv = save.comboLevels[k] ?? 1
            const max = maxComboLevel(k, data)
            const cost = nextComboCost(k, lv, data)
            return (
              <Row
                key={k}
                title={comboName(k)}
                dice={<ComboExample k={k} />}
                level={lv}
                max={max}
                bonus={comboBonusAt(k, lv, data)}
                nextBonus={cost == null ? null : comboBonusAt(k, lv + 1, data)}
                cost={cost}
                gold={save.gold}
                onBuy={() => buyAnd(upgradeCombo(k))}
                locked={
                  maxDice < COMBO_MIN_DICE[k]
                    ? t('ui.upgrades.needsDice', { need: COMBO_MIN_DICE[k], have: maxDice })
                    : null
                }
              />
            )
          })}
        </div>
      )}

      {tab === 'dice' && (
        <div className="flex flex-col gap-2">
          {[...POKE_TYPES]
            .sort((a, b) => carriers[b] - carriers[a] || a.localeCompare(b))
            .map((type) => {
              const lv = save.dieLevels[type] ?? 1
              const max = maxDieLevel(type, data)
              const cost = nextDieCost(type, lv, data)
              return (
                <Row
                  key={type}
                  title={<TypeBadge type={type} />}
                  dice={<DieFaces type={type} faces={data.diceTypes[type]?.faces ?? []} size={26} />}
                  effect={<DieEffects type={type} />}
                  level={lv}
                  max={max}
                  bonus={dieBonusAt(type, lv, data)}
                  nextBonus={cost == null ? null : dieBonusAt(type, lv + 1, data)}
                  cost={cost}
                  gold={save.gold}
                  onBuy={() => buyAnd(upgradeDie(type))}
                  locked={carriers[type] ? null : t('ui.upgrades.noCarrier')}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
