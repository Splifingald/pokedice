import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { instanceMaxHp, instanceStats, xpToNext, type PokemonInstance, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useDetails, useTypeHints } from '@/store/hooks'
import { cx } from '@/theme/util'
import { KoTag } from './Extreme'
import { HpBar } from './HpBar'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { RevivalBar } from './MonCard'
import { MiniSprite } from './SpriteImg'
import { TypeBadge } from './TypeBadge'
import { attackEdge } from './TypeMatchups'

/**
 * A Pokémon as a card, three to a row: the one card for a team member everywhere (docs/43 §4: the Team screen, the
 * send-out step, the Pokémon Center, between encounters, the K.O. switch). The mini and level, its whole name, its
 * types, its HP. `onOpen`: what a tap on the card does (the Center: its details; the send-out step: picks it,
 * `pressed`); `children` go under it, apart (the send-out step's INFO). `brief`: no types and the HP as a gauge alone,
 * the details being a tap away (the send-out step, the user's call; every card unless More details is on, docs/42).
 * With the type hint on and `foe` known, a thumb says how its dice fare against it.
 *
 * Its states are the same wherever it is: `lead` (the crown tag), `selected` (the gold outline), fainted (hatched),
 * resting after a K.O. in Extreme (its countdown), a fossil reviving (its gauge), shiny (the star).
 */
export function PokeCard({
  inst,
  onOpen,
  openLabel,
  foe,
  badge,
  selected,
  pressed,
  brief: briefAsked = false,
  lead,
  xp,
  label,
  buttonProps,
  className,
  children,
}: {
  inst: PokemonInstance
  onOpen?: () => void
  /** What opening it says, for screen readers ("Bulbasaur: details"). */
  openLabel?: string
  foe?: readonly PokeType[]
  /** Top right, after the level (the lead's crown). */
  badge?: ReactNode
  selected?: boolean
  /** The card picks it: said as a toggle. */
  pressed?: boolean
  brief?: boolean
  /** The team's lead: the crown tag, top right (said with the rest of the card). */
  lead?: boolean
  /** A thin XP line under the HP (the Team screen: progress always in sight). */
  xp?: boolean
  /** The button's whole name, in place of what the card reads out (the Team's "Pikachu, Lv.8, HP 26/26, team slot 2"). */
  label?: string
  /** More for the card's button (the Team's drag to reorder: pointer handlers, a data attribute). */
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> & { [k: `data-${string}`]: unknown }
  /** On the card itself (a drop target's outline). */
  className?: string
  children?: ReactNode
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const hints = useTypeHints()
  // Without More details (docs/42) every card is brief: the types and the HP's figures are a tap away, on its sheet.
  const details = useDetails()
  const brief = briefAsked || !details
  const species = data.species[inst.dex]
  if (!species) return null
  const reviving = inst.revivesAt != null
  const fossil = reviving && inst.fossil ? data.items[inst.fossil] : undefined
  const fainted = !reviving && inst.currentHp <= 0
  const edge = hints && foe?.length ? attackEdge(data, instanceStats(inst, data).dice, foe) : 1
  const name = inst.nickname || species.name
  const need = xpToNext(inst.level, data.config)
  const xpPct = inst.level >= data.config.maxLevel ? 1 : Math.min(1, inst.xp / Math.max(1, need))
  const crown = lead && (
    <span className="inline-flex items-center bg-gold px-[3px] py-px shadow-ring-thin light-scope" title={t('ui.team.lead')}>
      <PixelIcon name="crown" size={14} />
      <span className="sr-only">{t('ui.team.lead')}</span>
    </span>
  )
  const facts = (
    <>
      <div className="flex min-w-0 items-center gap-1">
        {reviving ? (
          <ItemSprite item={fossil} size={28} className="shrink-0" />
        ) : (
          <MiniSprite dex={inst.dex} size={32} className={cx('-my-1 -ml-1 shrink-0', fainted && 'grayscale')} />
        )}
        <span className="text-base leading-none">{t('ui.common.level.short', { n: inst.level })}</span>
        {inst.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
        {(edge !== 1 || badge || crown) && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {edge !== 1 && (
              <PixelIcon
                name={edge > 1 ? 'thumbUp' : 'thumbDown'}
                size={16}
                title={t(edge > 1 ? 'ui.lead.strong' : 'ui.lead.weak')}
              />
            )}
            {crown}
            {badge}
          </span>
        )}
      </div>
      {/* The whole name on a line of its own, never "Bulba…": a long one is a size smaller on a phone, and wraps if it
          must. */}
      <span className={cx('leading-none [overflow-wrap:anywhere]', nameWidth(name) > 9 ? 'text-base sm:text-lg' : 'text-lg')}>
        {name}
      </span>
      {!brief && (
        <div className="flex flex-wrap items-center gap-1">
          <TypeBadge type={species.type1} size="sm" />
          {species.type2 && <TypeBadge type={species.type2} size="sm" />}
        </div>
      )}
      {reviving ? (
        <RevivalBar inst={inst} />
      ) : brief && !fainted ? (
        <HpBar hp={inst.currentHp} max={instanceMaxHp(inst, data)} showNumbers={false} height={8} className="mt-auto" />
      ) : (
        <div className={cx('flex flex-wrap items-center gap-1 font-mono text-sm leading-none', fainted && 'text-danger')}>
          {fainted && inst.koAt != null ? (
            <KoTag inst={inst} />
          ) : fainted ? (
            t('ui.mon.fainted')
          ) : (
            t('ui.lead.hp', { hp: inst.currentHp, max: instanceMaxHp(inst, data) })
          )}
        </div>
      )}
      {xp && !reviving && (
        <span className="-mt-0.5 block h-1 w-full bg-line" aria-hidden>
          <i className="block h-full bg-type-water" style={{ width: `${xpPct * 100}%` }} />
        </span>
      )}
    </>
  )
  return (
    <li
      className={cx(
        'pixel-panel flex min-w-0 flex-col gap-1 p-1.5',
        selected && 'outline outline-[3px] outline-offset-2 outline-gold',
        fainted && 'hatched',
        className,
      )}
    >
      {onOpen ? (
        // Named for what it does, then read whole: its level, name, types and HP stay heard.
        <button
          {...buttonProps}
          type="button"
          onClick={onOpen}
          aria-label={label}
          aria-pressed={pressed}
          disabled={briefAsked && fainted}
          className={cx(
            '-m-1.5 mb-0 flex min-w-0 flex-1 flex-col gap-1 p-1.5 text-left text-ink disabled:cursor-not-allowed',
            buttonProps?.className,
          )}
        >
          {openLabel && <span className="sr-only">{openLabel}</span>}
          {facts}
        </button>
      ) : (
        facts
      )}
      {children && <div className="mt-auto flex flex-col gap-1 pt-0.5">{children}</div>}
    </li>
  )
}

/** How wide a name runs, in Latin letters: a CJK character takes about two. */
const nameWidth = (name: string) => [...name].reduce((n, ch) => n + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0)
