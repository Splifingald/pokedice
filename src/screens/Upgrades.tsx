import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  COMBO_KEYS,
  COMBO_MIN_DICE,
  comboBonusAt,
  dieBonusAt,
  generalCfg,
  generalLevel,
  generalMax,
  charmChanceAt,
  charmRulesOnly,
  generalRulesDue,
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
import { feelSound } from '@/audio/feel'
import { Chip } from '@/components/Chip'
import { Die } from '@/components/Die'
import { FaceDice, facesStatuses, StatusLines } from '@/components/FaceDice'
import { PixelIcon } from '@/components/icons'
import { COMBO_EXAMPLES, comboExampleText, comboName, money, oneInText, typeName } from '@/lib/format'
import { bestBuy, dieCarriers, maxDiceOwned } from '@/lib/upgrades'
import { useMotion } from '@/lib/motion'
import { useT } from '@/i18n/react'
import { GeneralRulesCard, GeneralRulesModal } from '@/components/GeneralRules'
import { SmallInfo } from '@/components/SmallInfo'
import { TrainerName } from '@/components/TrainerName'
import { upgradeCombo, upgradeDie, upgradeGeneral } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
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
  /** Under the name: what it is (a die, a General upgrade). */
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

/**
 * A purchase's pop (docs/38 F12a), frame by frame (60 ms each): the new pip fills in three steps, flashes white for one
 * frame (not when calm), and the bonus rises over the track and goes.
 */
const POP_MS = 60
const POP_FRAMES = 16
const POP_FILL = [1 / 3, 2 / 3, 1]
const POP_WHITE = 3
export interface UpPop {
  /** The level the purchase reached: its pip fills. */
  level: number
  /** The new bonus, as the engine gives it ("+4 damage"). */
  text: string
  frame: number
  calm: boolean
}

/** The level track: one pip per level, gold up to the current one; the one a purchase just filled, in steps. */
function Pips({ level, max, pop }: { level: number; max: number; pop?: UpPop | null }) {
  const { t } = useT()
  const filling = pop ? pop.level - 1 : -1
  return (
    <span
      className="flex flex-1 gap-[2px]"
      role="img"
      aria-label={t('ui.upgrades.trackLevel', { level, max })}
    >
      {Array.from({ length: max }, (_, i) => {
        const part = pop && i === filling ? POP_FILL[pop.frame] : undefined
        const white = !!pop && i === filling && pop.frame === POP_WHITE && !pop.calm
        return (
          <i
            key={i}
            className={cx(
              'relative h-2.5 flex-1',
              white
                ? 'bg-white shadow-ring-thin'
                : i < level && part == null
                  ? 'bg-gold shadow-ring-thin'
                  : 'bg-well-deep shadow-ring-line-thin',
            )}
          >
            {part != null && (
              <span className="absolute inset-y-0 left-0 bg-gold" style={{ width: `${part * 100}%` }} />
            )}
          </i>
        )
      })}
    </span>
  )
}

/** The bonus a purchase brought, rising 2 px a frame over the track, then gone. */
function PopText({ pop }: { pop: UpPop }) {
  if (pop.frame < 2 || pop.frame >= POP_FRAMES - 1) return null
  return (
    <span
      aria-hidden
      className="light-scope pointer-events-none absolute -top-6 right-0 whitespace-nowrap bg-night px-1.5 py-0.5 font-pixel-sm text-[16px] leading-none text-gold-light"
      style={{ transform: `translateY(${-2 * Math.min(6, pop.frame - 2)}px)` }}
    >
      {pop.text}
    </span>
  )
}

/**
 * An upgrade (docs/43 §5.5), in two columns: on the left its name, what it does now → at the next level (the line the
 * eye goes to, 22 px) and its track; at its foot the price is the button, the card's whole width — the choice and
 * the purchase in one tap. Navy, the best buy gold (with its chip), grey short of ₽ (saying what's missing), MAX at
 * the top, a lock with its reason when nobody you own would use it.
 */
