import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/theme/util'

export interface SegOption<T extends string> {
  id: T
  label: ReactNode
  /** A count after the label ("Combos 5"). */
  count?: number | string
  disabled?: boolean
}

/** Arrow keys move between options, as in a radio group or a tab list. */
function useRovingKeys<T extends string>(options: SegOption<T>[], value: T, onChange: (v: T) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const live = options.filter((o) => !o.disabled)
    const i = live.findIndex((o) => o.id === value)
    const next = live[(i + step + live.length) % live.length]
    if (!next) return
    onChange(next.id)
    // Focus follows the choice, as the arrow keys promise.
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus())
  }
  return { ref, onKeyDown }
}

/**
 * Segmented control: one ink-ringed bar, the chosen part filled ink. `role="tablist"` when it switches panels (give
 * each option's panel `aria-labelledby` = `${idPrefix}-${id}`), a radio group otherwise.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  tabs,
  idPrefix,
  className,
}: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  tabs?: boolean
  idPrefix?: string
  className?: string
}) {
  const { ref, onKeyDown } = useRovingKeys(options, value, onChange)
  return (
    <div
      ref={ref}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('flex shadow-ring', className)}
    >
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            data-id={o.id}
            id={idPrefix ? `${idPrefix}-${o.id}` : undefined}
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cx(
              'flex min-h-[44px] flex-1 items-center justify-center gap-1 whitespace-nowrap px-2.5 text-[19px] leading-none md:min-h-[38px]',
              on ? 'bg-ink text-panel' : 'bg-transparent text-ink',
              o.disabled && 'cursor-not-allowed text-muted',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('font-pixel-sm text-[14px]', on ? 'text-gold-light' : 'text-muted')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Filter chips with counts ("All 28 · To catch 4"): a radio group that scrolls sideways when it runs out of room. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const { ref, onKeyDown } = useRovingKeys(options, value, onChange)
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        'flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            data-id={o.id}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cx(
              'flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap px-2.5 text-[18px] leading-none md:min-h-[36px]',
              on ? 'bg-ink text-panel' : 'bg-paper text-ink shadow-ring-line',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('font-pixel-sm text-[15px]', on ? 'text-gold-light' : 'text-muted')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A search box: 44px, white, an ink ring and a lip along its top. The label is for screen readers. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  id,
  className,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder?: string
  id: string
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full appearance-none rounded-none bg-paper px-3 text-[20px] text-ink shadow-[inset_0_0_0_2px_#24304f,inset_0_3px_0_#dfe7f2] placeholder:text-faint"
      />
    </div>
  )
}
