import { useId, useRef, useState, type PointerEvent } from 'react'
import { useGame } from '@/store/game'

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
 * Drag a card onto another of the same list to swap them (docs/15 §8: pointer events, 8 px before a press becomes a
 * drag; a tap still taps). The card's list item travels under the pointer, tilted a little (none with reduced motion);
 * the card under it is `over`. `onSwap(i, j)` runs on the drop. Every list using it keeps a button twin for keyboards
 * and screen readers. The Team's cards, and the Versus and raid team pickers' slots.
 */
export function useDragSwap(onSwap: (i: number, j: number) => void) {
  const group = useId()
  const reduced = useGame((s) => s.settings.reducedMotion)
  const drag = useRef<Drag | null>(null)
  // The click that follows a drag's pointerup must not count as a tap.
  const dragged = useRef(false)
  const [over, setOver] = useState<number | null>(null)
  const [lifted, setLifted] = useState<number | null>(null)
  const latest = useRef(onSwap)
  latest.current = onSwap

  const down = (i: number) => (e: PointerEvent<HTMLElement>) => {
    if (e.button > 0) return
    const el = (e.currentTarget.closest('li') as HTMLElement | null) ?? e.currentTarget
    drag.current = { i, x: e.clientX, y: e.clientY, on: false, over: null, el }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLElement>) => {
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
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-swap]')
    const [g, n] = (under?.dataset.swap ?? '').split('|')
    const j = g === group && n ? Number(n) : null
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
    if (!cancel && d.over != null) latest.current(d.i, d.over)
  }

  return {
    /** The card being dragged, and the one it would swap with. */
    lifted,
    over,
    /** True once, right after a drag: the click it ends with isn't a tap. */
    consumeDrag: () => {
      const was = dragged.current
      dragged.current = false
      return was
    },
    /** The pointer handlers and the data attribute for card `i`'s button. */
    handlers: (i: number) => ({
      'data-swap': `${group}|${i}`,
      onPointerDown: down(i),
      onPointerMove: move,
      onPointerUp: end(false),
      onPointerCancel: end(true),
    }),
  }
}

/**
 * A team picker's numbered slots (Versus, raids): drag one onto another to swap them, or tap one (it stays picked,
 * gold) then the other, which is also the keyboard's and screen readers' way. `list` is the picks in slot order;
 * `onChange` gets them reordered. `release()` drops a tapped slot (call it when the picks change otherwise).
 */
export function useSlotOrder(list: readonly string[], onChange: (next: string[]) => void) {
  const [held, setHeld] = useState<number | null>(null)
  const swap = (i: number, j: number) => {
    setHeld(null)
    if (i === j || !list[i] || !list[j]) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
  }
  const drag = useDragSwap(swap)
  const tap = (i: number) => {
    if (drag.consumeDrag()) return
    if (held == null || held >= list.length) setHeld(i)
    else if (held === i) setHeld(null)
    else swap(held, i)
  }
  return {
    ...drag,
    held: held != null && held < list.length ? held : null,
    tap,
    release: () => setHeld(null),
  }
}
