// What happened so far in this battle, newest first: attacks (tap for the damage recap), statuses, skipped turns,
// switches, items and heals. Only what the animation has already shown.
import { useMemo, useState, type ReactNode } from 'react'
import {
  faceOf,
  statusCounts,
  STATUS_KINDS,
  type Battler,
  type DamageResult,
  type GameData,
  type LogEntry,
  type RolledDie,
  type Side,
} from '@/engine'
import { Die } from '@/components/Die'
import { PixelIcon, STATUS_ICON } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import type { BattleSlice } from '@/store/game'
import { useGame } from '@/store/game'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { comboName, statusName, typeName } from '@/lib/format'
import { cx } from '@/theme/util'

/**
 * How a hit adds up, in one line: ( dice + combo ) × the type multiplier = the damage dealt.
 *
 * It used to print a term per die — `5+1 (fire) ×2 = 12` six times over — which is the same arithmetic six times,
 * since every die and the combo take the one multiplier the whole attack does (v1.8). The dice are shown above as
 * dice; their total is the only number worth reading off them.
 *
 * The total is rounded and floored at 1, so a halved or quartered hit can land a point off what the line multiplies
 * out to. Showing the rounded figure is the honest choice: it is the damage that was actually dealt.
 *
 * Centred, under the dice it is about — in the roll preview and in a history row alike, since it is the same panel.
 */
export function DamageRecap({ result, dice, className }: { result: DamageResult; dice?: readonly RolledDie[]; className?: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const diceTotal = result.perDie.reduce((sum, p) => sum + p.value + p.bonus, 0)
  const multiplier = result.perDie[0]?.multiplier ?? 1
  return (
    <div className={cx('flex flex-col items-center gap-1 text-center', className)}>
      {dice && dice.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1" aria-hidden>
          {dice.map((d, i) => (
            <Die key={i} type={d.type} face={data.diceTypes[d.type]?.faces[d.faceIndex] ?? null} size={26} />
          ))}
        </div>
      )}
      <div className="font-mono text-xs text-muted">
        {result.attackType ? t('ui.hist.typedAttack', { type: typeName(result.attackType).toUpperCase() }) : t('ui.hist.untypedAttack')}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 font-mono text-sm leading-none">
        {result.combo && <span aria-hidden>(</span>}
        <PixelIcon name="dice" size={14} />
        <span>{diceTotal}</span>
        {result.combo && (
          <>
            <span aria-hidden>+</span>
            <span className="uppercase text-muted">{comboName(result.combo.key)}</span>
            <span>{result.combo.bonus}</span>
            <span aria-hidden>)</span>
          </>
        )}
        <span aria-hidden>×</span>
        <span>{multiplier}</span>
        <span aria-hidden>=</span>
        <span className="text-base">{result.final}</span>
        {result.immune && <span className="text-muted">{t('ui.hist.noEffect')}</span>}
      </div>
    </div>
  )
}

interface Row {
  key: number
  dex: number
  name: string
  foe: boolean
  text: string
  icon?: Parameters<typeof PixelIcon>[0]['name']
  amount?: number
  heal?: boolean
  /** Status faces that landed short of their threshold: "1/2 Poison faces — counted as 1". */
  note?: string
  recap?: { result: DamageResult; dice: RolledDie[] }
}

/** Status faces in a roll that didn't reach their threshold, so they only counted as a number. */
function nearMisses(dice: readonly RolledDie[], data: GameData): string | undefined {
  const counts = statusCounts(dice, data)
  const bits = STATUS_KINDS.filter((k) => counts[k] > 0 && counts[k] < data.config.status[k].threshold).map((k) => {
    const value = dice.map((d) => faceOf(d, data)).find((f) => f.kind === 'status' && f.status === k)?.value ?? 0
    return t('ui.hist.nearMiss', {
      have: counts[k],
      need: data.config.status[k].threshold,
      status: statusName(k),
      status2: statusName(k).toLowerCase(),
      value,
    })
  })
  return bits.length ? bits.join(' · ') : undefined
}

