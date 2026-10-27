import { useRef, useState, type PointerEvent } from 'react'
import { instanceMaxHp, monName, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { PokeCard } from '@/components/PokeCard'
import { reorderTeam } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** How far a press must travel before it is a drag rather than a tap. */
const DRAG_FROM = 8

interface Drag {
  i: number
  x: number
  y: number
  on: boolean
  over: number | null
  el: HTMLElement
}

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
  const reduced = useGame((s) => s.settings.reducedMotion)
  const drag = useRef<Drag | null>(null)
  // The click that follows a drag's pointerup must not open the sheet.
  const dragged = useRef(false)
  const [over, setOver] = useState<number | null>(null)
  const [lifted, setLifted] = useState<number | null>(null)
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

  const down = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return
    // The card (the list item) travels, not just its button.
    const el = (e.currentTarget.closest('li') as HTMLElement | null) ?? e.currentTarget
    drag.current = { i, x: e.clientX, y: e.clientY, on: false, over: null, el }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on && Math.hypot(dx, dy) < DRAG_FROM) return
    if (!d.on) {
      d.on = true
      setLifted(d.i)
    }
    const tilt = reduced ? 0 : Math.max(-4, Math.min(4, dx / 20))
    d.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`
    d.el.style.pointerEvents = 'none'
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-tm]')
    const j = under ? Number(under.dataset.tm) : null
    d.over = j != null && j !== d.i ? j : null
    setOver(d.over)
  }
  const end = (cancel: boolean) => () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    d.el.style.transform = ''
    d.el.style.pointerEvents = ''
    setLifted(null)
    setOver(null)
    if (!d.on) return
    dragged.current = true
    if (!cancel && d.over != null) swap(d.i, d.over)
  }

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
              if (dragged.current) {
                dragged.current = false
                return
              }
              onOpen(p)
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
              'data-tm': i,
              title: t('ui.team.dragTip'),
              className: cx('cursor-grab', lifted === i && 'cursor-grabbing'),
              onPointerDown: down(i),
              onPointerMove: move,
              onPointerUp: end(false),
              onPointerCancel: end(true),
            }}
          />
        )
      })}
    </ol>
  )
}
