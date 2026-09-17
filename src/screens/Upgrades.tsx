import { useId, useMemo, useState } from 'react'
import {
  COMBO_KEYS,
  COMBO_NAMES,
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
import { COMBO_EXAMPLES, comboExampleText, money, statusEffects } from '@/lib/format'
import { upgradeCombo, upgradeDie } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The combo shown as a roll of mini dice, groups spaced apart. */
function ComboExample({ k }: { k: ComboKey }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" role="img" aria-label={`Example: ${comboExampleText(k)}`}>
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
            <b>{e.name}</b> — {e.when} in one roll: {e.what}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The track as a segmented bar, like the area gauge. */
function Pips({ level, max }: { level: number; max: number }) {
  return (
    <div className="flex h-4 w-36 gap-[2px] border-2 border-ink bg-ink p-[1px]" role="img" aria-label={`Level ${level} of ${max}`} style={{ borderRadius: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx('flex-1', i < level ? 'bg-gold' : 'bg-[#3e3552]')} />
      ))}
    </div>
  )
}

function Row({
  title,
  level,
  max,
  bonus,
  nextBonus,
  cost,
  gold,
  onBuy,
  extra,
}: {
  title: React.ReactNode
  level: number
  max: number
  bonus: number
  nextBonus: number | null
  cost: number | null
  gold: number
  onBuy: () => void
  extra?: React.ReactNode
}) {
  const short = cost != null && gold < cost
  const reasonId = useId()
  return (
    <div className="pixel-panel flex flex-wrap items-center gap-x-4 gap-y-2 p-2">
      <div className="min-w-[150px] flex-1">
        <div className="text-2xl leading-none">{title}</div>
        {extra}
      </div>
      <div className="flex flex-col gap-1">
        <Pips level={level} max={max} />
        <span className="text-lg">
          Lv.{level} · +{bonus}
          {nextBonus != null && <span className="text-good"> → +{nextBonus}</span>}
        </span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <PixelButton
          variant="primary"
          disabled={cost == null || short}
          className="min-w-[120px]"
          onClick={onBuy}
          aria-describedby={short ? `${reasonId}` : undefined}
        >
          {cost == null ? 'MAX' : money(cost)}
        </PixelButton>
        {short && (
          <span id={reasonId} className="text-base leading-none text-muted">
            need {money(cost - gold)} more
          </span>
        )}
      </div>
    </div>
  )
}

export function UpgradesScreen() {
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

  if (!save) return null
  const buyAnd = (ok: boolean) => ok && sfx('levelup')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-5xl">Upgrades</h1>
      <p className="copy text-muted">
        Account-wide: every Pokémon you own — now and later — benefits. There is no level term in damage; upgrades are how
        your hits keep up with bigger HP pools.
      </p>
      <div className="flex gap-2" role="tablist">
        {(['combos', 'dice'] as const).map((t) => (
          <PixelButton key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>
            {t === 'combos' ? 'Combos' : 'Dice Types'}
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
                title={COMBO_NAMES[k]}
                extra={<ComboExample k={k} />}
                level={lv}
                max={max}
                bonus={comboBonusAt(k, lv, data)}
                nextBonus={cost == null ? null : comboBonusAt(k, lv + 1, data)}
                cost={cost}
                gold={save.gold}
                onBuy={() => buyAnd(upgradeCombo(k))}
              />
            )
          })}
        </div>
      )}

      {tab === 'dice' && (
        <div className="flex flex-col gap-2">
          <p className="copy text-muted">The bonus is added to each die of that type, before the type multiplier. The Base die can't be upgraded.</p>
          {[...POKE_TYPES]
            .sort((a, b) => carriers[b] - carriers[a] || a.localeCompare(b))
            .map((t) => {
              const lv = save.dieLevels[t] ?? 1
              const max = maxDieLevel(t, data)
              const cost = nextDieCost(t, lv, data)
              return (
                <Row
                  key={t}
                  title={<TypeBadge type={t} />}
                  extra={
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DieFaces type={t} faces={data.diceTypes[t]?.faces ?? []} size={26} />
                      <span className={cx('text-base', carriers[t] ? 'text-ink' : 'text-muted')}>
                        {carriers[t]} of your Pokémon carry it
                      </span>
                      <DieEffects type={t} />
                    </div>
                  }
                  level={lv}
                  max={max}
                  bonus={dieBonusAt(t, lv, data)}
                  nextBonus={cost == null ? null : dieBonusAt(t, lv + 1, data)}
                  cost={cost}
                  gold={save.gold}
                  onBuy={() => buyAnd(upgradeDie(t))}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
