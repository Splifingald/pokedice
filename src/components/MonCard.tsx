import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { instanceStats, xpToNext, type PokemonInstance, outfitOf } from '@/engine'
import { feelSound } from '@/audio/feel'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { useMotion } from '@/lib/motion'
import { xpFillFrames, type XpFrame } from '@/lib/xpFill'
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { DiceSet } from './DiceSet'
import { KoTag } from './Extreme'
import { HpBar } from './HpBar'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { MiniSprite } from './SpriteImg'
import { TypeBadge } from './TypeBadge'
import { InstTalentGem } from './Talent'
import { outfitName } from './Outfit'

/** A fossil being revived: a timer gauge in place of HP, full when it wakes up. */
export function RevivalBar({ inst, className }: { inst: PokemonInstance; className?: string }) {
  const { t } = useT()
  const now = useNow(30_000)
  const total = Math.max(1, (inst.revivesAt ?? 0) - inst.caughtAt)
  const left = Math.max(0, (inst.revivesAt ?? 0) - now)
  const pct = 1 - left / total
  return (
    <div className={cx('flex items-center gap-2', className)} role="img" aria-label={t('ui.mon.revivesIn', { time: countdown(left) })}>
      <span className="text-sm leading-none">{t('ui.mon.reviving')}</span>
      <div className="h-2 flex-1 border border-edge bg-night" style={{ borderRadius: 1 }}>
        <div className="h-full bg-gold" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="min-w-[7ch] text-right font-mono text-xs tabular-nums leading-none">{left > 0 ? countdown(left) : t('ui.mon.soon')}</span>
    </div>
  )
}

/** One step of the XP bar filling (docs/38 F5c), and the wait before it starts once the row is on screen. */
const XP_STEP_MS = 50
const XP_START_MS = 300
// Two bars filling at once (a team's XP) share one run of ticks, never a click on top of a click.
let lastXpTick = 0

/**
 * The result card's XP bar filling in steps from where it stood before the battle (`from`, the engine's; docs/38
 * F5c): a rising tick per step; a level-up rolls over with two white frames (not when calm), its sound and a buzz, and
 * calls `onRoll` with the new level. The frame to draw, or null once it is done (or when there's nothing to play:
 * animations off, no `from`).
 */
export function useXpFill(
  inst: PokemonInstance | undefined,
  from: { level: number; xp: number } | null | undefined,
  onRoll?: (level: number) => void,
): XpFrame | null {
  const cfg = useGame((s) => s.data.config)
  const { level: motion, calm } = useMotion()
  const roll = useRef(onRoll)
  roll.current = onRoll
  const lv = inst?.level
  const xp = inst?.xp
  const frames = useMemo(
    () =>
      from && lv != null && xp != null && motion !== 'off'
        ? xpFillFrames(from, { level: lv, xp }, cfg, !calm)
        : [],
    // Played once: a later change to the Pokémon (the next K.O.) doesn't replay the old fill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, motion === 'off', calm, cfg],
  )
  const [at, setAt] = useState(-1)
  useEffect(() => {
    if (!frames.length) return
    setAt(-1)
    let i = -1
    let n = 0
    let timer = 0
    const step = () => {
      i += 1
      setAt(i)
      const f = frames[i]
      if (f?.roll) {
        n = 0
        feelSound('level.roll')
        haptic('reward')
        roll.current?.(f.level)
      } else if (f && !f.white && performance.now() - lastXpTick > XP_STEP_MS * 0.8) {
        lastXpTick = performance.now()
        feelSound('xp.tick', n++)
      }
      if (i < frames.length) timer = window.setTimeout(step, XP_STEP_MS)
    }
    timer = window.setTimeout(step, XP_START_MS)
    return () => window.clearTimeout(timer)
  }, [frames])
  if (!frames.length || at >= frames.length) return null
  return at < 0 && from ? from : (frames[at] ?? null)
}

