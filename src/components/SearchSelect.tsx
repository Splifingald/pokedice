import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '@/theme/util'
import { t } from '@/i18n'

export interface SearchSelectProps<T> {
  options: T[]
  value: T | null
  onChange: (value: T) => void
  getKey: (o: T) => string | number
  getLabel: (o: T) => string
  /** Rich rendering in both the list and the closed state (sprite + name + badges…). */
  renderOption?: (o: T) => ReactNode
  placeholder?: string
  className?: string
  disabled?: boolean
  maxResults?: number
}

/** Searchable single-select with keyboard navigation. Used everywhere in admin. */
export function SearchSelect<T>({
  options,
  value,
  onChange,
  getKey,
  getLabel,
  renderOption,
  placeholder = 'Search…',
  className,
  disabled,
  maxResults = 60,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => getLabel(o).toLowerCase().includes(q) || String(getKey(o)) === q) : options
    return list.slice(0, maxResults)
  }, [options, query, getLabel, getKey, maxResults])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (o: T) => {
    onChange(o)
    setOpen(false)
    setQuery('')
  }
  const render = (o: T) => (renderOption ? renderOption(o) : getLabel(o))

  return (
    <div ref={root} className={cx('relative', className)}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-[36px] w-full items-center gap-2 border-2 border-ink bg-panel px-2 py-1 text-left text-lg disabled:opacity-50"
          style={{ borderRadius: 2 }}
          onClick={() => {
            setOpen(true)
            setCursor(0)
          }}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 flex-1 truncate">{value ? render(value) : <span className="text-muted">{placeholder}</span>}</span>
          <span aria-hidden>▾</span>
        </button>
      ) : (
        <input
          autoFocus
          value={query}
          placeholder={placeholder}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          className="min-h-[36px] w-full border-2 border-ink bg-panel px-2 py-1 text-lg"
          style={{ borderRadius: 2 }}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(filtered.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const o = filtered[cursor]
              if (o) choose(o)
            } else if (e.key === 'Escape') setOpen(false)
          }}
        />
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="pixel-scroll absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto border-2 border-ink bg-panel shadow-hard-sm"
        >
          {filtered.length === 0 && <li className="px-2 py-1 text-muted">{t('ui.search.noMatch')}</li>}
          {filtered.map((o, i) => (
            <li
              key={getKey(o)}
              role="option"
              aria-selected={value != null && getKey(value) === getKey(o)}
              className={cx('cursor-pointer px-2 py-1 text-lg', i === cursor ? 'bg-gold' : 'hover:bg-parchment')}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
            >
              {render(o)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
