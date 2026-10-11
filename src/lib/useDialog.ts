// What every dialog does (Modal, Sheet, SidePanel): focus moves in, Tab stays inside, Esc closes the top one only, and
// focus goes back where it came from.
import { useEffect, useRef, type RefObject } from 'react'

/** Open dialogs, oldest first: only the last one answers the keyboard. */
const stack: object[] = []

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  )
}

/**
 * `onEscape` is read through a ref, so a new callback each render doesn't re-run the effect (which would pull focus
 * back to the dialog on every render). Leave it out for a dialog Esc mustn't close (a decision that must be made).
 */
export function useDialog(ref: RefObject<HTMLElement>, open: boolean, onEscape?: () => void) {
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    if (!open) return
    const token = {}
    stack.push(token)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return
      const root = ref.current
      if (e.key === 'Escape') {
        if (!escape.current) return
        e.stopPropagation()
        escape.current()
      } else if (e.key === 'Tab' && root) {
        const items = focusables(root)
        if (!items.length) {
          e.preventDefault()
          root.focus()
          return
        }
        const first = items[0]!
        const last = items[items.length - 1]!
        const at = document.activeElement
        if (e.shiftKey && (at === first || at === root || !root.contains(at))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (at === last || !root.contains(at))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
      prev?.focus?.()
    }
  }, [open, ref])
}
