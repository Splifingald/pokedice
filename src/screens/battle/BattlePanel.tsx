// The battle panel under the stage: the dice tray, the readout under it (combo, damage math, effectiveness, statuses),
// the team pips and the Bag. Every number comes from the engine (computeDamage, statusesFromRoll, comboDice).
import type { ReactNode } from 'react'
import { faceOf, type Battler, type DamageResult, type RolledDie, type Side, type StatusKind } from '@/engine'
import { Chip, StatusChip } from '@/components/Chip'
import { Die } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { HpBar } from '@/components/HpBar'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { comboName, statusName } from '@/lib/format'
import { useGame } from '@/store/game'
import { PALETTE } from '@/theme/colors'
import { cx } from '@/theme/util'

export interface TrayDice {
  side: Side
  dice: RolledDie[]
  /** Change one to replay that die's tumble. */
  keys: string[]
}

/**
 * Your dice land on their own; tap one to lift it for the reroll (red outline), the combo's dice wear a gold ring. The
 * foe's dice are smaller and can't be pressed.
 */
export function DiceTray({
  tray,
  live,
  selected,
  combo,
  onToggle,
  size,
  foeName,
  children,
}: {
  tray: TrayDice | null
  /** The roll you can act on (not a replayed one). */
  live: boolean
  selected: readonly boolean[]
  /** Indexes of the dice that make the combo. */
  combo: ReadonlySet<number>
  onToggle?: (i: number) => void
  /** Your dice's size; the foe's are smaller. */
  size: number
  foeName: string
  /** Shown instead of dice (the catch's ball picker). */
  children?: ReactNode
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const foe = tray?.side === 'enemy'
  return (
    <div
      role="group"
      aria-label={foe ? t('ui.battle.foeDice', { name: foeName }) : t('ui.battle.yourDice')}
      className="flex min-h-[64px] flex-wrap items-end justify-center gap-2"
    >
      {children ??
        tray?.dice.map((d, i) => (
          <Die
            key={i}
            type={d.type}
            face={faceOf(d, data)}
            size={foe ? Math.min(40, size) : size}
            rollKey={tray.keys[i]}
            delay={i * 0.05}
            selected={live && !foe && !!selected[i]}
            combo={live && !foe && combo.has(i)}
            onClick={onToggle && !foe ? () => onToggle(i) : undefined}
            locked={foe}
            asButton={!foe}
          />
        ))}
    </div>
  )
}

export interface Preview {
  r: DamageResult
  statuses: { status: StatusKind; stacks?: number }[]
  almost: { status: StatusKind; have: number; need: number; value: number }[]
  recoil: number
}

/**
 * Under the tray: the combo chip (or "No combo"), the damage, big (a button: the math behind it, shown once, under the
 * readout), how effective it is, and a chip per status face — lit once its threshold is met.
 */
export function Readout({
  preview,
  activeName,
  open,
  onToggle,
}: {
  preview: Preview
  activeName: string
  /** The breakdown is showing. */
  open: boolean
  onToggle: () => void
}) {
  const { t } = useT()
  const { r } = preview
  const eff = r.immune ? 'none' : r.effectiveness > 1 ? 'up' : r.effectiveness < 1 ? 'down' : null
  return (
    <>
      {r.combo ? (
        <Chip tone="gold" className="text-[16px]">
          {t('ui.battle.comboChip', { combo: comboName(r.combo.key), bonus: r.combo.bonus })}
        </Chip>
      ) : (
        <Chip tone="lock" className="text-[16px]">
          {t('ui.battle.noCombo')}
        </Chip>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('ui.battle.damageDetails', {
          amount: r.final,
          action: t(open ? 'ui.battle.hide' : 'ui.battle.show'),
        })}
        title={t('ui.battle.damageTitle')}
        onClick={onToggle}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 whitespace-nowrap px-1 font-pixel-sm text-[18px] leading-none text-ink md:min-h-[32px]"
      >
        <b className="font-pixel text-[26px] font-normal leading-none underline decoration-dotted decoration-2 underline-offset-4">
          {r.final}
        </b>
      </button>
      {eff && (
        <span
          className={cx(
            'font-pixel-sm text-[16px] leading-none',
            eff === 'up' ? 'text-good' : eff === 'down' ? 'text-[#8a5a2f] dark:text-[#e8b080]' : 'text-muted',
          )}
        >
          {eff === 'up' ? t('ui.lead.strong') : eff === 'down' ? t('ui.lead.weak') : t('ui.battle.effNone')}
        </span>
      )}
      {preview.statuses.map((s) => (
        <StatusChip
          key={s.status}
          status={s.status}
          count={s.stacks && s.stacks > 1 ? `×${s.stacks}` : undefined}
        />
      ))}
      {preview.almost.map((s) => (
        <span
          key={s.status}
          title={t('ui.battle.almostStatus', { status: statusName(s.status), need: s.need })}
        >
          <StatusChip status={s.status} lit={false} count={`${s.have}/${s.need}`} />
        </span>
      ))}
      {preview.recoil > 0 && (
        <span className="w-full text-center font-pixel-sm text-[15px] leading-tight text-danger">
          {t('ui.battle.confusedRecoil', { name: activeName, amount: preview.recoil })}
        </span>
      )}
    </>
  )
}

/** Your team at the bottom: icon and HP. Tap one to send it in; after a K.O. the ones that can go out pulse. */
export function TeamPips({
  team,
  activeUid,
  hpOf,
  canSwitch,
  calling,
  onPick,
}: {
  team: Battler[]
  activeUid: string
  hpOf: (b: Battler) => number
  /** A tap does something right now (your turn, or a forced switch). */
  canSwitch: boolean
  /** "Who goes out next?": the ones that can, pulse. */
  calling: boolean
  onPick: (b: Battler) => void
}) {
  const { t } = useT()
  const reduced = useGame((s) => s.settings.reducedMotion)
  return (
    <div role="group" aria-label={t('ui.battle.switchGroup')} className="flex flex-wrap gap-1.5">
      {team.map((b) => {
        const hp = hpOf(b)
        const active = b.uid === activeUid
        const out = hp <= 0
        const open = canSwitch && !active && !out
        const pct = Math.max(0, Math.min(1, hp / b.maxHp))
        return (
          <button
            key={b.uid}
            type="button"
            onClick={open ? () => onPick(b) : undefined}
            aria-disabled={!open}
            aria-label={
              out
                ? t('ui.battle.pipFainted', { name: b.name })
                : t(active ? 'ui.battle.pipActive' : 'ui.battle.pipSwitch', {
                    name: b.name,
                    hp,
                    max: b.maxHp,
                  })
            }
            className={cx(
              'grid min-h-[48px] w-[52px] justify-items-center gap-px bg-paper px-1 pb-[5px] pt-0.5 shadow-ring',
              active && 'bg-gold-pale shadow-card-gold',
              out && 'opacity-55 grayscale',
              !open && 'cursor-default',
              calling && open && !reduced && 'bt-call',
            )}
          >
            <MiniSprite dex={b.dex} size={32} className="-mb-1 -mt-0.5" />
            <span className="relative h-1.5 w-10 bg-line shadow-ring-thin" aria-hidden>
              <i
                className="absolute inset-y-px left-px block"
                style={{
                  width: `calc(${pct * 100}% - 2px)`,
                  background: pct > 0.5 ? PALETTE.hpGreen : pct > 0.2 ? PALETTE.hpYellow : PALETTE.hpRed,
                }}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Wide screens: the team as a column of cards (sprite, name, level, HP), the same choices as the pips — tap one to send
 * it in; after a K.O. the ones that can go out pulse.
 */
export function TeamColumn({
  team,
  activeUid,
  hpOf,
  canSwitch,
  calling,
  onPick,
}: {
  team: Battler[]
  activeUid: string
  hpOf: (b: Battler) => number
  canSwitch: boolean
  calling: boolean
  onPick: (b: Battler) => void
}) {
  const { t } = useT()
  const reduced = useGame((s) => s.settings.reducedMotion)
  return (
    <div role="group" aria-label={t('ui.battle.switchGroup')} className="flex flex-col gap-2">
      {team.map((b) => {
        const hp = hpOf(b)
        const active = b.uid === activeUid
        const out = hp <= 0
        const open = canSwitch && !active && !out
        return (
          <button
            key={b.uid}
            type="button"
            onClick={open ? () => onPick(b) : undefined}
            aria-disabled={!open}
            aria-label={
              out
                ? t('ui.battle.pipFainted', { name: b.name })
                : t(active ? 'ui.battle.pipActive' : 'ui.battle.pipSwitch', { name: b.name, hp, max: b.maxHp })
            }
            className={cx(
              'flex w-full items-center gap-2 bg-paper p-1.5 text-left shadow-ring',
              active && 'bg-gold-pale shadow-card-gold',
              out && 'opacity-55 grayscale',
              !open && 'cursor-default',
              calling && open && !reduced && 'bt-call',
            )}
          >
            <SpriteImg dex={b.dex} size={80} shiny={b.shiny} className="-my-2 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-1">
                <b className="truncate text-[19px] font-normal leading-none">{b.name}</b>
                <span className="shrink-0 font-pixel-sm text-[14px] leading-none">
                  {t('ui.common.level.short', { n: b.level })}
                </span>
              </span>
              <HpBar hp={hp} max={b.maxHp} height={8} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The Bag: one item a turn, and it doesn't end the turn. */
export function BagButton({
  disabled,
  title,
  onClick,
}: {
  disabled: boolean
  title?: string
  onClick: () => void
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="inline-flex min-h-[48px] items-center gap-1.5 bg-paper py-1 pl-2 pr-3 text-[18px] leading-none text-ink shadow-card disabled:opacity-50"
    >
      <PixelIcon name="potion" size={20} />
      {t('ui.battle.bag')}
    </button>
  )
}
