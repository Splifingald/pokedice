import { instanceMaxHp, monName, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { PokeCard } from '@/components/PokeCard'
import { useDragSwap } from '@/lib/useDragSwap'
import { reorderTeam } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

/**
 * The team as the one Pokémon card (`PokeCard`, docs/43 §4), in send-out order, the lead with its crown. Drag a card
 * onto another to swap them; a tap opens the Pokémon's sheet (docked beside the list on a PC), whose Make lead is the
 * keyboard and screen-reader way to reorder. `selected`: the one shown in the docked sheet (PC).
 */
export function TeamCards({
  team,
  onOpen,
  selected,
}: {
  team: PokemonInstance[]
  onOpen: (p: PokemonInstance) => void
  selected?: string | null
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const ids = useGame((s) => s.save?.team ?? [])
  const name = (p: PokemonInstance) => monName(p, data)

  const swap = (i: number, j: number) => {
    const next = [...ids]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    reorderTeam(next)
    const a = team[i]!
    const b = team[j]!
    pushToast(
      i === 0 || j === 0
        ? t('ui.team.leadsNow', { name: name(i === 0 ? b : a) })
        : t('ui.team.swapped', { a: name(a), b: name(b) }),
      'good',
    )
  }

  const { lifted, over, consumeDrag, handlers } = useDragSwap(swap)

  return (
    <ol className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label={t('ui.team.order')}>
      {team.map((p, i) => {
        const lead = i === 0
        return (
          <PokeCard
            key={p.id}
            inst={p}
            lead={lead}
            xp
            selected={selected === p.id}
            onOpen={() => {
              if (!consumeDrag()) onOpen(p)
            }}
            label={t('ui.team.cardLabel', {
              name: name(p),
              level: p.level,
              hp: p.currentHp,
              max: instanceMaxHp(p, data),
              order: lead ? t('ui.team.orderLead') : t('ui.team.orderN', { n: i + 1 }),
            })}
            className={cx(
              'touch-pan-y select-none',
              lifted === i && 'relative z-10',
              over === i && 'outline-dashed outline-[3px] outline-offset-2 outline-danger',
            )}
            buttonProps={{
              title: t('ui.team.dragTip'),
              className: cx('cursor-grab', lifted === i && 'cursor-grabbing'),
              ...handlers(i),
            }}
          />
        )
      })}
    </ol>
  )
}