export function UpCard({
  u,
  gold,
  best,
  frozenPop,
}: {
  u: Up
  gold: number
  best?: boolean
  frozenPop?: UpPop
}) {
  const { t } = useT()
  const { level: motion, calm } = useMotion()
  const can = !u.locked && u.cost != null && u.cost <= gold
  const bonus = (n: number) =>
    t(u.kind === 'combo' ? 'ui.upgrades.comboBonus' : 'ui.upgrades.dieBonus', { n })
  const now = u.now ?? bonus(u.bonus)
  const then = u.then !== undefined ? u.then : u.next != null ? `+${u.next}` : null
  // A purchase pops (docs/38 F12a), and the toast says it.
  const [pop, setPop] = useState<UpPop | null>(null)
  const popTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(popTimer.current), [])
  const playPop = (level: number, text: string) => {
    window.clearTimeout(popTimer.current)
    const step = (frame: number) => {
      setPop(frame < POP_FRAMES ? { level, text, frame, calm } : null)
      if (frame < POP_FRAMES) popTimer.current = window.setTimeout(() => step(frame + 1), POP_MS)
    }
    step(0)
  }
  const buy = () => {
    // The press, as a PixelButton sounds it; a buy adds its level-up after.
    sfx('button')
    if (u.cost == null || u.locked) return
    if (!can) return pushToast(t('ui.upgrades.short', { amount: money(u.cost - gold) }), 'info')
    const level = u.level + 1
    const gained = u.then ?? bonus(u.next ?? u.bonus)
    if (!u.buy()) return
    feelSound('upgrade.pop')
    if (motion !== 'off') playPop(level, gained)
    pushToast(t('ui.upgrades.bought', { name: u.name, level, bonus: gained }), 'good')
  }
  const shownPop = frozenPop ?? pop
  // The price is a row at the card's foot, as the Buy tab's (the user's call, 2026-10-27: a column the card's height
  // read oddly): the text keeps the whole width.
  const side = 'flex min-h-[48px] w-full items-center justify-center gap-x-2.5 px-3 leading-none'
  return (
    <li
      className={cx(
        'grid content-start gap-2 px-2.5 py-2',
        u.locked
          ? 'bg-well text-ink shadow-ring-line'
          : can
            ? 'bg-cream shadow-card-warm'
            : 'bg-paper shadow-card',
      )}
    >
      <div className="grid min-w-0 content-start gap-1.5">
        <div className="flex min-h-[28px] flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[20px] font-normal leading-none">{u.name}</b>
          {/* The best buy says so in words too, never by its gold alone. */}
          {best && can && <Chip tone="gold">{t('ui.upgrades.bestBuy')}</Chip>}
          {u.visual && <span className="ml-auto">{u.visual}</span>}
        </div>
        {u.desc && <small className="font-pixel-sm text-[16px] leading-tight text-muted">{u.desc}</small>}
        {u.faces}
        <p className="m-0 text-[22px] leading-none">
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
        </p>
        <div className="relative flex items-center gap-2">
          <Pips level={u.level} max={u.max} pop={shownPop} />
          <span className="font-pixel-sm text-[16px] tabular-nums text-ink">
            {t('ui.common.level.short', { n: u.level })}
          </span>
          {shownPop && <PopText pop={shownPop} />}
        </div>
        {u.locked && <p className="m-0 font-pixel-sm text-[16px] leading-tight text-ink">{u.locked}</p>}
      </div>
      {u.locked ? (
        <span className={cx(side, 'bg-well-deep font-pixel-sm text-[16px] text-ink')}>
          <PixelIcon name="lock" size={16} />
          {t('ui.upgrades.lockedWord')}
        </span>
      ) : u.cost == null ? (
        <span className={cx(side, 'bg-gold text-[20px] text-ink shadow-ring')}>{t('ui.upgrades.max')}</span>
      ) : (
        <button
          type="button"
          onClick={buy}
          aria-disabled={!can || undefined}
          // The dice tutorial (docs/46 §5) points at its die's button.
          data-guide={`buy-${u.kind}-${u.id}`}
          className={cx(
            side,
            'pb-1.5 pt-1',
            // Navy, the best buy gold: a list of red buttons was a screen of "main" actions (docs/15 §13).
            can
              ? best
                ? 'pixel-btn frame-gold'
                : 'pixel-btn frame-dark'
              : 'bg-well-deep text-ink shadow-ring-line',
          )}
        >
          <b className="text-[24px] font-normal tabular-nums">{money(u.cost)}</b>
          <small className="font-pixel-sm text-[18px]">
            {can ? t('ui.upgrades.upgrade') : t('ui.upgrades.needShort', { amount: money(u.cost - gold) })}
          </small>
        </button>
      )}
    </li>
  )
}

type Tab = 'combos' | 'dice' | 'general'

/**
 * Upgrades' views as one compact row of chips under the Mart's tabs (docs/43 §5.5): two stacked full-width tab bars
 * read as two levels of the same weight. Still a tab list (arrow keys move), each with how many you can afford.
 */
