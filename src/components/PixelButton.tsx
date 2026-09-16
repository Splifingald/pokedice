import { forwardRef, type ButtonHTMLAttributes } from 'react'
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

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Skip the click sound (e.g. when the action plays its own). */
  quiet?: boolean
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(function PixelButton(
  { variant = 'secondary', size = 'md', className, quiet, onClick, type = 'button', ...rest },
  ref,
) {
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
    />
  )
})