/**
 * The XP bar. `shown` draws a step of `useXpFill` in place of the Pokémon's own level and XP; given (the result card's
 * fill, null once it's done), the bar moves frame by frame instead of gliding.
 */
export function XpBar({
  inst,
  className,
  shown,
  numbers = true,
}: {
  inst: PokemonInstance
  className?: string
  shown?: XpFrame | null
  /** The "12/30" after the bar (the result card shows it with More details only, docs/42). */
  numbers?: boolean
}) {
  const { t } = useT()
  const cfg = useGame((s) => s.data.config)
  const level = shown?.level ?? inst.level
  const xp = shown?.xp ?? inst.xp
  const need = xpToNext(level, cfg)
  const pct = level >= cfg.maxLevel ? 1 : Math.min(1, xp / need)
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className="text-sm leading-none">{t('ui.mon.xp')}</span>
      <div className="h-1.5 flex-1 border border-edge bg-night" style={{ borderRadius: 1 }}>
        <div
          className={shown?.white ? 'h-full bg-white' : 'h-full bg-type-water'}
          style={{ width: `${pct * 100}%`, transition: shown !== undefined ? 'none' : 'width 700ms ease-out' }}
        />
      </div>
      {numbers && (
        <span className="min-w-[4.5ch] text-right font-mono text-xs tabular-nums leading-none">
          {level >= cfg.maxLevel ? t('ui.mon.xpMax') : `${xp}/${need}`}
        </span>
      )}
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
  const { t } = useT()
  const data = useGame((s) => s.data)
  const species = data.species[inst.dex]
  if (!species) return null
  const stats = instanceStats(inst, data)
  const reviving = inst.revivesAt != null
  const fossil = reviving && inst.fossil ? data.items[inst.fossil] : undefined
  const fainted = !reviving && inst.currentHp <= 0
  const card = cx(
    'pixel-panel flex w-full items-center gap-2 p-2 text-left',
    selected && 'outline outline-[3px] outline-offset-2 outline-gold',
    onClick && !disabled && 'cursor-pointer hover:bg-paper',
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
          {reviving ? (
            <ItemSprite item={fossil} size={32} className="-mt-1" />
          ) : (
            <MiniSprite dex={inst.dex} size={40} className={cx('-mb-2 -ml-1 -mt-4 shrink-0', fainted && 'grayscale')} />
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-xl leading-none">{inst.nickname || species.name}</span>
              {inst.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
              {/* Its outfit (docs/59): the menu icon is the plain one, so its hat beside the name says it. */}
              {outfitOf(data, inst) && (
                <PixelIcon name="santaHat" size={14} title={outfitName(inst.outfit!)} className="shrink-0" />
              )}
              <InstTalentGem inst={inst} />
            </span>
            <span className="flex flex-wrap items-center gap-1">
              <TypeBadge type={species.type1} size="sm" />
              {species.type2 && <TypeBadge type={species.type2} size="sm" />}
              {/* Extreme mode: a resting Pokémon says when it's back instead (docs/22). */}
              {fainted && inst.koAt == null && <span className="text-sm text-danger">{t('ui.mon.fainted')}</span>}
              {fainted && <KoTag inst={inst} />}
              {reviving && (
                <span className="text-sm text-muted">
                  {fossil ? t('ui.mon.fromFossil', { fossil: fossil.name }) : t('ui.mon.fossil')}
                </span>
              )}
              {badge}
            </span>
          </div>
          <span className="shrink-0 text-lg leading-none">{t('ui.common.level.short', { n: inst.level })}</span>
        </div>
        {reviving ? <RevivalBar inst={inst} className="mt-1" /> : <HpBar hp={inst.currentHp} max={stats.maxHp} className="mt-1" height={8} />}
        {showXp && !reviving && <XpBar inst={inst} className="mt-1" />}
        {showDice && (
          <div className="mt-1 flex items-center gap-2">
            <DiceSet dice={stats.dice} size={22} />
            <span className="flex items-center gap-1 text-sm" title={t('ui.mon.rerollsPerBattle')}>
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
