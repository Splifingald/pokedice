import { forwardRef, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/theme/util'
import { sfx } from '@/audio/sfx'
import { haptic, useSwitchHaptics } from '@/lib/haptics'
import { pushToast } from '@/store/game'

type Variant = 'primary' | 'secondary' | 'gold' | 'danger' | 'success' | 'ghost' | 'dark'
type Size = 'sm' | 'md' | 'lg' | 'xl'

// Daybreak: red is the action, white the alternative, gold the one new thing to open (a new region, an Egg).
const VARIANT: Record<Variant, string> = {
  primary: 'frame-primary',
  secondary: '',
  gold: 'frame-gold',
  danger: 'frame-primary',
  success: 'frame-green',
  ghost: 'bg-parchment',
  dark: 'frame-dark',
}

// Phones get 44px tap targets; from 768px (mouse and trackpad) the tighter sizes come back. `lg` and `xl` are the
// big calls to action (56 and 72px).
const SIZE: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-lg min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-0',
  md: 'px-3 py-1 text-[24px] min-h-[44px] md:min-h-[40px]',
  lg: 'px-5 py-1.5 text-[26px] min-h-[56px]',
  xl: 'px-6 py-2 text-[30px] tracking-[0.06em] min-h-[72px]',
}

/** How far a label may shrink before it would be doing more harm than the overflow. */
const MIN_FIT_SCALE = 0.6

/**
 * Shrinks a label that does not fit its button, which is what keeps translations inside the frame: "GO TO THE NEW
 * AREA" is "ALLER À LA NOUVELLE ZONE" in French, half again as wide, and it used to run off the edge.
 *
 * Only ever shrinks, never grows past the size the class gives it. A button whose width follows its own text can
 * never overflow, so this does nothing there — it only bites when something else fixes the width (`w-full`, a flex
 * row, a max-width).
 *
 * The room is the button's content box, never the label's own box: Safari lays a button's children out in an
 * anonymous box sized to them, so the label's `max-w-full` resolved against its previous size, and each fit fed the
 * next one through the ResizeObserver. The partner pick's buttons flipped between full size and far too small on
 * every frame.
 */
function useFitText(label: ReactNode) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const roomOf = () => {
      const cs = getComputedStyle(box)
      const pad = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
      return Math.max(0, box.clientWidth - pad)
    }
    let width = 0
    const fit = () => {
      el.style.fontSize = ''
      const base = Number.parseFloat(getComputedStyle(el).fontSize)
      const room = roomOf()
      if (base && room) {
        // Measured at its natural width, whatever its box: clamped, scrollWidth also counts the box itself.
        el.style.flex = 'none'
        el.style.width = 'max-content'
        el.style.maxWidth = 'none'
        const floor = base * MIN_FIT_SCALE
        let size = base
        // An icon beside the text keeps its size whatever the font does, so a single ratio undershoots. Close in
        // instead: each pass measures what is left over and takes another bite, and it settles in two or three.
        for (let i = 0; i < 8 && el.offsetWidth > room && size > floor; i++) {
          size = Math.max(floor, size * (room / el.offsetWidth))
          el.style.fontSize = `${size}px`
        }
        el.style.flex = ''
        el.style.width = ''
        el.style.maxWidth = ''
        // A red button's white label under 24px needs the deeper red to stay readable (pixel.css).
        box.toggleAttribute('data-small', size < 24)
      }
      // Taken after the fit: a button whose width follows its label has just moved, and that is not a resize.
      width = roomOf()
    }
    fit()
    // Measured before the Jersey fonts arrived (a cold load), the label would be sized for the narrower fallback face:
    // once they're in, measure again.
    let live = true
    void document.fonts?.ready.then(() => live && fit())
    // Re-fit when the button's width really changes (a rotation, a wrap), never on what our own fit did.
    const ro = new ResizeObserver((entries) => {
      if (Math.abs((entries[0]?.contentRect.width ?? 0) - width) < 1) return
      fit()
    })
    ro.observe(box)
    return () => {
      live = false
      ro.disconnect()
    }
  }, [label])
  return ref
}

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Skip the click sound (e.g. when the action plays its own). */
  quiet?: boolean
  /**
   * Why it can't be used right now (a fight under way: `useLockReason`). Not `disabled`, which would drop it from the
   * keyboard and say nothing: it stays focusable and drawn as disabled (`aria-disabled`), the reason joins its name
   * and its title, and a tap says it in a toast instead of acting (docs/15 §12).
   */
  shut?: string | null
}

const buttonClass = (variant: Variant, size: Size) =>
  cx(
    'pixel-btn inline-flex items-center justify-center gap-2 font-pixel uppercase leading-none tracking-[0.04em]',
    // White under 24px needs the deeper red (pixel.css).
    size === 'sm' && VARIANT[variant] === 'frame-primary' ? 'frame-deep' : VARIANT[variant],
    SIZE[size],
  )

