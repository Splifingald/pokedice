import type { ReactNode } from 'react'
import { instanceMaxHp, instanceStats, type PokemonInstance, type PokeType } from '@/engine'
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
 * A Pokémon as a card, three to a row (the rework: the send-out step, the Pokémon Center's team and Box): the mini and
 * level, its whole name, its types, its HP. `onOpen`: what a tap on the card does (the Center: its details; the send-out
 * step: picks it, `pressed`); `children` go under it, apart (the send-out step's INFO). `brief`: no types and the HP as a
 * gauge alone, the details being a tap away (the send-out step, the user's call; every card unless More details is on,
 * docs/42). With the type hint on and `foe`
 * known, a thumb says how its dice fare against it.
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
        {(edge !== 1 || badge) && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {edge !== 1 && (
              <PixelIcon
                name={edge > 1 ? 'thumbUp' : 'thumbDown'}
                size={16}
                title={t(edge > 1 ? 'ui.lead.strong' : 'ui.lead.weak')}
              />
            )}
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
    </>
  )
  return (
    <li
      className={cx(
        'pixel-panel flex min-w-0 flex-col gap-1 p-1.5',
        selected && 'outline outline-[3px] outline-offset-2 outline-gold',
        fainted && 'hatched',
      )}
    >
      {onOpen ? (
        // Named for what it does, then read whole: its level, name, types and HP stay heard.
        <button
          type="button"
          onClick={onOpen}
          aria-pressed={pressed}
          disabled={briefAsked && fainted}
          className="-m-1.5 mb-0 flex min-w-0 flex-1 flex-col gap-1 p-1.5 text-left text-ink disabled:cursor-not-allowed"
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
