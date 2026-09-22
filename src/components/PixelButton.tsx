import { forwardRef, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/theme/util'
import { sfx } from '@/audio/sfx'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'dark'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-gold text-ink',
  secondary: 'bg-panel text-ink',
  danger: 'bg-danger text-panel',
  success: 'bg-hp-green text-ink',
  ghost: 'bg-parchment text-ink',
  dark: 'bg-ink text-panel',
}

// Phones get 44px tap targets; from 768px (mouse and trackpad) the tighter sizes come back.
const SIZE: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-lg min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-0',
  md: 'px-4 py-1 text-2xl min-h-[44px] md:min-h-[40px]',
  lg: 'px-6 py-2 text-3xl min-h-[52px]',
}

/** How far a label may shrink before it would be doing more harm than the overflow. */
const MIN_FIT_SCALE = 0.6

/**
 * Shrinks a label that does not fit its button, which is what keeps translations inside the frame: "GO TO THE NEW
 * AREA" is "ALLER À LA NOUVELLE ZONE" in French, half again as wide, and it used to run off the edge.
 *
 * Only ever shrinks, never grows past the size the class gives it. A button whose width follows its own text can
 * never overflow, so this does nothing there — it only bites when something else fixes the width (`w-full`, a flex
 * row, a max-width). That also makes the measurement stable: the label's box does not move when its font does.
 */
function useFitText(label: ReactNode) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let width = 0
    const fit = () => {
      el.style.fontSize = ''
      const base = Number.parseFloat(getComputedStyle(el).fontSize)
      const room = el.clientWidth
      if (!base || !room) return
      const floor = base * MIN_FIT_SCALE
      let size = base
      // An icon beside the text keeps its size whatever the font does, so a single ratio undershoots. Close in
      // instead: each pass measures what is left over and takes another bite, and it settles in two or three.
      for (let i = 0; i < 8 && el.scrollWidth > room && size > floor; i++) {
        size = Math.max(floor, size * (room / el.scrollWidth))
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    // Re-fit on a real width change only: reacting to our own font change would loop.
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (Math.abs(w - width) < 1) return
      width = w
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [label])
  return ref
}

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Skip the click sound (e.g. when the action plays its own). */
  quiet?: boolean
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(function PixelButton(
  { variant = 'secondary', size = 'md', className, quiet, onClick, type = 'button', children, ...rest },
  ref,
) {
  const label = useFitText(children)
  return (
    <button
      ref={ref}
      type={type}
      className={cx('pixel-btn inline-flex items-center justify-center gap-2 leading-none', VARIANT[variant], SIZE[size], className)}
      onClick={(e) => {
        if (!quiet) sfx('button')
        onClick?.(e)
      }}
      {...rest}
    >
      {/* The label measures itself: `min-w-0` lets it be narrower than its text, which is what makes the overflow
          visible to `scrollWidth`, and `whitespace-nowrap` keeps it on one line so shrinking is what fixes it. */}
      <span ref={label} className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap">
        {children}
      </span>
    </button>
  )
})
