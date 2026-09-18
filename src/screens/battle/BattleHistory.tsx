// What happened so far in this battle, newest first: attacks (tap for the damage recap), statuses, skipped turns,
// switches, items and heals. Only what the animation has already shown.
import { useMemo, useState, type ReactNode } from 'react'
import {
  COMBO_NAMES,
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
import { cap } from '@/lib/format'
import { cx } from '@/theme/util'

/** How a hit's damage adds up: each die (value + upgrade bonus × the attack type's multiplier), the combo, the total. */
export function DamageRecap({ result, dice, className }: { result: DamageResult; dice?: readonly RolledDie[]; className?: string }) {
  const data = useGame((s) => s.data)
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {dice && dice.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-hidden>
          {dice.map((d, i) => (
            <Die key={i} type={d.type} face={data.diceTypes[d.type]?.faces[d.faceIndex] ?? null} size={26} />
          ))}
        </div>
      )}
      <div className="font-mono text-xs">
        {result.attackType ? `${result.attackType.toUpperCase()} attack` : 'Untyped attack'} ×{result.perDie[0]?.multiplier ?? 1}
      </div>
      <div className="grid grid-cols-2 gap-x-4 font-mono text-xs sm:grid-cols-3">
        {result.perDie.map((p, i) => (
          <span key={i}>
            {p.value}
            {p.bonus ? `+${p.bonus}` : ''} ({p.type}) ×{p.multiplier} = {p.damage}
          </span>
        ))}
        {result.combo && (
          <span>
            {COMBO_NAMES[result.combo.key]} +{result.combo.bonus} ×{result.combo.multiplier} = {result.combo.damage}
          </span>
        )}
      </div>
      <div className="font-mono text-xs">
        Total {result.final}
        {result.immune ? ' (no effect)' : ''}
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
    return `${counts[k]}/${data.config.status[k].threshold} ${cap(k)} faces, no ${k} (counted as ${value})`
  })
  return bits.length ? bits.join(' · ') : undefined
}

function buildRows(log: readonly LogEntry[], player: readonly Battler[], enemy: Battler, data: GameData): Row[] {
  const itemName = (k: string) => data.items[k]?.name ?? k
  const who = (uid: string) => {
    const b = uid === enemy.uid ? enemy : player.find((p) => p.uid === uid)
    return { dex: b?.dex ?? 0, name: b?.name ?? '???', foe: uid === enemy.uid }
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
        rows.push({ key, ...who(e.uid), text: e.free ? 'was sent out' : 'was switched in', icon: 'ball' })
        return
      case 'damage': {
        const attacker = who(active[e.side])
        const target = who(e.targetUid)
        rows.push({
          key,
          ...attacker,
          text: e.selfHit ? 'hurt itself in its confusion' : `attacked ${target.name}${e.result.combo ? ` · ${COMBO_NAMES[e.result.combo.key]}` : ''}`,
          icon: 'sword',
          amount: e.amount,
          note: e.selfHit ? undefined : nearMisses(e.dice, data),
          recap: { result: e.result, dice: e.dice },
        })
        return
      }
      case 'status':
        rows.push({
          key,
          ...who(e.targetUid),
          text: e.status === 'heal' ? 'is healing' : `got ${e.status === 'frozen' ? 'frozen' : e.status === 'confuse' ? 'confused' : e.status === 'paralyze' ? 'paralyzed' : e.status === 'burn' ? `burned${e.stacks && e.stacks > 1 ? ` (${e.stacks} stacks)` : ''}` : 'poisoned'}`,
          icon: STATUS_ICON[e.status],
        })
        return
      case 'status_tick':
        rows.push({ key, ...who(e.targetUid), text: `was hurt by its ${e.status === 'burn' ? 'burn' : 'poison'}`, icon: STATUS_ICON[e.status], amount: e.amount })
        return
      case 'stunned':
        if (e.pending) return
        rows.push({ key, ...who(e.uid), text: `is ${e.status === 'frozen' ? 'frozen' : 'paralyzed'} and skipped its turn`, icon: STATUS_ICON[e.status] })
        return
      case 'faint':
        rows.push({ key, ...who(e.uid), text: 'fainted', icon: 'close' })
        return
      case 'item': {
        const bits = [
          e.amount > 0 ? `+${e.amount} HP` : '',
          e.cured?.length ? `cured ${e.cured.join(', ')}` : '',
          e.rerolls ? `+${e.rerolls} reroll${e.rerolls === 1 ? '' : 's'}` : '',
        ].filter(Boolean)
        rows.push({ key, ...who(e.targetUid), text: `got a ${itemName(e.key)}${bits.length ? ` (${bits.join(', ')})` : ''}`, icon: 'potion' })
        return
      }
      case 'heal':
        rows.push({ key, ...who(e.uid), text: 'healed', icon: 'heal', amount: e.amount, heal: true })
        return
    }
  })
  return rows.reverse()
}

function HistoryRow({ r }: { r: Row }) {
  const [open, setOpen] = useState(false)
  const body: ReactNode = (
    <>
      <MiniSprite dex={r.dex} size={32} className="-my-1" />
      <span className="min-w-0 flex-1 leading-tight">
        <b className={r.foe ? 'text-danger' : undefined}>{r.foe ? `Foe ${r.name}` : r.name}</b> {r.text}
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
  const data = useGame((s) => s.data)
  const rows = useMemo(
    () => buildRows(battle.log.slice(0, cursor), battle.state.player, battle.state.enemy, data),
    [battle.log, battle.state.player, battle.state.enemy, cursor, data],
  )
  if (!rows.length) return <p className="copy px-1 text-muted">Nothing has happened yet.</p>
  return <ol aria-label="Battle history, newest first">{rows.map((r) => <HistoryRow key={r.key} r={r} />)}</ol>
}

/** Desktop: a toggle under the battle, open by default. */
export function BattleHistory({ battle, cursor, defaultOpen }: { battle: BattleSlice; cursor: number; defaultOpen: boolean }) {
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
        Battle history
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