function SubTabs({
  value,
  onChange,
  options,
  label,
}: {
  value: Tab
  onChange: (v: Tab) => void
  options: { id: Tab; label: string; count?: number }[]
  label: string
}) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = options.findIndex((o) => o.id === value)
    const next = options[(i + step + options.length) % options.length]!
    onChange(next.id)
    const list = e.currentTarget
    requestAnimationFrame(() => list.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus())
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={move} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`up-${o.id}`}
            data-id={o.id}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap px-3 text-[19px] leading-none md:min-h-[40px]',
              on ? 'bg-ink text-panel' : 'bg-paper text-ink shadow-ring-line hover:shadow-ring',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('font-pixel-sm text-[16px]', on ? 'text-gold-light' : 'text-muted')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** `/upgrades` (old links, the General's pop-up): the Mart, on its Upgrades tab (docs/43 §3). */
export function UpgradesScreen() {
  const [params] = useSearchParams()
  const sub = params.get('tab')
  return (
    <Navigate to={`/shop?tab=upgrades${sub === 'general' || sub === 'dice' ? `&up=${sub}` : ''}`} replace />
  )
}

/** The cards: one column on a phone, two on a tablet, three on PC (docs/43 §5.5). */
const UP_GRID = 'grid gap-2 md:grid-cols-2 xl:grid-cols-3'

/** The Mart's Upgrades tab: combos, dice types and the General upgrades, each a view. */
export function UpgradesPanel() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const details = useDetails()
  const [params, setParams] = useSearchParams()
  const inside = useInWorld().inside
  // The General tab is the admin's to switch on (docs/15 §20); its pop-up's Let's go! opens it (`&up=general`). Its
  // levels hold in every region, so a small world, whose ₽ are its own, has its combos and dice only (docs/26).
  const generalOpen = generalOn(data) && !inside
  const asked = params.get('up')
  const picked: Tab = asked === 'general' || asked === 'dice' ? asked : 'combos'
  const tab: Tab = picked === 'general' && !generalOpen ? 'combos' : picked
  // The view lives in the address (deep links, Back), next to the Mart's own tab.
  const setTab = (next: Tab) =>
    setParams(next === 'combos' ? { tab: 'upgrades' } : { tab: 'upgrades', up: next }, { replace: true })
  const [affordOnly, setAffordOnly] = useState(false)
  const [rules, setRules] = useState(false)
  // The rules where they apply (docs/43 §7): a card at the top of the General view until GOT IT; opening the view no
  // longer counts as having read them. The Shiny Charm's alone for a player who read the rest before it came.
  const rulesDue = useGame((s) => !!s.save && generalRulesDue(s.save, s.data))
  const charmOnly = useGame((s) => !!s.save && charmRulesOnly(s.save, s.data))
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
          <small className="font-pixel-sm text-[16px] text-muted">
            {t(`ui.upgrades.onMons.${n === 1 ? 'one' : 'other'}`, { n })}
          </small>
        ) : null,
        // The faces show what the die is at a glance; what each status face does, line by line, is for the invested
        // player (More details), the faces' rings and badges already saying which status.
        faces: (
          <>
            <FaceDice type={type} faces={faces} size={30} />
            {details && <StatusLines statuses={facesStatuses(faces)} />}
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
                className="max-w-[160px] truncate text-[20px] leading-none"
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
  const best = bestBuy(open, save.gold)
  const tabCount = (l: Up[]) => l.filter(affordable).length || undefined

  return (
    <div className="flex flex-col gap-3">
      {/* One row under the Mart's tabs: the views, and the filter at its end. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubTabs
          label={t('ui.upgrades.title')}
          value={tab}
          onChange={setTab}
          options={[
            { id: 'combos', label: t('ui.upgrades.tabCombos'), count: tabCount(combos) },
            { id: 'dice', label: t('ui.upgrades.tabDice'), count: tabCount(dice) },
            ...(generalOpen
              ? [{ id: 'general' as const, label: t('ui.upgrades.tabGeneral'), count: tabCount(general) }]
              : []),
          ]}
        />
        {/* On a phone the coin and the count (its name for screen readers), so the views and the filter share a row. */}
        <button
          type="button"
          aria-pressed={affordOnly}
          aria-label={`${t('ui.upgrades.affordable')} ${canCount}`}
          title={t('ui.upgrades.affordable')}
          onClick={() => setAffordOnly((v) => !v)}
          className={cx(
            'ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-[18px] md:min-h-[40px]',
            affordOnly ? 'bg-ink text-panel' : 'bg-paper shadow-ring-line',
          )}
        >
          <PixelIcon name="coin" size={14} />
          <span className="hidden sm:inline">{t('ui.upgrades.affordable')}</span>
          <i
            className={cx(
              'font-pixel-sm text-[16px] not-italic',
              affordOnly ? 'text-gold-light' : 'text-muted',
            )}
          >
            {canCount}
          </i>
        </button>
      </div>
      <div role="tabpanel" aria-labelledby={`up-${tab}`} className="flex flex-col gap-2">
        {tab === 'general' && rulesDue && <GeneralRulesCard charmOnly={charmOnly} />}
        <ul className={UP_GRID}>
          {open.map((u) => (
            <UpCard key={u.id} u={u} gold={save.gold} best={u.id === best} />
          ))}
          {open.length === 0 && <li className="copy text-muted">{t('ui.upgrades.noneAffordable')}</li>}
        </ul>
        {locked.length > 0 && (
          <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-pixel-sm text-[18px] text-muted">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
                ▶
              </span>
              {t(`ui.upgrades.lockedCount.${locked.length === 1 ? 'one' : 'other'}`, { n: locked.length })}
            </summary>
            <ul className={UP_GRID}>
              {locked.map((u) => (
                <UpCard key={u.id} u={u} gold={save.gold} />
              ))}
            </ul>
          </details>
        )}
        {tab === 'general' && (
          <>
            <SmallInfo
              name={t('ui.upgrades.tabGeneral')}
              onClick={() => setRules(true)}
              className="mt-1 self-start"
            />
            <GeneralRulesModal open={rules} onClose={() => setRules(false)} />
          </>
        )}
      </div>
    </div>
  )
}
