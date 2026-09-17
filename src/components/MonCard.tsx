import type { ReactNode } from 'react'
import { instanceStats, xpToNext, type PokemonInstance } from '@/engine'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { DiceSet } from './DiceSet'
import { HpBar } from './HpBar'
import { PixelIcon } from './icons'
import { MiniSprite } from './SpriteImg'
import { TypeBadge } from './TypeBadge'

export function XpBar({ inst, className }: { inst: PokemonInstance; className?: string }) {
  const cfg = useGame((s) => s.data.config)
  const need = xpToNext(inst.level, cfg)
  const pct = inst.level >= cfg.maxLevel ? 1 : Math.min(1, inst.xp / need)
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className="text-sm leading-none">XP</span>
      <div className="h-1.5 flex-1 border border-ink bg-ink" style={{ borderRadius: 1 }}>
        <div className="h-full bg-type-water" style={{ width: `${pct * 100}%`, transition: 'width 700ms ease-out' }} />
      </div>
      <span className="min-w-[4.5ch] text-right font-mono text-xs tabular-nums leading-none">
        {inst.level >= cfg.maxLevel ? 'MAX' : `${inst.xp}/${need}`}
      </span>
    </div>
  )
}

/**
 * Compact Pokémon card: sprite, name, level, types, HP (+ optional XP and dice). With `onClick` the card is a button;
 * with `onClick` and action `children`, only the Pokémon part is the button (buttons can't nest).
 */
export function MonCard({
  inst,
  selected,
  disabled,
  onClick,
  showXp,
  showDice,
  children,
  className,
  badge,
}: {
  inst: PokemonInstance
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  showXp?: boolean
  showDice?: boolean
  children?: ReactNode
  className?: string
  badge?: ReactNode
}) {
  const data = useGame((s) => s.data)
  const species = data.species[inst.dex]
  if (!species) return null
  const stats = instanceStats(inst, data)
  const fainted = inst.currentHp <= 0
  const card = cx(
    'pixel-panel flex w-full items-center gap-2 p-2 text-left',
    selected && 'outline outline-[3px] outline-offset-2 outline-gold',
    onClick && !disabled && 'cursor-pointer hover:bg-white',
    // Hatched, not faded: the name and HP stay readable on a Pokémon you can't pick.
    (disabled || fainted) && 'hatched',
    className,
  )
  const body = (
    <>
      <div className="min-w-0 flex-1">
        {/* Types follow the name when they fit, else wrap under it — always in the column right of the sprite. */}
        <div className="flex items-start gap-2">
          {/* Party icons sit low in their box: pull it up so the creature lines up with the name. */}
          <MiniSprite dex={inst.dex} size={40} className={cx('-mb-2 -ml-1 -mt-4 shrink-0', fainted && 'grayscale')} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-xl leading-none">{species.name}</span>
              {inst.shiny && <PixelIcon name="star" size={12} title="Shiny" className="shrink-0" />}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              <TypeBadge type={species.type1} size="sm" />
              {species.type2 && <TypeBadge type={species.type2} size="sm" />}
              {fainted && <span className="text-sm text-danger">FAINTED</span>}
              {badge}
            </span>
          </div>
          <span className="shrink-0 text-lg leading-none">Lv.{inst.level}</span>
        </div>
        <HpBar hp={inst.currentHp} max={stats.maxHp} className="mt-1" height={8} />
        {showXp && <XpBar inst={inst} className="mt-1" />}
        {showDice && (
          <div className="mt-1 flex items-center gap-2">
            <DiceSet dice={stats.dice} size={22} />
            <span className="flex items-center gap-1 text-sm" title="Rerolls per battle">
              <PixelIcon name="reroll" size={12} />×{stats.rerolls}
            </span>
          </div>
        )}
      </div>
    </>
  )

  if (onClick && children) {
    return (
      <div className={card}>
        <button
          type="button"
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
          {body}
        </button>
        {children}
      </div>
    )
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={disabled ? undefined : onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick && selected !== undefined ? !!selected : undefined}
      className={card}
    >
      {body}
      {children}
    </Tag>
  )
}