/**
 * A picture of a button, for How to play's animated cards (docs/38 §8b): the same frame, label and fit as the real
 * one, pressed while `down`, but a plain span, so a scene that shows the battle's REROLL and ATTACK has nothing to
 * focus or press.
 */
export function ButtonLook({
  variant = 'secondary',
  size = 'md',
  down,
  className,
  children,
}: {
  variant?: Variant
  size?: Size
  down?: boolean
  className?: string
  children: ReactNode
}) {
  const label = useFitText(children)
  return (
    <span className={cx(buttonClass(variant, size), className)} data-down={down ? '' : undefined}>
      <span
        ref={label}
        className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap"
      >
        {children}
      </span>
    </span>
  )
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(function PixelButton(
  { variant = 'secondary', size = 'md', className, quiet, onClick, type = 'button', children, shut, ...rest },
  ref,
) {
  const label = useFitText(children)
  const primary = variant === 'primary'
  const look = buttonClass(variant, size)
  // iOS's haptic on the primary buttons (lib/haptics). Never on a submit button: the tap would be the switch's click,
  // not the button's, and the form would not be sent. Nor on one that can't act now.
  const iosHaptic = useSwitchHaptics(primary && type === 'button' && !shut && !rest.disabled)
  // Shut: the reason after its name — its aria-label or its text, else (a label of several parts) in a hidden span.
  const named = rest['aria-label'] ?? (typeof children === 'string' ? children : undefined)
  const lock = shut ? { 'aria-disabled': true, title: shut, ...(named && { 'aria-label': `${named}. ${shut}` }) } : null
  // Heard and felt as the finger lands (docs/38 F7a), not when it lifts: the click waited for the release, so a tap felt
  // late. Android's haptic comes with it on a primary button.
  const press = () => {
    if (!quiet) sfx('button')
    if (primary) haptic('tap')
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cx(look, className)}
      onClick={(e) => {
        if (shut) return pushToast(shut, 'info')
        // The action still waits for the click, so a press that turns into a scroll does nothing. A pointer's click has
        // had its sound on the way down; one from the keyboard (or from code) has no pointer: `detail` 0.
        if (e.detail === 0) press()
        onClick?.(e)
      }}
      {...rest}
      // After `rest`, which may bring its own: that one runs first.
      onPointerDown={(e) => {
        rest.onPointerDown?.(e)
        if (shut || rest.disabled || !e.isPrimary || e.button !== 0) return
        press()
        pressDown(e.currentTarget)
      }}
      {...lock}
    >
      {/* `whitespace-nowrap` keeps the label on one line so shrinking is what fixes it; `min-w-0` and the clip keep a
          label still too wide at the smallest size inside the frame. */}
      <span ref={label} className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap">
        {children}
      </span>
      {shut && !named && <span className="sr-only">. {shut}</span>}
      {iosHaptic && <HapticSwitch />}
    </button>
  )
})

/**
 * The pressed look from the pointer's first contact (`data-down`, drawn as `:active` in pixel.css): a phone's browser
 * holds `:active` back a moment in case the touch is a scroll. A scroll (pointercancel), the release or the finger
 * leaving takes it off.
 */
function pressDown(el: HTMLButtonElement) {
  el.setAttribute('data-down', '')
  const release = () => {
    el.removeAttribute('data-down')
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', release, true)
    el.removeEventListener('pointerleave', release)
  }
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
  el.addEventListener('pointerleave', release)
}

/**
 * iOS's haptic (lib/haptics `useSwitchHaptics`): an invisible native switch laid over the whole button. A real tap
 * toggles it, which Safari answers with the system haptic, and its click bubbles on to the button, which acts as ever.
 * Hidden from screen readers and out of the tab order, so the button keeps its name, its focus and its target; a
 * scroll that starts on it still scrolls, and a drag puts it back (the guard ios-haptics 3.2 uses).
 */
export function HapticSwitch() {
  const from = useRef<{ y: number; dragged: boolean } | null>(null)
  const putBack = (el: HTMLInputElement) => {
    from.current = null
    el.checked = false
  }
  return (
    <input
      type="checkbox"
      aria-hidden
      tabIndex={-1}
      data-haptic=""
      ref={(el) => {
        if (!el) return
        // Not in React's attribute list: set by hand.
        el.setAttribute('switch', '')
        // It fills the nearest positioned box: a button that isn't positioned becomes that box.
        const box = el.parentElement
        if (box && getComputedStyle(box).position === 'static') box.style.position = 'relative'
      }}
      onPointerDown={(e) => {
        from.current = { y: e.clientY, dragged: false }
      }}
      onPointerMove={(e) => {
        if (!from.current || Math.abs(e.clientY - from.current.y) <= 10) return
        from.current.dragged = true
        e.currentTarget.checked = false
      }}
      onPointerUp={(e) => {
        if (from.current?.dragged) putBack(e.currentTarget)
        from.current = null
      }}
      onPointerCancel={(e) => putBack(e.currentTarget)}
      className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
      style={{ touchAction: 'pan-x pan-y', WebkitTapHighlightColor: 'transparent' }}
    />
  )
}
