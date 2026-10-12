import { useState, type ReactNode } from 'react'
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  comboBonusAt,
  diceLevelOf,
  dieBonusAt,
  maxComboLevel,
  maxDieLevel,
  nextComboCost,
  nextDieCost,
  POKE_TYPES,
  teamOf,
  type ComboKey,
  type PokeType,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { FaceDice, facesStatuses, StatusLines } from '@/components/FaceDice'
import { PixelIcon } from '@/components/icons'
import { PageHead, Wallet } from '@/components/PageHead'
import { Seg } from '@/components/Segmented'
import { COMBO_EXAMPLES, comboExampleText, comboName, money, typeName } from '@/lib/format'
import { dieCarriers, maxDiceOwned } from '@/lib/upgrades'
import { useT } from '@/i18n/react'
import { upgradeCombo, upgradeDie } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { MiniSprite } from '@/components/SpriteImg'
import { useInWorld, worldVars, WorldTag } from '@/screens/events/world'
import { worldName } from '@/store/worlds'
import { cx } from '@/theme/util'

/** One upgrade, whatever its kind: the card reads only this. */
interface Up {
  id: string
  kind: 'combo' | 'die'
  name: string
  level: number
  max: number
  bonus: number
  next: number | null
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

function UpCard({ u, gold }: { u: Up; gold: number }) {
  const { t } = useT()
  const can = !u.locked && u.cost != null && u.cost <= gold
  const bonus = (n: number) =>
    t(u.kind === 'combo' ? 'ui.upgrades.comboBonus' : 'ui.upgrades.dieBonus', { n })
  const buy = () => {
    if (u.cost == null || u.locked) return
    if (!can) return pushToast(t('ui.upgrades.short', { amount: money(u.cost - gold) }), 'info')
    if (!u.buy()) return
    sfx('levelup')
    pushToast(
      t('ui.upgrades.bought', { name: u.name, level: u.level + 1, bonus: bonus(u.next ?? u.bonus) }),
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
          {bonus(u.bonus)}
          {u.next != null && (
            <>
              {' '}
              <span className="text-muted" aria-hidden>
                →
              </span>
              <span className="sr-only">{t('ui.upgrades.then')}</span>{' '}
              <em className="not-italic text-good">+{u.next}</em>
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

/** The levels the world's table shows, and the dice level each gives (the engine's diceLevelOf). */
const LEVEL_STEPS = [1, 10, 20, 30, 50, 70, 100]

/**
 * Inside a small world (docs/21): no upgrades to buy. Dice and combos follow each Pokémon's level, yours and the foes';
 * the table says how, and each team member's line says where it stands.
 */
function WorldUpgrades() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { world } = useInWorld()
  if (!save) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHead icon="navUpgrades" title={t('ui.upgrades.title')}>
        <Wallet />
      </PageHead>
      <section className="pixel-panel flex flex-col gap-3 p-3" style={worldVars(world)} aria-labelledby="world-up">
        <span className="flex items-center gap-2">
          <WorldTag />
          <h2 id="world-up" className="m-0 text-[24px] leading-none">
            {t('ui.world.up.title')}
          </h2>
        </span>
        <p className="copy m-0 text-muted">{t('ui.world.up.text', { world: worldName(world, data) })}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center font-pixel-sm text-[16px] tabular-nums">
            <tbody>
              <tr>
                <th scope="row" className="bg-ink px-2 py-1 text-left font-normal text-panel">
                  {t('ui.world.up.level')}
                </th>
                {LEVEL_STEPS.map((l) => (
                  <td key={l} className="px-1.5 py-1 shadow-ring-line">
                    {l}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="bg-ink px-2 py-1 text-left font-normal text-panel">
                  {t('ui.world.up.dice')}
                </th>
                {LEVEL_STEPS.map((l) => (
                  <td key={l} className="px-1.5 py-1 shadow-ring-line">
                    {diceLevelOf(l)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {teamOf(save).map((p) => (
            <li key={p.id} className="flex items-center gap-2 bg-paper px-2 py-1 shadow-card">
              <MiniSprite dex={p.dex} size={32} />
              <b className="min-w-0 flex-1 truncate text-[20px] font-normal leading-none">{data.species[p.dex]?.name}</b>
              <span className="font-pixel-sm text-[16px] leading-none text-muted">
                {t('ui.world.up.yours', { level: p.level, n: diceLevelOf(p.level) })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function UpgradesScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [tab, setTab] = useState<'combos' | 'dice'>('combos')
  const [affordOnly, setAffordOnly] = useState(false)
  const inside = useInWorld().inside
  if (!save) return null
  if (inside) return <WorldUpgrades />

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
  const affordable = (u: Up) => !u.locked && u.cost != null && u.cost <= save.gold
  const lists = { combos, dice }
  const shown = lists[tab].filter((u) => !affordOnly || affordable(u))
  const open = shown.filter((u) => !u.locked)
  const locked = shown.filter((u) => u.locked)
  const canCount = [...combos, ...dice].filter(affordable).length
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
        ]}
      />
      <div role="tabpanel" aria-labelledby={`up-${tab}`} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-[1_1_180px] font-pixel-sm text-[15px] leading-tight text-muted">
            {t(tab === 'combos' ? 'ui.upgrades.noteCombos' : 'ui.upgrades.noteDice')}
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
      </div>
    </div>
  )
}