function buildRows(log: readonly LogEntry[], player: readonly Battler[], enemy: Battler, data: GameData): Row[] {
  const itemName = (k: string) => data.items[k]?.name ?? k
  const who = (uid: string) => {
    const b = uid === enemy.uid ? enemy : player.find((p) => p.uid === uid)
    return { dex: b?.dex ?? 0, name: b?.name ?? t('ui.common.unknown'), foe: uid === enemy.uid }
  }
  let active: Record<Side, string> = { enemy: enemy.uid, player: player[0]?.uid ?? '' }
  const rows: Row[] = []
  log.forEach((e, key) => {
    switch (e.kind) {
      case 'turn':
        active = { ...active, [e.side]: e.uid }
        return
      case 'switch':
        active = { ...active, player: e.uid }
        rows.push({ key, ...who(e.uid), text: t(e.free ? 'ui.hist.sentOut' : 'ui.hist.switchedIn'), icon: 'ball' })
        return
      case 'transform':
        rows.push({ key, ...who(e.uid), text: t('ui.hist.copied', { from: who(e.fromUid).name }), icon: 'reroll' })
        return
      case 'damage': {
        const attacker = who(active[e.side])
        const target = who(e.targetUid)
        rows.push({
          key,
          ...attacker,
          text: e.result.combo
            ? t('ui.hist.attackedCombo', { target: target.name, combo: comboName(e.result.combo.key) })
            : t('ui.hist.attacked', { target: target.name }),
          icon: 'sword',
          amount: e.amount,
          note: nearMisses(e.dice, data),
          recap: { result: e.result, dice: e.dice },
        })
        return
      }
      case 'status':
        rows.push({
          key,
          ...who(e.targetUid),
          text:
            e.status === 'heal'
              ? t('ui.hist.isHealing')
              : t('ui.hist.gotStatus', {
                  status:
                    e.status === 'frozen'
                      ? t('ui.hist.statusFrozen')
                      : e.status === 'confuse'
                        ? t('ui.hist.statusConfused')
                        : e.status === 'paralyze'
                          ? t('ui.hist.statusParalyzed')
                          : e.status === 'burn'
                            ? t('ui.hist.statusBurned', { stacks: e.stacks && e.stacks > 1 ? t('ui.log.stacks', { n: e.stacks }) : '' })
                            : t('ui.hist.statusPoisoned'),
                }),
          icon: STATUS_ICON[e.status],
        })
        return
      case 'status_tick':
        rows.push({
          key,
          ...who(e.targetUid),
          text: t('ui.hist.hurtBy', { source: t(e.status === 'burn' ? 'ui.hist.burnSource' : 'ui.hist.poisonSource') }),
          icon: STATUS_ICON[e.status],
          amount: e.amount,
        })
        return
      case 'stunned':
        if (e.pending) return
        rows.push({
          key,
          ...who(e.uid),
          text: t('ui.hist.skippedTurn', { state: t(e.status === 'frozen' ? 'ui.log.frozenSolid' : 'ui.log.paralysedWord') }),
          icon: STATUS_ICON[e.status],
        })
        return
      case 'faint':
        rows.push({ key, ...who(e.uid), text: t('ui.hist.fainted'), icon: 'close' })
        return
      case 'item': {
        const bits = [
          e.revived ? t('ui.hist.revived') : '',
          e.amount > 0 ? t('ui.hist.plusHp', { amount: e.amount }) : '',
          e.cured?.length ? t('ui.hist.cured', { statuses: e.cured.map((c) => t(`ui.status.${c}.noun`)).join(', ') }) : '',
          e.rerolls ? t(`ui.hist.plusRerolls.${e.rerolls === 1 ? 'one' : 'other'}`, { n: e.rerolls }) : '',
        ].filter(Boolean)
        rows.push({
          key,
          ...who(e.targetUid),
          text: t('ui.hist.gotItem', { item: itemName(e.key), extras: bits.length ? ` (${bits.join(', ')})` : '' }),
          icon: 'potion',
        })
        return
      }
      case 'heal':
        rows.push({ key, ...who(e.uid), text: t('ui.hist.healed'), icon: 'heal', amount: e.amount, heal: true })
        return
      case 'recoil':
        rows.push({ key, ...who(e.uid), text: t('ui.hist.tookRecoil'), icon: STATUS_ICON.confuse, amount: e.amount })
        return
    }
  })
  return rows.reverse()
}

function HistoryRow({ r }: { r: Row }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const body: ReactNode = (
    <>
      <MiniSprite dex={r.dex} size={32} className="-my-1" />
      <span className="min-w-0 flex-1 leading-tight">
        <b className={r.foe ? 'text-danger' : undefined}>{r.foe ? t('ui.hist.foe', { name: r.name }) : r.name}</b> {r.text}
        {r.note && <span className="block text-sm text-muted">{r.note}</span>}
      </span>
      {r.amount != null && (
        <span className={cx('flex shrink-0 items-center gap-1 font-mono', r.heal && 'text-good')}>
          {r.icon && <PixelIcon name={r.icon} size={14} />}
          {r.heal ? '+' : ''}
          {r.amount}
        </span>
      )}
      {r.amount == null && r.icon && <PixelIcon name={r.icon} size={14} className="shrink-0" />}
      {r.recap && <span className="w-3 shrink-0 text-center text-sm" aria-hidden>{open ? '▾' : '▸'}</span>}
    </>
  )
  return (
    <li className="border-b-2 border-shadow/30 last:border-b-0">
      {r.recap ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[44px] w-full items-center gap-2 px-1 text-left text-base hover:bg-white/60 md:min-h-[36px]"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-[40px] items-center gap-2 px-1 text-base md:min-h-[36px]">{body}</div>
      )}
      {r.recap && open && <DamageRecap result={r.recap.result} dice={r.recap.dice} className="px-2 pb-2" />}
    </li>
  )
}

/** The rows of the history, for the panel (desktop) or the sheet (phones). */
export function BattleHistoryList({ battle, cursor }: { battle: BattleSlice; cursor: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const rows = useMemo(
    () => buildRows(battle.log.slice(0, cursor), battle.state.player, battle.state.enemy, data),
    [battle.log, battle.state.player, battle.state.enemy, cursor, data],
  )
  if (!rows.length) return <p className="copy px-1 text-muted">{t('ui.hist.empty')}</p>
  return <ol aria-label={t('ui.hist.label')}>{rows.map((r) => <HistoryRow key={r.key} r={r} />)}</ol>
}

/** Desktop: a toggle under the battle, open by default. */
export function BattleHistory({ battle, cursor, defaultOpen }: { battle: BattleSlice; cursor: number; defaultOpen: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="pixel-panel p-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[36px] w-full items-center gap-2 text-left text-xl"
      >
        <PixelIcon name="history" size={16} />
        {t('ui.battle.history')}
        <span className="ml-auto text-base" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="pixel-scroll mt-1 max-h-72 overflow-y-auto">
          <BattleHistoryList battle={battle} cursor={cursor} />
        </div>
      )}
    </section>
  )
}
