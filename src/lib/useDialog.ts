// What every dialog does (Modal, Sheet, SidePanel): focus moves in, Tab stays inside, the page behind is inert, Esc
// closes the top one only, and focus goes back where it came from.
import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { hasLayer, holdInert, isTopLayer } from './inert'

/** Open dialogs, oldest first: only the last one answers the keyboard. */
const stack: object[] = []
const listeners = new Set<() => void>()

/** Puts a dialog on the stack; the function returned takes it off again (only it, whatever opened since). */
export function pushDialog(token: object): () => void {
  stack.push(token)
  listeners.forEach((fn) => fn())
  return () => {
    const i = stack.indexOf(token)
    if (i < 0) return
    stack.splice(i, 1)
    listeners.forEach((fn) => fn())
  }
}

/** How many dialogs are open right now. */
export const dialogsOpen = (): number => stack.length

/** Called whenever a dialog opens or closes; returns the unsubscribe. */
export function onDialogs(fn: () => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/**
 * A dialog is open over the page (a Modal, a Sheet, the trainer menu…). The battle waits while one is (docs/15 §14):
 * nothing of the fight plays behind Settings opened mid-fight, or the guide.
 */
export function useDialogOpen(): boolean {
  return useSyncExternalStore(
    onDialogs,
    () => stack.length > 0,
    () => false,
  )
}

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
    const close = pushDialog(token)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    // A screen reader's swipe stays in the dialog too, not only the Tab key (lib/inert.ts).
    const wake = holdInert(ref.current)
    // The dialog drawn on top answers the keyboard, which isn't always the last opened: a pop-up that opens under the
    // partner lab (a lower z-index) waits under it, and the focus goes back up there.
    const onTop = () => (hasLayer(ref.current) ? isTopLayer(ref.current) : stack[stack.length - 1] === token)
    if (!onTop()) prev?.focus?.()
    const onKey = (e: KeyboardEvent) => {
      if (!onTop()) return
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
      close()
      // Awake first: an inert element can't take the focus back.
      wake()
      prev?.focus?.()
    }
  }, [open, ref])
}
