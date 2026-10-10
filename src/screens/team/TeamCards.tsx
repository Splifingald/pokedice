import { useRef, useState, type PointerEvent } from 'react'
import { effectiveStats, getSpecies, xpToNext, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import { reorderTeam } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx, typeColor } from '@/theme/util'

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
 * The team as cards in send-out order, the lead in gold. Drag a card onto another to swap them (a tap opens the
 * Pokémon's sheet, whose "Make lead" is the keyboard and screen-reader way to reorder).
 */
export function TeamCards({
  team,
  onOpen,
}: {
  team: PokemonInstance[]
  onOpen: (p: PokemonInstance) => void
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
  const name = (p: PokemonInstance) => data.species[p.dex]?.name ?? t('ui.common.unknown')

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
    drag.current = { i, x: e.clientX, y: e.clientY, on: false, over: null, el: e.currentTarget }
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
    <ol className="grid grid-cols-3 gap-2" aria-label={t('ui.team.order')}>
      {team.map((p, i) => {
        const species = getSpecies(data, p.dex)
        const stats = effectiveStats(species, p.level, data)
        const need = xpToNext(p.level, data.config)
        const xp = p.level >= data.config.maxLevel ? 1 : Math.min(1, p.xp / need)
        const fainted = p.currentHp <= 0
        const lead = i === 0
        return (
          <li key={p.id}>
            <button
              type="button"
              data-tm={i}
              onPointerDown={down(i)}
              onPointerMove={move}
              onPointerUp={end(false)}
              onPointerCancel={end(true)}
              onClick={() => {
                if (dragged.current) {
                  dragged.current = false
                  return
                }
                onOpen(p)
              }}
              aria-label={t('ui.team.cardLabel', {
                name: name(p),
                level: p.level,
                hp: p.currentHp,
                max: stats.maxHp,
                order: lead ? t('ui.team.orderLead') : t('ui.team.orderN', { n: i + 1 }),
              })}
              className={cx(
                'relative grid w-full cursor-grab touch-pan-y select-none justify-items-center gap-1 px-1.5 pb-[9px] pt-[22px]',
                lead ? 'bg-cream shadow-card-gold-lip' : 'bg-paper shadow-card',
                lifted === i && 'z-10 cursor-grabbing',
                over === i && 'outline-dashed outline-[3px] outline-offset-2 outline-danger',
              )}
            >
              <span
                className={cx(
                  'absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 px-[5px] pb-[2px] pt-px font-pixel-sm text-[14px] leading-none text-ink',
                  lead ? 'bg-gold shadow-ring-thin' : 'bg-well-deep',
                )}
                aria-hidden
              >
                {lead && <PixelIcon name="crown" size={14} />}
                {lead ? t('ui.team.leadTag') : i + 1}
              </span>
              <span
                className={cx('grid h-[84px] w-full place-items-center', fainted && 'opacity-60 grayscale')}
              >
                <SpriteImg dex={p.dex} size={80} shiny={p.shiny} />
              </span>
              <b className="max-w-full truncate text-[18px] font-normal leading-none">{name(p)}</b>
              <span className="font-pixel-sm text-[15px] leading-none text-muted">
                {fainted ? t('ui.mon.fainted') : t('ui.common.level.short', { n: p.level })}
              </span>
              <HpBar hp={p.currentHp} max={stats.maxHp} compact height={8} className="w-full" />
              <span className="block h-1 w-full bg-well-deep" aria-hidden>
                <i className="block h-full bg-type-water" style={{ width: `${xp * 100}%` }} />
              </span>
              <span className="flex flex-wrap justify-center gap-0.5" aria-hidden>
                {stats.dice.map((d, k) => (
                  <i
                    key={k}
                    className="h-2.5 w-2.5 shadow-ring-thin"
                    style={{ background: d === 'base' ? '#f4f6fb' : typeColor(d) }}
                  />
                ))}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
